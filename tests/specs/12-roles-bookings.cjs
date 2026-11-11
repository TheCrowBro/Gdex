// The booking pages for each role: the boxes a role uses, the rest in one closed "More boxes" fold below them (money
// boxes left off for a role without money), the boxes a role opens at first, ctx.open into the fold, Score this show,
// new and duplicated shows confirmed for a role without money (no line-up copy), the kind chooser's order and words,
// the role's names on headings and form labels, the hint and button for a section that is a bonus track, the neutral
// curfew words from venueChecks, and the venue sheet's button. Everything (no role) keeps every box and no fold.
const { open, ok, sleep, go } = require('../helpers.cjs');

const setRole = async (page, id) => { await page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id); await sleep(400); };
const openB = async (page, id) => { await page.evaluate(x => import('./js/pages/bookings.js').then(m => m.openBooking(x)), id); await page.waitForSelector('.bk-page'); await sleep(350); };
const ids = (page, sel) => page.$$eval(sel, els => els.map(e => e.id.slice(4)));
const rec = (page, list, id) => page.evaluate(([l, i]) => import('./js/store.js').then(s => { const r = s.byId(l, i); return r ? JSON.parse(JSON.stringify(r)) : null; }), [list, id]);
const add = (page, r) => page.evaluate(x => import('./js/store.js').then(s => s.upsert('bookings', x).id), r);
const dayIso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const sheetNamed = (page, t) => page.locator(`.sheet[aria-label="${t}"]`);
const steps = page => page.evaluate(() => import('./js/pages/bookings.js').then(m => m.bookings.tutorial().map(s => s.title)));
// What a role should show for a kind, worked out from its data in js/roles.js (not from the helpers under test).
const expected = (page, kind) => page.evaluate(k => Promise.all([import('./js/roles.js'), import('./js/blocks/index.js')]).then(([r, b]) => {
  const rl = r.role(), money = rl.money !== false, hide = rl.hide || [];
  const all = b.BLOCKS.filter(x => (x.kinds || []).includes(k)), left = x => !money && r.MONEY_BLOCKS.includes(x.id);
  const folded = all.filter(x => hide.includes(x.id) && !left(x));
  const open = (((rl.pages || {}).bookings || {}).open || {})[k] || [];
  return { money, all: all.map(x => x.id), shown: all.filter(x => !hide.includes(x.id) && !left(x)).map(x => x.id), folded: folded.map(x => x.id), titles: folded.map(x => x.title), open };
}), kind);
const closedLine = t => (t.length <= 3 ? (t.length < 2 ? t.join('') : `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`) : `${t.slice(0, 2).join(', ')} and ${t.length - 2} more`);

