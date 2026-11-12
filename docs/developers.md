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
| `js/blocks/*.js` | Boxes on a booking's page (deal, setlist, guest list…), listed in `js/blocks/index.js`. |
| `js/*.js` | Shared modules (see below). |
| `tests/` | `run.mjs`, `lib.mjs`, `helpers.cjs`, `specs/NN-name.cjs`. |
| `tools/` | `stamp-build.mjs`, `site-files.mjs`. |

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
compare `menuStyle()` to build such a sentence. (`js/tour.js` reads the style from storage, `menuKind()`, because
`a11y.js` imports it.) The role is a device preference in `localStorage` `gdex-role`, never in the database, so a swap
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
seen last), and "From a past show" offers shows up to today (holds and offers too when money is off). Tools writes
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
`tape`, `digital`) do the same things: ⏮ ⏭, a swipe, the arrow keys, and a list of every section.

### Device preferences

Kept in `localStorage` on the device, never in the database, so backups do not carry them:

| Key | What | Erase this device |
|---|---|---|
| `gdex-prefs` | Display: theme, light or dark, text and button size, contrast, animation, vibration, and the section menu (`menu`: `record`, `tape` or `digital`). | kept |
| `gdex-cal-view` | The calendar's view: `month`, `two`, `week`, `three` or `day`. Read and written only through `calMode()` / `saveCalMode()` (`js/bookings-kit.js`); only the calendar's view buttons save it. | kept |
| `gdex-role` | The role (`setRole`). | cleared |
| `gdex-ask-seen` | "Did you see them?" on or off (`setAskSetting`). | cleared |

`gdex-tour`, `gdex-role-nudged`, `gdex-settings-open`, `gdex-tool-pick` and the like are cleared too.

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
* Numbers typed in forms arrive as numbers from `type: 'number'` fields but as **strings** from `rows` columns:
  convert with `Number()` before sums.
* `loadSample()` fills a realistic sample (ids start with `s-`: act `s-owls`, show `s-show1`, past show `s-past`,
  session `s-sess1`, setlist `s-clubset`, venue `s-lantern`…). Tests use it.
* **The order of a day is the order the bands play.** `nightMin('HH:MM')` is minutes on the *night clock* (a time
  before 06:00 belongs to the night before: +1440; `null` when it is not a time); `playField(b)` is the time a booking
  sorts by (a show: `setTime`, else `doors`, `soundcheck`, `loadIn`; anything else: `start`), `playTime(b)` that time,
  `playKey(b)` its night minutes. Comparators: `byPlay` (inside a day, no time last), `byDayPlay` (soonest day first,
  no date first of all), `byDayPlayDesc` (newest day first, a day still in playing order). They give exactly 0 for a
  tie and never throw on a missing date. `bookingsOn`, `upcoming`, `personBookings` and `gearBookings` use them; so
  must any new list of bookings. `model.firstTime(b)` (load-in first) is what a card and a calendar file *start* with,
  not an order.
* Helpers: `bookingsOn(date)`, `upcoming()`, `activeBookings()`, `covers(b, date)`, `overlaps(a, b)`, `lastDay(b)`,
  `personBookings(id)`, `gearBookings(id)`, `personClash(b, personId)`, `gearClash(b, gearId)` (other overlapping bookings
  when together they need more than are owned), `gearShort(b, gearId)` (this booking alone needs more than are owned), `qtyOf(g)`,
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
`seen` entry. A duplicate never carries it, and an edit that changes the date, the last day or the act drops it. It
travels in backups and is never put in a day sheet, a calendar file or any document.
Statuses per kind: `model.statusesFor(kind)` (`hold`, `offer`, `confirmed`, `advanced`, `done`, `settled`,
`cancelled`). Pills: `h('span', { class: 'pill ' + statusTone(s) }, statusLabel(s))`.

`acts`: `{ id, name, genre, color, bio, links (text, one "Label: url" per line), email, phone, members: [personId],
inputList: [{ id, ch, source, mic, stand, note }], stagePlot: [{ id, label, x, y }], riderTech, riderHospitality, notes,
seen: [{ id, date, venueId, where, rating (1–100), notes, bookingId, savedAt }] }` (`seen`: each time the person saw them
play; `model.seenStats(a)` gives times seen, the average and latest score; `model.seenOf(a)` orders them newest first and,
on one day, the last saved first: `savedAt`, else the later in the list. `bookingId` is the act's show that time was at:
every save links it again, so it follows the entry's date. An entry without one counts for the act's show on its day
only when that is the act's only show that day: `model.seenEntryFor(a, b)`, `model.onlyShowOn(actId, iso)`)

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
only to the latter).

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
`overlapsOf(b, list?)`, `overlapText(b, list?)` (`Overlaps with Chelsea Wolfe, 21:00`, `… and Sable, 21:30`,
`… and 2 more`; the other show goes by its act, else its client, else its title, and by its title when it is the same
act). The note ignores the filter chips and is the same for every role.

