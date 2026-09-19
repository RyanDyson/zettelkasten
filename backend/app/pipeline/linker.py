from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Link, Note


async def find_similar(session: AsyncSession, embedding: list[float], exclude_id: str):
    result = await session.execute(
        text(
            """
            SELECT id, title, 1 - (embedding <=> :emb) AS similarity
            FROM notes
            WHERE id != :exclude_id AND embedding IS NOT NULL
            ORDER BY embedding <=> :emb
            LIMIT :k
            """
        ).bindparams(emb=embedding, exclude_id=exclude_id, k=settings.top_k)
    )
    return [
        (row.id, row.title, row.similarity)
        for row in result
        if row.similarity >= settings.link_threshold
    ]


async def save_links(session: AsyncSession, note_id: str, similar: list[tuple[str, str, float]], tags: list[str]):
    for other_id, _title, sim in similar:
        session.add(Link(src_id=note_id, dst_id=other_id, weight=sim, kind="similarity"))
        session.add(Link(src_id=other_id, dst_id=note_id, weight=sim, kind="similarity"))

    if tags:
        tagset = set(tags)
        result = await session.execute(select(Note.id, Note.tags).where(Note.id != note_id))
        for other_id, other_tags in result:
            if not other_tags:
                continue
            shared = tagset & {t.strip() for t in other_tags.split(",") if t.strip()}
            if shared:
                session.add(
                    Link(
                        src_id=note_id,
                        dst_id=other_id,
                        weight=len(shared) / max(len(tagset), 1),
                        kind="tag",
                    )
                )
