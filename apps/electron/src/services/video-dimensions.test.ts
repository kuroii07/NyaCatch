import test from "node:test";
import assert from "node:assert/strict";
import { parseVideoDimensions, parseMediaInspection } from "./video-dimensions";
test("compression metadata identifies HDR/high bit depth and the first video track duration", () => {
  const raw = {
    format: { duration: "20" },
    streams: [
      {
        codec_type: "video",
        width: 1920,
        height: 1080,
        duration: "3",
        color_transfer: "smpte2084",
        pix_fmt: "yuv420p10le",
        bits_per_raw_sample: "10",
      },
      { codec_type: "audio", duration: "20" },
    ],
  };
  assert.deepEqual(parseMediaInspection(JSON.stringify(raw)).video, {
    width: 1920,
    height: 1080,
    hdr: true,
    bitDepth: 10,
    durationMs: 3000,
  });
  assert.deepEqual(
    parseMediaInspection(
      JSON.stringify({
        streams: [
          {
            codec_type: "video",
            width: 96,
            height: 64,
            tags: { DURATION: "00:00:03.500000000" },
          },
        ],
      }),
    ).video,
    { width: 96, height: 64, durationMs: 3500 },
  );
});

test("video inspection skips cover art and preserves portrait dimensions", () => {
  assert.deepEqual(
    parseVideoDimensions(
      JSON.stringify({
        streams: [
          { width: 4000, height: 4000, disposition: { attached_pic: 1 } },
          { width: 1080, height: 1920, disposition: { attached_pic: 0 } },
        ],
      }),
    ),
    { width: 1080, height: 1920 },
  );
});

test("video dimensions follow display rotation while preserving metadata for ordinary and upside-down video", () => {
  for (const rotation of [90, -90, 270, -270]) {
    assert.deepEqual(
      parseVideoDimensions(
        JSON.stringify({
          streams: [
            { width: 1920, height: 1080, tags: { rotate: String(rotation) } },
          ],
        }),
      ),
      { width: 1080, height: 1920 },
    );
    assert.deepEqual(
      parseMediaInspection(
        JSON.stringify({
          streams: [
            {
              codec_type: "video",
              width: 1920,
              height: 1080,
              side_data_list: [{ rotation }, {}],
            },
          ],
        }),
      ).video,
      { width: 1080, height: 1920 },
    );
  }
  for (const rotation of [0, 180, -180, 360])
    assert.deepEqual(
      parseVideoDimensions(
        JSON.stringify({
          streams: [
            { width: 1920, height: 1080, side_data_list: [{ rotation }] },
          ],
        }),
      ),
      { width: 1920, height: 1080 },
    );
  assert.deepEqual(
    parseVideoDimensions(
      JSON.stringify({
        streams: [
          {
            width: 1920,
            height: 1080,
            tags: { rotate: "90" },
            side_data_list: [{ rotation: 0 }],
          },
        ],
      }),
    ),
    { width: 1920, height: 1080 },
  );
});

test("media inspection reads duration and ignores audio cover art as a video track", () => {
  assert.deepEqual(
    parseMediaInspection(
      JSON.stringify({
        format: { duration: "6.125" },
        streams: [
          { codec_type: "audio" },
          {
            codec_type: "video",
            width: 800,
            height: 800,
            disposition: { attached_pic: 1 },
          },
        ],
      }),
    ),
    {
      video: undefined,
      media: { durationMs: 6125, hasVideo: false, hasAudio: true },
    },
  );
  assert.equal(
    parseMediaInspection(
      JSON.stringify({
        format: { duration: "N/A" },
        streams: [
          { codec_type: "audio", duration: "4" },
          { codec_type: "video", duration: "6" },
        ],
      }),
    ).media?.durationMs,
    6000,
  );
});

test("unrecognized or malformed video dimensions cannot enable resolution choices", () => {
  for (const raw of [
    "invalid",
    "null",
    "{}",
    '{"streams":{}}',
    '{"streams":[null]}',
    '{"streams":[{"width":0,"height":1080}]}',
    '{"streams":[{"width":1920,"height":-1}]}',
    '{"streams":[{"width":"1920","height":1080}]}',
  ])
    assert.equal(parseVideoDimensions(raw), undefined);
});

test("audio metadata follows the first track and exposes only a supported direct-copy extension", () => {
  const raw = JSON.stringify({
    format: { duration: "2" },
    streams: [
      {
        codec_type: "audio",
        codec_name: "aac",
        sample_rate: "48000",
        channels: 2,
      },
      {
        codec_type: "audio",
        codec_name: "flac",
        sample_rate: "44100",
        channels: 1,
      },
    ],
  });
  assert.deepEqual(parseMediaInspection(raw).audio, {
    codec: "aac",
    sampleRate: 48000,
    channels: 2,
    extension: "m4a",
  });
  assert.equal(
    parseMediaInspection(raw.replace('"aac"', '"unknown"')).audio?.extension,
    undefined,
  );
});
