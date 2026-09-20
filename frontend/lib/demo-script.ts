import type { GraphData, JobStatus } from "@/lib/api";
import type { PartialBlock } from "@blocknote/core";

export const DEMO_SOURCE_ID = "demo-source-1";
export const DEMO_NOTE_1_ID = "demo-note-1";
export const DEMO_NOTE_2_ID = "demo-note-2";

export const DEMO_FILE = {
  name: "jobless-future-panel.mp4",
  kind: "video",
};

const created = "2026-09-20T10:12:00Z";

export const DEMO_NOTE_1_TITLE = "A Jobless Future: A New Renaissance?";
export const DEMO_NOTE_2_TITLE = "Universal Basic Income Notebooks";
export const DEMO_CONCEPTS = ["jobless future", "paid work", "new renaissance"];

export const DEMO_NOTE_1_CONTENT = `# A Jobless Future: A New Renaissance?

**Core idea.** Rather than fearing a jobless future, we could see it as an opportunity: freedom from working for pay could allow people to pursue what they truly want to do.

**A new human renaissance.** People could devote themselves to art, dance, and music; invention and creativity; caring for others. The vision is not an end to human activity, but an end to compulsory paid work.

**Challenges.** The transition would involve setbacks and uneven progress, and politics could obstruct change.

See the connected note: [[Universal Basic Income Notebooks]] for how people's material needs might actually be met during the transition.
`;

export const DEMO_NOTE_2_CONTENT = `# Universal Basic Income Notebooks

**Open question.** If paid work disappears, who pays rent and food when nobody is paid?

**Proposed instruments.** Universal basic income, public services, and shared compute dividends surface as candidate answers.

**Unresolved.** How the transition would be financed and managed politically.
`;

export const mockSource = (status: "queued" | JobStatus = "done") => ({
  id: DEMO_SOURCE_ID,
  kind: "audio",
  original_name: "jobless-future-panel.mp3",
  status,
  created_at: created,
});
export const mockSourceDetail = (status: JobStatus = "done") => ({
  ...mockSource(status),
  error: null,
  transcript_url: status === "done" ? `/sources/${DEMO_SOURCE_ID}/transcript` : null,
});
export const mockJob = (status: JobStatus) => ({
  source_id: DEMO_SOURCE_ID,
  status,
  error: null,
  notes: status === "done" ? [noteSummary(1)] : [],
  transcript_url: status === "done" ? `/sources/${DEMO_SOURCE_ID}/transcript` : null,
});

export function mockTranscript() {
  return {
    source_id: DEMO_SOURCE_ID,
    content: DEMO_TRANSCRIPT,
    language: "en",
    duration_seconds: 640,
    segments: [0, 1].map(index => ({ start: index * 20, end: index * 20 + 18, text: "..." })),
    model: "whisper-base",
    created_at: created,
  };
}

export const DEMO_TRANSCRIPT = `Transcript — Panels of the Future, episode 47.

Guest: So I want to push back on the doom framing around a jobless future. For thousands of years, our lives have been shaped by the need to earn a living.

Within fifty years, it's plausible nobody needs paid work to survive. That is freedom, not collapse: art, dance, music, invention, caring for each other.

Is it utopian? Maybe — but if building that future is utopian thinking, I am a utopian.

The transition is the hard part: setbacks, uneven progress, politics fighting it every step.`;

export function noteSummary(which: 1 | 2) {
  return {
    id: which === 1 ? DEMO_NOTE_1_ID : DEMO_NOTE_2_ID,
    source_id: DEMO_SOURCE_ID,
    title: which === 1 ? DEMO_NOTE_1_TITLE : DEMO_NOTE_2_TITLE,
    created_at: created,
  };
}

export function noteDetail(which: 1 | 2) {
  const blocks: PartialBlock[] | null = null;
  return {
    ...noteSummary(which),
    content: which === 1 ? DEMO_NOTE_1_CONTENT : DEMO_NOTE_2_CONTENT,
    blocks,
  };
}

