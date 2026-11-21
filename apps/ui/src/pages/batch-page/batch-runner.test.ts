import test from "node:test";
import assert from "node:assert/strict";
import { runBatch } from "./batch-runner";
import type { MediaPreview } from "../../api/media";

const sample = (url: string, session?: string): MediaPreview => ({
  url,
  title: url,
  kind: "video",
  source: "test",
  extension: "mp4",
  duration: 0,
  hasAudio: false,
  formats: [],
  previewSession: session,
});
const inputs = (urls: string[]) => urls.map((url) => ({ url, valid: true }));

test("two concurrent requests isolate failures and continue remaining links", async () => {
  let active = 0,
    peak = 0;
  const updates: { index: number; status: string }[] = [];
  await runBatch(
    inputs(["one", "bad", "three", "four"]),
    new AbortController().signal,
    async (url) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      if (url === "bad") throw Error("broken");
      return sample(url);
    },
    (index, status) => updates.push({ index, status }),
    async () => {},
  );
  assert.equal(peak, 2);
  assert.deepEqual(
    updates.filter((x) => x.status === "error").map((x) => x.index),
    [1],
  );
  assert.deepEqual(
    updates
      .filter((x) => x.status === "success")
      .map((x) => x.index)
      .toSorted(),
    [0, 2, 3],
  );
});

test("cancel marks active and waiting inputs and releases late thumbnail sessions", async () => {
  const controller = new AbortController(),
    updates: { index: number; status: string }[] = [],
    released: string[] = [];
  const pending: ((value: MediaPreview) => void)[] = [];
  const done = runBatch(
    inputs(["one", "two", "three"]),
    controller.signal,
    () => new Promise((resolve) => pending.push(resolve)),
    (index, status) => updates.push({ index, status }),
    async (preview) => {
      if (preview.previewSession) released.push(preview.previewSession);
    },
  );
  assert.equal(pending.length, 2);
  controller.abort();
  assert.deepEqual(
    updates
      .filter((x) => x.status === "canceled")
      .map((x) => x.index)
      .toSorted(),
    [0, 1, 2],
  );
  pending[0](sample("one", "session-one"));
  pending[1](sample("two", "session-two"));
  await done;
  assert.deepEqual(released.toSorted(), ["session-one", "session-two"]);
  assert.equal(updates.filter((x) => x.status === "success").length, 0);
  assert.equal(pending.length, 2);
});

test("invalid lines never reach resolver and do not block valid lines", async () => {
  const seen: string[] = [],
    updates: { index: number; status: string }[] = [];
  await runBatch(
    [
      { url: "invalid", valid: false },
      { url: "valid", valid: true },
    ],
    new AbortController().signal,
    async (url) => {
      seen.push(url);
      return sample(url);
    },
    (index, status) => updates.push({ index, status }),
    async () => {},
  );
  assert.deepEqual(seen, ["valid"]);
  assert.ok(updates.some((x) => x.index === 0 && x.status === "error"));
  assert.ok(updates.some((x) => x.index === 1 && x.status === "success"));
});
