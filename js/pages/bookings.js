// Bookings: the heart of Tourbook. Two views kept in module state (S): the calendar (js/bookings-cal.js: the month with
// "Coming up" under it, or one day) and a booking's own page (its header, then one fold-down box per block from
// js/blocks/index.js, and the boxes the role keeps out of the way in one "More boxes" fold below them), with the forms
// and sheets that make, copy and delete a booking.
// Adapted from Vdex's bookings page: press and hold to delete, duplicate.
import { h, nodes, todayISO, fmtLong, fmtShort, toast, announce, sheet, backBtn, hold, telUrl } from '../util.js';
import { db, byId, update, upsert, remove, upcoming, covers, lastDay, canChange } from '../store.js';
import * as model from '../model.js';
import { openForm } from '../form.js';
import { mapButtons } from '../map.js';
import { saveFile, fileName } from '../print.js';
import { sheetTutorial } from '../tour.js';
import { haptic, menuWords } from '../a11y.js';
import { blocksFor, foldedFor } from '../blocks/index.js';
import { bookingIcs, allIcs, runOfDay } from '../ics.js';
import { openAct, logSighting } from './acts.js';
import { venueChecks, openVenue } from './venues.js';
import { kindHelp, kindOrder, moneyShown, blockShown, pageOpt, sectionName, actWord, offMenu, askSeen } from '../roles.js'; // askSeen: for the score row (who is asked "Did you see them?")
import { isoOk, addDays, daysBetween, actOf, actStyle, tone, multi, dateRange, plural, sortByName, capital, KIND_CHIP, calMode } from '../bookings-kit.js';
import { calendarView, calendarSteps } from '../bookings-cal.js';
import { rulesFull } from '../venues-rules.js';
import { formerlyLine } from '../bookings-kit.js'; // "formerly The Night Owls" under the name of a booking from before its act changed its name
// The licence (decisions §9 and the owner's answer 1): a free Audiophile without the working roles (no licence, and its
// free days not running) keeps its gigs; the working boxes under More boxes, new studio sessions and rehearsals, and
// changes to the ones already here come with the working roles. workMark() is null whenever none of that applies
// (licences off, a working role in use, a licence or free days running), and then everything is as it always was.
import { workMark, gateWork, mayWork } from '../licence-state.js';
// The band and venue boxes take typing (the owner, 15 Nov 2026): the saved names that match are listed to pick, and a
// name that is in no list is asked about before the save ("Add to your lists?").
import { boxKey, exactOf } from '../combo.js';
import { canChangeQuietly } from '../store.js';
import { addActNamed, eatSecondClick } from './acts.js';
import { addVenueNamed } from './venues.js';

/* ------------------------------- words ------------------------------- */
const NOUN = { show: 'show', session: 'studio session', rehearsal: 'rehearsal', other: 'diary entry' };
const KIND_HELP = {
  show: 'A gig: load-in, set times, the deal, guest list and settlement.',
  session: 'Studio time: the rate, the songs, takes and what to deliver.',
  rehearsal: 'Band practice: the room, the times and the setlist.',
  other: 'Anything else in the diary: a radio slot, a shoot, a meeting.',
};
const STATUS_HELP = {
  hold: 'Date pencilled in, not confirmed yet.', offer: 'An offer to answer.', confirmed: 'Agreed and booked.',
  advanced: 'Details confirmed with the promoter.', done: 'It happened.', settled: 'Paid or settled up.',
  cancelled: 'Off. Stays in your records, out of clashes and money.',
};
// A role without money has no money to keep a cancelled booking out of.
const statusHelp = id => (id === 'cancelled' && !moneyShown() ? 'Off. Stays in your records, out of clashes.' : STATUS_HELP[id] || '');
// The statuses to pick from for a kind. A role without money is not offered Paid / settled (it would settle a show it
// never saw a deal for), unless the booking already has it (cur), so it can stay as it is.
const statusChoices = (kind, cur) => model.statusesFor(kind).filter(([id]) => moneyShown() || id !== 'settled' || id === cur);
const CONTACT_ROLES = ['Promoter', 'Booking agent', 'Venue manager', 'Production manager', 'Studio manager', 'Engineer', 'Producer', 'Client', 'Manager', 'Festival booker'];

/* ------------------------------- helpers ------------------------------- */
// Dates, an act's colour and the status pill are in js/bookings-kit.js, shared with the calendar.
const filtersOn = () => !!(S.kind || S.act);
const passes = b => (!S.kind || b.kind === S.kind) && (!S.act || b.actId === S.act);
// "Line-up & gear, Advance checklist and Guest list".
const andList = list => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
// A new booking's status. A show or a studio session starts on hold (pencilled in), the rest confirmed. A role without
// money (a scout, a gig-goer) is going to things, not selling them: everything it adds is confirmed, so a show it went
// to is offered on the act's card to score.
const firstStatus = kind => (!moneyShown() ? 'confirmed' : kind === 'show' || kind === 'session' ? 'hold' : 'confirmed');

/* ------------------------------- state ------------------------------- */
// view: 'cal' (the calendar, in the view S.mode: 'month' | 'two' | 'week' | 'three' | 'day') or 'booking' (S.id).
// S.day is the one anchor day every calendar view is drawn around (the month shown is its month), and it is always a
// valid date. kind and act are the filter chips; all: Coming up in full.
const S = { view: 'cal', mode: calMode(), day: todayISO(), id: null, kind: '', act: '', all: false, drawn: '' };
const OPEN = new Map(); // booking id → Set of open block ids, and 'more' for the More boxes fold (survives every redraw)
// The boxes a role opens at first (js/roles.js pages.bookings.open: { show: ['deal', 'advance'] }), the first time a
// booking is drawn in a visit. After that, what the person opens and closes is what stays open.
const firstOpen = id => {
  const b = byId('bookings', id), want = b && (pageOpt('bookings', 'open', {}) || {})[b.kind];
  return b && Array.isArray(want) ? want.filter(x => blocksFor(b.kind).some(blk => blk.id === x)) : [];
};
const openSet = id => { if (!OPEN.has(id)) OPEN.set(id, new Set(firstOpen(id))); return OPEN.get(id); };
const FILL = new WeakMap(); // a box (details element) → fills its body now, if it is not filled yet
let ROOT = null;

// What identifies a control across one of this page's own redraws (a filter chip, a month arrow, a day). An id wins
// over a date.
const keyOf = el => (!el || !ROOT || el === ROOT || !ROOT.contains(el) ? null
  : el.id ? '#' + el.id : el.dataset && el.dataset.date ? 'd' + el.dataset.date : el.getAttribute('aria-label') ? 'a' + el.getAttribute('aria-label') : 't' + el.tagName + (el.textContent || '').trim().slice(0, 60));
