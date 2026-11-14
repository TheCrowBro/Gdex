// The licence switched off, as the repository has it (js/licence-config.js: LICENCE_SITES = []), and as a copy of Tourbook
// anywhere but the live site has it: Tourbook works exactly as before the licence existed. Every role picks and works, every
// section opens (logiGo resolves true), nothing about a licence is shown (no badge, no mark, no bar; Settings → About
// and its nine parts), the licence's sheets and code are never fetched, and not one request goes to a licence server in
// a whole visit. Erase keeps the licence record. About's closed line names Google Drive while it is linked. The spec
// serves the switch itself, so it reads the same in both legs of CI (the build spec §5.4).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.TOURBOOK_URL || 'http://localhost:8124/';
const REPO = path.join(__dirname, '..', '..');
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  // A context like tests/helpers.cjs makes (the welcome tour seen, the role card dismissed, the question off), with the
  // licence's switch served as `sites`, and every request watched.
  const openWith = async (sites, { init = null } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
    const asked = [], fetched = [];
    ctx.on('request', r => { const p = new URL(r.url()).pathname; fetched.push(p); if (/^\/licence\/|^\/buy$/.test(p)) asked.push(p); });
    await ctx.route('**/js/licence-config.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: `export const LICENCE_SITES = ${JSON.stringify(sites)};\n` }));
    await ctx.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[]}}' }));
    await ctx.addInitScript(() => { try { localStorage.setItem('tourbook-tour', 'done'); localStorage.setItem('tourbook-role-nudged', '1'); localStorage.setItem('tourbook-ask-seen', 'off'); } catch (e) { /* ignore */ } });
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
    page.on('dialog', d => d.accept());
    await page.goto(BASE);
    await page.waitForSelector('#deck .dk-next');
    return { ctx, page, asked, fetched };
  };
  const go = async (page, id) => page.evaluate(t => window.logiGo(t), id);
  const L = page => page.evaluate(() => import('./js/licence-state.js').then(m => ({ mode: m.licenceNow().mode, on: m.licenceOn(), work: m.mayWork(), mark: m.workMark() })));
  try {
    // The repository's own switch (the test server serves the scratch copy, or in the licence leg its own: so read it here).
    const repo = fs.readFileSync(path.join(REPO, 'js', 'licence-config.js'), 'utf8');
    ok('the repository’s switch is off: LICENCE_SITES is []', /export const LICENCE_SITES = \[\];/.test(repo));

    const { ctx, page, asked, fetched } = await openWith([]);
    await page.evaluate(() => import('./js/store.js').then(s => s.loadSample()));
    await sleep(200);
    ok('the licence is off: mode off, every answer open, no mark on the working boxes', same(await L(page), { mode: 'off', on: false, work: 'open', mark: null }), JSON.stringify(await L(page)));

    // Every role, picked in Settings → Your role: it is set, its badge is absent, a working section opens and a change is kept.
    const ids = await page.evaluate(() => import('./js/roles.js').then(r => [...r.ROLES.map(x => x.id), 'all']));
    const rows = [];
    for (const id of ids) {
      await go(page, 'settings'); await sleep(250);
      await page.evaluate(() => { const d = document.getElementById('se-role'); if (d && !d.open) d.open = true; });
      await page.click(`#se-role .rp-card[data-role="${id}"]`); await sleep(350);
      const role = await page.evaluate(() => localStorage.getItem('tourbook-role'));
      const badges = await page.locator('.rp-licence').count();
      const opened = await go(page, 'people'); await sleep(250);
      const page2 = await page.evaluate(() => window.logiPage());
      const wrote = await page.evaluate(n => import('./js/store.js').then(s => !!s.upsert('people', { id: 't-' + n, name: 'Off ' + n })), id);
      rows.push({ id, role, badges, opened, page2, wrote });
    }
    ok('every role picks, opens a working section (logiGo resolves true) and keeps a change', rows.every(r => r.role === r.id && r.opened === true && r.page2 === 'people' && r.wrote), JSON.stringify(rows.filter(r => !(r.role === r.id && r.opened === true && r.page2 === 'people' && r.wrote))));
    ok('…and no role card carries a licence badge', rows.every(r => r.badges === 0), JSON.stringify(rows.map(r => r.badges)));

    // As the Audiophile: the bonus tracks carry no mark, a show's More boxes open with their boxes, + Add member opens its sheet.
    await page.evaluate(() => import('./js/roles.js').then(r => r.setRole('audiophile', { start: true }))); await sleep(400);
    await page.click('#deck .dk-list'); await page.waitForSelector('.dk-sheet');
    const bonus = await page.$$eval('.dk-sheet .dk-bonus .dk-track', bs => bs.map(b => ({ id: b.dataset.section, label: b.getAttribute('aria-label'), lock: !!b.querySelector('.dk-track-lock') })));
    ok('the Audiophile’s bonus tracks are as they were: no lock, no mark, no changed name', bonus.length === 6 && bonus.every(b => !b.lock && b.label === null), JSON.stringify(bonus));
    await page.keyboard.press('Escape'); await page.waitForSelector('.dk-sheet', { state: 'detached' });
    await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('s-show1'))); await sleep(500);
    const fold = await page.evaluate(() => { const f = document.getElementById('bk-more'); return f ? { lock: !!f.querySelector('.dk-track-lock'), label: f.querySelector('summary').getAttribute('aria-label') } : null; });
    await page.click('#bk-more > summary'); await sleep(300);
    const boxes = await page.locator('#bk-more[open] .bk-more-blocks .blk').count();
    ok('a show’s More boxes fold is unmarked and opens with its boxes', fold && !fold.lock && fold.label === null && boxes > 3, JSON.stringify({ fold, boxes }));
    await go(page, 'acts'); await sleep(300);
    await page.evaluate(() => import('./js/pages/acts.js').then(m => m.openAct('s-owls'))); await sleep(500);
    const addm = await page.locator('#ac-addm').count();
    if (addm) { await page.click('#ac-addm'); await sleep(400); }
    ok('+ Add member opens its sheet as before', addm === 1 && (await page.locator('.sheet').count()) > 0 && !(await page.locator('.sheet.licence-needed').count()));
    await page.keyboard.press('Escape'); await sleep(200);
    // + New offers every kind, as before.
    await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({}))); await sleep(300);
    const kinds = await page.$$eval('.bk-kinds .bk-kind', bs => bs.map(b => b.dataset.kind));
    ok('+ New offers every kind of booking, as before', kinds.length === 4, kinds.join(','));
    await page.keyboard.press('Escape'); await sleep(200);

    // Settings: About (not About & licence), nine parts, no licence panel; the role's line says nothing of a licence.
    await page.evaluate(() => import('./js/roles.js').then(r => r.setRole('producer'))); await sleep(200);
    await go(page, 'settings'); await sleep(300);
    const set = await page.evaluate(() => ({ parts: [...document.querySelectorAll('.se-sec')].map(d => d.id).join(','), about: document.querySelector('#se-about .twirl-name').textContent, sub: document.querySelector('#se-about .se-sub').textContent, role: document.querySelector('#se-role .se-sub').textContent }));
    ok('Settings shows About and its nine parts', set.about === 'About' && set.parts === 'se-role,se-profile,se-billing,se-backups,se-display,se-help,se-sample,se-about,se-erase', JSON.stringify(set));
    ok('…About’s closed line is today’s, and Your role’s says nothing of a licence', /· your data stays on this device$/.test(set.sub) && !/free|licen|read-only/i.test(set.role), JSON.stringify(set));
    await page.evaluate(() => { const d = document.getElementById('se-about'); d.open = true; }); await sleep(300);
    const about = await page.evaluate(() => ({ panel: document.querySelectorAll('.licence-panel').length, where: document.querySelector('#se-about .se-where').textContent, terms: document.querySelectorAll('#se-about a[href="terms.html"]').length }));
    ok('…with no licence panel, no Terms button, and no word of a licence server where the data is kept', about.panel === 0 && about.terms === 0 && /stays in this browser, on this device/.test(about.where) && !/licence/i.test(about.where), JSON.stringify(about));
    ok('no licence bar, ever', (await page.locator('.licence-bar').count()) === 0 && !(await page.evaluate(() => document.body.classList.contains('has-licence-bar'))));

    // A whole visit: every section, the welcome tour, the tutorials chooser, the idle work after it.
    for (const id of ['bookings', 'acts', 'people', 'songs', 'sessions', 'backline', 'venues', 'money', 'tools', 'insurance', 'settings']) { await go(page, id); await sleep(200); }
    await page.evaluate(() => import('./js/tutorials.js').then(m => m.openChooser())); await sleep(300);
    const chooserMarks = await page.locator('.sheet .dk-track-lock').count();
    await page.keyboard.press('Escape'); await sleep(200);
    ok('the tutorials chooser marks nothing', chooserMarks === 0);
    await sleep(2500); // the idle work: the licence's sources (nothing to do while off)
    ok('…and in the whole visit, every role tried, not one request went to /licence/ or /buy', asked.length === 0, asked.join(' | '));
    ok('…and the licence’s sheets and the website licence were never fetched', !fetched.some(p => /\/js\/licence\.js$|\/js\/licence-web\.js$/.test(p)) && (await page.locator('.sheet.lic-terms-sheet, .sheet.licence-needed, .sheet.licence-over, .sheet.licence-readonly').count()) === 0, fetched.filter(p => /licence/.test(p)).join(' '));
    ok('…and nothing about a licence was kept on the device', await page.evaluate(() => localStorage.getItem('tourbook-licence') === null && localStorage.getItem('tourbook-terms') === null));

    // Google Drive linked (a stand-in for js/sync.js's key): About's closed line names it.
    await page.evaluate(() => localStorage.setItem('tourbook-drive', '1'));
    await go(page, 'bookings'); await go(page, 'settings'); await sleep(300);
    ok('with Google Drive linked, About’s closed line names it', /your data stays on this device and your Google Drive$/.test(await page.textContent('#se-about .se-sub')), await page.textContent('#se-about .se-sub'));
    await page.evaluate(() => localStorage.removeItem('tourbook-drive'));

    // Erase keeps a licence record (as it is once licences are on somewhere: here a stand-in).
    await page.evaluate(() => localStorage.setItem('tourbook-licence', JSON.stringify({ first: 1, seen: 2 })));
    await page.evaluate(() => { const d = document.getElementById('se-erase'); d.open = true; });
    await page.fill('#se-erase-input', 'ERASE');
    await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.click('#se-erase-go')]);
    await page.waitForSelector('#deck .dk-next'); await sleep(300);
    ok('Erase this device keeps the licence record', (await page.evaluate(() => localStorage.getItem('tourbook-licence'))) === '{"first":1,"seen":2}');
    ok('…and, off, it is not read as one: everything is still open', same(await L(page), { mode: 'off', on: false, work: 'open', mark: null }));
    await ctx.close();

    // The live switch, but for another address (the real site): here it is off, and silent.
    {
      const { ctx: c2, page: p2, asked: a2 } = await openWith(['tourbook.crowmade.app']);
      await p2.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(200);
      for (const id of ['people', 'songs', 'settings', 'bookings']) { await go(p2, id); await sleep(200); }
      await p2.evaluate(() => import('./js/roles.js').then(r => r.setRole('audiophile'))); await sleep(300);
      const gone = await go(p2, 'money');
      await sleep(2500);
      const st = await L(p2);
      ok('live only on tourbook.crowmade.app: here it is off, every section opens, and nothing is asked of a server', st.mode === 'off' && gone === true && a2.length === 0, JSON.stringify({ st, gone, a2 }));
      await c2.close();
    }
  } catch (e) { ok('licence off crashed', false, e.message); }
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL licence off crashed — ' + e.message); process.exit(1); });
