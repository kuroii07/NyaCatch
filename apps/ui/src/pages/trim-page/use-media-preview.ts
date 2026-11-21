import { useEffect, useRef, useState } from "react";
import { usePlatform } from "@/hooks/use-platform";
import type {
  CompatiblePreviewState,
  MediaPreviewCacheInfo,
} from "@mediago/shared-common";

export function previewError(error: unknown) {
  const match = /\bpc[A-Z]\w+\b/.exec(
    error instanceof Error ? error.message : String(error),
  );
  return match?.[0] || "pcGenerateFailed";
}

// A preview lease is bound to this source/effect, never persisted with export
// options. Late IPC replies are released after navigation instead of publishing.
export function useMediaPreview(path: string) {
  const { shell } = usePlatform();
  const [request, setRequest] = useState({
    path,
    mode: "source" as "source" | "compatible",
    nonce: 0,
  });
  const [preview, setPreview] = useState<{ id: string; url: string }>();
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState<CompatiblePreviewState>();
  const [error, setError] = useState<string>();
  const [cache, setCache] = useState<MediaPreviewCacheInfo>();
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState<{ path: string; key: string }>();
  const generation = useRef(0);
  const activeMode = request.path === path ? request.mode : "source",
    nonce = request.path === path ? request.nonce : 0;
  useEffect(() => {
    generation.current++;
    let closed = false,
      sourceID: string | undefined,
      jobID: string | undefined;
    setPreview(undefined);
    setFailed(false);
    setState(undefined);
    setError(undefined);
    void shell
      .mediaPreviewCacheInfo()
      .then((info) => {
        if (!closed) setCache(info);
      })
      .catch(() => {});
    void (async () => {
      try {
        if (activeMode === "source") {
          const value = await shell.createMediaPreview(path);
          sourceID = value.id;
          if (closed) await shell.releaseMediaPreview(value.id);
          else setPreview(value);
          return;
        }
        let value = await shell.startCompatiblePreview(path);
        jobID = value.id;
        if (closed) {
          await shell.releaseCompatiblePreview(jobID);
          return;
        }
        while (!closed) {
          value = await shell.compatiblePreviewStatus(jobID);
          if (closed) break;
          setState(value);
          if (value.status === "ready" && value.preview) {
            setPreview(value.preview);
            const info = await shell.mediaPreviewCacheInfo();
            if (!closed) setCache(info);
            return;
          }
          if (value.status === "failed" || value.status === "cancelled")
            throw Error(value.error || "pcGenerateFailed");
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      } catch (cause) {
        if (!closed) {
          if (activeMode === "compatible") setError(previewError(cause));
          setFailed(true);
        }
      }
    })();
    return () => {
      closed = true;
      generation.current++;
      if (sourceID) void shell.releaseMediaPreview(sourceID).catch(() => {});
      if (jobID) void shell.releaseCompatiblePreview(jobID).catch(() => {});
    };
  }, [path, activeMode, nonce, shell]);
  const loading = activeMode === "compatible" && !preview && !failed;
  function source() {
    setRequest((r) => ({ path, mode: "source", nonce: r.nonce + 1 }));
  }
  async function clear() {
    const epoch = generation.current;
    setClearing(true);
    try {
      const info = await shell.clearMediaPreviewCache();
      if (epoch === generation.current) {
        setCache(info);
        source();
        setNotice({ path, key: info.files ? "pcCacheKept" : "pcCacheCleared" });
      }
    } catch (cause) {
      if (epoch === generation.current) setError(previewError(cause));
    } finally {
      setClearing(false);
    }
  }
  return {
    preview,
    failed,
    state,
    error,
    notice: notice?.path === path ? notice.key : undefined,
    cache,
    clearing,
    loading,
    compatible: activeMode === "compatible" && !!preview,
    fail: () => setFailed(true),
    retry: () => {
      setNotice(undefined);
      source();
    },
    prepare: () => {
      setNotice(undefined);
      setRequest((r) => ({ path, mode: "compatible", nonce: r.nonce + 1 }));
    },
    cancel: source,
    clear,
  };
}
