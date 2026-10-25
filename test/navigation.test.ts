import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEV_SITE_ORIGIN, SITE_ORIGIN, isDiscordAuthUrl, isExternalOk, isInAppUrl, isSiteUrl, originOf } from "../src/navigation";

describe("in-app addresses", () => {
  test("the site's own pages", () => {
    for (const u of ["https://guildgolem.com", "https://guildgolem.com/", "https://guildgolem.com/raids?x=1#y"]) {
      assert.equal(isInAppUrl(u, SITE_ORIGIN), true, u);
    }
  });

  test("lookalikes are not the site", () => {
    for (const u of [
      "http://guildgolem.com/",
      "https://guildgolem.com.evil.example/",
      "https://evil.example/https://guildgolem.com/",
      "https://guildgolem.com@evil.example/",
      "https://evil@guildgolem.com/",
      "https://guildgolem.com:444/",
      "https://dev.guildgolem.com/",
      "https://www.guildgolem.com/",
      "javascript:alert(1)",
      "file:///C:/",
      "not a url",
    ]) {
      assert.equal(isSiteUrl(u, SITE_ORIGIN), false, u);
    }
  });

  test("the dev build loads the dev site, not the live one", () => {
    assert.equal(isSiteUrl("https://dev.guildgolem.com/x", DEV_SITE_ORIGIN), true);
    assert.equal(isSiteUrl("https://guildgolem.com/x", DEV_SITE_ORIGIN), false);
  });

  test("Discord sign-in pages", () => {
    for (const u of [
      "https://discord.com/oauth2/authorize?client_id=1&scope=identify",
      "https://discord.com/oauth2/authorized",
      "https://discord.com/api/oauth2/authorize?client_id=1",
      "https://discord.com/login?redirect_to=%2Foauth2%2Fauthorize",
    ]) {
      assert.equal(isDiscordAuthUrl(u), true, u);
      assert.equal(isInAppUrl(u, SITE_ORIGIN), true, u);
    }
  });

  test("other Discord pages and lookalikes are not sign-in pages", () => {
    for (const u of [
      "https://discord.com/",
      "https://discord.com/channels/1/2",
      "https://discord.com/oauth2",
      "https://discord.com/loginx",
      "https://discord.com/api/users/@me",
      "http://discord.com/login",
      "https://discord.com.evil.example/login",
      "https://discord.com:8443/login",
      "https://evil@discord.com/login",
      "https://discordapp.com/login",
      "https://www.discord.com/login",
    ]) {
      assert.equal(isDiscordAuthUrl(u), false, u);
    }
  });
});

describe("addresses for the user's browser", () => {
  test("only https", () => {
    assert.equal(isExternalOk("https://example.com/a"), true);
    for (const u of ["http://example.com", "file:///C:/Windows/System32/calc.exe", "javascript:alert(1)", "ms-msdt:/id", "steam://run/1", "", "https://"]) {
      assert.equal(isExternalOk(u), false, u);
    }
  });
});

describe("originOf", () => {
  test("reads the origin or returns null", () => {
    assert.equal(originOf("https://guildgolem.com/a/b?c"), "https://guildgolem.com");
    assert.equal(originOf("about:blank"), null);
    assert.equal(originOf("nonsense"), null);
  });
});
