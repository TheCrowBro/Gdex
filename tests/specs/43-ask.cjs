// "Did you see them?", in two parts.
//
// WHEN Tourbook asks (the first block). An installed app is seldom loaded afresh, so coming back after three hours or more
// out of sight counts as opening it, for the question only (js/app.js): the waiting shows are worked out again and
// asked about once the screen is clear, and the section stays where it was. Those checks are about js/app.js, so a
// stand-in is served in place of js/acts-ask.js: it notes every call and puts up a plain sheet to that module's
// contract (nothing when the person is not asked or no show is left). Nothing there depends on the day, the hour or
// the time zone of the run: the page's clock is set by hand (a Date of the spec's own, put in before the app loads,
// that runs on from the time it is given), and "out of sight" is document.visibilityState with a visibilitychange
// event, or pagehide and pageshow for a page the browser kept.
//
// WHAT it asks (the blocks after it, each in a browser of its own with the real js/acts-ask.js): the sheet with a row
// per show and its Yes and No, the score form over it, "Didn’t go", who is asked, the show's own page, the acts page,
// Settings → Your role, the first open, a narrow phone with extra-large text, the real sheet when Tourbook comes back, and
// slips of the hand (a double click or tap, a held Enter key) with a log that has junk in it.
// Shows that must be over are dated two days back or more, so no check there depends on the hour of the run; dates on
// screen are compared with the app's own formatters run in the page.
const { open, ok, sleep, go, BASE: URL, licenceLeg, licenceAt } = require('../helpers.cjs');
const { chromium } = require('playwright');

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
    if (localStorage.getItem('t-first-run')) for (const k of ['tourbook-tour', 'tourbook-role-nudged', 'tourbook-role']) localStorage.removeItem(k);
  } catch (e) { /* ignore */ }
};

// The page's clock and "out of sight", for a page opened with `init`.
const clockKit = page => {
  let now = BASE; // the time the page's clock was last set to (it runs on from there)
  // The licence leg ([S-34]): the helper seeded the free days by the real clock, and this page's clock is years on (they
  // would be over, and the role read-only), so the first time it is set they are seeded again in its own time, and the
  // page is loaded again on that clock (licenceAt): an open Tourbook never takes a later start than one it has known.
  let leg = process.env.TOURBOOK_LICENCE === 'on';
  const setClock = async t => {
    now = t; await page.evaluate(ms => window.__clock(ms), t.getTime());
    if (leg) {
      leg = false; await licenceAt(page);
      const st = await page.evaluate(() => import('./js/licence-state.js').then(l => ({ first: l.licenceNow().first, now: Date.now(), write: l.canWrite() })));
      ok('the licence leg: the free days start on the page’s own clock, so Tourbook can change things', st.write === true && Math.abs(st.first - st.now) < 60000 && new Date(st.first).getFullYear() === t.getFullYear(), JSON.stringify(st));
    }
  };
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
  return { setClock, sight, kept, away };
};

/* ============================ the real sheet (no stand-in from here on) ============================ */
const Q = `.sheet[aria-label="${QUESTION}"]`;
const dayIso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }; // by the real clock: two days or more either way wherever "over" matters
const sheetsOf = page => page.$$eval('.sheet', els => els.map(x => x.getAttribute('aria-label')));
const tours = page => page.locator('.tour-card').count();
const rowIds = page => page.$$eval(`${Q} .ac-ask-row`, rs => rs.map(r => r.dataset.id));
const rowText = (page, id) => page.locator(`${Q} .ac-ask-row[data-id="${id}"]`).innerText().then(t => t.replace(/\s+/g, ' ').trim());
const rowBtns = (page, id) => page.$$eval(`${Q} .ac-ask-row[data-id="${id}"] button`, bs => bs.map(b => b.id));
const focusId = page => page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? a.id || a.getAttribute('aria-label') || a.tagName : 'BODY'; });
const fresh = async page => { await page.reload(); await page.waitForSelector('#deck .dk-next'); };
// A fresh load that should ask waits for the sheet; one that should not gives the question (0.9 s in) time for its turn.
const loadAsked = async page => { await fresh(page); await page.locator(Q).waitFor({ timeout: 8000 }).catch(() => {}); await sleep(250); return sheetsOf(page); };
const loadQuiet = async page => { await fresh(page); await sleep(2000); return sheetsOf(page); };
const rec = (page, list, id) => store(page, (s, a) => { const r = s.byId(a[0], a[1]); return r ? JSON.parse(JSON.stringify(r)) : null; }, [list, id]);
const put = async (page, list) => { await store(page, (s, l) => { l.forEach(b => s.upsert('bookings', b)); }, list); await sleep(200); };
const waitingIds = (page, holds = false) => page.evaluate(h => import('./js/model.js').then(m => m.waitingShows(new Date(), { holds: h }).map(b => b.id)), holds);
const setKey = (page, k, v) => page.evaluate(([k, v]) => { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }, [k, v]);
const roleNow = async (page, id) => { await page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id); await sleep(400); }; // in this visit: the page redraws
const openB = async (page, id) => { await page.evaluate(x => import('./js/pages/bookings.js').then(m => m.openBooking(x)), id); await page.waitForSelector('.bk-page'); await sleep(350); };
const bkSteps = page => page.evaluate(() => import('./js/pages/bookings.js').then(m => m.bookings.tutorial().map(s => [s.title, s.text])));
const logForm = page => page.locator('.sheet[aria-label="Log a time seen"]');
const editForm = page => page.locator('.sheet[aria-label="Edit a time seen"]');
const esc = async page => { await page.keyboard.press('Escape'); await sleep(250); };
const MONEY = /\$|£|€|\bfee\b|\bdeal\b|guarantee|\b500\b/i;

