// Bands grouped by their main genre (item 12): the model's reading of a typed genre (a table of genres, the owner's
// examples, several genres, R&B, drum and bass, rock and roll, hip-hop, empty and junk), the acts list in fold-down
// groups (A to Z, then Unique, then No genre yet; a count; folded at first; folding by touch and by keyboard with the
// focus kept on the heading; open groups kept for the visit; groups only with two or more main genres), the page's own
// search opening the groups with a match, the search at the top finding a band by its main genre, the Main genre in the
// act form (Automatic (Rock) following the genre typed, set by hand, back to automatic, junk read as automatic, the press
// kit unchanged), every role's words, and 320 px with extra-large text and large buttons.
const { chromium } = require('playwright');
const { open, ok, sleep, go, topSheet, BASE } = require('../helpers.cjs');

const dayIso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const put = (page, recs) => page.evaluate(list => import('./js/store.js').then(s => list.forEach(r => s.upsert('acts', r))), recs).then(() => sleep(300));
const stored = (page, id) => page.evaluate(i => import('./js/store.js').then(s => JSON.parse(JSON.stringify(s.byId('acts', i) || null))), id);
const role = (page, id) => page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id).then(() => sleep(300));
// The headings on the list: [label, count shown, open?], and what a screen reader hears for one (its text without the
// parts hidden from it).
const heads = page => page.$$eval('.ac-group-head', bs => bs.map(b => [b.querySelector('.ac-group-name').textContent, b.querySelector('.ac-group-n [aria-hidden]').textContent, b.getAttribute('aria-expanded')]));
const spoken = (page, sel) => page.$eval(sel, b => { const c = b.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); });
const cardsIn = (page, key) => page.$$eval(`.ac-group[data-group="${key}"] .ac-card`, cs => cs.filter(c => c.offsetParent !== null).map(c => c.dataset.id));
const visibleCards = page => page.$$eval('.ac-card', cs => cs.filter(c => c.offsetParent !== null).map(c => c.dataset.id));
const focused = page => page.evaluate(() => (document.activeElement && document.activeElement.id) || '');
const tutorial = page => page.evaluate(() => import('./js/pages/acts.js').then(m => m.acts.tutorial().map(s => [s.title, s.text, (s.target || []).join(',')])));
const formSteps = (page, title) => page.evaluate(t => import('./js/tour.js').then(m => { const s = m.sheetSteps(t); return (typeof s === 'function' ? s() : s || []).map(x => [x.title, x.text, (x.target || []).join(',')]); }), title);
// The acts these checks use, besides the sample's The Night Owls (Indie rock) and Sable (Alt R&B).
const SEED = [
  { id: 't-rye', name: 'Rye Folk', genre: 'Folk rock', members: [], seen: [{ id: 'r1', date: dayIso(-30), rating: 99 }] },
  { id: 't-two', name: 'Indie Two', genre: 'Indie rock, electronic', members: [] },
  { id: 't-doom', name: 'Doom Choir', genre: 'Doom folk', members: [], bio: 'Slow songs for the end of the night.' },
  { id: 't-deep', name: 'Deep Blue', genre: 'Deep house', members: [] },
  { id: 't-odd', name: 'Odd Fellows', genre: 'Glittergaze', members: [] },
  { id: 't-none', name: 'No Label', members: [] },
];

