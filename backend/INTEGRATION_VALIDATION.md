# Integration validation — 19 September 2026 (HKT)

Branch: `integrate-llm`, based on master `e5bf2d0`. No merge into master.

## Automated checks

- 17 existing backend regression tests passed. The old assertion that `/graph` was absent was updated for the new API; existing ingestion/editor assertions remain.
- 9 new intelligence tests passed, covering three-note associations and negative matches, saved-edit/transcript preservation, reindex/backfill idempotency, model outage and retry, interrupted-job recovery, existing-note backfill, full-text chunking, invalid model output/embedding dimensions, an additive upgrade from master tables, stored aliases, and transaction rollback after derived writes.
- Frontend: 10 tests passed; ESLint, generated route types, TypeScript, and production build passed.
- Docker API image built successfully and existing-volume startup succeeded.

Lifecycle tests use deterministic model output and a disposable PostgreSQL database. Model HTTP validation tests use a mock transport. These are separate from the real-model checks below.

## Real local models

Used host Ollama with `qwen2.5:7b` and `nomic-embed-text` and four PDF fixtures on an isolated API/database. The entire PDF → transcript → note → intelligence → graph path was exercised.

1. A broad fruit note included apples, oranges, grapes, and nutrients.
2. An apple-specific note connected to the fruit note.
3. A third apple note connected to **both** earlier notes; their concept associations were retained.
4. An unrelated quantum-physics note had no connections to the fruit/apple cluster.

All four jobs completed without errors, original titles remained unchanged, and the graph had exactly three undirected edges among the three relevant notes. Model output extracted apples as a concept directly from the source.

## Browser checks

The graph rendered the connected fruit/apple cluster and the separate unrelated node. Related-note links appeared beneath the existing block editor. Following one while editing retained the draft and its Editing badge with no navigation dialog. The floating tabs and current sidebar/layout were preserved.

## Existing library

The original PostgreSQL database and vault files were backed up before switching the local API to the integration code. The original API image was retained as `zettelkasten-api:before-llm-integration`.

The additive startup retained six sources, six notes, six transcripts, and three saved edited-note documents. All six notes finished indexing with zero failures, producing 6 undirected connections. Row contents were compared again after completion with the backup; all were unchanged. All 18 original vault files matched the backup byte-for-byte. Intelligence results are additional records, not edits to those originals.

## Current local launch

The integration branch is `integrate-llm`, consolidated into `/Users/leonwork/zettelkasten`. Its ignored `.env` keeps Compose project `zettelkasten` and the existing database/file volumes. The frontend runs at **http://localhost:3000**. Swagger is **http://localhost:8000/docs**.

To restart this setup:

```bash
cd /Users/leonwork/zettelkasten
docker compose -p zettelkasten up -d --build
cd frontend
bun run dev --hostname 127.0.0.1 --port 3000
```

Ollama must be running on the host. The frontend defaults to API port 8000. There is no semantic-search endpoint in this integration. Link quality beyond these fixtures needs broader evaluation; connections remain model-generated suggestions.
