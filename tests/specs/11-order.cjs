// Same-day bookings run in the order the bands play: a show by its on-stage time (else doors, soundcheck, load-in),
// anything else by its start, on the night clock (a time before 06:00 is after midnight), a booking with no time last.
// Everywhere bookings are listed by day: a day on the calendar, Coming up, the month's squares, an act's dates, a
// person's and a venue's bookings. And the note on two shows whose sets overlap: "Overlaps with Sable, 21:30".
const { open, ok, sleep, go, toMonth } = require('../helpers.cjs');

const dayFromNow = (page, n) => page.evaluate(n => import('./js/util.js').then(u => { const d = new Date(); d.setDate(d.getDate() + n); return u.ymd(d); }), n);
const put = (page, list, rec) => page.evaluate(([l, r]) => import('./js/store.js').then(s => s.upsert(l, r).id), [list, rec]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The ids of the bookings on a day, in the order the calendar draws them. This helper alone knows how the calendar
// shows a day: it opens the day from its square in the month and comes back to the month.
async function dayIds(page, iso) {
  if (!(await page.locator(`.bk-day[data-date="${iso}"]`).count())) { await page.click('[aria-label="Next month"]'); await sleep(200); }
  await page.locator(`.bk-day[data-date="${iso}"]`).click(); await page.waitForSelector('.bk-dayview');
  const ids = await page.locator('.bk-dayview .bk-ev').evaluateAll(els => els.map(e => e.dataset.id));
  await toMonth(page); await page.waitForSelector('.bk-monthview');
  return ids;
}

(async () => {
  const { browser, page, errors } = await open({ sample: true });
  await page.waitForSelector('.bk-monthview');
  const T = await dayFromNow(page, 8), T1 = await dayFromNow(page, 9); // the sample has nothing on either day

  /* ---------------- the rules, as sums ---------------- */
  const m = await page.evaluate(T => import('./js/model.js').then(m => {
    const show = (x = {}) => ({ kind: 'show', status: 'confirmed', date: T, ...x });
    const a = show({ id: 'a', actId: 's-owls', venueName: 'Room A', setTime: '20:00' }), b = show({ id: 'b', actId: 's-owls', venueName: 'Room B', setTime: '20:30' });
    const c = show({ id: 'c', actId: 's-sablea', setTime: '20:45', setLength: 30 }), d = show({ id: 'd', client: 'Juno', setTime: '20:50' });
    return {
      night: ['00:30', '05:59', '06:00', '9:00', '', '25:00', '24:00', '9:60', null, 900].map(m.nightMin),
      clock: [1470, 360, 1799, 1260].map(m.nightClock),
      field: [show({ setTime: '21:00', doors: '19:00', loadIn: '16:00' }), show({ doors: '19:00', soundcheck: '18:00', loadIn: '16:00' }), show({ soundcheck: '18:00', loadIn: '16:00' }), show({ loadIn: '16:00' }), show(),
        show({ setTime: 'late', doors: '20:00' }), { kind: 'session', start: '10:00', end: '12:00' }, { kind: 'rehearsal', setTime: '21:00' }, { kind: 'other', start: '9:15' }].map(m.playField),
      label: [show({ setTime: '21:00' }), show({ doors: '19:00' }), show({ soundcheck: '18:00' }), show({ loadIn: '16:00' }), { kind: 'session', start: '10:00' }, show()].map(m.playLabel),
      time: m.playTime(show({ doors: '19:00', loadIn: '16:00' })),
      late: [show({ setTime: '00:30' }), show({ setTime: '23:59' }), show(), { kind: 'session', start: '05:00' }].map(m.isAfterMidnight),
      ties: [m.byPlay(show({ setTime: '21:00' }), show({ doors: '21:00' })), m.byPlay(show(), show()), m.byDayPlay(show({ setTime: '21:00' }), show({ setTime: '21:00' })), m.byDayPlayDesc(show(), show())],
      noDate: [m.byDayPlay({ kind: 'show' }, show()) < 0, m.byDayPlay({ kind: 'show', date: 7 }, { kind: 'show' }) === 0, m.byDayPlayDesc(show(), { kind: 'show' }) < 0],
      sorted: [show({ id: 'none' }), show({ id: 'late', setTime: '00:30' }), show({ id: 'eve', setTime: '21:00' }), { id: 'am', kind: 'session', date: T, start: '10:00' }].sort(m.byPlay).map(x => x.id),
      touch: m.setsOverlap(show({ id: 'x', setTime: '21:00', setLength: 60 }), show({ id: 'y', setTime: '22:00' })),
      over: m.setsOverlap(show({ id: 'x', setTime: '21:00', setLength: 61 }), show({ id: 'y', setTime: '22:00' })),
      nextNight: m.setsOverlap(show({ id: 'x', setTime: '00:30' }), show({ id: 'y', date: '2099-01-01', setTime: '23:30', setLength: 120 })),
      pastSix: m.setWindow(show({ setTime: '05:30', setLength: 90 })),
      sameAct: [m.overlapText(a, [a, b]), m.overlapText(b, [a, b])],
      two: m.overlapText(a, [a, b, c]),
      more: m.overlapText(a, [a, b, c, d]),
      client: m.overlapText(c, [c, d]),
      self: m.overlapText(a, [a]),
    };
  }), T);
  ok('the night clock: 00:30 and 05:59 are after midnight, 06:00 is the morning; only a real time counts', same(m.night, [1470, 1799, 360, 540, null, null, null, null, null, null]), JSON.stringify(m.night));
  ok('…and back to a clock time', same(m.clock, ['00:30', '06:00', '05:59', '21:00']), m.clock.join(' '));
  ok('a show plays at its on-stage time, else doors, soundcheck, load-in; anything else at its start', same(m.field, ['setTime', 'doors', 'soundcheck', 'loadIn', '', 'doors', 'start', '', 'start']) && m.time === '19:00', JSON.stringify(m.field));
  ok('…with a name for that time', same(m.label, ['On stage', 'Doors', 'Soundcheck', 'Load-in', 'Start', '']), m.label.join(','));
  ok('a time before 06:00 is after midnight, for any kind', same(m.late, [true, false, false, true]), JSON.stringify(m.late));
  ok('a tie is exactly 0, so the stored order stands; a booking with no date sorts first and never throws', m.ties.every(x => x === 0) && m.noDate.every(Boolean), JSON.stringify([m.ties, m.noDate]));
  ok('a day sorts morning, evening, after midnight, then no time', same(m.sorted, ['am', 'eve', 'late', 'none']), m.sorted.join(','));
  ok('sets that only touch do not overlap; a minute over does; a 00:30 set never meets the next night’s', m.touch === false && m.over === true && m.nextNight === false);
  ok('a set that runs past 06:00 keeps its real end', m.pastSix && m.pastSix.start === 1770 && m.pastSix.end === 1860, JSON.stringify(m.pastSix));
  ok('two shows of the same act name each other by title', m.sameAct[0] === 'Overlaps with The Night Owls @ Room B, 20:30' && m.sameAct[1] === 'Overlaps with The Night Owls @ Room A, 20:00', m.sameAct.join(' | '));
  ok('two others are both named; with more, the first and a count', m.two === 'Overlaps with The Night Owls @ Room B, 20:30 and Sable, 20:45' && m.more === 'Overlaps with The Night Owls @ Room B, 20:30 and 2 more', `${m.two} | ${m.more}`);
  ok('a show with no act goes by its client; a show never overlaps itself', m.client === 'Overlaps with Juno, 20:50' && m.self === '', `${m.client} | ${m.self}`);

  /* ---------------- one day, stored out of order ---------------- */
  const seed = [
    { id: 'o-D', kind: 'show', status: 'confirmed', actId: 's-sablea', date: T, venueName: 'Somewhere' },
    { id: 'o-C', kind: 'show', status: 'confirmed', actId: 's-owls', date: T, venueName: 'Club 9', setTime: '00:30' },
    { id: 'o-A', kind: 'show', status: 'confirmed', actId: 's-sablea', date: T, venueId: 's-harbour', setTime: '21:30' },
    { id: 'o-X', kind: 'show', status: 'cancelled', actId: 's-owls', date: T, venueId: 's-lantern', setTime: '21:15' },
    { id: 'o-E', kind: 'show', status: 'confirmed', actId: 's-owls', date: T, venueId: 's-lantern', loadIn: '16:00', setTime: '21:00', setLength: 75 },
    { id: 'o-B', kind: 'show', status: 'confirmed', actId: 's-sablea', date: T, venueId: 's-harbour', doors: '20:00' },
    { id: 'o-S', kind: 'session', status: 'confirmed', actId: 's-sablea', date: T, venueId: 's-echo', start: '10:00', end: '12:00' },
  ];
  for (const r of seed) await put(page, 'bookings', r);
  await sleep(300);
  const ORDER = ['o-S', 'o-B', 'o-E', 'o-X', 'o-A', 'o-C', 'o-D'], LIVE = ORDER.filter(id => id !== 'o-X');
  const onT = await page.evaluate(T => Promise.all([import('./js/store.js'), import('./js/model.js')]).then(([s, m]) => {
    const b = id => s.byId('bookings', id);
    return {
      on: s.bookingsOn(T).map(x => x.id), coming: s.upcoming().filter(x => x.date === T).map(x => x.id),
      win: Object.fromEntries(['o-E', 'o-A', 'o-C', 'o-B', 'o-D', 'o-X', 'o-S'].map(id => [id, m.setWindow(b(id))])),
      text: Object.fromEntries(['o-E', 'o-A', 'o-C', 'o-B', 'o-D', 'o-X', 'o-S'].map(id => [id, m.overlapText(b(id))])),
      first: m.firstTime(b('o-E')),
    };
  }), T);
  ok('the day’s bookings come in the order the bands play: session 10:00, doors 20:00, 21:00, 21:15, 21:30, 00:30, then no time', same(onT.on, ORDER), onT.on.join(','));
  ok('…and so does Coming up’s list, the cancelled one left out', same(onT.coming, LIVE), onT.coming.join(','));
  ok('a set lasts its length (75), else an hour; none for doors only, no time, a cancelled show or a session', same(onT.win['o-E'], { start: 1260, end: 1335 }) && same(onT.win['o-A'], { start: 1290, end: 1350 }) && same(onT.win['o-C'], { start: 1470, end: 1530 })
    && ['o-B', 'o-D', 'o-X', 'o-S'].every(id => onT.win[id] === null), JSON.stringify(onT.win));
  ok('the two sets that overlap name each other', onT.text['o-E'] === 'Overlaps with Sable, 21:30' && onT.text['o-A'] === 'Overlaps with The Night Owls, 21:00', `${onT.text['o-E']} | ${onT.text['o-A']}`);
  ok('…and nothing else has a note (the cancelled 21:15 show counts for nobody)', ['o-C', 'o-B', 'o-D', 'o-X', 'o-S'].every(id => onT.text[id] === ''), JSON.stringify(onT.text));
  ok('load-in is still the first time of the day (only the order changed)', onT.first === '16:00');

  // the calendar
  const day = await dayIds(page, T);
  ok('the day on the calendar lists them in that order, the cancelled one too', same(day, ORDER), day.join(','));
  if (await page.locator('#bk-agenda-more').count()) { await page.click('#bk-agenda-more'); await sleep(250); } // only eight show at first
  const cards = () => page.locator('.bk-agenda .bk-card').evaluateAll((els, ids) => els.filter(e => ids.includes(e.dataset.id)).map(e => ({ id: e.dataset.id, note: (e.querySelector('.bk-overlap') || {}).textContent || '', text: e.textContent })), ORDER);
  let coming = await cards();
  ok('Coming up lists the day in playing order', same(coming.map(c => c.id), LIVE), coming.map(c => c.id).join(','));
  const note = id => (coming.find(c => c.id === id) || {}).note;
  ok('the two overlapping shows say so on their cards', note('o-E') === 'Overlaps with Sable, 21:30' && note('o-A') === 'Overlaps with The Night Owls, 21:00', `${note('o-E')} | ${note('o-A')}`);
  ok('…and no other card has a note', ['o-C', 'o-D', 'o-B', 'o-S'].every(id => note(id) === ''));
  ok('the card still starts with load-in (its words did not change)', /Load-in 16:00 · On 21:00/.test((coming.find(c => c.id === 'o-E') || {}).text), (coming.find(c => c.id === 'o-E') || {}).text);
  ok('the note is a span inside the card’s button, in the card’s own lines', await page.evaluate(() => { const n = document.querySelector('.bk-agenda .bk-card[data-id="o-E"] .bk-overlap'); return !!n && n.tagName === 'SPAN' && n.parentElement.classList.contains('bk-card-main') && !n.querySelector('button, a'); }));
  const names = await page.evaluate(ids => Promise.all([import('./js/store.js'), import('./js/model.js')]).then(([s, m]) => ids.map(id => { const b = s.byId('bookings', id); return `${m.bookingTitle(b)} (${m.statusLabel(b.status)})`; })), ORDER);
  let label = await page.locator(`.bk-day[data-date="${T}"]`).getAttribute('aria-label');
  ok('the month’s square names them in playing order', label.endsWith(': ' + names.join(', ')), label);
  const dots = await page.locator(`.bk-day[data-date="${T}"] .bk-dot`).evaluateAll(els => els.map(e => e.className));
  ok('…and its dots follow: three confirmed, then the cancelled 21:15 show (by first time, four confirmed led)', same(dots.map(c => (c.match(/st-\w+/) || [])[0]), ['st-confirmed', 'st-confirmed', 'st-confirmed', 'st-cancelled']), dots.join(' | '));
  // A booking over several days leads its squares whatever its times, so its bar keeps its row.
  await put(page, 'bookings', { id: 'o-W', kind: 'other', status: 'hold', title: 'Weekender', date: T, endDate: T1 }); await sleep(300);
  label = await page.locator(`.bk-day[data-date="${T}"]`).getAttribute('aria-label');
  ok('a two-day booking is named first on its squares, though it has no time', label.includes(': Weekender (Hold), ' + names[0]) && /bk-bar/.test(await page.locator(`.bk-day[data-date="${T}"] .bk-dot`).first().getAttribute('class')), label);
  ok('…while in the day’s own order it is last, with no time', (await page.evaluate(T => import('./js/store.js').then(s => s.bookingsOn(T).map(x => x.id)), T)).pop() === 'o-W');
  await page.evaluate(() => import('./js/store.js').then(s => s.remove('bookings', 'o-W'))); await sleep(300);

  // every role: the same order and the same note, with money off too
  await page.evaluate(() => import('./js/roles.js').then(r => r.setRole('scout'))); await sleep(400);
  coming = await cards();
  ok('a scout sees the same order and the same notes', same(coming.map(c => c.id), LIVE) && note('o-E') === 'Overlaps with Sable, 21:30' && note('o-A') === 'Overlaps with The Night Owls, 21:00', coming.map(c => c.id + ':' + c.note).join(' | '));
  await page.evaluate(() => { localStorage.removeItem('gdex-role'); }); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(300);

  /* ---------------- an act's dates, a person's bookings, a venue's bookings ---------------- */
  await put(page, 'acts', { id: 't-act', name: 'Test Pilots' });
  await put(page, 'venues', { id: 't-room', kind: 'venue', name: 'Test Room' });
  await put(page, 'venues', { id: 't-hall', kind: 'venue', name: 'Test Hall' });
  await put(page, 'people', { id: 't-per', name: 'Pat Example', group: 'crew' });
  // P's load-in (15:00) is the first time of the day; Q is on stage first (20:00), then R (21:00), then P (22:00).
  await put(page, 'bookings', { id: 'o-P', kind: 'show', status: 'confirmed', actId: 't-act', venueId: 't-room', people: ['t-per'], date: T1, loadIn: '15:00', setTime: '22:00' });
  await put(page, 'bookings', { id: 'o-Q', kind: 'show', status: 'confirmed', actId: 't-act', venueId: 't-hall', people: ['t-per'], date: T1, doors: '19:00', setTime: '20:00' });
  await put(page, 'bookings', { id: 'o-R', kind: 'show', status: 'confirmed', actId: 's-owls', venueId: 't-room', date: T1, doors: '19:00', setTime: '21:00' });
  await sleep(300);
  ok('sets that follow each other (20:00, 21:00, 22:00, an hour each) carry no note', await page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/model.js')]).then(([s, m]) => ['o-P', 'o-Q', 'o-R'].every(id => m.overlapText(s.byId('bookings', id)) === ''))));
  await go(page, 'acts'); await page.waitForSelector('.ac-card[data-id="t-act"]');
  const where = await page.locator('.ac-card[data-id="t-act"] .ac-date .ac-date-where').allTextContents();
  ok('an act’s dates: the 20:00 set before the 22:00 one, whatever their load-ins', same(where, ['Show at Test Hall', 'Show at Test Room']), where.join(' | '));
  await page.evaluate(() => import('./js/pages/people.js').then(p => { p.openPerson('t-per'); })); await page.waitForSelector('.pp-upcoming .pp-bk');
  const forPat = await page.locator('.pp-upcoming .pp-bk').evaluateAll(els => els.map(e => e.dataset.id));
  ok('a person’s bookings: the same order', same(forPat, ['o-Q', 'o-P']), forPat.join(','));
  await page.keyboard.press('Escape'); await sleep(250);
  await page.evaluate(() => import('./js/pages/venues.js').then(v => { v.openVenue('t-room'); })); await page.waitForSelector('.vn-sheet .vn-row');
  const atRoom = await page.locator('.vn-sheet .vn-rows').first().locator('.vn-row').evaluateAll(els => els.map(e => e.id));
  ok('a venue’s “Coming up here”: the 21:00 set before the 22:00 one', same(atRoom, ['vn-bk-o-R', 'vn-bk-o-P']), atRoom.join(','));
  await page.keyboard.press('Escape'); await sleep(250);
  // Past days: newest day first, and inside a day still the order they played.
  const back = await page.evaluate(() => import('./js/model.js').then(m => [{ id: 'old', date: '2020-01-01', kind: 'show', setTime: '20:00' }, { id: 'new-late', date: '2020-01-02', kind: 'show', setTime: '22:00' }, { id: 'new-early', date: '2020-01-02', kind: 'show', setTime: '20:00' }].sort(m.byDayPlayDesc).map(x => x.id)));
  ok('past bookings read newest day first, a day in playing order', same(back, ['new-early', 'new-late', 'old']), back.join(','));

  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL order spec crashed — ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')); process.exit(1); });
