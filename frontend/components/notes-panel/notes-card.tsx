export type NotesCardProps = {
  title: string;
  preview: string;
  date: Date;
  selected?: boolean;
  notesId: string;
};

export function NotesCard({
  title,
  preview,
  date,
  selected = false,
  notesId,
}: NotesCardProps) {
  return (
    <div
      data-selected={selected}
      className="flex flex-col gap-1 p-4 transition-colors hover:bg-linear-to-b hover:from-rpimary/10 hover:to-primary/30 cursor-pointer data-[selected=true]:bg-accent data-[selected=true]:hover:bg-accent"
    >
      <h3 className="font-semibold text-xs">{title}</h3>
      <p className="text-xs text-muted-foreground truncate">{preview}</p>
      <p className="text-xs text-muted-foreground">
        {date.toLocaleDateString()}
      </p>
    </div>
  );
}
