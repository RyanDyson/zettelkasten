import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph } from "./graph";
import type { Note, GraphEdge } from "./api";

test("maps stored connections and deduplicates reciprocal links, ignoring missing nodes", () => {
  const notes = ["a", "b", "c"].map((id) => ({
    id,
    title: id,
    created_at: "2026-09-19",
    source_id: id,
  })) satisfies Note[];
  const edges = [
    ["a", "b"],
    ["b", "a"],
    ["a", "c"],
    ["a", "a"],
    ["a", "missing"],
  ].map(([src_id, dst_id]) => ({
    src_id,
    dst_id,
    weight: 1,
    kind: "concept",
    concepts: ["apple"],
  })) satisfies GraphEdge[];
  const graph = buildGraph(notes, edges);
  assert.deepEqual(graph.links, [
    { source: "a", target: "b" },
    { source: "a", target: "c" },
  ]);
  assert.deepEqual(
    graph.nodes.map((n) => n.degree),
    [2, 1, 1],
  );
  assert.equal(edges.length, 5);
});
