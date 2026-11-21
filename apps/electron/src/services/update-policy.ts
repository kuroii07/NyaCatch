export const UPDATE_REPOSITORY = {
  provider: "github" as const,
  owner: "kuroii07",
  repo: "NyaCatch",
};
export const RELEASES_URL = "https://github.com/kuroii07/NyaCatch/releases";
const inactive = new Set([
  "ready",
  "success",
  "failed",
  "stopped",
  "completed",
  "cancelled",
  "done",
]);
export function assertIdleStatuses(rows: readonly { status: string }[]) {
  if (rows.some((row) => !inactive.has(row.status))) throw new Error("suBusy");
}
export function stableUpdateAllowed(
  packaged: boolean,
  channel: string | undefined,
  installed: boolean,
) {
  return packaged && channel === "stable" && installed;
}
