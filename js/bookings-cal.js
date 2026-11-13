// The calendar: what the Bookings page shows while no booking is open. One frame (the heading, the filter chips, the
// calendar panel with its row of view buttons, and "Coming up") around five views of the same bookings: the month and
// two weeks as day squares, the week as a list for each day, three days and one day as a time grid.
// Everything it needs from the page (js/pages/bookings.js) arrives in ctx; it never imports the page.
//   ctx = { S, go, showBooking, newBooking, holdToDelete, exportCalendar, passes, filtersOn, root }
//   S: the page's state. Read S.mode ('month' | 'two' | 'week' | 'three' | 'day'), S.day (the one anchor day, always a
//      date: every view is drawn around it), S.kind and S.act (the filter chips), S.all (Coming up in full).
//      Change it only through go(patch, { top }).
// Only the view buttons save the view on the device (saveCalMode): a day opened from a square, a day's name or Back
// from a booking is the Day view for this visit only.
// Adapted from Vdex's bookings page: the month grid, press and hold to delete.
import { h, ymd, todayISO, parseISO, fmtLong, fmtShort, daysUntil, empty, wasHeld, announce } from './util.js';
import { db, byId, upcoming, covers, lastDay, byPlay } from './store.js';
import * as model from './model.js';
import { moneyShown, sectionName, actWord } from './roles.js';
import { runOfDay } from './ics.js';
import { isoOk, monthStart, addDays, safeColor, actStyle, tone, pill, multi, dateRange, sortByName, capital, KIND_CHIP, cardExtras, CAL_MODES, saveCalMode } from './bookings-kit.js';
import { formerlyLine } from './bookings-kit.js'; // "formerly The Night Owls" under the name of a booking from before its act changed its name

let X = null; // the page's side (ctx), the same object on every draw

