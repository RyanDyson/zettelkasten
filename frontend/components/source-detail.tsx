"use client";

import Link from "next/link";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useJob,
  useRetryJob,
  useSource,
  useTranscript,
} from "@/hooks/use-vault";
import { formatDate } from "@/lib/dates";
import { MediaRenderer } from "@/components/media-renderer/main";
import { ErrorState, LoadingState } from "@/components/request-state";
import { JobStatusBadge } from "@/components/job-status";
import { Button } from "@/components/ui/button";

export function SourceDetailView({ id }: { id: string }) {
  const source = useSource(id);
  const job = useJob(id);
  const transcript = useTranscript(id, job.data?.status === "done");
  const retry = useRetryJob();
  if (source.isPending) return <LoadingState>Loading source…</LoadingState>;
  if (source.error)
    return (
      <ErrorState error={source.error} retry={() => void source.refetch()} />
    );
  if (!source.data) return null;
  const status = job.data?.status ?? source.data.status;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <article className="mx-auto max-w-3xl px-5 py-8 md:px-10">
        <Link
          href="/uploads"
          className="mb-7 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          All uploads
        </Link>
        <div className="mb-8 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {source.data.kind} · {formatDate(source.data.created_at)}
            </span>
            <JobStatusBadge status={status} />
          </div>
          <h1 className="break-words text-2xl font-semibold tracking-tight">
            {source.data.original_name}
          </h1>
        </div>
        {job.error && (
          <ErrorState error={job.error} retry={() => void job.refetch()} />
        )}
        {(status === "queued" || status === "processing") && (
          <div
            role="status"
            className="rounded-xl border bg-muted/50 p-8 text-center"
          >
            <LoaderCircle className="mx-auto mb-4 size-6 animate-spin text-primary" />
            <p className="font-medium">
              {status === "queued"
                ? "Your source is in the queue"
                : "Turning your source into text"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              You can leave this page. We’ll keep processing and show the result
              here when it’s ready.
            </p>
          </div>
        )}
        {status === "failed" && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/25 bg-destructive/5 p-5"
          >
            <p className="font-medium">Processing failed</p>
            <p className="mt-2 text-sm">
              {job.data?.error ?? source.data.error}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              disabled={retry.isPending}
              onClick={() =>
                retry.mutate(id, {
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              {retry.isPending ? "Retrying…" : "Retry processing"}
            </Button>
          </div>
        )}
        {status === "done" && (
          <>
            {transcript.isPending && (
              <LoadingState>Loading transcript…</LoadingState>
            )}
            {transcript.error && (
              <ErrorState
                error={transcript.error}
                retry={() => void transcript.refetch()}
              />
            )}
            {transcript.data && (
              <MediaRenderer
                key={id}
                source={source.data}
                transcript={transcript.data}
              />
            )}
            {job.data?.notes.map((note) => (
              <Button key={note.id} asChild variant="outline" className="mt-8">
                <Link href={`/notes/${note.id}`}>Open note in library</Link>
              </Button>
            ))}
          </>
        )}
      </article>
    </div>
  );
}
