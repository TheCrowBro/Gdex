// Shared by the browser specs: a browser with Gdex open on a phone-sized screen, the welcome tour marked as seen (and
// the one-time role card dismissed, so every spec runs as Everything unless it sets a role), the “Did you see them?”
// question turned off (gdex-ask-seen 'off', set on every load, so no sheet opens over a spec's own work),
// errors collected, and a PASS / FAIL printer the runner counts.
//   const { open, ok, sleep } = require('../helpers.cjs');
//   const { browser, page, errors } = await open({ sample: true });
//   open({ ask: true }) leaves gdex-ask-seen alone: a spec about the question seeds its shows, then reloads.
// Gdex always opens on the calendar: after page.reload(), go(page, id) to be anywhere else.
// With GDEX_LICENCE=on (CI's second leg; the test server then serves licences as live on localhost) every page starts
// inside free days already under way, with the terms agreed, unless the spec has seeded its own (the build spec [S-34]).
const { chromium } = require('playwright');
// The terms' version as js/terms.js has it, so the terms sheet counts as agreed (GDEX_ROOT: the scratch copy).
const TERMS_V = (() => { try { return (/TERMS_VERSION = '([^']*)'/.exec(require('fs').readFileSync(require('path').join(process.env.GDEX_ROOT || '.', 'js', 'terms.js'), 'utf8')) || [])[1] || ''; } catch { return ''; } })();
const BASE = process.env.GDEX_URL || 'http://localhost:8124/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
async function open({ sample = false, viewport = { width: 420, height: 900 }, tab = null, init = null, permissions = [], ask = false } = {}) {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true, permissions });
  await ctx.addInitScript(keepAsk => { try { localStorage.setItem('gdex-tour', 'done'); localStorage.setItem('gdex-role-nudged', '1'); if (!keepAsk) localStorage.setItem('gdex-ask-seen', 'off'); } catch (e) { /* ignore */ } }, ask); // no welcome tour, no role card, no question
  // The licence leg: a trial already under way and the terms agreed, before the first page, only when absent (a spec's own later changes survive reloads).
  if (process.env.GDEX_LICENCE === 'on') await ctx.addInitScript(v => { try { const t = Date.now(); if (!localStorage.getItem('gdex-licence')) localStorage.setItem('gdex-licence', JSON.stringify({ on: true, statusAt: t, first: t, seen: t })); if (!localStorage.getItem('gdex-terms')) localStorage.setItem('gdex-terms', JSON.stringify({ v, at: t })); } catch (e) { /* ignore */ } }, TERMS_V);
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
module.exports = { open, ok, sleep, go, topSheet, toMonth, BASE };
