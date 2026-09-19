from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select, text

from ..config import settings
from ..db import SessionLocal
from ..models import Link, Note
from .jobs import _read

router = APIRouter()


@router.get("/graph")
async def get_graph():
    async with SessionLocal() as session:
        notes = (
            await session.execute(select(Note.id, Note.title, Note.tags))
        ).all()
        links = (
            await session.execute(select(Link.src_id, Link.dst_id, Link.weight, Link.kind))
        ).all()
    return {
        "nodes": [
            {"id": n.id, "label": n.title, "tags": (n.tags or "").split(",") if n.tags else []}
            for n in notes
        ],
        "edges": [dict(e._mapping) for e in links],
    }


class SearchQuery(BaseModel):
    query: str
    k: int = 5


@router.post("/search")
async def search(q: SearchQuery):
    from .pipeline.core import embed

    emb = await embed(q.query)
    async with SessionLocal() as session:
        rows = await session.execute(
            text(
                """
                SELECT id, title, path, 1 - (embedding <=> :emb) AS similarity
                FROM notes
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> :emb
                LIMIT :k
                """
            ).bindparams(emb=emb, k=q.k)
        )
        results = []
        for row in rows:
            content = (await _read(row.path))[:1000] if row.path else ""
            results.append(
                {
                    "id": row.id,
                    "title": row.title,
                    "path": row.path,
                    "similarity": float(row.similarity),
                    "excerpt": content,
                }
            )
    return {"query": q.query, "results": results}
