import { UploadCloud, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./media-source-controls.css";

export function MediaSourceEmpty({
  title,
  detail,
  onChoose,
  disabled,
  chooseTestId,
}: {
  title: string;
  detail?: string;
  onChoose: () => void;
  disabled?: boolean;
  chooseTestId: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="nc-media-source-empty" data-testid="media-source-empty">
      <span className="nc-media-source-empty__icon" aria-hidden="true">
        <UploadCloud size={26} strokeWidth={1.8} />
      </span>
      <h2>{title}</h2>
      <p>{t("cSourceDropHint")}</p>
      <button
        type="button"
        className="wb-secondary"
        disabled={disabled}
        data-testid={chooseTestId}
        onClick={onChoose}
      >
        {t("cChoose")}
      </button>
      {detail && <small>{detail}</small>}
    </div>
  );
}

/** Removes a staged reference only; each page retains its own guarded update. */
export function SourceRemoveButton({
  onRemove,
  disabled,
  testId,
}: {
  onRemove: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="wb-icon-button nc-source-remove"
      title={t("cRemoveDraft")}
      aria-label={t("cRemoveDraft")}
      data-testid={testId}
      disabled={disabled}
      onClick={onRemove}
    >
      <X size={16} aria-hidden="true" />
    </button>
  );
}
