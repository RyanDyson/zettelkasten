"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Loader2, Network } from "lucide-react";
import { useIntelligence } from "@/hooks/use-vault";
import { request } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function NoteConnections({ id }: { id: string }) {
  const query = useIntelligence(id);
  const client = useQueryClient();
  const reindex = useMutation({
    mutationFn: () =>
      request(`/notes/${encodeURIComponent(id)}/intelligence/reindex`, {
        method: "POST",
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["intelligence", id] }),
  });
  const data = query.data;
  const busy = data?.status === "queued" || data?.status === "processing";
  return (
    <section aria-label="Note connections" className="mt-10 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Network className="size-4 text-primary" />
          Related notes
        </h2>
        {data?.enabled && !busy && (
          <Button
            size="sm"
            variant="ghost"
            disabled={reindex.isPending}
            onClick={() => reindex.mutate()}
          >
            {reindex.isPending
              ? "Queuing…"
              : data.status === "failed"
                ? "Retry indexing"
                : data.status === "not_indexed"
                  ? "Find connections"
                  : "Refresh connections"}
          </Button>
        )}
      </div>
      {query.isPending && (
        <p className="mt-3 text-xs text-muted-foreground">
          Loading connections…
        </p>
      )}
      {query.error && (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          Connections unavailable.{" "}
          <button
            className="text-primary underline"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </p>
      )}
      {data && (
        <>
          {!data.enabled && (
            <p className="mt-3 text-xs text-muted-foreground">
              Automatic linking is disabled.
            </p>
          )}
          {data.enabled && busy && (
            <p
              role="status"
              className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Loader2 className="size-3 animate-spin" />
              {data.status === "queued"
                ? "Waiting to find connections…"
                : "Finding connections from the source transcript…"}
            </p>
          )}
          {data.status === "failed" && (
            <p role="status" className="mt-3 text-xs text-destructive">
              {data.error} Your note is still available.
              {data.indexed_at ? " Previous connections are shown below." : ""}
            </p>
          )}
          {data.status === "done" && !data.related_notes.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              No related notes found yet. Connections can appear as more sources
              are indexed.
            </p>
          )}
          <div className="mt-3 space-y-2">
            {data.related_notes.map((note) => (
              <Link
                key={note.note_id}
                href={`/notes/${note.note_id}`}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {note.title}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {note.concepts.join(" · ")}
                  </span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-primary" />
              </Link>
            ))}
          </div>
          {data.summary && (
            <details className="mt-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                AI summary · Based on the original source
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                {data.summary}
              </p>
            </details>
          )}
        </>
      )}
      {reindex.error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {reindex.error.message}
        </p>
      )}
    </section>
  );
}
