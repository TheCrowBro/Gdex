// The music domain in one place: the kinds of booking, their statuses, roles, gear categories, deal types, song
// keys, and the pure sums every page agrees on (set lengths, deal and settlement maths, a booking's income). Nothing
// here touches the page or the store's storage; pass records in, get values out. Pages import from here instead of
// keeping their own lists, so a show reads the same on the calendar, the day sheet and the money page.
import { db, byId, update, overlaps, nightMin, playField, playKey, byPlay, byDayPlay, byDayPlayDesc } from './store.js';
import { pad, ymd, parseISO } from './util.js';

/* ------------------------------- bookings ------------------------------- */
// [id, label, icon]. A show is a gig (load-in, soundcheck, doors, set, curfew, a deal); a session is studio time
// (start, end, a rate, songs, takes); a rehearsal is band practice; other is anything else in the diary.
export const KINDS = [['show', 'Show', '🎤'], ['session', 'Studio session', '🎚️'], ['rehearsal', 'Rehearsal', '🥁'], ['other', 'Other', '📌']];
export const kindLabel = k => (KINDS.find(x => x[0] === k) || KINDS[3])[1];
export const kindIcon = k => (KINDS.find(x => x[0] === k) || KINDS[3])[2];

// [id, label, tone]. tone is the pill class suffix (st-hold, st-confirmed, …) styled in styles.css.
export const STATUSES = [
  ['hold', 'Hold', 'hold'], ['offer', 'Offer in', 'offer'], ['confirmed', 'Confirmed', 'confirmed'], ['advanced', 'Advanced', 'advanced'],
  ['done', 'Done', 'done'], ['settled', 'Paid / settled', 'settled'], ['cancelled', 'Cancelled', 'cancelled'],
];
const STATUS_BY_KIND = { show: ['hold', 'offer', 'confirmed', 'advanced', 'done', 'settled', 'cancelled'], session: ['hold', 'confirmed', 'done', 'settled', 'cancelled'], rehearsal: ['hold', 'confirmed', 'done', 'cancelled'], other: ['hold', 'confirmed', 'done', 'cancelled'] };
export const statusesFor = kind => STATUSES.filter(s => (STATUS_BY_KIND[kind] || STATUS_BY_KIND.other).includes(s[0]));
export const statusLabel = s => (STATUSES.find(x => x[0] === s) || ['', s || '—'])[1];
export const statusTone = s => 'st-' + ((STATUSES.find(x => x[0] === s) || [])[2] || 'hold');
export const isLive = b => b && b.status !== 'cancelled'; // counts on the calendar, in clashes and in money

// The times a booking can carry, in the order a day runs. Each is 'HH:MM' or ''.
export const SHOW_TIMES = [['loadIn', 'Load-in'], ['soundcheck', 'Soundcheck'], ['doors', 'Doors'], ['setTime', 'On stage'], ['curfew', 'Curfew']];
export const SESSION_TIMES = [['start', 'Start'], ['end', 'Finish']];
export const timesFor = kind => (kind === 'show' ? SHOW_TIMES : SESSION_TIMES);
// The first time on the day (what a card and a calendar file start with: load-in for a show). The order of a day is
// not this: it is the time the band plays (below).
export const firstTime = b => (b ? (b.kind === 'show' ? [b.loadIn, b.soundcheck, b.doors, b.setTime] : [b.start]).find(Boolean) || '' : '');
export const lastDate = b => (b.endDate && b.endDate > b.date ? b.endDate : b.date);
export const coversDay = (b, iso) => !!b.date && b.date <= iso && iso <= lastDate(b);

