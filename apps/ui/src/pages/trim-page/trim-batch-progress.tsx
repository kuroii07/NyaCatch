import useSWR from "swr";
import { FolderOpen, History, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getConversion } from "@/api/conversion";
import { usePlatform } from "@/hooks/use-platform";
import { NcProgress } from "@/components/nc-progress";

export default function TrimBatchProgress({
  ids,
  revision,
  openHistory,
  action,
  scope = "trim",
}: {
  ids: number[];
  revision: number;
  openHistory: () => void;
  action: (callback: () => Promise<unknown>) => Promise<unknown>;
  scope?: "trim" | "merge" | "capture" | "compress" | "mux";
}) {
  const { t } = useTranslation();
  const { shell } = usePlatform();
  const progressKey =
    scope === "mux"
      ? "mxProgress"
      : scope === "compress"
        ? "vpProgress"
        : scope === "capture"
          ? "capProgress"
          : scope === "merge"
            ? "mgProgress"
            : "trBatchProgress";
  const historyKey =
    scope === "mux"
      ? "mxHistory"
      : scope === "compress"
        ? "vpHistory"
        : scope === "capture"
          ? "capHistory"
          : scope === "merge"
            ? "mgHistory"
            : "trHistory";
  const { data, error, mutate } = useSWR(
    ids.length ? ["trim-recent-tasks", ids.join(","), revision] : null,
    () =>
      Promise.all(
        ids.map(async (id) => {
          try {
            return await getConversion(id);
          } catch {
            return null;
          }
        }),
      ),
    {
      refreshInterval: (rows) =>
        // A confirmed creation can start after this view remounts. Keep queued
        // IDs fresh too, so that transition cannot leave progress stuck at zero.
        rows?.some((row) =>
          ["pending", "converting"].includes(row?.status || ""),
        )
          ? 1000
          : 0,
    },
  );
  if (!ids.length) return null;
  const done = data?.filter((row) => row?.status === "done").length || 0;
  const running =
    data?.filter((row) => row?.status === "converting").length || 0;
  const failed = data?.filter((row) => row?.status === "failed").length || 0;
  const queued = data?.filter((row) => row?.status === "pending").length || 0;
  const missing =
    data?.filter(
      (row) =>
        !row ||
        !["done", "converting", "pending", "failed"].includes(row.status),
    ).length || 0;
  const percent = Math.round(
    (data?.reduce(
      (sum, row) =>
        sum +
        (row?.status === "done"
          ? 100
          : row?.status === "converting"
            ? Math.max(0, Math.min(100, row.progress || 0))
            : 0),
      0,
    ) || 0) / ids.length,
  );
  const output = data?.find(
    (row) => row?.status === "done" && row.outputPath,
  )?.outputPath;
  return (
    <section
      className="trim-batch-progress"
      data-testid="trim-batch-progress"
      aria-label={t(progressKey)}
    >
      <div className="trim-batch-summary" role="status" aria-live="polite">
        <strong>{t(progressKey)}</strong>
        <span>
          {error
            ? t("trProgressFailed")
            : !data
              ? t("cLoading")
              : t("trBatchStatus", {
                  done,
                  total: ids.length,
                  running,
                  queued,
                  failed,
                })}
          {missing > 0 && ` · ${t("trMissingTasks", { count: missing })}`}
        </span>
        {data && !error && (
          <NcProgress
            className="cvt-progress"
            value={percent}
            state={
              done === ids.length
                ? "complete"
                : running || queued
                  ? "active"
                  : failed
                    ? "failed"
                    : "paused"
            }
            label={t(progressKey)}
          />
        )}
      </div>
      {(error || missing > 0) && (
        <button
          type="button"
          className="wb-icon-button"
          aria-label={t("v4Refresh")}
          onClick={() => void mutate()}
        >
          <RefreshCw size={15} />
        </button>
      )}
      {output && (
        <button
          type="button"
          className="wb-icon-button"
          aria-label={t("cOpenFolder")}
          title={t("cOpenFolder")}
          onClick={() => void action(() => shell.reveal(output))}
        >
          <FolderOpen size={16} />
        </button>
      )}
      <button type="button" className="wb-secondary" onClick={openHistory}>
        <History size={15} />
        {t(historyKey)}
      </button>
    </section>
  );
}
