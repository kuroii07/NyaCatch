import test from "node:test";
import assert from "node:assert/strict";
import {
  createMuxDraft,
  decodeMuxDraft,
  addMuxPaths,
  removeMuxPath,
  muxProblem,
  inspectMuxPaths,
} from "./mux-model";
import { muxMessages } from "../../i18n/mux";
import type { MuxInspection } from "@/api/conversion";
test("mux draft preserves source order, audio bindings and unknown submission lock", () => {
  const d = {
    ...createMuxDraft(),
    mode: "combine" as const,
    paths: ["C:/video.mp4"],
    activePath: "C:/video.mp4",
    audioPath: "C:/audio.m4a",
    locked: true,
    recentIds: [5],
  };
  assert.deepEqual(decodeMuxDraft(JSON.stringify(d)), d);
  assert.equal(addMuxPaths(d, ["x"]), d);
  assert.equal(removeMuxPath(d, d.activePath), d);
  for (const patch of [
    { version: 2 },
    { mode: "other" },
    { format: "webm" },
    { paths: Array(21).fill("x") },
    { recentIds: [1, 1] },
    { activePath: "missing" },
    { audioPath: 12 },
    { paths: ["C:/video.mp4", "c:\\video.mp4"] },
  ])
    assert.equal(
      decodeMuxDraft(JSON.stringify({ ...d, locked: false, ...patch })).locked,
      true,
    );
  assert.equal(decodeMuxDraft("{").locked, true);
  assert.equal(decodeMuxDraft(null).locked, false);
  const added = addMuxPaths(createMuxDraft(), [
    "C:/a.mp4",
    "c:\\a.mp4",
    "C:/b.mkv",
  ]);
  assert.deepEqual(added.paths, ["C:/a.mp4", "C:/b.mkv"]);
  assert.equal(removeMuxPath(added, "C:/a.mp4").activePath, "C:/b.mkv");
});
test("mux preflight blocks incomplete pairs, missing files, incompatible streams and unready checks", () => {
  const d = addMuxPaths(createMuxDraft(), ["a"]),
    ok = { formats: [{ format: "mp4", available: true }] } as MuxInspection;
  assert.equal(muxProblem(d, {}, {}, true), "c11Checking");
  assert.equal(muxProblem(d, {}, {}, false), "c11Checking");
  assert.equal(muxProblem(d, {}, { a: true }, false), "mxReadFailed");
  assert.equal(muxProblem(d, { a: ok }, {}, false), undefined);
  assert.equal(
    muxProblem({ ...d, mode: "combine" }, { a: ok }, {}, false),
    "mxNeedPair",
  );
  assert.equal(
    muxProblem({ ...d, customDirectory: true }, { a: ok }, {}, false),
    "c09NeedFolder",
  );
  assert.equal(
    muxProblem(
      d,
      {
        a: {
          ...ok,
          formats: [
            { format: "mp4", available: false, reason: "mxCodec:audio:opus" },
          ],
        },
      },
      {},
      false,
    ),
    "mxCodec:audio:opus",
  );
});
test("track inspection uses at most two readers and retains independent errors", async () => {
  let running = 0,
    peak = 0;
  const r = await inspectMuxPaths(
    ["a", "b", "missing", "d"],
    "audio",
    async (path, audio) => {
      assert.equal(audio, "audio");
      peak = Math.max(peak, ++running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      if (path === "missing") throw Error("missing");
      return { source: { path } } as MuxInspection;
    },
  );
  assert.equal(peak, 2);
  assert.deepEqual(Object.keys(r.values).sort(), ["a", "b", "d"]);
  assert.deepEqual(r.errors, { missing: true });
});
test("mux messages cover five languages without losing interpolation", () => {
  const keys = Object.keys(muxMessages.zh).sort();
  for (const language of ["zh", "zh-TW", "en", "ja", "ko"] as const) {
    assert.deepEqual(Object.keys(muxMessages[language]).sort(), keys);
    for (const value of Object.values(muxMessages[language]))
      assert.ok(value.trim());
    for (const key of keys)
      assert.deepEqual(
        (muxMessages[language][key].match(/\{\{\w+\}\}/g) || []).sort(),
        (muxMessages.zh[key].match(/\{\{\w+\}\}/g) || []).sort(),
      );
  }
});

test("legacy drafts and soft subtitle bindings preserve their original semantics", () => {
  const old = createMuxDraft();
  delete old.subtitlePath;
  delete old.subtitleHash;
  delete old.convertSubtitle;
  assert.deepEqual(decodeMuxDraft(JSON.stringify(old)), old);
  const draft = {
    ...addMuxPaths(createMuxDraft(), ["C:/video.mp4"]),
    mode: "combine" as const,
    subtitlePath: "C:/字幕.srt",
    subtitleHash: "a".repeat(64),
    convertSubtitle: true,
    locked: true,
    recentIds: [10],
  };
  assert.deepEqual(decodeMuxDraft(JSON.stringify(draft)), draft);
  for (const patch of [
    { subtitlePath: 4 },
    { subtitlePath: "C:/sub.vtt" },
    { subtitleHash: "bad" },
    { subtitleHash: "" },
    { subtitlePath: "" },
    { convertSubtitle: "yes" },
  ])
    assert.equal(
      decodeMuxDraft(JSON.stringify({ ...draft, locked: false, ...patch }))
        .locked,
      true,
    );
  const check = {
    formats: [{ format: "mp4", available: true }],
  } as MuxInspection;
  assert.equal(
    muxProblem(
      { ...draft, locked: false },
      { "C:/video.mp4": check },
      {},
      false,
    ),
    undefined,
  );
  assert.equal(
    muxProblem(
      {
        ...draft,
        locked: false,
        subtitlePath: "",
        subtitleHash: "",
        convertSubtitle: false,
      },
      { "C:/video.mp4": check },
      {},
      false,
    ),
    "mxNeedPair",
  );
});
