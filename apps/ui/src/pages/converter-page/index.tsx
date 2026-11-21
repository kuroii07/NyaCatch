import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { App, Tooltip } from "antd";
import {
  AudioLines,
  Headphones,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Film,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSWRConfig } from "swr";
import type { Conversion, LocalFileCheck } from "@mediago/shared-common";
import { getConversions, getConversionsKey } from "@/api/conversion";
import { useConversions } from "@/hooks/use-conversions";
import { usePlatform } from "@/hooks/use-platform";
import { useConverterWorkspace } from "@/store/converter-workspace";
import {
  appendConverterDraft,
  applyConversionPreset,
  type ConverterWorkspace,
} from "./converter-workspace";
import {
  conversionOptions,
  bitratesForFormat,
  type ConversionSettings,
  filenameForPath,
  converterFormats,
  getModeForFormat,
  isLosslessFormat,
  videoResolutionLabel,
  videoSizePresets,
  videoSizeLimit,
  canSelectVideoSize,
  type ConversionMode,
} from "./converter-model";
import { audioInputIssue, audioInputSummary } from "./audio-model";
import TrimPreview from "../trim-page/trim-preview";
import "../trim-page/trim.css";
import "./audio.css";
import "./converter.css";

const modes: ConversionMode[] = ["video", "audio", "image"];
const modeIcons = { video: Film, audio: AudioLines, image: ImageIcon };
const modeKeys = { video: "cVideo", audio: "axTitle", image: "cImage" };
const dropKeys = {
  video: "cDropVideo",
  audio: "axDrop",
  image: "cDropImage",
};
const typeKeys = {
  video: "cVideoTypes",
  audio: "cAudioTypes",
  image: "cImageTypes",
};
const settingsKeys = {
  video: "cSettingVideo",
  audio: "cSettingAudio",
  image: "cSettingImage",
};

const imageSizeKeys: Record<number, string> = {
  512: "c124ImageSmall",
  1024: "c124ImageStandard",
  1920: "c124ImageHD",
  2048: "c124ImageLarge",
  4096: "c124ImageXLarge",
};

