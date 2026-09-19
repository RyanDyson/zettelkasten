"use client";

import { useSyncExternalStore } from "react";
import { API_URL } from "@/lib/api";
import { createDraftStore } from "@/lib/note-drafts";

export const noteDrafts = createDraftStore(
  () => window.sessionStorage,
  `zettelkasten:note-drafts:v1:${API_URL}`,
);

export function useNoteDrafts() {
  return useSyncExternalStore(
    noteDrafts.subscribe,
    noteDrafts.getSnapshot,
    noteDrafts.getServerSnapshot,
  );
}
