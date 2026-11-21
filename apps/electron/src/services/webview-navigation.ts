// Browser-owned documents stay in Chromium. Application and system protocols
// must never escape a material website through any frame or popup.
export function webviewNavigationAllowed(target: string | undefined): boolean {
  if (typeof target !== "string" || !target.trim()) return false;
  try {
    const url = new URL(target);
    if (["http:", "https:"].includes(url.protocol)) return !!url.hostname;
    if (url.protocol === "about:")
      return ["blank", "srcdoc"].includes(url.pathname);
    return ["blob:", "data:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function preventExternalWebviewNavigation(
  event: { url?: string; preventDefault(): void },
  target?: string,
) {
  if (!webviewNavigationAllowed(target ?? event.url)) event.preventDefault();
}
