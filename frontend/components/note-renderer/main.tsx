"use client";

import "@blocknote/shadcn/style.css";

import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/shadcn";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

type NoteRendererProps = {
  markdownFile?: string;
};

function resolveLinkTarget(href: string): string {
  const decodedHref = decodeURIComponent(href);
  const url = new URL(decodedHref, window.location.origin);
  if (url.origin !== window.location.origin) return url.toString();
  const pathname = url.pathname;
  if (!pathname.endsWith(".md")) return pathname;
  const noteName = pathname.split("/").pop()?.replace(/\.md$/, "") ?? "";
  return `/notes/${encodeURIComponent(noteName)}`;
}

export function NoteRenderer({ markdownFile }: NoteRendererProps) {
  const file = markdownFile ?? "temp-note.md";
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editors, setEditors] = useState<BlockNoteEditor | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let text: string | null = null;
      let lastError: unknown = null;
      try {
        const res = await fetch(`/${file}`);
        if (res.ok) {
          text = await res.text();
        }
      } catch (err) {
        lastError = err;
      }
      if (text === null && file !== "temp-note.md") {
        try {
          const res = await fetch("/temp-note.md");
          if (res.ok) {
            text = await res.text();
            setError(`Note "${file}" not found — showing temp-note.md`);
          }
        } catch (err) {
          lastError = err;
        }
      }
      if (cancelled) return;
      if (text === null) {
        setError(
          `Could not load note: ${
            lastError instanceof Error ? lastError.message : "unknown error"
          }`,
        );
      } else {
        setMarkdown(text);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    if (markdown == null) return;
    const create = async () => {
      const ed = BlockNoteEditor.create({
        links: {
          HTMLAttributes: {
            class: "cursor-pointer text-primary underline underline-offset-2",
          },
          onClick: (_event, clickedEditor) => {
            const href = clickedEditor.getSelectedLinkUrl();
            if (!href) return false;
            window.location.assign(resolveLinkTarget(href));
            return true;
          },
        },
      });
      const blocks = await ed.tryParseMarkdownToBlocks(markdown);
      ed.replaceBlocks(ed.document, blocks);
      setEditors(ed);
    };
    void create();
    return () => {
      setEditors(null);
    };
  }, [markdown]);

  if (error) {
    return <div className="p-4 text-sm text-muted-foreground">{error}</div>;
  }

  if (!editors || markdown === null) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading note…</div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col">
      <BlockNoteView
        editor={editors}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        editable
        className="min-h-0 flex-1 overflow-y-auto p-4 pt-8"
      />
    </div>
  );
}
