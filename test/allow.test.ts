import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { decideAccess, type AllowConfig, type FsLike } from "../src/allow";

const SITE = "https://guildgolem.com";
const WOW = "C:\\Program Files (x86)\\World of Warcraft";

/**
 * A Windows disk in memory, so the Windows rules are tested on any machine. Paths compare without case. `links` maps a
 * path to where it really points; `files` are the files that exist.
 */
function fakeWindows(files: string[], links: Record<string, string> = {}): FsLike {
  const key = (p: string) => p.replace(/[\\/]+/g, "\\").replace(/\\$/, "").toLowerCase();
  const fileSet = new Set(files.map(key));
  const linkMap = new Map(Object.entries(links).map(([from, to]) => [key(from), to]));
  return {
    realpath(p) {
      const k = key(p);
      for (const [from, to] of linkMap) {
        if (k === from || k.startsWith(from + "\\")) return to + p.slice(from.length);
      }
      return p.replace(/[\\/]+/g, "\\").replace(/\\$/, "");
    },
    isFile: (p) => fileSet.has(key(p)),
  };
}

const retailMarker = `${WOW}\\_retail_\\.flavor.info`;
const classicMarker = `${WOW}\\_classic_beta_\\.flavor.info`;

function win(fs: FsLike, origins: string[] = [SITE]): AllowConfig {
  return { origins, platform: "win32", fs };
}

function decide(p: string, fs: FsLike = fakeWindows([retailMarker, classicMarker]), origin: string = SITE) {
  return decideAccess(origin, p, win(fs));
}

describe("paths inside the allowed folders (Windows rules)", () => {
  const ok = [
    `${WOW}\\_retail_\\Logs`,
    `${WOW}\\_retail_\\Logs\\WoWCombatLog.txt`,
    `${WOW}\\_retail_\\Logs\\sub\\deeper\\file.txt`,
    `${WOW}\\_classic_beta_\\Logs\\WoWCombatLog.txt`,
    `${WOW}\\_retail_\\WTF\\Account\\MYACCOUNT\\SavedVariables`,
    `${WOW}\\_retail_\\WTF\\Account\\12345#1\\SavedVariables\\GuildGolem.lua`,
    `${WOW}\\_retail_\\Interface\\AddOns\\GuildGolem`,
    `${WOW}\\_retail_\\Interface\\AddOns\\GuildGolem\\GuildGolem.toc`,
    "D:\\Games\\World of Warcraft\\_retail_\\Logs\\WoWCombatLog.txt",
    `${WOW}\\_retail_\\WTF\\Account\\SavedVariables`,
    `${WOW}\\_retail_\\WTF\\Account\\SavedVariables\\Other.lua`,
    `${WOW}\\_retail_\\WTF\\Account\\ACC\\Realm\\Char\\SavedVariables`,
    `${WOW}\\_retail_\\WTF\\Account\\ACC\\Realm\\Char\\SavedVariables\\GuildGolem.lua`,
  ];
  for (const p of ok) {
    test(`allows ${p}`, () => {
      const fs = fakeWindows([retailMarker, classicMarker, "D:\\Games\\World of Warcraft\\_retail_\\.flavor.info"]);
      assert.equal(decide(p, fs).allow, true, decide(p, fs).reason);
    });
  }
});

describe("paths outside the allowed folders", () => {
  const no = [
    "C:\\",
    "C:\\Program Files (x86)",
    WOW,
    `${WOW}\\_retail_`,
    `${WOW}\\_retail_\\WTF`,
    `${WOW}\\_retail_\\WTF\\Account`,
    `${WOW}\\_retail_\\WTF\\Account\\ACC`,
    `${WOW}\\_retail_\\WTF\\Account\\ACC\\SavedVariables\\..\\config.wtf`,
    `${WOW}\\_retail_\\WTF\\Account\\ACC\\config-cache.wtf`,
    `${WOW}\\_retail_\\WTF\\Account\\ACC\\Realm\\Char`,
    `${WOW}\\_retail_\\WTF\\Account\\ACC\\Realm\\Char\\chat-cache.txt`,
    `${WOW}\\_retail_\\WTF\\Account\\ACC\\Realm\\Char\\Sub\\SavedVariables`,
    `${WOW}\\_retail_\\WTF\\Config.wtf`,
    `${WOW}\\_retail_\\Interface`,
    `${WOW}\\_retail_\\Interface\\AddOns`,
    `${WOW}\\_retail_\\Interface\\AddOns\\OtherAddon\\Other.lua`,
    `${WOW}\\_retail_\\Interface\\AddOns\\GuildGolemEvil`,
    `${WOW}\\_retail_\\Wow.exe`,
    `${WOW}\\_retail_\\LogsExtra\\x.txt`,
    `${WOW}\\Logs`,
    `${WOW}\\Launcher.exe`,
    "C:\\Users\\Someone\\Documents",
  ];
  for (const p of no) {
    test(`denies ${p}`, () => {
      assert.equal(decide(p).allow, false);
    });
  }
});

