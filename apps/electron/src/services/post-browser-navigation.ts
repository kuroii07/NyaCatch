import type { WebContents } from "electron";

export function postNavigationAllowed(
  target: string,
  platform: "douyin" | "xiaohongshu",
): boolean {
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return false;
    const hosts =
      platform === "douyin"
        ? ["douyin.com", "iesdouyin.com"]
        : ["xiaohongshu.com", "xhslink.com", "xhslink.cn"];
    return hosts.some(
      (host) => url.hostname === host || url.hostname.endsWith("." + host),
    );
  } catch {
    return false;
  }
}

export function preventExternalPostNavigation(
  event: { url: string; preventDefault(): void },
  platform: "douyin" | "xiaohongshu",
) {
  if (!postNavigationAllowed(event.url, platform)) event.preventDefault();
}

export function installPostNavigationGuard(
  contents: WebContents,
  platform: "douyin" | "xiaohongshu",
) {
  const block = (event: { url: string; preventDefault(): void }) =>
    preventExternalPostNavigation(event, platform);
  contents.on("will-frame-navigate", block);
  contents.on("will-navigate", block);
  contents.on("will-redirect", block);
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
}
