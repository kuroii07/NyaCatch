import { useRef } from "react";
import { BrandCheck, BrandPaw } from "./brand-marks";
import { normalizeProgress, type NcProgressState } from "./nc-progress-model";
import { useTaskStatusMotion } from "@/hooks/use-task-status-motion";
import "./nc-progress.css";

export interface NcProgressProps {
  value?: number;
  max?: number;
  state?: NcProgressState;
  label: string;
  className?: string;
}

export function NcProgress({
  value,
  max,
  state = "active",
  label,
  className = "",
}: NcProgressProps) {
  const { maximum, now, ratio } = normalizeProgress(value, max, state);
  const ref = useRef<HTMLDivElement>(null);
  useTaskStatusMotion(ref, state, undefined, false);
  return (
    <div
      ref={ref}
      className={`nc-progress ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={maximum}
      aria-valuenow={now}
      data-state={state}
      data-indeterminate={now === undefined ? "true" : undefined}
    >
      <div className="nc-progress__track" aria-hidden="true">
        <div
          className="nc-progress__fill"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
      {state !== "failed" && (
        <div className="nc-progress__markers" aria-hidden="true">
          <div
            className="nc-progress__marker"
            style={{ transform: `translateX(${ratio * 100}%)` }}
          >
            {state === "complete" ? (
              <BrandCheck width={10} height={10} data-nc-completion="true" />
            ) : (
              <BrandPaw width={10} height={10} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
