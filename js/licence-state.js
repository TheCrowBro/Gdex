// The licence, as every module asks it (the build spec §3.5): synchronous for every question, no network of its own.
// Decisions §9: the Audiophile is free for good; every other role, Jack of Trades included, has 30 free days on this
// device from the first time one is used, then needs a licence (20 USD once, up to 3 devices). Without one a paid role
// is read-only and the Audiophile keeps its own sections; nothing is ever deleted.
//
// Off until the owner switches it on: on the website while LICENCE_SITES (js/licence-config.js) lacks this host, in the
// desktop app while its own switch is off (the bridge says so). Off, every answer is "open", nothing is shown, and
// nothing is asked of a licence server. The sources of truth:
//   website   localStorage gdex-licence (+ its second copy, IndexedDB gdex/kv/licence-days), js/licence-web.js for
//             the server's answers (the status, the sign-in, the daily check), loaded only when live
//   desktop   window.gdexDesktop.licence (desktop/licence.cjs), its last answer kept as gdex-licence-cache
// The sheets, the Settings panel and the bar are in js/licence.js, loaded when one is needed.
import { roleId, roleChosen, roleNeedsLicence, sectionNeedsLicence } from './roles.js';
import { setGate, redraw } from './store.js';
import { muteToasts, announce, toast, closeSheets } from './util.js';
import { LICENCE_SITES } from './licence-config.js';
import { readWebNote } from './licence-note.js';
import { kvGet, kvSet } from './kv.js';
import { termsDue, askTerms } from './terms.js';

export const LICENCE_EVENT = 'gdex-licence';
// Owner question 6 (answered: locked). true would make the working boxes and the paid records a free role reaches from
// its own sections (line-up, setlist, take log, People's cards…) free again.
export const FREE_KEEPS_WORK = false;

const KEY = 'gdex-licence', CACHE = 'gdex-licence-cache', DAYS = 'licence-days';
const DAY = 864e5, TRIAL_DAYS = 30, SEATS = 3;
const OFFLINE_LIMIT = 90 * DAY;          // a sign-in must be confirmed at least once in 90 days
const PAUSE_FRESH = 12 * 3600e3;         // a paused status counts for 12 hours (the build spec [S-9])
const STATUS_FRESH = 6 * 3600e3;         // the status is asked at most this often
const EARLIEST = Date.UTC(2026, 0, 1);   // no free day starts before Gdex had a licence
const num = x => (Number.isFinite(Number(x)) ? Number(x) : 0);
const pad = n => String(n).padStart(2, '0');
const localDay = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };

/* ----------------------------------- where ----------------------------------- */
const bridge = () => (window.gdexDesktop && window.gdexDesktop.licence) || null;
// The desktop app's files opened in a web browser (its local server's ports, without its bridge): a licence-free Gdex
// with Drive, were it allowed. Every paid role and section is locked there, and nothing is asked (the build spec [S-42]).
const away = () => !window.gdexDesktop && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && num(location.port) >= 47861 && num(location.port) <= 47880;
// This website is one where the licence is live (the owner's switch). A pause from the licence server can still make it off.
const liveSite = () => !bridge() && !away() && LICENCE_SITES.includes(location.hostname);

