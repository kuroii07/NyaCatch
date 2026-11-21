import { useEffect, useRef, useState, type DragEvent } from "react";
import { App } from "antd";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FolderOpen,
  GripVertical,
  History,
  ListPlus,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LocalFileCheck } from "@mediago/shared-common";
import { getConversions } from "@/api/conversion";
import { useConversions } from "@/hooks/use-conversions";
import { usePlatform } from "@/hooks/use-platform";
import { useMergeWorkspace } from "@/store/merge-workspace";
import {
  filenameForPath,
  isLosslessFormat,
} from "../converter-page/converter-model";
import { formatTrimTime } from "../trim-page/trim-model";
import TrimPreview from "../trim-page/trim-preview";
import TrimBatchProgress from "../trim-page/trim-batch-progress";
import {
  appendMergeItems,
  mergeFormats,
  mergeMode,
  MERGE_LIMIT,
  moveMergeItem,
  removeMergeItem,
  validMergeName,
  type MergeDraft,
} from "./merge-model";
import { defaultMergeName } from "./use-merge-handoff";
import MergeHistory from "./merge-history";
import "../converter-page/converter.css";
import "../trim-page/trim.css";
import "./merge.css";

export default function MergePage() {
  const { t } = useTranslation(),
    { message } = App.useApp(),
    { shell, dialog } = usePlatform();
  const { draft, busy, storageError, save } = useMergeWorkspace();
  const [files, setFiles] = useState<LocalFileCheck[]>([]),
    [reading, setReading] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1),
    [historyOpen, setHistoryOpen] = useState(false),
    [checked, setChecked] = useState(false),
    [revision, setRevision] = useState(0);
  const generation = useRef(0),
    adding = useRef(false),
    dragged = useRef<string | undefined>(undefined);
  const tasks = useConversions({ current: page, pageSize: 50, kind: "merge" });
  const signature = JSON.stringify(
    [...new Set(draft.items.map((item) => item.path))].sort(),
  );
  const ordered = draft.items.map(
    (item) =>
      files.find((file) => file.path === item.path) || {
        path: item.path,
        available: false,
      },
  );
  const mode = mergeMode(ordered),
    active = draft.items.find((item) => item.id === draft.activeId),
    media = ordered.find((file) => file.path === active?.path)?.media;
  const total = ordered.reduce(
      (sum, file) => sum + (file.media?.durationMs || 0),
      0,
    ),
    disabled = busy || draft.locked;
  const formats =
    mergeFormats[
      mode || (mergeFormats.audio.includes(draft.format) ? "audio" : "video")
    ];
  const hint = busy
    ? "mgBusy"
    : draft.locked
      ? "mgUnknown"
      : reading
        ? "c11Checking"
        : draft.items.length < 2
          ? "mgNeedFiles"
          : !mode
            ? "mgInvalidFiles"
            : !validMergeName(draft.name)
              ? "trInvalidName"
              : draft.customDirectory && !draft.directory.trim()
                ? "c09NeedFolder"
                : "mgReady";
  const valid = hint === "mgReady" && formats.includes(draft.format);
  function edit(update: (draft: MergeDraft) => MergeDraft) {
    const state = useMergeWorkspace.getState();
    if (state.busy || state.draft.locked) return;
    if (!save(update)) message.error(t("mgStorageError"));
  }
  function change(patch: Partial<MergeDraft>) {
    edit((current) => ({ ...current, ...patch }));
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
      .then((values) => {
        if (!cancelled) setFiles(values);
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
  async function add(paths: string[], epoch: number, snapshot: MergeDraft) {
    if (epoch !== generation.current || !paths.length) return;
    if (paths.length + snapshot.items.length > MERGE_LIMIT) {
      message.warning(t("mgLimit"));
      return;
    }
    const values = await shell.checkFiles(
        [...snapshot.items.map((item) => item.path), ...paths],
        true,
      ),
      kind = mergeMode(values);
    if (epoch !== generation.current) return;
    const state = useMergeWorkspace.getState();
    if (state.busy || state.draft.locked || state.draft !== snapshot) {
      message.warning(t("mgDraftChanged"));
      return;
    }
    if (!kind) {
      message.error(t("mgInvalidFiles"));
      return;
    }
    edit((current) => ({
      ...appendMergeItems(current, paths),
      format: mergeFormats[kind].includes(current.format)
        ? current.format
        : kind === "video"
          ? "mp4"
          : "mp3",
      name: current.name || defaultMergeName(paths[0]),
    }));
  }
  async function choose() {
    if (disabled || adding.current) return;
    const epoch = ++generation.current,
      snapshot = useMergeWorkspace.getState().draft;
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
  async function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || adding.current) return;
    const native = Array.from(event.dataTransfer.files);
    if (!native.length) return;
    const epoch = ++generation.current,
      snapshot = useMergeWorkspace.getState().draft;
    adding.current = true;
    setReading(true);
    try {
      const paths = await Promise.all(
        native.map((file) => dialog.pathForDroppedFile(file)),
      );
      if (paths.some((path) => !path)) throw Error("unavailable");
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
      setRevision((value) => value + 1);
    } catch {
      message.error(t("cLoadError"));
    }
  }
  async function submit(startNow: boolean) {
    const state = useMergeWorkspace.getState();
    if (!valid || state.busy || state.draft.locked || adding.current) return;
    const snapshot = state.draft;
    useMergeWorkspace.setState({ busy: true });
    try {
      const current = await shell.checkFiles(
          snapshot.items.map((item) => item.path),
          true,
        ),
        kind = mergeMode(current);
      if (
        !kind ||
        current.length !== snapshot.items.length ||
        !mergeFormats[kind].includes(snapshot.format)
      ) {
        setFiles(current);
        message.error(t("mgInvalidFiles"));
        return;
      }
      if (!save((value) => ({ ...value, locked: true, recentIds: [] }))) {
        message.error(t("mgStorageError"));
        return;
      }
      let created;
      try {
        created = await tasks.addConversion({
          name: snapshot.name.trim(),
          path: snapshot.items[0].path,
          outputFormat: snapshot.format,
          quality: snapshot.quality,
          options: {
            version: 1,
            outputDir: snapshot.customDirectory
              ? snapshot.directory.trim()
              : undefined,
            merge: {
              paths: snapshot.items.map((item) => item.path),
              name: snapshot.name.trim(),
            },
          },
        });
      } catch {
        setChecked(false);
        message.error(t("mgUnknown"));
        return;
      }
      if (
        !save((value) => ({
          ...value,
          items: [],
          activeId: "",
          recentIds: [created.id],
          locked: false,
        }))
      ) {
        message.error(t("mgStorageError"));
        return;
      }
      setPage(1);
      setRevision((value) => value + 1);
      if (startNow) {
        try {
          await tasks.startConversion(created.id);
        } catch {
          message.warning(t("cStartFailed"));
        } finally {
          setRevision((value) => value + 1);
        }
      } else message.success(t("cAdded", { count: 1 }));
    } catch {
      message.error(t("mgInvalidFiles"));
    } finally {
      useMergeWorkspace.setState({ busy: false });
    }
  }
  async function checkRecords() {
    try {
      await getConversions({ current: 1, pageSize: 50, kind: "merge" });
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
  return (
    <div
      className="wb-page cvt-page trim-page merge-page"
      data-testid="merge-page"
    >
      <header className="wb-page-heading">
        <div>
          <h1>{t("mgTitle")}</h1>
          <p>{t("mgDescription")}</p>
        </div>
        <div className="trim-page-tools">
          <button
            className="wb-secondary trim-history-toggle"
            type="button"
            data-testid="merge-history-toggle"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen(true)}
          >
            <History size={16} />
            {t("mgHistory")}
            <span>{tasks.data?.total || 0}</span>
          </button>
          <span className="cvt-local">
            <ShieldCheck size={15} />
            {t("cLocal")}
          </span>
        </div>
      </header>
      <TrimBatchProgress
        scope="merge"
        ids={draft.recentIds}
        revision={revision}
        openHistory={() => setHistoryOpen(true)}
        action={action}
      />
      {storageError && (
        <p className="cvt-uncertain" role="alert">
          {t("mgStorageError")}
        </p>
      )}
      {draft.locked && !busy && (
        <div className="cvt-uncertain" role="alert">
          <p>{t("mgUnknown")}</p>
          <button
            type="button"
            className="wb-secondary"
            data-testid="merge-check-records"
            onClick={() => void checkRecords()}
          >
            {t("cCheckRecords")}
          </button>
          <button
            type="button"
            className="wb-secondary"
            data-testid="merge-unlock"
            disabled={!checked}
            onClick={() => {
              if (!busy && !save((value) => ({ ...value, locked: false })))
                message.error(t("mgStorageError"));
            }}
          >
            {t("cUnlock")}
          </button>
        </div>
      )}
      <div className="cvt-workspace">
        <div className="cvt-body merge-grid">
          <section
            className="merge-left"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => void drop(event)}
            data-testid="merge-dropzone"
          >
            <div className="merge-source-bar">
              <div>
                <strong title={active?.path}>
                  {active ? filenameForPath(active.path) : t("mgDrop")}
                </strong>
                <small data-testid="merge-total">
                  {t("mgTotal", {
                    count: draft.items.length,
                    duration: formatTrimTime(total),
                  })}
                </small>
              </div>
              <button
                type="button"
                className="wb-icon-button"
                disabled={disabled || reading || !draft.items.length}
                aria-label={t("cReload")}
                title={t("cReload")}
                onClick={() => setRefresh((value) => value + 1)}
              >
                <RefreshCw size={16} />
              </button>
              <button
                type="button"
                className="wb-secondary"
                disabled={
                  disabled || reading || draft.items.length >= MERGE_LIMIT
                }
                data-testid="merge-add"
                onClick={() => void choose()}
              >
                <ListPlus size={15} />
                {t("mgAdd")}
              </button>
            </div>
            {active && media && media.durationMs > 0 ? (
              <TrimPreview
                key={active.id}
                previewOnly
                path={active.path}
                hasVideo={media.hasVideo}
                duration={media.durationMs}
                start={formatTrimTime(0)}
                end={formatTrimTime(media.durationMs)}
                disabled={disabled}
                change={() => {}}
              />
            ) : (
              <div className="merge-empty-preview">
                <UploadCloud size={38} />
                <p>
                  {t(
                    draft.items.length
                      ? reading
                        ? "c11Checking"
                        : "mgInvalidFiles"
                      : "mgDrop",
                  )}
                </p>
                <small>{t("mgNeedFiles")}</small>
              </div>
            )}
            <div className="merge-list-heading">
              <strong>
                {t("mgFiles")} {draft.items.length}/{MERGE_LIMIT}
              </strong>
              <small>{t("mgOrder")}</small>
            </div>
            <div
              className="merge-list"
              data-testid="merge-list"
              role="list"
              aria-label={t("mgFiles")}
            >
              {draft.items.map((item, index) => (
                <div
                  role="listitem"
                  key={item.id}
                  data-testid="merge-item"
                  className={`merge-item ${item.id === draft.activeId ? "is-active" : ""}`}
                  onDragOver={(event) => {
                    if (dragged.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => {
                    if (dragged.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      const id = dragged.current;
                      dragged.current = undefined;
                      edit((value) => moveMergeItem(value, id, index));
                    }
                  }}
                >
                  <span
                    className="merge-grip"
                    draggable={!disabled && !reading}
                    onDragStart={(event) => {
                      dragged.current = item.id;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        "application/x-nyacatch-merge-item",
                        item.id,
                      );
                    }}
                    onDragEnd={() => {
                      dragged.current = undefined;
                    }}
                    title={t("mgOrder")}
                  >
                    <GripVertical size={15} />
                  </span>
                  <button
                    type="button"
                    className="merge-select"
                    disabled={disabled}
                    aria-pressed={item.id === draft.activeId}
                    onClick={() => change({ activeId: item.id })}
                    title={item.path}
                  >
                    <span>
                      {index + 1}. {filenameForPath(item.path)}
                    </span>
                    <small
                      className={!ordered[index]?.available ? "cvt-error" : ""}
                    >
                      {ordered[index]?.media
                        ? formatTrimTime(ordered[index].media?.durationMs || 0)
                        : t(reading ? "c11Checking" : "c11Missing")}
                    </small>
                  </button>
                  <button
                    className="wb-icon-button"
                    type="button"
                    aria-label={t("mgUp")}
                    title={t("mgUp")}
                    disabled={disabled || reading || index === 0}
                    onClick={() =>
                      edit((value) => moveMergeItem(value, item.id, index - 1))
                    }
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="wb-icon-button"
                    type="button"
                    aria-label={t("mgDown")}
                    title={t("mgDown")}
                    disabled={
                      disabled || reading || index === draft.items.length - 1
                    }
                    onClick={() =>
                      edit((value) => moveMergeItem(value, item.id, index + 1))
                    }
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    className="wb-icon-button"
                    type="button"
                    aria-label={t("mgRemove")}
                    title={t("mgRemove")}
                    disabled={disabled || reading}
                    onClick={() =>
                      edit((value) => removeMergeItem(value, item.id))
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
          <aside className="cvt-settings merge-settings">
            <div className="cvt-settings-scroll">
              <h2>{t("mgTitle")}</h2>
              <p className="trim-hint">
                {t(mode === "audio" ? "mgAudioHint" : "mgVideoHint")}
              </p>
              <div className="cvt-field">
                <label htmlFor="merge-name">{t("mgName")}</label>
                <input
                  id="merge-name"
                  data-testid="merge-name"
                  value={draft.name}
                  disabled={disabled}
                  aria-invalid={!!draft.name && !validMergeName(draft.name)}
                  onChange={(event) => change({ name: event.target.value })}
                />
                <small>{t("mgNameHint")}</small>
              </div>
              <div className="cvt-field">
                <label htmlFor="merge-format">{t("cFormat")}</label>
                <div className="cvt-select">
                  <select
                    id="merge-format"
                    data-testid="merge-format"
                    value={draft.format}
                    disabled={disabled || reading}
                    onChange={(event) => change({ format: event.target.value })}
                  >
                    {formats.map((format) => (
                      <option value={format} key={format}>
                        {format.toUpperCase()}
                      </option>
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
                      aria-pressed={quality === draft.quality}
                      disabled={disabled || isLosslessFormat(draft.format)}
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
                <label htmlFor="merge-directory-mode">{t("cSave")}</label>
                <div className="cvt-select">
                  <select
                    id="merge-directory-mode"
                    data-testid="merge-directory-mode"
                    value={draft.customDirectory ? "custom" : "source"}
                    disabled={disabled}
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
                      data-testid="merge-directory"
                      aria-label={t("c09OutputFolder")}
                      disabled={disabled}
                      value={draft.directory}
                      onChange={(event) =>
                        change({ directory: event.target.value })
                      }
                    />
                    <button
                      className="wb-secondary"
                      type="button"
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
              <p className="trim-hint">
                <ShieldCheck size={14} />
                {t("cSafe")}
              </p>
            </div>
            <div className="cvt-actions" data-testid="merge-actions">
              <button
                type="button"
                className="wb-primary"
                data-testid="merge-start"
                disabled={!valid}
                aria-describedby="merge-action-hint"
                onClick={() => void submit(true)}
              >
                <ListPlus size={16} />
                {t("mgExport")}
              </button>
              <button
                type="button"
                className="wb-secondary"
                data-testid="merge-queue"
                disabled={!valid}
                aria-describedby="merge-action-hint"
                onClick={() => void submit(false)}
              >
                {t("cQueue")}
              </button>
              <small role="status" id="merge-action-hint">
                {t(hint)}
              </small>
            </div>
          </aside>
        </div>
      </div>
      <MergeHistory
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