/* ------------------------------- words ------------------------------- */
// The time a booking is sorted by, padded ("09:00", "00:30"); '' when it has none.
const playClock = b => { const k = model.playKey(b); return k == null ? '' : model.nightClock(k); };
// "Doors", "Soundcheck" or "Load-in" when that time stands in for a show's on-stage time, which is not set yet; else ''.
const fallBack = b => (b.kind === 'show' && !['', 'setTime'].includes(model.playField(b)) ? model.playLabel(b) : '');
// A show the person said they missed, and have not scored since (as js/bookings-kit.js wentMark tests it).
const didntGo = b => b.went === 'no' && b.kind === 'show' && b.status !== 'cancelled' && model.seenAnswer(b) === 'no';
// The first time on the day with its name ("Load-in 17:00"), or "10:00–18:00" for studio time and rehearsals. A show
// also says when it is on stage ("· On 21:15"); with no on-stage time yet it says the time it is sorted by instead
// ("Load-in 16:00 · Doors 19:30"), so the cards of a day read in order.
function timeLine(b) {
  const run = runOfDay(b);
  if (!run.length) return '';
  if (b.kind !== 'show') return run.map(x => x[1]).join('–');
  const [l, t] = run[0], set = run.find(x => x[0] === 'On stage'), by = fallBack(b);
  return `${l} ${t}` + (set ? (set !== run[0] ? ` · On ${set[1]}` : '') : by && by !== l ? ` · ${by} ${playClock(b)}` : '');
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
// What a block or a pill on the time grid tells a screen reader beyond the words on it (it is too small for the chip
// and the note): its days (a pill), the status, the overlap note, the venue's house rules as spoken, "Didn’t go".
function said(b, days = '') {
  let rules = '';
  try { rules = (model.rulesChipText(model.showRulesVenue(b)) || {}).spoken || ''; } catch { /* a fault in the rules must not break a block */ }
  const parts = [days, model.statusLabel(b.status), model.overlapText(b), rules, didntGo(b) && 'Didn’t go'].filter(Boolean);
  const was = model.formerlyNote(b); // the name the act had that night comes first, straight after the name on the block
  if (was) parts.unshift(capital(was));
  return h('span', { class: 'sr-only' }, ' ' + parts.map(p => `${p}.`).join(' '));
}

/* ------------------------------- dates, in the device's language ------------------------------- */
const VIEWS = [['month', 'Month'], ['two', '2 weeks'], ['week', 'Week'], ['three', '3 days'], ['day', 'Day']];
// For each view: how many days ‹ › step (the month steps by a month), and what ‹, › and Today are called. Today's
// spoken name starts with the word it shows, so a person who says or types “Today” finds it.
const NAV = {
  month: { prev: 'Previous month', next: 'Next month', today: 'Today, this month' },
  two: { days: 14, prev: 'Previous two weeks', next: 'Next two weeks', today: 'Today, these two weeks' },
  week: { days: 7, prev: 'Previous week', next: 'Next week', today: 'Today, this week' },
  three: { days: 3, prev: 'Previous three days', next: 'Next three days', today: 'Today and the next two days' },
  day: { days: 1, prev: 'Previous day', next: 'Next day', today: 'Today' },
};
const modeOf = S => (CAL_MODES.includes(S.mode) ? S.mode : 'month');
// The frame's classes for each view (.bk-monthview only in the month, .bk-dayview only on one day), written out in full.
const FRAME = { month: 'bk-calview bk-mode-month bk-monthview', two: 'bk-calview bk-mode-two', week: 'bk-calview bk-mode-week', three: 'bk-calview bk-mode-three', day: 'bk-calview bk-mode-day bk-dayview' };
const weekStart = iso => addDays(iso, -((parseISO(iso).getDay() + 6) % 7)); // weeks start on Monday, as the month does
// The days a view shows around the anchor day: its month; the two weeks, or the week, from the Monday of its week;
// the day and the two after it; the day alone.
function rangeOf(mode, day) {
  const first = mode === 'month' ? ymd(monthStart(day)) : mode === 'two' || mode === 'week' ? weekStart(day) : day;
  const n = mode === 'month' ? new Date(parseISO(first).getFullYear(), parseISO(first).getMonth() + 1, 0).getDate() : NAV[mode].days;
  const days = Array.from({ length: n }, (_, i) => addDays(first, i));
  return { first, last: days[n - 1], days };
}
const monthTitle = day => monthStart(day).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
// "9 – 22 Nov", "26 Oct – 8 Nov": a range as the device's language writes it, never a hand-built order of day and
// month. The year is added when the range leaves a year, or is in a year other than this one.
function rangeTitle(firstIso, lastIso) {
  const a = parseISO(firstIso), b = parseISO(lastIso), now = new Date().getFullYear();
  const f = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', ...(a.getFullYear() !== now || b.getFullYear() !== now ? { year: 'numeric' } : {}) });
  try { if (typeof f.formatRange === 'function') return f.formatRange(a, b); } catch { /* an older browser: the two dates below */ }
  return `${f.format(a)} – ${f.format(b)}`;
}
// A day's short name, "Thu 12": the weekday, then the number (one call with both reads "12 Thu" in some languages).
const dayShort = iso => { const d = parseISO(iso); return [d.toLocaleDateString(undefined, { weekday: 'short' }), ' ', h('b', { class: 'bk-daynum' }, d.getDate())]; };
// "9 Nov" or "Nov 9" on the first square of two weeks and on a 1st, the month's name in small letters.
const MONTH_DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const monthDay = d => (typeof MONTH_DAY.formatToParts === 'function' ? MONTH_DAY.formatToParts(d).map(p => (p.type === 'month' ? h('span', { class: 'bk-mon' }, p.value) : p.value)) : MONTH_DAY.format(d));
const openDay = (iso, today) => `${fmtLong(iso)}${iso === today ? ', today' : ''}. Open the day`;

/* ------------------------------- the page while no booking is open ------------------------------- */
export function calendarView(ctx) {
  X = ctx;
  const { S, go } = X;
  const mode = modeOf(S), nav = NAV[mode], isDay = mode === 'day', squared = mode === 'month' || mode === 'two';
  const today = todayISO(), R = rangeOf(mode, S.day);
  const title = mode === 'month' ? monthTitle(S.day) : isDay ? fmtLong(S.day) : rangeTitle(R.first, R.last);
  // ‹ › step by the length of the view; 0 is Today. Another month: the day in view becomes today when that is this
  // month, else its 1st. The new title is said aloud (announce): the page is drawn again at every step, and a live
  // region that arrives with its words already in it is not read out, so the title itself is not one.
  const step = n => {
    let day = todayISO();
    if (n && mode === 'month') { const c = monthStart(S.day), first = ymd(new Date(c.getFullYear(), c.getMonth() + n, 1)); day = first.slice(0, 7) === day.slice(0, 7) ? day : first; }
    else if (n) day = addDays(S.day, n * nav.days);
    go({ day }, { top: false });
    const to = rangeOf(mode, day);
    announce(isDay ? fmtLong(day) + (day === todayISO() ? ', today' : '') : mode === 'month' ? monthTitle(day) : rangeTitle(to.first, to.last));
  };
  const all = db.bookings.filter(b => isoOk(b.date) && X.passes(b)); // the filter chips apply in every view
  const body = h('div', { class: 'bk-body' }, squared ? squares(mode, R, all, today, title) : mode === 'week' ? weekList(R, all, today) : timeGrid(mode, R, all, today));
  swipe(body, step);

  const views = h('div', { class: 'bk-views', role: 'group', 'aria-label': 'Calendar view' }, VIEWS.map(([id, label]) => h('button', {
    type: 'button', id: 'bk-view-' + id, class: 'bk-view' + (id === mode ? ' on' : ''), 'aria-pressed': String(id === mode),
    onclick: () => { saveCalMode(id); go({ mode: id }, { top: false }); }, // the one place the view is saved
  }, label)));
  showPressed(views);
  // + New starts on the day in view (Day, 3 days); else on today when today is on screen, else on the first day shown.
  const newDate = isDay || mode === 'three' ? S.day : today >= R.first && today <= R.last ? today : R.first;

  return h('div', { class: FRAME[mode] },
    h('div', { class: 'page-head' },
      isDay ? h('h1', null, pageName()) : h('h1', { tabindex: '-1', 'data-view-head': '' }, pageName()),
      h('div', { class: 'bk-head-actions' },
        h('button', { type: 'button', class: 'btn ghost small bk-export', title: 'Save your upcoming bookings as a calendar file (.ics)', onclick: X.exportCalendar }, '📆 Export calendar'),
        h('button', { type: 'button', class: 'btn primary bk-new', onclick: () => X.newBooking({ date: newDate }) }, '+ New'))),
    filters(),
    h('section', { class: 'cal-panel box-dark bk-cal-panel', 'aria-label': 'Calendar' },
      views,
      h('div', { class: 'cal-nav' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': nav.prev, onclick: () => step(-1) }, '‹'),
        // Arriving at a day says which day: there the title is the view's heading.
        isDay ? h('h2', { class: 'cal-title', tabindex: '-1', 'data-view-head': '' }, title, S.day === today && h('span', { class: 'muted small' }, ' · today'))
          : h('div', { class: 'cal-title' }, title),
        h('button', { type: 'button', class: 'btn ghost small', 'aria-label': nav.today, onclick: () => step(0) }, 'Today'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': nav.next, onclick: () => step(1) }, '›')),
      body,
      squared && h('div', { class: 'bk-legend muted', 'aria-hidden': 'true' }, h('span', null, h('i', { class: 'bk-dot st-confirmed' }), ' booked'), h('span', null, h('i', { class: 'bk-dot st-hold' }), ' hold or offer'), h('span', null, h('i', { class: 'bk-dot st-cancelled' }), ' cancelled')),
      isDay && h('div', { class: 'bk-day-add' }, h('button', { type: 'button', class: 'btn ghost small bk-new-day', onclick: () => X.newBooking({ date: S.day }) }, '+ New on this day'))),
    comingUp());
}

// The filter chips: one kind of booking, one act. Shown once there is more than one of either to choose from.
function filters() {
  const { S, go } = X;
  const actsUsed = sortByName(db.acts.filter(a => db.bookings.some(b => b.actId === a.id)));
  const kindsUsed = model.KINDS.filter(([k]) => db.bookings.some(b => b.kind === k));
  const chip = (on, label, onclick, extra = {}) => h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick, ...extra }, label);
  return (kindsUsed.length > 1 || S.kind || actsUsed.length > 1 || S.act) && h('div', { class: 'bk-filters', role: 'group', 'aria-label': 'Filters' },
    (kindsUsed.length > 1 || S.kind) && h('div', { class: 'chips', role: 'group', 'aria-label': 'Kind of booking' },
      chip(!S.kind, 'All kinds', () => go({ kind: '' }, { top: false })),
      model.KINDS.filter(([k]) => S.kind === k || kindsUsed.some(x => x[0] === k)).map(([k, , icon]) => chip(S.kind === k, `${icon} ${KIND_CHIP[k]}`, () => go({ kind: S.kind === k ? '' : k }, { top: false })))),
    (actsUsed.length > 1 || S.act) && h('div', { class: 'chips', role: 'group', 'aria-label': capital(actWord()) },
      chip(!S.act, allActs(), () => go({ act: '' }, { top: false })),
      actsUsed.concat(S.act && !actsUsed.some(a => a.id === S.act) && byId('acts', S.act) ? [byId('acts', S.act)] : []).map(a => chip(S.act === a.id,
        [h('span', { class: 'bk-swatch', style: safeColor(a.color) ? `--act:${safeColor(a.color)}` : null, 'aria-hidden': 'true' }), a.name || 'Unnamed act'],
        () => go({ act: S.act === a.id ? '' : a.id }, { top: false })))));
}

// "Coming up", under every view: the next bookings, soonest first; on the same day, in the order the bands play.
function comingUp() {
  const { S, go } = X;
  const list = upcoming().filter(X.passes), shown = S.all ? list : list.slice(0, 8);
  return [
    h('h3', { class: 'bk-agenda-head' }, X.filtersOn() ? 'Coming up (filtered)' : 'Coming up'),
    list.length
      ? h('div', { class: 'bk-agenda' },
        h('div', { class: 'list' }, shown.map(agendaCard)),
        list.length > 8 && h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost small', id: 'bk-agenda-more', onclick: () => go({ all: !S.all }, { top: false }) }, S.all ? 'Show fewer' : `Show all (${list.length})`)))
      : empty(X.filtersOn() ? 'Nothing coming up with these filters.' : moneyShown() ? 'Nothing coming up. Add a show, a studio session or a rehearsal, or tap a date on the calendar.' : 'Nothing coming up. Add a show you’re going to, or tap a date on the calendar.',
        X.filtersOn() ? h('button', { type: 'button', class: 'btn ghost', onclick: () => go({ kind: '', act: '' }, { top: false }) }, 'Clear the filters')
          : moneyShown() ? h('button', { type: 'button', class: 'btn primary', onclick: () => X.newBooking({}) }, '+ New booking') : h('button', { type: 'button', class: 'btn primary', onclick: () => X.newBooking({ kind: 'show' }) }, '+ Add a show')),
  ];
}

function agendaCard(b) {
  const d = parseISO(b.date), n = daysUntil(b.date);
  const when = n < 0 ? (lastDay(b) < todayISO() ? '' : 'On now') : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 14 ? `In ${n} days` : ''; // one that is over (the search lists those too) says nothing here
  const card = h('button', { type: 'button', class: 'card tap bk-card', style: actStyle(b), 'data-id': b.id, title: 'Tap to open; press and hold to delete',
    onclick: () => { if (!wasHeld(card)) X.showBooking(b); } },
    h('span', { class: 'bk-date', 'aria-hidden': 'true' },
      h('span', null, d.toLocaleDateString(undefined, { weekday: 'short' })), h('b', null, d.getDate()), h('span', null, d.toLocaleDateString(undefined, { month: 'short' }))),
    h('span', { class: 'sr-only' }, dateRange(b, fmtLong) + '. '),
    h('span', { class: 'bk-card-main' },
      h('span', { class: 'bk-card-top' }, h('strong', { class: 'bk-card-title' }, h('span', { 'aria-hidden': 'true' }, model.kindIcon(b.kind) + ' '), model.bookingTitle(b)), pill(b.status)),
      formerlyLine(b),
      h('span', { class: 'bk-card-sub muted small' }, [when, multi(b) && `to ${fmtShort(lastDay(b))}`, timeLine(b), venueLine(b) && `📍 ${venueLine(b)}`].filter(Boolean).join(' · ')),
      ...cardExtras(b)));
  return X.holdToDelete(card, b);
}
// The same card for a list outside the calendar (the search, js/search.js): drawn by agendaCard, so it reads exactly as
// it does under Coming up, but with no press-and-hold to delete. The card's own tap opens the booking inside this
// page, so the list it goes in takes the tap itself: a click listener in the capture phase that stops the click there.
export function bookingCard(b) {
  const page = X;
  X = { ...page, holdToDelete: el => el };
  try { const card = agendaCard(b); card.removeAttribute('title'); return card; } finally { X = page; }
}

// The row of view buttons scrolls sideways inside itself on a narrow phone. Once it is on the page, the pressed button
// is brought into sight by moving the row (scrollIntoView would move the page).
function showPressed(row) {
  queueMicrotask(() => {
    const on = row.isConnected && row.querySelector('.on');
    if (!on || row.scrollWidth <= row.clientWidth) return;
    const r = row.getBoundingClientRect(), b = on.getBoundingClientRect();
    if (b.left < r.left) row.scrollLeft -= r.left - b.left + 6;
    else if (b.right > r.right) row.scrollLeft += b.right - r.right + 6;
  });
}

// Swipe a view left or right for what comes next or came before (a scroll up or down is left alone).
function swipe(el, step) {
  let x = null, y = 0, at = 0;
  el.addEventListener('pointerdown', e => { if (e.button === 0) { x = e.clientX; y = e.clientY; } });
  el.addEventListener('pointerup', e => {
    if (x == null) return;
    const dx = e.clientX - x, dy = e.clientY - y; x = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) { at = Date.now(); setTimeout(() => step(dx < 0 ? 1 : -1), 0); }
  });
  el.addEventListener('pointercancel', () => { x = null; });
  el.addEventListener('click', e => { if (Date.now() - at < 500) { e.stopPropagation(); e.preventDefault(); } }, true); // the tap that ends a swipe opens nothing
}

/* ------------------------------- month and two weeks: day squares ------------------------------- */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function squares(mode, R, all, today, title) {
  const two = mode === 'two', cells = [];
  const lead = two ? 0 : (parseISO(R.first).getDay() + 6) % 7; // Monday first
  for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'day blank', 'aria-hidden': 'true' }));
  for (const iso of R.days) cells.push(dayCell(iso, all, today, two, two && iso === R.first));
  const grid = h('div', { class: 'cal bk-cal' + (two ? ' bk-cal-two' : ''), role: 'group', 'aria-label': title },
    WEEKDAYS.map(w => h('div', { class: 'wd', 'aria-hidden': 'true' }, w)), cells);
  arrowKeys(grid, mode, R);
  return grid;
}

