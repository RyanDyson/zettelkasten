"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Network } from "lucide-react";
import { useGraph, useIntelligenceStatus } from "@/hooks/use-vault";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/request-state";
const GraphCanvas = dynamic(
  () => import("@/components/network-renderer/graph-canvas"),
  { ssr: false, loading: () => <LoadingState>Loading graph…</LoadingState> },
);

export function NetworkView() {
  const graph = useGraph();
  const indexing = useIntelligenceStatus();
  if (graph.isPending)
    return <LoadingState>Loading your library…</LoadingState>;
  if (graph.error)
    return (
      <ErrorState error={graph.error} retry={() => void graph.refetch()} />
    );
  if (!graph.data?.nodes.length)
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
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <GraphCanvas notes={graph.data.nodes} edges={graph.data.edges} />
      </div>
      {indexing.data?.enabled &&
        (indexing.data.counts.queued + indexing.data.counts.processing > 0 ||
          indexing.data.counts.failed > 0) && (
          <div
            role="status"
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background/90 px-4 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur-sm"
          >
            {indexing.data.counts.queued + indexing.data.counts.processing > 0
              ? `Finding connections · ${indexing.data.counts.done} indexed · ${indexing.data.counts.queued + indexing.data.counts.processing} remaining`
              : `${indexing.data.counts.failed} ${indexing.data.counts.failed === 1 ? "note needs" : "notes need"} indexing attention. Open a note to retry.`}
          </div>
        )}
    </div>
  );
}
