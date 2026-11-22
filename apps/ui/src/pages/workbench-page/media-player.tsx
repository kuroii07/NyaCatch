import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Music2, Play, RotateCcw, X } from "lucide-react";
import brandIcon from "@/assets/brand/nyacatch.svg";
import { useTranslation } from "react-i18next";
import {
  createMediaPlayback,
  removeMediaPlayback,
  type MediaPlayback,
  type MediaPreview,
} from "@/api/media";
import type { OutputMode } from "./media-selection";

function PlayingMedia({
  playback,
  preview,
  mode,
  onError,
}: {
  playback: MediaPlayback;
  preview: MediaPreview;
  mode: "video" | "audio";
  onError: () => void;
}) {
  const { t } = useTranslation();
  const main = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    const media = main.current;
    const track = audio.current;
    if (!media) return;
    let disposed = false;
    let synchronizing = false;
    const listeners: [EventTarget, string, EventListener][] = [];
    function listen(target: EventTarget, name: string, callback: () => void) {
      target.addEventListener(name, callback);
      listeners.push([target, name, callback]);
    }
    async function resume() {
      if (disposed || !media || media.paused || media.seeking || synchronizing)
        return;
      if (track) {
        track.volume = media.volume;
        track.muted = media.muted;
        track.playbackRate = media.playbackRate;
        if (Math.abs(track.currentTime - media.currentTime) > 0.3)
          track.currentTime = media.currentTime;
        try {
          await track.play();
        } catch (error) {
          if (
            !disposed &&
            error instanceof DOMException &&
            error.name !== "AbortError"
          ) {
            media.pause();
            onError();
          }
        }
      }
    }
    listen(media, "playing", () => {
      setWaiting(false);
      void resume();
    });
    listen(media, "pause", () => {
      track?.pause();
      setWaiting(false);
    });
    listen(media, "ended", () => {
      track?.pause();
      setWaiting(false);
    });
    listen(media, "waiting", () => {
      setWaiting(true);
      track?.pause();
    });
    listen(media, "error", onError);
    if (track) {
      listen(media, "seeking", () => {
        synchronizing = true;
        track.pause();
        track.currentTime = media.currentTime;
        setWaiting(true);
      });
      listen(media, "seeked", () => {
        synchronizing = false;
        setWaiting(false);
        void resume();
      });
      listen(media, "timeupdate", () => {
        if (
          !media.paused &&
          !media.seeking &&
          Math.abs(media.currentTime - track.currentTime) > 0.4
        )
          track.currentTime = media.currentTime;
      });
      listen(media, "volumechange", () => {
        track.volume = media.volume;
        track.muted = media.muted;
      });
      listen(media, "ratechange", () => {
        track.playbackRate = media.playbackRate;
      });
      listen(track, "error", onError);
      // Keep the main timeline still when the separate soundtrack buffers.
      let resumeAfterBuffer = false;
      listen(track, "waiting", () => {
        if (!media.paused && !media.seeking) {
          resumeAfterBuffer = true;
          media.pause();
          setWaiting(true);
        }
      });
      listen(track, "canplay", () => {
        if (resumeAfterBuffer && !disposed) {
          resumeAfterBuffer = false;
          void media.play().catch(onError);
        }
      });
    }
    void media.play().catch((error: unknown) => {
      setWaiting(false);
      // If autoplay policy intervenes, the native play control remains usable.
      if (
        !disposed &&
        !(
          error instanceof DOMException &&
          ["NotAllowedError", "AbortError"].includes(error.name)
        )
      )
        onError();
    });
    return () => {
      disposed = true;
      for (const [target, name, callback] of listeners)
        target.removeEventListener(name, callback);
      for (const item of [media, track]) {
        if (item) {
          item.pause();
          item.removeAttribute("src");
          item.load();
        }
      }
    };
  }, [playback, onError]);

  return (
    <>
      {mode === "video" ? (
        <video
          ref={(element) => {
            main.current = element;
          }}
          data-testid="preview-video"
          src={playback.video}
          poster={preview.thumbnail}
          controls
          playsInline
          preload="none"
          aria-label={preview.title}
        />
      ) : (
        <div className="v4-audio-player">
          <Music2 size={26} aria-hidden="true" />
          <span>{t("pAudioOriginal")}</span>
          <audio
            ref={(element) => {
              main.current = element;
            }}
            data-testid="preview-audio"
            src={playback.audio}
            controls
            preload="none"
            aria-label={preview.title}
          />
        </div>
      )}
      {mode === "video" && playback.audio && (
        <audio
          ref={audio}
          src={playback.audio}
          preload="auto"
          data-testid="preview-soundtrack"
        />
      )}
      {waiting && (
        <div className="v4-player-loading" role="status">
          <LoaderCircle className="wb-spin" size={20} />
          <span>{t("pBuffering")}</span>
        </div>
      )}
    </>
  );
}