/* ------------------------------ the website's record ------------------------------ */
// gdex-licence, read and written whole. Where storage is blocked (a private window), the visit keeps its own copy.
let mem = null;
const clone = o => JSON.parse(JSON.stringify(o));
// The earliest start of the free days this visit has known ([S-27]). Gdex only ever moves a start earlier (Google
// Drive's, the licence server's time), so a later start, or none, in gdex-licence while Gdex is open is one copy changed
// by hand: the earlier counts, as the IndexedDB copy makes it count at the next opening when the key is deleted.
let earliest = 0;
function read() {
  let s = null;
  try { const raw = localStorage.getItem(KEY); if (raw != null) { const v = JSON.parse(raw); s = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } } catch { /* blocked: the visit's copy */ }
  if (!s) s = mem ? clone(mem) : {};
  if (earliest && !(num(s.first) > 0 && num(s.first) <= earliest)) s.first = earliest;
  if (num(s.first) > 0 && (!earliest || num(s.first) < earliest)) earliest = num(s.first);
  return s;
}
function write(s) {
  mem = clone(s);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* blocked: kept for this visit */ }
}
// The free days' second copy, beside gdex-licence (the build spec [S-27]): fire and forget, joined with what it holds
// (the earlier start), never overwritten with a later one.
const keepDays = s => {
  const first = num(s.first), seen = num(s.seen);
  if (first > 0) kvGet(DAYS).catch(() => null).then(d => { const had = d && num(d.first) > 0 ? num(d.first) : 0; return kvSet(DAYS, { first: had && had < first ? had : first, seen }); }).catch(() => {});
};

const paused = (s, t) => s.on === false && t >= num(s.statusAt) && t - num(s.statusAt) < PAUSE_FRESH;
const ended = (l, t) => !!(l && /^\d{4}-\d{2}-\d{2}$/.test(String(l.expires || '')) && t >= Date.parse(l.expires + 'T00:00:00Z') + DAY);
const cleanLicence = l => (l && typeof l === 'object' ? { name: String(l.name || ''), email: String(l.email || ''), ref: String(l.ref || ''), seats: num(l.seats) || SEATS, comp: !!l.comp, expires: String(l.expires || '') } : null);

// The website's state at time t, in the order of the build spec §3.5.
function webState(s, t) {
  const base = { kind: 'web', started: false, first: 0, trialLeft: TRIAL_DAYS, trialEnds: '', licence: null, seats: SEATS };
  if (away()) return { ...base, mode: 'away', canEdit: false };
  if (!LICENCE_SITES.includes(location.hostname) || paused(s, t)) return { ...base, mode: 'off', canEdit: true };
  const first = num(s.first) > 0 ? num(s.first) : 0, started = first > 0;
  const seen = Math.max(num(s.seen), t);
  const left = started ? Math.max(0, TRIAL_DAYS - Math.floor((seen - first) / DAY)) : TRIAL_DAYS;
  const clock = started && (first > t + DAY || num(s.seen) > t + 2 * DAY); // the device's clock is wrong ([S-38])
  const trial = { started, first, trialLeft: left, trialEnds: started ? localDay(first + TRIAL_DAYS * DAY) : '' };
  const free = !clock && left > 0;
  const licence = cleanLicence(s.licence);
  if (s.cancelled && !s.token) return { ...base, ...trial, licence, mode: 'cancelled', canEdit: free };
  if (licence && (s.expired || ended(licence, t))) return { ...base, ...trial, licence, mode: 'expired', canEdit: free };
  if (!s.token || !licence) {
    if (!started) return { ...base, ...trial, mode: 'unstarted', canEdit: true };
    if (clock) return { ...base, ...trial, mode: 'clock', canEdit: false };
    return { ...base, ...trial, mode: left > 0 ? 'trial' : 'ended', canEdit: left > 0 };
  }
  // Past 90 days, read-only only once a check made after that has failed (not while it is still checking).
  if (t - num(s.checked) > OFFLINE_LIMIT && num(s.tried) > num(s.checked) + OFFLINE_LIMIT) return { ...base, ...trial, licence, seats: licence.seats, via: 'email', mode: 'offline', canEdit: false };
  return { ...base, ...trial, licence, seats: licence.seats, via: 'email', mode: 'licensed', canEdit: true };
}

