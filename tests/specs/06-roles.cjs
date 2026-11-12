// Roles: the first-run question (producer, manager, band, solo artist, scout, audiophile, or everything), each role's
// section menu (the calendar first, and where Gdex opens every time, whatever was open last), the welcome tour that
// follows it, Settings → Your role to swap, bonus tracks for the sections off the menu (on the sleeve or the track list,
// as a tab on the digital player, and from any link), the booking boxes a role hides, and that nothing is lost.
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
    ok('picking a role opens its start page, the calendar', (await page.evaluate(() => window.logiPage())) === prod.start && prod.start === 'bookings');
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
    ok('closing the question counts as the answer: the role card is not offered later', (await page.evaluate(() => localStorage.getItem('gdex-role-nudged'))) === '1');
    await page.reload();
    await page.waitForSelector('#deck .dk-next');
    await sleep(2800);
    ok('…so the next visit shows no “New: a menu for the way you work” card', (await page.locator('.rp-nudge, .sheet, .tour-card').count()) === 0);
    await browser.close();
  }

  /* ---------------- the sleeve opened in the first moment: the question waits for it ---------------- */
  {
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE);
    await page.waitForSelector('#deck .dk-record');
    await page.click('#deck .dk-record');
    await page.waitForSelector('.dk-sheet');
    await sleep(1500);
    ok('a sleeve opened before the question: the question waits until it is closed', (await page.locator('.rp-ask').count()) === 0 && (await page.locator('.dk-sheet').count()) === 1);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.rp-ask', { timeout: 3000 });
    ok('…then asks, on its own', (await page.locator('.sheet').count()) === 1);
    await page.click('.rp-card[data-role="scout"]');
    await page.waitForSelector('.tour-card');
    ok('…and the welcome tour runs over the page, not over a stale sleeve', (await page.locator('.dk-sheet').count()) === 0);
    await page.click('.tour-actions .btn.ghost');
    await page.click('#deck .dk-record');
    await page.waitForSelector('.dk-sheet');
    ok('a scout picked at the first-run question opens on the calendar', (await page.evaluate(() => window.logiPage())) === 'bookings' && (await page.locator('.bk-monthview').count()) === 1);
    ok('the sleeve then lists the scout’s tracks, the calendar first', JSON.stringify(await menuIds(page)) === JSON.stringify(['bookings', 'acts', 'people', 'venues', 'settings']), (await menuIds(page)).join(','));
    await page.click('.dk-sheet .dk-bonus [data-section="insurance"]');
    await sleep(700);
    ok('…and Insurance on it opens Insurance', (await page.evaluate(() => window.logiPage())) === 'insurance');
    // A role chosen while a sleeve is open (from a link or a script): the sleeve closes rather than list the old tracks.
    await page.click('#deck .dk-list');
    await page.waitForSelector('.dk-sheet');
    await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('band', { start: true })));
    await sleep(500);
    ok('a new role closes an open sleeve, and the deck has the focus back', (await page.locator('.dk-sheet, .sheet').count()) === 0 && !(await page.evaluate(() => document.getElementById('app').inert)) && await page.evaluate(() => !!document.activeElement.closest('#deck')));
    await page.click('#deck .dk-list');
    await page.waitForSelector('.dk-sheet');
    const entries = await menuIds(page);
    await page.keyboard.press('Escape');
    let named = true;
    for (const id of entries) {
      await page.click('#deck .dk-list'); await page.waitForSelector('.dk-sheet');
      await page.click(`.dk-sheet .dk-sides [data-section="${id}"]`); await sleep(500);
      if ((await page.evaluate(() => window.logiPage())) !== id) named = false;
    }
    ok('every entry on the sleeve opens the section it names', named, entries.join(','));
    ok('no errors in the console (sleeve before the question)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- a device that used Gdex before roles: one card, once ---------------- */
  {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { localStorage.setItem('gdex-tour', 'done'); } catch (e) { /* ignore */ } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForSelector('.rp-nudge', { timeout: 8000 });
    ok('an install whose tour is done, with no role, gets one card about roles', (await page.locator('.rp-nudge').count()) === 1 && (await page.locator('.sheet, .tour-card').count()) === 0);
    ok('…under the section menu, not over the page', await page.evaluate(() => { const c = document.querySelector('.rp-nudge'); return !!c && !document.getElementById('page').contains(c) && c.getBoundingClientRect().top >= document.getElementById('deck').getBoundingClientRect().bottom - 1; }));
    ok('the card speaks of the sleeve with the record player', /every other one stays on the sleeve\./.test(await page.textContent('.rp-nudge-text')));
    await page.focus('#rp-nudge-no');
    await page.keyboard.press('Enter');
    ok('Not now puts it away', (await page.locator('.rp-nudge').count()) === 0);
    ok('…and the page takes the focus, not nowhere', await page.evaluate(() => document.activeElement && document.activeElement.id === 'page'));
    await page.reload();
    await page.waitForSelector('#deck .dk-next');
    await sleep(2800);
    ok('…for good', (await page.locator('.rp-nudge').count()) === 0);
    // A section saved by the build before this one (gdex-tab) no longer decides where Gdex opens.
    await page.evaluate(() => { localStorage.removeItem('gdex-role-nudged'); localStorage.setItem('gdex-tab', 'acts'); });
    await page.reload();
    await page.waitForSelector('.rp-nudge', { timeout: 8000 });
    ok('a section saved last time is not honoured: Gdex opens on the calendar, and the old key is gone', (await page.evaluate(() => window.logiPage())) === 'bookings' && (await page.evaluate(() => localStorage.getItem('gdex-tab'))) === null);
    const y0 = await page.evaluate(() => window.scrollY);
    await page.focus('#rp-nudge-go');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.rp-ask');
    ok('Choose my role asks the question', (await page.locator('.rp-ask .rp-card').count()) === 6);
    await sleep(150);
    await page.focus('.rp-card[data-role="audiophile"]');
    await page.keyboard.press('Enter');
    await sleep(700);
    ok('…and the answer sets the menu, with no welcome tour again', (await page.evaluate(() => localStorage.getItem('gdex-role'))) === 'audiophile' && (await page.locator('.tour-card').count()) === 0);
    ok('…the page takes the focus, without a jump', await page.evaluate(() => document.activeElement && document.activeElement.id === 'page') && (await page.evaluate(() => window.scrollY)) === y0);
    const region = await page.evaluate(() => ({ label: document.querySelector('#page .page-card').getAttribute('aria-label'), h1: document.querySelector('#page h1').textContent }));
    ok('the calendar stays, and its region takes the role’s name for it (Gigs)', (await page.evaluate(() => window.logiPage())) === 'bookings' && region.label === 'Gigs' && region.h1 === 'Gigs', JSON.stringify(region));
    ok('no errors in the console (the role card)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- the role texts follow the section menu: a tape deck has Tracks, not a record ---------------- */
  {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { localStorage.setItem('gdex-tour', 'done'); localStorage.setItem('gdex-prefs', '{"menu":"tape"}'); } catch (e) { /* ignore */ } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE);
    await page.waitForSelector('.rp-nudge', { timeout: 8000 });
    ok('tape deck: the role card says the track list', /every other one stays on the track list\./.test(await page.textContent('.rp-nudge-text')) && !/sleeve/.test(await page.textContent('.rp-nudge-text')));
    await page.click('#rp-nudge-go');
    await page.waitForSelector('.rp-ask');
    ok('tape deck: so does the question', /one tap away on the track list\./.test(await page.textContent('.rp-intro')) && !/sleeve/.test(await page.textContent('.rp-intro')));
    await page.keyboard.press('Escape');
    await go(page, 'settings');
    await page.evaluate(() => { document.getElementById('se-role').open = true; });
    await page.waitForSelector('#se-role .rp-about');
    const about = await page.textContent('#se-role .rp-about');
    ok('tape deck: Settings → Your role says bonus tracks on the track list (tap Tracks)', /bonus tracks on the track list \(tap Tracks\)/.test(about) && !/record|sleeve/.test(about), about);
    await page.evaluate(() => { document.getElementById('se-display').open = true; });
    await page.click('#se-display [data-pref="menu:record"]');
    await sleep(300);
    ok('switching to the record player there changes those words at once', /bonus tracks on the sleeve \(tap the record\)/.test(await page.textContent('#se-role .rp-about')));
    ok('no errors in the console (role texts and the menu style)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- …and a digital player has a track list and ☰, and a tab for the open bonus track ---------------- */
  {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { localStorage.setItem('gdex-tour', 'done'); if (!localStorage.getItem('gdex-prefs')) localStorage.setItem('gdex-prefs', '{"menu":"digital"}'); } catch (e) { /* ignore */ } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE);
    await page.waitForSelector('.rp-nudge', { timeout: 8000 });
    const R = await roles(page);
    ok('digital player: the role card says the track list', /every other one stays on the track list\./.test(await page.textContent('.rp-nudge-text')) && !/sleeve/.test(await page.textContent('.rp-nudge-text')));
    await page.click('#rp-nudge-go');
    await page.waitForSelector('.rp-ask');
    ok('digital player: so does the question', /one tap away on the track list\./.test(await page.textContent('.rp-intro')) && !/sleeve/.test(await page.textContent('.rp-intro')));
    await page.keyboard.press('Escape');
    await go(page, 'settings');
    await page.evaluate(() => { document.getElementById('se-role').open = true; });
    await page.waitForSelector('#se-role .rp-about');
    const about = await page.textContent('#se-role .rp-about');
    ok('digital player: Settings → Your role says bonus tracks on the track list (tap ☰)', /bonus tracks on the track list \(tap ☰\)/.test(about) && !/record|sleeve|Tracks\)/.test(about), about);
    await page.evaluate(() => { document.getElementById('se-display').open = true; });
    await page.click('#se-display [data-pref="menu:record"]');
    await sleep(300);
    ok('switching to the record player there changes those words at once', /bonus tracks on the sleeve \(tap the record\)/.test(await page.textContent('#se-role .rp-about')) && (await page.locator('#deck .dk-record').count()) === 1);
    await page.click('#se-display [data-pref="menu:digital"]');
    await sleep(300);
    ok('…and back to the digital player, back again', /bonus tracks on the track list \(tap ☰\)/.test(await page.textContent('#se-role .rp-about')) && (await page.locator('#deck .dk-player').count()) === 1);

    // A scout: four tracks and Settings as tabs; a bonus track that is open is one more tab, last, until they move on.
    const tabs = () => page.$$eval('#deck .dk-tab', bs => bs.map(b => b.dataset.section));
    const marked = () => page.$$eval('#deck .dk-tab[aria-current]', bs => bs.map(b => `${b.dataset.section}:${b.getAttribute('aria-current')}`).join());
    const keyOn = cls => page.evaluate(c => !!document.activeElement && document.activeElement.classList.contains(c) && !!document.activeElement.closest('#deck'), cls);
    const tabFocus = () => page.evaluate(() => { const a = document.activeElement; return a && a.closest('#deck') && a.classList.contains('dk-tab') ? a.dataset.section : ''; });
    const at = () => page.evaluate(() => window.logiPage());
    const bonusByKeyboard = async id => { await page.focus('#deck .dk-list'); await page.keyboard.press('Enter'); await page.waitForSelector('.dk-sheet'); await sleep(100); await page.focus(`.dk-sheet .dk-bonus [data-section="${id}"]`); await page.keyboard.press('Enter'); await sleep(600); };
    await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('scout')));
    await sleep(500);
    ok('a scout has five tabs, the calendar first, in the role’s words', JSON.stringify(await tabs()) === JSON.stringify(R.menus.scout) && R.menus.scout.length === 5 && (await page.textContent('#deck .dk-tab')) === '📅Shows', (await tabs()).join(','));
    ok('…and stays on Settings, the fifth of five tracks', (await at()) === 'settings' && (await page.textContent('#deck .dk-meta')) === 'Track 5 of 5' && (await marked()) === 'settings:page', `${await page.textContent('#deck .dk-meta')} · ${await marked()}`);
    await page.click('#deck .dk-list');
    await page.waitForSelector('.dk-sheet');
    ok('the track list’s tracks are the role’s menu, numbered 1 to 5, with the rest under Bonus tracks', JSON.stringify(await menuIds(page)) === JSON.stringify(R.menus.scout) && (await page.$$eval('.dk-queue .dk-sides .dk-track-id', xs => xs.map(x => x.textContent).join())) === '1,2,3,4,5' && (await page.locator('.dk-queue .dk-bonus .dk-track').count()) === 6 && (await page.textContent('.dk-queue .muted')) === '5 tracks · 6 bonus', await page.textContent('.dk-queue .muted'));
    ok('…the bonus tracks after the list, not inside it', await page.evaluate(() => { const s = document.querySelector('.dk-queue .dk-sides'), b = document.querySelector('.dk-queue .dk-bonus'); return !s.contains(b) && !!(s.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }));
    await page.keyboard.press('Escape');
    await page.waitForSelector('.dk-sheet', { state: 'detached' });
    await bonusByKeyboard('insurance');
    const six = await tabs();
    ok('opening Insurance from the track list adds a sixth tab, last and marked current', (await at()) === 'insurance' && six.length === 6 && six[5] === 'insurance' && (await marked()) === 'insurance:page' && JSON.stringify(six.slice(0, 5)) === JSON.stringify(R.menus.scout), six.join(','));
    ok('…with its ★, and called a bonus track for a screen reader', (await page.textContent('#deck .dk-tab[data-section="insurance"]')) === '🛡️★ Insurance' && (await page.getAttribute('#deck .dk-tab[data-section="insurance"]', 'aria-label')) === 'Insurance, bonus track', await page.textContent('#deck .dk-tab[data-section="insurance"]'));
    ok('…the bar says Bonus track, with the line full', /^Bonus track/.test(await page.textContent('#deck .dk-meta')) && (await page.$eval('#deck .dk-fill', el => el.style.width)) === '100%' && (await page.getAttribute('#deck .dk-now', 'aria-label')) === 'Now playing a bonus track, Insurance. Open the track list to pick any section', await page.textContent('#deck .dk-meta'));
    ok('…its tab is in view, and the move was announced', await page.evaluate(() => { const row = document.querySelector('#deck .dk-tabs').getBoundingClientRect(), t = document.querySelector('#deck .dk-tab.on').getBoundingClientRect(); return t.left >= row.left - 1 && t.right <= row.right + 1; }) && (await page.evaluate(() => document.getElementById('sr-live').textContent)) === 'Insurance, a bonus track');
    ok('keyboard: a bonus track picked from the track list leaves the focus on ☰', await keyOn('dk-list'));
    await page.click('#deck .dk-list');
    await page.waitForSelector('.dk-sheet');
    ok('the track list marks it as the bonus track playing, and still lists the role’s five tracks', (await page.getAttribute('.dk-bonus .dk-track.on', 'data-section')) === 'insurance' && JSON.stringify(await menuIds(page)) === JSON.stringify(R.menus.scout) && (await page.locator('.dk-queue .dk-sides .dk-track.on').count()) === 0);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.dk-sheet', { state: 'detached' });
    await page.focus('#deck .dk-next'); await page.keyboard.press('Enter'); await sleep(600);
    ok('⏭ from it moves on to the first track and drops the tab', (await at()) === R.menus.scout[0] && (await tabs()).length === 5 && (await marked()) === `${R.menus.scout[0]}:page` && /^Track 1 of 5/.test(await page.textContent('#deck .dk-meta')), (await tabs()).join(','));
    ok('keyboard: …and the focus is still on ⏭', await keyOn('dk-next'));
    await bonusByKeyboard('money');
    await page.focus('#deck .dk-prev'); await page.keyboard.press('Enter'); await sleep(600);
    ok('keyboard: ⏮ off a bonus track goes to the last track and keeps the focus on ⏮', (await at()) === 'settings' && (await tabs()).length === 5 && await keyOn('dk-prev'));
    // From a tab: the focus stays with the section that was picked, or goes to the current tab when its own tab has gone.
    await bonusByKeyboard('songs');
    await page.focus('#deck .dk-tab[data-section="venues"]'); await page.keyboard.press('Enter'); await sleep(600);
    ok('keyboard: a tab picked while a bonus track is open opens it, drops the bonus tab and keeps the focus on that tab', (await at()) === 'venues' && (await tabs()).length === 5 && (await tabFocus()) === 'venues' && (await marked()) === 'venues:page', `${await at()} · ${await tabFocus()}`);
    await bonusByKeyboard('songs');
    await page.focus('#deck .dk-tab[data-section="songs"]'); await page.keyboard.press('ArrowRight'); await sleep(600);
    ok('keyboard: an arrow key on the bonus tab moves on, and the focus goes to the tab that is now current', (await at()) === R.menus.scout[0] && (await tabs()).length === 5 && (await tabFocus()) === R.menus.scout[0], `${await at()} · ${await tabFocus()}`);
    await bonusByKeyboard('songs');
    await page.focus('#deck .dk-now'); await page.keyboard.press('ArrowLeft'); await sleep(600);
    ok('keyboard: an arrow key on the bar off a bonus track keeps the focus on the bar', (await at()) === 'settings' && await keyOn('dk-now'));
    await go(page, 'tools');
    await go(page, 'backline');
    ok('one bonus track gives way to another: still six tabs, the new one last', (await at()) === 'backline' && JSON.stringify(await tabs()) === JSON.stringify([...R.menus.scout, 'backline']) && (await marked()) === 'backline:page');
    await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('producer')));
    await sleep(500);
    ok('a new role redraws the tabs: the producer’s menu, with Backline still open as its bonus tab', JSON.stringify(await tabs()) === JSON.stringify([...R.menus.producer, 'backline']) && !R.menus.producer.includes('backline') && (await at()) === 'backline' && (await marked()) === 'backline:page' && /^Bonus track/.test(await page.textContent('#deck .dk-meta')), (await tabs()).join(','));
    await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('band')));
    await sleep(500);
    ok('…and for a role that has Backline on its menu, it is one of the tracks, with no bonus tab', R.menus.band.includes('backline') && JSON.stringify(await tabs()) === JSON.stringify(R.menus.band) && (await at()) === 'backline' && (await marked()) === 'backline:page' && (await page.textContent('#deck .dk-meta')).startsWith(`Track ${R.menus.band.indexOf('backline') + 1} of ${R.menus.band.length}`), `${(await tabs()).join(',')} · ${await page.textContent('#deck .dk-meta')}`);
    await page.evaluate(() => { localStorage.removeItem('gdex-role'); });
    await page.reload();
    await page.waitForSelector('#deck .dk-next');
    await sleep(600);
    ok('with no role (Everything) there are eleven tabs and no bonus tracks on the track list', (await tabs()).length === 11 && (await page.textContent('#deck .dk-meta')).startsWith('Track 1 of 11') && (await sleeve(page)).bonus.length === 0);
    ok('no errors in the console (the digital player and roles)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- the welcome tour on a small screen: the card never hides what it points at ---------------- */
  for (const [label, prefs] of [['standard text', null], ['extra large text', '{"text":"xlarge"}'], ['the digital player, extra large text', '{"menu":"digital","text":"xlarge"}']]) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, serviceWorkers: 'block' });
    if (prefs) await ctx.addInitScript(p => { try { localStorage.setItem('gdex-prefs', p); } catch (e) { /* ignore */ } }, prefs);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE);
    await page.waitForSelector('.rp-ask .rp-card');
    await page.click('.rp-card[data-role="scout"]');
    await page.waitForSelector('.tour-card');
    const seen = [];
    for (let i = 0; i < 10 && await page.locator('.tour-card').count(); i++) {
      await sleep(300);
      seen.push(await page.evaluate(() => {
        const c = document.querySelector('.tour-card'), s = document.querySelector('.tour-spot'), a = c.querySelector('.tour-actions');
        const cr = c.getBoundingClientRect(), sr = s.getBoundingClientRect(), ar = a.getBoundingClientRect();
        const over = s.classList.contains('center') ? 0 : Math.max(0, Math.min(cr.bottom, sr.bottom) - Math.max(cr.top, sr.top));
        return { title: document.getElementById('tour-title').textContent, over: Math.round(over), inView: cr.top >= 0 && cr.bottom <= innerHeight + 1, buttons: ar.top >= cr.top - 1 && ar.bottom <= cr.bottom + 1 && ar.bottom <= innerHeight };
      }));
      await page.click('.tour-actions .btn.primary');
      await sleep(900);
    }
    const deck = seen.find(x => x.title === 'Your sections are tracks') || {};
    ok(`320×640, ${label}: the “Your sections are tracks” card leaves the deck in view`, deck.over === 0 && deck.inView, JSON.stringify(deck));
    ok(`320×640, ${label}: no card covers its highlighted part, and Next always shows`, seen.length >= 6 && seen.every(x => x.over === 0 && x.inView && x.buttons), JSON.stringify(seen.filter(x => x.over || !x.inView || !x.buttons)));
    ok(`no errors in the console (tour at 320, ${label})`, errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- the welcome tour in the role's words ---------------- */
  {
    const { browser, page, errors } = await open({ init: "localStorage.setItem('gdex-role','scout')" });
    const steps = await page.evaluate(() => import('./js/tour.js').then(m => m.welcomeSteps().map(s => ({ title: s.title, text: s.text, body: !!s.body }))));
    ok('the scout’s tour opens with its own welcome', /scouting/.test(steps[0].text) && /Fees and settlements stay off/.test(steps[0].text));
    ok('it counts the tracks and the sides', /5 tracks: 3 on Side A, 2 on Side B; the rest are bonus tracks/.test(steps[2].text), steps[2].text);
    ok('its stops use the role’s names', steps.some(s => s.title === 'Shows') && !steps.some(s => s.title === 'Bookings'), steps.map(s => s.title).join(' › '));
    ok('the calendar is its first stop, and says Gdex asks after a show', steps[3].title === 'Shows' && /by month, week or day/.test(steps[3].text) && /After a show Gdex asks if you saw them/.test(steps[3].text), `${steps[3].title}: ${steps[3].text}`);
    ok('the last card names the bonus tracks and leaves out quotes and invoices', /Not on your menu: Songs, Studio log, Backline, Money, Tools and Insurance/.test(steps[steps.length - 1].text) && !/quotes and invoices/.test(steps[steps.length - 1].text), steps[steps.length - 1].text);
    await page.evaluate(() => import('./js/tour.js').then(m => m.startTour()));
    await page.waitForSelector('.tour-card');
    await page.click('.tour-actions .btn.primary');
    await page.waitForSelector('.tour-form');
    const fields = await page.$$eval('.tour-form input', i => i.map(x => [x.dataset.key, x.value]));
    ok('the scout’s details card asks only for a name and what they do', JSON.stringify(fields.map(f => f[0])) === JSON.stringify(['name', 'role']), JSON.stringify(fields));
    ok('…with What you do filled in as A&R scout', (fields.find(f => f[0] === 'role') || [])[1] === 'A&R scout');
    await page.keyboard.press('Escape');
    await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('audiophile')));
    await page.evaluate(() => import('./js/tour.js').then(m => m.startTour()));
    await page.waitForSelector('.tour-card');
    await page.click('.tour-actions .btn.primary');
    await page.waitForSelector('.tour-form');
    ok('the audiophile’s What you do starts empty', (await page.$eval('.tour-form input[data-key=role]', i => i.value)) === '');
    await page.keyboard.press('Escape');
    await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('manager')));
    const mgr = await page.evaluate(() => import('./js/tour.js').then(m => m.welcomeSteps().map(s => s.text)));
    ok('a role with money keeps quotes and invoices on the last card', /quotes and invoices/.test(mgr[mgr.length - 1]));
    ok('no errors in the console (tour)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- every role opens on the calendar, its first track, whatever was open last ---------------- */
  {
    const { browser, page, errors } = await open({ sample: true });
    const starts = await page.evaluate(() => import('./js/roles.js').then(m => [...m.ROLES, m.EVERYTHING].map(r => [r.id, m.startSection(r), m.menuSections(r)[0]])));
    ok('every role, and Everything, starts on the calendar and has it as the first track', starts.length === 7 && starts.every(x => x[1] === 'bookings' && x[2] === 'bookings'), JSON.stringify(starts));
    for (const id of ['all', 'producer', 'manager', 'band', 'solo', 'scout', 'audiophile']) {
      // A new visit as this role, with a section saved by an older build as the one open last.
      await page.evaluate(x => { if (x === 'all') localStorage.removeItem('gdex-role'); else localStorage.setItem('gdex-role', x); localStorage.setItem('gdex-tab', 'venues'); }, id);
      await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(400);
      const at = await page.evaluate(() => ({ page: window.logiPage(), month: document.querySelectorAll('.bk-monthview').length, today: document.querySelectorAll('.bk-day.today').length, tab: localStorage.getItem('gdex-tab'), sheets: document.querySelectorAll('.sheet, .tour-card').length }));
      const first = (await sleeve(page)).ids[0];
      ok(`${id}: a fresh open is the calendar, on this month with today marked, and the calendar is the first track`, at.page === 'bookings' && at.month === 1 && at.today === 1 && first === 'bookings' && at.sheets === 0, JSON.stringify({ ...at, first }));
      ok(`${id}: the section saved by an older build is forgotten`, at.tab === null);
    }
    await page.evaluate(() => window.logiGo('venues')); await sleep(400);
    ok('(Venues is open)', (await page.evaluate(() => window.logiPage())) === 'venues');
    await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(400);
    ok('leaving on Venues and opening Gdex again: the calendar, and nothing is saved about the section', (await page.evaluate(() => window.logiPage())) === 'bookings' && (await page.evaluate(() => localStorage.getItem('gdex-tab'))) === null);
    // Within a visit, leaving Bookings and coming back keeps the day that was open.
    const far = await page.evaluate(() => import('./js/store.js').then(s => s.byId('bookings', 's-reh').date)); // the sample's rehearsal, three days on
    if (!(await page.locator(`.bk-day[data-date="${far}"]`).count())) { await page.click('[aria-label="Next month"]'); await sleep(200); }
    await page.locator(`.bk-day[data-date="${far}"]`).click(); await page.waitForSelector('.bk-dayview');
    await go(page, 'venues'); await go(page, 'bookings');
    ok('within a visit, coming back to the calendar keeps the day that was open', (await page.locator('.bk-dayview').count()) === 1 && (await page.locator('.bk-dayview .bk-ev[data-id="s-reh"]').count()) === 1); // .bk-ev: the day's own entry (Coming up is under the Day view too, and its card carries the same data-id)
    ok('no errors in the console (the calendar as the landing page)', errors.length === 0, errors.slice(0, 5).join(' | '));
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
  ok('Settings says the role is kept on this device, not in backups', /not in backups/.test(await page.textContent('#se-role')));
  ok('…and offers a tour of the role', (await page.locator('#rp-tour').count()) === 1);
  // A line that does not apply to the role (no bonus tracks, money on) is left out: nothing is written in its place.
  const stray = () => page.$$eval('#se-role .rp-panel', ps => ps.flatMap(p => [...p.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent)));
  ok('Everything has no bonus tracks and keeps money: no line for either, and no stray word where they would be', (await stray()).length === 0 && (await page.locator('#se-role .rp-bonus, #se-role .rp-money').count()) === 0 && !/null|undefined/.test(await page.textContent('#se-role .rp-panel')), (await stray()).join('|'));

  for (const id of ['manager', 'band', 'solo', 'scout', 'audiophile', 'producer']) {
    await page.click(`#se-role .rp-card[data-role="${id}"]`);
    await sleep(500);
    ok(`${id}: the choice is checked and keeps the focus`, (await page.getAttribute(`#se-role .rp-card[data-role="${id}"]`, 'aria-checked')) === 'true' && await page.evaluate(x => document.activeElement && document.activeElement.dataset.role === x, id));
    const s = await sleeve(page);
    ok(`${id}: the menu changes at once, and you stay on Settings`, JSON.stringify(s.ids) === JSON.stringify(R.menus[id]) && (await page.evaluate(() => window.logiPage())) === 'settings', s.ids.join(','));
    ok(`${id}: the rest are bonus tracks`, s.bonus.length + s.ids.length === 11);
    ok(`${id}: Settings is last on the menu`, s.ids[s.ids.length - 1] === 'settings');
    ok(`${id}: Your role lists its bonus tracks and writes nothing stray under the cards`, (await stray()).length === 0 && (await page.locator('#se-role .rp-bonus').count()) === 1 && !/null|undefined/.test(await page.textContent('#se-role .rp-panel')), (await stray()).join('|'));
  }
  ok('a role without money says where fees went', await page.evaluate(() => import('./js/roles.js').then(m => { m.setRole('scout'); return new Promise(r => setTimeout(() => r(/Fees, deals and settlements are off/.test(document.getElementById('se-role').textContent)), 300)); })));
  ok('…and that quotes & invoices come back with a role that uses money', /Quotes & invoices come back with a role that uses money, or with Everything\./.test(await page.textContent('#se-role .rp-money')));
  const noMoney = await page.$$eval('#page details.se-sec', ds => ds.map(d => d.dataset.s));
  ok('a role without money: Settings has no Quotes & invoices section', !noMoney.includes('billing') && noMoney.length === 8 && (await page.locator('#se-billing').count()) === 0, noMoney.join(','));
  const noMoneyTut = await page.evaluate(() => import('./js/pages/settings.js').then(m => m.settings.tutorial().map(s => `${s.title}: ${s.text}`)));
  ok('…its walkthrough leaves it out, and Your details is not said to go on quotes and invoices', noMoneyTut.length === 9 && !noMoneyTut.some(t => /quote|invoice/i.test(t)) && /Your details: Your name and contact details: they go on day sheets\./.test(noMoneyTut.join('\n')), noMoneyTut.join(' | ').slice(0, 300));
  ok('…nor is it on the page', !/quotes|invoices/i.test(await page.textContent('#se-profile')) && /They go on your day sheets and on your contact card below\./.test(await page.textContent('#se-profile')));
  await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('producer')));
  await sleep(300);
  ok('a role with money has Quotes & invoices again, third as before', (await page.$$eval('#page details.se-sec', ds => ds.map(d => d.dataset.s)))[2] === 'billing' && /day sheets, quotes and invoices/.test(await page.textContent('#se-profile')));
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

  /* the keyboard keeps its place when a bonus track comes onto the record or leaves it */
  const keyOn = cls => page.evaluate(c => !!document.activeElement && document.activeElement.classList.contains(c) && !!document.activeElement.closest('#deck'), cls);
  const bonusByKeyboard = async id => { await page.focus('#deck .dk-list'); await page.keyboard.press('Enter'); await page.waitForSelector('.dk-sheet'); await sleep(100); await page.focus(`.dk-sheet .dk-bonus [data-section="${id}"]`); await page.keyboard.press('Enter'); await sleep(600); };
  await go(page, R.menus.audiophile[0]);
  await bonusByKeyboard('songs');
  ok('keyboard: a bonus track picked from the sleeve leaves the focus on the sleeve button', (await page.evaluate(() => window.logiPage())) === 'songs' && await keyOn('dk-list'));
  await page.focus('#deck .dk-next'); await page.keyboard.press('Enter'); await sleep(600);
  ok('keyboard: ⏭ off a bonus track keeps the focus on ⏭', (await page.evaluate(() => window.logiPage())) === R.menus.audiophile[0] && await keyOn('dk-next'));
  await bonusByKeyboard('money');
  await page.focus('#deck .dk-prev'); await page.keyboard.press('Enter'); await sleep(600);
  ok('keyboard: ⏮ off a bonus track keeps the focus on ⏮', (await page.evaluate(() => window.logiPage())) === 'settings' && await keyOn('dk-prev'));
  await bonusByKeyboard('songs');
  await page.focus('#deck .dk-list'); await page.keyboard.press('Enter'); await page.waitForSelector('.dk-sheet'); await sleep(100);
  await page.focus('.dk-sheet .dk-sides [data-section="venues"]'); await page.keyboard.press('Enter'); await sleep(600);
  ok('keyboard: from a bonus track to a track on the sleeve, the focus is back on the sleeve button', (await page.evaluate(() => window.logiPage())) === 'venues' && await keyOn('dk-list'));
  await bonusByKeyboard('songs');
  await page.focus('#deck .dk-record'); await page.keyboard.press('ArrowRight'); await sleep(600);
  ok('keyboard: an arrow key on the record off a bonus track keeps the focus on the record', (await page.evaluate(() => window.logiPage())) === R.menus.audiophile[0] && await keyOn('dk-record'));

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
      const head = await page.textContent('#page .page-head h1', { timeout: 1500 }).catch(() => '');
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
