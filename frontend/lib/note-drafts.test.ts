import { test } from "node:test";
import assert from "node:assert/strict";
import type { Block } from "@blocknote/core";
import { createDraftStore, draftsFirst, type NoteDraft } from "./note-drafts";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } as Storage;
}
function draft(text: string, updatedAt = 1): NoteDraft {
  return {
    blocks: [
      {
        id: "block",
        type: "paragraph",
        content: [{ type: "text", text, styles: { bold: true } }],
        children: [],
        props: {
          backgroundColor: "default",
          textColor: "default",
          textAlignment: "left",
        },
      },
    ] as Block[],
    baseline: "original",
    updatedAt,
  };
}

test("multiple drafts and formatting survive store recreation after a refresh", () => {
  const disk = storage();
  const store = createDraftStore(() => disk, "drafts");
  store.set("one", draft("First note"));
  store.set("two", draft("Second note", 2));
  const restored = createDraftStore(() => disk, "drafts");
  assert.deepEqual(restored.getSnapshot().drafts, store.getSnapshot().drafts);
  assert.equal(restored.getSnapshot().drafts.one.baseline, "original");
});

test("drafts move above saved notes without mutating their original order", () => {
  const notes = [
    { id: "saved" },
    { id: "older" },
    { id: "newer" },
    { id: "saved2" },
  ];
  const drafts = { older: draft("one", 1), newer: draft("two", 2) };
  assert.deepEqual(
    draftsFirst(notes, drafts).map((n) => n.id),
    ["newer", "older", "saved", "saved2"],
  );
  assert.equal(notes[0].id, "saved");
});

test("successful save clears only matching draft and preserves newer edits", () => {
  const disk = storage();
  const store = createDraftStore(() => disk, "drafts");
  const original = draft("first");
  store.set("one", original);
  store.set("two", draft("other note"));
  store.set("one", draft("new edit"));
  store.clear("one", JSON.stringify(original.blocks));
  assert.ok(store.getSnapshot().drafts.one);
  store.clear("one", JSON.stringify(draft("new edit").blocks));
  assert.deepEqual(
    Object.keys(createDraftStore(() => disk, "drafts").getSnapshot().drafts),
    ["two"],
  );
});

test("unavailable storage still retains drafts in memory for navigation", () => {
  const store = createDraftStore(() => {
    throw new Error("quota");
  }, "drafts");
  store.set("one", draft("keep this"));
  assert.deepEqual(store.getSnapshot().drafts.one, draft("keep this"));
  assert.equal(store.getSnapshot().storageFailed, true);
});
