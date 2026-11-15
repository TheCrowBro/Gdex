// Songs in fold-downs (item 13): a song's album or release (the form's box with the act's albums already typed offered,
// what is stored, junk read as no album, two spellings of one album), the songs list in folds (with songs of two or more
// acts a fold per act, A to Z, No act last, each holding a fold per album, A to Z, Singles & unreleased last; with songs
// of one act its album folds only; with no album either, the list as it always was), the songs inside a fold A to Z,
// folded at first and kept open for the visit, real disclosure buttons (aria-expanded, aria-controls, counts, the words
// a screen reader hears), touch and keyboard with the focus kept through folding and redraws, the page's own search
// opening the folds with a match and leaving out the rest, the folds in place of the act chips (setlists keep theirs),
// the search at the top finding a song by its album and opening it in its folds, the song sheet, the walkthroughs,
// every role's words, the press kit and printed setlists unchanged, and 320 px with extra-large text and large buttons.
const { open, ok, sleep, go, topSheet } = require('../helpers.cjs');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = { timeout: 15000 };
// The headings of the top folds: [name, count shown, open?]; of the folds inside one (an act's albums).
const heads = page => page.$$eval('.sg-folds > .sg-fold > .sg-fold-h > .sg-fold-head', bs => bs.map(b => [b.querySelector('.sg-fold-name').textContent, b.querySelector('.sg-fold-n').textContent, b.getAttribute('aria-expanded')]));
const inner = (page, id) => page.$$eval(`#${id}-list > .sg-fold > .sg-fold-h > .sg-fold-head`, bs => bs.map(b => [b.querySelector('.sg-fold-name').textContent, b.querySelector('.sg-fold-n').textContent, b.getAttribute('aria-expanded')]));
// The song titles shown straight inside a fold's list, in order; every song card on show.
const songsIn = (page, id) => page.$$eval(`#${id}-list > .sg-song`, cs => cs.filter(c => c.offsetParent !== null).map(c => c.querySelector('.sg-title').textContent));
const shown = page => page.$$eval('.sg-song', cs => cs.filter(c => c.offsetParent !== null).map(c => c.dataset.fk.replace('pg-song-', '')));
const spoken = (page, sel) => page.locator(sel).ariaSnapshot().then(t => (t.match(/button "([^"]*)"/) || [])[1] || t);
const focused = page => page.evaluate(() => (document.activeElement && document.activeElement.id) || '');
const focusedFk = page => page.evaluate(() => (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk || '' : ''));
const role = (page, id) => page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id).then(() => sleep(300));
const stored = (page, id) => page.evaluate(i => import('./js/store.js').then(s => JSON.parse(JSON.stringify(s.byId('songs', i) || null))), id);
const tutorial = page => page.evaluate(() => import('./js/pages/songs.js').then(m => m.songs.tutorial().map(s => [s.title, s.text, (s.target || []).join(',')])));
const toggle = async (page, id, want) => { await page.click('#' + id); await page.waitForSelector(`#${id}[aria-expanded="${want}"]`, T); await sleep(80); };
// The sample's songs (The Night Owls: 8, Sable: 2) with albums, an act of one song with none (Moth Choir, sorted before
// both), and two songs with no act. "harbour lights ep" is the same album as "Harbour Lights EP", spelt the other way.
const seed = page => page.evaluate(() => import('./js/store.js').then(s => { s.loadSample(); s.update(d => {
  const set = (id, album) => { d.songs.find(x => x.id === id).album = album; };
  set('s-song1', 'Harbour Lights EP'); set('s-song2', 'harbour lights ep'); set('s-song3', 'Harbour Lights EP');
  set('s-song4', 'Afterglow'); set('s-song5', ' Afterglow ');
  set('s-sable1', 'Glasshouse');
  d.acts.push({ id: 't-moth', name: 'Moth Choir', members: [] });
  d.songs.push({ id: 'x-moth', title: 'Moth Song', actId: 't-moth', album: { junk: true }, status: 'demo' },
    { id: 'x-loose', title: 'Loose Ends', status: 'idea' }, { id: 'x-field', title: 'Field Recording', album: 'Tapes', status: 'idea' });
  d.setlists.push({ id: 'x-sableset', name: 'Sable set', actId: 's-sablea', gap: 20, items: [{ id: 'q1', songId: 's-sable1' }] });
}); })).then(() => sleep(300));

