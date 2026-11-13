# Gdex: how it is built

Gdex is the booking deck for **music producers and their bands**: shows, studio sessions and rehearsals; acts, people,
backline and venues; songs, setlists and split sheets; day sheets, settlements, quotes and invoices; and the tools a
musician needs on the night (tuner, metronome, delay times, sound level meter, set timer).

It is a sibling of Vdex, the videographer app (repository TheCrowBro/Logi-Video-Production-app-). It began as a copy
of Vdex's shell (sheets, forms, themes, offline service worker) with everything rebuilt for music; Vdex's Rolodex became
a record player, a tape deck or a digital player, the person's choice. It was
built in a folder of the Vdex repository and moved here with its history. It shares no code with Vdex at run time and
keeps its own storage, cache and files.

It is a plain web app: ES modules, no framework, no build step, no external libraries or CDNs (only
`vendor/qrcode.js`). It works offline once opened, installs to a home screen, and keeps all data in the browser's
`localStorage` under keys that start with `gdex-`. Nothing is sent to any server.

## Running it

```
node tests/run.mjs              # every browser spec (Playwright + Chromium)
node tests/run.mjs 30- songs    # only specs whose file name contains "30-" or "songs"
node tools/stamp-build.mjs --dev  # after adding or removing a file: refreshes the offline file list in sw.js
npm run serve                   # http://localhost:8124/
```

## Folder layout

| Path | What |
|---|---|
| `index.html` | The app. Links `styles.css` and every `css/*.css`. |
| `invoice.html`, `daysheet.html` | Share pages: open a document packed into the link (no server). |
| `privacy.html` | The privacy page. |
| `styles.css` | Core styles and themes (copied from Vdex, re-skinned). |
| `css/<feature>.css` | One stylesheet per feature, owned by that feature. |
| `js/app.js` | Boot, the section menu, sections, redraw on change. |
| `js/deck.js` | The section menu: a record player, a tape deck or a digital player (Aa → Section menu), each section a track. |
| `js/store.js` | The database. |
| `js/model.js` | Music domain constants and pure sums (deals, settlement, set lengths, durations). |
| `js/pages/*.js` | One module per section. |
| `js/bookings-cal.js`, `js/bookings-kit.js` | The calendar's views (drawn for `pages/bookings.js`), and the helpers the two share. |
| `js/acts-ask.js`, `js/venues-rules.js` | "Did you see them?" after a show; a venue's house rules wherever they are drawn. |
| `js/search.js` | The search: the magnifying glass in the top bar (and the `/` key) and the sheet it opens. |
| `js/blocks/*.js` | Boxes on a booking's page (deal, setlist, guest list…), listed in `js/blocks/index.js`. |
| `js/*.js` | Shared modules (see below). |
| `tests/` | `run.mjs`, `lib.mjs`, `helpers.cjs`, `specs/NN-name.cjs`. |
| `tools/` | `stamp-build.mjs`, `site-files.mjs`, `prune-css.mjs` (reports the rules of `styles.css` nothing uses). |

## The sections (tracks on the section menu)

| id | Label | Module | What it is |
|---|---|---|---|
| `bookings` | Bookings | `pages/bookings.js` | The calendar (month, two weeks, week, three days, day: `js/bookings-cal.js`) with Coming up under it; the booking page with its blocks. Gdex opens here every time. |
| `acts` | Acts | `pages/acts.js` | Bands and artists as drop-down cards: times seen live with scores out of 100 and dates coming up; the log of each time seen; members, links, press kit (EPK) with QR, tech rider (input list, stage plot), hospitality rider. |
| `people` | People | `pages/people.js` | Band members, session players, crew, industry contacts (promoters, agents…). |
| `songs` | Songs | `pages/songs.js` | Song library (key, BPM, length, status, split sheet) and setlists. |
| `sessions` | Studio log | `pages/sessions.js` | Take logs for recording sessions: song, take number, time, keep/maybe/no, notes. |
| `backline` | Backline | `pages/backline.js` | Instruments, amps, mics… with serials, values, owners; stage packs (kits). |
| `venues` | Venues | `pages/venues.js` | Venues, studios, rehearsal rooms, festivals: capacity, stage, PA, curfew, noise limit, load-in, map. |
| `money` | Money | `pages/money.js` | Overview: income by month and act, unpaid invoices, deposits due, settlements, payouts. |
| `tools` | Tools | `pages/tools.js` | Tuner, metronome + tap tempo, delay/reverb times, sound level meter, set timer. |
| `insurance` | Insurance | `pages/insurance.js` | Policies (instruments, public liability…), renewals, cover vs backline value. |
| `settings` | Settings | `pages/settings.js` | Profile, money settings, backups, display, tour, erase. |

Navigate in code with `window.logiGo('venues')` (string ids only; resolves once drawn). `window.logiPage()` is the
open section's id. Which sections are on the menu depends on the role (below); `logiGo` opens any of them, a section
off the menu as the bonus track.

## Roles (`js/roles.js`, `js/role-pick.js`)

The first open asks who is using Gdex: producer, manager, band, solo artist, scout or audiophile, or everything
(`askRole` in `js/role-pick.js`, then the welcome tour for that role). Settings → Your role swaps it (`rolePanel`). A
device whose welcome tour was done before roles came gets one card under the menu instead (`nudgeRole`, shown once:
`gdex-role-nudged`; closing the first-run question without a pick sets it too, so that person never sees the card).
The question and the tour wait while a sheet (the sleeve, tapped in the first moment) is open. Their words, like the
sleeve's, follow the section menu (`menuWords()` in `js/a11y.js` gives `{ list, tap, Tap }`): "the sleeve" / "tap the
record", "the track list" / "tap Tracks" on the tape deck, "the track list" / "tap ☰" on the digital player. Never
compare `menuStyle()` to build such a sentence. (`js/tour.js` cannot import `a11y.js`, which imports it: its
`menuKind()` reads `data-menu` on the `html` element, which `applyPrefs()` sets to the menu in use, so it is right even
when storage could not keep the choice; storage is only the fall-back.) The role is a device preference in `localStorage` `gdex-role`, never in the database, so a swap
writes nothing to `gdex-db` and backups do not carry it; Erase this device clears it. With none saved the role is
`EVERYTHING`: every section on the menu, every box, no page defaults, as Gdex always was. **Every spec runs as
Everything** unless it sets a role (`tests/helpers.cjs` marks the tour done and the role card dismissed).

A role is data (`ROLES` in `js/roles.js`; not to be confused with `model.js`'s `ROLES`, the instruments people
play): `sections` (the menu in order; Settings is always added last), `start` (`bookings` for every role, and its
first track: **Gdex opens on the calendar on every page load**, in every role and in Everything, whatever was open last.
`startSection()` is the one source for where a start opens; the old `gdex-tab` key is no longer read or written, and is
removed at boot. Explicit jumps still go where they say: `logiGo`, `openBooking`, `openAct`, a tour step, the first-run
pick. Within a visit, leaving Bookings and coming back keeps the view, the day and an open booking), `names` (only
Bookings and Acts are renamed: Artists, Roster, Bands, My act, Shows, Gigs), `what` (fills What you do in the tour), `newKind`, `kinds` and
`kindHelp` (the What are you booking? sheet), `hide` (booking boxes kept under More boxes), `money` (`false` leaves
the deal, settlement, quote & invoice and costs boxes off booking pages altogether and starts new shows Confirmed),
`welcome` and `tour` (the welcome tour, at most five stops), and `pages` (defaults read with `pageOpt`).

| Helper | Use |
|---|---|
| `role()`, `roleId()`, `roleChosen()`, `setRole(id, { start })` | The current role; `setRole` saves it and fires `gdex-role` (the app redraws the menu and the page). |
| `menuSections(r)`, `offMenu(r)`, `startSection(r)` | The menu (always ending with Settings), the bonus tracks, where a fresh start opens. |
| `sectionName(id, fallback)`, `actWord()` | The role's name for a section (menu, page heading, tour); one act in its words (artist, band, act). |
| `blockShown(id)`, `blockFolded(id)`, `MONEY_BLOCKS` | A booking box shown, under More boxes, or (a money box for a role without money) neither. `blocksFor(kind)` already leaves the others out. |
| `moneyShown()`, `newKind()`, `kindOrder()`, `kindHelp(kind)` | Money on or off; the kinds of booking in the role's order and words. |
| `pageOpt(page, key, fallback)` | A page's default for the role: `bookings.open`, `bookings.score`, `bookings.noActs`, `bookings.ask`, `acts.order`, `acts.seen`, `acts.tabs`, `acts.empty`, `people.group`, `songs.view`, `tools.tool`, `money.earned`. A default applies only while the person has not chosen otherwise. |
| `askSeen()`, `askDefault(r)`, `askSetting()`, `setAskSetting(v)` | Whether this person is asked "Did you see them?" after a show: the device setting `gdex-ask-seen` (`'on'`, `'off'`; `''` / unset follows the role) when there is one, else the role's own answer (`pages.bookings.ask: false` on band and solo artist; everyone else, and Everything, is asked). |

Pages: Acts sorts by `acts.order` (`latest`: latest score, then average, then name; `recent`: last seen first; never
seen last), and "From a past show" offers shows up to today (holds and offers too when money is off), leaving out
any show marked "Didn’t go". Tools writes
`gdex-tool-pick` only when a tool is picked (the `gdex-tool` the build before roles wrote on every draw is never read),
and works out the first tool (picked, else `tools.tool`, else the tuner) and Songs its first view each time it is
drawn, so a role's default applies until the person chooses. `songs.view: 'setlists'` applies only when there are songs
and setlists; a link that needs the songs list calls `showSongs()` (`pages/songs.js`) before `logiGo('songs')`, as the
metronome's Go to Songs does. People's + Add starts in `people.group` only when no act is on show (an act's people:
Band members). People and Money use the role's words (`actWord()`, `sectionName('bookings')`, the manager's earned
word); with money off, People and Venues leave rates off cards and sheets (the forms keep their fields) and speak to
someone who goes to shows. The venue checks on a booking speak of "the set" for everyone and mention the deal or
settlement only when money is on.
Settings has no Quotes & invoices section (nor its walkthrough step) while money is off, and Your details is not said
to go on quotes and invoices; Your role says the section comes back with a role that uses money, or with Everything.

Rules: a page reads the role through these helpers, never `roleId() === 'scout'`; ids stay ids (`sessions` is the
Studio log, whatever a role calls anything); hiding never deletes or edits data; nothing inside a document that goes
to other people (press kit, rider, day sheet, invoice, settlement) follows the role. On the section menu, sections
off the role's menu are listed on the sleeve (or the track list) under Bonus tracks; one that is open sits on the
record as the bonus track (★) until you move on, and joins the digital player's row of tabs meanwhile
(`createDeck(…, { extras, onExtra })`, `deck.setTabs(tabs, index)`). The three menus (`gdex-prefs` `menu`: `record`,
`tape`, `digital`) do the same things: ⏮ ⏭, a swipe, the arrow keys, and a list of every section. The digital
player is described under "The section menu" below.

