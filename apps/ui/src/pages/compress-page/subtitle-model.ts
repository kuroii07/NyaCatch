import type {
  CompressionSubtitle,
  CompressionSubtitleStyle,
} from "@mediago/shared-common";
export interface SubtitleBinding {
  path: string;
  format: "srt" | "ass";
  enabled: boolean;
  offsetMs: number;
  sourceHash: string;
  style: CompressionSubtitleStyle;
}
export const defaultSubtitleStyle = (): CompressionSubtitleStyle => ({
  fontFamily: "Microsoft YaHei",
  fontSize: 48,
  color: "#FFFFFF",
  outlineColor: "#000000",
  outline: 2,
  position: "bottom",
});
export function validSubtitleBinding(value: unknown): value is SubtitleBinding {
  if (!value || typeof value !== "object") return false;
  const s = value as SubtitleBinding,
    v = s.style;
  return (
    typeof s.path === "string" &&
    s.path.length <= 4096 &&
    /^(?:[a-z]:[\\/]|\\\\|\/)/i.test(s.path) &&
    !s.path.includes("\0") &&
    ["srt", "ass"].includes(s.format) &&
    s.path.toLowerCase().endsWith(`.${s.format}`) &&
    typeof s.enabled === "boolean" &&
    Number.isSafeInteger(s.offsetMs) &&
    Math.abs(s.offsetMs) <= 3600000 &&
    typeof s.sourceHash === "string" &&
    /^[a-f0-9]{64}$/.test(s.sourceHash) &&
    !!v &&
    ["Microsoft YaHei", "SimHei", "SimSun", "Arial"].includes(v.fontFamily) &&
    Number.isInteger(v.fontSize) &&
    v.fontSize >= 16 &&
    v.fontSize <= 96 &&
    /^#[a-f0-9]{6}$/i.test(v.color) &&
    /^#[a-f0-9]{6}$/i.test(v.outlineColor) &&
    Number.isInteger(v.outline) &&
    v.outline >= 0 &&
    v.outline <= 8 &&
    ["top", "middle", "bottom"].includes(v.position)
  );
}
export function validSubtitleMap(value: unknown, paths: string[]): boolean {
  return (
    value === undefined ||
    (!!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(value).length <= 20 &&
      Object.entries(value).every(
        ([path, binding]) =>
          paths.includes(path) && validSubtitleBinding(binding),
      ))
  );
}
export function subtitleOptions(
  binding?: SubtitleBinding,
): CompressionSubtitle | undefined {
  if (!binding?.enabled) return;
  return {
    path: binding.path,
    offsetMs: binding.offsetMs,
    sourceHash: binding.sourceHash,
    ...(binding.format === "srt" ? { style: { ...binding.style } } : {}),
  };
}
