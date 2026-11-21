import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

// Applied before constants/loggers read Electron paths. The directory package
// owns its state and never adopts the installed app's database or browser session.
export const isLocalBeta =
  app.isPackaged &&
  existsSync(path.join(process.resourcesPath, "nyacatch-beta.json"));

if (isLocalBeta) {
  const root = path.join(path.dirname(process.execPath), "data");
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
        local: path.join(path.dirname(process.execPath), "下载"),
        autoUpgrade: false,
        promptTone: false,
      }),
      { flag: "wx" },
    );
  }
}
