from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from .config import settings
from .models import Base

engine = create_async_engine(settings.database_url, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.execute(
            text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS intelligence_path TEXT")
        )
        await conn.execute(
            text("ALTER TABLE notes ADD COLUMN IF NOT EXISTS keywords TEXT")
        )
        await conn.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS concept_index (
                    id BIGSERIAL PRIMARY KEY,
                    canonical_name TEXT NOT NULL UNIQUE,
                    aliases TEXT[] NOT NULL DEFAULT '{{}}',
                    note_id TEXT,
                    embedding VECTOR({settings.embedding_dimensions}),
                    metadata JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE concept_index
                ADD COLUMN IF NOT EXISTS source_phrase TEXT,
                ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS concept_index_canonical_name_trgm_idx
                ON concept_index USING GIN (canonical_name gin_trgm_ops)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS concept_index_canonical_name_fts_idx
                ON concept_index USING GIN (to_tsvector('english', canonical_name))
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS concept_index_embedding_idx
                ON concept_index USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100)
                """
            )
        )
        await conn.run_sync(Base.metadata.create_all)


async def dispose() -> None:
    await engine.dispose()
