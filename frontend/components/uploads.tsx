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
  Plus,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { ACCEPTED_EXTENSIONS, uploadFile } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { useSources, useRetryJob } from "@/hooks/use-vault";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { JobStatusBadge } from "@/components/job-status";
import { ErrorState, LoadingState } from "@/components/request-state";

export function Uploads() {
  const sources = useSources();
  const retry = useRetryJob();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
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
        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="font-semibold">Uploads</h2>
            <Dialog
              open={open}
              onOpenChange={(value) => {
                if (uploading) return;
                setOpen(value);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  data-tour="upload-trigger"
                  variant="gradient_primary"
                  className="rounded-full cursor-pointer"
                >
                  <Plus className="size-4" /> New upload
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-primary font-bold">
                    Upload files
                  </DialogTitle>
                  <DialogDescription>
                    PDF documents, audio, and video
                  </DialogDescription>
                </DialogHeader>
                <div
                  data-tour="upload-dropzone"
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
                  <div className="font-medium flex justify-center items-center gap-2">
                    Drop your files here or{" "}
                    <Button
                      variant="gradient_primary"
                      className="rounded-full"
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
                  </div>
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
                  {uploading && (
                    <p
                      role="status"
                      className="mt-3 break-all text-sm text-primary"
                    >
                      Copying {uploadName}
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
              </DialogContent>
            </Dialog>
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
              No uploads yet. Start a new upload to build your library.
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
                <Link
                  key={source.id}
                  href={`/uploads/${source.id}`}
                  className="min-w-0 flex-1"
                >
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
                  >
                    <Icon className="size-5 shrink-0 text-primary" />

                    <p className="truncate text-sm font-medium hover:text-primary">
                      {source.original_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground capitalize flex justify-start items-center">
                      {source.kind} - {formatDate(source.created_at)}
                    </p>

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

                    <ArrowUpRight className="size-4" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
