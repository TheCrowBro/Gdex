// Venues: clubs, halls, studios, rehearsal rooms and festivals, with what a band needs to know before the day:
// capacity, stage, PA, backline provided, load-in, parking, curfew and noise limit, a map, and the bookings there.
// venueWarnings(b) checks a booking against its venue for the booking page (set past curfew, deal above capacity…).
// A venue's house rules (what it allows in) are drawn by js/venues-rules.js: the chip on its card, the full rules on
// its sheet, and their part of the form.
import { h, nodes, empty, sheet, toast, fmtShort, todayISO, telUrl, safeUrl } from '../util.js';
import { db, byId, upsert, remove, subscribe, lastDay } from '../store.js';
import { VENUE_KINDS, venueKindLabel, RATE_UNITS, rateUnitLabel, fmtMoney, fmtMin, addMinutes, minutesBetween, actName, kindLabel, kindIcon, statusLabel, statusTone, byPlay, byDayPlayDesc, RULE_TONES, HOUSE_RULES, rulesOf, unknownRules, seenAnswer } from '../model.js';
import { openForm } from '../form.js';
import { miniMap, mapButtons } from '../map.js';
import { sheetTutorial } from '../tour.js';
import { sectionName, moneyShown } from '../roles.js';
import { workMark } from '../licence-state.js';
import { venueChip, rulesFull, rulesEditor } from '../venues-rules.js';
import { formerlyNote } from '../model.js'; // "formerly The Night Owls": a booking from before its act changed its name

// What the page is showing. Kept here so it survives the redraw after every change.
const S = { kind: '', q: '' };
const ICON = { venue: '🏛️', studio: '🎚️', rehearsal: '🥁', festival: '🎪', other: '📍' };

