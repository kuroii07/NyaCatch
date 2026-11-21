import { provide } from "@inversifyjs/binding-decorators";
import { type Controller, EnvPath, IPC } from "@mediago/shared-common";
import { handle } from "../core/decorators";
import { DownloaderServer } from "../services/downloader.server";
import { TYPES } from "../types/symbols";
import { app, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { inject, injectable } from "inversify";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { appName, exePath, workspace } from "../utils";
import { resolveExtensionDir } from "../utils/binaryResolver";
import { db, logDir } from "../constants";
import ElectronUpdater from "../vendor/ElectronUpdater";
import BrowserWindow from "../windows/browser.window";
import MainWindow from "../windows/main.window";
import {
  migrateLegacyWorkspace,
  MigrationError,
  validateLegacyWorkspace,
  type MigrationResult,
} from "../services/data-migration";
import { resolveCoreBinaries } from "../utils/binaryResolver";
import { APP_BUILD_VERSION, type AppBuildInfo } from "@mediago/shared-common";
import SidebarTooltipService from "../services/sidebar-tooltip.service";
import { isInstalledBuild, isLocalBeta } from "../runtime-paths";

@injectable()
@provide(TYPES.Controller)
export default class HomeController implements Controller {
  private sharedState: Record<string, unknown> = {};

  constructor(
    @inject(MainWindow)
    private readonly mainWindow: MainWindow,
    @inject(BrowserWindow)
    private readonly browserWindow: BrowserWindow,
    @inject(ElectronUpdater)
    private readonly updater: ElectronUpdater,
    @inject(DownloaderServer)
    private readonly downloaderServer: DownloaderServer,
    @inject(SidebarTooltipService)
    private readonly sidebarTooltip: SidebarTooltipService,
  ) {}

  @handle(IPC.app.setSidebarTooltip)
  async setSidebarTooltip(
    event: IpcMainInvokeEvent,
    value: unknown,
  ): Promise<void> {
    const owner = this.mainWindow.window?.webContents;
    if (
      !owner ||
      owner.isDestroyed() ||
      event.sender !== owner ||
      event.senderFrame !== owner.mainFrame
    ) {
      throw new Error(
        "Only the main application frame may update sidebar tooltips",
      );
    }
    await this.sidebarTooltip.update(value);
  }

  @handle(IPC.app.getEnvPath)
  async getEnvPath(): Promise<EnvPath> {
    const client = this.downloaderServer.getClient();
    const { data: config } = await client.getConfig();
    const coreUrl = (await this.downloaderServer.getURL()) ?? "";
    return {
      binPath: exePath,
      dbPath: "",
      workspace: workspace,
      platform: process.platform,
      local: config.local,
      playerUrl: coreUrl ? `${coreUrl}/player/` : "",
      coreUrl,
    };
  }

  @handle(IPC.app.getBuildInfo)
  async getBuildInfo(): Promise<AppBuildInfo> {
    let tools: Record<string, string> = {};
    if (app.isPackaged) {
      try {
        const manifest = JSON.parse(
          await readFile(
            path.join(process.resourcesPath, "nyacatch-beta.json"),
            "utf8",
          ),
        ) as { bundledTools?: Record<string, string> };
        tools = manifest.bundledTools || {};
      } catch {
        tools = {};
      }
    }
    return {
      productVersion: APP_BUILD_VERSION,
      distribution: isLocalBeta
        ? "development"
        : isInstalledBuild
          ? "installed"
          : "portable",
      upstreamVersion: process.env.APP_VERSION || "unknown",
      electronVersion: process.versions.electron || "unknown",
      nodeVersion: process.versions.node || "unknown",
      osVersion: `${process.platform} ${process.getSystemVersion() || "unknown"}`,
      platform: process.platform,
      arch: process.arch,
      tools,
    };
  }

  /**
   * Path to the bundled MediaGo browser-extension directory.
   *
   * The UI pairs this with the generic `shell.open()` IPC — no
   * dedicated "open extension dir" action is needed, we just return
   * the path and let the renderer treat it like any other folder
   * shortcut (configDir / binDir / localDir). In dev this resolves to
   * `packages/mediago-extension/dist/` inside the monorepo; in prod
   * it's `resources/extension/` inside the installer.
   */
  @handle(IPC.app.getExtensionDir)
  async getExtensionDir(): Promise<string> {
    return resolveExtensionDir().extensionDir;
  }

  @handle(IPC.app.importLegacyData)
  async importLegacyData(
    _event: IpcMainInvokeEvent,
    dataRoot: string,
  ): Promise<{ backupPath: string | null }> {
    if (typeof dataRoot !== "string" || !dataRoot.trim()) {
      throw new Error("Choose an older NyaCatch data folder");
    }
    await this.updater.assertIdle();
    const sourceWorkspace = path.join(dataRoot, "appdata", appName);
    if (path.resolve(sourceWorkspace) === path.resolve(workspace)) {
      throw new Error("Choose an older NyaCatch data folder");
    }
    const { coreBin } = resolveCoreBinaries();
    const execFileAsync = promisify(execFile);
    await validateLegacyWorkspace(dataRoot, appName, async (dbPath) => {
      await execFileAsync(coreBin, ["validate-db", dbPath], {
        windowsHide: true,
      });
    });
    await this.downloaderServer.stop();
    let result: MigrationResult;
    try {
      result = await migrateLegacyWorkspace(dataRoot, workspace, appName);
    } catch (error) {
      if (!(error instanceof MigrationError) || error.workspaceRestored) {
        await this.downloaderServer.start({ logDir, dbPath: db });
      }
      throw error;
    }
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 1500);
    return { backupPath: result.backupPath };
  }

  @handle(IPC.app.showBrowserWindow)
  async showBrowserWindow(_event: IpcMainEvent, platformId?: string) {
    if (
      platformId != null &&
      (typeof platformId !== "string" || !/^[a-z0-9-]{1,40}$/.test(platformId))
    ) {
      throw new Error("Invalid platform ID");
    }
    await this.browserWindow.showWindow(platformId);
  }

  @handle(IPC.app.combineToHomePage)
  async combineToHomePage() {
    this.browserWindow.hideWindow();
    const client = this.downloaderServer.getClient();
    await client.setConfigKey("openInNewWindow", false);
  }

  @handle(IPC.app.getSharedState)
  async getSharedState() {
    return this.sharedState;
  }

  @handle(IPC.app.setSharedState)
  async setSharedState(event: IpcMainEvent, state: any) {
    this.sharedState = state;
  }

  @handle(IPC.update.check)
  async checkUpdate(event: IpcMainInvokeEvent) {
    this.assertUpdateOwner(event);
    return this.updater.manualUpdate();
  }

  @handle(IPC.update.startDownload)
  async startUpdate(event: IpcMainInvokeEvent) {
    this.assertUpdateOwner(event);
    return this.updater.startDownload();
  }

  @handle(IPC.update.install)
  async installUpdate(event: IpcMainInvokeEvent) {
    this.assertUpdateOwner(event);
    return this.updater.install();
  }

  @handle(IPC.update.state)
  async updateState(event: IpcMainInvokeEvent) {
    this.assertUpdateOwner(event);
    return this.updater.state;
  }

  private assertUpdateOwner(event: IpcMainInvokeEvent) {
    const owner = this.mainWindow.window?.webContents;
    if (
      !owner ||
      owner.isDestroyed() ||
      event.sender !== owner ||
      event.senderFrame !== owner.mainFrame
    ) {
      throw new Error("Only the main application frame may manage updates");
    }
  }
}