### Device preferences

Kept in `localStorage` on the device, never in the database, so backups do not carry them:

| Key | What | Erase this device |
|---|---|---|
| `gdex-prefs` | Display: theme, light or dark, text and button size, contrast, animation, vibration, and the section menu (`menu`: `record`, `tape` or `digital`). | kept |
| `gdex-cal-view` | The calendar's view: `month`, `two`, `week`, `three` or `day`. Read and written only through `calMode()` / `saveCalMode()` (`js/bookings-kit.js`); only the calendar's view buttons save it. | kept |
| `gdex-role` | The role (`setRole`). | cleared |
| `gdex-ask-seen` | "Did you see them?" on or off (`setAskSetting`). | cleared |

`gdex-tour`, `gdex-role-nudged`, `gdex-settings-open`, `gdex-tool-pick` and the like are cleared too.

A choice that storage cannot keep (private mode, or storage full) still holds for the visit: the display
preferences and the calendar's view live in memory while the page is open, and `askSetting()` reads storage every
time except straight after a write that failed, when its copy in memory answers until a write works again.

Aa and Settings → Display are two copies of one panel (`a11y.js` `displayPanel()`). Every choice fires `gdex-prefs`
on `window`; each copy on the page draws itself again on it, and Settings' closed line follows it, so a choice made in
Aa over Settings shows there at once.

## Page contract

```js
export const venues = {
  id: 'venues', label: 'Venues', icon: '📍',
  render(root) { root.append(...); return cleanup || undefined; }, // draw into root (a fresh <section class="page-card">)
  tutorial: [ { title, text, target: ['.css-selector'] } ] // or () => steps for the current view
  // static: true  only for a page that keeps live state and must not be redrawn on data changes (Tools)
};
```

* `render` is called again (into an emptied root) after **every** store change, so it must draw from `store.db` each
  time, keep any view state (open tab, selected record, filters) in module-level variables, and not leak listeners
  (return a cleanup function for timers, audio, media streams, window listeners).
* Give interactive controls an `id` or `aria-label` so focus is restored after a redraw.
* Start the page with `h('div', { class: 'page-head' }, h('h1', null, 'Venues'), actionButton)`.
* An empty list shows `empty('One sentence on what goes here and why.', primaryButton)`.

## Data (`js/store.js`)

```js
import { db, update, upsert, patch, remove, byId, subscribe } from '../store.js';
```

* `db` is a live binding: read `db.venues` etc. at render time; never keep it across `await`.
* **Every change goes through the store**: `upsert(list, record)` (new id if none; stamps `updatedAt`, `createdAt`;
  returns the stored record), `patch(list, id, fields)`, `remove(list, id)` (also removes references elsewhere: see the
  code), or `update(d => { …mutate d…; rec.updatedAt = Date.now(); })` for anything else. A change saves and redraws.
* Ids: `uid()` from `util.js`. Dates: `'YYYY-MM-DD'`. Times of day: `'HH:MM'`. Instants (clocks, takes): ms epoch.
  Durations of songs: seconds. Money: plain numbers (the currency symbol is `db.profile.currency`).
  Whatever is loaded or brought back from a backup goes through `normalise`: a booking's `date` and `endDate` are text
  or `''`, and its `title`, `client`, `venueName` and `address` text (a number becomes text, anything else `''`).
* Numbers typed in forms arrive as numbers from `type: 'number'` fields but as **strings** from `rows` columns:
  convert with `Number()` before sums.
* `loadSample()` fills a realistic sample (ids start with `s-`: act `s-owls`, show `s-show1`, past show `s-past`,
  session `s-sess1`, setlist `s-clubset`, venue `s-lantern`…). Tests use it.
* **The order of a day is the order the bands play.** `nightMin('HH:MM')` is minutes on the *night clock* (a time
  before 06:00 belongs to the night before: +1440; `null` when it is not a time); `playField(b)` is the time a booking
  sorts by (a show: `setTime`, else `doors`, `soundcheck`, `loadIn`; anything else: `start`), `playTime(b)` that time,
  `playKey(b)` the minutes it sorts by: a show's on the night clock, anything else's on the plain clock (the
  after-midnight rule is for shows only: a session, rehearsal or diary entry at 05:15 is 315, the morning of its date,
  first in its day, never "after midnight"). Comparators: `byPlay` (inside a day, no time last), `byDayPlay` (soonest day first,
  no date first of all), `byDayPlayDesc` (newest day first, a day still in playing order). They give exactly 0 for a
  tie and never throw on a missing date. `bookingsOn`, `upcoming`, `personBookings` and `gearBookings` use them; so
  must any new list of bookings. `model.firstTime(b)` (load-in first) is what a card and a calendar file *start* with,
  not an order.
* **A row prints the time it is sorted by**, so a day never reads out of order. A Week row and a grid block print the
  playing time (`Doors 20:00` when that stands in for the on-stage time). A Coming up card keeps its first time and
  adds the on-stage time (`Load-in 16:00 · On 21:00`) or, for a show with none yet, the time it is sorted by
  (`Load-in 15:00 · Doors 19:30`). A row on an act's own page prints `playLabel(b)` and `playTime(b)` for a show
  (`On stage 21:00`, `Doors 19:30`) and the start for anything else. A row on a person's sheet prints a show's load-in
  and its on-stage time, or with none the soundcheck or doors it is sorted by (`load-in 17:30 · soundcheck 18:30`).
  An act's card and a venue's rows print no time or both.
* Helpers: `bookingsOn(date)`, `upcoming()`, `activeBookings()`, `covers(b, date)`, `overlaps(a, b)`, `lastDay(b)`,
  `personBookings(id)`, `gearBookings(id)`, `personClash(b, personId)`, `gearClash(b, gearId)` (other overlapping bookings
  when together they need more than are owned; both in playing order, `byDayPlay`, so a clash line names them as the day runs), `gearShort(b, gearId)` (this booking alone needs more than are owned), `qtyOf(g)`,
  `usedQty(booking, gearId)` (counts in `booking.gearQty`), `packQty(kit, gearId)` (counts in `kit.qty`; applying a pack
  to a booking copies them into `gearQty`), `totalValue(g)`, `exportJSON()`, `replaceAll(data)`, `mergeIn(data)`, `eraseAll()`.

### Records

`db.profile`: `{ name, business, role, phone, email, website, location, address, currency, bio, updatedAt }`

`bookings`:
```js
{ id, kind: 'show'|'session'|'rehearsal'|'other', status, title,   // title optional: model.bookingTitle(b) fills it in
  actId, client,                       // which act (acts id); client = free text for a session's artist not in Acts
  date, endDate,                       // endDate only for multi-day (festival weekend, a block of studio days)
  venueId, venueName, address,         // venue from Venues, or typed name/address
  // show times ('HH:MM'): loadIn, soundcheck, doors, setTime, curfew; setLength (minutes)
  // session/rehearsal/other times: start, end
  contact: { name, role, phone, email },          // promoter / client / studio contact for this booking
  deal: { type, fee, pct, ticketPrice, capacity, expenses, deposit, depositDue, depositPaid, notes },  // shows
  runningOrder: [{ id, act, time, length, ours }],// shows: doors, support acts, changeovers, our set
  guestList: [{ id, name, plus, note, in }], guestCap,
  hospitality, accommodation, parking, backlineProvided,   // text
  setlistId,                                       // setlists id
  settlement: { tickets, comps, merch: [{ id, item, start, end, comps, price }], merchTotal,
                costs: [{ id, desc, amount }], received, shares: { personId: weight }, settledAt, notes },
  rate, rateUnit: 'hour'|'day'|'song'|'flat', songIds: [], deliverables: [{ id, t, due, done }],   // sessions
  fee,                                             // other: a plain fee
  people: [personId], gear: [gearId], gearQty: { gearId: n }, kits: [kitId],
  checks: { checkId: true },                       // advance / session checklist (js/blocks/advance.js)
  budget: [{ id, cat, desc, amount }],             // our costs (travel, hotel, hire…)
  quote, invoice,                                  // documents, owned by js/money.js
  daySheet: { sentAt, sig },                       // when the day sheet was last sent, and a fingerprint of it (daysheet)
  went,                                            // 'no' = "Didn’t go" (shows); the key is absent otherwise: test b.went === 'no'
  notes, createdAt, updatedAt }
```
`went` is the No to "Did you see them?" (`model.markWent`). A Yes is never stored on the booking: it is the act's
`seen` entry. A duplicate never carries it, and an edit that changes the date, the last day or the act drops it, as
deleting the act does (`store.remove`). It travels in backups and is never put in a day sheet, a calendar file or any
document.
Statuses per kind: `model.statusesFor(kind)` (`hold`, `offer`, `confirmed`, `advanced`, `done`, `settled`,
`cancelled`). Pills: `h('span', { class: 'pill ' + statusTone(s) }, statusLabel(s))`.

