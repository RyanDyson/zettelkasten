# Zettelkasten

Upload **PDF, audio, or video**, extract its text, and store it in PostgreSQL. Audio and video use FFmpeg plus local Whisper (`faster-whisper`). The API includes interactive Swagger UI for frontend integration.

The Next.js frontend provides uploads, editable notes, drafts, transcripts, media playback, and a graph of real connections. After transcription, a separate local Ollama worker summarizes the original source and links notes through shared concepts. LLM errors do not interrupt ingestion or editing.

## One-command setup (recommended)

Installs Bun, Docker checks, Ollama + the two local models, the `.env`, the backend/database containers, and the UI — then opens the browser.

- **Windows** (PowerShell): `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1`
- **macOS / Linux**: `bash scripts/setup.sh`

Already have Ollama and its models? Add `-SkipOllama` (Windows) or `SKIP_OLLAMA=1` (macOS/Linux).

## Start

Requires Docker with Compose and Ollama running on the host. Install the local models once:

```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

Start the Ollama app (or `ollama serve` if it is not already running). From this repository:

```bash
cp -n .env.example .env
docker compose up -d --build
```

- **Swagger UI:** http://localhost:8000/docs
- **OpenAPI schema:** http://localhost:8000/openapi.json
- **Health:** http://localhost:8000/health

The example config maps PostgreSQL to local port **5433**. API port defaults to **8000**. Change these in `.env` if occupied. Whisper downloads its model on the first media job; that job can take longer and requires internet access. Later runs use the persistent model cache. No OpenAI API key is required.

## Run the UI

With the backend running, open a second terminal:

```bash
cd frontend
bun install --frozen-lockfile
bun run dev --hostname 127.0.0.1
```

Open **http://localhost:3000**. Choose **Uploads → Choose files**, wait for **Ready**, then open the source or find its note under **All notes**.

See [frontend/README.md](frontend/README.md) for configuration, playback, exports, and stopping/restarting. The UI expects the API at `http://localhost:8000`; override `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if needed.

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
5. `GET /notes` and `GET /notes/{note_id}` expose one editable note per successful upload.
6. The independent intelligence worker discovers new and existing transcripts and indexes them.
7. `GET /notes/{note_id}/intelligence` reports indexing status, a separate AI summary, and related notes.
8. `GET /graph` returns stored edges; the UI updates automatically.

Existing notes are indexed automatically when intelligence is enabled. This adds derived records without rewriting titles, transcripts, saved edits, or Markdown exports. Set `ZK_INTELLIGENCE_ENABLED=false` to run ingestion and editing without Ollama. There is no semantic-search endpoint yet. See [the intelligence design and validation guide](backend/INTELLIGENCE.md).

PDFs must contain selectable text. Image-only/scanned PDFs need OCR, which is outside this version. Pasted text, `.txt`, Markdown, and Word uploads are not accepted.

See [backend/README.md](backend/README.md) for the frontend example, API contract, configuration, storage, testing, and local development.
