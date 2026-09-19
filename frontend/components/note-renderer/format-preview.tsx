"use client";

import type { PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function PreviewDocument({ blocks }: { blocks: PartialBlock[] }) {
  const editor = useCreateBlockNote({ initialContent: blocks });
  return (
    <BlockNoteView
      editor={editor}
      editable={false}
      theme="light"
      formattingToolbar={false}
      sideMenu={false}
      className="note-editor"
    />
  );
}

export function FormatPreview({
  kind,
  original,
  formatted,
  onApply,
  onClose,
}: {
  kind: "format" | "layout";
  original: PartialBlock[];
  formatted: PartialBlock[];
  onApply: () => void;
  onClose: () => void;
}) {
  const [version, setVersion] = useState<"formatted" | "original">("formatted");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[85dvh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle>{kind === "layout" ? "Line-break preview" : "Formatting preview"}</DialogTitle>
          <DialogDescription>
            {kind === "layout" ? "Joins sentence fragments while keeping your words, bold, highlights, links, and media." : "Same words, clearer structure. Existing rich formatting, links, and media are preserved."} Apply to your draft, then save when ready.
          </DialogDescription>
        </DialogHeader>
        <div
          className="flex gap-1 self-start rounded-lg bg-muted p-1"
          aria-label="Preview version"
        >
          <Button
            size="sm"
            variant={version === "formatted" ? "secondary" : "ghost"}
            aria-pressed={version === "formatted"}
            onClick={() => setVersion("formatted")}
          >
            {kind === "layout" ? "Repaired" : "Formatted"}
          </Button>
          <Button
            size="sm"
            variant={version === "original" ? "secondary" : "ghost"}
            aria-pressed={version === "original"}
            onClick={() => setVersion("original")}
          >
            Original
          </Button>
        </div>
        <div
          className="min-h-0 overflow-y-auto border-y py-6 px-3"
          aria-label={`${version} preview`}
        >
          <PreviewDocument
            key={version}
            blocks={version === "formatted" ? formatted : original}
          />
        </div>
        <DialogFooter className="m-0 border-0 bg-transparent p-0 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gradient_primary" onClick={onApply}>
            Apply to draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
