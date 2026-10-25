// Guild Golem's desktop app: the site in a window, with Chromium's block on Program Files lifted for the game's own
// folders and nothing else (allow.ts). It runs no code of its own inside the page: no preload script, no Node access.
import { app, BrowserWindow, Menu, Tray, dialog, nativeImage, session, shell } from "electron";
import type { Session, WebContents } from "electron";
import * as path from "node:path";
import { decideAccess } from "./allow";
import { DEV_SITE_ORIGIN, SITE_ORIGIN, isExternalOk, isInAppUrl, originOf } from "./navigation";

// `npm run start:dev`, or GG_DESKTOP_DEV=1, loads the dev site and trusts that origin instead of the live one.
const isDev = process.argv.includes("--dev") || process.env.GG_DESKTOP_DEV === "1";
const siteOrigin = isDev ? DEV_SITE_ORIGIN : SITE_ORIGIN;
const title = isDev ? "Guild Golem (dev)" : "Guild Golem";
const iconPath = path.join(__dirname, "..", "..", "assets", "icon.png");

// The dev app keeps its own sign-in, so the two sites' sessions never mix.
if (isDev) app.setPath("userData", path.join(app.getPath("appData"), title));

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let sessionEnding = false;

function showWindow(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** The user's browser gets https addresses only. Anything else is dropped. */
function openInBrowser(url: string): void {
  if (isExternalOk(url)) void shell.openExternal(url);
  else console.warn("Blocked a link that is not https:", url.slice(0, 80));
}

/** Allow only the file system permission, and only for the site. The page's other requests are refused. */
function lockPermissions(ses: Session): void {
  const ok = (permission: string, origin: string) => permission === "fileSystem" && origin === siteOrigin;
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(ok(permission, originOf(details.requestingUrl) ?? "") && originOf(contents.getURL()) === siteOrigin);
  });
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin) => {
    return ok(permission, requestingOrigin) && (!contents || originOf(contents.getURL()) === siteOrigin);
  });
}

/** The block on Program Files: ask allow.ts, and refuse anything it doesn't clearly allow. */
function liftGameFolderBlock(ses: Session): void {
  ses.on("file-system-access-restricted", (_event, details, callback) => {
    let answer: "allow" | "deny" = "deny";
    try {
      // The requesting origin, and the page that holds the frame, must both be the site.
      const frameUrl = details.frame ? details.frame.url : null;
      const pageUrl = details.webContents ? details.webContents.getURL() : null;
      const fromSite =
        details.origin === siteOrigin &&
        pageUrl !== null &&
        originOf(pageUrl) === siteOrigin &&
        (frameUrl === null || originOf(frameUrl) === siteOrigin);
      const decision = fromSite
        ? decideAccess(details.origin, details.path, { origins: [siteOrigin] })
        : { allow: false, reason: "not from the site's page" };
      if (decision.allow) answer = "allow";
      console.log(`file access ${answer}: ${decision.reason}`);
    } catch (err) {
      console.error("file access check failed, denied:", err);
    }
    callback(answer);
  });
}

/** Navigation rules for every page this app creates: the site and Discord's sign-in stay, the rest goes out. */
function lockNavigation(contents: WebContents): void {
  contents.on("will-navigate", (event, url) => {
    if (isInAppUrl(url, siteOrigin)) return;
    event.preventDefault();
    openInBrowser(url);
  });
  contents.on("will-redirect", (event, url) => {
    if (isInAppUrl(url, siteOrigin)) return;
    event.preventDefault();
    console.warn("Blocked a redirect out of the app:", originOf(url));
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isInAppUrl(url, siteOrigin)) setImmediate(() => void contents.loadURL(url));
    else openInBrowser(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}

function errorPage(): string {
  const html =
    "<!doctype html><meta charset=utf-8><title>Guild Golem</title>" +
    "<body style='font:16px system-ui;background:#1b1f2a;color:#e6e8ee;padding:3rem'>" +
    "<h1>Can't reach Guild Golem</h1><p>Check your connection. This page tries again every few seconds.</p>";
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function createWindow(): void {
  const ses = session.fromPartition("persist:guildgolem");
  lockPermissions(ses);
  liftGameFolderBlock(ses);

  win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    title,
    icon: iconPath,
    backgroundColor: "#1b1f2a",
    autoHideMenuBar: true,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false, // a raid is hours long, and the page must keep reading while hidden
      webviewTag: false,
    },
  });
  if (!isDev) win.removeMenu();
  const contents = win.webContents;

  win.once("ready-to-show", () => win?.show());
  // The page's own title is the site's. Keep the app's, so the dev window is easy to tell apart.
  win.on("page-title-updated", (event) => event.preventDefault());

  // Closing the window hides it, so the page keeps running. Quit in the tray menu closes it for real.
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win?.hide();
  });
  win.on("closed", () => {
    win = null;
  });
  win.on("session-end", () => {
    sessionEnding = true;
    quitting = true;
  });

  // The site asks before it is left while a live log runs. Show that as a native choice.
  contents.on("will-prevent-unload", (event) => {
    if (sessionEnding) return event.preventDefault();
    const choice = dialog.showMessageBoxSync(win!, {
      type: "question",
      buttons: ["Leave", "Stay"],
      defaultId: 1,
      cancelId: 1,
      title,
      message: "Leave Guild Golem?",
      detail: "The page asks you to stay, for example while it is sending a live log. Leaving stops it.",
    });
    if (choice === 0) event.preventDefault();
    else quitting = false;
  });

  // A failed load shows a plain page and tries again, so starting the app offline isn't a dead end.
  contents.on("did-fail-load", (_event, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || url.startsWith("data:")) return; // -3: a load that was replaced
    void contents.loadURL(errorPage());
    setTimeout(() => void win?.webContents.loadURL(siteOrigin), 8000);
  });

  void contents.loadURL(siteOrigin);
}

function createTray(): void {
  const image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip(title);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open", click: showWindow },
      { label: "Quit", click: () => { quitting = true; app.quit(); } },
    ]),
  );
  tray.on("click", showWindow);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.on("before-quit", () => {
    quitting = true;
  });
  // The tray keeps the app alive when the window is hidden.
  app.on("window-all-closed", () => {});
  app.on("web-contents-created", (_event, contents) => lockNavigation(contents));

  void app.whenReady().then(() => {
    createWindow();
    createTray();
  });
}
