// Google sign-in and Tourbook's files in Google Drive (free for everyone: decisions §9). Signing in uses Google Identity
// Services' token client on the website and the desktop app's trip through the web browser (window.tourbookDesktop), asks
// for one permission only, drive.appdata (a hidden folder in the person's Drive that only Tourbook can open), and keeps
// the token for its hour. driveAdapter() reads and writes the files in that folder: tourbook-db.json (the copy every device
// shares) and the daily copies. Nothing here contacts Google until the person taps Connect Google Drive… or Drive is
// already linked (js/backup.js's connect sheet and js/sync.js decide when).
import { CLOUD_APPS } from './cloud-config.js';
import { toast } from './util.js';

const LS = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } },
  del: k => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const K = { on: 'tourbook-drive', file: 'tourbook-drive-file', tokens: 'tourbook-google-tokens', email: 'tourbook-google-email', who: 'tourbook-drive-who' };
export const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const DB_FILE = 'tourbook-db.json';
const API = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FIELDS = 'files(id,name,modifiedTime,size)';
// The daily copies: one per weekday (overwritten each week) and one per month.
export const COPY_NAME = /^tourbook-backup-(mon|tue|wed|thu|fri|sat|sun|\d{4}-\d{2})\.json$/;

// Words on screen (the build spec §9.8).
export const WORDS = {
  away: 'Open Tourbook from its desktop app to connect Google Drive.',
  taken: 'Tourbook can’t open Google’s sign-in because another program on this computer is using the connection Tourbook needs. Restart the computer, open Tourbook first, and try again.',
  browser: 'Carry on in your web browser: sign in to Google there, then come back to Tourbook.',
  notSetUp: 'Google Drive isn’t set up in this copy of Tourbook yet.',
  again: 'Google Drive wants you to sign in again.',
  scope: 'Google didn’t give Tourbook the permission it needs. Try again and leave the box ticked.',
  full: 'Your Google Drive is full: free up space, then tap Sync now.',
  busy: 'Google Drive is busy: Tourbook will try again in a minute.',
  offline: 'Can’t reach Google Drive (no internet?). Tourbook tries again when you’re back online.',
  vdex: 'The copy in your Google Drive is a Vdex file, not a Tourbook one, so Tourbook left it alone.',
  notTourbook: 'The copy in your Google Drive isn’t a Tourbook file, so Tourbook left it alone.',
  noLoad: 'Couldn’t load Google’s sign-in. Check the connection and try again.',
};
// Google's answers when a sign-in does not finish (the token client's error types and the desktop app's own).
export const GOOGLE_ERR = {
  access_denied: 'Google sign-in was cancelled.',
  popup_closed: 'The Google window was closed before you signed in.',
  popup_failed_to_open: 'The Google window was blocked. Allow pop-ups for Tourbook and tap again.',
  timed_out: 'The Google sign-in in your web browser wasn’t finished. Try again.',
  failed: 'Google sign-in didn’t work. Try again.',
  refused: 'Google sign-in didn’t work. Try again.',
  address_taken: WORDS.taken,
};
// An error whose message is said to the person as it is. name: NotAllowedError (sign in again), AbortError (silent:
// a newer sign-in took over), BusyError (try again in a minute), DriveError (anything else).
const fail = (message, name = 'DriveError') => { const e = new Error(message); e.name = name; return e; };
const notAllowed = () => fail(WORDS.again, 'NotAllowedError');
// Anything else Google Drive answers with: a short reason, said as "Couldn’t reach Google Drive: <reason>."
const bad = r => fail(`an error from Google (${r.status})`);

// Tourbook's own client (js/cloud-config.js); empty: "Not set up yet".
export const clientId = () => String((CLOUD_APPS && CLOUD_APPS.google) || '').trim();
export const configured = () => !!clientId();
// The desktop app serves Tourbook at localhost:47861 (47862-47880 when another program holds that port). Its files opened
// in a web browser, without the desktop app around them, connect nothing (the build spec [S-42]); and Google knows
// only the usual port, so the desktop app refuses to sign in on a stand-in one.
const DESKTOP_PORT = 47861;
export const desktopFilesInBrowser = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && Number(location.port) >= DESKTOP_PORT && Number(location.port) <= DESKTOP_PORT + 19 && !window.tourbookDesktop;
export const inDesktopApp = () => !!window.tourbookDesktop;

