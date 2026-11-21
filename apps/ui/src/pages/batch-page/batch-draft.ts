import { validMediaLink } from "../../utils/share-links";
import type { MediaPreview } from "../../api/media";
import type { BatchInput, BatchItem, BatchSettings } from "./batch-model";
import type { BatchStatus } from "./batch-runner";
import type { CollectionSelection } from "@mediago/shared-common";
export interface BatchRow extends BatchInput {
  status: BatchStatus;
  error?: string;
  preview?: MediaPreview;
  items: BatchItem[];
}
export interface BatchDraft {
  collectionSource?: string;
  version: 1;
  input: string;
  settings: BatchSettings;
  rows: BatchRow[];
  submission: "idle" | "unknown";
}
export const BATCH_DRAFT_KEY = "nyacatch-batch-draft-v1";
function safeCollection(
  value?: CollectionSelection,
): CollectionSelection | undefined {
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value.sourceUrl !== "string" ||
    value.sourceUrl.length > 8192 ||
    !validMediaLink(value.sourceUrl) ||
    typeof value.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(value.id) ||
    !Number.isInteger(value.index) ||
    value.index < 1 ||
    value.index > 100000 ||
    (value.cid !== undefined && !/^[0-9]{1,20}$/.test(value.cid)) ||
    (value.mediaId !== undefined && !/^[a-zA-Z0-9_-]{11}$/.test(value.mediaId))
  )
    throw Error("Invalid collection identity");
  return {
    sourceUrl: value.sourceUrl,
    id: value.id,
    cid: value.cid,
    mediaId: value.mediaId,
    index: value.index,
  };
}
function safePreview(p: MediaPreview): MediaPreview {
  if (
    !p ||
    typeof p.title !== "string" ||
    typeof p.url !== "string" ||
    !validMediaLink(p.url) ||
    typeof p.source !== "string" ||
    typeof p.extension !== "string" ||
    (p.uploader !== undefined && typeof p.uploader !== "string") ||
    !["image", "audio", "video"].includes(p.kind) ||
    !Array.isArray(p.formats)
  )
    throw Error("Invalid draft resource");
  // Persist display metadata and selection IDs only. Never save session capabilities or CDN addresses.
  return {
    url: p.url,
    title: p.title.slice(0, 512),
    kind: p.kind,
    extension: p.extension,
    duration: p.duration,
    source: p.source,
    uploader: p.uploader,
    hasAudio: p.hasAudio,
    resourceId: p.resourceId,
    resolver: p.resolver,
    collection: safeCollection(p.collection),
    formats: [],
  };
}
export function encodeBatchDraft(draft: BatchDraft) {
  if (
    (draft.collectionSource !== undefined &&
      draft.collectionSource !== "" &&
      (typeof draft.collectionSource !== "string" ||
        !validMediaLink(draft.collectionSource))) ||
    draft.input.length > 180000 ||
    draft.rows.length > (draft.collectionSource ? 200 : 20) ||
    draft.rows.reduce((n, row) => n + row.items.length, 0) > 400
  )
    throw Error("Draft limit exceeded");
  const clean: BatchDraft = {
    version: 1,
    collectionSource: draft.collectionSource || undefined,
    input: draft.input,
    settings: {
      saveDir: draft.settings.saveDir,
      mode: draft.settings.mode,
      audioFormat: draft.settings.audioFormat,
      bitrate: draft.settings.bitrate,
    },
    submission: draft.submission,
    rows: draft.rows.map((row) => ({
      url: row.url,
      collection: safeCollection(row.collection),
      valid: row.valid,
      status: row.status === "error" ? "error" : "canceled",
      error: row.error === "invalid-url" ? row.error : undefined,
      preview: row.preview ? safePreview(row.preview) : undefined,
      items: row.items.map((item) => ({
        key: item.key,
        sourceUrl: item.sourceUrl,
        preview: safePreview(item.preview),
        index: item.index,
        total: item.total,
        selected: item.selected,
        submitted: item.submitted,
        overrides: {
          mode: item.overrides.mode,
          qualityId: item.overrides.qualityId,
          audioFormat: item.overrides.audioFormat,
          bitrate: item.overrides.bitrate,
          saveDir: item.overrides.saveDir,
        },
      })),
    })),
  };
  const text = JSON.stringify(clean);
  if (text.length > 600000) throw Error("Draft storage limit exceeded");
  return text;
}
export function decodeBatchDraft(text: string | null): BatchDraft | null {
  if (!text) return null;
  if (text.length > 600000) throw Error("Draft storage limit exceeded");
  const value = JSON.parse(text) as BatchDraft;
  if (
    value.version !== 1 ||
    typeof value.input !== "string" ||
    !Array.isArray(value.rows) ||
    !value.settings ||
    typeof value.settings.saveDir !== "string" ||
    !["auto", "video", "audio", "cover"].includes(value.settings.mode) ||
    !["original", "mp3"].includes(value.settings.audioFormat) ||
    ![128, 192, 320].includes(value.settings.bitrate) ||
    !["idle", "unknown"].includes(value.submission)
  )
    throw Error("Invalid draft");
  for (const row of value.rows) {
    if (
      typeof row.url !== "string" ||
      typeof row.valid !== "boolean" ||
      !Array.isArray(row.items)
    )
      throw Error("Invalid draft row");
    for (const item of row.items)
      if (
        typeof item.key !== "string" ||
        typeof item.sourceUrl !== "string" ||
        typeof item.selected !== "boolean" ||
        typeof item.submitted !== "boolean" ||
        !item.overrides
      )
        throw Error("Invalid draft selection");
  }
  return JSON.parse(encodeBatchDraft(value));
}
export function restoreSelections(next: BatchItem[], previous: BatchItem[]) {
  if (!previous.length) return next;
  return next.map((item) => {
    const saved = previous.find(
      (old) =>
        (old.sourceUrl === item.sourceUrl ||
          (!!item.preview.collection &&
            old.preview.collection?.id === item.preview.collection.id)) &&
        (item.preview.resourceId
          ? old.preview.resourceId === item.preview.resourceId
          : old.key === item.key),
    );
    return saved
      ? {
          ...item,
          selected: saved.selected && !saved.submitted,
          submitted: saved.submitted,
          overrides: { ...saved.overrides },
        }
      : { ...item, selected: false };
  });
}
