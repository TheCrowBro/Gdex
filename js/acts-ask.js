// "Did you see them?": after a show is over, Tourbook asks whether the person saw the act. Yes takes a score out of 100 for
// the act's card (the "Log a time seen" form, with the show's date, place and booking filled in); No marks the show
// "Didn’t go", so it stays on the calendar, is never counted as seen and is never asked about again. Who is asked is
// js/roles.js askSeen(); which shows are waiting is js/model.js waitingShows().
// js/app.js calls askAtOpen(ids) with the shows that were waiting as Tourbook opened, and again, with the list as it stands
// by then, each time Tourbook comes back after three hours or more out of sight. So it may be called many times in a visit:
// each call opens the sheet before it returns, or does nothing (the person is not asked, no show of those is still
// waiting, or the sheet is already up: there are never two). Settings → Your role draws askPref().
// The sheet remembers nothing: a row's answer is always read from the store (model.seenAnswer), and every answer is
// saved as it is given, so closing the sheet loses nothing.
import { h, sheet, announce, fmtShort, fmtLong } from './util.js';
import { byId, subscribe } from './store.js';
import { waitingShows, seenAnswer, seenEntryFor, ratingOf, markWent, venueOf } from './model.js';
import { formerlyOf } from './model.js'; // the name the act had on the night of a show from before it changed its name
import { askSeen, askSetting, setAskSetting, askDefault, moneyShown, pageOpt } from './roles.js';
import { haptic } from './a11y.js';
import { sheetTutorial } from './tour.js';
import { stripeStyle } from './acts-docs.js';
import { logSighting } from './pages/acts.js';

const TITLE = 'Did you see them?';
const actOf = b => (b && b.actId ? byId('acts', b.actId) : null);
const nameOf = act => (act && act.name) || 'Unnamed act';
// A show's last day, as model.showEnd reads it: an end date counts only when it is a date after the first day.
const lastDay = b => (/^\d{4}-\d{2}-\d{2}$/.test(b.endDate || '') && b.endDate > b.date ? b.endDate : b.date);
// A show the sheet can still ask about, or show the answer to: it is there, still a show that is on, with its act.
const stillHere = b => !!(b && b.kind === 'show' && b.status !== 'cancelled' && actOf(b));

let SHEET = null; // the question's sheet while it is up (its dialog element)
const SLIP_MS = 300; // how long a row ignores the finger or the mouse after its answer: a double tap is over by then
// A held Enter key acts once: its repeats would go on to press the button each answer puts in the place of the last.
const noRepeat = e => { if (e.repeat && e.key === 'Enter') e.preventDefault(); };

