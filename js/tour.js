// Spotlight walkthrough: dims the page, cuts a hole over the thing being explained, moves the section menu as it goes.
// A step can carry a form (its body) that is saved on Next, so a walkthrough can set things up as well as point.
import { h, nodes } from './util.js';
import { db, update, canChangeQuietly } from './store.js';
import { role, roleChosen, menuSections, offMenu, sectionName, moneyShown, startSection } from './roles.js';

// The first-run walkthrough (also Settings → Help → Take the welcome tour). It follows the role (js/roles.js): its own
// welcome, then the sections on its menu in order. The profile card saves what is typed on Next.
// A role without money (scout, audiophile) is asked only for a name and what they do: no business, no currency.
const PROFILE_FIELDS = [['Your name', 'name'], ['Business or project name', 'business', '', true], ['What you do', 'role', 'Producer, band leader, tour manager…'], ['Currency symbol', 'currency', '$, £, €…', true]];
const profileStep = {
  title: 'Your details',
  get text() { return moneyShown() ? 'They go on your invoices, day sheets and contact card. Change them any time under Settings.' : 'Your name goes on your contact card. Change it any time under Settings.'; },
  body: () => h('div', { class: 'tour-fields' }, ...PROFILE_FIELDS.filter(f => moneyShown() || !f[3]).map(([label, key, ph]) => {
    // What you do starts as the role's own word for it (Producer, Artist manager…) until something else is typed.
    const value = db.profile[key] || (key === 'role' && roleChosen() ? role().what || '' : '');
    return h('label', { class: 'tour-field' }, h('span', null, label), h('input', { type: 'text', value, 'data-key': key, placeholder: ph || '', 'aria-label': label, autocomplete: 'off' }));
  })),
  onNext: () => {
    const patch = {};
    document.querySelectorAll('.tour-form input[data-key]').forEach(i => { const v = i.value.trim(); if ((db.profile[i.dataset.key] || '') !== v && !(i.dataset.key === 'currency' && !v)) patch[i.dataset.key] = v; });
    if (Object.keys(patch).length && canChangeQuietly()) update(d => { d.profile = { ...d.profile, ...patch, updatedAt: Date.now() }; }); // a read-only role (the licence) keeps what is stored, without a word
  },
};
// What each section is, for a role that does not say it its own way.
export const STOP_TEXT = {
  bookings: 'Shows, studio sessions and rehearsals on one calendar. Open one for its times, deal, setlist, guest list, day sheet, settlement and invoice.',
  acts: 'The bands and artists you play in, manage, produce or follow: times seen with your scores, members, links, press kit and tech rider.',
  people: 'Everyone you work with: players, crew, engineers, promoters and agents, with their contact details and what they are booked on.',
  songs: 'Keys, tempos and lengths for every song, split sheets for the writers, and setlists that add up to the slot.',
  sessions: 'The studio log: each session’s takes, keepers and notes, song by song.',
  backline: 'Your gear: what you own, what goes to each booking, and what is out on loan.',
  venues: 'Every room, studio and festival you play or visit: the stage, the PA, load-in, curfew, the contact, and the house rules that show on every show there.',
  money: 'What you are owed and what you have been paid: settlements, invoices and the year’s totals.',
  tools: 'A tuner, a metronome with tap tempo, delay times for any tempo, a sound level meter and a set timer.',
  insurance: 'Your policies and what they cover, next to the backline they insure.',
};
export const NAMES = { bookings: 'Bookings', acts: 'Acts', people: 'People', songs: 'Songs', sessions: 'Studio log', backline: 'Backline', venues: 'Venues', money: 'Money', tools: 'Tools', insurance: 'Insurance', settings: 'Settings' };
const MAX_STOPS = 5; // the tour stays about a minute: the first sections on the menu
// Which section menu is in use (Aa → Section menu). js/a11y.js imports this module, so it is read from what a11y.js
// leaves on the page (data-menu: the choice in use, also when storage could not keep it), else from storage.
const menuKind = () => {
  let m = document.documentElement.dataset.menu;
  if (!m) { try { m = JSON.parse(localStorage.getItem('gdex-prefs') || '{}').menu; } catch { m = ''; } }
  return m === 'tape' || m === 'digital' ? m : 'record';
};
// The search box at the top of every page gives the welcome tour a stop of its own, just after the section menu, in
// its own words (js/search.js setSearchStep; this file cannot import the search, which imports it).
let searchStep = null;
export const setSearchStep = step => { searchStep = step; };
const listWords = list => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
export function welcomeSteps() {
  const r = role(), menu = menuSections(r), stopsOn = menu.filter(id => id !== 'settings');
  const own = new Map((r.tour || []).filter(s => stopsOn.includes(s.id)).map(s => [s.id, s.text]));
  const stops = (own.size ? [...own.keys()] : stopsOn).slice(0, MAX_STOPS);
  const bonus = offMenu(r).map(id => sectionName(id, NAMES[id]));
  const sideA = Math.ceil(menu.length / 2);
  return [
    { title: 'Welcome to Gdex', text: r.welcome || 'The booking deck for producers and bands: shows, studio sessions and rehearsals, your acts and people, backline, venues, songs and setlists, settlements and invoices, and the tools you need on the night. This takes about a minute. Tap Skip any time.' },
    profileStep,
    { go: stopsOn[0] || 'settings', target: ['.deck'], title: 'Your sections are tracks',
      get text() {
        const kind = menuKind(), rest = bonus.length ? '; the rest are bonus tracks' : '', too = bonus.length ? ', bonus tracks too' : '';
        // The record and the cassette have two sides; the digital player has one list.
        const count = kind === 'digital' ? `${menu.length} tracks${rest}.` : `${menu.length} tracks: ${sideA} on Side A, ${menu.length - sideA} on Side B${rest}.`;
        return kind === 'tape' ? `${count} Swipe the cassette or tap ⏪ ⏩ to change section; tap Tracks (or the cassette) to see them all${too}. Prefer a record player or a digital player? Aa → Section menu.`
          : kind === 'digital' ? `${count} Swipe the bar or tap ⏮ ⏭ to change section; the row under it has every track one tap away, and ☰ opens the track list${too}. Prefer a record player or a tape deck? Aa → Section menu.`
            : `${count} Swipe the record or tap ⏮ ⏭ to change section; tap the record to see them all on the sleeve${too}. Prefer a tape deck or a digital player? Aa → Section menu.`;
      } },
    ...(searchStep ? [{ ...searchStep, go: stopsOn[0] || 'settings' }] : []),
    ...stops.map(id => ({ go: id, target: ['.page-head'], title: sectionName(id, NAMES[id]), text: own.get(id) || STOP_TEXT[id] })),
    { go: 'settings', target: ['.page-head'], title: 'Settings',
      get text() {
        const what = moneyShown() ? 'your details, quotes and invoices, backups, display and this tour again' : 'your details, backups, display and this tour again';
        const more = bonus.length ? ` Not on your menu: ${listWords(bonus)}. ${{ tape: 'Tap Tracks', digital: 'Tap ☰', record: 'Tap the record' }[menuKind()]} to open any of them.` : '';
        return `Your role (${roleChosen() ? r.label : 'not chosen yet'}), ${what}. Change your role there any time: the menu follows, and nothing is deleted.${more} Everything stays on this device unless you save a backup or connect Google Drive.`;
      } },
  ];
}
const RESUME = 'gdex-tour-at'; // the step to resume at when a step leaves the page (a calendar sign-in that redirects)
const done = () => { try { localStorage.setItem('gdex-tour', 'done'); } catch { /* ignore */ } };
export const tourSeen = () => { try { return !!localStorage.getItem('gdex-tour'); } catch { return true; } };
export const resumeTourAt = n => { try { if (n == null) localStorage.removeItem(RESUME); else localStorage.setItem(RESUME, String(n)); } catch { /* ignore */ } };

