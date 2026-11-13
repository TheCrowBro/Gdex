// The groundwork under the calendar views, "Did you see them?", the digital player and house rules: the contracts the
// features code against, checked as sums and small tables. When a show is over; which shows wait for an answer; the
// "Didn’t go" answer on a booking and on its card; who is asked; the calendar's view kept on the device; the section
// menu's words for three menus; the house-rules model (levels, the chip's words, the lists); and that a booking with
// no date can never blank the page. Every "is it over" sum uses a fixed now, never the clock.
const { open, ok, sleep, go } = require('../helpers.cjs');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Runs fn(store, arg) in the page. The function's text is sent as part of the expression Playwright evaluates (the
// page's own scripts never build code from strings: the CSP forbids it).
const store = (page, fn, arg) => page.evaluate(`import('./js/store.js').then(s => (${fn.toString()})(s, ${JSON.stringify(arg === undefined ? null : arg)}))`);
const dayIso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const sheetNamed = (page, t) => page.locator(`.sheet[aria-label="${t}"]`);

(async () => {
  /* ================= with the sample ================= */
  const { browser, page, errors } = await open({ sample: true });
  await page.waitForSelector('.bk-monthview');
  ok('the test helper turns the question off on every load', (await page.evaluate(() => localStorage.getItem('gdex-ask-seen'))) === 'off');

  /* ---------------- when a show is over ---------------- */
  const D = '2031-05-17', D1 = '2031-05-18'; // every date here is counted from a fixed day, never from today
  await store(page, s => s.upsert('venues', { id: 'g-dawn', kind: 'venue', name: 'Dawn Club', curfew: '06:00' })); // an all-nighter's club, taken out again below
  const end = await page.evaluate(([D, D1]) => import('./js/model.js').then(m => {
    const at = d => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : null);
    const e = x => at(m.showEnd({ kind: 'show', status: 'confirmed', date: D, ...x }));
    const bare = { kind: 'show', status: 'confirmed', date: D };
    return {
      setLength: e({ setTime: '21:00', setLength: 45, curfew: '23:00' }),
      curfew: e({ setTime: '21:00', curfew: '23:00' }),
      venueCurfew: e({ setTime: '21:00', venueId: 's-lantern' }),
      ownCurfewFirst: e({ setTime: '21:00', curfew: '22:30', venueId: 's-lantern' }),
      curfewBeforeSet: e({ setTime: '23:30', curfew: '23:00' }),
      curfewAfterMidnight: e({ setTime: '23:30', curfew: '00:30' }),
      doorsAndCurfew: e({ doors: '19:00', curfew: '23:00' }),
      curfewAlone: e({ curfew: '22:00' }),
      allNighter: e({ doors: '22:00', curfew: '06:00' }), allNighter7: e({ loadIn: '20:00', curfew: '07:00' }), dawnAlone: e({ curfew: '06:00' }),
      venueDawn: e({ doors: '23:00', venueId: 'g-dawn' }),
      setOnly: e({ setTime: '21:00', venueName: 'A typed place' }),
      zeroLength: e({ setTime: '21:00', setLength: 0 }),
      junkTimes: e({ setTime: 'late', curfew: '23:00' }),
      noTimes: e({}),
      doorsOnly: e({ doors: '19:00', loadIn: '16:00' }),
      afterMidnight: e({ setTime: '00:30', setLength: 30 }),
      twoDays: e({ endDate: D1, setTime: '16:30', setLength: 30 }),
      session: m.showEnd({ kind: 'session', date: D, start: '10:00', end: '18:00' }),
      noDate: m.showEnd({ kind: 'show', setTime: '21:00' }),
      junkDate: m.showEnd({ kind: 'show', date: 'soon' }),
      at0559: m.showOver(bare, new Date(2031, 4, 18, 5, 59)), at0600: m.showOver(bare, new Date(2031, 4, 18, 6, 0)),
      setBefore: m.showOver({ ...bare, setTime: '21:00', setLength: 45 }, new Date(2031, 4, 17, 21, 44)), setAfter: m.showOver({ ...bare, setTime: '21:00', setLength: 45 }, new Date(2031, 4, 17, 21, 45)),
      overNot: [m.showOver({ kind: 'session', date: D }, new Date(2040, 0, 1)), m.showOver({ kind: 'show' }, new Date(2040, 0, 1)), m.showOver(null, new Date(2040, 0, 1))],
      askDays: m.ASK_DAYS,
    };
  }), [D, D1]);
  await store(page, s => s.remove('venues', 'g-dawn'));
  ok('a show is over when its set ends (on stage plus set length)', end.setLength === `${D} 21:45` && end.setBefore === false && end.setAfter === true, end.setLength);
  ok('with no set length: at the curfew, the booking’s own before its venue’s', end.curfew === `${D} 23:00` && end.venueCurfew === `${D} 23:00` && end.ownCurfewFirst === `${D} 22:30`, [end.curfew, end.venueCurfew, end.ownCurfewFirst].join(' | '));
  ok('a curfew before the set is skipped (two hours after the set); one after midnight is the next morning', end.curfewBeforeSet === `${D1} 01:30` && end.curfewAfterMidnight === `${D1} 00:30`, [end.curfewBeforeSet, end.curfewAfterMidnight].join(' | '));
  ok('doors and a curfew with no on-stage time: the curfew; a curfew alone counts too', end.doorsAndCurfew === `${D} 23:00` && end.curfewAlone === `${D} 22:00` && end.junkTimes === `${D} 23:00`, [end.doorsAndCurfew, end.curfewAlone, end.junkTimes].join(' | '));
  ok('an all-nighter with no on-stage time (doors 22:00, curfew 06:00 or 07:00; the venue’s 06:00) is over the next morning, and so is a curfew of 06:00 alone', end.allNighter === `${D1} 06:00` && end.allNighter7 === `${D1} 07:00` && end.venueDawn === `${D1} 06:00` && end.dawnAlone === `${D1} 06:00`, [end.allNighter, end.allNighter7, end.venueDawn, end.dawnAlone].join(' | '));
  ok('an on-stage time and nothing else: two hours after it (a length of 0 is no length)', end.setOnly === `${D} 23:00` && end.zeroLength === `${D} 23:00`, [end.setOnly, end.zeroLength].join(' | '));
  ok('no times, or only doors and load-in: 06:00 the morning after (not over at 05:59, over at 06:00)', end.noTimes === `${D1} 06:00` && end.doorsOnly === `${D1} 06:00` && end.at0559 === false && end.at0600 === true, [end.noTimes, end.doorsOnly, end.at0559, end.at0600].join(' | '));
  ok('a 00:30 set belongs to the night before; a two-day show ends on its last day', end.afterMidnight === `${D1} 01:00` && end.twoDays === `${D1} 17:00`, [end.afterMidnight, end.twoDays].join(' | '));
  ok('a session, and a show with no date, are never “over”', end.session === null && end.noDate === null && end.junkDate === null && end.overNot.every(x => x === false) && end.askDays === 14);

  /* ---------------- the shows waiting for an answer ---------------- */
  await store(page, s => {
    s.upsert('acts', { id: 'g-act', name: 'Groundwork', seen: [{ id: 'g-sn', date: '2031-05-17', bookingId: 'w-scored', rating: 80 }] });
    const show = (id, date, x = {}) => s.upsert('bookings', { id, kind: 'show', status: 'confirmed', actId: 'g-act', date, venueName: 'Typed Hall', ...x });
    show('w-14', '2031-05-06'); show('w-15', '2031-05-05'); show('w-2', '2031-05-18');
    show('w-1', '2031-05-19', { setTime: '21:00', setLength: 60 });
    show('w-tonight', '2031-05-20', { setTime: '23:00' });
    show('w-multi', '2031-05-01', { endDate: '2031-05-07' });
    show('w-canc', '2031-05-16', { status: 'cancelled' });
    show('w-noact', '2031-05-16', { actId: '' });
    show('w-gone', '2031-05-16', { actId: 'not-in-acts' });
    show('w-scored', '2031-05-17', { went: 'no' });
    show('w-no', '2031-05-15', { went: 'no' });
    show('w-hold', '2031-05-12', { status: 'hold' });
    s.upsert('bookings', { id: 'w-sess', kind: 'session', status: 'confirmed', actId: 'g-act', date: '2031-05-18', start: '10:00', end: '12:00' });
  });
  const wait = await page.evaluate(() => Promise.all([import('./js/model.js'), import('./js/store.js')]).then(([m, s]) => {
    const NOW = new Date(2031, 4, 20, 12, 0), b = id => s.byId('bookings', id);
    return {
      plain: m.waitingShows(NOW).map(x => x.id), holds: m.waitingShows(NOW, { holds: true }).map(x => x.id),
      morning: m.waitingShows(new Date(2031, 4, 19, 5, 59)).map(x => x.id).includes('w-2'),
      answers: Object.fromEntries(['w-2', 'w-no', 'w-scored', 'w-sess'].map(id => [id, m.seenAnswer(b(id))])),
    };
  }));
  ok('waiting: over, not cancelled, with an act in Acts, up to 14 days after, no answer yet; newest first', same(wait.plain, ['w-1', 'w-2', 'w-14', 'w-multi']), wait.plain.join(','));
  ok('…left out: day 15, tonight’s, a session, a cancelled show, no act, an act that is gone, a scored show, a “Didn’t go”', !['w-15', 'w-tonight', 'w-sess', 'w-canc', 'w-noact', 'w-gone', 'w-scored', 'w-no'].some(id => wait.holds.includes(id)));
  ok('a hold is left out for a role with money, and asked about with holds: true', !wait.plain.includes('w-hold') && same(wait.holds, ['w-1', 'w-2', 'w-hold', 'w-14', 'w-multi']), wait.holds.join(','));
  ok('a show with no times is not waiting before 06:00 the next morning', wait.morning === false);
  ok('the answer on a show: none, “no”, and a score beats “Didn’t go”', same(wait.answers, { 'w-2': '', 'w-no': 'no', 'w-scored': 'seen', 'w-sess': '' }), JSON.stringify(wait.answers));
  const went = await page.evaluate(() => Promise.all([import('./js/model.js'), import('./js/store.js')]).then(([m, s]) => {
    const out = {}, b = () => s.byId('bookings', 'w-2'), t0 = b().updatedAt;
    m.markWent('w-2'); out.set = b().went; out.stamped = b().updatedAt >= t0;
    const r1 = s.revision(); m.markWent('w-2', true); out.again = s.revision() === r1;
    m.markWent('w-2', false); out.cleared = !('went' in b());
    const r2 = s.revision(); m.markWent('w-2', false); m.markWent('nope', true); out.quiet = s.revision() === r2;
    out.toasts = document.querySelectorAll('.toast').length;
    return out;
  }));
  ok('markWent sets “no”, takes it back, writes nothing when nothing changes, and is quiet', went.set === 'no' && went.stamped && went.again && went.cleared && went.quiet && went.toasts === 0, JSON.stringify(went));

  /* ---------------- "Didn’t go" on a card; a copy and an edit ---------------- */
  const extras = await page.evaluate(() => Promise.all([import('./js/bookings-kit.js'), import('./js/store.js')]).then(([k, s]) => {
    const cls = list => list.map(n => `${n.tagName}.${n.className}:${n.textContent}`);
    const no = s.byId('bookings', 'w-no');
    // two overlapping shows at typed venues, one of them marked: the note comes before "Didn’t go"
    s.upsert('bookings', { id: 'w-o1', kind: 'show', status: 'confirmed', actId: 'g-act', date: '2031-05-10', venueName: 'Room One', setTime: '21:00', went: 'no' });
    s.upsert('bookings', { id: 'w-o2', kind: 'show', status: 'confirmed', actId: 's-owls', date: '2031-05-10', venueName: 'Room Two', setTime: '21:30' });
    return {
      no: cls(k.cardExtras(no)), cancelled: cls(k.cardExtras({ ...no, status: 'cancelled' })), scored: cls(k.cardExtras(s.byId('bookings', 'w-scored'))),
      session: cls(k.cardExtras({ ...s.byId('bookings', 'w-sess'), went: 'no' })), plain: cls(k.cardExtras(s.byId('bookings', 'w-2'))),
      both: cls(k.cardExtras(s.byId('bookings', 'w-o1'))), mark: !!k.wentMark(no) && k.wentMark({ ...no, went: 'yes' }) === null && k.overlapNote(no) === null,
      controls: k.cardExtras(s.byId('bookings', 'w-o1')).some(n => n.querySelector('button, a, input')),
    };
  }));
  ok('a show marked “Didn’t go” gets one pill on its card', same(extras.no, ['SPAN.pill bk-went:Didn’t go']) && extras.mark, extras.no.join(' | '));
  ok('…not when it is cancelled, scored, or not a show; an unanswered show gets nothing', [extras.cancelled, extras.scored, extras.session, extras.plain].every(x => x.length === 0), JSON.stringify([extras.cancelled, extras.scored, extras.session, extras.plain]));
  ok('a card’s extra lines come in order (the overlap note, then “Didn’t go”), as spans with no control inside', same(extras.both, ['SPAN.bk-overlap:Overlaps with The Night Owls, 21:30', 'SPAN.pill bk-went:Didn’t go']) && extras.controls === false, extras.both.join(' | '));
  ok('a duplicate is never born “Didn’t go”', await page.evaluate(() => Promise.all([import('./js/pages/bookings.js'), import('./js/store.js')]).then(([b, s]) => { const c = b.copyOf(s.byId('bookings', 'w-no'), '2031-06-01'); return !('went' in c) && c.date === '2031-06-01'; })));
  const edit = async fill => {
    await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('w-no'))); await page.waitForSelector('.bk-page .bk-edit');
    await page.click('.bk-page .bk-edit'); await sheetNamed(page, 'Edit show').waitFor();
    await fill(sheetNamed(page, 'Edit show'));
    await sheetNamed(page, 'Edit show').locator('button[type="submit"]').click(); await sleep(350);
    return store(page, s => JSON.parse(JSON.stringify(s.byId('bookings', 'w-no'))));
  };
  let rec = await edit(f => f.locator('[data-key="title"]').fill('A night out'));
  ok('saving the Edit form with only the title changed keeps “Didn’t go”', rec.title === 'A night out' && rec.went === 'no', JSON.stringify({ t: rec.title, w: rec.went }));
  rec = await edit(f => f.locator('[data-key="date"]').fill('2031-05-14'));
  ok('…and with another date drops it: the show is asked about again', rec.date === '2031-05-14' && !('went' in rec), JSON.stringify({ d: rec.date, w: rec.went }));
  await store(page, s => s.patch('bookings', 'w-no', { went: 'no' }));
  rec = await edit(f => f.locator('select[id$="-actId"]').selectOption('s-owls'));
  ok('…and so does another act', rec.actId === 's-owls' && !('went' in rec), JSON.stringify({ a: rec.actId, w: rec.went }));
  // Deleting the act takes it off the show, as an edit to another act does: the show has no act to be asked about,
  // and its page has nothing that could take a “Didn’t go” back.
  rec = await store(page, s => {
    s.upsert('acts', { id: 'g-gone', name: 'Gone Soon' }); s.patch('bookings', 'w-no', { actId: 'g-gone', went: 'no' }); s.remove('acts', 'g-gone');
    return JSON.parse(JSON.stringify(s.byId('bookings', 'w-no')));
  });
  const goneMark = await page.evaluate(() => Promise.all([import('./js/bookings-kit.js'), import('./js/store.js')]).then(([k, s]) => k.wentMark(s.byId('bookings', 'w-no')) === null));
  ok('…and so does deleting the act: no act, no “Didn’t go” on its card', rec.actId === '' && !('went' in rec) && goneMark, JSON.stringify({ a: rec.actId, w: rec.went }));
  // The act deleted on one device, the show marked No on another, the two merged: the show keeps the No and points at
  // an act that is not there. Nothing on its page could take the answer back, so nothing says it.
  const dangling = await page.evaluate(() => Promise.all([import('./js/bookings-kit.js'), import('./js/store.js'), import('./js/model.js')]).then(([k, s, m]) => {
    s.patch('bookings', 'w-no', { actId: 'g-elsewhere', went: 'no' });
    const b = s.byId('bookings', 'w-no');
    return { act: b.actId, went: b.went, answer: m.seenAnswer(b), mark: k.wentMark(b) === null };
  }));
  ok('…and a show whose act is not there at all (deleted on another device before a merge) says no “Didn’t go” either', dangling.act === 'g-elsewhere' && dangling.went === 'no' && dangling.answer === '' && dangling.mark, JSON.stringify(dangling));

  /* ---------------- the booking page's seams ---------------- */
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('s-show1'))); await page.waitForSelector('.bk-page .bk-hero');
  const titles = await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.bookings.tutorial().map(s => s.title)));
  ok('the booking’s walkthrough has a House rules step after Times', titles.indexOf('House rules') === titles.indexOf('Times') + 1 && titles.includes('Times'), titles.join(', '));
  const rv = await page.evaluate(() => Promise.all([import('./js/model.js'), import('./js/store.js')]).then(([m, s]) => {
    const show = s.byId('bookings', 's-show1'), id = x => (x ? x.id : null);
    return [id(m.showRulesVenue(show)), id(m.showRulesVenue({ ...show, status: 'cancelled' })), id(m.showRulesVenue({ ...show, venueId: '', venueName: 'Typed' })), id(m.showRulesVenue(s.byId('bookings', 's-sess1'))), id(m.showRulesVenue({ ...show, venueId: 'gone' })), id(m.showRulesVenue(null))];
  }));
  ok('house rules come from the saved venue of a show that is not cancelled, and from nowhere else', same(rv, ['s-lantern', null, null, null, null, null]), JSON.stringify(rv));

  /* ---------------- a booking with no date never blanks the page ---------------- */
  await store(page, s => { s.upsert('bookings', { id: 'g-nodate', kind: 'show', status: 'confirmed', title: 'No date yet' }); s.upsert('bookings', { id: 'g-nodate2', kind: 'other', status: 'hold', title: 'Also no date' }); });
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('g-nodate'))); await sleep(350);
  ok('a booking stored with no date opens on its page', (await page.locator('.bk-page .bk-hero').count()) === 1 && /No date/.test(await page.locator('.bk-when').innerText()));
  await store(page, s => { s.remove('bookings', 'g-nodate'); }); await sleep(400);
  ok('removed while it is open, it lands on a day that draws', (await page.locator('.bk-dayview').count()) === 1 && (await page.locator('.bk-page').count()) === 0 && (await page.locator('.bk-dayview [data-view-head]').count()) === 1);
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('g-nodate2'))); await sleep(350);
  await page.click('.bk-page .back-btn'); await sleep(350);
  ok('Back from a booking with no date opens a day too', (await page.locator('.bk-dayview').count()) === 1 && (await page.locator('.bk-page').count()) === 0);
  ok('…with nothing in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
  await store(page, s => { s.remove('bookings', 'g-nodate2'); });

  /* ---------------- a backup whose booking has a number for a title, or a date that is not text ---------------- */
  // A backup comes in through store.normalise, merged or in place of this device's copy. The calendar is every role's
  // first page, so one odd booking in it must not blank the page on every open.
  const D3 = dayIso(3);
  await store(page, (s, D3) => s.mergeIn({ bookings: [
    { id: 'g-j-title', kind: 'show', status: 'confirmed', actId: 's-owls', venueId: 's-lantern', date: D3, setTime: '21:00', title: 2026 },
    { id: 'g-j-date', kind: 'show', status: 'confirmed', title: 'Date as an object', date: {} },
    { id: 'g-j-dates', kind: 'show', status: 'confirmed', title: 'Date as a list', date: [D3] },
    { id: 'g-j-end', kind: 'show', status: 'confirmed', title: 'Last day as an object', date: D3, endDate: {} },
    { id: 'g-j-ends', kind: 'show', status: 'confirmed', title: 'Last day as a list', date: D3, endDate: [D3] },
  ] }), D3);
  await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(400);
  if (await page.locator('#bk-agenda-more').count()) { await page.click('#bk-agenda-more'); await sleep(300); }
  const junkViews = [];
  for (const v of ['month', 'two', 'week', 'three', 'day', 'month']) {
    if (await page.locator('#bk-view-' + v).count()) { await page.click('#bk-view-' + v); await sleep(250); }
    junkViews.push(await page.evaluate(() => (document.querySelector('#page .bk-calview') ? 'drawn' : 'blank') + ':' + document.querySelectorAll('#page .bk-agenda .bk-card').length));
  }
  const junkCard = await page.locator('.bk-agenda .bk-card[data-id="g-j-title"] .bk-card-title').allInnerTexts();
  ok('after such a backup the calendar draws in every view, with Coming up in full', junkViews.every(x => /^drawn:[1-9]/.test(x)) && /2026/.test(junkCard.join('')), `${junkViews.join(' ')} | ${junkCard.join('')}`);
  ok('…with nothing in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
  await store(page, s => { for (const id of ['g-j-title', 'g-j-date', 'g-j-dates', 'g-j-end', 'g-j-ends']) s.remove('bookings', id); });
  await sleep(300);

  /* ---------------- house rules: the model ---------------- */
  const hr = await page.evaluate(() => Promise.all([import('./js/model.js'), import('./js/store.js')]).then(([m, s]) => {
    const chip = v => { const t = m.rulesChipText(v); return t ? [t.level, t.label, t.spoken] : null; };
    const lantern = s.byId('venues', 's-lantern'), harbour = s.byId('venues', 's-harbour');
    const tones = (rules, note) => ['relaxed', 'some', 'strict', 'junk'].map(t => chip({ rules, rulesNote: note, rulesTone: t }));
    return {
      ids: m.HOUSE_RULES.map(r => r.id), groups: m.RULE_GROUPS.map(g => g[0]), ruleGroups: [...new Set(m.HOUSE_RULES.map(r => r.group))], tones: m.RULE_TONES.map(t => t[0]),
      kinds: m.HOUSE_RULES.every(r => ['allow', 'fact', 'pick'].includes(r.kind) && r.label && r.icon && (r.kind !== 'pick' || r.options.length >= 3) && (r.kind !== 'fact' || (r.yes && r.no))),
      junk: [m.rulesOf({ rules: 'x' }), m.rulesOf({ rules: ['yes'] }), m.rulesOf(null), m.rulesOf({ rules: { nope: 'yes', phones: 'maybe', age: '16', floor: 'both', proCameras: 'no' }, rulesTone: 'junk', rulesNote: 5 })].map(r => ({ v: r.values, n: r.note, t: r.tone, k: r.known, r: r.restricted.map(x => x.id) })),
      of: (r => ({ v: r.values, n: r.note, t: r.tone, k: r.known, r: r.restricted.map(x => x.id) }))(m.rulesOf({ rules: { phones: 'yes', bags: 'no', cashOnly: 'yes', earplugs: 'yes', age: '18', floor: 'seated' }, rulesNote: '  Coats in the cloakroom.  ', rulesTone: 'strict' })),
      level: { nothing: m.rulesLevel({}), none: m.rulesLevel(null), fine: m.rulesLevel({ rules: { phones: 'yes' } }), lantern: m.rulesLevel(lantern), harbour: m.rulesLevel(harbour) },
      chip: {
        nothing: chip({}), fine: chip({ rules: { phones: 'yes' } }), lantern: chip(lantern), harbour: chip(harbour),
        phonesNo: chip({ rules: { phones: 'no', flash: 'no' } }), cameras: chip({ rules: { proCameras: 'no', compacts: 'no', phones: 'yes' } }), allThree: chip({ rules: { proCameras: 'no', compacts: 'no', phones: 'no' } }),
        age21: chip({ rules: { age: '21' } }), age18more: chip({ rules: { age: '18', bags: 'no' } }), allAges: chip({ rules: { age: 'all' } }),
        fact: chip({ rules: { cashOnly: 'yes' } }), factFine: chip({ rules: { cashOnly: 'no', earplugs: 'yes', floor: 'standing' } }),
        note: chip({ rulesNote: 'No re-entry.' }), longNote: chip({ rulesNote: 'No re-entry after eleven at night, coats in the cloakroom' }), longWord: chip({ rulesNote: 'Supercalifragilisticexpialidocious-and-then-some' }), cutComma: chip({ rulesNote: 'Shoes off in the live room, and no drinks near the desk.' }), cutStop: chip({ rulesNote: 'No bags at all in here. Coats too.' }),
        lines: chip({ rulesNote: '\n   \n  Ask   at the\tdoor \nSecond line' }), markup: chip({ rulesNote: '<b>No bags</b> after 11' }),
        fineNote: chip({ rules: { phones: 'yes' }, rulesNote: 'Coats in the cloakroom' }), badNote: chip({ rules: { proCameras: 'no' }, rulesNote: 'Coats in the cloakroom' }), badTwoNote: chip({ rules: { proCameras: 'no', flash: 'no', bags: 'no' }, rulesNote: 'x' }),
        tonesEmpty: tones(undefined, ''), tonesBad: tones({ proCameras: 'no' }, ''), tonesNote: tones(undefined, 'Ask at the door'), tonesFineNote: tones({ phones: 'yes' }, 'Ask at the door'),
      },
      list: [m.rulesList(lantern), m.rulesList({ rules: { age: '18', idNeeded: 'no', floor: 'both', strobes: 'yes', reentry: 'no' }, rulesNote: ' Two lines\nhere ' }), m.rulesList({}),
        ...['relaxed', 'some', 'strict', 'junk'].map(t => m.rulesList({ rules: { phones: 'yes' }, rulesTone: t }))],
      // For each venue: as many restrictions in the full rules (Not allowed and Restricted, and a note) as the chip names and counts.
      counted: [{ rules: { proCameras: 'no', age: '21', cashOnly: 'yes', strobes: 'yes' } }, { rules: { age: '18', idNeeded: 'yes', bags: 'no' }, rulesNote: 'x' }, { rules: { cashOnly: 'yes', earplugs: 'yes', floor: 'seated' } }, { rules: { phones: 'no', proCameras: 'no', compacts: 'no', strobes: 'yes' } }].map(v => {
        const c = m.rulesChipText(v), l = m.rulesList(v), more = Number((/· (\d+) more$/.exec(c.label) || [0, 0])[1]), main = /No phones or cameras/.test(c.label) ? 3 : /No cameras/.test(c.label) ? 2 : 1;
        return { label: c.label, list: l, named: l.no.length + l.restricted.length + (l.note ? 1 : 0) === main + more };
      }),
    };
  }));
  ok('seventeen house rules with their own ids, in four groups; four tones', hr.ids.length === 17 && new Set(hr.ids).size === 17 && same(hr.groups, ['cameras', 'entry', 'inside', 'crowd']) && same(hr.ruleGroups, hr.groups) && same(hr.tones, ['', 'relaxed', 'some', 'strict']) && hr.kinds, hr.ids.join(','));
  ok('rules that are not an object, unknown rules and unknown answers are ignored', same(hr.junk.slice(0, 3), Array(3).fill({ v: {}, n: '', t: '', k: 0, r: [] })) && same(hr.junk[3], { v: { proCameras: 'no', floor: 'both' }, n: '', t: '', k: 2, r: ['proCameras'] }), JSON.stringify(hr.junk));
  ok('a venue’s rules, cleaned: the answers, the note trimmed, the tone, and what is restricted in list order', same(hr.of, { v: { phones: 'yes', age: '18', bags: 'no', cashOnly: 'yes', floor: 'seated', earplugs: 'yes' }, n: 'Coats in the cloakroom.', t: 'strict', k: 6, r: ['age', 'bags', 'cashOnly'] }), JSON.stringify(hr.of));
  ok('no rules: no level and no chip; one fine answer: green', hr.level.nothing === '' && hr.level.none === '' && hr.chip.nothing === null && hr.level.fine === 'ok' && same(hr.chip.fine, ['ok', 'No restrictions', 'House rules: No restrictions']), JSON.stringify(hr.chip.fine));
  ok('the sample: The Lantern Rooms is amber, “📷 Pro cameras ✗ · 1 more”', hr.level.lantern === 'some' && same(hr.chip.lantern, ['some', '📷 Pro cameras ✗ · 1 more', 'House rules: Pro cameras not allowed, and 1 more']), JSON.stringify(hr.chip.lantern));
  ok('…and Harbour Hall is green, “No restrictions”', hr.level.harbour === 'ok' && same(hr.chip.harbour, ['ok', 'No restrictions', 'House rules: No restrictions']), JSON.stringify(hr.chip.harbour));
  ok('phones not allowed: red, phones named first', same(hr.chip.phonesNo, ['strict', '📱 Phones ✗ · 1 more', 'House rules: Phones not allowed, and 1 more']), JSON.stringify(hr.chip.phonesNo));
  ok('no pro cameras and no point-and-shoots: red, “No cameras”; with phones too, “No phones or cameras”', same(hr.chip.cameras, ['strict', '📷 No cameras', 'House rules: No cameras']) && same(hr.chip.allThree, ['strict', '📵 No phones or cameras', 'House rules: No phones or cameras']), JSON.stringify([hr.chip.cameras, hr.chip.allThree]));
  ok('an age limit is a restriction with its own words; all ages is not', same(hr.chip.age21, ['some', '🔞 21+', 'House rules: Age limit 21+']) && same(hr.chip.age18more, ['some', '🔞 18+ · 1 more', 'House rules: Age limit 18+, and 1 more']) && same(hr.chip.allAges, ['ok', 'No restrictions', 'House rules: No restrictions']), JSON.stringify([hr.chip.age21, hr.chip.age18more]));
  ok('a fact reads in its own words (Cash only); cards taken, earplugs advised and standing restrict nothing', same(hr.chip.fact, ['some', '💵 Cash only', 'House rules: Cash only']) && same(hr.chip.factFine, ['ok', 'No restrictions', 'House rules: No restrictions']), JSON.stringify([hr.chip.fact, hr.chip.factFine]));
  ok('free text alone: amber, with the start of the note', same(hr.chip.note, ['some', '📝 No re-entry.', 'House rules: Note: No re-entry.']), JSON.stringify(hr.chip.note));
  ok('…a long note is cut at a word with an ellipsis; one long word at 28 characters', same(hr.chip.longNote, ['some', '📝 No re-entry after eleven at…', 'House rules: Note: No re-entry after eleven at…']) && hr.chip.longWord[1] === '📝 Supercalifragilisticexpialid…' && [...'Supercalifragilisticexpialid'].length === 28, JSON.stringify([hr.chip.longNote, hr.chip.longWord]));
  ok('…a cut that lands after a comma or a full stop leaves none hanging before the …', hr.chip.cutComma[1] === '📝 Shoes off in the live room…' && hr.chip.cutComma[2] === 'House rules: Note: Shoes off in the live room…' && hr.chip.cutStop[1] === '📝 No bags at all in here…', JSON.stringify([hr.chip.cutComma, hr.chip.cutStop]));
  ok('…its first line that is not blank, runs of spaces made one; markup stays text', hr.chip.lines[1] === '📝 Ask at the door' && hr.chip.markup[1] === '📝 <b>No bags</b> after 11', JSON.stringify([hr.chip.lines, hr.chip.markup]));
  ok('fine answers and a note: amber too, with the start of the note (a written rule is a rule)', same(hr.chip.fineNote, ['some', '📝 Coats in the cloakroom', 'House rules: Note: Coats in the cloakroom']), JSON.stringify(hr.chip.fineNote));
  ok('a restricted answer and a note: the note counts as one more', same(hr.chip.badNote, ['some', '📷 Pro cameras ✗ · 1 more', 'House rules: Pro cameras not allowed, and 1 more']) && hr.chip.badTwoNote[1] === '📷 Pro cameras ✗ · 3 more', JSON.stringify([hr.chip.badNote, hr.chip.badTwoNote]));
  // A colour set by hand is the person's own judgement: it is said in words (the chip's spoken words and the full rules), never by colour alone. The words shown on the chip stay the rule's.
  ok('a tone set by hand on a venue with nothing else: Relaxed, Some rules, Strict in their own words, and said to be set by hand', same(hr.chip.tonesEmpty, [['ok', 'No restrictions', 'House rules, set to relaxed: No restrictions'], ['some', 'Some rules', 'House rules, set to some rules'], ['strict', 'Strict', 'House rules, set to strict'], null]), JSON.stringify(hr.chip.tonesEmpty));
  ok('…on a restricted venue it changes the colour and the words shown stay the rule’s', same(hr.chip.tonesBad.map(c => c[0]), ['ok', 'some', 'strict', 'some']) && hr.chip.tonesBad.every(c => c[1] === '📷 Pro cameras ✗'), JSON.stringify(hr.chip.tonesBad));
  ok('…while the spoken words say how strict it was set, and an automatic colour’s say nothing more', same(hr.chip.tonesBad.map(c => c[2]), ['House rules, set to relaxed: Pro cameras not allowed', 'House rules, set to some rules: Pro cameras not allowed', 'House rules, set to strict: Pro cameras not allowed', 'House rules: Pro cameras not allowed']), JSON.stringify(hr.chip.tonesBad.map(c => c[2])));
  ok('…and beside a note the words stay the note’s', hr.chip.tonesNote.every(c => c[1] === '📝 Ask at the door') && same(hr.chip.tonesNote.map(c => c[0]), ['ok', 'some', 'strict', 'some']) && hr.chip.tonesFineNote.every(c => c[1] === '📝 Ask at the door') && same(hr.chip.tonesFineNote.map(c => c[0]), ['ok', 'some', 'strict', 'some']) && same(hr.chip.tonesNote.map(c => c[2]), ['House rules, set to relaxed: Note: Ask at the door', 'House rules, set to some rules: Note: Ask at the door', 'House rules, set to strict: Note: Ask at the door', 'House rules: Note: Ask at the door']), JSON.stringify([hr.chip.tonesNote, hr.chip.tonesFineNote]));
  ok('the full rules of The Lantern Rooms: not allowed, allowed, good to know', same(hr.list[0], { no: ['Pro cameras', 'Flash'], restricted: [], yes: ['Point-and-shoots', 'Phones'], know: ['Earplugs advised'], note: '', tone: '' }), JSON.stringify(hr.list[0]));
  ok('…facts and pick-lists in their own words, in list order, a pick always with its rule’s name; the facts and picks the chip counts as restrictions in a list of their own; and the whole note',
    same(hr.list[1], { no: ['Re-entry'], restricted: ['Age limit: 18+', 'Strobe lighting'], yes: [], know: ['No ID needed', 'Seated or standing: Seated and standing'], note: 'Two lines\nhere', tone: '' }) && same(hr.list[2], { no: [], restricted: [], yes: [], know: [], note: '', tone: '' }), JSON.stringify(hr.list[1]));
  ok('…so the full rules name each restriction the chip counts: the main rule and every one in “· N more”', hr.counted.every(c => c.named), JSON.stringify(hr.counted));
  ok('…and a colour set by hand in words: Relaxed, Some rules or Strict, set by hand; nothing for an automatic one', same(hr.list.slice(3).map(l => l.tone), ['Relaxed, set by hand', 'Some rules, set by hand', 'Strict, set by hand', '']), JSON.stringify(hr.list.slice(3)));
  // Loading the sample again: rules come to a sample venue that never had the fields, not to one cleared by hand.
  const again = await store(page, s => {
    s.update(d => { const l = d.venues.find(v => v.id === 's-lantern'); l.rules = {}; l.rulesNote = ''; l.rulesTone = ''; const hb = d.venues.find(v => v.id === 's-harbour'); delete hb.rules; hb.updatedAt = 5; });
    s.upsert('venues', { id: 'g-own', kind: 'venue', name: 'My own room' });
    s.loadSample();
    const l = s.byId('venues', 's-lantern'), hb = s.byId('venues', 's-harbour'), own = s.byId('venues', 'g-own');
    return { cleared: JSON.stringify(l.rules), back: JSON.stringify(hb.rules), stamped: hb.updatedAt > 5, name: hb.name, own: 'rules' in own };
  });
  ok('the sample loaded again gives its rules to a sample venue that never had any, and stamps it', again.back === JSON.stringify({ proCameras: 'yes', compacts: 'yes', phones: 'yes', age: 'all', reentry: 'yes' }) && again.stamped && again.name === 'Harbour Hall', JSON.stringify(again));
  ok('…and leaves alone a venue whose rules were cleared by hand, and the person’s own venues', again.cleared === '{}' && again.own === false);
  // Remove the sample… counts a record as changed by the person when it changed more than 2 s after it was loaded. The
  // rules are the sample's own change: loading it again keeps the gap as it was, none or a minute.
  const gaps = await store(page, s => {
    const load = (created, updated) => { s.update(d => { const hb = d.venues.find(v => v.id === 's-harbour'); delete hb.rules; hb.createdAt = created; hb.updatedAt = updated; }); s.loadSample(); const hb = s.byId('venues', 's-harbour'); return [hb.updatedAt > updated, hb.updatedAt - hb.createdAt]; };
    return [load(1000, 1000), load(1000, 61000)];
  });
  ok('…so it counts as changed by the person only when they had changed it', same(gaps, [[true, 0], [true, 60000]]), JSON.stringify(gaps));
  const amber = await page.evaluate(() => { const r = document.documentElement, was = { ...r.dataset }, read = () => getComputedStyle(r).getPropertyValue('--amber').trim(); const out = []; r.dataset.scheme = 'dark'; out.push(read()); r.dataset.scheme = 'light'; out.push(read()); r.dataset.palette = 'mono'; out.push(read()); r.dataset.scheme = 'dark'; out.push(read()); r.dataset.scheme = was.scheme; r.dataset.palette = was.palette; return out; });
  ok('the amber token is set for dark and for light, in every theme', same(amber, ['#e0a43a', '#9a6200', '#9a6200', '#e0a43a']), amber.join(' '));

  /* ---------------- the question at open: off for the specs, and never a sheet from the groundwork ---------------- */
  await store(page, s => { for (const id of ['w-1', 'w-2', 'w-14', 'w-15', 'w-tonight', 'w-multi', 'w-canc', 'w-noact', 'w-gone', 'w-scored', 'w-no', 'w-hold', 'w-sess', 'w-o1', 'w-o2']) s.remove('bookings', id); });
  const past = [-2, -3, -5].map(dayIso); // two days back at least: over at any hour of today
  await store(page, (s, past) => { past.forEach((date, i) => s.upsert('bookings', { id: 'g-past' + i, kind: 'show', status: 'confirmed', actId: 's-owls', date, venueId: 's-harbour' })); }, past);
  await sleep(200);
  await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(2600);
  const atOpen = await page.evaluate(() => import('./js/model.js').then(m => ({ waiting: m.waitingShows(new Date(), { holds: true }).map(b => b.id), sheets: document.querySelectorAll('.sheet, .tour-card').length, page: window.logiPage(), inert: document.getElementById('app').inert, fetched: performance.getEntriesByType('resource').some(e => /acts-ask\.js/.test(e.name)) })));
  ok('three shows that are over are waiting when Gdex opens', ['g-past0', 'g-past1', 'g-past2'].every(id => atOpen.waiting.includes(id)), atOpen.waiting.join(','));
  ok('…with the question turned off, no sheet opens over the calendar', atOpen.sheets === 0 && atOpen.page === 'bookings' && atOpen.inert === false && atOpen.fetched === true, JSON.stringify(atOpen));

  /* ---------------- Settings: the seam for the question, and the walkthrough's words ---------------- */
  await go(page, 'settings');
  const tut = await page.evaluate(() => import('./js/pages/settings.js').then(m => Object.fromEntries(m.settings.tutorial().map(s => [s.title, s.text]))));
  ok('Settings → Your role says the question is turned on or off there; Display names the three menus', / The “Did you see them\?” question is turned on or off here too\.$/.test(tut['Your role']) && /^The section menu \(record player, tape deck or digital player\), colour theme/.test(tut['Display & accessibility']), `${tut['Your role']} | ${tut['Display & accessibility']}`);
  ok('…and Settings still has its nine sections', (await page.locator('#page details.se-sec').count()) === 9 && (await page.locator('#se-role .rp-panel').count()) === 1);

  ok('no errors in the console (the sample)', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ================= who is asked; the device's preferences; the menu's words ================= */
  {
    const { browser, page, errors } = await open();
    const asked = await page.evaluate(() => import('./js/roles.js').then(r => {
      const KEY = 'gdex-ask-seen', out = {};
      for (const id of ['all', 'producer', 'manager', 'band', 'solo', 'scout', 'audiophile']) {
        r.setRole(id);
        const row = [];
        localStorage.removeItem(KEY); row.push(r.askSeen(), r.askSetting());
        localStorage.setItem(KEY, 'on'); row.push(r.askSeen(), r.askSetting());
        localStorage.setItem(KEY, 'off'); row.push(r.askSeen(), r.askSetting());
        localStorage.setItem(KEY, 'maybe'); row.push(r.askSeen(), r.askSetting());
        row.push(r.askDefault(), r.askDefault(r.roleOf(id)));
        out[id] = row;
      }
      r.setAskSetting('on'); out.setOn = localStorage.getItem(KEY);
      r.setAskSetting('off'); out.setOff = localStorage.getItem(KEY);
      r.setAskSetting(''); out.setNone = localStorage.getItem(KEY);
      r.setAskSetting('on'); r.setAskSetting('nonsense'); out.setJunk = localStorage.getItem(KEY);
      return out;
    }));
    const yes = [true, '', true, 'on', false, 'off', true, '', true, true], no = [false, '', true, 'on', false, 'off', false, '', false, false];
    ok('who is asked “Did you see them?”: everyone but a band and a solo artist; on and off win; junk follows the role', ['all', 'producer', 'manager', 'scout', 'audiophile'].every(id => same(asked[id], yes)) && ['band', 'solo'].every(id => same(asked[id], no)), JSON.stringify(asked));
    ok('the setting is saved as on or off, and removed for “follow my role”', asked.setOn === 'on' && asked.setOff === 'off' && asked.setNone === null && asked.setJunk === null, JSON.stringify([asked.setOn, asked.setOff, asked.setNone, asked.setJunk]));

    const cal = await page.evaluate(() => import('./js/bookings-kit.js').then(k => {
      const KEY = 'gdex-cal-view', out = { modes: k.CAL_MODES };
      localStorage.removeItem(KEY); out.unset = k.calMode();
      localStorage.setItem(KEY, 'week'); out.week = k.calMode();
      localStorage.setItem(KEY, 'fortnight'); out.junk = k.calMode();
      k.saveCalMode('two'); out.saved = localStorage.getItem(KEY); out.two = k.calMode();
      k.saveCalMode('year'); out.kept = localStorage.getItem(KEY);
      return out;
    }));
    ok('the calendar’s view: Month when none is saved or it is not one of the five; saved only as one of the five', same(cal.modes, ['month', 'two', 'week', 'three', 'day']) && cal.unset === 'month' && cal.week === 'week' && cal.junk === 'month' && cal.saved === 'two' && cal.two === 'two' && cal.kept === 'two', JSON.stringify(cal));

    // the section menu in its own words, for each of the three menus
    const words = {};
    for (const menu of ['record', 'tape', 'digital']) {
      await page.evaluate(m => { localStorage.removeItem('gdex-role'); localStorage.setItem('gdex-prefs', JSON.stringify({ menu: m })); }, menu);
      await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(200);
      words[menu] = await page.evaluate(() => Promise.all([import('./js/a11y.js'), import('./js/tour.js'), import('./js/roles.js')]).then(([a, t, r]) => {
        const tracks = () => t.welcomeSteps().find(s => s.title === 'Your sections are tracks').text, last = () => { const s = t.welcomeSteps(); return s[s.length - 1].text; };
        const out = { style: a.menuStyle(), words: a.menuWords(), all: tracks() };
        r.setRole('scout'); out.scout = tracks(); out.settings = last();
        return out;
      }));
    }
    ok('record player: the sleeve, tap the record', same(words.record.words, { list: 'the sleeve', tap: 'tap the record', Tap: 'Tap the record' }) && words.record.style === 'record');
    ok('tape deck: the track list, tap Tracks', same(words.tape.words, { list: 'the track list', tap: 'tap Tracks', Tap: 'Tap Tracks' }) && words.tape.style === 'tape');
    ok('digital player: the track list, tap ☰; the choice is kept as stored', same(words.digital.words, { list: 'the track list', tap: 'tap ☰', Tap: 'Tap ☰' }) && words.digital.style === 'digital');
    ok('the tour, record player: two sides, the sleeve, and the other two menus named', words.record.all === '11 tracks: 6 on Side A, 5 on Side B. Swipe the record or tap ⏮ ⏭ to change section; tap the record to see them all on the sleeve. Prefer a tape deck or a digital player? Aa → Section menu.' && / Tap the record to open any of them\./.test(words.record.settings), words.record.all);
    ok('the tour, tape deck: Tracks and the cassette', words.tape.scout === '5 tracks: 3 on Side A, 2 on Side B; the rest are bonus tracks. Swipe the cassette or tap ⏪ ⏩ to change section; tap Tracks (or the cassette) to see them all, bonus tracks too. Prefer a record player or a digital player? Aa → Section menu.' && / Tap Tracks to open any of them\./.test(words.tape.settings), words.tape.scout);
    ok('the tour, digital player: one list, the bar, the row of tracks and ☰; no sides', words.digital.all === '11 tracks. Swipe the bar or tap ⏮ ⏭ to change section; the row under it has every track one tap away, and ☰ opens the track list. Prefer a record player or a tape deck? Aa → Section menu.'
      && words.digital.scout === '5 tracks; the rest are bonus tracks. Swipe the bar or tap ⏮ ⏭ to change section; the row under it has every track one tap away, and ☰ opens the track list, bonus tracks too. Prefer a record player or a tape deck? Aa → Section menu.'
      && / Tap ☰ to open any of them\./.test(words.digital.settings) && !/Side A/.test(words.digital.all + words.digital.scout), `${words.digital.all} | ${words.digital.scout}`);
    await go(page, 'settings');
    await page.evaluate(() => { document.getElementById('se-role').open = true; }); await page.waitForSelector('#se-role .rp-about');
    const about = await page.textContent('#se-role .rp-about');
    ok('digital player: Your role speaks of the track list (tap ☰), and says Gdex always opens on the calendar', /bonus tracks on the track list \(tap ☰\)/.test(about) && /Gdex always opens on the calendar\./.test(about) && !/sleeve|tap Tracks|opens first/.test(about), about);

    // Erase this device keeps the display preferences (the theme, the calendar's view), not the role or the question.
    const kept = await page.evaluate(() => import('./js/store.js').then(s => {
      localStorage.setItem('gdex-cal-view', 'week'); localStorage.setItem('gdex-ask-seen', 'on'); localStorage.setItem('gdex-role', 'scout');
      const prefs = localStorage.getItem('gdex-prefs');
      s.eraseAll();
      return { cal: localStorage.getItem('gdex-cal-view'), prefs: localStorage.getItem('gdex-prefs') === prefs && !!prefs, ask: localStorage.getItem('gdex-ask-seen'), role: localStorage.getItem('gdex-role'), tour: localStorage.getItem('gdex-tour') };
    }));
    ok('Erase this device keeps the calendar’s view and the display settings, and clears the role and the question’s setting', kept.cal === 'week' && kept.prefs && kept.ask === null && kept.role === null && kept.tour === null, JSON.stringify(kept));
    // A browser whose storage is full still reads but cannot write. A choice made then holds for the visit all the same.
    const full = await page.evaluate(() => import('./js/roles.js').then(r => {
      localStorage.removeItem('gdex-ask-seen');
      const real = Storage.prototype.setItem, out = {};
      Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
      try {
        r.setAskSetting('off'); out.off = [r.askSetting(), r.askSeen(), localStorage.getItem('gdex-ask-seen')];
        r.setAskSetting('on'); out.on = [r.askSetting(), r.askSeen(), localStorage.getItem('gdex-ask-seen')];
      } finally { Storage.prototype.setItem = real; }
      r.setAskSetting('off'); out.kept = [r.askSetting(), localStorage.getItem('gdex-ask-seen')];
      localStorage.setItem('gdex-ask-seen', 'on'); out.read = r.askSetting(); // changed in storage since: read again, now that a write worked
      r.setAskSetting(''); out.cleared = [r.askSetting(), localStorage.getItem('gdex-ask-seen')];
      return out;
    }));
    ok('with storage full, Never ask and Always ask still hold for the visit', same(full.off, ['off', false, null]) && same(full.on, ['on', true, null]), JSON.stringify(full));
    ok('…and once a choice can be written again, storage is what is read', same(full.kept, ['off', 'off']) && full.read === 'on' && same(full.cleared, ['', null]), JSON.stringify(full));
    await page.evaluate(() => { window.__setItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; });
    await page.click('#displayBtn'); await page.locator('.sheet [data-pref="menu:tape"]').click(); await sleep(250);
    const fullMenu = await page.evaluate(() => Promise.all([import('./js/a11y.js'), import('./js/tour.js')]).then(([a, t]) => ({ style: a.menuStyle(), stored: JSON.parse(localStorage.getItem('gdex-prefs')).menu, attr: document.documentElement.dataset.menu, deck: !!document.querySelector('#deck .dk-cassette'),
      tracks: t.welcomeSteps().find(x => x.title === 'Your sections are tracks').text, last: (x => x[x.length - 1].text)(t.welcomeSteps()) })));
    await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
    await page.keyboard.press('Escape'); await sleep(200);
    ok('a menu chosen while storage is full is the menu for the visit (the tape deck; storage still holds the digital player)', fullMenu.style === 'tape' && fullMenu.stored === 'digital' && fullMenu.attr === 'tape' && fullMenu.deck, JSON.stringify(fullMenu));
    ok('…and the tour speaks of the menu in use, the cassette and Tracks, not of the one in storage', /Swipe the cassette or tap ⏪ ⏩/.test(fullMenu.tracks) && !/☰|the bar/.test(fullMenu.tracks) && !/Tap ☰/.test(fullMenu.last), `${fullMenu.tracks} | ${fullMenu.last}`);
    ok('no errors in the console (preferences and words)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ================= open({ ask: true }): the key is left alone, and with nothing waiting nothing is fetched ================= */
  {
    const { browser, page, errors } = await open({ ask: true });
    await sleep(2200);
    const st = await page.evaluate(() => ({ key: localStorage.getItem('gdex-ask-seen'), sheets: document.querySelectorAll('.sheet, .tour-card').length, fetched: performance.getEntriesByType('resource').some(e => /acts-ask\.js/.test(e.name)), page: window.logiPage() }));
    ok('open({ ask: true }) leaves the question’s setting unset', st.key === null);
    ok('with nothing waiting, nothing is asked and the question’s code is not even fetched', st.sheets === 0 && st.fetched === false && st.page === 'bookings', JSON.stringify(st));
    ok('no errors in the console (ask: true)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }
})().catch(e => { console.log('FAIL groundwork spec crashed — ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')); process.exit(1); });
