import { type ReactElement, useEffect, useState } from "react";
import { CloseIcon } from "@/assets/svg";
import { useTranslation } from "react-i18next";

interface Props {
  onContextMenu?: () => void;
  onClick?: () => void;
  onClose?: () => void;
  src?: string;
  icon?: ReactElement;
  title?: string;
  siteId?: string;
  preset?: boolean;
}

export function FavItem({
  onContextMenu,
  onClick,
  onClose,
  src,
  icon,
  title,
  siteId,
  preset = false,
}: Props) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div
      className="se-favorite"
      data-testid={preset ? "source-site" : "source-favorite"}
      data-site-id={siteId}
    >
      <button
        type="button"
        className="se-favorite-open"
        onContextMenu={onContextMenu}
        onClick={onClick}
        title={title}
        aria-label={title}
      >
        <span className="se-site-icon" aria-hidden="true">
          {src && !failed ? (
            <img
              src={src}
              alt=""
              width={36}
              height={36}
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
            />
          ) : (
            icon || (
              <span className="se-site-fallback">
                {Array.from(title || "?")[0]}
              </span>
            )
          )}
        </span>
        <span>{title}</span>
      </button>
      {onClose && (
        <button
          type="button"
          className="se-favorite-remove"
          aria-label={t("seRemoveFavorite", { name: title })}
          title={t("seRemoveFavorite", { name: title })}
          onClick={onClose}
        >
          <CloseIcon width={15} height={15} />
        </button>
      )}
    </div>
  );
}
