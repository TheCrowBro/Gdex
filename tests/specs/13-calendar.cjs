// The calendar's five views (js/bookings-cal.js): Month, 2 weeks and Week as day squares (the Week one row of them), 3
// days and Day as a time grid; one row of view buttons, ‹ Today › that step by the length of the view, and Coming up under
// every one. Only the view buttons save the view on the device.
// No date word is typed here: a day is read from data-date / data-day, and a title is compared with the same formatter
// run in the page. Every seeded day is counted from today in whole days, so nothing depends on the hour of the run.
const { open, ok, sleep, go, licenceAt } = require('../helpers.cjs');

const dayFromNow = (page, n) => page.evaluate(n => import('./js/util.js').then(u => { const d = new Date(); d.setDate(d.getDate() + n); return u.ymd(d); }), n);
const plus = (page, iso, n) => page.evaluate(([iso, n]) => import('./js/util.js').then(u => { const d = u.parseISO(iso); d.setDate(d.getDate() + n); return u.ymd(d); }), [iso, n]);
const put = (page, list, rec) => page.evaluate(([l, r]) => import('./js/store.js').then(s => s.upsert(l, r).id), [list, rec]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sheetNamed = (page, title) => page.locator(`.sheet[aria-label="${title}"]`);
const view = async (page, v) => { await page.click('#bk-view-' + v); await sleep(250); };
const modeOf = page => page.evaluate(() => (document.querySelector('.bk-calview').className.match(/bk-mode-(\w+)/) || [])[1]);
const title = page => page.locator('.bk-cal-panel .cal-title').evaluate(el => el.textContent);
const saved = page => page.evaluate(() => localStorage.getItem('tourbook-cal-view'));
const steps = page => page.evaluate(() => import('./js/pages/bookings.js').then(m => m.bookings.tutorial().map(s => [s.title, s.text, s.target])));
// What was last said aloud for a screen reader (util.js announce() fills #sr-live a moment after it is called).
const spoken = page => page.evaluate(() => new Promise(r => setTimeout(() => r((document.getElementById('sr-live') || {}).textContent || ''), 120)));
// The first day a view shows (the Day view has none to read when the day is empty: its title says the day).
const firstDay = page => page.evaluate(() => { const el = document.querySelector('.bk-cal .bk-day, .bk-grid-head'); return el ? el.dataset.date : null; });
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
// its square in the week, as a person gets there.
const weekSq = iso => `.bk-cal-week .bk-day[data-date="${iso}"]`;
async function toWeek(page, iso, back = false) {
  await view(page, 'week'); await page.waitForSelector('.bk-cal-week');
  if (await page.locator(weekSq(iso)).count()) return true;
  await page.click('[aria-label="Today, this week"]'); await sleep(150);
  return reach(page, weekSq(iso), back ? 'Previous week' : 'Next week');
}
// The titles of the cards the page's ? walkthrough shows, Next pressed to the end: a step with nothing on screen to
// point at is skipped.
async function tourTitles(page) {
  await page.click('#helpBtn'); await page.waitForSelector('.tour-card');
  const out = [];
  for (let i = 0; i < 20 && await page.locator('.tour-card').count(); i++) { out.push(await page.textContent('#tour-title')); await page.click('.tour-actions .btn.primary'); await sleep(450); }
  return out;
}
async function toDay(page, iso, back = false) { await toWeek(page, iso, back); await page.click(weekSq(iso)); await page.waitForSelector('.bk-dayview'); await sleep(200); }
// What a block or pill must tell a screen reader, from the model: the status, the overlap note, the venue's house
// rules as spoken (the sample's venues have some) and, when asked for, “Didn’t go”; each with a full stop.
const wantSaid = (page, id, { lead = '', went = false } = {}) => page.evaluate(([id, lead, went]) => Promise.all([import('./js/model.js'), import('./js/store.js')]).then(([m, st]) => {
  const b = st.byId('bookings', id);
  return [lead, m.statusLabel(b.status), m.overlapText(b), (m.rulesChipText(m.showRulesVenue(b)) || {}).spoken, went && 'Didn’t go'].filter(Boolean).map(x => x + '.').join(' ');
}), [id, lead, went]);
// A day of the Week, as its square says it to a screen reader: the day's bookings in the order it names them (each by
// its time, when it has one, and its name, after “: ” or “. ”), from the model; and the spoken name itself.
const weekIds = (page, iso) => page.evaluate(iso => Promise.all([import('./js/store.js'), import('./js/model.js')]).then(([s, m]) => {
  const sq = document.querySelector(`.bk-cal-week .bk-day[data-date="${iso}"]`), label = sq ? sq.getAttribute('aria-label') : '';
  const at = b => { const k = m.playKey(b), head = (k == null ? '' : m.nightClock(k) + ' ') + m.bookingTitle(b) + (m.formerlyNote(b) ? ', ' + m.formerlyNote(b) : '') + ' ('; return Math.max(label.indexOf(': ' + head), label.indexOf('. ' + head)); };
  return s.db.bookings.filter(b => s.covers(b, iso)).map(b => [b.id, at(b)]).filter(x => x[1] >= 0).sort((a, b) => a[1] - b[1]).map(x => x[0]);
}), iso);
const weekSaid = (page, iso) => page.locator(weekSq(iso)).getAttribute('aria-label');
// One booking's sentence in a square's spoken name: from its time and name to the full stop before the next booking.
const sentence = (label, head) => { const i = Math.max(label.indexOf(': ' + head), label.indexOf('. ' + head)); if (i < 0) return null; const from = i + 2, end = label.indexOf('. ', from); return label.slice(from, end < 0 ? undefined : end); };
// The lines a square shows, as words (a line that runs on from the day before is blank), and its “+N”.
const linesOf = (page, iso) => page.evaluate(iso => { const sq = document.querySelector(`.bk-day[data-date="${iso}"]`); return { lines: [...sq.querySelectorAll('.bk-mini')].map(m => m.textContent.trim()), more: (sq.querySelector('.more') || {}).textContent || '' }; }, iso);
// A square of the two weeks as it is drawn. For each line: its time, and whether the time is whole inside the line (by
// where its letters are drawn); where the name is ('under' or 'beside' the time, 'alone' on a line with no time, or
// 'none' when it is left out); that a name shown is one line, cut with an ellipsis; that the line is inside the square
// from top to bottom (a bar over several days runs on through its side). And the "+N" under the lines, when it is
// inside the square.
const squareLines = (page, iso) => page.evaluate(iso => {
  const sq = document.querySelector(`.bk-day[data-date="${iso}"]`), s = sq.getBoundingClientRect(), more = sq.querySelector('.more');
  const inSq = r => r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5 && r.left >= s.left - 0.5 && r.right <= s.right + 0.5;
  return { h: Math.round(s.height), more: more && inSq(more.getBoundingClientRect()) ? more.textContent : null, lines: [...sq.querySelectorAll('.bk-mini')].map(m => {
    const r = m.getBoundingClientRect(), t = m.querySelector('.bk-mini-time'), n = m.querySelector('.bk-mini-name'), cs = n && getComputedStyle(n);
    let tr = null;
    if (t) { const range = document.createRange(); range.selectNodeContents(t); tr = range.getBoundingClientRect(); }
    const nr = n && n.getBoundingClientRect(), shown = !!n && cs.display !== 'none' && nr.width >= 8;
    return { time: t ? t.textContent : '', timeWhole: !t || (tr.width > 8 && tr.left >= r.left - 0.5 && tr.right <= r.right + 0.5 && tr.bottom <= r.bottom + 0.5),
      name: !shown ? 'none' : !t ? 'alone' : nr.top >= tr.bottom - 1 ? 'under' : nr.left >= tr.right - 0.5 ? 'beside' : 'over',
      oneLine: !shown || (n.getClientRects().length === 1 && nr.height < 1.8 * parseFloat(cs.fontSize) && cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis' && nr.right <= r.right + 0.5 && nr.bottom <= r.bottom + 0.5),
      inside: r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5 };
  }) };
}, iso);
// Small words read at 4.5:1 or better: for each selector, the words of the first one on screen against the colour painted
// behind them (flat colours laid over each other up the page), in the light scheme of every theme at standard contrast.
// Gives the lowest ratio and its theme, or null when nothing on screen matches.
const inkLow = (page, sels) => page.evaluate(sels => import('./js/a11y.js').then(({ PALETTES }) => {
  const cx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const rgba = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const behind = el => { const chain = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); chain.push(c); if (c[3] === 1) break; } return chain.reduceRight((c, top) => over(top, c), [255, 255, 255, 1]); };
  const root = document.documentElement, was = { ...root.dataset }, out = {};
  for (const sel of sels) {
    const el = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length && e.textContent.trim());
    if (!el) { out[sel] = null; continue; }
    let low = 99, where = '';
    for (const p of PALETTES) {
      Object.assign(root.dataset, { palette: p.id, scheme: 'light', contrast: 'normal' });
      const bg = behind(el), fg = over(rgba(getComputedStyle(el).color), bg), x = lum(fg), y = lum(bg), r = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      if (r < low) { low = r; where = p.name; }
    }
    out[sel] = [Math.round(low * 100) / 100, where];
  }
  Object.assign(root.dataset, was);
  return out;
}), sels);
const NAV = {
  month: ['Previous month', 'Today, this month', 'Next month'], two: ['Previous two weeks', 'Today, these two weeks', 'Next two weeks'], week: ['Previous week', 'Today, this week', 'Next week'],
  three: ['Previous three days', 'Today and the next two days', 'Next three days'], day: ['Previous day', 'Today', 'Next day'],
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

    // A day opened from its square is the Day view for this visit; it is not the view Tourbook opens on next time.
    await page.locator(`.bk-day[data-date="${today}"]`).click(); await page.waitForSelector('.bk-dayview');
    ok('tapping a day square opens the Day view on that day, with the focus on its name', (await modeOf(page)) === 'day' && (await title(page)) === (await wantTitle(page, 'day', today, today)) + ' · today'
      && await page.evaluate(() => document.activeElement && document.activeElement.matches('h2.cal-title[data-view-head]')) && (await page.getAttribute('#bk-view-day', 'aria-pressed')) === 'true', await title(page));
    ok('…and that is not saved', (await saved(page)) === null);
    await page.reload(); await page.waitForSelector('#deck .dk-next'); await page.waitForSelector('.bk-calview');
    ok('after a reload Tourbook opens on Month again', (await modeOf(page)) === 'month' && (await page.locator('.bk-monthview').count()) === 1);

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
      ok(`${v}: only the month is .bk-monthview and only the day .bk-dayview; one heading takes the focus on arrival`, at.month === (v === 'month' ? 1 : 0) && at.day === (v === 'day' ? 1 : 0) && same(at.heads, [v === 'day' ? 'H2' : 'H1']) && at.live === null, JSON.stringify(at));
      ok(`${v}: ‹, Today and › are named for the view; the legend sits under squares only; no tab or grid roles`, same(at.nav, NAV[v]) && at.todayText === 'Today' && at.legend === (v === 'three' || v === 'day' ? 0 : 1) && at.roles === 0, JSON.stringify(at.nav));
      ok(`${v}: the Today button’s spoken name starts with the word it shows, so “click Today” finds it`, at.nav[1].split(/[ ,]/)[0] === at.todayText, at.nav[1]);

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
      // The page is drawn again at every step, and a live region that arrives with its words in it is not read out: the
      // title is no live region, and each step says the new title through the app's own announcer.
      ok(`${v}: …and the new title is said aloud`, (await spoken(page)) === t1, await spoken(page));
      await page.click(`[aria-label="${NAV[v][0]}"]`); await sleep(200);
      ok(`${v}: ‹ steps back the same way`, (await title(page)) === t0 && (await shown()) === d0);
      await page.click(`[aria-label="${NAV[v][2]}"]`); await page.click(`[aria-label="${NAV[v][2]}"]`); await sleep(150);
      await page.click(`[aria-label="${NAV[v][1]}"]`); await sleep(200);
      ok(`${v}: Today comes back to today`, (await title(page)) === t0 && (await shown()) === d0);
      ok(`${v}: …and says so aloud`, (await spoken(page)) === (v === 'day' ? (await wantTitle(page, 'day', first, first)) + ', today' : t0), await spoken(page));
      if (v === 'two' || v === 'week') ok(`${v}: the days start on a Monday`, await page.evaluate(iso => import('./js/util.js').then(u => u.parseISO(iso).getDay() === 1), d0), d0);

      // nothing booked: each view says so in its own words, and the Coming up box is the only .empty
      const none = await page.locator('.bk-cal-panel .bk-none').allTextContents();
      if (v === 'week') {
        const wk = await page.evaluate(() => [...document.querySelectorAll('.bk-cal-week .bk-day')].map(d => ({ tag: d.tagName, tall: d.classList.contains('bk-day-tall'), top: d.offsetTop, label: d.getAttribute('aria-label') })));
        ok('week: one row of seven tall squares, each a button saying “nothing booked”, today marked; no list, no “Nothing on”', wk.length === 7 && wk.every(d => d.tag === 'BUTTON' && d.tall && d.top === wk[0].top && d.label.endsWith(': nothing booked')) && none.length === 0
          && (await page.locator('.bk-cal-week .bk-day.today[aria-current="date"]').count()) === 1 && (await page.locator('.bk-cal-panel .bk-ev, .bk-cal-panel .bk-day.blank').count()) === 0, JSON.stringify(wk.map(d => [d.top, d.label])));
      }
      if (v === 'three') ok('three days: “Nothing on these three days.” under the three days’ names, and no hours', same(none, ['Nothing on these three days.']) && (await page.locator('.bk-grid-head').count()) === 3 && (await page.locator('.bk-grid-body, .bk-any').count()) === 0, none.join('|'));
      if (v === 'day') ok('day: “Nothing booked on this day.” with “+ New on this day”, and no grid', same(none, ['Nothing booked on this day.']) && (await page.locator('.bk-grid').count()) === 0 && (await page.locator('.bk-cal-panel .bk-new-day').count()) === 1, none.join('|'));
      if (v === 'two') ok('two weeks: fourteen tall squares, today marked', (await page.locator('.bk-cal-two .bk-day.bk-day-tall').count()) === 14 && (await page.locator('.bk-cal-two .bk-day').count()) === 14 && (await page.locator('.bk-day.today[aria-current="date"]').count()) === 1);

      // the walkthrough
      const tour = await steps(page), names = tour.map(s => s[0]);
      const cal = (tour.find(s => s[0] === 'The calendar') || [])[1] || '';
      // The filter chips are under the calendar: their step comes after it, as a keyboard and a screen reader meet them.
      ok(`${v}: the walkthrough has New booking, Export calendar, Views, The calendar, Filters and Coming up`, same(names.filter(n => !['Add to this day', 'Bookings'].includes(n)), ['New booking', 'Export calendar', 'Views', 'The calendar', 'Filters', 'Coming up'])
        && (tour.find(s => s[0] === 'Views') || [])[1] === 'Month, 2 weeks, Week, 3 days or Day. Tourbook opens on the one you picked here last.' && same((tour.find(s => s[0] === 'Coming up') || [])[2], ['.bk-agenda', '.bk-calview > .empty']), names.join(', '));
      ok(`${v}: …and its Filters step says the chips are under the calendar, and points at them`, same(tour.find(s => s[0] === 'Filters'), ['Filters', 'Under the calendar: show one act, or one kind of booking, on the calendar and in Coming up.', ['.bk-filters']]), JSON.stringify(tour.find(s => s[0] === 'Filters')));
      ok(`${v}: …and The calendar step speaks of this view`, cal.startsWith({ month: 'Each line or dot is a booking', two: 'Two weeks of days, each booking with the time the band plays.', week: 'One week of tall days, each booking with the time the band plays, in the order they play. Tap a day to open it; swipe, or use ‹ ›, to move a week.', three: 'Three days with nothing on. Tap a day’s name to see that day alone', day: 'Hours run down the side' }[v]), cal); // no hours on three empty days (an empty Day skips the step)
      ok(`${v}: only the Day view adds “Add to this day” and a step named after the page`, names.includes('Add to this day') === (v === 'day') && names.includes('Bookings') === (v === 'day'), names.join(', '));
    }

    // the view picked with a button is the view Tourbook opens on, around today
    await view(page, 'week');
    await page.reload(); await page.waitForSelector('#deck .dk-next'); await page.waitForSelector('.bk-cal-week');
    const now = await dayFromNow(page, 0);
    const wk = await page.evaluate(() => ({ pressed: document.querySelector('#bk-view-week').getAttribute('aria-pressed'), first: document.querySelector('.bk-cal-week .bk-day').dataset.date, today: [...document.querySelectorAll('.bk-cal-week .bk-day.today')].map(b => [b.dataset.date, b.getAttribute('aria-label'), b.getAttribute('aria-current')]) }));
    const long = await wantTitle(page, 'day', now, now);
    ok('Week picked, then a reload: Tourbook opens on the Week view, on this week', (await modeOf(page)) === 'week' && wk.pressed === 'true' && wk.first === (await monday(page, now)), JSON.stringify(wk));
    ok('today’s square is marked, and says so to a screen reader', same(wk.today, [[now, `${long}, today: nothing booked`, 'date']]), JSON.stringify(wk.today));
    // The first square, as in two weeks, says the month as well as the number.
    const wkFirst = await page.evaluate(() => { const f = document.querySelector('.bk-cal-week .bk-day'); return [f.dataset.date, f.querySelector('.num').textContent, (f.querySelector('.bk-mon') || {}).textContent]; });
    const wkMon = await page.evaluate(iso => import('./js/util.js').then(u => [u.parseISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), u.parseISO(iso).toLocaleDateString(undefined, { month: 'short' })]), wkFirst[0]);
    ok('…and the first square says the month as well as the number, as in two weeks', wkFirst[1] === wkMon[0] && wkFirst[2] === wkMon[1], JSON.stringify([wkFirst, wkMon]));

    // three days start on the day in view; Today brings them back to today
    const other = await page.evaluate(now => [...document.querySelectorAll('.bk-cal-week .bk-day')].map(b => b.dataset.date).find(d => d !== now), now);
    await page.click(weekSq(other)); await page.waitForSelector('.bk-dayview');
    ok('a square in the week opens the Day view on that day, and the saved view is still Week', (await title(page)) === (await wantTitle(page, 'day', other, other)) && (await saved(page)) === 'week', await title(page));
    await view(page, 'three');
    ok('three days start on the day in view', (await firstDay(page)) === other && same(await page.locator('.bk-grid-head').evaluateAll(els => els.map(e => e.dataset.date)), [other, await plus(page, other, 1), await plus(page, other, 2)]));
    await page.click('[aria-label="Today and the next two days"]'); await sleep(200);
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
    // the week: the arrow keys move between its days as in two weeks; past its edges they step a week, as ‹ › do
    await view(page, 'week');
    const w0 = await firstDay(page), focusAt = () => page.evaluate(() => ({ focus: document.activeElement && document.activeElement.dataset.date, first: document.querySelector('.bk-cal-week .bk-day').dataset.date, page: window.logiPage(), mode: (document.querySelector('.bk-calview').className.match(/bk-mode-(\w+)/) || [])[1] }));
    await page.locator('.bk-cal-week .bk-day').nth(2).focus(); await page.keyboard.press('ArrowRight'); await sleep(250);
    at = await focusAt();
    ok('week: → moves to the next day, and stays in the calendar', at.focus === (await plus(page, w0, 3)) && at.first === w0 && at.page === 'bookings' && at.mode === 'week', JSON.stringify(at));
    await page.locator('.bk-cal-week .bk-day').last().focus(); await page.keyboard.press('ArrowRight'); await sleep(250);
    at = await focusAt();
    ok('…→ from Sunday shows the next week and lands on its Monday', at.focus === (await plus(page, w0, 7)) && at.first === (await plus(page, w0, 7)) && at.mode === 'week', JSON.stringify(at));
    await page.keyboard.press('ArrowLeft'); await sleep(250);
    at = await focusAt();
    ok('…← from Monday goes back a week, onto the Sunday', at.focus === (await plus(page, w0, 6)) && at.first === w0, JSON.stringify(at));
    await page.locator('.bk-cal-week .bk-day').nth(2).focus(); await page.keyboard.press('ArrowDown'); await sleep(250);
    at = await focusAt();
    ok('…↓ lands on the same day of the next week', at.focus === (await plus(page, w0, 9)) && at.first === (await plus(page, w0, 7)), JSON.stringify(at));
    await page.keyboard.press('ArrowUp'); await sleep(250);
    at = await focusAt();
    ok('…and ↑ comes back', at.focus === (await plus(page, w0, 2)) && at.first === w0 && (await saved(page)) === 'week', JSON.stringify(at));
    // A change made elsewhere (another device, another tab) draws the page again: the focus stays on the day, though its
    // spoken name changes with what is on it.
    const sqDay = await plus(page, w0, 2);
    await put(page, 'bookings', { id: 'c-elsewhere', kind: 'show', status: 'confirmed', title: 'From Elsewhere', date: sqDay, setTime: '20:00' }); await sleep(350);
    const kept = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.dataset.date, said: document.activeElement && document.activeElement.getAttribute('aria-label') }));
    await page.evaluate(() => import('./js/store.js').then(s => s.remove('bookings', 'c-elsewhere'))); await sleep(350);
    const keptAgain = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.dataset.date, said: document.activeElement && document.activeElement.getAttribute('aria-label') }));
    ok('…a booking added to the focused day from elsewhere, then taken away, leaves the focus on that day each time', kept.focus === sqDay && /20:00 From Elsewhere/.test(kept.said || '') && keptAgain.focus === sqDay && /: nothing booked$/.test(keptAgain.said || ''), JSON.stringify([kept, keptAgain]));
    await page.keyboard.press('Enter'); await page.waitForSelector('.bk-dayview');
    ok('…and Enter opens that day, with the focus on its name', (await title(page)) === (await wantTitle(page, 'day', await plus(page, w0, 2), await plus(page, w0, 2))) + ((await plus(page, w0, 2)) === now ? ' · today' : '') && await page.evaluate(() => document.activeElement && document.activeElement.matches('.bk-dayview h2.cal-title')), await title(page));

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
  // A day's square names its bookings as two weeks does: a booking over several days first, then the day in playing order.
  const SQUARE = ['c-W', ...ORDER.filter(id => id !== 'c-W')];
  const fmt = (iso, f = 'fmtShort') => page.evaluate(([iso, f]) => import('./js/util.js').then(u => u[f](iso)), [iso, f]);
  // Where a venue is, as a list of the day prints it under a name that already says the venue (its address's first
  // line), and its house rules as a screen reader is given them, from the model.
  const addr = id => page.evaluate(id => import('./js/store.js').then(s => String(s.byId('venues', id).address || '').split('\n')[0].trim()), id);
  const rulesOf = id => page.evaluate(id => Promise.all([import('./js/model.js'), import('./js/store.js')]).then(([m, s]) => (m.rulesChipText(m.showRulesVenue(s.byId('bookings', id))) || {}).spoken || ''), id);

  /* ---------------- Week: one row of tall day squares ---------------- */
  ok('the week of the busy night is a few taps of › away', await toWeek(page, T));
  let ids = await weekIds(page, T);
  ok('week: a day’s square names its bookings as two weeks does: the two-day booking, then the order the bands play, the cancelled one and the one with no time too', same(ids, SQUARE), ids.join(','));
  let said = await weekSaid(page, T);
  const [lantern, harbour, rulesE, rulesA] = [await addr('s-lantern'), await addr('s-harbour'), await rulesOf('c-E'), await rulesOf('c-A')];
  const busy = [`Weekender (Confirmed): to ${await fmt(T1, 'fmtLong')}; no time yet`, '18:00 The Night Owls @ The Old Vic (Cancelled)', '19:00 First On (Confirmed): The Crown', '20:00 Second On (Confirmed): The Crown',
    `21:00 The Night Owls @ The Lantern Rooms (Confirmed): ${lantern}; Overlaps with Sable, 21:30; ${rulesE}`, `21:30 Sable @ Harbour Hall (Hold): ${harbour}; Overlaps with The Night Owls, 21:00; ${rulesA}`,
    '23:00 Late Shift (Confirmed): The Crown', '00:30 The Night Owls @ Club 9 (Confirmed): after midnight', 'Sable @ Somewhere (Confirmed): no time yet'];
  ok('its spoken name says what a list of the day would print, each booking a sentence: the time and name, the status, then when it ends, where, after midnight or no time yet, the overlap note and the house rules', said === `${await fmt(T, 'fmtLong')}: ${busy.join('. ')}` && !!lantern && !!harbour && rulesE.startsWith('House rules') && rulesA.startsWith('House rules'), said);
  ok('…the two shows whose sets overlap say so, and no other booking does', (said.match(/Overlaps with/g) || []).length === 2 && sentence(said, '19:00 First On (').indexOf('Overlaps') < 0, said);
  const sq = await page.evaluate(T => { const s = document.querySelector(`.bk-cal-week .bk-day[data-date="${T}"]`), m = [...s.querySelectorAll('.bk-mini')];
    return { tag: s.tagName, inner: s.querySelectorAll('button, a').length, strike: getComputedStyle(m[1]).textDecorationLine, plain: getComputedStyle(m[2]).textDecorationLine, held: getComputedStyle(m[5]).outlineStyle, chips: document.querySelectorAll('.bk-cal-panel .vn-chip, .bk-cal-panel .bk-overlap, .bk-cal-panel .pill').length }; }, T);
  const busyLines = await linesOf(page, T);
  ok('the square is a button that shows six lines (each booking’s time and the start of its name), then “+3 more”', sq.tag === 'BUTTON' && sq.inner === 0 && same(busyLines.lines, ['Weekender', '18:00 The Night Owls', '19:00 First On', '20:00 Second On', '21:00 The Night Owls', '21:30 Sable']) && busyLines.more === '+3 more', JSON.stringify(busyLines));
  ok('…the cancelled one struck through and the hold dashed, as in two weeks; no chip, note or pill is drawn on the calendar', sq.strike.includes('line-through') && sq.plain === 'none' && sq.held === 'dashed' && sq.chips === 0, JSON.stringify(sq));
  await reach(page, weekSq(T1), 'Next week');
  ids = await weekIds(page, T1); said = await weekSaid(page, T1);
  const t1Monday = (await monday(page, T1)) === T1; // a week starts on a Monday: there the bar says its name again
  ok('…the two-day booking is on its second day as well, first, its line running on (named again only on a Monday); then the day’s own (10:00 session, doors 19:30)', same(ids, ['c-W', 'c-S', 'c-B']) && (await linesOf(page, T1)).lines[0] === (t1Monday ? 'Weekender' : '') && sentence(said, 'Weekender (') === `Weekender (Confirmed): to ${await fmt(T1, 'fmtLong')}; no time yet`, `${ids.join(',')} ${said}`);
  ok('a show sorted by its doors shows that time, and its spoken name says “Doors 19:30” (the label and the time), never a bare “doors”', (await linesOf(page, T1)).lines[2] === '19:30 Sable' && sentence(said, '19:30 Sable @ Harbour Hall (') === `19:30 Sable @ Harbour Hall (Confirmed): Doors 19:30; ${harbour}; ${await rulesOf('c-B')}` && !/\bdoors\b/.test(said), said);
  await reach(page, weekSq(T4), 'Next week');
  said = await weekSaid(page, T4);
  ok('…as does one sorted by its soundcheck (“Soundcheck 17:00”), and one by its doors alone (“Doors 20:00”)', sentence(said, '17:00 Early Doors (') === '17:00 Early Doors (Confirmed): Soundcheck 17:00; The Crown' && sentence(said, '20:00 Doors Only (') === '20:00 Doors Only (Confirmed): Doors 20:00; The Crown' && !/\b(doors|soundcheck|load-in)\b/.test(said), said);
  await toWeek(page, T);
  const empties = await page.evaluate(() => [...document.querySelectorAll('.bk-cal-week .bk-day:not(.has)')].map(d => [d.getAttribute('aria-label').split(': ').pop(), d.querySelectorAll('.bk-mini').length]));
  ok('a day with nothing on says “nothing booked” and shows no line', empties.length >= 1 && empties.every(e => e[0] === 'nothing booked' && e[1] === 0), JSON.stringify(empties));
  ok('a booking with no date is in no square', (await page.locator('.bk-calview [data-id="c-nodate"]').count()) === 0 && await page.evaluate(() => [...document.querySelectorAll('.bk-cal-week .bk-day')].every(d => !d.getAttribute('aria-label').includes('No date yet'))));

  // the filter chips: right under the calendar box, above Coming up; they apply to the view as well as to Coming up
  const place = () => page.evaluate(() => { const root = document.querySelector('.bk-calview'), panel = root.querySelector('.bk-cal-panel').getBoundingClientRect(), f = root.querySelector('.bk-filters').getBoundingClientRect(), head = root.querySelector('.bk-agenda-head').getBoundingClientRect();
    return { kids: [...root.children].map(c => c.className.split(' ')[0]), gap: Math.round(f.top - panel.bottom), under: Math.round(head.top - f.bottom), page: document.documentElement.scrollWidth <= innerWidth }; });
  for (const v of ['month', 'two', 'week', 'three', 'day']) {
    await view(page, v);
    const at = await place();
    ok(`${v}: the filter chips sit right under the calendar box and above Coming up, in the page's order as on screen`, same(at.kids, ['page-head', 'cal-panel', 'bk-filters', 'bk-agenda-head', 'bk-agenda']) && at.gap >= 0 && at.gap <= 16 && at.under >= 0 && at.under <= 40 && at.page, JSON.stringify(at));
  }
  // On a laptop Coming up is beside the calendar: the chips stay under the calendar box, in its column.
  await page.setViewportSize({ width: 1280, height: 900 }); await sleep(250);
  for (const v of ['month', 'week', 'day']) {
    await view(page, v);
    const at = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), p = r('.bk-cal-panel'), f = r('.bk-filters'), hd = r('.bk-agenda-head');
      return { left: Math.round(f.left - p.left), width: Math.round(f.width - p.width), gap: Math.round(f.top - p.bottom), beside: hd.left >= p.right && Math.abs(hd.top - p.top) <= 2 }; });
    ok(`1280 px, ${v}: the chips are under the calendar box, as wide as it, with Coming up beside it from its top`, at.left === 0 && at.width === 0 && at.gap >= 0 && at.gap <= 16 && at.beside, JSON.stringify(at));
  }
  await page.setViewportSize({ width: 420, height: 900 }); await sleep(250);
  await toWeek(page, T);
  // A tap on a chip draws the page again, and the calendar above the chips can grow or shrink with the filter (a
  // square's “+N”; the line a week the filters leave empty shows at its top): the page scrolls by as much, so the chip
  // stays where it was on screen (never the top of the page), with the focus on it, and clear of the section menu.
  const chipAt = t => page.evaluate(t => { const c = [...document.querySelectorAll('.bk-filters .chip')].find(x => x.textContent.includes(t)), r = c.getBoundingClientRect(), nav = document.getElementById('deck');
    return { top: Math.round(r.top), y: Math.round(scrollY), cal: Math.round(document.querySelector('.bk-cal-panel').getBoundingClientRect().height), focus: document.activeElement === c, pressed: c.getAttribute('aria-pressed'), clear: nav.classList.contains('tucked') || r.top >= nav.getBoundingClientRect().bottom, id: c.id }; }, t);
  const keptAt = (a, b) => Math.abs(b.top - a.top) <= 1 && Math.abs((b.y - a.y) - (b.cal - a.cal)) <= 2; // the chip in place, the page moved by what the calendar grew
  const tapChip = async t => { const b = await page.locator('.bk-filters .chip', { hasText: t }).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await sleep(400); return chipAt(t); };
  const tapAt = async t => [await chipAt(t), await tapChip(t)]; // the chip just before the tap, and just after
  await page.evaluate(() => { const c = [...document.querySelectorAll('.bk-filters .chip')].find(x => x.textContent.includes('Sable')); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - innerHeight + 90); }); await sleep(400);
  const c0 = await chipAt('Sable'), c1 = await tapChip('Sable');
  ids = await weekIds(page, T);
  ok('with an act’s chip on, only that act’s bookings are left in the square', same(ids, ['c-A', 'c-D']) && same((await linesOf(page, T)).lines, ['21:30 Sable', 'Sable']), ids.join(','));
  ok('…and the chip, tapped under the calendar, stays where it was on screen (the page moved by what the week above it lost), pressed and with the focus', keptAt(c0, c1) && c1.cal <= c0.cal && c1.focus && c1.pressed === 'true' && c1.clear && c1.id === 'bk-f-act-s-sablea', JSON.stringify([c0, c1]));
  // Sable has no rehearsal on any day: with both chips on, nothing in the week is left. It says so once, at the top of
  // the squares, with the way to clear the filters (the chips are under a week that can be taller than the screen); each
  // square is spoken as “nothing booked” and shows no line. The line makes the week taller: the chip is held all the same.
  const [r0, r1] = await tapAt('Rehearsals');
  ok('…as is a kind’s chip that leaves nothing in the week, the week growing by the line at its top', keptAt(r0, r1) && r1.cal > r0.cal + 20 && r1.focus && r1.pressed === 'true' && r1.clear && r1.id === 'bk-f-kind-rehearsal', JSON.stringify([r0, r1]));
  const hid = await page.evaluate(() => { const body = document.querySelector('.bk-body'), top = body.firstElementChild;
    return { top: top.className, next: top.nextElementSibling && top.nextElementSibling.matches('.bk-cal-week'), says: top.querySelector('.bk-none').textContent, btn: (top.querySelector('button') || {}).textContent, id: (top.querySelector('button') || {}).id,
      days: [...document.querySelectorAll('.bk-cal-week .bk-day')].map(d => [d.getAttribute('aria-label').split(': ').pop(), d.querySelectorAll('.bk-mini').length]) }; });
  ok('with chips on that nothing in the week matches, the week says “Nothing on with these filters.” over its squares, with Clear the filters, and each square “nothing booked”', same(await weekIds(page, T), []) && hid.top === 'bk-filtered' && hid.next && hid.says === 'Nothing on with these filters.' && hid.btn === 'Clear the filters' && hid.id === 'bk-filters-clear' && same(hid.days, Array(7).fill(['nothing booked', 0])), JSON.stringify(hid));
  const [n0, n1] = await tapAt('All kinds'); // Sable alone: the week has some of its bookings
  ok('…and All kinds, the line going and the week shorter again, keeps the chip where it was, pressed and with the focus', keptAt(n0, n1) && n1.cal < n0.cal - 20 && n1.cal === c1.cal && n1.focus && n1.pressed === 'true' && n1.clear, JSON.stringify([n0, n1]));
  const some = await page.evaluate(() => ({ top: document.querySelectorAll('.bk-filtered').length, day: [...document.querySelectorAll('.bk-cal-week .bk-day:not(.has)')].map(d => [d.getAttribute('aria-label').split(': ').pop(), d.querySelectorAll('.bk-mini').length]) }));
  ok('…while in a week that has something left, nothing more is said at the top, and an empty square says “nothing booked” and shows no line', some.top === 0 && some.day.length >= 1 && some.day.every(d => d[0] === 'nothing booked' && d[1] === 0), JSON.stringify(some));
  const [a0, a1] = await tapAt('All acts');
  ok('…as does All acts, the week back as it was', keptAt(a0, a1) && a1.cal === c0.cal && a1.focus && a1.pressed === 'true' && a1.clear && same(await weekIds(page, T), SQUARE), JSON.stringify([c0, a0, a1]));
  await page.locator('.bk-filters .chip', { hasText: 'Rehearsals' }).click(); await sleep(250);
  ok('with a kind’s chip on that nothing on the day matches, its square says “nothing booked” and shows no line', same(await weekIds(page, T), []) && (await weekSaid(page, T)) === `${await fmt(T, 'fmtLong')}: nothing booked` && (await linesOf(page, T)).lines.length === 0);
  await page.locator('.bk-filters .chip', { hasText: 'Sable' }).click(); await sleep(250);
  await page.click(weekSq(T)); await page.waitForSelector('.bk-dayview');
  ok('…and the Day view reads “Nothing on with these filters.” with Clear the filters, the chips under it', (await page.locator('.bk-dayview .bk-none').textContent()) === 'Nothing on with these filters.' && (await page.locator('.bk-dayview .bk-filtered #bk-filters-clear').count()) === 1 && (await page.locator('.bk-grid').count()) === 0
    && (await page.locator('.bk-cal-panel + .bk-filters .chip.on', { hasText: 'Rehearsals' }).count()) === 1);
  await view(page, 'three');
  ok('…as do three days, under their names', (await page.locator('.bk-cal-panel .bk-none').textContent()) === 'Nothing on with these filters.' && (await page.locator('.bk-grid + .bk-filtered #bk-filters-clear').count()) === 1);
  await view(page, 'month');
  ok('…and a month with nothing left, above its squares', (await page.locator('.bk-body > .bk-filtered:first-child .bk-none').textContent()) === 'Nothing on with these filters.' && (await page.locator('.bk-body > .bk-filtered + .bk-cal').count()) === 1);
  // Clear the filters: both go, the focus moves to what is drawn where the line was (the month's first square), on
  // screen, the page not moved, and it is said aloud. The line is first brought just under the section menu, wholly in
  // sight: where the page happens to be depends on the fonts, and a line half under the menu would rightly move the page
  // (the 320 px checks below take that case).
  const lineInSight = async () => {
    await page.evaluate(() => { const f = document.querySelector('.bk-body > .bk-filtered'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - document.getElementById('deck').offsetHeight - 20); }); await sleep(400);
    return page.evaluate(() => { const r = document.querySelector('.bk-body > .bk-filtered').getBoundingClientRect(), nav = document.getElementById('deck');
      return { y: Math.round(scrollY), seen: r.top >= 0 && r.bottom <= innerHeight && (nav.classList.contains('tucked') || r.top >= nav.getBoundingClientRect().bottom) }; });
  };
  const mpre = await lineInSight(), y0 = mpre.y, first = await page.locator('.bk-body .bk-day').first().getAttribute('data-date');
  await page.click('#bk-filters-clear'); await sleep(250);
  const cleared = await page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(), nav = document.getElementById('deck');
    return { on: [...document.querySelectorAll('.bk-filters .chip.on')].map(c => c.textContent), focus: a.matches('.bk-body .bk-day') && a.dataset.date, seen: r.top >= 0 && r.bottom <= innerHeight && (nav.classList.contains('tucked') || r.top >= nav.getBoundingClientRect().bottom), y: Math.round(scrollY), filtered: document.querySelectorAll('.bk-filtered').length, head: document.querySelector('.bk-agenda-head').textContent }; });
  ok('Clear the filters in the view clears both, puts the focus on the month’s first square, in sight, the page not moved, and says so', mpre.seen && same(cleared.on, ['All kinds', 'All acts']) && cleared.focus === first && cleared.seen && Math.abs(cleared.y - y0) <= 1 && cleared.filtered === 0 && cleared.head === 'Coming up' && (await spoken(page)) === 'Filters cleared', JSON.stringify([mpre, cleared]));
  // Coming up's own Clear the filters, under the chips: the focus moves up to the first chip, which stays where it was.
  await page.locator('.bk-filters .chip', { hasText: 'Sable' }).click(); await sleep(200);
  await page.locator('.bk-filters .chip', { hasText: 'Rehearsals' }).click(); await sleep(250);
  await page.locator('#bk-agenda-clear').scrollIntoViewIfNeeded(); await sleep(300);
  const k0 = await page.evaluate(() => Math.round(document.getElementById('bk-f-kind').getBoundingClientRect().top));
  await page.click('#bk-agenda-clear'); await sleep(250);
  const cleared2 = await page.evaluate(() => ({ on: [...document.querySelectorAll('.bk-filters .chip.on')].map(c => c.textContent), focus: document.activeElement && document.activeElement.id, top: Math.round(document.getElementById('bk-f-kind').getBoundingClientRect().top) }));
  ok('…and Coming up’s Clear the filters puts the focus on the first chip, just above it, where it was', same(cleared2.on, ['All kinds', 'All acts']) && cleared2.focus === 'bk-f-kind' && Math.abs(cleared2.top - k0) <= 1 && (await spoken(page)) === 'Filters cleared', JSON.stringify([k0, cleared2]));
  // The same in the Week, whose squares are the month's: the line over them, Clear the filters there putting the focus
  // on the week's first square (its Monday), in sight, the page not moved; Coming up's own keeping the first chip in place.
  await toWeek(page, T);
  await page.locator('.bk-filters .chip', { hasText: 'Sable' }).click(); await sleep(200);
  await page.locator('.bk-filters .chip', { hasText: 'Rehearsals' }).click(); await sleep(250);
  ok('the Week with nothing left says so above its squares', (await page.locator('.bk-body > .bk-filtered:first-child .bk-none').textContent()) === 'Nothing on with these filters.' && (await page.locator('.bk-body > .bk-filtered + .bk-cal-week').count()) === 1);
  const wpre = { ...(await lineInSight()), first: await page.locator('.bk-cal-week .bk-day').first().getAttribute('data-date') };
  await page.click('#bk-filters-clear'); await sleep(250);
  const wcleared = await page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(), nav = document.getElementById('deck');
    return { on: [...document.querySelectorAll('.bk-filters .chip.on')].map(c => c.textContent), focus: a.matches('.bk-cal-week .bk-day') && a.dataset.date, id: a.id, seen: r.top >= 0 && r.bottom <= innerHeight && (nav.classList.contains('tucked') || r.top >= nav.getBoundingClientRect().bottom), y: Math.round(scrollY), filtered: document.querySelectorAll('.bk-filtered').length }; });
  const wsaid = await spoken(page);
  ok('…and its Clear the filters clears both, puts the focus on the week’s first square, its Monday, in sight, the page not moved, and says so', wpre.seen && same(wcleared.on, ['All kinds', 'All acts']) && wcleared.focus === wpre.first && wpre.first === await monday(page, T) && wcleared.id === 'bk-sq-' + wpre.first && wcleared.seen && Math.abs(wcleared.y - wpre.y) <= 1 && wcleared.filtered === 0 && wsaid === 'Filters cleared', JSON.stringify([wpre, wcleared, wsaid]));
  await page.locator('.bk-filters .chip', { hasText: 'Sable' }).click(); await sleep(200);
  await page.locator('.bk-filters .chip', { hasText: 'Rehearsals' }).click(); await sleep(250);
  await page.locator('#bk-agenda-clear').scrollIntoViewIfNeeded(); await sleep(300);
  const wk0 = await page.evaluate(() => Math.round(document.getElementById('bk-f-kind').getBoundingClientRect().top));
  await page.click('#bk-agenda-clear'); await sleep(250);
  const wcleared2 = await page.evaluate(() => ({ on: [...document.querySelectorAll('.bk-filters .chip.on')].map(c => c.textContent), focus: document.activeElement && document.activeElement.id, top: Math.round(document.getElementById('bk-f-kind').getBoundingClientRect().top), week: !!document.querySelector('.bk-cal-week') }));
  ok('…and under the Week, Coming up’s Clear the filters puts the focus on the first chip, where it was', same(wcleared2.on, ['All kinds', 'All acts']) && wcleared2.focus === 'bk-f-kind' && Math.abs(wcleared2.top - wk0) <= 1 && wcleared2.week && (await spoken(page)) === 'Filters cleared', JSON.stringify([wk0, wcleared2]));

  // a swipe across the squares is the next week, and opens nothing
  await toWeek(page, T);
  await page.locator(weekSq(T)).scrollIntoViewIfNeeded(); await sleep(200);
  const w0 = await firstDay(page), box = await page.locator('.bk-cal-week').boundingBox(); // from the last square leftwards, over the busy night's
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 40); await page.mouse.down();
  await page.mouse.move(box.x + box.width - 140, box.y + box.height - 35, { steps: 6 }); await page.mouse.up(); await sleep(350);
  ok('a swipe to the left across the week shows the next week, and does not open the day under the finger', (await firstDay(page)) === (await plus(page, w0, 7)) && (await modeOf(page)) === 'week' && (await page.locator('.bk-page').count()) === 0 && (await page.locator('.sheet').count()) === 0);
  // the arrow keys are the section menu's everywhere but on day squares
  await toWeek(page, T);
  await page.focus('.bk-agenda .bk-card'); await page.keyboard.press('ArrowRight'); await sleep(500);
  ok('→ on a Coming up card under the week is the section menu’s (only day squares take the arrow keys)', (await page.evaluate(() => window.logiPage())) !== 'bookings');
  const arrived = () => page.evaluate(() => { const a = document.activeElement; return { body: !a || a === document.body, inDeck: !!a && !!a.closest('#deck'), swipe: !!a && a.classList.contains('dk-swipe'), label: a && a.getAttribute('aria-label') }; });
  let at = await arrived();
  ok('…and the focus goes to the section menu’s current control (the record, now on the next section), never to the page body', !at.body && at.inDeck && at.swipe && /^Now playing /.test(at.label || ''), JSON.stringify(at));
  await page.keyboard.press('ArrowLeft'); await sleep(500);
  ok('…from where ← brings the calendar back, the focus staying on the record', (await page.evaluate(() => window.logiPage())) === 'bookings' && (await arrived()).swipe);
  await go(page, 'bookings');
  ok('…and coming back finds the same week', (await modeOf(page)) === 'week' && (await page.locator(weekSq(T)).count()) === 1);
  // The five view buttons are one control: ← → move between them (round from the last to the first), Enter or Space picks.
  await page.focus('#bk-view-week');
  const viewKey = async key => { await page.keyboard.press(key); await sleep(250); return page.evaluate(() => ({ page: window.logiPage(), focus: document.activeElement.id, mode: (document.querySelector('.bk-calview').className.match(/bk-mode-(\w+)/) || [])[1], saved: localStorage.getItem('tourbook-cal-view') })); };
  const k1 = await viewKey('ArrowRight'), k2 = await viewKey('ArrowRight'), k3 = await viewKey('ArrowRight'), k4 = await viewKey('ArrowLeft');
  ok('on the view buttons ← → move between the buttons, round from Day to Month and back, and stay in the calendar without picking', [k1, k2, k3, k4].every(k => k.page === 'bookings' && k.mode === 'week' && k.saved === 'week') && same([k1, k2, k3, k4].map(k => k.focus), ['bk-view-three', 'bk-view-day', 'bk-view-month', 'bk-view-day']), JSON.stringify([k1, k2, k3, k4]));
  const k5 = await viewKey('Enter');
  ok('…Enter picks the one with the focus', k5.mode === 'day' && k5.saved === 'day' && k5.focus === 'bk-view-day', JSON.stringify(k5));
  await page.focus('#bk-view-day'); await viewKey('ArrowLeft'); await viewKey('ArrowLeft'); await viewKey('ArrowLeft');
  const k6 = await viewKey(' ');
  ok('…and so does Space', k6.mode === 'two' && k6.saved === 'two' && k6.focus === 'bk-view-two', JSON.stringify(k6));
  await view(page, 'week');
  // The calendar's ? explains the house-rules chip and the overlap note, which Coming up's cards carry under the week.
  const helpSteps = await steps(page), hr = helpSteps.find(x => x[0] === 'House rules'), ov = helpSteps.find(x => x[0] === 'Overlapping sets');
  ok('the calendar’s walkthrough explains the house-rules chip: green, amber and red, what “· 1 more” counts, and where the full rules are', !!hr && /green/.test(hr[1]) && /amber/.test(hr[1]) && /red when phones/.test(hr[1]) && /“·\u00a01\u00a0more” counts the others/.test(hr[1]) && /The show’s page and the venue’s page have them in full/.test(hr[1]) && hr[2][0] === '.bk-agenda .vn-chip', JSON.stringify(hr));
  ok('…and the “Overlaps with …” note, both after Coming up', !!ov && /set at the same time/.test(ov[1]) && helpSteps.map(x => x[0]).slice(-3).join() === 'Coming up,House rules,Overlapping sets', JSON.stringify(helpSteps.map(x => x[0])));
  const walked = await tourTitles(page);
  ok('…and the walkthrough shows both cards', walked.slice(-2).join() === 'House rules,Overlapping sets', walked.join(', '));

  // + New starts on today when today is on screen, else on the first day shown; on the day in view in Day and 3 days
  const newDate = async () => { await page.locator('.bk-new').click(); await page.locator('.bk-kind[data-kind="other"]').click(); const f = sheetNamed(page, 'New diary entry'); await f.waitFor(); const v = await f.locator('[data-key="date"]').inputValue(); await f.locator('button', { hasText: 'Cancel' }).click(); await sleep(250); return v; };
  ok('+ New in a week without today starts on its Monday', (await newDate()) === (await monday(page, T)));
  await page.click('[aria-label="Today, this week"]'); await sleep(200);
  ok('…and on today in this week', (await newDate()) === (await dayFromNow(page, 0)));

  /* ---------------- a square opens its day, a block there its booking; Back and Delete land on the Day view of its day ---------------- */
  await toWeek(page, T);
  await page.click(weekSq(T)); await page.waitForSelector('.bk-dayview');
  ok('tapping the busy night’s square opens the Day view on that day', (await title(page)) === (await wantTitle(page, 'day', T, T)) && (await page.locator(`.bk-col[data-day="${T}"]`).count()) === 1 && (await saved(page)) === 'week', await title(page));
  await page.click(`#bk-ev-c-E-${T}`); await page.waitForSelector('.bk-page .bk-hero');
  ok('tapping a block there opens the booking', (await page.locator('.bk-title').innerText()).includes('The Night Owls @ The Lantern Rooms'));
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
  // The name is at the top of its block, where the set starts (a button centres what is in it unless told otherwise).
  const nameTop = id => page.evaluate(id => { const b = document.querySelector(`.bk-col .bk-ev[data-id="${id}"]`), t = b.querySelector('.bk-block-title'); return { gap: t.getBoundingClientRect().top - b.getBoundingClientRect().top, h: b.offsetHeight }; }, id);
  let nt = await nameTop('c-E');
  ok('a block’s name is at the top of the block, where the set starts, not half-way down it', nt.h > 60 && nt.gap >= 0 && nt.gap <= 6, JSON.stringify(nt));
  const over = (a, b) => a.top < b.top + b.h && b.top < a.top + a.h;
  ok('two sets that overlap sit side by side', over(blk('c-E'), blk('c-A')) && blk('c-A').left >= blk('c-E').left + blk('c-E').w - 1 && Math.abs(blk('c-E').w - blk('c-A').w) <= 1 && blk('c-E').w < g.cols[0].w / 2, JSON.stringify([blk('c-E'), blk('c-A')]));
  ok('two sets that only touch (19:00 for an hour, then 20:00) share a lane, the whole width', blk('c-P').left === blk('c-Q').left && blk('c-P').w === blk('c-Q').w && blk('c-P').w > g.cols[0].w - 6 && blk('c-P').top + blk('c-P').h <= blk('c-Q').top + 0.5 && blk('c-Q').top + blk('c-Q').h <= blk('c-E').top + 0.5, JSON.stringify([blk('c-P'), blk('c-Q')]));
  const hit = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit')));
  ok('a set with no length is an hour tall; in the Day view a short one is never under a button’s height (var(--hit))', Math.abs(blk('c-Q').h - g.hh) < 0.6 && hit >= 44 && blk('c-X').h === hit && blk('c-X').top === line('18:00'), JSON.stringify([hit, blk('c-X')]));
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

  // the keyboard: a day's square and a block are buttons, Enter opens them
  await toWeek(page, T);
  await page.focus(weekSq(T)); await page.keyboard.press('Enter'); await page.waitForSelector('.bk-dayview');
  ok('Enter on a day’s square in the week opens that day, with the focus on its heading', await page.evaluate(() => document.activeElement && document.activeElement.matches('.bk-dayview h2.cal-title')) && (await page.locator(`.bk-col[data-day="${T}"]`).count()) === 1);
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
  ok('in the Day view a 20-minute set’s block is a button tall, with room for its name and, under it, its time and where', shortOne.h === hit && !shortOne.oneLine && same(shortOne.where, [' · The Crown', true, false]) && shortOne.time, JSON.stringify(shortOne));
  await page.click(`#bk-ev-c-Z-${T}`); await page.waitForSelector('.bk-page .bk-hero');
  await page.locator('.bk-actions .bk-delete').click(); await sheetNamed(page, 'Delete this booking?').waitFor();
  await page.locator('.sheet button', { hasText: 'Delete booking' }).click(); await sleep(400);
  ok('Delete on a booking’s page lands in the Day view on its day', (await page.locator('.bk-dayview').count()) === 1 && (await page.locator(`.bk-col[data-day="${T}"]`).count()) === 1 && (await page.locator(`#bk-ev-c-Z-${T}`).count()) === 0 && (await page.locator(`#bk-ev-c-P-${T}`).count()) === 1);
  // The steps for the lines a card can carry come after Coming up, each only when one is on screen.
  const lines = async () => [...((await page.locator('.bk-calview .vn-chip').count()) ? ['House rules'] : []), ...((await page.locator('.bk-calview .bk-overlap').count()) ? ['Overlapping sets'] : [])];
  let walk = await tourTitles(page);
  ok('a day with bookings: its walkthrough shows The calendar and the step for its bookings, then the filter chips under them', same(walk, ['New booking', 'Export calendar', 'Views', 'The calendar', 'Add to this day', 'Bookings', 'Filters', 'Coming up', ...(await lines())]), walk.join(', '));

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
  walk = await tourTitles(page);
  ok('…and its walkthrough leaves out The calendar’s hours and the bookings to tap, which are not there', same(walk, ['New booking', 'Export calendar', 'Views', 'Add to this day', 'Filters', 'Coming up', ...(await lines())]), walk.join(', '));
  // only "any time": no empty hours
  await put(page, 'bookings', { id: 'c-U', kind: 'other', status: 'hold', title: 'Untimed', date: T3 }); await sleep(300);
  ok('a day with nothing timed shows the “any time” row and “No times set yet.”, without empty hours', (await page.locator('.bk-any #bk-ev-c-U-any').count()) === 1 && (await page.locator('.bk-grid-body').count()) === 0 && (await page.locator('.bk-grid-note').textContent()) === 'No times set yet.' && (await page.locator('.bk-cal-panel .bk-none').count()) === 0);
  let calStep = ((await steps(page)).find(s => s[0] === 'The calendar') || [])[1] || '';
  ok('…and its walkthrough speaks of the row at the top, not of hours that are not there', calStep.startsWith('Nothing here has a time yet, so each booking sits in the row at the top.'), calStep);
  await page.evaluate(() => import('./js/store.js').then(s => s.remove('bookings', 'c-U'))); await sleep(300);
  // a booking over two days that has a time is in that row for its days, not for want of a time
  await put(page, 'bookings', { id: 'c-F', kind: 'show', status: 'hold', title: 'Two-day Fest', date: T3, endDate: T4, setTime: '16:30', setLength: 30 }); await sleep(300);
  const fest = await page.evaluate(() => ({ pill: (document.querySelector('#bk-ev-c-F-any .bk-any-text') || {}).textContent || '', notes: document.querySelectorAll('.bk-cal-panel .bk-grid-note').length, hours: document.querySelectorAll('.bk-grid-body').length, none: document.querySelectorAll('.bk-cal-panel .bk-none').length, said: /No times set yet/.test(document.querySelector('.bk-cal-panel').textContent) }));
  ok('a day whose only booking runs over two days and has a time shows its pill with the time first, and does not say “No times set yet.”', fest.pill.startsWith('16:30 ') && fest.pill.includes('Two-day Fest') && fest.notes === 0 && !fest.said && fest.hours === 0 && fest.none === 0, JSON.stringify(fest));
  calStep = ((await steps(page)).find(s => s[0] === 'The calendar') || [])[1] || '';
  ok('…and its walkthrough says why it is in the row at the top, without saying it has no time', calStep.startsWith('A booking over several days, or one without a time, sits in the row at the top.'), calStep);
  await put(page, 'bookings', { id: 'c-U', kind: 'other', status: 'hold', title: 'Untimed', date: T3 }); await sleep(300);
  ok('…with a booking that has no time beside it, the row has both and nothing is said about times (one of them has one)', (await page.locator('.bk-any .bk-ev').count()) === 2 && (await page.locator('.bk-cal-panel .bk-grid-note').count()) === 0);
  await page.evaluate(() => import('./js/store.js').then(s => { s.remove('bookings', 'c-U'); s.remove('bookings', 'c-F'); })); await sleep(300);

  // deleted from the view itself by press and hold: what was pressed has gone, and the focus goes to the view's heading, not nowhere
  await put(page, 'bookings', { id: 'c-Y', kind: 'show', status: 'confirmed', title: 'Hold Me', date: T, venueName: 'The Crown', setTime: '17:00', setLength: 20 }); await sleep(300);
  const holdDelete = async sel => {
    await page.waitForFunction(() => !document.querySelector('.toast')); // a toast at the foot of the screen could be under the finger
    await press(page, page.locator(sel), 3300);
    await sheetNamed(page, 'Delete this booking?').waitFor({ timeout: 4000 }); await page.mouse.up(); await sleep(300);
    await page.locator('.sheet button', { hasText: 'Delete booking' }).click(); await sleep(500);
    return page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? a.tagName + (a.hasAttribute('data-view-head') ? '[head]' : '') : 'BODY'; });
  };
  await toDay(page, T);
  let after = await holdDelete(`#bk-ev-c-Y-${T}`);
  // "Booking deleted" is still on screen at the foot of the page: a tap there goes through it to what is under it.
  const through = await page.evaluate(() => { const t = document.querySelector('.toast'); if (!t) return 'no toast'; const r = t.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return at && at.closest('.toast') ? 'the toast takes the tap' : 'through'; });
  ok('the toast that says so does not take a tap meant for what is under it', through === 'through', through);
  ok('a block deleted by press and hold: it goes, the Day view stays and the focus is on the day’s name', (await page.locator(`#bk-ev-c-Y-${T}`).count()) === 0 && (await modeOf(page)) === 'day' && after === 'H2[head]' && (await page.locator('.sheet').count()) === 0, after);
  await put(page, 'bookings', { id: 'c-Y', kind: 'show', status: 'confirmed', title: 'Hold Me', date: T, venueName: 'The Crown', setTime: '17:00', setLength: 20 }); await sleep(300);
  // The week's squares open their day (a square holds several bookings): there, as in two weeks, press and hold is on
  // Coming up's cards under the squares.
  await toWeek(page, T);
  const cardY = '.bk-agenda .bk-card[data-id="c-Y"]', fewer = !(await page.locator(cardY).count());
  if (fewer) { await page.click('#bk-agenda-more'); await sleep(250); } // only eight show at first
  after = await holdDelete(cardY);
  ok('…and a Coming up card under the week the same: it goes, the Week stays, and the focus is on the page’s heading', (await page.locator(cardY).count()) === 0 && (await modeOf(page)) === 'week' && after === 'H1[head]' && !(await weekSaid(page, T)).includes('Hold Me'), after);
  if (fewer) { await page.click('#bk-agenda-more'); await sleep(250); } // eight again, as the checks below expect

  /* ---------------- three days ---------------- */
  await toDay(page, T);
  await view(page, 'three');
  g = await geo();
  ok('three days: three columns from the day in view, 44 px to the hour, sharing the hours the widest day needs', g.hh === 44 && g.n === '3' && same(g.cols.map(c => c.day), [T, T1, T2]) && g.heads === 3 && g.hours[0][0] === '10:00' && g.hours[g.hours.length - 1][0] === '05:00+1' && g.cols.every(c => c.h === g.bodyH) && g.bodyH === 20 * 44, JSON.stringify(g.hours.map(h => h[0])));
  ok('…with the busy night’s blocks in its own column, overlapping sets side by side', same(g.cols[0].blocks.map(b => b.id), ['c-X', 'c-P', 'c-Q', 'c-E', 'c-A', 'c-L', 'c-C']) && blk('c-A').left > blk('c-E').left && blk('c-E').top === line('21:00') && Math.abs(blk('c-E').h - 55) < 0.6 && same(g.cols[1].blocks.map(b => b.id), ['c-S', 'c-B']) && same(g.cols[2].blocks.map(b => b.id), ['c-N']), JSON.stringify(g.cols.map(c => c.blocks.map(b => b.id))));
  ok('…and three days keep a short block’s minimum of 26 px', blk('c-X').h === 26, JSON.stringify(blk('c-X')));
  nt = await nameTop('c-N');
  ok('…and a session eight hours long has its name at its top too (22:00), not at two in the morning', nt.h > 300 && nt.gap >= 0 && nt.gap <= 6, JSON.stringify(nt));
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
  // Item 4: two rows of taller squares that show each show's time and name. On a phone each line has its time, whole,
  // and the start of the name on a line of its own (cut with an ellipsis); three lines, then "+6", all in the square.
  for (const [w, wh] of [[420, 900], [360, 780], [430, 932]]) {
    if (w !== 420) { await page.setViewportSize({ width: w, height: wh }); await sleep(250); }
    const sq = await squareLines(page, T);
    ok(`${w} px, two weeks: each line of the busy night’s square has its time whole and the start of its name under it, on one line; three lines, then “+6”, inside the square`,
      sq.lines.length === 3 && sq.lines.every(l => l.timeWhole && l.oneLine && l.inside && l.name === (l.time ? 'under' : 'alone')) && /^\+6/.test(sq.more || ''), JSON.stringify(sq));
  }
  await page.setViewportSize({ width: 420, height: 900 }); await sleep(250);
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
  // A booking over several days is named once in a row of the two weeks: on its first day (or on a Monday, where a row
  // starts), not again on a 1st it runs over in the middle of the row. The month names it on the 1st: the days before
  // are on another page there. The next 1st of a month that is not a Monday, and the day before it.
  const first1 = await page.evaluate(() => import('./js/util.js').then(u => { const d = new Date(); d.setDate(1); do d.setMonth(d.getMonth() + 1); while (d.getDay() === 1); return u.ymd(d); }));
  const eve = await plus(page, first1, -1);
  await put(page, 'bookings', { id: 'c-R', kind: 'show', status: 'confirmed', title: 'Marrow', date: eve, endDate: first1, venueName: 'Field', setTime: '23:30' }); await sleep(300);
  await toDay(page, first1); await view(page, 'two');
  const bar = iso => page.evaluate(iso => [...document.querySelectorAll(`.bk-day[data-date="${iso}"] .bk-mini`)].map(m => m.textContent.trim()), iso);
  const [onEve, onFirst] = [await bar(eve), await bar(first1)];
  await view(page, 'month');
  const inMonth = await page.evaluate(iso => [...document.querySelectorAll(`.bk-day[data-date="${iso}"] .bk-mini`)].map(m => m.textContent.trim()), first1);
  ok('two weeks: a booking over a 1st is named on its first day and its bar runs on through the 1st without the name again; the month names it on the 1st', onEve[0] === '23:30 Marrow' && onFirst[0] === '' && /Marrow/.test(inMonth[0] || ''), JSON.stringify([onEve, onFirst, inMonth]));
  await toWeek(page, first1);
  const [wkEve, wkFirst] = [await bar(eve), await bar(first1)];
  ok('…and the week shows it as two weeks does (the 1st is not a Monday, so the two days are one week)', wkEve[0] === '23:30 Marrow' && wkFirst[0] === '' && (sentence(await weekSaid(page, first1), '23:30 Marrow (') || '').startsWith(`23:30 Marrow (Confirmed): to ${await fmt(first1, 'fmtLong')}; Field`), JSON.stringify([wkEve, wkFirst, await weekSaid(page, first1)]));
  await page.evaluate(() => import('./js/store.js').then(s => s.remove('bookings', 'c-R'))); await sleep(300);

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
    const u = await page.evaluate(() => ({ cards: document.querySelectorAll('.bk-calview > .bk-agenda .bk-card[data-id]').length, head: document.querySelector('.bk-calview > .bk-agenda-head').textContent, after: document.querySelector('.bk-cal-panel').compareDocumentPosition(document.querySelector('.bk-agenda')) & Node.DOCUMENT_POSITION_FOLLOWING, more: !!document.getElementById('bk-agenda-more'), nodate: document.querySelectorAll('.bk-calview [data-id="c-nodate"]').length, filters: document.querySelectorAll('.bk-calview > .bk-cal-panel + .bk-filters + .bk-agenda-head + .bk-agenda').length && document.querySelectorAll('.bk-calview > .bk-filters .chips').length, money: /[$£€]|\bfee\b|guarantee/i.test(document.querySelector('.bk-calview').textContent) }));
    ok(`${v}: Coming up is under the view, eight cards and “Show all”, with the filter chips between them; the booking with no date is nowhere, and no money is on the page`, u.cards === 8 && u.head === 'Coming up' && !!u.after && u.more && u.nodate === 0 && u.filters === 2 && !u.money, JSON.stringify(u));
  }

  /* ---------------- before 06:00: a show's time is the end of its night, anything else's the morning ---------------- */
  const AM = await dayFromNow(page, 30); // nothing in the sample
  await put(page, 'bookings', { id: 'c-ln', kind: 'show', status: 'confirmed', title: 'Late Set', date: AM, venueName: 'The Barn', setTime: '01:00' });
  await put(page, 'bookings', { id: 'c-pm', kind: 'show', status: 'confirmed', title: 'Night Set', date: AM, venueName: 'The Barn', setTime: '21:00' });
  await put(page, 'bookings', { id: 'c-am', kind: 'rehearsal', status: 'confirmed', title: 'Dawn Rehearsal', date: AM, venueName: 'The Barn', start: '05:15', end: '07:00' });
  await sleep(300);
  await toWeek(page, AM);
  said = await weekSaid(page, AM);
  const amLines = (await linesOf(page, AM)).lines;
  ok('a rehearsal at 05:15 is the morning of its day: first in the Week’s square, not “after midnight”, while a show’s 01:00 set still is', same(await weekIds(page, AM), ['c-am', 'c-pm', 'c-ln']) && same(amLines, ['05:15 Dawn Rehearsal', '21:00 Night Set', '01:00 Late Set'])
    && sentence(said, '05:15 Dawn Rehearsal (') === '05:15 Dawn Rehearsal (Confirmed): The Barn' && sentence(said, '01:00 Late Set (') === '01:00 Late Set (Confirmed): The Barn; after midnight', JSON.stringify([amLines, said]));
  await page.click(weekSq(AM)); await page.waitForSelector('.bk-dayview'); await sleep(200);
  g = await geo();
  ok('…and the Day grid starts early enough to hold it: from 05:00, the rehearsal a quarter of an hour down, the 01:00 set at the end of the night', g.hours[0][0] === '05:00' && Math.abs(blk('c-am').top - (line('05:00') + g.hh / 4)) < 0.6 && blk('c-ln').top > blk('c-pm').top && line('01:00') > line('23:00') && same(g.cols[0].blocks.map(b => b.id), ['c-am', 'c-pm', 'c-ln']), JSON.stringify([g.hours.slice(0, 2), blk('c-am')]));
  const amSaid = await page.evaluate(AM => document.getElementById(`bk-ev-c-am-${AM}`).querySelector('.bk-block-sub').textContent.trim(), AM);
  ok('…its block reads its start, 05:15', amSaid.startsWith('05:15'), amSaid);
  await page.evaluate(() => import('./js/store.js').then(s => ['c-am', 'c-pm', 'c-ln'].forEach(id => s.remove('bookings', id)))); await sleep(300);

  /* ---------------- the time grid: a block widens over lanes that hold nothing at its height ---------------- */
  // A long set (20:00 to 23:00), two that start beside it (20:00 and 20:30, an hour each), and one at 22:00 that takes
  // the second lane once the 20:00 hour is over: nothing is in the third lane at its height, so it widens over it.
  const WD = await dayFromNow(page, 31);
  for (const [id, setTime, setLength] of [['w-long', '20:00', 180], ['w-one', '20:00', 60], ['w-two', '20:30', 60], ['w-late', '22:00', 60]]) await put(page, 'bookings', { id, kind: 'show', status: 'confirmed', title: id, date: WD, venueName: 'Field', setTime, setLength });
  await sleep(300);
  await view(page, 'day'); await page.click('[aria-label="Today"]'); await sleep(150);
  for (let i = 0; i < 40 && !(await page.locator(`.bk-col[data-day="${WD}"]`).count()); i++) { await page.click('[aria-label="Next day"]'); await sleep(80); }
  const lanes = async () => { g = await geo(); const w = g.cols[0].w; return Object.fromEntries(['w-long', 'w-one', 'w-two', 'w-late'].map(id => [id, { thirds: Math.round(blk(id).w / (w / 3)), at: Math.round(blk(id).left / (w / 3)), top: blk(id).top, h: blk(id).h }])); };
  let L = await lanes();
  ok('Day: sets that really overlap sit side by side, a third of the column each', L['w-long'].thirds === 1 && L['w-one'].thirds === 1 && L['w-two'].thirds === 1 && L['w-long'].at === 0 && L['w-one'].at === 1 && L['w-two'].at === 2, JSON.stringify(L));
  ok('…and the 22:00 set widens to the right over the lane that holds nothing at its height: two thirds wide, from the second lane', L['w-late'].at === 1 && L['w-late'].thirds === 2, JSON.stringify(L));
  // Large buttons: a block is as tall as a large button.
  await put(page, 'bookings', { id: 'w-short', kind: 'show', status: 'confirmed', title: 'w-short', date: WD, venueName: 'Field', setTime: '18:00', setLength: 20 });
  await page.evaluate(() => { document.documentElement.dataset.targets = 'large'; }); await sleep(100);
  await page.click('[aria-label="Previous day"]'); await sleep(150); await page.click('[aria-label="Next day"]'); await sleep(250);
  g = await geo();
  const big = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit')));
  ok('…a 20-minute set is as tall as a button, and grows with Button size (large buttons)', big > hit && blk('w-short').h === big, JSON.stringify([hit, big, blk('w-short')]));
  await page.evaluate(() => { document.documentElement.dataset.targets = 'normal'; });
  await view(page, 'three'); await sleep(150);
  L = await lanes();
  ok('three days: the same lanes, the 22:00 set widened the same way; a short set keeps 26 px', L['w-long'].thirds === 1 && L['w-one'].at === 1 && L['w-two'].at === 2 && L['w-late'].at === 1 && L['w-late'].thirds === 2 && blk('w-short').h === 26, JSON.stringify([L, blk('w-short')]));
  await page.evaluate(() => import('./js/store.js').then(s => ['w-long', 'w-one', 'w-two', 'w-late', 'w-short'].forEach(id => s.remove('bookings', id)))); await sleep(300);
  await view(page, 'month');

  /* ---------------- a date that is no day at all ---------------- */
  // The 0th of next month (as an old or hand-made backup could hold): it is on no day, so it is in no view, like a booking
  // with no date. Three days across the end of this month are the ones that could take it for one of theirs.
  const zero = (await monthOf(page, await dayFromNow(page, 0), 1))[0].slice(0, 8) + '00';
  await put(page, 'bookings', { id: 'c-zero', kind: 'show', status: 'confirmed', title: 'Day nought', date: zero, setTime: '09:00' });
  await put(page, 'bookings', { id: 'c-zero2', kind: 'show', status: 'confirmed', title: 'Day nought, no time', date: zero }); await sleep(300);
  await page.click('[aria-label="Today, this month"]'); await page.click('[aria-label="Next month"]'); await sleep(200);
  await view(page, 'day'); await page.click('[aria-label="Previous day"]'); await sleep(200); // the last day of this month
  const inPanel = () => page.evaluate(() => ({ n: document.querySelectorAll('.bk-cal-panel [data-id^="c-zero"]').length + [...document.querySelectorAll('.bk-cal-panel .bk-day')].filter(d => (d.getAttribute('aria-label') || '').includes('Day nought')).length, first: (document.querySelector('.bk-hour') || {}).textContent || '' }));
  const zeros = {};
  for (const v of ['three', 'day', 'week', 'two', 'month']) { await view(page, v); zeros[v] = await inPanel(); }
  ok('a booking dated the 0th of a month is in no view, and does not stretch the hours of the three days around it', Object.values(zeros).every(z => z.n === 0) && zeros.three.first !== '09:00' && zeros.day.first !== '09:00', JSON.stringify(zeros));
  await page.evaluate(() => import('./js/store.js').then(s => { s.remove('bookings', 'c-zero'); s.remove('bookings', 'c-zero2'); })); await sleep(300);

  /* ---------------- “Didn’t go” ---------------- */
  ok('(the past show’s week is a few taps of ‹ away)', await toWeek(page, PAST, true));
  said = await weekSaid(page, PAST);
  ok('a show marked “Didn’t go” says so in its Week square’s spoken name, after the status, as two weeks does (the square has no room to write it)', said === `${await fmt(PAST, 'fmtLong')}: 20:00 The Night Owls @ Harbour Hall (Done, didn’t go): ${[harbour, await rulesOf('c-G')].filter(Boolean).join('; ')}` && !/Didn’t go/i.test(await page.locator(weekSq(PAST)).innerText()), said);
  await page.click(weekSq(PAST)); await page.waitForSelector('.bk-dayview');
  const wentBlock = () => page.evaluate(P => { const b = document.getElementById(`bk-ev-c-G-${P}`), eye = b.querySelector('.bk-block-went');
    return { sub: b.querySelector('.bk-block-sub').textContent.trim(), said: b.querySelector('.sr-only').textContent.trim(), text: b.textContent, pills: b.querySelectorAll('.bk-went').length, eye: eye ? [eye.getAttribute('aria-hidden'), eye.getBoundingClientRect().width > 20] : null, oneLine: getComputedStyle(b.querySelector('.bk-block-in')).display === 'flex' }; }, PAST);
  let wb = await wentBlock();
  ok('its block in the Day view reads “· Didn’t go” where the venue was', wb.sub === '20:00 · Didn’t go' && wb.text.includes('Didn’t go') && wb.pills === 0 && same(wb.eye, ['true', true]), JSON.stringify(wb));
  ok('…written for the eye there; a screen reader has it from the hidden words, once', wb.said.startsWith('Done.') && wb.said.endsWith(' Didn’t go.') && wb.said === (await wantSaid(page, 'c-G', { went: true })), wb.said);
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 'c-G', { setLength: 30 }))); await sleep(300);
  wb = await wentBlock();
  ok('a short set’s block (a button tall in the Day view) still shows it', wb.sub === '20:00 · Didn’t go' && same(wb.eye, ['true', true]), JSON.stringify(wb));
  await view(page, 'three');
  wb = await wentBlock();
  ok('in three days, where a block has no room for it, the hidden words carry it', wb.sub === '20:00' && wb.eye === null && wb.said === (await wantSaid(page, 'c-G', { went: true })), JSON.stringify(wb));
  // A day square has no room for it either (a dot, or a time): the day's spoken name says it, after the status.
  const sqName = () => page.evaluate(P => document.querySelector(`.bk-day[data-date="${P}"]`).getAttribute('aria-label'), PAST);
  await view(page, 'two'); const sq2 = await sqName();
  await view(page, 'month'); const sqM = await sqName();
  ok('in two weeks and in the month the day’s spoken name says it, after the status', sq2 === `${await fmt(PAST, 'fmtLong')}: 20:00 The Night Owls @ Harbour Hall (Done, didn’t go)` && sqM === `${await fmt(PAST, 'fmtLong')}: The Night Owls @ Harbour Hall (Done, didn’t go)`, `${sq2} | ${sqM}`);
  await view(page, 'three');
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 'c-G', { status: 'cancelled' }))); await sleep(300);
  wb = await page.evaluate(P => document.getElementById(`bk-ev-c-G-${P}`).textContent, PAST);
  await view(page, 'day');
  const wd = await page.evaluate(P => document.getElementById(`bk-ev-c-G-${P}`).textContent, PAST);
  await toWeek(page, PAST, true);
  const w = await weekSaid(page, PAST);
  await view(page, 'month');
  ok('the same show cancelled says it nowhere', !/Didn’t go/.test(wb) && !/Didn’t go/.test(wd) && !/didn’t go/i.test(w) && w.includes('20:00 The Night Owls @ Harbour Hall (Cancelled)') && (await sqName()).endsWith('(Cancelled)'), JSON.stringify([wb, wd, w, await sqName()]));

  /* ---------------- small words in the views read at 4.5:1 in every light theme ---------------- */
  // Nothing booked, the hours and their +1, any time, the 3-day heads and the weekday letters over the squares sit on the
  // calendar's panel, where the plain muted grey is too faint in several light themes.
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 'c-G', { status: 'done' }))); await sleep(300);
  const faint = {};
  await toDay(page, T3); Object.assign(faint, await inkLow(page, ['.bk-none']));
  await toDay(page, T); Object.assign(faint, await inkLow(page, ['.bk-hour', '.bk-hour .bk-next', '.bk-any-label']));
  await view(page, 'three'); Object.assign(faint, await inkLow(page, ['.bk-grid-head:not(.today)']));
  await view(page, 'week'); Object.assign(faint, await inkLow(page, ['.bk-cal-week .wd']));
  await view(page, 'two'); Object.assign(faint, await inkLow(page, ['.bk-cal-two .wd']));
  ok('in every light theme the small words of the views read at 4.5:1 or better: Nothing booked, the hours and their +1, any time, the day names over the grid, the weekdays over the squares', Object.keys(faint).length === 7 && Object.values(faint).every(x => x && x[0] >= 4.5), JSON.stringify(faint));
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 'c-G', { status: 'cancelled' }))); await sleep(300);
  await view(page, 'month');

  /* ---------------- the sample's show; a scout ---------------- */
  await toDay(page, SHOW1);
  const s1 = await page.evaluate(d => { const b = document.getElementById(`bk-ev-s-show1-${d}`); return b ? { said: b.querySelector('.sr-only').textContent.trim(), chips: b.querySelectorAll('.vn-chip').length } : null; }, SHOW1);
  ok('the sample’s show on its day: its block’s hidden words start with its status', s1 && s1.said.startsWith('Confirmed.') && s1.chips === 0, JSON.stringify(s1));
  await page.evaluate(() => import('./js/roles.js').then(r => r.setRole('scout'))); await sleep(400);
  let names = (await steps(page)).map(s => s[0]);
  ok('scout: the Day view is headed Shows and its walkthrough has a step called Shows', (await page.locator('.bk-dayview .page-head h1').innerText()) === 'Shows' && names.includes('Shows') && !names.includes('Bookings') && names.includes('Views') && names.includes('Export calendar') && (await page.locator(`#bk-ev-s-show1-${SHOW1}`).count()) === 1, names.join(', '));
  await toWeek(page, T);
  ids = await weekIds(page, T);
  ok('scout: the same square, in the same order, with the same notes', same(ids, SQUARE) && (sentence(await weekSaid(page, T), '21:00 The Night Owls @ The Lantern Rooms (') || '').includes('; Overlaps with Sable, 21:30;') && (await page.locator('.bk-calview > .page-head h1').innerText()) === 'Shows', ids.join(','));
  names = (await steps(page)).map(s => s[0]);
  ok('scout: Views and Export calendar are in the Week walkthrough too', names.includes('Views') && names.includes('Export calendar') && !names.includes('Shows'), names.join(', '));
  for (const role of ['producer', 'manager', 'band', 'solo', 'audiophile']) {
    await page.evaluate(id => import('./js/roles.js').then(m => m.setRole(id)), role); await sleep(400);
    const st = await page.evaluate(() => import('./js/roles.js').then(m => ({ want: m.sectionName('bookings', 'Bookings'), head: document.querySelector('.bk-calview > .page-head h1').textContent, views: document.querySelectorAll('.bk-views button').length, week: document.querySelectorAll('.bk-mode-week .bk-cal-week .bk-day').length })));
    ok(`${role}: the same week under the role’s own name for the page, with the five views`, same(await weekIds(page, T), SQUARE) && st.head === st.want && st.views === 5 && st.week === 7, JSON.stringify(st));
  }
  await page.evaluate(() => { localStorage.removeItem('tourbook-role'); });

  /* ---------------- house rules in the views (js/venues-rules.js through cardExtras; the words from the model) ---------------- */
  await page.evaluate(() => import('./js/roles.js').then(r => r.setRole('all'))); await sleep(400);
  await page.evaluate(() => { localStorage.removeItem('tourbook-role'); });
  // A Week square has no room for a chip: its spoken name says the rules (from the model), and the calendar draws none.
  const blockOf = (id, iso) => page.evaluate(([id, iso]) => { const b = document.getElementById(`bk-ev-${id}-${iso}`); return b ? { said: b.querySelector('.sr-only').textContent.trim(), chips: b.querySelectorAll('.vn-chip, .bk-overlap, .bk-went').length } : null; }, [id, iso]);
  const chipsDrawn = () => page.locator('.bk-cal-panel .vn-chip').count();
  ok('(the sample’s show is in this week or the next)', await toWeek(page, SHOW1)); // today + 5: from this week, forwards, whatever the weekday of the run
  said = await weekSaid(page, SHOW1);
  ok('the Week square of the sample’s show says its venue’s house rules after where it is, and draws no chip: “House rules: Pro cameras not allowed, and 1 more”', said.includes(`(Confirmed): ${lantern}; House rules: Pro cameras not allowed, and 1 more`) && said.includes(await rulesOf('s-show1')) && (await chipsDrawn()) === 0, said);
  await page.click(weekSq(SHOW1)); await page.waitForSelector('.bk-dayview'); await sleep(200);
  let blk1 = await blockOf('s-show1', SHOW1);
  ok('its block in the Day view has no chip: its hidden words say the rules', !!blk1 && blk1.chips === 0 && blk1.said === 'Confirmed. House rules: Pro cameras not allowed, and 1 more.' && blk1.said === (await wantSaid(page, 's-show1')), JSON.stringify(blk1));
  await view(page, 'three');
  blk1 = await blockOf('s-show1', SHOW1);
  ok('…and in three days the same', !!blk1 && blk1.chips === 0 && blk1.said === 'Confirmed. House rules: Pro cameras not allowed, and 1 more.', JSON.stringify(blk1));
  // the busy night: the overlap note, then the rules, after where the show is
  await toWeek(page, T);
  said = await weekSaid(page, T);
  ok('a show with an overlap and rules: its square says the note first, then the rules', sentence(said, '21:00 The Night Owls @ The Lantern Rooms (') === `21:00 The Night Owls @ The Lantern Rooms (Confirmed): ${lantern}; Overlaps with Sable, 21:30; House rules: Pro cameras not allowed, and 1 more`, said);
  ok('a hold at a venue with nothing restricted says the green chip’s words, “No restrictions”', sentence(said, '21:30 Sable @ Harbour Hall (') === `21:30 Sable @ Harbour Hall (Hold): ${harbour}; Overlaps with The Night Owls, 21:00; House rules: No restrictions`, said);
  ok('a cancelled show, a show at a typed venue and a diary entry say no rules', !/House rules/.test(sentence(said, '18:00 The Night Owls @ The Old Vic (')) && !/House rules/.test(sentence(said, '20:00 Second On (')) && !/House rules/.test(sentence(said, 'Weekender (')) && (said.match(/House rules/g) || []).length === 2, said);
  // Free text is always a rule: a venue whose answers are all fine and that has a note is amber, and its chip reads the note.
  await page.evaluate(() => import('./js/store.js').then(st => st.patch('venues', 's-harbour', { rulesNote: 'Ask at the door' }))); await sleep(300);
  said = await weekSaid(page, T);
  ok('a venue with free text: its show’s square reads the note', (sentence(said, '21:30 Sable @ Harbour Hall (') || '').endsWith('; House rules: Note: Ask at the door') && (await chipsDrawn()) === 0, said);
  await page.click(weekSq(T)); await page.waitForSelector('.bk-dayview'); await sleep(200);
  blk1 = await blockOf('c-A', T);
  ok('…and its block says so to a screen reader, after the status and the overlap', !!blk1 && blk1.chips === 0 && blk1.said === 'Hold. Overlaps with The Night Owls, 21:00. House rules: Note: Ask at the door.', JSON.stringify(blk1));
  // the past show marked Didn’t go, at the same venue: the answer with the status, then the rules
  await toWeek(page, PAST, true);
  await page.evaluate(() => import('./js/store.js').then(st => st.patch('bookings', 'c-G', { status: 'done' }))); await sleep(300);
  said = await weekSaid(page, PAST);
  ok('a show marked Didn’t go says the answer with its status, then its venue’s rules', said === `${await fmt(PAST, 'fmtLong')}: 20:00 The Night Owls @ Harbour Hall (Done, didn’t go): ${harbour}; House rules: Note: Ask at the door`, said);
  await page.evaluate(() => import('./js/store.js').then(st => st.patch('venues', 's-harbour', { rulesNote: '' }))); await sleep(300);
  ok('with the note taken away it says “No restrictions” again', (await weekSaid(page, PAST)).endsWith(`${harbour}; House rules: No restrictions`), await weekSaid(page, PAST));

  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ------------------------------ a narrow phone, extra-large text and buttons ------------------------------ */
  for (const scheme of ['light', 'dark']) {
    const menu = scheme === 'dark' ? 'tape' : 'record'; // the two section menus, one in each pass
    const n = await open({ sample: true, viewport: { width: 320, height: 700 }, init: `try { localStorage.setItem('tourbook-prefs', '${JSON.stringify({ scheme, menu, text: 'xlarge', targets: 'large' })}'); } catch (e) {}` });
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
      if (v === 'two') { // seven squares across 320 px: room for the time alone, but the whole of it
        const sq = await squareLines(n.page, D);
        ok(`320 px, ${scheme}, two weeks: each line of the busy night’s square shows its time whole (the name may be left out), three lines and then “+6”, inside the square`,
          sq.lines.length === 3 && sq.lines.every(l => l.timeWhole && l.oneLine && l.inside) && /^\+6/.test(sq.more || ''), JSON.stringify(sq));
      }
      if (v === 'week') { // the same seven squares across, one row: six lines, each time whole, then “+3”
        const sq = await squareLines(n.page, D), tall = await n.page.evaluate(() => [...document.querySelectorAll('.bk-cal-week .bk-day')].map(d => d.offsetHeight));
        ok(`320 px, ${scheme}, week: each line of the busy night’s square shows its time whole (the name may be left out), six lines and then “+3”, inside the square; the squares one row of equal height`,
          sq.lines.length === 6 && sq.lines.every(l => l.timeWhole && l.oneLine && l.inside) && /^\+3/.test(sq.more || '') && tall.length === 7 && tall.every(x => x === tall[0]), JSON.stringify([sq, tall]));
      }
    }
    // Coming up, under the view: a card's name is never broken inside a word (the status drops under the name instead).
    const broken = await n.page.$$eval('.bk-agenda .bk-card-title', ts => ts.flatMap(t => { const out = [], walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); for (let x; (x = walk.nextNode());) { const re = /\S+/g; for (let m; (m = re.exec(x.textContent));) { const r = document.createRange(); r.setStart(x, m.index); r.setEnd(x, m.index + m[0].length); if (r.getClientRects().length > 1) out.push(m[0]); } } return out; }));
    ok(`320 px, ${scheme}: no Coming up card breaks its name inside a word`, broken.length === 0 && (await n.page.locator('.bk-agenda .bk-card-title').count()) === 8, broken.join(' '));
    // The last view drawn is the Day view on the busy night. An hour there is 52 px: it holds the name and, under it, the
    // time and where, even in extra-large text; and a set beside another keeps its time whole.
    const hour = await n.page.evaluate(D => ['c-Q', 'c-A'].map(id => {
      const b = document.getElementById(`bk-ev-${id}-${D}`), sub = b.querySelector('.bk-block-sub'), s = sub.getBoundingClientRect(), r = b.getBoundingClientRect(), where = b.querySelector('.bk-block-where');
      const time = [...sub.childNodes].find(x => x.nodeType === 3 && /\d\d:\d\d/.test(x.textContent)), range = document.createRange(); range.selectNodeContents(time); const t = range.getBoundingClientRect();
      return { id, h: b.offsetHeight, w: Math.round(r.width), twoLines: getComputedStyle(b.querySelector('.bk-block-in')).display !== 'flex' && s.top >= b.querySelector('.bk-block-title').getBoundingClientRect().bottom - 1, inside: s.bottom <= r.bottom + 0.5,
        timeWhole: t.width > 10 && t.left >= s.left - 0.5 && t.right <= s.right + 0.5, where: where ? where.getBoundingClientRect().width > 2 : null };
    }), D);
    const bigHit = await n.page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit')));
    ok(`320 px, ${scheme}, day: an hour-long set (52 px, or a large button’s height when that is more) has two lines (its name, then the time and where), inside its block`, hour[0].h === Math.max(52, bigHit) && hour[0].twoLines && hour[0].inside && hour[0].timeWhole && hour[0].where === true, JSON.stringify(hour[0]));
    ok(`320 px, ${scheme}, day: a set beside another keeps its time whole under its name`, hour[1].w < 140 && hour[1].twoLines && hour[1].inside && hour[1].timeWhole, JSON.stringify(hour[1]));
    // Six sets at once (a festival's stages), in three days on this narrow screen: each block keeps to its own lane,
    // inside its own day.
    const D3 = await plus(n.page, D, 3); // three days on from the busy night, counted from it: a day with nothing else on
    for (let i = 0; i < 6; i++) await put(n.page, 'bookings', { id: 'c-st' + i, kind: 'show', status: 'confirmed', title: 'Stage ' + (i + 1), date: D3, setTime: '20:0' + i, setLength: 60 });
    await sleep(300);
    for (let i = 0; i < 3; i++) { await n.page.click('[aria-label="Next day"]'); await sleep(120); }
    await view(n.page, 'three');
    const stages = await n.page.evaluate(D3 => { const col = document.querySelector(`.bk-col[data-day="${D3}"]`), c = col.getBoundingClientRect(), bs = [...col.querySelectorAll('.bk-ev')].map(e => e.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      return { n: bs.length, spill: Math.max(...bs.map(b => b.right)) - c.right, over: Math.max(...bs.slice(1).map((b, i) => bs[i].right - b.left)), page: document.documentElement.scrollWidth }; }, D3);
    ok(`320 px, ${scheme}, three days: six sets at once are six lanes side by side, none over another or over the next day`, stages.n === 6 && stages.spill <= 0.5 && stages.over <= 0.5 && stages.page <= 320, JSON.stringify(stages));
    // The chips under the calendar, with a big menu over a small screen: a tap keeps the chip on screen and clear of the
    // menu, which comes back over the top of the page when the week above the chips gets shorter (Sable and Rehearsals
    // leave nothing in it: a line says so over the squares, and goes again with All kinds).
    await view(n.page, 'week');
    for (const t of ['Sable', 'Rehearsals', 'All kinds', 'All acts']) {
      // the chip 140 px from the top, the page come down to it, so the menu is tucked away (a move up would bring it back over the chip)
      const to = await n.page.evaluate(t => { const c = [...document.querySelectorAll('.bk-filters .chip')].find(x => x.textContent.includes(t)), row = c.parentElement, a = row.getBoundingClientRect(), r = c.getBoundingClientRect();
        if (r.right > a.right) row.scrollLeft += r.right - a.right; else if (r.left < a.left) row.scrollLeft -= a.left - r.left; // its row scrolls sideways: the chip whole in sight
        return r.top + scrollY - 140; }, t);
      await n.page.evaluate(to => window.scrollTo(0, Math.max(0, to - 120)), to); await sleep(300);
      await n.page.evaluate(to => window.scrollTo(0, to), to); await sleep(400);
      const b = await n.page.locator('.bk-filters .chip', { hasText: t }).boundingBox();
      await n.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await sleep(500);
      const at = await n.page.evaluate(t => { const c = [...document.querySelectorAll('.bk-filters .chip')].find(x => x.textContent.includes(t)), r = c.getBoundingClientRect(), nav = document.getElementById('deck'), p = document.querySelector('.bk-cal-panel').getBoundingClientRect(), f = document.querySelector('.bk-filters').getBoundingClientRect();
        return { top: Math.round(r.top), inView: r.top >= 0 && r.bottom <= innerHeight, clear: nav.classList.contains('tucked') || r.top >= nav.getBoundingClientRect().bottom, focus: document.activeElement === c, pressed: c.getAttribute('aria-pressed'), under: f.top >= p.bottom, page: document.documentElement.scrollWidth }; }, t);
      ok(`320 px, ${scheme}, ${menu}: ${t} under the week keeps the chip on screen, clear of the menu, pressed and with the focus`, at.inView && at.clear && at.focus && at.pressed === 'true' && at.under && at.page <= 320, JSON.stringify(at));
      if (t === 'Rehearsals') ok(`320 px, ${scheme}: …nothing left in the week, “Nothing on with these filters.” and Clear the filters are over its squares, inside the panel`, await n.page.evaluate(() => { const f = document.querySelector('.bk-body > .bk-filtered:first-child'), p = document.querySelector('.bk-cal-panel').getBoundingClientRect(), r = f && f.getBoundingClientRect();
        return !!f && f.nextElementSibling.matches('.bk-cal-week') && !!f.querySelector('#bk-filters-clear') && r.left >= p.left && r.right <= p.right + 0.5 && document.documentElement.scrollWidth <= 320; }));
    }
    // A row of chips wider than the screen scrolls sideways: a tap (or Enter) on its last chip keeps the row where it was,
    // the chip whole in sight with the focus on it, never back at the row's start.
    const lastAt = () => n.page.evaluate(() => { const row = document.querySelector('.bk-filters .chips'), c = row.lastElementChild, a = row.getBoundingClientRect(), r = c.getBoundingClientRect();
      return { id: c.id, wide: row.scrollWidth > row.clientWidth, scroll: Math.round(row.scrollLeft), whole: r.left >= a.left - 1 && r.right <= a.right + 1, focus: document.activeElement === c, pressed: c.getAttribute('aria-pressed') }; });
    await n.page.evaluate(() => { const row = document.querySelector('.bk-filters .chips'); row.scrollLeft = row.scrollWidth; const c = row.lastElementChild; window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 450); }); await sleep(400);
    const s0 = await lastAt(), lb = await n.page.locator('.bk-filters .chips').first().locator('.chip').last().boundingBox();
    await n.page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2); await sleep(400);
    const s1 = await lastAt();
    ok(`320 px, ${scheme}: a tap on the last chip of a row that scrolls sideways keeps the row where it was, the chip whole in sight, pressed, with the focus`, s0.wide && s0.whole && s0.scroll > 0 && s1.id === s0.id && Math.abs(s1.scroll - s0.scroll) <= 1 && s1.whole && s1.focus && s1.pressed === 'true', JSON.stringify([s0, s1]));
    await n.page.keyboard.press('Enter'); await sleep(400);
    const s2 = await lastAt();
    ok(`320 px, ${scheme}: …and Enter on it (off again) keeps it whole in sight with the focus`, s2.id === s0.id && s2.whole && s2.focus && s2.pressed === 'false', JSON.stringify(s2));
    // A view the filters leave empty, its Clear the filters tapped with the menu back over the top of the screen: the focus
    // goes to the view's first square (the month's, the week's), in sight and clear of the menu.
    for (const v of ['month', 'week']) {
      await view(n.page, v);
      await n.page.locator('#bk-f-act-s-sablea').evaluate(c => c.click()); await sleep(250);
      await n.page.locator('#bk-f-kind-rehearsal').evaluate(c => c.click()); await sleep(250);
      await n.page.evaluate(() => { const b = document.getElementById('bk-filters-clear'); window.scrollTo(0, b.getBoundingClientRect().top + scrollY - document.getElementById('deck').offsetHeight + 10); }); await sleep(400);
      await n.page.evaluate(() => window.scrollBy(0, -20)); await sleep(400); // a little way back up: the menu slides back
      const m0 = await n.page.evaluate(() => { const nav = document.getElementById('deck'), b = document.getElementById('bk-filters-clear').getBoundingClientRect(); return { back: !nav.classList.contains('tucked'), seen: b.top >= nav.getBoundingClientRect().bottom }; });
      await n.page.click('#bk-filters-clear'); await sleep(400);
      const m1 = await n.page.evaluate(v => { const a = document.activeElement, r = a.getBoundingClientRect(), nav = document.getElementById('deck');
        return { first: a === document.querySelector(v === 'week' ? '.bk-cal-week .bk-day' : '.bk-body .bk-day'), seen: r.top >= 0 && r.bottom <= innerHeight && (nav.classList.contains('tucked') || r.top >= nav.getBoundingClientRect().bottom - 1), on: document.querySelectorAll('.bk-filters .chip.on').length }; }, v);
      ok(`320 px, ${scheme}, ${menu}: Clear the filters in the ${v}, the menu back, puts the focus on its first square, in sight and clear of the menu`, m0.back && m0.seen && m1.first && m1.seen && m1.on === 2, JSON.stringify([m0, m1]));
    }
    ok(`no errors in the console (320 px, ${scheme})`, n.errors.length === 0, n.errors.slice(0, 5).join(' | '));
    await n.browser.close();
  }

  /* ------------------------------ a No given in “Did you see them?” shows in every view ------------------------------ */
  {
    const a = await open({ sample: true, ask: true });
    const P3 = await dayFromNow(a.page, -3); // three days back: over, whatever the hour of this run
    await put(a.page, 'bookings', { id: 'c-ask', kind: 'show', status: 'confirmed', actId: 's-owls', date: P3, venueId: 's-lantern', setTime: '21:00', setLength: 45 });
    await sleep(200);
    await a.page.reload(); await a.page.waitForSelector('#deck .dk-next');
    const Q = '.sheet[aria-label="Did you see them?"]';
    await a.page.locator(Q).waitFor({ timeout: 8000 }).catch(() => {}); await sleep(250);
    ok('with a show that is over, Tourbook opens on the calendar and asks “Did you see them?” about it', (await a.page.evaluate(() => window.logiPage())) === 'bookings' && same(await a.page.$$eval(`${Q} .ac-ask-row`, rs => rs.map(r => r.dataset.id)), ['c-ask']));
    await a.page.click('#ac-ask-no-c-ask'); await sleep(300);
    await a.page.click('#ac-ask-close'); await sleep(300);
    ok('No, then Done: the sheet is closed and the booking is marked', (await a.page.locator('.sheet').count()) === 0 && (await a.page.evaluate(() => import('./js/store.js').then(st => st.byId('bookings', 'c-ask').went))) === 'no');
    await toWeek(a.page, P3, true);
    const wsq = await a.page.locator(weekSq(P3)).getAttribute('aria-label');
    const askSaid = sentence(wsq, '21:00 The Night Owls @ The Lantern Rooms (') || '';
    ok('its Week square’s spoken name says “didn’t go” with its status, before its venue’s rules', askSaid.startsWith('21:00 The Night Owls @ The Lantern Rooms (Confirmed, didn’t go): ') && askSaid.endsWith('; House rules: Pro cameras not allowed, and 1 more'), wsq);
    await a.page.click(weekSq(P3)); await a.page.waitForSelector('.bk-dayview'); await sleep(200);
    const ask = () => a.page.evaluate(d => { const b = document.getElementById(`bk-ev-c-ask-${d}`); return b ? { sub: b.querySelector('.bk-block-sub').textContent.trim(), said: b.querySelector('.sr-only').textContent.trim() } : null; }, P3);
    let ab = await ask();
    ok('its block in the Day view reads “· Didn’t go”, and a screen reader hears the status, the rules and the answer', !!ab && ab.sub === '21:00 · Didn’t go' && ab.said === 'Confirmed. House rules: Pro cameras not allowed, and 1 more. Didn’t go.', JSON.stringify(ab));
    await view(a.page, 'three'); ab = await ask();
    ok('…in three days the hidden words say it', !!ab && ab.said.endsWith(' Didn’t go.'), JSON.stringify(ab));
    const sqA = () => a.page.evaluate(d => document.querySelector(`.bk-day[data-date="${d}"]`).getAttribute('aria-label'), P3);
    await view(a.page, 'two'); const two = await sqA();
    await view(a.page, 'month'); const mon = await sqA();
    ok('…and in two weeks and the month the day’s spoken name does', two.includes('21:00 The Night Owls @ The Lantern Rooms (Confirmed, didn’t go)') && mon.includes('The Night Owls @ The Lantern Rooms (Confirmed, didn’t go)'), `${two} | ${mon}`);
    // Changed on the show's own page: the mark goes from the calendar
    await a.page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('c-ask'))); await a.page.waitForSelector('.bk-page'); await sleep(300);
    ok('the show’s own page reads Didn’t go, with Change', (await a.page.locator('.bk-score-went .bk-score-text').innerText()) === 'Didn’t go' && (await a.page.locator('#bk-score-change').count()) === 1);
    await a.page.click('#bk-score-change'); await sleep(400);
    await a.page.click('.bk-page .back-btn'); await a.page.waitForSelector('.bk-dayview'); await sleep(200);
    ab = await ask();
    ok('Change there takes the mark off the calendar', !!ab && !/Didn’t go/.test(ab.sub) && !/Didn’t go/.test(ab.said), JSON.stringify(ab));
    ok('no errors in the console (the question, then the views)', a.errors.length === 0, a.errors.slice(0, 5).join(' | '));
    await a.browser.close();
  }

  /* ------------------------------ the day turns while Tourbook is open, or while it is out of sight ------------------------------ */
  // Decision 1: the calendar opens on today, and an installed app is seldom loaded afresh. The page's clock here is
  // Playwright's, set to 23:50 on a day of the spec's own (worked out in the page, so in the run's own time zone) and
  // running on from there: fastForward moves it on and fires the timers that fall due (Tourbook's own, at midnight);
  // setSystemTime moves it and fires none, as for a phone that slept. "Out of sight" is document.visibilityState with a
  // visibilitychange event, or pagehide and pageshow for a page the browser kept.
  {
    const c = await open();
    const D = '2031-05-20', N = '2031-05-21', N2 = '2031-05-22', N3 = '2031-05-23';
    const at = (iso, hm) => c.page.evaluate(([iso, hm]) => { const [y, mo, d] = iso.split('-').map(Number), [hh, mm] = hm.split(':').map(Number); return new Date(y, mo - 1, d, hh, mm).getTime(); }, [iso, hm]);
    await c.ctx.clock.install({ time: await at(D, '23:50') });
    await c.page.reload(); await c.page.waitForSelector('.bk-monthview');
    await licenceAt(c.page, '.bk-monthview'); // the licence leg: the free days in the page's own time
    const show = (id, date, setTime) => put(c.page, 'bookings', { id, kind: 'show', status: 'confirmed', title: 'Night ' + id, date, venueName: 'The Crown', setTime });
    await show('t-D', D, '21:00'); await show('t-N', N, '20:00'); await show('t-N3', N3, '20:00');
    await sleep(300);
    const sight = hidden => c.page.evaluate(hidden => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    const kept = type => c.page.evaluate(type => window.dispatchEvent(new PageTransitionEvent(type, { persisted: true })), type);
    // What the calendar says is today: the day marked (a square, a day's name or a column), the Day view's title, and
    // the word on each Coming up card.
    const now = () => c.page.evaluate(() => ({
      marked: [...document.querySelectorAll('.bk-cal-panel [aria-current="date"]')].map(e => e.dataset.date || e.dataset.day),
      title: document.querySelector('.bk-cal-panel .cal-title').textContent,
      cards: [...document.querySelectorAll('.bk-agenda .bk-card')].map(e => `${e.dataset.id} ${(e.querySelector('.bk-card-sub').textContent.match(/^(Today|Tomorrow|In \d+ days)/) || ['-'])[0]}`),
    }));
    const long = iso => c.page.evaluate(iso => import('./js/util.js').then(u => u.fmtLong(iso)), iso);
    const newDate = async () => {
      await c.page.click('.bk-new'); await c.page.click('.bk-kind[data-kind="show"]'); await sleep(350);
      const v = await c.page.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(), i = s && s.querySelector('input[type=date]'); return i ? i.value : null; });
      await c.page.keyboard.press('Escape'); await sleep(250);
      return v;
    };
    let s = await now();
    ok('the day turns, 23:50: the month marks today, and Coming up says Today and Tomorrow', same(s.marked, [D]) && same(s.cards, ['t-D Today', 't-N Tomorrow', 't-N3 In 3 days']), JSON.stringify(s));
    // Left on screen over midnight
    await c.page.clock.fastForward(40 * 60000); await sleep(400);
    s = await now();
    ok('…left on screen until 00:30, the month marks the new day, and Coming up has moved on a day', same(s.marked, [N]) && same(s.cards, ['t-N Today', 't-N3 In 2 days']), JSON.stringify(s));
    ok('…and + New offers the new day', (await newDate()) === N && (await c.page.locator('.sheet').count()) === 0);
    // Out of sight until the next morning, in the Day view (the screen hidden; no timer runs while the phone sleeps)
    await view(c.page, 'day');
    ok('the Day view opens on the new day, “· today”', (await now()).title === `${await long(N)} · today`, (await now()).title);
    await sight(true); await c.page.clock.setSystemTime(await at(N2, '09:00')); await sight(false); await sleep(400);
    s = await now();
    ok('…hidden overnight and back at 09:00: the Day view is on the new today, and Coming up has moved on', s.title === `${await long(N2)} · today` && same(s.cards, ['t-N3 Tomorrow']), JSON.stringify(s));
    // A calendar moved to another day stays there; the page the browser kept, brought back the next day
    await c.page.click('[aria-label="Previous day"]'); await sleep(250);
    await kept('pagehide'); await c.page.clock.setSystemTime(await at(N3, '08:00')); await kept('pageshow'); await sleep(400);
    s = await now();
    ok('…a Day view moved to another day stays on it when the day turns (kept by the browser, brought back): Coming up says Today', s.title === await long(N) && same(s.cards, ['t-N3 Today']), JSON.stringify(s));
    ok('…and + New there still offers the day in view', (await newDate()) === N);
    // A booking's page open over midnight: Back still lands on its own day
    await view(c.page, 'week'); await c.page.click('.bk-agenda .bk-card[data-id="t-N3"]'); await c.page.waitForSelector('.bk-page');
    await c.page.clock.fastForward(16 * 60 * 60000 + 60000); await sleep(400);
    await c.page.click('.bk-page .back-btn'); await c.page.waitForSelector('.bk-dayview'); await sleep(200);
    ok('a booking’s page open over midnight: Back lands on the Day view of its own day', (await now()).title === await long(N3), (await now()).title);
    ok('no errors in the console (the day turns)', c.errors.length === 0, c.errors.slice(0, 5).join(' | '));
    await c.browser.close();
  }

  /* ------------------------------ in the small hours: last night's show that has not played yet ------------------------------ */
  // The page's clock is Playwright's, at 00:10 on a day of the spec's own. A show dated the day before, on stage at 00:30
  // (the end of that night), is still to come; one that played at 20:00 is over.
  {
    const c = await open();
    const D = '2031-07-10', N = '2031-07-11';
    const at = (iso, hm) => c.page.evaluate(([iso, hm]) => { const [y, mo, d] = iso.split('-').map(Number), [hh, mm] = hm.split(':').map(Number); return new Date(y, mo - 1, d, hh, mm).getTime(); }, [iso, hm]);
    await c.ctx.clock.install({ time: await at(N, '00:10') });
    await c.page.reload(); await c.page.waitForSelector('.bk-monthview');
    await licenceAt(c.page, '.bk-monthview'); // the licence leg: the free days in the page's own time
    await put(c.page, 'bookings', { id: 'n-late', kind: 'show', status: 'confirmed', title: 'Late Set', date: D, venueName: 'The Crown', setTime: '00:30' });
    await put(c.page, 'bookings', { id: 'n-done', kind: 'show', status: 'confirmed', title: 'Early Set', date: D, venueName: 'The Crown', setTime: '20:00', setLength: 60 });
    await put(c.page, 'bookings', { id: 'n-next', kind: 'show', status: 'confirmed', title: 'Next Night', date: N, venueName: 'The Crown', setTime: '21:00' });
    await sleep(400);
    const cards = () => c.page.evaluate(() => [...document.querySelectorAll('.bk-agenda .bk-card')].map(e => [e.dataset.id, e.querySelector('.bk-card-sub').textContent.split(' · ')[0]]));
    const count = () => c.page.evaluate(() => document.querySelector('#deck .dk-meta').textContent);
    let s = await cards();
    ok('00:10: last night’s show still to play stays at the top of Coming up, marked “Tonight”; the one that is over has gone', same(s, [['n-late', 'Tonight'], ['n-next', 'Today']]), JSON.stringify(s));
    ok('…and it counts in the menu’s “coming up” number', /\b2 coming up/.test(await count()), await count());
    ok('…while the calendar marks the calendar’s date as today', same(await c.page.evaluate(() => [...document.querySelectorAll('.bk-cal-panel [aria-current="date"]')].map(e => e.dataset.date)), [N]));
    await view(c.page, 'day');
    ok('…and the Day view opens on the calendar’s date, “· today”', (await c.page.locator('.bk-cal-panel .cal-title').textContent()) === `${await c.page.evaluate(iso => import('./js/util.js').then(u => u.fmtLong(iso)), N)} · today`);
    await view(c.page, 'month');
    // On stage 00:30, with no set length and no curfew: over two hours later, at 02:30. Left on screen until 02:40.
    await c.page.clock.fastForward(150 * 60000); await sleep(400);
    s = await cards();
    ok('02:40, once it is over, it leaves Coming up by itself, and the count follows', same(s, [['n-next', 'Today']]) && /\b1 coming up/.test(await count()), JSON.stringify([s, await count()]));
    // After 06:00 nothing from the night before is tonight's, over or not (a set at 05:30 is the end of that night).
    await put(c.page, 'bookings', { id: 'n-dawn', kind: 'show', status: 'confirmed', title: 'Dawn Set', date: D, venueName: 'The Crown', setTime: '05:30', setLength: 90 });
    await sleep(300);
    ok('a set at 05:30 from the night before is tonight’s at 02:40…', (await cards())[0][0] === 'n-dawn' && (await cards())[0][1] === 'Tonight', JSON.stringify(await cards()));
    await c.page.clock.fastForward(4 * 60 * 60000); await sleep(400);
    ok('…and not at 06:40, though it plays until 07:00', same(await cards(), [['n-next', 'Today']]), JSON.stringify(await cards()));
    ok('no errors in the console (the small hours)', c.errors.length === 0, c.errors.slice(0, 5).join(' | '));
    await c.browser.close();
  }

  /* ------------------------------ the digital player over the five views, on a narrow phone ------------------------------ */
  for (const scheme of ['light', 'dark']) {
    const d = await open({ sample: true, viewport: { width: 320, height: 700 }, init: `try { localStorage.setItem('tourbook-prefs', '${JSON.stringify({ scheme, menu: 'digital', text: 'xlarge', targets: 'large' })}'); } catch (e) {}` });
    await d.page.waitForSelector('.bk-monthview');
    const D = await dayFromNow(d.page, 8);
    for (const rec of seed.filter(x => x.date)) await put(d.page, 'bookings', rec);
    await sleep(300);
    ok(`digital player, 320 px, ${scheme}: the player is the menu, with extra-large text and large buttons`, await d.page.evaluate(s => document.documentElement.dataset.text === 'xlarge' && document.documentElement.dataset.targets === 'large' && document.documentElement.dataset.scheme === s && document.querySelectorAll('#deck .dk-player').length === 1 && !document.querySelector('#deck .dk-record, #deck .dk-cassette'), scheme));
    await toDay(d.page, D);
    for (const v of ['month', 'two', 'week', 'three', 'day']) {
      await view(d.page, v);
      await d.page.evaluate(() => window.scrollTo(0, 0)); await sleep(150); // at the top, where the menu is in sight
      const fit = await d.page.evaluate(() => { const deck = document.querySelector('.deck').getBoundingClientRect(), box = e => e.getBoundingClientRect(), inDeck = e => { const r = box(e); return r.width > 0 && r.left >= deck.left - 0.5 && r.right <= deck.right + 0.5 && r.top >= deck.top - 0.5 && r.bottom <= deck.bottom + 0.5; };
        const tabs = document.querySelector('.dk-tabs'), cur = document.querySelector('.dk-tab[aria-current=page]'), t = box(tabs), c = box(cur);
        return { page: document.documentElement.scrollWidth, next: inDeck(document.querySelector('#deck .dk-next')), prev: inDeck(document.querySelector('#deck .dk-prev')), list: inDeck(document.querySelector('#deck .dk-list')), name: document.querySelector('.dk-name').textContent,
          tab: cur.dataset.section, tabInSight: c.left >= t.left - 0.5 && c.right <= t.right + 0.5, pressed: (document.querySelector('.bk-views .on') || {}).id, entries: document.querySelectorAll('.bk-cal-panel .bk-ev, .bk-cal-panel .bk-day.has').length }; });
      ok(`digital player, 320 px, ${scheme}, ${v}: the page is no wider than the screen; ⏮ ☰ ⏭ are inside the menu, which names Bookings and marks its tab`, fit.page <= 320 && fit.next && fit.prev && fit.list && fit.name === 'Bookings' && fit.tab === 'bookings' && fit.tabInSight && fit.pressed === 'bk-view-' + v && fit.entries > 0, JSON.stringify(fit));
    }
    // → on a block of the Day view steps the menu, and the focus goes to the player's current tab, never to the page body.
    await d.page.focus('.bk-dayview .bk-block'); await d.page.keyboard.press('ArrowRight'); await sleep(500);
    const onTab = await d.page.evaluate(() => { const a = document.activeElement; return { page: window.logiPage(), tab: !!a && a.classList.contains('dk-tab') && a.classList.contains('on'), section: a && a.dataset.section }; });
    ok(`digital player, 320 px, ${scheme}: → on a block steps to the next section, and the focus goes to its tab, never to the page body`, onTab.page !== 'bookings' && onTab.tab && onTab.section === onTab.page, JSON.stringify(onTab));
    ok(`no errors in the console (digital player, 320 px, ${scheme})`, d.errors.length === 0, d.errors.slice(0, 5).join(' | '));
    await d.browser.close();
  }

  /* ------------------------------ a renamed act's show, with every other line, under the digital player ------------------------------ */
  // Items 2, 3, 5, 6 and 7 on one row: a show from before its act changed its name, at a venue whose colour was set by
  // hand, whose set overlaps another, answered No in the real question; on a narrow phone with extra-large text and
  // large buttons, behind the digital player. Each view says "formerly" where it says the rest: written on the show's
  // page, in the hidden words of the grid's blocks and in a day square's spoken name (the Week's with every other line).
  {
    const f = await open({ sample: true, ask: true, viewport: { width: 320, height: 700 }, init: `try { localStorage.setItem('tourbook-prefs', '${JSON.stringify({ scheme: 'light', menu: 'digital', text: 'xlarge', targets: 'large' })}'); } catch (e) {}` });
    const P4 = await dayFromNow(f.page, -4), C2 = await dayFromNow(f.page, -2); // the show four days back, the new name from two days back
    await f.page.evaluate(C2 => import('./js/store.js').then(st => { st.patch('acts', 's-owls', { name: 'Owl Parliament', formerNames: [{ name: 'The Night Owls', until: C2 }] }); st.patch('venues', 's-lantern', { rulesTone: 'strict' }); }), C2);
    await put(f.page, 'bookings', { id: 'c-f1', kind: 'show', status: 'confirmed', actId: 's-owls', date: P4, venueId: 's-lantern', setTime: '21:00', setLength: 60 });
    await put(f.page, 'bookings', { id: 'c-f2', kind: 'show', status: 'confirmed', actId: 's-sablea', date: P4, venueId: 's-lantern', setTime: '21:30', setLength: 45 });
    await sleep(200);
    await f.page.reload(); await f.page.waitForSelector('#deck .dk-next');
    const Q = '.sheet[aria-label="Did you see them?"]';
    await f.page.locator(Q).waitFor({ timeout: 8000 }).catch(() => {}); await sleep(250);
    const askRow = () => f.page.evaluate(Q => [...document.querySelectorAll(`${Q} .ac-ask-row`)].map(r => ({ id: r.dataset.id, parts: [...r.querySelector('.ac-ask-main').children].map(e => e.textContent), fits: r.scrollWidth <= r.clientWidth + 0.5 && r.getBoundingClientRect().right <= 320.5 })), Q);
    let rows = await askRow();
    const r1 = rows.find(r => r.id === 'c-f1'), r2 = rows.find(r => r.id === 'c-f2');
    ok('renamed act, 320 px: “Did you see them?” lists the show under the new name, then “formerly” with the name that night, then its day and venue', !!r1 && r1.parts[0] === 'Owl Parliament' && r1.parts[1] === 'formerly The Night Owls' && r1.parts.length === 3 && r1.parts[2].endsWith('The Lantern Rooms') && r1.fits, JSON.stringify(rows));
    ok('…and the other act’s row, never renamed, has no such line', !!r2 && r2.parts.length === 2 && r2.parts[0] === 'Sable', JSON.stringify(r2));
    await f.page.click('#ac-ask-no-c-f1'); await sleep(300);
    rows = await askRow();
    ok('…answered No, the row keeps its “formerly” and says Didn’t go', (rows.find(r => r.id === 'c-f1') || {}).parts?.[1] === 'formerly The Night Owls' && (await f.page.locator(`${Q} .ac-ask-row[data-id="c-f1"] .ac-ask-done`).innerText()) === 'Didn’t go', JSON.stringify(rows));
    await f.page.click('#ac-ask-close'); await sleep(300);
    // What every view must say, from the model: the name that night first, then the status, the overlap note, the
    // venue's rules as spoken (with the colour set by hand) and the answer.
    const want = await f.page.evaluate(() => Promise.all([import('./js/model.js'), import('./js/store.js')]).then(([m, s]) => { const b = s.byId('bookings', 'c-f1');
      return { said: ['Formerly The Night Owls', m.statusLabel(b.status), m.overlapText(b), m.rulesChipText(m.showRulesVenue(b)).spoken, 'Didn’t go'].map(x => x + '.').join(' '), overlap: m.overlapText(b), rules: m.rulesChipText(m.showRulesVenue(b)) }; }));
    ok('(the model: the overlap note names the other act, and the rules say the colour was set by hand)', want.overlap === 'Overlaps with Sable, 21:30' && want.rules.spoken === 'House rules, set to strict: Pro cameras not allowed, and 1 more' && want.rules.level === 'strict', JSON.stringify(want));
    const player = () => f.page.evaluate(() => { window.scrollTo(0, 0); const deck = document.querySelector('.deck').getBoundingClientRect(), inDeck = s => { const r = document.querySelector(s).getBoundingClientRect(); return r.width > 0 && r.left >= deck.left - 0.5 && r.right <= deck.right + 0.5; };
      return { page: document.documentElement.scrollWidth, controls: ['#deck .dk-prev', '#deck .dk-list', '#deck .dk-next'].every(inDeck), tab: (document.querySelector('.dk-tab[aria-current=page]') || {}).dataset?.section }; });
    const fits = p => p.page <= 320 && p.controls && p.tab === 'bookings';
    await toWeek(f.page, P4, true);
    const lantern = await f.page.evaluate(() => import('./js/store.js').then(s => String(s.byId('venues', 's-lantern').address || '').split('\n')[0].trim()));
    const wk = await f.page.locator(weekSq(P4)).getAttribute('aria-label'), wkSq = await squareLines(f.page, P4), wkText = await f.page.locator(weekSq(P4)).innerText();
    ok('Week: the square’s spoken name reads the name, “formerly The Night Owls”, the status with Didn’t go, where, the overlap note and the rules', sentence(wk, '21:00 Owl Parliament @ The Lantern Rooms, formerly The Night Owls (') === `21:00 Owl Parliament @ The Lantern Rooms, formerly The Night Owls (Confirmed, didn’t go): ${lantern}; ${want.overlap}; ${want.rules.spoken}` && !!lantern, wk);
    ok('Week: …its rules say in words that the colour was set by hand; the other act’s show, never renamed, has no “formerly”', wk.includes(want.rules.spoken) && /set to strict/.test(want.rules.spoken) && (sentence(wk, '21:30 Sable @ The Lantern Rooms (') || '').startsWith('21:30 Sable @ The Lantern Rooms (Confirmed): '), wk);
    ok('Week: …and the square shows each time whole, inside it, and writes neither “formerly” nor Didn’t go', wkSq.lines.length === 2 && wkSq.lines.every(l => l.timeWhole && l.inside) && !/formerly|Didn’t go/i.test(wkText), JSON.stringify([wkSq, wkText]));
    let p = await player();
    ok('Week: …and the page is no wider than the phone, with the digital player whole', fits(p), JSON.stringify(p));
    const said = () => f.page.evaluate(d => { const b = document.getElementById(`bk-ev-c-f1-${d}`); return b ? b.querySelector('.sr-only').textContent.trim() : null; }, P4);
    await f.page.click(weekSq(P4)); await f.page.waitForSelector('.bk-dayview'); await sleep(200);
    const dayB = await said();
    p = await player();
    ok('Day: the block’s hidden words say “Formerly The Night Owls”, then the status, the overlap, the rules set by hand and Didn’t go', dayB === want.said && fits(p), JSON.stringify([dayB, want.said, p]));
    await view(f.page, 'three');
    const threeB = await said();
    p = await player();
    ok('3 days: the same words', threeB === want.said && fits(p), JSON.stringify([threeB, p]));
    const square = () => f.page.evaluate(d => document.querySelector(`.bk-day[data-date="${d}"]`).getAttribute('aria-label'), P4);
    await view(f.page, 'two');
    const two = await square(), sq = await squareLines(f.page, P4);
    p = await player();
    ok('2 weeks: the day square’s spoken name has “formerly” after the booking’s name, and Didn’t go after the status', two.includes('21:00 Owl Parliament @ The Lantern Rooms, formerly The Night Owls (Confirmed, didn’t go)') && two.includes('21:30 Sable @ The Lantern Rooms (Confirmed)') && fits(p), two);
    ok('2 weeks: …and each line of the square still shows its time whole, inside the square', sq.lines.length === 2 && sq.lines.every(l => l.timeWhole && l.inside), JSON.stringify(sq));
    await view(f.page, 'month');
    const mon = await square();
    p = await player();
    ok('Month: the same in the day’s spoken name', mon.includes('Owl Parliament @ The Lantern Rooms, formerly The Night Owls (Confirmed, didn’t go)') && fits(p), mon);
    await f.page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('c-f1'))); await f.page.waitForSelector('.bk-page .bk-hero'); await sleep(300);
    const hero = await f.page.evaluate(() => { const h = document.querySelector('.bk-hero'), kids = [...h.children].map(e => e.className.split(' ')[0]);
      return { kids, was: (h.querySelector('.bk-formerly') || {}).textContent, title: h.querySelector('.bk-title').textContent, strict: [...h.querySelectorAll('.vn-rules dt')].some(dt => dt.textContent === 'How strict' && dt.nextElementSibling.textContent === 'Strict, set by hand'),
        went: (document.querySelector('.bk-score-went .bk-score-text') || {}).textContent, page: document.documentElement.scrollWidth }; });
    ok('the show’s page: the new name, “formerly The Night Owls” under it, the rules with How strict: Strict, and Didn’t go', hero.title.includes('Owl Parliament') && hero.was === 'formerly The Night Owls' && hero.kids.indexOf('bk-formerly') === hero.kids.indexOf('bk-hero-top') + 1 && hero.strict && hero.went === 'Didn’t go' && hero.page <= 320, JSON.stringify(hero));
    ok('no errors in the console (a renamed act’s show, every line, the digital player)', f.errors.length === 0, f.errors.slice(0, 5).join(' | '));
    await f.browser.close();
  }
})().catch(e => { console.log('FAIL calendar spec crashed — ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')); process.exit(1); });
