// The rule for Chromium's "restricted path" block, as pure functions. The window (main.ts) calls decideAccess() when
// the page picks a file or folder under a path Chromium refuses (Program Files), and answers allow or deny from it.
//
// Allowed, and nothing else: a request from an origin on the list, for a path that resolves to the inside of
//   <...>\World of Warcraft\<flavor>\Logs
//   <...>\World of Warcraft\<flavor>\WTF\Account\<any>\SavedVariables
//   <...>\World of Warcraft\<flavor>\Interface\AddOns\GuildGolem
// where <flavor> is a folder directly inside a "World of Warcraft" folder that holds a ".flavor.info" file. The folder's
// name alone is never enough.
import * as nodeFs from "node:fs";

export interface FsLike {
  /** The final path with every link, junction and 8.3 name resolved. Throws if the path doesn't exist. */
  realpath(p: string): string;
  /** True if the path is a file (following links). False if it is missing or anything else. */
  isFile(p: string): boolean;
}

export const realFs: FsLike = {
  realpath: (p) => nodeFs.realpathSync.native(p),
  isFile: (p) => {
    try {
      return nodeFs.statSync(p).isFile();
    } catch {
      return false;
    }
  },
};

export interface AllowConfig {
  /** Exact origins that may use the rule, such as "https://guildgolem.com". */
  origins: readonly string[];
  /** Defaults to this machine's. Windows paths are compared without regard to case. */
  platform?: NodeJS.Platform;
  fs?: FsLike;
}

export interface Decision {
  allow: boolean;
  reason: string;
}

export const WOW_FOLDER = "World of Warcraft";
export const FLAVOR_MARKER = ".flavor.info";
export const ADDON_FOLDER = "GuildGolem";

const deny = (reason: string): Decision => ({ allow: false, reason });
const allow = (reason: string): Decision => ({ allow: true, reason });

export function isAllowedOrigin(origin: unknown, origins: readonly string[]): boolean {
  return typeof origin === "string" && origins.includes(origin);
}

interface Parsed {
  /** "C:\" on Windows, "/" elsewhere. */
  root: string;
  segments: string[];
  sep: string;
}

/** Checks the path as the page's picker gave it, before touching the disk. Returns a reason to refuse, or null. */
export function refuseRawPath(raw: unknown, platform: NodeJS.Platform): string | null {
  if (typeof raw !== "string" || raw.length === 0) return "no path";
  if (/[\u0000-\u001f]/.test(raw)) return "control character in path";
  const win = platform === "win32";
  if (win) {
    if (raw.startsWith("\\\\") || raw.startsWith("//")) return "network or device path";
    if (!/^[A-Za-z]:[\\/]/.test(raw)) return "not a full drive path";
    if (raw.indexOf(":", 2) !== -1) return "stream or colon in path";
  } else if (!raw.startsWith("/")) {
    return "not a full path";
  }
  const parts = raw.split(win ? /[\\/]+/ : /\/+/);
  if (parts.includes("..")) return "dot-dot in path";
  return null;
}

function parseResolved(real: string, platform: NodeJS.Platform): Parsed | string {
  if (platform === "win32") {
    // The native resolver can return the "\\?\C:\..." form. Take the prefix off only when a drive letter follows, so
    // "\\?\UNC\server\share" stays refused.
    const p = real.replace(/^\\\\\?\\(?=[A-Za-z]:\\)/, "");
    if (!/^[A-Za-z]:[\\/]/.test(p)) return "resolves to a network or device path";
    return { root: p.slice(0, 3).replace("/", "\\"), segments: p.slice(3).split(/[\\/]+/).filter(Boolean), sep: "\\" };
  }
  if (!real.startsWith("/")) return "resolves to a relative path";
  return { root: "/", segments: real.split(/\/+/).filter(Boolean), sep: "/" };
}

/** Decides for a path that is already fully resolved. */
export function checkResolvedPath(real: string, config: Pick<AllowConfig, "platform" | "fs">): Decision {
  const platform = config.platform ?? process.platform;
  const fs = config.fs ?? realFs;
  const parsed = parseResolved(real, platform);
  if (typeof parsed === "string") return deny(parsed);
  const { root, segments, sep } = parsed;
  const norm = platform === "win32" ? (s: string) => s.toLowerCase() : (s: string) => s;
  const is = (a: string | undefined, b: string) => a !== undefined && norm(a) === norm(b);

  // The first "World of Warcraft" child that holds a .flavor.info file is the flavor folder.
  for (let i = 1; i < segments.length; i++) {
    if (!is(segments[i - 1], WOW_FOLDER)) continue;
    const flavorDir = root + segments.slice(0, i + 1).join(sep);
    if (!fs.isFile(flavorDir + sep + FLAVOR_MARKER)) continue;
    const t = segments.slice(i + 1);
    if (is(t[0], "Logs")) return allow("Logs");
    if (is(t[0], "WTF") && is(t[1], "Account") && t[2] !== undefined && is(t[3], "SavedVariables")) {
      return allow("SavedVariables");
    }
    if (is(t[0], "Interface") && is(t[1], "AddOns") && is(t[2], ADDON_FOLDER)) return allow("the addon folder");
    return deny("inside a game folder, but not Logs, SavedVariables or the addon");
  }
  return deny("not inside a game flavor folder");
}

/** The whole rule: origin, then the raw path, then the resolved path. */
export function decideAccess(origin: unknown, requestedPath: unknown, config: AllowConfig): Decision {
  const platform = config.platform ?? process.platform;
  const fs = config.fs ?? realFs;
  if (!isAllowedOrigin(origin, config.origins)) return deny("origin not allowed");
  const bad = refuseRawPath(requestedPath, platform);
  if (bad) return deny(bad);
  let real: string;
  try {
    real = fs.realpath(requestedPath as string);
  } catch {
    return deny("path can't be resolved");
  }
  return checkResolvedPath(real, { platform, fs });
}
