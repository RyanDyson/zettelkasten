import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { cn } from "cn";

export type NotesCardProps = {
  title: string;
  preview: string;
  date: Date;
  selected?: boolean;
  editing?: boolean;
  notesId: string;
};
export function NotesCard({
  title,
  preview,
  date,
  selected = false,
  editing = false,
  notesId,
}: NotesCardProps) {
  return (
    <Link
      href={`/notes/${notesId}`}
      aria-current={selected ? "page" : undefined}
      data-selected={selected}
      className={cn(
        "flex flex-col gap-2 border-b p-4 transition-colors hover:bg-linear-to-b hover:from-primary/0 hover:to-primary/20 ",
        selected && "bg-linear-to-b from-primary/20 to-primary/30",
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h3>
        {editing && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            Editing
          </span>
        )}
      </div>
      <p className="truncate text-xs text-muted-foreground">{preview}</p>
      <p className="text-xs text-muted-foreground">{formatDate(date)}</p>
    </Link>
  );
}
