# PLAYFOOD Archipelago

PLAYFOOD Archipelago is a browser game for pupils aged 9 to 14. Its twelve missions cover where food grows, local and seasonal food, food waste, and the links between food, climate and the circular economy. The game is available in English, Dutch, Greek and Portuguese. Pupils play without accounts and can use a Play Code to carry their progress to another browser.

## Play online

Play at [playfood.enchatted.com](https://playfood.enchatted.com/). The game runs in any up-to-date browser on a laptop, desktop or tablet. Nothing needs to be installed.

## Download and install

Schools and institutions can run their own copy on Apache hosting with cPanel. The host needs PHP 8.2 or later (8.4 recommended) with PDO SQLite, a valid HTTPS certificate and a domain or subdomain for the game alone. The game will not work from a subfolder.

1. Download [PLAYFOOD_Archipelago_cPanel_Upload.zip](https://github.com/enchatted/playfood_enchatted/releases/latest/download/PLAYFOOD_Archipelago_cPanel_Upload.zip) and extract it on your computer.
2. In cPanel File Manager, select **Settings > Show Hidden Files**. Upload everything inside `UPLOAD_CONTENTS` directly into the domain's document root, which is often `public_html`. Include the hidden `.htaccess` files.
3. Open `https://YOUR_DOMAIN/setup.php`. Follow `READ_ME_FIRST.txt` in the download to find the installation key, then choose a staff email, a password and the school's time zone. Select **Install PLAYFOOD**.
4. Delete `setup.php` from the document root. Open `https://YOUR_DOMAIN/` and play a mission to check that the game works.

The D5 Technical Documentation covers updates, backups, Activity Codes, a Node edition and a local test installation.

## Guides

| Guide | For |
| --- | --- |
| [Quick-Start Guide for Teachers](https://github.com/enchatted/playfood_enchatted/releases/latest/download/PLAYFOOD_D4_Quick-Start_Guide_for_Teachers.pdf) | Teachers preparing a lesson |
| [Quick-Start Guide for Students](https://github.com/enchatted/playfood_enchatted/releases/latest/download/PLAYFOOD_D4_Quick-Start_Guide_for_Students.pdf) | Pupils playing for the first time |
| [D5 Technical Documentation](https://github.com/enchatted/playfood_enchatted/releases/latest/download/PLAYFOOD_D5_Technical_Documentation.pdf) | Technicians installing and maintaining the game |

## What is in the game

The archipelago has four islands. Each island has three missions that move from a short introduction to practice and then a challenge.

| Island | Missions |
| --- | --- |
| The Magic Garden Island | The Food's Journey, The Little Gardener, Earth Doctor |
| The Island of Seasons | The Season Clock, The Green Basket, The Food Detective |
| The Green Rescue Island | Fridge Guardians, The Chef's Menu, Culinary Rescue |
| Earth Protectors Island | The Super Bin, The Smart Neighbourhood, Planet in Harmony |

After all twelve missions, pupils return to the Lighthouse to receive their completion certificate. Teachers can give out Activity Codes for offline class activities, which pupils enter in the Lighthouse postbox for extra points. Facts in the game link to their published sources, which pupils can open from each mission.

## Statistics Panel

An installation can collect play statistics for its own staff. They record game activity under a random browser ID, without names, email addresses or free text. Collection is off until the installer enables it during setup. Staff sign in at `/panel/` on the installation to view and filter the figures, download a CSV file or print a report. Each installation keeps its own data, and nothing is sent to ENCHATTED or anyone else. Read [PLAYFOOD_Data_Collection_Note.md](PLAYFOOD_Data_Collection_Note.md) before enabling statistics.

## Development

| Folder | Contents |
| --- | --- |
| `client/` | React and Canvas game, translations, assets and client tests |
| `server/` | Node edition with a Fastify API, SQLite storage and the staff panel |
| `server-php/` | PHP edition, cPanel upload builder and tests |
| `deployment/` | Hosting examples and deployment checks |

You need Node.js 22 or 24 LTS and npm. If you use nvm, run `nvm install` and `nvm use` from the project root to select the version in `.nvmrc`.

Run the game locally from the project root and open the address printed by Vite.

```sh
npm --prefix client ci --include=dev
npm --prefix client run dev
```

Build the game and serve it with the Node edition.

```sh
npm --prefix client run build
npm --prefix server ci
npm --prefix server start
```

Build the cPanel upload package. It needs `find`, `chmod` and `zip` on the build computer.

```sh
node server-php/build-package.mjs ./php-output
```

The package it writes, `PLAYFOOD_Archipelago_cPanel_Upload.zip`, has the same contents as the one attached to the latest release.

Run the tests after installing the dependencies.

```sh
npm --prefix client test
npm --prefix server test
node --test server-php/tests/package.test.mjs
```

## Licence

The source code is available under the MIT licence. See [LICENSE](LICENSE). Third-party fonts and audio carry their own licences.

## Funding

Developed by ENCHATTED P.C. for PLAYFOOD under EU Grant Agreement No. 101196354.

Co-funded by the European Union. Views and opinions expressed are however those of the author(s) only and do not necessarily reflect those of the European Union. Neither the European Union nor the granting authority can be held responsible for them.
