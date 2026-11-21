import { create } from "zustand";
import {
  CONVERTER_WORKSPACE_KEY,
  createConverterWorkspace,
  decodeConverterWorkspace,
  encodeConverterWorkspace,
  type ConverterWorkspace,
} from "../pages/converter-page/converter-workspace";

function load() {
  try {
    return {
      workspace: decodeConverterWorkspace(
        localStorage.getItem(CONVERTER_WORKSPACE_KEY),
      ),
      storageError: false,
    };
  } catch {
    return { workspace: createConverterWorkspace(), storageError: true };
  }
}
interface ConverterStore {
  workspace: ConverterWorkspace;
  storageError: boolean;
  submitting: boolean;
  save: (
    update: (workspace: ConverterWorkspace) => ConverterWorkspace,
  ) => boolean;
}
export const useConverterWorkspace = create<ConverterStore>((set, get) => ({
  ...load(),
  submitting: false,
  save: (update) => {
    const workspace = update(get().workspace);
    try {
      // Persist the submission lock before creating any task, including across page changes.
      localStorage.setItem(
        CONVERTER_WORKSPACE_KEY,
        encodeConverterWorkspace(workspace),
      );
    } catch {
      set({ storageError: true });
      return false;
    }
    set({ workspace, storageError: false });
    return true;
  },
}));
