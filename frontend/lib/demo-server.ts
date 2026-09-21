// In-browser mock API server for the guided demo: while enabled, every request
// the app makes to the FastAPI backend is answered here, with a short
// simulated processing timeline (queued -> processing -> done).
import { API_URL, type JobStatus } from "@/lib/api";
import {
  DEMO_CHAT_PROVIDERS,
  DEMO_NOTE_1_ID,
  DEMO_SOURCE_ID,
  demoGraph,
  intelligence,
  mockJob,
  mockSource,
  mockSourceDetail,
  mockTranscript,
  noteDetail,
} from "@/lib/demo-script";

type Phase = "empty" | "queued" | "processing" | "done";

const state: { phase: Phase; timers: number[] } = {
  phase: "empty",
  timers: [],
};

function schedule(ms: number, run: () => void) {
  state.timers.push(window.setTimeout(run, ms));
}

function phase(): Phase {
  return state.phase;
}

function status(): JobStatus {
  return state.phase === "empty" ? "queued" : state.phase;
}

function timeline() {
  state.phase = "queued";
  schedule(500, () => {
    state.phase = "processing";
  });
  schedule(3400, () => {
    state.phase = "done";
  });
}

function respond(body: unknown, contentType = "application/json") {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    headers: { "Content-Type": contentType },
  });
}

function route(pathname: string, method: string): { body: unknown; contentType?: string } | null {
  if (method !== "GET" && pathname !== "/ingest") {
    // Demo writes (note saves, chat sends) resolve so hooks stay healthy.
    return { body: {} };
  }
  if (pathname === "/ingest") {
    if (state.phase === "empty") timeline();
    return {
      body: { source_id: DEMO_SOURCE_ID, status: "queued", poll: `/jobs/${DEMO_SOURCE_ID}` },
    };
  }
  if (pathname === "/health")
    return { body: { detail: "Demo mode uses local mock data." } };
  if (pathname === "/sources")
    return { body: phase() === "empty" ? [] : [mockSource(status())] };
  if (pathname === `/sources/${DEMO_SOURCE_ID}`) {
    // Serves in any phase; accidents like reaching the page before the upload
    // step still get a sane queued source instead of a shapeless payload.
    if (phase() === "empty") timeline();
    return { body: mockSourceDetail(status()) };
  }
  if (pathname === `/sources/${DEMO_SOURCE_ID}/transcript` && phase() === "done")
    return { body: mockTranscript() };
  if (pathname === `/sources/${DEMO_SOURCE_ID}/transcript/download` && phase() === "done")
    return { body: mockTranscript().content, contentType: "text/markdown" };
  if (pathname === `/sources/${DEMO_SOURCE_ID}/file`)
    return { body: "demo", contentType: "audio/wav" };
  if (pathname === `/jobs/${DEMO_SOURCE_ID}`)
    return { body: mockJob(status()) };

  if (pathname.startsWith("/chat")) {
    if (pathname === "/chat/providers") return { body: DEMO_CHAT_PROVIDERS };
    if (method === "GET") return { body: [] }; // chat session lists & threads
    return { body: {} };
  }
  if (pathname === "/notes" || pathname.startsWith("/notes/")) {
    if (pathname === "/notes")
      return {
        body: phase() === "done" ? [noteSummaryRest(1), noteSummaryRest(2)] : [],
      };
    if (pathname === `/notes/${DEMO_NOTE_1_ID}`)
      return { body: noteDetail(1) };
    if (pathname === "/notes/demo-note-2")
      return { body: noteDetail(2) };
    if (pathname === `/notes/${DEMO_NOTE_1_ID}/intelligence`)
      return { body: intelligence(1) };
    if (pathname === "/notes/demo-note-2/intelligence")
      return { body: intelligence(2) };
    if (pathname.startsWith("/notes/") && pathname.endsWith("/intelligence"))
      return { body: intelligence(1) };
    return { body: {} };
  }
  if (pathname === "/graph")
    return {
      body: phase() === "done" ? demoGraph() : { nodes: [], edges: [] },
    };
  if (pathname === "/intelligence/status")
    return {
      body: {
        enabled: true,
        worker: "running",
        counts: { queued: 0, processing: 0, done: phase() === "done" ? 1 : 0, failed: 0 },
        unindexed: phase() === "done" ? 0 : 1,
      },
    };
  return { body: [] };
}

function noteSummaryRest(which: 1 | 2) {
  const full = noteDetail(which);
  return { ...full, content: undefined, blocks: undefined };
}

let originalFetch: typeof fetch | null = null;

export function enableDemoServer() {
  if (originalFetch) return;
  originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(API_URL)) return originalFetch!(input, init);
    const pathname = url.slice(API_URL.length).split("?")[0];
    const method = (init?.method ?? "GET").toUpperCase();
    try {
      const match = route(pathname, method);
      if (match) return respond(match.body, match.contentType);
      return respond({ detail: `Demo has no mock for ${pathname}` }, undefined);
    } catch {
      return respond({ detail: "Demo mock error." });
    }
  };
}

export function disableDemoServer() {
  if (!originalFetch) return;
  state.timers.forEach(timer => window.clearTimeout(timer));
  state.timers = [];
  state.phase = "empty";
  window.fetch = originalFetch;
  originalFetch = null;
}
