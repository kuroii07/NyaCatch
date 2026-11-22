import { http } from "@/utils";
import type { CollectionSelection } from "@mediago/shared-common";
import {
  readMediaParseStream,
  type MediaParseStage,
} from "../utils/media-parse";

export interface MediaPreview {
  collection?: CollectionSelection;
  url: string;
  title: string;
  kind: "video" | "audio" | "image";
  extension: string;
  thumbnail?: string;
  previewUrl?: string;
  duration: number;
  source: string;
  resolver?:
    | "x-public"
    | "instagram-public"
    | "xiaohongshu-public"
    | "douyin-browser";
  resourceId?: string;
  resources?: MediaResource[];
  displayThumbnail?: string;
  previewSession?: string;
  uploader?: string;
  hasAudio: boolean;
  formats: MediaFormat[];
}

export interface MediaResource extends MediaPreview {
  resourceId: string;
}

export interface MediaFormat {
  id: string;
  extension: string;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  filesize: number;
  approximate: boolean;
  audioOnly: boolean;
}

export const resolveMedia = async (
  url: string,
  signal: AbortSignal,
  collection?: CollectionSelection,
  onStage?: (stage: MediaParseStage) => void,
): Promise<MediaPreview> => {
  const response = await http.post<
    never,
    MediaPreview | ReadableStream<Uint8Array>
  >(
    "/api/media/preview",
    { url, collection },
    {
      signal,
      timeout: 65000,
      ...(onStage
        ? {
            adapter: "fetch",
            responseType: "stream",
            headers: { Accept: "application/x-ndjson" },
          }
        : {}),
    },
  );
  let received: MediaPreview | undefined;
  let result: MediaPreview;
  try {
    result = onStage
      ? await readMediaParseStream<MediaPreview>(
          response as ReadableStream<Uint8Array>,
          onStage,
          (value) => {
            received = value;
          },
        )
      : (response as MediaPreview);
  } catch (reason) {
    if (received?.previewSession)
      void removeMediaPlayback(received.previewSession).catch(() => {});
    throw reason;
  }
  const base = http.defaults.baseURL || window.location.origin;
  for (const item of [result, ...(result.resources || [])]) {
    if (item.displayThumbnail)
      item.displayThumbnail = new URL(item.displayThumbnail, base).href;
  }
  return result;
};

export interface CollectionEntry {
  id: string;
  url: string;
  title: string;
  index: number;
  duration: number;
  available: boolean;
  selection: CollectionSelection;
}
export interface MediaCollection {
  url: string;
  title: string;
  source: string;
  kind: string;
  entries: CollectionEntry[];
  total: number;
  page: number;
  hasMore: boolean;
}
export const resolveCollection = (
  url: string,
  page: number,
  signal: AbortSignal,
): Promise<MediaCollection | null> =>
  http.post("/api/media/collection", { url, page }, { signal, timeout: 55000 });

export interface MediaPlayback {
  id: string;
  video?: string;
  audio?: string;
}

export async function createMediaPlayback(
  url: string,
  mode: "video" | "audio",
  signal: AbortSignal,
  resolver?:
    | "x-public"
    | "instagram-public"
    | "xiaohongshu-public"
    | "douyin-browser",
  resourceId?: string,
): Promise<MediaPlayback> {
  const result: MediaPlayback = await http.post(
    "/api/media/playback",
    { url, mode, resolver, resourceId },
    { signal, timeout: 65000 },
  );
  const base = http.defaults.baseURL || window.location.origin;
  return {
    ...result,
    video: result.video ? new URL(result.video, base).href : undefined,
    audio: result.audio ? new URL(result.audio, base).href : undefined,
  };
}

export const removeMediaPlayback = (id: string) =>
  http.delete(`/api/media/playback/${encodeURIComponent(id)}`);