describe("the flavor folder", () => {
  test("a folder without .flavor.info is refused, whatever its name", () => {
    const fs = fakeWindows([]);
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\WoWCombatLog.txt`, fs).allow, false);
    assert.equal(decide(`${WOW}\\_classic_\\Logs`, fs).allow, false);
  });

  test("a flavor marker in a different flavor folder doesn't count", () => {
    const fs = fakeWindows([retailMarker]);
    assert.equal(decide(`${WOW}\\_classic_beta_\\Logs`, fs).allow, false);
    assert.equal(decide(`${WOW}\\_retail_\\Logs`, fs).allow, true);
  });

  test("the marker must sit in a folder directly inside World of Warcraft", () => {
    const fs = fakeWindows(["C:\\Games\\Other\\_retail_\\.flavor.info"]);
    assert.equal(decide("C:\\Games\\Other\\_retail_\\Logs", fs).allow, false);
  });

  test("the parent folder must be named World of Warcraft", () => {
    const fs = fakeWindows(["C:\\Games\\WoW\\_retail_\\.flavor.info"]);
    assert.equal(decide("C:\\Games\\WoW\\_retail_\\Logs", fs).allow, false);
  });
});

describe("origin", () => {
  const p = `${WOW}\\_retail_\\Logs\\WoWCombatLog.txt`;
  test("Electron's form, with a trailing slash, and the bare form both work", () => {
    assert.equal(decide(p, undefined, "https://guildgolem.com/").allow, true);
    assert.equal(decide(p, undefined, "https://guildgolem.com").allow, true);
  });
  test("a trailing slash doesn't make another origin match", () => {
    for (const origin of [
      "https://evil.example/",
      "http://guildgolem.com/",
      "https://guildgolem.com.evil.example/",
      "https://dev.guildgolem.com/",
    ]) {
      assert.equal(decide(p, undefined, origin).allow, false, origin);
    }
  });
  test("another origin is refused", () => {
    for (const origin of [
      "https://evil.example",
      "https://guildgolem.com.evil.example",
      "http://guildgolem.com",
      "https://dev.guildgolem.com",
      "https://www.guildgolem.com",
      "https://guildgolem.com:8443",
      "null",
      "",
    ]) {
      assert.equal(decide(p, undefined, origin).allow, false, origin);
    }
  });
  test("a missing origin is refused", () => {
    assert.equal(decideAccess(undefined, p, win(fakeWindows([retailMarker]))).allow, false);
  });
  test("the dev build's origin works when it is the one on the list", () => {
    const cfg = win(fakeWindows([retailMarker]), ["https://dev.guildgolem.com"]);
    assert.equal(decideAccess("https://dev.guildgolem.com", p, cfg).allow, true);
    assert.equal(decideAccess(SITE, p, cfg).allow, false);
  });
});

describe("write access", () => {
  const addon = `${WOW}\\_retail_\\Interface\\AddOns\\GuildGolem`;
  const w = (p: string, fs: FsLike = fakeWindows([retailMarker])) => decideAccess(`${SITE}/`, p, win(fs), "write");
  const missingLeaf = (base: FsLike, leaf: string): FsLike => ({
    ...base,
    realpath: (p) => {
      if (p.toLowerCase().endsWith(leaf)) throw new Error("ENOENT");
      return base.realpath(p);
    },
  });

  test("only the addon's folder is writable", () => {
    assert.equal(w(addon).allow, true);
    assert.equal(w(`${addon}\\GuildGolem.lua`).allow, true);
    assert.equal(decide(addon).writable, true);
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\WoWCombatLog.txt`).writable, false);
  });

  test("Logs and SavedVariables are read-only", () => {
    assert.equal(w(`${WOW}\\_retail_\\Logs\\WoWCombatLog.txt`).allow, false);
    assert.equal(w(`${WOW}\\_retail_\\WTF\\Account\\ACC\\SavedVariables\\GuildGolem.lua`).allow, false);
    assert.equal(w(`${WOW}\\_retail_\\WTF\\Account\\SavedVariables`).allow, false);
    assert.equal(w("C:\\Users\\Me\\Documents\\x.txt").allow, false);
  });

  test("a file that doesn't exist yet counts by its folder", () => {
    const missing = missingLeaf(fakeWindows([retailMarker]), "new.lua");
    assert.equal(w(`${addon}\\new.lua`, missing).allow, true);
    assert.equal(w(`${WOW}\\_retail_\\Logs\\new.lua`, missing).allow, false);
    assert.equal(decideAccess(SITE, `${addon}\\new.lua`, win(missing)).allow, false, "a missing file is not a read");
  });

  test("a new file in a folder that is a link out is refused", () => {
    const base = fakeWindows([retailMarker], { [addon]: "C:\\Windows\\System32" });
    assert.equal(w(`${addon}\\evil.dll`, missingLeaf(base, "evil.dll")).allow, false);
  });
});

