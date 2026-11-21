import { createHash } from "node:crypto";

export const XHS_RESOLVER = "xiaohongshu-public";

export function xhsNoteId(source: string): string {
  const url = new URL(source);
  if (
    ["xhslink.com", "xhslink.cn"].includes(url.hostname) &&
    ["http:", "https:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.port &&
    /^\/(?:[aAoO]\/)?[A-Za-z0-9_-]{4,64}\/?$/.test(url.pathname)
  )
    return "";
  const match = /^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/.exec(
    url.pathname,
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.xiaohongshu.com" ||
    url.username ||
    url.password ||
    url.port ||
    !match
  ) {
    throw new Error("a single Xiaohongshu post is required");
  }
  return match[1];
}

export function normalizeXhsNote(
  source: string,
  input: unknown,
  resolvedSource = source,
) {
  const expected = xhsNoteId(source);
  const id = xhsNoteId(resolvedSource);
  if (!id || (expected && expected !== id))
    throw new Error("post identity mismatch");
  if (!input || typeof input !== "object")
    throw new Error("post data unavailable");
  const note = input as Record<string, unknown>;
  if (
    note.noteId !== id ||
    note.type !== "normal" ||
    !Array.isArray(note.imageList) ||
    note.imageList.length < 1 ||
    note.imageList.length > 20
  )
    throw new Error("unsupported post data");
  const seen = new Set<string>();
  const entries = note.imageList.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("invalid image");
    const image = entry as Record<string, unknown>;
    if (
      typeof image.fileId !== "string" ||
      !image.fileId ||
      image.fileId.length > 512 ||
      typeof image.urlDefault !== "string" ||
      image.urlDefault.length > 8192
    )
      throw new Error("invalid image");
    const url = new URL(image.urlDefault);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.hostname !== "sns-webpic-qc.xhscdn.com" ||
      url.port ||
      url.username ||
      url.password
    )
      throw new Error("untrusted image source");
    // Platform data may advertise HTTP even though this known CDN supports HTTPS.
    url.protocol = "https:";
    const resourceId =
      "xhs-" +
      (expected ? "" : id + "-") +
      createHash("sha256").update(image.fileId).digest("hex");
    if (seen.has(resourceId)) throw new Error("duplicate image identity");
    seen.add(resourceId);
    return {
      id: resourceId,
      _nyacatch_resource_id: resourceId,
      _nyacatch_resolver: XHS_RESOLVER,
      _nyacatch_kind: "image",
      extractor_key: "XiaoHongShu",
      title: typeof note.title === "string" ? note.title.slice(0, 500) : "",
      ext: "webp",
      url: url.href,
      thumbnail: url.href,
    };
  });
  return { _type: "playlist", entries };
}
