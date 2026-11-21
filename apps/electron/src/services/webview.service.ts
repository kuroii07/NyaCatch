import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { ElectronBlocker } from "@ghostery/adblocker-electron";
import { provide } from "@inversifyjs/binding-decorators";
import { i18n } from "../core/i18n";
import {
  type Event,
  type HandlerDetails,
  session,
  WebContentsView,
} from "electron";
import isDev from "electron-is-dev";
import { inject, injectable } from "inversify";
import {
  mobileUA,
  PERSIST_WEBVIEW,
  PRIVACY_WEBVIEW,
  pluginUrl,
} from "../utils";
import ElectronLogger from "../vendor/ElectronLogger";
import GoConfigCache from "./go-config-cache";
import BrowserWindow from "../windows/browser.window";
import MainWindow from "../windows/main.window";
import { SniffingHelper, type SourceParams } from "./sniffing-helper.service";
import { applyBrowserProxy, browserProxyConfig } from "./browser-proxy";
import {
  preventExternalWebviewNavigation,
  webviewNavigationAllowed,
} from "./webview-navigation";
import { desktopBrowserUserAgent } from "./browser-user-agent";

const require = createRequire(import.meta.url);

const preload = require.resolve("@mediago/electron-preload");

@injectable()
@provide()
export default class WebviewService {
  private view: WebContentsView | null = null;
  private blocker?: ElectronBlocker;
  private defaultSession = PERSIST_WEBVIEW;
  private viewShow = false;
  private proxyReady: Promise<void> = Promise.resolve();

  constructor(
    @inject(MainWindow)
    private readonly mainWindow: MainWindow,
    @inject(ElectronLogger)
    private readonly logger: ElectronLogger,
    @inject(BrowserWindow)
    private readonly browserWindow: BrowserWindow,
    @inject(GoConfigCache)
    private readonly configCache: GoConfigCache,
    @inject(SniffingHelper)
    private readonly sniffingHelper: SniffingHelper,
  ) {
    // Initialize the blocker
    this.initBlocker();

    this.sniffingHelper.on("source", this.onSource);
  }

  async init(): Promise<void> {
    if (this.view) return;

    this.view = new WebContentsView({
      webPreferences: {
        partition: this.defaultSession,
        preload: preload,
      },
    });

    if (isDev) {
      this.view.webContents.openDevTools();
    }

    this.view.setBackgroundColor("#fff");
    const { isMobile, audioMuted } = this.configCache.store;
    this.setAudioMuted(audioMuted);
    this.setUserAgent(isMobile);

    this.view.webContents.on("dom-ready", this.onDomReady);
    this.view.webContents.on("did-navigate", this.onDidNavigate);
    this.view.webContents.on("did-fail-load", this.onDidFailLoad);
    this.view.webContents.on("did-navigate-in-page", this.onDidNavigateInPage);
    this.view.webContents.on("page-title-updated", this.onPageTitleUpdated);
    this.view.webContents.on("will-navigate", this.onWillNavigate);
    this.view.webContents.on("will-frame-navigate", this.onWillNavigate);
    this.view.webContents.on("will-redirect", this.onWillNavigate);
    this.view.webContents.setWindowOpenHandler(this.onOpenNewWindow);
  }

  onWillNavigate = preventExternalWebviewNavigation;

  onDomReady = () => {
    if (!this.view) return;
    const pageInfo = this.getPageInfo();
    this.sniffingHelper.update(pageInfo);
    this.window?.webContents.send("browser:domReady", pageInfo);
  };

  onDidNavigate = async () => {
    if (!this.view) return;
    const pageInfo = this.getPageInfo();
    this.sniffingHelper.update(pageInfo);
    this.window?.webContents.send("browser:didNavigate", pageInfo);

    try {
      const content = await readFile(pluginUrl, "utf-8");
      await this.view.webContents.executeJavaScript(content);
    } catch {
      // empty
    }

    this.sniffingHelper.checkPageInfo();
  };

  onDidFailLoad = (
    e: Event,
    code: number,
    desc: string,
    _url: string,
    isMainFrame: boolean,
  ) => {
    // Subframe failures and intentionally cancelled navigation are not page failures.
    if (!isMainFrame || code === -3) return;
    this.window?.webContents.send("browser:failLoad", { code, desc });
    this.logger.error(`[Webview] fail load: ${code} ${desc}`);
  };

