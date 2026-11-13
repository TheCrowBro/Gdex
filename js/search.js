// Search: a box at the top of every page, in every role, under the top bar and above the section menu (it tucks away
// with the menu when the page scrolls), and the "/" key that jumps into it. Typing in it opens the results over the page,
// in one of Gdex's sheets whose own box takes the words and the caret where they were, so the person types on. The
// results come in tabs: All (the best matches of every kind in one list), then each kind with its count: the bookings
// (shows, sessions, rehearsals, diary entries, and the times seen in a band's log that have no booking), the bands, the
// venues, the people, the songs, the setlists, the gear, the studio log and, for a role that sees money, the invoices
// and quotes. Every word typed must be found somewhere in a record, in any order, capitals and accents ignored; a date
// typed ("20 nov", "friday", "nov", "2025", "this week": js/search-dates.js) narrows what has dates to that day or
// span. A tap opens the record where it lives, as the section's own list would; the box keeps the words, and opening
// the results again brings them back on the same tab and scroll.
// The bookings tab is item 8's search: the calendar's own cards (js/bookings-cal.js bookingCard), newest first with a
// line for today, a row of kinds and a row of places. A time seen that belongs to a show on the calendar is not a second
// result: its score shows on that show's card. A band is found by every name it has had (item 7).
// Nothing about a search is stored on the device: what was typed, the tab, the kind and the place picked and how far the
// list was read live in memory (S), for the visit.
import { h, sheet, announce, todayISO, parseISO, fmtLong, fmtShort } from './util.js';
import { db, subscribe, lastDay, covers, byId, redraw, qtyOf } from './store.js';
import * as model from './model.js';
import { sectionName, actWord, kindOrder, moneyShown } from './roles.js';
import { sheetTutorial, setSearchStep } from './tour.js';
import { isoOk, actStyle, plural, capital, KIND_CHIP, dateRange, pill } from './bookings-kit.js';
import { bookingCard } from './bookings-cal.js';
import { isAct } from './blocks/running.js';
import { openBooking } from './pages/bookings.js';
import { openSeen, openActCard, actSearchText } from './pages/acts.js'; // already loaded with the app: the bookings page imports it
import { venueText, venueMatches, openVenue } from './pages/venues.js'; // so are venues, people, backline and setlists
import { personText, openPerson } from './pages/people.js';
import { gearText, openGear } from './pages/backline.js';
import { setlistWords, openSetlist } from './setlist.js';
import { docOf, docTotals } from './money.js'; // loaded with the app too: a booking's Quote & invoice box imports it
import { statusPill } from './blocks/money.js';
import { venueChip } from './venues-rules.js';
import { readDate } from './search-dates.js';

const TITLE = 'Search';
const STEP = 30;        // results drawn at first in a tab, and added by each Show more
const ALL_MAX = 8;      // rows on All: about a screenful
const MAX_PLACES = 24;  // place chips drawn; a place past that is reached by typing it
const KIND_ORDER = model.KINDS.map(k => k[0]); // show, session, rehearsal, other

/* ------------------------------- the kinds of record ------------------------------- */
// Every kind the search finds, in the order of its tabs. Bookings, take logs and money have dates: a date typed finds
// them by it. The other kinds have none: a date typed with other words is left out for them, and a date typed alone is
// looked for as words ("may" finds May Smith in People while it finds the bookings in May).
export const SEARCH_KINDS = ['gigs', 'bands', 'venues', 'people', 'songs', 'setlists', 'gear', 'logs', 'money'];
const DATED = new Set(['gigs', 'logs', 'money']);
// The kinds the person may see, and so the tabs: the one place that decides it. Today Money only where money is shown
// (js/roles.js moneyShown); the licence for the working roles will narrow it here too.
export const searchKinds = () => SEARCH_KINDS.filter(k => k !== 'money' || moneyShown());

// Two kinds live in files the app loads only when their section is opened: they are fetched the first time the box
// takes the focus (or a search runs), and searched from then on.
const LAZY = { songs: () => import('./pages/songs.js'), logs: () => import('./pages/sessions.js') };
const MOD = {};
let loading = null;
export function searchReady() {
  return loading || (loading = Promise.all(Object.entries(LAZY).map(([k, load]) => load().then(m => { MOD[k] = m; })))
    .then(() => { INDEX = null; if (UI) draw(); }, e => { loading = null; console.error(e); }));
}

/* ------------------------------- words, in the role's own ------------------------------- */
// What the role calls a show: "gig" where its calendar is called Gigs (js/roles.js names), else "show".
const showWords = () => (/^gigs$/i.test(sectionName('bookings', '')) ? ['gig', 'gigs'] : ['show', 'shows']);
const NOUNS = { session: ['session', 'sessions'], rehearsal: ['rehearsal', 'rehearsals'], other: ['diary entry', 'diary entries'] };
const nouns = kind => (kind === 'show' ? showWords() : NOUNS[kind] || NOUNS.other);
const count = (n, kind) => plural(n, ...nouns(kind)); // "6 shows", "1 session"
const kindName = kind => (kind === 'show' ? capital(showWords()[1]) : KIND_CHIP[kind] || KIND_CHIP.other); // on the kind row
const ONE = { show: () => capital(showWords()[0]), session: () => 'Session', rehearsal: () => 'Rehearsal', other: () => 'Diary entry' };
const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
// A tab's name: the role's name for the calendar (Bookings, Shows, Gigs) and its word for an act (Acts, Artists, Bands).
const tabName = k => ({ all: 'All', gigs: sectionName('bookings', 'Bookings'), bands: capital(actWord()) + 's', venues: 'Venues', people: 'People', songs: 'Songs',
  setlists: 'Setlists', gear: 'Gear', logs: sectionName('sessions', 'Studio log'), money: sectionName('money', 'Money') })[k] || k;
// One and many of a kind, for the count line of its tab and the small word on a row in All.
const UNIT = { bands: () => [actWord(), actWord() + 's'], venues: () => ['venue', 'venues'], people: () => ['person', 'people'], songs: () => ['song', 'songs'],
  setlists: () => ['setlist', 'setlists'], gear: () => ['item', 'items'], logs: () => ['take log', 'take logs'] };
// What can be searched, in the role's words: for the line of help, the placeholder and the box's name.
const whatList = () => searchKinds().map(k => ({ gigs: tabName('gigs').toLowerCase(), bands: actWord() + 's', venues: 'venues', people: 'people', songs: 'songs',
  setlists: 'setlists', gear: 'gear', logs: 'take logs', money: 'invoices' })[k]);
const andList = list => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
const DATE_HELP = '“20 nov”, “friday”, “nov”, “2025” or “this week”';
const helpText = () => `Find ${andList(whatList())} by any word in them, or by a date: ${DATE_HELP}.`;
const labelText = () => `Search ${whatList().slice(0, 3).join(', ')} and more`;
// The placeholder names the first three kinds ("Search gigs, bands, venues…"), or as many as the box has room for
// (two, else one) on a narrow phone with large text, so it is never cut short. Each is tried as the box's value for a
// moment: the box itself says whether it fits (a search box keeps room for its clear button even when it is empty).
function placeholder(input) {
  const list = [3, 2, 1].map(n => `Search ${whatList().slice(0, n).join(', ')}…`);
  if (!input || !input.isConnected || !input.clientWidth) return list[0];
  const { value } = input, sel = [input.selectionStart, input.selectionEnd], focused = document.activeElement === input;
  const fit = list.find(t => { input.value = t; return input.scrollWidth <= input.clientWidth; }) || list[2];
  input.value = value;
  if (focused) try { input.setSelectionRange(sel[0], sel[1]); } catch { /* not a text box */ }
  return fit;
}

/* ------------------------------- words as the search compares them ------------------------------- */
// Every name an act is known by: the one it has now, then the ones it had before, the latest first (item 7's earlier
// names, read through model.earlierNames, which cleans whatever is stored). This is the one place the search reads a
// band's names, so a band is found by any name it has had, on its bookings and in its log alike.
export const actNames = a => (a && typeof a === 'object' ? [a.name, ...model.earlierNames(a).map(n => n.name).reverse()] : [])
  .map(n => clean(n)).filter((n, i, all) => n && all.indexOf(n) === i);

