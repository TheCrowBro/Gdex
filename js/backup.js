// Backups. Gdex keeps everything in this browser unless the person connects Google Drive, so this is the safety net:
// Google Drive (free for everyone: js/sync.js keeps every connected device the same and saves a dated copy each day;
// its card is at the top of the panel); a backup file saved and brought back (merged into this device or replacing
// it), optionally locked with a passphrase; a copy kept in a file in a synced folder (Chrome or Edge on a computer),
// written a moment after every change; how recent the last copy is; and an occasional reminder. The ☁ button at the
// top opens openBackupSheet() and shows the worse of Drive's and the file copy's states; Settings → Backups shows
// backupPanel().
import { h, sheet, toast, announce, todayISO, nodes, fmtTime } from './util.js';
import * as store from './store.js';
import { saveFile } from './print.js';
import { sheetTutorial } from './tour.js';
import * as C from './crypto.js';
import { kv } from './kv.js';
import * as drive from './sync.js';
import { loadGIS, WORDS as DRIVE_WORDS } from './drive.js';

const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch { /* private mode */ } },
};
const KEY = { saved: 'gdex-backup-at', file: 'gdex-file-at', nudge: 'gdex-backup-nudge' };
const DAY = 864e5, STALE_DAYS = 14;
const arr = Array.isArray;

