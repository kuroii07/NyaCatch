import test from "node:test";
import assert from "node:assert/strict";
import { originalAudioExtension } from "@mediago/shared-common";
import { audioInputIssue } from "./audio-model";
import {
  converterFormats,
  conversionOptions,
  getModeForFormat,
} from "./converter-model";
import {
  createConverterWorkspace,
  decodeConverterWorkspace,
} from "./converter-workspace";
import { audioExtractMessages } from "../../i18n/audio-extract";
test("audio copy containers are explicit and unknown codecs cannot silently re-encode", () => {
  for (const [codec, extension] of Object.entries({
    aac: "m4a",
    alac: "m4a",
    mp3: "mp3",
    flac: "flac",
    opus: "opus",
    vorbis: "ogg",
    pcm_s16le: "wav",
    pcm_s24le: "wav",
    pcm_f32le: "wav",
    ac3: "ac3",
    eac3: "eac3",
    mp2: "mp2",
  }))
    assert.equal(originalAudioExtension(codec), extension);
  assert.equal(originalAudioExtension("unknown"), undefined);
  const file = {
    path: "a",
    available: true,
    media: { hasAudio: true, hasVideo: true, durationMs: 1000 },
    audio: { codec: "aac", sampleRate: 48000, channels: 2, extension: "m4a" },
  };
  assert.equal(audioInputIssue(file, true), undefined);
  assert.equal(
    audioInputIssue(
      { ...file, audio: { ...file.audio, extension: undefined } },
      true,
    ),
    "axUnsupported",
  );
  assert.equal(
    audioInputIssue(
      { ...file, audio: { ...file.audio, extension: undefined } },
      false,
    ),
    undefined,
  );
  assert.equal(
    audioInputIssue(
      { ...file, media: { ...file.media, hasAudio: false } },
      false,
    ),
    "axNoAudio",
  );
});
test("original audio stays in audio drafts, survives recovery and preserves legacy formats", () => {
  const draft = createConverterWorkspace();
  assert.equal(draft.formats.audio, "original");
  assert.equal(getModeForFormat("original"), "audio");
  assert.equal(converterFormats("audio").length, 8);
  assert.equal(
    decodeConverterWorkspace(JSON.stringify(draft)).formats.audio,
    "original",
  );
  draft.formats.audio = "mp3";
  assert.equal(
    decodeConverterWorkspace(JSON.stringify(draft)).formats.audio,
    "mp3",
  );
  const settings = {
    maxEdge: 1920,
    audioBitrate: 192,
    customDirectory: false,
    directory: "",
  };
  assert.equal(
    conversionOptions("audio", "original", settings).audioBitrate,
    0,
  );
  assert.equal(conversionOptions("audio", "original", settings).maxEdge, 0);
});
test("audio extraction messages cover five locales and preserve the output extension variable", () => {
  const keys = Object.keys(audioExtractMessages.zh);
  for (const language of Object.values(audioExtractMessages)) {
    assert.deepEqual(Object.keys(language), keys);
    assert.ok(language.axSource.includes("{{extension}}"));
    assert.ok(Object.values(language).every(Boolean));
  }
});
