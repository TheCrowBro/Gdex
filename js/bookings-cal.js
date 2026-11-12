// The calendar: what the Bookings page shows while no booking is open. The month with "Coming up" under it, and one
// day. Everything it needs from the page (js/pages/bookings.js) arrives in ctx; it never imports the page.
//   ctx = { S, go, showBooking, newBooking, holdToDelete, exportCalendar, passes, filtersOn, root }
//   S: the page's state. Read S.mode ('month' | 'two' | 'week' | 'three' | 'day'), S.day (the one anchor day, always a
//      date: the month shown is the month of S.day), S.kind and S.act (the filter chips), S.all (Coming up in full).
//      Change it only through go(patch, { top }).
// Adapted from Vdex's bookings page: the month grid, the day list, press and hold to delete.
import { h, ymd, todayISO, parseISO, fmtLong, fmtShort, daysUntil, empty, backBtn, wasHeld } from './util.js';
import { db, byId, bookingsOn, upcoming, covers, lastDay, usedQty, byPlay } from './store.js';
import * as model from './model.js';
import { moneyShown, sectionName, actWord } from './roles.js';
import { runOfDay } from './ics.js';
import { isoOk, monthStart, addDays, safeColor, actStyle, tone, pill, multi, dateRange, plural, sortByName, capital, KIND_CHIP, cardExtras } from './bookings-kit.js';

let X = null; // the page's side (ctx), the same object on every draw

/* ------------------------------- words ------------------------------- */
// The first time on the day with its name ("Load-in 17:00"), or "10:00–18:00" for studio time and rehearsals.
function timeLine(b) {
  const run = runOfDay(b);
  if (!run.length) return '';
  if (b.kind !== 'show') return run.map(x => x[1]).join('–');
  const [l, t] = run[0], set = run.find(x => x[0] === 'On stage');
  return `${l} ${t}` + (set && set !== run[0] ? ` · On ${set[1]}` : '');
}
// Where, without repeating the title: the venue's name unless "Act @ Venue" already says it; with the address
// (first line) when asked for, or when the name is already in the title.
function venueLine(b, withAddress = false) {
  const v = model.venueOf(b), name = v.name || '', addr = String(v.address || b.address || '').split('\n')[0].trim();
  const said = name && model.bookingTitle(b).includes(name);
  return [!said && name, (withAddress || said) && addr].filter(Boolean).join(', ');
}
// The section's name for the role ("Shows" for a scout), wherever this page says it.
const pageName = () => sectionName('bookings', 'Bookings');
// "All acts" in the role's words: "All bands", "All artists"; a roster is one thing, so "Whole roster".
const allActs = () => { const n = sectionName('acts', 'Acts'), plural = actWord() + 's'; return n.toLowerCase() === plural || /^my\b/i.test(n) ? `All ${plural}` : `Whole ${n.toLowerCase()}`; };

/* ------------------------------- the page while no booking is open ------------------------------- */
export function calendarView(ctx) {
  X = ctx;
  return X.S.mode === 'day' ? dayView() : monthView();
}
// The ? walkthrough for the calendar as it is drawn now.
export function calendarSteps(ctx) {
  X = ctx;
  return X.S.mode === 'day' ? daySteps() : monthSteps();
}