/* ---------------- the sheet: rows, Yes, No, the keyboard, the show's own page, the acts page ---------------- */
async function theSheet() {
  const { browser, page, errors } = await open({ sample: true, ask: true });
  const fmt = (how, iso) => page.evaluate(([f, i]) => import('./js/util.js').then(u => u[f](i)), [how, iso]);
  const d2 = dayIso(-2), d3 = dayIso(-3), d4 = dayIso(-4), d5 = dayIso(-5), d6 = dayIso(-6);
  ok('the helper’s ask: true leaves the setting alone, and the sample alone has no show waiting', (await page.evaluate(() => localStorage.getItem('tourbook-ask-seen'))) === null && (await waitingIds(page, true)).length === 0);
  await put(page, [
    { id: 'q-a', kind: 'show', status: 'confirmed', actId: 's-owls', date: d2, venueId: 's-lantern', setTime: '21:00', setLength: 45, deal: { type: 'guarantee', fee: 500 } },
    { id: 'q-b', kind: 'show', status: 'confirmed', actId: 's-sablea', date: d3, venueName: 'The Moth Club' },
    { id: 'q-c', kind: 'show', status: 'done', actId: 's-owls', date: d6, endDate: d5, venueId: 's-greenfield' }, // a festival weekend
    { id: 'q-old', kind: 'show', status: 'done', actId: 's-owls', date: dayIso(-20), venueId: 's-harbour' },     // too long ago to be asked about
  ]);
  await sleep(1800);
  ok('shows added after Tourbook opened (the sample, three past shows) are not asked about in that visit', (await sheetsOf(page)).length === 0 && same(await waitingIds(page), ['q-a', 'q-b', 'q-c']), (await waitingIds(page)).join(','));

  /* it opens */
  let sheets = await loadAsked(page);
  ok('a fresh open: one sheet, “Did you see them?”', same(sheets, [QUESTION]), sheets.join(' | '));
  ok('…a dialog by that name, with the page under it out of reach', (await page.locator(`${Q}[role=dialog][aria-modal=true]`).count()) === 1 && await page.evaluate(() => document.getElementById('app').inert === true));
  ok('…one row per show that is over, the newest first; the show from three weeks ago is not asked about', same(await rowIds(page), ['q-a', 'q-b', 'q-c']), (await rowIds(page)).join(','));
  ok('…with the focus on the first row’s Yes', (await focusId(page)) === 'ac-ask-yes-q-a', await focusId(page));
  ok('…and no form in it (each answer is saved as it is given)', (await page.locator(`${Q} form`).count()) === 0);
  const names = await page.$$eval(`${Q} .ac-ask-main strong`, els => els.map(e => e.textContent));
  const subs = await page.$$eval(`${Q} .ac-ask-main .small`, els => els.map(e => e.textContent));
  const want = await page.evaluate(ids => Promise.all([import('./js/util.js'), import('./js/store.js'), import('./js/model.js')]).then(([u, s, m]) => ids.map(id => {
    const b = s.byId('bookings', id), last = b.endDate && b.endDate > b.date ? b.endDate : b.date;
    return u.fmtShort(b.date) + (last > b.date ? ' – ' + u.fmtShort(last) : '') + ' · ' + m.venueOf(b).name;
  })), ['q-a', 'q-b', 'q-c']);
  ok('a row names the act', same(names, ['The Night Owls', 'Sable', 'The Night Owls']), names.join(' | '));
  ok('…with the date as the app writes dates, the last day of a show over several days, and the venue (saved or typed)', same(subs, want) && / – /.test(subs[2]) && subs[1].endsWith(' · The Moth Club'), subs.join(' | '));
  const long2 = await fmt('fmtLong', d2);
  ok('Yes and No say who and when to a screen reader', (await page.getAttribute('#ac-ask-yes-q-a', 'aria-label')) === `Yes, I saw The Night Owls on ${long2}` && (await page.getAttribute('#ac-ask-no-q-a', 'aria-label')) === `No, I didn’t see The Night Owls on ${long2}`
    && (await page.textContent('#ac-ask-yes-q-a')) === 'Yes' && (await page.textContent('#ac-ask-no-q-a')) === 'No', await page.getAttribute('#ac-ask-no-q-a', 'aria-label'));
  ok('…a show over several days is named by its first day', (await page.getAttribute('#ac-ask-yes-q-c', 'aria-label')) === `Yes, I saw The Night Owls on ${await fmt('fmtLong', d6)}`);
  ok('no money shows in the sheet (the first show has a fee)', !MONEY.test(await page.locator(Q).innerText()), (await page.locator(Q).innerText()).replace(/\s+/g, ' '));
  const hit = await page.evaluate(() => { const need = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit')); return [...document.querySelectorAll('.sheet .ac-ask-row .btn, #ac-ask-close')].map(b => Math.round(b.getBoundingClientRect().height)).filter(x => x < need); });
  ok('every button in it is a full touch target', hit.length === 0, hit.join(','));

  /* its own walkthrough */
  await page.click(`${Q} .sheet-help`);
  await page.waitForSelector('.tour-card');
  const titles = [];
  for (let i = 0; i < 6 && await tours(page); i++) { titles.push(await page.textContent('#tour-title')); await page.click('.tour-actions .btn.primary'); await sleep(700); }
  ok('the sheet’s ? runs its own three steps', same(titles, ['Shows that are over', 'Yes or No', 'Later']), titles.join(' › '));
  ok('…and leaves the sheet as it was', same(await sheetsOf(page), [QUESTION]) && (await rowIds(page)).length === 3);

  /* the keyboard */
  await page.focus('#ac-ask-yes-q-a');
  const order = [];
  for (let i = 0; i < 9; i++) { await page.keyboard.press('Tab'); order.push(await focusId(page)); }
  ok('Tab runs through each row’s buttons, then Done, and stays inside the sheet', same(order, ['ac-ask-no-q-a', 'ac-ask-yes-q-b', 'ac-ask-no-q-b', 'ac-ask-yes-q-c', 'ac-ask-no-q-c', 'ac-ask-close', 'Tutorial for this', 'Close', 'ac-ask-yes-q-a']), order.join(' › '));
  // A click on its dim backdrop, over the top bar's ? (before ↓ below, which scrolls the page under the sheet): the
  // question does not close on its backdrop (js/util.js sheet(), dismissOnBackdrop false), and the click must neither
  // reach ? nor take the focus out of the sheet onto the page's body. (08-sheets taps with a finger too.)
  const tb = await page.locator('#helpBtn').boundingBox(), tx = tb.x + tb.width / 2, ty = tb.y + tb.height / 2;
  const onBack = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.classList.contains('sheet-back'), [tx, ty]);
  await page.mouse.click(tx, ty); await sleep(400);
  ok('a click on the dim backdrop above it (over ?) closes nothing, presses nothing and leaves the focus where it was, in the sheet', onBack && same(await sheetsOf(page), [QUESTION]) && !(await tours(page)) && (await focusId(page)) === 'ac-ask-yes-q-a', `on the backdrop: ${onBack}; ${await focusId(page)}; ${(await sheetsOf(page)).join(' | ')}`);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await sleep(400);
  ok('the section menu’s arrow keys are off while it is open', (await page.evaluate(() => window.logiPage())) === 'bookings');

  /* Yes */
  await page.click('#ac-ask-yes-q-a');
  await logForm(page).waitFor();
  ok('Yes opens Log a time seen over the list, with the show’s date and venue filled in', same(await sheetsOf(page), [QUESTION, 'Log a time seen'])
    && (await logForm(page).locator('[data-key=date]').inputValue()) === d2 && (await logForm(page).locator('select[data-key=venueId]').inputValue()) === 's-lantern');
  ok('…and the score is still required', await logForm(page).locator('[data-key=rating]').evaluate(el => el.required));
  await esc(page);
  ok('Escape closes only the form: the row is unanswered, the focus back on its Yes', same(await sheetsOf(page), [QUESTION]) && same(await rowBtns(page, 'q-a'), ['ac-ask-yes-q-a', 'ac-ask-no-q-a']) && (await focusId(page)) === 'ac-ask-yes-q-a', await focusId(page));
  await page.click('#ac-ask-yes-q-a');
  await logForm(page).waitFor();
  await logForm(page).locator('.form-actions .btn.ghost').click(); await sleep(250); // Cancel
  ok('Cancel does the same', same(await sheetsOf(page), [QUESTION]) && (await focusId(page)) === 'ac-ask-yes-q-a' && !(await rec(page, 'acts', 's-owls')).seen.some(e => e.bookingId === 'q-a'));
  await page.click('#ac-ask-yes-q-a');
  await logForm(page).waitFor();
  await logForm(page).locator('[data-key=rating]').fill('82');
  await logForm(page).locator('button[type=submit]').click(); await sleep(400);
  let owls = await rec(page, 'acts', 's-owls');
  ok('saving 82 logs the night on the act, with the booking', owls.seen.some(e => e.bookingId === 'q-a' && e.rating === 82 && e.date === d2 && e.venueId === 's-lantern'), JSON.stringify(owls.seen.slice(-1)));
  ok('…says so', /Logged: 82\/100/.test(await page.locator('.toast').last().innerText().catch(() => '')));
  ok('…the row reads Scored 82/100, and the list stays open for the others', /Scored 82\/100/.test(await rowText(page, 'q-a')) && same(await sheetsOf(page), [QUESTION]) && (await rowIds(page)).length === 3, await rowText(page, 'q-a'));
  ok('…with the focus on that row’s ✎ Edit', (await focusId(page)) === 'ac-ask-edit-q-a' && (await page.getAttribute('#ac-ask-edit-q-a', 'aria-label')) === 'Edit the time you saw The Night Owls', await focusId(page));
  ok('…and the star kept from a screen reader', (await page.$eval(`${Q} .ac-ask-row[data-id="q-a"] .ac-ask-done span`, el => el.getAttribute('aria-hidden') + el.textContent.trim())) === 'true★');

  /* Edit, and deleting the time seen */
  await page.keyboard.press('Enter');
  await editForm(page).waitFor();
  ok('✎ Edit opens that time seen', (await editForm(page).locator('[data-key=rating]').inputValue()) === '82');
  await editForm(page).locator('[data-key=rating]').fill('90');
  await page.keyboard.press('Enter'); await sleep(400);
  ok('a changed score shows in the row, the focus still on ✎ Edit', /Scored 90\/100/.test(await rowText(page, 'q-a')) && (await focusId(page)) === 'ac-ask-edit-q-a', await rowText(page, 'q-a'));
  await page.click('#ac-ask-edit-q-a');
  await editForm(page).waitFor();
  await editForm(page).locator('.btn.danger').click(); await sleep(400);
  owls = await rec(page, 'acts', 's-owls');
  ok('deleting it there makes the row unanswered again, the focus on its Yes', !owls.seen.some(e => e.bookingId === 'q-a') && same(await rowBtns(page, 'q-a'), ['ac-ask-yes-q-a', 'ac-ask-no-q-a']) && (await focusId(page)) === 'ac-ask-yes-q-a', await focusId(page));
  await page.keyboard.press('Enter');
  await logForm(page).waitFor();
  await logForm(page).locator('[data-key=rating]').fill('82');
  await page.keyboard.press('Enter'); await sleep(400);
  ok('scored again with the keyboard alone', /Scored 82\/100/.test(await rowText(page, 'q-a')) && (await focusId(page)) === 'ac-ask-edit-q-a');

  /* Yes, then another night typed into the form */
  await page.click('#ac-ask-yes-q-b');
  await logForm(page).waitFor();
  ok('a typed venue fills the place box', (await logForm(page).locator('select[data-key=venueId]').inputValue()) === '' && (await logForm(page).locator('[data-key=where]').inputValue()) === 'The Moth Club' && (await logForm(page).locator('[data-key=date]').inputValue()) === d3);
  await logForm(page).locator('[data-key=date]').fill(d4);
  await logForm(page).locator('[data-key=rating]').fill('60');
  await logForm(page).locator('button[type=submit]').click(); await sleep(400);
  let sable = await rec(page, 'acts', 's-sablea');
  const other = sable.seen.find(e => e.date === d4);
  ok('the date changed to a night that show does not cover: it is logged for that night, without the show', !!other && other.rating === 60 && other.bookingId !== 'q-b' && !sable.seen.some(e => e.bookingId === 'q-b'), JSON.stringify(other));
  ok('…so the row still asks, with the focus on its Yes', same(await rowBtns(page, 'q-b'), ['ac-ask-yes-q-b', 'ac-ask-no-q-b']) && (await focusId(page)) === 'ac-ask-yes-q-b', await focusId(page));

  /* No */
  const timesBefore = await page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/model.js')]).then(([s, m]) => m.seenStats(s.byId('acts', 's-owls')).times));
  await page.click('#ac-ask-no-q-c'); await sleep(300);
  ok('No marks the show: went is "no" on the booking', (await rec(page, 'bookings', 'q-c')).went === 'no');
  ok('…the row reads Didn’t go, with Change', /^The Night Owls .* Didn’t go Change$/.test(await rowText(page, 'q-c')) && same(await rowBtns(page, 'q-c'), ['ac-ask-change-q-c']), await rowText(page, 'q-c'));
  ok('…the focus is on Change, which names the act', (await focusId(page)) === 'ac-ask-change-q-c' && (await page.getAttribute('#ac-ask-change-q-c', 'aria-label')) === 'Change your answer for The Night Owls', await focusId(page));
  ok('…it is announced', (await page.textContent('#sr-live')) === 'The Night Owls: marked Didn’t go', await page.textContent('#sr-live'));
  ok('…and nothing is counted as seen', (await page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/model.js')]).then(([s, m]) => m.seenStats(s.byId('acts', 's-owls')).times))) === timesBefore);
  await page.click('#ac-ask-change-q-c'); await sleep(300);
  ok('Change takes the answer back: no went on the booking, Yes and No again, the focus on Yes', !('went' in (await rec(page, 'bookings', 'q-c'))) && same(await rowBtns(page, 'q-c'), ['ac-ask-yes-q-c', 'ac-ask-no-q-c']) && (await focusId(page)) === 'ac-ask-yes-q-c', await focusId(page));
  await page.focus('#ac-ask-no-q-c'); await page.keyboard.press('Enter'); await sleep(300);
  ok('No with the keyboard', (await rec(page, 'bookings', 'q-c')).went === 'no' && (await focusId(page)) === 'ac-ask-change-q-c');

  /* closing */
  await page.click('#ac-ask-close'); await sleep(300);
  ok('Done closes it, with the focus on the page', (await sheetsOf(page)).length === 0 && (await focusId(page)) === 'page' && await page.evaluate(() => document.getElementById('app').inert === false), await focusId(page));
  await sleep(1500);
  ok('…and it does not come back in that visit', (await sheetsOf(page)).length === 0);

  /* the calendar says Didn’t go */
  await openB(page, 'q-c');
  await page.click('.bk-page .back-btn'); await page.waitForSelector('.bk-dayview');
  ok('on the calendar, the show answered No says Didn’t go', /Didn’t go/.test(await page.locator('.bk-dayview .bk-ev[data-id="q-c"]').innerText()), (await page.locator('.bk-dayview .bk-ev[data-id="q-c"]').innerText()).replace(/\s+/g, ' '));

  // …and so does the venue's own list of what was on there before
  await page.evaluate(() => import('./js/pages/venues.js').then(m => m.openVenue('s-greenfield'))); await page.waitForSelector('.vn-sheet #vn-bk-q-c'); await sleep(200);
  const before = await page.evaluate(() => ({ went: [...document.querySelectorAll('.vn-sheet .vn-row-went')].map(e => e.closest('.vn-row').id), text: document.getElementById('vn-bk-q-c').innerText.replace(/\s+/g, ' ') }));
  ok('…and in the venue’s list of what was on there before, on that show alone', same(before.went, ['vn-bk-q-c']) && /Didn’t go$/.test(before.text), JSON.stringify(before));
  await esc(page);

  /* the show's own page, as Everything with the setting unset */
  await openB(page, 'q-c');
  ok('the show’s page reads Didn’t go, with Change', (await page.locator('.bk-score.bk-score-went .bk-score-text').innerText()) === 'Didn’t go' && (await page.locator('#bk-score-change').innerText()) === 'Change'
    && (await page.getAttribute('#bk-score-change', 'aria-label')) === 'Change your answer for The Night Owls' && (await page.locator('#bk-score, #bk-score-no').count()) === 0);
  // The walkthrough's step about the row follows the row: someone who is asked gets the same Didn’t go step as anyone.
  let step = (await bkSteps(page)).find(x => x[0] === 'Didn’t go');
  ok('…and its walkthrough step speaks of Change, not of a score to give', !!step && step[1] === 'You said you missed this show, so it is not counted as seen. Change takes that answer back.' && !(await bkSteps(page)).some(x => x[0] === 'Score this show'), (await bkSteps(page)).map(x => x.join(': ')).join(' | '));
  await openB(page, 'q-a');
  ok('a scored show reads its score, with ✎ Edit and nothing else', /Scored 82\/100/.test(await page.locator('.bk-score').innerText()) && same(await page.$$eval('.bk-score button', bs => bs.map(b => b.id)), ['bk-score-edit']));
  step = (await bkSteps(page)).find(x => x[0] === 'Score this show');
  ok('…and its walkthrough step speaks of the score and Edit, and of no Didn’t go button (there is none)', !!step && step[1].endsWith('Edit changes it.') && !/Didn’t go/.test(step[1]), step && step[1]);
  await openB(page, 'q-b');
  ok('Everything, asked: a show that is over has ★ Score, then Didn’t go', same(await page.$$eval('.bk-score button', bs => bs.map(b => b.id)), ['bk-score', 'bk-score-no']) && (await page.textContent('#bk-score')).trim() === '★ Score Sable'
    && (await page.textContent('#bk-score-no')) === 'Didn’t go' && (await page.getAttribute('#bk-score-no', 'aria-label')) === 'I didn’t go to see Sable', (await page.locator('.bk-score').innerText()).replace(/\s+/g, ' '));
  step = (await bkSteps(page)).find(x => x[0] === 'Score this show');
  ok('…and its walkthrough step says what Didn’t go does', !!step && step[1].endsWith('If you missed it, Didn’t go says so and Tourbook stops asking.'), step && step[1]);
  await page.click('#bk-score-no'); await sleep(500);
  ok('Didn’t go on the page: the booking is marked, the row reads Didn’t go, the focus on Change', (await rec(page, 'bookings', 'q-b')).went === 'no' && (await page.locator('.bk-score-went .bk-score-text').innerText()) === 'Didn’t go' && (await focusId(page)) === 'bk-score-change', await focusId(page));
  ok('…and it is announced', (await page.textContent('#sr-live')) === 'Sable: marked Didn’t go');
  await page.keyboard.press('Enter'); await sleep(500);
  ok('Change brings ★ Score back, with the focus on it', !('went' in (await rec(page, 'bookings', 'q-b'))) && (await focusId(page)) === 'bk-score' && (await page.locator('#bk-score-no').count()) === 1, await focusId(page));
  // tonight, on stage at 23:59: over at 01:59 tomorrow, whatever the hour of this run
  await put(page, [{ id: 'q-t', kind: 'show', status: 'confirmed', actId: 's-sablea', date: dayIso(0), venueName: 'A Late Room', setTime: '23:59' }]);
  await openB(page, 'q-t');
  ok('a show that is not over yet has ★ Score alone', same(await page.$$eval('.bk-score button', bs => bs.map(b => b.id)), ['bk-score']));
  step = (await bkSteps(page)).find(x => x[0] === 'Score this show');
  ok('…and its walkthrough step says nothing of a Didn’t go button that is not there yet', !!step && step[1].endsWith('Edit changes it.') && !/Didn’t go/.test(step[1]), step && step[1]);
  const over = await page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/model.js'), import('./js/util.js')]).then(([s, m, u]) => {
    const b = s.byId('bookings', 'q-t'), at = (h, min) => { const d = u.parseISO(b.date); d.setHours(h, min, 0, 0); return d; };
    return [m.showOver(b, at(23, 59)), m.showOver(b, at(25, 58)), m.showOver(b, at(25, 59))];
  }));
  ok('…Didn’t go waits for the end of the set (two hours after 23:59, by the model)', same(over, [false, false, true]), over.join(','));
  await openB(page, 's-show1');
  ok('a show still to come has no row', (await page.locator('.bk-score').count()) === 0);
  await put(page, [{ id: 'q-off', kind: 'show', status: 'cancelled', actId: 's-owls', date: d4, venueId: 's-lantern' }, { id: 'q-none', kind: 'show', status: 'confirmed', date: d4, venueName: 'Somewhere' }]);
  await openB(page, 'q-off');
  ok('nor has a cancelled one', (await page.locator('.bk-score').count()) === 0);
  await openB(page, 'q-none');
  ok('Everything on a past show with no act: no row, and no walkthrough step for one', (await page.locator('.bk-score').count()) === 0 && !(await bkSteps(page)).some(x => x[0] === 'Score this show'));
  await roleNow(page, 'scout');
  ok('a scout on the same show is told to pick the act', (await page.locator('.bk-score-noact .bk-score-text').innerText()) === 'Pick the act you saw to score this show.' && (await bkSteps(page)).some(x => x[0] === 'Score this show' && /Pick the act you saw/.test(x[1])));
  await setKey(page, 'tourbook-ask-seen', 'off');
  await openB(page, 'q-b'); await page.evaluate(() => import('./js/store.js').then(s => s.redraw())); await sleep(300);
  ok('a scout who turned the question off keeps ★ Score (and Didn’t go)', same(await page.$$eval('.bk-score button', bs => bs.map(b => b.id)), ['bk-score', 'bk-score-no']));
  await roleNow(page, 'manager');
  ok('a manager who turned it off has no row', (await page.locator('.bk-score').count()) === 0);
  await setKey(page, 'tourbook-ask-seen', null);
  await roleNow(page, 'producer');
  ok('a producer, asked by default, has the row', (await page.locator('#bk-score').count()) === 1);
  await roleNow(page, 'band');
  ok('a band with the setting unset has no row', (await page.locator('.bk-score').count()) === 0 && !(await bkSteps(page)).some(x => x[0] === 'Score this show'));
  // …unless the show was answered No before (as another role, or before the question was turned off): the calendar
  // goes on saying Didn’t go, so the row stays, and it is where that answer is taken back.
  await page.evaluate(() => import('./js/model.js').then(m => m.markWent('q-b', true))); await sleep(400);
  ok('…but a show answered No before keeps its row: Didn’t go, with Change, and nothing to score', (await page.locator('.bk-score-went .bk-score-text').innerText()) === 'Didn’t go' && same(await page.$$eval('.bk-score button', bs => bs.map(b => b.id)), ['bk-score-change']));
  step = (await bkSteps(page)).find(x => x[0] === 'Didn’t go');
  ok('…its walkthrough step says what Change does, and nothing about a score', !!step && step[1] === 'You said you missed this show, so it is not counted as seen. Change takes that answer back.' && !(await bkSteps(page)).some(x => x[0] === 'Score this show'), step && step[1]);
  await page.focus('#bk-score-change'); await page.keyboard.press('Enter'); await sleep(500);
  ok('…Change takes it back: the row goes (a band is not asked) and the focus moves to the act above it, not nowhere', !('went' in (await rec(page, 'bookings', 'q-b'))) && (await page.locator('.bk-score').count()) === 0 && await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('bk-act')), await focusId(page));
  await setKey(page, 'tourbook-ask-seen', 'on');
  await page.evaluate(() => import('./js/store.js').then(s => s.redraw())); await sleep(300);
  ok('a band that chose to be asked has it', same(await page.$$eval('.bk-score button', bs => bs.map(b => b.id)), ['bk-score', 'bk-score-no']));
  await setKey(page, 'tourbook-ask-seen', null);
  await roleNow(page, 'all');

  /* the acts page */
  await go(page, 'acts');
  if ((await page.getAttribute('#ac-grp-rock', 'aria-expanded')) === 'false') { await page.click('#ac-grp-rock'); await sleep(300); } // the sample puts the list in main genres (item 12)
  await page.waitForSelector('.ac-card[data-id="s-owls"]');
  if (!(await page.locator('#ac-pnl-s-owls').count())) { await page.click('#ac-head-s-owls'); await sleep(300); } // scoring left the card open
  await page.click('#ac-past-s-owls');
  await page.waitForSelector('.sheet[aria-label="From a past show"]');
  const picks = (await page.locator('.ac-pick').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
  ok('From a past show leaves out the show marked Didn’t go (and offers the one from three weeks ago)', picks.length === 1 && /Harbour Hall/.test(picks[0]), picks.join(' | '));
  await esc(page);
  await page.click('#ac-log-s-owls');
  await logForm(page).waitFor();
  await logForm(page).locator('[data-key=date]').fill(d6);
  await logForm(page).locator('[data-key=rating]').fill('70');
  await logForm(page).locator('button[type=submit]').click(); await sleep(400);
  owls = await rec(page, 'acts', 's-owls');
  ok('a score logged from the act’s card for that night replaces Didn’t go', !('went' in (await rec(page, 'bookings', 'q-c'))) && owls.seen.some(e => e.bookingId === 'q-c' && e.rating === 70), JSON.stringify(owls.seen.slice(-1)));
  await openB(page, 'q-c');
  ok('…and the show’s page reads the score', /Scored 70\/100/.test(await page.locator('.bk-score').innerText()) && (await page.locator('.bk-score-went').count()) === 0);

  /* the next opens */
  sheets = await loadAsked(page);
  ok('the next open lists only the show still unanswered', same(sheets, [QUESTION]) && same(await rowIds(page), ['q-b']), (await rowIds(page)).join(','));
  await page.click('#ac-ask-no-q-b'); await sleep(300);
  await esc(page);
  ok('Escape closes the sheet, the answer kept', (await sheetsOf(page)).length === 0 && (await rec(page, 'bookings', 'q-b')).went === 'no' && (await focusId(page)) === 'page');
  sheets = await loadQuiet(page);
  ok('with every show answered, nothing is asked', sheets.length === 0 && (await waitingIds(page, true)).length === 0, sheets.join(' | '));

  ok('the sheet: no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  return errors;
}

/* ---------------- who is asked, and about which shows; askAtOpen called by hand; the three menus ---------------- */
async function whoIsAsked() {
  const { browser, page, errors } = await open({ ask: true });
  const show = (id, extra = {}) => ({ id, kind: 'show', status: 'confirmed', actId: 'w-act', venueName: 'The Hall', ...extra });
  await store(page, s => { s.upsert('acts', { id: 'w-act', name: 'Wolf Hour' }); });
  await put(page, [
    show('w-15', { date: dayIso(-15) }), { ...show('w-ses', { date: dayIso(-2) }), kind: 'session' }, show('w-off', { date: dayIso(-2), status: 'cancelled' }),
    show('w-none', { date: dayIso(-2), actId: '' }), show('w-gone', { date: dayIso(-2), actId: 'w-deleted' }), show('w-soon', { date: dayIso(2) }),
  ]);
  let sheets = await loadQuiet(page);
  ok('nothing is asked about a show 15 days old, a session, a cancelled show, a show with no act or with an act that was deleted, or a show to come', sheets.length === 0, sheets.join(' | '));
  // 13 days, not the 14 of the rule's edge: this block runs on the real clock, and a run that crosses midnight must not
  // change who is asked (the edge itself, day 14 in and day 15 out, is checked with a fixed clock in 07-groundwork).
  await put(page, [show('w-13', { date: dayIso(-13) }), show('w-2', { date: dayIso(-2) })]);
  sheets = await loadAsked(page);
  ok('a show two days old and one 13 days old are asked about, and only those', same(sheets, [QUESTION]) && same(await rowIds(page), ['w-2', 'w-13']), (await rowIds(page)).join(','));
  const dbJson = await page.evaluate(() => localStorage.getItem('tourbook-db-v1')); // for the first open below: these two shows waiting

  /* a row whose show is deleted goes; the last one closes the sheet */
  await store(page, s => { s.remove('bookings', 'w-15'); }); await sleep(200);
  ok('a change elsewhere leaves the rows as they are', same(await rowIds(page), ['w-2', 'w-13']) && (await focusId(page)) === 'ac-ask-yes-w-2', await focusId(page));
  const kept = await rec(page, 'bookings', 'w-2');
  await store(page, s => { s.remove('bookings', 'w-2'); }); await sleep(200);
  ok('a row whose show was deleted goes, the focus on the row that is left', same(await rowIds(page), ['w-13']) && (await focusId(page)) === 'ac-ask-yes-w-13', await focusId(page));
  const kept14 = await rec(page, 'bookings', 'w-13');
  await store(page, s => { s.remove('bookings', 'w-13'); }); await sleep(250);
  ok('with no row left the sheet closes', (await sheetsOf(page)).length === 0 && await page.evaluate(() => document.getElementById('app').inert === false));
  await put(page, [kept, kept14]);

  /* the setting, and each role */
  await setKey(page, 'tourbook-ask-seen', 'off');
  ok('with the question turned off: no sheet', (await loadQuiet(page)).length === 0);
  await setKey(page, 'tourbook-ask-seen', null);
  for (const id of ['producer', 'manager', 'scout', 'audiophile']) {
    await setKey(page, 'tourbook-role', id);
    sheets = await loadAsked(page);
    ok(`${id}: asked`, same(sheets, [QUESTION]) && same(await rowIds(page), ['w-2', 'w-13']), sheets.join(' | '));
  }
  for (const id of ['band', 'solo']) {
    await setKey(page, 'tourbook-role', id);
    ok(`${id}: not asked`, (await loadQuiet(page)).length === 0);
  }
  await setKey(page, 'tourbook-ask-seen', 'on');
  sheets = await loadAsked(page);
  ok('a band that chose Always ask is asked', same(sheets, [QUESTION]) && (await rowIds(page)).length === 2, sheets.join(' | '));
  await setKey(page, 'tourbook-ask-seen', 'off'); await setKey(page, 'tourbook-role', 'scout');
  ok('a scout who chose Never ask is not', (await loadQuiet(page)).length === 0);
  await setKey(page, 'tourbook-ask-seen', null);

  /* holds and offers: by role */
  await store(page, s => { s.patch('bookings', 'w-2', { status: 'hold' }); s.patch('bookings', 'w-13', { status: 'offer' }); }); await sleep(200);
  await setKey(page, 'tourbook-role', 'manager');
  ok('a manager is not asked about a hold or an offer (they never happened)', (await loadQuiet(page)).length === 0);
  await setKey(page, 'tourbook-role', 'scout');
  sheets = await loadAsked(page);
  ok('a scout is (no money, so no holds to tell apart)', same(sheets, [QUESTION]) && same(await rowIds(page), ['w-2', 'w-13']), (await rowIds(page)).join(','));
  await store(page, s => { s.patch('bookings', 'w-13', { status: 'confirmed' }); }); await sleep(200);
  await setKey(page, 'tourbook-role', 'manager');
  sheets = await loadAsked(page);
  ok('a manager with one hold and one confirmed show is asked about the confirmed one only', same(sheets, [QUESTION]) && same(await rowIds(page), ['w-13']), (await rowIds(page)).join(','));
  await page.click(`${Q} [aria-label="Close"]`); await sleep(250);
  ok('✕ closes it', (await sheetsOf(page)).length === 0);
  await store(page, s => { s.patch('bookings', 'w-2', { status: 'confirmed' }); }); await sleep(200);
  await setKey(page, 'tourbook-role', null);

  /* askAtOpen by hand: once per call, never two sheets, nothing when there is nothing to ask */
  await loadAsked(page); await esc(page);
  const call = async ids => { await page.evaluate(x => import('./js/acts-ask.js').then(m => m.askAtOpen(x)), ids); return sheetsOf(page); };
  ok('askAtOpen with no ids, ids that are not bookings, or a show that is not waiting: nothing', (await call([])).length === 0 && (await call(['nope'])).length === 0 && (await call(['w-soon', 'w-off', 'w-none'])).length === 0 && (await call(null)).length === 0);
  await setKey(page, 'tourbook-ask-seen', 'off');
  ok('…nor for someone who is not asked', (await call(['w-2'])).length === 0);
  await setKey(page, 'tourbook-ask-seen', null);
  ok('askAtOpen opens its sheet before it returns, for the ids it was given and no others', same(await call(['w-2']), [QUESTION]) && same(await rowIds(page), ['w-2']));
  const helpLine = () => page.locator(`${Q} .ac-ask > p`).innerText();
  ok('…one show: its line of help speaks of that show alone', (await helpLine()) === 'This show is over. Tap Yes if you saw it and give a score, or No if you missed it. Close this any time: until you answer, Tourbook asks again for two weeks after the show.', await helpLine());
  ok('called again while the sheet is up: nothing happens (never two sheets)', same(await call(['w-2', 'w-13']), [QUESTION]) && same(await rowIds(page), ['w-2']));
  await esc(page);
  ok('called again after it was closed: it opens again, the newest show first whatever the order given', same(await call(['w-13', 'w-2']), [QUESTION]) && same(await rowIds(page), ['w-2', 'w-13']));
  await sleep(150);
  ok('…with the focus on the first Yes', (await focusId(page)) === 'ac-ask-yes-w-2', await focusId(page));
  ok('…two shows: the line of help speaks of them all', (await helpLine()) === 'These shows are over. Tap Yes for the ones you saw and give a score, or No for the ones you missed. Close this any time: Tourbook asks again about the rest for two weeks after each show.', await helpLine());
  await esc(page);

  /* whichever section menu is in use */
  for (const menu of ['tape', 'digital', 'record']) {
    await setKey(page, 'tourbook-prefs', JSON.stringify({ menu }));
    sheets = await loadAsked(page);
    await page.keyboard.press('ArrowRight'); await sleep(400);
    const held = (await page.evaluate(() => window.logiPage())) === 'bookings';
    await esc(page);
    await page.keyboard.press('ArrowRight'); await sleep(500);
    ok(`${menu} menu: the sheet opens, the menu’s arrow keys are off under it and back when it closes`, same(sheets, [QUESTION]) && held && (await sheetsOf(page)).length === 0 && (await page.evaluate(() => window.logiPage())) !== 'bookings', `${sheets.join('|')} ${held} ${await page.evaluate(() => window.logiPage())}`);
  }
  await setKey(page, 'tourbook-prefs', null);

  /* the sleeve opened in the first second: the question waits its turn */
  await fresh(page);
  await page.locator('#deck .dk-record').click();
  await page.waitForSelector('.sheet[aria-label="The sleeve"]');
  await sleep(1900);
  ok('the sleeve opened in the first second: nothing opens over it', same(await sheetsOf(page), ['The sleeve']), (await sheetsOf(page)).join(' | '));
  await esc(page);
  await page.locator(Q).waitFor({ timeout: 4000 }).catch(() => {});
  ok('…and the question opens on its own once the sleeve is closed', same(await sheetsOf(page), [QUESTION]) && same(await rowIds(page), ['w-2', 'w-13']), (await sheetsOf(page)).join(' | '));
  await esc(page);

  /* Settings → Your role */
  await go(page, 'settings');
  await page.waitForSelector('#se-role');
  if (!(await page.$eval('#se-role', d => d.open))) { await page.click('#se-role-sum'); await sleep(200); }
  const pref = () => page.evaluate(() => ({
    on: [...document.querySelectorAll('.ac-ask-pref .seg button')].map(b => `${b.id}:${b.getAttribute('aria-pressed')}:${b.classList.contains('on')}`).join(' '),
    note: document.querySelector('.ac-ask-pref .ac-ask-note').textContent, key: localStorage.getItem('tourbook-ask-seen'),
    focus: document.activeElement && document.activeElement.id,
  }));
  ok('Your role has the control, a named group under the role cards', (await page.locator('#se-role .rp-panel + .ac-ask-pref[role=group][aria-label="Ask after a show"]').count()) === 1
    && (await page.locator('.ac-ask-pref .pref-label').innerText()) === 'After a show, ask “Did you see them?”'
    && same(await page.$$eval('.ac-ask-pref .seg.wide button', bs => bs.map(b => b.textContent)), ['Follow my role', 'Always ask', 'Never ask']));
  // Each choice's box, and whether its words fit inside it.
  const boxes = () => page.$$eval('.ac-ask-pref .seg button', bs => bs.map(b => { const r = b.getBoundingClientRect(), t = document.createRange(); t.selectNodeContents(b); const w = t.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), fits: w.left >= r.left - 0.5 && w.right <= r.right + 0.5 && b.scrollWidth <= b.clientWidth + 1 }; }));
  const boxesAuto = await boxes();
  ok('each choice’s words fit inside its button', boxesAuto.length === 3 && boxesAuto.every(b => b.fits), JSON.stringify(boxesAuto));
  let P = await pref();
  ok('unset, it follows the role, and says Everything is asked', P.on === 'ac-ask-auto:true:true ac-ask-on:false:false ac-ask-off:false:false' && P.key === null
    && P.note === 'Your role is asked: when Tourbook opens, it lists the shows that have finished so you can score the ones you saw.', JSON.stringify(P));
  await page.click('#ac-ask-off'); await sleep(150);
  P = await pref();
  ok('Never ask writes off, shows as pressed, keeps the focus and says what still works', P.key === 'off' && P.on === 'ac-ask-auto:false:false ac-ask-on:false:false ac-ask-off:true:true' && P.focus === 'ac-ask-off'
    && P.note === 'Tourbook never asks. You can still score a show from the act’s card.', JSON.stringify(P)); // Everything has ★ Score on a show's page only while it is asked
  await page.focus('#ac-ask-on'); await page.keyboard.press('Enter'); await sleep(150);
  P = await pref();
  ok('Always ask (with the keyboard) writes on', P.key === 'on' && P.on === 'ac-ask-auto:false:false ac-ask-on:true:true ac-ask-off:false:false' && P.focus === 'ac-ask-on'
    && P.note === 'Tourbook asks about every show that has finished, for two weeks after it.', JSON.stringify(P));
  const boxesOn = await boxes();
  await page.click('#ac-ask-auto'); await sleep(150);
  ok('the buttons do not move or change size when the choice changes (the one in use is bold)', same(boxesOn, boxesAuto) && same(await boxes(), boxesAuto), `${JSON.stringify(boxesOn)} / ${JSON.stringify(boxesAuto)}`);
  P = await pref();
  ok('Follow my role removes the setting', P.key === null && P.on.startsWith('ac-ask-auto:true:true') && P.focus === 'ac-ask-auto', JSON.stringify(P));
  await roleNow(page, 'band');
  P = await pref();
  ok('for a band the note says the role is not asked, and how to be', P.note === 'Your role is not asked. Choose Always ask to be asked anyway.' && P.on.startsWith('ac-ask-auto:true:true'), JSON.stringify(P));
  ok('still eight sections (no sample on this device, so no Sample data), one group of role cards with seven choices, and no radio among the three buttons', (await page.locator('#page details.se-sec').count()) === 8 && (await page.locator('#se-role [role=radiogroup]').count()) === 1
    && (await page.locator('#se-role [role=radio]').count()) === 7 && (await page.locator('.ac-ask-pref [role=radio]').count()) === 0);
  await roleNow(page, 'scout');
  await page.click('#ac-ask-off'); await sleep(150);
  P = await pref();
  ok('for a scout, who keeps ★ Score on a show’s own page whatever is chosen here, Never ask names that page too', P.note === 'Tourbook never asks. You can still score a show from its own page or the act’s card.' && P.key === 'off', JSON.stringify(P));
  await page.click('#ac-ask-auto'); await sleep(150);
  await roleNow(page, 'all');
  await page.click('#ac-ask-off'); await sleep(150);
  ok('Never ask chosen in Settings: the next open asks nothing', (await loadQuiet(page)).length === 0 && (await waitingIds(page)).length === 2);
  await setKey(page, 'tourbook-ask-seen', null);

  ok('who is asked: no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  return { errors, dbJson };
}

