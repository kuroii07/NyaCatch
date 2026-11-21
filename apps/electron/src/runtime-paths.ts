import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

// Applied before constants/loggers read Electron paths. The directory package
// owns its state and never adopts the installed app's database or browser session.
// Keep the marker filename compatible with already installed beta delivery tools.
const marker = path.join(process.resourcesPath, "nyacatch-beta.json");
export const runtimeBuild = app.isPackaged
  ? (JSON.parse(readFileSync(marker, "utf8")) as {
      channel?: string;
      version?: string;
    })
  : {};
export const isLocalBeta =
  app.isPackaged && runtimeBuild.channel === "local-beta";
export const isInstalledBuild =
  app.isPackaged &&
  !isLocalBeta &&
  existsSync(
    path.join(path.dirname(process.execPath), "Uninstall NyaCatch.exe"),
  );
export const dataRoot = app.isPackaged
  ? isInstalledBuild
    ? path.join(app.getPath("appData"), "NyaCatch")
    : path.join(path.dirname(process.execPath), "data")
  : undefined;

if (dataRoot) {
  const root = dataRoot;
  for (const [key, dir] of [
    ["appData", "appdata"],
    ["userData", "userdata"],
    ["sessionData", "session"],
  ] as const) {
    const target = path.join(root, dir);
    mkdirSync(target, { recursive: true });
    app.setPath(key, target);
  }
  const workspace = path.join(root, "appdata", process.env.APP_NAME!);
  mkdirSync(workspace, { recursive: true });
  const config = path.join(workspace, "config.json");
  if (!existsSync(config)) {
    writeFileSync(
      config,
      JSON.stringify({
        local: isInstalledBuild
          ? path.join(app.getPath("downloads"), "NyaCatch")
          : path.join(path.dirname(process.execPath), "下载"),
        autoUpgrade: false,
        promptTone: false,
      }),
      { flag: "wx" },
    );
  }
}
