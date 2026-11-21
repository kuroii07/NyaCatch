import test from "node:test";
import assert from "node:assert/strict";
import { douyinSource, normalizeDouyin } from "./douyin-metadata";

const id = "7700577998572354746";
const short = "https://v.douyin.com/ECM9CkNPp-E/";
const canonical = `https://www.douyin.com/video/${id}`;
const video = "https://v26-web.douyinvod.com/media?signature=example";
const data = {
  aweme_id: id,
  desc: "test",
  duration: 12000,
  video: {
    play_addr: { width: 1280, height: 720, url_list: [video] },
    cover: { url_list: ["https://p3-pc-sign.douyinpic.com/image"] },
  },
};

test("only permits a single Douyin video or known short share link", () => {
  assert.equal(douyinSource(canonical), id);
  assert.equal(douyinSource(short), "");
  for (const url of [
    `https://douyin.com.evil.test/video/${id}`,
    `https://www.douyin.com/video/${id}/more`,
    `https://v.douyin.com/@evil/`,
    `http://www.douyin.com/video/${id}`,
  ])
    assert.throws(() => douyinSource(url));
});

test("accepts image notes and binds each image to its post across CDN refreshes", () => {
  const source = `https://www.douyin.com/note/${id}`;
  assert.equal(douyinSource(source), id);
  const image = (uri: string) => ({
    uri,
    url_list: [
      `https://p3-sign.douyinpic.com/${uri}~tplv-dy.jpg?signature=one`,
    ],
  });
  const post = {
    ...data,
    images: [image("tos-cn-i-test/one"), image("tos-cn-i-test/two")],
  };
  const result = normalizeDouyin(source, id, post, "test-agent");
  assert.ok("entries" in result);
  assert.equal(result.entries.length, 2);
  assert.notEqual(
    result.entries[0]._nyacatch_resource_id,
    result.entries[1]._nyacatch_resource_id,
  );
  assert.equal(result.entries[0]._nyacatch_kind, "image");
  const refreshed = normalizeDouyin(
    source,
    id,
    {
      ...post,
      images: [
        {
          ...image("tos-cn-i-test/one"),
          url_list: [
            "https://p9-sign.douyinpic.com/tos-cn-i-test/one~tplv-dy.webp?signature=two",
          ],
        },
      ],
    },
    "test-agent",
  );
  assert.ok("entries" in refreshed);
  assert.equal(
    refreshed.entries[0]._nyacatch_resource_id,
    result.entries[0]._nyacatch_resource_id,
  );
  for (const images of [
    [image("same"), image("same")],
    [{ uri: "one", url_list: ["https://p3-sign.douyinpic.com.evil.test/one"] }],
    Array.from({ length: 21 }, (_, i) => image(String(i))),
  ]) {
    assert.throws(() =>
      normalizeDouyin(source, id, { ...post, images }, "test-agent"),
    );
  }
});

test("binds a playable candidate to its post and rejects unsafe or ambiguous inputs", () => {
  const result = normalizeDouyin(short, id, data, "test-agent");
  assert.equal(result._nyacatch_resource_id, `dy-${id}`);
  assert.equal(result.formats[0].url, video);
  assert.equal(
    result.formats[0].http_headers.Referer,
    "https://www.douyin.com/",
  );
  assert.equal(result.thumbnail, "https://p3-pc-sign.douyinpic.com/image");
  assert.throws(() =>
    normalizeDouyin(canonical, "1234567890123456789", data, "test"),
  );
  assert.throws(() =>
    normalizeDouyin(
      short,
      id,
      { ...data, aweme_id: "1234567890123456789" },
      "test",
    ),
  );
  assert.throws(() =>
    normalizeDouyin(
      short,
      id,
      {
        ...data,
        video: {
          play_addr: {
            url_list: ["https://v26-web.douyinvod.com.evil.test/x"],
          },
        },
      },
      "test",
    ),
  );
  assert.throws(() =>
    normalizeDouyin(short, id, { ...data, images: [{ url: "image" }] }, "test"),
  );
  assert.equal(
    normalizeDouyin(
      short,
      id,
      {
        ...data,
        video: {
          ...data.video,
          cover: { url_list: ["https://p3-pc-sign.douyinpic.com.evil.test/x"] },
        },
      },
      "test",
    ).thumbnail,
    undefined,
  );
});