/* ------------------------------ the desktop app's state ------------------------------ */
const OFF_DESKTOP = { kind: 'desktop', mode: 'off', canEdit: true, started: false, first: 0, trialLeft: TRIAL_DAYS, trialEnds: '', licence: null, seats: SEATS };
let cacheMem = null;
function readCache() {
  try { const raw = localStorage.getItem(CACHE); if (raw != null) { const v = JSON.parse(raw); if (v && typeof v === 'object') return v; } } catch { /* blocked */ }
  return cacheMem;
}
function desktopState() {
  const c = readCache();
  if (!c || typeof c.mode !== 'string' || c.enabled === false) return { ...OFF_DESKTOP, ...(c && typeof c === 'object' ? { buyUrl: c.buyUrl, os: c.os, enabled: c.enabled } : {}), mode: 'off', canEdit: true };
  return { ...OFF_DESKTOP, ...c, kind: 'desktop', canEdit: c.canEdit !== false, started: !!c.started, first: num(c.first), trialLeft: Number.isFinite(Number(c.trialLeft)) ? Number(c.trialLeft) : TRIAL_DAYS, licence: cleanLicence(c.licence) && { ...c.licence } };
}

/* ------------------------------------ the state ------------------------------------ */
export function licenceNow() {
  try { return bridge() ? desktopState() : webState(read(), Date.now()); } catch { return { ...OFF_DESKTOP, kind: 'web' }; }
}
export const licenceOn = () => licenceNow().mode !== 'off';

const listeners = new Set();
let last = ''; // the state last told (set at the end of this module, so loading tells nobody anything)
// Tells everyone when the state changed: the window event (js/app.js, Settings, the role picker, the search) and onLicenceChange.
function fire() {
  const st = licenceNow(), sig = JSON.stringify(st);
  if (st.kind === 'web') watchToken();
  if (sig === last) return st;
  last = sig;
  listeners.forEach(fn => { try { fn(st); } catch (e) { console.error(e); } });
  try { window.dispatchEvent(new CustomEvent(LICENCE_EVENT, { detail: st })); } catch (e) { console.error(e); }
  return st;
}
export const onLicenceChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

// What js/licence-web.js and js/licence.js tell this module. Desktop: the bridge's answer, kept as the cache so the menu
// is right before the bridge answers at the next opening. Website: the record changed; it is read again.
export function setLicenceState(state) {
  if (bridge() && state && typeof state === 'object' && typeof state.mode === 'string' && !state.error) {
    cacheMem = { ...state, kind: 'desktop' };
    try { localStorage.setItem(CACHE, JSON.stringify(cacheMem)); } catch { /* blocked: for this visit */ }
  }
  fire();
}
// The website's record, changed in one place (js/licence-web.js writes through this): read, change, write, tell.
export function changeLicence(fn) {
  const s = read(), before = JSON.stringify([num(s.first), num(s.seen)]);
  fn(s);
  write(s);
  if (JSON.stringify([num(s.first), num(s.seen)]) !== before) keepDays(s);
  return fire();
}

/* ---------------------------- the website's sign-in, checked ---------------------------- */
// A token counts only once its signature checks out (Ed25519, GDEX-WEB, key 2) and it names the licence it came with
// (the build spec [S-40]). Until the check has run (a few milliseconds) it is believed. A browser that cannot check
// (no Ed25519) believes it, as Vdex does, and leaves it to the daily check.
// What was checked: the token whole and the licence it names, so a change to any of them is checked again.
const tokenKey = s => JSON.stringify([s.token, (s.licence && s.licence.ref) || '', (s.licence && s.licence.email) || '']);
let verified = null, checking = null; // the token that checked out this visit (null: none yet)
function watchToken() {
  const s = read();
  if (!liveSite() || !s.token || checking) return checking;
  const sig = tokenKey(s);
  if (sig === verified) return null;
  checking = (async () => {
    let note = null, cannot = false;
    try { note = await readWebNote(s.token); } catch (e) { if (e && e.name === 'NotSupportedError') cannot = true; }
    checking = null;
    const now = read();
    if (!now.token || tokenKey(now) !== sig) return watchToken(); // changed meanwhile: check the new one
    const l = now.licence || {};
    if (cannot || (note && String(note.ref || '') === String(l.ref || '') && String(note.email || '') === String(l.email || ''))) { verified = sig; return; }
    delete now.token; delete now.licence; delete now.via; // forged or for another licence: signed out (not "cancelled")
    write(now); fire();
  })();
  return checking;
}

