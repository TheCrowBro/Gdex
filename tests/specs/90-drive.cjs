// Google Drive, free for everyone (the build spec §8): not set up yet; connecting (Google contacted only once asked, a
// cancelled sign-in leaves nothing linked, only drive.appdata asked, Google's script not loading and Try again); the
// walkthroughs of the Backups sheet, the connect sheet and the daily copies; the first device writes the copy, a second
// joins, edits and deletions travel, the hour running out and one tap to sign in again; status changes never redraw the
// page; Drive keeps flowing while the store's gate refuses everything; the daily and monthly copies, bringing one back
// and Replace reaching every device; a record deleted by mistake brought back by Merge (Also bring back); Disconnect, Delete Tourbook's copy and Erase (the changes Drive lacks copied first, or
// said, with Erase anyway); two tabs, Erase in one not undone by the other; Google's token removed once its hour is over; where the focus goes when the Drive card
// is redrawn; and the earliest free day carried in the Drive copy (freeDaysFrom, [S-39]). Google is faked: its sign-in
// script is served by the test, and one Google Drive held here in Node answers every device (each browser context is
// one device).
// This file also exports the fake and the device opener for 91-drive-merge and 92-drive-desktop.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ok, sleep, BASE } = require('../helpers.cjs');

const CLIENT = '123-tourbook-test.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const ROOT = process.env.TOURBOOK_ROOT || path.resolve(__dirname, '..', '..');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const TERMS_V = (() => { try { return (/TERMS_VERSION = '([^']*)'/.exec(fs.readFileSync(path.join(ROOT, 'js', 'terms.js'), 'utf8')) || [])[1] || ''; } catch { return ''; } })();
const sheetOf = title => `.sheet[aria-label="${title}"]`;
const until = async (fn, ms = 12000) => { const end = Date.now() + ms; for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() > end) return false; await sleep(100); } };

// Google Identity Services, standing in for Google's sign-in window: it records what it was asked and answers 10 ms
// later with a token (window.__gfail: the person cancelled; window.__gscope: the permission Google granted).
const GIS = `window.google = { accounts: { oauth2: { initTokenClient: cfg => { window.__gcfg = cfg; return { requestAccessToken: o => { window.__greq = o; window.__gcalls = (window.__gcalls || 0) + 1;
  setTimeout(() => window.__gfail ? cfg.callback({ error: typeof window.__gfail === 'string' ? window.__gfail : 'access_denied' }) : cfg.callback({ access_token: 'gtok' + Math.random().toString(36).slice(2), expires_in: 3600, scope: window.__gscope || cfg.scope, token_type: 'Bearer' }), 10); } }; } } } };`;

// One Google Drive, its hidden app folder held here. Requests: list (q name='…', orderBy createdTime), media read,
// multipart create, media PATCH, DELETE, about. D.fail = { status, reason, match({ who, method, path, name }), abort,
// keep } answers the next matching request (every one with keep) with an error, or no answer at all (abort). It
// answers 404 only for a file that is not there. Google's clock: D.ahead (ms ahead of this computer's); a write's answer
// carries the file's modifiedTime only when its fields ask for it, as Google's does; D.dateHeader also lets the page
// read each answer's Date header (Access-Control-Expose-Headers).
function fakeDrive() {
  let seq = 0;
  const files = [];
  const D = {
    files, log: [], fail: null, user: { displayName: 'Gee Test', emailAddress: 'gee@example.com' }, ahead: 0, dateHeader: false,
    now: () => new Date(Date.now() + D.ahead),
    put(name, body, modified = D.now().toISOString()) {
      const f = { id: 'f' + (++seq) + Math.random().toString(36).slice(2, 7), seq, name, body: typeof body === 'string' ? body : JSON.stringify(body, null, 2), modified, writes: 1 };
      files.push(f); return f;
    },
    named: name => files.filter(f => f.name === name).sort((a, b) => a.seq - b.seq),
    json(name = 'tourbook-db.json') { const f = D.named(name)[0]; return f ? JSON.parse(f.body) : null; },
    drop(id) { const i = files.findIndex(f => f.id === id); if (i >= 0) files.splice(i, 1); return i >= 0; },
    writes: who => D.log.filter(l => (!who || l.who === who) && (l.method === 'PATCH' || l.method === 'POST')).length,
    route: who => route => handle(route, who),
  };
  async function handle(route, who) {
    const req = route.request(), method = req.method(), u = new URL(req.url()), p = u.pathname;
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const dated = D.dateHeader ? { date: D.now().toUTCString(), 'access-control-expose-headers': 'date' } : {};
    const send = (status, body) => route.fulfill({ status, headers: { ...CORS, ...dated, 'content-type': 'application/json; charset=utf-8' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    const asked = f => (u.searchParams.get('fields') || '').split(',').includes('modifiedTime') ? { modifiedTime: f.modified } : {}; // a write's fields
    const auth = req.headers().authorization || '';
    const body = () => (req.postDataBuffer() || Buffer.alloc(0)).toString('utf8');
    // The file a request is about, by name: the list's q, a file's id, or a new file's metadata.
    const byPath = (/\/files\/([^/]+)$/.exec(p) || [])[1];
    const name = byPath ? (files.find(f => f.id === byPath) || {}).name || '' : (/name='([^']*)'/.exec(u.searchParams.get('q') || '') || [])[1] || (method === 'POST' ? (/"name":"([^"]*)"/.exec(body()) || [])[1] || '' : '');
    const entry = { who, method, path: p, q: u.searchParams.get('q') || '', name, auth };
    D.log.push(entry);
    if (!/^Bearer \S+$/.test(auth)) return send(401, { error: { code: 401, message: 'Login Required' } });
    const f0 = D.fail;
    if (f0 && (!f0.match || f0.match(entry))) {
      if (!f0.keep) D.fail = null;
      if (f0.abort) return route.abort('failed');
      return send(f0.status, { error: { code: f0.status, errors: [{ reason: f0.reason || 'backendError' }] } });
    }
    if (p === '/drive/v3/about' && method === 'GET') return send(200, { user: D.user });
    if (p === '/drive/v3/files' && method === 'GET') {
      if (u.searchParams.get('spaces') !== 'appDataFolder') return send(400, { error: { code: 400, message: 'only the app folder' } });
      let list = files.slice().sort((a, b) => a.seq - b.seq);
      const q = u.searchParams.get('q');
      if (q) { const m = /^name='((?:[^'\\]|\\.)*)'$/.exec(q); if (!m) return send(400, { error: { code: 400, message: 'q' } }); const name = m[1].replace(/\\'/g, "'"); list = list.filter(f => f.name === name); }
      return send(200, { files: list.map(f => ({ id: f.id, name: f.name, modifiedTime: f.modified, size: String(Buffer.byteLength(f.body)) })) });
    }
    let m = /^\/drive\/v3\/files\/([^/]+)$/.exec(p);
    if (m && method === 'GET' && u.searchParams.get('alt') === 'media') { const f = files.find(x => x.id === m[1]); return f ? route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: f.body }) : send(404, { error: { code: 404, message: 'File not found' } }); }
    if (m && method === 'DELETE') return D.drop(m[1]) ? route.fulfill({ status: 204, headers: CORS }) : send(404, { error: { code: 404, message: 'File not found' } });
    if (p === '/upload/drive/v3/files' && method === 'POST' && u.searchParams.get('uploadType') === 'multipart') {
      const b = (/boundary=([^;]+)/.exec(req.headers()['content-type'] || '') || [])[1];
      const parts = b ? body().split('--' + b).slice(1, -1).map(s => s.slice(s.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '')) : [];
      let meta = {}; try { meta = JSON.parse(parts[0]); } catch { /* checked below */ }
      if (!meta.name || !(meta.parents || []).includes('appDataFolder') || parts.length !== 2) return send(400, { error: { code: 400, message: 'bad upload' } });
      const made = D.put(meta.name, parts[1]);
      return send(200, { id: made.id, ...asked(made) });
    }
    m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(p);
    if (m && method === 'PATCH' && u.searchParams.get('uploadType') === 'media') {
      const f = files.find(x => x.id === m[1]);
      if (!f) return send(404, { error: { code: 404, message: 'File not found' } });
      f.body = body(); f.modified = D.now().toISOString(); f.writes++;
      return send(200, { id: f.id, ...asked(f) });
    }
    return send(400, { error: { code: 400, message: 'unknown request' } });
  }
  return D;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
