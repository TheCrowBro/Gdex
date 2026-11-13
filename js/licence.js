// The licence as the page shows it (loaded only while licences are on, and only when something here is needed): the
// sheets (the offer, the free days over at opening, read-only after a refused change, the wrong clock, the desktop's
// files in a browser, sign-in, licence code, devices full, sign out, forget), Settings → About & licence, the line under
// Settings → Your role, and the bar. Its words are the build spec §9. The state is js/licence-state.js's; the actions go
// to js/licence-web.js (the website) or window.gdexDesktop.licence (the desktop app), and each answer is handed back to
// js/licence-state.js (setLicenceState), which tells the page.
import { h, sheet, toast, announce } from './util.js';
import { roleId, roleOf, setRole, roleNeedsLicence, sectionName, FREE_ROLE } from './roles.js';
import { licenceNow, licenceOn, licenceReady, setLicenceState, onLicenceChange, startFreeDays, termsAgreed, termsDeclined, toastStarted, mayOpen, mayWork, mayPickRole, canWrite } from './licence-state.js';
import { askTerms, termsChanged } from './terms.js';

const desk = () => (window.gdexDesktop && window.gdexDesktop.licence) || null;
const web = () => !desk();
const W = () => import('./licence-web.js');
// The source's actions; every answer goes back to the state.
const src = {
  buy: () => (desk() ? desk().buy() : W().then(m => m.buy())),
  localPrice: () => (desk() ? (typeof desk().localPrice === 'function' ? desk().localPrice() : null) : W().then(m => m.localPrice())),
  recheck: force => (desk() ? desk().recheck() : W().then(m => m.recheck(force))),
  release: () => (desk() ? desk().release() : W().then(m => m.release())),
  forget: () => W().then(m => m.forget()),
  start: x => W().then(m => m.start(x)),
  verify: (e, c) => W().then(m => m.verify(e, c)),
  enter: (code, opts) => desk().enter(code, opts),
  code: () => (desk() && typeof desk().code === 'function' ? desk().code() : ''),
};
const told = r => { if (r && !r.error) setLicenceState(r); return r; };

const NAMES = { bookings: 'Bookings', acts: 'Acts', people: 'People', songs: 'Songs', sessions: 'Studio log', backline: 'Backline', venues: 'Venues', money: 'Money', tools: 'Tools', insurance: 'Insurance', settings: 'Settings' };
const PAID_LIST = 'People, Songs, Studio log, Backline, Money and Insurance';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const day = (iso, year = true) => { const d = new Date(String(iso || '') + (String(iso || '').length === 10 ? 'T12:00:00' : '')); return Number.isNaN(+d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) }); };
const who = l => (l ? [l.name, l.email && l.name ? `(${l.email})` : l.email].filter(Boolean).join(' ') : '');
const roleLabel = (id = roleId()) => (roleOf(id) || { label: 'Everything' }).label;
// The Audiophile's own sections in its own words: "your gigs, bands, venues and tools".
const freeWords = () => { const n = (roleOf(FREE_ROLE) || {}).names || {}; return `your ${[(n.bookings || 'Bookings'), (n.acts || 'Acts'), 'Venues', 'Tools'].map(x => x.toLowerCase()).join(', ').replace(/, (?=[^,]*$)/, ' and ')}`; };
const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------ the price ------------------------------------ */
// The whole price where the law asks to see it before buying (the UK, the EU and Australia: js/tax.js), from the
// country the licence server sees; until it has answered, and anywhere else, the price before tax. Asked only when a
// Buy button is drawn ([S-43]).
const T = { local: null, asked: false };
const tag = () => (T.local ? `${T.local.total} USD with ${T.local.tax}` : '20 USD');
const once = () => (T.local ? `${T.local.total} USD once in ${T.local.place}, including ${T.local.rate}% ${T.local.tax}` : '20 USD once plus any tax where you live');
const tagEl = () => h('span', { 'data-lic': 'tag' }, tag());
const onceEl = () => h('span', { 'data-lic': 'once' }, once());
// Asked only where the licence server already hears from this device ([S-43]): a working role in use, the free days
// started, or a licence. An Audiophile who never used a working role sends nothing, so its Buy says 20 USD.
const priceMatters = () => { const s = licenceNow(); return roleNeedsLicence(roleId()) || !!s.started || !!s.licence; };
function askLocalPrice() {
  if (T.asked || T.local || !priceMatters()) return;
  T.asked = true;
  Promise.resolve().then(() => src.localPrice()).then(b => {
    if (!b || typeof b !== 'object' || b.error) { T.asked = false; return; } // no answer: asked again with the next Buy button
    const t = b.taxed;
    if (!t || !/^\d{1,4}\.\d\d$/.test(String(t.total)) || !/^(VAT|GST)$/.test(t.tax) || !(Number(t.rate) > 0) || typeof t.place !== 'string') return;
    T.local = { total: String(t.total), tax: t.tax, rate: Number(t.rate), place: t.place.slice(0, 40) };
    document.querySelectorAll('[data-lic="tag"]').forEach(e => { e.textContent = tag(); });
    document.querySelectorAll('[data-lic="once"]').forEach(e => { e.textContent = once(); });
    paintBar();
  }).catch(() => { T.asked = false; });
}