export default function ConverterPage() {
  const { t } = useTranslation();
  const sizeLabel = (size: number, kind: ConversionMode) =>
    kind === "image"
      ? t(imageSizeKeys[size] || "c124ImageCustom", { size })
      : (kind === "video" ? videoResolutionLabel(size) : undefined) ||
        t("c09LongEdge", { size });
  const { message } = App.useApp();
  const { dialog, shell } = usePlatform();
  const {
    workspace,
    save,
    storageError,
    submitting: workspaceBusy,
  } = useConverterWorkspace();
  const { mode, drafts, formats, qualities, settings } = workspace;
  const [page, setPage] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [working, setBusy] = useState(false);
  const busy = working || workspaceBusy;
  const uncertain = workspace.submission === "unknown";
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [inspectedFiles, setInspectedFiles] = useState<LocalFileCheck[]>([]);
  const [checkingFiles, setCheckingFiles] = useState(false);
  const [fileCheckFailed, setFileCheckFailed] = useState(false);
  const [fileCheck, setFileCheck] = useState(0);
  const [checked, setChecked] = useState(false);
  const [audioPreviewPath, setAudioPreviewPath] = useState("");
  const { mutate: mutateCache } = useSWRConfig();
  const submitting = useRef(false);
  const dragDepth = useRef(0);
  const {
    data,
    error,
    isLoading,
    mutate,
    addConversion,
    deleteConversion,
    startConversion,
    stopConversion,
  } = useConversions({ current: page, pageSize: 30, kind: mode });
  const items = data?.list || [];
  const pending = drafts[mode];
  const format = formats[mode];
  const lossless = isLosslessFormat(format);
  const originalAudio = mode === "audio" && format === "original";
  const audioBlocked =
    mode === "audio" &&
    pending.some((path) =>
      audioInputIssue(
        inspectedFiles.find((file) => file.path === path),
        originalAudio,
      ),
    );
  const previewFile =
    inspectedFiles.find(
      (file) => file.path === audioPreviewPath && pending.includes(file.path),
    ) ||
    inspectedFiles.find(
      (file) => pending.includes(file.path) && !audioInputIssue(file, false),
    );
  const selection = settings[mode];
  const folderMissing =
    selection.customDirectory && !selection.directory.trim();
  const availableBitrates = bitratesForFormat(format);
  const chosenBitrate = availableBitrates.includes(selection.audioBitrate)
    ? selection.audioBitrate
    : 0;
  const explicitBitrate = mode === "audio" && chosenBitrate > 0;
  const filesReady =
    pending.length > 0 && pending.every((path) => availability[path] === true);
  const sourceLimit = checkingFiles
    ? undefined
    : videoSizeLimit(pending, inspectedFiles);
  const videoSizeBlocked =
    mode === "video" && !canSelectVideoSize(selection.maxEdge, sourceLimit);
  const videoSizeHint = !pending.length
    ? "c123AddVideo"
    : checkingFiles
      ? "c123Inspecting"
      : sourceLimit === undefined
        ? "c123UnknownSize"
        : pending.length > 1
          ? "c123BatchSize"
          : "c123SourceSize";
  const actionHintId = useId();
  const actionHint = busy
    ? "wbAdding"
    : uncertain
      ? "c11Locked"
      : !pending.length
        ? "u11ChooseFiles"
        : checkingFiles
          ? "c11Checking"
          : fileCheckFailed
            ? "c11CheckFailed"
            : !filesReady
              ? "c11Missing"
              : audioBlocked
                ? "axCheck"
                : videoSizeBlocked
                  ? "c123SizeBlocked"
                  : folderMissing
                    ? "c09NeedFolder"
                    : originalAudio
                      ? "axReady"
                      : "cActionHint";
  function updateWorkspace(
    update: (current: ConverterWorkspace) => ConverterWorkspace,
  ) {
    const saved = save(update);
    if (!saved) message.error(t("c11StorageError"));
    return saved;
  }
  function changeSettings(next: Partial<ConversionSettings>) {
    updateWorkspace((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [mode]: { ...current.settings[mode], ...next },
      },
    }));
  }
  useEffect(() => {
    let cancelled = false;
    setAvailability({});
    setInspectedFiles([]);
    setFileCheckFailed(false);
    if (!pending.length) {
      setCheckingFiles(false);
      return;
    }
    setCheckingFiles(true);
    void shell
      .checkFiles(pending, mode !== "image")
      .then((results) => {
        if (!cancelled) {
          setInspectedFiles(results);
          setAvailability(
            Object.fromEntries(
              results.map((file) => [file.path, file.available]),
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setFileCheckFailed(true);
      })
      .finally(() => {
        if (!cancelled) setCheckingFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pending, shell, fileCheck, mode]);
  async function chooseOutputFolder() {
    try {
      const paths = await dialog.open({ type: "directory" });
      if (paths?.[0])
        changeSettings({ customDirectory: true, directory: paths[0] });
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("cDropUnavailable"),
      );
    }
  }
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 30));
  const FileIcon = modeIcons[mode];

  useEffect(() => {
    const prevent = (event: globalThis.DragEvent) => {
      if (Array.from(event.dataTransfer?.types || []).includes("Files"))
        event.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);
  useEffect(() => {
    if (page > pages && !isLoading) setPage(pages);
  }, [page, pages, isLoading]);

  function addPaths(paths: string[], selectedMode = mode) {
    if (
      !paths.length ||
      useConverterWorkspace.getState().submitting ||
      useConverterWorkspace.getState().workspace.submission !== "idle"
    )
      return;
    const result = appendConverterDraft(
      useConverterWorkspace.getState().workspace,
      selectedMode,
      paths,
    );
    if (!updateWorkspace(() => result.workspace)) return;
    if (result.duplicates)
      message.info(t("cDuplicate", { count: result.duplicates }));
    if (result.excess) message.warning(t("cExcess"));
  }
  async function chooseFiles() {
    try {
      const paths = await dialog.open({ type: "file", multiple: true });
      addPaths(paths || []);
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("cDropUnavailable"),
      );
    }
  }
  async function dropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    if (busy || uncertain) return;
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    const results = await Promise.allSettled(
      files.map((file) => dialog.pathForDroppedFile(file)),
    );
    const paths = results.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    );
    if (paths.length !== files.length) message.warning(t("cDropUnavailable"));
    addPaths(paths);
  }
  async function submit(startNow: boolean) {
    if (
      submitting.current ||
      useConverterWorkspace.getState().submitting ||
      uncertain ||
      !filesReady ||
      audioBlocked ||
      videoSizeBlocked ||
      folderMissing
    )
      return;
    submitting.current = true;
    setBusy(true);
    useConverterWorkspace.setState({ submitting: true });
    const submittedMode = mode,
      submittedFormat = formats[mode],
      submittedQuality = qualities[mode];
    const submittedOptions = conversionOptions(
      mode,
      submittedFormat,
      selection,
    );
    let added = 0,
      unknown = false,
      startFailed = false;
    try {
      const files = await shell.checkFiles(pending, submittedMode !== "image");
      setInspectedFiles(files);
      setAvailability(
        Object.fromEntries(files.map((file) => [file.path, file.available])),
      );
      if (
        pending.some(
          (path) => !files.some((file) => file.path === path && file.available),
        )
      ) {
        message.error(t("c11Missing"));
        return;
      }
      if (
        submittedMode === "audio" &&
        pending.some((path) =>
          audioInputIssue(
            files.find((file) => file.path === path),
            submittedFormat === "original",
          ),
        )
      ) {
        message.error(t("axCheck"));
        return;
      }
      if (
        submittedMode === "video" &&
        !canSelectVideoSize(
          submittedOptions.maxEdge || 0,
          videoSizeLimit(pending, files),
        )
      ) {
        message.error(t("c123SizeBlocked"));
        return;
      }
      if (
        !updateWorkspace((current) => ({ ...current, submission: "unknown" }))
      )
        return;
      for (const path of pending) {
        let created: Conversion;
        try {
          created = await addConversion({
            name: filenameForPath(path),
            path,
            outputFormat: submittedFormat,
            quality: submittedQuality,
            options: submittedOptions,
          });
        } catch {
          unknown = true;
          setChecked(false);
          break;
        }
        added++;
        // Once creation is confirmed, never leave the same file in the draft for a retry.
        if (
          !updateWorkspace((current) => ({
            ...current,
            drafts: {
              ...current.drafts,
              [submittedMode]: current.drafts[submittedMode].filter(
                (candidate) => candidate !== path,
              ),
            },
          }))
        ) {
          unknown = true;
          break;
        }
        if (startNow) {
          try {
            await startConversion(created.id);
          } catch {
            startFailed = true;
          }
        }
      }
      if (!unknown)
        updateWorkspace((current) => ({ ...current, submission: "idle" }));
      setPage(1);
      try {
        await mutate();
      } catch {
        message.error(t("cLoadError"));
      }
      if (startFailed) message.warning(t("cStartFailed"));
      else if (added) message.success(t("cAdded", { count: added }));
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("c11CheckFailed"),
      );
    } finally {
      submitting.current = false;
      useConverterWorkspace.setState({ submitting: false });
      setBusy(false);
    }
  }
  async function checkRecords() {
    try {
      const fresh = await getConversions({
        current: 1,
        pageSize: 30,
        kind: mode,
      });
      await mutateCache([getConversionsKey, 1, 30, mode], fresh, {
        revalidate: false,
      });
      setPage(1);
      setChecked(true);
    } catch {
      message.error(t("cLoadError"));
    }
  }
  function removeDraft(path?: string) {
    updateWorkspace((current) => ({
      ...current,
      drafts: {
        ...current.drafts,
        [mode]: path
          ? current.drafts[mode].filter((value) => value !== path)
          : [],
      },
    }));
  }
  async function action(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : t("cLoadError"));
    }
  }
  function renderRecord(item: Conversion) {
    const status =
      item.status === "pending"
        ? "cPending"
        : item.status === "converting"
          ? "cConverting"
          : item.status === "done"
            ? "cDone"
            : item.status === "failed"
              ? "cFailed"
              : "cUnknown";
    return (
      <div
        className="cvt-row"
        key={`task-${item.id}`}
        data-testid={`converter-record-${item.id}`}
      >
        <span className="cvt-file-icon">
          <FileIcon size={18} />
        </span>
        <div className="cvt-file-info">
          <strong title={item.name || item.path}>
            {item.name || filenameForPath(item.path)}
          </strong>
          <span title={item.outputPath || item.path}>
            {item.outputPath || item.path}
          </span>
          {item.options && (
            <span className="cvt-option-summary" title={item.options.outputDir}>
              {[
                item.options.maxEdge
                  ? sizeLabel(
                      item.options.maxEdge,
                      getModeForFormat(item.outputFormat || ""),
                    )
                  : null,
                item.options.audioBitrate
                  ? `${item.options.audioBitrate} kbps`
                  : null,
                item.options.outputDir,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {item.status === "failed" && item.error && (
            <span className="cvt-error" title={item.error}>
              {item.error}
            </span>
          )}
          {item.status === "converting" && (
            <div className="cvt-progress">
              <span
                style={{
                  width: `${Math.max(0, Math.min(100, item.progress || 0))}%`,
                }}
              />
            </div>
          )}
        </div>
        <span className={`cvt-status is-${item.status}`}>
          {item.status === "converting"
            ? `${t(status)} ${item.progress || 0}%`
            : t(status)}{" "}
          <small>
            ·{" "}
            {item.outputFormat === "original"
              ? t("axOriginal")
              : (item.outputFormat || "").toUpperCase()}
          </small>
        </span>
        <div className="cvt-row-actions">
          {item.status === "converting" ? (
            <Tooltip title={t("cStop")}>
              <button
                aria-label={t("cStop")}
                onClick={() => void action(() => stopConversion(item.id))}
              >
                <Square size={15} />
              </button>
            </Tooltip>
          ) : (
            <>
              {(item.status === "pending" || item.status === "failed") && (
                <Tooltip
                  title={t(item.status === "failed" ? "cRetry" : "cStartTask")}
                >
                  <button
                    aria-label={t(
                      item.status === "failed" ? "cRetry" : "cStartTask",
                    )}
                    onClick={() => void action(() => startConversion(item.id))}
                  >
                    <RotateCcw size={15} />
                  </button>
                </Tooltip>
              )}
              {item.status === "done" && item.outputPath && (
                <Tooltip title={t("cOpenFolder")}>
                  <button
                    aria-label={t("cOpenFolder")}
                    onClick={() =>
                      void action(() => shell.reveal(item.outputPath))
                    }
                  >
                    <FolderOpen size={15} />
                  </button>
                </Tooltip>
              )}
              <Tooltip title={t("cRemoveRecord")}>
                <button
                  aria-label={t("cRemoveRecord")}
                  onClick={() => void action(() => deleteConversion(item.id))}
                >
                  <Trash2 size={15} />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`wb-page cvt-page ${mode === "audio" ? "audio-converter-page" : ""}`}
      data-testid="converter-page"
    >
      <header className="wb-page-heading">
        <div>
          <h1>{t("converter")}</h1>
          <p>{t("cTitleDesc")}</p>
        </div>
        <span className="cvt-local">
          <ShieldCheck size={15} />
          {t("cLocal")}
        </span>
      </header>
      <div className="cvt-workspace">
        <div className="cvt-tabs" role="tablist" aria-label={t("converter")}>
          {modes.map((item) => {
            const Icon = modeIcons[item];
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={mode === item}
                disabled={busy || uncertain}
                data-testid={`converter-tab-${item}`}
                onClick={() => {
                  updateWorkspace((current) => ({ ...current, mode: item }));
                  setPage(1);
                }}
              >
                <Icon size={17} />
                {t(modeKeys[item])}
              </button>
            );
          })}
        </div>
        <div className="cvt-body">
          <section className="cvt-left" aria-label={t("cFiles")}>
            <div
              className={`cvt-drop${dragging ? " is-dragging" : ""}`}
              data-testid="converter-dropzone"
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dragDepth.current++;
                setDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (!dragDepth.current) setDragging(false);
              }}
              onDrop={(event) => void dropFiles(event)}
            >
              <span className="cvt-drop-icon">
                <UploadCloud size={21} />
              </span>
              <h2>{t(dropKeys[mode])}</h2>
              <p>{t("cDropHint")}</p>
              <button
                className="wb-secondary cvt-choose"
                data-testid="converter-choose"
                type="button"
                disabled={busy || uncertain}
                onClick={() => void chooseFiles()}
              >
                <Plus size={15} />
                {t("cChoose")}
              </button>
              <small>{t(typeKeys[mode])}</small>
            </div>
            {mode === "audio" &&
              previewFile?.media &&
              !audioInputIssue(previewFile, false) && (
                <div
                  className="audio-source-preview"
                  data-testid="audio-source-preview"
                >
                  <strong title={previewFile.path}>
                    {t("axPreview")} · {filenameForPath(previewFile.path)}
                  </strong>
                  <TrimPreview
                    key={previewFile.path}
                    previewOnly
                    previewErrorKey="axPreviewFailed"
                    path={previewFile.path}
                    hasVideo={false}
                    duration={previewFile.media.durationMs}
                    start="0"
                    end="0"
                    disabled={busy || uncertain}
                    change={() => {}}
                  />
                </div>
              )}
            <div className="cvt-list-heading">
              <div>
                <strong>{t("cFiles")}</strong>
                <span>{pending.length + (data?.total || 0)}</span>
              </div>
              <button
                type="button"
                disabled={!pending.length || busy || uncertain}
                onClick={() => removeDraft()}
              >
                {t("cClear")}
              </button>
            </div>
            <div className="cvt-list-caption">
              <span>{t("cListHint")}</span>
              <span>{t("cDraftCount", { count: pending.length })}</span>
              <button
                type="button"
                disabled={!pending.length || busy || checkingFiles}
                onClick={() => setFileCheck((value) => value + 1)}
                data-testid="converter-check-files"
              >
                <RefreshCw size={13} />
                {t("c11CheckFiles")}
              </button>
            </div>
            {storageError && (
              <p className="cvt-error" role="alert">
                {t("c11StorageError")}
              </p>
            )}
            {fileCheckFailed && (
              <p className="cvt-error" role="alert">
                {t("c11CheckFailed")}
              </p>
            )}
            {uncertain && !busy && (
              <div className="cvt-uncertain" role="alert">
                <p>{t("cAddFailed")}</p>
                <div>
                  <button type="button" onClick={() => void checkRecords()}>
                    {t("cCheckRecords")}
                  </button>
                  <button
                    type="button"
                    disabled={!checked}
                    onClick={() => {
                      if (
                        updateWorkspace((current) => ({
                          ...current,
                          submission: "idle",
                        }))
                      )
                        setChecked(false);
                    }}
                  >
                    {t("cUnlock")}
                  </button>
                </div>
              </div>
            )}
            <div className="cvt-list" data-testid="converter-list">
              {pending.map((path) => (
                <div
                  className="cvt-row"
                  key={`draft-${path}`}
                  data-testid="converter-draft"
                >
                  <span className="cvt-file-icon">
                    <FileIcon size={18} />
                  </span>
                  <div className="cvt-file-info">
                    <strong title={path}>{filenameForPath(path)}</strong>
                    <span title={path}>{path}</span>
                    {mode === "audio" && (
                      <span
                        className={
                          audioInputIssue(
                            inspectedFiles.find((file) => file.path === path),
                            originalAudio,
                          )
                            ? "cvt-error"
                            : ""
                        }
                      >
                        {checkingFiles
                          ? t("c11Checking")
                          : audioInputIssue(
                                inspectedFiles.find(
                                  (file) => file.path === path,
                                ),
                                originalAudio,
                              )
                            ? t(
                                audioInputIssue(
                                  inspectedFiles.find(
                                    (file) => file.path === path,
                                  ),
                                  originalAudio,
                                ) || "axNoAudio",
                              )
                            : `${audioInputSummary(inspectedFiles.find((file) => file.path === path))}${originalAudio ? ` · ${t("axSource", { extension: inspectedFiles.find((file) => file.path === path)?.audio?.extension })}` : ""}`}
                      </span>
                    )}
                  </div>
                  <span
                    className={`cvt-status${availability[path] === false ? " cvt-error" : ""}`}
                    data-testid="converter-file-status"
                  >
                    {t(
                      availability[path] === true
                        ? "cDraftStatus"
                        : availability[path] === false
                          ? "c11Missing"
                          : checkingFiles
                            ? "c11Checking"
                            : "c11CheckFailed",
                    )}
                  </span>
                  <div className="cvt-row-actions">
                    {mode === "audio" && (
                      <button
                        type="button"
                        title={t("axPreview")}
                        aria-label={t("axPreview")}
                        aria-pressed={previewFile?.path === path}
                        disabled={
                          busy ||
                          uncertain ||
                          !!audioInputIssue(
                            inspectedFiles.find((file) => file.path === path),
                            false,
                          )
                        }
                        onClick={() => setAudioPreviewPath(path)}
                      >
                        <Headphones size={16} />
                      </button>
                    )}
                    <Tooltip title={t("cRemoveDraft")}>
                      <button
                        disabled={busy || uncertain}
                        aria-label={t("cRemoveDraft")}
                        onClick={() => removeDraft(path)}
                      >
                        <X size={16} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="cvt-empty">
                  <LoaderCircle className="cvt-spin" size={24} />
                  <span>{t("cLoading")}</span>
                </div>
              )}
              {error && (
                <div className="cvt-empty">
                  <span>{t("cLoadError")}</span>
                  <button onClick={() => void mutate()}>{t("cReload")}</button>
                </div>
              )}
              {!isLoading && !error && items.map(renderRecord)}
              {!isLoading && !error && !pending.length && !items.length && (
                <div className="cvt-empty">
                  <FileIcon size={26} />
                  <strong>{t("cNoFiles")}</strong>
                  <span>{t("cEmptyHint")}</span>
                </div>
              )}
            </div>
            {pages > 1 && (
              <div className="cvt-pagination">
                <button
                  aria-label={t("cPrevious")}
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span>{t("cPage", { current: page, pages })}</span>
                <button
                  aria-label={t("cNext")}
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </section>
          <aside className="cvt-settings" aria-label={t("cSettings")}>
            <div
              className="cvt-settings-scroll"
              data-testid="converter-settings-scroll"
            >
              <div className="cvt-settings-heading">
                <div>
                  <h2>{t("cSettings")}</h2>
                  <p>{t(originalAudio ? "axCopyHint" : settingsKeys[mode])}</p>
                </div>
                <SlidersHorizontal size={18} />
              </div>
              <div className="cvt-preset">
                <span>{t("c11Preset")}</span>
                <button
                  type="button"
                  className="wb-secondary"
                  disabled={
                    busy ||
                    uncertain ||
                    (mode === "video" && !canSelectVideoSize(1920, sourceLimit))
                  }
                  data-testid="converter-preset"
                  aria-describedby={
                    mode === "video" ? "cvt-size-availability" : undefined
                  }
                  onClick={() =>
                    updateWorkspace((current) =>
                      applyConversionPreset(current, mode),
                    )
                  }
                >
                  {t(
                    mode === "video"
                      ? "c11PresetVideo"
                      : mode === "audio"
                        ? "c11PresetAudio"
                        : "c11PresetImage",
                    {
                      resolution: videoResolutionLabel(1920),
                      size: sizeLabel(1920, "image"),
                    },
                  )}
                </button>
              </div>
              <div className="cvt-field">
                <label htmlFor="cvt-format">{t("cFormat")}</label>
                <div className="cvt-select">
                  <select
                    id="cvt-format"
                    data-testid="converter-format"
                    value={format}
                    disabled={busy || uncertain}
                    onChange={(event) =>
                      updateWorkspace((current) => ({
                        ...current,
                        formats: {
                          ...current.formats,
                          [mode]: event.target.value,
                        },
                      }))
                    }
                  >
                    {converterFormats(mode).map((option) => (
                      <option value={option} key={option}>
                        {option === "original"
                          ? t("axOriginal")
                          : option.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </div>
                {mode === "image" && <small>{t("cImageHint")}</small>}
              </div>
              {mode !== "audio" && (
                <div className="cvt-field">
                  <label htmlFor="cvt-edge">
                    {t(mode === "video" ? "c09VideoSize" : "c09ImageSize")}
                  </label>
                  <div className="cvt-select">
                    <select
                      id="cvt-edge"
                      data-testid="converter-max-edge"
                      aria-describedby={
                        mode === "video" ? "cvt-size-availability" : undefined
                      }
                      value={selection.maxEdge}
                      disabled={busy || uncertain}
                      onChange={(event) =>
                        changeSettings({ maxEdge: Number(event.target.value) })
                      }
                    >
                      <option value={0}>{t("c09OriginalSize")}</option>
                      {(mode === "video"
                        ? videoSizePresets.map((preset) => preset.width)
                        : [512, 1024, 1920, 2048, 4096]
                      ).map((size) => (
                        <option
                          key={size}
                          value={size}
                          disabled={
                            mode === "video" &&
                            !canSelectVideoSize(size, sourceLimit)
                          }
                        >
                          {sizeLabel(size, mode)}
                        </option>
                      ))}
                      {selection.maxEdge > 0 &&
                        !(mode === "video"
                          ? videoSizePresets.some(
                              (preset) => preset.width === selection.maxEdge,
                            )
                          : [512, 1024, 1920, 2048, 4096].includes(
                              selection.maxEdge,
                            )) && (
                          <option
                            value={selection.maxEdge}
                            disabled={
                              mode === "video" &&
                              !canSelectVideoSize(
                                selection.maxEdge,
                                sourceLimit,
                              )
                            }
                          >
                            {sizeLabel(selection.maxEdge, mode)}
                          </option>
                        )}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                  <small>
                    {t(
                      mode === "video"
                        ? "c122VideoSizeHint"
                        : "c124ImageResizeHint",
                    )}
                  </small>
                  {mode === "video" && (
                    <small
                      id="cvt-size-availability"
                      data-testid="converter-size-availability"
                      role="status"
                    >
                      {t(videoSizeHint, {
                        size: sourceLimit,
                        width: inspectedFiles.find(
                          (file) => file.path === pending[0],
                        )?.video?.width,
                        height: inspectedFiles.find(
                          (file) => file.path === pending[0],
                        )?.video?.height,
                      })}
                      {videoSizeBlocked &&
                        !checkingFiles &&
                        pending.length > 0 &&
                        ` ${t("c123SizeBlocked")}`}
                    </small>
                  )}
                </div>
              )}
              {mode === "audio" && (
                <div className="cvt-field" hidden={originalAudio}>
                  <label htmlFor="cvt-bitrate">{t("c09Bitrate")}</label>
                  <div className="cvt-select">
                    <select
                      id="cvt-bitrate"
                      data-testid="converter-audio-bitrate"
                      value={chosenBitrate}
                      disabled={originalAudio || lossless || busy || uncertain}
                      onChange={(event) =>
                        changeSettings({
                          audioBitrate: Number(event.target.value),
                        })
                      }
                    >
                      <option value={0}>{t("c09AutoBitrate")}</option>
                      {availableBitrates.map((rate) => (
                        <option key={rate} value={rate}>
                          {rate} kbps
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </div>
              )}
              <div className="cvt-field" hidden={originalAudio}>
                <div className="cvt-field-heading">
                  <label>{t("cQuality")}</label>
                  {lossless && <span>{t("cLossless")}</span>}
                </div>
                <div
                  className="cvt-quality"
                  role="group"
                  aria-label={t("cQuality")}
                >
                  {(["high", "medium", "low"] as const).map((quality) => (
                    <button
                      type="button"
                      key={quality}
                      disabled={
                        originalAudio ||
                        lossless ||
                        explicitBitrate ||
                        busy ||
                        uncertain
                      }
                      aria-pressed={
                        !originalAudio &&
                        !lossless &&
                        !explicitBitrate &&
                        qualities[mode] === quality
                      }
                      onClick={() =>
                        updateWorkspace((current) => ({
                          ...current,
                          qualities: { ...current.qualities, [mode]: quality },
                        }))
                      }
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
                    originalAudio
                      ? "axCopyHint"
                      : lossless
                        ? "cLosslessHint"
                        : explicitBitrate
                          ? "c09BitrateHint"
                          : "cQualityHint",
                  )}
                </small>
              </div>
              <div className="cvt-field">
                <label htmlFor="cvt-directory-mode">{t("cSave")}</label>
                <div className="cvt-select">
                  <select
                    id="cvt-directory-mode"
                    data-testid="converter-directory-mode"
                    value={selection.customDirectory ? "custom" : "source"}
                    disabled={busy || uncertain}
                    onChange={(event) =>
                      changeSettings({
                        customDirectory: event.target.value === "custom",
                      })
                    }
                  >
                    <option value="source">{t("c09SourceFolder")}</option>
                    <option value="custom">{t("c09CustomFolder")}</option>
                  </select>
                  <ChevronDown size={16} />
                </div>
                {selection.customDirectory && (
                  <div className="cvt-folder-input">
                    <input
                      data-testid="converter-output-directory"
                      aria-label={t("c09OutputFolder")}
                      value={selection.directory}
                      disabled={busy || uncertain}
                      onChange={(event) =>
                        changeSettings({ directory: event.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="wb-icon-button"
                      aria-label={t("c09ChooseFolder")}
                      disabled={busy || uncertain}
                      onClick={() => void chooseOutputFolder()}
                    >
                      <FolderOpen size={16} />
                    </button>
                  </div>
                )}
                {folderMissing && (
                  <small className="cvt-error" role="alert">
                    {t("c09NeedFolder")}
                  </small>
                )}
              </div>
              <p className="cvt-safe">
                <ShieldCheck size={15} />
                {t("cSafe")}
              </p>
            </div>
            <div className="cvt-actions">
              <button
                type="button"
                className="wb-primary"
                data-testid="converter-start-now"
                aria-describedby={actionHintId}
                disabled={
                  !filesReady ||
                  audioBlocked ||
                  busy ||
                  uncertain ||
                  folderMissing ||
                  videoSizeBlocked
                }
                onClick={() => void submit(true)}
              >
                {busy ? (
                  <LoaderCircle size={16} className="cvt-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                {t(originalAudio ? "axStart" : "cStart")}
                <span>{pending.length}</span>
              </button>
              <button
                type="button"
                className="wb-secondary"
                data-testid="converter-queue"
                aria-describedby={actionHintId}
                disabled={
                  !filesReady ||
                  audioBlocked ||
                  busy ||
                  uncertain ||
                  folderMissing ||
                  videoSizeBlocked
                }
                onClick={() => void submit(false)}
              >
                {t("cQueue")}
              </button>
              <small id={actionHintId} role="status" aria-live="polite">
                {t(actionHint)}
              </small>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
