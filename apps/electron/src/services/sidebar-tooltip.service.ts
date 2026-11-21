import { provide } from "@inversifyjs/binding-decorators";
import {
  BrowserWindow,
  screen,
  WebContentsView,
  type WebContents,
} from "electron";
import { inject, injectable } from "inversify";
import MainWindow from "../windows/main.window";
import {
  sidebarTooltipBounds,
  validateSidebarTooltip,
} from "./sidebar-tooltip-layout";

const document = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>NyaCatch Sidebar Tooltip</title><style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden}body{padding:8px;box-sizing:border-box;font-family:"HarmonyOS Sans SC","MiSans","Microsoft YaHei UI","Microsoft JhengHei UI","Yu Gothic UI","Malgun Gothic",sans-serif}
#tooltip{position:relative;width:max-content;max-width:260px;box-sizing:border-box;padding:6px 8px;border-radius:6px;line-height:1.57;overflow-wrap:anywhere;box-shadow:0 2px 6px #0003}
#tooltip:before{content:"";position:absolute;left:-4px;top:calc(50% - 4px);width:8px;height:8px;transform:rotate(45deg);background:var(--tooltip-background)}
</style><div id="tooltip" role="tooltip"><span id="tooltip-text"></span></div>`;

@injectable()
@provide()
export default class SidebarTooltipService {
  private popup: BrowserWindow | null = null;
  private parent: BrowserWindow | null = null;
  private ready: Promise<void> = Promise.resolve();
  private generation = 0;
  private watched = new WeakSet<WebContents>();

  constructor(@inject(MainWindow) private readonly mainWindow: MainWindow) {}

  private hide = () => {
    this.generation++;
    if (this.popup && !this.popup.isDestroyed()) this.popup.hide();
  };

  private watchContents(contents: WebContents, hideOnFocus = false) {
    if (this.watched.has(contents)) return;
    this.watched.add(contents);
    contents.on("before-input-event", (_event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") this.hide();
    });
    if (hideOnFocus) contents.on("focus", this.hide);
  }

  async update(input: unknown): Promise<void> {
    const request = validateSidebarTooltip(input);
    if (!request) {
      this.hide();
      return;
    }
    const parent = this.mainWindow.window;
    if (
      !parent ||
      parent.isDestroyed() ||
      !parent.isVisible() ||
      parent.isMinimized()
    )
      return;
    const ticket = ++this.generation;
    this.watchContents(parent.webContents);
    for (const child of parent.contentView.children) {
      if (
        child instanceof WebContentsView &&
        child.webContents !== parent.webContents
      ) {
        this.watchContents(child.webContents, true);
      }
    }
    if (!this.popup || this.popup.isDestroyed() || this.parent !== parent) {
      const bindParent = this.parent !== parent;
      if (this.popup && !this.popup.isDestroyed()) this.popup.destroy();
      this.parent = parent;
      // An owned native window can cover WebContentsView; CSS z-index cannot.
      // It never takes focus, captures mouse input, or becomes globally topmost.
      this.popup = new BrowserWindow({
        parent,
        show: false,
        frame: false,
        transparent: true,
        focusable: false,
        skipTaskbar: true,
        hasShadow: false,
        resizable: false,
        movable: false,
        width: 320,
        height: 200,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          partition: "sidebar-tooltip",
        },
      });
      this.popup.setIgnoreMouseEvents(true);
      this.popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      this.popup.webContents.on("will-navigate", (event) =>
        event.preventDefault(),
      );
      this.ready = this.popup.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(document),
      );
      if (bindParent) {
        const changed = () => {
          if (this.parent === parent) this.hide();
        };
        parent.on("blur", changed);
        parent.on("hide", changed);
        parent.on("minimize", changed);
        parent.on("move", changed);
        parent.on("resize", changed);
        parent.once("closed", () => {
          if (this.parent !== parent) return;
          this.hide();
          if (this.popup && !this.popup.isDestroyed()) this.popup.destroy();
          this.popup = null;
          this.parent = null;
        });
      }
    }
    const popup = this.popup;
    try {
      await this.ready;
      if (ticket !== this.generation || popup.isDestroyed()) return;
      const zoom = parent.webContents.getZoomFactor();
      const size = (await popup.webContents
        .executeJavaScript(`(async (value,zoom)=>{
        const bubble=document.getElementById('tooltip');document.getElementById('tooltip-text').textContent=value.text;
        bubble.style.backgroundColor=value.background;bubble.style.color=value.color;bubble.style.fontSize=(value.fontSize*zoom)+'px';
        document.documentElement.style.setProperty('--tooltip-background',value.background);await document.fonts.ready;
        const rect=bubble.getBoundingClientRect();return {width:Math.ceil(rect.width)+16,height:Math.ceil(rect.height)+16};
      })(${JSON.stringify(request)},${zoom})`)) as {
        width: number;
        height: number;
      };
      if (
        ticket !== this.generation ||
        popup.isDestroyed() ||
        parent.isDestroyed() ||
        !parent.isVisible() ||
        parent.isMinimized()
      )
        return;
      const parentBounds = parent.getContentBounds();
      const workArea = screen.getDisplayNearestPoint({
        x: parentBounds.x + request.anchor.x,
        y: parentBounds.y + request.anchor.y,
      }).workArea;
      popup.setBounds(
        sidebarTooltipBounds(
          request.anchor,
          parentBounds,
          workArea,
          size,
          zoom,
        ),
      );
      popup.showInactive();
    } catch (error) {
      if (ticket === this.generation) this.hide();
      throw error;
    }
  }
}