/* ------------------------------------ what to say ------------------------------------ */
// One line for Settings → About & licence, and the buttons that go with it (§9.6).
function describe(s) {
  if (!s || s.mode === 'off') return null;
  const l = s.licence, seats = (l && l.seats) || s.seats || 3;
  const until = desk() ? 'until you add a licence code' : 'until you sign in with the email address you bought a licence with';
  switch (s.mode) {
    case 'unstarted': return { line: ['Audiophile is free. The other roles have 30 free days on this device, counted from the first time you use one; then a licence: ', onceEl(), `, for up to ${seats} of your devices.`], buy: true, enter: true };
    case 'trial': return { line: `Free days: ${s.trialLeft} left${s.trialEnds ? ` (until ${day(s.trialEnds)})` : ''}. After that the working roles are read-only here ${until}. Audiophile stays free.`, buy: true, enter: true };
    case 'ended': return { line: 'Your free days are over: the working roles are read-only here. Audiophile is free.', tone: 'warn', buy: true, enter: true };
    case 'clock': return { line: 'This device’s clock looks wrong, so Gdex can’t count your free days: the working roles are read-only here until its date and time are right. Audiophile is free.', tone: 'warn', buy: true, enter: true };
    case 'licensed': return web()
      ? { line: `Signed in as ${l ? l.email : ''}${l && l.comp ? ' · a free licence' : ''} · a licence for up to ${plural(seats, 'device')}.`, tone: 'ok', release: true, forget: true }
      : { line: `Licensed to ${who(l)}${l && l.comp ? ' · a free licence' : ''} · up to ${plural(seats, 'device')}.`, tone: 'ok', copy: true, release: true };
    case 'pending': return { line: `Licensed to ${who(l)}, but not activated on this computer yet: Gdex needs the internet once to do that${s.daysLeft > 0 ? ` (${plural(s.daysLeft, 'day')} left)` : ''}.`, tone: s.canEdit ? '' : 'warn', retry: true, remove: true };
    case 'released': return { line: `This computer isn’t on your licence: it’s in use on ${plural(seats, 'other device')}, its limit. Activate it here again to choose which one to take off.`, tone: 'warn', again: true, remove: true };
    case 'cancelled': return { line: 'This licence has been cancelled, for example after a refund. If you think that’s a mistake, reply to the email your licence came in.', tone: 'warn', buy: true, enter: true, remove: !web() };
    case 'expired': return { line: `Your licence ended on ${day(l && l.expires)}.`, tone: 'warn', buy: true, enter: true, release: web(), remove: !web() };
    case 'offline': return { line: `Gdex hasn’t been able to check your ${web() ? 'sign-in' : 'licence'} for 90 days. Connect to the internet and tap Try again.`, tone: 'warn', retry: true };
    case 'away': return { line: 'This is the desktop app’s copy of Gdex, opened in a web browser: only Audiophile works here. Open Gdex from its desktop app for the other roles, or use gdex.crowmade.app.', tone: 'warn' };
    default: return null;
  }
}

// The buttons for a state. opts: sheet: the words a sheet uses ("Sign in (I have one)"); carry: offer Carry on free as
// an Audiophile; after: runs once something was done (a sheet closes itself).
function actions(s, d, { sheetWords = false, carry = false, after = () => {} } = {}) {
  const b = [];
  // Buy's words in one span, so they wrap as one line.
  if (d.buy) { askLocalPrice(); b.push(h('button', { type: 'button', class: 'btn primary lic-buy', onclick: () => src.buy() }, h('span', null, 'Buy a licence · ', tagEl()))); }
  if (d.enter) b.push(h('button', { type: 'button', class: 'btn ghost lic-enter', onclick: () => (web() ? signIn() : enterCode()) }, web() ? (sheetWords ? 'Sign in (I have one)' : 'Sign in') : 'Enter licence code'));
  if (d.again) b.push(h('button', { type: 'button', class: 'btn primary', onclick: async () => enterCode(await Promise.resolve(src.code()).catch(() => '')) }, 'Activate here again'));
  if (d.retry) b.push(h('button', { type: 'button', class: 'btn primary', onclick: e => retry(e.currentTarget, after) }, 'Try again'));
  if (d.copy) b.push(h('button', { type: 'button', class: 'btn ghost', onclick: async e => {
    const btn = e.currentTarget, was = btn.textContent; btn.disabled = true; btn.textContent = 'Fetching…';
    let code = ''; try { code = await src.code(); } catch (err) { toast((err && err.message) || 'The code could not be fetched'); }
    btn.disabled = false; btn.textContent = was; if (!code) return;
    try { await navigator.clipboard.writeText(code); toast('Licence code copied'); } catch { toast('Could not copy'); }
  } }, 'Copy the code'));
  if (d.release) b.push(h('button', { type: 'button', class: 'btn ghost lic-release', onclick: () => releaseSheet() }, web() ? 'Sign out' : 'Release this computer'));
  if (d.forget && web()) b.push(h('button', { type: 'button', class: 'btn ghost small lic-forget', onclick: () => forgetSheet() }, 'Delete my licence records'));
  if (d.remove) b.push(h('button', { type: 'button', class: 'btn ghost', onclick: () => releaseSheet(true) }, 'Remove the code'));
  if (carry) b.push(h('button', { type: 'button', class: 'btn ghost lic-carry', onclick: () => { after(); carryOnFree(); } }, 'Carry on free as an Audiophile'));
  return b;
}
// Next to Buy: what is bought (a licence, not a copy; California's rule for digital goods), and the currency.
const buyNote = d => (d && d.buy ? h('p', { class: 'small muted licence-buy-note' }, 'You are buying a licence to use Gdex, not ownership of a copy of it (see the ', h('a', { href: 'terms.html#paid', target: '_blank', rel: 'noopener' }, 'terms'), '). Prices are in US dollars; Stripe can show your own currency at its exchange rate, which costs 2 to 4% more.') : null);

