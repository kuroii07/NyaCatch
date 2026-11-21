import {
  addDraftPaths,
  defaultConversionSettings,
  converterFormats,
  type ConversionMode,
  type ConversionQuality,
  type ConversionSettings,
} from "./converter-model";

export const CONVERTER_WORKSPACE_KEY = "nyacatch-converter-workspace-v1";
export const conversionModes: ConversionMode[] = ["video", "audio", "image"];
export interface ConverterWorkspace {
  version: 1;
  mode: ConversionMode;
  drafts: Record<ConversionMode, string[]>;
  formats: Record<ConversionMode, string>;
  qualities: Record<ConversionMode, ConversionQuality>;
  settings: Record<ConversionMode, ConversionSettings>;
  submission: "idle" | "unknown";
}
export function createConverterWorkspace(): ConverterWorkspace {
  return {
    version: 1,
    mode: "video",
    submission: "idle",
    drafts: { video: [], audio: [], image: [] },
    formats: { video: "mp4", audio: "original", image: "png" },
    qualities: { video: "medium", audio: "medium", image: "medium" },
    settings: {
      video: { ...defaultConversionSettings },
      audio: { ...defaultConversionSettings },
      image: { ...defaultConversionSettings },
    },
  };
}
export function decodeConverterWorkspace(
  text: string | null,
): ConverterWorkspace {
  if (!text) return createConverterWorkspace();
  if (text.length > 600000) throw Error("Conversion draft is too large");
  const value = JSON.parse(text) as ConverterWorkspace;
  if (
    !value ||
    value.version !== 1 ||
    !conversionModes.includes(value.mode) ||
    !["idle", "unknown"].includes(value.submission)
  )
    throw Error("Invalid conversion draft");
  const result = createConverterWorkspace();
  result.mode = value.mode;
  result.submission = value.submission;
  for (const mode of conversionModes) {
    const paths = value.drafts?.[mode],
      settings = value.settings?.[mode];
    if (
      !Array.isArray(paths) ||
      paths.length > 20 ||
      !paths.every(
        (file) =>
          typeof file === "string" &&
          file.trim() &&
          file.length <= 32768 &&
          !file.includes("\0"),
      ) ||
      !converterFormats(mode).includes(value.formats?.[mode]) ||
      !["high", "medium", "low"].includes(value.qualities?.[mode]) ||
      !settings ||
      !Number.isInteger(settings.maxEdge) ||
      settings.maxEdge < 0 ||
      settings.maxEdge > 16384 ||
      ![0, 64, 96, 128, 192, 256, 320].includes(settings.audioBitrate) ||
      typeof settings.customDirectory !== "boolean" ||
      typeof settings.directory !== "string" ||
      settings.directory.length > 32768 ||
      settings.directory.includes("\0")
    )
      throw Error("Invalid conversion draft settings");
    result.drafts[mode] = addDraftPaths([], paths).paths;
    result.formats[mode] = value.formats[mode];
    result.qualities[mode] = value.qualities[mode];
    result.settings[mode] = {
      maxEdge: settings.maxEdge,
      audioBitrate: settings.audioBitrate,
      customDirectory: settings.customDirectory,
      directory: settings.directory,
    };
  }
  return result;
}
export function encodeConverterWorkspace(workspace: ConverterWorkspace) {
  return JSON.stringify(decodeConverterWorkspace(JSON.stringify(workspace)));
}
export function appendConverterDraft(
  workspace: ConverterWorkspace,
  mode: ConversionMode,
  paths: string[],
) {
  const result = addDraftPaths(workspace.drafts[mode], paths);
  return {
    ...result,
    workspace: {
      ...workspace,
      mode,
      drafts: { ...workspace.drafts, [mode]: result.paths },
    },
  };
}
export function applyConversionPreset(
  workspace: ConverterWorkspace,
  mode: ConversionMode,
): ConverterWorkspace {
  const format = { video: "mp4", audio: "mp3", image: "webp" }[mode];
  return {
    ...workspace,
    formats: { ...workspace.formats, [mode]: format },
    qualities: {
      ...workspace.qualities,
      [mode]: mode === "image" ? "high" : "medium",
    },
    settings: {
      ...workspace.settings,
      [mode]: {
        ...workspace.settings[mode],
        maxEdge: mode === "audio" ? 0 : 1920,
        audioBitrate: mode === "audio" ? 192 : 0,
      },
    },
  };
}
