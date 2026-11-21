import { create } from "zustand";
import {
  createMergeDraft,
  decodeMergeDraft,
  MERGE_WORKSPACE_KEY,
  type MergeDraft,
} from "../pages/merge-page/merge-model";

function load() {
  try {
    return {
      draft: decodeMergeDraft(localStorage.getItem(MERGE_WORKSPACE_KEY)),
      storageError: false,
    };
  } catch {
    return {
      draft: { ...createMergeDraft(), locked: true },
      storageError: true,
    };
  }
}
export const useMergeWorkspace = create<{
  draft: MergeDraft;
  busy: boolean;
  storageError: boolean;
  save: (update: (draft: MergeDraft) => MergeDraft) => boolean;
}>((set, get) => ({
  ...load(),
  busy: false,
  save(update) {
    const draft = update(get().draft);
    try {
      localStorage.setItem(MERGE_WORKSPACE_KEY, JSON.stringify(draft));
    } catch {
      set({ storageError: true });
      return false;
    }
    set({ draft, storageError: false });
    return true;
  },
}));
