// Small helpers shared by the booking page (js/pages/bookings.js) and the calendar (js/bookings-cal.js): dates, an
// act's colour, the status pill, the calendar view kept on this device, and the extra lines a booking's card carries
// (the overlap note, the venue's house rules, "Didn’t go"). It imports neither of those two modules.
import { h, ymd, parseISO } from './util.js';
import { byId, lastDay } from './store.js';
import * as model from './model.js';
import { rulesChip } from './venues-rules.js';

/* ------------------------------- words ------------------------------- */
export const KIND_CHIP = { show: 'Shows', session: 'Sessions', rehearsal: 'Rehearsals', other: 'Other' };
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const capital = w => w.charAt(0).toUpperCase() + w.slice(1);
export const sortByName = list => [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

/* ------------------------------- dates ------------------------------- */
export const isoOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const monthStart = iso => { const d = isoOk(iso) ? parseISO(iso) : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
export const multi = b => lastDay(b) > b.date;
export const dateRange = (b, f) => (!isoOk(b.date) ? 'No date' : multi(b) ? `${f(b.date)} → ${f(lastDay(b))}` : f(b.date));

/* ------------------------------- a booking's act and status ------------------------------- */
export const safeColor = c => (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c || '') ? c : '');
export const actOf = b => (b && b.actId ? byId('acts', b.actId) : null);
export const actStyle = b => { const c = safeColor(actOf(b) && actOf(b).color); return c ? `--act:${c}` : null; };
export const tone = s => model.statusTone(s);
export const pill = s => h('span', { class: 'pill ' + tone(s) }, model.statusLabel(s));

/* ------------------------------- the calendar's view, kept on this device ------------------------------- */
// gdex-cal-view: 'month' | 'two' (two weeks) | 'week' | 'three' (three days) | 'day'. A display preference like the
// theme: it is not in backups, and Erase this device keeps it (js/store.js). Only the calendar's view buttons save it.
const CAL_KEY = 'gdex-cal-view';
export const CAL_MODES = ['month', 'two', 'week', 'three', 'day'];
let chosen = ''; // the view picked this visit, for a browser that blocks storage
export const calMode = () => { try { const v = localStorage.getItem(CAL_KEY); return CAL_MODES.includes(v) ? v : 'month'; } catch { return chosen || 'month'; } };
export const saveCalMode = mode => {
  if (!CAL_MODES.includes(mode)) return;
  chosen = mode;
  try { localStorage.setItem(CAL_KEY, mode); } catch { /* blocked storage: for this visit only */ }
};

/* ------------------------------- extra lines on a booking's card ------------------------------- */
// Cards and rows are buttons, so each of these is a span with no control inside.
// "Overlaps with Chelsea Wolfe, 21:00": the other shows on the day whose sets run into this one's (model.overlapText).
// day: one day only, so a booking over several days speaks only of that day's clashes (nothing passes one now: a Week
// square says its day's note in its spoken name, from model.overlapText); without it (a Coming up card) it names every
// clash, each with its day.
export function overlapNote(b, day = '') {
  const text = model.overlapText(b, undefined, { day });
  return text ? h('span', { class: 'bk-overlap' }, text) : null;
}
// "Didn’t go": a show (not cancelled) the person said they missed, and have not scored since. The answer is tested
// first, so a card costs nothing for the bookings nobody answered (seenAnswer walks the act's log).
export function wentMark(b) {
  if (!b || b.went !== 'no' || b.kind !== 'show' || b.status === 'cancelled') return null;
  return model.seenAnswer(b) === 'no' ? h('span', { class: 'pill bk-went' }, 'Didn’t go') : null;
}
// "formerly The Night Owls": the line under the name of a booking from before its act changed its name
// (model.formerlyNote: the name the act had that night). null when there is nothing to say.
export function formerlyLine(b) {
  const text = model.formerlyNote(b);
  return text ? h('span', { class: 'bk-formerly' }, text) : null;
}
// What a Coming up card adds under its own lines, in this order: the overlap note, the venue's house rules
// (js/venues-rules.js) and "Didn’t go". A fault in the chip must not break a card. day: that day's clashes only
// (overlapNote); nothing passes one since the Week became squares.
export function cardExtras(b, { day = '' } = {}) {
  let chip = null;
  try { chip = rulesChip(b); } catch (e) { console.warn('house rules chip', e); }
  return [overlapNote(b, day), chip, wentMark(b)].filter(Boolean);
}
