# Zettelkasten frontend

Next.js UI connected to the FastAPI ingestion backend. Uses the existing sidebar, cards, blue accents, graph canvas, and Notes/Source tabs with real database content.

## Run locally

Start Docker Desktop. From the repository root, start the API and database:

```bash
# First setup only; preserve an existing .env.
cp -n .env.example .env
docker compose up -d --build
```

In another terminal:

```bash
cd frontend
bun install --frozen-lockfile
# Optional: defaults to http://localhost:8000 without a config file.
cp -n .env.example .env.local
bun run dev --hostname 127.0.0.1
```

Open **http://localhost:3000**. Use this exact hostname; the backend's default CORS settings allow `http://localhost:3000`. Opening `http://127.0.0.1:3000` instead requires adding that origin to `ZK_CORS_ORIGINS` in the root `.env` and recreating the API container.

Requires Bun (the repo declares Bun 1.3.9; tested with 1.3.10), Node.js 20.9 or newer, and Docker Compose. FFmpeg and PostgreSQL run inside Docker, so host installations are unnecessary. Swagger remains at **http://localhost:8000/docs**.

## Use the app

1. Select **Uploads** or **Add source**.
2. Choose files or drag them into the upload area. You can select multiple PDFs, audio files, and videos; each is uploaded separately.
3. Upload history updates automatically: **Queued → Processing → Ready**, or **Failed**.
4. Open a source to read extracted text, play its original audio/video, export Markdown, or retry failed processing.
5. Open **All notes** to search note titles and select a saved note. The **Source & transcript** tab contains the original recording and timestamped transcript. Select **Show timestamps**, then click a segment to seek playback.
6. The **Graph** displays the real notes. Click a node to open one. Connections appear as the independent local indexing worker finishes. A floating status pill shows pending work or failures.

Unfinished notes move to the top of the left-hand lists with an **Editing** label. You can navigate freely: drafts, including formatting, stay in this browser tab and survive refreshes using session storage. Click **Save note** to persist them to the backend and remove the label; save before closing the tab. Browser drafts are not shared between tabs or devices.

Refreshing the page reloads persisted records from the backend and restores any draft for the current tab. Notes use the BlockNote editor: edit text or formatting, then click **Save note**. Edits are stored in PostgreSQL separately from the original transcript, and remain after refreshing. The **Source & transcript** tab and its export still show the original extracted text. Below the editor, **Related notes** shows connections, indexing status, a retry/refresh action, and an expandable AI summary. These use the original source transcript, so editing or drafting a note does not rewrite its analysis. Deleting, archiving, and folder management are not implemented by this backend. The UI does not simulate those features or show invented connections. Search currently matches titles, not transcript contents.

PDFs must contain selectable text (no OCR). Default backend limits are 100 MiB per file, 1,000 PDF pages, and two hours for media. Limits are enforced by the backend. Some accepted codecs/containers (such as MKV) cannot play in every browser; use **Original file** to open the recording in a compatible player. Transcription can still succeed even when the browser cannot play the source.

## Configuration

`frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
```

This is the URL the **browser** uses to reach FastAPI, not an internal Docker hostname. Restart Next.js after changing it; production builds must be rebuilt when it changes. If the API port changes, update this value. If the frontend port changes, also update the backend's `ZK_CORS_ORIGINS`. There are no database credentials in the frontend.

Requests go directly to FastAPI, so file uploads do not pass through Next.js request-size limits. The frontend polls shared source and note queries and loads all pages of the backend's paginated lists. Job/transcript errors remain visible and can be retried.

## Stop and restart

- **Stop the UI:** press Ctrl+C in its terminal.
- **Stop the backend:** run `docker compose stop` from the repository root.
- **Resume:** run `docker compose up -d`, then `cd frontend && bun run dev --hostname 127.0.0.1`.
- Database and upload volumes persist. Do not use `docker compose down -v` unless you intend to delete stored data.

For a production build on your local machine:

```bash
bun run build
bun run start --hostname 127.0.0.1
```

Run build/start instead of the development server, not at the same time on port 3000.

## Checks

```bash
bun run lint
bun test
bun run build
```

API-client tests cover file validation, pagination, backend errors, connection failures, and multipart uploads. Backend tests also cover the original-file endpoint and byte-range requests used by media playback.

### Readable notes and local formatting

PDF text and audio/video transcription segments flow into paragraphs instead of
one editor block per printed line or speech segment. Saved edits and existing
drafts retain their layout until you apply a preview. Use **Fix line breaks** to
repair those existing notes: compare **Repaired** and **Original**, then **Apply to
draft** and **Save note**. This preserves your words, bold, highlights, and links
and works without the local model. Intentional structural boundaries remain. Named concepts shared with other notes appear
as subtle blue highlights; click one (or focus it and press Enter) to choose a
connected note. These highlights are derived, so they do not change your draft,
saved text, or source transcript.

**Format note** also repairs sentence fragments before adding formatting. Use it to ask the configured local model for a formatting preview.
Compare **Formatted** and **Original**, then **Apply to draft** or **Cancel**.
Applying is undoable; **Save note** persists it. The formatter preserves original
words and existing rich blocks, links, media, and manually styled text. The source
transcript remains available unchanged under **Source & transcript**.

### Rename or delete a note

Right-click a note in **All notes** or **Recent notes** to choose **Rename** or
**Delete**. Renaming keeps saved content and unsaved drafts. Deletion asks for
confirmation, removes the note and its connections, clears its draft in the
current tab, and returns to All notes if that note was open. The original upload
and transcript remain available in Uploads.
