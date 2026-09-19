"use client";

import { useState, type ReactElement } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ContextMenu } from "radix-ui";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { request, type Note, type NoteDetail } from "@/lib/api";
import { noteDrafts } from "@/hooks/use-note-drafts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function NoteContextMenu({
  noteId,
  title,
  children,
}: {
  noteId: string;
  title: string;
  children: ReactElement;
}) {
  const client = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [action, setAction] = useState<"rename" | "delete" | null>(null);
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(next: "rename" | "delete") {
    setName(title);
    setError(null);
    setAction(next);
  }

  async function submit() {
    if (busy || !action || (action === "rename" && !name.trim())) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "rename") {
        const note = await request<Note>(
          `/notes/${encodeURIComponent(noteId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: name.trim() }),
          },
        );
        await Promise.all([
          client.cancelQueries({ queryKey: ["notes"] }),
          client.cancelQueries({ queryKey: ["note", noteId] }),
        ]);
        client.setQueryData<Note[]>(["notes"], (notes) =>
          notes?.map((old) =>
            old.id === noteId ? { ...old, title: note.title } : old,
          ),
        );
        // Only the metadata changes. Keep the editor's current content and draft.
        client.setQueryData<NoteDetail>(["note", noteId], (old) =>
          old ? { ...old, title: note.title } : old,
        );
        toast.success("Note renamed");
      } else {
        await request(`/notes/${encodeURIComponent(noteId)}`, {
          method: "DELETE",
        });
        await client.cancelQueries({ queryKey: ["notes"] });
        if (pathname === `/notes/${noteId}`) router.replace("/notes");
        noteDrafts.clear(noteId);
        client.setQueryData<Note[]>(["notes"], (notes) =>
          notes?.filter((note) => note.id !== noteId),
        );
        client.removeQueries({ queryKey: ["note", noteId], exact: true });
        client.removeQueries({
          queryKey: ["intelligence", noteId],
          exact: true,
        });
        toast.success("Note deleted");
      }
      setAction(null);
      await Promise.all(
        ["notes", "graph", "intelligence", "intelligence-status", "job"].map(
          (key) => client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not update this note.",
      );
    } finally {
      setBusy(false);
    }
  }

  const menuItem =
    "flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground";
  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className="z-50 min-w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
            onCloseAutoFocus={(event) => {
              if (action) event.preventDefault();
            }}
          >
            <ContextMenu.Item
              className={menuItem}
              onSelect={() => choose("rename")}
            >
              <Pencil className="size-3.5" />
              Rename
            </ContextMenu.Item>
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <ContextMenu.Item
              className={`${menuItem} text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive`}
              onSelect={() => choose("delete")}
            >
              <Trash2 className="size-3.5" />
              Delete
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="space-y-5"
          >
            <DialogHeader>
              <DialogTitle>
                {action === "rename" ? "Rename note" : "Delete note?"}
              </DialogTitle>
              <DialogDescription>
                {action === "rename" ? (
                  "Choose a name for this note."
                ) : (
                  <>
                    Delete{" "}
                    <strong className="break-words font-medium text-foreground">
                      {title}
                    </strong>{" "}
                    and its saved edits, unsaved draft, and connections? The
                    original upload and transcript will stay in Uploads. This
                    cannot be undone.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            {action === "rename" && (
              <div className="space-y-2">
                <label
                  htmlFor={`note-name-${noteId}`}
                  className="text-sm font-medium"
                >
                  Note name
                </label>
                <Input
                  id={`note-name-${noteId}`}
                  value={name}
                  maxLength={200}
                  required
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                  onFocus={(event) => event.target.select()}
                  autoComplete="off"
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={
                  action === "delete"
                    ? "gradient_destructive"
                    : "gradient_primary"
                }
                disabled={busy || (action === "rename" && !name.trim())}
              >
                {busy
                  ? action === "rename"
                    ? "Renaming…"
                    : "Deleting…"
                  : action === "rename"
                    ? "Rename"
                    : "Delete note"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
