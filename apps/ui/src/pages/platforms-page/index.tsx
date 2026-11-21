import { useState } from "react";
import { App, Tooltip } from "antd";
import {
  Link2,
  AudioLines,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  ChevronDown,
  ExternalLink,
  Film,
  Frame,
  Globe2,
  Image,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePlatform } from "@/hooks/use-platform";
import { useAppStore } from "@/store/app";
import { isWeb } from "@/utils";
import {
  PLATFORM_CATALOG,
  filterPlatforms,
  platformDetailKeys,
  type PlatformFilters,
  type PlatformMedia,
  type SupportedPlatform,
} from "./platforms";
import "./platforms.css";
import { EngineCatalog, bundledEngineCatalog } from "./engine-catalog";
import { PlatformParserDialog } from "./parser-dialog";
import type { PlatformParserTarget } from "./parser-entry-model";
import { siteIcons } from "../source-extract/site-icons";

const initialFilters: PlatformFilters = {
  region: "all",
  media: "all",
  status: "all",
  query: "",
};
const mediaLabels = {
  video: "pVideo",
  audio: "pAudio",
  image: "pImage",
  cover: "pCover",
};
const mediaIcons = {
  video: Film,
  audio: AudioLines,
  image: Image,
  cover: Frame,
};
const statusLabels = {
  verified: "pVerified",
  partial: "pPartial",
  engine: "pEngine",
  planned: "pPlanned",
};
const statusHints = {
  verified: "pVerifiedHint",
  partial: "pPartialHint",
  engine: "pEngineHint",
  planned: "pPlannedHint",
};
const statusIcons = {
  verified: CheckCircle2,
  partial: CircleHelp,
  engine: CircleDashed,
  planned: CircleDashed,
};

export default function PlatformsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const showAll = params.get("view") === "all";
  const [parserTarget, setParserTarget] = useState<PlatformParserTarget | null>(
    null,
  );
  const [parserOpen, setParserOpen] = useState(false);
  function openParser(target: PlatformParserTarget) {
    setParserTarget(target);
    setParserOpen(true);
  }
  return (
    <div className="wb-page p-page" data-testid="platforms-page">
      <header className="wb-page-heading">
        <div>
          <h1>{t("pTitle")}</h1>
          <p>{t(showAll ? "pSubtitle" : "pcEvidenceHint")}</p>
        </div>
      </header>
      <nav className="p-view-tabs" aria-label={t("pTitle")}>
        <button
          type="button"
          data-testid="platform-tab-evidence"
          aria-pressed={!showAll}
          onClick={() => setParams({})}
        >
          {t("pcEvidence")}
          <span>
            {PLATFORM_CATALOG.filter((p) => p.status !== "planned").length}
          </span>
        </button>
        <button
          type="button"
          data-testid="platform-tab-all"
          aria-pressed={showAll}
          onClick={() => setParams({ view: "all" })}
        >
          {t("pcAll")}
          <span>
            {t("pcRules", { count: bundledEngineCatalog.extractors.length })}
          </span>
        </button>
      </nav>
      {showAll ? (
        <EngineCatalog onParse={() => openParser({ kind: "catalog" })} />
      ) : (
        <CommonPlatformsPage
          onParse={(id) => openParser({ kind: "common", id })}
        />
      )}
      <PlatformParserDialog
        open={parserOpen}
        target={parserTarget}
        onClose={() => setParserOpen(false)}
      />
    </div>
  );
}

