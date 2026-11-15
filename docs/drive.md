# Google Drive in Tourbook

Google Drive is free for everyone in Tourbook, whatever the role and whether or not there is a licence. It does two jobs:

1. **Keeps devices the same.** Every phone or computer connected with the same Google account shares one copy of
   Tourbook, kept in a hidden folder of the person's own Google Drive that only Tourbook can open.
2. **Keeps dated copies.** The first time Tourbook syncs each day it also saves a copy of everything: one for each day of
   the last week and one for each of the last 12 months, in the same hidden folder.

Nothing goes to a Tourbook server. Tourbook talks to Google directly from the person's browser (or the desktop app), with a
permission that reaches only Tourbook's own hidden folder.

**Switched on, 15 November 2026.** The owner made Tourbook's own Google sign-in client that day, in the Google Cloud
project **Tourbook** (steps 1 to 5 below): a Web application client whose public id,
`41383784704-r4lhqli3p4e7bh66c7k5l2ala7t95r47.apps.googleusercontent.com`, is in `js/cloud-config.js` as
`CLOUD_APPS.google` (`90-drive` checks the repository carries exactly it). The website has Google Drive from the first
publish with the id in (with the Google app in production, step 7); the desktop app, which carries its own copy of `js/cloud-config.js`, gets it with its first
release (none has been released yet). A build whose id is empty says "Not set up yet" in the Google Drive card in Backups
and loads nothing about Google.

---

## For the owner: switching Google Drive on

Done on 15 November 2026 (steps 1 to 6; step 7 was under way as the id went in). The steps stay here as the record of
how Tourbook's client is set up, and for checking it. They were done once, in the Google account that owns Tourbook's
Google sign-in.

1. **A new Google Cloud project named Tourbook** at <https://console.cloud.google.com/>. Make a new project, not a second
   client inside Vdex's: Google ties the hidden app folder, the consent screen's name and the branding check to the
   project. A Tourbook client in Vdex's project would show "Vdex" when people sign in, and the two apps could read each
   other's hidden files.
2. **APIs & Services → Library → Google Drive API → Enable.** No other API is needed.
3. **Google Auth platform → Branding:** app name **Tourbook**; a support email; audience **External**; app home page
   `https://tourbook.crowmade.app/`; privacy policy `https://tourbook.crowmade.app/privacy.html`; terms of service
   `https://tourbook.crowmade.app/terms.html`; authorised domain `crowmade.app`; a developer contact email.
4. **Data access → Add or remove scopes →** add one scope by hand:
   `https://www.googleapis.com/auth/drive.appdata`. It is a non-sensitive scope, so Google does not review the app.
   Add nothing else.
5. **Clients → Create client →** type **Web application**, name Tourbook. Under **Authorised JavaScript origins** add
   exactly these two (no slash at the end, no path):
   - `https://tourbook.crowmade.app`
   - `http://localhost:47861` (the desktop app's own address; it can never change once the desktop app is released)

   Leave **Authorised redirect URIs** empty. Google also shows a client secret: Tourbook does not use it, and it must never
   be put anywhere in the repository.
6. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`) and give it to the developer. It goes in
   `js/cloud-config.js` as `CLOUD_APPS.google`. It is a public id, not a secret. Tourbook's:
   `41383784704-r4lhqli3p4e7bh66c7k5l2ala7t95r47.apps.googleusercontent.com` (15 November 2026).
7. **Audience → Publish app.** Until the app is published only the test users listed there can sign in, and only for
   seven days at a time. Tourbook's has said **In production** since 15 November 2026, before the website was published
   with the id.
8. Optional: **Branding → Verify branding**, so Google's sign-in window says "Tourbook" rather than the domain.

Then:

- The website picks the id up with its next build (`node tools/stamp-build.mjs` before a release, so installed copies
  update).
- **The desktop app carries its own copy** of `js/cloud-config.js`: a new or changed id reaches desktop users only with a
  new desktop release.
- **Try it once for real** after the first publish with the id in: connect Google Drive on tourbook.crowmade.app, and in
  the desktop app after its first release. Check too that your Google Account’s third-party connections and Google
  Drive’s Settings → Manage apps list it as Tourbook, as the terms (section 17) and the privacy policy (section 3) say; if
  they show crowmade.app, verify the branding (step 8) or tell the developer.
  The tests stand in for Google, so they cannot prove that Google's real sign-in script loads under Tourbook's
  Content-Security-Policy (`index.html` allows `https://accounts.google.com` for scripts, styles and frames, and any
  `https:` address for requests; `92-drive-desktop` checks those words are there). On 15 November 2026, before that
  publish and without signing in, the developer opened Google's real sign-in for this client from both origins: the
  website's flow at `https://tourbook.crowmade.app` (the repository's files answered there by the browser test, so the
  live site was not involved; Google's script loaded under the CSP once Connect Google Drive… was tapped, and Continue
  with Google opened Google's sign-in page, "Sign in to continue to crowmade.app") and the desktop app's own sign-in
  page at `http://localhost:47861` ("to continue to Tourbook"). On the website Google names the domain; Verify branding
  (step 8) should make it say Tourbook. While its window is open, Google's script logs "Cross-Origin-Opener-Policy policy
  would block the window.closed call." in the page's console: Chrome's words about Google's own page, not Tourbook's; a
  window closed before signing in is still noticed ("The Google window was closed before you signed in.").