/* ------------------------------- month ------------------------------- */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function monthView() {
  const { S, go } = X;
  const cursor = monthStart(S.day), y = cursor.getFullYear(), m = cursor.getMonth();
  const total = new Date(y, m + 1, 0).getDate(), lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
  const today = todayISO();
  const all = db.bookings.filter(b => isoOk(b.date) && X.passes(b));
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'day blank', 'aria-hidden': 'true' }));
  for (let d = 1; d <= total; d++) cells.push(dayCell(ymd(new Date(y, m, d)), all, today));
  // Another month: the day in view becomes today when that is this month, else its 1st.
  const shift = n => { const first = ymd(new Date(y, m + n, 1)); go({ day: first.slice(0, 7) === today.slice(0, 7) ? today : first }, { top: false }); };
  const grid = h('div', { class: 'cal bk-cal', role: 'group', 'aria-label': cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) },
    WEEKDAYS.map(w => h('div', { class: 'wd', 'aria-hidden': 'true' }, w)), cells);
  swipeMonths(grid, shift);
  arrowKeys(grid);

  const list = upcoming().filter(X.passes);
  const shown = S.all ? list : list.slice(0, 8);
  const actsUsed = sortByName(db.acts.filter(a => db.bookings.some(b => b.actId === a.id)));
  const kindsUsed = model.KINDS.filter(([k]) => db.bookings.some(b => b.kind === k));
  const chip = (on, label, onclick, extra = {}) => h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick, ...extra }, label);
  const filters = (kindsUsed.length > 1 || S.kind || actsUsed.length > 1 || S.act) && h('div', { class: 'bk-filters', role: 'group', 'aria-label': 'Filters' },
    (kindsUsed.length > 1 || S.kind) && h('div', { class: 'chips', role: 'group', 'aria-label': 'Kind of booking' },
      chip(!S.kind, 'All kinds', () => go({ kind: '' }, { top: false })),
      model.KINDS.filter(([k]) => S.kind === k || kindsUsed.some(x => x[0] === k)).map(([k, , icon]) => chip(S.kind === k, `${icon} ${KIND_CHIP[k]}`, () => go({ kind: S.kind === k ? '' : k }, { top: false })))),
    (actsUsed.length > 1 || S.act) && h('div', { class: 'chips', role: 'group', 'aria-label': capital(actWord()) },
      chip(!S.act, allActs(), () => go({ act: '' }, { top: false })),
      actsUsed.concat(S.act && !actsUsed.some(a => a.id === S.act) && byId('acts', S.act) ? [byId('acts', S.act)] : []).map(a => chip(S.act === a.id,
        [h('span', { class: 'bk-swatch', style: safeColor(a.color) ? `--act:${safeColor(a.color)}` : null, 'aria-hidden': 'true' }), a.name || 'Unnamed act'],
        () => go({ act: S.act === a.id ? '' : a.id }, { top: false })))));

  return h('div', { class: 'bk-calview bk-mode-month bk-monthview' },
    h('div', { class: 'page-head' },
      h('h1', { tabindex: '-1', 'data-view-head': '' }, pageName()),
      h('div', { class: 'bk-head-actions' },
        h('button', { type: 'button', class: 'btn ghost small bk-export', title: 'Save your upcoming bookings as a calendar file (.ics)', onclick: X.exportCalendar }, '📆 Export calendar'),
        h('button', { type: 'button', class: 'btn primary bk-new', onclick: () => X.newBooking({ date: today.slice(0, 7) === S.day.slice(0, 7) ? today : S.day }) }, '+ New'))),
    filters,
    h('section', { class: 'cal-panel box-dark bk-cal-panel', 'aria-label': 'Calendar' },
      h('div', { class: 'cal-nav' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => shift(-1) }, '‹'),
        h('div', { class: 'cal-title', 'aria-live': 'polite' }, cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
        h('button', { type: 'button', class: 'btn ghost small', 'aria-label': 'This month', onclick: () => go({ day: todayISO() }, { top: false }) }, 'Today'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next month', onclick: () => shift(1) }, '›')),
      grid,
      h('div', { class: 'bk-legend muted', 'aria-hidden': 'true' }, h('span', null, h('i', { class: 'bk-dot st-confirmed' }), ' booked'), h('span', null, h('i', { class: 'bk-dot st-hold' }), ' hold or offer'), h('span', null, h('i', { class: 'bk-dot st-cancelled' }), ' cancelled'))),
    h('h3', { class: 'bk-agenda-head' }, X.filtersOn() ? 'Coming up (filtered)' : 'Coming up'),
    list.length
      ? h('div', { class: 'bk-agenda' },
        h('div', { class: 'list' }, shown.map(agendaCard)),
        list.length > 8 && h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost small', id: 'bk-agenda-more', onclick: () => go({ all: !S.all }, { top: false }) }, S.all ? 'Show fewer' : `Show all (${list.length})`)))
      : empty(X.filtersOn() ? 'Nothing coming up with these filters.' : moneyShown() ? 'Nothing coming up. Add a show, a studio session or a rehearsal, or tap a date on the calendar.' : 'Nothing coming up. Add a show you’re going to, or tap a date on the calendar.',
        X.filtersOn() ? h('button', { type: 'button', class: 'btn ghost', onclick: () => go({ kind: '', act: '' }, { top: false }) }, 'Clear the filters')
          : moneyShown() ? h('button', { type: 'button', class: 'btn primary', onclick: () => X.newBooking({}) }, '+ New booking') : h('button', { type: 'button', class: 'btn primary', onclick: () => X.newBooking({ kind: 'show' }) }, '+ Add a show')));
}

// The order inside a day's square: a booking over several days first (by its first day, then its id), so its bar keeps
// its row from one square to the next whatever its times; then the day's own bookings in the order the bands play.
const squareOrder = list => [
  ...list.filter(multi).sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id))),
  ...list.filter(b => !multi(b)).sort(byPlay),
];

