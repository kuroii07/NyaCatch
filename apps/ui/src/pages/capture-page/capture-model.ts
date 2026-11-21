import type { LocalFileCheck } from "@mediago/shared-common";
import { parseTrimTime, validTrimName } from "../trim-page/trim-model";

export const CAPTURE_WORKSPACE_KEY = "nyacatch-capture-workspace-v1";
export const captureFrameRates = [6, 10, 12, 24, 0] as const;
export const captureSizes = [240, 320, 480, 640, 720, 960] as const;
const legacySizes = [160, 360];
export function captureSizeLabel(
  edge: number,
  video?: { width: number; height: number },
) {
  const width = video?.width || 16,
    height = video?.height || 9;
  const scale = edge / Math.max(width, height);
  return `${Math.max(1, Math.round(width * scale))} × ${Math.max(1, Math.round(height * scale))}`;
}
export interface CaptureDraft {
  version: 1;
  path: string;
  mode: "frame" | "gif";
  format: "png" | "jpg" | "webp";
  quality: "high" | "medium" | "low";
  start: string;
  end: string;
  maxEdge: number;
  fps: number;
  loop: boolean;
  name: string;
  customDirectory: boolean;
  directory: string;
  locked: boolean;
  recentIds: number[];
}
export function createCaptureDraft(): CaptureDraft {
  return {
    version: 1,
    path: "",
    mode: "frame",
    format: "png",
    quality: "high",
    start: "00:00:00.000",
    end: "00:00:03.000",
    maxEdge: 480,
    fps: 10,
    loop: true,
    name: "",
    customDirectory: false,
    directory: "",
    locked: false,
    recentIds: [],
  };
}
export function decodeCaptureDraft(raw: string | null): CaptureDraft {
  if (!raw) return createCaptureDraft();
  try {
    const v = JSON.parse(raw);
    if (
      !v ||
      v.version !== 1 ||
      typeof v.path !== "string" ||
      v.path.length > 4096 ||
      !["frame", "gif"].includes(v.mode) ||
      !["png", "jpg", "webp"].includes(v.format) ||
      !["high", "medium", "low"].includes(v.quality) ||
      typeof v.start !== "string" ||
      v.start.length > 32 ||
      typeof v.end !== "string" ||
      v.end.length > 32 ||
      ![0, ...captureSizes, ...legacySizes].includes(v.maxEdge) ||
      ![...captureFrameRates, 5, 15].includes(v.fps) ||
      typeof v.loop !== "boolean" ||
      typeof v.name !== "string" ||
      v.name.length > 200 ||
      typeof v.customDirectory !== "boolean" ||
      typeof v.directory !== "string" ||
      v.directory.length > 4096 ||
      typeof v.locked !== "boolean" ||
      !Array.isArray(v.recentIds) ||
      v.recentIds.length > 1 ||
      !v.recentIds.every((id: number) => Number.isSafeInteger(id) && id > 0)
    )
      throw Error("invalid draft");
    // Uncertain submissions must retain the exact options being reviewed.
    // Only ordinary legacy drafts adopt new rate choices; their size is retained.
    return v.locked
      ? v
      : { ...v, fps: v.fps === 5 ? 6 : v.fps === 15 ? 12 : v.fps };
  } catch {
    // A corrupt acknowledgement must not silently permit repeat submission.
    return { ...createCaptureDraft(), locked: true };
  }
}
export function captureVideo(file?: LocalFileCheck) {
  return !!(
    file?.available &&
    file.media?.hasVideo &&
    Number.isFinite(file.media.durationMs) &&
    file.media.durationMs > 0
  );
}
export function captureRange(
  draft: CaptureDraft,
  duration: number,
  position: number,
) {
  if (!Number.isFinite(duration) || duration <= 0) return;
  const startMs =
    draft.mode === "frame" ? Math.round(position) : parseTrimTime(draft.start);
  const endMs = parseTrimTime(draft.end);
  if (
    startMs === undefined ||
    !Number.isSafeInteger(startMs) ||
    startMs < 0 ||
    startMs >= duration ||
    !validTrimName(draft.name.trim())
  )
    return;
  if (draft.mode === "frame")
    return { startMs, name: draft.name.trim() || undefined };
  if (
    endMs === undefined ||
    endMs > duration ||
    endMs <= startMs ||
    endMs - startMs > 30000
  )
    return;
  return {
    startMs,
    endMs,
    fps: draft.fps,
    loop: draft.loop,
    name: draft.name.trim() || undefined,
  };
}