// Panels and the Settings summary listen here for changes that are not changes to the data (a backup saved, the file
// copy written). Returns an unsubscribe function.
const listeners = new Set();
export const onBackupChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
function changed() { paintButton(); listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

/* ------------------------------- what is in a file ------------------------------- */
const NAMES = {
  bookings: ['booking', 'bookings'], acts: ['act', 'acts'], people: ['person', 'people'], gear: ['backline item', 'backline items'],
  kits: ['stage pack', 'stage packs'], venues: ['venue', 'venues'], songs: ['song', 'songs'], setlists: ['setlist', 'setlists'],
  logs: ['take log', 'take logs'], shifts: ['clock entry', 'clock entries'], insurance: ['policy', 'policies'],
};
const isRecord = x => x && typeof x === 'object' && x.id;
export const countsOf = data => Object.fromEntries(store.COLLECTIONS.map(c => [c, arr(data && data[c]) ? data[c].filter(isRecord).length : 0]));
const totalOf = counts => Object.values(counts).reduce((a, b) => a + b, 0);
export const countText = counts => store.COLLECTIONS.filter(c => counts[c]).map(c => `${counts[c]} ${(NAMES[c] || [c, c])[counts[c] === 1 ? 0 : 1]}`).join(' · ') || 'nothing yet';
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// A Vdex file (the videographer app) has crew and no acts or songs. It is refused rather than read as an empty Gdex.
export const isVdex = d => !!d && typeof d === 'object' && d.app !== 'gdex' && (d.vdex === 'encrypted-backup' || d.app === 'vdex' || arr(d.crew)
  || (arr(d.logs) && arr(d.shifts) && !arr(d.acts)) || (!d.app && (arr(d.bookings) || arr(d.gear)) && !arr(d.songs) && !arr(d.acts)));
export const isGdex = d => !!d && typeof d === 'object' && !arr(d) && (d.app === 'gdex' || (arr(d.songs) && arr(d.bookings)));
const isLocked = d => !!d && typeof d === 'object' && d.gdex === 'encrypted-backup';

/* ------------------------------- how recent ------------------------------- */
// Whole calendar days between then and today (0 = today).
const daysSince = t => { const a = new Date(t), b = new Date(); return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / DAY); };
export function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${plural(Math.round(s / 60), 'minute')} ago`;
  const d = daysSince(t);
  if (d <= 0) return 'today at ' + new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d === 1) return 'yesterday';
  if (d < 60) return `${d} days ago`;
  return 'on ' + new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
// Records of the person's own (the sample does not need saving).
const ownRecords = () => store.COLLECTIONS.reduce((n, c) => n + store.db[c].filter(r => !r.sample).length, 0);
const lastSaved = () => Number(ls.get(KEY.saved)) || 0;
const lastFiled = () => Number(ls.get(KEY.file)) || 0;

// { level: 'ok' | 'old' | 'none' | 'empty', at, days, when, via, text, copyFailed }. Google Drive counts as a backup
// (its last good sync, and the last daily copy); today's daily copy failing makes a good level warn (copyFailed).
export function health() {
  const d = drive.driveState();
  const copies = [[lastSaved(), 'backup file'], [lastFiled(), 'copy in a file'], [d.at, 'Google Drive'], [d.backupAt, 'Google Drive']].filter(([t]) => t > 0).sort((a, b) => b[0] - a[0]);
  const own = ownRecords();
  if (!copies.length) {
    const sample = store.COLLECTIONS.some(c => store.db[c].length);
    return { level: own ? 'none' : 'empty', at: 0, days: Infinity, when: '', via: '', text: own ? 'No backup yet: everything is only on this device.' : sample ? 'Only the sample is here so far: nothing of yours to back up yet.' : 'Nothing to back up yet.' };
  }
  const [at, via] = copies[0], days = daysSince(at), when = ago(at);
  const old = days >= STALE_DAYS && own > 0;
  if (!old && d.linked && d.backupError) return { level: 'old', at, days, when, via, copyFailed: true, text: `Last backup ${when} (${via}), but today’s daily copy in Google Drive wasn’t saved.` };
  return { level: old ? 'old' : 'ok', at, days, when, via, text: old ? `Your last backup was ${when} (${via}). Save a new one.` : `Last backup ${when} (${via}).` };
}

// A reminder now and then: at most once every 14 days, when there are bookings of the person's own (older than a day)
// and nothing has been backed up, copied to a file or synced to Google Drive in the last 14 days. Returns true when it
// reminded.
export function nudgeIfStale() {
  const own = store.db.bookings.filter(b => !b.sample);
  if (!own.length) return false;
  const hl = health();
  if (hl.level === 'ok' || hl.copyFailed) return false; // a daily copy that failed shows in the panel; it is not stale
  if (Date.now() - (Number(ls.get(KEY.nudge)) || 0) < STALE_DAYS * DAY) return false;
  const first = Math.min(...own.map(b => Number(b.createdAt) || Date.now()));
  if (Date.now() - first < DAY) return false; // a first day's work: no reminder yet
  ls.set(KEY.nudge, Date.now());
  toast(hl.level === 'old' ? `Your last backup was ${hl.days} days ago. Tap ☁ at the top to save a new one.` : 'Your bookings are only on this device. Tap ☁ at the top to save a backup.');
  return true;
}

/* ------------------------------- saving a backup ------------------------------- */
const fileDate = () => todayISO();
async function save(text, name) {
  let ok = false;
  try { ok = await saveFile(text, name, 'application/json'); } catch (e) { toast('The backup could not be saved: ' + (e.message || e)); return false; }
  if (!ok) return false;
  ls.set(KEY.saved, Date.now());
  toast('Backup saved: ' + name);
  announce('Backup saved');
  changed();
  return true;
}
// Everything in one file: gdex-backup-YYYY-MM-DD.json.
export const exportBackup = () => save(store.exportJSON(), `gdex-backup-${fileDate()}.json`);

// The same, locked with a passphrase (AES-GCM, the key made from the passphrase with PBKDF2).
const canLock = () => !!(window.crypto && crypto.subtle && window.isSecureContext !== false);
const NO_LOCK = 'Locked backups need a secure connection (an https address). Save a plain backup instead, or open Gdex at its https address.';
export async function exportLocked() {
  if (!canLock()) { toast(NO_LOCK); return false; }
  const pass = await askPassphrase({
    title: 'Save with a passphrase', confirm: true, submit: 'Save the backup',
    intro: 'The backup file is locked: it opens only with this passphrase. Use one you will remember; a forgotten passphrase can’t be recovered, by anyone.',
    check: p => (p.length >= 8 ? true : 'Use at least 8 characters.'),
  });
  if (!pass) return false;
  const salt = C.bytes(16), iter = C.PBKDF2_ITERATIONS;
  let box;
  try { box = await C.encrypt(await C.pbkdf2Key(pass, salt, iter), store.exportJSON()); } catch (e) { toast('The backup could not be locked: ' + (e.message || e)); return false; }
  const text = JSON.stringify({ gdex: 'encrypted-backup', v: 1, exported: new Date().toISOString(), kdf: { salt: C.toB64(salt), iter }, iv: box.iv, ct: box.ct });
  return save(text, `gdex-backup-${fileDate()}.locked.json`);
}

// A sheet asking for a passphrase. check(pass) returns true, or a message to show (the sheet stays open). Resolves to
// the passphrase, or null when closed.
function askPassphrase({ title, intro, confirm = false, submit = 'OK', check = () => true }) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const box = (id, label, auto) => { const input = h('input', { type: 'password', id, autocomplete: auto, autocapitalize: 'off', required: true }); input.spellcheck = false; return [input, h('div', { class: 'field' }, h('label', { for: id }, label), input)]; };
    const [p1, f1] = box('se-pass-1', 'Passphrase', confirm ? 'new-password' : 'current-password');
    const [p2, f2] = confirm ? box('se-pass-2', 'Type it again', 'new-password') : [null, null];
    const err = h('p', { class: 'warn small', role: 'alert', hidden: true });
    const busy = h('button', { type: 'submit', class: 'btn primary' }, submit);
    const show = h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: e => { const t = e.target.checked ? 'text' : 'password'; p1.type = t; if (p2) p2.type = t; } }), h('span', null, 'Show what I type'));
    const form = h('form', { class: 'stack se-pass', novalidate: true, onsubmit: async e => {
      e.preventDefault();
      const say = m => { err.textContent = m; err.hidden = false; };
      if (!p1.value) return say('Type the passphrase first.');
      if (p2 && p1.value !== p2.value) return say('The two don’t match. Type them again.');
      busy.disabled = true; busy.textContent = 'One moment…';
      let r; try { r = await check(p1.value); } catch (x) { r = x.message || 'That didn’t work.'; }
      busy.disabled = false; busy.textContent = submit;
      if (r !== true) { say(typeof r === 'string' ? r : 'That didn’t work.'); p1.focus(); p1.select(); return; }
      finish(p1.value); s.close();
    } }, intro && h('p', { class: 'small muted' }, intro), f1, f2, show, err,
    h('div', { class: 'form-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn ghost', onclick: () => s.close() }, 'Cancel'), busy));
    const s = sheet(title, form, { onClose: () => finish(null), dismissOnBackdrop: false });
    setTimeout(() => { if (!form.contains(document.activeElement)) p1.focus(); }, 50); // never from a box already typed in
  });
}

/* ------------------------------- bringing one back ------------------------------- */
// A message in a sheet: the file someone picked can't be used, and why.
function refuse(msg) {
  announce(msg);
  const s = sheet('That file can’t be used', h('div', { class: 'stack se-refuse' },
    h('p', { class: 'warn' }, msg),
    h('p', { class: 'small muted' }, 'Nothing on this device was changed.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => s.close() }, 'OK'))));
  return Promise.resolve(null);
}

async function unlock(box) {
  if (!canLock()) return refuse(NO_LOCK.replace('Save a plain backup instead, or open', 'Open'));
  const iter = Number(box.kdf && box.kdf.iter);
  if (!box.kdf || !box.kdf.salt || !box.iv || !box.ct || !(iter >= 1000 && iter <= 5e6)) return refuse('That locked backup is damaged and can’t be opened.');
  let out = null;
  const pass = await askPassphrase({
    title: 'Locked backup', submit: 'Open it',
    intro: 'This backup was saved with a passphrase. Type it to open the file.',
    check: async p => {
      try { out = JSON.parse(await C.decryptText(await C.pbkdf2Key(p, C.fromB64(box.kdf.salt), iter), box)); return true; }
      catch { return 'That passphrase doesn’t open this file. Check it and try again.'; }
    },
  });
  return pass ? out : null;
}

// Read a backup file someone picked, check it is Gdex's, and ask: merge it into this device, or replace this
// device's data with it. Resolves to 'merge', 'replace', or null (refused or cancelled).
export async function importBackup(file) {
  if (!file) return null;
  let data;
  try { data = JSON.parse(await file.text()); } catch { return refuse('That file couldn’t be read as a backup. Pick a file Gdex saved: its name starts with gdex-backup and ends in .json.'); }
  if (isLocked(data)) { data = await unlock(data); if (!data) return null; }
  if (isVdex(data)) return refuse('This is a Vdex backup, not a Gdex one. Vdex and Gdex keep separate data: open this file in Vdex instead.');
  if (!isGdex(data)) return refuse('That file is not a Gdex backup. Pick a file Gdex saved: its name starts with gdex-backup and ends in .json.');
  return chooseHow(data, file.name || 'backup', { drive: drive.driveState().linked });
}

// Every record's id and time, to say what a merge did.
const snapshot = () => { const m = new Map(); for (const c of store.COLLECTIONS) for (const r of store.db[c]) m.set(c + ':' + r.id, Number(r.updatedAt) || 0); return m; };
// revive: the records deleted here since that file or copy come back too (store.mergeIn). what: 'backup' or 'copy'.
function merge(data, { revive = false, what = 'backup' } = {}) {
  const before = snapshot(), dead = store.deletedSince(data).length;
  const back = store.mergeIn(data, { revive });
  const after = snapshot();
  let added = -back, updated = 0, removed = 0;
  for (const [k, t] of after) { if (!before.has(k)) added++; else if (before.get(k) !== t) updated++; }
  for (const k of before.keys()) if (!after.has(k)) removed++;
  const msg = back || added || updated || removed ? `Merged: ${back ? `${back} brought back (deleted here since that ${what}), ` : ''}${added} new, ${updated} updated${removed ? `, ${removed} removed (deleted on the other device)` : ''}.`
    : dead ? `Merged. Nothing changed: the ${plural(dead, 'record')} in that ${what} deleted on this device since ${dead === 1 ? 'stays' : 'stay'} deleted.`
      : `Merged. Nothing new in that ${what}: this device already had all of it.`;
  toast(msg); announce(msg);
}
// A record's name, to say which ones were deleted here since a backup.
const nameOf = (c, r) => String(r.title || r.name || r.type || r.date || (NAMES[c] || [c])[0]).trim() || (NAMES[c] || [c])[0];

// The chooser for a backup file and for a daily copy from Google Drive (copy: true). With Drive linked (drive: true),
// Replace reaches every connected device: the restored records are stamped now and everything the backup lacks gets a
// tombstone (store.replaceAll everywhere), so the next syncs follow it instead of bringing the old ones back.
function chooseHow(data, name, { drive: linked = false, copy = false } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const inFile = countsOf(data), here = countsOf(store.db);
    const nFile = totalOf(inFile), nHere = totalOf(here);
    const at = Number(data.updatedAt) || 0;
    const what = copy ? 'copy' : 'backup', where = copy ? 'in the copy' : 'in the file';
    // Records the file holds that were deleted on this device since: a merge leaves them out unless asked. A daily copy
    // is there to undo a mistake, so it asks by default; a backup file's deletions stay unless ticked.
    const dead = store.deletedSince(data);
    const names = dead.slice(0, 3).map(x => `“${nameOf(x.c, x.r)}”`).join(', ') + (dead.length > 3 ? ` and ${dead.length - 3} more` : '');
    const revive = dead.length ? h('input', { type: 'checkbox', checked: copy }) : null;
    const go = how => {
      if (!store.canChange()) return; // bringing a backup back is a change: the chooser stays open and the licence's sheet explains
      if (how === 'replace' && !confirm(linked
        ? `Replace everything on this device, and on every device connected to this Google Drive, with this ${what}? The ${plural(nHere, 'record')} here now are replaced by the ${plural(nFile, 'record')} ${where}. This can’t be undone.`
        : `Replace everything on this device with this ${what}? The ${plural(nHere, 'record')} here now are replaced by the ${plural(nFile, 'record')} ${where}. This can’t be undone.`)) return;
      finish(how); s.close();
      if (how === 'replace') {
        store.replaceAll(data, { everywhere: linked });
        const msg = `${copy ? 'Daily copy' : 'Backup'} brought back: ${plural(nFile, 'record')}.${linked ? ' Every device connected to this Google Drive follows at its next sync.' : ''}`;
        toast(msg); announce(msg);
      } else merge(data, { revive: !!(revive && revive.checked), what });
    };
    const reviveLine = revive && h('label', { class: 'check se-imp-revive' }, revive,
      h('span', { class: 'small' }, `Also bring back the ${plural(dead.length, 'record')} deleted on this device since this ${what}: ${names}.`));
    const body = h('div', { class: 'stack se-imp' },
      h('div', { class: 'card se-imp-file' },
        h('strong', { class: 'se-imp-name' }, name),
        at > 0 && h('div', { class: 'small muted' }, 'Up to date as of ' + new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })),
        h('p', { class: 'small se-imp-counts' }, h('b', null, copy ? 'In the copy: ' : 'In the file: '), countText(inFile)),
        h('p', { class: 'small muted' }, h('b', null, 'On this device now: '), countText(here))),
      nHere
        ? [reviveLine,
          h('button', { type: 'button', class: 'btn primary se-imp-merge', onclick: () => go('merge') }, 'Merge into this device'),
          h('p', { class: 'small muted' }, `Keeps everything here and adds what the ${what} has that this device lacks${dead.length ? ' (what was deleted here since, only when ticked above)' : ''}. Where a record is in both, the one changed last wins. Nothing here is lost.`),
          h('button', { type: 'button', class: 'btn danger se-imp-replace', onclick: () => go('replace') }, 'Replace this device’s data'),
          h('p', { class: 'small muted se-imp-replace-note' }, linked
            ? `Every device connected to this Google Drive ends up exactly like this ${what}, and anything added since is gone from all of them. Save a backup of this device first if you might want it back.`
            : `This device ends up exactly like the ${copy ? 'copy' : 'file'}, and anything added here since that ${what} is gone. Save a backup of this device first if you might want it back.`)]
        : [reviveLine,
          h('button', { type: 'button', class: 'btn primary se-imp-merge', onclick: () => go('merge') }, 'Bring it in'),
          h('p', { class: 'small muted' }, dead.length ? `This device has nothing of its own now, so everything ${where} comes in as it is (what was deleted here since, only when ticked above).` : `This device has nothing of its own yet, so everything ${where} comes in as it is.`)],
      h('button', { type: 'button', class: 'btn ghost', onclick: () => s.close() }, 'Cancel'));
    const s = sheet('Bring back a backup', body, { onClose: () => finish(null) });
  });
}

/* ------------------------------- a copy kept in a file ------------------------------- */
// Chrome and Edge on a computer can keep writing to a file the person picked (the File System Access API). Picked
// inside a folder that Dropbox, Google Drive, OneDrive or iCloud Drive syncs, that file is an always-current backup in
// their cloud. The file's handle is kept in IndexedDB ('gdex', store 'kv') so it is linked again on the next visit;
// the browser then asks for permission again on a tap.
export const fileSupported = () => typeof window.showSaveFilePicker === 'function';
const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || matchMedia('(pointer: coarse)').matches;
const FILE = { handle: null, status: 'off', error: '', remembered: true, fails: 0 }; // status: off | saved | saving | needs-permission | error
export const fileState = () => ({ supported: fileSupported(), linked: !!FILE.handle, name: FILE.handle ? FILE.handle.name : '', status: FILE.handle ? FILE.status : 'off', error: FILE.error, at: lastFiled(), remembered: FILE.remembered });
const setStatus = (status, error = '') => { FILE.status = status; FILE.error = error; changed(); };

async function permitted(handle, ask) {
  if (!handle || typeof handle.queryPermission !== 'function') return !!handle;
  const o = { mode: 'readwrite' };
  try { if ((await handle.queryPermission(o)) === 'granted') return true; return ask ? (await handle.requestPermission(o)) === 'granted' : false; }
  catch { return false; }
}

let timer = 0, writing = false, again = false;
const schedule = (ms = 1500) => { clearTimeout(timer); timer = setTimeout(writeNow, ms); };
// Write the whole database to the file now. Resolves true when the copy is saved.
async function writeNow() {
  clearTimeout(timer); timer = 0;
  const handle = FILE.handle;
  if (!handle) return false;
  if (writing) { again = true; return false; }
  writing = true;
  try {
    if (!(await permitted(handle, false))) { if (FILE.handle === handle) setStatus('needs-permission'); return false; }
    setStatus('saving');
    const w = await handle.createWritable();
    try { await w.write(store.exportJSON()); await w.close(); } catch (e) { try { await w.abort(); } catch { /* already closed */ } throw e; }
    if (FILE.handle !== handle) return false; // stopped while it was writing
    ls.set(KEY.file, Date.now()); FILE.fails = 0;
    setStatus('saved');
    return true;
  } catch (e) {
    if (FILE.handle !== handle) return false;
    if (e && e.name === 'NotAllowedError') { setStatus('needs-permission'); return false; }
    FILE.fails++;
    setStatus('error', e && e.name === 'NotFoundError' ? 'the file was moved or deleted. Choose it again, or another one.' : `${(e && e.message) || 'the file could not be written'}.`);
    if (FILE.fails < 4) schedule(20000 * FILE.fails); // a sync app holding the file for a moment: try again shortly
    return false;
  } finally {
    writing = false;
    if (again) { again = false; schedule(300); }
  }
}

// Every change is copied a moment later (a burst of changes is written once); a redraw that changed nothing is not.
// Leaving the app writes at once.
let seenRev = store.revision();
store.subscribe(() => { const r = store.revision(); if (r === seenRev) return; seenRev = r; if (FILE.handle) schedule(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && FILE.handle && timer) writeNow(); });

// Pick a file and start keeping a copy in it. Resolves true when the first copy is written.
export async function linkFile() {
  if (!fileSupported()) { toast(isPhone() ? 'Phones can’t keep writing to a file. Save a backup now and then instead.' : 'This needs Chrome or Edge on a computer.'); return false; }
  let handle;
  try { handle = await window.showSaveFilePicker({ suggestedName: 'gdex-db.json', types: [{ description: 'Gdex database', accept: { 'application/json': ['.json'] } }] }); }
  catch (e) { if (e && e.name !== 'AbortError') toast('No file was chosen: ' + (e.message || e.name)); return false; }
  clearTimeout(timer);
  FILE.handle = handle; FILE.fails = 0; FILE.error = '';
  try { await kv('readwrite', s => s.put(handle, 'fileHandle')); FILE.remembered = true; } catch { FILE.remembered = false; }
  const ok = await writeNow();
  if (ok) toast(`Gdex keeps a copy in ${handle.name}`);
  return ok;
}
// The browser asks again for permission to write (after a restart): only from a tap.
export async function allowFile() {
  if (!FILE.handle) return false;
  if (!(await permitted(FILE.handle, true))) { setStatus('needs-permission'); toast('Gdex can’t keep the copy up to date without your OK.'); return false; }
  return writeNow();
}
export const saveFileNow = () => writeNow();
// Stop keeping the copy. The file stays where it is, as it was last written.
export async function unlinkFile() {
  clearTimeout(timer); timer = 0;
  const had = !!FILE.handle;
  FILE.handle = null; FILE.status = 'off'; FILE.error = ''; FILE.fails = 0;
  try { await kv('readwrite', s => s.delete('fileHandle')); } catch { /* nothing kept */ }
  changed();
  return had;
}
// Erase this device (Settings) calls this first, so nothing linked is written over by the empty database: Google Drive
// is disconnected (its copy stays as it is), then the copy in a file is let go.
export async function beforeErase() { await drive.disconnectDrive(); await unlinkFile(); }
// Erase this device (Settings) asks this before it erases anything: with Google Drive linked, a last sync from the tap
// (signing in again when Google's hour is up; on the desktop the browser's sign-in), so what was changed here reaches
// Drive first. Resolves null when Drive holds everything this device has (or Drive is not linked); otherwise
// { status, text }: what Drive lacks and why, in words.
export async function driveBehind() {
  let d = drive.driveState();
  if (!d.linked) return null;
  try { d = await drive.syncNow({ ask: true }); } catch { d = drive.driveState(); }
  if (!d.linked || d.status === 'synced' || !((Number(store.db.updatedAt) || 0) > d.at)) return null;
  const since = !d.at ? 'it was connected' : isToday(d.at) ? clock(d.at) : `${new Date(d.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${clock(d.at)}`;
  const why = d.status === 'needs-permission' ? 'Google Drive needs you to sign in again.' : isSentence(d.error || '') ? d.error : `Couldn’t reach Google Drive: ${d.error || 'something went wrong'}.`;
  return { status: d.status, text: `⚠ What you changed on this device since ${since} isn’t in your Google Drive yet. ${why} Erase now and those changes are lost: ${d.status === 'needs-permission' ? 'sign in again' : 'try again'} first, or save a backup.` };
}
// Settings → Backups' closed line (moved here from js/pages/settings.js so Drive can add to it).
export function backupLine() {
  const hl = health(), f = fileState(), d = drive.driveState();
  const bits = [hl.level === 'ok' || hl.copyFailed ? `Last backup ${hl.when}` : hl.level === 'old' ? `⚠ Last backup ${hl.when}` : hl.level === 'none' ? '⚠ No backup yet' : 'Nothing to back up yet'];
  if (d.linked) bits.push({ synced: `Google Drive: synced ${d.at ? ago(d.at) : 'just now'}`, saving: 'Google Drive: saving…', 'needs-permission': '⚠ Google Drive needs you to sign in again', error: '⚠ Google Drive: not synced' }[d.status] || 'Google Drive: connected');
  if (d.linked && d.backupError) bits.push('⚠ today’s daily copy wasn’t saved');
  if (f.linked) bits.push(f.status === 'needs-permission' ? '⚠ the file copy needs your OK' : f.status === 'error' ? '⚠ the file copy wasn’t saved' : `copy in ${f.name}`);
  return bits.join(' · ');
}

// On load: link the file kept from last time, and catch up with changes made since it was last written.
async function initFile() {
  if (!fileSupported() || !('indexedDB' in window)) return;
  let handle = null;
  try { handle = await kv('readonly', s => s.get('fileHandle')); } catch { return; }
  if (!handle || FILE.handle) return;
  FILE.handle = handle;
  if (await permitted(handle, false)) { if ((Number(store.db.updatedAt) || 0) > lastFiled()) await writeNow(); else setStatus('saved'); }
  else setStatus('needs-permission');
}

// The ☁ button at the top says how Google Drive and the copy in a file are doing, the worse of the two first (it says
// Backup when neither is on). [state, label, spoken, how bad]
const FILE_LOOK = { saved: ['synced', 'Saved', 'copy in a file is up to date', 1], saving: ['saving', 'Saving…', 'saving the copy in a file', 2], 'needs-permission': ['needs-permission', 'Allow', 'the copy in a file needs your OK', 3], error: ['error', 'Not saved', 'the copy in a file could not be saved', 4] };
const DRIVE_LOOK = { synced: ['synced', 'Synced', 'Google Drive is up to date', 1], saving: ['saving', 'Saving…', 'saving to Google Drive', 2], 'needs-permission': ['needs-permission', 'Sign in', 'Google Drive needs you to sign in again', 3], error: ['error', 'Not synced', 'Google Drive is not synced', 4] };
function paintButton() {
  const btn = document.getElementById('cloudBtn');
  if (!btn) return;
  const label = document.getElementById('cloudLabel');
  const d = drive.driveState();
  const looks = [d.linked && DRIVE_LOOK[d.status], FILE.handle && FILE_LOOK[FILE.status]].filter(Boolean);
  const [state, text] = looks.reduce((w, x) => (!w || x[3] > w[3] ? x : w), null) || ['', 'Backup'];
  if (state) btn.dataset.state = state; else delete btn.dataset.state;
  if (label) label.textContent = text;
  btn.setAttribute('aria-label', 'Backups' + (looks.length ? ': ' + looks.map(x => x[2]).join('; ') : ''));
}

/* ------------------------------- Google Drive ------------------------------- */
// A failure in words: a whole sentence is said as it is, a short reason after "Couldn’t reach Google Drive:".
const isSentence = e => /[.!?]$/.test(e);
const driveProblem = e => (isSentence(e) ? e : `Couldn’t reach Google Drive: ${e}.`) + ' Your changes are safe on this device.';
const notCopied = e => (isSentence(e) ? e : `Not copied yet: ${e}.`) + ' Your changes are safe on this device.';
const copyFailed = e => (isSentence(e) ? `⚠ Today’s copy wasn’t saved. ${e}` : `⚠ Today’s copy wasn’t saved: ${e}.`);
const clock = t => fmtTime(new Date(t));
const isToday = t => !!t && new Date(t).toDateString() === new Date().toDateString();
const savedWhen = t => (t ? `saved ${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${clock(t)}` : 'saved at a time Drive didn’t say');

// After a tap: say what really happened (only "up to date" when the copy really was made).
async function driveRun(fn, done) {
  try {
    const st = await fn();
    if (!st || !st.linked) return;
    if (st.status === 'synced') toast(done);
    else if (st.status === 'needs-permission') toast(DRIVE_WORDS.again);
    else if (st.error) toast(notCopied(st.error));
  } catch (e) { if (e.name !== 'AbortError') toast(e.message); }
}

// Connect: what Drive does, in a sheet, then Google's sign-in from the tap on Continue. Google's script is loaded when
// this sheet opens, so its window can open straight from that tap (browsers block one that opens later). The desktop
// app loads nothing here: its sign-in opens in the web browser.
function openConnectSheet(panel = null) {
  const d = drive.driveState();
  if (d.away) { toast(DRIVE_WORDS.away); return; }
  const desktop = d.desktop;
  const go = h('button', { type: 'button', class: 'btn primary se-bk-drive-go', disabled: !desktop }, 'Continue with Google');
  const note = h('p', { class: 'small muted se-bk-drive-load', role: 'status', hidden: desktop }, desktop ? '' : 'Loading Google’s sign-in…');
  const err = h('p', { class: 'warn small se-bk-drive-err', role: 'alert', hidden: true });
  const retry = h('button', { type: 'button', class: 'btn ghost se-bk-drive-retry', hidden: true }, 'Try again');
  // While it loads a quiet line says so; failing, the warning box says why (as a sign-in that did not finish does).
  const load = () => {
    retry.hidden = true; err.hidden = true; note.hidden = false; note.textContent = 'Loading Google’s sign-in…'; go.disabled = true;
    const done = () => { note.hidden = true; note.textContent = ''; };
    loadGIS().then(() => { done(); go.disabled = false; }, e => { done(); err.textContent = e.message || DRIVE_WORDS.noLoad; err.hidden = false; retry.hidden = false; });
  };
  retry.onclick = load;
  go.onclick = async () => {
    go.disabled = true; err.hidden = true;
    try { await drive.connectDrive(); s.close(); toast('Connected to Google Drive. Up to date.'); announce('Connected to Google Drive'); }
    catch (e) { if (e.name !== 'AbortError') { err.textContent = e.message; err.hidden = false; } go.disabled = false; }
  };
  const body = h('div', { class: 'stack se-bk-connect' },
    h('p', null, 'Gdex keeps one copy of everything in a hidden folder of your Google Drive that only Gdex can open, and a dated copy each day you use it (the last 7 days and the last 12 months). Every phone or computer you connect with the same Google account shares the same Gdex. Google asks you to sign in again about once an hour while you use Gdex: one tap. Nothing goes to a Gdex server.'),
    desktop && h('p', null, 'Google’s sign-in opens in your web browser; come back to Gdex when it says so.'),
    note, err,
    h('div', { class: 'actions se-bk-connect-actions' }, go, retry, h('button', { type: 'button', class: 'btn ghost', onclick: () => s.close() }, 'Not now')));
  const s = sheet('Connect Google Drive', body, { onClose: backToCard(panel, '.se-bk-drive-connect') });
  if (!desktop) load();
}

// The daily copies in Drive, newest first; one tap opens the same chooser as a backup file (merge, or replace on
// every connected device).
async function openDailyCopies(panel = null) {
  const box = h('div', { class: 'stack se-bk-copies' }, h('p', { class: 'small muted', role: 'status' }, 'Looking for the daily copies in your Google Drive…'));
  const s = sheet('Bring back a daily copy', box, { onClose: backToCard(panel, '.se-bk-drive-restore') });
  const done = h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => s.close() }, 'Close'));
  let copies;
  try { copies = await drive.listDailyCopies({ ask: true }); }
  catch (e) {
    if (e.name === 'AbortError') { s.close(); return; }
    box.replaceChildren(...nodes(h('p', { class: 'warn small', role: 'alert' }, e.name === 'NotAllowedError' ? 'Google Drive wants you to sign in again before the daily copies can be listed: tap Sign in again, then try once more.' : e.message), done));
    return;
  }
  const pick = async (c, btn) => {
    btn.disabled = true;
    let data;
    try { data = await drive.readDailyCopy(c.name); } catch (e) { btn.disabled = false; toast(e.message); return; }
    s.close();
    chooseHow(data, `${c.label} · ${savedWhen(c.at)}`, { drive: drive.driveState().linked, copy: true });
  };
  box.replaceChildren(...nodes(
    copies.length
      ? h('div', { class: 'list se-bk-copy-list' }, ...copies.map(c => { const b = h('button', { type: 'button', class: 'card tap se-bk-copy', onclick: () => pick(c, b) }, h('strong', null, c.label), h('span', { class: 'small muted' }, ` · ${savedWhen(c.at)}`)); return b; }))
      : h('p', { class: 'small muted' }, 'No daily copies yet. Gdex saves one the first time it syncs each day.'),
    h('p', { class: 'small muted' }, 'Gdex keeps a copy for each day of the last week and one for each of the last 12 months, so a mistake can be undone for about a week, or a month.'),
    done));
}

async function deleteDriveCopy() {
  if (!confirm('Delete Gdex’s copy and every daily copy from your Google Drive? This device keeps its own data. Other devices still connected will put their copy back the next time they sync: disconnect them first.')) return;
  try { await drive.deleteDriveCopy(); toast('Gdex’s copy was deleted from your Google Drive, and Drive is disconnected here. Everything is still on this device.'); }
  catch (e) { if (e.name !== 'AbortError') toast(e.message); }
}

function driveCard() {
  const d = drive.driveState();
  const card = (state, ...kids) => h('div', { class: 'card stack se-bk-drive', 'data-state': state }, ...kids);
  const title = h('strong', null, '☁ Google Drive');
  if (!d.linked && !d.configured) return card('unset', title, h('p', { class: 'small muted' }, 'Not set up yet: Google Drive will work here once Gdex’s Google sign-in is switched on.'));
  if (!d.linked && d.away) return card('away', title, h('p', { class: 'small muted' }, DRIVE_WORDS.away));
  if (!d.linked) {
    return card('off', title,
      h('p', { class: 'small muted' }, 'Keep Gdex the same on your phone and computer, with a dated copy each day, in a private Gdex folder of your own Google Drive. Free. Only Gdex can open that folder.'),
      h('button', { type: 'button', class: 'btn primary se-bk-drive-connect', onclick: e => openConnectSheet(e.currentTarget.closest('.se-bk')) }, 'Connect Google Drive…'));
  }
  const needs = d.status === 'needs-permission';
  const line = {
    synced: `✅ Up to date (${d.at ? ago(d.at) : 'just now'})`,
    saving: 'Saving…',
    'needs-permission': '⚠ Needs you to sign in again',
    error: '⚠ ' + driveProblem(d.error || 'something went wrong'),
  }[d.status] || 'Checking Google Drive…';
  const copy = d.backupError ? copyFailed(d.backupError)
    : isToday(d.backupAt) ? `Today’s copy: saved at ${clock(d.backupAt)}`
    : d.backupAt ? `Today’s copy: not saved yet (the last one was ${ago(d.backupAt)})` : 'Today’s copy: not saved yet';
  return card(d.status || 'off',
    h('div', { class: 'se-bk-drive-head' }, h('strong', null, '☁ Connected to Google Drive'), d.who && h('span', { class: 'small muted se-bk-drive-who' }, 'Signed in as ' + d.who)),
    h('p', { class: 'small se-bk-drive-line', 'data-state': d.status }, line),
    h('p', { class: 'small se-bk-drive-copy', 'data-state': d.backupError ? 'error' : 'ok' }, copy),
    h('div', { class: 'actions se-bk-drive-actions' },
      needs && h('button', { type: 'button', class: 'btn primary se-bk-drive-again', onclick: () => driveRun(() => drive.syncNow({ ask: true }), 'Signed in again. Up to date.') }, 'Sign in again'),
      h('button', { type: 'button', class: `btn ${needs ? 'ghost' : 'primary'} se-bk-drive-sync`, onclick: () => driveRun(() => drive.syncNow({ ask: true }), 'Google Drive is up to date.') }, 'Sync now'),
      h('button', { type: 'button', class: 'btn ghost se-bk-drive-restore', onclick: e => openDailyCopies(e.currentTarget.closest('.se-bk')) }, 'Bring back a daily copy…'),
      h('button', { type: 'button', class: 'btn ghost se-bk-drive-off', onclick: async () => { if (await drive.disconnectDrive()) toast('Google Drive is disconnected on this device. Both copies stay.'); } }, 'Disconnect')),
    h('p', { class: 'small muted' }, 'Disconnect stops syncing on this device. Both copies stay: this device’s and the one in your Drive. To take Gdex’s access away completely, remove Gdex in your Google Account under third-party connections.'),
    h('button', { type: 'button', class: 'btn ghost small se-bk-drive-delete', onclick: () => deleteDriveCopy() }, 'Delete Gdex’s copy from Google Drive…'));
}

/* ------------------------------- the panel ------------------------------- */
// Redraw a box and give the focus back to the same control (by its label), so a tap does not lose the place. When the
// tap made that control go (Disconnect, Sign in again, Stop), the focus goes to the first button of the same card.
const keyOf = el => (el && (el.getAttribute('aria-label') || el.textContent || '').trim()) || '';
const CARDS = ['.se-bk-drive', '.se-bk-file'];
function redraw(box, kids) {
  const a = document.activeElement, k = a && box.contains(a) ? keyOf(a) : '';
  const card = k ? CARDS.find(c => a.closest(c)) : '';
  box.replaceChildren(...nodes(kids));
  if (k) {
    const again = [...box.querySelectorAll('button, a[href], input, select, textarea')].find(x => keyOf(x) === k) || (card && box.querySelector(`${card} button`));
    if (again) again.focus({ preventScroll: true });
  }
}
// A sheet opened from the Drive card gives the focus back to it when it closes, even when the card was redrawn
// meanwhile (connected, or a sign-in undone): to the control that opened it, or the card's first button.
const backToCard = (panel, sel) => () => {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;
  const card = panel && panel.isConnected ? panel.querySelector('.se-bk-drive') : null;
  const b = card && (card.querySelector(sel) || card.querySelector('button'));
  if (b) b.focus({ preventScroll: true });
};

function statusLine() {
  const hl = health();
  return h('p', { class: 'se-bk-status small', 'data-level': hl.level }, (hl.level === 'ok' ? '✅ ' : hl.level === 'empty' ? '' : '⚠ ') + hl.text);
}

function fileCard() {
  const f = fileState();
  const title = h('strong', null, '🗂️ Keep a copy in a file');
  if (!f.supported) {
    return h('div', { class: 'card stack se-bk-file', 'data-state': 'unsupported' }, title,
      h('p', { class: 'small muted' }, isPhone()
        ? 'Phones and tablets can’t let an app keep writing to a file. Save a backup now and then instead, and keep it in your cloud drive (Files, Google Drive, Dropbox…) or email it to yourself.'
        : 'This needs Chrome or Edge on a computer. In this browser, save a backup now and then instead.'));
  }
  if (!f.linked) {
    return h('div', { class: 'card stack se-bk-file', 'data-state': 'off' }, title,
      h('p', { class: 'small muted' }, 'Pick a file inside a folder that Dropbox, Google Drive, OneDrive or iCloud Drive already syncs. Gdex writes everything to it a moment after each change, and your sync app keeps it safe in your cloud.'),
      h('button', { type: 'button', class: 'btn ghost se-bk-link', onclick: () => linkFile() }, 'Choose a file…'),
      h('p', { class: 'small muted' }, 'It is a copy, not a sync: to use it on another computer, bring it in there with Bring back a backup.'));
  }
  const lines = {
    saved: `✅ Copy kept in ${f.name}, saved ${f.at ? ago(f.at) : 'just now'}.`,
    saving: `Saving the copy in ${f.name}…`,
    'needs-permission': `⚠ Gdex needs your OK to keep writing to ${f.name}. Browsers ask again after a restart.`,
    error: `⚠ The copy in ${f.name} wasn’t saved: ${f.error || 'the file could not be written.'}`,
  };
  return h('div', { class: 'card stack se-bk-file', 'data-state': f.status }, title,
    h('p', { class: 'small se-bk-file-line', 'data-state': f.status }, lines[f.status] || lines.saved),
    !f.remembered && h('p', { class: 'small muted' }, 'This browser couldn’t remember the file for next time (a private window?): choose it again after a restart.'),
    h('div', { class: 'actions se-bk-file-actions' },
      f.status === 'needs-permission' && h('button', { type: 'button', class: 'btn primary', onclick: () => allowFile() }, 'Allow'),
      f.status === 'error' && h('button', { type: 'button', class: 'btn primary', onclick: () => writeNow() }, 'Try again'),
      f.status === 'error' && h('button', { type: 'button', class: 'btn ghost', onclick: () => linkFile() }, 'Choose another file…'),
      (f.status === 'saved' || f.status === 'saving') && h('button', { type: 'button', class: 'btn ghost', onclick: () => writeNow() }, 'Save now'),
      h('button', { type: 'button', class: 'btn ghost se-bk-unlink', onclick: async () => { if (await unlinkFile()) toast(`Stopped. ${f.name} stays where it is, as it was last saved.`); } }, 'Stop')));
}

// The backups panel: Settings → Backups and the ☁ sheet. It keeps itself up to date while it is on screen.
export function backupPanel() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, class: 'se-bk-input', tabIndex: -1, 'aria-hidden': 'true',
    onchange: async e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) await importBackup(f); } });
  const body = h('div', { class: 'stack' });
  const draw = () => redraw(body, [
    statusLine(),
    driveCard(),
    h('p', { class: 'small muted' }, 'Gdex keeps everything on this device unless you connect Google Drive. A backup file holds all of it: bookings, acts, people, songs, setlists, backline, venues, your details and money settings. Keep it in your cloud drive or email it to yourself; it also moves Gdex to a new phone or computer.'),
    h('div', { class: 'se-bk-actions' },
      h('button', { type: 'button', class: 'btn primary se-bk-save', onclick: () => exportBackup() }, '⤓ Save a backup'),
      h('button', { type: 'button', class: 'btn ghost se-bk-open', onclick: () => input.click() }, '📂 Bring back a backup…'),
      h('button', { type: 'button', class: 'btn ghost se-bk-lock', onclick: () => exportLocked() }, '🔐 Save with a passphrase…')),
    h('p', { class: 'small muted' }, 'A backup file can be read by anyone who has it: it holds your contacts and fees. Lock it with a passphrase if you keep it online.'),
    fileCard(),
  ]);
  draw();
  const el = h('div', { class: 'se-bk' }, body, input);
  // Listeners end once the panel is off screen (the page redrawn, the sheet closed).
  let offData = null, offMine = null;
  const check = () => { if (el.isConnected) { draw(); return; } offData && offData(); offMine && offMine(); };
  offMine = onBackupChange(check);
  offData = store.subscribe(() => queueMicrotask(check)); // after the page itself has redrawn
  return el;
}

// The ☁ sheet.
export function openBackupSheet() { sheet('Backups', backupPanel()); }

/* ------------------------------- walkthroughs ------------------------------- */
const STEPS = [
  { title: 'How safe your data is', text: 'When the last backup was made. Gdex keeps everything on this device unless you connect Google Drive, so a backup is your safety net if the phone is lost or the browser is cleared.', target: ['.se-bk-status'] },
  { title: 'Google Drive', text: 'Free for everyone: connect your own Google Drive and Gdex keeps your phone and computer the same, with a dated copy each day, in a private folder only Gdex can open.', target: ['.se-bk-drive'] },
  { title: 'Save a backup', text: 'One file with everything in it. Keep it in your cloud drive or email it to yourself. On a phone the share sheet lets you pick where it goes.', target: ['.se-bk-save'] },
  { title: 'Bring back a backup', text: 'Pick a backup file, then merge it into this device (nothing here is lost) or replace what is here. This is also how Gdex moves to a new phone or computer.', target: ['.se-bk-open'] },
  { title: 'With a passphrase', text: 'The same backup, locked: it opens only with the passphrase you choose. Good for a file you keep online.', target: ['.se-bk-lock'] },
  { title: 'Keep a copy in a file', text: 'On a computer with Chrome or Edge: pick a file in a folder that Dropbox, Google Drive, OneDrive or iCloud Drive syncs, and Gdex writes to it after every change.', target: ['.se-bk-file'] },
];
export const backupSteps = STEPS;
sheetTutorial('Backups', STEPS);
sheetTutorial('Bring back a backup', [
  { title: 'What is in the file', text: 'How many bookings, songs, people and so on the backup holds, next to what is on this device now.', target: ['.se-imp-file'] },
  { title: 'Merge', text: 'Keeps everything here and adds what the backup has that this device lacks. Where the same record is in both, the one changed last wins. Records deleted here since the backup stay deleted, unless you tick Also bring back (ticked for a daily copy).', target: ['.se-imp-merge'] },
  { title: 'Replace', text: 'Makes this device exactly like the file. Anything added here since the backup is lost, so Gdex asks first.', target: ['.se-imp-replace'] },
]);
sheetTutorial('Save with a passphrase', [
  { title: 'Your passphrase', text: 'At least 8 characters, typed twice. Gdex never keeps it: without it, nobody can open the file, not even you.', target: ['#se-pass-1'] },
]);
sheetTutorial('Connect Google Drive', [
  { title: 'What Drive does', text: 'One copy of everything in a hidden folder of your own Google Drive, shared by every phone or computer you connect, and a dated copy each day. Only Gdex can open that folder.', target: ['.se-bk-connect > p'] },
  { title: 'Continue with Google', text: 'Google asks you to sign in and allow Gdex its own folder. Nothing else in your Drive is touched.', target: ['.se-bk-drive-go'] },
]);
sheetTutorial('Bring back a daily copy', [
  { title: 'The daily copies', text: 'One for each day of the last week and one for each of the last 12 months. Pick one to merge it into this device, or to make every connected device exactly like it.', target: ['.se-bk-copy', '.se-bk-copies > p'] },
]);

paintButton();
initFile().catch(() => {});
// Google Drive: its state changes repaint the ☁ button and the panels that show it (never the page); then it syncs
// when linked (js/sync.js).
drive.onDriveChange(() => changed());
drive.initDrive();
