import {
  formatsForMode,
  type ConversionQuality,
} from "../converter-page/converter-model";

export const TRIM_WORKSPACE_KEY = "nyacatch-trim-workspace-v1";
export const MAX_TRIM_SEGMENTS = 20;
export interface TrimSegment {
  id: string;
  name: string;
  start: string;
  end: string;
}
export interface TrimWorkspace {
  version: 1;
  path: string;
  start: string;
  end: string;
  format: string;
  quality: ConversionQuality;
  directory: string;
  customDirectory: boolean;
  locked: boolean;
  segments: TrimSegment[];
  activeId: string;
  recentIds: number[];
}
export const trimFormats = [
  ...formatsForMode("video"),
  ...formatsForMode("audio"),
];
export const createTrimWorkspace = (): TrimWorkspace => ({
  version: 1,
  path: "",
  start: "00:00:00.000",
  end: "",
  format: "mp4",
  quality: "medium",
  directory: "",
  customDirectory: false,
  locked: false,
  segments: [{ id: "clip-1", name: "", start: "00:00:00.000", end: "" }],
  activeId: "clip-1",
  recentIds: [],
});

export function validTrimName(name: string) {
  return (
    name === "" ||
    (Array.from(name).length <= 80 &&
      name.trim() === name &&
      !name.endsWith(".") &&
      !/[<>:"/\\|?*]/.test(name) &&
      !Array.from(name).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) &&
      !/^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)(\.|$)/i.test(
        name,
      ))
  );
}

export function resetTrimSource(
  draft: TrimWorkspace,
  path: string,
): TrimWorkspace {
  const initial = createTrimWorkspace();
  return {
    ...draft,
    path,
    start: initial.start,
    end: initial.end,
    segments: initial.segments,
    activeId: initial.activeId,
  };
}

// start/end remain the active editor fields so existing v1 drafts can be recovered.
export function updateTrimDraft(
  draft: TrimWorkspace,
  patch: Partial<TrimWorkspace> & { name?: string },
): TrimWorkspace {
  const { name, ...fields } = patch;
  const base =
    fields.path !== undefined ? resetTrimSource(draft, fields.path) : draft;
  const next = { ...base, ...fields };
  next.segments = next.segments.map((segment) =>
    segment.id === next.activeId
      ? {
          ...segment,
          start: next.start,
          end: next.end,
          ...(name !== undefined ? { name } : {}),
        }
      : segment,
  );
  return next;
}

export function selectTrimSegment(
  draft: TrimWorkspace,
  id: string,
): TrimWorkspace {
  const segment = draft.segments.find((item) => item.id === id);
  return segment
    ? { ...draft, activeId: id, start: segment.start, end: segment.end }
    : draft;
}

export function addTrimSegment(
  draft: TrimWorkspace,
  durationMs: number,
): TrimWorkspace {
  if (draft.segments.length >= MAX_TRIM_SEGMENTS || durationMs < 1)
    return draft;
  let n = 1;
  while (draft.segments.some((item) => item.id === `clip-${n}`)) n++;
  const end = parseTrimTime(draft.end) || 0;
  const segment = {
    id: `clip-${n}`,
    name: "",
    start: formatTrimTime(end < durationMs ? end : 0),
    end: formatTrimTime(durationMs),
  };
  return selectTrimSegment(
    { ...draft, segments: [...draft.segments, segment] },
    segment.id,
  );
}

export function removeTrimSegment(
  draft: TrimWorkspace,
  id: string,
): TrimWorkspace {
  if (draft.segments.length === 1) return draft;
  const segments = draft.segments.filter((item) => item.id !== id);
  return selectTrimSegment(
    { ...draft, segments },
    id === draft.activeId ? segments[0].id : draft.activeId,
  );
}

