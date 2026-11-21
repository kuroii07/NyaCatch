import { useMemoizedFn } from "ahooks";
import { App, Input } from "antd";
import { FileSearch, Search, Settings2, Trash2, X } from "lucide-react";
import { memo, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { createDownloadTasks } from "@/api/download-task";
import { usePlatform } from "@/hooks/use-platform";
import {
  browserSourcesSelector,
  type SourceData,
  setBrowserSelector,
  useBrowserStore,
} from "@/store/browser";
import {
  filterSources,
  sourceGroup,
  sourceHost,
  type SourceGroup,
} from "../source-model";

const groupKeys = {
  all: "seAll",
  stream: "seStream",
  file: "seFile",
  platform: "sePlatform",
} as const;

interface SourceItemProps {
  item: SourceData;
  pending: boolean;
  onDelete: (url: string) => void;
  onEdit: (items: SourceData[]) => void;
  onDownload: (item: SourceData) => void;
}

const SourceItem = memo(function SourceItem({
  item,
  pending,
  onDelete,
  onEdit,
  onDownload,
}: SourceItemProps) {
  const { t } = useTranslation();
  return (
    <article className="se-resource" data-testid="source-resource">
      <div className="se-resource-meta">
        <span>{t(groupKeys[sourceGroup(item.type)])}</span>
        <small>{sourceHost(item.url)}</small>
      </div>
      <h3 title={item.name}>
        {item.name || sourceHost(item.url) || t("seUntitled")}
      </h3>
      <details className="se-resource-details">
        <summary>{t("seDetails")}</summary>
        <code>{item.url}</code>
      </details>
      <div className="se-resource-actions">
        <button
          type="button"
          className="wb-icon-button"
          aria-label={t("delete")}
          title={t("delete")}
          onClick={() => onDelete(item.url)}
          disabled={pending}
        >
          <Trash2 size={15} />
        </button>
        <button
          type="button"
          className="wb-secondary se-resource-settings"
          onClick={() => onEdit([item])}
          disabled={pending}
        >
          <Settings2 size={15} />
          {t("seSettings")}
        </button>
        <button
          type="button"
          className="wb-primary"
          onClick={() => onDownload(item)}
          disabled={pending}
        >
          {t(pending ? "seSubmitting" : "downloadNow")}
        </button>
      </div>
    </article>
  );
});

export function BrowserViewPanel({ onClose }: { onClose: () => void }) {
  const { sources } = useBrowserStore(useShallow(browserSourcesSelector));
  const { deleteSource, clearSources } = useBrowserStore(
    useShallow(setBrowserSelector),
  );
  const { t } = useTranslation();
  const { browser } = usePlatform();
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<SourceGroup>("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const inFlight = useRef(new Set<string>());
  const filtered = useMemo(
    () => filterSources(sources, query, group),
    [sources, query, group],
  );

  const resetFilters = () => {
    setQuery("");
    setGroup("all");
  };
  const handleEdit = useMemoizedFn((items: SourceData[]) => {
    browser.showDownloadDialog(items);
  });
  const handleDownloadNow = useMemoizedFn(async (item: SourceData) => {
    // Keep rapid clicks from creating multiple tasks while the first request is pending.
    if (inFlight.current.has(item.url)) return;
    inFlight.current.add(item.url);
    setPending([...inFlight.current]);
    try {
      await createDownloadTasks(
        [
          {
            url: item.url,
            name: item.name,
            headers: item.headers,
            type: item.type,
            folder: "",
          },
        ],
        true,
      );
      message.success(t("seAdded"));
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current.delete(item.url);
      setPending([...inFlight.current]);
    }
  });

  return (
    <section
      className="se-capture"
      aria-label={t("seCaptured")}
      data-testid="source-capture"
    >
      <header className="se-capture-heading">
        <h2>
          {t("seCaptured")}{" "}
          <small data-testid="source-count" aria-live="polite">
            {t("seCount", { count: sources.length })}
          </small>
        </h2>
        <div className="se-capture-heading-actions">
          <button
            type="button"
            className="wb-icon-button"
            aria-label={t("clear")}
            title={t("clear")}
            disabled={!sources.length || !!pending.length}
            onClick={() => setConfirmClear(true)}
            data-testid="source-clear"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            className="wb-icon-button"
            data-testid="source-capture-close"
            aria-label={t("seCloseCapture")}
            title={t("seCloseCapture")}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
      </header>
      {confirmClear && (
        <div className="se-clear-confirm" role="alert">
          <p>{t("seClearConfirm")}</p>
          <div>
            <button
              type="button"
              className="wb-secondary"
              onClick={() => setConfirmClear(false)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className="wb-secondary"
              data-testid="source-clear-confirm"
              disabled={!!pending.length}
              onClick={() => {
                clearSources();
                setConfirmClear(false);
              }}
            >
              {t("confirm")}
            </button>
          </div>
        </div>
      )}
      <div className="se-filters">
        <Input
          prefix={<Search size={15} aria-hidden="true" />}
          aria-label={t("seSearch")}
          placeholder={t("seSearch")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-testid="source-search"
        />
        <select
          aria-label={t("seType")}
          value={group}
          onChange={(event) => setGroup(event.target.value as SourceGroup)}
          data-testid="source-type"
        >
          {Object.entries(groupKeys).map(([key, label]) => (
            <option key={key} value={key}>
              {t(label)}
            </option>
          ))}
        </select>
      </div>
      <div className="se-resource-list" data-testid="source-resource-list">
        {!filtered.length ? (
          <div className="se-empty" data-testid="source-empty">
            <FileSearch size={30} aria-hidden="true" />
            <strong>{t(sources.length ? "seNoMatches" : "seWaiting")}</strong>
            {query.trim() || group !== "all" ? (
              <button
                type="button"
                className="wb-secondary"
                onClick={resetFilters}
              >
                {t("seResetFilters")}
              </button>
            ) : (
              <p>{t("seWaitingHint")}</p>
            )}
          </div>
        ) : (
          filtered.map((item) => (
            <SourceItem
              key={item.url}
              item={item}
              pending={pending.includes(item.url)}
              onDelete={deleteSource}
              onEdit={handleEdit}
              onDownload={handleDownloadNow}
            />
          ))
        )}
      </div>
    </section>
  );
}
