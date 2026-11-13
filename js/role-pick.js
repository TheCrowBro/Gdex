// "Who's using Gdex?": the first-run question (askRole) and Settings → Your role (rolePanel). Each choice shows the
// menu it gives; choosing changes the menu at once (js/roles.js, js/app.js) and nothing in the data.
import { h, nodes, sheet, toast, announce } from './util.js';
import { ROLES, EVERYTHING, roleId, roleChosen, roleOf, setRole, menuSections, offMenu, sectionName } from './roles.js';
import { haptic, menuWords } from './a11y.js';

const NAMES = { bookings: 'Bookings', acts: 'Acts', people: 'People', songs: 'Songs', sessions: 'Studio log', backline: 'Backline', venues: 'Venues', money: 'Money', tools: 'Tools', insurance: 'Insurance', card: 'My card', settings: 'Settings' };
const nameIn = (r, id) => (r.names && r.names[id]) || NAMES[id] || id;
// The role's menu as words: "Bookings · Studio log · Songs …" (My card and Settings, last on every menu, are left out).
export const menuText = r => menuSections(r).filter(id => id !== 'settings' && id !== 'card').map(id => nameIn(r, id)).join(' · ');

function card(r, { on = false, radio = false, onPick }) {
  return h('button', {
    type: 'button', class: 'card tap rp-card' + (on ? ' on' : ''), 'data-role': r.id, id: radio ? 'rp-' + r.id : null, // the id keeps the focus through a redraw
    role: radio ? 'radio' : null, 'aria-checked': radio ? String(on) : null,
    onclick: () => onPick(r.id),
  },
  h('span', { class: 'rp-icon', 'aria-hidden': 'true' }, r.icon),
  // A sub name (Jack of Trades: Master of None) sits under the name; a comma only a screen reader gets joins the two in one name.
  h('span', { class: 'rp-text' }, h('strong', { class: 'rp-name' }, r.label, r.sub && h('span', { class: 'rp-comma sr-only' }, ',')), r.sub && h('span', { class: 'rp-sub' }, r.sub), h('span', { class: 'rp-blurb small' }, r.blurb),
    h('span', { class: 'rp-menu small muted' }, menuText(r))),
  radio && h('span', { class: 'rp-check', 'aria-hidden': 'true' }, on ? '✓' : ''));
}

const NUDGED = 'gdex-role-nudged';
const nudged = () => { try { localStorage.setItem(NUDGED, '1'); } catch { /* private mode */ } };
const settled = r => `Set up for ${r.label}: ${menuSections(r).length} sections on your menu`;
// The section menu in its own words (Aa → Section menu, js/a11y.js menuWords): the record player's sleeve, or the
// track list of the tape deck and the digital player.
const aboutText = () => `Your role sets the section menu: which sections are tracks and in what order, and the boxes on a booking. Gdex always opens on the calendar. Nothing is removed: sections not on the menu are bonus tracks on ${menuWords().list} (${menuWords().tap}), and links to them still open them.`;
const nudgeWords = () => [h('strong', null, 'New: a menu for the way you work. '), `Producer, manager, band, solo artist, scout or audiophile: Gdex puts the sections you use on the menu, and every other one stays on ${menuWords().list}.`];
// Switching the section menu (Aa) with the role card or Settings → Your role on screen changes their words at once.
window.addEventListener('gdex-prefs', () => {
  document.querySelectorAll('.rp-about').forEach(p => { p.textContent = aboutText(); });
  document.querySelectorAll('.rp-nudge-text').forEach(p => p.replaceChildren(...nudgeWords()));
});
// Once the role card has gone, the page takes the focus (#page), so the next Tab carries on from there.
const focusPage = () => document.getElementById('page')?.focus({ preventScroll: true });

