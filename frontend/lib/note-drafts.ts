import type { Block } from "@blocknote/core";

export type NoteDraft = {
  blocks: Block[];
  baseline: string;
  updatedAt: number;
};
type Drafts = Record<string, NoteDraft>;
type Snapshot = { drafts: Drafts; storageFailed: boolean };
const empty: Snapshot = { drafts: {}, storageFailed: false };

// Session storage keeps drafts across refreshes without competing with other tabs.
export function createDraftStore(getStorage: () => Storage, key: string) {
  let snapshot: Snapshot | undefined;
  const listeners = new Set<() => void>();
  function getSnapshot(): Snapshot {
    if (snapshot) return snapshot;
    try {
      const value = JSON.parse(getStorage().getItem(key) ?? "{}");
      const drafts: Drafts = {};
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [id, draft] of Object.entries(value)) {
          const item = draft as NoteDraft;
          if (
            item &&
            Array.isArray(item.blocks) &&
            item.blocks.length &&
            typeof item.baseline === "string" &&
            Number.isFinite(item.updatedAt)
          ) {
            drafts[id] = item;
          }
        }
      }
      snapshot = { drafts, storageFailed: false };
    } catch {
      snapshot = { drafts: {}, storageFailed: true };
    }
    return snapshot;
  }
  function update(drafts: Drafts) {
    let storageFailed = false;
    try {
      getStorage().setItem(key, JSON.stringify(drafts));
    } catch {
      storageFailed = true;
    }
    snapshot = { drafts, storageFailed };
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot,
    getServerSnapshot: () => empty,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(id: string, draft: NoteDraft) {
      update({ ...getSnapshot().drafts, [id]: draft });
    },
    clear(id: string, savedBlocks?: string) {
      const drafts = { ...getSnapshot().drafts };
      if (
        !drafts[id] ||
        (savedBlocks && JSON.stringify(drafts[id].blocks) !== savedBlocks)
      )
        return;
      delete drafts[id];
      update(drafts);
    },
  };
}

export function draftsFirst<T extends { id: string }>(
  notes: T[],
  drafts: Drafts,
): T[] {
  return [...notes].sort(
    (a, b) => (drafts[b.id]?.updatedAt ?? 0) - (drafts[a.id]?.updatedAt ?? 0),
  );
}
