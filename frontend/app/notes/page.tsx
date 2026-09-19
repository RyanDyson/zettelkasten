import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function NotesPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <FileText className="size-9 text-primary/40" />
      <h1 className="text-xl font-semibold">A place for what you learn.</h1>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">
        Choose a note from your library, or add a PDF, audio recording, or video
        to create one.
      </p>
      <Button asChild variant="gradient_primary">
        <Link href="/uploads">Upload a source</Link>
      </Button>
    </div>
  );
}