(async () => {
  /* ---------------- the model: a song's album ---------------- */
  {
    const { browser, page, errors } = await open();
    const TABLE = [
      [{ album: 'Harbour Lights EP' }, 'Harbour Lights EP'], [{ album: '  Harbour   Lights  EP ' }, 'Harbour Lights EP'], [{ album: 1989 }, '1989'],
      [{}, ''], [{ album: '' }, ''], [{ album: '   ' }, ''], [{ album: '—' }, ''], [{ album: '?!' }, ''], [{ album: null }, ''], [{ album: true }, ''],
      [{ album: ['A'] }, ''], [{ album: { name: 'A' } }, ''], [{ album: NaN }, ''], [{ album: 'n/a' }, ''], [{ album: 'N/A' }, ''], [{ album: 'TBC' }, ''],
      [{ album: 'Single' }, ''], [{ album: 'non-album single' }, ''], [{ album: 'Unreleased' }, ''], [{ album: 'None' }, ''], [{ album: 'Singles & unreleased' }, ''],
      [{ album: 'The Singles' }, 'The Singles'], [{ album: 'Unreleased Demos' }, 'Unreleased Demos'], [{ album: 'Álbum Único' }, 'Álbum Único'], [null, ''], ['text', ''], [undefined, ''],
    ];
    const got = await page.evaluate(t => import('./js/model.js').then(m => t.map(([s]) => m.albumOf(s))), TABLE);
    const bad = TABLE.map(([s, want], i) => (got[i] === want ? '' : `${JSON.stringify(s)} → ${JSON.stringify(got[i])} (want ${JSON.stringify(want)})`)).filter(Boolean);
    ok('albumOf: the album as typed with its spaces tidied; none for no text, no letter or digit, or words that say there is none (junk reads as no album)', got.every((g, i) => g === TABLE[i][1]), bad.join(' | ') || JSON.stringify(got));
    const keys = await page.evaluate(() => import('./js/model.js').then(m => [m.albumKey('Harbour Lights EP') === m.albumKey('harbour lights e.p.'), m.albumKey('Afterglow') !== m.albumKey('Afterglow II'), m.albumKey('n/a'), m.NO_ALBUM]));
    ok('albumKey tells albums apart but for capitals, spaces and punctuation; NO_ALBUM is “Singles & unreleased”', keys[0] && keys[1] && keys[2] === '' && keys[3] === 'Singles & unreleased', JSON.stringify(keys));
    ok('no errors in the console (the model)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- songs of one act: as it always was, then album folds only ---------------- */
  {
    const { browser, page, errors } = await open({ tab: 'songs' });
    await page.evaluate(() => import('./js/store.js').then(s => { s.upsert('acts', { id: 'o-me', name: 'Solo Me', members: [] }); ['Bright', 'Above', 'Copper'].forEach((t, i) => s.upsert('songs', { id: 'o-' + i, title: t, actId: 'o-me' })); }));
    await page.waitForSelector('.sg-song', T);
    ok('songs of one act and no album: the list is as it always was, under the act’s name, A to Z, with no folds', (await page.locator('.sg-fold').count()) === 0 && (await page.textContent('.sg-group h3')).includes('Solo Me') && same(await page.$$eval('.sg-song .sg-title', e => e.map(x => x.textContent)), ['Above', 'Bright', 'Copper']));
    let steps = await tutorial(page);
    ok('…and its walkthrough says so, with no step about folds', steps[0][1] === 'Every song with its key, tempo, length and status, grouped by act.' && !steps.some(s => s[2] === '.sg-fold-head'), JSON.stringify(steps.map(s => s[0])));
    await page.evaluate(() => import('./js/store.js').then(s => s.patch('songs', 'o-1', { album: 'First Light' })));
    await page.waitForSelector('.sg-fold-head', T);
    ok('one song given an album: album folds only, no fold for the act, “Singles & unreleased” last, folded', (await page.locator('.sg-fold-act').count()) === 0 && same(await heads(page), [['First Light', '1', 'false'], ['Singles & unreleased', '2', 'false']]) && !(await shown(page)).length, JSON.stringify(await heads(page)));
    ok('…each heading a button inside an h2', same(await page.$$eval('.sg-fold-head', bs => bs.map(b => b.parentElement.tagName)), ['H2', 'H2']));
    steps = await tutorial(page);
    const fs = steps.find(s => s[2] === '.sg-fold-head');
    ok('…and the walkthrough speaks of album folds only', !!fs && fs[0] === 'By album' && fs[1] === 'The songs fold under each album or release, A to Z, with Singles & unreleased last. Tap a heading to open or close it.' && steps[0][1].endsWith('by album.'), JSON.stringify(fs));
    // An album whose letters spell "none" is an album of its own, with an id of its own (not Singles & unreleased's).
    await page.evaluate(() => import('./js/store.js').then(s => s.patch('songs', 'o-2', { album: 'N.O.N.E' })));
    await page.waitForSelector('.sg-fold-head >> text=N.O.N.E', T);
    const ids = await page.$$eval('#page [id]', els => els.map(e => e.id));
    ok('an album called “N.O.N.E” has a fold and ids of its own, apart from Singles & unreleased', same((await heads(page)).map(x => x[0]), ['First Light', 'N.O.N.E', 'Singles & unreleased']) && ids.length === new Set(ids).size && ids.includes('sg-alb-o-me-none_') && ids.includes('sg-alb-o-me-none'), JSON.stringify(ids.filter(i => i.startsWith('sg-alb'))));
    ok('no errors in the console (one act)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ---------------- songs of several acts, by touch ---------------- */
  const { browser, page, errors } = await open({ touch: true });
  await seed(page);
  await go(page, 'songs');
  await page.waitForSelector('.sg-fold-head', T);
  ok('a fold per act, A to Z, then No act, each with its count, all folded at first',
    same(await heads(page), [['Moth Choir', '1', 'false'], ['Sable', '2', 'false'], ['The Night Owls', '8', 'false'], ['No act', '2', 'false']]) && !(await shown(page)).length, JSON.stringify(await heads(page)));
  const shape = await page.$$eval('.sg-folds > .sg-fold > .sg-fold-h > .sg-fold-head', bs => bs.map(b => ({ tag: b.tagName, type: b.type, h: b.parentElement.tagName, ctl: b.getAttribute('aria-controls'), list: !!document.getElementById(b.getAttribute('aria-controls')), hidden: document.getElementById(b.getAttribute('aria-controls')).hidden, empty: !document.getElementById(b.getAttribute('aria-controls')).children.length })));
  ok('each heading is a button inside an h2 that controls its fold’s list (hidden and empty while folded)', shape.length === 4 && shape.every(s => s.tag === 'BUTTON' && s.type === 'button' && s.h === 'H2' && s.list && s.hidden && s.empty), JSON.stringify(shape));
  ok('a heading is read out with its count in words', (await spoken(page, '#sg-act-s-owls')) === 'The Night Owls, 8 songs' && (await spoken(page, '#sg-act-t-moth')) === 'Moth Choir, 1 song', await spoken(page, '#sg-act-s-owls'));
  ok('the folds take the place of the act chips on the songs list', (await page.locator('.sg-acts').count()) === 0);

  // a tap drops an act down: its albums A to Z, Singles & unreleased last, each folded with its count
  await page.tap('#sg-act-s-owls');
  await page.waitForSelector('#sg-act-s-owls[aria-expanded="true"]', T); await sleep(100);
  ok('a tap on an act drops down its albums, A to Z, then Singles & unreleased, each folded with its count (two spellings are one album, under the one most of its songs use)',
    same(await inner(page, 'sg-act-s-owls'), [['Afterglow', '2', 'false'], ['Harbour Lights EP', '3', 'false'], ['Singles & unreleased', '3', 'false']]) && !(await shown(page)).length, JSON.stringify(await inner(page, 'sg-act-s-owls')));
  ok('…the act’s list is shown and its chevron turns; an album’s heading is a button inside an h3', !(await page.$eval('#sg-act-s-owls-list', el => el.hidden)) && (await page.locator('.sg-fold-act[data-act="s-owls"].open').count()) === 1 && same(await page.$$eval('#sg-act-s-owls-list .sg-fold-head', bs => [...new Set(bs.map(b => b.parentElement.tagName))]), ['H3']));
  const tree = await page.locator('.sg-fold-act[data-act="s-owls"]').ariaSnapshot();
  ok('…read out as an open button, “The Night Owls, 8 songs”, over a group of the same name holding its albums', /button "The Night Owls, 8 songs" \[expanded\]/.test(tree) && /group "The Night Owls, 8 songs"/.test(tree) && /button "Harbour Lights EP, 3 songs"/.test(tree), tree.split('\n').slice(0, 4).join(' | '));
  ok('…and the heading keeps the focus after the redraw', (await focused(page)) === 'sg-act-s-owls', await focused(page));
  await page.tap('#sg-alb-s-owls-harbourlightsep');
  await page.waitForSelector('#sg-alb-s-owls-harbourlightsep[aria-expanded="true"]', T); await sleep(100);
  ok('a tap on an album drops down its songs, in the list’s order (A to Z)', same(await songsIn(page, 'sg-alb-s-owls-harbourlightsep'), ['Harbour Lights', 'Low Tide', 'Paper Moon']) && same(await shown(page), ['s-song1', 's-song3', 's-song2']), JSON.stringify(await shown(page)));
  await page.tap('#sg-alb-s-owls-none');
  await page.waitForSelector('#sg-alb-s-owls-none[aria-expanded="true"]', T); await sleep(100);
  ok('Singles & unreleased holds the act’s songs with no album, A to Z', same(await songsIn(page, 'sg-alb-s-owls-none'), ['Ghost Signal', 'Lanterns', 'Last Ferry Home']), JSON.stringify(await songsIn(page, 'sg-alb-s-owls-none')));
  await page.tap('#sg-act-t-moth');
  await page.waitForSelector('#sg-act-t-moth[aria-expanded="true"]', T); await sleep(100);
  // The owner: "Songs with none go in a SINGLES & UNRELEASED fold, last in each band", so an act with no album has one too
  // (once any song has an album: the sample, with none anywhere, lists each act's songs straight in its fold).
  ok('an act none of whose songs has an album holds a lone Singles & unreleased fold, folded (junk stored as an album reads as none)', same(await inner(page, 'sg-act-t-moth'), [['Singles & unreleased', '1', 'false']]) && !(await songsIn(page, 'sg-act-t-moth')).length, JSON.stringify(await inner(page, 'sg-act-t-moth')));
  await page.tap('#sg-alb-t-moth-none');
  await page.waitForSelector('#sg-alb-t-moth-none[aria-expanded="true"]', T); await sleep(100);
  ok('…which a tap drops down to its song', same(await songsIn(page, 'sg-alb-t-moth-none'), ['Moth Song']) && (await focused(page)) === 'sg-alb-t-moth-none', await focused(page));
  await page.tap('#sg-act-none');
  await page.waitForSelector('#sg-act-none[aria-expanded="true"]', T); await sleep(100);
  ok('No act comes after the acts, and folds its songs by album too', same(await inner(page, 'sg-act-none'), [['Tapes', '1', 'false'], ['Singles & unreleased', '1', 'false']]), JSON.stringify(await inner(page, 'sg-act-none')));
  await page.tap('#sg-act-none');
  await page.waitForSelector('#sg-act-none[aria-expanded="false"]', T); await sleep(100);
  ok('a second tap folds it away again, with the focus still on its heading', (await page.locator('#sg-act-none-list > *').count()) === 0 && (await focused(page)) === 'sg-act-none', await focused(page));
  ok('several folds can be open at once', same(await shown(page), ['x-moth', 's-song1', 's-song3', 's-song2', 's-song6', 's-song7', 's-song8']), JSON.stringify(await shown(page)));

  // the keyboard
  await page.focus('#sg-act-s-sablea');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#sg-act-s-sablea[aria-expanded="true"]', T); await sleep(100);
  ok('Enter on a heading drops it down, and the focus stays on it', same(await inner(page, 'sg-act-s-sablea'), [['Glasshouse', '1', 'false'], ['Singles & unreleased', '1', 'false']]) && (await focused(page)) === 'sg-act-s-sablea', await focused(page));
  await page.keyboard.press('Tab');
  ok('Tab goes from an open act to its first album', (await focused(page)) === 'sg-alb-s-sablea-glasshouse', await focused(page));
  await page.keyboard.press(' ');
  await page.waitForSelector('#sg-alb-s-sablea-glasshouse[aria-expanded="true"]', T); await sleep(100);
  ok('Space on an album drops it down, and the focus stays on it', same(await songsIn(page, 'sg-alb-s-sablea-glasshouse'), ['Glasshouse']) && (await focused(page)) === 'sg-alb-s-sablea-glasshouse', await focused(page));
  await page.keyboard.press('Tab');
  ok('…Tab then reaches its song', (await focusedFk(page)) === 'pg-song-s-sable1', await focusedFk(page));
  await page.focus('#sg-act-s-sablea');
  await page.keyboard.press(' ');
  await page.waitForSelector('#sg-act-s-sablea[aria-expanded="false"]', T); await sleep(100);
  ok('Space folds an act away again, the focus still on it', (await focused(page)) === 'sg-act-s-sablea' && !(await page.locator('#sg-act-s-sablea-list > *').count()), await focused(page));
  await page.keyboard.press('Tab');
  ok('Tab goes from a folded act to the next heading', (await focused(page)) === 'sg-act-s-owls', await focused(page));
  await page.keyboard.press('Enter');
  await page.waitForSelector('#sg-act-s-owls[aria-expanded="false"]', T);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#sg-act-s-owls[aria-expanded="true"]', T); await sleep(100);
  ok('an act folded and opened again keeps its albums as they were', same(await inner(page, 'sg-act-s-owls'), [['Afterglow', '2', 'false'], ['Harbour Lights EP', '3', 'true'], ['Singles & unreleased', '3', 'true']]), JSON.stringify(await inner(page, 'sg-act-s-owls')));

  // a redraw after a change to the data, another section, a reload
  await page.focus('#sg-alb-s-owls-harbourlightsep');
  await page.evaluate(() => import('./js/store.js').then(s => s.upsert('venues', { id: 't-v', name: 'Somewhere' })));
  await sleep(400);
  ok('after a change to the data the open folds stay open, and the heading keeps the focus', (await page.getAttribute('#sg-alb-s-owls-harbourlightsep', 'aria-expanded')) === 'true' && (await focused(page)) === 'sg-alb-s-owls-harbourlightsep', await focused(page));
  await go(page, 'venues');
  await go(page, 'songs');
  ok('the folds opened stay open for the visit (another section and back)', same((await heads(page)).filter(x => x[2] === 'true').map(x => x[0]), ['Moth Choir', 'The Night Owls']) && same(await inner(page, 'sg-act-s-owls'), [['Afterglow', '2', 'false'], ['Harbour Lights EP', '3', 'true'], ['Singles & unreleased', '3', 'true']]), JSON.stringify(await heads(page)));

  /* the page's own search */
  const search = async q => { await page.fill('#sg-q', q); await sleep(200); };
  await search('harbour lights ep');
  ok('the search finds songs by their album, opens every fold with a match and leaves out the rest; the counts are the matches',
    same(await heads(page), [['The Night Owls', '3', 'true']]) && same(await inner(page, 'sg-act-s-owls'), [['Harbour Lights EP', '3', 'true']]) && same(await shown(page), ['s-song1', 's-song3', 's-song2']), JSON.stringify([await heads(page), await inner(page, 'sg-act-s-owls')]));
  ok('…the search box keeps the focus while typing', (await focused(page)) === 'sg-q');
  await search('t');
  const tHeads = await heads(page);
  ok('a search that matches in several acts opens each of them, even ones folded before', tHeads.every(x => x[2] === 'true') && tHeads.some(x => x[0] === 'Sable'), JSON.stringify(tHeads));
  await search('afterglow');
  await page.tap('#sg-act-s-owls');
  await page.waitForSelector('#sg-act-s-owls[aria-expanded="false"]', T); await sleep(100);
  ok('a fold can be folded during a search, keeping the focus', !(await shown(page)).length && (await focused(page)) === 'sg-act-s-owls' && (await page.inputValue('#sg-q')) === 'afterglow');
  await search('afterglo');
  ok('…and opens again when the words change', same(await shown(page), ['s-song5', 's-song4']), JSON.stringify(await shown(page)));
  await search('nothing like this');
  ok('nothing found says so, with a way to clear the search', /No songs match/.test(await page.textContent('#page')) && !(await page.locator('.sg-fold').count()) && (await page.locator('#page .empty button:has-text("Clear the search")').count()) === 1);
  await search('');
  ok('clearing the search puts the folds back as they were', same(await heads(page), [['Moth Choir', '1', 'true'], ['Sable', '2', 'false'], ['The Night Owls', '8', 'true'], ['No act', '2', 'false']]) && same(await inner(page, 'sg-act-s-owls'), [['Afterglow', '2', 'false'], ['Harbour Lights EP', '3', 'true'], ['Singles & unreleased', '3', 'true']]), JSON.stringify(await heads(page)));

  /* setlists keep their chips */
  await page.click('#sg-view-setlists'); await sleep(250);
  ok('the setlists keep their act chips', same(await page.$$eval('.sg-acts .chip', cs => cs.map(c => c.textContent)), ['All', 'Sable', 'The Night Owls']));
  await page.click('.sg-acts .chip:has-text("Sable")'); await sleep(200);
  ok('…which still filter them', same(await page.$$eval('.sg-setlist', cs => cs.map(c => c.dataset.fk)), ['pg-sl-x-sableset']));
  await page.click('#sg-view-songs'); await sleep(250);
  ok('back on the songs, the chip picked for setlists hides no song: the folds are as they were', (await page.locator('.sg-acts').count()) === 0 && same((await heads(page)).map(x => x[1]), ['1', '2', '8', '2']));

  /* the song form: Album or release */
  await page.click('#sg-new-song');
  await page.waitForSelector('.sheet[aria-label="Add a song"] input[data-key=album]', T);
  let form = topSheet(page);
  const labels = await form.locator('.field > label').allTextContents();
  ok('the song form has “Album or release” straight after Act', labels.indexOf('Album or release') === labels.indexOf('Act') + 1 && labels.indexOf('Act') > 0, labels.slice(0, 4).join(' | '));
  const box = form.locator('input[data-key=album]');
  const offered = () => box.evaluate(i => [...document.getElementById(i.getAttribute('list')).options].map(o => o.value));
  const hint = await box.evaluate(i => i.closest('.field').querySelector('small').textContent);
  ok('…its hint, in the role’s words', hint === 'The act’s albums are suggested. Leave it empty for a single or unreleased song: it goes under Singles & unreleased.', hint);
  const o1 = await offered();
  await form.locator('select[data-key=actId]').selectOption('s-owls');
  const o2 = await offered();
  await form.locator('select[data-key=actId]').selectOption('t-moth');
  const o3 = await offered();
  ok('it offers the albums already typed for the act picked, A to Z, and follows the Act box (No act: Tapes; The Night Owls: Afterglow, Harbour Lights EP; an act with none: nothing)', same(o1, ['Tapes']) && same(o2, ['Afterglow', 'Harbour Lights EP']) && same(o3, []), JSON.stringify([o1, o2, o3]));
  await form.locator('select[data-key=actId]').selectOption('s-owls');
  await form.locator('input[data-key=title]').fill('Night Drive');
  await box.fill('  Midnight   Sessions ');
  await form.locator('button[type=submit]').click();
  await page.waitForSelector('.sheet', { state: 'detached' }); await sleep(400);
  const nd = await page.evaluate(() => import('./js/store.js').then(s => JSON.parse(JSON.stringify(s.db.songs.find(x => x.title === 'Night Drive')))));
  ok('a new song is stored with its album, its spaces tidied', nd && nd.album === 'Midnight Sessions' && nd.actId === 's-owls', JSON.stringify(nd));
  ok('…its new album has a fold of its own in its place, A to Z, opened so the song is on the list', same(await inner(page, 'sg-act-s-owls'), [['Afterglow', '2', 'false'], ['Harbour Lights EP', '3', 'true'], ['Midnight Sessions', '1', 'true'], ['Singles & unreleased', '3', 'true']]) && same(await songsIn(page, 'sg-alb-s-owls-midnightsessions'), ['Night Drive']), JSON.stringify(await inner(page, 'sg-act-s-owls')));
  // a song moved to another album from its sheet: the fold it goes to opens, and the focus comes back to its card
  await page.click('[data-fk="pg-song-s-song8"]');
  await page.waitForSelector('.sheet[aria-label="Song"]', T);
  ok('the song sheet has no Album for a song with none', !(await topSheet(page).locator('.sg-fact span:text-is("Album")').count()));
  await topSheet(page).locator('[data-fk="sg-edit"]').click();
  await page.waitForSelector('.sheet[aria-label="Edit song"] input[data-key=album]', T);
  form = topSheet(page);
  ok('the Edit form offers the song’s act’s albums', same(await form.locator('input[data-key=album]').evaluate(i => [...document.getElementById(i.getAttribute('list')).options].map(o => o.value)), ['Afterglow', 'Harbour Lights EP', 'Midnight Sessions']));
  await form.locator('input[data-key=album]').fill('afterglow');
  await form.locator('button[type=submit]').click();
  await sleep(500);
  const fact = await topSheet(page).locator('.sg-fact', { hasText: 'Album' }).textContent();
  ok('the song sheet shows its album as it was typed', fact === 'Albumafterglow', fact);
  await page.keyboard.press('Escape'); await sleep(300);
  ok('the song now sits in Afterglow (one album, whatever the capitals), opened, and its card has the focus back', same(await inner(page, 'sg-act-s-owls'), [['Afterglow', '3', 'true'], ['Harbour Lights EP', '3', 'true'], ['Midnight Sessions', '1', 'true'], ['Singles & unreleased', '2', 'true']]) && same(await songsIn(page, 'sg-alb-s-owls-afterglow'), ['Last Ferry Home', 'Northbound', 'Static Hearts']) && (await focusedFk(page)) === 'pg-song-s-song8', JSON.stringify([await inner(page, 'sg-act-s-owls'), await focusedFk(page)]));
  // junk stored as an album: the form's box is empty, and saving stores none
  await page.click('[data-fk="pg-song-x-moth"]');
  await page.waitForSelector('.sheet[aria-label="Song"]', T);
  await topSheet(page).locator('[data-fk="sg-edit"]').click();
  await page.waitForSelector('.sheet[aria-label="Edit song"] input[data-key=album]', T);
  ok('junk stored as an album shows an empty box in the form', (await topSheet(page).locator('input[data-key=album]').inputValue()) === '');
  await topSheet(page).locator('button[type=submit]').click(); await sleep(400);
  ok('…and saving the form stores no album', (await stored(page, 'x-moth')).album === '');
  await page.keyboard.press('Escape'); await sleep(300);

  /* the search at the top of every page */
  const all = q => page.evaluate(w => import('./js/search.js').then(m => m.searchReady().then(() => m.searchAll(w))), q);
  ok('the search at the top finds a song by its album', same([...((await all('harbour lights ep')).songs || [])].sort(), ['s-song1', 's-song2', 's-song3']) && same((await all('tapes')).songs, ['x-field']), JSON.stringify(await all('harbour lights ep')));
  const agree = await page.evaluate(() => Promise.all([import('./js/pages/songs.js'), import('./js/store.js')]).then(([m, s]) => m.songText(s.byId('songs', 's-song4')).includes('afterglow') && !m.songText(s.byId('songs', 'x-moth')).includes('object')));
  ok('…through the songs page’s own words (songText), which hold the album and never junk', agree);
  await page.focus('#sg-act-s-owls'); await page.keyboard.press('Enter'); // the act folded, so the search has to open it
  await page.waitForSelector('#sg-act-s-owls[aria-expanded="false"]', T);
  await go(page, 'tools');
  await page.fill('#srch-box', 'midnight sessions');
  await page.waitForSelector('#srch-q', T); await sleep(300);
  await page.click('#srch-tab-songs');
  await page.waitForSelector('.srch-rec[data-rec="songs"]', T);
  const why = await page.textContent('.srch-rec[data-rec="songs"] .srch-why').catch(() => '');
  ok('…and its row says why: “Album: Midnight Sessions”', why === 'Album: Midnight Sessions', why);
  await page.click('.srch-rec[data-rec="songs"]');
  await page.waitForSelector('.sheet[aria-label="Song"]', T); await sleep(300);
  ok('a song opened from it opens on Songs with its act and album unfolded, its sheet over the list', (await page.evaluate(() => window.logiPage())) === 'songs' && (await page.getAttribute('#sg-act-s-owls', 'aria-expanded')) === 'true' && (await page.getAttribute('#sg-alb-s-owls-midnightsessions', 'aria-expanded')) === 'true');
  await page.keyboard.press('Escape'); await sleep(300);
  ok('…and closing the sheet puts the focus on its card in the list', (await focusedFk(page)) === 'pg-song-' + nd.id, await focusedFk(page));

  /* the press kit and printed setlists are unchanged */
  const docs = await page.evaluate(() => Promise.all([import('./js/setlist.js'), import('./js/acts-docs.js'), import('./js/store.js')]).then(([sl, ad, s]) => {
    const list = s.byId('setlists', 's-clubset');
    return [sl.stageDoc(list).textContent, sl.setlistText(list), ad.epkDoc(s.byId('acts', 's-owls')).textContent].join('\n');
  }));
  ok('the printed setlist, its text and the press kit carry no album', !/Harbour Lights EP|Afterglow|afterglow|Midnight Sessions|Singles & unreleased/.test(docs) && /Harbour Lights/.test(docs));

  /* the walkthrough */
  let steps = await tutorial(page);
  const fstep = steps.find(s => s[2] === '.sg-fold-head');
  ok('the songs walkthrough explains the folds, after Songs and setlists and before Search, in the role’s words',
    !!fstep && fstep[0] === 'By act and album' && fstep[1] === 'Each act’s songs fold under its name, A to Z. Songs with no act come last, under No act. Inside, they fold under each album or release, A to Z, with Singles & unreleased last. Tap a heading to open or close it.'
    && steps.indexOf(fstep) === steps.findIndex(s => s[0] === 'Songs and setlists') + 1 && steps[steps.indexOf(fstep) + 1][0] === 'Search', JSON.stringify(steps.map(s => s[0])));
  ok('…its first step, its search step and its Add a song step speak of albums', steps[0][1] === 'Every song with its key, tempo, length and status, by act and album.' && steps.find(s => s[0] === 'Search')[1] === 'Find a song by title, album, key, tuning, ISRC or writer. The folds with a match open; clear the search and they are as they were.' && /^Title, album or release,/.test(steps.find(s => s[0] === 'Add a song')[1]) && !steps.some(s => s[2] === '.sg-acts'));
  const sheetStep = await page.evaluate(() => import('./js/tour.js').then(m => (m.sheetSteps('Song') || []).find(s => s.title === 'Key, tempo, length').text));
  ok('the song sheet’s walkthrough speaks of the album', /Its album or release, if any, is its fold on the songs list\./.test(sheetStep), sheetStep);
  await page.reload(); await page.waitForSelector('#deck .dk-next');
  await go(page, 'songs');
  ok('a reload folds every fold again', (await heads(page)).every(x => x[2] === 'false') && !(await shown(page)).length, JSON.stringify(await heads(page)));
  await page.click('#helpBtn');
  await page.waitForSelector('.tour-card', T);
  const titles = [];
  for (let i = 0; i < 8 && await page.locator('.tour-card').count(); i++) { titles.push(await page.textContent('#tour-title')); await page.click('.tour-actions .btn.primary'); await sleep(700); }
  ok('the walkthrough runs through the folds and, on a folded list, drops the first one open (and its first album) to show a song', same(titles, ['Songs', 'Songs and setlists', 'By act and album', 'Search', 'A song', 'Add a song']) && same((await heads(page)).filter(x => x[2] === 'true').map(x => x[0]), ['Moth Choir']) && same(await songsIn(page, 'sg-alb-t-moth-none'), ['Moth Song']), titles.join(' › ') + ' / ' + JSON.stringify(await heads(page)));
  ok('no errors in the console (the list, the form, the search)', errors.length === 0, errors.slice(0, 5).join(' | '));

  /* ---------------- every role that has Songs, and one that reaches it as a bonus track ---------------- */
  const ROLE_WORDS = [['producer', 'artist', 'An'], ['band', 'band', 'A'], ['solo', 'act', 'An'], ['all', 'act', 'An'], ['manager', 'act', 'An']];
  for (const [id, w] of ROLE_WORDS) {
    await role(page, id);
    await go(page, 'songs');
    if ((await page.getAttribute('#sg-view-songs', 'aria-pressed')) !== 'true') { await page.click('#sg-view-songs'); await sleep(250); } // a band opens on its setlists
    await page.waitForSelector('#sg-act-none', T);
    const onMenu = await page.evaluate(() => import('./js/roles.js').then(m => m.menuSections().includes('songs')));
    const st = (await tutorial(page)).find(s => s[2] === '.sg-fold-head');
    await page.click('#sg-new-song');
    await page.waitForSelector('.sheet[aria-label="Add a song"] input[data-key=album]', T);
    const h = await topSheet(page).locator('input[data-key=album]').evaluate(i => i.closest('.field').querySelector('small').textContent);
    await page.keyboard.press('Escape'); await sleep(250);
    ok(`${id}: ${id === 'manager' ? 'Songs as a bonus track' : 'Songs on its menu'}, in folds, its words for songs with no ${w} (“No ${w}”), in the walkthrough and in the form’s hint`,
      onMenu === (id !== 'manager') && (await page.textContent('#sg-act-none .sg-fold-name')) === `No ${w}` && (await spoken(page, '#sg-act-none')) === `No ${w}, 2 songs`
      && !!st && st[0] === `By ${w} and album` && st[1].startsWith(`Each ${w}’s songs fold under its name, A to Z. Songs with no ${w} come last, under No ${w}.`)
      && h === `The ${w}’s albums are suggested. Leave it empty for a single or unreleased song: it goes under Singles & unreleased.`,
      JSON.stringify({ onMenu, name: await page.textContent('#sg-act-none .sg-fold-name'), st: st && st[1].slice(0, 70), h }));
  }
  ok('no errors in the console (every role)', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ---------------- 320 px, extra-large text and large buttons ---------------- */
  {
    const prefs = `try { localStorage.setItem('tourbook-prefs', ${JSON.stringify(JSON.stringify({ text: 'xlarge', targets: 'large' }))}); } catch (e) { /* ignore */ }`;
    const { browser: b2, page: p2, errors: e2 } = await open({ viewport: { width: 320, height: 700 }, init: prefs });
    await seed(p2);
    await p2.evaluate(() => import('./js/store.js').then(s => { s.upsert('acts', { id: 't-long', name: 'The Sunday Morning Gospel Singers of the Valley', members: [] }); s.upsert('songs', { id: 'x-long', title: 'A Very Long Song Title Indeed For A Small Screen', actId: 't-long', album: 'Live at the Grand Old Opera House, Volume Two (Remastered Deluxe Edition)' }); }));
    await go(p2, 'songs');
    await p2.waitForSelector('#sg-act-t-long', T);
    const wide = () => p2.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    const inside = (sel, boxSel) => p2.evaluate(([s, b]) => [...document.querySelectorAll(s)].every(el => { const a = el.getBoundingClientRect(), o = el.closest(b).getBoundingClientRect(); return a.width > 0 && a.left >= o.left - 0.5 && a.right <= o.right + 0.5; }), [sel, boxSel]);
    const is = await p2.evaluate(() => ({ text: document.documentElement.dataset.text, hit: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit')) }));
    ok('320px: extra-large text and large buttons are on', is.text === 'xlarge' && is.hit >= 54, JSON.stringify(is));
    await p2.click('#sg-act-t-long'); await p2.waitForSelector('#sg-act-t-long[aria-expanded="true"]', T);
    const albumId = await p2.$eval('#sg-act-t-long-list .sg-fold-head', b => b.id);
    await p2.click('#' + albumId); await p2.waitForSelector(`#${albumId}[aria-expanded="true"]`, T); await sleep(150);
    const hd = await p2.$$eval('.sg-fold-head', bs => bs.map(b => { const r = b.getBoundingClientRect(); return { right: r.right, h: r.height }; }));
    ok('320px: every heading fits the screen, its name, count and chevron inside it, each a full-size button, with a long act and a long album open', (await wide()) <= 320 && await inside('.sg-fold-name, .sg-fold-n, .sg-fold-head .sg-chev', '.sg-fold-head') && hd.every(x => x.right <= 320 && x.h >= is.hit), JSON.stringify([await wide(), hd.slice(0, 3)]));
    ok('320px: the open album’s song card stays inside its fold and the page is not pushed sideways', (await wide()) <= 320 && await inside('.sg-fold-list .sg-song', '.sg-fold-album') && (await p2.locator(`#${albumId}-list .sg-song`).count()) === 1);
    if (process.env.S) await p2.screenshot({ path: `${process.env.S}/48-song-folds-320-xlarge.png` });
    await p2.click('#sg-new-song');
    await p2.waitForSelector('.sheet[aria-label="Add a song"] input[data-key=album]', T);
    await topSheet(p2).locator('input[data-key=album]').scrollIntoViewIfNeeded();
    const fits = await p2.evaluate(() => { const b = [...document.querySelectorAll('.sheet-body')].pop(), s = b.querySelector('input[data-key=album]').getBoundingClientRect(), o = b.getBoundingClientRect(); return b.scrollWidth <= b.clientWidth + 1 && s.right <= o.right + 0.5; });
    ok('320px: the form’s Album or release fits', fits && (await wide()) <= 320);
    ok('no errors in the console (320px)', e2.length === 0, e2.slice(0, 5).join(' | '));
    await b2.close();
  }
})().catch(e => { console.log('FAIL song folds crashed — ' + e.message); process.exit(1); });
