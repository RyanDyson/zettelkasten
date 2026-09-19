import asyncio
import mimetypes
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy import select, update

from ..db import SessionLocal
from ..models import JobStatus, Note, NoteDocument, Source, Transcript
from ..pipeline.core import write_note
from ..schemas import (AcceptedJob, ErrorResponse, JobDetail, NoteDetail, NoteSummary,
                       SourceDetail, SourceSummary, TranscriptResponse, NoteUpdate)

router = APIRouter(responses={404: {"model": ErrorResponse, "description": "Record not found"}})
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


async def require_source(session, source_id: str) -> Source:
    source = await session.get(Source, source_id)
    if source is None:
        raise HTTPException(404, "Source not found.")
    return source


@router.get("/jobs/{source_id}", tags=["Jobs"], response_model=JobDetail,
            summary="Poll extraction/transcription status")
async def get_job(source_id: str):
    async with SessionLocal() as session:
        source = await require_source(session, source_id)
        notes = (await session.scalars(select(Note).where(Note.source_id == source_id))).all()
        transcript = await session.get(Transcript, source_id)
        return JobDetail(source_id=source.id, status=source.status, error=source.error,
                         notes=[NoteSummary.model_validate(n) for n in notes],
                         transcript_url=f"/sources/{source_id}/transcript" if transcript else None)


@router.post("/jobs/{source_id}/retry", tags=["Jobs"], status_code=202, response_model=AcceptedJob,
             summary="Retry a failed job",
             responses={409: {"model": ErrorResponse, "description": "Only failed jobs can be retried"}})
async def retry_job(source_id: str):
    async with SessionLocal() as session:
        await require_source(session, source_id)
        result = await session.execute(update(Source).where(
            Source.id == source_id, Source.status == JobStatus.failed
        ).values(status=JobStatus.queued, error=None).returning(Source.id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(409, "Only failed jobs can be retried.")
        await session.commit()
    return AcceptedJob(source_id=source_id, status=JobStatus.queued, poll=f"/jobs/{source_id}")


@router.get("/sources", tags=["Sources"], response_model=list[SourceSummary])
async def list_sources(limit: Limit = 50, offset: Offset = 0, status: JobStatus | None = None):
    async with SessionLocal() as session:
        query = select(Source)
        if status is not None:
            query = query.where(Source.status == status)
        return (await session.scalars(query.order_by(Source.created_at.desc(), Source.id)
                                      .offset(offset).limit(limit))).all()


@router.get("/sources/{source_id}", tags=["Sources"], response_model=SourceDetail)
async def get_source(source_id: str):
    async with SessionLocal() as session:
        source = await require_source(session, source_id)
        transcript = await session.get(Transcript, source_id)
        return SourceDetail(**SourceSummary.model_validate(source).model_dump(), error=source.error,
                            transcript_url=f"/sources/{source_id}/transcript" if transcript else None)


@router.get("/sources/{source_id}/file", tags=["Sources"], response_class=FileResponse,
            summary="Read the original upload for playback or download",
            description="Serves the original file. Supports byte-range requests for audio/video seeking.")
async def get_source_file(source_id: str):
    async with SessionLocal() as session:
        source = await require_source(session, source_id)
        path = Path(source.raw_path)
        if not path.is_file():
            raise HTTPException(404, "Original file is unavailable.")
        media_type = mimetypes.guess_type(source.original_name)[0] or "application/octet-stream"
        return FileResponse(path, media_type=media_type, filename=source.original_name,
                            content_disposition_type="inline")


async def require_transcript(session, source_id: str) -> Transcript:
    await require_source(session, source_id)
    transcript = await session.get(Transcript, source_id)
    if transcript is None:
        raise HTTPException(409, "Transcript is not available. Check the job status.")
    return transcript


@router.get("/sources/{source_id}/transcript", tags=["Sources"], response_model=TranscriptResponse,
            summary="Read PDF text or media transcript from PostgreSQL",
            responses={409: {"model": ErrorResponse, "description": "Transcript not yet available"}})
async def get_transcript(source_id: str):
    async with SessionLocal() as session:
        return await require_transcript(session, source_id)


@router.get("/sources/{source_id}/transcript/download", tags=["Sources"], response_class=PlainTextResponse,
            summary="Download extracted text as Markdown",
            responses={409: {"model": ErrorResponse, "description": "Transcript not yet available"}})
async def download_transcript(source_id: str):
    async with SessionLocal() as session:
        transcript = await require_transcript(session, source_id)
        return PlainTextResponse(transcript.content, media_type="text/markdown",
                                 headers={"Content-Disposition": f'attachment; filename="{transcript.source_id}.md"'})


@router.get("/notes", tags=["Notes"], response_model=list[NoteSummary],
            description="One note per newly processed source. Notes can be edited; source transcripts remain unchanged.")
async def list_notes(limit: Limit = 50, offset: Offset = 0):
    async with SessionLocal() as session:
        return (await session.scalars(select(Note).order_by(Note.created_at.desc(), Note.id)
                                      .offset(offset).limit(limit))).all()


@router.get("/notes/{note_id}", tags=["Notes"], response_model=NoteDetail)
async def get_note(note_id: str):
    async with SessionLocal() as session:
        note = await session.get(Note, note_id)
        if note is None:
            raise HTTPException(404, "Note not found.")
        document = await session.get(NoteDocument, note_id)
        if document is not None:
            return NoteDetail(**NoteSummary.model_validate(note).model_dump(),
                              content=document.content, blocks=document.blocks)
        transcript = await session.get(Transcript, note.source_id) if note.source_id else None
        if transcript:
            content = transcript.content
        else:
            # Preserve readability of notes created by the previous scaffold.
            try:
                content = await asyncio.to_thread(Path(note.path).read_text, encoding="utf-8")
            except OSError:
                raise HTTPException(404, "Legacy note file is unavailable.")
        return NoteDetail(**NoteSummary.model_validate(note).model_dump(), content=content)


@router.post("/notes/{note_id}", tags=["Notes"], response_model=NoteDetail,
             summary="Save an edited note without changing its source transcript")
async def save_note(note_id: str, body: NoteUpdate):
    async with SessionLocal() as session:
        note = await session.scalar(select(Note).where(Note.id == note_id).with_for_update())
        if note is None:
            raise HTTPException(404, "Note not found.")
        await session.merge(NoteDocument(note_id=note_id, content=body.content, blocks=body.blocks))
        await asyncio.to_thread(write_note, Path(note.path), note.title, body.content, note.source_id)
        await session.commit()
        return NoteDetail(**NoteSummary.model_validate(note).model_dump(),
                          content=body.content, blocks=body.blocks)
