// ============================================================
// IPC Invoke channels (renderer → main, namespaced)
// ============================================================

export const IPC = {
  browser: {
    loadURL: "browser.loadURL",
    back: "browser.back",
    reload: "browser.reload",
    show: "browser.show",
    hide: "browser.hide",
    home: "browser.home",
    setBounds: "browser.setBounds",
    setUserAgent: "browser.setUserAgent",
    clearCache: "browser.clearCache",
    cacheInfo: "browser.cacheInfo",
    clearWebsiteData: "browser.clearWebsiteData",
    pluginReady: "browser.pluginReady",
    showDownloadDialog: "browser.showDownloadDialog",
    dismissOverlayDialog: "browser.dismissOverlayDialog",
  },
  app: {
    getEnvPath: "app.getEnvPath",
    getExtensionDir: "app.getExtensionDir",
    getBuildInfo: "app.getBuildInfo",
    importLegacyData: "app.importLegacyData",
    getSharedState: "app.getSharedState",
    setSharedState: "app.setSharedState",
    showBrowserWindow: "app.showBrowserWindow",
    combineToHomePage: "app.combineToHomePage",
    setSidebarTooltip: "app.setSidebarTooltip",
  },
  dialog: {
    open: "dialog.open",
    save: "dialog.save",
  },
  shell: {
    createMediaPreview: "shell.createMediaPreview",
    releaseMediaPreview: "shell.releaseMediaPreview",
    startCompatiblePreview: "shell.startCompatiblePreview",
    compatiblePreviewStatus: "shell.compatiblePreviewStatus",
    releaseCompatiblePreview: "shell.releaseCompatiblePreview",
    mediaPreviewCacheInfo: "shell.mediaPreviewCacheInfo",
    clearMediaPreviewCache: "shell.clearMediaPreviewCache",
    checkFiles: "shell.checkFiles",
    open: "shell.open",
    reveal: "shell.reveal",
  },
  contextMenu: {
    show: "contextMenu.show",
  },
  update: {
    check: "update.check",
    state: "update.state",
    startDownload: "update.startDownload",
    install: "update.install",
  },
} as const;

// ============================================================
// IPC Send events (main → renderer, namespaced)
// ============================================================

export const IpcEvent = {
  browser: {
    domReady: "browser:domReady",
    didNavigate: "browser:didNavigate",
    didNavigateInPage: "browser:didNavigateInPage",
    sourceDetected: "browser:sourceDetected",
    showOverlayDialog: "browser:showOverlayDialog",
    privacyChanged: "browser:privacyChanged",
  },
  update: {
    checking: "update:checking",
    available: "update:available",
    notAvailable: "update:notAvailable",
    downloadProgress: "update:downloadProgress",
    downloaded: "update:downloaded",
  },
  config: {
    changed: "config:changed",
  },
} as const;

// ============================================================
// Reflect metadata keys
// ============================================================

export const MEDIAGO_EVENT = "mediago:event";
export const MEDIAGO_METHOD = "mediago:method";

// ============================================================
// SWR cache keys (not IPC channels)
// ============================================================

export const IS_SETUP = "is-setup";

// ============================================================
// Shared event names (used by both Go Core SSE and UI)
// ============================================================

export const DOWNLOAD_EVENT_NAME = "download-event";
