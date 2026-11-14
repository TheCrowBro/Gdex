// Acts as a drop-down list: each card counts the times you saw the act play, with the average and latest score out of
// 100 and its dates coming up on the calendar; opening it shows the log (date, where, score, notes), where you log
// another time (typed, or from a past show; a show marked Didn’t go is not offered), edit one, or delete one. Venues and
// bookings deleted later leave the log.
const { open, ok, sleep, go, topSheet } = require('../helpers.cjs');

// The sample's two acts are in two main genres (item 12), so its list starts in folded groups: open these, as a tap does.
const openGroups = async (page, ...ids) => { for (const g of ids) { await page.waitForSelector('#ac-grp-' + g); if ((await page.getAttribute('#ac-grp-' + g, 'aria-expanded')) !== 'true') { await page.click('#ac-grp-' + g); await page.waitForSelector(`#ac-grp-${g}[aria-expanded="true"]`); } } };
const seen = (page, id) => page.evaluate(i => import('./js/store.js').then(s => JSON.parse(JSON.stringify((s.byId('acts', i) || {}).seen || []))), id);
const dayIso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const { browser, page, errors } = await open({ sample: true, tab: 'acts' });
  await openGroups(page, 'rnb', 'rock');
  await page.waitForSelector('.ac-card');
  const owls = page.locator('.ac-card[data-id="s-owls"]'), sable = page.locator('.ac-card[data-id="s-sablea"]');
  const head = owls.locator('.ac-card-head');

  /* the closed card */
  ok('the cards start closed', (await head.getAttribute('aria-expanded')) === 'false' && (await page.locator('.ac-pnl').count()) === 0);
  const line = await owls.locator('.ac-seen-line').innerText();
  ok('the card counts the times seen, with the average and latest score', /Seen 3 times/.test(line) && /average 78\/100/.test(line) && /latest 86/.test(line), line);
  ok('seen once says once, without a latest', /Seen once · average 90\/100/.test(await sable.locator('.ac-seen-line').innerText()) && !/latest/.test(await sable.locator('.ac-seen-line').innerText()));
  const dates = await owls.locator('.ac-date').allInnerTexts();
  ok('the card lists the next three dates on the calendar', dates.length === 3 && /Rehearsal at Basement/.test(dates[0]) && /Show at The Lantern Rooms/.test(dates[1]) && /Show at Harbour Hall/.test(dates[2]), dates.join(' | '));
  ok('…and says how many more', /and 1 more/.test(await owls.locator('.ac-dates').innerText()));
  ok('a session coming up is on its act’s card', /Studio session at Echo Chamber/.test(await sable.locator('.ac-dates').innerText()));

  /* a date opens its booking */
  await owls.locator('.ac-date').nth(1).click();
  await page.waitForFunction(() => window.logiPage() === 'bookings');
  ok('tapping a date opens that booking', await page.evaluate(() => /Lantern Rooms/.test(document.querySelector('#page').innerText)));
  await page.evaluate(() => window.logiGo('acts'));
  await page.waitForSelector('.ac-card[data-id="s-owls"]');

  /* open the card */
  await head.click();
  await page.waitForSelector('#ac-pnl-s-owls');
  ok('tapping the card drops it open', (await head.getAttribute('aria-expanded')) === 'true' && (await head.getAttribute('aria-controls')) === 'ac-pnl-s-owls');
  ok('the head keeps the focus after the redraw', await page.evaluate(() => document.activeElement && document.activeElement.id === 'ac-head-s-owls'));
  const rows = await owls.locator('.ac-seen').allInnerTexts();
  ok('the log lists each time seen, newest first', rows.length === 3 && /The Lantern Rooms/.test(rows[0]) && /86/.test(rows[0]) && /The Crown, Bristol/.test(rows[1]) && /Harbour Hall/.test(rows[2]), rows.join(' | '));
  ok('each score has a bar as wide as the score', (await owls.locator('.ac-seen').first().locator('.ac-score-bar i').getAttribute('style')).includes('width:86%'));
  ok('the score reads as a number out of 100', (await owls.locator('.ac-score').first().getAttribute('aria-label')) === '86 out of 100');
  ok('notes show under the score', /Tightest they have sounded/.test(rows[0]), rows[0]);
  ok('the other card stays closed', (await sable.locator('.ac-card-head').getAttribute('aria-expanded')) === 'false');
  ok('no past show is offered when every one is logged', (await page.locator('#ac-past-s-owls').count()) === 0);

  /* log a time seen: a venue of yours, a score from the slider */
  await page.click('#ac-log-s-owls');
  await page.waitForSelector('.sheet[aria-label="Log a time seen"]');
  let f = topSheet(page);
  ok('the form starts on today', (await f.locator('input[data-key=date]').inputValue()) === dayIso(0));
  await f.locator('input[data-key=date]').fill(dayIso(-2));
  await f.locator('select[data-key=venueId]').selectOption('s-harbour');
  ok('the typed place hides while a venue is picked', await f.locator('input[data-key=where]').isHidden());
  await f.locator('input.ac-slider').fill('93');
  ok('the slider sets the score box', (await f.locator('input[data-key=rating]').inputValue()) === '93');
  await f.locator('textarea[data-key=notes]').fill('New single live for the first time.');
  await f.locator('button[type=submit]').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  let log = await seen(page, 's-owls');
  let added = log.find(s => s.date === dayIso(-2));
  ok('a time seen is stored with its date, venue, score and notes', !!added && added.venueId === 's-harbour' && added.rating === 93 && added.notes === 'New single live for the first time.' && added.where === '' && !!added.id, JSON.stringify(added));
  ok('the card stays open after a save', (await head.getAttribute('aria-expanded')) === 'true');
  ok('the card counts it: 4 times, a new average and latest', /Seen 4 times · average 82\/100 · latest 93/.test(await owls.locator('.ac-seen-line').innerText()), await owls.locator('.ac-seen-line').innerText());
  ok('the newest is at the top of the log', /Harbour Hall/.test(await owls.locator('.ac-seen').first().innerText()) && /93/.test(await owls.locator('.ac-seen').first().innerText()));

  /* a typed place; the score box is limited to 1-100 */
  await page.click('#ac-log-s-owls');
  await page.waitForSelector('.sheet[aria-label="Log a time seen"]');
  f = topSheet(page);
  ok('with no venue picked, the typed place shows', await f.locator('input[data-key=where]').isVisible());
  await f.locator('input[data-key=where]').fill('Rough Trade, in-store');
  await f.locator('input[data-key=rating]').fill('140');
  await f.locator('button[type=submit]').click();
  await sleep(300);
  ok('a score over 100 is not saved', (await page.locator('.sheet[aria-label="Log a time seen"]').count()) === 1 && (await seen(page, 's-owls')).length === 4);
  await f.locator('input[data-key=rating]').fill('64');
  ok('the box moves the slider', (await f.locator('input.ac-slider').inputValue()) === '64');
  await f.locator('button[type=submit]').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  log = await seen(page, 's-owls');
  added = log.find(s => s.where === 'Rough Trade, in-store');
  ok('a typed place is kept as its name', !!added && added.venueId === '' && added.rating === 64 && added.date === dayIso(0), JSON.stringify(added));
  ok('the log shows the typed place', /Rough Trade, in-store/.test(await owls.locator('.ac-seen').first().innerText()));

  /* edit one, then delete it */
  await owls.locator('.ac-seen').first().locator('button[aria-label^="Edit"]').click();
  await page.waitForSelector('.sheet[aria-label="Edit a time seen"]');
  f = topSheet(page);
  ok('editing fills in the entry', (await f.locator('input[data-key=where]').inputValue()) === 'Rough Trade, in-store' && (await f.locator('input[data-key=rating]').inputValue()) === '64' && (await f.locator('input.ac-slider').inputValue()) === '64');
  await f.locator('input[data-key=rating]').fill('70');
  await f.locator('button[type=submit]').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  log = await seen(page, 's-owls');
  ok('an edit changes the entry, not a new one', log.length === 5 && log.filter(s => s.where === 'Rough Trade, in-store').length === 1 && log.find(s => s.where === 'Rough Trade, in-store').rating === 70);
  const dialogs = [];
  page.on('dialog', d => dialogs.push(d.message()));
  await owls.locator('.ac-seen').first().locator('button[aria-label^="Edit"]').click();
  await page.waitForSelector('.sheet[aria-label="Edit a time seen"]');
  await topSheet(page).locator('button.danger').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  log = await seen(page, 's-owls');
  ok('Delete asks first, then removes only that entry', /Remove the time you saw The Night Owls/.test(dialogs[dialogs.length - 1] || '') && log.length === 4 && !log.some(s => s.where === 'Rough Trade, in-store'), dialogs.join(' | '));

  /* from a past show */
  await page.evaluate(d => import('./js/store.js').then(s => s.upsert('bookings', { id: 't-old', kind: 'show', status: 'done', actId: 's-owls', date: d, venueId: 's-greenfield' })), dayIso(-120));
  await page.evaluate(d => import('./js/store.js').then(s => s.upsert('bookings', { id: 't-hold', kind: 'show', status: 'hold', actId: 's-owls', date: d, venueId: 's-harbour' })), dayIso(-130));
  await page.evaluate(d => import('./js/store.js').then(s => s.upsert('bookings', { id: 't-missed', kind: 'show', status: 'done', actId: 's-owls', date: d, venueId: 's-lantern', went: 'no' })), dayIso(-125)); // answered No to “Did you see them?”
  await page.waitForSelector('#ac-past-s-owls');
  await page.click('#ac-past-s-owls');
  await page.waitForSelector('.sheet[aria-label="From a past show"]');
  const picks = (await page.locator('.ac-pick').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
  ok('past shows not logged yet are offered; holds that never happened are not, nor a show marked Didn’t go', picks.length === 1 && /Greenfield/.test(picks[0]), picks.join(' | '));
  await page.locator('.ac-pick').first().click();
  await page.waitForSelector('.sheet[aria-label="Log a time seen"]');
  f = topSheet(page);
  ok('a past show fills in its date and venue', (await f.locator('input[data-key=date]').inputValue()) === dayIso(-120) && (await f.locator('select[data-key=venueId]').inputValue()) === 's-greenfield');
  await f.locator('input[data-key=rating]').fill('55');
  await f.locator('button[type=submit]').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  log = await seen(page, 's-owls');
  added = log.find(s => s.bookingId === 't-old');
  ok('the entry keeps its booking, and the show is no longer offered', !!added && added.rating === 55 && (await page.locator('#ac-past-s-owls').count()) === 0);

  /* venues and bookings deleted later */
  await page.evaluate(() => import('./js/store.js').then(s => { s.remove('bookings', 't-old'); s.remove('venues', 's-greenfield'); }));
  await sleep(200);
  log = await seen(page, 's-owls');
  added = log.find(s => s.rating === 55);
  ok('a deleted booking and venue leave the entry, with the venue’s name', !!added && added.bookingId === '' && added.venueId === '' && added.where === 'Greenfield Festival', JSON.stringify(added));
  ok('the log still shows where', (await owls.locator('.ac-seen').allInnerTexts()).some(r => /Greenfield Festival/.test(r)));

  /* close it, open the act */
  await head.click();
  await page.waitForSelector('#ac-pnl-s-owls', { state: 'detached' });
  ok('tapping the head again closes it', (await head.getAttribute('aria-expanded')) === 'false');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#ac-pnl-s-owls');
  ok('the keyboard opens it too', (await head.getAttribute('aria-expanded')) === 'true');
  await page.click('#ac-open-s-owls');
  await page.waitForSelector('.ac-view .ac-title');
  ok('Open the act shows its page', (await page.textContent('.ac-title')) === 'The Night Owls');
  await page.click('.ac-view .back-btn');
  await page.waitForSelector('.ac-card[data-id="s-owls"]');
  ok('back on the list, the card is still open', (await head.getAttribute('aria-expanded')) === 'true');

  /* a new act: not seen yet, nothing booked */
  await page.evaluate(() => import('./js/store.js').then(s => s.upsert('acts', { id: 't-new', name: 'Brand New', members: [] })));
  await openGroups(page, 'none'); // it has no genre
  await page.waitForSelector('.ac-card[data-id="t-new"]');
  const fresh = page.locator('.ac-card[data-id="t-new"]');
  ok('a new act says it is not seen yet and has nothing booked', /Not seen live yet/.test(await fresh.innerText()) && /Nothing on the calendar yet/.test(await fresh.innerText()));
  await fresh.locator('.ac-card-head').click();
  await page.waitForSelector('#ac-pnl-t-new');
  ok('its log explains what to log', /score out of 100/.test(await page.textContent('#ac-pnl-t-new')));

  /* the list walkthrough */
  await page.click('#helpBtn');
  await page.waitForSelector('.tour-card');
  const titles = [];
  for (let i = 0; i < 8 && await page.locator('.tour-card').count(); i++) { titles.push(await page.textContent('#tour-title')); await page.click('.tour-actions .btn.primary'); await sleep(700); }
  ok('the list walkthrough covers the drop-down and the dates', titles.includes('Drop it open') && titles.includes('Dates coming up'), titles.join(' › '));

  /* dark, wide text */
  await page.evaluate(() => { localStorage.setItem('tourbook-prefs', JSON.stringify({ scheme: 'dark', text: 'xlarge' })); });
  await page.reload();
  await page.waitForSelector('#deck .dk-next');
  await go(page, 'acts'); // a reload opens the calendar
  await openGroups(page, 'rock');
  await page.waitForSelector('.ac-card[data-id="s-owls"]');
  await page.click('#ac-head-s-owls');
  await page.waitForSelector('#ac-pnl-s-owls');
  ok('the largest text is on', await page.evaluate(() => document.documentElement.dataset.text === 'xlarge'));
  const wide = await page.evaluate(() => [...document.querySelectorAll('.ac-card, .ac-date, .ac-seen, .ac-pnl-actions .btn')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => el.className + ' ' + Math.round(el.getBoundingClientRect().right)));
  ok('no card, date or button is wider than the screen at the largest text', !wide.length && (await page.locator('.ac-seen').count()) > 0, wide.join(' | '));

  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL seen spec crashed — ' + e.message); process.exit(1); });