// Checks the licence online now. The toast says what the server answered.
async function retry(btn, after = () => {}) {
  const was = licenceNow().mode;
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  const r = await Promise.resolve(src.recheck(true)).catch(() => null);
  told(r);
  if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = 'Try again'; }
  const m = licenceNow().mode;
  if (m === 'licensed') { after(); toast('Licence confirmed'); } else toast(m === 'cancelled' ? 'This licence has been cancelled' : m === was ? 'Still not able to reach the licence server' : 'Licence checked');
}

/* --------------------------- sheets that close when out of date --------------------------- */
// An offer or an explanation that is out of date (signed in meanwhile) closes once nothing is open over it (a sign-in
// sheet opened from it), so the focus goes back where it came from.
const STALE = new Set();
function closeStale() {
  for (const x of [...STALE]) {
    if (!x.el.isConnected) { STALE.delete(x); continue; }
    if (!x.gone()) continue;
    const backs = [...document.querySelectorAll('.sheet-back')], top = backs[backs.length - 1];
    if (top && !top.contains(x.el)) { clearTimeout(x.wait); x.wait = setTimeout(closeStale, 200); continue; }
    STALE.delete(x); x.close();
  }
}
onLicenceChange(() => setTimeout(closeStale, 0));
const staleWhen = (sh, gone) => { STALE.add({ el: sh.el, close: sh.close, gone, wait: 0 }); };
// The sheet holds the focus, not a button: someone still typing must not press Buy by accident.
const focusSheet = sh => { sh.el.tabIndex = -1; setTimeout(() => { if (sh.el.isConnected) sh.el.focus({ preventScroll: true }); }, 50); };

/* ------------------------------------ the offers ------------------------------------ */
// Why there is no licence now, in a sentence (the offers and the read-only sheet).
function whyNot(s, what = 'working sections') {
  switch (s.mode) {
    case 'cancelled': return 'Your licence has been cancelled, for example after a refund. If you think that’s a mistake, reply to the email your licence came in.';
    case 'expired': return `Your licence ended on ${day(s.licence && s.licence.expires)}.`;
    case 'clock': return 'Gdex can’t count your free days while this device’s date and time are off by more than a day. Set them right (or turn on the automatic time), then open Gdex again.';
    case 'offline': return 'Gdex hasn’t reached the licence server for 90 days. Connect to the internet and tap Try again.';
    case 'released': return 'This computer is no longer on your licence: it’s in use on 3 other devices.';
    case 'pending': return 'Your licence isn’t activated on this computer yet: Gdex needs the internet once to do that.';
    default: return `Your 30 free days of Gdex’s ${what} are over on this device.`;
  }
}
// The buttons an offer and the free-days-over sheet show for a state: Buy and Sign in, or the state's own next step.
function nextStep(s) {
  const d = describe(s) || {};
  return d.retry ? { retry: true } : d.again ? { again: true } : { buy: true, enter: true };
}
function offer(title, first, gone) {
  const s = licenceNow();
  if (s.mode === 'away') return awaySheet();
  const d = nextStep(s);
  let sh = null;
  const close = () => sh && sh.close();
  sh = sheet(title, h('div', { class: 'stack lic-offer' },
    h('p', null, first),
    h('p', null, `A licence opens ${PAID_LIST}, and every role: `, onceEl(), `, for up to 3 of your devices. ${capFirst(freeWords())} stay free.`),
    h('div', { class: 'actions' }, ...actions(s, d, { sheetWords: true, after: close }), h('button', { type: 'button', class: 'btn ghost lic-later', onclick: close }, 'Not now')),
    buyNote(d)));
  sh.el.classList.add('licence-needed');
  staleWhen(sh, gone);
  focusSheet(sh);
  announce(title);
  return sh;
}
// A section (or 'work': a working box or a paid record) that needs a licence, offered (§9.4).
export function offerSection(id) {
  const s = licenceNow();
  if (id === 'work') return offer('The working boxes need a licence', `The line-up, setlist, take log and the other working boxes, and People, Songs and Backline’s cards, come with Gdex’s working roles. ${whyNot(s, 'working roles')}`, () => mayWork() === 'open');
  const name = sectionName(id, NAMES[id] || id);
  return offer(`${name} needs a licence`, whyNot(s), () => mayOpen(id) === 'open');
}
// A role that needs a licence, offered (§9.4).
export function offerRole(id) {
  const s = licenceNow(), name = roleLabel(id);
  return offer(`${name} needs a licence`, `The ${name} role comes with a licence. ${whyNot(s, 'working roles')}`, () => mayPickRole(id) === 'open');
}

