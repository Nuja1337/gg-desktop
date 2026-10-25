import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decidePermission, type PermissionAsk } from "../src/permissions";
import type { FsLike } from "../src/allow";

const SITE = "https://guildgolem.com";
const WOW = "C:\\Program Files (x86)\\World of Warcraft";
const addon = `${WOW}\\_retail_\\Interface\\AddOns\\GuildGolem`;
const fs: FsLike = {
  realpath: (p) => p.replace(/[\\/]+/g, "\\").replace(/\\$/, ""),
  isFile: (p) => p.toLowerCase() === `${WOW}\\_retail_\\.flavor.info`.toLowerCase(),
};

// What Electron really sends: the origin as a URL with a slash, and no page for a file system grant.
const grant = (extra: Partial<PermissionAsk> = {}): PermissionAsk => ({
  permission: "fileSystem",
  requestingOrigin: "https://guildgolem.com/",
  topUrl: null,
  isMainFrame: true,
  fileAccessType: "readable",
  filePath: "C:\\Users\\Me\\Documents\\notes.txt",
  ...extra,
});
const clip = (extra: Partial<PermissionAsk> = {}): PermissionAsk => ({
  permission: "clipboard-sanitized-write",
  requestingOrigin: "https://guildgolem.com/",
  topUrl: "https://guildgolem.com/raids",
  isMainFrame: true,
  ...extra,
});

describe("file system access", () => {
  test("reads are granted to the site, with or without a page", () => {
    assert.equal(decidePermission(grant(), SITE, fs), true);
    assert.equal(decidePermission(grant({ topUrl: "https://guildgolem.com/x" }), SITE, fs), true);
    assert.equal(decidePermission(grant({ requestingOrigin: "https://guildgolem.com" }), SITE, fs), true);
  });

  test("another origin, or another top page, is refused", () => {
    assert.equal(decidePermission(grant({ requestingOrigin: "https://evil.example/" }), SITE, fs), false);
    assert.equal(decidePermission(grant({ requestingOrigin: undefined }), SITE, fs), false);
    assert.equal(decidePermission(grant({ topUrl: "https://evil.example/" }), SITE, fs), false);
    assert.equal(decidePermission(grant({ embeddingOrigin: "https://evil.example" }), SITE, fs), false);
  });

  test("writes only inside the addon's folder", () => {
    const write = (filePath?: string) => decidePermission(grant({ fileAccessType: "writable", filePath }), SITE, fs);
    assert.equal(write(`${addon}\\GuildGolem.lua`), true);
    assert.equal(write(`${WOW}\\_retail_\\Logs\\WoWCombatLog.txt`), false);
    assert.equal(write("C:\\Users\\Me\\Documents\\notes.txt"), false);
    assert.equal(write(undefined), false);
  });
});

describe("other permissions", () => {
  test("clipboard writes work from the site's page", () => {
    assert.equal(decidePermission(clip(), SITE, fs), true);
  });

  test("clipboard writes need the site's page, and the site's origin", () => {
    assert.equal(decidePermission(clip({ topUrl: null }), SITE, fs), false);
    assert.equal(decidePermission(clip({ topUrl: "https://evil.example/" }), SITE, fs), false);
    assert.equal(decidePermission(clip({ requestingOrigin: "https://evil.example/" }), SITE, fs), false);
  });

  test("everything else is refused, clipboard-read most of all", () => {
    const others = ["clipboard-read", "notifications", "fullscreen", "geolocation", "media", "midi", "display-capture", "openExternal", "unknown"];
    for (const permission of others) {
      assert.equal(decidePermission(clip({ permission }), SITE, fs), false, permission);
    }
  });
});
