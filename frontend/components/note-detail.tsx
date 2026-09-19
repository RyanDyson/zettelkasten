"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { request, type NoteDetail } from "@/lib/api";
import { GradientTabs } from "@/components/ui/gradient-tabs";
import { ArrowLeft } from "lucide-react";
import {
  useIntelligence,
  useNote,
  useSource,
  useTranscript,
} from "@/hooks/use-vault";
import { MediaRenderer } from "@/components/media-renderer/main";
const NoteEditor = dynamic(() => import("@/components/note-renderer/editor"), {
  ssr: false,
  loading: () => <LoadingState>Loading editor…</LoadingState>,
});
import { ErrorState, LoadingState } from "@/components/request-state";
import { NoteConnections } from "@/components/note-connections";
import { formatDate } from "@/lib/dates";

export function NoteDetailView({ id }: { id: string }) {
  const [tab, setTab] = useState("notes");
  const queryClient = useQueryClient();
  const note = useNote(id);
  const intelligence = useIntelligence(id);
  const source = useSource(note.data?.source_id ?? null);
  const transcript = useTranscript(
    note.data?.source_id ?? null,
    !!source.data?.transcript_url,
  );
  if (note.isPending) return <LoadingState>Loading note…</LoadingState>;
  if (note.error)
    return <ErrorState error={note.error} retry={() => void note.refetch()} />;
  if (!note.data) return null;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <GradientTabs
        items={[
          { value: "notes", label: "Notes" },
          { value: "media", label: "Source & transcript" },
        ]}
        value={tab}
        onValueChange={setTab}
        className="absolute top-4 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap shadow-sm"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-3xl px-6 pt-24 pb-8 md:px-10">
          <Link
            href="/notes"
            className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="size-3.5" />
            All notes
          </Link>
          <h1 className="break-words text-2xl font-semibold tracking-tight">
            {note.data.title}
          </h1>
          <p className="mt-3 mb-8 text-xs text-muted-foreground">
            {formatDate(note.data.created_at)}
          </p>
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
              mentions={intelligence.data?.mentions}
              formattingEnabled={intelligence.data?.enabled}
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
            <NoteConnections id={id} />
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
