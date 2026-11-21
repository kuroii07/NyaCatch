import test from "node:test";
import assert from "node:assert/strict";
import {
  createTrimWorkspace,
  decodeTrimWorkspace,
  parseTrimTime,
  formatTrimTime,
  trimRangeError,
  markTrimPoint,
  updateTrimDraft,
  selectTrimSegment,
  addTrimSegment,
  removeTrimSegment,
  confirmTrimCreation,
  validTrimName,
} from "./trim-model";
import { trimMessages } from "../../i18n/trim";

test("marking in and out preserves a valid range even when points cross or reach media boundaries", () => {
  assert.deepEqual(markTrimPoint("in", 1250.4, 0, 6000, 6000), {
    start: "00:00:01.250",
    end: "00:00:06.000",
  });
  assert.deepEqual(markTrimPoint("out", 3750, 1250, 6000, 6000), {
    start: "00:00:01.250",
    end: "00:00:03.750",
  });
  for (const args of [
    ["in", 6000, 0, 1000, 6000],
    ["out", 0, 4000, 6000, 6000],
    ["in", 5000, 0, 1000, 6000],
    ["out", 1000, 5000, 6000, 6000],
  ] as const) {
    const range = markTrimPoint(...args);
    assert.equal(trimRangeError(range.start, range.end, args[4]), undefined);
  }
});

test("trim times accept seconds and clock notation without rounding away milliseconds", () => {
  for (const [text, expected] of [
    ["12.5", 12500],
    ["1:02.003", 62003],
    ["01:02:03.004", 3723004],
    ["90:00", 5400000],
    ["0", 0],
  ] as const)
    assert.equal(parseTrimTime(text), expected);
  for (const value of [
    "",
    "-1",
    "1e3",
    "Infinity",
    "1:60",
    "1:60:00",
    "0.0001",
    "99999999999999999999999999999999",
  ])
    assert.equal(parseTrimTime(value), undefined);
  assert.equal(formatTrimTime(3723004), "01:02:03.004");
});
test("trim ranges reject reversed, empty and out-of-source intervals", () => {
  assert.equal(trimRangeError("0", "6", 6000), undefined);
  assert.equal(trimRangeError("2.25", "3.5", 6000), undefined);
  assert.equal(trimRangeError("2", "2", 6000), "trInvalidRange");
  assert.equal(trimRangeError("0", "6.001", 6000), "trExceeds");
  assert.equal(trimRangeError("bad", "1", 6000), "trInvalidTime");
});
test("trim draft restores the uncertainty lock and rejects corrupt persisted state", () => {
  const draft = updateTrimDraft(createTrimWorkspace(), {
    path: "H:\\素材\\video.mp4",
    start: "2.25",
    end: "3.5",
    locked: true,
  });
  assert.deepEqual(decodeTrimWorkspace(JSON.stringify(draft)), draft);
  for (const patch of [
    { locked: "false" },
    { format: "png" },
    { version: 2 },
    { path: "bad\0path" },
  ])
    assert.throws(() =>
      decodeTrimWorkspace(JSON.stringify({ ...draft, ...patch })),
    );
});

test("legacy drafts recover one range while multi-clip drafts preserve independent names, ranges and active selection", () => {
  const old = {
    version: 1,
    path: "H:\\video.mp4",
    start: "1.25",
    end: "2.5",
    format: "mp4",
    quality: "medium",
    directory: "",
    customDirectory: false,
    locked: true,
  };
  const recovered = decodeTrimWorkspace(JSON.stringify(old));
  assert.equal(recovered.locked, true);
  assert.deepEqual(recovered.segments, [
    { id: "clip-1", name: "", start: "1.25", end: "2.5" },
  ]);
  let draft = updateTrimDraft(recovered, { locked: false, name: "开场" });
  draft = addTrimSegment(draft, 6000);
  draft = updateTrimDraft(draft, { name: "尾声", start: "4", end: "5.5" });
  const secondId = draft.activeId;
  draft = selectTrimSegment(draft, "clip-1");
  assert.equal(draft.start, "1.25");
  assert.equal(draft.segments[1].name, "尾声");
  assert.deepEqual(decodeTrimWorkspace(JSON.stringify(draft)), draft);
  draft = removeTrimSegment(draft, "clip-1");
  assert.equal(draft.activeId, secondId);
  assert.equal(draft.start, "4");
  assert.deepEqual(removeTrimSegment(draft, secondId), draft);
});

test("confirmed creations remove only acknowledged clips and preserve the unknown lock and recent task identities", () => {
  let draft = updateTrimDraft(createTrimWorkspace(), {
    path: "H:\\source.mp4",
    end: "2",
  });
  draft = addTrimSegment(draft, 6000);
  draft = updateTrimDraft(draft, { locked: true });
  const pendingId = draft.activeId;
  draft = confirmTrimCreation(draft, "clip-1", 81);
  assert.equal(draft.locked, true);
  assert.equal(draft.path, "H:\\source.mp4");
  assert.deepEqual(
    draft.segments.map((item) => item.id),
    [pendingId],
  );
  assert.deepEqual(decodeTrimWorkspace(JSON.stringify(draft)).recentIds, [81]);
  draft = confirmTrimCreation(draft, pendingId, 82);
  assert.equal(draft.path, "");
  assert.equal(draft.locked, true);
  assert.deepEqual(draft.recentIds, [81, 82]);
});

test("multi-clip limits and corrupt identities cannot bypass draft recovery", () => {
  let draft = updateTrimDraft(createTrimWorkspace(), { end: "1" });
  for (let i = 0; i < 25; i++) draft = addTrimSegment(draft, 6000);
  assert.equal(draft.segments.length, 20);
  for (const patch of [
    { segments: [] },
    { segments: [...draft.segments, draft.segments[0]] },
    { segments: [draft.segments[0], draft.segments[0]] },
    { activeId: "missing" },
    { recentIds: [1, 1] },
    { recentIds: [-1] },
  ])
    assert.throws(() =>
      decodeTrimWorkspace(JSON.stringify({ ...draft, ...patch })),
    );
});

test("clip names are confined to portable filename components", () => {
  for (const name of ["", "片段 01", "scene.v2", "a".repeat(80)])
    assert.equal(validTrimName(name), true, name);
  for (const name of [
    "../outside",
    "C:\\escape",
    "bad:name",
    "a\0b",
    "CON",
    "com1.mp4",
    "LPT²",
    "trail.",
    " leading",
    "a".repeat(81),
  ])
    assert.equal(validTrimName(name), false, name);
});
test("trim messages cover all locales and preserve range interpolation fields", () => {
  const keys = Object.keys(trimMessages.zh).sort();
  for (const messages of Object.values(trimMessages)) {
    assert.deepEqual(Object.keys(messages).sort(), keys);
    assert.ok(Object.values(messages).every((value) => value.trim()));
    assert.match(messages.trRangeSummary, /\{\{start\}\}/);
    assert.match(messages.trRangeSummary, /\{\{end\}\}/);
  }
});
