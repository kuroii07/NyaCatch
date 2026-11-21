import { PLATFORM_CATALOG } from "./platforms";

export interface EngineExtractor {
  id: string;
  broken: boolean;
}

export interface EngineCatalogData {
  schemaVersion: number;
  engine: string;
  version: string;
  binarySha256: string;
  rawEntryCount: number;
  extractors: EngineExtractor[];
}

export type EngineStatus = "all" | "available" | "broken";

export function parseExtractorList(output: string): EngineExtractor[] {
  const entries = new Map<string, EngineExtractor>();
  for (const line of output.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    const flag = "(CURRENTLY BROKEN)";
    const broken = text.endsWith(flag);
    const id = (broken ? text.slice(0, -flag.length) : text).trim();
    if (
      !id ||
      id.length > 256 ||
      [...id].some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    ) {
      throw new Error("Invalid extractor catalog entry");
    }
    const previous = entries.get(id);
    entries.set(id, { id, broken: broken || !!previous?.broken });
  }
  if (!entries.size || entries.size > 10000) {
    throw new Error("Invalid extractor catalog size");
  }
  // yt-dlp already orders the list; preserve that order and its first occurrence.
  return [...entries.values()];
}

export function filterEngineCatalog(
  entries: readonly EngineExtractor[],
  query: string,
  status: EngineStatus,
): EngineExtractor[] {
  const text = query.trim().toLowerCase();
  const known = PLATFORM_CATALOG.find(
    (platform) =>
      platform.id === text ||
      platform.searchTerms.some((alias) => alias.toLowerCase() === text),
  );
  const search = known
    ? known.extractorPrefix || (known.id === "x" ? "twitter" : known.id)
    : text;
  return entries.filter(
    (entry) =>
      (!search || entry.id.toLowerCase().includes(search)) &&
      (status === "all" || entry.broken === (status === "broken")),
  );
}

export function paginateEngineCatalog<T>(
  entries: readonly T[],
  page: number,
  pageSize = 48,
) {
  const pages = Math.max(1, Math.ceil(entries.length / pageSize));
  const current = Math.max(1, Math.min(pages, Math.floor(page) || 1));
  return {
    pages,
    current,
    entries: entries.slice((current - 1) * pageSize, current * pageSize),
  };
}