/* ---------------------------- the free days' second copy ---------------------------- */
// Joined at load: the earlier start and the later time seen of the two, written back where they differed ([S-27]).
async function joinDays() {
  let d = null;
  // No IndexedDB here, or one that never answers (some Safari versions' first open): not an error, and nothing waits on it
  // for more than 3 seconds (the sheets at opening and the free days' start wait for this).
  try { d = await Promise.race([kvGet(DAYS), new Promise((_, no) => setTimeout(() => no(new Error('IndexedDB did not answer')), 3000))]); } catch { return; }
  const s = read();
  const a = num(s.first) > 0 ? num(s.first) : 0, b = d && num(d.first) > 0 ? num(d.first) : 0;
  const first = a && b ? Math.min(a, b) : a || b;
  if (!first) return;
  const seen = Math.max(num(s.seen), num(d && d.seen), first);
  if (first !== num(s.first) || seen !== num(s.seen)) { s.first = first; s.seen = seen; write(s); }
  if (!d || first !== num(d.first) || seen !== num(d.seen)) kvSet(DAYS, { first, seen }).catch(() => {});
}

let ready = null;
// Resolves once the second copy has been joined in and the sign-in's signature checked (website, live); at once
// elsewhere. The free-days-over sheet and startFreeDays wait for it.
export function licenceReady() {
  if (!ready) ready = liveSite() ? Promise.all([joinDays(), watchToken()]).catch(() => {}).then(() => { fire(); }) : Promise.resolve();
  return ready;
}

/* ------------------------------------ the answers ------------------------------------ */
const hasLicence = s => (s.mode === 'licensed' || s.mode === 'pending') && s.canEdit;
// A paid role in use counts once the first run is settled (a role picked, the welcome tour done, or the first-run
// question closed), so a newcomer is never counted while "Who's using Gdex?" is still up ([S-2]).
export const firstRunSettled = () => roleChosen() || !!lsGet('gdex-tour') || !!lsGet('gdex-role-nudged');
// The table of the build spec §3.5: paid: the role in use is a paid one.
function answer(paid) {
  const s = licenceNow();
  if (s.mode === 'off') return 'open';
  if (s.mode === 'away') return 'locked';
  if (hasLicence(s) || (s.canEdit && s.started)) return 'open';
  if (paid) return 'open'; // the role in use starts the days at once, or is read-only
  return s.canEdit ? 'start' : 'locked';
}
export const mayWork = () => answer(roleNeedsLicence(roleId()));
export const mayOpen = id => (sectionNeedsLicence(id) ? mayWork() : 'open');
export const mayPickRole = id => (roleNeedsLicence(id) ? answer(false) : 'open');

let declined = false; // the terms sheet was closed without agreeing this visit ([S-37])
// Only while the terms are still not agreed: agreeing anywhere later (the role picker asks them again) ends it.
export const termsDeclined = () => declined && termsDue(true);
export function canWrite() {
  const s = licenceNow(), paid = roleNeedsLicence(roleId());
  if (s.mode === 'off') return true; // switched off, or paused by the licence server: everything as before
  if (s.canEdit) return !(termsDeclined() && paid);
  if (paid) return false;
  let page = 'bookings'; try { page = (window.logiPage && window.logiPage()) || 'bookings'; } catch { /* not drawn yet */ }
  return !sectionNeedsLicence(page);
}

const workOpen = () => !licenceOn() || roleNeedsLicence(roleId()) || FREE_KEEPS_WORK || mayWork() === 'open';
// The one line of [S-3]: a working box or a paid record reached from a free section. fn runs at once while it is
// open; on 'start' once the free days have started (the terms sheet first if due); on 'locked' the licence is offered.
// kind: the booking's kind when what was tapped is a studio session or a rehearsal itself, so the offer speaks of it.
export function gateWork(fn, kind = '') {
  if (workOpen()) { fn(); return; }
  // Not started after all: open anyway when it has opened meanwhile (the licence server paused it as it was asked).
  if (mayWork() === 'start') { startFreeDays().then(ok => { if (ok) toastStarted(); if (ok || workOpen()) fn(); }).catch(e => console.error(e)); return; }
  import('./licence.js').then(m => (licenceNow().mode === 'away' ? m.awaySheet() : m.offerSection('work', kind))).catch(e => console.error(e));
}