const viewKey = () => [S.view, S.id, S.day, S.mode].join('|');
function draw(focus = false) {
  if (!ROOT) return;
  if (!isoOk(S.day)) S.day = todayISO(); // every view does its date sums on S.day; a booking can lack a date
  if (S.view === 'booking' && !byId('bookings', S.id)) { S.view = 'cal'; S.mode = 'day'; focus = true; } // deleted (here or elsewhere): its day
  if (S.act && !byId('acts', S.act)) S.act = '';
  const was = focus ? null : keyOf(document.activeElement);
  ROOT.replaceChildren(S.view === 'booking' ? bookingPage(byId('bookings', S.id)) : calendarView(CTX));
  if (was) { const again = [...ROOT.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')].find(x => keyOf(x) === was); if (again) again.focus({ preventScroll: true }); }
  scoreRefocus(focus);
  // The back button's shine runs when a page is arrived at, not on the redraw every change causes.
  const key = viewKey();
  if (key !== S.drawn) ROOT.querySelectorAll('.back-btn').forEach(el => el.classList.add('shine'));
  S.drawn = key;
  const lost = HEAD_NEXT && (!document.activeElement || document.activeElement === document.body); HEAD_NEXT = false;
  if (focus || lost) { const head = ROOT.querySelector('[data-view-head]'); if (head) head.focus({ preventScroll: true }); }
}
// Move to another view (or day): merges p into S and draws. top: for a new view, go to the top and put the focus on
// its heading ([data-view-head]).
function go(p, { top = true } = {}) {
  const was = viewKey();
  Object.assign(S, p);
  draw(top && was !== viewKey());
  if (top) window.scrollTo({ top: 0 });
}
// The day the page last knew as today. js/app.js asks dayTurned() at midnight and whenever Tourbook comes back into sight
// (an installed app is seldom loaded afresh): when today has moved on, a calendar that was on today moves on with it (a
// calendar moved to another day, or a booking's page with its day for Back, stays where it is), and app.js draws the
// page again.
let todayWas = todayISO();
export function dayTurned() {
  const t = todayISO();
  if (t === todayWas) return false;
  if (S.view === 'cal' && S.day === todayWas) S.day = t;
  todayWas = t;
  return true;
}
// A booking's page. day: the day it was tapped on, so Back returns there (a festival opened from its second day);
// else the day in view when the booking covers it, else its first day. A booking with no date keeps the day in view.
const showBooking = (b, day) => go({ view: 'booking', id: b.id, day: day && covers(b, day) ? day : covers(b, S.day) ? S.day : isoOk(b.date) ? b.date : S.day });

export const bookings = {
  id: 'bookings', label: 'Bookings', icon: '📅',
  render(root) { ROOT = root; draw(); },
  tutorial: () => (S.view === 'booking' && byId('bookings', S.id) ? bookingSteps(byId('bookings', S.id)) : calendarSteps(CTX)),
};

// Go to Bookings and show that booking's page. Resolves (true) once it is drawn; false when there is no such booking.
// box: a box to open on it and bring into view, with the focus on its heading ('money': its quote and invoice, as the
// search opens one); one under More boxes opens the fold too. A box the booking does not show leaves the page as usual.
export function openBooking(id, { box = '' } = {}) {
  const b = byId('bookings', id);
  if (!b) { toast('That booking is not here any more.'); return Promise.resolve(false); }
  Object.assign(S, { view: 'booking', id: b.id, day: isoOk(b.date) ? b.date : S.day });
  const folded = !!box && foldedFor(b.kind).some(x => x.id === box);
  if (box && (folded || blocksFor(b.kind).some(x => x.id === box))) { openSet(b.id).add(box); if (folded) openSet(b.id).add('more'); }
  const toBox = () => { const el = box && document.getElementById('blk-' + box), sum = el && el.querySelector('summary'); if (!sum) return; sum.focus({ preventScroll: true }); el.scrollIntoView({ block: 'start' }); };
  const here = () => window.logiPage && window.logiPage() === 'bookings' && ROOT && ROOT.isConnected;
  if (here()) { draw(true); window.scrollTo({ top: 0 }); toBox(); return Promise.resolve(true); }
  return Promise.resolve(window.logiGo ? window.logiGo('bookings') : null).then(() => {
    const head = ROOT && ROOT.isConnected && ROOT.querySelector('[data-view-head]');
    if (head) head.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
    toBox();
    return !!byId('bookings', id);
  });
}

// Open the new-booking form, prefilled ({ kind, actId, venueId, date, setlistId }). Without a kind, asks for one first.
// A free Audiophile without the working roles adds a show, whatever was asked for (+ New, a day's + New, a venue, a link).
export function newBooking(preset = {}) {
  const p = preset && typeof preset === 'object' ? preset : {};
  if (showsOnly()) editBooking(blank('show', p));
  else if (p.kind && model.KINDS.some(k => k[0] === p.kind)) editBooking(blank(p.kind, p));
  else chooseKind(p);
}
// The owner's answer 1: only shows to add, and the studio sessions and rehearsals already here kept to look at.
const WORK_KINDS = ['session', 'rehearsal'];
const showsOnly = () => !!workMark();
const workLocked = b => !!(b && WORK_KINDS.includes(b.kind) && showsOnly());
// A change to such a booking goes through the licence: at once when it may be changed, else the free days start (then
// the change goes on) or the licence is offered.
const viaWork = (b, fn) => (workLocked(b) ? gateWork(fn, b.kind) : fn());

/* ------------------------------- new / edit ------------------------------- */
function blank(kind, p = {}) {
  const v = p.venueId ? byId('venues', p.venueId) : null;
  return {
    kind, status: firstStatus(kind), title: '',
    actId: p.actId && byId('acts', p.actId) ? p.actId : db.acts.length === 1 && kind !== 'other' ? db.acts[0].id : '',
    date: isoOk(p.date) ? p.date : todayISO(), endDate: '',
    venueId: v ? v.id : '', venueName: '', address: '',
    contact: v ? { name: v.contact || '', role: '', phone: v.phone || '', email: v.email || '' } : {},
    setlistId: p.setlistId && byId('setlists', p.setlistId) ? p.setlistId : '',
    people: [], gear: [], gearQty: {}, kits: [], checks: {},
    ...(kind === 'session' ? { rateUnit: 'hour' } : {}),
  };
}

// The kinds in the role's order, its usual kind first (a producer's studio session, a scout's show), with its own words.
function chooseKind(preset = {}) {
  const kinds = kindOrder().map(id => model.KINDS.find(k => k[0] === id)).filter(Boolean);
  const { close } = sheet('What are you booking?', h('div', { class: 'bk-kinds' },
    kinds.map(([id, label, icon]) => h('button', { type: 'button', class: 'card tap bk-kind', 'data-kind': id, onclick: () => { close(); editBooking(blank(id, preset)); } },
      h('span', { class: 'bk-kind-ico', 'aria-hidden': 'true' }, icon),
      h('span', { class: 'bk-kind-text' }, h('strong', null, label), h('span', { class: 'muted small' }, kindHelp(id) || KIND_HELP[id]))))));
  setTimeout(() => document.querySelector('.bk-kinds .bk-kind')?.focus(), 60);
}

// The places to pick for a kind of booking: the fitting kind first (studios for a session), then the rest, each with
// its kind named and the first line of its address, which tells two of the same name apart.
const FITS = { show: ['venue', 'festival'], session: ['studio'], rehearsal: ['rehearsal'], other: [] };
const venueItems = kind => { const want = FITS[kind] || [], fits = v => !want.length || want.includes(v.kind || 'venue');
  return sortByName(db.venues).map(v => ({ id: v.id, name: v.name || 'Unnamed venue', names: v.name ? [v.name] : [], group: fits(v) ? 0 : 1,
    sub: [fits(v) ? '' : model.venueKindLabel(v.kind), String(v.address || '').split('\n')[0].trim()].filter(Boolean).join(' · ') }))
    .sort((a, b) => a.group - b.group); };
// The acts to pick: every name each is known by (model.actNames), the earlier one under it.
const actItems = () => sortByName(db.acts).map(a => ({ id: a.id, name: a.name || 'Unnamed act', names: model.actNames(a), group: 0, sub: model.formerName(a) ? `formerly ${model.formerName(a)}` : '' }));

// A section's name, and when it is not on the role's menu, where to find it (wireForm adds a button there).
const pageHint = (id, fallback) => {
  const name = sectionName(id, fallback);
  return offMenu().includes(id) ? ` ${name} is a bonus track on ${menuWords().list}.` : '';
};

function fieldsFor(kind, cur = '') {
  const acts = sortByName(db.acts), word = actWord(); // 'act', or the role's own: 'artist', 'band'
  // With no acts yet: where to add them, in the role's words (a solo artist adds themselves: pages.bookings.noActs).
  const noActs = !acts.length ? `${pageOpt('bookings', 'noActs', '') || `Add your bands and artists on the ${sectionName('acts', 'Acts')} page to pick them here.`}${pageHint('acts', 'Acts')}` : '';
  // The members join an empty line-up (tidy), except for a role that keeps the line-up out of the way.
  const joins = kind !== 'other' && blockShown('lineup') ? 'Its members are added to the line-up when the line-up is empty.' : '';
  // A role that scores the shows it goes to scores the act picked here (Score this show on the booking).
  const scores = kind === 'show' && pageOpt('bookings', 'score', false) ? `The ${word} you’re going to see. On the night or after, Score this show logs your score on their card.` : '';
  // A box to type the act in, its saved acts listed under it as it is typed (by any name each has had); a name that is
  // none of them is kept as typed (client) and asked about on Add or Save.
  const act = (label = capital(word)) => ({ key: 'actId', textKey: 'client', label, type: 'combo', items: actItems, words: { many: word + 's' }, placeholder: kind === 'session' ? 'Who the session is for' : 'Type a name', hint: noActs || scores || joins });
  const status = { key: 'status', label: 'Status', type: 'select', options: statusChoices(kind, cur).map(([id, label]) => [id, label]) };
  const date = { key: 'date', label: 'Date', type: 'date', required: true };
  const endDate = { key: 'endDate', label: 'Last day (more than one day)', type: 'date', hint: 'Leave blank for a single day.' };
  const venue = (label, ph) => [
    { key: 'venueId', textKey: 'venueName', label, type: 'combo', items: () => venueItems(kind), words: { many: 'venues' }, placeholder: ph, hint: db.venues.length ? '' : `Save venues, studios and rooms on the ${sectionName('venues', 'Venues')} page to pick them here.${pageHint('venues', 'Venues')}` },
    { key: 'address', label: 'Address', type: 'textarea', rows: 2 },
  ];
  const t = (key, label) => ({ key, label, type: 'time' });
  const title = { key: 'title', label: 'Title (optional)', placeholder: 'Blank: “Act @ Venue”', hint: 'Only if you want a name of your own on the calendar.' };
  const contact = [
    { key: 'contactName', label: kind === 'show' ? 'Promoter or contact' : 'Contact', list: sortByName(db.people).map(p => p.name).filter(Boolean), placeholder: 'Name' },
    { key: 'contactRole', label: 'Their role', list: CONTACT_ROLES },
    { key: 'contactPhone', label: 'Phone', type: 'tel' },
    { key: 'contactEmail', label: 'Email', type: 'email' },
  ];
  if (kind === 'show') return [act(), status, date, endDate, ...venue('Venue', 'e.g. The Moth Club'),
    t('loadIn', 'Load-in'), t('soundcheck', 'Soundcheck'), t('doors', 'Doors'), t('setTime', 'On stage'),
    { key: 'setLength', label: 'Set length (minutes)', type: 'number', min: 0, placeholder: 'e.g. 45' }, t('curfew', 'Curfew'), title, ...contact];
  if (kind === 'session') return [act(), status, date, endDate,
    ...venue('Studio', 'e.g. Echo Chamber Studios'), t('start', 'Start'), t('end', 'Finish'),
    { key: 'rate', label: 'Rate', type: 'number', min: 0, step: 'any', placeholder: '0' }, { key: 'rateUnit', label: 'Per', type: 'select', options: model.RATE_UNITS }, title, ...contact];
  if (kind === 'rehearsal') return [act(), status, date, ...venue('Room', 'e.g. Basement Rehearsal Rooms'), t('start', 'Start'), t('end', 'Finish'), title];
  return [{ key: 'title', label: 'What', required: true, placeholder: 'e.g. Radio session, photo shoot, label meeting' }, status, date, endDate, t('start', 'Start'), t('end', 'Finish'),
    ...venue('Where', 'e.g. BBC Maida Vale'), act(`${capital(word)} (optional)`),
    // Nothing about money for a free Audiophile without the working roles (the owner's answer 1): its fee stays as it is.
    !showsOnly() && { key: 'fee', label: 'Fee', type: 'number', min: 0, step: 'any', placeholder: '0' }].filter(Boolean);
}

// focus: the key of a field to put the cursor in (Score this show's "Pick the act" opens the form on the act).
function editBooking(b, opts = {}) { viaWork(b, () => editBookingNow(b, opts)); }
function editBookingNow(b, { focus = '' } = {}) {
  const isNew = !b.id;
  const kind = model.KINDS.some(k => k[0] === b.kind) ? b.kind : 'other';
  const c = b.contact || {};
  const values = { ...b, kind, contactName: c.name || '', contactRole: c.role || '', contactPhone: c.phone || '', contactEmail: c.email || '' };
  if (!model.statusesFor(kind).some(s => s[0] === values.status)) values.status = model.statusesFor(kind)[0][0];
  let adding = null, asking = false; // the answer to "Add to your lists?" while its save runs ({ act, venue }); a question up
  openForm({
    title: `${isNew ? 'New' : 'Edit'} ${NOUN[kind]}`,
    values, fields: fieldsFor(kind, values.status), saveLabel: isNew ? 'Add' : 'Save',
    // A band or venue typed that is in no list, and new to this booking, is asked about before the save (the act form's
    // "New name?" does the same): the sheet's body hears the submit first and holds it; an answer sends it again, and that
    // one saves. A read-only role is not asked: form.js gives it the licence's sheet.
    onReady: form => form.parentNode.addEventListener('submit', e => {
      if (e.target !== form || adding || !canChangeQuietly()) return;
      const fresh = typedNew(form);
      if (!fresh.act && !fresh.venue) return;
      e.preventDefault(); e.stopPropagation();
      if (asking) return; // one question at a time: a held or repeated Enter in the form under it asks nothing more
      asking = true;
      askAdd(fresh, kind, {
        answer: want => { asking = false; adding = want; try { form.requestSubmit(); } finally { adding = null; } },
        back: () => { asking = false; if (form.isConnected) form.querySelector(`[data-key="${fresh.act ? 'actId' : 'venueId'}"]`)?.focus(); },
      });
    }, true),
    onSave: v => {
      const rec = tidy(v, kind);
      if (adding) addTyped(rec, kind, adding); // the band and venue typed, made and linked first when the answer asked for them
      const before = (b.id && byId('bookings', b.id)) || b;
      if (rec.status !== before.status) withStatus(rec, rec.status, settledNow(before)); // a status picked here does what the status pill does
      // A show moved to another date, or given another act, is asked about again ("Did you see them?").
      if (before.id && (rec.date !== before.date || (rec.endDate || '') !== (before.endDate || '') || (rec.actId || '') !== (before.actId || ''))) delete rec.went;
      const stored = upsert('bookings', rec);
      if (!stored) return; // refused by the licence (read-only): nothing was stored, and the licence's sheet says so
      haptic();
      if (isNew) { toast(`${model.kindLabel(kind)} added`); openBooking(stored.id); } else toast('Saved');
    },
    onDelete: isNew ? null : () => { if (remove('bookings', b.id) !== false) { toast('Booking deleted'); haptic(30); } },
  });
  wireForm(kind);
  if (focus) { const forms = document.querySelectorAll('.sheet form.form'), f = forms[forms.length - 1]; const el = f && f.querySelector(`[data-key="${focus}"], select[id$="-${focus}"]`); if (el) el.focus(); }
}

// What the form gave back, made into a booking record.
function tidy(v, kind) {
  const out = { ...v, kind };
  const str = x => String(x ?? '').trim();
  const contact = { name: str(v.contactName), role: str(v.contactRole), phone: str(v.contactPhone), email: str(v.contactEmail) };
  // A contact picked from People brings their number and email when those were left blank.
  const p = contact.name && db.people.find(x => str(x.name).toLowerCase() === contact.name.toLowerCase());
  if (p) { if (!contact.phone) contact.phone = p.phone || ''; if (!contact.email) contact.email = p.email || ''; if (!contact.role) contact.role = p.role || ''; }
  delete out.contactName; delete out.contactRole; delete out.contactPhone; delete out.contactEmail;
  out.contact = contact;
  out.title = str(v.title);
  if (!isoOk(out.endDate) || out.endDate <= out.date) out.endDate = '';
  // A saved venue brings its own name and address (and keeps them up to date); typed ones are for anywhere else.
  if (out.venueId && byId('venues', out.venueId)) { out.venueName = ''; out.address = ''; } else { out.venueId = ''; out.venueName = str(out.venueName); out.address = str(out.address); }
  if (out.actId && !byId('acts', out.actId)) out.actId = '';
  out.client = out.actId ? '' : str(out.client); // the act as typed when it is none of the acts, on any kind
  for (const k of ['setLength', 'rate', 'fee']) {
    if (out[k] === '' || out[k] == null || !Number.isFinite(Number(out[k]))) delete out[k];
    else out[k] = k === 'setLength' ? Math.max(0, Math.round(Number(out[k]))) : Math.max(0, Number(out[k]));
  }
  if (!model.statusesFor(kind).some(s => s[0] === out.status)) out.status = model.statusesFor(kind)[0][0];
  // The act's members join the line-up when nobody is on it yet; not for a role that keeps the line-up out of the way
  // (a scout watching a band does not book its members, or mark them busy that night).
  const act = out.actId && byId('acts', out.actId);
  if (act && !(out.people || []).length && blockShown('lineup')) out.people = (act.members || []).filter(id => byId('people', id));
  return out;
}
// What was typed in the band and venue boxes that is no saved record and is new in this form: an edit that keeps the
// name it was saved with asks nothing (so a "Neither" stays answered).
function typedNew(form) {
  const one = key => { const el = form.querySelector(`input[data-key="${key}"]`); const t = el && !el.dataset.id ? el.value.trim().replace(/\s+/g, ' ') : '';
    return t && boxKey(t) !== boxKey(el.dataset.was || '') ? t : ''; };
  return { act: one('actId'), venue: one('venueId') };
}
// The kind of place a venue added from a booking is: a studio for a session, a room for a rehearsal.
const PLACE_KIND = { show: 'venue', session: 'studio', rehearsal: 'rehearsal', other: 'other' };
function addTyped(rec, kind, want) {
  if (want.act && rec.client && !rec.actId) { const a = addActNamed(rec.client); if (a) { rec.actId = a.id; rec.client = ''; } }
  if (want.venue && rec.venueName && !rec.venueId) { const v = addVenueNamed({ name: rec.venueName, address: rec.address, kind: PLACE_KIND[kind] || 'venue' }); if (v) { rec.venueId = v.id; rec.venueName = ''; rec.address = ''; } }
}

// The form is one schema for every case: a saved venue hides the box for its address; the band and venue boxes say
// themselves whether what is typed is saved.
function wireForm(kind) {
  const forms = document.querySelectorAll('.sheet form.form'), form = forms[forms.length - 1];
  if (!form) return;
  const ctl = key => form.querySelector(`[data-key="${key}"]`) || form.querySelector(`select[id$="-${key}"]`);
  const fieldOf = key => { const el = ctl(key); return el ? el.closest('.field') : null; };
  const venueSel = ctl('venueId');
  if (venueSel) {
    const note = h('small', { class: 'muted bk-venue-note' });
    venueSel.closest('.field').append(note);
    const sync = fill => {
      const v = byId('venues', venueSel.dataset.id);
      for (const f of [fieldOf('venueName'), fieldOf('address')]) if (f) f.hidden = !!v;
      note.textContent = v ? (v.address ? `📍 ${String(v.address).split('\n')[0]}` : 'No address saved for this venue yet.') : '';
      note.hidden = !v; // with no saved venue, the box's own line says the rest
      // A venue's own contact fills an empty contact.
      if (fill && v) {
        const [n, ph, em] = ['contactName', 'contactPhone', 'contactEmail'].map(ctl);
        if (n && ph && em && !n.value && !ph.value && !em.value) { n.value = v.contact || ''; ph.value = v.phone || ''; em.value = v.email || ''; }
      }
    };
    venueSel.addEventListener('combochange', () => sync(true));
    sync(false);
  }
  // A hint that sends people to Acts or Venues while that section is a bonus track gets a button that goes there,
  // closing the form, as long as nothing has been typed in it. After that only the words stay, so nothing typed is lost.
  const goes = [['actId', 'acts', 'Acts', !db.acts.length], ['venueId', 'venues', 'Venues', !db.venues.length]]
    .filter(([key, id, , none]) => none && offMenu().includes(id) && fieldOf(key))
    .map(([key, id, fallback]) => {
      const btn = h('button', { type: 'button', class: 'btn ghost small bk-bonus', id: 'bk-go-' + id, onclick: () => {
        const x = form.closest('.sheet') && form.closest('.sheet').querySelector('.sheet-head [aria-label="Close"]');
        if (x) x.click();
        window.logiGo(id);
      } }, `Open ${sectionName(id, fallback)}`);
      const hint = fieldOf(key).querySelector(':scope > small.muted:not(.bk-venue-note)');
      if (hint) hint.after(btn); else fieldOf(key).append(btn);
      return btn;
    });
  if (goes.length) {
    const typed = () => goes.forEach(b => b.remove());
    form.addEventListener('input', typed);
    form.addEventListener('change', typed);
  }
}

// "Add to your lists?": asked over the booking form when the band or the venue typed is in no list (typedNew). The
// answers say which to add (answer({ act, venue })); the booking is saved whatever the answer, with what was not added
// kept as typed. ✕, Escape and Back to the form save nothing and put the focus back in the form (back()). No answer
// takes the focus (the sheet takes it), so the Enter that sent the form, held or repeated, answers nothing.
const ADD_TITLE = 'Add to your lists?';
function askAdd(fresh, kind, { answer, back }) {
  const word = actWord(), noun = kind === 'show' ? showWord() : NOUN[kind] || 'booking', both = !!(fresh.act && fresh.venue);
  let done = false, close = () => {};
  const btn = (id, text, want, primary = false) => h('button', { type: 'button', class: `btn ${primary ? 'primary' : 'ghost'}`, id,
    onclick: e => { if (e.detail > 1) return; done = true; close(); eatSecondClick(); answer(want); } }, text);
  const body = h('div', { class: 'stack bk-add' },
    h('p', { class: 'bk-add-q', id: 'bk-add-q' }, both ? `“${fresh.act}” and “${fresh.venue}” aren’t in your lists yet. Add them?`
      : fresh.act ? `“${fresh.act}” isn’t in your ${word}s yet. Add it?` : `“${fresh.venue}” isn’t in your venues yet. Add it?`),
    h('p', { class: 'small muted', id: 'bk-add-why' }, both ? `Once added, they’re there to pick next time. Whatever you choose, the ${noun} keeps both names.`
      : `Once added, it’s there to pick next time. Whatever you choose, the ${noun} keeps the name.`),
    h('div', { class: 'bk-add-answers' }, both
      ? [btn('bk-add-both', 'Add both', { act: true, venue: true }, true), btn('bk-add-act', `Just the ${word}`, { act: true, venue: false }),
        btn('bk-add-venue', 'Just the venue', { act: false, venue: true }), btn('bk-add-none', 'Neither', { act: false, venue: false })]
      : [btn('bk-add-yes', 'Yes, add it', { act: !!fresh.act, venue: !!fresh.venue }, true), btn('bk-add-no', 'No, keep it as typed', { act: false, venue: false })]),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost small', id: 'bk-add-back', onclick: e => { if (e.detail < 2) close(); } }, 'Back to the form')));
  let el = null;
  ({ el, close } = sheet(ADD_TITLE, body, { onClose: () => { if (!done) back(); } }));
  el.setAttribute('aria-describedby', 'bk-add-q bk-add-why');
}
// The role's word for a show: the singular of its name for Bookings when it has one of its own (Gigs: gig; Shows:
// show), else show.
export const showWord = () => { const w = sectionName('bookings', 'Bookings').toLowerCase().replace(/s$/, ''); return w === 'booking' ? 'show' : w; };

/* ------------------------------- status, duplicate, delete ------------------------------- */
const settledNow = x => !!(x && (x.status === 'settled' || (x.settlement && x.settlement.settledAt)));
// A new status on a booking record (x), with what goes with it: marking a show advanced ticks that line, and a show's
// settlement follows Paid / settled both ways, as Mark settled and Reopen do on the Settlement box (settledAt and the
// "Settled on the night" tick). A role without money never touches the settlement: the status changes, nothing else.
function withStatus(x, s, wasSettled) {
  x.status = s;
  if (x.kind !== 'show') return x;
  if (s === 'advanced') x.checks = { ...(x.checks || {}), 'show-advance': true };
  if (!moneyShown()) return x;
  const st = x.settlement && typeof x.settlement === 'object' ? { ...x.settlement } : null;
  if (s === 'settled') {
    x.settlement = { ...(st || {}), settledAt: (st && st.settledAt) || Date.now() };
    x.checks = { ...(x.checks || {}), 'show-settled': true };
  } else if (wasSettled) {
    if (st) { delete st.settledAt; x.settlement = st; }
    x.checks = { ...(x.checks || {}) }; delete x.checks['show-settled'];
  }
  return x;
}
function setStatus(b, s) {
  const cur = byId('bookings', b.id);
  if (!cur || cur.status === s) return;
  const was = settledNow(cur);
  update(d => { const x = d.bookings.find(r => r.id === b.id); if (!x) return; withStatus(x, s, was); x.updatedAt = Date.now(); });
  setTimeout(() => { const btn = ROOT && ROOT.querySelector('.bk-status'); if (btn && document.activeElement !== btn && !document.querySelector('.sheet')) btn.focus({ preventScroll: true }); }, 30); // after the redraw (app.js also restores it by id)
  haptic();
  toast(`Status: ${model.statusLabel(s)}`);
}

function statusPicker(b) {
  if (workLocked(b)) return gateWork(() => statusPicker(byId('bookings', b.id) || b), b.kind);
  const { close } = sheet('Booking status', h('div', { class: 'bk-status-list', role: 'radiogroup', 'aria-label': 'Status' },
    statusChoices(b.kind, b.status).map(([id, label, t]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(b.status === id), class: 'bk-status-opt' + (b.status === id ? ' on' : ''), 'data-status': id,
      onclick: () => { close(); setStatus(b, id); },
    }, h('span', { class: 'pill st-' + t }, label), h('span', { class: 'muted small' }, statusHelp(id)), b.status === id && h('span', { class: 'bk-tick', 'aria-hidden': 'true' }, '✓')))));
}

// A copy for another date: same act, venue, times, people and gear, but none of the money or the night (no
// settlement, quote, invoice, ticks, guests marked in or day sheet sent, and never "Didn’t go"), and on hold; confirmed
// for a role without money, as a new booking is (firstStatus).
export function copyOf(b, date) {
  const off = isoOk(b.date) && isoOk(date) ? daysBetween(b.date, date) : 0;
  const c = JSON.parse(JSON.stringify(b));
  for (const k of ['id', 'createdAt', 'updatedAt', 'sample', 'settlement', 'quote', 'invoice', 'daySheet', 'went']) delete c[k];
  c.status = moneyShown() ? 'hold' : 'confirmed'; c.checks = {}; c.date = date;
  if (c.endDate) c.endDate = addDays(c.endDate, off);
  if (Array.isArray(c.guestList)) c.guestList = c.guestList.map(g => ({ ...g, in: false }));
  if (c.deal && typeof c.deal === 'object') { c.deal.depositPaid = false; if (isoOk(c.deal.depositDue)) c.deal.depositDue = addDays(c.deal.depositDue, off); }
  if (Array.isArray(c.deliverables)) c.deliverables = c.deliverables.map(d => ({ ...d, done: false, due: isoOk(d.due) ? addDays(d.due, off) : d.due }));
  // A free Audiophile without the working roles copies only what it keeps (the owner's answer 1): nothing of the working
  // boxes or the money.
  if (showsOnly()) {
    for (const k of ['deal', 'runningOrder', 'guestList', 'guestCap', 'hospitality', 'accommodation', 'parking', 'backlineProvided', 'setlistId', 'budget', 'rate', 'rateUnit', 'songIds', 'deliverables', 'fee']) delete c[k];
    Object.assign(c, { people: [], gear: [], gearQty: {}, kits: [] });
  }
  return c;
}

function duplicateSheet(b) {
  // A free Audiophile without the working roles adds only shows (the owner's answer 1): a copy of anything else goes
  // through the licence, as a session's or a rehearsal's changes do.
  if (showsOnly() && b.kind !== 'show') return gateWork(() => duplicateSheet(byId('bookings', b.id) || b), b.kind);
  const span = multi(b) ? daysBetween(b.date, lastDay(b)) : 0;
  const input = h('input', { type: 'date', id: 'bk-dup-date', required: true, value: isoOk(b.date) ? addDays(b.date, 7) : todayISO() });
  const note = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const sync = () => { note.textContent = span && isoOk(input.value) ? `It runs to ${fmtShort(addDays(input.value, span))}, ${span + 1} days like this one.` : ''; };
  input.addEventListener('input', sync); sync();
  let close = () => {};
  const form = h('form', { class: 'stack', onsubmit: e => {
    e.preventDefault();
    if (!isoOk(input.value)) { input.focus(); return toast('Pick the date for the copy'); }
    if (!canChange()) return; // read-only (the licence): the sheet stays, and the licence's sheet says why
    close();
    const stored = upsert('bookings', copyOf(byId('bookings', b.id) || b, input.value));
    if (!stored) return; // refused by the licence (read-only): nothing was stored, and the licence's sheet says so
    haptic();
    toast(`Copied to ${fmtShort(stored.date)}` + (stored.status === 'hold' ? ', on hold' : ''));
    openBooking(stored.id);
  } },
    h('p', null, h('strong', null, model.bookingTitle(b)), h('span', { class: 'muted small' }, ' · ' + dateRange(b, fmtShort))),
    h('p', { class: 'muted small' }, moneyShown() ? 'The copy keeps the act, venue, times, contact, deal, people and gear. It starts on hold, with an empty checklist and no settlement, quote or invoice.'
      : 'The copy keeps the act, venue, times, contact and notes. It starts confirmed, with an empty checklist.'),
    h('div', { class: 'field' }, h('label', { for: 'bk-dup-date' }, 'New date'), input),
    note,
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn primary' }, '⧉ Make the copy'), h('button', { type: 'button', class: 'btn ghost', onclick: () => close() }, 'Cancel')));
  ({ close } = sheet('Duplicate booking', form));
  setTimeout(() => input.focus(), 60);
}

// Press and hold a booking (its card, or its header on its own page) for three seconds: this sheet offers to delete
// it. The Delete button on its page does the same for keyboards.
const HOLD_MS = 3000;
// What a booking was deleted from (its Coming up card, its block or pill on the grid) goes with it, and the focus with
// that: the draw that follows puts it on the view's heading rather than nowhere.
let HEAD_NEXT = false;
function deleteSheet(b) {
  if (workLocked(b)) return gateWork(() => deleteSheet(byId('bookings', b.id) || b), b.kind);
  const { close } = sheet('Delete this booking?', h('div', { class: 'stack' },
    h('p', null, h('strong', null, model.bookingTitle(b)), h('span', { class: 'muted small bk-del-when' }, [dateRange(b, fmtShort), model.kindLabel(b.kind)].join(' · '))),
    h('p', { class: 'small muted' }, !moneyShown() // a role without money: only what it keeps on a booking
      ? (b.kind === 'session'
        ? `Its notes, checklist ticks and clocked hours go with it. Your ${actWord()}, venue and people stay. Take logs stay in the Studio log, unlinked. This cannot be undone.`
        : `Its notes, checklist ticks, running order and guest list go with it. Your ${actWord()}, venue and people stay. This cannot be undone.`)
      : b.kind === 'show'
        ? 'Its deal, running order, guest list, settlement, checklist ticks, quote and invoice go with it. Your act, venue, people and setlist stay. This cannot be undone.'
        : 'Its checklist ticks, notes, clocked hours, quote and invoice go with it. Take logs stay in the Studio log, unlinked. This cannot be undone.'),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn danger', onclick: () => { close(); if (remove('bookings', b.id) !== false) { HEAD_NEXT = true; toast('Booking deleted'); haptic(30); announce('Booking deleted'); } } }, '🗑 Delete booking'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => close() }, 'Keep it'))));
}
const holdToDelete = (el, b) => { hold(el, HOLD_MS, () => { haptic(20); deleteSheet(byId('bookings', b.id) || b); }); return el; };

function addToCalendar(b) {
  saveFile(bookingIcs(b), fileName(`${model.bookingTitle(b)} ${b.date || ''}`, 'ics'), 'text/calendar')
    .then(done => { if (done) toast('Calendar file saved. Open it to add the booking to your calendar.'); })
    .catch(() => toast('The calendar file could not be saved here.'));
}
function exportCalendar() {
  const list = upcoming().filter(passes);
  if (!list.length) return toast(filtersOn() ? 'Nothing coming up with these filters.' : 'Nothing coming up to export yet.');
  const act = S.act && byId('acts', S.act);
  const name = ['Tourbook', act && act.name, S.kind && KIND_CHIP[S.kind]].filter(Boolean).join(' – ');
  saveFile(allIcs(list, name), fileName(name, 'ics'), 'text/calendar')
    .then(done => { if (done) toast(`${plural(list.length, 'booking')} saved to a calendar file`); })
    .catch(() => toast('The calendar file could not be saved here.'));
}

/* ------------------------------- the calendar ------------------------------- */
// What js/bookings-cal.js gets from this page (the whole contract: the calendar never imports this module).
const CTX = {
  S,                 // the page's state: read mode, day, kind, act, all. Change it only through go().
  go,                // go(patch, { top = true }): merge patch into S and redraw; top: scroll up and focus [data-view-head] when the view changed
  showBooking,       // showBooking(b, day?): the booking's page; day = the day it was tapped on, so Back returns there
  newBooking,        // newBooking({ date, kind? })
  holdToDelete,      // holdToDelete(el, b) → el: press and hold for three seconds offers to delete
  exportCalendar,    // () → saves the upcoming bookings (with the filters) as .ics
  passes,            // passes(b) → boolean: the filter chips
  filtersOn,         // () → boolean
  root: () => ROOT,  // the page's root element
};

/* ------------------------------- the booking ------------------------------- */
function bookingPage(b) {
  const here = covers(b, S.day) ? S.day : b.date;
  const blocks = blocksFor(b.kind);
  const ctx = {
    sym: model.currency(),
    // Open another box (Settle the night → Settlement). One under More boxes opens the fold first. The box is filled at
    // once, so the caller can put the focus inside it straight after.
    open(id) {
      const set = openSet(b.id);
      set.add(id);
      const el = document.getElementById('blk-' + id);
      if (!el) return;
      const fold = el.closest('.bk-more');
      if (fold && !fold.open) { set.add('more'); fold.open = true; }
      el.open = true;
      if (FILL.has(el)) FILL.get(el)();
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
  };
  return h('div', { class: 'bk-page' },
    h('div', { class: 'page-head' },
      backBtn(isoOk(here) ? fmtShort(here) : 'Day', () => go({ view: 'cal', mode: 'day', day: isoOk(here) ? here : todayISO() })), // to the Day view; the view kept on the device does not change
      h('button', { type: 'button', class: 'btn ghost bk-edit', onclick: () => editBooking(byId('bookings', b.id) || b) }, '✎ Edit')),
    hero(b),
    workNote(b),
    h('div', { class: 'bk-actions' },
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => duplicateSheet(b) }, h('span', { 'aria-hidden': 'true' }, '⧉'), 'Duplicate'),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => addToCalendar(b) }, h('span', { 'aria-hidden': 'true' }, '📆'), 'Add to calendar'),
      h('button', { type: 'button', class: 'btn ghost small bk-delete', onclick: () => deleteSheet(b) }, h('span', { 'aria-hidden': 'true' }, '🗑'), 'Delete')),
    h('div', { class: 'bk-blocks' }, blocks.map(blk => blockBox(b, blk, ctx))),
    moreBoxes(b, ctx));
}

// A studio session or a rehearsal a free Audiophile cannot change now (the owner's answer 1): what it is kept for, and
// the way to change it (the free days, or the licence).
function workNote(b) {
  if (!workLocked(b)) return null;
  const start = mayWork() === 'start';
  return h('div', { class: 'card lic-work-note' },
    h('p', { class: 'small' }, `${b.kind === 'session' ? 'Studio sessions' : 'Rehearsals'} come with Tourbook’s working roles: this one stays here for you to look at, and can be changed ${start ? 'during your 30 free days' : 'with a licence'}.`),
    h('button', { type: 'button', class: 'btn ghost small', id: 'bk-work-open', onclick: () => gateWork(() => draw(), b.kind) }, start ? 'Start my 30 free days' : 'Get a licence…'));
}

// The boxes the role keeps out of the way (js/roles.js: hide), in one closed fold below the others. They are drawn with
// the page, closed and filled only when opened, so ctx.open can reach them. Its closed line names a few of them and
// says nothing of what is in them (a box's own summary cannot tell an empty box from a filled one).
function moreBoxes(b, ctx) {
  const list = foldedFor(b.kind);
  if (!list.length) return null;
  const set = openSet(b.id), titles = list.map(x => x.title || x.id);
  const line = titles.length <= 3 ? andList(titles) : `${titles.slice(0, 2).join(', ')} and ${titles.length - 2} more`;
  // The working boxes, for a free Audiophile without the working roles: the fold says so ("30 days free", "🔒 Licence"),
  // and opening it goes through the licence instead of showing them. Its boxes are not drawn, so ctx.open finds none.
  const mark = workMark();
  const fold = h('details', { class: 'bk-more', id: 'bk-more', open: !mark && set.has('more') },
    h('summary', { 'aria-label': mark ? `More boxes (${list.length}), ${mark.label}` : null },
      h('span', { class: 'blk-ico', 'aria-hidden': 'true' }, '🗃️'),
      h('span', { class: 'blk-text' }, h('span', { class: 'blk-title' }, `More boxes (${list.length})`), h('span', { class: 'blk-sum' }, line)),
      mark && h('span', { class: 'dk-track-lock', 'aria-hidden': 'true' }, mark.text)),
    h('div', { class: 'bk-more-blocks' }, mark ? null : list.map(blk => blockBox(b, blk, ctx))));
  fold.addEventListener('toggle', () => {
    if (mark && fold.open) { fold.open = false; gateWork(() => { set.add('more'); draw(); }); return; } // the free days started: drawn open, with its boxes
    if (!mark) { if (fold.open) set.add('more'); else set.delete('more'); }
  });
  return fold;
}

// Score this show: a show from its day on, not cancelled, for a role that scores the acts it sees (js/roles.js
// pages.bookings.score) and for anyone who is asked "Did you see them?" after a show (askSeen: the row is where that
// question is answered later, or changed). With its act, it logs a time seen on the act's card with the date, the venue
// and the booking filled in; once the act's log has it (from here, or from the act's card on the same day), the score
// shows instead, and that wins over any other answer. Once the show is over (model.showOver) a Didn’t go button sits
// beside Score, and a show answered so reads "Didn’t go" with Change. With no act yet, a role that scores is told so
// and offered the booking's form on the act; anyone who has the row only because they are asked gets no row (the
// question is only ever about a show with an act).
const scoresShows = () => !!pageOpt('bookings', 'score', false);
// A show answered No keeps the row whoever is looking (someone who has since turned the question off, or become a
// band): the calendar still says "Didn’t go", and this row is where that answer is taken back.
const asksOrScores = () => scoresShows() || askSeen();
const scoreable = b => !!((asksOrScores() || b.went === 'no') && b.kind === 'show' && b.status !== 'cancelled' && isoOk(b.date) && b.date <= todayISO());
const scoreOn = b => scoreable(b) && !!actOf(b);
// What the row's button does changes it (★ Score → ✎ Edit, ✎ Edit → Delete → ★ Score, Pick the act → ★ Score, Didn’t go
// → Change and back), so the app cannot find the old one after the redraw: the draw after its sheet closes, or after
// the answer is saved, puts the focus on the row's first button.
let SCORE_FOCUS = null; // { id: the booking's id, was: the id of the button that opened the sheet }
// The second click of a double click does nothing: it could land on the button the first one put there (Didn’t go →
// Change). And a held Enter key acts once (scoreKeys, on the row): its repeats would press each new button in turn.
const scoreTap = (b, was, fn) => e => { if (e && e.detail > 1) return; SCORE_FOCUS = { id: b.id, was }; fn(); };
const scoreKeys = e => { if (e.repeat && e.key === 'Enter') e.preventDefault(); };
function scoreRefocus(viewChanged) {
  const sf = SCORE_FOCUS;
  if (!sf) return;
  if (viewChanged || S.view !== 'booking' || S.id !== sf.id) { SCORE_FOCUS = null; return; }
  if (document.querySelector('.sheet')) return; // still open: wait for the draw after it closes
  SCORE_FOCUS = null;
  const btn = ROOT.querySelector('.bk-score button[id^="bk-score"]'), now = document.activeElement, lost = !now || now === document.body;
  if (btn) { if (btn.id !== sf.was && lost) btn.focus({ preventScroll: true }); }
  // No row any more (someone who is not asked took back a Didn’t go): the act above it, else the page's heading
  else if (lost) (ROOT.querySelector('.bk-hero button.bk-act') || ROOT.querySelector('[data-view-head]'))?.focus({ preventScroll: true });
}
function scoreRow(b) {
  if (!scoreable(b) || (!actOf(b) && !scoresShows())) return null;
  const act = actOf(b);
  if (!act) {
    const word = actWord();
    // A band typed on the show and never added: it can be added from here, and then scored.
    if (b.client && !exactOf(actItems(), b.client)) {
      return h('div', { class: 'bk-score bk-score-noact bk-score-typed' },
        h('span', { class: 'bk-score-text' }, `${b.client} isn’t in your ${word}s yet. Add them to score this show.`),
        h('button', { type: 'button', class: 'btn ghost small', id: 'bk-score-add', 'aria-label': `Add ${b.client} to your ${word}s`,
          onclick: scoreTap(b, 'bk-score-add', () => addScoreAct(b.id)) }, `+ Add to ${sectionName('acts', 'Acts')}`));
    }
    return h('div', { class: 'bk-score bk-score-noact' },
      h('span', { class: 'bk-score-text' }, `Pick the ${word} you saw to score this show.`),
      h('button', { type: 'button', class: 'btn ghost small', id: 'bk-score-act', onclick: scoreTap(b, 'bk-score-act', () => editBooking(byId('bookings', b.id) || b, { focus: 'actId' })) },
        h('span', { 'aria-hidden': 'true' }, '✎ '), `Pick the ${word}`));
  }
  const name = act.name || 'Unnamed act', entry = model.seenEntryFor(act, b);
  if (entry) {
    const r = model.ratingOf(entry);
    return h('div', { class: 'bk-score bk-scored', onkeydown: scoreKeys },
      h('span', { class: 'bk-score-text' }, h('span', { 'aria-hidden': 'true' }, '★ '), r != null ? ['Scored ', h('b', null, String(r)), '/100'] : 'Seen, no score yet'),
      h('button', { type: 'button', class: 'btn ghost small', id: 'bk-score-edit', 'aria-label': `Edit the time you saw ${name}`, onclick: scoreTap(b, 'bk-score-edit', () => logSighting(byId('acts', act.id) || act, entry)) }, '✎ Edit'));
  }
  if (b.went === 'no') {
    return h('div', { class: 'bk-score bk-score-went', onkeydown: scoreKeys },
      h('span', { class: 'bk-score-text' }, 'Didn’t go'),
      h('button', { type: 'button', class: 'btn ghost small', id: 'bk-score-change', 'aria-label': `Change your answer for ${name}`, onclick: scoreTap(b, 'bk-score-change', () => model.markWent(b.id, false)) }, 'Change'));
  }
  // ★ Score is first in the row at every hour; Didn’t go joins it once the show is over.
  return h('div', { class: 'bk-score', onkeydown: scoreKeys },
    h('button', { type: 'button', class: 'btn primary small', id: 'bk-score',
      onclick: scoreTap(b, 'bk-score', () => logSighting(byId('acts', act.id) || act, { date: b.date, venueId: b.venueId || '', where: b.venueId ? '' : (b.venueName || ''), bookingId: b.id })) },
    h('span', { 'aria-hidden': 'true' }, '★ '), `Score ${name}`),
    model.showOver(b) && h('button', { type: 'button', class: 'btn ghost small', id: 'bk-score-no', 'aria-label': `I didn’t go to see ${name}`,
      onclick: scoreTap(b, 'bk-score-no', () => { model.markWent(b.id, true); haptic(); announce(`${name}: marked Didn’t go`); }) }, 'Didn’t go'));
}

// "+ Add to Bands" on a show whose band was typed: the act made from the name, and the show linked to it.
function addScoreAct(id) {
  const cur = byId('bookings', id);
  if (!cur || cur.actId || !cur.client || !canChange({ form: false })) return;
  const a = addActNamed(cur.client);
  if (!a) return;
  if (upsert('bookings', { ...cur, actId: a.id, client: '' })) toast(`${a.name} is in your ${actWord()}s now.`);
}

function hero(b) {
  const v = model.venueOf(b);
  const where = { ...v, address: v.address || b.address || '' };
  const act = actOf(b);
  const c = b.contact || {};
  const digits = c.phone ? telUrl(c.phone).slice(4) : '';
  let warns = [];
  try { warns = (venueChecks(b) || []).filter(w => w && w.text); } catch (e) { console.warn('venue warnings', e); } // [{ level: 'warn'|'info', text }]
  const el = h('section', { class: 'card hero bk-hero', style: actStyle(b), 'aria-label': 'Booking', title: 'Press and hold to delete this booking' },
    h('div', { class: 'bk-hero-top' },
      h('h2', { class: 'bk-title', tabindex: '-1', 'data-view-head': '' }, h('span', { class: 'bk-title-ico', 'aria-hidden': 'true' }, model.kindIcon(b.kind)), ' ', model.bookingTitle(b)),
      h('button', { type: 'button', id: 'bk-status', class: 'bk-status', 'aria-label': `Status: ${model.statusLabel(b.status)}. Change it`, 'aria-haspopup': 'dialog', onclick: () => statusPicker(b) },
        h('span', { class: 'pill ' + tone(b.status) }, model.statusLabel(b.status), h('span', { 'aria-hidden': 'true' }, ' ▾')))),
    formerlyLine(b),
    h('div', { class: 'muted bk-when' }, `${model.kindLabel(b.kind)} · ${dateRange(b, fmtLong)}` + (multi(b) ? ` · ${daysBetween(b.date, lastDay(b)) + 1} days` : '')),
    timesStrip(b),
    (where.name || where.address) ? h('div', { class: 'bk-venue' },
      h('div', { class: 'bk-venue-line' },
        h('span', { 'aria-hidden': 'true' }, '📍 '),
        h('span', { class: 'bk-venue-text' }, h('strong', null, where.name || 'Address'), where.address && h('span', { class: 'muted small' }, String(where.address).replace(/\s*\n\s*/g, ', '))),
        // data-fk: an edit saved in the venue's sheet draws this page again under it; closing the sheet finds this button's stand-in
        b.venueId && byId('venues', b.venueId) && h('button', { type: 'button', class: 'btn ghost small', 'data-fk': 'bk-venue-details', onclick: () => openVenue(b.venueId), 'aria-label': `Venue details: ${where.name}` }, 'Details')),
      mapButtons(where))
      : b.kind !== 'other' && h('p', { class: 'muted small' }, 'No venue yet. Edit to add one.'),
    warns.map(w => (w.level === 'info' ? h('div', { class: 'muted small bk-venue-info' }, 'ℹ︎ ' + w.text) : h('div', { class: 'warn' }, '⚠ ' + w.text))),
    // The venue's house rules in full (js/venues-rules.js): they are the venue's, on every show there.
    (() => { try { const rv = model.showRulesVenue(b); return rv ? rulesFull(rv, { where: 'show' }) : null; } catch (e) { console.warn('house rules', e); return null; } })(),
    (act || b.client) && h('div', { class: 'bk-act-row' },
      act ? h('button', { type: 'button', class: 'chip bk-act', style: actStyle(b), onclick: () => openAct(act.id), 'aria-label': `Act: ${act.name}. Open it` }, h('span', { class: 'bk-swatch', 'aria-hidden': 'true' }), act.name || 'Unnamed act')
        : h('span', { class: 'chip bk-act bk-client' }, '🎙 ' + b.client)),
    scoreRow(b),
    (c.name || c.phone || c.email) && h('div', { class: 'bk-contact' },
      h('div', { class: 'bk-contact-who' }, h('span', { class: 'muted small' }, c.role || 'Contact'), h('strong', null, c.name || c.phone || c.email)),
      h('div', { class: 'bk-contact-btns' },
        digits && h('a', { class: 'btn ghost small', href: 'tel:' + digits, 'aria-label': `Call ${c.name || 'the contact'}` }, '📞 Call'),
        digits && h('a', { class: 'btn ghost small', href: 'sms:' + digits, 'aria-label': `Text ${c.name || 'the contact'}` }, '💬 Text'),
        c.email && h('a', { class: 'btn ghost small', href: 'mailto:' + encodeURIComponent(c.email).replace(/%40/g, '@'), 'aria-label': `Email ${c.name || 'the contact'}` }, '✉ Email'))));
  return holdToDelete(el, b);
}

// The day's times in boxes, in the order the day runs. A time earlier than the first one is after midnight (+1).
function timesStrip(b) {
  const run = runOfDay(b);
  if (!run.length) return h('p', { class: 'muted small bk-notimes' }, b.kind === 'show' ? 'No times yet. Edit to add load-in, doors and the set time.' : 'No times yet. Edit to add the start and finish.');
  const first = run[0][1];
  const span = t => model.minutesBetween(first, t);
  const curfew = b.kind === 'show' && run.find(x => x[0] === 'Curfew');
  const boxes = run.map(([label, t]) => {
    const late = curfew && label === 'Off stage' && span(t) > span(curfew[1]);
    return h('div', { class: 'bk-time' + (late ? ' late' : ''), role: 'listitem' },
      h('span', null, label),
      h('b', null, t, t < first && h('small', { class: 'bk-next', title: 'the next day' }, '+1', h('span', { class: 'sr-only' }, ' the next day'))),
      label === 'On stage' && Number(b.setLength) > 0 && h('small', { class: 'muted' }, `${Number(b.setLength)} min set`),
      late && h('small', { class: 'bk-late' }, 'after curfew'));
  });
  if (b.kind !== 'show' && run.length === 2) boxes.push(h('div', { class: 'bk-time', role: 'listitem' }, h('span', null, 'Length'), h('b', null, model.fmtMin(model.minutesBetween(run[0][1], run[1][1])))));
  return h('div', { class: 'bk-times', role: 'list', 'aria-label': 'Times' }, boxes);
}

function blockBox(b, blk, ctx) {
  const set = openSet(b.id);
  let sum = '';
  try { sum = blk.summary ? blk.summary(b) || '' : ''; } catch (e) { console.warn(`The ${blk.id} box summary failed`, e); }
  const body = h('div', { class: 'blk-body' });
  let filled = false;
  const fill = () => {
    filled = true;
    let node;
    if (workLocked(b)) { body.replaceChildren(...nodes(lockedBody(byId('bookings', b.id) || b, blk))); return; } // to look at, not to change
    try { node = blk.render(byId('bookings', b.id) || b, ctx); } catch (e) { console.warn(`The ${blk.id} box failed`, e); node = h('p', { class: 'warn small' }, `This box could not be shown (${(e && e.message) || e}).`); }
    body.replaceChildren(...nodes(node));
  };
  const det = h('details', { class: 'blk', id: 'blk-' + blk.id, open: set.has(blk.id) },
    h('summary', null,
      h('span', { class: 'blk-ico', 'aria-hidden': 'true' }, blk.icon || '•'),
      h('span', { class: 'blk-text' }, h('span', { class: 'blk-title' }, blk.title || blk.id), sum !== '' && h('span', { class: 'blk-sum' }, String(sum)))),
    body);
  if (det.open) fill();
  FILL.set(det, () => { if (!filled) fill(); });
  det.addEventListener('toggle', () => {
    if (det.open) { set.add(blk.id); if (!filled) fill(); } else { set.delete(blk.id); filled = false; body.replaceChildren(); }
  });
  return det;
}

// A box of a booking a free Audiophile cannot change now: its notes as text, or what the box is for.
function lockedBody(b, blk) {
  if (blk.id === 'notes') return h('p', { class: 'prewrap bk-notes-ro' }, String(b.notes || '').trim() || 'No notes.');
  return h('p', { class: 'muted small' }, 'This box comes with Tourbook’s working roles.');
}

/* ------------------------------- walkthroughs ------------------------------- */
function bookingSteps(b) {
  // The step about the score row says what that row holds: 'seen' (the score, Edit), 'no' (Didn’t go, Change) or ''
  // (★ Score, and Didn’t go beside it once the show is over), as scoreRow draws it.
  const said = scoreOn(b) ? model.seenAnswer(b) : null;
  const base = [
    { title: 'The booking', text: 'The date, the times in the order the day runs, the venue with directions, the act and the contact. Press and hold this card for three seconds to delete the booking.', target: ['.bk-hero'] },
    { title: 'Status', text: moneyShown() ? 'Tap to change it: hold, offer, confirmed, advanced, done, paid. A cancelled booking stays in your records but leaves clashes and money.' : 'Tap to change it: hold, offer, confirmed, advanced, done. A cancelled booking stays in your records but leaves clashes.', target: ['.bk-status'] },
    { title: 'Times', text: 'Off stage is worked out from the set time and length. A time marked +1 is after midnight.', target: ['.bk-times'] },
    { title: 'House rules', text: 'What this venue allows and what it does not. The rules belong to the venue and apply to every show there; change them by editing the venue.', target: ['.bk-hero .vn-rules'] },
    said != null && said !== 'no' && { title: 'Score this show', text: 'Logs the night on the act’s card: the date and venue are filled in, you give the score out of 100 and notes. Once it is logged, the score shows here; Edit changes it.' + (said === '' && model.showOver(b) ? ' If you missed it, Didn’t go says so and Tourbook stops asking.' : ''), target: ['.bk-score'] },
    said === 'no' && { title: 'Didn’t go', text: 'You said you missed this show, so it is not counted as seen. Change takes that answer back.', target: ['.bk-score'] },
    scoreable(b) && !actOf(b) && scoresShows() && !(b.client && !exactOf(actItems(), b.client)) && { title: 'Score this show', text: `Pick the ${actWord()} you saw, and Score this show shows here: it logs the night on their card.`, target: ['.bk-score'] },
    scoreable(b) && !actOf(b) && scoresShows() && b.client && !exactOf(actItems(), b.client) && { title: 'Score this show', text: `Add them to your ${actWord()}s, and Score this show shows here: it logs the night on their card.`, target: ['.bk-score'] },
    { title: 'Edit', text: 'Change the date, venue, times or contact.', target: ['.bk-edit'] },
    { title: 'Copy, calendar, delete', text: `Duplicate makes a copy on another date${moneyShown() ? ' (on hold, without the money)' : ''}. Add to calendar saves a calendar file of this booking.`, target: ['.bk-actions'] },
    { title: 'The boxes', text: 'Everything else about the booking, one box each: tap a box to open it. Boxes you open stay open.', target: ['.bk-blocks'] },
    foldedFor(b.kind).length > 0 && { title: 'More boxes', text: 'The boxes your role uses less, folded away under the others. Open it to reach any of them; they work as the ones above. Settings → Your role changes which boxes are here.' + (workMark() ? ' The working boxes (line-up, setlist, take log and the rest) come with Tourbook’s working roles.' : ''), target: ['.bk-more'] },
  ].filter(Boolean);
  const set = openSet(b.id);
  const steps = x => { try { return (typeof x.tutorial === 'function' ? x.tutorial(b) : x.tutorial) || []; } catch { return []; } };
  const extra = [...blocksFor(b.kind), ...(set.has('more') ? foldedFor(b.kind) : [])].filter(x => set.has(x.id)).flatMap(steps);
  return [...base, ...extra];
}

const formSteps = kind => () => [
  kind !== 'other' && { title: `The ${actWord()}`, text: (blockShown('lineup') ? 'Who is playing. Its members join the line-up when it is empty.' : 'Who is playing.') + ' ' + `Type a few letters to find one of your ${actWord()}s and pick it, or type a new name.`, target: ['[data-key="actId"]'] },
  { title: 'Date', text: 'The day, and a last day for a festival weekend or a block of studio days.', target: ['[data-key="date"]'] },
  { title: 'Where', text: 'Type a few letters to find a saved venue and pick it, or type a new one and its address.', target: ['[data-key="venueId"]'] },
  kind === 'show' && { title: 'Times', text: 'Load-in, soundcheck, doors, on stage and curfew. The set length works out when you are off stage.', target: ['[data-key="loadIn"]'] },
  kind === 'session' && { title: 'Rate', text: 'What the session costs: per hour, per day, per song or a flat fee.', target: ['[data-key="rate"]'] },
  kind !== 'rehearsal' && kind !== 'other' && { title: 'Contact', text: 'The promoter, agent or studio contact. Their phone and email give you call, text and email buttons on the booking.', target: ['[data-key="contactName"]'] },
].filter(Boolean);
for (const [kind] of model.KINDS) { sheetTutorial(`New ${NOUN[kind]}`, formSteps(kind)); sheetTutorial(`Edit ${NOUN[kind]}`, formSteps(kind)); }
sheetTutorial('What are you booking?', () => [{ title: 'Pick a kind', text: moneyShown() ? 'Each kind has its own form and boxes: a show has a deal and a guest list, a session a rate and takes.' : 'Each kind has its own form and boxes. The one you add most is first.', target: ['.bk-kinds'] }]);
sheetTutorial('Booking status', () => [{ title: 'Status', text: moneyShown() ? 'Tap one to set it. Hold and offer show hollow on the calendar; cancelled leaves clashes and money.' : 'Tap one to set it. Hold and offer show hollow on the calendar; a cancelled one stays in your records, out of clashes.', target: ['.bk-status-list'] }]);
sheetTutorial('Duplicate booking', () => [{ title: 'New date', text: moneyShown() ? 'The copy goes on this date, on hold, with the same act, venue, times, people and gear.' : 'The copy goes on this date, confirmed, with the same act, venue, times and notes.', target: ['#bk-dup-date'] }]);
sheetTutorial(ADD_TITLE, [{ title: 'Add to your lists', text: 'Added, a name goes on its list, ready to pick next time you type it. A name you don’t add stays on the booking as typed. Back to the form, or ✕, saves nothing.', target: ['.bk-add-answers'] }]);
sheetTutorial('Delete this booking?', [{ title: 'Delete', text: 'Deleting cannot be undone. Keep it closes this without changing anything.', target: ['.btn.danger'] }]);
