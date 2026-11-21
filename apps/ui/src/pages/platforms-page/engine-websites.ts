import { sitePresets } from "../source-extract/site-presets";
import generated from "./engine-websites.generated.json";

// Widen the generated table once so TypeScript does not build a union of
// thousands of distinct per-rule arrays during every map/filter operation.
const source: {
  version: string;
  rules: Record<string, { url: string }[]>;
  unavailable: Record<string, string>;
} = generated;

// Reuse reviewed navigation addresses. Extractor IDs are not domain names;
// explicit aliases avoid confusing regional sites or unrelated prefix matches.
const aliases: Record<string, string[]> = {
  bilibili: [
    "bilibili",
    "bilibili category extractor",
    "bilibiliaudio",
    "bilibiliaudioalbum",
    "bilibilibangumi",
    "bilibilibangumimedia",
    "bilibilibangumiseason",
    "bilibilicheese",
    "bilibilicheeseseason",
    "bilibilicollectionlist",
    "bilibilidynamic",
    "bilibilifavoriteslist",
    "bilibiliplayer",
    "bilibiliplaylist",
    "bilibilisearch",
    "bilibiliserieslist",
    "bilibilispaceaudio",
    "bilibilispacevideo",
    "bilibiliwatchlater",
    "bililive",
  ],
  douyin: ["douyin"],
  xiaohongshu: ["xiaohongshu"],
  weibo: ["weibo", "weibouser", "weibovideo"],
  zhihu: ["zhihu"],
  qqvideo: ["vqq"],
  youku: ["youku"],
  iqiyi: ["iqiyi"],
  netease: ["netease"],
  youtube: ["youtube", "youtubelivestreamembed", "youtubeytbe"],
  x: ["twitter"],
  instagram: ["instagram", "instagramios"],
  tiktok: ["tiktok"],
  vimeo: ["vimeo"],
  twitch: ["twitch"],
  pinterest: ["pinterest", "pinterestcollection"],
  reddit: ["reddit"],
  soundcloud: ["soundcloud", "soundcloudembed"],
};

export function safeWebsiteURL(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname.includes(".") ||
      /^\d+(?:\.\d+){3}$/.test(url.hostname) ||
      /(?:^|\.)(?:localhost|invalid|test|local|onion)$/.test(url.hostname) ||
      ["example.com", "example.net", "example.org"].some(
        (host) => url.hostname === host || url.hostname.endsWith("." + host),
      ) ||
      url.search ||
      url.hash
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

const reviewed = new Map<string, string>();
for (const site of sitePresets) {
  const url = safeWebsiteURL(site.url);
  if (!url) continue;
  for (const alias of aliases[site.id] || []) reviewed.set(alias, url);
}

const sourceSites = new Map<string, string[]>(
  Object.entries(source.rules).map(([id, options]) => [
    id.toLowerCase(),
    [
      ...new Set(
        options
          .map((option) => safeWebsiteURL(option.url))
          .filter((url): url is string => !!url),
      ),
    ],
  ]),
);
const unavailable = new Map<string, string>(
  Object.entries(source.unavailable).map(([id, reason]) => [
    id.toLowerCase(),
    reason,
  ]),
);

export function extractorWebsites(id: string): readonly string[] {
  const key = id.toLowerCase();
  // Reviewed product homepages take precedence over embed, redirect and mobile
  // origins in the source examples. Only exact bundled rules are eligible.
  if (!sourceSites.has(key) && !unavailable.has(key)) return [];
  const website = reviewed.get(key.split(":")[0]);
  return website ? [website] : sourceSites.get(key) || [];
}

export function extractorWebsite(id: string): string | undefined {
  const sites = extractorWebsites(id);
  return sites.length === 1 ? sites[0] : undefined;
}

export function websiteUnavailableReason(id: string) {
  return unavailable.get(id.toLowerCase()) === "no-independent-site"
    ? "pcWebsiteNone"
    : "pcWebsiteMissing";
}

export const websiteCatalogVersion = source.version;
