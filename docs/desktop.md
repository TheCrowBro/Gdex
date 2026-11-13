# Gdex for Windows, Mac and Linux: the desktop app

The desktop app is Gdex's web app in a window of its own (Electron). Nothing in the web app is rewritten for it: the
main process (`desktop/main.cjs`) serves the same files from a small web server on this computer and opens them at
`http://localhost:47861/`, so saved data, the microphone, the File System Access API and Google's sign-in work exactly
as they do in Chrome. Nothing here is published until the owner says so; this page says how, when that time comes.

| File | What it does |
|---|---|
| `desktop/main.cjs` | the local server, the window, the menu, links and pop-ups, permissions, Google's sign-in page, the test hooks |
| `desktop/preload.cjs` | the bridge the page sees, `window.gdexDesktop`: updates, `googleSignIn`, the licence. Nothing else from Node |
| `desktop/licence.cjs` | the licence: 30 free days from the first use of a working role, codes, activation on up to 3 computers |
| `desktop/licence-codes.cjs` | the code format and signatures (shared with the licence server and the owner's generator page) |
| `desktop/licence-keys.json` | the owner's public licence keys: `{}` until the owner makes them |
| `desktop/licence-on.json` | the desktop's licence switch: `{ "on": false }` until a release the owner approves |
| `desktop/updater.cjs` | updates from `https://gdex-download.crowmade.app/` (electron-updater) |
| `desktop/sync-version.mjs` | copies `VERSION` from `js/version.js` into `package.json` (`npm start` and `npm run dist` run it) |
| `desktop/build/` | the Mac entitlements, and `icon.png` (1024×1024, drawn from `icons/icon.svg` by `make-icon.mjs`) |
| `package.json` → `build` | electron-builder's settings: app id `app.gdex.desktop`, the files packed, the installers, the update address |
| `.github/workflows/desktop.yml` | builds the installers, by hand only, and uploads nothing |
| `tests/desktop.mjs` | the smoke test (below); `tests/specs/85-desktop-licence.cjs` and `86-download-page.cjs` |

All of the Node files are CommonJS named `.cjs`, because `package.json` says `"type": "module"`.

## Running it

```sh
npm install          # Electron itself is downloaded the first time it starts
npm start            # sync-version, then `electron .`
```

A development run uses the same data folder as an installed Gdex (below) unless `GDEX_TEST_PROFILE` names another.
Settings → About says "A development copy: updates are only looked for in the installed app."

## The smoke test

```sh
xvfb-run -a npm run test:desktop     # Linux without a screen (CI's "desktop" job does this)
npm run test:desktop                 # on a computer with a screen
```

It starts a stand-in for the licence server on `127.0.0.1`, launches the app three times with temporary data folders, and
checks: the address and the name; the bridge's members; updates (`dev`), no service worker, Install hidden; the
licence following the two switches (off in the repository: nothing asked, not even the price); the spellchecker off
(Windows and Linux); the microphone allowed and the camera refused; location refused (Windows and Linux); the screen
wake lock; Google's sign-in page (served once, nonce CSP, the page's key and the origin checked, only the
`drive.appdata` scope, the token handed back, then gone); that the app's files answer 403 to anything but its own
window, that `/licence/…` is a JSON 404 and `/sw.js` a 404; that typing and opening every section contacts nothing but
this computer; links to mail and the shop opening outside; no console errors. "Contacts nothing" is checked twice: the
window's own requests (`GDEX_TEST_NET_WATCH`), and everything Chromium's network stack tries, through a recording proxy
on this computer (`--proxy-server`) that refuses every outside address and forwards nothing. The second matters:
Electron's own downloads (spellchecker dictionaries, the location service) never pass the window's request hooks. The
second and third launches switch licences on with throw-away keys and check that the free days start only when the
page asks, are mirrored in `desktop-state.json` (deleting `licence.json` brings them back from there), take an earlier
start from Google Drive, and that the price comes from the licence server. Without Electron installed it prints SKIP;
with the `CI` variable set it fails instead.

The test hooks are read only by a development run, never by an installed app:

