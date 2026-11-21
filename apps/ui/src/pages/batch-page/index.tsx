import { extractShareLinks } from "../../utils/share-links";
import CollectionPicker from "./collection-picker";
import { inputsForCollection } from "./collection-model";
import type { CollectionEntry, MediaCollection } from "../../api/media";
import {
  SaveOrganizationControls,
  useSaveOrganization,
} from "../../components/save-organization";
import { useDownloadDuplicates } from "../../hooks/use-download-duplicates";
import {
  BATCH_DRAFT_KEY,
  encodeBatchDraft,
  decodeBatchDraft,
  restoreSelections,
  type BatchRow,
} from "./batch-draft";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { App } from "antd";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSWRConfig } from "swr";
import { createDownloadTasks, getDownloadTasks } from "@/api/download-task";
import type { DownloadTaskWithFile } from "@mediago/shared-common";
import {
  removeMediaPlayback,
  resolveMedia,
  type MediaPreview,
} from "@/api/media";
import { usePlatform } from "@/hooks/use-platform";
import { useAppStore } from "@/store/app";
import { mediaParseErrorKey } from "../workbench-page/media-error";
import { videoChoices } from "../workbench-page/media-selection";
import {
  BatchSelectionError,
  buildBatchTasks,
  parseBatchInput,
  resourcesForPreview,
  type BatchInput,
  type BatchItem,
  type BatchMode,
  type BatchSettings,
} from "./batch-model";
import { runBatch } from "./batch-runner";
import "./batch.css";

