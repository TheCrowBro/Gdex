import { h, toast } from './util.js';
import { createDeck } from './deck.js';
import * as store from './store.js';
import { applyPrefs, openDisplaySettings } from './a11y.js';
import { initInstall } from './install.js';
import { initSearch } from './search.js';
import { startTour, tourSeen } from './tour.js';
import { initClockBar } from './clock.js';
import { initUpdates } from './update.js';
import { bookings } from './pages/bookings.js';
import { roleChosen, menuSections, offMenu, startSection, sectionName, askSeen, moneyShown } from './roles.js';
import { waitingShows } from './model.js';

applyPrefs();
try { localStorage.removeItem('gdex-tab'); } catch { /* blocked storage */ } // the section open last no longer decides where Gdex opens
const help = () => import('./tutorials.js').then(m => m.openTutorial()); // the tutorials load on first use
document.getElementById('helpBtn')?.addEventListener('click', help);
window.logiHelp = help; // sheets show a ? too
document.getElementById('displayBtn')?.addEventListener('click', openDisplaySettings);
initInstall(document.getElementById('installBtn'));
initSearch(document.getElementById('searchBtn')); // the magnifying glass, and "/" (js/search.js)
initClockBar(document.getElementById('clockbar'));

// Gdex always opens on Bookings (the calendar), so it loads with the app. Every other section is fetched and parsed the first
// time it is opened (the service worker keeps them all offline regardless), which keeps the start-up parse small.
// Sections are known by their id everywhere (window.logiGo('venues')), never by position: which ones are tracks on the
// section menu, and in what order, depends on the role (js/roles.js). A section off the role's menu opens all the same
// (from a link, or from the sleeve's bonus tracks) and sits on the record as a bonus track until you move on.
const section = (id, label, icon, load, count) => ({ id, label, icon, load, count });
// Each section's count shows as its "length" on the section menu's track list (and under Now playing).
const many = (list, one, more) => () => ({ n: (store.db[list] || []).length, one, many: more });
const ALL_TABS = [
  { id: bookings.id, label: bookings.label, icon: bookings.icon, page: bookings, count: () => ({ n: store.upcoming().length, one: 'coming up', many: 'coming up' }) },
  section('acts', 'Acts', '🎸', () => import('./pages/acts.js').then(m => m.acts), many('acts', 'act', 'acts')),
  section('people', 'People', '👥', () => import('./pages/people.js').then(m => m.people), many('people', 'person', 'people')),
  section('songs', 'Songs', '🎼', () => import('./pages/songs.js').then(m => m.songs), many('songs', 'song', 'songs')),
  section('sessions', 'Studio log', '🎙️', () => import('./pages/sessions.js').then(m => m.sessions), many('logs', 'take log', 'take logs')),
  section('backline', 'Backline', '🎛️', () => import('./pages/backline.js').then(m => m.backline), () => ({ n: store.db.gear.reduce((t, g) => t + store.qtyOf(g), 0), one: 'item', many: 'items' })), // pieces, as the Backline page counts them
  section('venues', 'Venues', '📍', () => import('./pages/venues.js').then(m => m.venues), many('venues', 'place', 'places')),
  section('money', 'Money', '💰', () => import('./pages/money.js').then(m => m.money)),
  section('tools', 'Tools', '🎚️', () => import('./pages/tools.js').then(m => m.tools), () => ({ n: 5, one: 'tool', many: 'tools' })),
  section('insurance', 'Insurance', '🛡️', () => import('./pages/insurance.js').then(m => m.insurance), many('insurance', 'policy', 'policies')),
  section('settings', 'Settings', '⚙️', () => import('./pages/settings.js').then(m => m.settings)),
];
const BASE = new Map(ALL_TABS.map(t => [t.id, t.label])); // each section's own name; a role may call it something else
const tabOf = id => ALL_TABS.find(t => t.id === id) || null;
let guest = null; // the off-menu section open as a bonus track, if any
// The menu for the current role: its sections in order, then the bonus track. Names follow the role.
function buildTabs() {
  ALL_TABS.forEach(t => { t.label = sectionName(t.id, BASE.get(t.id)); });
  const ids = menuSections();
  if (guest && (ids.includes(guest) || !tabOf(guest))) guest = null;
  const list = ids.map(tabOf).filter(Boolean);
  if (guest) { const t = tabOf(guest); list.push({ id: t.id, label: t.label, icon: t.icon, count: t.count, bonus: true }); }
  return list;
}
let tabs = buildTabs();
const extras = () => offMenu().map(tabOf).filter(Boolean);
// Every section, the role's menu first (the tutorials' chooser lists them all).
window.gdexPages = () => [...tabs.filter(t => !t.bonus).map(t => tabOf(t.id)), ...extras()].map(t => ({ id: t.id, label: t.label, icon: t.icon, page: t.page || null }));
const pageOf = x => { const t = tabOf(x.id); return t.page ? Promise.resolve(t.page) : (t.loading || (t.loading = t.load().then(p => { t.page = p; return p; }).catch(e => { t.loading = null; throw e; }))); };
const page = document.getElementById('page');
let current = -1;
let cleanup = null;

