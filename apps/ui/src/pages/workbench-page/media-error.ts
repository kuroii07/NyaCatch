import { classifyMediaError } from "../../utils/media-error";
export { classifyMediaError } from "../../utils/media-error";

export function mediaParseErrorKey(message: string, sourceURL: string) {
  let host = "";
  try {
    host = new URL(sourceURL).hostname.toLowerCase();
  } catch {
    // Invalid input is normally handled before extraction; keep error display safe.
  }
  const isX = ["x.com", "twitter.com"].some(
    (domain) => host === domain || host.endsWith("." + domain),
  );
  if (isX && /No video could be found in this tweet/i.test(message))
    return "v4XMediaUnavailable";
  switch (classifyMediaError(message)) {
    case "source-restriction":
      return /412|429|rate.limit/i.test(message) ? "v4Blocked" : "v4Login";
    case "network":
      return /timed.?out|timeout/i.test(message)
        ? "v4Timeout"
        : "v4NetworkError";
    case "unsupported-media":
      return "v4UnsupportedMedia";
    default:
      return "v4ParseFailed";
  }
}