export function confirmTrimCreation(
  draft: TrimWorkspace,
  segmentId: string,
  taskId: number,
): TrimWorkspace {
  const recentIds = [...new Set([...draft.recentIds, taskId])].slice(
    -MAX_TRIM_SEGMENTS,
  );
  const segments = draft.segments.filter((item) => item.id !== segmentId);
  return segments.length
    ? selectTrimSegment(
        { ...draft, segments, recentIds },
        segments.some((item) => item.id === draft.activeId)
          ? draft.activeId
          : segments[0].id,
      )
    : { ...resetTrimSource(draft, ""), recentIds };
}
export function parseTrimTime(value: string) {
  if (
    value.length > 32 ||
    !/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(value.trim())
  )
    return undefined;
  const parts = value.trim().split(":");
  const last = parts.pop();
  if (last === undefined) return undefined;
  const [whole, fraction = ""] = last.split(".");
  const seconds = Number(whole);
  if (parts.length && seconds >= 60) return undefined;
  if (parts.length === 2 && Number(parts[1]) >= 60) return undefined;
  const ms =
    ((parts.length === 2
      ? Number(parts[0]) * 3600 + Number(parts[1]) * 60
      : parts.length === 1
        ? Number(parts[0]) * 60
        : 0) +
      seconds) *
      1000 +
    Number(fraction.padEnd(3, "0"));
  return Number.isSafeInteger(ms) && ms >= 0 ? ms : undefined;
}
export function formatTrimTime(ms: number) {
  const value = Math.max(0, Math.round(ms));
  return `${String(Math.floor(value / 3600000)).padStart(2, "0")}:${String(Math.floor(value / 60000) % 60).padStart(2, "0")}:${String(Math.floor(value / 1000) % 60).padStart(2, "0")}.${String(value % 1000).padStart(3, "0")}`;
}
export function trimRangeError(start: string, end: string, durationMs: number) {
  const from = parseTrimTime(start),
    to = parseTrimTime(end);
  if (from === undefined || to === undefined) return "trInvalidTime";
  if (to <= from) return "trInvalidRange";
  if (!Number.isFinite(durationMs) || durationMs <= 0 || to > durationMs)
    return "trExceeds";
  return undefined;
}

export function markTrimPoint(
  kind: "in" | "out",
  position: number,
  start: number,
  end: number,
  duration: number,
) {
  const limit = Math.max(1, Math.round(duration));
  const point = Math.max(0, Math.min(limit, Math.round(position)));
  if (kind === "in") {
    const from = Math.min(point, limit - 1);
    return {
      start: formatTrimTime(from),
      end: formatTrimTime(Math.max(from + 1, Math.min(limit, end))),
    };
  }
  const to = Math.max(1, point);
  return {
    start: formatTrimTime(Math.max(0, Math.min(start, to - 1))),
    end: formatTrimTime(to),
  };
}
export function decodeTrimWorkspace(text: string | null): TrimWorkspace {
  if (!text) return createTrimWorkspace();
  if (text.length > 80000) throw Error("Invalid trim draft");
  const value = JSON.parse(text) as TrimWorkspace;
  if (
    value?.version !== 1 ||
    typeof value.path !== "string" ||
    value.path.length > 32768 ||
    value.path.includes("\0") ||
    typeof value.start !== "string" ||
    value.start.length > 32 ||
    typeof value.end !== "string" ||
    value.end.length > 32 ||
    !trimFormats.includes(value.format) ||
    !["high", "medium", "low"].includes(value.quality) ||
    typeof value.directory !== "string" ||
    value.directory.length > 32768 ||
    value.directory.includes("\0") ||
    typeof value.customDirectory !== "boolean" ||
    typeof value.locked !== "boolean"
  )
    throw Error("Invalid trim draft");
  const segments = value.segments ?? [
    { id: "clip-1", name: "", start: value.start, end: value.end },
  ];
  if (
    !Array.isArray(segments) ||
    !segments.length ||
    segments.length > MAX_TRIM_SEGMENTS ||
    segments.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        !/^[\w-]{1,80}$/.test(item.id) ||
        typeof item.name !== "string" ||
        item.name.length > 160 ||
        typeof item.start !== "string" ||
        item.start.length > 32 ||
        typeof item.end !== "string" ||
        item.end.length > 32,
    ) ||
    new Set(segments.map((item) => item.id)).size !== segments.length
  )
    throw Error("Invalid trim segments");
  const activeId = value.activeId ?? segments[0].id;
  if (!segments.some((item) => item.id === activeId))
    throw Error("Invalid active segment");
  const recentIds = value.recentIds ?? [];
  if (
    !Array.isArray(recentIds) ||
    recentIds.length > MAX_TRIM_SEGMENTS ||
    recentIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(recentIds).size !== recentIds.length
  )
    throw Error("Invalid recent trim tasks");
  return updateTrimDraft({ ...value, segments, activeId, recentIds }, {});
}
