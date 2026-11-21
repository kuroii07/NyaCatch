import type { MediaOptions } from "@mediago/shared-common";
import type { MediaFormat, MediaPreview } from "../../api/media";

export type OutputMode = "video" | "audio" | "cover" | "image";

function codecRank(format: MediaFormat) {
  return /^(avc|h264)/i.test(format.videoCodec)
    ? 3
    : /^(hev|hvc|h265)/i.test(format.videoCodec)
      ? 2
      : 1;
}

export function videoChoices(preview: MediaPreview): MediaFormat[] {
  const groups = new Map<string, MediaFormat>();
  // A codec preference must not displace the only format that can retain sound.
  const rank = (format: MediaFormat) =>
    codecRank(format) +
    (!preview.hasAudio ||
    (format.audioCodec && format.audioCodec !== "none") ||
    audioChoice(preview, format.extension)
      ? 10
      : 0);
  for (const format of preview.formats || []) {
    if (format.audioOnly || !format.videoCodec || format.videoCodec === "none")
      continue;
    const key = `${format.height}-${format.fps}`;
    const previous = groups.get(key);
    if (!previous || rank(format) > rank(previous)) groups.set(key, format);
  }
  return [...groups.values()].sort(
    (a, b) => b.height - a.height || b.fps - a.fps,
  );
}

export function audioChoice(preview: MediaPreview, extension = "mp4") {
  const tracks = (preview.formats || []).filter((format) => format.audioOnly);
  const preferred =
    extension === "webm" ? ["webm", "opus"] : ["m4a", "aac", "mp4"];
  return tracks.sort(
    (a, b) =>
      Number(preferred.includes(b.extension)) -
        Number(preferred.includes(a.extension)) || b.filesize - a.filesize,
  )[0];
}

export function selectionOptions(
  preview: MediaPreview,
  mode: OutputMode,
  qualityId: string,
  audioFormat: "original" | "mp3",
  bitrate: 128 | 192 | 320,
): MediaOptions {
  const options: MediaOptions = {
    ...(preview.collection ? { collection: preview.collection } : {}),
    version: 1,
    mode,
    source: preview.source,
    ...(preview.resourceId ? { resourceId: preview.resourceId } : {}),
    ...(preview.resolver ? { resolver: preview.resolver } : {}),
  };
  if (mode === "image") {
    if (preview.kind !== "image" || !preview.resourceId)
      throw new Error("No original image available");
    return options;
  }
  if (mode === "cover") {
    if (!preview.thumbnail) throw new Error("No cover available");
    return options;
  }
  if (mode === "audio") {
    if (!preview.hasAudio) throw new Error("No audio available");
    return {
      ...options,
      audioFormat,
      audioBitrate: audioFormat === "mp3" ? bitrate : undefined,
      audioFormatId: audioChoice(preview)?.id,
    };
  }
  if (preview.kind !== "video") throw new Error("No video available");
  const choices = videoChoices(preview);
  const video = qualityId
    ? choices.find((format) => format.id === qualityId)
    : choices[0];
  if (qualityId && !video)
    throw new Error("Selected format is no longer available");
  if (!video) return options;
  const audio =
    video.audioCodec === "none" || !video.audioCodec
      ? audioChoice(preview, video.extension)
      : undefined;
  if (
    preview.hasAudio &&
    (!video.audioCodec || video.audioCodec === "none") &&
    !audio
  ) {
    throw new Error("No matching audio track available");
  }
  return {
    ...options,
    formatId: video.id,
    audioFormatId: audio?.id,
    container:
      video.extension === "webm"
        ? audio && !["webm", "opus"].includes(audio.extension)
          ? "mkv"
          : "webm"
        : video.extension === "mp4"
          ? "mp4"
          : undefined,
  };
}

export function outputExtension(
  preview: MediaPreview,
  options: MediaOptions,
): string {
  if (options.mode === "image") return preview.extension;
  if (options.mode === "cover") {
    try {
      return (
        new URL(preview.thumbnail || "").pathname
          .match(/\.([a-z0-9]{2,5})$/i)?.[1]
          ?.toLowerCase() || ""
      );
    } catch {
      return "";
    }
  }
  if (options.mode === "audio") {
    if (options.audioFormat === "mp3") return "mp3";
    const audio = audioChoice(preview);
    const ext = audio?.extension || preview.extension;
    return ext === "webm" ? "opus" : ext === "mp4" ? "m4a" : ext;
  }
  return options.container || preview.extension;
}

export function cleanStem(value: string): string {
  let name = value
    .trim()
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, "_")
    .replace(/^[. ]+|[. ]+$/g, "");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = "_" + name;
  return name || "media";
}

export function formatBytes(bytes: number) {
  if (!bytes || bytes < 0) return "";
  const unit = bytes >= 1024 ** 3 ? "GiB" : "MiB";
  return `${(bytes / (unit === "GiB" ? 1024 ** 3 : 1024 ** 2)).toFixed(1)} ${unit}`;
}
