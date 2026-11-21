import type { LocalFileCheck } from "@mediago/shared-common";
import { validTrimName } from "../trim-page/trim-model";

export const MERGE_WORKSPACE_KEY = "nyacatch-merge-workspace-v1";
export const MERGE_LIMIT = 20;
export const mergeFormats = {
  video: ["mp4", "mkv"],
  audio: ["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus"],
};
export interface MergeDraft {
  version: 1;
  items: { id: string; path: string }[];
  activeId: string;
  name: string;
  format: string;
  quality: "high" | "medium" | "low";
  customDirectory: boolean;
  directory: string;
  locked: boolean;
  recentIds: number[];
}
export function createMergeDraft(): MergeDraft {
  return {
    version: 1,
    items: [],
    activeId: "",
    name: "",
    format: "mp4",
    quality: "medium",
    customDirectory: false,
    directory: "",
    locked: false,
    recentIds: [],
  };
}
export function decodeMergeDraft(raw: string | null): MergeDraft {
  if (!raw) return createMergeDraft();
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      value.version !== 1 ||
      !Array.isArray(value.items) ||
      value.items.length > MERGE_LIMIT ||
      !value.items.every(
        (item: { id?: unknown; path?: unknown }) =>
          item &&
          typeof item.id === "string" &&
          item.id.length > 0 &&
          item.id.length <= 100 &&
          typeof item.path === "string" &&
          item.path.length > 0 &&
          item.path.length <= 4096,
      ) ||
      new Set(value.items.map((item: { id: string }) => item.id)).size !==
        value.items.length ||
      typeof value.activeId !== "string" ||
      (value.items.length > 0
        ? !value.items.some(
            (item: { id: string }) => item.id === value.activeId,
          )
        : value.activeId !== "") ||
      typeof value.name !== "string" ||
      value.name.length > 200 ||
      typeof value.directory !== "string" ||
      value.directory.length > 4096 ||
      typeof value.locked !== "boolean" ||
      typeof value.customDirectory !== "boolean" ||
      ![...mergeFormats.video, ...mergeFormats.audio].includes(value.format) ||
      !["high", "medium", "low"].includes(value.quality) ||
      !Array.isArray(value.recentIds) ||
      value.recentIds.length > 1 ||
      !value.recentIds.every((id: number) => Number.isSafeInteger(id) && id > 0)
    )
      throw Error("invalid draft");
    return value;
  } catch {
    // Corrupt recovery data must never silently permit a repeated submission.
    return { ...createMergeDraft(), locked: true };
  }
}
export function mergeMode(
  files: LocalFileCheck[],
): "video" | "audio" | undefined {
  if (
    !files.length ||
    files.some(
      (file) =>
        !file.available ||
        !file.media ||
        !Number.isFinite(file.media.durationMs) ||
        file.media.durationMs <= 0,
    )
  )
    return;
  if (files.every((file) => file.media?.hasVideo)) return "video";
  if (files.every((file) => !file.media?.hasVideo && file.media?.hasAudio))
    return "audio";
}
export function appendMergeItems(
  draft: MergeDraft,
  paths: string[],
): MergeDraft {
  if (
    draft.locked ||
    draft.items.length + paths.length > MERGE_LIMIT ||
    paths.some((path) => !path || path.length > 4096)
  )
    return draft;
  const items = [
    ...draft.items,
    ...paths.map((path) => ({ id: crypto.randomUUID(), path })),
  ];
  return { ...draft, items, activeId: draft.activeId || items[0]?.id || "" };
}
export function moveMergeItem(
  draft: MergeDraft,
  id: string,
  target: number,
): MergeDraft {
  if (draft.locked || target < 0 || target >= draft.items.length) return draft;
  const items = [...draft.items],
    index = items.findIndex((item) => item.id === id);
  if (index < 0 || index === target) return draft;
  const [item] = items.splice(index, 1);
  items.splice(target, 0, item);
  return { ...draft, items };
}
export function removeMergeItem(draft: MergeDraft, id: string): MergeDraft {
  if (draft.locked) return draft;
  const index = draft.items.findIndex((item) => item.id === id),
    items = draft.items.filter((item) => item.id !== id);
  return {
    ...draft,
    items,
    activeId:
      draft.activeId === id
        ? items[Math.min(index, items.length - 1)]?.id || ""
        : draft.activeId,
  };
}
export function validMergeName(name: string) {
  return name.trim().length > 0 && validTrimName(name.trim());
}
