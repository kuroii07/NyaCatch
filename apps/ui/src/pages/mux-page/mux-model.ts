import { addDraftPaths } from "../converter-page/converter-model";
import type { MuxInspection } from "@/api/conversion";
export const MUX_WORKSPACE_KEY = "nyacatch-mux-workspace-v1";
export const muxFormats = ["mp4", "mkv", "mov", "ts"] as const;
export interface MuxDraft {
  version: 1;
  mode: "remux" | "combine";
  paths: string[];
  activePath: string;
  audioPath: string;
  subtitlePath?: string;
  subtitleHash?: string;
  convertSubtitle?: boolean;
  format: (typeof muxFormats)[number];
  customDirectory: boolean;
  directory: string;
  locked: boolean;
  recentIds: number[];
}
export function createMuxDraft(): MuxDraft {
  return {
    version: 1,
    mode: "remux",
    paths: [],
    activePath: "",
    audioPath: "",
    subtitlePath: "",
    subtitleHash: "",
    convertSubtitle: false,
    format: "mp4",
    customDirectory: false,
    directory: "",
    locked: false,
    recentIds: [],
  };
}
export function decodeMuxDraft(raw: string | null): MuxDraft {
  if (!raw) return createMuxDraft();
  try {
    const d = JSON.parse(raw);
    if (
      !d ||
      d.version !== 1 ||
      !["remux", "combine"].includes(d.mode) ||
      !Array.isArray(d.paths) ||
      d.paths.length > 20 ||
      !d.paths.every(
        (p: unknown) =>
          typeof p === "string" && p.length > 0 && p.length <= 4096,
      ) ||
      new Set(d.paths.map((p: string) => p.replace(/\//g, "\\").toLowerCase()))
        .size !== d.paths.length ||
      typeof d.activePath !== "string" ||
      (d.paths.length
        ? !d.paths.includes(d.activePath)
        : d.activePath !== "") ||
      typeof d.audioPath !== "string" ||
      d.audioPath.length > 4096 ||
      (d.subtitlePath !== undefined &&
        (typeof d.subtitlePath !== "string" || d.subtitlePath.length > 4096)) ||
      (d.subtitleHash !== undefined &&
        (typeof d.subtitleHash !== "string" ||
          (d.subtitleHash !== "" && !/^[a-f0-9]{64}$/.test(d.subtitleHash)))) ||
      (d.convertSubtitle !== undefined &&
        typeof d.convertSubtitle !== "boolean") ||
      (!!d.subtitlePath &&
        (!/\.(srt|ass)$/i.test(d.subtitlePath) || !d.subtitleHash)) ||
      (!d.subtitlePath && (!!d.subtitleHash || d.convertSubtitle === true)) ||
      !muxFormats.includes(d.format) ||
      typeof d.customDirectory !== "boolean" ||
      typeof d.directory !== "string" ||
      d.directory.length > 4096 ||
      typeof d.locked !== "boolean" ||
      !Array.isArray(d.recentIds) ||
      d.recentIds.length > 20 ||
      !d.recentIds.every((v: number) => Number.isSafeInteger(v) && v > 0) ||
      new Set(d.recentIds).size !== d.recentIds.length
    )
      throw Error("invalid mux draft");
    return d;
  } catch {
    return { ...createMuxDraft(), locked: true };
  }
}
export function addMuxPaths(d: MuxDraft, paths: string[]): MuxDraft {
  if (d.locked) return d;
  const added = addDraftPaths(d.paths, paths);
  return {
    ...d,
    paths: added.paths,
    activePath: d.activePath || added.paths[0] || "",
  };
}
export function removeMuxPath(d: MuxDraft, path: string): MuxDraft {
  if (d.locked) return d;
  const paths = d.paths.filter((p) => p !== path);
  return {
    ...d,
    paths,
    activePath: d.activePath === path ? paths[0] || "" : d.activePath,
  };
}
export function muxProblem(
  d: MuxDraft,
  checks: Record<string, MuxInspection>,
  failed: Record<string, boolean>,
  reading: boolean,
): string | undefined {
  if (d.locked) return "mxUnknown";
  if (reading) return "c11Checking";
  if (!d.paths.length) return "mxNeedVideo";
  if (
    d.mode === "combine" &&
    (d.paths.length !== 1 || (!d.audioPath && !d.subtitlePath))
  )
    return "mxNeedPair";
  if (d.customDirectory && !d.directory.trim()) return "c09NeedFolder";
  for (const p of d.paths) {
    if (failed[p]) return "mxReadFailed";
    const c = checks[p];
    if (!c) return "c11Checking";
    const f = c.formats.find((v) => v.format === d.format);
    if (!f?.available) return f?.reason || "mxReadFailed";
  }
}
export async function inspectMuxPaths(
  paths: string[],
  audioPath: string,
  read: (path: string, audioPath: string) => Promise<MuxInspection>,
) {
  const values: Record<string, MuxInspection> = {},
    errors: Record<string, boolean> = {};
  let index = 0;
  // Two readers bound FFprobe work even for a full twenty-file batch.
  await Promise.all(
    [0, 1].map(async () => {
      while (index < paths.length) {
        const p = paths[index++];
        try {
          values[p] = await read(p, audioPath);
        } catch {
          errors[p] = true;
        }
      }
    }),
  );
  return { values, errors };
}
