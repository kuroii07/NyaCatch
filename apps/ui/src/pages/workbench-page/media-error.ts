import { classifyMediaError } from "../../utils/media-error";
import type {
  MediaParseFailure,
  MediaParseAttempt,
} from "../../utils/media-parse";
export { classifyMediaError } from "../../utils/media-error";

export function mediaParseAttempts(
  message: string,
  failure?: MediaParseFailure,
): MediaParseAttempt[] {
  if (Array.isArray(failure?.attempts)) {
    const attempts = failure.attempts.filter(
      (a) =>
        a &&
        ["primary", "fallback"].includes(a.route) &&
        typeof a.message === "string" &&
        typeof a.kind === "string",
    );
    if (attempts.length) return attempts.slice(0, 2);
  }
  const marker = "; anonymous X fallback failed: ";
  const index = message.indexOf(marker);
  return index < 0
    ? []
    : [
        { route: "primary", kind: "unknown", message: message.slice(0, index) },
        {
          route: "fallback",
          kind: "unknown",
          message: message.slice(index + marker.length),
        },
      ];
}

export function mediaAttemptErrorKey(attempt: MediaParseAttempt) {
  const keys: Record<string, string> = {
    timeout: "xpCauseTimeout",
    network: "xpCauseNetwork",
    service: "xpCauseService",
    "rate-limit": "xpCauseRateLimit",
    restricted: "xpCauseRestricted",
    unavailable: "xpCauseUnavailable",
    verification: "xpCauseVerification",
  };
  return keys[attempt.kind] || "xpCauseUnknown";
}

export function mediaParseErrorKey(
  message: string,
  sourceURL: string,
  failure?: MediaParseFailure,
) {
  const fallback = mediaParseAttempts(message, failure).find(
    (a) => a.route === "fallback",
  );
  if (fallback) {
    if (fallback.kind !== "unknown")
      return (
        {
          timeout: "xpFallbackTimeout",
          network: "xpFallbackNetwork",
          service: "xpFallbackService",
          "rate-limit": "xpFallbackRateLimit",
          restricted: "xpFallbackRestricted",
          unavailable: "xpFallbackUnavailable",
          verification: "xpFallbackVerification",
        }[fallback.kind] || "xpFallbackFailed"
      );
    if (/deadline exceeded|timed.?out|timeout/i.test(fallback.message))
      return "xpFallbackTimeout";
    if (/\b429\b|rate.limit/i.test(fallback.message))
      return "xpFallbackRateLimit";
    if (/\b(502|503|504)\b|invalid public X response/i.test(fallback.message))
      return "xpFallbackService";
    if (
      /could not be reached|could not be read|connection|network|tls|proxy|dns/i.test(
        fallback.message,
      )
    )
      return "xpFallbackNetwork";
    if (/\b(401|403)\b|requires login|private tweet/i.test(fallback.message))
      return "xpFallbackRestricted";
    if (/ffprobe|verification failed/i.test(fallback.message))
      return "xpFallbackVerification";
    if (
      /\b404\b|no supported resources|unsupported media|unsupported photo/i.test(
        fallback.message,
      )
    )
      return "xpFallbackUnavailable";
    return "xpFallbackFailed";
  }
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
