import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompressionDraft,
  decodeCompressionDraft,
  removeCompressionSource,
} from "./compress-model";
import {
  defaultSubtitleStyle,
  subtitleOptions,
  validSubtitleBinding,
} from "./subtitle-model";
test("subtitle bindings remain per source, preserve legacy/unknown drafts and clean up with source removal", () => {
  const draft = {
    ...createCompressionDraft(),
    paths: ["C:/a.mp4", "C:/b.mp4"],
    activePath: "C:/a.mp4",
    locked: true,
    subtitles: {
      "C:/a.mp4": {
        path: "C:/中文 '#.srt",
        format: "srt" as const,
        enabled: true,
        offsetMs: 500,
        sourceHash: "a".repeat(64),
        style: defaultSubtitleStyle(),
      },
    },
  };
  assert.deepEqual(decodeCompressionDraft(JSON.stringify(draft)), draft);
  assert.equal(subtitleOptions(draft.subtitles["C:/a.mp4"])?.offsetMs, 500);
  const removed = removeCompressionSource(
    { ...draft, locked: false },
    "C:/a.mp4",
  );
  assert.deepEqual(removed.paths, ["C:/b.mp4"]);
  assert.deepEqual(removed.subtitles, {});
  assert.equal(removed.activePath, "C:/b.mp4");
  const legacy = createCompressionDraft();
  assert.deepEqual(decodeCompressionDraft(JSON.stringify(legacy)), legacy);
  const dangling = {
    ...draft,
    subtitles: { "C:/missing.mp4": draft.subtitles["C:/a.mp4"] },
  };
  assert.equal(
    decodeCompressionDraft(JSON.stringify({ ...dangling, locked: false }))
      .locked,
    true,
  );
});
test("subtitle API snapshots omit SRT controls for ASS and reject corrupted bindings", () => {
  const s = {
    path: "C:/字幕.ass",
    format: "ass" as const,
    enabled: true,
    offsetMs: -1000,
    sourceHash: "b".repeat(64),
    style: defaultSubtitleStyle(),
  };
  assert.equal(validSubtitleBinding(s), true);
  assert.equal(subtitleOptions(s)?.style, undefined);
  assert.equal(subtitleOptions({ ...s, enabled: false }), undefined);
  for (const patch of [
    { path: "relative.ass" },
    { sourceHash: "bad" },
    { offsetMs: NaN },
    { offsetMs: 3600001 },
    { style: { ...s.style, fontFamily: "invalid" } },
    { style: { ...s.style, color: "red" } },
  ])
    assert.equal(validSubtitleBinding({ ...s, ...patch }), false);
});