// The working roles close for the role in use (Carry on free as an Audiophile, the free days running out, a pause
// ending): every sheet still open goes with them (a working form, a song's or a person's card, the setlist editor), as
// the page goes back to the calendar, so nothing in them is changed without a licence (for a free role the store's gate
// asks only the section on screen). The licence's own sheets stay.
const LICENCE_SHEETS = '.licence-over, .licence-readonly, .licence-needed, .licence-away, .lic-terms-sheet';
let workWas = true;
function workClosed() {
  const now = workOpen();
  if (workWas && !now) closeSheets(el => !!(el && el.matches(LICENCE_SHEETS)));
  workWas = now;
}
onLicenceChange(workClosed);
window.addEventListener('gdex-role', workClosed);

// A mark: its text, and its spoken words, said after the name of what it marks ("People, needs a licence").
const markFor = a => (a === 'start' ? { text: '30 days free', label: 'opens your 30 free days' }
  : licenceNow().mode === 'away' ? { text: '🔒 Desktop app', label: 'only in Gdex’s desktop app' }
    : { text: '🔒 Licence', label: 'needs a licence' });
// The mark on the More boxes fold (§9.3: "More boxes, opens your 30 free days"); null when gateWork would call at once.
export const workMark = () => (workOpen() ? null : markFor(mayWork()));
// A bonus track's mark and its spoken words (§9.3: "<Section>, opens your 30 free days"); null while off or when it opens.
export function sectionMark(id) {
  const a = mayOpen(id);
  return a === 'open' ? null : markFor(a);
}
// The welcome tour's and Settings → Your role's words while the working roles are not open to the role in use: what
// its bonus tracks are (a tap offers the licence or starts the free days, §9.3), and why a working role cannot be
// picked now. '' for each while they are open, and while off.
export function closedWords() {
  const away = licenceNow().mode === 'away';
  const bonus = workOpen() ? '' : away ? 'They come with Gdex’s working roles, in Gdex’s desktop app.'
    : mayWork() === 'start' ? 'They come with Gdex’s working roles: opening one starts your 30 free days.' : 'They come with Gdex’s working roles and need a licence.';
  const roles = mayPickRole('all') !== 'locked' ? '' : away ? 'The working roles work only in Gdex’s desktop app.' : 'The working roles need a licence now.';
  return { bonus, roles };
}
// The role picker's words for a role (§9.2); '' while off.
export function roleBadge(id) {
  const s = licenceNow();
  if (s.mode === 'off') return '';
  if (!roleNeedsLicence(id)) return 'Free';
  if (s.mode === 'away') return 'Desktop app only';
  if (hasLicence(s)) return 'Licensed';
  if (s.canEdit && s.started) return s.trialLeft === 1 ? '1 free day left' : `Free days: ${s.trialLeft} left`;
  if (s.canEdit) return '30 days free, then a licence';
  return 'Needs a licence';
}

/* ------------------------------------ the free days ------------------------------------ */
// The day the free days end, in words ("Dec 13"), and the toast that says they started (§9.1).
export const endsWords = s => { const t = s && s.trialEnds ? new Date(s.trialEnds + 'T12:00:00') : null; return t && !Number.isNaN(+t) ? t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''; };
// Said once per start: several callers can be waiting on the same start (the opening or a role change, and the licence
// event that the start itself fires), and each of them asks for the toast.
let toldStart = 0;
export function toastStarted() {
  const s = licenceNow(), until = endsWords(s);
  if (!s.started || !(s.first > 0) || s.first === toldStart) return;
  toldStart = s.first;
  toast(`Your 30 free days of Gdex’s working roles have started on this device${until ? `: until ${until}` : ''}.`);
}