// The order inside a day's square: a booking over several days first (by its first day, then its id), so its bar keeps
// its row from one square to the next whatever its times; then the day's own bookings in the order the bands play.
const squareOrder = list => [
  ...list.filter(multi).sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id))),
  ...list.filter(b => !multi(b)).sort(byPlay),
];

// A day square. tall: a square of the two weeks, with room for each booking's time and name on every screen; named:
// its number also says the month (the first of the fourteen, and any 1st).
function dayCell(iso, all, today, tall = false, named = false) {
  const list = squareOrder(all.filter(b => covers(b, iso)));
  const d = parseISO(iso), dow = (d.getDay() + 6) % 7;
  // A booking over several days shows on each: its line runs on from the day before, and the name shows on the first
  // day and at the start of each week row.
  const seg = b => (!multi(b) ? '' : iso === b.date ? ' bk-seg-start' : iso === lastDay(b) ? ' bk-seg-end' : ' bk-seg-mid');
  const titled = b => !multi(b) || iso === b.date || dow === 0 || (!tall && iso.endsWith('-01')); // and in the month on the 1st, for one that began last month (the two weeks run on across a 1st)
  // The month's line leads with where (the act is its colour): a typed title, else the venue, else the act or client.
  const short = b => `${model.kindIcon(b.kind)} ${b.title || model.venueOf(b).name || model.bookingTitle(b)}`;
  // Two weeks: the time the band plays, then who: a typed title, else the act, the client, the venue, the kind. The
  // time is a part of its own, so a narrow square cuts the name short and never the time.
  const timed = b => [playClock(b) && [h('span', { class: 'bk-mini-time' }, playClock(b)), ' '], h('span', { class: 'bk-mini-name' }, b.title || model.actName(b.actId) || b.client || model.venueOf(b).name || model.kindLabel(b.kind))];
  // A line that runs on from the day before carries no name: a no-break space keeps it a line high (in the two weeks, as
  // high as the line it runs on from, where a phone puts the time over the name).
  const blank = b => (tall && playClock(b) ? [h('span', { class: 'bk-mini-time' }, '\u00a0'), h('span', { class: 'bk-mini-name' }, '\u00a0')] : '\u00a0');
  const mini = b => h('span', { class: `bk-mini ${tone(b.status)}${seg(b)}`, style: actStyle(b) }, !titled(b) ? blank(b) : tall ? timed(b) : short(b));
  const dot = b => h('i', { class: `bk-dot ${tone(b.status)}${multi(b) ? ' bk-bar' + seg(b) : ''}`, style: actStyle(b) });
  // A square has no room to write "Didn’t go" (a phone shows a dot, or a time): its spoken name says it, after the status.
  // Nor for "formerly The Night Owls" (a booking from before its act changed its name): that follows the booking's name.
  const label = `${fmtLong(iso)}${iso === today ? ', today' : ''}: ${list.length ? list.map(b => `${tall && playClock(b) ? playClock(b) + ' ' : ''}${model.bookingTitle(b)}${model.formerlyNote(b) ? ', ' + model.formerlyNote(b) : ''} (${model.statusLabel(b.status)}${didntGo(b) ? ', didn’t go' : ''})`).join(', ') : 'nothing booked'}`;
  return h('button', {
    type: 'button', class: 'day bk-day' + (tall ? ' bk-day-tall' : '') + (iso === today ? ' today' : '') + (list.length ? ' has' : ''), 'data-date': iso, 'aria-label': label,
    'aria-current': iso === today ? 'date' : null, onclick: () => X.go({ mode: 'day', day: iso }),
  },
    h('span', { class: 'num' }, tall && (named || d.getDate() === 1) ? monthDay(d) : d.getDate()),
    list.length > 0 && h('span', { class: 'bk-minis' }, list.slice(0, 3).map(mini), list.length > 3 && h('span', { class: 'more' }, `+${list.length - 3}`, h('span', { class: 'bk-more-word' }, ' more'))),
    !tall && list.length > 0 && h('span', { class: 'bk-dots', 'aria-hidden': 'true' }, list.slice(0, 4).map(dot), list.length > 4 && h('span', { class: 'more' }, '+')));
}

