import type { PlatformApi } from "@mediago/shared-common";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noop = async (..._args: unknown[]): Promise<any> => {};

/**
 * Web/server mode stubs for PlatformApi.
 * All Electron-native operations are no-ops in web mode.
 */
export const webPlatformStubs: PlatformApi = {
  browser: {
    loadURL: noop,
    back: async () => false,
    reload: noop,
    show: noop,
    hide: noop,
    home: noop,
    setBounds: noop,
    setUserAgent: noop,
    clearCache: noop,
    pluginReady: noop,
    showDownloadDialog: noop,
    dismissOverlayDialog: noop,
  },
  app: {
    getEnvPath: async () => ({
      binPath: "",
      dbPath: "",
      workspace: "",
      platform: "",
      local: "",
      playerUrl: "",
      coreUrl: "",
    }),
    getBuildInfo: async () => ({
      productVersion: "unknown",
      upstreamVersion: "unknown",
      electronVersion: "unknown",
      nodeVersion: "unknown",
      osVersion: "unknown",
      platform: "web",
      arch: "unknown",
      tools: {},
    }),
    // Web/server mode has no local filesystem — the browser extension
    // is an Electron-only concept, and the Settings UI hides the
    // "Browser extension directory" button behind `isWeb`. The stub
    // just returns an empty string so type-wise the shared contract
    // holds.
    getExtensionDir: async () => "",
    importLegacyData: async () => ({ backupPath: null }),
    getSharedState: async () => ({}),
    setSharedState: noop,
    showBrowserWindow: noop,
    combineToHomePage: noop,
    setSidebarTooltip: noop,
  },
  dialog: {
    open: async () => [],
    pathForDroppedFile: async () => "",
    save: async () => "",
  },
  shell: {
    createMediaPreview: async () => {
      throw Error("Local preview is available in the desktop app");
    },
    releaseMediaPreview: noop,
    checkFiles: async () => {
      throw new Error(
        "Local file checks are only available in the desktop app",
      );
    },
    reveal: async () => {
      throw new Error("File location is only available in the desktop app");
    },
    open: async (target: string) => {
      const a = document.createElement("a");
      a.href = target;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    },
  },
  contextMenu: {
    show: async () => null,
  },
  update: {
    check: noop,
    startDownload: noop,
    install: noop,
  },
  on: () => {},
  off: () => {},
};
