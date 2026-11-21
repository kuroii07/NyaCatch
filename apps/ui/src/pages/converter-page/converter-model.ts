import type { ConversionOptions, LocalFileCheck } from "@mediago/shared-common";
export type ConversionMode = "video" | "audio" | "image";
export type ConversionQuality = "high" | "medium" | "low";

const formats: Record<ConversionMode, readonly string[]> = {
  video: ["mp4", "mkv", "mov", "webm", "flv", "ts", "avi", "m4v"],
  audio: ["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus"],
  image: ["png", "jpg", "webp", "bmp"],
};
export const formatsForMode = (mode: ConversionMode) => [...formats[mode]];
export const converterFormats = (mode: ConversionMode) =>
  mode === "audio" ? ["original", ...formats.audio] : formatsForMode(mode);
export function getModeForFormat(format: string): ConversionMode {
  const lower = format.toLowerCase();
  return lower === "original" || formats.audio.includes(lower)
    ? "audio"
    : formats.image.includes(lower)
      ? "image"
      : "video";
}
export function addDraftPaths(existing: string[], incoming: string[]) {
  const paths = [...existing];
  const seen = new Set(paths.map((p) => p.replace(/\//g, "\\").toLowerCase()));
  let duplicates = 0,
    excess = 0;
  for (const path of incoming) {
    const key = path.replace(/\//g, "\\").toLowerCase();
    if (!path.trim() || seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    if (paths.length >= 20) {
      excess++;
      continue;
    }
    paths.push(path);
  }
  return { paths, duplicates, excess };
}
export const filenameForPath = (path: string) =>
  path.split(/[/\\]/).pop() || path;
export const isLosslessFormat = (format: string) =>
  ["png", "bmp", "flac", "wav"].includes(format);

export interface ConversionSettings {
  maxEdge: number;
  audioBitrate: number;
  customDirectory: boolean;
  directory: string;
}
export const defaultConversionSettings: ConversionSettings = {
  maxEdge: 0,
  audioBitrate: 0,
  customDirectory: false,
  directory: "",
};

// Dimensions describe a 16:9 reference. The existing converter still preserves
// the source aspect ratio and only limits its longest edge, without upscaling.
export const videoSizePresets = [
  { name: "8K", width: 7680, height: 4320 },
  { name: "4K", width: 3840, height: 2160 },
  { name: "2K / 1440P", width: 2560, height: 1440 },
  { name: "1080P", width: 1920, height: 1080 },
  { name: "720P", width: 1280, height: 720 },
  { name: "480P", width: 854, height: 480 },
] as const;

export function videoResolutionLabel(maxEdge: number) {
  const preset = videoSizePresets.find((item) => item.width === maxEdge);
  return preset
    ? `${preset.name} (${preset.width} × ${preset.height})`
    : undefined;
}

export function videoSizeLimit(paths: string[], files: LocalFileCheck[]) {
  if (!paths.length) return undefined;
  const edges = paths.map((path) => {
    const file = files.find((item) => item.path === path);
    const video = file?.video;
    if (
      !file?.available ||
      !video ||
      !Number.isFinite(video.width) ||
      !Number.isFinite(video.height) ||
      video.width <= 0 ||
      video.height <= 0
    )
      return undefined;
    return Math.max(video.width, video.height);
  });
  return edges.some((edge) => edge === undefined)
    ? undefined
    : Math.min(...(edges as number[]));
}

export function canSelectVideoSize(size: number, limit: number | undefined) {
  return size === 0 || (limit !== undefined && size <= limit);
}

export function conversionOptions(
  mode: ConversionMode,
  format: string,
  settings: ConversionSettings,
): ConversionOptions {
  if (settings.customDirectory && !settings.directory.trim())
    throw Error("directory");
  return {
    version: 1,
    outputDir: settings.customDirectory ? settings.directory.trim() : undefined,
    maxEdge: mode === "audio" ? 0 : settings.maxEdge,
    audioBitrate:
      mode === "audio" &&
      format !== "original" &&
      bitratesForFormat(format).includes(settings.audioBitrate)
        ? settings.audioBitrate
        : 0,
  };
}

export function bitratesForFormat(format: string) {
  if (format === "original" || isLosslessFormat(format)) return [];
  const maximum = format === "ogg" ? 192 : format === "opus" ? 256 : 320;
  return [64, 96, 128, 192, 256, 320].filter((rate) => rate <= maximum);
}