(async () => {
  /* ---------------- the model: a typed genre and its main genre ---------------- */
  {
    const { browser, page, errors } = await open();
    const TABLE = [
      // the owner's examples, and the ones in the decision
      ['Indie rock', 'rock'], ['Folk rock', 'rock'], ['Doom folk', 'folk'], ['Pop punk', 'punk'], ['Shoegaze', 'rock'], ['Trap', 'hiphop'], ['House', 'electronic'], ['Doom metal', 'metal'], ['Synth pop', 'pop'],
      // rock
      ['Rock', 'rock'], ['Alt rock', 'rock'], ['Alternative', 'rock'], ['Indie', 'rock'], ['Garage rock', 'rock'], ['Grunge', 'rock'], ['Post-rock', 'rock'], ['Psych', 'rock'], ['Psychedelic rock', 'rock'], ['Prog', 'rock'],
      ['Stoner rock', 'rock'], ['Surf', 'rock'], ['Emo', 'rock'], ['Post-punk', 'rock'], ['Britpop', 'rock'], ['Rockabilly', 'rock'], ['Krautrock', 'rock'], ['Blues rock', 'rock'], ['Pop rock', 'rock'], ['Country rock', 'rock'],
      ['Rock and roll', 'rock'], ['Rock ’n’ Roll', 'rock'], ["rock'n'roll", 'rock'], ['Rock & Roll', 'rock'], ['rock-n-roll', 'rock'],
      // metal and punk
      ['Metal', 'metal'], ['Black metal', 'metal'], ['Death metal', 'metal'], ['Thrash', 'metal'], ['Sludge', 'metal'], ['Nu metal', 'metal'], ['Nu-metal', 'metal'], ['Djent', 'metal'], ['Metalcore', 'metal'], ['Folk metal', 'metal'],
      ['Stoner metal', 'metal'], ['Punk', 'punk'], ['Pop-punk', 'punk'], ['Punk rock', 'punk'], ['Hardcore', 'punk'], ['Post-hardcore', 'punk'], ['Ska punk', 'punk'], ['Riot grrrl', 'punk'],
      // pop and electronic
      ['Pop', 'pop'], ['Dream pop', 'pop'], ['Indie pop', 'pop'], ['K-pop', 'pop'], ['Electropop', 'pop'], ['Hyperpop', 'pop'], ['Easy listening', 'pop'],
      ['Electronic', 'electronic'], ['Deep house', 'electronic'], ['Techno', 'electronic'], ['Trance', 'electronic'], ['Drum and bass', 'electronic'], ['Drum & Bass', 'electronic'], ['DnB', 'electronic'], ['D&B', 'electronic'],
      ['drum’n’bass', 'electronic'], ['Dubstep', 'electronic'], ['Ambient', 'electronic'], ['IDM', 'electronic'], ['Synthwave', 'electronic'], ['Trip hop', 'electronic'], ['Trip-hop', 'electronic'], ['UK garage', 'electronic'],
      ['Dance', 'electronic'], ['Indie dance', 'electronic'], ['Disco', 'electronic'], ['Happy hardcore', 'electronic'], ['DJ', 'electronic'], ['Electro swing', 'electronic'],
      // hip hop, R&B and soul
      ['Hip hop', 'hiphop'], ['Hip-hop', 'hiphop'], ['HIP-HOP/RAP', 'hiphop'], ['Hiphop', 'hiphop'], ['Rap', 'hiphop'], ['Drill', 'hiphop'], ['UK drill', 'hiphop'], ['Grime', 'hiphop'], ['Boom bap', 'hiphop'], ['Jazz rap', 'hiphop'], ['Hip hop DJ', 'hiphop'],
      ['R&B', 'rnb'], ['r & b', 'rnb'], ['RnB', 'rnb'], ['R ’n’ B', 'rnb'], ['Alt R&B', 'rnb'], ['R&B / Soul', 'rnb'], ['Rhythm and blues', 'rnb'], ['Rhythm & Blues', 'rnb'], ['Neo-soul', 'rnb'], ['Soul', 'rnb'], ['Funk', 'rnb'], ['Motown', 'rnb'], ['New jack swing', 'rnb'],
      // folk and country
      ['Folk', 'folk'], ['Indie folk', 'folk'], ['Singer-songwriter', 'folk'], ['Singer/songwriter', 'folk'], ['Acoustic', 'folk'], ['Celtic', 'folk'],
      ['Country', 'country'], ['Alt-country', 'country'], ['Americana', 'country'], ['Bluegrass', 'country'], ['Country & Western', 'country'], ['Western swing', 'country'],
      // jazz, blues and classical
      ['Jazz', 'jazz'], ['Smooth jazz', 'jazz'], ['Bebop', 'jazz'], ['Big band', 'jazz'], ['Latin jazz', 'jazz'], ['Jazz orchestra', 'jazz'], ['Fusion', 'jazz'], ['Swing', 'jazz'],
      ['Blues', 'blues'], ['Delta blues', 'blues'], ['Classical', 'classical'], ['Opera', 'classical'], ['Choir', 'classical'], ['Neo-classical', 'classical'], ['Baroque', 'classical'], ['String quartet', 'classical'],
      // reggae and ska, Latin, world, gospel
      ['Reggae', 'reggae'], ['Ska', 'reggae'], ['Dub', 'reggae'], ['Dancehall', 'reggae'], ['Lovers rock', 'reggae'], ['Rocksteady', 'reggae'],
      ['Latin', 'latin'], ['Salsa', 'latin'], ['Reggaetón', 'latin'], ['Bossa nova', 'latin'], ['Latin pop', 'latin'], ['Música mexicana', 'latin'], ['Norteño', 'latin'], ['Cumbia', 'latin'], ['Flamenco', 'latin'],
      ['World', 'world'], ['Afrobeats', 'world'], ['Fado', 'world'], ['Klezmer', 'world'], ['World fusion', 'world'], ['Desert blues', 'world'],
      ['Gospel', 'gospel'], ['Gospel choir', 'gospel'], ['Christian rock', 'gospel'], ['Christian', 'gospel'], ['Worship', 'gospel'],
      // several genres: the first written that Gdex can place
      ['Indie rock, electronic', 'rock'], ['Electronic, indie rock', 'electronic'], ['Folk / jazz', 'folk'], ['Folk and country', 'folk'], ['Jazz & hip hop', 'jazz'], ['Soul; funk', 'rnb'],
      ['Folk with jazz influences', 'folk'], ['Rock band influenced by jazz', 'rock'], ['Jazz-influenced folk', 'folk'], ['Witchy, doom folk', 'folk'], ['Covers band, pop/rock', 'pop'], ['Drum and bass, techno', 'electronic'],
      // capitals, accents, hyphens, spaces
      ['INDIE ROCK', 'rock'], ['indie-rock', 'rock'], ['  folk   rock  ', 'rock'], ['HIP HOP', 'hiphop'], ['SHOEGAZE', 'rock'],
      // the labels themselves
      ['Hip hop & rap', 'hiphop'], ['R&B & soul', 'rnb'], ['Reggae & ska', 'reggae'], ['Gospel & Christian', 'gospel'],
      // custom genres: Unique; no genre at all: ''
      ['Glittergaze', 'unique'], ['Covers band', 'unique'], ['Function / wedding band', 'unique'], ['House band', 'unique'], ['asdf qwerty', 'unique'], ['12345', 'unique'], ['Unique', 'unique'],
      ['', ''], ['   ', ''], ['—', ''], ['???', ''], ['TBC', ''], ['n/a', ''], [', /', ''],
    ];
    const got = await page.evaluate(t => import('./js/model.js').then(m => t.map(([text]) => m.genreOf(text))), TABLE);
    const wrong = TABLE.map(([text, want], i) => [text, want, got[i]]).filter(([, want, g]) => want !== g);
    ok(`the model reads ${TABLE.length} typed genres as their main genre (the owner’s examples, several genres, R&B, drum and bass, rock and roll, hip-hop, empty and junk)`, TABLE.length >= 80 && !wrong.length, JSON.stringify(wrong));
    const m = await page.evaluate(() => import('./js/model.js').then(md => ({
      list: md.MAIN_GENRES, none: md.NO_GENRE,
      labels: md.MAIN_GENRES.map(([id, label]) => [id, md.genreOf(label)]),
      notText: [null, undefined, 42, {}, [], true].map(x => md.genreOf(x)),
      set: md.mainGenreOf({ genre: 'Doom folk', mainGenre: 'rock' }),
      setUnique: md.mainGenreOf({ genre: 'Deep house', mainGenre: 'unique' }),
      auto: md.mainGenreOf({ genre: 'Doom folk' }),
      junk: [md.mainGenreOf({ genre: 'Doom folk', mainGenre: 'banana' }), md.mainGenreOf({ genre: 'Doom folk', mainGenre: 'Rock' }), md.mainGenreOf({ genre: 'Doom folk', mainGenre: 5 }), md.mainGenreOf({ genre: 'Doom folk', mainGenre: null }), md.mainGenreOf({ genre: 'Doom folk', mainGenre: { id: 'rock' } }), md.mainGenreOf({ genre: 'Doom folk', mainGenre: '' })],
      empty: [md.mainGenreOf({}), md.mainGenreOf(null), md.mainGenreOf(undefined), md.mainGenreOf({ genre: 42 }), md.mainGenreOf('a string')],
      label: [md.mainGenreLabel('rnb'), md.mainGenreLabel(''), md.mainGenreLabel('nope')],
    })));
    ok('there are sixteen main genres in A to Z order, then Unique', m.list.length === 17 && m.list[16][0] === 'unique' && m.list[16][1] === 'Unique' && same(m.list.slice(0, 16).map(x => x[1]), m.list.slice(0, 16).map(x => x[1]).sort((a, b) => a.localeCompare(b))), JSON.stringify(m.list));
    ok('…named as the owner named them', same(m.list.map(x => x[1]).sort(), ['Blues', 'Classical', 'Country', 'Electronic', 'Folk', 'Gospel & Christian', 'Hip hop & rap', 'Jazz', 'Latin', 'Metal', 'Pop', 'Punk', 'R&B & soul', 'Reggae & ska', 'Rock', 'Unique', 'World']));
    ok('each main genre’s own name reads as that main genre', m.labels.every(([id, g]) => id === g), JSON.stringify(m.labels));
    ok('a genre that is not text is no genre', m.notText.every(x => x === ''), JSON.stringify(m.notText));
    ok('a main genre set by hand wins over the genre typed', same(m.set, { id: 'rock', label: 'Rock', auto: false }) && same(m.setUnique, { id: 'unique', label: 'Unique', auto: false }), JSON.stringify([m.set, m.setUnique]));
    ok('…and without one it is worked out', same(m.auto, { id: 'folk', label: 'Folk', auto: true }), JSON.stringify(m.auto));
    ok('anything else stored as the main genre reads as automatic', m.junk.every(x => same(x, { id: 'folk', label: 'Folk', auto: true })), JSON.stringify(m.junk));
    ok('an act with no genre (or none at all) is “No genre yet”', m.none === 'No genre yet' && m.empty.every(x => same(x, { id: '', label: 'No genre yet', auto: true })), JSON.stringify(m.empty));
    ok('a label for each id, “No genre yet” for none', same(m.label, ['R&B & soul', 'No genre yet', 'No genre yet']), JSON.stringify(m.label));
    ok('no errors in the console (the model)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- groups only with two or more main genres ---------------- */
  {
    const { browser, page, errors } = await open({ tab: 'acts' });
    await put(page, [{ id: 'f-a', name: 'Alpha', genre: 'Indie rock', members: [] }, { id: 'f-b', name: 'Bravo', genre: 'Garage rock', members: [] }, { id: 'f-c', name: 'Charlie', members: [] }]);
    await page.waitForSelector('.ac-card[data-id="f-c"]');
    ok('one main genre (and an act with no genre): the list is as it always was, with no headings', (await page.locator('.ac-group').count()) === 0 && same(await visibleCards(page), ['f-a', 'f-b', 'f-c']));
    await put(page, [{ id: 'f-d', name: 'Delta', genre: 'Glittergaze', members: [] }]);
    await page.waitForSelector('.ac-group-head');
    ok('a second main genre (Unique counts) puts the list in groups, folded', same(await heads(page), [['Rock', '2', 'false'], ['Unique', '1', 'false'], ['No genre yet', '1', 'false']]) && !(await visibleCards(page)).length, JSON.stringify(await heads(page)));
    ok('no errors in the console (one genre)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- the list in groups, by touch ---------------- */
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('gdex-tour', 'done'); localStorage.setItem('gdex-role-nudged', '1'); localStorage.setItem('gdex-ask-seen', 'off'); } catch (e) { /* ignore */ } });
  await ctx.route(/tile\.openstreetmap\.org|nominatim\.openstreetmap\.org|open-meteo\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE);
  await page.waitForSelector('#deck .dk-next');
  await page.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(150);
  await go(page, 'acts');
  await put(page, SEED);
  await page.waitForSelector('.ac-group-head');

  ok('the groups are the main genres A to Z, then Unique, then No genre yet, each with a count, all folded at first',
    same(await heads(page), [['Electronic', '1', 'false'], ['Folk', '1', 'false'], ['R&B & soul', '1', 'false'], ['Rock', '3', 'false'], ['Unique', '1', 'false'], ['No genre yet', '1', 'false']]), JSON.stringify(await heads(page)));
  ok('folded, no card shows', !(await visibleCards(page)).length);
  const shape = await page.$$eval('.ac-group-head', bs => bs.map(b => ({ tag: b.tagName, type: b.type, h: b.parentElement.tagName, ctl: b.getAttribute('aria-controls'), list: !!document.getElementById(b.getAttribute('aria-controls')), hidden: document.getElementById(b.getAttribute('aria-controls')).hidden })));
  ok('each heading is a button inside an h2 that controls its group’s list (hidden while folded)', shape.length === 6 && shape.every(s => s.tag === 'BUTTON' && s.type === 'button' && s.h === 'H2' && s.list && s.hidden), JSON.stringify(shape));
  ok('a heading is read out with its count in words', (await spoken(page, '#ac-grp-rock')) === 'Rock, 3 acts' && (await spoken(page, '#ac-grp-none')) === 'No genre yet, 1 act', await spoken(page, '#ac-grp-rock'));
  ok('the page heading is still the section’s name', (await page.textContent('#page .page-head h1')) === 'Acts');

  // a tap drops a group down; the role's order inside it (A to Z for Everything)
  await page.tap('#ac-grp-rock');
  await page.waitForSelector('#ac-grp-rock[aria-expanded="true"]');
  await sleep(100);
  ok('a tap on a heading drops its acts down, in the role’s order (A to Z)', same(await cardsIn(page, 'rock'), ['t-two', 't-rye', 's-owls']) && same(await visibleCards(page), ['t-two', 't-rye', 's-owls']), JSON.stringify(await visibleCards(page)));
  ok('…the group’s list is shown and the chevron turns', !(await page.$eval('#ac-grp-rock-list', el => el.hidden)) && (await page.locator('.ac-group[data-group="rock"].open').count()) === 1);
  ok('…and the heading keeps the focus after the redraw', (await focused(page)) === 'ac-grp-rock', await focused(page));
  // a card inside a group still drops open
  await page.tap('#ac-head-s-owls');
  await page.waitForSelector('#ac-pnl-s-owls');
  ok('a card inside an open group drops open as before', (await page.getAttribute('#ac-head-s-owls', 'aria-expanded')) === 'true');
  await page.tap('#ac-grp-rnb');
  await page.waitForSelector('#ac-grp-rnb[aria-expanded="true"]');
  ok('two groups can be open at once', same(await visibleCards(page), ['s-sablea', 't-two', 't-rye', 's-owls']), JSON.stringify(await visibleCards(page)));
  await page.tap('#ac-grp-rnb');
  await page.waitForSelector('#ac-grp-rnb[aria-expanded="false"]');
  await sleep(100);
  ok('a second tap folds it away again, with the focus still on its heading', !(await cardsIn(page, 'rnb')).length && (await focused(page)) === 'ac-grp-rnb', await focused(page));

  // the keyboard
  await page.focus('#ac-grp-folk');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#ac-grp-folk[aria-expanded="true"]');
  await sleep(100);
  ok('Enter on a heading drops it down, and the focus stays on it', same(await cardsIn(page, 'folk'), ['t-doom']) && (await focused(page)) === 'ac-grp-folk', await focused(page));
  await page.keyboard.press(' ');
  await page.waitForSelector('#ac-grp-folk[aria-expanded="false"]');
  await sleep(100);
  ok('Space folds it away again, and the focus stays on it', !(await cardsIn(page, 'folk')).length && (await focused(page)) === 'ac-grp-folk', await focused(page));
  await page.keyboard.press('Tab');
  ok('Tab goes from a folded heading to the next heading', (await focused(page)) === 'ac-grp-rnb', await focused(page));

  // a redraw, another section, a reload
  await page.focus('#ac-grp-rock');
  await page.evaluate(() => import('./js/store.js').then(s => s.upsert('venues', { id: 't-v', name: 'Somewhere' })));
  await sleep(350);
  ok('after a change to the data the open groups stay open, and the heading keeps the focus', (await page.getAttribute('#ac-grp-rock', 'aria-expanded')) === 'true' && (await focused(page)) === 'ac-grp-rock', await focused(page));
  await go(page, 'venues');
  await go(page, 'acts');
  ok('the groups opened stay open for the visit (another section and back)', same((await heads(page)).filter(x => x[2] === 'true').map(x => x[0]), ['Rock']), JSON.stringify(await heads(page)));

  /* the page's own search */
  const search = async q => { await page.fill('#ac-search', q); await sleep(150); };
  await search('electronic');
  ok('the search opens every group with a match and leaves out the rest', same(await heads(page), [['Electronic', '1', 'true'], ['Rock', '1', 'true']]) && same(await visibleCards(page), ['t-deep', 't-two']), JSON.stringify(await heads(page)));
  ok('…a house act is found by its main genre, Electronic', (await page.evaluate(() => import('./js/pages/acts.js').then(m => import('./js/store.js').then(s => m.actSearchText(s.byId('acts', 't-deep')))))).includes('electronic'));
  await page.tap('#ac-grp-rock');
  await page.waitForSelector('#ac-grp-rock[aria-expanded="false"]');
  await sleep(100);
  ok('a group can be folded during a search, keeping the focus', same(await visibleCards(page), ['t-deep']) && (await focused(page)) === 'ac-grp-rock' && (await page.inputValue('#ac-search')) === 'electronic');
  await search('electroni');
  ok('…and opens again when the words change', same(await visibleCards(page), ['t-deep', 't-two']));
  await search('nothing like this');
  ok('nothing found says so', /No act matches/.test(await page.textContent('.ac-list')) && !(await page.locator('.ac-group').count()));
  await search('');
  ok('clearing the search puts the folds back as they were', same(await heads(page), [['Electronic', '1', 'false'], ['Folk', '1', 'false'], ['R&B & soul', '1', 'false'], ['Rock', '3', 'true'], ['Unique', '1', 'false'], ['No genre yet', '1', 'false']]), JSON.stringify(await heads(page)));

  /* the search at the top of every page, and an act opened from it */
  const all = q => page.evaluate(w => import('./js/search.js').then(m => m.searchReady().then(() => m.searchAll(w))), q);
  ok('the search at the top finds a house act by “electronic”', ((await all('electronic')).bands || []).includes('t-deep'), JSON.stringify(await all('electronic')));
  await page.evaluate(() => import('./js/pages/acts.js').then(m => m.openActCard('t-odd')));
  await sleep(300);
  ok('an act opened from the search opens its group and its card, with the focus on it', (await page.getAttribute('#ac-grp-unique', 'aria-expanded')) === 'true' && (await page.getAttribute('#ac-head-t-odd', 'aria-expanded')) === 'true' && (await focused(page)) === 'ac-head-t-odd', await focused(page));

  /* the walkthrough of the list */
  let steps = await tutorial(page);
  const gs = steps.find(s => s[0] === 'Main genres');
  ok('the list’s walkthrough explains the groups, pointing at a heading', !!gs && gs[2] === '.ac-group-head' && /Your acts are grouped by main genre, A to Z/.test(gs[1]) && /indie rock and folk rock are Rock, doom folk is Folk/.test(gs[1]) && /Unique/.test(gs[1]) && /No genre yet/.test(gs[1]) && /An act’s ✎ Edit sets its main genre by hand/.test(gs[1]), JSON.stringify(gs));
  ok('…right after the cards, and its search step speaks of the main genre', steps.findIndex(s => s[0] === 'Main genres') === steps.findIndex(s => s[2].startsWith('.ac-card,')) + 1 && /its main genre/.test(steps.find(s => s[0] === 'Search')[1]) && /groups with a match open/.test(steps.find(s => s[0] === 'Search')[1]));
  // run it on a list whose groups are all folded: the cards' step drops the first group open, so it has a card to show
  await page.reload();
  await page.waitForSelector('#deck .dk-next');
  await go(page, 'acts');
  await page.waitForSelector('.ac-group-head');
  await page.click('#helpBtn');
  await page.waitForSelector('.tour-card');
  const titles = [];
  for (let i = 0; i < 9 && await page.locator('.tour-card').count(); i++) { titles.push(await page.textContent('#tour-title')); await page.click('.tour-actions .btn.primary'); await sleep(700); }
  ok('the walkthrough runs through the cards, the groups and the drop-down on a folded list', ['Your acts', 'Main genres', 'Drop it open', 'Dates coming up', 'Search'].every(t => titles.includes(t)), titles.join(' › '));
  ok('…and leaves open the first group with dates coming up (Sable’s), as a tap would', same((await heads(page)).filter(x => x[2] === 'true').map(x => x[0]), ['R&B & soul']), JSON.stringify(await heads(page)));

  /* the act form: Main genre */
  const editForm = async id => {
    await page.evaluate(i => import('./js/pages/acts.js').then(m => m.openAct(i)), id);
    await page.waitForSelector('.ac-view .ac-title');
    await page.click('#ac-edit');
    await page.waitForSelector('.sheet[aria-label="Edit act"] select[data-key=mainGenre]');
    return topSheet(page);
  };
  let form = await editForm('t-doom');
  const sel = form.locator('select[data-key=mainGenre]');
  const place = await sel.evaluate(s => ({ before: !!s.closest('.field').previousElementSibling.querySelector('input[data-key=genre]'), label: s.closest('.field').querySelector('label').textContent, hint: (s.closest('.field').querySelector('small') || {}).textContent || '', options: [...s.options].map(o => [o.value, o.textContent]), value: s.value }));
  const models = await page.evaluate(() => import('./js/model.js').then(md => md.MAIN_GENRES));
  ok('the form has “Main genre” under Genre', place.before && place.label === 'Main genre', JSON.stringify(place));
  ok('…its choices: “Automatic (Folk)”, then the sixteen and Unique', same(place.options, [['', 'Automatic (Folk)'], ...models]) && place.value === '', JSON.stringify(place.options.slice(0, 3)));
  ok('…with a line saying what it is for', place.hint === 'The heading it’s listed under in Acts. Automatic goes by the genre above.', place.hint);
  const genreBox = form.locator('input[data-key=genre]');
  const autoText = () => sel.evaluate(s => s.options[0].textContent);
  await genreBox.fill('Indie rock');
  const t1 = await autoText();
  await genreBox.fill('');
  const t2 = await autoText();
  await genreBox.fill('Glittergaze');
  const t3 = await autoText();
  await genreBox.fill('Doom folk');
  ok('“Automatic (…)” follows the genre as it is typed', t1 === 'Automatic (Rock)' && t2 === 'Automatic (no genre yet)' && t3 === 'Automatic (Unique)' && (await autoText()) === 'Automatic (Folk)', [t1, t2, t3].join(' | '));
  await sel.selectOption('rock');
  await form.locator('button[type=submit]').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  await sleep(250);
  let a = await stored(page, 't-doom');
  ok('a main genre picked by hand is saved on the act, and the genre stays as typed', a.mainGenre === 'rock' && a.genre === 'Doom folk', JSON.stringify([a.mainGenre, a.genre]));
  await page.click('#ac-tab-epk');
  await page.waitForSelector('.ac-paper .cs-doc');
  ok('the press kit keeps the genre as typed', (await page.textContent('.ac-paper .ac-doc-intro .cs-sub')) === 'Doom folk' && !/\bRock\b/.test(await page.textContent('.ac-paper')));
  await page.click('.ac-view .back-btn');
  await page.waitForSelector('.ac-list');
  if ((await page.getAttribute('#ac-grp-rock', 'aria-expanded')) !== 'true') { await page.tap('#ac-grp-rock'); await page.waitForSelector('#ac-grp-rock[aria-expanded="true"]'); await sleep(100); }
  ok('the list puts it under Rock, and Folk has gone', (await cardsIn(page, 'rock')).includes('t-doom') && !(await page.locator('#ac-grp-folk').count()), JSON.stringify(await heads(page)));
  ok('“rock” now finds it, in the search at the top too', (await page.evaluate(() => import('./js/pages/acts.js').then(m => import('./js/store.js').then(s => m.actSearchText(s.byId('acts', 't-doom')))))).includes('rock') && ((await all('rock')).bands || []).includes('t-doom'));
  // the search at the top says why a doom folk band came up for "rock"
  await page.fill('#srch-box', 'rock');
  await page.waitForSelector('#srch-q');
  await page.click('#srch-tab-bands');
  await page.waitForSelector('.srch-rec[data-id="t-doom"]');
  ok('…and its row there says why: Main genre: Rock', (await page.textContent('.srch-rec[data-id="t-doom"] .srch-why')) === 'Main genre: Rock', await page.textContent('.srch-rec[data-id="t-doom"]'));
  await page.keyboard.press('Escape'); await sleep(250);

  form = await editForm('t-doom');
  ok('the form shows the main genre set by hand', (await form.locator('select[data-key=mainGenre]').inputValue()) === 'rock');
  await form.locator('select[data-key=mainGenre]').selectOption('');
  await form.locator('button[type=submit]').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  await sleep(250);
  a = await stored(page, 't-doom');
  ok('back to Automatic leaves no main genre stored, and it is under Folk again', !('mainGenre' in a) && (await page.evaluate(() => import('./js/model.js').then(md => import('./js/store.js').then(s => md.mainGenreOf(s.byId('acts', 't-doom')).id)))) === 'folk', JSON.stringify(a));
  form = await editForm('t-rye');
  await form.locator('button[type=submit]').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  await sleep(250);
  ok('an act saved on Automatic is not given an empty main genre', !('mainGenre' in (await stored(page, 't-rye'))));
  // junk stored as the main genre reads as automatic, in the list and in the form
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('acts', 't-odd', { mainGenre: 'banana' })));
  await sleep(300);
  form = await editForm('t-odd');
  ok('a main genre that is no main genre reads as Automatic in the form', (await form.locator('select[data-key=mainGenre]').inputValue()) === '' && (await form.locator('select[data-key=mainGenre] option').first().textContent()) === 'Automatic (Unique)');
  await form.locator('button[type=submit]').click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  await sleep(250);
  ok('…and saving it clears it', !('mainGenre' in (await stored(page, 't-odd'))));
  // the New act form, and its walkthrough
  await page.click('.ac-view .back-btn');
  await page.waitForSelector('#ac-new');
  await page.click('#ac-new');
  await page.waitForSelector('.sheet[aria-label="New act"] select[data-key=mainGenre]');
  ok('a new act starts on Automatic (no genre yet)', (await topSheet(page).locator('select[data-key=mainGenre]').inputValue()) === '' && (await topSheet(page).locator('select[data-key=mainGenre] option').first().textContent()) === 'Automatic (no genre yet)');
  const fs = await formSteps(page, 'New act');
  const fm = fs.find(s => s[0] === 'Main genre');
  ok('the act form’s walkthrough has a Main genre step, after Earlier names', !!fm && fm[2] === 'select[data-key=mainGenre]' && fs[1][0] === 'Earlier names' && fs[2][0] === 'Main genre' && /^The heading it sits under on the list\./.test(fm[1]) && /Automatic works it out from the genre/.test(fm[1]) && !/\bbands?\b|\bartists?\b/i.test(fm[1]), JSON.stringify(fs.map(s => s[0])));
  await topSheet(page).locator('input[data-key=name]').fill('Hand Set');
  await topSheet(page).locator('input[data-key=genre]').fill('Noise');
  await topSheet(page).locator('select[data-key=mainGenre]').selectOption('punk');
  await topSheet(page).locator('button[type=submit]').click();
  await page.waitForSelector('.ac-view .ac-title');
  a = await page.evaluate(() => import('./js/store.js').then(s => JSON.parse(JSON.stringify(s.db.acts.find(x => x.name === 'Hand Set')))));
  ok('a new act can be given its main genre as it is made', a.mainGenre === 'punk' && a.genre === 'Noise', JSON.stringify(a));
  ok('no errors in the console (the list and the form)', errors.length === 0, errors.slice(0, 5).join(' | '));

  /* ---------------- every role ---------------- */
  const ROLE_WORDS = [['producer', 'Artists', 'artist', 'An artist’s'], ['manager', 'Roster', 'act', 'An act’s'], ['band', 'Bands', 'band', 'A band’s'], ['solo', 'My act', 'act', 'An act’s'],
    ['scout', 'Acts', 'act', 'An act’s'], ['audiophile', 'Bands', 'band', 'A band’s'], ['all', 'Acts', 'act', 'An act’s']];
  await page.evaluate(() => import('./js/store.js').then(s => s.remove('acts', s.db.acts.find(x => x.name === 'Hand Set').id)));
  for (const [id, name, w, owner] of ROLE_WORDS) {
    await role(page, id);
    await go(page, 'acts');
    await page.evaluate(() => { const b = document.querySelector('.ac-view .back-btn'); if (b) b.click(); });
    await page.waitForSelector('#ac-grp-rock');
    if ((await page.getAttribute('#ac-grp-rock', 'aria-expanded')) !== 'true') { await page.tap('#ac-grp-rock'); await page.waitForSelector('#ac-grp-rock[aria-expanded="true"]'); await sleep(100); }
    const order = await cardsIn(page, 'rock');
    const want = { scout: ['t-rye', 's-owls', 't-two'], audiophile: ['s-owls', 't-rye', 't-two'] }[id] || ['t-two', 't-rye', 's-owls'];
    const st = (await tutorial(page)).find(s => s[0] === 'Main genres');
    await page.click('#ac-new');
    await page.waitForSelector('.sheet[aria-label="New act"] select[data-key=mainGenre]');
    const hint = await topSheet(page).locator('select[data-key=mainGenre]').evaluate(s => s.closest('.field').querySelector('small').textContent);
    const fstep = (await formSteps(page, 'New act')).find(s => s[0] === 'Main genre');
    await page.keyboard.press('Escape'); await sleep(250);
    ok(`${id}: “${name}” in groups, read out in its words, in its own order inside a group, with its words in the list’s walkthrough and the form’s hint (the form’s walkthrough fits a band and a solo artist alike)`,
      (await page.textContent('#page .page-head h1')) === name && (await spoken(page, '#ac-grp-rock')) === `Rock, 3 ${w}s` && same(order, want)
      && !!st && st[1].startsWith(`Your ${w}s are grouped by main genre`) && st[1].includes(`${owner} ✎ Edit sets its main genre by hand`)
      && hint === `The heading it’s listed under in ${name}. Automatic goes by the genre above.` && !!fstep && fstep[1].startsWith('The heading it sits under on the list.'),
      JSON.stringify({ h1: await page.textContent('#page .page-head h1'), said: await spoken(page, '#ac-grp-rock'), order, st: st && st[1].slice(0, 60), hint, f: fstep && fstep[1].slice(0, 60) }));
  }
  ok('no errors in the console (every role)', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ---------------- 320 px, extra-large text and large buttons ---------------- */
  {
    const prefs = `try { localStorage.setItem('gdex-prefs', ${JSON.stringify(JSON.stringify({ text: 'xlarge', targets: 'large' }))}); } catch (e) { /* ignore */ }`;
    const { browser: b2, page: p2, errors: e2 } = await open({ sample: true, viewport: { width: 320, height: 700 }, init: prefs });
    await go(p2, 'acts');
    await put(p2, [...SEED, { id: 't-gos', name: 'The Sunday Morning Gospel Singers of the Valley', genre: 'Gospel', members: [] }, { id: 't-hip', name: 'MC Longname', genre: 'Hip-hop', members: [] }]);
    await p2.waitForSelector('#ac-grp-gospel');
    const wide = () => p2.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    const inside = (sel, box) => p2.evaluate(([s, b]) => [...document.querySelectorAll(s)].every(el => { const a = el.getBoundingClientRect(), o = el.closest(b).getBoundingClientRect(); return a.width > 0 && a.left >= o.left - 0.5 && a.right <= o.right + 0.5; }), [sel, box]);
    const is = await p2.evaluate(() => ({ text: document.documentElement.dataset.text, hit: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit')) }));
    ok('320px: extra-large text and large buttons are on', is.text === 'xlarge' && is.hit >= 54, JSON.stringify(is));
    const hd = await p2.$eval('#ac-grp-gospel', el => { const r = el.getBoundingClientRect(); return { right: r.right, h: r.height }; });
    ok('320px: the headings fit the screen, their names, counts and chevrons inside them, each a full-size button', (await wide(p2)) <= 320 && await inside('.ac-group-name, .ac-group-n, .ac-group-head .ac-chev', '.ac-group-head') && hd.right <= 320 && hd.h >= is.hit, JSON.stringify([await wide(p2), hd]));
    await p2.click('#ac-grp-gospel');
    await p2.waitForSelector('#ac-grp-gospel[aria-expanded="true"]');
    await p2.click('#ac-head-t-gos');
    await p2.waitForSelector('#ac-pnl-t-gos');
    ok('320px: an open group with an open card does not push the page sideways', (await wide(p2)) <= 320 && await inside('.ac-group-list .ac-card', '.ac-group'), String(await wide(p2)));
    if (process.env.S) await p2.screenshot({ path: `${process.env.S}/47-genres-320-xlarge.png` });
    await p2.evaluate(() => import('./js/pages/acts.js').then(m => m.openAct('t-gos')));
    await p2.waitForSelector('#ac-edit');
    await p2.click('#ac-edit');
    await p2.waitForSelector('.sheet[aria-label="Edit act"] select[data-key=mainGenre]');
    await topSheet(p2).locator('select[data-key=mainGenre]').scrollIntoViewIfNeeded();
    const fits = await p2.evaluate(() => { const b = [...document.querySelectorAll('.sheet-body')].pop(), s = b.querySelector('select[data-key=mainGenre]').getBoundingClientRect(), o = b.getBoundingClientRect(); return b.scrollWidth <= b.clientWidth + 1 && s.right <= o.right + 0.5; });
    ok('320px: the form’s Main genre fits', fits && (await wide(p2)) <= 320);
    ok('no errors in the console (320px)', e2.length === 0, e2.slice(0, 5).join(' | '));
    await b2.close();
  }
})().catch(e => { console.log('FAIL genres spec crashed — ' + e.message); process.exit(1); });
