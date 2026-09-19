from datetime import datetime
import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from ..config import settings
from ..db import SessionLocal
from ..intelligence.service import enqueue_missing
from ..intelligence.formatting import format_blocks
from ..intelligence.pipeline import IntelligenceError
from ..models import (Concept, IntelligenceJob, IntelligenceLink, Link, Note, NoteConcept,
                      NoteIntelligence, Transcript, utcnow)
from ..schemas import ErrorResponse, NoteSummary
from ..note_layout import reflow_blocks

router = APIRouter(tags=["Intelligence"], responses={404: {"model": ErrorResponse}})


class RelatedNote(BaseModel):
    note_id: str
    title: str
    score: float
    concepts: list[str]


class ConceptMention(BaseModel):
    concept: str
    terms: list[str]
    notes: list[RelatedNote]


class IntelligenceDetail(BaseModel):
    note_id: str
    enabled: bool
    status: Literal["not_indexed", "queued", "processing", "done", "failed"]
    error: str | None = None
    summary: str | None = None
    concepts: list[str] = Field(default_factory=list)
    related_notes: list[RelatedNote] = Field(default_factory=list)
    mentions: list[ConceptMention] = Field(default_factory=list)
    indexed_at: datetime | None = None
    model: str | None = None
    chunk_count: int | None = None
    input_kind: str = "source_transcript"


class QueueResult(BaseModel):
    queued: int


class QueueStatus(BaseModel):
    enabled: bool
    worker: str
    counts: dict[str, int]
    unindexed: int


class GraphEdge(BaseModel):
    src_id: str
    dst_id: str
    weight: float
    kind: str
    concepts: list[str] = Field(default_factory=list)


class GraphResponse(BaseModel):
    nodes: list[NoteSummary]
    edges: list[GraphEdge]


def require_enabled():
    if not settings.intelligence_enabled:
        raise HTTPException(409, "Intelligence is disabled. Enable ZK_INTELLIGENCE_ENABLED to run indexing.")


@router.get("/notes/{note_id}/intelligence", response_model=IntelligenceDetail,
            summary="Read analysis and related notes without changing note content")
async def get_intelligence(note_id: str):
    async with SessionLocal() as session:
        if await session.get(Note, note_id) is None:
            raise HTTPException(404, "Note not found.")
        job = await session.get(IntelligenceJob, note_id)
        result = await session.get(NoteIntelligence, note_id)
        concepts = (await session.scalars(select(NoteConcept.concept_key).where(NoteConcept.note_id == note_id).order_by(NoteConcept.concept_key))).all()
        edges = (await session.scalars(select(IntelligenceLink).where(or_(IntelligenceLink.src_id == note_id, IntelligenceLink.dst_id == note_id)).order_by(IntelligenceLink.weight.desc()))).all()
        ids = [edge.dst_id if edge.src_id == note_id else edge.src_id for edge in edges]
        titles = dict((await session.execute(select(Note.id, Note.title).where(Note.id.in_(ids)))).all()) if ids else {}
        related = [RelatedNote(note_id=other, title=titles[other], score=edge.weight, concepts=edge.concepts)
                   for edge, other in zip(edges, ids) if other in titles]
        mention_rows = (await session.execute(select(NoteConcept, Concept)
            .join(Concept, Concept.key == NoteConcept.concept_key)
            .where(NoteConcept.note_id == note_id))).all()
        mentions = []
        for association, concept in mention_rows:
            targets = [other for other in related if concept.key in other.concepts]
            if targets:
                # Evidence mentions may be whole sentences or pronouns ("this nutrient").
                # Highlight named concepts and synonyms, never their surrounding evidence.
                terms = sorted(set([concept.name, *concept.aliases]))
                mentions.append(ConceptMention(concept=concept.key, terms=terms, notes=targets))
        return IntelligenceDetail(note_id=note_id, enabled=settings.intelligence_enabled,
            status=job.status if job else "not_indexed", error=job.error if job else None,
            summary=result.summary if result else None, concepts=concepts, related_notes=related, mentions=mentions,
            indexed_at=result.created_at if result else None, model=result.model if result else None,
            chunk_count=result.chunk_count if result else None)


@router.post("/notes/{note_id}/intelligence/reindex", response_model=QueueResult, status_code=202,
             summary="Queue or retry analysis of the original stored transcript")
