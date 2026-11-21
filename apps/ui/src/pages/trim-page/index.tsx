import { useEffect, useRef, useState, type DragEvent } from "react";
import { App, Drawer } from "antd";
import {
  Scissors,
  UploadCloud,
  FolderOpen,
  RotateCcw,
  Square,
  Trash2,
  RefreshCw,
  ShieldCheck,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LocalFileCheck } from "@mediago/shared-common";
import { getConversions } from "@/api/conversion";
import { useConversions } from "@/hooks/use-conversions";
import { usePlatform } from "@/hooks/use-platform";
import { useTrimWorkspace } from "@/store/trim-workspace";
import {
  filenameForPath,
  formatsForMode,
  getModeForFormat,
  isLosslessFormat,
} from "../converter-page/converter-model";
import {
  formatTrimTime,
  parseTrimTime,
  trimRangeError,
  updateTrimDraft,
  confirmTrimCreation,
  validTrimName,
  type TrimWorkspace,
} from "./trim-model";
import TrimPreview from "./trim-preview";
import TrimSegments from "./trim-segments";
import TrimBatchProgress from "./trim-batch-progress";
import { useMergeHandoff } from "../merge-page/use-merge-handoff";
import { useAudioHandoff } from "../converter-page/use-audio-handoff";
import "../converter-page/converter.css";
import "./trim.css";

