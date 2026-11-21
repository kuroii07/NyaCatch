import assert from "node:assert/strict";
import { test } from "node:test";
import { DownloadType } from "@mediago/shared-common";
import { filterSources, sourceGroup, sourceHost } from "./source-model";
import type { SourceData } from "@/store/browser";
import { sourceExtractMessages } from "../../i18n/source-extract";

const sources: SourceData[] = [
  {
    id: 1,
    name: "中文视频",
    url: "https://cdn.example/one.m3u8?token=a%2Bb#keep",
    documentURL: "https://example/page",
    type: DownloadType.m3u8,
  },
  {
    id: 1,
    name: "Second File",
    url: "https://files.example/Two.MP4?q=1&q=2",
    documentURL: "https://example/page",
    type: DownloadType.direct,
  },
  {
    id: 2,
    name: "Platform Clip",
    url: "https://example/watch.mp4",
    documentURL: "https://example/page",
    type: DownloadType.youtubeSingle,
  },
];

test("resource filters combine type and case-insensitive name or URL without rewriting signed links", () => {
  assert.deepEqual(filterSources(sources, " CDN.EXAMPLE ", "stream"), [
    sources[0],
  ]);
  assert.deepEqual(filterSources(sources, "Second", "stream"), []);
  assert.deepEqual(filterSources(sources, "中文", "all"), [sources[0]]);
  assert.deepEqual(filterSources(sources, "q=1&q=2", "file"), [sources[1]]);
  const all = filterSources(sources, " ", "all");
  assert.deepEqual(all, sources);
  assert.strictEqual(all[0], sources[0]);
  assert.equal(all[0].url, "https://cdn.example/one.m3u8?token=a%2Bb#keep");
});

test("groups use downloader types rather than guessed extensions and preserve duplicate numeric IDs", () => {
  assert.equal(sourceGroup(DownloadType.youtubeSingle), "platform");
  assert.deepEqual(filterSources(sources, ".mp4", "platform"), [sources[2]]);
  assert.equal(filterSources(sources, "", "all").length, 3);
  assert.equal(sourceHost(sources[1].url), "files.example");
  assert.equal(sourceHost("not a URL"), "");
});

test("capture controls and empty states have complete nonempty translations in all five languages", () => {
  const keys = Object.keys(sourceExtractMessages.zh).sort();
  assert.equal(Object.keys(sourceExtractMessages).length, 5);
  for (const messages of Object.values(sourceExtractMessages)) {
    assert.deepEqual(Object.keys(messages).sort(), keys);
    assert.ok(Object.values(messages).every((value) => value.trim()));
    assert.match(messages.seCount, /\{\{count\}\}/);
    assert.match(messages.seRemoveFavorite, /\{\{name\}\}/);
  }
});
