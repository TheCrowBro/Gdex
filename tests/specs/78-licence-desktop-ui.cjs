// The licence as the desktop app's page shows it, with a stand-in for the desktop's bridge (window.tourbookDesktop.licence:
// desktop/licence.cjs answers there): off while the desktop's switch is, the free days started through the bridge when
// a working role is picked, Enter licence code (a full licence moved from another computer), Release this computer,
// Buy through the bridge, the menu drawn from the last answer kept before the bridge answers, Google Drive's earliest
// start handed to the bridge, backup files carrying the bridge's start and an earlier one in a file handed to it on Merge
// (never on Cancel, never while off), and no request to a licence server from the page. Then the desktop's files opened in a
// web browser (a page on one of the desktop's ports without the bridge): nothing paid opens there (the build spec [S-42]).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.TOURBOOK_URL || 'http://localhost:8124/';
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DAY = 864e5;
const TERMS_V = (() => { try { return (/TERMS_VERSION = '([^']*)'/.exec(fs.readFileSync(path.join(process.env.TOURBOOK_ROOT || path.join(__dirname, '..', '..'), 'js', 'terms.js'), 'utf8')) || [])[1] || ''; } catch { return ''; } })();

// The stand-in bridge. window.__lic.state is what the desktop app would report; calls are recorded in window.__lic.calls;
// window.__lic.wait delays its state() answer.
const bridge = (start, wait = 0) => `(() => {
  const L = window.__lic = { state: ${JSON.stringify(start)}, calls: [], listeners: [], wait: ${wait} };
  const day = ms => new Date(ms).toISOString().slice(0, 10);
  const trial = first => ({ kind: 'desktop', enabled: true, mode: 'trial', canEdit: true, started: true, first, trialLeft: 30 - Math.floor((Date.now() - first) / 864e5), trialEnds: day(first + 30 * 864e5), seats: 3, licence: null, buyUrl: 'https://tourbook.crowmade.app/buy', os: 'Linux' });
  const licensed = { kind: 'desktop', enabled: true, mode: 'licensed', canEdit: true, started: true, first: Date.now() - 864e5, trialLeft: 29, trialEnds: '', seats: 3, licence: { name: 'Jo Desk', email: 'jo@example.com', comp: false, ref: '2:4242', seats: 3 } };
  const full = { error: 'full', seats: 3, swapsLeft: 2, computers: [
    { tag: 'tagMacAAAAAA', os: 'Mac', added: '2026-11-01', seen: '2026-11-02' },
    { tag: 'tagWinBBBBBB', os: 'Windows', added: '2026-11-01', seen: '2026-10-20' },
    { tag: 'tagLinCCCCCC', os: 'Linux', added: '2026-11-01', seen: '2026-11-01' }] };
  const tell = s => { L.state = s; L.listeners.forEach(f => f(s)); return s; };
  window.tourbookDesktop = {
    platform: 'linux', updateState: async () => ({ status: 'current' }), checkForUpdates: async () => ({ status: 'current' }), onStatus: () => () => {},
    licence: {
      state: async () => { L.calls.push(['state']); if (L.wait) await new Promise(r => setTimeout(r, L.wait)); return L.state; },
      start: async () => { L.calls.push(['start']); return L.state.enabled === false || L.state.started ? L.state : tell(trial(Date.now())); },
      adopt: async t => { L.calls.push(['adopt', t]); return L.state.enabled === false ? L.state : tell(trial(Math.min(t, L.state.first || t))); },
      enter: async (code, opts) => { L.calls.push(['enter', code, opts]); if (!/^TOURBOOK-/i.test(code)) return { error: 'Paste the whole code: it starts with TOURBOOK-.' }; if (!(opts && opts.release)) return full; return tell(licensed); },
      recheck: async () => (L.calls.push(['recheck']), L.state),
      release: async () => { L.calls.push(['release']); return tell(trial(Date.now() - 18 * 864e5)); },
      code: async () => 'TOURBOOK-AAAAA-BBBBB',
      buy: async () => { L.calls.push(['buy']); return true; },
      localPrice: async () => { L.calls.push(['price']); return { price: '20.00', currency: 'USD', country: 'GB', taxed: { place: 'the UK', tax: 'VAT', rate: 20, total: '24.00' } }; },
      onChange: cb => { L.listeners.push(cb); return () => {}; },
    },
  };
})();`;
const OFF = { kind: 'desktop', enabled: false, mode: 'off', canEdit: true, started: false, first: 0, trialLeft: 30, trialEnds: '', seats: 3, licence: null };
const UNSTARTED = { kind: 'desktop', enabled: true, mode: 'unstarted', canEdit: true, started: false, first: 0, trialLeft: 30, trialEnds: '', seats: 3, licence: null, buyUrl: 'https://tourbook.crowmade.app/buy', os: 'Linux' };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  // tz: the browser's time zone (Playwright's timezoneId); init: a script run after the stand-in bridge is in place.
  const open = async ({ start, wait = 0, seed = {}, url = BASE, live = false, tz = undefined, init = null } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block', ...(tz ? { timezoneId: tz } : {}) });
    const asked = [];
    ctx.on('request', r => { const p = new URL(r.url()).pathname; if (/^\/licence\/|^\/buy$/.test(p)) asked.push(p); });
    if (live) await ctx.route('**/js/licence-config.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: "export const LICENCE_SITES = ['localhost', '127.0.0.1'];\n" }));
    await ctx.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[]}}' }));
    await ctx.addInitScript(seed => {
      try {
        if (!localStorage.getItem('t-seeded')) { localStorage.setItem('t-seeded', '1'); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }
        localStorage.setItem('tourbook-tour', 'done'); localStorage.setItem('tourbook-role-nudged', '1'); localStorage.setItem('tourbook-ask-seen', 'off');
      } catch (e) { /* ignore */ }
      window.__toasts = [];
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }))).observe(document, { childList: true, subtree: true });
    }, seed);
    if (start) await ctx.addInitScript(bridge(start, wait));
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
    page.on('dialog', d => d.accept());
    await page.goto(url);
    await page.waitForSelector('#deck .dk-next');
    return { ctx, page, asked };
  };
  const state = page => page.evaluate(() => import('./js/licence-state.js').then(m => m.licenceNow()));
  const calls = page => page.evaluate(() => window.__lic.calls.map(c => c[0]));
  const sheets = page => page.$$eval('.sheet', els => els.map(x => x.getAttribute('aria-label')));
  const toasts = page => page.evaluate(() => window.__toasts.slice());
  const go = (page, id) => page.evaluate(t => window.logiGo(t), id);
  const closeTop = async page => { await page.evaluate(() => { const all = document.querySelectorAll('.sheet'); const s = all[all.length - 1]; s && s.querySelector('.sheet-head [aria-label="Close"]').click(); }); await sleep(250); };
  const about = async page => { await go(page, 'settings'); await sleep(300); await page.evaluate(() => { document.getElementById('se-about').open = true; }); await sleep(400); };
  const agreed = { 'tourbook-terms': { v: TERMS_V, at: Date.now() } };
  try {
    /* ---------------- the desktop's switch off: nothing shows ---------------- */
    {
      const { ctx, page, asked } = await open({ start: OFF, seed: { 'tourbook-role': 'audiophile' } });
      await sleep(1500);
      await page.click('#deck .dk-list'); await page.waitForSelector('.dk-sheet');
      const marks = await page.locator('.dk-sheet .dk-track-lock').count();
      await page.keyboard.press('Escape'); await sleep(200);
      await about(page);
      ok('the desktop’s switch off (enabled: false): no mark, no badge, About is About, no panel, every section open', (await state(page)).mode === 'off' && marks === 0 && (await page.locator('.rp-licence').count()) === 0 && (await page.textContent('#se-about .twirl-name')) === 'About' && (await page.locator('.licence-panel:not([hidden])').count()) === 0 && (await go(page, 'money')) === true);
      ok('…the page asked the bridge, not a licence server', (await calls(page)).includes('state') && asked.length === 0, JSON.stringify(asked));
      await about(page); // the check above went on to Money
      const where = await page.textContent('#se-about .se-where');
      ok('…and Where your data is kept speaks of the app on this computer, its update checks, and no licence server', /Everything you enter stays in this app, on this computer\./.test(where) && /The desktop app also looks for new versions at tourbook-download\.crowmade\.app\./.test(where) && !/browser/.test(where) && !/licence server/.test(where), where);
      // Location in the desktop app works only on a Mac (desktop/main.cjs refuses it elsewhere): on Windows and Linux,
      // "I'm here now" says so and points to Find from address, instead of "Could not get your location".
      const here = async platform => {
        await page.evaluate(p => { window.tourbookDesktop.platform = p; window.__geo = 0; navigator.geolocation.getCurrentPosition = (ok, no) => { window.__geo++; no({ code: 1 }); }; window.__toasts = []; }, platform);
        await page.evaluate(() => import('./js/pages/venues.js').then(m => m.editVenue({}))); await page.waitForSelector('.sheet form.form');
        await page.locator('.sheet button', { hasText: 'I’m here now' }).click(); await sleep(300);
        const r = { asked: await page.evaluate(() => window.__geo), toasts: await toasts(page) };
        await closeTop(page); return r;
      };
      const linux = await here('linux'), win = await here('win32'), mac = await here('darwin');
      ok('…location: on Linux and Windows "I’m here now" asks nothing and says to use Find from address or a map link; on a Mac it asks', linux.asked === 0 && win.asked === 0 && [linux, win].every(r => r.toasts.includes('Location isn’t available in the desktop app on Windows and Linux: use Find from address, or paste a map link.')) && mac.asked === 1, JSON.stringify({ linux, win, mac }));
      await ctx.close();
    }

    /* ---------------- the licence's own facts: its number of devices, and a readable end date ---------------- */
    {
      // A free licence for 5 devices, this computer moved off it: every sentence says 5, as About does.
      const lic5 = { name: 'Sam Free', email: 'sam@example.com', ref: '1:7', seats: 5, comp: true, expires: '' };
      const released = { kind: 'desktop', enabled: true, mode: 'released', canEdit: false, started: true, first: Date.now() - 40 * DAY, trialLeft: 0, trialEnds: '', seats: 5, licence: lic5, os: 'Linux' };
      const { ctx, page } = await open({ start: released, seed: { 'tourbook-role': 'producer', ...agreed } });
      await page.waitForSelector('.sheet.licence-over', { timeout: 8000 });
      const over = await page.textContent('.sheet.licence-over'); await closeTop(page);
      await page.evaluate(() => import('./js/licence.js').then(m => m.offerSection('people'))); await sleep(300);
      const offerWords = await page.textContent('.sheet.licence-needed').catch(() => ''); await closeTop(page);
      await about(page);
      const line = await page.textContent('.licence-panel .licence-line').catch(() => '');
      ok('a licence for 5 devices, this computer moved off it: the sheet at opening, the offers and About all say 5 other devices', /Your licence is in use on 5 other devices\./.test(over) && /it’s in use on 5 other devices\./.test(offerWords) && /in use on 5 other devices, its limit/.test(line) && !/3 other devices/.test(over + offerWords), JSON.stringify({ over: over.slice(0, 160), offerWords: offerWords.slice(0, 160) }));
      ok('…and the sheet at opening, which offers Carry on free as an Audiophile, says it is for personal use, not for work (decisions §21)', /Nothing has been deleted\. Or carry on free as an Audiophile, for personal use, not for work\./.test(over) && /Carry on free as an Audiophile/.test(over), over.slice(-200));
      // An ended code pasted into Enter licence code: its end date written as About writes dates.
      await page.evaluate(() => { window.tourbookDesktop.licence.enter = async () => ({ error: 'expired', expires: '2026-10-31' }); return import('./js/licence.js').then(m => m.enterCode()); });
      await page.waitForSelector('#lic-activate'); await page.fill('.sheet textarea.licence-code', 'TOURBOOK-ENDED'); await page.click('#lic-activate'); await sleep(300);
      const said = await page.textContent('.sheet[aria-label="Enter licence code"] p[role="status"]').catch(() => '');
      const want = await page.evaluate(() => new Date('2026-10-31T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }));
      ok('…an ended code entered: "This code ended on" its date as About writes it, not 2026-10-31', said === `This code ended on ${want}.`, said);
      await ctx.close();
    }

    /* ---------------- unstarted: a working role picked starts the free days through the bridge ---------------- */
    {
      const { ctx, page, asked } = await open({ start: UNSTARTED, seed: { 'tourbook-role': 'audiophile', ...agreed } });
      await sleep(1200);
      ok('unstarted: an Audiophile counts nothing and the bridge is not asked to start', (await state(page)).mode === 'unstarted' && !(await calls(page)).includes('start'));
      await go(page, 'settings'); await sleep(300);
      await page.evaluate(() => { document.getElementById('se-role').open = true; }); await sleep(200);
      ok('the badges say the free days are there to start', (await page.textContent('#se-role .rp-card[data-role="producer"] .rp-licence')) === '30 days free, then a licence');
      await page.click('#se-role .rp-card[data-role="producer"]'); await sleep(900);
      const st = await state(page);
      ok('picking Producer calls licence.start(), and the free days run (the bridge’s answer kept)', (await calls(page)).includes('start') && st.mode === 'trial' && st.started && st.kind === 'desktop' && (await page.evaluate(() => JSON.parse(localStorage.getItem('tourbook-licence-cache')).mode)) === 'trial' && (await toasts(page)).some(t => /^Your 30 free days of Tourbook’s working roles have started/.test(t)), JSON.stringify(st));
      // Google Drive's earliest start goes to the bridge.
      const t = Date.now() - 5 * DAY;
      const adopted = await page.evaluate(t => import('./js/licence-state.js').then(async m => [await m.adoptFreeDaysFrom(t), await m.adoptFreeDaysFrom(Date.now() - 864e5), m.freeDaysFrom()]), t);
      const adoptCalls = await page.evaluate(() => window.__lic.calls.filter(c => c[0] === 'adopt'));
      ok('adoptFreeDaysFrom hands an earlier start to licence.adopt, and refuses a later one', adopted[0] === true && adopted[1] === false && adoptCalls.length === 1 && adoptCalls[0][1] === t && adopted[2] === t, JSON.stringify({ adopted, adoptCalls }));
      // Enter licence code: full, then moved here.
      await about(page);
      ok('…licences on, Where your data is kept names the licence server too, still in the app’s words', /stays in this app, on this computer\..*licence server at tourbook\.crowmade\.app.*looks for new versions at tourbook-download\.crowmade\.app/.test(await page.textContent('#se-about .se-where')));
      ok('About & licence: the free days, “until you add a licence code”, with Buy and Enter licence code', /After that the working roles are read-only here until you add a licence code\. Audiophile stays free\./.test(await page.textContent('.licence-panel .licence-line')) && (await page.textContent('.licence-panel .lic-enter')) === 'Enter licence code');
      await sleep(300);
      ok('…the price comes from the bridge (the UK: 24.00 USD with VAT)', /Buy a licence · 24\.00 USD with VAT/.test(await page.textContent('.licence-panel .lic-buy')) && (await calls(page)).includes('price'));
      await page.click('.licence-panel .lic-buy'); await sleep(300);
      ok('Buy goes through the bridge (no tab opened by the page)', (await calls(page)).includes('buy') && ctx.pages().length === 1);
      await page.click('.licence-panel .lic-enter'); await page.waitForSelector('.licence-code');
      await page.fill('.licence-code', 'not a code'); await page.click('#lic-activate'); await sleep(300);
      ok('a pasted text that is no code is said so', /Paste the whole code: it starts with TOURBOOK-\./.test(await page.textContent('.sheet[aria-label="Enter licence code"]')));
      await page.fill('.licence-code', 'TOURBOOK-AAAAA-BBBBB'); await page.click('#lic-activate'); await sleep(400);
      const list = await page.$$eval('.lic-computers li', ls => ls.map(l => l.textContent));
      ok('a full licence: the three devices, each with Move it here', list.length === 3 && /^Mac · added /.test(list[0]) && (await page.locator('.lic-move').count()) === 3, JSON.stringify(list));
      await page.click('.lic-move >> nth=1'); await sleep(500);
      const lc = await page.evaluate(() => window.__lic.calls.filter(c => c[0] === 'enter').pop());
      ok('…Move it here activates it here, taking that one off: licensed, with its toast', lc[2] && lc[2].release === 'tagWinBBBBBB' && (await state(page)).mode === 'licensed' && (await toasts(page)).includes('Licensed: every role on this device.') && (await sheets(page)).length === 0, JSON.stringify(lc));
      await sleep(300);
      ok('…About & licence: licensed to the name and address, with Copy the code and Release this computer', /^Licensed to Jo Desk \(jo@example\.com\) · up to 3 devices\.$/.test(await page.textContent('.licence-panel .licence-line')) && (await page.locator('.licence-panel .lic-release').count()) === 1);
      await page.click('.licence-panel .lic-release'); await page.waitForSelector('#lic-release-go');
      await page.click('#lic-release-go'); await sleep(500);
      ok('Release this computer: the bridge releases it, and it is back in its free days', (await calls(page)).includes('release') && (await state(page)).mode === 'trial' && (await toasts(page)).includes('This computer has been released.'));
      await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(1500);
      ok('no request to /licence/ or /buy from the desktop app’s page, in the whole visit', asked.length === 0, asked.join(' '));
      await ctx.close();
    }

    /* ---------------- backup files carry the bridge's start (the owner, 15 November 2026) ---------------- */
    {
      const trialAt = first => ({ ...UNSTARTED, mode: 'trial', started: true, first, trialLeft: 30 - Math.floor((Date.now() - first) / DAY), trialEnds: new Date(first + 30 * DAY).toISOString().slice(0, 10) });
      const backups = async page => {
        await go(page, 'settings'); await page.waitForSelector('#se-backups');
        await page.evaluate(() => { const d = document.getElementById('se-backups'); d.open = true; d.scrollIntoView({ block: 'start' }); }); await sleep(300);
      };
      const saved = async page => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#page .se-bk-save')]); return JSON.parse(fs.readFileSync(await dl.path(), 'utf8')); };
      const BRING = '.sheet[aria-label="Bring back a backup"]';
      const bring = async (page, from) => {
        const body = await page.evaluate(from => import('./js/store.js').then(s => JSON.stringify({ ...JSON.parse(s.exportJSON()), freeDaysFrom: from })), from);
        await page.setInputFiles('#page .se-bk-input', { name: 'tourbook-backup-2026-11-01.json', mimeType: 'application/json', buffer: Buffer.from(body) });
        await page.waitForSelector(BRING, { timeout: 15000 });
        return (await page.locator(`${BRING} .se-imp-days`).count()) ? page.locator(`${BRING} .se-imp-days`).innerText() : '';
      };
      const pickIt = async (page, sel) => { await page.click(`${BRING} ${sel}`); await page.waitForSelector(BRING, { state: 'detached', timeout: 10000 }); await sleep(500); };
      const adopts = page => page.evaluate(() => window.__lic.calls.filter(c => c[0] === 'adopt').map(c => c[1]));
      {
        const T = Date.now() - 4 * DAY;
        const { ctx, page } = await open({ start: trialAt(T), seed: { 'tourbook-role': 'producer', ...agreed } });
        await page.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(300);
        await backups(page);
        const file = await saved(page);
        ok('the desktop app: a saved backup carries the bridge’s start, as its last key', file.freeDaysFrom === T && Object.keys(file).pop() === 'freeDaysFrom', JSON.stringify(file.freeDaysFrom));
        const earlier = T - 6 * DAY;
        const line = await bring(page, earlier);
        await pickIt(page, '.se-imp-merge');
        ok('…bringing back an earlier start: the chooser says so, and Merge hands exactly that start to licence.adopt', /^Your free days for the working roles started earlier, on .+, on the device this backup was saved on\. Bringing it back counts them from that day on this device too: \d+ days left, until .+\.$/.test(line) && same(await adopts(page), [earlier]) && (await state(page)).first === earlier, JSON.stringify({ line, adopts: await adopts(page) }));
        const line2 = await bring(page, earlier - 2 * DAY);
        await page.click(`${BRING} .btn.ghost:has-text("Cancel")`); await page.waitForSelector(BRING, { state: 'detached' }); await sleep(300);
        ok('…Cancel after the line: nothing is handed to licence.adopt', /started earlier/.test(line2) && same(await adopts(page), [earlier]), JSON.stringify(await adopts(page)));
        const line3 = await bring(page, earlier + DAY);
        await pickIt(page, '.se-imp-merge');
        ok('…a later start than the computer’s: no line, and licence.adopt is not asked', line3 === '' && same(await adopts(page), [earlier]), JSON.stringify({ line3, adopts: await adopts(page) }));
        await ctx.close();
      }
      {
        const licensed = { ...UNSTARTED, mode: 'licensed', canEdit: true, started: true, first: Date.now() - DAY, trialLeft: 29, licence: { name: 'Jo Desk', email: 'jo@example.com', comp: false, ref: '2:4242', seats: 3 } };
        const { ctx, page } = await open({ start: licensed, seed: { 'tourbook-role': 'producer', ...agreed } });
        await sleep(800); await backups(page);
        const earlier = Date.now() - 9 * DAY;
        const line = await bring(page, earlier);
        await pickIt(page, '.se-imp-merge');
        ok('…licensed: no line (nothing the person would notice changes), but the earlier start is still handed to licence.adopt', line === '' && same(await adopts(page), [earlier]), JSON.stringify({ line, adopts: await adopts(page) }));
        await ctx.close();
      }
      {
        const { ctx, page, asked } = await open({ start: OFF, seed: { 'tourbook-role': 'producer' } });
        await page.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(300);
        await backups(page);
        const file = await saved(page);
        const db = await page.evaluate(() => import('./js/store.js').then(s => JSON.parse(s.exportJSON())));
        const line = await bring(page, Date.now() - 9 * DAY);
        await pickIt(page, '.se-imp-merge');
        ok('…the desktop’s switch off (enabled: false): a saved backup is the database with no start, an earlier start in a file shows no line and licence.adopt is never asked', !('freeDaysFrom' in file) && same(file, db) && line === '' && same(await adopts(page), []) && asked.length === 0, JSON.stringify({ field: file.freeDaysFrom, line, adopts: await adopts(page), asked }));
        await ctx.close();
      }
      {
        // The desktop app's last day is a UTC date (desktop/licence.cjs), so the line's "until" is too: in Auckland a start
        // at noon UTC is already the next day, and the line must still name the day the app shows once it is taken.
        const T = Date.now() - 4 * DAY, earlier = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 12, 12);
        const { ctx, page } = await open({ start: trialAt(T), tz: 'Pacific/Auckland', seed: { 'tourbook-role': 'producer', ...agreed } });
        await page.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(300);
        await backups(page);
        const line = await bring(page, earlier);
        await pickIt(page, '.se-imp-merge');
        const shown = await page.evaluate(() => import('./js/licence-state.js').then(L => ({ until: L.endsWords(L.licenceNow()), ends: L.licenceNow().trialEnds })));
        ok('…in a time zone ahead of UTC, the line’s last day is the one the desktop app shows once the start is taken (its UTC day)', !!shown.until && line.endsWith(`, until ${shown.until}.`) && shown.ends === new Date(earlier + 30 * DAY).toISOString().slice(0, 10) && same(await adopts(page), [earlier]), JSON.stringify({ line, shown }));
        await ctx.close();
      }
      {
        // A bridge that cannot take a start (no licence.adopt): no line, since nothing would change.
        const T = Date.now() - 4 * DAY;
        const { ctx, page } = await open({ start: trialAt(T), init: 'delete window.tourbookDesktop.licence.adopt;', seed: { 'tourbook-role': 'producer', ...agreed } });
        await page.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(300);
        await backups(page);
        const line = await bring(page, Date.now() - 12 * DAY);
        await pickIt(page, '.se-imp-merge');
        ok('…a bridge without licence.adopt: no line, and the computer’s start is as it was', line === '' && (await state(page)).first === T, JSON.stringify({ line, st: await state(page) }));
        await ctx.close();
      }
    }

    /* ---------------- the menu from the last answer kept, before the bridge answers ---------------- */
    {
      const ended = { ...UNSTARTED, mode: 'ended', canEdit: false, started: true, first: Date.now() - 40 * DAY, trialLeft: 0 };
      const { ctx, page } = await open({ start: ended, wait: 4000, seed: { 'tourbook-role': 'audiophile', 'tourbook-licence-cache': ended } });
      await page.click('#deck .dk-list'); await page.waitForSelector('.dk-sheet');
      const marks = await page.$$eval('.dk-sheet .dk-bonus .dk-track-lock', ms => ms.map(m => m.textContent));
      const answered = await page.evaluate(() => window.__lic.calls.length);
      ok('the menu is drawn from tourbook-licence-cache before the bridge answers: six locked bonus tracks', marks.length === 6 && marks.every(t => t === '🔒 Licence'), JSON.stringify({ marks, answered }));
      await page.keyboard.press('Escape');
      await ctx.close();
    }

    /* ---------------- the desktop's files in a web browser ([S-42]) ---------------- */
    {
      const { serve } = await import(path.join(__dirname, '..', 'lib.mjs'));
      const root = process.env.TOURBOOK_ROOT || path.join(__dirname, '..', '..');
      let server = null, port = 0;
      for (port = 47861; port <= 47880 && !server; port++) { try { server = await serve(root, port); } catch { server = null; } }
      port = server ? server.address().port : 0;
      ok('a page served on one of the desktop’s ports (' + port + ')', !!server && port >= 47861 && port <= 47880);
      if (server) {
        const { ctx, page, asked } = await open({ url: `http://localhost:${port}/`, live: true, seed: {} });
        await page.waitForSelector('.sheet.licence-away', { timeout: 6000 });
        const st = await state(page);
        ok('without the bridge it is the desktop’s files in a browser: mode away, and its sheet at opening (the Audiophile works here, for personal use, not for work: decisions §21)', st.mode === 'away' && (await sheets(page)).join() === 'Open Tourbook from its desktop app' && /This is the desktop app’s copy of Tourbook, opened in a web browser\. Its working roles and Google Drive only work in the desktop app; on the web, use tourbook\.crowmade\.app\. Audiophile works here, for personal use, not for work\./.test(await page.textContent('.sheet.licence-away')), JSON.stringify(st));
        ok('…the sheet has no Buy and no Sign in', (await page.locator('.sheet.licence-away .lic-buy, .sheet.licence-away .lic-enter').count()) === 0);
        await closeTop(page);
        const opened = [];
        for (const id of ['people', 'songs', 'sessions', 'backline', 'money', 'insurance']) { opened.push(await go(page, id)); await sleep(150); const s = await sheets(page); if (s.join() !== 'Open Tourbook from its desktop app') opened.push('sheet:' + s.join()); await closeTop(page); }
        ok('…no working section opens: each logiGo resolves false, with “Open Tourbook from its desktop app”', opened.every(x => x === false) && (await page.evaluate(() => window.logiPage())) === 'bookings', JSON.stringify(opened));
        await page.click('#deck .dk-next'); await sleep(400); // Acts: free
        const acts = await page.evaluate(() => window.logiPage());
        await page.click('#deck .dk-next'); await sleep(400); // People: a working section
        ok('…nor from the menu: ⏭ reaches Acts, then stays there for People, with the sheet', acts === 'acts' && (await page.evaluate(() => window.logiPage())) === 'acts' && (await sheets(page)).join() === 'Open Tourbook from its desktop app', acts);
        await closeTop(page);
        ok('…no working role can be picked', await page.evaluate(() => import('./js/licence-state.js').then(m => import('./js/roles.js').then(r => [...r.ROLES.map(x => x.id), 'all'].filter(id => id !== 'audiophile').every(id => m.mayPickRole(id) === 'locked') && m.mayPickRole('audiophile') === 'open'))));
        ok('…and Jack of Trades cannot change things here', !(await page.evaluate(() => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, name: 'Away' }; })))));
        await page.evaluate(() => import('./js/roles.js').then(r => r.setRole('audiophile', { start: true }))); await sleep(400);
        ok('the Audiophile works here: its writes are kept', await page.evaluate(() => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, name: 'Away fan' }; }))));
        // Google Drive refuses here too, even with Tourbook's Google client set (js/drive.js, [S-42]): the Backups card says
        // where it works and offers no Connect, and neither Google's script nor a token is ever asked for.
        const google = [];
        ctx.on('request', r => { if (/google/.test(new URL(r.url()).hostname)) google.push(r.url()); });
        await ctx.route('**/js/cloud-config.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: "export const CLOUD_APPS = { google: 'tourbook-test.apps.googleusercontent.com' };\n" }));
        await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(300);
        while ((await sheets(page)).length) await closeTop(page);
        await page.click('#cloudBtn');
        await page.waitForSelector('.sheet[aria-label="Backups"] .se-bk-drive', { timeout: 10000 });
        const card = page.locator('.sheet[aria-label="Backups"] .se-bk-drive');
        ok('…Google Drive: the Backups card says “Open Tourbook from its desktop app to connect Google Drive.” and has no button', (await card.getAttribute('data-state')) === 'away' && (await card.innerText()).includes('Open Tourbook from its desktop app to connect Google Drive.') && (await card.locator('button').count()) === 0, await card.innerText());
        const refused = await page.evaluate(() => import('./js/drive.js').then(async d => [d.configured(), await d.loadGIS().then(() => 'loaded', e => e.message), await d.googleToken(true).then(() => 'token', e => e.message)]));
        ok('…and Google’s sign-in is refused with the same words, though the client is set', refused[0] === true && refused[1] === 'Open Tourbook from its desktop app to connect Google Drive.' && refused[2] === refused[1], JSON.stringify(refused));
        await closeTop(page);
        await sleep(1500);
        ok('…nothing went to Google', google.length === 0, google.join(' '));
        ok('…and nothing is asked of a licence server', asked.length === 0, asked.join(' '));
        await ctx.close();
        await new Promise(r => server.close(() => r()));
      }
    }
  } catch (e) { ok('licence desktop ui crashed', false, e.stack); }
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL licence desktop ui crashed — ' + e.message); process.exit(1); });
