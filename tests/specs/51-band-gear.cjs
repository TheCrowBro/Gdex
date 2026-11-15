// Each band's gear in a fold, with what you put in (item 17): an item's For band (actId) and Paid by (paidBy) as the model
// reads them (junk, a deleted act or person, old gear and old backups), the store clearing them when an act or a person
// is deleted, the two boxes in every role's gear form, the Backline page in a fold per band for a producer, a manager
// and Jack of Trades (A to Z, then "Not for an act"; the count, the total value at value × quantity and "your investment",
// only what you paid; folded at first, by touch and by keyboard with the focus kept, kept for the visit; the page's
// search and owner chips inside the folds), the search at the top finding an item by its band's names and opening its
// fold, the walkthroughs, every role (Backline on the producer's and the manager's menus, right after their acts), no
// figures without money, the words a screen reader hears, and 320 px with extra-large text and large buttons.
const { open, ok, sleep, go, topSheet } = require('../helpers.cjs');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const role = (page, id) => page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id).then(() => sleep(350));
// The headings on the page: [name, count shown, open?]; their figures: [value, your investment] ('' when not shown).
const heads = page => page.$$eval('#page .bl-band-head', bs => bs.map(b => [b.querySelector('.bl-band-name').textContent, b.querySelector('.bl-band-n').textContent, b.getAttribute('aria-expanded')]));
const figures = page => page.$$eval('#page .bl-band-head', bs => bs.map(b => [(b.querySelector('.bl-band-worth b') || { textContent: '' }).textContent, (b.querySelector('.bl-band-mine b') || { textContent: '' }).textContent]));
// What a screen reader hears for an element (its name as the browser works it out, from the accessibility tree).
const spoken = (page, sel, kind = 'button') => page.locator(sel).first().ariaSnapshot().then(t => (t.match(new RegExp(kind + ' "([^"]*)"')) || [])[1] || t);
const visibleCards = page => page.$$eval('#page .bl-card', cs => cs.filter(c => c.offsetParent !== null).map(c => c.dataset.id));
const cardsIn = (page, key) => page.$$eval(`#page .bl-band[data-band="${key}"] .bl-card`, cs => cs.filter(c => c.offsetParent !== null).map(c => c.dataset.id));
const focused = page => page.evaluate(() => (document.activeElement && document.activeElement.id) || '');
const gearOf = (page, id) => page.evaluate(i => import('./js/store.js').then(s => JSON.parse(JSON.stringify(s.byId('gear', i) || null))), id);
const pageText = page => page.evaluate(() => document.getElementById('page').innerText);
// Ties items to acts and payers, as a backup or another device might have them.
const tie = (page, map) => page.evaluate(m => import('./js/store.js').then(s => s.update(d => { for (const [id, f] of Object.entries(m)) { const g = d.gear.find(x => x.id === id); Object.assign(g, f); g.updatedAt = Date.now(); } })), map).then(() => sleep(350));
const steps = page => page.evaluate(() => import('./js/pages/backline.js').then(m => m.backline.tutorial().map(s => [s.title, s.text, (s.target || []).join(','), !!s.before])));
const formSteps = (page, title) => page.evaluate(t => import('./js/tour.js').then(m => { const s = m.sheetSteps(t); return (typeof s === 'function' ? s() : s || []).map(x => [x.title, x.text, (x.target || []).join(',')]); }), title);
const welcome = page => page.evaluate(() => import('./js/tour.js').then(m => { const st = m.welcomeSteps(); return { tracks: st.find(s => s.title === 'Your sections are tracks').text, last: st[st.length - 1].text }; }));
// The form's two boxes: their labels, options and the value picked, and the hints under them.
const boxes = page => page.evaluate(() => {
  const sh = [...document.querySelectorAll('.sheet')].pop(), one = key => { const s = sh.querySelector(`select[data-key=${key}]`); if (!s) return null; const f = s.closest('.field');
    return { label: sh.querySelector(`label[for="${s.id}"]`).textContent, options: [...s.options].map(o => [o.value, o.textContent]), value: s.value, hint: (f.querySelector('small') || { textContent: '' }).textContent }; };
  return { act: one('actId'), paid: one('paidBy'), order: [...sh.querySelectorAll('[data-key]')].map(e => e.dataset.key) };
});
// The sample's items tied to its two acts, and three more (U 87, Juno, two bass cabs). Profile name: Sample Producer.
const EXTRA = [
  { id: 'x-u87', name: 'Vocal mic', category: 'Microphones', make: 'Neumann', model: 'U 87 Ai', serial: 'U87-5521', value: 3200, actId: 's-sablea', paidBy: 'me' },
  { id: 'x-juno', name: 'Juno-106', category: 'Keys & synths', make: 'Roland', model: 'Juno-106', value: 1450, actId: 's-sablea', paidBy: 's-sable' },
  { id: 'x-cab', name: 'Bass cab', category: 'Amps & cabs', make: 'Ampeg', model: 'SVT-410HLF', value: 1100, qty: 2, actId: 's-owls', paidBy: 'me' },
];
const TIES = {
  's-tele': { actId: 's-owls', paidBy: 'band' }, 's-pbass': { actId: 's-owls', paidBy: 's-leo' }, 's-hotrod': { actId: 's-owls', paidBy: 'me' },
  's-sm58': { actId: 's-owls', paidBy: 'me' }, 's-apollo': { actId: 's-sablea', paidBy: 'me' }, 's-mbp': { actId: 's-sablea' },
};
const seed = page => page.evaluate(extra => import('./js/store.js').then(s => s.update(d => { d.gear.push(...extra.map(g => ({ ...g, createdAt: Date.now(), updatedAt: Date.now() }))); })), EXTRA).then(() => tie(page, TIES));

