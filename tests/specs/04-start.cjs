// Every role's start (js/start.js; the owner, 15 Nov 2026: "At the beginning, force a tutorial for users to add a band,
// venue, and then a show for the audiophiles role", then "Then do this for the other roles"): picked at "Who’s using
// Tourbook?" on a device with nothing in it, a card over Acts' add button, then the act form; over Venues', then the
// place form; over the calendar's + New, then the booking form, the act and the place found by typing. No Skip, no
// Escape; a closed form, a reload or a closed app brings the step back; bringing data in (a backup file, Google Drive)
// is the one way out. Then a shorter welcome tour. A device with records, a role picked anywhere else, or a welcome
// tour done before, never gets it. 1–19 take the Audiophile's start (the whole of it, the way out, small screens, the
// words); 20 every other role's, in its own words. Both legs: these contexts take no licence seed. In the on leg
// licences are live with nothing started: the Audiophile's start starts nothing; a working role's pick asks the terms
// and starts its free days (as it always has), and its start then adds freely. Its "never a trap" checks (21) run in
// the on leg only.
const { chromium } = require('playwright');
const { open, ok, sleep, BASE, licenceLeg, typePick, passStart } = require('../helpers.cjs');

const LEG = process.env.TOURBOOK_LICENCE === 'on' ? 'on' : 'off';
const SHOT = process.env.S;
const ASK = 'Who’s using Tourbook?';
const LICENCE_SHEETS = ['Before you use the working roles', 'Read-only until there is a licence', 'Did you see them?'];
const TERMS = 'Before you use the working roles';
// The licence's sheets that must never come up during or straight after a start that could write (the terms sheet
// only at a working role's pick, before it).
const NEVER = s => ['Read-only until there is a licence', 'Read-only for now', 'Your 30 free days are over', 'Did you see them?'].includes(s) || /needs a licence$/.test(s || '');
// The terms' version as js/terms.js has it (the scratch copy), for a device whose terms are agreed.
const TERMS_V = (() => { try { return (/TERMS_VERSION = '([^']*)'/.exec(require('fs').readFileSync(require('path').join(process.env.TOURBOOK_ROOT || '.', 'js', 'terms.js'), 'utf8')) || [])[1] || ''; } catch (e) { return ''; } })();

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
// Every frame while a walkthrough's card is up: a toast that shows over its spotlight or one of its buttons (the start's
// two, Skip, Back, Next) is logged (sessionStorage t-cover). A toast is never to hide what the card asks for.
const coverLog = () => {
  const log = v => { try { const l = JSON.parse(sessionStorage.getItem('t-cover') || '[]'); if (l.length < 20 && !l.some(x => x.card === v.card && x.toast === v.toast && x.over === v.over)) { l.push(v); sessionStorage.setItem('t-cover', JSON.stringify(l)); } } catch (e) { /* ignore */ } };
  const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const look = () => {
    const card = document.querySelector('.tour .tour-card'), title = card && card.querySelector('#tour-title');
    if (title) {
      for (const t of document.querySelectorAll('.toast')) {
        if (parseFloat(getComputedStyle(t).opacity) < 0.15) continue;
        const r = t.getBoundingClientRect(), spot = document.querySelector('.tour-spot');
        const parts = [...card.querySelectorAll('.tour-actions .btn, #start-backup')].map(b => [b.textContent.trim(), b.getBoundingClientRect()]);
        if (spot && !spot.classList.contains('center')) parts.push(['the spotlight', spot.getBoundingClientRect()]);
        for (const [over, p] of parts) if (hit(r, p)) log({ card: title.textContent, toast: t.textContent, over });
      }
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
};
const covered = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('t-cover') || '[]'));
// A fresh device: no welcome tour seen, no role, no licence seed. Every request to the licence server counted.
async function fresh(browser, { viewport = { width: 420, height: 900 }, prefs = null, init = null, seed = false } = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', hasTouch: true, acceptDownloads: true });
  if (seed) await licenceLeg(ctx);
  if (prefs) await ctx.addInitScript(p => { try { if (!localStorage.getItem('tourbook-prefs')) localStorage.setItem('tourbook-prefs', p); } catch (e) { /* ignore */ } }, JSON.stringify(prefs));
  if (init) await ctx.addInitScript(init);
  await ctx.addInitScript(sheetLog);
  await ctx.addInitScript(coverLog);
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
// After a start: the booking's page (its kind line, its ✎ Edit form's title), the act's ✎ Edit form (its title and the
// colour's hint) and the place's ✎ Edit form (its title), each form closed again.
async function afterWords(page, bookingId, actId, venueId) {
  const shut = () => page.evaluate(() => import('./js/util.js').then(u => u.closeSheets())).then(() => sleep(250));
  const sheetTitle = () => page.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); return s ? s.getAttribute('aria-label') : null; });
  await page.evaluate(id => import('./js/pages/bookings.js').then(m => m.openBooking(id)), bookingId); await page.waitForSelector('.bk-page .bk-when'); await sleep(250);
  const when = await page.textContent('.bk-page .bk-when');
  await page.click('.bk-page .bk-edit'); await page.waitForSelector('.sheet form.form'); await sleep(200);
  const edit = await sheetTitle(); await shut();
  await page.evaluate(id => import('./js/pages/acts.js').then(m => m.openAct(id)), actId); await page.waitForSelector('#ac-edit'); await sleep(250);
  await page.click('#ac-edit'); await page.waitForSelector('.sheet form.form'); await sleep(200);
  const actEdit = await sheetTitle();
  const colour = await page.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(), c = s && s.querySelector('select[data-key=color]'); return c ? (c.closest('.field').querySelector('small') || {}).textContent : null; });
  await shut();
  await page.evaluate(id => import('./js/pages/venues.js').then(m => m.openVenue(id)), venueId); await page.waitForSelector('#vn-edit'); await sleep(250);
  await page.click('#vn-edit'); await page.waitForSelector('.sheet form.form'); await sleep(200);
  const placeEdit = await sheetTitle(); await shut();
  return { when, edit, actEdit, colour, placeEdit };
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
      const hintA = await f.evaluate(s => (s.querySelector('input[data-key=actId]').closest('.field').querySelector(':scope > small.muted') || {}).textContent);
      ok('…the band box’s hint names what is there: “The band you’re going to see. Score them on the gig’s page, on the night or after; the score goes on their card.”', hintA === 'The band you’re going to see. Score them on the gig’s page, on the night or after; the score goes on their card.', hintA);
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
      // The Audiophile's words after the start: the gig's page and forms, the band's form.
      const said = await afterWords(page, data.bookings[0].id, data.acts[0].id, data.venues[0].id);
      ok('…afterwards the gig’s page says “Gig · …” and its ✎ Edit is “Edit gig”; the band’s ✎ Edit is “Edit band”, its colour “The stripe on its cards.”; the venue’s “Edit venue”', said.when.startsWith('Gig · ') && said.edit === 'Edit gig' && said.actEdit === 'Edit band' && said.colour === 'The stripe on its cards.' && said.placeEdit === 'Edit venue', JSON.stringify(said));
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
      // (b) a start under way for a role no longer in use (its terms agreed and free days under way in the on leg)
      const b = await fresh(browser, { seed: true });
      await b.page.waitForSelector('.rp-ask', { timeout: 8000 });
      await b.page.evaluate(() => { localStorage.setItem('tourbook-start', JSON.stringify({ role: 'band', made: [] })); localStorage.setItem('tourbook-role', 'scout'); });
      await b.page.reload();
      ok('14b. a start under way for the Band with the Scout in use: no step card, the start gone, the welcome tour', await cardIs(b.page, 'Welcome to Tourbook') && (await key(b.page)) === null);
      ok('no errors in the console (another role’s start)', b.errors.length === 0, b.errors.slice(0, 5).join(' | '));
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
      await d.page.click('#se-role .rp-card[data-role="producer"]'); await sleep(2000);
      ok('…and Producer chosen there too: no card, no start', (await d.page.evaluate(() => localStorage.getItem('tourbook-role'))) === 'producer' && (await d.page.locator('.tour-card').count()) === 0 && (await key(d.page)) === null);
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
      const cov16 = await covered(page);
      ok(`…no toast over a card’s spotlight or its buttons (“The Moths added” waits its turn) (${at})`, cov16.length === 0, JSON.stringify(cov16));
      ok(`no errors in the console (${at})`, errors.length === 0, errors.slice(0, 5).join(' | '));
      await ctx.close();
    }

    /* ---------------- 17: every role has a start (STARTS), and a start ends on its role's own last card ---------------- */
    {
      const { ctx, page, errors } = await fresh(browser);
      await pick(page, 'audiophile');
      await cardIs(page, 'Add a band', 'Step 1 of 3');
      // Every role's entry: its act, place and booking words, the kinds its last two steps add, and its last card. Then the
      // Audiophile's last card is put in place of one of its own (a title and text that are functions of the record).
      const entry = await page.evaluate(() => Promise.all([import('./js/start.js'), import('./js/roles.js'), import('./js/model.js')]).then(([m, r, md]) => {
        const say = (x, ...a) => (typeof x === 'function' ? x(...a) : x);
        const ids = Object.keys(m.STARTS).sort(), roles = [...r.ROLES.map(x => x.id), r.EVERYTHING.id].sort();
        const bad = Object.entries(m.STARTS).filter(([, x]) => !(['act', 'place', 'booking'].every(k => x[k] && typeof x[k].title === 'string' && say(x[k].text, 'B', 'V') && say(x[k].note, 'B', 'V'))
          && md.VENUE_KINDS.some(k => k[0] === x.placeKind) && md.KINDS.some(k => k[0] === x.kind) && x.done && say(x.done.title, {}) && say(x.done.text, {}) && Array.isArray(x.done.target) && x.done.target.length > 0)).map(([id]) => id);
        const a = m.STARTS.audiophile, d = a.done, was = { title: say(d.title, {}), text: say(d.text, {}), target: d.target };
        a.done = { title: () => 'A last card of its own', text: g => `Its words, for the ${g.kind} just added.`, target: ['.bk-page .bk-hero'] };
        return { ids, roles, bad, was };
      }));
      ok('17. STARTS has every role (Jack of Trades and the six), each with its act, place and booking words, a kind of place and of booking, and a last card', JSON.stringify(entry.ids) === '["all","audiophile","band","manager","producer","scout","solo"]' && JSON.stringify(entry.ids) === JSON.stringify(entry.roles) && entry.bad.length === 0, JSON.stringify(entry));
      ok('…the Audiophile’s last card: “Your first gig is on your calendar” over the score row', entry.was.title === 'Your first gig is on your calendar' && entry.was.text === 'On the night or after, score the band out of 100 on this page. Next, a quick look around. Tap Skip any time.' && entry.was.target[0] === '.bk-page .bk-hero .bk-score', JSON.stringify(entry.was));
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

    /* ---------------- 20: every other role's start, in its own words ---------------- */
    // The words each role's start says (js/start.js STARTS) and the page's own words they meet (the add buttons, the forms
    // and their Add, the toasts, the booking form's boxes), then the last card over what the role does next on the
    // booking's page, the shorter welcome tour without the start's three sections, and the role's words afterwards.
    const NOTE_ACT = 'Only the name is needed. The rest can wait.', NOTE_PLACE = 'Only the name is needed. An address puts it on the map.';
    const LOOK = 'Next, a quick look around. Tap Skip any time.';
    const SHOW = { buttons: ['+ New act', 'Add a venue'], forms: ['New act', 'Add venue', 'New show'], adds: ['Add act', 'Add venue', 'Add'], labels: ['Act', 'Venue'], kind: 'show', placeKind: 'venue', toast: 'Show added', word: 'act', when: 'Show · ', edit: 'Edit show', place: 'The Lantern Rooms' };
    const named = (who, what) => `Last, a show ${what}. Type the first letters of “${who}” and “The Lantern Rooms”, and pick each from the list.`;
    const noteActVenue = who => `Type the first letters of “${who}” in the Act box and pick it from the list, then “The Lantern Rooms” in the Venue box. The rest can wait.`;
    const R = {
      producer: { act: 'The Moths', place: 'Echo Chamber Studios', placeKind: 'studio', kind: 'session',
        cards: ['Add an artist', 'Add a studio', 'Add a studio session'],
        texts: ['Three steps put your first studio session on your calendar. First, an artist you produce: their page keeps their contacts, links and tech rider.',
          'Next, a studio you record in. Save it once and it’s there to pick for every studio session there.',
          'Last, a studio session you’re producing. Type the first letters of “The Moths” and “Echo Chamber Studios”, and pick each from the list.'],
        buttons: ['+ New artist', 'Add a studio'], forms: ['New artist', 'Add studio', 'New studio session'], adds: ['Add artist', 'Add studio', 'Add'],
        notes: [NOTE_ACT, NOTE_PLACE, 'Type the first letters of “The Moths” in the Artist box and pick it from the list, then “Echo Chamber Studios” in the Studio box. The rest can wait.'],
        labels: ['Artist', 'Studio'], toast: 'Studio session added',
        done: ['Your first studio session is on your calendar', `On the day, start the clock here for the hours; the take log is further down. ${LOOK}`], target: '#blk-clock .sd-clock',
        tour: ['Your first studio session is on your calendar', 'Your details', 'Your sections are tracks', 'Search', 'Studio log', 'Songs', 'Money', 'Settings'],
        word: 'artist', when: 'Studio session · ', edit: 'Edit studio session' },
      manager: { ...SHOW, act: 'The Moths', cards: ['Add an act', 'Add a venue', 'Add a show'],
        texts: ['Three steps put your first show on your calendar. First, an act on your roster: its page keeps the press kit and tech rider for promoters.',
          'Next, a venue your acts play. Save it once and it’s there to pick for every show there.', named('The Moths', 'they’re playing')],
        notes: [NOTE_ACT, NOTE_PLACE, noteActVenue('The Moths')],
        done: ['Your first show is on your calendar', `Add the deal here, then tick off the advance checklist under it as you go. ${LOOK}`], target: '#sh-deal-add',
        tour: ['Your first show is on your calendar', 'Your details', 'Your sections are tracks', 'Search', 'Money', 'People', 'Settings'] },
      band: { ...SHOW, act: 'The Moths', cards: ['Add your band', 'Add a venue', 'Add a show'],
        texts: ['Three steps put your first show on your calendar. First, your band: its page keeps the members, the press kit and the tech rider.',
          'Next, a venue you play. Save it once and it’s there to pick for every show there.', named('The Moths', 'you’re playing')],
        buttons: ['+ New band', 'Add a venue'], forms: ['New band', 'Add venue', 'New show'], adds: ['Add band', 'Add venue', 'Add'], labels: ['Band', 'Venue'],
        notes: [NOTE_ACT, NOTE_PLACE, 'Type the first letters of “The Moths” in the Band box and pick it from the list, then “The Lantern Rooms” in the Venue box. The rest can wait.'],
        done: ['Your first show is on your calendar', `Start the night’s setlist here: Tourbook checks it fits your set length. ${LOOK}`], target: '#blk-setlist .sg-blk .btn.primary',
        tour: ['Your first show is on your calendar', 'Your details', 'Your sections are tracks', 'Search', 'Songs', 'Backline', 'Money', 'Settings'], word: 'band' },
      solo: { ...SHOW, act: 'Mara Vale', cards: ['Add your act', 'Add a venue', 'Add a show'],
        texts: ['Three steps put your first show on your calendar. First, your act: the name you play under. Its page keeps your press kit and tech rider to send ahead.',
          'Next, a venue you play. Save it once and it’s there to pick for every show there.', named('Mara Vale', 'you’re playing')],
        notes: ['Only the name you play under is needed. The rest can wait.', NOTE_PLACE, noteActVenue('Mara Vale')],
        done: ['Your first show is on your calendar', `Add the deal here, and your setlist further down. ${LOOK}`], target: '#sh-deal-add',
        tour: ['Your first show is on your calendar', 'Your details', 'Your sections are tracks', 'Search', 'Songs', 'Money', 'Settings'] },
      scout: { ...SHOW, act: 'The Moths', cards: ['Add an act', 'Add a venue', 'Add a show'],
        texts: ['Three steps put your first show on your calendar. First, an act you’re watching: their card keeps your score each time you see them.',
          'Next, a venue you scout in. Save it once and it’s there to pick for every show there.', named('The Moths', 'you’re going to')],
        notes: [NOTE_ACT, NOTE_PLACE, noteActVenue('The Moths')],
        done: ['Your first show is on your calendar', `On the night or after, score the act out of 100 on this page. ${LOOK}`], target: '.bk-page .bk-hero .bk-score',
        tour: ['Your first show is on your calendar', 'Your details', 'Your sections are tracks', 'Search', 'People', 'Settings'] },
      all: { ...SHOW, act: 'The Moths', cards: ['Add an act', 'Add a venue', 'Add a show'],
        texts: ['Three steps put your first show on your calendar. First, an act: a band or artist you play with, manage, produce or follow.',
          'Next, a venue you play or go to. Save it once and it’s there to pick for every show there.', named('The Moths', 'they’re playing')],
        notes: [NOTE_ACT, NOTE_PLACE, noteActVenue('The Moths')],
        done: ['Your first show is on your calendar', `Tap a box to open it, from the deal to the settlement. ${LOOK}`], target: '#blk-deal > summary',
        tour: ['Your first show is on your calendar', 'Your details', 'Your sections are tracks', 'Search', 'People', 'Songs', 'Studio log', 'Backline', 'Money', 'Settings'] },
    };
    const XL = { text: 'xlarge', targets: 'large' };
    // Each role once; the producer, whose words are the longest, also at 320 px with extra-large text (its cards and forms only).
    const RUNS = [['producer', { width: 420, height: 900 }, null], ['producer', { width: 320, height: 568 }, { scheme: 'dark', ...XL }, true],
      ['manager', { width: 320, height: 568 }, { scheme: 'light', ...XL }], ['band', { width: 420, height: 900 }, { scheme: 'dark' }],
      ['solo', { width: 320, height: 568 }, { scheme: 'dark', ...XL }], ['scout', { width: 420, height: 900 }, null], ['all', { width: 320, height: 568 }, { scheme: 'light', ...XL }]];
    const good = x => x.card && x.primary && x.words >= 99 && x.out && x.wide;
    const cardWords = page => page.evaluate(() => {
      const c = document.querySelector('.tour-card'), a = document.activeElement;
      return { skip: [...c.querySelectorAll('button')].some(b => b.textContent.trim() === 'Skip'), out: (document.getElementById('start-backup') || {}).textContent, primary: (c.querySelector('.tour-actions .btn.primary') || {}).textContent,
        focused: !!a && a.matches('.tour-actions .btn.primary'), text: (document.getElementById('tour-text') || {}).textContent };
    });
    const lineOf = f => f.evaluate(s => { const fm = s.querySelector('form.form'), first = fm.firstElementChild, box = fm.querySelector('input, textarea, select'); return { is: first.matches('p.start-note#start-note'), text: first.textContent, by: (box.getAttribute('aria-describedby') || '').split(' ').includes('start-note'), add: (s.querySelector('button[type=submit]') || {}).textContent }; });
    const FREE_TOAST = /^Your 30 free days of Tourbook’s working roles have started on this device: until .+\.$/;
    for (const [role, viewport, prefs, quick] of RUNS) {
      const r = R[role], dark = !!(prefs && prefs.scheme === 'dark'), at = `${role}, ${viewport.width}×${viewport.height}${prefs && prefs.text ? ', extra-large text' : ''}, ${dark ? 'dark' : 'light'}`;
      const tag = `${role}-${viewport.width}-${dark ? 'dark' : 'light'}`;
      const { ctx, page, errors, net } = await fresh(browser, { viewport, prefs });
      /* 1 */
      await pick(page, role);
      if (LEG === 'on') {
        const terms = await page.locator(`.sheet[aria-label="${TERMS}"]`).waitFor({ timeout: 8000 }).then(() => true, () => false);
        ok(`20.1 ${at}: the pick asks the terms first (licences live), no card under them`, terms && (await page.locator('.tour-card').count()) === 0);
        await page.check('#lic-terms-ok'); await page.click('#lic-terms-agree');
      } else ok(`20.1 ${at}: no terms sheet (licences off)`, !(await page.locator(`.sheet[aria-label="${TERMS}"]`).count()));
      /* 2 */
      const up1 = await cardIs(page, r.cards[0], 'Step 1 of 3'), c1 = await cardWords(page);
      ok(`20.2 ${at}: Step 1, “${r.cards[0]}”, over ${role === 'solo' ? 'My act' : 'its acts'}: its words, its primary “${r.cards[0]}…” with the focus, the way out, no Skip`, up1 && (await where(page)) === 'acts' && c1.text === r.texts[0] && c1.primary === `${r.cards[0]}…` && c1.focused && c1.out === 'I have a backup file or Google Drive…' && !c1.skip, JSON.stringify(c1));
      const b1 = await page.textContent('#ac-new-empty').catch(() => null);
      ok(`…the spotlight over the page’s own “${r.buttons[0]}”, clear of the section menu`, await spotOver(page, '#ac-new-empty') && b1 === r.buttons[0] && (await onTop(page, '#ac-new-empty')) === true, String(b1));
      ok(`…tourbook-start is {"role":"${role}","made":[]}`, (await key(page)) === JSON.stringify({ role, made: [] }), await key(page));
      let ft = await fit(page);
      ok(`…its words in view, the card and its primary on the screen, the way out under the words, no sideways scroll`, good(ft), JSON.stringify(ft));
      await shot(page, `${tag}-step1`);
      if (role === 'producer' && !quick) {
        // The page drawn again under the card (a licence change does it), then the screen turned: the spotlight stays on the button.
        await page.evaluate(() => import('./js/store.js').then(s => s.redraw())); await sleep(300);
        await page.setViewportSize({ width: viewport.width + 1, height: viewport.height }); await sleep(400);
        ok('…the page drawn again under the card and the window resized: the spotlight still over “+ New artist”', await spotOver(page, '#ac-new-empty'));
        await page.setViewportSize(viewport); await sleep(400);
      }
      /* 3 */
      if (!quick) {
        if (LEG === 'on') {
          await page.waitForFunction(() => import('./js/licence-state.js').then(m => m.licenceNow().mode === 'trial'), null, { timeout: 4000 }).catch(() => {});
          const st = { mode: await mode(page), terms: !!(await page.evaluate(() => localStorage.getItem('tourbook-terms'))), asked: [...net.licence] };
          ok(`20.3 ${at}: licences live: the pick agreed the terms and started the free days (trial); only the status (and the price) asked of the licence server`, st.mode === 'trial' && st.terms && st.asked.includes('/licence/web/status') && st.asked.every(x => x === '/licence/web/status' || x === '/licence/price'), JSON.stringify(st));
        } else ok(`20.3 ${at}: licences off: nothing started, no terms, nothing asked of the licence server`, (await mode(page)) === 'off' && net.licence.length === 0 && !(await page.evaluate(() => localStorage.getItem('tourbook-terms'))), JSON.stringify(net.licence));
      }
      /* 4 */
      await primary(page); let f = await form(page, r.forms[0]);
      if (!quick && LEG === 'on') {
        await page.waitForFunction(re => JSON.parse(sessionStorage.getItem('t-toasts') || '[]').some(t => new RegExp(re).test(t)), FREE_TOAST.source, { timeout: 4000 }).catch(() => {});
        ok(`…by the time its form is open, the free days’ toast, said once (never over the card: below) (${at})`, (await toasts(page)).filter(t => FREE_TOAST.test(t)).length === 1, JSON.stringify(await toasts(page)));
      }
      let line = await lineOf(f), steps = await sheetSteps(page, r.forms[0]);
      ok(`20.4 ${at}: “${r.cards[0]}…” opens “${r.forms[0]}”, its first line the start’s (describing its name box), its button “${r.adds[0]}”, its ? walkthrough the act form’s`, line.is && line.text === r.notes[0] && line.by && line.add === r.adds[0] && steps.length > 0 && steps[0][0] === 'Name', JSON.stringify(line));
      await shot(page, `${tag}-form1`);
      await close(page, r.forms[0]);
      ok(`…✕ brings Step 1 back`, await cardIs(page, r.cards[0], 'Step 1 of 3'));
      /* 5 */
      await primary(page); f = await form(page, r.forms[0]);
      await f.locator('[data-key=name]').fill(r.act); await f.locator('button[type=submit]').click();
      const up2 = await cardIs(page, r.cards[1], 'Step 2 of 3'), c2 = await cardWords(page), b2 = await page.textContent('#vn-first').catch(() => null);
      let data = await db(page);
      ok(`20.5 ${at}: “${r.act}”, ${r.adds[0]}: “${r.act} added”, then Step 2, “${r.cards[1]}”, over the page’s own “${r.buttons[1]}”, its words`, up2 && (await where(page)) === 'venues' && (await toasts(page)).includes(`${r.act} added`) && c2.text === r.texts[1] && c2.primary === `${r.cards[1]}…` && await spotOver(page, '#vn-first') && b2 === r.buttons[1], JSON.stringify({ c2, b2 }));
      ok(`…the act stored, its id in tourbook-start`, data.acts.length === 1 && data.acts[0].name === r.act && (await key(page)) === JSON.stringify({ role, made: [data.acts[0].id] }), await key(page));
      ft = await fit(page); ok(`…Step 2’s words in view (${at})`, good(ft) && (await onTop(page, '#vn-first')) === true, JSON.stringify(ft));
      await shot(page, `${tag}-step2`);
      if (!quick) {
        /* 6 */
        await page.reload();
        const back = await cardIs(page, r.cards[1], 'Step 2 of 3'), all6 = await sheets(page);
        const six = { asks: all6.filter(x => x === ASK).length, terms: all6.filter(x => x === TERMS).length, mode: await mode(page), told: (await toasts(page)).filter(t => FREE_TOAST.test(t)).length };
        ok(`20.6 ${at}: a reload mid-start brings Step 2 back: no “Who’s using Tourbook?” or terms sheet again${LEG === 'on' ? ', still in its free days, their toast said once' : ''}`, back && six.asks === 1 && six.terms === (LEG === 'on' ? 1 : 0) && (LEG === 'on' ? six.mode === 'trial' && six.told === 1 : six.mode === 'off'), JSON.stringify(six));
        /* 7 */
        await page.click('#start-backup');
        const bk = await page.locator('.sheet[aria-label="Backups"]').waitFor({ timeout: 6000 }).then(() => true, () => false);
        await sleep(300); await close(page, 'Backups');
        ok(`20.7 ${at}: the way out opens Backups; ✕ brings Step 2 back, the start unchanged`, bk && await cardIs(page, r.cards[1], 'Step 2 of 3') && (await key(page)) === JSON.stringify({ role, made: [data.acts[0].id] }));
      }
      /* 8 */
      await primary(page); f = await form(page, r.forms[1]);
      line = await lineOf(f);
      const kindNow = await f.locator('select[id$="-kind"]').inputValue(), example = await f.locator('[data-key=name]').getAttribute('placeholder');
      const wantEx = r.placeKind === 'studio' ? 'e.g. Echo Chamber Studios' : 'e.g. The Lantern Rooms';
      ok(`20.8 ${at}: “${r.cards[1]}…” opens “${r.forms[1]}” as a ${r.placeKind}, with its line, its button “${r.adds[1]}”, its name box’s example “${wantEx}”`, line.is && line.text === r.notes[1] && line.by && line.add === r.adds[1] && kindNow === r.placeKind && example === wantEx, JSON.stringify({ line, kindNow, example }));
      await shot(page, `${tag}-form2`);
      await f.locator('[data-key=name]').fill(r.place); await f.locator('[data-key=address]').fill('12 Lamp Lane, Leeds');
      await f.locator('button[type=submit]').click();
      const up3 = await cardIs(page, r.cards[2], 'Step 3 of 3'), c3 = await cardWords(page);
      ok(`…“${r.place} added”, then Step 3, “${r.cards[2]}”, over + New, its words naming the act and the place just added`, up3 && (await where(page)) === 'bookings' && (await toasts(page)).includes(`${r.place} added`) && await spotOver(page, '.bk-new') && c3.text === r.texts[2] && c3.primary === `${r.cards[2]}…`, JSON.stringify(c3));
      ft = await fit(page); ok(`…Step 3’s words in view, + New clear of the section menu (${at})`, good(ft) && (await onTop(page, '.bk-new')) === true, JSON.stringify(ft));
      await shot(page, `${tag}-step3`);
      /* 9 */
      await primary(page); f = await form(page, r.forms[2]);
      data = await db(page);
      const bf = await f.evaluate(s => { const a = s.querySelector('input[data-key=actId]'), v = s.querySelector('input[data-key=venueId]'), lab = el => (s.querySelector(`label[for="${el.id}"]`) || {}).textContent; return { act: a.value, actId: a.dataset.id, venue: v.value, venueId: v.dataset.id, focus: document.activeElement === a, labels: [lab(a), lab(v)].map(t => String(t || '').replace(/\s*\*$/, '').trim()) }; });
      line = await lineOf(f);
      ok(`20.9 ${at}: “${r.cards[2]}…” opens “${r.forms[2]}” with its line, the boxes ${r.labels.join(' and ')}, both empty, the focus in the first`, line.is && line.text === r.notes[2] && line.by && line.add === 'Add' && JSON.stringify(bf.labels) === JSON.stringify(r.labels) && bf.act === '' && bf.actId === '' && bf.venue === '' && bf.venueId === '' && bf.focus, JSON.stringify({ line, bf }));
      await shot(page, `${tag}-form3`);
      if (role === 'producer' && !quick) {
        await f.locator('input[data-key=actId]').fill('Juno'); await f.locator('input[data-key=venueId]').fill('Studio Nine'); await page.keyboard.press('Tab'); await sleep(150);
        await f.locator('button[type=submit]').click();
        await page.waitForSelector('.sheet[aria-label="Add to your lists?"] #bk-add-both', { timeout: 6000 }); await sleep(250);
        const qa = await page.evaluate(() => ({ q: document.getElementById('bk-add-q').textContent, why: document.getElementById('bk-add-why').textContent, btns: [...document.querySelectorAll('.bk-add-answers button')].map(b => b.textContent) }));
        ok('…the producer’s names typed new: “Add to your lists?” in its words: Add both, Just the artist, Just the studio, Neither; the studio session keeps both names', qa.q === '“Juno” and “Studio Nine” aren’t in your lists yet. Add them?' && qa.why === 'Once added, they’re there to pick next time. Whatever you choose, the studio session keeps both names.' && JSON.stringify(qa.btns) === JSON.stringify(['Add both', 'Just the artist', 'Just the studio', 'Neither']), JSON.stringify(qa));
        await page.click('#bk-add-back'); await sleep(250);
      }
      await typePick(f, 'actId', r.act.slice(0, 3), r.act); await typePick(f, 'venueId', r.place.slice(0, 4), r.place);
      await f.locator('button[type=submit]').click();
      const up4 = await cardIs(page, r.done[0]);
      data = await db(page);
      const bk = data.bookings[0] || {}, asked = (await sheets(page)).filter(x => x === 'Add to your lists?').length;
      ok(`…both picked, Add: no “Add to your lists?”; the ${r.kind} stored with the act and the place; “${r.toast}”; the start over`, up4 && asked === (role === 'producer' && !quick ? 1 : 0) && data.bookings.length === 1 && bk.kind === r.kind && bk.actId === data.acts[0].id && bk.venueId === data.venues[0].id && !bk.client && (await toasts(page)).includes(r.toast) && (await key(page)) === null, JSON.stringify({ asked, bk }));
      /* 10 */
      const last = await page.evaluate(() => ({ skip: [...document.querySelectorAll('.tour-actions button')].some(b => b.textContent.trim() === 'Skip'), text: document.getElementById('tour-text').textContent }));
      ok(`20.10 ${at}: the last card, “${r.done[0]}”, over what comes next on its page (${r.target}), with Skip`, last.text === r.done[1] && last.skip && await spotOver(page, r.target), JSON.stringify(last));
      await shot(page, `${tag}-done`);
      const cov = await covered(page);
      ok(`…no toast over a card’s spotlight or its buttons, from the pick to the last card${LEG === 'on' ? ' (the free days’ toast included)' : ''}`, cov.length === 0, JSON.stringify(cov));
      if (quick) { await page.click('.tour-actions .btn.ghost'); await sleep(400); ok(`no errors in the console (${at})`, errors.length === 0, errors.slice(0, 5).join(' | ')); await ctx.close(); continue; }
      /* 11 */
      const titles = await walk(page);
      ok(`20.11 ${at}: the shorter welcome tour, without Bookings, Acts and Venues`, JSON.stringify(titles) === JSON.stringify(r.tour), JSON.stringify(titles));
      await sleep(2500); // the sheets at an opening have their turn
      ok(`…Done: the welcome tour seen, on the calendar`, (await page.evaluate(() => localStorage.getItem('tourbook-tour'))) === 'done' && (await where(page)) === 'bookings' && (await page.locator('.bk-calview').count()) === 1);
      /* 12 */
      const all = await sheets(page);
      ok(`20.12 ${at}: no licence sheet but the terms at the pick${LEG === 'on' ? '' : ' (none here)'}, and no “Did you see them?”`, !all.some(NEVER) && all.filter(x => x === TERMS).length === (LEG === 'on' ? 1 : 0), JSON.stringify(all));
      /* 13 */
      const said = await afterWords(page, bk.id, data.acts[0].id, data.venues[0].id), placeEdit = `Edit ${r.placeKind}`;
      ok(`20.13 ${at}: afterwards, in the role’s words: “${r.when}…”, “${r.edit}”, “Edit ${r.word}”, the colour “The stripe on its cards.”, the ${r.placeKind}’s “${placeEdit}”`, said.when.startsWith(r.when) && said.edit === r.edit && said.actEdit === `Edit ${r.word}` && said.colour === 'The stripe on its cards.' && said.placeEdit === placeEdit, JSON.stringify(said));
      const cov13 = await covered(page);
      ok(`…no toast over a card in the tour that follows either (${at})`, cov13.length === 0, JSON.stringify(cov13));
      ok(`no errors in the console (${at})`, errors.length === 0, errors.slice(0, 5).join(' | '));
      await ctx.close();
    }

    /* ---------------- 21: never a trap (licences live) ---------------- */
    // A working role's start never runs while Tourbook may not change things, and ends the moment it may not: then the
    // free-days-over sheet says why at once, and the welcome tour waits for the next opening.
    if (LEG === 'on') {
      // A device whose free days began `days` ago (kept through Erase this device), the terms agreed.
      const days = n => `(() => { try { const t = Date.now(); if (!localStorage.getItem('tourbook-licence')) localStorage.setItem('tourbook-licence', JSON.stringify({ on: true, statusAt: t, first: t - ${n} * 864e5, seen: t - 3600e3 })); if (!localStorage.getItem('tourbook-terms')) localStorage.setItem('tourbook-terms', JSON.stringify({ v: ${JSON.stringify(TERMS_V)}, at: t })); } catch (e) { /* ignore */ } })()`;
      const OVER = 'Your 30 free days are over';
      const sheetUp = (page, t) => page.locator(`.sheet[aria-label="${t}"]`).waitFor({ timeout: 10000 }).then(() => true, () => false);
      {
        const { ctx, page, errors } = await fresh(browser, { init: days(31) });
        // (a) a working role whose free days are over cannot be picked: no start
        await pick(page, 'manager');
        const offer = await page.locator('.sheet[aria-label$="needs a licence"]').waitFor({ timeout: 8000 }).then(() => true, () => false); await sleep(800);
        ok('21a. free days over on a device with nothing in it: picking Manager offers a licence (“…needs a licence”); no card, no start, no role', offer && (await page.locator('.tour-card').count()) === 0 && (await key(page)) === null && !(await page.evaluate(() => localStorage.getItem('tourbook-role'))));
        // (b) the Audiophile's start is free whatever the free days
        await page.click('.sheet[aria-label$="needs a licence"] .sheet-head [aria-label="Close"]'); await sleep(300);
        await pick(page, 'audiophile');
        const upA = await cardIs(page, 'Add a band', 'Step 1 of 3');
        await primary(page); const f = await form(page, 'New band'); await f.locator('[data-key=name]').fill('The Moths'); await f.locator('button[type=submit]').click();
        ok('21b. …the Audiophile picked there: its start, and it adds (“The Moths”, then Step 2)', upA && await cardIs(page, 'Add a venue', 'Step 2 of 3') && (await db(page)).acts.length === 1);
        ok('no errors in the console (21a, b)', errors.length === 0, errors.slice(0, 5).join(' | '));
        await ctx.close();
      }
      {
        // (c) a producer's start under way, its free days over since: it ends at the next opening, the sheet saying why
        const was = () => { try { if (!localStorage.getItem('tourbook-db-v1')) { localStorage.setItem('tourbook-db-v1', JSON.stringify({ acts: [{ id: 'p-act', name: 'The Moths', color: '', members: [] }] })); localStorage.setItem('tourbook-role', 'producer'); localStorage.setItem('tourbook-start', JSON.stringify({ role: 'producer', made: ['p-act'] })); } } catch (e) { /* ignore */ } };
        const { ctx, page, errors } = await fresh(browser, { init: `(${was.toString()})(); ${days(31)}` });
        const over = await sheetUp(page, OVER);
        const c = { card: await page.locator('.tour-card').count(), key: await key(page), tour: await page.evaluate(() => localStorage.getItem('tourbook-tour')), data: await db(page) };
        ok('21c. a producer’s start under way when the free days are over: no step card, the start gone, “Your 30 free days are over” at once; nothing stored since', over && c.card === 0 && c.key === null && c.tour === null && c.data.acts.length === 1 && !c.data.venues.length && !c.data.bookings.length, JSON.stringify({ ...c, data: undefined }));
        await close(page, OVER); await sleep(300);
        await page.reload();
        ok('…the next opening: the welcome tour', await cardIs(page, 'Welcome to Tourbook') && (await key(page)) === null);
        ok('no errors in the console (21c)', errors.length === 0, errors.slice(0, 5).join(' | '));
        await ctx.close();
      }
      {
        // (d) the free days run out while a card is up
        const { ctx, page, errors } = await fresh(browser);
        await pick(page, 'band');
        await page.locator(`.sheet[aria-label="${TERMS}"]`).waitFor({ timeout: 8000 }); await page.check('#lic-terms-ok'); await page.click('#lic-terms-agree');
        await cardIs(page, 'Add your band', 'Step 1 of 3');
        await primary(page); const f = await form(page, 'New band'); await f.locator('[data-key=name]').fill('The Moths'); await f.locator('button[type=submit]').click();
        const up = await cardIs(page, 'Add a venue', 'Step 2 of 3');
        await page.evaluate(() => { const t = Date.now(); localStorage.setItem('tourbook-licence', JSON.stringify({ on: true, statusAt: t, first: t - 31 * 864e5, seen: t - 3600e3 })); return import('./js/licence-state.js').then(m => m.refreshLicence()); });
        const over = await sheetUp(page, OVER);
        ok('21d. the free days run out while Step 2’s card is up: the card goes, the start ends, “Your 30 free days are over” says why', up && over && (await page.locator('.tour-card').count()) === 0 && (await key(page)) === null && !(await page.evaluate(() => localStorage.getItem('tourbook-tour'))));
        ok('no errors in the console (21d)', errors.length === 0, errors.slice(0, 5).join(' | '));
        await ctx.close();
      }
      {
        // (e) the terms sheet at the pick, Not now: nothing picked, no start
        const { ctx, page, errors } = await fresh(browser);
        await pick(page, 'band');
        await page.locator(`.sheet[aria-label="${TERMS}"]`).waitFor({ timeout: 8000 }); await sleep(200);
        await page.click('#lic-terms-later'); await sleep(800);
        ok('21e. Band picked, the terms sheet’s Not now: “Who’s using Tourbook?” still up, no role, no start, no card', (await page.locator('.rp-ask').count()) === 1 && !(await page.evaluate(() => localStorage.getItem('tourbook-role'))) && (await key(page)) === null && (await page.locator('.tour-card').count()) === 0);
        ok('no errors in the console (21e)', errors.length === 0, errors.slice(0, 5).join(' | '));
        await ctx.close();
      }
      {
        // (f) a few free days left, on a small phone: the licence bar stands aside while any card is up (the start's steps,
        // its last card and the tour that follows), so a tap meant for the card cannot land on the bar or on Buy
        const { ctx, page, errors } = await fresh(browser, { init: days(25), viewport: { width: 320, height: 568 } });
        const barShown = () => page.evaluate(() => { const b = document.querySelector('.licence-bar'); return !!b && getComputedStyle(b).display !== 'none'; });
        // Each of the card's buttons is what a tap at its middle lands on.
        const hits = () => page.evaluate(() => [...document.querySelectorAll('.tour-card .tour-actions .btn')].map(b => { const r = b.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [b.textContent, !!at && (at === b || b.contains(at)) ? 'itself' : at ? `${at.tagName}.${at.className}` : 'nothing']; }));
        const allMine = x => x.length > 0 && x.every(([, at]) => at === 'itself');
        await pick(page, 'band');
        const up = await cardIs(page, 'Add your band', 'Step 1 of 3');
        const bar = await page.waitForSelector('.licence-bar', { state: 'attached', timeout: 8000 }).then(() => true, () => false);
        const hid = await page.evaluate(() => { const b = document.querySelector('.licence-bar'); return b ? { shown: getComputedStyle(b).display !== 'none', text: b.textContent } : null; });
        ok('21f. 5 free days left, 320×568: the licence bar is there, and hidden while the start’s card is up', up && bar && !!hid && !hid.shown && /5 free days left/.test(hid.text), JSON.stringify(hid));
        await passStart(page, { role: 'band' });
        await sleep(700);
        const last = { bar: await barShown(), spot: await onTop(page, '#blk-setlist .sg-blk .btn.primary'), hits: await hits() };
        ok('…the start’s last card: the bar still aside, the setlist’s button under the spotlight and Skip and Next themselves where they are drawn', !last.bar && last.spot === true && allMine(last.hits), JSON.stringify(last));
        await primary(page);
        await page.waitForFunction(() => (document.querySelector('.tour-card #tour-title') || {}).textContent === 'Your details', null, { timeout: 6000 }).catch(() => {}); await sleep(700);
        const next = { title: await title(page), bar: await barShown(), hits: await hits() };
        ok('…Next: “Your details”, the bar still aside, Skip, Back and Next themselves where they are drawn', next.title === 'Your details' && !next.bar && allMine(next.hits) && next.hits.length === 3, JSON.stringify(next));
        await page.click('.tour-actions .btn.ghost:text-is("Skip")'); await sleep(600);
        ok('…and the bar back once the tour is over', (await page.locator('.tour').count()) === 0 && await barShown());
        ok('no errors in the console (21f)', errors.length === 0, errors.slice(0, 5).join(' | '));
        await ctx.close();
      }
      {
        // (g) the terms come due while a step card is up (a working role's free days under way, the terms changed since
        // they were agreed: the desktop app's bridge answering late, or a licence change): they are asked on their own,
        // never under the card. Agreed, the card comes back. Not now, read-only for this visit: the start waits for the
        // next opening, which brings it back, rather than ending for good.
        const old = () => { try { if (!localStorage.getItem('tourbook-role')) { const t = Date.now(); localStorage.setItem('tourbook-role', 'manager'); localStorage.setItem('tourbook-start', JSON.stringify({ role: 'manager', made: [] })); localStorage.setItem('tourbook-licence', JSON.stringify({ on: true, statusAt: t, first: t, seen: t })); localStorage.setItem('tourbook-terms', JSON.stringify({ v: '2026-01-01', at: t })); } } catch (e) { /* ignore */ } };
        const { ctx, page, errors } = await fresh(browser, { init: old });
        const CHANGED = 'The terms have changed', START = '{"role":"manager","made":[]}';
        const due = () => page.evaluate(() => { import('./js/licence-state.js').then(m => m.startFreeDays()); }); // what app.js noteUse does on a licence change
        const up = await cardIs(page, 'Add an act', 'Step 1 of 3');
        await due();
        const asked = await sheetUp(page, CHANGED); await sleep(700);
        ok('21g. the terms come due while Step 1’s card is up: “The terms have changed” on its own, the card gone from over it', up && asked && (await page.locator('.tour').count()) === 0, String(await title(page)));
        await page.check('#lic-terms-ok'); await page.click('#lic-terms-agree');
        ok('…agreed: Step 1’s card comes back, the start as it was', await cardIs(page, 'Add an act', 'Step 1 of 3') && (await key(page)) === START);
        // Another opening, the terms changed again since: Not now
        await page.evaluate(() => localStorage.setItem('tourbook-terms', JSON.stringify({ v: '2026-01-01', at: Date.now() })));
        await page.reload();
        const up2 = await cardIs(page, 'Add an act', 'Step 1 of 3');
        await due(); await sheetUp(page, CHANGED); await sleep(400);
        await page.click('#lic-terms-later'); await sleep(2500);
        const st = { up2, card: await page.locator('.tour-card').count(), sheets: await page.evaluate(() => [...document.querySelectorAll('.sheet')].map(x => x.getAttribute('aria-label'))), key: await key(page), tour: await page.evaluate(() => localStorage.getItem('tourbook-tour')), where: await where(page),
          canWrite: await page.evaluate(() => import('./js/licence-state.js').then(m => m.canWrite())) };
        ok('…Not now: read-only for this visit, on the calendar; no card, the start kept for the next opening (no welcome tour yet)', st.up2 && st.card === 0 && !st.sheets.length && st.key === START && st.tour === null && st.where === 'bookings' && st.canWrite === false, JSON.stringify(st));
        await page.reload();
        ok('…the next opening: Step 1’s card again', await cardIs(page, 'Add an act', 'Step 1 of 3') && (await key(page)) === START);
        ok('no errors in the console (21g)', errors.length === 0, errors.slice(0, 5).join(' | '));
        await ctx.close();
      }
    }

    /* ---------------- 22: README's start paragraph, in the cards' words ---------------- */
    {
      const md = require('fs').readFileSync(require('path').resolve(__dirname, '../../README.md'), 'utf8');
      const para = md.slice(md.indexOf('**Every role starts with its first booking.**'), md.indexOf('Every menu ends with'));
      const texts = { ...Object.fromEntries(Object.entries(R).map(([id, x]) => [id, x.texts])),
        audiophile: ['Three steps put your first gig on your calendar. First, a band you’ve seen or want to see: their card keeps your score each time you see them.', 'Next, a venue you go to. Save it once and it’s there to pick for every gig there.', 'Last, a gig you’re going to.'] };
      const NAMES = { Producer: 'producer', Manager: 'manager', Band: 'band', 'Solo artist': 'solo', Scout: 'scout', Audiophile: 'audiophile', 'Jack of Trades': 'all' };
      const rows = para.split('\n').filter(l => /^\| [A-Z]/.test(l) && !/^\| Role /.test(l)).map(l => l.split('|').slice(1, -1).map(x => x.trim().replace(/'/g, '’')));
      const off = rows.filter(([role, ...cols]) => !NAMES[role] || cols.length !== 3 || cols.some((c, i) => !texts[NAMES[role]][i].includes(c)));
      const last = (/For the last one[^.]*\./.exec(para) || [''])[0];
      ok('22. README: each role’s row of the start’s table in its own cards’ words; Tourbook walks you through, for the role you pick; the last step’s line fits every role (no “act” or “venue”: a producer saves an artist and a studio)', rows.length === 7 && off.length === 0 && /it walks you through three things for the role you pick/.test(para) && !!last && !/\b(act|venue)\b/.test(last), JSON.stringify({ rows: rows.length, off, last }));
    }
  } finally {
    await browser.close();
  }
})().catch(e => { console.log('FAIL 04-start crashed — ' + e.message); process.exit(1); });