// Serves Tourbook's files from the test's copy at any address (the desktop app's own, localhost:4786x), with no server.
const serveFiles = async route => {
  let p = decodeURIComponent(new URL(route.request().url()).pathname); if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(path.resolve(ROOT)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
};

// One device: a browser context with Tourbook open, the welcome tour, the role card and the question out of the way (as
// tests/helpers.cjs does, the licence leg included), the Google client set (client: '' for none), Google's sign-in
// script and the fake Drive routed, toasts recorded, and every request to a Google host listed in hosts.
// seed: localStorage values set before the first page when absent. standIn: a module served as js/licence-state.js
// (with licences live in js/licence-config.js). serve: Tourbook's files served by the test at url (no test server).
async function device(browser, D, { who = 'A', client = CLIENT, sample = false, init = null, seed = null, standIn = null, url = BASE, serve = false, viewport = { width: 420, height: 900 }, prefs = null, gis = true } = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const hosts = [];
  ctx.on('request', r => { try { const u = new URL(r.url()); if (/google/.test(u.hostname)) hosts.push(u.hostname + u.pathname); } catch { /* not a URL */ } });
  await ctx.addInitScript(([pf, sd]) => {
    try {
      localStorage.setItem('tourbook-tour', 'done'); localStorage.setItem('tourbook-role-nudged', '1'); localStorage.setItem('tourbook-ask-seen', 'off');
      if (pf) localStorage.setItem('tourbook-prefs', pf);
      if (sd && !sessionStorage.getItem('tourbook-test-seeded')) { sessionStorage.setItem('tourbook-test-seeded', '1'); for (const [k, v] of Object.entries(sd)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }
    } catch (e) { /* ignore */ }
    window.__toasts = [];
    addEventListener('DOMContentLoaded', () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }))).observe(document.body, { childList: true, subtree: true }));
  }, [prefs, seed]);
  if (process.env.TOURBOOK_LICENCE === 'on') await ctx.addInitScript(v => { try { const t = Date.now(); if (!localStorage.getItem('tourbook-licence')) localStorage.setItem('tourbook-licence', JSON.stringify({ on: true, statusAt: t, first: t, seen: t })); if (!localStorage.getItem('tourbook-terms')) localStorage.setItem('tourbook-terms', JSON.stringify({ v, at: t })); } catch (e) { /* ignore */ } }, TERMS_V);
  if (init) await ctx.addInitScript(init);
  if (serve) await ctx.route(u => u.href.startsWith(url), serveFiles); // first, so the routes below override it
  const tile = { status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') };
  await ctx.route('https://tile.openstreetmap.org/**', r => r.fulfill(tile));
  await ctx.route('https://*.tile.openstreetmap.org/**', r => r.fulfill(tile));
  await ctx.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[]}}' }));
  await ctx.route('**/js/cloud-config.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: `export const CLOUD_APPS = ${JSON.stringify({ google: client })};\n` }));
  if (standIn) {
    await ctx.route('**/js/licence-state.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: standIn }));
    await ctx.route('**/js/licence-config.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: "export const LICENCE_SITES = ['localhost', '127.0.0.1'];\n" }));
  }
  if (gis) await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: GIS }));
  if (D) await ctx.route('https://www.googleapis.com/**', D.route(who));
  const page = await ctx.newPage();
  const errors = [], allow = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || /Content Security Policy|Refused to/.test(t)) && !allow.some(re => re.test(t))) errors.push(t); });
  page.on('dialog', d => d.accept());
  await page.goto(url);
  await page.waitForSelector('#deck .dk-next');
  await page.evaluate(() => import('./js/backup.js')); // loaded at idle on every open (and Drive with it): now, so a spec need not wait
  if (sample) { await page.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(150); }
  return { ctx, page, errors, hosts, allow, who };
}

const state = page => page.evaluate(() => import('./js/sync.js').then(m => m.driveState()));
const syncOn = (page, opts = {}) => page.evaluate(o => import('./js/sync.js').then(m => m.sync(o)), opts);
const data = page => page.evaluate(() => import('./js/store.js').then(s => JSON.parse(s.serialize())));
const cloudState = page => page.evaluate(() => [document.getElementById('cloudBtn').dataset.state || '', document.getElementById('cloudLabel').textContent]);
const waitCloud = (page, st) => page.waitForFunction(s => document.getElementById('cloudBtn')?.dataset.state === s, st, { timeout: 15000 }).then(() => true, () => false);
const toasts = page => page.evaluate(() => window.__toasts.join(' | '));
// The classes of the control holding the focus ('' for none).
const focused = page => page.evaluate(() => { const a = document.activeElement; return a ? [...a.classList].join(' ') : ''; });
// The ☁ sheet (the backups panel with the Drive card), opened as a person would.
async function openBackups(page) {
  if (await page.locator(sheetOf('Backups')).count()) return;
  await page.click('#cloudBtn');
  await page.waitForSelector(`${sheetOf('Backups')} .se-bk-drive`, { timeout: 10000 });
  await sleep(150);
}
const closeSheets = async page => { for (let i = 0; i < 4 && (await page.locator('.sheet').count()); i++) { await page.keyboard.press('Escape'); await sleep(200); } };
// Connect from the ☁ sheet: Connect Google Drive…, then Continue with Google. Resolves once the sheet has answered.
async function connect(page) {
  await openBackups(page);
  await page.click(`${sheetOf('Backups')} .se-bk-drive-connect`);
  await page.waitForSelector(`${sheetOf('Connect Google Drive')} .se-bk-drive-go:not([disabled])`, { timeout: 10000 });
  await page.click(`${sheetOf('Connect Google Drive')} .se-bk-drive-go`);
  await page.waitForFunction(() => !document.querySelector('.sheet[aria-label="Connect Google Drive"]') || !document.querySelector('.sheet[aria-label="Connect Google Drive"] .se-bk-drive-err').hidden || !document.querySelector('.sheet[aria-label="Connect Google Drive"] .se-bk-drive-go').disabled, null, { timeout: 15000 }).catch(() => {});
  await sleep(100);
}
// A month's monthly copy name, n months from this one (in the device's time zone).
const monthName = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return `tourbook-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.json`; };
const weekdayName = () => `tourbook-backup-${['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()]}.json`;

module.exports = { CLIENT, SCOPE, ROOT, GIS, fakeDrive, device, serveFiles, state, syncOn, data, cloudState, waitCloud, toasts, focused, openBackups, closeSheets, connect, until, sheetOf, monthName, weekdayName };

// A stand-in for js/licence-state.js (Part A builds the real one): every export of the build spec §3.5, free days kept
// in tourbook-licence { first }, adoptFreeDaysFrom as §3.5 has it, and the store's gate shut for a paid role once 30 days
// have passed since first. Enough to see what Google Drive does with the earliest free day.
const STAND_IN = `import { setGate } from './store.js';
const DAY = 864e5, KEY = 'tourbook-licence';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const now = () => { const s = read(), first = Number(s.first) || 0, left = first ? Math.max(0, 30 - Math.floor((Date.now() - first) / DAY)) : 30;
  return { kind: 'web', mode: !first ? 'unstarted' : left > 0 ? 'trial' : 'ended', canEdit: !first || left > 0, started: !!first, first, trialLeft: left, trialEnds: '', licence: null, seats: 3 }; };
const paid = () => (localStorage.getItem('tourbook-role') || 'all') !== 'audiophile';
const fns = new Set();
export const LICENCE_EVENT = 'tourbook-licence';
export const FREE_KEEPS_WORK = false;
export const licenceNow = now;
export const licenceOn = () => true;
export const licenceReady = () => Promise.resolve();
export const mayOpen = () => 'open';
export const mayWork = () => 'open';
export const mayPickRole = () => 'open';
export const gateWork = fn => { fn(); };
export const workMark = () => null;
export const canWrite = () => now().canEdit || !paid();
export const startFreeDays = () => Promise.resolve(false);
export const freeDaysFrom = () => now().first;
export const adoptFreeDaysFrom = async t => {
  if (typeof t !== 'number' || !Number.isFinite(t) || t < Date.UTC(2026, 0, 1) || t > Date.now() + DAY) return false;
  const s = read(); if (s.first && !(t < s.first)) return false;
  localStorage.setItem(KEY, JSON.stringify({ ...s, first: t, seen: Math.max(Number(s.seen) || 0, Date.now()) }));
  const st = now(); dispatchEvent(new CustomEvent(LICENCE_EVENT, { detail: st })); fns.forEach(f => f(st)); return true;
};
export const refreshLicence = now;
export const serverTime = () => {};
export const setLicenceState = () => {};
export const onLicenceChange = fn => { fns.add(fn); return () => fns.delete(fn); };
export const initLicenceSource = () => Promise.resolve();
export const roleBadge = () => '';
export const sectionMark = () => null;
setGate(() => canWrite());
` + (() => {
  // Any other name the real module exports (its own modules may import one) answers nothing here.
  const mine = new Set(['LICENCE_EVENT', 'FREE_KEEPS_WORK', 'licenceNow', 'licenceOn', 'licenceReady', 'mayOpen', 'mayWork', 'mayPickRole', 'gateWork', 'workMark', 'canWrite', 'startFreeDays', 'freeDaysFrom', 'adoptFreeDaysFrom', 'refreshLicence', 'serverTime', 'setLicenceState', 'onLicenceChange', 'initLicenceSource', 'roleBadge', 'sectionMark']);
  let src = ''; try { src = fs.readFileSync(path.join(ROOT, 'js', 'licence-state.js'), 'utf8'); } catch { /* none */ }
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) names.add(n); }
  return [...names].filter(n => !mine.has(n) && n !== 'default').map(n => `export const ${n} = () => undefined;\n`).join('');
})();

