import { create } from "zustand";
import {
  COMPRESS_WORKSPACE_KEY,
  createCompressionDraft,
  decodeCompressionDraft,
  type CompressionDraft,
} from "../pages/compress-page/compress-model";
function load() {
  try {
    return {
      draft: decodeCompressionDraft(
        localStorage.getItem(COMPRESS_WORKSPACE_KEY),
      ),
      storageError: false,
    };
  } catch {
    return {
      draft: { ...createCompressionDraft(), locked: true },
      storageError: true,
    };
  }
}
export const useCompressionWorkspace = create<{
  draft: CompressionDraft;
  busy: boolean;
  storageError: boolean;
  save: (update: (draft: CompressionDraft) => CompressionDraft) => boolean;
}>((set, get) => ({
  ...load(),
  busy: false,
  save(update) {
    const draft = update(get().draft);
    try {
      localStorage.setItem(COMPRESS_WORKSPACE_KEY, JSON.stringify(draft));
    } catch {
      set({ storageError: true });
      return false;
    }
    set({ draft, storageError: false });
    return true;
  },
}));