// Arrow keys move between days (up and down by a week). Past the edge of the month the month follows; past the edge
// of the two weeks they step as ‹ › do (so they always start on a Monday), and the focus lands on the day headed for.
function arrowKeys(grid, mode, R) {
  grid.addEventListener('keydown', e => {
    const cell = e.target.closest && e.target.closest('[data-date]');
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!cell || !step) return;
    e.preventDefault(); // the section menu keeps its arrows for the rest of the page
    const iso = addDays(cell.dataset.date, step);
    if (mode === 'two') { if (iso < R.first || iso > R.last) X.go({ day: addDays(X.S.day, iso < R.first ? -14 : 14) }, { top: false }); }
    else if (iso.slice(0, 7) !== cell.dataset.date.slice(0, 7)) X.go({ day: iso }, { top: false });
    const root = X.root(), next = root && root.querySelector(`[data-date="${iso}"]`);
    if (next) next.focus();
  });
}

/* ------------------------------- week: a list for each day ------------------------------- */
function weekList(R, all, today) {
  return h('div', { class: 'bk-week' }, R.days.map(iso => {
    const list = all.filter(b => covers(b, iso)).sort(byPlay), now = iso === today;
    return h('section', { class: 'bk-wday' + (now ? ' today' : '') + (list.length ? '' : ' bk-wday-empty') },
      h('h3', { class: 'bk-wday-h' }, h('button', { type: 'button', class: 'bk-wday-head', id: 'bk-wd-' + iso, 'data-date': iso, 'aria-label': openDay(iso, today), 'aria-current': now ? 'date' : null,
        onclick: () => X.go({ mode: 'day', day: iso }) }, dayShort(iso), now && ' · today')),
      list.length ? h('div', { class: 'bk-wrows' }, list.map(b => weekRow(b, iso)))
        : h('p', { class: 'muted bk-none' }, X.filtersOn() ? 'Nothing on with these filters' : 'Nothing on'));
  }));
}

