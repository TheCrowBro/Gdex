// Roles: the first-run question (producer, manager, band, solo artist, scout, audiophile, or everything), each role's
// section menu and start page, the welcome tour that follows it, Settings → Your role to swap, bonus tracks for the
// sections off the menu (on the sleeve, and from any link), the booking boxes a role hides, and that nothing is lost.
const { chromium } = require('playwright');
const { open, ok, sleep, go, topSheet, BASE } = require('../helpers.cjs');

const roles = page => page.evaluate(() => import('./js/roles.js').then(m => JSON.parse(JSON.stringify({ roles: m.ROLES, all: m.EVERYTHING, menus: Object.fromEntries([...m.ROLES, m.EVERYTHING].map(r => [r.id, m.menuSections(r)])) }))));
const menuIds = page => page.evaluate(() => [...document.querySelectorAll('.dk-sheet .dk-sides .dk-track')].map(b => b.dataset.section));
const sleeve = async page => { await page.click('#deck .dk-list'); await page.waitForSelector('.dk-sheet'); const ids = await menuIds(page); const bonus = await page.evaluate(() => [...document.querySelectorAll('.dk-sheet .dk-bonus .dk-track')].map(b => b.dataset.section)); await page.keyboard.press('Escape'); await page.waitForSelector('.dk-sheet', { state: 'detached' }); return { ids, bonus }; };

