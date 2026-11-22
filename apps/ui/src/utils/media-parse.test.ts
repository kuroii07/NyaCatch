import test from "node:test";
import assert from "node:assert/strict";
import { readMediaParseStream, MediaParseError } from "./media-parse";
import {
  mediaParseErrorKey,
  mediaParseAttempts,
} from "../pages/workbench-page/media-error";
import { mediaParseMessages } from "../i18n/media-parse";

function stream(text: string, chunks = 7) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunks)
        controller.enqueue(bytes.slice(i, i + chunks));
      controller.close();
    },
  });
}
test("parse stream preserves real stages and a split UTF-8 result; legacy JSON remains readable", async () => {
  const stages: string[] = [];
  const result = await readMediaParseStream<{ title: string }>(
    stream(
      '{"type":"progress","stage":"primary"}\n{"type":"progress","stage":"fallback"}\n{"type":"result","data":{"title":"中文動画"}}\n',
      1,
    ),
    (stage) => stages.push(stage),
  );
  assert.deepEqual(stages, ["primary", "fallback"]);
  assert.equal(result.title, "中文動画");
  assert.deepEqual(
    await readMediaParseStream(
      stream('{"success":true,"data":{"kind":"video"}}'),
      () => {},
    ),
    { kind: "video" },
  );
});
test("fallback cause wins over primary missing-media text and both routes are retained", async () => {
  const message =
    "No video could be found in this tweet; anonymous X fallback failed: HTTP 503";
  await Promise.all(
    Object.entries({
      network: "xpFallbackNetwork",
      timeout: "xpFallbackTimeout",
      service: "xpFallbackService",
      "rate-limit": "xpFallbackRateLimit",
      restricted: "xpFallbackRestricted",
      verification: "xpFallbackVerification",
    }).map(async ([kind, key]) => {
      const failure = {
        attempts: [
          {
            route: "primary" as const,
            kind: "unavailable",
            message: "No video could be found in this tweet",
          },
          {
            route: "fallback" as const,
            kind,
            message: "Actual fallback cause",
          },
        ],
      };
      await assert.rejects(
        readMediaParseStream(
          stream(JSON.stringify({ type: "error", message, failure })),
          () => {},
        ),
        (reason) => {
          assert.ok(reason instanceof MediaParseError);
          assert.deepEqual(
            mediaParseAttempts(reason.message, reason.failure),
            failure.attempts,
          );
          assert.equal(
            mediaParseErrorKey(
              reason.message,
              "https://x.com/a/status/123",
              reason.failure,
            ),
            key,
          );
          return true;
        },
      );
    }),
  );
  assert.equal(
    mediaParseErrorKey(message, "https://x.com/a/status/123"),
    "xpFallbackService",
  );
  assert.equal(
    mediaParseErrorKey(
      message.replace(
        "HTTP 503",
        "public X service could not be reached after retry",
      ),
      "https://x.com/a/status/123",
    ),
    "xpFallbackNetwork",
  );
});
test("truncated, malformed and failed transport responses never become a successful parse", async () => {
  await Promise.all(
    [
      "",
      '{"type":"progress","stage":"primary"}\n',
      '{"type":"result","data":null}',
      "broken",
      '{"type":"result","data":{}}\n{"type":"progress","stage":"fallback"}\n',
    ].map((body) =>
      assert.rejects(readMediaParseStream(stream(body), () => {})),
    ),
  );
  const failed = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new DOMException("Canceled", "AbortError"));
    },
  });
  await assert.rejects(
    readMediaParseStream(failed, () => {}),
    { name: "AbortError" },
  );
});
test("parse feedback has matching keys in all five languages", () => {
  const keys = Object.keys(mediaParseMessages.zh).sort();
  for (const language of ["zh", "zh-TW", "en", "ja", "ko"]) {
    assert.deepEqual(Object.keys(mediaParseMessages[language]).sort(), keys);
    for (const key of keys) assert.ok(mediaParseMessages[language][key].trim());
  }
});