// A booking on one day of the week (class bk-ev: an entry in the view's own body, never a Coming up card). A booking
// over several days has a row on each of them.
function weekRow(b, iso) {
  const time = playClock(b);
  const sub = [multi(b) && `to ${fmtShort(lastDay(b))}`, fallBack(b).toLowerCase(), venueLine(b), model.isAfterMidnight(b) && 'after midnight', !time && 'no time yet'].filter(Boolean).join(' · ');
  const row = h('button', { type: 'button', class: `bk-wrow bk-ev ${tone(b.status)}`, id: `bk-ev-${b.id}-${iso}`, 'data-id': b.id, style: actStyle(b), title: 'Tap to open; press and hold to delete',
    onclick: () => { if (!wasHeld(row)) X.showBooking(b, iso); } },
    h('span', { class: 'bk-wrow-time' }, time ? time + ' ' : h('span', { 'aria-hidden': 'true' }, '—')), // "no time yet" is in the line under the name
    h('span', { class: 'bk-wrow-main' },
      h('span', { class: 'bk-wrow-top' }, h('strong', { class: 'bk-wrow-title' }, h('span', { 'aria-hidden': 'true' }, model.kindIcon(b.kind) + ' '), model.bookingTitle(b)), pill(b.status)),
      formerlyLine(b),
      sub && h('span', { class: 'bk-wrow-sub muted small' }, sub),
      ...cardExtras(b)));
  return X.holdToDelete(row, b);
}

