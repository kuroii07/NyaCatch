import type { Conversion, LocalFileCheck } from "@mediago/shared-common";
import type { CompressionEncoders } from "@/api/conversion";
import { validSubtitleMap, type SubtitleBinding } from "./subtitle-model";
import {
  addDraftPaths,
  canSelectVideoSize,
  videoSizeLimit,
} from "../converter-page/converter-model";
export const COMPRESS_WORKSPACE_KEY = "nyacatch-compress-workspace-v1";
export interface CompressionSettings {
  encoder?: "cpu" | "nvenc";
  cq?: number;
  rateMode?: "quality" | "size";
  targetMB?: number;
  codec: "h264" | "hevc";
  crf: number;
  preset: "fast" | "medium" | "slow";
  format: "mp4" | "mkv";
  maxEdge: number;
  fps: number;
  audio: "aac" | "copy";
  bitrate: number;
  customDirectory: boolean;
  directory: string;
}
export interface CompressionDraft {
  subtitles?: Record<string, SubtitleBinding>;
  version: 1;
  paths: string[];
  activePath: string;
  settings: CompressionSettings;
  trialSeconds: number;
  trialId: number;
  locked: boolean;
  recentIds: number[];
}
export const compressionCRFs = { h264: [18, 23, 28], hevc: [22, 28, 32] };
export const compressionCQs = [19, 23, 28];
export function compressionEncoderProblem(
  settings: CompressionSettings,
  status?: CompressionEncoders,
  checking = false,
) {
  if (settings.encoder !== "nvenc") return;
  if (settings.rateMode === "size") return "vpTargetCPUHint";
  if (checking) return "vpEncoderChecking";
  if (!status) return "vpEncoderCheckFailed";
  if (!status[settings.codec].available) return "vpEncoderUnavailable";
}
export function createCompressionDraft(): CompressionDraft {
  return {
    version: 1,
    paths: [],
    activePath: "",
    settings: {
      encoder: "cpu",
      cq: 23,
      rateMode: "quality",
      targetMB: 100,
      codec: "h264",
      crf: 23,
      preset: "medium",
      format: "mp4",
      maxEdge: 0,
      fps: 0,
      audio: "aac",
      bitrate: 192,
      customDirectory: false,
      directory: "",
    },
    trialSeconds: 10,
    trialId: 0,
    locked: false,
    recentIds: [],
  };
}
export function decodeCompressionDraft(raw: string | null): CompressionDraft {
  if (!raw) return createCompressionDraft();
  try {
    const v = JSON.parse(raw),
      s = v?.settings;
    if (
      !v ||
      v.version !== 1 ||
      !Array.isArray(v.paths) ||
      v.paths.length > 20 ||
      !v.paths.every(
        (p: unknown) =>
          typeof p === "string" && p.length > 0 && p.length <= 4096,
      ) ||
      new Set(v.paths.map((p: string) => p.replace(/\//g, "\\").toLowerCase()))
        .size !== v.paths.length ||
      typeof v.activePath !== "string" ||
      (v.paths.length
        ? !v.paths.includes(v.activePath)
        : v.activePath !== "") ||
      !s ||
      (s.encoder !== undefined && !["cpu", "nvenc"].includes(s.encoder)) ||
      (s.cq !== undefined &&
        (!Number.isInteger(s.cq) || s.cq < 1 || s.cq > 51)) ||
      (s.encoder === "nvenc" &&
        (s.rateMode === "size" || s.cq === undefined)) ||
      !validSubtitleMap(v.subtitles, v.paths) ||
      (s.rateMode !== undefined && !["quality", "size"].includes(s.rateMode)) ||
      (s.targetMB !== undefined &&
        (!Number.isInteger(s.targetMB) ||
          s.targetMB < 1 ||
          s.targetMB > 100000)) ||
      (s.rateMode === "size" &&
        (s.targetMB === undefined || s.audio !== "aac")) ||
      !["h264", "hevc"].includes(s.codec) ||
      !Number.isInteger(s.crf) ||
      s.crf < 0 ||
      s.crf > 51 ||
      !["fast", "medium", "slow"].includes(s.preset) ||
      !["mp4", "mkv"].includes(s.format) ||
      ![0, 854, 1280, 1920, 2560, 3840, 7680].includes(s.maxEdge) ||
      ![0, 24, 25, 30, 50, 60].includes(s.fps) ||
      !["aac", "copy"].includes(s.audio) ||
      ![64, 96, 128, 192, 256, 320].includes(s.bitrate) ||
      typeof s.customDirectory !== "boolean" ||
      typeof s.directory !== "string" ||
      s.directory.length > 4096 ||
      ![5, 10, 20, 30].includes(v.trialSeconds) ||
      !Number.isSafeInteger(v.trialId) ||
      v.trialId < 0 ||
      typeof v.locked !== "boolean" ||
      !Array.isArray(v.recentIds) ||
      v.recentIds.length > 20 ||
      !v.recentIds.every((id: number) => Number.isSafeInteger(id) && id > 0) ||
      new Set(v.recentIds).size !== v.recentIds.length
    )
      throw Error("invalid draft");
    return v;
  } catch {
    return { ...createCompressionDraft(), locked: true };
  }
}
export function appendCompressionPaths(
  draft: CompressionDraft,
  paths: string[],
) {
  if (draft.locked) return draft;
  const added = addDraftPaths(draft.paths, paths);
  return {
    ...draft,
    paths: added.paths,
    activePath: draft.activePath || added.paths[0] || "",
  };
}
export function removeCompressionSource(
  draft: CompressionDraft,
  path: string,
): CompressionDraft {
  if (draft.locked) return draft;
  const paths = draft.paths.filter((p) => p !== path);
  return {
    ...draft,
    paths,
    activePath: draft.activePath === path ? paths[0] || "" : draft.activePath,
    ...(draft.subtitles
      ? {
          subtitles: Object.fromEntries(
            Object.entries(draft.subtitles).filter(([key]) => key !== path),
          ),
        }
      : {}),
  };
}
export function compressionFileProblem(
  file: LocalFileCheck | undefined,
  settings: CompressionSettings,
): string | undefined {
  if (
    !file?.available ||
    !file.media?.hasVideo ||
    !file.video ||
    file.video.width < 2 ||
    file.video.height < 2 ||
    file.video.width > 8192 ||
    file.video.height > 8192 ||
    !Number.isFinite(file.media.durationMs) ||
    file.media.durationMs <= 0
  )
    return "vpInvalidFiles";
  if (file.video?.hdr || (file.video?.bitDepth || 0) > 8) return "vpHDR";
  if (settings.rateMode === "size") {
    if (settings.audio !== "aac") return "vpTargetAudio";
    if (
      compressionTargetBitrate(
        (settings.targetMB || 0) * 1000000,
        compressionDuration(file),
        file.media.hasAudio ? settings.bitrate : 0,
      ) === undefined
    )
      return "vpTargetBudget";
  }
  if (
    settings.audio === "copy" &&
    settings.format === "mp4" &&
    file.media.hasAudio &&
    !["aac", "mp3", "alac"].includes(file.audio?.codec || "")
  )
    return "vpAudioBlocked";
  if (
    !canSelectVideoSize(settings.maxEdge, videoSizeLimit([file.path], [file]))
  )
    return "c123SizeBlocked";
}
export function compressionDuration(file?: LocalFileCheck) {
  return file?.video?.durationMs || file?.media?.durationMs || 0;
}
export function compressionTargetBitrate(
  targetBytes: number,
  durationMs: number,
  audioKbps: number,
) {
  if (
    !Number.isSafeInteger(targetBytes) ||
    targetBytes < 1000000 ||
    targetBytes > 100000000000 ||
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0 ||
    !Number.isInteger(audioKbps) ||
    audioKbps < 0 ||
    audioKbps > 320
  )
    return;
  const reserve = Math.max(32768, Math.floor(targetBytes * 0.05));
  const rate =
    Math.floor(((targetBytes - reserve) * 8000) / durationMs) -
    audioKbps * 1000;
  return rate >= 64000 && rate <= 500000000 ? rate : undefined;
}
export function byteSize(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value < 0) return "—";
  return value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(2)} MiB`
    : value >= 1024
      ? `${(value / 1024).toFixed(1)} KiB`
      : `${value} B`;
}
export function compressionSizeResult(row: Conversion, outputSize?: number) {
  const options = row.options?.compress;
  if (!options || outputSize === undefined) return;
  if (options.trial) {
    const seconds = options.trial.endMs - options.trial.startMs;
    return {
      trial: true as const,
      output: outputSize,
      estimated:
        (options.durationMs || 0) > 0
          ? Math.round((outputSize * (options.durationMs || 0)) / seconds)
          : undefined,
    };
  }
  const source = options.sourceBytes || 0;
  return {
    trial: false as const,
    output: outputSize,
    source,
    percent:
      source > 0
        ? Math.round((1 - outputSize / source) * 1000) / 10
        : undefined,
  };
}
