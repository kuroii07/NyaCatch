import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  defaultOrganization,
  normalizeOrganization,
  type SaveOrganization,
} from "../utils/save-organization";
import "./download-efficiency.css";
export function useSaveOrganization() {
  const [value, setValue] = useState<SaveOrganization>(() => {
    try {
      return normalizeOrganization(
        JSON.parse(localStorage.getItem("download-organization-v1") || "null"),
      );
    } catch {
      return defaultOrganization;
    }
  });
  return [
    value,
    (next: SaveOrganization) => {
      // Surface storage errors to the caller instead of claiming this preference was saved.
      localStorage.setItem("download-organization-v1", JSON.stringify(next));
      setValue(next);
    },
  ] as const;
}
export function SaveOrganizationControls({
  value,
  onChange,
  path,
  disabled,
}: {
  value: SaveOrganization;
  onChange: (next: SaveOrganization) => void;
  path?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <details className="ef-organization" data-testid="save-organization">
      <summary>{t("orgTitle")}</summary>
      <div className="ef-organization-fields">
        <label>
          {t("orgFolders")}
          <select
            data-testid="organization-folders"
            value={value.folders}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...value,
                folders: e.target.value as SaveOrganization["folders"],
              })
            }
          >
            {(["none", "platform", "author", "date"] as const).map((v) => (
              <option key={v} value={v}>
                {t(
                  {
                    none: "orgNone",
                    platform: "orgPlatform",
                    author: "orgAuthor",
                    date: "orgDate",
                  }[v],
                )}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("orgNames")}
          <select
            data-testid="organization-names"
            value={value.names}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...value,
                names: e.target.value as SaveOrganization["names"],
              })
            }
          >
            {(["title", "author-title", "date-title"] as const).map((v) => (
              <option key={v} value={v}>
                {t(
                  {
                    title: "orgTitleName",
                    "author-title": "orgAuthorTitle",
                    "date-title": "orgDateTitle",
                  }[v],
                )}
              </option>
            ))}
          </select>
        </label>
      </div>
      {path && (
        <p data-testid="organization-preview">
          {t("orgPath")}
          <span>{path}</span>
        </p>
      )}
    </details>
  );
}