(async () => {
  const { browser, page, errors } = await open({ sample: true });
  await page.waitForSelector('.bk-monthview');

  /* ---------------- each role's boxes, the fold, money, and the boxes open at first ---------------- */
  for (const id of ['all', 'producer', 'manager', 'band', 'solo', 'scout', 'audiophile']) {
    await setRole(page, id);
    await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(500); // a new visit: nothing opened yet
    for (const [bid, kind] of [['s-show1', 'show'], ['s-sess1', 'session'], ['s-reh', 'rehearsal']]) {
      await openB(page, bid);
      const E = await expected(page, kind);
      const shown = await ids(page, '.bk-blocks [id^="blk-"]');
      ok(`${id}, ${kind}: the boxes the role uses, in order`, JSON.stringify(shown) === JSON.stringify(E.shown), shown.join(','));
      if (id === 'all') ok(`${id}, ${kind}: every box, and no fold, nor a walkthrough step for one`, JSON.stringify(shown) === JSON.stringify(E.all) && (await page.locator('#bk-more').count()) === 0 && !(await steps(page)).includes('More boxes'));
      if (E.folded.length) {
        const inFold = await ids(page, '#bk-more > .bk-more-blocks > [id^="blk-"]');
        const sum = [await page.locator('#bk-more > summary .blk-title').innerText(), await page.locator('#bk-more > summary .blk-sum').innerText()];
        ok(`${id}, ${kind}: the rest are in one closed fold below the boxes, outside them`, (await page.locator('details#bk-more:not([open])').count()) === 1 && (await page.locator('.bk-blocks #bk-more, .bk-blocks .bk-more').count()) === 0
          && await page.evaluate(() => document.querySelector('.bk-blocks').nextElementSibling === document.getElementById('bk-more')));
        ok(`${id}, ${kind}: the fold says More boxes (${E.folded.length}), with a few of their titles`, sum[0] === `More boxes (${E.folded.length})` && sum[1] === closedLine(E.titles), sum.join(' | '));
        ok(`${id}, ${kind}: inside it, the folded boxes as boxes, in order, closed and not filled yet`, JSON.stringify(inFold) === JSON.stringify(E.folded)
          && (await page.locator('#bk-more details.blk[open]').count()) === 0 && (await page.$$eval('#bk-more .blk-body', els => els.every(e => !e.children.length))), inFold.join(','));
      } else ok(`${id}, ${kind}: nothing to fold, so no fold`, (await page.locator('#bk-more').count()) === 0);
      if (!E.money) ok(`${id}, ${kind}: no money box anywhere on the page`, (await page.locator('#blk-deal, #blk-settlement, #blk-money, #blk-budget').count()) === 0);
      const opened = await ids(page, 'details.blk[open]');
      ok(`${id}, ${kind}: the boxes open at first are the role’s (${E.open.join(', ') || 'none'})`, same(opened, E.open.filter(x => E.shown.includes(x))), opened.join(','));
    }
  }
  // the closed line's words
  await setRole(page, 'producer');
  await openB(page, 's-show1');
  ok('producer: a show’s fold reads “Guest list and Settlement”', (await page.locator('#bk-more > summary .blk-sum').innerText()) === 'Guest list and Settlement');
  await setRole(page, 'manager');
  await openB(page, 's-sess1');
  ok('manager: a session’s fold reads “Session clock and Take log”', (await page.locator('#bk-more > summary .blk-sum').innerText()) === 'Session clock and Take log');
  await setRole(page, 'scout');
  await openB(page, 's-show1');
  ok('scout: a show’s fold reads “Advance checklist, Running order and 4 more”', (await page.locator('#bk-more > summary .blk-sum').innerText()) === 'Advance checklist, Running order and 4 more');
  ok('the booking’s walkthrough has a step for the fold', (await steps(page)).includes('More boxes'));

  /* ---------------- the fold opens, stays open, and its boxes work ---------------- */
  await page.click('#bk-more > summary'); await sleep(250);
  ok('tapping the fold opens it', (await page.locator('details#bk-more[open]').count()) === 1);
  await page.click('#blk-lineup > summary'); await sleep(300);
  ok('a box in the fold opens and fills like any other', (await page.locator('#blk-lineup[open] .blk-body > *').count()) > 0);
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 's-show1', { notes: 'Sample show. Front row.' }))); await sleep(400);
  ok('the fold and the box in it stay open through a redraw', (await page.locator('details#bk-more[open] #blk-lineup[open]').count()) === 1);
  await page.click('#blk-lineup > summary'); await page.click('#bk-more > summary'); await sleep(250);
  ok('…and close again', (await page.locator('details#bk-more[open]').count()) === 0);

  /* the person's own open and close win over the role's first open */
  await setRole(page, 'manager');
  await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(500);
  await openB(page, 's-show1');
  ok('manager: a show opens with Deal & fee and the advance checklist open', same(await ids(page, 'details.blk[open]'), ['deal', 'advance']));
  await page.click('#blk-deal > summary'); await sleep(250);
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 's-show1', { notes: 'Sample show.' }))); await sleep(400);
  await go(page, 'acts'); await openB(page, 's-show1');
  ok('a box the person closed stays closed, through a redraw and when the booking is opened again', same(await ids(page, 'details.blk[open]'), ['advance']));

  /* ---------------- ctx.open into the fold: Settle the night ---------------- */
  await setRole(page, 'producer');
  await openB(page, 's-past');
  ok('producer: a past show’s settlement is under More boxes', (await page.locator('#bk-more #blk-settlement').count()) === 1 && (await page.locator('details#bk-more[open]').count()) === 0);
  await page.click('#blk-deal > summary'); await sleep(300);
  await page.click('#sh-deal-settle'); await sleep(500);
  ok('Settle the night opens the fold and the settlement in it', (await page.locator('details#bk-more[open] details#blk-settlement[open]').count()) === 1);
  ok('…and the focus is on Tickets sold', await page.evaluate(() => document.activeElement && document.activeElement.id === 'sh-st-tickets'));
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 's-past', { notes: 'Good night.' }))); await sleep(400);
  ok('the fold remembers it is open', (await page.locator('details#bk-more[open] details#blk-settlement[open]').count()) === 1);
  await page.click('#bk-more > summary'); await sleep(200);

  /* ---------------- Score this show ---------------- */
  await setRole(page, 'band');
  await openB(page, 's-past');
  ok('band: no Score this show (the role does not score)', (await page.locator('.bk-score').count()) === 0 && !(await steps(page)).includes('Score this show'));
  await setRole(page, 'all');
  ok('Everything: no Score this show', (await page.locator('.bk-score').count()) === 0);
  await setRole(page, 'scout');
  ok('scout: a past show already in the act’s log shows its score', /Scored 86\/100/.test(await page.locator('.bk-hero .bk-score').innerText()) && (await page.locator('#bk-score').count()) === 0, (await page.locator('.bk-hero .bk-score').innerText()).replace(/\n/g, ' '));
  await page.click('#bk-score-edit');
  await sheetNamed(page, 'Edit a time seen').waitFor();
  ok('…and its button opens that time seen', (await page.inputValue('.sheet [data-key=rating]')) === '86');
  await page.keyboard.press('Escape'); await sleep(200);

  const today = dayIso(0), past = dayIso(-5), ahead = dayIso(4);
  const tonight = await add(page, { kind: 'show', status: 'confirmed', actId: 's-sablea', date: today, venueId: 's-harbour', doors: '19:00', setTime: '21:00', setLength: 40 });
  await openB(page, tonight);
  ok('scout: tonight’s show offers Score Sable', (await page.locator('#bk-score').textContent()).trim() === '★ Score Sable', await page.locator('#bk-score').textContent());
  ok('…with a walkthrough step', (await steps(page)).includes('Score this show'));
  await page.click('#bk-score');
  const logForm = sheetNamed(page, 'Log a time seen');
  await logForm.waitFor();
  ok('it opens Log a time seen with the date and the venue filled in', (await logForm.locator('[data-key=date]').inputValue()) === today && (await logForm.locator('select[data-key=venueId]').inputValue()) === 's-harbour');
  await logForm.locator('[data-key=rating]').fill('77');
  await logForm.locator('button[type=submit]').click(); await sleep(500);
  const sable = await rec(page, 'acts', 's-sablea');
  ok('saving logs it on the act with the booking', sable.seen.some(s => s.bookingId === tonight && s.rating === 77 && s.date === today && s.venueId === 's-harbour'), JSON.stringify(sable.seen));
  ok('…and the show now shows the score instead of the button', /Scored 77\/100/.test(await page.locator('.bk-score').innerText()) && (await page.locator('#bk-score').count()) === 0);

  const typed = await add(page, { kind: 'show', status: 'hold', actId: 's-owls', date: past, venueName: 'The Moth Club', setTime: '21:00' });
  await openB(page, typed);
  ok('a past show (even one on hold) offers Score The Night Owls', (await page.locator('#bk-score').count()) === 1 && /Score The Night Owls/.test(await page.locator('#bk-score').innerText()));
  await page.click('#bk-score');
  await logForm.waitFor();
  ok('a typed venue fills the place box', (await logForm.locator('select[data-key=venueId]').inputValue()) === '' && (await logForm.locator('[data-key=where]').inputValue()) === 'The Moth Club' && (await logForm.locator('[data-key=date]').inputValue()) === past);
  await page.keyboard.press('Escape'); await sleep(200);

  const later = await add(page, { kind: 'show', status: 'confirmed', actId: 's-owls', date: ahead, venueId: 's-lantern' });
  await openB(page, later);
  ok('a show still to come has no Score button', (await page.locator('.bk-score').count()) === 0);
  const off = await add(page, { kind: 'show', status: 'cancelled', actId: 's-owls', date: dayIso(-2), venueId: 's-lantern' });
  await openB(page, off);
  ok('nor has a cancelled show', (await page.locator('.bk-score').count()) === 0);
  const noAct = await add(page, { kind: 'show', status: 'confirmed', date: dayIso(-2), venueName: 'Somewhere' });
  await openB(page, noAct);
  ok('nor a show with no act', (await page.locator('.bk-score').count()) === 0);
  await page.evaluate(id => import('./js/store.js').then(s => s.remove('bookings', id)), noAct); await sleep(200);

  // a same-day entry logged from the act's card counts
  const sameDay = await add(page, { kind: 'show', status: 'confirmed', actId: 's-sablea', date: dayIso(-2), venueId: 's-lantern' });
  await openB(page, sameDay);
  ok('a past show of Sable’s offers its button', (await page.locator('#bk-score').count()) === 1);
  await go(page, 'acts');
  if (!(await page.locator('#ac-pnl-s-sablea').count())) { await page.click('#ac-head-s-sablea'); await sleep(400); } // scoring above left the card open
  await page.waitForSelector('#ac-log-s-sablea');
  await page.click('#ac-log-s-sablea');
  await logForm.waitFor();
  await logForm.locator('[data-key=date]').fill(dayIso(-2));
  await logForm.locator('[data-key=rating]').fill('64');
  await logForm.locator('button[type=submit]').click(); await sleep(400);
  await openB(page, sameDay);
  ok('a time seen logged from the act’s card on that day counts: the show shows its score', /Scored 64\/100/.test(await page.locator('.bk-score').innerText()) && (await page.locator('#bk-score').count()) === 0);

  /* ---------------- new and duplicated shows for a role without money ---------------- */
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({})));
  await sheetNamed(page, 'What are you booking?').waitFor(); await sleep(150);
  const R = await page.evaluate(() => import('./js/roles.js').then(m => JSON.parse(JSON.stringify(m.ROLES))));
  const scout = R.find(r => r.id === 'scout');
  const kinds = await page.$$eval('.bk-kinds .bk-kind', b => b.map(x => x.dataset.kind));
  ok('scout: the chooser lists the kinds in the role’s order', JSON.stringify(kinds) === JSON.stringify(scout.kinds), kinds.join(','));
  ok('…with the role’s words for each', (await page.$$eval('.bk-kinds .bk-kind .muted', s => s.map(x => x.textContent))).every((t, i) => t === scout.kindHelp[kinds[i]]));
  ok('…and the focus on the first', await page.evaluate(() => document.activeElement && document.activeElement.dataset.kind === 'show'));
  await page.click('.bk-kind[data-kind="show"]');
  const form = sheetNamed(page, 'New show');
  await form.waitFor();
  ok('a scout’s new show starts confirmed', (await form.locator('select[data-key=status]').inputValue()) === 'confirmed');
  ok('…its act box is labelled Act, with “Not in my acts”', (await form.locator('label[for$="-actId"]').innerText()).trim() === 'Act' && (await form.locator('select[id$="-actId"] option').first().innerText()) === 'Not in my acts');
  ok('…and no hint that the members join the line-up', !/line-up/.test(await form.locator('select[id$="-actId"]').locator('xpath=..').innerText()));
  await form.locator('select[id$="-actId"]').selectOption('s-owls');
  await form.locator('[data-key=date]').fill(dayIso(9));
  await form.locator('select[id$="-venueId"]').selectOption('s-harbour');
  await form.locator('button[type=submit]').click();
  await page.waitForSelector('.bk-page .bk-hero'); await sleep(300);
  const made = await page.evaluate(d => import('./js/store.js').then(s => JSON.parse(JSON.stringify(s.db.bookings.find(b => b.date === d && b.venueId === 's-harbour' && b.actId === 's-owls')))), dayIso(9));
  ok('it is stored confirmed', made && made.status === 'confirmed', made && made.status);
  ok('…without the act’s members on its line-up', made && (made.people || []).length === 0, JSON.stringify(made && made.people));
  ok('…and opens with Notes open', same(await ids(page, 'details.blk[open]'), ['notes']));
  await page.locator('.bk-actions button', { hasText: 'Duplicate' }).click();
  await sheetNamed(page, 'Duplicate booking').waitFor();
  const dupText = await sheetNamed(page, 'Duplicate booking').innerText();
  ok('Duplicate says the copy starts confirmed, not on hold', /starts confirmed/.test(dupText) && !/on hold|deal|settlement|invoice/.test(dupText), dupText.replace(/\n/g, ' / '));
  await page.fill('#bk-dup-date', dayIso(16));
  await page.locator('.sheet button[type="submit"]').click();
  await page.waitForSelector('.bk-page .bk-hero'); await sleep(400);
  const copy = await page.evaluate(d => import('./js/store.js').then(s => JSON.parse(JSON.stringify(s.db.bookings.find(b => b.date === d && b.actId === 's-owls') || null))), dayIso(16));
  ok('the copy is confirmed too', copy && copy.status === 'confirmed', copy && copy.status);
  for (const k of ['session', 'rehearsal', 'other']) {
    await page.evaluate(x => import('./js/pages/bookings.js').then(m => m.newBooking({ kind: x })), k); await sleep(250);
    ok(`a scout’s new ${k} starts confirmed`, (await page.locator('.sheet select[data-key=status]').last().inputValue()) === 'confirmed');
    await page.keyboard.press('Escape'); await sleep(150);
  }
  await setRole(page, 'band');
  ok('a role with money still copies on hold', await page.evaluate(() => Promise.all([import('./js/pages/bookings.js'), import('./js/store.js')]).then(([m, s]) => m.copyOf(s.byId('bookings', 's-show1'), '2030-01-01').status === 'hold')));
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({ kind: 'show' }))); await sleep(250);
  ok('…and its new show starts on hold, with the line-up hint', (await page.locator('.sheet select[data-key=status]').last().inputValue()) === 'hold' && /members are added to the line-up/.test(await page.locator('.sheet').last().innerText()));
  await page.keyboard.press('Escape'); await sleep(150);

  /* ---------------- the kind chooser and the form's words for each role ---------------- */
  const words = { all: ['Act', 'acts'], producer: ['Artist', 'artists'], manager: ['Act', 'acts'], band: ['Band', 'bands'], solo: ['Act', 'acts'], scout: ['Act', 'acts'], audiophile: ['Band', 'bands'] };
  const DEF = { show: 'A gig: load-in, set times, the deal, guest list and settlement.', session: 'Studio time: the rate, the songs, takes and what to deliver.', rehearsal: 'Band practice: the room, the times and the setlist.', other: 'Anything else in the diary: a radio slot, a shoot, a meeting.' };
  for (const r of [...R, { id: 'all', kinds: ['show', 'session', 'rehearsal', 'other'], kindHelp: {} }]) {
    await setRole(page, r.id);
    await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({})));
    await sheetNamed(page, 'What are you booking?').waitFor(); await sleep(120);
    const order = await page.$$eval('.bk-kinds .bk-kind', b => b.map(x => x.dataset.kind));
    const help = await page.$$eval('.bk-kinds .bk-kind .muted', s => s.map(x => x.textContent));
    ok(`${r.id}: the kinds in its order, with its words or the usual ones`, JSON.stringify(order) === JSON.stringify(r.kinds) && help.every((t, i) => t === ((r.kindHelp || {})[order[i]] || DEF[order[i]])), order.join(','));
    await page.click('.bk-kind[data-kind="show"]');
    await sheetNamed(page, 'New show').waitFor();
    const label = (await page.locator('.sheet label[for$="-actId"]').innerText()).trim(), none = await page.locator('.sheet select[id$="-actId"] option').first().innerText();
    ok(`${r.id}: the act box is labelled ${words[r.id][0]}, with “Not in my ${words[r.id][1]}”`, label === words[r.id][0] && none === `Not in my ${words[r.id][1]}`, `${label} / ${none}`);
    ok(`${r.id}: the field key is still actId`, (await page.locator('.sheet select[data-key=actId]').count()) === 1);
    await page.keyboard.press('Escape'); await sleep(150);
  }

  /* ---------------- headings ---------------- */
  for (const [r, name] of [['scout', 'Shows'], ['audiophile', 'Gigs'], ['producer', 'Bookings'], ['all', 'Bookings']]) {
    await setRole(page, r);
    await go(page, 'acts'); await go(page, 'bookings');
    await page.evaluate(() => { const b = document.querySelector('.bk-page .back-btn'); if (b) b.click(); }); await sleep(200);
    await page.evaluate(() => { const b = document.querySelector('.bk-dayview .back-btn'); if (b) b.click(); }); await sleep(250);
    ok(`${r}: the month view is headed ${name}`, (await page.locator('.bk-monthview .page-head h1').innerText()) === name);
  }
  await setRole(page, 'scout');
  await page.click('[aria-label="This month"]'); await sleep(200);
  await page.locator(`.bk-day[data-date="${today}"]`).click(); await page.waitForSelector('.bk-dayview');
  ok('scout: a day’s walkthrough calls the list Shows', (await steps(page)).includes('Shows') && !(await steps(page)).includes('Bookings'));

  /* ---------------- neutral curfew words; capacity lines only with money ---------------- */
  await setRole(page, 'scout');
  const w = await page.evaluate(() => Promise.all([import('./js/pages/venues.js'), import('./js/store.js')]).then(([v, s]) => {
    const b = s.byId('bookings', 's-show1');
    return { late: v.venueWarnings({ ...b, setTime: '22:30', setLength: 45 }), before: v.venueWarnings({ kind: 'show', venueId: 's-lantern', setTime: '23:30', setLength: 30 }), cap: v.venueWarnings({ ...b, deal: { ...b.deal, capacity: 400 }, settlement: { tickets: 420 } }) };
  }));
  ok('a set past the curfew reads “The set ends at…”', w.late.includes('The set ends at 23:15, 15m after the 23:00 curfew at The Lantern Rooms.'), JSON.stringify(w.late));
  ok('a set after the curfew reads “before the set starts”', w.before.includes('The curfew at The Lantern Rooms (23:00) is before the set starts (23:30).'), JSON.stringify(w.before));
  ok('no curfew line says “your set”', ![...w.late, ...w.before].some(t => /your set/i.test(t)));
  ok('scout: no line about the deal’s or the settlement’s tickets', !w.cap.some(t => /tickets/.test(t)), JSON.stringify(w.cap));
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 's-show1', { setTime: '22:30' }))); await sleep(300);
  await openB(page, 's-show1');
  ok('the booking’s header uses the same words', /The set ends at 23:15/.test(await page.locator('.bk-hero').innerText()));
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 's-show1', { setTime: '21:15' }))); await sleep(300);
  await setRole(page, 'manager');
  const cap = await page.evaluate(() => Promise.all([import('./js/pages/venues.js'), import('./js/store.js')]).then(([v, s]) => { const b = s.byId('bookings', 's-show1'); return v.venueWarnings({ ...b, deal: { ...b.deal, capacity: 400 }, settlement: { tickets: 420 } }); }));
  ok('manager: the deal and settlement capacity lines are there', cap.some(t => /The deal counts on 400 tickets/.test(t)) && cap.some(t => /The settlement counts 420 tickets/.test(t)), JSON.stringify(cap));

  /* ---------------- the venue sheet's button ---------------- */
  for (const [r, venue, btn] of [['all', 's-lantern', '+ Book here'], ['scout', 's-lantern', '+ Add a show here'], ['audiophile', 's-echo', '+ Add a studio session here']]) {
    await setRole(page, r);
    await page.evaluate(x => import('./js/pages/venues.js').then(m => m.openVenue(x)), venue);
    await page.waitForSelector('.vn-sheet');
    ok(`${r}: the venue sheet’s button reads “${btn}”`, (await page.locator('#vn-book').innerText()) === btn);
    await page.keyboard.press('Escape'); await page.waitForSelector('.vn-sheet', { state: 'detached' });
  }

  ok('no errors in the console (sample)', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ---------------- no acts, no venues: the hints, with the role's names and the bonus track button ---------------- */
  {
    const { browser, page, errors } = await open();
    await setRole(page, 'producer');
    await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({ kind: 'show' })));
    await sheetNamed(page, 'New show').waitFor();
    let text = await page.locator('.sheet').last().innerText();
    ok('producer: the hint sends you to the Artists page', /on the Artists page to pick them here/.test(text) && /on the Venues page to pick them here/.test(text));
    ok('…with no bonus track button while both are on the menu', (await page.locator('.bk-bonus').count()) === 0 && !/bonus track/.test(text));
    await page.keyboard.press('Escape'); await sleep(150);
    // a role with Acts and Venues off its menu
    await page.evaluate(() => import('./js/roles.js').then(m => { m.ROLES.find(r => r.id === 'scout').sections = ['bookings', 'people']; m.setRole('scout'); })); await sleep(400);
    await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({ kind: 'show' })));
    await sheetNamed(page, 'New show').waitFor();
    text = await page.locator('.sheet').last().innerText();
    ok('a section off the menu: the hint says it is a bonus track on the sleeve', /Acts is a bonus track on the sleeve/.test(text) && /Venues is a bonus track on the sleeve/.test(text), text.replace(/\n/g, ' / ').slice(0, 300));
    ok('…with a button to each', (await page.locator('#bk-go-acts').innerText()) === 'Open Acts' && (await page.locator('#bk-go-venues').innerText()) === 'Open Venues');
    await page.click('#bk-go-venues'); await sleep(600);
    ok('the button closes the form and opens the section', (await page.locator('.sheet').count()) === 0 && (await page.evaluate(() => window.logiPage())) === 'venues');
    await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({ kind: 'show' })));
    await sheetNamed(page, 'New show').waitFor();
    await page.locator('.sheet [data-key=title]').fill('Showcase night'); await sleep(100);
    text = await page.locator('.sheet').last().innerText();
    ok('once something is typed, the words stay and the buttons go', (await page.locator('.bk-bonus').count()) === 0 && /Venues is a bonus track on the sleeve/.test(text));
    await page.keyboard.press('Escape'); await sleep(150);
    ok('no errors in the console (no acts or venues)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }
})().catch(e => { console.log('FAIL roles bookings spec crashed — ' + e.message); process.exit(1); });
