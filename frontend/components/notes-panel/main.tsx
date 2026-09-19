"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useNotes } from "@/hooks/use-vault";
import { useNoteDrafts } from "@/hooks/use-note-drafts";
import { draftsFirst } from "@/lib/note-drafts";
import { Input } from "@/components/ui/input";
import { NotesCard } from "@/components/notes-panel/notes-card";
import { ErrorState, LoadingState } from "@/components/request-state";

export function NotesLayout({ children }: { children: React.ReactNode }) {
  const notes = useNotes();
  const { drafts } = useNoteDrafts();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const selected = pathname.startsWith("/notes/");
  const filtered = draftsFirst(notes.data ?? [], drafts).filter((note) =>
    note.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="flex min-h-0 w-full flex-1">
      <aside
        className={`${selected ? "hidden md:flex" : "flex"} min-h-0 w-full flex-col border-r md:w-72 md:shrink-0`}
      >
        <div className="border-b p-4">
          <label className="relative block">
            <Search className="absolute top-2.5 left-3 size-3.5 text-muted-foreground" />
            <Input
              aria-label="Search note titles"
              placeholder="Search note titles…"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <p className="mt-3 text-xs text-muted-foreground">
            {filtered?.length ?? 0} notes
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {notes.isPending && <LoadingState>Loading notes…</LoadingState>}
          {notes.error && (
            <ErrorState
              error={notes.error}
              retry={() => void notes.refetch()}
            />
          )}
          {filtered?.map((note) => (
            <NotesCard
              key={note.id}
              notesId={note.id}
              title={note.title}
              preview="Note"
              editing={!!drafts[note.id]}
              date={new Date(note.created_at)}
              selected={pathname === `/notes/${note.id}`}
            />
          ))}
          {!notes.isPending && !notes.error && !filtered?.length && (
            <p className="p-6 text-sm text-muted-foreground">
              {search
                ? "No titles match your search."
                : "No notes yet. Upload a source to create one."}
            </p>
          )}
        </div>
      </aside>
      <div
        className={`${selected ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`}
      >
        {children}
      </div>
    </div>
  );
}
