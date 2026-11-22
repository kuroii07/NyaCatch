import { useEffect, useRef, useState, type DragEvent } from "react";
import { App } from "antd";
import {
  Camera,
  Film,
  FolderOpen,
  History,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LocalFileCheck } from "@mediago/shared-common";
import { getConversions } from "@/api/conversion";
import { useConversions } from "@/hooks/use-conversions";
import { usePlatform } from "@/hooks/use-platform";
import {
  MediaSourceEmpty,
  SourceRemoveButton,
} from "@/components/media-source-controls";
import { useCaptureWorkspace } from "@/store/capture-workspace";
import {
  filenameForPath,
  canSelectVideoSize,
  videoSizeLimit,
} from "../converter-page/converter-model";
import { formatTrimTime, parseTrimTime } from "../trim-page/trim-model";
import TrimPreview from "../trim-page/trim-preview";
import TrimBatchProgress from "../trim-page/trim-batch-progress";
import MergeHistory from "../merge-page/merge-history";
import {
  captureRange,
  captureVideo,
  captureFrameRates,
  captureSizes,
  captureSizeLabel,
  type CaptureDraft,
} from "./capture-model";
import "../converter-page/converter.css";
import "../trim-page/trim.css";
import "../merge-page/merge.css";
import "./capture.css";

