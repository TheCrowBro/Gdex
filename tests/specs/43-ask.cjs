// "Did you see them?" when Gdex comes back from the background. An installed app is seldom loaded afresh, so coming
// back after three hours or more out of sight counts as opening it, for the question only (js/app.js): the waiting
// shows are worked out again and asked about once the screen is clear, and the section stays where it was.
// These checks are about WHEN js/app.js asks, so a stand-in is served in place of js/acts-ask.js: it notes every call
// and puts up a plain sheet to that module's contract (nothing when the person is not asked or no show is left).
// Nothing here depends on the day, the hour or the time zone of the run: the page's clock is set by hand (a Date of
// the spec's own, put in before the app loads, that runs on from the time it is given), and "out of sight" is
// document.visibilityState with a visibilitychange event, or pagehide and pageshow for a page the browser kept.
const { open, ok, sleep, go } = require('../helpers.cjs');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const store = (page, fn, arg) => page.evaluate(`import('./js/store.js').then(s => (${fn.toString()})(s, ${JSON.stringify(arg === undefined ? null : arg)}))`);
const BASE = new Date(2031, 4, 20, 8, 0, 0); // the morning every load here starts on, by the page's own clock
const day = n => { const d = new Date(BASE); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const QUESTION = 'Did you see them?';
// The stand-in never looks whether its own sheet is already up: a second sheet would show that js/app.js asked twice.
const STAND_IN = `
  import { h, sheet } from './util.js';
  import { askSeen, moneyShown } from './roles.js';
  import { waitingShows } from './model.js';
  window.__asked = window.__asked || [];
  export function askAtOpen(ids) {
    window.__asked.push({ ids: [...ids], over: document.querySelectorAll('.sheet-back, .tour').length });
    if (!askSeen()) return;
    const waiting = waitingShows(new Date(), { holds: !moneyShown() }).map(b => b.id), left = ids.filter(id => waiting.includes(id));
    if (left.length) sheet('${QUESTION}', h('div', { class: 'list' }, left.map(id => h('div', { class: 'card', 'data-id': id }, id))), { dismissOnBackdrop: false });
  }
  export function askPref() { return null; }`;

// Before the app loads, on every load. The page's clock: window.__clock(ms) sets it, it runs on from there, and the
// time set is kept for the tab (t-clock) so a reload starts on it. And the helper's presets, except while t-first-run
// is set: then every load is a first open (no tour seen, no role).
const init = () => {
  const R = Date; let at = null, t0 = 0;
  const now = () => (at === null ? R.now() : at + (R.now() - t0));
  function D(...a) { if (!new.target) return new R(now()).toString(); return a.length ? new R(...a) : new R(now()); }
  D.prototype = R.prototype; D.now = now; D.parse = R.parse; D.UTC = R.UTC;
  globalThis.Date = D;
  window.__clock = ms => { at = ms; t0 = R.now(); sessionStorage.setItem('t-clock', String(ms)); };
  try {
    const kept = sessionStorage.getItem('t-clock'); if (kept) window.__clock(Number(kept));
    if (localStorage.getItem('t-first-run')) for (const k of ['gdex-tour', 'gdex-role-nudged', 'gdex-role']) localStorage.removeItem(k);
  } catch (e) { /* ignore */ }
};

(async () => {
  const { browser, ctx, page, errors } = await open({ ask: true, init });
  let fetched = 0;
  await ctx.route('**/js/acts-ask.js', r => { fetched++; return r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: STAND_IN }); });

  let now = BASE; // the time the page's clock was last set to (it runs on from there)
  const setClock = async t => { now = t; await page.evaluate(ms => window.__clock(ms), t.getTime()); };
  // A fresh load at 08:00, and time for the question at open (0.9 s in) to have had its turn.
  const load = async () => { await setClock(BASE); fetched = 0; await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(1600); };
  const sight = hidden => page.evaluate(hidden => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  const kept = type => page.evaluate(type => { window.dispatchEvent(new PageTransitionEvent(type, { persisted: true })); }, type);
  // Out of sight for so many minutes by the page's clock, then back. `how`: the screen hidden, or the page kept by the browser.
  const away = async (minutes, how = 'hidden') => {
    await setClock(now);
    await (how === 'kept' ? kept('pagehide') : sight(true));
    await setClock(new Date(now.getTime() + minutes * 60000));
    await (how === 'kept' ? kept('pageshow') : sight(false));
    await sleep(800); // longer than two looks for a clear screen (every 300 ms)
  };
  const state = () => page.evaluate(() => import('./js/model.js').then(m => ({
    asked: (window.__asked || []).map(a => a.ids.join(',')), over: (window.__asked || []).map(a => a.over),
    sheets: [...document.querySelectorAll('.sheet')].map(s => s.getAttribute('aria-label')), tours: document.querySelectorAll('.tour-card').length,
    section: window.logiPage(), drawn: (document.querySelector('#page [data-page]') || { dataset: {} }).dataset.page,
    waiting: m.waitingShows(new Date()).map(b => b.id), clock: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
  })));
  const esc = async () => { await page.keyboard.press('Escape'); await sleep(250); };
  const show = (extra = {}) => ({ kind: 'show', status: 'confirmed', actId: 'k-act', venueName: 'Typed Hall', ...extra });

  /* ---------------- two shows: one over for two days, one that ends at 13:00 today ---------------- */
  await setClock(BASE);
  await store(page, (s, d) => {
    s.upsert('acts', { id: 'k-act', name: 'Clockwork' });
    s.upsert('bookings', { ...d.show, id: 'k-old', date: d.old });
    s.upsert('bookings', { ...d.show, id: 'k-late', date: d.today, setTime: '12:00', setLength: 60 });
  }, { show: show(), old: day(-2), today: day(0) });
  await sleep(200);
  await load();
  let st = await state();
  ok('the page’s clock is the one set here (08:00 on the morning of the load)', st.clock === '08:00', st.clock);
  ok('as Gdex opens: asked once, about the show that is over, with nothing else on screen', same(st.asked, ['k-old']) && same(st.over, [0]) && same(st.sheets, [QUESTION]) && fetched === 1, JSON.stringify(st));

  // the question's own sheet still up
  await away(240);
  st = await state();
  ok('back after 4 h with the question still on screen: nothing more is asked, and there is one sheet', st.asked.length === 1 && same(st.sheets, [QUESTION]), JSON.stringify(st));
  await esc(); await sleep(800);
  st = await state();
  ok('…and closing it does not bring it straight back', st.asked.length === 1 && st.sheets.length === 0, JSON.stringify(st));

  // a short absence, on another section
  await go(page, 'songs');
  const keys = () => page.evaluate(() => [localStorage, sessionStorage].map(st => Object.keys(st).filter(k => !k.startsWith('t-')).sort())); // t-: this spec's own
  const keysBefore = await keys();
  await away(179);
  st = await state();
  ok('back after 2 h 59 min: not asked, though two shows are waiting by then', st.asked.length === 1 && st.sheets.length === 0 && same(st.waiting, ['k-late', 'k-old']), JSON.stringify(st));

  // three hours or more
  await away(181);
  st = await state();
  ok('back after 3 h 1 min: asked, about the shows as they stand now (the one that ended meanwhile first)', same(st.asked, ['k-old', 'k-late,k-old']) && same(st.over, [0, 0]) && same(st.sheets, [QUESTION]), JSON.stringify(st));
  ok('…on the section the person was on, not the calendar', st.section === 'songs' && st.drawn === 'songs', `${st.section} / ${st.drawn}`);
  ok('…and when Gdex went out of sight is kept nowhere on the device', same(await keys(), keysBefore), JSON.stringify(await keys()));
  await esc();

  // a form open
  await go(page, 'bookings');
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('k-old'))); await page.waitForSelector('.bk-page .bk-edit');
  await page.click('.bk-page .bk-edit'); await page.locator('.sheet[aria-label="Edit show"] form').waitFor();
  await away(240);
  st = await state();
  ok('back after 4 h with a form open: nothing is asked over it', st.asked.length === 2 && same(st.sheets, ['Edit show']), JSON.stringify(st));
  await esc(); await page.locator(`.sheet[aria-label="${QUESTION}"]`).waitFor({ timeout: 3000 }).catch(() => {});
  st = await state();
  ok('…it is asked once the form is closed, on its own', st.asked.length === 3 && same(st.over, [0, 0, 0]) && same(st.sheets, [QUESTION]), JSON.stringify(st));
  ok('…with the booking’s page still open under it', (await page.locator('.bk-page .bk-hero').count()) === 1 && st.section === 'bookings');
  await esc();

  /* ---------------- a page the browser kept (the back/forward cache) ---------------- */
  await load(); await esc();
  await away(181, 'kept');
  st = await state();
  ok('a page kept by the browser and restored after 3 h 1 min counts as coming back (pagehide, then pageshow)', same(st.asked, ['k-old', 'k-old']) && same(st.sheets, [QUESTION]), JSON.stringify(st));
  await esc();
  await sight(false); await sleep(800); // the browser says "visible" as well when it restores a page
  st = await state();
  ok('…once, whichever way the browser says so', st.asked.length === 2 && st.sheets.length === 0, JSON.stringify(st));
  await away(179, 'kept');
  st = await state();
  ok('…and not when it was kept for 2 h 59 min', st.asked.length === 2 && st.sheets.length === 0, JSON.stringify(st));

  /* ---------------- who is asked ---------------- */
  await page.evaluate(() => localStorage.setItem('gdex-ask-seen', 'off'));
  await load();
  await away(240);
  st = await state();
  ok('with the question turned off: never asked on coming back', st.asked.length === 1 && st.sheets.length === 0, JSON.stringify(st));
  await page.evaluate(() => localStorage.removeItem('gdex-ask-seen'));
  await away(181);
  st = await state();
  ok('…turned back on, the next time back asks', st.asked.length === 2 && same(st.sheets, [QUESTION]), JSON.stringify(st));
  await esc();
  await page.evaluate(() => localStorage.setItem('gdex-role', 'band'));
  await load();
  await away(240);
  st = await state();
  ok('a band is not asked on coming back', st.asked.length === 1 && st.sheets.length === 0, JSON.stringify(st));
  await page.evaluate(() => localStorage.setItem('gdex-ask-seen', 'on'));
  await away(181);
  st = await state();
  ok('…a band that chose to be asked is', st.asked.length === 2 && same(st.sheets, [QUESTION]), JSON.stringify(st));
  await esc();
  await page.evaluate(() => { localStorage.removeItem('gdex-ask-seen'); localStorage.removeItem('gdex-role'); });

  /* ---------------- nothing waiting as Gdex opens; a show that ends while it is out of sight ---------------- */
  await page.evaluate(() => import('./js/model.js').then(m => m.markWent('k-old'))); await sleep(200);
  await load();
  st = await state();
  ok('nothing waiting as Gdex opens: nothing is asked, and the question’s code is not fetched', st.asked.length === 0 && st.sheets.length === 0 && fetched === 0 && st.section === 'bookings', JSON.stringify({ ...st, fetched }));
  await away(181);
  st = await state();
  ok('back after 3 h 1 min with still nothing waiting: nothing asked, nothing fetched', st.asked.length === 0 && st.sheets.length === 0 && fetched === 0 && st.waiting.length === 0 && st.clock === '11:01', JSON.stringify({ ...st, fetched }));
  await away(181);
  st = await state();
  ok('a show that ended while Gdex was out of sight is asked about on coming back, though nothing was due at open', same(st.asked, ['k-late']) && same(st.over, [0]) && same(st.sheets, [QUESTION]) && fetched === 1, JSON.stringify({ ...st, fetched }));
  await esc();

  /* ---------------- a show still on hold: by role, as at open ---------------- */
  await page.evaluate(() => import('./js/model.js').then(m => m.markWent('k-late')));
  await store(page, (s, b) => { s.upsert('bookings', b); }, show({ id: 'k-hold', status: 'hold', date: day(-2) }));
  await sleep(200);
  await load();
  await away(181);
  st = await state();
  ok('a show still on hold is not asked about on coming back by a role with money', same(st.asked, ['k-hold']) && st.sheets.length === 0, JSON.stringify(st)); // the one call is the open's, which leaves holds to the sheet
  await page.evaluate(() => import('./js/roles.js').then(r => r.setRole('scout'))); await sleep(300);
  await away(181);
  st = await state();
  ok('…and is by a scout', same(st.asked, ['k-hold', 'k-hold']) && same(st.sheets, [QUESTION]), JSON.stringify(st));
  await esc();

  /* ---------------- a first open left for hours: the role question, the tour, then the question ---------------- */
  await page.evaluate(() => import('./js/model.js').then(m => { m.markWent('k-late', false); localStorage.setItem('t-first-run', '1'); })); await sleep(200);
  await load(); await page.waitForSelector('.rp-ask');
  await away(360);
  st = await state();
  ok('back after 6 h with the first-run question still up: nothing is asked over it', st.asked.length === 0 && same(st.sheets, ['Who’s using Gdex?']) && fetched === 0, JSON.stringify({ ...st, fetched }));
  await page.click('.rp-card[data-role="scout"]'); await page.waitForSelector('.tour-card'); await sleep(800);
  st = await state();
  ok('…nor over the welcome tour that follows the answer', st.asked.length === 0 && st.tours === 1 && st.sheets.length === 0, JSON.stringify(st));
  await page.click('.tour-actions .btn.ghost.small'); // Skip
  await page.locator(`.sheet[aria-label="${QUESTION}"]`).waitFor({ timeout: 3000 }).catch(() => {});
  st = await state();
  ok('…then once, with the show that ended in those hours', st.asked.length === 1 && same(st.asked[0].split(',').sort(), ['k-hold', 'k-late']) && same(st.over, [0]) && same(st.sheets, [QUESTION]) && st.tours === 0, JSON.stringify(st));
  await esc();
  await page.evaluate(() => localStorage.removeItem('t-first-run'));

  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL ask spec crashed — ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')); process.exit(1); });
