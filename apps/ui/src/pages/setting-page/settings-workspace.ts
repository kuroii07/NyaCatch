import { create } from "zustand";
import {
  matches,
  reconcile,
  snapshot,
  type Draft,
  type DraftKind,
  type Values,
} from "./settings-model";

type Workspace = {
  drafts: Partial<Record<DraftKind, Draft>>;
  saving: boolean;
  saveState: "saved" | "saving" | "failed";
  retry?: Values;
  sync: (kind: DraftKind, current: Values) => void;
  edit: (kind: DraftKind, values: Values) => void;
  reset: (kind: DraftKind, current: Values) => void;
};
function discardRetry(state: Workspace, kind: DraftKind): Partial<Workspace> {
  if (!state.retry || state.saving) return {};
  const keys = new Set<string>(Object.keys(snapshot(kind, {})));
  const retry = Object.fromEntries(
    Object.entries(state.retry).filter(([key]) => !keys.has(key)),
  );
  return Object.keys(retry).length
    ? { retry }
    : { retry: undefined, saveState: "saved" };
}
// Secrets in uncommitted drafts live only in renderer memory, never browser storage.
export const useSettingsWorkspace = create<Workspace>((set) => ({
  drafts: {},
  saving: false,
  saveState: "saved",
  sync: (kind, current) =>
    set((state) => {
      const previous = state.drafts[kind];
      return {
        drafts: {
          ...state.drafts,
          [kind]: previous
            ? reconcile(previous, current)
            : { base: current, values: current, conflict: false },
        },
      };
    }),
  edit: (kind, values) =>
    set((state) => {
      const entry = state.drafts[kind];
      return entry
        ? {
            ...discardRetry(state, kind),
            drafts: {
              ...state.drafts,
              [kind]: { ...entry, values: { ...entry.values, ...values } },
            },
          }
        : {};
    }),
  reset: (kind, current) =>
    set((state) => ({
      ...discardRetry(state, kind),
      drafts: {
        ...state.drafts,
        [kind]: { base: current, values: current, conflict: false },
      },
    })),
}));
export async function saveSettings(
  values: Values,
  write: (values: Values) => Promise<unknown>,
  read: () => Promise<Values>,
  update: (values: Values) => void,
): Promise<boolean> {
  if (useSettingsWorkspace.getState().saving) return false;
  if (!Object.keys(values).length) return true;
  useSettingsWorkspace.setState({
    saving: true,
    saveState: "saving",
    retry: values,
  });
  try {
    await write(values);
    update(values);
    useSettingsWorkspace.setState({ saveState: "saved", retry: undefined });
    return true;
  } catch {
    // A lost response may follow a successful atomic write. Read before offering retry.
    try {
      const current = await read();
      update(current);
      if (matches(current, values)) {
        useSettingsWorkspace.setState({ saveState: "saved", retry: undefined });
        return true;
      }
    } catch {
      /* Keep the requested values for explicit retry. */
    }
    useSettingsWorkspace.setState({ saveState: "failed" });
    return false;
  } finally {
    useSettingsWorkspace.setState({ saving: false });
  }
}
