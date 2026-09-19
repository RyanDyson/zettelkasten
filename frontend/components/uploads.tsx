"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  AudioLines,
  FileText,
  Film,
  LoaderCircle,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { ACCEPTED_EXTENSIONS, uploadFile } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { useSources, useRetryJob } from "@/hooks/use-vault";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/job-status";
import { ErrorState, LoadingState } from "@/components/request-state";

export function Uploads() {
  const sources = useSources();
  const retry = useRetryJob();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");

  async function accept(files: FileList | File[]) {
    if (busy.current || !files.length) return;
    busy.current = true;
    setUploading(true);
    setError(null);
    const errors: string[] = [];
    try {
      for (const file of Array.from(files)) {
        setUploadName(file.name);
        try {
          await uploadFile(file);
          toast.success(`${file.name} added to the queue`);
          await client.invalidateQueries({ queryKey: ["sources"] });
        } catch (err) {
          errors.push(
            `${file.name}: ${err instanceof Error ? err.message : "Upload failed."}`,
          );
        }
      }
    } finally {
      setError(errors.length ? errors.join("\n") : null);
      setUploading(false);
      busy.current = false;
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-8 px-5 py-8 md:px-10 md:py-12">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            Add to your library
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Every source starts a note.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Bring a document, a voice memo, or a recording. We’ll extract the
            text and keep it here for you.
          </p>
        </div>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void accept(event.dataTransfer.files);
          }}
          className={`rounded-2xl border-2 border-dashed px-5 py-9 text-center transition-colors ${dragging ? "border-primary bg-primary/10" : "border-primary/25 bg-primary/3"}`}
        >
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <UploadCloud className="size-6" />
          </div>
          <p className="font-medium">Drop your files here</p>
          <p className="mt-2 text-sm text-muted-foreground">
            PDF documents, audio, and video
          </p>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            className="sr-only"
            aria-label="Choose files to upload"
            disabled={uploading}
            onChange={(event) => {
              if (event.target.files) void accept(event.target.files);
            }}
          />
          <Button
            variant="gradient_primary"
            className="mt-5"
            disabled={uploading}
            onClick={() => input.current?.click()}
          >
            {uploading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <UploadCloud className="size-4" />
            )}
            {uploading ? "Uploading…" : "Choose files"}
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            Default limits: 100 MB per file · 2 hours of audio/video
          </p>
          {uploading && (
            <p role="status" className="mt-3 break-all text-sm text-primary">
              Uploading {uploadName}. Keep this page open until it is queued.
            </p>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="whitespace-pre-wrap rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <p className="text-xs leading-5 text-muted-foreground">
          PDFs must contain selectable text. Audio and video are transcribed
          locally; videos need an audio track. Processing continues after you
          leave this page once the upload is queued.
        </p>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Upload history</h2>
            <span className="text-xs text-muted-foreground">
              {sources.data?.length ?? 0} sources
            </span>
          </div>
          {sources.isPending && <LoadingState>Loading uploads…</LoadingState>}
          {sources.error && (
            <ErrorState
              error={sources.error}
              retry={() => void sources.refetch()}
            />
          )}
          {!sources.isPending && !sources.error && !sources.data?.length && (
            <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
              No uploads yet. Choose a file to start your library.
            </div>
          )}
          <div className="divide-y rounded-xl border empty:hidden">
            {sources.data?.map((source) => {
              const Icon =
                source.kind === "video"
                  ? Film
                  : source.kind === "audio"
                    ? AudioLines
                    : FileText;
              return (
                <div
                  key={source.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-4"
                >
                  <Icon className="size-5 shrink-0 text-primary" />
                  <Link
                    href={`/uploads/${source.id}`}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate text-sm font-medium hover:text-primary">
                      {source.original_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {source.kind.toUpperCase()} ·{" "}
                      {formatDate(source.created_at)}
                    </p>
                  </Link>
                  <JobStatusBadge status={source.status} />
                  {source.status === "failed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={retry.isPending}
                      onClick={() =>
                        retry.mutate(source.id, {
                          onError: (error) => toast.error(error.message),
                        })
                      }
                    >
                      Retry
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="icon">
                    <Link
                      href={`/uploads/${source.id}`}
                      aria-label={`View ${source.original_name}`}
                    >
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
