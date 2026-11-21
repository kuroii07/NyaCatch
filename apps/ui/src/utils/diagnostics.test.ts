import assert from "node:assert/strict";
import test from "node:test";
import {
  createDiagnosticReport,
  diagnosticErrorDetails,
  diagnosticErrorSummary,
  sanitizeDiagnosticText,
} from "./diagnostics";

test("redacts credentials, signed URLs, and local paths from error summaries", () => {
  const input =
    "ERROR Authorization: Bearer abc.def; Cookie=session=secret; other=private; proxy=http://user:pass@127.0.0.1:8080 https://cdn.example/video.mp4?token=signed D:\\Users\\Alice\\Downloads\\file.mp4";
  const result = sanitizeDiagnosticText(input);

  for (const secret of [
    "abc.def",
    "session=secret",
    "other=private",
    "user:pass",
    "signed",
    "Alice",
    "Downloads",
    "cdn.example",
  ]) {
    assert.equal(result.includes(secret), false, `leaked ${secret}`);
  }
  assert.match(result, /\[URL\]/);
  assert.match(result, /\[PATH\]/);
});

test("diagnostic report contains only safe metadata and bounded task summaries", () => {
  const report = createDiagnosticReport({
    productVersion: "0.2.0-beta.1",
    upstreamVersion: "3.5.0",
    electronVersion: "41.1.0",
    nodeVersion: "24.15.0",
    osVersion: "10.0.26200",
    platform: "win32",
    arch: "x64",
    tools: { "yt-dlp": "2026.10.21" },
    preferences: {
      language: "zh-TW",
      theme: "cream",
      maxRunner: 3,
      apiKey: "must-not-appear",
      proxy: "http://127.0.0.1:8000",
    },
    recentTasks: [
      {
        type: "youtube-single",
        status: "failed",
        errorSummary:
          "HTTP 403 for https://x.com/post?token=secret at C:\\Users\\Alice\\x.mp4",
        errorCategory: "source-restriction",
        name: "Private file name",
        url: "https://x.com/post?token=secret",
      },
    ],
  });
  const serialized = JSON.stringify(report);

  assert.equal(serialized.includes("must-not-appear"), false);
  assert.equal(serialized.includes("127.0.0.1"), false);
  assert.equal(serialized.includes("Private file name"), false);
  assert.equal(serialized.includes("x.com"), false);
  assert.equal(serialized.includes("Alice"), false);
  assert.equal(report.recentTasks.length, 1);
  assert.equal(report.runtime.operatingSystemVersion, "10.0.26200");
  assert.deepEqual(report.recentTasks[0], {
    type: "youtube-single",
    status: "failed",
    errorCategory: "source-restriction",
    errorSummary: "HTTP 403 for [URL] at [PATH]",
  });
});

test("extracts only the last concise error line from a task log", () => {
  const details = diagnosticErrorDetails(
    "download started\nprogress 20%\nERROR: failed to fetch https://site.example/a?token=secret",
  );
  assert.deepEqual(details, {
    category: "network",
    summary: "ERROR: failed to fetch [URL]",
  });
  assert.equal(diagnosticErrorSummary("download started\nprogress 20%"), "");
});

test("redacts JSON credentials and common Windows, UNC, and POSIX paths", () => {
  const result = sanitizeDiagnosticText(
    'ERROR {"apiKey":"private-key","Cookie":"session=private-cookie"} C:/Media/Alice/private.mp4 \\\\server\\share\\private.mp4 /tmp/Alice/private.mp4',
  );

  for (const secret of [
    "private-key",
    "private-cookie",
    "C:/Media",
    "Alice",
    "server",
    "share",
  ]) {
    assert.equal(result.includes(secret), false, `leaked ${secret}`);
  }
  assert.equal((result.match(/\[PATH\]/g) || []).length, 3);
});
