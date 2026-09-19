import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .db import dispose, init_db
from .routers import graph, ingest, intelligence, jobs
from .worker import worker_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    task = asyncio.create_task(worker_loop())
    yield
    task.cancel()
    await dispose()


app = FastAPI(title="Zettelkasten Backend", lifespan=lifespan)
app.include_router(ingest.router)
app.include_router(jobs.router)
app.include_router(graph.router)
app.include_router(intelligence.router)


@app.get("/health")
async def health():
    return {"ok": True}
