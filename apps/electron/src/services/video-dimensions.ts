import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { originalAudioExtension } from "@mediago/shared-common";

const execute = promisify(execFile);

export function parseVideoDimensions(text: string) {
  try {
    const value = JSON.parse(text) as {
      streams?: {
        width?: number;
        height?: number;
        disposition?: { attached_pic?: number };
        tags?: { rotate?: string };
        side_data_list?: { rotation?: number }[];
      }[];
    };
    if (!Array.isArray(value?.streams)) return undefined;
    const stream = value.streams.find(
      (item) =>
        item &&
        item.disposition?.attached_pic !== 1 &&
        Number.isSafeInteger(item.width) &&
        Number.isSafeInteger(item.height) &&
        (item.width || 0) > 0 &&
        (item.height || 0) > 0,
    );
    if (stream) {
      let rotation = Number(stream.tags?.rotate || 0);
      for (const side of stream.side_data_list || []) {
        if (typeof side.rotation === "number" && Number.isFinite(side.rotation))
          rotation = side.rotation;
      }
      const swapped = Math.abs(Math.round(rotation)) % 180 === 90;
      return swapped
        ? { width: stream.height!, height: stream.width! }
        : { width: stream.width!, height: stream.height! };
    }
  } catch {
    // Unrecognized media keeps only the original-size choice available.
  }
  return undefined;
}

export function parseMediaInspection(text: string) {
  try {
    const value = JSON.parse(text) as {
      format?: { duration?: string };
      streams?: {
        codec_type?: string;
        codec_name?: string;
        sample_rate?: string;
        channels?: number;
        duration?: string;
        color_transfer?: string;
        pix_fmt?: string;
        bits_per_raw_sample?: string;
        tags?: { DURATION?: string };
        disposition?: { attached_pic?: number };
      }[];
    };
    if (!Array.isArray(value?.streams)) return {};
    const seconds = Number(value.format?.duration);
    const fallback = Math.max(
      0,
      ...value.streams.map((stream) => {
        const value = Number(stream?.duration);
        return Number.isFinite(value) && value > 0 ? value : 0;
      }),
    );
    const duration =
      Number.isFinite(seconds) && seconds > 0 ? seconds : fallback;
    const track = value.streams.find(
      (stream) => stream?.codec_type === "audio",
    );
    const rate = Number(track?.sample_rate);
    const audio =
      track &&
      typeof track.codec_name === "string" &&
      Number.isSafeInteger(rate) &&
      rate > 0 &&
      Number.isSafeInteger(track.channels) &&
      (track.channels || 0) > 0
        ? {
            codec: track.codec_name,
            sampleRate: rate,
            channels: track.channels || 0,
            extension: originalAudioExtension(track.codec_name),
          }
        : undefined;
    const videoTrack = value.streams.find(
      (stream) =>
        stream?.codec_type === "video" &&
        stream.disposition?.attached_pic !== 1,
    );
    const dimensions = parseVideoDimensions(text);
    let videoDuration = Number(videoTrack?.duration);
    if (!Number.isFinite(videoDuration) || videoDuration <= 0) {
      const parts = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(
        videoTrack?.tags?.DURATION || "",
      );
      if (parts && Number(parts[2]) < 60 && Number(parts[3]) < 60)
        videoDuration =
          Number(parts[1]) * 3600 + Number(parts[2]) * 60 + Number(parts[3]);
    }
    const hdr =
      videoTrack?.color_transfer === "smpte2084" ||
      videoTrack?.color_transfer === "arib-std-b67";
    const depth =
      Number(videoTrack?.bits_per_raw_sample) ||
      Number(
        /p(9|10|12|14|16)|(?:rgb|bgr)48|f(32|64)/.exec(
          videoTrack?.pix_fmt || "",
        )?.[1],
      ) ||
      (/48|f32|f64/.test(videoTrack?.pix_fmt || "") ? 16 : 0);
    return {
      ...(audio ? { audio } : {}),
      video: dimensions
        ? {
            ...dimensions,
            ...(hdr ? { hdr: true } : {}),
            ...(depth > 8 ? { bitDepth: depth } : {}),
            ...(Number.isFinite(videoDuration) &&
            videoDuration > 0 &&
            Number.isSafeInteger(Math.round(videoDuration * 1000))
              ? { durationMs: Math.round(videoDuration * 1000) }
              : {}),
          }
        : undefined,
      media: {
        durationMs: Number.isSafeInteger(Math.round(duration * 1000))
          ? Math.round(duration * 1000)
          : 0,
        hasVideo: value.streams.some(
          (stream) =>
            stream?.codec_type === "video" &&
            stream.disposition?.attached_pic !== 1,
        ),
        hasAudio: value.streams.some(
          (stream) => stream?.codec_type === "audio",
        ),
      },
    };
  } catch {
    return {};
  }
}

export async function inspectLocalMedia(ffprobe: string, target: string) {
  try {
    const { stdout } = await execute(
      ffprobe,
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-show_entries",
        "format=duration:stream=width,height,codec_type,codec_name,sample_rate,channels,duration,color_transfer,pix_fmt,bits_per_raw_sample:stream_disposition=attached_pic:stream_tags=rotate,DURATION:stream_side_data=rotation",
        "-of",
        "json",
        target,
      ],
      {
        windowsHide: true,
        timeout: 8000,
        maxBuffer: 256 * 1024,
        encoding: "utf8",
      },
    );
    return parseMediaInspection(stdout);
  } catch {
    return {};
  }
}