export function MediaPlayer({
  preview,
  mode,
  parsing,
}: {
  preview: MediaPreview | null;
  mode: OutputMode;
  parsing: boolean;
}) {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const [playback, setPlayback] = useState<MediaPlayback | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const active = useRef<MediaPlayback | null>(null);
  // Keyed by source and mode in the parent: switching either unmounts and cancels.
  useEffect(
    () => () => {
      abort.current?.abort();
      if (active.current)
        void removeMediaPlayback(active.current.id).catch(() => {});
    },
    [],
  );

  function stop() {
    abort.current?.abort();
    abort.current = null;
    if (active.current)
      void removeMediaPlayback(active.current.id).catch(() => {});
    active.current = null;
    setPlayback(null);
    setLoading(false);
  }
  function playbackError() {
    stop();
    setFailed(true);
  }
  // Stable callback prevents restarting the playback effect when loading changes.
  const errorHandler = useRef(playbackError);
  errorHandler.current = playbackError;
  const onError = useRef(() => errorHandler.current()).current;

  async function start() {
    if (!preview || mode === "cover" || mode === "image" || loading) return;
    stop();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const session = await createMediaPlayback(
        preview.url,
        mode,
        controller.signal,
        preview.resolver,
        preview.resourceId,
      );
      if (controller.signal.aborted) {
        void removeMediaPlayback(session.id).catch(() => {});
        return;
      }
      active.current = session;
      setPlayback(session);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const playable =
    preview &&
    (mode === "video" || mode === "audio") &&
    (mode === "video" || preview.hasAudio);
  return (
    <div
      className={"v4-preview" + (playback ? " is-playing" : "")}
      data-testid="media-player"
    >
      {(!playback || mode === "audio") &&
        (preview?.thumbnail && !imageFailed ? (
          <img
            src={preview.displayThumbnail || preview.thumbnail}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="v4-preview-empty">
            {parsing ? (
              <LoaderCircle size={34} className="wb-spin" />
            ) : mode === "audio" ? (
              <Music2 size={40} strokeWidth={1.4} />
            ) : (
              <img className="v4-placeholder-brand" src={brandIcon} alt="" />
            )}
            <span>
              {t(
                parsing
                  ? "wbParsing"
                  : preview
                    ? "wbNoPreview"
                    : "v4EmptyPreview",
              )}
            </span>
          </div>
        ))}
      {playback && preview && (mode === "video" || mode === "audio") && (
        <PlayingMedia
          playback={playback}
          preview={preview}
          mode={mode}
          onError={onError}
        />
      )}
      {playable && !playback && (
        <div className="v4-player-overlay">
          <button
            type="button"
            data-testid="play-preview"
            className="v4-play-button"
            disabled={loading}
            onClick={() => void start()}
          >
            {loading ? (
              <LoaderCircle size={22} className="wb-spin" />
            ) : failed ? (
              <RotateCcw size={21} />
            ) : (
              <Play size={22} fill="currentColor" />
            )}
            {t(
              loading
                ? "pLoading"
                : failed
                  ? "pRetry"
                  : mode === "audio"
                    ? "pListen"
                    : "pPlay",
            )}
          </button>
          <span role={failed ? "status" : undefined}>
            {t(failed ? "pUnavailable" : "pClickHint")}
          </span>
        </div>
      )}
      {playback && (
        <button
          className="v4-player-close"
          data-testid="stop-preview"
          type="button"
          onClick={stop}
          title={t("pStop")}
          aria-label={t("pStop")}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
