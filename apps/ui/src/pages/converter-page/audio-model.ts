import type { LocalFileCheck } from "@mediago/shared-common";

export function audioInputIssue(
  file: LocalFileCheck | undefined,
  original: boolean,
) {
  if (!file?.available) return "c11Missing";
  if (
    !file.media?.hasAudio ||
    !file.audio ||
    !Number.isFinite(file.media.durationMs) ||
    file.media.durationMs <= 0
  )
    return "axNoAudio";
  if (original && !file.audio.extension) return "axUnsupported";
}

export function audioInputSummary(file: LocalFileCheck | undefined) {
  return file?.audio
    ? `${file.audio.codec.toUpperCase()} · ${file.audio.sampleRate} Hz · ${file.audio.channels} ch`
    : "";
}
