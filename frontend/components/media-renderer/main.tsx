"use client";

import { FileText, Film, AudioLines } from "lucide-react";

import { NoteRenderer } from "@/components/note-renderer/main";

type MediaType = "text" | "video" | "audio";

export type MediaItem = {
  type: MediaType;
  label: string;
  src: string;
};

const tempMedia: MediaItem[] = [
  {
    type: "video",
    label: "Recording",
    src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  },
  {
    type: "audio",
    label: "Voice memo",
    src: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
  },
];

export function detectMediaType(src: string): MediaType | null {
  const path = src.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|mov|avi|mkv)$/.test(path)) return "video";
  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/.test(path)) return "audio";
  if (/\.(md|markdown|txt)$/.test(path)) return "text";
  return null;
}

export function MediaRenderer({
  media = tempMedia,
  markdownFile,
}: {
  media?: MediaItem[];
  markdownFile?: string;
}) {
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pt-16 pb-6">
      {media.map((item) => {
        const type = item.src
          ? (detectMediaType(item.src) ?? item.type)
          : item.type;
        return (
          <figure key={`${type}-${item.src}`} className="space-y-2">
            <figcaption className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {type === "video" && <Film className="size-3" />}
              {type === "audio" && <AudioLines className="size-3" />}
              {type === "text" && <FileText className="size-3" />}
              {item.label}
            </figcaption>

            {type === "video" && (
              <video
                controls
                src={item.src}
                className="w-full rounded-xl border bg-black"
              />
            )}

            {type === "audio" && (
              <audio controls src={item.src} className="w-full" />
            )}

            {type === "text" && (
              <div className="max-h-[50dvh] overflow-y-auto rounded-xl border">
                <NoteRenderer markdownFile={item.src} />
              </div>
            )}
          </figure>
        );
      })}

      <figure className="space-y-2">
        <figcaption className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FileText className="size-3" />
          Transcription
        </figcaption>
        <div className="max-h-[50dvh] min-h-40 overflow-y-auto rounded-xl border">
          <NoteRenderer markdownFile={markdownFile} />
        </div>
      </figure>
    </div>
  );
}