When a show is over: `showEnd(b)` (a `Date`, or `null` for anything that is not a show with a date) and
`showOver(b, now?)`. On the show's last day, on the night clock: the set's end (on-stage time plus set length); with no
length, the curfew (the booking's own, else its saved venue's; with an on-stage time, only when it is not before the
set); with an on-stage time and neither, two hours after it; with no times, or only doors, soundcheck or load-in,
06:00 the next morning. `ASK_DAYS` (14); `seenAnswer(b)` (`'seen'` when the act's log has the show, else `'no'` when
`b.went === 'no'`, else `''`); `waitingShows(now?, { holds })` (shows that are over, not cancelled, with an act that
is in Acts, at most `ASK_DAYS` days after their last day, with no answer; newest first; `holds: false` leaves out
holds and offers, which a role with money is not asked about); `markWent(bookingId, no?)` (quiet).

House rules: `RULE_GROUPS`, `HOUSE_RULES` (17 rules: `{ id, group, kind: 'allow'|'fact'|'pick', label, icon, options?,
yes?, no?, bad? }`), `RULE_TONES`, `rulesOf(v)` (`{ values, note, tone, known, restricted }`), `rulesLevel(v)` (`''`,
`'ok'`, `'some'`, `'strict'`), `rulesChipText(v)` (`null`, or `{ level, label, spoken }`), `rulesList(v)`
(`{ no, yes, know, note }`), `showRulesVenue(b)` (the saved venue of a show that is not cancelled, else `null`). The
colour: a tone set by hand wins; else red (`strict`) when phones are not allowed, or neither pro cameras nor
point-and-shoots are; amber (`some`) when anything else is restricted (an age limit, ID needed, cash only, strobes
count); green (`ok`) when at least one answer is known and nothing is restricted, free text or not; amber for free
text alone; nothing when the venue has no answer, no note and no tone. The chip names the main rule
(`📷 Pro cameras ✗ · 1 more`, `📵 No phones or cameras`, `🔞 21+`, `💵 Cash only`), reads `No restrictions`
(`No restrictions · 1 note` beside free text), or shows the start of a note that stands alone; a tone set by hand
changes only the colour. `spoken` (`House rules: Pro cameras not allowed, and 1 more`) is for a screen reader. Both
are text: set them with `textContent`.

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
show answered so reads "Didn’t go" with Change (`model.markWent`). The focus moves to the new button after a save, a
delete or an answer. Such a show with no act says "Pick the act you saw to score this show." with a button that opens
its form on the act, but only for a role with `pages.bookings.score`: anyone who has the row only because they are
asked gets no row on a show with no act. A show at a saved venue with house rules shows them in full under the venue
checks (`rulesFull(venue, { where: 'show' })`). With money off (`moneyShown()` false), the status choices leave out Paid / settled
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
| `js/bookings-kit.js` `cardExtras(b)` / `overlapNote(b)` / `wentMark(b)` | core | What a Coming up card and a Week row add under their own lines, in order: the overlap note (`span.bk-overlap`), the house-rules chip (`rulesChip(b)`), "Didn’t go" (`span.pill.bk-went`). Spans with no control inside, because cards are buttons. |
| `js/bookings-kit.js` `calMode()` / `saveCalMode(mode)` / `CAL_MODES`; `isoOk`, `monthStart`, `addDays`, `daysBetween`, `multi`, `dateRange`, `safeColor`, `actOf`, `actStyle`, `tone`, `pill`, `plural`, `sortByName`, `capital`, `KIND_CHIP` | core | The calendar's view kept on the device; the small helpers the booking page and the calendar share. |
| `js/acts-ask.js` `askAtOpen(ids)` / `askPref()` | acts | The "Did you see them?" sheet for the shows still waiting among `ids` (nothing when the person is not asked or none is left) / the control for Settings → Your role. |
| `js/venues-rules.js` `rulesChip(b)` / `venueChip(v)` / `rulesFull(v, { where })` / `rulesEditor(v)` | venues | A show's house-rules chip, or `null` / the same for a venue / the full rules (`where: 'venue' \| 'show'`), or `null` / the House rules part of the venue form: `{ node, read() }`. |
| `pages/bookings.js` `newBooking(preset)` | bookings | Open the new-booking form, prefilled (`{ kind, actId, venueId, date, setlistId }`). |
| `pages/acts.js` `openAct(id)` / `editAct(a, onSaved)` / `printRider(actId)` | acts | View sheet / edit form / print the tech rider. |
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
| `js/ics.js` `bookingIcs(b)` / `allIcs(list)` | bookings | Calendar files (RFC 5545, past-midnight safe, no money). |
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

