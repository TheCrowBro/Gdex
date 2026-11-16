// The Audiophile's start (js/start.js; the owner, 15 Nov 2026: "At the beginning, force a tutorial for users to add a
// band, venue, and then a show for the audiophiles role"): picked at "Who’s using Tourbook?" on a device with nothing in
// it, a card over Bands' add button, then the act form; over Venues', then the venue form; over Gigs' + New, then the
// show form, the band and venue found by typing. No Skip, no Escape; a closed form, a reload or a closed app brings the
// step back; bringing data in (a backup file, Google Drive) is the one way out. Then a shorter welcome tour. A device
// with records, a role picked anywhere else, or a welcome tour done before, never gets it. Both legs: these contexts
// take no licence seed, so in the on leg licences are live with nothing started, and the start must start nothing.
const { chromium } = require('playwright');
const { open, ok, sleep, BASE, licenceLeg, typePick } = require('../helpers.cjs');

const LEG = process.env.TOURBOOK_LICENCE === 'on' ? 'on' : 'off';
const SHOT = process.env.S;
const ASK = 'Who’s using Tourbook?';
const LICENCE_SHEETS = ['Before you use the working roles', 'Read-only until there is a licence', 'Did you see them?'];

// Every sheet that opens, across reloads (kept in the tab's sessionStorage): the licence's and "Did you see them?" must
// not come up at any point of the start. Every toast too ("Gig added").
const sheetLog = () => {
  const seen = k => { try { return JSON.parse(sessionStorage.getItem(k) || '[]'); } catch (e) { return []; } };
  const log = (k, v) => { const l = seen(k); l.push(v); try { sessionStorage.setItem(k, JSON.stringify(l)); } catch (e) { /* ignore */ } };
  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) {
      const s = n.nodeType === 1 && (n.matches('.sheet') ? n : n.querySelector('.sheet'));
      if (s) log('t-sheets', s.getAttribute('aria-label'));
      if (n.nodeType === 1 && n.matches('.toast')) log('t-toasts', n.textContent);
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
  const errors = [], said = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { said.push(m.text()); if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE);
  return { ctx, page, errors, net, said };
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
const toasts = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('t-toasts') || '[]'));
// A sheet's own walkthrough (its ? button), by the sheet's title: the steps' titles and words.
const sheetSteps = (page, t) => page.evaluate(t => import('./js/tour.js').then(m => { const s = m.sheetSteps(t); return (typeof s === 'function' ? s() : s || []).map(x => [x.title, x.text]); }), t);
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
      ok('…which says “+ New band”, in the Audiophile’s words', (await page.textContent('#ac-new-empty')) === '+ New band', await page.textContent('#ac-new-empty'));
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
      let f = await form(page, 'New band');
      const note = await f.evaluate(s => { const fm = s.querySelector('form.form'), first = fm.firstElementChild, name = fm.querySelector('[data-key=name]'); return { is: first.matches('p.start-note#start-note'), text: first.textContent, by: (name.getAttribute('aria-describedby') || '').split(' ') }; });
      ok('3. “Add a band…” opens the act form, its first line the start’s: “Only the name is needed. The rest can wait.”', note.is && note.text === 'Only the name is needed. The rest can wait.', JSON.stringify(note));
      ok('…and the name box is described by it', note.by.includes('start-note'), JSON.stringify(note.by));
      const bandSteps = await sheetSteps(page, 'New band');
      ok('…the form is “New band”, its button “Add band”, and its ? walkthrough is the act form’s', (await f.locator('button[type=submit]').textContent()) === 'Add band' && bandSteps.length > 0 && bandSteps[0][0] === 'Name', JSON.stringify(bandSteps.slice(0, 1)));
      await close(page, 'New band');
      ok('…✕ brings the card back, at Step 1, the focus on its primary', await cardIs(page, 'Add a band', 'Step 1 of 3') && await page.evaluate(() => document.activeElement.matches('.tour-actions .btn.primary')));
      await primary(page); f = await form(page, 'New band'); await f.locator('.form-actions .btn.ghost', { hasText: 'Cancel' }).click();
      ok('…so does Cancel', await cardIs(page, 'Add a band', 'Step 1 of 3'));
      await primary(page); f = await form(page, 'New band'); await page.keyboard.press('Escape');
      ok('…and Escape in the form', await cardIs(page, 'Add a band', 'Step 1 of 3'));
      /* 4 */
      await page.reload();
      ok('4. a reload brings Step 1’s card back, with no “Who’s using Tourbook?”', await cardIs(page, 'Add a band', 'Step 1 of 3') && (await sheets(page)).filter(s => s === ASK).length === 1 && (await page.locator('.rp-ask').count()) === 0);
      /* 5 */
      await primary(page); f = await form(page, 'New band');
      await f.locator('[data-key=name]').fill('The Moths'); await f.locator('button[type=submit]').click();
      ok('5. “The Moths”, Add band: Step 2’s card over Venues, “Add a venue”, “Step 2 of 3”', await cardIs(page, 'Add a venue', 'Step 2 of 3') && (await where(page)) === 'venues');
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
      await primary(page); f = await form(page, 'New gig');
      data = await db(page);
      const gf = await f.evaluate(s => { const a = s.querySelector('input[data-key=actId]'), v = s.querySelector('input[data-key=venueId]'); return { line: (s.querySelector('form.form > p.start-note:first-child') || {}).textContent, actId: a.dataset.id, act: a.value, venueId: v.dataset.id, venue: v.value, focus: document.activeElement === a, by: (a.getAttribute('aria-describedby') || '').split(' ') }; });
      ok('7. “Add a gig…” opens the show form with its line', gf.line === 'Type the first letters of “The Moths” in the Band box and pick it from the list, then “The Lantern Rooms” in the Venue box. The rest can wait.' && gf.by.includes('start-note'), JSON.stringify(gf));
      ok('…the band box empty though there is one band, the venue box empty, the focus in the band box', gf.actId === '' && gf.act === '' && gf.venueId === '' && gf.venue === '' && gf.focus, JSON.stringify(gf));
      const gigSteps = await sheetSteps(page, 'New gig');
      ok('…the form is “New gig”, and its ? walkthrough is the show form’s', gigSteps.length > 0 && gigSteps[0][0] === 'The band', JSON.stringify(gigSteps.slice(0, 1)));
      await page.keyboard.type('mo'); await sleep(250);
      const moLine = await f.evaluate(s => { const a = s.querySelector('input[data-key=actId]'); return { line: document.getElementById(a.getAttribute('aria-describedby').split(' ')[0]).innerText, list: [...document.getElementById(a.getAttribute('aria-controls')).querySelectorAll('.cb-name')].map(x => x.textContent) }; });
      ok('…“mo” lists The Moths, and the line under the box asks for a pick, not that it is new: “Pick one from the list, or keep typing for a new name.”', JSON.stringify(moLine.list) === '["The Moths"]' && moLine.line === 'Pick one from the list, or keep typing for a new name.', JSON.stringify(moLine));
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
      ok('…and the toast said “Gig added”', (await toasts(page)).includes('Gig added'), JSON.stringify(await toasts(page)));
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
      ok('…and no “Did you see them?” or licence sheet came up at any point', !all.some(s => LICENCE_SHEETS.includes(s)) && JSON.stringify(all.filter(s => s !== ASK)) === JSON.stringify(['New band', 'New band', 'New band', 'New band', 'Add venue', 'New gig']), JSON.stringify(all));
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
      await primary(page); let f = await form(page, 'New band'); await shot(page, 'band-form-dark');
      await f.locator('[data-key=name]').fill('The Moths'); await f.locator('button[type=submit]').click();
      await cardIs(page, 'Add a venue', 'Step 2 of 3'); await shot(page, 'step2-dark');
      await primary(page); f = await form(page, 'Add venue'); await shot(page, 'venue-form-dark');
      await f.locator('[data-key=name]').fill('The Lantern Rooms'); await f.locator('button[type=submit]').click();
      await cardIs(page, 'Add a gig', 'Step 3 of 3'); await shot(page, 'step3-dark');
      await primary(page); f = await form(page, 'New gig');
      await page.keyboard.type('mo'); await sleep(250); await page.keyboard.press('ArrowDown'); await sleep(150); await shot(page, 'gig-form-dark');
      await f.locator('input[data-key=actId]').fill('New Band'); await f.locator('input[data-key=venueId]').fill('New Hall'); await page.keyboard.press('Tab'); await sleep(150);
      await f.locator('button[type=submit]').click();
      await page.waitForSelector('.sheet[aria-label="Add to your lists?"] #bk-add-both', { timeout: 6000 }); await sleep(250);
      const addSteps = (await sheetSteps(page, 'Add to your lists?')).map(x => x[1]).join(' ');
      ok('10. “Add to your lists?”: its ? walkthrough in the Audiophile’s words (“stays on the gig as typed”)', addSteps === 'Added, a name goes on its list, ready to pick next time you type it. A name you don’t add stays on the gig as typed. Back to the form, or ✕, saves nothing.', addSteps);
      await page.click('#bk-add-both');
      ok('…new names typed at Step 3 are asked about; Add both: “Your first gig is on your calendar”', await cardIs(page, 'Your first gig is on your calendar'));
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
      await primary(page); const f = await form(page, 'New band');
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

    /* ---------------- 16: small screens: the card's words in view, its buttons on screen, + New clear of the menu ---------------- */
    // The card's words fully in view inside its body (no scroll needed for them), the card and its primary on the
    // screen, the way out in the card's body under the words, no sideways scroll.
    const fit = page => page.evaluate(() => {
      const W = innerWidth, H = innerHeight, inside = el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= W + 1 && r.bottom <= H + 1; };
      const c = document.querySelector('.tour-card'), body = c.querySelector('.tour-body'), t = document.getElementById('tour-text'), out = document.getElementById('start-backup');
      const b = body.getBoundingClientRect(), r = t.getBoundingClientRect(), shown = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)) / r.height;
      return { card: inside(c), primary: inside(c.querySelector('.tour-actions .btn.primary')), words: Math.round(shown * 100), out: !!out && body.contains(out) && !!(t.compareDocumentPosition(out) & Node.DOCUMENT_POSITION_FOLLOWING), wide: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
    });
    // What is on top at the middle of the spotlight, the walkthrough's layer aside: inside that selector.
    const onTop = (page, sel) => page.evaluate(sel => {
      const sp = document.querySelector('.tour-spot').getBoundingClientRect(), app = document.getElementById('app'), layer = document.querySelector('.tour'), was = app.inert;
      layer.style.visibility = 'hidden'; app.inert = false;
      try { const el = document.elementFromPoint(sp.left + sp.width / 2, sp.top + sp.height / 2); return el ? (el.closest(sel) ? true : el.className || el.tagName) : null; } finally { app.inert = was; layer.style.visibility = ''; }
    }, sel);
    for (const [w, h, prefs, label] of [[320, 568, { scheme: 'light', text: 'xlarge', targets: 'large' }, 'extra-large text and buttons, light'], [320, 568, { scheme: 'dark', text: 'xlarge', targets: 'large' }, 'extra-large text and buttons, dark'],
      [740, 360, null, 'a phone on its side'], [360, 640, null, 'a short phone']]) {
      const { ctx, page, errors } = await fresh(browser, { viewport: { width: w, height: h }, prefs });
      const at = `${w}×${h}, ${label}`, good = x => x.card && x.primary && x.words >= 99 && x.out && x.wide;
      await pick(page, 'audiophile');
      const up = await cardIs(page, 'Add a band', 'Step 1 of 3');
      let f1 = await fit(page);
      ok(`16. ${at}: Step 1’s words in view, the card and its primary on the screen, the way out under the words, no sideways scroll`, up && good(f1), JSON.stringify(f1));
      await shot(page, `step1-${w}x${h}-${prefs ? prefs.scheme : 'light'}`);
      await primary(page); let f = await form(page, 'New band');
      await f.locator('[data-key=name]').fill('The Moths'); await f.locator('button[type=submit]').click();
      const up2 = await cardIs(page, 'Add a venue', 'Step 2 of 3'); f1 = await fit(page);
      ok(`…Step 2 (${at})`, up2 && good(f1), JSON.stringify(f1));
      await primary(page); f = await form(page, 'Add venue');
      await f.locator('[data-key=name]').fill('The Lantern Rooms'); await f.locator('button[type=submit]').click();
      const up3 = await cardIs(page, 'Add a gig', 'Step 3 of 3'); f1 = await fit(page);
      ok(`…Step 3 (${at})`, up3 && good(f1), JSON.stringify(f1));
      const top = await onTop(page, '.bk-new');
      ok(`…Step 3’s spotlight over + New, and + New not under the section menu (${at})`, await spotOver(page, '.bk-new') && top === true, String(top));
      await shot(page, `step3-${w}x${h}-${prefs ? prefs.scheme : 'light'}`);
      ok(`no errors in the console (${at})`, errors.length === 0, errors.slice(0, 5).join(' | '));
      await ctx.close();
    }

    /* ---------------- 17: a role's start ends on its own last card (STARTS[role].done) ---------------- */
    {
      const { ctx, page, errors } = await fresh(browser);
      await pick(page, 'audiophile');
      await cardIs(page, 'Add a band', 'Step 1 of 3');
      // The Audiophile's entry as another role's would be: its steps, and a last card of its own put in its place.
      const entry = await page.evaluate(() => import('./js/start.js').then(m => {
        const a = m.STARTS.audiophile, d = a.done, was = { title: d.title({}), text: d.text({}), target: d.target };
        a.done = { title: () => 'A last card of its own', text: g => `Its words, for the ${g.kind} just added.`, target: ['.bk-page .bk-hero'] };
        return { steps: a.steps, was };
      }));
      ok('17. STARTS.audiophile: its steps (band, venue, gig) and its last card (done: “Your first gig is on your calendar” over the score row)', JSON.stringify(entry.steps) === '["band","venue","gig"]' && entry.was.title === 'Your first gig is on your calendar' && entry.was.text === 'On the night or after, score the band out of 100 on this page. Next, a quick look around. Tap Skip any time.' && entry.was.target[0] === '.bk-page .bk-hero .bk-score', JSON.stringify(entry));
      await primary(page); let f = await form(page, 'New band');
      await f.locator('[data-key=name]').fill('The Moths'); await f.locator('button[type=submit]').click();
      await cardIs(page, 'Add a venue', 'Step 2 of 3');
      await primary(page); f = await form(page, 'Add venue');
      await f.locator('[data-key=name]').fill('The Lantern Rooms'); await f.locator('button[type=submit]').click();
      await cardIs(page, 'Add a gig', 'Step 3 of 3');
      await primary(page); f = await form(page, 'New gig');
      await typePick(f, 'actId', 'mo', 'The Moths'); await typePick(f, 'venueId', 'lan', 'The Lantern Rooms');
      await f.locator('button[type=submit]').click();
      const own = await cardIs(page, 'A last card of its own');
      ok('…and the start ends on the role’s own last card, its words and its target', own && (await page.textContent('#tour-text')) === 'Its words, for the show just added.' && await spotOver(page, '.bk-page .bk-hero'), await page.textContent('#tour-text').catch(() => ''));
      ok('no errors in the console (a last card of its own)', errors.length === 0, errors.slice(0, 5).join(' | '));
      await ctx.close();
    }

    /* ---------------- 18: Tourbook opened afresh at Step 1 or 2, with no tap yet ---------------- */
    // A new page (the app closed and opened again), its state put in before it loads, and no click, key or evaluate until
    // the card is up (Playwright's evaluate and waits count as a tap): the card's move to Bands or Venues through the
    // section menu must ask for no vibration, which Chrome refuses before a tap with an error in the console. The page
    // itself says when the card is up, and whether it had been tapped (navigator.userActivation). A reload in the same
    // tab keeps its activation, so the start's other checks never see it.
    const stepAt = made => () => {
      try {
        localStorage.setItem('tourbook-role', 'audiophile'); localStorage.setItem('tourbook-start', JSON.stringify({ role: 'audiophile', made }));
        if (made.length && !localStorage.getItem('tourbook-db-v1')) localStorage.setItem('tourbook-db-v1', JSON.stringify({ acts: [{ id: made[0], name: 'The Moths', color: '', members: [] }] }));
      } catch (e) { /* ignore */ }
      new MutationObserver((ms, o) => {
        const t = document.querySelector('.tour-card #tour-title');
        if (t && t.textContent) { o.disconnect(); console.log(`t-card|${t.textContent}|${navigator.userActivation ? navigator.userActivation.hasBeenActive : 'none'}`); }
      }).observe(document, { childList: true, subtree: true });
    };
    for (const [at, cardTitle, where0, made] of [[1, 'Add a band', 'acts', []], [2, 'Add a venue', 'venues', ['m-act']]]) {
      const { ctx, page, errors, said } = await fresh(browser, { init: `(${stepAt.toString()})(${JSON.stringify(made)})()` });
      let up = null;
      for (let i = 0; i < 150 && !up; i++) { up = said.find(t => t.startsWith('t-card|')); if (!up) await sleep(100); }
      await sleep(800); // anything the move logs after the card
      const [, shown, active] = (up || '||').split('|');
      ok(`18. a new page at Step ${at}, no tap yet (no user activation): Step ${at}’s card over ${where0 === 'acts' ? 'Bands' : 'Venues'}`, shown === cardTitle && active === 'false' && (await where(page)) === where0, String(up));
      ok(`no errors in the console (opened afresh at Step ${at}: no vibration asked for before a tap)`, errors.length === 0, errors.slice(0, 5).join(' | '));
      await ctx.close();
    }

    /* ---------------- 19: the words the start walks through, every role's own ---------------- */
    {
      const { browser: b2, page, errors } = await open();
      const role = id => page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id).then(() => sleep(400));
      const closeAll = () => page.evaluate(() => import('./js/util.js').then(u => u.closeSheets())).then(() => sleep(250));
      // [an act, acts, a show, what the question's walkthrough says the name stays on]: actWord() and showWord() in every role.
      const WORDS = { audiophile: ['band', 'bands', 'gig', 'gig'], band: ['band', 'bands', 'show', 'show'], producer: ['artist', 'artists', 'show', 'show'],
        manager: ['act', 'acts', 'show', 'show'], scout: ['act', 'acts', 'show', 'show'], solo: ['act', 'acts', 'show', 'show'], all: ['act', 'acts', 'show', 'show'] };
      for (const [id, [act, many, show, booking]] of Object.entries(WORDS)) {
        await role(id);
        await page.evaluate(() => window.logiGo('acts')); await page.waitForSelector('#ac-new-empty'); await sleep(200);
        const button = await page.textContent('#ac-new-empty');
        await page.click('#ac-new-empty'); await page.waitForSelector('.sheet form.form'); await sleep(200);
        const actForm = await page.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); return [s.getAttribute('aria-label'), s.querySelector('button[type=submit]').textContent]; });
        await closeAll();
        await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({ kind: 'show' }))); await page.waitForSelector('.sheet form.form'); await sleep(200);
        const showForm = await page.evaluate(() => [...document.querySelectorAll('.sheet')].pop().getAttribute('aria-label'));
        const f = page.locator('.sheet').last();
        await f.locator('input[data-key=actId]').fill('Nobody Yet'); await f.locator('button[type=submit]').click();
        await page.waitForSelector('.sheet[aria-label="Add to your lists?"] #bk-add-no'); await sleep(200);
        const q = await page.evaluate(() => [document.getElementById('bk-add-q').textContent, document.getElementById('bk-add-why').textContent]);
        const steps = (await sheetSteps(page, 'Add to your lists?')).map(x => x[1]).join(' ');
        await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); // the last role's
        await page.click('#bk-add-no'); await page.waitForSelector('.bk-page .bk-hero'); await sleep(150);
        const toast = await page.locator('.toast').allTextContents();
        const want = { button: `+ New ${act}`, actForm: [`New ${act}`, `Add ${act}`], showForm: `New ${show}`, q: [`“Nobody Yet” isn’t in your ${many} yet. Add it?`, `Once added, it’s there to pick next time. Whatever you choose, the ${show} keeps the name.`],
          steps: `Added, a name goes on its list, ready to pick next time you type it. A name you don’t add stays on the ${booking} as typed. Back to the form, or ✕, saves nothing.`, toast: `${show[0].toUpperCase()}${show.slice(1)} added` };
        const got = { button, actForm, showForm, q, steps, toast: toast.find(t => / added$/.test(t)) || toast.join(' | ') };
        ok(`19. ${id}: “${want.button}”, “${want.actForm.join('” / “')}”, “${want.showForm}”, “${want.toast}”, the question in its words and “stays on the ${booking} as typed”`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
        await closeAll();
        await page.evaluate(() => import('./js/store.js').then(s => s.replaceAll({}))); await sleep(200); // the next role starts with nothing again
      }
      ok('no errors in the console (the roles’ words)', errors.length === 0, errors.slice(0, 5).join(' | '));
      await b2.close();
    }
  } finally {
    await browser.close();
  }
})().catch(e => { console.log('FAIL 04-start crashed — ' + e.message); process.exit(1); });
