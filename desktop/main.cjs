// Tourbook desktop: the web app in its own window. The app is served from a small local web server at
// http://localhost:47861 so it behaves exactly as it does in Chrome: saved data, the microphone, Google's sign-in.
//
// Only Tourbook's own window gets the app (the build spec [S-42]): each run makes a random key that the main process adds
// to every request the window makes (the X-Tourbook-App header), and the server refuses anything without it. So the same
// address opened in a web browser loads nothing, and a licence-free copy of the app cannot be had from it. The one
// exception is Google's sign-in page, which opens in the web browser on purpose and has its own one-time keys.
'use strict';
const { app, BrowserWindow, Menu, dialog, screen, session, shell, ipcMain } = require('electron');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');            // the web app (inside app.asar once packaged)
// Part of the address the browser stores data under, and one of the JavaScript origins of Tourbook's Google client: it
// never changes once released. The fallbacks are used only while another program holds it, and stay clear of Vdex's
// 47831-47850.
const DEFAULT_PORT = 47861, LAST_PORT = 47880;
const GUIDE = 'https://tourbook.crowmade.app/';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.ics': 'text/calendar; charset=utf-8',
};
// Test hooks, read only in a development run (never in an installed app): TOURBOOK_TEST_PROFILE (a data folder of its
// own), TOURBOOK_TEST_NO_BROWSER (record addresses instead of opening the web browser), TOURBOOK_TEST_NET_WATCH (record every
// host asked for and every permission asked), TOURBOOK_LICENCE_SITE (a local stand-in for the licence server) and
// TOURBOOK_TEST_LICENCE_KEYS (public keys as JSON: licences on, with them, whatever desktop/licence-on.json says).
const DEV = !app.isPackaged;
const env = name => (DEV ? process.env[name] || '' : '');

// Who this is, before anything reads the data folder: the name decides it (%APPDATA%\Tourbook, ~/Library/Application
// Support/Tourbook, ~/.config/Tourbook), and a run started as "electron desktop/main.cjs" would otherwise be called Electron
// and share a folder with any other Electron app run that way.
app.setName('Tourbook');
if (env('TOURBOOK_TEST_PROFILE')) app.setPath('userData', env('TOURBOOK_TEST_PROFILE'));
else if (path.basename(app.getPath('userData')) !== 'Tourbook') app.setPath('userData', path.join(app.getPath('appData'), 'Tourbook'));
app.setAppUserModelId('app.tourbook.desktop'); // Windows attributes the taskbar and notifications to Tourbook (= build.appId)
// One Tourbook at a time: a second start brings the first one's window forward and quits without opening anything.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();

const { initUpdater } = require('./updater.cjs');
const { wireLicence, SITE } = require('./licence.cjs');

const APP_KEY = crypto.randomBytes(24).toString('base64url'); // this run's key for Tourbook's own window ([S-42])
let win = null;
let origin = '';
let port = 0;
let busy = null; // set when the usual port was taken and another had to be used
let loopbackShared = false; // set when another program holds the IPv6 side of our address: sign-ins could reach it, so they are refused
let shop = SITE + '/buy';

if (env('TOURBOOK_TEST_NET_WATCH')) { global.__tourbookHosts = new Set(); global.__tourbookPermissions = []; }
const watchPermission = (via, permission, granted, extra) => { if (global.__tourbookPermissions && global.__tourbookPermissions.length < 500) global.__tourbookPermissions.push({ via, permission, granted, ...extra }); };

/* ------------------------------ links and the browser ------------------------------ */
// Opens an address in the person's web browser (or mail program, phone app…); a test run only records it.
const openOut = url => { global.__tourbookLastExternal = url; if (!env('TOURBOOK_TEST_NO_BROWSER')) shell.openExternal(url).catch(() => {}); };
const external = url => { try { const u = new URL(url); if (['http:', 'https:', 'mailto:', 'tel:', 'sms:'].includes(u.protocol)) openOut(u.href); } catch { /* not a link */ } };
const isOurs = url => !!origin && (url === origin || url.startsWith(origin + '/'));
// The shop is the website's (the Worker's /buy): a link to it from a page inside the app opens the web browser.
const isShop = url => { try { const u = new URL(url); return u.origin === origin && u.pathname === '/buy'; } catch { return false; } };
const fromApp = e => { try { return isOurs(new URL(e.senderFrame.url).origin); } catch { return false; } };

