# Guild Golem desktop app

A small desktop app for [Guild Golem](https://guildgolem.com), a guild management site for WoW Forever.

**On hold.** For now, the site does live logging in a browser tab, and plans to sync with the addon there too. Both
need the browser to keep one of the game's files open. Chrome and Edge refuse that for any file under Program Files,
where Battle.net installs the game by default, so the tab works only when the game is installed somewhere else. For a
default install, this app would be the way to do both. Nothing is built yet. This is the plan.

## What it would do

It would do what the browser tab does, without a tab left open and wherever the game is installed, plus a few things
a web page can't:

| Feature | What it means for a raider |
|---|---|
| Hands-free live logs | The addon turns combat logging on when you enter a raid. The app sees WoWCombatLog.txt grow and sends each pull to the guild's report |
| No copying and pasting | It writes the night's plan into the addon's saved file before you log in, and reads attendance, loot and the bank from it after you log out |
| Characters kept current | It reads gear, talents and professions from the addon's file when you log out, until Forever has an API for them |
| Log cleanup | Combat logs grow to gigabytes. Once a log is uploaded, it can archive or delete it, after asking |
| Kill screenshots | It offers the screenshot taken at a boss kill for the report |
| Alerts in the tray | Raid countdowns, invites starting, sign-up reminders, and answering from the tray |
| Addon installs and updates | One click |
| Uploads that survive a dropped connection | It picks up where it stopped |

## Limits

It only reads and writes files: the combat log, the addon's saved variables and screenshots. Reading the game's
memory, automating input or drawing over the game would break Blizzard's rules, and it won't do any of those.

## How it talks to the site

It uses the same API the browser tab uses for uploads and live logs, signed in with the player's Guild Golem account
(through Discord). It doesn't keep a copy of a log after sending it.

## Costs

- Windows code signing, about $10 a month. Without it, Windows warns people not to install the app.
- An Apple developer account, $99 a year, for a Mac version.
- Time for updates and support as the game client changes.

## Still to decide

- Tauri (small, written in Rust) or Electron (larger, all JavaScript).
- Windows first, or Windows and Mac together.

## Licence

There's no licence yet, so all rights are reserved.
