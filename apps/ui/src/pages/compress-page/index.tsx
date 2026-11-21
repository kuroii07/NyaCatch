import { useEffect, useRef, useState, type DragEvent } from "react";
import useSWR from "swr";
import { App } from "antd";
import {
  Clapperboard,
  FolderOpen,
  History,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  X,
  Subtitles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LocalFileCheck } from "@mediago/shared-common";
import {
  getConversion,
  getConversions,
  inspectSubtitle,
  getCompressionEncoders,
} from "@/api/conversion";
import { useConversions } from "@/hooks/use-conversions";
import { usePlatform } from "@/hooks/use-platform";
import { useCompressionWorkspace } from "@/store/compress-workspace";
import {
  filenameForPath,
  canSelectVideoSize,
  videoSizeLimit,
  videoSizePresets,
} from "../converter-page/converter-model";
import { formatTrimTime, parseTrimTime } from "../trim-page/trim-model";
import TrimPreview from "../trim-page/trim-preview";
import TrimBatchProgress from "../trim-page/trim-batch-progress";
import MergeHistory from "../merge-page/merge-history";
import CompressionSize, { useCompressionOutputs } from "./compress-size";
import SubtitleEditor from "./subtitle-editor";
import SubtitlePreview from "./subtitle-preview";
import {
  defaultSubtitleStyle,
  subtitleOptions,
  type SubtitleBinding,
} from "./subtitle-model";
import {
  checkSubtitleBindings,
  useCompressionSubtitles,
} from "./use-subtitles";
import {
  appendCompressionPaths,
  byteSize,
  compressionCRFs,
  compressionCQs,
  compressionEncoderProblem,
  compressionDuration,
  compressionFileProblem,
  compressionTargetBitrate,
  removeCompressionSource,
  type CompressionDraft,
  type CompressionSettings,
} from "./compress-model";
import "../converter-page/converter.css";
import "../trim-page/trim.css";
import "../merge-page/merge.css";
import "./compress.css";

