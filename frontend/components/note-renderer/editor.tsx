"use client";

import "@blocknote/shadcn/style.css";
import type { Block, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { noteDrafts, useNoteDrafts } from "@/hooks/use-note-drafts";

export type EditedNote = { content: string; blocks: Block[] };

export default function NoteEditor({
  noteId,
  content,
  blocks,
  onSave,
}: {
  noteId: string;
  content: string;
  blocks?: PartialBlock[] | null;
  onSave?: (document: EditedNote) => Promise<void>;
}) {
  const { drafts, storageFailed } = useNoteDrafts();
  const [initialDraft] = useState(
    () => noteDrafts.getSnapshot().drafts[noteId],
  );
  const editor = useCreateBlockNote({
    initialContent:
      initialDraft?.blocks ??
      (blocks?.length
        ? blocks
        : content
            .split("\n")
            .map((line) => ({ type: "paragraph" as const, content: line }))),
  });
  const savedDocument = useRef(
    initialDraft?.baseline ?? JSON.stringify(editor.document),
  );
  const dirty = !!drafts[noteId];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function trackChanges() {
    const blocks = editor.document;
    const serialized = JSON.stringify(blocks);
    if (serialized === savedDocument.current) {
      noteDrafts.clear(noteId);
    } else if (
      serialized !==
      JSON.stringify(noteDrafts.getSnapshot().drafts[noteId]?.blocks)
    ) {
      noteDrafts.set(noteId, {
        blocks,
        baseline: savedDocument.current,
        updatedAt: Date.now(),
      });
    }
  }

  async function save() {
    if (!onSave || saving) return;
    setSaving(true);
    setError(null);
    const snapshot = JSON.stringify(editor.document);
    try {
      await onSave({
        content: editor.blocksToMarkdownLossy(),
        blocks: editor.document,
      });
      savedDocument.current = snapshot;
      noteDrafts.clear(noteId, snapshot);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save this note.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {onSave && (
        <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <span role="status">
            {saving
              ? "Saving…"
              : dirty
                ? "Editing · Draft kept in this tab"
                : "Saved"}
          </span>
          <Button
            variant="gradient_primary"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            Save note
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {dirty && storageFailed && (
        <p role="status" className="text-sm text-destructive">
          Browser storage is unavailable. You can switch notes, but save before
          refreshing or closing this tab.
        </p>
      )}
      <BlockNoteView
        editor={editor}
        theme="light"
        editable={!saving}
        onChange={trackChanges}
        className="min-h-64 [&_.bn-editor]:px-0"
      />
    </div>
  );
}