export default function CapturePage() {
  const { t } = useTranslation(),
    { message } = App.useApp(),
    { shell, dialog } = usePlatform();
  const { draft, busy, storageError, save } = useCaptureWorkspace();
  const [file, setFile] = useState<LocalFileCheck>(),
    [reading, setReading] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1),
    [historyOpen, setHistoryOpen] = useState(false),
    [checked, setChecked] = useState(false),
    [revision, setRevision] = useState(0);
  const [position, setPosition] = useState(0),
    [previewReady, setPreviewReady] = useState(false),
    [time, setTime] = useState(formatTrimTime(0)),
    [seekTo, setSeekTo] = useState<{ ms: number; revision: number }>();
  const generation = useRef(0),
    cancelInspection = useRef<(() => void) | undefined>(undefined),
    adding = useRef(false),
    positionRef = useRef<(() => number | undefined) | undefined>(undefined);
  const tasks = useConversions({
    current: page,
    pageSize: 50,
    kind: "capture",
  });
  const duration = file?.media?.durationMs || 0,
    disabled = busy || draft.locked;
  const validSource = captureVideo(file);
  const sizeLimit = videoSizeLimit([draft.path], file ? [file] : []);
  const hint = busy
    ? "mgBusy"
    : draft.locked
      ? "capUnknown"
      : reading
        ? "c11Checking"
        : !validSource
          ? "capNeedVideo"
          : draft.mode === "frame" && !previewReady
            ? "capNeedPreview"
            : !captureRange(draft, duration, position)
              ? "capInvalidRange"
              : draft.customDirectory && !draft.directory.trim()
                ? "c09NeedFolder"
                : "capReady";
  const valid = hint === "capReady";
  function edit(patch: Partial<CaptureDraft>) {
    const state = useCaptureWorkspace.getState();
    if (state.busy || state.draft.locked) return;
    if (!save((value) => ({ ...value, ...patch })))
      message.error(t("capStorage"));
  }
  function removeSource() {
    const state = useCaptureWorkspace.getState();
    if (state.busy || state.draft.locked || adding.current || !state.draft.path)
      return;
    if (
      !save((value) => ({
        ...value,
        path: "",
        start: formatTrimTime(0),
        end: formatTrimTime(3000),
        name: "",
      }))
    ) {
      message.error(t("capStorage"));
      return;
    }
    generation.current++;
    cancelInspection.current?.();
    setReading(false);
    setFile(undefined);
    setPosition(0);
    setPreviewReady(false);
    setSeekTo(undefined);
    setTime(formatTrimTime(0));
    positionRef.current = undefined;
    setChecked(false);
  }
  useEffect(() => {
    const prevent = (event: globalThis.DragEvent) => {
      if (Array.from(event.dataTransfer?.types || []).includes("Files"))
        event.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      generation.current++;
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    // Removal invalidates a pending probe immediately, before effect cleanup.
    const cancel = () => {
      cancelled = true;
    };
    cancelInspection.current = cancel;
    setFile(undefined);
    setChecked(false);
    setPosition(0);
    setPreviewReady(false);
    setSeekTo(undefined);
    setTime(formatTrimTime(0));
    if (!draft.path) {
      setReading(false);
      return;
    }
    setReading(true);
    void shell
      .checkFiles([draft.path], true)
      .then((values) => {
        if (!cancelled) setFile(values[0]);
      })
      .catch(() => {
        if (!cancelled) setFile(undefined);
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });
    return cancel;
  }, [draft.path, refresh, shell]);
  useEffect(() => {
    if (
      disabled ||
      reading ||
      !validSource ||
      draft.mode !== "gif" ||
      canSelectVideoSize(draft.maxEdge, sizeLimit)
    )
      return;
    if (!save((current) => ({ ...current, maxEdge: 0 })))
      message.error(t("capStorage"));
  }, [
    disabled,
    reading,
    validSource,
    draft.mode,
    draft.maxEdge,
    sizeLimit,
    save,
    message,
    t,
  ]);
  async function add(paths: string[], epoch: number, snapshot: CaptureDraft) {
    if (epoch !== generation.current || !paths.length) return;
    if (paths.length !== 1) {
      message.warning(t("capOneFile"));
      return;
    }
    const values = await shell.checkFiles(paths, true);
    if (epoch !== generation.current) return;
    const state = useCaptureWorkspace.getState();
    if (state.busy || state.draft.locked || state.draft !== snapshot) {
      message.warning(t("mgDraftChanged"));
      return;
    }
    if (!captureVideo(values[0])) {
      message.error(t("capNeedVideo"));
      return;
    }
    edit({
      path: paths[0],
      start: formatTrimTime(0),
      end: formatTrimTime(Math.min(3000, values[0].media?.durationMs || 0)),
      name: "",
    });
  }
  async function choose() {
    if (disabled || adding.current) return;
    const epoch = ++generation.current,
      snapshot = useCaptureWorkspace.getState().draft;
    adding.current = true;
    setReading(true);
    try {
      const paths = await dialog.open({ type: "file", multiple: false });
      if (paths) await add(paths, epoch, snapshot);
    } catch {
      if (epoch === generation.current) message.error(t("cDropUnavailable"));
    } finally {
      adding.current = false;
      if (epoch === generation.current) setReading(false);
    }
  }
  async function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || adding.current || !event.dataTransfer.files.length) return;
    const native = Array.from(event.dataTransfer.files),
      epoch = ++generation.current,
      snapshot = useCaptureWorkspace.getState().draft;
    adding.current = true;
    setReading(true);
    try {
      const paths = await Promise.all(
        native.map((f) => dialog.pathForDroppedFile(f)),
      );
      if (paths.some((p) => !p)) throw Error("unavailable");
      await add(paths, epoch, snapshot);
    } catch {
      if (epoch === generation.current) message.error(t("cDropUnavailable"));
    } finally {
      adding.current = false;
      if (epoch === generation.current) setReading(false);
    }
  }
  async function action(callback: () => Promise<unknown>) {
    try {
      await callback();
      setRevision((v) => v + 1);
    } catch {
      message.error(t("cLoadError"));
    }
  }
  async function submit(startNow: boolean) {
    const state = useCaptureWorkspace.getState();
    if (!valid || state.busy || state.draft.locked || adding.current) return;
    const snapshot = state.draft,
      point = snapshot.mode === "frame" ? positionRef.current?.() : position;
    if (point === undefined) {
      message.warning(t("capNeedPreview"));
      return;
    }
    useCaptureWorkspace.setState({ busy: true });
    try {
      const current = (await shell.checkFiles([snapshot.path], true))[0],
        range = captureRange(snapshot, current?.media?.durationMs || 0, point);
      if (
        !captureVideo(current) ||
        !range ||
        (snapshot.mode === "gif" &&
          !canSelectVideoSize(
            snapshot.maxEdge,
            videoSizeLimit([snapshot.path], [current]),
          ))
      ) {
        setFile(current);
        message.error(t("capInvalidRange"));
        return;
      }
      if (!save((value) => ({ ...value, locked: true, recentIds: [] }))) {
        message.error(t("capStorage"));
        return;
      }
      setChecked(false);
      let created;
      try {
        created = await tasks.addConversion({
          name: snapshot.name.trim() || filenameForPath(snapshot.path),
          path: snapshot.path,
          outputFormat: snapshot.mode === "gif" ? "gif" : snapshot.format,
          quality: snapshot.quality,
          options: {
            version: 1,
            outputDir: snapshot.customDirectory
              ? snapshot.directory.trim()
              : undefined,
            maxEdge: snapshot.mode === "gif" ? snapshot.maxEdge : undefined,
            capture: range,
          },
        });
      } catch {
        message.error(t("capUnknown"));
        return;
      }
      // Keep the source for consecutive captures, but acknowledge before starting.
      if (
        !save((value) => ({ ...value, recentIds: [created.id], locked: false }))
      ) {
        message.error(t("capStorage"));
        return;
      }
      setPage(1);
      setRevision((v) => v + 1);
      if (startNow) {
        try {
          await tasks.startConversion(created.id);
        } catch {
          message.warning(t("cStartFailed"));
        } finally {
          setRevision((v) => v + 1);
        }
      } else message.success(t("cAdded", { count: 1 }));
    } catch {
      message.error(t("capNeedVideo"));
    } finally {
      useCaptureWorkspace.setState({ busy: false });
    }
  }
  async function checkRecords() {
    try {
      await getConversions({ current: 1, pageSize: 50, kind: "capture" });
      setPage(1);
      await tasks.mutate();
      setChecked(true);
      setHistoryOpen(true);
    } catch {
      message.error(t("cLoadError"));
    }
  }
  async function directory() {
    try {
      const paths = await dialog.open({ type: "directory" });
      if (paths?.[0]) edit({ customDirectory: true, directory: paths[0] });
    } catch {
      message.error(t("c09NeedFolder"));
    }
  }
  function locate() {
    const ms = parseTrimTime(time);
    if (ms === undefined || ms >= duration) {
      message.warning(t("capInvalidRange"));
      return;
    }
    setSeekTo((value) => ({ ms, revision: (value?.revision || 0) + 1 }));
  }
  return (
    <div
      className="wb-page cvt-page trim-page merge-page capture-page"
      data-testid="capture-page"
    >
      <header className="wb-page-heading">
        <div>
          <h1>{t("capTitle")}</h1>
        </div>
        <div className="trim-page-tools">
          <button
            type="button"
            className="wb-secondary trim-history-toggle"
            data-testid="capture-history-toggle"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen(true)}
          >
            <History size={16} />
            {t("capHistory")}
            <span>{tasks.data?.total || 0}</span>
          </button>
          <span className="cvt-local">
            <ShieldCheck size={15} />
            {t("cLocal")}
          </span>
        </div>
      </header>
      <TrimBatchProgress
        scope="capture"
        ids={draft.recentIds}
        revision={revision}
        openHistory={() => setHistoryOpen(true)}
        action={action}
      />
      {storageError && (
        <p className="cvt-uncertain" role="alert">
          {t("capStorage")}
        </p>
      )}
      {draft.locked && !busy && (
        <div className="cvt-uncertain" role="alert">
          <p>{t("capUnknown")}</p>
          <button
            type="button"
            className="wb-secondary"
            data-testid="capture-check-records"
            onClick={() => void checkRecords()}
          >
            {t("cCheckRecords")}
          </button>
          <button
            type="button"
            className="wb-secondary"
            data-testid="capture-unlock"
            disabled={!checked}
            onClick={() => {
              if (!busy && !save((v) => ({ ...v, locked: false })))
                message.error(t("capStorage"));
            }}
          >
            {t("cUnlock")}
          </button>
        </div>
      )}
      <div className="cvt-workspace">
        <div className="cvt-body merge-grid">
          <section
            className={`merge-left capture-left${!draft.path ? " nc-source-empty-host" : ""}`}
            data-testid="capture-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => void drop(e)}
          >
            {!draft.path ? (
              <MediaSourceEmpty
                title={t("capDrop")}
                detail={t("capOneFile")}
                chooseTestId="capture-add"
                disabled={disabled || reading}
                onChoose={() => void choose()}
              />
            ) : (
              <>
                <div className="merge-source-bar">
                  <div>
                    <strong title={draft.path}>
                      {draft.path ? filenameForPath(draft.path) : t("capDrop")}
                    </strong>
                    <small>
                      {validSource
                        ? `${formatTrimTime(duration)} · ${file?.video?.width || 0} × ${file?.video?.height || 0}`
                        : t("capOneFile")}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="wb-icon-button"
                    disabled={disabled || reading || !draft.path}
                    title={t("cReload")}
                    aria-label={t("cReload")}
                    onClick={() => setRefresh((v) => v + 1)}
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    type="button"
                    className="wb-secondary"
                    data-testid="capture-add"
                    disabled={disabled || reading}
                    onClick={() => void choose()}
                  >
                    <FolderOpen size={15} />
                    {t(draft.path ? "capReplace" : "cChoose")}
                  </button>
                  <SourceRemoveButton
                    testId="capture-remove-source"
                    disabled={disabled || adding.current}
                    onRemove={removeSource}
                  />
                </div>
                {validSource ? (
                  <TrimPreview
                    key={`${draft.path}:${refresh}`}
                    previewOnly={draft.mode === "frame"}
                    previewErrorKey="capPreviewFailed"
                    path={draft.path}
                    hasVideo
                    duration={duration}
                    start={draft.start}
                    end={draft.end}
                    disabled={disabled}
                    change={edit}
                    onPositionChange={setPosition}
                    onReadyChange={setPreviewReady}
                    positionRef={positionRef}
                    seekTo={seekTo}
                  />
                ) : (
                  <div className="merge-empty-preview">
                    <UploadCloud size={38} />
                    <p>
                      {t(
                        reading
                          ? "c11Checking"
                          : draft.path
                            ? "capNeedVideo"
                            : "capDrop",
                      )}
                    </p>
                    <small>{t("capOneFile")}</small>
                  </div>
                )}
                {draft.mode === "frame" && (
                  <div className="capture-time">
                    <label htmlFor="capture-time">{t("capTime")}</label>
                    <input
                      id="capture-time"
                      data-testid="capture-time"
                      value={time}
                      disabled={disabled || !previewReady}
                      onChange={(e) => setTime(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") locate();
                      }}
                    />
                    <button
                      type="button"
                      className="wb-secondary"
                      data-testid="capture-locate"
                      disabled={disabled || !previewReady}
                      onClick={locate}
                    >
                      {t("capLocate")}
                    </button>
                    <small>{t("capFrameHint")}</small>
                  </div>
                )}
              </>
            )}
          </section>
          <aside className="cvt-settings capture-settings">
            <div className="cvt-settings-scroll">
              <div
                className="capture-modes"
                role="tablist"
                aria-label={t("capTitle")}
              >
                {(["frame", "gif"] as const).map((mode) => (
                  <button
                    type="button"
                    role="tab"
                    key={mode}
                    aria-selected={draft.mode === mode}
                    tabIndex={draft.mode === mode ? 0 : -1}
                    data-testid={`capture-mode-${mode}`}
                    disabled={disabled}
                    onClick={() => edit({ mode })}
                    onKeyDown={(event) => {
                      if (
                        disabled ||
                        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          event.key,
                        )
                      )
                        return;
                      event.preventDefault();
                      const next =
                        event.key === "Home" || event.key === "ArrowLeft"
                          ? "frame"
                          : "gif";
                      edit({ mode: next });
                      event.currentTarget.parentElement
                        ?.querySelector<HTMLButtonElement>(
                          `[data-testid="capture-mode-${next}"]`,
                        )
                        ?.focus();
                    }}
                  >
                    {mode === "frame" ? (
                      <Camera size={16} />
                    ) : (
                      <Film size={16} />
                    )}{" "}
                    {t(mode === "frame" ? "capFrame" : "capGif")}
                  </button>
                ))}
              </div>
              {draft.mode === "frame" ? (
                <>
                  <label className="cvt-field">
                    <span>{t("cFormat")}</span>
                    <select
                      data-testid="capture-format"
                      disabled={disabled}
                      value={draft.format}
                      onChange={(e) =>
                        edit({
                          format: e.target.value as CaptureDraft["format"],
                        })
                      }
                    >
                      {["png", "jpg", "webp"].map((f) => (
                        <option key={f} value={f}>
                          {f.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  {draft.format !== "png" && (
                    <label className="cvt-field">
                      <span>{t("cQuality")}</span>
                      <select
                        data-testid="capture-quality"
                        disabled={disabled}
                        value={draft.quality}
                        onChange={(e) =>
                          edit({
                            quality: e.target.value as CaptureDraft["quality"],
                          })
                        }
                      >
                        {["high", "medium", "low"].map((q) => (
                          <option key={q} value={q}>
                            {t(
                              q === "high"
                                ? "cHigh"
                                : q === "medium"
                                  ? "cMedium"
                                  : "cLow",
                            )}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="trim-hint">{t("capOriginal")}</p>
                </>
              ) : (
                <>
                  <div className="capture-range">
                    {(["start", "end"] as const).map((k) => (
                      <label className="cvt-field" key={k}>
                        <span>{t(k === "start" ? "trIn" : "trOut")}</span>
                        <input
                          data-testid={`capture-range-${k}`}
                          disabled={disabled}
                          value={draft[k]}
                          onChange={(e) => edit({ [k]: e.target.value })}
                        />
                      </label>
                    ))}
                  </div>
                  <small className="trim-hint">{t("capRangeHint")}</small>
                  <label className="cvt-field">
                    <span>{t("capSize")}</span>
                    <select
                      data-testid="capture-size"
                      disabled={disabled}
                      value={draft.maxEdge}
                      onChange={(e) =>
                        edit({ maxEdge: Number(e.target.value) })
                      }
                    >
                      <option value={0}>
                        {t("capSourceSize")}
                        {file?.video &&
                          ` (${file.video.width} × ${file.video.height})`}
                      </option>
                      {!captureSizes.some((n) => n === draft.maxEdge) &&
                        draft.maxEdge !== 0 && (
                          <option value={draft.maxEdge}>
                            {t("c124ImageCustom", {
                              size: captureSizeLabel(
                                draft.maxEdge,
                                file?.video,
                              ),
                            })}
                          </option>
                        )}
                      {captureSizes.map((size) => (
                        <option
                          key={size}
                          value={size}
                          disabled={!canSelectVideoSize(size, sizeLimit)}
                        >
                          {captureSizeLabel(size, file?.video)}
                        </option>
                      ))}
                    </select>
                    <small>{t("capSizeHint")}</small>
                  </label>
                  <label className="cvt-field">
                    <span>{t("capFps")}</span>
                    <select
                      data-testid="capture-fps"
                      disabled={disabled}
                      value={draft.fps}
                      onChange={(e) => edit({ fps: Number(e.target.value) })}
                    >
                      {!captureFrameRates.some((f) => f === draft.fps) && (
                        <option value={draft.fps}>{draft.fps} fps</option>
                      )}
                      {captureFrameRates.map((n) => (
                        <option key={n} value={n}>
                          {n === 0 ? t("capSourceFps") : `${n} fps`}
                        </option>
                      ))}
                    </select>
                    {draft.fps === 0 && <small>{t("capSourceFpsHint")}</small>}
                  </label>
                  <label className="capture-loop">
                    <input
                      type="checkbox"
                      data-testid="capture-loop"
                      disabled={disabled}
                      checked={draft.loop}
                      onChange={(e) => edit({ loop: e.target.checked })}
                    />
                    {t("capLoop")}
                  </label>
                </>
              )}
              <label className="cvt-field">
                <span>{t("trSegmentName")}</span>
                <input
                  data-testid="capture-name"
                  disabled={disabled}
                  value={draft.name}
                  maxLength={80}
                  placeholder={t("capNamePlaceholder")}
                  onChange={(e) => edit({ name: e.target.value })}
                />
              </label>
              <div className="cvt-field">
                <label htmlFor="capture-directory-mode">
                  {t("c09OutputFolder")}
                </label>
                <select
                  id="capture-directory-mode"
                  data-testid="capture-directory-mode"
                  disabled={disabled}
                  value={draft.customDirectory ? "custom" : "source"}
                  onChange={(e) =>
                    edit({ customDirectory: e.target.value === "custom" })
                  }
                >
                  <option value="source">{t("c09SourceFolder")}</option>
                  <option value="custom">{t("c09CustomFolder")}</option>
                </select>
                {draft.customDirectory && (
                  <div className="cvt-folder-input">
                    <input
                      data-testid="capture-directory"
                      aria-label={t("c09OutputFolder")}
                      disabled={disabled}
                      value={draft.directory}
                      onChange={(e) => edit({ directory: e.target.value })}
                    />
                    <button
                      type="button"
                      className="wb-secondary"
                      disabled={disabled}
                      title={t("c09ChooseFolder")}
                      aria-label={t("c09ChooseFolder")}
                      onClick={() => void directory()}
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
            <div className="cvt-actions" data-testid="capture-actions">
              <button
                type="button"
                className="wb-primary"
                data-testid="capture-start"
                disabled={!valid}
                aria-describedby="capture-action-hint"
                onClick={() => void submit(true)}
              >
                <Camera size={16} />
                {t(draft.mode === "frame" ? "capFrameExport" : "capGifExport")}
              </button>
              <button
                type="button"
                className="wb-secondary"
                data-testid="capture-queue"
                disabled={!valid}
                onClick={() => void submit(false)}
              >
                {t("cQueue")}
              </button>
              <small role="status" id="capture-action-hint">
                {t(hint)}
              </small>
            </div>
          </aside>
        </div>
      </div>
      <MergeHistory
        kind="capture"
        open={historyOpen}
        close={() => setHistoryOpen(false)}
        data={tasks.data}
        error={tasks.error}
        loading={tasks.isLoading}
        page={page}
        setPage={setPage}
        reload={tasks.mutate}
        start={tasks.startConversion}
        stop={tasks.stopConversion}
        remove={tasks.deleteConversion}
        action={action}
      />
    </div>
  );
}