/* ------------------------------ free days over, at opening ------------------------------ */
const overDue = () => licenceOn() && roleNeedsLicence(roleId()) && !licenceNow().canEdit;
let overOpen = null;
// At each opening (and coming back after 3 hours) while a paid role is in use and cannot change things (§9.5). Resolves
// when its sheet has closed, or at once when it is not due. ✕ keeps the role, read-only.
export function overSheetIfDue() {
  return licenceReady().then(() => {
    if (!overDue()) return undefined;
    if (overOpen) return overOpen;
    const s = licenceNow();
    if (s.mode === 'away') return awaySheet().done;
    overOpen = new Promise(resolve => {
      const role = roleLabel(), how = ['A licence is ', onceEl(), ', for up to 3 of your devices. Or carry on free as an Audiophile, with everything you already have.'];
      const readOnly = `Gdex is read-only as ${role} on this device until there is a licence: you can open, search, print and share everything, but not change it. Nothing has been deleted.`;
      const text = {
        ended: ['Your 30 free days are over', [readOnly, ' ', ...how]],
        cancelled: ['Your licence has been cancelled', ['This can happen after a refund. If you think that’s a mistake, reply to the email your licence came in. ', readOnly.replace('until there is a licence', 'until there is a licence again'), ' ', ...how]],
        expired: [`Your licence ended on ${day(s.licence && s.licence.expires)}`, [readOnly, ' ', ...how]],
        offline: ['Gdex needs to check your licence', [`It hasn’t reached the licence server for 90 days. Connect to the internet and tap Try again. Until then Gdex is read-only as ${role}. Nothing has been deleted.`]],
        released: ['This computer is no longer on your licence', [`It’s in use on 3 other devices. Activate it here again to choose which one to take off. Until then Gdex is read-only as ${role}. Nothing has been deleted.`]],
        pending: ['Gdex needs to activate your licence', [`It hasn’t been able to reach the licence server since the code was entered. Connect to the internet and tap Try again. Until then Gdex is read-only as ${role}. Nothing has been deleted.`]],
        clock: ['Your device’s clock looks wrong', [`Gdex can’t count your free days while this device’s date and time are off by more than a day. Set them right (or turn on the automatic time), then open Gdex again. Nothing has been deleted. Until then Gdex is read-only as ${role}.`]],
      }[s.mode] || ['Gdex is read-only here', [readOnly, ' ', ...how]];
      let sh = null;
      const close = () => sh && sh.close();
      sh = sheet(text[0], h('div', { class: 'stack lic-over' },
        h('p', null, ...text[1]),
        h('div', { class: 'actions' }, ...actions(s, nextStep(s), { sheetWords: true, carry: true, after: close })),
        buyNote(nextStep(s))), { onClose: () => { overOpen = null; resolve(); } });
      sh.el.classList.add('licence-over');
      staleWhen(sh, () => !overDue());
      focusSheet(sh);
    });
    return overOpen;
  });
}
// The wrong clock's sheet: the free-days-over sheet in its clock words.
export const clockSheet = () => overSheetIfDue();

// The desktop app's files opened in a web browser ([S-42]): nothing paid works here, and nothing is asked of a server.
export function awaySheet() {
  let resolve; const done = new Promise(r => { resolve = r; });
  if (document.querySelector('.sheet.licence-away')) { resolve(); return { done }; }
  let sh = null;
  const close = () => sh && sh.close();
  sh = sheet('Open Gdex from its desktop app', h('div', { class: 'stack lic-away' },
    h('p', null, 'This is the desktop app’s copy of Gdex, opened in a web browser. Its working roles and Google Drive only work in the desktop app; on the web, use gdex.crowmade.app. Audiophile works here.'),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn primary', id: 'lic-away-ok', onclick: close }, 'OK'),
      roleNeedsLicence(roleId()) && h('button', { type: 'button', class: 'btn ghost lic-carry', onclick: () => { close(); carryOnFree(); } }, 'Carry on as an Audiophile'))),
    { onClose: () => resolve() });
  sh.el.classList.add('licence-away');
  focusSheet(sh);
  return { ...sh, done };
}

