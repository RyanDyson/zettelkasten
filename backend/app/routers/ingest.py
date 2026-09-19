import asyncio
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..config import AUDIO_EXTENSIONS, RAW_DIR, VIDEO_EXTENSIONS, settings
from ..db import SessionLocal
from ..models import JobStatus, Source, new_id
from ..schemas import AcceptedJob, ErrorResponse

router = APIRouter(tags=["Ingestion"])


@router.post(
    "/ingest", status_code=202, response_model=AcceptedJob,
    summary="Upload a PDF, audio file, or video",
    description=("Upload one file as multipart/form-data. PDF text extraction or local Whisper "
                 "speech-to-text runs asynchronously. Poll the returned job URL until done or failed. "
                 "Scanned PDFs need OCR and are not supported. No LLM or linking is performed."),
    responses={400: {"model": ErrorResponse, "description": "Empty file or invalid filename"},
               413: {"model": ErrorResponse, "description": "Upload exceeds configured limit"},
               415: {"model": ErrorResponse, "description": "Unsupported file extension"}},
)
async def ingest(file: Annotated[UploadFile, File(description="PDF; MP3/WAV/M4A/FLAC/OGG/AAC/OPUS; MP4/MKV/WEBM/MOV/AVI/M4V")]):
    original_name = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    ext = Path(original_name).suffix.lower()
    try:
        if not original_name or len(original_name) > 255 or "\x00" in original_name:
            raise HTTPException(400, "Provide a filename of at most 255 characters without NUL characters.")
        if ext == ".pdf":
            kind = "pdf"
        elif ext in AUDIO_EXTENSIONS:
            kind = "audio"
        elif ext in VIDEO_EXTENSIONS:
            kind = "video"
        else:
            raise HTTPException(415, "Supported inputs are PDF, audio, and video files. See /docs for extensions.")
        source_id = new_id()
        raw_path = RAW_DIR / f"{source_id}{ext}"
        size = 0
        try:
            # UploadFile spools multipart data; copy in bounded chunks off the event loop.
            with raw_path.open("xb") as destination:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)
                    if size > settings.max_upload_mb * 1024 * 1024:
                        raise HTTPException(413, f"Upload exceeds the {settings.max_upload_mb} MB limit.")
                    await asyncio.to_thread(destination.write, chunk)
            if not size:
                raise HTTPException(400, "The uploaded file is empty.")
            async with SessionLocal() as session:
                session.add(Source(id=source_id, kind=kind, original_name=original_name,
                                   raw_path=str(raw_path), status=JobStatus.queued))
                await session.commit()
        except Exception:
            raw_path.unlink(missing_ok=True)
            raise
        return AcceptedJob(source_id=source_id, status=JobStatus.queued, poll=f"/jobs/{source_id}")
    finally:
        await file.close()
