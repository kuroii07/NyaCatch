import { test } from "node:test";
import assert from "node:assert/strict";
import { extractShareLinks, validMediaLink } from "./share-links";
import { pathSegment, organizeOutput } from "./save-organization";
import {
  encodeBatchDraft,
  decodeBatchDraft,
  restoreSelections,
} from "../pages/batch-page/batch-draft";
import {
  resourcesForPreview,
  parseBatchInput,
} from "../pages/batch-page/batch-model";
import { efficiencyTranslations } from "../i18n/download-efficiency";
import type { MediaPreview } from "../api/media";
const preview: MediaPreview = {
  url: "https://example.com/post?p=2#part",
  title: "test",
  kind: "video",
  extension: "mp4",
  source: "Test",
  uploader: "Alice",
  duration: 1,
  hasAudio: true,
  formats: [],
};
test("shared text extracts several exact signed links without canonicalizing them", () => {
  const a =
    "https://www.xiaohongshu.com/discovery/item/abc?xsec_token=AB%2B%2F%3D&source=share#part";
  const b = "https://v.douyin.com/Example/";
  assert.deepEqual(
    extractShareLinks(`标题 😆 ${a} 复制后打开\n作品 (${b}) 观看`),
    [a, b],
  );
  assert.deepEqual(extractShareLinks(a), [a]);
  assert.deepEqual(extractShareLinks(`分享 ${b}，`), [b]);
  assert.equal(validMediaLink("https://user:pass@example.com/a"), false);
  assert.equal(validMediaLink("bytedance://item"), false);
  assert.deepEqual(
    parseBatchInput(`分享 ${a}\n${b}\ninvalid`).map((x) => x.valid),
    [true, true, false],
  );
  assert.throws(() =>
    parseBatchInput(
      Array.from({ length: 21 }, (_, i) => `https://example.com/?p=${i}`).join(
        "\n",
      ),
    ),
  );
});
test("organization keeps defaults, uses safe child directories and previews a stable date", () => {
  assert.deepEqual(
    organizeOutput("C:\\Media", "title", preview, {
      folders: "none",
      names: "title",
    }),
    { saveDir: "C:\\Media", stem: "title" },
  );
  assert.deepEqual(
    organizeOutput(
      "C:\\Media",
      "a",
      preview,
      { folders: "author", names: "date-title" },
      new Date(2026, 10, 6),
    ),
    { saveDir: "C:\\Media\\Test\\Alice", stem: "2026-11-06_a" },
  );
  for (const v of ["..", "CON", "NUL.txt", "a/b\\c", " / ", "COM1 "]) {
    const x = pathSegment(v);
    assert.ok(x && !/[<>:"/\\|?*]/.test(x));
    assert.notEqual(x, "..");
    assert.ok(!/^(CON|NUL|COM1)(?:\.|$)/i.test(x));
  }
});
test("drafts keep source identity and choices, strip transient capabilities and retain unknown submission", () => {
  const input = {
    ...preview,
    displayThumbnail: "http://127.0.0.1/private",
    previewSession: "secret-session",
    previewUrl: "https://cdn.example.com/signed",
    thumbnail: "https://cdn.example.com/picture",
  };
  const items = resourcesForPreview(input, input.url);
  items[0].selected = false;
  items[0].overrides.saveDir = "C:\\custom";
  const encoded = encodeBatchDraft({
    version: 1,
    input: input.url,
    rows: [
      { url: input.url, valid: true, status: "success", preview: input, items },
    ],
    settings: {
      saveDir: "C:\\Media",
      mode: "auto",
      audioFormat: "original",
      bitrate: 192,
    },
    submission: "unknown",
  });
  assert.ok(!/secret-session|cdn\.example|127\.0\.0\.1/.test(encoded));
  const draft = decodeBatchDraft(encoded)!;
  assert.equal(draft.submission, "unknown");
  assert.equal(draft.rows[0].status, "canceled");
  assert.equal(draft.rows[0].items[0].selected, false);
  assert.equal(draft.rows[0].items[0].overrides.saveDir, "C:\\custom");
  assert.equal(draft.rows[0].url, preview.url);
  assert.throws(() => decodeBatchDraft('{"version":5}'));
  assert.throws(() => decodeBatchDraft("["));
});
test("reparsing restores by stable resource ID and leaves unexpected new resources unchecked", () => {
  const resource = (id: string) => ({ ...preview, resourceId: id });
  const old = resourcesForPreview(
    { ...preview, resources: [resource("a"), resource("b")] },
    preview.url,
  );
  old[0].selected = false;
  old[1].submitted = true;
  const next = resourcesForPreview(
    { ...preview, resources: [resource("b"), resource("a"), resource("new")] },
    preview.url,
  );
  const restored = restoreSelections(next, old);
  assert.equal(restored[0].submitted, true);
  assert.deepEqual(
    restored.map((x) => x.selected),
    [false, false, false],
  );
});
test("all efficiency strings are available in five languages with matching keys", () => {
  const keys = Object.keys(efficiencyTranslations.zh).sort();
  for (const values of Object.values(efficiencyTranslations))
    assert.deepEqual(Object.keys(values).sort(), keys);
});