function CommonPlatformsPage({ onParse }: { onParse: (id: string) => void }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { app, shell } = usePlatform();
  const openInNewWindow = useAppStore((state) => state.openInNewWindow);
  const [filters, setFilters] = useState<PlatformFilters>(initialFilters);
  const [opening, setOpening] = useState("");
  const platforms = filterPlatforms(PLATFORM_CATALOG, filters);
  const filtered = Object.keys(filters).some(
    (key) =>
      filters[key as keyof PlatformFilters] !==
      initialFilters[key as keyof PlatformFilters],
  );

  async function openPlatform(platform: SupportedPlatform, material: boolean) {
    setOpening(platform.id);
    try {
      if (!material) {
        await shell.open(platform.website);
      } else if (openInNewWindow) {
        await app.showBrowserWindow(platform.id);
      } else {
        navigate(`/source?platform=${platform.id}`);
      }
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("pOpenFailed"),
      );
    } finally {
      setOpening("");
    }
  }

  function renderCard(platform: SupportedPlatform) {
    const planned = platform.status === "planned";
    const engine = platform.status === "engine";
    const detailKeys = platformDetailKeys(platform);
    const StatusIcon = statusIcons[platform.status];
    return (
      <article
        className={`p-card${planned ? " is-planned" : ""}`}
        key={platform.id}
        data-testid={`platform-${platform.id}`}
      >
        <header className="p-card-header">
          <span className="p-platform-mark" aria-hidden>
            <img src={siteIcons[platform.id]} alt="" draggable={false} />
          </span>
          <div className="p-platform-name">
            <h3>{t(platform.nameKey)}</h3>
            <span>
              {new URL(platform.website).hostname.replace(/^www\./, "")}
            </span>
          </div>
          <Tooltip title={t(statusHints[platform.status])}>
            <span className={`p-status is-${platform.status}`} tabIndex={0}>
              <StatusIcon size={14} aria-hidden />
              {t(statusLabels[platform.status])}
            </span>
          </Tooltip>
        </header>
        <div
          className="p-capabilities"
          aria-label={t(
            planned
              ? "pPlannedCapability"
              : engine
                ? "pEngineCapability"
                : "pCapability",
          )}
        >
          <span className="p-region">
            {t(platform.region === "domestic" ? "pDomestic" : "pOverseas")}
          </span>
          {platform.media.map((media) => {
            const Icon = mediaIcons[media];
            return (
              <span key={media}>
                <Icon size={13} aria-hidden />
                {t(mediaLabels[media])}
              </span>
            );
          })}
        </div>
        <footer className="p-card-actions">
          {!isWeb && (
            <Tooltip title={t("pMaterialHint")}>
              <button
                type="button"
                className="wb-secondary"
                data-testid={`platform-material-${platform.id}`}
                disabled={!!opening}
                onClick={() => void openPlatform(platform, true)}
              >
                <Globe2 size={15} aria-hidden />
                {t("pOpenMaterial")}
              </button>
            </Tooltip>
          )}
          <Tooltip title={t("pBrowserHint")}>
            <button
              type="button"
              className="p-website-button"
              data-testid={`platform-website-${platform.id}`}
              disabled={!!opening}
              onClick={() => void openPlatform(platform, false)}
            >
              <ExternalLink size={14} aria-hidden />
              {t("pOpenBrowser")}
            </button>
          </Tooltip>
          {!planned && (
            <Tooltip title={t("ppOpenHint")}>
              <button
                type="button"
                className="p-parser-button"
                data-testid={`platform-parse-${platform.id}`}
                onClick={() => onParse(platform.id)}
              >
                {t("pGoParser")}
                <Link2 size={16} aria-hidden />
              </button>
            </Tooltip>
          )}
        </footer>
        <details
          className="p-card-notes"
          data-testid={`platform-details-${platform.id}`}
        >
          <summary
            data-testid={`platform-details-toggle-${platform.id}`}
            aria-label={t("pCardDetailsFor", { name: t(platform.nameKey) })}
          >
            {t("pCardDetails")}
            <ChevronDown size={13} aria-hidden />
          </summary>
          <p className="p-evidence">{t(detailKeys.evidence)}</p>
          <dl className="p-details">
            {!planned && (
              <div>
                <dt>{t("pLoginRule")}</dt>
                <dd>{t(engine ? "pEngineAccess" : "pAnonymous")}</dd>
              </div>
            )}
            <div>
              <dt>{t("pBoundary")}</dt>
              <dd>{t(detailKeys.limit)}</dd>
            </div>
          </dl>
          {platform.verifiedAt && (
            <p className="p-checked">
              {t("pChecked")}{" "}
              <time dateTime={platform.verifiedAt}>{platform.verifiedAt}</time>
            </p>
          )}
        </details>
      </article>
    );
  }

  return (
    <div className="p-evidence-page" data-testid="platform-evidence">
      <div className="p-filter-panel">
        <div className="p-search-row">
          <label className="p-search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              data-testid="platform-search"
              aria-label={t("pSearch")}
              placeholder={t("pSearch")}
              value={filters.query}
              onChange={(event) =>
                setFilters({ ...filters, query: event.target.value })
              }
            />
          </label>
          <label className="p-status-select">
            {t("pStatus")}
            <select
              aria-label={t("pStatus")}
              data-testid="platform-status"
              value={filters.status}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  status: event.target.value as PlatformFilters["status"],
                })
              }
            >
              <option value="all">{t("pAll")}</option>
              {(["verified", "partial", "engine", "planned"] as const).map(
                (status) => (
                  <option key={status} value={status}>
                    {t(statusLabels[status])}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <div className="p-filter-row" role="group" aria-label={t("pRegion")}>
          <span className="p-filter-label">{t("pRegion")}</span>
          {(["all", "domestic", "overseas"] as const).map((region) => (
            <button
              type="button"
              data-testid={`platform-region-${region}`}
              key={region}
              aria-pressed={filters.region === region}
              onClick={() => setFilters({ ...filters, region })}
            >
              {t(
                region === "all"
                  ? "pAll"
                  : region === "domestic"
                    ? "pDomestic"
                    : "pOverseas",
              )}
            </button>
          ))}
        </div>
        <div className="p-filter-row" role="group" aria-label={t("pMedia")}>
          <span className="p-filter-label">{t("pMedia")}</span>
          {(["all", "video", "audio", "image", "cover"] as const).map(
            (media) => (
              <button
                type="button"
                data-testid={`platform-media-${media}`}
                key={media}
                aria-pressed={filters.media === media}
                onClick={() => setFilters({ ...filters, media })}
              >
                {t(
                  media === "all"
                    ? "pAll"
                    : mediaLabels[media as PlatformMedia],
                )}
              </button>
            ),
          )}
        </div>
      </div>
      <div className="p-result-row">
        <p>{t("pScope")}</p>
        <span role="status" data-testid="platform-count">
          {t("pResults", { count: platforms.length })}
        </span>
        {filtered && (
          <button
            type="button"
            data-testid="platform-reset"
            onClick={() => setFilters(initialFilters)}
          >
            <X size={13} aria-hidden />
            {t("pReset")}
          </button>
        )}
      </div>
      {platforms.length ? (
        [false, true].map((planned) => {
          const group = platforms.filter(
            (platform) => (platform.status === "planned") === planned,
          );
          return group.length ? (
            <section
              className="p-group"
              key={String(planned)}
              aria-labelledby={`platform-group-${planned}`}
            >
              <h2 id={`platform-group-${planned}`}>
                {t(planned ? "pPlannedGroup" : "pReadyGroup")}
                <span>{group.length}</span>
              </h2>
              <div className="p-grid">{group.map(renderCard)}</div>
            </section>
          ) : null;
        })
      ) : (
        <div className="p-empty">
          <Search size={30} aria-hidden />
          <h2>{t("pEmpty")}</h2>
          <p>{t("pEmptyHint")}</p>
          <button
            type="button"
            className="wb-secondary"
            onClick={() => setFilters(initialFilters)}
          >
            {t("pReset")}
          </button>
        </div>
      )}
    </div>
  );
}
