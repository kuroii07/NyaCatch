import test from "node:test";
import assert from "node:assert/strict";
import {
  appendMergeItems,
  createMergeDraft,
  decodeMergeDraft,
  mergeMode,
  moveMergeItem,
  removeMergeItem,
  validMergeName,
} from "./merge-model";
import { mergeMessages } from "../../i18n/merge";

test("ordered repeated sources retain stable identities and settings through draft recovery", () => {
  const original = {
    ...createMergeDraft(),
    name: "我的成品",
    directory: "C:/导出",
    customDirectory: true,
  };
  let draft = appendMergeItems(original, ["C:/a.mp4", "C:/b.mp4", "C:/a.mp4"]);
  assert.equal(new Set(draft.items.map((item) => item.id)).size, 3);
  draft = { ...draft, activeId: draft.items[1].id };
  const activeId = draft.activeId;
  draft = moveMergeItem(draft, activeId, 0);
  const restored = decodeMergeDraft(JSON.stringify(draft));
  assert.deepEqual(
    restored.items.map((item) => item.path),
    ["C:/b.mp4", "C:/a.mp4", "C:/a.mp4"],
  );
  assert.equal(restored.activeId, activeId);
  assert.equal(restored.name, "我的成品");
  assert.equal(restored.directory, "C:/导出");
  assert.deepEqual(original.items, []);
  const removed = removeMergeItem(restored, activeId);
  assert.equal(removed.activeId, removed.items[0].id);
});
test("submission locks and corrupt recovery cannot silently permit duplicate work", () => {
  const draft = {
    ...appendMergeItems(createMergeDraft(), ["a", "b"]),
    locked: true,
  };
  assert.deepEqual(decodeMergeDraft(JSON.stringify(draft)), draft);
  assert.equal(appendMergeItems(draft, ["c"]), draft);
  assert.equal(moveMergeItem(draft, draft.items[0].id, 1), draft);
  assert.equal(removeMergeItem(draft, draft.items[0].id), draft);
  for (const value of [
    "{",
    JSON.stringify({ ...draft, items: Array(21).fill(draft.items[0]) }),
    JSON.stringify({ ...draft, activeId: "unknown" }),
    JSON.stringify({ ...draft, recentIds: [-1] }),
    JSON.stringify({ ...draft, items: [draft.items[0], draft.items[0]] }),
  ])
    assert.equal(decodeMergeDraft(value).locked, true);
  assert.equal(
    appendMergeItems(createMergeDraft(), Array(21).fill("a")).items.length,
    0,
  );
});
test("media compatibility requires available homogeneous tracks and finite durations", () => {
  const video = {
      path: "a",
      available: true,
      media: { hasVideo: true, hasAudio: true, durationMs: 1000 },
    },
    audio = {
      path: "b",
      available: true,
      media: { hasVideo: false, hasAudio: true, durationMs: 1500 },
    };
  assert.equal(
    mergeMode([
      video,
      { ...video, media: { ...video.media, hasAudio: false } },
    ]),
    "video",
  );
  assert.equal(mergeMode([audio, audio]), "audio");
  assert.equal(mergeMode([video, audio]), undefined);
  for (const file of [
    { ...audio, available: false },
    { ...audio, media: { ...audio.media, durationMs: Infinity } },
    { ...audio, media: { ...audio.media, hasAudio: false } },
  ])
    assert.equal(mergeMode([audio, file]), undefined);
});
test("output names remain portable and all locales retain total duration variables", () => {
  for (const name of ["成品 01", "mix.v2"])
    assert.equal(validMergeName(name), true);
  for (const name of [
    "",
    "../escape",
    "CON.mp4",
    "bad:name",
    "trailing.",
    "a".repeat(81),
  ])
    assert.equal(validMergeName(name), false);
  const keys = Object.keys(mergeMessages.zh).sort();
  for (const bundle of Object.values(mergeMessages)) {
    assert.deepEqual(Object.keys(bundle).sort(), keys);
    assert.ok(
      bundle.mgTotal.includes("{{count}}") &&
        bundle.mgTotal.includes("{{duration}}"),
    );
    assert.ok(Object.values(bundle).every((value) => value.length > 0));
  }
});
