// Roles on the pages (js/roles.js pageOpt): the tool Tools opens on (tap tempo for a producer, the meter for an
// audiophile) until one is picked, the view Songs opens on (Setlists for a band), the group People's + Add starts in,
// the Money page's word for the year's income (a manager's acts), and Bookings by the role's own name in the set
// timer and the sample's toast. Everything (no role) keeps the defaults it always had.
const { open, ok, sleep, go, topSheet } = require('../helpers.cjs');

const state = page => page.evaluate(() => (window.gdexAudioState ? window.gdexAudioState() : null));
const until = async (fn, ms = 6000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not ready */ } await sleep(step); } return false; };
const stored = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
const roleInit = id => `try { localStorage.setItem('gdex-role', '${id}'); } catch (e) { /* ignore */ }`;
const setRole = (page, id) => page.evaluate(r => import('./js/roles.js').then(m => m.setRole(r)), id);
// A role (or none) kept on this device and nothing remembered on the pages, as a fresh visit.
async function asRole(page, id) {
  await page.evaluate(r => { if (r) localStorage.setItem('gdex-role', r); else localStorage.removeItem('gdex-role'); localStorage.removeItem('gdex-tool'); }, id);
  await page.reload(); await page.waitForSelector('#deck .dk-next');
}
const tools = async page => { await go(page, 'tools'); await page.waitForSelector('#tl-panel[data-tool]'); return page.getAttribute('#tl-panel', 'data-tool'); };
const selected = (page, id) => page.getAttribute(`#tl-tab-${id}`, 'aria-selected').then(v => v === 'true');
const songsView = async page => { await go(page, 'songs'); await page.waitForSelector('.sg-views'); return (await page.getAttribute('#sg-view-setlists', 'aria-pressed')) === 'true' ? 'setlists' : 'songs'; };
const tourText = page => page.locator('.tour-card').first().innerText().catch(() => '');
// A check on a tour card's words, printing the card only when it fails.
const says = (name, re, text) => ok(name, re.test(text), re.test(text) ? '' : text);
const cardSays = async (page, re) => { await until(async () => re.test(await tourText(page)), 4000); return tourText(page); };
async function closeTour(page) { await page.keyboard.press('Escape'); await page.waitForSelector('.tour-card', { state: 'detached', timeout: 3000 }).catch(() => {}); }

