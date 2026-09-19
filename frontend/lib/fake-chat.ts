import type { ChatThread } from "@/lib/api";

const noteTitle = "A Jobless Future: A New Renaissance?";

export const FAKE_CHAT: ChatThread = {
  session: {
    id: "fake-session-jobless-future",
    note_id: "fake-note-jobless-future",
    title: "How would we survive without pay?",
    provider: "ollama",
    model: "qwen2.5:7b",
    created_at: "2026-09-20T10:12:00Z",
  },
  messages: [
    {
      id: "fake-msg-1",
      role: "user",
      content:
        "What does this note say about how we should feel about a jobless future?",
      created_at: "2026-09-20T10:12:10Z",
    },
    {
      id: "fake-msg-2",
      role: "assistant",
      content:
        'The note reframes joblessness as potential liberation rather than only a threat ("From Fear to Excitement"). For a speaker in the transcript, within about 50 years people may no longer need paid work to survive, and the feeling proposed is excitement: freedom from working for pay could allow people to pursue what they truly want to do.',
      created_at: "2026-09-20T10:12:14Z",
    },
    {
      id: "fake-msg-3",
      role: "user",
      content: "What would people actually do with that freedom, according to the note?",
      created_at: "2026-09-20T10:13:02Z",
    },
    {
      id: "fake-msg-4",
      role: "assistant",
      content:
        "The note describes a \"New Human Renaissance\": people could devote themselves to art, dance, and music; invention and creativity; caring for others; or whatever they feel drawn to do. The point is that the vision is not an end to human activity, but an end to compulsory paid work.",
      created_at: "2026-09-20T10:13:07Z",
    },
    {
      id: "fake-msg-5",
      role: "user",
      content:
        "Does it address the economics? Like who pays rent and food if nobody is paid?",
      created_at: "2026-09-20T10:14:20Z",
    },
    {
      id: "fake-msg-6",
      role: "assistant",
      content:
        'No — the note itself flags this as an open question: "The transcript offers a vision, but does not explain how people\'s material needs would be met or how the transition would be managed." It only mentions that the transition would involve setbacks, uneven progress, and that politics could obstruct change.',
      created_at: "2026-09-20T10:14:25Z",
    },
    {
      id: "fake-msg-7",
      role: "user",
      content: "OK, summarize this note in one sentence.",
      created_at: "2026-09-20T10:15:01Z",
    },
    {
      id: "fake-msg-8",
      role: "assistant",
      content:
        "A future without the need to earn a living could unlock human creativity, care, and purpose, and the speaker presents it as an inspiring goal worth working toward together.",
      created_at: "2026-09-20T10:15:06Z",
    },
  ],
};

export const FAKE_CHAT_SOURCES: string[] = [noteTitle];