// Carry on free as an Audiophile: the role changes (the calendar opens), nothing is deleted.
export function carryOnFree() {
  setRole(FREE_ROLE, { start: true });
  toast('Audiophile: free for good. Nothing was deleted; the other roles come back with a licence.');
  announce('Audiophile: Gdex is free for good.');
}

/* ------------------------------ read-only, after a refused change ------------------------------ */
// The store's gate refused a change the person asked for (js/licence-state.js). The focus goes to the sheet itself.
export function readOnlySheet({ form = false } = {}) {
  if (document.querySelector('.sheet.licence-readonly')) { announce('Read-only: nothing was changed.'); return null; }
  const s = licenceNow(), role = roleLabel();
  if (s.mode === 'away') return awaySheet();
  let sh = null;
  const close = () => sh && sh.close();
  if (s.canEdit && termsDeclined()) {
    // The terms sheet was closed with Not now this visit: agreeing to them starts the free days (or, the terms having
    // changed since they were agreed, lets the working role change things again).
    const has = ['licensed', 'pending'].includes(s.mode);
    sh = sheet('Read-only for now', h('div', { class: 'stack lic-ro' },
      termsChanged(true) ? h('p', null, 'Please read and agree to the updated terms to keep using the working roles. Your information is safe and stays where it is.')
        : h('p', null, 'Gdex’s working roles and sections are free for 30 days on this device, then need a licence: ', onceEl(), ', for up to 3 of your devices. Audiophile stays free. To use them, please read and agree to Gdex’s terms.'),
      h('p', { class: 'small muted' }, `Nothing was changed${form ? ': what you typed is still in the form' : ''}.`),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn primary', id: 'lic-ro-terms', onclick: async () => { close(); if (await askTerms({ once: once() })) { termsAgreed(); if (await startFreeDays()) toastStarted(); } } }, 'Read and agree'),
        // Read and agree takes Buy's place (§9.5); Sign in stays, for someone who has a licence already (not signed in here).
        ...(has ? [] : actions(s, { enter: true }, { sheetWords: true, after: close })),
        h('button', { type: 'button', class: 'btn ghost lic-carry', onclick: () => { close(); carryOnFree(); } }, 'Carry on free as an Audiophile'))));
  } else {
    const first = {
      cancelled: 'Your licence has been cancelled', expired: 'Your licence has ended', clock: 'This device’s clock looks wrong',
      offline: 'Gdex hasn’t been able to check your licence for 90 days', released: 'This computer is no longer on your licence', pending: 'Your licence isn’t activated on this computer yet',
    }[s.mode] || 'Your free days are over';
    sh = sheet('Read-only until there is a licence', h('div', { class: 'stack lic-ro' },
      h('p', null, `${first}, so ${role} can’t change things on this device. Nothing was changed${form ? ' (what you typed is still in the form)' : ''}. You can still open, search, print and share everything.`),
      h('div', { class: 'actions' }, ...actions(s, nextStep(s), { sheetWords: true, carry: true, after: close })),
      buyNote(nextStep(s))));
  }
  sh.el.classList.add('licence-readonly');
  staleWhen(sh, () => canWrite());
  announce('Read-only: nothing was changed.');
  focusSheet(sh);
  return sh;
}

/* ------------------------------ Settings → Your role ------------------------------ */
// The line under the role cards (§9.2), with what to do next.
export function roleLicenceLine() {
  const el = h('div', { class: 'stack rp-licence-line' });
  const draw = () => {
    const s = licenceNow();
    if (s.mode === 'off') { el.replaceChildren(); el.hidden = true; return; }
    el.hidden = false;
    const has = ['licensed', 'pending'].includes(s.mode) && s.canEdit;
    let words, d = {};
    if (s.mode === 'away') words = ['Here, in a web browser, only Audiophile works: open Gdex from its desktop app for the other roles.'];
    else if (has) words = ['Licensed: every role on this device.'];
    else if (s.canEdit && s.started) { words = [`Your free days: ${s.trialLeft} left${s.trialEnds ? `, until ${day(s.trialEnds, false)}` : ''}. Audiophile stays free after that.`]; d = { buy: true, enter: true }; }
    else if (s.canEdit) words = ['Audiophile is free for good. The other roles and Everything have 30 free days on this device, counted from the first time you use one; then a licence: ', onceEl(), ', for up to 3 of your devices.'];
    else { words = [s.mode === 'ended' ? 'Your free days are over. ' : whyNot(s) + ' ', 'Audiophile is free; the other roles need a licence.']; d = nextStep(s); }
    // A warning only for a working role in use.
    el.replaceChildren(h('p', { class: 'small' + (s.canEdit || has || !roleNeedsLicence(roleId()) ? '' : ' licence-warn') }, ...words), ...(Object.keys(d).length ? [h('div', { class: 'actions' }, ...actions(s, d))] : []));
  };
  draw(); // Settings is drawn again on every change of the licence (js/app.js), and this line with it
  return el;
}

