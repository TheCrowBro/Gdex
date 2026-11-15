// The search: the box at the top of every page (js/search.js), the results it opens over the page, their tabs, and
// the dates it reads (js/search-dates.js).
//
// One browser as Everything for the box (on every page, in every menu, tucking away with the menu, "/"), opening and
// closing, what each kind is found by and where a tap opens it, dates, the bookings tab (item 8's results: the band,
// the place, the show itself, the notes; one list, newest first, with a line for today; the calendar's own card; the
// kind row and the place chips; a time seen from a band's log), All and the tabs, the keyboard, what a screen reader is
// told, each role's words, money, and how quick it is with 2,000 bookings, 200 bands, 500 people, 500 songs and 300
// pieces of gear. Then a browser with the rest of Tourbook (the question, the calendar's views, a show's page, the menus, a
// support act, a renamed band); then the date reader in four time zones with the page's clock moved (a Sunday, the turn
// of a month and of a year); then a 320 px phone with extra-large text and large buttons, light and dark, with each of
// the three section menus; then the small hours, with last night's show still to play.
// Nothing here depends on the hour or the time zone of the run: what must be over is dated five days back or more and
// what must be ahead three days on or more; the two records dated today are on the same side of the line all day;
// dates on screen are compared with the app's own formatters run in the page, and every date typed is made from the
// page's clock.
const { open, ok, sleep, go, BASE, licenceAt } = require('../helpers.cjs');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const SHEET = '.sheet[aria-label="Search"]';
const store = (page, fn, arg) => page.evaluate(`import('./js/store.js').then(s => (${fn.toString()})(s, ${JSON.stringify(arg === undefined ? null : arg)}))`);
// Typing: in the results' own box when they are up, else in the box at the top of the page (words there open them).
const type = async (page, q) => {
  if (await page.$('#srch-q')) await page.fill('#srch-q', q);
  else { await page.fill('#srch-box', q); if (q.trim()) await page.waitForSelector('#srch-q', { timeout: 3000 }).catch(() => {}); }
  await sleep(180);
};
// The box at the top of the page holding words: a tap brings their results back.
const reopen = async page => { await page.click('#srch-box'); await page.waitForSelector('#srch-q'); await sleep(150); };
const closeSearch = async page => { await page.keyboard.press('Escape'); await sleep(200); };
const pickTab = async (page, k) => { await page.click('#srch-tab-' + k); await sleep(150); };
// The bookings tab, unless it is the one on show already.
const gigs = async page => { if ((await page.getAttribute('#srch-tab-gigs', 'aria-selected').catch(() => null)) === 'false') await pickTab(page, 'gigs'); };
// Narrowing or widening as a person does it, at the end of the words already there: back is how many to rub out first.
const typeOn = async (page, more, back = 0) => { await page.focus('#srch-q'); await page.keyboard.press('End'); for (let i = 0; i < back; i++) await page.keyboard.press('Backspace'); await page.keyboard.type(more, { delay: 10 }); await sleep(180); };
// The list as drawn: a booking's id, a time seen's id, or TODAY for the line.
const rows = page => page.$$eval('.srch-list > li', els => els.map(li => (li.classList.contains('srch-today') ? 'TODAY' : li.firstElementChild.dataset.seen || li.firstElementChild.dataset.id)));
const foundLine = page => page.evaluate(() => (document.querySelector('.srch-found') || { textContent: '' }).textContent);
// A row of chips: [name, count, pressed]. The tabs: [kind, count, selected].
const chips = (page, sel) => page.$$eval(sel + ' .chip', els => els.map(e => [e.querySelector('.srch-chip-name').textContent.replace(/^[^A-Za-z]+/, ''), Number(e.querySelector('.srch-n').firstChild.textContent), e.getAttribute('aria-pressed')]));
const chip = (page, sel, name) => page.locator(`${sel} .chip`).filter({ has: page.locator('.srch-chip-name', { hasText: name }) }).first();
const tabsOf = page => page.$$eval('.srch-tab', els => els.map(e => [e.dataset.tab, Number(e.querySelector('.srch-n').textContent), e.getAttribute('aria-selected')]));
const finds = (page, q) => page.evaluate(q => import('./js/search.js').then(m => m.searchReady().then(() => m.searchFor(q).map(r => r.id).sort())), q);
const every = (page, q) => page.evaluate(q => import('./js/search.js').then(m => m.searchReady().then(() => m.searchAll(q))), q);
const said = page => page.evaluate(() => (document.getElementById('sr-live') || { textContent: '' }).textContent);
const focused = page => page.evaluate(() => { const a = document.activeElement; return a ? (a.id ? '#' + a.id : a.dataset.seen || a.dataset.id || a.dataset.kind || a.className) : ''; });
const setRole = async (page, id) => { await page.evaluate(id => { if (id) localStorage.setItem('tourbook-role', id); else localStorage.removeItem('tourbook-role'); }, id); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(250); };

