import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useId, useRef, useState } from "react";
import { App, Dropdown } from "antd";
import useSWR, { useSWRConfig } from "swr";
import { useTranslation } from "react-i18next";
import { DownloadFilter, DownloadType } from "@mediago/shared-common";
import {
  Play,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Scissors,
} from "lucide-react";
import {
  getDownloadTasks,
  startDownload,
  stopDownload,
  deleteDownloadTask,
} from "@/api/download-task";
import { useAppStore } from "@/store/app";
import { useMediaTaskEvents } from "@/hooks/use-media-task-events";
import { useListMotion } from "@/hooks/use-list-motion";
import { useUrlInvoke } from "@/hooks/use-url-invoke";
import DownloadForm, { type DownloadFormRef } from "@/components/download-form";
import { MediaTaskRow } from "@/components/media-task-row";
import { canRemove, canStart, selectTaskIds } from "./task-selection";
import { usePlatform } from "@/hooks/use-platform";
import { isWeb } from "@/utils";
import { useConverterWorkspace } from "@/store/converter-workspace";
import {
  appendConverterDraft,
  conversionModes,
} from "../converter-page/converter-workspace";
import type { ConversionMode } from "../converter-page/converter-model";
import { useTrimWorkspace } from "@/store/trim-workspace";
import { resetTrimSource } from "../trim-page/trim-model";
import { useAudioHandoff } from "../converter-page/use-audio-handoff";
import { audioInputIssue } from "../converter-page/audio-model";