let starting = null;
// Starts the free days now, when licences are on and they have not started and there is no licence: the terms sheet
// first when it is due. true when they started. One call at a time: a second call while the first waits gets its answer.
export function startFreeDays() {
  if (starting) return starting;
  starting = (async () => {
    await licenceReady();
    if (liveSite()) {
      // The pause is respected before anything starts: the status, unless a fresh one is known (no answer counts as on).
      const s = read(), t = Date.now();
      if (!num(s.statusAt) || t - num(s.statusAt) > STATUS_FRESH || t < num(s.statusAt)) { try { await (await import('./licence-web.js')).status(true); } catch { /* offline: on */ } }
    }
    const st = licenceNow();
    if (st.mode === 'off' || st.mode === 'away') return false;
    if (st.started || ['licensed', 'pending', 'offline'].includes(st.mode)) {
      // Nothing to start. The terms are asked again of a working role that can use them when they have changed since
      // they were agreed (or were never agreed here: a start taken from Google Drive) ([S-37]); Not now makes it
      // read-only for this visit, as before the start.
      if (st.canEdit && roleNeedsLicence(roleId()) && termsDue(true) && !(await askTerms())) { declined = true; fire(); }
      return false;
    }
    if (termsDue(true) && !(await askTerms())) { declined = true; fire(); return false; }
    declined = false;
    const now = Date.now();
    if (bridge()) {
      cacheMem = { ...st, mode: st.mode === 'unstarted' ? 'trial' : st.mode, canEdit: true, started: true, first: now, trialLeft: TRIAL_DAYS, trialEnds: localDay(now + TRIAL_DAYS * DAY) };
      try { localStorage.setItem(CACHE, JSON.stringify(cacheMem)); } catch { /* blocked */ }
      Promise.resolve().then(() => bridge().start()).then(setLicenceState).catch(e => console.error(e));
      fire();
    } else changeLicence(s => { s.first = now; s.seen = Math.max(num(s.seen), now); });
    return true;
  })().finally(() => { starting = null; });
  return starting;
}
// The terms, agreed from the read-only sheet after a Not now: this visit's refusal is over.
export function termsAgreed() { declined = false; fire(); }

export const freeDaysFrom = () => { const s = licenceNow(); return s.started && num(s.first) > 0 ? num(s.first) : 0; };
// Google Drive's earliest start of any device on it ([S-39], js/sync.js): an earlier start is taken; never the terms sheet.
export async function adoptFreeDaysFrom(t) {
  const now = Date.now();
  if (typeof t !== 'number' || !Number.isFinite(t) || t < EARLIEST || t > now + DAY) return false;
  if (bridge()) {
    const st = licenceNow();
    if (st.mode === 'off' || typeof bridge().adopt !== 'function' || (st.started && !(t < num(st.first)))) return false;
    try { setLicenceState(await bridge().adopt(t)); } catch (e) { console.error(e); return false; }
    return true;
  }
  if (!liveSite()) return false;
  await licenceReady();
  const s = read();
  if (num(s.first) > 0 && !(t < num(s.first))) return false;
  changeLicence(x => { x.first = t; x.seen = Math.max(num(x.seen), t); });
  return true;
}

// The licence server's time (the Date header of a JSON answer) corrects a device clock that was wound on ([S-38]).
export function serverTime(ms) {
  const T = Number(ms);
  if (!Number.isFinite(T) || T <= 0 || !liveSite()) return;
  const s = read(), first = num(s.first), seen = num(s.seen);
  if (!(first > 0)) return;
  if (first > T + DAY || seen > T + 2 * DAY) {
    const used = Math.max(0, seen - first); // the days used are kept, the frozen ones are not given back
    changeLicence(x => { x.first = T - used; x.seen = T; });
  } else if (T > seen) changeLicence(x => { x.seen = T; });
}

