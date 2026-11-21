import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CompressionSubtitle } from "@mediago/shared-common";
import { previewSubtitle } from "@/api/conversion";
import { formatTrimTime } from "../trim-page/trim-model";
export default function SubtitlePreview({
  path,
  maxEdge,
  atMs,
  subtitle,
  refresh,
}: {
  path: string;
  maxEdge: number;
  atMs: number;
  subtitle: CompressionSubtitle;
  refresh: number;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<{
      key: string;
      url?: string;
      error?: boolean;
    }>(),
    [retry, setRetry] = useState(0);
  const key = JSON.stringify({ path, maxEdge, atMs, subtitle, refresh, retry });
  useEffect(() => {
    const abort = new AbortController();
    const value = JSON.parse(key);
    const timer = setTimeout(() => {
      void previewSubtitle(
        {
          path: value.path,
          maxEdge: value.maxEdge,
          atMs: value.atMs,
          subtitle: value.subtitle,
        },
        abort.signal,
      )
        .then((result) => {
          if (!abort.signal.aborted) setState({ key, url: result.url });
        })
        .catch(() => {
          if (!abort.signal.aborted) setState({ key, error: true });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [key]);
  const current = state?.key === key ? state : undefined;
  return (
    <section
      className="trim-preview compress-subtitle-preview"
      data-testid="subtitle-preview"
    >
      <div className="trim-player">
        {current?.url ? (
          <img
            data-testid="subtitle-frame"
            src={current.url}
            alt={t("vpSubFrame")}
          />
        ) : (
          <span role="status">
            {t(current?.error ? "vpSubPreviewFailed" : "vpSubRendering")}
          </span>
        )}
      </div>
      <div className="trim-transport">
        <span className="trim-playhead">
          {formatTrimTime(atMs)} · {t("vpSubFrame")}
        </span>
        <button
          type="button"
          className="wb-secondary"
          data-testid="subtitle-preview-retry"
          onClick={() => setRetry((v) => v + 1)}
        >
          {t(current?.error ? "cRetry" : "cReload")}
        </button>
      </div>
      <small className="compress-subtitle-preview-hint">
        {t("vpSubFrameHint")}
      </small>
    </section>
  );
}