if (require.main === module) (async () => {
  const browser = await chromium.launch();
  const all = [];

  /* ------------------------------ not set up yet ------------------------------ */
  {
    const dv = await device(browser, null, { client: '' }); all.push(dv);
    const { page } = dv;
    await openBackups(page);
    const card = page.locator(`${sheetOf('Backups')} .se-bk-drive`);
    ok('not set up: the Drive card is grey and says so, with no Connect', (await card.getAttribute('data-state')) === 'unset' && /Google Drive · Not set up yet: Google Drive will work here once Tourbook’s Google sign-in is switched on\./.test((await card.innerText()).replace(/\s*\n\s*/g, ' · ')) && (await card.locator('button').count()) === 0, (await card.innerText()).replace(/\s+/g, ' '));
    ok('…and it links to no developer documents', (await card.locator('a').count()) === 0);
    ok('…the Drive card comes before the backup file’s buttons, under the status line', await page.evaluate(() => { const p = document.querySelector('.sheet .se-bk > .stack'); const kids = [...p.children]; return kids.indexOf(p.querySelector('.se-bk-status')) === 0 && kids.indexOf(p.querySelector('.se-bk-drive')) === 1; }));
    const [st, label] = await cloudState(page);
    ok('…and the ☁ button is as before', st === '' && label === 'Backup', st + ' ' + label);
    ok('…nothing went to Google', dv.hosts.length === 0, dv.hosts.join(' '));
    await closeSheets(page);
    await dv.ctx.close();
  }

  /* ------------------------------ device A connects ------------------------------ */
  const D = fakeDrive();
  const A = await device(browser, D, { who: 'A', sample: true }); all.push(A);
  const pa = A.page;
  await openBackups(pa);
  let card = pa.locator(`${sheetOf('Backups')} .se-bk-drive`);
  ok('off: the card offers Google Drive in plain words, free', (await card.getAttribute('data-state')) === 'off' && /Keep Tourbook the same on your phone and computer, with a dated copy each day, in a private Tourbook folder of your own Google Drive\. Free\. Only Tourbook can open that folder\./.test(await card.innerText()) && (await card.locator('.se-bk-drive-connect').innerText()) === 'Connect Google Drive…');
  ok('nobody who has not asked for Drive contacts Google', A.hosts.length === 0, A.hosts.join(' '));
  await pa.click(`${sheetOf('Backups')} .se-bk-drive-connect`);
  await pa.waitForSelector(`${sheetOf('Connect Google Drive')} .se-bk-drive-go:not([disabled])`, { timeout: 10000 });
  const connectText = await pa.locator(sheetOf('Connect Google Drive')).innerText();
  ok('Connect opens a sheet that says what Drive does, before anything else', /hidden folder of your Google Drive that only Tourbook can open/.test(connectText) && /the last 7 days and the last 12 months/.test(connectText) && /about once an hour/.test(connectText) && /Nothing goes to a Tourbook server\./.test(connectText) && /Continue with Google/.test(connectText) && /Not now/.test(connectText) && !/web browser/.test(connectText));
  ok('Google’s sign-in script loads only once that sheet is open, and Drive is not contacted yet', A.hosts.includes('accounts.google.com/gsi/client') && !A.hosts.some(x => /googleapis/.test(x)), A.hosts.join(' '));
  await pa.evaluate(() => { window.__gfail = true; });
  await pa.click(`${sheetOf('Connect Google Drive')} .se-bk-drive-go`);
  await pa.waitForSelector(`${sheetOf('Connect Google Drive')} .se-bk-drive-err:not([hidden])`, { timeout: 10000 });
  ok('a cancelled sign-in says so in the sheet', (await pa.locator(`${sheetOf('Connect Google Drive')} .se-bk-drive-err`).innerText()) === 'Google sign-in was cancelled.');
  ok('…and leaves nothing linked and nothing in Drive', !(await pa.evaluate(() => localStorage.getItem('tourbook-drive'))) && !(await state(pa)).linked && D.files.length === 0 && !A.hosts.some(x => /googleapis/.test(x)));
  await pa.evaluate(() => { window.__gfail = false; });
  await pa.click(`${sheetOf('Connect Google Drive')} .se-bk-drive-go`);
  await pa.waitForSelector(sheetOf('Connect Google Drive'), { state: 'detached', timeout: 15000 });
  const gcfg = await pa.evaluate(() => ({ id: window.__gcfg.client_id, scope: window.__gcfg.scope, req: window.__greq }));
  ok('Google is asked with Tourbook’s client for drive.appdata only', gcfg.id === CLIENT && gcfg.scope === SCOPE && gcfg.req.prompt === '', JSON.stringify(gcfg));
  ok('connected: the ☁ button says Synced', await waitCloud(pa, 'synced') && (await cloudState(pa))[1] === 'Synced');
  ok('…and the focus goes back to the redrawn Drive card, on Sync now', /se-bk-drive-sync/.test(await focused(pa)), await focused(pa));
  ok('…with a toast that says so', /Connected to Google Drive\. Up to date\./.test(await toasts(pa)));
  let dbA = D.json();
  ok('the first device writes tourbook-db.json into the app folder, with its records', D.named('tourbook-db.json').length === 1 && dbA.app === 'tourbook' && dbA.bookings.some(b => b.id === 's-show1') && dbA.acts.some(a => a.id === 's-owls'));
  ok('…as JSON with two-space indent', /^\{\n {2}"app": "tourbook"/.test(D.named('tourbook-db.json')[0].body));
  const lic = await pa.evaluate(() => import('./js/licence-state.js').then(L => ({ on: L.licenceOn(), from: L.freeDaysFrom() })));
  ok('the Drive copy carries freeDaysFrom only when this device has started its free days (none while licences are off)', lic.on ? dbA.freeDaysFrom === lic.from : !('freeDaysFrom' in dbA), JSON.stringify({ lic, field: dbA.freeDaysFrom }));
  ok('…and the field never enters this device’s database', !(await pa.evaluate(() => 'freeDaysFrom' in JSON.parse(localStorage.getItem('tourbook-db-v1')))));
  await until(() => D.named(weekdayName()).length && D.named(monthName(0)).length);
  ok('the first good sync of the day saves today’s copy and this month’s', D.named(weekdayName()).length === 1 && D.named(monthName(0)).length === 1 && JSON.parse(D.named(weekdayName())[0].body).bookings.some(b => b.id === 's-show1'));
  await sleep(200);
  card = pa.locator(`${sheetOf('Backups')} .se-bk-drive`);
  const linkedText = await card.innerText();
  ok('the card names the account and says it is up to date', /Connected to Google Drive/.test(linkedText) && /Signed in as Gee Test · gee@example\.com/.test(linkedText) && /Up to date \(just now\)/.test(linkedText), linkedText.replace(/\s+/g, ' '));
  ok('…with today’s copy and the buttons', /Today’s copy: saved at/.test(linkedText) && ['Sync now', 'Bring back a daily copy…', 'Disconnect', 'Delete Tourbook’s copy from Google Drive…'].every(t => linkedText.includes(t)) && !linkedText.includes('Sign in again'));
  ok('…and says what Disconnect does and how to take Tourbook’s access away', /Disconnect stops syncing on this device\. Both copies stay: this device’s and the one in your Drive\. To take Tourbook’s access away completely, remove Tourbook in your Google Account under third-party connections\./.test(linkedText));
  ok('the backups status counts Google Drive as a backup', /Last backup just now \(Google Drive\)/.test(await pa.locator(`${sheetOf('Backups')} .se-bk-status`).innerText()));
  ok('the account is kept as the next sign-in’s hint, the token for its hour', await pa.evaluate(() => localStorage.getItem('tourbook-google-email') === 'gee@example.com' && JSON.parse(localStorage.getItem('tourbook-google-tokens')).exp > Date.now() + 50 * 60000));
  // the Backups sheet's walkthrough shows the Drive card, second
  await pa.click(`${sheetOf('Backups')} .sheet-help`);
  await pa.waitForSelector('.tour-card h2', { timeout: 10000 });
  const step1 = await pa.locator('.tour-card h2').innerText();
  await pa.keyboard.press('ArrowRight');
  await until(async () => (await pa.locator('.tour-card h2').innerText()) !== step1);
  const step2 = { title: await pa.locator('.tour-card h2').innerText(), text: await pa.locator('.tour-card h2 + p').innerText(), spot: !!(await until(() => pa.evaluate(() => { const s = document.querySelector('.tour-spot').getBoundingClientRect(), c = document.querySelector('.sheet .se-bk-drive').getBoundingClientRect(); return Math.abs(s.top + 8 - c.top) < 2 && Math.abs(s.height - 16 - c.height) < 2; }), 3000)) }; // the spot moves there in .4 s
  ok('the Backups walkthrough shows the Google Drive card second, in plain words', step1 === 'How safe your data is' && step2.title === 'Google Drive' && /^Free for everyone: connect your own Google Drive/.test(step2.text) && step2.spot, JSON.stringify({ step1, ...step2 }));
  await pa.keyboard.press('Escape'); await sleep(200);
  ok('…and Escape ends it, the sheet kept', (await pa.locator('.tour').count()) === 0 && (await pa.locator(sheetOf('Backups')).count()) === 1);
  await closeSheets(pa);

  /* ------------------------------ device B joins ------------------------------ */
  const B = await device(browser, D, { who: 'B' }); all.push(B);
  const pb = B.page;
  await pb.evaluate(() => import('./js/store.js').then(s => s.upsert('acts', { id: 'b-act', name: 'The Second Device' })));
  await connect(pb);
  ok('a second device connects to the same Drive', await waitCloud(pb, 'synced'));
  let dbB = await data(pb);
  ok('…and takes in the first device’s records while keeping its own', dbB.bookings.some(b => b.id === 's-show1') && dbB.acts.some(a => a.id === 'b-act'));
  ok('…and Drive now holds both', D.json().acts.some(a => a.id === 'b-act') && D.json().bookings.some(b => b.id === 's-show1') && D.named('tourbook-db.json').length === 1);
  await syncOn(pa);
  ok('…and the first device has the second’s at its next sync', (await data(pa)).acts.some(a => a.id === 'b-act'));

  // an edit travels
  await pa.evaluate(() => import('./js/store.js').then(s => s.upsert('songs', { id: 'a-song', title: 'Harbour Demo' })));
  ok('a change is copied to Drive a moment later (a full sync)', !!(await until(() => (D.json().songs || []).some(s => s.id === 'a-song'))));
  await syncOn(pb);
  ok('…and arrives on the other device at its next sync', (await data(pb)).songs.some(s => s.id === 'a-song'));
  // a deletion stays deleted
  await pb.evaluate(() => import('./js/store.js').then(s => s.remove('songs', 'a-song')));
  ok('a deletion goes to Drive with its tombstone', !!(await until(() => !D.json().songs.some(s => s.id === 'a-song') && D.json().deleted['a-song'] > 0)));
  await syncOn(pa); await syncOn(pb); await syncOn(pa);
  ok('…and stays deleted on both devices, round after round', !(await data(pa)).songs.some(s => s.id === 'a-song') && !(await data(pb)).songs.some(s => s.id === 'a-song') && !D.json().songs.some(s => s.id === 'a-song'));

  /* ------------------------------ the hour is up ------------------------------ */
  await pa.evaluate(() => Promise.all([import('./js/drive.js'), import('./js/sync.js')]).then(([d, s]) => { d.forgetGoogleToken(); return s.sync({ quiet: true }); }));
  ok('when Google’s hour is up the ☁ button says Sign in', await waitCloud(pa, 'needs-permission') && (await cloudState(pa))[1] === 'Sign in');
  ok('…and nothing went to Drive without a token', D.log.filter(l => l.who === 'A' && !/^Bearer gtok/.test(l.auth)).length === 0);
  await openBackups(pa);
  card = pa.locator(`${sheetOf('Backups')} .se-bk-drive`);
  ok('the card says so, with Sign in again first', /Needs you to sign in again/.test(await card.innerText()) && (await card.locator('.se-bk-drive-again').count()) === 1);
  const calls = await pa.evaluate(() => window.__gcalls);
  await pa.click(`${sheetOf('Backups')} .se-bk-drive-again`);
  ok('one tap signs in again, naming the account so Google can skip its chooser', await waitCloud(pa, 'synced') && (await pa.evaluate(() => window.__greq.login_hint)) === 'gee@example.com' && (await pa.evaluate(() => window.__gcalls)) === calls + 1);
  ok('…and the focus stays in the card when Sign in again goes, on Sync now', !!(await until(async () => /se-bk-drive-sync/.test(await focused(pa)), 3000)), await focused(pa));
  await until(async () => /Signed in again\. Up to date\./.test(await toasts(pa)));
  ok('…and says so', /Signed in again\. Up to date\./.test(await toasts(pa)));
  // a 401 from Drive itself (the token was withdrawn) is the same: sign in again
  A.allow.push(/status of 401/);
  D.fail = { status: 401, match: r => r.who === 'A' };
  await syncOn(pa);
  ok('Drive refusing the token asks for a sign-in, and the token is forgotten', (await state(pa)).status === 'needs-permission' && !(await pa.evaluate(() => localStorage.getItem('tourbook-google-tokens'))));
  A.allow.pop();
  await pa.click(`${sheetOf('Backups')} .se-bk-drive-again`);
  await waitCloud(pa, 'synced');
  await closeSheets(pa);

  /* ------------------------------ status changes never redraw the page ------------------------------ */
  await pa.evaluate(() => window.logiGo('settings')); await sleep(400);
  await pa.evaluate(() => { document.querySelector('#page').firstElementChild.dataset.mark = 'kept'; window.__seen = []; return import('./js/sync.js').then(m => m.onDriveChange(st => window.__seen.push(st.status))); });
  await pa.evaluate(() => { const d = document.getElementById('se-erase'); if (d && !d.open) d.open = true; });
  await pa.focus('#se-erase-input');
  await pa.keyboard.type('ER');
  await pa.evaluate(() => import('./js/sync.js').then(m => { window.__p = m.sync(); }));
  await pa.keyboard.type('AS');
  await pa.evaluate(() => window.__p);
  await pa.keyboard.type('E');
  const kept = await pa.evaluate(() => ({ seen: window.__seen, mark: document.querySelector('#page').firstElementChild.dataset.mark, value: document.getElementById('se-erase-input').value, focus: document.activeElement && document.activeElement.id }));
  ok('a sync’s status changes reach the ☁ button and the panels only: the page is not redrawn and the focus stays put', kept.seen.includes('saving') && kept.seen.includes('synced') && kept.mark === 'kept' && kept.value === 'ERASE' && kept.focus === 'se-erase-input', JSON.stringify(kept));
  await pa.fill('#se-erase-input', '');
  ok('Settings → Backups’ closed line names Google Drive', /Google Drive: synced just now/.test(await pa.locator('#se-backups .se-sub').innerText()));

  /* ------------------------------ the store's gate refusing everything ------------------------------ */
  await pb.evaluate(() => import('./js/store.js').then(s => s.setGate(() => false)));
  await pa.evaluate(() => import('./js/store.js').then(s => s.upsert('acts', { id: 'a-gate', name: 'Through The Gate' })));
  await until(() => D.json().acts.some(a => a.id === 'a-gate'));
  await syncOn(pb);
  const gated = await pb.evaluate(() => import('./js/store.js').then(s => ({ has: !!s.byId('acts', 'a-gate'), refused: s.update(() => {}) === false })));
  ok('with the store’s gate refusing every change, Drive still brings the other devices’ work in', gated.has && gated.refused, JSON.stringify(gated));
  await pb.evaluate(() => import('./js/store.js').then(s => s.setGate(null)));

  /* ------------------------------ the daily and monthly copies ------------------------------ */
  const wk = () => D.named(weekdayName())[0];
  const wkWrites = wk().writes;
  await pa.evaluate(() => import('./js/store.js').then(s => s.upsert('songs', { id: 'a-song2', title: 'Second Demo' })));
  await until(() => D.json().songs.some(s => s.id === 'a-song2'));
  await sleep(300);
  ok('the daily copy is written once a day, not at every sync', wk().writes === wkWrites, `${wk().writes} vs ${wkWrites}`);
  await pa.evaluate(() => localStorage.removeItem('tourbook-backup-cloud'));
  await syncOn(pa);
  ok('…the next day (the record cleared) it is written again, and the month’s copy is not', wk().writes === wkWrites + 1 && D.named(monthName(0))[0].writes === 1 && JSON.parse(wk().body).songs.some(s => s.id === 'a-song2'));
  const day = await pa.evaluate(() => JSON.parse(localStorage.getItem('tourbook-backup-cloud')));
  ok('…and remembered for the day', day.day === await pa.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }) && day.name === weekdayName() && day.at > Date.now() - 60000, JSON.stringify(day));
  // a new month: twelve older monthly copies in Drive already
  D.drop(D.named(monthName(0))[0].id);
  for (let n = -12; n <= -1; n++) D.put(monthName(n), JSON.stringify({ app: 'tourbook', bookings: [], songs: [] }));
  await pa.evaluate(() => localStorage.removeItem('tourbook-backup-cloud'));
  await syncOn(pa);
  const months = D.files.filter(f => /^tourbook-backup-\d{4}-\d{2}\.json$/.test(f.name)).map(f => f.name).sort();
  ok('a new month gets its own copy, and only the last 12 months are kept', months.length === 12 && months.includes(monthName(0)) && !months.includes(monthName(-12)) && months.includes(monthName(-11)), months.join(' '));
  // a sync that fails says why, keeps the changes, and recovers
  await openBackups(pa);
  A.allow.push(/status of 500/);
  D.fail = { status: 500, match: r => r.who === 'A' && r.method === 'GET' && r.name === 'tourbook-db.json' };
  await syncOn(pa);
  A.allow.pop();
  let cardText = await pa.locator(`${sheetOf('Backups')} .se-bk-drive`).innerText();
  ok('a sync that fails says why in the card, and the ☁ button says Not synced', /⚠ Couldn’t reach Google Drive: an error from Google \(500\)\. Your changes are safe on this device\./.test(cardText) && (await cloudState(pa)).join() === 'error,Not synced', cardText.replace(/\s+/g, ' '));
  ok('…and Settings’ closed line would say so too', /⚠ Google Drive: not synced/.test(await pa.evaluate(() => import('./js/backup.js').then(b => b.backupLine()))));
  await pa.click(`${sheetOf('Backups')} .se-bk-drive-sync`);
  ok('Sync now recovers', await waitCloud(pa, 'synced') && !!(await until(async () => /Google Drive is up to date\./.test(await toasts(pa)))));
  // a daily copy that cannot be saved is shown, and counted
  A.allow.push(/status of 403/);
  D.fail = { status: 403, reason: 'storageQuotaExceeded', keep: true, match: r => r.who === 'A' && /^tourbook-backup-/.test(r.name) && (r.method === 'PATCH' || r.method === 'POST') };
  await pa.evaluate(() => localStorage.removeItem('tourbook-backup-cloud'));
  await syncOn(pa);
  const failedCopy = await state(pa);
  cardText = await pa.locator(`${sheetOf('Backups')} .se-bk-drive`).innerText();
  ok('a daily copy that could not be saved is shown with the reason, and the sync itself stays good', failedCopy.status === 'synced' && /⚠ Today’s copy wasn’t saved\. Your Google Drive is full: free up space, then tap Sync now\./.test(cardText), cardText.replace(/\s+/g, ' '));
  ok('…and the backups status warns about it, without a reminder toast', /today’s daily copy in Google Drive wasn’t saved/.test(await pa.locator(`${sheetOf('Backups')} .se-bk-status`).innerText()) && (await pa.locator(`${sheetOf('Backups')} .se-bk-status`).getAttribute('data-level')) === 'old' && (await pa.evaluate(() => import('./js/backup.js').then(b => b.health().copyFailed))));
  D.fail = null;
  A.allow.pop();
  await pa.click(`${sheetOf('Backups')} .se-bk-drive-sync`);
  await until(async () => !(await state(pa)).backupError);
  await sleep(200);
  ok('Sync now saves it once Drive has room again', !(await state(pa)).backupError && /Today’s copy: saved at/.test(await pa.locator(`${sheetOf('Backups')} .se-bk-drive`).innerText()));
  await closeSheets(pa);

  /* ------------------------------ bringing back a daily copy, everywhere ------------------------------ */
  await pa.evaluate(() => import('./js/store.js').then(s => s.upsert('acts', { id: 'a-after', name: 'Added After The Copy' })));
  await until(() => D.json().acts.some(a => a.id === 'a-after'));
  await syncOn(pb);
  ok('(the other device has the record made after the copy)', (await data(pb)).acts.some(a => a.id === 'a-after'));
  await openBackups(pa);
  const logAt = D.log.length;
  await pa.click(`${sheetOf('Backups')} .se-bk-drive-restore`);
  await pa.waitForSelector(`${sheetOf('Bring back a daily copy')} .se-bk-copy`, { timeout: 10000 });
  const rows = await pa.locator(`${sheetOf('Bring back a daily copy')} .se-bk-copy`).allInnerTexts();
  const labels = await pa.evaluate(() => ({ day: new Date().toLocaleDateString('en-GB', { weekday: 'long' }), month: new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }));
  ok('Bring back a daily copy lists the copies newest first, by weekday and by month, with when each was saved', rows.length === 13 && rows[0].startsWith(labels.day + ' · saved ') && rows.some(r => r.startsWith(labels.month + ' · saved ')), rows.slice(0, 4).join(' | '));
  ok('…from one Drive request', D.log.slice(logAt).filter(l => l.who === 'A').length === 1, JSON.stringify(D.log.slice(logAt).map(l => l.method + ' ' + l.path)));
  await pa.click(`${sheetOf('Bring back a daily copy')} .sheet-help`);
  await pa.waitForSelector('.tour-card h2', { timeout: 10000 });
  ok('the daily copies’ sheet has its own walkthrough', (await pa.locator('.tour-card h2').innerText()) === 'The daily copies' && /last 12 months/.test(await pa.locator('.tour-card h2 + p').innerText()));
  await pa.keyboard.press('Escape'); await sleep(200);
  await pa.locator(`${sheetOf('Bring back a daily copy')} .se-bk-copy`, { hasText: labels.day }).click();
  await pa.waitForSelector(`${sheetOf('Bring back a backup')} .se-imp-replace`, { timeout: 10000 });
  const chooser = await pa.locator(sheetOf('Bring back a backup')).innerText();
  ok('a daily copy opens the same chooser as a backup file', /In the copy:/.test(chooser) && /Merge into this device/.test(chooser) && /Every device connected to this Google Drive ends up exactly like this copy/.test(chooser), chooser.replace(/\s+/g, ' ').slice(0, 300));
  await pa.click(`${sheetOf('Bring back a backup')} .se-imp-replace`); // the confirm is accepted, once Drive has been read
  await pa.waitForSelector(sheetOf('Bring back a backup'), { state: 'detached', timeout: 10000 }).catch(() => {});
  await sleep(300);
  ok('Replace makes this device exactly like the copy', !(await data(pa)).acts.some(a => a.id === 'a-after') && /Every device connected to this Google Drive follows/.test(await toasts(pa)));
  ok('…and reaches Drive', !!(await until(() => !D.json().acts.some(a => a.id === 'a-after'))));
  await syncOn(pb);
  ok('…and the other device at its next sync', !(await data(pb)).acts.some(a => a.id === 'a-after'));
  await syncOn(pa); await syncOn(pb);
  ok('…and it does not come back', !(await data(pa)).acts.some(a => a.id === 'a-after') && !(await data(pb)).acts.some(a => a.id === 'a-after'));
  await closeSheets(pa);

  /* ------------------------------ a record deleted by mistake, brought back by Merge ------------------------------ */
  // The daily copies are there to undo mistakes: Merge from one offers to bring back the records deleted here since that
  // copy (ticked for a daily copy, not for a backup file, whose deletions stay unless asked), keeps everything else, and
  // the other devices follow.
  {
    const D5 = fakeDrive();
    const K = await device(browser, D5, { who: 'K' }); all.push(K);
    const L = await device(browser, D5, { who: 'L' }); all.push(L);
    const pk = K.page, pl = L.page;
    await pk.evaluate(() => import('./js/store.js').then(s => s.upsert('bookings', { id: 'keep-me', kind: 'show', status: 'confirmed', date: '2026-12-05', title: 'Keep me' })));
    await connect(pk); await waitCloud(pk, 'synced'); await closeSheets(pk);
    await connect(pl); await waitCloud(pl, 'synced'); await closeSheets(pl);
    await until(() => D5.named(weekdayName()).length);
    const dayCopy = D5.named(weekdayName())[0].body;
    ok('(today’s copy holds the booking)', JSON.parse(dayCopy).bookings.some(b => b.id === 'keep-me'));
    await pk.evaluate(() => import('./js/store.js').then(s => s.remove('bookings', 'keep-me'))); // the mistake
    await pl.evaluate(() => import('./js/store.js').then(s => s.upsert('venues', { id: 'v-later', name: 'Added after the copy' })));
    await sleep(1500); await syncOn(pl); await syncOn(pk);
    ok('(the booking is deleted here and in Drive; the other device’s later venue is here)', !(await data(pk)).bookings.some(b => b.id === 'keep-me') && !D5.json().bookings.some(b => b.id === 'keep-me') && (await data(pk)).venues.some(v => v.id === 'v-later'));
    // a backup file holding it: its deletions stay unless asked
    await openBackups(pk);
    await pk.setInputFiles(`${sheetOf('Backups')} .se-bk-input`, { name: 'tourbook-backup-today.json', mimeType: 'application/json', buffer: Buffer.from(dayCopy) });
    await pk.waitForSelector(`${sheetOf('Bring back a backup')} .se-imp-merge`, { timeout: 10000 });
    const fileChooser = (await pk.locator(sheetOf('Bring back a backup')).innerText()).replace(/\s+/g, ' ');
    const fileBox = pk.locator(`${sheetOf('Bring back a backup')} .se-imp-revive input`);
    ok('a backup file holding a record deleted here since: the chooser names it, with Also bring back, not ticked', (await fileBox.count()) === 1 && !(await fileBox.isChecked()) && /Also bring back the 1 record deleted on this device since this backup: “Keep me”\./.test(fileChooser) && !/Keeps everything on both/.test(fileChooser), fileChooser);
    await pk.click(`${sheetOf('Bring back a backup')} .se-imp-merge`);
    await sleep(400);
    ok('…and Merge without it keeps the deletion and says so, rather than “already had all of it”', !(await data(pk)).bookings.some(b => b.id === 'keep-me') && /Merged\. Nothing changed: the 1 record in that backup deleted on this device since stays deleted\./.test(await toasts(pk)) && !/already had all of it/.test(await toasts(pk)), await toasts(pk));
    // the daily copy: ticked
    await pk.click(`${sheetOf('Backups')} .se-bk-drive-restore`);
    await pk.waitForSelector(`${sheetOf('Bring back a daily copy')} .se-bk-copy`, { timeout: 10000 });
    await pk.locator(`${sheetOf('Bring back a daily copy')} .se-bk-copy`).first().click();
    await pk.waitForSelector(`${sheetOf('Bring back a backup')} .se-imp-merge`, { timeout: 10000 });
    const copyBox = pk.locator(`${sheetOf('Bring back a backup')} .se-imp-revive input`);
    ok('a daily copy: Also bring back is ticked', (await copyBox.count()) === 1 && (await copyBox.isChecked()) && /Also bring back the 1 record deleted on this device since this copy: “Keep me”\./.test(await pk.locator(sheetOf('Bring back a backup')).innerText()));
    await pk.click(`${sheetOf('Bring back a backup')} .se-imp-merge`);
    await sleep(400);
    const back = await data(pk);
    ok('Merge from the daily copy brings the deleted booking back and keeps everything else', back.bookings.some(b => b.id === 'keep-me') && back.venues.some(v => v.id === 'v-later') && /Merged: 1 brought back \(deleted here since that copy\), 0 new, 0 updated\./.test(await toasts(pk)), await toasts(pk));
    ok('…and it reaches Drive and the other device', !!(await until(() => D5.json().bookings.some(b => b.id === 'keep-me'))) && (await syncOn(pl), (await data(pl)).bookings.some(b => b.id === 'keep-me') && (await data(pl)).venues.some(v => v.id === 'v-later')));
    await syncOn(pk); await syncOn(pl); await syncOn(pk);
    ok('…and stays, round after round', (await data(pk)).bookings.some(b => b.id === 'keep-me') && (await data(pl)).bookings.some(b => b.id === 'keep-me'));
    await closeSheets(pk);
    await K.ctx.close(); await L.ctx.close();
  }

  /* ------------------------------ Disconnect, Delete, Erase ------------------------------ */
  const nFiles = D.files.length, beforeA = (await data(pa)).bookings.length;
  await openBackups(pa);
  await pa.click(`${sheetOf('Backups')} .se-bk-drive-off`);
  await pa.waitForSelector(`${sheetOf('Backups')} .se-bk-drive[data-state=off]`, { timeout: 10000 });
  ok('…the focus moves to Connect Google Drive…, not to the page’s start', /se-bk-drive-connect/.test(await focused(pa)), await focused(pa));
  ok('Disconnect stops syncing here and keeps both copies', D.files.length === nFiles && (await data(pa)).bookings.length === beforeA && !(await pa.evaluate(() => localStorage.getItem('tourbook-drive') || localStorage.getItem('tourbook-google-tokens') || localStorage.getItem('tourbook-drive-file'))) && (await cloudState(pa))[0] === '');
  const writesAfter = D.writes('A');
  await pa.evaluate(() => import('./js/store.js').then(s => s.upsert('songs', { id: 'a-off', title: 'Not Copied' })));
  await sleep(1500);
  ok('…and nothing more is copied', D.writes('A') === writesAfter && !D.json().songs.some(s => s.id === 'a-off'));
  await closeSheets(pa);

  const beforeB = (await data(pb)).bookings.length;
  await openBackups(pb);
  await pb.click(`${sheetOf('Backups')} .se-bk-drive-delete`); // the confirm is accepted
  await pb.waitForSelector(`${sheetOf('Backups')} .se-bk-drive[data-state=off]`, { timeout: 10000 });
  ok('Delete Tourbook’s copy removes every file from Drive and disconnects', D.files.length === 0 && !(await state(pb)).linked);
  ok('…and the focus moves to Connect Google Drive…', /se-bk-drive-connect/.test(await focused(pb)), await focused(pb));
  ok('…and this device keeps everything', (await data(pb)).bookings.length === beforeB && beforeB > 0);
  await closeSheets(pb);

  await connect(pa);
  await waitCloud(pa, 'synced');
  await closeSheets(pa);
  ok('connecting again puts this device’s copy back', D.json() && D.json().songs.some(s => s.id === 'a-off'));
  const copyBefore = D.named('tourbook-db.json')[0].body, writesBefore = D.writes();
  await pa.evaluate(() => window.logiGo('settings')); await sleep(400);
  await pa.evaluate(() => { const d = document.getElementById('se-erase'); if (d && !d.open) d.open = true; });
  await pa.fill('#se-erase-input', 'ERASE');
  await Promise.all([pa.waitForNavigation({ timeout: 15000 }), pa.click('#se-erase-go')]); // Erase reloads Tourbook
  await pa.waitForSelector('#deck .dk-next');
  await sleep(1500);
  ok('Erase disconnects Google Drive first', !(await state(pa)).linked && !(await pa.evaluate(() => localStorage.getItem('tourbook-drive'))));
  ok('…and the copy in Drive is left exactly as it was', D.named('tourbook-db.json')[0].body === copyBefore && D.writes() === writesBefore && (await data(pa)).bookings.length === 0);

  /* ------------------------------ Erase with changes Google Drive lacks ------------------------------ */
  // Before it erases, Tourbook copies this device's last changes to Drive (signing in again from the tap when Google's hour
  // is up). When it can't, nothing is erased yet: the warning says what Drive lacks, with a way to send it and Save a
  // backup, and only a second tap (Erase anyway) erases.
  {
    const D4 = fakeDrive();
    const openErase = async p => { await p.evaluate(() => window.logiGo('settings')); await sleep(400); await p.evaluate(() => { const d = document.getElementById('se-erase'); if (d && !d.open) d.open = true; }); };
    const has = (doc, id) => !!doc && (doc.bookings || []).some(b => b.id === id);
    const G = await device(browser, D4, { who: 'G' }); all.push(G);
    const pg = G.page;
    await pg.evaluate(() => import('./js/store.js').then(s => s.upsert('bookings', { id: 'g-old', kind: 'show', date: '2026-12-01', title: 'Synced long ago' })));
    await connect(pg); await waitCloud(pg, 'synced'); await closeSheets(pg);
    await pg.evaluate(() => Promise.all([import('./js/drive.js'), import('./js/sync.js')]).then(([d, s]) => { d.forgetGoogleToken(); return s.sync({ quiet: true }); }));
    await pg.evaluate(() => import('./js/store.js').then(s => { for (const i of [1, 2, 3]) s.upsert('bookings', { id: 'g-new' + i, kind: 'show', date: `2026-12-0${i + 1}`, title: 'New ' + i }); }));
    await sleep(1200);
    ok('(Google’s hour is up and three bookings were made since: Drive lacks them)', (await state(pg)).status === 'needs-permission' && !has(D4.json(), 'g-new1'));
    await openErase(pg);
    const warnG = (await pg.locator('#se-erase-warn').innerText()).replace(/\s+/g, ' ');
    ok('the erase warning says this device’s last changes go to Google Drive first', /Google Drive gets this device’s last changes first/.test(warnG) && !/Google Drive is disconnected on this device first/.test(warnG), warnG);
    const logG = D4.log.length;
    await pg.fill('#se-erase-input', 'ERASE');
    await Promise.all([pg.waitForNavigation({ timeout: 15000 }), pg.click('#se-erase-go')]); // Erase reloads Tourbook
    await pg.waitForSelector('#deck .dk-next');
    await sleep(500);
    ok('Erase signs in again from the tap and copies the changes Drive lacked before it erases', ['g-old', 'g-new1', 'g-new2', 'g-new3'].every(id => has(D4.json(), id)) && D4.log.slice(logG).some(l => l.who === 'G' && l.method === 'PATCH' && l.name === 'tourbook-db.json'), (D4.json().bookings || []).map(b => b.id).join());
    ok('…then disconnects Drive and erases this device', !(await state(pg)).linked && (await data(pg)).bookings.length === 0);

    const H2 = await device(browser, D4, { who: 'H' }); all.push(H2);
    const ph = H2.page;
    await connect(ph); await waitCloud(ph, 'synced'); await closeSheets(ph);
    H2.allow.push(/ERR_FAILED/);
    D4.fail = { abort: true, keep: true, match: r => r.who === 'H' };
    await ph.evaluate(() => import('./js/store.js').then(s => s.upsert('bookings', { id: 'h-off', kind: 'show', date: '2026-12-09', title: 'Made offline' })));
    await sleep(1200);
    ok('(no internet: the new booking is not in Drive)', (await state(ph)).status === 'error' && !has(D4.json(), 'h-off'));
    await openErase(ph);
    await ph.fill('#se-erase-input', 'ERASE');
    await ph.click('#se-erase-go');
    await ph.waitForSelector('.se-erase-behind', { timeout: 10000 }).catch(() => {});
    const behind = (await ph.locator('#se-erase').innerText()).replace(/\s+/g, ' ');
    ok('Erase with no internet erases nothing yet: this device keeps the booking Drive lacks', (await data(ph)).bookings.some(b => b.id === 'h-off') && (await state(ph)).linked);
    ok('…and says what Drive lacks and why, with Try again and Save a backup, and Erase anyway', /What you changed on this device since .+? isn’t in your Google Drive yet\. Can’t reach Google Drive \(no internet\?\)/.test(behind) && /Erase now and those changes are lost/.test(behind) && (await ph.locator('.se-erase-behind .se-erase-sync').innerText()) === 'Try again' && (await ph.locator('.se-erase-behind .se-erase-save').count()) === 1 && (await ph.locator('#se-erase-go').innerText()) === 'Erase anyway', behind);
    D4.fail = null;
    await ph.click('.se-erase-behind .se-erase-sync');
    await ph.waitForSelector('.se-erase-behind', { state: 'detached', timeout: 10000 }).catch(() => {});
    ok('Try again, back online, copies it to Drive: the warning goes and the button is Erase this device again', has(D4.json(), 'h-off') && (await ph.locator('.se-erase-behind').count()) === 0 && (await ph.locator('#se-erase-go').innerText()) === 'Erase this device' && /Google Drive has everything from this device now\./.test(await toasts(ph)));
    D4.fail = { abort: true, keep: true, match: r => r.who === 'H' };
    await ph.evaluate(() => import('./js/store.js').then(s => s.upsert('bookings', { id: 'h-off2', kind: 'show', date: '2026-12-10', title: 'Also offline' })));
    await sleep(1200);
    await ph.click('#se-erase-go');
    await ph.waitForSelector('.se-erase-behind', { timeout: 10000 }).catch(() => {});
    await Promise.all([ph.waitForNavigation({ timeout: 15000 }), ph.click('#se-erase-go')]);
    await ph.waitForSelector('#deck .dk-next');
    D4.fail = null;
    ok('…and Erase anyway, after the warning, erases', (await data(ph)).bookings.length === 0 && !(await state(ph)).linked && has(D4.json(), 'h-off') && !has(D4.json(), 'h-off2'));
    H2.allow.pop();
  }

  /* ------------------------------ two tabs: Erase in one ------------------------------ */
  // Every tab keeps the database in memory and writes it whole: another tab takes in what one writes, so an Erase (or a
  // Disconnect) in one tab is not undone by the next change in another, which also shows Drive disconnected.
  {
    const D7 = fakeDrive();
    const T = await device(browser, D7, { who: 'T' }); all.push(T);
    const t1 = T.page;
    await t1.evaluate(() => import('./js/store.js').then(s => { for (const i of [1, 2, 3, 4]) s.upsert('venues', { id: 'tv' + i, name: 'Venue ' + i }); }));
    await connect(t1); await waitCloud(t1, 'synced'); await closeSheets(t1);
    const t2 = await T.ctx.newPage(); // a second tab: the same storage
    t2.on('pageerror', e => T.errors.push(e.message));
    t2.on('console', m => { if (m.type() === 'error') T.errors.push(m.text()); });
    t2.on('dialog', d => d.accept());
    await t2.goto(BASE); await t2.waitForSelector('#deck .dk-next');
    await t2.evaluate(() => import('./js/backup.js'));
    ok('(both tabs are connected to Google Drive)', await waitCloud(t2, 'synced') && (await data(t2)).venues.length === 4);
    await t1.evaluate(() => window.logiGo('settings')); await sleep(400);
    await t1.evaluate(() => { const d = document.getElementById('se-erase'); if (d && !d.open) d.open = true; });
    await t1.fill('#se-erase-input', 'ERASE');
    await Promise.all([t1.waitForNavigation({ timeout: 15000 }), t1.click('#se-erase-go')]);
    await t1.waitForSelector('#deck .dk-next');
    await t2.evaluate(() => import('./js/store.js').then(s => s.upsert('songs', { id: 't2-song', title: 'After the erase' })));
    await sleep(1200);
    const saved = await t1.evaluate(() => JSON.parse(localStorage.getItem('tourbook-db-v1')));
    ok('Erase in one tab stays erased after a change in another open tab', saved.venues.length === 0 && saved.songs.some(x => x.id === 't2-song') && (await data(t2)).venues.length === 0, `venues kept: ${saved.venues.length}`);
    ok('…and the other tab shows Google Drive disconnected, and sends nothing to Drive', !(await state(t2)).linked && (await cloudState(t2))[0] === '' && !D7.json().songs.some(x => x.id === 't2-song'), JSON.stringify(await state(t2)));
    await T.ctx.close();
  }

  /* ------------------------------ Google's token goes once its hour is over ------------------------------ */
  {
    const V = await device(browser, fakeDrive(), { who: 'V' }); all.push(V);
    const pv = V.page;
    await connect(pv); await waitCloud(pv, 'synced'); await closeSheets(pv);
    await pv.evaluate(() => { const t = JSON.parse(localStorage.getItem('tourbook-google-tokens')); localStorage.setItem('tourbook-google-tokens', JSON.stringify({ ...t, exp: Date.now() - 5 * 864e5 })); }); // five days on
    await syncOn(pv);
    ok('a token whose hour is over is removed from the device at the next look, not kept until the next sign-in', (await state(pv)).status === 'needs-permission' && (await pv.evaluate(() => localStorage.getItem('tourbook-google-tokens'))) === null && (await pv.evaluate(() => localStorage.getItem('tourbook-google-email'))) === 'gee@example.com');
    await V.ctx.close();
  }

  /* ------------------------------ Google's sign-in script not loading ------------------------------ */
  {
    const E = await device(browser, fakeDrive(), { who: 'E' }); all.push(E);
    const pe = E.page, cs = sheetOf('Connect Google Drive'), GSI = 'https://accounts.google.com/gsi/client';
    const block = r => r.abort('failed');
    await E.ctx.route(GSI, block); // over the stand-in script: no answer at all, as with no connection
    E.allow.push(/ERR_FAILED/);
    await openBackups(pe);
    await pe.click(`${sheetOf('Backups')} .se-bk-drive-connect`);
    await pe.waitForSelector(`${cs} .se-bk-drive-retry:not([hidden])`, { timeout: 10000 });
    ok('Google’s sign-in not loading says so in the connect sheet, with Try again, and Continue waits', (await pe.locator(`${cs} .se-bk-drive-err`).innerText()) === 'Couldn’t load Google’s sign-in. Check the connection and try again.' && (await pe.locator(`${cs} .se-bk-drive-load`).isHidden()) && (await pe.locator(`${cs} .se-bk-drive-go`).isDisabled()));
    await E.ctx.unroute(GSI, block);
    await pe.click(`${cs} .se-bk-drive-retry`);
    await pe.waitForSelector(`${cs} .se-bk-drive-go:not([disabled])`, { timeout: 10000 });
    ok('…and Try again loads it: Continue is ready and the message goes', (await pe.locator(`${cs} .se-bk-drive-err`).isHidden()) && (await pe.locator(`${cs} .se-bk-drive-load`).isHidden()) && (await pe.locator(`${cs} .se-bk-drive-retry`).isHidden()));
    await pe.click(`${cs} .sheet-help`);
    await pe.waitForSelector('.tour-card h2', { timeout: 10000 });
    const c1 = await pe.locator('.tour-card h2').innerText();
    await pe.keyboard.press('ArrowRight');
    await until(async () => (await pe.locator('.tour-card h2').innerText()) !== c1);
    ok('the connect sheet has its own walkthrough: what Drive does, then Continue with Google', c1 === 'What Drive does' && (await pe.locator('.tour-card h2').innerText()) === 'Continue with Google');
    await pe.keyboard.press('Escape'); await sleep(200);
    await pe.click(`${cs} .btn.ghost:has-text("Not now")`);
    await pe.waitForSelector(cs, { state: 'detached', timeout: 10000 });
    ok('Not now closes the sheet: nothing linked and Google Drive never contacted', !(await state(pe)).linked && !E.hosts.some(x => /googleapis/.test(x)) && E.hosts.every(x => x === 'accounts.google.com/gsi/client'), E.hosts.join(' '));
    await closeSheets(pe);
    await E.ctx.close();
  }

  /* ------------------------------ a first sync that fails, then Not now ------------------------------ */
  {
    const D3 = fakeDrive();
    const F = await device(browser, D3, { who: 'F' }); all.push(F);
    const pf = F.page, cs = sheetOf('Connect Google Drive');
    F.allow.push(/status of 500/);
    D3.fail = { status: 500, match: r => r.method === 'GET' && r.path === '/drive/v3/files' };
    await connect(pf);
    ok('a first sync that fails says why in the connect sheet and leaves nothing linked', /an error from Google \(500\)/.test(await pf.locator(`${cs} .se-bk-drive-err`).innerText()) && !(await state(pf)).linked && !(await pf.evaluate(() => localStorage.getItem('tourbook-drive') || localStorage.getItem('tourbook-google-tokens'))));
    await pf.click(`${cs} .btn.ghost:has-text("Not now")`);
    await pf.waitForSelector(cs, { state: 'detached', timeout: 10000 });
    ok('…and Not now gives the focus back to Connect Google Drive…, though the card was redrawn meanwhile', /se-bk-drive-connect/.test(await focused(pf)), await focused(pf));
    await closeSheets(pf);
    await F.ctx.close();
  }

  /* ------------------------------ the earliest free day, carried by Drive ([S-39]) ------------------------------ */
  {
    const D2 = fakeDrive();
    const DAY = 864e5, t0 = Date.now();
    const fromA = t0 - 40 * DAY;
    const A2 = await device(browser, D2, { who: 'A2', standIn: STAND_IN, seed: { 'tourbook-licence': { first: fromA, seen: t0 }, 'tourbook-role': 'band', 'tourbook-terms': { v: TERMS_V, at: t0 } } }); all.push(A2);
    await connect(A2.page);
    await waitCloud(A2.page, 'synced');
    ok('the Drive copy holds the start of this device’s free days', D2.json().freeDaysFrom === fromA, String(D2.json().freeDaysFrom));
    ok('…as the last field, after the database’s own', Object.keys(D2.json()).pop() === 'freeDaysFrom');
    const B2 = await device(browser, D2, { who: 'B2', standIn: STAND_IN, seed: { 'tourbook-licence': { first: t0, seen: t0 }, 'tourbook-role': 'band', 'tourbook-terms': { v: TERMS_V, at: t0 } } }); all.push(B2);
    const before = await B2.page.evaluate(() => import('./js/store.js').then(s => s.update(() => {})));
    await connect(B2.page);
    await waitCloud(B2.page, 'synced');
    const b2 = await B2.page.evaluate(() => import('./js/store.js').then(s => ({ first: JSON.parse(localStorage.getItem('tourbook-licence')).first, write: s.update(() => {}), field: 'freeDaysFrom' in JSON.parse(localStorage.getItem('tourbook-db-v1')) })));
    ok('a fresh device that links the same Drive counts from the earliest start: its paid role is read-only', before === true && b2.first === fromA && b2.write === false, JSON.stringify(b2));
    ok('…and its own database never holds the field', b2.field === false);
    const C2 = await device(browser, D2, { who: 'C2', standIn: STAND_IN, seed: { 'tourbook-role': 'audiophile' } }); all.push(C2);
    await connect(C2.page);
    await waitCloud(C2.page, 'synced');
    ok('a device that had not started its free days takes the start too', (await C2.page.evaluate(() => JSON.parse(localStorage.getItem('tourbook-licence') || '{}').first)) === fromA);
    // a later start written into Drive by hand is not taken, and the earlier one is written back
    const doc = D2.json(); doc.freeDaysFrom = t0 - DAY; D2.named('tourbook-db.json')[0].body = JSON.stringify(doc, null, 2);
    await syncOn(B2.page);
    ok('a later start in Drive is not taken, and Drive gets the earlier one back', (await B2.page.evaluate(() => JSON.parse(localStorage.getItem('tourbook-licence')).first)) === fromA && D2.json().freeDaysFrom === fromA);
    const w = D2.writes();
    await syncOn(B2.page); await syncOn(A2.page); await syncOn(C2.page); await syncOn(B2.page);
    ok('…and once all agree, syncing writes nothing more', D2.writes() === w, `${D2.writes()} vs ${w}`);
    for (const d of [A2, B2, C2]) await d.ctx.close();
  }

  /* ------------------------------ a clock off Google's time (the lead's decision 3) ------------------------------ */
  {
    // Google's time comes from the file just written (its modifiedTime) or an answer's Date header. More than about two
    // minutes off, the Drive card says so in plain words and suggests letting the clock set itself: a slow clock can lose
    // this device's changes and deletions in a merge, a fast one the other devices'.
    const D3 = fakeDrive();
    const C3 = await device(browser, D3, { who: 'C3', sample: true }); all.push(C3);
    const pc = C3.page;
    const clockLine = async () => { await openBackups(pc); const l = pc.locator(`${sheetOf('Backups')} .se-bk-drive .se-bk-drive-clock`); return (await l.count()) ? (await l.innerText()) : ''; };
    const change = async (id, name) => { await closeSheets(pc); await pc.evaluate(([i, n]) => import('./js/store.js').then(s => s.upsert('venues', { id: i, name: n })), [id, name]); await until(() => (D3.json() || { venues: [] }).venues.some(v => v.id === id)); await waitCloud(pc, 'synced'); await sleep(200); };
    await connect(pc); await waitCloud(pc, 'synced');
    ok('the writes ask Google for the file’s modifiedTime', D3.log.filter(l => l.who === 'C3' && (l.method === 'PATCH' || l.method === 'POST')).length > 0);
    ok('this device and Google agree on the time: no clock line on the Drive card', (await clockLine()) === '');
    D3.ahead = 7 * 60e3; // Google 7 minutes ahead: this device's clock is slow
    await change('t-clock1', 'Clock Hall');
    const slow = await clockLine();
    ok('a clock 7 minutes slow: the card says so in plain words, what it can lose, and to let the clock set itself', slow === '⚠ This device’s clock is about 7 minutes behind Google’s. Tourbook keeps the newest change of each record when it syncs, so with a slow clock what you change or delete here can be undone. Set this device’s date and time to set themselves automatically.', slow);
    ok('…in the warning colour, under the line that says how the sync went, and read out as it appears', await pc.evaluate(() => {
      const p = document.querySelector('.sheet .se-bk-drive .se-bk-drive-clock'), t = document.createElement('span'); t.style.color = 'var(--danger)'; document.body.append(t);
      const want = getComputedStyle(t).color; t.remove();
      return !!p && p.getAttribute('role') === 'status' && getComputedStyle(p).color === want && p.previousElementSibling === document.querySelector('.sheet .se-bk-drive .se-bk-drive-line');
    }));
    D3.ahead = -3 * 3600e3; // Google 3 hours behind: this device's clock is fast
    await change('t-clock2', 'Clock Tower');
    const fast = await clockLine();
    ok('a clock 3 hours fast: it says ahead, and what the other devices can lose', fast === '⚠ This device’s clock is about 3 hours ahead of Google’s. Tourbook keeps the newest change of each record when it syncs, so with a fast clock what you change on your other devices can be undone. Set this device’s date and time to set themselves automatically.', fast);
    D3.ahead = 45e3; // within two minutes: nothing to say
    await change('t-clock3', 'Clock Inn');
    ok('within two minutes of Google’s time the line goes', (await clockLine()) === '');
    // A sync that writes nothing: the Date header of Google's answers, where the page may read it.
    D3.ahead = 10 * 60e3; D3.dateHeader = true;
    await closeSheets(pc);
    const w = D3.writes('C3');
    await syncOn(pc); await sleep(200);
    const byHeader = await clockLine();
    ok('a sync that writes nothing reads Google’s time from its answers’ Date header: 10 minutes behind', D3.writes('C3') === w && /^⚠ This device’s clock is about 10 minutes behind Google’s\./.test(byHeader), byHeader);
    await closeSheets(pc);
    await C3.ctx.close();
  }

  const errs = all.flatMap(d => d.errors.map(e => `${d.who}: ${e}`));
  ok('no errors in the console', errs.length === 0, errs.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL drive crashed — ' + (e && e.stack || e)); process.exit(1); });
