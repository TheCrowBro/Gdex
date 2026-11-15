// Google Drive in the desktop app (the page's side; the desktop app's own sign-in page is tests/desktop.mjs): a stand-in
// window.tourbookDesktop.googleSignIn at the desktop app's address (localhost:47861, served by the test, no server): the
// toast, the client, scope and hint passed, the answer handled as Google's window's; the hour running out; a sign-in
// replaced by a newer one is silent; on a stand-in port the "another program" sentence and no call; the desktop app's
// files opened in a web browser connect nothing and never load Google's script; and index.html's CSP lets Google's
// sign-in in (the tests' stand-ins never load the real script, so a missing host would pass every other check).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ok, sleep } = require('../helpers.cjs');
const { CLIENT, SCOPE, ROOT, fakeDrive, device, openBackups, closeSheets, state, syncOn, waitCloud, toasts, until, sheetOf } = require('./90-drive.cjs');

const DESKTOP = () => {
  window.__dcalls = [];
  window.tourbookDesktop = { platform: 'linux', googleSignIn: async o => { window.__dcalls.push(o); await new Promise(r => setTimeout(r, 20)); return window.__danswer || { access_token: 'dtok' + Math.random().toString(36).slice(2), expires_in: 3600, scope: o.scope, token_type: 'Bearer' }; } };
};
const TAKEN = 'Tourbook can’t open Google’s sign-in because another program on this computer is using the connection Tourbook needs. Restart the computer, open Tourbook first, and try again.';
const AWAY = 'Open Tourbook from its desktop app to connect Google Drive.';