// The first open: six roles, and Jack of Trades (every section) last. Picking one opens its start section (the calendar); then(…)
// runs the welcome tour. Closing it without a pick is an answer too: Gdex stays Jack of Trades (no role is saved), and the role card
// is never offered (gdex-role-nudged).
export function askRole({ then = () => {}, title = 'Who’s using Gdex?' } = {}) {
  let picked = false, close = () => {};
  const pick = id => {
    picked = true; haptic(); close();
    setRole(id, { start: true });
    announce(settled(roleOf(id)));
    then();
  };
  const body = h('div', { class: 'stack rp-ask' },
    h('p', { class: 'rp-intro' }, `Are you a producer, a manager, in a band, a solo artist, a scout or an audiophile? Pick the closest, and Gdex puts the sections you’ll use on your menu, in your words. You can change it any time under Settings → Your role. Nothing is ever deleted, and every other section stays one tap away on ${menuWords().list}.`),
    h('div', { class: 'list rp-list', role: 'group', 'aria-label': 'Roles' }, [...ROLES, EVERYTHING].map(r => card(r, { onPick: pick }))));
  ({ close } = sheet(title, body, { dismissOnBackdrop: false, onClose: () => { if (!picked) { nudged(); then(); } } }));
  setTimeout(() => document.querySelector('.rp-ask .rp-card')?.focus(), 60);
}

// For a device that used Gdex before roles came (its welcome tour done, no role): one card under the menu, once.
// Choose asks the question; Not now leaves Jack of Trades as it is. Either way it is not shown again (Settings → Your role
// is always there), and the focus goes to the page rather than nowhere.
export function nudgeRole(anchor) {
  try { if (localStorage.getItem(NUDGED) || roleChosen()) return; } catch { return; }
  if (!anchor || document.querySelector('.rp-nudge')) return;
  // The question opened from here has no opener to go back to (the card is gone): its then() puts the focus on the page.
  const done = () => { nudged(); card.remove(); };
  const notNow = () => { const had = card.contains(document.activeElement); done(); if (had) focusPage(); };
  const card = h('div', { class: 'card rp-nudge', role: 'region', 'aria-label': 'Set up Gdex for your role' },
    h('p', { class: 'rp-nudge-text' }, ...nudgeWords()),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn primary small', id: 'rp-nudge-go', onclick: () => { done(); askRole({ then: focusPage }); } }, 'Choose my role'),
      h('button', { type: 'button', class: 'btn ghost small', id: 'rp-nudge-no', onclick: notNow }, 'Not now')));
  anchor.after(card);
  // A role chosen anywhere else (Settings) answers it too.
  window.addEventListener('gdex-role', () => { if (card.isConnected) done(); }, { once: true });
}

// Settings → Your role: the six roles and Jack of Trades as one choice; what is on the menu, and the bonus tracks. A choice
// redraws the page (the app does, on gdex-role), and the redrawn card keeps the focus. Its words follow the section
// menu (record player, tape deck or digital player).
export function rolePanel() {
  const el = h('div', { class: 'stack rp-panel' });
  const draw = () => {
    const cur = roleId(), r = roleOf(cur), extra = offMenu(r);
    // nodes(): a line that does not apply (no bonus tracks, money on) is left out, not written as the word "null"
    el.replaceChildren(...nodes(
      h('p', { class: 'small muted rp-about' }, aboutText()),
      h('div', { class: 'list rp-list', role: 'radiogroup', 'aria-label': 'Your role' }, [...ROLES, EVERYTHING].map(x => card(x, { on: x.id === cur, radio: true, onPick: id => {
        if (id === roleId() && roleChosen()) return;
        haptic(); setRole(id); toast(`${roleOf(id).label}: the menu is set up for it. Nothing was deleted.`); announce(settled(roleOf(id)));
        if (el.isConnected) { draw(); el.querySelector(`[data-role="${id}"]`)?.focus({ preventScroll: true }); }
      } }))),
      extra.length ? h('p', { class: 'small muted rp-bonus' }, 'Bonus tracks for this role: ' + extra.map(id => sectionName(id, NAMES[id])).join(', ') + '.') : null,
      r.money === false ? h('p', { class: 'small muted rp-money' }, 'Fees, deals and settlements are off for this role. Booking acts and settling shows yourself? Manager or Jack of Trades has them. Quotes & invoices come back with a role that uses money, or with Jack of Trades.') : null,
      h('p', { class: 'small muted' }, 'Kept on this device, not in backups: on a new phone you pick it again when Gdex first opens.'),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost', id: 'rp-tour', onclick: () => import('./tour.js').then(m => m.startTour()) }, '🧭 Show me around'))));
  };
  draw();
  return el;
}
