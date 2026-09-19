import asyncio
import json
import logging
import traceback
from pathlib import Path

from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession

from .config import CONTRACTS_DIR, TRANSCRIPTS_DIR, MEDIA_EXTENSIONS
from .db import SessionLocal
from .intelligence.embedder import get_vector
from .intelligence import run_intelligence_pipeline
from .models import JobStatus, Note, Source, new_id
from .pipeline.core import extract_audio, transcribe, write_note

log = logging.getLogger("zk.worker")
queue: asyncio.Queue = asyncio.Queue()


async def run_intelligence_for_dev2(raw_text: str, session: AsyncSession) -> dict:
    return await run_intelligence_pipeline(raw_text, session)


async def worker_loop() -> None:
    while True:
        source_id = await queue.get()
        try:
            await process(source_id)
        except Exception:
            log.error("job %s failed\n%s", source_id, traceback.format_exc())
            async with SessionLocal() as session:
                await session.execute(
                    update(Source)
                    .where(Source.id == source_id)
                    .values(status=JobStatus.failed, error=traceback.format_exc()[-2000:])
                )
                await session.commit()
        finally:
            queue.task_done()


async def process(source_id: str) -> None:
    async with SessionLocal() as session:
        source = await session.get(Source, source_id)
        if source is None:
            return
        source.status = JobStatus.processing
        await session.commit()

        raw_path = Path(source.raw_path)
        if raw_path.suffix.lower() in MEDIA_EXTENSIONS:
            audio_path = TRANSCRIPTS_DIR / f"{source_id}.mp3"
            extract_audio(raw_path, audio_path)
            raw_text = transcribe(audio_path)
        else:
            raw_text = raw_path.read_text(encoding="utf-8")

        transcript_path = TRANSCRIPTS_DIR / f"{source_id}.md"
        transcript_path.write_text(raw_text, encoding="utf-8")
        source.transcript_path = str(transcript_path)
        await session.commit()

        intelligence = await run_intelligence_pipeline(raw_text, session)

        contract_path = CONTRACTS_DIR / f"{source_id}.json"
        contract_path.write_text(json.dumps(intelligence, indent=2), encoding="utf-8")
        source.intelligence_path = str(contract_path)

        doc = intelligence["document"]
        title = doc["title"]
        tags = doc["tags"]
        note_id = new_id()
        note_path = write_note(
            note_id,
            title,
            doc["summary_enriched_text"],
            tags,
            source_id,
        )
        session.add(
            Note(
                id=note_id,
                source_id=source_id,
                path=str(note_path),
                title=title,
                tags=",".join(tags),
                summary=doc["summary"],
                embedding=doc["embedding"],
                keywords=",".join(sorted({c["canonical"] for c in intelligence["concepts"] if c.get("canonical")})),
            )
        )
        await session.flush()

        concept_embedding_cache: dict[str, str] = {}
        for concept in intelligence["concepts"]:
            canonical = concept.get("canonical")
            if not canonical:
                continue
            aliases = concept.get("aliases", [])
            mention = concept.get("mentions", [canonical])[0] if concept.get("mentions") else canonical
            confidence = float(concept.get("ai_confidence", 0.5))

            cache_key = canonical.lower().strip()
            if cache_key not in concept_embedding_cache:
                concept_vector = await get_vector(canonical)
                concept_embedding_cache[cache_key] = "[" + ",".join(
                    f"{float(v):.10f}" for v in concept_vector
                ) + "]"

            await session.execute(
                text(
                    """
                    INSERT INTO concept_index (canonical_name, aliases, note_id, embedding, source_phrase, confidence)
                    VALUES (:canonical_name, :aliases, :note_id, CAST(:embedding AS vector), :source_phrase, :confidence)
                    ON CONFLICT (canonical_name)
                    DO UPDATE SET
                        aliases = EXCLUDED.aliases,
                        note_id = EXCLUDED.note_id,
                        embedding = EXCLUDED.embedding,
                        source_phrase = EXCLUDED.source_phrase,
                        confidence = EXCLUDED.confidence,
                        updated_at = NOW()
                    """
                ),
                {
                    "canonical_name": canonical,
                    "aliases": aliases,
                    "note_id": note_id,
                    "embedding": concept_embedding_cache[cache_key],
                    "source_phrase": mention,
                    "confidence": confidence,
                },
            )

        for relation in intelligence["relations"]:
            await session.execute(
                text(
                    """
                    INSERT INTO links (src_id, dst_id, weight, kind)
                    VALUES (:src_id, :dst_id, :weight, 'concept')
                    ON CONFLICT (src_id, dst_id, kind)
                    DO UPDATE SET weight = EXCLUDED.weight
                    """
                ),
                {
                    "src_id": note_id,
                    "dst_id": relation["target_note_id"],
                    "weight": float(relation["confidence"]),
                },
            )
            await session.execute(
                text(
                    """
                    INSERT INTO links (src_id, dst_id, weight, kind)
                    VALUES (:src_id, :dst_id, :weight, 'concept')
                    ON CONFLICT (src_id, dst_id, kind)
                    DO UPDATE SET weight = EXCLUDED.weight
                    """
                ),
                {
                    "src_id": relation["target_note_id"],
                    "dst_id": note_id,
                    "weight": float(relation["confidence"]),
                },
            )

        source.status = JobStatus.done
        await session.commit()
