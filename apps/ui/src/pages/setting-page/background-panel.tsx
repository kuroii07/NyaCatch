import { useCallback, useEffect, useRef, useState } from "react";
import { shallow } from "zustand/shallow";
import { Check, ImageOff, ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  backgroundPresetIds,
  defaultBackground,
  prepareBackgroundImage,
  type BackgroundPreferences,
  type BackgroundSource,
} from "@/backgrounds";
import { backgroundImages } from "@/components/app-background";
import { useAppearance } from "@/store/appearance";

const presetLabels = {
  meadow: "backgroundPresetMeadow",
  cloud: "backgroundPresetCloud",
  lake: "backgroundPresetLake",
  night: "backgroundPresetNight",
};
const presetStep: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};
function clearPreview() {
  document.documentElement.style.removeProperty(
    "--wb-background-opacity-preview",
  );
  document.documentElement.style.removeProperty("--wb-background-blur-preview");
}
export function BackgroundPanel() {
  const { t } = useTranslation();
  const { background, setAppearance } = useAppearance();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"upload" | "save" | null>(null);
  const [adjustment, setAdjustment] = useState(background);
  const pending = useRef<{
    background: BackgroundPreferences;
    patch: Partial<Pick<BackgroundPreferences, "opacity" | "blur">>;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const commitAdjustments = useCallback((notify = true) => {
    const edit = pending.current;
    if (!edit) return;
    pending.current = null;
    clearPreview();
    const current = useAppearance.getState();
    const next = { ...current.background, ...edit.patch };
    // A newer preference from another window takes precedence over this preview.
    const saved =
      !shallow(current.background, edit.background) ||
      shallow(current.background, next) ||
      current.setAppearance({ background: next });
    if (notify) {
      setError(saved ? null : "save");
      setAdjustment(useAppearance.getState().background);
    }
  }, []);
  useEffect(() => {
    pending.current = null;
    clearPreview();
    setAdjustment(background);
    setError(null);
  }, [
    background.source,
    background.customImage,
    background.opacity,
    background.blur,
  ]);
  useEffect(() => {
    const commit = () => commitAdjustments();
    const beforeUnload = () => commitAdjustments(false);
    window.addEventListener("blur", commit);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pointerup", commit);
    window.addEventListener("pointercancel", commit);
    return () => {
      window.removeEventListener("blur", commit);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pointerup", commit);
      window.removeEventListener("pointercancel", commit);
      commitAdjustments(false);
    };
  }, [commitAdjustments]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const update = (patch: Partial<BackgroundPreferences>) => {
    commitAdjustments();
    const current = useAppearance.getState().background;
    const saved = setAppearance({ background: { ...current, ...patch } });
    setError(saved ? null : "save");
    return saved;
  };
  const previewAdjustment = (setting: "opacity" | "blur", value: number) => {
    const edit = pending.current || {
      background: useAppearance.getState().background,
      patch: {},
    };
    edit.patch = { ...edit.patch, [setting]: value };
    pending.current = edit;
    setAdjustment((current) => ({ ...current, [setting]: value }));
    setError(null);
    document.documentElement.style.setProperty(
      `--wb-background-${setting}-preview`,
      setting === "opacity" ? String(value / 100) : `${value}px`,
    );
  };
  const sources: BackgroundSource[] = [
    "none",
    ...backgroundPresetIds,
    ...(background.customImage ? ["custom" as const] : []),
  ];
  return (
    <div className="s-background-panel" data-testid="background-panel">
      <div
        className="s-background-grid"
        role="radiogroup"
        aria-label={t("backgroundTitle")}
      >
        {sources.map((source) => {
          const image =
            source === "none"
              ? ""
              : source === "custom"
                ? background.customImage
                : backgroundImages[source];
          const label = t(
            source === "none"
              ? "backgroundNone"
              : source === "custom"
                ? "backgroundCustom"
                : presetLabels[source],
          );
          return (
            <button
              key={source}
              type="button"
              className="s-background-card"
              role="radio"
              aria-checked={source === background.source}
              tabIndex={source === background.source ? 0 : -1}
              data-testid={`background-${source}`}
              onClick={() => update({ source })}
              disabled={busy}
              onKeyDown={(event) => {
                const step = presetStep[event.key];
                if (
                  step === undefined &&
                  event.key !== "Home" &&
                  event.key !== "End"
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? sources.length - 1
                      : (sources.indexOf(source) + step + sources.length) %
                        sources.length;
                if (update({ source: sources[next] }))
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>("button")
                    .item(next)
                    ?.focus();
              }}
            >
              <span className="s-background-thumbnail">
                {image ? (
                  <img src={image} alt="" />
                ) : (
                  <ImageOff size={22} aria-hidden="true" />
                )}
              </span>
              <span className="s-background-name">
                {label}
                {source === background.source && (
                  <Check size={16} aria-label={t("sSelected")} />
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="s-background-actions">
        <input
          ref={input}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp,image/gif"
          data-testid="background-file"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            const request = ++generation.current;
            setBusy(true);
            setError(null);
            try {
              const customImage = await prepareBackgroundImage(file);
              if (request === generation.current)
                update({ source: "custom", customImage });
            } catch {
              if (request === generation.current) setError("upload");
            } finally {
              if (request === generation.current) setBusy(false);
            }
          }}
        />
        <button
          type="button"
          data-testid="background-upload"
          disabled={busy}
          aria-busy={busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={16} />
          {t("backgroundUpload")}
        </button>
        {background.customImage && (
          <button
            type="button"
            data-testid="background-remove"
            disabled={busy}
            onClick={() =>
              update({
                customImage: "",
                ...(background.source === "custom" ? { source: "none" } : {}),
              })
            }
          >
            <Trash2 size={16} />
            {t("backgroundRemove")}
          </button>
        )}
        <button
          type="button"
          data-testid="background-reset"
          disabled={busy || background.source === "none"}
          onClick={() =>
            update({
              opacity: defaultBackground.opacity,
              blur: defaultBackground.blur,
            })
          }
        >
          <RotateCcw size={16} />
          {t("backgroundReset")}
        </button>
      </div>
      <p className="s-background-hint">{t("backgroundUploadHint")}</p>
      {error && (
        <p role="alert" className="s-background-error">
          {t(
            error === "upload"
              ? "backgroundUploadError"
              : "backgroundSaveError",
          )}
        </p>
      )}
      <div className="s-background-sliders">
        {(["opacity", "blur"] as const).map((setting) => (
          <div key={setting}>
            <label htmlFor={`background-${setting}`}>
              {t(
                setting === "opacity" ? "backgroundOpacity" : "backgroundBlur",
              )}
              <output htmlFor={`background-${setting}`}>
                {adjustment[setting]}
                {setting === "opacity" ? "%" : "px"}
              </output>
            </label>
            <input
              id={`background-${setting}`}
              data-testid={`background-${setting}`}
              type="range"
              min="0"
              max={setting === "opacity" ? 100 : 30}
              step="1"
              value={adjustment[setting]}
              aria-describedby="background-adjustment-hint"
              disabled={busy || background.source === "none"}
              onChange={(event) =>
                previewAdjustment(setting, Number(event.target.value))
              }
              onBlur={() => commitAdjustments()}
              onKeyUp={(event) => {
                if (
                  [
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Home",
                    "End",
                    "PageUp",
                    "PageDown",
                  ].includes(event.key)
                )
                  commitAdjustments();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                pending.current = null;
                clearPreview();
                setAdjustment(useAppearance.getState().background);
              }}
            />
          </div>
        ))}
      </div>
      <p className="s-background-hint" id="background-adjustment-hint">
        {t("backgroundAdjustmentHint")}
      </p>
    </div>
  );
}
