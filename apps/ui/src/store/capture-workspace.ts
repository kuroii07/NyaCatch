import { create } from "zustand";
import {
  CAPTURE_WORKSPACE_KEY,
  createCaptureDraft,
  decodeCaptureDraft,
  type CaptureDraft,
} from "../pages/capture-page/capture-model";
function load() {
  try {
    return {
      draft: decodeCaptureDraft(localStorage.getItem(CAPTURE_WORKSPACE_KEY)),
      storageError: false,
    };
  } catch {
    return {
      draft: { ...createCaptureDraft(), locked: true },
      storageError: true,
    };
  }
}
export const useCaptureWorkspace = create<{
  draft: CaptureDraft;
  busy: boolean;
  storageError: boolean;
  save: (update: (draft: CaptureDraft) => CaptureDraft) => boolean;
}>((set, get) => ({
  ...load(),
  busy: false,
  save(update) {
    const draft = update(get().draft);
    try {
      localStorage.setItem(CAPTURE_WORKSPACE_KEY, JSON.stringify(draft));
    } catch {
      set({ storageError: true });
      return false;
    }
    set({ draft, storageError: false });
    return true;
  },
}));