function dayCell(iso, all, today) {
  const list = squareOrder(all.filter(b => covers(b, iso)));
  const d = parseISO(iso), dow = (d.getDay() + 6) % 7;
  // A booking over several days shows on each: its line runs on from the day before, and the name shows on the first
  // day and at the start of each week row.
  const seg = b => (!multi(b) ? '' : iso === b.date ? ' bk-seg-start' : iso === lastDay(b) ? ' bk-seg-end' : ' bk-seg-mid');
  const named = b => !multi(b) || iso === b.date || dow === 0 || iso.endsWith('-01'); // and on the 1st, for one that began last month
  // The line leads with where (the act is its colour): a typed title, else the venue, else the act or client.
  const short = b => b.title || model.venueOf(b).name || model.bookingTitle(b);
  const mini = b => h('span', { class: `bk-mini ${tone(b.status)}${seg(b)}`, style: actStyle(b) }, named(b) ? `${model.kindIcon(b.kind)} ${short(b)}` : ' ');
  const dot = b => h('i', { class: `bk-dot ${tone(b.status)}${multi(b) ? ' bk-bar' + seg(b) : ''}`, style: actStyle(b) });
  const label = `${fmtLong(iso)}${iso === today ? ', today' : ''}: ${list.length ? list.map(b => `${model.bookingTitle(b)} (${model.statusLabel(b.status)})`).join(', ') : 'nothing booked'}`;
  return h('button', {
    type: 'button', class: 'day bk-day' + (iso === today ? ' today' : '') + (list.length ? ' has' : ''), 'data-date': iso, 'aria-label': label,
    'aria-current': iso === today ? 'date' : null, onclick: () => X.go({ mode: 'day', day: iso }),
  },
    h('span', { class: 'num' }, d.getDate()),
    list.length > 0 && h('span', { class: 'bk-minis' }, list.slice(0, 3).map(mini), list.length > 3 && h('span', { class: 'more' }, `+${list.length - 3} more`)),
    list.length > 0 && h('span', { class: 'bk-dots', 'aria-hidden': 'true' }, list.slice(0, 4).map(dot), list.length > 4 && h('span', { class: 'more' }, '+')));
}

// Swipe the calendar left or right for the next or previous month (a scroll up or down is left alone).
function swipeMonths(grid, shift) {
  let x = null, y = 0, at = 0;
  grid.addEventListener('pointerdown', e => { if (e.button === 0) { x = e.clientX; y = e.clientY; } });
  grid.addEventListener('pointerup', e => {
    if (x == null) return;
    const dx = e.clientX - x, dy = e.clientY - y; x = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) { at = Date.now(); setTimeout(() => shift(dx < 0 ? 1 : -1), 0); }
  });
  grid.addEventListener('pointercancel', () => { x = null; });
  grid.addEventListener('click', e => { if (Date.now() - at < 500) { e.stopPropagation(); e.preventDefault(); } }, true); // the tap that ends a swipe opens nothing
}
// Arrow keys move between days (up and down by a week), across into the next or previous month.
function arrowKeys(grid) {
  grid.addEventListener('keydown', e => {
    const cell = e.target.closest && e.target.closest('[data-date]');
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!cell || !step) return;
    e.preventDefault(); // the section menu keeps its arrows for the rest of the page
    const iso = addDays(cell.dataset.date, step);
    if (iso.slice(0, 7) !== cell.dataset.date.slice(0, 7)) X.go({ day: iso }, { top: false });
    const root = X.root(), next = root && root.querySelector(`[data-date="${iso}"]`);
    if (next) next.focus();
  });
}

function agendaCard(b) {
  const d = parseISO(b.date), n = daysUntil(b.date);
  const when = n < 0 ? 'On now' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 14 ? `In ${n} days` : '';
  const card = h('button', { type: 'button', class: 'card tap bk-card', style: actStyle(b), 'data-id': b.id, title: 'Tap to open; press and hold to delete',
    onclick: () => { if (!wasHeld(card)) X.showBooking(b); } },
    h('span', { class: 'bk-date', 'aria-hidden': 'true' },
      h('span', null, d.toLocaleDateString(undefined, { weekday: 'short' })), h('b', null, d.getDate()), h('span', null, d.toLocaleDateString(undefined, { month: 'short' }))),
    h('span', { class: 'sr-only' }, dateRange(b, fmtLong) + '. '),
    h('span', { class: 'bk-card-main' },
      h('span', { class: 'bk-card-top' }, h('strong', { class: 'bk-card-title' }, h('span', { 'aria-hidden': 'true' }, model.kindIcon(b.kind) + ' '), model.bookingTitle(b)), pill(b.status)),
      h('span', { class: 'bk-card-sub muted small' }, [when, multi(b) && `to ${fmtShort(lastDay(b))}`, timeLine(b), venueLine(b) && `📍 ${venueLine(b)}`].filter(Boolean).join(' · ')),
      ...cardExtras(b)));
  return X.holdToDelete(card, b);
}

