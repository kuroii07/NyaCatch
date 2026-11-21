import { extractShareLinks, validMediaLink } from "../../utils/share-links";
import { organizeOutput } from "../../utils/save-organization";
import {
  SaveOrganizationControls,
  useSaveOrganization,
} from "../../components/save-organization";
import { useDownloadDuplicates } from "../../hooks/use-download-duplicates";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { App, Tooltip } from "antd";
import {
  ArrowRight,
  Check,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Music2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { DownloadType } from "@mediago/shared-common";
import { useSWRConfig } from "swr";
import DownloadForm, { type DownloadFormRef } from "@/components/download-form";
import {
  autoDiscoverCollection,
  collectionCandidate,
} from "../batch-page/collection-model";
import { createDownloadTasks } from "@/api/download-task";
import {
  resolveCollection,
  resolveMedia,
  removeMediaPlayback,
  type MediaPreview,
  type MediaResource,
} from "@/api/media";
import { setConfigValue } from "@/api/config";
import { useAppStore } from "@/store/app";
import { usePlatform } from "@/hooks/use-platform";
import { useUrlInvoke } from "@/hooks/use-url-invoke";
import { isWeb } from "@/utils";
import { RecentTasks } from "./recent-tasks";
import { MediaPlayer } from "./media-player";
import { mediaParseErrorKey } from "./media-error";
import { readPlatformParseIntent } from "../platforms-page/parser-entry-model";
import {
  audioChoice,
  cleanStem,
  formatBytes,
  outputExtension,
  selectionOptions,
  videoChoices,
  type OutputMode,
} from "./media-selection";

function readPreference() {
  try {
    const value = JSON.parse(
      localStorage.getItem("media-output-preferences") || "{}",
    );
    return {
      mode: ["video", "audio", "cover"].includes(value.mode)
        ? (value.mode as OutputMode)
        : ("video" as OutputMode),
      audioFormat:
        value.audioFormat === "mp3" ? ("mp3" as const) : ("original" as const),
      bitrate: [128, 192, 320].includes(value.bitrate)
        ? (value.bitrate as 128 | 192 | 320)
        : (192 as const),
    };
  } catch {
    return {
      mode: "video" as OutputMode,
      audioFormat: "original" as const,
      bitrate: 192 as const,
    };
  }
}
function duration(seconds: number) {
  if (!seconds) return "";
  return (
    Math.floor(seconds / 60) +
    ":" +
    String(Math.floor(seconds % 60)).padStart(2, "0")
  );
}

export default function WorkbenchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [organization, setOrganization] = useSaveOrganization();
  const reviewDuplicates = useDownloadDuplicates();
  const linkInput = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { dialog, shell } = usePlatform();
  const { mutate } = useSWRConfig();
  const local = useAppStore((state) => state.local);
  const setAppStore = useAppStore((state) => state.setAppStore);
  const preference = useRef(readPreference());
  const [url, setURL] = useState("");
  const [resolved, setPreview] = useState<MediaPreview | null>(null);
  const [activeResource, setActiveResource] = useState("");
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const resources = resolved?.resources || [];
  const preview =
    resources.find((item) => item.resourceId === activeResource) || resolved;
  const multi = resources.length > 1;
  const batch = multi && selectedResources.length > 1;
  const platformImages = ["xiaohongshu-public", "douyin-browser"].includes(
    preview?.resolver || "",
  );
  const [parsing, setParsing] = useState(false);
  const [adding, setAdding] = useState(false);
  const busy = useRef(false);
  const [mode, setMode] = useState<OutputMode>(preference.current.mode);
  const [quality, setQuality] = useState("");
  const [audioFormat, setAudioFormat] = useState<"original" | "mp3">(
    preference.current.audioFormat,
  );
  const [bitrate, setBitrate] = useState<128 | 192 | 320>(
    preference.current.bitrate,
  );
  const [stem, setStem] = useState("");
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("");
  const [fallback, setFallback] = useState(false);
  const request = useRef<AbortController | null>(null);
  const incomingParse = useRef("");
  const form = useRef<DownloadFormRef>(null);
  const id = useId();
  useEffect(() => {
    if (location.state?.focusLink) linkInput.current?.focus();
  }, [location.key]);
  useEffect(() => {
    const intent = readPlatformParseIntent(location.state);
    if (!intent || incomingParse.current === intent.id) return;
    // StrictMode cleans up its first mount before this deferred action runs.
    // Consume the history state once, without storing signed links in the URL.
    const timer = window.setTimeout(() => {
      if (incomingParse.current === intent.id) return;
      incomingParse.current = intent.id;
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
      changeURL(intent.url);
      linkInput.current?.focus();
      void parse(intent.url);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [location.key]);
  useEffect(
    () => () => {
      if (resolved?.previewSession)
        void removeMediaPlayback(resolved.previewSession).catch(() => {});
    },
    [resolved],
  );
  useEffect(() => () => request.current?.abort(), []);
  useUrlInvoke({ onOpenForm: (item) => form.current?.openModal(item) });
  useEffect(() => {
    preference.current = { mode, audioFormat, bitrate };
    try {
      localStorage.setItem(
        "media-output-preferences",
        JSON.stringify(preference.current),
      );
    } catch {
      /* A disabled preference store must not prevent downloading. */
    }
  }, [mode, audioFormat, bitrate]);

  function changeURL(value: string) {
    request.current?.abort();
    request.current = null;
    setURL(value);
    setPreview(null);
    setParsing(false);
    setSubmitted([]);
    setError("");
    setDetail("");
    setFallback(false);
  }
  async function parse(inputText = url) {
    if (busy.current) return;
    request.current?.abort();
    setPreview(null);
    setSubmitted([]);
    setError("");
    setDetail("");
    setFallback(false);
    const links = extractShareLinks(inputText);
    if (links.length > 1) {
      navigate("/batch", { state: { incomingLinks: links } });
      return;
    }
    const input = links[0] || inputText.trim();
    if (!validMediaLink(input)) {
      setError(t("wbInvalidURL"));
      return;
    }
    setURL(input);
    const controller = new AbortController();
    request.current = controller;
    setParsing(true);
    try {
      if (autoDiscoverCollection(input)) {
        try {
          const collectionPage = await resolveCollection(
            input,
            1,
            controller.signal,
          );
          if (controller.signal.aborted || request.current !== controller)
            return;
          if (collectionPage) {
            navigate("/batch", {
              state: { collectionURL: input, collectionPage },
            });
            return;
          }
        } catch (reason) {
          if (controller.signal.aborted) return;
          if (!/\/video\/BV/.test(new URL(input).pathname)) throw reason;
          message.warning(t("clDiscoveryFailed"));
        }
      }
      const result = await resolveMedia(input, controller.signal);
      if (request.current !== controller || controller.signal.aborted) return;
      const wanted = preference.current.mode;
      const supported =
        wanted === "video"
          ? result.kind === "video"
          : wanted === "audio"
            ? result.hasAudio
            : !!result.thumbnail;
      setMode(
        result.kind === "image"
          ? "image"
          : supported
            ? wanted
            : result.kind === "audio"
              ? "audio"
              : "video",
      );
      setFallback(!supported);
      setPreview(result);
      setActiveResource(result.resources?.[0]?.resourceId || "");
      setSelectedResources(
        (result.resources || []).map((item) => item.resourceId),
      );
      setStem(cleanStem(result.title));
      setQuality("");
    } catch (reason) {
      if (!controller.signal.aborted && request.current === controller) {
        const text = reason instanceof Error ? reason.message : "";
        setError(t(mediaParseErrorKey(text, input)));
        setDetail(text);
      }
    } finally {
      if (request.current === controller) setParsing(false);
    }
  }
  async function pickFolder() {
    try {
      const paths = await dialog.open({ type: "directory" });
      if (paths?.[0]) {
        await setConfigValue("local", paths[0]);
        setAppStore({ local: paths[0] });
      }
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("wbNeedFolder"),
      );
    }
  }
  const choices = useMemo(
    () => (preview ? videoChoices(preview) : []),
    [preview],
  );
  const selectedVideo =
    choices.find((item) => item.id === quality) || choices[0];
  const options = useMemo(() => {
    if (!preview) return null;
    try {
      return selectionOptions(preview, mode, quality, audioFormat, bitrate);
    } catch {
      return null;
    }
  }, [preview, mode, quality, audioFormat, bitrate]);
  const extension = preview && options ? outputExtension(preview, options) : "";
  const key = JSON.stringify({
    options,
    stem: cleanStem(stem),
    local,
    selectedResources,
    organization,
  });
  const added = submitted.includes(key);
  const submitDisabled =
    !options ||
    adding ||
    added ||
    !local ||
    (resources.length > 0 && selectedResources.length === 0);
  const submitHint = adding
    ? t("wbAdding")
    : added
      ? t("u11AlreadyAdded")
      : parsing
        ? t("wbParsing")
        : !preview
          ? t("u11NeedParse")
          : !options
            ? t("u11ChooseOutput")
            : !local
              ? t("u11NeedFolder")
              : resources.length > 0 && !selectedResources.length
                ? t("u11NeedSelection")
                : t("v4ParseOnlyHint");
  const audio = preview
    ? audioChoice(preview, selectedVideo?.extension)
    : undefined;
  const size =
    mode === "cover" || !preview
      ? 0
      : mode === "audio"
        ? audioFormat === "mp3"
          ? (preview.duration * bitrate * 1000) / 8
          : audio?.filesize || 0
        : selectedVideo?.filesize &&
            (!options?.audioFormatId || audio?.filesize)
          ? selectedVideo.filesize +
            (options?.audioFormatId ? audio?.filesize || 0 : 0)
          : 0;
  const approximate =
    (mode === "audio" && audioFormat === "mp3") ||
    selectedVideo?.approximate ||
    audio?.approximate;
  const qualityLabel = selectedVideo?.height
    ? selectedVideo.height +
      "p" +
      (selectedVideo.fps > 30 ? " · " + selectedVideo.fps + " fps" : "")
    : t("v4SourceQuality");
  function plannedTasks() {
    if (!preview || !options) return [];
    const source = preview;
    const selected = resources.length
      ? resources.filter((item) => selectedResources.includes(item.resourceId))
      : [source];
    return selected.map((item) => {
      const individual = batch
        ? selectionOptions(
            item,
            item.kind === "image"
              ? "image"
              : item.kind === "audio"
                ? "audio"
                : "video",
            "",
            "original",
            192,
          )
        : options;
      const ext = outputExtension(item, individual);
      const output = organizeOutput(local, cleanStem(stem), item, organization);
      const suffix = multi
        ? "_" +
          String(
            resources.findIndex(
              (resource) => resource.resourceId === item.resourceId,
            ) + 1,
          ).padStart(2, "0")
        : "";
      return {
        name: output.stem + suffix + (ext ? "." + ext : ""),
        url: item.url,
        thumbnail: item.thumbnail,
        type: DownloadType.youtubeSingle,
        options: { ...individual, saveDir: output.saveDir },
      };
    });
  }
  async function enqueue(start: boolean) {
    const controller = request.current;
    if (
      !preview ||
      !options ||
      !controller ||
      controller.signal.aborted ||
      busy.current ||
      added ||
      (resources.length > 0 && selectedResources.length === 0)
    )
      return;
    if (!local) {
      message.warning(t("wbNeedFolder"));
      return;
    }
    busy.current = true;
    setAdding(true);
    try {
      const tasks = plannedTasks();
      const accepted = await reviewDuplicates(tasks);
      if (
        !accepted?.length ||
        request.current !== controller ||
        controller.signal.aborted
      )
        return;
      await createDownloadTasks(accepted, start);
      if (request.current === controller && !controller.signal.aborted)
        setSubmitted((items) => [...items, key]);
      message.success(t(start ? "v4DownloadStarted" : "v4QueueAdded"));
      await mutate(
        (cache) =>
          Array.isArray(cache) &&
          (cache[0] === "workbench-recent" || cache[0] === "media-tasks"),
      );
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("wbTasksError"),
      );
    } finally {
      busy.current = false;
      setAdding(false);
    }
  }

  function focusResource(item: MediaResource) {
    setActiveResource(item.resourceId);
    setQuality("");
    setMode(
      item.kind === "image"
        ? "image"
        : item.kind === "audio"
          ? "audio"
          : "video",
    );
  }
  function toggleResource(item: MediaResource) {
    const next = selectedResources.includes(item.resourceId)
      ? selectedResources.filter((resource) => resource !== item.resourceId)
      : resources
          .filter(
            (r) =>
              selectedResources.includes(r.resourceId) ||
              r.resourceId === item.resourceId,
          )
          .map((r) => r.resourceId);
    setSelectedResources(next);
    focusResource(
      next.length === 1
        ? resources.find((r) => r.resourceId === next[0]) || item
        : item,
    );
  }

  return (
    <div className="wb-page v4-workbench" data-testid="media-workbench">
      <header className="wb-page-heading">
        <div>
          <h1>{t("wbTitle")}</h1>
          <p>{t("v4WorkbenchHint")}</p>
        </div>
        <div className="batch-entry-actions">
          {collectionCandidate(extractShareLinks(url)[0] || url.trim()) && (
            <button
              type="button"
              className="wb-secondary"
              data-testid="open-collection"
              disabled={parsing || adding}
              onClick={() =>
                navigate("/batch", {
                  state: {
                    collectionURL: extractShareLinks(url)[0] || url.trim(),
                  },
                })
              }
            >
              {t("clOpen")}
            </button>
          )}
          <Link to="/batch" className="wb-secondary" data-testid="open-batch">
            {t("btOpen")}
          </Link>
          <button
            className="wb-secondary"
            type="button"
            onClick={() =>
              form.current?.openModal({
                batch: true,
                type: DownloadType.youtube,
              })
            }
          >
            {t("wbBatch")}
          </button>
        </div>
      </header>
      <form
        className="wb-link-entry v4-link-entry"
        onSubmit={(event) => {
          event.preventDefault();
          void parse();
        }}
      >
        <Link2 size={21} aria-hidden />
        <input
          ref={linkInput}
          data-testid="media-url"
          aria-label={t("wbLink")}
          value={url}
          onChange={(event) => changeURL(event.target.value)}
          onPaste={(event) => {
            const links = extractShareLinks(
              event.clipboardData.getData("text"),
            );
            if (!links.length) return;
            event.preventDefault();
            if (links.length > 1)
              navigate("/batch", { state: { incomingLinks: links } });
            else changeURL(links[0]);
          }}
          placeholder={t("efSharePlaceholder")}
          spellCheck={false}
          disabled={adding}
        />
        {url && (
          <button
            type="button"
            className="wb-icon-button"
            aria-label={t("v4Clear")}
            disabled={adding}
            onClick={() => changeURL("")}
          >
            <X size={17} />
          </button>
        )}
        <button
          className="wb-primary"
          data-testid="parse-link"
          type="submit"
          disabled={parsing || adding || !url.trim()}
        >
          {parsing ? <LoaderCircle size={17} className="wb-spin" /> : null}
          {t(parsing ? "wbParsing" : "wbParse")}
          {!parsing && <ArrowRight size={18} />}
        </button>
      </form>
      {preview && (
        <SaveOrganizationControls
          value={organization}
          disabled={adding}
          onChange={(next) => {
            try {
              setOrganization(next);
            } catch {
              message.error(t("efSaveFailed"));
            }
          }}
          path={(() => {
            const task = plannedTasks()[0];
            return task
              ? task.options.saveDir +
                  (task.options.saveDir.includes("\\") ? "\\" : "/") +
                  task.name
              : undefined;
          })()}
        />
      )}
      {error && (
        <div className="wb-error" role="alert">
          <strong>{error}</strong>
          {detail && (
            <details>
              <summary>{t("wbDetails")}</summary>
              <p>{detail}</p>
            </details>
          )}
        </div>
      )}
      <div className="v4-workspace">
        <section
          className={"v4-source" + (resources.length ? " has-resources" : "")}
          aria-label={t("v4SourcePreview")}
        >
          <MediaPlayer
            key={`${preview?.url || "empty"}:${preview?.resourceId || ""}:${mode}`}
            preview={preview}
            mode={mode}
            parsing={parsing}
          />
          <div
            className="v4-source-copy"
            data-testid={preview ? "resolved-media" : undefined}
          >
            <span className="v4-source-eyebrow">
              {preview?.source || t("wbSource")}
              {preview?.uploader && " · " + preview.uploader}
            </span>
            <h2>{preview?.title || t("wbEmptyTitle")}</h2>
            <div className="v4-source-meta">
              {preview ? (
                <>
                  <span>
                    {duration(preview.duration) || t("v4DurationUnknown")}
                  </span>
                  <span>
                    {resources.length
                      ? t("mrResourceCount", { count: resources.length })
                      : t("v4SingleResource")}
                  </span>
                  {preview.resolver === "x-public" && (
                    <Tooltip title={t("pPublicRouteHint")}>
                      <span data-testid="media-public-route" tabIndex={0}>
                        {t("pPublicRoute")}
                      </span>
                    </Tooltip>
                  )}
                </>
              ) : (
                <span>{t("v4ParseOnlyHint")}</span>
              )}
            </div>
            {preview && (
              <a
                href={preview.url}
                onClick={(event) => {
                  event.preventDefault();
                  void shell.open(preview.url);
                }}
                className="v4-source-url"
                title={preview.url}
              >
                {new URL(preview.url).hostname}
              </a>
            )}
          </div>
          {resources.length > 0 && (
            <div className="mr-resources" data-testid="resource-picker">
              <div className="mr-selection-bar">
                <strong>
                  {t("mrSelected", {
                    count: selectedResources.length,
                    total: resources.length,
                  })}
                </strong>
                <button
                  type="button"
                  className="wb-text-button"
                  disabled={adding}
                  onClick={() =>
                    setSelectedResources(
                      selectedResources.length === resources.length
                        ? []
                        : resources.map((item) => item.resourceId),
                    )
                  }
                >
                  {t(
                    selectedResources.length === resources.length
                      ? "mrClear"
                      : "mrSelectAll",
                  )}
                </button>
              </div>
              <div className="mr-resource-grid">
                {resources.map((item, index) => (
                  <div
                    key={item.resourceId}
                    className={
                      "mr-resource" +
                      (item.resourceId === preview?.resourceId
                        ? " is-active"
                        : "")
                    }
                  >
                    <button
                      type="button"
                      className="mr-resource-preview"
                      data-testid="resource-item"
                      aria-label={t("mrPreviewItem", { index: index + 1 })}
                      aria-pressed={item.resourceId === preview?.resourceId}
                      disabled={adding}
                      onClick={() => {
                        focusResource(item);
                        if (selectedResources.length <= 1)
                          setSelectedResources([item.resourceId]);
                      }}
                    >
                      {item.thumbnail ? (
                        <img
                          src={item.displayThumbnail || item.thumbnail}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Film size={24} />
                      )}
                      <span>
                        {index + 1} ·{" "}
                        {t(
                          item.kind === "image"
                            ? "v4Mode_image"
                            : item.kind === "audio"
                              ? "v4Mode_audio"
                              : "v4Mode_video",
                        )}
                      </span>
                    </button>
                    <input
                      type="checkbox"
                      data-testid="resource-check"
                      aria-label={t("mrSelectItem", { index: index + 1 })}
                      checked={selectedResources.includes(item.resourceId)}
                      disabled={adding}
                      onChange={() => toggleResource(item)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <section
          className="v4-settings"
          aria-labelledby="output-settings-title"
        >
          <div className="v4-panel-heading">
            <h2 id="output-settings-title">{t("v4DownloadSettings")}</h2>
            <span>{t("v4YourChoice")}</span>
          </div>
          <div
            className="v4-output-tabs"
            role="radiogroup"
            aria-label={t("v4OutputMode")}
          >
            {(preview?.kind === "image"
              ? (["image"] as const)
              : (["video", "audio", "cover"] as const)
            ).map((item) => {
              const disabled =
                !preview ||
                adding ||
                batch ||
                (item === "video"
                  ? preview.kind !== "video"
                  : item === "audio"
                    ? !preview.hasAudio
                    : item === "image"
                      ? false
                      : !preview.thumbnail);
              const Icon =
                item === "video" ? Film : item === "audio" ? Music2 : ImageIcon;
              return (
                <Tooltip
                  key={item}
                  title={
                    preview && disabled
                      ? t(
                          item === "audio"
                            ? "v4NoAudio"
                            : item === "cover"
                              ? "v4NoCover"
                              : "wbNoVideo",
                        )
                      : undefined
                  }
                >
                  <button
                    type="button"
                    data-testid={"mode-" + item}
                    role="radio"
                    aria-checked={mode === item}
                    disabled={disabled}
                    onClick={() => setMode(item)}
                  >
                    <Icon size={18} />
                    {t("v4Mode_" + item)}
                  </button>
                </Tooltip>
              );
            })}
          </div>
          {batch && (
            <p className="v4-field-hint" role="status">
              {t(platformImages ? "mrXhsBatch" : "mrOriginalBatch")}
            </p>
          )}
          {fallback && !batch && (
            <p className="v4-field-hint" role="status">
              {t("v4PreferenceFallback")}
            </p>
          )}
          {preview && mode === "video" && !options && (
            <p className="wb-error-text" role="alert">
              {t("v4NoMatchingAudio")}
            </p>
          )}
          <div className="v4-fields">
            {mode === "video" && (
              <label className="v4-field">
                <span>{t("v4Quality")}</span>
                <select
                  data-testid="media-quality"
                  value={quality}
                  disabled={!preview || adding || batch || !choices.length}
                  onChange={(event) => setQuality(event.target.value)}
                >
                  <option value="">
                    {t("v4BestAvailable")}
                    {choices[0]?.height ? " · " + choices[0].height + "p" : ""}
                  </option>
                  {choices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.height ? item.height + "p" : t("v4SourceQuality")}
                      {item.fps > 30 ? " · " + item.fps + " fps" : ""} ·{" "}
                      {item.videoCodec} · {item.extension.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {mode === "audio" && (
              <div className="v4-field-pair">
                <label className="v4-field">
                  <span>{t("v4AudioFormat")}</span>
                  <select
                    data-testid="audio-format"
                    value={audioFormat}
                    disabled={!preview || adding || batch}
                    onChange={(event) =>
                      setAudioFormat(event.target.value as "original" | "mp3")
                    }
                  >
                    <option value="original">{t("v4OriginalTrack")}</option>
                    <option value="mp3">MP3</option>
                  </select>
                </label>
                {audioFormat === "mp3" && (
                  <label className="v4-field">
                    <span>{t("v4Bitrate")}</span>
                    <select
                      data-testid="audio-bitrate"
                      value={bitrate}
                      disabled={adding}
                      onChange={(event) =>
                        setBitrate(
                          Number(event.target.value) as 128 | 192 | 320,
                        )
                      }
                    >
                      {[128, 192, 320].map((value) => (
                        <option key={value} value={value}>
                          {value} kbps
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            {(mode === "cover" || mode === "image") && (
              <div className="v4-cover-note">
                <ImageIcon size={24} />
                <div>
                  <strong>
                    {t(
                      mode === "image"
                        ? platformImages
                          ? "mrXhsImage"
                          : "mrOriginalImage"
                        : "v4OriginalCover",
                    )}
                  </strong>
                  <p>
                    {t(
                      mode === "image"
                        ? platformImages
                          ? "mrXhsImageHint"
                          : "mrImageHint"
                        : "v4CoverOnly",
                    )}
                  </p>
                </div>
              </div>
            )}
            <div className="v4-file-facts">
              <span>
                {t("v4Format")}{" "}
                <strong>
                  {extension?.toUpperCase() || t("v4SourceFormat")}
                </strong>
              </span>
              <span>
                {t("v4Size")}{" "}
                <strong>
                  {size
                    ? (approximate ? "≈ " : "") + formatBytes(size)
                    : t("v4NotProvided")}
                </strong>
              </span>
            </div>
            {mode === "audio" && audioFormat === "mp3" && (
              <p className="v4-field-hint">{t("v4TranscodeHint")}</p>
            )}
            {mode === "video" && (
              <p className="v4-field-hint">
                {selectedVideo
                  ? selectedVideo.videoCodec + " · " + qualityLabel
                  : t("v4SourceQualityHint")}
              </p>
            )}
            <label className="v4-field">
              <span>{t("v4Filename")}</span>
              <div className="v4-filename">
                <input
                  data-testid="media-filename"
                  value={stem}
                  disabled={!preview || adding}
                  onChange={(event) => setStem(event.target.value)}
                  onBlur={() => setStem(cleanStem(stem))}
                  aria-label={t("v4Filename")}
                />
                <span>
                  {extension ? "." + extension : t("v4AutomaticExtension")}
                </span>
              </div>
            </label>
            <label className="v4-field">
              <span>{t("wbSaveTo")}</span>
              <Tooltip title={local}>
                <button
                  type="button"
                  className="v4-directory"
                  onClick={() => void pickFolder()}
                  disabled={adding || isWeb}
                >
                  <FolderOpen size={18} />
                  <span>{local || t("wbNeedFolder")}</span>
                  <span>{t("v4Change")}</span>
                </button>
              </Tooltip>
            </label>
          </div>
        </section>
      </div>
      <div className="v4-action-bar">
        <div>
          <strong>
            {batch
              ? t("mrSelected", {
                  count: selectedResources.length,
                  total: resources.length,
                })
              : preview
                ? t("v4Mode_" + mode) +
                  " · " +
                  (mode === "video"
                    ? qualityLabel
                    : extension?.toUpperCase() || t("v4SourceFormat"))
                : t("v4ReadyToParse")}
          </strong>
          <span
            className="v4-submit-hint"
            id={`${id}-submit-hint`}
            data-testid="download-submit-hint"
            role="status"
            aria-live="polite"
          >
            {submitHint}
          </span>
        </div>
        <div className="v4-submit-actions">
          <Tooltip title={submitDisabled ? submitHint : undefined}>
            <span className="v4-submit-trigger">
              <button
                type="button"
                className="wb-secondary"
                data-testid="queue-media"
                disabled={submitDisabled}
                aria-describedby={`${id}-submit-hint`}
                onClick={() => void enqueue(false)}
              >
                {t(added ? "wbAdded" : "v4QueueOnly")}
              </button>
            </span>
          </Tooltip>
          <Tooltip title={submitDisabled ? submitHint : undefined}>
            <span className="v4-submit-trigger">
              <button
                type="button"
                className="wb-primary"
                data-testid="enqueue-media"
                disabled={submitDisabled}
                aria-describedby={`${id}-submit-hint`}
                onClick={() => void enqueue(true)}
              >
                {adding ? (
                  <LoaderCircle size={17} className="wb-spin" />
                ) : added ? (
                  <Check size={17} />
                ) : (
                  <ArrowRight size={18} />
                )}{" "}
                {t(
                  adding
                    ? "wbAdding"
                    : added
                      ? "wbAdded"
                      : mode === "cover"
                        ? "v4SaveCover"
                        : "v4StartDownload",
                )}
              </button>
            </span>
          </Tooltip>
        </div>
      </div>
      <RecentTasks />
      <DownloadForm
        id={id}
        ref={form}
        destroyOnClose
        onConfirm={() => {
          void mutate(
            (cache) =>
              Array.isArray(cache) &&
              (cache[0] === "workbench-recent" || cache[0] === "media-tasks"),
          );
        }}
      />
    </div>
  );
}