async def reindex(note_id: str):
    require_enabled()
    async with SessionLocal() as session:
        note = await session.get(Note, note_id)
        if note is None:
            raise HTTPException(404, "Note not found.")
        if not note.source_id or await session.get(Transcript, note.source_id) is None:
            raise HTTPException(409, "No stored transcript is available for this note.")
        # Insert safely even if the background discovery loop sees the note concurrently.
        from sqlalchemy.dialects.postgresql import insert
        inserted = (await session.execute(insert(IntelligenceJob).values(note_id=note_id)
            .on_conflict_do_nothing(index_elements=["note_id"]).returning(IntelligenceJob.note_id))).scalar_one_or_none()
        job = await session.get(IntelligenceJob, note_id, with_for_update=True)
        if not inserted and job.status in ("queued", "processing"):
            await session.commit()
            return QueueResult(queued=0)
        job.status, job.error, job.queued_at, job.completed_at = "queued", None, utcnow(), None
        await session.commit()
        return QueueResult(queued=1)


@router.post("/intelligence/backfill", response_model=QueueResult, status_code=202,
             summary="Queue existing notes that have no intelligence job; safe to repeat")
async def backfill():
    require_enabled()
    async with SessionLocal() as session:
        count = await enqueue_missing(session)
        await session.commit()
    return QueueResult(queued=count)


@router.get("/intelligence/status", response_model=QueueStatus, summary="Read indexing queue progress")
async def status(request: Request):
    async with SessionLocal() as session:
        counts = dict((await session.execute(select(IntelligenceJob.status, func.count()).group_by(IntelligenceJob.status))).all())
        missing = await session.scalar(select(func.count()).select_from(Note).join(Transcript, Transcript.source_id == Note.source_id)
            .outerjoin(IntelligenceJob, IntelligenceJob.note_id == Note.id).where(IntelligenceJob.note_id.is_(None)))
    # Actual task health is supplied by app state, separately from ingestion health.
    task = getattr(request.app.state, "intelligence_task", None)
    return QueueStatus(enabled=settings.intelligence_enabled,
                       worker="running" if task and not task.done() else "stopped",
                       counts={state: counts.get(state, 0) for state in ("queued", "processing", "done", "failed")}, unindexed=missing)


@router.get("/graph", response_model=GraphResponse, tags=["Graph"],
            summary="Read all notes and deduplicated stored connections")
async def graph():
    async with SessionLocal() as session:
        notes = (await session.scalars(select(Note).order_by(Note.created_at.desc(), Note.id))).all()
        derived = (await session.scalars(select(IntelligenceLink))).all()
        legacy = (await session.scalars(select(Link))).all()
    ids = {n.id for n in notes}
    edges = {}
    for edge in legacy + derived:
        if edge.src_id == edge.dst_id or edge.src_id not in ids or edge.dst_id not in ids:
            continue
        pair = tuple(sorted([edge.src_id, edge.dst_id]))
        if pair not in edges or edge.weight > edges[pair].weight:
            edges[pair] = GraphEdge(src_id=pair[0], dst_id=pair[1], weight=edge.weight,
                kind="concept" if isinstance(edge, IntelligenceLink) else edge.kind,
                concepts=edge.concepts if isinstance(edge, IntelligenceLink) else [])
    return GraphResponse(nodes=[NoteSummary.model_validate(n) for n in notes], edges=list(edges.values()))


class FormatRequest(BaseModel):
    blocks: list[dict] = Field(min_length=1, max_length=1000)


class LayoutPreview(BaseModel):
    blocks: list[dict]
    repaired_breaks: int


class FormatPreview(LayoutPreview):
    preserved_blocks: int
    model: str


@router.post("/notes/{note_id}/format-preview", response_model=FormatPreview,
             summary="Preview local AI formatting of the current draft without saving it")
async def format_preview(note_id: str, body: FormatRequest):
    require_enabled()
    if len(json.dumps(body.blocks, ensure_ascii=False)) > 120_000:
        raise HTTPException(413, "This note is too large for a formatting preview. Format a shorter note.")
    async with SessionLocal() as session:
        if await session.get(Note, note_id) is None:
            raise HTTPException(404, "Note not found.")
    try:
        return await format_blocks(body.blocks)
    except IntelligenceError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/notes/{note_id}/layout-preview", response_model=LayoutPreview,
             summary="Preview repair of broken line wraps while preserving draft words and styles")
async def layout_preview(note_id: str, body: FormatRequest):
    if len(json.dumps(body.blocks, ensure_ascii=False)) > 120_000:
        raise HTTPException(413, "This note is too large for a layout preview.")
    async with SessionLocal() as session:
        if await session.get(Note, note_id) is None:
            raise HTTPException(404, "Note not found.")
    return reflow_blocks(body.blocks)