// Words as the search compares them: no capitals, no accents (Motörhead is found by "motorhead"), the letters that
// have no accent to drop written out (ø, ß, æ…), and curly quotes straight.
const LETTERS = { ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe', đ: 'd', ð: 'd', ł: 'l', þ: 'th', ı: 'i' };
export const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[øßæœđðłþı]/g, c => LETTERS[c]).replace(/[‘’ʼ`´]/g, "'").replace(/[“”]/g, '"');
// The words typed, each without the punctuation around it ("Wolfe," is wolfe; "AC/DC" and "Guns N' Roses" keep theirs).
const wordsOf = q => fold(q).split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// The other acts on a show's bill: the slots of its running order that are acts, ours left out (the band is searched
// by its own names). js/blocks/running.js isAct tells an act from a marker (Doors, Changeover, Curfew…) by its name
// once the slot has a length, so a support act typed without one yet is asked about as if it had.
const billOf = b => (Array.isArray(b.runningOrder) ? b.runningOrder : [])
  .filter(r => r && typeof r === 'object' && !r.ours && clean(r.act) && isAct({ ...r, length: 1 })).map(r => clean(r.act));
// A slot on a bill is an act when it is one of the act's names, give or take capitals, spaces and punctuation
// (model.sameName), also with a note in brackets after it ("Chelsea Wolfe (support)").
const onBill = (slot, names) => { const bare = slot.replace(/\s*[([{][^()[\]{}]*[)\]}]$/, '');
  return names.some(n => model.sameName(slot, n) || (!!bare && bare !== slot && model.sameName(bare, n))); };

/* ------------------------------- the bookings ------------------------------- */
// Built once per change of the data, not once per key press: INDEX is dropped when the store says something changed
// and built again by the next search. A booking or time seen: { rec: 'gigs', type: 'b' (a booking) | 's' (a time seen
// with no booking on the calendar), id, kind, date, last, place: { key, name }, text (everything searched, folded),
// front (the words its card prints: the band, the name it had that night, the place, the title), earlier (the band's
// other names, which its card does not print), names (what ranks it on All), bill, notes, spans } and b + a + seen (the
// act's time seen for that booking, or null) + guests (the times seen of support acts that belong to it: [{ a, s }]),
// or a + s.
let INDEX = null;
const STATS = { builds: 0, buildMs: 0, findMs: 0, drawMs: 0 };
function buildGigs() {
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
  const shows = new Map(), hosts = new Map(); // an act's live shows; the live bookings at a place with other acts on their bill
  const add = (map, key, x) => { const list = map.get(key); if (list) list.push(x); else map.set(key, [x]); };
  for (const b of db.bookings || []) {
    if (!b || !isoOk(b.date)) continue; // a booking with no date is not on the calendar
    const a = acts.get(b.actId) || null;
    const seen = a ? model.seenEntryFor(a, b) : null; // the act's time seen that belongs to this booking
    if (seen) claimed.add(seen);
    const place = placeOf(b.venueId, b.venueName || String(b.address || '').split('\n')[0]);
    const it = { rec: 'gigs', type: 'b', id: b.id, kind: KIND_ORDER.includes(b.kind) ? b.kind : 'other', date: b.date, last: lastDay(b), b, a, seen, place, bill: billOf(b), guests: [] };
    items.push(it);
    if (b.status === 'cancelled') continue;
    if (a && b.kind === 'show') add(shows, a.id, b);
    if (it.bill.length && place.key) add(hosts, place.key, it);
  }
  // A time seen with no show of its own act on the calendar that day belongs to another act's show when that show, on
  // its date and at its place (the same venue, or the same place typed), has the act on its bill: a band seen as a
  // support act is one card for the night, the headliner's, which carries its score. With two such shows, the one
  // that starts first. A cancelled show never happened, so it takes none.
  const hostOf = (a, s, place) => {
    if (!place.key || (shows.get(a.id) || []).some(b => covers(b, s.date))) return null;
    const names = actNames(a), there = (hosts.get(place.key) || []).filter(it => it.b.actId !== a.id && covers(it.b, s.date) && it.bill.some(slot => onBill(slot, names)));
    return there.sort((x, y) => model.byPlay(x.b, y.b))[0] || null;
  };
  for (const a of acts.values()) {
    for (const s of model.seenOf(a)) {
      if (claimed.has(s) || !isoOk(s.date)) continue; // on a show's card already
      const place = placeOf(s.venueId, s.where), host = hostOf(a, s, place);
      if (host) host.guests.push({ a, s });
      else items.push({ rec: 'gigs', type: 's', id: s.id, kind: 'show', date: s.date, last: s.date, a, s, place, bill: [], guests: [] });
    }
  }
  for (const it of items) describe(it);
  // Newest first; on one day the bookings in the order the bands play, then the times seen (the store's sort is stable,
  // so those stay as model.seenOf gave them: the one saved last first).
  items.sort((x, y) => y.date.localeCompare(x.date) || (x.type === 'b' && y.type === 'b' ? model.byPlay(x.b, y.b) : (x.type === 'b' ? 0 : 1) - (y.type === 'b' ? 0 : 1)));
  return items;
}
// The words of a booking or a time seen: what its card prints (front) and everything searched (text), both folded, its
// notes, and the band's other names (earlier). A card names the band as it is called now, and the name it had that
// night when that was another one ("formerly …", item 7); a support act's score line names it the same way.
function describe(it) {
  const nowOf = a => clean(a && a.name), wasOn = (a, iso) => (a ? model.formerlyOn(a, iso) : '');
  const others = (a, shown) => actNames(a).filter(n => !shown.some(x => model.sameName(x, n)));
  const guests = it.guests.map(({ a, s }) => { const now = nowOf(a), was = wasOn(a, s.date); return { a, s, shown: [now, was].filter(Boolean) }; });
  const guestFront = guests.flatMap(g => g.shown), guestEarlier = guests.flatMap(g => others(g.a, g.shown));
  const guestRest = guests.flatMap(g => [g.a.genre, !g.s.venueId && g.s.where]), guestNotes = guests.map(g => clean(g.s.notes));
  let front, rest, own;
  if (it.type === 'b') {
    const { b, a, seen, place } = it, shown = [nowOf(a), a ? model.formerlyOf(b) : ''].filter(Boolean);
    it.earlier = [...(a ? others(a, shown) : []), ...guestEarlier];
    it.notes = [b.notes, seen && seen.notes, ...guestNotes].map(clean).filter(Boolean);
    front = [...shown, b.client, place.name, b.title, ...guestFront];
    rest = [a && a.genre, place.v && place.v.address, b.venueName, b.address, seen && !seen.venueId && seen.where, ...it.bill, ...guestRest];
    own = [...shown, ...(a ? others(a, shown) : []), b.title, b.client];
  } else {
    const { a, s, place } = it, shown = [nowOf(a), wasOn(a, s.date)].filter(Boolean);
    it.earlier = others(a, shown);
    it.notes = [clean(s.notes)].filter(Boolean);
    front = [...shown, place.name];
    rest = [a.genre, place.v && place.v.address, s.where];
    own = [...shown, ...it.earlier];
  }
  it.front = fold(front.filter(Boolean).join('\n'));
  it.text = fold([...front, ...it.earlier, ...rest, ...it.notes].filter(Boolean).join('\n'));
  it.names = own.filter(Boolean).map(fold);
  it.called = new Set(wordsOf([...front, ...it.earlier].filter(Boolean).join(' '))); // the words of its names and its place
  it.spans = [[it.date, it.last]];
}

/* ------------------------------- every other kind ------------------------------- */
// A record of any other kind: { rec, id, x (the record), title, names (what ranks it on All, folded), text (everything
// searched, folded: the words the section's own search reads, from the function it exports), fields (labelled words
// that say why a row was found when its own words do not show it), spans (its days, for a date typed), called (the words
// of its names) }.
const record = (rec, x, title, names, text, fields = [], spans = null) => ({ rec, id: x.id, x, title: clean(title), names: names.map(n => fold(clean(n))).filter(Boolean), text: fold(text), fields: fields.filter(f => clean(f[1])), spans,
  called: new Set(wordsOf(names.filter(Boolean).join(' '))) });
const someOf = list => (Array.isArray(list) ? list : []);
function buildOthers() {
  const out = {};
  const membersOf = new Map();
  for (const a of db.acts || []) for (const id of someOf(a && a.members)) { const list = membersOf.get(id) || []; list.push(a); membersOf.set(id, list); }
  const earlier = a => model.earlierNames(a).map(n => n.name).reverse().join(', ');
  out.bands = someOf(db.acts).filter(a => a && a.id).map(a => record('bands', a, a.name || 'Unnamed act', actNames(a), actSearchText(a),
    [['Earlier name', earlier(a)], ['Members', someOf(a.members).map(id => byId('people', id)).filter(Boolean).map(p => p.name).join(', ')], ['Notes', a.notes]]));
  out.venues = someOf(db.venues).filter(v => v && v.id).map(v => record('venues', v, v.name || 'Unnamed place', [v.name], venueText(v),
    [['Address', v.address], ['Contact', v.contact], ['Stage', v.stage], ['PA & desk', v.pa], ['Backline provided', v.backline], ['Notes', v.notes], ['House rules', model.rulesOf(v).note]]));
  out.people = someOf(db.people).filter(p => p && p.id).map(p => record('people', p, p.name || 'No name', [p.name], personText(p),
    [[capital(actWord()) + 's', (membersOf.get(p.id) || []).map(a => a.name).join(', ')], ['Earlier name', (membersOf.get(p.id) || []).map(earlier).filter(Boolean).join(', ')], ['Email', p.email], ['Phone', p.phone], ['Notes', p.notes]]));
  out.setlists = someOf(db.setlists).filter(l => l && l.id).map(l => { const w = setlistWords(l);
    return record('setlists', l, l.name || 'Untitled setlist', [l.name], w.join('\n'), [['Songs', someOf(l.items).filter(it => it && !it.isBreak).map(model.itemTitle).join(', ')], ['Earlier name', earlier(byId('acts', l.actId))], ['Notes', l.notes]]); });
  out.gear = someOf(db.gear).filter(g => g && g.id).map(g => { const owner = g.owner && byId('people', g.owner);
    return record('gear', g, g.name || 'Unnamed item', [g.name], gearText(g), [['Serial', g.serial], ['Where it is', g.location], ['Owner', owner && owner.name], ['Notes', g.notes]]); });
  if (MOD.songs) out.songs = someOf(db.songs).filter(s => s && s.id).map(s => record('songs', s, s.title || 'Untitled', [s.title], MOD.songs.songText(s),
    [['Writers', someOf(s.splits).filter(Boolean).map(p => p.name).join(', ')], ['Tuning', s.tuning], ['ISRC', s.isrc], ['Earlier name', earlier(byId('acts', s.actId))], ['Notes', s.notes]]));
  if (MOD.logs) out.logs = someOf(db.logs).filter(l => l && l.id).map(l => { const d = MOD.logs.logDate(l), b = l.bookingId && byId('bookings', l.bookingId);
    return record('logs', l, l.title || 'Take log', [l.title], MOD.logs.logWords(l).join('\n'),
      [['Session', b && model.bookingTitle(b)], ['Notes', l.notes], ['Take notes', someOf(l.takes).filter(Boolean).map(t => clean(t.text)).filter(Boolean).join(' · ')]], [[d, d]]); });
  // Quotes and invoices, by their number, the client, the act, the booking, the amount and the status as the booking's
  // Quote & invoice box says it (Draft, Sent, Part paid, Paid, Overdue…).
  const KINDS_MONEY = { quote: 'Quote', invoice: 'Invoice' };
  out.money = [];
  for (const b of someOf(db.bookings)) {
    if (!b || !b.id) continue;
    for (const kind of ['invoice', 'quote']) {
      const doc = docOf(b, kind);
      if (!doc) continue;
      const t = docTotals(doc), client = clean((b.contact && b.contact.name) || b.client || model.actName(b.actId)), state = statusPill(b, kind, doc).textContent;
      const amounts = [t.total, t.due].filter(n => Number.isFinite(n) && n > 0).flatMap(n => [String(n), n.toFixed(2), model.fmtMoney(n)]);
      const issued = isoOk(doc.issued) ? doc.issued : isoOk(b.date) ? b.date : '', spans = [issued, isoOk(doc.due) ? doc.due : ''].filter(Boolean).map(d => [d, d]);
      out.money.push({ ...record('money', { id: kind + ':' + b.id }, `${KINDS_MONEY[kind]} ${clean(doc.number)}`, [doc.number, client, KINDS_MONEY[kind]],
        [KINDS_MONEY[kind], doc.number, state, kind === 'invoice' && doc.status === 'sent' && t.due > 0 ? 'unpaid' : '', client, ...actNames(byId('acts', b.actId)), model.bookingTitle(b), ...amounts].join('\n'),
        [['Client', client], ['Booking', model.bookingTitle(b)]], spans), b, doc, kind, total: t.total, issued });
    }
  }
  return out;
}
function buildIndex() {
  const t0 = performance.now();
  const idx = { gigs: buildGigs(), ...buildOthers() };
  STATS.builds++; STATS.buildMs = performance.now() - t0;
  return idx;
}
subscribe(() => { INDEX = null; if (UI) { clearTimeout(UI.again); UI.again = setTimeout(draw, 0); } });

/* ------------------------------- finding ------------------------------- */
// A record has the words typed when its words hold every one. A venue also has them when its ticked house rules say
// them, read as Venues' own search reads a rule (js/pages/venues.js venueMatches): what was typed as one phrase ("phones
// allowed", "no pro cameras", "21+"), or the words its own words do not hold, with any "no", "not" or "allowed" typed,
// read together in the order typed ("church no phones"). A word of one rule and a word of another never make a rule it
// does not have: "pro cameras allowed" does not find a venue that allows phones but not pro cameras.
const SAYS = new Set(['no', 'not', 'allowed']); // what a rule says of its subject, even where the venue's own words hold it
const has = (r, words) => {
  const loose = words.filter(w => !r.text.includes(w));
  if (!loose.length) return true;
  if (r.rec !== 'venues') return false;
  return venueMatches(r.x, words.join(' ')) || venueMatches(r.x, words.filter(w => SAYS.has(w) || loose.includes(w)).join(' '));
};
const inSpan = (r, d) => !!r.spans && r.spans.some(([from, to]) => !!from && from <= d.to && (to || from) >= d.from);
// What was typed, read: its words, the date in it (js/search-dates.js) and the words left, and what each kind the
// person may see holds for them; null when nothing was typed. A kind with dates needs every word left and the date, or
// the date's own words as words of its name (its band by any name, its title, its client, its place): "April Wine",
// "Sun Ra", "The 1975" and "The Saturday Club" find their bookings on every day, as they would with no date read. Any
// other kind needs every word left, or with only a date typed, its words.
function find(q) {
  const words = wordsOf(q);
  if (!words.length) return null;
  if (!loading) searchReady();
  const t0 = performance.now();
  const { date, rest } = readDate(words, new Date());
  const idx = INDEX || (INDEX = buildIndex()), found = {};
  const named = r => !!date && !!r.called && date.words.every(w => r.called.has(w));
  for (const k of searchKinds()) {
    const list = idx[k] || [];
    if (DATED.has(k)) found[k] = list.filter(r => has(r, rest) && (!date || inSpan(r, date) || named(r)));
    else { const need = rest.length ? rest : words; found[k] = list.filter(r => has(r, need)); }
  }
  STATS.findMs = performance.now() - t0;
  return { q, words, rest, date, found };
}
// For checks and measurements: what the bookings tab finds, without drawing it (as item 8 built it); what every tab
// finds (ids, in each tab's own order); and how long the last index, search and draw took. Call searchReady() first for
// the songs and the studio log.
export const searchFor = q => { const F = find(q); return (F ? F.found.gigs : []).map(it => ({ type: it.type, id: it.id, kind: it.kind, date: it.date, place: it.place.name, guests: it.guests.map(g => g.s.id) })); };
export const searchAll = q => { const F = find(q); return F ? Object.fromEntries(Object.entries(F.found).map(([k, list]) => [k, list.map(r => r.id)])) : {}; };
export const searchStats = () => ({ ...STATS, records: INDEX ? Object.values(INDEX).reduce((t, l) => t + l.length, 0) : 0 });

// Still ahead, or over. A booking stays ahead until its last day ends, and in the small hours last night's show still to
// play (model.tonightShows) is ahead too, as Coming up keeps it, marked "Tonight"; a time seen is over from the day it
// is dated.
const isAhead = (it, today, tonight) => (it.type === 'b' ? it.last >= today || tonight.has(it.b) : it.date > today);

// All: one list, best match first. A record whose name starts with what was typed, then one with a word of its name
// starting each word typed, then one whose name holds them (what was typed: every word, or with a date read, the words
// left beside it, whichever ranks it higher, so "may" puts May Okafor first), then one on the date typed, then the
// rest; within each, bands, venues, people, songs, setlists and gear (by name), then bookings still to come (soonest
// first), then those that are over, take logs and money (newest first).
const GROUP = { bands: 0, venues: 1, people: 2, songs: 3, setlists: 4, gear: 5, ahead: 6, over: 7, logs: 8, money: 9 };
const startsWord = (name, w) => name.startsWith(w) || name.includes(' ' + w);
const OTHER = 4; // no word typed in its name, and not on the date typed
function nameTier(r, words) {
  if (!words.length) return OTHER;
  const typed = words.join(' ');
  return r.names.some(n => n.startsWith(typed)) ? 0 : r.names.some(n => words.every(w => startsWord(n, w))) ? 1 : r.names.some(n => words.every(w => n.includes(w))) ? 2 : OTHER;
}
const tierOf = (r, F) => Math.min(nameTier(r, F.rest), F.date ? nameTier(r, F.words) : OTHER, F.date && inSpan(r, F.date) ? 3 : OTHER);
function ranked(F) {
  const today = todayISO(), tonight = new Set(model.tonightShows()), list = [];
  for (const [k, recs] of Object.entries(F.found)) for (const r of recs) {
    const group = k === 'gigs' ? (isAhead(r, today, tonight) ? GROUP.ahead : GROUP.over) : GROUP[k];
    const when = k === 'gigs' ? r.date : k === 'logs' || k === 'money' ? (r.spans && r.spans[0] ? r.spans[0][0] : '') : '';
    list.push({ r, tier: tierOf(r, F), group, when, name: r.title || '' });
  }
  return list.sort((x, y) => x.tier - y.tier || x.group - y.group
    || (x.group === GROUP.ahead ? x.when.localeCompare(y.when) : y.when.localeCompare(x.when))
    || x.name.localeCompare(y.name, undefined, { sensitivity: 'base', numeric: true })).map(x => x.r);
}

/* ------------------------------- the bookings' cards ------------------------------- */
// The date square of a card says no year: a result from another year adds it.
const yearOf = iso => (iso.slice(0, 4) === String(new Date().getFullYear()) ? null : h('span', { class: 'srch-year' }, iso.slice(0, 4)));
// "★ Scored 86/100", as a show's own page says it.
const scoreLine = s => { const r = model.ratingOf(s); return h('span', { class: 'srch-score' }, h('span', { 'aria-hidden': 'true' }, '★ '), r != null ? ['Scored ', h('b', null, String(r)), '/100'] : 'Seen, no score yet'); };
// A support act's score on the headliner's card names the act: "★ Chelsea Wolfe 88/100", and from before it changed
// its name "★ Owl Parliament (formerly The Night Owls) 88/100".
const guestLine = ({ a, s }) => { const r = model.ratingOf(s), was = model.formerlyOn(a, s.date), who = (clean(a.name) || 'Unnamed act') + (was ? ` (formerly ${was})` : '');
  return h('span', { class: 'srch-score srch-guest' }, h('span', { 'aria-hidden': 'true' }, '★ '), r != null ? [who + ' ', h('b', null, String(r)), '/100'] : who + ': seen, no score yet'); };
// A piece of a note around the word found in it.
function excerpt(note, at) {
  let from = Math.max(0, at - 32), to = Math.min(note.length, at + 64);
  if (from > 0) { const sp = note.indexOf(' ', from); if (sp >= 0 && sp < at) from = sp + 1; }
  if (to < note.length) { const sp = note.lastIndexOf(' ', to); if (sp > at) to = sp; }
  return (from > 0 ? '…' : '') + note.slice(from, to) + (to < note.length ? '…' : '');
}
// Why a card is here when its own words do not show it: a word typed that is not in the band, the place or the title
// was found on the bill, or else in an earlier name of the band's that the card does not print (it was called
// something else before, or after, that night), or else in the notes. (A word found only in a genre or an address adds
// no line.)
function whyLines(it, words) {
  const hidden = words.filter(w => !it.front.includes(w)), out = [];
  if (!hidden.length) return out;
  const bill = it.bill.filter(name => hidden.some(w => fold(name).includes(w)));
  if (bill.length) out.push(h('span', { class: 'srch-why' }, 'Also on the bill: ' + bill.join(', ')));
  let left = hidden.filter(w => !bill.some(name => fold(name).includes(w)));
  // As few earlier names as say it: the one holding the most of the words left first ("night owls" is The Night
  // Owls, not The Night Owls and The Owls), then the next, while a word is still unexplained.
  const was = [];
  for (;;) {
    const best = it.earlier.map(name => [name, left.filter(w => fold(name).includes(w)).length]).filter(x => x[1] && !was.includes(x[0])).sort((x, y) => y[1] - x[1])[0];
    if (!best) break;
    was.push(best[0]); left = left.filter(w => !fold(best[0]).includes(w));
  }
  if (was.length) out.push(h('span', { class: 'srch-why' }, (was.length === 1 ? 'Earlier name: ' : 'Earlier names: ') + was.join(', ')));
  for (const note of it.notes) {
    const low = fold(note), w = left.find(x => low.includes(x));
    if (w) { out.push(h('span', { class: 'srch-why' }, 'Notes: ' + excerpt(note, low.indexOf(w)))); break; }
  }
  return out;
}
// A booking with a title of its own ("Halloween Special") has a card that does not name its band: a line does
// ("Band: The Night Owls"), so a card found by the band says whose show it is. From before the band changed its name
// the calendar's own card already says it, with the name it had that night ("Owl Parliament, formerly The Night
// Owls", model.formerlyNote), so the line is not added again.
const whoLine = b => { const who = clean(model.actName(b.actId) || b.client);
  if (!who || fold(model.bookingTitle(b)).includes(fold(who))) return null;
  const note = model.formerlyNote(b); if (note && !note.startsWith('formerly ')) return null; // it begins with the band's name
  return h('span', { class: 'srch-why srch-who' }, `${capital(actWord())}: ${who}`); };
// A booking: the calendar's own card, with the year when it is not this one, its band when the title hides it, the
// score when the act's log has the show, the score of each support act logged there, and why it was found.
function showCard(it, words) {
  const card = bookingCard(it.b), main = card.querySelector('.bk-card-main'), year = yearOf(it.date);
  card.dataset.rec = 'gigs';
  if (year) card.querySelector('.bk-date')?.append(year);
  if (main) main.append(...[whoLine(it.b), it.seen && scoreLine(it.seen), ...it.guests.map(guestLine), ...whyLines(it, words)].filter(Boolean));
  return card;
}
// A time seen with no booking on the calendar: a plainer card with the date, the band, the place, the score, and
// words that say it is from the log. It borrows the calendar card's layout (css/bookings.css), not its content. From
// before the band changed its name, the line under its name says the name it had that night, as a booking's does
// ("formerly The Night Owls", .bk-formerly).
function seenCard(it, words) {
  const d = parseISO(it.date), name = clean(it.a.name) || 'Unnamed act', was = model.formerlyOn(it.a, it.date);
  return h('button', { type: 'button', class: 'card tap bk-card srch-seen', style: actStyle({ actId: it.a.id }), 'data-rec': 'gigs', 'data-act': it.a.id, 'data-seen': it.s.id },
    h('span', { class: 'bk-date', 'aria-hidden': 'true' },
      h('span', null, d.toLocaleDateString(undefined, { weekday: 'short' })), h('b', null, d.getDate()), h('span', null, d.toLocaleDateString(undefined, { month: 'short' })), yearOf(it.date)),
    h('span', { class: 'sr-only' }, fmtLong(it.date) + '. '),
    h('span', { class: 'bk-card-main' },
      h('span', { class: 'bk-card-top' }, h('strong', { class: 'bk-card-title' }, [name, it.place.name].filter(Boolean).join(' @ ')), h('span', { class: 'pill srch-log' }, 'From the log')),
      was && h('span', { class: 'bk-formerly' }, 'formerly ' + was),
      scoreLine(it.s), ...whyLines(it, words)));
}

/* ------------------------------- a row of any kind ------------------------------- */
// The day or days a row is dated, with the year when it is not this one.
const dayText = iso => (isoOk(iso) ? fmtShort(iso) + (iso.slice(0, 4) === String(new Date().getFullYear()) ? '' : ', ' + iso.slice(0, 4)) : '');
// Why a row is here when the words it prints do not show it: the first labelled field that holds a word typed.
function whyRow(r, words, shown) {
  const hidden = words.filter(w => !shown.includes(w));
  for (const [label, value] of r.fields) {
    const text = clean(value), low = fold(text), w = hidden.find(x => low.includes(x));
    if (w) return h('span', { class: 'srch-why' }, `${label}: ${excerpt(text, low.indexOf(w))}`);
  }
  return null;
}
// What each kind prints on its row: { title, sub: [parts], more: [nodes], style }. No money on any of them, but the
// Money tab's own amounts.
const ROW = {
  gigs: it => {
    if (it.type === 's') {
      const r = model.ratingOf(it.s), was = model.formerlyOn(it.a, it.date);
      return { word: ONE.show(), title: [clean(it.a.name) || 'Unnamed act', it.place.name].filter(Boolean).join(' @ '), sub: [dayText(it.date), 'From the log', r != null ? `★ ${r}/100` : ''], more: [was && h('span', { class: 'srch-was' }, 'formerly ' + was)], style: actStyle({ actId: it.a.id }) };
    }
    const b = it.b, note = model.formerlyNote(b), went = b.kind === 'show' && b.status !== 'cancelled' && model.seenAnswer(b) === 'no';
    return { word: (ONE[it.kind] || ONE.other)(), title: model.bookingTitle(b), sub: [dateRange(b, dayText), model.statusLabel(b.status), went && 'Didn’t go'], more: [note && h('span', { class: 'srch-was' }, note)], style: actStyle(b) };
  },
  bands: r => { const a = r.x, st = model.seenStats(a), n = someOf(a.members).length, was = model.formerName(a);
    return { title: r.title, sub: [a.genre, n ? plural(n, 'member') : '', st.times ? `Seen ${plural(st.times, 'time')}` : ''], more: [was && h('span', { class: 'srch-was' }, 'formerly ' + was)], style: actStyle({ actId: a.id }) }; },
  venues: r => { const v = r.x; return { title: r.title, sub: [model.venueKindLabel(v.kind || 'venue'), clean(String(v.address || '').split(/\r?\n/)[0])], more: [venueChip(v)] }; },
  people: r => { const p = r.x; return { title: r.title, sub: [p.role, p.instrument && p.instrument !== p.role ? p.instrument : '', p.company] }; },
  songs: r => { const s = r.x; return { title: r.title, sub: [model.actName(s.actId), s.key, model.songStatusLabel(s.status)], style: actStyle({ actId: s.actId }) }; },
  setlists: r => { const l = r.x, t = model.setlistLength(l); return { title: r.title, sub: [model.actName(l.actId) || 'No act', plural(t.songs, 'song'), t.sec ? model.fmtDur(t.sec) : ''], style: actStyle({ actId: l.actId }) }; },
  gear: r => { const g = r.x, n = qtyOf(g), owner = g.owner && byId('people', g.owner);
    return { title: r.title + (n > 1 ? ` ×${n}` : ''), sub: [[g.make, g.model].map(clean).filter(Boolean).join(' '), g.location && `📍 ${clean(g.location)}`, owner ? owner.name : ''] }; },
  logs: r => { const l = r.x, b = l.bookingId && byId('bookings', l.bookingId), d = r.spans[0][0], songs = [...new Set(someOf(l.takes).filter(Boolean).map(t => t.songId).filter(Boolean))].map(id => (byId('songs', id) || {}).title).filter(Boolean);
    return { title: r.title, sub: [dayText(d), songs.slice(0, 3).join(', ') + (songs.length > 3 ? ` +${songs.length - 3}` : ''), b && model.bookingTitle(b)] }; },
  money: (r, tab) => ({ title: r.title, sub: [clean((r.b.contact && r.b.contact.name) || r.b.client || model.actName(r.b.actId)), model.bookingTitle(r.b), dayText(r.issued)],
    more: [h('span', { class: 'srch-money' }, tab === 'money' && h('b', { class: 'srch-amt' }, model.fmtMoney(r.total)), statusPill(r.b, r.kind, r.doc))],
    style: actStyle(r.b) }),
};
// A row: the small word for its kind on All, the name, a line of what it is, anything its kind adds, and why it was
// found. It opens the record where it lives.
function rowOf(r, words, tab) {
  const d = ROW[r.rec](r, tab), sub = d.sub.filter(Boolean).join(' · ');
  const word = tab === 'all' ? d.word || ({ gear: 'Gear', money: 'Money' })[r.rec] || capital(UNIT[r.rec]()[0]) : '';
  const shown = fold([d.title, sub].join('\n'));
  const why = r.rec === 'gigs' ? whyLines(r, words) : [whyRow(r, words, shown)];
  const seen = r.rec === 'gigs' && r.type === 's';
  return h('button', { type: 'button', class: 'card tap srch-rec srch-rec-' + r.rec, style: d.style || null, 'data-rec': r.rec, 'data-id': seen ? r.s.id : r.id, 'data-act': seen ? r.a.id : null, 'data-seen': seen ? r.s.id : null },
    h('span', { class: 'srch-rec-top' }, word && h('span', { class: 'srch-kind' }, word + ' '), h('strong', { class: 'srch-name' }, d.title)),
    ...(d.more || []).filter(Boolean),
    sub && h('span', { class: 'srch-sub' }, sub),
    ...why.filter(Boolean));
}

/* ------------------------------- the box on every page ------------------------------- */
// What was typed, the tab picked ('' is All), the kind and the place picked on the bookings tab (null: every place),
// how many results are drawn and how far the list was scrolled: kept for the visit, in memory only.
const S = { q: '', tab: '', kind: '', place: null, limit: STEP, top: 0 };
let BOX = null; // the box at the top of the page: { bar, input, label, help }
let UI = null;  // the results while they are up: { el, input, label, tabs, top, out, scroll, back, close, again, going }

// The box's words follow the role: its name, its placeholder and its line of help.
function boxWords() {
  if (!BOX) return;
  BOX.input.placeholder = placeholder(BOX.input);
  BOX.label.textContent = labelText();
  BOX.help.textContent = helpText();
  if (UI) { UI.input.placeholder = placeholder(UI.input); UI.label.textContent = labelText(); }
}
const setEmpty = () => BOX && BOX.bar.classList.toggle('srch-empty', !BOX.input.value.trim());
// While the results are closed by a touch, or a result opens, the box gets the focus back without the phone's
// keyboard coming up; it comes back at the next tap or key on the box.
const quiet = () => BOX && BOX.input.setAttribute('inputmode', 'none');
const loud = () => BOX && BOX.input.removeAttribute('inputmode');
// A search typed over the last one (no word of one begins a word of the other) is a new search: the bookings tab starts
// on shows at every place again. One narrowed or widened ("chelsea" to "chelsea echo") keeps them. The tab picked is
// kept whatever is typed, for the visit: a tab with nothing found for the new words shows All, and says so.
const related = (was, now) => { const x = wordsOf(was), y = wordsOf(now); return x.some(a => y.some(b => a.startsWith(b) || b.startsWith(a))); };
const fresh = () => Object.assign(S, { kind: '', place: null });
// What was typed changes, in either box: the other follows.
function typed(value, over) {
  if (over || !related(S.q, value)) fresh();
  S.q = value; S.limit = STEP;
  if (BOX && BOX.input.value !== value) BOX.input.value = value;
  if (UI && UI.input.value !== value) UI.input.value = value;
  setEmpty();
}

// The box at the top of every page (in #srch-bar, which index.html puts first in the section menu's bar), and "/" from
// anywhere but a field, a sheet, a form or a tour.
export function initSearch(bar) {
  if (bar) {
    let over = false;
    const label = h('label', { class: 'sr-only', for: 'srch-box' });
    const input = h('input', { class: 'search srch-box', id: 'srch-box', type: 'search', autocomplete: 'off', autocapitalize: 'off', enterkeyhint: 'search', 'aria-describedby': 'srch-box-help', 'aria-keyshortcuts': '/', 'aria-haspopup': 'dialog',
      onfocus: () => { searchReady(); setEmpty(); },
      onblur: loud,
      onpointerdown: loud,
      onbeforeinput: () => { over = input.value !== '' && input.selectionStart === 0 && input.selectionEnd === input.value.length; },
      oninput: () => { typed(input.value, over); over = false; if (input.value.trim()) openResults(); },
      onkeydown: e => {
        loud();
        if (e.key === 'Escape') e.preventDefault(); // keeps the words (a search box would empty itself)
        else if ((e.key === 'Enter' || e.key === 'ArrowDown') && input.value.trim()) { e.preventDefault(); openResults({ first: e.key === 'ArrowDown' }); }
      },
      // A tap on a box that holds words brings their results back, with the caret where the tap put it.
      onclick: () => { if (input.value.trim() && !UI) openResults(); } });
    input.setAttribute('spellcheck', 'false');
    const help = h('p', { class: 'srch-pop', id: 'srch-box-help' });
    const ico = h('span', { class: 'srch-ico', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.6 15.6 21 21"/></svg>' });
    bar.replaceChildren(label, ico, input, help);
    BOX = { bar, input, label, help };
    boxWords(); setEmpty();
    window.addEventListener('gdex-role', () => { boxWords(); if (UI) draw(); });
    window.addEventListener('gdex-prefs', () => requestAnimationFrame(boxWords)); // a text size: the placeholder may need to be shorter, or may be longer
    let wide = window.innerWidth;
    window.addEventListener('resize', () => { if (window.innerWidth !== wide) { wide = window.innerWidth; boxWords(); } });
  }
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if ((t && t.tagName && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) || document.querySelector('.sheet-back, .tour') || document.getElementById('app')?.inert) return;
    e.preventDefault();
    openSearch();
  });
}
// Jump into the box: the section menu (and the box with it) slides back if it was tucked away, and the words in the
// box are selected, so typing starts a new search.
export function openSearch() {
  if (UI) { UI.input.focus(); return; }
  if (!BOX) return;
  window.logiShowNav?.();
  BOX.input.focus({ preventScroll: true });
  BOX.input.select();
}

/* ------------------------------- the results ------------------------------- */
// The count of results is said aloud when it changes, once the typing pauses.
let said = '', sayTimer = 0;
function say(msg) {
  clearTimeout(sayTimer);
  if (!msg) { said = ''; return; }
  sayTimer = setTimeout(() => { if (msg !== said && UI) { said = msg; announce(msg); } }, 500);
}
// The day or days a date typed was read as: "On Friday, November 20, 2026", "In November 2026", "In 2025", "From Mon,
// Nov 9 to Sun, Nov 15, 2026". It says how a date such as "11/12" was understood.
function whenText(d) {
  if (d.from === d.to) return 'On ' + fmtLong(d.from);
  const a = parseISO(d.from), b = parseISO(d.to), next = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === 0 && a.getDate() === 1 && b.getMonth() === 11 && b.getDate() === 31) return 'In ' + a.getFullYear();
  if (a.getDate() === 1 && next.getDate() === 1 && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return 'In ' + a.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const f = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  return `From ${a.toLocaleDateString(undefined, f)} to ${b.toLocaleDateString(undefined, f)}`;
}

// "6 shows at 3 places", "2 shows at The Church", "4 sessions"; with some at no place: "5 shows: 3 at The Church, 2
// with no place set". groups: the places of what is listed, each { key, name, n }.
function foundText(n, kind, groups) {
  const known = groups.filter(g => g.key), none = groups.find(g => !g.key);
  if (!known.length) return count(n, kind) + (none && S.place === '' ? ' with no place set' : '');
  const where = known.length === 1 ? known[0].name : plural(known.length, 'place');
  return none ? `${count(n, kind)}: ${n - none.n} at ${where}, ${none.n} with no place set` : `${count(n, kind)} at ${where}`;
}
// "3 venues", "1 take log", "2 invoices and 1 quote".
function tabCount(k, list) {
  if (k === 'money') { const inv = list.filter(r => r.kind === 'invoice').length, quo = list.length - inv; return andList([inv && plural(inv, 'invoice'), quo && plural(quo, 'quote')].filter(Boolean)); }
  return plural(list.length, ...UNIT[k]());
}

// A chip that is pressed says so with a tick as well as its colour. kind: what a place chip counts, said after the
// number ("The Church, 4 shows"); a kind chip's own name says it ("Shows 9").
const chip = (on, attrs, label, n, kind) => h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), ...attrs },
  on && h('span', { class: 'srch-tick', 'aria-hidden': 'true' }, '✓'), h('span', { class: 'srch-chip-name' }, label),
  h('span', { class: 'srch-n' }, String(n), kind && h('span', { class: 'sr-only' }, ' ' + nouns(kind)[n === 1 ? 0 : 1])));

// The bookings tab: item 8's results. Returns [nodes, the count said aloud].
function gigsPanel(found, words) {
  const n = Object.fromEntries(KIND_ORDER.map(k => [k, 0]));
  for (const it of found) n[it.kind]++;
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
  const today = todayISO(), tonight = new Set(model.tonightShows()), ahead = listed.filter(it => isAhead(it, today, tonight)), over = listed.filter(it => !isAhead(it, today, tonight));
  const all = [...ahead, ...over], shown = all.slice(0, S.limit), left = all.length - shown.length, rows = [];
  shown.forEach((it, i) => {
    if (i === ahead.length && ahead.length) rows.push(h('li', { class: 'srch-today' }, h('span', null, 'Today · ' + fmtShort(today)), h('span', { class: 'sr-only' }, '. Above this: still to come. Below it: over.')));
    rows.push(h('li', null, it.type === 'b' ? showCard(it, words) : seenCard(it, words)));
  });
  return [[h('p', { class: 'srch-found' }, miss && h('span', { class: 'srch-miss' }, miss), foundText(listed.length, kind, S.place == null ? groups : groups.filter(g => g.key === S.place))), kinds, places,
    h('ul', { class: 'srch-list', 'aria-label': 'Results' }, rows), moreButton(left)], listed.length];
}
const moreButton = left => left > 0 && h('div', { class: 'actions srch-more' }, h('button', { type: 'button', class: 'btn ghost small', id: 'srch-more', onclick: more }, `Show ${Math.min(STEP, left)} more` + (left > STEP ? ` (${left} left)` : '')));

function draw() {
  if (!UI) return;
  const t0 = performance.now(), { out, tabs } = UI, F = find(clean(S.q));
  // A draw that follows a change to the data gives the focus back to the same card, chip or tab, else to the box. The
  // row of tabs keeps where it was scrolled to, and the tab picked in sight (a phone shows a few at a time).
  const done = (bar, ...kids) => {
    const at = document.activeElement, mine = at && at !== out && (out.contains(at) || tabs.contains(at)), key = mine ? focusKey(at) : null;
    const was = tabs.querySelector('.srch-tabs'), left = was ? was.scrollLeft : 0;
    tabs.replaceChildren(...[bar].filter(Boolean));
    out.replaceChildren(...kids.flat().filter(Boolean));
    if (bar) { bar.scrollLeft = left; inSight(bar, bar.querySelector('[aria-selected="true"]')); }
    if (key !== null) ((key && UI.el.querySelector(key)) || UI.input).focus({ preventScroll: true });
    UI.scroll.style.scrollPaddingTop = UI.top.offsetHeight + 8 + 'px'; // a result reached with Tab is never left under the box and the tabs
    STATS.drawMs = performance.now() - t0;
  };
  out.removeAttribute('role'); out.removeAttribute('aria-labelledby');
  // Nothing typed: only the box and a line of help. A new search starts on shows, at every place.
  if (!F) { fresh(); S.limit = STEP; say(''); return done(null, h('p', { class: 'srch-help muted small', id: 'srch-help' }, helpText())); }
  const kinds = searchKinds().filter(k => F.found[k] && F.found[k].length);
  const total = kinds.reduce((t, k) => t + F.found[k].length, 0);
  if (!total) { say('No results'); return done(null, h('p', { class: 'srch-none' }, `Nothing found for “${clean(S.q)}”. Try fewer words, or part of a name.`), F.date && h('p', { class: 'srch-when muted small' }, whenText(F.date))); }
  // The tab listed: the one picked, else All. A tab with nothing found is left out; when the one picked has nothing, the
  // results show on All and the line above them says so. (A tab of a kind the person no longer sees, after a change of
  // role, is All with nothing said.)
  const wanted = S.tab && searchKinds().includes(S.tab) ? S.tab : 'all', tab = wanted === 'all' || kinds.includes(wanted) ? wanted : 'all';
  const n = { all: total, ...Object.fromEntries(kinds.map(k => [k, F.found[k].length])) };
  const list = ['all', ...kinds];
  const bar = h('div', { class: 'srch-tabs', role: 'tablist', 'aria-label': 'What was found', onkeydown: tabKeys }, list.map(k =>
    h('button', { type: 'button', role: 'tab', class: 'srch-tab' + (k === tab ? ' on' : ''), id: 'srch-tab-' + k, 'data-tab': k, 'aria-selected': String(k === tab), 'aria-controls': 'srch-panel', 'aria-label': `${tabName(k)}, ${n[k]}`, tabindex: k === tab ? '0' : '-1', onclick: () => pickTab(k) },
      h('span', { class: 'srch-tab-name', 'data-name': tabName(k) }, tabName(k)), h('span', { class: 'srch-n' }, String(n[k])))));
  out.setAttribute('role', 'tabpanel'); out.setAttribute('aria-labelledby', 'srch-tab-' + tab);
  const miss = tab !== wanted && h('span', { class: 'srch-miss' }, `No ${tabName(wanted).toLowerCase()} found. `);
  // How the date was read, on All and on a tab with dates; not when all that is dated there was found by its name rather
  // than by the date (the shows of April Wine in November are not "In April 2027").
  const dated = tab === 'all' ? [...DATED].flatMap(k => F.found[k] || []) : DATED.has(tab) ? F.found[tab] : null;
  const when = F.date && dated && (!dated.length || dated.some(r => inSpan(r, F.date))) && h('p', { class: 'srch-when muted small' }, whenText(F.date));
  let kids, spoken;
  if (tab === 'gigs') [kids, spoken] = gigsPanel(F.found.gigs, F.rest);
  else if (tab === 'all') {
    // One list, best match first, at most a screenful; then a way into each tab that holds more than is shown.
    const best = ranked(F), shown = best.slice(0, ALL_MAX), seen = {};
    shown.forEach(r => { seen[r.rec] = (seen[r.rec] || 0) + 1; });
    const more = kinds.filter(k => n[k] > (seen[k] || 0));
    kids = [h('p', { class: 'srch-found' }, miss, plural(total, 'result')),
      h('ul', { class: 'srch-list srch-all', 'aria-label': 'Best matches' }, shown.map(r => h('li', null, rowOf(r, F.rest, 'all')))),
      more.length > 0 && h('div', { class: 'srch-seeall' }, more.map(k => h('button', { type: 'button', class: 'btn ghost small', 'data-see': k, onclick: () => pickTab(k, true) }, `See all in ${tabName(k)} (${n[k]})`)))];
    spoken = total;
  } else {
    const all = F.found[tab], shown = all.slice(0, S.limit);
    kids = [h('p', { class: 'srch-found' }, tabCount(tab, all)), h('ul', { class: 'srch-list', 'aria-label': 'Results' }, shown.map(r => h('li', null, rowOf(r, F.rest, tab)))), moreButton(all.length - shown.length)];
    spoken = all.length;
  }
  say(plural(spoken, 'result'));
  done(bar, when, kids);
}
// A tab scrolled into sight along its row, clear of the row’s ends (its scroll-padding), and nothing else moved.
function inSight(row, tab) {
  if (!tab) return;
  const r = row.getBoundingClientRect(), t = tab.getBoundingClientRect(), pad = parseFloat(getComputedStyle(row).scrollPaddingInlineStart) || 0;
  if (t.left < r.left + pad) row.scrollLeft -= r.left + pad - t.left;
  else if (t.right > r.right - pad) row.scrollLeft += Math.min(t.right - (r.right - pad), t.left - (r.left + pad));
}
// The tabs are one control: ← → (and Home, End) move along them and show each one, as a tap does.
function tabKeys(e) {
  const tabs = [...UI.tabs.querySelectorAll('[role=tab]')], at = tabs.indexOf(document.activeElement);
  if (at < 0) return;
  const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (to == null) return;
  e.preventDefault();
  pickTab(tabs[(to + tabs.length) % tabs.length].dataset.tab);
}
// A tab picked: its list from the top, and the focus on the tab (or, from "See all in …", on its first result).
function pickTab(k, first = false) {
  Object.assign(S, { tab: k === 'all' ? '' : k, limit: STEP });
  draw();
  UI.scroll.scrollTop = 0;
  const tab = UI.tabs.querySelector(`[data-tab="${k}"]`);
  if (tab) { tab.focus({ preventScroll: true }); tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  if (first) cards()[0]?.focus({ preventScroll: true });
}
// A chip pressed: the list is drawn again from the top, and the chip's twin keeps the focus.
function pick(patch, twin) {
  Object.assign(S, patch, { limit: STEP });
  draw();
  UI.scroll.scrollTop = 0;
  UI.out.querySelector(twin)?.focus({ preventScroll: true });
}
// Show more: the next results join the list, and the first of them takes the focus.
function more() {
  const first = S.limit;
  S.limit += STEP;
  draw();
  cards()[first]?.focus();
}
const cards = () => [...UI.out.querySelectorAll('.srch-list .card')];
// What finds a card, a row, a chip, a tab or Show more again after a draw ('' for anything else).
const focusKey = el => { const d = el.dataset || {}, q = (k, v) => `[data-${k}="${CSS.escape(v)}"]`;
  return el.id ? '#' + CSS.escape(el.id) : d.seen ? '.srch-list ' + q('seen', d.seen) : d.rec && d.id ? `.srch-list ${q('rec', d.rec)}${q('id', d.id)}` : d.id ? '.srch-list ' + q('id', d.id)
    : d.kind ? q('kind', d.kind) : d.place ? q('place', d.place) : d.see ? q('see', d.see) : ''; };

/* ------------------------------- a tap opens the record where it lives ------------------------------- */
const tick = () => new Promise(r => setTimeout(r, 0));
// Go to the section, then do what a tap on the record's card there does (its sheet opens over the list, and gives the
// focus back to the card when it closes); when the card is not on the list (the section's own filters hide it), open
// the record all the same.
async function openThere(section, cardOf, open, again = false) {
  await window.logiGo?.(section);
  if (again) { redraw(); await tick(); } // a view picked for a section already on screen (Songs or Setlists)
  await tick();
  const card = cardOf();
  if (card && card.isConnected) { card.focus({ preventScroll: true }); card.scrollIntoView({ block: 'center' }); card.click(); } else open();
}
const byFk = fk => document.querySelector(`#page [data-fk="${CSS.escape(fk)}"]`);
// The Songs page's module: a setlist is found before it has loaded (js/setlist.js loads with the app), so a tap that
// quick waits for it.
const songsPage = () => (MOD.songs ? Promise.resolve(MOD.songs) : LAZY.songs().then(m => (MOD.songs = m)));
const OPEN = {
  gigs: el => (el.dataset.seen ? openSeen(el.dataset.act, el.dataset.seen).then(row => { if (!row) return; row.classList.add('srch-hit'); setTimeout(() => row.classList.remove('srch-hit'), 2600); }) : openBooking(el.dataset.id)),
  bands: el => openActCard(el.dataset.id),
  venues: el => openThere('venues', () => document.getElementById('vn-' + el.dataset.id), () => openVenue(el.dataset.id)),
  people: el => openThere('people', () => document.getElementById('pp-open-' + el.dataset.id), () => openPerson(el.dataset.id)),
  songs: el => songsPage().then(m => { m.showSongs('songs'); return openThere('songs', () => byFk('pg-song-' + el.dataset.id), () => m.openSong(el.dataset.id), window.logiPage?.() === 'songs'); }),
  setlists: el => songsPage().then(m => { m.showSongs('setlists'); return openThere('songs', () => byFk('pg-sl-' + el.dataset.id), () => openSetlist(el.dataset.id), window.logiPage?.() === 'songs'); }),
  gear: el => openThere('backline', () => document.getElementById('bl-item-' + el.dataset.id), () => openGear(el.dataset.id)),
  logs: el => MOD.logs.openLog(el.dataset.id),
  money: el => { const [, id] = el.dataset.id.split(':'); return openBooking(id, { box: 'money' }); },
};
// A tap on a result closes the search and opens what it shows; opening the results again brings them back.
function openResult(el) {
  const kind = el.dataset.rec;
  if (!OPEN[kind]) return;
  UI.going = true; // the focus goes to what opens, not back to the box
  S.top = UI.scroll.scrollTop; // where the list is now, even when the tap comes before its last scroll is reported
  quiet(); // the box has the focus for a moment as the sheet closes: no keyboard for it
  UI.close();
  BOX?.input.blur(); // and not after: what opens takes it (a page that puts the focus where it starts when nothing has it)
  Promise.resolve(OPEN[kind](el)).catch(e => console.error(e));
}

// The results, over the page: one of Gdex's sheets with a box of its own at the top (the words, and the caret or the
// selection the box at the top of the page had), the tabs under it, and the list. first: the focus goes to the first
// result (↓ in the box at the top of the page).
function openResults({ first = false } = {}) {
  if (UI) { UI.input.focus(); return; }
  searchReady();
  const from = BOX ? BOX.input : null, sel = from ? [from.selectionStart, from.selectionEnd] : [S.q.length, S.q.length];
  // Typing over the whole of the last search (its words selected) is a new search from the first key, even when that
  // key begins one of the old words ("c" over "chelsea" on the way to "coldplay").
  let over = false;
  const label = h('label', { class: 'sr-only', for: 'srch-q' }, labelText());
  const input = h('input', { class: 'search', id: 'srch-q', type: 'search', value: S.q, autocomplete: 'off', autocapitalize: 'off', enterkeyhint: 'search', 'aria-describedby': 'srch-help-line',
    onbeforeinput: () => { over = input.value !== '' && input.selectionStart === 0 && input.selectionEnd === input.value.length; },
    oninput: () => { typed(input.value, over); over = false; draw(); UI.scroll.scrollTop = 0; },
    onkeydown: e => {
      if (e.key === 'Escape') e.preventDefault(); // the sheet closes; the boxes keep their words for next time
      else if ((e.key === 'Enter' || e.key === 'ArrowDown') && cards().length) { e.preventDefault(); cards()[0].focus(); }
    } });
  input.setAttribute('spellcheck', 'false');
  const tabs = h('div', { class: 'srch-tabbar' });
  const out = h('div', { class: 'srch-out', id: 'srch-panel',
    // ↓ ↑ walk the results; ↑ from the first goes back to the box, ↓ from the last on to Show more.
    onkeydown: e => {
      const step = { ArrowDown: 1, ArrowUp: -1 }[e.key], at = step ? cards().indexOf(e.target.closest('.card')) : -1;
      if (at < 0) return;
      e.preventDefault();
      (cards()[at + step] || (step < 0 ? input : out.querySelector('#srch-more')))?.focus();
    } });
  // In the capture phase, so the click stops here: a booking's card has a tap of its own, for the calendar's page.
  out.addEventListener('click', e => { const card = e.target.closest('.srch-list .card'); if (!card) return; e.stopPropagation(); openResult(card); }, true);
  const top = h('div', { class: 'srch-top' }, label, input, h('span', { class: 'sr-only', id: 'srch-help-line' }, helpText()), tabs);
  const body = h('div', { class: 'srch' }, top, out);
  // A touch anywhere on the sheet (✕, the backdrop, a result) keeps the phone's keyboard down for the box it closes to.
  const point = e => { if (UI && e.pointerType && e.pointerType !== 'mouse' && UI.back.contains(e.target)) quiet(); };
  document.addEventListener('pointerdown', point, true);
  const { el, close } = sheet(TITLE, body, { onClose: () => {
    const ui = UI; UI = null;
    document.removeEventListener('pointerdown', point, true);
    clearTimeout(sayTimer); clearTimeout(ui.again); said = '';
    setEmpty();
    if (!ui.going && BOX && document.activeElement !== BOX.input) BOX.input.focus({ preventScroll: true });
  } });
  el.classList.add('srch-sheet');
  const scroll = el.querySelector('.sheet-body');
  UI = { el, input, label, tabs, top, out, scroll, back: el.parentElement, close, again: 0, going: false };
  input.placeholder = placeholder(input);
  draw();
  scroll.scrollTop = S.top; // back where the list was left
  scroll.addEventListener('scroll', () => { if (scroll.isConnected) S.top = scroll.scrollTop; }, { passive: true }); // not the 0 a closed sheet reports (after a tap on a card)
  input.focus({ preventScroll: true });
  try { input.setSelectionRange(Math.min(sel[0] ?? S.q.length, S.q.length), Math.min(sel[1] ?? S.q.length, S.q.length)); } catch { /* not a text box */ }
  if (first) cards()[0]?.focus();
}

/* ------------------------------- help ------------------------------- */
sheetTutorial(TITLE, () => [
  { title: 'Search', text: `${helpText()} Every word you type has to be found, in any order. On a keyboard, / jumps into the box from any page.`, target: ['#srch-q'] },
  { title: 'Tabs', text: 'All has the best matches of every kind, a name that starts with what you typed first. Each other tab has one kind, with how many were found. ← → move along them.', target: ['.srch-tabs'] },
  { title: 'The date', text: 'How a date you typed was read: everything dated that day, or in that week, month or year, comes up.', target: ['.srch-when'] },
  { title: 'What was found', text: 'How many, and on the bookings tab at how many places.', target: ['.srch-found'] },
  { title: 'Kinds', text: `${capital(showWords()[1])}, sessions and rehearsals each have a list of their own. It starts on ${showWords()[1]}.`, target: ['.srch-kinds'] },
  { title: 'Places', text: 'Tap a place to see only what was there. Tap it again, or All, to see everything.', target: ['.srch-places'] },
  { title: 'The results', text: `Tap one to open it where it lives. On the ${tabName('gigs').toLowerCase()} tab: newest first, with a line for today between what is still to come and what is over; a card marked From the log is a time you logged seeing ${an(actWord())} that has no ${showWords()[0]} on the calendar.`, target: ['.srch-list .card'] },
]);
// The welcome tour's stop for the box, after the section menu.
setSearchStep({ target: ['#srch-bar'], title: 'Search', get text() { return `The box at the top of every page finds anything: ${andList(whatList())}, by any word in them, or by a date (${DATE_HELP}). The results come up as you type, a tab for each kind.`; } });