(async () => {
  const allErrors = [];

  /* ------------------------------- Tools: the first tool, in fresh browsers ------------------------------- */
  for (const [rid, want] of [[null, 'tuner'], ['producer', 'tempo'], ['audiophile', 'meter'], ['band', 'tuner']]) {
    const who = rid || 'everything';
    const { browser, page, errors } = await open({ sample: true, init: rid ? roleInit(rid) : null, permissions: ['microphone'] });
    const first = await tools(page);
    ok(`${who}: Tools opens on ${want}`, first === want && await selected(page, want), first);
    ok(`${who}: looking at Tools remembers no tool`, (await stored(page, 'gdex-tool')) === null);
    if (want === 'tuner') {
      // As before: with the microphone allowed, the tuner listens as soon as it opens.
      ok(`${who}: the tuner listens on its own once the microphone is allowed`, await until(async () => { const s = await state(page); return s.tuner.listening && s.liveTracks >= 1; }));
      await go(page, 'songs');
      ok(`${who}: leaving Tools lets the microphone go`, await until(async () => (await state(page)).liveTracks === 0, 3000));
    }
    if (rid === 'producer') {
      ok('producer: tap tempo opens without the microphone', (await state(page)).liveTracks === 0);
      await page.click('#helpBtn');
      says('the walkthrough says which tool opens until one is picked', /Gdex opens tap tempo until you pick one/, await cardSays(page, /Gdex opens tap tempo/));
      await closeTour(page);
      await page.click('#tl-tab-tuner');
      ok('picking the tuner starts it listening, as before', await until(async () => { const s = await state(page); return s.tuner.listening && s.liveTracks >= 1; }));
      ok('a pick is remembered', (await stored(page, 'gdex-tool')) === 'tuner');
      await page.click('#tl-tab-meter');
      ok('switching to the meter lets the tuner’s microphone go', await until(async () => { const s = await state(page); return !s.tuner.listening && s.liveTracks === 0; }, 3000));
      ok('…and remembers the meter', (await stored(page, 'gdex-tool')) === 'meter');
      await page.click('#helpBtn');
      says('once a tool is picked, the walkthrough says the last one opens', /Gdex opens the one you used last/, await cardSays(page, /Gdex opens the one you used last/));
      await closeTour(page);
      await go(page, 'songs');
      ok('the picked tool wins over the role’s, back on Tools', (await tools(page)) === 'meter');
      await page.reload(); await page.waitForSelector('#deck .dk-next');
      ok('…and after a reload', (await tools(page)) === 'meter');
      await page.focus('#tl-tab-meter'); await page.keyboard.press('ArrowRight'); await sleep(200);
      ok('the arrow keys on the tools pick a tool too', (await stored(page, 'gdex-tool')) === 'timer' && await selected(page, 'timer'));
      await page.evaluate(() => localStorage.removeItem('gdex-tool'));
      await page.reload(); await page.waitForSelector('#deck .dk-next');
      ok('with nothing remembered again, the role’s tool is back', (await tools(page)) === 'tempo' && (await stored(page, 'gdex-tool')) === null);
    }
    if (rid === 'audiophile') {
      ok('audiophile: the meter waits for Start, as before', (await state(page)).liveTracks === 0 && !(await state(page)).meter.listening);
      await page.click('#tl-meter-start');
      ok('Start meter listens', await until(async () => { const s = await state(page); return s.meter.listening && s.liveTracks >= 1; }));
      ok('starting the meter is not a pick', (await stored(page, 'gdex-tool')) === null);
      await go(page, 'venues');
      ok('leaving Tools stops the meter and the microphone', await until(async () => { const s = await state(page); return !s.meter.listening && s.liveTracks === 0; }, 3000));
    }
    allErrors.push(...errors);
    await browser.close();
  }

  /* ------------------------------- one browser: role swaps in a visit, Songs, People, Money ------------------------------- */
  const { browser, page, errors } = await open({ sample: true });

  // Tools is worked out when it is drawn, so a role chosen in the same visit applies while nothing is remembered.
  ok('everything: Tools opens on the tuner', (await tools(page)) === 'tuner');
  await go(page, 'songs');
  await setRole(page, 'producer');
  ok('a producer chosen in the same visit gets tap tempo', (await tools(page)) === 'tempo');
  await go(page, 'acts');
  await setRole(page, 'audiophile');
  ok('then an audiophile, the meter', (await tools(page)) === 'meter' && (await stored(page, 'gdex-tool')) === null);
  await page.click('#tl-tab-metronome');
  await go(page, 'acts');
  await setRole(page, 'producer');
  ok('once a tool is picked, a new role keeps it', (await tools(page)) === 'metronome');

  // Songs: a band starts on Setlists when there are songs.
  await asRole(page, null);
  ok('everything: Songs opens on Songs', (await songsView(page)) === 'songs');
  await asRole(page, 'band');
  ok('band: Songs opens on Setlists when there are songs', (await songsView(page)) === 'setlists' && (await page.locator('.sg-setlist').count()) > 0);
  await page.click('#sg-view-songs'); await sleep(150);
  await go(page, 'bookings');
  ok('after that the person’s choice stays for the visit', (await songsView(page)) === 'songs');
  await page.reload(); await page.waitForSelector('#deck .dk-next');
  ok('a new visit starts on Setlists again', (await songsView(page)) === 'setlists');
  await go(page, 'bookings'); // so the reload below opens there, and Songs is loaded but not drawn
  await asRole(page, null);
  await page.evaluate(() => import('./js/pages/songs.js')); // loaded under Everything, before any role
  await setRole(page, 'band');
  ok('the view is worked out when Songs is drawn, not when it loads', (await songsView(page)) === 'setlists');
  await go(page, 'bookings');
  await setRole(page, 'producer');
  ok('a role without a view of its own opens Songs on Songs', (await songsView(page)) === 'songs');
  for (const r of ['producer', 'manager', 'solo', 'scout', 'audiophile']) {
    await asRole(page, r);
    if ((await songsView(page)) !== 'songs') { ok(`${r}: Songs opens on Songs`, false); break; }
  }
  ok('every other role opens Songs on Songs', true);

  // People: + Add starts in the role's group (a group on show wins).
  const addGroup = async () => {
    await go(page, 'people'); await page.waitForSelector('#pp-add');
    await page.click('#pp-add');
    await page.waitForSelector('.sheet [id$="-group"]');
    const g = await topSheet(page).locator('[id$="-group"]').inputValue();
    await page.keyboard.press('Escape'); await page.waitForSelector('.sheet', { state: 'detached', timeout: 3000 }).catch(() => {});
    return g;
  };
  const groups = { everything: 'band', producer: 'session', manager: 'contact', band: 'band', solo: 'session', scout: 'contact', audiophile: 'band' };
  const got = {};
  for (const r of Object.keys(groups)) { await asRole(page, r === 'everything' ? null : r); got[r] = await addGroup(); }
  ok('+ Add starts a new person in the role’s group', Object.keys(groups).every(r => got[r] === groups[r]), JSON.stringify(got));
  await asRole(page, 'producer');
  await go(page, 'people'); await page.click('#pp-g-crew'); await sleep(150);
  ok('with a group on show, + Add starts there whatever the role', (await addGroup()) === 'crew');
  await page.click('#pp-g-all'); await sleep(100);
  await asRole(page, 'manager');
  await go(page, 'people');
  await page.click('#pp-add'); await page.waitForSelector('.sheet [id$="-name"]');
  await page.fill('.sheet [id$="-name"]', 'Kim Agent');
  await page.click('.sheet button[type=submit]'); await sleep(300);
  ok('a manager’s new person is saved as an industry contact', (await page.evaluate(() => import('./js/store.js').then(s => (s.db.people.find(p => p.name === 'Kim Agent') || {}).group))) === 'contact');

  // Money: the manager's word for the year's income.
  const Y = await page.evaluate(() => import('./js/util.js').then(u => u.todayISO().slice(0, 4)));
  const earnedLabel = async () => { await go(page, 'money'); await page.waitForSelector('#mn-stat-earned'); return page.locator('#mn-stat-earned span').innerText(); };
  ok('manager: the year’s income reads “your acts earned”', (await earnedLabel()) === `your acts earned in ${Y}`, await page.locator('#mn-stat-earned span').innerText());
  ok('…and its note says what it counts', /^“Your acts earned” counts the \d+ bookings? done or settled in \d{4}, at their full fees before any commission; booked ahead/.test(await page.locator('.mn-note').innerText()), await page.locator('.mn-note').innerText());
  await page.click('#helpBtn');
  await until(async () => /Money/.test(await tourText(page)), 4000);
  says('…and so does the walkthrough', /what your acts earned/, await tourText(page));
  await page.click('.tour-card .btn.primary'); await sleep(700);
  says('…on its second card too', /What your acts earned from bookings done or settled/, await tourText(page));
  await closeTour(page);
  for (const r of ['producer', null]) {
    await asRole(page, r);
    const label = await earnedLabel(), note = await page.locator('.mn-note').innerText();
    ok(`${r || 'everything'}: the year’s income reads “earned”`, label === `earned in ${Y}` && /^Earned counts the/.test(note), `${label} / ${note}`);
  }
  await page.click('#helpBtn');
  says('everything’s walkthrough says what you earned', /what you earned/, await cardSays(page, /what you earned/));
  await closeTour(page);

  // Words: Bookings by the role's name in the set timer and its walkthrough.
  const timerNote = async () => { await tools(page); await page.click('#tl-tab-timer'); await page.waitForSelector('#tl-panel[data-tool="timer"] .tl-show'); return page.locator('.tl-show').innerText(); };
  for (const [r, name] of [[null, 'Bookings'], ['scout', 'Shows'], ['audiophile', 'Gigs'], ['band', 'Bookings']]) {
    await asRole(page, r);
    const t = await timerNote();
    ok(`${r || 'everything'}: the set timer says “No show in ${name} tonight”`, t.includes(`No show in ${name} tonight`), t);
  }
  await asRole(page, 'scout');
  await timerNote();
  await page.click('#helpBtn');
  await until(async () => /Five tools/.test(await tourText(page)), 4000);
  await page.click('.tour-card .btn.primary'); await sleep(700);
  says('the set timer’s walkthrough uses the role’s name too', /tonight’s show in Shows\./, await tourText(page));
  await closeTour(page);

  // The sample's toast.
  const sampleToast = async () => {
    await page.evaluate(() => import('./js/pages/settings.js').then(m => m.removeSample()));
    await go(page, 'settings');
    await page.waitForSelector('#se-sample');
    if (!(await page.$eval('#se-sample', d => d.open))) { await page.evaluate(() => document.querySelector('#se-sample-sum').scrollIntoView({ block: 'center' })); await page.click('#se-sample-sum'); }
    await page.waitForSelector('#se-sample-load', { state: 'visible' });
    await page.evaluate(() => document.querySelector('#se-sample-load').scrollIntoView({ block: 'center' }));
    await page.click('#se-sample-load');
    return page.locator('.toast', { hasText: 'Sample loaded' }).last().innerText({ timeout: 4000 }).catch(() => '');
  };
  let t = await sampleToast();
  ok('a scout’s sample toast says “Open Shows”', /Open Shows to have a look\./.test(t), t);
  await asRole(page, null);
  t = await sampleToast();
  ok('everything’s still says “Open Bookings”', /Open Bookings to have a look\./.test(t), t);

  allErrors.push(...errors);
  ok('no errors in the console', allErrors.length === 0, allErrors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL roles-pages crashed — ' + e.message); process.exit(1); });