Hooks the specs and walkthroughs rely on, whatever the view: `.bk-calview` (the calendar's frame), `.bk-monthview` (on
it only in the month), `.bk-dayview` (only in the Day view), `.bk-day[data-date]` (a day square; today is
`.today[aria-current="date"]`), `.bk-ev[data-id]` (an entry in the view's own body, never a Coming up card),
`.bk-agenda .bk-card[data-id]`, `#bk-agenda-more`, `.bk-agenda-head`, `.bk-filters .chips`, `.bk-export`, `.bk-new`,
`.bk-new-day`, `.bk-none` (the "nothing on" line), `.bk-cal-panel .cal-title`, `#bk-view-<mode>` (the view buttons).

### When Gdex opens

`js/app.js` works out, as it boots, the shows that were waiting for "Did you see them?" (`waitingShows(now, { holds:
true })`, from the database as loaded), and after the role question and the welcome tour, once no sheet or tour is on
screen, calls `askAtOpen(ids)` once. With nothing waiting, `js/acts-ask.js` is never fetched. Data added after boot
never opens the sheet in that visit; `askAtOpen` decides whether the person is asked.

## Shared modules (core)

* `util.js`: `h(tag, attrs, ...kids)` (attrs: `class`, `onclick`…, `aria-*`, `data-*`, `html` for trusted markup
  only), `nodes`, `uid`, `pad`, `ymd`, `todayISO`, `parseISO`, `fmtLong`, `fmtShort`, `fmtTime`, `daysUntil`,
  `groupBy`, `toast(msg)`, `announce(msg)`, `sheet(title, body, { onClose })` → `{ el, close }`, `mapsUrl`, `telUrl`,
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
  own words: `{ list, tap, Tap }`). `tour.js`: `runTour(steps)`, `sheetTutorial()`.

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
  `.pp-` people, `.bl-` backline, `.vn-` venues, `.tl-` tools, `.se-` settings, `.ins-` insurance).
* Phone first (360–430px wide), and it must also look right on a laptop (the page widens past 900px).

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
* **Dates.** The test browser is `en-US` (`fmtShort` gives `Thu, Nov 12`). A check never hard-codes a month or weekday
  name or the order of day and month: it compares with the same formatter run in the page, or reads `data-date`.
* **The hour of the run.** No check may depend on the hour it runs. Seed past shows at least two days back and coming
  ones at least two days on, stepping a `Date` with `setDate` (never `Date.now() ± n × 864e5`), and test "is it over"
  through `model.showOver(b, now)` with a fixed `now`. A check that must use today's date gives the same result at
  00:10 and at 23:50.
* Spec files by owner: `00-smoke` (core), `05-deck` and `06-roles` (core), `07-groundwork` (core: the model and the
  contracts under the calendar, the question, the menus and house rules), `10-bookings`, `11-order` (same-day order and
  the overlap note), `12-roles-bookings`, `13-calendar`, `15-show`, `20-daysheet`, `25-money`, `30-studio`,
  `35-songs`, `40-acts`, `41-seen`, `42-roles-acts`, `43-ask`, `45-people`, `50-backline`, `55-venues`, `56-rules`,
  `60-tools`, `62-roles-pages`, `65-insurance`, `70-settings`.
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
| acts | `js/pages/acts.js`, `js/acts-ask.js` ("Did you see them?"), `css/acts.css`, `tests/specs/40-acts.cjs`, `tests/specs/41-seen.cjs`, `tests/specs/42-roles-acts.cjs`, `tests/specs/43-ask.cjs` |
| people | `js/pages/people.js`, `js/pages/insurance.js`, `css/people.css`, `tests/specs/45-people.cjs`, `tests/specs/65-insurance.cjs` |
| backline | `js/pages/backline.js`, `js/pages/venues.js`, `js/venues-rules.js` (house rules), `css/backline.css`, `tests/specs/50-backline.cjs`, `tests/specs/55-venues.cjs`, `tests/specs/56-rules.cjs` |
| tools | `js/pages/tools.js`, `js/audio.js`, `css/tools.css`, `tests/specs/60-tools.cjs`, `tests/specs/62-roles-pages.cjs` (with songs, people, money) |
| settings | `js/pages/settings.js`, `js/backup.js`, `css/settings.css`, `tests/specs/70-settings.cjs` |

A feature may add new files of its own under `js/` (named after the feature) if it needs them.
