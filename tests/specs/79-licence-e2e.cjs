// The licence from end to end, every part real but the outside services: Tourbook's licence server (cloudflare/worker.mjs,
// bundled as Wrangler does and run in Cloudflare's own runtime, workerd, through Miniflare; Stripe and Resend faked;
// throw-away keys in place of desktop/licence-keys.json) answering the real web app (its /licence/* and /buy requests
// forwarded to the Worker, with the Date header Cloudflare adds to every answer), and the real desktop licence
// (desktop/licence.cjs, through wireLicence and the bridge desktop/preload.cjs gives the page) answered by the same Worker.
//
// In Node: a purchase, its code by email, the desktop app's free days, the code on 3 computers, a 4th moved in, the
// computer taken off told so at its check, a refund cancelling the code, Release this computer, the price for the
// country, and the server's time putting right a start a wrong clock put ahead.
// In Chromium: a free Audiophile (its own sections and nothing sent; a working section starts its free days after the
// terms; 31 days on, locked, its own things still change; signing in opens everything); each working role (the terms
// sheet at the first use, the free days, 31 days on read-only with the price where the buyer is, signed in with the
// code the server emails and its signature checked in the browser); a refund signing the website out at its check; the
// owner's pause (on, off, on: the free days unmoved); a start put ahead by a wrong clock while offline, put right by the
// server's time; and the desktop app's page entering the emailed code through the real desktop licence.
// Nothing here reaches the network. Needs `npm ci --prefix cloudflare` (CI does it): SKIP without it, FAIL in CI ([S-26]).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// cloudflare/ and desktop/ are read from the repository itself, never from the test's scratch copy ([S-26]).
const REPO = path.resolve(__dirname, '../..');
const NM = path.join(REPO, 'cloudflare/node_modules');
const BASE = process.env.TOURBOOK_URL || 'http://localhost:8124/';
const SITE = 'https://tourbook.crowmade.app';
const DAY = 864e5;

