# Notes for Claude Code sessions on this repository

Gdex is the booking deck for music producers and bands: a plain web app (ES modules, no framework, no build step, no
external libraries) that keeps everything in the browser's localStorage and works offline. It is a sibling of Vdex, the
videographer app in TheCrowBro/Logi-Video-Production-app-: it began as a copy of Vdex's shell and shares its look, but
the two share no code at run time and must never share storage. Do not change Vdex from here.

## Before changing anything

- **Read `docs/developers.md`.** It is the contract: the data model, the page and booking-block contracts, the shared
  exports between features, which file belongs to which feature, styling rules and the tests.
- Use `js/model.js` for every music sum (deals, settlement, set lengths, durations, money formatting) and `js/store.js`
  for every write, so a number reads the same on every page.
- Storage keys, cache names and IndexedDB names start with `gdex-`. Nothing is sent to a server; the only network calls
  are OpenStreetMap's map tiles and address search. A day sheet never carries money (deal, fees, settlement, budget).

## Checking your work

- `node tests/run.mjs` runs every browser spec (Playwright + Chromium); `node tests/run.mjs 35-` runs one. Every spec
  ends with "no errors in the console". Keep them all passing, and add checks for what you change.
- After adding or removing a file, run `node tools/stamp-build.mjs --dev` and commit `sw.js` (the offline file list);
  CI fails otherwise. `node tools/prune-css.mjs` reports styles nothing uses.
- Look at what you change: screenshots at 420×900 in light and dark (localStorage `gdex-prefs` `{"scheme":"dark"}`).

## Publishing

Gdex is not published yet. It needs an address of its own (for example gdex.crowmade.app): served under the same
address as Vdex, Vdex's service worker would clear Gdex's offline copy and could answer its pages. Before a release,
`node tools/stamp-build.mjs` stamps the build so installed copies update. Ask the owner before publishing anything.