// Steps for a sheet, by the sheet's title (its aria-label): sheetTutorial('Edit setlist', steps or () => steps).
// Call at module load. The ? button inside that sheet runs them (js/tutorials.js).
const sheetTours = new Map();
export const sheetTutorial = (title, steps) => { sheetTours.set(title, steps); };
export const sheetSteps = title => sheetTours.get(title) || null;

let active = null;
export const tourActive = () => !!active;
// The welcome tour moves from section to section and its last card is Settings. However it ends (Done, Skip, Escape),
// the first-run tour (first: true) leaves the person on the calendar, where Gdex opens; taken again later (from ?, Aa
// or Settings) it leaves them on the section where they started it.
export function startTour(from = 0, { first = false } = {}) {
  let at = from; try { const saved = Number(localStorage.getItem(RESUME)); if (!from && saved) at = saved; localStorage.removeItem(RESUME); } catch { /* ignore */ }
  const back = first ? startSection() : (window.logiPage && window.logiPage()) || startSection();
  return runTour(welcomeSteps(), { remember: true, from: at, onEnd: () => { if (window.logiPage && window.logiPage() !== back) window.logiGo?.(back); } });
}
// Runs any list of steps: { title, text, target: [selectors], go?: tabId, before?: fn, body?: ctx => node, onNext?: fn }.
// Steps whose target is not on screen are skipped. A body is a form inside the card (saved by onNext, which may return
// false to stay on the step); ctx has refresh(), next(), stop() and index. onEnd runs once the tour has gone, however
// it ended.
export function runTour(steps, { remember = false, from = 0, footer = null, root = null, onEnd = null } = {}) {
  if (active) return;
  const STEPS = steps;
  const app = document.getElementById('app');
  // What had the focus as the walkthrough began (the ? button, a sheet's ?, Take the welcome tour) has it back when it
  // ends, however it ends: the card the focus was on goes with it, and the focus would be nowhere. A page drawn again
  // meanwhile has a stand-in with the same id; with neither, the page takes it.
  const opener = document.activeElement;
  const giveBack = () => {
    const at = document.activeElement;
    if (at && at !== document.body) return; // something that opened as it ended has taken it
    const twin = opener && opener !== document.body ? (opener.isConnected ? opener : opener.id ? document.getElementById(opener.id) : null) : null;
    (twin && twin.getClientRects().length && !twin.closest('[inert]') ? twin : document.getElementById('page'))?.focus({ preventScroll: true });
  };
  const spot = h('div', { class: 'tour-spot', 'aria-hidden': 'true' });
  const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-title' });
  const layer = h('div', { class: 'tour' }, spot, card);
  const wasInert = !!(app && app.inert);
  window.logiShowNav?.(); // the section menu may be slid away: the tour points at it
  document.body.append(layer); if (app) app.inert = true;
  let i = from, target = null, dir = 1;
  const seen = new Set(); // steps already shown: they keep their place in the count when going back
  const stop = () => { if (!active) return; active = null; layer.remove(); if (app) app.inert = wasInert; window.removeEventListener('resize', place); window.removeEventListener('scroll', onScroll, true); document.removeEventListener('keydown', keys, true); if (remember) done(); if (onEnd) onEnd(); giveBack(); };
  active = { stop };
  // Arrow keys move between steps, except while typing in a field of the card; Escape always leaves.
  const keys = e => { const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && e.key !== 'Escape') return; if (e.key === 'Escape') { e.stopPropagation(); stop(); } else if (e.key === 'ArrowRight') { e.stopPropagation(); next(); } else if (e.key === 'ArrowLeft') { e.stopPropagation(); dir = -1; show(i - 1); } };
  // The card goes under the thing it points at, else over it. When it fits on neither side (a small screen, big text,
  // the tall section menu), it docks to the edge of the screen on the roomier side and is cut to the room left there,
  // its words scrolling inside it, so the highlighted part stays in view; Skip, Back and Next always show.
  // A card cut short fades out at the foot of its words while there is more to read (scrolling them clears it).
  const moreCue = b => { if (b) b.classList.toggle('tour-more', b.scrollTop + b.clientHeight < b.scrollHeight - 2); };
  const place = () => {
    Object.assign(card.style, { top: '', bottom: '', maxHeight: '' });
    card.classList.remove('tour-docked');
    if (!target) { spot.classList.add('center'); card.classList.add('center'); moreCue(card.querySelector('.tour-body')); return; }
    spot.classList.remove('center'); card.classList.remove('center');
    const r = target.getBoundingClientRect(), pad = 8, edge = 16;
    Object.assign(spot.style, { top: r.top - pad + 'px', left: r.left - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    card.style.left = '';
    const below = r.bottom + 16, above = r.top - 16, cardH = card.offsetHeight;
    if (below + cardH + edge < innerHeight) card.style.top = below + 'px';
    else if (above - cardH >= edge) card.style.top = above - cardH + 'px';
    else {
      const roomBelow = innerHeight - edge - below, roomAbove = above - edge, least = Math.min(200, innerHeight - 2 * edge); // never too short to read
      // …but where the room left is enough for the title, a few lines and the buttons (140 px), the card keeps to it rather
      // than cover what it points at (the section menu, lower since the search box came above it, on a small phone).
      const tall = room => (room >= 140 ? room : Math.max(room, least));
      card.classList.add('tour-docked');
      if (roomBelow >= roomAbove) Object.assign(card.style, { top: 'auto', bottom: edge + 'px', maxHeight: tall(roomBelow) + 'px' });
      else Object.assign(card.style, { top: edge + 'px', maxHeight: tall(roomAbove) + 'px' });
    }
    moreCue(card.querySelector('.tour-body'));
  };
  let busy = false; // a tap during a transition must not double-advance
  const show = async n => { if (busy) return; busy = true; try { await step(n); } finally { busy = false; } };
  // The steps that will actually show: a step whose box is not on screen is skipped, so it must not be counted either
  // (a booking with no venue has no venue box). Steps that move to a page or prepare something first are counted, as
  // their box only appears then. Worked out again at every step, so the count and "Done" are always right.
  const find = s => { const scope = (root && root()) || document; return s.target ? s.target.map(sel => { try { return scope.querySelector(sel); } catch { return null; } }).find(el => el && el.offsetParent !== null) || null : null; };
  const willShow = s => !s.target || !!s.go || !!s.before || !!find(s);
  const step = async n => {
    if (n < 0) return;
    if (n >= STEPS.length) { if (!seen.size && !STEPS.some(x => !x.target)) { stop(); window.dispatchEvent(new CustomEvent('gdex-tour-empty')); return; } return stop(); }
    i = n; const s = STEPS[n];
    if (s.go) { window.logiGo?.(s.go); await new Promise(r => setTimeout(r, 650)); }
    if (s.before) { try { await s.before(); } catch { /* the step still shows */ } await new Promise(r => setTimeout(r, 250)); }
    target = find(s);
    if (s.target && !target) return step(n + dir); // nothing to point at here, skip
    if (target) { target.scrollIntoView({ block: 'center', inline: 'nearest' }); await new Promise(r => setTimeout(r, 250)); }
    const shown = STEPS.map((x, k) => (k === n || (k > n ? willShow(x) : seen.has(k)) ? k : -1)).filter(k => k >= 0), pos = shown.indexOf(n), isLast = pos === shown.length - 1;
    seen.add(n);
    // Leaving the step forwards runs its onNext first (a form's save); Back never saves.
    const advance = async fn => { if (s.onNext) { try { if ((await s.onNext()) === false) return; } catch { /* carry on */ } } fn(); };
    const forward = () => advance(isLast ? stop : next);
    const body = s.body ? s.body({ refresh: () => show(n), next: forward, stop, index: n }) : null;
    card.replaceChildren(...nodes(
      h('div', { class: 'tour-body', onscroll: e => moreCue(e.currentTarget) },
        h('div', { class: 'tour-step muted small' }, `${pos + 1} / ${shown.length}`),
        h('h2', { id: 'tour-title' }, s.title), h('p', null, s.text),
        body && h('form', { class: 'tour-form', noValidate: true, onsubmit: e => { e.preventDefault(); forward(); } }, body)),
      h('div', { class: 'tour-actions' },
        h('button', { class: 'btn ghost small', type: 'button', onclick: stop }, 'Skip'), footer && footer(n, stop), h('span', { class: 'spacer' }),
        pos > 0 && h('button', { class: 'btn ghost', type: 'button', onclick: () => { dir = -1; show(n - 1); } }, 'Back'),
        h('button', { class: 'btn primary', type: 'button', onclick: forward }, isLast ? 'Done' : 'Next'))));
    spot.classList.remove('tour-pulse'); void spot.offsetWidth; spot.classList.add('tour-pulse');
    place();
    ((body && card.querySelector('.tour-form input, .tour-form textarea, .tour-form select')) || card.querySelector('.tour-actions .btn.primary'))?.focus();
  };
  const next = () => { dir = 1; show(i + 1); };
  const onScroll = e => { if (!(e.target instanceof Node && card.contains(e.target))) place(); }; // the card's own words scrolling move nothing
  window.addEventListener('resize', place); window.addEventListener('scroll', onScroll, true); document.addEventListener('keydown', keys, true);
  show(i);
  return stop;
}