| Variable | Effect |
|---|---|
| `GDEX_TEST_PROFILE` | a data folder of its own |
| `GDEX_TEST_NO_BROWSER` | addresses that would open in the web browser (Google's sign-in, the shop, mail links) are only recorded, in `global.__gdexLastExternal` |
| `GDEX_TEST_NET_WATCH` | every host the window asks for (`global.__gdexHosts`) and every permission asked and its answer (`global.__gdexPermissions`) |
| `GDEX_LICENCE_SITE` | the licence server's address, only `http://127.0.0.1:<port>` or `http://localhost:<port>` |
| `GDEX_TEST_LICENCE_KEYS` | public keys as JSON: licences on, with these keys, whatever `desktop/licence-on.json` says |

## The address, and why it never changes

The app runs at `http://localhost:47861`. The address is where Chromium keeps the app's saved data, and it is one of the
JavaScript origins of Gdex's Google sign-in client, so **once a version is released it never changes**: a new port would
look like an empty Gdex and break Google Drive. When another program holds 47861 at start, Gdex waits a few seconds,
then opens at the first free port up to 47880 with a warning that the saved data comes back once that program closes;
Google's sign-in is refused there (Google knows only 47861). Vdex uses 47831-47850, so the two never meet.

The server answers only Gdex's own window: each run makes a random key that the main process adds to every request of
the window (`X-Gdex-App`), and anything without it gets 403 "Open Gdex from its desktop app." So the same address
opened in a web browser loads nothing. The exceptions: Google's sign-in page (`/__gdex/google`, its own one-time
keys), `/licence/…` (a JSON 404: the licence server is the website's) and `/sw.js` (a 404: the offline worker is the
website's only). A request addressed to any other host name is refused too.

Where the data lives (`productName` decides the folder): `%APPDATA%\Gdex` on Windows, `~/Library/Application
Support/Gdex` on a Mac, `~/.config/Gdex` on Linux. Uninstalling keeps it (`deleteAppDataOnUninstall: false`). Next to
Chromium's own files are `licence.json` (`{ install, first?, seen, code?, enteredAt?, graceFrom?, act? }`) and
`desktop-state.json` (the window's size and place, and `licence: { first, seen, graceFrom? }`, the copy that keeps the
free days, and the start of the 14 days below, when `licence.json` is deleted).

## What it sends, and to whom

- Nothing but the update check (last below), for someone who never links Google Drive and while licences are off.
  - The spellchecker is the Mac's own on a Mac. On Windows and Linux it is off with no languages
    (`setSpellCheckerLanguages([])` at start, `noDictionaries` in `main.cjs`): Electron's session otherwise downloads
    Hunspell dictionaries from Google (redirector.gvt1.com) at every start, even with `spellcheck: false` in the
    window's settings.
  - Location ("I'm here now" on a venue) works on a Mac only, where the system finds it. On Windows and Linux it is
    refused: Chromium would ask Google's location service (www.googleapis.com), which also needs a Google key Gdex does
    not have. "Find from address" (OpenStreetMap) and a pasted map link still fill a venue's place there.
- Google, only after "Connect Google Drive…": the sign-in opens in the person's web browser at the app's address, and
  the Drive files go to Google's Drive API from the window.
- The licence server at `https://gdex.crowmade.app`, only with licences on: the price for the Buy button, activating a
  code (the code, a random install id, "Mac", "Windows" or "Linux"), a check about once a week, and releasing.
- Updates: an installed app asks `https://gdex-download.crowmade.app/` for `latest*.yml` a few seconds after it starts
  and every 4 hours, and downloads a new version from there.

## The licence in the desktop app

Off while `desktop/licence-on.json` is `{ "on": false }` **or** `desktop/licence-keys.json` has no key 1: the state is
`off`, every role can change things, and nothing is asked of the licence server. There is no "early user" free for good,
as Vdex has: a later version with licences on starts everyone at "free days not started" (`unstarted`). The free days
start when the page asks (`licence.start()`: a working role or section used for the first time), and an earlier start
on the same Google Drive is taken with `licence.adopt(t)`. A device clock more than a day out reads as `clock`
(read-only) until it is right or the licence server's time puts the record right.

A code entered while the licence server cannot be reached is `pending`: it works for 14 days, then is read-only once a
check made after them has failed. Those 14 days come **once per computer** (`graceFrom`): Remove the code keeps their
start, so entering the same code again, or another one, gives no new days, and blocking gdex.crowmade.app buys 14 days
at most; the 3 computers and a refund still count. Only the server's yes for this computer (the code activated) clears
it, so a code entered with no internet after that has its own 14 days. These 14 days and the 90 days a licensed
computer may go without reaching the server count with the latest time Gdex has seen, as the free days do, and a check
that fails never moves the last try back, so winding the clock back gains nothing. `85-desktop-licence` checks both.

**Switching it on** is part of a release, never a commit on its own, and only once the shop is open (`docs/go-live.md`,
step (e)):

1. The owner's public keys are in `desktop/licence-keys.json` (and `node tools/licence-keys.mjs` has written
   `js/licence-keys.js`). Committing them switches nothing on.