(async () => {
  const { browser, page, errors } = await open({ sample: true });

  /* ---------------- the data, as the model reads it ---------------- */
  const data = await page.evaluate(() => import('./js/model.js').then(m => {
    const r = g => [m.gearActId(g), m.gearPaidBy(g)];
    return {
      plain: r({ id: 'x', name: 'Old' }), good: r({ actId: 's-owls', paidBy: 's-maya' }), me: r({ actId: 's-sablea', paidBy: 'me' }), band: r({ paidBy: 'band' }),
      gone: r({ actId: 'no-such-act', paidBy: 'no-such-person' }),
      junk: [r({ actId: 42, paidBy: { x: 1 } }), r({ actId: ['s-owls'], paidBy: true }), r({ actId: null, paidBy: 'ME' }), r({ actId: '', paidBy: ' me' }), r(null), r(undefined)],
      worth: m.gearWorth([{ value: 100, qty: 3 }, { value: '50' }, { value: 'junk', qty: 2 }, { value: 20, qty: 'x' }]),
      mine: m.gearInvested([{ value: 100, qty: 3, paidBy: 'me' }, { value: 50, paidBy: 'band' }, { value: 70, qty: 2, paidBy: '' }, { value: 10, paidBy: 's-maya' }, { value: 5, qty: 2, paidBy: 'me' }, { qty: 4, paidBy: 'me' }]),
      empty: [m.gearWorth([]), m.gearInvested(null), m.gearWorth(undefined)],
    };
  }));
  ok('an item without the keys (old gear) is for no act, paid by not known', same(data.plain, ['', '']), JSON.stringify(data.plain));
  ok('an act and a person still there read as stored; so do You and The band', same(data.good, ['s-owls', 's-maya']) && same(data.me, ['s-sablea', 'me']) && same(data.band, ['', 'band']), JSON.stringify([data.good, data.me, data.band]));
  ok('an act or a person not there (deleted, from another device) reads as none and not known', same(data.gone, ['', '']), JSON.stringify(data.gone));
  ok('junk stored there reads as none and not known', data.junk.every(x => same(x, ['', ''])), JSON.stringify(data.junk));
  ok('the total value is each item’s value times how many (junk counts nothing)', data.worth === 300 + 50 + 0 + 20, String(data.worth));
  ok('your investment adds up only what you paid for, value times how many', data.mine === 300 + 10, String(data.mine));
  ok('no items, no figures (and nothing breaks)', same(data.empty, [0, 0, 0]), JSON.stringify(data.empty));

  // An old backup: its gear comes back exactly as it was, keys and all, and reads as before.
  const backup = await page.evaluate(() => import('./js/store.js').then(s => {
    const old = JSON.parse(s.exportJSON()), want = JSON.parse(JSON.stringify(old.gear));
    old.gear.push({ id: 'x-junk', name: 'Odd case', category: 'Cases & transport', value: 80, actId: 7, paidBy: ['me'] });
    want.push({ id: 'x-junk', name: 'Odd case', category: 'Cases & transport', value: 80, actId: 7, paidBy: ['me'] });
    s.replaceAll(old);
    const back = JSON.parse(JSON.stringify(s.db.gear));
    return { same: JSON.stringify(back) === JSON.stringify(want), keys: back.filter(g => g.id !== 'x-junk').some(g => 'actId' in g || 'paidBy' in g) };
  }));
  ok('an old backup brings its gear back exactly as it was, with no keys added', backup.same && !backup.keys, JSON.stringify(backup));
  await sleep(300);

  /* ---------------- the menus ---------------- */
  const menus = await page.evaluate(() => import('./js/roles.js').then(m => Object.fromEntries([...m.ROLES, m.EVERYTHING].map(r => [r.id, m.menuSections(r)]))));
  ok('the producer’s menu has Backline right after Artists, and My card last before Settings', same(menus.producer, ['bookings', 'sessions', 'songs', 'acts', 'backline', 'money', 'people', 'venues', 'tools', 'card', 'settings']), menus.producer.join(','));
  ok('the manager’s menu has Backline right after Roster, and My card last before Settings', same(menus.manager, ['bookings', 'acts', 'backline', 'money', 'people', 'venues', 'insurance', 'card', 'settings']), menus.manager.join(','));
  ok('every other role’s menu is as it was, My card last before Settings', same(menus.band, ['bookings', 'songs', 'backline', 'tools', 'acts', 'money', 'people', 'venues', 'card', 'settings']) && same(menus.solo, ['bookings', 'songs', 'money', 'acts', 'venues', 'people', 'tools', 'card', 'settings'])
    && same(menus.scout, ['bookings', 'acts', 'people', 'venues', 'card', 'settings']) && same(menus.audiophile, ['bookings', 'acts', 'venues', 'tools', 'card', 'settings']) && menus.all.length === 12 && same(menus.all.slice(-2), ['card', 'settings']), JSON.stringify(menus));

  /* ---------------- a producer, before any item is for a band ---------------- */
  await page.evaluate(() => import('./js/store.js').then(s => s.update(d => { d.gear = d.gear.filter(g => g.id !== 'x-junk'); })));
  await role(page, 'producer');
  let tour = await welcome(page);
  ok('the producer’s welcome tour counts eleven tracks, Backline and My card among them: six on Side A, five on Side B', /^11 tracks: 6 on Side A, 5 on Side B; the rest are bonus tracks\./.test(tour.tracks), tour.tracks);
  ok('…and its last card no longer names Backline among the bonus tracks', /Not on your menu: /.test(tour.last) && !/Backline/.test(tour.last), tour.last);
  await go(page, 'backline');
  await page.waitForSelector('#page .bl-head');
  ok('Backline is the producer’s fifth track, on Side A', /^A5 · Side A/.test(await page.textContent('#deck .dk-meta')), await page.textContent('#deck .dk-meta'));
  ok('with no item for a band the page is as it was: the categories, no folds', (await page.locator('#page .bl-band').count()) === 0 && (await page.locator('#page .bl-group').count()) === 8 && (await page.locator('#page .bl-card').count()) === 10);
  let st = await steps(page);
  let by = st.find(s => s[0] === 'By artist');
  ok('its walkthrough says how to get the folds, and the investment, pointing at + Add', !!by && by[2] === '#bl-add' && /For artist/.test(by[1]) && /your investment/.test(by[1]) && /what you paid for yourself/.test(by[1]), JSON.stringify(by));

  /* ---------------- the folds ---------------- */
  await seed(page);
  await page.waitForSelector('#page .bl-band-head');
  ok('the gear is in a fold per artist, A to Z, then “Not for an artist” last, all folded at first, with the count of items', same(await heads(page), [['Sable', '4', 'false'], ['The Night Owls', '9', 'false'], ['Not for an artist', '9', 'false']]), JSON.stringify(await heads(page)));
  ok('…and no card is drawn while they are folded', (await page.locator('#page .bl-card').count()) === 0 && (await page.$$eval('#page .bl-band-list', ls => ls.every(l => l.hidden && !l.children.length))));
  ok('each heading gives the total value (value × how many) and your investment (only what you paid)', same(await figures(page), [['$7,950', '$4,300'], ['$5,046', '$3,346'], ['$5,593', '$0']]), JSON.stringify(await figures(page)));
  const check = await page.evaluate(() => import('./js/store.js').then(s => {
    const sum = (list, f) => list.filter(f).reduce((a, g) => a + Number(g.value) * Math.max(1, Math.floor(Number(g.qty)) || 1), 0);
    return [['s-sablea', 's-owls'].map(id => [sum(s.db.gear, g => g.actId === id), sum(s.db.gear, g => g.actId === id && g.paidBy === 'me')]), s.db.gear.length];
  }));
  ok('…the same as adding them up by hand', same(check[0], [[7950, 4300], [5046, 3346]]) && check[1] === 13, JSON.stringify(check));
  ok('the page’s own figures are as they were: every item counted', /^22\s*items/.test((await page.innerText('#page .bl-stats .stat')).trim()) && (await page.innerText('#page .bl-total b')) === '$18,589', await page.innerText('#page .bl-total b'));
  ok('a screen reader hears each heading whole: the artist, the items, the value and your investment', (await spoken(page, '#bl-band-s-sablea')) === 'Sable, 4 items, total value $7,950, your investment $4,300' && (await spoken(page, '#bl-band-none')) === 'Not for an artist, 9 items, total value $5,593, your investment $0', await spoken(page, '#bl-band-s-sablea'));
  const shape = await page.evaluate(() => { const b = document.getElementById('bl-band-s-sablea'), l = document.getElementById(b.getAttribute('aria-controls'));
    return { h2: b.parentElement.tagName, type: b.type, list: !!l && l.getAttribute('role') === 'group' && l.getAttribute('aria-labelledby') === b.id, hidden: [...b.querySelectorAll('.bl-band-n, .bl-chev, .bl-band-sum')].every(x => x.getAttribute('aria-hidden') === 'true') }; });
  ok('a heading is a real disclosure button in an h2, controlling its list (a group named by it)', shape.h2 === 'H2' && shape.type === 'button' && shape.list && shape.hidden, JSON.stringify(shape));

  // by touch or the mouse
  await page.click('#bl-band-s-sablea');
  await page.waitForSelector('#bl-band-s-sablea[aria-expanded="true"]');
  ok('a tap drops a fold down: its gear as Backline draws it, by category', same(await cardsIn(page, 's-sablea'), ['x-juno', 'x-u87', 's-apollo', 's-mbp']) && same(await page.$$eval('#page .bl-band[data-band="s-sablea"] .bl-group h3 > span:first-child', x => x.map(e => e.textContent)), ['Keys & synths', 'Microphones', 'DI & interfaces', 'Computers & software']), JSON.stringify(await cardsIn(page, 's-sablea')));
  ok('…the heading keeps the focus, and its group is named for a screen reader', (await focused(page)) === 'bl-band-s-sablea' && (await spoken(page, '#bl-band-s-sablea-list', 'group')) === 'Sable, 4 items, total value $7,950, your investment $4,300', await focused(page));
  ok('…a card in it opens the item’s sheet as before', await (async () => { await page.click('#bl-item-x-u87'); await page.waitForSelector('.sheet[aria-label="Vocal mic"]'); return true; })());
  const kv = await page.$$eval('.sheet[aria-label="Vocal mic"] .bl-kv dt', dts => dts.map(dt => [dt.textContent, dt.nextElementSibling.textContent]));
  ok('the item’s sheet says the artist it is for and who paid', kv.some(x => same(x, ['For artist', 'Sable'])) && kv.some(x => same(x, ['Paid by', 'You (Sample Producer)'])), JSON.stringify(kv));
  await page.keyboard.press('Escape'); await sleep(300);
  await page.click('#bl-band-s-sablea');
  await page.waitForSelector('#bl-band-s-sablea[aria-expanded="false"]');
  ok('a second tap folds it away, the focus still on its heading', !(await cardsIn(page, 's-sablea')).length && (await focused(page)) === 'bl-band-s-sablea', await focused(page));

  // the keyboard
  await page.focus('#bl-band-s-owls');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#bl-band-s-owls[aria-expanded="true"]');
  await sleep(100);
  ok('Enter drops a fold down, and the focus stays on it', same(await visibleCards(page), ['s-tele', 's-pbass', 'x-cab', 's-hotrod', 's-sm58']) && (await focused(page)) === 'bl-band-s-owls', JSON.stringify(await visibleCards(page)));
  await page.keyboard.press(' ');
  await page.waitForSelector('#bl-band-s-owls[aria-expanded="false"]');
  await sleep(100);
  ok('Space folds it away again, and the focus stays on it', !(await visibleCards(page)).length && (await focused(page)) === 'bl-band-s-owls', await focused(page));
  await page.keyboard.press('Tab');
  ok('Tab goes from a folded heading to the next one', (await focused(page)) === 'bl-band-none', await focused(page));
  await page.keyboard.press('Enter');
  await page.waitForSelector('#bl-band-none[aria-expanded="true"]');
  ok('the last fold holds the gear for no artist', same(await cardsIn(page, 'none'), ['s-kit', 's-nord', 's-sm57', 's-di']), JSON.stringify(await cardsIn(page, 'none')));

  // a redraw, another section, a reload
  await page.focus('#bl-band-none');
  await page.evaluate(() => import('./js/store.js').then(s => s.upsert('venues', { id: 't-v', name: 'Somewhere' })));
  await sleep(350);
  ok('after a change to the data the open fold stays open and keeps the focus', (await page.getAttribute('#bl-band-none', 'aria-expanded')) === 'true' && (await focused(page)) === 'bl-band-none', await focused(page));
  await go(page, 'venues');
  await go(page, 'backline');
  ok('the folds opened stay open for the visit (another section and back)', same((await heads(page)).map(x => x[2]), ['false', 'false', 'true']), JSON.stringify(await heads(page)));

  /* the page's own search and the owner chips */
  const search = async q => { await page.fill('#bl-search', q); await sleep(200); };
  await search('neumann');
  ok('the search opens every fold with a match and leaves out the rest; the figures are the matches’', same(await heads(page), [['Sable', '1', 'true']]) && same(await visibleCards(page), ['x-u87']) && same(await figures(page), [['$3,200', '$3,200']]), JSON.stringify([await heads(page), await figures(page)]));
  ok('…and the search box keeps the focus', (await focused(page)) === 'bl-search');
  await page.click('#bl-band-s-sablea');
  await page.waitForSelector('#bl-band-s-sablea[aria-expanded="false"]');
  ok('a fold can be folded during a search, keeping the focus and the words', !(await visibleCards(page)).length && (await focused(page)) === 'bl-band-s-sablea' && (await page.inputValue('#bl-search')) === 'neumann');
  await search('neuman');
  ok('…and opens again when the words change', same(await visibleCards(page), ['x-u87']));
  await search('sable');
  ok('an artist’s name finds its gear', same(await heads(page), [['Sable', '4', 'true']]) && (await visibleCards(page)).length === 4, JSON.stringify(await heads(page)));
  await search('nothing like this at all');
  ok('nothing found says so, with no folds', (await page.locator('#page .bl-band').count()) === 0 && /Nothing matches that/.test(await pageText(page)));
  await search('');
  ok('clearing the search puts the folds back as they were', same((await heads(page)).map(x => x[2]), ['false', 'false', 'true']), JSON.stringify(await heads(page)));
  await page.click('#bl-own-s-maya');
  await sleep(200);
  ok('an owner chip opens the folds with that person’s gear and leaves out the rest', same(await heads(page), [['The Night Owls', '1', 'true']]) && same(await visibleCards(page), ['s-tele']) && same(await figures(page), [['$800', '$0']]), JSON.stringify(await heads(page)));
  ok('…and keeps the focus', (await focused(page)) === 'bl-own-s-maya');
  await page.click('#bl-own-band');
  await sleep(200);
  ok('Band-owned works inside the folds too', same((await heads(page)).map(x => x[0]), ['Sable', 'The Night Owls', 'Not for an artist']) && (await heads(page)).every(x => x[2] === 'true'), JSON.stringify(await heads(page)));
  await page.click('#bl-own-all');
  await sleep(200);
  ok('Everyone puts the folds back as they were', same((await heads(page)).map(x => x[2]), ['false', 'false', 'true']), JSON.stringify(await heads(page)));

  /* the search at the top of every page */
  const all = q => page.evaluate(w => import('./js/search.js').then(m => m.searchReady().then(() => m.searchAll(w).gear || [])), q);
  ok('the search at the top finds an item by its artist’s name', same([...await all('sable')].sort(), ['s-apollo', 's-mbp', 'x-juno', 'x-u87']) && (await all('night owls')).length === 5, JSON.stringify([await all('sable'), await all('night owls')]));
  await page.evaluate(() => import('./js/store.js').then(s => s.patch('acts', 's-owls', { formerNames: [{ name: 'The Owlets', until: '' }] })));
  await sleep(300);
  ok('…and by a name the artist had before', (await all('owlets')).length === 5 && (await page.evaluate(() => import('./js/pages/backline.js').then(m => import('./js/store.js').then(s => m.gearText(s.byId('gear', 's-tele')))))).includes('owlets'), JSON.stringify(await all('owlets')));
  await go(page, 'tools');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('/'); await page.keyboard.type('neumann', { delay: 5 }); await page.waitForSelector('#srch-q'); await sleep(250);
  await page.click('#srch-tab-gear'); await sleep(150);
  const why = await page.innerText('.srch-list .card');
  await page.click('.srch-list .card'); await sleep(800);
  const landed = await page.evaluate(() => { const top = [...document.querySelectorAll('.sheet')].pop(); return { page: window.logiPage(), sheet: top ? top.getAttribute('aria-label') : '', open: document.getElementById('bl-band-s-sablea').getAttribute('aria-expanded') }; });
  ok('an item opened from the search opens its sheet over Backline, its artist’s fold dropped open behind it', same(landed, { page: 'backline', sheet: 'Vocal mic', open: 'true' }), JSON.stringify(landed));
  await page.keyboard.press('Escape'); await sleep(300);
  await page.keyboard.press('/'); await page.keyboard.type('sable', { delay: 5 }); await page.waitForSelector('#srch-q'); await sleep(250);
  await page.click('#srch-tab-gear'); await sleep(150);
  const whySable = await page.innerText('.srch-list .card');
  ok('…and a row found by the artist says why', /For artist: Sable/.test(whySable) && /Neumann/.test(why), whySable.replace(/\n/g, ' / '));
  await page.keyboard.press('Escape'); await sleep(300);
  await go(page, 'backline');
  await page.reload(); await page.waitForSelector('#deck .dk-next');
  await go(page, 'backline');
  ok('a reload folds them all', (await heads(page)).every(x => x[2] === 'false'), JSON.stringify(await heads(page)));

  /* the walkthrough */
  st = await steps(page);
  by = st.find(s => s[0] === 'By artist');
  ok('the walkthrough explains the folds and the investment, pointing at a heading', !!by && by[2] === '.bl-band-head' && /A to Z, then Not for an artist last/.test(by[1]) && /each item’s value times how many/.test(by[1]) && /your investment \(the value of what you paid for yourself\)/.test(by[1]) && /Tap a heading/.test(by[1]), JSON.stringify(by));
  ok('…just before the step on an item, which drops a fold open first', st.findIndex(s => s[0] === 'By artist') === st.findIndex(s => s[0] === 'An item') - 1 && st.find(s => s[0] === 'An item')[3], JSON.stringify(st.map(s => s[0])));
  ok('…and its search and owner steps say the folds with a match open', /serial number, place or artist\./.test(st.find(s => s[0] === 'Find something')[1]) && /folds with a match open/.test(st.find(s => s[0] === 'Find something')[1]) && /folds with a match open/.test(st.find(s => s[0] === 'Whose is it?')[1]));
  await page.click('#helpBtn');
  await page.waitForSelector('.tour-card');
  const titles = [];
  for (let i = 0; i < 10 && await page.locator('.tour-card').count(); i++) { titles.push(await page.textContent('#tour-title')); await page.click('.tour-actions .btn.primary'); await sleep(700); }
  ok('the walkthrough runs through the folds and an item on a folded page', ['By artist', 'An item'].every(t => titles.includes(t)), titles.join(' › '));
  ok('…and leaves the first fold open, as a tap would', same((await heads(page)).map(x => x[2]), ['true', 'false', 'false']), JSON.stringify(await heads(page)));
  const fs = await formSteps(page, 'Add item');
  const ff = fs.find(s => s[2] === '[data-key=actId]');
  ok('the item form’s walkthrough has a step on the two boxes, with the investment', !!ff && ff[0] === 'For an artist' && /who paid for it: you, the artist or a person/.test(ff[1]) && /only what you paid counts as your investment/.test(ff[1]), JSON.stringify(ff));

  /* ---------------- the form ---------------- */
  await page.click('#bl-add');
  await page.waitForSelector('.sheet[aria-label="Add item"] select[data-key=actId]');
  let bx = await boxes(page);
  ok('the form has For artist, with the acts A to Z after “Not for an artist”', bx.act.label === 'For artist' && same(bx.act.options, [['', 'Not for an artist'], ['s-sablea', 'Sable'], ['s-owls', 'The Night Owls']]) && bx.act.value === '', JSON.stringify(bx.act));
  ok('…and Paid by: Not known, You, The artist, then each person', bx.paid.label === 'Paid by' && same(bx.paid.options.slice(0, 3), [['', 'Not known'], ['me', 'You (Sample Producer)'], ['band', 'The artist']]) && bx.paid.options.length === 13 && bx.paid.options.some(o => same(o, ['s-leo', 'Leo Grant'])) && bx.paid.value === '', JSON.stringify(bx.paid.options.slice(0, 5)));
  ok('…right after Whose it is, each with a word on what it does', bx.order.indexOf('actId') === bx.order.indexOf('owner') + 1 && bx.order.indexOf('paidBy') === bx.order.indexOf('actId') + 1 && bx.act.hint === 'Backline folds your gear by artist.' && bx.paid.hint === 'What you paid for adds up as your investment in the artist it is for.', JSON.stringify([bx.order, bx.act.hint, bx.paid.hint]));
  await page.fill('.sheet [data-key=name]', 'Talkback mic');
  await page.fill('.sheet [data-key=value]', '150');
  await page.fill('.sheet [data-key=qty]', '2');
  await page.selectOption('.sheet select[data-key=actId]', 's-owls');
  await page.selectOption('.sheet select[data-key=paidBy]', 'me');
  await page.click('.sheet button[type=submit]');
  await sleep(400);
  const added = await page.evaluate(() => import('./js/store.js').then(s => JSON.parse(JSON.stringify(s.db.gear.find(g => g.name === 'Talkback mic') || null))));
  ok('a new item is stored with its artist and who paid', added && added.actId === 's-owls' && added.paidBy === 'me' && added.qty === 2, JSON.stringify(added));
  ok('…its artist’s fold opens so it is there to see, with the figures counting it', (await page.getAttribute('#bl-band-s-owls', 'aria-expanded')) === 'true' && (await cardsIn(page, 's-owls')).includes(added.id) && same((await figures(page))[1], ['$5,346', '$3,646']), JSON.stringify(await figures(page)));
  // An old item saved without touching the two boxes keeps no keys for them.
  await page.evaluate(() => import('./js/pages/backline.js').then(m => import('./js/store.js').then(s => m.editGear(s.byId('gear', 's-nord')))));
  await page.waitForSelector('.sheet[aria-label="Edit item"] select[data-key=actId]');
  bx = await boxes(page);
  ok('an old item opens with Not for an artist and Not known', bx.act.value === '' && bx.paid.value === '');
  await page.click('.sheet button[type=submit]'); await sleep(350);
  let g = await gearOf(page, 's-nord');
  ok('…and saved as it is, it stores no key for either', g && !('actId' in g) && !('paidBy' in g) && g.name === 'Nord Stage 3', JSON.stringify(g));
  // Junk stored there opens as none, and a save takes it off.
  await tie(page, { 's-kit': { actId: 'gone-act', paidBy: 'gone-person' } });
  ok('an item for an act that is gone sits under Not for an artist', (await page.getAttribute('#bl-band-none', 'aria-expanded')) !== null && (await page.evaluate(() => import('./js/model.js').then(m => import('./js/store.js').then(s => m.gearActId(s.byId('gear', 's-kit')))))) === '');
  await page.evaluate(() => import('./js/pages/backline.js').then(m => import('./js/store.js').then(s => m.editGear(s.byId('gear', 's-kit')))));
  await page.waitForSelector('.sheet[aria-label="Edit item"] select[data-key=actId]');
  bx = await boxes(page);
  ok('junk stored there opens as Not for an artist and Not known', bx.act.value === '' && bx.paid.value === '');
  await page.click('.sheet button[type=submit]'); await sleep(350);
  g = await gearOf(page, 's-kit');
  ok('…and a save takes it off', g && !('actId' in g) && !('paidBy' in g), JSON.stringify(g));
  // Set back to none: the keys go.
  await page.evaluate(() => import('./js/pages/backline.js').then(m => import('./js/store.js').then(s => m.editGear(s.byId('gear', 's-hotrod')))));
  await page.waitForSelector('.sheet[aria-label="Edit item"] select[data-key=actId]');
  bx = await boxes(page);
  ok('an item for an artist opens with them picked', bx.act.value === 's-owls' && bx.paid.value === 'me');
  await page.selectOption('.sheet select[data-key=actId]', '');
  await page.selectOption('.sheet select[data-key=paidBy]', '');
  await page.click('.sheet button[type=submit]'); await sleep(350);
  g = await gearOf(page, 's-hotrod');
  ok('…and set back to none and not known, the keys go', g && !('actId' in g) && !('paidBy' in g) && g.value === 750, JSON.stringify(g));

  /* ---------------- deleting an act or a person ---------------- */
  await page.evaluate(() => import('./js/store.js').then(s => { s.remove('people', 's-leo'); s.remove('people', 's-sable'); }));
  await sleep(300);
  const afterPeople = await Promise.all(['s-pbass', 'x-juno', 'x-u87'].map(id => gearOf(page, id)));
  ok('deleting a person clears Paid by where they paid, and nothing else', afterPeople[0].paidBy === '' && afterPeople[0].owner === '' && afterPeople[0].actId === 's-owls' && afterPeople[1].paidBy === '' && afterPeople[1].actId === 's-sablea' && afterPeople[2].paidBy === 'me', JSON.stringify(afterPeople));
  await page.evaluate(() => import('./js/store.js').then(s => s.remove('acts', 's-sablea')));
  await sleep(350);
  const afterAct = await Promise.all(['x-u87', 's-apollo', 's-tele'].map(id => gearOf(page, id)));
  ok('deleting an act clears For band on its gear, which keeps who paid', afterAct[0].actId === '' && afterAct[0].paidBy === 'me' && afterAct[1].actId === '' && afterAct[2].actId === 's-owls', JSON.stringify(afterAct));
  ok('…and its gear moves to Not for an artist', same((await heads(page)).map(x => x[0]), ['The Night Owls', 'Not for an artist']) && (await spoken(page, '#bl-band-none')) === 'Not for an artist, 14 items, total value $14,293, your investment $4,300', await spoken(page, '#bl-band-none'));

  /* ---------------- every role ---------------- */
  await page.evaluate(() => import('./js/store.js').then(s => s.replaceAll({})));
  await sleep(300);
  await page.evaluate(() => import('./js/store.js').then(s => s.loadSample()));
  await sleep(300);
  await seed(page);
  // A manager: Roster's word, act.
  await role(page, 'manager');
  tour = await welcome(page);
  ok('the manager’s welcome tour counts nine tracks, Backline and My card among them: five on Side A, four on Side B', /^9 tracks: 5 on Side A, 4 on Side B; the rest are bonus tracks\./.test(tour.tracks) && !/Backline/.test(tour.last), tour.tracks);
  await go(page, 'backline');
  await page.waitForSelector('#page .bl-band-head');
  ok('Backline is the manager’s third track, right after Roster', /^A3 · Side A/.test(await page.textContent('#deck .dk-meta')), await page.textContent('#deck .dk-meta'));
  ok('a manager sees the folds, in their words: Not for an act', same((await heads(page)).map(x => x[0]), ['Sable', 'The Night Owls', 'Not for an act']) && (await spoken(page, '#bl-band-none')) === 'Not for an act, 9 items, total value $5,593, your investment $0', await spoken(page, '#bl-band-none'));
  st = await steps(page);
  ok('…and the walkthrough’s step, By act', st.some(s => s[0] === 'By act' && /Not for an act last/.test(s[1]) && /your investment/.test(s[1])), JSON.stringify(st.map(s => s[0])));
  await page.click('#bl-add'); await page.waitForSelector('.sheet select[data-key=actId]');
  bx = await boxes(page);
  ok('…and the form: For act, The act', bx.act.label === 'For act' && bx.act.options[0][1] === 'Not for an act' && bx.paid.options[2][1] === 'The act' && /your investment in the act it is for/.test(bx.paid.hint), JSON.stringify([bx.act.label, bx.paid.options[2]]));
  await page.keyboard.press('Escape'); await sleep(300);
  // Jack of Trades (also where Tourbook is with no role chosen): the folds too.
  await role(page, 'all');
  await go(page, 'backline');
  ok('Jack of Trades sees the folds', same((await heads(page)).map(x => x[0]), ['Sable', 'The Night Owls', 'Not for an act']));
  // A band: the page as it always was, the two boxes in the form, no investment.
  await role(page, 'band');
  await go(page, 'backline');
  await page.waitForSelector('#page .bl-head');
  ok('a band’s Backline is as it was, even with gear for its acts: categories, no folds', (await page.locator('#page .bl-band').count()) === 0 && (await page.locator('#page .bl-group').count()) === 8 && !/investment/i.test(await pageText(page)));
  st = await steps(page);
  ok('…its walkthrough is as it was', !st.some(s => /^By /.test(s[0])) && !st.some(s => /investment|fold/i.test(s[1])) && !st.some(s => s[3]), JSON.stringify(st.map(s => s[0])));
  await page.click('#bl-item-s-apollo'); await page.waitForSelector('.sheet[aria-label="Apollo Twin"]');
  const bandKv = await page.$$eval('.sheet[aria-label="Apollo Twin"] .bl-kv dt', dts => dts.map(dt => [dt.textContent, dt.nextElementSibling.textContent]));
  ok('…and the item’s sheet says what its form’s two boxes hold, in the band’s words', bandKv.some(x => same(x, ['For band', 'Sable'])) && bandKv.some(x => same(x, ['Paid by', 'You (Sample Producer)'])), JSON.stringify(bandKv));
  await page.keyboard.press('Escape'); await sleep(300);
  await page.click('#bl-item-s-kit'); await page.waitForSelector('.sheet[aria-label="Drum kit"]');
  ok('…an item for no band, paid by not known, has neither row', !(await page.$$eval('.sheet[aria-label="Drum kit"] .bl-kv dt', d => d.map(x => x.textContent))).some(t => /For band|Paid by/.test(t)));
  await page.keyboard.press('Escape'); await sleep(300);
  await page.click('#bl-add'); await page.waitForSelector('.sheet select[data-key=actId]');
  bx = await boxes(page);
  ok('a band’s form has For band and Paid by (The band), with no word of folds or investment', bx.act.label === 'For band' && bx.act.options[0][1] === 'Not for a band' && bx.paid.options[2][1] === 'The band' && bx.act.hint === '' && bx.paid.hint === '', JSON.stringify([bx.act, bx.paid.hint]));
  const bandStep = (await formSteps(page, 'Add item')).find(s => s[2] === '[data-key=actId]');
  ok('…and its walkthrough step says what they are, nothing more', bandStep[0] === 'For a band' && !/investment|folds/.test(bandStep[1]), JSON.stringify(bandStep));
  await page.keyboard.press('Escape'); await sleep(300);
  // A scout, a solo artist and an audiophile: Backline (a bonus track) as it was; the form in their words.
  for (const [id, word] of [['scout', 'act'], ['solo', 'act'], ['audiophile', 'band']]) {
    await role(page, id);
    await go(page, 'backline');
    await page.waitForSelector('#page .bl-head');
    const flat = (await page.locator('#page .bl-band').count()) === 0 && (await page.locator('#page .bl-group').count()) === 8;
    await page.click('#bl-add'); await page.waitForSelector('.sheet select[data-key=actId]');
    bx = await boxes(page);
    ok(`${id}: Backline as it was, and the form’s For ${word} and Paid by with no investment`, flat && bx.act.label === `For ${word}` && bx.paid.options[2][1] === `The ${word}` && !/investment/.test(bx.act.hint + bx.paid.hint), JSON.stringify([flat, bx.act.label, bx.paid.hint]));
    await page.keyboard.press('Escape'); await sleep(300);
  }
  // No money: a role with the folds but without money (Jack of Trades with money turned off here) sees no figures at all.
  await role(page, 'all');
  await page.evaluate(() => import('./js/roles.js').then(m => { m.role().money = false; }));
  await go(page, 'venues');
  await go(page, 'backline');
  await page.waitForSelector('#page .bl-band-head');
  ok('without money the folds have the count and no figures', (await page.locator('#page .bl-band-sum').count()) === 0 && same((await heads(page)).map(x => x.slice(0, 2)), [['Sable', '4'], ['The Night Owls', '9'], ['Not for an act', '9']]));
  ok('…a screen reader hears no figures either', (await spoken(page, '#bl-band-s-sablea')) === 'Sable, 4 items', await spoken(page, '#bl-band-s-sablea'));
  ok('…the page says nothing of an investment', !/investment/i.test(await pageText(page)));
  st = await steps(page);
  const noMoney = st.find(s => s[0] === 'By act');
  ok('…nor does the walkthrough', !!noMoney && !/investment|value/.test(noMoney[1]) && /how many items there are/.test(noMoney[1]), JSON.stringify(noMoney));
  await page.click('#bl-add'); await page.waitForSelector('.sheet select[data-key=actId]');
  bx = await boxes(page);
  const nmStep = (await formSteps(page, 'Add item')).find(s => s[2] === '[data-key=actId]');
  ok('…nor the form or its walkthrough', bx.paid.hint === '' && bx.act.hint === 'Backline folds your gear by act.' && !/investment/.test(nmStep[1]), JSON.stringify([bx.paid.hint, nmStep[1]]));
  await page.keyboard.press('Escape'); await sleep(300);
  await page.evaluate(() => import('./js/roles.js').then(m => { m.role().money = true; }));
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ---------------- 320 px, extra-large text and large buttons ---------------- */
  {
    const prefs = `try { localStorage.setItem('tourbook-prefs', ${JSON.stringify(JSON.stringify({ text: 'xlarge', targets: 'large' }))}); localStorage.setItem('tourbook-role', 'producer'); } catch (e) { /* ignore */ }`;
    const { browser: b2, page: p2, errors: e2 } = await open({ sample: true, viewport: { width: 320, height: 700 }, init: prefs });
    await seed(p2);
    await p2.evaluate(() => import('./js/store.js').then(s => {
      const a = s.upsert('acts', { id: 't-gos', name: 'The Sunday Morning Gospel Singers of the Valley', genre: 'Gospel', members: [] });
      s.upsert('gear', { id: 't-organ', name: 'Hammond organ with the Leslie cabinet', category: 'Keys & synths', make: 'Hammond', model: 'B-3', value: 1234567, qty: 3, actId: a.id, paidBy: 'me' });
    }));
    await sleep(300);
    await go(p2, 'backline');
    await p2.waitForSelector('#bl-band-t-gos');
    const wide = () => p2.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    const inside = (sel, box) => p2.evaluate(([s, b]) => [...document.querySelectorAll(s)].every(el => { const a = el.getBoundingClientRect(), o = el.closest(b).getBoundingClientRect(); return a.width > 0 && a.left >= o.left - 0.5 && a.right <= o.right + 0.5; }), [sel, box]);
    const is = await p2.evaluate(() => ({ text: document.documentElement.dataset.text, hit: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit')) }));
    ok('320px: extra-large text and large buttons are on', is.text === 'xlarge' && is.hit >= 54, JSON.stringify(is));
    const hd = await p2.$eval('#bl-band-t-gos', el => { const r = el.getBoundingClientRect(); return { right: r.right, h: r.height }; });
    ok('320px: the headings fit the screen, their names, counts, chevrons and figures inside them, each a full-size button', (await wide()) <= 320 && await inside('.bl-band-name, .bl-band-n, .bl-band-head .bl-chev, .bl-band-worth, .bl-band-mine', '.bl-band-head') && hd.right <= 320 && hd.h >= is.hit, JSON.stringify([await wide(), hd]));
    ok('320px: a big figure stays whole on its line', await p2.$eval('#bl-band-t-gos .bl-band-worth b', b => b.getClientRects().length === 1 && b.textContent === '$3,703,701'));
    await p2.click('#bl-band-t-gos');
    await p2.waitForSelector('#bl-band-t-gos[aria-expanded="true"]');
    await p2.click('#bl-band-s-owls');
    await p2.waitForSelector('#bl-band-s-owls[aria-expanded="true"]');
    ok('320px: open folds with their cards do not push the page sideways', (await wide()) <= 320 && await inside('.bl-band-list .bl-card', '.bl-band'), String(await wide()));
    if (process.env.S) await p2.screenshot({ path: `${process.env.S}/51-band-gear-320-xlarge.png`, fullPage: true });
    await p2.click('#bl-add');
    await p2.waitForSelector('.sheet[aria-label="Add item"] select[data-key=paidBy]');
    await topSheet(p2).locator('select[data-key=paidBy]').scrollIntoViewIfNeeded();
    const fits = await p2.evaluate(() => { const b = [...document.querySelectorAll('.sheet-body')].pop(), o = b.getBoundingClientRect(); return b.scrollWidth <= b.clientWidth + 1 && ['actId', 'paidBy'].every(k => b.querySelector(`select[data-key=${k}]`).getBoundingClientRect().right <= o.right + 0.5); });
    ok('320px: the form’s For artist and Paid by fit', fits && (await wide()) <= 320);
    ok('no errors in the console (320px)', e2.length === 0, e2.slice(0, 5).join(' | '));
    await b2.close();
  }
})().catch(e => { console.log('FAIL band gear spec crashed — ' + e.message); process.exit(1); });
