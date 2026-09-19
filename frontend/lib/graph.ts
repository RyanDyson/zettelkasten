import type { GraphEdge, Note } from "@/lib/api";

export function buildGraph(notes: Note[], edges: GraphEdge[]) {
  const ids = new Set(notes.map((note) => note.id));
  const seen = new Set<string>();
  const degree = new Map<string, number>();
  const links: { source: string; target: string }[] = [];
  for (const edge of edges) {
    if (
      edge.src_id === edge.dst_id ||
      !ids.has(edge.src_id) ||
      !ids.has(edge.dst_id)
    )
      continue;
    const [source, target] = [edge.src_id, edge.dst_id].sort();
    const key = JSON.stringify([source, target]);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ source, target });
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
  }
  return {
    nodes: notes.map((note) => ({
      id: note.id,
      label: note.title,
      degree: degree.get(note.id) ?? 0,
    })),
    links,
  };
}
