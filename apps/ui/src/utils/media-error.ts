export type MediaErrorCategory =
  | "network"
  | "source-restriction"
  | "unsupported-media"
  | "software-failure";

export function classifyMediaError(message: string): MediaErrorCategory {
  if (
    /\b(401|403|412|429)\b|sign.in|login|cookies|rate.limit|forbidden|geo.?restrict/i.test(
      message,
    )
  ) {
    return "source-restriction";
  }
  if (
    /timed.?out|timeout|dns|name resolution|connection (?:reset|refused|closed)|network|failed to fetch|could not fetch|tls|ssl|handshake|proxy/i.test(
      message,
    )
  ) {
    return "network";
  }
  if (
    /unsupported|no formats?|format.{0,20}not available|codec.{0,20}(?:missing|unsupported)/i.test(
      message,
    )
  ) {
    return "unsupported-media";
  }
  return "software-failure";
}
