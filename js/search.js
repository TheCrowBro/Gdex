// Search: the magnifying glass in the top bar, on every page and in every role, and the "/" key. It opens a sheet over
// whatever is on screen: a box, and as the person types, every booking on the calendar and every time seen in a band's
// log that has no booking on the calendar, found by the band (its name, its genre), the place (a venue's name and
// address, or a place typed by hand), the booking itself (its title, the other acts on its bill) or the notes.
// One list, newest first, with a line for today between what is still ahead and what is over. A booking is drawn with
// the calendar's own Coming up card (js/bookings-cal.js bookingCard), so its status, the house-rules chip, the overlap
// note and "Didn’t go" read as they do on the calendar. A time seen that belongs to a show on the calendar is not a
// second result: its score shows on that show's card.
// Nothing about a search is stored on the device. What was typed, the kind and the place picked and how far the list
// was read live in memory (S), so opening the search again in the same visit brings the last one back.
import { h, sheet, announce, todayISO, parseISO, fmtLong, fmtShort } from './util.js';
import { db, subscribe, lastDay } from './store.js';
import * as model from './model.js';
import { sectionName, actWord, kindOrder } from './roles.js';
import { sheetTutorial } from './tour.js';
import { isoOk, actStyle, plural, capital, KIND_CHIP } from './bookings-kit.js';
import { bookingCard } from './bookings-cal.js';
import { isAct } from './blocks/running.js';
import { openBooking } from './pages/bookings.js';
import { openSeen } from './pages/acts.js'; // already loaded with the app: the bookings page imports it

const TITLE = 'Search';
const STEP = 30;        // cards drawn at first, and added by each Show more
const MAX_PLACES = 24;  // place chips drawn; a place past that is reached by typing it
const KIND_ORDER = model.KINDS.map(k => k[0]); // show, session, rehearsal, other

/* ------------------------------- words, in the role's own ------------------------------- */
// What the role calls a show: "gig" where its calendar is called Gigs (js/roles.js names), else "show".
const showWords = () => (/^gigs$/i.test(sectionName('bookings', '')) ? ['gig', 'gigs'] : ['show', 'shows']);
const NOUNS = { session: ['session', 'sessions'], rehearsal: ['rehearsal', 'rehearsals'], other: ['diary entry', 'diary entries'] };
const nouns = kind => (kind === 'show' ? showWords() : NOUNS[kind] || NOUNS.other);
const count = (n, kind) => plural(n, ...nouns(kind)); // "6 shows", "1 session"
const kindName = kind => (kind === 'show' ? capital(showWords()[1]) : KIND_CHIP[kind] || KIND_CHIP.other); // on the kind row
const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const helpText = () => `Type ${an(actWord())}, a place, a support act or a word from your notes. It looks through everything in ${sectionName('bookings', 'Bookings')}, and the times you logged seeing ${an(actWord())} in ${sectionName('acts', 'Acts')}.`;

/* ------------------------------- what is searched ------------------------------- */
// Every name an act is known by. Today that is its name alone. A band that was renamed keeps its earlier names: they
// join the list here, and the search then finds the band by any of them (this is the one place it reads a band's name).
export const actNames = a => [a && a.name].map(n => String(n || '').trim()).filter(Boolean);