/* ------------------------------- the order of a day ------------------------------- */
// Same-day bookings run in the order the bands play (js/store.js): a show by its on-stage time, else doors, soundcheck
// or load-in; anything else by its start; on the night clock, where a time before 06:00 is after midnight; a booking
// with no time last. nightMin, playField, playTime, playKey and the comparators byPlay, byDayPlay and byDayPlayDesc
// are the store's, passed on here so pages take them from the model.
export { nightMin, playField, playTime, playKey, byPlay, byDayPlay, byDayPlayDesc } from './store.js';
// Night minutes back to a clock time (1470 → '00:30').
export const nightClock = min => { const t = ((Math.round(Number(min) || 0) % 1440) + 1440) % 1440; return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
const PLAY_LABELS = { setTime: 'On stage', doors: 'Doors', soundcheck: 'Soundcheck', loadIn: 'Load-in', start: 'Start' };
// The name of the time a booking sorts by ('' when it has none).
export const playLabel = b => PLAY_LABELS[playField(b)] || '';
export const isAfterMidnight = b => (playKey(b) ?? 0) >= 1440;
// A show's set as night minutes { start, end }: a live show (holds and offers count, cancelled does not) with an
// on-stage time; it lasts its set length, else an hour. null for anything else. The end is the real one, past 06:00 too.
export const setWindow = b => {
  if (!b || b.kind !== 'show' || !isLive(b)) return null;
  const start = nightMin(b.setTime);
  return start == null ? null : { start, end: start + (Number(b.setLength) > 0 ? Number(b.setLength) : 60) };
};
// Two shows whose sets run at the same time on a day they share. Sets that only touch (one ends as the next starts)
// do not overlap. The days are tested first: every card asks about the whole diary, and only its own days can overlap.
export const setsOverlap = (a, b) => { if (!a || !b || !overlaps(a, b)) return false; const x = setWindow(a), y = setWindow(b); return !!x && !!y && x.start < y.end && y.start < x.end; };
// The other shows whose sets overlap this one's, in the order they play; [] for a booking with no set.
export const overlapsOf = (b, list = db.bookings) => (setWindow(b) ? (list || []).filter(o => o && o !== b && o.id !== b.id && setsOverlap(b, o)).sort(byPlay) : []);
// The note on a card: "Overlaps with Chelsea Wolfe, 21:00", "… and Sable, 21:30", "… and 2 more"; '' when nothing
// overlaps. The other show goes by its act (else its client, else its title); by its title when it is the same act.
export const overlapText = (b, list = db.bookings) => {
  const others = overlapsOf(b, list);
  if (!others.length) return '';
  const name = o => `${(o.actId && o.actId === b.actId ? '' : actName(o.actId) || o.client) || bookingTitle(o)}, ${nightClock(nightMin(o.setTime))}`;
  return 'Overlaps with ' + (others.length === 1 ? name(others[0]) : others.length === 2 ? `${name(others[0])} and ${name(others[1])}` : `${name(others[0])} and ${others.length - 1} more`);
};

/* ------------------------------- when a show is over ------------------------------- */
// "Did you see them?" is asked once a show is over (js/acts-ask.js), for ASK_DAYS days after it.
export const ASK_DAYS = 14;
const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
// When a show is over, on its last day, with times on the night clock: after the set (on-stage time plus set
// length); with no length, at the curfew (the booking's own, else its saved venue's; one that is before the set is
// skipped; with no set, one before the time the show is sorted by, or alone and before noon, is the next morning's:
// an all-nighter, doors 22:00 and curfew 06:00); with an on-stage time and neither, two hours after it; with no
// times, or only doors, soundcheck or load-in, at 06:00 the morning after. null for anything that is not a show with
// a date.
export function showEnd(b) {
  if (!b || b.kind !== 'show' || !isIso(b.date)) return null;
  const last = isIso(b.endDate) && b.endDate > b.date ? b.endDate : b.date;
  const set = nightMin(b.setTime), length = Number(b.setLength) > 0 ? Number(b.setLength) : 0;
  const venue = b.venueId ? byId('venues', b.venueId) : null;
  let curfew = nightMin(b.curfew) ?? nightMin(venue && venue.curfew);
  const from = playKey(b);
  if (set == null && curfew != null && (from != null ? curfew < from : curfew < 720)) curfew += 1440;
  const min = set != null && length ? set + length
    : curfew != null && (set == null || curfew >= set) ? curfew
      : set != null ? set + 120
        : 1440 + 360;
  const d = parseISO(last);
  d.setHours(0, min, 0, 0); // minutes may pass midnight: the date moves on with them
  return d;
}
export const showOver = (b, now = new Date()) => { const end = showEnd(b); return !!end && now >= end; };
// What the person said about a show: 'seen' when the act's log has it (a score always wins), 'no' when it is marked
// "Didn’t go" (booking.went === 'no'), else ''.
export const seenAnswer = b => {
  if (!b) return '';
  const a = b.actId ? byId('acts', b.actId) : null;
  // No act, no answer: a show whose act was deleted on another device before the two were merged says nothing.
  return !a ? '' : seenEntryFor(a, b) ? 'seen' : b.went === 'no' ? 'no' : '';
};
// The shows waiting for "Did you see them?": over, not cancelled, with an act that is in Acts, at most ASK_DAYS days
// after their last day, and with no answer yet. Newest first. holds: false leaves out holds and offers (a role with
// money: they never happened); a role without money passes holds: true.
export function waitingShows(now = new Date(), { holds = false } = {}) {
  const today = parseISO(ymd(now));
  return (db.bookings || []).filter(b => b && b.kind === 'show' && isLive(b) && isIso(b.date) && b.actId && byId('acts', b.actId)
    && (holds || !['hold', 'offer'].includes(b.status)) && showOver(b, now)
    && Math.round((today - parseISO(isIso(b.endDate) && b.endDate > b.date ? b.endDate : b.date)) / 864e5) <= ASK_DAYS
    && seenAnswer(b) === '').sort(byDayPlayDesc);
}
// Mark a show "Didn’t go" (no = true), or take the answer back (no = false). Quiet: no toast. Nothing is written when
// nothing would change.
export function markWent(bookingId, no = true) {
  const b = byId('bookings', bookingId);
  if (!b || (b.went === 'no') === !!no) return;
  update(d => { const x = d.bookings.find(r => r.id === bookingId); if (!x) return; if (no) x.went = 'no'; else delete x.went; x.updatedAt = Date.now(); });
}

// "Act @ Venue" when no title was typed.
export function bookingTitle(b) {
  if (!b) return '';
  if (b.title) return b.title;
  const act = actName(b.actId) || b.client || '';
  const where = venueOf(b).name;
  return [act, where].filter(Boolean).join(' @ ') || kindLabel(b.kind);
}
export const actName = id => (id && byId('acts', id) ? byId('acts', id).name : '');
// The venue record, or a stand-in built from the booking's own typed name and address.
export function venueOf(b) {
  const v = b && b.venueId ? byId('venues', b.venueId) : null;
  return v || { id: '', name: (b && b.venueName) || '', address: (b && b.address) || '', geo: null };
}

/* ------------------------------- checklists ------------------------------- */
// The built-in checklist lines per kind, each with a stable id: other features tick them by id (the day sheet ticks
// 'show-daysheet' when it is sent, the invoice 'show-invoice' and 'show-paid'…), so the wording can change freely.
// The person's own extra lines live in db.templates[kind] as [{ id, t }]. Ticks live in booking.checks[id] = true.
export const CHECKLISTS = {
  show: [
    ['show-offer', 'Offer, date and deal agreed'], ['show-contract', 'Contract or confirmation in writing'], ['show-deposit', 'Deposit received'],
    ['show-advance', 'Show advanced with the promoter'], ['show-times', 'Load-in, soundcheck and set times confirmed'], ['show-backline', 'PA, backline and input list confirmed'],
    ['show-hospitality', 'Hospitality, parking and guest list agreed'], ['show-travel', 'Travel and accommodation booked'], ['show-promo', 'Show announced and promoted'],
    ['show-setlist', 'Setlist ready'], ['show-daysheet', 'Day sheet sent to the band'], ['show-settled', 'Settled on the night'],
    ['show-invoice', 'Invoice sent'], ['show-paid', 'Paid in full'],
  ],
  session: [
    ['ses-booked', 'Studio and engineer confirmed'], ['ses-prep', 'Demos, lyrics and charts shared'], ['ses-tempo', 'Tempo, key and click agreed'],
    ['ses-players', 'Session players booked'], ['ses-backup', 'Session files backed up (two copies)'], ['ses-deliver', 'Mixes and stems delivered'],
    ['ses-splits', 'Split sheet signed'], ['ses-invoice', 'Invoice sent'], ['ses-paid', 'Paid in full'],
  ],
  rehearsal: [['reh-room', 'Room booked'], ['reh-setlist', 'Setlist shared with the band'], ['reh-gear', 'Who brings what agreed']],
  other: [],
};
// The built-in lines about money: the deal, the deposit, settling, the invoice and getting paid. A role without money
// (js/roles.js moneyShown) leaves them off its checklists; their ticks stay on the booking.
export const MONEY_CHECKS = ['show-offer', 'show-deposit', 'show-settled', 'show-invoice', 'show-paid', 'ses-invoice', 'ses-paid'];
// Every line for a kind: the built-in ones, then the person's own. [{ id, t, own }]. { money: false } leaves out the
// money lines (the person's own lines always stay).
export const checklistFor = (kind, { money = true } = {}) => [...(CHECKLISTS[kind] || []).filter(([id]) => money || !MONEY_CHECKS.includes(id)).map(([id, t]) => ({ id, t, own: false })), ...((db.templates && Array.isArray(db.templates[kind]) ? db.templates[kind] : []).filter(x => x && x.id).map(x => ({ id: x.id, t: x.t, own: true })))];
export const isChecked = (b, id) => !!(b && b.checks && b.checks[id]);
// Tick (or untick) a line on a booking. Quiet: no toast. Returns nothing.
export function markCheck(bookingId, id, on = true) {
  const b = byId('bookings', bookingId);
  if (!b || !!(b.checks && b.checks[id]) === !!on) return;
  update(d => { const x = d.bookings.find(r => r.id === bookingId); if (!x) return; x.checks = { ...(x.checks || {}) }; if (on) x.checks[id] = true; else delete x.checks[id]; x.updatedAt = Date.now(); });
}

/* ------------------------------- times seen ------------------------------- */
// An act's sightings: act.seen = [{ id, date, venueId, where, rating (1–100), notes, bookingId, savedAt }], one per time
// the person saw them play. Newest first; on the same day, the one saved last first (savedAt, else its place in the list:
// a save puts the entry at the end), so the latest score is the last one logged.
export const seenOf = a => (Array.isArray(a && a.seen) ? a.seen.map((s, i) => [s, i]).filter(([s]) => s && s.date) : [])
  .sort(([x, i], [y, j]) => String(y.date).localeCompare(String(x.date)) || (Number(y.savedAt) || 0) - (Number(x.savedAt) || 0) || j - i).map(([s]) => s);
export const ratingOf = s => { const r = Math.round(Number(s && s.rating)); return r >= 1 && r <= 100 ? r : null; };
// { times, avg, latest, best, last }: how many times seen, the average and latest score out of 100 (null when none is
// scored), the best, and the date last seen.
export function seenStats(a) {
  const list = seenOf(a), scored = list.map(ratingOf).filter(r => r != null);
  return {
    times: list.length,
    avg: scored.length ? Math.round(scored.reduce((t, r) => t + r, 0) / scored.length) : null,
    latest: scored.length ? scored[0] : null,
    best: scored.length ? Math.max(...scored) : null,
    last: list.length ? list[0].date : '',
  };
}
// Where a sighting was: the venue's name while it is in Venues, else what was typed.
export const seenWhere = s => (s && s.venueId && byId('venues', s.venueId) ? byId('venues', s.venueId).name : (s && s.where) || '');
// The act's shows on a day, not cancelled (a festival weekend covers each of its days).
export const actShowsOn = (actId, iso) => (actId && iso ? (db.bookings || []).filter(b => b && b.actId === actId && b.kind === 'show' && isLive(b) && coversDay(b, iso)) : []);
// The act's only show that day, or null when it has none or more than one (then a time seen can't tell which it was).
export const onlyShowOn = (actId, iso) => { const list = actShowsOn(actId, iso); return list.length === 1 ? list[0] : null; };
// The act's time seen for a booking: the entry carrying its id, or else one logged without a booking (from the act's card
// on the night) on a day when this is the act's only show. A booking with one of these is already scored.
export function seenEntryFor(a, b) {
  if (!a || !b) return null;
  const list = seenOf(a);
  return list.find(s => s.bookingId === b.id) || list.find(s => !s.bookingId && coversDay(b, s.date) && (onlyShowOn(a.id, s.date) || {}).id === b.id) || null;
}
// The act's bookings still to come, soonest first and, on a day, in the order they play (the dates on its card).
export const actUpcoming = a => (db.bookings || []).filter(b => b.actId === a.id && isLive(b) && b.date && lastDate(b) >= todayIso()).sort(byDayPlay);
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/* ------------------------------- earlier names ------------------------------- */
// An act that changed its name keeps the old ones: act.formerNames = [{ name, until }]. until is the day that name
// stopped being used ('YYYY-MM-DD'): the day the next name began, so a show on that day already has the new name. It
// is '' when the day is not known (a name added by hand): such a name shows on the act's card and page and is found
// by search, but no booking or score is dated by it. An act without formerNames reads as it always did.
// Earlier names stay inside Gdex: nothing printed, sent or exported for another program carries them (they all go
// through actName and bookingTitle, the name now); a backup file does. Every page reads them through these helpers.
const realDay = s => isIso(s) && ymd(parseISO(s)) === s; // a day that exists (not 30 February)
// A name without its capitals, spaces and punctuation: two names with the same key are one name, spelt two ways (a
// name made only of punctuation is compared as it is written).
const nameKey = n => { const s = (typeof n === 'string' ? n : '').normalize('NFKC').toLowerCase().trim(); return s.replace(/[^\p{L}\p{N}]+/gu, '') || s; };
export const sameName = (a, b) => nameKey(a) === nameKey(b);
// A stored list of earlier names, cleaned for an act now called `current`: [{ name, until }], the names whose day is
// not known first (in the order stored), then the dated ones, oldest first. Whatever is not a name is left out (a
// list that is no list, an entry of the wrong type, an empty name); a day that is no date reads as not known; the
// same name twice running is one name, and its later day stands; a name that ends where the same name begins (the
// last one, when it is the current name) was no change, and is left out. Never throws.
export function cleanFormer(list, current = '') {
  const rows = (Array.isArray(list) ? list : []).filter(x => x && typeof x === 'object' && typeof x.name === 'string' && x.name.trim())
    .map(x => ({ name: x.name.trim(), until: realDay(x.until) ? x.until : '' }));
  const dated = [];
  for (const r of rows.filter(x => x.until).sort((p, q) => p.until.localeCompare(q.until))) {
    if (dated.length && sameName(dated[dated.length - 1].name, r.name)) dated[dated.length - 1] = r; else dated.push(r);
  }
  while (dated.length && sameName(dated[dated.length - 1].name, current)) dated.pop();
  const loose = [];
  for (const r of rows.filter(x => !x.until)) if (!sameName(r.name, current) && ![...loose, ...dated].some(x => sameName(x.name, r.name))) loose.push(r);
  return [...loose, ...dated];
}
const nameNow = a => (a && typeof a.name === 'string' ? a.name : '');
// An act's earlier names, cleaned (above): oldest first, the latest last.
export const earlierNames = a => cleanFormer(a && a.formerNames, nameNow(a));
// The same with the day each name began, where that is known: [{ name, from, until }], from '' for the first dated
// name and for every name whose day is not known.
export const earlierSpans = a => { let from = ''; return earlierNames(a).map(n => { const row = { ...n, from: n.until ? from : '' }; from = n.until || from; return row; }); };
// The latest earlier name ("formerly The Night Owls" under the name on the act's card and page), or ''.
export const formerName = a => { const list = earlierNames(a); return list.length ? list[list.length - 1].name : ''; };
// The day the act's current name began (the day its latest dated earlier name stopped), or ''.
export const nameSince = a => { const dated = earlierNames(a).filter(n => n.until); return dated.length ? dated[dated.length - 1].until : ''; };
// The name the act had on a day: the earlier name still in use then, else the name it has now.
export const nameOn = (a, iso) => { const was = realDay(iso) ? earlierNames(a).find(n => n.until && n.until > iso) : null; return was ? was.name : nameNow(a); };
// What to say beside a record of that day ("formerly …", "as …"): the name the act had then, or '' when that is the
// name it has now (also for a band that went back to an old name, or one spelt another way).
export const formerlyOn = (a, iso) => { const was = a ? nameOn(a, iso) : ''; return was && !sameName(was, nameNow(a)) ? was : ''; };
// The same for a booking of any kind, by its last day: a festival weekend or a block of studio days that reaches the
// day of the change already has the new name. '' with no act in Acts, or no date.
export const formerlyOf = b => { const a = b && b.actId ? byId('acts', b.actId) : null; return a && isIso(b.date) ? formerlyOn(a, lastDate(b)) : ''; };
// The words by a booking's name wherever a row names the act through bookingTitle(b): "formerly The Night Owls". A
// booking with a title of its own that does not hold the act's name says whose it was first: "Owl Parliament,
// formerly The Night Owls". '' when there is nothing to say. Text: put it in with textContent.
export const formerlyNote = b => {
  const was = formerlyOf(b);
  if (!was) return '';
  const now = actName(b.actId), own = typeof b.title === 'string' ? b.title.trim() : '';
  return own && now && !own.toLowerCase().includes(now.toLowerCase()) ? `${now}, formerly ${was}` : `formerly ${was}`;
};

/* ------------------------------- people & gear ------------------------------- */
export const PEOPLE_GROUPS = [['band', 'Band members'], ['session', 'Session players'], ['crew', 'Crew'], ['contact', 'Industry contacts']];
export const ROLES = ['Vocals', 'Guitar', 'Bass', 'Drums', 'Keys', 'Producer', 'Engineer', 'Mix engineer', 'Mastering engineer', 'Session musician',
  'Tour manager', 'FOH engineer', 'Monitor engineer', 'Backline tech', 'Lighting', 'Merch', 'Driver', 'Promoter', 'Booking agent', 'Manager',
  'Label', 'Publisher', 'Studio manager', 'Photographer / video', 'Other'];
export const GEAR_CATS = ['Guitars', 'Basses', 'Amps & cabs', 'Drums & percussion', 'Keys & synths', 'Pedals & effects', 'Microphones', 'DI & interfaces',
  'Stands & hardware', 'Cables', 'PA & monitors', 'Lighting', 'Computers & software', 'Cases & transport', 'Other'];
export const VENUE_KINDS = [['venue', 'Venue'], ['studio', 'Studio'], ['rehearsal', 'Rehearsal room'], ['festival', 'Festival / outdoor'], ['other', 'Other']];
export const venueKindLabel = k => (VENUE_KINDS.find(x => x[0] === k) || VENUE_KINDS[4])[1];
// A booking's rate (studio time, a session player's job) and a person's usual rate share these units ('show' only for people).
export const RATE_UNITS = [['hour', 'per hour'], ['day', 'per day'], ['song', 'per song'], ['flat', 'flat fee']];
export const PERSON_RATE_UNITS = [['day', 'per day'], ['hour', 'per hour'], ['show', 'per show'], ['song', 'per song']];
export const rateUnitLabel = u => (RATE_UNITS.find(x => x[0] === u) || ['', ''])[1];

/* ------------------------------- house rules ------------------------------- */
// What a venue allows in: common rules as answers, plus free text. They belong to the venue and apply to every show
// there, whoever plays. On the venue: rules { ruleId: answer } (only what is known; a missing key is "Don’t know"),
// rulesNote (free text) and rulesTone ('' automatic | 'relaxed' | 'some' | 'strict': the colour set by hand).
// Nothing about house rules goes into a day sheet, an invoice or a calendar file.
export const RULE_GROUPS = [['cameras', 'Cameras and recording'], ['entry', 'Getting in'], ['inside', 'Inside the venue'], ['crowd', 'Crowd rules']];
// kind 'allow': Allowed ('yes') / Not allowed ('no').  kind 'fact': Yes / No, with its own words.  kind 'pick': a short list.
// bad: the answers that count as a restriction ('allow' rules: ['no'] when not given).
export const HOUSE_RULES = [
  { id: 'proCameras', group: 'cameras', kind: 'allow', label: 'Pro cameras', icon: '📷' },
  { id: 'compacts', group: 'cameras', kind: 'allow', label: 'Point-and-shoots', icon: '📷' },
  { id: 'phones', group: 'cameras', kind: 'allow', label: 'Phones', icon: '📱' },
  { id: 'video', group: 'cameras', kind: 'allow', label: 'Video', icon: '🎥' },
  { id: 'audio', group: 'cameras', kind: 'allow', label: 'Audio recording', icon: '🎙️' },
  { id: 'flash', group: 'cameras', kind: 'allow', label: 'Flash', icon: '⚡' },
  { id: 'age', group: 'entry', kind: 'pick', label: 'Age limit', icon: '🔞', options: [['all', 'All ages'], ['18', '18+'], ['21', '21+']], bad: ['18', '21'] },
  { id: 'idNeeded', group: 'entry', kind: 'fact', label: 'ID needed', icon: '🆔', yes: 'ID needed', no: 'No ID needed', bad: ['yes'] },
  { id: 'reentry', group: 'entry', kind: 'allow', label: 'Re-entry', icon: '🚪' },
  { id: 'bags', group: 'entry', kind: 'allow', label: 'Bags', icon: '🎒' },
  { id: 'cashOnly', group: 'inside', kind: 'fact', label: 'Cash only', icon: '💵', yes: 'Cash only', no: 'Cards taken', bad: ['yes'] },
  { id: 'outsideFood', group: 'inside', kind: 'allow', label: 'Outside food or drink', icon: '🥤' },
  { id: 'smoking', group: 'inside', kind: 'allow', label: 'Smoking or vaping', icon: '🚬' },
  { id: 'floor', group: 'inside', kind: 'pick', label: 'Seated or standing', icon: '💺', options: [['seated', 'Seated'], ['standing', 'Standing'], ['both', 'Seated and standing']], bad: [] },
  { id: 'moshing', group: 'crowd', kind: 'allow', label: 'Moshing and crowd-surfing', icon: '🤘' },
  { id: 'earplugs', group: 'crowd', kind: 'fact', label: 'Earplugs advised', icon: '🎧', yes: 'Earplugs advised', no: 'Earplugs not needed', bad: [] },
  { id: 'strobes', group: 'crowd', kind: 'fact', label: 'Strobe lighting', icon: '🔦', yes: 'Strobe lighting', no: 'No strobe lighting', bad: ['yes'] },
];
export const RULE_TONES = [['', 'Automatic'], ['relaxed', 'Relaxed'], ['some', 'Some rules'], ['strict', 'Strict']];
const ruleAnswers = r => (r.kind === 'pick' ? r.options.map(o => o[0]) : ['yes', 'no']);
const ruleBad = r => r.bad || ['no'];
// A venue's rules, cleaned: { values (only known answers to known rules), note (trimmed), tone, known (how many
// answers), restricted (the HOUSE_RULES entries whose answer is a restriction, in list order) }. A rules that is not a
// plain object, an unknown rule and an unknown answer are ignored.
export function rulesOf(v) {
  const raw = v && v.rules && typeof v.rules === 'object' && !Array.isArray(v.rules) ? v.rules : {};
  const values = {};
  for (const r of HOUSE_RULES) if (ruleAnswers(r).includes(raw[r.id])) values[r.id] = raw[r.id];
  const tone = v && RULE_TONES.some(t => t[0] && t[0] === v.rulesTone) ? v.rulesTone : '';
  return { values, note: v && typeof v.rulesNote === 'string' ? v.rulesNote.trim() : '', tone, known: Object.keys(values).length, restricted: HOUSE_RULES.filter(r => r.id in values && ruleBad(r).includes(values[r.id])) };
}
// The stored answers to rules this build does not know (a rule added by a newer Gdex, or a backup edited by hand), as
// they were stored: {} when there are none. The venue form keeps them, and replaces only the rules it knows.
export function unknownRules(v) {
  const raw = v && v.rules && typeof v.rules === 'object' && !Array.isArray(v.rules) ? v.rules : {};
  return Object.fromEntries(Object.entries(raw).filter(([id]) => !HOUSE_RULES.some(r => r.id === id)));
}
// The colour of a venue's rules: '' (nothing to show), 'ok' (green), 'some' (amber) or 'strict' (red). A tone set by
// hand wins. Automatic: strict when phones are not allowed, or neither pro cameras nor point-and-shoots are; some
// when anything else is restricted or there is free text (a written rule is a rule, with answers or without); ok
// when at least one answer is known, nothing is restricted and there is no free text.
export function rulesLevel(v) {
  const r = rulesOf(v), x = r.values;
  if (r.tone) return { relaxed: 'ok', some: 'some', strict: 'strict' }[r.tone];
  if (!r.known && !r.note) return '';
  if (x.phones === 'no' || (x.proCameras === 'no' && x.compacts === 'no')) return 'strict';
  return r.restricted.length || r.note ? 'some' : 'ok';   // a written rule is a rule: free text is amber, with answers or without
}
// The start of a note for the chip: its first line that is not blank, runs of spaces made one, cut at a word before
// the 28th character (at the 28th when it is one long word) with an ellipsis.
const noteStart = note => {
  const line = (String(note).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).find(Boolean)) || '';
  const chars = [...line];
  if (chars.length <= 28) return line;
  const head = chars.slice(0, 28).join(''), at = head.lastIndexOf(' ');
  return (at > 0 ? head.slice(0, at) : head).replace(/[\s,;:.!?\-–—]+$/, '') + '…'; // no comma or full stop left hanging before the …
};
// The chip on a show's card: null when the venue has no level, else { level, label (what it shows, with its emoji),
// spoken ("House rules: …", for a screen reader: capitalised, no emoji) }. The words name the main rule; a tone set by
// hand changes the colour, and the spoken words say so ("House rules, set to strict: …"), so the person's own judgement
// is never carried by colour alone. label and spoken are text: put them in with textContent, never as markup.
export function rulesChipText(v) {
  const level = rulesLevel(v);
  if (!level) return null;
  const r = rulesOf(v), x = r.values, no = id => x[id] === 'no';
  let label = '', words = '', covered = [];
  if (no('phones') && no('proCameras') && no('compacts')) { label = '📵 No phones or cameras'; words = 'No phones or cameras'; covered = ['phones', 'proCameras', 'compacts']; }
  else if (no('proCameras') && no('compacts')) { label = '📷 No cameras'; words = 'No cameras'; covered = ['proCameras', 'compacts']; }
  else if (r.restricted.length) {
    const first = (no('phones') && r.restricted.find(q => q.id === 'phones')) || r.restricted[0];
    covered = [first.id];
    if (first.kind === 'allow') { label = `${first.icon} ${first.label} ✗`; words = `${first.label} not allowed`; }
    else if (first.kind === 'fact') { const said = first[x[first.id]] || first.label; label = `${first.icon} ${said}`; words = said; }
    else { const opt = (first.options.find(o => o[0] === x[first.id]) || [])[1] || ''; label = `${first.icon} ${opt}`; words = `${first.label} ${opt}`; }
  }
  if (label) {
    const more = r.restricted.filter(q => !covered.includes(q.id)).length + (r.note ? 1 : 0);
    if (more) { label += ` · ${more} more`; words += `, and ${more} more`; }
  } else if (r.note) { const start = noteStart(r.note); label = `📝 ${start}`; words = `Note: ${start}`; }
  else label = words = { ok: 'No restrictions', some: 'Some rules', strict: 'Strict' }[level];
  const set = toneSaid(r.tone);
  return { level, label, spoken: set ? `House rules, set to ${set.toLowerCase()}${words === set ? '' : ': ' + words}` : `House rules: ${words}` };
}
// How strict, when it was set by hand: 'Relaxed', 'Some rules' or 'Strict' ('' when the colour is automatic).
const toneSaid = tone => (tone && (RULE_TONES.find(t => t[0] === tone) || [])[1]) || '';
// The full rules as lists of words, each in list order: no (permissions answered Not allowed), yes (permissions
// answered Allowed), know (each answered fact in its own words and each pick-list's choice), the note, and tone: how
// strict, in words, when it was set by hand ("Strict, set by hand"; '' when the colour is automatic).
export function rulesList(v) {
  const r = rulesOf(v), answered = HOUSE_RULES.filter(q => q.id in r.values);
  return {
    no: answered.filter(q => q.kind === 'allow' && r.values[q.id] === 'no').map(q => q.label),
    yes: answered.filter(q => q.kind === 'allow' && r.values[q.id] === 'yes').map(q => q.label),
    know: answered.filter(q => q.kind !== 'allow').map(q => (q.kind === 'fact' ? q[r.values[q.id]] : (q.options.find(o => o[0] === r.values[q.id]) || [])[1])).filter(Boolean),
    note: r.note,
    tone: r.tone ? `${toneSaid(r.tone)}, set by hand` : '',
  };
}
// Whose rules a booking carries: the saved venue of a show that is not cancelled; null for anything else (a session,
// a rehearsal, a cancelled show, a typed venue).
export const showRulesVenue = b => (b && b.kind === 'show' && isLive(b) && b.venueId ? byId('venues', b.venueId) : null);

