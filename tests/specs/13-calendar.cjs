// The calendar's five views (js/bookings-cal.js): Month and 2 weeks as day squares, Week as a list for each day, 3 days
// and Day as a time grid; one row of view buttons, ‹ Today › that step by the length of the view, and Coming up under
// every one. Only the view buttons save the view on the device.
// No date word is typed here: a day is read from data-date / data-day, and a title is compared with the same formatter
// run in the page. Every seeded day is counted from today in whole days, so nothing depends on the hour of the run.
const { open, ok, sleep, go } = require('../helpers.cjs');

const dayFromNow = (page, n) => page.evaluate(n => import('./js/util.js').then(u => { const d = new Date(); d.setDate(d.getDate() + n); return u.ymd(d); }), n);
const plus = (page, iso, n) => page.evaluate(([iso, n]) => import('./js/util.js').then(u => { const d = u.parseISO(iso); d.setDate(d.getDate() + n); return u.ymd(d); }), [iso, n]);
const put = (page, list, rec) => page.evaluate(([l, r]) => import('./js/store.js').then(s => s.upsert(l, r).id), [list, rec]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sheetNamed = (page, title) => page.locator(`.sheet[aria-label="${title}"]`);
const view = async (page, v) => { await page.click('#bk-view-' + v); await sleep(250); };
const modeOf = page => page.evaluate(() => (document.querySelector('.bk-calview').className.match(/bk-mode-(\w+)/) || [])[1]);
const title = page => page.locator('.bk-cal-panel .cal-title').evaluate(el => el.textContent);
const saved = page => page.evaluate(() => localStorage.getItem('gdex-cal-view'));
const steps = page => page.evaluate(() => import('./js/pages/bookings.js').then(m => m.bookings.tutorial().map(s => [s.title, s.text, s.target])));
// The first day a view shows (the Day view has none to read when the day is empty: its title says the day).
const firstDay = page => page.evaluate(() => { const el = document.querySelector('.bk-cal .bk-day, .bk-wday-head, .bk-grid-head'); return el ? el.dataset.date : null; });
// What the title of a view must read, from the device's own formatters: the month and its year, a range of days (with
// the year when it is not all in this year), or the day in full.
const wantTitle = (page, v, first, last) => page.evaluate(([v, first, last]) => import('./js/util.js').then(u => {
  const a = u.parseISO(first), b = u.parseISO(last), now = new Date().getFullYear();
  if (v === 'month') return a.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (v === 'day') return u.fmtLong(first);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', ...(a.getFullYear() !== now || b.getFullYear() !== now ? { year: 'numeric' } : {}) }).formatRange(a, b);
}), [v, first, last]);
const monday = (page, iso) => page.evaluate(iso => import('./js/util.js').then(u => { const d = u.parseISO(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return u.ymd(d); }), iso);
const monthOf = (page, iso, n = 0) => page.evaluate(([iso, n]) => import('./js/util.js').then(u => { const d = u.parseISO(iso); return [u.ymd(new Date(d.getFullYear(), d.getMonth() + n, 1)), u.ymd(new Date(d.getFullYear(), d.getMonth() + n + 1, 0))]; }), [iso, n]);
// Step a view on (or back) until something for the day is on screen.
async function reach(page, sel, label) { for (let i = 0; i < 30 && !(await page.locator(sel).count()); i++) { await page.click(`[aria-label="${label}"]`); await sleep(120); } return (await page.locator(sel).count()) > 0; }
// The Week view on the week of a day (from this week, on or back a week at a time); the Day view on a day, opened by
// its name in the week, as a person gets there.
async function toWeek(page, iso, back = false) {
  await view(page, 'week'); await page.waitForSelector('.bk-week');
  if (await page.locator(`#bk-wd-${iso}`).count()) return true;
  await page.click('[aria-label="This week"]'); await sleep(150);
  return reach(page, `#bk-wd-${iso}`, back ? 'Previous week' : 'Next week');
}
async function toDay(page, iso, back = false) { await toWeek(page, iso, back); await page.click(`#bk-wd-${iso}`); await page.waitForSelector('.bk-dayview'); await sleep(200); }
// What a block or pill must tell a screen reader, from the model: the status, the overlap note, the venue's house
// rules as spoken (the sample's venues have some) and, when asked for, “Didn’t go”; each with a full stop.
const wantSaid = (page, id, { lead = '', went = false } = {}) => page.evaluate(([id, lead, went]) => Promise.all([import('./js/model.js'), import('./js/store.js')]).then(([m, st]) => {
  const b = st.byId('bookings', id);
  return [lead, m.statusLabel(b.status), m.overlapText(b), (m.rulesChipText(m.showRulesVenue(b)) || {}).spoken, went && 'Didn’t go'].filter(Boolean).map(x => x + '.').join(' ');
}), [id, lead, went]);
const weekIds = (page, iso) => page.locator(`.bk-wday:has(#bk-wd-${iso}) .bk-ev`).evaluateAll(els => els.map(e => e.dataset.id));
const NAV = {
  month: ['Previous month', 'This month', 'Next month'], two: ['Previous two weeks', 'These two weeks', 'Next two weeks'], week: ['Previous week', 'This week', 'Next week'],
  three: ['Previous three days', 'From today', 'Next three days'], day: ['Previous day', 'Today', 'Next day'],
};
const LEN = { two: 14, week: 7, three: 3, day: 1 };
async function press(page, loc, ms) {
  await loc.scrollIntoViewIfNeeded(); await sleep(200);
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(30, b.height / 2)); await page.mouse.down(); await sleep(ms);
}

(async () => {
  /* ------------------------------ an empty diary: the frame, the buttons, the steps ------------------------------ */
  {
    const { browser, page, errors } = await open();
    await page.waitForSelector('.bk-monthview');
    const today = await dayFromNow(page, 0);
    const btns = await page.locator('.bk-views button').evaluateAll(els => els.map(e => [e.id, e.textContent, e.getAttribute('aria-pressed'), e.classList.contains('on')]));
    ok('a fresh device opens on Month, with five view buttons and Month pressed', same(btns, [['bk-view-month', 'Month', 'true', true], ['bk-view-two', '2 weeks', 'false', false], ['bk-view-week', 'Week', 'false', false], ['bk-view-three', '3 days', 'false', false], ['bk-view-day', 'Day', 'false', false]])
      && (await page.getAttribute('.bk-views', 'role')) === 'group' && (await page.getAttribute('.bk-views', 'aria-label')) === 'Calendar view', JSON.stringify(btns));
    ok('…and nothing is saved about the view yet', (await saved(page)) === null);

    // A day opened from its square is the Day view for this visit; it is not the view Gdex opens on next time.
    await page.locator(`.bk-day[data-date="${today}"]`).click(); await page.waitForSelector('.bk-dayview');
    ok('tapping a day square opens the Day view on that day, with the focus on its name', (await modeOf(page)) === 'day' && (await title(page)) === (await wantTitle(page, 'day', today, today)) + ' · today'
      && await page.evaluate(() => document.activeElement && document.activeElement.matches('h2.cal-title[data-view-head]')) && (await page.getAttribute('#bk-view-day', 'aria-pressed')) === 'true', await title(page));
    ok('…and that is not saved', (await saved(page)) === null);
    await page.reload(); await page.waitForSelector('#deck .dk-next'); await page.waitForSelector('.bk-calview');
    ok('after a reload Gdex opens on Month again', (await modeOf(page)) === 'month' && (await page.locator('.bk-monthview').count()) === 1);

    // each button draws its view, saves it and keeps the focus; the frame is the same around every view
    for (const v of ['two', 'week', 'three', 'day', 'month']) {
      await view(page, v);
      const at = await page.evaluate(() => {
        const root = document.querySelector('.bk-calview'), panel = root.querySelector('.bk-cal-panel');
        return {
          focus: document.activeElement && document.activeElement.id, pressed: [...root.querySelectorAll('.bk-views [aria-pressed="true"]')].map(b => b.id),
          kids: [...root.children].map(c => c.className.split(' ')[0]), panel: [...panel.children].map(c => c.className.split(' ')[0]),
          month: document.querySelectorAll('.bk-monthview').length, day: document.querySelectorAll('.bk-dayview').length,
          heads: [...root.querySelectorAll('[data-view-head]')].map(e => e.tagName), empties: root.querySelectorAll('.empty').length, agenda: (root.querySelector('.bk-agenda-head') || {}).textContent,
          roles: root.querySelectorAll('[role=tab], [role=tablist], [role=grid]').length, nav: [...panel.querySelectorAll('.cal-nav button')].map(b => b.getAttribute('aria-label')),
          todayText: panel.querySelector('.cal-nav .btn').textContent, legend: panel.querySelectorAll('.bk-legend').length, live: panel.querySelector('.cal-title').getAttribute('aria-live'),
        };
      });
      ok(`${v}: the button draws its view, is pressed, keeps the focus and saves the view`, (await modeOf(page)) === v && at.focus === 'bk-view-' + v && same(at.pressed, ['bk-view-' + v]) && (await saved(page)) === v, JSON.stringify(at));
      ok(`${v}: the head, the calendar panel (buttons, ‹ Today ›, the view) and Coming up, in that order`, same(at.kids, ['page-head', 'cal-panel', 'bk-agenda-head', 'empty']) && same(at.panel.slice(0, 3), ['bk-views', 'cal-nav', 'bk-body']) && at.agenda === 'Coming up' && at.empties === 1, JSON.stringify([at.kids, at.panel]));
      ok(`${v}: only the month is .bk-monthview and only the day .bk-dayview; one heading takes the focus on arrival`, at.month === (v === 'month' ? 1 : 0) && at.day === (v === 'day' ? 1 : 0) && same(at.heads, [v === 'day' ? 'H2' : 'H1']) && at.live === (v === 'day' ? null : 'polite'), JSON.stringify(at));
      ok(`${v}: ‹, Today and › are named for the view; the legend sits under squares only; no tab or grid roles`, same(at.nav, NAV[v]) && at.todayText === 'Today' && at.legend === (v === 'month' || v === 'two' ? 1 : 0) && at.roles === 0, JSON.stringify(at.nav));

      // where it starts, and how far ‹ › go
      const now = await dayFromNow(page, 0);
      const first = v === 'month' ? (await monthOf(page, now))[0] : v === 'two' || v === 'week' ? await monday(page, now) : now;
      const last = v === 'month' ? (await monthOf(page, now))[1] : await plus(page, first, LEN[v] - 1);
      const next = v === 'month' ? await monthOf(page, now, 1) : [await plus(page, first, LEN[v]), await plus(page, last, LEN[v])];
      const shown = async () => (v === 'day' ? null : firstDay(page));
      const t0 = await title(page), d0 = await shown();
      ok(`${v}: it opens around today`, (v === 'day' ? true : d0 === first) && t0 === (await wantTitle(page, v, first, last)) + (v === 'day' ? ' · today' : ''), `${d0} “${t0}”`);
      await page.click(`[aria-label="${NAV[v][2]}"]`); await sleep(200);
      const t1 = await title(page), d1 = await shown();
      ok(`${v}: › steps ${v === 'month' ? 'a month' : LEN[v] + (LEN[v] === 1 ? ' day' : ' days')}, and the title follows`, (v === 'day' ? true : d1 === next[0]) && t1 === (await wantTitle(page, v, next[0], next[1])) && t1 !== t0, `${d1} “${t1}”`);
      ok(`${v}: the focus stays on ›`, await page.evaluate(l => document.activeElement && document.activeElement.getAttribute('aria-label') === l, NAV[v][2]));
      await page.click(`[aria-label="${NAV[v][0]}"]`); await sleep(200);
      ok(`${v}: ‹ steps back the same way`, (await title(page)) === t0 && (await shown()) === d0);
      await page.click(`[aria-label="${NAV[v][2]}"]`); await page.click(`[aria-label="${NAV[v][2]}"]`); await sleep(150);
      await page.click(`[aria-label="${NAV[v][1]}"]`); await sleep(200);
      ok(`${v}: Today comes back to today`, (await title(page)) === t0 && (await shown()) === d0);
      if (v === 'two' || v === 'week') ok(`${v}: the days start on a Monday`, await page.evaluate(iso => import('./js/util.js').then(u => u.parseISO(iso).getDay() === 1), d0), d0);

      // nothing booked: each view says so in its own words, and the Coming up box is the only .empty
      const none = await page.locator('.bk-cal-panel .bk-none').allTextContents();
      if (v === 'week') ok('week: seven days, each a name to tap and “Nothing on”', (await page.locator('.bk-wday').count()) === 7 && same(none, Array(7).fill('Nothing on')) && (await page.locator('.bk-wday h3 > button.bk-wday-head').count()) === 7 && (await page.locator('.bk-cal-panel .bk-ev').count()) === 0, none.join('|'));
      if (v === 'three') ok('three days: “Nothing on these three days.” under the three days’ names, and no hours', same(none, ['Nothing on these three days.']) && (await page.locator('.bk-grid-head').count()) === 3 && (await page.locator('.bk-grid-body, .bk-any').count()) === 0, none.join('|'));
      if (v === 'day') ok('day: “Nothing booked on this day.” with “+ New on this day”, and no grid', same(none, ['Nothing booked on this day.']) && (await page.locator('.bk-grid').count()) === 0 && (await page.locator('.bk-cal-panel .bk-new-day').count()) === 1, none.join('|'));
      if (v === 'two') ok('two weeks: fourteen tall squares, today marked', (await page.locator('.bk-cal-two .bk-day.bk-day-tall').count()) === 14 && (await page.locator('.bk-cal-two .bk-day').count()) === 14 && (await page.locator('.bk-day.today[aria-current="date"]').count()) === 1);

      // the walkthrough
      const tour = await steps(page), names = tour.map(s => s[0]);
      const cal = (tour.find(s => s[0] === 'The calendar') || [])[1] || '';
      ok(`${v}: the walkthrough has New booking, Export calendar, Filters, Views, The calendar and Coming up`, same(names.filter(n => !['Add to this day', 'Bookings'].includes(n)), ['New booking', 'Export calendar', 'Filters', 'Views', 'The calendar', 'Coming up'])
        && (tour.find(s => s[0] === 'Views') || [])[1] === 'Month, 2 weeks, Week, 3 days or Day. Gdex opens on the one you picked here last.' && same((tour.find(s => s[0] === 'Coming up') || [])[2], ['.bk-agenda', '.bk-calview > .empty']), names.join(', '));
      ok(`${v}: …and The calendar step speaks of this view`, cal.startsWith({ month: 'Each line or dot is a booking', two: 'Two weeks of days, each booking with the time the band plays.', week: 'Each day lists what is on, in the order the bands play.', three: 'Hours run down the side', day: 'Hours run down the side' }[v]), cal);
      ok(`${v}: only the Day view adds “Add to this day” and a step named after the page`, names.includes('Add to this day') === (v === 'day') && names.includes('Bookings') === (v === 'day'), names.join(', '));
    }

    // the view picked with a button is the view Gdex opens on, around today
    await view(page, 'week');
    await page.reload(); await page.waitForSelector('#deck .dk-next'); await page.waitForSelector('.bk-week');
    const now = await dayFromNow(page, 0);
    const wk = await page.evaluate(now => ({ pressed: document.querySelector('#bk-view-week').getAttribute('aria-pressed'), first: document.querySelector('.bk-wday-head').dataset.date, today: [...document.querySelectorAll('.bk-wday.today .bk-wday-head')].map(b => [b.dataset.date, b.textContent, b.getAttribute('aria-label'), b.getAttribute('aria-current')]) }), now);
    const long = await wantTitle(page, 'day', now, now), short = await page.evaluate(iso => import('./js/util.js').then(u => { const d = u.parseISO(iso); return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`; }), now);
    ok('Week picked, then a reload: Gdex opens on the Week view, on this week', (await modeOf(page)) === 'week' && wk.pressed === 'true' && wk.first === (await monday(page, now)), JSON.stringify(wk));
    ok('today’s name says so in words, and to a screen reader', same(wk.today, [[now, `${short} · today`, `${long}, today. Open the day`, 'date']]), JSON.stringify(wk.today));

    // three days start on the day in view; Today brings them back to today
    const other = await page.evaluate(now => [...document.querySelectorAll('.bk-wday-head')].map(b => b.dataset.date).find(d => d !== now), now);
    await page.click(`#bk-wd-${other}`); await page.waitForSelector('.bk-dayview');
    ok('a day’s name in the week opens the Day view on that day, and the saved view is still Week', (await title(page)) === (await wantTitle(page, 'day', other, other)) && (await saved(page)) === 'week', await title(page));
    await view(page, 'three');
    ok('three days start on the day in view', (await firstDay(page)) === other && same(await page.locator('.bk-grid-head').evaluateAll(els => els.map(e => e.dataset.date)), [other, await plus(page, other, 1), await plus(page, other, 2)]));
    await page.click('[aria-label="From today"]'); await sleep(200);
    ok('…and after Today they start today', (await firstDay(page)) === now && (await page.locator('.bk-grid-head.today').getAttribute('data-date')) === now);

    // two weeks: the arrow keys run off the edge as ‹ › do
    await view(page, 'two');
    const f0 = await firstDay(page);
    await page.locator('.bk-day-tall').last().focus(); await page.keyboard.press('ArrowRight'); await sleep(250);
    let at = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.dataset.date, first: document.querySelector('.bk-day-tall').dataset.date, page: window.logiPage() }));
    ok('two weeks: → from the last square shows the next two weeks and lands on the next day', at.focus === (await plus(page, f0, 14)) && at.first === (await plus(page, f0, 14)) && at.page === 'bookings', JSON.stringify(at));
    await page.locator('.bk-day-tall').first().focus(); await page.keyboard.press('ArrowLeft'); await sleep(250);
    at = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.dataset.date, first: document.querySelector('.bk-day-tall').dataset.date }));
    ok('…and ← from the first goes back two whole weeks, onto the day before', at.focus === (await plus(page, f0, 13)) && at.first === f0, JSON.stringify(at));
    await page.locator('.bk-day-tall').nth(9).focus(); await page.keyboard.press('ArrowDown'); await sleep(250);
    at = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.dataset.date, first: document.querySelector('.bk-day-tall').dataset.date }));
    ok('…↓ from the second row lands a week on, in the next two weeks', at.focus === (await plus(page, f0, 16)) && at.first === (await plus(page, f0, 14)), JSON.stringify(at));
    await page.keyboard.press('ArrowUp'); await sleep(250);
    ok('…and ↑ comes back', await page.evaluate(() => document.activeElement && document.activeElement.dataset.date) === (await plus(page, f0, 9)) && (await firstDay(page)) === f0);

    ok('no errors in the console (empty diary)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ------------------------------ with the sample, and a busy night ------------------------------ */
  const { browser, page, errors } = await open({ sample: true });
  await page.waitForSelector('.bk-monthview');
  // The sample has nothing on today + 8 … + 13, nor four days back.
  const T = await dayFromNow(page, 8), T1 = await dayFromNow(page, 9), T2 = await dayFromNow(page, 10), T3 = await dayFromNow(page, 11), T4 = await dayFromNow(page, 12), T5 = await dayFromNow(page, 13), PAST = await dayFromNow(page, -4), SHOW1 = await dayFromNow(page, 5);
  const seed = [ // stored out of order
    { id: 'c-D', kind: 'show', status: 'confirmed', actId: 's-sablea', date: T, venueName: 'Somewhere' },
    { id: 'c-C', kind: 'show', status: 'confirmed', actId: 's-owls', date: T, venueName: 'Club 9', setTime: '00:30' },
    { id: 'c-A', kind: 'show', status: 'hold', actId: 's-sablea', date: T, venueId: 's-harbour', setTime: '21:30' },
    { id: 'c-W', kind: 'other', status: 'confirmed', title: 'Weekender', date: T, endDate: T1 },
    { id: 'c-L', kind: 'show', status: 'confirmed', title: 'Late Shift', date: T, venueName: 'The Crown', setTime: '23:00' },
    { id: 'c-E', kind: 'show', status: 'confirmed', actId: 's-owls', date: T, venueId: 's-lantern', loadIn: '16:00', setTime: '21:00', setLength: 75 },
    { id: 'c-Q', kind: 'show', status: 'confirmed', title: 'Second On', date: T, venueName: 'The Crown', setTime: '20:00' },
    { id: 'c-X', kind: 'show', status: 'cancelled', actId: 's-owls', date: T, venueName: 'The Old Vic', setTime: '18:00', setLength: 30 },
    { id: 'c-P', kind: 'show', status: 'confirmed', title: 'First On', date: T, venueName: 'The Crown', setTime: '19:00', setLength: 60 },
    { id: 'c-B', kind: 'show', status: 'confirmed', actId: 's-sablea', date: T1, venueId: 's-harbour', loadIn: '15:00', doors: '19:30' },
    { id: 'c-S', kind: 'session', status: 'confirmed', actId: 's-sablea', date: T1, venueId: 's-echo', start: '10:00', end: '12:00' },
    { id: 'c-N', kind: 'session', status: 'confirmed', title: 'All-nighter', date: T2, start: '22:00', end: '08:00' },
    { id: 'c-H', kind: 'show', status: 'confirmed', title: 'Early Doors', date: T4, venueName: 'The Crown', loadIn: '14:00', soundcheck: '17:00' },
    { id: 'c-K', kind: 'show', status: 'confirmed', title: 'Doors Only', date: T4, venueName: 'The Crown', doors: '20:00' },
    { id: 'c-M', kind: 'show', status: 'confirmed', title: 'Main Room', date: T5, venueName: 'The Crown', setTime: '21:00' },
    { id: 'c-G', kind: 'show', status: 'done', actId: 's-owls', date: PAST, venueId: 's-harbour', setTime: '20:00', went: 'no' },
    { id: 'c-nodate', kind: 'show', status: 'confirmed', title: 'No date yet' },
  ];
  for (const r of seed) await put(page, 'bookings', r);
  await sleep(300);
  const ORDER = ['c-X', 'c-P', 'c-Q', 'c-E', 'c-A', 'c-L', 'c-C', 'c-D', 'c-W'];
  const fmt = (iso, f = 'fmtShort') => page.evaluate(([iso, f]) => import('./js/util.js').then(u => u[f](iso)), [iso, f]);

  /* ---------------- Week: a list for each day ---------------- */
  ok('the week of the busy night is a few taps of › away', await toWeek(page, T));
  let ids = await weekIds(page, T);
  ok('week: a day lists its bookings in the order the bands play, the cancelled one and the ones with no time too', same(ids, ORDER), ids.join(','));
  const row = id => page.evaluate(([id, T]) => { const r = document.getElementById(`bk-ev-${id}-${T}`); if (!r) return null; const q = s => (r.querySelector(s) || {}).textContent || '';
    return { tag: r.tagName, time: q('.bk-wrow-time').trim(), title: q('.bk-wrow-title'), pill: q('.pill'), sub: q('.bk-wrow-sub'), note: q('.bk-overlap'), went: r.querySelectorAll('.bk-went').length, text: r.textContent, strike: getComputedStyle(r.querySelector('.bk-wrow-title')).textDecorationLine, inner: r.querySelectorAll('button, a').length }; }, [id, T]);
  let r = await row('c-Q');
  ok('a row is a button with the time the band plays, the name, the status and the venue', r && r.tag === 'BUTTON' && r.time === '20:00' && r.title.endsWith('Second On') && r.pill === 'Confirmed' && r.sub === 'The Crown' && r.inner === 0, JSON.stringify(r));
  const rE = await row('c-E'), rA = await row('c-A');
  ok('the two shows whose sets overlap say so on their rows', rE.time === '21:00' && rE.note === 'Overlaps with Sable, 21:30' && rA.note === 'Overlaps with The Night Owls, 21:00' && rA.pill === 'Hold', `${rE.note} | ${rA.note}`);
  ok('…and no other row has a note', (await Promise.all(['c-X', 'c-P', 'c-Q', 'c-L', 'c-C', 'c-D', 'c-W'].map(id => row(id)))).every(x => x.note === ''));
  r = await row('c-C');
  ok('a set after midnight comes after the evening’s and says “after midnight”', r.time === '00:30' && r.sub === 'after midnight', JSON.stringify(r));
  r = await row('c-D');
  ok('a show with no time has a dash where the time goes and says “no time yet” once', r.time === '—' && r.sub === 'no time yet' && (r.text.match(/no time yet/g) || []).length === 1 && await page.evaluate(T => document.querySelector(`#bk-ev-c-D-${T} .bk-wrow-time [aria-hidden="true"]`).textContent === '—', T), JSON.stringify(r));
  r = await row('c-X');
  ok('a cancelled booking is there, struck through, its pill saying Cancelled', r.strike.includes('line-through') && r.pill === 'Cancelled' && (await row('c-Q')).strike === 'none', JSON.stringify(r));
  r = await row('c-W');
  ok('a booking over two days says “to” its last day first', r.sub === `to ${await fmt(T1)} · no time yet`, r.sub);
  await reach(page, `#bk-wd-${T1}`, 'Next week');
  ids = await weekIds(page, T1);
  ok('…and has a row on its second day as well, among that day’s own (10:00 session, doors 19:30, then no time)', same(ids, ['c-S', 'c-B', 'c-W']) && (await page.locator(`#bk-ev-c-W-${T1}`).count()) === 1, ids.join(','));
  const subB = await page.locator(`#bk-ev-c-B-${T1} .bk-wrow-sub`).textContent(), timeB = (await page.locator(`#bk-ev-c-B-${T1} .bk-wrow-time`).textContent()).trim();
  ok('a show sorted by its doors shows that time and says “doors”', timeB === '19:30' && subB.startsWith('doors'), `${timeB} ${subB}`);
  await toWeek(page, T);
  const empties = await page.evaluate(() => [...document.querySelectorAll('.bk-wday')].filter(d => !d.querySelector('.bk-ev')).map(d => d.querySelector('.bk-none').textContent));
  ok('a day with nothing on says “Nothing on”', empties.length >= 1 && empties.every(t => t === 'Nothing on'), empties.join('|'));
  ok('a booking with no date is in no row', (await page.locator('.bk-calview [data-id="c-nodate"]').count()) === 0);

  // the filter chips apply to the view as well as to Coming up
  await page.locator('.bk-filters .chip', { hasText: 'Sable' }).click(); await sleep(250);
  ids = await weekIds(page, T);
  ok('with an act’s chip on, only that act’s rows are left', same(ids, ['c-A', 'c-D']), ids.join(','));
  await page.locator('.bk-filters .chip', { hasText: 'All acts' }).click(); await sleep(150);
  await page.locator('.bk-filters .chip', { hasText: 'Rehearsals' }).click(); await sleep(250);
  ok('with a kind’s chip on that nothing matches, a day reads “Nothing on with these filters”', same(await weekIds(page, T), []) && (await page.locator(`.bk-wday:has(#bk-wd-${T}) .bk-none`).textContent()) === 'Nothing on with these filters');
  await page.click(`#bk-wd-${T}`); await page.waitForSelector('.bk-dayview');
  ok('…and the Day view reads “Nothing on with these filters.”, with the chips above it', (await page.locator('.bk-dayview .bk-none').textContent()) === 'Nothing on with these filters.' && (await page.locator('.bk-grid').count()) === 0 && (await page.locator('.bk-filters .chip.on', { hasText: 'Rehearsals' }).count()) === 1);
  await view(page, 'three');
  ok('…as do three days', (await page.locator('.bk-cal-panel .bk-none').textContent()) === 'Nothing on with these filters.');
  await page.locator('.bk-filters .chip', { hasText: 'All kinds' }).click(); await sleep(250);

  // a swipe across the list is the next week, and opens nothing
  await toWeek(page, T);
  await page.locator(`#bk-ev-c-P-${T}`).scrollIntoViewIfNeeded(); await sleep(200);
  const w0 = await firstDay(page), box = await page.locator(`#bk-ev-c-P-${T}`).boundingBox();
  await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.height / 2 + 5, { steps: 6 }); await page.mouse.up(); await sleep(350);
  ok('a swipe to the left across the week shows the next week, and does not open the booking under the finger', (await firstDay(page)) === (await plus(page, w0, 7)) && (await page.locator('.bk-page').count()) === 0 && (await page.locator('.sheet').count()) === 0);
  // the arrow keys are the section menu's everywhere but on day squares
  await toWeek(page, T);
  await page.focus(`#bk-ev-c-P-${T}`); await page.keyboard.press('ArrowRight'); await sleep(500);
  ok('→ on a row is the section menu’s (only day squares take the arrow keys)', (await page.evaluate(() => window.logiPage())) !== 'bookings');
  await go(page, 'bookings');
  ok('…and coming back finds the same week', (await modeOf(page)) === 'week' && (await page.locator(`#bk-wd-${T}`).count()) === 1);

  // + New starts on today when today is on screen, else on the first day shown; on the day in view in Day and 3 days
  const newDate = async () => { await page.locator('.bk-new').click(); await page.locator('.bk-kind[data-kind="other"]').click(); const f = sheetNamed(page, 'New diary entry'); await f.waitFor(); const v = await f.locator('[data-key="date"]').inputValue(); await f.locator('button', { hasText: 'Cancel' }).click(); await sleep(250); return v; };
  ok('+ New in a week without today starts on its Monday', (await newDate()) === (await monday(page, T)));
  await page.click('[aria-label="This week"]'); await sleep(200);
  ok('…and on today in this week', (await newDate()) === (await dayFromNow(page, 0)));

  /* ---------------- a row opens its booking; Back and Delete land on the Day view of its day ---------------- */
  await toWeek(page, T);
  await page.click(`#bk-ev-c-E-${T}`); await page.waitForSelector('.bk-page .bk-hero');
  ok('tapping a row opens the booking', (await page.locator('.bk-title').innerText()).includes('The Night Owls @ The Lantern Rooms'));
  await page.click('.bk-page .back-btn'); await page.waitForSelector('.bk-dayview');
  ok('Back lands in the Day view on its day', (await title(page)) === (await wantTitle(page, 'day', T, T)) && (await page.locator(`.bk-col[data-day="${T}"]`).count()) === 1 && (await page.locator('.bk-col').count()) === 1, await title(page));
  ok('…which does not change the saved view (still Week)', (await saved(page)) === 'week');

  /* ---------------- Day: the time grid ---------------- */
  const geo = () => page.evaluate(() => {
    const grid = document.querySelector('.bk-grid'), body = grid.querySelector('.bk-grid-body');
    const b = el => ({ id: el.dataset.id, top: el.offsetTop, h: el.offsetHeight, left: el.offsetLeft, w: el.offsetWidth });
    return { hh: parseFloat(getComputedStyle(grid).getPropertyValue('--hh')), n: getComputedStyle(grid).getPropertyValue('--n').trim(), bodyH: body ? body.clientHeight : 0,
      hours: [...grid.querySelectorAll('.bk-hour')].map(e => [e.textContent, parseFloat(e.style.top)]), cols: [...grid.querySelectorAll('.bk-col')].map(c => ({ day: c.dataset.day, h: c.clientHeight, w: c.clientWidth, label: c.getAttribute('aria-label'), blocks: [...c.querySelectorAll('.bk-ev')].map(b) })),
      any: [...grid.querySelectorAll('.bk-any .bk-ev')].map(e => ({ id: e.id, col: e.style.gridColumn, text: e.querySelector('.bk-any-text').textContent })), anyLabel: (grid.querySelector('.bk-any-label') || {}).textContent, heads: grid.querySelectorAll('.bk-grid-head').length };
  });
  let g = await geo();
  const blk = id => g.cols.flatMap(c => c.blocks).find(b => b.id === id);
  const line = t => (g.hours.find(h => h[0].startsWith(t)) || [])[1];
  ok('day: one column of hours, 52 px to the hour, from 18:00 to 02:00 when nothing asks for more', g.hh === 52 && g.n === '1' && g.cols.length === 1 && g.heads === 0 && g.hours[0][0] === '18:00' && g.hours.length === 8 && g.bodyH === 8 * 52 && g.cols[0].h === g.bodyH, JSON.stringify(g.hours));
  ok('the hours after midnight carry a small +1', same(g.hours.slice(-2).map(h => h[0]), ['00:00+1', '01:00+1']) && g.hours[5][0] === '23:00');
  ok('the blocks are in the order the night runs, and a column is named for its day', same(g.cols[0].blocks.map(b => b.id), ['c-X', 'c-P', 'c-Q', 'c-E', 'c-A', 'c-L', 'c-C']) && g.cols[0].label === (await fmt(T, 'fmtLong')), g.cols[0].blocks.map(b => b.id).join(','));
  ok('a set at 21:00 for 75 minutes starts on the 21:00 line and is 75/60 of an hour tall', blk('c-E').top === line('21:00') && Math.abs(blk('c-E').h - 75 / 60 * g.hh) < 0.6, JSON.stringify(blk('c-E')));
  const over = (a, b) => a.top < b.top + b.h && b.top < a.top + a.h;
  ok('two sets that overlap sit side by side', over(blk('c-E'), blk('c-A')) && blk('c-A').left >= blk('c-E').left + blk('c-E').w - 1 && Math.abs(blk('c-E').w - blk('c-A').w) <= 1 && blk('c-E').w < g.cols[0].w / 2, JSON.stringify([blk('c-E'), blk('c-A')]));
  ok('two sets that only touch (19:00 for an hour, then 20:00) share a lane, the whole width', blk('c-P').left === blk('c-Q').left && blk('c-P').w === blk('c-Q').w && blk('c-P').w > g.cols[0].w - 6 && blk('c-P').top + blk('c-P').h <= blk('c-Q').top + 0.5 && blk('c-Q').top + blk('c-Q').h <= blk('c-E').top + 0.5, JSON.stringify([blk('c-P'), blk('c-Q')]));
  ok('a set with no length is an hour tall; a short one is never under 26 px', Math.abs(blk('c-Q').h - g.hh) < 0.6 && blk('c-X').h === 26 && blk('c-X').top === line('18:00'), JSON.stringify(blk('c-X')));
  ok('a 00:30 set is below the 23:00 one, half an hour under the 00:00 line', blk('c-C').top > blk('c-L').top + blk('c-L').h - 1 && Math.abs(blk('c-C').top - (line('00:00') + g.hh / 2)) < 0.6, JSON.stringify([blk('c-L'), blk('c-C')]));
  ok('a show with no time and a two-day booking are pills in the “any time” row, not blocks', g.anyLabel === 'any time' && same(g.any.map(a => a.id).sort(), ['bk-ev-c-D-any', 'bk-ev-c-W-any']) && !blk('c-D') && !blk('c-W'), JSON.stringify(g.any));
  ok('…the two-day one saying when it ends', (g.any.find(a => a.id === 'bk-ev-c-W-any') || {}).text.endsWith(`Weekender · to ${await fmt(T1)}`), JSON.stringify(g.any));
  const words = id => page.evaluate(([id, T]) => { const b = document.getElementById(`bk-ev-${id}-${T}`); if (!b) return null; return { tag: b.tagName, title: b.querySelector('.bk-block-title').textContent, sub: b.querySelector('.bk-block-sub').textContent.trim(), said: b.querySelector('.sr-only').textContent.trim(), text: b.textContent, extras: b.querySelectorAll('.bk-overlap, .vn-chip, .bk-went, .pill').length, strike: getComputedStyle(b.querySelector('.bk-block-title')).textDecorationLine, opacity: getComputedStyle(b).opacity }; }, [id, T]);
  let wE = await words('c-E');
  ok('a block is a button with the name, the time and, in the Day view, where', wE.tag === 'BUTTON' && wE.title.endsWith('The Night Owls @ The Lantern Rooms') && /^21:00 · \S/.test(wE.sub) && (await words('c-Q')).sub === '20:00 · The Crown', JSON.stringify(wE));
  ok('a block carries no chip, note or pill; its hidden words say the status and the overlap, each with a full stop', wE.extras === 0 && wE.said.startsWith('Confirmed. Overlaps with Sable, 21:30.') && wE.said === (await wantSaid(page, 'c-E')) && (await words('c-A')).said.startsWith('Hold. Overlaps with The Night Owls, 21:00.') && (await words('c-A')).said === (await wantSaid(page, 'c-A')) && (await words('c-Q')).said === 'Confirmed.', `${wE.said} | ${(await words('c-A')).said}`);
  const wX = await words('c-X');
  ok('a cancelled block is struck through and faded', wX.strike.includes('line-through') && Number(wX.opacity) < 1 && wX.said === 'Cancelled.' && wE.strike === 'none' && wE.opacity === '1', JSON.stringify(wX));
  const pillD = await page.evaluate(() => { const p = document.getElementById('bk-ev-c-D-any'); return { tag: p.tagName, said: p.querySelector('.sr-only').textContent.trim(), text: p.querySelector('.bk-any-text').textContent }; });
  ok('a pill is a button too, with its status for a screen reader', pillD.tag === 'BUTTON' && pillD.said === 'Confirmed.' && pillD.text.endsWith('Sable @ Somewhere'), JSON.stringify(pillD));
  ok('a booking with no date is not on the grid', (await page.locator('.bk-calview [data-id="c-nodate"]').count()) === 0);

  // the keyboard: a day's name and a block are buttons, Enter opens them
  await toWeek(page, T);
  await page.focus(`#bk-wd-${T}`); await page.keyboard.press('Enter'); await page.waitForSelector('.bk-dayview');
  ok('Enter on a day’s name opens that day, with the focus on its heading', await page.evaluate(() => document.activeElement && document.activeElement.matches('.bk-dayview h2.cal-title')) && (await page.locator(`.bk-col[data-day="${T}"]`).count()) === 1);
  await page.focus(`#bk-ev-c-P-${T}`); await page.keyboard.press('Enter'); await page.waitForSelector('.bk-page .bk-hero');
  ok('Enter on a block opens its booking', (await page.locator('.bk-title').innerText()).includes('First On'));
  await page.click('.bk-page .back-btn'); await page.waitForSelector('.bk-dayview');

  // + New on this day; a tap; press and hold
  await page.locator('.bk-new-day').click();
  await sheetNamed(page, 'What are you booking?').waitFor();
  await page.locator('.bk-kind[data-kind="rehearsal"]').click();
  await sheetNamed(page, 'New rehearsal').waitFor();
  ok('“+ New on this day” asks what kind, then fills in the day', (await sheetNamed(page, 'New rehearsal').locator('[data-key="date"]').inputValue()) === T);
  await sheetNamed(page, 'New rehearsal').locator('button', { hasText: 'Cancel' }).click(); await sleep(250);
  ok('+ New in the Day view starts on that day too', (await newDate()) === T);
  await page.click(`#bk-ev-c-Q-${T}`); await page.waitForSelector('.bk-page .bk-hero');
  ok('a tap on a block opens its booking', (await page.locator('.bk-title').innerText()).includes('Second On'));
  await page.click('.bk-page .back-btn'); await page.waitForSelector('.bk-dayview');
  const blockL = page.locator(`#bk-ev-c-L-${T}`);
  await blockL.scrollIntoViewIfNeeded(); await sleep(200);
  const before = await blockL.boundingBox();
  await press(page, blockL, 600);
  const during = await blockL.boundingBox(), held = await blockL.evaluate(el => [el.classList.contains('holding'), getComputedStyle(el).position]);
  ok('a block does not jump while it is pressed', same(held, [true, 'absolute']) && Math.abs(during.x - before.x) < 0.6 && Math.abs(during.y - before.y) < 0.6 && Math.abs(during.width - before.width) < 0.6 && Math.abs(during.height - before.height) < 0.6, JSON.stringify([before, during, held]));
  await sleep(2700);
  await sheetNamed(page, 'Delete this booking?').waitFor({ timeout: 4000 }); await page.mouse.up(); await sleep(300);
  ok('press and hold for three seconds offers to delete, and letting go does not open it', (await page.locator('.bk-page').count()) === 0 && /Late Shift/.test(await page.locator('.sheet').innerText()));
  await page.locator('.sheet button', { hasText: 'Keep it' }).click(); await sleep(250);
  ok('…and Keep it keeps it', (await page.locator(`#bk-ev-c-L-${T}`).count()) === 1);
  // delete from the booking's page: back on its day
  await put(page, 'bookings', { id: 'c-Z', kind: 'show', status: 'confirmed', title: 'Throwaway', date: T, venueName: 'The Crown', setTime: '18:30', setLength: 20 }); await sleep(300);
  const shortOne = await page.evaluate(T => { const b = document.getElementById(`bk-ev-c-Z-${T}`), w = b.querySelector('.bk-block-where'), cs = getComputedStyle(w); return { h: b.offsetHeight, oneLine: getComputedStyle(b.querySelector('.bk-block-in')).display === 'flex', where: [w.textContent, cs.display !== 'none', w.getBoundingClientRect().width <= 1.5], time: b.querySelector('.bk-block-sub').getBoundingClientRect().width > 20 }; }, T);
  ok('a short block puts its name and its time on one line; the venue is out of sight there, and still read out', shortOne.h === 26 && shortOne.oneLine && same(shortOne.where, [' · The Crown', true, true]) && shortOne.time, JSON.stringify(shortOne));
  await page.click(`#bk-ev-c-Z-${T}`); await page.waitForSelector('.bk-page .bk-hero');
  await page.locator('.bk-actions .bk-delete').click(); await sheetNamed(page, 'Delete this booking?').waitFor();
  await page.locator('.sheet button', { hasText: 'Delete booking' }).click(); await sleep(400);
  ok('Delete on a booking’s page lands in the Day view on its day', (await page.locator('.bk-dayview').count()) === 1 && (await page.locator(`.bk-col[data-day="${T}"]`).count()) === 1 && (await page.locator(`#bk-ev-c-Z-${T}`).count()) === 0 && (await page.locator(`#bk-ev-c-P-${T}`).count()) === 1);

  // the hours fit what is on
  await page.click('[aria-label="Next day"]'); await sleep(250);
  g = await geo();
  ok('a 10:00 session widens the hours to start at 10:00', g.cols[0].day === T1 && g.hours[0][0] === '10:00' && blk('c-S').top === 0 && Math.abs(blk('c-S').h - 2 * g.hh) < 0.6 && g.hours[g.hours.length - 1][0] === '01:00+1', JSON.stringify(g.hours.map(h => h[0])));
  ok('the focus stays on › and the day is said aloud', await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label') === 'Next day') && (await page.evaluate(() => new Promise(r => setTimeout(() => r((document.getElementById('sr-live') || {}).textContent || ''), 120)))) === (await fmt(T1, 'fmtLong')));
  const wB = await page.evaluate(T1 => { const b = document.getElementById(`bk-ev-c-B-${T1}`); return b.querySelector('.bk-block-sub').textContent.trim(); }, T1);
  ok('a show sorted by its doors sits at its doors and says “Doors 19:30”', wB.startsWith('Doors 19:30') && Math.abs(blk('c-B').top - (line('19:00') + g.hh / 2)) < 0.6, wB);
  ok('the second day of a two-day booking has its pill too', same(g.any.map(a => a.id), ['bk-ev-c-W-any']));
  await page.click('[aria-label="Next day"]'); await sleep(250);
  g = await geo();
  ok('a session from 22:00 to 08:00 ends at the bottom of the grid (06:00), not below it', g.cols[0].day === T2 && blk('c-N').top === line('22:00') && Math.abs(blk('c-N').top + blk('c-N').h - g.bodyH) < 0.6 && g.hours[g.hours.length - 1][0] === '05:00+1' && g.bodyH === 12 * g.hh, JSON.stringify([blk('c-N'), g.bodyH]));
  await page.click('[aria-label="Next day"]'); await sleep(250);
  ok('a day with nothing on draws no grid', (await title(page)) === (await wantTitle(page, 'day', T3, T3)) && (await page.locator('.bk-grid').count()) === 0 && (await page.locator('.bk-dayview .bk-none').textContent()) === 'Nothing booked on this day.' && (await page.locator('.bk-new-day').count()) === 1);
  ok('…and the walkthrough points at that line', same((await steps(page)).find(s => s[0] === 'Bookings')[2], ['.bk-dayview .bk-grid', '.bk-dayview .bk-none']));
  // only "any time": no empty hours
  await put(page, 'bookings', { id: 'c-U', kind: 'other', status: 'hold', title: 'Untimed', date: T3 }); await sleep(300);
  ok('a day with nothing timed shows the “any time” row and “No times set yet.”, without empty hours', (await page.locator('.bk-any #bk-ev-c-U-any').count()) === 1 && (await page.locator('.bk-grid-body').count()) === 0 && (await page.locator('.bk-grid-note').textContent()) === 'No times set yet.' && (await page.locator('.bk-cal-panel .bk-none').count()) === 0);
  await page.evaluate(() => import('./js/store.js').then(s => s.remove('bookings', 'c-U'))); await sleep(300);

  /* ---------------- three days ---------------- */
  await toDay(page, T);
  await view(page, 'three');
  g = await geo();
  ok('three days: three columns from the day in view, 44 px to the hour, sharing the hours the widest day needs', g.hh === 44 && g.n === '3' && same(g.cols.map(c => c.day), [T, T1, T2]) && g.heads === 3 && g.hours[0][0] === '10:00' && g.hours[g.hours.length - 1][0] === '05:00+1' && g.cols.every(c => c.h === g.bodyH) && g.bodyH === 20 * 44, JSON.stringify(g.hours.map(h => h[0])));
  ok('…with the busy night’s blocks in its own column, overlapping sets side by side', same(g.cols[0].blocks.map(b => b.id), ['c-X', 'c-P', 'c-Q', 'c-E', 'c-A', 'c-L', 'c-C']) && blk('c-A').left > blk('c-E').left && blk('c-E').top === line('21:00') && Math.abs(blk('c-E').h - 55) < 0.6 && same(g.cols[1].blocks.map(b => b.id), ['c-S', 'c-B']) && same(g.cols[2].blocks.map(b => b.id), ['c-N']), JSON.stringify(g.cols.map(c => c.blocks.map(b => b.id))));
  const anyW = g.any.find(a => a.id === 'bk-ev-c-W-any'), anyD = g.any.find(a => a.id === 'bk-ev-c-D-any');
  ok('the two-day booking is one pill across its two days; the show with no time a pill on its own day', g.any.length === 2 && anyW.col.replace(/\s/g, '') === '1/3' && anyD.col.replace(/\s/g, '') === '1/2', JSON.stringify(g.any));
  const said3 = await page.evaluate(T => ({ w: document.querySelector('#bk-ev-c-W-any .sr-only').textContent.trim(), d: document.querySelector('#bk-ev-c-D-any .sr-only').textContent.trim(), sub: document.querySelector(`#bk-ev-c-Q-${T} .bk-block-sub`).textContent.trim() }), T);
  ok('…each telling a screen reader its day or days; a block here has the time alone', said3.d === (await wantSaid(page, 'c-D', { lead: await fmt(T, 'fmtLong') })) && said3.d.endsWith('. Confirmed.') && said3.w === `${await fmt(T, 'fmtLong')} → ${await fmt(T1, 'fmtLong')}. Confirmed.` && said3.sub === '20:00', JSON.stringify(said3));
  const head = await page.evaluate(T1 => { const b = document.getElementById(`bk-gh-${T1}`); return [b.tagName, b.dataset.date, b.textContent, b.getAttribute('aria-label')]; }, T1);
  const shortT1 = await page.evaluate(iso => import('./js/util.js').then(u => { const d = u.parseISO(iso); return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`; }), T1);
  ok('a day’s name over its column is a button: the weekday, then the number', same(head, ['BUTTON', T1, shortT1, `${await fmt(T1, 'fmtLong')}. Open the day`]), JSON.stringify(head));
  ok('+ New in three days starts on the first of them', (await newDate()) === T);
  await page.click(`#bk-gh-${T1}`); await page.waitForSelector('.bk-dayview');
  ok('…and tapping it opens the Day view on that day', (await title(page)) === (await wantTitle(page, 'day', T1, T1)) && (await page.locator(`.bk-col[data-day="${T1}"]`).count()) === 1);
  // a booking that began before the three days: its pill runs in from the left
  await view(page, 'three');
  g = await geo();
  ok('a booking that began the day before shows as a pill on the first day, cut square where it runs in', same(g.cols.map(c => c.day), [T1, T2, T3]) && g.any.length === 1 && g.any[0].col.replace(/\s/g, '') === '1/2' && await page.evaluate(() => document.getElementById('bk-ev-c-W-any').classList.contains('bk-any-from')), JSON.stringify(g.any));

  /* ---------------- two weeks ---------------- */
  await toDay(page, T);
  await view(page, 'two');
  ok('two weeks: the fourteen days from the Monday of the week in view', (await firstDay(page)) === (await monday(page, T)) && (await page.locator('.bk-day-tall').count()) === 14 && (await page.locator(`.bk-day-tall[data-date="${T5}"]`).count()) === 1);
  const tall = await page.evaluate(([T, T5]) => {
    const sq = iso => document.querySelector(`.bk-day[data-date="${iso}"]`), minis = iso => [...sq(iso).querySelectorAll('.bk-mini')].map(m => m.textContent);
    const m = sq(T5).querySelector('.bk-mini'), t = m.querySelector('.bk-mini-time').getBoundingClientRect(), box = m.getBoundingClientRect(), first = document.querySelector('.bk-day-tall');
    return { heights: [...document.querySelectorAll('.bk-day-tall')].map(e => e.offsetHeight), busy: minis(T), more: sq(T).querySelector('.more').textContent, label: sq(T).getAttribute('aria-label'), main: minis(T5), timeFits: t.left >= box.left - 0.5 && t.right <= box.right + 0.5 && t.width > 10,
      minisShown: getComputedStyle(sq(T).querySelector('.bk-minis')).display, dots: document.querySelectorAll('.bk-cal-two .bk-dots').length, firstNum: first.querySelector('.num').textContent, firstMon: (first.querySelector('.bk-mon') || {}).textContent, firstDate: first.dataset.date, strike: getComputedStyle(sq(T).querySelectorAll('.bk-mini')[1]).textDecorationLine };
  }, [T, T5]);
  ok('a tall square’s first line reads “21:00 Main Room”, and the time is whole at 420 px wide', same(tall.main, ['21:00 Main Room']) && tall.timeFits, JSON.stringify(tall.main));
  ok('the lines show on a phone too (no dots here): the two-day booking first, then the day in playing order, then “+6 more”', tall.minisShown !== 'none' && tall.dots === 0 && same(tall.busy, ['Weekender', '18:00 The Night Owls', '19:00 First On']) && tall.more === '+6 more' && tall.strike.includes('line-through'), JSON.stringify([tall.busy, tall.more]));
  ok('a square’s spoken name puts each booking’s time before its title, the 00:30 set last among the timed', tall.label.startsWith(`${await fmt(T, 'fmtLong')}: Weekender (Confirmed), 18:00 The Night Owls @ The Old Vic (Cancelled), 19:00 First On (Confirmed), `) && tall.label.endsWith(', 23:00 Late Shift (Confirmed), 00:30 The Night Owls @ Club 9 (Confirmed), Sable @ Somewhere (Confirmed)'), tall.label);
  const monShort = await page.evaluate(iso => import('./js/util.js').then(u => [u.parseISO(iso).toLocaleDateString(undefined, { month: 'short' }), u.parseISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })]), tall.firstDate);
  ok('the first square says the month as well as the number', tall.firstMon === monShort[0] && tall.firstNum === monShort[1], `${tall.firstNum} / ${tall.firstMon}`);
  await page.locator(`.bk-day-tall[data-date="${T5}"]`).click(); await page.waitForSelector('.bk-dayview');
  ok('tapping a tall square opens the Day view on that day', (await title(page)) === (await wantTitle(page, 'day', T5, T5)) && (await page.locator(`#bk-ev-c-M-${T5}`).count()) === 1 && (await saved(page)) === 'two');
  await view(page, 'month');
  const mh = await page.evaluate(() => [...document.querySelectorAll('.bk-monthview .bk-day')].map(e => e.offsetHeight));
  ok('the two weeks’ squares are taller than the month’s', Math.min(...tall.heights) >= 78 && Math.min(...mh) < Math.min(...tall.heights), `${Math.min(...mh)} vs ${Math.min(...tall.heights)}`);
  ok('the month keeps its dots on a phone, with the lines in the page for wider screens', (await page.locator('.bk-monthview .bk-dots').count()) >= 1 && (await page.locator('.bk-monthview .bk-minis').count()) >= 1 && (await page.locator('.bk-monthview .bk-day-tall').count()) === 0);

  /* ---------------- Coming up: a card says the time it is sorted by ---------------- */
  if (await page.locator('#bk-agenda-more').count()) { await page.click('#bk-agenda-more'); await sleep(250); }
  const card = id => page.locator(`.bk-agenda .bk-card[data-id="${id}"] .bk-card-sub`).textContent();
  ok('a show sorted by its doors says so after its first time: “Load-in 15:00 · Doors 19:30”', /Load-in 15:00 · Doors 19:30/.test(await card('c-B')), await card('c-B'));
  ok('…by its soundcheck: “Load-in 14:00 · Soundcheck 17:00”', /Load-in 14:00 · Soundcheck 17:00/.test(await card('c-H')), await card('c-H'));
  ok('…a show whose doors are its first time says them once', /Doors 20:00/.test(await card('c-K')) && ((await card('c-K')).match(/Doors/g) || []).length === 1, await card('c-K'));
  ok('…and a show with an on-stage time reads as it did', /Load-in 16:00 · On 21:00/.test(await card('c-E')) && /10:00–12:00/.test(await card('c-S')) && /On stage 21:00/.test(await card('c-M')), `${await card('c-E')} | ${await card('c-S')} | ${await card('c-M')}`);
  const coming = await page.locator('.bk-agenda .bk-card').evaluateAll((els, want) => els.map(e => e.dataset.id).filter(id => want.includes(id)), ['c-S', 'c-B', 'c-W', 'c-H', 'c-K']);
  ok('so two days read in order down the cards (the two-day booking where its first day put it)', same(coming, ['c-W', 'c-S', 'c-B', 'c-H', 'c-K']), coming.join(','));
  ok('no Coming up card is an entry of the view (.bk-ev)', (await page.locator('.bk-agenda .bk-ev').count()) === 0 && (await page.locator('.bk-agenda .bk-card').count()) > 8);
  if (await page.locator('#bk-agenda-more').count()) { await page.click('#bk-agenda-more'); await sleep(200); }
  for (const v of ['two', 'week', 'three', 'day', 'month']) {
    await view(page, v);
    const u = await page.evaluate(() => ({ cards: document.querySelectorAll('.bk-calview > .bk-agenda .bk-card[data-id]').length, head: document.querySelector('.bk-calview > .bk-agenda-head').textContent, after: document.querySelector('.bk-cal-panel').compareDocumentPosition(document.querySelector('.bk-agenda')) & Node.DOCUMENT_POSITION_FOLLOWING, more: !!document.getElementById('bk-agenda-more'), nodate: document.querySelectorAll('.bk-calview [data-id="c-nodate"]').length, filters: document.querySelectorAll('.bk-calview > .bk-filters .chips').length, money: /[$£€]|\bfee\b|guarantee/i.test(document.querySelector('.bk-calview').textContent) }));
    ok(`${v}: Coming up is under the view, eight cards and “Show all”, with the filter chips above; the booking with no date is nowhere, and no money is on the page`, u.cards === 8 && u.head === 'Coming up' && !!u.after && u.more && u.nodate === 0 && u.filters === 2 && !u.money, JSON.stringify(u));
  }

  /* ---------------- “Didn’t go” ---------------- */
  ok('(the past show’s week is a few taps of ‹ away)', await toWeek(page, PAST, true));
  const went = () => page.evaluate(P => { const r = document.getElementById(`bk-ev-c-G-${P}`); return r ? { went: [...r.querySelectorAll('.bk-went')].map(e => e.textContent), text: r.textContent } : null; }, PAST);
  let w = await went();
  ok('a show marked “Didn’t go” says so on its Week row', w && same(w.went, ['Didn’t go']), JSON.stringify(w));
  await page.click(`#bk-wd-${PAST}`); await page.waitForSelector('.bk-dayview');
  const wentBlock = () => page.evaluate(P => { const b = document.getElementById(`bk-ev-c-G-${P}`), eye = b.querySelector('.bk-block-went');
    return { sub: b.querySelector('.bk-block-sub').textContent.trim(), said: b.querySelector('.sr-only').textContent.trim(), text: b.textContent, pills: b.querySelectorAll('.bk-went').length, eye: eye ? [eye.getAttribute('aria-hidden'), eye.getBoundingClientRect().width > 20] : null, oneLine: getComputedStyle(b.querySelector('.bk-block-in')).display === 'flex' }; }, PAST);
  let wb = await wentBlock();
  ok('its block in the Day view reads “· Didn’t go” where the venue was', wb.sub === '20:00 · Didn’t go' && wb.text.includes('Didn’t go') && wb.pills === 0 && same(wb.eye, ['true', true]), JSON.stringify(wb));
  ok('…written for the eye there; a screen reader has it from the hidden words, once', wb.said.startsWith('Done.') && wb.said.endsWith(' Didn’t go.') && wb.said === (await wantSaid(page, 'c-G', { went: true })), wb.said);
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 'c-G', { setLength: 30 }))); await sleep(300);
  wb = await wentBlock();
  ok('a short set’s block has one line, and still shows it', wb.oneLine && wb.sub === '20:00 · Didn’t go' && same(wb.eye, ['true', true]), JSON.stringify(wb));
  await view(page, 'three');
  wb = await wentBlock();
  ok('in three days, where a block has no room for it, the hidden words carry it', wb.sub === '20:00' && wb.eye === null && wb.said === (await wantSaid(page, 'c-G', { went: true })), JSON.stringify(wb));
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 'c-G', { status: 'cancelled' }))); await sleep(300);
  wb = await page.evaluate(P => document.getElementById(`bk-ev-c-G-${P}`).textContent, PAST);
  await view(page, 'day');
  const wd = await page.evaluate(P => document.getElementById(`bk-ev-c-G-${P}`).textContent, PAST);
  await toWeek(page, PAST, true);
  w = await went();
  ok('the same show cancelled says it nowhere', !/Didn’t go/.test(wb) && !/Didn’t go/.test(wd) && w && w.went.length === 0 && !/Didn’t go/.test(w.text), JSON.stringify([wb, wd, w]));

  /* ---------------- the sample's show; a scout ---------------- */
  await toDay(page, SHOW1);
  const s1 = await page.evaluate(d => { const b = document.getElementById(`bk-ev-s-show1-${d}`); return b ? { said: b.querySelector('.sr-only').textContent.trim(), chips: b.querySelectorAll('.vn-chip').length } : null; }, SHOW1);
  ok('the sample’s show on its day: its block’s hidden words start with its status', s1 && s1.said.startsWith('Confirmed.') && s1.chips === 0, JSON.stringify(s1));
  await page.evaluate(() => import('./js/roles.js').then(r => r.setRole('scout'))); await sleep(400);
  let names = (await steps(page)).map(s => s[0]);
  ok('scout: the Day view is headed Shows and its walkthrough has a step called Shows', (await page.locator('.bk-dayview .page-head h1').innerText()) === 'Shows' && names.includes('Shows') && !names.includes('Bookings') && names.includes('Views') && names.includes('Export calendar') && (await page.locator(`#bk-ev-s-show1-${SHOW1}`).count()) === 1, names.join(', '));
  await toWeek(page, T);
  ids = await weekIds(page, T);
  ok('scout: the same rows in the same order, with the same notes', same(ids, ORDER) && (await row('c-E')).note === 'Overlaps with Sable, 21:30' && (await page.locator('.bk-calview > .page-head h1').innerText()) === 'Shows', ids.join(','));
  names = (await steps(page)).map(s => s[0]);
  ok('scout: Views and Export calendar are in the Week walkthrough too', names.includes('Views') && names.includes('Export calendar') && !names.includes('Shows'), names.join(', '));
  for (const role of ['producer', 'manager', 'band', 'solo', 'audiophile']) {
    await page.evaluate(id => import('./js/roles.js').then(m => m.setRole(id)), role); await sleep(400);
    const st = await page.evaluate(() => import('./js/roles.js').then(m => ({ want: m.sectionName('bookings', 'Bookings'), head: document.querySelector('.bk-calview > .page-head h1').textContent, views: document.querySelectorAll('.bk-views button').length, week: document.querySelectorAll('.bk-mode-week .bk-wday').length })));
    ok(`${role}: the same week under the role’s own name for the page, with the five views`, same(await weekIds(page, T), ORDER) && st.head === st.want && st.views === 5 && st.week === 7, JSON.stringify(st));
  }
  await page.evaluate(() => { localStorage.removeItem('gdex-role'); });

  // (The checks that need every step B branch merged go here: the sample is loaded and the busy night is seeded.)
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ------------------------------ a narrow phone, extra-large text and buttons ------------------------------ */
  for (const scheme of ['light', 'dark']) {
    const menu = scheme === 'dark' ? 'tape' : 'record'; // the two section menus, one in each pass
    const n = await open({ sample: true, viewport: { width: 320, height: 700 }, init: `try { localStorage.setItem('gdex-prefs', '${JSON.stringify({ scheme, menu, text: 'xlarge', targets: 'large' })}'); } catch (e) {}` });
    await n.page.waitForSelector('.bk-monthview');
    const D = await dayFromNow(n.page, 8);
    for (const rec of seed.filter(x => x.date)) await put(n.page, 'bookings', rec);
    await sleep(300);
    ok(`320 px, ${scheme}: extra-large text and large buttons are on, behind the ${menu} menu`, await n.page.evaluate(([s, m]) => document.documentElement.dataset.text === 'xlarge' && document.documentElement.dataset.targets === 'large' && document.documentElement.dataset.scheme === s && !!document.querySelector(m === 'tape' ? '#deck .dk-cassette' : '#deck .dk-record'), [scheme, menu]));
    await toDay(n.page, D);
    for (const v of ['month', 'two', 'week', 'three', 'day']) {
      await view(n.page, v);
      const fit = await n.page.evaluate(() => { const row = document.querySelector('.bk-views'), r = row.getBoundingClientRect(), on = row.querySelector('.on').getBoundingClientRect(), panel = document.querySelector('.bk-cal-panel').getBoundingClientRect();
        return { page: document.documentElement.scrollWidth, row: [row.scrollWidth, row.clientWidth], pressedInSight: on.left >= r.left - 1 && on.right <= r.right + 1, nav: [...document.querySelectorAll('.cal-nav button')].every(b => { const x = b.getBoundingClientRect(); return x.left >= panel.left && x.right <= panel.right; }), entries: document.querySelectorAll('.bk-cal-panel .bk-ev, .bk-cal-panel .bk-day.has').length }; });
      ok(`320 px, ${scheme}, ${v}: the page does not scroll sideways; the row of buttons scrolls inside itself with the pressed one in sight; ‹ Today › stay in the panel`, fit.page <= 320 && fit.row[0] > fit.row[1] && fit.pressedInSight && fit.nav && fit.entries > 0, JSON.stringify(fit));
    }
    ok(`no errors in the console (320 px, ${scheme})`, n.errors.length === 0, n.errors.slice(0, 5).join(' | '));
    await n.browser.close();
  }
})().catch(e => { console.log('FAIL calendar spec crashed — ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')); process.exit(1); });
