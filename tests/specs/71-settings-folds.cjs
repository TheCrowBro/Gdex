// Settings' twirl-downs close after 3 minutes away (the owner, 15 Nov 2026: "Leaving the settings page should close the
// settings twirl downs after a few minutes."). Which sections are open is remembered while the person comes and goes;
// shown again 3 minutes or more after it was left (another section, Tourbook in the background, or closed and opened
// again), Settings has every section closed and the list cleared. While it stays on screen nothing closes, and
// openSettingsSection still opens the section it is asked for. Back in front in the middle of something (typing in a
// box, a sheet up) is not leaving, and closed in place the view goes under the section menu. The page's clock is
// Playwright's, running on from now: fastForward moves it on, setSystemTime jumps (a phone asleep); "out of sight" is
// document.visibilityState with a visibilitychange event, as in 13-calendar.
const { open, ok, sleep, go } = require('../helpers.cjs');

const MIN = 60000;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const { browser, ctx, page, errors } = await open();
  await ctx.clock.install({ time: await page.evaluate(() => Date.now()) });
  await page.reload(); await page.waitForSelector('#deck .dk-next');

  const opened = () => page.$$eval('#page details.se-sec[open]', ds => ds.map(d => d.dataset.s));
  const stored = () => page.evaluate(() => ({ open: JSON.parse(localStorage.getItem('tourbook-settings-open') || '[]').sort(), left: localStorage.getItem('tourbook-settings-left') }));
  const twirl = async id => {
    await page.waitForSelector(`#se-${id}-sum`);
    if (await page.$eval(`#se-${id}`, d => d.open)) return;
    await page.evaluate(id => document.getElementById(`se-${id}-sum`).scrollIntoView({ block: 'center' }), id); await sleep(60);
    await page.click(`#se-${id}-sum`); await sleep(150);
  };
  const toSettings = async () => { await go(page, 'settings'); await page.waitForSelector('#se-erase'); };
  const later = async ms => { await page.clock.fastForward(ms); await sleep(100); };
  const sight = async hidden => {
    await page.evaluate(hidden => {
      // In front again, the browser's own answer comes back (it says hidden as the page is closed).
      if (hidden) { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); } else { delete document.visibilityState; delete document.hidden; }
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await sleep(150);
  };

  /* ------------------------------ staying on Settings ------------------------------ */
  await toSettings();
  ok('a new device: every section closed, nothing stored', same(await opened(), []) && same(await stored(), { open: [], left: null }), JSON.stringify(await stored()));
  await twirl('profile'); await twirl('display');
  ok('opening sections remembers them', same(await opened(), ['profile', 'display']) && same((await stored()).open, ['display', 'profile']), JSON.stringify(await stored()));
  await later(5 * MIN);
  await page.evaluate(() => import('./js/store.js').then(s => s.upsert('songs', { id: 't-fold', title: 'Fold Song' }))); await sleep(300);
  ok('while you stay on Settings nothing closes: 5 minutes on, and the page drawn again after a change', same(await opened(), ['profile', 'display']) && same((await stored()).open, ['display', 'profile']) && (await stored()).left === null, JSON.stringify(await stored()));

  /* ------------------------------ leaving for another section ------------------------------ */
  await go(page, 'bookings');
  const t = await page.evaluate(() => Date.now()), left = Number((await stored()).left);
  ok('leaving Settings notes the time', Math.abs(left - t) < 2000, String(left - t));
  await later(2 * MIN + 50000);
  await toSettings();
  ok('back within 3 minutes (2:50): the sections are open as they were', same(await opened(), ['profile', 'display']) && same((await stored()).open, ['display', 'profile']), JSON.stringify(await opened()));
  ok('…and the time noted is let go once Settings shows', (await stored()).left === null);
  await go(page, 'venues');
  await later(3 * MIN);
  await toSettings();
  ok('back after 3 minutes: every section is closed and the list is cleared', same(await opened(), []) && same(await stored(), { open: [], left: null }), JSON.stringify([await opened(), await stored()]));
  ok('…and the sections still open again with a tap', (await twirl('backups'), same(await opened(), ['backups'])) && same((await stored()).open, ['backups']));
  await go(page, 'bookings'); await later(MIN); await go(page, 'acts'); await later(MIN); await toSettings();
  ok('two minutes on other sections, through more than one: still open', same(await opened(), ['backups']));
  await go(page, 'bookings'); await later(2 * MIN); await go(page, 'acts'); await later(2 * MIN); await toSettings();
  ok('four minutes away, two on each of two sections: every section is closed (the time runs from leaving Settings, not from the last section)', same(await opened(), []) && same(await stored(), { open: [], left: null }), JSON.stringify([await opened(), await stored()]));
  await twirl('backups');

  /* ------------------------------ Tourbook in the background on Settings ------------------------------ */
  await twirl('help'); await twirl('display');
  await page.focus('#se-tutorials');
  await sight(true);
  ok('Tourbook in the background on Settings notes the time', Number((await stored()).left) > 0);
  await later(2 * MIN);
  await sight(false);
  ok('…back in front within 3 minutes: still open, the focus where it was', same(await opened(), ['backups', 'display', 'help']) && (await page.evaluate(() => document.activeElement.id)) === 'se-tutorials' && (await stored()).left === null, JSON.stringify(await opened()));
  await sight(true);
  await page.clock.setSystemTime(await page.evaluate(() => Date.now()) + 3 * MIN + 1000); // a phone asleep: no timer runs meanwhile
  await sight(false);
  const back = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, onPage: window.logiPage() }));
  ok('…back in front after 3 minutes: every section closes in place, and the list is cleared', back.onPage === 'settings' && same(await opened(), []) && same(await stored(), { open: [], left: null }), JSON.stringify([await opened(), await stored()]));
  ok('…the focus that was inside a section goes to its title', back.focus === 'se-help-sum', back.focus);
  await twirl('about');
  await sight(true); await sight(false);
  ok('…and a short trip to the background after that changes nothing', same(await opened(), ['about']));
  // The page the browser kept (pagehide and pageshow, persisted) and brought back after 3 minutes.
  const kept = type => page.evaluate(type => window.dispatchEvent(new PageTransitionEvent(type, { persisted: true })), type);
  await twirl('help');
  await kept('pagehide'); await page.clock.setSystemTime(await page.evaluate(() => Date.now()) + 3 * MIN + 1000); await kept('pageshow'); await sleep(150);
  ok('the page the browser kept, brought back after 3 minutes: every section is closed', same(await opened(), []) && same(await stored(), { open: [], left: null }), JSON.stringify([await opened(), await stored()]));
  await twirl('about');

  /* ------------------------------ closed and opened again ------------------------------ */
  await twirl('profile');
  await page.reload(); await page.waitForSelector('#deck .dk-next'); // closed while on Settings: the time is noted as it goes
  ok('closed while on Settings: the time is kept', Number((await stored()).left) > 0 && same((await stored()).open, ['about', 'profile']), JSON.stringify(await stored()));
  await later(MIN);
  await toSettings();
  ok('opened again a minute later: the sections are open as they were', same(await opened(), ['profile', 'about']));
  await page.reload(); await page.waitForSelector('#deck .dk-next');
  await later(3 * MIN);
  await toSettings();
  ok('opened again after 3 minutes: every section is closed and the list is cleared', same(await opened(), []) && same(await stored(), { open: [], left: null }), JSON.stringify([await opened(), await stored()]));
  await twirl('help');
  await go(page, 'bookings'); await page.reload(); await page.waitForSelector('#deck .dk-next');
  await later(3 * MIN);
  await toSettings();
  ok('left for the calendar, then a reload after 3 minutes: closed', same(await opened(), []));
  // A list kept by an earlier version, with no time noted: it counts as long ago.
  await go(page, 'bookings');
  await page.evaluate(() => { localStorage.setItem('tourbook-settings-open', JSON.stringify(['profile', 'about'])); localStorage.removeItem('tourbook-settings-left'); });
  await page.reload(); await page.waitForSelector('#deck .dk-next');
  await toSettings();
  ok('a list kept with no time noted (an earlier version): every section is closed', same(await opened(), []) && same(await stored(), { open: [], left: null }), JSON.stringify(await stored()));

  /* ------------------------------ openSettingsSection ------------------------------ */
  const openSection = id => page.evaluate(id => import('./js/pages/settings.js').then(m => m.openSettingsSection(id)), id);
  await twirl('profile'); await twirl('display');
  await go(page, 'bookings'); await later(MIN);
  ok('openSettingsSection within 3 minutes opens the section and keeps the others', (await openSection('backups')) === true && same(await opened(), ['profile', 'backups', 'display']) && same((await stored()).open, ['backups', 'display', 'profile']), JSON.stringify(await stored()));
  ok('…with the focus on its title', (await page.evaluate(() => document.activeElement.id)) === 'se-backups-sum');
  await go(page, 'bookings'); await later(3 * MIN);
  await page.evaluate(() => { // About's open state at each change of the page, from its first draw
    window.__log = [];
    window.__obs = new MutationObserver(() => window.__log.push(document.getElementById('se-about')?.open));
    window.__obs.observe(document.getElementById('page'), { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
  });
  ok('openSettingsSection after 3 minutes opens only the section it is asked for', (await openSection('about')) === true && same(await opened(), ['about']) && same((await stored()).open, ['about']), JSON.stringify([await opened(), await stored()]));
  const drawn = await page.evaluate(() => { window.__obs.disconnect(); return window.__log; });
  ok('…drawn open from its first draw, not closed then opened', drawn[0] === true, JSON.stringify(drawn));
  ok('…already on Settings, it opens one more and closes nothing', (await openSection('help')) === true && same(await opened(), ['help', 'about']));

  /* ------------------------------ in the middle of something ------------------------------ */
  // Tourbook in the background to fetch something (the rest of an IBAN from the bank's app, a code from mail): that is
  // not leaving Settings, and back in front after 3 minutes the person is where they were.
  const away = async () => { await sight(true); await page.clock.setSystemTime(await page.evaluate(() => Date.now()) + 3 * MIN + 1000); await sight(false); };
  await go(page, 'bookings'); await later(3 * MIN); await toSettings();
  await twirl('billing'); await page.waitForSelector('#mn-bl-iban');
  await page.click('#mn-bl-iban'); await page.keyboard.type('GB29 NWBK');
  await away();
  const typing = await page.evaluate(() => ({ focus: document.activeElement.id, open: document.getElementById('se-billing').open }));
  await page.keyboard.type(' 6016 1331 9268 19');
  ok('typing in a box (an IBAN) and back in front after 3 minutes: the section stays open, the focus in the box', typing.open && typing.focus === 'mn-bl-iban' && same(await opened(), ['billing']) && same((await stored()).open, ['billing']), JSON.stringify(typing));
  ok('…what is typed next goes into the box', (await page.inputValue('#mn-bl-iban')) === 'GB29 NWBK 6016 1331 9268 19', await page.inputValue('#mn-bl-iban'));
  ok('…and the time noted is let go', (await stored()).left === null);
  await page.focus('#se-billing-sum'); await sleep(300); // the IBAN saved on leaving the box
  await go(page, 'bookings'); await later(MIN); await toSettings();
  ok('…leaving after that still notes the time: back within 3 minutes, still open', same(await opened(), ['billing']));
  await go(page, 'bookings'); await later(3 * MIN); await toSettings();
  ok('…and back after 3 minutes, closed', same(await opened(), []) && same(await stored(), { open: [], left: null }), JSON.stringify(await stored()));
  await twirl('profile');
  await page.click('#se-edit-profile'); await page.waitForSelector('.sheet [data-key="name"]'); await sleep(200);
  await away();
  ok('a sheet up (Edit your details) and back in front after 3 minutes: the section behind it stays open', same(await opened(), ['profile']) && (await stored()).left === null, JSON.stringify(await opened()));
  await page.keyboard.press('Escape'); await sleep(200);
  ok('…and Escape gives the focus back to Edit your details', !(await page.$('.sheet-back')) && (await page.evaluate(() => document.activeElement.id)) === 'se-edit-profile', await page.evaluate(() => document.activeElement.id));

  /* ------------------------------ the view after closing in place ------------------------------ */
  // On a small phone the list is much shorter once closed: the view goes to the title with the focus (else the first
  // section closed), under the section menu, not to the end of the list.
  await page.setViewportSize({ width: 360, height: 640 }); await sleep(200);
  const where = id => page.evaluate(id => { const r = document.getElementById(id).getBoundingClientRect(), deck = document.getElementById('deck').getBoundingClientRect(); return { top: Math.round(r.top), deck: Math.round(deck.bottom), h: innerHeight, focus: document.activeElement.id }; }, id);
  await twirl('billing'); await twirl('display');
  await page.focus('#se-edit-profile');
  await away();
  const w1 = await where('se-profile-sum');
  ok('360 × 640, the focus on Edit your details, back after 3 minutes: the focus on Your details\' title, under the section menu and on screen', w1.focus === 'se-profile-sum' && w1.top >= w1.deck && w1.top < w1.h - 40 && same(await opened(), []), JSON.stringify(w1));
  await twirl('profile'); await twirl('billing'); await twirl('display');
  await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, document.documentElement.scrollHeight); }); await sleep(200);
  await away();
  const w2 = await where('se-profile');
  ok('…with no focus in a section: the first section that was open is under the section menu and on screen', w2.top >= w2.deck && w2.top < w2.h - 40 && same(await opened(), []), JSON.stringify(w2));
  await page.setViewportSize({ width: 420, height: 900 }); await sleep(200);

  /* ------------------------------ erase ------------------------------ */
  await twirl('erase');
  await page.fill('#se-erase-input', 'ERASE');
  await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.click('#se-erase-go')]);
  await page.waitForSelector('#deck .dk-next'); await sleep(300);
  ok('Erase this device leaves neither the open sections nor a time behind (the reload after it notes none)', await page.evaluate(() => localStorage.getItem('tourbook-settings-open') === null && localStorage.getItem('tourbook-settings-left') === null));

  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL settings folds crashed — ' + e.message); process.exit(1); });
