// The section menu: a record player (the default), a tape deck or a digital player (Aa → Section menu). Each section is
// a track (on Side A or B of the record and the cassette, numbered in one list on the digital player); ⏮ ⏭, a swipe, the
// arrow keys and the list (the sleeve, or the track list) all change section, and the digital player has a row of tabs.
const { open, ok, sleep } = require('../helpers.cjs');
const page$ = page => page.evaluate(() => window.logiPage());
(async () => {
  const { browser, page, errors } = await open({ sample: true });

  /* ---------------- the record player ---------------- */
  ok('the record player is the default menu', (await page.locator('#deck .dk-record').count()) === 1 && (await page.locator('#deck .dk-cassette, #deck .dk-player').count()) === 0);
  const recordTall = await page.$eval('#deck', el => el.getBoundingClientRect().height);
  ok('now playing names the section, its track and its count', (await page.textContent('#deck .dk-name')) === 'Bookings' && /^A1 · Side A · \d+ coming up$/.test(await page.textContent('#deck .dk-meta')), await page.textContent('#deck .dk-meta'));
  ok('the record label shows the track and side, upright', (await page.textContent('#deck .dk-label-id')) === 'A1' && (await page.textContent('#deck .dk-label-side')) === 'SIDE A');
  ok('⏭ is labelled with where it goes', (await page.getAttribute('#deck .dk-next', 'aria-label')) === 'Next section: Acts');
  const arm0 = await page.$eval('#deck .dk-arm', el => el.style.transform), disc0 = await page.$eval('#deck .dk-disc', el => el.style.transform);
  await page.click('#deck .dk-next'); await sleep(500);
  ok('⏭ goes to the next section', (await page$(page)) === 'acts' && (await page.textContent('#deck .dk-name')) === 'Acts' && (await page.textContent('#deck .dk-label-id')) === 'A2');
  ok('the tonearm moves in and the record turns a third of a turn', (await page.$eval('#deck .dk-arm', el => el.style.transform)) !== arm0 && (await page.$eval('#deck .dk-disc', el => el.style.transform)) === 'rotate(120deg)' && disc0 === 'rotate(0deg)');
  ok('the label words do not turn (they are outside the turning disc)', (await page.$eval('#deck .dk-label', el => !el.closest('.dk-disc'))));
  await page.click('#deck .dk-prev'); await page.click('#deck .dk-prev'); await sleep(500);
  ok('⏮ from the first section wraps round to the last (B5 Settings)', (await page$(page)) === 'settings' && (await page.textContent('#deck .dk-label-id')) === 'B5' && (await page.textContent('#deck .dk-label-side')) === 'SIDE B');

  // A swipe across the record changes section; a tap opens the sleeve.
  const box = await page.locator('#deck .dk-record').boundingBox();
  await page.mouse.move(box.x + 120, box.y + 75); await page.mouse.down(); await page.mouse.move(box.x + 60, box.y + 78, { steps: 6 }); await page.mouse.up(); await sleep(500);
  ok('a swipe to the left on the record goes to the next section (wrapping to Bookings)', (await page$(page)) === 'bookings');
  ok('…and does not also open the sleeve', (await page.locator('.sheet[aria-label="The sleeve"]').count()) === 0);
  await page.locator('#deck .dk-record').click(); await page.waitForSelector('.sheet[aria-label="The sleeve"]');
  const tracks = await page.$$eval('.dk-sleeve .dk-track', bs => bs.map(b => b.textContent));
  ok('the sleeve lists all eleven sections on two sides', tracks.length === 11 && (await page.$$eval('.dk-sleeve .dk-side-head', hs => hs.map(h => h.textContent).join())) === 'Side A,Side B', tracks.join(' | '));
  ok('…with each one’s count (Acts: 2)', tracks.some(t => t === 'A2Acts2'), tracks[1]);
  ok('…the current one marked', (await page.getAttribute('.dk-sleeve .dk-track.on', 'aria-current')) === 'true' && /Bookings/.test(await page.textContent('.dk-sleeve .dk-track.on')));
  await page.locator('.dk-sleeve .dk-track', { hasText: 'Songs' }).click(); await sleep(600);
  ok('picking a track goes there and closes the sleeve', (await page$(page)) === 'songs' && (await page.locator('.sheet').count()) === 0 && (await page.textContent('#deck .dk-label-id')) === 'A4');

  // Arrow keys change section, but not while typing.
  await page.keyboard.press('ArrowRight'); await sleep(500);
  ok('→ goes to the next section', (await page$(page)) === 'sessions');
  await page.keyboard.press('ArrowLeft'); await sleep(500);
  ok('← goes back', (await page$(page)) === 'songs');
  await page.waitForSelector('#sg-q, .sg-search, input[type=search]');
  await page.locator('input[type=search]').first().focus(); await page.keyboard.press('ArrowRight'); await sleep(300);
  ok('arrow keys in a search box move the cursor, not the section', (await page$(page)) === 'songs');

  // Counts follow the data.
  await page.evaluate(() => import('./js/store.js').then(s => s.upsert('acts', { name: 'Test Pilots' }))); await sleep(300);
  await page.evaluate(() => window.logiGo('acts')); await sleep(500);
  ok('the count under Now playing follows the data (3 acts)', /3 acts$/.test(await page.textContent('#deck .dk-meta')), await page.textContent('#deck .dk-meta'));

  /* ---------------- the tape deck ---------------- */
  await page.click('#displayBtn'); await page.waitForSelector('.sheet[aria-label="Display & accessibility"]');
  ok('Display offers the section menu choice', (await page.locator('.sheet .pref', { hasText: 'Section menu' }).count()) === 1);
  await page.locator('.sheet .pref', { hasText: 'Section menu' }).locator('button', { hasText: 'Tape deck' }).click(); await sleep(300);
  ok('choosing Tape deck swaps the record for a cassette at once', (await page.locator('#deck .dk-cassette').count()) === 1 && (await page.locator('#deck .dk-record').count()) === 0);
  ok('…on the same section', (await page.textContent('#deck .dk-tape-name')) === 'Acts' && (await page.textContent('#deck .dk-tape-id')) === 'A2');
  ok('the choice is kept on this device', await page.evaluate(() => JSON.parse(localStorage.getItem('gdex-prefs')).menu === 'tape'));
  await page.keyboard.press('Escape'); await sleep(300);
  const reel0 = await page.$eval('#deck .dk-reel', el => el.style.transform), packs0 = await page.$$eval('#deck .dk-pack', ps => ps.map(p => p.style.width));
  await page.click('#deck .dk-next'); await sleep(500);
  ok('⏩ winds on to the next section and the reels turn', (await page$(page)) === 'people' && (await page.$eval('#deck .dk-reel', el => el.style.transform)) !== reel0 && (await page.textContent('#deck .dk-counter-n')) === '094');
  ok('…tape moves from the left spool to the right', await page.$$eval('#deck .dk-pack', (ps, before) => parseFloat(ps[0].style.width) < parseFloat(before[0]) && parseFloat(ps[1].style.width) > parseFloat(before[1]), packs0));
  await page.click('#deck .dk-list'); await page.waitForSelector('.sheet[aria-label="Track list"]');
  ok('Tracks opens the cassette’s track list', (await page.locator('.dk-jcard .dk-track').count()) === 11 && /People/.test(await page.textContent('.dk-jcard .dk-track.on')));
  await page.locator('.dk-jcard .dk-track', { hasText: 'Venues' }).click(); await sleep(500);
  ok('picking Venues goes to Side B', (await page$(page)) === 'venues' && (await page.textContent('#deck .dk-tape-side')) === 'SIDE B');
  await page.reload(); await page.waitForSelector('#deck .dk-next');
  ok('after a reload the tape deck is still the menu, and Gdex opens on the calendar', (await page.locator('#deck .dk-cassette').count()) === 1 && (await page$(page)) === 'bookings');

  /* ---------------- motion ---------------- */
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); await page.waitForSelector('#deck .dk-next');
  ok('with reduced motion asked for, the reels do not animate', (await page.$eval('#deck .dk-reel', el => getComputedStyle(el).transitionDuration)) === '0s');

  /* ---------------- from the review ---------------- */
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => { localStorage.setItem('gdex-prefs', JSON.stringify({ menu: 'record' })); }); await page.reload(); await page.waitForSelector('#deck .dk-record');
  await page.evaluate(() => window.logiGo('bookings')); await sleep(500);
  // A press released off the record, then a plain hover across it, changes nothing.
  let r = await page.locator('#deck .dk-record').boundingBox();
  await page.mouse.move(r.x + 80, r.y + 75); await page.mouse.down(); await page.mouse.move(r.x + 80, r.y + 400, { steps: 5 }); await page.mouse.up(); await sleep(200);
  await page.mouse.move(r.x + 140, r.y + 75); await page.mouse.move(r.x + 20, r.y + 75, { steps: 8 }); await sleep(400);
  ok('a press released off the record, then a hover across it, does not change section', (await page$(page)) === 'bookings' && (await page.locator('.sheet').count()) === 0);
  ok('the record and cassette still let a pinch zoom the page', /pinch-zoom/.test(await page.$eval('#deck .dk-record', el => getComputedStyle(el).touchAction)));
  // One wheel gesture over the record changes one section.
  await page.mouse.move(r.x + 80, r.y + 75); await sleep(500);
  for (let k = 0; k < 8; k++) { await page.mouse.wheel(0, 60); await sleep(30); }
  await sleep(500);
  ok('a wheel flick over the record moves one section, not several', (await page$(page)) === 'acts', await page$(page));
  // Arrow keys on a tab strip stay with the tabs.
  await page.evaluate(() => window.logiGo('backline')); await sleep(500);
  await page.focus('[role=tab]'); await page.keyboard.press('ArrowRight'); await sleep(400);
  ok('→ on a tab strip (Backline’s Items / Stage packs) does not change section', (await page$(page)) === 'backline');
  ok('Backline’s count is pieces, as the Backline page counts them (4 SM58s, 3 SM57s, 4 DI boxes and 7 more: 18)', /18 items$/.test(await page.textContent('#deck .dk-meta')), await page.textContent('#deck .dk-meta'));
  ok('the rim print fits its circle exactly', (await page.getAttribute('#deck .dk-rim textPath', 'textLength')) === '146');
  ok('the page is a main landmark, not a tab panel of a tab list that no longer exists', (await page.getAttribute('#page', 'role')) === null);
  // Choosing a display option keeps the keyboard focus on it.
  await page.click('#displayBtn'); await page.waitForSelector('[data-pref="menu:tape"]');
  await page.focus('[data-pref="menu:tape"]'); await page.keyboard.press('Enter'); await sleep(300);
  ok('choosing Tape deck by keyboard keeps the focus on that choice', await page.evaluate(() => document.activeElement && document.activeElement.dataset.pref === 'menu:tape'));
  await page.keyboard.press('Escape'); await sleep(300);
  ok('the welcome tour describes the tape deck when that is the menu', await page.evaluate(() => import('./js/tour.js').then(m => /cassette/.test(m.welcomeSteps().find(s => s.title === 'Your sections are tracks').text))));

  /* ---------------- the digital player ---------------- */
  const live = () => page.evaluate(() => (document.getElementById('sr-live') || {}).textContent || '');
  const fill = () => page.$eval('#deck .dk-fill', el => parseFloat(el.style.width));
  const slides = () => page.$eval('#deck .dk-fill', el => getComputedStyle(el).transitionDuration);
  const rowLeft = () => page.$eval('#deck .dk-tabs', el => el.scrollLeft);
  // Whether the current tab is wholly inside its row (the row scrolls sideways).
  const tabInView = () => page.evaluate(() => { const row = document.querySelector('#deck .dk-tabs').getBoundingClientRect(), t = document.querySelector('#deck .dk-tab.on').getBoundingClientRect(); return t.left >= row.left - 1 && t.right <= row.right + 1; });
  // Which control of the menu has the focus: 'dk-now', 'dk-prev', 'dk-list', 'dk-next', 'tab:<section>', or ''.
  const focusOn = () => page.evaluate(() => { const a = document.activeElement; if (!a || !a.closest('#deck')) return ''; return a.classList.contains('dk-tab') ? 'tab:' + a.dataset.section : ['dk-now', 'dk-prev', 'dk-list', 'dk-next'].find(c => a.classList.contains(c)) || '?'; });
  const current = () => page.$$eval('#deck .dk-tab[aria-current]', bs => bs.map(b => `${b.dataset.section}:${b.getAttribute('aria-current')}:${b.classList.contains('on')}`).join());
  // The tab that has the focus when part of it is outside its row ('' when it is wholly in view, or the focus is not on a tab).
  const focusCut = () => page.evaluate(() => { const a = document.activeElement; if (!a || !a.classList.contains('dk-tab')) return ''; const row = document.querySelector('#deck .dk-tabs').getBoundingClientRect(), t = a.getBoundingClientRect(); return t.left >= row.left - 1 && t.right <= row.right + 1 ? '' : a.dataset.section; });
  // Tab (or Shift+Tab) pressed n times: the tabs the focus landed on that were not wholly in view.
  const tabAlong = async (key, n) => { const cut = []; for (let k = 0; k < n; k++) { await page.keyboard.press(key); const c = await focusCut(); if (c) cut.push(c); } return cut; };
  const ALL = 'bookings,acts,people,songs,sessions,backline,venues,money,tools,insurance,settings';

  await page.evaluate(() => window.logiGo('acts')); await sleep(500);
  await page.click('#displayBtn'); await page.waitForSelector('[data-pref="menu:digital"]');
  const choices = await page.$$eval('.sheet .pref[aria-label="Section menu"] button', bs => bs.map(b => b.textContent));
  ok('Aa → Section menu has three choices', JSON.stringify(choices) === JSON.stringify(['Record player', 'Tape deck', 'Digital player']), choices.join(', '));
  const said = await live();
  await page.focus('[data-pref="menu:digital"]'); await page.keyboard.press('Enter'); await sleep(300);
  ok('choosing Digital player swaps the menu at once: one player, no record, no cassette', (await page.locator('#deck .dk-player').count()) === 1 && (await page.locator('#deck .dk-record, #deck .dk-cassette').count()) === 0 && (await page.getAttribute('#deck .deck', 'data-style')) === 'digital');
  ok('…on the same section and page, with nothing announced', (await page.textContent('#deck .dk-name')) === 'Acts' && (await page$(page)) === 'acts' && (await live()) === said, await live());
  ok('the choice is kept on this device', await page.evaluate(() => JSON.parse(localStorage.getItem('gdex-prefs')).menu === 'digital'));
  ok('…and keeps the focus', await page.evaluate(() => { const a = document.activeElement; return !!a && a.dataset.pref === 'menu:digital' && a.getAttribute('aria-pressed') === 'true'; }));
  // The only thing that moves is the line, and it follows the animation setting.
  ok('the line slides with the default animation', (await slides()) !== '0s', await slides());
  const moving = await page.$$eval('#deck .deck *', els => els.filter(el => !el.classList.contains('dk-fill') && getComputedStyle(el).transitionDuration.split(',').some(d => parseFloat(d) > 0)).map(el => el.className));
  ok('…and nothing else in the digital player has a transition', moving.length === 0, moving.join(' | '));
  await page.click('[data-pref="motion:bar"]'); await sleep(200);
  ok('…it still slides with Menu only, when small touches do not', (await slides()) !== '0s' && (await page.$eval('.sheet .seg button', el => getComputedStyle(el).transitionDuration)) === '0s', await slides());
  await page.click('[data-pref="motion:off"]'); await sleep(200);
  ok('…and not with None', (await slides()) === '0s', await slides());
  await page.click('[data-pref="motion:soft"]'); await sleep(200);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  ok('…nor when the device asks for reduced motion', (await slides()) === '0s', await slides());
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.keyboard.press('Escape'); await sleep(300);

  ok('the bar names the section, its place among the tracks and its count', (await page.textContent('#deck .dk-eyebrow')) === 'Now playing' && (await page.textContent('#deck .dk-name')) === 'Acts' && /^Track 2 of 11 · \d+ acts$/.test(await page.textContent('#deck .dk-meta')), await page.textContent('#deck .dk-meta'));
  ok('…and says so to a screen reader', (await page.getAttribute('#deck .dk-now', 'aria-label')) === 'Now playing track 2 of 11, Acts. Open the track list to pick any section', await page.getAttribute('#deck .dk-now', 'aria-label'));
  ok('⏭ is labelled with where it goes, and ☰ with what it opens', (await page.getAttribute('#deck .dk-next', 'aria-label')) === 'Next section: People' && (await page.getAttribute('#deck .dk-prev', 'aria-label')) === 'Previous section: Bookings' && (await page.getAttribute('#deck .dk-list', 'aria-label')) === 'Track list: every section' && (await page.getAttribute('#deck .dk-list', 'aria-haspopup')) === 'dialog');
  ok('the cover art is the section’s icon; it and the line are hidden from a screen reader', (await page.textContent('#deck .dk-art')) === '🎸' && (await page.getAttribute('#deck .dk-art', 'aria-hidden')) === 'true' && (await page.getAttribute('#deck .dk-progress', 'aria-hidden')) === 'true');
  const artBack = await page.$eval('#deck .dk-art', el => getComputedStyle(el).backgroundImage);
  ok('the art is a gradient with a soft light behind the icon, so a dark icon reads on any theme’s accent', /^radial-gradient\(.*linear-gradient\(/.test(artBack), artBack.slice(0, 120));
  ok('the menu is still the Sections landmark', (await page.getAttribute('#deck', 'aria-label')) === 'Sections' && (await page.$eval('#deck', el => el.tagName)) === 'NAV');
  const meta = await page.evaluate(() => { const m = document.querySelector('#deck .dk-meta').getBoundingClientRect(), a = document.querySelector('#deck .dk-meta-at').getBoundingClientRect(), n = document.querySelector('#deck .dk-meta-n').getBoundingClientRect(); return { lines: m.height / a.height, at: a.right <= m.right + 1 && a.bottom <= m.bottom + 1, count: (n.top < m.bottom - 1 && n.right <= m.right + 1) || n.top >= m.bottom - 1 }; });
  ok('the line under the name is one line: the track in full, and the count whole or not at all', meta.lines < 1.5 && meta.at && meta.count, JSON.stringify(meta));
  ok('the bar is slim: at most 72 px tall, and the whole menu is shorter than the record player', (await page.$eval('#deck .dk-player', el => el.getBoundingClientRect().height)) <= 72 && (await page.$eval('#deck', el => el.getBoundingClientRect().height)) < recordTall, `${await page.$eval('#deck .dk-player', el => el.getBoundingClientRect().height)} px; ${await page.$eval('#deck', el => el.getBoundingClientRect().height)} against ${recordTall}`);

  // ⏭ and ⏮: one section at a time, round the ends; the line shows how far through the menu you are.
  const f0 = await fill();
  await page.click('#deck .dk-next'); await sleep(500);
  ok('⏭ goes to the next section, and the line grows by one track', (await page$(page)) === 'people' && (await page.textContent('#deck .dk-name')) === 'People' && Math.abs((await fill()) - f0 - 100 / 11) < 0.01 && Math.abs(f0 - 200 / 11) < 0.01, `${f0} → ${await fill()}`);
  ok('…as drawn: three elevenths of the bar', await page.evaluate(() => Math.abs(document.querySelector('#deck .dk-fill').getBoundingClientRect().width / document.querySelector('#deck .dk-progress').getBoundingClientRect().width - 3 / 11) < 0.01));
  ok('…the move is announced with the track’s place', (await live()) === 'People, track 3 of 11', await live());
  ok('…and ⏭ keeps the focus', (await focusOn()) === 'dk-next', await focusOn());
  await page.click('#deck .dk-prev'); await page.click('#deck .dk-prev'); await page.click('#deck .dk-prev'); await sleep(500);
  ok('⏮ from the first section wraps round to the last: Track 11 of 11, the line full, its tab in view', (await page$(page)) === 'settings' && (await page.textContent('#deck .dk-meta')) === 'Track 11 of 11' && (await fill()) === 100 && await tabInView() && (await rowLeft()) > 0, `${await page.textContent('#deck .dk-meta')} · ${await fill()}`);
  await page.click('#deck .dk-next'); await sleep(500);
  ok('⏭ from the last wraps to the first, and the row is back at its start', (await page$(page)) === 'bookings' && Math.abs((await fill()) - 100 / 11) < 0.01 && (await rowLeft()) === 0 && await tabInView(), `${await fill()} · ${await rowLeft()}`);

  // A swipe across the bar changes section; a tap opens the track list.
  const bar = await page.locator('#deck .dk-now').boundingBox();
  await page.mouse.move(bar.x + 150, bar.y + 25); await page.mouse.down(); await page.mouse.move(bar.x + 90, bar.y + 28, { steps: 6 }); await page.mouse.up(); await sleep(500);
  ok('a swipe to the left on the bar goes to the next section', (await page$(page)) === 'acts');
  ok('…and does not also open the track list', (await page.locator('.sheet').count()) === 0);
  await page.locator('#deck .dk-now').click(); await page.waitForSelector('.sheet[aria-label="Track list"]');
  const queue = await page.$$eval('.dk-queue .dk-sides .dk-track', bs => bs.map(b => [b.querySelector('.dk-track-id').textContent, b.dataset.section, b.querySelector('.dk-track-name').textContent]));
  ok('a tap on the bar opens the track list: the eleven sections numbered 1 to 11 in one list', queue.length === 11 && queue.map(q => q[0]).join() === '1,2,3,4,5,6,7,8,9,10,11' && queue.map(q => q[1]).join() === ALL && (await page.$$eval('.dk-queue .dk-side-head', hs => hs.map(h => h.textContent).join())) === 'Tracks' && (await page.locator('.dk-queue .dk-sides .dk-side').count()) === 1, JSON.stringify(queue));
  ok('…headed by the deck’s name and how many tracks', (await page.textContent('.dk-queue .dk-jcard-title')) === 'Gdex, the booking deck' && (await page.textContent('.dk-queue .muted')) === '11 tracks' && (await page.locator('.dk-queue .dk-bonus').count()) === 0, await page.textContent('.dk-queue .muted'));
  ok('…with each one’s count, and the current one marked and focused', (await page.textContent('.dk-queue .dk-track.on')) === '2Acts3' && (await page.getAttribute('.dk-queue .dk-track.on', 'aria-current')) === 'true' && (await page.locator('.dk-queue .dk-track.on').count()) === 1 && await page.waitForFunction(() => document.activeElement && document.activeElement.matches('.dk-queue .dk-track.on'), null, { timeout: 2000 }).then(() => true, () => false), await page.textContent('.dk-queue .dk-track.on'));
  await page.locator('.dk-queue .dk-track', { hasText: 'Songs' }).click(); await sleep(600);
  ok('picking a track goes there and closes the list', (await page$(page)) === 'songs' && (await page.locator('.sheet').count()) === 0 && /^Track 4 of 11 · /.test(await page.textContent('#deck .dk-meta')));

  // The row of tabs: every track one tap away.
  const tabsNow = await page.$$eval('#deck .dk-tab', bs => bs.map(b => ({ id: b.dataset.section, text: b.textContent, ico: b.firstElementChild.getAttribute('aria-hidden'), label: b.getAttribute('aria-label') })));
  ok('the row under the bar has a tab for each of the eleven sections, in the menu’s order', tabsNow.map(t => t.id).join() === ALL, tabsNow.map(t => t.id).join());
  ok('…each with its icon (not read out) and its name', tabsNow.every(t => t.ico === 'true' && t.label === null) && tabsNow[4].text === '🎙️Studio log' && tabsNow[0].text === '📅Bookings', JSON.stringify(tabsNow[4]));
  ok('…in a group called “Go to a section”, with no tab or tab-list roles', (await page.getAttribute('#deck .dk-tabs', 'role')) === 'group' && (await page.getAttribute('#deck .dk-tabs', 'aria-label')) === 'Go to a section' && (await page.locator('#deck [role=tab], #deck [role=tablist]').count()) === 0);
  ok('…and only the current tab marked, for the eye and for a screen reader', (await current()) === 'songs:page:true' && (await page.locator('#deck .dk-tab.on').count()) === 1, await current());
  ok('a tab is as tall as any button (44 px or more)', (await page.$$eval('#deck .dk-tab', bs => Math.min(...bs.map(b => b.getBoundingClientRect().height)))) >= 44);
  await page.click('#deck .dk-tab[data-section="people"]'); await sleep(500);
  ok('a tap on a tab opens its section, marks it and keeps the focus on it', (await page$(page)) === 'people' && (await current()) === 'people:page:true' && (await focusOn()) === 'tab:people' && (await live()) === 'People, track 3 of 11', `${await current()} · ${await focusOn()} · ${await live()}`);
  await page.click('#deck .dk-tab[data-section="settings"]'); await sleep(500);
  ok('…the last one too, which the row scrolls to', (await page$(page)) === 'settings' && (await current()) === 'settings:page:true' && await tabInView() && (await focusOn()) === 'tab:settings');
  await page.click('#deck .dk-tab[data-section="settings"]'); await sleep(300);
  ok('a tap on the current tab changes nothing', (await page$(page)) === 'settings' && (await page.locator('.sheet').count()) === 0);
  const opened = [];
  for (const id of ALL.split(',')) {
    await page.click(`#deck .dk-tab[data-section="${id}"]`); await sleep(350);
    opened.push((await page$(page)) === id && (await current()) === `${id}:page:true` && (await page.textContent('#deck .dk-name')) === (await page.textContent(`#deck .dk-tab[data-section="${id}"] .dk-tab-name`)) && await tabInView() ? id : `(${id})`);
  }
  ok('every tab opens the section it names, and the bar and the row follow', opened.join() === ALL, opened.join());
  // A change to the data repaints the bar, never the row.
  await page.evaluate(() => { const row = document.querySelector('#deck .dk-tabs'); row.scrollLeft = 40; row.firstElementChild.dataset.kept = '1'; });
  const left40 = await rowLeft();
  await page.evaluate(() => import('./js/store.js').then(s => s.upsert('acts', { name: 'Row Stays' }))); await sleep(300);
  ok('a change to the data does not rebuild the row or move it under a finger', left40 > 0 && (await rowLeft()) === left40 && (await page.getAttribute('#deck .dk-tab', 'data-kept')) === '1', `${left40} → ${await rowLeft()}`);
  await page.click('#deck .dk-tab[data-section="acts"]'); await sleep(500);
  ok('the count under the name follows the data (4 acts)', (await page.textContent('#deck .dk-meta')) === 'Track 2 of 11 · 4 acts' && await tabInView(), await page.textContent('#deck .dk-meta'));

  // The keyboard: Tab reaches the bar, the three keys, then each tab; the arrow keys change section from anywhere.
  await page.focus('#deck .dk-now');
  const order = [await focusOn()];
  for (let k = 0; k < 5; k++) { await page.keyboard.press('Tab'); order.push(await focusOn()); }
  ok('Tab goes from the bar to ⏮, ☰, ⏭, then along the tabs', order.join() === 'dk-now,dk-prev,dk-list,dk-next,tab:bookings,tab:acts', order.join());
  await page.keyboard.press('ArrowLeft'); await sleep(500);
  ok('← on a tab goes to the section before and takes the focus along the row', (await page$(page)) === 'bookings' && (await focusOn()) === 'tab:bookings' && (await rowLeft()) === 0, `${await focusOn()} · ${await rowLeft()}`);
  await page.keyboard.press('ArrowRight'); await sleep(500);
  ok('→ goes on, the focus with it; the key does not also scroll the row sideways', (await page$(page)) === 'acts' && (await focusOn()) === 'tab:acts' && (await rowLeft()) === 0 && await tabInView(), `${await focusOn()} · ${await rowLeft()}`);
  for (let k = 0; k < 6; k++) await page.keyboard.press('ArrowRight');
  await sleep(500);
  ok('…as far along as it goes, the focused tab brought into view', (await page$(page)) === 'money' && (await focusOn()) === 'tab:money' && await tabInView() && (await rowLeft()) > 0, `${await page$(page)} · ${await focusOn()}`);
  await page.keyboard.press('ArrowLeft'); await sleep(500);
  ok('← goes back, the focus with it', (await page$(page)) === 'venues' && (await focusOn()) === 'tab:venues' && await tabInView());
  await page.focus('#deck .dk-next'); await page.keyboard.press('ArrowRight'); await sleep(500);
  ok('an arrow key from ⏭ changes section and leaves the focus on ⏭', (await page$(page)) === 'money' && (await focusOn()) === 'dk-next');
  await page.focus('#deck .dk-now'); await page.keyboard.press('ArrowLeft'); await sleep(500);
  ok('…and from the bar, on the bar', (await page$(page)) === 'venues' && (await focusOn()) === 'dk-now');
  await page.keyboard.press('Enter'); await page.waitForSelector('.sheet[aria-label="Track list"]'); await sleep(150);
  await page.keyboard.press('ArrowRight'); await sleep(300);
  ok('Enter on the bar opens the track list, and the arrow keys leave the section alone while it is open', (await page.locator('.dk-queue').count()) === 1 && (await page$(page)) === 'venues');
  await page.keyboard.press('Escape'); await page.waitForSelector('.sheet', { state: 'detached' });
  ok('…closing it puts the focus back on the bar', (await focusOn()) === 'dk-now', await focusOn());
  await page.keyboard.press('Space'); await page.waitForSelector('.sheet[aria-label="Track list"]');
  ok('Space opens it too', (await page.locator('.dk-queue .dk-track').count()) === 11);
  await page.keyboard.press('Escape'); await page.waitForSelector('.sheet', { state: 'detached' });
  // Tab along the row and back: every tab the keyboard lands on is wholly in view, also one that was only part hidden
  // (a browser left to itself does not scroll to those), and the section does not change.
  await page.focus('#deck .dk-next');
  const cutOn = await tabAlong('Tab', 11), lastTab = await focusOn(), cutBack = await tabAlong('Shift+Tab', 11);
  ok('Tab along the row, then Shift+Tab back: each tab it lands on is wholly in view', cutOn.length === 0 && cutBack.length === 0 && lastTab === 'tab:settings' && (await focusOn()) === 'dk-next' && (await page$(page)) === 'venues', `cut off going on: ${cutOn.join() || 'none'}; coming back: ${cutBack.join() || 'none'}`);
  await page.evaluate(() => window.logiGo('songs')); await sleep(500);
  await page.locator('input[type=search]').first().focus(); await page.keyboard.press('ArrowRight'); await sleep(300);
  ok('arrow keys in a search box still move the cursor, not the section', (await page$(page)) === 'songs');

  // The mouse: a press released off the bar and a hover change nothing; one wheel flick is one section.
  await page.evaluate(() => { document.activeElement.blur(); window.logiGo('bookings'); }); await sleep(500);
  r = await page.locator('#deck .dk-now').boundingBox();
  await page.mouse.move(r.x + 100, r.y + 25); await page.mouse.down(); await page.mouse.move(r.x + 100, r.y + 400, { steps: 5 }); await page.mouse.up(); await sleep(200);
  await page.mouse.move(r.x + 180, r.y + 25); await page.mouse.move(r.x + 20, r.y + 25, { steps: 8 }); await sleep(400);
  ok('a press released off the bar, then a hover across it, does not change section', (await page$(page)) === 'bookings' && (await page.locator('.sheet').count()) === 0);
  ok('the bar still lets a pinch zoom the page', /pinch-zoom/.test(await page.$eval('#deck .dk-now', el => getComputedStyle(el).touchAction)));
  await page.mouse.move(r.x + 100, r.y + 25); await sleep(500);
  for (let k = 0; k < 8; k++) { await page.mouse.wheel(0, 60); await sleep(30); }
  await sleep(500);
  ok('a wheel flick over the bar moves one section, not several', (await page$(page)) === 'acts', await page$(page));

  // It tucks away like the other two, stays after a reload, and Settings names it.
  await page.setViewportSize({ width: 420, height: 500 });
  await page.evaluate(() => window.logiGo('people')); await sleep(500); // ten people: a page long enough to scroll, whatever the month
  const tall = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await page.mouse.move(210, 400); await page.evaluate(() => window.scrollTo(0, 420)); await sleep(500);
  ok('scrolling down tucks the digital player away', tall > 500 && await page.evaluate(() => document.getElementById('deck').classList.contains('tucked')), `${tall} px to scroll`);
  await page.evaluate(() => window.scrollTo(0, 320)); await sleep(500);
  ok('…and scrolling up brings it back', await page.evaluate(() => !document.getElementById('deck').classList.contains('tucked')));
  await page.evaluate(() => window.scrollTo(0, 0)); await page.setViewportSize({ width: 420, height: 900 });
  await page.evaluate(() => window.logiGo('venues')); await sleep(500);
  await page.reload(); await page.waitForSelector('#deck .dk-next');
  ok('after a reload the digital player is still the menu, and Gdex opens on the calendar', (await page.locator('#deck .dk-player').count()) === 1 && (await page$(page)) === 'bookings' && (await page.textContent('#deck .dk-name')) === 'Bookings' && (await current()) === 'bookings:page:true' && Math.abs((await fill()) - 100 / 11) < 0.01);
  await page.evaluate(() => window.logiGo('settings')); await sleep(500);
  await page.evaluate(() => { document.getElementById('se-display').open = true; });
  await page.click('#se-display [data-pref="menu:record"]'); await sleep(300);
  const asRecord = await page.textContent('#se-display .se-sub');
  await page.click('#se-display [data-pref="menu:digital"]'); await sleep(300);
  ok('Settings → Display offers it too, and its closed line names the digital player', (await page.locator('#se-display [data-pref^="menu:"]').count()) === 3 && /digital player/i.test(await page.textContent('#se-display .se-sub')) && !/digital|tape/i.test(asRecord) && (await page.locator('#deck .dk-player').count()) === 1, `${asRecord} → ${await page.textContent('#se-display .se-sub')}`);
  const tourText = await page.evaluate(() => import('./js/tour.js').then(m => m.welcomeSteps().find(s => s.title === 'Your sections are tracks').text));
  ok('the welcome tour describes the digital player when that is the menu: ☰ and the row, no sides', /☰/.test(tourText) && /the row under it has every track one tap away/.test(tourText) && !/Side A|sleeve|cassette/.test(tourText), tourText);

  // Narrow phones with extra-large text and buttons: nothing runs off the screen, in any of the three menus.
  for (const menu of ['record', 'tape', 'digital']) {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(m => { localStorage.setItem('gdex-prefs', JSON.stringify({ menu: m, text: 'xlarge', targets: 'large' })); }, menu); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(400);
    const fit = await page.evaluate(() => { const d = document.querySelector('#deck .deck').getBoundingClientRect(); return { scroll: document.documentElement.scrollWidth <= innerWidth, next: document.querySelector('#deck .dk-next').getBoundingClientRect().right <= d.right + 1 }; });
    ok(`320px wide, extra-large text and buttons: the ${menu} menu fits and ⏭ stays inside it`, fit.scroll && fit.next, JSON.stringify(fit));
  }
  // …and on the digital player the longest name wraps inside the bar, the keys take a line of their own, and the row of tabs scrolls inside itself.
  await page.evaluate(() => window.logiGo('sessions')); await sleep(500);
  const narrow = await page.evaluate(() => {
    const q = s => document.querySelector(s).getBoundingClientRect(), d = q('#deck .deck'), row = document.querySelector('#deck .dk-tabs'), now = q('#deck .dk-now'), name = q('#deck .dk-name'), keys = q('#deck .dk-keys'), prev = q('#deck .dk-prev'), tab = q('#deck .dk-tab.on');
    return { scroll: document.documentElement.scrollWidth <= innerWidth, name: name.left >= now.left - 1 && name.right <= now.right + 1 && now.right <= d.right + 1, keysBelow: keys.top >= now.bottom - 1, keys: prev.width >= 54 && prev.height >= 54 && q('#deck .dk-next').right <= d.right + 1,
      rowScrolls: row.scrollWidth > row.clientWidth + 40 && q('#deck .dk-tabs').right <= d.right + 1 && q('#deck .dk-tabs').left >= d.left - 1, tab: tab.left >= q('#deck .dk-tabs').left - 1 && tab.right <= q('#deck .dk-tabs').right + 1 && tab.height >= 54 };
  });
  ok('320px wide, extra-large: Studio log stays inside the bar, the three keys sit under it, and the tabs scroll inside their row with the current one in view', Object.values(narrow).every(Boolean), JSON.stringify(narrow));
  await page.focus('#deck .dk-next');
  const cutNarrow = [...await tabAlong('Tab', 11), ...await tabAlong('Shift+Tab', 10)];
  ok('…and each tab the Tab key lands on is wholly in view there too', cutNarrow.length === 0 && (await focusOn()) === 'tab:bookings', `cut off: ${cutNarrow.join() || 'none'}`);
  // A small phone at the standard sizes: the bar is still one slim line.
  await page.setViewportSize({ width: 360, height: 760 });
  await page.evaluate(() => { localStorage.setItem('gdex-prefs', JSON.stringify({ menu: 'digital' })); }); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(400);
  await page.evaluate(() => window.logiGo('acts')); await sleep(500);
  const small = await page.evaluate(() => { const q = s => document.querySelector(s).getBoundingClientRect(); return { tall: q('#deck .dk-player').height, beside: q('#deck .dk-keys').top < q('#deck .dk-now').bottom, next: q('#deck .dk-next').right <= q('#deck .deck').right + 1, scroll: document.documentElement.scrollWidth <= innerWidth }; });
  ok('360px wide, standard sizes: the keys stay beside the name and the bar is at most 72 px tall', small.tall <= 72 && small.beside && small.next && small.scroll, JSON.stringify(small));
  await page.setViewportSize({ width: 420, height: 900 });

  // Mono keeps the digital player without colour, its icons too; high contrast gives the tabs the thicker edge.
  await page.evaluate(() => { localStorage.setItem('gdex-prefs', JSON.stringify({ menu: 'digital', palette: 'mono', contrast: 'high' })); }); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(300);
  const plain = await page.evaluate(() => { const css = s => getComputedStyle(document.querySelector(s)); return { art: css('#deck .dk-art').filter, ico: css('#deck .dk-tab-ico').filter, edge: css('#deck .dk-tab').borderTopWidth, tall: document.querySelector('#deck .dk-player').getBoundingClientRect().height }; });
  ok('Mono: the cover art and the tabs’ icons are grey; high contrast: the tabs have a 2 px edge, and the bar is still slim', plain.art === 'grayscale(1)' && plain.ico === 'grayscale(1)' && plain.edge === '2px' && plain.tall <= 72, JSON.stringify(plain));
  // The two small lines of the bar read at 4.5:1 or better against the deck, in the light and the dark of the first theme.
  const smallText = {};
  for (const scheme of ['light', 'dark']) {
    await page.evaluate(sc => { localStorage.setItem('gdex-prefs', JSON.stringify({ menu: 'digital', scheme: sc })); }, scheme); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(300);
    smallText[scheme] = await page.evaluate(() => {
      const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
      const lum = colour => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1, 1); ctx.fillStyle = colour; ctx.fillRect(0, 0, 1, 1); const [r, g, b] = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const back = lum(getComputedStyle(document.querySelector('#deck .deck')).backgroundColor);
      const ratio = sel => { const a = lum(getComputedStyle(document.querySelector(sel)).color); return Math.round((Math.max(a, back) + 0.05) / (Math.min(a, back) + 0.05) * 100) / 100; };
      return { eyebrow: ratio('#deck .dk-eyebrow'), meta: ratio('#deck .dk-meta'), name: ratio('#deck .dk-name'), art: getComputedStyle(document.querySelector('#deck .dk-art')).filter };
    });
  }
  ok('“Now playing” and the track line read at 4.5:1 or better against the deck, light and dark', ['light', 'dark'].every(sc => smallText[sc].eyebrow >= 4.5 && smallText[sc].meta >= 4.5 && smallText[sc].name > smallText[sc].meta), JSON.stringify(smallText));
  ok('…and in colour the art is not greyed', smallText.light.art === 'none' && smallText.dark.art === 'none');
  // The line: the theme's accent on the line colour. With high contrast the line colour is a strong grey that the accent
  // sinks into, so there the line is drawn in the text colour on a quiet track: 3:1 or better against it, light and dark.
  const lineOf = async prefs => {
    await page.evaluate(p => { localStorage.setItem('gdex-prefs', JSON.stringify(p)); }, { menu: 'digital', palette: 'ocean', ...prefs }); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(300);
    return page.evaluate(() => {
      const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
      const lum = colour => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1, 1); ctx.fillStyle = colour; ctx.fillRect(0, 0, 1, 1); const [r, g, b] = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const css = s => getComputedStyle(document.querySelector(s)), fill = css('#deck .dk-fill').backgroundColor, a = lum(fill), b = lum(css('#deck .dk-progress').backgroundColor);
      return { ratio: Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100, accent: fill === css('#deck .dk-tab.on').backgroundColor };
    });
  };
  const line = { plain: await lineOf({ scheme: 'light' }), light: await lineOf({ scheme: 'light', contrast: 'high' }), dark: await lineOf({ scheme: 'dark', contrast: 'high' }) };
  ok('the line is the accent; with high contrast it stands out from its track by 3:1 or better, light and dark', line.plain.accent && line.light.ratio >= 3 && line.dark.ratio >= 3, JSON.stringify(line));
  await page.evaluate(() => { localStorage.setItem('gdex-prefs', JSON.stringify({ menu: 'digital' })); }); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(300);

  // A menu of one track (no role has one, but a menu can be Settings alone): Track 1 of 1, the line full, one tab, and
  // ⏮ ⏭ go nowhere. Drawn beside the real menu, last in this spec because a deck listens to the whole page.
  const one = await page.evaluate(() => import('./js/deck.js').then(m => {
    const root = document.createElement('nav'); root.id = 'one-track'; document.body.append(root);
    let moves = 0;
    const deck = m.createDeck(root, [{ id: 'settings', label: 'Settings', icon: '⚙️' }], { onSelect: () => { moves++; } });
    const q = s => root.querySelector(s);
    q('.dk-next').click(); q('.dk-prev').click(); q('.dk-tab').click();
    const out = { meta: q('.dk-meta').textContent, fill: q('.dk-fill').style.width, tabs: root.querySelectorAll('.dk-tab').length, current: q('.dk-tab').getAttribute('aria-current'), label: q('.dk-now').getAttribute('aria-label'), next: q('.dk-next').getAttribute('aria-label'), moves, index: deck.index };
    root.remove();
    return out;
  }));
  ok('a menu of one track: Track 1 of 1, the line full, one tab, and ⏮ ⏭ change nothing', one.meta === 'Track 1 of 1' && one.fill === '100%' && one.tabs === 1 && one.current === 'page' && one.moves === 0 && one.index === 0 && one.label === 'Now playing track 1 of 1, Settings. Open the track list to pick any section', JSON.stringify(one));

  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL deck crashed — ' + e.message); process.exit(1); });