export default function CompressPage() {
  const { t } = useTranslation(),
    { message } = App.useApp(),
    { shell, dialog } = usePlatform();
  const { draft, busy, storageError, save } = useCompressionWorkspace(),
    s = draft.settings,
    sizeMode = s.rateMode === "size",
    nvenc = s.encoder === "nvenc",
    quality = nvenc ? s.cq || 23 : s.crf,
    qualityPresets = nvenc ? compressionCQs : compressionCRFs[s.codec];
  const [encoderRefresh, setEncoderRefresh] = useState(0);
  const encoders = useSWR(
    ["compress-encoders", encoderRefresh],
    () => getCompressionEncoders(encoderRefresh > 0),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const encoderProblem = compressionEncoderProblem(
    s,
    encoders.error ? undefined : encoders.data,
    encoders.isValidating,
  );
  const [files, setFiles] = useState<LocalFileCheck[]>([]),
    [reading, setReading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [page, setPage] = useState(1),
    [historyOpen, setHistoryOpen] = useState(false),
    [checked, setChecked] = useState(false),
    [revision, setRevision] = useState(0),
    [showResult, setShowResult] = useState(false),
    [showSubtitle, setShowSubtitle] = useState(false),
    [subtitleAt, setSubtitleAt] = useState(0),
    [subtitleRefresh, setSubtitleRefresh] = useState(0),
    [subtitleCheckRevision, setSubtitleCheckRevision] = useState(0),
    [subtitleFormValid, setSubtitleFormValid] = useState(true),
    [subtitleChoosing, setSubtitleChoosing] = useState(false),
    [subtitleOpen, setSubtitleOpen] = useState(false),
    [trialStart, setTrialStart] = useState(formatTrimTime(0)),
    [sourceSeek, setSourceSeek] = useState<{ ms: number; revision: number }>();
  const generation = useRef(0),
    subtitleChoice = useRef(0),
    adding = useRef(false),
    positionRef = useRef<(() => number | undefined) | undefined>(undefined);
  const [crfText, setCrfText] = useState(String(quality));
  const [targetText, setTargetText] = useState(String(s.targetMB || 100));
  useEffect(() => setTargetText(String(s.targetMB || 100)), [s.targetMB]);
  useEffect(() => setCrfText(String(quality)), [quality, nvenc]);
  const tasks = useConversions({
      current: page,
      pageSize: 50,
      kind: "compress",
    }),
    signature = JSON.stringify(draft.paths),
    disabled = busy || draft.locked;
  const active = files.find((f) => f.path === draft.activePath),
    duration = compressionDuration(active),
    sizeLimit = videoSizeLimit(draft.paths, files);
  const binding = draft.subtitles?.[draft.activePath],
    activeSubtitle = subtitleOptions(binding),
    subtitleChecks = useCompressionSubtitles(
      draft.subtitles,
      `${refresh}:${subtitleCheckRevision}`,
    );
  const trial = useSWR(
    draft.trialId ? ["compress-trial", draft.trialId, revision] : null,
    () => getConversion(draft.trialId),
    {
      refreshInterval: (row) =>
        row && ["pending", "converting"].includes(row.status) ? 1000 : 0,
    },
  );
  const trialRow =
    trial.data?.path === draft.activePath && trial.data.options?.compress?.trial
      ? trial.data
      : undefined;
  const trialReady = trialRow?.status === "done" && !!trialRow.outputPath;
  const trialOutputs = useCompressionOutputs(
      trialRow ? [trialRow] : undefined,
      `${revision}:${refresh}`,
    ),
    trialFile = trialOutputs.files.find((f) => f.path === trialRow?.outputPath);
  const trialRange = trialRow?.options?.compress?.trial;
  const previewOutput = showResult && !!trialReady,
    previewPath =
      previewOutput && trialRow ? trialRow.outputPath : draft.activePath,
    previewDuration =
      previewOutput && trialRange
        ? trialRange.endMs - trialRange.startMs
        : duration;
  const invalid = draft.paths
    .map((path) =>
      compressionFileProblem(
        files.find((f) => f.path === path),
        s,
      ),
    )
    .find(Boolean);
  const qualityValid =
    /^\d{1,2}$/.test(crfText) &&
    Number(crfText) === quality &&
    Number.isInteger(quality) &&
    quality >= (nvenc ? 1 : 0) &&
    quality <= 51;
  const targetValid =
    /^\d{1,6}$/.test(targetText) &&
    Number(targetText) === s.targetMB &&
    Number(targetText) >= 1 &&
    Number(targetText) <= 100000;
  const settingsValid =
    !encoderProblem &&
    (sizeMode ? targetValid : qualityValid) &&
    (!s.customDirectory || !!s.directory.trim()) &&
    (!binding?.enabled || subtitleFormValid);
  const hint = busy
    ? "vpBusy"
    : draft.locked
      ? "vpUnknown"
      : reading
        ? "c11Checking"
        : subtitleChecks.pending || subtitleChoosing
          ? "vpSubChecking"
          : !draft.paths.length
            ? "vpNeedFiles"
            : invalid ||
              subtitleChecks.problem ||
              encoderProblem ||
              (!settingsValid
                ? s.customDirectory && !s.directory.trim()
                  ? "c09NeedFolder"
                  : binding?.enabled && !subtitleFormValid
                    ? "vpSubOffsetInvalid"
                    : sizeMode
                      ? "vpTargetInvalid"
                      : nvenc
                        ? "vpInvalidCQ"
                        : "vpInvalidCRF"
                : "vpReady");
  const valid = hint === "vpReady";
  const from = parseTrimTime(trialStart),
    trialValid =
      !disabled &&
      !reading &&
      !showResult &&
      settingsValid &&
      !subtitleChoosing &&
      !subtitleChecks.pending &&
      !subtitleChecks.errors[draft.activePath] &&
      !compressionFileProblem(active, s) &&
      from !== undefined &&
      from >= 0 &&
      from < duration;
  function edit(patch: Partial<CompressionDraft>) {
    const state = useCompressionWorkspace.getState();
    if (state.busy || state.draft.locked) return;
    if (!save((v) => ({ ...v, ...patch }))) message.error(t("vpStorage"));
  }
  function change(patch: Partial<CompressionSettings>) {
    const state = useCompressionWorkspace.getState();
    edit({ settings: { ...state.draft.settings, ...patch } });
  }
  function changeSubtitle(value?: SubtitleBinding) {
    const state = useCompressionWorkspace.getState();
    if (state.busy || state.draft.locked || !state.draft.activePath) return;
    const subtitles = { ...state.draft.subtitles };
    if (value) subtitles[state.draft.activePath] = value;
    else delete subtitles[state.draft.activePath];
    edit({ subtitles });
  }
  async function chooseSubtitle(provided?: string[]) {
    const state = useCompressionWorkspace.getState();
    if (state.busy || state.draft.locked) return;
    if (!state.draft.activePath) {
      message.warning(t("vpSubNeedVideo"));
      return;
    }
    const source = state.draft.activePath,
      epoch = ++subtitleChoice.current;
    setSubtitleChoosing(true);
    try {
      const paths =
        provided ||
        (await dialog.open({
          type: "file",
          multiple: false,
          filters: [{ name: "SRT / ASS", extensions: ["srt", "ass"] }],
        }));
      if (!paths?.length) return;
      if (paths.length !== 1) {
        message.warning(t("vpSubOneFile"));
        return;
      }
      const info = await inspectSubtitle(paths[0]);
      const latest = useCompressionWorkspace.getState();
      if (
        epoch !== subtitleChoice.current ||
        latest.busy ||
        latest.draft.locked ||
        latest.draft.activePath !== source
      )
        return;
      changeSubtitle({
        path: paths[0],
        format: info.format,
        enabled: true,
        offsetMs: 0,
        sourceHash: info.hash,
        style:
          latest.draft.subtitles?.[source]?.style || defaultSubtitleStyle(),
      });
      setSubtitleCheckRevision((v) => v + 1);
      setSubtitleRefresh((v) => v + 1);
    } catch {
      if (epoch === subtitleChoice.current) message.error(t("vpSubReadFailed"));
    } finally {
      if (epoch === subtitleChoice.current) setSubtitleChoosing(false);
    }
  }
  function seekSubtitle(ms: number) {
    const point = Math.min(Math.max(0, ms), Math.max(0, duration - 1));
    positionRef.current?.();
    setShowResult(false);
    setShowSubtitle(true);
    setSubtitleAt(point);
    setTrialStart(formatTrimTime(point));
    setSubtitleRefresh((v) => v + 1);
  }
  useEffect(() => {
    const prevent = (e: globalThis.DragEvent) => {
      if (Array.from(e.dataTransfer?.types || []).includes("Files"))
        e.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      generation.current++;
      subtitleChoice.current++;
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const paths: string[] = JSON.parse(signature);
    setFiles([]);
    setChecked(false);
    if (!paths.length) {
      setReading(false);
      return;
    }
    setReading(true);
    void shell
      .checkFiles(paths, true)
      .then((v) => {
        if (!cancelled) setFiles(v);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signature, refresh, shell]);
  useEffect(() => {
    subtitleChoice.current++;
    setSubtitleChoosing(false);
    setShowSubtitle(false);
    setShowResult(false);
    setTrialStart(formatTrimTime(0));
    setSourceSeek(undefined);
  }, [draft.activePath]);
  useEffect(() => {
    if (!binding?.enabled) setShowSubtitle(false);
  }, [binding?.enabled]);
  useEffect(() => {
    if (!trialReady) setShowResult(false);
  }, [trialReady]);
  useEffect(() => {
    if (
      disabled ||
      reading ||
      !draft.paths.length ||
      sizeLimit === undefined ||
      canSelectVideoSize(s.maxEdge, sizeLimit)
    )
      return;
    if (!save((v) => ({ ...v, settings: { ...v.settings, maxEdge: 0 } })))
      message.error(t("vpStorage"));
  }, [
    disabled,
    reading,
    draft.paths.length,
    s.maxEdge,
    sizeLimit,
    save,
    message,
    t,
  ]);
  async function add(
    paths: string[],
    epoch: number,
    snapshot: CompressionDraft,
  ) {
    if (epoch !== generation.current || !paths.length) return;
    const joined = appendCompressionPaths(snapshot, paths);
    if (
      new Set(
        [...snapshot.paths, ...paths].map((p) =>
          p.replace(/\//g, "\\").toLowerCase(),
        ),
      ).size > 20
    ) {
      message.warning(t("vpLimit"));
      return;
    }
    const values = await shell.checkFiles(joined.paths, true);
    if (epoch !== generation.current) return;
    const state = useCompressionWorkspace.getState();
    if (state.busy || state.draft.locked || state.draft !== snapshot) {
      message.warning(t("mgDraftChanged"));
      return;
    }
    const problem = values
      .map((f) =>
        compressionFileProblem(f, { ...snapshot.settings, maxEdge: 0 }),
      )
      .find(Boolean);
    if (problem) {
      message.error(t(problem));
      return;
    }
    if (
      !save(() => ({
        ...joined,
        settings: {
          ...joined.settings,
          maxEdge: canSelectVideoSize(
            joined.settings.maxEdge,
            videoSizeLimit(joined.paths, values),
          )
            ? joined.settings.maxEdge
            : 0,
        },
      }))
    )
      message.error(t("vpStorage"));
  }
  async function choose() {
    if (disabled || adding.current) return;
    const epoch = ++generation.current,
      snapshot = useCompressionWorkspace.getState().draft;
    adding.current = true;
    setReading(true);
    try {
      const paths = await dialog.open({ type: "file", multiple: true });
      if (paths) await add(paths, epoch, snapshot);
    } catch {
      if (epoch === generation.current) message.error(t("cDropUnavailable"));
    } finally {
      adding.current = false;
      if (epoch === generation.current) setReading(false);
    }
  }
  async function drop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || adding.current) return;
    const native = Array.from(e.dataTransfer.files);
    if (!native.length) return;
    const epoch = ++generation.current,
      snapshot = useCompressionWorkspace.getState().draft;
    adding.current = true;
    setReading(true);
    try {
      const paths = await Promise.all(
        native.map((f) => dialog.pathForDroppedFile(f)),
      );
      if (paths.some((p) => !p)) throw Error("missing path");
      if (paths.length === 1 && /\.(srt|ass)$/i.test(paths[0]))
        await chooseSubtitle(paths);
      else await add(paths, epoch, snapshot);
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
  async function submit(startNow: boolean, trialOnly = false) {
    const state = useCompressionWorkspace.getState();
    if (
      state.busy ||
      state.draft.locked ||
      adding.current ||
      !(trialOnly ? trialValid : valid)
    )
      return;
    const snapshot = state.draft,
      paths = trialOnly ? [snapshot.activePath] : snapshot.paths,
      point = parseTrimTime(trialStart);
    positionRef.current?.();
    useCompressionWorkspace.setState({ busy: true });
    try {
      const current = await shell.checkFiles(paths, true),
        problem = current
          .map((f) => compressionFileProblem(f, snapshot.settings))
          .find(Boolean);
      if (problem || current.length !== paths.length) {
        setFiles((previous) =>
          trialOnly
            ? previous.map((f) => current.find((v) => v.path === f.path) || f)
            : current,
        );
        message.error(t(problem || "vpInvalidFiles"));
        return;
      }
      const subCheck = await checkSubtitleBindings(snapshot.subtitles, paths);
      const subProblem = Object.values(subCheck.errors)[0];
      if (subProblem) {
        setRefresh((v) => v + 1);
        message.error(t(subProblem));
        return;
      }
      const ms = compressionDuration(current[0]);
      if (trialOnly && (point === undefined || point < 0 || point >= ms)) {
        message.error(t("vpInvalidStart"));
        return;
      }
      if (
        !save((v) => ({
          ...v,
          locked: true,
          recentIds: [],
          ...(trialOnly ? { trialId: 0 } : {}),
        }))
      ) {
        message.error(t("vpStorage"));
        return;
      }
      setChecked(false);
      for (const path of paths) {
        let created;
        try {
          created = await tasks.addConversion({
            name: filenameForPath(path),
            path,
            outputFormat: snapshot.settings.format,
            quality: "medium",
            options: {
              version: 1,
              maxEdge: snapshot.settings.maxEdge,
              outputDir: snapshot.settings.customDirectory
                ? snapshot.settings.directory.trim()
                : undefined,
              compress: {
                encoder: snapshot.settings.encoder || "cpu",
                cq:
                  snapshot.settings.encoder === "nvenc"
                    ? snapshot.settings.cq
                    : undefined,
                subtitle: subtitleOptions(snapshot.subtitles?.[path]),
                codec: snapshot.settings.codec,
                crf:
                  snapshot.settings.rateMode === "size" ||
                  snapshot.settings.encoder === "nvenc"
                    ? 0
                    : snapshot.settings.crf,
                targetBytes:
                  snapshot.settings.rateMode === "size"
                    ? (snapshot.settings.targetMB || 0) * 1000000
                    : undefined,
                preset: snapshot.settings.preset,
                audio: snapshot.settings.audio,
                bitrate:
                  snapshot.settings.audio === "aac"
                    ? snapshot.settings.bitrate
                    : undefined,
                fps: snapshot.settings.fps,
                ...(trialOnly && point !== undefined
                  ? {
                      trial: {
                        startMs: point,
                        endMs: Math.min(
                          ms,
                          point + snapshot.trialSeconds * 1000,
                        ),
                      },
                    }
                  : {}),
              },
            },
          });
        } catch {
          message.error(t("vpUnknown"));
          return;
        }
        if (
          !save((v) => ({
            ...v,
            recentIds: [...v.recentIds, created.id],
            ...(trialOnly ? { trialId: created.id } : {}),
          }))
        ) {
          message.error(t("vpStorage"));
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
        }
      }
      if (!save((v) => ({ ...v, locked: false }))) {
        message.error(t("vpStorage"));
        return;
      }
      if (!startNow) message.success(t("cAdded", { count: paths.length }));
    } catch {
      message.error(t("vpInvalidFiles"));
    } finally {
      useCompressionWorkspace.setState({ busy: false });
    }
  }
  async function checkRecords() {
    try {
      await getConversions({ current: 1, pageSize: 50, kind: "compress" });
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
      if (paths?.[0]) change({ customDirectory: true, directory: paths[0] });
    } catch {
      message.error(t("c09NeedFolder"));
    }
  }
  function locate() {
    const ms = parseTrimTime(trialStart);
    if (ms === undefined || ms >= duration) {
      message.warning(t("vpInvalidStart"));
      return;
    }
    if (showSubtitle) seekSubtitle(ms);
    else setSourceSeek((v) => ({ ms, revision: (v?.revision || 0) + 1 }));
  }
  return (
    <div
      className="wb-page cvt-page trim-page merge-page compress-page"
      data-testid="compress-page"
    >
      <header className="wb-page-heading">
        <div>
          <h1>{t("vpTitle")}</h1>
        </div>
        <div className="trim-page-tools">
          <button
            type="button"
            className="wb-secondary trim-history-toggle"
            data-testid="compress-history-toggle"
            aria-expanded={historyOpen}
            onClick={() => {
              setHistoryOpen(true);
              void action(tasks.mutate);
            }}
          >
            <History size={16} />
            {t("vpHistory")}
            <span>{tasks.data?.total || 0}</span>
          </button>
          <span className="cvt-local">
            <ShieldCheck size={15} />
            {t("cLocal")}
          </span>
        </div>
      </header>
      <TrimBatchProgress
        scope="compress"
        ids={draft.recentIds}
        revision={revision}
        openHistory={() => {
          setHistoryOpen(true);
          void action(tasks.mutate);
        }}
        action={action}
      />
      {storageError && (
        <p className="cvt-uncertain" role="alert">
          {t("vpStorage")}
        </p>
      )}
      {draft.locked && !busy && (
        <div className="cvt-uncertain" role="alert">
          <p>{t("vpUnknown")}</p>
          <button
            type="button"
            className="wb-secondary"
            data-testid="compress-check-records"
            onClick={() => void checkRecords()}
          >
            {t("cCheckRecords")}
          </button>
          <button
            type="button"
            className="wb-secondary"
            data-testid="compress-unlock"
            disabled={!checked}
            onClick={() => {
              if (!busy && !save((v) => ({ ...v, locked: false })))
                message.error(t("vpStorage"));
            }}
          >
            {t("cUnlock")}
          </button>
        </div>
      )}
      <div className="cvt-workspace">
        <div className="cvt-body merge-grid">
          <section
            className="merge-left compress-left"
            data-testid="compress-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => void drop(e)}
          >
            <div className="merge-source-bar">
              <div>
                <strong title={draft.activePath}>
                  {draft.activePath
                    ? filenameForPath(draft.activePath)
                    : t("vpDrop")}
                </strong>
                <small>
                  {active?.available
                    ? `${byteSize(active.size)} · ${formatTrimTime(duration)} · ${active.video?.width || 0} × ${active.video?.height || 0}`
                    : t("vpNeedFiles")}
                </small>
              </div>
              <button
                type="button"
                className="wb-secondary"
                data-testid="compress-add-subtitle"
                disabled={
                  disabled || reading || subtitleChoosing || !active?.available
                }
                onClick={() => {
                  setSubtitleOpen(true);
                  void chooseSubtitle();
                }}
              >
                <Subtitles size={16} />
                {t(binding ? "vpSubReplace" : "vpSubChoose")}
              </button>
              <button
                type="button"
                className="wb-icon-button"
                disabled={disabled || reading || !draft.paths.length}
                title={t("cReload")}
                aria-label={t("cReload")}
                onClick={() => setRefresh((v) => v + 1)}
              >
                <RefreshCw size={16} />
              </button>
              <button
                type="button"
                className="wb-secondary"
                data-testid="compress-add"
                disabled={disabled || reading || draft.paths.length >= 20}
                onClick={() => void choose()}
              >
                <FolderOpen size={16} />
                {t("cChoose")}
              </button>
            </div>
            {(trialReady || !!activeSubtitle) && (
              <div
                className="compress-preview-tabs"
                role="group"
                aria-label={t("vpCompare")}
              >
                <button
                  type="button"
                  className="wb-secondary"
                  data-testid="compress-source-preview"
                  aria-pressed={!showResult && !showSubtitle}
                  onClick={() => {
                    setShowResult(false);
                    setShowSubtitle(false);
                    setSourceSeek((v) => ({
                      ms: showSubtitle
                        ? subtitleAt
                        : trialRow?.options?.compress?.trial?.startMs || 0,
                      revision: (v?.revision || 0) + 1,
                    }));
                  }}
                >
                  {t("vpSource")}
                </button>
                {trialReady && (
                  <button
                    type="button"
                    className="wb-secondary"
                    data-testid="compress-output-preview"
                    disabled={trialFile && !trialFile.available}
                    aria-pressed={showResult}
                    onClick={() => {
                      setShowSubtitle(false);
                      setShowResult(true);
                    }}
                  >
                    {t("vpTrialResult")}
                  </button>
                )}
                {!!activeSubtitle && (
                  <button
                    type="button"
                    className="wb-secondary"
                    data-testid="compress-subtitle-preview"
                    aria-pressed={showSubtitle}
                    disabled={
                      subtitleChecks.pending ||
                      !!subtitleChecks.errors[draft.activePath] ||
                      !subtitleFormValid
                    }
                    onClick={() =>
                      seekSubtitle(
                        positionRef.current?.() ??
                          parseTrimTime(trialStart) ??
                          0,
                      )
                    }
                  >
                    {t("vpSubFrame")}
                  </button>
                )}
              </div>
            )}
            {active?.available && active.media?.hasVideo && duration > 0 ? (
              showSubtitle && activeSubtitle ? (
                <SubtitlePreview
                  path={draft.activePath}
                  maxEdge={s.maxEdge}
                  atMs={subtitleAt}
                  subtitle={activeSubtitle}
                  refresh={subtitleRefresh + refresh}
                />
              ) : (
                <TrimPreview
                  key={previewPath}
                  previewOnly
                  previewErrorKey="vpPreviewFailed"
                  path={previewPath}
                  hasVideo
                  duration={previewDuration}
                  start={formatTrimTime(0)}
                  end={formatTrimTime(previewDuration)}
                  disabled={disabled}
                  change={() => {}}
                  positionRef={positionRef}
                  seekTo={previewOutput ? undefined : sourceSeek}
                  onPositionChange={(ms) => {
                    if (!previewOutput) setTrialStart(formatTrimTime(ms));
                  }}
                />
              )
            ) : (
              <div className="merge-empty-preview">
                <UploadCloud size={38} />
                <p>
                  {t(
                    reading
                      ? "c11Checking"
                      : draft.paths.length
                        ? "vpInvalidFiles"
                        : "vpDrop",
                  )}
                </p>
                <small>{t("vpLimit")}</small>
              </div>
            )}
            <div className="compress-file-list" aria-label={t("vpFiles")}>
              {draft.paths.map((path) => (
                <div
                  className={`compress-file ${path === draft.activePath ? "is-active" : ""}`}
                  key={path}
                  data-testid="compress-file"
                >
                  <button
                    type="button"
                    disabled={disabled}
                    title={path}
                    aria-pressed={path === draft.activePath}
                    onClick={() => edit({ activePath: path })}
                  >
                    {filenameForPath(path)}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    title={t("cRemoveDraft")}
                    aria-label={t("cRemoveDraft")}
                    onClick={() => {
                      edit(removeCompressionSource(draft, path));
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="compress-trial">
              <label htmlFor="compress-trial-time">{t("vpTrialStart")}</label>
              <input
                id="compress-trial-time"
                data-testid="compress-trial-time"
                disabled={disabled || showResult}
                value={trialStart}
                onFocus={() => positionRef.current?.()}
                onChange={(e) => setTrialStart(e.target.value)}
              />
              <button
                type="button"
                className="wb-secondary"
                disabled={disabled || !active || showResult}
                onClick={locate}
              >
                {t("capLocate")}
              </button>
              <select
                data-testid="compress-trial-length"
                aria-label={t("vpTrialLength")}
                disabled={disabled}
                value={draft.trialSeconds}
                onChange={(e) => edit({ trialSeconds: Number(e.target.value) })}
              >
                {[5, 10, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} s
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="wb-secondary"
                data-testid="compress-trial"
                disabled={!trialValid}
                onClick={() => void submit(true, true)}
              >
                {t("vpTrial")}
              </button>
              <small>{t("vpTrialHint")}</small>
            </div>
            {trialRow?.status === "done" && (
              <div className="compress-result">
                <strong>{t("vpTrialResult")}</strong>
                <CompressionSize
                  row={trialRow}
                  file={trialFile}
                  failed={trialOutputs.failed}
                />
                <button
                  type="button"
                  className="wb-secondary"
                  disabled={trialFile && !trialFile.available}
                  onClick={() =>
                    void action(() => shell.reveal(trialRow.outputPath))
                  }
                >
                  <FolderOpen size={14} />
                  {t("cOpenFolder")}
                </button>
              </div>
            )}
            {trial.error && (
              <p className="trim-hint" role="status">
                {t("trProgressFailed")}
              </p>
            )}
          </section>
          <aside className="cvt-settings">
            <div className="cvt-settings-scroll">
              <div
                className="cvt-quality compress-mode"
                role="group"
                aria-label={t("vpRateMode")}
              >
                {(["quality", "size"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled || (mode === "size" && nvenc)}
                    aria-pressed={sizeMode === (mode === "size")}
                    data-testid={`compress-mode-${mode}`}
                    title={
                      mode === "size" && nvenc
                        ? t("vpTargetCPUHint")
                        : undefined
                    }
                    onClick={() =>
                      change({
                        rateMode: mode,
                        targetMB: s.targetMB || 100,
                        ...(mode === "size" ? { audio: "aac" as const } : {}),
                      })
                    }
                  >
                    {t(mode === "size" ? "vpTargetMode" : "vpQualityMode")}
                  </button>
                ))}
              </div>
              <div className="compress-encoder">
                <label className="cvt-field">
                  <span>{t("vpEncoder")}</span>
                  <select
                    data-testid="compress-encoder"
                    value={s.encoder || "cpu"}
                    disabled={disabled}
                    onChange={(e) =>
                      change({
                        encoder: e.target.value as "cpu" | "nvenc",
                        cq: s.cq || 23,
                      })
                    }
                  >
                    <option value="cpu">{t("vpEncoderCPU")}</option>
                    <option
                      value="nvenc"
                      disabled={
                        sizeMode ||
                        encoders.isValidating ||
                        !!encoders.error ||
                        !encoders.data?.[s.codec].available
                      }
                    >
                      NVIDIA NVENC
                    </option>
                  </select>
                </label>
                <button
                  type="button"
                  className="wb-secondary cvt-icon"
                  data-testid="compress-encoder-refresh"
                  disabled={disabled || encoders.isValidating}
                  title={t("vpEncoderRefresh")}
                  aria-label={t("vpEncoderRefresh")}
                  onClick={() => setEncoderRefresh((v) => v + 1)}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              <p
                className="trim-hint"
                data-testid="compress-encoder-status"
                role="status"
              >
                {t(
                  sizeMode
                    ? "vpTargetCPUHint"
                    : encoders.isValidating
                      ? "vpEncoderChecking"
                      : encoders.error
                        ? "vpEncoderCheckFailed"
                        : !encoders.data?.[s.codec].available
                          ? "vpEncoderUnavailable"
                          : nvenc
                            ? "vpEncoderNVHint"
                            : "vpEncoderCPUHint",
                )}
              </p>
              <SubtitleEditor
                key={draft.activePath}
                open={subtitleOpen}
                toggle={setSubtitleOpen}
                binding={binding}
                disabled={disabled || subtitleChoosing}
                available={!!active?.available}
                info={subtitleChecks.infos[draft.activePath]}
                error={subtitleChecks.errors[draft.activePath]}
                checking={subtitleChecks.pending || subtitleChoosing}
                choose={chooseSubtitle}
                change={changeSubtitle}
                remove={() => changeSubtitle()}
                seek={seekSubtitle}
                validity={setSubtitleFormValid}
              />
              <label className="cvt-field">
                <span>{t("vpCodec")}</span>
                <select
                  data-testid="compress-codec"
                  disabled={disabled}
                  value={s.codec}
                  onChange={(e) => {
                    const codec = e.target
                      .value as CompressionSettings["codec"];
                    change({
                      codec,
                      crf: compressionCRFs[s.codec].includes(s.crf)
                        ? compressionCRFs[codec][
                            compressionCRFs[s.codec].indexOf(s.crf)
                          ]
                        : s.crf,
                    });
                  }}
                >
                  <option
                    value="h264"
                    disabled={nvenc && !encoders.data?.h264.available}
                  >
                    H.264{nvenc ? " / NVENC" : " / x264"}
                  </option>
                  <option
                    value="hevc"
                    disabled={nvenc && !encoders.data?.hevc.available}
                  >
                    H.265{nvenc ? " / NVENC" : " / x265"}
                  </option>
                </select>
                <small>
                  {t(s.codec === "h264" ? "vpH264Hint" : "vpH265Hint")}
                </small>
              </label>
              {!sizeMode && (
                <div
                  className="cvt-quality"
                  role="group"
                  aria-label={t("vpPresets")}
                >
                  {qualityPresets.map((crf, i) => (
                    <button
                      type="button"
                      key={crf}
                      disabled={disabled}
                      aria-pressed={quality === crf}
                      data-testid={`compress-quality-${i}`}
                      onClick={() => change(nvenc ? { cq: crf } : { crf })}
                    >
                      {t(["vpQuality", "vpBalanced", "vpSmall"][i])}
                    </button>
                  ))}
                </div>
              )}
              <div className="compress-pair">
                {sizeMode ? (
                  <label className="cvt-field">
                    <span>{t("vpTargetLabel")}</span>
                    <input
                      data-testid="compress-target"
                      type="number"
                      min={1}
                      max={100000}
                      step={1}
                      disabled={disabled}
                      value={targetText}
                      onBlur={() => {
                        if (
                          !/^\d{1,6}$/.test(targetText) ||
                          Number(targetText) < 1 ||
                          Number(targetText) > 100000
                        )
                          setTargetText(String(s.targetMB || 100));
                      }}
                      onChange={(e) => {
                        setTargetText(e.target.value);
                        if (
                          /^\d{1,6}$/.test(e.target.value) &&
                          Number(e.target.value) >= 1 &&
                          Number(e.target.value) <= 100000
                        )
                          change({ targetMB: Number(e.target.value) });
                      }}
                    />
                  </label>
                ) : (
                  <label className="cvt-field">
                    <span>{nvenc ? "CQ" : "CRF"}</span>
                    <input
                      type="number"
                      min={nvenc ? 1 : 0}
                      max={51}
                      step={1}
                      data-testid={nvenc ? "compress-cq" : "compress-crf"}
                      disabled={disabled}
                      value={crfText}
                      onBlur={() => {
                        if (
                          !/^\d{1,2}$/.test(crfText) ||
                          Number(crfText) > 51 ||
                          Number(crfText) < (nvenc ? 1 : 0)
                        )
                          setCrfText(String(quality));
                      }}
                      onChange={(e) => {
                        setCrfText(e.target.value);
                        if (
                          /^\d{1,2}$/.test(e.target.value) &&
                          Number(e.target.value) >= (nvenc ? 1 : 0) &&
                          Number(e.target.value) <= 51
                        )
                          change(
                            nvenc
                              ? { cq: Number(e.target.value) }
                              : { crf: Number(e.target.value) },
                          );
                      }}
                    />
                  </label>
                )}
                <label className="cvt-field">
                  <span>{t("vpSpeed")}</span>
                  <select
                    data-testid="compress-speed"
                    disabled={disabled}
                    value={s.preset}
                    onChange={(e) =>
                      change({
                        preset: e.target.value as CompressionSettings["preset"],
                      })
                    }
                  >
                    {["fast", "medium", "slow"].map((p) => (
                      <option key={p} value={p}>
                        {t(`vpSpeed_${p}`)}
                        {nvenc
                          ? ` / ${({ fast: "P2", medium: "P4", slow: "P6" } as Record<string, string>)[p]}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="trim-hint">
                {t(
                  sizeMode ? "vpTargetHint" : nvenc ? "vpCQHint" : "vpCRFHint",
                )}
              </p>
              {sizeMode &&
                active &&
                (() => {
                  const rate = compressionTargetBitrate(
                    (s.targetMB || 0) * 1000000,
                    duration,
                    active.media?.hasAudio ? s.bitrate : 0,
                  );
                  return (
                    rate !== undefined && (
                      <p
                        className="trim-hint"
                        data-testid="compress-target-rate"
                      >
                        {t("vpTargetRate", { rate: Math.round(rate / 1000) })}
                      </p>
                    )
                  );
                })()}
              <label className="cvt-field">
                <span>{t("cFormat")}</span>
                <select
                  data-testid="compress-format"
                  disabled={disabled}
                  value={s.format}
                  onChange={(e) =>
                    change({
                      format: e.target.value as CompressionSettings["format"],
                    })
                  }
                >
                  <option value="mp4">MP4</option>
                  <option value="mkv">MKV</option>
                </select>
              </label>
              <label className="cvt-field">
                <span>{t("c09VideoSize")}</span>
                <select
                  data-testid="compress-size"
                  disabled={disabled}
                  value={s.maxEdge}
                  onChange={(e) => change({ maxEdge: Number(e.target.value) })}
                >
                  <option value={0}>{t("c09OriginalSize")}</option>
                  {videoSizePresets.map((p) => (
                    <option
                      key={p.width}
                      value={p.width}
                      disabled={!canSelectVideoSize(p.width, sizeLimit)}
                    >
                      {p.name} ({p.width} × {p.height})
                    </option>
                  ))}
                </select>
                <small>{t("c122VideoSizeHint")}</small>
              </label>
              <label className="cvt-field">
                <span>{t("capFps")}</span>
                <select
                  data-testid="compress-fps"
                  disabled={disabled}
                  value={s.fps}
                  onChange={(e) => change({ fps: Number(e.target.value) })}
                >
                  <option value={0}>{t("capSourceFps")}</option>
                  {[24, 25, 30, 50, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} fps
                    </option>
                  ))}
                </select>
              </label>
              <label className="cvt-field">
                <span>{t("vpAudio")}</span>
                <select
                  data-testid="compress-audio"
                  disabled={disabled}
                  value={s.audio}
                  onChange={(e) =>
                    change({
                      audio: e.target.value as CompressionSettings["audio"],
                    })
                  }
                >
                  <option value="aac">AAC</option>
                  <option value="copy" disabled={sizeMode}>
                    {t("vpAudioCopy")}
                  </option>
                </select>
              </label>
              {s.audio === "aac" && (
                <label className="cvt-field">
                  <span>{t("c09Bitrate")}</span>
                  <select
                    data-testid="compress-bitrate"
                    disabled={disabled}
                    value={s.bitrate}
                    onChange={(e) =>
                      change({ bitrate: Number(e.target.value) })
                    }
                  >
                    {[64, 96, 128, 192, 256, 320].map((n) => (
                      <option key={n} value={n}>
                        {n} kbps
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="cvt-field">
                <label htmlFor="compress-directory-mode">
                  {t("c09OutputFolder")}
                </label>
                <select
                  id="compress-directory-mode"
                  data-testid="compress-directory-mode"
                  disabled={disabled}
                  value={s.customDirectory ? "custom" : "source"}
                  onChange={(e) =>
                    change({ customDirectory: e.target.value === "custom" })
                  }
                >
                  <option value="source">{t("c09SourceFolder")}</option>
                  <option value="custom">{t("c09CustomFolder")}</option>
                </select>
                {s.customDirectory && (
                  <div className="cvt-folder-input">
                    <input
                      data-testid="compress-directory"
                      aria-label={t("c09OutputFolder")}
                      disabled={disabled}
                      value={s.directory}
                      onChange={(e) => change({ directory: e.target.value })}
                    />
                    <button
                      type="button"
                      className="wb-secondary"
                      disabled={disabled}
                      aria-label={t("c09ChooseFolder")}
                      title={t("c09ChooseFolder")}
                      onClick={() => void directory()}
                    >
                      <FolderOpen size={16} />
                    </button>
                  </div>
                )}
              </div>
              <p className="trim-hint">{t("vpScopeHint")}</p>
            </div>
            <div className="cvt-actions">
              <button
                type="button"
                className="wb-primary"
                data-testid="compress-start"
                disabled={!valid}
                aria-describedby="compress-hint"
                onClick={() => void submit(true)}
              >
                <Clapperboard size={16} />
                {t("vpStart", { count: draft.paths.length })}
              </button>
              <button
                type="button"
                className="wb-secondary"
                data-testid="compress-queue"
                disabled={!valid}
                onClick={() => void submit(false)}
              >
                {t("cQueue")}
              </button>
              <small role="status" id="compress-hint">
                {t(hint)}
              </small>
            </div>
          </aside>
        </div>
      </div>
      <MergeHistory
        kind="compress"
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
