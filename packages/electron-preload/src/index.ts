import {
  IPC,
  type PlatformApi,
  type EnvPath,
  type DownloadTask,
  type BrowserStore,
  type DialogOpenOptions,
  type DialogSaveOptions,
  type ContextMenuItem,
  type LocalFileCheck,
} from "@mediago/shared-common";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { trustedApplicationFrame } from "./frame-policy";

const apiKey = "electron";

/**
 * Only platform-specific methods are exposed via IPC.
 * Data/CRUD operations (GoApi) go directly to Go Core HTTP from the renderer.
 *
 * getEnvPath is a special case: it's in GoApi but also needed before Go adapter
 * is initialized (to discover coreUrl), so we keep it in the preload as well.
 */
const electronApi: PlatformApi = {
  browser: {
    loadURL(url: string): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.loadURL, url);
    },
    back(): Promise<boolean> {
      return ipcRenderer.invoke(IPC.browser.back);
    },
    reload(): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.reload);
    },
    show(): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.show);
    },
    hide(): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.hide);
    },
    home(): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.home);
    },
    setBounds(rect: Electron.Rectangle): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.setBounds, rect);
    },
    setUserAgent(isMobile: boolean): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.setUserAgent, isMobile);
    },
    cacheInfo(): Promise<{ bytes: number }> {
      return ipcRenderer.invoke(IPC.browser.cacheInfo);
    },
    clearWebsiteData(): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.clearWebsiteData);
    },
    clearCache(): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.clearCache);
    },
    pluginReady(): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.pluginReady);
    },
    showDownloadDialog(data: Omit<DownloadTask, "id">[]): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.showDownloadDialog, data);
    },
    dismissOverlayDialog(): Promise<void> {
      return ipcRenderer.invoke(IPC.browser.dismissOverlayDialog);
    },
  },
  app: {
    getEnvPath(): Promise<EnvPath> {
      return ipcRenderer.invoke(IPC.app.getEnvPath);
    },
    getBuildInfo(): Promise<import("@mediago/shared-common").AppBuildInfo> {
      return ipcRenderer.invoke(IPC.app.getBuildInfo);
    },
    getExtensionDir(): Promise<string> {
      return ipcRenderer.invoke(IPC.app.getExtensionDir);
    },
    importLegacyData(dataRoot: string): Promise<{ backupPath: string | null }> {
      return ipcRenderer.invoke(IPC.app.importLegacyData, dataRoot);
    },
    getSharedState(): Promise<unknown> {
      return ipcRenderer.invoke(IPC.app.getSharedState);
    },
    setSharedState(state: unknown): Promise<void> {
      return ipcRenderer.invoke(IPC.app.setSharedState, state);
    },
    showBrowserWindow(platformId?: string): Promise<void> {
      return ipcRenderer.invoke(IPC.app.showBrowserWindow, platformId);
    },
    combineToHomePage(store: BrowserStore): Promise<void> {
      return ipcRenderer.invoke(IPC.app.combineToHomePage, store);
    },
    setSidebarTooltip(
      value: import("@mediago/shared-common").SidebarTooltipRequest | null,
    ): Promise<void> {
      return ipcRenderer.invoke(IPC.app.setSidebarTooltip, value);
    },
  },
  dialog: {
    open(options: DialogOpenOptions): Promise<string[]> {
      return ipcRenderer.invoke(IPC.dialog.open, options);
    },
    save(options: DialogSaveOptions): Promise<string> {
      return ipcRenderer.invoke(IPC.dialog.save, options);
    },
    async pathForDroppedFile(file: File): Promise<string> {
      return webUtils.getPathForFile(file);
    },
  },
  shell: {
    createMediaPreview(target: string) {
      return ipcRenderer.invoke(IPC.shell.createMediaPreview, target);
    },
    releaseMediaPreview(id: string) {
      return ipcRenderer.invoke(IPC.shell.releaseMediaPreview, id);
    },
    startCompatiblePreview(target: string) {
      return ipcRenderer.invoke(IPC.shell.startCompatiblePreview, target);
    },
    compatiblePreviewStatus(id: string) {
      return ipcRenderer.invoke(IPC.shell.compatiblePreviewStatus, id);
    },
    releaseCompatiblePreview(id: string) {
      return ipcRenderer.invoke(IPC.shell.releaseCompatiblePreview, id);
    },
    mediaPreviewCacheInfo() {
      return ipcRenderer.invoke(IPC.shell.mediaPreviewCacheInfo);
    },
    clearMediaPreviewCache() {
      return ipcRenderer.invoke(IPC.shell.clearMediaPreviewCache);
    },
    checkFiles(
      targets: string[],
      inspectVideo = false,
    ): Promise<LocalFileCheck[]> {
      return ipcRenderer.invoke(IPC.shell.checkFiles, targets, inspectVideo);
    },
    reveal(target: string): Promise<void> {
      return ipcRenderer.invoke(IPC.shell.reveal, target);
    },
    open(target: string): Promise<void> {
      return ipcRenderer.invoke(IPC.shell.open, target);
    },
  },
  contextMenu: {
    show(items: ContextMenuItem[]): Promise<string | null> {
      return ipcRenderer.invoke(IPC.contextMenu.show, items);
    },
  },
  update: {
    state() {
      return ipcRenderer.invoke(IPC.update.state);
    },
    check(): Promise<void> {
      return ipcRenderer.invoke(IPC.update.check);
    },
    startDownload(): Promise<void> {
      return ipcRenderer.invoke(IPC.update.startDownload);
    },
    install(): Promise<void> {
      return ipcRenderer.invoke(IPC.update.install);
    },
  },
  on(channel: string, listener: (...args: unknown[]) => void): void {
    ipcRenderer.on(channel, listener);
  },
  off(channel: string, listener: (...args: unknown[]) => void): void {
    ipcRenderer.removeListener(channel, listener);
  },
};

const trustedFrame = trustedApplicationFrame(
  window.location,
  window === window.top,
  process.env.NODE_ENV !== "production",
);
// Source websites need only the injected media helper, never native file/app/update APIs.
contextBridge.exposeInMainWorld(
  apiKey,
  trustedFrame
    ? electronApi
    : {
        browser: {
          showDownloadDialog: electronApi.browser.showDownloadDialog,
          pluginReady: electronApi.browser.pluginReady,
        },
      },
);

export { electronApi };
export type { PlatformApi };