(async () => {
  if (!fs.existsSync(path.join(NM, 'miniflare')) || !fs.existsSync(path.join(NM, 'esbuild'))) {
    if (process.env.CI) { console.log('FAIL the licence\'s end-to-end spec needs Wrangler\'s runtime: npm ci --prefix cloudflare'); process.exit(1); }
    console.log('SKIP the licence\'s end-to-end spec needs Wrangler\'s runtime (Miniflare): run npm ci --prefix cloudflare once'); return;
  }
  const codes = require(path.join(REPO, 'desktop/licence-codes.cjs'));
  const { createLicence, wireLicence } = require(path.join(REPO, 'desktop/licence.cjs'));
  const roles = await import(pathToFileURL(path.join(REPO, 'js/roles.js')).href);
  const esbuild = require(path.join(NM, 'esbuild'));
  const { Miniflare, convertV4MiniflareOptions } = require(path.join(NM, 'miniflare'));
  const workers = [], errors = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tourbook-e2e-'));
  let browser;
  try {
    /* ------------------------- the licence server, as it would be live ------------------------- */
    const owner = await codes.newKeyPair(), shop = await codes.newKeyPair(), spare = await codes.newKeyPair();
    const KEYS = { 1: owner.publicKey, 2: shop.publicKey, 9: spare.publicKey };
    const script = (await esbuild.build({ entryPoints: [path.join(REPO, 'cloudflare/worker.mjs')], bundle: true, format: 'esm', platform: 'browser', conditions: ['workerd', 'worker', 'browser'], write: false, logLevel: 'silent',
      plugins: [{ name: 'test-keys', setup(b) { b.onLoad({ filter: /licence-keys\.json$/ }, () => ({ contents: JSON.stringify(KEYS), loader: 'json' })); } }] })).outputFiles[0].text;
    // Stripe (the Checkout Sessions a payment link makes) and Resend (the emails), faked.
    const calls = [], sessions = new Map();
    const outbound = async request => {
      const u = new URL(request.url), body = request.method === 'POST' ? await request.text() : '';
      calls.push({ url: u.href, method: request.method, body });
      if (u.hostname === 'api.stripe.com') {
        if (request.headers.get('authorization') !== 'Bearer rk_test_key') return new Response('{"error":{}}', { status: 401 });
        const m = u.pathname.match(/^\/v1\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)$/);
        if (m) return sessions.has(m[1]) ? Response.json(sessions.get(m[1])) : new Response('{"error":{}}', { status: 404 });
        if (u.pathname === '/v1/checkout/sessions') {
          const byEmail = u.searchParams.get('customer_details[email]');
          if (byEmail) return Response.json({ data: [...sessions.values()].filter(s => String(s.customer_details.email).toLowerCase() === byEmail && s.payment_link === u.searchParams.get('payment_link')) });
          return Response.json({ data: [...sessions.values()].filter(s => s.payment_intent === u.searchParams.get('payment_intent')) });
        }
      }
      if (u.hostname === 'api.resend.com') return new Response(JSON.stringify({ id: 'email_' + calls.length }), { status: 200 });
      return new Response('unexpected', { status: 599 });
    };
    const env = { LICENCE_SHOP_KEY: codes.b64u.enc(shop.pkcs8), STRIPE_SECRET_KEY: 'rk_test_key', STRIPE_WEBHOOK_SECRET: 'whsec_e2esecret', STRIPE_PAYMENT_LINK: 'plink_tourbook', BUY_URL: 'https://buy.stripe.com/test_tourbook', RESEND_API_KEY: 're_test', WEB_SIGN_IN: 'on' };
    // cf: false: Miniflare never fetches Cloudflare's sample request details (each request here names its country).
    const make = bindings => { const m = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-10-01', cf: false, kvNamespaces: ['LICENCES'], durableObjects: { SIGNIN: { className: 'SignInCodes', useSQLite: true } }, bindings, outboundService: outbound, serviceBindings: { ASSETS: req => new Response('static file ' + new URL(req.url).pathname) } })); workers.push(m); return m; };
    const live = make(env), paused = make({ ...env, WEB_SIGN_IN: 'off' }); // paused: the owner's emergency switch
    const mails = () => calls.filter(c => c.url === 'https://api.resend.com/emails').map(c => JSON.parse(c.body));
    const lastCode = to => { const x = mails().filter(e => e.to[0] === to).at(-1); return x && (x.subject.match(/^(\d{6}) is your Tourbook sign-in code$/) || [])[1]; };
    const hook = event => { const body = JSON.stringify(event), t = Math.floor(Date.now() / 1000), sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex'); return live.dispatchFetch(SITE + '/licence/stripe-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }, body }).then(r => r.json()); };
    // A purchase through Tourbook's payment link: the thank-you page's code, and the same code in the email Stripe's webhook sends.
    let bought = 0;
    const buy = async (name, email) => {
      const id = 'cs_test_e2e' + String(++bought).padStart(12, '0') + crypto.randomBytes(4).toString('hex');
      sessions.set(id, { id, object: 'checkout.session', status: 'complete', payment_status: 'paid', payment_link: 'plink_tourbook', created: Math.floor(Date.now() / 1000) - 60, payment_intent: 'pi_e2e' + bought + crypto.randomBytes(4).toString('hex'), customer_details: { name, email } });
      const html = await (await live.dispatchFetch(SITE + '/licence/thanks?session_id=' + id)).text();
      const code = (html.match(/<textarea id="code"[^>]*>([^<]+)<\/textarea>/) || [])[1] || '';
      const sent = await hook({ id: 'evt_' + id, type: 'checkout.session.completed', data: { object: sessions.get(id) } });
      const mail = mails().filter(m => m.to[0] === email.toLowerCase() && m.subject === 'Your Tourbook licence').at(-1);
      return { id, code, ref: sent.ref, mailed: !!mail && mail.text.includes(code), refund: () => hook({ id: 'evt_r' + id, type: 'charge.refunded', data: { object: { refunded: true, payment_intent: sessions.get(id).payment_intent } } }) };
    };

    /* =============== the desktop app's licence (desktop/licence.cjs) against the server, in Node =============== */
    // The desktop app's requests, as netPost and netPrice make them (desktop/licence.cjs), answered by the Worker. The
    // Date of a JSON answer is the server's time: Cloudflare adds the header, workerd under Miniflare does not, so it
    // is added here.
    const desk = { asked: [], country: 'GB' };
    const deskPost = async (url, body) => { const u = new URL(url); desk.asked.push(u.pathname); const r = await live.dispatchFetch(SITE + u.pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cf: { country: desk.country } }); let b = {}, json = false; try { b = JSON.parse(await r.text()); json = true; } catch { /* not the server's */ } return { status: r.status, body: b && typeof b === 'object' ? b : {}, date: json ? Date.now() : 0 }; };
    const deskPrice = async url => { const u = new URL(url); desk.asked.push(u.pathname); const r = await live.dispatchFetch(SITE + u.pathname, { cf: { country: desk.country } }); if (!r.ok) return null; const b = await r.json(); return { ...b, date: Date.now() }; };
    const computer = n => createLicence({ dir: path.join(tmp, 'pc' + n), keys: KEYS, on: true, post: deskPost, site: SITE, os: 'Linux' });
    {
      const jo = await buy('Jo Desk', 'Jo.Desk@example.com');
      ok('a purchase: the thank-you page shows a TOURBOOK- code, and the same code is emailed', /^TOURBOOK-/.test(jo.code) && jo.mailed && /^2:\d+$/.test(jo.ref || ''), JSON.stringify({ code: jo.code.slice(0, 12), ref: jo.ref }));
      const pcs = [1, 2, 3, 4].map(computer);
      let st = await pcs[0].state();
      ok('desktop: switched on (the switch and key 1), the free days wait for a working role', st.mode === 'unstarted' && st.enabled && desk.asked.length === 0, JSON.stringify(st));
      st = await pcs[0].start();
      ok('…start() begins the 30 free days on this computer, asking nothing of the server', st.mode === 'trial' && st.trialLeft === 30 && desk.asked.length === 0);
      const on3 = [];
      for (const pc of pcs.slice(0, 3)) on3.push(await pc.enter('Your code:\n' + jo.code + '\nThanks!'));
      ok('the emailed code, pasted with the words around it, licenses 3 computers (each activated by the server, its receipt signed)', on3.every(s => s.mode === 'licensed' && s.canEdit && s.licence && s.licence.email === 'jo.desk@example.com' && s.licence.name === 'Jo Desk' && !s.offline), JSON.stringify(on3.map(s => s.mode || s.error)));
      const full = await pcs[3].enter(jo.code);
      ok('…a 4th is told the licence is full, with the 3 computers listed and the moves left', full.error === 'full' && full.computers.length === 3 && full.computers.every(c => c.os === 'Linux') && full.swapsLeft > 0 && full.seats === 3, JSON.stringify(full));
      const moved = await pcs[3].enter(jo.code, { release: full.computers[0].tag });
      ok('…Move it here: the 4th is licensed', moved.mode === 'licensed', JSON.stringify(moved));
      const told = await Promise.all(pcs.slice(0, 3).map(pc => pc.recheck(true)));
      ok('…and at their next check the one moved off says so (released), the other two stay licensed', told.filter(s => s.mode === 'released').length === 1 && told.filter(s => s.mode === 'licensed').length === 2, JSON.stringify(told.map(s => s.mode)));
      const keep = pcs.slice(0, 3).filter((pc, i) => told[i].mode === 'licensed');
      const freed = await keep[0].release();
      ok('Release this computer: the server takes it off, the code leaves this computer, its free days go on', (freed.mode === 'trial' || freed.mode === 'unstarted') && !(await keep[0].code()) && desk.asked.includes('/licence/release'), JSON.stringify(freed));
      const rf = await jo.refund();
      const after = await keep[1].recheck(true);
      ok('a refund (Stripe\'s charge.refunded) cancels the code: the computer\'s next check says so, read-only once its free days are over', rf.cancelled === 1 && after.mode === 'cancelled' && after.licence && after.licence.ref === jo.ref, JSON.stringify({ rf, mode: after.mode }));
      // The price, and the server's time: a computer whose free days were started with its clock five days ahead.
      const handlers = new Map(), sent = [];
      const dir = path.join(tmp, 'pc-clock');
      fs.mkdirSync(dir, { recursive: true });
      const ahead = Date.now() + 5 * DAY;
      fs.writeFileSync(path.join(dir, 'licence.json'), JSON.stringify({ install: 'e2eClockInstall0000000', first: ahead, seen: ahead }));
      const wired = wireLicence({ ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) }, fromApp: e => e === 'app', getWindow: () => ({ isDestroyed: () => false, webContents: { send: (ch, s) => sent.push([ch, s.mode]) } }), open: () => {}, dir, site: SITE, keys: KEYS, on: true, post: deskPost, price: deskPrice });
      const before = await handlers.get('licence:state')('app');
      const price = await handlers.get('licence:price')('app');
      const fixed = await handlers.get('licence:state')('app');
      ok('desktop: a start five days ahead of the clock counts as a wrong clock (read-only)', before.mode === 'clock' && before.canEdit === false, JSON.stringify(before));
      ok('…the price comes from the server for the country (the UK: 24.00 USD with 20% VAT)', price && price.taxed && price.taxed.total === '24.00' && price.taxed.tax === 'VAT' && price.taxed.rate === 20, JSON.stringify(price));
      ok('…and that answer\'s time puts the start right: the free days again, none lost, the page told', fixed.mode === 'trial' && fixed.trialLeft === 30 && Math.abs(fixed.first - Date.now()) < 60e3 && sent.some(([ch, m]) => ch === 'licence:changed' && m === 'trial'), JSON.stringify({ fixed, sent }));
      ok('…and a page that is not Tourbook\'s own is refused', (await handlers.get('licence:price')('elsewhere')).error === 'refused' && !!wired);
    }

    /* =============== the web app against the server, in Chromium =============== */
    browser = await chromium.launch();
    const label = id => (id === 'all' ? roles.EVERYTHING.label : roles.ROLES.find(r => r.id === id).label);
    // What the page asks of the licence server goes to the Worker: box.asked (its paths), box.away (anything outside
    // this test's own address), box.skew (the server's clock against the real one), box.offline, box.paused.
    const newBox = country => ({ asked: [], away: [], country, skew: 0, offline: false, paused: false });
    const forward = box => async r => {
      const q = r.request(), u = new URL(q.url()), method = q.method();
      box.asked.push(u.pathname);
      if (box.offline) return r.abort();
      const res = await (box.paused ? paused : live).dispatchFetch(SITE + u.pathname + u.search, { method, redirect: 'manual', cf: { country: box.country },
        ...(method === 'GET' || method === 'HEAD' ? {} : { headers: { 'Content-Type': q.headers()['content-type'] || 'application/json' }, body: q.postData() || '' }) });
      const headers = {}; res.headers.forEach((v, k) => { if (!/^(content-length|transfer-encoding|content-encoding)$/.test(k)) headers[k] = v; });
      headers.date = new Date(Date.now() + box.skew).toUTCString();
      await r.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
    };
    const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    // A page of Tourbook with the licence live on this host. seed: localStorage written once, before the first page. The
    // page's clock: window.__clock(ms), kept through reloads (sessionStorage t-clock). init: another script to add.
    const open = async (box, { seed = {}, firstRun = false, init = null, binding = null } = {}) => {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
      ctx.on('request', q => { if (!q.url().startsWith(BASE) && !q.url().startsWith('data:') && !q.url().startsWith('blob:')) box.away.push(q.url()); });
      await ctx.route('**/js/licence-config.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: "export const LICENCE_SITES = ['localhost', '127.0.0.1'];\n" }));
      await ctx.route('**/js/licence-keys.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: `export const LICENCE_KEYS = ${JSON.stringify(KEYS)};\n` }));
      await ctx.route(u => { const p = new URL(u).pathname; return u.origin + '/' === BASE && (p.startsWith('/licence/') || p === '/buy'); }, forward(box));
      await ctx.route(u => u.hostname === 'buy.stripe.com', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Stripe’s checkout (a stand-in)</p>' }));
      await ctx.route(/tile\.openstreetmap\.org/, r => r.fulfill({ status: 200, contentType: 'image/png', body: tile }));
      await ctx.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[]}}' }));
      if (binding) await ctx.exposeBinding('__ipc', binding);
      await ctx.addInitScript(([seed, firstRun]) => {
        const R = Date; let at = null, t0 = 0;
        const now = () => (at === null ? R.now() : at + (R.now() - t0));
        function D(...a) { if (!new.target) return new R(now()).toString(); return a.length ? new R(...a) : new R(now()); }
        D.prototype = R.prototype; D.now = now; D.parse = R.parse; D.UTC = R.UTC;
        globalThis.Date = D;
        window.__clock = ms => { at = ms; t0 = R.now(); sessionStorage.setItem('t-clock', String(ms)); };
        try {
          const kept = sessionStorage.getItem('t-clock'); if (kept) window.__clock(Number(kept));
          if (!localStorage.getItem('t-seeded')) { localStorage.setItem('t-seeded', '1'); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }
          if (!firstRun) { localStorage.setItem('tourbook-tour', 'done'); localStorage.setItem('tourbook-role-nudged', '1'); }
          localStorage.setItem('tourbook-ask-seen', 'off');
        } catch (e) { /* ignore */ }
        window.__toasts = [];
        new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }))).observe(document, { childList: true, subtree: true });
      }, [seed, firstRun]);
      if (init) await ctx.addInitScript(init);
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(e.message));
      // The server's own refusals (a 401 or 403 from the check, a wrong code's 400) are the browser's network lines, not the app's errors.
      page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || /Content Security Policy|Refused to/.test(t)) && !/^Failed to load resource: (the server responded with a status of (400|401|403|404)|net::ERR_FAILED)/.test(t)) errors.push(t); });
      page.on('dialog', d => d.accept());
      await page.goto(BASE);
      await page.waitForSelector('#deck .dk-next');
      return { ctx, page };
    };
    const state = page => page.evaluate(() => import('./js/licence-state.js').then(m => m.licenceReady().then(() => m.licenceNow())));
    const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('tourbook-licence') || '{}'));
    const toasts = page => page.evaluate(() => window.__toasts.slice());
    const sheets = page => page.$$eval('.sheet', els => els.map(x => x.getAttribute('aria-label')));
    const go = (page, id) => page.evaluate(t => window.logiGo(t), id);
    const reload = async page => { await page.reload(); await page.waitForSelector('#deck .dk-next'); };
    const closeAll = async page => { for (let i = 0; i < 6 && (await sheets(page)).length; i++) { await page.evaluate(() => { const all = document.querySelectorAll('.sheet'); const s = all[all.length - 1]; s && s.querySelector('.sheet-head [aria-label="Close"]').click(); }); await sleep(250); } };
    // A change to this device's data, as any page makes one: true when it was kept (the licence's gate let it through).
    const write = async page => { const r = await page.evaluate(() => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, notes: 'e2e ' + Date.now() }; }))); await sleep(200); await closeAll(page); return r; };
    const later = async (page, box, days) => { box.skew = days * DAY; await page.evaluate(ms => window.__clock(ms), Date.now() + days * DAY); await reload(page); };
    const agree = async page => { await page.waitForSelector('#lic-terms-ok', { timeout: 8000 }); await page.check('#lic-terms-ok'); await page.click('#lic-terms-agree'); await sleep(1200); };
    // Sign in (I have one) on whatever shows the button, with the 6-digit code the server emails.
    const signIn = async (page, where, email) => {
      await page.click(`${where} .lic-enter`); await page.waitForSelector('#lic-email');
      await page.fill('#lic-email', email); await page.click('#lic-send');
      await page.waitForSelector('#lic-digits', { state: 'visible', timeout: 8000 });
      const code = lastCode(email.toLowerCase());
      await page.fill('#lic-digits', code || ''); await page.click('#lic-verify'); await sleep(1200);
      return code;
    };
    const STARTED = /^Your 30 free days of Tourbook’s working roles have started on this device: until .+\.$/;

    /* ---------------- a free Audiophile ---------------- */
    {
      const box = newBox('DE');
      const fan = await buy('Ali Fan', 'ali.fan@example.com');
      const { ctx, page } = await open(box, { firstRun: true });
      await page.waitForSelector('.sheet[aria-label="Who’s using Tourbook?"]', { timeout: 8000 });
      await page.click('.rp-ask .rp-card[data-role="audiophile"]');
      await page.waitForSelector('.tour-card'); await page.click('.tour-actions .btn.ghost');
      const own = [];
      for (const id of ['acts', 'venues', 'tools', 'card', 'settings', 'bookings']) { own.push(await go(page, id)); await sleep(250); }
      await go(page, 'settings'); await sleep(300); await page.evaluate(() => { document.getElementById('se-about').open = true; }); await sleep(600);
      await go(page, 'bookings'); await sleep(200);
      const show = await page.evaluate(() => import('./js/store.js').then(s => !!s.upsert('bookings', { id: 'e2e-show', kind: 'show', status: 'confirmed', title: 'Front row', date: '2026-12-01' })));
      await sleep(2500); // the idle work and the status's 1.5 s
      const st = await state(page);
      ok('a free Audiophile: its calendar, bands, venues, tools, My card and settings open, a show is kept, and nothing is asked of the licence server', own.every(x => x === true) && show && st.mode === 'unstarted' && box.asked.length === 0 && !(await sheets(page)).length, JSON.stringify({ own, st, asked: box.asked }));
      const opening = page.evaluate(() => window.logiGo('people'));
      await page.waitForSelector('.sheet[aria-label="Before you use the working roles"]', { timeout: 8000 });
      await agree(page);
      const opened = await opening, st2 = await state(page);
      ok('…People: the terms sheet first, then the section opens and its 30 free days start, the first question to the server with it', opened === true && (await page.evaluate(() => window.logiPage())) === 'people' && st2.mode === 'trial' && (await toasts(page)).some(t => STARTED.test(t)) && box.asked.includes('/licence/web/status') && (await stored(page)).on === true, JSON.stringify({ opened, st2, asked: box.asked }));
      await later(page, box, 31); await sleep(800);
      const st3 = await state(page), locked = await go(page, 'people'), offer = await sheets(page);
      const priced = await page.waitForFunction(() => /Buy a licence · 23\.80 USD with VAT/.test((document.querySelector('.sheet.licence-needed') || {}).textContent || ''), null, { timeout: 5000 }).then(() => true, () => false);
      ok('…31 days on: People needs a licence (the offer, with the price the server gives for Germany) and the calendar stays', st3.mode === 'ended' && locked === false && offer.join() === 'People needs a licence' && priced && (await page.evaluate(() => window.logiPage())) === 'bookings', JSON.stringify({ st3: st3.mode, locked, offer, text: await page.textContent('.sheet.licence-needed') }));
      ok('…its own things still change', await page.evaluate(() => import('./js/store.js').then(s => !!s.upsert('bookings', { id: 'e2e-show2', kind: 'show', status: 'confirmed', title: 'Second row', date: '2026-12-02' }))));
      const pin = await signIn(page, '.sheet.licence-needed', 'ali.fan@example.com');
      const st4 = await state(page);
      ok('…Sign in (I have one) with the code the server emailed: licensed, and People opens', /^\d{6}$/.test(pin || '') && st4.mode === 'licensed' && st4.licence.ref === fan.ref && (await go(page, 'people')) === true && (await toasts(page)).includes('Licensed: every role on this device.'), JSON.stringify(st4));
      ok('…nothing went anywhere but this test\'s address', box.away.length === 0, box.away.slice(0, 3).join(' '));
      await ctx.close();
    }

    /* ---------------- each working role ---------------- */
    const COUNTRY = { producer: ['DE', '23.80 USD with VAT'], manager: ['GB', '24.00 USD with VAT'], band: ['AU', '22.00 USD with GST'], solo: ['FI', '25.10 USD with VAT'], scout: ['US', '20 USD'], all: ['DE', '23.80 USD with VAT'] };
    const working = [...roles.ROLES.map(r => r.id).filter(roles.roleNeedsLicence), 'all'];
    ok('the working roles are the five and Jack of Trades', working.length === 6 && working.every(id => COUNTRY[id]), working.join());
    let kept = null;
    for (const id of working) {
      const L = label(id), As = id === 'all' ? `in the ${L} role` : `as ${L}`, [country, tag] = COUNTRY[id], email = `${id}.e2e@example.com`;
      const lic = await buy(L + ' Buyer', email);
      const box = newBox(country);
      const { ctx, page } = await open(box, { seed: { 'tourbook-role': id } });
      await page.waitForSelector('.sheet[aria-label="Before you use the working roles"]', { timeout: 8000 });
      await agree(page);
      const st = await state(page);
      ok(`${L}: the terms sheet at the first use, then 30 free days with their toast; the server says the licence is on`, st.mode === 'trial' && st.trialLeft === 30 && (await toasts(page)).some(t => STARTED.test(t)) && box.asked.includes('/licence/web/status') && (await stored(page)).on === true, JSON.stringify({ st, asked: box.asked }));
      ok(`${L}: …it changes things`, await write(page));
      await later(page, box, 31);
      await page.waitForSelector('.sheet.licence-over', { timeout: 8000 }); await sleep(900);
      const words = await page.textContent('.sheet.licence-over');
      ok(`${L}: 31 days on, the free days are over: read-only ${As}, Buy at the price where the buyer is (${country}: ${tag})`, words.includes(`Tourbook is read-only ${As} on this device until there is a licence`) && words.includes('Buy a licence · ' + tag) && box.asked.includes('/licence/price'), words.slice(0, 160));
      const pin = await signIn(page, '.sheet.licence-over', email);
      const st2 = await state(page), rec = await stored(page);
      ok(`${L}: …signed in with the emailed code: licensed, the token the server signed checked in the browser`, /^\d{6}$/.test(pin || '') && st2.mode === 'licensed' && st2.licence.email === email && st2.licence.ref === lic.ref && rec.token && rec.token.kid === 2 && !(await sheets(page)).length, JSON.stringify(st2));
      ok(`${L}: …it changes things again, kept through a reload`, (await write(page)) && (await reload(page), (await state(page)).mode === 'licensed'));
      ok(`${L}: …nothing went anywhere but this test's address`, box.away.length === 0, box.away.slice(0, 3).join(' '));
      if (id === 'producer') kept = { ctx, page, box, lic }; else await ctx.close();
    }

    /* ---------------- a refund, and the owner's pause ---------------- */
    {
      const { ctx, page, box, lic } = kept;
      const rf = await lic.refund();
      await page.evaluate(() => import('./js/licence-web.js').then(m => m.recheck(true))); await sleep(500);
      const st = await state(page), rec = await stored(page);
      ok('a refund: the website\'s next check signs it out (cancelled), read-only again', rf.cancelled === 1 && st.mode === 'cancelled' && st.canEdit === false && !rec.token && rec.cancelled === true && !(await write(page)), JSON.stringify({ rf, st }));
      await reload(page);
      await page.waitForSelector('.sheet.licence-over', { timeout: 8000 });
      ok('…and at the next opening its sheet says the licence was cancelled', (await sheets(page)).join() === 'Your licence has been cancelled', (await sheets(page)).join());
      await closeAll(page);
      const first = rec.first;
      box.paused = true;
      await page.evaluate(() => import('./js/licence-web.js').then(m => m.status(true))); await sleep(400);
      const off = await state(page);
      ok('the owner\'s pause (WEB_SIGN_IN off at the server): { on: false }, everything open, every change kept', (await stored(page)).on === false && off.mode === 'off' && (await write(page)) && (await go(page, 'money')) === true, JSON.stringify(off));
      box.paused = false;
      await page.evaluate(() => import('./js/licence-web.js').then(m => m.status(true))); await sleep(400);
      const back = await state(page), rec2 = await stored(page);
      ok('…on again: back as it was (cancelled, read-only), the free days not moved', rec2.on === true && back.mode === 'cancelled' && rec2.first === first && !(await write(page)), JSON.stringify({ back, first, now: rec2.first }));
      await ctx.close();
    }

    /* ---------------- a wrong clock, put right by the server's time ---------------- */
    {
      const box = newBox('US');
      box.offline = true; // the free days start while the device's clock is five days on and nothing answers
      const { ctx, page } = await open(box, { seed: { 'tourbook-role': 'manager' }, init: `try { if (!sessionStorage.getItem('t-clock')) window.__clock(Date.now() + 5 * ${DAY}); } catch (e) {}` });
      await page.waitForSelector('.sheet[aria-label="Before you use the working roles"]', { timeout: 8000 });
      await agree(page);
      const ahead = (await stored(page)).first;
      ok('the free days start while the clock is five days on and the server cannot be reached', (await state(page)).mode === 'trial' && ahead > Date.now() + 4 * DAY, String(ahead - Date.now()));
      await page.evaluate(ms => window.__clock(ms), Date.now()); await reload(page);
      await page.waitForSelector('.sheet.licence-over', { timeout: 8000 });
      const st = await state(page);
      ok('…the clock put back: the start is in the future, so the days count as over (clock), read-only, and the sheet says why', st.mode === 'clock' && (await sheets(page)).join() === 'Your device’s clock looks wrong' && !(await write(page)), JSON.stringify(st));
      box.offline = false;
      await page.evaluate(() => import('./js/licence-web.js').then(m => m.status(true))); await sleep(500);
      const st2 = await state(page), rec = await stored(page);
      ok('…the server\'s answer (its Date) puts the start right: the free days again, none of them lost', st2.mode === 'trial' && st2.trialLeft === 30 && Math.abs(rec.first - Date.now()) < 60e3 && (await write(page)), JSON.stringify({ st2, first: rec.first - Date.now() }));
      await ctx.close();
    }

    /* ---------------- the desktop app's page: the real desktop licence through its bridge ---------------- */
    {
      const box = newBox('GB'); // the page's own requests: none are expected (the desktop app's main process asks)
      desk.asked.length = 0; desk.country = 'GB';
      const sam = await buy('Sam Desk', 'sam.desk@example.com');
      const handlers = new Map();
      let page = null;
      const win = { isDestroyed: () => false, webContents: { send: (ch, s) => { if (page) page.evaluate(s => window.__licChanged && window.__licChanged(s), s).catch(() => {}); } } };
      wireLicence({ ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) }, fromApp: e => e === 'app', getWindow: () => win, open: () => {}, dir: path.join(tmp, 'desk-page'), site: SITE, keys: KEYS, on: true, post: deskPost, price: deskPrice });
      // window.tourbookDesktop as desktop/preload.cjs gives it (the licence part), each call through the IPC handlers above.
      const bridge = `(() => {
        const call = (ch, ...a) => window.__ipc(ch, ...a), L = [];
        window.__licChanged = s => L.forEach(f => f(s));
        window.tourbookDesktop = { platform: 'linux', updateState: async () => ({ status: 'current' }), checkForUpdates: async () => ({ status: 'current' }), onStatus: () => () => {},
          licence: { state: () => call('licence:state'), start: () => call('licence:start'), adopt: t => call('licence:adopt', Number(t)),
            enter: (code, opts) => call('licence:enter', String(code || ''), opts && typeof opts.release === 'string' ? { release: opts.release } : {}),
            recheck: () => call('licence:recheck'), release: () => call('licence:release'), code: () => call('licence:code'), buy: () => call('licence:buy'),
            localPrice: () => call('licence:price'), onChange: cb => { L.push(cb); return () => {}; } } };
      })();`;
      const opened = await open(box, { seed: { 'tourbook-role': 'band' }, init: bridge, binding: (src, ch, ...a) => handlers.get(ch)('app', ...a) });
      page = opened.page;
      await page.waitForSelector('.sheet[aria-label="Before you use the working roles"]', { timeout: 8000 });
      await agree(page);
      const st = await state(page);
      ok('desktop page: the terms sheet at the first use, then licence.start() through the bridge: 30 free days in licence.json', st.kind === 'desktop' && st.mode === 'trial' && st.trialLeft === 30 && JSON.parse(fs.readFileSync(path.join(tmp, 'desk-page', 'licence.json'), 'utf8')).first > 0, JSON.stringify(st));
      await go(page, 'settings'); await sleep(300); await page.evaluate(() => { document.getElementById('se-about').open = true; }); await page.waitForSelector('.licence-panel:not([hidden])'); await sleep(800);
      ok('…About & licence: Buy at the price the server gives for the UK (24.00 USD with VAT), asked by the app, not the page', /Buy a licence · 24\.00 USD with VAT/.test(await page.textContent('.licence-panel .lic-buy')) && desk.asked.includes('/licence/price'), desk.asked.join(' '));
      await page.click('.licence-panel .lic-enter'); await page.waitForSelector('.licence-code');
      await page.fill('.licence-code', 'Hi Sam,\nYour code: ' + sam.code + '\n'); await page.click('#lic-activate'); await sleep(1500);
      const st2 = await state(page);
      ok('…Enter licence code, pasted from the email: the server activates this computer, licensed to the buyer', st2.mode === 'licensed' && st2.licence.email === 'sam.desk@example.com' && desk.asked.includes('/licence/activate') && /^Licensed to Sam Desk \(sam\.desk@example\.com\) · up to 3 devices\.$/.test(await page.textContent('.licence-panel .licence-line')) && (await toasts(page)).includes('Licensed: every role on this device.'), JSON.stringify(st2));
      ok('…and the page itself sent nothing to a licence server, nor anywhere else', box.asked.length === 0 && box.away.length === 0, [...box.asked, ...box.away].join(' '));
      await opened.ctx.close();
    }
  } catch (e) {
    ok('licence end to end crashed', false, e && e.stack || String(e));
  } finally {
    ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
    if (browser) await browser.close().catch(() => {});
    for (const m of workers) await m.dispose().catch(() => {});
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
})();
