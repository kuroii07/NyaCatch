import { createHash } from "node:crypto";

export const DOUYIN_RESOLVER = "douyin-browser";

export function douyinSource(source: string): string {
  const url = new URL(source);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("invalid Douyin source");
  const canonical = /^\/(?:video|note)\/(\d{15,25})\/?$/.exec(url.pathname);
  if (url.hostname === "www.douyin.com" && canonical) return canonical[1];
  if (
    url.hostname === "v.douyin.com" &&
    /^\/[A-Za-z0-9_-]{4,64}\/?$/.test(url.pathname)
  )
    return "";
  throw new Error("a single Douyin post is required");
}

function imageURL(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 8192) return;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^p\d+(?:-pc)?-sign\.douyinpic\.com$/.test(url.hostname)
    )
      return url.href;
  } catch {
    /* A malformed candidate must not be passed to the downloader. */
  }
}

export function normalizeDouyin(
  source: string,
  id: string,
  input: unknown,
  userAgent: string,
) {
  const expected = douyinSource(source);
  if (
    !/^\d{15,25}$/.test(id) ||
    (expected && expected !== id) ||
    !input ||
    typeof input !== "object"
  )
    throw new Error("video identity mismatch");
  const post = input as Record<string, any>;
  if (String(post.aweme_id) !== id) throw new Error("unsupported post");
  if (Array.isArray(post.images) && post.images.length) {
    if (post.images.length > 20) throw new Error("unsupported image count");
    const seen = new Set<string>();
    const entries = post.images.map((image: unknown) => {
      if (!image || typeof image !== "object") throw new Error("invalid image");
      const item = image as Record<string, unknown>;
      const candidate = Array.isArray(item.url_list)
        ? item.url_list.map(imageURL).find(Boolean)
        : undefined;
      if (!candidate) throw new Error("untrusted image source");
      const uri =
        typeof item.uri === "string" &&
        item.uri.length > 0 &&
        item.uri.length <= 1024
          ? item.uri
          : new URL(candidate).pathname.split("~")[0];
      if (!uri || /[\r\n]/.test(uri)) throw new Error("invalid image identity");
      // Include the post identity; rotating CDN hosts and signatures must not change selection.
      const resourceId = `dyimg-${id}-${createHash("sha256").update(uri).digest("hex")}`;
      if (seen.has(resourceId)) throw new Error("duplicate image identity");
      seen.add(resourceId);
      return {
        id: resourceId,
        _nyacatch_resource_id: resourceId,
        _nyacatch_resolver: DOUYIN_RESOLVER,
        _nyacatch_kind: "image",
        extractor_key: "Douyin",
        title:
          typeof post.desc === "string"
            ? post.desc.slice(0, 500)
            : "Douyin image",
        url: candidate,
        thumbnail: candidate,
      };
    });
    return { _type: "playlist", entries };
  }
  const urls = post.video?.play_addr?.url_list;
  if (!Array.isArray(urls)) throw new Error("video unavailable");
  const url = urls.find((value: unknown) => {
    if (typeof value !== "string" || value.length > 8192) return false;
    try {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        u.hostname.endsWith(".douyinvod.com")
      );
    } catch {
      return false;
    }
  });
  if (!url || !userAgent || userAgent.length > 512 || /[\r\n]/.test(userAgent))
    throw new Error("untrusted video source");
  const header = {
    "User-Agent": userAgent,
    Referer: "https://www.douyin.com/",
  };
  const covers = post.video?.cover?.url_list;
  const thumbnail = Array.isArray(covers)
    ? covers.find((value: unknown) => {
        if (typeof value !== "string" || value.length > 8192) return false;
        try {
          const u = new URL(value);
          return (
            u.protocol === "https:" &&
            !u.username &&
            !u.password &&
            !u.port &&
            u.hostname.endsWith(".douyinpic.com")
          );
        } catch {
          return false;
        }
      })
    : undefined;
  const width = Number(post.video?.play_addr?.width) || 0,
    height = Number(post.video?.play_addr?.height) || 0;
  return {
    id,
    title:
      typeof post.desc === "string" ? post.desc.slice(0, 500) : "Douyin video",
    duration: Math.max(0, Number(post.duration) || 0) / 1000,
    ext: "mp4",
    extractor_key: "Douyin",
    webpage_url: source,
    _nyacatch_resource_id: `dy-${id}`,
    _nyacatch_resolver: DOUYIN_RESOLVER,
    http_headers: header,
    thumbnail,
    thumbnails: thumbnail ? [{ id: "cover", url: thumbnail }] : [],
    formats: [
      {
        format_id: "douyin-browser-best",
        ext: "mp4",
        protocol: "https",
        url,
        width,
        height,
        http_headers: header,
      },
    ],
  };
}
