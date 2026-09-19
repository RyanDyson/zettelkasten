"use client";

import { useRef, useState } from "react";
import {
  AudioLines,
  Download,
  ExternalLink,
  FileText,
  Film,
} from "lucide-react";
import { NoteRenderer } from "@/components/note-renderer/main";
import {
  sourceFileUrl,
  transcriptDownloadUrl,
  type Source,
  type Transcript,
} from "@/lib/api";
import { formatSeconds } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

export function MediaRenderer({
  source,
  transcript,
}: {
  source: Source;
  transcript: Transcript;
}) {
  const media = useRef<HTMLMediaElement | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [showSegments, setShowSegments] = useState(false);
  const hasMedia =
    source.kind === "audio" ||
    source.kind === "video" ||
    source.kind === "video/audio";
  const fileUrl = sourceFileUrl(source.id);
  return (
    <div className="space-y-7">
      {hasMedia && (
        <section className="space-y-3">
          <div className="w-full justify-between flex items-center">
            <h2 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {source.kind === "audio" ? (
                <AudioLines className="size-4" />
              ) : (
                <Film className="size-4" />
              )}
              Original recording
              {transcript.language && (
                <span className="px-2 py-1">
                  {transcript.language.toUpperCase()}
                </span>
              )}
              {transcript.duration_seconds != null && (
                <span className="px-2 py-1">
                  {formatSeconds(transcript.duration_seconds)}
                </span>
              )}
            </h2>
            <ButtonGroup>
              <Button asChild variant="outline" size="sm">
                <a href={fileUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  Original file
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={transcriptDownloadUrl(source.id)}>
                  <Download className="size-3.5" />
                  Export Markdown
                </a>
              </Button>
            </ButtonGroup>
          </div>
          {source.kind === "audio" ? (
            <audio
              ref={(el) => {
                media.current = el;
              }}
              controls
              preload="metadata"
              src={fileUrl}
              onError={() => setMediaError(true)}
              className="w-full"
            />
          ) : (
            <video
              ref={(el) => {
                media.current = el;
              }}
              controls
              preload="metadata"
              src={fileUrl}
              onError={() => setMediaError(true)}
              className="max-h-80 w-full rounded-xl border bg-black"
            />
          )}
          {mediaError && (
            <p role="status" className="text-xs text-muted-foreground">
              This recording cannot play in your browser. Open the original file
              in a compatible player; the transcript is available below.
            </p>
          )}
        </section>
      )}
      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-medium text-primary">
            <FileText className="size-4 text-primary" />
            {hasMedia ? "Transcript" : "Extracted text"}
          </h2>
          {transcript.segments.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSegments(!showSegments)}
              className="cursor-pointer"
            >
              {showSegments ? "Read full text" : "Show timestamps"}
            </Button>
          )}
        </div>
        {showSegments ? (
          <div className="divide divide-y">
            {transcript.segments.map((segment, index) => (
              <button
                key={index}
                type="button"
                className="flex w-full text-justify gap-4 p-3 hover:bg-accent"
                aria-label={`Seek to ${formatSeconds(segment.start)}: ${segment.text}`}
                onClick={() => {
                  if (media.current) {
                    media.current.currentTime = segment.start;
                    void media.current.play().catch(() => setMediaError(true));
                  }
                }}
              >
                <span className="pt-1 font-mono font-bold text-xs text-primary">
                  {formatSeconds(segment.start)}
                </span>
                <span className="text-sm leading-6 text-justify">
                  {segment.text}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <NoteRenderer content={transcript.content} />
        )}
      </section>
    </div>
  );
}
