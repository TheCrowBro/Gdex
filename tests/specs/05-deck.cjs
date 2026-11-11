// The section menu: a record player (the default) or a tape deck (Aa → Section menu). Each section is a track on Side A
// or B; ⏮ ⏭, a swipe, the arrow keys and the list (the sleeve, or the cassette's track list) all change section.
const { open, ok, sleep } = require('../helpers.cjs');
const page$ = page => page.evaluate(() => window.logiPage());
(async () => {
  const { browser, page, errors } = await open({ sample: true });

  /* ---------------- the record player ---------------- */
  ok('the record player is the default menu', (await page.locator('#deck .dk-record').count()) === 1 && (await page.locator('#deck .dk-cassette').count()) === 0);
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
  ok('after a reload the tape deck is still the menu, on the section last open', (await page.locator('#deck .dk-cassette').count()) === 1 && (await page$(page)) === 'venues');

  /* ---------------- motion ---------------- */
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); await page.waitForSelector('#deck .dk-next');
  ok('with reduced motion asked for, the reels do not animate', (await page.$eval('#deck .dk-reel', el => getComputedStyle(el).transitionDuration)) === '0s');

  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL deck crashed — ' + e.message); process.exit(1); });
