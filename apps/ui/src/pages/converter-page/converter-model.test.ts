import assert from "node:assert/strict";
import test from "node:test";
import {
  addDraftPaths,
  formatsForMode,
  getModeForFormat,
  videoSizeLimit,
  canSelectVideoSize,
} from "./converter-model";
import { converterWorkbenchTranslations } from "../../i18n/converter-workbench";

test("video size choices respect the smallest pending source, including portrait and stale results", () => {
  const files = [
    { path: "4k", available: true, video: { width: 3840, height: 2160 } },
    { path: "portrait", available: true, video: { width: 1080, height: 1920 } },
  ];
  assert.equal(videoSizeLimit(["4k"], files), 3840);
  const mixed = videoSizeLimit(["4k", "portrait"], files);
  assert.equal(mixed, 1920);
  assert.equal(canSelectVideoSize(1920, mixed), true);
  assert.equal(canSelectVideoSize(1280, mixed), true);
  assert.equal(canSelectVideoSize(2560, mixed), false);
  assert.equal(canSelectVideoSize(7680, mixed), false);
  assert.equal(videoSizeLimit(["new-file"], files), undefined);
  assert.equal(videoSizeLimit([], files), undefined);
});

test("unknown or unavailable files allow original size without enabling upscaling", () => {
  for (const file of [
    { path: "input", available: false, video: { width: 3840, height: 2160 } },
    { path: "input", available: true },
    { path: "input", available: true, video: { width: NaN, height: 1080 } },
  ]) {
    const limit = videoSizeLimit(["input"], [file]);
    assert.equal(limit, undefined);
    assert.equal(canSelectVideoSize(0, limit), true);
    assert.equal(canSelectVideoSize(1280, limit), false);
  }
});

test("formats are grouped by conversion type and legacy records remain visible", () => {
  assert.deepEqual(formatsForMode("video"), [
    "mp4",
    "mkv",
    "mov",
    "webm",
    "flv",
    "ts",
    "avi",
    "m4v",
  ]);
  assert.equal(getModeForFormat("mp3"), "audio");
  assert.equal(getModeForFormat("png"), "image");
  assert.equal(getModeForFormat("legacy"), "video");
});

test("conversion workbench text is present in all five languages", () => {
  for (const messages of Object.values(converterWorkbenchTranslations)) {
    assert.deepEqual(
      Object.keys(messages).toSorted(),
      Object.keys(converterWorkbenchTranslations.en).toSorted(),
    );
    assert.ok(Object.values(messages).every((message) => message.length > 0));
  }
});

test("draft additions de-duplicate Windows paths and enforce 20-file limit", () => {
  const added = addDraftPaths(
    ["C:\\Work\\A.mp4"],
    ["c:\\work\\a.mp4", "C:\\Work\\B.mp4"],
  );
  assert.deepEqual(added.paths, ["C:\\Work\\A.mp4", "C:\\Work\\B.mp4"]);
  assert.equal(added.duplicates, 1);
  const many = addDraftPaths(
    [],
    Array.from({ length: 23 }, (_, i) => `C:\\work\\${i}.mp4`),
  );
  assert.equal(many.paths.length, 20);
  assert.equal(many.excess, 3);
});

test("conversion options keep modes separate and do not apply bitrate to lossless formats", async () => {
  const { conversionOptions } = await import("./converter-model");
  const settings = {
    maxEdge: 1280,
    audioBitrate: 192,
    customDirectory: true,
    directory: "  C:\\Media  ",
  };
  assert.deepEqual(conversionOptions("video", "mp4", settings), {
    version: 1,
    outputDir: "C:\\Media",
    maxEdge: 1280,
    audioBitrate: 0,
  });
  assert.deepEqual(conversionOptions("audio", "mp3", settings), {
    version: 1,
    outputDir: "C:\\Media",
    maxEdge: 0,
    audioBitrate: 192,
  });
  assert.equal(conversionOptions("audio", "flac", settings).audioBitrate, 0);
  assert.equal(settings.audioBitrate, 192);
  assert.equal(
    conversionOptions("image", "png", { ...settings, customDirectory: false })
      .outputDir,
    undefined,
  );
  assert.throws(() =>
    conversionOptions("video", "mp4", { ...settings, directory: " " }),
  );
});
test("all converter option labels and interpolation variables exist in five languages", async () => {
  const { converterOptionsTranslations } =
    await import("../../i18n/converter-options");
  const keys = Object.keys(converterOptionsTranslations.zh).sort();
  for (const values of Object.values(converterOptionsTranslations)) {
    assert.deepEqual(Object.keys(values).sort(), keys);
    assert.match(values.c09LongEdge, /\{\{size\}\}/);
  }
});

test("format changes never retain a bitrate rejected by that encoder profile", async () => {
  const { conversionOptions, bitratesForFormat } =
    await import("./converter-model");
  const settings = {
    maxEdge: 0,
    audioBitrate: 320,
    customDirectory: false,
    directory: "",
  };
  assert.equal(conversionOptions("audio", "mp3", settings).audioBitrate, 320);
  assert.equal(conversionOptions("audio", "opus", settings).audioBitrate, 0);
  assert.equal(conversionOptions("audio", "ogg", settings).audioBitrate, 0);
  assert.equal(settings.audioBitrate, 320);
  assert.equal(Math.max(...bitratesForFormat("ogg")), 192);
  assert.equal(Math.max(...bitratesForFormat("opus")), 256);
});
