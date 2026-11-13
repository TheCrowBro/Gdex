// The licence as the desktop app's page shows it, with a stand-in for the desktop's bridge (window.gdexDesktop.licence:
// desktop/licence.cjs answers there): off while the desktop's switch is, the free days started through the bridge when
// a working role is picked, Enter licence code (a full licence moved from another computer), Release this computer,
// Buy through the bridge, the menu drawn from the last answer kept before the bridge answers, Google Drive's earliest
// start handed to the bridge, and no request to a licence server from the page. Then the desktop's files opened in a
// web browser (a page on one of the desktop's ports without the bridge): nothing paid opens there (the build spec [S-42]).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.GDEX_URL || 'http://localhost:8124/';
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 864e5;
const TERMS_V = (() => { try { return (/TERMS_VERSION = '([^']*)'/.exec(fs.readFileSync(path.join(process.env.GDEX_ROOT || path.join(__dirname, '..', '..'), 'js', 'terms.js'), 'utf8')) || [])[1] || ''; } catch { return ''; } })();

// The stand-in bridge. window.__lic.state is what the desktop app would report; calls are recorded in window.__lic.calls;
// window.__lic.wait delays its state() answer.
const bridge = (start, wait = 0) => `(() => {
  const L = window.__lic = { state: ${JSON.stringify(start)}, calls: [], listeners: [], wait: ${wait} };
  const day = ms => new Date(ms).toISOString().slice(0, 10);
  const trial = first => ({ kind: 'desktop', enabled: true, mode: 'trial', canEdit: true, started: true, first, trialLeft: 30 - Math.floor((Date.now() - first) / 864e5), trialEnds: day(first + 30 * 864e5), seats: 3, licence: null, buyUrl: 'https://gdex.crowmade.app/buy', os: 'Linux' });
  const licensed = { kind: 'desktop', enabled: true, mode: 'licensed', canEdit: true, started: true, first: Date.now() - 864e5, trialLeft: 29, trialEnds: '', seats: 3, licence: { name: 'Jo Desk', email: 'jo@example.com', comp: false, ref: '2:4242', seats: 3 } };
  const full = { error: 'full', seats: 3, swapsLeft: 2, computers: [
    { tag: 'tagMacAAAAAA', os: 'Mac', added: '2026-11-01', seen: '2026-11-02' },
    { tag: 'tagWinBBBBBB', os: 'Windows', added: '2026-11-01', seen: '2026-10-20' },
    { tag: 'tagLinCCCCCC', os: 'Linux', added: '2026-11-01', seen: '2026-11-01' }] };
  const tell = s => { L.state = s; L.listeners.forEach(f => f(s)); return s; };
  window.gdexDesktop = {
    platform: 'linux', updateState: async () => ({ status: 'current' }), checkForUpdates: async () => ({ status: 'current' }), onStatus: () => () => {},
    licence: {
      state: async () => { L.calls.push(['state']); if (L.wait) await new Promise(r => setTimeout(r, L.wait)); return L.state; },
      start: async () => { L.calls.push(['start']); return L.state.enabled === false || L.state.started ? L.state : tell(trial(Date.now())); },
      adopt: async t => { L.calls.push(['adopt', t]); return L.state.enabled === false ? L.state : tell(trial(Math.min(t, L.state.first || t))); },
      enter: async (code, opts) => { L.calls.push(['enter', code, opts]); if (!/^GDEX-/i.test(code)) return { error: 'Paste the whole code: it starts with GDEX-.' }; if (!(opts && opts.release)) return full; return tell(licensed); },
      recheck: async () => (L.calls.push(['recheck']), L.state),
      release: async () => { L.calls.push(['release']); return tell(trial(Date.now() - 18 * 864e5)); },
      code: async () => 'GDEX-AAAAA-BBBBB',
      buy: async () => { L.calls.push(['buy']); return true; },
      localPrice: async () => { L.calls.push(['price']); return { price: '20.00', currency: 'USD', country: 'GB', taxed: { place: 'the UK', tax: 'VAT', rate: 20, total: '24.00' } }; },
      onChange: cb => { L.listeners.push(cb); return () => {}; },
    },
  };
})();`;
const OFF = { kind: 'desktop', enabled: false, mode: 'off', canEdit: true, started: false, first: 0, trialLeft: 30, trialEnds: '', seats: 3, licence: null };
const UNSTARTED = { kind: 'desktop', enabled: true, mode: 'unstarted', canEdit: true, started: false, first: 0, trialLeft: 30, trialEnds: '', seats: 3, licence: null, buyUrl: 'https://gdex.crowmade.app/buy', os: 'Linux' };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const open = async ({ start, wait = 0, seed = {}, url = BASE, live = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
    const asked = [];
    ctx.on('request', r => { const p = new URL(r.url()).pathname; if (/^\/licence\/|^\/buy$/.test(p)) asked.push(p); });
    if (live) await ctx.route('**/js/licence-config.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: "export const LICENCE_SITES = ['localhost', '127.0.0.1'];\n" }));
    await ctx.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[]}}' }));
    await ctx.addInitScript(seed => {
      try {
        if (!localStorage.getItem('t-seeded')) { localStorage.setItem('t-seeded', '1'); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }
        localStorage.setItem('gdex-tour', 'done'); localStorage.setItem('gdex-role-nudged', '1'); localStorage.setItem('gdex-ask-seen', 'off');
      } catch (e) { /* ignore */ }
      window.__toasts = [];
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }))).observe(document, { childList: true, subtree: true });
    }, seed);
    if (start) await ctx.addInitScript(bridge(start, wait));
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
  const agreed = { 'gdex-terms': { v: TERMS_V, at: Date.now() } };
  try {
    /* ---------------- the desktop's switch off: nothing shows ---------------- */
    {
      const { ctx, page, asked } = await open({ start: OFF, seed: { 'gdex-role': 'audiophile' } });
      await sleep(1500);
      await page.click('#deck .dk-list'); await page.waitForSelector('.dk-sheet');
      const marks = await page.locator('.dk-sheet .dk-track-lock').count();
      await page.keyboard.press('Escape'); await sleep(200);
      await about(page);
      ok('the desktop’s switch off (enabled: false): no mark, no badge, About is About, no panel, every section open', (await state(page)).mode === 'off' && marks === 0 && (await page.locator('.rp-licence').count()) === 0 && (await page.textContent('#se-about .twirl-name')) === 'About' && (await page.locator('.licence-panel:not([hidden])').count()) === 0 && (await go(page, 'money')) === true);
      ok('…the page asked the bridge, not a licence server', (await calls(page)).includes('state') && asked.length === 0, JSON.stringify(asked));
      await ctx.close();
    }

    /* ---------------- unstarted: a working role picked starts the free days through the bridge ---------------- */
    {
      const { ctx, page, asked } = await open({ start: UNSTARTED, seed: { 'gdex-role': 'audiophile', ...agreed } });
      await sleep(1200);
      ok('unstarted: an Audiophile counts nothing and the bridge is not asked to start', (await state(page)).mode === 'unstarted' && !(await calls(page)).includes('start'));
      await go(page, 'settings'); await sleep(300);
      await page.evaluate(() => { document.getElementById('se-role').open = true; }); await sleep(200);
      ok('the badges say the free days are there to start', (await page.textContent('#se-role .rp-card[data-role="producer"] .rp-licence')) === '30 days free, then a licence');
      await page.click('#se-role .rp-card[data-role="producer"]'); await sleep(900);
      const st = await state(page);
      ok('picking Producer calls licence.start(), and the free days run (the bridge’s answer kept)', (await calls(page)).includes('start') && st.mode === 'trial' && st.started && st.kind === 'desktop' && (await page.evaluate(() => JSON.parse(localStorage.getItem('gdex-licence-cache')).mode)) === 'trial' && (await toasts(page)).some(t => /^Your 30 free days of Gdex’s working roles have started/.test(t)), JSON.stringify(st));
      // Google Drive's earliest start goes to the bridge.
      const t = Date.now() - 5 * DAY;
      const adopted = await page.evaluate(t => import('./js/licence-state.js').then(async m => [await m.adoptFreeDaysFrom(t), await m.adoptFreeDaysFrom(Date.now() - 864e5), m.freeDaysFrom()]), t);
      const adoptCalls = await page.evaluate(() => window.__lic.calls.filter(c => c[0] === 'adopt'));
      ok('adoptFreeDaysFrom hands an earlier start to licence.adopt, and refuses a later one', adopted[0] === true && adopted[1] === false && adoptCalls.length === 1 && adoptCalls[0][1] === t && adopted[2] === t, JSON.stringify({ adopted, adoptCalls }));
      // Enter licence code: full, then moved here.
      await about(page);
      ok('About & licence: the free days, “until you add a licence code”, with Buy and Enter licence code', /After that the working roles are read-only here until you add a licence code\. Audiophile stays free\./.test(await page.textContent('.licence-panel .licence-line')) && (await page.textContent('.licence-panel .lic-enter')) === 'Enter licence code');
      await sleep(300);
      ok('…the price comes from the bridge (the UK: 24.00 USD with VAT)', /Buy a licence · 24\.00 USD with VAT/.test(await page.textContent('.licence-panel .lic-buy')) && (await calls(page)).includes('price'));
      await page.click('.licence-panel .lic-buy'); await sleep(300);
      ok('Buy goes through the bridge (no tab opened by the page)', (await calls(page)).includes('buy') && ctx.pages().length === 1);
      await page.click('.licence-panel .lic-enter'); await page.waitForSelector('.licence-code');
      await page.fill('.licence-code', 'not a code'); await page.click('#lic-activate'); await sleep(300);
      ok('a pasted text that is no code is said so', /Paste the whole code: it starts with GDEX-\./.test(await page.textContent('.sheet[aria-label="Enter licence code"]')));
      await page.fill('.licence-code', 'GDEX-AAAAA-BBBBB'); await page.click('#lic-activate'); await sleep(400);
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

    /* ---------------- the menu from the last answer kept, before the bridge answers ---------------- */
    {
      const ended = { ...UNSTARTED, mode: 'ended', canEdit: false, started: true, first: Date.now() - 40 * DAY, trialLeft: 0 };
      const { ctx, page } = await open({ start: ended, wait: 4000, seed: { 'gdex-role': 'audiophile', 'gdex-licence-cache': ended } });
      await page.click('#deck .dk-list'); await page.waitForSelector('.dk-sheet');
      const marks = await page.$$eval('.dk-sheet .dk-bonus .dk-track-lock', ms => ms.map(m => m.textContent));
      const answered = await page.evaluate(() => window.__lic.calls.length);
      ok('the menu is drawn from gdex-licence-cache before the bridge answers: six locked bonus tracks', marks.length === 6 && marks.every(t => t === '🔒 Licence'), JSON.stringify({ marks, answered }));
      await page.keyboard.press('Escape');
      await ctx.close();
    }

    /* ---------------- the desktop's files in a web browser ([S-42]) ---------------- */
    {
      const { serve } = await import(path.join(__dirname, '..', 'lib.mjs'));
      const root = process.env.GDEX_ROOT || path.join(__dirname, '..', '..');
      let server = null, port = 0;
      for (port = 47861; port <= 47880 && !server; port++) { try { server = await serve(root, port); } catch { server = null; } }
      port = server ? server.address().port : 0;
      ok('a page served on one of the desktop’s ports (' + port + ')', !!server && port >= 47861 && port <= 47880);
      if (server) {
        const { ctx, page, asked } = await open({ url: `http://localhost:${port}/`, live: true, seed: {} });
        await page.waitForSelector('.sheet.licence-away', { timeout: 6000 });
        const st = await state(page);
        ok('without the bridge it is the desktop’s files in a browser: mode away, and its sheet at opening', st.mode === 'away' && (await sheets(page)).join() === 'Open Gdex from its desktop app' && /This is the desktop app’s copy of Gdex, opened in a web browser\. Its working roles and Google Drive only work in the desktop app; on the web, use gdex\.crowmade\.app\. Audiophile works here\./.test(await page.textContent('.sheet.licence-away')), JSON.stringify(st));
        ok('…the sheet has no Buy and no Sign in', (await page.locator('.sheet.licence-away .lic-buy, .sheet.licence-away .lic-enter').count()) === 0);
        await closeTop(page);
        const opened = [];
        for (const id of ['people', 'songs', 'sessions', 'backline', 'money', 'insurance']) { opened.push(await go(page, id)); await sleep(150); const s = await sheets(page); if (s.join() !== 'Open Gdex from its desktop app') opened.push('sheet:' + s.join()); await closeTop(page); }
        ok('…no working section opens: each logiGo resolves false, with “Open Gdex from its desktop app”', opened.every(x => x === false) && (await page.evaluate(() => window.logiPage())) === 'bookings', JSON.stringify(opened));
        await page.click('#deck .dk-next'); await sleep(400); // Acts: free
        const acts = await page.evaluate(() => window.logiPage());
        await page.click('#deck .dk-next'); await sleep(400); // People: a working section
        ok('…nor from the menu: ⏭ reaches Acts, then stays there for People, with the sheet', acts === 'acts' && (await page.evaluate(() => window.logiPage())) === 'acts' && (await sheets(page)).join() === 'Open Gdex from its desktop app', acts);
        await closeTop(page);
        ok('…no working role can be picked', await page.evaluate(() => import('./js/licence-state.js').then(m => import('./js/roles.js').then(r => [...r.ROLES.map(x => x.id), 'all'].filter(id => id !== 'audiophile').every(id => m.mayPickRole(id) === 'locked') && m.mayPickRole('audiophile') === 'open'))));
        ok('…and Everything cannot change things here', !(await page.evaluate(() => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, name: 'Away' }; })))));
        await page.evaluate(() => import('./js/roles.js').then(r => r.setRole('audiophile', { start: true }))); await sleep(400);
        ok('the Audiophile works here: its writes are kept', await page.evaluate(() => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, name: 'Away fan' }; }))));
        await sleep(1500);
        ok('…and nothing is asked of a licence server', asked.length === 0, asked.join(' '));
        await ctx.close();
        await new Promise(r => server.close(() => r()));
      }
    }
  } catch (e) { ok('licence desktop ui crashed', false, e.stack); }
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL licence desktop ui crashed — ' + e.message); process.exit(1); });