// Opens "Did you see them?" for the ids still waiting; nothing when the person is not asked, none is left, or the
// sheet is already up. A role with money is not asked about a hold or an offer (it never happened).
export function askAtOpen(ids) {
  if (SHEET && SHEET.isConnected) return;
  if (!Array.isArray(ids) || !ids.length || !askSeen()) return;
  // The list is fixed here, newest first: an answered row stays in it and shows its answer.
  const list = waitingShows(new Date(), { holds: !moneyShown() }).filter(b => ids.includes(b.id)).map(b => b.id);
  if (!list.length) return;

  const listBox = h('div', { class: 'list ac-ask-list', onkeydown: noRepeat });
  let el = null, close = () => {}, stop = () => {};
  const firstIn = id => { const row = [...listBox.children].find(r => r.dataset.id === id); return row ? row.querySelector('button') : null; };
  // The button pressed takes the focus (a tap does not give it on every phone), so the form opened from it gives the
  // focus back to this row, and the redraw after an answer finds the row again.
  // An answer puts another button where the one pressed was (No becomes Change), and a second press would land on it
  // and take the answer straight back. So a row's buttons ignore the second click of a double click or double tap, and,
  // for a phone that does not count taps, any press with a finger or the mouse on that row in the moment after its answer.
  let answered = { id: '', at: 0 };
  const tap = (id, fn) => e => {
    if (e.detail > 1 || (e.detail === 1 && answered.id === id && performance.now() - answered.at < SLIP_MS)) return;
    e.currentTarget.focus({ preventScroll: true }); fn();
  };
  const mark = (id, no) => { markWent(id, no); answered = { id, at: performance.now() }; };

  function row(b) {
    const act = actOf(b), name = nameOf(act), answer = seenAnswer(b), venue = venueOf(b).name, last = lastDay(b);
    const when = fmtShort(b.date) + (last > b.date ? ' – ' + fmtShort(last) : '');
    let part;
    if (answer === 'seen') {
      const entry = seenEntryFor(act, b), r = ratingOf(entry);
      part = [
        h('span', { class: 'ac-ask-done' }, h('span', { 'aria-hidden': 'true' }, '★ '), r != null ? `Scored ${r}/100` : 'Seen, no score yet'),
        h('button', { type: 'button', class: 'btn ghost small', id: 'ac-ask-edit-' + b.id, 'aria-label': `Edit the time you saw ${name}`,
          onclick: tap(b.id, () => { const cur = byId('bookings', b.id), a = actOf(cur), had = a && seenEntryFor(a, cur); if (had) logSighting(a, had); else fill(); }) }, '✎ Edit'),
      ];
    } else if (answer === 'no') {
      part = [
        h('span', { class: 'ac-ask-done' }, 'Didn’t go'),
        h('button', { type: 'button', class: 'btn ghost small', id: 'ac-ask-change-' + b.id, 'aria-label': `Change your answer for ${name}`, onclick: tap(b.id, () => mark(b.id, false)) }, 'Change'),
      ];
    } else {
      const day = fmtLong(b.date);
      part = [
        h('button', { type: 'button', class: 'btn primary small', id: 'ac-ask-yes-' + b.id, 'aria-label': `Yes, I saw ${name} on ${day}`,
          onclick: tap(b.id, () => {
            const cur = byId('bookings', b.id), a = actOf(cur); // read at the tap: the act as it is now
            if (!stillHere(cur)) return fill();
            logSighting(a, { date: cur.date, venueId: cur.venueId || '', where: cur.venueId ? '' : (cur.venueName || ''), bookingId: cur.id });
          }) }, 'Yes'),
        h('button', { type: 'button', class: 'btn ghost small', id: 'ac-ask-no-' + b.id, 'aria-label': `No, I didn’t see ${name} on ${day}`,
          onclick: tap(b.id, () => { mark(b.id, true); haptic(); announce(`${name}: marked Didn’t go`); }) }, 'No'),
      ];
    }
    return h('div', { class: 'card ac-ask-row', 'data-id': b.id, style: stripeStyle(act) },
      h('span', { class: 'ac-ask-main' }, h('strong', null, name), formerlyOf(b) && h('span', { class: 'ac-formerly' }, 'formerly ' + formerlyOf(b)), h('span', { class: 'small muted' }, when + (venue ? ' · ' + venue : ''))),
      h('span', { class: 'ac-ask-answer' }, part));
  }

  // Draws the rows from the store. A row whose show has gone (deleted, or left without its act) goes too; with no row
  // left the sheet closes. The focus stays with the row it was in: after a save its Yes has become ✎ Edit.
  function fill() {
    const shows = list.map(id => byId('bookings', id)).filter(stillHere);
    if (!shows.length) { close(); return; }
    const at = document.activeElement, had = !!(el && at && el.contains(at));
    const rowId = had && at.closest('.ac-ask-row') ? at.closest('.ac-ask-row').dataset.id : '';
    listBox.replaceChildren(...shows.map(row));
    if (had && !el.contains(document.activeElement)) (firstIn(rowId) || listBox.querySelector('button') || el.querySelector('#ac-ask-close'))?.focus({ preventScroll: true });
  }

  fill();
  const body = h('div', { class: 'ac-ask' },
    h('p', { class: 'small muted' }, list.length === 1 ? 'This show is over. Tap Yes if you saw it and give a score, or No if you missed it. Close this any time: until you answer, Tourbook asks again for two weeks after the show.'
      : 'These shows are over. Tap Yes for the ones you saw and give a score, or No for the ones you missed. Close this any time: Tourbook asks again about the rest for two weeks after each show.'),
    listBox,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost', id: 'ac-ask-close', onclick: () => close() }, 'Done')));
  ({ el, close } = sheet(TITLE, body, {
    dismissOnBackdrop: false,
    onClose: () => {
      stop(); SHEET = null;
      // There is no opener to go back to at open; coming back from the background there may be one, and it keeps the focus.
      const at = document.activeElement;
      if (!at || at === document.body) document.getElementById('page')?.focus({ preventScroll: true });
    },
  }));
  SHEET = el;
  stop = subscribe(fill);
  setTimeout(() => { if (SHEET === el && el.isConnected && !el.contains(document.activeElement)) listBox.querySelector('button')?.focus({ preventScroll: true }); }, 60);
}

// The Settings control (Settings → Your role) that turns the question on or off for this device: follow the role,
// always ask, never ask. A group of pressed buttons, not radios (Your role has one radio group: the roles).
const CHOICES = [['', 'ac-ask-auto', 'Follow my role'], ['on', 'ac-ask-on', 'Always ask'], ['off', 'ac-ask-off', 'Never ask']];
const prefNote = cur => (cur === 'on' ? 'Tourbook asks about every show that has finished, for two weeks after it.'
  // Never ask: a role that scores shows (a scout, an audiophile) keeps ★ Score on a show's own page; anyone else has it there only while they are asked
  : cur === 'off' ? (pageOpt('bookings', 'score', false) ? 'Tourbook never asks. You can still score a show from its own page or the act’s card.' : 'Tourbook never asks. You can still score a show from the act’s card.')
    : askDefault() ? 'Your role is asked: when Tourbook opens, it lists the shows that have finished so you can score the ones you saw.'
      : 'Your role is not asked. Choose Always ask to be asked anyway.');
export function askPref() {
  const el = h('div', { class: 'pref ac-ask-pref', role: 'group', 'aria-label': 'Ask after a show' });
  const draw = () => {
    const cur = askSetting();
    el.replaceChildren(
      h('div', { class: 'pref-label' }, 'After a show, ask “Did you see them?”'),
      // data-label: the stylesheet keeps room for the words in bold, so the row does not shift when the choice changes
      h('div', { class: 'seg wide' }, CHOICES.map(([v, id, label]) => h('button', { type: 'button', id, class: cur === v ? 'on' : '', 'aria-pressed': String(cur === v), 'data-label': label,
        onclick: () => { setAskSetting(v); haptic(); draw(); el.querySelector('#' + id)?.focus({ preventScroll: true }); } }, label))), // the redrawn twin keeps the focus
      h('p', { class: 'small muted ac-ask-note' }, prefNote(cur)));
  };
  draw();
  return el;
}

sheetTutorial(TITLE, [
  { title: 'Shows that are over', text: 'Every show on your calendar that finished in the last two weeks and has no answer yet.', target: ['.ac-ask-list'] },
  { title: 'Yes or No', text: 'Yes opens the score form with the date and place filled in. No marks the show Didn’t go: it stays on your calendar and is never counted as seen.', target: ['.ac-ask-row'] },
  { title: 'Later', text: 'Close this and Tourbook asks again next time, for two weeks after the show. You can also answer on the show’s own page, and turn the question off under Settings → Your role.', target: ['#ac-ask-close'] },
]);