export default function TrimPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { shell, dialog } = usePlatform();
  const { draft, busy, storageError, save } = useTrimWorkspace();
  const [file, setFile] = useState<LocalFileCheck>();
  const [reading, setReading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [checked, setChecked] = useState(false);
  const [page, setPage] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<number[]>([]);
  const { send: sendToMerge, sending: sendingToMerge } = useMergeHandoff();
  const { send: sendAudio, sending: sendingAudio } = useAudioHandoff();
  const [progressRevision, setProgressRevision] = useState(0);
  const selectionEpoch = useRef(0);
  const {
    data,
    error,
    isLoading,
    mutate,
    addConversion,
    startConversion,
    stopConversion,
    deleteConversion,
  } = useConversions({ current: page, pageSize: 50, kind: "trim" });
  const media =
    file?.path === draft.path && file.available ? file.media : undefined;
  const known =
    !!media && media.durationMs > 0 && (media.hasVideo || media.hasAudio);
  const activeSegment =
    draft.segments.find((segment) => segment.id === draft.activeId) ||
    draft.segments[0];
  const rangeError = known
    ? draft.segments
        .map((segment) =>
          !validTrimName(segment.name.trim())
            ? "trInvalidName"
            : trimRangeError(segment.start, segment.end, media.durationMs),
        )
        .find(Boolean)
    : undefined;
  const wantsAudio = getModeForFormat(draft.format) === "audio";
  const trackMissing =
    known && (wantsAudio ? !media.hasAudio : !media.hasVideo);
  const folderMissing = draft.customDirectory && !draft.directory.trim();
  const locked = draft.locked;
  const disabled = busy || locked;
  const from = parseTrimTime(draft.start),
    to = parseTrimTime(draft.end);
  const valid =
    known &&
    !reading &&
    !rangeError &&
    !trackMissing &&
    !folderMissing &&
    !disabled;
  const hint = busy
    ? "trBusy"
    : locked
      ? "trUnknown"
      : !draft.path
        ? "trFileRequired"
        : reading
          ? "c11Checking"
          : !known
            ? "trReadFailed"
            : rangeError ||
              (trackMissing
                ? "trNoTrack"
                : folderMissing
                  ? "c09NeedFolder"
                  : "trPrecise");
  function edit(update: (current: TrimWorkspace) => TrimWorkspace) {
    if (
      useTrimWorkspace.getState().busy ||
      useTrimWorkspace.getState().draft.locked
    )
      return;
    if (!save(update)) message.error(t("c11StorageError"));
  }
  function change(patch: Partial<typeof draft> & { name?: string }) {
    if (
      useTrimWorkspace.getState().busy ||
      (useTrimWorkspace.getState().draft.locked && patch.locked !== false)
    )
      return;
    if (!save((current) => updateTrimDraft(current, patch)))
      message.error(t("c11StorageError"));
  }
  function presetRange(ms: number) {
    if (!media || disabled || reading) return;
    change({
      start: formatTrimTime(0),
      end: formatTrimTime(
        ms ? Math.min(ms, media.durationMs) : media.durationMs,
      ),
    });
  }
  useEffect(() => {
    const preventFileNavigation = (event: globalThis.DragEvent) => {
      if (Array.from(event.dataTransfer?.types || []).includes("Files"))
        event.preventDefault();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      selectionEpoch.current++;
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setFile(undefined);
    setChecked(false);
    if (!draft.path) {
      setReading(false);
      return;
    }
    setReading(true);
    void shell
      .checkFiles([draft.path], true)
      .then((files) => {
        if (cancelled) return;
        const result = files[0];
        setFile(result);
        const info = result?.media;
        if (result?.available && info && info.durationMs > 0) {
          save((current) => {
            if (
              current.path !== result.path ||
              current.locked ||
              useTrimWorkspace.getState().busy
            )
              return current;
            const audio = getModeForFormat(current.format) === "audio";
            const format = (audio ? info.hasAudio : info.hasVideo)
              ? current.format
              : info.hasVideo
                ? "mp4"
                : "mp3";
            return updateTrimDraft(current, {
              end: current.end || formatTrimTime(info.durationMs),
              format,
            });
          });
        }
      })
      .catch(() => {
        if (!cancelled) setFile(undefined);
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.path, refresh, shell, save]);
  async function choose() {
    const epoch = ++selectionEpoch.current;
    try {
      const paths = await dialog.open({ type: "file", multiple: false });
      if (
        paths?.[0] &&
        epoch === selectionEpoch.current &&
        !useTrimWorkspace.getState().busy &&
        !useTrimWorkspace.getState().draft.locked
      )
        change({ path: paths[0], start: "00:00:00.000", end: "" });
    } catch {
      message.error(t("cDropUnavailable"));
    }
  }
  async function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    const epoch = ++selectionEpoch.current;
    if (files.length > 1) message.info(t("trOneFile"));
    try {
      const path = await dialog.pathForDroppedFile(files[0]);
      if (
        path &&
        epoch === selectionEpoch.current &&
        !useTrimWorkspace.getState().busy &&
        !useTrimWorkspace.getState().draft.locked
      )
        change({ path, start: "00:00:00.000", end: "" });
    } catch {
      message.error(t("cDropUnavailable"));
    }
  }
  async function action(callback: () => Promise<unknown>) {
    try {
      await callback();
      setProgressRevision((revision) => revision + 1);
    } catch {
      message.error(t("cLoadError"));
    }
  }
  async function submit(startNow: boolean) {
    if (
      !valid ||
      useTrimWorkspace.getState().busy ||
      useTrimWorkspace.getState().draft.locked
    )
      return;
    const snapshot = {
      ...draft,
      segments: draft.segments.map((segment) => ({ ...segment })),
    };
    useTrimWorkspace.setState({ busy: true });
    try {
      const files = await shell.checkFiles([snapshot.path], true),
        current = files[0]?.media;
      if (!files[0]?.available || !current || current.durationMs <= 0) {
        setFile(files[0]);
        message.error(t("trReadFailed"));
        return;
      }
      const invalid = snapshot.segments
        .map((segment) =>
          !validTrimName(segment.name.trim())
            ? "trInvalidName"
            : trimRangeError(segment.start, segment.end, current.durationMs),
        )
        .find(Boolean);
      if (
        invalid ||
        (getModeForFormat(snapshot.format) === "audio"
          ? !current.hasAudio
          : !current.hasVideo)
      ) {
        setFile(files[0]);
        message.error(t(invalid || "trNoTrack"));
        return;
      }
      if (!save((value) => ({ ...value, locked: true, recentIds: [] }))) {
        message.error(t("c11StorageError"));
        return;
      }
      let startFailed = false;
      // Persist each acknowledgement before advancing. An uncertain item stays
      // in the locked draft; already acknowledged items can never be resubmitted.
      for (const segment of snapshot.segments) {
        const startMs = parseTrimTime(segment.start),
          endMs = parseTrimTime(segment.end);
        if (startMs === undefined || endMs === undefined) {
          message.error(t("trInvalidTime"));
          return;
        }
        let created;
        try {
          created = await addConversion({
            path: snapshot.path,
            name: segment.name.trim() || filenameForPath(snapshot.path),
            outputFormat: snapshot.format,
            quality: snapshot.quality,
            options: {
              version: 1,
              outputDir: snapshot.customDirectory
                ? snapshot.directory.trim()
                : undefined,
              trim: {
                startMs,
                endMs,
                ...(segment.name.trim() ? { name: segment.name.trim() } : {}),
              },
            },
          });
        } catch {
          setChecked(false);
          message.error(t("trUnknown"));
          return;
        }
        if (
          !save((value) => confirmTrimCreation(value, segment.id, created.id))
        ) {
          message.error(t("c11StorageError"));
          return;
        }
        setPage(1);
        if (startNow) {
          try {
            await startConversion(created.id);
          } catch {
            startFailed = true;
          } finally {
            setProgressRevision((revision) => revision + 1);
          }
        }
      }
      if (!save((value) => ({ ...value, locked: false })))
        message.error(t("c11StorageError"));
      setProgressRevision((revision) => revision + 1);
      if (startFailed) message.warning(t("cStartFailed"));
      else message.success(t("cAdded", { count: snapshot.segments.length }));
    } catch {
      message.error(t("trReadFailed"));
    } finally {
      useTrimWorkspace.setState({ busy: false });
    }
  }
  async function checkRecords() {
    try {
      await getConversions({ current: 1, pageSize: 50, kind: "trim" });
      setPage(1);
      await mutate();
      setChecked(true);
      setHistoryOpen(true);
    } catch {
      message.error(t("cLoadError"));
    }
  }
  async function chooseDirectory() {
    try {
      const paths = await dialog.open({ type: "directory" });
      if (paths?.[0]) change({ customDirectory: true, directory: paths[0] });
    } catch {
      message.error(t("c09NeedFolder"));
    }
  }
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 50));
  return (
    <div className="wb-page cvt-page trim-page" data-testid="trim-page">
      <header className="wb-page-heading">
        <div>
          <h1>{t("trTitle")}</h1>
          <p>{t("trSubtitle")}</p>
        </div>
        <div className="trim-page-tools">
          <button
            type="button"
            className="wb-secondary trim-history-toggle"
            data-testid="trim-history-toggle"
            aria-controls="trim-history-content"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen(true)}
          >
            <History size={16} />
            {t("trHistory")}
            <span>{data?.total || 0}</span>
          </button>
          <span className="cvt-local">
            <ShieldCheck size={16} />
            {t("cLocal")}
          </span>
        </div>
      </header>
      <TrimBatchProgress
        ids={draft.recentIds}
        revision={progressRevision}
        openHistory={() => setHistoryOpen(true)}
        action={action}
      />
      {storageError && (
        <p role="alert" className="cvt-error">
          {t("c11StorageError")}
        </p>
      )}
      <div className="cvt-workspace">
        <div className="cvt-body">
          <div className="cvt-left trim-left">
            <div
              className={`cvt-drop trim-drop${known ? " has-media" : ""}`}
              data-testid="trim-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => void drop(event)}
            >
              <span className="cvt-drop-icon">
                <UploadCloud size={22} />
              </span>
              <h2 title={draft.path}>
                {draft.path ? filenameForPath(draft.path) : t("trDrop")}
              </h2>
              <p title={draft.path}>{draft.path || t("trInspectHint")}</p>
              <div className="trim-source-actions">
                <button
                  type="button"
                  className="wb-secondary"
                  disabled={disabled}
                  data-testid="trim-choose"
                  onClick={() => void choose()}
                >
                  {t("cChoose")}
                </button>
                {draft.path && (
                  <>
                    <button
                      type="button"
                      className="wb-icon-button"
                      disabled={disabled || reading}
                      title={t("trRead")}
                      aria-label={t("trRead")}
                      data-testid="trim-read"
                      onClick={() => setRefresh((value) => value + 1)}
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      type="button"
                      className="wb-icon-button"
                      disabled={disabled}
                      title={t("cRemoveDraft")}
                      aria-label={t("cRemoveDraft")}
                      onClick={() =>
                        change({ path: "", end: "", start: "00:00:00.000" })
                      }
                    >
                      <X size={16} />
                    </button>
                  </>
                )}
              </div>
              <small data-testid="trim-source-info" role="status">
                {reading
                  ? t("c11Checking")
                  : known
                    ? `${t("trDuration")} ${formatTrimTime(media.durationMs)} · ${[media.hasVideo && t("trTrackVideo"), media.hasAudio && t("trTrackAudio")].filter(Boolean).join(" / ")}`
                    : draft.path
                      ? t("trReadFailed")
                      : t("trTypes")}
              </small>
              {known && (
                <TrimPreview
                  key={`${draft.path}-${refresh}`}
                  path={draft.path}
                  segmentId={draft.activeId}
                  hasVideo={media.hasVideo}
                  duration={media.durationMs}
                  start={draft.start}
                  end={draft.end}
                  disabled={disabled}
                  change={change}
                />
              )}
            </div>
            {known && (
              <div className="trim-range-preview" aria-label={t("trRange")}>
                <span>{formatTrimTime(0)}</span>
                <strong>
                  {t("trLength")}{" "}
                  {from !== undefined && to !== undefined && to > from
                    ? formatTrimTime(to - from)
                    : "—"}
                </strong>
                <span>{formatTrimTime(media.durationMs)}</span>
              </div>
            )}
            {locked && !busy && (
              <div
                className="cvt-uncertain"
                role="alert"
                data-testid="trim-unknown"
              >
                <p>{t("trUnknown")}</p>
                <div>
                  <button
                    type="button"
                    className="wb-secondary"
                    disabled={busy}
                    data-testid="trim-check-records"
                    onClick={() => void checkRecords()}
                  >
                    {t("cCheckRecords")}
                  </button>
                  <button
                    type="button"
                    className="wb-secondary"
                    disabled={busy || !checked}
                    data-testid="trim-unlock"
                    onClick={() => {
                      change({ locked: false });
                      setChecked(false);
                    }}
                  >
                    {t("cUnlock")}
                  </button>
                </div>
              </div>
            )}
          </div>
          <aside className="cvt-settings" aria-label={t("trOutput")}>
            <div className="cvt-settings-scroll">
              <div className="cvt-settings-heading">
                <div>
                  <h2>{t("trOutput")}</h2>
                  <p>{t("trPrecise")}</p>
                </div>
                <Scissors size={18} />
              </div>
              {known && (
                <TrimSegments
                  draft={draft}
                  duration={media.durationMs}
                  disabled={disabled || reading}
                  save={edit}
                />
              )}
              <div className="cvt-field trim-name-field">
                <label htmlFor="trim-segment-name">{t("trSegmentName")}</label>
                <input
                  id="trim-segment-name"
                  data-testid="trim-segment-name"
                  type="text"
                  maxLength={80}
                  disabled={disabled || !known || reading}
                  value={activeSegment.name}
                  placeholder={t("trNamePlaceholder")}
                  aria-invalid={!validTrimName(activeSegment.name.trim())}
                  aria-describedby="trim-name-help"
                  onChange={(event) => change({ name: event.target.value })}
                />
                <small
                  id="trim-name-help"
                  className={
                    !validTrimName(activeSegment.name.trim())
                      ? "cvt-error"
                      : "trim-hint"
                  }
                >
                  {t(
                    !validTrimName(activeSegment.name.trim())
                      ? "trInvalidName"
                      : "trNameHint",
                  )}
                </small>
              </div>
              <div className="trim-time-fields">
                {(["start", "end"] as const).map((field) => (
                  <div className="cvt-field" key={field}>
                    <label htmlFor={`trim-${field}`}>
                      {t(field === "start" ? "trStart" : "trEnd")}
                    </label>
                    <input
                      id={`trim-${field}`}
                      data-testid={`trim-${field}`}
                      type="text"
                      inputMode="decimal"
                      maxLength={32}
                      disabled={disabled || !known || reading}
                      value={draft[field]}
                      onChange={(event) =>
                        change({ [field]: event.target.value })
                      }
                      onBlur={() => {
                        const ms = parseTrimTime(draft[field]);
                        if (ms !== undefined)
                          change({ [field]: formatTrimTime(ms) });
                      }}
                      aria-invalid={!!rangeError}
                      aria-describedby="trim-time-help"
                    />
                  </div>
                ))}
              </div>
              <small id="trim-time-help" className="trim-hint">
                {t("trTimeHint")}
              </small>
              <div className="trim-shortcuts">
                {[10000, 30000, 0].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    className="wb-secondary"
                    disabled={disabled || !known || reading}
                    onClick={() => presetRange(ms)}
                  >
                    {t(
                      ms === 10000
                        ? "trFirst10"
                        : ms === 30000
                          ? "trFirst30"
                          : "trWhole",
                    )}
                  </button>
                ))}
              </div>
              <div className="cvt-field">
                <label htmlFor="trim-format">{t("cFormat")}</label>
                <div className="cvt-select">
                  <select
                    id="trim-format"
                    data-testid="trim-format"
                    value={draft.format}
                    disabled={disabled || !known || reading}
                    onChange={(event) => change({ format: event.target.value })}
                  >
                    {(["video", "audio"] as const).map((kind) => (
                      <optgroup
                        key={kind}
                        label={t(
                          kind === "video" ? "trTrackVideo" : "trTrackAudio",
                        )}
                      >
                        {formatsForMode(kind).map((format) => (
                          <option
                            key={format}
                            value={format}
                            disabled={
                              !media ||
                              (kind === "video"
                                ? !media.hasVideo
                                : !media.hasAudio)
                            }
                          >
                            {format.toUpperCase()}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </div>
              </div>
              <div className="cvt-field">
                <label>{t("cQuality")}</label>
                <div
                  className="cvt-quality"
                  role="group"
                  aria-label={t("cQuality")}
                >
                  {(["high", "medium", "low"] as const).map((quality) => (
                    <button
                      type="button"
                      key={quality}
                      disabled={disabled || isLosslessFormat(draft.format)}
                      aria-pressed={draft.quality === quality}
                      onClick={() => change({ quality })}
                    >
                      {t(
                        quality === "high"
                          ? "cHigh"
                          : quality === "medium"
                            ? "cMedium"
                            : "cLow",
                      )}
                    </button>
                  ))}
                </div>
                <small>
                  {t(
                    isLosslessFormat(draft.format)
                      ? "cLosslessHint"
                      : "cQualityHint",
                  )}
                </small>
              </div>
              <div className="cvt-field">
                <label htmlFor="trim-directory-mode">{t("cSave")}</label>
                <div className="cvt-select">
                  <select
                    id="trim-directory-mode"
                    data-testid="trim-directory-mode"
                    disabled={disabled}
                    value={draft.customDirectory ? "custom" : "source"}
                    onChange={(event) =>
                      change({
                        customDirectory: event.target.value === "custom",
                      })
                    }
                  >
                    <option value="source">{t("c09SourceFolder")}</option>
                    <option value="custom">{t("c09CustomFolder")}</option>
                  </select>
                  <ChevronDown size={16} />
                </div>
                {draft.customDirectory && (
                  <div className="cvt-folder-input">
                    <input
                      type="text"
                      data-testid="trim-output-directory"
                      aria-label={t("c09OutputFolder")}
                      disabled={disabled}
                      value={draft.directory}
                      onChange={(event) =>
                        change({ directory: event.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="wb-secondary"
                      disabled={disabled}
                      title={t("c09ChooseFolder")}
                      aria-label={t("c09ChooseFolder")}
                      onClick={() => void chooseDirectory()}
                    >
                      <FolderOpen size={16} />
                    </button>
                  </div>
                )}
              </div>
              <p className="trim-hint">
                <ShieldCheck size={14} />
                {t("cSafe")}
              </p>
            </div>
            <div className="cvt-actions">
              <button
                type="button"
                className="wb-primary"
                disabled={!valid}
                aria-describedby="trim-action-hint"
                data-testid="trim-start-now"
                onClick={() => void submit(true)}
              >
                <Scissors size={16} />
                {draft.segments.length > 1
                  ? t("trExportCount", { count: draft.segments.length })
                  : t("trExport")}
              </button>
              <button
                type="button"
                className="wb-secondary"
                disabled={!valid}
                aria-describedby="trim-action-hint"
                data-testid="trim-queue"
                onClick={() => void submit(false)}
              >
                {t("cQueue")}
              </button>
              <small id="trim-action-hint" role="status" aria-live="polite">
                {t(hint)}
              </small>
            </div>
          </aside>
        </div>
      </div>
      <Drawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        closable={false}
        size="min(560px, 100vw)"
        rootClassName="trim-history-drawer"
        title={
          <div className="trim-history-title">
            {t("trHistory")}
            <span>{data?.total || 0}</span>
          </div>
        }
        extra={
          <div className="trim-history-tools">
            <button
              type="button"
              className="wb-secondary"
              data-testid="trim-send-to-audio"
              disabled={
                sendingAudio ||
                !mergeSelection.some((id) =>
                  data?.list.some(
                    (row) =>
                      row.id === id && row.status === "done" && row.outputPath,
                  ),
                )
              }
              onClick={() =>
                void sendAudio(
                  mergeSelection.flatMap((id) => {
                    const row = data?.list.find(
                      (entry) =>
                        entry.id === id &&
                        entry.status === "done" &&
                        entry.outputPath,
                    );
                    return row ? [row.outputPath] : [];
                  }),
                )
              }
            >
              {t("axSend")}
              {mergeSelection.length > 0 && ` (${mergeSelection.length})`}
            </button>
            <button
              type="button"
              className="wb-icon-button"
              title={t("cReload")}
              aria-label={t("cReload")}
              onClick={() => void action(() => mutate())}
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              className="wb-icon-button"
              data-testid="trim-history-close"
              title={t("trCloseHistory")}
              aria-label={t("trCloseHistory")}
              onClick={() => setHistoryOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
        }
        styles={{
          body: {
            padding: 20,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          },
        }}
      >
        <section
          id="trim-history-content"
          className="trim-history-content"
          aria-label={t("trHistory")}
        >
          <div className="trim-history-tools">
            <button
              type="button"
              className="wb-secondary"
              data-testid="trim-send-to-merge"
              disabled={
                sendingToMerge ||
                !mergeSelection.some((id) =>
                  data?.list.some(
                    (row) =>
                      row.id === id && row.status === "done" && row.outputPath,
                  ),
                )
              }
              onClick={() =>
                void sendToMerge(
                  mergeSelection.flatMap((id) => {
                    const row = data?.list.find(
                      (entry) =>
                        entry.id === id &&
                        entry.status === "done" &&
                        entry.outputPath,
                    );
                    return row ? [row.outputPath] : [];
                  }),
                )
              }
            >
              {t("mgSend")}{" "}
              {mergeSelection.length > 0 && `(${mergeSelection.length})`}
            </button>
          </div>
          <div className="cvt-list trim-records" data-testid="trim-records">
            {(isLoading || error) && (
              <p role="status">{t(error ? "cLoadError" : "cLoading")}</p>
            )}
            {!isLoading && !error && !data?.list?.length && (
              <div className="cvt-empty">
                <Scissors size={30} />
                <p>{t("trHistoryEmpty")}</p>
              </div>
            )}
            {data?.list?.map((row) => (
              <article
                key={row.id}
                className="cvt-row"
                data-testid={`trim-record-${row.id}`}
              >
                <input
                  type="checkbox"
                  aria-label={`${t("mgSend")} · ${row.name || filenameForPath(row.path)}`}
                  disabled={
                    sendingToMerge ||
                    row.status !== "done" ||
                    !row.outputPath ||
                    (!mergeSelection.includes(row.id) &&
                      mergeSelection.length >= 20)
                  }
                  checked={mergeSelection.includes(row.id)}
                  onChange={(event) =>
                    setMergeSelection((ids) =>
                      event.target.checked
                        ? [...ids, row.id]
                        : ids.filter((id) => id !== row.id),
                    )
                  }
                />
                <span className="cvt-file-icon">
                  <Scissors size={18} />
                </span>
                <div className="cvt-file-info">
                  <strong title={row.path}>
                    {row.name || filenameForPath(row.path)}
                  </strong>
                  <span>
                    {row.options?.trim
                      ? t("trRangeSummary", {
                          start: formatTrimTime(row.options.trim.startMs),
                          end: formatTrimTime(row.options.trim.endMs),
                        })
                      : ""}{" "}
                    · {row.outputFormat.toUpperCase()}
                  </span>
                  <span title={row.outputPath || row.path}>
                    {row.outputPath || row.path}
                  </span>
                  {row.error && <span className="cvt-error">{row.error}</span>}
                  {row.status === "converting" && (
                    <div className="cvt-progress">
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(0, row.progress || 0))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <span className={`cvt-status is-${row.status}`}>
                  {t(
                    row.status === "pending"
                      ? "trQueued"
                      : row.status === "converting"
                        ? "trRunning"
                        : row.status === "done"
                          ? "cDone"
                          : row.status === "failed"
                            ? "cFailed"
                            : "cUnknown",
                  )}
                  {row.status === "converting" && ` ${row.progress || 0}%`}
                </span>
                <div className="cvt-row-actions">
                  {row.status === "converting" ? (
                    <button
                      type="button"
                      title={t("cStop")}
                      aria-label={t("cStop")}
                      onClick={() => void action(() => stopConversion(row.id))}
                    >
                      <Square size={15} />
                    </button>
                  ) : (
                    <>
                      {["pending", "failed"].includes(row.status) && (
                        <button
                          type="button"
                          title={t(
                            row.status === "failed" ? "cRetry" : "cStartTask",
                          )}
                          aria-label={t(
                            row.status === "failed" ? "cRetry" : "cStartTask",
                          )}
                          onClick={() =>
                            void action(() => startConversion(row.id))
                          }
                        >
                          <RotateCcw size={15} />
                        </button>
                      )}
                      {row.status === "done" && row.outputPath && (
                        <button
                          type="button"
                          title={t("cOpenFolder")}
                          aria-label={t("cOpenFolder")}
                          onClick={() =>
                            void action(() => shell.reveal(row.outputPath))
                          }
                        >
                          <FolderOpen size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        title={t("cRemoveRecord")}
                        aria-label={t("cRemoveRecord")}
                        onClick={() =>
                          void action(() => deleteConversion(row.id))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          {pages > 1 && (
            <div className="cvt-pagination">
              <button
                type="button"
                disabled={page <= 1}
                aria-label={t("cPrevious")}
                onClick={() => {
                  setMergeSelection([]);
                  setPage(page - 1);
                }}
              >
                <ChevronLeft size={15} />
              </button>
              <span>{t("cPage", { current: page, pages })}</span>
              <button
                type="button"
                disabled={page >= pages}
                aria-label={t("cNext")}
                onClick={() => {
                  setMergeSelection([]);
                  setPage(page + 1);
                }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </section>
      </Drawer>
    </div>
  );
}
