import { useEffect } from "react";
import { onDownloadEvent } from "@/api/events";
import { useDownloadStore } from "@/store/download";

export function useMediaTaskEvents(refresh: () => unknown) {
  useEffect(
    () =>
      onDownloadEvent((_, value) => {
        if (!value || typeof value !== "object" || !("type" in value)) return;
        if (
          value.type === "progress" &&
          "data" in value &&
          Array.isArray(value.data)
        ) {
          useDownloadStore.getState().setEvents(value.data);
        } else void refresh();
      }),
    [refresh],
  );
}
