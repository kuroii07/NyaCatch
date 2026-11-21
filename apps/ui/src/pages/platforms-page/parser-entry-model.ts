import { extractShareLinks, validMediaLink } from "../../utils/share-links";

export type PlatformParserTarget =
  | { kind: "common"; id: string }
  | { kind: "catalog" };
export interface PlatformParseIntent {
  id: string;
  url: string;
}

export function preparePlatformLinks(text: string): {
  links: string[];
  error?: "wbInvalidURL" | "ppTooMany";
} {
  const links = extractShareLinks(text);
  if (!links.length || links.some((link) => !validMediaLink(link)))
    return { links, error: "wbInvalidURL" };
  if (links.length > 20) return { links, error: "ppTooMany" };
  return { links };
}

export function readPlatformParseIntent(
  state: unknown,
): PlatformParseIntent | undefined {
  if (!state || typeof state !== "object" || !("platformParse" in state))
    return undefined;
  const value = state.platformParse;
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    !("url" in value) ||
    typeof value.id !== "string" ||
    !value.id ||
    value.id.length > 80 ||
    typeof value.url !== "string" ||
    !validMediaLink(value.url)
  )
    return undefined;
  return { id: value.id, url: value.url };
}