  onDidNavigateInPage = () => {
    if (!this.view) return;
    const pageInfo = this.getPageInfo();
    this.sniffingHelper.update(pageInfo);
    this.sniffingHelper.checkPageInfo();
    this.window?.webContents.send("browser:didNavigateInPage", pageInfo);
  };

  onPageTitleUpdated = () => {
    if (!this.view) return;
    const pageInfo = this.getPageInfo();
    this.sniffingHelper.update(pageInfo);
  };

  onOpenNewWindow = ({ url }: HandlerDetails) => {
    if (!webviewNavigationAllowed(url)) return { action: "deny" } as const;
    void this.loadURL(url).catch((error: unknown) => {
      this.logger.warn("[Webview] New-window navigation failed", error);
    });

    return { action: "deny" } as { action: "deny" };
  };

  onSource = async (item: SourceParams) => {
    if (!this.view) return;
    // Send to the window for processing
    // Previously addDownloadTask was called here; now handled by Go server
    this.window?.webContents.send("browser:sourceDetected", item);
  };

  getPageInfo() {
    if (!this.view) {
      throw new Error(i18n.t("browserViewNotFound"));
    }
    return {
      title: this.view.webContents.getTitle(),
      url: this.view.webContents.getURL(),
    };
  }

  getBounds(): Electron.Rectangle {
    if (!this.view) {
      throw new Error(i18n.t("browserViewNotFound"));
    }
    return this.view.getBounds();
  }

  setBounds(bounds: Electron.Rectangle): void {
    if (!this.view) return;
    this.view.setBounds(bounds);
  }

  setBackgroundColor(color: string): void {
    if (!this.view) return;
    this.view.setBackgroundColor(color);
  }

  show() {
    if (!this.view) return;
    this.window?.contentView.addChildView(this.view);
    this.viewShow = true;
  }

  hide() {
    if (!this.view) return;
    this.window?.contentView.removeChildView(this.view);
    this.viewShow = false;
  }

  async loadURL(url: string) {
    // loadURL does not fire will-navigate. Validate before stopping the current
    // page, including popup URLs forwarded into the existing view.
    if (!webviewNavigationAllowed(url))
      throw Error("External application navigation is blocked");
    // Start loading url
    await this.init();
    await this.waitForProxy();
    if (!this.view) return;

    // 1. Stop current navigation
    this.view.webContents.stop();

    // 2. Load a new url
    try {
      await this.view.webContents.loadURL(url);
    } catch (error) {
      // A newer navigation intentionally aborts the previous load.
      if ((error as { code?: string }).code !== "ERR_ABORTED") throw error;
    }
  }

  async goBack() {
    if (!this.view) {
      throw new Error(i18n.t("browserViewNotFound"));
    }
    const { webContents } = this.view;
    if (webContents.navigationHistory.canGoBack()) {
      webContents.navigationHistory.goBack();
      return true;
    } else {
      this.destroyView();
      return false;
    }
  }

  async reload() {
    await this.waitForProxy();
    if (!this.view) {
      throw new Error(i18n.t("browserViewNotFound"));
    }
    this.view.webContents.reload();
  }

  async goHome() {
    if (!this.view) {
      throw new Error(i18n.t("browserViewNotFound"));
    }
    this.view.webContents.stop();
    this.view.webContents.clearHistory();
    this.destroyView();
  }

  get window() {
    if (this.browserWindow.window) return this.browserWindow.window;
    if (this.mainWindow.window) return this.mainWindow.window;

    this.logger.error("Current window not found");
    return null;
  }

  private get session() {
    return session.fromPartition(this.defaultSession);
  }

  private async waitForProxy(): Promise<void> {
    let pending: Promise<void>;
    do {
      pending = this.proxyReady;
      await pending;
    } while (pending !== this.proxyReady);
  }

  setProxy(useProxy: boolean, proxy: string): Promise<void> {
    const target = this.session;
    const update = this.proxyReady
      .catch(() => {
        // Each caller receives its own error; a later valid setting can recover.
      })
      .then(async () => {
        await applyBrowserProxy(target, browserProxyConfig(useProxy, proxy));
        this.logger.info(
          `[Proxy] browser session: ${useProxy ? "custom" : "system"}`,
        );
      });
    this.proxyReady = update;
    return update;
  }

  setBlocking(enableBlocking: boolean): void {
    if (enableBlocking) {
      this.enableBlocking();
    } else {
      this.disableBlocking();
    }
  }