`acts`: `{ id, name, genre, color, bio, links (text, one "Label: url" per line), email, phone, members: [personId],
inputList: [{ id, ch, source, mic, stand, note }], stagePlot: [{ id, label, x, y }], riderTech, riderHospitality, notes,
seen: [{ id, date, venueId, where, rating (1–100), notes, bookingId, savedAt }] }` (`seen`: each time the person saw them
play; `model.seenStats(a)` gives times seen, the average and latest score; `model.seenOf(a)` orders them newest first and,
on one day, the last saved first: `savedAt`, else the later in the list. `bookingId` is the act's show that time was at:
every save links it again, so it follows the entry's date. An entry without one counts for the act's show on its day
only when that is the act's only show that day: `model.seenEntryFor(a, b)`, `model.onlyShowOn(actId, iso)`)

An act that changed its name also carries `formerNames: [{ name, until }]`: each earlier name with the day it stopped
being used (`'YYYY-MM-DD'`: the day the next name began, so a booking on that day already has the new name), or `''`
when nobody knows the day (a name added by hand: it shows on the act and is found by search, but dates no record).
The key is absent on an act that never had one, and such an act reads exactly as before. Every record keeps using
the act's current `name`; the earlier names are only ever read through the model's helpers ("Earlier names" below),
which clean whatever is stored. They travel in backups, and in nothing printed, sent or exported for another program.

`people`: `{ id, name, group: 'band'|'session'|'crew'|'contact', role, instrument, company, phone, email, rate,
rateUnit: 'day'|'hour'|'show', notes }`. Act membership lives on the act (`act.members`).

`gear`: `{ id, name, category, make, model, serial, value, qty, owner (personId), location, notes }`.
`kits` (stage packs): `{ id, name, items: [gearId], qty: { gearId: n }, notes }`.

`venues`: `{ id, kind: 'venue'|'studio'|'rehearsal'|'festival'|'other', name, address, geo: { lat, lon }, capacity,
stage, pa, backline, loadIn, parking, curfew, noiseLimit (dB), contact, phone, email, website, hospitality, rate,
rateUnit, notes, rules, rulesNote, rulesTone }`. House rules, all optional: `rules` holds only the answers that are
known (`{ proCameras: 'no', age: '21' }`; a missing key is "Don’t know"), `rulesNote` is free text, `rulesTone` the
colour set by hand (`''` automatic, `'relaxed'`, `'some'`, `'strict'`). Read them through `model.rulesOf(v)`, which
ignores anything unknown. They belong to the venue and apply to every show there (a show cannot override them; a typed
venue has none), and nothing about them goes into a day sheet, an invoice or a calendar file. The venue form always
stores all three, so a venue saved through it is told apart from one that never had them (the sample adds its rules
only to the latter). It replaces only the rules this build knows: the answers to any other rule (from a newer Gdex,
or a backup edited by hand) are kept as they were stored (`model.unknownRules(v)`).

`songs`: `{ id, title, actId, key, bpm, duration (seconds), tuning, status, isrc, lyrics, link, notes,
splits: [{ id, name, role, share (%), pro, ipi, publisher }] }`.

`setlists`: `{ id, name, actId, gap (seconds between songs), items: [{ id, songId, title, duration, note, segue,
encore, isBreak }], notes }`. An item with `songId` takes its title and length from the song; one without carries its
own `title` (and `duration`). `isBreak` is a set break ("SET 2", "ENCORE" heading). Length: `model.setlistLength(list)`.

`logs` (take logs): `{ id, bookingId, date, title, songId, startedAt, takes: [{ id, n, songId, at, rating:
'keep'|'maybe'|'no'|'', text }], notes }`.

`shifts` (session clock): `{ id, bookingId, start, end (null while running), breaks: [{ start, end }] }`.

`insurance`: `{ id, type, provider, policy, cover, premium, renewal, phone, claims, link, notes }`.

`db.templates[kind]`: the person's own checklist lines per kind (advance block). `db.billing`, `db.priceList`: owned
by `js/money.js`.

## The music model (`js/model.js`)

Constants: `KINDS`, `STATUSES`, `statusesFor`, `statusLabel`, `statusTone`, `kindLabel`, `kindIcon`, `SHOW_TIMES`,
`SESSION_TIMES`, `timesFor`, `PEOPLE_GROUPS`, `ROLES`, `GEAR_CATS`, `VENUE_KINDS`, `RATE_UNITS`, `SONG_STATUS`,
`NOTES`, `KEYS`, `SPLIT_ROLES`, `DEAL_TYPES`.
Helpers: `seenOf(a)`, `seenStats(a)`, `seenWhere(s)`, `ratingOf(s)`, `seenEntryFor(a, b)`, `actShowsOn(actId, iso)`, `onlyShowOn(actId, iso)`, `actUpcoming(a)`, `bookingTitle(b)`, `actName(id)`, `venueOf(b)`, `firstTime(b)`, `lastDate(b)`, `coversDay(b, iso)`, `fmtDur(sec)`,
`parseDur(text)`, `fmtMin(min)`, `addMinutes('HH:MM', min)`, `minutesBetween(a, b)`, `setlistLength(list)`,
`itemTitle(item)`, `fmtMoney(n, sym?)`, `currency()`, `dealPays(deal, gross)`, `dealSummary(deal)`, `dealBest(deal)`,
`settle(b)`, `sessionFee(b, hours?)`, `sessionHoursPlanned(b)`, `bookingIncome(b)`.

Checklists: `CHECKLISTS` (built-in lines per kind with stable ids such as `show-daysheet`, `show-invoice`,
`show-paid`, `show-settled`, `ses-invoice`, `ses-paid`, `ses-deliver`), `MONEY_CHECKS` (the built-in money lines),
`checklistFor(kind, { money })` (`money: false` leaves the money lines out; the person's own lines stay), `isChecked(b, id)`,
`markCheck(bookingId, id, on)`. A feature that completes a step ticks it by id (sending the day sheet ticks
`show-daysheet`; sending an invoice ticks `show-invoice`/`ses-invoice`; a paid invoice `show-paid`/`ses-paid`;
settling the night `show-settled`). People's rate units: `PERSON_RATE_UNITS` (day, hour, show, song).

The order of a day (the store's, passed on): `nightMin`, `playField`, `playTime`, `playKey`, `byPlay`, `byDayPlay`,
`byDayPlayDesc`; and `nightClock(min)` (night minutes back to `'00:30'`), `playLabel(b)` (`On stage`, `Doors`,
`Soundcheck`, `Load-in`, `Start`, or `''`), `isAfterMidnight(b)`. Overlapping sets: `setWindow(b)` (`{ start, end }` in
night minutes for a live show with an on-stage time; it lasts its set length, else 60 minutes; holds and offers count,
a cancelled show does not), `setsOverlap(a, b)` (on a day they share; sets that only touch do not overlap),
`overlapsOf(b, list?)`, `overlapText(b, list?, { day }?)` (`Overlaps with Chelsea Wolfe, 21:00`, `… and Sable, 21:30`,
`… and 2 more`; the other show goes by its act, else its client, else its title, and by its title when it is the same
act. For a booking over several days, `day` keeps only that day's clashes (a Week row is one day); without it every
clash is named with the other show's day, the first the two share, as a Coming up card and an "any time" pill stand for
all the days: `Overlaps with Sable, Sat 21:30`). The note ignores the filter chips and is the same for every role.

When a show is over: `showEnd(b)` (a `Date`, or `null` for anything that is not a show with a date) and
`showOver(b, now?)`. On the show's last day, on the night clock: the set's end (on-stage time plus set length); with no
length, the curfew (the booking's own, else its saved venue's; with an on-stage time, only when it is not before the
set; with none, a curfew before the doors, soundcheck or load-in the show is sorted by, or one alone and before noon,
is the next morning's: an all-nighter, doors 22:00 and curfew 06:00); with an on-stage time and neither, two hours
after it; with no times, or only doors, soundcheck or load-in, 06:00 the next morning. In the small hours: `tonightShows(now?)` (before 06:00, the live shows whose last day was yesterday and that are not
over yet: a set at 00:30 still to come), `isTonight(b, now?)`, and `comingUp(now?)` (those, then `store.upcoming()`):
Coming up keeps them at its top marked "Tonight", and the menu's "coming up" number counts them; the calendar's day
still turns at midnight, and the Day view opens on the calendar's date. `ASK_DAYS` (14); `seenAnswer(b)` (`'seen'` when the act's log has the show, else `'no'` when
`b.went === 'no'`, else `''`; always `''` when the booking's act is not in Acts, as after a merge that brought in a No
for a show whose act was deleted on another device); `waitingShows(now?, { holds })` (shows that are over, not cancelled, with an act that
is in Acts, at most `ASK_DAYS` days after their last day, with no answer; newest first; `holds: false` leaves out
holds and offers, which a role with money is not asked about); `markWent(bookingId, no?)` (quiet).

House rules: `RULE_GROUPS`, `HOUSE_RULES` (17 rules: `{ id, group, kind: 'allow'|'fact'|'pick', label, icon, options?,
yes?, no?, bad? }`), `RULE_TONES`, `rulesOf(v)` (`{ values, note, tone, known, restricted }`), `unknownRules(v)` (the
stored answers to rules this build does not know, as stored: the venue form keeps them), `rulesLevel(v)` (`''`,
`'ok'`, `'some'`, `'strict'`), `rulesChipText(v)` (`null`, or `{ level, label, spoken }`), `rulesList(v)`
(`{ no, restricted, yes, know, note, tone }`: the full rules, naming everything the chip counts: `no` the permissions
not allowed, `restricted` the facts and pick-lists whose answer restricts (`Age limit: 21+`, `Cash only`), `know`
the other facts and pick-lists; a fact in its own words, a pick-list's choice always after its rule's name, never
`21+` alone), `showRulesVenue(b)` (the saved venue of a show that is not cancelled, else `null`). The
colour: a tone set by hand wins; else red (`strict`) when phones are not allowed, or neither pro cameras nor
point-and-shoots are; amber (`some`) when anything else is restricted (an age limit, ID needed, cash only, strobes
count) or when there is free text (a written rule is a rule, with answers beside it or without); green (`ok`) when
at least one answer is known, nothing is restricted and there is no free text; nothing when the venue has no answer,
no note and no tone. The chip names the main rule (`📷 Pro cameras ✗ · 1 more`, `📵 No phones or cameras`, `🔞 21+`,
`💵 Cash only`; free text counts as one more), reads `No restrictions`, or shows the start of the note when nothing
ticked is restricted (`📝 Shoes off in the live room…`: its first line, cut at a word before the 28th character, with no
comma or full stop left hanging before the …). A tone set by hand changes the colour and leaves the words shown as
they are, but it is the person's own judgement, so it is never carried by colour alone: the spoken words say it
(`House rules, set to strict: Pro cameras not allowed, and 1 more`; with nothing else to say, `House rules, set to
strict`), and `rulesList(v).tone` gives it for the full rules (`Strict, set by hand`; `''` when the colour is automatic).
`spoken` (`House rules: Pro cameras not allowed, and 1 more`) is for a screen reader. Both are text: set them with
`textContent`.

Earlier names (an act that changed its name): `sameName(a, b)` (the same but for capitals, spaces and punctuation;
a name made only of punctuation is compared as written), `cleanFormer(list, current)` (a stored list made safe:
`[{ name, until }]`, names with no day first in stored order, then the dated ones oldest first; entries that are no
name are dropped, a day that is no date reads as not known, the same name twice running is one name with its later
day, and a last name equal to the current one was no change and is dropped), `earlierNames(a)` (that, for an act),
`earlierSpans(a)` (the same with `from`, the day each began, `''` when unknown), `formerName(a)` (the latest: the
one for "formerly …" under the name), `nameSince(a)` (the day the current name began, or `''`), `nameOn(a, iso)`
(the name on a day: an earlier name up to the day before its `until`, the current name from that day on, and for a
date that is no date), `formerlyOn(a, iso)` (what to say beside a record of that day: the name then, or `''` when
that is the current name, also for a band that went back to an old name), `formerlyOf(b)` (the same for a booking
of any kind, by its **last** day: a festival weekend that reaches the day of the change has the new name),
`formerlyNote(b)` (the words by a booking's name: `formerly The Night Owls`, or `Owl Parliament, formerly The Night
Owls` when the booking has a title of its own that does not hold the act's name). None of them throws, whatever is
stored. **No page works a name out by itself.**

Use these instead of re-implementing them, so a show's numbers agree on every page. If one is wrong or missing, say
so in your report rather than forking it.

## Booking blocks (`js/blocks/*.js`)

The booking page (`pages/bookings.js`) shows a header (title, kind, status, date, times, venue, act, contact) and then
one collapsible box per block whose `kinds` include the booking's kind, sorted by `order`. The role decides which
(`js/blocks/index.js`): `blocksFor(kind)` in `.bk-blocks`; `foldedFor(kind)` in one closed fold after it,
`details#bk-more` "More boxes (n)" with its boxes in `.bk-more-blocks` (same `blk-<id>` ids, drawn closed with the
page and filled when opened; `ctx.open(id)` opens the fold first and keeps it open, under `'more'` in the booking's
open set); `hiddenFor(kind)` is everything not shown, including money boxes, which a role without money never sees.
A role's `pages.bookings.open` opens some boxes the first time a booking is drawn in a visit. With money off, new and
duplicated bookings start Confirmed and an act's members are not copied into the line-up. For a role with
`pages.bookings.score`, and for anyone who is asked "Did you see them?" (`askSeen()`), a show with an act, dated today
or earlier and not yet scored (`model.seenEntryFor`) has "★ Score <act>" in its header (`acts.js` `logSighting`), then
"★ Scored 86/100" with Edit; once the show is over (`model.showOver`) a "Didn’t go" button sits beside Score, and a
show answered so reads "Didn’t go" with Change (`model.markWent`); pressing Didn’t go is announced. The focus moves
to the new button after a save, a delete or an answer. A double press and a held Enter key each act once there (and in
the question's sheet): the second would land on the button the first one put in its place. A show answered No keeps
its "Didn’t go · Change" row for anyone, asked or not (someone who has since turned the question off, or become a
band): the calendar still says "Didn’t go", and the row is where that is taken back. When such a person presses
Change the row goes, and the focus moves to the act's chip above it. Such a show with no act says "Pick the act you saw to score this show." with a button that opens
its form on the act, but only for a role with `pages.bookings.score`: anyone who has the row only because they are
asked gets no row on a show with no act. A show at a saved venue with house rules shows them in full under the venue
checks (`rulesFull(venue, { where: 'show' })`). The header's left edge is the act's colour (`.card.bk-hero`), its
status drops under the name where the name would be squeezed, and its Details button carries `data-fk`, so it gets
the focus back when the venue's sheet closes over a page that was drawn again. With money off (`moneyShown()` false), the status choices leave out Paid / settled
unless the booking already has it, a status change never writes or clears a settlement, the advance checklist leaves out
the money lines (`model.MONEY_CHECKS`), the session clock shows no fee, the advance email asks nothing about pay or
settling, and the Notes box, Delete sheet and walkthroughs speak of the person's own notes (the Notes words follow
`blockShown('daysheet')`).

```js
export default {
  id: 'deal', title: 'Deal & fee', icon: '🤝', order: 10, kinds: ['show'],
  summary(b) { return '$250 vs 70%'; },          // short text on the closed box ('' when nothing to say)
  render(b, ctx) { return node; },               // the open box's body
  tutorial: [ ...steps ],                         // optional: added to the booking page's walkthrough
                                                  // (or (b) => steps, for words that follow the role)
};
```

* `b` is the current booking record; read related records from `db` at render time.
* Write with `patch('bookings', b.id, { … })` or `update(d => { const x = d.bookings.find(r => r.id === b.id); …;
  x.updatedAt = Date.now(); })`. The page redraws itself after every change.
* `ctx`: `{ sym }` (currency symbol) and `ctx.open(blockId)` (open another block, e.g. settlement → money).
* Each box is `<details class="blk" id="blk-<id>">`. Its open state survives redraws.
* Big editors open in a sheet (`util.sheet` / `form.openForm`), not inline.

| Block | Owner | Kinds | What |
|---|---|---|---|
| `deal` (10) | show | show | Deal type, fee, %, ticket price, capacity, costs, deposit (due, paid). Shows what it pays at 50%, 75%, full. |
| `clock` (12) | studio | session, rehearsal | Session clock: start/stop/break; hours vs planned; feeds the invoice. |
| `advance` (15) | bookings | show, session, rehearsal | Checklist per kind (advance a show; prep a session), editable lines. |
| `running` (20) | show | show | Running order: doors, support, changeovers, our set; computed from set length. |
| `worksongs` (25) | studio | session | Songs worked on (from Songs; add new). |
| `lineup` (30) | bookings | all | Who is playing/working (People) and what gear goes (Backline, stage packs), with clash warnings. |
| `takes` (35) | studio | session | This session's take log (opens/creates a log in Studio log). |
| `setlist` (40) | songs | show, rehearsal | Pick or make a setlist; its length vs the set length; print the stage copy. |
| `guests` (45) | show | show | Guest list with +1s and a cap; tick in at the door. |
| `daysheet` (50) | daysheet | show, session, rehearsal | Preview, print, save, and share the day sheet link with the band. |
| `deliverables` (55) | studio | session | Mixes, masters, stems… with due dates and done ticks. |
| `settlement` (60) | show | show | The night: tickets, comps, merch counts, costs, received; what the band made; payouts per person. |
| `budget` (65) | money | all | Our costs: travel, hotel, van, per diems, hire. |
| `money` (70) | money | show, session, other | Quote and invoice for the booking: lines, tax, numbering, payments, client link. |
| `notes` (95) | bookings | all | Free notes. |

## Shared API between features

Each of these exists from the start as a stub with this exact signature. The owner replaces the stub; everyone else
may call it.

| Export | Owner | Signature / behaviour |
|---|---|---|
| `pages/bookings.js` `openBooking(id)` | bookings | Go to Bookings and show that booking's page. Returns a promise. |
| `js/bookings-cal.js` `calendarView(ctx)` / `calendarSteps(ctx)` | calendar | The page while no booking is open (every view, with Coming up under it) / its walkthrough as drawn now. `ctx` is built once in `pages/bookings.js`: `{ S, go, showBooking, newBooking, holdToDelete, exportCalendar, passes, filtersOn, root }`. The calendar never imports the page. |
| `js/bookings-cal.js` `bookingCard(b)` | calendar | Coming up's card for a list outside the calendar (the search): drawn by the same code, without press-and-hold to delete or its title. Its own tap would open the booking inside the calendar's page, so the list it goes in takes the click in the capture phase. A card for a booking that is over says nothing where Coming up says "On now". |
| `js/search.js` `initSearch(btn)` / `openSearch()` / `actNames(a)` / `fold(s)` / `searchFor(q)` / `searchStats()` | search | Wire the top bar's button and the `/` key (`app.js`, once) / open the search / every name an act is known by: its name now, then its earlier names, the latest first (`model.earlierNames`; the one place the search reads a band's names) / text as the search compares it (no capitals, no accents) / for checks: what a search finds, and how long it took (below). |
| `js/bookings-kit.js` `cardExtras(b, { day })` / `overlapNote(b, day)` / `wentMark(b)` | core | What a Coming up card and a Week row add under their own lines, in order: the overlap note (`span.bk-overlap`; a Week row passes its `day`, so a booking over several days has the note only on the day of the clash), the house-rules chip (`rulesChip(b)`), "Didn’t go" (`span.pill.bk-went`). Spans with no control inside, because cards are buttons. They are direct children of `.bk-card-main` / `.bk-wrow-main`. |
| `js/bookings-kit.js` `formerlyLine(b)` | core | `span.bk-formerly` with `model.formerlyNote(b)`, or `null`: the line under the name of a booking from before its act changed its name. A Coming up card and a Week row put it straight after their top line (`.bk-card-top`, `.bk-wrow-top`), the booking's header after `.bk-hero-top`. |
| `js/deck.js` `createDeck(root, tabs, { start, onSelect, extras, onExtra })` | core | The section menu. `tabs`: `[{ id, label, icon?, bonus?, count?() }]`; the icon is the digital player's cover art and the picture on its tab. Returns `{ go(i), index, refresh(), setTabs(tabs, index) }`. |
| `js/bookings-kit.js` `calMode()` / `saveCalMode(mode)` / `CAL_MODES`; `isoOk`, `monthStart`, `addDays`, `daysBetween`, `multi`, `dateRange`, `safeColor`, `actOf`, `actStyle`, `tone`, `pill`, `plural`, `sortByName`, `capital`, `KIND_CHIP` | core | The calendar's view kept on the device; the small helpers the booking page and the calendar share. |
| `js/acts-ask.js` `askAtOpen(ids)` / `askPref()` | acts | The "Did you see them?" sheet for the shows still waiting among `ids` (nothing when the person is not asked, none is left, or its sheet is already up: there are never two); it opens its sheet before it returns. `app.js` calls it at open and again after hours in the background / the control for Settings → Your role. It imports `pages/acts.js` (`logSighting`) and `acts-docs.js`, so Settings loads the acts page's code with it; `pages/acts.js` must not import it. |
| `js/venues-rules.js` `rulesChip(b)` / `venueChip(v)` / `rulesFull(v, { where })` / `rulesEditor(v)` | venues | A show's house-rules chip, or `null` / the same for a venue / the full rules (`where: 'venue' \| 'show'`), or `null` / the House rules part of the venue form: `{ node, read() }`. It draws what `model.js` returns and imports `util.js` and `model.js` only. |
| `pages/bookings.js` `newBooking(preset)` | bookings | Open the new-booking form, prefilled (`{ kind, actId, venueId, date, setlistId }`). |
| `pages/acts.js` `openAct(id)` / `editAct(a, onSaved)` / `printRider(actId)` | acts | View sheet / edit form / print the tech rider. |
| `pages/acts.js` `openSeen(actId, seenId)` | acts | Go to the acts list with that act's card dropped open, the time seen in view and the focus on its Edit button (the search opens a time seen this way). Resolves with the entry's row once drawn, or `null` when the act or the entry is gone. |
| `pages/acts.js` `logSighting(a, entry)` | acts | Add (no `entry.id`) or edit a time seen, prefilled (`{ date, venueId, where, bookingId }`): Score this show uses it. Every save links the entry to the act's show on its date (the one it came from while that still fits, else the act's only show that day, or the one at the venue picked); a new entry on a night whose show is already in the log asks first, and OK updates that entry instead. |
| `pages/people.js` `openPerson(id)` / `editPerson(p, onSaved)` | people | View sheet / edit form (it also edits which acts the person is in: `act.members`). |
| `pages/songs.js` `openSong(id)` / `editSong(s, onSaved)` | songs | View sheet / edit form. |
| `js/setlist.js` `openSetlist(id, { target, bookingId })` / `newSetlist(preset)` / `printSetlist(id, { bookingId })` / `setlistText(list)` | songs | Editor sheet (target = slot minutes) / create and return the record / print the big stage copy (with the show's date, venue and set time) / plain text. |
| `pages/sessions.js` `openLog(id)` / `newLog(preset)` | studio | Go to Studio log and open that log / create one (`{ bookingId, songId, title }`) and open it. Resolves once drawn, at the top, with the focus on + Take when the opener went away. |
| `pages/backline.js` `editGear(g, onSaved)` / `editKit(k, onSaved)` | backline | Edit forms. |
| `pages/venues.js` `openVenue(id)` / `editVenue(v, onSaved)` / `venueWarnings(b)` | venues | View sheet / edit form / warnings for a booking at that venue (curfew before the set ends, noise limit, capacity < tickets…) as strings. |
| `js/daysheet.js` `openDaySheet(bookingId)` / `printDaySheet(bookingId)` | daysheet | Preview sheet / print. |
| `js/money.js` `docOf(b, 'quote'|'invoice')` / `docTotals(doc)` / `isOverdue(b)` | money | The document or null / `{ net, tax, total, paid, due }` / unpaid past due. |
| `js/money.js` `billingPanel()` / `priceListPanel()` | money | Nodes for Settings: numbering, tax, payment details; the person's price list. |
| `js/clock.js` `initClockBar(el)` / `clockCard(b)` | studio | The strip under the section menu while a clock runs / start-stop card. |
| `js/clock.js` `clockHours(bookingId)` / `runningShift()` | studio | Hours worked by the clock, breaks taken off (money bills them) / the running shift or null. |
| `js/backup.js` `openBackupSheet()` / `nudgeIfStale()` / `backupPanel()` | settings | ☁ sheet / an occasional reminder / the panel used in Settings. |
| `js/tour.js` `sheetTutorial(title, steps)` | core | Register walkthrough steps for a sheet by its title. |
| `blocks/running.js` `sortedRows(b)` / `runningWarnings(b)` / `dayClock(b)` | show | The running order in the night's order (after-midnight aware) / its warnings / the day's clock. |
| `blocks/guests.js` `guestCounts(b)`; `blocks/settlement.js` `isSettled(b)` / `settlementDoc(b)` | show | Names, heads and in / whether the night is settled / the printable settlement. |
| `js/daysheet-doc.js` `cleanDaySheet(data)` / renderer | daysheet | Pure (no store): the whitelist and renderer shared by the app and `daysheet.html`. |
| `js/ics.js` `bookingIcs(b)` / `allIcs(list)` | bookings | Calendar files (RFC 5545, past-midnight safe: an end after midnight is the next day, and a show that starts and plays before 06:00 starts the morning after its date, while anything else before 06:00 is on its date, as Gdex shows it; no money). |
| `js/print.js` `printElement(el, css)` / `docPage(title, el, css)` / `saveFile(text, name, type)` / `fileName(title, ext)` / `csv(rows)` | core | Printing and saving documents. |

`onSaved(record)` is called with the stored record after a form saves.

### The calendar and the booking page

`pages/bookings.js` keeps the state: `S = { view: 'cal' | 'booking', mode, day, id, kind, act, all }`. `S.mode` is the
calendar's view (`month`, `two`, `week`, `three`, `day`) and `S.day` the one anchor day every view is drawn around (the
month shown is the month of `S.day`; there is no separate month cursor). **`S.day` is always a valid `YYYY-MM-DD`**: a
booking can lack a date, so `openBooking` and `showBooking` keep the day they had, and every draw checks it. Change
`S` only through `go(patch, { top })`. `showBooking(b, day?)` opens a booking's page (`day`: the day it was tapped on,
so Back returns there); Back from a booking, and a booking deleted while open, land on the Day view of its day
(`go({ view: 'cal', mode: 'day', day })`), which does not change the saved view.

**When the day turns** with Gdex open (it is left on screen over midnight, or brought back from the background on
another day), the calendar moves on: `app.js` calls `dayTurned()` (exported by `pages/bookings.js`) from a timer set for
just after the next local midnight (set afresh at every call), on `visibilitychange` to visible and on every
`pageshow`. When today is not the day the page last knew, a calendar whose `S.day` was that day moves to the new today
(one moved to another day, and a booking's page with its day for Back, stay as they are), and `app.js` calls
`store.redraw()`: today's mark, Coming up, + New's date, the menu's count and every "Today" / "Tomorrow" follow.
In the small hours `app.js` (`tonightCheck`, at every change of the data and every look at the day) also sets a timer
for the end of the first of last night's shows still to play (`model.tonightShows`), or 06:00, and draws the page and
the menu's count again then. `13-calendar` moves Playwright's page clock over midnight (`fastForward` fires the timer; `setSystemTime` fires none,
for the checks that come back from out of sight).

Hooks the specs and walkthroughs rely on, whatever the view: `.bk-calview` (the calendar's frame, also
`.bk-mode-<mode>`), `.bk-monthview` (on it only in the month), `.bk-dayview` (only in the Day view),
`.bk-day[data-date]` (a day square; today is `.today[aria-current="date"]`; `.bk-day-tall` in two weeks),
`.bk-ev[data-id]` (an entry in the view's own body, never a Coming up card), `.bk-agenda .bk-card[data-id]`,
`#bk-agenda-more`, `.bk-agenda-head`, `.bk-filters .chips`, `.bk-export`, `.bk-new`, `.bk-new-day`, `.bk-none` (the
"nothing on" line), `.bk-cal-panel .cal-title`, `#bk-view-<mode>` (the view buttons, in `.bk-views`), `.bk-body` (the
view's body, which takes the swipe). Ids, because the page is rebuilt after every change and the focus is given back
by id: `#bk-wd-<iso>` (a Week day's name), `#bk-gh-<iso>` (a day's name over its grid column),
`#bk-ev-<bookingId>-<iso>` (a Week row, `.bk-wrow`, or a grid block, `.bk-block`), `#bk-ev-<bookingId>-any` (a pill in
the grid's "any time" row, `.bk-ev-any`), `.bk-col[data-day]` (a grid column).
**Under `.bk-dayview` a bare `[data-id]` also matches the Coming up card of the same booking: use `.bk-ev[data-id]`.**

### The calendar's five views (`js/bookings-cal.js`)

One frame around every view: the head, the filter chips (they apply in every view), the panel (the row of view
buttons, ‹ title Today ›, the view's body, the legend under squares) and Coming up. Only a view button saves the view
(`saveCalMode`); a day opened from a square, a day's name or Back from a booking is the Day view for this visit.

* **‹ › and Today** step by the length of the view. The title is not a live region (the page is drawn again at every
  step, and a live region that arrives with its words in it is not read out): each step says the new title through
  `announce()`. Today's spoken name starts with the word it shows (`Today, this week`; in the Day view just `Today`),
  so a person who says or types "Today" finds it. In the Day view the title is the view's heading (`h2.cal-title[tabindex=-1][data-view-head]`); it
  takes a row of its own above the arrows under 480 px (every view's does under 360 px, and with extra-large text).
  A range's title comes from `Intl.DateTimeFormat(…).formatRange`, with the year whenever the range is not wholly in
  this year.
* **Month and 2 weeks** are day squares. A tall square (two weeks) holds up to three lines, then "+N", the time
  (`span.bk-mini-time`) and the name (`span.bk-mini-name`) apart. In a square narrower than 6.5rem (every phone, and
  large text) the name is on a line of its own under the time, cut with an ellipsis, and the text shrinks with the
  square (to .7rem at most) so the time always shows whole; on a phone of 360 px or more the squares are 124 px tall
  at least, for three such lines. Under 32 px inside (seven squares across 320 px) the name is left out and the time
  is alone, in squares no taller than the lines need (78 px at least). A booking over several days is named on its
  first day and on each Monday; the month also names it on a 1st (the days before are on another page), the two weeks
  do not. A line that runs on from the day before is blank, as high as the line it runs on from. A square's spoken name lists its bookings in order,
  each with ", formerly <name>" after its name for a booking from before its act changed its name, then its status,
  and ", didn’t go" for a show answered so (there is no room to write either in a square).
  Arrow keys move between squares; past the edge of two weeks they step as ‹ › do.
* **Week** is `section.bk-wday` per day: `h3.bk-wday-h > button.bk-wday-head` (the day's name; a tap opens the day),
  then its rows in playing order, each with `cardExtras(b)` as direct children of `span.bk-wrow-main`. A show with no
  on-stage time yet starts its muted line with the time it is sorted by and that time's name, as its card and its block
  do (`Doors 19:30`, `Soundcheck 17:00`; never a bare "doors"). An empty day
  reads "Nothing on" on the same line as its name. A row with no time has a dash (`aria-hidden`) and says "no time
  yet" once, in its muted line.
* **3 days and Day** are a time grid (`.bk-grid`, `--n` columns, `--hh` px an hour: 44, or 52 in the Day view). Only
  bookings that are on one of its days are drawn (a date that is no day, a 30 February from an old backup, is on
  none). Blocks are placed by `playKey` (a show's times on the night clock); the hours run from the hour of the
  earliest block (05:00 for a 05:15 rehearsal, never before 00:00) to the latest end, 06:00 the next morning at most;
  lanes follow where the blocks are drawn, so a set too short for its
  minimum height (26 px in three days; in the Day view a button's height, `var(--hit)`, which grows with Button size)
  pushes the next one beside it rather than under it, and two that only touch share a lane. Each block then widens to
  the right over the lanes that hold nothing at its height (blocks stay side by side only where sets really overlap).
  A block narrower than a quarter of its column in three days, or an eighth in one, gives up its side padding
  (`bk-block-slim`). Bookings with no time,
  and every booking over several days, are pills in the "any time" row; "No times set yet." shows only when no pill
  has a time. Three days with nothing on keep their three day names above "Nothing on these three days."; a Day with
  nothing on draws no grid. The walkthrough's "The calendar" step says what is drawn (`gridHelp`): hours when there
  are some; with only the "any time" row, that nothing has a time yet (when "No times set yet." shows) or that a
  booking over several days sits there; three days with nothing on are their names, to tap; an empty Day has no step. Blocks, pills and tall squares are CSS containers (`bk-entry`, `bk-square`): a block
  shorter than two lines puts its name and time on one line, and a narrow one drops the kind's icon and the word
  before the time ("Doors"), which a screen reader still gets.
* **What a block says.** A block or pill is too small for the overlap note and the house-rules chip: a hidden span
  carries, in order, the name the act had that night for a booking from before it changed its name (`Formerly The
  Night Owls`), its days (a pill), the status, `model.overlapText(b)`, the house rules as spoken (from
  `model.rulesChipText`, never read out of the chip's nodes) and "Didn’t go", each with a full stop. In the Day view a
  block's second line also shows where it is, or " · Didn’t go" in its place (`span.bk-block-went[aria-hidden]`, so a
  screen reader hears it once). In three days there is no room for it: the hidden words have it.
* **Press and hold** a row, a block, a pill or a Coming up card for three seconds to delete it (`holdToDelete`). What
  was pressed goes with the booking, so the draw that follows puts the focus on the view's heading
  (`[data-view-head]`).

### When Gdex opens

`js/app.js` works out, as it boots, the shows that were waiting for "Did you see them?" (`waitingShows(now, { holds:
true })`, from the database as loaded), and after the role question and the welcome tour, once no sheet or tour is on
screen, calls `askAtOpen(ids)` once. With nothing waiting, `js/acts-ask.js` is never fetched. Data added after boot
is not asked about at that open; `askAtOpen` decides whether the person is asked.

Coming back counts as opening, for the question only (an installed app is seldom loaded afresh). After three hours or
more out of sight (the document hidden, or the page restored from the back/forward cache; the moment it left is kept
in memory only, by `Date.now()`), `app.js` works the list out again (`askSeen()`, then `waitingShows(now, { holds:
!moneyShown() })`) and calls `askAtOpen(ids)` once the screen is clear, on whatever section the person was on: only a
fresh load opens on the calendar. It asks nothing while the question's own sheet is still up, which it takes to be the
sheet on screen straight after `askAtOpen` returns: so `askAtOpen` opens its sheet before it returns, and can be called
more than once in a visit.

### The section menu (`js/deck.js`)

Three menus, one module: `buildRecord()`, `buildTape()`, `buildDigital()`; `paint()` fills whichever is drawn. Classes
every menu has, which specs and the app wait for: `#deck .dk-next`, `.dk-prev`, `.dk-list`, `.dk-swipe`, `.dk-name`,
`.dk-meta`; in the list sheet `.dk-sheet`, `.dk-sides`, `.dk-track[data-section]` (the current one `.on`,
`aria-current="true"`), `.dk-bonus`.

The digital player: `div.dk-player` (the bar: `button.dk-now.dk-swipe` with `span.dk-art`, "Now playing",
`strong.dk-name`, `span.dk-meta`; `div.dk-keys`; the line `span.dk-progress > i.dk-fill`) and under it
`div.dk-tabs[role=group]` of `button.dk-tab[data-section]` (the current one `.on` and `aria-current="page"`; a tab is
`span.dk-tab-ico` and `span.dk-tab-name[data-name]`; the open bonus track is the last tab, "★ Name", with
`aria-label="<name>, bonus track"`). Its list sheet is `div.dk-sheet.dk-queue`, one list numbered from 1 ("1 track"
for a menu of one).

* `.dk-meta` holds two spans: `.dk-meta-at` ("Track 2 of 11", or "Bonus track") and `.dk-meta-n` (" · 2 acts"). The
  line is one line high: the count shows when it fits and is left out whole when it does not (on a touch phone under
  about 412 px wide it never fits). **A spec reads `.dk-meta`'s `textContent`, which is always complete.**
* The bar is at most 72 px tall at standard sizes from 345 px wide; narrower, or with larger text or buttons, the keys
  take a line of their own. With the row of tabs the whole menu is about 150 px against the record's 197; with
  extra-large text *and* buttons at about 412 to 430 px wide it is taller than the record (239 px against 208).
* The row of tabs scrolls inside itself and brings the current tab into view (28 px of its neighbour showing) on a
  section change, a fresh draw, a display-preference change and a change of width; a tab that takes the keyboard's
  focus is brought wholly into view too, never one that is tapped. ← → on a focused tab move the section and the
  focus with it.
* The line slides to its new place and nothing else moves; it follows the animation setting. With Contrast set to
  High the line is the text colour on a quiet track. The cover art and the current tab have a soft light of `--paper`
  behind the icon, and "Now playing" and the track line are a little stronger than `--muted` (4.28:1 on the deck in
  the light Stage theme).

### "Did you see them?" (`js/acts-ask.js`)

The sheet's body is `div.ac-ask`: a line of help, `div.list.ac-ask-list` with one `div.card.ac-ask-row[data-id]` per
show (newest first; `span.ac-ask-main`, then `span.ac-ask-answer` holding the row's buttons), and Done
(`#ac-ask-close`). Buttons: `#ac-ask-yes-<id>`, `#ac-ask-no-<id>`, `#ac-ask-edit-<id>`, `#ac-ask-change-<id>`. The
sheet remembers nothing: a row's state is `model.seenAnswer(b)` read from the store, and every answer is saved as it
is given. A row goes when its booking is deleted or stops being a live show with an act; with no row left the sheet
closes. On close the page (`#page`) takes the focus only when the focus is nowhere.

The Settings control (`askPref()`, under the role cards) is `div.pref.ac-ask-pref[role=group]` with `div.seg.wide` of
`#ac-ask-auto`, `#ac-ask-on`, `#ac-ask-off`, laid out by `css/acts.css` as a wrapping row (each button has a
`data-label`, so the row does not shift when the bold moves). Its note follows the role: a role that scores shows on
their own pages (`pages.bookings.score`) is told it can still score "from its own page or the act’s card" after Never
ask; anyone else, "from the act’s card", because their ★ Score row is there only while they are asked.

The "Log a time seen" form opens with a date and a score of 75 in it, so a single Enter saves it; a held Enter (the
press that opened it, still down) does not.

### Earlier names: "formerly …" (`js/model.js`, `js/pages/acts.js`)

An act that changed its name keeps the old ones (`act.formerNames`, read only through the model's helpers above).
Every record goes on using the current name, so lists and search stay in one piece; what is added is words.

* **On the act.** `span.ac-formerly` ("formerly The Night Owls", the latest earlier name) straight after
  `.ac-card-top` inside the card's head button, so it is part of the button's name, and `p.ac-formerly` straight
  after `h1.ac-title` on the act's page. The Overview lists them all in `section#ac-names` ("Earlier names",
  `ul.ac-names`, the latest first): `from <day> until <day>`, `until <day>` for the first dated one, `on <day>` for
  a name used for less than a day (renamed twice that day), `date not known` for a name with no day. Days are written
  by `toLocaleDateString` with the year.
* **Records from before a change.** Where a row names the act, `formerlyLine(b)` goes under the name: Coming up cards,
  Week rows, the booking's header. A venue's rows have `span.vn-row-was`, a backline item's `span.bl-row-was`, a
  person's `span.pp-bk-was`, a song's studio sessions a `span.sg-block` and a row of "Did you see them?"
  `span.ac-formerly`, all after the name; a take log's card in the Studio log, and the link to its session on the
  log's own page, add the words after the session's name. Where there is no room the words are only spoken: a day
  square's `aria-label` has them after the booking's name (`Owl Parliament @ The Crown, formerly The Night Owls
  (Confirmed)`), and a grid block's or pill's hidden words
  start with them (`Formerly The Night Owls. Confirmed.`). In the act's own lists the name is not on each row, so a
  row says `as The Night Owls`: `span.ac-as` in the log of times seen (`model.formerlyOn(a, entry.date)`), and ` · as
  …` at the end of a date on the card, of a past show in "From a past show" and of a booking on the act's page. A
  booking is dated by its last day, a time seen by its date. Coming up can only show the line when a stored day is
  still to come (a clock set wrong, a file edited by hand): the form and the question both refuse a day after today.
* **The question.** `editAct`'s form asks once, as a changed name is saved: the sheet "New name?" (`div.ac-rename`:
  `.ac-rename-old`, `.ac-rename-now`, `input#ac-rename-since`, `p#ac-rename-err[role=alert]`, `#ac-rename-new`
  "It’s a new name", `#ac-rename-fix` "Just fixing the spelling"). It is asked only for an act that is already
  stored, whose stored name is not empty, when the names are not `sameName`. `form.js` closes a form before it
  calls `onSave`, so the act form listens for `submit` on the sheet's body in the capture phase and stops it there:
  the form stays open under the question with everything typed in it, and an answer calls `form.requestSubmit()`,
  which saves as any save does (the other fields with it). Closing the question without an answer saves nothing
  and puts the focus back in the form (on Save, or in the name box when Enter asked). The day starts on today,
  cannot be after it, and cannot be before the day the old name began (`model.nameSince`, from the form's rows as
  they stand); a day outside that is refused in words, with the focus on the date. "It’s a new name" adds
  `{ name: <old name>, until: <day> }`; a spelling fix adds nothing. The focus arrives on the date, never on an
  answer, so a held Enter answers nothing; an answer saves the form under it at once, so for a moment after it the
  second click of a double click is stopped before it reaches the page under both sheets; the dialog is described (`aria-describedby`) by a hidden sentence,
  `<old name> becomes <new name>.`, and the question.
* **The form's part.** `div.field.wide.ac-was[role=group]` straight after the Name field: `div.ac-was-row` per name
  (the latest first) with `input.ac-was-name`, `label.ac-was-until > input[type=date]` (`max` today, so the form's
  own validation refuses a later day; a stored day after today, from a backup made a time zone ahead or a clock set
  wrong, is its own `max` until it is changed, so it never stops a save of the rest of the form; it may be empty) and `button.ac-was-del`, then `#ac-was-add`. With no name
  there is only the button (the label and the hint are `hidden`). Every save stores `cleanFormer(rows, name)`,
  oldest first, and gives an act that never had the key no empty list.
* **Walkthroughs.** The act form's has an "Earlier names" step (`.ac-was`), and its Name step speaks of the question
  only in the Edit form; "New name?" has three steps of its own; the act's page gets an "Earlier names" step
  (`#ac-names`) only when the act has one, so an act that never changed its name keeps the tour it had.
* **Search.** Every search that finds things by an act's name matches its earlier names too: the top bar's search
  (`js/search.js`, below: every booking and time seen of the band, by any name it has had), the acts list, People,
  Songs, the Studio log and the two song pickers (a setlist's + Songs, the metronome's song tempo); the booking form
  lists an act as `Owl Parliament (formerly The Night Owls)`.
* **Never outside Gdex.** Documents, calendar files and spreadsheets call `actName` / `bookingTitle` / `a.name`,
  which are the current name; `44-formerly` checks each of them. A document made before the change keeps the
  words it was made with (an invoice's lines are stored text), as does a booking's own typed title.

### House rules, drawn (`js/venues-rules.js`, `js/pages/venues.js`)

* The chip: `span.vn-chip.vn-chip-<ok|some|strict>` with the visible words in `> [aria-hidden=true]` and the spoken
  ones in `> .sr-only` (the chip's whole `textContent` runs both together). On Coming up cards and Week rows through
  `cardExtras`, on the venue's card, and at the head of the full rules.
* The full rules: `div.vn-rules` (`.vn-rules-show` on a show's page, in a box of its own) with a head line and
  `dl.vn-rules-list` (Not allowed, Restricted, Allowed, Good to know, Other rules, and How strict when the colour was set by hand:
  `Strict, set by hand`). On the venue's sheet they sit in
  `section.vn-rules-sec`, where the head line's "House rules" is hidden under the section's own heading.
* The form's part: `div.vn-rules-edit`, a `fieldset.vn-rules-group` per group, one `div.vn-rule[data-rule]` per rule
  with `#vn-rule-<id>-yes` and `#vn-rule-<id>-no` (`aria-pressed`), or `select#vn-rule-<id>` for a pick-list. Each
  button holds a tick-box (`span.vn-rule-mark`) that is always there and is filled on press, so a press changes no
  size. Rows and the rules list change layout by their own box's width (container queries): on a phone a rule's name
  has a line of its own with its two buttons under it.
* The rules' words are sized in rem, so they follow the Text size setting (plain page text is a fixed 16 px).
* The form's walkthrough points at one rule (`.vn-rules-edit .vn-rule`), not the whole block, which is taller than a
  phone. The venue's sheet keeps the focus across its own redraw, and venue cards carry `data-fk="vn-<id>"`, so the
  focus comes back to the card when the sheet closes after an edit.
* Venue search reads the written rules through `rulesOf(v).note`, and the ticked ones in the words a person searches
  by: a permission as "no phones" and "phones not allowed", or "phones allowed"; a fact in its own words ("cash only",
  "no strobe lighting"); a pick with and without its rule's name ("age limit 21+", "21+"). What is typed must start a
  word there with no "no" or "not" before it, so "strobe" finds strobe lighting and never "no strobe lighting", and
  "phones allowed" never a venue where they are not. A venue's "Before" list marks a show answered No
  with "Didn’t go" (`span.vn-row-went`).
* A rule's last word and its ✗ (`Pro cameras ✗`) are drawn in `span.vn-chip-nb` (no wrap), so on a narrow card the ✗
  never starts a line of its own; so is the chip's icon with the first letter of the word after it (`📷 P`), so the icon
  is never alone on a line (no line breaks inside a word, and a long first word, the start of a note, can still wrap
  where it must). The chip's text is the same.
* Delete in a venue's form closes its sheet, and what opened it (the venue's card, a show's Details) goes with the
  venue: once the page is drawn again, a focus left nowhere goes to the page's `[data-view-head]` (a show's title) or
  to `#page`.

### The search (`js/search.js`)

The magnifying glass, `#searchBtn` (named "Search", `aria-keyshortcuts="/"`), is the first button of the top bar in
`index.html`, on every page and in every role; `/` opens the search too, unless the focus is in a field or a sheet,
form or tour is up. `initSearch(btn)` wires both. While a sheet is up (the track list, a form, "Did you see them?")
the top bar is under its backdrop and `#app` is inert, so the button cannot be reached and `/` does nothing: the
question at opening always wins, and the search waits until it is answered or closed. On a phone (600 px and
narrower, 640 px with extra-large text) the small words "booking deck" beside GDEX are hidden; under 560 px the
brand keeps its width and the buttons narrow to share the rest of the row, so all five (with Install) fit at 320 px
with extra-large text and large buttons and GDEX is never cut short (`styles.css`, after `.top-actions`; `05-deck`
and `46-search` check it with Install hidden and showing).

* The search is one of Gdex's sheets (`util.sheet`, title "Search", `.sheet.srch-sheet`, its body `div.srch`), over
  whatever is on screen, which does not change. The box is `input#srch-q` (a label, `.srch-top`, stays at the top while
  the list scrolls). Escape and ✕ close it and the focus goes back to `#searchBtn`; a tap on a result closes it and the
  focus goes where the result opens. What was typed, the kind and the place picked, how many cards are drawn and how
  far the list was scrolled live in memory for the visit, so opening it again brings the last search back with its
  words selected. Nothing about a search is written to storage. A search typed over the last one (over the whole of
  its words selected, or with no word of one beginning a word of the other) starts again on Shows at every place; one
  narrowed or widened keeps them.
* **What is searched**, built once per change of the data (any store change drops the index; the next search builds
  it): for each booking with a date, the act's names (`actNames(a)`: the name it has now and every earlier name, so a
  renamed band is found by any of them on every record, before and after the change) and genre, the client, the place
  (the saved venue's name and address, or the venue name and address typed on the booking), its title, the other acts
  on its bill (running-order slots that are not ours and not a marker such as Doors, with or without a length), its
  notes, and the notes and typed place of the act's time seen for it (`model.seenEntryFor`). For each time seen that
  belongs to no booking: the act's names and genre, the place (a saved venue, or the words typed: words that are
  exactly one saved venue's name count as that venue) and its notes. Every word typed, without the punctuation around
  it, must be found somewhere in a record's words (`fold`: no capitals, no accents).
* **A support act's time seen.** A time seen that is not on a show of its own act (no live show of that act covers
  its day) belongs to another act's live booking that covers its day, at its place (the same place key: the same
  venue, or the same words typed), and has the act on its bill: a slot that is one of `actNames(a)` by
  `model.sameName`, also with a note in brackets after it ("Chelsea Wolfe (support)"). With two, the one that plays
  first (`model.byPlay`); a cancelled booking takes none. It is then not a record of its own: the booking's record
  holds it (`guests`), and is found by its act's names, genre, typed place and notes as well.
* **What comes up**, in `.srch-out`: `p.srch-help` before anything is typed; else `p.srch-found` ("9 shows at 4
  places"; "No sessions found. 4 shows at The Church" when the kind picked holds nothing and another does: the list
  moves to shows, else to the first kind in the role's order that has results), the kind row
  `div.srch-kinds[role=group]` of `.chip[data-kind][aria-pressed]` (left out when one kind was found; Other, the diary
  entries, has a chip too), the place chips `div.srch-places[role=group]` (`#srch-place-all`, then
  `.chip[data-place]`, busiest first, at most 24, then `.srch-more-places`; a second tap on the pressed one undoes it;
  left out when everything found is at one place) and `ul.srch-list[aria-label=Results]`, one `li` per card, newest
  first, with `li.srch-today` between what is still ahead (a booking until its last day is over) and what is over,
  left out when everything is on one side. The first 30 cards are drawn; `#srch-more` adds 30. Nothing found:
  `p.srch-none`. A pressed chip has a tick (`.srch-tick`) as well as its colour. The count ("9 results", "No results")
  is announced half a second after the typing stops, when it has changed.
* **The cards.** A booking is the calendar's own card (`bookingCard(b)`), so its status, the overlap note, the
  house-rules chip, "Didn’t go", "formerly …" (`formerlyLine(b)`, item 7) and anything added to Coming up's card read
  as they do there. The search adds the year under the date when it is not this year (`.srch-year`), the band when a
  title of the booking's own hides it (`.srch-who`, "Band: The Night Owls", in the role's word; left out when the
  card's own line already names the band, as it does for a booking from before the band changed its name: "Owl
  Parliament, formerly The Night Owls"), the score of the act's time seen for it (`.srch-score`, "★ Scored 92/100"),
  the score of each support act's time seen that belongs to it (`.srch-score.srch-guest`, by name: "★ Chelsea Wolfe
  88/100", "★ Owl Parliament (formerly The Night Owls) 88/100" from before that act's change), and why it was found
  when its own words do not show it (`.srch-why`: "Also on the bill: …", then "Earlier name: …" for a word found only
  in a name the band had before or after that night (as few names as explain it), then "Notes: …"). A time seen with
  no booking is `button.bk-card.srch-seen[data-act][data-seen]`: the date, "Act @ place" (the name now), from before
  a change `span.bk-formerly` "formerly <the name that night>" (`model.formerlyOn`) as on a booking's card, "From the
  log" and the score. A booking opens with `openBooking(id)`, a time seen with `openSeen(actId, seenId)` (its row is
  marked `.srch-hit` for a moment, and says "as …" from before a change). Money never shows: the card has none.
* **Keyboard.** Tab goes from the box through the kind row and the place chips to the cards; ↓ or Enter in the box
  goes to the first card, ↓ ↑ walk the cards and ↑ from the first goes back to the box. A redraw after a change to the
  data keeps the focus on the same card or chip.
* **Words** follow the role: an act, a band or an artist (`actWord()`), the role's names for Bookings and Acts, and
  "gigs" where the calendar is called Gigs. The sheet's ? runs its own walkthrough (`sheetTutorial('Search', …)`).
  The welcome tour does not name the top bar's buttons, so it does not name this one either.
* **For checks**: `searchFor(q)` (what a search finds, `[{ type: 'b' | 's', id, kind, date, place, guests }]`, `guests`
  the ids of the support acts' times seen a booking holds, without drawing it) and `searchStats()` (`{ builds,
  buildMs, findMs, drawMs, records }`). With 2,000 bookings and 200 bands the index takes about 30 ms to build (17 ms
  before earlier names and support acts were read) and a key press (search and draw) 15 to 25 ms on the test machine.

## Shared modules (core)

* `util.js`: `h(tag, attrs, ...kids)` (attrs: `class`, `onclick`…, `aria-*`, `data-*`, `html` for trusted markup
  only), `nodes`, `uid`, `pad`, `ymd`, `todayISO`, `parseISO`, `fmtLong`, `fmtShort`, `fmtTime`, `daysUntil`,
  `groupBy`, `toast(msg)`, `announce(msg)`, `sheet(title, body, { onClose })` → `{ el, close }` (a dialog that takes
  the focus itself 100 ms after it opens, unless something in it already has it: place your own focus sooner, as
  forms do at 50 ms and the track list at 60 ms; Escape or ✕ gives it back to the opener), `mapsUrl`, `telUrl`,
  `safeUrl` (always use it for user-typed links), `empty(msg, action)`, `backBtn(label, fn)`, `hold(el, ms, fn)` /
  `wasHeld(el)` (press and hold), `rateText(c, sym)`, `personRate(c)`.
* `form.js` `openForm({ title, fields, values, onSave(values), onDelete, saveLabel, confirmDelete, onReady(formEl) })`. Field `type`s: `text` (default),
  `tel`, `email`, `url`, `number` (`min`, `step`), `date`, `time`, `textarea` (`rows`), `select` (`options`: values or
  `[value, label]`), `checks` (`options: [{ value, label, group, hint }]`, returns an array), `rows` (`columns: [{ key,
  label, type, list }]`, returns an array of objects with string values), `place` (lat/lon with lookup; key `geo`).
  `list: [...]` gives a text box suggestions. `required`, `placeholder`, `hint`.
* `map.js`: `hasGeo(geo)`, `miniMap(venue)`, `mapButtons(venue)`, `directionsUrl(venue)`, `geocode(address)`.
* `qr.js`: `qrSvg(text)` → a Promise of the SVG markup (UTF-8; put it in with `h('div', { class: 'qr', html: await qrSvg(t) })`).
* `link-pack.js`: `pack(obj)` → string for a URL fragment; `unpack(str)` → obj.
* `version.js`: `VERSION`, `shareBase()` (where share pages live: build links as `shareBase() + 'daysheet.html#' + packed`).
* `print.js`: see above. Documents use the classes in `doc-css.js` (`.cs-doc`, `.cs-head`, `.cs-brand`, `.cs-kicker`,
  `.cs-when`, `.cs-times`/`.cs-time`, `.cs-sec`, `.cs-kv`, `table`, `.money-parties`, `.money-totals`, `.cs-foot`).
* `a11y.js`: `haptic()`, `menuStyle()` (`'record'`, `'tape'` or `'digital'`), `menuWords()` (the section menu in its
  own words: `{ list, tap, Tap }`), `applyPrefs()` (sets `data-palette`, `data-scheme`, `data-text`, `data-contrast`,
  `data-motion`, `data-targets` and `data-menu` on `html`). `tour.js`: `runTour(steps)`, `sheetTutorial()`.

## Styles

* Colours only from the theme tokens: `--bg`, `--bg2`, `--card`, `--line`, `--text`, `--muted`, `--accent`,
  `--accent-ink`, `--paper`, `--paper-ink`, `--danger`, `--ok`, `--amber`, `--blue`; sizes `--radius`, `--pad`, `--hit` (44px
  minimum touch target). Never hard-code colours in a page; every theme has a light and a dark scheme.
* Existing components (in `styles.css`): `.page-head`, `.btn` (`.primary`, `.ghost`, `.danger`, `.small`),
  `.icon-btn`, `.card` (`.tap` clickable), `.card-row`, `.grow`, `.list`, `.stats`/`.stat`, `.kv`, `.pill` (+ `st-*`
  tones), `.chip`, `.muted`, `.small`, `.warn`, `.empty`, `.actions`, `.stack`, `.seg` (segmented buttons), `.twirl`,
  `.qr`, `.meter`, `.form`, `.field`, `.sheet`.
* Your own styles go in **your** `css/<feature>.css` only, with class names prefixed for your feature
  (`.bk-`, `.sh-`, `.ds-`, `.mn-`, `.st-` is taken by status pills so studio uses `.sd-`, `.sg-` songs, `.ac-` acts,
  `.pp-` people, `.bl-` backline, `.vn-` venues, `.tl-` tools, `.se-` settings, `.ins-` insurance, `.srch-` search).
* The keyboard's focus ring is a 3 px outline in `--focus`: a light blue on dark pages and a dark blue on light ones;
  with high contrast yellow on dark and navy on light. It stands out 3:1 or better from `--bg`, `--bg2` and `--card`
  in every theme (`05-deck` measures all forty). A sheet itself has no ring when it holds the focus.
* Small grey words on `--bg2` (the calendar's panel, a show's house rules) use
  `color-mix(in srgb, var(--muted) 70%, var(--text))`: plain `--muted` there is under 4.5:1 in several light themes.
* Phone first (360–430px wide), and it must also look right on a laptop (the page widens past 900px).
* Forms (`form.js`): the Save bar stays at the foot of the sheet, and `styles.css` gives every sheet with one a
  `scroll-padding-bottom`, so a control reached with Tab is scrolled clear of it (a tall notes box at least to its
  first line). At 340 px and narrower Delete, Cancel and Save share the row instead of forcing the form wider.
* A toast (`util.js` `toast()`) sits at the foot of the screen for nearly three seconds and lets taps through to
  what is under it (`pointer-events: none`): the next row's Yes and No in "Did you see them?", a card.
* A name beside a status pill (a Coming up card, a Week row, a booking's header) lets the pill drop under it where
  the name would be squeezed, so no word is broken in two. The display choices (`.pref > .seg.wide`) do the same on a
  narrow phone with large text: a row that cannot hold every choice puts the last on a line of its own.

## Share pages

`invoice.html` (money) and `daysheet.html` (daysheet) open a document packed into the URL fragment
(`link-pack.js`), so nothing reaches a server. They load their own script (`js/invoice-page.js`,
`js/daysheet-page.js`) with `<script type="module" src=…>`: **no inline scripts** (the CSP forbids them). They must
never show private numbers that are not meant for the reader (a day sheet for the band never shows the deal, fees,
settlement or budget).

## Writing for people

Gdex is used by musicians on a phone, often in a dark venue or a studio. Write the way Vdex does: plain words,
short sentences, no jargon a musician would not use, helpful empty states, labels on every control, confirmation
before anything destructive, and a toast after a save that isn't visible otherwise. Use music words people know:
load-in, soundcheck, doors, set, curfew, changeover, guarantee, door split, settlement, rider, input list, stage plot,
backline, take, comp, stems, split sheet.

## Tests

* `tests/helpers.cjs`: `const { open, ok, sleep, go, topSheet, toMonth } = require('../helpers.cjs');`
  `const { browser, page, errors } = await open({ sample: true, tab: 'songs' });` Each `ok(name, condition, extra)`
  prints a PASS or FAIL line. End every spec with `ok('no errors in the console', errors.length === 0, …)` and
  `await browser.close()`, and wrap the whole spec in `(async () => { … })().catch(e => { console.log('FAIL … crashed — ' + e.message); process.exit(1); })`.
* `open()` marks the welcome tour done, dismisses the role card and turns "Did you see them?" off (`gdex-ask-seen`
  `'off'`, set again on every load), so no sheet opens over a spec's own work. A spec about the question opens with
  `open({ ask: true })`, which leaves the key alone; it seeds its shows, then reloads.
* Gdex opens on the calendar on every load: after `page.reload()`, `go(page, id)` to be anywhere else. `toMonth(page)`
  goes from a booking's page or any calendar view to the Month view.
* The whole suite takes about 25 minutes on one machine (`13-calendar`, `43-ask` and `56-rules` open several
  browsers each). `43-ask` has `clockKit(page)` for a page whose clock is set by hand (coming back after hours).
* **Dates.** The test browser is `en-US` (`fmtShort` gives `Thu, Nov 12`). A check never hard-codes a month or weekday
  name or the order of day and month: it compares with the same formatter run in the page, or reads `data-date`.
* **The hour of the run.** No check may depend on the hour it runs. Seed past shows at least two days back and coming
  ones at least two days on, stepping a `Date` with `setDate` (never `Date.now() ± n × 864e5`), and test "is it over"
  through `model.showOver(b, now)` with a fixed `now`. A check that must use today's date gives the same result at
  00:10 and at 23:50.
* Spec files by owner: `00-smoke` (core), `05-deck` and `06-roles` (core), `07-groundwork` (core: the model and the
  contracts under the calendar, the question, the menus and house rules), `10-bookings`, `11-order` (same-day order and
  the overlap note), `12-roles-bookings`, `13-calendar`, `15-show`, `20-daysheet`, `25-money`, `30-studio`,
  `35-songs`, `40-acts`, `41-seen`, `42-roles-acts`, `43-ask`, `44-formerly` (a renamed act), `45-people`,
  `46-search`, `50-backline`, `55-venues`, `56-rules`, `60-tools`, `62-roles-pages`, `65-insurance`, `70-settings`.
* Test what a person does: open the section, tap the buttons, fill the forms, check what shows and what is stored.
* `window.gdexAudioState()` (from `js/audio.js`) reports live audio (context, microphone tracks, tuner, metronome,
  meter, timer, wake lock): a spec can check that leaving a page leaves nothing listening.
* `00-smoke` must keep passing: every section opens with and without the sample, with no console errors.

## Who owns which files

Only edit files you own. Core files (`index.html`, `styles.css`, `js/app.js`, `js/store.js`, `js/model.js`,
`js/util.js`, `js/form.js`, `js/deck.js`, `js/a11y.js`, `js/roles.js`, `js/role-pick.js`, `js/tour.js`, `js/tutorials.js`, `js/print.js`, `js/blocks/index.js`,
`js/bookings-kit.js`, `sw.js`, `tools/`, `tests/lib.mjs`, `tests/run.mjs`, `tests/helpers.cjs`, `tests/specs/00-smoke.cjs`,
`tests/specs/07-groundwork.cjs`) belong to the integrator: if you
need a change there, describe it in your report instead.

| Feature | Files |
|---|---|
| bookings | `js/pages/bookings.js`, `js/bookings-cal.js` (the calendar's views), `js/blocks/advance.js`, `js/blocks/lineup.js`, `js/blocks/notes.js`, `js/ics.js`, `css/bookings.css`, `tests/specs/10-bookings.cjs`, `tests/specs/11-order.cjs`, `tests/specs/12-roles-bookings.cjs`, `tests/specs/13-calendar.cjs` |
| show | `js/blocks/deal.js`, `js/blocks/running.js`, `js/blocks/guests.js`, `js/blocks/settlement.js`, `css/show.css`, `tests/specs/15-show.cjs` |
| daysheet | `js/daysheet.js`, `js/blocks/daysheet.js`, `daysheet.html`, `js/daysheet-page.js`, `css/daysheet.css`, `tests/specs/20-daysheet.cjs` |
| money | `js/money.js`, `js/blocks/money.js`, `js/blocks/budget.js`, `js/pages/money.js`, `invoice.html`, `js/invoice-page.js`, `css/money.css`, `tests/specs/25-money.cjs` |
| studio | `js/clock.js`, `js/blocks/clock.js`, `js/blocks/takes.js`, `js/blocks/worksongs.js`, `js/blocks/deliverables.js`, `js/pages/sessions.js`, `css/studio.css`, `tests/specs/30-studio.cjs` |
| songs | `js/pages/songs.js`, `js/setlist.js`, `js/blocks/setlist.js`, `css/songs.css`, `tests/specs/35-songs.cjs` |
| acts | `js/pages/acts.js`, `js/acts-ask.js` ("Did you see them?"), `css/acts.css`, `tests/specs/40-acts.cjs`, `tests/specs/41-seen.cjs`, `tests/specs/42-roles-acts.cjs`, `tests/specs/43-ask.cjs`, `tests/specs/44-formerly.cjs` |
| people | `js/pages/people.js`, `js/pages/insurance.js`, `css/people.css`, `tests/specs/45-people.cjs`, `tests/specs/65-insurance.cjs` |
| backline | `js/pages/backline.js`, `js/pages/venues.js`, `js/venues-rules.js` (house rules), `css/backline.css`, `tests/specs/50-backline.cjs`, `tests/specs/55-venues.cjs`, `tests/specs/56-rules.cjs` |
| tools | `js/pages/tools.js`, `js/audio.js`, `css/tools.css`, `tests/specs/60-tools.cjs`, `tests/specs/62-roles-pages.cjs` (with songs, people, money) |
| settings | `js/pages/settings.js`, `js/backup.js`, `css/settings.css`, `tests/specs/70-settings.cjs` |
| search | `js/search.js`, `css/search.css`, `tests/specs/46-search.cjs` |

A feature may add new files of its own under `js/` (named after the feature) if it needs them.
