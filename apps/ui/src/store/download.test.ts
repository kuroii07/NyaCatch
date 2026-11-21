import test from "node:test";
import assert from "node:assert/strict";
import { useDownloadStore } from "./download";
test("Go percentages below one stay percentages and retry clears the previous attempt", () => {
  useDownloadStore
    .getState()
    .setEvents([{ id: 99, percent: "0.5", speed: "1MiB/s" }]);
  assert.equal(useDownloadStore.getState().eventsMap.get("99")?.percent, "0.5");
  useDownloadStore
    .getState()
    .setEvents([{ id: 99, percent: "98", speed: "1MiB/s" }]);
  useDownloadStore.getState().resetEvent(99);
  useDownloadStore
    .getState()
    .setEvents([{ id: 99, percent: "2", speed: "1MiB/s" }]);
  assert.equal(useDownloadStore.getState().eventsMap.get("99")?.percent, "2");
});

test("unchanged progress keeps the snapshot and task references without notifying subscribers", () => {
  const store = useDownloadStore.getState();
  store.setEvents([
    { id: 1, percent: "10", speed: "1MiB/s" },
    { id: 2, percent: "50", speed: "2MiB/s" },
  ]);
  const previous = useDownloadStore.getState();
  let notifications = 0;
  const unsubscribe = useDownloadStore.subscribe(() => notifications++);
  try {
    store.setEvents([
      { id: 1, percent: "10.0", speed: "1MiB/s" },
      { id: 2, percent: "50", speed: "2MiB/s" },
    ]);
    assert.equal(useDownloadStore.getState(), previous);
    assert.equal(notifications, 0);
    store.setEvents([
      { id: 1, percent: "11", speed: "1.2MiB/s" },
      { id: 2, percent: "50", speed: "2MiB/s" },
    ]);
    const next = useDownloadStore.getState();
    assert.notEqual(next.eventsMap.get("1"), previous.eventsMap.get("1"));
    assert.equal(next.eventsMap.get("2"), previous.eventsMap.get("2"));
    assert.equal(notifications, 1);
  } finally {
    unsubscribe();
    store.setEvents([]);
  }
});

test("progress preserves monotonic percentages, speed changes, removal and retry resets", () => {
  const store = useDownloadStore.getState();
  store.setEvents([{ id: 1, percent: "80", speed: "2MiB/s" }]);
  store.setEvents([{ id: 1, percent: "20", speed: "1MiB/s" }]);
  assert.deepEqual(useDownloadStore.getState().eventsMap.get("1"), {
    id: 1,
    percent: "80",
    speed: "1MiB/s",
  });
  store.resetEvent(1);
  store.setEvents([{ id: 1, percent: "0.5", speed: "1MiB/s" }]);
  assert.equal(useDownloadStore.getState().eventsMap.get("1")?.percent, "0.5");
  store.setEvents([]);
  assert.equal(useDownloadStore.getState().eventsMap.size, 0);
});
