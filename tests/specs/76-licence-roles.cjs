// The licence live on the website (js/licence-config.js routed to this host; the licence server faked by Playwright
// routes answering the build spec §3.9): which roles and sections are free, when the 30 free days start (a working role
// picked or used, never the free Audiophile's own sections), the terms sheet at the first paid use, the marks on the
// bonus tracks and the More boxes fold, the working boxes and paid records a free Audiophile reaches (locked once the
// free days are over, as the owner answered), the Audiophile's + New making only shows and its sessions kept
// read-only, the free days over (the sheet at opening, before "Did you see them?"; read-only; Carry on free as an
// Audiophile; a working form left open goes when the working roles close), and the guards (the second copy in
// IndexedDB, a wrong clock and the server's time, the pause).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { passStart } = require('../helpers.cjs');
const BASE = process.env.TOURBOOK_URL || 'http://localhost:8124/';
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 864e5, HOUR = 3600e3;
const TERMS_V = (() => { try { return (/TERMS_VERSION = '([^']*)'/.exec(fs.readFileSync(path.join(process.env.TOURBOOK_ROOT || path.join(__dirname, '..', '..'), 'js', 'terms.js'), 'utf8')) || [])[1] || ''; } catch { return ''; } })();
const isoIn = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ------------------------------ the kit (the same in 76-78) ------------------------------ */
// The fake licence server: srv.on (the status), srv.status ('json' | 'abort' | 'html'), srv.offline (every request
// fails), srv.date (its time, the Date header of every JSON answer), every path asked in srv.asked.
const server = () => ({ on: true, status: 'json', offline: false, asked: [], date: () => new Date() });
async function route(ctx, srv) {
  await ctx.route(u => { const p = new URL(u).pathname; return p.startsWith('/licence/') || p === '/buy'; }, async r => {
    const p = new URL(r.request().url()).pathname; srv.asked.push(p);
    if (srv.offline) return r.abort();
    const json = (status, body) => r.fulfill({ status, contentType: 'application/json; charset=utf-8', headers: { date: srv.date().toUTCString(), 'cache-control': 'no-store' }, body: JSON.stringify(body) });
    if (p === '/licence/web/status') {
      if (srv.status === 'abort') return r.abort();
      if (srv.status === 'html') return r.fulfill({ status: 404, contentType: 'text/html', body: '<h1>Not found</h1>' });
      return json(200, { on: srv.on });
    }
    if (p === '/licence/price') return json(200, { price: '20.00', currency: 'USD', country: '', taxed: null });
    if (p === '/buy') return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>The shop</p>' });
    return json(404, { error: 'not-found' });
  });
}
// A page of Tourbook with the licence live. seed: localStorage written once, before the first page (kept through reloads
// and other tabs: the spec's own changes survive). Every load: the welcome tour seen and the role card dismissed unless
// firstRun, the question as asked. The page's clock: window.__clock(ms) (sessionStorage t-clock keeps it through reloads).
async function openLive(browser, errors, { seed = {}, firstRun = false, ask = 'off', clockAt = null, keys = null, init = null } = {}) {
  const srv = server();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
  await ctx.route('**/js/licence-config.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: "export const LICENCE_SITES = ['localhost', '127.0.0.1'];\n" }));
  if (keys) await ctx.route('**/js/licence-keys.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: `export const LICENCE_KEYS = ${JSON.stringify(keys)};\n` }));
  await ctx.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[]}}' }));
  await route(ctx, srv);
  await ctx.addInitScript(([seed, firstRun, ask, clockAt]) => {
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
      if (!firstRun) { localStorage.setItem('tourbook-tour', 'done'); localStorage.setItem('tourbook-role-nudged', '1'); }
      if (ask) localStorage.setItem('tourbook-ask-seen', ask);
    } catch (e) { /* ignore */ }
    window.__toasts = [];
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }))).observe(document, { childList: true, subtree: true });
  }, [seed, firstRun, ask, clockAt]);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  // The fake server's own refusals (a 404 page, an aborted request) are the browser's network lines, not the app's errors.
  page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || /Content Security Policy|Refused to/.test(t)) && !/^Failed to load resource: (the server responded with a status of (400|401|403|404)|net::ERR_FAILED)/.test(t)) errors.push(t); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE);
  await page.waitForSelector('#deck .dk-next');
  return { ctx, page, srv };
}
const state = page => page.evaluate(() => import('./js/licence-state.js').then(m => m.licenceNow()));
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('tourbook-licence') || '{}'));
const second = page => page.evaluate(() => import('./js/kv.js').then(k => k.kvGet('licence-days')).catch(() => null));
const toasts = page => page.evaluate(() => window.__toasts.slice());
const sheets = page => page.$$eval('.sheet', els => els.map(x => x.getAttribute('aria-label')));
const go = (page, id) => page.evaluate(t => window.logiGo(t), id);
const reload = async page => { await page.reload(); await page.waitForSelector('#deck .dk-next'); };
const setLicence = (page, v) => page.evaluate(v => localStorage.setItem('tourbook-licence', JSON.stringify(v)), v);
const closeTop = async page => { await page.evaluate(() => { const all = document.querySelectorAll('.sheet'); const s = all[all.length - 1]; s && s.querySelector('.sheet-head [aria-label="Close"]').click(); }); await sleep(250); };
const sleeve = async page => {
  await page.click('#deck .dk-list'); await page.waitForSelector('.dk-sheet');
  const out = await page.$$eval('.dk-sheet .dk-bonus .dk-track', bs => bs.map(b => ({ id: b.dataset.section, mark: (b.querySelector('.dk-track-lock') || {}).textContent || '', label: b.getAttribute('aria-label') || '' })));
  return out;
};
const trialFrom = (first, extra = {}) => ({ on: true, statusAt: Date.now(), first, seen: Date.now(), ...extra });
const ended = () => trialFrom(Date.now() - 31 * DAY, { seen: Date.now() - HOUR });
const agreed = () => ({ v: TERMS_V, at: Date.now() });
const sampleIn = async page => { await page.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(200); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  try {
    /* =========== before any paid use: the first run, the picker, the terms sheet =========== */
    {
      const { ctx, page, srv } = await openLive(browser, errors, { firstRun: true });
      await page.waitForSelector('.sheet[aria-label="Who’s using Tourbook?"]', { timeout: 8000 });
      let st = await state(page);
      ok('before any paid use the state is unstarted, and nothing is counted', st.mode === 'unstarted' && st.started === false && st.trialLeft === 30 && !(await stored(page)).first, JSON.stringify(st));
      const badges = await page.$$eval('.rp-ask [data-role]', bs => Object.fromEntries(bs.map(b => [b.dataset.role, (b.querySelector('.rp-licence') || {}).textContent || ''])));
      ok('the picker says which roles are free and which have 30 free days', badges.audiophile === 'Free' && ['producer', 'manager', 'band', 'solo', 'scout', 'all'].every(id => badges[id] === '30 days free, then a licence'), JSON.stringify(badges));
      ok('…and the first-run words say so, the Audiophile for personal use, not for work (decisions §21)', /Audiophile is free, for personal use, not for work\. The other roles, Jack of Trades included, are free for 30 days on this device, then need a licence: 20 USD once plus any tax where you live, for up to 3 of your devices\./.test(await page.textContent('.rp-intro')), await page.textContent('.rp-intro'));
      ok('…and so does the Audiophile’s own card, where it is picked', /\. For personal use, not for work\.$/.test(await page.textContent('.rp-ask .rp-card[data-role="audiophile"] .rp-blurb')), await page.textContent('.rp-ask .rp-card[data-role="audiophile"] .rp-blurb'));
      await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('rp-card'), null, { timeout: 2000 }).catch(() => {});
      // Jack of Trades (item 16) is the first card, at the top of the list (the owner, 15 Nov 2026), and takes the focus; its
      // badge is on that card, as on the others. The old "Not sure? Show me everything" button is gone, and nothing on the
      // question, the licence's sentence included, says Everything.
      ok('…Jack of Trades is the first card and carries its badge on the card; no Show me everything button, no Everything in the words', (await page.$$eval('.rp-ask .rp-card', bs => bs.map(b => b.dataset.role).join())) === 'all,producer,manager,band,solo,scout,audiophile'
        && (await page.textContent('.rp-ask .rp-card[data-role="all"] .rp-licence')) === '30 days free, then a licence' && (await page.locator('.rp-ask .rp-all').count()) === 0 && !/everything/i.test(await page.textContent('.rp-ask')), await page.textContent('.rp-ask'));
      ok('…and the focus is on that first card, Jack of Trades', await page.evaluate(() => { const a = document.activeElement; return !!a && a.dataset.role === 'all' && a === document.querySelector('.rp-ask .rp-card'); }), await page.evaluate(() => (document.activeElement || {}).dataset?.role || (document.activeElement || {}).tagName));
      await page.click('.rp-ask .rp-card[data-role="audiophile"]');
      await passStart(page); // the Audiophile's start on a device with nothing in it (js/start.js): a band, a venue and a gig
      await page.click('.tour-actions .btn.ghost'); // Skip
      await sleep(2600); // the idle work and the status's 1.5 s
      st = await state(page);
      ok('picking the Audiophile, and its start (a band, a venue and a gig), starts nothing and sends nothing to the licence server', (await page.evaluate(() => localStorage.getItem('tourbook-role'))) === 'audiophile' && st.mode === 'unstarted' && srv.asked.length === 0 && !(await second(page)), JSON.stringify({ st, asked: srv.asked }));
      // Settings → Your role: Producer asks the terms first; Not now changes nothing.
      await go(page, 'settings'); await sleep(300);
      await page.evaluate(() => { document.getElementById('se-role').open = true; }); await sleep(200);
      // The line under the cards says what the first-run words say: the Audiophile free, for personal use, not for work.
      ok('Settings → Your role’s licence line, before any paid use: the Audiophile is free for good, for personal use, not for work; the other roles have 30 free days, then a licence', /^Audiophile is free for good, for personal use, not for work\. The other roles, Jack of Trades included, are free for 30 days on this device from the first time you use one, then need a licence: 20 USD once plus any tax where you live, for up to 3 of your devices\.$/.test(await page.textContent('.rp-licence-line p')), await page.textContent('.rp-licence-line p'));
      await page.click('#se-role .rp-card[data-role="producer"]');
      await page.waitForSelector('.sheet[aria-label="Before you use the working roles"]');
      ok('picking Producer shows the terms sheet first, with its tick box and Agree off until ticked', await page.$eval('#lic-terms-agree', b => b.disabled) && /I am 18 or over, and I have read and agree to the terms of service\./.test(await page.textContent('.lic-terms-check')) && (await page.locator('.lic-terms a[href="terms.html"]').count()) > 0 && (await page.locator('.lic-terms a[href="privacy.html"]').count()) > 0);
      // Its first line stands for the short version's Audiophile point, which the sheet leaves out (terms.html, section 3).
      ok('…its first line says the Audiophile stays free, for personal use, not for work', /for up to 3 of your devices\. Audiophile stays free, for personal use, not for work\. To use the working roles, please read and agree to Tourbook’s terms\.$/.test(await page.textContent('.lic-terms-sheet form > p')), await page.textContent('.lic-terms-sheet form > p'));
      // At 420×900 the sheet scrolls; it opens at its top (the free days and the price first), the tick box focused.
      await sleep(400);
      const top = await page.evaluate(() => { const p = document.querySelector('.lic-terms-sheet form > p'), r = p.getBoundingClientRect(); return { top: Math.round(r.top), sheet: Math.round(document.querySelector('.lic-terms-sheet').getBoundingClientRect().top), focus: document.activeElement && document.activeElement.id }; });
      ok('…it opens at its top, its first line (the free days and the price) in view, with the tick box focused', top.top >= 0 && top.top >= top.sheet && top.focus === 'lic-terms-ok', JSON.stringify(top));
      await page.click('#lic-terms-later'); await sleep(400);
      st = await state(page);
      ok('…Not now keeps the role as it was and starts nothing', (await page.evaluate(() => localStorage.getItem('tourbook-role'))) === 'audiophile' && st.mode === 'unstarted' && !(await stored(page)).first && !(await page.evaluate(() => localStorage.getItem('tourbook-terms'))), JSON.stringify(st));
      await page.click('#se-role .rp-card[data-role="producer"]');
      await page.waitForSelector('#lic-terms-ok');
      await page.check('#lic-terms-ok');
      await page.click('#lic-terms-agree'); await sleep(900);
      st = await state(page);
      const rec = await stored(page), kv = await second(page), tl = await toasts(page);
      ok('…Agree starts the free days: the role, the toast, the start in tourbook-licence and in IndexedDB', (await page.evaluate(() => localStorage.getItem('tourbook-role'))) === 'producer' && st.mode === 'trial' && st.trialLeft === 30 && rec.first > 0 && kv && kv.first === rec.first && tl.some(t => /^Your 30 free days of Tourbook’s working roles have started on this device: until .+\.$/.test(t)), JSON.stringify({ st, rec, kv, tl }));
      ok('…the terms are kept as agreed, with their version', (await page.evaluate(() => JSON.parse(localStorage.getItem('tourbook-terms')).v)) === TERMS_V);
      ok('…the first requests to the licence server came with that paid use: the status, and the price for the Buy button now drawn', srv.asked.includes('/licence/web/status') && srv.asked.every(p => p === '/licence/web/status' || p === '/licence/price'), srv.asked.join(' '));
      const after = await page.$$eval('#se-role [data-role]', bs => Object.fromEntries(bs.map(b => [b.dataset.role, (b.querySelector('.rp-licence') || {}).textContent || ''])));
      ok('the badges read the free days left', after.audiophile === 'Free' && after.band === 'Free days: 30 left' && after.all === 'Free days: 30 left', JSON.stringify(after));
      ok('…and Settings → Your role’s Audiophile card says it is for personal use, not for work', /\. For personal use, not for work\.$/.test(await page.textContent('#se-role .rp-card[data-role="audiophile"] .rp-blurb')));
      ok('…Your role’s closed line and its licence line say so too', /· 30 free days left$/.test(await page.textContent('#se-role .se-sub')) && /^Your free days: 30 left, until .+\. Audiophile stays free after that, for personal use, not for work\.$/.test(await page.textContent('.rp-licence-line p')));
      ok('…and About is About & licence, with the free days in its line', (await page.textContent('#se-about .twirl-name')) === 'About & licence' && /· free days: 30 left$/.test(await page.textContent('#se-about .se-sub')));
      await ctx.close();
    }

    /* =========== closing "Who's using Tourbook?" with no pick (the lead's decision 1 on the review's design calls) =========== */
    {
      // Jack of Trades ('all') cannot be picked (licences live, the free days over, no licence: after Erase this device,
      // say): closing the question unpicked leaves the device on the Audiophile, not on a read-only Jack of Trades, since
      // "only Audiophile works".
      const { ctx, page } = await openLive(browser, errors, { firstRun: true, seed: { 'tourbook-terms': agreed(), 'tourbook-licence': ended() } });
      await page.waitForSelector('.sheet[aria-label="Who’s using Tourbook?"]', { timeout: 8000 });
      const may = await page.evaluate(() => import('./js/licence-state.js').then(m => m.mayPickRole('all')));
      await closeTop(page); await sleep(900);
      const r = await page.evaluate(() => import('./js/roles.js').then(m => ({ id: m.roleId(), chosen: m.roleChosen(), kept: localStorage.getItem('tourbook-role') })));
      const write = await page.evaluate(() => import('./js/licence-state.js').then(m => m.canWrite()));
      const sh = await sheets(page), tl = await toasts(page);
      ok('free days over, no licence: closing "Who’s using Tourbook?" unpicked leaves the Audiophile (kept as the role), its own things change, no read-only sheet, and a toast says so',
        may === 'locked' && r.id === 'audiophile' && r.chosen === true && r.kept === 'audiophile' && write === true && !sh.some(t => /licen|free days/i.test(t || '')) && tl.some(t => /^Audiophile: free for good, for personal use\./.test(t)),
        JSON.stringify({ may, r, write, sh, tl }));
      ok('…and nothing in the menu is Jack of Trades’: the Audiophile’s six tracks', JSON.stringify(await page.evaluate(() => import('./js/roles.js').then(m => m.menuSections()))) === JSON.stringify(['bookings', 'acts', 'venues', 'tools', 'card', 'settings']));
      await ctx.close();
    }
    {
      // While Jack of Trades can be picked (the free days not started: picking it starts them), closing the question unpicked
      // leaves Jack of Trades, with no role saved, as with the licence off.
      const { ctx, page } = await openLive(browser, errors, { firstRun: true, seed: { 'tourbook-terms': agreed() } });
      await page.waitForSelector('.sheet[aria-label="Who’s using Tourbook?"]', { timeout: 8000 });
      const may = await page.evaluate(() => import('./js/licence-state.js').then(m => m.mayPickRole('all')));
      await closeTop(page); await sleep(900);
      const r = await page.evaluate(() => import('./js/roles.js').then(m => ({ id: m.roleId(), chosen: m.roleChosen(), kept: localStorage.getItem('tourbook-role') })));
      ok('free days not started: closing it unpicked leaves Jack of Trades, no role saved', may === 'start' && r.id === 'all' && r.chosen === false && r.kept === null, JSON.stringify({ may, r }));
      await ctx.close();
    }

    /* =========== the Audiophile before the free days: the marks, a bonus track starts them at once =========== */
    {
      const { ctx, page, srv } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed() } });
      await sampleIn(page);
      const bonus = await sleeve(page);
      ok('the Audiophile’s bonus tracks carry “30 days free”, said with the name', bonus.length === 6 && bonus.every(b => b.mark === '30 days free' && / opens your 30 free days$/.test(b.label)) && bonus.find(b => b.id === 'sessions').label === 'Studio log, opens your 30 free days', JSON.stringify(bonus));
      await page.keyboard.press('Escape'); await sleep(200);
      await page.evaluate(() => import('./js/tutorials.js').then(m => m.openChooser())); await sleep(300);
      const marks = await page.$$eval('.sheet [data-section]', bs => bs.filter(b => b.querySelector('.dk-track-lock')).map(b => b.dataset.section));
      ok('the tutorials chooser marks the same six', marks.sort().join() === 'backline,insurance,money,people,sessions,songs', marks.join());
      await closeTop(page);
      ok('…and nothing has been asked of the licence server yet', srv.asked.length === 0, srv.asked.join(' '));
      const shown = await go(page, 'people'); await sleep(400);
      const st = await state(page), tl = await toasts(page);
      ok('opening a bonus track starts the days at once: it opens, logiGo resolves true, a toast says so (no question first)', shown === true && (await page.evaluate(() => window.logiPage())) === 'people' && st.mode === 'trial' && st.started && tl.some(t => /^Your 30 free days of Tourbook’s working roles have started/.test(t)) && !(await sheets(page)).length, JSON.stringify({ shown, st, tl }));
      const after = await sleeve(page);
      ok('…and the marks are gone', after.every(b => !b.mark), JSON.stringify(after));
      await page.keyboard.press('Escape');
      await ctx.close();
    }
    {
      // The More boxes fold, not started: opening it starts the days and shows the boxes.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed() } });
      await sampleIn(page);
      await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('s-show1'))); await sleep(500);
      const fold = await page.evaluate(() => { const f = document.getElementById('bk-more'); return { mark: (f.querySelector('.dk-track-lock') || {}).textContent, label: f.querySelector('summary').getAttribute('aria-label'), boxes: f.querySelectorAll('.blk').length }; });
      ok('a show’s More boxes fold says “30 days free”, and draws no box yet', fold.mark === '30 days free' && /^More boxes \(\d+\), opens your 30 free days$/.test(fold.label) && fold.boxes === 0, JSON.stringify(fold));
      await page.click('#bk-more > summary'); await sleep(900);
      const open = await page.evaluate(() => { const f = document.getElementById('bk-more'); return { open: f.open, boxes: f.querySelectorAll('.bk-more-blocks .blk').length, mark: !!f.querySelector('.dk-track-lock') }; });
      ok('…opening it starts the free days, then the fold opens with its boxes', open.open && open.boxes > 3 && !open.mark && (await state(page)).started, JSON.stringify(open));
      await ctx.close();
    }

    /* =========== the Audiophile after the free days: locked, offered, only shows =========== */
    {
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(Date.now() - DAY) } });
      await sampleIn(page);
      await setLicence(page, ended()); await reload(page); await sleep(400);
      const st = await state(page);
      ok('31 days on, the Audiophile’s free days are over (ended), and it can still change its own things', st.mode === 'ended' && st.canEdit === false && await page.evaluate(() => import('./js/licence-state.js').then(m => m.canWrite())), JSON.stringify(st));
      const bonus = await sleeve(page);
      ok('its bonus tracks carry “🔒 Licence”, said with the name', bonus.every(b => b.mark === '🔒 Licence' && / needs a licence$/.test(b.label)), JSON.stringify(bonus));
      await page.click('.dk-sheet .dk-bonus .dk-track[data-section="songs"]'); await sleep(500);
      ok('…tapping one offers the licence and stays where it was', (await sheets(page)).includes('Songs needs a licence') && (await page.evaluate(() => window.logiPage())) === 'bookings', (await sheets(page)).join(' | '));
      const offer = await page.evaluate(() => document.querySelector('.sheet.licence-needed').textContent);
      ok('…the offer says the free days are over, what a licence opens, the price, and that its own sections and My card stay free', /Your 30 free days of Tourbook’s working sections are over on this device\./.test(offer) && /A licence opens People, Songs, Studio log, Backline, Money and Insurance, and every role\. It costs 20 USD once plus any tax where you live, for up to 3 of your devices\. Your gigs, bands, venues and tools stay free, and so does My card\./.test(offer) && /Buy a licence · 20 USD/.test(offer) && /Sign in \(I have one\)/.test(offer) && /Not now/.test(offer), offer);
      ok('…and the sheet holds the focus, not Buy', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('licence-needed')));
      await page.click('.sheet.licence-needed .lic-later'); await sleep(250);
      ok('logiGo to a working section resolves false', (await go(page, 'money')) === false);
      await closeTop(page);
      // My card (item 14) is free in every role: on the free Audiophile's menu, it opens at once, with no offer.
      const cardShown = await go(page, 'card'); await sleep(400);
      ok('My card opens for the free Audiophile without a licence (item 14): on its menu, no offer', cardShown === true && (await page.evaluate(() => window.logiPage())) === 'card' && (await page.locator('#cd-title').count()) === 1 && !(await sheets(page)).length && !bonus.some(b => b.id === 'card'), JSON.stringify({ cardShown, sheets: await sheets(page) }));
      // Backline (item 17) and its folds by band: the search's gear card (gearCard) is gated as openGear is, so with Backline
      // locked it gives nothing and draws nothing, and the search falls to openGear, which offers the licence.
      const gearId = await page.evaluate(() => import('./js/store.js').then(s => (s.db.gear.find(g => g.actId) || s.db.gear[0] || {}).id || ''));
      const gc = await page.evaluate(id => import('./js/pages/backline.js').then(m => { const c = m.gearCard(id); return { card: !!c, page: window.logiPage(), drawn: document.querySelectorAll('#page .bl-band, #page [id^="bl-item-"]').length }; }), gearId);
      ok('gearCard with Backline locked gives nothing and draws nothing: no fold, no item, still on My card, no sheet', !!gearId && !gc.card && gc.page === 'card' && gc.drawn === 0 && !(await sheets(page)).length, JSON.stringify({ gearId, gc }));
      ok('…and Backline’s folds by band are never the free Audiophile’s (gearByBand)', (await page.evaluate(() => import('./js/roles.js').then(r => r.gearByBand()))) === false);
      // The working boxes.
      const rev0 = await page.evaluate(() => import('./js/store.js').then(s => s.revision()));
      await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('s-show1'))); await sleep(500);
      const fold = await page.evaluate(() => { const f = document.getElementById('bk-more'); return { mark: (f.querySelector('.dk-track-lock') || {}).textContent, label: f.querySelector('summary').getAttribute('aria-label') }; });
      ok('a show’s More boxes fold carries “🔒 Licence”', fold.mark === '🔒 Licence' && / needs a licence$/.test(fold.label), JSON.stringify(fold));
      await page.click('#bk-more > summary'); await sleep(400);
      const after = await page.evaluate(() => { const f = document.getElementById('bk-more'); return { open: f.open, boxes: f.querySelectorAll('.blk').length }; });
      ok('…opening it offers the licence and draws no box', (await sheets(page)).includes('The working boxes need a licence') && !after.open && after.boxes === 0, JSON.stringify(after));
      ok('…its words say what the working boxes are', /The line-up, setlist, take log and the other working boxes, and the cards in People, Songs and Backline, come with Tourbook’s working roles\./.test(await page.textContent('.sheet.licence-needed')));
      await closeTop(page);
      const opened = await page.evaluate(() => import('./js/blocks/../pages/bookings.js').then(() => { const f = document.getElementById('blk-lineup'); return !!f; }));
      ok('…so a box asked for by id is not there to open', opened === false);
      // A band's members and + Add member.
      await page.evaluate(() => import('./js/pages/acts.js').then(m => m.openAct('s-owls'))); await sleep(600);
      await page.click('#ac-members .ac-member-main'); await sleep(400);
      const s1 = await sheets(page); await closeTop(page);
      await page.click('#ac-addm'); await sleep(400);
      const s2 = await sheets(page); await closeTop(page);
      ok('a band’s member card and + Add member offer the licence', s1.includes('The working boxes need a licence') && s2.includes('The working boxes need a licence') && s1.length === 1 && s2.length === 1, JSON.stringify([s1, s2]));
      ok('…and nothing was written', (await page.evaluate(() => import('./js/store.js').then(s => s.revision()))) === rev0);
      // The sample work QR (item 15) is a producer's, a manager's and Jack of Trades': the free Audiophile's band card, dropped
      // open on its Bands list, has none.
      await page.evaluate(() => { const b = document.querySelector('.ac-view .back-btn'); if (b) b.click(); }); await page.waitForSelector('.ac-group-head');
      if ((await page.getAttribute('#ac-grp-rock', 'aria-expanded')) !== 'true') { await page.click('#ac-grp-rock'); await page.waitForSelector('#ac-grp-rock[aria-expanded="true"]'); }
      await page.click('#ac-head-s-owls'); await page.waitForSelector('#ac-pnl-s-owls'); await sleep(200);
      ok('the free Audiophile’s band card, dropped open, has no sample work QR (item 15)', (await page.locator('#ac-pnl-s-owls').count()) === 1 && (await page.locator('.ac-sample, [id^="ac-sample-"]').count()) === 0);
      // + New makes only a show (the owner's answer 1): the calendar's + New, a day's, a venue's at a studio.
      await go(page, 'bookings'); await sleep(300);
      await page.evaluate(() => { const b = document.querySelector('.bk-page .back-btn'); if (b) b.click(); }); await sleep(300);
      await page.click('.bk-new'); await sleep(400);
      const t1 = await sheets(page); await closeTop(page);
      await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({ kind: 'session', date: '2026-12-01' }))); await sleep(400);
      const t2 = await sheets(page); await closeTop(page);
      await page.evaluate(() => import('./js/pages/venues.js').then(m => m.openVenue('s-echo'))); await sleep(400);
      const vbtn = await page.textContent('#vn-book');
      await page.click('#vn-book'); await sleep(500);
      const t3 = await sheets(page); await closeTop(page);
      ok('+ New, a new session asked for by a link, and a studio’s button all make a show (“New gig”, in the Audiophile’s words)', t1.join() === 'New gig' && t2.join() === 'New gig' && t3.join() === 'New gig' && vbtn === '+ Add a show here', JSON.stringify([t1, t2, t3, vbtn]));
      // A studio session already here: shown, not changed, with the licence offered.
      await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('s-sess1'))); await sleep(500);
      const note = await page.evaluate(() => ({ note: (document.querySelector('.lic-work-note') || {}).textContent || '', area: document.querySelectorAll('#bk-notes-text').length, ro: document.querySelectorAll('.bk-notes-ro').length }));
      ok('a studio session already here is shown read-only: what it is kept for, its notes as text', /^Studio sessions come with Tourbook’s working roles\. This one is read-only; change it with a licence\.Get a licence…$/.test(note.note) && note.area === 0, JSON.stringify(note));
      await page.click('.bk-edit'); await sleep(400);
      const e1 = await sheets(page); await closeTop(page);
      await page.click('#bk-status'); await sleep(400);
      const e2 = await sheets(page); await closeTop(page);
      ok('…Edit and its status offer the licence instead, in the session\'s words', e1.join() === 'Studio sessions need a licence' && e2.join() === 'Studio sessions need a licence', JSON.stringify([e1, e2]));
      // Its own things still change: a show's notes.
      await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('s-show1'))); await sleep(500);
      await page.fill('#bk-notes-text', 'Front row'); await page.click('.bk-hero h2'); await sleep(400);
      ok('…and its gigs still change: a show’s notes are saved', (await page.evaluate(() => import('./js/store.js').then(s => s.byId('bookings', 's-show1').notes))) === 'Front row');
      // The picker refuses a working role.
      await go(page, 'settings'); await sleep(300);
      await page.evaluate(() => { document.getElementById('se-role').open = true; }); await sleep(200);
      const line = await page.textContent('.rp-licence-line p');
      await page.click('#se-role .rp-card[data-role="producer"]'); await sleep(400);
      ok('the picker refuses Producer: the licence is offered, the role stays the Audiophile', (await sheets(page)).join() === 'Producer needs a licence' && (await page.evaluate(() => localStorage.getItem('tourbook-role'))) === 'audiophile', (await sheets(page)).join());
      ok('…and Your role says the free days are over and the Audiophile is free, for personal use', line === 'Your free days are over. Audiophile is free, for personal use; the other roles need a licence.' && /· free$/.test(await page.textContent('#se-role .se-sub')), line);
      ok('…and About’s line does not call the Audiophile read-only', /· the working roles need a licence$/.test(await page.textContent('#se-about .se-sub')), await page.textContent('#se-about .se-sub'));
      await closeTop(page);
      // A session clock left running (started in the free days, as a Producer): the strip under the menu shows it on every
      // page, and its Stop and Break go through the licence as the session's own boxes do (js/clock.js, gateWork).
      await page.evaluate(h => import('./js/store.js').then(s => s.adopt({ ...JSON.parse(JSON.stringify(s.db)), shifts: [{ id: 't-shift', bookingId: 's-sess1', start: Date.now() - h, end: null, breaks: [] }] })), HOUR);
      await page.waitForSelector('#sd-bar-stop', { timeout: 5000 });
      const shift = () => page.evaluate(() => import('./js/store.js').then(s => { const x = (s.db.shifts || []).find(y => y.id === 't-shift'); return x ? { end: x.end, breaks: (x.breaks || []).length } : null; }));
      await page.click('#sd-bar-stop'); await sleep(400);
      const c1 = await sheets(page), s1c = await shift(); await closeTop(page);
      await page.click('#sd-bar-break'); await sleep(400);
      const c2 = await sheets(page), s2c = await shift(); await closeTop(page);
      ok('a clock left running: the strip’s Stop and Break offer the licence, and the session keeps running untouched', c1.join() === 'The working boxes need a licence' && c2.join() === 'The working boxes need a licence' && s1c && s1c.end == null && s1c.breaks === 0 && s2c && s2c.end == null && s2c.breaks === 0, JSON.stringify([c1, s1c, c2, s2c]));
      await ctx.close();
    }
    {
      // A free Audiophile whose free days are over: Duplicate makes only shows, and a show's copy carries nothing of the
      // working boxes or the money; a diary entry's form has no Fee (the owner's answer 1).
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(Date.now() - DAY) } });
      await sampleIn(page);
      await page.evaluate(d => import('./js/store.js').then(s => s.upsert('bookings', { id: 't-other', kind: 'other', title: 'Radio session', status: 'confirmed', date: d, fee: 250, people: [], gear: [], checks: {} })), isoIn(3));
      await setLicence(page, ended()); await reload(page); await sleep(300);
      const ids = () => page.evaluate(() => import('./js/store.js').then(s => s.db.bookings.map(b => b.id)));
      const ids0 = await ids();
      await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('s-show1'))); await sleep(500);
      await page.click('.bk-actions .btn:has-text("Duplicate")'); await page.waitForSelector('#bk-dup-date');
      await page.click('.sheet form button[type=submit]'); await sleep(600);
      const copy = await page.evaluate(ids0 => import('./js/store.js').then(s => s.db.bookings.find(b => !ids0.includes(b.id)) || null), ids0);
      const kept = copy && ['deal', 'setlistId', 'guestList', 'guestCap', 'runningOrder', 'budget', 'hospitality', 'accommodation', 'parking'].filter(k => copy[k] != null && copy[k] !== '');
      ok('a free Audiophile duplicates a show: a show, its act, venue and times, and nothing of the working boxes or the money (deal, line-up, gear, setlist, guests, running order, budget)', !!copy && copy.kind === 'show' && copy.actId === 's-owls' && !!copy.setTime && !kept.length && !(copy.people || []).length && !(copy.gear || []).length && !Object.keys(copy.gearQty || {}).length && !(copy.kits || []).length, JSON.stringify({ kept, copy }));
      await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('t-other'))); await sleep(500);
      await page.click('.bk-edit'); await page.waitForSelector('.sheet form.form');
      const fee = await page.locator('.sheet form [data-key="fee"]').count();
      await page.fill('.sheet form [data-key="title"]', 'Radio session, live');
      await page.click('.sheet .form-actions .btn.primary'); await sleep(500);
      const other = await page.evaluate(() => import('./js/store.js').then(s => s.byId('bookings', 't-other')));
      ok('…a diary entry’s form has no Fee, and what it keeps saves (its fee left as it was)', fee === 0 && other.title === 'Radio session, live' && other.fee === 250, JSON.stringify({ fee, other }));
      const n1 = (await ids()).length;
      await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('t-other'))); await sleep(500);
      await page.click('.bk-actions .btn:has-text("Duplicate")'); await sleep(500);
      const sh = await sheets(page);
      ok('…Duplicate on a diary entry offers the licence and makes nothing (+ New makes only shows)', sh.join() === 'The working boxes need a licence' && (await ids()).length === n1, JSON.stringify(sh));
      await ctx.close();
    }
    {
      // The words about the bonus tracks match what a tap does: for a free Audiophile without the working roles the
      // working sections come with them (a licence, or the 30 free days), never "open any of them" (the welcome tour's
      // Settings stop, Settings → Your role).
      for (const [when, seed, says] of [['free days over', ended(), /They come with Tourbook’s working roles and need a licence\./], ['free days not started', null, /They come with Tourbook’s working roles: opening one starts your 30 free days\./]]) {
        const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed(), ...(seed ? { 'tourbook-licence': seed } : {}) } });
        await sleep(600);
        const tour = await page.evaluate(() => import('./js/tour.js').then(m => m.welcomeSteps().map(x => x.text).find(x => /Not on your menu/.test(x)) || ''));
        await go(page, 'settings'); await sleep(300);
        await page.evaluate(() => { document.getElementById('se-role').open = true; }); await sleep(200);
        const about = await page.textContent('#se-role .rp-about');
        ok(`an Audiophile, ${when}: the welcome tour and Your role say the working sections come with the working roles, not that a tap opens them`, says.test(tour) && !/to open any of them/.test(tour) && !/links to them still work/.test(about) && says.test(about), JSON.stringify({ tour, about }));
        if (seed) ok('…and the tour does not offer every role any time', !/Change your role there any time/.test(tour) && /The working roles need a licence now\./.test(tour), tour);
        await ctx.close();
      }
    }

    /* =========== a working role after the free days: the sheet at opening, read-only =========== */
    {
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(Date.now() - DAY) }, ask: 'on' });
      await sampleIn(page);
      // A show three days ago, not answered: "Did you see them?" would ask about it.
      await page.evaluate(d => import('./js/store.js').then(s => s.upsert('bookings', { id: 't-wait', kind: 'show', status: 'confirmed', actId: 's-owls', date: d, setTime: '21:00', setLength: 45 })), isoIn(-3));
      await setLicence(page, ended()); await reload(page);
      await page.waitForSelector('.sheet.licence-over', { timeout: 6000 });
      await sleep(1500);
      let sh = await sheets(page);
      ok('at opening a working role with its free days over gets the free-days-over sheet, and no question', sh.join() === 'Your 30 free days are over', sh.join(' | '));
      const words = await page.textContent('.sheet.licence-over');
      ok('…its words: read-only as Producer, nothing deleted, the price, and the way out (free as an Audiophile, for personal use, not for work)', /Tourbook is read-only as Producer on this device until there is a licence: you can open, search, print and share everything, but not change it\. Nothing has been deleted\. A licence is 20 USD once plus any tax where you live, for up to 3 of your devices\. Or carry on free as an Audiophile, with everything you already have, for personal use, not for work\./.test(words) && /Buy a licence · 20 USD/.test(words) && /Sign in \(I have one\)/.test(words) && /Carry on free as an Audiophile/.test(words), words);
      await closeTop(page); await sleep(1500);
      sh = await sheets(page);
      // It opened as Tourbook opened, with nothing focused: once it is gone the page has the focus (it was left nowhere).
      ok('…and the focus is on the page, not left nowhere', await page.evaluate(() => document.activeElement && document.activeElement.id === 'page'), await page.evaluate(() => (document.activeElement || {}).id || (document.activeElement || {}).tagName));
      ok('…✕ keeps the role, read-only, and the question is not asked while it is', sh.length === 0 && (await page.evaluate(() => localStorage.getItem('tourbook-role'))) === 'producer' && !(await page.evaluate(() => import('./js/licence-state.js').then(m => m.canWrite()))), sh.join(' | '));
      ok('…the bar says read-only, with Buy and Sign in', /^Read-only: Producer needs a licence/.test(await page.textContent('.licence-bar span')) && (await page.locator('.licence-bar .btn').count()) === 2);
      // A form keeps what was typed.
      await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('s-show1'))); await sleep(500);
      await page.click('.bk-edit'); await page.waitForSelector('.sheet form.form');
      await page.fill('[data-key="title"]', 'Typed and kept');
      await page.evaluate(() => { window.__toasts = []; });
      await page.click('.sheet .form-actions .btn.primary'); await sleep(600);
      sh = await sheets(page);
      ok('a form keeps what was typed, the read-only sheet over it, no “Saved”, nothing stored', sh.join() === 'Edit show,Read-only until there is a licence' && (await page.inputValue('[data-key="title"]')) === 'Typed and kept' && !(await toasts(page)).length && (await page.evaluate(() => import('./js/store.js').then(s => s.byId('bookings', 's-show1').title || ''))) === '', JSON.stringify({ sh, t: await toasts(page) }));
      ok('…the read-only sheet holds the focus', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('licence-readonly')));
      ok('…and says why in Producer’s words', /^Your free days are over, so Producer can’t change things on this device\. Nothing was changed \(what you typed is still in the form\)\. You can still open, search, print and share everything\./.test(await page.textContent('.sheet.licence-readonly .lic-ro p')));
      ok('…and offers the way out in words, as the free-days-over sheet does: free as an Audiophile, for personal use, not for work', /You can still open, search, print and share everything\. Or carry on free as an Audiophile, for personal use, not for work\.$/.test(await page.textContent('.sheet.licence-readonly .lic-ro p')) && (await page.locator('.sheet.licence-readonly .lic-carry').count()) === 1, await page.textContent('.sheet.licence-readonly .lic-ro p'));
      await closeTop(page); await closeTop(page);
      // A ticked box shows the stored value again, with the focus on its twin.
      await page.evaluate(() => { const d = document.getElementById('blk-advance'); if (d && !d.open) d.querySelector('summary').click(); }); await sleep(400);
      const box = page.locator('#blk-advance .check-item input[type=checkbox]').first();
      const was = await box.isChecked();
      await box.click(); await sleep(500);
      ok('a ticked box: the read-only sheet', (await sheets(page)).join() === 'Read-only until there is a licence');
      await page.keyboard.press('Escape'); await sleep(400);
      const twin = await page.evaluate(() => { const a = document.activeElement; return a && a.type === 'checkbox' ? { checked: a.checked, line: a.closest('.check-item').dataset.line, first: a === document.querySelector('#blk-advance .check-item input[type=checkbox]') } : null; });
      ok('…shows the stored value again, with the focus on its twin', twin && twin.checked === was && twin.first, JSON.stringify(twin));
      // A day sheet marked sent is skipped quietly.
      await page.mouse.click(5, 5);
      const quiet = await page.evaluate(() => import('./js/daysheet.js').then(m => { m.markSent('s-show1'); return import('./js/store.js').then(s => !!s.byId('bookings', 's-show1').daySheet); }));
      await sleep(300);
      ok('a day sheet marked sent is skipped quietly: no sheet, nothing written', quiet === false && !(await sheets(page)).length);
      // Carry on free as an Audiophile.
      await reload(page);
      await page.waitForSelector('.sheet.licence-over', { timeout: 6000 });
      await page.click('.sheet.licence-over .lic-carry');
      await page.waitForSelector('.sheet[aria-label="Did you see them?"]', { timeout: 6000 }).catch(() => {});
      sh = await sheets(page);
      ok('Carry on free as an Audiophile: the role changes, the calendar opens, and then the question is asked; the toast says free, for personal use', (await page.evaluate(() => localStorage.getItem('tourbook-role'))) === 'audiophile' && (await page.evaluate(() => window.logiPage())) === 'bookings' && sh.join() === 'Did you see them?' && (await toasts(page)).includes('Audiophile: free for good, for personal use. Nothing was deleted; the other roles come back with a licence.'), JSON.stringify({ sh, t: await toasts(page) }));
      await closeTop(page);
      ok('…and its writes work', await page.evaluate(() => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, name: 'Free me' }; }))));
      ok('…and no bar for the Audiophile', (await page.locator('.licence-bar').count()) === 0);
      await ctx.close();
    }
    {
      // A Band's booking → + New setlist: the read-only sheet, nothing made, no error.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'band', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(Date.now() - DAY) } });
      await sampleIn(page);
      await setLicence(page, ended()); await reload(page);
      await page.waitForSelector('.sheet.licence-over', { timeout: 6000 }); await closeTop(page);
      const id = await page.evaluate(() => import('./js/store.js').then(s => s.db.bookings.find(b => b.kind === 'show' && !b.setlistId).id));
      await page.evaluate(id => import('./js/pages/bookings.js').then(m => m.openBooking(id)), id); await sleep(500);
      await page.evaluate(() => { const d = document.getElementById('blk-setlist'); if (d && !d.open) d.querySelector('summary').click(); }); await sleep(400);
      const n0 = await page.evaluate(() => import('./js/store.js').then(s => s.db.setlists.length));
      await page.click('#blk-setlist .btn.primary'); await sleep(600);
      ok('a Band read-only: + New setlist shows the read-only sheet, makes nothing, logs no error', (await sheets(page)).join() === 'Read-only until there is a licence' && (await page.evaluate(() => import('./js/store.js').then(s => s.db.setlists.length))) === n0 && !errors.length, JSON.stringify({ sh: await sheets(page), errors }));
      await ctx.close();
    }
    {
      // Carry on free from the read-only sheet over a working form (a song's, as Producer): the form goes with the role,
      // so nothing of it can be saved as an Audiophile without a licence (the store gate asks only the section on screen).
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(Date.now() - DAY) } });
      await sampleIn(page);
      await setLicence(page, ended()); await reload(page);
      await page.waitForSelector('.sheet.licence-over', { timeout: 6000 }); await closeTop(page);
      const title0 = await page.evaluate(() => import('./js/store.js').then(s => s.byId('songs', 's-song1').title));
      await page.evaluate(() => import('./js/pages/songs.js').then(m => m.editSong({ id: 's-song1' }))); await page.waitForSelector('.sheet form.form');
      await page.fill('.sheet form [data-key="title"]', 'Saved after Carry on free');
      await page.click('.sheet .form-actions .btn.primary'); await page.waitForSelector('.sheet.licence-readonly', { timeout: 4000 });
      await page.click('.sheet.licence-readonly .lic-carry'); await sleep(700);
      const left = await sheets(page);
      if (await page.locator('.sheet form.form').count()) { await page.click('.sheet .form-actions .btn.primary'); await sleep(500); }
      const title = await page.evaluate(() => import('./js/store.js').then(s => s.byId('songs', 's-song1').title));
      ok('Carry on free from the read-only sheet over a song’s form: the Audiophile, on the calendar, the form gone with the role, the song unchanged', (await page.evaluate(() => localStorage.getItem('tourbook-role'))) === 'audiophile' && (await page.evaluate(() => window.logiPage())) === 'bookings' && left.length === 0 && title === title0, JSON.stringify({ left, title }));
      await ctx.close();
    }
    {
      // A Producer read-only on Backline, in its folds by band (item 17): a gear item's Save is refused by the form (the
      // read-only sheet), the item stays as it was, no fold opens and nothing is logged. Then the save's own guard, which the
      // licence merge put before the line that opens the item's fold: a stand-in for the store's gate lets the form through
      // and refuses the write itself, so the save gets nothing back from the store, and it must neither open a fold for the
      // record it has not got nor read it. The folds are read after the page is drawn afresh, as they are kept for the visit.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(Date.now() - DAY) } });
      await sampleIn(page);
      // The sample's gear is for no band: three items become the first act's while Tourbook can still change things.
      await page.evaluate(() => import('./js/store.js').then(s => { const a = s.db.acts[0]; s.db.gear.slice(0, 3).forEach(g => s.upsert('gear', { ...g, actId: a.id })); }));
      await setLicence(page, ended()); await reload(page);
      await page.waitForSelector('.sheet.licence-over', { timeout: 6000 }); await closeTop(page);
      const folds = async () => { await go(page, 'bookings'); await sleep(300); await go(page, 'backline'); await page.waitForSelector('#page .bl-band'); await sleep(300); return page.$$eval('#page .bl-band', els => els.filter(e => e.classList.contains('open')).map(e => e.dataset.band)); };
      const nameOf = id => page.evaluate(id => import('./js/store.js').then(s => s.byId('gear', id).name), id);
      const saveAs = async (id, name) => { await page.evaluate(id => import('./js/pages/backline.js').then(m => m.editGear({ id })), id); await page.waitForSelector('.sheet form.form'); await page.fill('.sheet form [data-key="name"]', name); await page.click('.sheet .form-actions .btn.primary'); };
      const open0 = await folds(), n0 = errors.length;
      const gear = await page.evaluate(() => import('./js/store.js').then(s => { const g = s.db.gear.find(x => x.actId); return g ? { id: g.id, name: g.name } : null; }));
      await saveAs(gear && gear.id, 'Renamed while read-only'); await page.waitForSelector('.sheet.licence-readonly', { timeout: 4000 }); await sleep(300);
      const refused = (await sheets(page)).includes('Read-only until there is a licence'), name1 = await nameOf(gear && gear.id);
      while ((await sheets(page)).length) await closeTop(page);
      const open1 = await folds();
      ok('a Producer read-only, in Backline’s folds by band: a gear item’s Save is refused (the read-only sheet), the item unchanged, no fold opened by it, no error', !!gear && refused && name1 === gear.name && JSON.stringify(open1) === JSON.stringify(open0) && errors.length === n0, JSON.stringify({ gear, refused, name1, open0, open1, errors: errors.slice(n0) }));
      await page.evaluate(() => import('./js/store.js').then(s => s.setGate(o => !!(o && o.form))));
      await saveAs(gear && gear.id, 'Refused by the store'); await sleep(500);
      const name2 = await nameOf(gear && gear.id), left = await sheets(page), open2 = await folds();
      ok('…and with the write itself refused after the form let it through, the save opens no fold and reads nothing of the record: the item unchanged, no error', name2 === gear.name && JSON.stringify(open2) === JSON.stringify(open0) && !left.length && errors.length === n0, JSON.stringify({ name2, left, open0, open2, errors: errors.slice(n0) }));
      // The song's form, in its folds by act and album (item 13), the same way: the save stops at the refused write, before it
      // opens the song's folds or says it was saved.
      const t0 = (await toasts(page)).length, song0 = await page.evaluate(() => import('./js/store.js').then(s => s.byId('songs', 's-song1').title));
      await page.evaluate(() => import('./js/pages/songs.js').then(m => m.editSong({ id: 's-song1' }))); await page.waitForSelector('.sheet form.form');
      await page.fill('.sheet form [data-key="title"]', 'Refused by the store'); await page.click('.sheet .form-actions .btn.primary'); await sleep(500);
      const song1 = await page.evaluate(() => import('./js/store.js').then(s => s.byId('songs', 's-song1').title)), said = (await toasts(page)).slice(t0);
      ok('…a song’s save with the write refused: the song unchanged, no “saved” toast, no error', song1 === song0 && !said.some(t => /saved|added/i.test(t)) && errors.length === n0, JSON.stringify({ song0, song1, said, errors: errors.slice(n0) }));
      await ctx.close();
    }
    {
      // A Manager read-only: the invoice editor keeps what was typed when Save is refused (as a form does), and Delete,
      // refused, does not close it as if the invoice were gone.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'manager', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(Date.now() - DAY) } });
      await sampleIn(page);
      await page.evaluate(() => import('./js/money.js').then(m => m.createDoc('s-show1', 'invoice')));
      await setLicence(page, ended()); await reload(page);
      await page.waitForSelector('.sheet.licence-over', { timeout: 6000 }); await closeTop(page);
      const inv0 = await page.evaluate(() => import('./js/store.js').then(s => JSON.stringify(s.byId('bookings', 's-show1').invoice)));
      await page.evaluate(() => import('./js/money.js').then(m => m.openEditor('s-show1', 'invoice'))); await page.waitForSelector('.mn-editor');
      await page.fill('#mn-l1-price', '777'); await page.fill('#mn-ed-notes', 'Typed while read-only');
      await page.click('.mn-editor button[type=submit]'); await sleep(700);
      const s1 = await sheets(page), kept = await page.locator('#mn-l1-price').inputValue().catch(() => null);
      ok('a Manager read-only: Save in the invoice editor keeps it open with what was typed, the read-only sheet over it', s1.join() === 'Edit the invoice,Read-only until there is a licence' && kept === '777' && /what you typed is still in the form/.test(await page.textContent('.sheet.licence-readonly').catch(() => '')), JSON.stringify({ s1, kept }));
      await closeTop(page);
      if (!(await page.locator('.mn-editor').count())) { await page.evaluate(() => import('./js/money.js').then(m => m.openEditor('s-show1', 'invoice'))); await page.waitForSelector('.mn-editor'); }
      await page.click('.mn-editor .btn.danger'); await sleep(700);
      const s2 = await sheets(page), inv1 = await page.evaluate(() => import('./js/store.js').then(s => JSON.stringify(s.byId('bookings', 's-show1').invoice)));
      ok('…Delete, refused, leaves the editor open (not closed as if deleted), and the invoice is stored as it was', s2.join() === 'Edit the invoice,Read-only until there is a licence' && inv1 === inv0, JSON.stringify({ s2, same: inv1 === inv0 }));
      await ctx.close();
    }
    {
      // Coming back after 3 hours brings the sheet back.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer', 'tourbook-terms': agreed(), 'tourbook-licence': ended() } });
      await page.waitForSelector('.sheet.licence-over', { timeout: 6000 }); await closeTop(page);
      const t = Date.now();
      await page.evaluate(ms => window.__clock(ms), t);
      const sight = hidden => page.evaluate(hidden => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
      await sight(true); await page.evaluate(ms => window.__clock(ms), t + 60 * 60e3); await sight(false); await sleep(900);
      const short = await sheets(page);
      await sight(true); await page.evaluate(ms => window.__clock(ms), t + 5 * HOUR); await sight(false); await sleep(1200);
      ok('away an hour: nothing; away 4 hours: the free-days-over sheet again', short.length === 0 && (await sheets(page)).join() === 'Your 30 free days are over', JSON.stringify([short, await sheets(page)]));
      await ctx.close();
    }
    {
      // A working role already in use when the licence comes in, its terms not agreed yet ([S-37], §9.5): the terms sheet
      // at opening. Not now: nothing starts, the role is read-only for this visit and "Did you see them?" waits; the next
      // opening asks again; a refused change asks for the terms (Read and agree, not Buy), and agreeing there starts the
      // free days, after which the form that stayed open saves.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer' }, ask: 'on' });
      await page.waitForSelector('.sheet[aria-label="Before you use the working roles"]', { timeout: 8000 });
      // Written while the sheet is up (nothing refused yet): a band's show three days ago, not answered.
      await page.evaluate(d => import('./js/store.js').then(s => { s.upsert('acts', { id: 't-band', name: 'The Waiting Room' }); s.upsert('bookings', { id: 't-wait', kind: 'show', status: 'confirmed', actId: 't-band', title: '', venueName: 'The Crown', date: d, setTime: '21:00', setLength: 45 }); }), isoIn(-3));
      await page.click('#lic-terms-later'); await sleep(1500);
      let st = await state(page);
      ok('…Not now leaves the focus on the page, not nowhere', await page.evaluate(() => document.activeElement && document.activeElement.id === 'page'), await page.evaluate(() => (document.activeElement || {}).id || (document.activeElement || {}).tagName));
      ok('a working role in use when the licence comes in: the terms sheet at opening; Not now starts nothing, and the question waits', st.mode === 'unstarted' && !(await stored(page)).first && (await sheets(page)).length === 0 && !(await page.evaluate(() => import('./js/licence-state.js').then(m => m.canWrite()))), JSON.stringify({ st, sh: await sheets(page) }));
      await reload(page);
      await page.waitForSelector('.sheet[aria-label="Before you use the working roles"]', { timeout: 8000 });
      ok('…the next opening asks again', (await sheets(page)).join() === 'Before you use the working roles');
      await page.click('#lic-terms-later'); await sleep(1200);
      await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('t-wait'))); await sleep(500);
      await page.click('.bk-edit'); await page.waitForSelector('.sheet form.form');
      await page.fill('[data-key="title"]', 'Typed, then saved');
      await page.click('.sheet .form-actions .btn.primary'); await sleep(600);
      const ro = await page.textContent('.sheet.licence-readonly').catch(() => '');
      ok('…a refused change asks for the terms instead of a licence: Read and agree in Buy’s place, Sign in kept, the form kept', (await sheets(page)).join() === 'Edit show,Read-only for now' && /To use the working roles, please read and agree to Tourbook’s terms\./.test(ro) && /what you typed is still in the form/.test(ro) && (await page.locator('.sheet.licence-readonly #lic-ro-terms').count()) === 1 && (await page.locator('.sheet.licence-readonly .lic-buy').count()) === 0 && (await page.locator('.sheet.licence-readonly .lic-enter').textContent().catch(() => '')) === 'Sign in (I have one)' && (await page.evaluate(() => import('./js/store.js').then(s => s.byId('bookings', 't-wait').title || ''))) === '', JSON.stringify({ sh: await sheets(page), ro }));
      await page.click('#lic-ro-terms');
      await page.waitForSelector('#lic-terms-ok'); await page.check('#lic-terms-ok'); await page.click('#lic-terms-agree'); await sleep(900);
      st = await state(page);
      ok('…agreed there: the free days start, with their toast, and the form is still open', st.mode === 'trial' && st.started && (await sheets(page)).join() === 'Edit show' && (await toasts(page)).some(t => /^Your 30 free days of Tourbook’s working roles have started on this device/.test(t)) && (await page.inputValue('[data-key="title"]')) === 'Typed, then saved', JSON.stringify({ st, sh: await sheets(page) }));
      await page.click('.sheet .form-actions .btn.primary'); await sleep(500);
      ok('…and now it saves', (await page.evaluate(() => import('./js/store.js').then(s => s.byId('bookings', 't-wait').title || ''))) === 'Typed, then saved');
      await reload(page);
      await page.waitForSelector('.sheet[aria-label="Did you see them?"]', { timeout: 8000 }).catch(() => {});
      ok('…the next opening has no terms sheet, and the question has its turn', (await sheets(page)).join() === 'Did you see them?', (await sheets(page)).join(' | '));
      await ctx.close();
    }
    {
      // The terms not agreed (Not now), a song's form refused ("Read-only for now"), Carry on free: the form goes, nothing
      // is written, the free days do not start and the terms stay unagreed.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer' } });
      await page.waitForSelector('.sheet[aria-label="Before you use the working roles"]', { timeout: 8000 });
      await page.evaluate(() => import('./js/store.js').then(s => s.upsert('songs', { id: 't-song', title: 'Written before' })));
      await page.click('#lic-terms-later'); await sleep(600);
      await page.evaluate(() => import('./js/pages/songs.js').then(m => m.editSong({ id: 't-song' }))); await page.waitForSelector('.sheet form.form');
      await page.fill('.sheet form [data-key="title"]', 'Saved without the terms');
      await page.click('.sheet .form-actions .btn.primary'); await page.waitForSelector('.sheet.licence-readonly', { timeout: 4000 });
      await page.click('.sheet.licence-readonly .lic-carry'); await sleep(700);
      const left = await sheets(page);
      if (await page.locator('.sheet form.form').count()) { await page.click('.sheet .form-actions .btn.primary'); await sleep(500); }
      const st = await state(page), title = await page.evaluate(() => import('./js/store.js').then(s => s.byId('songs', 't-song').title));
      ok('the terms not agreed, a song’s form refused, Carry on free: the form goes, the song is unchanged, the free days not started and the terms not agreed', left.length === 0 && title === 'Written before' && st.mode === 'unstarted' && !st.started && !(await page.evaluate(() => localStorage.getItem('tourbook-terms'))), JSON.stringify({ left, title, st }));
      await ctx.close();
    }
    {
      // The free days running out while open move an Audiophile off a working section; Erase keeps the count.
      const t = Date.now();
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(t - 29.5 * DAY, { seen: t }) } });
      ok('half a day before the end: 1 free day left', (await state(page)).trialLeft === 1);
      await go(page, 'people'); await sleep(300);
      await page.evaluate(ms => window.__clock(ms), t + DAY);
      await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); }); await sleep(800);
      ok('the free days run out while it is open: off the working section, back on the calendar', (await state(page)).mode === 'ended' && (await page.evaluate(() => window.logiPage())) === 'bookings', JSON.stringify(await state(page)));
      const before = await stored(page);
      await go(page, 'settings'); await sleep(300);
      await page.evaluate(() => { document.getElementById('se-erase').open = true; });
      ok('the erase warning says the licence and the count stay', /Your licence sign-in and free-day count stay on this device\./.test(await page.textContent('#se-erase-warn')));
      await page.fill('#se-erase-input', 'ERASE');
      await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.click('#se-erase-go')]);
      await page.waitForSelector('#deck .dk-next'); await sleep(500);
      ok('Erase this device keeps the count: the free days are still over', (await stored(page)).first === before.first && (await second(page)).first === before.first, JSON.stringify([before, await stored(page)]));
      await ctx.close();
    }
    {
      // The free days end while an Audiophile has a band member's People card and its form open (reached through gateWork
      // while they ran): both go, and nothing typed there is saved.
      const t = Date.now(), first = t - 29 * DAY - 23 * HOUR;
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(first, { seen: t }) } });
      await sampleIn(page);
      const name0 = await page.evaluate(() => import('./js/store.js').then(s => s.byId('people', 's-maya').name));
      await page.evaluate(() => import('./js/pages/acts.js').then(m => m.openAct('s-owls'))); await sleep(500);
      await page.evaluate(() => import('./js/pages/people.js').then(m => { m.openPerson('s-maya'); return import('./js/store.js').then(s => m.editPerson(s.byId('people', 's-maya'))); }));
      await page.waitForSelector('.sheet form.form');
      const open = await sheets(page);
      await page.fill('.sheet form [data-key="name"]', 'Changed after the free days');
      await page.evaluate(ms => window.__clock(ms), first + 30 * DAY + 10 * 60e3);
      await page.evaluate(() => import('./js/licence-state.js').then(m => m.refreshLicence())); await sleep(700);
      const st = await state(page), left = await sheets(page);
      if (await page.locator('.sheet form.form').count()) { await page.click('.sheet .form-actions .btn.primary'); await sleep(500); }
      const name = await page.evaluate(() => import('./js/store.js').then(s => s.byId('people', 's-maya').name));
      ok('the free days end while an Audiophile has a member’s card and its form open: both go, and the person is unchanged', open.length === 2 && st.mode === 'ended' && left.length === 0 && name === name0, JSON.stringify({ open, mode: st.mode, left, name }));
      await ctx.close();
    }

    /* =========== the search ([S-33]): a free Audiophile finds no working kind, All included =========== */
    {
      const PAID = ['people', 'songs', 'setlists', 'gear', 'logs', 'money'];
      const { ctx, page, srv } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile' } });
      await sampleIn(page);
      await page.evaluate(() => import('./js/search.js').then(m => m.searchReady()));
      const found = () => page.evaluate(() => import('./js/search.js').then(m => { const r = m.searchAll('e'); return Object.keys(r).filter(k => r[k].length); }));
      const tabs = () => page.$$eval('.srch-tab', els => els.map(e => e.dataset.tab));
      const recs = () => page.$$eval('#srch-panel .card[data-rec]', els => [...new Set(els.map(e => e.dataset.rec))]);
      const refresh = () => page.evaluate(() => import('./js/licence-state.js').then(m => { m.refreshLicence(); }));
      const S = '.sheet[aria-label="Search"]';
      ok('before its free days, an Audiophile’s search finds only gigs, bands and venues in the sample', JSON.stringify(await found()) === JSON.stringify(['gigs', 'bands', 'venues']), JSON.stringify(await found()));
      await page.fill('#srch-box', 'e'); await page.waitForSelector('#srch-q'); await sleep(400);
      const t0 = await tabs(), r0 = await recs(), st0 = await state(page);
      ok('…its tabs and All hold no working kind', JSON.stringify(t0) === JSON.stringify(['all', 'gigs', 'bands', 'venues']) && r0.length > 0 && r0.every(k => !PAID.includes(k)), JSON.stringify({ t0, r0 }));
      ok('…and a search starts nothing: the free days not started, no terms sheet, nothing asked of the licence server', st0.mode === 'unstarted' && !st0.started && JSON.stringify(await sheets(page)) === JSON.stringify(['Search']) && srv.asked.length === 0, JSON.stringify({ st0, sheets: await sheets(page), asked: srv.asked }));
      // The free days start elsewhere (another tab, a working role picked): the licence event redraws the open results.
      await setLicence(page, trialFrom(Date.now() - DAY)); await refresh(); await sleep(400);
      const t1 = await tabs();
      ok('once its free days run, the open results redraw with the working kinds (the licence event)', ['people', 'songs', 'setlists', 'gear', 'logs'].every(k => t1.includes(k)) && !t1.includes('money'), JSON.stringify(t1));
      await page.click('#srch-tab-people'); await sleep(250);
      // The free days end while the results are on screen: a tap on a person goes no further than the licence.
      await setLicence(page, ended());
      await page.click(`${S} #srch-panel .card[data-rec="people"]`); await sleep(600);
      ok('…a person tapped after the free days ended opens nothing but the offer: logiGo said no (openThere stops)', JSON.stringify(await sheets(page)) === JSON.stringify(['People needs a licence']) && (await page.evaluate(() => window.logiPage())) === 'bookings', JSON.stringify(await sheets(page)));
      await closeTop(page);
      await refresh(); await sleep(200);
      await page.click('#srch-box'); await page.waitForSelector('#srch-q'); await sleep(400);
      const t2 = await tabs(), r2 = await recs();
      ok('…and the search opened again has no working kind, All included', t2.every(k => !PAID.includes(k)) && r2.every(k => !PAID.includes(k)) && (await found()).every(k => !PAID.includes(k)), JSON.stringify({ t2, r2 }));
      await closeTop(page);
      await ctx.close();
    }

    /* ======================================= the guards ======================================= */
    {
      // The second copy: tourbook-licence deleted by hand.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(Date.now() - 10 * DAY) } });
      await sleep(500);
      const left = (await state(page)).trialLeft;
      await page.evaluate(() => localStorage.removeItem('tourbook-licence'));
      await reload(page); await sleep(600);
      const again = await state(page);
      ok('tourbook-licence deleted by hand: the same free days left after a reload (the IndexedDB copy)', left === 20 && again.trialLeft === left && again.mode === 'trial', JSON.stringify({ left, again }));
      await ctx.close();
    }
    {
      // The one key tourbook-licence changed by hand with Tourbook open ([S-27]): emptied, or its start moved to now. Nothing starts
      // again: the visit never takes a later start than one it has known, and the IndexedDB copy is joined, not overwritten,
      // so coming back (Tourbook looks again) and a reload keep the free days over.
      for (const how of ['emptied', 'given a later start']) {
        const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer', 'tourbook-terms': agreed(), 'tourbook-licence': ended() } });
        await page.waitForSelector('.sheet.licence-over', { timeout: 6000 }); await closeTop(page); await sleep(1500);
        const kv0 = await second(page);
        await page.evaluate(empty => { const s = JSON.parse(localStorage.getItem('tourbook-licence')); localStorage.setItem('tourbook-licence', empty ? '{}' : JSON.stringify({ ...s, first: Date.now(), seen: Date.now() - 120e3 })); }, how === 'emptied');
        const now = await state(page);
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await sleep(1500);
        const back = await state(page), kv1 = await second(page), rec = await stored(page);
        await reload(page); await sleep(1000);
        const after = await state(page);
        ok(`tourbook-licence ${how} by hand with Tourbook open: the free days are still over at once, on coming back and after a reload, and both copies keep the start`, !!kv0 && now.mode === 'ended' && back.mode === 'ended' && after.mode === 'ended' && kv1 && kv1.first === kv0.first && rec.first === kv0.first, JSON.stringify({ kv0, now: [now.mode, now.trialLeft], back: [back.mode, back.trialLeft], kv1, rec, after: [after.mode, after.trialLeft] }));
        await ctx.close();
      }
    }
    {
      // The clock wound 400 days on, Producer picked there, then back: a wrong clock, read-only, its sheet; the server's time corrects it.
      const real = Date.now();
      const { ctx, page, srv } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed() }, clockAt: real + 400 * DAY });
      srv.offline = true; // no answer from the server meanwhile (any answer's time would put the clock right at once)
      await go(page, 'settings'); await sleep(300);
      await page.evaluate(() => { document.getElementById('se-role').open = true; }); await sleep(200);
      await page.click('#se-role .rp-card[data-role="producer"]'); await sleep(1200);
      const fwd = await stored(page);
      ok('the clock 400 days on, Producer picked: the free days start there', fwd.first > real + 399 * DAY, JSON.stringify(fwd));
      await page.evaluate(ms => window.__clock(ms), real + 3 * HOUR);
      await reload(page);
      await page.waitForSelector('.sheet.licence-over', { timeout: 6000 });
      const st = await state(page);
      ok('…the clock set back: mode clock, read-only, and its own sheet', st.mode === 'clock' && st.canEdit === false && (await sheets(page)).join() === 'Your device’s clock looks wrong' && /Tourbook can’t count your free days while this device’s date and time are off by more than a day\./.test(await page.textContent('.sheet.licence-over')), JSON.stringify(st));
      // It offers Carry on free as an Audiophile, so it says what that is for, as every sheet that offers it does (decisions §21).
      ok('…and its way out says the Audiophile is for personal use, not for work', /Until then Tourbook is read-only as Producer\. Nothing has been deleted\. Or carry on free as an Audiophile, for personal use, not for work\.$/.test(await page.textContent('.sheet.licence-over .lic-over p')) && (await page.locator('.sheet.licence-over .lic-carry').count()) === 1, await page.textContent('.sheet.licence-over .lic-over p'));
      srv.offline = false; srv.date = () => new Date(real + 3 * HOUR + 10 * 60e3);
      await page.evaluate(() => import('./js/licence-web.js').then(m => m.status(true)));
      await sleep(700);
      const fixed = await state(page), rec = await stored(page);
      ok('…a status answer with today’s date corrects it to the days really used, and the sheet goes', fixed.mode === 'trial' && fixed.trialLeft === 30 && rec.first <= real + 4 * HOUR && rec.first > real && (await sheets(page)).length === 0, JSON.stringify({ fixed, rec }));
      await ctx.close();
    }
    {
      const t = Date.now();
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed(), 'tourbook-licence': { on: true, statusAt: t, first: t + 2 * DAY, seen: t + 2 * DAY } } });
      const st = await state(page);
      ok('a start two days in the future: a wrong clock', st.mode === 'clock' && st.canEdit === false, JSON.stringify(st));
      ok('…the Audiophile’s working sections are locked meanwhile', (await page.evaluate(() => import('./js/licence-state.js').then(m => m.mayOpen('people')))) === 'locked');
      await ctx.close();
    }
    {
      // The pause: a fresh { on: false } opens everything; 13 hours old it does not; a blocked status or an HTML page leaves it on.
      const t = Date.now(), first = t - 31 * DAY;
      const { ctx, page, srv } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed(), 'tourbook-licence': { on: false, statusAt: t, first, seen: t - HOUR } } });
      let st = await state(page);
      ok('a fresh pause opens everything: mode off, a working section opens, a working role can be picked', st.mode === 'off' && (await go(page, 'people')) === true && (await page.evaluate(() => import('./js/licence-state.js').then(m => m.mayPickRole('producer')))) === 'open', JSON.stringify(st));
      srv.status = 'abort';
      await setLicence(page, { on: false, statusAt: t - 13 * HOUR, first, seen: t - HOUR }); await reload(page); await sleep(2200);
      st = await state(page);
      ok('…the same answer 13 hours old does not (and an aborted status leaves it on)', st.mode === 'ended' && (await stored(page)).on === false, JSON.stringify(st));
      srv.status = 'html';
      await setLicence(page, { on: true, statusAt: t - 7 * HOUR, first, seen: t - HOUR }); await reload(page); await sleep(2200);
      st = await state(page);
      ok('…an HTML 404 for the status leaves it on', st.mode === 'ended' && (await stored(page)).on === true && srv.asked.filter(p => p === '/licence/web/status').length >= 2, JSON.stringify({ st, asked: srv.asked }));
      srv.status = 'json'; srv.on = false;
      await page.evaluate(() => import('./js/licence-web.js').then(m => m.status(true))); await sleep(400);
      ok('…a paused status from the server itself opens it', (await state(page)).mode === 'off');
      srv.on = true;
      await page.evaluate(() => import('./js/licence-web.js').then(m => m.status(true))); await sleep(400);
      ok('…and on again: the free days have not moved', (await state(page)).mode === 'ended' && (await stored(page)).first === first, JSON.stringify(await stored(page)));
      await ctx.close();
    }

    /* =========== one toast per start; a pause found as a section is opened; the terms agreed later; the price =========== */
    {
      const started = async page => (await toasts(page)).filter(t => /free days of Tourbook’s working roles have started/.test(t)).length;
      let { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'band', 'tourbook-terms': agreed() } });
      await sleep(1800);
      ok('opened in a working role, terms agreed: the free days start with one toast, not two', (await state(page)).mode === 'trial' && (await started(page)) === 1, JSON.stringify(await toasts(page)));
      await ctx.close();
      ({ ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed() } }));
      await go(page, 'settings'); await sleep(300);
      await page.evaluate(() => { document.getElementById('se-role').open = true; }); await sleep(200);
      await page.click('#se-role .rp-card[data-role="manager"]'); await sleep(1200);
      ok('…and when one is picked in Settings, one toast', (await state(page)).mode === 'trial' && (await started(page)) === 1, JSON.stringify(await toasts(page)));
      await ctx.close();
    }
    {
      // The status last asked 7 hours ago; the server now says paused, as the Audiophile taps People.
      const { ctx, page, srv } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed(), 'tourbook-licence': { on: true, statusAt: Date.now() - 7 * HOUR } } });
      srv.on = false;
      const shown = await go(page, 'people'); await sleep(400);
      ok('a pause found as an Audiophile opens People: it opens (paused, everything is open), nothing started', shown === true && (await page.evaluate(() => window.logiPage())) === 'people' && (await state(page)).mode === 'off' && !(await stored(page)).first, JSON.stringify({ shown, st: await state(page) }));
      await ctx.close();
    }
    {
      // Not now at opening; then another working role picked, its terms agreed there.
      const { ctx, page, srv } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer' } });
      await page.waitForSelector('.sheet[aria-label="Before you use the working roles"]', { timeout: 8000 });
      await page.click('#lic-terms-later'); await sleep(400);
      await go(page, 'settings'); await sleep(300);
      await page.evaluate(() => { document.getElementById('se-role').open = true; }); await sleep(200);
      await page.click('#se-role .rp-card[data-role="band"]');
      await page.waitForSelector('#lic-terms-ok', { timeout: 8000 });
      await page.check('#lic-terms-ok'); await page.click('#lic-terms-agree'); await sleep(1200);
      const st = await state(page);
      ok('Not now at opening, then Band picked and the terms agreed there: Band, the free days started, changes allowed', (await page.evaluate(() => localStorage.getItem('tourbook-role'))) === 'band' && st.mode === 'trial' && await page.evaluate(() => import('./js/licence-state.js').then(m => m.canWrite())), JSON.stringify(st));
      await ctx.close();
    }
    {
      // The Jack of Trades profile ('all', also what closing "Who's using Tourbook?" leaves while it may be used) in a sentence is
      // "the Jack of Trades role", so the words never read "Jack of Trades needs a licence" as if it were a person.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'all', 'tourbook-terms': agreed(), 'tourbook-licence': ended() } });
      const E = await page.evaluate(() => import('./js/roles.js').then(r => r.EVERYTHING.label));
      await page.waitForSelector('.sheet.licence-over', { timeout: 8000 });
      const over = await page.textContent('.sheet.licence-over');
      await closeTop(page); await sleep(400);
      const bar = await page.textContent('.licence-bar span').catch(() => '');
      await go(page, 'settings'); await sleep(300);
      await page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/backup.js')]).then(([s, b]) => { b.importBackup(new File([s.serialize()], 'tourbook-backup-test.json', { type: 'application/json' })); }));
      await page.waitForSelector('.sheet[aria-label="Bring back a backup"]');
      await page.click('.sheet[aria-label="Bring back a backup"] .se-imp-merge'); await sleep(600);
      const ro = await page.textContent('.sheet.licence-readonly .lic-ro p').catch(() => '');
      await closeTop(page);
      await closeTop(page);
      await page.evaluate(() => import('./js/licence.js').then(m => m.offerRole('all'))); await sleep(400);
      const offerTitle = (await sheets(page)).join(), offerWords = await page.textContent('.sheet.licence-needed').catch(() => '');
      ok(`the ${E} role in a sentence: read-only in the ${E} role at opening, on the bar and after a refused change, and the offer is titled "The ${E} role needs a licence"`,
        over.includes(`Tourbook is read-only in the ${E} role on this device until there is a licence`) && !over.includes(`as ${E}`)
        && bar.startsWith(`Read-only: the ${E} role needs a licence`)
        && ro.startsWith(`Your free days are over, so the ${E} role can’t change things on this device.`)
        && offerTitle === `The ${E} role needs a licence` && offerWords.includes(`The ${E} role comes with a licence.`),
        JSON.stringify({ over: over.slice(0, 120), bar, ro: ro.slice(0, 90), offerTitle }));
      // The bar's ✕ hides it until Tourbook is next opened, and the focus goes to the page, not nowhere.
      await closeTop(page);
      await page.focus('.licence-bar [aria-label="Hide until Tourbook is next opened"]'); await page.keyboard.press('Enter'); await sleep(300);
      const hid = await page.evaluate(() => ({ bar: document.querySelectorAll('.licence-bar').length, focus: (document.activeElement || {}).id || (document.activeElement || {}).tagName }));
      ok('the read-only bar’s ✕ hides it, with the focus on the page', hid.bar === 0 && hid.focus === 'page', JSON.stringify(hid));
      await ctx.close();
    }
    {
      // A refused change with no form (Remove the sample… on a device with sample records on it, Bring back a backup's
      // Merge): "Nothing was changed.", never "what you typed is still in the form". Settings no longer loads the sample.
      // Remove the sample… asks the licence before its question: a read-only role gets the sheet at once, no question
      // (answered after 3 s the gate would show no sheet), and no refused removal per record.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(Date.now() - 5 * DAY) } });
      await sampleIn(page); await setLicence(page, ended()); await reload(page);
      await page.waitForSelector('.sheet.licence-over', { timeout: 8000 }); await closeTop(page);
      const nSample = () => page.evaluate(() => import('./js/store.js').then(s => s.COLLECTIONS.reduce((n, c) => n + s.db[c].filter(r => r.sample).length, 0)));
      const had = await nSample();
      await go(page, 'settings'); await sleep(300);
      const offer = await page.evaluate(() => ({ load: document.querySelectorAll('#se-sample-load').length, remove: document.querySelectorAll('#se-sample-remove').length }));
      await page.evaluate(() => { const d = document.getElementById('se-sample'); if (d) d.open = true; }); await sleep(200);
      // What the screen reader is told: every write to #sr-live.
      await page.evaluate(() => { window.__said = []; new MutationObserver(ms => ms.forEach(m => { const r = m.target; if (r.id === 'sr-live' && m.addedNodes.length && r.textContent) window.__said.push(r.textContent); })).observe(document.body, { subtree: true, childList: true }); });
      let asked = 0; const onDialog = () => { asked++; }; page.on('dialog', onDialog);
      await page.click('#se-sample-remove'); await sleep(600); // no question: the licence refuses first
      page.off('dialog', onDialog);
      const sample = await page.textContent('.sheet.licence-readonly .lic-ro p').catch(() => '');
      const kept = { asked, sheet: await page.locator('.sheet.licence-readonly').count(), n: await nSample(), sec: await page.locator('#se-sample').count(), toasts: (await toasts(page)).filter(t => /Sample removed/.test(t)), said: await page.evaluate(() => window.__said) };
      ok('read-only, Settings offers no sample to load, and Remove the sample… is refused by the licence before any question: the read-only sheet shows, every sample record and the section stay, nothing says it was removed (no toast, no screen-reader announcement) and "Read-only" is said at most once',
        offer.load === 0 && offer.remove === 1 && had > 0 && kept.asked === 0 && kept.sheet === 1 && kept.n === had && kept.sec === 1 && kept.toasts.length === 0
        && !kept.said.some(t => /Sample removed/.test(t)) && kept.said.filter(t => /Read-only/.test(t)).length <= 1, JSON.stringify({ offer, had, kept }));
      await closeTop(page);
      await page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/backup.js')]).then(([s, b]) => { b.importBackup(new File([s.serialize()], 'tourbook-backup-test.json', { type: 'application/json' })); }));
      await page.waitForSelector('.sheet[aria-label="Bring back a backup"]');
      await page.click('.sheet[aria-label="Bring back a backup"] .se-imp-merge'); await sleep(600);
      const backup = await page.textContent('.sheet.licence-readonly .lic-ro p').catch(() => '');
      ok('a refused change with no form says "Nothing was changed.", not that what was typed is in the form: Remove the sample…, and Bring back a backup', /^Your free days are over, so Producer can’t change things on this device\. Nothing was changed\. You can still open/.test(sample) && /^Your free days are over, so Producer can’t change things on this device\. Nothing was changed\. You can still open/.test(backup), JSON.stringify({ sample, backup }));
      await ctx.close();
    }
    {
      // A free Audiophile's studio session or rehearsal, its free days over: every button on it offers the licence in the
      // words of what was tapped (the page's own note), not the working boxes'.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed(), 'tourbook-licence': trialFrom(Date.now() - 5 * DAY) } });
      await sampleIn(page); await setLicence(page, ended()); await reload(page); await sleep(1000);
      const ids = await page.evaluate(() => import('./js/store.js').then(s => ['session', 'rehearsal'].map(k => (s.db.bookings.find(b => b.kind === k) || {}).id)));
      const seen = {};
      for (const [kind, id] of [['session', ids[0]], ['rehearsal', ids[1]]]) for (const label of ['✎ Edit', 'Delete', 'Duplicate', 'Confirmed', 'Get a licence…']) {
        await page.evaluate(id => import('./js/pages/bookings.js').then(m => m.openBooking(id)), id); await sleep(500);
        const btn = page.locator('#page button', { hasText: label }).first();
        if (!(await btn.count())) { seen[`${kind} ${label}`] = 'no button'; continue; }
        await btn.click(); await sleep(500);
        seen[`${kind} ${label}`] = [(await sheets(page)).join(), (await page.textContent('.sheet.licence-needed .lic-offer p').catch(() => '')).slice(0, 200)];
        for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(150); }
      }
      const want = { session: ['Studio sessions need a licence', 'Studio sessions come with Tourbook’s working roles. This one is read-only; change it with a licence.'], rehearsal: ['Rehearsals need a licence', 'Rehearsals come with Tourbook’s working roles. This one is read-only; change it with a licence.'] };
      const wrong = Object.entries(seen).filter(([k, v]) => { const w = want[k.split(' ')[0]]; return v === 'no button' ? !/Confirmed/.test(k) : !(v[0] === w[0] && v[1].startsWith(w[1])); });
      ok('a free Audiophile\'s studio session or rehearsal, free days over: Edit, Delete, Duplicate, the status and the page note\'s own Get a licence… offer "Studio sessions need a licence" or "Rehearsals need a licence", in the page note\'s words', ids.every(Boolean) && wrong.length === 0, JSON.stringify(wrong.length ? wrong : seen).slice(0, 400));
      await ctx.close();
    }
    {
      // The terms changed since they were agreed ([S-37], §9.4), the free days under way: the terms sheet comes again at
      // opening ("The terms have changed"). Not now: read-only for this visit, a refused change asks for the updated terms;
      // agreed there, the form that stayed open saves.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer', 'tourbook-terms': { v: '2026-01-01', at: Date.now() - 30 * DAY }, 'tourbook-licence': trialFrom(Date.now() - 3 * DAY) } });
      const asked = await page.waitForSelector('.sheet[aria-label="The terms have changed"]', { timeout: 8000 }).then(() => true).catch(() => false);
      ok('the terms changed, the free days under way: the terms sheet comes again at opening, in its changed words', asked && /^Please read and agree to the updated terms to keep using the working roles\. Your information is safe and stays where it is\./.test(await page.textContent('.lic-terms p').catch(() => '')), (await sheets(page)).join(' | '));
      if (asked) {
        await sampleIn(page); // written while the sheet is up (nothing refused yet)
        await page.click('#lic-terms-later'); await sleep(800);
        const st = await state(page);
        ok('…Not now: Producer kept, its free days running, but read-only for this visit', st.mode === 'trial' && (await page.evaluate(() => localStorage.getItem('tourbook-role'))) === 'producer' && !(await page.evaluate(() => import('./js/licence-state.js').then(m => m.canWrite()))) && (await sheets(page)).length === 0, JSON.stringify({ st, sh: await sheets(page) }));
        await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('s-show1'))); await sleep(500);
        await page.click('.bk-edit'); await page.waitForSelector('.sheet form.form');
        await page.fill('[data-key="title"]', 'Saved once the terms are agreed');
        await page.click('.sheet .form-actions .btn.primary'); await sleep(600);
        const ro = await page.textContent('.sheet.licence-readonly').catch(() => '');
        ok('…a refused change asks for the updated terms (Read and agree), with nothing about free days, and the form is kept', (await sheets(page)).join() === 'Edit show,Read-only for now' && /Please read and agree to the updated terms to keep using the working roles\./.test(ro) && !/free for 30 days/.test(ro) && (await page.locator('.sheet.licence-readonly #lic-ro-terms').count()) === 1, ro);
        await page.click('#lic-ro-terms');
        await page.waitForSelector('#lic-terms-ok'); await page.check('#lic-terms-ok'); await page.click('#lic-terms-agree'); await sleep(800);
        await page.click('.sheet .form-actions .btn.primary'); await sleep(500);
        ok('…agreed there: the terms kept in their new version, and the form saves', (await page.evaluate(() => JSON.parse(localStorage.getItem('tourbook-terms')).v)) === TERMS_V && (await page.evaluate(() => import('./js/store.js').then(s => s.byId('bookings', 's-show1').title || ''))) === 'Saved once the terms are agreed');
      }
      await ctx.close();
    }
    {
      // The same for an Audiophile whose free days are under way: picking a working role asks the updated terms first.
      const { ctx, page } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': { v: '2026-01-01', at: Date.now() - 30 * DAY }, 'tourbook-licence': trialFrom(Date.now() - 3 * DAY) } });
      await sleep(1200);
      const atOpening = await sheets(page);
      await go(page, 'settings'); await sleep(300);
      await page.evaluate(() => { document.getElementById('se-role').open = true; }); await sleep(200);
      await page.click('#se-role .rp-card[data-role="band"]');
      const asked = await page.waitForSelector('.sheet[aria-label="The terms have changed"]', { timeout: 5000 }).then(() => true).catch(() => false);
      if (asked) await page.click('#lic-terms-later'); await sleep(400);
      const kept = await page.evaluate(() => localStorage.getItem('tourbook-role'));
      ok('an Audiophile in its free days, the terms changed: nothing at opening; picking Band asks the updated terms first, and Not now keeps the Audiophile', atOpening.length === 0 && asked && kept === 'audiophile', JSON.stringify({ atOpening, asked, kept }));
      await ctx.close();
    }
    {
      const { ctx, page, srv } = await openLive(browser, errors, { seed: { 'tourbook-role': 'producer' } });
      await page.waitForSelector('.sheet[aria-label="Before you use the working roles"]', { timeout: 8000 });
      await page.click('#lic-terms-later'); await sleep(400);
      srv.on = false;
      await page.evaluate(() => import('./js/licence-web.js').then(m => m.status(true))); await sleep(400);
      ok('Not now, then the licence paused by the server: the working role changes things again', (await state(page)).mode === 'off' && await page.evaluate(() => import('./js/licence-state.js').then(m => m.canWrite())));
      await ctx.close();
    }
    {
      // An IndexedDB that never answers (some Safari versions' first open): nothing waits on it for ever.
      const hang = () => { indexedDB.open = () => ({}); };
      let { ctx, page } = await openLive(browser, errors, { init: hang, seed: { 'tourbook-role': 'producer', 'tourbook-terms': agreed(), 'tourbook-licence': ended() } });
      await page.waitForSelector('.sheet.licence-over', { timeout: 8000 }).catch(() => {});
      ok('an IndexedDB that never answers: the free-days-over sheet still comes at opening', (await sheets(page)).join() === 'Your 30 free days are over', (await sheets(page)).join());
      await ctx.close();
      ({ ctx, page } = await openLive(browser, errors, { init: hang, seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed() } }));
      const shown = await Promise.race([go(page, 'songs').catch(() => 'closed'), sleep(9000).then(() => 'waiting')]);
      ok('…and an Audiophile’s working section still opens, starting the free days', shown === true && (await state(page)).mode === 'trial', JSON.stringify({ shown, st: await state(page) }));
      await ctx.close();
    }
    {
      const { ctx, page, srv } = await openLive(browser, errors, { seed: { 'tourbook-role': 'audiophile' } });
      await go(page, 'settings'); await sleep(300);
      await page.evaluate(() => { document.getElementById('se-about').open = true; document.getElementById('se-role').open = true; }); await sleep(1500);
      ok('an Audiophile who never used a working role opens About & licence (Buy drawn): nothing is asked of the licence server, the price reads 20 USD', srv.asked.length === 0 && /Buy a licence · 20 USD/.test(await page.textContent('#se-about')), srv.asked.join(' '));
      await ctx.close();
    }
  } catch (e) { ok('licence roles crashed', false, e.stack); }
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL licence roles crashed — ' + e.message); process.exit(1); });
