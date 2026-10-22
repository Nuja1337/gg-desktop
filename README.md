# Guild Golem desktop app

A small desktop companion for [Guild Golem](https://guildgolem.com), the WoW Forever guild companion. **On hold**
(Oct 20): the site's browser tab does its first jobs today, live logging and, later, the addon's Sync. Nothing is
built yet; this is the plan.

## What it's for

Everything the browser tab can do, without a tab kept open, and what a page can't:

| Feature | What it gives a raider |
|---|---|
| Hands-free live logs | The addon turns combat logging on when you enter a raid; the app sees WoWCombatLog.txt grow and sends each pull to the guild's report, with no tab to keep open |
| No more paste strings | It writes the night's plan into the addon's saved file before you log in, and reads attendance, loot and the bank from it after you log out |
| Characters always current | Gear, talents and professions read from the addon's file at logout, until Forever has an API |
| Log housekeeping | Combat logs grow to gigabytes; it archives or clears them once uploaded, after asking |
| Kill screenshots | Offers the screenshot taken at a boss kill for the report |
| Alerts and a tray icon | Raid countdown, invites starting, sign-up reminders, and answering from the tray |
| Addon installs and updates | One click |
| Uploads that survive drops | Picks up again after a lost connection |

## Limits

It only ever reads and writes files: the combat log, the addon's saved variables, screenshots. Reading the game's
memory, automating input or drawing over the game would break Blizzard's rules, and it never does any of them.

## How it talks to the site

Through the same public API the browser tab uses for uploads and live logs, signed in with the player's Guild Golem
account (Discord). It keeps no copy of a log once it's sent.

## Costs to plan for

- Windows code signing, about $10 a month, or Windows warns people off installing it.
- Apple's developer account, $99 a year, if it runs on a Mac.
- Updates and support as the game client changes.

## Open choices

- Tauri (small, Rust) or Electron (larger, all JavaScript).
- Windows first, or Windows and Mac together.

## Licence

None yet: all rights reserved.
