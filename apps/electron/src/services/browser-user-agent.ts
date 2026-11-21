export function desktopBrowserUserAgent(
  defaultAgent: string,
  chromeVersion: string,
): string {
  const prefix =
    /^(Mozilla\/5\.0 \([^)]*\) AppleWebKit\/[\d.]+ \(KHTML, like Gecko\))/.exec(
      defaultAgent,
    )?.[1];
  const safari = /\bSafari\/[\d.]+/.exec(defaultAgent)?.[0];
  if (!prefix || !safari || !/^\d+(?:\.\d+){1,3}$/.test(chromeVersion))
    throw Error("The Chromium desktop user agent is unavailable");
  // Match Chrome's reduced desktop UA while retaining the real engine's major
  // version. Some sites also reject Chromium's unreduced full-version string.
  return `${prefix} Chrome/${chromeVersion.split(".")[0]}.0.0.0 ${safari}`;
}
