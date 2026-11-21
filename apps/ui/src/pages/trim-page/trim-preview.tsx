import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Slider } from "antd";
import {
  ChevronsLeft,
  ChevronsRight,
  Music2,
  Play,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePlatform } from "@/hooks/use-platform";
import { formatTrimTime, markTrimPoint, parseTrimTime } from "./trim-model";

interface Props {
  positionRef?: { current: (() => number | undefined) | undefined };
  seekTo?: { ms: number; revision: number };
  onPositionChange?: (ms: number) => void;
  onReadyChange?: (ready: boolean) => void;
  previewOnly?: boolean;
  previewErrorKey?: string;
  path: string;
  segmentId?: string;
  hasVideo: boolean;
  duration: number;
  start: string;
  end: string;
  disabled: boolean;
  change: (range: { start: string; end: string }) => void;
}

export default function TrimPreview(props: Props) {
  const { t } = useTranslation();
  const { shell } = usePlatform();
  const element = useRef<HTMLMediaElement | null>(null);
  const rangePlayback = useRef<number | undefined>(undefined);
  const previousSegment = useRef(props.segmentId);
  const [preview, setPreview] = useState<{ id: string; url: string }>();
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState(0);
  const [drag, setDrag] = useState<number[]>();
  const from = Math.min(props.duration, parseTrimTime(props.start) ?? 0);
  const to = Math.min(
    props.duration,
    parseTrimTime(props.end) ?? props.duration,
  );
  const selection = drag || [from, to];
  const canMark = ready && !failed && !props.disabled && !props.previewOnly;
  const valid = from >= 0 && to > from;

  useEffect(() => {
    const ref = props.positionRef;
    if (!ref) return;
    ref.current = () => {
      const media = element.current;
      if (!media || !ready || failed || media.seeking) return;
      media.pause();
      return Math.round(media.currentTime * 1000);
    };
    return () => {
      ref.current = undefined;
    };
  }, [props.positionRef, ready, failed]);

  useEffect(() => {
    props.onReadyChange?.(ready && !failed);
  }, [ready, failed, props.onReadyChange]);

  useEffect(() => {
    if (!ready || !props.seekTo || !element.current) return;
    rangePlayback.current = undefined;
    element.current.pause();
    element.current.currentTime =
      Math.max(0, Math.min(props.duration, props.seekTo.ms)) / 1000;
  }, [props.seekTo, ready, props.duration]);

  useEffect(() => {
    if (previousSegment.current === props.segmentId) return;
    previousSegment.current = props.segmentId;
    rangePlayback.current = undefined;
    const media = element.current;
    if (!media) return;
    media.pause();
    if (ready) {
      media.currentTime = from / 1000;
      setPosition(from);
    }
  }, [props.segmentId, ready, from]);

  useEffect(() => {
    let cancelled = false;
    let id: string | undefined;
    setPreview(undefined);
    setReady(false);
    setFailed(false);
    setPosition(0);
    rangePlayback.current = undefined;
    void shell
      .createMediaPreview(props.path)
      .then((value) => {
        id = value.id;
        if (cancelled)
          void shell.releaseMediaPreview(id).catch(() => undefined);
        else setPreview(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (id) void shell.releaseMediaPreview(id).catch(() => undefined);
    };
  }, [props.path, retry, shell]);

  useEffect(() => {
    const media = element.current;
    return () => {
      if (media) {
        media.pause();
        media.removeAttribute("src");
        media.load();
      }
    };
  }, [preview?.url]);

  function seek(ms: number) {
    const media = element.current;
    if (!media || !ready) return;
    rangePlayback.current = undefined;
    const point = Math.max(0, Math.min(props.duration, ms));
    media.currentTime = point / 1000;
    setPosition(point);
  }
  function mark(kind: "in" | "out") {
    if (!canMark || !element.current) return;
    rangePlayback.current = undefined;
    props.change(
      markTrimPoint(
        kind,
        element.current.currentTime * 1000,
        from,
        to,
        props.duration,
      ),
    );
  }
  function shortcut(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.repeat ||
      target.closest("input,select,textarea,button,[contenteditable=true]")
    )
      return;
    const key = event.key.toLowerCase();
    if (canMark && (key === "i" || key === "o")) {
      event.preventDefault();
      event.stopPropagation();
      mark(key === "i" ? "in" : "out");
    }
  }
  function updateTime() {
    const media = element.current;
    if (!media) return;
    let ms = Math.min(props.duration, Math.round(media.currentTime * 1000));
    const out = rangePlayback.current;
    if (out !== undefined && ms >= out) {
      rangePlayback.current = undefined;
      media.pause();
      media.currentTime = out / 1000;
      ms = out;
    }
    setPosition(ms);
    props.onPositionChange?.(ms);
  }
  async function audition() {
    const media = element.current;
    if (!media || !canMark || !valid) return;
    media.currentTime = from / 1000;
    setPosition(from);
    rangePlayback.current = to;
    try {
      await media.play();
    } catch {
      rangePlayback.current = undefined;
      setFailed(true);
    }
  }
  const mediaProps = {
    src: preview?.url,
    controls: true,
    preload: "auto",
    onLoadedMetadata: () => {
      if (!props.hasVideo) setReady(true);
    },
    onLoadedData: () => setReady(true),
    onTimeUpdate: updateTime,
    onSeeking: () => props.onReadyChange?.(false),
    onSeeked: () => {
      updateTime();
      props.onReadyChange?.(ready && !failed);
    },
    onPause: () => {
      rangePlayback.current = undefined;
      updateTime();
    },
    onError: () => setFailed(true),
    "data-testid": "trim-media",
    "aria-label": t("trPreview"),
  };

  return (
    <section
      className="trim-preview"
      data-testid="trim-preview"
      tabIndex={0}
      aria-label={t("trPreview")}
      onKeyDown={shortcut}
    >
      <div
        className={`trim-player ${props.hasVideo ? "is-video" : "is-audio"}`}
      >
        {!props.hasVideo && <Music2 size={32} aria-hidden="true" />}
        {preview &&
          (props.hasVideo ? (
            <video
              {...mediaProps}
              ref={(node) => {
                element.current = node;
              }}
              playsInline
            />
          ) : (
            <audio
              {...mediaProps}
              ref={(node) => {
                element.current = node;
              }}
            />
          ))}
        {!preview && !failed && (
          <span role="status">{t("trPreviewLoading")}</span>
        )}
      </div>
      {failed && (
        <div
          className="trim-preview-error"
          role="alert"
          data-testid="trim-preview-error"
        >
          <span>
            {t(
              props.previewErrorKey ||
                (props.previewOnly ? "mgPreviewFailed" : "trPreviewFailed"),
            )}
          </span>
          <button
            type="button"
            className="wb-icon-button"
            title={t("cRetry")}
            aria-label={t("cRetry")}
            onClick={() => setRetry((value) => value + 1)}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      )}
      <div className="trim-transport">
        <span className="trim-playhead" data-testid="trim-playhead">
          {formatTrimTime(position)}{" "}
          <span>/ {formatTrimTime(props.duration)}</span>
        </span>
        {!props.previewOnly && (
          <div className="trim-marker-actions">
            <button
              type="button"
              className="wb-secondary"
              disabled={!canMark}
              data-testid="trim-mark-in"
              onClick={() => mark("in")}
              title={t("trMarkInHint")}
            >
              {t("trMarkIn")} <kbd>I</kbd>
            </button>
            <button
              type="button"
              className="wb-secondary"
              disabled={!canMark}
              data-testid="trim-mark-out"
              onClick={() => mark("out")}
              title={t("trMarkOutHint")}
            >
              {t("trMarkOut")} <kbd>O</kbd>
            </button>
            <button
              type="button"
              className="wb-secondary"
              disabled={!canMark || !valid}
              data-testid="trim-audition"
              onClick={() => void audition()}
            >
              <Play size={13} />
              {t("trPlayRange")}
            </button>
          </div>
        )}
      </div>
      {!props.previewOnly && (
        <>
          <div className="trim-selection-caption">
            <button
              type="button"
              disabled={!canMark}
              onClick={() => seek(from)}
              data-testid="trim-jump-in"
              title={t("trJumpIn")}
              aria-label={t("trJumpIn")}
            >
              <ChevronsLeft size={14} />
              {t("trIn")} {formatTrimTime(selection[0])}
            </button>
            <span>{t("trRangeDrag")}</span>
            <button
              type="button"
              disabled={!canMark}
              onClick={() => seek(to)}
              data-testid="trim-jump-out"
              title={t("trJumpOut")}
              aria-label={t("trJumpOut")}
            >
              {t("trOut")} {formatTrimTime(selection[1])}
              <ChevronsRight size={14} />
            </button>
          </div>
          <div
            className="trim-selection"
            data-testid="trim-selection"
            title={t("trRangeDrag")}
          >
            <Slider
              range
              min={0}
              max={props.duration}
              step={1}
              value={selection}
              disabled={!canMark}
              tooltip={{ formatter: (value) => formatTrimTime(value || 0) }}
              ariaLabelForHandle={[t("trIn"), t("trOut")]}
              onChange={(values) => {
                const before = drag || [from, to];
                setDrag(values);
                element.current?.pause();
                seek(values[0] !== before[0] ? values[0] : values[1]);
              }}
              onChangeComplete={(values) => {
                const start = Math.min(values[0], props.duration - 1);
                props.change({
                  start: formatTrimTime(start),
                  end: formatTrimTime(Math.max(start + 1, values[1])),
                });
                setDrag(undefined);
              }}
            />
            <span
              className="trim-timeline-cursor"
              style={{
                left: `${Math.max(0, Math.min(100, (position / props.duration) * 100))}%`,
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}