(async () => {
  /* ---------------- the first open ---------------- */
  {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE);
    await page.waitForSelector('.sheet[aria-label="Who’s using Gdex?"]', { timeout: 8000 });
    const R = await roles(page);
    const cards = await page.$$eval('.rp-ask .rp-card', bs => bs.map(b => b.dataset.role));
    ok('the first open asks who is using Gdex, with the six roles', JSON.stringify(cards) === JSON.stringify(['producer', 'manager', 'band', 'solo', 'scout', 'audiophile']), cards.join(','));
    ok('…and a way to have everything', await page.locator('.rp-ask .rp-all').isVisible());
    ok('each role shows the menu it gives', /Studio log/.test(await page.textContent('.rp-card[data-role="producer"] .rp-menu')));
    ok('the first role has the focus', await page.evaluate(() => document.activeElement && document.activeElement.dataset.role === 'producer'));
    ok('the welcome tour waits for the answer', (await page.locator('.tour-card').count()) === 0);
    await page.click('.rp-card[data-role="producer"]');
    await page.waitForSelector('.tour-card');
    const prod = R.roles.find(r => r.id === 'producer');
    ok('picking a role opens its start page', (await page.evaluate(() => window.logiPage())) === prod.start);
    ok('the role is kept on this device', (await page.evaluate(() => localStorage.getItem('gdex-role'))) === 'producer');
    const titles = [];
    for (let i = 0; i < 14 && await page.locator('.tour-card').count(); i++) { titles.push(await page.textContent('#tour-title')); await page.click('.tour-actions .btn.primary'); await sleep(900); }
    const menu = R.menus.producer.filter(id => id !== 'settings');
    ok('then the welcome tour runs through the role’s own sections', titles[0] === 'Welcome to Gdex' && titles.includes('Your sections are tracks') && titles[titles.length - 1] === 'Settings', titles.join(' › '));
    const stops = titles.slice(3, -1);
    ok('…in its menu order, and only sections on its menu', stops.length > 0 && stops.length <= 5, stops.join(', '));
    const s = await sleeve(page);
    ok('the menu is the producer’s', JSON.stringify(s.ids) === JSON.stringify(R.menus.producer), s.ids.join(','));
    ok('the sections it leaves off are bonus tracks', s.bonus.length === 11 - R.menus.producer.length && s.bonus.every(id => !R.menus.producer.includes(id)), s.bonus.join(','));
    // the profile's "What you do" started as the role
    ok('the tour’s details card filled What you do with the role', (await page.evaluate(() => import('./js/store.js').then(m => m.db.profile.role))) === 'Producer');
    await page.reload();
    await page.waitForSelector('#deck .dk-next');
    await sleep(800);
    ok('after a reload: no question, no tour, the same menu', (await page.locator('.sheet, .tour-card').count()) === 0 && JSON.stringify((await sleeve(page)).ids) === JSON.stringify(R.menus.producer));
    ok('no errors in the console on the first open', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- closing the question ---------------- */
  {
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' })).newPage();
    await page.goto(BASE);
    await page.waitForSelector('.rp-ask');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.tour-card');
    ok('closing the question still runs the welcome tour', (await page.textContent('#tour-title')) === 'Welcome to Gdex');
    await page.click('.tour-actions .btn.ghost');
    const s = await sleeve(page);
    ok('…with every section on the menu', s.ids.length === 11 && s.bonus.length === 0, s.ids.join(','));
    ok('…and no role saved', (await page.evaluate(() => localStorage.getItem('gdex-role'))) === null);
    await browser.close();
  }

  /* ---------------- Settings → Your role, bonus tracks, booking boxes ---------------- */
  const { browser, page, errors } = await open({ sample: true, tab: 'settings' });
  const R = await roles(page);
  ok('before a role is chosen, every section is on the menu', JSON.stringify((await sleeve(page)).ids) === JSON.stringify(R.menus.all));
  ok('Your role is the first part of Settings', (await page.$$eval('.se-sec', d => d.map(x => x.dataset.s)))[0] === 'role');
  ok('its line says no role is chosen', /Not chosen/.test(await page.textContent('#se-role summary')));
  await page.click('#se-role summary');
  await page.waitForSelector('#se-role .rp-card');
  const radios = await page.$$eval('#se-role .rp-card', bs => bs.map(b => [b.dataset.role, b.getAttribute('role'), b.getAttribute('aria-checked')]));
  ok('it lists the six roles and Everything as one choice', radios.length === 7 && radios.every(r => r[1] === 'radio') && radios.find(r => r[0] === 'all')[2] === 'true', JSON.stringify(radios));
  ok('…in a radio group', (await page.locator('#se-role [role=radiogroup]').count()) === 1);

  for (const id of ['manager', 'band', 'solo', 'scout', 'audiophile', 'producer']) {
    await page.click(`#se-role .rp-card[data-role="${id}"]`);
    await sleep(500);
    ok(`${id}: the choice is checked and keeps the focus`, (await page.getAttribute(`#se-role .rp-card[data-role="${id}"]`, 'aria-checked')) === 'true' && await page.evaluate(x => document.activeElement && document.activeElement.dataset.role === x, id));
    const s = await sleeve(page);
    ok(`${id}: the menu changes at once, and you stay on Settings`, JSON.stringify(s.ids) === JSON.stringify(R.menus[id]) && (await page.evaluate(() => window.logiPage())) === 'settings', s.ids.join(','));
    ok(`${id}: the rest are bonus tracks`, s.bonus.length + s.ids.length === 11);
    ok(`${id}: Settings is last on the menu`, s.ids[s.ids.length - 1] === 'settings');
  }
  ok('the line says the role and its menu', new RegExp(`Producer · ${R.menus.producer.length} sections`).test(await page.textContent('#se-role summary')), await page.textContent('#se-role summary'));

  /* a section off the menu, from a link and from the sleeve */
  await page.click('#se-role .rp-card[data-role="audiophile"]');
  await sleep(400);
  const aud = R.roles.find(r => r.id === 'audiophile');
  const off = ['money', 'insurance', 'songs', 'sessions', 'people', 'backline', 'tools', 'venues', 'acts', 'bookings'].find(id => !R.menus.audiophile.includes(id));
  await go(page, off);
  ok('a link to a section off the menu opens it', (await page.evaluate(() => window.logiPage())) === off);
  ok('…as the bonus track on the record', /^Bonus track/.test(await page.textContent('#deck .dk-meta')), await page.textContent('#deck .dk-meta'));
  await page.click('#deck .dk-list');
  await page.waitForSelector('.dk-sheet');
  ok('the sleeve marks it as the bonus track playing', (await page.getAttribute('.dk-bonus .dk-track.on', 'data-section')) === off);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.dk-sheet', { state: 'detached' });
  await page.click('#deck .dk-next');
  await sleep(600);
  ok('moving on puts it back on the sleeve', (await page.evaluate(() => window.logiPage())) === R.menus.audiophile[0] && !/Bonus/.test(await page.textContent('#deck .dk-meta')));
  await page.click('#deck .dk-list');
  await page.waitForSelector('.dk-sheet');
  await page.click(`.dk-bonus [data-section="${off}"]`);
  await sleep(700);
  ok('a bonus track opens from the sleeve', (await page.evaluate(() => window.logiPage())) === off);
  const off2 = ['money', 'insurance', 'songs', 'sessions', 'backline'].find(id => id !== off && !R.menus.audiophile.includes(id));
  await go(page, off2);
  ok('one bonus track gives way to another', (await page.evaluate(() => window.logiPage())) === off2 && (await sleeve(page)).ids.length === R.menus.audiophile.length);

  /* booking boxes */
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('s-show1')));
  await page.waitForSelector('.bk-page');
  await sleep(400);
  const before = await page.evaluate(() => import('./js/store.js').then(m => JSON.stringify(m.byId('bookings', 's-show1'))));
  const blocks = () => page.$$eval('.bk-blocks [id^="blk-"]', els => els.map(e => e.id.slice(4)));
  const audBlocks = await blocks();
  ok('an audiophile’s show has none of the boxes the role hides', aud.hide.every(id => !audBlocks.includes(id)), audBlocks.join(','));
  await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('manager')));
  await sleep(500);
  const mgrBlocks = await blocks();
  ok('a manager’s show has the deal and settlement again', mgrBlocks.includes('deal') && mgrBlocks.includes('settlement'), mgrBlocks.join(','));
  ok('changing role keeps the page you are on', (await page.evaluate(() => window.logiPage())) === 'bookings' && (await page.locator('.bk-page').count()) === 1);
  ok('nothing in the data changes with the role', (await page.evaluate(() => import('./js/store.js').then(m => JSON.stringify(m.byId('bookings', 's-show1'))))) === before);

  /* + New starts with the role's usual kind */
  await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('producer')));
  await sleep(300);
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({})));
  await page.waitForSelector('.bk-kinds');
  ok('a producer’s new booking offers a studio session first', (await page.$$eval('.bk-kinds .bk-kind', b => b.map(x => x.dataset.kind)))[0] === 'session');
  await page.keyboard.press('Escape');
  await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('band')));
  await sleep(300);
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.newBooking({})));
  await page.waitForSelector('.bk-kinds');
  ok('a band’s new booking offers a show first', (await page.$$eval('.bk-kinds .bk-kind', b => b.map(x => x.dataset.kind)))[0] === 'show');
  await page.keyboard.press('Escape');

  /* names follow the role */
  for (const r of R.roles) {
    for (const [id, name] of Object.entries(r.names || {})) {
      await page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), r.id);
      await go(page, id);
      await sleep(200);
      const head = await page.textContent('#page .page-head h1').catch(() => '');
      ok(`${r.label}: ${id} is called ${name} on the menu and the page`, (await page.textContent('#deck .dk-name')) === name && (head === name || id === 'bookings'), head);
    }
  }

  /* the role stays after a reload; Everything brings every section back */
  await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('scout')));
  await page.reload();
  await page.waitForSelector('#deck .dk-next');
  await sleep(600);
  ok('the role stays after a reload', JSON.stringify((await sleeve(page)).ids) === JSON.stringify(R.menus.scout));
  await go(page, 'settings');
  await page.evaluate(() => { document.getElementById('se-role').open = true; });
  await page.waitForSelector('#se-role .rp-card');
  await page.click('#se-role .rp-card[data-role="all"]');
  await sleep(400);
  ok('Everything puts every section back on the menu', (await sleeve(page)).ids.length === 11);
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL roles spec crashed — ' + e.message); process.exit(1); });
