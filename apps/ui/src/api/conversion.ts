import { http } from "@/utils";
import type {
  Conversion,
  ConversionOptions,
  ConversionPagination,
  ConversionResponse,
  CompressionSubtitle,
} from "@mediago/shared-common";

export interface CompressionEncoders {
  h264: { available: boolean };
  hevc: { available: boolean };
}
export interface MuxStream {
  index: number;
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  channels?: number;
  sample_rate?: string;
  tags?: Record<string, string>;
}
export interface MuxMedia {
  path: string;
  durationMs: number;
  size: number;
  modifiedMs: number;
  streams: MuxStream[];
  chapters: number;
}
export interface MuxInspection {
  subtitle?: SubtitleInfo;
  source: MuxMedia;
  audio?: MuxMedia;
  formats: {
    format: string;
    available: boolean;
    reason?: string;
    subtitleCodec?: string;
  }[];
}
export const inspectMux = (
  path: string,
  audioPath?: string,
  signal?: AbortSignal,
  subtitle?: {
    subtitlePath?: string;
    subtitleHash?: string;
    convertSubtitle?: boolean;
  },
): Promise<MuxInspection> =>
  http.post(
    "/api/conversions/mux-inspect",
    { path, audioPath, ...subtitle },
    { signal },
  );
export const getCompressionEncoders = (
  refresh = false,
): Promise<CompressionEncoders> =>
  http.get("/api/conversions/encoders", {
    params: { refresh: refresh ? 1 : 0 },
  });

export interface SubtitleInfo {
  format: "srt" | "ass";
  events: number;
  firstMs: number;
  lastMs: number;
  hash: string;
}
export const inspectSubtitle = (
  path: string,
  signal?: AbortSignal,
): Promise<SubtitleInfo> =>
  http.post("/api/conversions/subtitle-inspect", { path }, { signal });
export const previewSubtitle = (
  data: {
    path: string;
    maxEdge: number;
    atMs: number;
    subtitle: CompressionSubtitle;
  },
  signal?: AbortSignal,
): Promise<{ url: string; atMs: number }> =>
  http.post("/api/conversions/subtitle-preview", data, { signal });

export const getConversionsKey = "/api/conversions";
export const getConversion = (id: number): Promise<Conversion> =>
  http.get(`/api/conversions/${id}`);
export const getConversions = (
  p: ConversionPagination,
): Promise<ConversionResponse> =>
  http.get(getConversionsKey, {
    params: { current: p.current, pageSize: p.pageSize, kind: p.kind },
  });

export const addConversion = (data: {
  options?: ConversionOptions;
  name: string;
  path: string;
  outputFormat: string;
  quality?: string;
}): Promise<Conversion> => http.post("/api/conversions", data);

export const deleteConversion = (id: number): Promise<void> =>
  http.delete(`/api/conversions/${id}`);

export const startConversion = (id: number): Promise<void> =>
  http.post(`/api/conversions/${id}/start`);

export const stopConversion = (id: number): Promise<void> =>
  http.post(`/api/conversions/${id}/stop`);
