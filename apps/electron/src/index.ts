import { isLocalBeta } from "./runtime-paths";
import "./utils/sentry";
import "reflect-metadata";
import { buildProviderModule } from "@inversifyjs/binding-decorators";
import { app, protocol } from "electron";
import { Container } from "inversify";
import ElectronApp from "./app";
import { defaultScheme, noop } from "./utils";
import path from "node:path";
import { installTextEditContextMenu } from "./services/text-edit-context-menu";

if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath(
    "userData",
    path.join(process.env.PORTABLE_EXECUTABLE_DIR, "data"),
  );
}

const container = new Container({
  defaultScope: "Singleton",
});

const gotTheLock = app.requestSingleInstanceLock();

if (!isLocalBeta && process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(defaultScheme, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else if (!isLocalBeta) {
  app.setAsDefaultProtocolClient(defaultScheme);
}

const start = async (): Promise<void> => {
  if (!gotTheLock) {
    app.quit();
    return;
  }

  protocol.registerSchemesAsPrivileged([
    {
      scheme: defaultScheme,
      privileges: {
        secure: true,
        standard: true,
        stream: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
  await app.whenReady();
  installTextEditContextMenu();
  await container.load(buildProviderModule());
  const mediago = container.get(ElectronApp);
  await mediago.init();
  app.on("window-all-closed", noop);
  app.on("second-instance", mediago.secondInstance);
};

void start();