describe("spelling of the path", () => {
  test("mixed case is the same folder on Windows", () => {
    const upper = `${WOW}\\_RETAIL_\\LOGS\\wowcombatlog.TXT`.toUpperCase();
    assert.equal(decide(upper).allow, true);
    assert.equal(decide(`c:\\program files (x86)\\WORLD of warcraft\\_Retail_\\wtf\\ACCOUNT\\x\\savedvariables`).allow, true);
    assert.equal(decide(`${WOW}\\_retail_\\interface\\addons\\guildgolem\\a.lua`).allow, true);
  });

  test("trailing slashes and doubled slashes are fine", () => {
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\`).allow, true);
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\\\`).allow, true);
    assert.equal(decide(`${WOW}\\\\_retail_\\Logs`).allow, true);
    assert.equal(decide(`${WOW}\\_retail_\\`).allow, false);
  });

  test("forward slashes work like backslashes", () => {
    assert.equal(decide("C:/Program Files (x86)/World of Warcraft/_retail_/Logs/WoWCombatLog.txt").allow, true);
  });

  test("dot-dot is refused, even when it would land inside", () => {
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\..\\Logs\\WoWCombatLog.txt`).allow, false);
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\..\\..\\Launcher.exe`).allow, false);
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\..`).allow, false);
    assert.equal(decide(`C:\\Windows\\..\\Program Files (x86)\\World of Warcraft\\_retail_\\Logs`).allow, false);
  });

  test("UNC and device paths are refused", () => {
    const unc = [
      "\\\\server\\share\\World of Warcraft\\_retail_\\Logs",
      "//server/share/World of Warcraft/_retail_/Logs",
      "\\\\?\\UNC\\server\\share\\World of Warcraft\\_retail_\\Logs",
      `\\\\?\\${WOW}\\_retail_\\Logs`,
      "\\\\.\\C:\\World of Warcraft\\_retail_\\Logs",
    ];
    const fs = fakeWindows([
      "\\\\server\\share\\World of Warcraft\\_retail_\\.flavor.info",
      retailMarker,
    ]);
    for (const p of unc) assert.equal(decide(p, fs).allow, false, p);
  });

  test("relative paths, empty strings, colons and control characters are refused", () => {
    for (const p of [
      "",
      "Logs",
      "World of Warcraft\\_retail_\\Logs",
      "C:Logs",
      "\\Program Files (x86)\\World of Warcraft\\_retail_\\Logs",
      `${WOW}\\_retail_\\Logs\\WoWCombatLog.txt:hidden`,
      `${WOW}\\_retail_\\Logs\\a\u0000b`,
    ]) {
      assert.equal(decide(p).allow, false, JSON.stringify(p));
    }
    assert.equal(decideAccess(SITE, undefined, win(fakeWindows([]))).allow, false);
    assert.equal(decideAccess(SITE, 42, win(fakeWindows([]))).allow, false);
  });
});

describe("links and junctions (Windows rules)", () => {
  test("a path inside the allowed folder that points out of it is refused", () => {
    const fs = fakeWindows([retailMarker], {
      [`${WOW}\\_retail_\\Interface\\AddOns\\GuildGolem`]: "C:\\Windows\\System32",
    });
    assert.equal(decide(`${WOW}\\_retail_\\Interface\\AddOns\\GuildGolem\\cmd.exe`, fs).allow, false);
    assert.equal(decide(`${WOW}\\_retail_\\Interface\\AddOns\\GuildGolem`, fs).allow, false);
  });

  test("a path outside that points into an allowed folder is allowed", () => {
    const fs = fakeWindows([retailMarker], { "C:\\Users\\Me\\shortcut": `${WOW}\\_retail_\\Logs` });
    assert.equal(decide("C:\\Users\\Me\\shortcut\\WoWCombatLog.txt", fs).allow, true);
  });

  test("a link in Logs that points at the game's folder is refused", () => {
    const fs = fakeWindows([retailMarker], { [`${WOW}\\_retail_\\Logs\\up`]: WOW });
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\up\\Launcher.exe`, fs).allow, false);
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\up`, fs).allow, false);
  });

  test("a link whose target is a network path is refused", () => {
    const fs = fakeWindows([retailMarker, "\\\\server\\share\\World of Warcraft\\_retail_\\.flavor.info"], {
      [`${WOW}\\_retail_\\Logs`]: "\\\\server\\share\\World of Warcraft\\_retail_\\Logs",
    });
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\WoWCombatLog.txt`, fs).allow, false);
  });

  test("the extended-length form of a drive path is accepted after resolving", () => {
    const fs: FsLike = {
      realpath: (p) => `\\\\?\\${p}`,
      isFile: (p) => p.toLowerCase().endsWith("_retail_\\.flavor.info"),
    };
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\WoWCombatLog.txt`, fs).allow, true);
  });

  test("a path that doesn't exist is refused", () => {
    const fs: FsLike = {
      realpath: () => {
        throw new Error("ENOENT");
      },
      isFile: () => true,
    };
    assert.equal(decide(`${WOW}\\_retail_\\Logs\\WoWCombatLog.txt`, fs).allow, false);
  });
});

