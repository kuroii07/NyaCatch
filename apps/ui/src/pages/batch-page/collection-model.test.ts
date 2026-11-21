import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoDiscoverCollection,
  collectionCandidate,
  mergeCollectionEntries,
  inputsForCollection,
} from "./collection-model";
import {
  buildBatchTasks,
  parseBatchInput,
  resourcesForPreview,
} from "./batch-model";
import { encodeBatchDraft, decodeBatchDraft } from "./batch-draft";
import { collectionMessages } from "../../i18n/collections";
import type { MediaPreview, CollectionEntry } from "../../api/media";

test("collection detection keeps explicit episodes and ordinary YouTube videos single", () => {
  assert.equal(
    autoDiscoverCollection("https://www.bilibili.com/video/BV17u411o7Xk/"),
    true,
  );
  assert.equal(
    autoDiscoverCollection("https://www.bilibili.com/video/BV17u411o7Xk/?p=2"),
    false,
  );
  assert.equal(
    collectionCandidate("https://www.bilibili.com/video/BV17u411o7Xk/?p=2"),
    true,
  );
  assert.equal(
    autoDiscoverCollection(
      "https://www.youtube.com/watch?v=abcdefghijk&list=PLexample",
    ),
    false,
  );
  assert.equal(
    autoDiscoverCollection("https://www.youtube.com/playlist?list=PLexample"),
    true,
  );
  assert.equal(
    collectionCandidate("https://www.youtube.com.evil/playlist?list=PLexample"),
    false,
  );
  assert.equal(
    collectionCandidate("https://space.bilibili.com/32708543/lists/158647"),
    true,
  );
});
test("collection batches keep each video identity, options and draft through restart", () => {
  const source = "https://www.bilibili.com/video/BV17u411o7Xk/";
  const preview: MediaPreview = {
    url: source + "?p=9",
    title: "part nine",
    kind: "video",
    source: "Bilibili",
    extension: "mp4",
    duration: 9,
    hasAudio: true,
    formats: [],
    collection: {
      sourceUrl: source,
      id: "bili-BV17u411o7Xk-99",
      cid: "99",
      index: 9,
    },
  };
  const items = resourcesForPreview(preview, source);
  const settings = {
    saveDir: "C:\\Downloads",
    mode: "auto" as const,
    audioFormat: "original" as const,
    bitrate: 192 as const,
  };
  const tasks = buildBatchTasks(items, settings);
  assert.equal(tasks[0].url, preview.url);
  assert.equal(tasks[0].options?.collection?.cid, "99");
  assert.match(tasks[0].name, /^009_/);
  const text = encodeBatchDraft({
    version: 1,
    input: preview.url,
    settings,
    submission: "unknown",
    collectionSource: source,
    rows: [
      {
        url: preview.url,
        valid: true,
        collection: preview.collection,
        status: "success",
        preview,
        items,
      },
    ],
  });
  const restored = decodeBatchDraft(text);
  assert.ok(restored);
  assert.equal(restored.submission, "unknown");
  assert.equal(restored.rows[0].collection?.cid, "99");
  assert.equal(
    restored.rows[0].items[0].preview.collection?.id,
    preview.collection?.id,
  );
  assert.doesNotThrow(() =>
    encodeBatchDraft({
      version: 1,
      input: "https://example.com/a",
      settings,
      submission: "idle",
      collectionSource: "",
      rows: [],
    }),
  );
  const imported = inputsForCollection(
    source + "\nhttps://example.com/existing",
    [
      {
        id: preview.collection.id,
        url: preview.url,
        title: preview.title,
        index: 9,
        duration: 9,
        available: true,
        selection: preview.collection,
      },
    ],
    source,
    [],
  );
  assert.deepEqual(
    imported.map((input) => input.url),
    ["https://example.com/existing", preview.url],
  );
  const input = Array.from(
    { length: 200 },
    (_, i) => "https://example.com/" + i,
  ).join("\n");
  assert.equal(parseBatchInput(input, 200).length, 200);
  assert.throws(() => parseBatchInput(input));
  assert.throws(() =>
    parseBatchInput(input + "\nhttps://example.com/extra", 200),
  );
});
test("paged collection merging and all five languages stay complete", () => {
  const one = { id: "one" } as CollectionEntry;
  assert.equal(
    mergeCollectionEntries([one], [one, { id: "two" } as CollectionEntry])
      .length,
    2,
  );
  const keys = Object.keys(collectionMessages.zh).sort();
  for (const bundle of Object.values(collectionMessages))
    assert.deepEqual(Object.keys(bundle).sort(), keys);
});
