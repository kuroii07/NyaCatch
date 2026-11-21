import { create } from "zustand";
import {
  TRIM_WORKSPACE_KEY,
  createTrimWorkspace,
  decodeTrimWorkspace,
  type TrimWorkspace,
} from "../pages/trim-page/trim-model";

function load() {
  try {
    return {
      draft: decodeTrimWorkspace(localStorage.getItem(TRIM_WORKSPACE_KEY)),
      storageError: false,
    };
  } catch {
    return {
      draft: { ...createTrimWorkspace(), locked: true },
      storageError: true,
    };
  }
}
export const useTrimWorkspace = create<{
  draft: TrimWorkspace;
  busy: boolean;
  storageError: boolean;
  save: (update: (draft: TrimWorkspace) => TrimWorkspace) => boolean;
}>((set, get) => ({
  ...load(),
  busy: false,
  save(update) {
    const draft = update(get().draft);
    try {
      localStorage.setItem(TRIM_WORKSPACE_KEY, JSON.stringify(draft));
    } catch {
      set({ storageError: true });
      return false;
    }
    set({ draft, storageError: false });
    return true;
  },
}));
