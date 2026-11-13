#!/usr/bin/env node
// The desktop app's smoke test: launches the Electron app (under xvfb-run on Linux: `xvfb-run -a npm run
// test:desktop`) against a local stand-in for the licence server, and checks the window, the local server, the bridge,
// the permissions, Google's sign-in page, that Gdex's files are only for its own window, and that nothing but this
// computer is contacted (no Google, no gdex.crowmade.app, no download address) by someone who never linked Drive.
//   1. As built: the licence follows desktop/licence-on.json and desktop/licence-keys.json (off in the repository).
//   2. With throw-away keys (GDEX_TEST_LICENCE_KEYS, read only by a development run): the free days start when the
//      page asks, the start is mirrored in desktop-state.json, and the price comes from the licence server.
// Prints PASS / FAIL lines, and SKIP when Electron is not installed here (FAIL instead when the CI variable is set).
import { createRequire } from 'node:module';
import { createServer, request } from 'node:http';
import { createServer as netServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (name, cond, extra = '') => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 86400e3;

let electronPath = '';
try { require.resolve('electron/package.json', { paths: [repo] }); electronPath = require(require.resolve('electron', { paths: [repo] })); } catch (e) {
  if (process.env.CI) { console.log('FAIL Electron is not installed (npm ci): ' + (e && e.message)); process.exit(1); }
  console.log('SKIP the desktop app’s smoke test: Electron is not installed here (npm install, then xvfb-run -a npm run test:desktop)');
  process.exit(0);
}
const { _electron: electron } = require('playwright');
const codes = require(join(repo, 'desktop', 'licence-codes.cjs'));

// A stand-in for the licence server at gdex.crowmade.app: the price with tax (with the Date header every answer
// carries), and a JSON 404 for everything else. It records what it was asked.
const asked = [];
const stub = createServer((req, res) => {
  asked.push(req.method + ' ' + req.url);
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/licence/price') return res.end(JSON.stringify({ price: '20.00', currency: 'USD', country: 'DE', taxed: { place: 'Germany', tax: 'VAT', rate: 19, total: '23.80' } }));
  res.statusCode = 404; res.end('{"error":"not-found"}');
});
await new Promise(r => stub.listen(0, '127.0.0.1', r));
const SITE = `http://127.0.0.1:${stub.address().port}`;

// The app's usual port can be held for a moment by another test run (78 opens a page there on purpose): wait for it.
const portFree = p => new Promise(r => { const s = netServer(); s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => s.close(() => r(true))); });
const waitForPort = async () => { for (let i = 0; i < 60; i++) { if (await portFree(47861)) return true; await sleep(1000); } return false; };

// Plain HTTP from Node, without the window's key, with a chosen Host header.
const get = (url, headers = {}) => new Promise((res, rej) => { const q = request(url, { headers }, r => { let b = ''; r.setEncoding('utf8'); r.on('data', c => { b += c; }); r.on('end', () => res({ status: r.statusCode, type: r.headers['content-type'] || '', body: b })); }); q.on('error', rej); q.end(); });

async function launch(profile, extraEnv = {}) {
  await waitForPort();
  const app = await electron.launch({
    executablePath: electronPath, args: ['.', '--no-sandbox', '--use-fake-device-for-media-stream'], cwd: repo, timeout: 60000,
    env: { ...process.env, NODE_OPTIONS: '', GDEX_TEST_NO_BROWSER: '1', GDEX_TEST_NET_WATCH: '1', GDEX_LICENCE_SITE: SITE, GDEX_TEST_PROFILE: profile, ...extraEnv },
  });
  const win = await app.firstWindow({ timeout: 60000 });
  const bad = [];
  win.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) bad.push(m.text()); });
  win.on('pageerror', e => bad.push('pageerror: ' + e.message));
  await win.waitForLoadState('domcontentloaded');
  await win.evaluate(() => { localStorage.setItem('gdex-tour', 'done'); localStorage.setItem('gdex-role-nudged', '1'); localStorage.setItem('gdex-ask-seen', 'off'); });
  await win.reload();
  await win.waitForSelector('#deck .dk-next', { timeout: 30000 });
  return { app, win, bad };
}

