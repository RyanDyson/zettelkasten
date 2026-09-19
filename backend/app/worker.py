import asyncio
import logging
from pathlib import Path

from sqlalchemy import select, update

from .config import NOTES_DIR, TRANSCRIPTS_DIR, settings
from .db import SessionLocal
from .models import JobStatus, Note, Source, Transcript
from .pipeline.core import (ProcessingError, Transcription, atomic_write, extract_audio,
                            extract_pdf, transcribe, write_note)

log = logging.getLogger("zk.worker")


async def process(source_id: str) -> None:
    async with SessionLocal() as session:
        source = await session.get(Source, source_id)
        if source is None or source.status not in (JobStatus.queued, JobStatus.processing):
            return
        source.status = JobStatus.processing
        source.error = None
        await session.commit()
        raw_path = Path(source.raw_path)
        kind, title = source.kind, Path(source.original_name).stem

    if kind == "pdf":
        result = await asyncio.to_thread(extract_pdf, raw_path)
    elif kind in ("audio", "video", "video/audio"):
        audio_path = TRANSCRIPTS_DIR / f"{source_id}.wav"
        try:
            await asyncio.to_thread(extract_audio, raw_path, audio_path)
            result = await asyncio.to_thread(transcribe, audio_path)
        finally:
            audio_path.unlink(missing_ok=True)
    elif kind == "text":
        # Recovery compatibility for previously queued text uploads; new uploads reject text files.
        result = Transcription(await asyncio.to_thread(raw_path.read_text, encoding="utf-8-sig"))
    else:
        raise ProcessingError("Unsupported source type.")

    transcript_path = TRANSCRIPTS_DIR / f"{source_id}.md"
    note_path = NOTES_DIR / f"{source_id}.md"
    await asyncio.to_thread(atomic_write, transcript_path, result.content)
    await asyncio.to_thread(write_note, note_path, title, result.content, source_id)
    async with SessionLocal() as session:
        # Stable IDs and one transaction make crash recovery safe and avoid duplicate notes.
        await session.merge(Transcript(source_id=source_id, content=result.content,
                                       language=result.language, duration_seconds=result.duration_seconds,
                                       segments=result.segments, model=result.model))
        await session.merge(Note(id=source_id, source_id=source_id, path=str(note_path), title=title))
        await session.execute(update(Source).where(Source.id == source_id).values(
            transcript_path=str(transcript_path), status=JobStatus.done, error=None))
        await session.commit()


async def worker_loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            async with SessionLocal() as session:
                # processing records belong to an interrupted attempt (only one worker holds the lock).
                source_id = await session.scalar(select(Source.id).where(
                    Source.status.in_([JobStatus.queued, JobStatus.processing])
                ).order_by(Source.created_at, Source.id).limit(1))
            if source_id:
                try:
                    await process(source_id)
                except Exception as exc:
                    log.exception("Job %s failed", source_id)
                    error = str(exc) if isinstance(exc, ProcessingError) else "Processing failed. Check backend logs, then retry the job."
                    async with SessionLocal() as session:
                        await session.execute(update(Source).where(Source.id == source_id).values(
                            status=JobStatus.failed, error=error))
                        await session.commit()
                continue
        except Exception:
            log.exception("Worker database operation failed; polling will retry")
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.worker_poll_seconds)
        except asyncio.TimeoutError:
            pass
