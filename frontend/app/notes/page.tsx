import { StickyNote } from "lucide-react";

export default function NotesPage() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <div className="flex bg-linear-to-b from-primary/10 to-primary/20 border border-primary/30 h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600">
        <StickyNote className="h-6 w-6 text-primary" />
      </div>
      <div className="text-base font-medium text-primary dark:text-zinc-300">
        Select a note to start
      </div>
      <div className="max-w-xs text-center text-sm text-zinc-500 dark:text-zinc-500">
        Pick a note from the sidebar, or use the command menu to search your
        vault.
      </div>
    </div>
  );
}
