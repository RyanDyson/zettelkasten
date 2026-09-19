# Local intelligence integration

Implemented on top of master, adapting the summary/concept/embedding ideas from `llm-backend` (`0307bd7`). The older branch's ingestion worker, file-backed transcript reads, and playground frontend are not substituted for the current app.

## Run

On this Mac, use the host Ollama app for local inference. Models are downloaded once:

```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

Start Ollama before indexing. Docker Compose connects to `http://host.docker.internal:11434`; a local Python API defaults to `http://localhost:11434`. No duplicate Ollama container is started. The model endpoint can be changed with `ZK_OLLAMA_BASE_URL`.

From this worktree's root, use an existing `.env` or `cp -n .env.example .env`, then `docker compose up -d --build`. **When upgrading the existing installation from a differently named worktree, use `docker compose -p zettelkasten --env-file /Users/leonwork/zettelkasten/.env up -d --build` to retain the existing named volumes.** Back up the PostgreSQL and file volumes before an upgrade. Starting Compose under a different project name creates a separate library.

Start the frontend with `cd frontend && bun install --frozen-lockfile && bun run dev --hostname 127.0.0.1`. UI: http://localhost:3000. Swagger: http://localhost:8000/docs.

## Behavior and preservation

- PDF/audio/video processing is unchanged. Source `done` still means the transcript and editable note are ready.
- Intelligence has its own persisted `queued → processing → done/failed` state and attempts counter. Failure never changes source status, transcript, title, editor blocks, drafts, or Markdown exports.
- Existing and newly committed transcripts are discovered idempotently. An interrupted intelligence job is resumed after restart; failed jobs wait for an explicit retry.
- Indexing uses **original PostgreSQL transcripts**, not unsaved drafts or saved note edits. AI summaries are separate derived data. The UI renders links by stable note IDs; it does not replace source phrases with wiki-link markup.
- Reindexing replaces only that note's derived concepts and relations in a transaction. A failed refresh retains the previous successful summary and links.
- Disabling intelligence leaves ingestion and editing available, with existing connections still readable.
- The original `links` table and any legacy records remain intact. `/graph` combines those links with the new derived links, deduplicates reciprocal pairs, and omits self/missing-node edges.

## Additive schema

Startup creates missing tables after installing the vector extension. Existing tables/columns are not dropped or altered. This is an additive migration using the existing `Base.metadata.create_all` mechanism; repeated startup is safe. Future changes to these new tables require explicit schema migrations rather than relying on `create_all` to alter columns.

| Table | Purpose |
| --- | --- |
| `intelligence_jobs` | One durable indexing job per existing note |
| `note_intelligence` | Separate summary, model names, pipeline version, input hash, chunk count |
| `intelligence_concepts` | Normalized concepts, merged aliases, 768-dimensional embeddings |
| `note_concepts` | Many-to-many note/concept associations, original mentions and confidence |
| `intelligence_links` | One undirected note pair with score and shared-concept evidence |

All note associations have cascading foreign keys. Concept ownership is never moved from an older note to a newer one. Legacy `concept_index` data, if present from an experimental LLM installation, is not trusted or imported automatically; backfill recomputes associations from master's stored transcripts.

## Analysis and matching

Every character of the transcript is included in sequential bounded chunks (3,000 characters by default). There is no first-4,000-character cutoff. Each chunk produces a validated factual summary and up to 12 requested specific concepts directly from the source. Mentions must occur in the source chunk; ungrounded and low-confidence candidates are discarded. Chunk summaries are combined in order, so a long document's AI summary may consist of several paragraphs rather than one global executive summary.

Concepts resolve by normalized name, stored/new aliases, then conservative vector similarity (default 0.92, same embedding model). The same canonical concept can be associated with arbitrarily many notes. One strong shared concept can link a narrow apple note to a broad fruit note. Relation score is the highest minimum confidence shared by both notes, plus 0.03 for each additional shared concept, capped at 1. It is a heuristic, **not a calibrated probability**.

The model can still miss concepts or suggest imperfect synonyms. Review related-note labels as suggestions; they are not evidence that two source claims are factually equivalent. Current evaluation covers small English fixtures; large-vault retrieval quality and multilingual accuracy need broader evaluation. This version has no semantic-search API or inline automatic wiki-link editor extension.