/* ------------------------------- signing in ------------------------------- */
// Google's script is loaded only once the person has asked for Drive (the connect sheet, which a tap on Connect Google
// Drive… opens, or Drive already linked), so nobody who never taps Connect Google Drive… ever contacts Google; one who
// taps it and then Not now has. A failed load can be tried again.
let gis = null;
export const loadGIS = () => gis || (gis = new Promise((res, rej) => {
  if (desktopFilesInBrowser()) return rej(fail(WORDS.away));
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return res();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = () => (window.google && window.google.accounts && window.google.accounts.oauth2 ? res() : (gis = null, rej(fail(WORDS.noLoad))));
  s.onerror = () => { gis = null; s.remove(); rej(fail(WORDS.noLoad)); };
  document.head.append(s);
}));

// The token, kept for its hour so reopening Tourbook within it needs no tap (exp: a minute early). One whose hour is over
// (or that can't be read) is removed the first time Tourbook looks for it, unless another tab has just put a new one there.
const stored = () => {
  const raw = LS.get(K.tokens);
  if (raw == null) return null;
  let t = null;
  try { t = JSON.parse(raw); } catch { /* removed below */ }
  if (t && t.value && Number(t.exp) > Date.now()) return t;
  if (LS.get(K.tokens) === raw) LS.del(K.tokens);
  return null;
};
export const liveToken = () => { const t = stored(); return t ? t.value : null; };
export const forgetGoogleToken = () => LS.del(K.tokens);

// The one way in. A live token is returned as it is; otherwise only from a tap (interactive), because Google gives a
// browser app an hour per sign-in and no silent renewal. The account is named (login_hint) so Google can skip its
// chooser and the window can close by itself.
export async function googleToken(interactive) {
  if (desktopFilesInBrowser()) throw fail(WORDS.away);
  const have = liveToken();
  if (have) return have;
  if (!interactive) throw notAllowed();
  const client = clientId();
  if (!client) throw fail(WORDS.notSetUp);
  const hint = LS.get(K.email) || '';
  const take = r => {
    if (r && r.error === 'replaced') throw fail('A newer sign-in took over', 'AbortError'); // Connect tapped again: the new one carries on
    if (!r || r.error || !r.access_token) throw fail(GOOGLE_ERR[r && r.error] || (r && r.error_description) || GOOGLE_ERR.failed);
    const granted = String(r.scope || SCOPE).split(/\s+/);
    if (!granted.includes(SCOPE)) throw fail(WORDS.scope);
    LS.set(K.tokens, JSON.stringify({ value: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60000 }));
    return r.access_token;
  };
  // The desktop app: Google refuses its sign-in inside an app window, so it opens in the web browser and the answer
  // comes back to the app (desktop/main.cjs).
  const desk = window.tourbookDesktop;
  if (desk) {
    if (typeof desk.googleSignIn !== 'function') throw fail(GOOGLE_ERR.failed);
    if (Number(location.port) !== DESKTOP_PORT) throw fail(WORDS.taken);
    toast(WORDS.browser);
    return take(await desk.googleSignIn({ client, scope: SCOPE, hint }));
  }
  await loadGIS();
  return new Promise((res, rej) => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: client, scope: SCOPE,
      callback: r => { try { res(take(r)); } catch (e) { rej(e); } },
      error_callback: e => rej(fail(GOOGLE_ERR[e && e.type] || GOOGLE_ERR.failed)),
    });
    tc.requestAccessToken(hint ? { prompt: '', login_hint: hint } : { prompt: '' });
  });
}

