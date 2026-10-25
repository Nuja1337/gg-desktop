// Guild Golem's desktop app: the site in a window, with Chromium's block on Program Files lifted for the game's own
// folders and nothing else (allow.ts). It runs no code of its own inside the page: no preload script, no Node access.
import { app, BrowserWindow, Menu, Tray, dialog, nativeImage, session, shell } from "electron";
import type { Session, WebContents } from "electron";
import * as path from "node:path";
import { decideAccess } from "./allow";
import { DEV_SITE_ORIGIN, SITE_ORIGIN, isExternalOk, isInAppUrl, originOf } from "./navigation";
import { decidePermission } from "./permissions";

// `npm run start:dev`, or GG_DESKTOP_DEV=1, loads the dev site and trusts that origin instead of the live one. It
// works only when run from source: an installed app always loads the live site.
const isDev = !app.isPackaged && (process.argv.includes("--dev") || process.env.GG_DESKTOP_DEV === "1");
const siteOrigin = isDev ? DEV_SITE_ORIGIN : SITE_ORIGIN;
const title = isDev ? "Guild Golem (dev)" : "Guild Golem";
const iconPath = path.join(__dirname, "..", "..", "assets", "icon.png");

// Chromium 156 checks every child of a picked folder against its block list too: it lists no files, and opens no
// child, of a folder under Program Files, and it doesn't ask this app first. These two checks are turned off, so a
// picked Logs folder can be read. The restricted-path rule below still decides what the site may pick. The cost: when
// a link or junction is planted inside a folder the user already picked and points somewhere else, Chromium no longer
// catches it. Only someone who can already write to the game's folders can plant one.
const OFF = ["FileSystemAccessDirectoryIterationBlocklistCheck", "FileSystemAccessWriteBlocklistCheck"];
const already = app.commandLine.getSwitchValue("disable-features").split(",").filter(Boolean);
app.commandLine.appendSwitch("disable-features", [...new Set([...already, ...OFF])].join(","));

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

/**
 * File system access for the site (writes only in the addon's folder), and clipboard text written from the site's page.
 * The rest is refused. With a check handler set, Electron sends every file grant here with no page, so the origin
 * decides, as the request handler's page check can't.
 */
function lockPermissions(ses: Session): void {
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const d = details as { requestingUrl?: string; embeddingOrigin?: string; isMainFrame?: boolean; filePath?: string; fileAccessType?: "writable" | "readable" };
    callback(
      decidePermission(
        { permission, requestingOrigin: d.requestingUrl, topUrl: contents.getURL(), embeddingOrigin: d.embeddingOrigin, isMainFrame: d.isMainFrame, filePath: d.filePath, fileAccessType: d.fileAccessType },
        siteOrigin,
      ),
    );
  });
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    return decidePermission(
      { permission, requestingOrigin, topUrl: contents ? contents.getURL() : null, embeddingOrigin: details.embeddingOrigin, isMainFrame: details.isMainFrame, filePath: details.filePath, fileAccessType: details.fileAccessType },
      siteOrigin,
    );
  });
}

const DENIED_DETAIL = [
  "Under Program Files, the app opens only these folders of a game version, such as _retail_ or _classic_:",
  "",
  "Logs",
  "WTF\\Account\\...\\SavedVariables",
  "Interface\\AddOns\\GuildGolem",
  "",
  "Pick one of them, or a file inside one.",
].join("\n");

let explaining = false;
/** Says, in a native box, which folders the app opens, so a refused pick isn't a silent failure. One box at a time. */
function explainDenied(): void {
  if (explaining || !win) return;
  explaining = true;
  void dialog
    .showMessageBox(win, {
      type: "info",
      title,
      message: "Guild Golem can't open that folder",
      detail: DENIED_DETAIL,
    })
    .finally(() => {
      explaining = false;
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
        originOf(details.origin) === siteOrigin &&
        pageUrl !== null &&
        originOf(pageUrl) === siteOrigin &&
        (frameUrl === null || originOf(frameUrl) === siteOrigin);
      const rules = { origins: [siteOrigin] };
      let decision = fromSite ? decideAccess(details.origin, details.path, rules) : { allow: false, reason: "not from the site's page" };
      // A new file the site saves (the save picker) doesn't exist yet, so reading it can't be checked: it may be made
      // inside the addon's folder alone, which is the write rule.
      if (fromSite && !decision.allow && !details.isDirectory) {
        const asWrite = decideAccess(details.origin, details.path, rules, "write");
        if (asWrite.allow) decision = asWrite;
      }
      if (decision.allow) answer = "allow";
      else if (fromSite) explainDenied();
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
