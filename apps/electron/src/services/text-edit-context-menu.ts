import {
  app,
  BrowserWindow,
  type ContextMenuParams,
  Menu,
  type MenuItemConstructorOptions,
  type WebContents,
  webContents,
} from "electron";
import { i18n } from "../core/i18n";

const textControls = new Set([
  "input-email",
  "input-number",
  "input-password",
  "input-search",
  "input-telephone",
  "input-text",
  "input-url",
  "text-area",
]);
const attached = new WeakSet<WebContents>();
let installed = false;

function attach(contents: WebContents) {
  if (attached.has(contents)) return;
  attached.add(contents);
  contents.on("context-menu", (event, params: ContextMenuParams) => {
    // Leave task/favorite menus alone. Read-only text controls still allow the
    // copy/select actions reported by Chromium, including password restrictions.
    if (
      contents.isDestroyed() ||
      event.defaultPrevented ||
      (!params.isEditable && !textControls.has(params.formControlType))
    )
      return;

    const flags = params.editFlags;
    const template: MenuItemConstructorOptions[] = [
      { role: "undo", label: i18n.t("textEditUndo"), enabled: flags.canUndo },
      { role: "redo", label: i18n.t("textEditRedo"), enabled: flags.canRedo },
      { type: "separator" },
      { role: "cut", label: i18n.t("textEditCut"), enabled: flags.canCut },
      { role: "copy", label: i18n.t("copy"), enabled: flags.canCopy },
      { role: "paste", label: i18n.t("paste"), enabled: flags.canPaste },
      { role: "delete", label: i18n.t("delete"), enabled: flags.canDelete },
      { type: "separator" },
      {
        role: "selectAll",
        label: i18n.t("selectAll"),
        enabled: flags.canSelectAll,
      },
    ];
    event.preventDefault();
    Menu.buildFromTemplate(template).popup({
      window: BrowserWindow.fromWebContents(contents) ?? undefined,
      frame: params.frame ?? undefined,
    });
  });
}

export function installTextEditContextMenu() {
  if (installed) return;
  installed = true;
  app.on("web-contents-created", (_event, contents) => attach(contents));
  for (const contents of webContents.getAllWebContents()) attach(contents);
}
