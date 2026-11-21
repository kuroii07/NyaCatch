import assert from "node:assert/strict";
import test from "node:test";
import {
  CONVERTER_WORKSPACE_KEY,
  appendConverterDraft,
  applyConversionPreset,
  createConverterWorkspace,
  decodeConverterWorkspace,
  encodeConverterWorkspace,
} from "./converter-workspace";
import { useConverterWorkspace } from "../../store/converter-workspace";
import { converterWorkflowMessages } from "../../i18n/converter-workflow";

test("conversion drafts preserve independent modes, settings and unknown submission across serialization", () => {
  let state = createConverterWorkspace();
  state = appendConverterDraft(state, "audio", [
    "C:\\素材\\input.mp4",
  ]).workspace;
  state = applyConversionPreset(state, "audio");
  state.settings.audio = {
    ...state.settings.audio,
    customDirectory: true,
    directory: "D:\\Output 中文",
  };
  state.submission = "unknown";
  const restored = decodeConverterWorkspace(encodeConverterWorkspace(state));
  assert.deepEqual(restored, state);
  assert.equal(restored.mode, "audio");
  assert.equal(restored.settings.audio.audioBitrate, 192);
  assert.deepEqual(restored.drafts.video, []);
});
test("draft append preserves existing files and limits each mode to twenty without case-variant duplicates", () => {
  const state = appendConverterDraft(createConverterWorkspace(), "video", [
    "C:/Clip.mp4",
  ]).workspace;
  const result = appendConverterDraft(state, "video", [
    "c:\\clip.mp4",
    ...Array.from({ length: 25 }, (_, index) => "C:/" + index + ".mp4"),
  ]);
  assert.equal(result.paths.length, 20);
  assert.equal(result.duplicates, 1);
  assert.equal(result.excess, 6);
  assert.equal(result.paths[0], "C:/Clip.mp4");
  assert.deepEqual(state.drafts.video, ["C:/Clip.mp4"]);
});
test("presets update output choices while preserving the custom directory and other mode drafts", () => {
  const state = createConverterWorkspace();
  state.settings.image = {
    maxEdge: 512,
    audioBitrate: 0,
    customDirectory: true,
    directory: "C:/images",
  };
  state.drafts.audio = ["C:/original.mp4"];
  const image = applyConversionPreset(state, "image");
  assert.equal(image.formats.image, "webp");
  assert.equal(image.qualities.image, "high");
  assert.equal(image.settings.image.maxEdge, 1920);
  assert.equal(image.settings.image.directory, "C:/images");
  assert.equal(image.settings.image.customDirectory, true);
  assert.deepEqual(image.drafts.audio, ["C:/original.mp4"]);
  const video = applyConversionPreset(state, "video");
  assert.equal(video.formats.video, "mp4");
  assert.equal(video.settings.video.maxEdge, 1920);
});
test("invalid stored drafts are rejected instead of silently clearing the submission lock", () => {
  for (const change of [
    { version: 2 },
    { mode: "other" },
    { submission: "submitting" },
    { formats: { video: "exe", audio: "mp3", image: "png" } },
    { drafts: { video: ["C:/bad\0.mp4"], audio: [], image: [] } },
  ])
    assert.throws(() =>
      decodeConverterWorkspace(
        JSON.stringify({ ...createConverterWorkspace(), ...change }),
      ),
    );
  assert.throws(() => decodeConverterWorkspace("x".repeat(600001)));
  assert.throws(() => decodeConverterWorkspace("invalid json"));
});
test("an audio bitrate choice survives lossless-format selection for restoration to a lossy format", () => {
  const state = applyConversionPreset(createConverterWorkspace(), "audio");
  state.formats.audio = "flac";
  assert.equal(
    decodeConverterWorkspace(encodeConverterWorkspace(state)).settings.audio
      .audioBitrate,
    192,
  );
});
test("draft writes commit only after storage succeeds and preserve the durable lock on a later failure", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const memory = new Map<string, string>();
  let fail = false;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (fail) throw Error("quota exceeded");
        memory.set(key, value);
      },
    },
  });
  try {
    useConverterWorkspace.setState({
      workspace: createConverterWorkspace(),
      storageError: false,
    });
    const store = useConverterWorkspace.getState();
    assert.equal(
      store.save(
        (current) =>
          appendConverterDraft(current, "audio", ["C:/clip.mp4"]).workspace,
      ),
      true,
    );
    assert.equal(
      store.save((current) => ({ ...current, submission: "unknown" })),
      true,
    );
    const locked = useConverterWorkspace.getState().workspace;
    fail = true;
    assert.equal(
      store.save((current) => ({
        ...current,
        submission: "idle",
        drafts: { ...current.drafts, audio: [] },
      })),
      false,
    );
    assert.equal(useConverterWorkspace.getState().workspace, locked);
    assert.equal(
      decodeConverterWorkspace(memory.get(CONVERTER_WORKSPACE_KEY) ?? null)
        .submission,
      "unknown",
    );
    assert.equal(useConverterWorkspace.getState().storageError, true);
    fail = false;
    assert.equal(
      store.save((current) => ({ ...current, submission: "idle" })),
      true,
    );
    assert.equal(useConverterWorkspace.getState().storageError, false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
    useConverterWorkspace.setState({
      workspace: createConverterWorkspace(),
      storageError: false,
    });
  }
});
test("conversion workflow translations cover all five locales with consistent interpolation fields", () => {
  const keys = Object.keys(converterWorkflowMessages.zh).sort();
  for (const messages of Object.values(converterWorkflowMessages)) {
    assert.deepEqual(Object.keys(messages).sort(), keys);
    for (const key of keys) {
      const name = key as keyof typeof messages;
      assert.ok(messages[name].trim());
      assert.deepEqual(
        messages[name].match(/\{\{\w+\}\}/g),
        converterWorkflowMessages.zh[name].match(/\{\{\w+\}\}/g),
      );
    }
  }
});