const profiles = [];
const newProfile = () => { const p = mkdtempSync(join(tmpdir(), 'gdex-desktop-')); profiles.push(p); return p; };
try {
  /* ============================== 1. as built ============================== */
  const profile = newProfile();
  const { app, win, bad } = await launch(profile);
  const url = win.url(), base = new URL(url).origin, port = Number(new URL(url).port);
  ok('the app opens at its own local address (http://localhost:47861/, or a fallback up to 47880)', /^http:\/\/localhost:(4786[1-9]|4787\d|47880)\/$/.test(url), url);
  const usual = port === 47861;
  if (!usual) console.log(`(another program held localhost:47861, so Gdex opened at ${port}: Google's sign-in is checked as refused below)`);
  const who = await app.evaluate(({ app }) => ({ name: app.getName(), data: app.getPath('userData'), version: app.getVersion() }));
  ok('it is called Gdex, keeps its data in the test profile, and carries the web app’s version', who.name === 'Gdex' && resolve(who.data) === resolve(profile) && who.version === /VERSION = '([^']+)'/.exec(readFileSync(join(repo, 'js', 'version.js'), 'utf8'))[1], JSON.stringify(who));
  const members = await win.evaluate(() => ({ top: Object.keys(window.gdexDesktop).sort(), licence: Object.keys(window.gdexDesktop.licence).sort(), platform: window.gdexDesktop.platform, vdex: 'vdexDesktop' in window }));
  ok('the bridge window.gdexDesktop has exactly its members (no Dropbox, Microsoft or iCloud sign-in)',
    members.top.join() === ['checkForUpdates', 'googleSignIn', 'installUpdate', 'licence', 'onStatus', 'openDownload', 'platform', 'updateState'].join()
    && members.licence.join() === ['adopt', 'buy', 'code', 'enter', 'localPrice', 'onChange', 'recheck', 'release', 'start', 'state'].join()
    && ['win32', 'darwin', 'linux'].includes(members.platform) && !members.vdex, JSON.stringify(members));
  const upd = await win.evaluate(async () => ({ bridge: (await window.gdexDesktop.updateState()).status, page: (await import('./js/update.js')).updateState().desktop, workers: (await navigator.serviceWorker.getRegistrations()).length, install: document.getElementById('installBtn').hidden }));
  ok('updates: a development run says "dev", the page follows the bridge, no service worker is registered, and Install is hidden', upd.bridge === 'dev' && upd.page && upd.page.status === 'dev' && upd.workers === 0 && upd.install === true, JSON.stringify(upd));
  await win.evaluate(() => window.logiGo('settings')); await sleep(400);
  await win.locator('#se-about > summary').click(); await sleep(250);
  const about = await win.locator('#se-about').innerText();
  ok('Settings → About says it is a development copy, with no update check and no Install button', /A development copy: updates are only looked for in the installed app\./.test(about) && !/Check for updates/.test(about) && !(await win.locator('#se-install').count()), about.split('\n').slice(-4).join(' / '));
  try { mkdirSync(join(repo, 'tests', 'output'), { recursive: true }); await win.locator('#se-about').screenshot({ path: join(repo, 'tests', 'output', 'desktop-about.png') }); } catch { /* a picture only */ }
  await win.evaluate(() => window.logiGo('bookings')); await sleep(300);

  // The licence follows the two switches in the repository.
  const on = JSON.parse(readFileSync(join(repo, 'desktop', 'licence-on.json'), 'utf8')).on === true;
  const keysIn = Object.keys(JSON.parse(readFileSync(join(repo, 'desktop', 'licence-keys.json'), 'utf8'))).includes('1');
  const lic = await win.evaluate(() => window.gdexDesktop.licence.state());
  const started = await win.evaluate(() => window.gdexDesktop.licence.start());
  const priced = await win.evaluate(() => window.gdexDesktop.licence.localPrice().then(p => ({ p }), e => ({ error: String(e && e.message) })));
  if (on && keysIn) {
    ok('licences are switched on in this build: the free days have not started until the page asks', lic.mode === 'unstarted' && lic.kind === 'desktop' && lic.canEdit && started.mode === 'trial', JSON.stringify([lic, started]));
  } else {
    ok('licences are off in this build (desktop/licence-on.json off, or no keys): "off", every role can change things, and start() keeps it off', lic.mode === 'off' && lic.kind === 'desktop' && lic.canEdit === true && lic.enabled === false && started.mode === 'off', JSON.stringify(lic));
    ok('…and the price is not asked of the licence server while off: null, without failing', !priced.error && priced.p === null, JSON.stringify(priced));
  }

  // Permissions: the microphone yes, the camera never; the screen kept on (the set timer and the meter).
  const media = await win.evaluate(async () => {
    const tryIt = c => navigator.mediaDevices.getUserMedia(c).then(s => { s.getTracks().forEach(t => t.stop()); return 'granted'; }, e => e.name);
    return { mic: await tryIt({ audio: true }), camera: await tryIt({ video: true }), both: await tryIt({ audio: true, video: true }) };
  });
  ok('the microphone is granted to Gdex, the camera refused (also asked together with the microphone)', media.mic === 'granted' && media.camera === 'NotAllowedError' && media.both === 'NotAllowedError', JSON.stringify(media));
  const wake = await win.evaluate(() => navigator.wakeLock.request('screen').then(l => l.release().then(() => 'held'), e => e.name + ': ' + e.message));
  const perms = await app.evaluate(() => global.__gdexPermissions);
  ok('the screen can be kept on (the wake lock resolves)', wake === 'held', wake + ' — permissions asked: ' + JSON.stringify([...new Set(perms.map(p => p.permission))]));
  const notified = await win.evaluate(() => Notification.requestPermission());
  ok('…and anything else is refused (notifications, which Gdex never uses)', notified === 'denied', notified);

  // Gdex's files are only for its own window ([S-42]).
  const plain = await Promise.all(['/', '/index.html', '/js/app.js', '/css/licence.css'].map(p => get(base + p)));
  ok('from outside the app (no window key), the app’s files answer 403 “Open Gdex from its desktop app.”', plain.every(r => r.status === 403 && /Open Gdex from its desktop app/.test(r.body)), plain.map(r => r.status).join());
  const forged = await get(base + '/index.html', { 'X-Gdex-App': 'guessed' });
  ok('…a guessed key is refused too', forged.status === 403);
  const rebound = await get(base + '/__gdex/google?n=x', { Host: 'evil.example:' + port });
  ok('…and a request addressed to another name (a page pointing its own name at this computer) is refused', rebound.status === 403);
  const licReq = await get(base + '/licence/web/status');
  ok('the licence server’s addresses are never the app: a JSON 404', licReq.status === 404 && /^application\/json/.test(licReq.type) && licReq.body === '{"error":"not-found"}', JSON.stringify(licReq));
  ok('/sw.js is 404 (the offline worker is the website’s only)', (await get(base + '/sw.js')).status === 404);

  // Google's sign-in: a one-time page in the web browser at the app's address, handing the token back to the window.
  const signin = {};
  await win.evaluate(() => { window.__g = window.gdexDesktop.googleSignIn({ client: '123-abc.apps.googleusercontent.com', scope: 'https://www.googleapis.com/auth/drive.appdata', hint: 'h@example.com' }); });
  await sleep(300);
  if (usual) {
    const gUrl = await app.evaluate(() => global.__gdexLastExternal);
    signin.opensBrowser = /^http:\/\/localhost:47861\/__gdex\/google\?n=[A-Za-z0-9_-]{32}$/.test(gUrl);
    const gPage = await fetch(gUrl), gHtml = await gPage.text(), csp = gPage.headers.get('content-security-policy') || '';
    signin.page = gPage.ok && /Continue with Google/.test(gHtml) && /Sign in to Google for Gdex/.test(gHtml) && /h@example\.com/.test(gHtml) && !/Vdex/.test(gHtml) && /script-src 'nonce-/.test(csp) && /default-src 'none'/.test(csp);
    const parses = html => [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)].every(m => { try { new Function(m[1]); return true; } catch { return false; } }) && /<script nonce="[^"]+">/.test(html);
    signin.scriptParses = parses(gHtml);
    const key = (gHtml.match(/"key":"([^"]+)"/) || [])[1];
    const answer = JSON.stringify({ access_token: 'gt', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.appdata', token_type: 'Bearer' });
    signin.needsKey = (await fetch(gUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: answer })).status === 403;
    signin.needsOrigin = (await fetch(gUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', 'X-Gdex-Key': key }, body: answer })).status === 403;
    signin.servedOnce = (await fetch(gUrl)).status === 404;
    const post = await fetch(gUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Gdex-Key': key }, body: answer });
    const got = await win.evaluate(() => window.__g);
    signin.handsOver = post.status === 204 && got.access_token === 'gt' && got.expires_in === 3600;
    signin.thenGone = (await fetch(gUrl)).status === 404 && (await fetch(base + '/__gdex/google?n=guess')).status === 404;
    await win.evaluate(() => { window.__g1 = window.gdexDesktop.googleSignIn({ client: '123-abc.apps.googleusercontent.com', scope: 'https://www.googleapis.com/auth/drive.appdata', hint: '' }); });
    await sleep(200);
    await win.evaluate(() => { window.__g2 = window.gdexDesktop.googleSignIn({ client: '123-abc.apps.googleusercontent.com', scope: 'https://www.googleapis.com/auth/drive.appdata', hint: '' }); });
    await sleep(200);
    signin.oneAtATime = (await win.evaluate(() => window.__g1)).error === 'replaced';
    const g2Url = await app.evaluate(() => global.__gdexLastExternal); await fetch(g2Url); // opened, then left: the window stops waiting only when replaced or after five minutes
  } else {
    signin.awayRefused = (await win.evaluate(() => window.__g)).error === 'address_taken';
  }
  signin.oddClientRefused = (await win.evaluate(() => window.gdexDesktop.googleSignIn({ client: 'not a client', scope: 'https://www.googleapis.com/auth/drive.appdata' }))).error === (usual ? 'refused' : 'address_taken');
  signin.oddScopeRefused = (await win.evaluate(() => window.gdexDesktop.googleSignIn({ client: '123-abc.apps.googleusercontent.com', scope: 'https://evil.example/all' }))).error === (usual ? 'refused' : 'address_taken');
  ok('Google’s sign-in opens once in the web browser with the hint and a nonce CSP, refuses an answer without the page’s key or from another origin, hands the token to the window, then is gone', Object.values(signin).every(Boolean), JSON.stringify(signin));

  // Nobody who never linked Google Drive contacts anyone: type in a field for a moment, open every section.
  await win.click('#searchBtn'); await sleep(300);
  await win.keyboard.type('Lantern church friday', { delay: 40 }); await sleep(400);
  await win.keyboard.press('Escape'); await sleep(200);
  const sections = await win.evaluate(async () => { const { SECTIONS } = await import('./js/roles.js'); for (const id of SECTIONS) { await window.logiGo(id); await new Promise(r => setTimeout(r, 250)); } return SECTIONS; });
  await sleep(500);
  const hosts = await app.evaluate(() => [...global.__gdexHosts]);
  const allowed = new Set([`localhost:${port}`, `127.0.0.1:${stub.address().port}`]);
  ok(`typing and opening all ${sections.length} sections contacts nothing but this computer (no Google, no gdex.crowmade.app, no download address)`, hosts.length > 0 && hosts.every(h => allowed.has(h)), hosts.join(', '));
  ok('…and with licences off the licence server was asked nothing at all', on && keysIn ? true : asked.length === 0, asked.join(', '));
  // Links: a mail link and the shop open outside; the window stays on the app. (Last: Playwright then waits for the
  // navigation the app cancelled, so nothing is clicked after this.)
  await win.evaluate(() => { location.href = 'mailto:someone@example.com'; }); await sleep(600);
  const mailOut = await app.evaluate(() => global.__gdexLastExternal);
  await win.evaluate(() => { location.href = '/buy'; }); await sleep(600);
  const shopOut = await app.evaluate(() => global.__gdexLastExternal);
  ok('a mail link opens in the mail program, and the shop (/buy) in the web browser, while the window stays on Gdex', mailOut === 'mailto:someone@example.com' && shopOut === SITE + '/buy' && win.url() === url, JSON.stringify([mailOut, shopOut, win.url()]));

  ok('no errors in the console, and no content security policy complaints', bad.length === 0, bad.join(' | '));
  await app.close();

  /* ===================== 2. with licences on (throw-away keys) ===================== */
  const pair1 = await codes.newKeyPair(), pair2 = await codes.newKeyPair(), pair9 = await codes.newKeyPair();
  const testKeys = JSON.stringify({ 1: pair1.publicKey, 2: pair2.publicKey, 9: pair9.publicKey });
  const profile2 = newProfile();
  asked.length = 0;
  let run = await launch(profile2, { GDEX_TEST_LICENCE_KEYS: testKeys });
  let s = await run.win.evaluate(() => window.gdexDesktop.licence.state());
  ok('with licences on, a new computer has not started its free days (no early user)', s.mode === 'unstarted' && s.enabled && s.started === false && s.first === 0 && s.canEdit && s.buyUrl === SITE + '/buy', JSON.stringify(s));
  const changes = await run.win.evaluate(() => new Promise(res => { const seen = []; const off = window.gdexDesktop.licence.onChange(x => seen.push(x.mode)); window.gdexDesktop.licence.start().then(st => setTimeout(() => { off(); res({ st, seen }); }, 300)); }));
  s = changes.st;
  ok('start() starts them now, and the page hears of it (onChange)', s.mode === 'trial' && s.started && s.trialLeft === 30 && Math.abs(s.first - Date.now()) < 120e3 && changes.seen.includes('trial'), JSON.stringify(changes.seen));
  const mirrored = JSON.parse(readFileSync(join(profile2, 'desktop-state.json'), 'utf8')).licence, stored = JSON.parse(readFileSync(join(profile2, 'licence.json'), 'utf8'));
  ok('the start is in licence.json and its mirror in desktop-state.json, and there is no "founder"', mirrored && mirrored.first === s.first && stored.first === s.first && !('founder' in stored) && !('founder' in mirrored), JSON.stringify(mirrored));
  const first = s.first;
  s = await run.win.evaluate(t => window.gdexDesktop.licence.adopt(t), first - 2 * DAY);
  ok('adopt() takes an earlier start from another device on the same Google Drive', s.first === first - 2 * DAY && s.trialLeft === 28, String(s.trialLeft));
  const price = await run.win.evaluate(() => window.gdexDesktop.licence.localPrice());
  ok('the price with tax comes from the licence server (only its taxed part reaches the page)', JSON.stringify(price) === JSON.stringify({ taxed: { place: 'Germany', tax: 'VAT', rate: 19, total: '23.80' } }) && asked.includes('GET /licence/price'), JSON.stringify([price, asked]));
  const bad2 = (await run.win.evaluate(() => window.gdexDesktop.licence.enter('VDEX-0A1B2-C3D4E-F5G6H'))).error;
  ok('a Vdex code pasted in gets its own message', /This is a Vdex licence code\. Gdex has its own licence/.test(bad2 || ''), bad2);
  ok('no errors in the console (licences on)', run.bad.length === 0, run.bad.join(' | '));
  await run.app.close();
  rmSync(join(profile2, 'licence.json'));
  run = await launch(profile2, { GDEX_TEST_LICENCE_KEYS: testKeys });
  s = await run.win.evaluate(() => window.gdexDesktop.licence.state());
  ok('licence.json deleted: the next start takes the free days’ start back from desktop-state.json', s.mode === 'trial' && s.first === first - 2 * DAY && existsSync(join(profile2, 'licence.json')), JSON.stringify({ mode: s.mode, first: s.first }));
  await run.app.close();
} catch (e) {
  ok('the desktop smoke test ran to the end', false, (e && e.stack) || String(e));
} finally {
  stub.close();
  for (const p of profiles) try { rmSync(p, { recursive: true, force: true }); } catch { /* still in use */ }
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
