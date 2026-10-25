// Which addresses the window may show. Everything else goes to the user's browser, or is dropped.

/** The two sites the app can load. */
export const SITE_ORIGIN = "https://guildgolem.com";
export const DEV_SITE_ORIGIN = "https://dev.guildgolem.com";

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function originOf(url: string): string | null {
  const u = parse(url);
  return u && u.origin !== "null" ? u.origin : null;
}

/** True for a page on the site's own origin (https, default port, no credentials in the address). */
export function isSiteUrl(url: string, siteOrigin: string): boolean {
  const u = parse(url);
  return !!u && u.protocol === "https:" && u.origin === siteOrigin && !u.username && !u.password;
}

/** True for the Discord pages the sign-in flow uses. */
export function isDiscordAuthUrl(url: string): boolean {
  const u = parse(url);
  if (!u || u.protocol !== "https:" || u.hostname !== "discord.com" || u.port || u.username || u.password) return false;
  return u.pathname === "/login" || u.pathname.startsWith("/oauth2/") || u.pathname === "/api/oauth2/authorize";
}

/** True if the window itself may go to this address. */
export function isInAppUrl(url: string, siteOrigin: string): boolean {
  return isSiteUrl(url, siteOrigin) || isDiscordAuthUrl(url);
}

/** True if the address is safe to hand to the user's browser: https only. */
export function isExternalOk(url: string): boolean {
  const u = parse(url);
  return !!u && u.protocol === "https:" && !!u.hostname;
}
