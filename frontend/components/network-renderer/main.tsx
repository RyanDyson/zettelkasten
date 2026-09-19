"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Network } from "lucide-react";
import { useNotes } from "@/hooks/use-vault";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/request-state";
const GraphCanvas = dynamic(
  () => import("@/components/network-renderer/graph-canvas"),
  { ssr: false, loading: () => <LoadingState>Loading graph…</LoadingState> },
);

export function NetworkView() {
  const notes = useNotes();
  if (notes.isPending)
    return <LoadingState>Loading your library…</LoadingState>;
  if (notes.error)
    return (
      <ErrorState error={notes.error} retry={() => void notes.refetch()} />
    );
  if (!notes.data?.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <Network className="size-12 text-primary/40" />
        <h1 className="text-2xl font-semibold">Your knowledge starts here.</h1>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Upload your first source to create a note in your library.
        </p>
        <Button asChild variant="gradient_primary">
          <Link href="/uploads">Upload a source</Link>
        </Button>
      </div>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <GraphCanvas notes={notes.data} />
      </div>
    </div>
  );
}
