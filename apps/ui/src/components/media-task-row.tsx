import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type KeyboardEvent,
} from "react";
import { App, Dropdown, Modal } from "antd";
import { Tooltip } from "@/components/tooltip";
import { BrandCheck } from "@/components/brand-marks";
import { NcProgress } from "@/components/nc-progress";
import { useTaskStatusMotion } from "@/hooks/use-task-status-motion";
import {
  Copy,
  FileImage,
  FileMusic,
  FileVideo,
  MoreHorizontal,
  Play,
  RefreshCw,
  RotateCw,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DownloadTaskWithFile } from "@mediago/shared-common";
import {
  getDownloadLog,
  startDownload,
  stopDownload,
} from "@/api/download-task";
import { useDownloadStore } from "@/store/download";
import { usePlatform } from "@/hooks/use-platform";
import { isWeb } from "@/utils";
import { canRemove, canStart } from "@/pages/tasks-page/task-selection";
import { TaskThumbnail } from "./task-thumbnail";
import { conversionModes } from "@/pages/converter-page/converter-workspace";
import type { ConversionMode } from "@/pages/converter-page/converter-model";
import "./media-task-row.css";

interface Props {
  task: DownloadTaskWithFile;
  refresh: () => unknown;
  compact?: boolean;
  selected?: boolean;
  onSelect?: (
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  ) => void;
  onToggle?: () => void;
  onContext?: () => void;
  onRemove?: () => void;
  onConvert?: (mode: ConversionMode) => void;
  onTrim?: () => void;
}

