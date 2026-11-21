import type { MediaPreview } from "../../api/media";
import type { BatchInput } from "./batch-model";
import type { CollectionSelection } from "@mediago/shared-common";
export type BatchStatus =
  | "waiting"
  | "loading"
  | "success"
  | "error"
  | "canceled";
export async function runBatch(
  inputs: BatchInput[],
  signal: AbortSignal,
  resolve: (
    url: string,
    signal: AbortSignal,
    collection?: CollectionSelection,
  ) => Promise<MediaPreview>,
  notify: (
    index: number,
    status: BatchStatus,
    preview?: MediaPreview,
    error?: string,
  ) => void,
  discard: (preview: MediaPreview) => Promise<void>,
): Promise<void> {
  const state: BatchStatus[] = inputs.map((input, index) => {
    if (!input.valid) {
      notify(index, "error", undefined, "invalid-url");
      return "error";
    }
    return "waiting";
  });
  const cancel = () =>
    state.forEach((status, index) => {
      if (status === "waiting" || status === "loading") {
        state[index] = "canceled";
        notify(index, "canceled");
      }
    });
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  let next = 0;
  async function worker() {
    while (!signal.aborted) {
      const index = next++;
      if (index >= inputs.length) return;
      if (state[index] !== "waiting") continue;
      state[index] = "loading";
      notify(index, "loading");
      try {
        const preview = await resolve(
          inputs[index].url,
          signal,
          inputs[index].collection,
        );
        if (signal.aborted) {
          await discard(preview);
        } else {
          state[index] = "success";
          notify(index, "success", preview);
        }
      } catch (reason) {
        if (!signal.aborted) {
          state[index] = "error";
          notify(
            index,
            "error",
            undefined,
            reason instanceof Error ? reason.message : String(reason),
          );
        }
      }
    }
  }
  try {
    await Promise.all([worker(), worker()]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
