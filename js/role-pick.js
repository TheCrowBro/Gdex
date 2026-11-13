// "Who's using Gdex?": the first-run question (askRole) and Settings → Your role (rolePanel). Each choice shows the
// menu it gives; choosing changes the menu at once (js/roles.js, js/app.js) and nothing in the data.
import { h, nodes, sheet, toast, announce } from './util.js';
import { ROLES, EVERYTHING, roleId, roleChosen, roleOf, setRole, menuSections, offMenu, sectionName, roleNeedsLicence } from './roles.js';
import { haptic, menuWords } from './a11y.js';
// The licence (decisions §9): which roles are free, which need a licence, and the free days left. All of it says nothing
// while licences are off.
import { LICENCE_EVENT, licenceOn, mayPickRole, roleBadge } from './licence-state.js';
import { termsDue, askTerms } from './terms.js';

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
    h('span', { class: 'rp-menu small muted' }, menuText(r)),
    roleBadge(r.id) && h('span', { class: 'rp-licence small' }, roleBadge(r.id))),
  radio && h('span', { class: 'rp-check', 'aria-hidden': 'true' }, on ? '✓' : ''));
}
// Before a role is set: a role that needs a licence the free days are over for is offered one instead (nothing changes);
// any other working role asks the terms first while they are due: the first time, and again when they have changed
// (Not now: nothing changes). Resolves true when the role may be set now; the free days then start as it is used
// (js/app.js).
async function mayPick(id) {
  const may = mayPickRole(id);
  if (may === 'locked') { import('./licence.js').then(m => m.offerRole(id)).catch(e => console.error(e)); return false; }
  if (may !== 'locked' && roleNeedsLicence(id) && termsDue(licenceOn()) && !(await askTerms())) return false;
  return true;
}
// The first-run question's added sentence while licences are on (§9.2).
const licenceIntro = () => (licenceOn() ? ' Audiophile is free. The other roles, and Everything, are free for 30 days on this device, then need a licence: 20 USD once plus any tax where you live, for up to 3 of your devices.' : '');

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

// The first open: six roles, or everything. Picking one opens its start section (the calendar); then(…) runs the welcome tour.
// Closing it without a pick is an answer too: Everything stays, and the role card is never offered (gdex-role-nudged).
export function askRole({ then = () => {}, title = 'Who’s using Gdex?' } = {}) {
  let picked = false, close = () => {};
  const pick = async id => {
    if (!(await mayPick(id))) return;
    picked = true; haptic(); close();
    setRole(id, { start: true });
    if (id !== 'all') announce(settled(roleOf(id)));
    then();
  };
  const body = h('div', { class: 'stack rp-ask' },
    h('p', { class: 'rp-intro' }, `Are you a producer, a manager, in a band, a solo artist, a scout or an audiophile? Pick the closest, and Gdex puts the sections you’ll use on your menu, in your words. You can change it any time under Settings → Your role. Nothing is ever deleted, and every other section stays one tap away on ${menuWords().list}.${licenceIntro()}`),
    h('div', { class: 'list rp-list', role: 'group', 'aria-label': 'Roles' }, ROLES.map(r => card(r, { onPick: pick }))),
    h('button', { type: 'button', class: 'btn ghost rp-all', 'data-role': 'all', onclick: () => pick('all') }, `${EVERYTHING.icon} Not sure? Show me everything`, roleBadge('all') && h('span', { class: 'rp-licence small' }, roleBadge('all'))));
  ({ close } = sheet(title, body, { dismissOnBackdrop: false, onClose: () => { if (!picked) { nudged(); then(); } } }));
  setTimeout(() => document.querySelector('.rp-ask .rp-card')?.focus(), 60);
}

// For a device that used Gdex before roles came (its welcome tour done, no role): one card under the menu, once.
// Choose asks the question; Not now leaves Everything as it is. Either way it is not shown again (Settings → Your role
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

// Settings → Your role: the six roles and Everything as one choice; what is on the menu, and the bonus tracks. A choice
// redraws the page (the app does, on gdex-role), and the redrawn card keeps the focus. Its words follow the section
// menu (record player, tape deck or digital player).
export function rolePanel() {
  const el = h('div', { class: 'stack rp-panel' });
  const draw = () => {
    const cur = roleId(), r = roleOf(cur), extra = offMenu(r);
    // nodes(): a line that does not apply (no bonus tracks, money on) is left out, not written as the word "null"
    el.replaceChildren(...nodes(
      h('p', { class: 'small muted rp-about' }, aboutText()),
      h('div', { class: 'list rp-list', role: 'radiogroup', 'aria-label': 'Your role' }, [...ROLES, EVERYTHING].map(x => card(x, { on: x.id === cur, radio: true, onPick: async id => {
        if (id === roleId() && roleChosen()) return;
        if (!(await mayPick(id))) return; // offered a licence (or the terms not agreed): the role stays as it was
        haptic(); setRole(id); toast(`${roleOf(id).label}: the menu is set up for it. Nothing was deleted.`); announce(settled(roleOf(id)));
        if (el.isConnected) { draw(); el.querySelector(`[data-role="${id}"]`)?.focus({ preventScroll: true }); }
      } }))),
      licenceOn() ? licenceSlot() : null,
      extra.length ? h('p', { class: 'small muted rp-bonus' }, 'Bonus tracks for this role: ' + extra.map(id => sectionName(id, NAMES[id])).join(', ') + '.') : null,
      r.money === false ? h('p', { class: 'small muted rp-money' }, 'Fees, deals and settlements are off for this role. Booking acts and settling shows yourself? Manager or Everything has them. Quotes & invoices come back with a role that uses money, or with Everything.') : null,
      h('p', { class: 'small muted' }, 'Kept on this device, not in backups: on a new phone you pick it again when Gdex first opens.'),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost', id: 'rp-tour', onclick: () => import('./tour.js').then(m => m.startTour()) }, '🧭 Show me around'))));
  };
  draw();
  // The badges follow the licence (the free days started or ran out, a sign-in) while the panel is on screen.
  const onLicence = () => { if (!el.isConnected) { window.removeEventListener(LICENCE_EVENT, onLicence); return; } const had = el.contains(document.activeElement) && document.activeElement.dataset.role; draw(); if (had) el.querySelector(`[data-role="${had}"]`)?.focus({ preventScroll: true }); };
  window.addEventListener(LICENCE_EVENT, onLicence);
  return el;
}
// Settings → Your role: the licence in a line, under the cards (js/licence.js, loaded while licences are on).
function licenceSlot() {
  const slot = h('div', { class: 'rp-licence-slot' });
  import('./licence.js').then(m => slot.replaceChildren(m.roleLicenceLine())).catch(e => console.error(e));
  return slot;
}
