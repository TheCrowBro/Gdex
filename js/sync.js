// Keeping this device and Google Drive the same (free for everyone: decisions §9). Linked, every sync reads Tourbook's copy
// in the person's Drive (tourbook-db.json), merges it with this device's record by record (store.mergeDb), takes in what
// came from the other devices (store.adopt: no new time, never pushed straight back) and writes the copy back only
// when Drive lacks something. A change made here syncs 800 ms after the last one; Tourbook syncs again when it opens, when
// it comes back into view after a minute, and when the connection comes back. The first sync of each day also saves a
// dated copy (one per weekday and one per month, the last 12 kept). The Drive copy also carries freeDaysFrom, the
// earliest day any device on that Drive started its free days (the build spec [S-39]), outside the database.
// Status changes go only to onDriveChange listeners (the ☁ button and the backups panel), never to the store's redraw.
import * as store from './store.js';
import { ymd } from './util.js';
import { driveAdapter, configured, desktopFilesInBrowser, inDesktopApp, loadGIS, who, WORDS, COPY_NAME, clockSkew } from './drive.js';
import { freeDaysFrom, adoptFreeDaysFrom } from './licence-state.js';

const LS = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } },
  del: k => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const K = { on: 'tourbook-drive', at: 'tourbook-sync-at', copy: 'tourbook-backup-cloud' };
const fail = (message, name = 'DriveError') => { const e = new Error(message); e.name = name; return e; };

// status: off | synced | saving | needs-permission | error. unreadable: the shared copy in Drive can't be read (an
// error status; this device's copy can be put in its place). clock: this device's clock minus Google's, in ms, as the
// last answer from Drive showed it (js/drive.js clockSkew), told to the listeners when it changes.
const S = { status: 'off', error: '', backupError: '', unreadable: false, clock: 0 };
let adapter = LS.get(K.on) === '1' ? driveAdapter() : null;
const lastCopy = () => { try { return JSON.parse(LS.get(K.copy)) || {}; } catch { return {}; } };

export const driveState = () => ({
  linked: !!adapter, configured: configured(), away: desktopFilesInBrowser(), desktop: inDesktopApp(),
  status: adapter ? S.status : 'off', error: adapter ? S.error : '', backupError: adapter ? S.backupError : '', unreadable: !!adapter && S.unreadable,
  at: Number(LS.get(K.at)) || 0, backupAt: Number(lastCopy().at) || 0, who: who(), clock: adapter ? clockSkew() : 0,
});
const listeners = new Set();
export const onDriveChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const fire = () => { const st = driveState(); listeners.forEach(fn => { try { fn(st); } catch (e) { console.error(e); } }); };
const setStatus = (status, error = '') => { if (S.status === status && S.error === error) return; S.status = status; S.error = error; fire(); };

/* ------------------------------- the earliest free day ------------------------------- */
// A time Drive carries counts only when it is a plausible day: from 2026 on, and not ahead of this device's clock by
// more than a day (as adoptFreeDaysFrom checks it).
const plausible = t => (typeof t === 'number' && Number.isFinite(t) && t >= Date.UTC(2026, 0, 1) && t <= Date.now() + 864e5 ? t : 0);
const earliest = (...ts) => { const xs = ts.filter(t => t > 0); return xs.length ? Math.min(...xs) : 0; };
// The text written to Drive: the database's own keys, then the earliest free day when there is one.
const payload = from => JSON.stringify(from > 0 ? { ...store.db, freeDaysFrom: from } : store.db, null, 2);