export default function TasksPage({
  filter = DownloadFilter.list,
}: {
  filter?: DownloadFilter;
}) {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { shell } = usePlatform();
  const { send: sendAudio, sending: sendingAudio } = useAudioHandoff();
  const { mutate: mutateCache } = useSWRConfig();
  const local = useAppStore((state) => state.local);
  const [params] = useSearchParams();
  const [input, setInput] = useState(params.get("search") || "");
  const [search, setSearch] = useState(params.get("search") || "");
  useEffect(() => {
    setInput(params.get("search") || "");
  }, [params]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const anchor = useRef<number | undefined>(undefined);
  const contextIds = useRef<number[]>([]);
  const transferGeneration = useRef(0);
  const form = useRef<DownloadFormRef>(null);
  const id = useId();
  const { data, error, isLoading, mutate } = useSWR(
    ["media-tasks", filter, page, pageSize, search, status, local],
    () => getDownloadTasks({ current: page, pageSize, filter, search, status }),
  );
  useMediaTaskEvents(mutate);
  useUrlInvoke({
    onOpenForm: (item) => form.current?.openModal(item),
    refresh: () => {
      void mutate();
    },
  });
  const tasks = data?.list || [];
  const ids = tasks.map((task) => task.id);
  const listRef = useRef<HTMLDivElement>(null);
  useListMotion(
    listRef,
    ids,
    JSON.stringify([filter, page, pageSize, search, status, local]),
  );
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(input.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [input]);
  useEffect(() => {
    setPage(1);
    setStatus("");
    setSelected([]);
    return () => {
      transferGeneration.current++;
    };
  }, [filter]);
  useEffect(() => {
    setSelected((current) => current.filter((value) => ids.includes(value)));
  }, [data]);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [pages, page]);
  async function refresh() {
    await mutateCache(
      (key) =>
        Array.isArray(key) &&
        (key[0] === "media-tasks" || key[0] === "workbench-recent"),
    );
  }
  async function run(idsToUse: number[], action: "start" | "stop" | "remove") {
    if (running.current) return;
    const targets = tasks.filter(
      (task) =>
        idsToUse.includes(task.id) &&
        (action === "start"
          ? canStart(task.status)
          : action === "remove"
            ? canRemove(task.status)
            : !canRemove(task.status)),
    );
    if (!targets.length) {
      message.info(t("v4RemoveBlocked"));
      return;
    }
    running.current = true;
    setBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map((task) =>
          action === "start"
            ? startDownload(task.id)
            : action === "stop"
              ? stopDownload(task.id)
              : deleteDownloadTask(task.id),
        ),
      );
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length) {
        message.error(
          t("v4ActionError", { count: failed.length }) +
            " · " +
            String((failed[0] as PromiseRejectedResult).reason?.message || ""),
        );
      }
      setSelected([]);
      await refresh();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function remove(idsToUse: number[]) {
    const removable = tasks.filter(
      (task) => idsToUse.includes(task.id) && canRemove(task.status),
    );
    if (!removable.length) {
      message.info(t("v4RemoveBlocked"));
      return;
    }
    modal.confirm({
      title: t("v4RemoveTitle"),
      content: t("v4RemoveHint", { count: removable.length }),
      okText: t("v4Remove"),
      okButtonProps: { danger: true },
      onOk: () =>
        run(
          removable.map((task) => task.id),
          "remove",
        ),
    });
  }
  async function sendToConverter(idsToUse: number[], mode: ConversionMode) {
    if (running.current) return;
    if (
      useConverterWorkspace.getState().submitting ||
      useConverterWorkspace.getState().workspace.submission !== "idle"
    ) {
      message.warning(t("c11Locked"));
      return;
    }
    const targets = tasks
      .filter(
        (task) =>
          idsToUse.includes(task.id) &&
          task.status === "success" &&
          task.exists &&
          (task.file || task.outputPath),
      )
      .slice(0, 20);
    if (!targets.length) {
      message.warning(t("c11NoFiles"));
      return;
    }
    running.current = true;
    setBusy(true);
    const ticket = ++transferGeneration.current;
    try {
      const files = await shell.checkFiles(
        targets.map((task) => task.file || task.outputPath || ""),
        mode === "audio",
      );
      if (ticket !== transferGeneration.current) return;
      const store = useConverterWorkspace.getState();
      if (store.submitting || store.workspace.submission !== "idle") {
        message.warning(t("c11Locked"));
        return;
      }
      const result = appendConverterDraft(
        store.workspace,
        mode,
        files
          .filter(
            (file) =>
              file.available &&
              (mode !== "audio" ||
                !audioInputIssue(
                  file,
                  store.workspace.formats.audio === "original",
                )),
          )
          .map((file) => file.path),
      );
      const added = result.paths.length - store.workspace.drafts[mode].length;
      if (!added) {
        message.warning(t("c11NoFiles"));
        return;
      }
      if (!store.save(() => result.workspace)) {
        message.error(t("c11StorageError"));
        return;
      }
      message.success(t("c11Sent", { count: added }));
      if (idsToUse.length > added)
        message.warning(t("c11Skipped", { count: idsToUse.length - added }));
      navigate("/converter");
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("c11CheckFailed"),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function sendToTrim(idsToUse: number[]) {
    if (running.current) return;
    const target = tasks.find((task) => idsToUse.includes(task.id));
    if (
      idsToUse.length !== 1 ||
      !target ||
      target.status !== "success" ||
      !target.exists ||
      !(target.file || target.outputPath)
    ) {
      message.warning(t("trOneCompleted"));
      return;
    }
    if (
      useTrimWorkspace.getState().busy ||
      useTrimWorkspace.getState().draft.locked
    ) {
      message.warning(t("trTransferLocked"));
      return;
    }
    const ticket = ++transferGeneration.current;
    running.current = true;
    setBusy(true);
    try {
      const [file] = await shell.checkFiles(
        [target.file || target.outputPath || ""],
        true,
      );
      if (ticket !== transferGeneration.current) return;
      if (
        !file?.available ||
        !file.media ||
        file.media.durationMs <= 0 ||
        !(file.media.hasVideo || file.media.hasAudio)
      ) {
        message.warning(t("trReadFailed"));
        return;
      }
      const before = useTrimWorkspace.getState().draft;
      if (before.locked || useTrimWorkspace.getState().busy) {
        message.warning(t("trTransferLocked"));
        return;
      }
      if (before.path && before.path !== file.path) {
        const replace = await new Promise<boolean>((resolve) =>
          modal.confirm({
            title: t("trReplaceTitle"),
            content: t("trReplaceHint"),
            okText: t("trReplace"),
            cancelText: t("cancel"),
            onOk: () => {
              resolve(true);
            },
            onCancel: () => {
              resolve(false);
            },
          }),
        );
        if (!replace || ticket !== transferGeneration.current) return;
      }
      const store = useTrimWorkspace.getState();
      if (store.busy || store.draft.locked) {
        message.warning(t("trTransferLocked"));
        return;
      }
      if (store.draft !== before) {
        message.warning(t("trDraftChanged"));
        return;
      }
      if (
        before.path !== file.path &&
        !store.save((draft) => resetTrimSource(draft, file.path))
      ) {
        message.error(t("c11StorageError"));
        return;
      }
      navigate("/trim");
      message.success(t("trSentToTrim"));
    } catch {
      message.error(t("c11CheckFailed"));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const conversionMenu = conversionModes.map((mode) => ({
    key: "convert-" + mode,
    label: t(
      mode === "video" ? "cVideo" : mode === "audio" ? "cAudio" : "cImage",
    ),
  }));
  const selectedTasks = tasks.filter((task) => selected.includes(task.id));
  const startCount = selectedTasks.filter((task) =>
    canStart(task.status),
  ).length;
  const stopCount = selectedTasks.filter(
    (task) => !canRemove(task.status),
  ).length;
  const removeCount = selectedTasks.filter((task) =>
    canRemove(task.status),
  ).length;
  const canBulkStart = startCount > 0;
  const canBulkStop = stopCount > 0;
  const canBulkRemove = removeCount > 0;
  return (
    <div className="wb-page v4-tasks-page" data-testid="tasks-page">
      <header className="wb-page-heading">
        <div>
          <h1>
            {t(
              filter === DownloadFilter.done
                ? "downloadComplete"
                : "downloadList",
            )}
          </h1>
          <p>{t("v4TasksHint")}</p>
        </div>
        <button
          className="wb-secondary"
          type="button"
          onClick={() =>
            form.current?.openModal({ batch: true, type: DownloadType.youtube })
          }
        >
          {t("v4Advanced")}
        </button>
      </header>
      <div className="v4-task-toolbar">
        <label className="v4-search">
          <Search size={18} />
          <input
            data-testid="task-search"
            placeholder={t("v4Search")}
            aria-label={t("v4Search")}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <select
          aria-label={t("v4AllStatuses")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("v4AllStatuses")}</option>
          {(filter === DownloadFilter.done
            ? ["success"]
            : ["ready", "pending", "downloading", "stopped", "failed"]
          ).map((value) => (
            <option key={value} value={value}>
              {t("v4Status_" + value)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="wb-icon-button"
          aria-label={t("v4Refresh")}
          onClick={() => void refresh()}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <div className="v4-bulk-toolbar">
        <label>
          <input
            type="checkbox"
            aria-label={t("v4SelectAll")}
            checked={
              !!ids.length && ids.every((value) => selected.includes(value))
            }
            ref={(node) => {
              if (node)
                node.indeterminate =
                  selected.length > 0 &&
                  !ids.every((value) => selected.includes(value));
            }}
            onChange={() =>
              setSelected(
                ids.every((value) => selected.includes(value)) ? [] : ids,
              )
            }
          />
          <span>
            {selected.length
              ? t("v4Selected", { count: selected.length })
              : t("v4Total", { count: total })}
          </span>
        </label>
        <div>
          {filter === DownloadFilter.done && !isWeb && (
            <button
              type="button"
              data-testid="send-to-trim"
              disabled={
                busy || selectedTasks.length !== 1 || !selectedTasks[0]?.exists
              }
              onClick={() => void sendToTrim(selected)}
            >
              <Scissors size={15} />
              {t("trSendToTrim")}
            </button>
          )}
          {filter === DownloadFilter.done && !isWeb && (
            <button
              type="button"
              className="wb-secondary"
              data-testid="send-to-audio"
              disabled={
                busy ||
                sendingAudio ||
                !selectedTasks.some(
                  (task) => task.status === "success" && task.exists,
                )
              }
              onClick={() =>
                void sendAudio(
                  selectedTasks
                    .filter((task) => task.status === "success" && task.exists)
                    .map((task) => task.file || task.outputPath || ""),
                )
              }
            >
              {t("axSend")}
            </button>
          )}
          {filter === DownloadFilter.done && !isWeb && (
            <Dropdown
              trigger={["click"]}
              menu={{
                items: conversionMenu,
                onClick: ({ key }) =>
                  void sendToConverter(
                    selected,
                    key.slice(8) as ConversionMode,
                  ),
              }}
            >
              <button
                type="button"
                disabled={
                  busy ||
                  !selectedTasks.some(
                    (task) => task.status === "success" && task.exists,
                  )
                }
                data-testid="send-to-converter"
              >
                <RefreshCw size={15} />
                {t("c11SendToConverter")}
              </button>
            </Dropdown>
          )}
          <button
            type="button"
            disabled={busy || !canBulkStart}
            onClick={() => void run(selected, "start")}
          >
            <Play size={15} />
            {t("v4Start")} {startCount > 0 && `(${startCount})`}
          </button>
          <button
            type="button"
            disabled={busy || !canBulkStop}
            onClick={() => void run(selected, "stop")}
          >
            <Square size={14} />
            {t("v4Stop")} {stopCount > 0 && `(${stopCount})`}
          </button>
          <button
            type="button"
            disabled={busy || !canBulkRemove}
            onClick={() => remove(selected)}
          >
            <Trash2 size={15} />
            {t("v4Remove")} {removeCount > 0 && `(${removeCount})`}
          </button>
          {selected.length > 0 && (
            <button type="button" onClick={() => setSelected([])}>
              {t("v4ClearSelection")}
            </button>
          )}
        </div>
      </div>
      <div
        ref={listRef}
        className="v4-task-list nc-list-motion"
        aria-label={t("downloadList")}
      >
        {isLoading && (
          <p className="v4-list-message" role="status">
            {t("wbLoading")}
          </p>
        )}
        {error && (
          <div className="wb-error" role="alert">
            {t("wbTasksError")}{" "}
            <button type="button" onClick={() => void mutate()}>
              {t("wbRetry")}
            </button>
          </div>
        )}
        {!isLoading && !error && !tasks.length && (
          <div className="v4-list-message">{t("v4NoResults")}</div>
        )}
        {tasks.map((task) => (
          <Dropdown
            key={task.id}
            trigger={["contextMenu"]}
            menu={{
              items: [
                ...(filter === DownloadFilter.done && !isWeb
                  ? [
                      {
                        key: "trim",
                        label: t("trSendToTrim"),
                        disabled:
                          busy ||
                          (selected.includes(task.id)
                            ? selected.length !== 1
                            : false) ||
                          task.status !== "success" ||
                          !task.exists,
                      },
                    ]
                  : []),
                ...(filter === DownloadFilter.done && !isWeb
                  ? [
                      {
                        key: "convert",
                        label: t("c11SendToConverter"),
                        disabled:
                          busy ||
                          !(
                            selected.includes(task.id) ? selectedTasks : [task]
                          ).some(
                            (item) => item.status === "success" && item.exists,
                          ),
                        children: conversionMenu,
                      },
                    ]
                  : []),
                {
                  key: "start",
                  label: t("v4Start"),
                  disabled:
                    busy ||
                    !(selected.includes(task.id)
                      ? canBulkStart
                      : canStart(task.status)),
                },
                {
                  key: "stop",
                  label: t("v4Stop"),
                  disabled:
                    busy ||
                    !(selected.includes(task.id)
                      ? canBulkStop
                      : !canRemove(task.status)),
                },
                {
                  key: "remove",
                  label: t("v4Remove"),
                  danger: true,
                  disabled:
                    busy ||
                    !(selected.includes(task.id)
                      ? canBulkRemove
                      : canRemove(task.status)),
                },
              ],
              onClick: ({ key }) => {
                if (key.startsWith("convert-"))
                  void sendToConverter(
                    contextIds.current,
                    key.slice(8) as ConversionMode,
                  );
                else if (key === "trim") void sendToTrim(contextIds.current);
                else if (key === "remove") remove(contextIds.current);
                else void run(contextIds.current, key as "start" | "stop");
              },
            }}
          >
            <div
              onContextMenu={() => {
                contextIds.current = selected.includes(task.id)
                  ? selected
                  : [task.id];
                setSelected(contextIds.current);
              }}
            >
              <MediaTaskRow
                task={task}
                selected={selected.includes(task.id)}
                refresh={refresh}
                onTrim={
                  filter === DownloadFilter.done && !isWeb
                    ? () =>
                        void sendToTrim(
                          selected.includes(task.id) ? selected : [task.id],
                        )
                    : undefined
                }
                onConvert={
                  filter === DownloadFilter.done && !isWeb
                    ? (mode) =>
                        void sendToConverter(
                          selected.includes(task.id) ? selected : [task.id],
                          mode,
                        )
                    : undefined
                }
                onSelect={(event) => {
                  setSelected(
                    selectTaskIds(
                      selected,
                      ids,
                      task.id,
                      event,
                      anchor.current,
                    ),
                  );
                  if (!event.shiftKey) anchor.current = task.id;
                }}
                onToggle={() => {
                  setSelected((current) =>
                    current.includes(task.id)
                      ? current.filter((value) => value !== task.id)
                      : [...current, task.id],
                  );
                  anchor.current = task.id;
                }}
                onRemove={() =>
                  remove(selected.includes(task.id) ? selected : [task.id])
                }
              />
            </div>
          </Dropdown>
        ))}
      </div>
      <footer className="v4-pagination">
        <span>{t("v4Total", { count: total })}</span>
        <select
          aria-label={t("v4PageSize")}
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
        >
          {[20, 50, 100].map((value) => (
            <option key={value} value={value}>
              {value} / {t("v4Page")}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="wb-secondary"
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          {t("v4Previous")}
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          type="button"
          className="wb-secondary"
          disabled={page >= pages}
          onClick={() => setPage((value) => value + 1)}
        >
          {t("v4Next")}
        </button>
      </footer>
      <DownloadForm
        id={id}
        ref={form}
        destroyOnClose
        onConfirm={() => void refresh()}
      />
    </div>
  );
}
