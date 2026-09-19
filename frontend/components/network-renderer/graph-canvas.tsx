"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import ForceGraph2D, { ForceGraphMethods } from "react-force-graph-2d";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  NotesCard,
  type NotesCardProps,
} from "@/components/notes-panel/notes-card";

const previewData: Record<string, Omit<NotesCardProps, "notesId">> = {
  inbox: {
    title: "Inbox",
    preview: "Unprocessed notes waiting to be triaged into the vault.",
    date: new Date("2026-09-19"),
  },
  git: {
    title: "Git and AutoGit",
    preview: "Optional Git support: commit snapshots without lifting a finger.",
    date: new Date("2026-04-17"),
  },
  "command-palette": {
    title: "Command Palette",
    preview: "Keyboard-first navigation for everything in the app.",
    date: new Date("2026-04-17"),
  },
  properties: {
    title: "Properties Panel",
    preview: "Edit a note's frontmatter in a user-friendly way.",
    date: new Date("2026-04-17"),
  },
  "note-list": {
    title: "Note List",
    preview: "Shows the subset of notes selected by the current section.",
    date: new Date("2026-04-13"),
  },
  principles: {
    title: "Principles",
    preview: "Core principles that guide every design decision.",
    date: new Date("2026-04-13"),
  },
  ai: {
    title: "AI in Tolaria",
    preview: "AI without requirement: pick a model or skip it entirely.",
    date: new Date("2026-04-13"),
  },
  "bottom-bar": {
    title: "Bottom Bar",
    preview: "Vault path, sync status, and quick preferences at a glance.",
    date: new Date("2026-04-13"),
  },
  projects: {
    title: "Projects",
    preview: "Type used to group notes that belong to a bigger effort.",
    date: new Date("2026-04-12"),
  },
  people: {
    title: "People",
    preview: "Notes referencing the humans behind the ideas.",
    date: new Date("2026-04-12"),
  },
  "daily-notes": {
    title: "Daily Notes",
    preview: "One scratchpad per day, auto-created at first launch.",
    date: new Date("2026-04-11"),
  },
  templates: {
    title: "Templates",
    preview: "Reusable skeletons for notes, projects, and journaling.",
    date: new Date("2026-04-11"),
  },
  search: {
    title: "Search",
    preview: "Full-text and metadata search across the whole vault.",
    date: new Date("2026-04-10"),
  },
  tags: {
    title: "Tags",
    preview: "Loose, freeform tags attached to any note.",
    date: new Date("2026-04-10"),
  },
  backlinks: {
    title: "Backlinks",
    preview: "Every incoming link to the note you are looking at.",
    date: new Date("2026-04-09"),
  },
  "graph-view": {
    title: "Graph View",
    preview: "Force-directed map of the notes and their connections.",
    date: new Date("2026-04-09"),
  },
  "git-sync": {
    title: "Git Sync",
    preview: "Push and pull without leaving the note editor.",
    date: new Date("2026-04-09"),
  },
  attachments: {
    title: "Attachments",
    preview: "Images and files stored next to the notes that use them.",
    date: new Date("2026-04-08"),
  },
  "keyboard-shortcuts": {
    title: "Keyboard Shortcuts",
    preview: "Remap every action; almost everything has a shortcut.",
    date: new Date("2026-04-08"),
  },
  themes: {
    title: "Themes",
    preview: "Light and dark, plus community theme support.",
    date: new Date("2026-04-08"),
  },
};

const placeholder: Omit<NotesCardProps, "notesId"> = {
  title: "Untitled note",
  preview: "No preview available for this note yet.",
  date: new Date(),
};

const notePreviews: Record<string, NotesCardProps> = Object.fromEntries(
  Object.entries(previewData).map(([id, preview]) => [
    id,
    { ...preview, notesId: id },
  ]),
);

type GraphNode = {
  id: string;
  label: string;
  degree: number;
};

type GraphLink = {
  source: string | GraphNode;
  target: string;
};

type NodeObject = GraphNode & { x?: number; y?: number };

function resolveVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

const nodeIds = [
  "inbox",
  "git",
  "command-palette",
  "properties",
  "note-list",
  "principles",
  "ai",
  "bottom-bar",
  "projects",
  "people",
  "daily-notes",
  "templates",
  "search",
  "tags",
  "backlinks",
  "graph-view",
  "git-sync",
  "attachments",
  "keyboard-shortcuts",
  "themes",
];

const linkPairs: [string, string][] = [
  ["inbox", "git"],
  ["inbox", "command-palette"],
  ["inbox", "note-list"],
  ["inbox", "daily-notes"],
  ["git", "principles"],
  ["git", "git-sync"],
  ["command-palette", "principles"],
  ["command-palette", "bottom-bar"],
  ["command-palette", "keyboard-shortcuts"],
  ["command-palette", "search"],
  ["properties", "principles"],
  ["properties", "note-list"],
  ["properties", "templates"],
  ["note-list", "principles"],
  ["note-list", "graph-view"],
  ["note-list", "search"],
  ["principles", "ai"],
  ["principles", "tags"],
  ["principles", "backlinks"],
  ["ai", "projects"],
  ["ai", "people"],
  ["ai", "tags"],
  ["bottom-bar", "search"],
  ["bottom-bar", "themes"],
  ["search", "backlinks"],
  ["search", "keyboard-shortcuts"],
  ["graph-view", "backlinks"],
  ["graph-view", "tags"],
  ["templates", "daily-notes"],
  ["templates", "attachments"],
  ["tags", "themes"],
  ["backlinks", "git-sync"],
];