// The account, shown as "Signed in as …" and used as the next sign-in's hint.
export const who = () => LS.get(K.who) || '';
async function googleWho(token) {
  try {
    const r = await fetch(`${API}/about?fields=user(displayName,emailAddress)`, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return;
    const u = (await r.json()).user || {};
    if (u.emailAddress) LS.set(K.email, u.emailAddress);
    const line = [u.displayName, u.emailAddress].filter(Boolean).join(' · ');
    if (line) LS.set(K.who, line);
  } catch { /* the name is a nicety */ }
}

/* ------------------------------- Google's time ------------------------------- */
// How far this device's clock is from Google's (the lead's decision 3): this device's time minus Google's, in ms (below 0:
// slow, above 0: fast), from the last answer that said Google's time: the modifiedTime of a file just written, or an
// answer's Date header where the browser lets the page read it. 0 until one has. Each record's newest change wins a
// merge by this device's clock (js/store.js mergeDb), so a clock more than a couple of minutes off can undo changes.
let skew = 0;
export const clockSkew = () => skew;
const timing = new WeakMap(); // an answer → [sent, got], this device's clock either side of it
// Google's moment lies between the request going and its answer coming when the two clocks agree; outside, by how much.
// slack: the Date header's own rounding (whole seconds, rounded down).
function heard(googleMs, r, slack = 0) {
  const t = timing.get(r);
  if (!t || !Number.isFinite(googleMs) || googleMs <= 0) return;
  const [sent, got] = t;
  skew = googleMs > got ? -(googleMs - got) : googleMs + slack < sent ? sent - (googleMs + slack) : 0;
}
// A write's answer, asked for with fields=id,modifiedTime: its id, and Google's time from it.
async function written(r) {
  let j = {};
  try { j = await r.json(); } catch { /* no body: nothing learnt */ }
  heard(Date.parse(j.modifiedTime), r);
  return j;
}

// A request to Drive with the token. No answer at all is "no internet"; 401 means the hour is up; a full Drive and
// Google's rate limits are said in words. Every other answer is the caller's.
async function gfetch(url, init = {}) {
  const token = await googleToken(false);
  let r;
  const sent = Date.now();
  try { r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + token } }); }
  catch { throw fail(WORDS.offline); }
  timing.set(r, [sent, Date.now()]);
  const date = r.headers.get('date');
  if (date) heard(Date.parse(date), r, 999);
  if (r.status === 401) { forgetGoogleToken(); throw notAllowed(); }
  if (r.status === 403 || r.status === 429) {
    let reason = '';
    try { const j = await r.clone().json(); reason = String((j.error && ((j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || j.error.status)) || ''); } catch { /* no body */ }
    if (/storageQuotaExceeded/.test(reason)) throw fail(WORDS.full);
    if (r.status === 429 || /rateLimit|RESOURCE_EXHAUSTED/i.test(reason)) throw fail(WORDS.busy, 'BusyError');
  }
  return r;
}

/* ------------------------------- the files ------------------------------- */
// Tourbook's file rules, as js/backup.js has them (copied, so this module does not import the backups panel).
const arr = Array.isArray;
const ours = d => d.app === 'tourbook' || d.app === 'gdex'; // 'gdex': saved while the app was called Gdex (decisions §19)
const isVdex = d => !!d && typeof d === 'object' && !ours(d) && (d.vdex === 'encrypted-backup' || d.app === 'vdex' || arr(d.crew)
  || (arr(d.logs) && arr(d.shifts) && !arr(d.acts)) || (!d.app && (arr(d.bookings) || arr(d.gear)) && !arr(d.songs) && !arr(d.acts)));
const isTourbook = d => !!d && typeof d === 'object' && !arr(d) && (ours(d) || (arr(d.songs) && arr(d.bookings)));
// A file's text as Tourbook's data; null when it is empty. Anything else is refused and left alone (the error is marked
// unreadable: js/sync.js keeps the daily copies going and offers to put this device's copy in its place).
const unreadable = message => Object.assign(fail(message), { unreadable: true });
export function parseTourbook(text) {
  if (!text || !String(text).trim()) return null;
  let d;
  try { d = JSON.parse(text); } catch { throw unreadable(WORDS.notTourbook); }
  if (isVdex(d)) throw unreadable(WORDS.vdex);
  if (!isTourbook(d)) throw unreadable(WORDS.notTourbook);
  return d;
}

