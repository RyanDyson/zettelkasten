"use client";

// Extracted documents are untrusted plain text. Preserve it exactly without executing HTML
// or presenting an editor whose changes cannot yet be saved by the backend.
export function NoteRenderer({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-7 selection:bg-primary/20">
      {content}
    </div>
  );
}
