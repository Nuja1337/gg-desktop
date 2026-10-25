# Guild Golem desktop app

A small desktop app for [Guild Golem](https://guildgolem.com), a guild management site for WoW Forever.

## Status

Version 1 is built. It is an unsigned beta, so Windows will warn before it installs. Windows only.

The site does live logging in a browser tab, and plans to sync with the addon there too. Both need the browser to keep
one of the game's files open. Chrome and Edge refuse that for any file under Program Files, where Battle.net installs
the game by default, so the tab works only when the game is installed somewhere else. This app is the fix for a
default install.

## What it does

It is the site, https://guildgolem.com, in its own window. It loads the live site, so each site update reaches the app
without a new install, and the site's own Go live card works as it does in a browser. The app has no copy of the log
parser, no server API of its own and no separate sign-in. You sign in with Discord on the site.

The one change from a browser is that it lifts Chromium's block on Program Files for the game's own folders. It also:

- Keeps running when you close the window. The tray icon has Open and Quit, and Quit asks first if the site says a live
  log is running.
- Keeps reading while the window is hidden, since a raid runs for hours.
- Runs one copy. Starting it again brings the open window forward.
- Keeps your Discord sign-in in its own storage, apart from your browser's.

## What it allows and refuses

When the site asks to open a file or folder that Chromium blocks, the app allows it only when all of these hold:

- The request comes from https://guildgolem.com. The dev build trusts https://dev.guildgolem.com instead.
- The path, after every link and junction is resolved, is inside one of these folders of a game version:
  - `Logs`
  - `WTF\Account\SavedVariables`, `WTF\Account\<account>\SavedVariables` and
    `WTF\Account\<account>\<realm>\<character>\SavedVariables`
  - `Interface\AddOns\GuildGolem`
- The game version's folder (`_retail_`, `_classic_`, `_classic_beta_` and so on) is directly inside a folder named
  `World of Warcraft` and holds a `.flavor.info` file. A folder's name alone is not enough.

It refuses everything else: other sites, a whole drive, the `World of Warcraft` folder itself, a game version's folder
itself, the rest of the game's files, network (UNC) paths, paths with `..`, and a link in `Logs` that points
somewhere else. When the site asks for a folder it refuses, the app says which folders it opens. The rule is in
[src/allow.ts](src/allow.ts) and its tests are in [test](test).

Everything it opens is read-only, except the `Interface\AddOns\GuildGolem` folder, where the site may also write.

The window itself is locked down:

- It stays on the site and on Discord's sign-in pages. Any other link opens in your browser, if it is an https link,
  and never in the app.
- It has no preload script and no Node access, and the page runs sandboxed.
- It denies every page permission except file access and copying text to the clipboard. The page can't read the
  clipboard.
- The installed app turns off Electron's Node run mode, its Node environment variable and inspector arguments, and
  loads its code only from its own archive (the asar file), which it checks against a stored hash.

### One check turned off

Chromium 156 also checks each file and folder inside a folder you have picked against its own block list, and it does
this without asking the app. Under Program Files that makes a picked `Logs` folder look empty and its files
unreadable. So the app turns off two of these checks, `FileSystemAccessDirectoryIterationBlocklistCheck` and
`FileSystemAccessWriteBlocklistCheck`. The cost: if someone plants a link or junction inside a folder you already
picked, and it points somewhere else, Chromium no longer catches it. Only someone who can already write to your game's
folders can plant one. The rule above still decides which folders the site can pick in the first place.

## Run it from source

You need Node 22 or newer. Then:

```
npm install
npm test
npm start
```

`npm start` opens the live site. `npm run start:dev` opens https://dev.guildgolem.com, with its own sign-in storage.
Setting `GG_DESKTOP_DEV=1` does the same as the dev script. Dev mode works only when run from source: an installed app
always loads the live site. `npm run build` compiles to `dist`, and `npm run dist` makes the Windows installer in
`release`. The workflow in `.github/workflows/build.yml` runs the tests and builds the installer on every push and pull
request, and keeps the installer as a download on the run for pushes to main and for tags.

## Planned

Version 1 does what the browser tab does, without a tab left open and wherever the game is installed. These are next,
and none of them is built:

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

It is the site. Uploads and live logs use the same API and the same Discord sign-in as the browser tab. It doesn't keep
a copy of a log after sending it.

## Costs

- Windows code signing, about $10 a month. Without it, Windows warns people not to install the app.
- An Apple developer account, $99 a year, for a Mac version.
- Time for updates and support as the game client changes.

## Still to decide

- Whether to sign the Windows installer before the first release.
- Whether to make a Mac version.

## Problems and ideas

Open an [issue](../../issues) here and pick "An idea", or use Feedback on any page of
[guildgolem.com](https://guildgolem.com).

## License

All rights reserved. The app is free to download and use for your own raids, and you may read and change its code
for yourself. You may not redistribute it. The full terms are in [LICENSE](LICENSE).
