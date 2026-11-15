// The Audiophile's start (js/start.js; the owner, 15 Nov 2026: "At the beginning, force a tutorial for users to add a
// band, venue, and then a show for the audiophiles role"): picked at "Who’s using Tourbook?" on a device with nothing in
// it, a card over Bands' add button, then the act form; over Venues', then the venue form; over Gigs' + New, then the
// show form, the band and venue found by typing. No Skip, no Escape; a closed form, a reload or a closed app brings the
// step back; bringing data in (a backup file, Google Drive) is the one way out. Then a shorter welcome tour. A device
// with records, a role picked anywhere else, or a welcome tour done before, never gets it. Both legs: these contexts
// take no licence seed, so in the on leg licences are live with nothing started, and the start must start nothing.
const { chromium } = require('playwright');
const { open, ok, sleep, BASE, licenceLeg } = require('../helpers.cjs');

const LEG = process.env.TOURBOOK_LICENCE === 'on' ? 'on' : 'off';
const SHOT = process.env.S;
const ASK = 'Who’s using Tourbook?';
const LICENCE_SHEETS = ['Before you use the working roles', 'Read-only until there is a licence', 'Did you see them?'];

// Every sheet that opens, across reloads (kept in the tab's sessionStorage): the licence's and "Did you see them?" must
// not come up at any point of the start.
const sheetLog = () => {
  const seen = () => { try { return JSON.parse(sessionStorage.getItem('t-sheets') || '[]'); } catch (e) { return []; } };
  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) {
      const s = n.nodeType === 1 && (n.matches('.sheet') ? n : n.querySelector('.sheet'));
      if (s) { const l = seen(); l.push(s.getAttribute('aria-label')); try { sessionStorage.setItem('t-sheets', JSON.stringify(l)); } catch (e) { /* ignore */ } }
    }
  }).observe(document, { childList: true, subtree: true });
};
// A fresh device: no welcome tour seen, no role, no licence seed. Every request to the licence server counted.
async function fresh(browser, { viewport = { width: 420, height: 900 }, prefs = null, init = null, seed = false } = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', hasTouch: true, acceptDownloads: true });
  if (seed) await licenceLeg(ctx);
  if (prefs) await ctx.addInitScript(p => { try { if (!localStorage.getItem('tourbook-prefs')) localStorage.setItem('tourbook-prefs', p); } catch (e) { /* ignore */ } }, JSON.stringify(prefs));
  if (init) await ctx.addInitScript(init);
  await ctx.addInitScript(sheetLog);
  const tile = { status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') };
  await ctx.route('https://*.tile.openstreetmap.org/**', r => r.fulfill(tile));
  await ctx.route('https://tile.openstreetmap.org/**', r => r.fulfill(tile));
  await ctx.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const net = { licence: [] };
  ctx.on('request', r => { try { const p = new URL(r.url()).pathname; if (p.startsWith('/licence/')) net.licence.push(p); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE);
  return { ctx, page, errors, net };
}
const pick = async (page, id) => { await page.waitForSelector(`.sheet[aria-label="${ASK}"] .rp-card[data-role="${id}"]`, { timeout: 8000 }); await sleep(200); await page.click(`.rp-ask .rp-card[data-role="${id}"]`); };
// The card with that title (and count) is up, no sheet over it, and its spotlight has stopped moving.
const cardIs = (page, title, count = null) => page.waitForFunction(([t, n]) => {
  const c = document.querySelector('.tour-card');
  return !!c && (c.querySelector('#tour-title') || {}).textContent === t && (n == null || (c.querySelector('.tour-step') || {}).textContent === n) && !document.querySelector('.sheet-back');
}, [title, count], { timeout: 10000 }).then(() => sleep(600)).then(() => true, () => false);
const title = page => page.evaluate(() => (document.querySelector('.tour-card #tour-title') || {}).textContent || null);
const key = page => page.evaluate(() => localStorage.getItem('tourbook-start'));
const sheets = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('t-sheets') || '[]'));
const mode = page => page.evaluate(() => import('./js/licence-state.js').then(m => m.licenceNow().mode));
const db = page => page.evaluate(() => import('./js/store.js').then(s => JSON.parse(s.serialize())));
const where = page => page.evaluate(() => window.logiPage());
const primary = page => page.click('.tour-actions .btn.primary');
const form = async (page, label) => { const f = page.locator(`.sheet[aria-label="${label}"]`); await f.waitFor({ timeout: 8000 }); await sleep(250); return f; };
const close = (page, label) => page.click(`.sheet[aria-label="${label}"] .sheet-head [aria-label="Close"]`);
// The spotlight sits over that element (it is the element, 8 px round it).
const spotOver = (page, sel) => page.evaluate(sel => {
  const t = document.querySelector(sel), sp = document.querySelector('.tour-spot'); if (!t || !sp) return false;
  const r = t.getBoundingClientRect(), s = sp.getBoundingClientRect();
  return s.left <= r.left + 1 && s.top <= r.top + 1 && s.right >= r.right - 1 && s.bottom >= r.bottom - 1 && s.width <= r.width + 20 && s.height <= r.height + 20;
}, sel);
const shot = (page, name) => (SHOT ? page.screenshot({ path: `${SHOT}/04-start-${name}.png` }) : null);
// Through every card of a walkthrough with its primary button, the titles in order.
async function walk(page) {
  const titles = [];
  for (let i = 0; i < 12 && await page.locator('.tour-card #tour-title').count(); i++) {
    const t = await title(page); titles.push(t);
    await primary(page);
    await page.waitForFunction(was => (document.querySelector('.tour-card #tour-title') || {}).textContent !== was, t, { timeout: 6000 }).catch(() => {});
    await sleep(700);
  }
  return titles;
}
const backupFile = data => ({ name: 'tourbook-backup-2026-11-15.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'tourbook', version: 1, updatedAt: Date.now() - 864e5, ...data })) });

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---------------- 1–9: the whole start, light ---------------- */
    {
      const { ctx, page, errors, net } = await fresh(browser);
      const modes = [];
      await pick(page, 'audiophile');
      ok('1. picking the Audiophile brings Step 1’s card over Bands: “Add a band”, “Step 1 of 3”', await cardIs(page, 'Add a band', 'Step 1 of 3') && (await where(page)) === 'acts', `${await title(page)} on ${await where(page)}`);
      modes.push(await mode(page));
      ok('…its spotlight over Bands’ own add button', await spotOver(page, '#ac-new-empty'));
      const c1 = await page.evaluate(() => {
        const c = document.querySelector('.tour-card'), a = document.activeElement;
        return { skip: [...c.querySelectorAll('button')].some(b => b.textContent.trim() === 'Skip'), out: (document.getElementById('start-backup') || {}).textContent, primary: (c.querySelector('.tour-actions .btn.primary') || {}).textContent,
          focused: !!a && a.matches('.tour-actions .btn.primary'), described: c.getAttribute('aria-describedby'), text: (document.getElementById('tour-text') || {}).textContent };
      });
      ok('…no Skip; the way out, “I have a backup file or Google Drive…”; the primary “Add a band…”, with the focus', !c1.skip && c1.out === 'I have a backup file or Google Drive…' && c1.primary === 'Add a band…' && c1.focused, JSON.stringify(c1));
      ok('…the card is described by its words', c1.described === 'tour-text' && c1.text === 'Three steps put your first gig on your calendar. First, a band you’ve seen or want to see: their card keeps your score each time you see them.', JSON.stringify(c1));
      ok('…tourbook-start is {"role":"audiophile","made":[]}, and no welcome card came first', (await key(page)) === '{"role":"audiophile","made":[]}' && !(await page.evaluate(() => localStorage.getItem('tourbook-tour'))), await key(page));
      await shot(page, 'step1-light');
      /* 2 */
      await page.keyboard.press('Escape'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); await sleep(1200);
      ok('2. Escape, ← and → change nothing: still Step 1’s card, still on Bands', (await title(page)) === 'Add a band' && (await where(page)) === 'acts' && (await key(page)) === '{"role":"audiophile","made":[]}');
      /* 3 */
      await primary(page);
      let f = await form(page, 'New act');
      const note = await f.evaluate(s => { const fm = s.querySelector('form.form'), first = fm.firstElementChild, name = fm.querySelector('[data-key=name]'); return { is: first.matches('p.start-note#start-note'), text: first.textContent, by: (name.getAttribute('aria-describedby') || '').split(' ') }; });
      ok('3. “Add a band…” opens the act form, its first line the start’s: “Only the name is needed. The rest can wait.”', note.is && note.text === 'Only the name is needed. The rest can wait.', JSON.stringify(note));
      ok('…and the name box is described by it', note.by.includes('start-note'), JSON.stringify(note.by));
      await close(page, 'New act');
      ok('…✕ brings the card back, at Step 1, the focus on its primary', await cardIs(page, 'Add a band', 'Step 1 of 3') && await page.evaluate(() => document.activeElement.matches('.tour-actions .btn.primary')));
      await primary(page); f = await form(page, 'New act'); await f.locator('.form-actions .btn.ghost', { hasText: 'Cancel' }).click();
      ok('…so does Cancel', await cardIs(page, 'Add a band', 'Step 1 of 3'));
      await primary(page); f = await form(page, 'New act'); await page.keyboard.press('Escape');
      ok('…and Escape in the form', await cardIs(page, 'Add a band', 'Step 1 of 3'));
      /* 4 */
      await page.reload();
      ok('4. a reload brings Step 1’s card back, with no “Who’s using Tourbook?”', await cardIs(page, 'Add a band', 'Step 1 of 3') && (await sheets(page)).filter(s => s === ASK).length === 1 && (await page.locator('.rp-ask').count()) === 0);
      /* 5 */
      await primary(page); f = await form(page, 'New act');
      await f.locator('[data-key=name]').fill('The Moths'); await f.locator('button[type=submit]').click();
      ok('5. “The Moths”, Add act: Step 2’s card over Venues, “Add a venue”, “Step 2 of 3”', await cardIs(page, 'Add a venue', 'Step 2 of 3') && (await where(page)) === 'venues');
      ok('…its spotlight over Venues’ own add button', await spotOver(page, '#vn-first'));
      let data = await db(page);
      ok('…the act is stored, and tourbook-start holds its id', data.acts.length === 1 && data.acts[0].name === 'The Moths' && (await key(page)) === JSON.stringify({ role: 'audiophile', made: [data.acts[0].id] }), await key(page));
      modes.push(await mode(page));
      await shot(page, 'step2-light');
      await page.reload();
      ok('…and a reload comes back at Step 2', await cardIs(page, 'Add a venue', 'Step 2 of 3') && (await where(page)) === 'venues');
      /* 6 */
      await primary(page); f = await form(page, 'Add venue');
      ok('6. “Add a venue…” opens the venue form with its line', (await f.locator('form.form > p.start-note:first-child').textContent()) === 'Only the name is needed. An address puts it on the map.');
      await f.locator('[data-key=name]').fill('The Lantern Rooms'); await f.locator('[data-key=address]').fill('12 Lamp Lane, Leeds');
      await f.locator('button[type=submit]').click();
      ok('…Add venue: Step 3’s card over Gigs’ + New, “Add a gig”, “Step 3 of 3”', await cardIs(page, 'Add a gig', 'Step 3 of 3') && (await where(page)) === 'bookings' && await spotOver(page, '.bk-new'));
      ok('…its words name the band and the venue just added', (await page.textContent('#tour-text')) === 'Last, a gig you’re going to. Type the first letters of “The Moths” and “The Lantern Rooms”, and pick each from the list.', await page.textContent('#tour-text'));
      ok('…and its primary is “Add a gig…”', (await page.textContent('.tour-actions .btn.primary')) === 'Add a gig…');
      await shot(page, 'step3-light');
      /* 7 */
      await primary(page); f = await form(page, 'New show');
      data = await db(page);
      const gf = await f.evaluate(s => { const a = s.querySelector('input[data-key=actId]'), v = s.querySelector('input[data-key=venueId]'); return { line: (s.querySelector('form.form > p.start-note:first-child') || {}).textContent, actId: a.dataset.id, act: a.value, venueId: v.dataset.id, venue: v.value, focus: document.activeElement === a, by: (a.getAttribute('aria-describedby') || '').split(' ') }; });
      ok('7. “Add a gig…” opens the show form with its line', gf.line === 'Type the first letters of “The Moths” in the Band box and pick it from the list, then “The Lantern Rooms” in the Venue box. The rest can wait.' && gf.by.includes('start-note'), JSON.stringify(gf));
      ok('…the band box empty though there is one band, the venue box empty, the focus in the band box', gf.actId === '' && gf.act === '' && gf.venueId === '' && gf.venue === '' && gf.focus, JSON.stringify(gf));
      await page.keyboard.type('mo'); await sleep(250);
      await page.keyboard.press('ArrowDown'); await sleep(150);
      await shot(page, 'gig-form-light');
      await page.keyboard.press('Enter'); await sleep(250);
      ok('…“mo”, ↓, Enter picks The Moths, and the form stays', (await f.locator('input[data-key=actId]').getAttribute('data-id')) === data.acts[0].id && (await f.locator('input[data-key=actId]').inputValue()) === 'The Moths' && await f.isVisible());
      await f.locator('input[data-key=venueId]').fill('lant'); await sleep(200);
      await f.locator('[id$="-venueId-list"] .cb-opt').first().tap(); await sleep(250);
      ok('…a tap on “lant”’s option picks The Lantern Rooms, its address under the box', (await f.locator('input[data-key=venueId]').getAttribute('data-id')) === data.venues[0].id && /12 Lamp Lane, Leeds/.test(await f.locator('.bk-venue-note').textContent()));
      await f.locator('button[type=submit]').click();
      ok('…Add: “Your first gig is on your calendar”', await cardIs(page, 'Your first gig is on your calendar'));
      data = await db(page);
      ok('…no “Add to your lists?”; the gig stored with the band and the venue', !(await sheets(page)).includes('Add to your lists?') && data.bookings.length === 1 && data.bookings[0].kind === 'show' && data.bookings[0].actId === data.acts[0].id && data.bookings[0].venueId === data.venues[0].id && !data.bookings[0].client, JSON.stringify(data.bookings[0]));
      ok('…tourbook-start is gone', (await key(page)) === null);
      const last = await page.evaluate(() => ({ skip: [...document.querySelectorAll('.tour-actions button')].some(b => b.textContent.trim() === 'Skip'), text: document.getElementById('tour-text').textContent }));
      ok('…the card is over the gig’s score row on its page, says what to do there, and has Skip', await spotOver(page, '.bk-page .bk-hero .bk-score') && last.skip && last.text === 'On the night or after, score the band out of 100 on this page. Next, a quick look around. Tap Skip any time.', JSON.stringify(last));
      modes.push(await mode(page));
      await shot(page, 'done-light');
      /* 8 */
      const titles = await walk(page);
      ok('8. the tour that follows: the gig, Your details, the section menu, the search, Tools, Settings: no stop for Gigs, Bands or Venues', JSON.stringify(titles) === JSON.stringify(['Your first gig is on your calendar', 'Your details', 'Your sections are tracks', 'Search', 'Tools', 'Settings']), JSON.stringify(titles));
      await sleep(2500); // the sheets at an opening have their turn
      ok('…Done: the welcome tour is marked seen, and Tourbook is on the calendar', (await page.evaluate(() => localStorage.getItem('tourbook-tour'))) === 'done' && (await where(page)) === 'bookings' && (await page.locator('.bk-calview').count()) === 1);
      const all = await sheets(page);
      ok('…and no “Did you see them?” or licence sheet came up at any point', !all.some(s => LICENCE_SHEETS.includes(s)) && JSON.stringify(all.filter(s => s !== ASK)) === JSON.stringify(['New act', 'New act', 'New act', 'New act', 'Add venue', 'New show']), JSON.stringify(all));
      /* 9 */
      modes.push(await mode(page));
      const terms = await page.evaluate(() => localStorage.getItem('tourbook-terms'));
      if (LEG === 'on') ok('9. licences live: nothing started all through (unstarted), no terms asked or stored, nothing asked of the licence server', modes.every(m => m === 'unstarted') && terms === null && net.licence.length === 0, JSON.stringify({ modes, terms, asked: net.licence }));
      else ok('9. licences off all through, and nothing asked of the licence server', modes.every(m => m === 'off') && net.licence.length === 0, JSON.stringify({ modes, asked: net.licence }));
      ok('no errors in the console (the whole start)', errors.length === 0, errors.slice(0, 5).join(' | '));
      await ctx.close();
    }

    /* ---------------- 10: new names typed at Step 3, dark; a reload during the tour that follows ---------------- */
    {
      const { ctx, page, errors, net } = await fresh(browser, { prefs: { scheme: 'dark' } });
      await pick(page, 'audiophile');
      await cardIs(page, 'Add a band', 'Step 1 of 3'); await shot(page, 'step1-dark');
      await primary(page); let f = await form(page, 'New act'); await shot(page, 'band-form-dark');
      await f.locator('[data-key=name]').fill('The Moths'); await f.locator('button[type=submit]').click();
      await cardIs(page, 'Add a venue', 'Step 2 of 3'); await shot(page, 'step2-dark');
      await primary(page); f = await form(page, 'Add venue'); await shot(page, 'venue-form-dark');
      await f.locator('[data-key=name]').fill('The Lantern Rooms'); await f.locator('button[type=submit]').click();
      await cardIs(page, 'Add a gig', 'Step 3 of 3'); await shot(page, 'step3-dark');
      await primary(page); f = await form(page, 'New show');
      await page.keyboard.type('mo'); await sleep(250); await page.keyboard.press('ArrowDown'); await sleep(150); await shot(page, 'gig-form-dark');
      await f.locator('input[data-key=actId]').fill('New Band'); await f.locator('input[data-key=venueId]').fill('New Hall'); await page.keyboard.press('Tab'); await sleep(150);
      await f.locator('button[type=submit]').click();
      await page.waitForSelector('.sheet[aria-label="Add to your lists?"] #bk-add-both', { timeout: 6000 }); await sleep(250);
      await page.click('#bk-add-both');
      ok('10. new names typed at Step 3 are asked about; Add both: “Your first gig is on your calendar”', await cardIs(page, 'Your first gig is on your calendar'));
      const data = await db(page), b = data.bookings[0] || {}, act = data.acts.find(a => a.name === 'New Band'), ven = data.venues.find(v => v.name === 'New Hall');
      ok('…the gig linked to the band and the venue just made, the start’s own two kept', data.acts.length === 2 && data.venues.length === 2 && act && ven && b.actId === act.id && b.venueId === ven.id && (await key(page)) === null, JSON.stringify(b));
      await shot(page, 'done-dark');
      await page.reload();
      ok('…a reload during the tour that follows brings the whole welcome tour', await cardIs(page, 'Welcome to Tourbook') && (await key(page)) === null);
      ok('…licences: nothing asked of the licence server', net.licence.length === 0 && (LEG === 'on' ? (await mode(page)) === 'unstarted' : true), JSON.stringify(net.licence));
      ok('no errors in the console (new names)', errors.length === 0, errors.slice(0, 5).join(' | '));
      await ctx.close();
    }

    /* ---------------- 11–12: the way out, a backup file ---------------- */
    {
      const { ctx, page, errors, net } = await fresh(browser);
      await pick(page, 'audiophile');
      await cardIs(page, 'Add a band', 'Step 1 of 3');
      await page.click('#start-backup');
      ok('11. “I have a backup file or Google Drive…” opens Backups', await page.locator('.sheet[aria-label="Backups"]').waitFor({ timeout: 6000 }).then(() => true, () => false) && (await page.locator('.tour-card').count()) === 0);
      await sleep(400); await shot(page, 'backups-light');
      await close(page, 'Backups');
      ok('…✕ brings Step 1’s card back', await cardIs(page, 'Add a band', 'Step 1 of 3'));
      // 12: an empty backup brings nothing: the start carries on
      await page.click('#start-backup'); await page.locator('.sheet[aria-label="Backups"]').waitFor();
      await page.setInputFiles('.sheet .se-bk-input', backupFile({ acts: [], venues: [] }));
      await page.locator('.sheet[aria-label="Bring back a backup"] .se-imp-merge').click(); await sleep(400);
      await close(page, 'Backups');
      ok('12. an empty backup file brought in: Step 1’s card again, and the start is kept', await cardIs(page, 'Add a band', 'Step 1 of 3') && (await key(page)) === '{"role":"audiophile","made":[]}');
      // 11: a backup with a band and a venue ends it
      await page.click('#start-backup'); await page.locator('.sheet[aria-label="Backups"]').waitFor();
      await page.setInputFiles('.sheet .se-bk-input', backupFile({ acts: [{ id: 'bk-act', name: 'Backup Band', color: '', members: [] }], venues: [{ id: 'bk-ven', name: 'Backup Hall', kind: 'venue', address: '' }] }));
      await page.locator('.sheet[aria-label="Bring back a backup"] .se-imp-merge').click(); await sleep(400);
      await close(page, 'Backups');
      ok('…a backup with a band and a venue brought in: no card, the start is over, and the welcome tour runs from its first card', await cardIs(page, 'Welcome to Tourbook') && (await key(page)) === null);
      const data = await db(page);
      ok('…with what the file held', data.acts.length === 1 && data.acts[0].id === 'bk-act' && data.venues.length === 1);
      ok('…and nothing asked of the licence server', net.licence.length === 0, JSON.stringify(net.licence));
      ok('no errors in the console (a backup)', errors.length === 0, errors.slice(0, 5).join(' | '));
      await ctx.close();
    }

    /* ---------------- 13: Google Drive's path: records adopted while a card is up ---------------- */
    {
      const { ctx, page, errors } = await fresh(browser);
      await pick(page, 'audiophile');
      await cardIs(page, 'Add a band', 'Step 1 of 3');
      await primary(page); const f = await form(page, 'New act');
      await f.locator('[data-key=name]').fill('The Moths'); await f.locator('button[type=submit]').click();
      await cardIs(page, 'Add a venue', 'Step 2 of 3');
      await page.evaluate(() => import('./js/store.js').then(s => s.adopt({ ...JSON.parse(s.serialize()), venues: [{ id: 'd-ven', name: 'Drive Hall', kind: 'venue', address: '' }] })));
      ok('13. Google Drive brings a venue in while Step 2’s card is up: the card goes, the start is over, the welcome tour follows', await cardIs(page, 'Welcome to Tourbook') && (await key(page)) === null);
      ok('no errors in the console (Google Drive)', errors.length === 0, errors.slice(0, 5).join(' | '));
      await ctx.close();
    }

    /* ---------------- 14: never ---------------- */
    {
      // (a) a device with a record on it
      const a = await fresh(browser, { init: () => { try { if (!localStorage.getItem('tourbook-db-v1')) localStorage.setItem('tourbook-db-v1', JSON.stringify({ venues: [{ id: 'old-ven', name: 'Old Hall', kind: 'venue' }] })); } catch (e) { /* ignore */ } } });
      await pick(a.page, 'audiophile');
      ok('14a. a device with one venue on it: picking the Audiophile brings the welcome tour, not the start', await cardIs(a.page, 'Welcome to Tourbook') && (await key(a.page)) === null);
      ok('no errors in the console (a device with a record)', a.errors.length === 0, a.errors.slice(0, 5).join(' | '));
      await a.ctx.close();
      // (b) another role (its terms agreed in the on leg, as a working role asks them first)
      const b = await fresh(browser, { seed: true });
      await pick(b.page, 'band');
      ok('14b. Band picked on a fresh device: the welcome tour, no start', await cardIs(b.page, 'Welcome to Tourbook') && (await key(b.page)) === null);
      ok('no errors in the console (Band)', b.errors.length === 0, b.errors.slice(0, 5).join(' | '));
      await b.ctx.close();
      // (c) the question closed without a pick
      const c = await fresh(browser);
      await c.page.waitForSelector('.rp-ask', { timeout: 8000 }); await sleep(300);
      await close(c.page, ASK);
      ok('14c. the question closed without a pick: the welcome tour, no start', await cardIs(c.page, 'Welcome to Tourbook') && (await key(c.page)) === null);
      ok('no errors in the console (closed)', c.errors.length === 0, c.errors.slice(0, 5).join(' | '));
      await c.ctx.close();
      // (d) Settings → Your role, on a device whose welcome tour was done
      const d = await open();
      await d.page.evaluate(() => window.logiGo('settings')); await sleep(400);
      await d.page.evaluate(() => { document.getElementById('se-role').open = true; }); await sleep(250);
      await d.page.click('#se-role .rp-card[data-role="audiophile"]'); await sleep(2000);
      ok('14d. the Audiophile chosen under Settings → Your role: no card, no start', (await d.page.evaluate(() => localStorage.getItem('tourbook-role'))) === 'audiophile' && (await d.page.locator('.tour-card').count()) === 0 && (await key(d.page)) === null);
      ok('no errors in the console (Settings)', d.errors.length === 0, d.errors.slice(0, 5).join(' | '));
      await d.browser.close();
    }

    /* ---------------- 15: a welcome tour seen meanwhile does not end it ---------------- */
    {
      const { ctx, page, errors } = await fresh(browser);
      await page.waitForSelector('.rp-ask', { timeout: 8000 });
      await page.evaluate(() => {
        localStorage.setItem('tourbook-db-v1', JSON.stringify({ acts: [{ id: 'm-act', name: 'The Moths', color: '', members: [] }] }));
        localStorage.setItem('tourbook-role', 'audiophile'); localStorage.setItem('tourbook-tour', 'done');
        localStorage.setItem('tourbook-start', JSON.stringify({ role: 'audiophile', made: ['m-act'] }));
      });
      await page.reload();
      ok('15. a start at Step 2 with the welcome tour marked seen meanwhile: a reload brings Step 2’s card', await cardIs(page, 'Add a venue', 'Step 2 of 3') && (await where(page)) === 'venues');
      ok('no errors in the console (seen meanwhile)', errors.length === 0, errors.slice(0, 5).join(' | '));
      await ctx.close();
    }

    /* ---------------- 16: 320×568, extra-large text and buttons ---------------- */
    for (const scheme of ['light', 'dark']) {
      const { ctx, page, errors } = await fresh(browser, { viewport: { width: 320, height: 568 }, prefs: { scheme, text: 'xlarge', targets: 'large' } });
      await pick(page, 'audiophile');
      const up = await cardIs(page, 'Add a band', 'Step 1 of 3');
      const fit = await page.evaluate(() => {
        const W = innerWidth, H = innerHeight, inside = el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= W + 1 && r.bottom <= H + 1; };
        const c = document.querySelector('.tour-card'), btns = [...c.querySelectorAll('.tour-actions button')];
        return { card: inside(c), btns: btns.length === 2 && btns.every(inside), wide: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
      });
      ok(`16. 320×568, extra-large text and buttons (${scheme}): the card and both its buttons on the screen, no sideways scroll`, up && fit.card && fit.btns && fit.wide, JSON.stringify(fit));
      await shot(page, `step1-320-xl-${scheme}`);
      ok(`no errors in the console (320, ${scheme})`, errors.length === 0, errors.slice(0, 5).join(' | '));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
})().catch(e => { console.log('FAIL 04-start crashed — ' + e.message); process.exit(1); });
