import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompressionDraft,
  decodeCompressionDraft,
  appendCompressionPaths,
  compressionFileProblem,
  compressionSizeResult,
  byteSize,
  compressionTargetBitrate,
  compressionEncoderProblem,
} from "./compress-model";
import { compressionMessages } from "../../i18n/compress";
test("CPU drafts remain compatible and hardware failures never silently change the selected encoder", () => {
  const draft = createCompressionDraft();
  delete draft.settings.encoder;
  delete draft.settings.cq;
  assert.deepEqual(decodeCompressionDraft(JSON.stringify(draft)), draft);
  const gpu = {
    ...draft,
    locked: true,
    settings: { ...draft.settings, encoder: "nvenc" as const, cq: 23 },
  };
  assert.deepEqual(decodeCompressionDraft(JSON.stringify(gpu)), gpu);
  const no = { h264: { available: false }, hevc: { available: true } };
  assert.equal(compressionEncoderProblem(draft.settings, no, true), undefined);
  assert.equal(
    compressionEncoderProblem(gpu.settings, no, true),
    "vpEncoderChecking",
  );
  assert.equal(compressionEncoderProblem(gpu.settings), "vpEncoderCheckFailed");
  assert.equal(
    compressionEncoderProblem(gpu.settings, no),
    "vpEncoderUnavailable",
  );
  assert.equal(
    compressionEncoderProblem({ ...gpu.settings, codec: "hevc" }, no),
    undefined,
  );
  assert.equal(
    compressionEncoderProblem({ ...gpu.settings, rateMode: "size" }, no),
    "vpTargetCPUHint",
  );
  for (const patch of [
    { encoder: "amf" },
    { cq: 0 },
    { cq: 52 },
    { cq: 1.5 },
    { rateMode: "size" },
    { cq: undefined },
  ]) {
    const invalid = decodeCompressionDraft(
      JSON.stringify({
        ...gpu,
        locked: false,
        settings: { ...gpu.settings, ...patch },
      }),
    );
    assert.equal(invalid.locked, true);
  }
});
test("compression drafts preserve source, options, records and uncertainty across recovery", () => {
  const draft = {
    ...createCompressionDraft(),
    paths: ["C:/源.mp4"],
    activePath: "C:/源.mp4",
    locked: true,
    recentIds: [4],
    trialId: 4,
  };
  assert.deepEqual(decodeCompressionDraft(JSON.stringify(draft)), draft);
  assert.equal(appendCompressionPaths(draft, ["C:/b.mp4"]), draft);
  for (const broken of [
    "{",
    JSON.stringify({ ...draft, settings: { ...draft.settings, crf: NaN } }),
    JSON.stringify({ ...draft, paths: Array(21).fill("x") }),
    JSON.stringify({ ...draft, recentIds: [2, 2] }),
    JSON.stringify({ ...draft, activePath: "missing" }),
  ])
    assert.equal(decodeCompressionDraft(broken).locked, true);
  const added = appendCompressionPaths(createCompressionDraft(), [
    "C:/源.mp4",
    "c:\\源.mp4",
    "C:/b.mp4",
  ]);
  assert.deepEqual(added.paths, ["C:/源.mp4", "C:/b.mp4"]);
  assert.equal(added.activePath, "C:/源.mp4");
});
test("preflight distinguishes SDR, unavailable, HDR, dimensions and audio copy compatibility", () => {
  const settings = createCompressionDraft().settings,
    file = {
      path: "v",
      available: true,
      video: { width: 1920, height: 1080 },
      media: { hasVideo: true, hasAudio: true, durationMs: 2000 },
      audio: { codec: "aac", sampleRate: 48000, channels: 2 },
    };
  assert.equal(compressionFileProblem(file, settings), undefined);
  assert.equal(
    compressionFileProblem({ ...file, available: false }, settings),
    "vpInvalidFiles",
  );
  assert.equal(
    compressionFileProblem(
      { ...file, video: { ...file.video, hdr: true } },
      settings,
    ),
    "vpHDR",
  );
  assert.equal(
    compressionFileProblem(
      { ...file, video: { ...file.video, bitDepth: 10 } },
      settings,
    ),
    "vpHDR",
  );
  assert.equal(
    compressionFileProblem(file, { ...settings, maxEdge: 3840 }),
    "c123SizeBlocked",
  );
  assert.equal(
    compressionFileProblem(
      { ...file, audio: { ...file.audio, codec: "pcm_s16le" } },
      { ...settings, audio: "copy" },
    ),
    "vpAudioBlocked",
  );
  assert.equal(
    compressionFileProblem(
      { ...file, audio: { ...file.audio, codec: "pcm_s16le" } },
      { ...settings, audio: "copy", format: "mkv" },
    ),
    undefined,
  );
});
test("full outputs compare true sizes while trials only show a labelled extrapolation", () => {
  const row = {
    id: 1,
    name: "video",
    path: "v",
    status: "done",
    outputPath: "o",
    outputFormat: "mp4",
    quality: "medium",
    progress: 100,
    options: {
      version: 1 as const,
      compress: {
        codec: "h264" as const,
        crf: 23,
        preset: "medium" as const,
        audio: "aac" as const,
        bitrate: 192,
        sourceBytes: 1000,
        durationMs: 10000,
      },
    },
  };
  assert.deepEqual(compressionSizeResult(row, 600), {
    trial: false,
    output: 600,
    source: 1000,
    percent: 40,
  });
  assert.deepEqual(compressionSizeResult(row, 1200), {
    trial: false,
    output: 1200,
    source: 1000,
    percent: -20,
  });
  const trial = {
    ...row,
    options: {
      ...row.options,
      compress: {
        ...row.options.compress,
        trial: { startMs: 1000, endMs: 3000 },
      },
    },
  };
  assert.deepEqual(compressionSizeResult(trial, 600), {
    trial: true,
    output: 600,
    estimated: 3000,
  });
  assert.equal(compressionSizeResult(trial), undefined);
  assert.equal(byteSize(1024 * 1024), "1.00 MiB");
});
test("compression locales are complete and keep size/count placeholders", () => {
  const keys = Object.keys(compressionMessages.zh).sort();
  for (const locale of Object.values(compressionMessages)) {
    assert.deepEqual(Object.keys(locale).sort(), keys);
    assert.ok(Object.values(locale).every(Boolean));
    assert.ok(locale.vpStart.includes("{{count}}"));
    assert.ok(locale.vpEstimated.includes("{{size}}"));
    assert.ok(locale.vpSmaller.includes("{{percent}}"));
  }
});