/* ------------------------------ Settings → About & licence ------------------------------ */
export function licencePanel() {
  const el = h('div', { class: 'stack licence-panel', hidden: true });
  const draw = () => {
    const s = licenceNow(), d = describe(s);
    if (!d) { el.replaceChildren(); el.hidden = true; return; }
    el.hidden = false;
    const b = actions(s, d, { after: draw });
    el.replaceChildren(h('h3', { class: 'licence-title' }, 'Licence'),
      h('p', { class: 'small licence-line' + (d.tone === 'warn' ? ' licence-warn' : '') }, ...[].concat(d.line)),
      b.length ? h('div', { class: 'actions' }, ...b) : '', buyNote(d) || '');
  };
  draw();
  return { el, destroy: onLicenceChange(draw) };
}
function detailsSheet() {
  const s = licenceNow(), d = describe(s); if (!d) return;
  let sh = null;
  sh = sheet('Licence', h('div', { class: 'stack' }, h('p', null, ...[].concat(d.line)), h('div', { class: 'actions' }, ...actions(s, d, { sheetWords: true, after: () => sh && sh.close() })), buyNote(d)));
}

/* ------------------------------------ the bar ------------------------------------ */
// At the foot of the screen while a paid role is in use: in the last 7 free days, and whenever it is read-only ([S-28]).
// ✕ hides it until Gdex is next opened.
const B = { bar: null, hide: '' };
function paintBar() {
  const s = licenceNow(), paid = roleNeedsLicence(roleId());
  const urgent = paid && licenceOn() && !s.canEdit && s.mode !== 'away';
  const soon = paid && s.canEdit && s.started && !['licensed', 'pending'].includes(s.mode) && s.trialLeft <= 7;
  const pend = paid && s.mode === 'pending' && desk() && s.daysLeft <= 7;
  const show = licenceOn() && (urgent || soon || pend);
  const key = s.mode + (urgent ? '!' : '') + roleId();
  const gone = () => { if (B.bar) { B.bar.remove(); B.bar = null; document.body.classList.remove('has-licence-bar'); } };
  if (!show || B.hide === key) return gone();
  const role = roleLabel(), small = (label, onclick, primary) => h('button', { type: 'button', class: `btn ${primary ? 'primary' : 'ghost'} small`, onclick }, label);
  const d = describe(s) || {};
  let text, buttons;
  if (urgent) {
    text = { offline: 'Read-only until Gdex can check your licence online', clock: 'Read-only: this device’s clock looks wrong', released: 'Read-only: this computer isn’t on your licence', pending: 'Read-only until your licence is activated on this computer' }[s.mode] || `Read-only: ${role} needs a licence`;
    buttons = d.retry ? [small('Try again', e => retry(e.currentTarget), true), small('Details', detailsSheet)]
      : d.again ? [small('Activate here again', async () => enterCode(await Promise.resolve(src.code()).catch(() => '')), true), small('Details', detailsSheet)]
        : [small('Buy', () => { askLocalPrice(); src.buy(); }, true), small(web() ? 'Sign in' : 'Enter code', () => (web() ? signIn() : enterCode()))];
  } else if (pend) {
    text = 'Your licence isn’t activated on this computer yet';
    buttons = [small('Try again', e => retry(e.currentTarget), true)];
  } else {
    text = s.trialLeft === 1 ? '1 free day left' : `${s.trialLeft} free days left`;
    buttons = [small('Buy a licence', () => { askLocalPrice(); src.buy(); }, true)];
  }
  const bar = h('div', { class: 'update-bar licence-bar' + (urgent ? ' urgent' : ''), role: 'status' },
    h('span', null, text), ...buttons,
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Hide until Gdex is next opened', onclick: () => { B.hide = key; paintBar(); } }, '✕'));
  if (!B.bar || B.bar.firstChild.textContent !== text) announce(text);
  if (B.bar) B.bar.replaceWith(bar);
  B.bar = bar;
  if (!bar.isConnected) document.body.append(bar);
  document.body.classList.add('has-licence-bar');
}
let barOn = false;
// js/app.js calls this once licences are on.
export function initBar() {
  if (barOn) return;
  barOn = true;
  onLicenceChange(() => paintBar());
  window.addEventListener('gdex-role', () => setTimeout(paintBar, 0));
  paintBar();
}

/* ------------------------------------ devices full ------------------------------------ */
const shortDay = iso => day(iso) || 'unknown';
// The licence already has 3 devices: the list, with "Move it here" for each (3 times in 30 days).
function chooser(msg, r, pick) {
  const list = h('ul', { class: 'lic-computers' }, ...(r.computers || []).map(c => h('li', null,
    h('span', null, h('b', null, c.os || 'Computer'), ` · added ${shortDay(c.added)} · last used ${shortDay(c.seen)}`),
    h('button', { type: 'button', class: 'btn ghost small lic-move', disabled: !r.swapsLeft, onclick: () => pick(c.tag) }, 'Move it here'))));
  msg.className = 'small'; msg.replaceChildren(
    h('span', null, `Your licence is already in use on ${plural((r.computers || []).length, 'device')}, its limit. To use it on this computer, choose one to take it off. `),
    h('span', { class: 'muted' }, r.swapsLeft ? `You can move it ${plural(r.swapsLeft, 'more time')} in 30 days.` : 'It has been moved 3 times in the last 30 days already: reply to the email your licence came in and we will help.'),
    list);
  msg.tabIndex = -1; setTimeout(() => msg.focus(), 30); // the explanation, not a button: a stray Enter must not move the licence
}

/* ------------------------------------ desktop: the code ------------------------------------ */
// Pastes and activates a code. When all its devices are taken, offers to move it from one of them.
export function enterCode(prefill = '') {
  if (!desk()) return;
  const box = h('textarea', { rows: 4, class: 'licence-code', spellcheck: false, autocomplete: 'off', 'aria-label': 'Licence code', placeholder: 'GDEX-…' });
  box.value = prefill || '';
  const msg = h('p', { class: 'small', role: 'status' });
  const go = h('button', { type: 'button', class: 'btn primary', id: 'lic-activate', onclick: () => send() }, 'Activate');
  const body = h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, 'Paste the code from your email: all of it, starting with GDEX-. Gdex activates it online once, so it can count the devices it is used on (up to 3).'),
    box, msg, h('div', { class: 'actions' }, go));
  const sh = sheet('Enter licence code', body);
  setTimeout(() => box.focus(), 50);
  async function send(release) {
    go.disabled = true; go.textContent = 'Activating…'; msg.textContent = ''; msg.className = 'small';
    const r = await Promise.resolve(src.enter(box.value, release ? { release } : {})).catch(e => ({ error: e.message }));
    go.disabled = false; go.textContent = 'Activate';
    if (r && r.error === 'full') return chooser(msg, r, send);
    if (!r || r.error) { msg.textContent = (r && typeof r.error === 'string' && r.error) || 'Something went wrong. Try again.'; msg.className = 'small licence-warn'; return; }
    told(r); sh.close();
    toast(r.mode === 'licensed' ? 'Licensed: every role on this device.' : r.mode === 'pending' ? 'Code saved. Gdex activates it the next time it is online.' : 'Gdex could not reach the licence server. Try again when you are online.');
  }
}

