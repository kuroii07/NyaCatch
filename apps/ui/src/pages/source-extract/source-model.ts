import { DownloadType } from "@mediago/shared-common";
import type { SourceData } from "@/store/browser";

export type SourceGroup = "all" | "stream" | "file" | "platform";

export function sourceGroup(type: DownloadType): Exclude<SourceGroup, "all"> {
  if (type === DownloadType.m3u8) return "stream";
  if (type === DownloadType.direct) return "file";
  return "platform";
}

export function sourceHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export function filterSources(
  sources: SourceData[],
  query: string,
  group: SourceGroup,
): SourceData[] {
  const search = query.trim().toLocaleLowerCase();
  return sources.filter(
    (item) =>
      (group === "all" || sourceGroup(item.type) === group) &&
      (!search ||
        `${item.name}\n${item.url}`.toLocaleLowerCase().includes(search)),
  );
}
