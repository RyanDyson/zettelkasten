# Backend and frontend integration

FastAPI + PostgreSQL + FFmpeg + local Whisper. The supported inputs are **PDF, audio, and video**. After text is stored, a separate durable worker performs local Ollama analysis and concept-based linking. See [INTELLIGENCE.md](INTELLIGENCE.md) for model setup, indexing, retries, and validation.

## Run with Docker

From the repository root:

```bash
cp -n .env.example .env
docker compose up -d --build
docker compose logs -f api
```

Swagger: **http://localhost:8000/docs**. OpenAPI JSON: **http://localhost:8000/openapi.json**. ReDoc: **http://localhost:8000/redoc**.

Open `POST /ingest` in Swagger, click **Try it out**, choose a file, and execute. Copy `source_id` into `GET /jobs/{source_id}`. Once `done`, call `GET /sources/{source_id}/transcript`.

The default multilingual Whisper model is `base`, running on CPU with int8. Model weights download on the first media job and persist in the `whisper-models` Docker volume. Speech is processed locally; there is no API key or hosted transcription service. Initial model download needs network access.

## Endpoint contract

| Method | Path | Result |
| --- | --- | --- |
| POST | `/ingest` | Multipart field `file`; 202 with `source_id`, `status`, and `poll` |
| GET | `/jobs/{source_id}` | Status, safe error message, notes, transcript URL |
| POST | `/jobs/{source_id}/retry` | Requeue a failed job; 202, or 409 if not failed |
| GET | `/sources?limit=50&offset=0&status=done` | Source metadata; optional status filter |
| GET | `/sources/{source_id}` | Source metadata and transcript URL |
| GET | `/sources/{source_id}/file` | Original uploaded file; supports byte ranges for media playback |
| GET | `/sources/{source_id}/transcript` | Full text stored in PostgreSQL |
| GET | `/sources/{source_id}/transcript/download` | Markdown attachment generated from database text |
| GET | `/notes?limit=50&offset=0` | Note metadata, newest first |
| GET | `/notes/{note_id}` | Note metadata, content, and saved editor blocks |
| POST | `/notes/{note_id}` | Save note content and editor blocks; original transcript is unchanged |
| GET | `/notes/{note_id}/intelligence` | Indexing status, summary, concepts, and related notes |
| POST | `/notes/{note_id}/intelligence/reindex` | Queue/retry original-transcript indexing; 202 |
| POST | `/intelligence/backfill` | Queue notes with no prior indexing job; safe to repeat |
| GET | `/intelligence/status` | Queue totals and intelligence worker health |
| GET | `/graph` | All notes and deduplicated stored edges |
| GET | `/health` | Database and worker availability; 200 or 503 |

List endpoints return arrays, accept `limit` from 1–100, and use zero-based `offset`. Timestamps are ISO 8601 UTC; the frontend should render the user's timezone (HKT for Leon).

Accepted extensions (case-insensitive):

- PDF: `.pdf`
- Audio: `.mp3`, `.wav`, `.m4a`, `.flac`, `.ogg`, `.aac`, `.opus`
- Video: `.mp4`, `.mkv`, `.webm`, `.mov`, `.avi`, `.m4v`

Extensions route processing; the PDF/media decoders validate actual contents. A renamed corrupt file is accepted into the queue and then fails processing. Video must contain an audio track. There is no OCR, image analysis, speaker diarization, URL ingestion, translation, or realtime transcription. PDF extraction preserves available text but cannot reconstruct every visual layout; text in scanned pages is omitted in mixed PDFs.

Example upload:

```bash
curl -F 'file=@/absolute/path/lecture.mp4' http://localhost:8000/ingest
```

```json
{"source_id":"8f8e013ff9f94e0eb3729c9c86900545","status":"queued","poll":"/jobs/8f8e013ff9f94e0eb3729c9c86900545"}
```

Example completed media transcript (IDs/timestamps are illustrative):

```json
{
  "source_id": "8f8e013ff9f94e0eb3729c9c86900545",
  "content": "Apples contain dietary fibre.",
  "language": "en",
  "duration_seconds": 3.2,
  "segments": [{"start": 0.0, "end": 3.2, "text": "Apples contain dietary fibre."}],
  "model": "base",
  "created_at": "2026-09-19T06:00:00Z"
}
```

