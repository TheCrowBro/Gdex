// A sheet's dim backdrop (js/util.js sheet()). A tap on it closes the sheet on the click, never on the press: closed on
// the press, the rest of the tap (on a phone, all of it) landed on the page under it, so the strip above a tall sheet
// pressed the top bar's ?, Aa or Backup, and the focus ended on the page's body. Now the click stops at the backdrop and
// the focus goes back where Escape and ✕ put it. A press that starts in the sheet and ends on the backdrop, or the other
// way round, closes nothing; a sheet that does not close on its backdrop (a form) keeps the focus where it was.
// Each case runs with a finger (touch emulation, page.touchscreen.tap) and with a mouse, on the search's results, the
// track list, the Aa sheet and a form.
const { open, ok, sleep, go } = require('../helpers.cjs');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function run(how) {
  const touch = how === 'touch';
  // The tape deck, whose list is called the track list.
  const { browser, page, errors } = await open({ sample: true, touch, init: () => { try { localStorage.setItem('tourbook-prefs', JSON.stringify({ menu: 'tape' })); } catch (e) { /* ignore */ } } });
  // Every click that reaches the page (#app) is noted.
  await page.evaluate(() => { window.__hits = []; document.getElementById('app').addEventListener('click', e => window.__hits.push(e.target.closest('[id]')?.id || e.target.tagName), true); });
  const tap = (x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const centre = async sel => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const tapOn = async sel => { const c = await centre(sel); await tap(c.x, c.y); };
  const focusKey = () => page.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? 'BODY' : a.id || a.getAttribute('aria-label') || a.className; });
  const inSheet = () => page.evaluate(() => { const s = [...document.querySelectorAll('.sheet')].pop(); return !!s && s.contains(document.activeElement); });
  const state = () => page.evaluate(() => ({ sheets: [...document.querySelectorAll('.sheet')].map(s => s.getAttribute('aria-label')), tour: !!document.querySelector('.tour'), hits: window.__hits.splice(0) }));
  // The middle of a top-bar button, which a tall sheet leaves under its dim backdrop: what is there must be that backdrop.
  // The clicks noted so far (the tap that opened the sheet) are forgotten.
  const over = async sel => {
    const c = await centre(sel);
    await page.evaluate(() => { window.__hits = []; });
    return { ...c, back: await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y), backs = document.querySelectorAll('.sheet-back'); return !!backs.length && e === backs[backs.length - 1]; }, [c.x, c.y]) };
  };
  // Whatever a failing check left open goes, so the next check starts from a clear page.
  const clear = async () => {
    for (let i = 0; i < 4 && await page.evaluate(() => !!document.querySelector('.sheet-back, .tour')); i++) { await page.keyboard.press('Escape'); await sleep(250); }
    await page.evaluate(() => { window.__hits = []; });
  };

  /* ---------------- the search's results ---------------- */
  await tapOn('#srch-box'); await page.keyboard.type('chelsea'); await page.waitForSelector('.srch-sheet'); await sleep(300);
  await page.keyboard.press('Escape'); await sleep(250);
  const escSearch = await focusKey();
  await clear();
  await tapOn('#srch-box'); await page.waitForSelector('.srch-sheet'); await sleep(300); // a tap on the box that holds words brings the results back
  let p = await over('#helpBtn');
  ok(`${how}: the search's results leave ? under their dim backdrop`, p.back);
  await tap(p.x, p.y); await sleep(400);
  let st = await state(), f = await focusKey();
  ok(`${how}: a tap on the backdrop above the search's results closes them, and nothing under it is pressed (no tutorial, no tour)`, same(st, { sheets: [], tour: false, hits: [] }), JSON.stringify(st));
  ok(`${how}: …the focus goes back to the box at the top of the page, as Escape puts it`, f === 'srch-box' && escSearch === 'srch-box', `${f} (Escape: ${escSearch})`);
  if (touch) ok('touch: …with the phone’s keyboard kept down (inputmode none), as after ✕', (await page.getAttribute('#srch-box', 'inputmode')) === 'none');
  await clear();

  /* ---------------- the track list ---------------- */
  await tapOn('#deck .dk-list'); await page.waitForSelector('.sheet[aria-label="Track list"]'); await sleep(300);
  await page.keyboard.press('Escape'); await sleep(250);
  const escList = await focusKey();
  await clear();
  await tapOn('#deck .dk-list'); await page.waitForSelector('.sheet[aria-label="Track list"]'); await sleep(300);
  p = await over('#displayBtn');
  ok(`${how}: the track list leaves Aa under its dim backdrop`, p.back);
  await tap(p.x, p.y); await sleep(400);
  st = await state(); f = await focusKey();
  ok(`${how}: a tap on the backdrop above the track list closes it, and Aa under it is not pressed`, same(st, { sheets: [], tour: false, hits: [] }), JSON.stringify(st));
  ok(`${how}: …the focus goes back to the list button, as Escape puts it`, f === escList && /Track list/.test(f), `${f} (Escape: ${escList})`);
  ok(`${how}: …on the same section`, (await page.evaluate(() => window.logiPage())) === 'bookings');
  await clear();

  /* ---------------- the Aa sheet ---------------- */
  await tapOn('#displayBtn'); await page.waitForSelector('.sheet[aria-label="Display & accessibility"]'); await sleep(300);
  await page.keyboard.press('Escape'); await sleep(250);
  const escAa = await focusKey();
  await clear();
  await tapOn('#displayBtn'); await page.waitForSelector('.sheet[aria-label="Display & accessibility"]'); await sleep(300);
  p = await over('#cloudBtn');
  ok(`${how}: the Aa sheet leaves Backup under its dim backdrop`, p.back);
  await tap(p.x, p.y); await sleep(400);
  st = await state(); f = await focusKey();
  ok(`${how}: a tap on the backdrop above the Aa sheet closes it, and Backup under it is not pressed`, same(st, { sheets: [], tour: false, hits: [] }), JSON.stringify(st));
  ok(`${how}: …the focus goes back to Aa, as Escape puts it`, f === 'displayBtn' && escAa === 'displayBtn', `${f} (Escape: ${escAa})`);
  await clear();

  // A press that starts in the sheet and ends on the backdrop (a drag, a scroll that went too far) closes nothing, nor
  // one that starts on the backdrop and ends in the sheet.
  if (!touch) {
    await page.click('#displayBtn'); await page.waitForSelector('.sheet[aria-label="Display & accessibility"]'); await sleep(300);
    const head = await centre('.sheet .sheet-head h2'); p = await over('#cloudBtn');
    await page.mouse.move(head.x, head.y); await page.mouse.down(); await page.mouse.move(p.x, p.y, { steps: 5 }); await page.mouse.up(); await sleep(300);
    st = await state();
    ok('mouse: a press in the sheet that ends on its backdrop closes nothing and presses nothing', same(st, { sheets: ['Display & accessibility'], tour: false, hits: [] }), JSON.stringify(st));
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(head.x, head.y, { steps: 5 }); await page.mouse.up(); await sleep(300);
    st = await state();
    ok('mouse: …nor one that starts on the backdrop and ends in the sheet', same(st, { sheets: ['Display & accessibility'], tour: false, hits: [] }), JSON.stringify(st));
    await clear();
  }

  /* ---------------- a form: its backdrop does not close it ---------------- */
  await go(page, 'people');
  await tapOn('#pp-add'); await page.waitForSelector('.sheet form'); await sleep(400);
  const title = await page.getAttribute('.sheet:has(form)', 'aria-label'), before = await focusKey();
  p = await over('#helpBtn');
  ok(`${how}: a form leaves ? under its dim backdrop`, p.back);
  await tap(p.x, p.y); await sleep(400);
  st = await state(); f = await focusKey();
  ok(`${how}: a tap on the backdrop above a form keeps it open, and ? under it is not pressed`, same(st, { sheets: [title], tour: false, hits: [] }), JSON.stringify(st));
  ok(`${how}: …and keeps the focus in the form, where it was`, f === before && await inSheet(), `${f} (before: ${before})`);
  await clear();

  /* ---------------- a sheet that opened with nothing focused ---------------- */
  // As Tourbook opens, a sheet can come up before anything has the focus (the terms, the free days over): Escape, ✕ and the
  // backdrop each leave the focus on the page, not nowhere.
  for (const way of ['Escape', '✕', 'backdrop']) {
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); return import('./js/util.js').then(u => { u.sheet('Opened with nothing focused', u.h('p', null, 'A sheet put up as Tourbook opens.')); }); }); await sleep(300);
    if (way === 'Escape') await page.keyboard.press('Escape');
    else if (way === '✕') await page.click('.sheet[aria-label="Opened with nothing focused"] .sheet-head [aria-label="Close"]');
    else await tap(6, 12);
    await sleep(300);
    const left = await page.evaluate(() => ({ sheets: document.querySelectorAll('.sheet').length, focus: (document.activeElement || {}).id || (document.activeElement || {}).tagName }));
    ok(`${how}: a sheet opened with nothing focused, closed by ${way}: the focus is on the page, not nowhere`, left.sheets === 0 && left.focus === 'page', JSON.stringify(left));
    await clear();
  }

  ok(`${how}: no errors in the console`, errors.length === 0, errors.join(' | '));
  await browser.close();
}

(async () => {
  await run('touch');
  await run('mouse');
})().catch(e => { console.log('FAIL 08-sheets crashed — ' + e.message); process.exit(1); });