function buildGraph(): { nodes: GraphNode[]; links: GraphLink[] } {
  const degree = new Map<string, number>();
  for (const id of nodeIds) degree.set(id, 0);
  const links: GraphLink[] = [];
  for (const [source, target] of linkPairs) {
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
    links.push({ source, target });
  }
  const nodes: GraphNode[] = nodeIds.map((id) => ({
    id,
    label: id
      .split("-")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" "),
    degree: degree.get(id) ?? 0,
  }));
  return { nodes, links };
}

const graph = buildGraph();

function subscribeToThemeClass(callback: () => void) {
  const observer = new MutationObserver(() => {
    callback();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getThemeClass() {
  return document.documentElement.className;
}

function resolveColors(themeClass?: string) {
  void themeClass;
  return {
    background: resolveVar("--background", "oklch(1 0 0)"),
    node: resolveVar("--muted-foreground", "oklch(0.556 0 0)"),
    nodeActive: resolveVar("--foreground", "oklch(0.145 0 0)"),
    link: resolveVar("--border", "oklch(0.922 0 0)"),
    accent: resolveVar("--primary", "oklch(0.205 0 0)"),
    label: resolveVar("--foreground", "oklch(0.145 0 0)"),
    labelActive: resolveVar("--primary", "oklch(0.205 0 0)"),
  };
}

export default function GraphCanvas() {
  const fgRef = useRef<ForceGraphMethods<NodeObject, GraphLink>>(
    null as unknown as ForceGraphMethods<NodeObject, GraphLink>,
  );
  const themeClass = useSyncExternalStore(
    subscribeToThemeClass,
    getThemeClass,
    () => "",
  );
  const colors = useMemo(() => resolveColors(themeClass), [themeClass]);

  const maxDegree = Math.max(...graph.nodes.map((n) => n.degree));
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const zoomBy = (factor: number) => {
    const current = fgRef.current?.zoom() ?? 1;
    fgRef.current?.zoom(current * factor, 150);
  };

  const [zoomLevel, setZoomLevel] = useState(100);
  const [zoomInput, setZoomInput] = useState<string | null>(null);

  const commitZoom = () => {
    const parsed = parseFloat(zoomInput ?? "") / 100;
    if (!Number.isNaN(parsed) && parsed > 0) {
      fgRef.current?.zoom(parsed, 150);
    }
    setZoomInput(null);
  };

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      {" "}
      {size && (
        <ForceGraph2D
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={{ nodes: [...graph.nodes], links: [...graph.links] }}
          backgroundColor={colors.background}
          cooldownTicks={200}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.35}
          onEngineStop={() => {
            fgRef.current?.zoomToFit(600, 80);
          }}
          onZoom={({ k }) => {
            setZoomLevel(Math.round(k * 100));
          }}
          onNodeHover={(node) => {
            const next = node?.id ?? null;
            if (next !== hoveredId) {
              setHoveredId(next);
            }
          }}
          nodeCanvasObject={(node, ctx, globalScale) => {
            if (node.x == null || node.y == null) return;
            const active = hoveredId === node.id;
            const r = 2.5 + (node.degree / maxDegree) * 4;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r / globalScale, 0, 2 * Math.PI, false);
            ctx.fillStyle = active
              ? colors.nodeActive
              : node.degree >= maxDegree - 2
                ? colors.accent
                : colors.node;
            ctx.fill();

            const fontSize = Math.max(9 / globalScale, 3);
            ctx.font = `${active ? 600 : 400} ${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = active ? colors.labelActive : colors.label;
            ctx.fillText(node.label, node.x, node.y + r / globalScale + 3);
          }}
          nodeLabel="label"
          nodeRelSize={4}
          linkCanvasObject={(link, ctx, globalScale) => {
            const s: NodeObject = link.source as NodeObject;
            const t: NodeObject = link.target as NodeObject;
            if (s.x == null || s.y == null || t.x == null || t.y == null)
              return;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
            ctx.strokeStyle = colors.link;
            ctx.globalAlpha = 0.7;
            ctx.lineWidth = 1 / globalScale;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }}
          linkColor={() => colors.link}
          linkWidth={0}
        />
      )}
      <ButtonGroup className="absolute top-3 right-3 z-10 ">
        <Button
          size="icon"
          variant="gradient_primary"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.2)}
        >
          <ZoomIn />
        </Button>
        <Button
          size="icon"
          variant="gradient_primary"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.2)}
        >
          <ZoomOut />
        </Button>
        <Input
          aria-label="Current zoom level"
          className="h-8 bg-background w-16 text-center font-mono text-xs tabular-nums"
          value={zoomInput ?? `${zoomLevel}%`}
          onChange={(e) => {
            setZoomInput(e.target.value);
          }}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setZoomInput(null);
              e.currentTarget.blur();
            }
          }}
          onBlur={() => commitZoom()}
        />
        <Button
          size="icon"
          variant="gradient_primary"
          aria-label="Fit graph"
          onClick={() => fgRef.current?.zoomToFit(150, 80)}
        >
          <Maximize />
        </Button>
      </ButtonGroup>
      {hoveredId && mousePos && (
        <div
          className="pointer-events-none absolute z-20 w-64 rounded-lg border bg-card/90 shadow-md backdrop-blur-xs"
          style={{
            left: Math.min(
              Math.max(mousePos.x + 16, 0),
              Math.max((size?.width ?? 0) - 272, 0),
            ),
            top: mousePos.y + 16,
          }}
        >
          <NotesCard {...(notePreviews[hoveredId] ?? placeholder)} />
        </div>
      )}
    </div>
  );
}
