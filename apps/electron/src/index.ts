import "./runtime-paths";
import "./utils/sentry";
import "reflect-metadata";
import { buildProviderModule } from "@inversifyjs/binding-decorators";
import { app, protocol } from "electron";
import { Container } from "inversify";
import ElectronApp from "./app";
import { defaultScheme, noop } from "./utils";
import { installTextEditContextMenu } from "./services/text-edit-context-menu";
import path from "node:path";

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

// The renderer scheme is internal; installing NyaCatch does not claim a system protocol.

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