/* ------------------------------------ website: sign in ------------------------------------ */
// The email address the licence was bought with: step 1 sends a 6-digit code there, step 2 checks it.
export function signIn() {
  if (!web()) return enterCode();
  const msg = h('p', { class: 'small', role: 'status' });
  const email = h('input', { type: 'email', id: 'lic-email', autocomplete: 'email', inputMode: 'email', 'aria-label': 'Email address', placeholder: 'you@example.com' });
  const codeBox = h('textarea', { rows: 3, class: 'licence-code', id: 'lic-code', spellcheck: false, autocomplete: 'off', 'aria-label': 'Licence code', placeholder: 'GDEX-…', hidden: true });
  let useCode = false, to = '';
  const toggle = h('button', { type: 'button', class: 'btn ghost small', id: 'lic-use-code', onclick: () => { useCode = !useCode; codeBox.hidden = !useCode; email.hidden = useCode; toggle.textContent = useCode ? 'Use your email address instead' : 'Have a licence code? Use it instead'; (useCode ? codeBox : email).focus(); } }, 'Have a licence code? Use it instead');
  const send = h('button', { type: 'submit', class: 'btn primary', id: 'lic-send' }, 'Send me a code');
  const agree = () => h('p', { class: 'small muted' }, 'By signing in you agree to Gdex’s ', h('a', { href: 'terms.html', target: '_blank', rel: 'noopener' }, 'terms'), '.');
  const step1 = h('form', { class: 'stack', novalidate: true, onsubmit: async e => {
    e.preventDefault(); msg.textContent = ''; msg.className = 'small';
    const addr = email.value.trim();
    if (!useCode && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { msg.textContent = 'Type the email address your licence belongs to.'; msg.className = 'small licence-warn'; return; }
    send.disabled = true; send.textContent = 'Sending…';
    const r = await src.start(useCode ? { code: codeBox.value } : { email: addr });
    send.disabled = false; send.textContent = 'Send me a code';
    if (r.error) { msg.textContent = r.error; msg.className = 'small licence-warn'; return; }
    to = (useCode ? r.email : addr).toLowerCase();
    step1.hidden = true; step2.hidden = false;
    whereTo.textContent = `We’ve emailed a 6-digit code to ${to}. It works for 15 minutes. Nothing after a few minutes? Check your spam folder, or try the address you bought with.`;
    digits.focus();
  } },
  h('p', { class: 'small muted' }, 'The email address you bought your licence with.'),
  email, codeBox, h('div', null, toggle), h('div', { class: 'actions' }, send), agree());
  const whereTo = h('p', { class: 'small muted', role: 'status' });
  const digits = h('input', { type: 'text', id: 'lic-digits', inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 7, pattern: '[0-9 ]*', 'aria-label': '6-digit code', placeholder: '123456', class: 'licence-digits' });
  const verify = h('button', { type: 'submit', class: 'btn primary', id: 'lic-verify' }, 'Sign in');
  const again = h('button', { type: 'button', class: 'btn ghost', id: 'lic-again', onclick: () => { step2.hidden = true; step1.hidden = false; msg.textContent = ''; digits.value = ''; send.focus(); } }, 'Send a new code');
  const step2 = h('form', { class: 'stack', hidden: true, onsubmit: async e => {
    e.preventDefault(); msg.textContent = ''; msg.className = 'small';
    verify.disabled = true; verify.textContent = 'Signing in…';
    const r = await src.verify(to, digits.value);
    verify.disabled = false; verify.textContent = 'Sign in';
    if (!r || r.error) { msg.textContent = (r && r.error) || 'Something went wrong. Try again.'; msg.className = 'small licence-warn'; return; }
    sh.close();
    await licenceReady();
    toast(licenceNow().mode === 'licensed' ? 'Licensed: every role on this device.' : 'Signed in.');
  } }, whereTo, digits, h('div', { class: 'actions' }, verify, again), agree());
  const sh = sheet('Sign in to Gdex', h('div', { class: 'stack lic-signin' }, step1, step2, msg));
  setTimeout(() => email.focus(), 50);
}

/* ------------------------------------ forget, sign out ------------------------------------ */
// Delete my licence records: says what goes and what stays before anything is deleted.
function forgetSheet() {
  const lic = licenceNow().licence || {};
  const msg = h('p', { class: 'small licence-warn', role: 'status' });
  const go = h('button', { type: 'button', class: 'btn danger', id: 'lic-forget-go', onclick: async () => {
    go.disabled = true; go.textContent = 'Deleting…';
    const r = await Promise.resolve(src.forget()).catch(e => ({ error: e.message }));
    if (!r || r.error) { go.disabled = false; go.textContent = 'Delete my records'; msg.textContent = (r && r.error) || 'Something went wrong. Try again.'; return; }
    told(r); sh.close(); toast('Your licence records have been deleted, and Gdex is signed out here.');
  } }, 'Delete my records');
  const sh = sheet('Delete my licence records', h('div', { class: 'stack' },
    h('p', null, `This deletes what Gdex’s licence server keeps about you: the email address of your licence${lic.email ? ` (${lic.email})` : ''}, and the list of devices on your licence. Gdex signs out here, and your other devices are signed out at their next check.`),
    h('p', { class: 'small muted' }, 'Your licence itself is not cancelled: sign in again at any time, and the records are made afresh. Stripe and Link keep their own records of a purchase. Your work in Gdex is not touched.'),
    msg, h('div', { class: 'actions' }, go)));
}

function releaseSheet(removeOnly = false) {
  const w = web(), label = removeOnly ? 'Remove the code' : w ? 'Sign out' : 'Release this computer';
  const msg = h('p', { class: 'small licence-warn', role: 'status' });
  const go = h('button', { type: 'button', class: 'btn primary', id: 'lic-release-go', onclick: async () => {
    go.disabled = true; go.textContent = w ? 'Signing out…' : 'Releasing…';
    const r = await Promise.resolve(src.release()).catch(e => ({ error: e.message }));
    if (!r || r.error) { go.disabled = false; go.textContent = label; msg.textContent = (r && r.error) || 'Something went wrong. Try again.'; return; }
    told(r); sh.close(); toast(removeOnly ? 'Licence code removed.' : w ? 'Signed out on this device.' : 'This computer has been released.');
  } }, label);
  const sh = sheet(w ? 'Sign out' : removeOnly ? 'Remove the licence code' : 'Release this computer', h('div', { class: 'stack' },
    h('p', null, w ? 'This signs Gdex out on this browser.' : removeOnly ? 'This takes the licence code off this computer.' : 'This takes your licence off this computer, so you can use the code on another one.'),
    h('p', { class: 'small muted' }, `Your bookings and everything else stay here. Without a licence, the working roles here go back to the free days, or are read-only if those are over; Audiophile stays free. You can ${w ? 'sign in' : 'enter the code'} again at any time.`),
    msg, h('div', { class: 'actions' }, go)));
}
