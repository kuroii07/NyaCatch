import test from "node:test";
import assert from "node:assert/strict";
import {
  preparePlatformLinks,
  readPlatformParseIntent,
} from "./parser-entry-model";
import { platformParserMessages } from "../../i18n/platform-parser";

test("platform entry keeps signed links and share text while rejecting invalid or oversized batches", () => {
  const url = "https://example.com/watch?sig=A%2Fb%2B&list=x&p=2#part=1";
  assert.deepEqual(preparePlatformLinks(url), { links: [url] });
  assert.deepEqual(preparePlatformLinks(`分享：${url} 复制此链接`), {
    links: [url],
  });
  assert.deepEqual(
    preparePlatformLinks(`${url}\n${url}\nhttps://example.com/other`),
    { links: [url, "https://example.com/other"] },
  );
  for (const text of [
    "",
    "not a link",
    "javascript:alert(1)",
    "https://user:secret@example.com/video",
    "https://example.com/" + "x".repeat(8192),
  ])
    assert.equal(preparePlatformLinks(text).error, "wbInvalidURL");
  assert.equal(
    preparePlatformLinks(
      Array.from({ length: 21 }, (_, i) => `https://example.com/${i}`).join(
        "\n",
      ),
    ).error,
    "ppTooMany",
  );
});
test("platform parse intent accepts one valid explicit request without trusting malformed navigation state", () => {
  const platformParse = {
    id: "explicit-user-request",
    url: "https://example.com/a?x=%2F#p=2",
  };
  assert.deepEqual(readPlatformParseIntent({ platformParse }), platformParse);
  for (const state of [
    null,
    {},
    { platformParse: "bad" },
    { platformParse: { ...platformParse, id: "" } },
    { platformParse: { ...platformParse, url: "file:///C:/private.mp4" } },
  ])
    assert.equal(readPlatformParseIntent(state), undefined);
});
test("platform parsing messages cover five locales and keep interpolation fields", () => {
  const keys = Object.keys(platformParserMessages.zh).sort();
  for (const messages of Object.values(platformParserMessages)) {
    assert.deepEqual(Object.keys(messages).sort(), keys);
    assert.ok(Object.values(messages).every((value) => value.trim()));
    assert.match(messages.ppTitle, /\{\{name\}\}/);
    assert.match(messages.ppBatch, /\{\{count\}\}/);
  }
});
