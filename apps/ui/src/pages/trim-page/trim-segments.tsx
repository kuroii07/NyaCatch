import { Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  MAX_TRIM_SEGMENTS,
  addTrimSegment,
  removeTrimSegment,
  selectTrimSegment,
  trimRangeError,
  validTrimName,
  type TrimWorkspace,
} from "./trim-model";

export default function TrimSegments({
  draft,
  duration,
  disabled,
  save,
}: {
  draft: TrimWorkspace;
  duration: number;
  disabled: boolean;
  save: (update: (current: TrimWorkspace) => TrimWorkspace) => unknown;
}) {
  const { t } = useTranslation();
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = list.current;
    const active = container?.querySelector(
      '[aria-pressed="true"]',
    )?.parentElement;
    if (!container || !active) return;
    const outer = container.getBoundingClientRect(),
      inner = active.getBoundingClientRect();
    if (inner.top < outer.top) container.scrollTop += inner.top - outer.top;
    else if (inner.bottom > outer.bottom)
      container.scrollTop += inner.bottom - outer.bottom;
  }, [draft.activeId]);
  return (
    <section className="trim-segments" aria-label={t("trSegments")}>
      <div className="trim-segments-heading">
        <strong>
          {t("trSegments")}{" "}
          <span>
            {draft.segments.length}/{MAX_TRIM_SEGMENTS}
          </span>
        </strong>
        <button
          type="button"
          className="wb-secondary"
          data-testid="trim-add-segment"
          disabled={disabled || draft.segments.length >= MAX_TRIM_SEGMENTS}
          onClick={() => save((current) => addTrimSegment(current, duration))}
        >
          <Plus size={14} />
          {t("trAddSegment")}
        </button>
      </div>
      <div className="trim-segment-list" data-testid="trim-segments" ref={list}>
        {draft.segments.map((segment, index) => (
          <div
            key={segment.id}
            className={`trim-segment${draft.activeId === segment.id ? " is-active" : ""}`}
          >
            <button
              type="button"
              data-testid={`trim-segment-${segment.id}`}
              aria-pressed={draft.activeId === segment.id}
              disabled={disabled}
              onClick={() =>
                save((current) => selectTrimSegment(current, segment.id))
              }
            >
              <span
                title={
                  segment.name || t("trSegmentNumber", { number: index + 1 })
                }
              >
                {segment.name || t("trSegmentNumber", { number: index + 1 })}
              </span>
              <small
                className={
                  trimRangeError(segment.start, segment.end, duration) ||
                  !validTrimName(segment.name.trim())
                    ? "cvt-error"
                    : ""
                }
              >
                {segment.start || "—"} – {segment.end || "—"}
              </small>
            </button>
            <button
              type="button"
              data-testid={`trim-remove-${segment.id}`}
              title={t("trRemoveSegment")}
              aria-label={t("trRemoveSegment")}
              disabled={disabled || draft.segments.length === 1}
              onClick={() =>
                save((current) => removeTrimSegment(current, segment.id))
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