/* ------------------------------- three days and one day: the time grid ------------------------------- */
const EVENING = [18 * 60, 26 * 60]; // the hours shown when nothing asks for more: 18:00 to 02:00
const NIGHT = [6 * 60, 30 * 60];    // the night clock: 06:00 to 06:00 the next morning
const MIN_BLOCK = 26;               // px: a block is never shorter, so its name can be read and tapped
// A block's span in night minutes. A show starts at the time it is sorted by and lasts its set length when that is
// the on-stage time and a length is set, else an hour; anything else runs from its start to its finish (an hour with
// no finish). What would run past 06:00 is cut there.
function blockSpan(b) {
  const start = model.playKey(b);
  let length = 60;
  if (b.kind === 'show') { if (model.playField(b) === 'setTime' && Number(b.setLength) > 0) length = Number(b.setLength); }
  else if (model.nightMin(b.end) != null) length = model.minutesBetween(model.playTime(b), b.end) || 60;
  return { start, end: Math.min(NIGHT[1], start + length) };
}

function timeGrid(mode, R, all, today) {
  const one = mode === 'day', hh = one ? 52 : 44; // px an hour
  const inView = all.filter(b => R.days.some(d => covers(b, d))); // on one of the days shown (a date that is no day, a 30 February from an old backup, is on none)
  // Bookings with no time, and every booking over several days, sit in the "any time" row at the top.
  const loose = inView.filter(b => multi(b) || model.playKey(b) == null), timed = inView.filter(b => !loose.includes(b));
  const heads = !one && h('div', { class: 'bk-grid-heads' }, h('span', { 'aria-hidden': 'true' }), R.days.map(iso => { const now = iso === today;
    return h('button', { type: 'button', class: 'bk-grid-head' + (now ? ' today' : ''), id: 'bk-gh-' + iso, 'data-date': iso, 'aria-label': openDay(iso, today), 'aria-current': now ? 'date' : null, onclick: () => X.go({ mode: 'day', day: iso }) }, dayShort(iso)); }));
  const frame = (...rows) => h('div', { class: 'bk-grid', style: `--n:${R.days.length};--hh:${hh}px` }, heads, rows);
  if (!inView.length) {
    const none = h('p', { class: 'muted bk-none' }, X.filtersOn() ? 'Nothing on with these filters.' : one ? 'Nothing booked on this day.' : 'Nothing on these three days.');
    return one ? none : [frame(), none]; // three days keep their names, each a way into its day
  }
  const any = loose.length > 0 && anyRow(loose, R, one);
  // Nothing for the hours: the row alone, and "No times set yet." unless a pill shows a time (a festival over two days
  // with a set at 16:30 has one, and is up there for its days, not for want of a time).
  if (!timed.length) return [frame(any), loose.every(b => model.playKey(b) == null) && h('p', { class: 'muted small bk-grid-note' }, 'No times set yet.')];

  // The hours fit what is on: the evening, widened to the hour the earliest block starts in and to the first full hour
  // at or after the latest end. Every day of the grid shares them.
  const spans = new Map(timed.map(b => [b, blockSpan(b)]));
  let [from, to] = EVENING;
  for (const s of spans.values()) { from = Math.min(from, Math.floor(s.start / 60) * 60); to = Math.max(to, Math.ceil(s.end / 60) * 60); }
  from = Math.max(NIGHT[0], from); to = Math.min(NIGHT[1], to);
  const height = (to - from) / 60 * hh;
  const hours = h('div', { class: 'bk-hours', 'aria-hidden': 'true' }, Array.from({ length: (to - from) / 60 }, (_, i) => {
    const min = from + i * 60;
    return h('span', { class: 'bk-hour', style: `top:${i * hh}px` }, model.nightClock(min), min >= 1440 && h('small', { class: 'bk-next' }, '+1'));
  }));
  const column = iso => {
    // In playing order, so Tab and a screen reader meet the blocks as the night runs.
    const items = timed.filter(b => b.date === iso).sort(byPlay).map(b => {
      const s = spans.get(b), tall = Math.max(MIN_BLOCK, (s.end - s.start) / 60 * hh);
      return { b, top: Math.min((s.start - from) / 60 * hh, height - tall), tall }; // a short block at the very end stays inside the grid
    });
    // Blocks that overlap sit side by side: each takes the first free lane, and each run of overlapping blocks is as
    // wide as its own number of lanes. By where the blocks are drawn (their times; any kind, any status), so a block
    // is never under another; two that only touch share a lane.
    let run = [], runEnd = 0;
    const lay = () => {
      const lanes = [];
      for (const it of run) { let k = lanes.findIndex(end => end <= it.top + 0.01); if (k < 0) k = lanes.length; lanes[k] = it.top + it.tall; it.lane = k; }
      for (const it of run) it.lanes = lanes.length;
      run = [];
    };
    for (const it of [...items].sort((p, q) => p.top - q.top)) {
      if (run.length && it.top + 0.01 >= runEnd) lay();
      runEnd = run.length ? Math.max(runEnd, it.top + it.tall) : it.top + it.tall;
      run.push(it);
    }
    lay();
    return h('div', { class: 'bk-col' + (iso === today ? ' today' : ''), 'data-day': iso, role: 'group', 'aria-label': fmtLong(iso) + (iso === today ? ', today' : '') }, items.map(it => block(it, iso, one)));
  };
  return frame(any, h('div', { class: 'bk-grid-body', style: `height:${height}px` }, hours, R.days.map(column)));
}

