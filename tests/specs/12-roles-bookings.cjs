// The booking pages for each role: the boxes a role uses, the rest in one closed "More boxes" fold below them (money
// boxes left off for a role without money), the boxes a role opens at first, ctx.open into the fold, Score this show,
// new and duplicated shows confirmed for a role without money (no line-up copy), the kind chooser's order and words,
// the role's names on headings and form labels, the hint and button for a section that is a bonus track, the neutral
// curfew words from venueChecks, and the venue sheet's button. Everything (no role) keeps every box and no fold.
// A role without money: no Paid / settled to pick (and no settlement written), no money lines in the folded boxes, and
// words for someone going to shows. The score row keeps the focus, and says what to do when the show has no act yet.
// The act filter chip, the solo artist's hint, the Studio log's focus after Start a take log, and the booking page at
// 320px with extra-large text.
const { open, ok, sleep, go, toMonth } = require('../helpers.cjs');

const setRole = async (page, id) => { await page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id); await sleep(400); };
const openB = async (page, id) => { await page.evaluate(x => import('./js/pages/bookings.js').then(m => m.openBooking(x)), id); await page.waitForSelector('.bk-page'); await sleep(350); };
const ids = (page, sel) => page.$$eval(sel, els => els.map(e => e.id.slice(4)));
const rec = (page, list, id) => page.evaluate(([l, i]) => import('./js/store.js').then(s => { const r = s.byId(l, i); return r ? JSON.parse(JSON.stringify(r)) : null; }), [list, id]);
const add = (page, r) => page.evaluate(x => import('./js/store.js').then(s => s.upsert('bookings', x).id), r);
const dayIso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const sheetNamed = (page, t) => page.locator(`.sheet[aria-label="${t}"]`);
const steps = page => page.evaluate(() => import('./js/pages/bookings.js').then(m => m.bookings.tutorial().map(s => s.title)));
const stepText = (page, title) => page.evaluate(t => import('./js/pages/bookings.js').then(m => (m.bookings.tutorial().find(s => s.title === t) || {}).text || ''), title);
const sheetText = (page, title) => page.evaluate(t => import('./js/tour.js').then(m => { const s = m.sheetSteps(t); return (typeof s === 'function' ? s() : s || []).map(x => x.text).join(' '); }), title);
const focused = page => page.evaluate(() => (document.activeElement && document.activeElement !== document.body ? document.activeElement.id || document.activeElement.tagName : 'BODY'));
const MONEY = /\$|\bpaid\b|\bpay\b|\bmoney\b|\bfees?\b|\bdeal\b|settle|invoice|deposit/i;
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
  ok('Everything, with the question turned off: no Score this show', (await page.locator('.bk-score').count()) === 0);
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
  ok('…with the focus on its ✎ Edit, in the same row', (await focused(page)) === 'bk-score-edit', await focused(page));
  await page.focus('#bk-score-edit'); await page.keyboard.press('Enter');
  await sheetNamed(page, 'Edit a time seen').waitFor();
  await sheetNamed(page, 'Edit a time seen').locator('.btn.danger').click(); await sleep(500);
  ok('removing that time seen brings back ★ Score Sable, with the focus on it', (await page.locator('#bk-score').count()) === 1 && (await focused(page)) === 'bk-score', await focused(page));
  await page.keyboard.press('Enter');
  await logForm.waitFor();
  await page.keyboard.press('Escape'); await sleep(300);
  ok('closing the form without saving leaves the focus on ★ Score', (await focused(page)) === 'bk-score', await focused(page));
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 's-show1', { notes: 'Sample show, again.' }))); await sleep(400);
  ok('…and a later redraw keeps it there', (await focused(page)) === 'bk-score', await focused(page));
  await page.keyboard.press('Enter');
  await logForm.waitFor();
  await logForm.locator('[data-key=rating]').fill('77');
  await page.keyboard.press('Enter'); await sleep(500);
  ok('scored again with the keyboard: the focus is on ✎ Edit', (await focused(page)) === 'bk-score-edit' && /Scored 77\/100/.test(await page.locator('.bk-score').innerText()), await focused(page));

  const typed = await add(page, { kind: 'show', status: 'hold', actId: 's-owls', date: past, venueName: 'The Moth Club', setTime: '21:00' });
  await openB(page, typed);
  ok('a past show (even one on hold) offers Score The Night Owls', (await page.locator('#bk-score').count()) === 1 && /Score The Night Owls/.test(await page.locator('#bk-score').innerText()));
  ok('…and, being over, Didn’t go beside it, ★ Score still the first button of the row', JSON.stringify(await page.$$eval('.bk-score button[id^="bk-score"]', bs => bs.map(b => b.id))) === JSON.stringify(['bk-score', 'bk-score-no']));
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
  ok('nor a show with no act…', (await page.locator('#bk-score').count()) === 0);
  ok('…which says to pick the act you saw, with a button for it', (await page.locator('.bk-score-noact .bk-score-text').innerText()) === 'Pick the act you saw to score this show.' && /Pick the act/.test(await page.locator('#bk-score-act').textContent()), await page.locator('.bk-hero .bk-score').innerText());
  ok('…and a walkthrough step', (await steps(page)).includes('Score this show') && /Pick the act you saw/.test(await stepText(page, 'Score this show')));
  await page.focus('#bk-score-act'); await page.keyboard.press('Enter');
  await sheetNamed(page, 'Edit show').waitFor(); await sleep(150);
  ok('the button opens the show’s form with the focus on the act', await page.evaluate(() => document.activeElement && document.activeElement.matches('.sheet select[data-key=actId]')));
  await page.selectOption('.sheet select[data-key=actId]', 's-owls');
  await page.locator('.sheet button[type=submit]').click(); await sleep(500);
  ok('with the act picked, ★ Score The Night Owls is there, with the focus on it', /Score The Night Owls/.test(await page.locator('#bk-score').textContent()) && (await focused(page)) === 'bk-score', await focused(page));
  await page.evaluate(id => import('./js/store.js').then(s => s.patch('bookings', id, { actId: '' })), noAct); await sleep(300);
  await setRole(page, 'audiophile');
  ok('audiophile: the line and the button speak of the band', (await page.locator('.bk-score-noact .bk-score-text').innerText()) === 'Pick the band you saw to score this show.' && /Pick the band/.test(await page.locator('#bk-score-act').textContent()));
  await setRole(page, 'scout');
  for (const [what, b] of [['to come', { date: dayIso(3) }], ['cancelled', { date: dayIso(-2), status: 'cancelled' }]]) {
    await page.evaluate(([id, x]) => import('./js/store.js').then(s => s.patch('bookings', id, x)), [noAct, b]); await sleep(300);
    ok(`no line about the act on a show with no act that is ${what}`, (await page.locator('.bk-score').count()) === 0);
  }
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
  ok('…with no Paid / settled to pick', JSON.stringify(await form.locator('select[data-key=status] option').allTextContents()) === JSON.stringify(['Hold', 'Offer in', 'Confirmed', 'Advanced', 'Done', 'Cancelled']));
  ok('…and the act box says the act is the one that gets scored', /The act you’re going to see\. On the night or after, Score this show logs your score on their card\./.test(await form.locator('select[id$="-actId"]').locator('xpath=..').innerText()));
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
  ok('Notes speak of the person’s own notes: no day sheet, no merch float', (await page.locator('#blk-notes .bk-notes-state').innerText()) === 'Your own notes. Saved when you leave the box.'
    && !/merch|promoter|day sheet/.test(await page.getAttribute('#bk-notes-text', 'placeholder')) && !/day sheet|money/.test(await stepText(page, 'Notes')), await page.getAttribute('#bk-notes-text', 'placeholder'));
  ok('the Status step says nothing of paid or money', !/paid|money/i.test(await stepText(page, 'Status')), await stepText(page, 'Status'));
  await page.click('#bk-status');
  await sheetNamed(page, 'Booking status').waitFor();
  ok('the Booking status sheet has no Paid / settled', JSON.stringify(await page.$$eval('.bk-status-opt', b => b.map(x => x.dataset.status))) === JSON.stringify(['hold', 'offer', 'confirmed', 'advanced', 'done', 'cancelled']));
  ok('…and no money in its words or its walkthrough', !/money|paid/i.test(await sheetNamed(page, 'Booking status').innerText()) && !/money|paid/i.test(await sheetText(page, 'Booking status'))
    && (await page.locator('.bk-status-opt[data-status="cancelled"] .muted').innerText()) === 'Off. Stays in your records, out of clashes.');
  await page.keyboard.press('Escape'); await sleep(150);
  await page.click('.bk-actions .bk-delete');
  await sheetNamed(page, 'Delete this booking?').waitFor();
  ok('Delete names only what the role keeps on a booking', (await sheetNamed(page, 'Delete this booking?').locator('.stack > p.small').innerText()) === 'Its notes, checklist ticks, running order and guest list go with it. Your act, venue and people stay. This cannot be undone.');
  await page.keyboard.press('Escape'); await sleep(150);
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

  /* ---------------- a role without money: a show already settled keeps it, and nothing writes a settlement ---------------- */
  const settledShow = await add(page, { kind: 'show', status: 'settled', actId: 's-owls', date: dayIso(-4), venueId: 's-lantern', settlement: { tickets: 120, settledAt: 1700000000000 }, checks: { 'show-settled': true } });
  await openB(page, settledShow);
  await page.click('#bk-status');
  await sheetNamed(page, 'Booking status').waitFor();
  ok('scout: a show already Paid / settled keeps that choice, ticked', (await page.locator('.bk-status-opt[data-status="settled"][aria-checked="true"]').count()) === 1);
  await page.click('.bk-status-opt[data-status="done"]'); await sleep(400);
  let st = await rec(page, 'bookings', settledShow);
  ok('picking Done changes the status only: the settlement and its tick stay as they were', st.status === 'done' && st.settlement.settledAt === 1700000000000 && st.settlement.tickets === 120 && st.checks['show-settled'] === true, JSON.stringify(st));
  await page.click('#bk-status');
  await sheetNamed(page, 'Booking status').waitFor();
  ok('…and now Paid / settled is not offered', (await page.locator('.bk-status-opt[data-status="settled"]').count()) === 0);
  await page.keyboard.press('Escape'); await sleep(150);
  await page.evaluate(id => import('./js/store.js').then(s => s.patch('bookings', id, { status: 'settled' })), settledShow); await sleep(300);
  await page.click('.bk-edit');
  await sheetNamed(page, 'Edit show').waitFor();
  ok('the form keeps a settled show on Paid / settled', (await page.inputValue('.sheet select[data-key=status]')) === 'settled');
  await page.locator('.sheet button[type=submit]').click(); await sleep(400);
  st = await rec(page, 'bookings', settledShow);
  ok('…and saving leaves it settled, the settlement as it was', st.status === 'settled' && st.settlement.settledAt === 1700000000000, JSON.stringify(st));
  await page.evaluate(id => import('./js/store.js').then(s => s.remove('bookings', id)), settledShow); await sleep(200);

  /* ---------------- a role without money: the boxes under More boxes ---------------- */
  for (const r of ['scout', 'audiophile']) {
    await setRole(page, r);
    await openB(page, 's-sess0');
    if (!(await page.locator('details#bk-more[open]').count())) await page.click('#bk-more > summary');
    if (!(await page.locator('#blk-clock[open]').count())) await page.click('#blk-clock > summary');
    if (!(await page.locator('#blk-advance[open]').count())) await page.click('#blk-advance > summary');
    await sleep(300);
    ok(`${r}: the Session clock shows the hours and no fee`, !MONEY.test(await page.locator('#blk-clock .blk-body').innerText()) && (await page.locator('#blk-clock .sd-stats.two').count()) === 1, (await page.locator('#blk-clock .sd-stats').innerText()).replace(/\n/g, ' '));
    ok(`${r}: a session’s checklist has no invoice or paid lines`, (await page.locator('#blk-advance [data-line="ses-invoice"], #blk-advance [data-line="ses-paid"]').count()) === 0 && (await page.locator('#blk-advance [data-line="ses-deliver"]').count()) === 1);
    ok(`${r}: the studio email asks nothing about being paid`, !/paid/i.test(await page.locator('#blk-advance .bk-mail-text').textContent()));
    ok(`${r}: the walkthrough of those boxes has no money in it`, !/invoice|paid|settling/i.test(await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.bookings.tutorial().filter(s => /Hours|Checklist/.test(s.title)).map(s => s.text).join(' ')))));
    await page.click('.bk-actions .bk-delete');
    await sheetNamed(page, 'Delete this booking?').waitFor();
    // The clock's shifts are deleted with the session, so the sheet says so (and still no quote or invoice).
    ok(`${r}: deleting a session names its clocked hours, and no quote or invoice`, (await sheetNamed(page, 'Delete this booking?').locator('.stack > p.small').innerText()) === `Its notes, checklist ticks and clocked hours go with it. Your ${r === 'audiophile' ? 'band' : 'act'}, venue and people stay. Take logs stay in the Studio log, unlinked. This cannot be undone.`);
    await page.keyboard.press('Escape'); await sleep(150);
    await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 's-sess0', { rate: '' }))); await sleep(300);
    ok(`${r}: with no rate, nothing about an hourly rate or the amount to bill`, !/rate|bill/i.test(await page.locator('#blk-clock .blk-body').innerText()));
    await page.evaluate(() => import('./js/store.js').then(s => s.patch('bookings', 's-sess0', { rate: 45 }))); await sleep(300);
    await openB(page, 's-show1');
    if (!(await page.locator('details#bk-more[open]').count())) await page.click('#bk-more > summary');
    if (!(await page.locator('#blk-advance[open]').count())) await page.click('#blk-advance > summary');
    await sleep(300);
    const lines = await page.$$eval('#blk-advance .check-item', els => els.map(e => e.dataset.line));
    ok(`${r}: a show’s checklist leaves out the deal, deposit, settled, invoice and paid lines`, !lines.some(x => ['show-offer', 'show-deposit', 'show-settled', 'show-invoice', 'show-paid'].includes(x)) && lines.includes('show-advance'), lines.join(','));
    ok(`${r}: the advance email asks nothing about merch money or the settlement`, !/Settlement|cut\?|paid/.test(await page.locator('#blk-advance .bk-mail-text').textContent()) && !/settlement|merch/.test(await page.locator('#blk-advance .bk-email > p.muted').first().innerText()));
  }
  await setRole(page, 'all');
  await openB(page, 's-sess0');
  if (!(await page.locator('#blk-clock[open]').count())) await page.click('#blk-clock > summary');
  if (!(await page.locator('#blk-advance[open]').count())) await page.click('#blk-advance > summary');
  await sleep(300);
  ok('Everything: the Session clock still shows the fee at the hourly rate', /\$\d.*at \$45\/hour, to the ¼ hour/s.test(await page.locator('#blk-clock .sd-stats').innerText()));
  ok('Everything: the session checklist keeps Invoice sent and Paid in full, and the email asks how to be paid', (await page.locator('#blk-advance [data-line="ses-invoice"], #blk-advance [data-line="ses-paid"]').count()) === 2 && /How and when would you like to be paid\?/.test(await page.locator('#blk-advance .bk-mail-text').textContent()));
  await openB(page, 's-show1');
  if (!(await page.locator('#blk-advance[open]').count())) await page.click('#blk-advance > summary');
  if (!(await page.locator('#blk-notes[open]').count())) await page.click('#blk-notes > summary');
  await sleep(300);
  ok('Everything: the show checklist keeps all 14 lines, and the email asks about merch and the settlement', (await page.locator('#blk-advance .check-item').count()) === (await page.evaluate(() => import('./js/model.js').then(m => m.checklistFor('show').length))) && (await page.locator('#blk-advance [data-line="show-deposit"]').count()) === 1
    && /Settlement: cash or transfer/.test(await page.locator('#blk-advance .bk-mail-text').textContent()) && /merch, settlement, Wi-Fi/.test(await page.locator('#blk-advance .bk-email > p.muted').first().innerText()));
  ok('Everything: the words are as they were (Notes, Status, Delete, the sheets)', (await page.locator('#blk-notes .bk-notes-state').innerText()) === 'Saved when you leave the box. They go on the day sheet the band sees, unless you leave notes off it there.'
    && /merch float/.test(await page.getAttribute('#bk-notes-text', 'placeholder')) && /done, paid\. A cancelled booking stays in your records but leaves clashes and money\./.test(await stepText(page, 'Status'))
    && /band’s day sheet/.test(await stepText(page, 'Notes')) && /cancelled leaves clashes and money/.test(await sheetText(page, 'Booking status')) && /a show has a deal and a guest list/.test(await sheetText(page, 'What are you booking?')));
  await page.click('.bk-actions .bk-delete');
  await sheetNamed(page, 'Delete this booking?').waitFor();
  ok('Everything: Delete still lists the deal, settlement, quote and invoice', /^Its deal, running order, guest list, settlement, checklist ticks, quote and invoice go with it\./.test(await sheetNamed(page, 'Delete this booking?').locator('.stack > p.small').innerText()));
  await page.keyboard.press('Escape'); await sleep(150);
  await page.click('#bk-status');
  await sheetNamed(page, 'Booking status').waitFor();
  ok('Everything: Paid / settled is offered, and Cancelled keeps its words', (await page.locator('.bk-status-opt[data-status="settled"]').count()) === 1 && (await page.locator('.bk-status-opt[data-status="cancelled"] .muted').innerText()) === 'Off. Stays in your records, out of clashes and money.');
  await page.keyboard.press('Escape'); await sleep(150);
  for (const [r, export_] of [['scout', 'Saves your upcoming bookings as a calendar file for Apple, Google or Outlook Calendar.'], ['all', 'Saves your upcoming bookings as a calendar file for Apple, Google or Outlook Calendar, or to send to the band. No fees or deals go in it.']]) {
    await setRole(page, r);
    await toMonth(page);
    ok(`${r}: the month walkthrough’s Export calendar step`, (await stepText(page, 'Export calendar')) === export_, await stepText(page, 'Export calendar'));
  }
  await setRole(page, 'scout');
  ok('scout: the kind chooser’s walkthrough promises no deal or guest list', !/deal|guest list|rate/.test(await sheetText(page, 'What are you booking?')), await sheetText(page, 'What are you booking?'));

  /* ---------------- the act filter chip in the role's words ---------------- */
  for (const [r, chip] of [['all', 'All acts'], ['producer', 'All artists'], ['manager', 'Whole roster'], ['band', 'All bands'], ['solo', 'All acts'], ['scout', 'All acts'], ['audiophile', 'All bands']]) {
    await setRole(page, r);
    await toMonth(page);
    const first = await page.locator('.bk-filters .chips').nth(1).locator('.chip').first().innerText();
    ok(`${r}: the act filter starts “${chip}”`, first === chip, first);
  }

  /* ---------------- producer: Start a take log lands on + Take ---------------- */
  await setRole(page, 'producer');
  await openB(page, 's-sess1');
  if (!(await page.locator('#blk-takes[open]').count())) await page.click('#blk-takes > summary');
  await page.waitForSelector('#sd-start-log-s-sess1');
  await page.focus('#sd-start-log-s-sess1'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.logiPage() === 'sessions' && document.getElementById('sd-take')); await sleep(400);
  ok('producer: Start a take log opens the log with the focus on + Take, at the top', (await focused(page)) === 'sd-take' && (await page.evaluate(() => window.scrollY)) === 0, `${await focused(page)} ${await page.evaluate(() => window.scrollY)}`);
  // Opening a log from the Studio log's own list does the same once the page has redrawn.
  await page.click('#page .back-btn'); await page.waitForSelector('#page .sd-log'); await sleep(300);
  await page.focus('#page .sd-log'); await page.keyboard.press('Enter');
  await page.waitForSelector('#sd-take'); await sleep(300);
  ok('producer: a log opened from the Studio log’s list has the focus on + Take', (await focused(page)) === 'sd-take', await focused(page));
  await go(page, 'bookings');

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
    await toMonth(page);
    ok(`${r}: the month view is headed ${name}`, (await page.locator('.bk-monthview .page-head h1').innerText()) === name);
  }
  await setRole(page, 'scout');
  await page.click('[aria-label="Today, this month"]'); await sleep(200);
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
    await page.evaluate(() => import('./js/roles.js').then(m => { m.ROLES.find(r => r.id === 'scout').sections = ['bookings', 'acts', 'people', 'venues']; m.setRole('solo'); })); await sleep(400);
    await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({ kind: 'show' })));
    await sheetNamed(page, 'New show').waitFor();
    text = await page.locator('.sheet select[id$="-actId"]').locator('xpath=..').innerText();
    ok('solo: the hint says to add yourself on the My act page', /Add yourself on the My act page to pick it here\./.test(text) && !/bands and artists/.test(text), text.replace(/\n/g, ' / '));
    await page.keyboard.press('Escape'); await sleep(150);
    for (const [r, words, btn] of [['scout', 'Nothing coming up. Add a show you’re going to, or tap a date on the calendar.', '+ Add a show'], ['audiophile', 'Nothing coming up. Add a show you’re going to, or tap a date on the calendar.', '+ Add a show'], ['all', 'Nothing coming up. Add a show, a studio session or a rehearsal, or tap a date on the calendar.', '+ New booking']]) {
      await setRole(page, r);
      await go(page, 'bookings');
      ok(`${r}: an empty Coming up reads “${words}”`, (await page.locator('.bk-monthview .empty p').first().innerText()) === words && (await page.locator('.bk-monthview .empty button').innerText()) === btn, await page.locator('.bk-monthview .empty').innerText());
    }
    await setRole(page, 'scout');
    await page.click('.bk-monthview .empty button');
    await sheetNamed(page, 'New show').waitFor();
    ok('scout: + Add a show opens a new show', (await page.locator('.sheet').count()) === 1);
    await page.keyboard.press('Escape'); await sleep(150);
    ok('no errors in the console (no acts or venues)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- 320px, extra-large text: the action buttons and the status sheet ---------------- */
  for (const [text, w] of [['xlarge', 320], ['large', 320], ['normal', 320], ['normal', 420]]) {
    const { browser, page, errors } = await open({ sample: true, viewport: { width: w, height: 700 } });
    await page.evaluate(x => { localStorage.setItem('gdex-prefs', x); }, JSON.stringify(text === 'normal' ? {} : { text, targets: 'large' }));
    await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(300);
    for (const r of ['scout', 'all']) {
      await setRole(page, r);
      await openB(page, 's-show1');
      // Each button's label, line by line as drawn: every line is made of whole words.
      const labels = await page.$$eval('.bk-actions .btn', els => els.map(b => {
        const out = [], range = document.createRange(), walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        let n; while ((n = walk.nextNode())) { if (n.parentElement.getAttribute('aria-hidden') === 'true') continue; for (let i = 0; i < n.length; i++) { range.setStart(n, i); range.setEnd(n, i + 1); const rc = range.getClientRects()[0]; if (!rc) continue; const y = Math.round(rc.top), last = out[out.length - 1]; if (last && Math.abs(last.y - y) < 3) last.t += n.data[i]; else out.push({ y, t: n.data[i] }); } }
        return { label: b.textContent.replace(/[^A-Za-z ]/g, '').trim(), lines: out.map(x => x.t.trim()), over: b.scrollWidth > b.clientWidth + 1, top: Math.round(b.getBoundingClientRect().top) };
      }));
      ok(`${w}px, ${text} text, ${r}: Duplicate, Add to calendar and Delete break only between words`, labels.length === 3 && labels.every(l => l.lines.join(' ') === l.label && l.lines.every(x => l.label.split(' ').includes(x.split(' ')[0]) && l.label.includes(x)) && !l.over), JSON.stringify(labels.map(l => l.lines)));
      if (w === 420 && text === 'normal') ok(`${w}px, ${text} text, ${r}: the three sit in one row`, new Set(labels.map(l => l.top)).size === 1);
      if (text === 'xlarge') ok(`${w}px, ${text} text, ${r}: each takes a row of its own`, new Set(labels.map(l => l.top)).size === 3);
      ok(`${w}px, ${text} text, ${r}: the page does not scroll sideways`, (await page.evaluate(() => document.documentElement.scrollWidth)) <= w);
      await page.click('#bk-status');
      await sheetNamed(page, 'Booking status').waitFor(); await sleep(250);
      const opts = await page.$$eval('.bk-status-opt', els => els.map(e => { const o = e.getBoundingClientRect(), m = e.querySelector('.muted').getBoundingClientRect(), t = e.querySelector('.bk-tick'); return { s: e.dataset.status, help: Math.round(m.width), opt: Math.round(o.width), over: e.querySelector('.muted').scrollWidth > Math.ceil(m.width) + 1, tick: t ? Math.round(t.getBoundingClientRect().left) >= Math.round(m.right) - 1 : true }; }));
      ok(`${w}px, ${text} text, ${r}: the status help gets a readable width, with nothing running out of it and the ✓ beside it`, opts.every(o => o.help >= Math.min(150, o.opt * 0.4) && !o.over && o.tick), JSON.stringify(opts));
      await page.keyboard.press('Escape'); await sleep(150);
    }
    // A scout's show with no act: "Pick the act you saw…" keeps a readable width; its button goes under it when narrow.
    await setRole(page, 'scout');
    const bare = await add(page, { kind: 'show', status: 'confirmed', date: dayIso(0), venueName: 'The Crown' });
    await openB(page, bare);
    const na = await page.evaluate(() => { const r = document.querySelector('.bk-score-noact'), t = r.querySelector('.bk-score-text').getBoundingClientRect(), b = r.querySelector('#bk-score-act').getBoundingClientRect(); return { row: Math.round(r.getBoundingClientRect().width), text: Math.round(t.width), beside: b.left >= t.right - 1 && Math.abs(b.top - t.top) < t.height }; });
    ok(`${w}px, ${text} text: the no-act line gets a readable width`, na.text >= Math.min(140, na.row), JSON.stringify(na));
    if (w === 420 && text === 'normal') ok(`${w}px, ${text} text: …with its button beside it`, na.beside, JSON.stringify(na));
    await page.evaluate(id => import('./js/store.js').then(s => s.remove('bookings', id)), bare); await sleep(150);
    ok(`no errors in the console (${w}px, ${text} text)`, errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }
})().catch(e => { console.log('FAIL roles bookings spec crashed — ' + e.message); process.exit(1); });