### If something goes wrong

| What people see | Why | What to do |
|---|---|---|
| The card says "Not set up yet" | `CLOUD_APPS.google` is empty in this build | Put the client id in `js/cloud-config.js` and publish |
| Google says "Access blocked: Tourbook has not completed the Google verification process" | The app is still in testing (step 7) | Publish the app, or add the person as a test user |
| Google says `redirect_uri_mismatch` or "origin mismatch" | A JavaScript origin is missing or typed wrong (step 5) | Add the exact origin: no slash, no path, `http` for the desktop app |
| The desktop app says "another program on this computer is using the connection Tourbook needs" | The desktop app could not have port 47861 and runs on a stand-in port, which Google does not know | Restart the computer and open Tourbook first |
| "Google didn't give Tourbook the permission it needs" | The person unticked the box on Google's consent screen | Connect again and leave the box ticked |

---

## For people using Tourbook

- **Connect:** tap ☁ at the top (or Settings → Backups), then **Connect Google Drive…**, read what it does, and tap
  **Continue with Google**. Sign in and allow Tourbook its folder. Do the same on your other phone or computer with the
  same Google account: both end up with everything from both.
- **About once an hour** Google asks you to sign in again while you use Tourbook (Google gives a web app one hour at a
  time). The ☁ button then says **Sign in**: one tap on **Sign in again** and you are back. Your changes are kept on the
  device meanwhile and copied as soon as you have signed in (until then they are only on this device: Erase this device
  says so before it erases them).
- **In the desktop app** Google's sign-in opens in your web browser (Google does not allow it inside an app window).
  Sign in there, then come back to Tourbook when the page says so.