2. In the release commit, `desktop/licence-on.json` becomes `{ "on": true }`, and the expectation in
   `tests/specs/07-groundwork.cjs` changes with it (`docs/go-live.md` gives the line).
3. The build workflow refuses a build with the switch on and no key 1, and its summary says whether the licence is on.

## Building the installers

On GitHub: **Actions → Build desktop installers → Run workflow**. It builds on Windows, macOS and Ubuntu and keeps the
results as the run's Artifacts for 3 days (`gdex-windows-latest`, `gdex-macos-latest`, `gdex-ubuntu-latest`):
`Gdex-Setup-<version>.exe` and its `.blockmap`, `Gdex-<version>.dmg`, `Gdex-<version>.zip` (what a Mac updates from)
and their blockmaps, `Gdex-<version>.AppImage`, and `latest.yml`, `latest-mac.yml`, `latest-linux.yml`. It uploads
nothing anywhere.

On a computer: `npm run dist` builds for that computer's system into `dist/` (`npm run dist -- --linux --dir` makes an
unpacked folder only, quickest for a look). The version is `VERSION` in `js/version.js`: change it there.

## Signing (optional)

Unsigned installers work: Windows shows "Windows protected your PC" (More info → Run anyway) and a Mac needs System
Settings → Privacy & Security → Open Anyway; an unsigned Mac app cannot update itself (it says when a new version is
out, with a link to the download page). The workflow signs on its own once these are in the Gdex repository on GitHub.
The same Apple Developer ID and the same Azure certificate profile that sign other apps can sign Gdex: no second fee.

**Where the secrets go: the protected Environment `gdex-sign`, never repository secrets.** They can sign any app as you,
Vdex's included (`docs/licence-server.md`, "What each key can reach"), and repository secrets can be read by a workflow
on any branch pushed to the repository. So: Settings → Environments → **New environment `gdex-sign`**, required
reviewer: you, deployment branches: `main` only; put each secret below in that Environment (the variables, which are
not secret, can stay repository variables). The build job (`.github/workflows/desktop.yml`) names that Environment, so
every run waits for your approval, and a run on any branch but `main` stops before it builds.

**Mac** (Apple Developer Program, 99 USD a year):

1. Enroll at developer.apple.com/programs/enroll (an Apple Account with two-factor authentication and the developer's
   legal name, which is shown as the developer).
2. Certificates, IDs & Profiles → Certificates → + → **Developer ID Application**, from a certificate signing request
   (Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority). Export it with its
   private key from Keychain Access as a `.p12` with a password, then as text: `base64 -i cert.p12 | pbcopy`.
3. account.apple.com → Sign-In and Security → App-Specific Passwords → one named "Gdex notarize". The Team ID is under
   Membership details on developer.apple.com.
