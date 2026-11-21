import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  App,
  Button,
  Input,
  InputNumber,
  Popover,
  QRCode,
  Radio,
  Select,
  Switch,
} from "antd";
import {
  Copy,
  Download,
  FolderOpen,
  FolderInput,
  Globe2,
  Info,
  Monitor,
  Network,
  Palette,
  Settings2,
  Upload,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import {
  AppLanguage,
  APP_BUILD_VERSION,
  AppTheme,
  LANGUAGE_OPTIONS,
  type AppStore,
} from "@mediago/shared-common";
import { getConfig, setConfigValue } from "@/api/config";
import { getDownloadLog, getDownloadTasks } from "@/api/download-task";
import { exportFavorites, importFavorites } from "@/api/favorite";
import { useEnvPath } from "@/hooks/use-config";
import { usePlatform } from "@/hooks/use-platform";
import { appStoreSelector, useAppStore } from "@/store/app";
import { http } from "@/utils/http";
import {
  createDiagnosticReport,
  diagnosticErrorDetails,
  diagnosticErrorSummary,
} from "@/utils/diagnostics";
import { isWeb } from "@/utils";
import brandIcon from "@/assets/brand/nyacatch.svg";
import { AppearancePanel } from "./appearance-panel";
import { BackgroundPanel } from "./background-panel";
import {
  SettingsRow as Row,
  SettingsSection as Section,
  isValidServiceUrl,
} from "./settings-controls";
import "./settings.css";

const groups = [
  { id: "general", key: "sGeneral", icon: Settings2 },
  { id: "download", key: "sDownload", icon: Download },
  { id: "appearance", key: "sAppearance", icon: Palette },
  { id: "network", key: "sNetwork", icon: Network },
  { id: "advanced", key: "sAdvanced", icon: Monitor },
  { id: "about", key: "sAbout", icon: Info },
] as const;
type Group = (typeof groups)[number]["id"];
type BooleanKey = {
  [K in keyof AppStore]-?: AppStore[K] extends boolean ? K : never;
}[keyof AppStore];

function DraftSettings({
  kind,
  settings,
  save,
}: {
  kind: "proxy" | "remote";
  settings: AppStore;
  save: (values: Partial<AppStore>) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const proxy = kind === "proxy";
  const snapshot = proxy
    ? {
        proxy: settings.proxy,
        useProxy: settings.useProxy,
        downloadProxySwitch: settings.downloadProxySwitch,
      }
    : {
        dockerUrl: settings.dockerUrl,
        apiKey: settings.apiKey,
        enableDocker: settings.enableDocker,
      };
  const serialized = JSON.stringify(snapshot);
  const [draft, setDraft] = useState<Partial<AppStore>>(snapshot);
  const [base, setBase] = useState(serialized);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== base;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirtyRef.current) {
      setDraft(JSON.parse(serialized));
      setBase(serialized);
    }
  }, [serialized]);
  function edit(values: Partial<AppStore>) {
    setDraft((current) => ({ ...current, ...values }));
    setError("");
  }
  async function apply() {
    const value = proxy
      ? draft.proxy?.trim() || ""
      : draft.dockerUrl?.trim() || "";
    if (value && !isValidServiceUrl(value, proxy)) {
      setError(t(proxy ? "sProxyInvalid" : "sRemoteInvalid"));
      return;
    }
    if (
      !value &&
      (proxy ? draft.useProxy || draft.downloadProxySwitch : draft.enableDocker)
    ) {
      setError(t(proxy ? "sProxyRequired" : "sRemoteInvalid"));
      return;
    }
    const next = { ...draft, [proxy ? "proxy" : "dockerUrl"]: value };
    setBusy(true);
    try {
      if (await save(next)) {
        setDraft(next);
        setBase(JSON.stringify(next));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div data-testid={`${kind}-draft`}>
      <Row
        title={t(proxy ? "proxySetting" : "dockerUrl")}
        hint={t(proxy ? "sProxyAddressHint" : "sRemoteHint")}
        field={proxy ? "proxy" : "dockerUrl"}
        wide
      >
        <Input
          id={`setting-${proxy ? "proxy" : "dockerUrl"}`}
          value={proxy ? draft.proxy : draft.dockerUrl}
          placeholder={proxy ? "http://127.0.0.1:8000" : "https://example.com"}
          disabled={busy}
          onChange={(event) =>
            edit({ [proxy ? "proxy" : "dockerUrl"]: event.target.value })
          }
          autoComplete="off"
          spellCheck={false}
        />
      </Row>
      {proxy ? (
        <>
          <Row
            title={t("proxySwitch")}
            hint={t("sProxySwitchHint")}
            field="useProxy"
          >
            <Switch
              id="setting-useProxy"
              checked={draft.useProxy}
              disabled={busy}
              onChange={(value) => edit({ useProxy: value })}
            />
          </Row>
          <Row
            title={t("downloadProxySwitch")}
            hint={t("sDownloadProxyHint")}
            field="downloadProxySwitch"
          >
            <Switch
              id="setting-downloadProxySwitch"
              checked={draft.downloadProxySwitch}
              disabled={busy}
              onChange={(value) => edit({ downloadProxySwitch: value })}
            />
          </Row>
          <p className="s-note">{t("sProxyScope")}</p>
        </>
      ) : (
        <>
          <Row title={t("apiKey")} field="apiKey" wide>
            <Input.Password
              id="setting-apiKey"
              value={draft.apiKey}
              disabled={busy}
              onChange={(event) => edit({ apiKey: event.target.value })}
              autoComplete="off"
            />
          </Row>
          <Row title={t("enableDocker")} field="enableDocker">
            <Switch
              id="setting-enableDocker"
              checked={draft.enableDocker}
              disabled={busy}
              onChange={(value) => edit({ enableDocker: value })}
            />
          </Row>
        </>
      )}
      <div className="s-draft-footer">
        <span role="status" className={error ? "s-error" : ""}>
          {error || (dirty ? t("sUnsaved") : t("sSaved"))}
        </span>
        <Button
          disabled={!dirty || busy}
          onClick={() => {
            setDraft(JSON.parse(serialized));
            setBase(serialized);
            setError("");
          }}
        >
          {t("sResetDraft")}
        </Button>
        <Button
          type="primary"
          loading={busy}
          disabled={!dirty}
          onClick={() => void apply()}
        >
          {t("sApply")}
        </Button>
      </div>
    </div>
  );
}

export default function SettingPage() {
  const { t } = useTranslation();
  const settings = useAppStore(useShallow(appStoreSelector));
  const setAppStore = useAppStore((state) => state.setAppStore);
  const { dialog, shell, browser, app } = usePlatform();
  const { envPath } = useEnvPath();
  const { message, modal } = App.useApp();
  const [group, setGroup] = useState<Group>("general");
  const [saving, setSaving] = useState(false);
  const [importingData, setImportingData] = useState(false);
  const savingRef = useRef(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">(
    "saved",
  );
  const [localDraft, setLocalDraft] = useState(settings.local);
  const [maxDraft, setMaxDraft] = useState<number | null>(settings.maxRunner);
  useEffect(() => setLocalDraft(settings.local), [settings.local]);
  useEffect(() => setMaxDraft(settings.maxRunner), [settings.maxRunner]);

  async function save(values: Partial<AppStore>) {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveState("saving");
    try {
      const entries = Object.entries(values);
      if (entries.length === 1)
        await setConfigValue(entries[0][0], entries[0][1]);
      else await http.post("/api/config", values);
      setAppStore(values);
      setSaveState("saved");
      return true;
    } catch (reason) {
      setSaveState("failed");
      message.error(
        reason instanceof Error ? reason.message : t("sSaveFailed"),
      );
      // A combination may partially persist on an IO failure; reconcile with the core.
      try {
        setAppStore(await getConfig());
      } catch {
        /* The error state remains visible until a successful retry. */
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function action(run: () => Promise<unknown>, success?: string) {
    try {
      await run();
      if (success) message.success(success);
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("sSaveFailed"),
      );
    }
  }
  async function copy(value: string) {
    await action(() => navigator.clipboard.writeText(value), t("sCopied"));
  }
  async function importLegacyData() {
    if (isWeb || importingData) return;
    let paths: string[];
    try {
      paths = await dialog.open({ type: "directory" });
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("sSaveFailed"),
      );
      return;
    }
    const dataRoot = paths[0];
    if (!dataRoot) return;
    setImportingData(true);
    modal.confirm({
      title: t("sImportLegacyDataConfirmTitle"),
      content: t("sImportLegacyDataConfirm"),
      okText: t("sImportLegacyDataContinue"),
      cancelText: t("cancel"),
      onCancel: () => setImportingData(false),
      onOk: async () => {
        try {
          const result = await app.importLegacyData(dataRoot);
          message.success(
            t("sImportLegacyDataSuccess", {
              backup: result.backupPath || t("sNoBackupNeeded"),
            }),
          );
        } catch (reason) {
          message.error(
            reason instanceof Error
              ? reason.message
              : t("sImportLegacyDataFailed"),
          );
        } finally {
          setImportingData(false);
        }
      },
    });
  }
  async function exportDiagnostics() {
    await action(async () => {
      const [buildInfo, tasks] = await Promise.all([
        app.getBuildInfo(),
        getDownloadTasks({ current: 1, pageSize: 8 }),
      ]);
      const recentTasks = await Promise.all(
        tasks.list.map(async (task) => {
          if (task.status !== "failed") {
            return { type: task.type, status: task.status };
          }
          try {
            const log = await getDownloadLog(task.id);
            const details = diagnosticErrorDetails(log.log);
            return {
              type: task.type,
              status: task.status,
              errorCategory: details.category,
              errorSummary: details.summary || diagnosticErrorSummary(log.log),
            };
          } catch {
            return {
              type: task.type,
              status: task.status,
              errorCategory: "software-failure",
              errorSummary: "Failed task log unavailable",
            };
          }
        }),
      );
      const report = createDiagnosticReport({
        ...buildInfo,
        preferences: {
          language: settings.language,
          theme: settings.theme,
          maxRunner: settings.maxRunner,
          apiKey: settings.apiKey,
          proxy: settings.proxy,
        },
        recentTasks,
      });
      const savedPath = await dialog.save({
        content: JSON.stringify(report, null, 2),
        defaultPath: `nyacatch-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (savedPath) message.success(t("sExportDiagnosticsSuccess"));
    });
  }
  async function open(path?: string) {
    if (path) await action(() => shell.open(path));
    else message.info(t("sNoDirectory"));
  }
  async function chooseFolder() {
    await action(async () => {
      const paths = await dialog.open({ type: "directory" });
      if (paths?.[0]) await save({ local: paths[0] });
    });
  }
  async function exportData() {
    await action(async () => {
      const data = await exportFavorites();
      await dialog.save({
        content:
          typeof data === "string" ? data : JSON.stringify(data, null, 2),
        defaultPath: "favorites.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
    }, t("exportFavoriteSuccess"));
  }
  async function importData() {
    await action(async () => {
      const data = await dialog.open({
        type: "file",
        filters: [{ name: "JSON", extensions: ["json"] }],
        readContent: true,
      });
      if (!data?.length) return;
      const list: unknown = JSON.parse(data[0]);
      if (!Array.isArray(list)) throw new Error(t("sImportInvalid"));
      await importFavorites(list);
      message.success(t("importFavoriteSuccess"));
    });
  }
  function toggle(
    key: BooleanKey,
    title: string,
    hint?: string,
    disabled = false,
  ) {
    return (
      <Row
        key={key}
        field={key}
        title={t(title)}
        hint={hint ? t(hint) : undefined}
      >
        <Switch
          id={`setting-${key}`}
          checked={settings[key]}
          loading={saving}
          disabled={saving || disabled}
          onChange={(value) => void save({ [key]: value })}
        />
      </Row>
    );
  }
  function panel(id: Group, children: ReactNode) {
    return (
      <div
        className="s-panel"
        id={`settings-panel-${id}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${id}`}
        hidden={group !== id}
        data-testid={`settings-panel-${id}`}
      >
        {children}
      </div>
    );
  }
  const selected = groups.find((item) => item.id === group) ?? groups[0];
  const player = envPath?.playerUrl;
  const coreUrl =
    player?.replace(/\/player\/$/, "") ||
    (isWeb ? window.location.origin : "http://localhost:39719");
  const setupCmd = `Set mediago url to ${coreUrl}${isWeb && settings.apiKey ? `, api key to ${settings.apiKey}` : ""}`;

  return (
    <div className="s-settings v4-settings-page" data-testid="settings-center">
      <header className="wb-page-heading s-page-header">
        <div>
          <h1>{t("sTitle")}</h1>
          <p>{t("sSubtitle")}</p>
        </div>
        {saveState !== "saved" && (
          <span
            className={`s-save-state ${saveState === "failed" ? "s-error" : ""}`}
            role="status"
          >
            {t(saveState === "saving" ? "sSaving" : "sSaveFailed")}
          </span>
        )}
      </header>
      <div className="s-layout">
        <nav className="s-navigation" role="tablist" aria-label={t("sTitle")}>
          {groups.map(({ id, key, icon: Icon }) => (
            <button
              type="button"
              key={id}
              id={`settings-tab-${id}`}
              role="tab"
              aria-selected={group === id}
              aria-controls={`settings-panel-${id}`}
              data-testid={`settings-tab-${id}`}
              onClick={() => setGroup(id)}
            >
              <Icon size={18} />
              <span>{t(key)}</span>
            </button>
          ))}
        </nav>
        <div className="s-content">
          <div className="s-content-heading">
            <h2>{t(selected.key)}</h2>
            <p>{t(`${selected.key}Hint`)}</p>
          </div>
          {panel(
            "general",
            <Section title={t("basicSetting")}>
              <Row
                title={t("displayLanguage")}
                hint={t("sLanguageHint")}
                field="language"
              >
                <Select
                  id="setting-language"
                  data-testid="settings-language"
                  value={settings.language}
                  disabled={saving}
                  options={[
                    { value: AppLanguage.System, label: t("followSystem") },
                    ...LANGUAGE_OPTIONS,
                  ]}
                  onChange={(value) =>
                    void save({ language: value as AppLanguage })
                  }
                />
              </Row>
              {!isWeb && (
                <>
                  <Row
                    title={t("closeMainWindow")}
                    hint={t("sWindowHint")}
                    field="closeMainWindow"
                  >
                    <Radio.Group
                      id="setting-closeMainWindow"
                      value={settings.closeMainWindow}
                      disabled={saving}
                      onChange={(event) =>
                        void save({ closeMainWindow: event.target.value })
                      }
                    >
                      <Radio value={true}>{t("sCloseApp")}</Radio>
                      <Radio value={false}>{t("minimizeToTray")}</Radio>
                    </Radio.Group>
                  </Row>
                  {toggle("promptTone", "downloadPrompt", "sNotifyHint")}
                  {toggle(
                    "enableMobilePlayer",
                    "enableMobilePlayer",
                    "sMobileHint",
                  )}
                  {settings.enableMobilePlayer && (
                    <div className="s-inline-action">
                      <Popover
                        trigger="click"
                        content={
                          player ? (
                            <>
                              <QRCode value={player} />
                              <p>{t("scanToWatch")}</p>
                            </>
                          ) : (
                            t("sNoPlayer")
                          )
                        }
                      >
                        <Button icon={<Globe2 size={16} />}>
                          {t("playOnMobile")}
                        </Button>
                      </Popover>
                      <Button
                        onClick={() =>
                          player
                            ? void open(player)
                            : message.info(t("sNoPlayer"))
                        }
                      >
                        {t("sOpenPlayer")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Section>,
          )}
          {panel(
            "download",
            <Section title={t("downloadSetting")}>
              <Row
                field="local"
                title={t("localDir")}
                hint={t("sFolderHint")}
                wide
              >
                <div className="s-path-control">
                  {isWeb ? (
                    <Input
                      id="setting-local"
                      value={localDraft}
                      onChange={(event) => setLocalDraft(event.target.value)}
                      onBlur={() => {
                        if (localDraft.trim() && localDraft !== settings.local)
                          void save({ local: localDraft.trim() });
                      }}
                    />
                  ) : (
                    <code id="setting-local" title={settings.local}>
                      {settings.local || "—"}
                    </code>
                  )}
                  <div>
                    <Button
                      disabled={saving || isWeb}
                      onClick={() => void chooseFolder()}
                    >
                      {t("v4Change")}
                    </Button>
                    <Button
                      aria-label={t("copy")}
                      icon={<Copy size={16} />}
                      onClick={() => void copy(settings.local)}
                    />
                    <Button
                      aria-label={t("openFolder")}
                      icon={<FolderOpen size={16} />}
                      onClick={() => void open(settings.local)}
                    />
                  </div>
                </div>
              </Row>
              <Row
                field="maxRunner"
                title={t("maxRunner")}
                hint={t("sConcurrencyHint")}
              >
                <InputNumber
                  id="setting-maxRunner"
                  min={1}
                  max={50}
                  precision={0}
                  value={maxDraft}
                  disabled={saving}
                  changeOnBlur
                  onChange={setMaxDraft}
                  onBlur={() => {
                    if (
                      typeof maxDraft === "number" &&
                      Number.isInteger(maxDraft) &&
                      maxDraft >= 1 &&
                      maxDraft <= 50 &&
                      maxDraft !== settings.maxRunner
                    )
                      void save({ maxRunner: maxDraft });
                    else if (maxDraft === null) setMaxDraft(settings.maxRunner);
                  }}
                />
              </Row>
              {toggle("showTerminal", "showTerminal", "sLogsHint")}
              {toggle("deleteSegments", "deleteSegments", "sSegmentsHint")}
            </Section>,
          )}
          {panel(
            "appearance",
            <>
              <Section title={t("sDisplayMode")}>
                <Row
                  field="theme"
                  title={t("downloaderTheme")}
                  hint={t("sDisplayModeHint")}
                >
                  <Radio.Group
                    id="setting-theme"
                    optionType="button"
                    buttonStyle="solid"
                    value={settings.theme}
                    disabled={saving}
                    onChange={(event) =>
                      void save({ theme: event.target.value })
                    }
                    options={[
                      { value: AppTheme.Light, label: t("light") },
                      { value: AppTheme.Dark, label: t("dark") },
                      { value: AppTheme.System, label: t("followSystem") },
                    ]}
                  />
                </Row>
              </Section>
              <Section
                title={t("sThemeCollection")}
                hint={t("sThemeCollectionHint")}
              >
                <AppearancePanel />
              </Section>
              <Section
                title={t("backgroundTitle")}
                hint={t("backgroundDescription")}
              >
                <BackgroundPanel />
              </Section>
            </>,
          )}
          {panel(
            "network",
            <Section title={t("proxySetting")} hint={t("sProxyHint")}>
              <DraftSettings kind="proxy" settings={settings} save={save} />
            </Section>,
          )}
          {panel(
            "advanced",
            <>
              {!isWeb && (
                <Section title={t("sBrowser")} hint={t("sBrowserHint")}>
                  {toggle("audioMuted", "audioMuted")}
                  {toggle("openInNewWindow", "openInNewWindow")}
                  {toggle("blockAds", "blockAds")}
                  {toggle("isMobile", "enterMobileMode")}
                  {toggle(
                    "useExtension",
                    "useImmersiveSniffing",
                    "immersiveSniffingDescription",
                  )}
                  {toggle("privacy", "privacy", "privacyTooltip")}
                </Section>
              )}
              {!isWeb && (
                <Section title={t("sBrowserData")} hint={t("sBrowserDataHint")}>
                  <div className="s-actions">
                    <Button
                      icon={<Trash2 size={16} />}
                      onClick={() =>
                        void action(
                          () => browser.clearCache(),
                          t("clearCacheSuccess"),
                        )
                      }
                    >
                      {t("clearCache")}
                    </Button>
                    <Button
                      icon={<Download size={16} />}
                      onClick={() => void exportData()}
                    >
                      {t("exportFavorite")}
                    </Button>
                    <Button
                      icon={<Upload size={16} />}
                      onClick={() => void importData()}
                    >
                      {t("importFavorite")}
                    </Button>
                  </div>
                </Section>
              )}
              {!isWeb && (
                <Section title={t("sRemote")} hint={t("sRemoteHint")}>
                  <DraftSettings
                    kind="remote"
                    settings={settings}
                    save={save}
                  />
                </Section>
              )}
              <Section title={t("sSkills")} hint={t("sSkillsHint")}>
                <Row title={t("skillsInstall")} wide>
                  <div className="s-command">
                    <code>{t("skillsInstallCmd")}</code>
                    <Button
                      icon={<Copy size={16} />}
                      onClick={() => void copy(t("skillsInstallCmd"))}
                    >
                      {t("copy")}
                    </Button>
                  </div>
                </Row>
                <Row title={t("skillsInit")} wide>
                  <div className="s-command">
                    <code>{setupCmd}</code>
                    <Button
                      icon={<Copy size={16} />}
                      onClick={() => void copy(setupCmd)}
                    >
                      {t("copy")}
                    </Button>
                  </div>
                </Row>
                {isWeb && (
                  <Row title={t("apiKey")} field="apiKey">
                    <Input.Password value={settings.apiKey} readOnly />
                  </Row>
                )}
              </Section>
              {!isWeb && (
                <Section title={t("sDirectories")} hint={t("sDirectoriesHint")}>
                  <div className="s-actions">
                    <Button
                      icon={<FolderOpen size={16} />}
                      onClick={() => void open(envPath?.configDir)}
                    >
                      {t("configDir")}
                    </Button>
                    <Button
                      icon={<FolderOpen size={16} />}
                      onClick={() => void open(envPath?.binDir)}
                    >
                      {t("binPath")}
                    </Button>
                    <Button
                      icon={<FolderOpen size={16} />}
                      onClick={() => void open(settings.local)}
                    >
                      {t("localDir")}
                    </Button>
                    <Button
                      icon={<FolderOpen size={16} />}
                      onClick={() =>
                        void action(async () => {
                          await open(await app.getExtensionDir());
                        })
                      }
                    >
                      {t("extensionDir")}
                    </Button>
                    <Button
                      icon={<FolderInput size={16} />}
                      loading={importingData}
                      onClick={() => void importLegacyData()}
                    >
                      {t("sImportLegacyData")}
                    </Button>
                    <Button
                      icon={<Download size={16} />}
                      onClick={() => void exportDiagnostics()}
                    >
                      {t("sExportDiagnostics")}
                    </Button>
                  </div>
                  <p className="s-note">{t("sImportLegacyDataHint")}</p>
                </Section>
              )}
            </>,
          )}
          {panel(
            "about",
            <>
              <section className="s-brand-card">
                <img src={brandIcon} alt="" width={64} height={64} />
                <div>
                  <h3>{t("wbBrand")}</h3>
                  <p>{t("sPreviewVersion")}</p>
                  <span>
                    {t("sUpstreamVersion")} {import.meta.env.APP_VERSION}
                  </span>
                </div>
              </section>
              <Section title={t("sUpdates")} hint={t("sUpdatesHint")}>
                <Row title={t("currentVersion")}>
                  <span>{APP_BUILD_VERSION}</span>
                  <Button onClick={() => message.info(t("wbManualUpdate"))}>
                    {t("checkUpdate")}
                  </Button>
                </Row>
                {!isWeb && (
                  <>
                    {toggle("autoUpgrade", "autoUpgrade", "sUpdatesHint", true)}
                    {toggle("allowBeta", "allowBetaVersion", undefined, true)}
                  </>
                )}
              </Section>
              <Section title={t("sCredits")} hint={t("sCreditsHint")}>
                <div className="s-actions">
                  <Button
                    icon={<Globe2 size={16} />}
                    onClick={() =>
                      void open("https://github.com/mediago-dev/mediago")
                    }
                  >
                    {t("sOpenSource")}
                  </Button>
                </div>
              </Section>
            </>,
          )}
        </div>
      </div>
    </div>
  );
}
