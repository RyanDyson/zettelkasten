"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, type FocusEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, LoaderCircle, Pencil } from "lucide-react";
import { request, type NoteDetail } from "@/lib/api";
import { GradientTabs } from "@/components/ui/gradient-tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNote, useSource, useTranscript } from "@/hooks/use-vault";
import { MediaRenderer } from "@/components/media-renderer/main";
const NoteEditor = dynamic(() => import("@/components/note-renderer/editor"), {
  ssr: false,
  loading: () => <LoadingState>Loading editor…</LoadingState>,
});
import { ErrorState, LoadingState } from "@/components/request-state";
import { formatDate } from "@/lib/dates";

export function NoteDetailView({ id }: { id: string }) {
  const [tab, setTab] = useState("notes");
  const [editingTitle, setEditingTitle] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const queryClient = useQueryClient();
  const note = useNote(id);
  const source = useSource(note.data?.source_id ?? null);
  const transcript = useTranscript(
    note.data?.source_id ?? null,
    !!source.data?.transcript_url,
  );
  if (note.isPending) return <LoadingState>Loading note…</LoadingState>;
  if (note.error)
    return <ErrorState error={note.error} retry={() => void note.refetch()} />;
  if (!note.data) return null;
  async function saveTitle(event: FocusEvent<HTMLInputElement>) {
    const title = event.target.value.trim();
    if (!title || title === note.data?.title) {
      if (!title) event.target.value = note.data?.title ?? "";
      setEditingTitle(false);
      return;
    }
    const element = event.target;
    setSavingTitle(true);
    try {
      const saved = await request<NoteDetail>(
        `/notes/${encodeURIComponent(id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content: note.data?.content ?? "",
            blocks: note.data?.blocks ?? null,
          }),
        },
      );
      queryClient.setQueryData(["note", id], saved);
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setEditingTitle(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the title.",
      );
      element.focus();
    } finally {
      setSavingTitle(false);
    }
  }
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="absolute top-4 left-1/2 z-20 w-[calc(100%-4rem)] max-w-[min(100%,90rem)] -translate-x-1/2 items-start justify-between gap-2 whitespace-nowrap flex flex-col min-w-0 ">
        <div className="w-full flex items-center justify-between">
          <Link
            href="/notes"
            className="shrink-0 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="size-3.5" />
            All notes
          </Link>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDate(note.data.created_at)}
          </span>
        </div>
        <div className="min-w-0 flex items-center gap-3 justify-between w-full">
          {editingTitle ? (
            <>
              <input
                aria-label="Note title"
                defaultValue={note.data.title}
                maxLength={300}
                autoFocus
                required
                className="min-w-0 w-full p-2 text-primary bg-linear-to-b from-primary/10 to-primary/20 backdrop-blur-xl px-4 border border-primary/30 rounded-full font-semibold tracking-tight outline-none focus:ring-2 focus:ring-primary/40"
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.currentTarget.value = note.data.title;
                    setEditingTitle(false);
                  }
                }}
                onBlur={saveTitle}
              />
              <Button
                variant="gradient_primary"
                className="shrink-0 rounded-full"
                size="icon-sm"
                aria-label="Save title"
                disabled={savingTitle}
                onClick={async (event: React.MouseEvent<HTMLButtonElement>) =>
                  event.currentTarget.blur()
                }
              >
                {savingTitle ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </Button>
            </>
          ) : (
            <>
              <h1 className="min-w-0 flex justify-start items-center truncate text-primary gap-2 px-4 p-1 bg-linear-to-b from-primary/10 to-primary/20 backdrop-blur-xl border border-primary/30 rounded-full font-semibold tracking-tight">
                {note.data.title}
                <Button
                  variant="ghost"
                  className="shrink-0 cursor-pointer"
                  size="icon-sm"
                  aria-label="Edit title"
                  onClick={() => setEditingTitle(true)}
                >
                  <Pencil className="size-4" />
                </Button>
              </h1>
            </>
          )}

          <GradientTabs
            className="shrink-0"
            items={[
              { value: "notes", label: "Notes" },
              { value: "media", label: "Source & transcript" },
            ]}
            value={tab}
            onValueChange={setTab}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-3xl px-2 pt-24 pb-8">
          {source.error && (
            <ErrorState
              error={source.error}
              retry={() => void source.refetch()}
            />
          )}
          {transcript.error && (
            <ErrorState
              error={transcript.error}
              retry={() => void transcript.refetch()}
            />
          )}
          <div hidden={tab !== "notes"}>
            <NoteEditor
              key={id}
              noteId={id}
              content={note.data.content}
              blocks={note.data.blocks}
              onSave={async (document) => {
                const saved = await request<NoteDetail>(
                  `/notes/${encodeURIComponent(id)}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(document),
                  },
                );
                queryClient.setQueryData(["note", id], saved);
              }}
            />
          </div>
          {tab === "media" && source.data && transcript.data && (
            <MediaRenderer
              key={id}
              source={source.data}
              transcript={transcript.data}
            />
          )}
        </article>
      </div>
    </div>
  );
}
