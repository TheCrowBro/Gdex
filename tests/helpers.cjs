// Shared by the browser specs: a browser with Tourbook open on a phone-sized screen, the welcome tour marked as seen (and
// the one-time role card dismissed, so every spec runs as Jack of Trades unless it sets a role), the “Did you see them?”
// question turned off (tourbook-ask-seen 'off', set on every load, so no sheet opens over a spec's own work),
// errors collected, and a PASS / FAIL printer the runner counts.
//   const { open, ok, sleep } = require('../helpers.cjs');
//   const { browser, page, errors } = await open({ sample: true });
//   open({ ask: true }) leaves tourbook-ask-seen alone: a spec about the question seeds its shows, then reloads.
//   open({ touch: true }) emulates a touch screen (page.touchscreen.tap; the mouse still works).
// Tourbook always opens on the calendar: after page.reload(), go(page, id) to be anywhere else.
// With TOURBOOK_LICENCE=on (CI's second leg; the test server then serves licences as live on localhost) every page starts
// inside free days already under way, with the terms agreed, unless the spec has seeded its own (the build spec [S-34]).
const { chromium } = require('playwright');
// The terms' version as js/terms.js has it, so the terms sheet counts as agreed (TOURBOOK_ROOT: the scratch copy).
const TERMS_V = (() => { try { return (/TERMS_VERSION = '([^']*)'/.exec(require('fs').readFileSync(require('path').join(process.env.TOURBOOK_ROOT || '.', 'js', 'terms.js'), 'utf8')) || [])[1] || ''; } catch { return ''; } })();
const BASE = process.env.TOURBOOK_URL || 'http://localhost:8124/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
// The licence leg's seed (the build spec [S-34]), also for a context a spec makes itself (06-roles, 43-ask, 70-settings):
// a trial already under way and the terms agreed, before the first page, only when absent.
async function licenceLeg(ctx) {
  if (process.env.TOURBOOK_LICENCE === 'on') await ctx.addInitScript(v => { try { const t = Date.now(); if (!localStorage.getItem('tourbook-licence')) localStorage.setItem('tourbook-licence', JSON.stringify({ on: true, statusAt: t, first: t, seen: t })); if (!localStorage.getItem('tourbook-terms')) localStorage.setItem('tourbook-terms', JSON.stringify({ v, at: t })); } catch (e) { /* ignore */ } }, TERMS_V);
}
// The licence leg for a page whose clock a spec has moved (Playwright's clock, years on): the free days the leg seeded by
// the real clock would be over there, and the role read-only, so they are seeded again in the page's own time, in both
// copies (tourbook-licence and IndexedDB licence-days), and the page is loaded again (sel: what to wait for). Off: nothing.
async function licenceAt(page, sel = '#deck .dk-next') {
  if (process.env.TOURBOOK_LICENCE !== 'on') return;
  await page.evaluate(() => import('./js/kv.js').then(k => { const t = Date.now(); localStorage.setItem('tourbook-licence', JSON.stringify({ on: true, statusAt: t, first: t, seen: t })); return k.kvSet('licence-days', { first: t, seen: t }).catch(() => {}); }));
  await page.reload(); await page.waitForSelector(sel);
}
async function open({ sample = false, viewport = { width: 420, height: 900 }, tab = null, init = null, permissions = [], ask = false, touch = false } = {}) {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true, permissions, hasTouch: touch });
  await ctx.addInitScript(keepAsk => { try { localStorage.setItem('tourbook-tour', 'done'); localStorage.setItem('tourbook-role-nudged', '1'); if (!keepAsk) localStorage.setItem('tourbook-ask-seen', 'off'); } catch (e) { /* ignore */ } }, ask); // no welcome tour, no role card, no question
  // The licence leg: a trial already under way and the terms agreed, before the first page, only when absent (a spec's own later changes survive reloads).
  await licenceLeg(ctx);
  if (init) await ctx.addInitScript(init);
  const tile = { status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }; // a 1×1 map tile: no network, no console error
  await ctx.route('https://tile.openstreetmap.org/**', r => r.fulfill(tile));
  await ctx.route('https://*.tile.openstreetmap.org/**', r => r.fulfill(tile));
  await ctx.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[]}}' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE);
  await page.waitForSelector('#deck .dk-next');
  if (sample) { await page.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(150); }
  if (tab) { await page.evaluate(t => window.logiGo(t), tab); await sleep(400); }
  return { browser, ctx, page, errors };
}
// Opens a section by id and waits for it to draw.
const go = async (page, id) => { await page.evaluate(t => window.logiGo(t), id); await sleep(400); };
// The top sheet (a form or panel), or null.
const topSheet = page => page.locator('.sheet').last();
// From a booking's page or any calendar view to the Month view (of the day in view: a booking's own month after its page).
const toMonth = async page => {
  await page.evaluate(() => { const b = document.querySelector('.bk-page .back-btn'); if (b) b.click(); }); await sleep(200);
  await page.evaluate(() => { const b = document.getElementById('bk-view-month') || document.querySelector('.bk-dayview .back-btn'); if (b) b.click(); }); await sleep(250);
};
// The booking form's band or venue box (js/combo.js): types `text`, then taps the option whose name is `name`; with
// name null, leaves the text as typed (Tab).
async function typePick(scope, key, text, name = text) {
  const box = scope.locator(`input[role=combobox][data-key="${key}"]`); await box.fill(text);
  if (!name) return box.press('Tab');
  const list = `#${await box.getAttribute('id')}-list`; // an option's aria-label is its name, then ", " and its second line
  await scope.locator(`${list} .cb-opt[aria-label="${name}"], ${list} .cb-opt[aria-label^="${name}, "]`).first().click();
}
// The words of each role's start (js/start.js STARTS), for a spec that takes one: its cards' titles, its forms' names
// and its last card's title.
const START_WORDS = {
  producer: { cards: ['Add an artist', 'Add a studio', 'Add a studio session'], forms: ['New artist', 'Add studio', 'New studio session'], done: 'Your first studio session is on your calendar' },
  manager: { cards: ['Add an act', 'Add a venue', 'Add a show'], forms: ['New act', 'Add venue', 'New show'], done: 'Your first show is on your calendar' },
  band: { cards: ['Add your band', 'Add a venue', 'Add a show'], forms: ['New band', 'Add venue', 'New show'], done: 'Your first show is on your calendar' },
  solo: { cards: ['Add your act', 'Add a venue', 'Add a show'], forms: ['New act', 'Add venue', 'New show'], done: 'Your first show is on your calendar' },
  scout: { cards: ['Add an act', 'Add a venue', 'Add a show'], forms: ['New act', 'Add venue', 'New show'], done: 'Your first show is on your calendar' },
  audiophile: { cards: ['Add a band', 'Add a venue', 'Add a gig'], forms: ['New band', 'Add venue', 'New gig'], done: 'Your first gig is on your calendar' },
  all: { cards: ['Add an act', 'Add a venue', 'Add a show'], forms: ['New act', 'Add venue', 'New show'], done: 'Your first show is on your calendar' },
};
// A role's start (js/start.js) as a person takes it, once the role is picked: its act, its place and its booking, each
// through its own form, the act and the place picked by typing. The terms sheet, when a working role's pick brought it
// (licences live, not yet agreed), is agreed first. Resolves with the tour that follows up at its first card.
async function passStart(page, { role = 'audiophile', band = 'The Moths', venue = 'The Lantern Rooms' } = {}) {
  const w = START_WORDS[role];
  const card = async title => { await page.waitForFunction(t => (document.querySelector('.tour-card #tour-title') || {}).textContent === t && !document.querySelector('.sheet-back'), title, { timeout: 10000 }); await sleep(300); await page.click('.tour-actions .btn.primary'); };
  const form = async label => { const f = page.locator(`.sheet[aria-label="${label}"]`); await f.waitFor({ timeout: 8000 }); await sleep(150); return f; };
  await page.waitForFunction(t => !!document.getElementById('lic-terms-ok') || (document.querySelector('.tour-card #tour-title') || {}).textContent === t, w.cards[0], { timeout: 10000 });
  if (await page.locator('#lic-terms-ok').count()) { await page.check('#lic-terms-ok'); await page.click('#lic-terms-agree'); }
  await card(w.cards[0]);
  let f = await form(w.forms[0]); await f.locator('[data-key=name]').fill(band); await f.locator('button[type=submit]').click();
  await card(w.cards[1]);
  f = await form(w.forms[1]); await f.locator('[data-key=name]').fill(venue); await f.locator('button[type=submit]').click();
  await card(w.cards[2]);
  f = await form(w.forms[2]);
  await typePick(f, 'actId', band.slice(0, 3), band); await typePick(f, 'venueId', venue.slice(0, 4), venue);
  await f.locator('button[type=submit]').click();
  await page.waitForFunction(t => (document.querySelector('.tour-card #tour-title') || {}).textContent === t, w.done, { timeout: 10000 });
  await sleep(300);
}
module.exports = { open, ok, sleep, go, topSheet, toMonth, BASE, licenceLeg, licenceAt, typePick, passStart, START_WORDS };