- **The dated copies:** **Bring back a daily copy…** lists them, newest first. Pick one to merge it into this device,
  or to replace everything with it. **Merge** names the records the copy holds that were deleted on this device since,
  with **Also bring back** ticked: so a booking deleted by mistake comes back, on every connected device, and nothing
  else is undone. (A backup file shows the same box, not ticked: its deletions stay unless you tick it.) While Google
  Drive is connected, **Replace** makes every connected device exactly like that copy at its next sync, and anything
  added since is gone from all of them. It reads your Drive first, so what the other devices have already copied there
  goes too (when Drive can't be read, nothing is replaced and Tourbook says why); only what a device has not copied to Drive
  yet, a phone that is offline say, comes back when that device next syncs.
- **If the copy in your Drive can't be read** (it is not a Tourbook file, or it was cut short), Tourbook leaves it alone and
  says so, keeps saving the day's dated copy from this device, and offers **Put this device's copy in its place…**: the
  unreadable one is kept in your Drive beside it, as it is, every dated copy stays, and your other devices add what
  they have the next time they sync.
- **If this device's clock is wrong** by more than about two minutes, the Google Drive card says so. Tourbook keeps the
  newest change of each record when it syncs, by each device's clock, so a slow clock can undo what you change or
  delete on that device, and a fast one what you change on the others. Set the device's date and time to set
  themselves automatically.
- **Disconnect** stops syncing on this device. Both copies stay: this device's and the one in your Drive.
- **Delete Tourbook's copy from Google Drive…** removes the shared copy and every dated copy from your Drive and disconnects
  this device. This device keeps everything. Another device still connected puts its copy back the next time it syncs,
  so disconnect the others first.
- **To take Tourbook's access away completely,** open your Google Account → Security → Your connections to third-party apps
  & services → Tourbook → Delete all connections. To delete Tourbook's hidden data from Drive without Tourbook: Google Drive on the
  web → Settings → Manage apps → Tourbook → Options → Delete hidden app data.
- **Erase this device** (Settings) first copies this device's last changes to your Drive (it asks you to sign in again
  when Google's hour is up), then disconnects Google Drive, so the copy in your Drive holds everything and is not
  overwritten by the empty device. When Drive can't be reached, nothing is erased yet: Tourbook says which changes your Drive
  lacks, with Try again (or Sign in again) and Save a backup, and only **Erase anyway** erases them.

What leaves the device: the whole Tourbook database goes to your own Google Drive (and nowhere else), with your Google
account's address and name kept on the device to show who is signed in and to skip Google's account chooser. The
sign-in itself (Google's token) is kept on the device for its hour, and removed the first time Tourbook looks for it after
that (when Tourbook opens, at the latest).

---

## For developers

### Files

| File | What |
|---|---|
| `js/drive.js` | Google sign-in (Google Identity Services' token client on the website, `window.tourbookDesktop.googleSignIn` in the desktop app), the token kept for its hour, and `driveAdapter()`: the files in the hidden app folder. Errors in words. |
| `js/sync.js` | Keeping this device and Drive the same: `sync`, the timed sync after a change, the daily copy, connect / disconnect / delete, the daily copies' list. The Drive state and `onDriveChange`. |
| `js/backup.js` | The Drive card at the top of `backupPanel()`, the connect sheet, the daily copies' sheet, the chooser with Replace everywhere, the ☁ button (Drive and the file copy, the worse first), `health()`, `backupLine()`, `beforeErase()`. Loads `js/sync.js`, whose `initDrive()` runs when the backups module loads (at idle on every open). |
| `js/store.js` | `mergeDb` joins an act's times seen (`acts[].seen`) and a take log's takes (`logs[].takes`) entry by entry; `adopt`, `afterWrite`, `replaceAll(…, { everywhere })` and `normalise` dropping `freeDaysFrom` are Part 0's seams. |
| `js/cloud-config.js` | `CLOUD_APPS.google`: the owner's client id (set on 15 November 2026; `''` would mean Not set up yet). |
| `css/settings.css` | `.se-bk-drive*`, `.se-bk-connect*`, `.se-bk-copy*`. |

### The files in Drive (`spaces=appDataFolder`, scope `drive.appdata` only)

- `tourbook-db.json`: the shared copy, the database as JSON with two-space indent, plus one top-level field after the
  database's own, `freeDaysFrom` (ms): the earliest day any device on that Drive started its free days (the build
  spec [S-39]). `normalise` drops it, so it never enters the local database. A backup file carries this device's start
  the same way (`docs/developers.md`, "Backup files carry the free days"), and a daily copy brought back with the
  chooser hands its start over as a backup file does.
- `tourbook-backup-mon.json` … `tourbook-backup-sun.json` (overwritten each week) and `tourbook-backup-YYYY-MM.json` (written when
  that month has none; monthly files beyond the last 12 are deleted). They carry `freeDaysFrom` too.
- `tourbook-db-unreadable-YYYY-MM-DD.json`: a shared copy Tourbook could not read, kept as it was when the person chose Put
  this device's copy in its place (`replaceUnreadable()` in `js/sync.js`). Tourbook never reads it again.
- Two `tourbook-db.json` files (two devices linking at the same moment): the oldest (`orderBy=createdTime`) is the one
  every device uses; a sync merges the others into it and deletes them.

Requests: list `GET https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=…&orderBy=createdTime&pageSize=100&fields=files(id,name,modifiedTime,size)`,
read `GET …/files/<id>?alt=media`, create `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`,
overwrite `PATCH https://www.googleapis.com/upload/drive/v3/files/<id>?uploadType=media`, delete `DELETE …/files/<id>`,
the account `GET …/drive/v3/about?fields=user(displayName,emailAddress)`.

### A sync

One at a time (one asked for meanwhile waits, then runs). `ready(ask)` (a live token, or Google's window when `ask`
came from a tap); list and read `tourbook-db.json` (and any extra ones); take `freeDaysFrom` out of each copy and hand the
earliest to `adoptFreeDaysFrom` (`js/licence-state.js`); `mergeDb(store.db, remote)`; when that differs from this
device, `store.adopt(merged)` (no new `updatedAt`, no `afterWrite`, the store's gate not asked: Drive keeps flowing in a
read-only role); when it differs from Drive, or Drive's `freeDaysFrom` is missing or later than the earliest known,
write. "Differs" compares both after `normalise`, with every list's records, and every act's times seen and log's
takes, in id order, so two devices that list the same ones in different orders (two changes to one act in the same
millisecond end that way) do not write each other's copies all day. Then `tourbook-sync-at`, then the daily copy
(`tourbook-backup-cloud` says whether today's is done). A shared copy that is not a Tourbook file (`parseTourbook` marks the error
`unreadable`) stops the sync with an error and is left alone, but the daily copy is still written, from this device's
data, and `driveState().unreadable` puts Put this device's copy in its place… in the card.

When it runs: when Tourbook opens with Drive linked (quietly: with the hour over it says "Sign in" and opens no window);
800 ms after the last change made on this device (`store.afterWrite`; not while it needs a sign-in); at once when Tourbook is
hidden with a change waiting; when Tourbook comes back into view after a minute or more; when the connection comes back
(`online`); a minute after "Google Drive is busy"; on Sync now and Sign in again (which may open Google's window).

Disconnecting (or Erase, or Delete Tourbook's copy) bumps a generation counter: a sync already running stops at its next
step without adopting or writing anything. Another tab of Tourbook on the same device follows: it hears `tourbook-drive` go (a
`storage` event) and disconnects too, and it takes in the database the other tab wrote (`js/store.js`), so an Erase in
one tab is not undone, or synced back, by the next change in another.

### The merge

Every record follows its newer copy (`updatedAt`); a tombstone in `db.deleted` later than a record's `updatedAt` removes
it. An act's `seen` and a take log's `takes` are joined entry by entry: the newer copy wins and gets every entry of the
older copy whose id it lacks and that has no tombstone; an entry of the newer copy whose tombstone is later than that
copy's `updatedAt` goes. Merge from a daily copy or a backup file with Also bring back (`mergeIn(data, { revive: true })`)
stamps the records it holds that were deleted here since now and drops their tombstones here, so they are newer than
every device's tombstone and come back everywhere. Removing a time seen or a take writes a tombstone for its id (Part 0), and Replace with Drive
linked first syncs from the tap (so the records other devices have put in Drive are on this device too; when Drive
can't be read nothing is replaced), then tombstones every record, time seen and take the backup lacks and stamps every restored record now, so every
device follows it. Device clocks decide clashes; tombstones last 180 days. So each write asks Google for the file's
`modifiedTime` (an answer's `Date` header counts too, where the browser exposes it), and `clockSkew()` in `js/drive.js`
keeps this device's clock minus Google's: more than two minutes off, the Drive card says so and suggests letting the
clock set itself (`.se-bk-drive-clock`).

Two copies of the same time that differ (changed in the same millisecond on two devices, or never stamped) go the same
way on every device, to the one whose JSON sorts last; otherwise each device would keep its own and write it back at
every sync, for ever. The profile keeps its own rule: one someone filled in beats an empty one or the sample's stand-in
whatever their times, and the newer of two filled-in ones wins. The sample's stand-in and an empty profile carry no time
of their own (loading and removing the sample leave it as it was), so between those two the stand-in stays while
sample records are there and the empty one wins once they are gone: a device with the sample and a new one agree, and
Remove the sample on either clears the stand-in on both. Picking a currency (Settings, Your details, the welcome tour)
gives a stand-in or an empty profile a time of its own; between two that have times the newer wins, and Remove the
sample gives a stand-in that had a time a newer one as it clears it, so the cleared profile still wins everywhere.

### Keys (localStorage; Erase clears them, after disconnecting)

`tourbook-drive` (`'1'` while linked), `tourbook-drive-file` (the shared copy's id), `tourbook-google-tokens` (`{ value, exp }`),
`tourbook-google-email` (Google's `login_hint`), `tourbook-drive-who` ("Name · address"), `tourbook-sync-at` (last good sync),
`tourbook-backup-cloud` (`{ day, month, at, name }` of the last daily copy). Nothing about Drive is in the database.

### Where Google is contacted

Only after the person taps **Connect Google Drive…** (the connect sheet loads Google's script so its window can open
straight from the tap on Continue), or when Drive is already linked on this device. The desktop app never loads
Google's script: its sign-in is a page of its own in the web browser (`desktop/main.cjs`). The desktop app's files
opened in a web browser (localhost:47861-47880 without `window.tourbookDesktop`) refuse to connect, and on a stand-in port
the desktop app refuses to sign in (Google knows only 47861).

### Tests (Google faked)

- `90-drive`: the repository's `js/cloud-config.js` carries exactly the owner's id, and the app opened with it offers
  Connect, loads only Google's sign-in script on the tap and asks Google with that id; not set up (an empty id); connect
  (Google contacted only once asked; a cancelled sign-in; only `drive.appdata`; Google's script not loading, then Try
  again); the walkthroughs of the Backups sheet, the connect sheet and the daily copies;
  first device, second device, edits and deletions travelling; the hour up and one tap; a 401; status changes not
  redrawing the page; the store's gate refusing; the daily and monthly copies; a failed sync and a failed daily copy;
  bringing a daily copy back and Replace on every device; a booking deleted by mistake brought back by Merge (Also bring
  back: ticked for a daily copy, not for a backup file) on both devices; Disconnect, Delete, Erase (the changes Drive lacks copied
  first, signing in again from the tap; with no internet nothing erased until Erase anyway); a first sync that fails, then Not
  now; a token whose hour is over removed at the next look; two tabs, Erase in one (the other takes in the empty database and shows Drive disconnected); where the focus goes when the card is redrawn (after connecting, Sign in again, Disconnect, Delete, Not now);
  `freeDaysFrom` with a stand-in licence state.
- `91-drive-merge`: `mergeDb` entry by entry; two devices logging at once; no ping-pong (records, or one act's times
  seen, in different orders); nothing pushed back after a copy is taken in; Replace everywhere with entries; duplicate
  copies; a Vdex file refused; a shared copy cut short (the daily copy still saved, then Put this device's copy in its
  place, the bad one kept aside and the daily copies kept); a copy deleted meanwhile; Drive's errors in words and the connection coming back; ties
  (one record with the same time and different contents on two devices; the sample's stand-in profile on one device
  and an empty one on another, a currency picked, then Remove the sample) settle the same way everywhere and stop writing; Replace
  everywhere reading Drive first (another device's venue it had not taken in is replaced too; with no internet nothing
  is replaced).
- `92-drive-desktop`: the desktop app's bridge stood in for at localhost:47861 (served by the test, no server); a
  stand-in port; the desktop app's files in a web browser; `index.html`'s CSP.

The fake (`fakeDrive()` in `tests/specs/90-drive.cjs`, exported with the device opener for 91 and 92) is one Drive held
in the Node test: every browser context routed to it is one device. Google's sign-in script is served by the test at
its real address, so the CSP is exercised; the real Google is never contacted.
