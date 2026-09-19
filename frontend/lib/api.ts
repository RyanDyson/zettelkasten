import type { PartialBlock } from "@blocknote/core";
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

export type JobStatus = "queued" | "processing" | "done" | "failed";
export type Source = {
  id: string;
  kind: string;
  original_name: string;
  status: JobStatus;
  created_at: string;
};
export type SourceDetail = Source & {
  error: string | null;
  transcript_url: string | null;
};
export type Note = {
  id: string;
  source_id: string | null;
  title: string;
  created_at: string;
};
export type NoteDetail = Note & {
  content: string;
  blocks?: PartialBlock[] | null;
};
export type Transcript = {
  source_id: string;
  content: string;
  language: string | null;
  duration_seconds: number | null;
  segments: { start: number; end: number; text: string }[];
  model: string | null;
  created_at: string;
};
export type Job = {
  source_id: string;
  status: JobStatus;
  error: string | null;
  notes: Note[];
  transcript_url: string | null;
};
export type AcceptedJob = {
  source_id: string;
  status: JobStatus;
  poll: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      cache: "no-store",
    });
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    throw new Error(
      "Cannot reach the backend. Check that it is running and try again.",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item: { msg?: string }) => item.msg || "Invalid input")
              .join(". ")
          : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

// The backend paginates at 100 records. Load every page rather than silently hiding older notes.
export async function listAll<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await request<T[]>(`${path}?limit=100&offset=${offset}`, {
      signal,
    });
    result.push(...page);
    if (page.length < 100) return result;
  }
}

export const sourceFileUrl = (id: string) =>
  `${API_URL}/sources/${encodeURIComponent(id)}/file`;
export const transcriptDownloadUrl = (id: string) =>
  `${API_URL}/sources/${encodeURIComponent(id)}/transcript/download`;
export const ACCEPTED_EXTENSIONS =
  ".pdf,.mp3,.wav,.m4a,.flac,.ogg,.aac,.opus,.mp4,.mkv,.webm,.mov,.avi,.m4v";

export function validateUpload(
  file: Pick<File, "name" | "size">,
): string | null {
  const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (!ACCEPTED_EXTENSIONS.split(",").includes(extension))
    return "Choose a PDF, audio, or video file in a supported format.";
  if (file.size === 0) return "This file is empty. Choose a file with content.";
  return null;
}

export async function uploadFile(file: File): Promise<AcceptedJob> {
  const error = validateUpload(file);
  if (error) throw new Error(error);
  const form = new FormData();
  form.append("file", file);
  return request<AcceptedJob>("/ingest", { method: "POST", body: form });
}

export type GraphEdge = {
  src_id: string;
  dst_id: string;
  weight: number;
  kind: string;
  concepts: string[];
};
export type GraphData = { nodes: Note[]; edges: GraphEdge[] };
export type Intelligence = {
  note_id: string;
  enabled: boolean;
  status: "not_indexed" | JobStatus;
  error: string | null;
  summary: string | null;
  concepts: string[];
  related_notes: {
    note_id: string;
    title: string;
    score: number;
    concepts: string[];
  }[];
  indexed_at: string | null;
  model: string | null;
  chunk_count: number | null;
};
export type IntelligenceStatus = {
  enabled: boolean;
  worker: "running" | "stopped";
  counts: Record<JobStatus, number>;
  unindexed: number;
};
