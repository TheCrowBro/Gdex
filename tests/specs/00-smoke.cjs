// Every section opens without errors, with and without the sample, and the page has no console errors.
const { open, ok, sleep, go } = require('../helpers.cjs');
(async () => {
  const { browser, page, errors } = await open();
  const ids = await page.evaluate(() => window.tourbookPages().map(p => p.id));
  ok('there are twelve sections', ids.length === 12, ids.join(', '));
  for (const id of ids) { await go(page, id); const head = await page.locator('#page .page-card').count(); ok(`${id} opens on an empty database`, head === 1); }
  // ? on a page whose boxes need data first still says something (Money on an empty device).
  await go(page, 'money'); await page.click('#helpBtn'); await sleep(900);
  ok('? on the empty Money page shows its walkthrough', (await page.locator('.tour-card').count()) === 1, await page.locator('.tour-card').count() + ' cards');
  const focusAt = () => page.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? 'body' : a.id || a.className; });
  await page.keyboard.press('Escape'); await sleep(200);
  ok('…and when it ends, the focus is back on ?, not lost on the page body', (await focusAt()) === 'helpBtn', await focusAt());
  await page.click('#helpBtn'); await sleep(900);
  for (let i = 0; i < 12 && await page.locator('.tour-card').count(); i++) { await page.click('.tour-actions .btn.primary'); await sleep(450); }
  ok('…also when it ends with Done', (await page.locator('.tour-card').count()) === 0 && (await focusAt()) === 'helpBtn', await focusAt());
  // ? inside a panel that has no walkthrough of its own still explains it.
  await page.evaluate(() => import('./js/util.js').then(u => u.sheet('A panel with no walkthrough', u.h('p', null, 'Hello'))));
  await page.click('.sheet .sheet-help'); await sleep(600);
  ok('? in a panel without its own walkthrough shows a general one', (await page.locator('.tour-card').count()) === 1);
  await page.locator('.tour-actions button', { hasText: 'Skip' }).click(); await sleep(200);
  ok('…and when it ends, the focus is back on the panel’s ?', /sheet-help/.test(await focusAt()), await focusAt());
  await page.keyboard.press('Escape'); await sleep(200);
  await page.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(200);
  for (const id of ids) { await go(page, id); ok(`${id} opens with the sample loaded`, (await page.locator('#page .page-card').count()) === 1); }
  const counts = await page.evaluate(() => import('./js/store.js').then(s => Object.fromEntries(s.COLLECTIONS.map(c => [c, s.db[c].length]))));
  ok('the sample fills every list', Object.values(counts).every(n => n > 0), JSON.stringify(counts));
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL smoke crashed — ' + e.message); process.exit(1); });
