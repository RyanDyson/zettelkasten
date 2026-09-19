import asyncio
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select, update

from ..db import SessionLocal
from ..models import JobStatus, Note, Source, Transcript
from ..schemas import (AcceptedJob, ErrorResponse, JobDetail, NoteDetail, NoteSummary,
                       SourceDetail, SourceSummary, TranscriptResponse)

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
            description="One unmodified note per newly processed source. No summarization or automatic links.")
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
