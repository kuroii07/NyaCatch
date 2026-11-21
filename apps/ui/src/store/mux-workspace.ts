import { create } from "zustand";
import {
  MUX_WORKSPACE_KEY,
  createMuxDraft,
  decodeMuxDraft,
  type MuxDraft,
} from "../pages/mux-page/mux-model";
function load() {
  try {
    return {
      draft: decodeMuxDraft(localStorage.getItem(MUX_WORKSPACE_KEY)),
      storageError: false,
    };
  } catch {
    return { draft: { ...createMuxDraft(), locked: true }, storageError: true };
  }
}
export const useMuxWorkspace = create<{
  draft: MuxDraft;
  busy: boolean;
  storageError: boolean;
  save: (update: (d: MuxDraft) => MuxDraft) => boolean;
}>((set, get) => ({
  ...load(),
  busy: false,
  save(update) {
    const draft = update(get().draft);
    try {
      localStorage.setItem(MUX_WORKSPACE_KEY, JSON.stringify(draft));
    } catch {
      set({ storageError: true });
      return false;
    }
    set({ draft, storageError: false });
    return true;
  },
}));
