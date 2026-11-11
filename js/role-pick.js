// "Who's using Gdex?": the first-run question (askRole) and Settings → Your role (rolePanel). Each choice shows the
// menu it gives; choosing changes the menu at once (js/roles.js, js/app.js) and nothing in the data.
import { h, sheet, toast, announce } from './util.js';
import { ROLES, EVERYTHING, roleId, roleChosen, roleOf, setRole, menuSections, offMenu, sectionName } from './roles.js';
import { haptic } from './a11y.js';

const NAMES = { bookings: 'Bookings', acts: 'Acts', people: 'People', songs: 'Songs', sessions: 'Studio log', backline: 'Backline', venues: 'Venues', money: 'Money', tools: 'Tools', insurance: 'Insurance', settings: 'Settings' };
const nameIn = (r, id) => (r.names && r.names[id]) || NAMES[id] || id;
// The role's menu as words: "Bookings · Studio log · Songs …" (Settings, always last, is left out).
export const menuText = r => menuSections(r).filter(id => id !== 'settings').map(id => nameIn(r, id)).join(' · ');

function card(r, { on = false, radio = false, onPick }) {
  return h('button', {
    type: 'button', class: 'card tap rp-card' + (on ? ' on' : ''), 'data-role': r.id, id: radio ? 'rp-' + r.id : null, // the id keeps the focus through a redraw
    role: radio ? 'radio' : null, 'aria-checked': radio ? String(on) : null,
    onclick: () => onPick(r.id),
  },
  h('span', { class: 'rp-icon', 'aria-hidden': 'true' }, r.icon),
  h('span', { class: 'rp-text' }, h('strong', { class: 'rp-name' }, r.label), h('span', { class: 'rp-blurb small' }, r.blurb),
    h('span', { class: 'rp-menu small muted' }, menuText(r))),
  radio && h('span', { class: 'rp-check', 'aria-hidden': 'true' }, on ? '✓' : ''));
}

const NUDGED = 'gdex-role-nudged';
const settled = r => `Set up for ${r.label}: ${menuSections(r).length} sections on your menu`;

// The first open: six roles, or everything. Picking one opens its start section; then(…) runs the welcome tour.
export function askRole({ then = () => {}, title = 'Who’s using Gdex?' } = {}) {
  let picked = false, close = () => {};
  const pick = id => {
    picked = true; haptic(); close();
    setRole(id, { start: true });
    if (id !== 'all') announce(settled(roleOf(id)));
    then();
  };
  const body = h('div', { class: 'stack rp-ask' },
    h('p', { class: 'rp-intro' }, 'Are you a producer, a manager, in a band, a solo artist, a scout or an audiophile? Pick the closest, and Gdex puts the sections you’ll use on your menu, in your words. You can change it any time under Settings → Your role. Nothing is ever deleted, and every other section stays one tap away on the sleeve.'),
    h('div', { class: 'list rp-list', role: 'group', 'aria-label': 'Roles' }, ROLES.map(r => card(r, { onPick: pick }))),
    h('button', { type: 'button', class: 'btn ghost rp-all', 'data-role': 'all', onclick: () => pick('all') }, `${EVERYTHING.icon} Not sure? Show me everything`));
  ({ close } = sheet(title, body, { dismissOnBackdrop: false, onClose: () => { if (!picked) then(); } }));
  setTimeout(() => document.querySelector('.rp-ask .rp-card')?.focus(), 60);
}

// For a device that used Gdex before roles came (its welcome tour done, no role): one card under the menu, once.
// Choose asks the question; Not now leaves Everything as it is. Either way it is not shown again (Settings → Your role
// is always there).
export function nudgeRole(anchor) {
  try { if (localStorage.getItem(NUDGED) || roleChosen()) return; } catch { return; }
  if (!anchor || document.querySelector('.rp-nudge')) return;
  const done = () => { try { localStorage.setItem(NUDGED, '1'); } catch { /* private mode */ } card.remove(); };
  const card = h('div', { class: 'card rp-nudge', role: 'region', 'aria-label': 'Set up Gdex for your role' },
    h('p', { class: 'rp-nudge-text' }, h('strong', null, 'New: a menu for the way you work. '), 'Producer, manager, band, solo artist, scout or audiophile: Gdex puts the sections you use on the menu, and every other one stays on the sleeve.'),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn primary small', id: 'rp-nudge-go', onclick: () => { done(); askRole(); } }, 'Choose my role'),
      h('button', { type: 'button', class: 'btn ghost small', id: 'rp-nudge-no', onclick: done }, 'Not now')));
  anchor.after(card);
  // A role chosen anywhere else (Settings) answers it too.
  window.addEventListener('gdex-role', () => { if (card.isConnected) done(); }, { once: true });
}

// Settings → Your role: the six roles and Everything as one choice; what is on the menu, and the bonus tracks. A choice
// redraws the page (the app does, on gdex-role), and the redrawn card keeps the focus.
export function rolePanel() {
  const el = h('div', { class: 'stack rp-panel' });
  const draw = () => {
    const cur = roleId(), r = roleOf(cur), extra = offMenu(r);
    el.replaceChildren(
      h('p', { class: 'small muted' }, 'Your role sets the section menu: which sections are tracks, in what order, which one opens first, and the boxes on a booking. Nothing is removed: sections not on the menu are bonus tracks on the sleeve (tap the record), and links to them still open them.'),
      h('div', { class: 'list rp-list', role: 'radiogroup', 'aria-label': 'Your role' }, [...ROLES, EVERYTHING].map(x => card(x, { on: x.id === cur, radio: true, onPick: id => {
        if (id === roleId() && roleChosen()) return;
        haptic(); setRole(id); toast(`${roleOf(id).label}: the menu is set up for it. Nothing was deleted.`); announce(settled(roleOf(id)));
        if (el.isConnected) { draw(); el.querySelector(`[data-role="${id}"]`)?.focus({ preventScroll: true }); }
      } }))),
      extra.length ? h('p', { class: 'small muted rp-bonus' }, 'Bonus tracks for this role: ' + extra.map(id => sectionName(id, NAMES[id])).join(', ') + '.') : null,
      r.money === false ? h('p', { class: 'small muted rp-money' }, 'Fees, deals and settlements are off for this role. Booking acts and settling shows yourself? Manager or Everything has them.') : null,
      h('p', { class: 'small muted' }, 'Kept on this device, not in backups: on a new phone you pick it again when Gdex first opens.'),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost', id: 'rp-tour', onclick: () => import('./tour.js').then(m => m.startTour()) }, '🧭 Show me around')));
  };
  draw();
  return el;
}
