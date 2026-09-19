import asyncio
from contextlib import suppress
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import ensure_directories, settings
from .db import SessionLocal, dispose, engine, init_db
from .routers import ingest, jobs, intelligence
from .intelligence.service import worker_loop as intelligence_loop
from .schemas import HealthResponse
from .worker import worker_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_directories()
    # The lock is session-scoped on a dedicated connection. A second API process is rejected.
    # Deploy one Uvicorn worker; the database queue survives restarts.
    try:
        async with engine.connect() as lock:
            acquired = await lock.scalar(text("SELECT pg_try_advisory_lock(841729013)"))
            await lock.commit()
            if not acquired:
                raise RuntimeError("Another backend is using this database. Run exactly one API worker.")
            try:
                await init_db()
                stop = asyncio.Event()
                task = asyncio.create_task(worker_loop(stop))
                app.state.worker_task = task
                intelligence_task = asyncio.create_task(intelligence_loop(stop)) if settings.intelligence_enabled else None
                app.state.intelligence_task = intelligence_task
                try:
                    yield
                finally:
                    stop.set()
                    # Let in-flight file/Whisper work finish before releasing ownership.
                    await task
                    if intelligence_task:
                        intelligence_task.cancel()
                        with suppress(asyncio.CancelledError):
                            await intelligence_task
            finally:
                await lock.execute(text("SELECT pg_advisory_unlock(841729013)"))
                await lock.commit()
    finally:
        await dispose()


app = FastAPI(
    title="Zettelkasten Ingestion API", version="1.0.0", lifespan=lifespan,
    description=("Upload PDF, audio, or video → poll the job → read text from PostgreSQL. "
                 "PDFs must contain extractable text. Media uses FFmpeg and local Whisper. "
                 "One Markdown note is saved per source. Local LLM indexing runs independently after transcription; "
                 "read /intelligence/status or /notes/{id}/intelligence for its progress. "
                 "This API is intended for a trusted local machine and has no authentication."),
    openapi_tags=[{"name": name} for name in ("Ingestion", "Jobs", "Sources", "Notes", "Intelligence", "Graph", "Health")],
)


class UploadSizeLimit:
    """Bound the request before multipart parsing can spool an unlimited body."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"].rstrip("/") != "/ingest":
            return await self.app(scope, receive, send)
        limit = settings.max_upload_mb * 1024 * 1024 + 1024 * 1024  # multipart overhead
        headers = dict(scope["headers"])
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            return await JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)(scope, receive, send)
        if declared > limit:
            return await JSONResponse({"detail": "Upload request is too large."}, status_code=413)(scope, receive, send)
        received = 0

        async def bounded_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise HTTPException(413, "Upload request is too large.")
            return message

        await self.app(scope, bounded_receive, send)


app.add_middleware(UploadSizeLimit)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Content-Type"],
                   expose_headers=["Content-Disposition"])
app.include_router(ingest.router)
app.include_router(jobs.router)
app.include_router(intelligence.router)


@app.get("/health", tags=["Health"], response_model=HealthResponse,
         responses={503: {"model": HealthResponse, "description": "Database or worker unavailable"}})
async def health():
    running = getattr(app.state, "worker_task", None)
    worker = "running" if running is not None and not running.done() else "stopped"
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "unavailable"
    result = HealthResponse(ok=database == "ok" and worker == "running", database=database, worker=worker)
    return JSONResponse(result.model_dump(), status_code=200 if result.ok else 503)