// Words as the search compares them: no capitals, no accents (Motörhead is found by "motorhead"), the letters that
// have no accent to drop written out (ø, ß, æ…), and curly quotes straight.
const LETTERS = { ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe', đ: 'd', ð: 'd', ł: 'l', þ: 'th', ı: 'i' };
export const fold = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[øßæœđðłþı]/g, c => LETTERS[c]).replace(/[‘’ʼ`´]/g, "'").replace(/[“”]/g, '"');
// The words typed, each without the punctuation around it ("Wolfe," is wolfe; "AC/DC" and "Guns N' Roses" keep theirs).
const wordsOf = q => fold(q).split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// The other acts on a show's bill: the slots of its running order that are acts, ours left out (the band is searched
// by its own names). js/blocks/running.js isAct tells an act from a marker (Doors, Changeover, Curfew…) by its name
// once the slot has a length, so a support act typed without one yet is asked about as if it had.
const billOf = b => (Array.isArray(b.runningOrder) ? b.runningOrder : [])
  .filter(r => r && typeof r === 'object' && !r.ours && clean(r.act) && isAct({ ...r, length: 1 })).map(r => clean(r.act));

// The words to search are built once per change of the data, not once per key press: INDEX is dropped when the store
// says something changed and built again by the next search. Each record: { type: 'b' (a booking) | 's' (a time seen
// with no booking on the calendar), id, kind, date, last, place: { key, name }, text (everything searched, folded),
// front (the words its card prints: the band, the place, the title), bill, notes } and b + seen (the act's time seen
// for that booking, or null), or a + s.
let INDEX = null;
const STATS = { builds: 0, buildMs: 0, findMs: 0, drawMs: 0 };
function buildIndex() {
  const t0 = performance.now();
  const acts = new Map((db.acts || []).filter(a => a && a.id).map(a => [a.id, a]));
  const venues = new Map((db.venues || []).filter(v => v && v.id).map(v => [v.id, v]));
  // A place typed by hand that is the name of exactly one saved venue is that venue (a log that says "The Church").
  const byName = new Map();
  for (const v of venues.values()) { const k = fold(clean(v.name)); if (k) byName.set(k, byName.has(k) ? null : v); }
  const placeOf = (venueId, typed) => {
    const name = clean(typed), v = venues.get(venueId) || (name && byName.get(fold(name))) || null;
    return v ? { key: 'v:' + v.id, name: clean(v.name) || 'Unnamed venue', v } : name ? { key: 't:' + fold(name), name, v: null } : { key: '', name: '', v: null };
  };
  const items = [], claimed = new Set();
  for (const b of db.bookings || []) {
    if (!b || !isoOk(b.date)) continue; // a booking with no date is not on the calendar
    const a = acts.get(b.actId) || null, names = a ? actNames(a) : [];
    const seen = a ? model.seenEntryFor(a, b) : null; // the act's time seen that belongs to this booking
    if (seen) claimed.add(seen);
    const place = placeOf(b.venueId, b.venueName || String(b.address || '').split('\n')[0]);
    const bill = billOf(b), notes = [b.notes, seen && seen.notes].map(clean).filter(Boolean);
    const front = [...names, b.client, place.name, b.title];
    const rest = [a && a.genre, place.v && place.v.address, b.venueName, b.address, seen && !seen.venueId && seen.where, ...bill, ...notes];
    items.push({ type: 'b', id: b.id, kind: KIND_ORDER.includes(b.kind) ? b.kind : 'other', date: b.date, last: lastDay(b), b, seen, place, bill, notes,
      front: fold(front.filter(Boolean).join('\n')), text: fold([...front, ...rest].filter(Boolean).join('\n')) });
  }
  for (const a of acts.values()) {
    const names = actNames(a);
    for (const s of model.seenOf(a)) {
      if (claimed.has(s) || !isoOk(s.date)) continue; // on a show's card already
      const place = placeOf(s.venueId, s.where), notes = [clean(s.notes)].filter(Boolean);
      const front = [...names, place.name];
      items.push({ type: 's', id: s.id, kind: 'show', date: s.date, last: s.date, a, s, place, bill: [], notes,
        front: fold(front.filter(Boolean).join('\n')), text: fold([...front, a.genre, place.v && place.v.address, s.where, ...notes].filter(Boolean).join('\n')) });
    }
  }
  // Newest first; on one day the bookings in the order the bands play, then the times seen (the store's sort is stable,
  // so those stay as model.seenOf gave them: the one saved last first).
  items.sort((x, y) => y.date.localeCompare(x.date) || (x.type === 'b' && y.type === 'b' ? model.byPlay(x.b, y.b) : (x.type === 'b' ? 0 : 1) - (y.type === 'b' ? 0 : 1)));
  STATS.builds++; STATS.buildMs = performance.now() - t0;
  return items;
}
subscribe(() => { INDEX = null; if (UI) { clearTimeout(UI.again); UI.again = setTimeout(draw, 0); } });

// Everything found for what was typed, newest first; null when nothing was typed. Every word must be found somewhere
// in a record's words, in any order ("wolfe church" finds Chelsea Wolfe at The Church).
function find(q) {
  const words = wordsOf(q);
  if (!words.length) return null;
  const t0 = performance.now();
  const found = (INDEX || (INDEX = buildIndex())).filter(it => words.every(w => it.text.includes(w)));
  STATS.findMs = performance.now() - t0;
  return found;
}
// For checks and measurements: what a search finds, without drawing it; and how long the last index, search and draw took.
export const searchFor = q => (find(q) || []).map(it => ({ type: it.type, id: it.id, kind: it.kind, date: it.date, place: it.place.name }));
export const searchStats = () => ({ ...STATS, records: INDEX ? INDEX.length : 0 });

// Still ahead, or over. A booking stays ahead until its last day ends (as Coming up keeps it); a time seen is over
// from the day it is dated.
const isAhead = (it, today) => (it.type === 'b' ? it.last >= today : it.date > today);

/* ------------------------------- the cards ------------------------------- */
// The date square of a card says no year: a result from another year adds it.
const yearOf = iso => (iso.slice(0, 4) === String(new Date().getFullYear()) ? null : h('span', { class: 'srch-year' }, iso.slice(0, 4)));
// "★ Scored 86/100", as a show's own page says it.
const scoreLine = s => { const r = model.ratingOf(s); return h('span', { class: 'srch-score' }, h('span', { 'aria-hidden': 'true' }, '★ '), r != null ? ['Scored ', h('b', null, String(r)), '/100'] : 'Seen, no score yet'); };
// A piece of a note around the word found in it.
function excerpt(note, at) {
  let from = Math.max(0, at - 32), to = Math.min(note.length, at + 64);
  if (from > 0) { const sp = note.indexOf(' ', from); if (sp >= 0 && sp < at) from = sp + 1; }
  if (to < note.length) { const sp = note.lastIndexOf(' ', to); if (sp > at) to = sp; }
  return (from > 0 ? '…' : '') + note.slice(from, to) + (to < note.length ? '…' : '');
}
// Why a card is here when its own words do not show it: a word typed that is not in the band, the place or the title
// was found on the bill, or else in the notes. (A word found only in a genre or an address adds no line.)
function whyLines(it, words) {
  const hidden = words.filter(w => !it.front.includes(w)), out = [];
  if (!hidden.length) return out;
  const bill = it.bill.filter(name => hidden.some(w => fold(name).includes(w)));
  if (bill.length) out.push(h('span', { class: 'srch-why' }, 'Also on the bill: ' + bill.join(', ')));
  const left = hidden.filter(w => !bill.some(name => fold(name).includes(w)));
  for (const note of it.notes) {
    const low = fold(note), w = left.find(x => low.includes(x));
    if (w) { out.push(h('span', { class: 'srch-why' }, 'Notes: ' + excerpt(note, low.indexOf(w)))); break; }
  }
  return out;
}
// A booking with a title of its own ("Halloween Special") has a card that does not name its band: a line does
// ("Band: The Night Owls"), so a card found by the band says whose show it is.
const whoLine = b => { const who = clean(model.actName(b.actId) || b.client);
  return !!who && !fold(model.bookingTitle(b)).includes(fold(who)) && h('span', { class: 'srch-why srch-who' }, `${capital(actWord())}: ${who}`); };
// A booking: the calendar's own card, with the year when it is not this one, its band when the title hides it, the
// score when the act's log has the show, and why it was found.
function showCard(it, words) {
  const card = bookingCard(it.b), main = card.querySelector('.bk-card-main'), year = yearOf(it.date);
  if (year) card.querySelector('.bk-date')?.append(year);
  if (main) main.append(...[whoLine(it.b), it.seen && scoreLine(it.seen), ...whyLines(it, words)].filter(Boolean));
  return card;
}
// A time seen with no booking on the calendar: a plainer card with the date, the band, the place, the score, and
// words that say it is from the log. It borrows the calendar card's layout (css/bookings.css), not its content.
function seenCard(it, words) {
  const d = parseISO(it.date), name = clean(it.a.name) || 'Unnamed act';
  return h('button', { type: 'button', class: 'card tap bk-card srch-seen', style: actStyle({ actId: it.a.id }), 'data-act': it.a.id, 'data-seen': it.s.id },
    h('span', { class: 'bk-date', 'aria-hidden': 'true' },
      h('span', null, d.toLocaleDateString(undefined, { weekday: 'short' })), h('b', null, d.getDate()), h('span', null, d.toLocaleDateString(undefined, { month: 'short' })), yearOf(it.date)),
    h('span', { class: 'sr-only' }, fmtLong(it.date) + '. '),
    h('span', { class: 'bk-card-main' },
      h('span', { class: 'bk-card-top' }, h('strong', { class: 'bk-card-title' }, [name, it.place.name].filter(Boolean).join(' @ ')), h('span', { class: 'pill srch-log' }, 'From the log')),
      scoreLine(it.s), ...whyLines(it, words)));
}

/* ------------------------------- the sheet ------------------------------- */
// What was typed, the kind and the place picked (null: every place), how many cards are drawn and how far the list
// was scrolled: kept for the visit, in memory only.
const S = { q: '', kind: '', place: null, limit: STEP, top: 0 };
let UI = null; // the sheet while it is up: { input, out, scroll, close, again, going }

// The count of results is said aloud when it changes, once the typing pauses.
let said = '', sayTimer = 0;
function say(msg) {
  clearTimeout(sayTimer);
  if (!msg) { said = ''; return; }
  sayTimer = setTimeout(() => { if (msg !== said && UI) { said = msg; announce(msg); } }, 500);
}

// "6 shows at 3 places", "2 shows at The Church", "4 sessions"; with some at no place: "5 shows: 3 at The Church, 2
// with no place set". groups: the places of what is listed, each { key, name, n }.
function foundText(n, kind, groups) {
  const known = groups.filter(g => g.key), none = groups.find(g => !g.key);
  if (!known.length) return count(n, kind) + (none && S.place === '' ? ' with no place set' : '');
  const where = known.length === 1 ? known[0].name : plural(known.length, 'place');
  return none ? `${count(n, kind)}: ${n - none.n} at ${where}, ${none.n} with no place set` : `${count(n, kind)} at ${where}`;
}

// A chip that is pressed says so with a tick as well as its colour. kind: what a place chip counts, said after the
// number ("The Church, 4 shows"); a kind chip's own name says it ("Shows 9").
const chip = (on, attrs, label, n, kind) => h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), ...attrs },
  on && h('span', { class: 'srch-tick', 'aria-hidden': 'true' }, '✓'), h('span', { class: 'srch-chip-name' }, label),
  h('span', { class: 'srch-n' }, String(n), kind && h('span', { class: 'sr-only' }, ' ' + nouns(kind)[n === 1 ? 0 : 1])));

function draw() {
  if (!UI) return;
  const t0 = performance.now(), { out } = UI, q = clean(S.q), found = find(q);
  // A draw that follows a change to the data gives the focus back to the same card or chip, else to the box.
  const done = (...kids) => {
    const at = document.activeElement, key = at && at !== out && out.contains(at) ? focusKey(at) : null;
    out.replaceChildren(...kids.filter(Boolean));
    if (key !== null) ((key && out.querySelector(key)) || UI.input).focus({ preventScroll: true });
    STATS.drawMs = performance.now() - t0;
  };
  // Nothing typed: only the box and a line of help. A new search starts on shows, at every place.
  if (!found) { Object.assign(S, { kind: '', place: null, limit: STEP }); say(''); return done(h('p', { class: 'srch-help muted small', id: 'srch-help' }, helpText())); }
  const n = Object.fromEntries(KIND_ORDER.map(k => [k, 0]));
  for (const it of found) n[it.kind]++;
  if (!found.length) { say('No results'); return done(h('p', { class: 'srch-none' }, `Nothing found for “${q}”. Try fewer words, or part of a name.`)); }
  // The kind listed: the one picked, else shows. When that kind holds nothing and another does, the list moves to
  // one that does (shows first, then the kinds in the role's own order) and the line above it says so: "No shows
  // found." The kind row has the kinds that were found, and is left out when there is only one.
  const wanted = S.kind || 'show', kind = n[wanted] ? wanted : n.show ? 'show' : kindOrder().find(k => n[k]);
  const row = KIND_ORDER.filter(k => n[k]);
  const kinds = row.length > 1 && h('div', { class: 'chips srch-chips srch-kinds', role: 'group', 'aria-label': 'Kind' }, row.map(k =>
    chip(k === kind, { 'data-kind': k, onclick: () => pick({ kind: k, place: null }, `[data-kind="${k}"]`) }, [h('span', { 'aria-hidden': 'true' }, model.kindIcon(k) + ' '), kindName(k)], n[k], null)));
  const miss = kind !== wanted && `No ${nouns(wanted)[1]} found. `;
  const inKind = found.filter(it => it.kind === kind);
  // The places of that kind, the busiest first; what has no place last.
  const byKey = new Map();
  for (const it of inKind) { const g = byKey.get(it.place.key) || { key: it.place.key, name: it.place.name, n: 0 }; g.n++; byKey.set(g.key, g); }
  const groups = [...byKey.values()].sort((x, y) => Number(!x.key) - Number(!y.key) || y.n - x.n || x.name.localeCompare(y.name));
  if (S.place != null && !byKey.has(S.place)) S.place = null;
  const listed = S.place == null ? inKind : inKind.filter(it => it.place.key === S.place);
  // A second tap on the place that is pressed undoes it, as All does.
  const placeChip = (g, i) => chip(S.place === g.key, { 'data-place': String(i), title: g.name || null, onclick: () => pick({ place: S.place === g.key ? null : g.key }, `[data-place="${i}"]`) }, g.key ? g.name : 'No place set', g.n, kind);
  const places = groups.length > 1 && h('div', { class: 'chips srch-chips srch-places', role: 'group', 'aria-label': 'Place' },
    chip(S.place == null, { id: 'srch-place-all', onclick: () => pick({ place: null }, '#srch-place-all') }, 'All', inKind.length, kind),
    groups.slice(0, MAX_PLACES).map(placeChip),
    groups.length > MAX_PLACES && h('span', { class: 'srch-more-places muted small' }, `and ${plural(groups.length - MAX_PLACES, 'more place')}: type one to find it`));
  // One list, newest first: what is still ahead, a line for today, what is over. The line is left out when everything
  // listed is on one side of it.
  const today = todayISO(), ahead = listed.filter(it => isAhead(it, today)), over = listed.filter(it => !isAhead(it, today));
  const all = [...ahead, ...over], shown = all.slice(0, S.limit), left = all.length - shown.length, words = wordsOf(q), rows = [];
  shown.forEach((it, i) => {
    if (i === ahead.length && ahead.length) rows.push(h('li', { class: 'srch-today' }, h('span', null, 'Today · ' + fmtShort(today)), h('span', { class: 'sr-only' }, '. Above this: still to come. Below it: over.')));
    rows.push(h('li', null, it.type === 'b' ? showCard(it, words) : seenCard(it, words)));
  });
  say(plural(listed.length, 'result'));
  done(h('p', { class: 'srch-found' }, miss && h('span', { class: 'srch-miss' }, miss), foundText(listed.length, kind, S.place == null ? groups : groups.filter(g => g.key === S.place))), kinds, places,
    h('ul', { class: 'srch-list', 'aria-label': 'Results' }, rows),
    left > 0 && h('div', { class: 'actions srch-more' }, h('button', { type: 'button', class: 'btn ghost small', id: 'srch-more', onclick: more }, `Show ${Math.min(STEP, left)} more` + (left > STEP ? ` (${left} left)` : ''))));
}
// A chip pressed: the list is drawn again from the top, and the chip's twin keeps the focus.
function pick(patch, twin) {
  Object.assign(S, patch, { limit: STEP });
  draw();
  UI.scroll.scrollTop = 0;
  UI.out.querySelector(twin)?.focus({ preventScroll: true });
}
// Show more: the next cards join the list, and the first of them takes the focus.
function more() {
  const first = S.limit;
  S.limit += STEP;
  draw();
  UI.out.querySelectorAll('.srch-list .card')[first]?.focus();
}
const cards = () => [...UI.out.querySelectorAll('.srch-list .card')];
// A search typed over the last one (no word of one begins a word of the other) is a new search: it starts on shows, at
// every place. One narrowed or widened ("chelsea" to "chelsea echo") keeps the kind and the place picked.
const related = (was, now) => { const x = wordsOf(was), y = wordsOf(now); return x.some(a => y.some(b => a.startsWith(b) || b.startsWith(a))); };
// What finds a card, a chip or Show more again after a draw ('' for anything else).
const focusKey = el => { const d = el.dataset || {}, q = (k, v) => `[data-${k}="${CSS.escape(v)}"]`;
  return el.id ? '#' + CSS.escape(el.id) : d.seen ? q('seen', d.seen) : d.id ? '.srch-list ' + q('id', d.id) : d.kind ? q('kind', d.kind) : d.place ? q('place', d.place) : ''; };

// A tap on a card closes the search and opens what it shows: a booking's own page, or a time seen in the band's log
// (its card dropped open on the acts page, that entry in view, marked for a moment).
function openResult(card) {
  const { act, seen, id } = card.dataset;
  UI.going = true; // the focus goes to what opens, not back to the button
  S.top = UI.scroll.scrollTop; // where the list is now, even when the tap comes before its last scroll is reported
  UI.close();
  if (seen) openSeen(act, seen).then(row => { if (!row) return; row.classList.add('srch-hit'); setTimeout(() => row.classList.remove('srch-hit'), 2600); });
  else openBooking(id);
}

export function openSearch() {
  if (UI) { UI.input.focus(); return; }
  const w = actWord(), shows = showWords();
  // Typing over the whole of the last search (its words selected, as they are when the search opens again) is a new
  // search from the first key, even when that key begins one of the old words ("c" over "chelsea" on the way to "coldplay").
  let over = false;
  // The placeholder is short enough for a 320 px phone with extra-large text; the label and the help say the rest.
  const input = h('input', { class: 'search', id: 'srch-q', type: 'search', value: S.q, placeholder: `${capital(w)}, place or notes`, autocomplete: 'off', autocapitalize: 'off', enterkeyhint: 'search', 'aria-describedby': 'srch-help',
    onbeforeinput: () => { over = input.value !== '' && input.selectionStart === 0 && input.selectionEnd === input.value.length; },
    oninput: () => { if (over || !related(S.q, input.value)) Object.assign(S, { kind: '', place: null }); over = false; S.q = input.value; S.limit = STEP; draw(); UI.scroll.scrollTop = 0; },
    onkeydown: e => {
      if (e.key === 'Escape') e.preventDefault(); // the sheet closes; the box keeps its words for next time (a search box would empty itself)
      else if ((e.key === 'Enter' || e.key === 'ArrowDown') && cards().length) { e.preventDefault(); cards()[0].focus(); }
    } });
  input.setAttribute('spellcheck', 'false');
  const out = h('div', { class: 'srch-out',
    // ↓ ↑ walk the cards; ↑ from the first goes back to the box, ↓ from the last on to Show more.
    onkeydown: e => {
      const step = { ArrowDown: 1, ArrowUp: -1 }[e.key], at = step ? cards().indexOf(e.target.closest('.card')) : -1;
      if (at < 0) return;
      e.preventDefault();
      (cards()[at + step] || (step < 0 ? input : out.querySelector('#srch-more')))?.focus();
    } });
  // In the capture phase, so the click stops here: a booking's card has a tap of its own, for the calendar's page.
  out.addEventListener('click', e => { const card = e.target.closest('.srch-list .card'); if (!card) return; e.stopPropagation(); openResult(card); }, true);
  const body = h('div', { class: 'srch' },
    h('div', { class: 'srch-top' }, h('label', { class: 'sr-only', for: 'srch-q' }, `Search ${w}s, places, ${shows[1]} and notes`), input), out);
  const { el, close } = sheet(TITLE, body, { onClose: () => {
    const ui = UI; UI = null;
    clearTimeout(sayTimer); clearTimeout(ui.again); said = '';
    if (!ui.going) document.getElementById('searchBtn')?.focus({ preventScroll: true });
  } });
  el.classList.add('srch-sheet');
  const scroll = el.querySelector('.sheet-body');
  UI = { input, out, scroll, close, again: 0, going: false };
  draw();
  scroll.scrollTop = S.top; // back where the list was left
  scroll.addEventListener('scroll', () => { if (scroll.isConnected) S.top = scroll.scrollTop; }, { passive: true }); // not the 0 a closed sheet reports (after a tap on a card)
  input.focus({ preventScroll: true });
  if (S.q) input.select(); // typing starts a new search; the last one's results stay until then
}

// The top bar's button, and "/" from anywhere but a field, a sheet, a form or a tour.
export function initSearch(btn) {
  if (btn) btn.addEventListener('click', openSearch);
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if ((t && t.tagName && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) || document.querySelector('.sheet-back, .tour') || document.getElementById('app')?.inert) return;
    e.preventDefault();
    openSearch();
  });
}

sheetTutorial(TITLE, () => [
  { title: 'Search', text: `Type ${an(actWord())}, a place, a support act or a word from your notes. Results come as you type, and every word you type has to be found. On a keyboard, / opens the search from any page.`, target: ['#srch-q'] },
  { title: 'What was found', text: 'How many, and at how many places.', target: ['.srch-found'] },
  { title: 'Kinds', text: `${capital(showWords()[1])}, sessions and rehearsals each have a list of their own. It starts on ${showWords()[1]}.`, target: ['.srch-kinds'] },
  { title: 'Places', text: 'Tap a place to see only what was there. Tap it again, or All, to see everything.', target: ['.srch-places'] },
  { title: 'The cards', text: `Newest first, with a line for today between what is still to come and what is over. Tap a card to open it. A card marked From the log is a time you logged seeing ${an(actWord())} that has no ${showWords()[0]} on the calendar.`, target: ['.srch-list .card'] },
]);
