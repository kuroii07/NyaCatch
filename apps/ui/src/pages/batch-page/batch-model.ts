import {
  organizeOutput,
  defaultOrganization,
  type SaveOrganization,
} from "../../utils/save-organization";
import { extractShareLinks, validMediaLink } from "../../utils/share-links";
import {
  DownloadType,
  type DownloadTask,
  type CollectionSelection,
} from "@mediago/shared-common";
import type { MediaPreview } from "../../api/media";
import {
  cleanStem,
  outputExtension,
  selectionOptions,
  type OutputMode,
} from "../workbench-page/media-selection";

export type BatchMode = "auto" | "video" | "audio" | "cover";
export interface BatchSettings {
  saveDir: string;
  mode: BatchMode;
  audioFormat: "original" | "mp3";
  bitrate: 128 | 192 | 320;
}
export interface BatchItem {
  key: string;
  sourceUrl: string;
  preview: MediaPreview;
  index: number;
  total: number;
  selected: boolean;
  submitted: boolean;
  overrides: {
    mode?: BatchMode;
    qualityId?: string;
    audioFormat?: "original" | "mp3";
    bitrate?: 128 | 192 | 320;
    saveDir?: string;
  };
}
export interface BatchInput {
  collection?: CollectionSelection;
  url: string;
  valid: boolean;
}
export function parseBatchInput(input: string, limit = 20): BatchInput[] {
  const unique = [
    ...new Set(
      input.split(/\r?\n/).flatMap((line) => {
        const text = line.trim();
        if (!text) return [];
        const links = extractShareLinks(text);
        return links.length ? links : [text];
      }),
    ),
  ];
  if (unique.length > Math.min(limit, 200))
    throw new Error(
      `A batch may contain at most ${Math.min(limit, 200)} links`,
    );
  return unique.map((url) => ({ url, valid: validMediaLink(url) }));
}

export function resourcesForPreview(
  preview: MediaPreview,
  url: string,
): BatchItem[] {
  const resources = preview.resources?.length ? preview.resources : [preview];
  return resources.map((resource, index) => ({
    key: JSON.stringify([url, resource.resourceId || "", index]),
    sourceUrl: resource.collection ? resource.url : url,
    preview: resource,
    index,
    total: resources.length,
    selected: true,
    submitted: false,
    overrides: {},
  }));
}

export class BatchSelectionError extends Error {
  constructor(
    public readonly code: "directory" | "mode" | "limit",
    public readonly itemKey?: string,
    message?: string,
  ) {
    super(message || code);
  }
}

export function buildBatchTasks(
  items: BatchItem[],
  settings: BatchSettings,
  organization: SaveOrganization = defaultOrganization,
): Omit<DownloadTask, "id">[] {
  const selected = items.filter((item) => item.selected && !item.submitted);
  if (selected.length > 200)
    throw new BatchSelectionError(
      "limit",
      undefined,
      "A batch may contain at most 200 tasks",
    );
  return selected.map((item) => {
    const folder = (item.overrides.saveDir ?? settings.saveDir).trim();
    if (!folder)
      throw new BatchSelectionError(
        "directory",
        item.key,
        "A save directory is required",
      );
    const requested = item.overrides.mode ?? settings.mode;
    const mode: OutputMode =
      item.preview.kind === "image"
        ? "image"
        : requested === "auto"
          ? item.preview.kind
          : requested;
    let options;
    try {
      options = selectionOptions(
        item.preview,
        mode,
        item.overrides.qualityId || "",
        item.overrides.audioFormat ?? settings.audioFormat,
        item.overrides.bitrate ?? settings.bitrate,
      );
    } catch (reason) {
      throw new BatchSelectionError(
        "mode",
        item.key,
        reason instanceof Error ? reason.message : String(reason),
      );
    }
    const suffix =
      item.total > 1 ? "_" + String(item.index + 1).padStart(2, "0") : "";
    const extension = outputExtension(item.preview, options);
    const output = organizeOutput(
      folder,
      cleanStem(item.preview.title),
      item.preview,
      organization,
    );
    return {
      name:
        (item.preview.collection
          ? String(item.preview.collection.index).padStart(3, "0") + "_"
          : "") +
        output.stem +
        suffix +
        (extension ? "." + extension : ""),
      url: item.sourceUrl,
      thumbnail: item.preview.thumbnail,
      type: DownloadType.youtubeSingle,
      options: { ...options, saveDir: output.saveDir },
    };
  });
}
