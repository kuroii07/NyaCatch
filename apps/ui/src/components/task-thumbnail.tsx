import { useEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import type { DownloadTaskWithFile } from "@mediago/shared-common";
import { http } from "@/utils";

export function TaskThumbnail({
  task,
  compact,
  fallback,
}: {
  task: DownloadTaskWithFile;
  compact?: boolean;
  fallback: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);
  // Only request covers near the visible part of the list. HTTP goes through
  // the existing authenticated client rather than exposing credentials in img URLs.
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  const { data } = useSWR<Blob>(
    visible
      ? [
          "task-thumbnail",
          task.id,
          task.url,
          task.thumbnail || "",
          task.status === "success",
        ]
      : null,
    () =>
      http.get(`/api/downloads/${task.id}/thumbnail`, {
        responseType: "blob",
        timeout: 60000,
      }),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 600000,
    },
  );
  useEffect(() => {
    setFailed(false);
    if (!data) {
      setSource("");
      return;
    }
    const url = URL.createObjectURL(data);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [data]);
  return (
    <span
      ref={ref}
      className={"v4-task-thumbnail" + (compact ? " is-compact" : "")}
      data-testid={"thumbnail-" + task.id}
      aria-hidden="true"
    >
      {source && !failed ? (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        fallback
      )}
    </span>
  );
}
