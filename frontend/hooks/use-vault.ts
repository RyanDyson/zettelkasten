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
