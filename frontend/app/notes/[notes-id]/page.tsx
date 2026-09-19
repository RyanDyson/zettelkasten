"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { MediaRenderer } from "@/components/media-renderer/main";
import { NoteRenderer } from "@/components/note-renderer/main";
import { GradientTabs } from "@/components/ui/gradient-tabs";

export default function NotePage() {
  const params = useParams<{ "notes-id": string }>();
  const requested = params?.["notes-id"];
  const file =
    requested && !/^\d+$/.test(requested)
      ? `${decodeURIComponent(requested)}.md`
      : "temp-note.md";

  const [tab, setTab] = useState("notes");

  return (
    <div className="relative mx-auto flex max-h-screen min-h-0 max-w-3xl flex-col">
      <GradientTabs
        items={[
          { value: "media", label: "Media" },
          { value: "notes", label: "Notes" },
        ]}
        value={tab}
        onValueChange={setTab}
        className="absolute top-4 left-1/2 z-50 -translate-x-1/2"
      />
      {tab === "media" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <MediaRenderer markdownFile={file} />
        </div>
      )}
      {tab === "notes" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <NoteRenderer markdownFile={file} />
        </div>
      )}
    </div>
  );
}
