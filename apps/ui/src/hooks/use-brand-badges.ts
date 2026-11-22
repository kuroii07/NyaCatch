import { useEffect, useState } from "react";
import { onDownloadEvent } from "@/api/events";

/** Transient event feedback (+N), never a claimed total queue size. */
export function useBrandBadges() {
  const [created, setCreated] = useState<{ count: number; key: number }>();
  const [completed, setCompleted] = useState(0);
  useEffect(() => {
    let sequence = 0;
    let createdTimer: ReturnType<typeof setTimeout>;
    let completedTimer: ReturnType<typeof setTimeout>;
    const unsubscribe = onDownloadEvent((_, event) => {
      if (event.type === "created") {
        const count = Number(event.data?.count);
        if (!Number.isFinite(count) || count <= 0) return;
        setCreated({ count: Math.min(99, Math.floor(count)), key: ++sequence });
        clearTimeout(createdTimer);
        createdTimer = setTimeout(() => setCreated(undefined), 1800);
      } else if (event.type === "success") {
        setCompleted(++sequence);
        clearTimeout(completedTimer);
        completedTimer = setTimeout(() => setCompleted(0), 1800);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(createdTimer);
      clearTimeout(completedTimer);
    };
  }, []);
  return { created, completed };
}