For PDF extraction, `language`, `duration_seconds`, and `model` are null and `segments` is an empty array. Note content is the full extracted text, not a summary. Whisper output is machine transcription and can contain recognition errors.

Errors before queuing use `{"detail":"message"}`: 400 for empty uploads/invalid filenames, 413 for size limits, 415 for unsupported extensions, 404 for missing IDs, and 409 for unavailable transcripts or invalid retries. FastAPI validation errors use HTTP 422 with a `detail` array. After HTTP 202, processing errors appear as `status: "failed"` and `error` on the job; the polling request itself returns 200. Failed jobs retain the original file for manual retry.

## Frontend example

```typescript
const API = "http://localhost:8000";

export async function ingest(file: File, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", file);
  // The browser sets Content-Type and the multipart boundary.
  const upload = await fetch(`${API}/ingest`, { method: "POST", body: form, signal });
  if (!upload.ok) throw new Error(await upload.text());
  const { source_id, poll } = await upload.json();

  while (true) {
    const response = await fetch(`${API}${poll}`, { signal });
    if (!response.ok) throw new Error(await response.text());
    const job = await response.json();
    // Render job.status; there is no numeric progress percentage.
    if (job.status === "failed") throw new Error(job.error || "Processing failed");
    if (job.status === "done") {
      const transcript = await fetch(`${API}/sources/${source_id}/transcript`, { signal });
      if (!transcript.ok) throw new Error(await transcript.text());
      return await transcript.json();
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
```

Aborting the browser request stops polling; it does not cancel a job already accepted by the server. Polling can resume later using the source ID. CORS defaults to `http://localhost:3000` and `http://localhost:5173`; configure an explicit origin list in `ZK_CORS_ORIGINS` for other frontend addresses. Render uploaded content as text or sanitized Markdown, not trusted HTML.

## Storage and restart behavior

PostgreSQL is authoritative for **new extracted/transcribed content**. The additive `transcripts` table stores content, language, duration, segments, model, and creation time. Existing `sources`, `notes`, and `links` tables and data are retained. The pgvector extension also stores concept embeddings. Additive intelligence tables index existing transcripts without rewriting the notes. AI summaries and relations are separate from user content.

Files are stored as:

```text
raw/<source_id>.<extension>     original upload
transcripts/<source_id>.md     plain extracted/transcribed text
notes/<source_id>.md           same text with YAML title/source metadata
```

Within Docker this is `/data/zettelkasten` in the existing `zk-data` named volume. To use an ordinary host folder as an Obsidian vault, replace that volume mapping with an absolute host bind mount, for example `/Users/you/MyVault:/data/zettelkasten`. Existing named-volume files are not copied automatically. Local Python defaults to `~/zettelkasten`. Editing a Markdown export does not sync edits back into the database. Notes edited through the UI are saved in the additive `note_documents` table and update the note Markdown export; original transcripts remain unchanged.

There is one sequential ingestion worker and one independent sequential intelligence worker embedded in the API process. PostgreSQL holds the queue; queued or interrupted jobs are picked up after restart. A PostgreSQL advisory lock rejects a second API process using the same database. **Run one Uvicorn worker and one API instance**. The worker uses threads for blocking PDF/FFmpeg/Whisper processing, so polling stays responsive. Successful transcript, note metadata, and job completion are committed together. Stable note IDs avoid duplicate results on recovery. Temporary WAV files are removed after success or failure. Interrupted jobs may be transcribed again.

Shutdown attempts to finish current processing. Docker allows 30 seconds before terminating; unfinished jobs recover on next startup. Keep PostgreSQL and file volumes together when backing up. `docker compose down` preserves volumes; `docker compose down -v` deletes them.

This version is a local, single-user service with no authentication. Compose binds exposed ports to loopback. There is no upload deduplication or automatic retention cleanup.

## Configuration

Copy the root `.env.example` to `.env`. For local Python, settings load `.env` from the current working directory.