/* ------------------------------- songs ------------------------------- */
export const SONG_STATUS = [['idea', 'Idea'], ['writing', 'Writing'], ['demo', 'Demo'], ['recording', 'Recording'], ['mixing', 'Mixing'], ['mastered', 'Mastered'], ['released', 'Released']];
export const songStatusLabel = s => (SONG_STATUS.find(x => x[0] === s) || ['', ''])[1];
export const NOTES = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
export const KEYS = [...NOTES.map(n => n + ' major'), ...NOTES.map(n => n + ' minor')];
export const SPLIT_ROLES = ['Writer', 'Composer', 'Lyricist', 'Producer', 'Publisher', 'Performer'];

/* ------------------------------- time & duration ------------------------------- */
// Seconds ⇄ "m:ss" (and "h:mm:ss" past an hour). parseDur reads "3:45", "3.45", "225", "3m45s", "4" (minutes when ≤ 20).
export function fmtDur(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}
export function parseDur(t) {
  const s = String(t ?? '').trim().toLowerCase();
  if (!s) return 0;
  let m = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/); if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  m = s.match(/^(\d+)[:.'](\d{1,2})$/); if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?$/); if (m && (m[1] || m[2])) return (+m[1] || 0) * 60 + (+m[2] || 0);
  const n = Number(s); if (Number.isFinite(n)) return n <= 20 ? Math.round(n * 60) : Math.round(n);
  return 0;
}
// Minutes → "1h 05m" / "45m".
export const fmtMin = min => { const m = Math.max(0, Math.round(Number(min) || 0)); return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`; };
// 'HH:MM' + minutes → 'HH:MM' (wraps past midnight). '' in, '' out.
export function addMinutes(hhmm, min) {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm || '')) return '';
  const [h, m] = hhmm.split(':').map(Number), t = (((h * 60 + m + Math.round(Number(min) || 0)) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
// Minutes from a to b on the same night ('22:30' → '00:15' is 105).
export const minutesBetween = (a, b) => { if (!a || !b) return null; const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number); return ((bh * 60 + bm - (ah * 60 + am)) % 1440 + 1440) % 1440; };

/* ------------------------------- setlists ------------------------------- */
// A setlist's running time: the items' lengths plus a gap between them (not after a segue, not after the last).
// { sec, songs (song items), items (every item but set breaks), missing (songs with no length) }
export function setlistLength(list) {
  if (!list || !Array.isArray(list.items)) return { sec: 0, songs: 0, items: 0, missing: 0 };
  const gap = Number.isFinite(Number(list.gap)) ? Number(list.gap) : 20;
  let sec = 0, songs = 0, missing = 0;
  const items = list.items.filter(i => i && !i.isBreak);
  items.forEach((it, i) => {
    const song = it.songId ? byId('songs', it.songId) : null;
    const d = Number(it.duration) || (song && Number(song.duration)) || 0;
    // A song (from the library, or one kept by title after the song was deleted) counts as a song and, with no length,
    // as missing; a free item with no length (an intro, a word with the crowd) is just a moment and counts for nothing.
    const isSong = !!it.songId || !!it.fromSong;
    if (isSong) { songs++; if (!d) missing++; }
    sec += d;
    if (i < items.length - 1 && !it.segue) sec += gap;
  });
  return { sec, songs, items: items.length, missing };
}
export const itemTitle = it => (it && it.songId && byId('songs', it.songId) ? byId('songs', it.songId).title : (it && it.title) || 'Untitled');

/* ------------------------------- deals & settlement ------------------------------- */
// deal = { type, fee, pct, ticketPrice, capacity, expenses, deposit, depositPaid }
export const DEAL_TYPES = [['guarantee', 'Guarantee (flat fee)'], ['door', 'Door split (% of the door)'], ['versus', 'Guarantee vs % (whichever is more)'], ['plus', 'Guarantee + % after break-even'], ['none', 'No fee (showcase, charity)']];
const num = v => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : 0);
// Rounded to the cent first, so a door split of 1889.9999… reads $1,890.
export const fmtMoney = (n, sym = currency()) => { const v = Math.round(Number(n) * 100) / 100; if (!Number.isFinite(v)) return '—'; const neg = v < 0; const s = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: Math.abs(v) % 1 ? 2 : 0, maximumFractionDigits: 2 }); return (neg ? '−' : '') + sym + s; };
export const currency = () => (db.profile && db.profile.currency) || '$';

// What a deal pays at a given door. gross = tickets × price. Promoter expenses come off the gross before a split.
//   guarantee: the fee.   door: pct of (gross − expenses).   versus: the larger of the fee and pct of the net.
//   plus: the fee, plus pct of whatever the gross makes above break-even (expenses + fee).   none: nothing.
export function dealPays(deal = {}, gross = 0) {
  const fee = num(deal.fee), pct = num(deal.pct) / 100, exp = num(deal.expenses), net = Math.max(0, gross - exp);
  switch (deal.type) {
    case 'door': return net * pct;
    case 'versus': return Math.max(fee, net * pct);
    case 'plus': return fee + Math.max(0, gross - exp - fee) * pct;
    case 'none': return 0;
    default: return fee;
  }
}
export function dealSummary(deal, sym = currency()) {
  if (!deal || !deal.type) return '';
  const fee = fmtMoney(num(deal.fee), sym), pct = `${num(deal.pct)}%`, after = num(deal.expenses) ? ` after ${fmtMoney(num(deal.expenses), sym)} costs` : '';
  return { guarantee: `${fee} guarantee`, door: `${pct} of the door${after}`, versus: `${fee} vs ${pct}${after}`, plus: `${fee} + ${pct} after break-even`, none: 'No fee' }[deal.type] || '';
}
// The deal at a full house: the most it can pay.
export const dealBest = deal => dealPays(deal, num(deal && deal.ticketPrice) * num(deal && deal.capacity));

// The night's settlement. b.settlement = { tickets, comps, merch: [{ item, start, end, price, comps }], merchTotal,
// costs: [{ desc, amount }], received, shares: { personId: weight } }. Every figure is a number (0 when unknown).
export function settle(b) {
  const deal = (b && b.deal) || {}, s = (b && b.settlement) || {};
  const tickets = num(s.tickets), price = num(deal.ticketPrice);
  const gross = tickets * price;
  const fee = deal.type ? dealPays(deal, gross) : 0;
  const deposit = num(deal.deposit), depositPaid = !!deal.depositPaid;
  const merchLines = Array.isArray(s.merch) ? s.merch : [];
  const merchCounted = merchLines.reduce((t, m) => t + Math.max(0, num(m.start) - num(m.end) - num(m.comps)) * num(m.price), 0);
  const merch = merchLines.length ? merchCounted : num(s.merchTotal);
  const nightCosts = (Array.isArray(s.costs) ? s.costs : []).reduce((t, c) => t + num(c.amount), 0);
  const budget = (Array.isArray(b && b.budget) ? b.budget : []).reduce((t, c) => t + num(c.amount), 0);
  const costs = nightCosts + budget;
  const owedOnNight = Math.max(0, fee - (depositPaid ? deposit : 0));
  const received = s.received === '' || s.received == null ? null : num(s.received);
  const short = received == null ? 0 : Math.max(0, owedOnNight - received);
  const income = fee + merch;
  const profit = income - costs;
  // Payouts: the profit shared between the people on the booking by weight (1 each unless set).
  const ids = (Array.isArray(b && b.people) ? b.people : []).filter(id => byId('people', id));
  const weights = ids.map(id => Math.max(0, num((s.shares || {})[id] ?? 1)));
  const total = weights.reduce((a, c) => a + c, 0);
  // Shares to the cent that add up exactly to the profit: each floored to the cent, the cents left over going to the
  // largest remainders (mirrored for a loss).
  const cents = Math.round(profit * 100), sign = cents < 0 ? -1 : 1, abs = Math.abs(cents);
  const raw = ids.map((_, i) => (total ? (abs * weights[i]) / total : 0)), floors = raw.map(Math.floor);
  let left = total ? abs - floors.reduce((a, c) => a + c, 0) : 0;
  raw.map((r, i) => [r - floors[i], i]).sort((x, y) => y[0] - x[0]).forEach(([, i]) => { if (left > 0 && weights[i] > 0) { floors[i]++; left--; } });
  const payouts = ids.map((id, i) => ({ personId: id, weight: weights[i], amount: (sign * floors[i]) / 100 }));
  return { tickets, price, gross, fee, deposit, depositPaid, owedOnNight, received, short, merch, costs, nightCosts, budget, income, profit, payouts };
}

// Hours the session clock logged on a booking (breaks off, a running shift up to now), as js/clock.js counts them.
export function clockHoursOf(bookingId, now = Date.now()) {
  let ms = 0;
  for (const s of db.shifts || []) {
    if (!s || s.bookingId !== bookingId || !num(s.start)) continue;
    const hi = s.end ? num(s.end) : now;
    let w = Math.max(0, hi - num(s.start));
    for (const br of Array.isArray(s.breaks) ? s.breaks : []) if (br && num(br.start)) w -= Math.max(0, Math.min(br.end ? num(br.end) : now, hi) - Math.max(num(br.start), num(s.start)));
    ms += Math.max(0, w);
  }
  return Math.round((ms / 36e5) * 100) / 100;
}
// Studio time: the rate times the hours, days or songs. hours comes from the session clock when kept.
export function sessionFee(b, hours) {
  const rate = num(b && b.rate);
  switch (b && b.rateUnit) {
    case 'hour': return rate * num(hours != null ? hours : sessionHoursPlanned(b) * Math.max(1, daysSpan(b))); // planned: every day of a block of studio days
    case 'day': return rate * Math.max(1, daysSpan(b));
    case 'song': return rate * Math.max(1, (b.songIds || []).length);
    default: return rate;
  }
}
export const sessionHoursPlanned = b => { const m = minutesBetween(b && b.start, b && b.end); return m == null ? 0 : m / 60; };
export const daysSpan = b => (b && b.date ? Math.round((Date.parse(lastDate(b)) - Date.parse(b.date)) / 864e5) + 1 : 1);

// The hours a session is expected to bill, as its invoice will (js/money.js): the clock's hours once it has run, to the
// quarter hour and at least one; the planned hours on every day before that. A session still to come (not done, its
// last day not past) or with its clock running never counts for less than its plan, so a few minutes on the clock
// don't empty 'booked ahead'; once it is over, the clock's hours are what it earned.
export function sessionHoursEstimate(b) {
  const planned = sessionHoursPlanned(b) * Math.max(1, daysSpan(b));
  const h = clockHoursOf(b.id);
  if (!(h > 0)) return planned;
  const q = Math.round(h * 4) / 4 || 1;
  const today = new Date(), iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const finished = (b.status === 'done' || b.status === 'settled' || lastDate(b) < iso) && !(db.shifts || []).some(s => s && s.bookingId === b.id && !s.end);
  return finished ? q : Math.max(q, planned);
}
// The session players and engineers on a session at their own rates, as the invoice adds them: by the hour (the
// session's hours), the day (every day), the show (once) or the song (each song worked on).
export function playersFee(b, hours) {
  if (!b || b.kind !== 'session') return 0;
  let t = 0;
  for (const id of Array.isArray(b.people) ? b.people : []) {
    const p = byId('people', id); if (!p || !(num(p.rate) > 0)) continue;
    const qty = p.rateUnit === 'hour' ? (num(hours) || 1) : p.rateUnit === 'show' ? 1 : p.rateUnit === 'song' ? Math.max(1, (b.songIds || []).length) : Math.max(1, daysSpan(b));
    t += num(p.rate) * qty;
  }
  return t;
}
// What a booking brings in (before costs and tax), for the money page and the calendar: what its invoice bills when it
// has one (not void), else a show's deal (at the counted door when settled, else at the guarantee) or a session's fee;
// nothing for a cancelled booking.
export function bookingIncome(b) {
  if (!isLive(b)) return 0;
  const inv = b.invoice;
  if (inv && inv.status !== 'void' && Array.isArray(inv.lines) && inv.lines.length) return Math.round(inv.lines.reduce((t, l) => t + num(l && l.qty) * num(l && l.price), 0) * 100) / 100;
  if (b.kind === 'show') return b.settlement && b.settlement.tickets ? settle(b).fee : dealPays(b.deal || {}, 0);
  if (b.kind === 'session') { const hours = sessionHoursEstimate(b); return sessionFee(b, b.rateUnit === 'hour' ? hours : undefined) + playersFee(b, hours); }
  return num(b.fee);
}