describe("the real disk", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gg-desktop-allow-"));
  const wow = path.join(root, "World of Warcraft");
  const retail = path.join(wow, "_retail_");
  const noMarker = path.join(wow, "_ptr_");
  const outside = path.join(root, "outside");
  const config: AllowConfig = { origins: [SITE] };
  const linkType = process.platform === "win32" ? "junction" : "dir";

  const touch = (p: string) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "x");
  };

  test("setup", () => {
    touch(path.join(retail, ".flavor.info"));
    touch(path.join(retail, "Logs", "WoWCombatLog.txt"));
    touch(path.join(retail, "WTF", "Account", "ACC", "SavedVariables", "GuildGolem.lua"));
    touch(path.join(retail, "Interface", "AddOns", "GuildGolem", "GuildGolem.toc"));
    touch(path.join(retail, "Interface", "AddOns", "Other", "Other.lua"));
    touch(path.join(noMarker, "Logs", "WoWCombatLog.txt"));
    touch(path.join(outside, "secret.txt"));
    fs.symlinkSync(outside, path.join(retail, "Logs", "escape"), linkType);
    fs.symlinkSync(path.join(retail, "Interface", "AddOns", "Other"), path.join(retail, "Interface", "AddOns", "GuildGolemLink"), linkType);
    fs.symlinkSync(path.join(retail, "Logs"), path.join(root, "into-logs"), linkType);
  });

  test("files in the allowed folders are allowed", () => {
    for (const p of [
      path.join(retail, "Logs", "WoWCombatLog.txt"),
      path.join(retail, "Logs"),
      path.join(retail, "Logs") + path.sep,
      path.join(retail, "WTF", "Account", "ACC", "SavedVariables", "GuildGolem.lua"),
      path.join(retail, "Interface", "AddOns", "GuildGolem"),
    ]) {
      const d = decideAccess(SITE, p, config);
      assert.equal(d.allow, true, `${p}: ${d.reason}`);
    }
  });

  test("other files in the game folder are refused", () => {
    for (const p of [wow, retail, path.join(retail, "WTF"), path.join(retail, "Interface", "AddOns", "Other", "Other.lua"), root]) {
      assert.equal(decideAccess(SITE, p, config).allow, false, p);
    }
  });

  test("a flavor folder without .flavor.info is refused", () => {
    assert.equal(decideAccess(SITE, path.join(noMarker, "Logs", "WoWCombatLog.txt"), config).allow, false);
  });

  test("a junction out of Logs is refused", () => {
    assert.equal(decideAccess(SITE, path.join(retail, "Logs", "escape", "secret.txt"), config).allow, false);
    assert.equal(decideAccess(SITE, path.join(retail, "Logs", "escape"), config).allow, false);
  });

  test("a junction that only looks like the addon folder is refused", () => {
    assert.equal(decideAccess(SITE, path.join(retail, "Interface", "AddOns", "GuildGolemLink", "Other.lua"), config).allow, false);
  });

  test("a junction from outside into Logs is allowed, as the real folder", () => {
    assert.equal(decideAccess(SITE, path.join(root, "into-logs", "WoWCombatLog.txt"), config).allow, true);
  });

  test("a missing file is refused", () => {
    assert.equal(decideAccess(SITE, path.join(retail, "Logs", "nope.txt"), config).allow, false);
  });

  test("another origin is refused", () => {
    assert.equal(decideAccess("https://evil.example", path.join(retail, "Logs", "WoWCombatLog.txt"), config).allow, false);
  });

  test("cleanup", () => {
    fs.rmSync(root, { recursive: true, force: true });
  });
});