Embeddings are generated once per unique concept per indexing run. Exact searches use canonical names/aliases; semantic fallback uses pgvector cosine distance. Vector search currently uses exact ordering without an approximate index, appropriate for the small local vault. Large libraries will need measured query/index work. All indexing is sequential to limit local model load; long transcripts take longer but do not block uploads or UI requests.

## API

- `GET /notes/{id}/intelligence`: current job status, error, summary, concept names, related notes, last successful model/time/chunk count. Old result remains available during refresh/failure.
- `POST /notes/{id}/intelligence/reindex`: 202 with `{ "queued": 1 }`; already pending jobs return `{ "queued": 0 }`. Disabled indexing or unavailable transcript returns 409.
- `POST /intelligence/backfill`: queue notes with transcripts and no job. Does not repeatedly retry failed jobs or create duplicate notes. The worker also performs this discovery automatically.
- `GET /intelligence/status`: enabled flag, actual worker health, queued/processing/done/failed counts, unindexed count.
- `GET /graph`: nodes retain current note IDs, titles, timestamps, and source IDs. Edges provide `src_id`, `dst_id`, `weight`, `kind`, and shared `concepts`.

`/health` retains its ingestion/database contract. Inspect `/intelligence/status` separately when diagnosing local model processing. For model errors, start Ollama/install the configured models and use **Retry indexing** under the note. There is no silent heuristic fallback pretending inference succeeded.

## Validation

Backend automated tests use a unique disposable database, fake model output for lifecycle/persistence tests, and mocked Ollama HTTP for validation/outage/chunking checks:

```bash
cd backend
ZK_TEST_ADMIN_URL=postgresql://zk:zk@localhost:5433/postgres python -m pytest -q
```

They cover master's ingestion/editor behavior, many-to-many associations, unrelated notes, additive upgrade preservation, repeated backfill/reindex, independent failure/retry, retained prior results, and interrupted-job recovery. Real Ollama inference is verified separately; automated tests do not download or call models.

Frontend:

```bash
cd frontend
bun run lint
bunx next typegen
bunx tsc --noEmit
bun test
bun run build
```

## Note layout and formatting previews

Notes without saved edits receive readable initial editor blocks from `note_layout.py`.
Audio/video transcription segments flow within paragraphs, retaining blank-line boundaries.
Wrapped lines become flowing paragraphs; blank paragraphs, explicit list markers,
Markdown headings/quotes and obvious standalone headings retain their structure.
This is a conservative text heuristic, not PDF layout/OCR reconstruction. Saved
blocks, original transcripts and source files are never rewritten by this step.

`GET /notes/{id}/intelligence` also returns `mentions`: named concepts and aliases
with their related-note destinations. Source evidence may be entire sentences, so
it is deliberately excluded from the highlight terms. The editor draws temporary,
case-insensitive, whole-term decorations, including phrases across styled text.
They refresh with connections and edits and are not stored in the note's content.
Click or keyboard-activate a highlight to choose a connected note; titles matching
the concept appear first.

`POST /notes/{id}/format-preview` accepts `{ "blocks": [...] }` from the current
draft and returns a proposed block document without writing to the database or
vault. It uses the configured local Ollama model. The model chooses groups of
immutable sentence units and exact phrases for bold/yellow emphasis. The server
constructs the output from original text, enforces complete ordered coverage,
bounds unit IDs in the output schema, and retries an invalid plan once. Failure
returns an explicit error with no partial result. Before formatting, conservative
line-break repair joins paragraph fragments, including styled fragments. Unsupported
blocks, links, media, nesting and existing manual styles are preserved. Requests are limited to
1,000 blocks and 120,000 JSON characters; larger requests fail explicitly.

The UI offers Original/Formatted previews, Cancel, and Apply to draft. Apply uses
the editor's undo history and checks that the preview still matches the current
draft. The separate Save note action persists the result through the existing API.
Formatting does not invent headings or turn ordinary prose into quotations.

`POST /notes/{id}/layout-preview` repairs the current draft without calling Ollama,
even when intelligence is disabled. **Fix line breaks** exposes this read-only
preview for existing notes and drafts. It joins likely lowercase sentence
continuations and soft wraps, preserving inline marks and links. Sentence endings,
blank blocks, headings/lists/quotes/code/media, nested blocks, and different block
styles remain boundaries. This heuristic can miss ambiguous breaks; users review
the proposal before applying. Neither preview changes saved notes or transcripts.
