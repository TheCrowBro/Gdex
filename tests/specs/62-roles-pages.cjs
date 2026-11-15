// Roles on the pages (js/roles.js pageOpt): the tool Tools opens on (tap tempo for a producer, the meter for an
// audiophile) until one is picked (tourbook-tool from the build before roles is not a pick), the view Songs opens on
// (Setlists for a band that has setlists; the metronome's Go to Songs always lands on the songs), the group People's
// + Add starts in (Band members with an act's people on show) and the hint under Group about Ask if they're free, the
// Money page's word for the year's income (a manager's acts), Bookings and Acts by the role's own names (set timer,
// People), Settings offering no sample to load in any role, the scout's and gig-goer's People and Venues without fees
// or a performer's words, and the pages at 320px with extra-large text (no word or amount split mid-way, tool names
// readable). Everything (no role) keeps the defaults it always had.
const { open, ok, sleep, go, topSheet } = require('../helpers.cjs');

const state = page => page.evaluate(() => (window.tourbookAudioState ? window.tourbookAudioState() : null));
const until = async (fn, ms = 6000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not ready */ } await sleep(step); } return false; };
const stored = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
const roleInit = id => `try { localStorage.setItem('tourbook-role', '${id}'); } catch (e) { /* ignore */ }`;
const setRole = (page, id) => page.evaluate(r => import('./js/roles.js').then(m => m.setRole(r)), id);
// A role (or none) kept on this device and nothing remembered on the pages, as a fresh visit.
async function asRole(page, id) {
  await page.evaluate(r => { if (r) localStorage.setItem('tourbook-role', r); else localStorage.removeItem('tourbook-role'); localStorage.removeItem('tourbook-tool-pick'); }, id);
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
// Every card of a walkthrough, title and text: from the open sheet's ? when a sheet is open, else the page's.
async function tourCards(page) {
  const sheetHelp = page.locator('.sheet .sheet-help');
  if (await sheetHelp.count()) await sheetHelp.last().click(); else await page.click('#helpBtn');
  await page.waitForSelector('.tour-card');
  const cards = [];
  for (let i = 0; i < 16; i++) {
    await sleep(250);
    if (!(await page.locator('.tour-card').count())) break;
    const title = await page.locator('#tour-title').innerText().catch(() => ''), text = await page.locator('.tour-card p').first().innerText().catch(() => '');
    if (cards.length && cards[cards.length - 1].title === title && cards[cards.length - 1].text === text) continue; // still moving
    cards.push({ title, text });
    const next = page.locator('.tour-card .tour-actions .btn.primary');
    const label = await next.innerText().catch(() => 'Done');
    await next.click().catch(() => {});
    if (label === 'Done') break;
  }
  await page.waitForSelector('.tour-card', { state: 'detached', timeout: 3000 }).catch(() => {});
  return cards;
}
const closeSheets = async page => { for (let i = 0; i < 4 && await page.locator('.sheet [aria-label="Close"]').count(); i++) { await page.locator('.sheet [aria-label="Close"]').last().click(); await sleep(250); } };
// Words (and amounts such as "$11,739") the browser split across two lines: a word may break only at a hyphen or a
// soft hyphen. An element's text nodes are read in order, so a word made of two nodes ("#" and a number) is one word.
const splitWords = (page, sel) => page.evaluate(s => {
  const out = [];
  for (const el of document.querySelectorAll(s)) {
    const chars = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
    while ((n = walk.nextNode())) {
      for (let i = 0; i < n.length; i++) {
        const c = n.data[i];
        if (c === '\u00AD') { chars.push({ c: '-', top: null }); continue; }
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
        const rc = r.getClientRects()[0];
        chars.push({ c, top: rc && rc.width > 0 ? rc.top : null });
      }
    }
    let word = [];
    const flush = () => { const tops = word.map(x => x.top).filter(t => t != null); if (tops.length && Math.max(...tops) - Math.min(...tops) > 3 && !word.some(x => x.c === '-')) out.push(word.map(x => x.c).join('')); word = []; };
    for (const ch of chars) { if (/\s/.test(ch.c)) flush(); else word.push(ch); }
    flush();
  }
  return out;
}, sel);

(async () => {
  const allErrors = [];

  /* ------------------------------- Tools: the first tool, in fresh browsers ------------------------------- */
  for (const [rid, want] of [[null, 'tuner'], ['producer', 'tempo'], ['audiophile', 'meter'], ['band', 'tuner']]) {
    const who = rid || 'everything';
    const { browser, page, errors } = await open({ sample: true, init: rid ? roleInit(rid) : null, permissions: ['microphone'] });
    const first = await tools(page);
    ok(`${who}: Tools opens on ${want}`, first === want && await selected(page, want), first);
    ok(`${who}: looking at Tools remembers no tool`, (await stored(page, 'tourbook-tool-pick')) === null);
    if (want === 'tuner') {
      // As before: with the microphone allowed, the tuner listens as soon as it opens.
      ok(`${who}: the tuner listens on its own once the microphone is allowed`, await until(async () => { const s = await state(page); return s.tuner.listening && s.liveTracks >= 1; }));
      await go(page, 'songs');
      ok(`${who}: leaving Tools lets the microphone go`, await until(async () => (await state(page)).liveTracks === 0, 3000));
    }
    if (rid === 'producer') {
      ok('producer: tap tempo opens without the microphone', (await state(page)).liveTracks === 0);
      await page.click('#helpBtn');
      says('the walkthrough says which tool opens until one is picked', /Tourbook opens tap tempo until you pick one/, await cardSays(page, /Tourbook opens tap tempo/));
      await closeTour(page);
      await page.click('#tl-tab-tuner');
      ok('picking the tuner starts it listening, as before', await until(async () => { const s = await state(page); return s.tuner.listening && s.liveTracks >= 1; }));
      ok('a pick is remembered', (await stored(page, 'tourbook-tool-pick')) === 'tuner');
      await page.click('#tl-tab-meter');
      ok('switching to the meter lets the tuner’s microphone go', await until(async () => { const s = await state(page); return !s.tuner.listening && s.liveTracks === 0; }, 3000));
      ok('…and remembers the meter', (await stored(page, 'tourbook-tool-pick')) === 'meter');
      await page.click('#helpBtn');
      says('once a tool is picked, the walkthrough says the last one opens', /Tourbook opens the one you used last/, await cardSays(page, /Tourbook opens the one you used last/));
      await closeTour(page);
      await go(page, 'songs');
      ok('the picked tool wins over the role’s, back on Tools', (await tools(page)) === 'meter');
      await page.reload(); await page.waitForSelector('#deck .dk-next');
      ok('…and after a reload', (await tools(page)) === 'meter');
      await page.focus('#tl-tab-meter'); await page.keyboard.press('ArrowRight'); await sleep(200);
      ok('the arrow keys on the tools pick a tool too', (await stored(page, 'tourbook-tool-pick')) === 'timer' && await selected(page, 'timer'));
      await page.evaluate(() => localStorage.removeItem('tourbook-tool-pick'));
      await page.reload(); await page.waitForSelector('#deck .dk-next');
      ok('with nothing remembered again, the role’s tool is back', (await tools(page)) === 'tempo' && (await stored(page, 'tourbook-tool-pick')) === null);
    }
    if (rid === 'audiophile') {
      ok('audiophile: the meter waits for Start, as before', (await state(page)).liveTracks === 0 && !(await state(page)).meter.listening);
      await page.click('#tl-meter-start');
      ok('Start meter listens', await until(async () => { const s = await state(page); return s.meter.listening && s.liveTracks >= 1; }));
      ok('starting the meter is not a pick', (await stored(page, 'tourbook-tool-pick')) === null);
      await go(page, 'venues');
      ok('leaving Tools stops the meter and the microphone', await until(async () => { const s = await state(page); return !s.meter.listening && s.liveTracks === 0; }, 3000));
    }
    allErrors.push(...errors);
    await browser.close();
  }

  /* ------------------------------- Tools on a device that opened it before roles came ------------------------------- */
  // The build before roles wrote tourbook-tool every time Tools was drawn, so it says what was on screen, not what was
  // picked. It is never read: such a device opens on the role's tool, as a fresh one does, until a tool is picked.
  for (const [rid, want] of [['producer', 'tempo'], ['audiophile', 'meter'], [null, 'tuner']]) {
    const who = rid || 'everything';
    const old = `try { localStorage.setItem('tourbook-tool', 'tuner'); } catch (e) { /* ignore */ }`;
    const { browser, page, errors } = await open({ sample: true, init: (rid ? roleInit(rid) : '') + old });
    const first = await tools(page);
    ok(`${who}: with the old build’s tourbook-tool on the device, Tools opens on ${want}`, first === want && await selected(page, want), first);
    if (rid === 'producer') {
      await page.click('#helpBtn');
      says('…and the walkthrough says tap tempo opens until a tool is picked', /Tourbook opens tap tempo until you pick one/, await cardSays(page, /Tourbook opens/));
      await closeTour(page);
      await page.click('#tl-tab-metronome'); await sleep(150);
      ok('a pick is kept under tourbook-tool-pick, the old key left as it was', (await stored(page, 'tourbook-tool-pick')) === 'metronome' && (await stored(page, 'tourbook-tool')) === 'tuner');
      await page.reload(); await page.waitForSelector('#deck .dk-next');
      ok('…and the pick opens next time', (await tools(page)) === 'metronome');
    }
    allErrors.push(...errors);
    await browser.close();
  }

  /* ------------------------------- Songs: a band with songs but no setlists yet, and the metronome's link ------------------------------- */
  {
    const { browser, page, errors } = await open({ init: roleInit('band') });
    await page.evaluate(() => import('./js/store.js').then(s => { s.upsert('songs', { title: 'One' }); s.upsert('songs', { title: 'Two' }); }));
    await page.reload(); await page.waitForSelector('#deck .dk-next');
    ok('band: with songs but no setlists yet, Songs opens on the songs', (await songsView(page)) === 'songs' && (await page.locator('.sg-song').count()) === 2);
    const goSongs = async () => {
      await page.reload(); await page.waitForSelector('#deck .dk-next');
      await tools(page); await page.click('#tl-tab-metronome'); await page.waitForSelector('#tl-metro-song');
      await page.click('#tl-metro-song'); await page.waitForSelector('.sheet .empty');
      const said = await page.locator('.sheet .empty').innerText();
      await page.locator('.sheet .empty .btn.primary').click();
      await until(async () => (await page.evaluate(() => window.logiPage())) === 'songs' && (await page.locator('.sg-views').count()) > 0, 3000); await sleep(200);
      return { said, view: (await page.getAttribute('#sg-view-setlists', 'aria-pressed')) === 'true' ? 'setlists' : 'songs', cards: await page.locator('.sg-song').count() };
    };
    let r = await goSongs();
    ok('the metronome’s Go to Songs (no song has a tempo) lands on the songs to add one to', /Add the BPM to a song under Songs/.test(r.said) && r.view === 'songs' && r.cards === 2, JSON.stringify(r));
    await page.evaluate(() => import('./js/store.js').then(s => s.upsert('setlists', { name: 'Club set', items: [] })));
    await page.reload(); await page.waitForSelector('#deck .dk-next');
    ok('band: with songs and setlists, Songs opens on Setlists', (await songsView(page)) === 'setlists');
    r = await goSongs();
    ok('…and the metronome’s Go to Songs still lands on the songs, not the role’s Setlists', r.view === 'songs' && r.cards === 2, JSON.stringify(r));
    await go(page, 'bookings');
    ok('…and the view it asked for stays for the visit', (await songsView(page)) === 'songs');
    allErrors.push(...errors);
    await browser.close();
  }

  /* ------------------------------- a scout and a gig-goer: People and Venues without fees or a player's words ------------------------------- */
  for (const rid of ['scout', 'audiophile', null]) {
    const who = rid || 'everything', off = !!rid;
    const { browser, page, errors } = await open({ init: rid ? roleInit(rid) : null });
    await go(page, 'people');
    const pe = await page.locator('.pp-page .empty').innerText();
    const pc = await tourCards(page);
    await go(page, 'venues');
    const ve = await page.locator('.empty').first().innerText();
    const vc = await tourCards(page);
    if (off) {
      const acts = rid === 'scout' ? 'acts' : 'bands', seen = rid === 'scout' ? 'shows' : 'gigs';
      ok(`${who}: People’s empty page names the managers, agents, promoters and label contacts, not the players you hire`, /^Add the managers, agents, promoters and label contacts you deal with/.test(pe) && pe.includes(`the ${acts} they’re with`) && !/session players|crew you hire|who’s free/.test(pe), pe);
      ok(`${who}: …and so does the first card of its walkthrough`, !!pc[0] && pc[0].title === 'People' && /^The managers, agents, promoters and label contacts you deal with/.test(pc[0].text) && !/session players|who’s free/.test(pc[0].text), JSON.stringify(pc[0]));
      ok(`${who}: Venues’ empty page speaks of the rooms you go to`, /^Save the rooms you go to/.test(ve) && ve.includes(`the ${seen} you’ve been to there`) && !/play and record|the set would run/.test(ve), ve);
      ok(`${who}: …and its walkthrough starts with “The rooms you go to”`, !!vc[0] && vc[0].title === 'The rooms you go to' && !/play and record/.test(vc[0].text), JSON.stringify(vc[0]));
    } else {
      ok('everything: People’s empty page is as it was', /^Add your band, the session players and crew you hire/.test(pe) && /ask who’s free in a tap/.test(pe), pe);
      ok('everything: Venues’ empty page and walkthrough are as they were', /^Save the clubs, halls, studios and rehearsal rooms you play and record in/.test(ve) && !!vc[0] && vc[0].title === 'Places you play and record', `${ve} / ${JSON.stringify(vc[0])}`);
    }
    // With the sample: rates on the cards and the person's sheet only for a role with money.
    await page.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(150);
    await go(page, 'people');
    const subs = (await page.locator('.pp-card .pp-sub').allInnerTexts()).join(' | ');
    await page.click('#pp-open-s-marcus'); await page.waitForSelector('.pp-sheet');
    const details = await page.locator('.pp-sheet .pp-details').innerText();
    const sc = await tourCards(page);
    await closeSheets(page);
    await go(page, 'venues');
    const facts = (await page.locator('.vn-card .vn-facts').allInnerTexts()).join(' | ');
    await page.click('#vn-s-echo'); await page.waitForSelector('.vn-sheet');
    const vdet = await page.locator('.vn-sheet .vn-details').innerText();
    await closeSheets(page);
    if (off) {
      ok(`${who}: People cards and a person’s sheet leave the rate off`, !subs.includes('$') && !/Usual rate|\$/.test(details) && subs.includes('Session musician · Guitar'), `${subs} / ${details}`);
      ok(`${who}: …and the sheet’s walkthrough does not mention a rate`, sc.some(c => c.title === 'Details') && !sc.some(c => /rate/i.test(c.title + ' ' + c.text)), JSON.stringify(sc.map(c => c.title)));
      ok(`${who}: venue cards and the venue’s details leave the hire rate off`, !facts.includes('$') && !/Rate|\$/.test(vdet), `${facts} / ${vdet}`);
    } else {
      ok('everything: People cards and the sheet still show the rate', subs.includes('Session musician · Guitar · $180 per day') && /Usual rate\s*\$180 per day/.test(details), `${subs} / ${details}`);
      ok('everything: venue cards and details still show the hire rate', facts.includes('$45 per hour') && /Rate\s*\$45 per hour/.test(vdet), `${facts} / ${vdet}`);
    }
    allErrors.push(...errors);
    await browser.close();
  }

  /* ------------------------------- 320px with extra-large text: words and amounts stay whole ------------------------------- */
  {
    const prefs = `try { localStorage.setItem('tourbook-prefs', JSON.stringify({ text: 'xlarge', targets: 'large' })); } catch (e) { /* ignore */ }`;
    const { browser, page, errors } = await open({ sample: true, viewport: { width: 320, height: 700 }, init: roleInit('manager') + prefs });
    const wide = () => page.evaluate(() => document.documentElement.scrollWidth);
    await go(page, 'insurance'); await page.waitForSelector('.ins-card');
    let split = await splitWords(page, '.ins-title strong, .ins-title .muted, .ins-stats .stat b, .ins-stats .stat span, .ins-card .ins-pill');
    ok('320px, extra-large text: Insurance card titles, insurers, pills and figures wrap between words', split.length === 0, split.join(' | '));
    const pillUnder = await page.evaluate(() => [...document.querySelectorAll('.ins-card')].every(c => { const p = c.querySelector('.ins-pill'), t = c.querySelector('.ins-title'); return !p || p.getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 1; }));
    ok('…the renewal pill drops under the title when both do not fit', pillUnder);
    ok('…with no sideways scroll', (await wide()) <= 320, String(await wide()));
    await go(page, 'venues'); await page.waitForSelector('.vn-card');
    split = await splitWords(page, '.vn-card-name, .vn-card .vn-kind');
    ok('…venue names wrap between words', split.length === 0, split.join(' | '));
    await go(page, 'money'); await page.waitForSelector('.mn-stats');
    split = await splitWords(page, '.mn-stats .stat b, .mn-stats .stat span');
    ok('…Money’s amounts and labels are not split mid-number or mid-word', split.length === 0, split.join(' | '));
    await go(page, 'backline'); await page.waitForSelector('.bl-stats');
    split = await splitWords(page, '.bl-stats .stat b, .bl-stats .stat span');
    ok('…nor Backline’s', split.length === 0, split.join(' | '));
    ok('…with no sideways scroll on any of them', (await wide()) <= 320, String(await wide()));
    await tools(page);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.tl-tab')].map(t => { const n = t.querySelector('.tl-tab-name'), a = n.getBoundingClientRect(), b = t.getBoundingClientRect(); return { name: n.textContent.replace(/\u00AD/g, ''), fits: n.scrollWidth <= n.clientWidth + 1 && a.left >= b.left - 1 && a.right <= b.right + 1 }; }));
    split = await splitWords(page, '.tl-tab-name');
    ok('…every tool’s name fits its tab, Metronome whole (on two lines if it must, at its hyphen)', tabs.every(t => t.fits) && tabs.some(t => t.name === 'Metronome') && split.length === 0, JSON.stringify(tabs) + ' ' + split.join(' | '));
    allErrors.push(...errors);
    await browser.close();
  }
  {
    // At 420px with the usual text, the cards keep their look: the pill beside the name, Metronome not cut off.
    const { browser, page, errors } = await open({ sample: true, init: roleInit('manager') });
    await go(page, 'insurance'); await page.waitForSelector('.ins-card');
    // Beside: to the right of the title and insurer, and level with them (the pill is centred on their height, as before).
    const beside = await page.evaluate(() => { const c = document.querySelector('.ins-card[data-id="s-ins2"]'), p = c.querySelector('.ins-pill').getBoundingClientRect(), t = c.querySelector('.ins-title').getBoundingClientRect(); return p.left >= t.right && p.top < t.bottom && p.bottom > t.top; });
    ok('420px: an Insurance card keeps its renewal pill beside the title', beside);
    await go(page, 'venues'); await page.waitForSelector('.vn-card');
    const vBeside = await page.evaluate(() => { const c = document.querySelector('#vn-s-lantern'), p = c.querySelector('.vn-kind'), t = c.querySelector('.vn-card-name'); return Math.abs(p.getBoundingClientRect().top - t.getBoundingClientRect().top) < 12; });
    ok('…and a venue card its kind pill beside the name', vBeside);
    await tools(page);
    const metro = await page.evaluate(() => { const n = document.querySelector('#tl-tab-metronome .tl-tab-name'); return n.scrollWidth <= n.clientWidth + 1 && getComputedStyle(n).textOverflow !== 'ellipsis'; });
    ok('…and the Metronome tab reads in full, not “Metrono…”', metro);
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
  ok('then an audiophile, the meter', (await tools(page)) === 'meter' && (await stored(page, 'tourbook-tool-pick')) === null);
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

  // With one act's people on show, + Add is adding a member of that act: Band members, whatever the role's group.
  const actGroups = {};
  for (const r of ['manager', 'scout', 'producer', null]) {
    await asRole(page, r);
    await go(page, 'people'); await page.click('#pp-a-s-owls'); await sleep(150);
    actGroups[r || 'everything'] = await addGroup();
  }
  ok('with one act’s people on show, + Add starts in Band members for every role', Object.values(actGroups).every(g => g === 'band'), JSON.stringify(actGroups));
  await asRole(page, 'manager');
  await go(page, 'people'); await page.click('#pp-a-s-owls'); await sleep(150);
  await page.click('#pp-add'); await page.waitForSelector('.sheet [id$="-name"]');
  await page.fill('.sheet [id$="-name"]', 'Nia Drums');
  await page.click('.sheet button[type=submit]'); await sleep(300);
  const nia = await page.evaluate(() => import('./js/store.js').then(s => { const p = s.db.people.find(x => x.name === 'Nia Drums'); return p ? { id: p.id, group: p.group, owls: (s.byId('acts', 's-owls').members || []).includes(p.id) } : null; }));
  ok('…so a manager adding to The Night Owls saves a band member of it', !!nia && nia.group === 'band' && nia.owls, JSON.stringify(nia));
  if (nia) { await page.click(`#pp-open-${nia.id}`); await page.waitForSelector('.pp-sheet'); }
  ok('…who gets “Ask if they’re free”', (await page.locator('.pp-sheet #pp-ask').count()) === 1);
  await closeSheets(page);

  // The person form: while Group is Industry contacts, a hint says who gets Ask if they're free.
  const groupHint = () => page.evaluate(() => { const sel = document.querySelector('.sheet [data-key=group]'), n = sel && sel.closest('.field').querySelector('.pp-group-hint'); return n && !n.hidden ? { text: n.textContent, described: sel.getAttribute('aria-describedby') === n.id } : null; });
  await page.click('#pp-a-all'); await sleep(150);
  await page.click('#pp-add'); await page.waitForSelector('.sheet [data-key=group]');
  const hint = await groupHint();
  ok('manager: + Add (Industry contacts) says crew, players and band members get Ask if they’re free', !!hint && /^Crew, session players and band members get “🙋 Ask if they’re free”/.test(hint.text) && hint.described, JSON.stringify(hint));
  await page.selectOption('.sheet [data-key=group]', 'crew'); await sleep(100);
  ok('…and the hint goes once Crew is picked', (await groupHint()) === null);
  await page.selectOption('.sheet [data-key=group]', 'contact'); await sleep(100);
  ok('…and comes back for Industry contacts', !!(await groupHint()));
  await page.keyboard.press('Escape'); await page.waitForSelector('.sheet', { state: 'detached', timeout: 3000 }).catch(() => {});
  await asRole(page, null);
  await go(page, 'people'); await page.click('#pp-add'); await page.waitForSelector('.sheet [data-key=group]');
  ok('everything: + Add (Band members) shows no such hint', (await groupHint()) === null);
  await page.keyboard.press('Escape'); await page.waitForSelector('.sheet', { state: 'detached', timeout: 3000 }).catch(() => {});

  // People in the role's words: the act chip, a person's Acts and Past bookings, and the walkthrough titles.
  const peopleWords = async r => {
    await asRole(page, r);
    await go(page, 'people');
    const chip = await page.locator('#pp-a-all').innerText();
    const pageTitles = (await tourCards(page)).map(c => c.title);
    await page.click('#pp-open-s-maya'); await page.waitForSelector('.pp-sheet');
    const acts = await page.locator('.pp-sheet .pp-acts-sec h3').innerText(), past = await page.locator('.pp-sheet .pp-past .twirl-name').innerText();
    const sheetTitles = (await tourCards(page)).map(c => c.title);
    await closeSheets(page);
    return { chip, acts, past, pageTitles, sheetTitles };
  };
  for (const [r, chip, acts, past, bookings] of [[null, 'All acts', 'Acts', 'Past bookings', 'Bookings'], ['band', 'All bands', 'Bands', 'Past bookings', 'Bookings'], ['producer', 'All artists', 'Artists', 'Past bookings', 'Bookings'], ['scout', 'All acts', 'Acts', 'Past shows', 'Shows'], ['audiophile', 'All bands', 'Bands', 'Past gigs', 'Gigs']]) {
    const w = await peopleWords(r);
    ok(`${r || 'everything'}: People says “${chip}”, “${acts}” and “${past}”, and its walkthroughs “${acts}” and “${bookings}”`,
      w.chip === chip && w.acts.toLowerCase() === acts.toLowerCase() && w.past === past && w.pageTitles.includes(acts) && w.sheetTitles.includes(acts) && w.sheetTitles.includes(bookings), JSON.stringify(w));
  }
  await asRole(page, 'manager'); // the Money checks below are a manager's

  // Money: the manager's word for the year's income.
  const Y = await page.evaluate(() => import('./js/util.js').then(u => u.todayISO().slice(0, 4)));
  const earnedLabel = async () => { await go(page, 'money'); await page.waitForSelector('#mn-stat-earned'); return page.locator('#mn-stat-earned span').innerText(); };
  ok('manager: the year’s income reads “your acts earned”', (await earnedLabel()) === `your acts earned in ${Y}`, await page.locator('#mn-stat-earned span').innerText());
  const legend = async () => (await page.locator('.mn-legend span').first().innerText()).trim();
  const actRows = () => page.locator('.mn-act .mn-amt span').allInnerTexts();
  ok('…so do the chart’s legend and each act’s row under By act', (await legend()) === 'Your acts earned' && (await actRows()).length > 0 && (await actRows()).every(t => t === 'the act earned'), `${await legend()} / ${(await actRows()).join(', ')}`);
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
    ok(`${r || 'everything'}: …and the legend “Earned”, each act’s row “earned”`, (await legend()) === 'Earned' && (await actRows()).every(t => t === 'earned'), `${await legend()} / ${(await actRows()).join(', ')}`);
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

  // Settings no longer loads the sample (its toast named the role's Bookings): in no role's words does Settings offer it.
  // With the sample removed there is no Sample data section at all.
  const sampleOffer = async () => {
    await page.evaluate(() => import('./js/pages/settings.js').then(m => m.removeSample()));
    await go(page, 'settings');
    await page.waitForSelector('#se-role');
    return page.evaluate(() => ({ sec: document.querySelectorAll('#se-sample').length, load: document.querySelectorAll('#se-sample-load').length, words: /load (it again|the sample)|sample loaded:|try things out/i.test(document.getElementById('page').textContent) }));
  };
  let t = await sampleOffer();
  ok('a scout’s Settings offers no sample to load', t.sec === 0 && t.load === 0 && !t.words, JSON.stringify(t));
  await asRole(page, null);
  t = await sampleOffer();
  ok('…nor everything’s', t.sec === 0 && t.load === 0 && !t.words, JSON.stringify(t));

  allErrors.push(...errors);
  ok('no errors in the console', allErrors.length === 0, allErrors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL roles-pages crashed — ' + e.message); process.exit(1); });
