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
