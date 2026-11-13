# Notes for Claude Code sessions on this repository

Gdex is the booking deck for music producers and bands: a plain web app (ES modules, no framework, no build step, no
external libraries in the app: Google's sign-in script is loaded from Google only when someone connects Google Drive)
that keeps everything in the browser's localStorage and works offline. A desktop app (`desktop/`, Electron) wraps the
same files. It is a sibling of Vdex, the videographer app in TheCrowBro/Logi-Video-Production-app-: it began as a copy
of Vdex's shell and shares its look, but the two share no code at run time and must never share storage. Do not change
Vdex from here.

## Before changing anything

- **Read `docs/developers.md`.** It is the contract: the data model, the page and booking-block contracts, the shared
  exports between features, which file belongs to which feature, styling rules and the tests.
- Use `js/model.js` for every music sum (deals, settlement, set lengths, durations, money formatting) and `js/store.js`
  for every write, so a number reads the same on every page.
- Storage keys, cache names and IndexedDB names start with `gdex-` (the IndexedDB database is `gdex`). Nothing of the
  person's goes to a server except: **Google Drive**, only when the person connects it (Google's sign-in script, loaded
  from Google only then; the whole Gdex database and daily dated copies, in a hidden Gdex folder of their own Drive,
  with the day their free days first started); and **Gdex's licence server** at gdex.crowmade.app
  (`cloudflare/worker.mjs`), only once licences are live (`LICENCE_SITES` in `js/licence-config.js`, `[]` until the
  owner publishes; `desktop/licence-on.json` for the desktop app) and only for the licence: a status question with
  nothing in it (at most every 6 hours, only from a browser that uses a working role, has started its free days or is
  signed in), the price for the country (when a Buy button shows, in the same cases), sign-in by email, a daily check
  when signed in, and the desktop app's code activation, weekly check and release. The only other network calls are
  OpenStreetMap's map tiles and address search, and the desktop app's update checks at the download address in
  `desktop/updater.cjs` (https://gdex-download.crowmade.app/). While licences are off nothing at all goes to the
  licence server, and the desktop app contacts nothing while its licence is off and Google Drive is not linked, but for
  those update checks once installed. A day sheet never carries money (deal, fees, settlement, budget). Never share a
  storage key, a licence key or prefix, a port, an app id, a download bucket or an update channel with Vdex.
- A page never compares `roleId()` to decide the licence: it asks `js/licence-state.js` (`mayOpen`, `mayWork`,
  `gateWork`, `canWrite`), and every write goes through the store, whose gate the licence installs.

## Checking your work

- `node tests/run.mjs` runs every browser spec (Playwright + Chromium); `node tests/run.mjs 35-` runs one. Every spec
  ends with "no errors in the console". Keep them all passing, and add checks for what you change.
- `GDEX_LICENCE=on node tests/run.mjs` runs every spec with licences live (CI runs both legs; `docs/developers.md`
  lists the specs that read differently). The licence's switches are the owner's: never change `js/licence-config.js`
  or `desktop/licence-on.json`.
- `npm ci --prefix cloudflare` once lets the licence server's specs (79, 81) run in Miniflare (CI does it; without it
  they say SKIP, and FAIL under CI). Set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` before `npm ci` unless you need the desktop
  app.
- The desktop app (`desktop/`, Electron; its Node files are CommonJS `.cjs`): `npm install`, then `npm start` runs it
  and `xvfb-run -a npm run test:desktop` runs its smoke test (`npm run test:desktop` on a computer with a screen; SKIP
  without Electron, FAIL under CI). Electron's binary is downloaded the first time it starts, not by `npm ci`.
  `docs/desktop.md` says how it is built, signed and, only when the owner says publish, released into Gdex's own bucket.
- After adding or removing a file, run `node tools/stamp-build.mjs --dev` and commit `sw.js` (the offline file list);
  CI fails otherwise. `node tools/prune-css.mjs` reports styles nothing uses.
- Look at what you change: screenshots at 420×900 in light and dark (localStorage `gdex-prefs` `{"scheme":"dark"}`).

## Publishing

Gdex's address is gdex.crowmade.app: a Cloudflare Worker (`cloudflare/`) serves the site and the licence server. The
desktop app's installers and updates go to the download address in `desktop/updater.cjs`. Nothing is published,
deployed, uploaded or released (the website, the Worker, the desktop app) without the owner's go-ahead;
`docs/go-live.md` is the owner's list, in order. A deploy always names its config (`npx wrangler deploy --config
wrangler.jsonc` in `cloudflare/`, as `.github/workflows/publish.yml` does after its guard): never add another Wrangler
command or config to a workflow. Before a release, `node tools/stamp-build.mjs` stamps the build so installed copies
update.