| Setting | Default | Purpose |
| --- | --- | --- |
| `ZK_POSTGRES_PORT` | 5432 (example: 5433) | Host database port in Compose |
| `ZK_API_PORT` | 8000 | Host API port in Compose |
| `ZK_DATABASE_URL` | `postgresql+asyncpg://zk:zk@localhost:5432/zk` | Local API database URL; Compose sets internal URL |
| `ZK_DATA_DIR` | `~/zettelkasten` | Local file storage; Compose uses `/data/zettelkasten` |
| `ZK_WHISPER_MODEL` | `base` | Multilingual model name or local model directory |
| `ZK_WHISPER_DEVICE` | `cpu` | Inference device (GPU setup is not configured by Compose) |
| `ZK_WHISPER_COMPUTE_TYPE` | `int8` | Inference precision |
| `ZK_WHISPER_CACHE_DIR` | Library default | Model cache; Compose uses `/models` |
| `ZK_MAX_UPLOAD_MB` | 100 | Per-file binary MiB limit; request limit adds 1 MiB multipart overhead |
| `ZK_MAX_MEDIA_SECONDS` | 7200 | Maximum media length; oversized media fails instead of truncating |
| `ZK_MAX_PDF_PAGES` | 1000 | Maximum PDF page count |
| `ZK_MAX_TEXT_CHARS` | 1000000 | Maximum extracted text/transcript characters |
| `ZK_FFMPEG_TIMEOUT_SECONDS` | 600 | Audio extraction timeout |
| `ZK_CORS_ORIGINS` | localhost ports 3000/5173 | JSON array of allowed frontend origins |
| `ZK_WORKER_POLL_SECONDS` | 1 | Database queue polling interval |
| `ZK_INTELLIGENCE_ENABLED` | true | Run background indexing, including existing transcripts |
| `ZK_OLLAMA_BASE_URL` | localhost:11434 (Compose: host.docker.internal:11434) | Local model server |
| `ZK_LLM_MODEL` | qwen2.5:7b | Summary/concept model |
| `ZK_EMBED_MODEL` | nomic-embed-text | Must output 768 dimensions |
| `ZK_INTELLIGENCE_CHUNK_CHARS` | 3000 | Split all source text into bounded chunks |
| `ZK_INTELLIGENCE_TIMEOUT_SECONDS` | 180 | Per-model-request timeout |
| `ZK_INTELLIGENCE_RELATION_THRESHOLD` | 0.75 | Minimum shared-concept relation score |
| `ZK_INTELLIGENCE_SEMANTIC_THRESHOLD` | 0.92 | Conservative same-concept vector matching |

Compose passes the commonly changed settings shown in its `environment` block. Add other settings to that block to override them in Docker. With the configured limits, media conversion may temporarily use roughly 230 MB for a two-hour mono WAV; allow disk space for originals, exports, and model weights.

## Local Python development

Python 3.11 is the tested runtime. Install FFmpeg on the host and start PostgreSQL:

```bash
# Run from the repository root.
cp -n .env.example .env
docker compose up -d db
python3.11 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
# macOS: brew install ffmpeg
# Ubuntu/Debian: sudo apt-get install ffmpeg
.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Stop the Docker API before starting a local API against the same database.

## Tests

```bash
# Uses the existing PostgreSQL server on 5433, but creates/drops a unique test DB.
ZK_TEST_ADMIN_URL=postgresql://zk:zk@localhost:5433/postgres \
  .venv/bin/python -m pytest -q backend/tests
```

The test database role needs `CREATEDB`. Tests use a temporary storage directory and never clear the application database. They cover actual PDF parsing and database persistence, upload validation, retries, recovery, CORS, OpenAPI, and responsive polling. Media inference is stubbed in the fast integration suite; real FFmpeg/Whisper smoke testing is a separate runtime check.

Technical references: [FastAPI file uploads](https://fastapi.tiangolo.com/tutorial/request-files/), [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

### Note management

- `PATCH /notes/{id}` with `{ "title": "New title" }` renames a note and its
  Markdown title metadata without changing content, blocks, or the source.
  Titles are trimmed, limited to 200 characters, and cannot contain control characters.
- `DELETE /notes/{id}` removes the note, Markdown export, saved document,
  intelligence job/result, and incoming/outgoing links. Original source files and
  transcripts are retained. Missing notes return 404. Background intelligence
  work checks the note still exists before persisting results.