let showing = Promise.resolve(), showToken = 0;
function show(i, dir = 0) {
  const token = ++showToken;
  current = i;
  showing = pageOf(tabs[i]).then(p => {
    if (token !== showToken) return; // the drum moved on while this section was loading
    cleanup && cleanup();
    cleanup = null;
    const holder = h('section', { class: 'page-card' + (dir ? ' fade-in' : ''), 'aria-label': tabs[i] ? tabs[i].label : p.label, 'data-page': p.id }); // the role's name for it (Roster, Gigs…)
    page.replaceChildren(holder);
    cleanup = p.render(holder) || null;
  }).catch(e => { console.error(e); toast('That section could not be loaded. Check the connection and try again.'); });
  return showing;
}

// Re-render the active page when data changes (live tools keep their own state: their page sets static: true).
// Redraws are coalesced: a burst of changes in one go (an import, a sample loaded) draws the page once.
let redrawQueued = false;
// What identifies a control across a redraw: its kind, its id or label, and the text around it (a checklist box is
// known by its line). The same control in the new page gets the focus back, so ticking by keyboard stays in place.
// A control with an id is known by its id alone, so one whose words change (a status pill: Hold ▾ → Confirmed ▾) keeps it.
const focusKey = el => (el && el !== document.body && page.contains(el) ? (el.id ? `${el.tagName}|#${el.id}` : [el.tagName, el.type || '', el.getAttribute('aria-label') || el.name || '', ((el.closest('label') || el).textContent || '').trim().slice(0, 80)].join('|')) : null);
function redraw() {
  redrawQueued = false;
  const p = current >= 0 && tabs[current] && tabOf(tabs[current].id).page;
  if (!p || p.static) return; // a section still loading draws itself fresh when it arrives
  const y = window.scrollY, key = focusKey(document.activeElement);
  const holder = page.firstElementChild;
  if (!holder) return;
  cleanup && cleanup();
  holder.replaceChildren();
  cleanup = p.render(holder) || null;
  window.scrollTo(0, y);
  if (key) { const again = [...holder.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex]')].find(el => focusKey(el) === key); if (again) again.focus({ preventScroll: true }); }
}
// After the current event, not inside it: a box that saves on change redraws once the browser has moved the focus to
// the next box (Tab or a tap), so focusKey finds that box again in the new page.
// And never while a mouse button or finger is down: the press would land on a button the redraw then replaces, and the
// click would be lost (type in a box, then click Mark settled). The redraw waits for the release (at most 1.5 s).
let pressed = false, pressTimer = 0;
const flush = () => { clearTimeout(pressTimer); if (redrawQueued) setTimeout(redraw, 0); };
document.addEventListener('pointerdown', () => { pressed = true; clearTimeout(pressTimer); pressTimer = setTimeout(() => { pressed = false; flush(); }, 1500); }, true);
for (const t of ['pointerup', 'pointercancel']) document.addEventListener(t, () => { if (!pressed) return; pressed = false; setTimeout(flush, 0); }, true); // after the click that follows the release
let deck = null; // the section menu, made below once the start section is known
store.subscribe(() => { deck && deck.refresh(); if (redrawQueued) return; redrawQueued = true; if (!pressed) setTimeout(redraw, 0); });

// Where to start: always the role's start section, the calendar (js/roles.js).
const start = Math.max(0, tabs.findIndex(t => t.id === startSection()));
const nav = document.getElementById('deck');
// Moving to any other track puts the bonus track back on the sleeve.
function select(i, dir) {
  if (guest && tabs[i] && tabs[i].id !== guest) { guest = null; tabs = buildTabs(); deck.setTabs(tabs, i); }
  showNav(); show(i, dir);
}
deck = createDeck(nav, tabs, { start, onSelect: select, extras, onExtra: id => window.logiGo(id) });
// The section menu: hidden by a slide while the page scrolls down, back the moment it scrolls up, and always there near
// the top, when a section changes, when something in it takes the focus, and when a tour starts.
function showNav() { nav.classList.remove('tucked'); }
window.logiShowNav = showNav;
{
  let lastY = window.scrollY, ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY, dy = y - lastY; lastY = y;
      if (y <= nav.offsetHeight || dy < -6) showNav();
      else if (dy > 6 && !document.querySelector('.sheet-back')) nav.classList.add('tucked');
    });
  }, { passive: true });
  nav.addEventListener('focusin', showNav);
}
show(start);
// Jump to a section by id ('venues') and resolve once it is drawn. Unknown ids stay where they are. A section that is
// not on the role's menu comes onto the record as the bonus track.
window.logiGo = id => {
  let i = typeof id === 'number' ? id : tabs.findIndex(t => t.id === id);
  if (i < 0 && typeof id === 'string' && tabOf(id)) {
    const onGuest = !!(guest && tabs[current] && tabs[current].id === guest);
    guest = id; tabs = buildTabs(); i = tabs.length - 1;
    if (onGuest) { deck.setTabs(tabs, i); showNav(); return show(i, 1); } // one bonus track for another
    deck.setTabs(tabs, current);
  }
  if (i < 0 || i >= tabs.length) return showing;
  if (i === current) return showing;
  deck.go(i);
  return showing;
};
// A new role (Settings → Your role, or the first-run question): the menu changes in place. From Settings you stay on
// Settings; a role chosen at the first-run question opens on its start section, the calendar.
window.addEventListener('gdex-role', e => {
  const was = tabs[current] ? tabs[current].id : null;
  guest = null; tabs = buildTabs();
  const want = (e.detail && e.detail.start) || !was ? startSection() : was;
  let i = tabs.findIndex(t => t.id === want);
  if (i < 0) { guest = want; tabs = buildTabs(); i = tabs.length - 1; } // still on screen: kept as the bonus track
  deck.setTabs(tabs, i);
  if (want !== was) show(i, 0);
  else { current = i; page.firstElementChild?.setAttribute('aria-label', tabs[i].label); redraw(); } // the same page, perhaps with its role's name and boxes
});
window.logiPage = () => (tabs[current] ? tabs[current].id : null); // which section is open (the tutorials use it)

