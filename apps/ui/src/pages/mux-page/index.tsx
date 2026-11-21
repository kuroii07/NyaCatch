import { useEffect, useRef, useState, type DragEvent } from "react";
import { App } from "antd";
import {
  Boxes,
  FolderOpen,
  History,
  Music2,
  Subtitles,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  inspectMux,
  inspectSubtitle,
  getConversions,
  type MuxInspection,
} from "@/api/conversion";
import { useConversions } from "@/hooks/use-conversions";
import { usePlatform } from "@/hooks/use-platform";
import { useMuxWorkspace } from "@/store/mux-workspace";
import { filenameForPath } from "../converter-page/converter-model";
import { byteSize } from "../compress-page/compress-model";
import { formatTrimTime } from "../trim-page/trim-model";
import TrimPreview from "../trim-page/trim-preview";
import TrimBatchProgress from "../trim-page/trim-batch-progress";
import MergeHistory from "../merge-page/merge-history";
import {
  addMuxPaths,
  removeMuxPath,
  muxFormats,
  muxProblem,
  inspectMuxPaths,
  type MuxDraft,
} from "./mux-model";
import "../converter-page/converter.css";
import "../trim-page/trim.css";
import "../merge-page/merge.css";
import "./mux.css";

export default function MuxPage() {
  const { t } = useTranslation(),
    { message } = App.useApp(),
    { dialog } = usePlatform();
  const { draft, busy, storageError, save } = useMuxWorkspace();
  const [checks, setChecks] = useState<Record<string, MuxInspection>>({}),
    [errors, setErrors] = useState<Record<string, boolean>>({}),
    [reading, setReading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [choosing, setChoosing] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [page, setPage] = useState(1),
    [reviewed, setReviewed] = useState(false),
    [revision, setRevision] = useState(0);
  const tasks = useConversions({ kind: "mux", current: page, pageSize: 50 });
  const generation = useRef(0),
    disabled = busy || draft.locked;
  const audio = draft.mode === "combine" ? draft.audioPath : "",
    subtitleSettings =
      draft.mode === "combine"
        ? {
            subtitlePath: draft.subtitlePath,
            subtitleHash: draft.subtitleHash,
            convertSubtitle: draft.convertSubtitle,
          }
        : {},
    signature = JSON.stringify([draft.paths, audio, subtitleSettings]);
  const active = checks[draft.activePath],
    media = active?.source,
    duration = media?.durationMs || 0;
  const problem = muxProblem(draft, checks, errors, reading),
    valid = !busy && !choosing && !problem;
  function reasonText(reason: string) {
    if (reason.startsWith("mxCodec:")) {
      const [, type, codec] = reason.split(":");
      return t("mxCodec", {
        type: t(`mxType_${type}`, { defaultValue: type }),
        codec: codec || "—",
      });
    }
    return t(reason);
  }
  function update(change: (d: MuxDraft) => MuxDraft) {
    const s = useMuxWorkspace.getState();
    if (s.busy || s.draft.locked) return;
    if (!save(change)) message.error(t("mxStorage"));
  }
  function patch(value: Partial<MuxDraft>) {
    update((d) => ({ ...d, ...value }));
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
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    const [paths, audioPath, subtitle]: [
      string[],
      string,
      {
        subtitlePath?: string;
        subtitleHash?: string;
        convertSubtitle?: boolean;
      },
    ] = JSON.parse(signature);
    setChecks({});
    setErrors({});
    setReviewed(false);
    if (!paths.length) {
      setReading(false);
      return;
    }
    setReading(true);
    void inspectMuxPaths(paths, audioPath, (path, external) =>
      inspectMux(path, external, abort.signal, subtitle),
    )
      .then((v) => {
        if (!abort.signal.aborted) {
          setChecks(v.values);
          setErrors(v.errors);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setReading(false);
      });
    return () => abort.abort();
  }, [signature, refresh]);
  async function select(
    kind: "video" | "audio" | "subtitle",
    provided?: string[],
  ) {
    const state = useMuxWorkspace.getState();
    if (state.busy || state.draft.locked || choosing) return;
    const epoch = ++generation.current,
      snapshot = state.draft;
    setChoosing(true);
    try {
      const paths =
        provided ||
        (await dialog.open({
          type: "file",
          multiple: kind === "video",
          filters: [
            {
              name:
                kind === "video"
                  ? t("mxVideo")
                  : t(kind === "subtitle" ? "mxSubtitle" : "mxAudio"),
              extensions:
                kind === "video"
                  ? [
                      "mp4",
                      "mkv",
                      "mov",
                      "flv",
                      "ts",
                      "m4v",
                      "webm",
                      "avi",
                      "m2ts",
                    ]
                  : kind === "subtitle"
                    ? ["srt", "ass"]
                    : [
                        "m4a",
                        "aac",
                        "mp3",
                        "wav",
                        "flac",
                        "ogg",
                        "opus",
                        "ac3",
                        "eac3",
                        "dts",
                        "mka",
                      ],
            },
          ],
        }));
      if (epoch !== generation.current || !paths?.length) return;
      const latest = useMuxWorkspace.getState();
      if (latest.busy || latest.draft.locked || latest.draft !== snapshot) {
        message.warning(t("mgDraftChanged"));
        return;
      }
      if (kind === "subtitle") {
        if (paths.length !== 1) {
          message.warning(t("mxOneSubtitle"));
          return;
        }
        const info = await inspectSubtitle(paths[0]);
        const current = useMuxWorkspace.getState();
        if (
          epoch !== generation.current ||
          current.busy ||
          current.draft.locked ||
          current.draft !== snapshot
        )
          return;
        patch({
          mode: "combine",
          subtitlePath: paths[0],
          subtitleHash: info.hash,
          convertSubtitle: false,
        });
        // Reselecting restored contents can keep the same signature while the
        // previous inspection still describes a changed or missing file.
        setRefresh((v) => v + 1);
      } else if (kind === "audio") {
        if (paths.length !== 1) {
          message.warning(t("mxSingleAudio"));
          return;
        }
        patch({ audioPath: paths[0] });
      } else {
        const next = addMuxPaths(snapshot, paths);
        if (
          paths.length > 20 ||
          next.paths.length <
            new Set(
              [...snapshot.paths, ...paths].map((p) =>
                p.replace(/\//g, "\\").toLowerCase(),
              ),
            ).size
        ) {
          message.warning(t("mxLimit"));
          return;
        }
        update(() => next);
      }
    } catch {
      message.error(
        t(kind === "subtitle" ? "mxSubtitleReadFailed" : "mxReadFailed"),
      );
    } finally {
      if (epoch === generation.current) setChoosing(false);
    }
  }
  async function drop(e: DragEvent, kind: "video" | "audio" | "subtitle") {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || choosing) return;
    try {
      const paths = await Promise.all(
        Array.from(e.dataTransfer.files).map((f) =>
          dialog.pathForDroppedFile(f),
        ),
      );
      await select(
        kind === "video" &&
          paths.length > 0 &&
          paths.every((p) => /\.(srt|ass)$/i.test(p))
          ? "subtitle"
          : kind,
        paths,
      );
    } catch {
      message.error(t("mxReadFailed"));
    }
  }
  async function action(callback: () => Promise<unknown>) {
    try {
      await callback();
      setRevision((v) => v + 1);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t("cFailed"));
    }
  }
  async function directory() {
    try {
      const paths = await dialog.open({ type: "directory" });
      if (paths?.[0]) patch({ customDirectory: true, directory: paths[0] });
    } catch {
      message.error(t("c09NeedFolder"));
    }
  }
  async function review() {
    try {
      await getConversions({ kind: "mux", current: 1, pageSize: 50 });
      setPage(1);
      await tasks.mutate();
      setReviewed(true);
      setHistoryOpen(true);
    } catch {
      message.error(t("cLoadError"));
    }
  }
  async function submit(start: boolean) {
    const state = useMuxWorkspace.getState();
    if (state.busy || state.draft.locked || !valid) return;
    const snapshot = state.draft;
    useMuxWorkspace.setState({ busy: true });
    try {
      const inspected = await inspectMuxPaths(
        snapshot.paths,
        snapshot.mode === "combine" ? snapshot.audioPath : "",
        (path, audioPath) =>
          inspectMux(
            path,
            audioPath,
            undefined,
            snapshot.mode === "combine"
              ? {
                  subtitlePath: snapshot.subtitlePath,
                  subtitleHash: snapshot.subtitleHash,
                  convertSubtitle: snapshot.convertSubtitle,
                }
              : undefined,
          ),
      );
      setChecks(inspected.values);
      setErrors(inspected.errors);
      const issue = muxProblem(
        snapshot,
        inspected.values,
        inspected.errors,
        false,
      );
      if (issue) {
        message.error(reasonText(issue));
        return;
      }
      if (!save((d) => ({ ...d, locked: true, recentIds: [] }))) {
        message.error(t("mxStorage"));
        return;
      }
      setReviewed(false);
      // Confirm each saved ID before submitting the next file, so an unknown
      // response cannot create the rest of the batch without a durable record.
      for (const path of snapshot.paths) {
        let row;
        try {
          row = await tasks.addConversion({
            name: filenameForPath(path),
            path,
            outputFormat: snapshot.format,
            quality: "medium",
            options: {
              version: 1,
              outputDir: snapshot.customDirectory
                ? snapshot.directory.trim()
                : undefined,
              mux: {
                audioPath:
                  snapshot.mode === "combine" ? snapshot.audioPath : undefined,
                subtitlePath:
                  snapshot.mode === "combine"
                    ? snapshot.subtitlePath
                    : undefined,
                subtitleHash:
                  snapshot.mode === "combine"
                    ? snapshot.subtitleHash
                    : undefined,
                convertSubtitle:
                  snapshot.mode === "combine" && !!snapshot.subtitlePath
                    ? snapshot.convertSubtitle
                    : undefined,
              },
            },
          });
        } catch {
          message.error(t("mxUnknown"));
          return;
        }
        if (!row || !Number.isSafeInteger(row.id) || row.id <= 0) {
          message.error(t("mxUnknown"));
          return;
        }
        if (!save((d) => ({ ...d, recentIds: [...d.recentIds, row.id] }))) {
          message.error(t("mxStorage"));
          return;
        }
        if (start) {
          try {
            await tasks.startConversion(row.id);
          } catch {
            message.warning(t("mxStartUnknown"));
          }
        }
      }
      if (!save((d) => ({ ...d, locked: false }))) {
        message.error(t("mxStorage"));
        return;
      }
      setRevision((v) => v + 1);
    } finally {
      useMuxWorkspace.setState({ busy: false });
    }
  }
  return (
    <div
      className="wb-page cvt-page trim-page merge-page mux-page"
      data-testid="mux-page"
    >
      <header className="wb-page-heading">
        <div>
          <h1>{t("mxTitle")}</h1>
        </div>
        <div className="trim-page-tools">
          <button
            type="button"
            className="wb-secondary trim-history-toggle"
            data-testid="mux-history-toggle"
            aria-expanded={historyOpen}
            onClick={() => {
              setHistoryOpen(true);
              void action(tasks.mutate);
            }}
          >
            <History size={16} />
            {t("mxHistory")}
            <span>{tasks.data?.total || 0}</span>
          </button>
          <span className="cvt-local">
            <ShieldCheck size={14} />
            {t("cLocal")}
          </span>
        </div>
      </header>
      {((draft.locked && !busy) || storageError) && (
        <div className="cvt-uncertain" role="alert">
          <span>{t(storageError ? "mxStorage" : "mxUnknown")}</span>
          <button
            type="button"
            className="wb-secondary"
            data-testid="mux-check-records"
            disabled={busy}
            onClick={() => void review()}
          >
            {t("cCheckRecords")}
          </button>
          <button
            type="button"
            className="wb-secondary"
            data-testid="mux-unlock"
            disabled={busy || !reviewed}
            onClick={() => {
              if (!busy && !save((d) => ({ ...d, locked: false })))
                message.error(t("mxStorage"));
            }}
          >
            {t("cUnlock")}
          </button>
        </div>
      )}
      <div className="cvt-workspace">
        <div className="cvt-body merge-grid">
          <section
            className="merge-left mux-left"
            data-testid="mux-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => void drop(e, "video")}
          >
            <div className="merge-source-bar">
              <div>
                <strong title={draft.activePath}>
                  {draft.activePath
                    ? filenameForPath(draft.activePath)
                    : t("mxDrop")}
                </strong>
                <small>
                  {media
                    ? `${byteSize(media.size)} · ${formatTrimTime(duration)} · ${media.streams.filter((s) => s.codec_type === "audio").length} ${t("mxAudioTracks")}`
                    : t("mxNeedVideo")}
                </small>
              </div>
              <button
                type="button"
                className="wb-icon-button"
                title={t("cReload")}
                aria-label={t("cReload")}
                data-testid="mux-refresh"
                disabled={disabled || choosing || !draft.paths.length}
                onClick={() => setRefresh((v) => v + 1)}
              >
                <RefreshCw size={16} />
              </button>
              <button
                type="button"
                className="wb-secondary"
                data-testid="mux-add"
                disabled={disabled || choosing || draft.paths.length >= 20}
                onClick={() => void select("video")}
              >
                <FolderOpen size={16} />
                {t("cChoose")}
              </button>
            </div>
            {media?.streams.some((s) => s.codec_type === "video") &&
            duration > 0 ? (
              <TrimPreview
                key={draft.activePath}
                previewOnly
                previewErrorKey="mxPreviewFailed"
                path={draft.activePath}
                hasVideo
                duration={duration}
                start={formatTrimTime(0)}
                end={formatTrimTime(duration)}
                disabled={disabled}
                change={() => {}}
              />
            ) : (
              <div className="merge-empty-preview">
                <UploadCloud size={40} />
                <p>{t("mxDrop")}</p>
                <small>{t("mxNoEncode")}</small>
              </div>
            )}
            <div className="mux-files" role="list" aria-label={t("mxVideo")}>
              {draft.paths.map((path) => {
                const info = checks[path],
                  issue = info?.formats.find((f) => f.format === draft.format);
                return (
                  <div
                    className={`mux-file ${path === draft.activePath ? "is-active" : ""}`}
                    key={path}
                    data-testid="mux-file"
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={path === draft.activePath}
                      title={path}
                      onClick={() => patch({ activePath: path })}
                    >
                      <strong>{filenameForPath(path)}</strong>
                      <small>
                        {errors[path]
                          ? t("mxReadFailed")
                          : reading
                            ? t("c11Checking")
                            : issue?.available
                              ? `${info.source.streams
                                  .filter((s) => s.codec_type === "video")
                                  .map((s) => s.codec_name.toUpperCase())
                                  .join(" / ")} → ${draft.format.toUpperCase()}`
                              : reasonText(issue?.reason || "mxReadFailed")}
                      </small>
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      title={t("cRemoveDraft")}
                      aria-label={t("cRemoveDraft")}
                      onClick={() => update((d) => removeMuxPath(d, path))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            {draft.mode === "combine" && (
              <small className="trim-hint">{t("mxPreviewHint")}</small>
            )}
            <TrimBatchProgress
              ids={draft.recentIds}
              revision={revision}
              scope="mux"
              openHistory={() => {
                setHistoryOpen(true);
                void action(tasks.mutate);
              }}
              action={action}
            />
          </section>
          <aside className="cvt-settings">
            <div className="cvt-settings-scroll">
              <div
                className="cvt-quality mux-mode"
                role="group"
                aria-label={t("mxMode")}
              >
                {(["remux", "combine"] as const).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    data-testid={`mux-mode-${mode}`}
                    disabled={disabled || choosing}
                    aria-pressed={draft.mode === mode}
                    onClick={() => patch({ mode })}
                  >
                    {t(mode === "remux" ? "mxRemux" : "mxCombine")}
                  </button>
                ))}
              </div>
              <p className="trim-hint">
                {t(draft.mode === "remux" ? "mxRemuxHint" : "mxCombineHint")}
              </p>
              {draft.mode === "combine" && (
                <div
                  className="mux-audio"
                  data-testid="mux-audio-dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => void drop(e, "audio")}
                >
                  <label className="cvt-field">
                    <span>{t("mxAudioOptional")}</span>
                    <div className="mux-path">
                      <input
                        readOnly
                        value={draft.audioPath}
                        title={draft.audioPath}
                        placeholder={t("mxAudioDrop")}
                      />
                      <button
                        type="button"
                        className="wb-secondary"
                        data-testid="mux-audio-choose"
                        aria-label={t("mxChooseAudio")}
                        title={t("mxChooseAudio")}
                        disabled={disabled || choosing}
                        onClick={() => void select("audio")}
                      >
                        <Music2 size={16} />
                      </button>
                    </div>
                  </label>
                  {draft.audioPath && (
                    <button
                      type="button"
                      className="wb-secondary"
                      data-testid="mux-audio-remove"
                      disabled={disabled}
                      onClick={() => patch({ audioPath: "" })}
                    >
                      {t("cRemoveDraft")}
                    </button>
                  )}
                  {active?.audio && (
                    <p
                      className="trim-hint"
                      data-testid="mux-duration-difference"
                    >
                      {t("mxAudioDuration", {
                        duration: formatTrimTime(active.audio.durationMs),
                      })}
                      <br />
                      {t(
                        Math.abs(active.audio.durationMs - duration) < 100
                          ? "mxSameDuration"
                          : active.audio.durationMs > duration
                            ? "mxLongAudio"
                            : "mxShortAudio",
                      )}
                    </p>
                  )}
                </div>
              )}
              {draft.mode === "combine" && (
                <div
                  className="mux-subtitle"
                  data-testid="mux-subtitle-dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => void drop(e, "subtitle")}
                >
                  <label className="cvt-field">
                    <span>{t("mxSubtitleOptional")}</span>
                    <div className="mux-path">
                      <input
                        readOnly
                        aria-label={t("mxSubtitle")}
                        value={draft.subtitlePath || ""}
                        title={draft.subtitlePath}
                        placeholder={t("mxSubtitleDrop")}
                      />
                      <button
                        type="button"
                        className="wb-secondary"
                        data-testid="mux-subtitle-choose"
                        title={t("mxChooseSubtitle")}
                        aria-label={t("mxChooseSubtitle")}
                        disabled={disabled || choosing}
                        onClick={() => void select("subtitle")}
                      >
                        <Subtitles size={16} />
                      </button>
                    </div>
                  </label>
                  {draft.subtitlePath && (
                    <button
                      type="button"
                      className="wb-secondary"
                      data-testid="mux-subtitle-remove"
                      disabled={disabled || choosing}
                      onClick={() =>
                        patch({
                          subtitlePath: "",
                          subtitleHash: "",
                          convertSubtitle: false,
                        })
                      }
                    >
                      {t("cRemoveDraft")}
                    </button>
                  )}
                  <small className="trim-hint mux-subtitle-hint">
                    {t("mxSoftSubtitleHint")}
                  </small>
                  {!!draft.subtitlePath && (
                    <>
                      <p
                        className="trim-hint"
                        data-testid="mux-subtitle-status"
                      >
                        {reasonText(
                          reading
                            ? "c11Checking"
                            : errors[draft.activePath]
                              ? "mxSubtitleReadFailed"
                              : active?.subtitle
                                ? draft.subtitleHash !== active.subtitle.hash
                                  ? "mxSubtitleChanged"
                                  : "mxSubtitleReady"
                                : "mxSubtitleReadFailed",
                        )}
                        {active?.subtitle &&
                          ` · ${active.subtitle.format.toUpperCase()} · ${active.subtitle.events}`}
                      </p>
                      {/\.srt$/i.test(draft.subtitlePath) && (
                        <label className="mux-subtitle-convert">
                          <input
                            type="checkbox"
                            data-testid="mux-subtitle-convert"
                            checked={!!draft.convertSubtitle}
                            disabled={disabled || choosing}
                            onChange={(e) =>
                              patch({ convertSubtitle: e.target.checked })
                            }
                          />
                          <span>{t("mxSubtitleConvert")}</span>
                        </label>
                      )}
                    </>
                  )}
                </div>
              )}
              <label className="cvt-field">
                <span>{t("mxFormat")}</span>
                <select
                  data-testid="mux-format"
                  disabled={disabled}
                  value={draft.format}
                  onChange={(e) =>
                    patch({ format: e.target.value as MuxDraft["format"] })
                  }
                >
                  {muxFormats.map((format) => (
                    <option
                      key={format}
                      value={format}
                      disabled={
                        draft.paths.length > 0 &&
                        (reading ||
                          draft.paths.some(
                            (p) =>
                              !checks[p]?.formats.find(
                                (f) => f.format === format,
                              )?.available,
                          ))
                      }
                    >
                      {format.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <p
                className="trim-hint"
                data-testid="mux-compatibility"
                role="status"
              >
                {reasonText(busy ? "mxBusy" : problem || "mxCompatible")}
              </p>
              {media && (
                <details className="mux-track-details" data-testid="mux-tracks">
                  <summary>{t("mxTracks")}</summary>
                  <ul>
                    {media.streams.map((s) => (
                      <li key={s.index}>
                        {t(`mxType_${s.codec_type}`, {
                          defaultValue: s.codec_type,
                        })}{" "}
                        · {s.codec_name?.toUpperCase() || "—"}
                        {s.tags?.language ? ` · ${s.tags.language}` : ""}
                        {s.codec_type === "audio" &&
                        draft.mode === "combine" &&
                        draft.audioPath
                          ? ` · ${t("mxReplaced")}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                  <small>{t("mxKeepTracks")}</small>
                </details>
              )}
              <label className="cvt-field">
                <span>{t("c09OutputFolder")}</span>
                <select
                  data-testid="mux-directory-mode"
                  value={draft.customDirectory ? "custom" : "source"}
                  disabled={disabled}
                  onChange={(e) =>
                    patch({ customDirectory: e.target.value === "custom" })
                  }
                >
                  <option value="source">{t("c09SourceFolder")}</option>
                  <option value="custom">{t("c09CustomFolder")}</option>
                </select>
              </label>
              {draft.customDirectory && (
                <div className="mux-path">
                  <input
                    data-testid="mux-directory"
                    aria-label={t("c09OutputFolder")}
                    value={draft.directory}
                    disabled={disabled}
                    onChange={(e) => patch({ directory: e.target.value })}
                  />
                  <button
                    type="button"
                    className="wb-secondary"
                    title={t("c09ChooseFolder")}
                    aria-label={t("c09ChooseFolder")}
                    disabled={disabled}
                    onClick={() => void directory()}
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
              )}
              <p className="trim-hint">{t("mxScope")}</p>
            </div>
            <div className="cvt-actions">
              <button
                type="button"
                className="wb-primary"
                data-testid="mux-start"
                disabled={!valid}
                aria-describedby="mux-hint"
                onClick={() => void submit(true)}
              >
                <Boxes size={16} />
                {t("mxStart", { count: draft.paths.length })}
              </button>
              <button
                type="button"
                className="wb-secondary"
                data-testid="mux-queue"
                disabled={!valid}
                onClick={() => void submit(false)}
              >
                {t("cQueue")}
              </button>
              <small id="mux-hint" role="status">
                {reasonText(
                  busy
                    ? "mxBusy"
                    : choosing
                      ? "c11Checking"
                      : problem || "mxReady",
                )}
              </small>
            </div>
          </aside>
        </div>
      </div>
      <MergeHistory
        kind="mux"
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
