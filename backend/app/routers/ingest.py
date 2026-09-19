import shutil
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile

from ..config import MEDIA_EXTENSIONS, RAW_DIR
from ..db import SessionLocal
from ..models import JobStatus, Source, new_id
from ..worker import queue

router = APIRouter()


@router.post("/ingest")
async def ingest(file: UploadFile):
    ext = Path(file.filename or "").suffix.lower()
    kind = "video/audio" if ext in MEDIA_EXTENSIONS else "text"
    if kind == "video/audio" and ext not in MEDIA_EXTENSIONS:
        raise HTTPException(400, f"unsupported extension: {ext}")

    source_id = new_id()
    raw_path = RAW_DIR / f"{source_id}{ext}"
    with raw_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    async with SessionLocal() as session:
        source = Source(
            id=source_id,
            kind="video/audio" if ext in MEDIA_EXTENSIONS else "text",
            original_name=file.filename,
            raw_path=str(raw_path),
            status=JobStatus.queued,
        )
        session.add(source)
        await session.commit()

    await queue.put(source_id)
    return {"source_id": source_id, "status": "queued", "poll": f"/jobs/{source_id}"}
