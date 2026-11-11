// The Acts page for each role: its name (Artists, Roster, Bands, My act) on the page, the back button and the tour; the
// list's order (A to Z, latest score for the scout, last seen for the audiophile) and how it re-sorts after a score;
// the times seen kept back until something is logged for a role that doesn't score its own acts; the empty list's
// words; an act's page kept to its Overview, led by the times seen, for the scout; + Book follows the role's usual kind;
// and scoring the same night: today's show is offered, and a time logged from the card takes that show's id.
const { open, ok, sleep, topSheet } = require('../helpers.cjs');

const dayIso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const role = (page, id) => page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id).then(() => sleep(250));
const order = page => page.$$eval('.ac-card', cs => cs.map(c => c.dataset.id));
const seen = (page, id) => page.evaluate(i => import('./js/store.js').then(s => JSON.parse(JSON.stringify((s.byId('acts', i) || {}).seen || []))), id);
const put = (page, list, rec) => page.evaluate(([l, r]) => import('./js/store.js').then(s => s.upsert(l, r)), [list, rec]).then(() => sleep(250));
const act = (page, id) => page.evaluate(i => import('./js/pages/acts.js').then(m => m.openAct(i)), id).then(() => page.waitForSelector('.ac-view .ac-title'));
const steps = page => page.evaluate(() => import('./js/pages/acts.js').then(m => m.acts.tutorial().map(s => s.title)));
const opt = (page, key) => page.evaluate(k => import('./js/roles.js').then(m => m.pageOpt('acts', k, null)), key);
// Logs a time seen from the card's + Log button, with this score.
async function logFromCard(page, id, score) {
  await page.click(`#ac-log-${id}`);
  await page.waitForSelector('.sheet[aria-label="Log a time seen"]');
  await topSheet(page).locator('input[data-key=rating]').fill(String(score));
  await topSheet(page).locator('button[type=submit]').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  await sleep(300);
}

