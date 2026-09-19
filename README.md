# Zettelkasten ingestion backend

Upload **PDF, audio, or video**, extract its text, and store it in PostgreSQL. Audio and video use FFmpeg plus local Whisper (`faster-whisper`). The API includes interactive Swagger UI for frontend integration.

This phase ends at text/transcript storage. There is no automatic linking, embedding, summarization, or local LLM dependency. No frontend application is implemented.

## Start

Requires Docker with Compose. From this repository:

```bash
cp .env.example .env
docker compose up -d --build
```

- **Swagger UI:** http://localhost:8000/docs
- **OpenAPI schema:** http://localhost:8000/openapi.json
- **Health:** http://localhost:8000/health

The example config maps PostgreSQL to local port **5433**. API port defaults to **8000**. Change these in `.env` if occupied. Whisper downloads its model on the first media job; that job can take longer and requires internet access. Later runs use the persistent model cache. No OpenAI API key is required.

## Flow

```text
PDF ────────→ pypdf text extraction ───┐
Audio/video → FFmpeg → local Whisper ──┤
                                      ↓
                          PostgreSQL transcript + note metadata
                                      ↓
                          Markdown transcript and note files
```

1. `POST /ingest` accepts a multipart `file` and returns HTTP 202 with a source ID.
2. The database-backed worker extracts/transcribes it asynchronously.
3. `GET /jobs/{source_id}` reports `queued`, `processing`, `done`, or `failed`.
4. `GET /sources/{source_id}/transcript` returns stored text and media metadata.
5. `GET /notes` and `GET /notes/{note_id}` expose one note per successful upload.

PDFs must contain selectable text. Image-only/scanned PDFs need OCR, which is outside this version. Pasted text, `.txt`, Markdown, and Word uploads are not accepted.

See [backend/README.md](backend/README.md) for the frontend example, API contract, configuration, storage, testing, and local development.