// Two copies hold the same when they do after normalising the same way, whatever the order of their records and of an
// act's times seen and a log's takes (two devices can list the same ones in different orders, for instance after two
// changes in the same millisecond; comparing in order would make every sync write).
const idOf = x => String((x && x.id) || '');
const byId = (x, y) => (idOf(x) < idOf(y) ? -1 : idOf(x) > idOf(y) ? 1 : 0);
const ENTRIES = { acts: 'seen', logs: 'takes' };
function canon(d) {
  const n = store.normalise(d);
  for (const c of store.COLLECTIONS) {
    const k = ENTRIES[c];
    n[c] = [...n[c]].map(r => (k && Array.isArray(r[k]) ? { ...r, [k]: [...r[k]].sort(byId) } : r)).sort(byId);
  }
  n.deleted = Object.fromEntries(Object.entries(n.deleted).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return JSON.stringify(n);
}

/* ------------------------------- syncing ------------------------------- */
// One sync at a time: one asked for while another runs waits for it, then runs (so a change made meanwhile is never
// skipped). Disconnecting bumps gen, and a sync that started before stops at its next step without touching anything.
let syncing = null, gen = 0, timer = 0, busyTimer = 0;
export async function sync(opts = {}) {
  while (syncing) await syncing.catch(() => {});
  if (!adapter) return driveState();
  syncing = runSync(opts);
  try { await syncing; } finally { syncing = null; }
  if (clockSkew() !== S.clock) { S.clock = clockSkew(); fire(); } // the Drive card says when this device's clock is off
  return driveState();
}

async function runSync({ ask = false, quiet = false } = {}) {
  const a = adapter, g = gen;
  const alive = () => adapter === a && gen === g;
  try {
    if (!(await a.ready(ask))) { if (alive()) setStatus('needs-permission'); return; }
    if (!alive()) return;
    if (!quiet) setStatus('saving');
    const { data: raw, extras } = await a.read();
    if (!alive()) return;
    S.unreadable = false;
    // The field comes out of every copy before anything else looks at it.
    const split = d => { if (!d) return [null, 0]; const { freeDaysFrom: f, ...rest } = d; return [rest, plausible(f)]; };
    const [remote, remoteFrom] = split(raw);
    const more = extras.filter(x => x.data).map(x => split(x.data));
    // The earliest free day of any device on this Drive becomes this device's too (when it is earlier).
    const drivesFrom = earliest(remoteFrom, ...more.map(([, f]) => f));
    if (drivesFrom) { await adoptFreeDaysFrom(drivesFrom); if (!alive()) return; }
    const from = earliest(freeDaysFrom(), drivesFrom);
    // Taken in here when the other devices brought anything.
    let merged = remote ? store.mergeDb(store.db, remote) : store.normalise(store.db);
    for (const [d] of more) merged = store.mergeDb(merged, d);
    if (canon(merged) !== canon(store.db)) store.adopt(merged);
    // Written when Drive lacks anything: no copy yet, a record, or the earliest free day (missing, or later than ours).
    const stale = !remote || canon(store.db) !== canon(remote) || (from > 0 && remoteFrom !== from);
    if (stale) {
      setStatus('saving');
      await a.write(payload(from));
      if (!alive()) return;
    }
    for (const x of extras) if (x.data) { await a.deleteCopy(x.id); if (!alive()) return; }
    LS.set(K.at, Date.now());
    setStatus('synced');
    await dailyCopy(a, from, alive);
  } catch (e) {
    if (!alive() || e.name === 'AbortError') return; // a newer sign-in took over: it reports
    S.unreadable = !!e.unreadable;
    setStatus(e.name === 'NotAllowedError' ? 'needs-permission' : 'error', e.message);
    if (e.name === 'BusyError') { clearTimeout(busyTimer); busyTimer = setTimeout(() => { if (adapter) sync({ quiet: true }); }, 60000); }
    // A shared copy Tourbook can't read is left alone, but the day still gets its dated copy, from this device's data.
    if (e.unreadable) await dailyCopy(a, earliest(freeDaysFrom()), alive);
  }
}

/* ------------------------------- the daily copy ------------------------------- */
// On the first good sync of each day: the weekday's file (overwritten a week later) and, when the month has none yet,
// the month's. Monthly files beyond the last 12 are deleted. A failure is kept and shown; the next sync tries again.
const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHLY = /^tourbook-backup-\d{4}-\d{2}\.json$/;
async function dailyCopy(a, from, alive) {
  const now = new Date(), day = ymd(now), month = day.slice(0, 7);
  if (lastCopy().day === day) return;
  try {
    const files = await a.listCopies();
    if (!alive()) return;
    const text = payload(from);
    const wk = `tourbook-backup-${WEEK[now.getDay()]}.json`, mo = `tourbook-backup-${month}.json`;
    const named = n => files.filter(f => f.name === n);
    await a.writeCopy(wk, text, (named(wk)[0] || {}).id || null);
    for (const f of named(wk).slice(1)) await a.deleteCopy(f.id); // two devices made it at once: one is enough
    if (!named(mo).length) await a.writeCopy(mo, text);
    const months = [...new Set([...files.map(f => f.name).filter(n => MONTHLY.test(n)), mo])].sort().reverse();
    for (const old of months.slice(12)) for (const f of named(old)) await a.deleteCopy(f.id);
    if (!alive()) return;
    LS.set(K.copy, JSON.stringify({ day, month, at: Date.now(), name: wk }));
    S.backupError = '';
  } catch (e) {
    if (!alive()) return;
    S.backupError = e.message;
  }
  fire();
}

// The daily copies in Drive, newest first: [{ name, id, label, at }]. From a tap (ask): signs in again when the hour
// is up.
const DAYS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const labelOf = name => {
  const m = COPY_NAME.exec(name);
  if (!m) return name;
  if (DAYS[m[1]]) return DAYS[m[1]];
  const [y, mo] = m[1].split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};
export async function listDailyCopies({ ask = false } = {}) {
  const a = adapter;
  if (!a) return [];
  const was = S.status;
  try { if (!(await a.ready(ask))) throw fail(WORDS.again, 'NotAllowedError'); }
  catch (e) { if (e.name === 'NotAllowedError' && adapter === a) setStatus('needs-permission'); throw e; }
  if (was === 'needs-permission') sync({ quiet: true }); // signed in again from here: catch up too
  const seen = new Set();
  return (await a.listCopies())
    .filter(f => !seen.has(f.name) && seen.add(f.name))
    .map(f => ({ name: f.name, id: f.id, label: labelOf(f.name), at: Date.parse(f.modifiedTime) || 0 }))
    .sort((x, y) => y.at - x.at);
}
export async function readDailyCopy(name) {
  if (!adapter) throw fail('Google Drive isn’t connected on this device.');
  return adapter.readCopy(name);
}

/* ------------------------------- linking ------------------------------- */
const schedule = ms => { clearTimeout(timer); timer = setTimeout(() => { timer = 0; if (adapter) sync({ quiet: true }); }, ms); };

// From the connect sheet's tap: sign in first (Google's window opens straight from the tap), then link and make the
// first sync. If that sync does not finish, everything is undone and the reason thrown: nothing is left half-linked.
export async function connectDrive() {
  if (desktopFilesInBrowser()) throw fail(WORDS.away);
  const a = driveAdapter();
  await a.ready(true);
  gen++; clearTimeout(timer); timer = 0;
  adapter = a; LS.set(K.on, '1');
  LS.del(K.copy); // today's copy goes into this Drive too
  S.status = 'off'; S.error = ''; S.backupError = ''; S.unreadable = false;
  fire();
  await sync();
  if (adapter === a && (S.status === 'error' || S.status === 'needs-permission')) {
    const msg = S.error || 'The sign-in didn’t finish. Try again.';
    await disconnectDrive();
    throw fail(msg);
  }
  return driveState();
}

// The shared copy in Drive can't be read (S.unreadable): it is kept aside, as it is, as tourbook-db-unreadable-<day>.json, and
// this device's copy goes in its place; the daily copies stay. Read again first: a copy that can be read now (another
// device put it right) is merged as usual instead. From a tap (signs in again when the hour is up).
export async function replaceUnreadable() {
  const a = adapter;
  if (!a) return driveState();
  await a.ready(true);
  while (syncing) await syncing.catch(() => {});
  if (adapter !== a) return driveState();
  const g = gen;
  let done = false;
  syncing = (async () => {
    try {
      setStatus('saving');
      try { await a.read(); return; } catch (e) { if (!e.unreadable) throw e; } // readable after all: the sync below merges it
      if (adapter !== a || gen !== g) return;
      await a.setAside(`tourbook-db-unreadable-${ymd(new Date())}.json`);
      if (adapter !== a || gen !== g) return;
      await a.write(payload(earliest(freeDaysFrom())));
      S.unreadable = false;
      done = true;
    } catch (e) { if (adapter === a && gen === g && e.name !== 'AbortError') setStatus(e.name === 'NotAllowedError' ? 'needs-permission' : 'error', e.message); }
  })();
  try { await syncing; } finally { syncing = null; }
  return done || S.status === 'saving' ? sync() : driveState();
}

// Sync now, and Sign in again (ask: Google's window when the hour is up).
export const syncNow = ({ ask = true } = {}) => (adapter ? sync({ ask }) : Promise.resolve(driveState()));

// Stop syncing on this device. Both copies stay: this device's and the one in Drive.
export async function disconnectDrive() {
  const a = adapter;
  if (!a) return false;
  gen++; clearTimeout(timer); timer = 0; clearTimeout(busyTimer);
  adapter = null;
  a.signOut();
  S.status = 'off'; S.error = ''; S.backupError = ''; S.unreadable = false;
  fire();
  return true;
}

// Delete Tourbook's copy and every daily copy from Drive, then disconnect. This device keeps everything. Nothing new is
// copied while it deletes, and a sync already running finishes first, so nothing lands after the delete.
export async function deleteDriveCopy() {
  const a = adapter;
  if (!a) return 0;
  if (!(await a.ready(false))) { setStatus('needs-permission'); throw fail('Tap Sign in again above, then delete.'); }
  clearTimeout(timer); timer = 0;
  while (syncing) await syncing.catch(() => {});
  if (adapter !== a) return 0;
  adapter = null; gen++;
  let n;
  try { n = await a.deleteAll(); }
  catch (e) { adapter = a; if (e.name === 'NotAllowedError') setStatus('needs-permission', ''); throw e; }
  adapter = a;
  LS.del(K.at); LS.del(K.copy);
  await disconnectDrive();
  return n;
}

// Once, when the backups module loads (at idle on every open): sync when linked (quietly: with the hour over it says
// "sign in" and opens nothing), after every change, when Tourbook comes back into view after a minute or more, and when
// the connection comes back. Leaving Tourbook with a change waiting syncs it at once.
let started = false;
export function initDrive() {
  if (started) return;
  started = true;
  store.afterWrite(() => { if (adapter && S.status !== 'needs-permission') schedule(800); });
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); if (timer && adapter) { clearTimeout(timer); timer = 0; sync({ quiet: true }); } return; }
    if (adapter && hiddenAt && Date.now() - hiddenAt >= 60000) sync({ quiet: true });
    hiddenAt = 0;
  });
  addEventListener('online', () => { if (adapter) sync({ quiet: true }); });
  // Another tab of Tourbook on this device disconnected Drive (Disconnect, Delete Tourbook's copy, Erase) or connected it: this
  // tab follows, so it never syncs a Drive the person disconnected.
  addEventListener('storage', e => {
    if (e.key !== K.on && e.key !== null) return;
    const on = LS.get(K.on) === '1';
    if (!on && adapter) {
      gen++; clearTimeout(timer); timer = 0; clearTimeout(busyTimer);
      adapter = null;
      S.status = 'off'; S.error = ''; S.backupError = ''; S.unreadable = false;
      fire();
    } else if (on && !adapter) {
      adapter = driveAdapter();
      S.status = 'off'; S.error = ''; S.backupError = ''; S.unreadable = false;
      fire();
      sync({ quiet: true });
    }
  });
  if (!adapter) return;
  if (configured() && !inDesktopApp() && !desktopFilesInBrowser()) loadGIS().catch(() => {}); // so Sign in again opens Google's window straight from the tap
  sync({ quiet: true });
}
