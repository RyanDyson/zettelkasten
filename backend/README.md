# Zettelkasten backend

Local-first pipeline: ingest media/text -> Whisper -> Ollama -> atomic notes -> embeddings -> links.

## Run

```bash
docker compose up -d --build
# pull models once
docker compose exec ollama ollama pull qwen2.5:7b
docker compose exec ollama ollama pull nomic-embed-text
```

API on http://localhost:8000 (docs at /docs).

## Intelligence Pipeline (Dev 4)

- Entry point: `app.intelligence.run_intelligence_pipeline(raw_text, db_conn)`
- Bootstraps `concept_index` in DB init with vector + trigram/FTS indexes.
- Writes frontend-ready JSON contract per source to `contracts/{source_id}.json`.

### Frontend Contract (v2)

The intelligence payload shape:

```json
{
  "contract_version": "intelligence.v2",
  "document": {
    "title": "...",
    "summary": "...",
    "tags": ["..."],
    "raw_text": "...",
    "enriched_text": "...",
    "word_counts": {"keyword": 1.23},
    "embedding": [0.01, -0.02]
  },
  "concepts": [
    {
      "canonical": "Retrieval Augmented Generation",
      "source_canonical": "retrieval augmented generation",
      "aliases": ["RAG"],
      "mentions": ["retrieval augmented generation"],
      "ai_confidence": 0.91,
      "match_type": "exact|fuzzy|semantic|new",
      "match_score": 0.88
    }
  ],
  "relations": [
    {
      "target_note_id": "abc123",
      "target_title": "...",
      "matched_concepts": ["..."],
      "confidence": 0.86
    }
  ],
  "hyperlinks": [
    {
      "phrase": "exact transcript phrase",
      "target_title": "...",
      "confidence": 0.86
    }
  ],
  "debug": {
    "concept_count": 7,
    "candidate_relations": 3,
    "accepted_relations": 1,
    "top_relation_confidence": 0.86
  }
}
```

Quick test (from `backend/`):

```bash
python -m scripts.test_intelligence_pipeline
```

To test concept linking, insert canonical concepts first:

```sql
INSERT INTO concept_index (canonical_name)
VALUES ('PostgreSQL'), ('LangChain'), ('Retrieval Augmented Generation')
ON CONFLICT (canonical_name) DO NOTHING;
```

High-confidence relation behavior:

- No relation above threshold => no links created.
- Relation threshold configured by `ZK_INTELLIGENCE_RELATION_THRESHOLD` (default `0.82`).
- Hyperlink insertion uses only the most relevant phrase for top relation.

## Endpoints

- `POST /ingest` - multipart file (video/audio/text), returns `source_id`
- `GET /jobs/{id}` - poll status: queued | processing | done | failed
- `GET /notes`, `GET /notes/{id}` - list / read notes (MD on disk)
- `GET /graph` - nodes + edges for graph view
- `POST /search` - `{"query": "...", "k": 5}` vector search

Notes live in `~/zettelkasten/` on the host: `raw/`, `transcripts/`, `notes/`.

## Local dev (no Docker for the API)

```bash
pip install -r backend/requirements.txt
uvicorn app.main:app --reload  # from backend/, with ZK_DATABASE_URL pointing at compose db
```
