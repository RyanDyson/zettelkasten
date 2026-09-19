"use client";

import dynamic from "next/dynamic";

const GraphCanvas = dynamic(
  () => import("@/components/network-renderer/graph-canvas"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading graph…
      </div>
    ),
  },
);

export function NetworkView() {
  return <GraphCanvas />;
}