async function tapConnect(page) {
  await openBackups(page);
  await page.click(`${sheetOf('Backups')} .se-bk-drive-connect`);
  await page.waitForSelector(`${sheetOf('Connect Google Drive')} .se-bk-drive-go:not([disabled])`, { timeout: 10000 });
  const calls = await page.evaluate(() => window.__dcalls.length);
  await page.click(`${sheetOf('Connect Google Drive')} .se-bk-drive-go`);
  await page.waitForFunction(n => window.__dcalls.length > n || !document.querySelector('.sheet[aria-label="Connect Google Drive"] .se-bk-drive-err').hidden, calls, { timeout: 10000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.sheet[aria-label="Connect Google Drive"]') || !document.querySelector('.sheet[aria-label="Connect Google Drive"] .se-bk-drive-go').disabled, null, { timeout: 15000 }).catch(() => {});
  await sleep(150);
}
const errLine = page => page.evaluate(() => { const e = document.querySelector('.sheet[aria-label="Connect Google Drive"] .se-bk-drive-err'); return e && !e.hidden ? e.textContent : ''; });

(async () => {
  const browser = await chromium.launch();
  const all = [];
  const D = fakeDrive();

  /* ------------------------------ the desktop app, at its usual port ------------------------------ */
  const A = await device(browser, D, { who: 'A', url: 'http://localhost:47861/', serve: true, init: DESKTOP, sample: true }); all.push(A);
  const pa = A.page;
  await openBackups(pa);
  await pa.click(`${sheetOf('Backups')} .se-bk-drive-connect`);
  await pa.waitForSelector(sheetOf('Connect Google Drive'));
  const sheetText = await pa.locator(sheetOf('Connect Google Drive')).innerText();
  ok('the desktop app’s connect sheet says the sign-in opens in the web browser', /Google’s sign-in opens in your web browser; come back to Tourbook when it says so\./.test(sheetText));
  ok('…Continue is ready at once and Google’s script is never loaded in the app', !(await pa.locator(`${sheetOf('Connect Google Drive')} .se-bk-drive-go`).isDisabled()) && !/Loading Google/.test(sheetText) && A.hosts.length === 0, A.hosts.join(' '));
  await pa.click(`${sheetOf('Connect Google Drive')} .se-bk-drive-go`);
  await pa.waitForSelector(sheetOf('Connect Google Drive'), { state: 'detached', timeout: 15000 });
  const call = await pa.evaluate(() => window.__dcalls[0]);
  ok('the app’s bridge is asked with Tourbook’s client, drive.appdata only, and no hint the first time', call && call.client === CLIENT && call.scope === SCOPE && call.hint === '', JSON.stringify(call));
  ok('…with the toast that says to carry on in the web browser', /Carry on in your web browser: sign in to Google there, then come back to Tourbook\./.test(await toasts(pa)));
  ok('the answer is taken as Google’s window’s: linked and synced, the copy written', await waitCloud(pa, 'synced') && D.json() && D.json().bookings.some(b => b.id === 's-show1') && (await state(pa)).who === 'Gee Test · gee@example.com');
  ok('…and Google’s sign-in host was never contacted from the app', !A.hosts.some(h => /accounts\.google\.com/.test(h)), A.hosts.join(' '));
  await pa.evaluate(() => Promise.all([import('./js/drive.js'), import('./js/sync.js')]).then(([d, s]) => { d.forgetGoogleToken(); return s.sync({ quiet: true }); }));
  ok('when the hour is up the ☁ button says Sign in', await waitCloud(pa, 'needs-permission'));
  await pa.click(`${sheetOf('Backups')} .se-bk-drive-again`);
  ok('…and Sign in again goes through the web browser once more, naming the account', await waitCloud(pa, 'synced') && (await pa.evaluate(() => window.__dcalls.length)) === 2 && (await pa.evaluate(() => window.__dcalls[1].hint)) === 'gee@example.com');
  await pa.click(`${sheetOf('Backups')} .se-bk-drive-off`);
  await pa.waitForSelector(`${sheetOf('Backups')} .se-bk-drive[data-state=off]`);
  await closeSheets(pa);

  // a sign-in replaced by a newer one (Connect tapped twice) says nothing; the others say what happened
  await pa.evaluate(() => { window.__danswer = { error: 'replaced' }; window.__toasts = []; });
  await tapConnect(pa);
  ok('an answer "replaced" is silent and links nothing', (await errLine(pa)) === '' && !(await state(pa)).linked && !/cancel|didn’t|wasn’t/i.test(await toasts(pa)), await toasts(pa));
  await pa.evaluate(() => { window.__danswer = { error: 'access_denied' }; });
  await pa.click(`${sheetOf('Connect Google Drive')} .se-bk-drive-go`);
  await until(async () => (await errLine(pa)) !== '');
  ok('a cancelled sign-in in the web browser says so', (await errLine(pa)) === 'Google sign-in was cancelled.' && !(await state(pa)).linked);
  await pa.evaluate(() => { window.__danswer = { error: 'timed_out' }; });
  await pa.click(`${sheetOf('Connect Google Drive')} .se-bk-drive-go`);
  await until(async () => /wasn’t finished/.test(await errLine(pa)));
  ok('…one left unfinished says to try again', (await errLine(pa)) === 'The Google sign-in in your web browser wasn’t finished. Try again.');
  await pa.evaluate(() => { window.__danswer = { error: 'address_taken' }; });
  await pa.click(`${sheetOf('Connect Google Drive')} .se-bk-drive-go`);
  await until(async () => /another program/.test(await errLine(pa)));
  ok('…and the desktop app finding its connection taken says what to do', (await errLine(pa)) === TAKEN);
  await closeSheets(pa);

  /* ------------------------------ the desktop app on a stand-in port ------------------------------ */
  const B = await device(browser, D, { who: 'B', url: 'http://localhost:47862/', serve: true, init: DESKTOP }); all.push(B);
  await tapConnect(B.page);
  ok('on a stand-in port the sign-in is refused with the "another program" sentence, and the bridge is not asked', (await errLine(B.page)) === TAKEN && (await B.page.evaluate(() => window.__dcalls.length)) === 0 && !(await state(B.page)).linked);
  await closeSheets(B.page);

  /* ------------------------------ the desktop app's files in a web browser ([S-42]) ------------------------------ */
  const C = await device(browser, D, { who: 'C', url: 'http://localhost:47861/', serve: true }); all.push(C);
  await closeSheets(C.page);
  await openBackups(C.page);
  const away = C.page.locator(`${sheetOf('Backups')} .se-bk-drive`);
  ok('the desktop app’s files opened in a web browser offer no Drive, and say where it works', (await away.getAttribute('data-state')) === 'away' && (await away.innerText()).includes(AWAY) && (await away.locator('button').count()) === 0);
  const refused = await C.page.evaluate(() => Promise.all([import('./js/sync.js'), import('./js/drive.js')]).then(async ([s, d]) => {
    const r = [];
    for (const f of [() => s.connectDrive(), () => d.googleToken(true), () => d.loadGIS()]) { try { await f(); r.push('went'); } catch (e) { r.push(e.message); } }
    return r;
  }));
  ok('…and connecting is refused there, before anything is loaded or asked', refused.every(x => x === AWAY) && C.hosts.length === 0 && !(await state(C.page)).linked, JSON.stringify(refused) + ' ' + C.hosts.join(' '));
  await closeSheets(C.page);

  /* ------------------------------ index.html's CSP ------------------------------ */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const csp = Object.fromEntries((/http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html) || [, ''])[1].split(';').map(d => d.trim().split(/\s+/)).filter(d => d[0]).map(d => [d[0], d.slice(1)]));
  ok('index.html’s CSP lets Google’s sign-in script, its style and its frame in', ['script-src', 'style-src', 'frame-src'].every(d => (csp[d] || []).includes('https://accounts.google.com')), JSON.stringify(csp));
  ok('…and Tourbook reach Google Drive’s API', (csp['connect-src'] || []).some(s => s === 'https:' || s === 'https://www.googleapis.com'), JSON.stringify(csp['connect-src']));

  const errs = all.flatMap(d => d.errors.map(e => `${d.who}: ${e}`));
  ok('no errors in the console', errs.length === 0, errs.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL drive-desktop crashed — ' + (e && e.stack || e)); process.exit(1); });