/* ------------------------------- helpers ------------------------------- */
const kindOf = v => (!v || !v.kind ? 'venue' : VENUE_KINDS.some(k => k[0] === v.kind) ? v.kind : 'other');
const kindText = v => `${ICON[kindOf(v)]} ${venueKindLabel(kindOf(v))}`;
// A booking made from a venue: studio time at a studio, a rehearsal at a rehearsal room, a show anywhere else.
// A free Audiophile without the working roles adds only shows (the owner's answer 1: workMark() is set then).
const bookKind = v => (workMark() ? 'show' : ({ studio: 'session', rehearsal: 'rehearsal' }[kindOf(v)] || 'show'));
const num = x => (x !== '' && x != null && Number.isFinite(Number(x)) ? Number(x) : 0);
const isTime = t => /^\d{1,2}:\d{2}$/.test(t || '');
const venueName = v => String((v && v.name) || '').trim() || 'Unnamed place';
const oneLine = t => String(t || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(', ');
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const dateText = b => (b.date ? fmtShort(b.date) + (lastDay(b) > b.date ? ' – ' + fmtShort(lastDay(b)) : '') : 'No date yet');
// Who a booking is for, without the venue (the venue is already on screen).
const who = b => String(b.title || '').trim() || actName(b.actId) || String(b.client || '').trim() || kindLabel(b.kind);
const isAhead = (b, today = todayISO()) => !b.date || lastDay(b) >= today;
// Soonest first (no date last); on one day, in the order the bands play.
const byDate = (a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')) || byPlay(a, b);
const bookingsAt = id => db.bookings.filter(b => b.venueId === id);
const nextAt = id => { const t = todayISO(); return bookingsAt(id).filter(b => b.status !== 'cancelled' && b.date && isAhead(b, t)).sort(byDate)[0] || null; };
const goBooking = id => import('./bookings.js').then(m => m.openBooking(id)).catch(e => { console.error(e); toast('That booking could not be opened.'); });
// The words a search looks through. The written house rules are read through rulesOf, so a stored note that is not text is not searched.
export const venueText = v => [v.name, v.address, v.contact, v.stage, v.pa, v.backline, v.notes, rulesOf(v).note, venueKindLabel(kindOf(v))].map(x => String(x || '')).join(' ').toLowerCase();
// A venue's ticked house rules in the words a person searches by: a permission as "no phones" and "phones not allowed",
// or "phones allowed"; a fact in its own words ("cash only", "no strobe lighting"); a pick with and without its rule's
// name ("age limit 21+", "21+").
const ruleWords = v => {
  const x = rulesOf(v).values;
  return HOUSE_RULES.filter(r => r.id in x).flatMap(r => {
    const l = r.label.toLowerCase(), opt = r.kind === 'pick' ? ((r.options.find(o => o[0] === x[r.id]) || [])[1] || '') : '';
    return r.kind === 'allow' ? (x[r.id] === 'no' ? [`no ${l}`, `${l} not allowed`] : [`${l} allowed`]) : r.kind === 'fact' ? [r[x[r.id]] || ''] : [`${l} ${opt}`, opt];
  }).map(w => w.toLowerCase()).filter(Boolean);
};
// What was typed, found in a rule's words where a word starts and with no "no" or "not" before it there: "strobe" finds
// "strobe lighting", never "no strobe lighting"; "phones allowed" never "phones not allowed".
const inRule = (words, q) => { for (let i = words.indexOf(q); i >= 0; i = words.indexOf(q, i + 1)) if ((i === 0 || words[i - 1] === ' ') && !/\b(no|not)\b/.test(words.slice(0, i))) return true; return false; };
// Exported: the search at the top of every page finds a venue by the same words (venueText) and rules (venueMatches).
export const venueMatches = (v, q) => venueText(v).includes(q) || ruleWords(v).some(w => inRule(w, q));
const matches = venueMatches;

// The hire rate of a studio or a room, as "$45 per hour". '' when none is set, and for a role without money (a scout, a
// gig-goer), whose pages keep fees off (the form keeps the field).
const rateText = v => (moneyShown() && num(v.rate) > 0 ? `${fmtMoney(num(v.rate))} ${rateUnitLabel(v.rateUnit || 'hour')}` : '');
// The short facts on a card: how many it holds, the curfew, the noise limit, the rate for a studio or a room.
const facts = v => [
  num(v.capacity) > 0 && `Holds ${num(v.capacity)}`,
  isTime(v.curfew) && `Curfew ${v.curfew}`,
  num(v.noiseLimit) > 0 && `🔊 ${num(v.noiseLimit)} dB`,
  rateText(v),
].filter(Boolean);

// Redraw without losing the box someone is typing in or the chip they tapped (by id).
function keepFocus(root, fn) {
  const a = document.activeElement;
  const id = a && a !== document.body && root.contains(a) ? a.id : '';
  const pos = id && typeof a.selectionStart === 'number' ? a.selectionStart : null;
  fn();
  if (!id) return;
  const el = document.getElementById(id);
  if (!el || !root.contains(el)) return;
  el.focus({ preventScroll: true });
  if (pos != null) { try { el.setSelectionRange(pos, pos); } catch { /* not a text box */ } }
}

/* ------------------------------- warnings ------------------------------- */
// Times of one night, as minutes after `anchor` (the first time of the day), so 00:30 after a 22:00 set counts as later.
// A time more than 18 hours after the anchor is read as before it (a curfew set before the band goes on).
const offset = (anchor, t) => { if (!isTime(anchor) || !isTime(t)) return null; const m = minutesBetween(anchor, t); return m > 1080 ? m - 1440 : m; };

// What to know about a booking at its venue: [{ level: 'warn' | 'info', text }]. The words are neutral ("the set", not
// "your set"): the person may be the band, its manager or someone in the crowd. The capacity lines are about the deal
// and the settlement, so they show only for a role that uses money.
export function venueChecks(b) {
  const out = [];
  const v = b && b.venueId ? byId('venues', b.venueId) : null;
  if (!v) return out;
  const name = venueName(v);
  const warn = text => out.push({ level: 'warn', text }), info = text => out.push({ level: 'info', text });
  if (b.kind === 'show') {
    const anchor = [b.loadIn, b.soundcheck, b.doors, b.setTime].find(isTime) || '';
    const len = Math.max(0, Math.round(num(b.setLength)));
    if (isTime(v.curfew) && isTime(b.setTime)) {
      const start = offset(anchor, b.setTime), cur = offset(anchor, v.curfew), end = start + len;
      if (cur < start) warn(`The curfew at ${name} (${v.curfew}) is before the set starts (${b.setTime}).`);
      else if (len > 0 && end > cur) warn(`The set ends at ${addMinutes(b.setTime, len)}, ${fmtMin(end - cur)} after the ${v.curfew} curfew at ${name}.`);
    }
    if (isTime(v.curfew) && isTime(b.curfew) && b.curfew !== v.curfew) {
      const later = minutesBetween(v.curfew, b.curfew); // the same night: within 12 hours after the venue's own
      if (later > 0 && later <= 720) warn(`This show’s curfew (${b.curfew}) is later than the usual ${v.curfew} at ${name}. Check it with the venue.`);
    }
    const cap = num(v.capacity);
    if (cap > 0 && moneyShown()) {
      const dealCap = num(b.deal && b.deal.capacity), sold = num(b.settlement && b.settlement.tickets);
      if (dealCap > cap) warn(`The deal counts on ${dealCap} tickets, but ${name} holds ${cap}.`);
      if (sold > cap) warn(`The settlement counts ${sold} tickets, more than ${name} holds (${cap}).`);
    }
    if (isTime(b.loadIn) && isTime(b.soundcheck) && minutesBetween(b.loadIn, b.soundcheck) > 720) warn(`Load-in (${b.loadIn}) is after soundcheck (${b.soundcheck}).`);
    if (num(v.noiseLimit) > 0) info(`Noise limit ${num(v.noiseLimit)} dB at ${name}.`);
  } else if (isTime(v.curfew) && isTime(b.start) && isTime(b.end)) {
    const end = offset(b.start, b.end), cur = offset(b.start, v.curfew);
    if (cur < 0) warn(`The curfew at ${name} (${v.curfew}) is before this starts (${b.start}).`);
    else if (end > cur) warn(`This runs to ${b.end}, ${fmtMin(end - cur)} past the ${v.curfew} curfew at ${name}.`);
  }
  return out;
}
// The same as plain strings, for the booking page. [] when there is nothing to say or no venue.
export function venueWarnings(b) { return venueChecks(b).map(x => x.text); }

/* ------------------------------- the page ------------------------------- */
export const venues = {
  id: 'venues', label: 'Venues', icon: '📍',
  render(root) {
    const draw = () => keepFocus(root, () => root.replaceChildren(...nodes(listView(draw))));
    draw();
  },
  tutorial: () => PAGE_STEPS(),
};

function listView(draw) {
  const all = db.venues;
  const counts = new Map();
  all.forEach(v => counts.set(kindOf(v), (counts.get(kindOf(v)) || 0) + 1));
  if (S.kind && !counts.has(S.kind)) S.kind = ''; // the last place of that kind is gone
  const q = S.q.trim().toLowerCase();
  const shown = all.filter(v => (!S.kind || kindOf(v) === S.kind) && (!q || matches(v, q))).sort((a, b) => venueName(a).localeCompare(venueName(b)));
  const chip = (key, label, n) => h('button', { type: 'button', id: 'vn-kind-' + (key || 'all'), class: 'chip' + (S.kind === key ? ' on' : ''), 'aria-pressed': String(S.kind === key),
    onclick: () => { S.kind = key; draw(); } }, label, h('span', { class: 'vn-n' }, ' ' + n));
  return [
    h('div', { class: 'page-head vn-head' }, h('h1', null, sectionName('venues', 'Venues')),
      h('button', { type: 'button', class: 'btn primary', id: 'vn-add', onclick: () => editVenue({ kind: S.kind || 'venue' }) }, '+ Add')),
    counts.size > 1 && h('div', { class: 'chips vn-kinds', role: 'group', 'aria-label': 'Kind of place' },
      chip('', 'All', all.length), VENUE_KINDS.filter(([k]) => counts.has(k)).map(([k, l]) => chip(k, `${ICON[k]} ${l}`, counts.get(k)))),
    (all.length > 4 || S.q) && h('input', { class: 'search', type: 'search', id: 'vn-search', placeholder: 'Search name, address, contact…', 'aria-label': 'Search venues', value: S.q, autocomplete: 'off',
      oninput: e => { S.q = e.target.value; draw(); } }),
    shown.length
      ? h('div', { class: 'list vn-list' }, shown.map(venueCard))
      : all.length
        ? empty('No place matches that. Try another word or kind.', h('button', { type: 'button', class: 'btn ghost', id: 'vn-clear', onclick: () => { S.q = ''; S.kind = ''; draw(); } }, 'Show every place'))
        : empty(moneyShown() ? 'Save the clubs, halls, studios and rehearsal rooms you play and record in. Shows there warn you if a set would run past curfew.'
          : `Save the rooms you go to, with capacity, PA, noise limit and a map. Each lists the ${sectionName('bookings', 'Bookings').toLowerCase()} you’ve been to there.`,
          h('button', { type: 'button', class: 'btn primary', id: 'vn-first', onclick: () => editVenue({ kind: 'venue' }) }, 'Add a venue')),
  ];
}

function venueCard(v) {
  const next = nextAt(v.id), addr = oneLine(v.address), f = facts(v);
  // data-fk: when the page is drawn again under the venue's open sheet (an edit saved from it), closing the sheet finds this card's stand-in.
  return h('button', { type: 'button', class: 'card tap vn-card', id: 'vn-' + v.id, 'data-id': v.id, 'data-fk': 'vn-' + v.id, onclick: () => openVenue(v.id) },
    h('span', { class: 'vn-card-top' }, h('strong', { class: 'vn-card-name' }, venueName(v)), h('span', { class: 'pill vn-kind' }, kindText(v))),
    addr && h('span', { class: 'vn-addr muted small' }, addr),
    f.length > 0 && h('span', { class: 'vn-facts small' }, f.map(x => h('span', { class: 'vn-fact' }, x))),
    venueChip(v), // its house rules in a few words, on a line of their own (green, amber or red)
    next && h('span', { class: 'vn-next small' }, `Next: ${dateText(next)} · ${kindIcon(next.kind)} ${who(next)}`));
}

/* ------------------------------- one venue ------------------------------- */
function bookingRow(b, close, withWarnings) {
  const issues = withWarnings ? venueChecks(b).filter(x => x.level === 'warn') : [];
  return h('button', { type: 'button', class: 'vn-row', id: 'vn-bk-' + b.id, onclick: () => { close(); goBooking(b.id); } },
    h('span', { class: 'vn-row-date' }, dateText(b)),
    h('span', { class: 'pill ' + statusTone(b.status) }, statusLabel(b.status)),
    h('span', { class: 'vn-row-main' }, `${kindIcon(b.kind)} ${who(b)}`),
    formerlyNote(b) && h('span', { class: 'vn-row-was muted small' }, formerlyNote(b)),
    // A show the person said they missed ("Did you see them?" → No) says so here too: this is the list of what they went to.
    b.kind === 'show' && b.status !== 'cancelled' && b.went === 'no' && seenAnswer(b) === 'no' && h('span', { class: 'vn-row-went muted small' }, 'Didn’t go'),
    issues.map(x => h('span', { class: 'vn-row-warn' }, '⚠ ' + x.text)));
}

// The sheet's button. A role without money (a scout, a gig-goer) is going to things, not booking them: it adds a show
// (or a studio session, or a rehearsal) here to the calendar.
const bookWords = v => (moneyShown() ? { btn: '+ Book here', none: `Nothing booked here yet. + Book here starts a ${kindLabel(bookKind(v)).toLowerCase()} at ${venueName(v)}.` }
  : { btn: `+ Add a ${kindLabel(bookKind(v)).toLowerCase()} here`, none: 'Nothing on your calendar here yet.' });
function bookHere(v) {
  return import('./bookings.js').then(m => m.newBooking({ kind: bookKind(v), venueId: v.id })).catch(e => { console.error(e); toast('A booking could not be started here.'); });
}

// The venue's sheet: the map, contact, the details a band needs, and the bookings there (tap one to open it).
export function openVenue(id) {
  const first = byId('venues', id);
  if (!first) { toast('That venue is no longer in your list.'); return null; }
  let title = venueName(first), allPast = false;
  sheetTutorial(title, SHEET_STEPS);
  const body = h('div', { class: 'stack vn-sheet' });
  let handle = null, queued = false, unsub = () => {};
  const close = () => handle && handle.close();
  const draw = () => {
    queued = false;
    const v = byId('venues', id);
    if (!v) { close(); return; } // deleted (here or from another sheet)
    if (handle && venueName(v) !== title) { // renamed: the sheet's heading follows
      title = venueName(v); sheetTutorial(title, SHEET_STEPS);
      handle.el.setAttribute('aria-label', title);
      const h2 = handle.el.querySelector('.sheet-head h2'); if (h2) h2.textContent = title;
    }
    const now = todayISO(), here = bookingsAt(id);
    const next = here.filter(b => isAhead(b, now)).sort(byDate), past = here.filter(b => !isAhead(b, now)).sort(byDayPlayDesc); // newest day first, a day in playing order
    const site = safeUrl(String(v.website || '').trim());
    const details = [
      ['Capacity', num(v.capacity) > 0 ? String(num(v.capacity)) : ''], ['Stage', v.stage], ['PA & desk', v.pa], ['Backline provided', v.backline],
      ['Load-in', v.loadIn], ['Parking', v.parking], ['Curfew', isTime(v.curfew) ? v.curfew : ''], ['Noise limit', num(v.noiseLimit) > 0 ? `${num(v.noiseLimit)} dB` : ''],
      ['Hospitality', v.hospitality], ['Rate', rateText(v)],
    ].filter(([, x]) => String(x || '').trim());
    const map = miniMap(v), buttons = mapButtons(v);
    // The sheet is drawn again after every change (Edit → Save lands back on Edit): the control in focus keeps it, by its id.
    keepFocus(body, () => body.replaceChildren(...nodes(
      h('div', { class: 'vn-top' }, h('span', { class: 'pill vn-kind' }, kindText(v)), v.address && h('p', { class: 'prewrap vn-address' }, v.address)),
      h('div', { class: 'actions vn-sheet-actions' },
        h('button', { type: 'button', class: 'btn primary', id: 'vn-book', onclick: () => { close(); bookHere(v); } }, bookWords(v).btn),
        h('button', { type: 'button', class: 'btn ghost', id: 'vn-edit', onclick: () => editVenue(v) }, '✎ Edit')),
      h('div', { class: 'vn-map' }, map, buttons || h('p', { class: 'muted small' }, 'Add an address or a map location to get directions.')),
      (v.contact || v.phone || v.email || site) && h('section', { class: 'vn-contact' }, h('h3', null, 'Contact'),
        v.contact && h('p', { class: 'vn-contact-name' }, v.contact),
        h('div', { class: 'actions' },
          v.phone && h('a', { class: 'btn ghost small', href: telUrl(v.phone), 'aria-label': `Call ${v.contact || venueName(v)}: ${v.phone}` }, '📞 ' + v.phone),
          v.email && h('a', { class: 'btn ghost small', href: 'mailto:' + String(v.email).trim(), 'aria-label': `Email ${v.contact || venueName(v)}` }, '✉ Email'),
          site && h('a', { class: 'btn ghost small', href: site, target: '_blank', rel: 'noopener noreferrer' }, '🌐 Website'))),
      h('section', { class: 'vn-details' }, h('h3', null, 'Details'),
        details.length ? h('dl', { class: 'vn-kv' }, details.map(([k, x]) => [h('dt', null, k), h('dd', null, x)]))
          : h('p', { class: 'muted small' }, 'Nothing noted yet. ✎ Edit adds the capacity, stage, PA, curfew, load-in and parking.')),
      // What the place allows in. They are the venue's: every show here carries them, whoever plays.
      h('section', { class: 'vn-rules-sec' }, h('h3', null, 'House rules'),
        rulesFull(v) || h('p', { class: 'muted small' }, 'No house rules noted yet. ✎ Edit adds them.')),
      v.notes && h('section', null, h('h3', null, 'Notes'), h('p', { class: 'prewrap vn-notes' }, v.notes)),
      h('section', { class: 'vn-bookings' },
        h('h3', null, `Coming up here (${next.length})`),
        next.length ? h('div', { class: 'vn-rows' }, next.map(b => bookingRow(b, close, true)))
          : h('p', { class: 'muted small' }, bookWords(v).none),
        past.length > 0 && [
          h('h3', null, `Before (${past.length})`),
          h('div', { class: 'vn-rows' }, (allPast ? past : past.slice(0, 5)).map(b => bookingRow(b, close, false))),
          past.length > 5 && h('button', { type: 'button', class: 'btn ghost small', id: 'vn-more', onclick: () => { allPast = !allPast; draw(); document.getElementById('vn-more')?.focus(); } },
            allPast ? 'Show fewer' : `Show all ${past.length}`)]))));
  };
  handle = sheet(title, body, { onClose: () => unsub() });
  unsub = subscribe(() => { if (!queued) { queued = true; queueMicrotask(draw); } });
  draw();
  return handle;
}

/* ------------------------------- the form ------------------------------- */
const numOrBlank = (x, whole = false) => (x === '' || x == null || !Number.isFinite(Number(x)) ? '' : whole ? Math.max(0, Math.round(Number(x))) : Math.max(0, Number(x)));

// Add or edit a venue, studio, rehearsal room or festival. onSaved(record) after it is stored.
export function editVenue(v = {}, onSaved) {
  const cur = (v && v.id && byId('venues', v.id)) || v || {};
  const had = rulesOf(cur);         // the rules as stored, cleaned: junk reads as nothing
  const editor = rulesEditor(cur);  // the House rules part: it keeps its own answers until Save reads them
  openForm({
    title: cur.id ? 'Edit venue' : 'Add venue',
    saveLabel: cur.id ? 'Save' : 'Add venue',
    values: { rateUnit: 'hour', ...cur, kind: kindOf(cur), rulesNote: had.note, rulesTone: had.tone }, // a tone that is not one of RULE_TONES shows as Automatic
    fields: [
      { key: 'name', label: 'Name', required: true, placeholder: 'e.g. The Lantern Rooms' },
      { key: 'kind', label: 'Kind of place', type: 'select', options: VENUE_KINDS },
      { key: 'address', label: 'Address', type: 'textarea', rows: 2, placeholder: 'Street, town, postcode' },
      { key: 'geo', label: 'Map location', type: 'place', hint: 'For the map and directions: find it from the address, paste a map link, or use where you are now.' },
      { key: 'capacity', label: 'Capacity', type: 'number', min: 0, placeholder: 'People' },
      { key: 'curfew', label: 'Curfew', type: 'time', hint: 'When the music has to stop. Shows here warn you if the set runs past it.' },
      { key: 'noiseLimit', label: 'Noise limit (dB)', type: 'number', min: 0, step: 'any', placeholder: 'e.g. 98' },
      // House rules: the answers (editor.node, put in by onReady just above this box), anything else in words, and the colour.
      { key: 'rulesNote', label: 'Other house rules', type: 'textarea', rows: 2, placeholder: 'e.g. No re-entry after 11pm. Coats in the cloakroom.', hint: 'Anything the rules above don’t cover. It appears on every show here.' },
      { key: 'rulesTone', label: 'How strict', type: 'select', options: RULE_TONES, hint: 'The colour of the house rules on this venue’s shows: green, amber or red. Automatic works it out from the answers above.' },
      { key: 'stage', label: 'Stage', placeholder: 'e.g. 6m × 4m, drum riser' },
      { key: 'pa', label: 'PA & desk', placeholder: 'e.g. d&b, Midas M32 at FOH, 4 wedges' },
      { key: 'backline', label: 'Backline provided', type: 'textarea', rows: 2, placeholder: 'e.g. Drum kit shell pack, bass cab' },
      { key: 'loadIn', label: 'Load-in', type: 'textarea', rows: 2, placeholder: 'Which door, steps or a lift, when you can arrive' },
      { key: 'parking', label: 'Parking', placeholder: 'e.g. 2 spaces behind the venue' },
      { key: 'hospitality', label: 'Hospitality', type: 'textarea', rows: 2, placeholder: 'Green room, food, drinks, towels' },
      { key: 'rate', label: 'Rate', type: 'number', min: 0, step: 'any', hint: 'For studios and rehearsal rooms.' },
      { key: 'rateUnit', label: 'Rate is', type: 'select', options: RATE_UNITS },
      { key: 'contact', label: 'Contact', placeholder: 'Promoter, booker or studio manager' },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'website', label: 'Website', type: 'url', placeholder: 'example.com' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    onReady: form => { const note = form.querySelector('[data-key=rulesNote]'); if (note && editor.node) note.closest('.field').before(editor.node); },
    onSave: val => {
      const nm = String(val.name || '').trim();
      if (!nm) return toast('Give the place a name first.');
      // All three house-rules fields are always stored (rules as an object, {} when nothing is known), so a venue saved
      // here is told apart from one that never had them (the sample adds its rules only to the latter). The form
      // replaces only the rules this build knows: answers to any other rule (from a newer Tourbook) are kept as stored.
      const stored = upsert('venues', { ...val, name: nm, capacity: numOrBlank(val.capacity, true), noiseLimit: numOrBlank(val.noiseLimit), rate: numOrBlank(val.rate),
        website: String(val.website || '').trim(), email: String(val.email || '').trim(), phone: String(val.phone || '').trim(),
        rules: { ...unknownRules(byId('venues', cur.id) || cur), ...editor.read() }, rulesNote: String(val.rulesNote || '').trim(), rulesTone: RULE_TONES.some(t => t[0] === val.rulesTone) ? val.rulesTone : '' });
      if (!stored) return; // refused by the licence (read-only): nothing was stored, and the licence's sheet says so
      toast(cur.id ? 'Saved' : `${nm} added`);
      onSaved && onSaved(stored);
    },
    // Bookings there keep the venue's name and address as typed text (store.remove).
    onDelete: cur.id ? () => { remove('venues', cur.id); toast(`${venueName(cur)} deleted. Bookings there keep its name and address.`); keepFocusOnPage(); } : null,
  });
}

// A place made from a name typed in a booking's form: its name, the address typed with it and its kind, with the three
// house-rules fields the venue form always stores (so the sample never takes it for one of its own). Null when refused.
export const addVenueNamed = ({ name, address = '', kind = 'venue' }) => upsert('venues', { name: String(name || '').trim() || 'Unnamed venue', kind, address: String(address || '').trim(), geo: null, rules: {}, rulesNote: '', rulesTone: '', rateUnit: 'hour' });

// After a delete the venue's sheet closes, and what opened it (its card, a show's Details) goes with the venue: once
// the page is drawn again, a focus left nowhere goes to the page's heading that takes it (a show's title) or the page.
const keepFocusOnPage = () => setTimeout(() => {
  const a = document.activeElement;
  if (a && a !== document.body) return;
  (document.querySelector('#page [data-view-head]') || document.getElementById('page'))?.focus({ preventScroll: true });
}, 60);

/* ------------------------------- walkthroughs ------------------------------- */
// Read when the walkthrough runs, so its words follow the role: a role without money goes to shows rather than plays them.
const PAGE_STEPS = () => [
  moneyShown() ? { title: 'Places you play and record', text: 'Venues, studios, rehearsal rooms and festivals. + Add saves one with its capacity, stage, PA, curfew, load-in, contact and map.', target: ['.vn-head'] }
    : { title: 'The rooms you go to', text: 'Clubs, halls and festivals. + Add saves one with its capacity, the PA, the noise limit, the contact and a map.', target: ['.vn-head'] },
  { title: 'Kinds of place', text: 'Show only venues, studios, rehearsal rooms or festivals.', target: ['.vn-kinds'] },
  { title: 'Find a place', text: 'Search by name, address, contact, stage, PA or a house rule (“no phones”, “cash only”, “21+”).', target: ['#vn-search'] },
  { title: 'A place', text: 'Capacity, curfew, noise limit, house rules and your next booking there. Tap it for the map, details and every booking.', target: ['.vn-card'] },
];
const SHEET_STEPS = () => [
  moneyShown() ? { title: 'Book here', text: 'Starts a booking at this place: a show at a venue or festival, a session at a studio, a rehearsal at a room. Edit changes the details or deletes it.', target: ['.vn-sheet-actions'] }
    : { title: 'Add one here', text: 'Puts a date at this place on your calendar: a show at a venue or festival, a studio session at a studio, a rehearsal at a room. Edit changes the details or deletes it.', target: ['.vn-sheet-actions'] },
  { title: 'Getting there', text: 'The map, and directions in your maps app.', target: ['.vn-map'] },
  { title: 'What to know', text: 'Capacity, stage, PA, backline provided, load-in, parking, curfew and noise limit: the things to check before the day.', target: ['.vn-details'] },
  { title: 'House rules', text: 'What this place allows and doesn’t: cameras, the age limit, bags and anything unusual. They appear on every show here.', target: ['.vn-rules-sec'] },
  { title: `${sectionName('bookings', 'Bookings')} here`, text: moneyShown() ? 'What is coming up and what you played before. A warning shows when a set would run past the curfew. Tap one to open it.' : 'What is coming up here and what you went to before. Tap one to open it.', target: ['.vn-bookings'] },
];
// Read when the walkthrough runs (sheetTutorial takes a function), so its words follow the role.
const FORM_STEPS = () => [
  { title: 'The place', text: 'Its name, what kind of place it is, and the address.', target: ['[data-key=name]'] },
  { title: 'On the map', text: 'Find it from the address, paste a map link, or use where you are now. The map and directions use it.', target: ['.place'] },
  { title: 'Curfew and limits', text: moneyShown() ? 'Shows here warn you if a set would run past curfew or the deal counts on more people than the place holds.' : 'Shows here warn you if a set would run past curfew. The noise limit is there for the sound meter.', target: ['[data-key=curfew]', '[data-key=capacity]'] },
  { title: 'House rules', text: 'Tap what you know and type anything unusual. They appear on every show here in green, amber or red. How strict sets the colour by hand.', target: ['.vn-rules-edit .vn-rule', '.vn-rules-edit'] }, // one rule with its two buttons: the whole block is taller than a phone, and the card would be cut short over its middle
];
sheetTutorial('Add venue', FORM_STEPS);
sheetTutorial('Edit venue', FORM_STEPS);
