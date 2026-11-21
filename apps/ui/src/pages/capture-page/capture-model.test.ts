import test from "node:test";
import assert from "node:assert/strict";
import {
  createCaptureDraft,
  decodeCaptureDraft,
  captureRange,
  captureVideo,
  captureFrameRates,
  captureSizes,
  captureSizeLabel,
} from "./capture-model";
import { captureMessages } from "../../i18n/capture";
test("capture draft recovers settings, source and acknowledgement without losing locks", () => {
  const draft = {
    ...createCaptureDraft(),
    path: "C:/视频.mp4",
    mode: "gif" as const,
    directory: "C:/导出",
    locked: true,
    recentIds: [17],
  };
  assert.deepEqual(decodeCaptureDraft(JSON.stringify(draft)), draft);
  for (const broken of [
    "{",
    JSON.stringify({ ...draft, fps: 60 }),
    JSON.stringify({ ...draft, recentIds: [-1] }),
    JSON.stringify({ ...draft, maxEdge: 8192 }),
    JSON.stringify({ ...draft, loop: "yes" }),
  ])
    assert.equal(decodeCaptureDraft(broken).locked, true);
});
test("still snapshots use current position; GIF ranges are bounded and do not include EOF", () => {
  const draft = createCaptureDraft();
  assert.deepEqual(captureRange(draft, 4000, 1250), {
    startMs: 1250,
    name: undefined,
  });
  for (const position of [NaN, Infinity, -1, 4000, 5000])
    assert.equal(captureRange(draft, 4000, position), undefined);
  assert.equal(
    captureRange({ ...draft, name: "../outside" }, 4000, 0),
    undefined,
  );
  const gif = {
    ...draft,
    mode: "gif" as const,
    start: "00:00:01.000",
    end: "00:00:03.000",
  };
  assert.deepEqual(captureRange(gif, 4000, 3000), {
    startMs: 1000,
    endMs: 3000,
    fps: 10,
    loop: true,
    name: undefined,
  });
  for (const end of ["", "00:00:00.500", "00:00:05.000", "00:00:32.000"])
    assert.equal(captureRange({ ...gif, end }, 4000, 0), undefined);
});
test("video selection rejects audio, missing sources and nonfinite durations", () => {
  const file = {
    path: "v",
    available: true,
    media: { durationMs: 4000, hasVideo: true, hasAudio: false },
  };
  assert.equal(captureVideo(file), true);
  for (const value of [
    undefined,
    { ...file, available: false },
    { ...file, media: { ...file.media, hasVideo: false } },
    { ...file, media: { ...file.media, durationMs: Infinity } },
  ])
    assert.equal(captureVideo(value), false);
});
test("all capture locales have the same complete nonempty keys", () => {
  const keys = Object.keys(captureMessages.zh).sort();
  for (const messages of Object.values(captureMessages)) {
    assert.deepEqual(Object.keys(messages).sort(), keys);
    assert.ok(Object.values(messages).every((value) => value.trim()));
  }
});
test("GIF choices show compact pixel sizes and original rate without changing uncertain drafts", () => {
  assert.deepEqual(captureFrameRates, [6, 10, 12, 24, 0]);
  assert.deepEqual(captureSizes, [240, 320, 480, 640, 720, 960]);
  assert.equal(
    captureSizeLabel(480, { width: 1920, height: 1080 }),
    "480 × 270",
  );
  assert.equal(
    captureSizeLabel(480, { width: 1080, height: 1920 }),
    "270 × 480",
  );
  assert.equal(
    captureSizeLabel(480, { width: 1080, height: 1080 }),
    "480 × 480",
  );
  for (const [legacy, rate] of [
    [5, 6],
    [15, 12],
  ]) {
    const draft = { ...createCaptureDraft(), fps: legacy, maxEdge: 360 };
    assert.equal(decodeCaptureDraft(JSON.stringify(draft)).fps, rate);
    assert.equal(decodeCaptureDraft(JSON.stringify(draft)).maxEdge, 360);
    const locked = { ...draft, locked: true, recentIds: [3] };
    assert.deepEqual(decodeCaptureDraft(JSON.stringify(locked)), locked);
  }
  for (const fps of captureFrameRates) {
    for (const maxEdge of [0, ...captureSizes]) {
      const draft = { ...createCaptureDraft(), fps, maxEdge };
      assert.deepEqual(decodeCaptureDraft(JSON.stringify(draft)), draft);
    }
  }
});
