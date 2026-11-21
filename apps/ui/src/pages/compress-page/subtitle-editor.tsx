import { useEffect, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import type { CompressionSubtitleStyle } from "@mediago/shared-common";
import type { SubtitleInfo } from "@/api/conversion";
import { usePlatform } from "@/hooks/use-platform";
import type { SubtitleBinding } from "./subtitle-model";
import { filenameForPath } from "../converter-page/converter-model";
export default function SubtitleEditor({
  binding,
  disabled,
  available,
  info,
  error,
  checking,
  choose,
  change,
  remove,
  seek,
  validity,
  open,
  toggle,
}: {
  binding?: SubtitleBinding;
  disabled: boolean;
  available: boolean;
  info?: SubtitleInfo;
  error?: string;
  checking: boolean;
  choose: (paths?: string[]) => Promise<void>;
  change: (binding: SubtitleBinding) => void;
  remove: () => void;
  seek: (ms: number) => void;
  validity: (valid: boolean) => void;
  open: boolean;
  toggle: (open: boolean) => void;
}) {
  const { t } = useTranslation(),
    { dialog } = usePlatform();
  const [offset, setOffset] = useState(String((binding?.offsetMs || 0) / 1000));
  useEffect(() => {
    setOffset(String((binding?.offsetMs || 0) / 1000));
    validity(true);
  }, [binding?.path, binding?.offsetMs, validity]);
  const editStyle = (patch: Partial<CompressionSubtitleStyle>) => {
    if (binding) change({ ...binding, style: { ...binding.style, ...patch } });
  };
  async function drop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !available) return;
    try {
      const paths = await Promise.all(
        Array.from(e.dataTransfer.files).map((f) =>
          dialog.pathForDroppedFile(f),
        ),
      );
      await choose(paths);
    } catch {
      await choose([]);
    }
  }
  return (
    <details
      className="compress-subtitle"
      data-testid="subtitle-settings"
      open={open}
      onToggle={(e) => toggle(e.currentTarget.open)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => void drop(e)}
    >
      <summary>
        {t("vpSubTitle")}
        <span title={binding?.path}>
          {binding ? filenameForPath(binding.path) : t("vpSubNone")}
        </span>
      </summary>
      <div className="compress-subtitle-body">
        <div className="compress-subtitle-tools">
          <button
            type="button"
            className="wb-secondary"
            data-testid="subtitle-choose"
            disabled={disabled || !available}
            onClick={() => void choose()}
          >
            {t(binding ? "vpSubReplace" : "vpSubChoose")}
          </button>
          {binding && (
            <button
              type="button"
              className="wb-secondary"
              data-testid="subtitle-remove"
              disabled={disabled}
              onClick={remove}
            >
              {t("cRemoveDraft")}
            </button>
          )}
        </div>
        {!binding && <small>{t("vpSubImportHint")}</small>}
        {binding && (
          <>
            <label className="compress-subtitle-enable">
              <input
                type="checkbox"
                data-testid="subtitle-enabled"
                checked={binding.enabled}
                disabled={disabled}
                onChange={(e) =>
                  change({ ...binding, enabled: e.target.checked })
                }
              />
              {t("vpSubEnabled")}
            </label>
            <small
              className={error ? "cvt-error" : ""}
              data-testid="subtitle-status"
            >
              {t(
                !binding.enabled
                  ? "vpSubDisabled"
                  : checking
                    ? "vpSubChecking"
                    : error || "vpSubReady",
                { count: info?.events || 0 },
              )}
            </small>
            <label className="cvt-field">
              <span>{t("vpSubOffset")}</span>
              <input
                type="number"
                min={-3600}
                max={3600}
                step={0.1}
                data-testid="subtitle-offset"
                disabled={disabled || !binding.enabled}
                value={offset}
                onBlur={() => {
                  setOffset(String(binding.offsetMs / 1000));
                  validity(true);
                }}
                onChange={(e) => {
                  setOffset(e.target.value);
                  const n = Number(e.target.value),
                    valid =
                      e.target.value.trim() !== "" &&
                      Number.isFinite(n) &&
                      Math.abs(n) <= 3600;
                  validity(valid);
                  if (valid)
                    change({ ...binding, offsetMs: Math.round(n * 1000) });
                }}
              />
              <small>{t("vpSubOffsetHint")}</small>
            </label>
            {binding.format === "srt" ? (
              <>
                <label className="cvt-field">
                  <span>{t("vpSubFont")}</span>
                  <select
                    disabled={disabled || !binding.enabled}
                    value={binding.style.fontFamily}
                    data-testid="subtitle-font"
                    onChange={(e) =>
                      editStyle({
                        fontFamily: e.target
                          .value as CompressionSubtitleStyle["fontFamily"],
                      })
                    }
                  >
                    {["Microsoft YaHei", "SimHei", "SimSun", "Arial"].map(
                      (font) => (
                        <option key={font}>{font}</option>
                      ),
                    )}
                  </select>
                </label>
                <div className="compress-pair">
                  <label className="cvt-field">
                    <span>{t("vpSubSize")}</span>
                    <select
                      data-testid="subtitle-font-size"
                      value={binding.style.fontSize}
                      disabled={disabled || !binding.enabled}
                      onChange={(e) =>
                        editStyle({ fontSize: Number(e.target.value) })
                      }
                    >
                      {Array.from(
                        new Set([
                          16,
                          24,
                          32,
                          40,
                          48,
                          56,
                          64,
                          72,
                          80,
                          96,
                          binding.style.fontSize,
                        ]),
                      )
                        .sort((a, b) => a - b)
                        .map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="cvt-field">
                    <span>{t("vpSubOutline")}</span>
                    <select
                      data-testid="subtitle-outline"
                      value={binding.style.outline}
                      disabled={disabled || !binding.enabled}
                      onChange={(e) =>
                        editStyle({ outline: Number(e.target.value) })
                      }
                    >
                      {Array.from({ length: 9 }, (_, i) => (
                        <option key={i}>{i}</option>
                      ))}
                    </select>
                  </label>
                  <label className="cvt-field">
                    <span>{t("vpSubColor")}</span>
                    <input
                      type="color"
                      data-testid="subtitle-color"
                      value={binding.style.color}
                      disabled={disabled || !binding.enabled}
                      onChange={(e) => editStyle({ color: e.target.value })}
                    />
                  </label>
                  <label className="cvt-field">
                    <span>{t("vpSubOutlineColor")}</span>
                    <input
                      type="color"
                      data-testid="subtitle-outline-color"
                      value={binding.style.outlineColor}
                      disabled={disabled || !binding.enabled}
                      onChange={(e) =>
                        editStyle({ outlineColor: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="cvt-field">
                  <span>{t("vpSubPosition")}</span>
                  <select
                    data-testid="subtitle-position"
                    value={binding.style.position}
                    disabled={disabled || !binding.enabled}
                    onChange={(e) =>
                      editStyle({
                        position: e.target
                          .value as CompressionSubtitleStyle["position"],
                      })
                    }
                  >
                    {["top", "middle", "bottom"].map((p) => (
                      <option key={p} value={p}>
                        {t(`vpSubPosition_${p}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <small>{t("vpSubScaleHint")}</small>
              </>
            ) : (
              <small>{t("vpSubASSHint")}</small>
            )}
            {info && binding.enabled && (
              <button
                className="wb-secondary"
                type="button"
                data-testid="subtitle-first-cue"
                disabled={disabled || !!error}
                onClick={() =>
                  seek(Math.max(0, info.firstMs + binding.offsetMs))
                }
              >
                {t("vpSubFirstCue")}
              </button>
            )}
          </>
        )}
      </div>
    </details>
  );
}