const px = n => Math.round(n * 100) / 100;
// A booking at the time the band plays. In the Day view there is room for where it is, or "Didn’t go" in its place
// (written for the eye there: a screen reader has it from the hidden words, once, in every view).
function block({ b, top, tall, lane, lanes }, iso, one) {
  const by = fallBack(b), where = one && !didntGo(b) && venueLine(b);
  const style = [actStyle(b), `top:${px(top)}px`, `height:${px(tall)}px`, `left:calc(${px(lane * 100 / lanes)}% + 1px)`, `width:calc(${px(100 / lanes)}% - 2px)`].filter(Boolean).join(';');
  // Many sets at once (a festival's stages): past four side by side in three days, or eight in one, a block gives up
  // its padding, so each stays in its own lane and none runs over the next day.
  const el = h('button', { type: 'button', class: `bk-ev bk-block ${tone(b.status)}` + (lanes > (one ? 8 : 4) ? ' bk-block-slim' : ''), id: `bk-ev-${b.id}-${iso}`, 'data-id': b.id, style, title: 'Tap to open; press and hold to delete',
    onclick: () => { if (!wasHeld(el)) X.showBooking(b, iso); } },
    h('span', { class: 'bk-block-in' },
      h('strong', { class: 'bk-block-title' }, h('span', { class: 'bk-ico', 'aria-hidden': 'true' }, model.kindIcon(b.kind) + ' '), model.bookingTitle(b)),
      // "21:00", "Doors 20:00", "21:00 · The Crown": a small block keeps the time and lets the words around it go
      h('span', { class: 'bk-block-sub' }, ' ', by && h('span', { class: 'bk-block-by' }, by + ' '), playClock(b),
        where && h('span', { class: 'bk-block-where' }, ` · ${where}`), one && didntGo(b) && h('span', { class: 'bk-block-went', 'aria-hidden': 'true' }, ' · Didn’t go'))),
    said(b));
  return X.holdToDelete(el, b);
}

