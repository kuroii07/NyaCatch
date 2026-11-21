// Type definitions for database entities

export interface CompressionSubtitleStyle {
  fontFamily: "Microsoft YaHei" | "SimHei" | "SimSun" | "Arial";
  fontSize: number;
  color: string;
  outlineColor: string;
  outline: number;
  position: "top" | "middle" | "bottom";
}
export interface CompressionSubtitle {
  path: string;
  offsetMs: number;
  style?: CompressionSubtitleStyle;
  sourceHash?: string;
}
export interface ConversionOptions {
  mux?: {
    subtitlePath?: string;
    subtitleHash?: string;
    convertSubtitle?: boolean;
    audioPath?: string;
    sourceBytes?: number;
    sourceModifiedMs?: number;
    audioBytes?: number;
    audioModifiedMs?: number;
  };
  compress?: {
    encoder?: "cpu" | "nvenc";
    cq?: number;
    subtitle?: CompressionSubtitle;
    codec: "h264" | "hevc";
    crf: number;
    targetBytes?: number;
    preset: "fast" | "medium" | "slow";
    audio: "copy" | "aac";
    bitrate?: number;
    fps?: number;
    trial?: { startMs: number; endMs: number };
    sourceBytes?: number;
    sourceModifiedMs?: number;
    durationMs?: number;
  };
  capture?: {
    startMs: number;
    endMs?: number;
    fps?: number;
    loop?: boolean;
    name?: string;
  };
  trim?: { startMs: number; endMs: number; name?: string };
  merge?: { paths: string[]; name: string };
  version: 1;
  outputDir?: string;
  maxEdge?: number;
  audioBitrate?: number;
}

export interface Conversion {
  options?: ConversionOptions | null;
  id: number;
  name: string;
  path: string;
  status: string;
  outputPath: string;
  outputFormat: string;
  quality: string;
  progress: number;
  error?: string | null;
  createdDate?: Date;
  updatedDate?: Date;
}

export interface Favorite {
  id: number;
  title: string;
  url: string;
  icon?: string;
  createdDate: Date;
  updatedDate: Date;
}

export interface Video {
  id: number;
  name: string;
  type: string;
  url: string;
  folder?: string;
  headers?: string;
  isLive: boolean;
  status: string;
  log: string;
  createdDate: Date;
  updatedDate: Date;
}
