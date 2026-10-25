// Which page permissions the app grants. Pure, so it is tested without Electron.
import { decideAccess, type FsLike } from "./allow";
import { originOf } from "./navigation";

export interface PermissionAsk {
  permission: string;
  /** The requesting origin or address, in whatever form Electron gave it (it adds a trailing slash). */
  requestingOrigin: string | undefined;
  /** The top page's address. Null when Electron has no page for the ask, as it does for file system access grants. */
  topUrl: string | null;
  /** The origin of the page that holds the asking frame. Electron sets it on every check from a page, the site's own top page too. */
  embeddingOrigin?: string;
  isMainFrame?: boolean;
  filePath?: string;
  fileAccessType?: "writable" | "readable";
}

/**
 * Grants only: file system access for the site, read-only except inside the addon's folder, and writing text to the
 * clipboard from the site's own page. Never clipboard-read, notifications, fullscreen or anything else.
 */
export function decidePermission(ask: PermissionAsk, siteOrigin: string, fs?: FsLike): boolean {
  if (originOf(ask.requestingOrigin ?? "") !== siteOrigin) return false;
  if (ask.embeddingOrigin !== undefined && originOf(ask.embeddingOrigin) !== siteOrigin) return false;
  const topOk = ask.topUrl !== null && originOf(ask.topUrl) === siteOrigin;
  switch (ask.permission) {
    case "fileSystem":
      // A grant has no page of its own (topUrl is null). When there is one, it must be the site's.
      if (ask.topUrl !== null && !topOk) return false;
      if (ask.fileAccessType === "writable") {
        if (!ask.filePath) return false;
        return decideAccess(siteOrigin, ask.filePath, { origins: [siteOrigin], fs }, "write").allow;
      }
      return true;
    case "clipboard-sanitized-write":
      return topOk;
    default:
      return false;
  }
}