export function intelligence(which: 1 | 2) {
  const done =
    which === 1
      ? [
          {
            note_id: DEMO_NOTE_2_ID,
            title: DEMO_NOTE_2_TITLE,
            score: 0.81,
            concepts: ["universal basic income"],
          },
        ]
      : [
          {
            note_id: DEMO_NOTE_1_ID,
            title: DEMO_NOTE_1_TITLE,
            score: 0.81,
            concepts: ["jobless future", "new renaissance"],
          },
        ];
  return {
    note_id: which === 1 ? DEMO_NOTE_1_ID : DEMO_NOTE_2_ID,
    enabled: true,
    status: "done" as JobStatus,
    error: null,
    summary:
      "The source argues a future without compulsory paid work could unlock a human renaissance in art, care, and invention, while flagging politics and uneven transitions as the main obstacles.",
    concepts: which === 1 ? DEMO_CONCEPTS : ["universal basic income"],
    related_notes: done,
    mentions: [],
    indexed_at: created,
    model: "qwen2.5:7b",
    input_kind: "source_transcript",
  };
}

export const demoGraph = (): GraphData => ({
  nodes: [
    { ...noteSummary(1) },
    { ...noteSummary(2) },
    { id: "demo-node-3", source_id: DEMO_SOURCE_ID, title: "Other income plans", created_at: created },
    { id: "demo-node-4", source_id: DEMO_SOURCE_ID, title: "Utopian thinking", created_at: created },
    { id: "demo-node-5", source_id: DEMO_SOURCE_ID, title: "End of labor", created_at: created },
    { id: "demo-node-6", source_id: DEMO_SOURCE_ID, title: "Automation waves", created_at: created },
    { id: "demo-node-7", source_id: DEMO_SOURCE_ID, title: "Four-day week", created_at: created },
    { id: "demo-node-8", source_id: DEMO_SOURCE_ID, title: "Care economy", created_at: created },
  ],
  edges: [
    {
      src_id: DEMO_NOTE_1_ID,
      dst_id: DEMO_NOTE_2_ID,
      weight: 0.81,
      kind: "concept",
      concepts: ["universal basic income"],
    },
    {
      src_id: DEMO_NOTE_1_ID,
      dst_id: "demo-node-3",
      weight: 0.64,
      kind: "concept",
      concepts: ["jobless future"],
    },
    {
      src_id: DEMO_NOTE_1_ID,
      dst_id: "demo-node-4",
      weight: 0.71,
      kind: "concept",
      concepts: ["utopia"],
    },
    {
      src_id: DEMO_NOTE_1_ID,
      dst_id: "demo-node-5",
      weight: 0.68,
      kind: "concept",
      concepts: ["paid work"],
    },
    {
      src_id: DEMO_NOTE_2_ID,
      dst_id: "demo-node-3",
      weight: 0.9,
      kind: "concept",
      concepts: ["income floor"],
    },
    {
      src_id: DEMO_NOTE_2_ID,
      dst_id: "demo-node-4",
      weight: 0.45,
      kind: "concept",
      concepts: ["utopia"],
    },
    {
      src_id: "demo-node-5",
      dst_id: "demo-node-6",
      weight: 0.62,
      kind: "concept",
      concepts: ["automation"],
    },
    {
      src_id: "demo-node-5",
      dst_id: "demo-node-7",
      weight: 0.5,
      kind: "concept",
      concepts: ["paid work"],
    },
    {
      src_id: "demo-node-3",
      dst_id: "demo-node-8",
      weight: 0.58,
      kind: "concept",
      concepts: ["care economy"],
    },
    {
      src_id: "demo-node-4",
      dst_id: "demo-node-6",
      weight: 0.39,
      kind: "concept",
      concepts: ["politics"],
    },
    {
      src_id: "demo-node-7",
      dst_id: "demo-node-8",
      weight: 0.47,
      kind: "concept",
      concepts: ["paid work"],
    },
  ],
});

export const DEMO_CHAT_PROVIDERS = {
  providers: [
    {
      id: "ollama",
      label: "Ollama (demo)",
      kind: "local_llm" as const,
      available: true,
      models: ["qwen2.5:7b"],
    },
  ],
};
