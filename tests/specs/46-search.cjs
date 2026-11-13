// The search: the magnifying glass in the top bar and the sheet it opens (js/search.js).
//
// One browser as Everything for what is searched and what comes up (the band, the place, the show itself, the notes;
// one list, newest first, with a line for today; the calendar's own card; the kind row and the place chips; a time
// seen from a band's log), for opening and closing, the keyboard, what a screen reader is told, each role's words,
// money, and how quick it is with 2,000 bookings and 200 bands. Then a 320 px phone with extra-large text and large
// buttons, light and dark, with each of the three section menus.
// Nothing here depends on the hour or the time zone of the run: what must be over is dated five days back or more and
// what must be ahead three days on or more; the two records dated today are on the same side of the line all day;
// dates on screen are compared with the app's own formatters run in the page.
const { open, ok, sleep, go } = require('../helpers.cjs');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const SHEET = '.sheet[aria-label="Search"]';
const store = (page, fn, arg) => page.evaluate(`import('./js/store.js').then(s => (${fn.toString()})(s, ${JSON.stringify(arg === undefined ? null : arg)}))`);
const openSearch = async page => { await page.click('#searchBtn'); await page.waitForSelector('#srch-q'); await sleep(150); };
const closeSearch = async page => { await page.keyboard.press('Escape'); await sleep(200); };
const type = async (page, q) => { await page.fill('#srch-q', q); await sleep(180); };
// Narrowing or widening as a person does it, at the end of the words already there: back is how many to rub out first.
const typeOn = async (page, more, back = 0) => { await page.focus('#srch-q'); await page.keyboard.press('End'); for (let i = 0; i < back; i++) await page.keyboard.press('Backspace'); await page.keyboard.type(more, { delay: 10 }); await sleep(180); };
// The list as drawn: a booking's id, a time seen's id, or TODAY for the line.
const rows = page => page.$$eval('.srch-list > li', els => els.map(li => (li.classList.contains('srch-today') ? 'TODAY' : li.firstElementChild.dataset.seen || li.firstElementChild.dataset.id)));
const foundLine = page => page.evaluate(() => (document.querySelector('.srch-found') || { textContent: '' }).textContent);
// A row of chips: [name, count, pressed].
const chips = (page, sel) => page.$$eval(sel + ' .chip', els => els.map(e => [e.querySelector('.srch-chip-name').textContent.replace(/^[^A-Za-z]+/, ''), Number(e.querySelector('.srch-n').firstChild.textContent), e.getAttribute('aria-pressed')]));
const chip = (page, sel, name) => page.locator(`${sel} .chip`).filter({ has: page.locator('.srch-chip-name', { hasText: name }) }).first();
const finds = (page, q) => page.evaluate(q => import('./js/search.js').then(m => m.searchFor(q).map(r => r.id).sort()), q);
const said = page => page.evaluate(() => (document.getElementById('sr-live') || { textContent: '' }).textContent);
const focused = page => page.evaluate(() => { const a = document.activeElement; return a ? (a.id ? '#' + a.id : a.dataset.id || a.dataset.seen || a.dataset.kind || a.className) : ''; });
const setRole = async (page, id) => { await page.evaluate(id => { if (id) localStorage.setItem('gdex-role', id); else localStorage.removeItem('gdex-role'); }, id); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(250); };

// Chelsea Wolfe at The Church, Motörhead in a log, a support slot, a title, a client, and one of every kind.
const seed = (s, D) => s.update(d => {
  d.venues.push(
    { id: 'v-church', kind: 'venue', name: 'The Church', address: '12 Abbey Road, Leeds', rules: { proCameras: 'no', compacts: 'yes', phones: 'yes' }, rulesNote: '', rulesTone: '' },
    { id: 'v-crown', kind: 'venue', name: 'The Crown', address: '3 High Street, Bristol' },
    { id: 'v-echo', kind: 'studio', name: 'Echo Chamber Studios', address: '4 Mill Yard, Harbourtown' });
  d.acts.push(
    { id: 'a-wolfe', name: 'Chelsea Wolfe', genre: 'Doom folk', color: '#8b5cf6', seen: [
      { id: 'sw1', date: D.w1, venueId: 'v-church', bookingId: 'b-w1', rating: 92, notes: 'Spellbinding. The new songs landed.' },
      { id: 'sw2', date: D.far, where: 'Roadburn, Tilburg', rating: 88, notes: 'Festival set, huge sound.' },
      { id: 'sw3', date: D.old, venueId: 'v-church', rating: 77 }] },
    { id: 'a-motor', name: 'Motörhead', genre: 'Rock', color: '#f59e0b', seen: [{ id: 'sm1', date: D.far, where: 'Hammersmith Odeon', rating: 95, notes: 'Loudest thing I have ever heard.' }] },
    { id: 'a-owls', name: 'The Night Owls', genre: 'Indie rock', color: '#ff5c8a', seen: [{ id: 'so1', date: D.t1, rating: 81 }] }, // no booking link: it is the act's only show that day
    { id: 'a-now', name: 'Todays Band', seen: [] },
    { id: 'a-now2', name: 'Todays Other', seen: [{ id: 'st1', date: D.today, where: 'Somewhere', rating: 60 }] });
  const show = (id, actId, date, x = {}) => ({ id, kind: 'show', status: 'confirmed', actId, date, venueId: 'v-church', doors: '19:30', setTime: '21:00', setLength: 60, ...x });
  d.bookings.push(
    show('b-w1', 'a-wolfe', D.w1, { status: 'settled', deal: { type: 'guarantee', fee: 1234 }, settlement: { tickets: 200, received: 1234 }, budget: [{ id: 'bg', cat: 'Travel', desc: 'Van', amount: 987 }] }),
    show('b-w2', 'a-wolfe', D.w2, { status: 'done', went: 'no' }),
    show('b-w3', 'a-wolfe', D.w3, { venueId: 'v-crown' }),
    show('b-w4', 'a-wolfe', D.w4, { status: 'hold' }),
    show('b-w5', 'a-wolfe', D.w5, { status: 'cancelled', venueId: '', venueName: 'Brudenell Social Club', address: 'Leeds' }),
    show('b-w6', 'a-wolfe', D.w6, { status: 'offer', venueId: 'v-crown' }),
    show('b-o1', 'a-owls', D.o1, { status: 'done', venueId: 'v-crown', notes: 'Chelsea Wolfe played a surprise three songs.',
      runningOrder: [{ id: 'r1', act: 'Doors', time: '19:30', length: 0 }, { id: 'r2', act: 'Chelsea Wolfe (support)', time: '20:00', length: 30 }, { id: 'r3', act: 'Sable', time: '20:40', length: '' }, { id: 'r4', act: 'The Night Owls', time: '21:00', length: 60, ours: true }] }),
    show('b-o2', 'a-owls', D.w3, { venueId: 'v-crown', setTime: '21:30' }), // the same night as b-w3: the sets overlap
    show('b-t1', 'a-owls', D.t1, { status: 'done', venueId: 'v-crown', title: 'Halloween Special' }),
    { id: 'b-s1', kind: 'session', status: 'done', actId: 'a-wolfe', date: D.s1, venueId: 'v-echo', start: '10:00', end: '18:00', rate: 45, rateUnit: 'hour' },
    { id: 'b-r1', kind: 'rehearsal', status: 'confirmed', actId: 'a-wolfe', date: D.r1, venueId: 'v-echo', start: '19:00', end: '22:00' },
    { id: 'b-x1', kind: 'other', status: 'confirmed', title: 'Radio slot with Chelsea', date: D.x1, start: '09:00' },
    { id: 'b-c1', kind: 'session', status: 'done', client: 'Lars Ulrich', date: D.c1, venueName: 'Home studio', start: '12:00', end: '15:00' },
    { id: 'b-nd', kind: 'show', status: 'confirmed', actId: 'a-wolfe', date: '', venueId: 'v-church' }, // no date: not on the calendar
    show('b-td', 'a-now', D.today, { venueId: 'v-crown' }),
    show('b-fs', 'a-now', D.began, { venueId: 'v-crown', endDate: D.ends, setTime: '', doors: '' })); // began two days ago, ends in two
});
const DATES = { today: day(0), began: day(-2), ends: day(2), w1: day(-40), w2: day(-200), w3: day(6), w4: day(20), w5: day(-90), w6: day(-120), o1: day(-15), t1: day(-30), s1: day(-5), r1: day(3), x1: day(-8), c1: day(-12), old: day(-300), far: day(-400) };

