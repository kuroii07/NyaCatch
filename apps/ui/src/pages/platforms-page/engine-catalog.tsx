import { useState } from "react";
import { App, Dropdown } from "antd";
import { useTranslation } from "react-i18next";
import {
  Link2,
  ChevronLeft,
  ChevronRight,
  Search,
  ExternalLink,
} from "lucide-react";
import { usePlatform } from "@/hooks/use-platform";
import { extractorWebsites, websiteUnavailableReason } from "./engine-websites";
import generated from "./engine-catalog.generated.json";
import {
  filterEngineCatalog,
  paginateEngineCatalog,
  type EngineCatalogData,
  type EngineStatus,
} from "./engine-model";

export const bundledEngineCatalog: EngineCatalogData = generated;

export function EngineCatalog({ onParse }: { onParse: () => void }) {
  const { t } = useTranslation();
  const { shell } = usePlatform();
  const { message } = App.useApp();
  const [opening, setOpening] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<EngineStatus>("all");
  const [page, setPage] = useState(1);
  const filtered = filterEngineCatalog(
    bundledEngineCatalog.extractors,
    query,
    status,
  );
  const visible = paginateEngineCatalog(filtered, page);
  async function openWebsite(id: string, url: string) {
    if (!extractorWebsites(id).includes(url) || opening) return;
    setOpening(id);
    try {
      await shell.open(url);
    } catch {
      message.error(t("pOpenFailed"));
    } finally {
      setOpening("");
    }
  }
  return (
    <section
      className="p-engine-catalog"
      data-testid="engine-catalog"
      aria-label={t("pcAll")}
    >
      <div className="p-engine-intro">
        <div className="p-engine-heading">
          <div className="p-engine-title">
            <strong
              data-testid="engine-total"
              data-total={bundledEngineCatalog.extractors.length}
            >
              {t("pcRules", { count: bundledEngineCatalog.extractors.length })}
            </strong>
            <span>
              {bundledEngineCatalog.engine} {bundledEngineCatalog.version}
            </span>
          </div>
          <button
            type="button"
            className="wb-secondary"
            data-testid="platform-catalog-parse"
            onClick={onParse}
          >
            <Link2 size={15} />
            {t("ppCatalogAction")}
          </button>
        </div>
        <p>{t("pcIntro")}</p>
        <p className="p-engine-scope">{t("pcScope")}</p>
        <p>{t("pcWebsiteHint")}</p>
      </div>
      <div className="p-filter-panel p-engine-filters">
        <label className="p-search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            data-testid="engine-search"
            aria-label={t("pcSearch")}
            placeholder={t("pcSearch")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="p-status-select">
          {t("pcStatus")}
          <select
            data-testid="engine-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as EngineStatus);
              setPage(1);
            }}
          >
            <option value="all">{t("pAll")}</option>
            <option value="available">{t("pcAvailable")}</option>
            <option value="broken">{t("pcBroken")}</option>
          </select>
        </label>
      </div>
      <div className="p-engine-results">
        <span
          role="status"
          data-testid="engine-match-count"
          data-count={filtered.length}
        >
          {t("pcMatches", { count: filtered.length })}
        </span>
        <nav
          className="p-engine-pagination"
          aria-label={t("pcPage", {
            current: visible.current,
            pages: visible.pages,
          })}
        >
          <button
            type="button"
            data-testid="engine-previous"
            disabled={visible.current === 1}
            onClick={() => setPage(visible.current - 1)}
          >
            <ChevronLeft size={15} aria-hidden />
            {t("pcPrevious")}
          </button>
          <span>
            {t("pcPage", { current: visible.current, pages: visible.pages })}
          </span>
          <button
            type="button"
            data-testid="engine-next"
            disabled={visible.current === visible.pages}
            onClick={() => setPage(visible.current + 1)}
          >
            {t("pcNext")}
            <ChevronRight size={15} aria-hidden />
          </button>
        </nav>
      </div>
      {visible.entries.length ? (
        <div className="p-engine-list">
          {visible.entries.map((entry) => {
            const sites = extractorWebsites(entry.id);
            const action = (
              <button
                type="button"
                className="p-engine-website"
                data-testid="engine-website"
                title={sites.length === 1 ? sites[0] : t("pcWebsiteChoose")}
                aria-label={`${entry.id}: ${t("pOpenBrowser")}`}
                aria-busy={opening === entry.id}
                disabled={!!opening}
                onClick={
                  sites.length === 1
                    ? () => void openWebsite(entry.id, sites[0])
                    : undefined
                }
              >
                <ExternalLink size={14} aria-hidden />
                <span>{t("pOpenBrowser")}</span>
              </button>
            );
            return (
              <article
                key={entry.id}
                data-extractor={entry.id}
                className={`p-engine-row${entry.broken ? " is-broken" : ""}`}
              >
                <div className="p-engine-name">
                  <strong>
                    {entry.id === "generic" ? t("pcGeneric") : entry.id}
                  </strong>
                  <span>
                    {entry.id === "generic"
                      ? t("pcGenericHint")
                      : t(entry.broken ? "pcBroken" : "pcAvailable")}
                  </span>
                </div>
                {sites.length > 1 ? (
                  <Dropdown
                    trigger={["click"]}
                    disabled={!!opening}
                    overlayClassName="p-website-menu"
                    menu={{
                      items: sites.map((url) => ({
                        key: url,
                        label: new URL(url).hostname,
                      })),
                      onClick: ({ key }) => void openWebsite(entry.id, key),
                    }}
                  >
                    {action}
                  </Dropdown>
                ) : sites.length === 1 ? (
                  action
                ) : (
                  <span className="p-engine-website-missing">
                    {t(websiteUnavailableReason(entry.id))}
                  </span>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-empty">
          <Search size={28} aria-hidden />
          <h2>{t("pEmpty")}</h2>
          <p>{t("pEmptyHint")}</p>
          <button
            type="button"
            className="wb-secondary"
            onClick={() => {
              setQuery("");
              setStatus("all");
              setPage(1);
            }}
          >
            {t("pReset")}
          </button>
        </div>
      )}
    </section>
  );
}
