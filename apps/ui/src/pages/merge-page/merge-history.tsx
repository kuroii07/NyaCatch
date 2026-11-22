import { Drawer } from "antd";
import {
  FolderOpen,
  History,
  Headphones,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ConversionResponse } from "@mediago/shared-common";
import { usePlatform } from "@/hooks/use-platform";
import { NcProgress } from "@/components/nc-progress";
import { useAudioHandoff } from "../converter-page/use-audio-handoff";
import { formatTrimTime } from "../trim-page/trim-model";
import { filenameForPath } from "../converter-page/converter-model";
import CompressionSize, {
  useCompressionOutputs,
} from "../compress-page/compress-size";

export default function MergeHistory({
  kind = "merge",
  open,
  close,
  data,
  error,
  loading,
  page,
  setPage,
  reload,
  start,
  stop,
  remove,
  action,
}: {
  kind?: "merge" | "capture" | "compress" | "mux";
  open: boolean;
  close: () => void;
  data?: ConversionResponse;
  error: unknown;
  loading: boolean;
  page: number;
  setPage: (page: number) => void;
  reload: () => Promise<unknown>;
  start: (id: number) => Promise<unknown>;
  stop: (id: number) => Promise<unknown>;
  remove: (id: number) => Promise<unknown>;
  action: (callback: () => Promise<unknown>) => Promise<unknown>;
}) {
  const { t } = useTranslation(),
    { shell } = usePlatform(),
    pages = Math.max(1, Math.ceil((data?.total || 0) / 50));
  const { send: sendAudio, sending: sendingAudio } = useAudioHandoff();
  const historyKey =
    kind === "mux"
      ? "mxHistory"
      : kind === "compress"
        ? "vpHistory"
        : kind === "capture"
          ? "capHistory"
          : "mgHistory";
  const outputs = useCompressionOutputs(
    kind === "compress" ? data?.list : undefined,
    open,
  );
  return (
    <Drawer
      open={open}
      onClose={close}
      closable={false}
      size="min(560px, 100vw)"
      rootClassName="trim-history-drawer"
      title={
        <div className="trim-history-title">
          {t(historyKey)}
          <span>{data?.total || 0}</span>
        </div>
      }
      extra={
        <div className="trim-history-tools">
          <button
            type="button"
            className="wb-icon-button"
            data-testid={`${kind}-history-refresh`}
            aria-label={t("cReload")}
            title={t("cReload")}
            onClick={() =>
              void action(async () => {
                if (kind === "compress") outputs.reload();
                await reload();
              })
            }
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            className="wb-icon-button"
            data-testid={`${kind}-history-close`}
            aria-label={t(
              kind === "mux"
                ? "mxCloseHistory"
                : kind === "compress"
                  ? "vpCloseHistory"
                  : kind === "capture"
                    ? "capCloseHistory"
                    : "mgCloseHistory",
            )}
            title={t(
              kind === "mux"
                ? "mxCloseHistory"
                : kind === "compress"
                  ? "vpCloseHistory"
                  : kind === "capture"
                    ? "capCloseHistory"
                    : "mgCloseHistory",
            )}
            onClick={close}
          >
            <X size={16} />
          </button>
        </div>
      }
      styles={{
        body: { display: "flex", flexDirection: "column", overflow: "hidden" },
      }}
    >
      <section className="trim-history-content" aria-label={t(historyKey)}>
        <div className="cvt-list trim-records" data-testid={`${kind}-records`}>
          {(loading || !!error) && (
            <p role="status">{t(error ? "cLoadError" : "cLoading")}</p>
          )}
          {!loading && !error && !data?.list.length && (
            <div className="cvt-empty">
              <History size={28} />
              <p>
                {t(
                  kind === "mux"
                    ? "mxEmpty"
                    : kind === "compress"
                      ? "vpEmpty"
                      : kind === "capture"
                        ? "capEmpty"
                        : "mgEmpty",
                )}
              </p>
            </div>
          )}
          {data?.list.map((row) => (
            <article
              className="cvt-row"
              key={row.id}
              data-testid={`${kind}-record-${row.id}`}
            >
              <div className="cvt-file-info">
                <strong>{row.name}</strong>
                <span>
                  {kind === "mux"
                    ? t(
                        row.options?.mux?.audioPath ||
                          row.options?.mux?.subtitlePath
                          ? "mxCombine"
                          : "mxRemux",
                      )
                    : kind === "compress"
                      ? `${row.options?.compress?.codec === "hevc" ? "H.265" : "H.264"} · ${row.options?.compress?.encoder === "nvenc" ? "NVIDIA NVENC" : "CPU"} · ${row.options?.compress?.targetBytes ? t("vpTargetSummary", { size: row.options.compress.targetBytes / 1000000 }) : row.options?.compress?.encoder === "nvenc" ? `CQ ${row.options.compress.cq ?? "—"}` : `CRF ${row.options?.compress?.crf ?? "—"}`} · ${t(row.options?.compress?.trial ? "vpTrialResult" : "vpFull")}`
                      : kind === "capture"
                        ? `${formatTrimTime(row.options?.capture?.startMs || 0)}${row.options?.capture?.endMs ? ` – ${formatTrimTime(row.options.capture.endMs)}` : ""}`
                        : row.options?.merge?.paths.length || 0}{" "}
                  · {row.outputFormat.toUpperCase()}
                </span>
                <span title={row.outputPath || row.path}>
                  {row.outputPath || row.path}
                </span>
                {kind === "mux" && row.options?.mux?.audioPath && (
                  <span title={row.options.mux.audioPath}>
                    {t("mxAudio")}: {filenameForPath(row.options.mux.audioPath)}
                  </span>
                )}
                {kind === "compress" && (
                  <CompressionSize
                    row={row}
                    file={outputs.files.find(
                      (file) => file.path === row.outputPath,
                    )}
                    failed={outputs.failed}
                  />
                )}
                {kind === "mux" && row.options?.mux?.subtitlePath && (
                  <span title={row.options.mux.subtitlePath}>
                    {t("mxSubtitle")}:{" "}
                    {filenameForPath(row.options.mux.subtitlePath)}
                    {row.options.mux.convertSubtitle &&
                    ["mp4", "mov"].includes(row.outputFormat)
                      ? ` · ${t("mxSubtitleConverted")}`
                      : ""}
                  </span>
                )}
                {kind === "compress" && row.options?.compress?.subtitle && (
                  <span title={row.options.compress.subtitle.path}>
                    {t("vpSubRecord", {
                      name: filenameForPath(row.options.compress.subtitle.path),
                      seconds: row.options.compress.subtitle.offsetMs / 1000,
                    })}
                  </span>
                )}
                {row.error && <span className="cvt-error">{row.error}</span>}
                {row.status === "converting" && (
                  <NcProgress
                    className="cvt-progress"
                    value={row.progress}
                    label={row.name || filenameForPath(row.path)}
                  />
                )}
                {row.status === "converting" &&
                  !!row.options?.compress?.targetBytes && (
                    <span>
                      {t("vpTargetPass", {
                        pass: (row.progress || 0) < 45 ? 1 : 2,
                      })}
                    </span>
                  )}
              </div>
              <span className={`cvt-status is-${row.status}`}>
                {t(
                  row.status === "done"
                    ? "cDone"
                    : row.status === "failed"
                      ? "cFailed"
                      : row.status === "pending"
                        ? "trQueued"
                        : row.status === "converting"
                          ? "trRunning"
                          : "cUnknown",
                )}
                {row.status === "converting" && ` ${row.progress || 0}%`}
              </span>
              <div className="cvt-row-actions">
                {row.status === "converting" ? (
                  <button
                    type="button"
                    aria-label={t("cStop")}
                    title={t("cStop")}
                    onClick={() => void action(() => stop(row.id))}
                  >
                    <Square size={15} />
                  </button>
                ) : (
                  <>
                    {["pending", "failed"].includes(row.status) && (
                      <button
                        type="button"
                        aria-label={t(
                          row.status === "failed" ? "cRetry" : "cStartTask",
                        )}
                        onClick={() => void action(() => start(row.id))}
                      >
                        <RotateCcw size={15} />
                      </button>
                    )}
                    {kind === "merge" &&
                      row.status === "done" &&
                      row.outputPath && (
                        <button
                          type="button"
                          data-testid={`merge-audio-${row.id}`}
                          disabled={sendingAudio}
                          aria-label={t("axSend")}
                          title={t("axSend")}
                          onClick={() => void sendAudio([row.outputPath])}
                        >
                          <Headphones size={15} />
                        </button>
                      )}
                    {row.status === "done" && row.outputPath && (
                      <button
                        type="button"
                        aria-label={t("cOpenFolder")}
                        title={t("cOpenFolder")}
                        onClick={() =>
                          void action(() => shell.reveal(row.outputPath))
                        }
                      >
                        <FolderOpen size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={t("cRemoveRecord")}
                      title={t("cRemoveRecord")}
                      onClick={() => void action(() => remove(row.id))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        <div className="cvt-pagination">
          <button
            className="wb-secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t("cPrevious")}
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            className="wb-secondary"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t("cNext")}
          </button>
        </div>
      </section>
    </Drawer>
  );
}
