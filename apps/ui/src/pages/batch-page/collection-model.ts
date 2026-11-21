import type { CollectionEntry } from "../../api/media";
import { parseBatchInput, type BatchInput } from "./batch-model";

export function inputsForCollection(
  draft: string,
  entries: CollectionEntry[],
  source: string,
  previous: BatchInput[],
): BatchInput[] {
  const existing = parseBatchInput(draft, 200).filter(
    (input) => input.url !== source,
  );
  const identities = new Map(
    previous.map((input) => [input.url, input.collection]),
  );
  for (const entry of entries) identities.set(entry.url, entry.selection);
  return parseBatchInput(
    [
      ...existing.map((input) => input.url),
      ...entries.map((entry) => entry.url),
    ].join("\n"),
    200,
  ).map((input) =>
    Object.assign(input, { collection: identities.get(input.url) }),
  );
}

export function collectionCandidate(value: string) {
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.port ||
      !["http:", "https:"].includes(url.protocol)
    )
      return false;
    if (["www.bilibili.com", "bilibili.com"].includes(url.hostname))
      return /^\/video\/BV[0-9a-zA-Z]{10}\/?$/.test(url.pathname);
    if (url.hostname === "space.bilibili.com")
      return /^\/\d+\/(?:lists\/\d+\/?|channel\/collectiondetail\/?)$/.test(
        url.pathname,
      );
    return (
      [
        "www.youtube.com",
        "youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(url.hostname) &&
      ["/playlist", "/watch"].includes(url.pathname) &&
      /^[a-zA-Z0-9_-]{2,150}$/.test(url.searchParams.get("list") || "")
    );
  } catch {
    return false;
  }
}
export function autoDiscoverCollection(value: string) {
  if (!collectionCandidate(value)) return false;
  const url = new URL(value);
  return (
    !url.searchParams.has("p") &&
    !(url.pathname === "/watch" && url.searchParams.has("v"))
  );
}
export function mergeCollectionEntries(
  previous: CollectionEntry[],
  incoming: CollectionEntry[],
) {
  const known = new Set(previous.map((item) => item.id));
  return [
    ...previous,
    ...incoming.filter((item) => {
      if (known.has(item.id)) return false;
      known.add(item.id);
      return true;
    }),
  ];
}
