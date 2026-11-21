import test from "node:test";
import assert from "node:assert/strict";
import {
  videoChoices,
  selectionOptions,
  outputExtension,
  cleanStem,
} from "./media-selection";
import type { MediaPreview, MediaFormat } from "../../api/media";

const f = (
  id: string,
  height: number,
  videoCodec: string,
  audioCodec = "none",
  extension = "mp4",
): MediaFormat => ({
  id,
  height,
  videoCodec,
  audioCodec,
  extension,
  width: 0,
  fps: 30,
  filesize: 0,
  approximate: false,
  audioOnly: videoCodec === "none",
});
const preview: MediaPreview = {
  url: "https://example.com/watch",
  title: "clip",
  source: "Example",
  kind: "video",
  duration: 5,
  extension: "mp4",
  hasAudio: true,
  thumbnail: "https://example.com/image.webp?size=2",
  formats: [
    f("av1", 1080, "av01"),
    f("avc", 1080, "avc1"),
    f("720", 720, "avc1"),
    f("audio", 0, "none", "aac", "m4a"),
  ],
};

test("public X route survives every output selection without persisting a CDN URL", () => {
  for (const mode of ["video", "audio", "cover"] as const) {
    const selected = selectionOptions(
      { ...preview, resolver: "x-public" },
      mode,
      "",
      "mp3",
      192,
    );
    assert.equal(selected.resolver, "x-public");
    assert.equal(JSON.stringify(selected).includes("twimg.com"), false);
  }
});

test("real quality grouping keeps resolutions and prefers compatible encoding", () => {
  assert.deepEqual(
    videoChoices(preview).map((x) => x.id),
    ["avc", "720"],
  );
  const o = selectionOptions(preview, "video", "720", "original", 192);
  assert.equal(o.formatId, "720");
  assert.equal(o.audioFormatId, "audio");
  assert.equal(o.container, "mp4");
  assert.throws(() =>
    selectionOptions(preview, "video", "missing", "original", 192),
  );
});
test("audio and cover select separate real outputs", () => {
  assert.equal(
    outputExtension(
      preview,
      selectionOptions(preview, "audio", "", "original", 192),
    ),
    "m4a",
  );
  assert.equal(
    outputExtension(
      preview,
      selectionOptions(preview, "audio", "", "mp3", 192),
    ),
    "mp3",
  );
  assert.equal(
    outputExtension(
      preview,
      selectionOptions(preview, "cover", "", "original", 192),
    ),
    "webp",
  );
  assert.throws(() =>
    selectionOptions({ ...preview, hasAudio: false }, "audio", "", "mp3", 192),
  );
  assert.throws(() =>
    selectionOptions(
      { ...preview, thumbnail: undefined },
      "cover",
      "",
      "original",
      192,
    ),
  );
  assert.equal(cleanStem(" ../../title:*? "), "_.._title___");
});
test("direct files and silent video do not invent quality or audio", () => {
  const direct = { ...preview, hasAudio: false, formats: [] };
  assert.deepEqual(videoChoices(direct), []);
  assert.equal(
    selectionOptions(direct, "video", "", "original", 192).formatId,
    undefined,
  );
});

test("video with known audio never silently loses it when tracks are unavailable", () => {
  const broken = { ...preview, formats: [f("v", 720, "avc1")] };
  assert.throws(() => selectionOptions(broken, "video", "v", "original", 192));
  const mixed = { ...preview, formats: [f("muxed", 720, "avc1", "aac")] };
  assert.equal(
    selectionOptions(mixed, "video", "", "original", 192).formatId,
    "muxed",
  );
});

test("quality grouping keeps the playable muxed stream when a preferred codec lacks audio", () => {
  const mixed = {
    ...preview,
    formats: [f("muxed", 720, "vp9", "aac"), f("silent-avc", 720, "avc1")],
  };
  const choices = videoChoices(mixed);
  assert.equal(choices[0].id, "muxed");
  assert.equal(
    selectionOptions(mixed, "video", "", "original", 192).formatId,
    "muxed",
  );
  const withTrack = {
    ...mixed,
    formats: [...mixed.formats, f("track", 0, "none", "aac", "m4a")],
  };
  assert.equal(videoChoices(withTrack)[0].id, "silent-avc");
  const sameCodec = {
    ...preview,
    formats: [
      f("silent-first", 720, "avc1"),
      f("mixed-later", 720, "avc1", "aac"),
    ],
  };
  assert.equal(videoChoices(sameCodec)[0].id, "mixed-later");
});
