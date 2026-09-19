import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, listAll, request, uploadFile, validateUpload } from "./api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("validates supported files and empty uploads", () => {
  for (const name of ["paper.PDF", "voice.opus", "video.m4v", "audio.MP3"])
    assert.equal(validateUpload({ name, size: 12 }), null);
  assert.match(
    validateUpload({ name: "notes.docx", size: 12 })!,
    /supported format/,
  );
  assert.match(validateUpload({ name: "notes.pdf", size: 0 })!, /empty/);
});

test("loads every page of notes", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    return Response.json(
      urls.length === 1
        ? Array.from({ length: 100 }, (_, id) => ({ id }))
        : [{ id: 100 }],
    );
  }) as typeof fetch;
  assert.equal((await listAll("/notes")).length, 101);
  assert.match(urls[1], /offset=100/);
});

test("preserves backend errors and validation messages", async () => {
  globalThis.fetch = (async () =>
    Response.json(
      { detail: "Only failed jobs can be retried." },
      { status: 409 },
    )) as typeof fetch;
  await assert.rejects(
    request("/jobs/1/retry"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 409 &&
      error.message.includes("failed jobs"),
  );
  globalThis.fetch = (async () =>
    Response.json(
      { detail: [{ msg: "File is required" }] },
      { status: 422 },
    )) as typeof fetch;
  await assert.rejects(request("/ingest"), /File is required/);
});

test("network failure provides an actionable error", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  await assert.rejects(request("/notes"), /Cannot reach the backend/);
});

test("uploads a multipart file without overriding the browser boundary", async () => {
  globalThis.fetch = (async (_, options) => {
    assert.equal(options?.method, "POST");
    assert.ok(options?.body instanceof FormData);
    assert.equal((options.body.get("file") as File).name, "test.pdf");
    assert.equal(options.headers, undefined);
    return Response.json(
      { source_id: "source-1", status: "queued", poll: "/jobs/source-1" },
      { status: 202 },
    );
  }) as typeof fetch;
  const result = await uploadFile(new File(["test"], "test.pdf"));
  assert.equal(result.source_id, "source-1");
});