test("target budgets reserve audio and muxing space per whole video", () => {
  assert.equal(compressionTargetBitrate(100000000, 600000, 192), 1074666);
  assert.equal(compressionTargetBitrate(1000000, 8000, 192), 758000);
  assert.equal(compressionTargetBitrate(1000000, 8000, 0), 950000);
  for (const args of [
    [999999, 8000, 192],
    [1000000, 3600000, 192],
    [1000000, 0, 192],
    [100000000, 1, 192],
    [NaN, 8000, 192],
  ])
    assert.equal(
      compressionTargetBitrate(...(args as [number, number, number])),
      undefined,
    );
});

test("target drafts preserve old quality/unknown states and reject impossible source budgets", () => {
  const old = createCompressionDraft();
  delete old.settings.rateMode;
  delete old.settings.targetMB;
  old.locked = true;
  assert.deepEqual(decodeCompressionDraft(JSON.stringify(old)), old);
  const settings = { ...old.settings, rateMode: "size" as const, targetMB: 1 };
  const file = {
    path: "v",
    available: true,
    video: { width: 1920, height: 1080, durationMs: 8000 },
    media: { hasVideo: true, hasAudio: true, durationMs: 8000 },
    audio: { codec: "aac", sampleRate: 48000, channels: 2 },
  };
  assert.equal(compressionFileProblem(file, settings), undefined);
  assert.equal(
    compressionFileProblem(
      { ...file, video: { ...file.video, durationMs: 3600000 } },
      settings,
    ),
    "vpTargetBudget",
  );
  assert.equal(
    compressionFileProblem(file, { ...settings, audio: "copy" }),
    "vpTargetAudio",
  );
  for (const patch of [
    { targetMB: 0 },
    { targetMB: 1.5 },
    { targetMB: 100001 },
    { rateMode: "bogus" },
  ]) {
    assert.equal(
      decodeCompressionDraft(
        JSON.stringify({
          ...old,
          locked: false,
          settings: { ...settings, ...patch },
        }),
      ).locked,
      true,
    );
  }
});
