import { resolve } from "node:path";
import { provide } from "@inversifyjs/binding-decorators";
import { i18n } from "./core/i18n";
import { DownloaderServer } from "./services/downloader.server";
import {
  app,
  BrowserWindow,
  type Event,
  Menu,
  nativeImage,
  nativeTheme,
  Tray,
} from "electron";
import { inject, injectable } from "inversify";
import TrayIcon from "../assets/icon.ico";
import TrayPng from "../assets/icon.png";
import ProtocolService from "./core/protocol";
import ElectronRouter from "./core/router";
import { db, defaultScheme, isMac, logDir } from "./constants";
import ElectronDevtools from "./vendor/ElectronDevtools";
import ElectronUpdater from "./vendor/ElectronUpdater";
import GoConfigCache from "./services/go-config-cache";
import OverlayDialogService from "./services/overlay-dialog.service";
import WebviewService from "./services/webview.service";
import BrowserWindowService from "./windows/browser.window";
import MainWindow from "./windows/main.window";
import "./controller";
import ElectronLogger from "./vendor/ElectronLogger";
import {
  APP_DISPLAY_NAME,
  AppTheme,
  resolveAppLanguage,
} from "@mediago/shared-common";

@injectable()
@provide()
export default class ElectronApp {
  private tray?: Tray;
  private stopping = false;
  private stopped = false;

  constructor(
    @inject(MainWindow)
    private readonly mainWindow: MainWindow,
    @inject(ProtocolService)
    private readonly protocol: ProtocolService,
    @inject(ElectronUpdater)
    private readonly updater: ElectronUpdater,
    @inject(ElectronRouter)
    private readonly router: ElectronRouter,
    @inject(ElectronDevtools)
    private readonly devTools: ElectronDevtools,
    @inject(DownloaderServer)
    private readonly downloaderServer: DownloaderServer,
    @inject(WebviewService)
    private readonly webviewService: WebviewService,
    @inject(OverlayDialogService)
    private readonly overlayDialogService: OverlayDialogService,
    @inject(GoConfigCache)
    private readonly configCache: GoConfigCache,
    @inject(BrowserWindowService)
    private readonly browserWindow: BrowserWindowService,
    @inject(ElectronLogger)
    private readonly logger: ElectronLogger,
  ) {}

  private async serviceInit(): Promise<void> {
    this.mainWindow.init();
    this.overlayDialogService.init();
  }

  private async vendorInit() {
    this.updater.init();
    this.devTools.init();
  }

  async init(): Promise<void> {
    app.on("before-quit", (event) => {
      if (this.stopped) return;
      event.preventDefault();
      if (this.stopping) return;
      this.stopping = true;
      void this.downloaderServer.stop().then(
        () => {
          this.stopped = true;
          app.quit();
        },
        (error: unknown) => {
          this.logger.error("Failed to stop the download service", error);
          this.stopping = false;
        },
      );
    });
    this.protocol.create();
    this.router.init();

    // 1. Show the window immediately — must happen regardless of backend status
    await this.vendorInit();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.mainWindow.init();
      }
    });

    this.initTray();

    // 2. Start Go download service in the background; errors are non-fatal
    try {
      await this.downloaderServer.start({
        logDir: logDir,
        dbPath: db,
      });

      // 3. Read config from Go (single source of truth) and seed cache
      const client = this.downloaderServer.getClient();
      const { data: config } = await client.getConfig();
      this.configCache.seed(config as any);

      // 4. Apply initial config
      nativeTheme.themeSource = (config.theme || "system") as AppTheme;
      i18n.changeLanguage(resolveAppLanguage(config.language, app.getLocale()));
    } catch (err) {
      this.logger.error("[ElectronApp] Failed to start Go core service:", err);
    }

    // Browser sessions are configured only after persisted Go settings are loaded.
    await this.webviewService.restoreConfig().catch((error: unknown) => {
      this.logger.error("[Webview] Could not restore browser settings", error);
    });

    // 5. Listen for Go config changes → update cache + platform side effects + IPC to UI
    this.downloaderServer.on(
      "config-changed",
      (key: string, value: unknown) => {
        this.configCache.update(key, value);

        // Forward to UI windows
        this.mainWindow.send("config:changed", { key, value });
        this.browserWindow.send("config:changed", { key, value });

        // Platform side effects
        const handlers: Record<string, (v: any) => void | Promise<void>> = {
          theme: (v) => {
            nativeTheme.themeSource = v;
          },
          useProxy: (v) => {
            return this.webviewService.setProxy(
              v,
              this.configCache.get("proxy"),
            );
          },
          proxy: (v) => {
            return this.webviewService.setProxy(
              this.configCache.get("useProxy"),
              v,
            );
          },
          blockAds: (v) => {
            this.webviewService.setBlocking(v);
          },
          isMobile: (v) => {
            this.webviewService.setUserAgent(v);
          },
          privacy: (v) => {
            return this.webviewService.setDefaultSession(v);
          },
          language: (v) => {
            i18n.changeLanguage(
              resolveAppLanguage(v as string, app.getLocale()),
            );
          },
          allowBeta: (v) => {
            this.updater.changeAllowBeta(v);
          },
          audioMuted: (v) => {
            this.webviewService.setAudioMuted(v);
          },
        };
        Promise.resolve(handlers[key]?.(value)).catch((error: unknown) => {
          this.logger.error(`[Config] Could not apply ${key}`, error);
        });
      },
    );

    await this.serviceInit();
  }

  initTray() {
    let trayIcon = nativeImage.createFromPath(resolve(__dirname, TrayIcon));
    if (isMac) {
      trayIcon = nativeImage
        .createFromPath(resolve(__dirname, TrayPng))
        .resize({ width: 18, height: 18 });
    }

    const tray = new Tray(trayIcon);
    tray.setToolTip(APP_DISPLAY_NAME);
    tray.addListener("click", () => {
      this.mainWindow.init();
    });
    this.tray = tray;
    this.refreshTrayMenu();

    // Rebuild the tray menu whenever the app language changes so the
    // labels stay in sync with user settings and the OS locale.
    i18n.on("languageChanged", () => this.refreshTrayMenu());
  }

  private refreshTrayMenu() {
    if (!this.tray) return;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: i18n.t("showMainWindow"),
        click: () => this.mainWindow.init(),
      },
      {
        label: i18n.t("exitApp"),
        role: "quit",
      },
    ]);
    this.tray.setContextMenu(contextMenu);
  }

  secondInstance = (event: Event, commandLine: string[]) => {
    // A normal relaunch includes a script/executable path, not a page to load.
    const url = commandLine.find((argument) => {
      try {
        const candidate = new URL(argument);
        return candidate.protocol === `${defaultScheme}:` && !!candidate.host;
      } catch {
        return false;
      }
    });
    this.mainWindow.showWindow(url);
  };
}