export function driveAdapter() {
  const list = async q => {
    const r = await gfetch(`${API}/files?spaces=appDataFolder${q ? '&q=' + encodeURIComponent(q) : ''}&orderBy=createdTime&pageSize=100&fields=${FIELDS}`);
    if (!r.ok) throw bad(r);
    return ((await r.json()).files || []).filter(f => f && f.id && f.name);
  };
  // Every tourbook-db.json, oldest first. Two devices linking at the same moment can each make one: the oldest is the one
  // every device uses (js/sync.js merges the others into it and deletes them).
  const find = async () => {
    const ids = (await list(`name='${DB_FILE}'`)).map(f => f.id);
    if (ids[0]) LS.set(K.file, ids[0]); else LS.del(K.file);
    return ids;
  };
  const media = async id => {
    const r = await gfetch(`${API}/files/${encodeURIComponent(id)}?alt=media`);
    if (r.status === 404) return null;
    if (!r.ok) throw bad(r);
    return r.text();
  };
  const patch = async (id, text) => { const r = await gfetch(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text }); if (r.ok) await written(r); return r; }; // its body read here: callers look only at ok and status
  const create = async (name, text) => {
    const b = 'tourbook' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${b}--`;
    const r = await gfetch(`${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
    if (!r.ok) throw bad(r);
    return (await written(r)).id;
  };
  const remove = async id => {
    const r = await gfetch(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw bad(r);
  };
  let copies = new Map(); // a daily copy's name → its id, from the last listing
  return {
    id: 'gdrive', label: 'Google Drive',
    // True with a live token. With ask (a tap): signs in, and learns the account's name the first time.
    ready: async ask => {
      if (liveToken()) return true;
      if (!ask) return false;
      const t = await googleToken(true);
      if (!LS.get(K.email) || !LS.get(K.who)) await googleWho(t);
      return true;
    },
    // The shared copy: { data (null when there is none yet), extras: [{ id, data }] (more tourbook-db.json files, oldest
    // after the first; data null when unreadable, and then it is left alone) }.
    read: async () => {
      const ids = await find();
      if (!ids.length) return { data: null, extras: [] };
      const text = await media(ids[0]);
      if (text == null) { LS.del(K.file); return { data: null, extras: [] }; }
      const data = parseTourbook(text);
      const extras = [];
      for (const id of ids.slice(1)) {
        let d = null;
        try { d = parseTourbook(await media(id)); } catch (e) { if (e.name === 'NotAllowedError') throw e; }
        extras.push({ id, data: d });
      }
      return { data, extras };
    },
    // Overwrite the shared copy, or make it. A copy deleted in Drive meanwhile (404) is looked for again, then made.
    write: async text => {
      let id = LS.get(K.file) || (await find())[0] || null;
      if (id) {
        let r = await patch(id, text);
        if (r.ok) return;
        if (r.status !== 404) throw bad(r);
        LS.del(K.file);
        id = (await find())[0] || null;
        if (id) { r = await patch(id, text); if (r.ok) return; throw bad(r); }
      }
      LS.set(K.file, await create(DB_FILE, text));
    },
    // The shared copy kept, exactly as it is, as another file (name) in the same folder, so that write() can put this
    // device's copy in its place: for a shared copy Tourbook can't read. False when there is none.
    setAside: async name => {
      const id = (await find())[0];
      if (!id) return false;
      const text = await media(id);
      if (text != null) await create(name, text);
      return true;
    },
    // The daily copies, as Drive lists them: [{ id, name, modifiedTime }], oldest first. One request.
    listCopies: async () => {
      const files = (await list('')).filter(f => COPY_NAME.test(f.name));
      copies = new Map();
      for (const f of files) if (!copies.has(f.name)) copies.set(f.name, f.id);
      return files;
    },
    readCopy: async name => {
      let id = copies.get(name);
      if (!id) { id = ((await list(`name='${name.replace(/'/g, "\\'")}'`))[0] || {}).id; }
      if (!id) throw fail('That daily copy is no longer in your Google Drive.');
      const data = parseTourbook(await media(id));
      if (!data) throw fail('That daily copy is empty.');
      return data;
    },
    writeCopy: async (name, text, id = null) => {
      if (id) { const r = await patch(id, text); if (r.ok) return id; if (r.status !== 404) throw bad(r); }
      const made = await create(name, text);
      copies.set(name, made);
      return made;
    },
    deleteCopy: id => remove(id),
    // Every file in Tourbook's hidden folder: the shared copy and every daily copy. Returns how many went.
    deleteAll: async () => {
      let n = 0;
      for (let round = 0; round < 5; round++) {
        const files = await list('');
        if (!files.length) break;
        for (const f of files) { await remove(f.id); n++; }
      }
      LS.del(K.file); copies = new Map();
      return n;
    },
    // Forget the link, the token and the account on this device. Google's permission stays until the person removes
    // Tourbook in their Google Account (the panel says how).
    signOut: () => { for (const k of Object.values(K)) LS.del(k); copies = new Map(); },
  };
}