// The "any time" row: a pill for each booking with no time, and one for each booking over several days, across its
// days in view (its time before its name when it has one).
function anyRow(loose, R, one) {
  const at = iso => Math.max(0, R.days.indexOf(iso));
  // c0 to c1: the columns it lies across; first the pills that start soonest, a longer one before a shorter.
  const items = loose.map(b => { const before = b.date < R.first, after = lastDay(b) > R.last, c0 = before ? 0 : at(b.date); return { b, before, after, c0, c1: Math.max(c0, after ? R.days.length - 1 : at(lastDay(b))) }; })
    .sort((p, q) => p.c0 - q.c0 || (q.c1 - q.c0) - (p.c1 - p.c0) || byPlay(p.b, q.b));
  const pillOf = ({ b, before, after, c0, c1 }) => {
    const time = playClock(b), days = multi(b) ? dateRange(b, fmtLong) : one ? '' : fmtLong(b.date);
    const el = h('button', { type: 'button', class: `bk-ev bk-ev-any ${tone(b.status)}` + (before ? ' bk-any-from' : '') + (after ? ' bk-any-on' : ''), id: `bk-ev-${b.id}-any`, 'data-id': b.id,
      style: [actStyle(b), `grid-column:${c0 + 1} / ${c1 + 2}`].filter(Boolean).join(';'), title: 'Tap to open; press and hold to delete',
      onclick: () => { if (!wasHeld(el)) (multi(b) ? X.showBooking(b) : X.showBooking(b, b.date)); } },
      h('span', { class: 'bk-any-text' }, time && time + ' ', h('span', { class: 'bk-ico', 'aria-hidden': 'true' }, model.kindIcon(b.kind) + ' '), model.bookingTitle(b), one && multi(b) && ` · to ${fmtShort(lastDay(b))}`),
      said(b, days));
    return X.holdToDelete(el, b);
  };
  return h('div', { class: 'bk-any', role: 'group', 'aria-label': 'Any time' }, h('span', { class: 'bk-any-label', 'aria-hidden': 'true' }, 'any time'), h('div', { class: 'bk-any-pills' }, items.map(pillOf)));
}

/* ------------------------------- the ? walkthrough, for the calendar as it is drawn now ------------------------------- */
const VIEW_HELP = {
  month: 'Each line or dot is a booking in its act’s colour. Hollow or dashed means a hold or an offer. Tap a day to open it; swipe, or use ‹ ›, for other months.',
  two: 'Two weeks of days, each booking with the time the band plays. Tap a day to open it; swipe, or use ‹ ›, to move two weeks.',
  week: 'Each day lists what is on, in the order the bands play. Tap a booking to open it, or a day’s name to see that day alone.',
  three: 'Hours run down the side and each booking sits at the time the band plays. Sets that overlap sit side by side; anything without a time is in the row at the top.',
};
// The time grid's step says what is drawn: hours only when there are some (a day or three with only the row at the
// top have none), and three days with nothing on are only their days' names. An empty Day has no grid and no step.
const GRID_HELP = {
  untimed: 'Nothing here has a time yet, so each booking sits in the row at the top. Once one has a time, hours run down the side and it sits at that time.',
  top: 'A booking over several days, or one without a time, sits in the row at the top. One on a single day with a time sits at that time, with hours down the side.',
  empty: 'Three days with nothing on. Tap a day’s name to see that day alone, or use ‹ › to move three days.',
};
function gridHelp(mode) {
  const panel = document.querySelector('.bk-calview .bk-cal-panel');
  if (!panel || (mode !== 'three' && mode !== 'day') || panel.querySelector('.bk-grid-body')) return VIEW_HELP[mode] || VIEW_HELP.three;
  if (panel.querySelector('.bk-grid .bk-ev')) return panel.querySelector('.bk-grid-note') ? GRID_HELP.untimed : GRID_HELP.top;
  return mode === 'three' ? GRID_HELP.empty : VIEW_HELP.three;
}
export function calendarSteps(ctx) {
  X = ctx;
  const mode = modeOf(X.S);
  return [
    { title: 'New booking', text: 'Add a show, a studio session, a rehearsal or anything else in the diary.', target: ['.bk-new'] },
    { title: 'Export calendar', text: moneyShown() ? 'Saves your upcoming bookings as a calendar file for Apple, Google or Outlook Calendar, or to send to the band. No fees or deals go in it.' : 'Saves your upcoming bookings as a calendar file for Apple, Google or Outlook Calendar.', target: ['.bk-export'] },
    { title: 'Filters', text: 'Show one act, or one kind of booking, on the calendar and in the list.', target: ['.bk-filters'] },
    { title: 'Views', text: 'Month, 2 weeks, Week, 3 days or Day. Gdex opens on the one you picked here last.', target: ['.bk-views'] },
    // A day with nothing on has no grid: no hours to speak of, and nothing to tap, so those two steps are skipped there.
    { title: 'The calendar', text: gridHelp(mode), target: [mode === 'day' ? '.bk-dayview .bk-grid' : '.bk-cal-panel'] },
    ...(mode === 'day' ? [
      { title: 'Add to this day', text: 'A new booking with this date already filled in.', target: ['.bk-new-day'] },
      { title: pageName(), text: 'Tap one to open it. Press and hold one for three seconds to delete it.', target: ['.bk-dayview .bk-grid'] },
    ] : []),
    { title: 'Coming up', text: 'Your next bookings, soonest first; on the same day, in the order the bands play. Tap one to open it. Press and hold one for three seconds to delete it.', target: ['.bk-agenda', '.bk-calview > .empty'] },
  ];
}
