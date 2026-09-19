"use client";

import "@blocknote/shadcn/style.css";
import type { Block, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Sparkles, WrapText } from "lucide-react";
import { request, type ConceptMention } from "@/lib/api";
import { rankedMentionNotes } from "@/lib/note-mentions";
import { NoteMentions } from "./mention-extension";
import { FormatPreview } from "./format-preview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { noteDrafts, useNoteDrafts } from "@/hooks/use-note-drafts";

const NO_MENTIONS: ConceptMention[] = [];

export type EditedNote = { content: string; blocks: Block[] };

const AUTOSAVE_MS = 1500;

export default function NoteEditor({
  noteId,
  content,
  blocks,
  onSave,
  mentions = NO_MENTIONS,
  formattingEnabled = false,
}: {
  noteId: string;
  content: string;
  blocks?: PartialBlock[] | null;
  onSave?: (document: EditedNote) => Promise<void>;
  mentions?: ConceptMention[];
  formattingEnabled?: boolean;
}) {
  const { drafts, storageFailed } = useNoteDrafts();
  const [initialDraft] = useState(
    () => noteDrafts.getSnapshot().drafts[noteId],
  );
  const [activeMention, setActiveMention] = useState<ConceptMention | null>(
    null,
  );
  const editor = useCreateBlockNote({
    extensions: [NoteMentions({ onOpen: setActiveMention })],
    initialContent:
      initialDraft?.blocks ??
      (blocks?.length
        ? blocks
        : content
            .split("\n")
            .map((line) => ({ type: "paragraph" as const, content: line }))),
  });
  useEffect(() => {
    editor.getExtension(NoteMentions)?.setMentions(mentions);
  }, [editor, mentions]);
  const savedDocument = useRef(
    initialDraft?.baseline ?? JSON.stringify(editor.document),
  );
  const dirty = !!drafts[noteId];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formatting, setFormatting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    original: Block[];
    formatted: PartialBlock[];
    snapshot: string;
    kind: "format" | "layout";
  } | null>(null);
  const formatRequest = useRef<AbortController | null>(null);
  useEffect(() => () => formatRequest.current?.abort(), []);

  async function format(kind: "format" | "layout" = "format") {
    if (saving || formatting) return;
    const original = structuredClone(editor.document);
    const snapshot = JSON.stringify(original);
    const controller = new AbortController();
    formatRequest.current = controller;
    setFormatting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await request<{ blocks: PartialBlock[]; repaired_breaks: number }>(
        `/notes/${encodeURIComponent(noteId)}/${kind}-preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocks: original }),
          signal: controller.signal,
        },
      );
      if (!controller.signal.aborted) {
        if (kind === "layout" && result.repaired_breaks === 0)
          setNotice("No broken line breaks found.");
        else setPreview({ original, formatted: result.blocks, snapshot, kind });
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "Could not format this note.",
        );
    } finally {
      if (formatRequest.current === controller) {
        formatRequest.current = null;
        setFormatting(false);
      }
    }
  }

  function applyFormatting() {
    if (!preview) return;
    if (JSON.stringify(editor.document) !== preview.snapshot) {
      setError(
        "Your note changed while the preview was open. Generate a new preview to keep your edits.",
      );
      setPreview(null);
      return;
    }
    editor.replaceBlocks(editor.document, preview.formatted);
    trackChanges();
    setPreview(null);
  }

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
    if (!onSave || saving || formatting || preview) return;
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
      if (noteDrafts.getSnapshot().drafts[noteId]) {
        // Changes happened while saving failed; retry shortly.
        setTimeout(() => void save(), AUTOSAVE_MS);
      }
    } finally {
      setSaving(false);
    }
  }

  const saveRef = useRef(save);
  saveRef.current = save;
  const draft = drafts[noteId];
  useEffect(() => {
    if (!onSave || !draft) return;
    const timer = setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [onSave, noteId, draft]);

  useEffect(() => {
    if (!onSave || !dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [onSave, dirty]);

  return (
    <div className="space-y-4">
      {onSave && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={saving || formatting}
              onClick={() => void format("layout")}
            >
              <WrapText className="size-3.5" />
              Fix line breaks
            </Button>
            {formattingEnabled && (
              <Button
                variant="ghost"
                size="sm"
                disabled={saving || formatting}
                onClick={() => void format()}
              >
                {formatting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {formatting ? "Preparing preview…" : "Format note"}
              </Button>
            )}
            {formatting && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => formatRequest.current?.abort()}
              >
                Cancel
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span role="status">
              {saving
                ? "Saving…"
                : dirty || error
                  ? "Auto-saving…"
                  : "All changes saved"}
            </span>
            <Button
              variant="gradient_primary"
              size="sm"
              disabled={!dirty || saving || formatting}
              onClick={() => void save()}
            >
              Save note
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {dirty && storageFailed && (
        <p role="status" className="text-sm text-destructive">
          Browser storage is unavailable. You can switch notes, but save before
          refreshing or closing this tab.
        </p>
      )}
      <BlockNoteView
        editor={editor}
        theme="light"
        editable={!saving && !formatting && !preview}
        onChange={trackChanges}
        className="note-editor min-h-48"
      />
      {preview && (
        <FormatPreview
          kind={preview.kind}
          original={preview.original}
          formatted={preview.formatted}
          onApply={applyFormatting}
          onClose={() => setPreview(null)}
        />
      )}
      <Dialog
        open={!!activeMention}
        onOpenChange={(open) => {
          if (!open) setActiveMention(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-8">{activeMention?.concept}</DialogTitle>
            <DialogDescription>
              Connected notes that discuss this concept.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {activeMention &&
              rankedMentionNotes(activeMention).map((note) => (
                <Link
                  key={note.note_id}
                  href={`/notes/${encodeURIComponent(note.note_id)}`}
                  onClick={() => setActiveMention(null)}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-accent"
                >
                  <span className="min-w-0 break-words">{note.title}</span>
                  <ArrowUpRight className="size-4 shrink-0 text-primary" />
                </Link>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