// Chelsea Wolfe at The Church, Motörhead in a log, a support slot, a title, a client, and one of every kind; and one of
// each other kind of record: people (May Okafor shares her name with a month), songs, a setlist, gear, a take log, an
// invoice and a quote.
const seed = (s, D) => s.update(d => {
  d.venues.push(
    { id: 'v-church', kind: 'venue', name: 'The Church', address: '12 Abbey Road, Leeds', rules: { proCameras: 'no', compacts: 'yes', phones: 'yes' }, rulesNote: '', rulesTone: '' },
    { id: 'v-crown', kind: 'venue', name: 'The Crown', address: '3 High Street, Bristol', contact: 'Pat Doyle' },
    { id: 'v-echo', kind: 'studio', name: 'Echo Chamber Studios', address: '4 Mill Yard, Harbourtown', notes: 'Neve desk, live room with a piano.' });
  d.people.push(
    { id: 'p-sam', name: 'Sam Rivera', group: 'band', role: 'Drums', instrument: 'Drums', company: 'Rivera Beats', email: 'sam@rivera.example', phone: '07700 900123', notes: 'Bring the snare.' },
    { id: 'p-may', name: 'May Okafor', group: 'contact', role: 'Promoter', company: 'Night Shift Promotions' },
    { id: 'p-wolf', name: 'Wolfgang Press', group: 'crew', role: 'Lighting' });
  d.acts.push(
    { id: 'a-wolfe', name: 'Chelsea Wolfe', genre: 'Doom folk', color: '#8b5cf6', members: ['p-sam'], notes: 'Signed to Sacred Bones.', seen: [
      { id: 'sw1', date: D.w1, venueId: 'v-church', bookingId: 'b-w1', rating: 92, notes: 'Spellbinding. The new songs landed.' },
      { id: 'sw2', date: D.far, where: 'Roadburn, Tilburg', rating: 88, notes: 'Festival set, huge sound.' },
      { id: 'sw3', date: D.old, venueId: 'v-church', rating: 77 }] },
    { id: 'a-motor', name: 'Motörhead', genre: 'Rock', color: '#f59e0b', seen: [{ id: 'sm1', date: D.far, where: 'Hammersmith Odeon', rating: 95, notes: 'Loudest thing I have ever heard.' }] },
    { id: 'a-owls', name: 'The Night Owls', genre: 'Indie rock', color: '#ff5c8a', seen: [{ id: 'so1', date: D.t1, rating: 81 }] }, // no booking link: it is the act's only show that day
    { id: 'a-now', name: 'Todays Band', seen: [] },
    { id: 'a-now2', name: 'Todays Other', seen: [{ id: 'st1', date: D.today, where: 'Somewhere', rating: 60 }] });
  const show = (id, actId, date, x = {}) => ({ id, kind: 'show', status: 'confirmed', actId, date, venueId: 'v-church', doors: '19:30', setTime: '21:00', setLength: 60, ...x });
  d.bookings.push(
    show('b-w1', 'a-wolfe', D.w1, { status: 'settled', deal: { type: 'guarantee', fee: 1234 }, settlement: { tickets: 200, received: 1234 }, budget: [{ id: 'bg', cat: 'Travel', desc: 'Van', amount: 987 }],
      invoice: { number: 'INV-0042', status: 'sent', issued: D.w1, due: D.w1due, lines: [{ id: 'l1', desc: 'Show fee', qty: 1, unit: 'show', price: 1234 }], taxRate: 0, payments: [] } }),
    show('b-w2', 'a-wolfe', D.w2, { status: 'done', went: 'no' }),
    show('b-w3', 'a-wolfe', D.w3, { venueId: 'v-crown' }),
    show('b-w4', 'a-wolfe', D.w4, { status: 'hold', quote: { number: 'Q-0007', status: 'draft', issued: D.today, due: D.w4, lines: [{ id: 'l2', desc: 'Show fee', qty: 1, unit: 'show', price: 555 }], taxRate: 0, payments: [] } }),
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
  d.songs.push(
    { id: 'g-1', title: 'Hiss Spun', actId: 'a-wolfe', key: 'D minor', bpm: 70, duration: 240, tuning: 'Drop D', status: 'released', notes: 'Feedback intro.', splits: [{ id: 'sp1', name: 'Ben Chisholm', share: 50 }, { id: 'sp2', name: 'Chelsea Wolfe', share: 50 }] },
    { id: 'g-2', title: 'Church Bells', actId: 'a-owls', key: 'A major', status: 'demo' });
  d.setlists.push({ id: 'l-1', name: 'Roadburn set', actId: 'a-wolfe', items: [{ id: 'i1', songId: 'g-1' }, { id: 'i2', title: 'Drone jam', duration: 300 }], notes: 'Long fade at the end.' });
  d.gear.push({ id: 'q-1', name: 'Jazzmaster', category: 'Guitars', make: 'Fender', model: 'American Original', serial: 'V1234567', value: 2000, qty: 1, owner: 'p-sam', location: 'Rehearsal room', notes: 'New pickups fitted.' });
  d.logs.push({ id: 'k-1', bookingId: 'b-s1', date: D.s1, title: 'Hiss Spun takes', songId: 'g-1', startedAt: 0, takes: [{ id: 't1', n: 1, songId: 'g-1', at: 0, rating: 'keep', text: 'Great feel, a slight buzz on the bass' }], notes: 'Snare mic moved.' });
});
const DATES = { today: day(0), began: day(-2), ends: day(2), w1: day(-40), w1due: day(-26), w2: day(-200), w3: day(6), w4: day(20), w5: day(-90), w6: day(-120), o1: day(-15), t1: day(-30), s1: day(-5), r1: day(3), x1: day(-8), c1: day(-12), old: day(-300), far: day(-400) };
// What a person types for a day, made from the page's clock: "20 nov" and "november 20", in English as the search reads them.
const dayWords = (page, iso) => page.evaluate(iso => { const [y, m, d] = iso.split('-').map(Number), dt = new Date(y, m - 1, d), en = o => new Intl.DateTimeFormat('en', o).format(dt).toLowerCase();
  return { dm: `${d} ${en({ month: 'short' })}`, md: `${en({ month: 'long' })} ${d}`, year: String(y), month: en({ month: 'long' }) }; }, iso);

(async () => {
  const { browser, page, errors } = await open();
  await store(page, seed, DATES);
  await sleep(300);

  /* ------------------------------ the box ------------------------------ */
  const box = () => page.evaluate(() => { const bar = document.getElementById('srch-bar'), q = document.getElementById('srch-box'), deck = document.querySelector('#deck .deck'), r = q.getBoundingClientRect(), d = deck.getBoundingClientRect(), label = document.querySelector('label[for="srch-box"]');
    return { inMenu: bar.parentElement.id === 'deck', above: r.bottom <= d.top + 0.5 && r.top >= document.querySelector('.top').getBoundingClientRect().bottom - 0.5, role: bar.getAttribute('role'), label: label ? label.textContent : '', placeholder: q.placeholder, type: q.type,
      shown: r.width > 200 && r.height >= 44 && r.right <= innerWidth && r.left >= 0, keys: q.getAttribute('aria-keyshortcuts'), buttons: [...document.querySelectorAll('.top-actions > button')].filter(x => !x.hidden).map(x => x.id), old: !!document.getElementById('searchBtn') }; });
  let b = await box();
  ok('a search box sits under the top bar and above the section menu, in the menu’s own bar, as a search landmark', b.inMenu && b.above && b.role === 'search' && b.type === 'search' && b.shown && b.keys === '/', JSON.stringify(b));
  ok('…labelled, with a placeholder that names what it finds', b.label === 'Search bookings, acts, venues and more' && b.placeholder === 'Search bookings, acts, venues…', JSON.stringify(b));
  ok('the top bar has no search button any more: ?, Aa and Backup (and Install when it is offered)', !b.old && same(b.buttons.filter(x => x !== 'installBtn'), ['helpBtn', 'displayBtn', 'cloudBtn']), JSON.stringify(b.buttons));
  const everywhere = [];
  for (const menu of ['record', 'tape', 'digital']) {
    await page.evaluate(m => localStorage.setItem('tourbook-prefs', JSON.stringify({ menu: m })), menu); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(200);
    for (const id of ['acts', 'people', 'songs', 'sessions', 'backline', 'venues', 'money', 'tools', 'insurance', 'settings', 'bookings']) { await go(page, id); const x = await box(); everywhere.push(x.inMenu && x.above && x.shown ? '' : `${menu}:${id}`); }
  }
  await page.evaluate(() => localStorage.removeItem('tourbook-prefs')); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(200);
  ok('the box is on every page, above the record player, the tape deck and the digital player alike', everywhere.every(x => !x), everywhere.filter(Boolean).join(', '));
  // The top bar without the button: TOURBOOK is never cut short, "booking deck" shows whole or not at all (it goes under
  // 680 px), and no button is squeezed but where four cannot fit at their size.
  const bars = [];
  for (const text of ['normal', 'xlarge']) for (const targets of ['normal', 'large']) for (const install of [false, true]) for (const w of [320, 340, 360, 390, 412, 430, 469, 471, 520, 560, 600, 640, 720]) {
    await page.setViewportSize({ width: w, height: 900 });
    bars.push(await page.evaluate(([text, targets, install, w]) => {
      Object.assign(document.documentElement.dataset, { text, targets }); document.getElementById('installBtn').hidden = !install;
      const br = document.querySelector('.top .brand'), r = br.getBoundingClientRect(), small = br.querySelector('small'), t = [...br.childNodes].find(n => n.nodeType === 3 && n.data.trim()), rg = document.createRange(); rg.selectNodeContents(t);
      const wr = rg.getBoundingClientRect(), btns = [...document.querySelectorAll('.top-actions > button')].filter(x => !x.hidden).map(x => x.getBoundingClientRect()), hit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit'));
      const smallShown = getComputedStyle(small).display !== 'none', sr = small.getBoundingClientRect();
      const whole = wr.right <= r.right + 0.5 && br.scrollWidth <= br.clientWidth + 0.5 && wr.right <= btns[0].left + 0.5;
      const smallOk = !smallShown || (sr.right <= r.right + 0.5 && sr.right <= btns[0].left + 0.5);
      const fits = btns.every(x => x.width >= Math.min(hit, 36) - 0.5 && x.right <= innerWidth + 0.5) && (w < 380 || btns.every(x => x.width >= hit - 0.5));
      return { at: `${text}/${targets}/${install ? 'Install' : '-'}@${w}`, ok: whole && smallOk && fits && document.documentElement.scrollWidth <= innerWidth, small: smallShown };
    }, [text, targets, install, w]));
  }
  await page.setViewportSize({ width: 420, height: 900 });
  await page.evaluate(() => { Object.assign(document.documentElement.dataset, { text: 'normal', targets: 'normal' }); document.getElementById('installBtn').hidden = true; });
  ok('the top bar from 320 to 720 px, every text and button size, Install hidden or showing: TOURBOOK whole, “booking deck” whole or hidden, the buttons at their size (narrower only under 380 px)', bars.every(x => x.ok), bars.filter(x => !x.ok).map(x => x.at).join(' '));
  ok('…“booking deck” is hidden on a phone and up to 679 px (beside the longer TOURBOOK it would squeeze the buttons there), and back from 680 px', bars.filter(x => /@(320|412|430|469|471|520|600|640)$/.test(x.at)).every(x => !x.small) && bars.filter(x => /@720$/.test(x.at)).every(x => x.small));
  // It tucks away with the section menu when the page scrolls down, and comes back with it.
  await page.setViewportSize({ width: 420, height: 500 });
  await go(page, 'bookings');
  const tall = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await page.mouse.move(210, 450); await page.evaluate(() => window.scrollTo(0, 420)); await sleep(500);
  const tucked = await page.evaluate(() => ({ menu: document.getElementById('deck').classList.contains('tucked'), gone: document.getElementById('srch-box').getBoundingClientRect().bottom <= 0 }));
  ok('scrolling down tucks the box away with the section menu', tall > 500 && tucked.menu && tucked.gone, JSON.stringify({ tall, ...tucked }));
  await page.evaluate(() => window.scrollTo(0, 320)); await sleep(500);
  const back = await page.evaluate(() => ({ menu: !document.getElementById('deck').classList.contains('tucked'), seen: document.getElementById('srch-box').getBoundingClientRect().top >= 0 }));
  ok('…and scrolling up brings both back', back.menu && back.seen, JSON.stringify(back));
  await page.evaluate(() => window.scrollTo(0, 420)); await sleep(500);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('/'); await sleep(500);
  const slash = await page.evaluate(() => { const q = document.getElementById('srch-box'), r = q.getBoundingClientRect(); return { focus: document.activeElement === q, menu: !document.getElementById('deck').classList.contains('tucked'), inView: r.top >= 0 && r.bottom <= innerHeight }; });
  ok('“/” with the menu tucked away brings it back, with the focus in the box', slash.focus && slash.menu && slash.inView, JSON.stringify(slash));
  await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); }); await page.setViewportSize({ width: 420, height: 900 }); await sleep(300);

  /* ------------------------------ opening and closing ------------------------------ */
  await go(page, 'venues');
  const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
  await page.click('#srch-box'); await sleep(200);
  let s = await page.evaluate(() => { const q = document.getElementById('srch-box'), help = document.getElementById('srch-box-help'), r = help.getBoundingClientRect(); return { focus: document.activeElement === q, help: help.textContent, shown: getComputedStyle(help).display !== 'none' && r.height > 0, under: r.top >= q.getBoundingClientRect().bottom, described: q.getAttribute('aria-describedby'), sheets: document.querySelectorAll('.sheet').length }; });
  ok('a tap on the empty box puts the focus in it and shows a line of help under it, dates included; nothing opens yet', s.focus && s.shown && s.under && s.described === 'srch-box-help' && s.sheets === 0
    && s.help === 'Find bookings, acts, venues, people, songs, setlists, gear, take logs and invoices by any word in them, or by a date: “20 nov”, “friday”, “nov”, “2025” or “this week”.', JSON.stringify(s));
  await page.keyboard.type('c'); await page.waitForSelector('#srch-q'); await sleep(150);
  s = await page.evaluate(SHEET => { const el = document.querySelector(SHEET), q = document.getElementById('srch-q'), label = document.querySelector('label[for="srch-q"]');
    return { sheet: !!el, dialog: el && el.getAttribute('role'), focus: document.activeElement === q, value: q.value, caret: [q.selectionStart, q.selectionEnd], label: label ? label.textContent : '', top: document.getElementById('srch-box').value,
      page: window.logiPage(), under: document.querySelector('#page [data-page]').dataset.page, inert: document.getElementById('app').inert, sheets: document.querySelectorAll('.sheet').length }; }, SHEET);
  ok('typing opens the results over the page: their own box has the letter typed, the caret after it and the focus', s.sheet && s.dialog === 'dialog' && s.focus && s.value === 'c' && same(s.caret, [1, 1]) && s.sheets === 1, JSON.stringify(s));
  ok('…the results box is labelled, and the page under it does not change', s.label === 'Search bookings, acts, venues and more' && s.page === 'venues' && s.under === 'venues' && s.inert === true, JSON.stringify(s));
  await page.keyboard.type('helsea', { delay: 10 }); await sleep(200);
  ok('…the typing goes on there, and the box at the top of the page follows', (await page.inputValue('#srch-q')) === 'chelsea' && (await page.inputValue('#srch-box')) === 'chelsea');
  await closeSearch(page);
  ok('Escape closes the results, the box keeps the words, and the focus goes back into it', !(await page.$(SHEET)) && (await focused(page)) === '#srch-box' && (await page.inputValue('#srch-box')) === 'chelsea' && (await page.evaluate(() => window.logiPage())) === 'venues');
  await page.keyboard.press('Escape'); await sleep(100);
  ok('…and Escape in the box keeps them too', (await page.inputValue('#srch-box')) === 'chelsea' && !(await page.$(SHEET)));
  await reopen(page);
  s = await page.evaluate(() => { const q = document.getElementById('srch-q'); return { value: q.value, focus: document.activeElement === q, caret: [q.selectionStart, q.selectionEnd], tab: (document.querySelector('.srch-tab[aria-selected="true"]') || {}).id }; });
  ok('a tap on the box with words in it brings their results back on All, with the caret where the tap put it', s.value === 'chelsea' && s.focus && same(s.caret, [7, 7]) && s.tab === 'srch-tab-all', JSON.stringify(s));
  await page.click(`${SHEET} .sheet-head button[aria-label="Close"]`); await sleep(200);
  ok('the ✕ closes them and the focus goes back into the box', !(await page.$(SHEET)) && (await focused(page)) === '#srch-box');
  // "/" jumps into the box, but not while typing in a field, and not over another sheet or a tour.
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('/'); await sleep(250);
  s = await page.evaluate(() => { const q = document.getElementById('srch-box'); return { focus: document.activeElement === q, value: q.value, selected: q.selectionStart === 0 && q.selectionEnd === q.value.length, sheets: document.querySelectorAll('.sheet').length }; });
  ok('“/” jumps into the box with its words selected, types nothing and opens nothing', s.focus && s.value === 'chelsea' && s.selected && s.sheets === 0, JSON.stringify(s));
  await page.keyboard.press('/'); await sleep(250);
  ok('“/” typed in the box is a character: it starts a new search', (await page.inputValue('#srch-q').catch(() => '')) === '/' && (await page.$$('.sheet')).length === 1 && !!(await page.$('.srch-help')));
  await type(page, '');
  await closeSearch(page);
  ok('after it, Escape puts the focus back in the box, empty', (await focused(page)) === '#srch-box' && (await page.inputValue('#srch-box')) === '');
  await page.evaluate(() => { const i = document.createElement('input'); i.id = 't-field'; i.setAttribute('aria-label', 'A field'); document.querySelector('#page .page-card').prepend(i); i.focus(); });
  await page.keyboard.press('/'); await sleep(200);
  ok('“/” while typing in a field goes into the field', (await focused(page)) === '#t-field' && (await page.inputValue('#t-field')) === '/');
  await page.evaluate(() => document.getElementById('t-field').remove());
  await page.click('#displayBtn'); await page.waitForSelector('.sheet[aria-label="Display & accessibility"]'); await sleep(150);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('/'); await sleep(200);
  ok('“/” does nothing while another sheet is up', (await focused(page)) !== '#srch-box' && (await page.$$('.sheet')).length === 1);
  await page.keyboard.press('Escape'); await sleep(200);
  await page.click('#helpBtn'); await page.waitForSelector('.tour-card'); await sleep(300);
  await page.keyboard.press('/'); await sleep(200);
  ok('“/” does nothing while a walkthrough is up', (await focused(page)) !== '#srch-box' && !!(await page.$('.tour-card')));
  await page.keyboard.press('Escape'); await sleep(250);

  /* ------------------------------ what the bookings are found by ------------------------------ */
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

  /* ------------------------------ every other kind ------------------------------ */
  const E = {};
  for (const q of ['sacred bones', 'sam rivera', 'pat doyle', 'neve', 'no pro cameras', 'phones allowed', 'drums', 'rivera beats', 'sam@rivera', '900123', 'snare', 'hiss spun', 'drop d', 'chisholm', 'd minor', 'drone jam', 'roadburn set', 'long fade',
    'jazzmaster', 'fender', 'v1234567', 'pickups', 'buzz', 'snare mic', 'inv-0042', 'overdue', '1234', '1,234', 'q-0007', 'draft', 'wolfgang', 'lighting', 'zzzz']) E[q] = await every(page, q);
  const only = (r, want) => Object.entries(r).every(([k, ids]) => same([...ids].sort(), [...(want[k] || [])].sort()));
  ok('the kinds, in the order of the tabs', same(Object.keys(E.zzzz), ['gigs', 'bands', 'venues', 'people', 'songs', 'setlists', 'gear', 'logs', 'money']), JSON.stringify(Object.keys(E.zzzz)));
  ok('bands: by the notes and by a member’s name', only(E['sacred bones'], { bands: ['a-wolfe'] }) && E['sam rivera'].bands.includes('a-wolfe'), JSON.stringify([E['sacred bones'], E['sam rivera'].bands]));
  ok('venues: by the contact, the notes and the house rules, in the words Venues’ own search reads them', only(E['pat doyle'], { venues: ['v-crown'] }) && only(E.neve, { venues: ['v-echo'] }) && same(E['no pro cameras'].venues, ['v-church']) && same(E['phones allowed'].venues, ['v-church']), JSON.stringify([E['pat doyle'], E.neve, E['no pro cameras'].venues, E['phones allowed'].venues]));
  ok('people: by the name, the role, the company, the email, the phone, the notes and the acts they are in', same(E['sam rivera'].people, ['p-sam']) && same(E.drums.people, ['p-sam']) && same(E['rivera beats'].people, ['p-sam']) && same(E['sam@rivera'].people, ['p-sam']) && same(E['900123'].people, ['p-sam']) && E.snare.people.includes('p-sam') && (await every(page, 'chelsea')).people.includes('p-sam'), JSON.stringify([E.drums.people, E['900123'].people]));
  ok('songs: by the title, the tuning, the key and the writers on the split sheet; a setlist by the songs in it, its name and notes', same(E['hiss spun'].songs, ['g-1']) && same(E['drop d'].songs, ['g-1']) && same(E.chisholm.songs, ['g-1']) && same(E['d minor'].songs, ['g-1'])
    && same(E['hiss spun'].setlists, ['l-1']) && only(E['drone jam'], { setlists: ['l-1'] }) && same(E['roadburn set'].setlists, ['l-1']) && only(E['long fade'], { setlists: ['l-1'] }), JSON.stringify([E['hiss spun'], E['drone jam']]));
  ok('gear: by the name, the make, the serial, the notes and the owner', only(E.jazzmaster, { gear: ['q-1'] }) && same(E.fender.gear, ['q-1']) && only(E.v1234567, { gear: ['q-1'] }) && only(E.pickups, { gear: ['q-1'] }) && E['sam rivera'].gear.includes('q-1'), JSON.stringify([E.jazzmaster, E['sam rivera'].gear]));
  ok('the studio log: by the session, the songs, its notes and a take’s notes', same(E['hiss spun'].logs, ['k-1']) && only(E.buzz, { logs: ['k-1'] }) && same(E['snare mic'].logs, ['k-1']) && (await every(page, 'echo chamber')).logs.includes('k-1'), JSON.stringify([E.buzz, E['snare mic']]));
  ok('money: an invoice or a quote by its number, its status and its amount, written either way', only(E['inv-0042'], { money: ['invoice:b-w1'] }) && same(E.overdue.money, ['invoice:b-w1']) && same(E['1234'].money, ['invoice:b-w1']) && same(E['1,234'].money, ['invoice:b-w1']) && only(E['q-0007'], { money: ['quote:b-w4'] }) && same(E.draft.money, ['quote:b-w4']), JSON.stringify([E['inv-0042'], E.overdue, E['1234']]));
  ok('nothing found is nothing in every kind', Object.values(E.zzzz).every(x => x.length === 0));
  // Each kind is found by the words its section's own search reads: the function the section exports.
  const agree = await page.evaluate(() => Promise.all([import('./js/search.js'), import('./js/store.js'), import('./js/pages/people.js'), import('./js/pages/venues.js'), import('./js/pages/backline.js'), import('./js/pages/acts.js'), import('./js/pages/songs.js')])
    .then(([m, st, pp, vn, bl, ac, sg]) => m.searchReady().then(() => {
      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b), mine = (list, f, w) => list.filter(x => f(x).includes(w)).map(x => x.id).sort();
      return ['rivera', 'drums', 'leeds', 'harbourtown', 'fender', 'rehearsal', 'doom', 'sacred', 'minor', 'chisholm'].map(w => {
        const got = m.searchAll(w);
        return [w, eq([...got.people].sort(), mine(st.db.people, pp.personText, w)) && eq([...got.venues].sort(), mine(st.db.venues, vn.venueText, w)) && eq([...got.gear].sort(), mine(st.db.gear, bl.gearText, w))
          && eq([...got.bands].sort(), mine(st.db.acts, ac.actSearchText, w)) && eq([...got.songs].sort(), mine(st.db.songs, sg.songText, w))];
      });
    })));
  ok('each kind is found by the words its own section searches (one function, exported by the section)', agree.every(x => x[1]), JSON.stringify(agree.filter(x => !x[1])));

  /* ------------------------------ dates ------------------------------ */
  const W4 = await dayWords(page, DATES.w4), S1 = await dayWords(page, DATES.s1), W1 = await dayWords(page, DATES.w1);
  let dd = await every(page, W4.dm);
  ok(`a day typed (${W4.dm}) finds what is on it, of every kind with dates: the show that day, the quote issued for it`, same(dd.gigs, ['b-w4']) && same(dd.money, ['quote:b-w4']) && ['bands', 'venues', 'people', 'songs', 'setlists', 'gear'].every(k => !dd[k].length), JSON.stringify(dd));
  ok(`…written either way round (${W4.md})`, same((await every(page, W4.md)).gigs, ['b-w4']));
  dd = await every(page, S1.dm);
  ok('…a studio log by its day, with the session that day', same(dd.logs, ['k-1']) && same(dd.gigs, ['b-s1']), JSON.stringify(dd));
  dd = await every(page, W1.dm);
  ok('…an invoice by the day it was issued', dd.money.includes('invoice:b-w1') && dd.gigs.includes('b-w1'), JSON.stringify(dd));
  const ofYear = y => Object.entries({ 'b-w1': DATES.w1, 'b-w2': DATES.w2, 'b-w4': DATES.w4, sw3: DATES.old }).filter(([, iso]) => iso.startsWith(y)).map(([id]) => id).sort();
  const Y = DATES.w2.slice(0, 4);
  dd = await every(page, `church ${Y}`);
  ok(`a date and words narrow each other (“church ${Y}”): the bookings at The Church that year; a venue has no date, so The Church itself is found by its word`, same([...dd.gigs].sort(), ofYear(Y)) && same(dd.venues, ['v-church']) && same(dd.songs, ['g-2']), JSON.stringify(dd));
  const days = await page.evaluate(() => import('./js/search.js').then(m => m.searchReady().then(() => import('./js/store.js').then(st => {
    const may = m.searchAll('may'), d = st.db.bookings.filter(b => may.gigs.includes(b.id));
    return { people: may.people, months: d.map(b => b.date.slice(5, 7)), seen: may.gigs.filter(id => !st.db.bookings.some(b => b.id === id)) };
  }))));
  ok('“may” finds May Okafor in People, and on the bookings tab only what is in May', same(days.people, ['p-may']) && days.months.every(x => x === '05'), JSON.stringify(days));
  await go(page, 'bookings');
  await type(page, W4.dm); await sleep(150);
  const longW4 = await page.evaluate(iso => import('./js/util.js').then(u => 'On ' + u.fmtLong(iso)), DATES.w4);
  s = await page.evaluate(() => ({ when: (document.querySelector('.srch-when') || { textContent: '' }).textContent, tabs: [...document.querySelectorAll('.srch-tab')].map(t => t.dataset.tab) }));
  ok('the results say how the date was read (“On …”), above All', s.when === longW4 && same(s.tabs, ['all', 'gigs', 'money']), JSON.stringify(s));
  if (process.env.S) await page.screenshot({ path: `${process.env.S}/46-search-date.png` });
  await type(page, W4.month);
  s = await page.evaluate(() => (document.querySelector('.srch-when') || { textContent: '' }).textContent);
  const monthWhen = await page.evaluate(iso => { const [y, m] = iso.split('-').map(Number); return 'In ' + new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }, DATES.w4);
  ok(`a month alone (${W4.month}) is the whole of it`, s === monthWhen, s);
  await type(page, '');
  await closeSearch(page);

  /* ------------------------------ the bookings tab: what comes up ------------------------------ */
  await type(page, 'chelsea');
  ok('results come as the person types, on All first', (await page.getAttribute('#srch-tab-all', 'aria-selected')) === 'true' && (await foundLine(page)) === '19 results', await foundLine(page));
  await pickTab(page, 'gigs');
  ok('the bookings tab: a line says what was found', (await foundLine(page)) === '9 shows at 4 places', await foundLine(page));
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
  await reopen(page);
  ok('opening it again in the same visit brings back what was typed, its tab and its results', (await page.inputValue('#srch-q')) === 'chelsea' && (await page.getAttribute('#srch-tab-gigs', 'aria-selected')) === 'true' && same(await rows(page), r) && (await foundLine(page)) === '9 shows at 4 places');
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
  ok('an emptied box is the box and the line of help again', same(await page.$$eval('.srch-out > *', els => els.map(e => e.className)), ['srch-help muted small']) && !(await page.$('.srch-tab')));
  await type(page, 'echo chamber');
  ok('a new search keeps the tab and starts on Shows; with no show found it lists the first kind that was, and says so', (await page.getAttribute('#srch-tab-gigs', 'aria-selected')) === 'true' && (await foundLine(page)) === 'No shows found. 1 session at Echo Chamber Studios' && same(await chips(page, '.srch-kinds'), [['Sessions', 1, 'true'], ['Rehearsals', 1, 'false']]) && same(await rows(page), ['b-s1']), JSON.stringify([await foundLine(page), await chips(page, '.srch-kinds')]));
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
  s = await page.evaluate(() => ({ kids: [...document.querySelector('.srch-out').children].map(c => c.className), text: document.querySelector('.srch-out').textContent, tabs: document.querySelectorAll('.srch-tab').length }));
  ok('nothing found: a plain sentence says so, and there are no tabs', same(s.kids, ['srch-none']) && s.text === 'Nothing found for “zzzz”. Try fewer words, or part of a name.' && s.tabs === 0, JSON.stringify(s));
  if (process.env.S) await page.screenshot({ path: `${process.env.S}/46-search-none.png` });
  await sleep(700);
  ok('…and “No results” is announced', (await said(page)) === 'No results', await said(page));

  // Today: a booking dated today is still ahead all day, a time seen dated today is over; one that began two days ago and ends in two is on now.
  await store(page, (st, iso) => st.update(d => { d.bookings.find(x => x.id === 'b-td').date = iso; d.acts.find(x => x.id === 'a-now2').seen[0].date = iso; }), day(0));
  await type(page, 'todays');
  await sleep(100);
  r = await rows(page);
  const nowSub = await page.$eval('.srch-list .bk-card[data-id="b-fs"] .bk-card-sub', e => e.textContent);
  ok('today’s booking is above the line, a time seen today below it; a festival that began two days ago and is still on is above it and says “On now”', same(r, ['b-td', 'b-fs', 'TODAY', 'st1']) && /^On now/.test(nowSub), JSON.stringify([r, nowSub]));

  /* ------------------------------ All and the tabs ------------------------------ */
  await type(page, 'chelsea');
  await pickTab(page, 'all');
  let T = await tabsOf(page);
  ok('tabs: All, then each kind with what it found, in the order Bookings, Acts, Venues, People, Songs, Setlists, Gear, Studio log, Money; a kind with nothing is left out', same(T, [['all', 19, 'true'], ['gigs', 12, 'false'], ['bands', 1, 'false'], ['people', 1, 'false'], ['songs', 1, 'false'], ['setlists', 1, 'false'], ['logs', 1, 'false'], ['money', 2, 'false']]), JSON.stringify(T));
  s = await page.evaluate(() => { const list = document.querySelector('.srch-tabs'), tabs = [...list.querySelectorAll('[role=tab]')], panel = document.getElementById('srch-panel'), on = list.querySelector('[aria-selected="true"]');
    return { role: list.getAttribute('role'), label: list.getAttribute('aria-label'), names: tabs.map(t => t.textContent), spoken: tabs.map(t => t.getAttribute('aria-label')), controls: tabs.every(t => t.getAttribute('aria-controls') === 'srch-panel'), roving: tabs.map(t => t.tabIndex).join(''), panel: panel.getAttribute('role'), by: panel.getAttribute('aria-labelledby'), on: on.id, sticky: getComputedStyle(document.querySelector('.srch-top')).position, inTop: !!list.closest('.srch-top') }; });
  ok('the tabs are a tablist a screen reader knows: each tab names its kind and count, the one on show is selected, and only it takes Tab', s.role === 'tablist' && s.label === 'What was found' && same(s.names, ['All19', 'Bookings12', 'Acts1', 'People1', 'Songs1', 'Setlists1', 'Studio log1', 'Money2']) && same(s.spoken, ['All, 19', 'Bookings, 12', 'Acts, 1', 'People, 1', 'Songs, 1', 'Setlists, 1', 'Studio log, 1', 'Money, 2']) && s.controls && s.roving === '0-1-1-1-1-1-1-1' && s.panel === 'tabpanel' && s.by === 'srch-tab-all', JSON.stringify(s));
  ok('…and they stay at the top with the box while the list scrolls', s.sticky === 'sticky' && s.inTop, JSON.stringify(s));
  const best = await page.$$eval('.srch-all .srch-rec', els => els.map(e => [e.dataset.rec, e.dataset.seen || e.dataset.id, (e.querySelector('.srch-kind') || { textContent: '' }).textContent.trim()]));
  ok('All is one list, best match first, at most a screenful: the band whose name starts with the word, then its bookings still to come (soonest first), then those that are over (newest first); each row says its kind',
    same(best, [['bands', 'a-wolfe', 'Act'], ['gigs', 'b-r1', 'Rehearsal'], ['gigs', 'b-w3', 'Show'], ['gigs', 'b-w4', 'Show'], ['gigs', 'b-s1', 'Session'], ['gigs', 'b-w1', 'Show'], ['gigs', 'b-w5', 'Show'], ['gigs', 'b-w6', 'Show']]), JSON.stringify(best));
  const seeAll = await page.$$eval('.srch-seeall button', els => els.map(e => e.textContent));
  ok('…then “See all in …” for each kind that holds more than All shows', same(seeAll, ['See all in Bookings (12)', 'See all in People (1)', 'See all in Songs (1)', 'See all in Setlists (1)', 'See all in Studio log (1)', 'See all in Money (2)']), JSON.stringify(seeAll));
  ok('…and no money on All: the invoice’s row has its status, not its amount', !/[$£€]|1,?234|555/.test(await page.$eval('.srch-out', e => e.textContent)));
  await page.click('.srch-seeall [data-see="gigs"]'); await sleep(200);
  ok('“See all in Bookings” shows that tab, with the focus on its first card', (await page.getAttribute('#srch-tab-gigs', 'aria-selected')) === 'true' && (await focused(page)) === 'b-w4', await focused(page));
  await type(page, 'wolf'); await pickTab(page, 'all');
  const wolf = await page.$$eval('.srch-all .srch-rec', els => els.slice(0, 2).map(e => e.dataset.id));
  ok('a name that starts with what was typed comes before one that only has a word starting with it (Wolfgang Press before Chelsea Wolfe)', same(wolf, ['p-wolf', 'a-wolfe']), JSON.stringify(wolf));
  await type(page, 'chelsea');
  await page.focus('#srch-tab-all');
  const walkTabs = [];
  for (const key of ['ArrowRight', 'ArrowRight', 'End', 'ArrowRight', 'Home', 'ArrowLeft']) { await page.keyboard.press(key); await sleep(120); walkTabs.push(await page.evaluate(() => { const a = document.activeElement; return a.dataset.tab + (a.getAttribute('aria-selected') === 'true' ? '' : '?'); })); }
  ok('← → walk the tabs and show each one, Home and End go to the ends, and the row goes round', same(walkTabs, ['gigs', 'bands', 'money', 'all', 'all', 'money']), walkTabs.join(' '));
  await sleep(700);
  ok('…the count of the tab on show is announced', (await said(page)) === '2 results', await said(page));
  const money = await page.evaluate(() => [...document.querySelectorAll('.srch-list .srch-rec')].map(e => ({ id: e.dataset.id, name: e.querySelector('.srch-name').textContent, amt: (e.querySelector('.srch-amt') || { textContent: '' }).textContent, pill: (e.querySelector('.pill') || { textContent: '' }).textContent })));
  const fee = await page.evaluate(() => import('./js/model.js').then(m => [m.fmtMoney(1234), m.fmtMoney(555)]));
  ok('the Money tab: each invoice and quote with its number, its amount and its status as the booking’s box says it', same(money, [{ id: 'invoice:b-w1', name: 'Invoice INV-0042', amt: fee[0], pill: 'Overdue' }, { id: 'quote:b-w4', name: 'Quote Q-0007', amt: fee[1], pill: 'Draft' }]) && (await foundLine(page)) === '1 invoice and 1 quote', JSON.stringify(money));
  for (const [k, line] of [['bands', '1 act'], ['people', '1 person'], ['songs', '1 song'], ['setlists', '1 setlist'], ['logs', '1 take log']]) {
    await pickTab(page, k);
    const x = await page.evaluate(() => ({ line: document.querySelector('.srch-found').textContent, rows: [...document.querySelectorAll('.srch-list .srch-rec')].map(e => e.textContent), word: !!document.querySelector('.srch-list .srch-kind') }));
    ok(`the ${k} tab: “${line}”, its rows, no word for the kind (the tab says it) and no money`, x.line === line && x.rows.length === 1 && !x.word && !/[$£€]|1,?234|555/.test(x.rows.join(' ')), JSON.stringify(x));
  }

  /* ------------------------------ the keyboard, focus, what is said ------------------------------ */
  await pickTab(page, 'gigs');
  await sleep(700);
  ok('the count of results is announced when it changes (“9 results”)', (await said(page)) === '9 results', await said(page));
  await page.focus('#srch-q');
  const walk = [];
  for (let i = 0; i < 13; i++) { await page.keyboard.press('Tab'); walk.push(await page.evaluate(() => { const a = document.activeElement; return a.closest('.srch-tabs') ? 'tab:' + a.dataset.tab : a.closest('.srch-kinds') ? 'kind' : a.closest('.srch-places') ? 'place' : a.closest('.srch-list') ? 'card' : a.id || a.getAttribute('aria-label') || a.tagName; })); }
  ok('Tab goes from the box to the tab on show, then through the kind row and the place chips to the cards', same(walk, ['tab:gigs', 'kind', 'kind', 'kind', 'kind', 'place', 'place', 'place', 'place', 'place', 'card', 'card', 'card']), walk.join(' '));
  const ring = await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a), body = a.closest('.sheet-body').getBoundingClientRect(), top = document.querySelector('.srch-top').getBoundingClientRect(), r = a.getBoundingClientRect(); return { outline: cs.outlineStyle, width: parseFloat(cs.outlineWidth), clear: r.top >= top.bottom - 0.5 && r.bottom <= body.bottom + 0.5 }; });
  ok('a card reached with Tab shows the focus ring and is clear of the box and tabs that stay at the top', ring.outline === 'solid' && ring.width >= 3 && ring.clear, JSON.stringify(ring));
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
  // From the box at the top of the page, ↓ opens the results and goes to the first of them.
  await closeSearch(page);
  await page.keyboard.press('ArrowDown'); await page.waitForSelector('#srch-q'); await sleep(150);
  ok('↓ in the box at the top of the page opens the results with the focus on the first', (await focused(page)) === 'b-w4');
  await page.focus('#srch-q');

  // The sheet's own help, and the welcome tour's stop for the box.
  await page.click(`${SHEET} .sheet-help`); await page.waitForSelector('.tour-card'); await sleep(400);
  const tourTitle = await page.$eval('#tour-title', e => e.textContent), tourText = await page.$eval('.tour-card p', e => e.textContent);
  ok('the ? in the search runs its own walkthrough, which says what the box finds, dates included', tourTitle === 'Search' && /^Find bookings, acts, venues, people, songs, setlists, gear, take logs and invoices by any word in them, or by a date: “20 nov”/.test(tourText) && /\/ jumps here from any page/.test(tourText), tourTitle + ': ' + tourText);
  const steps = [tourTitle];
  for (let i = 0; i < 8 && (await page.$('.tour-card')); i++) { await page.click('.tour-actions .btn.primary'); await sleep(450); if (await page.$('.tour-card')) steps.push(await page.$eval('#tour-title', e => e.textContent)); }
  ok('…through the tabs, what was found, the kinds, the places and the results, and leaves the search open', same(steps, ['Search', 'Tabs', 'What was found', 'Kinds', 'Places', 'The results']) && !!(await page.$(SHEET)), steps.join(' › '));
  const welcome = await page.evaluate(() => import('./js/tour.js').then(m => { const st = m.welcomeSteps(), i = st.findIndex(s => s.title === 'Search'); return { i, deck: st.findIndex(s => s.title === 'Your sections are tracks'), target: st[i] && st[i].target, text: st[i] && st[i].text }; }));
  ok('the welcome tour stops at the box, just after the section menu, and says what it finds, dates included', welcome.i === welcome.deck + 1 && same(welcome.target, ['#srch-bar']) && /finds bookings, acts, venues, people, songs, setlists, gear, take logs and invoices by any word or by a date/.test(welcome.text) && /“20 nov”, “friday”, “nov”, “2025” or “this week”/.test(welcome.text), JSON.stringify(welcome));

  /* ------------------------------ a tap opens it where it lives ------------------------------ */
  await chip(page, '.srch-places', 'The Church').click(); await sleep(150);
  await closeSearch(page);
  await go(page, 'venues');
  await reopen(page);
  ok('the place picked comes back with the search too', (await page.inputValue('#srch-q')) === 'chelsea' && (await foundLine(page)) === '4 shows at The Church' && (await chips(page, '.srch-places'))[1][2] === 'true');
  await page.click('.srch-list .bk-card[data-id="b-w1"]'); await sleep(600);
  s = await page.evaluate(() => { const head = document.querySelector('.bk-page [data-view-head]'); return { sheet: !!document.querySelector('.sheet'), page: window.logiPage(), booking: !!document.querySelector('.bk-page'), title: (head || { textContent: '' }).textContent, focusHead: document.activeElement === head, inert: document.getElementById('app').inert, box: document.getElementById('srch-box').value }; });
  ok('a tap on a booking’s card closes the search and opens that booking’s own page, the box keeping the words', !s.sheet && s.page === 'bookings' && s.booking && /Chelsea Wolfe @ The Church/.test(s.title) && !s.inert && s.box === 'chelsea', JSON.stringify(s));
  ok('…with the focus on the booking’s page, not in the box', s.focusHead, JSON.stringify(s));
  await reopen(page);
  ok('going back is one tap: the search opens with what was typed, its tab, its place and its results', (await page.inputValue('#srch-q')) === 'chelsea' && same(await rows(page), ['b-w4', 'TODAY', 'b-w1', 'b-w2', 'sw3']));
  await page.focus('.srch-list .card[data-seen="sw3"]');
  await page.keyboard.press('Enter'); await sleep(700);
  s = await page.evaluate(() => { const card = document.querySelector('.ac-card[data-id="a-wolfe"]'), hit = document.querySelector('.ac-seen.srch-hit'), a = document.activeElement, r = hit ? hit.getBoundingClientRect() : null;
    return { sheet: !!document.querySelector('.sheet'), page: window.logiPage(), open: !!card && card.classList.contains('open'), hit: hit ? hit.textContent : '', focus: !!a && !!hit && hit.contains(a) && a.tagName === 'BUTTON', label: a ? a.getAttribute('aria-label') : '', inView: !!r && r.top >= 0 && r.bottom <= innerHeight, rows: card ? card.querySelectorAll('.ac-seen').length : 0 }; });
  ok('a time seen opens in the band’s log: the acts page, her card dropped open, that entry in view and marked', !s.sheet && s.page === 'acts' && s.open && s.rows === 3 && /The Church/.test(s.hit) && /77/.test(s.hit) && s.inView, JSON.stringify(s));
  ok('…with the focus on that entry’s Edit button', s.focus && /^Edit the time you saw them on /.test(s.label), JSON.stringify(s));
  // Every other kind opens where it lives, as its section's own list opens it.
  const opened = {};
  const openFirst = async (q, k) => {
    await go(page, 'tools'); // from a page that is none of theirs
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('/'); await page.keyboard.type(q, { delay: 5 }); await page.waitForSelector('#srch-q'); await sleep(200);
    await pickTab(page, k);
    await page.click('.srch-list .card'); await sleep(800);
    return page.evaluate(() => { const top = [...document.querySelectorAll('.sheet')].pop(), a = document.activeElement;
      return { page: window.logiPage(), sheet: top ? top.getAttribute('aria-label') : '', focus: a ? (a.id || a.className || a.tagName) : '', inSheet: !!top && top.contains(a), search: !!document.querySelector('.srch-sheet') }; });
  };
  opened.bands = await openFirst('sacred bones', 'bands');
  const actCard = await page.evaluate(() => ({ open: document.querySelector('.ac-card[data-id="a-wolfe"]').classList.contains('open'), focus: document.activeElement.id }));
  ok('an act opens on its card in the acts list, dropped open, with the focus on it', opened.bands.page === 'acts' && !opened.bands.search && actCard.open && actCard.focus === 'ac-head-a-wolfe', JSON.stringify([opened.bands, actCard]));
  opened.venues = await openFirst('neve', 'venues');
  ok('a venue opens its sheet over the venues list', opened.venues.page === 'venues' && opened.venues.sheet === 'Echo Chamber Studios' && !opened.venues.search, JSON.stringify(opened.venues));
  await page.keyboard.press('Escape'); await sleep(250);
  ok('…and closing it puts the focus on the venue’s card in the list, as the list’s own tap does', (await focused(page)) === '#vn-v-echo', await focused(page));
  opened.people = await openFirst('rivera beats', 'people');
  ok('a person opens their sheet over People', opened.people.page === 'people' && opened.people.sheet === 'Sam Rivera', JSON.stringify(opened.people));
  await page.keyboard.press('Escape'); await sleep(250);
  ok('…and closing it puts the focus on their card', (await focused(page)) === '#pp-open-p-sam', await focused(page));
  opened.songs = await openFirst('chisholm', 'songs');
  ok('a song opens its sheet over Songs', opened.songs.page === 'songs' && opened.songs.sheet === 'Song' && (await page.evaluate(() => /Hiss Spun/.test([...document.querySelectorAll('.sheet')].pop().textContent))), JSON.stringify(opened.songs));
  await page.keyboard.press('Escape'); await sleep(250);
  opened.setlists = await openFirst('drone jam', 'setlists');
  ok('a setlist opens its editor over the Setlists view', opened.setlists.page === 'songs' && opened.setlists.sheet === 'Edit setlist' && !!(await page.$('#sg-view-setlists.on')), JSON.stringify(opened.setlists));
  await page.keyboard.press('Escape'); await sleep(250);
  opened.gear = await openFirst('pickups', 'gear');
  ok('a piece of gear opens its sheet over Backline', opened.gear.page === 'backline' && opened.gear.sheet === 'Jazzmaster', JSON.stringify(opened.gear));
  await page.keyboard.press('Escape'); await sleep(250);
  ok('…and closing it puts the focus on its card', (await focused(page)) === '#bl-item-q-1', await focused(page));
  opened.logs = await openFirst('buzz', 'logs');
  ok('a take log opens in the Studio log, with the focus on + Take', opened.logs.page === 'sessions' && !opened.logs.sheet && opened.logs.focus === 'sd-take' && /Hiss Spun takes/.test(await page.textContent('#page')), JSON.stringify(opened.logs));
  opened.money = await openFirst('inv-0042', 'money');
  const box2 = await page.evaluate(() => { const el = document.getElementById('blk-money'), r = el ? el.getBoundingClientRect() : null; return { open: !!el && el.open, focus: !!el && el.querySelector('summary') === document.activeElement, inView: !!r && r.top < innerHeight && r.bottom > 0, booking: (document.querySelector('.bk-page [data-view-head]') || { textContent: '' }).textContent }; });
  ok('an invoice opens on its booking’s page, its Quote & invoice box open, in view, with the focus on it', opened.money.page === 'bookings' && box2.open && box2.focus && box2.inView && /Chelsea Wolfe @ The Church/.test(box2.booking), JSON.stringify([opened.money, box2]));
  await reopen(page);
  ok('…and the search comes back on the tab it was on', (await page.getAttribute('#srch-tab-money', 'aria-selected')) === 'true' && (await page.inputValue('#srch-q')) === 'inv-0042');
  await closeSearch(page);

  // Nothing about a search is kept on the device: everything in its storage is the same after one as before it.
  await go(page, 'bookings');
  const kept = () => page.evaluate(() => JSON.stringify([Object.entries(localStorage).sort().filter(([k]) => k !== 'tourbook-studio-log'), Object.entries(sessionStorage).sort()]));
  const keptBefore = await kept();
  await reopen(page);
  await type(page, 'wolfe church zzqq');
  await type(page, 'chelsea'); await gigs(page);
  await page.click('#srch-place-all'); await chip(page, '.srch-places', 'The Crown').click(); await sleep(100);
  await closeSearch(page);
  await reopen(page);
  const cameBack = (await page.inputValue('#srch-q')) === 'chelsea' && (await foundLine(page)) === '3 shows at The Crown';
  ok('nothing about a search is stored on the device: its storage is the same after searching as before, though the search came back', cameBack && (await kept()) === keptBefore && !/zzqq/.test(keptBefore) && same(await page.evaluate(() => Object.keys(localStorage).sort().filter(k => k !== 'tourbook-studio-log')), keysBefore), JSON.stringify(await page.evaluate(() => Object.keys(localStorage).sort())));
  await page.click('#srch-place-all'); await sleep(100);
  await page.focus('.srch-list .bk-card[data-id="b-w3"]');
  await store(page, st => st.patch('bookings', 'b-w4', { status: 'confirmed' }));
  await sleep(250);
  ok('a change to the data while the search is open shows on its cards, and the focus stays on the card it was on', (await page.$eval('.srch-list .bk-card[data-id="b-w4"] .pill', e => e.textContent)) === 'Confirmed' && (await page.inputValue('#srch-q')) === 'chelsea' && (await focused(page)) === 'b-w3', await focused(page));
  await closeSearch(page);

  /* ------------------------------ every role, in its own words; money ------------------------------ */
  const WORDS = {
    producer: ['Search bookings, artists, venues…', 'Search bookings, artists, venues and more', 'Find bookings, artists, venues, people, songs, setlists, gear, take logs and invoices by any word', '9 shows at 4 places', 'Shows', 'Bookings', 'Artists', true],
    manager: ['Search bookings, acts, venues…', 'Search bookings, acts, venues and more', 'Find bookings, acts, venues, people, songs, setlists, gear, take logs and invoices by any word', '9 shows at 4 places', 'Shows', 'Bookings', 'Acts', true],
    band: ['Search bookings, bands, venues…', 'Search bookings, bands, venues and more', 'Find bookings, bands, venues, people, songs, setlists, gear, take logs and invoices by any word', '9 shows at 4 places', 'Shows', 'Bookings', 'Bands', true],
    solo: ['Search bookings, acts, venues…', 'Search bookings, acts, venues and more', 'Find bookings, acts, venues, people, songs, setlists, gear, take logs and invoices by any word', '9 shows at 4 places', 'Shows', 'Bookings', 'Acts', true],
    scout: ['Search shows, acts, venues…', 'Search shows, acts, venues and more', 'Find shows, acts, venues, people, songs, setlists, gear and take logs by any word', '9 shows at 4 places', 'Shows', 'Shows', 'Acts', false],
    // The audiophile's calendar, and so its tab, is called Gigs; a kind is called what the calendar calls it (Shows).
    audiophile: ['Search gigs, bands, venues…', 'Search gigs, bands, venues and more', 'Find gigs, bands, venues, people, songs, setlists, gear and take logs by any word', '9 shows at 4 places', 'Shows', 'Gigs', 'Bands', false],
  };
  for (const [id, [ph, label, help, line, kindWord, gigsTab, actsTab, withMoney]] of Object.entries(WORDS)) {
    await setRole(page, id);
    const top = await page.evaluate(() => ({ ph: document.getElementById('srch-box').placeholder, label: document.querySelector('label[for="srch-box"]').textContent, help: document.getElementById('srch-box-help').textContent }));
    await type(page, 'chelsea');
    const names = await page.$$eval('.srch-tab', els => els.map(e => e.dataset.tab + ':' + e.querySelector('.srch-tab-name').textContent));
    await pickTab(page, 'gigs');
    const got = { ...top, names, line: await foundLine(page), kind: (await chips(page, '.srch-kinds'))[0], rows: await rows(page) };
    ok(`${id}: the box and the results speak in the role’s words (${ph}; ${gigsTab}, ${actsTab}; ${line})`, got.ph === ph && got.label === label && got.help.startsWith(help) && got.line === line && same(got.kind, [kindWord, 9, 'true']) && got.rows.length === 10
      && got.names.includes('gigs:' + gigsTab) && got.names.includes('bands:' + actsTab) && got.names.includes('money:Money') === withMoney, JSON.stringify(got).slice(0, 500));
    if (!withMoney) {
      const text = [];
      for (const k of ['all', 'gigs', 'bands', 'people', 'songs', 'setlists', 'logs']) { await pickTab(page, k); text.push(await page.$eval('.srch-out', e => e.textContent)); }
      await type(page, 'inv-0042'); const inv = await page.$$('.srch-tab');
      ok(`${id}: no Money tab and no money on any tab (the show has a fee and an invoice, a settlement and costs; the session a rate; the quote an amount)`, !/[$£€]|1,?234|987|555|\b45\b|INV-0042|Q-0007/.test(text.join(' ')) && /Paid \/ settled/.test(text.join(' ')) && inv.length === 0, text.join(' ').slice(0, 200));
    }
    if (id === 'audiophile') {
      // A kind is called the same everywhere: the calendar's own kind row (under the results), + New and "Did you see
      // them?" say Shows and Show in every role, so the search's kind row, its lines and its walkthrough do too; only
      // the tab, which holds the whole of the calendar, is named after it (Gigs).
      const cal = await page.$$eval('.bk-filters [aria-label="Kind of booking"] .chip', els => els.map(e => e.textContent.replace(/^[^A-Za-z]+/, '')).filter(t => t !== 'All kinds'));
      const one = await page.evaluate(() => import('./js/model.js').then(m => m.kindLabel('show')));
      await type(page, 'chelsea'); await pickTab(page, 'gigs');
      const row = (await chips(page, '.srch-kinds')).map(c => c[0]), tabWord = await page.textContent('#srch-tab-gigs .srch-tab-name');
      ok('audiophile: the kind row calls each kind what the calendar’s kind row calls it (Shows), and the tab is still Gigs', row.length > 1 && row[0] === 'Shows' && row.every(w => cal.includes(w)) && tabWord === 'Gigs', `${row.join(', ')} | calendar: ${cal.join(', ')} | tab: ${tabWord}`);
      const sr = await page.$eval('.srch-kinds .chip[data-kind="show"]', e => e.getAttribute('aria-pressed') + '|' + e.querySelector('.srch-n').textContent);
      await pickTab(page, 'all');
      const words = await page.$$eval('.srch-all .srch-rec[data-rec="gigs"] .srch-kind', els => [...new Set(els.map(e => e.textContent.trim()))]);
      ok('audiophile: on All a show’s row says Show, as + New and the show’s own page do', words.includes(one) && one === 'Show' && !words.some(w => /gig/i.test(w)) && sr === 'true|9', `${words.join(', ')} (calendar: ${one}; chip ${sr})`);
      await pickTab(page, 'gigs');
      await chip(page, '.srch-kinds', 'Sessions').click(); await sleep(150);
      await typeOn(page, ' church'); // chelsea church
      ok('audiophile: “No sessions found. 4 shows at The Church”', (await foundLine(page)) === 'No sessions found. 4 shows at The Church', await foundLine(page));
      await type(page, ''); await type(page, 'echo chamber');
      ok('audiophile: in a new search with no show found the line says “No shows found.”', (await foundLine(page)) === 'No shows found. 1 session at Echo Chamber Studios', await foundLine(page));
      await type(page, 'chelsea'); await pickTab(page, 'gigs');
      await page.click(`${SHEET} .sheet-help`); await page.waitForSelector('.tour-card'); await sleep(350);
      const told = {};
      for (let i = 0; i < 8 && (await page.$('.tour-card')); i++) { told[await page.$eval('#tour-title', e => e.textContent)] = await page.$eval('.tour-card p', e => e.textContent); await page.click('.tour-actions .btn.primary'); await sleep(450); }
      ok('audiophile: the walkthrough speaks of shows on the gigs tab', told.Kinds === 'Shows, sessions and rehearsals each have a list of their own. It starts on shows.'
        && /On the gigs tab, the newest come first and a line marks today\. A card marked From the log is a time you logged seeing a band, with no show on the calendar\./.test(told['The results'] || ''), JSON.stringify([told.Kinds, told['The results']]));
    }
    if (id === 'producer') {
      await page.click(`${SHEET} .sheet-help`); await page.waitForSelector('.tour-card'); await sleep(350);
      ok('producer: the walkthrough says “artists” too', /^Find bookings, artists, venues/.test(await page.$eval('.tour-card p', e => e.textContent)));
      await page.keyboard.press('Escape'); await sleep(200);
    }
    await closeSearch(page);
  }
  await setRole(page, '');
  await type(page, 'chelsea'); await pickTab(page, 'gigs');
  ok('Everything: no money on the bookings tab either, and the words are the plain ones', !/[$£€]|1,?234|987/.test(await page.$eval('.srch-out', e => e.textContent)) && (await foundLine(page)) === '9 shows at 4 places');
  await closeSearch(page);
  const sw = await page.evaluate(() => fetch('sw.js').then(x => x.text()));
  ok('the search’s three files are in the offline list', sw.includes("'js/search.js'") && sw.includes("'js/search-dates.js'") && sw.includes("'css/search.css'"));

  /* ------------------------------ 2,000 bookings, 200 bands, 500 people, 500 songs, 300 pieces of gear ------------------------------ */
  await store(page, st => st.update(d => {
    const iso = n => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    for (let v = 0; v < 60; v++) d.venues.push({ id: 'pv' + v, kind: 'venue', name: `Bulk Hall ${v}`, address: `${v} Main Street, Town ${v % 12}` });
    for (let p = 0; p < 500; p++) d.people.push({ id: 'pp' + p, name: `Bulk Person ${p}`, group: ['band', 'session', 'crew', 'contact'][p % 4], role: 'Guitar', company: `Company ${p % 40}`, email: `p${p}@bulk.example`, notes: p % 7 ? '' : 'Bulk notes here.' });
    for (let a = 0; a < 200; a++) d.acts.push({ id: 'pa' + a, name: `Bulk Band ${a}`, genre: a % 2 ? 'Shoegaze' : 'Krautrock', members: [`pp${a}`, `pp${a + 200}`], seen: Array.from({ length: 5 }, (_, i) => ({ id: `ps${a}-${i}`, date: iso(-5 - ((a * 7 + i * 31) % 1500)), where: `Club ${i}, Town ${a % 12}`, rating: 50 + ((a + i) % 50), notes: i % 3 ? '' : 'Muddy sound at the back.' })) });
    for (let s = 0; s < 500; s++) d.songs.push({ id: 'pg' + s, title: `Bulk Song ${s}`, actId: 'pa' + (s % 200), key: 'E minor', status: 'demo', splits: [{ id: 'x', name: `Bulk Writer ${s % 30}`, share: 100 }] });
    for (let g = 0; g < 300; g++) d.gear.push({ id: 'pq' + g, name: `Bulk Amp ${g}`, category: 'Amps', make: 'Vox', model: 'AC30', serial: `S${g}`, qty: 1, owner: g % 3 ? '' : 'pp' + g, location: `Van ${g % 5}` });
    for (let b = 0; b < 2000; b++) d.bookings.push({ id: 'pb' + b, kind: b % 10 === 9 ? 'session' : 'show', status: 'confirmed', actId: 'pa' + (b % 200), date: iso(((b * 3) % 2200) - 1500), venueId: 'pv' + (b % 60), setTime: `${19 + (b % 4)}:00`, setLength: 45, start: '10:00', notes: b % 5 ? '' : 'Ask for Sam at the door.' });
  }));
  await sleep(400);
  const stats = () => page.evaluate(() => import('./js/search.js').then(m => m.searchStats()));
  const before = await stats(); // the search opens with the last one in it, so the words are built as it opens
  await reopen(page);
  await type(page, '');
  const keyMs = [];
  for (const q of ['b', 'bu', 'bul', 'bulk', 'bulk ', 'bulk b', 'bulk ba', 'bulk ban', 'bulk band', 'bulk band 7']) keyMs.push(await page.evaluate(q => { const i = document.getElementById('srch-q'), t0 = performance.now(); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); return performance.now() - t0; }, q));
  const after = await stats();
  ok('with 2,000 bookings, 200 bands, 500 people, 500 songs and 300 pieces of gear the words to search are built once, as the search opens, for all ten key presses', after.builds === before.builds + 1 && after.records >= 4500, JSON.stringify({ before: before.builds, after: after.builds, records: after.records }));
  ok('…and it stays quick: the words in well under a second, a search in a few milliseconds, a key press (search and draw) in a fraction of a second', after.buildMs < 1000 && after.findMs < 100 && Math.max(...keyMs.slice(1)) < 600, `words ${after.buildMs.toFixed(0)} ms, search ${after.findMs.toFixed(1)} ms, key presses ${keyMs.map(x => x.toFixed(0)).join(' ')} ms`);
  await gigs(page);
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
  await reopen(page);
  const cameBackTo = await page.evaluate(id => { const body = document.querySelector('.srch-sheet .sheet-body'), b = body.getBoundingClientRect(), r = document.querySelector(`.srch-list .card[data-id="${id}"]`).getBoundingClientRect(); return { top: body.scrollTop, cards: document.querySelectorAll('.srch-list .card').length, inView: r.top >= b.top && r.bottom <= b.bottom }; }, far.id);
  ok('after a tap on a card far down, the search comes back with the same cards, scrolled to where it was', !!far.id && /Bulk Band/.test(wentTo) && cameBackTo.cards === 60 && Math.abs(cameBackTo.top - far.top) < 2 && cameBackTo.inView, JSON.stringify({ far, wentTo, cameBackTo }));
  await store(page, st => st.patch('acts', 'pa7', { name: 'Renamed Seven' }));
  await type(page, 'renamed seven');
  const again = await stats();
  ok('a change to the data builds the words again, once', again.builds === after.builds + 1 && /^\d+ shows at \d+ places$/.test(await foundLine(page)), JSON.stringify({ builds: again.builds, line: await foundLine(page) }));
  ok('past 24 places the chips stop and a line says how many more there are', (await page.$$('.srch-places .chip')).length <= 25 && (await type(page, 'bulk'), (await page.$$('.srch-places .chip')).length === 25) && /^and \d+ more places: type one to find it$/.test(await page.$eval('.srch-more-places', e => e.textContent)));
  await pickTab(page, 'all');
  const allMs = await page.evaluate(() => { const i = document.getElementById('srch-q'), t0 = performance.now(); i.value = 'bulk '; i.dispatchEvent(new Event('input', { bubbles: true })); return performance.now() - t0; });
  ok('…and All, which ranks every kind, is as quick', allMs < 600 && (await page.$$('.srch-all .srch-rec')).length === 8, `${allMs.toFixed(0)} ms`);
  await closeSearch(page);

  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ------------------------------ with the rest of Tourbook: the question, the calendar's views, a show's page, the menus ------------------------------ */
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
    const at = await page.evaluate(() => { const r = document.getElementById('srch-box').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(at.x, at.y); await page.keyboard.type('x'); await sleep(250);
    let s = await page.evaluate(Q => ({ q: !!document.querySelector(Q), search: !!document.getElementById('srch-q'), box: document.getElementById('srch-box').value, sheets: document.querySelectorAll('.sheet').length, inert: document.getElementById('app').inert }), Q);
    ok('“Did you see them?” wins: while it is up, “/” does nothing (the question keeps the focus) and the box cannot be reached (it is behind it)', qUp && keptFocus && s.q && !s.search && s.box === '' && s.sheets === 1 && s.inert, JSON.stringify({ qUp, keptFocus, ...s }));
    await page.click('#ac-ask-close'); await sleep(300);
    await type(page, 'chelsea');
    ok('…and once it is closed the search opens as usual', !!(await page.$(SHEET)) && !(await page.$(Q)));
    await gigs(page);
    await closeSearch(page);

    // Over each of the calendar's five views, and over a show's page: the search opens over it, and the view is the same after.
    const under = () => page.evaluate(() => { const v = document.querySelector('.bk-calview'); return { page: window.logiPage(), mode: v ? (v.className.match(/bk-mode-(\w+)/) || [])[1] : '', show: !!document.querySelector('.bk-page'), title: (document.querySelector('.cal-title') || document.querySelector('.bk-page [data-view-head]') || { textContent: '' }).textContent }; });
    const overViews = [];
    for (const v of ['month', 'two', 'week', 'three', 'day']) {
      await page.click('#bk-view-' + v); await sleep(250);
      const was = await under();
      await reopen(page);
      const up = { sheet: !!(await page.$(SHEET)), cards: (await page.$$('.srch-list .card')).length };
      await closeSearch(page);
      const now = await under();
      overViews.push({ v, ok: was.mode === v && up.sheet && up.cards > 0 && same(now, was) && (await focused(page)) === '#srch-box', was, now, up });
    }
    ok('the search opens over each of the calendar’s five views and leaves it as it was', overViews.every(x => x.ok), JSON.stringify(overViews.filter(x => !x.ok)));
    await page.click('#bk-view-month'); await sleep(200);
    await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('b-w1'))); await page.waitForSelector('.bk-page'); await sleep(300);
    const showWas = await under();
    await reopen(page); await type(page, 'church');
    const overShow = { sheet: !!(await page.$(SHEET)), cards: (await page.$$('.srch-list .card')).length };
    await closeSearch(page);
    ok('…and over a show’s own page', showWas.show && overShow.sheet && overShow.cards > 0 && same(await under(), showWas) && (await focused(page)) === '#srch-box', JSON.stringify([showWas, overShow, await under()]));
    // The track list (☰) is a sheet: "/" waits for it, with each of the three menus.
    const menus = [];
    for (const menu of ['record', 'tape', 'digital']) {
      await page.evaluate(m => { const p = JSON.parse(localStorage.getItem('tourbook-prefs') || '{}'); p.menu = m; localStorage.setItem('tourbook-prefs', JSON.stringify(p)); }, menu);
      await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(250);
      await page.locator(Q).waitFor({ timeout: 8000 }).catch(() => {}); // asked again on this load
      if (await page.$(Q)) { await page.click('#ac-ask-close'); await sleep(250); }
      await page.click('#deck .dk-list'); await sleep(300);
      const listUp = (await page.$$('.sheet')).length === 1;
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press('/'); await sleep(200);
      const blocked = (await focused(page)) !== '#srch-box';
      await page.keyboard.press('Escape'); await sleep(250);
      await type(page, 'owls'); await gigs(page);
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
    const recs = q => page.evaluate(q => import('./js/search.js').then(m => m.searchReady().then(() => Object.fromEntries(m.searchFor(q).map(r => [r.id, r.guests])))), q);
    const WOLFE2 = ['b-o1', 'b-r1', 'b-s1', 'b-w1', 'b-w2', 'b-w3', 'b-w4', 'b-w5', 'b-w6', 'b-x1', 'sw2', 'sw3'];
    let g = await recs('chelsea');
    ok('a band logged as the support act at another band’s show on the calendar is not a second result for that night: the show holds its time seen', same(Object.keys(g).sort(), WOLFE2) && same(g['b-o1'], ['sg1']), JSON.stringify(g));
    g = await recs('motorhead');
    ok('…matched by the place typed by hand too; a band logged there that night that was not on the bill keeps its own card', same(Object.keys(g).sort(), ['b-p1', 'sg3', 'sm1']) && same(g['b-p1'], ['sg2']) && same(g.sg3, []), JSON.stringify(g));
    ok('…and what was logged is still searched, on the show: the notes, the band’s genre', same(Object.keys(await recs('drone')), ['b-o1']) && same(Object.keys(await recs('doom folk')).sort(), ['b-o1', 'b-r1', 'b-s1', 'b-w1', 'b-w2', 'b-w3', 'b-w4', 'b-w5', 'b-w6', 'sw2', 'sw3']));
    await type(page, 'chelsea'); await gigs(page);
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
    const others = await page.evaluate(() => import('./js/search.js').then(m => m.searchReady().then(() => { const x = m.searchAll('the wolves'); return { bands: x.bands, songs: x.songs, setlists: x.setlists, people: x.people }; })));
    ok('…and in the other kinds: the band itself, its songs, its setlists and its members, by the old name', same(others, { bands: ['a-wolfe'], songs: ['g-1'], setlists: ['l-1'], people: ['p-sam'] }), JSON.stringify(others));
    await type(page, 'chelsea wolfe'); await pickTab(page, 'bands');
    const bandRow = await page.evaluate(() => { const e = document.querySelector('.srch-list .srch-rec'); return { name: e.querySelector('.srch-name').textContent, was: (e.querySelector('.srch-was') || { textContent: '' }).textContent }; });
    ok('the band’s row has its name now and “formerly …” under it, as its card in the acts list has', same(bandRow, { name: 'Wolfe Moon', was: 'formerly Chelsea Wolfe' }), JSON.stringify(bandRow));
    await pickTab(page, 'gigs');
    const kindsNow = await chips(page, '.srch-kinds');
    const cardsNow = await page.evaluate(() => import('./js/model.js').then(m => import('./js/store.js').then(st => [...document.querySelectorAll('.srch-list .card')].map(c => { const id = c.dataset.seen || c.dataset.id, b = c.dataset.seen ? null : st.byId('bookings', id);
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

  /* ------------------------------ the dates, in four time zones, with the page's clock moved ------------------------------ */
  // readDate is given the page's own today. Each moment is set in the page's own time zone (worked out in the page), and
  // what each date typed should give is worked out there too, by plain date sums: never by the reader itself. The words
  // typed are made from the clock (English names, as the search reads them).
  {
    const { browser } = await open();
    const zones = ['Pacific/Auckland', 'America/Los_Angeles', 'Asia/Kolkata', 'UTC'];
    // A Sunday at the end of a month, the last evening of a year, the first minutes of a year, a Monday just after
    // midnight, and the 29th of February.
    const MOMENTS = [['2026-05-31', '23:30'], ['2026-12-31', '23:50'], ['2027-01-01', '00:10'], ['2026-11-16', '00:05'], ['2028-02-29', '12:00']];
    const bad = [];
    for (const zone of zones) {
      const ctx = await browser.newContext({ timezoneId: zone, serviceWorkers: 'block' });
      await ctx.addInitScript(() => { try { localStorage.setItem('tourbook-tour', 'done'); localStorage.setItem('tourbook-role-nudged', '1'); localStorage.setItem('tourbook-ask-seen', 'off'); } catch (e) { /* ignore */ } });
      const pg = await ctx.newPage();
      await pg.goto(BASE); await pg.waitForSelector('#deck .dk-next');
      const at = (iso, hm) => pg.evaluate(([iso, hm]) => { const [y, mo, d] = iso.split('-').map(Number), [hh, mm] = hm.split(':').map(Number); return new Date(y, mo - 1, d, hh, mm).getTime(); }, [iso, hm]);
      await ctx.clock.install({ time: await at(...MOMENTS[0]) });
      for (const [iso, hm] of MOMENTS) {
        await pg.clock.setSystemTime(await at(iso, hm));
        const res = await pg.evaluate(() => import('./js/search-dates.js').then(m => {
          const now = new Date(), y = now.getFullYear(), mo = now.getMonth(), d = now.getDate(), out = [];
          const pad = n => String(n).padStart(2, '0'), iso = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, on = n => new Date(y, mo, d + n);
          const en = (dt, o) => new Intl.DateTimeFormat('en', o).format(dt).toLowerCase();
          const check = (typed, from, to, order = 'dm') => { const r = m.readDate(typed.split(' '), new Date(), order); const got = r.date ? `${r.date.from}..${r.date.to}` : 'none', want = `${from}..${to}`; if (got !== want) out.push(`${typed} [${order}]: ${got}, not ${want}`); };
          check('today', iso(now), iso(now));
          check('tomorrow', iso(on(1)), iso(on(1))); check('yesterday', iso(on(-1)), iso(on(-1)));
          for (let k = 0; k < 7; k++) { const dt = on(k); check(en(dt, { weekday: 'long' }), iso(dt), iso(dt)); check(en(dt, { weekday: 'short' }), iso(dt), iso(dt)); check('next ' + en(dt, { weekday: 'long' }), iso(on(k || 7)), iso(on(k || 7))); check('last ' + en(on(k - 7), { weekday: 'long' }), iso(on(k - 7)), iso(on(k - 7))); }
          const mon = on(-((now.getDay() + 6) % 7));
          check('this week', iso(mon), iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)));
          check('next week', iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7)), iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 13)));
          check('last week', iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - 7)), iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - 1)));
          for (const [w, k] of [['this', 0], ['next', 1], ['last', -1]]) { check(`${w} month`, iso(new Date(y, mo + k, 1)), iso(new Date(y, mo + k + 1, 0))); check(`${w} year`, `${y + k}-01-01`, `${y + k}-12-31`); }
          // A day, every way it can be written: one ahead across the turn of the month (and of the year at its end), one back.
          for (const n of [1, 3, 40, -3, -40]) {
            const dt = on(n), day = dt.getDate(), M = dt.getMonth() + 1, Y = dt.getFullYear(), s = iso(dt);
            check(`${day} ${en(dt, { month: 'short' })}`, s, s); check(`${en(dt, { month: 'long' })} ${day}`, s, s); check(`${day} ${en(dt, { month: 'long' })} ${Y}`, s, s);
            check(`${day}/${M}`, s, s, 'dm'); check(`${M}/${day}`, s, s, 'md'); check(`${day}/${M}/${Y}`, s, s, 'dm'); check(`${M}/${day}/${Y}`, s, s, 'md'); check(s, s, s);
            check(`${en(dt, { weekday: 'short' })} ${day} ${en(dt, { month: 'short' })}`, s, s);
          }
          // A month: this one, the one after (across the turn of the year in December), two months back (this year's
          // or last year's), with its year, and a year alone.
          const month = k => { const a = new Date(y, mo + k, 1); return [en(a, { month: 'short' }), en(a, { month: 'long' }), iso(a), iso(new Date(a.getFullYear(), a.getMonth() + 1, 0)), a.getFullYear()]; };
          for (const k of [0, 1, 2, -2]) { const [short, long, from, to, Y] = month(k); check(short, from, to); check(long, from, to); check(`${long} ${Y}`, from, to); check(from.slice(0, 7), from, to); }
          check(String(y - 1), `${y - 1}-01-01`, `${y - 1}-12-31`);
          const w = m.readDate(['church', String(y - 1)], new Date());
          if (JSON.stringify(w.rest) !== '["church"]' || !w.date) out.push('church <year>: ' + JSON.stringify(w));
          const none = ['church', 'chelsea', 'wolfe', '20', 'week', 'next', '31/31', `${en(new Date(y, 1, 1), { month: 'short' })} 30`, `${y}-02-30`].filter(x => m.readDate(x.split(' '), new Date()).date);
          if (none.length) out.push('read as a date: ' + none.join(', '));
          // A day that is not in its month is no date whichever way round it is typed, and its month is not read alone
          // either: its words stay words.
          const feb = en(new Date(y, 1, 1), { month: 'short' }), apr = en(new Date(y, 3, 1), { month: 'long' });
          const kept = [`30 ${feb}`, `30th of ${feb}`, `${en(now, { weekday: 'short' })} 30 ${feb}`, `31 ${apr} ${y}`, `${apr} 31`].filter(x => { const r = m.readDate(x.split(' '), new Date()); return r.date || r.rest.join(' ') !== x; });
          if (kept.length) out.push('a day not in its month read as a date: ' + kept.join(', '));
          return { at: iso(now) + ' ' + now.toTimeString().slice(0, 5), day: now.getDay(), out };
        }));
        if (res.out.length) bad.push(`${zone} ${res.at}: ${res.out.slice(0, 4).join(' | ')}`);
        if (iso === '2026-05-31' && res.day !== 0) bad.push(`${zone}: 2026-05-31 is not a Sunday here (${res.day})`);
      }
      await ctx.close();
    }
    ok('the date reader, in four time zones, on a Sunday, across the turn of a month and of a year and on the 29th of February: every day and span it reads is the one the page’s own clock gives', bad.length === 0, bad.slice(0, 6).join(' || '));
    await browser.close();
  }

  /* ------------------------------ a 320 px phone, extra-large text, large buttons ------------------------------ */
  for (const scheme of ['light', 'dark']) {
    const prefs = menu => JSON.stringify({ scheme, menu, text: 'xlarge', targets: 'large' });
    const n = await open({ viewport: { width: 320, height: 700 }, init: `try { if (!localStorage.getItem('tourbook-prefs')) localStorage.setItem('tourbook-prefs', '${prefs('record')}'); } catch (e) {}
      window.__phFits = q => { const v = q.value; q.value = q.placeholder; const fits = q.scrollWidth <= q.clientWidth; q.value = v; return fits; };` });
    await store(n.page, seed, DATES);
    await sleep(300);
    for (const menu of ['record', 'tape', 'digital']) {
      await n.page.evaluate(p => localStorage.setItem('tourbook-prefs', p), prefs(menu));
      await n.page.reload(); await n.page.waitForSelector('#deck .dk-next'); await sleep(250);
      await n.page.evaluate(() => { document.getElementById('installBtn').hidden = false; });
      const fit = await n.page.evaluate(() => { const brand = document.querySelector('.top .brand'), br = brand.getBoundingClientRect(), word = document.createRange(); word.selectNodeContents([...brand.childNodes].find(x => x.nodeType === 3 && x.data.trim())); const wr = word.getBoundingClientRect();
        const btns = [...document.querySelectorAll('.top-actions > button')].filter(e => !e.hidden).map(e => { const r = e.getBoundingClientRect(); return { id: e.id, l: r.left, r: r.right, w: Math.round(r.width), h: Math.round(r.height), t: r.top, b: r.bottom }; });
        const deck = document.querySelector('.deck').getBoundingClientRect(), q = document.getElementById('srch-box'), qr = q.getBoundingClientRect(), placeholderFits = window.__phFits(q);
        return { html: document.documentElement.dataset, page: document.documentElement.scrollWidth, small: getComputedStyle(brand.querySelector('small')).display, whole: brand.scrollWidth <= brand.clientWidth + 0.5 && wr.right <= br.right + 0.5 && br.left >= 0 && wr.right <= btns[0].l + 0.5,
          btns, inRow: btns.every((x, i) => x.l >= (i ? btns[i - 1].r : br.right) - 0.5 && x.r <= innerWidth + 0.5 && Math.abs(x.t - btns[0].t) < 1), box: { l: qr.left, r: qr.right, h: qr.height, under: qr.top >= btns[0].b - 0.5, above: qr.bottom <= deck.top + 0.5, placeholderFits } }; });
      ok(`320 px, ${scheme}, ${menu}: extra-large text and large buttons are on, Install is showing: TOURBOOK whole, the small words hidden, no page wider than the screen`, fit.html.text === 'xlarge' && fit.html.targets === 'large' && fit.html.scheme === scheme && fit.html.menu === menu && fit.btns.length === 4 && fit.whole && fit.small === 'none' && fit.page <= 320, JSON.stringify({ whole: fit.whole, small: fit.small, page: fit.page }));
      ok(`320 px, ${scheme}, ${menu}: the four buttons fit in one row beside TOURBOOK, each at least 36 px wide and 44 px tall`, fit.inRow && fit.btns.every(x => x.w >= 36 && x.h >= 44), JSON.stringify(fit.btns));
      ok(`320 px, ${scheme}, ${menu}: the box fits between the top bar and the menu, full height, with its placeholder whole`, fit.box.l >= 0 && fit.box.r <= 320 && fit.box.h >= 54 && fit.box.under && fit.box.above && fit.box.placeholderFits, JSON.stringify(fit.box));
    }
    await n.page.focus('#srch-box'); await sleep(150);
    const pop = await n.page.evaluate(() => { const p = document.getElementById('srch-box-help'), r = p.getBoundingClientRect(); return { inside: r.left >= 0 && r.right <= 320, shown: r.height > 0, cut: p.scrollWidth > p.clientWidth + 1 }; });
    ok(`320 px, ${scheme}: the line of help under the box fits`, pop.inside && pop.shown && !pop.cut, JSON.stringify(pop));
    // Each role's placeholder is written into the box for a moment, to see it fits: as many kinds as there is room for.
    const phFits = await n.page.evaluate(() => import('./js/roles.js').then(r => { const q = document.getElementById('srch-box'), out = [];
      for (const id of ['producer', 'manager', 'band', 'solo', 'scout', 'audiophile', 'all']) { r.setRole(id); out.push([id, q.placeholder, window.__phFits(q) && /^Search \w+.*…$/.test(q.placeholder)]); }
      localStorage.removeItem('tourbook-role'); return out; }));
    ok(`320 px, ${scheme}: the box’s placeholder fits in it, in every role’s words (as many kinds as there is room for)`, phFits.every(x => x[2]), JSON.stringify(phFits));
    await n.page.keyboard.type('c'); await n.page.waitForSelector('#srch-q'); await sleep(200);
    const tall = () => n.page.evaluate(() => { const sh = document.querySelector('.srch-sheet'), r = sh.getBoundingClientRect(), body = sh.querySelector('.sheet-body'), q = document.getElementById('srch-q').getBoundingClientRect();
      const inside = e => { const x = e.getBoundingClientRect(); return x.width === 0 || (x.left >= r.left - 0.5 && x.right <= r.right + 0.5); };
      const solid = [...sh.querySelectorAll('.sheet-head *, #srch-q, .srch-help, .srch-none, .srch-found, .srch-when, .srch-chips, .srch-tabs, .srch-list > li, .srch-list .card, .srch-list .card *:not(.sr-only), #srch-more, .srch-seeall')];
      const lis = [...sh.querySelectorAll('.srch-list > li')].map(e => e.getBoundingClientRect());
      const cut = [...sh.querySelectorAll('.srch-list .bk-card-title, .srch-list .bk-card-sub, .srch-found, .srch-help, .srch-none, .srch-today > span:first-child, .srch-score, .srch-why, .srch-list .pill, .srch-name, .srch-sub, .srch-seeall .btn')].filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline').map(e => e.className);
      return { sheet: [Math.round(r.left), Math.round(r.right)], sideways: body.scrollWidth > body.clientWidth + 1, page: document.documentElement.scrollWidth, out: solid.filter(e => !inside(e)).map(e => e.className || e.tagName).slice(0, 5), over: lis.some((x, i) => i && x.top < lis[i - 1].bottom - 0.5), cut, box: q.left >= r.left && q.right <= r.right && q.height >= 44 }; });
    let f = await tall();
    const sheetPh = await n.page.evaluate(() => { const q = document.getElementById('srch-q'); return [q.placeholder, window.__phFits(q)]; });
    ok(`320 px, ${scheme}: typing opens the results, which fit: the box and what was found, nothing cut or pushed sideways`, !f.sideways && f.page <= 320 && f.out.length === 0 && f.cut.length === 0 && f.box, JSON.stringify(f));
    ok(`320 px, ${scheme}: the results box’s placeholder fits too`, sheetPh[1] && /^Search /.test(sheetPh[0]), JSON.stringify(sheetPh));
    await type(n.page, 'chelsea');
    f = await tall();
    const tabRow = await n.page.evaluate(() => { const row = document.querySelector('.srch-tabs'), r = row.getBoundingClientRect(), last = row.lastElementChild; last.focus(); const l = last.getBoundingClientRect(); return { scrolls: row.scrollWidth > row.clientWidth, tall: [...row.children].every(c => c.getBoundingClientRect().height >= 54), lastInView: l.left >= r.left - 0.5 && l.right <= r.right + 0.5 }; });
    ok(`320 px, ${scheme}: All fits, the rows none over another, nothing cut or pushed sideways`, !f.sideways && f.page <= 320 && f.out.length === 0 && !f.over && f.cut.length === 0 && (await n.page.$$('.srch-all .srch-rec')).length === 8, JSON.stringify(f));
    ok(`320 px, ${scheme}: the tabs scroll sideways in their row, each a full button tall, and one that takes the focus comes into sight`, tabRow.scrolls && tabRow.tall && tabRow.lastInView, JSON.stringify(tabRow));
    if (process.env.S) await n.page.screenshot({ path: `${process.env.S}/46-search-320-all-${scheme}.png` });
    for (const k of ['gigs', 'bands', 'people', 'songs', 'setlists', 'logs', 'money']) {
      await pickTab(n.page, k);
      f = await tall();
      if (k === 'gigs') {
        const rowsFit = await n.page.evaluate(() => [...document.querySelectorAll('.srch-chips')].map(row => { const r = row.getBoundingClientRect(), last = row.lastElementChild; last.focus(); const l = last.getBoundingClientRect(); return { scrolls: row.scrollWidth > row.clientWidth, tall: [...row.querySelectorAll('.chip')].every(c => c.getBoundingClientRect().height >= 44), lastInView: l.left >= r.left - 0.5 && l.right <= r.right + 0.5, pressedMark: !!row.querySelector('.chip.on .srch-tick') }; }));
        ok(`320 px, ${scheme}: the kind row and the place chips scroll inside themselves, and a chip that takes the focus comes into sight`, rowsFit.length === 2 && rowsFit.every(x => x.scrolls && x.tall && x.lastInView && x.pressedMark), JSON.stringify(rowsFit));
      }
      ok(`320 px, ${scheme}: the ${k} tab fits, nothing cut or pushed sideways`, !f.sideways && f.page <= 320 && f.out.length === 0 && !f.over && f.cut.length === 0, JSON.stringify(f));
      if (process.env.S && (k === 'gigs' || k === 'money')) await n.page.screenshot({ path: `${process.env.S}/46-search-320-${k}-${scheme}.png` });
    }
    await pickTab(n.page, 'gigs');
    await n.page.evaluate(() => { document.querySelector('.srch-sheet .sheet-body').scrollTop = 99999; }); await sleep(150);
    f = await tall();
    ok(`320 px, ${scheme}: the end of the bookings list fits too (the times seen from the log)`, !f.sideways && f.out.length === 0 && !f.over && f.cut.length === 0, JSON.stringify(f));
    const W = await dayWords(n.page, DATES.w4);
    await type(n.page, `church ${W.dm}`);
    f = await tall();
    ok(`320 px, ${scheme}: a date typed fits, with the line saying how it was read`, !f.sideways && f.out.length === 0 && f.cut.length === 0 && !!(await n.page.$('.srch-when')), JSON.stringify(f));
    await type(n.page, 'zzzz');
    f = await tall();
    ok(`320 px, ${scheme}: “nothing found” fits`, !f.sideways && f.out.length === 0 && f.cut.length === 0, JSON.stringify(f));
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
    await licenceAt(c.page); // the licence leg: the free days in the page's own time
    await store(c.page, (s, x) => s.update(d => {
      d.acts.push({ id: 'a-late', name: 'Late Band', color: '#8b5cf6' });
      d.bookings.push(
        { id: 'n-late', kind: 'show', status: 'confirmed', actId: 'a-late', date: x.D, venueName: 'The Crown', setTime: '00:30' },
        { id: 'n-done', kind: 'show', status: 'confirmed', actId: 'a-late', date: x.D, venueName: 'The Crown', setTime: '20:00', setLength: 60 },
        { id: 'n-next', kind: 'show', status: 'confirmed', actId: 'a-late', date: x.N, venueName: 'The Bell', setTime: '21:00' });
    }), { D, N });
    await sleep(300);
    ok('the small hours: Coming up keeps last night’s show still to play at its top, marked “Tonight”', same(await c.page.$$eval('.bk-agenda .bk-card', els => els.map(e => [e.dataset.id, e.querySelector('.bk-card-sub').textContent.split(' · ')[0]])), [['n-late', 'Tonight'], ['n-next', 'Today']]));
    await type(c.page, 'late band');
    const best = await c.page.$$eval('.srch-all .srch-rec', els => els.map(e => e.dataset.id));
    ok('…on All too it is with what is still to come: the band, last night’s show still to play, today’s, then the one that is over', same(best, ['a-late', 'n-late', 'n-next', 'n-done']), JSON.stringify(best));
    await gigs(c.page);
    const word = id => c.page.evaluate(id => { const e = document.querySelector(`.srch-list .card[data-id="${id}"] .bk-card-sub`); return e ? e.textContent.split(' · ')[0] : null; }, id);
    ok('…and the search lists it with what is still ahead, above the line for today, as its card says “Tonight”', same(await rows(c.page), ['n-next', 'n-late', 'TODAY', 'n-done']) && (await word('n-late')) === 'Tonight', JSON.stringify([await rows(c.page), await word('n-late')]));
    await c.page.clock.fastForward(150 * 60000); await sleep(400);
    ok('…once its set is over, the open search moves it below the line, with the show that is over', same(await rows(c.page), ['n-next', 'TODAY', 'n-done', 'n-late']) && (await word('n-late')) === 'On stage 00:30', JSON.stringify([await rows(c.page), await word('n-late')]));
    await closeSearch(c.page);
    ok('no errors in the console (the small hours)', c.errors.length === 0, c.errors.slice(0, 5).join(' | '));
    await c.browser.close();
  }

  /* ------------------------------ a name that holds a date, All with a date, house rules, the tab in sight ------------------------------ */
  // Found by the check of the widened search. A band or a place whose name holds a date's words keeps every one of its
  // bookings: "<Month> Wine", "<Weekday> Night Lights", "The <year>" and "The <Weekday> Club" are names as well as dates.
  // All puts a name that starts with what was typed first when what was typed is a date too. House rules typed as words
  // find only the venues that have that rule, as Venues' own search does. The tab picked stays in sight along its row as
  // the person types on. The line of help does not come up over the menu when the box only has the focus back from
  // results closed by a touch. The names are made from the page's clock (the month three months on, so it is the nearest
  // one of its name; tomorrow's weekday; the year fifty years back) and every booking but one is within six weeks of today,
  // never in that month, so nothing here depends on the day, the hour or the time zone of the run.
  {
    const v = await open();
    const N = await v.page.evaluate(() => { const now = new Date(), en = (dt, o) => new Intl.DateTimeFormat('en', o).format(dt), pad = n => String(n).padStart(2, '0');
      const m3 = new Date(now.getFullYear(), now.getMonth() + 3, 15), tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { month: en(m3, { month: 'long' }), inMonth: `${m3.getFullYear()}-${pad(m3.getMonth() + 1)}-15`, weekday: en(tom, { weekday: 'long' }), year: String(now.getFullYear() - 50) }; });
    await store(v.page, (s, x) => s.update(d => {
      d.acts.push({ id: 'a-mw', name: `${x.N.month} Wine` }, { id: 'a-yr', name: `The ${x.N.year}` }, { id: 'a-wd', name: `${x.N.weekday} Night Lights` }, { id: 'a-pl', name: 'Plain Band' },
        { id: 'a-zz', name: 'Zephyr', genre: 'Drone' });
      d.venues.push({ id: 'v-wd', kind: 'venue', name: `The ${x.N.weekday} Club` }, { id: 'v-pl', kind: 'venue', name: 'Plain Hall' },
        { id: 'v-r1', kind: 'venue', name: 'Hall One', rules: { proCameras: 'no', phones: 'yes' } }, { id: 'v-r2', kind: 'venue', name: 'Hall Two', notes: 'Dogs allowed.', rules: { proCameras: 'yes', phones: 'no' } },
        { id: 'v-zz', kind: 'venue', name: 'Zephyr Rooms' });
      d.people.push({ id: 'p-mo', name: `${x.N.month} Okafor` }, { id: 'p-an', name: `Ann ${x.N.month}field` }, { id: 'p-zz', name: 'Zephyr Jones' });
      const show = (id, actId, date, venueId) => ({ id, kind: 'show', status: 'confirmed', actId, date, venueId, setTime: '21:00' });
      d.bookings.push(show('m1', 'a-mw', x.D.m1, 'v-pl'), show('m2', 'a-mw', x.D.m2, 'v-pl'), show('m3', 'a-mw', x.D.m3, 'v-pl'), show('mm', 'a-pl', x.N.inMonth, 'v-pl'),
        show('y1', 'a-yr', x.D.m1, 'v-pl'), show('w1', 'a-wd', x.D.w1, 'v-pl'), show('w2', 'a-wd', x.D.m2, 'v-pl'), show('c1', 'a-pl', x.D.w1, 'v-wd'), show('z1', 'a-zz', x.D.m2, 'v-zz'),
        { ...show('z2', 'a-zz', x.D.w1, 'v-zz'), invoice: { number: 'INV-0777', status: 'draft', issued: x.D.w1, lines: [{ id: 'l', desc: 'Fee', qty: 1, unit: 'show', price: 100 }], taxRate: 0, payments: [] } });
      d.songs.push({ id: 'g-zz', title: 'Zephyr Song', actId: 'a-zz' });
      d.setlists.push({ id: 'l-zz', name: 'Zephyr set', actId: 'a-zz', items: [] });
      d.gear.push({ id: 'q-zz', name: 'Zephyr amp', qty: 1 });
    }), { N, D: { m1: day(-40), m2: day(10), m3: day(30), w1: day(-9) } });
    await sleep(300);
    const lw = s => s.toLowerCase();
    const R = {};
    for (const q of [`${lw(N.month)} wine`, `the ${N.year}`, `${lw(N.weekday)} night lights`, `${lw(N.weekday)} club`, lw(N.month)]) R[q] = await every(v.page, q);
    const g = q => [...R[q].gigs].sort();
    ok('a band whose name holds a month keeps all its bookings, on any day: “<Month> Wine”', same(g(`${lw(N.month)} wine`), ['m1', 'm2', 'm3']) && same(R[`${lw(N.month)} wine`].bands, ['a-mw']), JSON.stringify(R[`${lw(N.month)} wine`]));
    ok('…and so does one whose name holds a year (“The <year>”) or a weekday (“<Weekday> Night Lights”)', same(g(`the ${N.year}`), ['y1']) && same(g(`${lw(N.weekday)} night lights`), ['w1', 'w2']), JSON.stringify([g(`the ${N.year}`), g(`${lw(N.weekday)} night lights`)]));
    ok('…and a place whose name holds a weekday keeps the bookings there: “The <Weekday> Club”', same(g(`${lw(N.weekday)} club`), ['c1']) && R[`${lw(N.weekday)} club`].venues.includes('v-wd'), JSON.stringify(R[`${lw(N.weekday)} club`]));
    ok('…while the month typed alone is still the month (and that band’s bookings, by its name)', same(g(lw(N.month)), ['m1', 'm2', 'm3', 'mm']), JSON.stringify(g(lw(N.month))));
    await type(v.page, lw(N.month));
    const best = await v.page.$$eval('.srch-all .srch-rec', els => els.map(e => e.dataset.id));
    ok('All, with a date typed: a name that starts with it comes before one that only has a word starting with it, and both before what is only on that date', best.indexOf('p-mo') >= 0 && best.indexOf('p-mo') < best.indexOf('p-an') && best.indexOf('p-an') < best.indexOf('mm') && best[0] === 'a-mw', JSON.stringify(best));
    const whenShown = async q => { await type(v.page, q); return !!(await v.page.$('.srch-when')); };
    const wMonth = await whenShown(lw(N.month)), wBand = await whenShown(`${lw(N.month)} wine`);
    ok('…the line saying how the date was read is there for the month, and left out when all that is dated was found by its name, not by the date', wMonth && !wBand, JSON.stringify([wMonth, wBand]));
    await closeSearch(v.page);
    // House rules: Hall One has no pro cameras and allows phones; Hall Two the other way round (and its notes say "Dogs
    // allowed", which does not make its phones allowed).
    const rule = async q => { const r = (await every(v.page, q)).venues.filter(id => /^v-r/.test(id)).sort(); const own = await v.page.evaluate(q => Promise.all([import('./js/pages/venues.js'), import('./js/store.js')]).then(([m, st]) => ['v-r1', 'v-r2'].filter(id => m.venueMatches(st.byId('venues', id), q))), q); return [r, own]; };
    const H = {};
    for (const q of ['pro cameras allowed', 'phones allowed', 'no phones', 'no pro cameras', 'phones not allowed', 'phones', 'hall one no phones', 'hall one phones allowed']) H[q] = await rule(q);
    ok('house rules typed as words find only the venues that have that rule, as Venues’ own search does: a word of one rule and a word of another make no rule',
      ['pro cameras allowed', 'phones allowed', 'no phones', 'no pro cameras', 'phones not allowed', 'phones'].every(q => same(H[q][0], H[q][1])) && same(H['pro cameras allowed'][0], ['v-r2']) && same(H['no phones'][0], ['v-r2']) && same(H.phones[0], ['v-r1', 'v-r2']), JSON.stringify(H));
    ok('…and with the venue’s name too', same(H['hall one no phones'][0], []) && same(H['hall one phones allowed'][0], ['v-r1']), JSON.stringify([H['hall one no phones'], H['hall one phones allowed']]));
    // The tab picked, far along the row on a phone, stays in sight as the person types on, when the results come back
    // and when the data changes under them.
    await v.page.setViewportSize({ width: 320, height: 700 });
    await type(v.page, 'zephyr');
    await v.page.focus('#srch-tab-all'); await v.page.keyboard.press('End'); await sleep(200);
    const sight = () => v.page.evaluate(() => { const t = document.querySelector('.srch-tab[aria-selected="true"]'), row = t.parentElement.getBoundingClientRect(), r = t.getBoundingClientRect(); return { tab: t.dataset.tab, seen: r.left >= row.left - 0.5 && r.right <= row.right + 0.5 }; });
    const s0 = await sight();
    await v.page.focus('#srch-q'); await v.page.keyboard.press('End'); await v.page.keyboard.type(' '); await sleep(250);
    const s1 = await sight();
    await closeSearch(v.page); await v.page.click('#srch-box'); await v.page.waitForSelector('#srch-q'); await sleep(200);
    const s2 = await sight();
    await store(v.page, st => st.update(d => { d.acts.find(a => a.id === 'a-zz').genre = 'Ambient'; })); await sleep(400);
    const s3 = await sight();
    ok('the tab picked far along the row stays in sight as the person types on, when the results come back and when the data changes', s0.tab === 'money' && [s0, s1, s2, s3].every(x => x.tab === 'money' && x.seen), JSON.stringify([s0, s1, s2, s3]));
    // Results emptied and closed by a touch: the box has the focus back with no keyboard, and no line of help over the
    // menu; a tap on it brings both.
    await v.page.fill('#srch-q', ''); await sleep(150);
    await v.page.evaluate(() => { const x = document.querySelector('.srch-sheet .sheet-head button[aria-label="Close"]'); x.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true })); x.click(); });
    await sleep(250);
    const helpShown = () => v.page.evaluate(() => { const b = document.getElementById('srch-box'); return { focus: document.activeElement === b, keys: b.getAttribute('inputmode'), help: getComputedStyle(document.getElementById('srch-box-help')).display !== 'none' }; });
    const t1 = await helpShown();
    await v.page.click('#srch-box'); await sleep(150);
    const t2 = await helpShown();
    ok('closed by a touch with nothing typed: the box has the focus back, no keyboard and no line of help over the menu; a tap on it brings the help', t1.focus && t1.keys === 'none' && !t1.help && t2.focus && t2.keys === null && t2.help, JSON.stringify([t1, t2]));
    ok('no errors in the console (names with dates, house rules, the tab in sight)', v.errors.length === 0, v.errors.slice(0, 5).join(' | '));
    await v.browser.close();
  }
})().catch(e => { console.log('FAIL search spec crashed — ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')); process.exit(1); });
