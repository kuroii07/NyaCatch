export type NcProgressState = "active" | "paused" | "complete" | "failed";

export function normalizeProgress(
  value?: number,
  max = 100,
  state: NcProgressState = "active",
) {
  // Invalid ranges fall back to the percentage scale. Unknown measurements
  // stay indeterminate rather than advertising a fabricated numeric reading.
  const maximum = Number.isFinite(max) && max > 0 ? max : 100;
  const now =
    state === "complete"
      ? maximum
      : value !== undefined && Number.isFinite(value)
        ? Math.max(0, Math.min(maximum, value))
        : undefined;
  return { maximum, now, ratio: now === undefined ? 0.3 : now / maximum };
}
