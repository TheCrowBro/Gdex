// The website's licence against the licence server (faked by Playwright routes answering the build spec §3.9, with a
// Date header; the sign-in tokens signed with a throw-away Ed25519 key made here, whose public half is served as
// js/licence-keys.js): Buy, the price with the tax where the buyer is, signing in with an emailed 6-digit code,
// licensed (every role, no sheet, no bar, kept through a reload), the daily check (a proxy's refusal is no answer; a
// cancellation signs out), Sign out, Delete my licence records, the sign-in's signature checked in the browser, and the
// server's time putting right a start the device's clock put in the future.
const { chromium } = require('playwright');
const { webcrypto } = require('crypto');
const fs = require('fs'), path = require('path');
const BASE = process.env.GDEX_URL || 'http://localhost:8124/';
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 864e5, HOUR = 3600e3;
const TERMS_V = (() => { try { return (/TERMS_VERSION = '([^']*)'/.exec(fs.readFileSync(path.join(process.env.GDEX_ROOT || path.join(__dirname, '..', '..'), 'js', 'terms.js'), 'utf8')) || [])[1] || ''; } catch { return ''; } })();
const LICENCE = { email: 'jo@example.com', name: 'Jo Web', ref: '2:4242', seats: 3, comp: false, expires: '' };

// A throw-away signing key, as the licence server's shop key (key 2) would be.
async function shopKey() {
  const pair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  const sign = async value => {
    const data = JSON.stringify(value);
    const sig = Buffer.from(await webcrypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, Buffer.concat([Buffer.from('GDEX-WEB\0'), Buffer.from(data)]))).toString('base64url');
    return { kid: 2, data, sig };
  };
  return { pub, sign };
}

/* ------------------------------ the kit (as 76's, with the sign-in) ------------------------------ */
const server = key => ({ on: true, status: 'json', offline: false, asked: [], bodies: [], date: () => new Date(), check: 'ok', key,
  price: { price: '20.00', currency: 'USD', country: 'DE', taxed: { place: 'Germany', tax: 'VAT', rate: 19, total: '23.80' } } });
async function route(ctx, srv) {
  await ctx.route(u => { const p = new URL(u).pathname; return p.startsWith('/licence/') || p === '/buy'; }, async r => {
    const req = r.request(), p = new URL(req.url()).pathname; srv.asked.push(p);
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch { /* not JSON */ }
    srv.bodies.push([p, body]);
    if (srv.offline) return r.abort();
    const json = (status, b) => r.fulfill({ status, contentType: 'application/json; charset=utf-8', headers: { date: srv.date().toUTCString(), 'cache-control': 'no-store' }, body: JSON.stringify(b) });
    if (p === '/licence/web/status') return json(200, { on: srv.on });
    if (p === '/licence/price') return json(200, srv.price);
    if (p === '/buy') return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>The shop</p>' });
    if (p === '/licence/web/start') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email || '') ? json(200, { ok: true }) : json(400, { error: 'invalid-email' });
    if (p === '/licence/web/verify') {
      if (String(body.code || '').replace(/\D/g, '') !== '123456') return json(400, { error: 'wrong-code' });
      return json(200, { ok: true, token: await srv.key.sign({ email: LICENCE.email, ref: LICENCE.ref, iat: Date.now() }), licence: LICENCE });
    }
    if (p === '/licence/web/check') {
      if (srv.check === 'proxy') return r.fulfill({ status: 403, contentType: 'text/html', body: '<h1>Blocked by the network</h1>' });
      if (srv.check === 'cancelled') return json(403, { error: 'cancelled' });
      return json(200, { ok: true, licence: LICENCE });
    }
    if (p === '/licence/web/forget') return json(200, { ok: true });
    return json(404, { error: 'not-found' });
  });
}
async function openLive(browser, errors, srv, { seed = {}, ask = 'off', clockAt = null, init = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
  await ctx.route('**/js/licence-config.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: "export const LICENCE_SITES = ['localhost', '127.0.0.1'];\n" }));
  await ctx.route('**/js/licence-keys.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: `export const LICENCE_KEYS = ${JSON.stringify({ 2: srv.key.pub })};\n` }));
  await ctx.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[]}}' }));
  await route(ctx, srv);
  await ctx.addInitScript(([seed, ask, clockAt]) => {
    const R = Date; let at = null, t0 = 0;
    const now = () => (at === null ? R.now() : at + (R.now() - t0));
    function D(...a) { if (!new.target) return new R(now()).toString(); return a.length ? new R(...a) : new R(now()); }
    D.prototype = R.prototype; D.now = now; D.parse = R.parse; D.UTC = R.UTC;
    globalThis.Date = D;
    window.__clock = ms => { at = ms; t0 = R.now(); sessionStorage.setItem('t-clock', String(ms)); };
    try {
      if (clockAt && !sessionStorage.getItem('t-clock')) window.__clock(clockAt);
      const kept = sessionStorage.getItem('t-clock'); if (kept) window.__clock(Number(kept));
      if (!localStorage.getItem('t-seeded')) { localStorage.setItem('t-seeded', '1'); for (const [k, v] of Object.entries(seed)) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } }
      localStorage.setItem('gdex-tour', 'done'); localStorage.setItem('gdex-role-nudged', '1');
      if (ask) localStorage.setItem('gdex-ask-seen', ask);
    } catch (e) { /* ignore */ }
    window.__toasts = [];
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }))).observe(document, { childList: true, subtree: true });
  }, [seed, ask, clockAt]);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || /Content Security Policy|Refused to/.test(t)) && !/^Failed to load resource: (the server responded with a status of (400|401|403|404)|net::ERR_FAILED)/.test(t)) errors.push(t); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE);
  await page.waitForSelector('#deck .dk-next');
  return { ctx, page };
}
const state = page => page.evaluate(() => import('./js/licence-state.js').then(m => m.licenceReady().then(() => m.licenceNow())));
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('gdex-licence') || '{}'));
const toasts = page => page.evaluate(() => window.__toasts.slice());
const sheets = page => page.$$eval('.sheet', els => els.map(x => x.getAttribute('aria-label')));
const go = (page, id) => page.evaluate(t => window.logiGo(t), id);
const reload = async page => { await page.reload(); await page.waitForSelector('#deck .dk-next'); };
const closeTop = async page => { await page.evaluate(() => { const all = document.querySelectorAll('.sheet'); const s = all[all.length - 1]; s && s.querySelector('.sheet-head [aria-label="Close"]').click(); }); await sleep(250); };
const about = async page => { await go(page, 'settings'); await sleep(300); await page.evaluate(() => { document.getElementById('se-about').open = true; }); await page.waitForSelector('.licence-panel:not([hidden])', { timeout: 5000 }); await sleep(300); };
const agreed = () => ({ v: TERMS_V, at: Date.now() });
const trialFrom = (first, extra = {}) => ({ on: true, statusAt: Date.now(), first, seen: Date.now(), ...extra });
// Signs in through the sheet, as a person does.
async function signIn(page) {
  await page.click('.licence-panel .lic-enter'); await page.waitForSelector('#lic-email');
  await page.fill('#lic-email', LICENCE.email); await page.click('#lic-send');
  await page.waitForSelector('#lic-digits', { state: 'visible' });
  await page.fill('#lic-digits', '123 456'); await page.click('#lic-verify'); await sleep(800);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const key = await shopKey();
  try {
    /* =========== a working role in its free days: Buy, the price, signing in =========== */
    {
      const srv = server(key);
      const { ctx, page } = await openLive(browser, errors, srv, { seed: { 'gdex-role': 'producer', 'gdex-terms': agreed(), 'gdex-licence': trialFrom(Date.now() - 31 * DAY, { seen: Date.now() - HOUR }) } });
      await page.waitForSelector('.sheet.licence-over', { timeout: 6000 });
      await sleep(600);
      ok('the Buy button shows the price with the tax where the buyer is (Germany: 23.80 USD with VAT)', /Buy a licence · 23\.80 USD with VAT/.test(await page.textContent('.sheet.licence-over')) && /A licence is 23\.80 USD once in Germany, including 19% VAT, for up to 3 of your devices\./.test(await page.textContent('.sheet.licence-over')), await page.textContent('.sheet.licence-over'));
      const [shop] = await Promise.all([ctx.waitForEvent('page'), page.click('.sheet.licence-over .lic-buy')]);
      await shop.waitForLoadState();
      ok('Buy opens /buy in a new tab', new URL(shop.url()).pathname === '/buy' && /The shop/.test(await shop.textContent('body')));
      await shop.close();
      await closeTop(page);
      await about(page);
      ok('About & licence: the free days are over, read-only, Buy and Sign in', /^Your free days are over: the working roles are read-only here\. Audiophile is free\.$/.test(await page.textContent('.licence-panel .licence-line')) && (await page.locator('.licence-panel .lic-buy').count()) === 1 && (await page.locator('.licence-panel .lic-enter').count()) === 1);
      // Step 1, a mistake, step 2, a wrong code, a new code, the right one.
      await page.click('.licence-panel .lic-enter'); await page.waitForSelector('#lic-email');
      ok('Sign in to Gdex: step 1 asks the email address the licence was bought with, and the terms are named', (await sheets(page)).join() === 'Sign in to Gdex' && /The email address you bought your licence with\./.test(await page.textContent('.lic-signin')) && /By signing in you agree to Gdex’s terms\./.test(await page.textContent('.lic-signin')));
      await page.fill('#lic-email', 'not an address'); await page.click('#lic-send'); await sleep(200);
      ok('…an address that is not one is said so, and nothing is sent', /Type the email address your licence belongs to\./.test(await page.textContent('.lic-signin')) && !srv.asked.includes('/licence/web/start'));
      await page.fill('#lic-email', LICENCE.email); await page.click('#lic-send');
      await page.waitForSelector('#lic-digits', { state: 'visible' });
      ok('…step 2: the 6-digit code emailed to that address, for 15 minutes', /We’ve emailed a 6-digit code to jo@example\.com\. It works for 15 minutes\./.test(await page.textContent('.lic-signin')) && srv.bodies.some(([p, b]) => p === '/licence/web/start' && b.email === LICENCE.email));
      await page.fill('#lic-digits', '111111'); await page.click('#lic-verify'); await sleep(500);
      ok('…a wrong code is said so, and nothing changes', /That code is not right, or has run out/.test(await page.textContent('.lic-signin')) && (await state(page)).mode === 'ended');
      await page.click('#lic-again'); await sleep(200);
      ok('…Send a new code goes back to step 1 with the address kept', await page.isVisible('#lic-email') && (await page.inputValue('#lic-email')) === LICENCE.email);
      await page.click('#lic-send'); await page.waitForSelector('#lic-digits', { state: 'visible' });
      await page.fill('#lic-digits', '123 456'); await page.click('#lic-verify'); await sleep(800);
      let st = await state(page);
      ok('…the right code: licensed, the sheet closes, a toast says so', st.mode === 'licensed' && st.canEdit && (await sheets(page)).length === 0 && (await toasts(page)).includes('Licensed: every role on this device.'), JSON.stringify(st));
      ok('…About & licence says who is signed in, with Sign out and Delete my licence records', /^Signed in as jo@example\.com · a licence for up to 3 devices\.$/.test(await page.textContent('.licence-panel .licence-line')) && (await page.locator('.licence-panel .lic-release').count()) === 1 && (await page.locator('.licence-panel .lic-forget').count()) === 1);
      ok('licensed: every role may be picked, every section opens, the bar is gone, and a change is kept', await page.evaluate(() => import('./js/licence-state.js').then(m => import('./js/roles.js').then(r => [...r.ROLES.map(x => x.id), 'all'].every(id => m.mayPickRole(id) === 'open') && r.SECTIONS.every(id => m.mayOpen(id) === 'open') && m.canWrite()))) && (await page.locator('.licence-bar').count()) === 0 && await page.evaluate(() => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, name: 'Licensed' }; }))));
      await reload(page); await sleep(1500);
      st = await state(page);
      ok('…a reload keeps it: licensed, no sheet at opening (the signature checks out)', st.mode === 'licensed' && (await sheets(page)).length === 0 && !!(await stored(page)).token, JSON.stringify(st));
      ok('…and the role picker reads Licensed', await page.evaluate(() => import('./js/licence-state.js').then(m => m.roleBadge('band'))) === 'Licensed');
      // The daily check: a proxy's refusal is not an answer; a cancellation signs out.
      srv.check = 'proxy';
      await page.evaluate(() => import('./js/licence-web.js').then(m => m.recheck(true))); await sleep(300);
      ok('an HTML 403 from something in the way (a proxy) keeps the sign-in', (await state(page)).mode === 'licensed' && !!(await stored(page)).token);
      srv.check = 'cancelled';
      await page.evaluate(() => import('./js/licence-web.js').then(m => m.recheck(true))); await sleep(400);
      st = await state(page);
      ok('the daily check answering “cancelled” signs out, and the working role is read-only again', st.mode === 'cancelled' && st.canEdit === false && !(await stored(page)).token && (await stored(page)).cancelled === true, JSON.stringify(st));
      await reload(page);
      await page.waitForSelector('.sheet.licence-over', { timeout: 6000 });
      ok('…at the next opening its sheet says the licence has been cancelled', (await sheets(page)).join() === 'Your licence has been cancelled' && /reply to the email your licence came in/.test(await page.textContent('.sheet.licence-over')));
      await closeTop(page);
      // Sign in again, then Sign out.
      srv.check = 'ok';
      await about(page); await signIn(page);
      ok('signed in again after a cancellation (a new purchase)', (await state(page)).mode === 'licensed');
      await page.click('.licence-panel .lic-release'); await page.waitForSelector('#lic-release-go');
      ok('Sign out says what it does', /This signs Gdex out on this browser\./.test(await page.textContent('.sheet[aria-label="Sign out"]')));
      await page.click('#lic-release-go'); await sleep(500);
      ok('…signed out: back to read-only, with its toast', (await state(page)).mode === 'ended' && (await toasts(page)).includes('Signed out on this device.'));
      await about(page); await signIn(page);
      await page.click('.licence-panel .lic-forget'); await page.waitForSelector('#lic-forget-go');
      const forgetWords = await page.textContent('.sheet[aria-label="Delete my licence records"]');
      ok('Delete my licence records says what goes and what stays: the email address\'s link and sign-in codes go; computers with the desktop app keep the licence until each is released', /This deletes what Gdex’s licence server keeps about your email address \(jo@example\.com\): its link to your licence, and its sign-in codes\. Gdex signs out here, and other browsers signed in with it are signed out at their next check\./.test(forgetWords) && /Computers with the desktop app keep your licence, and stay on its list \(a random number for each, nothing about you\): to take one off, use Release this computer on it\./.test(forgetWords) && !/list of devices/.test(forgetWords), forgetWords);
      await page.click('#lic-forget-go'); await sleep(500);
      ok('…deleted: the server was asked with the sign-in, and this browser is signed out', srv.bodies.some(([p, b]) => p === '/licence/web/forget' && b.token && b.token.kid === 2) && (await state(page)).mode === 'ended' && (await toasts(page)).some(t => /Your licence records have been deleted/.test(t)));
      await ctx.close();
    }

    /* =========== the sign-in's signature, checked in the browser =========== */
    {
      const srv = server(key);
      const good = await key.sign({ email: LICENCE.email, ref: LICENCE.ref, iat: Date.now() });
      const signedIn = token => trialFrom(Date.now() - 40 * DAY, { token, licence: LICENCE, via: 'email', checked: Date.now(), tried: Date.now() });
      // Broken signature.
      let { ctx, page } = await openLive(browser, errors, srv, { seed: { 'gdex-role': 'producer', 'gdex-terms': agreed(), 'gdex-licence': signedIn({ ...good, sig: good.sig.slice(0, -4) + 'AAAA' }) } });
      let st = await state(page);
      ok('a hand-written sign-in with a broken signature is not believed, and its token is removed', st.mode === 'ended' && !(await stored(page)).token && !(await stored(page)).licence, JSON.stringify(st));
      await ctx.close();
      // No signature at all, or a token that is not one: checked like any other (nothing counts as already checked).
      const forged = {};
      for (const [name, token] of [['no signature', { kid: 2, data: good.data }], ['a word', 'licensed'], ['an empty object', {}]]) {
        ({ ctx, page } = await openLive(browser, errors, srv, { seed: { 'gdex-role': 'producer', 'gdex-terms': agreed(), 'gdex-licence': signedIn(token) } }));
        await page.evaluate(() => import('./js/licence-state.js').then(m => m.licenceReady()));
        forged[name] = [(await state(page)).mode, !!(await stored(page)).token];
        await ctx.close();
      }
      ok('…nor is one with no signature at all, a word, or an empty object: each removed', Object.values(forged).every(([m, t]) => m === 'ended' && !t), JSON.stringify(forged));
      // Genuine, but for another licence.
      ({ ctx, page } = await openLive(browser, errors, srv, { seed: { 'gdex-role': 'producer', 'gdex-terms': agreed(), 'gdex-licence': { ...signedIn(good), licence: { ...LICENCE, ref: '2:9999' } } } }));
      st = await state(page);
      ok('a genuine token whose licence number differs from the one beside it is not believed', st.mode === 'ended' && !(await stored(page)).token, JSON.stringify(st));
      await ctx.close();
      // Genuine.
      ({ ctx, page } = await openLive(browser, errors, srv, { seed: { 'gdex-role': 'producer', 'gdex-terms': agreed(), 'gdex-licence': signedIn(good) } }));
      st = await state(page);
      ok('a genuine one is licensed', st.mode === 'licensed' && !!(await stored(page)).token, JSON.stringify(st));
      await ctx.close();
      // A browser without Ed25519: believed, as Vdex does, and left to the daily check.
      ({ ctx, page } = await openLive(browser, errors, srv, { seed: { 'gdex-role': 'producer', 'gdex-terms': agreed(), 'gdex-licence': signedIn(good) }, init: () => {
        const real = crypto.subtle.importKey.bind(crypto.subtle);
        crypto.subtle.importKey = (format, data, alg, ...rest) => { if (alg && alg.name === 'Ed25519') { window.__noEd = (window.__noEd || 0) + 1; return Promise.reject(new DOMException('Ed25519 is not supported here', 'NotSupportedError')); } return real(format, data, alg, ...rest); };
      } }));
      st = await state(page);
      ok('…where the browser cannot check Ed25519 (NotSupportedError), a token is believed', st.mode === 'licensed' && (await page.evaluate(() => window.__noEd)) > 0, JSON.stringify(st));
      await ctx.close();
    }

    /* =========== the server's time puts right a start in the future =========== */
    {
      const srv = server(key);
      const real = Date.now();
      srv.offline = true;
      const { ctx, page } = await openLive(browser, errors, srv, { seed: { 'gdex-role': 'producer', 'gdex-terms': agreed(), 'gdex-licence': { on: true, statusAt: real + 5 * DAY, first: real + 5 * DAY, seen: real + 5 * DAY + HOUR } }, clockAt: real + 5 * DAY + 2 * HOUR });
      let st = await state(page);
      ok('a device whose clock is five days on started its free days there: it counts them from there', st.mode === 'trial' && st.first === real + 5 * DAY, JSON.stringify(st));
      srv.offline = false;
      await page.evaluate(() => import('./js/licence-web.js').then(m => m.status(true))); await sleep(500);
      const rec = await stored(page);
      // The two hours used on the wrong clock (from the start to the page's opening) are kept; the five days are not.
      ok('…the status’s Date header, five days behind, puts the start right, keeping the hours used', rec.first > real - 3 * HOUR && rec.first < real - HOUR && rec.seen <= Date.now() + 60e3, JSON.stringify({ rec, real }));
      await ctx.close();
    }
  } catch (e) { ok('licence web crashed', false, e.stack); }
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL licence web crashed — ' + e.message); process.exit(1); });
