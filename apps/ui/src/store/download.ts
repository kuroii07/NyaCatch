import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";
import { shallow } from "zustand/shallow";

// Allow Immer to work with Map in state
enableMapSet();

// The core reports percentages on a 0–100 scale, including values below 1%.
const normalizePercent = (value: string | number | undefined) => {
  const num = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.min(100, num);
};
interface DownloadEvent {
  percent: string;
  speed: string;
  id: number;
}

interface DownloadStore {
  count: number;
  events: DownloadEvent[];
  eventsMap: Map<string, DownloadEvent>;
}

const initialState: DownloadStore = {
  count: 0,
  events: [],
  eventsMap: new Map(),
};

type Actions = {
  resetEvent: (id: number) => void;
  clearCount: () => void;
  increase: () => void;
  setEvents: (events: DownloadEvent[]) => void;
};

export const useDownloadStore = create<DownloadStore & Actions>()(
  immer((set, get) => ({
    ...initialState,
    resetEvent: (id) =>
      set((state) => {
        state.eventsMap.delete(String(id));
        state.events = state.events.filter((item) => item.id !== id);
      }),
    clearCount: () =>
      set((state) => {
        state.count = 0;
      }),
    increase: () =>
      set((state) => {
        state.count += 1;
      }),
    setEvents: (events: DownloadEvent[]) =>
      set((state) => {
        const previousState = get();
        const normalized = events.map((item) => {
          const previous = previousState.eventsMap.get(String(item.id));
          const prevPercent = normalizePercent(previous?.percent);
          const currentPercent = normalizePercent(item.percent);
          const percent = Math.min(
            100,
            Math.max(currentPercent ?? 0, prevPercent ?? 0, 0),
          );

          const next = {
            ...item,
            percent: percent.toString(),
          };
          return previous && shallow(previous, next) ? previous : next;
        });

        if (
          normalized.length === previousState.events.length &&
          normalized.every(
            (item, index) => item === previousState.events[index],
          )
        )
          return;
        state.events = normalized;
        state.eventsMap = new Map(
          normalized.map((item) => [String(item.id), item]),
        );
      }),
  })),
);

export const downloadStoreSelector = (state: DownloadStore & Actions) => {
  return {
    count: state.count,
    clearCount: state.clearCount,
    increase: state.increase,
    events: state.events,
    eventsMap: state.eventsMap,
    setEvents: state.setEvents,
  };
};
