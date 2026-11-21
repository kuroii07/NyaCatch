import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBatchInput,
  resourcesForPreview,
  buildBatchTasks,
} from "./batch-model";
import type { MediaPreview } from "../../api/media";
import { batchTranslations } from "../../i18n/batch";

test("all supported languages contain the full batch interface vocabulary", () => {
  const expected = Object.keys(batchTranslations.zh).toSorted();
  for (const bundle of Object.values(batchTranslations)) {
    assert.deepEqual(Object.keys(bundle).toSorted(), expected);
    assert.ok(Object.values(bundle).every((value) => value.trim().length > 0));
  }
});

const video: MediaPreview = {
  url: "https://www.bilibili.com/video/BV123?p=1",
  title: "demo",
  kind: "video",
  source: "Bilibili",
  extension: "mp4",
  duration: 5,
  hasAudio: true,
  thumbnail: "https://example.com/cover.jpg",
  formats: [
    {
      id: "720",
      extension: "mp4",
      width: 1280,
      height: 720,
      fps: 30,
      videoCodec: "h264",
      audioCodec: "aac",
      filesize: 100,
      approximate: false,
      audioOnly: false,
    },
  ],
};
const settings = {
  saveDir: "C:\\Downloads",
  mode: "auto" as const,
  audioFormat: "original" as const,
  bitrate: 192 as const,
};

test("only exact duplicate lines are removed; distinct page, query and fragment are retained", () => {
  const rows = parseBatchInput(
    " https://www.bilibili.com/video/BV123?p=1 \nhttps://www.bilibili.com/video/BV123?p=1\nhttps://www.bilibili.com/video/BV123?p=2\nhttps://example.com/v?token=x#part\nhttps://example.com/v?token=y#part\ninvalid",
  );
  assert.equal(rows.length, 5);
  assert.deepEqual(
    rows.map((r) => r.valid),
    [true, true, true, true, false],
  );
  assert.equal(rows[1].url, "https://www.bilibili.com/video/BV123?p=2");
  assert.equal(rows[2].url, "https://example.com/v?token=x#part");
  assert.equal(parseBatchInput("https://u:p@example.com/a")[0].valid, false);
  assert.throws(
    () =>
      parseBatchInput(
        Array.from({ length: 21 }, (_, i) => `https://example.com/${i}`).join(
          "\n",
        ),
      ),
    /20/,
  );
});

test("post resources stay associated with the originating URL and stable resource ID", () => {
  const post = {
    ...video,
    url: "https://x.com/a/status/123",
    resources: [
      {
        ...video,
        url: "https://x.com/a/status/123",
        kind: "image" as const,
        extension: "jpg",
        resourceId: "x-image-1",
        resolver: "x-public" as const,
      },
      {
        ...video,
        url: "https://x.com/a/status/123",
        kind: "image" as const,
        extension: "png",
        resourceId: "x-image-2",
        resolver: "x-public" as const,
      },
    ],
  };
  const items = resourcesForPreview(post, post.url);
  assert.equal(items.length, 2);
  assert.notEqual(items[0].key, items[1].key);
  const tasks = buildBatchTasks(items, settings);
  assert.deepEqual(
    tasks.map((t) => t.options?.resourceId),
    ["x-image-1", "x-image-2"],
  );
  assert.ok(
    tasks.every(
      (t) =>
        t.url === post.url &&
        t.options?.mode === "image" &&
        t.options?.resolver === "x-public",
    ),
  );
  assert.notEqual(tasks[0].name, tasks[1].name);
});

test("per-resource choices override shared mode and folder without losing the exact source link", () => {
  const item = resourcesForPreview(video, video.url)[0];
  item.overrides = {
    mode: "audio",
    audioFormat: "mp3",
    bitrate: 128,
    saveDir: "D:\\Audio",
  };
  const [task] = buildBatchTasks([item], { ...settings, mode: "cover" });
  assert.equal(task.url, video.url);
  assert.equal(task.options?.mode, "audio");
  assert.equal(task.options?.audioFormat, "mp3");
  assert.equal(task.options?.audioBitrate, 128);
  assert.equal(task.options?.saveDir, "D:\\Audio");
  assert.match(task.name, /\.mp3$/);
});

test("invalid selections fail atomically; submitted and unchecked resources never create tasks", () => {
  const item = resourcesForPreview({ ...video, hasAudio: false }, video.url)[0];
  assert.throws(
    () => buildBatchTasks([item], { ...settings, mode: "audio" }),
    /audio/i,
  );
  assert.throws(
    () => buildBatchTasks([item], { ...settings, saveDir: "" }),
    /directory/i,
  );
  assert.throws(
    () =>
      buildBatchTasks(
        Array.from({ length: 201 }, (_, i) => ({ ...item, key: String(i) })),
        settings,
      ),
    /200/,
  );
  const submitted = { ...item, key: "submitted", submitted: true };
  const unchecked = { ...item, key: "unchecked", selected: false };
  assert.deepEqual(buildBatchTasks([submitted, unchecked], settings), []);
});