  async initBlocker() {
    try {
      this.blocker = await ElectronBlocker.fromLists(fetch, [
        "https://easylist.to/easylist/easylist.txt",
      ]);
    } catch (error) {
      // Optional browser filters must not create an unhandled rejection on startup.
      this.logger.warn(
        "[AdBlocker] Could not load browser filter rules; filtering is unavailable:",
        error,
      );
      return;
    }

    const enableBlocking = this.configCache.get("blockAds");
    this.setBlocking(enableBlocking);
  }

  private enableBlocking() {
    if (!this.blocker) {
      this.logger.error(`[AdBlocker] enable failed(not initialized)`);
      return;
    }
    if (this.blocker.isBlockingEnabled(this.session)) {
      return;
    }
    this.blocker.enableBlockingInSession(this.session);
    this.logger.info(`[AdBlocker] enable`);
  }

  private disableBlocking() {
    if (!this.blocker) {
      this.logger.error(`[AdBlocker] disable failed(not initialized)`);
      return;
    }
    if (!this.blocker.isBlockingEnabled(this.session)) {
      return;
    }
    this.blocker.disableBlockingInSession(this.session);
    this.logger.info(`[AdBlocker] disable`);
  }

  setAudioMuted(audioMuted?: boolean) {
    if (!this.view) return;
    this.view.webContents.setAudioMuted(audioMuted ? true : false);
    this.logger.info(`Play audio: ${!audioMuted}`);
  }

  setUserAgent(isMobile?: boolean) {
    if (!this.view) return;
    if (isMobile) {
      this.view.webContents.setUserAgent(mobileUA);
    } else {
      this.view.webContents.setUserAgent(
        desktopBrowserUserAgent(
          this.view.webContents.session.getUserAgent(),
          process.versions.chrome,
        ),
      );
    }
    this.logger.info(`[UA] User-Agent: ${isMobile ? "mobile" : "PC"}`);
  }

  async captureView(): Promise<Electron.NativeImage | null> {
    if (!this.view) {
      throw new Error(i18n.t("browserViewNotFound"));
    }
    if (!this.viewShow) {
      return null;
    }
    return this.view.webContents.capturePage();
  }

  sendToWindow(channel: string, ...args: unknown[]) {
    this.window?.webContents.send(channel, ...args);
  }

  private removeViewListeners() {
    if (!this.view) return;
    const { webContents } = this.view;
    webContents.removeListener("dom-ready", this.onDomReady);
    webContents.removeListener("did-navigate", this.onDidNavigate);
    webContents.removeListener("did-fail-load", this.onDidFailLoad);
    webContents.removeListener(
      "did-navigate-in-page",
      this.onDidNavigateInPage,
    );
    webContents.removeListener("page-title-updated", this.onPageTitleUpdated);
    webContents.removeListener("will-navigate", this.onWillNavigate);
    webContents.removeListener("will-frame-navigate", this.onWillNavigate);
    webContents.removeListener("will-redirect", this.onWillNavigate);
  }

  destroyView() {
    if (this.view) {
      this.removeViewListeners();
      this.view.webContents.close();
      this.window?.contentView.removeChildView(this.view);
    }
    this.view = null;
  }

  private websiteSessions() {
    return [PERSIST_WEBVIEW, PRIVACY_WEBVIEW].map((partition) =>
      session.fromPartition(partition),
    );
  }

  async cacheInfo() {
    const sizes = await Promise.all(
      this.websiteSessions().map((profile) => profile.getCacheSize()),
    );
    return { bytes: sizes.reduce((sum, size) => sum + size, 0) };
  }

  async clearCache() {
    await Promise.all(
      this.websiteSessions().map((profile) => profile.clearCache()),
    );
  }

  async clearWebsiteData() {
    await Promise.all(
      this.websiteSessions().map((profile) => profile.clearStorageData()),
    );
  }

  async restoreConfig(): Promise<void> {
    await this.setDefaultSession(this.configCache.get("privacy"), true);
  }

  async setDefaultSession(isPrivacy = false, init = false) {
    const hadView = !!this.view;
    if (hadView) this.destroyView();
    this.logger.info(`[Session] ${isPrivacy ? "Privacy" : "Persist"} Mode`);
    if (isPrivacy) {
      this.defaultSession = PRIVACY_WEBVIEW;
    } else {
      this.defaultSession = PERSIST_WEBVIEW;
    }

    this.sniffingHelper.start(isPrivacy);
    const { useProxy, proxy } = this.configCache.store;
    await this.setProxy(useProxy, proxy);
    if (hadView) await this.init();

    if (!init) {
      this.window?.webContents.send("browser:privacyChanged");
    }
  }
}
