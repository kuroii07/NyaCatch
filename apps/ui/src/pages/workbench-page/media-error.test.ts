import test from "node:test";
import assert from "node:assert/strict";
import { classifyMediaError, mediaParseErrorKey } from "./media-error";

test("X missing media explains anonymous access without claiming a login requirement", () => {
  const error =
    "media extraction failed: ERROR: [twitter] 2113612120076251186: No video could be found in this tweet";
  for (const url of [
    "https://x.com/example/status/2113612120076251186?s=20",
    "https://twitter.com/example/status/1",
    "https://mobile.twitter.com/example/status/1",
  ]) {
    assert.equal(mediaParseErrorKey(error, url), "v4XMediaUnavailable");
  }
  assert.equal(
    mediaParseErrorKey(error, "https://example.com/watch"),
    "v4ParseFailed",
  );
  assert.equal(
    mediaParseErrorKey(error, "https://x.com.example.com/watch"),
    "v4ParseFailed",
  );
});

test("network, source restrictions, unsupported media, and software failures are distinct", () => {
  for (const [message, category, key] of [
    ["HTTP Error 429", "source-restriction", "v4Blocked"],
    ["HTTP Error 403", "source-restriction", "v4Login"],
    ["Login required", "source-restriction", "v4Login"],
    ["Request timed out", "network", "v4Timeout"],
    ["Could not resolve DNS", "network", "v4NetworkError"],
    ["No formats found", "unsupported-media", "v4UnsupportedMedia"],
    ["Unexpected parser state", "software-failure", "v4ParseFailed"],
  ] as const) {
    assert.equal(classifyMediaError(message), category);
    assert.equal(
      mediaParseErrorKey(message, "https://x.com/example/status/1"),
      key,
    );
  }
});
