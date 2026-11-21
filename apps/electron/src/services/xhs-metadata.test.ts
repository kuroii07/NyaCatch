import test from "node:test";
import assert from "node:assert/strict";
import { xhsNoteId, normalizeXhsNote } from "./xhs-metadata";

const id = "6ae09439000000001f01697b";
const source = `https://www.xiaohongshu.com/discovery/item/${id}?xsec_token=sample`;
const image = (fileId: string) => ({
  fileId,
  urlDefault: `https://sns-webpic-qc.xhscdn.com/${fileId}?variant=webp`,
});

test("accepts only one explicitly identified Xiaohongshu post", () => {
  assert.equal(xhsNoteId(source), id);
  for (const bad of [
    `https://xiaohongshu.com.example/${id}`,
    `https://www.xiaohongshu.com/explore/${id}/extra`,
    `http://www.xiaohongshu.com/explore/${id}`,
    `https://u:p@www.xiaohongshu.com/explore/${id}`,
  ]) {
    assert.throws(() => xhsNoteId(bad));
  }
});

test("accepts known share links and binds resolved images to the final note", () => {
  const short = "http://xhslink.com/a/Abc123XYZ";
  assert.equal(xhsNoteId(short), "");
  assert.equal(xhsNoteId("https://xhslink.cn/o/Abc123XYZ"), "");
  for (const bad of [
    "https://xhslink.com.evil.test/a/Abc123XYZ",
    "https://xhslink.com:444/a/Abc123XYZ",
    "https://xhslink.com/a/Abc123XYZ/extra",
    "https://user:pass@xhslink.com/a/Abc123XYZ",
  ])
    assert.throws(() => xhsNoteId(bad));
  const note = { noteId: id, type: "normal", imageList: [image("one")] };
  const result = normalizeXhsNote(short, note, source);
  assert.ok(result.entries[0]._nyacatch_resource_id.includes(id));
  assert.throws(() =>
    normalizeXhsNote(short, note, "https://www.xiaohongshu.com/login"),
  );
  assert.throws(() =>
    normalizeXhsNote(
      source,
      note,
      "https://www.xiaohongshu.com/explore/123456789012345678901234",
    ),
  );
});

test("preserves unique, stable image identity and rejects unsafe data", () => {
  const note = {
    noteId: id,
    type: "normal",
    title: "hello",
    imageList: [image("one"), image("two")],
  };
  const doc = normalizeXhsNote(source, note);
  assert.equal(doc.entries.length, 2);
  assert.notEqual(
    doc.entries[0]._nyacatch_resource_id,
    doc.entries[1]._nyacatch_resource_id,
  );
  assert.match(
    normalizeXhsNote(source, {
      ...note,
      imageList: [
        { fileId: "one", urlDefault: "http://sns-webpic-qc.xhscdn.com/one" },
      ],
    }).entries[0].url,
    /^https:/,
  );
  assert.equal(
    normalizeXhsNote(source, note).entries[0]._nyacatch_resource_id,
    doc.entries[0]._nyacatch_resource_id,
  );
  assert.throws(() => normalizeXhsNote(source, { ...note, noteId: "other" }));
  assert.throws(() =>
    normalizeXhsNote(source, {
      ...note,
      imageList: [image("one"), image("one")],
    }),
  );
  assert.throws(() =>
    normalizeXhsNote(source, {
      ...note,
      imageList: [
        {
          fileId: "one",
          urlDefault: "https://sns-webpic-qc.xhscdn.com.evil.test/x",
        },
      ],
    }),
  );
  assert.throws(() =>
    normalizeXhsNote(source, {
      ...note,
      imageList: Array.from({ length: 21 }, (_, i) => image(String(i))),
    }),
  );
  assert.throws(() => normalizeXhsNote(source, { ...note, type: "video" }));
});