export default function BatchPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const reviewDuplicates = useDownloadDuplicates();
  const [organization, setOrganization] = useSaveOrganization();
  const [initial] = useState(() => {
    try {
      return {
        value: decodeBatchDraft(localStorage.getItem(BATCH_DRAFT_KEY)),
        error: false,
      };
    } catch {
      return { value: null, error: true };
    }
  });
  const [storageError, setStorageError] = useState(initial.error);
  const { message } = App.useApp();
  const { dialog } = usePlatform();
  const { mutate } = useSWRConfig();
  const local = useAppStore((state) => state.local);
  const [draft, setDraft] = useState(initial.value?.input || "");
  const [collectionSource, setCollectionSource] = useState(
    initial.value?.collectionSource || "",
  );
  const [rows, setRows] = useState<BatchRow[]>(initial.value?.rows || []);
  const rowsRef = useRef(rows);
  const [settings, setSettings] = useState<BatchSettings>(
    initial.value?.settings || {
      saveDir: local || "",
      mode: "auto",
      audioFormat: "original",
      bitrate: 192,
    },
  );
  const [parsing, setParsing] = useState(false);
  const parsingRef = useRef(false);
  const [submission, setSubmission] = useState<
    "idle" | "submitting" | "unknown"
  >(initial.value?.submission || "idle");
  const [recentTasks, setRecentTasks] = useState<DownloadTaskWithFile[] | null>(
    null,
  );
  const [queueChecking, setQueueChecking] = useState(false);
  const [queueCheckFailed, setQueueCheckFailed] = useState(false);
  const submissionRef = useRef(false);
  const [inputError, setInputError] = useState("");
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);

  function saveDraft(
    nextRows = rowsRef.current,
    nextSubmission: "idle" | "unknown" = submission === "idle"
      ? "idle"
      : "unknown",
  ) {
    localStorage.setItem(
      BATCH_DRAFT_KEY,
      encodeBatchDraft({
        version: 1,
        collectionSource,
        input: draft,
        rows: nextRows,
        settings,
        submission: nextSubmission,
      }),
    );
  }
  useEffect(() => {
    if (initial.error && !draft && !rows.length) return;
    try {
      saveDraft();
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [draft, rows, settings, submission, collectionSource]);
  useEffect(() => {
    const incoming = location.state?.collectionURL;
    if (typeof incoming === "string" && submission === "idle")
      setCollectionSource(incoming);
  }, [location.key, submission]);
  useEffect(() => {
    const incoming = location.state?.incomingLinks;
    if (
      !Array.isArray(incoming) ||
      !incoming.every((v) => typeof v === "string") ||
      submission !== "idle"
    )
      return;
    setDraft((value) =>
      [...new Set([...value.split(/\r?\n/).filter(Boolean), ...incoming])].join(
        "\n",
      ),
    );
    navigate(location.pathname + location.search, {
      replace: true,
      state: null,
    });
  }, [location.key, submission]);
  function replaceRows(next: BatchRow[]) {
    rowsRef.current = next;
    if (mounted.current) setRows(next);
  }
  async function release(preview?: MediaPreview) {
    if (!preview?.previewSession) return;
    try {
      await removeMediaPlayback(preview.previewSession);
    } catch (reason) {
      console.warn("Could not release a batch thumbnail session", reason);
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      request.current?.abort();
      for (const row of rowsRef.current) void release(row.preview);
    };
  }, []);

  async function begin(
    inputs: BatchInput[],
    indices: number[],
    fresh: boolean,
  ) {
    if (parsingRef.current || submissionRef.current) return;
    parsingRef.current = true;
    const ticket = ++generation.current;
    request.current?.abort();
    const oldPreviews = fresh ? rowsRef.current.map((row) => row.preview) : [];
    if (fresh) {
      replaceRows(
        inputs.map(
          (input): BatchRow => ({
            ...input,
            status: "waiting",
            items:
              rowsRef.current.find((row) => row.url === input.url)?.items || [],
          }),
        ),
      );
    } else {
      replaceRows(
        rowsRef.current.map((row, index) =>
          indices.includes(index)
            ? { ...row, status: "waiting", error: undefined }
            : row,
        ),
      );
    }
    const controller = new AbortController();
    request.current = controller;
    setParsing(true);
    try {
      await Promise.all(oldPreviews.map(release));
      if (ticket !== generation.current || !mounted.current) return;
      await runBatch(
        inputs,
        controller.signal,
        resolveMedia,
        (index, status, preview, error) => {
          if (ticket !== generation.current || !mounted.current) {
            if (preview) void release(preview);
            return;
          }
          const target = indices[index];
          const next = [...rowsRef.current];
          const previous = next[target];
          if (!previous) {
            if (preview) void release(preview);
            return;
          }
          next[target] = {
            ...previous,
            status,
            error,
            preview: preview || previous.preview,
            items: preview
              ? restoreSelections(
                  resourcesForPreview(preview, previous.url),
                  previous.items,
                )
              : previous.items,
          };
          replaceRows(next);
        },
        release,
      );
    } finally {
      if (request.current === controller) parsingRef.current = false;
      if (ticket === generation.current && mounted.current) {
        request.current = null;
        setParsing(false);
      }
    }
  }

  function parseAll() {
    try {
      const inputs = parseBatchInput(draft, collectionSource ? 200 : 20).map(
        (input) =>
          Object.assign(input, {
            collection: rowsRef.current.find((row) => row.url === input.url)
              ?.collection,
          }),
      );
      if (!inputs.length) return;
      setInputError("");
      void begin(
        inputs,
        inputs.map((_, index) => index),
        true,
      );
    } catch {
      setInputError(t(collectionSource ? "clLimit" : "btLimit"));
    }
  }
  function retry(index: number) {
    const row = rowsRef.current[index];
    if (row?.valid && (row.status === "error" || row.status === "canceled"))
      void begin(
        [{ url: row.url, valid: true, collection: row.collection }],
        [index],
        false,
      );
  }
  function clear() {
    if (submissionRef.current) return;
    generation.current++;
    request.current?.abort();
    request.current = null;
    parsingRef.current = false;
    for (const row of rowsRef.current) void release(row.preview);
    replaceRows([]);
    setParsing(false);
    setDraft("");
    setCollectionSource("");
    setInputError("");
  }
  function importCollection(entries: CollectionEntry[], source: string) {
    if (parsingRef.current || submission !== "idle" || submissionRef.current)
      return;
    try {
      const inputs = inputsForCollection(
        draft,
        entries,
        source,
        rowsRef.current,
      );
      setCollectionSource(source);
      setDraft(inputs.map((input) => input.url).join("\n"));
      setInputError("");
      void begin(
        inputs,
        inputs.map((_, index) => index),
        true,
      );
    } catch {
      setInputError(t("clLimit"));
    }
  }
  function changeItem(key: string, update: (item: BatchItem) => BatchItem) {
    replaceRows(
      rowsRef.current.map((row) => ({
        ...row,
        items: row.items.map((item) =>
          item.key === key ? update(item) : item,
        ),
      })),
    );
  }
  function chooseAll(selected: boolean, rowIndex?: number) {
    replaceRows(
      rowsRef.current.map((row, index) =>
        rowIndex !== undefined && rowIndex !== index
          ? row
          : {
              ...row,
              items: row.items.map((item) =>
                item.submitted ? item : { ...item, selected },
              ),
            },
      ),
    );
  }
  async function pickFolder(key?: string) {
    try {
      const paths = await dialog.open({ type: "directory" });
      if (!paths?.[0]) return;
      if (key)
        changeItem(key, (item) => ({
          ...item,
          overrides: { ...item.overrides, saveDir: paths[0] },
        }));
      else setSettings((value) => ({ ...value, saveDir: paths[0] }));
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("btNeedFolder"),
      );
    }
  }

  const items = useMemo(
    () =>
      rows
        .filter((row) => row.status === "success")
        .flatMap((row) => row.items),
    [rows],
  );
  const selected = items.filter((item) => item.selected && !item.submitted);
  const validation = useMemo(() => {
    try {
      return {
        tasks: buildBatchTasks(items, settings, organization),
        error: null,
      };
    } catch (error) {
      return {
        tasks: [],
        error:
          error instanceof BatchSelectionError
            ? error
            : new BatchSelectionError("mode"),
      };
    }
  }, [items, settings, organization]);
  const validationText =
    validation.error &&
    t(
      validation.error.code === "directory"
        ? "btNeedFolder"
        : validation.error.code === "limit"
          ? "btTooMany"
          : "btUnavailable",
    );
  async function inspectRecentTasks() {
    setQueueChecking(true);
    setQueueCheckFailed(false);
    try {
      const result = await getDownloadTasks({ current: 1, pageSize: 50 });
      if (mounted.current) setRecentTasks(result.list);
    } catch {
      if (mounted.current) {
        setRecentTasks(null);
        setQueueCheckFailed(true);
      }
    } finally {
      if (mounted.current) setQueueChecking(false);
    }
  }
  async function submit(start: boolean) {
    if (
      submissionRef.current ||
      submission !== "idle" ||
      parsing ||
      !validation.tasks.length ||
      validation.error
    )
      return;
    submissionRef.current = true;
    setSubmission("submitting");
    let creationStarted = false;
    try {
      const accepted = await reviewDuplicates(validation.tasks);
      if (!accepted?.length || !mounted.current) {
        if (mounted.current) setSubmission("idle");
        return;
      }
      const keys = new Set(
        selected
          .filter((_, index) => accepted.includes(validation.tasks[index]))
          .map((item) => item.key),
      );
      // Save the uncertain state before sending: a crash or navigation must never enable a blind resubmit.
      saveDraft(rowsRef.current, "unknown");
      creationStarted = true;
      const created = await createDownloadTasks(accepted, start);
      if (!Array.isArray(created) || created.length !== accepted.length)
        throw new Error("Unexpected task response");
      const selectedKeys = new Set(selected.map((item) => item.key));
      const nextRows = rowsRef.current.map((row) => ({
        ...row,
        items: row.items.map((item) =>
          keys.has(item.key)
            ? { ...item, submitted: true, selected: false }
            : selectedKeys.has(item.key)
              ? { ...item, selected: false }
              : item,
        ),
      }));
      saveDraft(nextRows, "idle");
      if (mounted.current) {
        replaceRows(nextRows);
        setSubmission("idle");
        message.success(t("btDone", { count: created.length }));
      }
      void mutate(
        (cache) =>
          Array.isArray(cache) &&
          (cache[0] === "workbench-recent" || cache[0] === "media-tasks"),
      ).catch((reason) => console.warn("Could not refresh tasks", reason));
    } catch (reason) {
      if (mounted.current && !creationStarted) {
        setSubmission("idle");
        message.error(
          reason instanceof Error ? reason.message : t("efSaveFailed"),
        );
      }
      if (mounted.current && creationStarted) {
        setRecentTasks(null);
        setQueueCheckFailed(false);
        setSubmission("unknown");
      }
    } finally {
      submissionRef.current = false;
    }
  }
  const locked = submission !== "idle";

  return (
    <div className="wb-page batch-page" data-testid="batch-page">
      <header className="wb-page-heading">
        <div>
          <h1>{t("btTitle")}</h1>
          <p>{t("btHint")}</p>
        </div>
        <Link className="wb-secondary" to="/">
          <ArrowLeft size={16} />
          {t("btBack")}
        </Link>
      </header>
      {initial.value && rows.some((row) => row.status === "canceled") && (
        <p className="ef-draft-notice" data-testid="batch-draft-restored">
          {t("efDraft")}
        </p>
      )}
      {storageError && (
        <p className="batch-error" role="alert">
          {t("efSaveFailed")}
        </p>
      )}
      <CollectionPicker
        initialURL={collectionSource}
        initialPage={
          (location.state?.collectionPage as MediaCollection | undefined)
            ?.url === collectionSource
            ? location.state.collectionPage
            : undefined
        }
        disabled={parsing || locked}
        onParse={importCollection}
      />
      <section className="batch-input-card" aria-label={t("btInput")}>
        <label htmlFor="batch-input">{t("btInput")}</label>
        <textarea
          id="batch-input"
          data-testid="batch-input"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setInputError("");
          }}
          onPaste={(event) => {
            const links = extractShareLinks(
              event.clipboardData.getData("text"),
            );
            if (!links.length) return;
            event.preventDefault();
            const input = event.currentTarget;
            setDraft(
              draft.slice(0, input.selectionStart) +
                links.join("\n") +
                draft.slice(input.selectionEnd),
            );
            setInputError("");
          }}
          placeholder={t("efBatchPlaceholder")}
          spellCheck={false}
          disabled={parsing || locked}
        />
        <div className="batch-input-footer">
          <span>{t(collectionSource ? "clHint" : "btAdvancedHint")}</span>
          <div className="batch-actions">
            <button
              className="wb-secondary"
              type="button"
              data-testid="batch-clear"
              onClick={clear}
              disabled={locked || (!draft && !rows.length)}
            >
              {t("btClear")}
            </button>
            {parsing ? (
              <button
                className="wb-secondary"
                type="button"
                data-testid="batch-cancel"
                onClick={() => request.current?.abort()}
              >
                {t("btCancel")}
              </button>
            ) : (
              <button
                className="wb-primary"
                type="button"
                data-testid="batch-parse"
                onClick={parseAll}
                disabled={!draft.trim() || locked}
              >
                {t("btParse")}
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        </div>
        {inputError && (
          <p className="batch-error" role="alert">
            {inputError}
          </p>
        )}
      </section>
      <section className="batch-settings" aria-label={t("btSettings")}>
        <div className="batch-section-title">
          <h2>{t("btSettings")}</h2>
          <span>{t("btSelected", { count: selected.length })}</span>
        </div>
        <div className="batch-settings-grid">
          <label className="batch-folder">
            <span>{t("btFolder")}</span>
            <div className="batch-folder-input">
              <input
                data-testid="batch-folder"
                value={settings.saveDir}
                onChange={(event) =>
                  setSettings((value) => ({
                    ...value,
                    saveDir: event.target.value,
                  }))
                }
                disabled={locked}
              />
              <button
                type="button"
                className="wb-icon-button"
                aria-label={t("btChoose")}
                disabled={locked}
                onClick={() => void pickFolder()}
              >
                <FolderOpen size={17} />
              </button>
            </div>
          </label>
          <label>
            <span>{t("btMode")}</span>
            <select
              data-testid="batch-mode"
              value={settings.mode}
              onChange={(event) =>
                setSettings((value) => ({
                  ...value,
                  mode: event.target.value as BatchMode,
                }))
              }
              disabled={locked}
            >
              <option value="auto">{t("btAuto")}</option>
              <option value="video">{t("btVideo")}</option>
              <option value="audio">{t("btAudio")}</option>
              <option value="cover">{t("btCover")}</option>
            </select>
          </label>
          <label>
            <span>{t("btAudioFormat")}</span>
            <select
              value={settings.audioFormat}
              onChange={(event) =>
                setSettings((value) => ({
                  ...value,
                  audioFormat: event.target.value as "original" | "mp3",
                }))
              }
              disabled={locked}
            >
              <option value="original">{t("btOriginal")}</option>
              <option value="mp3">MP3</option>
            </select>
          </label>
          {settings.audioFormat === "mp3" && (
            <label>
              <span>{t("btBitrate")}</span>
              <select
                value={settings.bitrate}
                onChange={(event) =>
                  setSettings((value) => ({
                    ...value,
                    bitrate: Number(event.target.value) as 128 | 192 | 320,
                  }))
                }
                disabled={locked}
              >
                {[128, 192, 320].map((n) => (
                  <option key={n} value={n}>
                    {n} kbps
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>
      <SaveOrganizationControls
        value={organization}
        disabled={locked}
        onChange={(next) => {
          try {
            setOrganization(next);
          } catch {
            message.error(t("efSaveFailed"));
          }
        }}
        path={
          validation.tasks[0]
            ? validation.tasks[0].options?.saveDir +
              (validation.tasks[0].options?.saveDir?.includes("\\")
                ? "\\"
                : "/") +
              validation.tasks[0].name
            : undefined
        }
      />
      <section className="batch-results" aria-label={t("btTitle")}>
        <div className="batch-section-title">
          <h2>{t("btSelected", { count: selected.length })}</h2>
          <div className="batch-actions">
            <button
              type="button"
              className="batch-text-button"
              disabled={locked || !items.length}
              onClick={() => chooseAll(true)}
            >
              {t("btAll")}
            </button>
            <button
              type="button"
              className="batch-text-button"
              disabled={locked || !items.length}
              onClick={() => chooseAll(false)}
            >
              {t("btNone")}
            </button>
          </div>
        </div>
        {!rows.length && (
          <div className="batch-empty">
            <ImageIcon size={24} />
            <strong>{t("btNoResult")}</strong>
            <span>{t("btEmpty")}</span>
          </div>
        )}
        {rows.map((row, rowIndex) => (
          <article className="batch-row" data-testid="batch-row" key={row.url}>
            <div className="batch-row-heading">
              <div className="batch-row-source">
                <span className="batch-number">
                  {String(rowIndex + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong title={row.preview?.title || row.url}>
                    {row.preview?.title || row.url}
                  </strong>
                  <span title={row.url}>
                    {row.preview?.source ? `${row.preview.source} · ` : ""}
                    {row.url}
                  </span>
                </div>
              </div>
              <div className="batch-row-state">
                <span
                  data-testid="batch-row-status"
                  className={`batch-status is-${row.status}`}
                >
                  {row.status === "loading" && (
                    <LoaderCircle size={14} className="wb-spin" />
                  )}
                  {t(
                    {
                      waiting: "btWaiting",
                      loading: "btLoading",
                      success: "btSuccess",
                      error: "btError",
                      canceled: "btCanceled",
                    }[row.status],
                  )}
                </span>
                {(row.status === "error" || row.status === "canceled") &&
                  row.valid && (
                    <button
                      type="button"
                      className="batch-text-button"
                      data-testid="batch-retry"
                      disabled={parsing || locked}
                      onClick={() => retry(rowIndex)}
                    >
                      <RotateCcw size={14} />
                      {t("btRetry")}
                    </button>
                  )}
              </div>
            </div>
            {row.status === "error" && (
              <div className="batch-row-error" role="alert">
                <span>
                  {row.error === "invalid-url"
                    ? t("btInvalid")
                    : t(mediaParseErrorKey(row.error || "", row.url))}
                </span>
                {row.error && row.error !== "invalid-url" && (
                  <details>
                    <summary>{t("btDetails")}</summary>
                    <p>{row.error}</p>
                  </details>
                )}
              </div>
            )}
            {row.items.length > 0 && (
              <div className="batch-resources">
                {row.items.length > 1 && (
                  <div className="batch-resource-header">
                    <span>{t("btResources", { count: row.items.length })}</span>
                    <button
                      className="batch-text-button"
                      type="button"
                      disabled={locked}
                      onClick={() => chooseAll(true, rowIndex)}
                    >
                      {t("btSelectAllResources")}
                    </button>
                  </div>
                )}
                {row.items.map((item) => {
                  const mode =
                    item.preview.kind === "image"
                      ? "image"
                      : (item.overrides.mode ?? settings.mode) === "auto"
                        ? item.preview.kind
                        : (item.overrides.mode ?? settings.mode);
                  const choices = videoChoices(item.preview);
                  const selectedError = (() => {
                    try {
                      buildBatchTasks(
                        [{ ...item, selected: true, submitted: false }],
                        settings,
                        organization,
                      );
                      return null;
                    } catch (error) {
                      return error instanceof BatchSelectionError &&
                        error.code === "directory"
                        ? "btNeedFolder"
                        : "btUnavailable";
                    }
                  })();
                  return (
                    <div
                      className="batch-resource"
                      data-testid="batch-resource"
                      key={item.key}
                    >
                      <div className="batch-resource-main">
                        <input
                          type="checkbox"
                          data-testid="batch-resource-check"
                          aria-label={t("btSelectItem", {
                            name: item.preview.title,
                          })}
                          checked={item.selected}
                          disabled={item.submitted || locked}
                          onChange={(event) =>
                            changeItem(item.key, (value) => ({
                              ...value,
                              selected: event.target.checked,
                            }))
                          }
                        />
                        <div className="batch-thumb">
                          {item.preview.displayThumbnail ? (
                            <img src={item.preview.displayThumbnail} alt="" />
                          ) : (
                            <ImageIcon size={21} />
                          )}
                        </div>
                        <div className="batch-resource-copy">
                          <strong title={item.preview.title}>
                            {item.preview.title}
                          </strong>
                          <span>
                            {t(
                              item.preview.kind === "image"
                                ? [
                                    "xiaohongshu-public",
                                    "douyin-browser",
                                  ].includes(item.preview.resolver || "")
                                  ? "mrXhsImage"
                                  : "btImage"
                                : item.preview.kind === "audio"
                                  ? "btAudio"
                                  : "btVideo",
                            )}
                            {item.total > 1
                              ? ` · ${item.index + 1}/${item.total}`
                              : ""}
                            {item.submitted ? ` · ${t("btSubmitted")}` : ""}
                          </span>
                        </div>
                        {item.submitted && (
                          <Check size={18} className="batch-check" />
                        )}
                      </div>
                      {!item.submitted && (
                        <details className="batch-item-details">
                          <summary>{t("btIndividual")}</summary>
                          <div className="batch-item-controls">
                            {item.preview.kind !== "image" && (
                              <label>
                                <span>{t("btMode")}</span>
                                <select
                                  data-testid="batch-item-mode"
                                  value={item.overrides.mode || ""}
                                  disabled={locked}
                                  onChange={(event) =>
                                    changeItem(item.key, (value) => ({
                                      ...value,
                                      overrides: {
                                        ...value.overrides,
                                        mode: (event.target.value ||
                                          undefined) as BatchMode | undefined,
                                        qualityId: undefined,
                                      },
                                    }))
                                  }
                                >
                                  <option value="">{t("btShared")}</option>
                                  <option value="auto">{t("btAuto")}</option>
                                  <option value="video">{t("btVideo")}</option>
                                  <option value="audio">{t("btAudio")}</option>
                                  <option value="cover">{t("btCover")}</option>
                                </select>
                              </label>
                            )}
                            {mode === "video" && choices.length > 0 && (
                              <label>
                                <span>{t("btQuality")}</span>
                                <select
                                  data-testid="batch-item-quality"
                                  value={item.overrides.qualityId || ""}
                                  disabled={locked}
                                  onChange={(event) =>
                                    changeItem(item.key, (value) => ({
                                      ...value,
                                      overrides: {
                                        ...value.overrides,
                                        qualityId:
                                          event.target.value || undefined,
                                      },
                                    }))
                                  }
                                >
                                  <option value="">{t("btBest")}</option>
                                  {choices.map((choice) => (
                                    <option key={choice.id} value={choice.id}>
                                      {choice.height
                                        ? `${choice.height}p`
                                        : choice.extension.toUpperCase()}
                                      {choice.fps > 30
                                        ? ` · ${choice.fps} fps`
                                        : ""}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            {mode === "audio" && (
                              <label>
                                <span>{t("btAudioFormat")}</span>
                                <select
                                  value={item.overrides.audioFormat || ""}
                                  disabled={locked}
                                  onChange={(event) =>
                                    changeItem(item.key, (value) => ({
                                      ...value,
                                      overrides: {
                                        ...value.overrides,
                                        audioFormat: (event.target.value ||
                                          undefined) as
                                          | "original"
                                          | "mp3"
                                          | undefined,
                                      },
                                    }))
                                  }
                                >
                                  <option value="">{t("btShared")}</option>
                                  <option value="original">
                                    {t("btOriginal")}
                                  </option>
                                  <option value="mp3">MP3</option>
                                </select>
                              </label>
                            )}
                            {mode === "audio" &&
                              (item.overrides.audioFormat ??
                                settings.audioFormat) === "mp3" && (
                                <label>
                                  <span>{t("btBitrate")}</span>
                                  <select
                                    value={item.overrides.bitrate || ""}
                                    disabled={locked}
                                    onChange={(event) =>
                                      changeItem(item.key, (value) => ({
                                        ...value,
                                        overrides: {
                                          ...value.overrides,
                                          bitrate: event.target.value
                                            ? (Number(event.target.value) as
                                                | 128
                                                | 192
                                                | 320)
                                            : undefined,
                                        },
                                      }))
                                    }
                                  >
                                    <option value="">{t("btShared")}</option>
                                    {[128, 192, 320].map((n) => (
                                      <option key={n} value={n}>
                                        {n} kbps
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}
                            <label className="batch-folder">
                              <span>{t("btOverrideFolder")}</span>
                              <div className="batch-folder-input">
                                <input
                                  data-testid="batch-item-folder"
                                  value={item.overrides.saveDir || ""}
                                  placeholder={t("btShared")}
                                  disabled={locked}
                                  onChange={(event) =>
                                    changeItem(item.key, (value) => ({
                                      ...value,
                                      overrides: {
                                        ...value.overrides,
                                        saveDir:
                                          event.target.value || undefined,
                                      },
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="wb-icon-button"
                                  aria-label={t("btChoose")}
                                  disabled={locked}
                                  onClick={() => void pickFolder(item.key)}
                                >
                                  <FolderOpen size={17} />
                                </button>
                              </div>
                            </label>
                          </div>
                        </details>
                      )}
                      {!item.submitted && item.selected && selectedError && (
                        <p className="batch-error">{t(selectedError)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </section>
      {validationText && selected.length > 0 && (
        <p className="batch-error" role="alert">
          {validationText}
        </p>
      )}
      {submission === "unknown" && (
        <div className="batch-unknown" role="alert">
          <span>{t("btUnknown")}</span>
          <div className="batch-actions">
            <button
              type="button"
              className="wb-secondary"
              data-testid="batch-check-queue"
              disabled={queueChecking}
              onClick={() => void inspectRecentTasks()}
            >
              {t("btCheckQueue")}
            </button>
            <button
              type="button"
              className="wb-secondary"
              data-testid="batch-unlock"
              disabled={queueChecking || recentTasks === null}
              onClick={() => setSubmission("idle")}
            >
              {t("btUnlock")}
            </button>
          </div>
          {queueCheckFailed && <span>{t("btQueueCheckFailed")}</span>}
          {recentTasks && (
            <div
              className="batch-recent-queue"
              data-testid="batch-recent-queue"
            >
              <strong>{t("btRecentQueue")}</strong>
              {recentTasks.length ? (
                recentTasks.map((task) => (
                  <div key={task.id}>
                    <b>
                      #{task.id} · {task.name}
                    </b>
                    <span title={task.url}>{task.url}</span>
                  </div>
                ))
              ) : (
                <span>{t("btNoRecent")}</span>
              )}
            </div>
          )}
        </div>
      )}
      <footer className="batch-submit">
        <div>
          <strong>{t("btSelected", { count: selected.length })}</strong>
          <span>{t("btEmpty")}</span>
        </div>
        <div className="batch-actions">
          <button
            type="button"
            className="wb-secondary"
            data-testid="batch-queue"
            disabled={
              parsing ||
              locked ||
              !validation.tasks.length ||
              !!validation.error
            }
            onClick={() => void submit(false)}
          >
            {t("btQueue")}
          </button>
          <button
            type="button"
            className="wb-primary"
            data-testid="batch-start"
            disabled={
              parsing ||
              locked ||
              !validation.tasks.length ||
              !!validation.error
            }
            onClick={() => void submit(true)}
          >
            {submission === "submitting" ? (
              <LoaderCircle size={17} className="wb-spin" />
            ) : (
              <ArrowRight size={17} />
            )}{" "}
            {t(submission === "submitting" ? "btCreating" : "btStart")}
          </button>
        </div>
      </footer>
    </div>
  );
}
