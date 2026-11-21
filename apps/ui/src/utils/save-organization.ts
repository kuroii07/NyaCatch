import type { MediaPreview } from "../api/media";
export interface SaveOrganization {
  folders: "none" | "platform" | "author" | "date";
  names: "title" | "author-title" | "date-title";
}
export const defaultOrganization: SaveOrganization = {
  folders: "none",
  names: "title",
};
export function normalizeOrganization(
  value: Partial<SaveOrganization> | null,
): SaveOrganization {
  const folders = value?.folders || "none",
    names = value?.names || "title";
  return {
    folders: ["none", "platform", "author", "date"].includes(folders)
      ? folders
      : "none",
    names: ["title", "author-title", "date-title"].includes(names)
      ? names
      : "title",
  };
}
export function pathSegment(value: string) {
  let safe = Array.from(value, (char) => (char.charCodeAt(0) < 32 ? "_" : char))
    .join("")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 100)
    .replace(/[. ]+$/g, "");
  if (!safe || safe === "." || safe === "..") safe = "Unknown";
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(safe))
    safe = "_" + safe;
  return safe;
}
export function organizeOutput(
  base: string,
  stem: string,
  preview: Pick<MediaPreview, "source" | "uploader">,
  setting: SaveOrganization,
  date = new Date(),
) {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const platform = pathSegment(preview.source || "Unknown"),
    author = pathSegment(preview.uploader || "Unknown");
  const parts =
    setting.folders === "platform"
      ? [platform]
      : setting.folders === "author"
        ? [platform, author]
        : setting.folders === "date"
          ? [day]
          : [];
  const separator = base.includes("\\") ? "\\" : "/";
  return {
    saveDir: parts.length
      ? base.replace(/[\\/]+$/, "") + separator + parts.join(separator)
      : base,
    stem:
      setting.names === "author-title"
        ? author + "_" + pathSegment(stem)
        : setting.names === "date-title"
          ? day + "_" + pathSegment(stem)
          : stem,
  };
}