/* ---------------- the first open with shows already there: the role question, the tour, then the question ---------------- */
// A browser without the helper's presets. The database is put in only while the device has none, so an answer
// given here is still there after a reload.
async function firstOpen(dbJson) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
  await licenceLeg(ctx);
  await ctx.addInitScript(data => {
    try { if (!localStorage.getItem('tourbook-db-v1')) localStorage.setItem('tourbook-db-v1', data); } catch (e) { /* ignore */ }
    // the most sheets and tours on screen at one time, in this load
    window.__most = 0;
    new MutationObserver(() => { const n = document.querySelectorAll('.sheet-back, .tour').length; if (n > window.__most) window.__most = n; }).observe(document, { childList: true, subtree: true });
  }, dbJson);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForSelector('.rp-ask');
  await sleep(1800);
  ok('a first open with two shows waiting: the role question comes first, alone', same(await sheetsOf(page), ['Who’s using Tourbook?']) && (await tours(page)) === 0, (await sheetsOf(page)).join(' | '));
  await page.click('.rp-card[data-role="scout"]');
  await page.waitForSelector('.tour-card');
  await sleep(1500);
  ok('…then the welcome tour, with nothing over it', (await sheetsOf(page)).length === 0 && (await tours(page)) === 1, (await sheetsOf(page)).join(' | '));
  for (let i = 0; i < 5; i++) { await page.click('.tour-actions .btn.primary'); await sleep(900); } // on to the acts page's card (past the search box's stop)
  const skippedOn = await page.evaluate(() => window.logiPage());
  await page.click('.tour-actions .btn.ghost.small'); // Skip
  await page.locator(Q).waitFor({ timeout: 4000 }).catch(() => {});
  await sleep(200);
  ok('…and only after Skip, “Did you see them?”, with both shows', same(await sheetsOf(page), [QUESTION]) && (await tours(page)) === 0 && same(await rowIds(page), ['w-2', 'w-13']), (await sheetsOf(page)).join(' | '));
  ok('…asked over the calendar, where the first-run tour ends (it was on another section when skipped)', skippedOn !== 'bookings' && (await page.evaluate(() => window.logiPage())) === 'bookings' && (await page.locator('#page .bk-calview').count()) === 1, `${skippedOn} → ${await page.evaluate(() => window.logiPage())}`);
  ok('…never two of them at once', (await page.evaluate(() => window.__most)) === 1, String(await page.evaluate(() => window.__most)));
  ok('…with the focus on the first Yes', (await focusId(page)) === 'ac-ask-yes-w-2', await focusId(page));
  await page.click('#ac-ask-no-w-2'); await sleep(300);
  await page.click('#ac-ask-close'); await sleep(300);
  const sheets = await loadAsked(page);
  ok('the next open goes straight to the question, about the show still unanswered', same(sheets, [QUESTION]) && same(await rowIds(page), ['w-13']) && (await page.evaluate(() => window.__most)) === 1, `${sheets.join(' | ')} ${(await rowIds(page)).join(',')}`);
  ok('the first open: no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  return errors;
}

