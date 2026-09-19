import asyncio
import logging
from collections import defaultdict

from sqlalchemy import delete, func, literal, or_, select, update
from sqlalchemy.dialects.postgresql import insert

from ..config import settings
from ..db import SessionLocal
from ..models import (Concept, IntelligenceJob, IntelligenceLink, Note, NoteConcept,
                      NoteIntelligence, Transcript, utcnow)
from .pipeline import IntelligenceError, VERSION, analyze, normalize

log = logging.getLogger("zk.intelligence")


async def enqueue_missing(session) -> int:
    """Discover committed transcripts, including pre-integration notes, idempotently."""
    statement = insert(IntelligenceJob).from_select(
        ["note_id", "status", "attempts", "queued_at"],
        select(Note.id, literal("queued"), literal(0), func.now())
        .join(Transcript, Transcript.source_id == Note.source_id),
    ).on_conflict_do_nothing(index_elements=["note_id"]).returning(IntelligenceJob.note_id)
    return len((await session.scalars(statement)).all())


async def persist_result(session, note_id: str, result: dict) -> None:
    """Replace only derived data, atomically. Never write Note, NoteDocument, or Transcript."""
    existing = list((await session.scalars(select(Concept))).all())
    by_term = {}
    # Canonical names take precedence over aliases belonging to another concept.
    for concept in existing:
        for alias in concept.aliases:
            by_term.setdefault(normalize(alias), concept)
    for concept in existing:
        by_term[concept.key] = concept
    resolved = {}
    for item in result["concepts"]:
        key = normalize(item["canonical"])
        concept = by_term.get(key)
        if concept is None:
            concept = next((by_term[a] for a in item["aliases"] if a in by_term), None)
        if concept is None:
            # Conservative semantic fallback, limited to the same embedding model.
            distance = Concept.embedding.cosine_distance(item["embedding"])
            candidate = (await session.execute(select(Concept, distance.label("distance"))
                .where(Concept.embed_model == settings.embed_model)
                .order_by(distance).limit(1))).first()
            if candidate and candidate.distance is not None and 1 - candidate.distance >= settings.intelligence_semantic_threshold:
                concept = candidate[0]
        if concept is None:
            concept = Concept(key=key, name=key, aliases=[], embedding=item["embedding"], embed_model=settings.embed_model)
            session.add(concept)
        concept.aliases = sorted(set(concept.aliases + item["aliases"] + [key]) - {concept.key})
        if concept.embed_model != settings.embed_model:
            concept.embedding, concept.embed_model = item["embedding"], settings.embed_model
        await session.flush()
        by_term[key] = concept
        for alias in concept.aliases:
            by_term.setdefault(alias, concept)
        old = resolved.get(concept.key)
        resolved[concept.key] = {
            "confidence": max(item["confidence"], old["confidence"] if old else 0),
            "mentions": list(dict.fromkeys((old["mentions"] if old else []) + item["mentions"]))[:30],
        }

    await session.execute(delete(NoteConcept).where(NoteConcept.note_id == note_id))
    for key, values in resolved.items():
        session.add(NoteConcept(note_id=note_id, concept_key=key, **values))
    await session.flush()

    candidates = defaultdict(list)
    if resolved:
        rows = (await session.execute(select(NoteConcept.note_id, NoteConcept.concept_key, NoteConcept.confidence)
            .where(NoteConcept.concept_key.in_(list(resolved)), NoteConcept.note_id != note_id))).all()
        for other_id, key, confidence in rows:
            candidates[other_id].append((key, min(confidence, resolved[key]["confidence"])))
    await session.execute(delete(IntelligenceLink).where(or_(IntelligenceLink.src_id == note_id, IntelligenceLink.dst_id == note_id)))
    for other_id, shared in candidates.items():
        # A strong shared entity can link a narrow note to a broad note. The score
        # is a matching heuristic, not a calibrated probability of correctness.
        weight = min(1.0, max(conf for _, conf in shared) + 0.03 * (len(shared) - 1))
        if weight >= settings.intelligence_relation_threshold:
            src, dst = sorted([note_id, other_id])
            session.add(IntelligenceLink(src_id=src, dst_id=dst, weight=weight,
                                         concepts=sorted(key for key, _ in shared)))
    await session.merge(NoteIntelligence(note_id=note_id, input_hash=result["input_hash"],
        model=settings.llm_model, embed_model=settings.embed_model, version=VERSION,
        summary=result["summary"], chunk_count=result["chunk_count"], created_at=utcnow()))


async def process(note_id: str) -> None:
    async with SessionLocal() as session:
        job = await session.get(IntelligenceJob, note_id, with_for_update=True)
        if job is None or job.status not in ("queued", "processing"):
            return
        job.status, job.error = "processing", None
        job.attempts += 1
        content = await session.scalar(select(Transcript.content).join(Note, Note.source_id == Transcript.source_id).where(Note.id == note_id))
        await session.commit()
    try:
        if content is None:
            raise IntelligenceError("No stored transcript is available for this note.")
        result = await analyze(content)
        async with SessionLocal() as session:
            # Serialize with deletion in the same lock order (note, then job).
            # A note deleted while Ollama was running must never be resurrected.
            note = await session.get(Note, note_id, with_for_update=True)
            if note is None:
                return
            job = await session.get(IntelligenceJob, note_id, with_for_update=True)
            if job is None:
                return
            await persist_result(session, note_id, result)
            job.status, job.error, job.completed_at = "done", None, utcnow()
            await session.commit()
    except asyncio.CancelledError:
        # Remains processing; the next owner of the main advisory lock resumes it.
        raise
    except Exception as exc:
        log.exception("Intelligence failed for note %s", note_id)
        message = str(exc) if isinstance(exc, IntelligenceError) else "Indexing failed. Check backend logs, then retry indexing."
        async with SessionLocal() as session:
            await session.execute(update(IntelligenceJob).where(IntelligenceJob.note_id == note_id)
                                  .values(status="failed", error=message, completed_at=utcnow()))
            await session.commit()


async def worker_loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            async with SessionLocal() as session:
                await enqueue_missing(session)
                note_id = await session.scalar(select(IntelligenceJob.note_id)
                    .where(IntelligenceJob.status.in_(["queued", "processing"]))
                    .order_by(IntelligenceJob.queued_at, IntelligenceJob.note_id).limit(1))
                await session.commit()
            if note_id:
                await process(note_id)
                continue
        except Exception:
            log.exception("Intelligence queue operation failed; polling will retry")
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.worker_poll_seconds)
        except asyncio.TimeoutError:
            pass