export function MediaTaskRow({
  task,
  refresh,
  compact,
  selected,
  onSelect,
  onToggle,
  onContext,
  onRemove,
  onConvert,
  onTrim,
}: Props) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { shell } = usePlatform();
  const live = useDownloadStore((state) =>
    state.eventsMap.get(String(task.id)),
  );
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [logs, setLogs] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");
  const logRequest = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      logRequest.current?.abort();
    },
    [task.id],
  );
  const status = task.status || "ready";
  const rowRef = useRef<HTMLDivElement>(null);
  useTaskStatusMotion(rowRef, status, task.id);
  const active = status === "downloading" || status === "pending";
  const mode =
    task.options?.mode ||
    (/\.(mp3|m4a|opus|wav|aac)$/i.test(task.name)
      ? "audio"
      : /\.(png|jpg|jpeg|webp)$/i.test(task.name)
        ? "cover"
        : "video");
  const Icon =
    mode === "audio"
      ? FileMusic
      : mode === "cover" || mode === "image"
        ? FileImage
        : FileVideo;
  const lastProgress = useRef<{ id: number; status: string; value?: number }>({
    id: task.id,
    status,
  });
  const parsedMeasurement = live ? Number(live.percent) : undefined;
  const measurement = Number.isFinite(parsedMeasurement)
    ? parsedMeasurement
    : undefined;
  useEffect(() => {
    // Active polling contains only active tasks. Another download can therefore
    // remove a stopped task's entry without invalidating its last measurement.
    const before = lastProgress.current;
    const newRun =
      ["pending", "downloading"].includes(status) &&
      !["pending", "downloading"].includes(before.status);
    const reset = before.id !== task.id || newRun || status === "ready";
    lastProgress.current = {
      id: task.id,
      status,
      value:
        status === "downloading" && measurement !== undefined
          ? measurement
          : reset
            ? undefined
            : before.value,
    };
  }, [measurement, status, task.id]);
  const measuredPercent =
    measurement ??
    (status === "stopped" && lastProgress.current.id === task.id
      ? lastProgress.current.value
      : undefined);
  const percent = Math.max(0, Math.min(100, measuredPercent || 0));
  const source =
    task.options?.source ||
    (() => {
      try {
        return new URL(task.url).hostname.replace(/^www\./, "");
      } catch {
        return task.type;
      }
    })();
  const output = task.file || task.outputPath || "";
  async function run(action: () => Promise<unknown>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("v4TaskError"),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function showLogs() {
    logRequest.current?.abort();
    const controller = new AbortController();
    logRequest.current = controller;
    setLogs((current) => current ?? "");
    setLogsLoading(true);
    setLogsError("");
    try {
      const value = await getDownloadLog(task.id, controller.signal);
      if (controller.signal.aborted) return;
      setLogs(
        value.log
          .replace(/\p{Cc}\[[0-9;?]*[a-zA-Z]/gu, "")
          .replace(/\p{Cc}\][^\p{Cc}]*\p{Cc}/gu, ""),
      );
    } catch (reason) {
      if (!controller.signal.aborted)
        setLogsError(
          reason instanceof Error ? reason.message : t("v4TaskError"),
        );
    } finally {
      if (!controller.signal.aborted) setLogsLoading(false);
    }
  }
  function closeLogs() {
    logRequest.current?.abort();
    logRequest.current = null;
    setLogs(null);
    setLogsLoading(false);
    setLogsError("");
  }
  async function copyLogs() {
    try {
      await navigator.clipboard.writeText(logs || "");
      message.success(t("u11CopiedLogs"));
    } catch {
      message.error(t("u11CopyFailed"));
    }
  }
  const items = [
    ...(onTrim
      ? [
          {
            key: "trim",
            label: t("trSendToTrim"),
            disabled:
              isWeb ||
              status !== "success" ||
              !task.exists ||
              !output ||
              mode === "cover" ||
              mode === "image",
          },
        ]
      : []),
    ...(onConvert
      ? [
          {
            key: "convert",
            label: t("c11SendToConverter"),
            disabled: isWeb || status !== "success" || !task.exists || !output,
            children: conversionModes.map((targetMode) => ({
              key: "convert-" + targetMode,
              label: t(
                targetMode === "video"
                  ? "cVideo"
                  : targetMode === "audio"
                    ? "cAudio"
                    : "cImage",
              ),
            })),
          },
        ]
      : []),
    {
      key: "open",
      label: t("v4OpenFile"),
      disabled: isWeb || !task.exists || !output,
    },
    {
      key: "locate",
      label: t("v4Locate"),
      disabled: isWeb || !task.exists || !output,
    },
    { key: "copy", label: t("v4CopySource") },
    { key: "logs", label: t("v4Logs") },
    ...(onRemove
      ? [
          {
            key: "remove",
            label: t("v4Remove"),
            danger: true,
            disabled: !canRemove(status),
          },
        ]
      : []),
  ];
  return (
    <>
      <div
        ref={rowRef}
        className={
          "v4-task-row" +
          (compact ? " is-compact" : "") +
          (selected ? " is-selected" : "")
        }
        data-testid={"task-" + task.id}
        data-nc-list-key={task.id}
        data-task-status={status}
        onClick={onSelect}
        onContextMenu={onContext}
        tabIndex={onSelect ? 0 : undefined}
        onKeyDown={(event) => {
          if (onSelect && (event.key === " " || event.key === "Enter")) {
            event.preventDefault();
            onSelect(event);
          }
        }}
      >
        {onToggle && (
          <input
            className="v4-task-checkbox"
            type="checkbox"
            aria-label={task.name}
            checked={!!selected}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onChange={onToggle}
          />
        )}
        <TaskThumbnail
          task={task}
          compact={compact}
          fallback={<Icon size={22} />}
        />
        <div className="v4-task-title">
          <strong title={task.name}>{task.name}</strong>
          <span title={task.url}>
            {source} · {t("v4Mode_" + mode)}
            {task.options?.audioFormat === "mp3" ? " · MP3" : ""}
          </span>
          {task.options?.saveDir && !compact && (
            <small title={task.options.saveDir}>{task.options.saveDir}</small>
          )}
          {status === "success" && !task.exists && (
            <small className="wb-error-text">{t("v4MissingFile")}</small>
          )}
        </div>
        <div className={"v4-task-status status-" + status}>
          <span>
            {status === "success" && (
              <BrandCheck width={14} height={14} data-nc-completion="true" />
            )}{" "}
            {t("v4Status_" + status)}
          </span>
          {["downloading", "pending", "stopped"].includes(status) && (
            <>
              <NcProgress
                state={status === "stopped" ? "paused" : "active"}
                value={percent > 0 && percent < 100 ? percent : undefined}
                label={task.name}
              />
              <small>
                {percent > 0 && percent < 100 ? percent.toFixed(1) + "%" : ""}
                {live?.speed
                  ? " · " + live.speed
                  : percent >= 100
                    ? t("v4Indeterminate")
                    : ""}
              </small>
            </>
          )}
        </div>
        <div
          className="v4-task-actions"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Tooltip
            title={t(
              active
                ? "v4Stop"
                : status === "success"
                  ? "v4OpenFile"
                  : status === "failed"
                    ? "v4Retry"
                    : "v4Start",
            )}
          >
            <button
              type="button"
              className="wb-icon-button"
              aria-label={t(
                active
                  ? "v4Stop"
                  : status === "success"
                    ? "v4OpenFile"
                    : status === "failed"
                      ? "v4Retry"
                      : "v4Start",
              )}
              disabled={
                busy ||
                (status === "success" && (isWeb || !task.exists || !output)) ||
                (!active && status !== "success" && !canStart(status))
              }
              onClick={() =>
                void run(() =>
                  active
                    ? stopDownload(task.id)
                    : status === "success"
                      ? shell.open(output)
                      : startDownload(task.id),
                )
              }
            >
              {active ? (
                <Square size={16} />
              ) : status === "success" ? (
                <Play size={18} />
              ) : status === "failed" ? (
                <RotateCw size={17} />
              ) : (
                <Play size={17} />
              )}
            </button>
          </Tooltip>
          <Dropdown
            trigger={["click"]}
            menu={{
              items,
              onClick: ({ key }) => {
                if (key.startsWith("convert-"))
                  onConvert?.(key.slice(8) as ConversionMode);
                else if (key === "trim") onTrim?.();
                else if (key === "logs") void showLogs();
                else if (key === "remove") onRemove?.();
                else
                  void run(async () => {
                    if (key === "copy") {
                      await navigator.clipboard.writeText(task.url);
                      message.success(t("v4Copied"));
                    } else if (key === "locate") await shell.reveal(output);
                    else await shell.open(output);
                  });
              },
            }}
          >
            <button
              type="button"
              className="wb-icon-button"
              aria-label={t("v4TaskDetails")}
              disabled={busy}
            >
              <MoreHorizontal size={19} />
            </button>
          </Dropdown>
        </div>
      </div>
      <Modal
        title={t("v4TaskDetails")}
        open={logs !== null}
        onCancel={closeLogs}
        footer={null}
        width={760}
      >
        <h3 className="v4-log-title">{task.name}</h3>
        {task.options && (
          <p className="v4-field-hint">
            {t("v4Mode_" + mode)} ·{" "}
            {task.options.formatId ||
              task.options.audioFormat ||
              t("v4BestAvailable")}
          </p>
        )}
        <div className="v4-log-actions">
          <span role="status" aria-live="polite">
            {logsLoading ? t("wbLoading") : ""}
          </span>
          <button
            type="button"
            className="wb-secondary"
            data-testid="task-log-refresh"
            disabled={logsLoading}
            onClick={() => void showLogs()}
          >
            <RefreshCw size={15} />
            {t("refresh")}
          </button>
          <button
            type="button"
            className="wb-secondary"
            data-testid="task-log-copy"
            disabled={logsLoading || !!logsError || !logs}
            onClick={() => void copyLogs()}
          >
            <Copy size={15} />
            {t("u11CopyLogs")}
          </button>
        </div>
        {logsError && (
          <p className="wb-error-text" role="alert">
            {logsError}
          </p>
        )}
        <pre
          className="v4-task-log"
          data-testid="task-log"
          tabIndex={0}
          aria-busy={logsLoading}
        >
          {logs || (!logsLoading && !logsError ? t("v4NoLogs") : "")}
        </pre>
      </Modal>
    </>
  );
}