/* ---------------- a narrow phone with extra-large text and big buttons ---------------- */
async function narrow() {
  const { browser, page, errors } = await open({ sample: true, ask: true, viewport: { width: 320, height: 700 } });
  await setKey(page, 'tourbook-prefs', JSON.stringify({ text: 'xlarge', targets: 'large' }));
  await put(page, [
    { id: 'n-a', kind: 'show', status: 'confirmed', actId: 's-owls', date: dayIso(-2), venueName: 'The Extraordinarily Long-Named Working Men’s Club and Institute' },
    { id: 'n-b', kind: 'show', status: 'confirmed', actId: 's-sablea', date: dayIso(-4), endDate: dayIso(-3), venueId: 's-greenfield' },
    { id: 'n-c', kind: 'show', status: 'confirmed', actId: 's-owls', date: dayIso(-7), venueId: 's-harbour' },
  ]);
  const sheets = await loadAsked(page);
  // What is wider than the screen, or than the sheet's own body.
  const wide = sel => page.evaluate(sel => {
    const out = [...document.querySelectorAll(sel)].filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map(el => (el.id || el.className) + ' ' + Math.round(el.getBoundingClientRect().right));
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page ' + document.documentElement.scrollWidth);
    const body = document.querySelector('.sheet-body'); if (body && body.scrollWidth > body.clientWidth + 1) out.push('sheet ' + body.scrollWidth);
    return out;
  }, sel);
  ok('320 px, extra-large text, big buttons: the sheet opens', same(sheets, [QUESTION]) && await page.evaluate(() => document.documentElement.dataset.text === 'xlarge' && document.documentElement.dataset.targets === 'large'));
  let w = await wide('.sheet, .sheet .ac-ask-row, .sheet .ac-ask-main, .sheet button');
  ok('…and nothing in it is wider than the screen or scrolls sideways', w.length === 0, w.join(' | '));
  const under = await page.$$eval('.sheet .ac-ask-row', rs => rs.map(r => r.querySelector('.ac-ask-answer').getBoundingClientRect().top >= r.querySelector('.ac-ask-main').getBoundingClientRect().bottom - 1));
  ok('…a row’s buttons sit under its words, Yes and No side by side', under.length === 3 && under.every(Boolean)
    && await page.evaluate(() => Math.abs(document.getElementById('ac-ask-yes-n-a').getBoundingClientRect().top - document.getElementById('ac-ask-no-n-a').getBoundingClientRect().top) < 2), under.join(','));
  const small = await page.evaluate(() => { const need = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit')); return [need, ...[...document.querySelectorAll('.sheet .ac-ask-row .btn, #ac-ask-close')].map(b => Math.round(b.getBoundingClientRect().height)).filter(x => x < need)]; });
  ok('…each as tall as the big-button setting asks', small[0] >= 54 && small.length === 1, small.join(','));
  await page.click('#ac-ask-no-n-b'); await sleep(250);
  await page.click('#ac-ask-yes-n-a');
  await logForm(page).waitFor();
  await logForm(page).locator('[data-key=rating]').fill('100');
  await logForm(page).locator('button[type=submit]').click(); await sleep(400);
  w = await wide('.sheet, .sheet .ac-ask-row, .sheet .ac-ask-main, .sheet .ac-ask-answer, .sheet .ac-ask-done, .sheet button');
  ok('…and still nothing once a row reads Scored 100/100 and another Didn’t go', w.length === 0 && /Scored 100\/100/.test(await rowText(page, 'n-a')) && /Didn’t go/.test(await rowText(page, 'n-b')), w.join(' | '));
  await page.click('#ac-ask-close'); await sleep(250);
  await openB(page, 'n-c');
  w = await wide('.bk-score, .bk-score button');
  ok('the show’s page at that size: Score and Didn’t go stay on the screen', w.length === 0 && (await page.locator('#bk-score-no').count()) === 1, w.join(' | '));
  await page.click('#bk-score-no'); await sleep(500);
  w = await wide('.bk-score, .bk-score button, .bk-score-text');
  ok('…and so do Didn’t go and Change', w.length === 0 && (await page.locator('#bk-score-change').count()) === 1, w.join(' | '));
  await go(page, 'settings');
  await page.waitForSelector('#se-role');
  if (!(await page.$eval('#se-role', d => d.open))) { await page.click('#se-role-sum'); await sleep(200); }
  w = await wide('.ac-ask-pref, .ac-ask-pref button, .ac-ask-pref .ac-ask-note, .ac-ask-pref .pref-label');
  ok('the Settings control at that size does not scroll sideways', w.length === 0 && (await page.locator('.ac-ask-pref .seg button').count()) === 3, w.join(' | '));
  const lines = await page.$$eval('.ac-ask-pref .seg button', bs => bs.map(b => { const r = document.createRange(); r.selectNodeContents(b); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; }));
  ok('…and no choice is broken inside a word (each on one line)', same(lines, [1, 1, 1]), lines.join(','));
  ok('a narrow phone: no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  return errors;
}

/* ---------------- the real sheet when Tourbook comes back (the page's clock set by hand, as in the first block) ---------------- */
async function comingBack() {
  const { browser, page, errors } = await open({ ask: true, init });
  const { setClock, away } = clockKit(page);
  const show = (extra = {}) => ({ kind: 'show', status: 'confirmed', actId: 'k-act', venueName: 'Typed Hall', ...extra });
  await setClock(BASE);
  await store(page, (s, d) => {
    s.upsert('acts', { id: 'k-act', name: 'Clockwork' });
    s.upsert('bookings', { ...d.show, id: 'k-old', date: d.old });
    s.upsert('bookings', { ...d.show, id: 'k-late', date: d.today, setTime: '12:00', setLength: 60 });
    s.upsert('bookings', { ...d.show, id: 'k-night', date: d.today, doors: '22:00', curfew: '06:00' }); // an all-nighter tonight: over at 06:00 tomorrow
    s.upsert('bookings', { ...d.show, id: 'k-dawn', date: d.today, curfew: '06:00' }); // a curfew of 06:00 and nothing else: the same
  }, { show: show(), old: day(-2), today: day(0) });
  await sleep(200);
  await setClock(BASE);
  let sheets = await loadAsked(page);
  ok('the real sheet, 08:00: it asks about the show that is over', same(sheets, [QUESTION]) && same(await rowIds(page), ['k-old']), (await rowIds(page)).join(','));
  ok('…and not about tonight’s all-nighter (doors 22:00, curfew 06:00) nor a show with only a curfew of 06:00: they end tomorrow morning', !(await rowIds(page)).some(id => ['k-night', 'k-dawn'].includes(id)), (await rowIds(page)).join(','));
  await away(240);
  ok('back after 4 h with the question still on screen: still one sheet, as it was', same(await sheetsOf(page), [QUESTION]) && same(await rowIds(page), ['k-old']), (await sheetsOf(page)).join(' | '));
  await esc(page); await sleep(800);
  ok('…and closing it does not bring it back', (await sheetsOf(page)).length === 0);
  await away(181);
  ok('back after another 3 h 1 min: asked again in the same visit, the show that ended meanwhile first', same(await sheetsOf(page), [QUESTION]) && same(await rowIds(page), ['k-late', 'k-old']), (await rowIds(page)).join(','));
  await page.click('#ac-ask-yes-k-old');
  await logForm(page).waitFor();
  await away(240);
  ok('back after 4 h with the score form open over the question: nothing more opens', same(await sheetsOf(page), [QUESTION, 'Log a time seen']), (await sheetsOf(page)).join(' | '));
  await logForm(page).locator('[data-key=rating]').fill('70');
  await logForm(page).locator('button[type=submit]').click(); await sleep(400);
  await page.click('#ac-ask-no-k-late'); await sleep(300);
  ok('…both answered there', /Scored 70\/100/.test(await rowText(page, 'k-old')) && /Didn’t go/.test(await rowText(page, 'k-late')) && same(await sheetsOf(page), [QUESTION]));
  await page.click('#ac-ask-close'); await sleep(300);
  await away(181);
  ok('with every show answered, coming back asks nothing', (await sheetsOf(page)).length === 0);
  ok('coming back: no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  return errors;
}

/* ---------------- slips of the hand: a double press, a held Enter key; and a log with junk in it ---------------- */
// An answer puts another button where the one pressed was (No becomes Change, Change becomes Yes and No), so a second
// press must not land on it and take the answer straight back, and a held Enter must not go on to press whatever comes
// next: held on Yes it would save the form as it opens, with a score nobody gave. keyboard.down on a key that is
// already down is a repeat, as the browser sends them while a key is held.
async function slips() {
  const { browser, page, errors } = await open({ ask: true });
  const show = (id, n, venueName) => ({ id, kind: 'show', status: 'confirmed', actId: 'x-act', date: dayIso(n), venueName });
  await store(page, s => { s.upsert('acts', { id: 'x-act', name: 'Slow Hands', seen: [null, { id: 'x-empty' }] }); }); // a log from an old backup: an empty entry, and one with no date
  await put(page, [show('x-a', -2, 'One'), show('x-b', -3, 'Two'), show('x-c', -4, 'Three')]);
  const sheets = await loadAsked(page);
  ok('three shows waiting, the act’s log with junk in it: asked', same(sheets, [QUESTION]) && same(await rowIds(page), ['x-a', 'x-b', 'x-c']), (await rowIds(page)).join(','));
  const went = id => rec(page, 'bookings', id).then(b => b.went || '');
  const hold = async (n = 4, gap = 60) => { for (let i = 0; i < n; i++) { await page.keyboard.down('Enter'); await sleep(gap); } await page.keyboard.up('Enter'); await sleep(350); };

  /* a double click */
  await page.dblclick('#ac-ask-no-x-a'); await sleep(450);
  ok('a double click on No marks the show once: the second click does not land on Change and take the answer back', (await went('x-a')) === 'no' && same(await rowBtns(page, 'x-a'), ['ac-ask-change-x-a']), await rowText(page, 'x-a'));
  await page.dblclick('#ac-ask-change-x-a'); await sleep(450);
  ok('a double click on Change takes the answer back once: the second click does not answer again', (await went('x-a')) === '' && same(await rowBtns(page, 'x-a'), ['ac-ask-yes-x-a', 'ac-ask-no-x-a']) && same(await sheetsOf(page), [QUESTION]), await rowText(page, 'x-a'));
  /* a second press straight after, on a phone that does not count taps (each click says it is the first) */
  const press = id => page.evaluate(id => { const b = document.getElementById(id); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); return !!b; }, id);
  const both = await page.evaluate(() => { const press = id => { const b = document.getElementById(id); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); return !!b; }; return [press('ac-ask-no-x-b'), press('ac-ask-change-x-b')]; });
  await sleep(100);
  ok('a second press straight after No, on the Change that took its place, is ignored', same(both, [true, true]) && (await went('x-b')) === 'no' && same(await rowBtns(page, 'x-b'), ['ac-ask-change-x-b']), `${both} ${await rowText(page, 'x-b')}`);
  ok('…and though such a press gives the button no focus (the focus was on another row), the focus is on that row’s Change', (await focusId(page)) === 'ac-ask-change-x-b', await focusId(page));
  await sleep(450);
  await press('ac-ask-change-x-b'); await sleep(200);
  ok('…and a moment later Change works as ever', (await went('x-b')) === '' && same(await rowBtns(page, 'x-b'), ['ac-ask-yes-x-b', 'ac-ask-no-x-b']));

  /* a held Enter key */
  await page.focus('#ac-ask-no-x-b');
  await hold();
  ok('Enter held on No answers once: it does not go on to press Change, then Yes', (await went('x-b')) === 'no' && (await focusId(page)) === 'ac-ask-change-x-b' && same(await sheetsOf(page), [QUESTION]), `${await rowText(page, 'x-b')} / ${(await sheetsOf(page)).join(' | ')}`);
  await hold();
  ok('Enter held on Change takes the answer back once, the focus on Yes, and no form opens', (await went('x-b')) === '' && (await focusId(page)) === 'ac-ask-yes-x-b' && same(await sheetsOf(page), [QUESTION]), `${await focusId(page)} / ${(await sheetsOf(page)).join(' | ')}`);
  await page.focus('#ac-ask-yes-x-c');
  await hold(8);
  let act = await rec(page, 'acts', 'x-act');
  ok('Enter held on Yes opens the score form once and does not save it (the form opens with a score in it)', same(await sheetsOf(page), [QUESTION, 'Log a time seen']) && !act.seen.some(e => e && e.bookingId === 'x-c'), `${(await sheetsOf(page)).join(' | ')} ${JSON.stringify(act.seen)}`);
  await logForm(page).locator('[data-key=notes]').focus();
  await hold(3, 30);
  ok('…in the notes a held Enter still starts new lines', (await logForm(page).locator('[data-key=notes]').inputValue()) === '\n\n\n' && same(await sheetsOf(page), [QUESTION, 'Log a time seen']));
  await logForm(page).locator('[data-key=notes]').fill('');
  await logForm(page).locator('[data-key=rating]').fill('64');
  await page.keyboard.press('Enter'); await sleep(400);
  act = await rec(page, 'acts', 'x-act');
  ok('…and Enter pressed once saves it, into a log that had an empty entry', act.seen.some(e => e && e.bookingId === 'x-c' && e.rating === 64) && !act.seen.includes(null) && /Scored 64\/100/.test(await rowText(page, 'x-c')) && (await focusId(page)) === 'ac-ask-edit-x-c', JSON.stringify(act.seen));
  await store(page, s => { s.update(d => { d.acts.find(a => a.id === 'x-act').seen.unshift(null); }); }); await sleep(200); // the empty entry again, for the delete below
  await hold();
  ok('Enter held on ✎ Edit opens that time seen once and does not save it again', same(await sheetsOf(page), [QUESTION, 'Edit a time seen']) && (await rec(page, 'acts', 'x-act')).seen.includes(null), (await sheetsOf(page)).join(' | '));
  await editForm(page).locator('.btn.danger').click(); await sleep(400);
  act = await rec(page, 'acts', 'x-act');
  ok('…and deleting it, from a log with an empty entry, leaves the row unanswered', !act.seen.some(e => e && e.bookingId === 'x-c') && same(await rowBtns(page, 'x-c'), ['ac-ask-yes-x-c', 'ac-ask-no-x-c']) && (await focusId(page)) === 'ac-ask-yes-x-c', JSON.stringify(act.seen));
  await page.click('#ac-ask-close'); await sleep(300);

  /* the show's own page */
  await openB(page, 'x-a');
  await page.focus('#bk-score-no');
  await hold();
  ok('the show’s page: Enter held on Didn’t go answers once, the focus on Change', (await went('x-a')) === 'no' && (await focusId(page)) === 'bk-score-change' && (await sheetsOf(page)).length === 0, `${await focusId(page)} / ${(await sheetsOf(page)).join(' | ')}`);
  await hold();
  ok('…and held on Change takes it back once, the focus on ★ Score, and no form opens', (await went('x-a')) === '' && (await focusId(page)) === 'bk-score' && (await sheetsOf(page)).length === 0, `${await focusId(page)} / ${(await sheetsOf(page)).join(' | ')}`);
  await page.dblclick('#bk-score-no'); await sleep(600);
  ok('…a double click on Didn’t go marks the show once', (await went('x-a')) === 'no' && same(await page.$$eval('.bk-score button', bs => bs.map(b => b.id)), ['bk-score-change']));
  await page.evaluate(() => { document.getElementById('bk-score-change').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 })); }); await sleep(400);
  ok('…also when its second click comes after the row was redrawn, and lands on Change', (await went('x-a')) === 'no' && (await page.locator('#bk-score-change').count()) === 1);
  ok('slips of the hand: no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  return errors;
}

