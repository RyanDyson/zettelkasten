import asyncio
from pathlib import Path

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..db import SessionLocal
from ..models import Note, Source

router = APIRouter()


async def _read(path: str) -> str:
    return await asyncio.to_thread(Path(path).read_text, "utf-8")


@router.get("/jobs/{source_id}")
async def get_job(source_id: str):
    async with SessionLocal() as session:
        source = await session.get(Source, source_id)
        if source is None:
            raise HTTPException(404)
        notes = (
            await session.execute(select(Note.id, Note.title).where(Note.source_id == source_id))
        ).all()
        return {
            "source_id": source.id,
            "status": source.status.value if source.status else None,
            "error": source.error,
            "notes": [dict(r._mapping) for r in notes],
        }


@router.get("/sources")
async def list_sources():
    async with SessionLocal() as session:
        rows = await session.execute(
            select(Source.id, Source.kind, Source.original_name, Source.status, Source.created_at)
            .order_by(Source.created_at.desc())
            .limit(100)
        )
        return [dict(r._mapping) for r in rows]


@router.get("/notes")
async def list_notes():
    async with SessionLocal() as session:
        rows = await session.execute(
            select(Note.id, Note.title, Note.tags, Note.path, Note.created_at).order_by(Note.created_at.desc())
        )
        return [dict(r._mapping) for r in rows]


@router.get("/notes/{note_id}")
async def get_note(note_id: str):
    async with SessionLocal() as session:
        note = await session.get(Note, note_id)
        if note is None:
            raise HTTPException(404)
        return {
            "id": note.id,
            "title": note.title,
            "tags": note.tags,
            "summary": note.summary,
            "path": note.path,
            "content": await _read(note.path) if note.path else "",
            "source_id": note.source_id,
        }
