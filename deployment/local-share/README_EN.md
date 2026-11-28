# PLAYFOOD — game and teacher Statistics Panel

Local review package: four islands, twelve games. Release details are in VERSION.json.

## Start

1. Extract the entire ZIP to a normal folder, such as Documents.
2. Install Node.js **22 or newer, below 27**, including npm, from https://nodejs.org/. Choose an LTS release in this range; Node 24 is the recommended default.
3. Mac: open START_MAC.command. Windows: open START_WINDOWS.cmd and choose Run if a Run/Cancel prompt appears for this file. Linux: `sh START_LINUX.sh`.
4. The first start installs the locked server dependencies. It needs Internet access to **registry.npmjs.org** and **github.com** (including GitHub release downloads for the SQLite native binary). A blocked GitHub download may trigger a native compilation that needs additional build tools, especially on Windows. Ask IT to allow the downloads before retrying.
5. Wait for **PLAYFOOD is ready**. Open the game and panel URLs printed in that window. The supplied default is http://127.0.0.1:5177/ and http://127.0.0.1:5177/panel.
6. The local teacher credentials are in LOCAL_PANEL_LOGIN.txt. Keep the terminal window open; Ctrl+C stops the server.

### Mac security prompt / Terminal fallback

If macOS blocks the downloaded command, open **System Settings > Privacy & Security** and, if shown for START_MAC.command, choose **Open Anyway**. Approve this specific file only if you trust the package sender.

You can instead open Terminal, type `cd ` (including the space), drag the extracted package folder into Terminal, press Enter, then run:

```sh
node start-local.mjs
```

On Windows, the same command works from a terminal opened in the extracted folder. Do not open client/dist/index.html directly.

## Playing and statistics

No separate database installation is needed. A new SQLite database is created in server/playfood.db. The panel starts empty and records this package's gameplay; it has not been filled with synthetic statistics. After playing, refresh the panel. CSV export and browser Print / Save as PDF are available.

Read DATA_COLLECTION_EN.md or the EN/EL data note linked from the panel for identifiers, event fields, purpose, retention and how to disable collection. This local review package explicitly enables collection into its own local database. It does not send gameplay statistics to a hosted project server.

Progress is kept in your browser for the exact host and port. Keep using the same printed URL and browser. Switching browser, private mode, host or port uses a separate progress profile. SQLite statistics survive a server restart.

Play Code save/restore works normally. LOCAL_PHYGITAL_CODES.txt contains local activity codes with the existing reward rules.

## Update an earlier local package

These steps are for the local Node.js package, not a PHP hosting installation.

1. Save a Play Code from each browser profile you want to keep. Stop the earlier package with Ctrl+C, wait for it to finish, and back up its entire extracted folder. Do not delete it.
2. Extract the new ZIP into a separate folder. Do not start it yet and do not extract over the earlier installation.
3. Copy `server/playfood.db`, plus `server/playfood.db-wal` and `server/playfood.db-shm` if present, from the stopped installation into the new package's `server` folder. Copy `server/users.txt` and `server/phygital-codes.json` too. Keep the database and any sidecars together. Do not copy `node_modules` or overwrite the new application files.
4. Preserve your settings with one necessary key change. First note the **new** `PANEL_SECRET` from the new package's `server/playfood.config.txt` privately. Copy your **old** `server/playfood.config.txt` into the new package, then replace only its `PANEL_SECRET` value with that new value. Keep the new `client/.env.local` unchanged. The supplied client was built with the new key, so retaining the old key without rebuilding would stop statistics recording. Keep your existing `PORT`, collection setting, timezone, retention and other settings.
5. Your existing panel accounts and activity codes remain in the copied files. The new package's `LOCAL_PANEL_LOGIN.txt` lists its fresh-install default, which no longer applies after copying `users.txt`. Keep your earlier login and code notes, including `LOCAL_PHYGITAL_CODES.txt` if applicable, as your reference.
6. Start the new package. Use the **same host, port and browser profile** as before, such as `http://127.0.0.1:5177/`. Refresh the game without clearing site data. Check your progress, sign in to the panel with your existing account, check the earlier statistics, then play once and confirm that the panel records the new gameplay.

Only one package may run on that port at a time. If a check fails, stop the new package and restart the untouched earlier folder. Keep both folders for investigation. Any statistics recorded after the upgrade stay in the new folder and are not automatically merged back.

## Troubleshooting

- Check `node -v`: the major version must be 22, 23, 24, 25 or 26. Prefer an LTS release.
- A port conflict means another server is already using the port. Stop the earlier package with Ctrl+C, or change PORT in server/playfood.config.txt and use the newly printed URLs.
- If you rebuild the client, keep client/.env.local VITE_PANEL_SECRET equal to PANEL_SECRET in server/playfood.config.txt. Normal startup does not rebuild the client.
- Dependency security is checked when the package is prepared. Installation suppresses routine audit/funding messages; this is not itself a security fix.

The installed game uses local fonts, audio and certificate assets. Publisher source links open external websites only when requested. NL/PT texts remain partner drafts. This is a local review build, not a published release.