/* ----------------------- backups ----------------------- */
document.getElementById('cloudBtn')?.addEventListener('click', () => import('./backup.js').then(m => m.openBackupSheet()).catch(e => { console.error(e); toast('Backups could not be opened.'); }));

const idle = window.requestIdleCallback ? fn => requestIdleCallback(fn, { timeout: 2500 }) : fn => setTimeout(fn, 1200);
idle(() => import('./backup.js').then(m => m.nudgeIfStale && m.nudgeIfStale()).catch(() => {}));
// First launch: who are you (the role sets the menu), then the welcome walkthrough for that role. After them, or on any
// later open: "Did you see them?" about the shows that are over (js/acts-ask.js).
const waitingIds = holds => { try { return waitingShows(new Date(), { holds }).map(b => b.id); } catch { return []; } };
// Shows that were over, with no answer, as Gdex opened. Holds are counted here and sifted by role when the sheet opens.
let due = waitingIds(true);
// Nothing opens over a sheet or the welcome tour (the sleeve, tapped in the first moment): it waits until they are gone.
const whenClear = fn => { const t = () => (document.querySelector('.sheet-back, .tour') ? setTimeout(t, 300) : fn()); t(); };
// One question at a time: `asking` while a call waits for a clear screen (it asks about the list as it is by then), and
// `askSheet` is the question's own sheet while it is up (the sheet on screen straight after askAtOpen has run).
let asking = false, askSheet = null, askedAtOpen = false;
const askSeenNow = () => {
  if (asking || !due.length) return;
  asking = true;
  import('./acts-ask.js').then(m => whenClear(() => { asking = false; if (!due.length) return; m.askAtOpen(due); askSheet = document.querySelector('.sheet-back'); })).catch(e => { asking = false; console.error(e); });
};
const askSeenAtOpen = () => { askedAtOpen = true; askSeenNow(); };
const tourThenAsk = () => { startTour(); askSeenAtOpen(); }; // the tour is on screen at once, so the question waits for it to end
// Coming back counts as opening, for the question only. An installed app is seldom loaded afresh: it is brought back from
// the background, sometimes days later, and someone who went to a show last night would never be asked. So after three
// hours or more out of sight (the screen hidden, or the page kept by the browser and restored), the waiting shows are
// worked out again and asked about as at open: after any sheet or tour, and never while the question is already up.
// A shorter absence does nothing, and the section stays the one the person was on (only a fresh load opens on the
// calendar). The moment Gdex went out of sight is kept in memory only.
const AWAY_MS = 3 * 60 * 60 * 1000;
let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
const cameBack = () => {
  if (hiddenAt === null || document.visibilityState === 'hidden') return;
  const away = Date.now() - hiddenAt; hiddenAt = null;
  if (away < AWAY_MS || (askSheet && askSheet.isConnected)) return;
  if (!askedAtOpen) { due = waitingIds(true); return; } // the first-run question is still up: the question at open has yet to have its turn, and takes the list as it is now
  if (!askSeen()) return;
  due = waitingIds(!moneyShown());
  askSeenNow();
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hiddenAt = Date.now(); else cameBack(); });
window.addEventListener('pagehide', () => { if (hiddenAt === null) hiddenAt = Date.now(); }); // for a browser that keeps the page without calling it hidden
window.addEventListener('pageshow', e => { if (e.persisted) cameBack(); });
if (!tourSeen()) {
  if (roleChosen()) setTimeout(() => whenClear(tourThenAsk), 700);
  else setTimeout(() => import('./role-pick.js').then(m => whenClear(() => m.askRole({ then: tourThenAsk }))).catch(e => { console.error(e); whenClear(tourThenAsk); }), 500);
} else {
  // Gdex was in use before roles came: say once, without getting in the way, that it can set itself up for a role.
  if (!roleChosen()) idle(() => import('./role-pick.js').then(m => m.nudgeRole(document.getElementById('clockbar'))).catch(e => console.error(e)));
  setTimeout(askSeenAtOpen, 900);
}
initUpdates(); // service worker, offline copy, and the "new version" bar
