import asyncio

from app.db import SessionLocal, init_db
from app.intelligence import run_intelligence_pipeline

SAMPLE_TEXT = """
This sprint we implemented retrieval augmented generation for our note graph.
PostgreSQL and pgvector power semantic search, while LangChain orchestrates retrieval.
We also discussed API latency, token budgets, and chunking strategy.
""".strip()


async def main() -> None:
    await init_db()

    async with SessionLocal() as session:
        result = await run_intelligence_pipeline(SAMPLE_TEXT, session)

    doc = result["document"]

    print("title:", doc["title"])
    print("summary:")
    print(doc["summary"])
    print()
    print("tags:", doc["tags"])
    print("concepts:", [c["canonical"] for c in result["concepts"]])
    print("relations:", result["relations"])
    print("hyperlinks:", result["hyperlinks"])
    print("summary_enriched_text:")
    print(doc["summary_enriched_text"])
    print()
    print("word_count_keys:", len(doc["word_counts"]))
    print("embedding_dim:", len(doc["embedding"]))
    print("debug:", result["debug"])


if __name__ == "__main__":
    asyncio.run(main())