4. Secrets in the Environment `gdex-sign`: `MAC_CERT_P12` (the base64 text), `MAC_CERT_PASSWORD`, `APPLE_ID` (the Apple
   Account's address), `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID`.

**Windows** (Azure Artifact Signing, 9.99 USD a month):

1. portal.azure.com → a Pay-As-You-Go subscription (an Individual billing account with the legal name and address as on
   a photo ID).
2. Subscriptions → Resource providers → **Microsoft.CodeSigning** → Register. Then **Artifact Signing Accounts →
   Create** (a resource group, an account name, region West US 2, pricing Basic).
3. In the account: Access control (IAM) → **Artifact Signing Identity Verifier** for yourself; Objects → Identity
   validations → Individual → New identity → Public, and finish the ID check in Microsoft Authenticator.
4. Objects → Certificate profiles → Create → **Public Trust** (street address and postal code unticked). Note the CN
   shown: it is the publisher name.
5. Microsoft Entra ID → App registrations → New registration (e.g. `gdex-github-signing`) → copy the client and tenant
   ids → Certificates & secrets → New client secret (24 months). In the signing account: Access control (IAM) →
   **Artifact Signing Certificate Profile Signer** → that app.
6. Secrets in the Environment `gdex-sign`: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`; repository variables
   `AZURE_SIGNING_ENDPOINT` (e.g. `https://wus2.codesigning.azure.net`), `AZURE_SIGNING_ACCOUNT`,
   `AZURE_SIGNING_PROFILE` and `AZURE_SIGNING_PUBLISHER` (the CN).
7. Calendar reminders: renew the client secret after 23 months, and the identity check when Microsoft asks.

Even signed, a new Windows app shows a milder "not commonly downloaded" prompt until enough people have installed it.

## The download address: Gdex's own bucket

Installers and update files go in a Cloudflare R2 bucket of Gdex's alone, **`gdex-downloads`**, with the custom domain
**`gdex-download.crowmade.app`** (the owner's answer: never Vdex's bucket or download.crowmade.app). The address is in
four places that `86-download-page` keeps equal: `FEED` in `desktop/updater.cjs`, `build.publish[0].url` in
`package.json`, and the three links of `download.html`. It is built into every desktop app for good, so it is settled
before the first release.

1. dash.cloudflare.com → Storage & databases → R2 → **Create bucket** `gdex-downloads` (location Automatic, Standard).
2. In the bucket: Settings → Custom Domains → Add → `gdex-download.crowmade.app` → Connect, and wait for **Active**.
   Leave the r2.dev address off.
3. Uploads by hand: the R2 dashboard (Objects → Upload), or `npx wrangler r2 object put gdex-downloads/<name> --file
   <file> --remote --content-type … --cache-control …` from the owner's own computer, signed in with `npx wrangler
   login`. If uploads from GitHub are wanted later, an R2 API token scoped to the bucket `gdex-downloads` only (R2 →
   Manage API tokens → Object Read & Write → Apply to specific buckets only), which can never touch Vdex's files.

## Releasing, when the owner says publish

Gdex's website must be live first (share links, the download page, the licence server and Google's sign-in all point
at gdex.crowmade.app).

1. **The version.** Raise `VERSION` in `js/version.js` (a version once uploaded is never uploaded again: installers are
   cached for a year, and a second copy under the same version breaks updates' checksums). Tag the commit `v<VERSION>`
   if a tag is wanted: it must equal `VERSION`.
2. **The licence switch**, if this release turns the desktop licence on: `desktop/licence-on.json` `{ "on": true }` in
   this commit, as above.
3. **Build**: Actions → Build desktop installers → Run workflow, on that commit. Download the three Artifacts and check
   each `latest*.yml` says `version: <VERSION>`.
4. **Upload, in this order**, so an installed app never sees a version whose files are not there yet:
   1. this version's files: `Gdex-Setup-<V>.exe`, `Gdex-<V>.dmg`, `Gdex-<V>.zip`, `Gdex-<V>.AppImage` and every
      `.blockmap`, with Cache-Control `public, max-age=31536000, immutable`;
   2. the fixed names the download page links, copies of the same files: `Gdex-Setup.exe`, `Gdex.dmg`, `Gdex.AppImage`,
      with `public, max-age=300`;
   3. last, `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, with `no-cache`.
   Content types: `.exe` `application/vnd.microsoft.portable-executable`, `.dmg` `application/x-apple-diskimage`,
   `.zip` `application/zip`, `.yml` `text/yaml`, anything else `application/octet-stream`.
5. **Check**: `https://gdex-download.crowmade.app/latest.yml` (and the Mac and Linux ones) show the new version, and
   `https://gdex.crowmade.app/download.html` downloads all three.
6. **Try it** on a computer that never had Gdex: Settings → About shows the version; with licences on, Settings → About
   & licence shows the free days once a working role is used; buy a licence through Buy, check the thank-you page and
   the email, Enter licence code; refund it in Stripe and see the code cancelled at the next check (or at once with
   Release this computer, then Enter licence code again).
