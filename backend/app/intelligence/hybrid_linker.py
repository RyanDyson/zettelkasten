from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings


def _vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(f"{float(v):.10f}" for v in embedding) + "]"


async def resolve_canonical_concept(
    db_conn: AsyncSession,
    canonical: str,
    aliases: list[str],
    embedding: list[float],
) -> dict | None:
    terms = [canonical] + aliases
    clean_terms = [t.strip() for t in terms if t and t.strip()]
    for term in clean_terms:
        exact = await db_conn.execute(
            text(
                """
                SELECT canonical_name
                FROM concept_index
                WHERE lower(canonical_name) = lower(:term)
                LIMIT 1
                """
            ),
            {"term": term},
        )
        row = exact.first()
        if row:
            return {
                "canonical_name": row.canonical_name,
                "match_type": "exact",
                "score": 1.0,
            }

    for term in clean_terms:
        fuzzy = await db_conn.execute(
            text(
                """
                SELECT canonical_name,
                       GREATEST(
                         similarity(canonical_name, :term),
                         ts_rank_cd(to_tsvector('english', canonical_name), plainto_tsquery('english', :term))
                       ) AS score
                FROM concept_index
                WHERE canonical_name ILIKE '%' || :term || '%'
                   OR to_tsvector('english', canonical_name) @@ plainto_tsquery('english', :term)
                   OR similarity(canonical_name, :term) > 0.45
                ORDER BY score DESC
                LIMIT 1
                """
            ),
            {"term": term},
        )
        row = fuzzy.first()
        if row and row.score and row.score >= 0.55:
            return {
                "canonical_name": row.canonical_name,
                "match_type": "fuzzy",
                "score": float(row.score),
            }

    if not embedding:
        return None

    emb_literal = _vector_literal(embedding)
    semantic = await db_conn.execute(
        text(
            """
            SELECT canonical_name,
                   1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM concept_index
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT 1
            """
        ),
        {"embedding": emb_literal},
    )
    row = semantic.first()
    if row and row.similarity is not None and row.similarity >= settings.intelligence_similarity_threshold:
        return {
            "canonical_name": row.canonical_name,
            "match_type": "semantic",
            "score": float(row.similarity),
        }

    return None


async def fetch_candidate_note_relations(
    db_conn: AsyncSession,
    concept_names: list[str],
    top_k: int = 10,
) -> list[dict]:
    if not concept_names:
        return []

    result = await db_conn.execute(
        text(
            """
            WITH ranked AS (
                SELECT
                    n.id,
                    n.title,
                    n.tags,
                    COUNT(*) FILTER (WHERE lower(c.canonical_name) = ANY(:concept_names)) AS shared_concepts,
                    ARRAY_AGG(c.canonical_name) FILTER (WHERE lower(c.canonical_name) = ANY(:concept_names)) AS matched_concepts
                FROM notes n
                LEFT JOIN concept_index c ON c.note_id = n.id
                GROUP BY n.id, n.title, n.tags
            )
            SELECT *
            FROM ranked
            WHERE shared_concepts > 0
            ORDER BY shared_concepts DESC, title ASC
            LIMIT :top_k
            """
        ),
        {"concept_names": [c.lower() for c in concept_names], "top_k": top_k},
    )

    rows = []
    for row in result:
        rows.append(
            {
                "note_id": row.id,
                "title": row.title,
                "tags": row.tags or "",
                "shared_concepts": int(row.shared_concepts or 0),
                "matched_concepts": [c for c in (row.matched_concepts or []) if c],
            }
        )
    return rows