(async () => {
  const { browser, page, errors } = await open();
  await store(page, seed, DATES);
  await sleep(300);

  /* ------------------------------ the button ------------------------------ */
  const bar = () => page.evaluate(() => { const b = document.getElementById('searchBtn'), list = [...document.querySelectorAll('.top-actions > button')].filter(x => !x.hidden), brand = document.querySelector('.top .brand'), r = b.getBoundingClientRect();
    return { first: list[0] === b, n: list.length, name: b.getAttribute('aria-label'), glass: !!b.querySelector('svg circle') && !!b.querySelector('svg path'), hiddenFromSR: b.querySelector('.cloud-ico').getAttribute('aria-hidden'), shown: r.width > 0 && r.height > 0 && r.right <= innerWidth,
      small: getComputedStyle(brand.querySelector('small')).display, whole: brand.scrollWidth <= brand.clientWidth + 0.5, keys: b.getAttribute('aria-keyshortcuts') }; });
  let b = await bar();
  ok('the top bar has a magnifying glass, the first of its buttons, named Search for a screen reader', b.first && b.n === 5 && b.name === 'Search' && b.glass && b.hiddenFromSR === 'true' && b.shown && b.keys === '/', JSON.stringify(b));
  ok('on a phone the small words “booking deck” are hidden and GDEX shows whole', b.small === 'none' && b.whole, JSON.stringify(b));
  // Just wider than a phone, extra-large text and large buttons with Install showing leave no room for "booking deck":
  // it goes, rather than being cut short.
  await page.evaluate(() => { const r = document.documentElement.dataset; window.__was = { text: r.text, targets: r.targets }; r.text = 'xlarge'; r.targets = 'large'; document.getElementById('installBtn').hidden = false; });
  const cutAt = [];
  for (let w = 596; w <= 660; w += 2) { await page.setViewportSize({ width: w, height: 900 }); if (await page.evaluate(() => { const br = document.querySelector('.top .brand'); return br.scrollWidth > br.clientWidth + 0.5; })) cutAt.push(w); }
  await page.setViewportSize({ width: 420, height: 900 });
  await page.evaluate(() => { Object.assign(document.documentElement.dataset, window.__was); document.getElementById('installBtn').hidden = true; });
  ok('with extra-large text and large buttons, from 596 to 660 px the brand is never cut short (“booking deck” goes instead)', !cutAt.length, cutAt.join(' '));
  const everywhere = [];
  for (const id of ['acts', 'people', 'songs', 'sessions', 'backline', 'venues', 'money', 'tools', 'insurance', 'settings', 'bookings']) { await go(page, id); const x = await bar(); everywhere.push(x.first && x.shown ? '' : id); }
  ok('the button is on every page', everywhere.every(x => !x), everywhere.filter(Boolean).join(', '));

  /* ------------------------------ opening and closing ------------------------------ */
  await go(page, 'venues');
  const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
  await openSearch(page);
  let s = await page.evaluate(SHEET => { const el = document.querySelector(SHEET), q = document.getElementById('srch-q'), label = document.querySelector('label[for="srch-q"]'), out = document.querySelector('.srch-out');
    return { sheet: !!el, dialog: el && el.getAttribute('role'), focus: document.activeElement === q, value: q.value, label: label ? label.textContent : '', type: q.type, placeholder: q.placeholder, kids: [...out.children].map(c => c.className), help: out.textContent,
      page: window.logiPage(), under: document.querySelector('#page [data-page]').dataset.page, inert: document.getElementById('app').inert, sheets: document.querySelectorAll('.sheet').length }; }, SHEET);
  ok('the button opens the search as a sheet, with the focus in its box', s.sheet && s.dialog === 'dialog' && s.focus && s.value === '' && s.sheets === 1, JSON.stringify(s));
  ok('the box has a label', s.label === 'Search acts, places, shows and notes' && s.type === 'search' && s.placeholder === 'Act, place or notes', JSON.stringify(s));
  ok('before anything is typed there is only the box and a line of help', same(s.kids, ['srch-help muted small']) && /^Type an act, a place, a support act or a word from your notes\./.test(s.help) && !(await page.$('.srch-list, .srch-chips, .srch-found')), JSON.stringify(s));
  ok('it opens over the page the person was on, which does not change', s.page === 'venues' && s.under === 'venues' && s.inert === true, JSON.stringify(s));
  await closeSearch(page);
  ok('Escape closes it and the focus goes back to the button', !(await page.$(SHEET)) && (await focused(page)) === '#searchBtn' && (await page.evaluate(() => window.logiPage())) === 'venues');
  await openSearch(page);
  await page.click(`${SHEET} .sheet-head button[aria-label="Close"]`); await sleep(200);
  ok('the ✕ closes it and the focus goes back to the button', !(await page.$(SHEET)) && (await focused(page)) === '#searchBtn');

  // "/" opens it, but not while typing in a field, and not over another sheet or a tour.
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('/'); await sleep(250);
  s = await page.evaluate(() => ({ open: !!document.getElementById('srch-q'), focus: document.activeElement === document.getElementById('srch-q'), value: (document.getElementById('srch-q') || {}).value }));
  ok('“/” opens the search with the focus in the box (and types nothing in it)', s.open && s.focus && s.value === '', JSON.stringify(s));
  await page.keyboard.press('/'); await sleep(100);
  ok('“/” typed in the box is a character, not a second search', (await page.inputValue('#srch-q')) === '/' && (await page.$$('.sheet')).length === 1);
  await type(page, '');
  await closeSearch(page);
  ok('after “/” too, Escape puts the focus on the button', (await focused(page)) === '#searchBtn');
  await page.evaluate(() => { const i = document.createElement('input'); i.id = 't-field'; i.setAttribute('aria-label', 'A field'); document.querySelector('#page .page-card').prepend(i); i.focus(); });
  await page.keyboard.press('/'); await sleep(200);
  ok('“/” while typing in a field goes into the field', !(await page.$(SHEET)) && (await page.inputValue('#t-field')) === '/');
  await page.evaluate(() => document.getElementById('t-field').remove());
  await page.click('#displayBtn'); await page.waitForSelector('.sheet[aria-label="Display & accessibility"]'); await sleep(150);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('/'); await sleep(200);
  ok('“/” does nothing while another sheet is up', !(await page.$(SHEET)) && (await page.$$('.sheet')).length === 1);
  await page.keyboard.press('Escape'); await sleep(200);
  await page.click('#helpBtn'); await page.waitForSelector('.tour-card'); await sleep(300);
  await page.keyboard.press('/'); await sleep(200);
  ok('“/” does nothing while a walkthrough is up', !(await page.$(SHEET)) && !!(await page.$('.tour-card')));
  await page.keyboard.press('Escape'); await sleep(250);

  /* ------------------------------ what is searched ------------------------------ */
  const F = {};
  for (const q of ['chelsea', 'doom folk', 'church', 'abbey road', 'leeds', 'brudenell', 'roadburn', 'tilburg', 'halloween', 'sable', 'doors', 'surprise', 'loudest', 'spellbinding', 'wolfe church', 'church wolfe', 'CHURCH  Wolfe', 'wolfe, church', '(wolfe) “church”', 'motorhead', 'MOTÖRHEAD', 'lars', 'home studio', 'radio', 'owls', 'chelsea wolfe support', 'wolfe zzz', '   ']) F[q] = await finds(page, q);
  const WOLFE = ['b-r1', 'b-s1', 'b-w1', 'b-w2', 'b-w3', 'b-w4', 'b-w5', 'b-w6', 'sw2', 'sw3'];
  ok('a band is found by its name: every booking of hers, and her times seen that have no booking', same(F.chelsea, [...WOLFE, 'b-o1', 'b-x1'].sort()), JSON.stringify(F.chelsea));
  ok('…and by its genre', same(F['doom folk'], WOLFE), JSON.stringify(F['doom folk']));
  ok('a place is found by a venue’s name, its address and its town', same(F.church, ['b-w1', 'b-w2', 'b-w4', 'sw3']) && same(F['abbey road'], F.church) && same(F.leeds, [...F.church, 'b-w5'].sort()), JSON.stringify([F.church, F['abbey road'], F.leeds]));
  ok('…and by a place typed by hand on a show or in a band’s log', same(F.brudenell, ['b-w5']) && same(F.roadburn, ['sw2']) && same(F.tilburg, ['sw2']) && same(F['home studio'], ['b-c1']), JSON.stringify([F.brudenell, F.roadburn, F.tilburg, F['home studio']]));
  ok('a show is found by its own title', same(F.halloween, ['b-t1']) && same(F.radio, ['b-x1']), JSON.stringify([F.halloween, F.radio]));
  ok('…and by another act on its bill, so a band seen as a support act turns up (a slot with no length yet counts)', F.chelsea.includes('b-o1') && same(F['chelsea wolfe support'], ['b-o1']) && same(F.sable, ['b-o1']), JSON.stringify([F['chelsea wolfe support'], F.sable]));
  ok('…but not by a marker in the running order (Doors)', same(F.doors, []), JSON.stringify(F.doors));
  ok('notes are searched: a show’s, a logged time’s, and the notes of the time seen that belongs to a show', same(F.surprise, ['b-o1']) && same(F.loudest, ['sm1']) && same(F.spellbinding, ['b-w1']), JSON.stringify([F.surprise, F.loudest, F.spellbinding]));
  ok('every word typed must be found, in any order, capitals ignored: “wolfe church” is Chelsea Wolfe at The Church', same(F['wolfe church'], ['b-w1', 'b-w2', 'b-w4', 'sw3']) && same(F['church wolfe'], F['wolfe church']) && same(F['CHURCH  Wolfe'], F['wolfe church']) && same(F['wolfe zzz'], []), JSON.stringify([F['wolfe church'], F['church wolfe'], F['CHURCH  Wolfe'], F['wolfe zzz']]));
  ok('…and the punctuation around a word typed does not count (“wolfe, church”)', same(F['wolfe, church'], F['wolfe church']) && same(F['(wolfe) “church”'], F['wolfe church']), JSON.stringify([F['wolfe, church'], F['(wolfe) “church”']]));
  ok('accents are ignored: “motorhead” finds Motörhead', same(F.motorhead, ['sm1']) && same(F['MOTÖRHEAD'], ['sm1']), JSON.stringify([F.motorhead, F['MOTÖRHEAD']]));
  ok('a session’s artist typed by hand is found', same(F.lars, ['b-c1']), JSON.stringify(F.lars));
  ok('a time seen that belongs to a show on the calendar is not a second result (linked by the show, or the act’s only show that day)', !F.chelsea.includes('sw1') && same(F.owls, ['b-o1', 'b-o2', 'b-t1']), JSON.stringify(F.owls));
  ok('a booking with no date is not on the calendar, so it is not found; spaces alone search for nothing', !F.chelsea.includes('b-nd') && same(F['   '], []), JSON.stringify(F['   ']));
  ok('one function gives the names an act is known by, and the search reads a band’s name through it', await page.evaluate(() => Promise.all([import('./js/search.js'), import('./js/store.js')]).then(([m, st]) => JSON.stringify(m.actNames(st.byId('acts', 'a-motor'))) === '["Motörhead"]' && m.actNames(null).length === 0 && m.actNames({ name: '  ' }).length === 0)));

  /* ------------------------------ what comes up ------------------------------ */
  await go(page, 'bookings');
  await openSearch(page);
  await type(page, 'chelsea');
  ok('results come as the person types: a line says what was found', (await foundLine(page)) === '9 shows at 4 places', await foundLine(page));
  let r = await rows(page);
  ok('one list, newest first, with a line for today between what is still ahead and what is over', same(r, ['b-w4', 'b-w3', 'TODAY', 'b-o1', 'b-w1', 'b-w5', 'b-w6', 'b-w2', 'sw3', 'sw2']), JSON.stringify(r));
  let t = await page.evaluate(() => import('./js/util.js').then(u => { const li = document.querySelector('.srch-today'), ul = document.querySelector('.srch-list');
    return { text: li.firstElementChild.textContent, want: 'Today · ' + u.fmtShort(u.todayISO()), sr: li.querySelector('.sr-only').textContent, list: ul.tagName, label: ul.getAttribute('aria-label'), items: [...ul.children].every(c => c.tagName === 'LI'), buttons: [...ul.querySelectorAll('li:not(.srch-today)')].every(li => li.children.length === 1 && li.firstElementChild.tagName === 'BUTTON') }; }));
  ok('the line names today', t.text === t.want && /still to come/.test(t.sr) && /over/.test(t.sr), JSON.stringify(t));
  ok('the results are a list a screen reader can walk: a ul of li, each card one button', t.list === 'UL' && t.label === 'Results' && t.items && t.buttons, JSON.stringify(t));
  let k = await chips(page, '.srch-kinds');
  ok('the kind row counts each kind and starts on Shows', same(k, [['Shows', 9, 'true'], ['Sessions', 1, 'false'], ['Rehearsals', 1, 'false'], ['Other', 1, 'false']]) && (await page.getAttribute('.srch-kinds', 'role')) === 'group' && (await page.getAttribute('.srch-kinds', 'aria-label')) === 'Kind', JSON.stringify(k));
  let p = await chips(page, '.srch-places');
  ok('the place chips have each place with its count, after All', same(p, [['All', 9, 'true'], ['The Church', 4, 'false'], ['The Crown', 3, 'false'], ['Brudenell Social Club', 1, 'false'], ['Roadburn, Tilburg', 1, 'false']]) && (await page.getAttribute('.srch-places', 'aria-label')) === 'Place', JSON.stringify(p));
  ok('a pressed chip says so with a tick as well as its colour', await page.evaluate(() => [...document.querySelectorAll('.srch-chips .chip')].every(c => !!c.querySelector('.srch-tick') === (c.getAttribute('aria-pressed') === 'true') && c.classList.contains('on') === (c.getAttribute('aria-pressed') === 'true'))));

  // The card is the calendar's own.
  await closeSearch(page);
  await page.waitForSelector('.bk-agenda .bk-card[data-id="b-w3"]');
  const onCal = await page.evaluate(() => Object.fromEntries(['b-w3', 'b-w4'].map(id => { const c = document.querySelector(`.bk-agenda .bk-card[data-id="${id}"]`); return [id, { cls: c.className, date: c.querySelector('.bk-date').innerHTML, main: c.querySelector('.bk-card-main').innerHTML, style: c.getAttribute('style'), title: c.getAttribute('title') }]; })));
  await openSearch(page);
  ok('opening it again in the same visit brings back what was typed and its results', (await page.inputValue('#srch-q')) === 'chelsea' && same(await rows(page), r) && (await foundLine(page)) === '9 shows at 4 places');
  const inSearch = await page.evaluate(() => Object.fromEntries(['b-w3', 'b-w4'].map(id => { const c = document.querySelector(`.srch-list .bk-card[data-id="${id}"]`); return [id, { cls: c.className, date: c.querySelector('.bk-date').innerHTML, main: c.querySelector('.bk-card-main').innerHTML, style: c.getAttribute('style'), title: c.getAttribute('title') }]; })));
  const sameCard = id => inSearch[id].cls === onCal[id].cls && inSearch[id].main === onCal[id].main && inSearch[id].style === onCal[id].style && (inSearch[id].date === onCal[id].date || /srch-year/.test(inSearch[id].date));
  ok('a booking is drawn with the calendar’s own card: the same words, status, chip and note as under Coming up', sameCard('b-w3') && sameCard('b-w4'), JSON.stringify([inSearch['b-w3'].main, onCal['b-w3'].main]));
  ok('…without the calendar’s press-and-hold to delete', onCal['b-w3'].title === 'Tap to open; press and hold to delete' && inSearch['b-w3'].title === null);
  const cards = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.srch-list .card')].map(c => [c.dataset.seen || c.dataset.id, {
    text: c.textContent, pill: (c.querySelector('.bk-card-top .pill') || { textContent: '' }).textContent, overlap: (c.querySelector('.bk-overlap') || { textContent: '' }).textContent, chip: !!c.querySelector('.vn-chip'), went: (c.querySelector('.bk-went') || { textContent: '' }).textContent,
    score: (c.querySelector('.srch-score') || { textContent: '' }).textContent, why: [...c.querySelectorAll('.srch-why')].map(e => e.textContent), sub: (c.querySelector('.bk-card-sub') || { textContent: '' }).textContent, title: (c.querySelector('.bk-card-title') || { textContent: '' }).textContent,
    year: (c.querySelector('.srch-year') || { textContent: '' }).textContent, seen: c.classList.contains('srch-seen'), sr: (c.querySelector(':scope > .sr-only') || { textContent: '' }).textContent }])));
  ok('holds, offers and cancelled shows are found and marked as the calendar marks them', cards['b-w4'].pill === 'Hold' && cards['b-w6'].pill === 'Offer in' && cards['b-w5'].pill === 'Cancelled' && cards['b-w1'].pill === 'Paid / settled', JSON.stringify([cards['b-w4'].pill, cards['b-w6'].pill, cards['b-w5'].pill, cards['b-w1'].pill]));
  ok('the overlap note, the house-rules chip and “Didn’t go” are on the cards', cards['b-w3'].overlap === 'Overlaps with The Night Owls, 21:30' && cards['b-w4'].chip && cards['b-w1'].chip && !cards['b-w5'].chip && cards['b-w2'].went === 'Didn’t go' && !cards['b-w1'].went, JSON.stringify([cards['b-w3'].overlap, cards['b-w2'].went]));
  ok('a past show that was scored shows its score; one that was not shows none', cards['b-w1'].score === '★ Scored 92/100' && cards['b-w2'].score === '' && cards['b-w5'].score === '', JSON.stringify([cards['b-w1'].score, cards['b-w2'].score]));
  ok('a show that is over does not say it is on now', !/On now/.test(cards['b-w1'].sub) && !/On now/.test(cards['b-w2'].sub) && /^In 6 days/.test(cards['b-w3'].sub), JSON.stringify([cards['b-w1'].sub, cards['b-w3'].sub]));
  const years = await page.evaluate(D => { const now = String(new Date().getFullYear()); return [...document.querySelectorAll('.srch-list .card')].map(c => { const id = c.dataset.seen || c.dataset.id, iso = D[id], y = c.querySelector('.srch-year'); return { id, ok: iso.slice(0, 4) === now ? !y : !!y && y.textContent === iso.slice(0, 4) && y.parentElement.classList.contains('bk-date') }; }); },
    { 'b-w4': DATES.w4, 'b-w3': DATES.w3, 'b-o1': DATES.o1, 'b-w1': DATES.w1, 'b-w5': DATES.w5, 'b-w6': DATES.w6, 'b-w2': DATES.w2, sw3: DATES.old, sw2: DATES.far });
  ok('a card from another year says the year under its date (a time seen 400 days ago always does)', years.every(y => y.ok) && cards.sw2.year === DATES.far.slice(0, 4), JSON.stringify(years.filter(y => !y.ok)));
  const longDate = await page.evaluate(iso => import('./js/util.js').then(u => u.fmtLong(iso)), DATES.far);
  ok('a time seen with no booking is a plainer card: the date, the band, the place, the score, and “From the log”', cards.sw2.seen && cards.sw2.title === 'Chelsea Wolfe @ Roadburn, Tilburg' && cards.sw2.pill === 'From the log' && cards.sw2.score === '★ Scored 88/100' && cards.sw2.sr === longDate + '. ' && cards.sw3.title === 'Chelsea Wolfe @ The Church' && cards.sw3.score === '★ Scored 77/100', JSON.stringify(cards.sw2));
  ok('a card found by its bill says who else was on it', same(cards['b-o1'].why, ['Also on the bill: Chelsea Wolfe (support)']) && cards['b-w1'].why.length === 0, JSON.stringify(cards['b-o1'].why));
  ok('every card names its place', ['b-w4', 'b-w1', 'b-w2', 'sw3'].every(id => /The Church/.test(cards[id].title)) && ['b-w3', 'b-w6', 'b-o1'].every(id => /The Crown/.test(cards[id].title)) && /Brudenell Social Club/.test(cards['b-w5'].title));

  // The place chips.
  await chip(page, '.srch-places', 'The Church').click(); await sleep(200);
  ok('a tap on a place shows only what was there, and the line says so', same(await rows(page), ['b-w4', 'TODAY', 'b-w1', 'b-w2', 'sw3']) && (await foundLine(page)) === '4 shows at The Church', JSON.stringify([await rows(page), await foundLine(page)]));
  p = await chips(page, '.srch-places');
  ok('the place’s chip says it is pressed, and keeps the focus', same(p.map(x => x[2]), ['false', 'true', 'false', 'false', 'false']) && (await page.evaluate(() => document.activeElement.textContent.includes('The Church') && document.activeElement.getAttribute('aria-pressed') === 'true')), JSON.stringify(p));
  await sleep(700);
  ok('the new count is announced', (await said(page)) === '4 results', await said(page));
  await chip(page, '.srch-places', 'The Church').click(); await sleep(200);
  ok('a second tap undoes it', (await rows(page)).length === 10 && (await chips(page, '.srch-places'))[0][2] === 'true' && (await page.evaluate(() => document.activeElement.textContent.includes('The Church'))));
  await chip(page, '.srch-places', 'The Crown').click(); await sleep(150);
  ok('another place lists what was there, with the line for today between them', same(await rows(page), ['b-w3', 'TODAY', 'b-o1', 'b-w6']) && (await foundLine(page)) === '3 shows at The Crown', JSON.stringify(await rows(page)));
  await page.click('#srch-place-all'); await sleep(150);
  ok('All undoes it too', (await rows(page)).length === 10 && (await foundLine(page)) === '9 shows at 4 places' && (await focused(page)) === '#srch-place-all');

  // The kind row.
  await chip(page, '.srch-kinds', 'Sessions').click(); await sleep(200);
  ok('a tap on Sessions lists the sessions', same(await rows(page), ['b-s1']) && (await foundLine(page)) === '1 session at Echo Chamber Studios', JSON.stringify([await rows(page), await foundLine(page)]));
  ok('…with no place chips (everything found is at one place) and no line for today (it is all over)', !(await page.$('.srch-places')) && !(await page.$('.srch-today')) && same((await chips(page, '.srch-kinds')).map(x => x[2]), ['false', 'true', 'false', 'false']) && (await focused(page)) === 'session');
  await chip(page, '.srch-kinds', 'Other').click(); await sleep(150);
  ok('Other lists the diary entry, which has no place', same(await rows(page), ['b-x1']) && (await foundLine(page)) === '1 diary entry', await foundLine(page));
  await chip(page, '.srch-kinds', 'Sessions').click(); await sleep(150);
  await typeOn(page, ' echo'); // chelsea echo
  ok('the kind picked holds while the search is narrowed and still finds it', same(await rows(page), ['b-s1']) && same((await chips(page, '.srch-kinds')).map(x => x.slice(0, 2)), [['Sessions', 1], ['Rehearsals', 1]]), JSON.stringify(await chips(page, '.srch-kinds')));
  await typeOn(page, 'church', 4); // chelsea church
  ok('when the kind picked finds nothing and another does, the list moves there and says so', (await foundLine(page)) === 'No sessions found. 4 shows at The Church' && same(await rows(page), ['b-w4', 'TODAY', 'b-w1', 'b-w2', 'sw3']) && !(await page.$('.srch-kinds')), await foundLine(page));
  await type(page, '');
  ok('an emptied box is the box and the line of help again', same(await page.$$eval('.srch-out > *', els => els.map(e => e.className)), ['srch-help muted small']));
  await type(page, 'echo chamber');
  ok('a new search starts on Shows; with no show found it lists the first kind that was, and says so', (await foundLine(page)) === 'No shows found. 1 session at Echo Chamber Studios' && same(await chips(page, '.srch-kinds'), [['Sessions', 1, 'true'], ['Rehearsals', 1, 'false']]) && same(await rows(page), ['b-s1']), JSON.stringify([await foundLine(page), await chips(page, '.srch-kinds')]));
  await type(page, 'chelsea'); await chip(page, '.srch-kinds', 'Rehearsals').click(); await sleep(150);
  await type(page, 'motorhead'); // typed over “chelsea” with Rehearsals picked: a new search, which starts on Shows
  ok('a search typed over the last one starts on Shows again; with one kind found there is no kind row, and with one place no place chips', (await foundLine(page)) === '1 show at Hammersmith Odeon' && same(await rows(page), ['sm1']) && !(await page.$('.srch-chips')) && !(await page.$('.srch-today')), await foundLine(page));
  // Typed key by key over the whole of the last search, a new one starts on Shows even when its first letter begins an
  // old word ("c" over "chelsea", on the way to "church").
  await type(page, 'chelsea'); await chip(page, '.srch-kinds', 'Sessions').click(); await sleep(150);
  await page.focus('#srch-q'); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('church', { delay: 15 }); await sleep(200);
  ok('…also typed key by key over the words selected, when its first letter begins one of the old words', (await foundLine(page)) === '4 shows at The Church', await foundLine(page));
  await type(page, 'loudest thing');
  ok('a card found by its notes shows the piece of the note', same(await page.$$eval('.srch-list .srch-why', els => els.map(e => e.textContent)), ['Notes: Loudest thing I have ever heard.']));
  await type(page, 'owls halloween');
  ok('a show with a title of its own, whose card does not name the band, says whose show it is', same(await rows(page), ['b-t1']) && same(await page.$$eval('.srch-list .srch-who', els => els.map(e => e.textContent)), ['Act: The Night Owls']), JSON.stringify(await page.$$eval('.srch-list .bk-card-main', els => els.map(e => e.textContent))));
  await type(page, 'radio');
  ok('one result with no place: “No shows found. 1 diary entry”', (await foundLine(page)) === 'No shows found. 1 diary entry', await foundLine(page));
  await type(page, 'zzzz');
  s = await page.evaluate(() => ({ kids: [...document.querySelector('.srch-out').children].map(c => c.className), text: document.querySelector('.srch-out').textContent }));
  ok('nothing found: a plain sentence says so', same(s.kids, ['srch-none']) && s.text === 'Nothing found for “zzzz”. Try fewer words, or part of a name.', JSON.stringify(s));
  await sleep(700);
  ok('…and “No results” is announced', (await said(page)) === 'No results', await said(page));

  // Today: a booking dated today is still ahead all day, a time seen dated today is over; one that began two days ago and ends in two is on now.
  await store(page, (st, iso) => st.update(d => { d.bookings.find(x => x.id === 'b-td').date = iso; d.acts.find(x => x.id === 'a-now2').seen[0].date = iso; }), day(0));
  await type(page, 'todays');
  await sleep(100);
  r = await rows(page);
  const nowSub = await page.$eval('.srch-list .bk-card[data-id="b-fs"] .bk-card-sub', e => e.textContent);
  ok('today’s booking is above the line, a time seen today below it; a festival that began two days ago and is still on is above it and says “On now”', same(r, ['b-td', 'b-fs', 'TODAY', 'st1']) && /^On now/.test(nowSub), JSON.stringify([r, nowSub]));

  /* ------------------------------ the keyboard, focus, what is said ------------------------------ */
  await type(page, 'chelsea');
  await sleep(700);
  ok('the count of results is announced when it changes (“9 results”)', (await said(page)) === '9 results', await said(page));
  await page.focus('#srch-q');
  const walk = [];
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); walk.push(await page.evaluate(() => { const a = document.activeElement; return a.closest('.srch-kinds') ? 'kind' : a.closest('.srch-places') ? 'place' : a.closest('.srch-list') ? 'card' : a.id || a.getAttribute('aria-label') || a.tagName; })); }
  ok('Tab goes from the box through the kind row and the place chips to the cards', same(walk, ['kind', 'kind', 'kind', 'kind', 'place', 'place', 'place', 'place', 'place', 'card', 'card', 'card']), walk.join(' '));
  const ring = await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a), body = a.closest('.sheet-body').getBoundingClientRect(), top = document.querySelector('.srch-top').getBoundingClientRect(), r = a.getBoundingClientRect(); return { outline: cs.outlineStyle, width: parseFloat(cs.outlineWidth), clear: r.top >= top.bottom - 0.5 && r.bottom <= body.bottom + 0.5 }; });
  ok('a card reached with Tab shows the focus ring and is clear of the box that stays at the top', ring.outline === 'solid' && ring.width >= 3 && ring.clear, JSON.stringify(ring));
  await page.focus('#srch-q');
  await page.keyboard.press('ArrowDown'); const d1 = await focused(page);
  await page.keyboard.press('ArrowDown'); const d2 = await focused(page);
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); const d3 = await focused(page);
  ok('↓ from the box walks the cards and ↑ comes back to the box', d1 === 'b-w4' && d2 === 'b-w3' && d3 === '#srch-q', [d1, d2, d3].join(' '));
  await page.keyboard.press('Enter');
  ok('Enter in the box goes to the first card', (await focused(page)) === 'b-w4');
  await page.focus('.srch-places .chip[data-place="1"]');
  await page.keyboard.press('Space'); await sleep(200);
  ok('a chip pressed with the keyboard narrows the list and keeps the focus', (await foundLine(page)) === '3 shows at The Crown' && (await page.evaluate(() => document.activeElement.matches('.srch-places .chip[aria-pressed="true"]') && document.activeElement.textContent.includes('The Crown'))));
  await page.keyboard.press('Enter'); await sleep(200);
  ok('…and pressed again widens it', (await foundLine(page)) === '9 shows at 4 places' && (await page.evaluate(() => document.activeElement.textContent.includes('The Crown'))));
  const stays = await page.evaluate(() => { const b = document.querySelector('.srch-sheet .sheet-body'); b.scrollTop = 300; const top = document.querySelector('.srch-top').getBoundingClientRect(), body = b.getBoundingClientRect(), at = document.elementFromPoint(top.left + 40, top.top + 20); const res = { stuck: Math.abs(top.top - body.top) < 1, box: !!at && !!at.closest('.srch-top') }; b.scrollTop = 0; return res; });
  ok('the box stays in sight while the list scrolls under it', stays.stuck && stays.box, JSON.stringify(stays));

  // The sheet's own help.
  await page.click(`${SHEET} .sheet-help`); await page.waitForSelector('.tour-card'); await sleep(400);
  const tourTitle = await page.$eval('#tour-title', e => e.textContent), tourText = await page.$eval('.tour-card p', e => e.textContent);
  ok('the ? in the search runs its own walkthrough', tourTitle === 'Search' && /^Type an act, a place/.test(tourText) && /\/ opens the search/.test(tourText), tourTitle + ': ' + tourText);
  const steps = [tourTitle];
  for (let i = 0; i < 6 && (await page.$('.tour-card')); i++) { await page.click('.tour-actions .btn.primary'); await sleep(450); if (await page.$('.tour-card')) steps.push(await page.$eval('#tour-title', e => e.textContent)); }
  ok('…through what was found, the kinds, the places and the cards, and leaves the search open', same(steps, ['Search', 'What was found', 'Kinds', 'Places', 'The cards']) && !!(await page.$(SHEET)), steps.join(' › '));

  /* ------------------------------ a tap opens it ------------------------------ */
  await chip(page, '.srch-places', 'The Church').click(); await sleep(150);
  await closeSearch(page);
  await go(page, 'venues');
  await openSearch(page);
  ok('the place picked comes back with the search too', (await page.inputValue('#srch-q')) === 'chelsea' && (await foundLine(page)) === '4 shows at The Church' && (await chips(page, '.srch-places'))[1][2] === 'true');
  await page.click('.srch-list .bk-card[data-id="b-w1"]'); await sleep(600);
  s = await page.evaluate(() => { const head = document.querySelector('.bk-page [data-view-head]'); return { sheet: !!document.querySelector('.sheet'), page: window.logiPage(), booking: !!document.querySelector('.bk-page'), title: (head || { textContent: '' }).textContent, focusIn: !!document.activeElement && !!document.activeElement.closest('#page'), focusHead: document.activeElement === head, inert: document.getElementById('app').inert }; });
  ok('a tap on a booking’s card closes the search and opens that booking’s own page', !s.sheet && s.page === 'bookings' && s.booking && /Chelsea Wolfe @ The Church/.test(s.title) && !s.inert, JSON.stringify(s));
  ok('…with the focus on the booking’s page, not back on the button', s.focusIn && s.focusHead, JSON.stringify(s));
  await openSearch(page);
  ok('going back is one tap: the search opens with what was typed, its place and its results', (await page.inputValue('#srch-q')) === 'chelsea' && same(await rows(page), ['b-w4', 'TODAY', 'b-w1', 'b-w2', 'sw3']) && (await page.evaluate(() => { const q = document.getElementById('srch-q'); return document.activeElement === q && q.selectionStart === 0 && q.selectionEnd === q.value.length; })));
  await page.focus('.srch-list .card[data-seen="sw3"]');
  await page.keyboard.press('Enter'); await sleep(700);
  s = await page.evaluate(() => { const card = document.querySelector('.ac-card[data-id="a-wolfe"]'), hit = document.querySelector('.ac-seen.srch-hit'), a = document.activeElement, r = hit ? hit.getBoundingClientRect() : null;
    return { sheet: !!document.querySelector('.sheet'), page: window.logiPage(), open: !!card && card.classList.contains('open'), hit: hit ? hit.textContent : '', focus: !!a && !!hit && hit.contains(a) && a.tagName === 'BUTTON', label: a ? a.getAttribute('aria-label') : '', inView: !!r && r.top >= 0 && r.bottom <= innerHeight, rows: card ? card.querySelectorAll('.ac-seen').length : 0 }; });
  ok('a time seen opens in the band’s log: the acts page, her card dropped open, that entry in view and marked', !s.sheet && s.page === 'acts' && s.open && s.rows === 3 && /The Church/.test(s.hit) && /77/.test(s.hit) && s.inView, JSON.stringify(s));
  ok('…with the focus on that entry’s Edit button', s.focus && /^Edit the time you saw them on /.test(s.label), JSON.stringify(s));
  // The list follows the data while it is open.
  await go(page, 'bookings');
  // Nothing about a search is kept on the device: everything in its storage is the same after one as before it.
  const kept = () => page.evaluate(() => JSON.stringify([Object.entries(localStorage).sort(), Object.entries(sessionStorage).sort()]));
  const keptBefore = await kept();
  await openSearch(page);
  await type(page, 'wolfe church zzqq');
  await type(page, 'chelsea');
  await page.click('#srch-place-all'); await chip(page, '.srch-places', 'The Crown').click(); await sleep(100);
  await closeSearch(page);
  await openSearch(page);
  const cameBack = (await page.inputValue('#srch-q')) === 'chelsea' && (await foundLine(page)) === '3 shows at The Crown';
  ok('nothing about a search is stored on the device: its storage is the same after searching as before, though the search came back', cameBack && (await kept()) === keptBefore && !/zzqq/.test(keptBefore) && same(await page.evaluate(() => Object.keys(localStorage).sort()), keysBefore), JSON.stringify(await page.evaluate(() => Object.keys(localStorage).sort())));
  await page.click('#srch-place-all'); await sleep(100);
  await page.focus('.srch-list .bk-card[data-id="b-w3"]');
  await store(page, st => st.patch('bookings', 'b-w4', { status: 'confirmed' }));
  await sleep(250);
  ok('a change to the data while the search is open shows on its cards, and the focus stays on the card it was on', (await page.$eval('.srch-list .bk-card[data-id="b-w4"] .pill', e => e.textContent)) === 'Confirmed' && (await page.inputValue('#srch-q')) === 'chelsea' && (await focused(page)) === 'b-w3', await focused(page));
  await closeSearch(page);

  /* ------------------------------ every role, in its own words; money ------------------------------ */
  const WORDS = {
    producer: ['Type an artist, a place', 'everything in Bookings', 'seeing an artist in Artists', 'Artist, place or notes', '9 shows at 4 places', 'Shows', 'Search artists, places, shows and notes'],
    manager: ['Type an act, a place', 'everything in Bookings', 'seeing an act in Roster', 'Act, place or notes', '9 shows at 4 places', 'Shows', 'Search acts, places, shows and notes'],
    band: ['Type a band, a place', 'everything in Bookings', 'seeing a band in Bands', 'Band, place or notes', '9 shows at 4 places', 'Shows', 'Search bands, places, shows and notes'],
    solo: ['Type an act, a place', 'everything in Bookings', 'seeing an act in My act', 'Act, place or notes', '9 shows at 4 places', 'Shows', 'Search acts, places, shows and notes'],
    scout: ['Type an act, a place', 'everything in Shows', 'seeing an act in Acts', 'Act, place or notes', '9 shows at 4 places', 'Shows', 'Search acts, places, shows and notes'],
    audiophile: ['Type a band, a place', 'everything in Gigs', 'seeing a band in Bands', 'Band, place or notes', '9 gigs at 4 places', 'Gigs', 'Search bands, places, gigs and notes'],
  };
  for (const [id, [type1, cal, acts, placeholder, line, kindWord, label]] of Object.entries(WORDS)) {
    await setRole(page, id);
    const first = await page.evaluate(() => { const list = [...document.querySelectorAll('.top-actions > button')].filter(x => !x.hidden); return list[0].id; });
    await openSearch(page);
    const help = await page.$eval('.srch-help', e => e.textContent), ph = await page.getAttribute('#srch-q', 'placeholder'), lab = await page.$eval('label[for="srch-q"]', e => e.textContent);
    await type(page, 'chelsea');
    const got = { help, ph, lab, line: await foundLine(page), kind: (await chips(page, '.srch-kinds'))[0], rows: await rows(page), text: await page.$eval('.srch-out', e => e.textContent) };
    ok(`${id}: the button is there, and the search speaks in the role’s words (${line}; ${placeholder})`, first === 'searchBtn' && help.includes(type1) && help.includes(cal) && help.includes(acts) && ph === placeholder && lab === label && got.line === line && same(got.kind, [kindWord, 9, 'true']) && got.rows.length === 10, JSON.stringify(got).slice(0, 400));
    if (id === 'scout' || id === 'audiophile') ok(`${id}: no money in the results (the show has a fee, a settlement and costs; the session a rate)`, !/[$£€]|1,?234|987|\b45\b/.test(got.text) && /Paid \/ settled/.test(got.text), got.text.slice(0, 200));
    if (id === 'audiophile') {
      await chip(page, '.srch-kinds', 'Sessions').click(); await sleep(150);
      await typeOn(page, ' church'); // chelsea church
      ok('audiophile: “No sessions found. 4 gigs at The Church”', (await foundLine(page)) === 'No sessions found. 4 gigs at The Church', await foundLine(page));
      await type(page, ''); await type(page, 'echo chamber');
      ok('audiophile: in a new search with no gig found the line says “No gigs found.”', (await foundLine(page)) === 'No gigs found. 1 session at Echo Chamber Studios', await foundLine(page));
    }
    if (id === 'producer') {
      await page.click(`${SHEET} .sheet-help`); await page.waitForSelector('.tour-card'); await sleep(350);
      ok('producer: the walkthrough says “an artist” too', /^Type an artist, a place/.test(await page.$eval('.tour-card p', e => e.textContent)));
      await page.keyboard.press('Escape'); await sleep(200);
    }
    await closeSearch(page);
  }
  await setRole(page, '');
  await openSearch(page); await type(page, 'chelsea');
  ok('Everything: no money in the results either, and the words are the plain ones', !/[$£€]|1,?234|987/.test(await page.$eval('.srch-out', e => e.textContent)) && (await foundLine(page)) === '9 shows at 4 places');
  await closeSearch(page);
  const sw = await page.evaluate(() => fetch('sw.js').then(x => x.text()));
  ok('the search’s two files are in the offline list', sw.includes("'js/search.js'") && sw.includes("'css/search.css'"));

  /* ------------------------------ 2,000 bookings and 200 bands ------------------------------ */
  await store(page, st => st.update(d => {
    const iso = n => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    for (let v = 0; v < 60; v++) d.venues.push({ id: 'pv' + v, kind: 'venue', name: `Bulk Hall ${v}`, address: `${v} Main Street, Town ${v % 12}` });
    for (let a = 0; a < 200; a++) d.acts.push({ id: 'pa' + a, name: `Bulk Band ${a}`, genre: a % 2 ? 'Shoegaze' : 'Krautrock', seen: Array.from({ length: 5 }, (_, i) => ({ id: `ps${a}-${i}`, date: iso(-5 - ((a * 7 + i * 31) % 1500)), where: `Club ${i}, Town ${a % 12}`, rating: 50 + ((a + i) % 50), notes: i % 3 ? '' : 'Muddy sound at the back.' })) });
    for (let b = 0; b < 2000; b++) d.bookings.push({ id: 'pb' + b, kind: b % 10 === 9 ? 'session' : 'show', status: 'confirmed', actId: 'pa' + (b % 200), date: iso(((b * 3) % 2200) - 1500), venueId: 'pv' + (b % 60), setTime: `${19 + (b % 4)}:00`, setLength: 45, start: '10:00', notes: b % 5 ? '' : 'Ask for Sam at the door.' });
  }));
  await sleep(400);
  const stats = () => page.evaluate(() => import('./js/search.js').then(m => m.searchStats()));
  const before = await stats(); // the search opens with the last one in it, so the words are built as it opens
  await openSearch(page);
  await type(page, '');
  const keyMs = [];
  for (const q of ['b', 'bu', 'bul', 'bulk', 'bulk ', 'bulk b', 'bulk ba', 'bulk ban', 'bulk band', 'bulk band 7']) keyMs.push(await page.evaluate(q => { const i = document.getElementById('srch-q'), t0 = performance.now(); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); return performance.now() - t0; }, q));
  const after = await stats();
  ok('with 2,000 bookings and 200 bands the words to search are built once, as the search opens, for all ten key presses', after.builds === before.builds + 1 && after.records >= 3000, JSON.stringify({ before: before.builds, after: after.builds, records: after.records }));
  ok('…and it stays quick: the index in well under a second, a search in a few milliseconds, a key press (search and draw) in a fraction of a second', after.buildMs < 1000 && after.findMs < 100 && Math.max(...keyMs.slice(1)) < 600, `index ${after.buildMs.toFixed(0)} ms, search ${after.findMs.toFixed(1)} ms, key presses ${keyMs.map(x => x.toFixed(0)).join(' ')} ms`);
  await type(page, 'bulk band 7'); // 7, 70 to 79: eleven bands
  ok('the line counts everything found, and the list draws the first thirty', /^\d+ shows at \d+ places$/.test(await foundLine(page)) && (await page.$$('.srch-list .card')).length === 30 && /^Show 30 more \(\d+ left\)$/.test(await page.$eval('#srch-more', e => e.textContent)), [await foundLine(page), await page.$eval('#srch-more', e => e.textContent)].join(' | '));
  await page.click('#srch-more'); await sleep(250);
  ok('Show more adds the next thirty and puts the focus on the first of them', (await page.$$('.srch-list .card')).length === 60 && (await page.evaluate(() => [...document.querySelectorAll('.srch-list .card')].indexOf(document.activeElement))) === 30);
  // A tap on a card far down the list while the list is still moving (a fling on a phone), then the search again: the
  // same cards, scrolled to where they were. The scroll the closed sheet reports afterwards (back at the top) must not count.
  const far = await page.evaluate(() => { const body = document.querySelector('.srch-sheet .sheet-body'); body.scrollTop = 1600; const b = body.getBoundingClientRect();
    const c = [...document.querySelectorAll('.srch-list .card[data-id]')].find(x => { const r = x.getBoundingClientRect(); return r.top > b.top + 150 && r.bottom < b.bottom; });
    const res = { id: c && c.dataset.id, top: body.scrollTop }; if (c) c.click(); return res; }); // the tap comes before the scroll is reported
  await sleep(600);
  const wentTo = await page.evaluate(() => (document.querySelector('.bk-page [data-view-head]') || { textContent: '' }).textContent);
  await openSearch(page);
  const cameBackTo = await page.evaluate(id => { const body = document.querySelector('.srch-sheet .sheet-body'), b = body.getBoundingClientRect(), r = document.querySelector(`.srch-list .card[data-id="${id}"]`).getBoundingClientRect(); return { top: body.scrollTop, cards: document.querySelectorAll('.srch-list .card').length, inView: r.top >= b.top && r.bottom <= b.bottom }; }, far.id);
  ok('after a tap on a card far down, the search comes back with the same cards, scrolled to where it was', !!far.id && /Bulk Band/.test(wentTo) && cameBackTo.cards === 60 && Math.abs(cameBackTo.top - far.top) < 2 && cameBackTo.inView, JSON.stringify({ far, wentTo, cameBackTo }));
  await store(page, st => st.patch('acts', 'pa7', { name: 'Renamed Seven' }));
  await type(page, 'renamed seven');
  const again = await stats();
  ok('a change to the data builds the words again, once', again.builds === after.builds + 1 && /^\d+ shows at \d+ places$/.test(await foundLine(page)), JSON.stringify({ builds: again.builds, line: await foundLine(page) }));
  ok('past 24 places the chips stop and a line says how many more there are', (await page.$$('.srch-places .chip')).length <= 25 && (await type(page, 'bulk'), (await page.$$('.srch-places .chip')).length === 25) && /^and \d+ more places: type one to find it$/.test(await page.$eval('.srch-more-places', e => e.textContent)));
  await closeSearch(page);

  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ------------------------------ with the rest of Gdex: the question, the calendar's views, a show's page, the menus ------------------------------ */
  // Then a support act's time seen (it belongs to the headliner's show), and a renamed band (item 7: found by every name it
  // has had, each card saying the name it had that night).
  {
    const { browser, page, errors } = await open({ ask: true });
    const D2 = { ...DATES, q1: day(-3), p1: day(-25), ren1: day(-250), ren2: day(-100), wt: day(-150), pre: day(-130) };
    await store(page, seed, D2);
    await store(page, (st, D) => st.update(d => { d.bookings.push({ id: 'b-q1', kind: 'show', status: 'confirmed', actId: 'a-owls', date: D.q1, venueId: 'v-crown', setTime: '21:00', setLength: 45 }); }), D2);
    await sleep(200);
    await page.reload(); await page.waitForSelector('#deck .dk-next');
    const Q = '.sheet[aria-label="Did you see them?"]';
    await page.locator(Q).waitFor({ timeout: 8000 }).catch(() => {}); await sleep(300);
    const qUp = !!(await page.$(Q));
    await page.keyboard.press('/'); await sleep(200);
    const keptFocus = await page.evaluate(Q => !!document.querySelector(Q) && document.querySelector(Q).contains(document.activeElement), Q);
    const box = await page.evaluate(() => { const r = document.getElementById('searchBtn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(box.x, box.y); await sleep(250);
    s = await page.evaluate(Q => ({ q: !!document.querySelector(Q), search: !!document.getElementById('srch-q'), sheets: document.querySelectorAll('.sheet').length, inert: document.getElementById('app').inert }), Q);
    ok('“Did you see them?” wins: while it is up, “/” does nothing (the question keeps the focus) and nor does a tap where the magnifying glass is (the top bar is behind it)', qUp && keptFocus && s.q && !s.search && s.sheets === 1 && s.inert, JSON.stringify({ qUp, keptFocus, ...s }));
    await page.click('#ac-ask-close'); await sleep(300);
    await openSearch(page);
    ok('…and once it is closed the search opens as usual', !!(await page.$(SHEET)) && !(await page.$(Q)));
    await closeSearch(page);

    // Over each of the calendar's five views, and over a show's page: the search opens over it, and the view is the same after.
    const under = () => page.evaluate(() => { const v = document.querySelector('.bk-calview'); return { page: window.logiPage(), mode: v ? (v.className.match(/bk-mode-(\w+)/) || [])[1] : '', show: !!document.querySelector('.bk-page'), title: (document.querySelector('.cal-title') || document.querySelector('.bk-page [data-view-head]') || { textContent: '' }).textContent }; });
    const overViews = [];
    for (const v of ['month', 'two', 'week', 'three', 'day']) {
      await page.click('#bk-view-' + v); await sleep(250);
      const was = await under();
      await openSearch(page); await type(page, 'chelsea');
      const up = { sheet: !!(await page.$(SHEET)), cards: (await page.$$('.srch-list .card')).length };
      await closeSearch(page);
      const now = await under();
      overViews.push({ v, ok: was.mode === v && up.sheet && up.cards > 0 && same(now, was) && (await focused(page)) === '#searchBtn', was, now, up });
    }
    ok('the search opens over each of the calendar’s five views and leaves it as it was', overViews.every(x => x.ok), JSON.stringify(overViews.filter(x => !x.ok)));
    await page.click('#bk-view-month'); await sleep(200);
    await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('b-w1'))); await page.waitForSelector('.bk-page'); await sleep(300);
    const showWas = await under();
    await openSearch(page); await type(page, 'church');
    const overShow = { sheet: !!(await page.$(SHEET)), cards: (await page.$$('.srch-list .card')).length };
    await closeSearch(page);
    ok('…and over a show’s own page', showWas.show && overShow.sheet && overShow.cards > 0 && same(await under(), showWas) && (await focused(page)) === '#searchBtn', JSON.stringify([showWas, overShow, await under()]));
    // The track list (☰) is a sheet: "/" waits for it, with each of the three menus.
    const menus = [];
    for (const menu of ['record', 'tape', 'digital']) {
      await page.evaluate(m => { const p = JSON.parse(localStorage.getItem('gdex-prefs') || '{}'); p.menu = m; localStorage.setItem('gdex-prefs', JSON.stringify(p)); }, menu);
      await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(250);
      await page.locator(Q).waitFor({ timeout: 8000 }).catch(() => {}); // asked again on this load
      if (await page.$(Q)) { await page.click('#ac-ask-close'); await sleep(250); }
      await page.click('#deck .dk-list'); await sleep(300);
      const listUp = (await page.$$('.sheet')).length === 1;
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press('/'); await sleep(200);
      const blocked = !(await page.$(SHEET));
      await page.keyboard.press('Escape'); await sleep(250);
      await openSearch(page); await type(page, 'owls');
      const found = (await page.$$('.srch-list .card')).length;
      await closeSearch(page);
      menus.push({ menu, ok: listUp && blocked && found > 0 && (await page.evaluate(m => document.documentElement.dataset.menu === m, menu)), listUp, blocked, found });
    }
    ok('with the record player, the tape deck and the digital player: “/” does nothing while the track list is up, and the search works after it', menus.every(x => x.ok), JSON.stringify(menus));

    // A support act. Chelsea Wolfe logged at The Night Owls' show at The Crown (on its bill as "Chelsea Wolfe (support)"),
    // by the venue; Motörhead logged at a show at a place typed by hand with it on the bill, by the place typed; Motörhead
    // logged at The Crown that same night too, when it was not on the bill.
    await store(page, (st, D) => st.update(d => {
      d.acts.find(a => a.id === 'a-wolfe').seen.push({ id: 'sg1', date: D.o1, venueId: 'v-crown', rating: 88, notes: 'Opened with a drone piece.' });
      d.acts.find(a => a.id === 'a-motor').seen.push({ id: 'sg2', date: D.p1, where: 'packhorse inn', rating: 70 }, { id: 'sg3', date: D.o1, venueId: 'v-crown', rating: 64 });
      d.bookings.push({ id: 'b-p1', kind: 'show', status: 'confirmed', actId: 'a-owls', date: D.p1, venueName: 'Packhorse Inn', setTime: '21:00', setLength: 60,
        runningOrder: [{ id: 'q1', act: 'Motörhead', time: '20:00', length: 40 }, { id: 'q2', act: 'The Night Owls', time: '21:00', length: 60, ours: true }] });
    }), D2);
    await sleep(200);
    const recs = q => page.evaluate(q => import('./js/search.js').then(m => Object.fromEntries(m.searchFor(q).map(r => [r.id, r.guests]))), q);
    const WOLFE2 = ['b-o1', 'b-r1', 'b-s1', 'b-w1', 'b-w2', 'b-w3', 'b-w4', 'b-w5', 'b-w6', 'b-x1', 'sw2', 'sw3'];
    let g = await recs('chelsea');
    ok('a band logged as the support act at another band’s show on the calendar is not a second result for that night: the show holds its time seen', same(Object.keys(g).sort(), WOLFE2) && same(g['b-o1'], ['sg1']), JSON.stringify(g));
    g = await recs('motorhead');
    ok('…matched by the place typed by hand too; a band logged there that night that was not on the bill keeps its own card', same(Object.keys(g).sort(), ['b-p1', 'sg3', 'sm1']) && same(g['b-p1'], ['sg2']) && same(g.sg3, []), JSON.stringify(g));
    ok('…and what was logged is still searched, on the show: the notes, the band’s genre', same(Object.keys(await recs('drone')), ['b-o1']) && same(Object.keys(await recs('doom folk')).sort(), ['b-o1', 'b-r1', 'b-s1', 'b-w1', 'b-w2', 'b-w3', 'b-w4', 'b-w5', 'b-w6', 'sw2', 'sw3']));
    await openSearch(page); await type(page, 'chelsea');
    const card = id => page.evaluate(id => { const c = document.querySelector(`.srch-list .card[data-id="${id}"]`); return c ? { guest: [...c.querySelectorAll('.srch-guest')].map(e => e.textContent), score: [...c.querySelectorAll('.srch-score:not(.srch-guest)')].map(e => e.textContent), why: [...c.querySelectorAll('.srch-why')].map(e => e.textContent), was: [...c.querySelectorAll('.bk-formerly')].map(e => e.textContent), who: [...c.querySelectorAll('.srch-who')].map(e => e.textContent), title: c.querySelector('.bk-card-title').textContent } : null; }, id);
    let c = await card('b-o1');
    ok('the headliner’s card carries the support act’s score, by name: “★ Chelsea Wolfe 88/100”', (await foundLine(page)) === '9 shows at 4 places' && !(await rows(page)).includes('sg1') && !!c && same(c.guest, ['★ Chelsea Wolfe 88/100']) && same(c.score, []) && same(c.why, []), JSON.stringify([await foundLine(page), c]));
    await type(page, 'motorhead');
    c = await card('b-p1');
    ok('…and so does the show with Motörhead on its bill', !!c && same(c.guest, ['★ Motörhead 70/100']) && same(await rows(page), ['sg3', 'b-p1', 'sm1']) && (await foundLine(page)) === '3 shows at 3 places', JSON.stringify([c, await rows(page), await foundLine(page)]));
    await type(page, 'drone');
    c = await card('b-o1');
    ok('a word from the support act’s notes finds the show, with the piece of the note', !!c && same(c.why, ['Notes: Opened with a drone piece.']), JSON.stringify(c));
    await store(page, st => st.patch('bookings', 'b-p1', { status: 'cancelled' })); await sleep(200);
    g = await recs('motorhead');
    ok('a cancelled show takes no time seen: the support act’s card is back', same(Object.keys(g).sort(), ['b-p1', 'sg2', 'sg3', 'sm1']) && same(g['b-p1'], []), JSON.stringify(g));
    await store(page, st => st.patch('bookings', 'b-p1', { status: 'confirmed' })); await sleep(150);
    await closeSearch(page);

    // A renamed band: The Wolves, then Chelsea Wolfe from D.ren1, then Wolfe Moon from D.ren2, renamed through the store with
    // days in the past; one show of hers with a title of its own from before the second change.
    await store(page, (st, D) => st.update(d => { const a = d.acts.find(x => x.id === 'a-wolfe'); a.formerNames = [{ name: 'The Wolves', until: D.ren1 }, { name: 'Chelsea Wolfe', until: D.ren2 }]; a.name = 'Wolfe Moon';
      d.bookings.push({ id: 'b-wt', kind: 'show', status: 'done', actId: 'a-wolfe', date: D.wt, venueId: 'v-church', title: 'Doom Night', setTime: '21:00', setLength: 60 }); }), D2);
    await sleep(200);
    ok('one function gives every name an act has had, the one it has now first, through the model’s earlier names', await page.evaluate(() => Promise.all([import('./js/search.js'), import('./js/store.js')]).then(([m, st]) => JSON.stringify(m.actNames(st.byId('acts', 'a-wolfe'))) === '["Wolfe Moon","Chelsea Wolfe","The Wolves"]' && JSON.stringify(m.actNames({ name: 'X', formerNames: 'junk' })) === '["X"]')));
    const HER = ['b-o1', 'b-r1', 'b-s1', 'b-w1', 'b-w2', 'b-w3', 'b-w4', 'b-w5', 'b-w6', 'b-wt', 'sw2', 'sw3'];
    const byOld = Object.keys(await recs('chelsea wolfe')).sort(), byOldest = Object.keys(await recs('the wolves')).sort(), byNew = Object.keys(await recs('wolfe moon')).sort();
    ok('a renamed band is found by its old name: its bookings and the times seen in its log, from before and after the change', same(byOld, HER), JSON.stringify(byOld));
    ok('…by the name before that, and by its new name: the same results', same(byOldest, HER) && same(byNew, HER), JSON.stringify([byOldest, byNew]));
    await openSearch(page); await type(page, 'chelsea wolfe');
    const kindsNow = await chips(page, '.srch-kinds');
    const cardsNow = await page.evaluate(() => import('./js/model.js').then(m => import('./js/store.js').then(st => [...document.querySelectorAll('.srch-list .card')].map(c => { const id = c.dataset.seen || c.dataset.id, b = c.dataset.id ? st.byId('bookings', id) : null;
      return { id, was: [...c.querySelectorAll('.bk-formerly')].map(e => e.textContent), want: b ? m.formerlyNote(b) : null, why: [...c.querySelectorAll('.srch-why')].map(e => e.textContent), who: [...c.querySelectorAll('.srch-who')].map(e => e.textContent), guest: [...c.querySelectorAll('.srch-guest')].map(e => e.textContent), title: c.querySelector('.bk-card-title').textContent, text: c.textContent }; }))));
    const C = Object.fromEntries(cardsNow.map(x => [x.id, x]));
    ok('searched by the old name, every show of hers comes up as a card', same(cardsNow.map(x => x.id).sort(), ['b-o1', 'b-w1', 'b-w2', 'b-w3', 'b-w4', 'b-w5', 'b-w6', 'b-wt', 'sw2', 'sw3']) && same(kindsNow.map(x => x.slice(0, 2)), [['Shows', 10], ['Sessions', 1], ['Rehearsals', 1]]), JSON.stringify([cardsNow.map(x => x.id), kindsNow]));
    ok('a show from before the change says “formerly <the name that night>” from the calendar’s own card, one after it does not', same(C['b-w2'].was, ['formerly Chelsea Wolfe']) && same(C['b-w6'].was, ['formerly Chelsea Wolfe']) && ['b-w1', 'b-w3', 'b-w4', 'b-w5', 'b-o1'].every(id => C[id].was.length === 0) && cardsNow.filter(x => x.want !== null).every(x => same(x.was, x.want ? [x.want] : [])), JSON.stringify(cardsNow.map(x => [x.id, x.was, x.want])));
    ok('a time seen from the log says it too, the name it had that night: “formerly The Wolves”', same(C.sw2.was, ['formerly The Wolves']) && same(C.sw3.was, ['formerly The Wolves']) && C.sw3.title === 'Wolfe Moon @ The Church' && /From the log/.test(C.sw3.text), JSON.stringify([C.sw2, C.sw3]));
    ok('a titled show from before the change names the band once, with the name it had then (“Wolfe Moon, formerly Chelsea Wolfe”), and no “Act:” line repeats it', same(C['b-wt'].was, ['Wolfe Moon, formerly Chelsea Wolfe']) && C['b-wt'].who.length === 0 && (C['b-wt'].text.match(/Wolfe Moon/g) || []).length === 1, JSON.stringify(C['b-wt']));
    ok('a card that does not print the name typed says why it is here: “Earlier name: Chelsea Wolfe”', same(C['b-w1'].why, ['Earlier name: Chelsea Wolfe']) && same(C.sw3.why, ['Earlier name: Chelsea Wolfe']) && same(C['b-w2'].why, []) && same(C['b-wt'].why, []), JSON.stringify([C['b-w1'].why, C.sw3.why, C['b-w2'].why]));
    ok('the support act’s score names her as she is called now on a night after the change', same(C['b-o1'].guest, ['★ Wolfe Moon 88/100']), JSON.stringify(C['b-o1']));
    await store(page, (st, D) => st.update(d => { d.acts.find(a => a.id === 'a-wolfe').seen.find(x => x.id === 'sg1').date = D.pre; d.bookings.find(b => b.id === 'b-o1').date = D.pre; }), D2); await sleep(250);
    ok('…and on a night before it, with the name she had then: “★ Wolfe Moon (formerly Chelsea Wolfe) 88/100”', same(await page.$$eval('.srch-list .card[data-id="b-o1"] .srch-guest', els => els.map(e => e.textContent)), ['★ Wolfe Moon (formerly Chelsea Wolfe) 88/100']));
    await store(page, (st, D) => st.update(d => { d.acts.find(a => a.id === 'a-wolfe').seen.find(x => x.id === 'sg1').date = D.o1; d.bookings.find(b => b.id === 'b-o1').date = D.o1; }), D2); await sleep(250);
    const rowsOld = await rows(page);
    await type(page, 'wolfe moon');
    ok('searched by the new name, the same cards in the same order', same(await rows(page), rowsOld) && same(await page.$$eval('.srch-list .card[data-id="b-w1"] .srch-why', els => els.length), 0), JSON.stringify([await rows(page), rowsOld]));
    await type(page, 'the wolves');
    ok('…and by the name before that', same(await rows(page), rowsOld));
    // The Owls, then The Night Owls, now Owl Parliament: "night owls" on a show after the change is The Night Owls alone.
    await store(page, (st, D) => st.update(d => { const a = d.acts.find(x => x.id === 'a-owls'); a.formerNames = [{ name: 'The Owls', until: D.ren1 }, { name: 'The Night Owls', until: D.ren2 }]; a.name = 'Owl Parliament'; }), D2); await sleep(200);
    await type(page, 'night owls');
    ok('the line names as few earlier names as say why: “Earlier name: The Night Owls”, not The Owls as well', same(await page.$$eval('.srch-list .card[data-id="b-o2"] .srch-why', els => els.map(e => e.textContent)), ['Earlier name: The Night Owls']),
      JSON.stringify(await page.$$eval('.srch-list .card[data-id="b-o2"] .srch-why', els => els.map(e => e.textContent))));
    await type(page, 'chelsea wolfe');
    await page.click('.srch-list .card[data-seen="sw3"]'); await sleep(700);
    s = await page.evaluate(() => { const hit = document.querySelector('.ac-seen.srch-hit'); return { page: window.logiPage(), hit: hit ? hit.textContent : '', focus: !!hit && hit.contains(document.activeElement) }; });
    ok('a time seen from before the change opens in her log on its own row, which says “as The Wolves”', s.page === 'acts' && /as The Wolves/.test(s.hit) && /77/.test(s.hit) && s.focus, JSON.stringify(s));
    ok('no errors in the console (the question, the views, a support act, a renamed band)', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }

  /* ------------------------------ a 320 px phone, extra-large text, large buttons ------------------------------ */
  for (const scheme of ['light', 'dark']) {
    const prefs = menu => JSON.stringify({ scheme, menu, text: 'xlarge', targets: 'large' });
    const n = await open({ viewport: { width: 320, height: 700 }, init: `try { if (!localStorage.getItem('gdex-prefs')) localStorage.setItem('gdex-prefs', '${prefs('record')}'); } catch (e) {}` });
    await store(n.page, seed, DATES);
    await sleep(300);
    for (const menu of ['record', 'tape', 'digital']) {
      await n.page.evaluate(p => localStorage.setItem('gdex-prefs', p), prefs(menu));
      await n.page.reload(); await n.page.waitForSelector('#deck .dk-next'); await sleep(250);
      const fit = await n.page.evaluate(() => { const brand = document.querySelector('.top .brand'), br = brand.getBoundingClientRect(), word = document.createRange(); word.selectNodeContents(brand); const wr = word.getBoundingClientRect();
        const btns = [...document.querySelectorAll('.top-actions > button')].filter(e => !e.hidden).map(e => { const r = e.getBoundingClientRect(); return { id: e.id, l: r.left, r: r.right, w: Math.round(r.width), h: Math.round(r.height), t: r.top, b: r.bottom }; });
        const deck = document.querySelector('.deck').getBoundingClientRect();
        return { html: document.documentElement.dataset, vw: innerWidth, page: document.documentElement.scrollWidth, small: getComputedStyle(brand.querySelector('small')).display, whole: brand.scrollWidth <= brand.clientWidth + 0.5 && wr.right <= br.right + 0.5 && br.left >= 0, gdex: brand.textContent.trim().startsWith('GDEX'),
          brandRight: br.right, btns, install: !document.getElementById('installBtn').hidden, inRow: btns.every((x, i) => x.l >= (i ? btns[i - 1].r : br.right) - 0.5 && x.r <= innerWidth + 0.5 && Math.abs(x.t - btns[0].t) < 1), clearOfMenu: btns.every(x => x.b <= deck.top + 0.5) }; });
      ok(`320 px, ${scheme}, ${menu}: extra-large text and large buttons are on, and Install is showing`, fit.html.text === 'xlarge' && fit.html.targets === 'large' && fit.html.scheme === scheme && fit.html.menu === menu && fit.install && fit.btns.length === 5 && fit.btns[0].id === 'searchBtn', JSON.stringify(fit.html));
      ok(`320 px, ${scheme}, ${menu}: GDEX shows whole, the small words are hidden, and the page is no wider than the screen`, fit.gdex && fit.whole && fit.small === 'none' && fit.page <= 320, JSON.stringify({ whole: fit.whole, small: fit.small, page: fit.page }));
      ok(`320 px, ${scheme}, ${menu}: all five buttons fit in one row beside it, none over another or the menu, each at least 36 px wide and 44 px tall`, fit.inRow && fit.clearOfMenu && fit.btns.every(x => x.w >= 36 && x.h >= 44), JSON.stringify(fit.btns));
    }
    await openSearch(n.page);
    const tall = () => n.page.evaluate(() => { const sh = document.querySelector('.srch-sheet'), r = sh.getBoundingClientRect(), body = sh.querySelector('.sheet-body'), q = document.getElementById('srch-q').getBoundingClientRect();
      const inside = e => { const x = e.getBoundingClientRect(); return x.width === 0 || (x.left >= r.left - 0.5 && x.right <= r.right + 0.5); };
      const solid = [...sh.querySelectorAll('.sheet-head *, #srch-q, .srch-help, .srch-none, .srch-found, .srch-chips, .srch-list > li, .srch-list .card, .srch-list .card *:not(.sr-only), #srch-more')];
      const lis = [...sh.querySelectorAll('.srch-list > li')].map(e => e.getBoundingClientRect());
      const cut = [...sh.querySelectorAll('.srch-list .bk-card-title, .srch-list .bk-card-sub, .srch-found, .srch-help, .srch-none, .srch-today > span:first-child, .srch-score, .srch-why, .srch-list .pill')].filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline').map(e => e.className);
      return { sheet: [Math.round(r.left), Math.round(r.right)], sideways: body.scrollWidth > body.clientWidth + 1, page: document.documentElement.scrollWidth, out: solid.filter(e => !inside(e)).map(e => e.className || e.tagName).slice(0, 5), over: lis.some((x, i) => i && x.top < lis[i - 1].bottom - 0.5), cut, box: q.left >= r.left && q.right <= r.right && q.height >= 44 }; });
    let f = await tall();
    ok(`320 px, ${scheme}: the empty search fits: the box and the line of help, nothing cut or pushed sideways`, !f.sideways && f.page <= 320 && f.out.length === 0 && f.cut.length === 0 && f.box, JSON.stringify(f));
    // Each role's placeholder (the longest is the producer's) is written into the box for a moment, to see it fits.
    const phFits = await n.page.evaluate(() => { const q = document.getElementById('srch-q'), v = q.value; const fit = ['Artist, place or notes', 'Band, place or notes', q.placeholder].map(t => { q.value = t; return q.scrollWidth <= q.clientWidth + 1; }); q.value = v; return fit; });
    ok(`320 px, ${scheme}: the box’s placeholder fits in it, in every role’s words`, phFits.every(Boolean), JSON.stringify(phFits));
    await type(n.page, 'chelsea');
    f = await tall();
    ok(`320 px, ${scheme}: results fit: the line, the chips’ rows, the cards and the line for today, none over another, nothing cut or pushed sideways`, !f.sideways && f.page <= 320 && f.out.length === 0 && !f.over && f.cut.length === 0 && (await rows(n.page)).length === 10, JSON.stringify(f));
    const rowsFit = await n.page.evaluate(() => [...document.querySelectorAll('.srch-chips')].map(row => { const r = row.getBoundingClientRect(), last = row.lastElementChild; last.focus(); const l = last.getBoundingClientRect(); return { scrolls: row.scrollWidth > row.clientWidth, tall: [...row.querySelectorAll('.chip')].every(c => c.getBoundingClientRect().height >= 44), lastInView: l.left >= r.left - 0.5 && l.right <= r.right + 0.5, pressedMark: !!row.querySelector('.chip.on .srch-tick') }; }));
    ok(`320 px, ${scheme}: the kind row and the place chips scroll inside themselves, and a chip that takes the focus comes into sight`, rowsFit.length === 2 && rowsFit.every(x => x.scrolls && x.tall && x.lastInView && x.pressedMark), JSON.stringify(rowsFit));
    await n.page.evaluate(() => { document.querySelector('.srch-sheet .sheet-body').scrollTop = 99999; }); await sleep(150);
    f = await tall();
    ok(`320 px, ${scheme}: the end of the list fits too (the times seen from the log)`, !f.sideways && f.out.length === 0 && !f.over && f.cut.length === 0, JSON.stringify(f));
    await type(n.page, 'zzzz');
    f = await tall();
    ok(`320 px, ${scheme}: “nothing found” fits`, !f.sideways && f.out.length === 0 && f.cut.length === 0, JSON.stringify(f));
    if (process.env.S) { await type(n.page, 'chelsea'); await n.page.screenshot({ path: `${process.env.S}/46-search-320-${scheme}.png` }); }
    await closeSearch(n.page);
    ok(`no errors in the console (320 px, ${scheme})`, n.errors.length === 0, n.errors.slice(0, 5).join(' | '));
    await n.browser.close();
  }

  /* ------------------------------ in the small hours: last night's show still to play ------------------------------ */
  // The page's clock is Playwright's, at 00:10 on a day of the spec's own (worked out in the page, so in the run's own
  // time zone). A show dated the day before, on stage at 00:30, is still to come: Coming up keeps it at its top marked
  // "Tonight", and the search lists it with what is ahead, above the line for today; the one that played at 20:00 is
  // over. Once its set is over (two hours after 00:30) the open search moves it below the line by itself.
  {
    const c = await open();
    const D = '2031-07-10', N = '2031-07-11';
    const at = (iso, hm) => c.page.evaluate(([iso, hm]) => { const [y, mo, d] = iso.split('-').map(Number), [hh, mm] = hm.split(':').map(Number); return new Date(y, mo - 1, d, hh, mm).getTime(); }, [iso, hm]);
    await c.ctx.clock.install({ time: await at(N, '00:10') });
    await c.page.reload(); await c.page.waitForSelector('#deck .dk-next');
    await store(c.page, (s, x) => s.update(d => {
      d.acts.push({ id: 'a-late', name: 'Late Band', color: '#8b5cf6' });
      d.bookings.push(
        { id: 'n-late', kind: 'show', status: 'confirmed', actId: 'a-late', date: x.D, venueName: 'The Crown', setTime: '00:30' },
        { id: 'n-done', kind: 'show', status: 'confirmed', actId: 'a-late', date: x.D, venueName: 'The Crown', setTime: '20:00', setLength: 60 },
        { id: 'n-next', kind: 'show', status: 'confirmed', actId: 'a-late', date: x.N, venueName: 'The Bell', setTime: '21:00' });
    }), { D, N });
    await sleep(300);
    ok('the small hours: Coming up keeps last night’s show still to play at its top, marked “Tonight”', same(await c.page.$$eval('.bk-agenda .bk-card', els => els.map(e => [e.dataset.id, e.querySelector('.bk-card-sub').textContent.split(' · ')[0]])), [['n-late', 'Tonight'], ['n-next', 'Today']]));
    await openSearch(c.page); await type(c.page, 'late band');
    const word = id => c.page.evaluate(id => { const e = document.querySelector(`.srch-list .card[data-id="${id}"] .bk-card-sub`); return e ? e.textContent.split(' · ')[0] : null; }, id);
    ok('…and the search lists it with what is still ahead, above the line for today, as its card says “Tonight”', same(await rows(c.page), ['n-next', 'n-late', 'TODAY', 'n-done']) && (await word('n-late')) === 'Tonight', JSON.stringify([await rows(c.page), await word('n-late')]));
    await c.page.clock.fastForward(150 * 60000); await sleep(400);
    ok('…once its set is over, the open search moves it below the line, with the show that is over', same(await rows(c.page), ['n-next', 'TODAY', 'n-done', 'n-late']) && (await word('n-late')) === 'On stage 00:30', JSON.stringify([await rows(c.page), await word('n-late')]));
    await closeSearch(c.page);
    ok('no errors in the console (the small hours)', c.errors.length === 0, c.errors.slice(0, 5).join(' | '));
    await c.browser.close();
  }
})().catch(e => { console.log('FAIL search spec crashed — ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')); process.exit(1); });