(async () => {
  const { browser, ctx, page, errors } = await open({ ask: true, init });
  let fetched = 0;
  await ctx.route('**/js/acts-ask.js', r => { fetched++; return r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: STAND_IN }); });

  const { setClock, sight, kept, away } = clockKit(page);
  // A fresh load at 08:00, and time for the question at open (0.9 s in) to have had its turn.
  const load = async () => { await setClock(BASE); fetched = 0; await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(1600); };
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
  ok('as Tourbook opens: asked once, about the show that is over, with nothing else on screen', same(st.asked, ['k-old']) && same(st.over, [0]) && same(st.sheets, [QUESTION]) && fetched === 1, JSON.stringify(st));

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
  ok('…and when Tourbook went out of sight is kept nowhere on the device', same(await keys(), keysBefore), JSON.stringify(await keys()));
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
  await page.evaluate(() => localStorage.setItem('tourbook-ask-seen', 'off'));
  await load();
  await away(240);
  st = await state();
  ok('with the question turned off: never asked on coming back', st.asked.length === 1 && st.sheets.length === 0, JSON.stringify(st));
  await page.evaluate(() => localStorage.removeItem('tourbook-ask-seen'));
  await away(181);
  st = await state();
  ok('…turned back on, the next time back asks', st.asked.length === 2 && same(st.sheets, [QUESTION]), JSON.stringify(st));
  await esc();
  await page.evaluate(() => localStorage.setItem('tourbook-role', 'band'));
  await load();
  await away(240);
  st = await state();
  ok('a band is not asked on coming back', st.asked.length === 1 && st.sheets.length === 0, JSON.stringify(st));
  await page.evaluate(() => localStorage.setItem('tourbook-ask-seen', 'on'));
  await away(181);
  st = await state();
  ok('…a band that chose to be asked is', st.asked.length === 2 && same(st.sheets, [QUESTION]), JSON.stringify(st));
  await esc();
  await page.evaluate(() => { localStorage.removeItem('tourbook-ask-seen'); localStorage.removeItem('tourbook-role'); });

  /* ---------------- nothing waiting as Tourbook opens; a show that ends while it is out of sight ---------------- */
  await page.evaluate(() => import('./js/model.js').then(m => m.markWent('k-old'))); await sleep(200);
  await load();
  st = await state();
  ok('nothing waiting as Tourbook opens: nothing is asked, and the question’s code is not fetched', st.asked.length === 0 && st.sheets.length === 0 && fetched === 0 && st.section === 'bookings', JSON.stringify({ ...st, fetched }));
  await away(181);
  st = await state();
  ok('back after 3 h 1 min with still nothing waiting: nothing asked, nothing fetched', st.asked.length === 0 && st.sheets.length === 0 && fetched === 0 && st.waiting.length === 0 && st.clock === '11:01', JSON.stringify({ ...st, fetched }));
  await away(181);
  st = await state();
  ok('a show that ended while Tourbook was out of sight is asked about on coming back, though nothing was due at open', same(st.asked, ['k-late']) && same(st.over, [0]) && same(st.sheets, [QUESTION]) && fetched === 1, JSON.stringify({ ...st, fetched }));
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
  ok('back after 6 h with the first-run question still up: nothing is asked over it', st.asked.length === 0 && same(st.sheets, ['Who’s using Tourbook?']) && fetched === 0, JSON.stringify({ ...st, fetched }));
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

  // The real sheet, each block in a browser of its own. The spec's last line counts every block's errors again.
  const all = [...errors, ...await theSheet()];
  const who = await whoIsAsked();
  all.push(...who.errors, ...await firstOpen(who.dbJson), ...await narrow(), ...await comingBack(), ...await slips());
  ok('no errors in the console', all.length === 0, all.slice(0, 5).join(' | '));
})().catch(e => { console.log('FAIL ask spec crashed — ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')); process.exit(1); });
