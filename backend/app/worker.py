import asyncio
import logging
import traceback
from pathlib import Path

from sqlalchemy import update

from .config import TRANSCRIPTS_DIR, MEDIA_EXTENSIONS, settings
from .db import SessionLocal
from .models import JobStatus, Note, Source, new_id
from .pipeline.core import append_links, embed, extract_audio, ollama_json, transcribe, write_note
from .pipeline.linker import find_similar, save_links

log = logging.getLogger("zk.worker")
queue: asyncio.Queue = asyncio.Queue()


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
            text = transcribe(audio_path)
        else:
            text = raw_path.read_text(encoding="utf-8")

        transcript_path = TRANSCRIPTS_DIR / f"{source_id}.md"
        transcript_path.write_text(text, encoding="utf-8")
        source.transcript_path = str(transcript_path)
        await session.commit()

        data = await ollama_json(text)
        created = []
        for note in data.get("atomic_notes", [])[:20]:
            note_id = new_id()
            tags = note.get("tags", [])
            path = write_note(note_id, note.get("title", "untitled"), note.get("body", ""), tags, source_id)
            emb = await embed(f'{note.get("title", "")}\n{note.get("body", "")}')
            similar = await find_similar(session, emb, exclude_id=note_id)
            session.add(
                Note(
                    id=note_id,
                    source_id=source_id,
                    path=str(path),
                    title=note.get("title", "untitled"),
                    tags=",".join(tags),
                    summary=note.get("body", "")[:200],
                    embedding=emb,
                )
            )
            await save_links(session, note_id, similar, tags)
            append_links(path, [nid for nid, _, _ in similar])
            created.append(note_id)
            await session.commit()

        source.status = JobStatus.done
        await session.commit()