(async () => {
  /* ---------------- the scout: latest score first ---------------- */
  {
    const { browser, page, errors } = await open({ sample: true, tab: 'acts', init: "localStorage.setItem('gdex-role','scout')" });
    await page.waitForSelector('.ac-card');
    await put(page, 'acts', { id: 't-zed', name: 'Zed Unseen', members: [] });
    await put(page, 'acts', { id: 't-able', name: 'Able Unseen', members: [] });
    await put(page, 'acts', { id: 't-tie', name: 'Tied Up', members: [], seen: [{ id: 'x1', date: dayIso(-3), rating: 90 }, { id: 'x2', date: dayIso(-50), rating: 50 }] });
    let ids = await order(page);
    ok('scout: the latest score comes first, then the average, then the name; acts never seen last, A to Z', JSON.stringify(ids) === JSON.stringify(['s-sablea', 't-tie', 's-owls', 't-able', 't-zed']), ids.join(','));
    ok('scout: the heading is Acts', (await page.textContent('#page .page-head h1')) === 'Acts');
    ok('scout: an act with no members leaves out “No members yet” on its card', !/No members yet/.test(await page.textContent('.ac-card[data-id="t-able"]')) && /Not seen live yet/.test(await page.textContent('.ac-card[data-id="t-able"]')));
    ok('scout: the times seen show on every card, as for everyone', /Seen 3 times/.test(await page.textContent('.ac-card[data-id="s-owls"] .ac-seen-line')));

    // a score re-sorts the list; the open card stays open and the focus comes back to + Log
    await page.click('#ac-head-s-owls');
    await page.waitForSelector('#ac-pnl-s-owls');
    await logFromCard(page, 's-owls', 95);
    ids = await order(page);
    ok('scout: after a score of 95 the act moves to the top', ids[0] === 's-owls', ids.join(','));
    ok('scout: its card is still open', (await page.getAttribute('#ac-head-s-owls', 'aria-expanded')) === 'true');
    ok('scout: the focus comes back to + Log a time you saw them', await page.evaluate(() => document.activeElement && document.activeElement.id === 'ac-log-s-owls'));
    ok('scout: …and it is on screen', await page.evaluate(() => { const r = document.getElementById('ac-log-s-owls').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    ok('scout: the list tour says the order', (await page.evaluate(() => import('./js/pages/acts.js').then(m => m.acts.tutorial()[2].text))).includes('best latest score comes first'));

    /* the scout's act page: Overview only, the times seen first */
    await act(page, 's-owls');
    ok('scout: an act’s page has no tab strip', (await page.locator('.ac-tabs, [role=tablist], [role=tabpanel]').count()) === 0);
    ok('scout: …no press kit or rider', (await page.locator('.ac-epk, #ac-inputs').count()) === 0 && (await page.locator('#ac-coming').count()) === 1);
    ok('scout: the times seen lead the Overview', await page.evaluate(() => { const first = document.querySelector('.ac-about').firstElementChild; return first && first.id === 'ac-seen'; }));
    ok('scout: …with its heading, the log and + Log, and no Open the act', (await page.textContent('#ac-seen h3')) === 'Times seen' && (await page.locator('#ac-seen .ac-seen').count()) === 4 && (await page.locator('#ac-log-s-owls').count()) === 1 && (await page.locator('#ac-open-s-owls').count()) === 0);
    ok('scout: the back button says All acts (the scout keeps the name Acts)', /All acts/.test(await page.textContent('.ac-view .back-btn')));
    ok('scout: + Book follows the scout’s usual kind', (await page.textContent('#ac-book')) === '+ Book a show');
    let titles = await steps(page);
    ok('scout: the act’s tour leaves out the tabs, press kit and rider, and shows the times seen', titles.includes('Times seen') && !titles.includes('Three parts') && !titles.includes('Press kit') && !titles.includes('Input list'), titles.join(' › '));
    await page.click('#ac-log-s-owls');
    await page.waitForSelector('.sheet[aria-label="Log a time seen"]');
    await topSheet(page).locator('input[data-key=date]').fill(dayIso(-1));
    await topSheet(page).locator('input[data-key=rating]').fill('60');
    await topSheet(page).locator('button[type=submit]').click();
    await page.waitForSelector('.sheet', { state: 'detached' });
    await sleep(300);
    ok('scout: a time logged on the act’s page shows in its log there', (await page.locator('#ac-seen .ac-seen').count()) === 5 && (await page.locator('.ac-view').count()) === 1);
    await act(page, 't-able');
    ok('scout: the hero leaves out “No members yet” too', !/No members yet/.test(await page.textContent('.ac-hero')));
    ok('scout: with no links, the hero doesn’t point to a press kit it doesn’t show', !/press kit/.test(await page.textContent('.ac-hero')));
    ok('scout: …nor does the bio hint', !/press kit/.test(await page.textContent('#ac-bio')));
    await page.click('#ac-edit');
    await page.waitForSelector('.sheet[aria-label="Edit act"]');
    ok('scout: the act form doesn’t mention the press kit', !/press kit/i.test(await topSheet(page).innerText()));
    await page.keyboard.press('Escape');

    // switching role on an act's press kit: the role without it lands on the Overview, and back
    await role(page, 'all');
    await act(page, 's-owls');
    await page.click('#ac-tab-epk');
    await page.waitForSelector('.ac-epk');
    await role(page, 'scout');
    ok('a role without the press kit, chosen on the press kit, shows the Overview', (await page.locator('.ac-epk').count()) === 0 && (await page.locator('#ac-seen').count()) === 1);
    await role(page, 'all');
    ok('Everything: the tabs come back, on the Overview, without the times seen', (await page.locator('.ac-tabs [role=tab]').count()) === 3 && (await page.getAttribute('#ac-tab-about', 'aria-selected')) === 'true' && (await page.locator('#ac-seen').count()) === 0);
    titles = await steps(page);
    ok('Everything: the act’s tour is as it was', titles.join('|') === 'The act|Three parts|Coming up|Members|Songs & setlists|Press kit|QR code|Input list|Stage plot|Riders|Print the tech rider', titles.join(' › '));
    await page.click('.ac-view .back-btn');
    await page.waitForSelector('.ac-card');
    ids = await order(page);
    ok('Everything: A to Z, as before', JSON.stringify(ids) === JSON.stringify(['t-able', 's-sablea', 's-owls', 't-tie', 't-zed']), ids.join(','));
    ok('Everything: an act with no members says so', /No members yet/.test(await page.textContent('.ac-card[data-id="t-able"]')));

    ok('no errors in the console (scout)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- the audiophile: last seen first ---------------- */
  {
    const { browser, page, errors } = await open({ sample: true, tab: 'acts', init: "localStorage.setItem('gdex-role','audiophile')" });
    await page.waitForSelector('.ac-card');
    await put(page, 'acts', { id: 't-new', name: 'A New Band', members: [] });
    await put(page, 'acts', { id: 't-noscore', name: 'Quiet Ones', members: [], seen: [{ id: 'y1', date: dayIso(-60) }] });
    let ids = await order(page);
    ok('audiophile: the band seen last comes first; bands never seen last', JSON.stringify(ids) === JSON.stringify(['s-owls', 's-sablea', 't-noscore', 't-new']), ids.join(','));
    ok('audiophile: the heading is Bands', (await page.textContent('#page .page-head h1')) === 'Bands');
    await page.click('#ac-head-s-sablea');
    await page.waitForSelector('#ac-pnl-s-sablea');
    await logFromCard(page, 's-sablea', 70);
    ids = await order(page);
    ok('audiophile: after logging Sable tonight, Sable comes first', ids[0] === 's-sablea', ids.join(','));
    ok('audiophile: the card stays open with the focus on + Log', (await page.getAttribute('#ac-head-s-sablea', 'aria-expanded')) === 'true' && await page.evaluate(() => document.activeElement && document.activeElement.id === 'ac-log-s-sablea'));
    ok('audiophile: the list tour says the order', (await page.evaluate(() => import('./js/pages/acts.js').then(m => m.acts.tutorial()[2].text))).includes('saw last come first'));
    ok('audiophile: the first step of the list tour is called Bands', (await steps(page))[0] === 'Bands');
    await act(page, 's-sablea');
    ok('audiophile: an act’s page is the Overview, led by the times seen', (await page.locator('.ac-tabs').count()) === 0 && (await page.locator('#ac-seen').count()) === 1);
    ok('audiophile: the back button says Bands', (await page.textContent('.ac-view .back-btn')).trim() === '‹ Bands', await page.textContent('.ac-view .back-btn'));
    ok('no errors in the console (audiophile)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- a band: the times seen only once logged ---------------- */
  {
    const { browser, page, errors } = await open({ sample: true, tab: 'acts', init: "localStorage.setItem('gdex-role','band')" });
    await page.waitForSelector('.ac-card');
    await put(page, 'acts', { id: 't-band', name: 'The Loud Room', genre: 'Garage', members: [] });
    await put(page, 'bookings', { id: 't-gig', kind: 'show', status: 'done', actId: 't-band', date: dayIso(-5), venueId: 's-harbour' });
    const card = page.locator('.ac-card[data-id="t-band"]');
    ok('band: an act with nothing logged has no times-seen line', (await card.locator('.ac-seen-line').count()) === 0 && !/Not seen live yet/.test(await card.innerText()));
    ok('band: …but says it has no members (a band keeps its line-up)', /No members yet/.test(await card.innerText()));
    ok('band: an act with times logged shows them as before', /Seen 3 times · average 78\/100/.test(await page.textContent('.ac-card[data-id="s-owls"] .ac-seen-line')));
    ok('band: the list is A to Z', JSON.stringify(await order(page)) === JSON.stringify(['s-sablea', 't-band', 's-owls']), (await order(page)).join(','));
    await page.click('#ac-head-t-band');
    await page.waitForSelector('#ac-pnl-t-band');
    const pnl = page.locator('#ac-pnl-t-band');
    const btns = await pnl.locator('.btn').evaluateAll(bs => bs.map(b => [b.id, b.className, b.textContent.trim()]));
    ok('band: the open panel leads with Open the act as the main button', btns[0] && btns[0][0] === 'ac-open-t-band' && /primary/.test(btns[0][1]) && btns[0][2] === 'Open the act ›', JSON.stringify(btns));
    ok('band: …then + Log a time you saw them as a ghost button', btns[1] && btns[1][0] === 'ac-log-t-band' && /ghost/.test(btns[1][1]) && !/primary/.test(btns[1][1]), JSON.stringify(btns));
    ok('band: …below it', await page.evaluate(() => document.getElementById('ac-log-t-band').getBoundingClientRect().top >= document.getElementById('ac-open-t-band').getBoundingClientRect().bottom - 1));
    ok('band: no Times seen heading or empty hint until something is logged', !/Times seen/.test(await pnl.innerText()) && !/score out of 100/.test(await pnl.innerText()), await pnl.innerText());
    ok('band: a past show is still offered', (await page.locator('#ac-past-t-band').count()) === 1);
    const owlsBtns = await page.click('#ac-head-s-owls').then(() => page.waitForSelector('#ac-pnl-s-owls')).then(() => page.locator('#ac-pnl-s-owls .btn').evaluateAll(bs => bs.map(b => [b.id, b.className])));
    ok('band: an act with a log opens on it, + Log first, as before', /Times seen/.test(await page.textContent('#ac-pnl-s-owls')) && owlsBtns[0][0] === 'ac-log-s-owls' && /primary/.test(owlsBtns[0][1]) && /ghost/.test(owlsBtns[owlsBtns.length - 1][1]), JSON.stringify(owlsBtns));
    await page.click('#ac-head-s-owls');
    await logFromCard(page, 't-band', 80);
    ok('band: once something is logged, the card counts it', /Seen once · average 80\/100/.test(await card.locator('.ac-seen-line').innerText()));
    ok('band: …and the panel shows the log with + Log first', /Times seen/.test(await pnl.innerText()) && /primary/.test(await page.getAttribute('#ac-log-t-band', 'class')) && /ghost/.test(await page.getAttribute('#ac-open-t-band', 'class')));
    ok('band: the focus is back on + Log', await page.evaluate(() => document.activeElement && document.activeElement.id === 'ac-log-t-band'));
    ok('band: the first step of the list tour is called Bands', (await steps(page))[0] === 'Bands');
    await act(page, 't-band');
    ok('band: the act’s page keeps its three tabs and no times seen', (await page.locator('.ac-tabs [role=tab]').count()) === 3 && (await page.locator('#ac-seen').count()) === 0);
    ok('band: the back button says Bands', (await page.textContent('.ac-view .back-btn')).trim() === '‹ Bands');
    ok('band: + Book a show', (await page.textContent('#ac-book')) === '+ Book a show');
    await page.evaluate(() => import('./js/pages/acts.js').then(m => m.openAct('t-gone')));
    await page.waitForSelector('.toast');
    ok('band: an act that has gone says it is no longer in Bands', (await page.locator('.toast').last().textContent()) === 'That act is no longer in Bands.', await page.locator('.toast').last().textContent());
    ok('no errors in the console (band)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- names, + Book, for each role ---------------- */
  {
    const { browser, page, errors } = await open({ sample: true, tab: 'acts' });
    await page.waitForSelector('.ac-card');
    const want = { producer: 'Artists', manager: 'Roster', band: 'Bands', solo: 'My act', scout: 'Acts', audiophile: 'Bands', all: 'Acts' };
    for (const [id, name] of Object.entries(want)) {
      await role(page, id);
      await page.evaluate(() => window.logiGo('acts'));
      await sleep(200);
      if (await page.locator('.ac-view').count()) { await page.click('.ac-view .back-btn'); await page.waitForSelector('.ac-page'); }
      const head = await page.textContent('#page .page-head h1');
      const first = (await steps(page))[0];
      await act(page, 's-owls');
      const back = (await page.textContent('.ac-view .back-btn')).trim();
      ok(`${id}: the list is called ${name}, in its heading, the tour and the back button`, head === name && first === name && back === (name === 'Acts' ? '‹ All acts' : '‹ ' + name), `${head} / ${first} / ${back}`);
    }
    await role(page, 'producer');
    await act(page, 's-sablea');
    ok('producer: an artist’s page offers + Book a session', (await page.textContent('#ac-book')) === '+ Book a session');
    ok('producer: …and the act’s tour says so', (await page.evaluate(() => import('./js/pages/acts.js').then(m => m.acts.tutorial().find(s => s.title === 'Coming up').text))).includes('book a new session'));
    await page.click('#ac-book');
    await page.waitForSelector('.sheet[aria-label="New studio session"]');
    ok('producer: it starts a studio session for that artist', (await topSheet(page).locator('select[data-key=actId]').inputValue()) === 's-sablea');
    await page.keyboard.press('Escape');
    await sleep(200);
    await role(page, 'manager');
    ok('manager: + Book a show', (await page.textContent('#ac-book')) === '+ Book a show');
    ok('no errors in the console (names)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- the empty list's words ---------------- */
  {
    const { browser, page, errors } = await open({ tab: 'acts', init: "localStorage.setItem('gdex-role','scout')" });
    await page.waitForSelector('.ac-page .empty');
    ok('scout: the empty list has the scout’s own words', (await page.textContent('.ac-page .empty p')) === await opt(page, 'empty') && /watching/.test(await page.textContent('.ac-page .empty p')));
    await role(page, 'audiophile');
    ok('audiophile: the empty list has the audiophile’s own words', (await page.textContent('.ac-page .empty p')) === await opt(page, 'empty') && /seen or want to see/.test(await page.textContent('.ac-page .empty p')));
    await role(page, 'manager');
    let text = await page.textContent('.ac-page .empty p');
    ok('manager: the empty list has the manager’s own words', text === await opt(page, 'empty') && /roster/.test(text), text);
    await role(page, 'solo');
    ok('solo: …and the solo artist’s', (await page.textContent('.ac-page .empty p')) === await opt(page, 'empty') && /yourself as an act/.test(await page.textContent('.ac-page .empty p')));
    await role(page, 'band');
    ok('band: …and the band’s', /Add your band/.test(await page.textContent('.ac-page .empty p')));
    await role(page, 'all');
    text = await page.textContent('.ac-page .empty p');
    ok('Everything: the empty list reads as it always has', text === 'An act is a band or artist you play in, manage or produce. Its card counts the times you have seen them play, with your scores out of 100 and its dates coming up; it also keeps its members, links, press kit and tech rider.', text);
    ok('the empty list still offers + New act', (await page.textContent('#ac-new-empty')) === '+ New act');
    ok('no errors in the console (empty)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- scoring the same night ---------------- */
  {
    const { browser, page, errors } = await open({ sample: true, tab: 'acts', init: "localStorage.setItem('gdex-role','scout')" });
    await page.waitForSelector('.ac-card');
    // The scout's show tonight is on hold (a role without money doesn't confirm); a cancelled one the same day doesn't count.
    await put(page, 'bookings', { id: 't-tonight', kind: 'show', status: 'hold', actId: 's-owls', date: dayIso(0), venueId: 's-lantern' });
    await put(page, 'bookings', { id: 't-off', kind: 'show', status: 'cancelled', actId: 's-owls', date: dayIso(0), venueId: 's-harbour' });
    await page.click('#ac-head-s-owls');
    await page.waitForSelector('#ac-past-s-owls');
    await page.click('#ac-past-s-owls');
    await page.waitForSelector('.sheet[aria-label="From a past show"]');
    let picks = await page.locator('.ac-pick').allInnerTexts();
    ok('scout: tonight’s show (on hold) is offered under From a past show; the cancelled one is not', picks.length === 1 && /^Today/.test(picks[0]) && /Lantern Rooms/.test(picks[0]), picks.join(' | '));
    await page.keyboard.press('Escape');
    await page.waitForSelector('.sheet', { state: 'detached' });
    await logFromCard(page, 's-owls', 88);
    let log = await seen(page, 's-owls');
    let added = log.find(s => s.rating === 88);
    ok('scout: a time logged from the card tonight takes tonight’s show', !!added && added.bookingId === 't-tonight' && added.date === dayIso(0), JSON.stringify(added));
    ok('scout: …so the show is no longer offered', (await page.locator('#ac-past-s-owls').count()) === 0);
    ok('scout: the focus stays on + Log as the past-show button goes', await page.evaluate(() => document.activeElement && document.activeElement.id === 'ac-log-s-owls'));

    // two shows the same day: the entry is left without a booking (it can't tell which)
    await put(page, 'bookings', { id: 't-m1', kind: 'show', status: 'confirmed', actId: 's-sablea', date: dayIso(0), venueId: 's-lantern' });
    await put(page, 'bookings', { id: 't-m2', kind: 'show', status: 'confirmed', actId: 's-sablea', date: dayIso(0), venueId: 's-harbour' });
    await page.click('#ac-head-s-sablea');
    await page.waitForSelector('#ac-log-s-sablea');
    await logFromCard(page, 's-sablea', 77);
    added = (await seen(page, 's-sablea')).find(s => s.rating === 77);
    ok('scout: with two shows that day, the entry takes neither', !!added && added.bookingId === '', JSON.stringify(added));
    ok('scout: …and both count as logged (same date, no booking)', (await page.locator('#ac-past-s-sablea').count()) === 0);

    // Everything (money on): today's confirmed show is offered, a hold today is not
    await role(page, 'all');
    await put(page, 'acts', { id: 't-tonite', name: 'Tonight Act', members: [] });
    await put(page, 'bookings', { id: 't-c', kind: 'show', status: 'confirmed', actId: 't-tonite', date: dayIso(0), venueId: 's-lantern' });
    await put(page, 'bookings', { id: 't-h', kind: 'show', status: 'hold', actId: 't-tonite', date: dayIso(-2), venueId: 's-harbour' });
    await page.click('#ac-head-t-tonite');
    await page.waitForSelector('#ac-past-t-tonite');
    await page.click('#ac-past-t-tonite');
    await page.waitForSelector('.sheet[aria-label="From a past show"]');
    picks = await page.locator('.ac-pick').allInnerTexts();
    ok('Everything: today’s confirmed show is offered; a hold that never happened is not', picks.length === 1 && /^Today/.test(picks[0]) && /Lantern Rooms/.test(picks[0]), picks.join(' | '));
    await page.locator('.ac-pick').first().click();
    await page.waitForSelector('.sheet[aria-label="Log a time seen"]');
    ok('Everything: picking it fills in today and the venue', (await topSheet(page).locator('input[data-key=date]').inputValue()) === dayIso(0) && (await topSheet(page).locator('select[data-key=venueId]').inputValue()) === 's-lantern');
    await topSheet(page).locator('input[data-key=rating]').fill('66');
    await topSheet(page).locator('button[type=submit]').click();
    await page.waitForSelector('.sheet', { state: 'detached' });
    await sleep(300);
    added = (await seen(page, 't-tonite')).find(s => s.rating === 66);
    ok('Everything: the entry keeps that booking', !!added && added.bookingId === 't-c', JSON.stringify(added));
    ok('Everything: the focus lands on + Log when From a past show has gone', await page.evaluate(() => document.activeElement && document.activeElement.id === 'ac-log-t-tonite'));

    // editing an old entry never takes a booking
    await put(page, 'bookings', { id: 't-old', kind: 'show', status: 'done', actId: 't-tonite', date: dayIso(-30), venueId: 's-harbour' });
    await page.evaluate(([d]) => import('./js/store.js').then(s => s.update(db => { const a = db.acts.find(x => x.id === 't-tonite'); a.seen = [...(a.seen || []), { id: 'z9', date: d, rating: 40, bookingId: '' }]; a.updatedAt = Date.now(); })), [dayIso(-30)]);
    await sleep(300);
    await page.locator('.ac-card[data-id="t-tonite"] .ac-seen').filter({ hasText: '40' }).locator('button').click();
    await page.waitForSelector('.sheet[aria-label="Edit a time seen"]');
    await topSheet(page).locator('input[data-key=rating]').fill('45');
    await topSheet(page).locator('button[type=submit]').click();
    await page.waitForSelector('.sheet', { state: 'detached' });
    await sleep(300);
    added = (await seen(page, 't-tonite')).find(s => s.id === 'z9');
    ok('an edit leaves the entry’s booking as it was', !!added && added.rating === 45 && added.bookingId === '', JSON.stringify(added));

    ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }
})().catch(e => { console.log('FAIL roles-acts spec crashed — ' + e.message); process.exit(1); });
