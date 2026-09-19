"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  listAll,
  request,
  type AcceptedJob,
  type Job,
  type Note,
  type NoteDetail,
  type Source,
  type SourceDetail,
  type Transcript,
} from "@/lib/api";

export function useNotes() {
  return useQuery({
    queryKey: ["notes"],
    queryFn: ({ signal }) => listAll<Note>("/notes", signal),
    refetchInterval: 5000,
  });
}
export function useSources() {
  return useQuery({
    queryKey: ["sources"],
    queryFn: ({ signal }) => listAll<Source>("/sources", signal),
    refetchInterval: 2000,
  });
}
export function useNote(id: string) {
  return useQuery({
    queryKey: ["note", id],
    queryFn: ({ signal }) =>
      request<NoteDetail>(`/notes/${encodeURIComponent(id)}`, { signal }),
  });
}
export function useSource(id: string | null) {
  return useQuery({
    queryKey: ["source", id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      request<SourceDetail>(`/sources/${encodeURIComponent(id!)}`, { signal }),
    refetchInterval: (query) =>
      ["queued", "processing"].includes(query.state.data?.status ?? "")
        ? 1500
        : false,
  });
}
export function useJob(id: string) {
  return useQuery({
    queryKey: ["job", id],
    queryFn: ({ signal }) =>
      request<Job>(`/jobs/${encodeURIComponent(id)}`, { signal }),
    refetchInterval: (query) =>
      ["done", "failed"].includes(query.state.data?.status ?? "")
        ? false
        : 1500,
  });
}
export function useTranscript(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["transcript", id],
    enabled: !!id && enabled,
    queryFn: ({ signal }) =>
      request<Transcript>(`/sources/${encodeURIComponent(id!)}/transcript`, {
        signal,
      }),
  });
}
export function useRetryJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<AcceptedJob>(`/jobs/${encodeURIComponent(id)}/retry`, {
        method: "POST",
      }),
    onSuccess: async (_, id) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["sources"] }),
        client.invalidateQueries({ queryKey: ["source", id] }),
        client.invalidateQueries({ queryKey: ["job", id] }),
      ]);
    },
  });
}
export function shouldRetry(failureCount: number, error: Error) {
  return !(error instanceof ApiError && error.status < 500) && failureCount < 1;
}

export function useGraph() {
  return useQuery({
    queryKey: ["graph"],
    queryFn: ({ signal }) =>
      request<import("@/lib/api").GraphData>("/graph", { signal }),
    refetchInterval: 5000,
  });
}
export function useIntelligence(id: string) {
  return useQuery({
    queryKey: ["intelligence", id],
    queryFn: ({ signal }) =>
      request<import("@/lib/api").Intelligence>(
        `/notes/${encodeURIComponent(id)}/intelligence`,
        { signal },
      ),
    refetchInterval: 3000,
  });
}
export function useIntelligenceStatus() {
  return useQuery({
    queryKey: ["intelligence-status"],
    queryFn: ({ signal }) =>
      request<import("@/lib/api").IntelligenceStatus>("/intelligence/status", {
        signal,
      }),
    refetchInterval: 3000,
  });
}

export type ChatScope = { noteId?: string; enabled?: boolean };
export function useChatProviders() {
  return useQuery({
    queryKey: ["chat-providers"],
    queryFn: ({ signal }) =>
      request<import("@/lib/api").ChatProviders>("/chat/providers", { signal }),
    staleTime: 30_000,
  });
}
export function useChatSessions(scope: ChatScope) {
  const noteId = scope.noteId ?? null;
  return useQuery({
    queryKey: ["chat-sessions", noteId],
    queryFn: ({ signal }) =>
      request<import("@/lib/api").ChatSession[]>(
        `/chat/sessions${noteId ? `?note_id=${encodeURIComponent(noteId)}` : ""}`,
        { signal },
      ),
    enabled: scope.enabled !== false,
  });
}
export function useChatThread(id: string | null) {
  return useQuery({
    queryKey: ["chat", id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      request<import("@/lib/api").ChatThread>(
        `/chat/sessions/${encodeURIComponent(id!)}`,
        { signal },
      ),
  });
}
export function useCreateChatSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { note_id?: string; provider: string; model?: string | null }) =>
      request<import("@/lib/api").ChatSession>("/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["chat-sessions"] }),
  });
}
export function useSendChatMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { sessionId: string; content: string; provider?: string; model?: string | null }) =>
      request<import("@/lib/api").ChatReply>(
        `/chat/sessions/${encodeURIComponent(body.sessionId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: body.content,
            provider: body.provider,
            model: body.model,
          }),
        },
      ),
    onSuccess: async (reply, variables) => {
      client.invalidateQueries({ queryKey: ["chat-sessions"] });
      await client.invalidateQueries({ queryKey: ["chat", variables.sessionId] });
    },
  });
}
export function useDeleteChatSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string; deleted: boolean }>(
        `/chat/sessions/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_, id) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["chat-sessions"] }),
        client.removeQueries({ queryKey: ["chat", id] }),
      ]);
    },
  });
}