/* --------------------------------- Google's sign-in --------------------------------- */
// Google asks apps not to show its sign-in in an app window, so it opens in the person's own web browser, at this
// app's address (which Google knows as one of Tourbook's JavaScript origins), and the answer comes back to this server.
const pagePending = new Map();    // one-time code -> a sign-in page waiting in the web browser
const signinSafe = () => !busy && !loopbackShared; // only at the usual address, held entirely by Tourbook
function bringBack() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function googlePage(res, nonce, { client, scope, hint, key }) {
  const sn = crypto.randomBytes(16).toString('base64');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${sn}' https://accounts.google.com/gsi/client; style-src 'unsafe-inline' https://accounts.google.com/gsi/style; frame-src https://accounts.google.com/gsi/; connect-src 'self' https://accounts.google.com/gsi/; img-src https: data:; base-uri 'none'; form-action 'none'` });
  const cfg = JSON.stringify({ client, scope, hint: hint || '', nonce, key }).replace(/</g, '\\u003c');
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in to Google for Tourbook</title>
<body style="font:17px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;text-align:center"><h1 style="font-size:1.4rem">Sign in to Google for Tourbook</h1>
<p id="t">Click the button, sign in and click Allow. Tourbook only uses its own private folder of your Google Drive.</p>
<button id="go" style="font:inherit;font-weight:700;padding:12px 22px;border-radius:10px;border:0;background:#1a73e8;color:#fff;cursor:pointer" disabled>Continue with Google</button>
<script nonce="${sn}" src="https://accounts.google.com/gsi/client"></script>
<script nonce="${sn}">
const C = ${cfg}, t = document.getElementById('t'), go = document.getElementById('go');
const send = r => fetch('/__tourbook/google?n=' + encodeURIComponent(C.nonce), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tourbook-Key': C.key }, body: JSON.stringify(r) })
  .then(x => { go.hidden = true; if (!x.ok) { t.textContent = 'This sign-in has expired, or a newer one took over. Go back to Tourbook and tap Connect again. You can close this tab.'; return; } t.textContent = r.error ? 'Sign-in not finished. Go back to Tourbook and tap Connect to try again. You can close this tab.' : 'Done. Go back to Tourbook; you can close this tab.'; })
  .catch(() => { t.textContent = 'Tourbook has closed, or this sign-in has expired. Open Tourbook and try again.'; });
const ready = () => { go.disabled = false; go.onclick = () => google.accounts.oauth2.initTokenClient({ client_id: C.client, scope: C.scope, callback: r => send(r), error_callback: e => send({ error: e.type || 'failed' }) }).requestAccessToken(C.hint ? { prompt: '', login_hint: C.hint } : { prompt: '' }); };
window.google && google.accounts ? ready() : addEventListener('load', ready);
</script></body>`);
}
// Only a Google client id, the one scope Tourbook uses (its hidden app folder in Drive, the build spec §3.10: never the
// person's other files) and an address-like hint go into the page.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const googleOpts = o => {
  const client = String((o && o.client) || ''), scope = String((o && o.scope) || '').trim(), hint = String((o && o.hint) || '');
  if (!/^[A-Za-z0-9._-]{1,200}\.apps\.googleusercontent\.com$/.test(client) || scope !== DRIVE_SCOPE || hint.length > 320) return null;
  return { client, scope, hint };
};
ipcMain.handle('signin:google', (e, opts = {}) => new Promise(resolve => {
  if (!fromApp(e)) return resolve({ error: 'refused' });
  if (!signinSafe()) return resolve({ error: 'address_taken' });
  const o = googleOpts(opts); if (!o) return resolve({ error: 'refused' });
  waitForPage(o, resolve);
}));
// One sign-in page at a time: Connect tapped again replaces the one still waiting. It expires after five minutes.
function waitForPage(opts, resolve) {
  for (const p of [...pagePending.values()]) p.resolve({ error: 'replaced' });
  const nonce = crypto.randomBytes(24).toString('base64url');
  const timer = setTimeout(() => { pagePending.delete(nonce); resolve({ error: 'timed_out' }); }, 5 * 60e3);
  pagePending.set(nonce, { opts, resolve: r => { clearTimeout(timer); pagePending.delete(nonce); resolve(r); } });
  openOut(`${origin}/__tourbook/google?n=${encodeURIComponent(nonce)}`);
}

/* ------------------------------- local server ------------------------------- */
const text = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(body); };
// Only requests addressed to this computer's own name for the app (a page elsewhere that points a name of its own at
// 127.0.0.1 is refused).
const hostOk = h => [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(String(h || '').toLowerCase());
function handler(req, res) {
  let u; try { u = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  if (!hostOk(req.headers.host)) return text(res, 403, 'Not here.');
  // Google's sign-in page, in the web browser, and its answer.
  if (u.pathname.startsWith('/__tourbook/')) {
    const p = u.pathname === '/__tourbook/google' && pagePending.get(u.searchParams.get('n') || '');
    if (!p) return text(res, 404, 'This sign-in has expired. Open Tourbook and try again.');
    if (req.method === 'GET') { // served once; the answer must carry the key that only this page was given
      if (p.key) return text(res, 404, 'This sign-in page was already opened. Go back to Tourbook and try again.');
      p.key = crypto.randomBytes(24).toString('base64url');
      return googlePage(res, u.searchParams.get('n'), { ...p.opts, key: p.key });
    }
    if (req.method === 'POST') {
      if (req.headers.origin !== origin || !/^application\/json/.test(req.headers['content-type'] || '') || !p.key || req.headers['x-tourbook-key'] !== p.key) { res.writeHead(403); return res.end(); }
      let body = ''; req.setEncoding('utf8');
      req.on('data', c => { body += c; if (body.length > 65536) req.destroy(); });
      req.on('end', () => { let r; try { r = JSON.parse(body); } catch { r = { error: 'unreadable' }; } p.resolve(r && typeof r === 'object' ? r : { error: 'unreadable' }); res.writeHead(204); res.end(); bringBack(); });
      return;
    }
    res.writeHead(405); return res.end();
  }
  // The licence server's addresses are the website's: the app asks https://tourbook.crowmade.app itself (desktop/licence.cjs).
  if (u.pathname === '/licence' || u.pathname.startsWith('/licence/')) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end('{"error":"not-found"}');
  }
  // The offline worker is for the website only; one installed here by a web browser would answer the sign-in page.
  if (u.pathname === '/sw.js') return text(res, 404, 'Not used in the desktop app');
  // Everything else is the app, for Tourbook's own window only.
  if (req.headers['x-tourbook-app'] !== APP_KEY) return text(res, 403, 'Open Tourbook from its desktop app.');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(u.pathname); } catch { res.writeHead(400); return res.end(); }
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  let file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  if (!path.extname(file)) file = path.join(ROOT, 'index.html'); // share links land on the app shell
  const stream = fs.createReadStream(file);
  stream.on('open', () => {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') { stream.destroy(); res.end(); } else stream.pipe(res);
  });
  stream.on('error', () => text(res, 404, 'Not found'));
}

const listen = (p, host) => new Promise((resolve, reject) => {
  const s = http.createServer(handler);
  s.on('error', reject);
  s.listen(p, host, () => resolve(s));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function startServer() {
  // Saved data belongs to the address, so wait a little for the usual port before falling back to another.
  for (let attempt = 0; attempt < 8; attempt++) {
    try { await listen(DEFAULT_PORT, '127.0.0.1'); return DEFAULT_PORT; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; await sleep(250 * (attempt + 1)); }
  }
  for (let p = DEFAULT_PORT + 1; p <= LAST_PORT; p++) {
    try { await listen(p, '127.0.0.1'); busy = p; return p; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error('No free local port for Tourbook');
}

/* ----------------------------------- window ---------------------------------- */
const stateFile = () => path.join(app.getPath('userData'), 'desktop-state.json');
const readState = () => { try { const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); return s && typeof s === 'object' ? s : {}; } catch { return {}; } };
const writeState = patch => { try { fs.mkdirSync(path.dirname(stateFile()), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify({ ...readState(), ...patch })); } catch { /* ignore */ } };

// Pop-ups: the print window stays inside the app; everything else, the shop and sign-in pages included, goes to the
// web browser.
function policeWindowOpen(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isShop(url)) { external(shop); return { action: 'deny' }; }
    if (!url || url === 'about:blank' || isOurs(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 560, height: 720, autoHideMenuBar: true, backgroundColor: '#ffffff' } };
    external(url);
    return { action: 'deny' };
  });
  contents.on('did-create-window', child => policeWindowOpen(child.webContents));
  // Links the page navigates to itself (maps, tel:, mailto:) open outside.
  contents.on('will-navigate', (e, url) => { if ((isOurs(url) && !isShop(url)) || url === 'about:blank') return; e.preventDefault(); external(isShop(url) ? shop : url); });
}

function createWindow() {
  const saved = readState().bounds;
  const fits = saved && screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return saved.x >= a.x - 20 && saved.y >= a.y - 20 && saved.x + saved.width <= a.x + a.width + 20 && saved.y + saved.height <= a.y + a.height + 20;
  });
  win = new BrowserWindow({
    ...(fits ? saved : { width: 1240, height: 860 }),
    minWidth: 360, minHeight: 600,
    title: 'Tourbook', backgroundColor: '#120f1a', autoHideMenuBar: true, show: false,
    icon: path.join(ROOT, 'icons', 'icon-512.png'),
    // The spellchecker is the system's own on a Mac, and off on Windows and Linux (noDictionaries below).
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: process.platform === 'darwin' },
  });
  if (readState().maximized) win.maximize();
  win.once('ready-to-show', () => {
    win.show();
    if (busy) dialog.showMessageBox(win, {
      type: 'warning', title: 'Tourbook',
      message: `Another program is using the address Tourbook normally runs at on this computer (localhost:${DEFAULT_PORT}).`,
      detail: `Tourbook has opened at localhost:${busy} for now, so it may look empty: your saved data stays with the usual address and comes back once that other program closes and you reopen Tourbook.`,
    });
  });
  win.on('close', () => { writeState({ bounds: win.getNormalBounds(), maximized: win.isMaximized() }); });
  win.on('closed', () => { win = null; });
  policeWindowOpen(win.webContents);
  win.loadURL(origin + '/');
}

// What Tourbook's own pages may use, and nothing for any other page ([S-14]): the microphone (the tuner and the sound
// meter; never the camera), files (a backup kept in a file), copying to the clipboard, full screen, keeping the screen
// on (the set timer and the meter), and on a Mac location (a venue's place, "I'm here now"). Location is refused on
// Windows and Linux: there Chromium asks Google's location service (www.googleapis.com, seen in a development run on
// Linux behind tests/desktop.mjs's recording proxy; Electron documents it needs a Google key on those systems), which
// nobody who never linked Google Drive should contact ([S-16]); a Mac asks the system. Electron 45 asks for the screen
// wake lock as 'screen-wake-lock' (in its typed list of permission names, and seen in a development run with
// TOURBOOK_TEST_NET_WATCH, which records the names asked; tests/desktop.mjs checks the request resolves, so an Electron that
// renames it fails that test).
const ALLOWED = new Set(['media', 'fileSystem', 'clipboard-sanitized-write', 'fullscreen', 'screen-wake-lock', ...(process.platform === 'darwin' ? ['geolocation'] : [])]);
function setPermissions() {
  const ses = session.defaultSession;
  const ours = contents => { try { return isOurs(contents.getURL()); } catch { return false; } };
  ses.setPermissionRequestHandler((contents, permission, callback, details = {}) => {
    const video = permission === 'media' && (details.mediaTypes || []).includes('video');
    const granted = ALLOWED.has(permission) && !video && ours(contents) && (!details.requestingUrl || isOurs(details.requestingUrl));
    watchPermission('request', permission, granted, permission === 'media' ? { mediaTypes: details.mediaTypes || [] } : {});
    callback(granted);
  });
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin, details = {}) => {
    const from = requestingOrigin ? isOurs(requestingOrigin.replace(/\/$/, '')) : contents ? ours(contents) : false;
    const granted = from && ALLOWED.has(permission) && !(permission === 'media' && details.mediaType === 'video');
    watchPermission('check', permission, granted, permission === 'media' ? { mediaType: details.mediaType } : {});
    return granted;
  });
}

// Every request the app's own windows make carries this run's key, so the server can tell them from a web browser.
// No URL filter: match patterns and ports do not mix reliably, and isOurs decides.
function markOwnRequests() {
  session.defaultSession.webRequest.onBeforeSendHeaders((d, cb) => {
    try { if (isOurs(new URL(d.url).origin)) d.requestHeaders['X-Tourbook-App'] = APP_KEY; } catch { /* not a URL */ }
    cb({ requestHeaders: d.requestHeaders });
  });
  if (global.__tourbookHosts) session.defaultSession.webRequest.onBeforeRequest((d, cb) => { try { global.__tourbookHosts.add(new URL(d.url).host); } catch { /* data: and the like */ } cb({}); });
}

function setMenu() {
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'Go to Tourbook', accelerator: 'CmdOrCtrl+Shift+H', click: () => { if (win) win.loadURL(origin + '/'); } },
      { type: 'separator' },
      { role: mac ? 'close' : 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Tourbook website', click: () => openOut(GUIDE) }] },
  ]));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!win && origin) createWindow(); });

// No spellchecker dictionaries from Google ([S-14], [S-16]). On Windows and Linux Electron's session downloads its
// Hunspell dictionaries from redirector.gvt1.com as soon as it starts, even with spellcheck off in the window's
// webPreferences (seen in a development run behind tests/desktop.mjs's recording proxy). No languages stop it (it is
// then off too), and the download address is pointed at nothing on this computer in case a language is ever added.
// A Mac checks spelling with the system's own dictionaries and downloads nothing.
function noDictionaries() {
  if (process.platform === 'darwin') return;
  const ses = session.defaultSession;
  try { ses.setSpellCheckerLanguages([]); } catch { /* no spellchecker in this build */ }
  try { ses.setSpellCheckerEnabled(false); } catch { /* ditto */ }
  try { ses.setSpellCheckerDictionaryDownloadURL('http://127.0.0.1:9/'); } catch { /* ditto */ }
}

app.whenReady().then(async () => {
  if (!primary) return;
  noDictionaries(); // first, before anything waits: the download starts with the session
  try {
    port = await startServer();
    listen(port, '::1').catch(e => { if (e.code === 'EADDRINUSE') loopbackShared = true; }); // IPv6 loopback as well, where the system has it; taken by someone else means no sign-ins
    origin = `http://localhost:${port}`;
  } catch (e) {
    dialog.showErrorBox('Tourbook could not start', String((e && e.message) || e));
    return app.quit();
  }
  markOwnRequests();
  setPermissions();
  setMenu();
  // The licence (desktop/licence.cjs), with a copy of the free days' start in desktop-state.json.
  const site = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(env('TOURBOOK_LICENCE_SITE')) ? env('TOURBOOK_LICENCE_SITE') : '';
  if (site) shop = site + '/buy';
  let testKeys = null; try { testKeys = env('TOURBOOK_TEST_LICENCE_KEYS') ? JSON.parse(env('TOURBOOK_TEST_LICENCE_KEYS')) : null; } catch { /* ignored */ }
  wireLicence({
    ipcMain, fromApp, open: openOut, dir: app.getPath('userData'), getWindow: () => win,
    mirror: { get: () => readState().licence || null, set: v => writeState({ licence: v }) },
    ...(site ? { site } : {}),
    ...(testKeys && typeof testKeys === 'object' ? { keys: testKeys, on: true } : {}),
  });
  createWindow();
  initUpdater(() => win, { fromApp, open: openOut });
});