/* -------------------------------- day -------------------------------- */
function dayView() {
  const { S, go } = X;
  const list = bookingsOn(S.day);
  const shift = n => go({ day: addDays(S.day, n) }, { top: false });
  return h('div', { class: 'bk-dayview' },
    h('div', { class: 'page-head' },
      backBtn('Calendar', () => go({ mode: 'month' })),
      h('button', { type: 'button', class: 'btn primary bk-new-day', onclick: () => X.newBooking({ date: S.day }) }, '+ New on this day')),
    h('div', { class: 'cal-nav' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous day', onclick: () => shift(-1) }, '‹'),
      h('h2', { class: 'cal-title', tabindex: '-1', 'data-view-head': '' }, fmtLong(S.day), S.day === todayISO() && h('span', { class: 'muted small' }, ' · today')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next day', onclick: () => shift(1) }, '›')),
    list.length
      ? h('div', { class: 'list bk-daylist' }, list.map(dayCard))
      : h('p', { class: 'muted bk-none' }, 'Nothing booked on this day.'));
}

// An entry in the Day view (class bk-ev: never on a Coming up card).
function dayCard(b) {
  const people = (b.people || []).filter(id => byId('people', id)).length;
  const items = (b.gear || []).filter(id => byId('gear', id)).reduce((s, id) => s + usedQty(b, id), 0); // pieces, as the Line-up box counts them
  const card = h('button', { type: 'button', class: 'card tap bk-card bk-card-day bk-ev', style: actStyle(b), 'data-id': b.id, title: 'Tap to open; press and hold to delete',
    onclick: () => { if (!wasHeld(card)) X.showBooking(b, X.S.day); } },
    h('span', { class: 'bk-card-main' },
      h('span', { class: 'bk-card-top' }, h('strong', { class: 'bk-card-title' }, h('span', { 'aria-hidden': 'true' }, model.kindIcon(b.kind) + ' '), model.bookingTitle(b)), pill(b.status)),
      h('span', { class: 'bk-card-sub muted small' }, [model.kindLabel(b.kind), multi(b) && dateRange(b, fmtShort), timeLine(b)].filter(Boolean).join(' · ')),
      venueLine(b, true) && h('span', { class: 'bk-card-sub muted small' }, '📍 ' + venueLine(b, true)),
      (people || items) ? h('span', { class: 'bk-card-sub muted small' }, [people && plural(people, 'person', 'people'), items && plural(items, 'item')].filter(Boolean).join(' · ')) : null,
      ...cardExtras(b)));
  return X.holdToDelete(card, b);
}

/* ------------------------------- walkthroughs ------------------------------- */
const monthSteps = () => [
  { title: 'New booking', text: 'Add a show, a studio session, a rehearsal or anything else in the diary.', target: ['.bk-new'] },
  { title: 'Export calendar', text: moneyShown() ? 'Saves your upcoming bookings as a calendar file for Apple, Google or Outlook Calendar, or to send to the band. No fees or deals go in it.' : 'Saves your upcoming bookings as a calendar file for Apple, Google or Outlook Calendar.', target: ['.bk-export'] },
  { title: 'Filters', text: 'Show one act, or one kind of booking, on the calendar and in the list.', target: ['.bk-filters'] },
  { title: 'The calendar', text: 'Each line or dot is a booking in its act’s colour. Hollow or dashed means a hold or an offer. Tap a day to see it; swipe, or use ‹ ›, for other months.', target: ['.bk-cal-panel'] },
  { title: 'Coming up', text: 'Your next bookings, soonest first; on the same day, in the order the bands play. Tap one to open it. Press and hold one for three seconds to delete it.', target: ['.bk-agenda', '.bk-monthview .empty'] },
];
const daySteps = () => [
  { title: 'One day', text: 'Everything booked on this day, in the order the bands play. ‹ › move a day at a time.', target: ['.bk-dayview .cal-nav'] },
  { title: 'Add to this day', text: 'A new booking with this date already filled in.', target: ['.bk-new-day'] },
  { title: pageName(), text: 'Tap one to open it. Press and hold one for three seconds to delete it.', target: ['.bk-daylist', '.bk-dayview .bk-none'] },
  { title: 'Back to the month', text: 'Calendar takes you back to the month.', target: ['.bk-dayview .back-btn'] },
];