// Looked at again: the day may have turned. The website keeps the latest time seen (winding the clock back gains nothing).
export function refreshLicence() {
  if (bridge()) { Promise.resolve().then(() => bridge().state()).then(setLicenceState).catch(() => {}); return licenceNow(); }
  if (liveSite()) {
    const s = read(), t = Date.now();
    if (num(s.first) > 0 && t > num(s.seen) + 60e3) return changeLicence(x => { x.seen = Math.max(num(x.seen), t); });
  }
  return fire();
}

/* ------------------------------------ the sources ------------------------------------ */
let sourced = false;
// Called once at idle by js/app.js. Desktop: the bridge's state, and its changes. Website, only when live: the status,
// the daily check of a sign-in, and a look again when Gdex comes back, comes online, every hour and when another tab
// changes the record. Off: nothing is loaded and nothing is asked.
export function initLicenceSource() {
  if (sourced) return Promise.resolve();
  sourced = true;
  const b = bridge();
  if (b) {
    try { if (typeof b.onChange === 'function') b.onChange(setLicenceState); } catch (e) { console.error(e); }
    const tick = () => refreshLicence();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    window.addEventListener('online', tick);
    setInterval(tick, 3600e3);
    return Promise.resolve().then(() => b.state()).then(setLicenceState).catch(e => console.error(e));
  }
  if (!liveSite()) return Promise.resolve();
  const web = () => import('./licence-web.js');
  const tick = () => web().then(m => m.recheck(false)).catch(() => {}).then(() => refreshLicence());
  window.addEventListener('storage', e => { if (e.key === KEY) { verified = null; fire(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('online', tick);
  setInterval(tick, 3600e3);
  return web().then(m => m.startWebLicence()).catch(e => console.error(e));
}

/* ------------------------------------ the write gate ------------------------------------ */
// The store's one gate (js/store.js setGate): a paid role without a working licence cannot change things. A change the
// person just asked for is explained by the read-only sheet (a form stays open with what was typed; a ticked box is
// drawn again with what is stored, and keeps the focus); background work is refused quietly.
let input = 0, redrawT = 0;
const touched = e => { if (e.isTrusted) input = Date.now(); };
for (const t of ['pointerdown', 'keydown', 'change']) document.addEventListener(t, touched, true);
// Marks the focused control so the focus can go to its redrawn copy (util.sheet follows data-fk when it closes).
function rememberFocus() {
  document.querySelectorAll('[data-fk="licence-ro"]').forEach(e => { delete e.dataset.fk; });
  const el = document.activeElement, page = document.getElementById('page');
  if (!el || !page || !page.contains(el) || el.closest('[data-fk]')) return null;
  const sig = e => [e.tagName, e.type || '', e.getAttribute('aria-label') || '', e.name || '', e.id || '', ((e.closest('label') || e).textContent || '').trim().slice(0, 80)].join('|');
  const want = sig(el), nth = [...page.querySelectorAll(el.tagName)].filter(e => sig(e) === want).indexOf(el);
  el.dataset.fk = 'licence-ro';
  return () => { const twin = [...page.querySelectorAll(el.tagName)].filter(e => sig(e) === want)[nth]; if (twin && twin !== el) twin.dataset.fk = 'licence-ro'; };
}
setGate(({ form = false, quiet = false } = {}) => {
  if (canWrite()) return true;
  if (quiet) return false; // a side effect of something allowed: skipped without a word
  muteToasts(600);
  if (Date.now() - input < 3000) {
    const twin = form ? null : rememberFocus();
    import('./licence.js').then(m => m.readOnlySheet({ form })).catch(e => { console.error(e); announce('Read-only: nothing was changed.'); });
    if (!form) { clearTimeout(redrawT); redrawT = setTimeout(() => { redraw(); if (twin) setTimeout(twin, 0); }, 0); }
  }
  return false;
});
last = JSON.stringify(licenceNow()); // the state as the page opens: only a change from it is told
workWas = workOpen();
licenceReady(); // the second copy joined and the sign-in checked as soon as the page loads (website, live)
