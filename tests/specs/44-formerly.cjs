// A renamed act keeps its old name, shown as "formerly …" (the owner's example: The Owls, then The Night Owls, then
// Owl Parliament). In blocks, each in a browser of its own:
//  1. the helpers in js/model.js that every page reads the earlier names through, with fixed dates and with junk;
//  2. the "New name?" sheet as a changed name is saved (when it asks and when it does not, the "Since when?" day and
//     its limits, both answers, closing it, the keyboard, the focus, a screen reader's words);
//  3. what a person then sees: the act's card and page, its own lists ("as …"), the calendar's five views, a booking's
//     page, a venue's, a person's and a backline item's lists, a song's studio sessions, the Studio log, every search
//     that finds things by an act's name, the Earlier names in the act form; and what nobody else is sent: documents,
//     calendar files and spreadsheets carry the current name only, a backup carries the earlier names;
//  4. "Did you see them?"; 5. every role's words; 6. a narrow phone with extra-large text; 7. junk in the stored field.
// Nothing depends on the day, the hour or the time zone of the run: block 1 uses fixed dates; elsewhere every day is
// counted from today in the page, at least two days from any day that decides a result, and a date on screen is
// compared with the same formatter run in the page.
const { open, ok: say, sleep, go, topSheet } = require('../helpers.cjs');

// A check prints what it found only when it fails, on one line.
const ok = (name, cond, extra = '') => say(name, cond, cond ? '' : String(extra ?? '').replace(/\s+/g, ' ').slice(0, 400));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const store = (page, fn, arg) => page.evaluate(`import('./js/store.js').then(s => (${fn.toString()})(s, ${JSON.stringify(arg === undefined ? null : arg)}))`);
const model = (page, fn, arg) => page.evaluate(`import('./js/model.js').then(m => (${fn.toString()})(m, ${JSON.stringify(arg === undefined ? null : arg)}))`);
const actOf = (page, id) => store(page, (s, i) => JSON.parse(JSON.stringify(s.byId('acts', i))), id);
// Days counted from today, by the page's own clock: D[-10] is ten days ago.
const SPAN = [-400, -150, -100, -50, -45, -40, -30, -25, -20, -15, -12, -11, -10, -9, -5, -3, 0, 1, 3, 5, 30];
const daysOf = page => page.evaluate(ns => import('./js/util.js').then(u => Object.fromEntries(ns.map(n => { const d = new Date(); d.setDate(d.getDate() + n); return [n, u.ymd(d)]; }))), SPAN);
const longDay = (page, iso) => page.evaluate(i => import('./js/util.js').then(u => u.parseISO(i).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })), iso);
// Today by the page's clock, read as it is needed (a run may pass midnight).
const todayOf = page => page.evaluate(() => import('./js/util.js').then(u => u.todayISO()));
const wide = page => page.evaluate(() => document.documentElement.scrollWidth);
const sheets = page => page.$$eval('.sheet', els => els.map(x => x.getAttribute('aria-label')));
const focusAt = page => page.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? 'BODY' : a.id || a.getAttribute('data-key') || a.className || a.tagName; });
// What a screen reader is given by an element: its words, without the parts hidden from it.
const spoken = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s); if (!el) return null;
  const out = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (!n.parentElement.closest('[aria-hidden=true]') && n.nodeValue.trim()) out.push(n.nodeValue.trim());
  return out.join(' ');
}, sel);
const role = (page, id) => page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id).then(() => sleep(300));
const openAct = async (page, id) => { await page.evaluate(i => import('./js/pages/acts.js').then(m => m.openAct(i)), id); await page.waitForSelector('.ac-view .ac-title'); await sleep(250); };
// The acts list, whichever act's page was open last.
const toList = async page => { await go(page, 'acts'); if (await page.locator('.ac-view').count()) { await page.click('.ac-view .back-btn'); await sleep(250); } await page.waitForSelector('.ac-page'); };
const openB = async (page, id) => { await page.evaluate(x => import('./js/pages/bookings.js').then(m => m.openBooking(x)), id); await page.waitForSelector('.bk-page'); await sleep(300); };
const editForm = async page => { await page.click('#ac-edit'); await page.waitForSelector('.sheet[aria-label="Edit act"]'); await sleep(200); return page.locator('.sheet[aria-label="Edit act"]'); };
const PROMPT = '.sheet[aria-label="New name?"]';
const noSheet = page => page.waitForSelector('.sheet', { state: 'detached' });
const OLD = /Night Owls|The Owls|formerly|Owlets/i; // nothing sent to other people may match

(async () => {
  /* ======================= 1. the model: one place every page reads the names from ======================= */
  {
    const { browser, page, errors } = await open();
    const r = await model(page, m => {
      const a = { id: 'a', name: 'Owl Parliament', formerNames: [{ name: 'The Night Owls', until: '2031-06-10' }, { name: 'The Owls', until: '2029-03-03' }] };
      const junk = [null, 5, 'x', {}, { name: 7, until: '2030-01-01' }, { name: '   ' }, { name: 'Loose One' }, { name: 'Bad Day', until: '2030-02-30' }, { name: 'Bad Day', until: 'soon' },
        { name: 'Twice', until: '2028-01-01' }, { name: 'twice!', until: '2028-06-01' }, { name: 'OWL  PARLIAMENT.', until: '2031-01-01' }];
      const j = { id: 'j', name: 'Owl Parliament', formerNames: junk };
      const back = { id: 'b', name: 'The Owls', formerNames: [{ name: 'The Owls', until: '2029-03-03' }, { name: 'The Night Owls', until: '2031-06-10' }] };
      const shapes = [undefined, null, 'x', 5, {}, [], [[]], { 0: { name: 'A' } }];
      return {
        names: m.earlierNames(a), spans: m.earlierSpans(a), latest: m.formerName(a), since: m.nameSince(a),
        on: ['2028-01-01', '2029-03-02', '2029-03-03', '2031-06-09', '2031-06-10', '2032-01-01', '', 'tomorrow', undefined].map(d => m.nameOn(a, d)),
        say: ['2028-01-01', '2029-03-03', '2031-06-09', '2031-06-10', 'nonsense'].map(d => m.formerlyOn(a, d)),
        none: [m.earlierNames({ id: 'n', name: 'Plain' }), m.formerName({ name: 'Plain' }), m.nameOn({ name: 'Plain' }, '2030-01-01'), m.formerlyOn({ name: 'Plain' }, '2030-01-01'), m.nameSince({ name: 'Plain' })],
        junk: m.earlierNames(j), junkOn: [m.nameOn(j, '2027-01-01'), m.formerlyOn(j, '2028-03-01'), m.formerlyOn(j, '2028-07-01'), m.formerName(j), m.nameSince(j)],
        shapes: shapes.map(f => { try { const x = { id: 's', name: 'Owl Parliament', formerNames: f }; return JSON.stringify([m.earlierNames(x), m.formerName(x), m.nameOn(x, '2030-01-01'), m.formerlyOn(x, '2030-01-01'), m.earlierSpans(x), m.nameSince(x)]); } catch (e) { return 'threw ' + e.message; } }),
        noAct: (() => { try { return JSON.stringify([m.earlierNames(null), m.formerName(undefined), m.nameOn(null, '2030-01-01'), m.formerlyOn(null, '2030-01-01'), m.formerlyOf(null), m.formerlyOf({}), m.formerlyNote(null), m.formerlyOf({ actId: 'gone', date: '2030-01-01' }), m.cleanFormer('x', 5)]); } catch (e) { return 'threw ' + e.message; } })(),
        back: { names: m.earlierNames(back).map(n => n.name), latest: m.formerName(back), say: ['2028-01-01', '2030-01-01', '2032-01-01'].map(d => m.formerlyOn(back, d)) },
        sameName: [m.sameName('AC/DC', 'acdc'), m.sameName('The Night Owls', 'the  night owls.'), m.sameName('The Night Owls', 'Night Owls'), m.sameName('Night Owls', 'Nightowls'), m.sameName('!!!', '???'), m.sameName('!!!', '!!!'), m.sameName('Beyoncé', 'BEYONCÉ'), m.sameName('Owl', 'Owls')],
      };
    });
    ok('an act’s earlier names read oldest first, whatever order they were stored in', same(r.names, [{ name: 'The Owls', until: '2029-03-03' }, { name: 'The Night Owls', until: '2031-06-10' }]), JSON.stringify(r.names));
    ok('each earlier name knows the day it began, where that is known', same(r.spans.map(n => [n.name, n.from, n.until]), [['The Owls', '', '2029-03-03'], ['The Night Owls', '2029-03-03', '2031-06-10']]), JSON.stringify(r.spans));
    ok('the latest earlier name is the one for the card, and the current name began the day it stopped', r.latest === 'The Night Owls' && r.since === '2031-06-10');
    ok('the name on a date: each old name up to the day before its change, the new name from the day of the change', same(r.on.slice(0, 6), ['The Owls', 'The Owls', 'The Night Owls', 'The Night Owls', 'Owl Parliament', 'Owl Parliament']), r.on.join(' | '));
    ok('…and the current name when the date is no date', same(r.on.slice(6), ['Owl Parliament', 'Owl Parliament', 'Owl Parliament']));
    ok('what to say beside a record: the name that night, nothing on or after the day of the change', same(r.say, ['The Owls', 'The Night Owls', 'The Night Owls', '', '']), r.say.join(' | '));
    ok('an act with no earlier names reads as it always did', same(r.none, [[], '', 'Plain', '', '']), JSON.stringify(r.none));
    ok('junk is cleaned: wrong types and empty names go, a day that is no date reads as not known, a name twice running is one, a last name equal to the current one goes',
      same(r.junk, [{ name: 'Loose One', until: '' }, { name: 'Bad Day', until: '' }, { name: 'twice!', until: '2028-06-01' }]), JSON.stringify(r.junk));
    ok('…and the cleaned list is what dates a record', same(r.junkOn, ['twice!', 'twice!', '', 'twice!', '2028-06-01']), JSON.stringify(r.junkOn));
    ok('a stored field of any shape never throws', r.shapes.every(x => !/^threw/.test(x)) && !/^threw/.test(r.noAct), r.shapes.concat(r.noAct).filter(x => /^threw/.test(x)).join(' | '));
    ok('…and never gives “undefined”', !/undefined/.test(JSON.stringify(r)), JSON.stringify(r).match(/.{0,30}undefined.{0,30}/));
    ok('a band that went back to an old name: its records from then say nothing, the ones between say the name they had', same(r.back.names, ['The Owls', 'The Night Owls']) && r.back.latest === 'The Night Owls' && same(r.back.say, ['', 'The Night Owls', '']), JSON.stringify(r.back));
    ok('two names are the same when only capitals, spaces or punctuation differ', same(r.sameName, [true, true, false, true, false, true, true, false]), r.sameName.join());

    // A booking: by its last day, with the act's current name looked up in the store.
    const b = await page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/model.js')]).then(([s, m]) => {
      s.upsert('acts', { id: 'a', name: 'Owl Parliament', formerNames: [{ name: 'The Owls', until: '2029-03-03' }, { name: 'The Night Owls', until: '2031-06-10' }] });
      const bk = x => ({ id: 'b', kind: 'show', actId: 'a', ...x });
      return {
        show: m.formerlyNote(bk({ date: '2030-05-05' })), early: m.formerlyNote(bk({ date: '2028-05-05' })), on: m.formerlyNote(bk({ date: '2031-06-10' })), after: m.formerlyNote(bk({ date: '2031-07-01' })),
        kinds: ['session', 'rehearsal', 'other'].map(kind => m.formerlyOf(bk({ kind, date: '2030-05-05' }))),
        own: m.formerlyNote(bk({ date: '2030-05-05', title: 'Album launch' })), ownNamed: m.formerlyNote(bk({ date: '2030-05-05', title: 'OWL PARLIAMENT in store' })), ownOld: m.formerlyNote(bk({ date: '2030-05-05', title: 'The Night Owls album launch' })),
        across: m.formerlyOf(bk({ date: '2031-06-08', endDate: '2031-06-10' })), before: m.formerlyOf(bk({ date: '2031-06-07', endDate: '2031-06-09' })),
        odd: [m.formerlyOf(bk({})), m.formerlyOf(bk({ date: 'soon' })), m.formerlyOf(bk({ date: '2030-05-05', endDate: 'zzzz' })), m.formerlyOf(bk({ date: '2030-05-05', actId: '' })), m.formerlyOf({ kind: 'show', client: 'The Night Owls', date: '2030-05-05' })],
        title: m.bookingTitle(bk({ date: '2030-05-05', venueName: 'The Crown' })), name: m.actName('a'),
      };
    }));
    ok('a show from before a change says “formerly” with the name the band had that night', b.show === 'formerly The Night Owls' && b.early === 'formerly The Owls', `${b.show} | ${b.early}`);
    ok('a show on the day of the change, or after it, says nothing', b.on === '' && b.after === '');
    ok('sessions, rehearsals and diary entries of the act count as records too', same(b.kinds, ['The Night Owls', 'The Night Owls', 'The Night Owls']));
    ok('a booking with a title of its own that does not hold the name says whose it was', b.own === 'Owl Parliament, formerly The Night Owls' && b.ownNamed === 'formerly The Night Owls' && b.ownOld === 'Owl Parliament, formerly The Night Owls', `${b.own} | ${b.ownNamed} | ${b.ownOld}`);
    ok('a booking over several days goes by its last day', b.across === '' && b.before === 'The Night Owls', `${b.across} | ${b.before}`);
    ok('a booking with no date, a date that is none, no act or only a typed client says nothing', same(b.odd, ['', '', '', '', '']), JSON.stringify(b.odd));
    ok('every record uses the new name: a booking’s title and the act’s name are the current one', b.title === 'Owl Parliament @ The Crown' && b.name === 'Owl Parliament', b.title);
    ok('no errors in the console (the model)', errors.length === 0, errors.join(' | '));
    await browser.close();
  }

  /* ======================= 2 and 3. changing a name, and what shows afterwards ======================= */
  {
    const { browser, page, errors } = await open();
    const D = await daysOf(page);
    await store(page, (s, D) => {
      s.upsert('venues', { id: 'v1', kind: 'venue', name: 'The Crown' });
      s.upsert('people', { id: 'p1', name: 'Mina Hart', group: 'band', role: 'Vocals' });
      for (const [id, name] of [['p2', 'Ada'], ['p3', 'Bo'], ['p4', 'Cy'], ['p5', 'Di']]) s.upsert('people', { id, name, group: 'crew' });
      // An act as old data has it: no formerNames at all. Its name is in lower case, to be corrected first.
      s.upsert('acts', { id: 'f-act', name: 'the owls', genre: 'Indie', color: '#ff5c8a', members: ['p1'], email: 'owls@example.com', bio: 'A band.', riderTech: 'Two monitor mixes.', riderHospitality: 'Water and towels.',
        inputList: [{ id: 'i1', ch: 1, source: 'Vocal', mic: 'SM58', stand: 'Tall' }],
        seen: [{ id: 'e1', date: D[-400], where: 'The Bell', rating: 60 }, { id: 'e2', date: D[-40], venueId: 'v1', rating: 70 }, { id: 'e3', date: D[-10], where: 'On the day', rating: 75 }, { id: 'e4', date: D[-3], venueId: 'v1', rating: 80 }] });
      for (const [id, name] of [['x1', 'Able'], ['x2', 'Baker'], ['x3', 'Chalk'], ['x4', 'Dune'], ['x5', 'Ember']]) s.upsert('acts', { id, name, members: [] });
      for (const [id, title] of [['g1', 'Harbour Lights'], ['g2', 'Paper Moon'], ['g3', 'Low Tide']]) s.upsert('songs', { id, title, actId: 'x1' });
      s.upsert('songs', { id: 'g4', title: 'Lanterns', actId: 'f-act' });
      const show = (id, n, more = {}) => s.upsert('bookings', { id, kind: 'show', status: 'confirmed', actId: 'f-act', date: D[n], venueId: 'v1', setTime: '21:00', setLength: 45, ...more });
      show('b-400', -400); show('b-150', -150); show('b-40', -40); show('b-11', -11); show('b-10', -10); show('b-3', -3); show('b-next', 5);
      show('b-50', -50, { status: 'done', deal: { type: 'guarantee', fee: 300 }, contact: { name: 'Rosa Lind', email: 'rosa@example.com' } });
      show('b-own', -40, { title: 'Album launch', setTime: '18:00', setLength: 30 });
      show('b-any', -40, { setTime: '', venueId: '', venueName: 'Somewhere' });           // no time: a pill in the "any time" row
      show('b-long', -12, { endDate: D[1], setTime: '' });                                  // began before the change, still on
      s.upsert('bookings', { id: 'b-ses', kind: 'session', status: 'done', actId: 'f-act', date: D[-30], venueName: 'Echo Studios', start: '10:00', end: '14:00' });
      s.upsert('bookings', { id: 'b-reh', kind: 'rehearsal', status: 'done', actId: 'f-act', date: D[-20], venueName: 'The Basement', start: '18:00', end: '20:00' });
      s.upsert('logs', { id: 'l-ses', bookingId: 'b-ses', date: D[-30], title: 'Lanterns takes', takes: [] });
    }, D);
    await go(page, 'acts');
    await page.waitForSelector('.ac-card[data-id="f-act"]');
    const card = page.locator('.ac-card[data-id="f-act"]');

    /* old data behaves as before */
    ok('an act with no earlier names shows no “formerly” on its card', (await card.locator('.ac-formerly').count()) === 0 && !/formerly/.test(await card.innerText()));
    await openAct(page, 'f-act');
    ok('…none on its page, and no Earlier names list', (await page.locator('.ac-hero .ac-formerly').count()) === 0 && (await page.locator('#ac-names').count()) === 0);
    let form = await editForm(page);
    ok('the act form offers to add an earlier name, and shows no empty list', (await form.locator('#ac-was-add').innerText()) === '+ Add an earlier name' && (await form.locator('.ac-was-row').count()) === 0 && await form.locator('.ac-was-label').isHidden());
    ok('…right under the name', await form.evaluate(el => { const f = [...el.querySelectorAll('.form > .field')]; return f[0].contains(el.querySelector('input[data-key=name]')) && f[1].classList.contains('ac-was'); }));

    /* a correction: capitals only. No question, no trace */
    await form.locator('input[data-key=name]').fill('The  OWLS.');
    await form.locator('button[type=submit]').click();
    await noSheet(page);
    let a = await actOf(page, 'f-act');
    ok('a name that differs only in capitals, spaces or punctuation is saved without a question', a.name === 'The  OWLS.' && !('formerNames' in a), JSON.stringify(a.formerNames));
    form = await editForm(page);
    await form.locator('input[data-key=name]').fill('The Owls');
    await form.locator('input[data-key=genre]').fill('Indie rock');
    await form.locator('button[type=submit]').click();
    await noSheet(page);
    a = await actOf(page, 'f-act');
    ok('…and an act that never had earlier names is not given an empty list', a.name === 'The Owls' && a.genre === 'Indie rock' && !('formerNames' in a));

    /* a real change: the sheet asks once, over the form */
    form = await editForm(page);
    await form.locator('input[data-key=name]').fill('The Night Owls');
    await form.locator('input[data-key=genre]').fill('Garage rock');
    await form.locator('textarea[data-key=notes]').fill('Typed in the same save.');
    await form.locator('button[type=submit]').click();
    await page.waitForSelector(PROMPT);
    await sleep(200);
    ok('saving a changed name asks in a sheet of Tourbook’s own, over the form', same(await sheets(page), ['Edit act', 'New name?']));
    ok('nothing is saved while it asks', (await actOf(page, 'f-act')).name === 'The Owls');
    ok('it shows the old and the new name', (await page.locator(PROMPT + ' .ac-rename-old').innerText()) === 'The Owls' && (await page.locator(PROMPT + ' .ac-rename-now').innerText()) === 'The Night Owls');
    const since = await page.evaluate(() => import('./js/util.js').then(u => { const i = document.getElementById('ac-rename-since'); return { value: i.value, max: i.max, min: i.min, today: u.todayISO(), type: i.type, label: document.querySelector('label[for=ac-rename-since]').textContent }; }));
    ok('“Since when?” is a date set to today, which cannot be later', since.type === 'date' && since.label === 'Since when?' && since.value === since.today && since.max === since.today && since.min === '', JSON.stringify(since));
    ok('two answers, in words that fit a band and a solo artist alike', (await page.locator('#ac-rename-new').innerText()) === 'It’s a new name' && (await page.locator('#ac-rename-fix').innerText()) === 'Just fixing the spelling'
      && !/\b(band|artist|they|them)\b/i.test(await page.locator(PROMPT).innerText()), await page.locator(PROMPT).innerText());
    ok('the focus goes into the sheet, to the date', (await focusAt(page)) === 'ac-rename-since');
    const said = await page.evaluate(() => { const d = document.querySelector('.sheet[aria-label="New name?"]'); const text = id => { const c = document.getElementById(id).cloneNode(true); c.querySelectorAll('[aria-hidden=true]').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
      return { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), by: (d.getAttribute('aria-describedby') || '').split(' ').map(text), date: (document.getElementById('ac-rename-since').getAttribute('aria-describedby') || '').split(' ').map(id => !!document.getElementById(id)), alert: document.getElementById('ac-rename-err').getAttribute('role'), inert: document.getElementById('app').inert }; });
    ok('a screen reader is told the sheet’s name, the two names and the question as it arrives', said.role === 'dialog' && said.modal === 'true' && same(said.by, ['The Owls becomes The Night Owls.', 'Did the name change, or are you fixing the spelling?']) && said.inert, JSON.stringify(said));
    ok('…and the date says what it is for, and where an error would be read out', same(said.date, [true, true]) && said.alert === 'alert');

    /* closing it without an answer: back in the form, nothing saved, nothing lost */
    await page.keyboard.press('Escape');
    await sleep(250);
    ok('Escape closes the question only', same(await sheets(page), ['Edit act']));
    ok('…with nothing saved', same([(await actOf(page, 'f-act')).name, (await actOf(page, 'f-act')).genre], ['The Owls', 'Indie rock']));
    ok('…and nothing typed lost', (await form.locator('input[data-key=name]').inputValue()) === 'The Night Owls' && (await form.locator('input[data-key=genre]').inputValue()) === 'Garage rock' && (await form.locator('textarea[data-key=notes]').inputValue()) === 'Typed in the same save.');
    ok('…and the focus back in the form, on Save', await page.evaluate(() => document.activeElement === document.querySelector('.sheet[aria-label="Edit act"] button[type=submit]')));
    // by the keyboard: Enter in the name box asks; a held Enter answers nothing; ✕ goes back to the name box
    await form.locator('input[data-key=name]').focus();
    await page.keyboard.down('Enter');
    await page.waitForSelector(PROMPT);
    await sleep(150);
    for (let i = 0; i < 4; i++) await page.keyboard.down('Enter'); // the key still held: it repeats
    await page.keyboard.up('Enter');
    await sleep(150);
    ok('Enter in the name box asks too, and holding the key down answers nothing', same(await sheets(page), ['Edit act', 'New name?']) && (await actOf(page, 'f-act')).name === 'The Owls');
    // Tab stays inside the question
    await page.focus('#ac-rename-fix');
    const order = [];
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => { const el = document.activeElement; return el.closest('.sheet') ? el.closest('.sheet').getAttribute('aria-label') + ':' + (el.id || el.getAttribute('aria-label')) : 'outside'; })); }
    ok('Tab stays inside the question and reaches the date and both answers', order.every(x => x.startsWith('New name?:')) && ['ac-rename-since', 'ac-rename-new', 'ac-rename-fix'].every(id => order.includes('New name?:' + id)), order.join(' › '));
    await page.locator(PROMPT + ' button[aria-label=Close]').click();
    await sleep(250);
    ok('✕ closes it too: the form is still there, and the focus is in the name box it was asked from', same(await sheets(page), ['Edit act']) && await page.evaluate(() => document.activeElement === document.querySelector('.sheet[aria-label="Edit act"] input[data-key=name]')) && (await actOf(page, 'f-act')).name === 'The Owls', await focusAt(page));

    /* the day cannot be after today */
    await form.locator('button[type=submit]').click();
    await page.waitForSelector(PROMPT);
    await page.fill('#ac-rename-since', D[3]);
    await page.click('#ac-rename-new');
    await sleep(200);
    ok('a day after today is refused, in words, with nothing saved', same(await sheets(page), ['Edit act', 'New name?']) && await page.locator('#ac-rename-err').isVisible() && /hasn’t come yet/.test(await page.locator('#ac-rename-err').innerText()) && (await actOf(page, 'f-act')).name === 'The Owls', await page.locator('#ac-rename-err').innerText());
    ok('…and the focus is back on the date', (await focusAt(page)) === 'ac-rename-since');
    await page.fill('#ac-rename-since', '');
    await page.click('#ac-rename-new');
    await sleep(150);
    ok('…and so is no day at all', await page.locator('#ac-rename-err').isVisible() && /Pick the day/.test(await page.locator('#ac-rename-err').innerText()) && (await actOf(page, 'f-act')).name === 'The Owls');

    /* "It’s a new name", moved back to catch up */
    await page.fill('#ac-rename-since', D[-100]);
    ok('typing a day clears the error', await page.locator('#ac-rename-err').isHidden());
    await page.click('#ac-rename-new');
    await noSheet(page);
    await sleep(300);
    a = await actOf(page, 'f-act');
    ok('“It’s a new name” stores the old name with the day it stopped being used', a.name === 'The Night Owls' && same(a.formerNames, [{ name: 'The Owls', until: D[-100] }]), JSON.stringify(a.formerNames));
    ok('the other fields edited in the same save are saved too', a.genre === 'Garage rock' && a.notes === 'Typed in the same save.' && same(a.members, ['p1']) && a.email === 'owls@example.com' && a.seen.length === 4);
    ok('both sheets close, and the focus goes back to ✎ Edit', (await sheets(page)).length === 0 && (await focusAt(page)) === 'ac-edit', await focusAt(page));
    ok('the page shows the new name with “formerly” under it', (await page.textContent('.ac-title')) === 'The Night Owls' && (await page.locator('.ac-hero .ac-formerly').innerText()) === 'formerly The Owls');

    /* a second change: the day cannot be before the day the previous name began */
    form = await editForm(page);
    ok('the form lists the earlier name with its day', same(await form.locator('.ac-was-name').evaluateAll(els => els.map(e => e.value)), ['The Owls']) && same(await form.locator('.ac-was-until input').evaluateAll(els => els.map(e => e.value)), [D[-100]]) && await form.locator('.ac-was-label').isVisible());
    await form.locator('input[data-key=name]').fill('Owl Parlament'); // a slip of the hand, put right further down
    await form.locator('button[type=submit]').click();
    await page.waitForSelector(PROMPT);
    const lim = await page.evaluate(() => import('./js/util.js').then(u => { const i = document.getElementById('ac-rename-since'); return { min: i.min, max: i.max, value: i.value, today: u.todayISO() }; }));
    ok('the day can go back to the day the previous name began, no further', lim.min === D[-100] && lim.max === lim.today && lim.value === lim.today, JSON.stringify(lim));
    await page.fill('#ac-rename-since', D[-150]);
    await page.click('#ac-rename-new');
    await sleep(200);
    const began = await longDay(page, D[-100]);
    ok('a day before that is refused, saying when the old name began', await page.locator('#ac-rename-err').isVisible() && (await page.locator('#ac-rename-err').innerText()).includes(`The Night Owls only began on ${began}`) && (await actOf(page, 'f-act')).name === 'The Night Owls', await page.locator('#ac-rename-err').innerText());
    await page.fill('#ac-rename-since', D[-10]);
    await page.click('#ac-rename-new');
    await noSheet(page);
    await sleep(250);
    a = await actOf(page, 'f-act');
    ok('Tourbook remembers every name with its day', a.name === 'Owl Parlament' && same(a.formerNames, [{ name: 'The Owls', until: D[-100] }, { name: 'The Night Owls', until: D[-10] }]), JSON.stringify(a.formerNames));

    /* "Just fixing the spelling" leaves no trace */
    form = await editForm(page);
    await form.locator('input[data-key=name]').fill('Owl Parliament');
    await form.locator('input[data-key=genre]').fill('Art rock');
    await form.locator('button[type=submit]').click();
    await page.waitForSelector(PROMPT);
    ok('a spelling fix that changes letters is asked about as well', (await page.locator(PROMPT + ' .ac-rename-old').innerText()) === 'Owl Parlament');
    // by the keyboard alone: from the date, Shift+Tab goes back over ✕ and ? and round to the last control, the second answer
    await sleep(150);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Tab');
    const onFix = await focusAt(page);
    await page.keyboard.press('Enter');
    await noSheet(page);
    await sleep(250);
    a = await actOf(page, 'f-act');
    ok('an answer can be reached and pressed with the keyboard alone', onFix === 'ac-rename-fix', onFix);
    ok('“Just fixing the spelling” saves the name and keeps nothing of the old spelling', a.name === 'Owl Parliament' && a.genre === 'Art rock' && same(a.formerNames, [{ name: 'The Owls', until: D[-100] }, { name: 'The Night Owls', until: D[-10] }]) && !/Parlament/.test(JSON.stringify(a)), JSON.stringify(a.formerNames));
    ok('…and the focus is back on ✎ Edit', (await focusAt(page)) === 'ac-edit');
    // by the keyboard from start to finish: no change to the name, so no question
    form = await editForm(page);
    await form.locator('input[data-key=genre]').fill('Indie rock');
    await form.locator('input[data-key=genre]').press('Enter');
    await noSheet(page);
    ok('saving the form with the name as it was asks nothing', (await actOf(page, 'f-act')).genre === 'Indie rock' && (await actOf(page, 'f-act')).formerNames.length === 2);

    /* the act's page */
    ok('the page says “formerly” with the latest earlier name, in a line under the name', (await page.locator('.ac-hero .ac-formerly').innerText()) === 'formerly The Night Owls'
      && await page.evaluate(() => { const t = document.querySelector('.ac-title'), f = document.querySelector('.ac-hero .ac-formerly'); return t.nextElementSibling === f && parseFloat(getComputedStyle(f).fontSize) < parseFloat(getComputedStyle(t).fontSize) && f.getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 1; }));
    const [d100, d10] = [await longDay(page, D[-100]), await longDay(page, D[-10])];
    const names = await page.$$eval('#ac-names li', els => els.map(li => [li.querySelector('strong').textContent, li.querySelector('span').textContent]));
    ok('…and lists every earlier name with its days, the latest first', (await page.textContent('#ac-h-names')) === 'Earlier names' && same(names, [['The Night Owls', `from ${d100} until ${d10}`], ['The Owls', `until ${d100}`]]), JSON.stringify(names));
    ok('the Earlier names list is a list under a heading of its own', await page.evaluate(() => { const s = document.getElementById('ac-names'); return s.getAttribute('aria-labelledby') === 'ac-h-names' && s.querySelector('ul[role=list]').children.length === 2; }));

    /* the card in the list */
    await page.click('.ac-view .back-btn');
    await page.waitForSelector('.ac-card[data-id="f-act"]');
    ok('the card says “formerly” with the latest earlier name only, under the name', (await card.locator('.ac-formerly').innerText()) === 'formerly The Night Owls' && (await card.locator('.ac-formerly').count()) === 1 && !/The Owls/.test(await card.locator('.ac-card-head').innerText())
      && await page.evaluate(() => { const c = document.querySelector('.ac-card[data-id="f-act"]'), t = c.querySelector('.ac-card-top'), f = c.querySelector('.ac-formerly'); return t.nextElementSibling === f && parseFloat(getComputedStyle(f).fontSize) < parseFloat(getComputedStyle(c.querySelector('.ac-card-name')).fontSize); }));
    ok('a screen reader gets the same words: they are part of the card’s button', /^Owl Parliament formerly The Night Owls /.test(await spoken(page, '#ac-head-f-act')), await spoken(page, '#ac-head-f-act'));
    ok('an act that never changed its name has no such line', (await page.locator('.ac-card[data-id="x1"] .ac-formerly').count()) === 0);

    /* the act's own lists: "as …" */
    await page.click('#ac-head-f-act');
    await page.waitForSelector('#ac-pnl-f-act');
    const log = await card.locator('.ac-seen').evaluateAll(els => els.map(li => (li.querySelector('.ac-as') || { textContent: '' }).textContent));
    ok('the log of times seen says “as …” on a night from before a change, with the name that night', same(log, ['', '', 'as The Night Owls', 'as The Owls']), JSON.stringify(log));
    ok('…and a night on the day of the change already has the new name', log[1] === '');
    await page.click('#ac-past-f-act');
    await page.waitForSelector('.sheet[aria-label="From a past show"]');
    // nine shows are not in the log: five from The Night Owls' days, one from The Owls', three from the day of the change on
    const past = await page.$$eval('.sheet .ac-pick', els => els.map(e => e.querySelector('span').textContent));
    ok('“From a past show” says “as …” on the shows from before a change, with the name that night', past.length === 9 && past.filter(t => / · as The Night Owls$/.test(t)).length === 5 && past.filter(t => / · as The Owls$/.test(t)).length === 1 && past.filter(t => !/ as /.test(t)).length === 3, past.join(' | '));
    await page.keyboard.press('Escape'); await sleep(200);
    const dates = await card.locator('.ac-date').allInnerTexts();
    ok('the card’s dates coming up say nothing: they are after the change (one began before it and is still on)', dates.length === 2 && dates.every(t => !/ as /.test(t)), dates.join(' | '));
    await openAct(page, 'f-act');
    ok('…nor do the bookings coming up on its page', (await page.locator('#ac-coming .ac-bk').count()) === 2 && !/ as /.test(await page.locator('#ac-coming').innerText()));

    /* search */
    await page.click('.ac-view .back-btn');
    await page.waitForSelector('#ac-search');
    const found = async q => { await page.fill('#ac-search', q); await sleep(120); return page.$$eval('.ac-list .ac-card', els => els.map(e => e.dataset.id)); };
    ok('search finds the act by its latest earlier name', same(await found('night owls'), ['f-act']));
    ok('…by an older one', same(await found('the owls'), ['f-act']));
    ok('…and still by its current name', same(await found('parliament'), ['f-act']) && (await found('zzz')).length === 0);
    await page.fill('#ac-search', ''); await sleep(120);
    await go(page, 'people');
    await page.fill('#pp-search', 'night owls'); await sleep(200);
    ok('People finds the act’s members by its earlier name', same(await page.$$eval('.pp-card', els => els.map(e => e.dataset.id)), ['p1']));
    await page.fill('#pp-search', ''); await sleep(100);
    await go(page, 'songs');
    await page.fill('#sg-q', 'night owls'); await sleep(200);
    ok('Songs finds the act’s songs by its earlier name', (await page.locator('.sg-song').count()) === 1 && /Lanterns/.test(await page.locator('.sg-song').first().innerText()));
    await page.fill('#sg-q', ''); await sleep(100);

    /* the calendar: the words a screen reader is given where there is no room to write it */
    await openB(page, 'b-40');
    ok('the show’s own page adds “formerly” under its name', (await page.locator('.bk-hero .bk-formerly').innerText()) === 'formerly The Night Owls' && (await page.textContent('.bk-title')).trim().endsWith('Owl Parliament @ The Crown')
      && await page.evaluate(() => document.querySelector('.bk-hero-top').nextElementSibling === document.querySelector('.bk-hero .bk-formerly')));
    ok('…and the act’s chip keeps the current name', (await page.locator('.bk-hero .bk-act').innerText()).trim() === 'Owl Parliament');
    await page.click('.bk-page .back-btn');
    await page.waitForSelector('.bk-dayview');
    await sleep(200);
    const blockOf = id => page.evaluate(([id, iso]) => { const el = document.getElementById(`bk-ev-${id}-${iso}`) || document.getElementById(`bk-ev-${id}-any`); if (!el) return null; const c = el.cloneNode(true); c.querySelectorAll('.sr-only').forEach(x => x.remove()); return { seen: c.textContent, hidden: el.querySelector('.sr-only').textContent.trim() }; }, [id, D[-40]]);
    let blk = await blockOf('b-40');
    ok('Day view: a block has no room for it, so its hidden words say it first', !!blk && !/formerly/i.test(blk.seen) && /^Formerly The Night Owls\. Confirmed\./.test(blk.hidden), JSON.stringify(blk));
    blk = await blockOf('b-own');
    ok('…a booking with a title of its own says whose it was', !!blk && /^Owl Parliament, formerly The Night Owls\. /.test(blk.hidden), JSON.stringify(blk));
    blk = await blockOf('b-any');
    ok('…and so does a pill in the “any time” row', !!blk && !/formerly/i.test(blk.seen) && /^Formerly The Night Owls\. /.test(blk.hidden), JSON.stringify(blk));
    await page.click('#bk-view-three'); await sleep(250);
    blk = await blockOf('b-40');
    ok('3 days: the block’s hidden words say it too', !!blk && !/formerly/i.test(blk.seen) && /^Formerly The Night Owls\. /.test(blk.hidden), JSON.stringify(blk));
    await page.click('#bk-view-week'); await sleep(250);
    // A Week square has no room to write it either: its spoken name has it after the booking's name (the new one), as
    // two weeks and the month do. was: what follows the name there, up to the status in brackets ('' for nothing).
    const sayOf = (id, iso) => page.evaluate(([id, iso]) => Promise.all([import('./js/store.js'), import('./js/model.js')]).then(([s, m]) => {
      const sq = document.querySelector(`.bk-cal-week .bk-day[data-date="${iso}"]`), b = s.byId('bookings', id); if (!sq || !b) return null;
      const label = sq.getAttribute('aria-label'), title = m.bookingTitle(b), k = m.playKey(b), head = (k == null ? '' : m.nightClock(k) + ' ') + title; // its time first, when it has one
      const i = Math.max(label.indexOf(': ' + head), label.indexOf('. ' + head)); if (i < 0) return null;
      const rest = label.slice(i + 2 + head.length);
      return { was: rest.startsWith(', ') ? rest.slice(2, rest.indexOf(' (')) : '', title, seen: sq.innerText };
    }), [id, iso]);
    let row = await sayOf('b-40', D[-40]);
    ok('Week: a show from before the change says “formerly” after its name, which is the new name, in its square’s spoken name only', !!row && row.was === 'formerly The Night Owls' && row.title.endsWith('Owl Parliament @ The Crown') && !/formerly/.test(row.seen), JSON.stringify(row));
    row = await sayOf('b-own', D[-40]);
    ok('Week: a booking with a title of its own reads right', !!row && row.was === 'Owl Parliament, formerly The Night Owls' && row.title.endsWith('Album launch'), JSON.stringify(row));
    await page.click('#bk-view-two'); await sleep(250);
    let label = await page.getAttribute(`.bk-day[data-date="${D[-40]}"]`, 'aria-label');
    ok('2 weeks: the day square’s spoken name says it after each booking’s name', /Owl Parliament @ The Crown, formerly The Night Owls \(Confirmed\)/.test(label) && /Album launch, Owl Parliament, formerly The Night Owls \(Confirmed\)/.test(label) && !/formerly/.test(await page.locator(`.bk-day[data-date="${D[-40]}"]`).innerText()), label);
    await page.click('#bk-view-month'); await sleep(250);
    label = await page.getAttribute(`.bk-day[data-date="${D[-40]}"]`, 'aria-label');
    ok('Month: and so does the month’s', /Owl Parliament @ The Crown, formerly The Night Owls \(Confirmed\)/.test(label) && !/formerly/.test(await page.locator(`.bk-day[data-date="${D[-40]}"]`).innerText()), label);
    // each old show says the name the band had that night; sessions and rehearsals too; the day of the change does not
    const weekSquare = async (id, n) => { await openB(page, id); await page.click('.bk-page .back-btn'); await page.waitForSelector('.bk-dayview'); await page.click('#bk-view-week'); await sleep(250); return sayOf(id, D[n]); };
    ok('a show from the first name’s days says “formerly The Owls”', ((await weekSquare('b-400', -400)) || {}).was === 'formerly The Owls');
    ok('a session from before the change says it', ((await weekSquare('b-ses', -30)) || {}).was === 'formerly The Night Owls');
    ok('a rehearsal from before the change says it', ((await weekSquare('b-reh', -20)) || {}).was === 'formerly The Night Owls');
    ok('a show the day before the change says it', ((await weekSquare('b-11', -11)) || {}).was === 'formerly The Night Owls');
    row = await weekSquare('b-10', -10);
    ok('a show on the day of the change already has the new name', !!row && row.was === '' && row.title.endsWith('Owl Parliament @ The Crown'), JSON.stringify(row));
    ok('a show after the change says nothing', ((await weekSquare('b-3', -3)) || {}).was === '');
    await openB(page, 'b-3');
    ok('…nor does its page', (await page.locator('.bk-hero .bk-formerly').count()) === 0);
    await openB(page, 'b-long');
    ok('a booking that began before the change and ends after it says nothing', (await page.locator('.bk-hero .bk-formerly').count()) === 0);
    await page.click('.bk-page .back-btn'); await sleep(250);
    ok('Coming up: no card of this act says “formerly” (they are all after the change)', (await page.locator('.bk-agenda .bk-card').count()) >= 2 && (await page.locator('.bk-agenda .bk-formerly').count()) === 0);

    /* a venue's list of what was on there */
    await go(page, 'venues');
    await page.click('#vn-v1');
    await page.waitForSelector('.sheet #vn-bk-b-40');
    ok('a venue’s list of bookings says “formerly” on the ones from before a change', (await page.locator('#vn-bk-b-40 .vn-row-was').innerText()) === 'formerly The Night Owls' && (await page.locator('#vn-bk-b-own .vn-row-was').innerText()) === 'Owl Parliament, formerly The Night Owls' && (await page.locator('#vn-bk-b-3 .vn-row-was').count()) === 0);
    await page.keyboard.press('Escape'); await sleep(200);

    /* the Studio log: a take log names its session */
    await go(page, 'sessions');
    await page.waitForSelector('.sd-log[data-id="l-ses"]');
    ok('the Studio log says “formerly” after the session a take log was made at', (await page.locator('.sd-log[data-id="l-ses"] .sd-log-booking').innerText()).endsWith('Owl Parliament @ Echo Studios, formerly The Night Owls'), await page.locator('.sd-log[data-id="l-ses"] .sd-log-booking').innerText());

    /* the other lists that name a booking: a person's, a backline item's, a song's studio sessions, a take log's own
       page; and the other searches that find things by an act's name (the Studio log's, the two song pickers') */
    await store(page, s => {
      s.upsert('gear', { id: 'gr1', name: 'Telecaster' });
      for (const id of ['b-40', 'b-own', 'b-3']) s.patch('bookings', id, { people: ['p1'], gear: ['gr1'] });
      s.patch('bookings', 'b-ses', { songIds: ['g4'] });
      s.patch('songs', 'g4', { bpm: 120 }); s.patch('songs', 'g1', { bpm: 100 }); // two songs with a tempo: the search has one to leave out
      for (let i = 1; i <= 6; i++) s.upsert('logs', { id: 'l-x' + i, bookingId: '', date: '2020-01-0' + i, title: 'Other takes ' + i, takes: [] }); // enough for the Studio log's search box
      s.upsert('setlists', { id: 'sl-x', name: 'Able’s set', actId: 'x1', items: [] });
    });
    await page.evaluate(() => import('./js/pages/people.js').then(m => m.openPerson('p1')));
    await page.waitForSelector('.sheet .pp-past');
    await page.click('.sheet .pp-past summary'); await sleep(150);
    const was = sel => page.evaluate(x => { const el = document.querySelector(x); return el ? el.textContent : null; }, sel);
    ok('a person’s list of bookings says “formerly” on the ones from before a change', await was('.pp-bk[data-id="b-40"] .pp-bk-was') === 'formerly The Night Owls' && await was('.pp-bk[data-id="b-own"] .pp-bk-was') === 'Owl Parliament, formerly The Night Owls' && await was('.pp-bk[data-id="b-3"] .pp-bk-was') === null,
      [await was('.pp-bk[data-id="b-40"]'), await was('.pp-bk[data-id="b-3"]')].join(' | '));
    await page.keyboard.press('Escape'); await sleep(200);
    await page.evaluate(() => import('./js/pages/backline.js').then(m => m.openGear('gr1')));
    await page.waitForSelector('.sheet #bl-bk-b-40');
    ok('a backline item’s list of bookings does too', await was('#bl-bk-b-40 .bl-row-was') === 'formerly The Night Owls' && await was('#bl-bk-b-own .bl-row-was') === 'Owl Parliament, formerly The Night Owls' && await was('#bl-bk-b-3 .bl-row-was') === null, await was('#bl-bk-b-40'));
    await page.keyboard.press('Escape'); await sleep(200);
    await page.evaluate(() => import('./js/pages/songs.js').then(m => m.openSong('g4')));
    await page.waitForSelector('.sheet [data-fk="sg-b-b-ses"]');
    ok('…and a song’s studio sessions', /^Owl Parliament @ Echo Studios\s*formerly The Night Owls\s*/.test(await page.locator('.sheet [data-fk="sg-b-b-ses"]').innerText()), await page.locator('.sheet [data-fk="sg-b-b-ses"]').innerText());
    await page.keyboard.press('Escape'); await sleep(200);
    await page.evaluate(() => import('./js/pages/sessions.js').then(m => m.openLog('l-ses')));
    await page.waitForSelector('.sd-log-view .sd-link');
    ok('a take log’s own page names its session as its card does', (await page.locator('.sd-log-view .sd-link').innerText()).endsWith('Owl Parliament @ Echo Studios, formerly The Night Owls'), await page.locator('.sd-log-view .sd-link').innerText());
    await page.click('.sd-log-view .back-btn'); await sleep(250);
    await page.fill('#sd-search', 'night owls'); await sleep(200);
    ok('the Studio log’s search finds a session’s take log by the act’s earlier name', same(await page.$$eval('.sd-log', els => els.map(e => e.dataset.id)), ['l-ses']), JSON.stringify(await page.$$eval('.sd-log', els => els.map(e => e.dataset.id))));
    await page.fill('#sd-search', ''); await sleep(100);
    await page.evaluate(() => import('./js/setlist.js').then(m => m.openSetlist('sl-x')));
    await page.waitForSelector('[data-fk="sl-add-songs"]');
    await page.click('[data-fk="sl-add-songs"]');
    await page.waitForSelector('#sgp-q');
    await page.fill('#sgp-q', 'night owls'); await sleep(200);
    ok('the setlist’s song picker finds the act’s songs by its earlier name', same(await page.$$eval('.sg-pick-row', els => els.map(e => e.dataset.song)), ['g4']), JSON.stringify(await page.$$eval('.sg-pick-row', els => els.map(e => e.dataset.song))));
    while (await page.locator('.sheet').count()) { await page.keyboard.press('Escape'); await sleep(200); }
    await go(page, 'tools');
    await page.click('#tl-tab-metronome'); await page.click('#tl-metro-song'); await page.waitForSelector('.sheet .tl-song');
    await page.fill('#tl-song-q', 'the owls'); await sleep(150);
    ok('…and so does the metronome’s', same(await page.$$eval('.sheet .tl-song', els => els.map(e => e.dataset.song)), ['g4']));
    await page.keyboard.press('Escape'); await sleep(200);

    /* the booking form: the act can be picked by its old name too */
    await openB(page, 'b-3');
    await page.click('.bk-edit');
    await page.waitForSelector('.sheet select[data-key="actId"]');
    const opts = await page.$$eval('.sheet select[data-key="actId"] option', os => os.map(o => o.textContent));
    ok('the booking form lists the act with its earlier name, and the others as they were', opts.includes('Owl Parliament (formerly The Night Owls)') && opts.includes('Able') && !opts.some(o => /undefined/.test(o)), opts.join(' | '));
    await page.keyboard.press('Escape'); await sleep(200);

    /* the Earlier names in the act form: correct a day, take one away, add one by hand */
    await openAct(page, 'f-act');
    form = await editForm(page);
    const today = await todayOf(page);
    ok('the act form lists the earlier names, the latest first, each with its day', same(await form.locator('.ac-was-name').evaluateAll(els => els.map(e => e.value)), ['The Night Owls', 'The Owls']) && same(await form.locator('.ac-was-until input').evaluateAll(els => els.map(e => e.value)), [D[-10], D[-100]]));
    const words = await form.locator('.ac-was').evaluate(el => ({ group: el.getAttribute('role') + ':' + el.getAttribute('aria-label'), rows: [...el.querySelectorAll('.ac-was-row')].map(r => [r.getAttribute('role'), r.getAttribute('aria-label'), r.querySelector('.ac-was-name').getAttribute('aria-label'), r.querySelector('.ac-was-until').textContent, r.querySelector('.ac-was-del').getAttribute('aria-label'), r.querySelector('.ac-was-until input').max]) }));
    ok('every box and button there has a name for a screen reader', words.group === 'group:Earlier names' && same(words.rows, [['group', 'Earlier name 1', 'Earlier name', 'Used until', 'Remove the earlier name The Night Owls', today], ['group', 'Earlier name 2', 'Earlier name', 'Used until', 'Remove the earlier name The Owls', today]]), JSON.stringify(words));
    await form.locator('.ac-was-until input').first().fill(D[-25]);
    await form.locator('button[type=submit]').click();
    await noSheet(page);
    a = await actOf(page, 'f-act');
    ok('a day can be corrected (no question: the name did not change)', same(a.formerNames, [{ name: 'The Owls', until: D[-100] }, { name: 'The Night Owls', until: D[-25] }]), JSON.stringify(a.formerNames));
    const after = await page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/model.js')]).then(([s, m]) => ['b-reh', 'b-ses', 'b-40'].map(id => m.formerlyOf(s.byId('bookings', id)))));
    ok('…and the records follow it: a rehearsal after the corrected day no longer says “formerly”', same(after, ['', 'The Night Owls', 'The Night Owls']), JSON.stringify(after));
    form = await editForm(page);
    await form.locator('.ac-was-until input').first().fill(D[3]);
    await form.locator('button[type=submit]').click();
    await sleep(300);
    ok('a day after today is not saved: the form stays, on that box', same(await sheets(page), ['Edit act']) && await form.locator('.ac-was-until input').first().evaluate(el => !el.validity.valid && el.validity.rangeOverflow) && (await actOf(page, 'f-act')).formerNames[1].until === D[-25]);
    await form.locator('.ac-was-until input').first().fill(D[-10]);
    // take the older one away: the focus goes to the name that is left
    await form.locator('.ac-was-del').nth(1).focus();
    await page.keyboard.press('Enter');
    await sleep(150);
    ok('✕ takes a name away, and the focus moves to the one that is left', (await form.locator('.ac-was-row').count()) === 1 && await page.evaluate(() => document.activeElement === document.querySelector('.sheet .ac-was-name')));
    // add one by hand, with no day
    await form.locator('#ac-was-add').click();
    await sleep(150);
    ok('+ Add an earlier name adds an empty row and puts the cursor in it', (await form.locator('.ac-was-row').count()) === 2 && await page.evaluate(() => { const all = document.querySelectorAll('.sheet .ac-was-name'); return document.activeElement === all[1] && all[1].value === ''; }));
    await page.keyboard.type('Owlets');
    ok('…and its ✕ takes the name typed', (await form.locator('.ac-was-del').nth(1).getAttribute('aria-label')) === 'Remove the earlier name Owlets');
    await form.locator('#ac-was-add').click(); // a row left empty is not kept
    await form.locator('button[type=submit]').click();
    await noSheet(page);
    await sleep(250);
    a = await actOf(page, 'f-act');
    ok('a name removed is gone, a name added by hand is kept, with no day when none was given, and an empty row is not', same(a.formerNames, [{ name: 'Owlets', until: '' }, { name: 'The Night Owls', until: D[-10] }]), JSON.stringify(a.formerNames));
    const list2 = await page.$$eval('#ac-names li', els => els.map(li => [li.querySelector('strong').textContent, li.querySelector('span').textContent]));
    ok('the page lists it as “date not known”, and the first dated name as “until …”', same(list2, [['The Night Owls', `until ${d10}`], ['Owlets', 'date not known']]), JSON.stringify(list2));
    ok('…the line under the name is still the latest dated one', (await page.locator('.ac-hero .ac-formerly').innerText()) === 'formerly The Night Owls');
    ok('…and a name with no day dates no record', same(await page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/model.js')]).then(([s, m]) => ['b-400', 'b-40'].map(id => m.formerlyOf(s.byId('bookings', id))))), ['The Night Owls', 'The Night Owls']));
    await page.click('.ac-view .back-btn');
    await page.waitForSelector('#ac-search');
    ok('search finds the act by a name added by hand', same(await found('owlets'), ['f-act']));
    await page.fill('#ac-search', ''); await sleep(120);

    /* a new act: no question, and an earlier name can be given straight away */
    await page.click('#ac-new');
    await page.waitForSelector('.sheet[aria-label="New act"]');
    const nf = topSheet(page);
    ok('the new act form has only the button for an earlier name', (await nf.locator('#ac-was-add').count()) === 1 && (await nf.locator('.ac-was-row').count()) === 0 && await nf.locator('.ac-was-label').isHidden());
    await nf.locator('input[data-key=name]').fill('Brass Monkeys');
    await nf.locator('#ac-was-add').click();
    await page.keyboard.type('The Tin Monkeys');
    await nf.locator('.ac-was-until input').fill(D[-50]);
    await nf.locator('button[type=submit]').click();
    await page.waitForSelector('.ac-view .ac-title');
    await sleep(250);
    const made = await store(page, s => JSON.parse(JSON.stringify(s.db.acts.find(x => x.name === 'Brass Monkeys') || null)));
    ok('a new act is saved without the question, with the earlier name typed for it', (await sheets(page)).length === 0 && !!made && same(made.formerNames, [{ name: 'The Tin Monkeys', until: D[-50] }]) && (await page.locator('.ac-hero .ac-formerly').innerText()) === 'formerly The Tin Monkeys', JSON.stringify(made && made.formerNames));

    /* the walkthroughs tell the truth */
    const tour = () => page.evaluate(() => import('./js/pages/acts.js').then(m => (typeof m.acts.tutorial === 'function' ? m.acts.tutorial() : m.acts.tutorial).map(s => [s.title, s.text, (s.target || []).join(',')])));
    let steps = await tour();
    ok('the act’s walkthrough has an Earlier names step that points at the list', steps.some(s => s[0] === 'Earlier names' && s[2] === '#ac-names' && /the latest first/.test(s[1])) && /“formerly …” under the name/.test(steps[0][1]), JSON.stringify(steps.map(s => s[0])));
    await page.click('.ac-view .back-btn');
    await page.waitForSelector('.ac-card');
    steps = await tour();
    ok('the list’s walkthrough says a search finds an earlier name, and what the line under a name is', /by name, earlier name,/.test((steps.find(s => s[0] === 'Search') || [])[1] || '') && steps.some(s => s[2].startsWith('.ac-card') && /“formerly …” under a name/.test(s[1])), JSON.stringify(steps.map(s => s[1])));
    await openAct(page, 'f-act');
    form = await editForm(page);
    const sheetSteps = title => page.evaluate(t => import('./js/tour.js').then(m => { const s = m.sheetSteps(t); return (typeof s === 'function' ? s() : s || []).map(x => [x.title, x.text, (x.target || []).join(',')]); }), title);
    let fs = await sheetSteps('Edit act');
    ok('the act form’s walkthrough explains the question and the Earlier names', /asks whether it is a new name or a spelling fix/.test(fs[0][1]) && fs[1][0] === 'Earlier names' && fs[1][2] === '.ac-was' && /✕ takes one away/.test(fs[1][1]), JSON.stringify(fs.slice(0, 2)));
    await form.locator('.sheet-help').click();
    await page.waitForSelector('.tour-card');
    await page.locator('.tour-card .btn.primary').click(); await sleep(450);
    ok('…and its ? reaches that step in the open form', (await page.textContent('#tour-title')) === 'Earlier names', await page.textContent('#tour-title'));
    await page.keyboard.press('Escape'); await sleep(200);
    await form.locator('input[data-key=name]').fill('Parliament of Owls');
    await form.locator('button[type=submit]').click();
    await page.waitForSelector(PROMPT);
    await page.locator(PROMPT + ' .sheet-help').click();
    await page.waitForSelector('.tour-card');
    const first = await page.textContent('#tour-title');
    fs = await sheetSteps('New name?');
    ok('the question has a walkthrough of its own', first === 'Old and new' && same(fs.map(s => s[0]), ['Old and new', 'Since when?', 'A new name, or a fix']) && same(await Promise.all(fs.map(s => page.locator(PROMPT + ' ' + s[2]).count())), [1, 1, 1]), first);
    await page.keyboard.press('Escape'); await sleep(200);   // the walkthrough
    await page.keyboard.press('Escape'); await sleep(200);   // the question
    await page.keyboard.press('Escape'); await sleep(200);   // the form
    ok('leaving the walkthrough, the question and the form saves nothing', (await sheets(page)).length === 0 && (await actOf(page, 'f-act')).name === 'Owl Parliament');
    fs = await page.evaluate(() => import('./js/tour.js').then(m => m.sheetSteps('New act')().map(x => x.text).join(' ')));
    ok('the new act form’s walkthrough does not speak of changing a name', !/asks whether/.test(fs) && /Names the act had before/.test(fs));

    /* NOT in anything printed or sent: the current name only */
    await store(page, (s, D) => { s.patch('acts', 'f-act', { formerNames: [{ name: 'The Owls', until: D[-100] }, { name: 'The Night Owls', until: D[-10] }, { name: 'Owlets', until: '' }] }); }, D);
    const docs = await page.evaluate(async () => {
      const [s, docsM, ds, ics, money, settle] = await Promise.all(['store', 'acts-docs', 'daysheet', 'ics', 'money', 'blocks/settlement'].map(n => import(`./js/${n}.js`)));
      const a = s.byId('acts', 'f-act');
      money.createDoc('b-50', 'invoice'); money.createDoc('b-50', 'quote');
      const cur = s.byId('bookings', 'b-50');
      return {
        'the press kit': docsM.epkDoc(a).outerHTML,
        'the tech rider, with the hospitality rider': docsM.riderDoc(a).outerHTML,
        'the act’s contact card': docsM.actVcard(a),
        'the day sheet as a page': ds.daySheetHtml(cur),
        'the day sheet as text': ds.daySheetText(cur),
        'the invoice': money.docTextFor('b-50', 'invoice') + JSON.stringify(money.snapshot(cur, 'invoice')),
        'the quote': money.docTextFor('b-50', 'quote') + JSON.stringify(money.snapshot(cur, 'quote')),
        'the settlement': settle.settlementDoc(cur).outerHTML,
        'the calendar file of a show': ics.bookingIcs(cur),
        'the calendar file of everything': ics.allIcs(s.db.bookings),
      };
    });
    for (const [what, text] of Object.entries(docs)) ok(`${what} carries the current name only`, typeof text === 'string' && text.includes('Owl Parliament') && !OLD.test(text), (String(text).match(/.{0,40}(Night Owls|The Owls|formerly|Owlets).{0,40}/i) || [String(text).slice(0, 80)])[0]);
    ok('the hospitality rider is in the rider checked', /Water and towels/.test(docs['the tech rider, with the hospitality rider']) && /Two monitor mixes/.test(docs['the tech rider, with the hospitality rider']));
    const dl = async click => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), click()]); return { name: d.suggestedFilename(), text: require('fs').readFileSync(await d.path(), 'utf8') }; };
    await openAct(page, 'f-act');
    await page.click('#ac-tab-epk');
    await page.waitForSelector('.ac-epk');
    let file = await dl(() => page.click('#ac-epk-save'));
    ok('the press kit saved as a web page: the current name only, in the file and its name', file.name === 'Press kit - Owl Parliament.html' && file.text.includes('Owl Parliament') && !OLD.test(file.text), file.name);
    ok('…and the press kit on screen', !OLD.test(await page.locator('.ac-paper').innerText()) && /Owl Parliament/.test(await page.locator('.ac-paper').innerText()));
    await page.click('#ac-tab-rider');
    await page.waitForSelector('#ac-in-csv');
    file = await dl(() => page.click('#ac-in-csv'));
    ok('the input list as a spreadsheet: the current name only', /Owl Parliament/.test(file.name) && !OLD.test(file.name + file.text), file.name);
    file = await dl(() => page.click('#ac-save-rider'));
    ok('the tech rider saved as a web page: the current name only', file.name === 'Tech rider - Owl Parliament.html' && file.text.includes('Owl Parliament') && !OLD.test(file.text), file.name);
    await openB(page, 'b-50');
    file = await dl(() => page.locator('.bk-actions button', { hasText: 'Add to calendar' }).click());
    ok('Add to calendar on a show from before the change: the current name only', /SUMMARY:Owl Parliament @ The Crown/.test(file.text) && !OLD.test(file.text) && !OLD.test(file.name), file.name);
    await go(page, 'money');
    await page.waitForSelector('#mn-csv-shows');
    // This year always has a show of the act (three days back, or five days on) and the invoice made a moment ago.
    const moneyText = [await page.locator('#page').innerText()];
    const csvs = [await dl(() => page.click('#mn-csv-shows')), await dl(() => page.click('#mn-csv-invoices'))];
    ok('the Money page names the act by its current name only', /Owl Parliament/.test(moneyText.join('\n')) && !OLD.test(moneyText.join('\n')), (moneyText.join('\n').match(/.{0,30}(Night Owls|formerly).{0,30}/) || [''])[0]);
    ok('the Money page’s spreadsheets carry the current name only', csvs.every(c => !OLD.test(c.text)) && /Owl Parliament/.test(csvs.map(c => c.text).join('\n')), csvs.map(c => c.name).join(' | '));

    /* a backup carries the earlier names and brings them back; Erase removes them */
    const backup = await store(page, s => s.exportJSON());
    const inFile = JSON.parse(backup).acts.find(x => x.id === 'f-act');
    ok('a backup file carries the earlier names', same(inFile.formerNames, [{ name: 'The Owls', until: D[-100] }, { name: 'The Night Owls', until: D[-10] }, { name: 'Owlets', until: '' }]), JSON.stringify(inFile.formerNames));
    await go(page, 'settings');
    await page.waitForSelector('#se-backups');
    if (!(await page.$eval('#se-backups', d => d.open))) await page.click('#se-backups-sum');
    await page.waitForSelector('#page .se-bk-save');
    file = await dl(() => page.click('#page .se-bk-save'));
    ok('…the one Settings saves too', same((JSON.parse(file.text).acts.find(x => x.id === 'f-act') || {}).formerNames, inFile.formerNames), file.name);
    await store(page, s => s.eraseAll());
    await sleep(300);
    ok('Erase removes them with everything else', (await store(page, s => s.db.acts.length)) === 0 && !/Night Owls|formerNames/.test(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tourbook-')).map(k => localStorage.getItem(k)).join('\n'))));
    await store(page, (s, text) => s.replaceAll(JSON.parse(text)), backup);
    await sleep(300);
    a = await actOf(page, 'f-act');
    ok('bringing the backup back brings the earlier names back', !!a && a.name === 'Owl Parliament' && same(a.formerNames, inFile.formerNames));
    await toList(page);
    await page.waitForSelector('.ac-card[data-id="f-act"]');
    ok('…and the card says “formerly” again', (await page.locator('.ac-card[data-id="f-act"] .ac-formerly').innerText()) === 'formerly The Night Owls');
    // an old backup, from before this was built: no formerNames anywhere
    const old = JSON.parse(backup); old.acts.forEach(x => { delete x.formerNames; });
    await store(page, (s, data) => s.replaceAll(data), old);
    await sleep(300);
    ok('an old backup, with no earlier names in it, reads as it always did', (await page.locator('.ac-formerly').count()) === 0 && !('formerNames' in (await actOf(page, 'f-act'))) && !/formerly|undefined/.test(await page.locator('#page').innerText()));
    await store(page, (s, text) => s.mergeIn(JSON.parse(text)), backup.replace(/"updatedAt": \d+/g, `"updatedAt": ${Date.now() + 5000}`));
    await sleep(300);
    ok('merging a newer backup brings them in', same((await actOf(page, 'f-act')).formerNames, inFile.formerNames));

    /* renamed twice in one day, the second answer given with a double click */
    await store(page, s => s.upsert('acts', { id: 'f-day', name: 'First Name', members: [] }));
    await openAct(page, 'f-day');
    // Every click that reaches the page under the sheets as the second of a double click.
    await page.evaluate(() => { window.__under = []; document.getElementById('app').addEventListener('click', e => { if (e.detail > 1) window.__under.push(e.target.id || e.target.className || e.target.tagName); }, true); });
    for (const [next, how] of [['Middle Name', 'click'], ['Last Name', 'dblclick']]) {
      const f = await editForm(page);
      await f.locator('input[data-key=name]').fill(next);
      await f.locator('button[type=submit]').click();
      await page.waitForSelector(PROMPT); await sleep(250);
      await page[how]('#ac-rename-new');
      await noSheet(page); await sleep(500);
    }
    const twice = await actOf(page, 'f-day'), now = await todayOf(page), todayLong = await longDay(page, now);
    ok('a double click on “It’s a new name” answers once, and its second click never reaches the page under the sheets',
      twice.name === 'Last Name' && same(twice.formerNames, [{ name: 'First Name', until: now }, { name: 'Middle Name', until: now }]) && same(await page.evaluate(() => window.__under), []) && same(await sheets(page), []) && (await page.locator('.ac-view .ac-title').textContent()) === 'Last Name',
      JSON.stringify([twice.formerNames, await page.evaluate(() => window.__under), await sheets(page)]));
    const day = await page.$$eval('#ac-names li', els => els.map(li => [li.querySelector('strong').textContent, li.querySelector('span').textContent]));
    ok('a name used for less than a day is listed with its one date, never “from … until …” the same day', same(day, [['Middle Name', `on ${todayLong}`], ['First Name', `until ${todayLong}`]]), JSON.stringify(day));
    // …and a double click on “Just fixing the spelling” the same
    const ff = await editForm(page);
    await ff.locator('input[data-key=name]').fill('Last Nane');
    await ff.locator('button[type=submit]').click();
    await page.waitForSelector(PROMPT); await sleep(250);
    await page.dblclick('#ac-rename-fix');
    await noSheet(page); await sleep(500);
    ok('…as does one on “Just fixing the spelling”', (await actOf(page, 'f-day')).name === 'Last Nane' && (await actOf(page, 'f-day')).formerNames.length === 2 && same(await page.evaluate(() => window.__under), []) && same(await sheets(page), []), JSON.stringify(await page.evaluate(() => window.__under)));

    ok('no errors in the console (changing a name)', errors.length === 0, errors.join(' | '));
    await browser.close();
  }

  /* ======================= 4. “Did you see them?” ======================= */
  {
    const { browser, page, errors } = await open({ ask: true });
    const D = await daysOf(page);
    await store(page, (s, D) => {
      s.upsert('acts', { id: 'f-act', name: 'Owl Parliament', color: '#22d3ee', formerNames: [{ name: 'The Owls', until: D[-100] }, { name: 'The Night Owls', until: D[-10] }] });
      s.upsert('acts', { id: 'f-junk', name: 'Clock Is Off', formerNames: [{ name: 'Tomorrow People', until: D[30] }] }); // a day still to come: only a clock set wrong, or a file edited by hand, gives one
      const show = (id, n, more = {}) => s.upsert('bookings', { id, kind: 'show', status: 'confirmed', actId: 'f-act', date: D[n], venueName: 'The Crown', setTime: '21:00', setLength: 45, ...more });
      show('q-before', -12); show('q-on', -10); show('q-after', -3); show('q-own', -11, { title: 'Album launch' });
      show('q-next', 3, { actId: 'f-junk' });
    }, D);
    await page.reload();
    await page.waitForSelector('.sheet[aria-label="Did you see them?"] .ac-ask-row');
    await sleep(200);
    const rows = await page.$$eval('.ac-ask-row', els => els.map(r => [r.dataset.id, r.querySelector('strong').textContent, (r.querySelector('.ac-formerly') || { textContent: '' }).textContent]));
    ok('the question lists each show under the act’s current name', rows.length === 4 && rows.every(r => r[1] === 'Owl Parliament'), JSON.stringify(rows));
    ok('…and a show from before the change adds “formerly” with the name that night', same(Object.fromEntries(rows.map(r => [r[0], r[2]])), { 'q-after': '', 'q-on': '', 'q-own': 'formerly The Night Owls', 'q-before': 'formerly The Night Owls' }), JSON.stringify(rows));
    ok('…right under the name, as part of the row’s words', await page.evaluate(() => { const r = document.querySelector('.ac-ask-row[data-id="q-before"]'), f = r.querySelector('.ac-formerly'); return f.previousElementSibling === r.querySelector('strong') && f.parentElement.classList.contains('ac-ask-main'); }));
    await page.click('#ac-ask-yes-q-before');
    await page.waitForSelector('.sheet[aria-label="Log a time seen"]');
    ok('Yes opens the score form under the current name', (await page.locator('.sheet[aria-label="Log a time seen"] .ac-form-act').innerText()).trim() === 'Owl Parliament');
    await page.locator('.sheet[aria-label="Log a time seen"] button[type=submit]').click();
    await page.waitForSelector('.sheet[aria-label="Log a time seen"]', { state: 'detached' });
    await sleep(250);
    ok('a scored row keeps its “formerly”', (await page.locator('.ac-ask-row[data-id="q-before"] .ac-formerly').innerText()) === 'formerly The Night Owls' && /Scored/.test(await page.locator('.ac-ask-row[data-id="q-before"]').innerText()));
    await page.click('#ac-ask-close');
    await sleep(250);
    // Coming up: a card can only be from before a change when the stored day is still to come
    const cardWas = await page.evaluate(() => { const c = document.querySelector('.bk-agenda .bk-card[data-id="q-next"]'), f = c && c.querySelector('.bk-formerly'); return f ? { text: f.textContent, under: f.previousElementSibling === c.querySelector('.bk-card-top') && f.parentElement === c.querySelector('.bk-card-main') } : null; });
    ok('Coming up: a card from before a change adds “formerly” under its name', !!cardWas && cardWas.text === 'formerly Tomorrow People' && cardWas.under, JSON.stringify(cardWas));
    await go(page, 'acts');
    await page.waitForSelector('.ac-card[data-id="f-junk"]');
    const dateChip = await page.locator('.ac-card[data-id="f-junk"] .ac-date').first().evaluate(el => [el.textContent, el.getAttribute('aria-label')]);
    ok('…and in the act’s own dates such a booking says “as …”, to a screen reader too', / · as Tomorrow People$/.test(dateChip[0]) && / · as Tomorrow People\. Open the booking$/.test(dateChip[1]), JSON.stringify(dateChip));
    await openAct(page, 'f-junk');
    ok('…and on its page', / · as Tomorrow People$/.test(await page.locator('#ac-coming .ac-bk .muted.small').first().innerText()), await page.locator('#ac-coming .ac-bk').first().innerText());
    await page.click('#ac-edit');
    await page.waitForSelector('.sheet[aria-label="Edit act"]');
    await page.fill('.sheet input[data-key=name]', 'Clock Is Right');
    await page.locator('.sheet[aria-label="Edit act"] .ac-was-until input').fill(D[-5]);
    await page.locator('.sheet[aria-label="Edit act"] button[type=submit]').click();
    await page.waitForSelector(PROMPT);
    const m2 = await page.evaluate(() => import('./js/util.js').then(u => { const i = document.getElementById('ac-rename-since'); return [i.min, i.max === u.todayISO(), i.value === u.todayISO()]; }));
    ok('the question takes the day the old name began from the form as it stands, not from what was stored', same(m2, [D[-5], true, true]), JSON.stringify(m2));
    await page.keyboard.press('Escape'); await sleep(150); await page.keyboard.press('Escape'); await sleep(200);
    ok('no errors in the console (the question)', errors.length === 0, errors.join(' | '));
    await browser.close();
  }

  /* ======================= 5. every role, in its own words ======================= */
  {
    const { browser, page, errors } = await open();
    const D = await daysOf(page);
    await store(page, (s, D) => {
      s.upsert('acts', { id: 'f-act', name: 'Owl Parliament', members: [], formerNames: [{ name: 'The Owls', until: D[-100] }, { name: 'The Night Owls', until: D[-10] }], seen: [{ id: 'e1', date: D[-40], where: 'The Bell', rating: 70 }] });
      s.upsert('acts', { id: 'f-solo', name: 'Sable Reed', members: [], formerNames: [{ name: 'Sable', until: D[-10] }] });
      s.upsert('bookings', { id: 'r-40', kind: 'show', status: 'confirmed', actId: 'f-act', date: D[-40], venueName: 'The Crown', setTime: '21:00' });
    }, D);
    const heading = { '': 'Acts', producer: 'Artists', manager: 'Roster', band: 'Bands', solo: 'My act', scout: 'Acts', audiophile: 'Bands' };
    for (const [id, name] of Object.entries(heading)) {
      const who = id || 'Everything';
      if (id) await role(page, id);
      await toList(page);
      await page.waitForSelector('.ac-card[data-id="f-act"]');
      ok(`${who}: the section is called ${name}, and the card says “formerly The Night Owls”`, (await page.textContent('.ac-page h1')) === name && (await page.locator('.ac-card[data-id="f-act"] .ac-formerly').innerText()) === 'formerly The Night Owls' && (await page.locator('.ac-card[data-id="f-solo"] .ac-formerly').innerText()) === 'formerly Sable');
      await openAct(page, 'f-act');
      ok(`${who}: the page says it under the name and lists the Earlier names`, (await page.locator('.ac-hero .ac-formerly').innerText()) === 'formerly The Night Owls' && (await page.locator('#ac-names li').count()) === 2 && (await page.textContent('#ac-h-names')) === 'Earlier names');
      if (await page.locator('#ac-seen').count()) ok(`${who}: the times seen on the page say “as The Night Owls”`, (await page.locator('#ac-seen .ac-as').innerText()) === 'as The Night Owls');
      const steps = await page.evaluate(() => import('./js/pages/acts.js').then(m => m.acts.tutorial().map(s => s.title)));
      ok(`${who}: the page’s walkthrough has the Earlier names step`, steps.includes('Earlier names'), steps.join(' › '));
      await openB(page, 'r-40');
      ok(`${who}: a show from before the change says “formerly” on its page`, (await page.locator('.bk-hero .bk-formerly').innerText()) === 'formerly The Night Owls');
    }
    // the words of the form and the question, as a solo artist and as a band read them: none says "band" to an artist
    for (const id of ['solo', 'band', 'manager', 'scout']) {
      await role(page, id);
      await openAct(page, 'f-solo');
      const form = await editForm(page);
      const part = await form.locator('.ac-was').innerText();
      await form.locator('input[data-key=name]').fill('Sable Reed Trio');
      await form.locator('button[type=submit]').click();
      await page.waitForSelector(PROMPT);
      const text = await page.locator(PROMPT).innerText(), pair = [await page.locator(PROMPT + ' .ac-rename-old').innerText(), await page.locator(PROMPT + ' .ac-rename-now').innerText()];
      const help = await page.evaluate(() => import('./js/tour.js').then(m => ['Edit act', 'New name?'].map(t => { const s = m.sheetSteps(t); return (typeof s === 'function' ? s() : s).map(x => x.text).join(' '); }).join(' ')));
      ok(`${id}: the Earlier names, the question and their walkthroughs fit a band and a solo artist alike`, !/\bbands?\b|\bartists?\b|\bthey\b|\bthem\b|\btheir\b/i.test(part + text) && /It’s a new name/.test(text) && /Just fixing the spelling/.test(text) && same(pair, ['Sable Reed', 'Sable Reed Trio']) && !/\bbands?\b|\bartists?\b/i.test(help.replace(/band or artist name/g, '')), part + ' ' + text + ' ' + help);
      await page.keyboard.press('Escape'); await sleep(150); await page.keyboard.press('Escape'); await sleep(200);
    }
    ok('no role’s question saved anything', (await actOf(page, 'f-solo')).name === 'Sable Reed' && same((await actOf(page, 'f-solo')).formerNames, [{ name: 'Sable', until: D[-10] }]));
    ok('no errors in the console (roles)', errors.length === 0, errors.join(' | '));
    await browser.close();
  }

  /* ======================= 6. a narrow phone, extra-large text and large buttons ======================= */
  {
    const prefs = `try { localStorage.setItem('tourbook-prefs', ${JSON.stringify(JSON.stringify({ text: 'xlarge', targets: 'large' }))}); } catch (e) { /* ignore */ }`;
    const { browser, page, errors } = await open({ viewport: { width: 320, height: 700 }, init: prefs, ask: true });
    const D = await daysOf(page);
    await store(page, (s, D) => {
      s.upsert('venues', { id: 'v1', kind: 'venue', name: 'The Old Customs House Ballroom' });
      s.upsert('acts', { id: 'f-act', name: 'Owl Parliament and the Midnight Assembly', color: '#ff5c8a', members: [], formerNames: [{ name: 'The Owls', until: D[-100] }, { name: 'The Extraordinarily Long-Named Night Owls Orchestra', until: D[-10] }],
        seen: [{ id: 'e1', date: D[-40], venueId: 'v1', rating: 70, notes: 'A long night.' }] });
      s.upsert('bookings', { id: 'n-40', kind: 'show', status: 'confirmed', actId: 'f-act', date: D[-40], venueId: 'v1', setTime: '21:00', setLength: 45 });
      s.upsert('bookings', { id: 'n-own', kind: 'show', status: 'done', actId: 'f-act', title: 'Album launch', date: D[-40], venueId: 'v1', setTime: '18:00' });
      s.upsert('bookings', { id: 'n-12', kind: 'show', status: 'confirmed', actId: 'f-act', date: D[-12], venueId: 'v1', setTime: '21:00', setLength: 45 });
    }, D);
    await page.reload();
    await page.waitForSelector('.sheet[aria-label="Did you see them?"] .ac-ask-row');
    await sleep(250);
    const is = await page.evaluate(() => ({ text: document.documentElement.dataset.text, hit: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit')), rem: parseFloat(getComputedStyle(document.documentElement).fontSize) }));
    ok('320px: extra-large text and large buttons are on', is.text === 'xlarge' && is.hit >= 54 && is.rem > 20, JSON.stringify(is));
    const sheetFit = () => page.evaluate(() => { const b = [...document.querySelectorAll('.sheet-body')].pop(); return b.scrollWidth <= b.clientWidth + 1; });
    const inside = (sel, box) => page.evaluate(([s, b]) => [...document.querySelectorAll(s)].every(el => { const a = el.getBoundingClientRect(), o = el.closest(b).getBoundingClientRect(); return a.width > 0 && a.left >= o.left - 0.5 && a.right <= o.right + 0.5; }), [sel, box]);
    ok('320px: the question’s rows keep “formerly” inside them, and nothing scrolls sideways', (await wide(page)) <= 320 && await sheetFit() && (await page.locator('.ac-ask-row .ac-formerly').count()) === 1 && await inside('.ac-ask-row .ac-formerly', '.ac-ask-row'), String(await wide(page)));
    await page.click('#ac-ask-close'); await sleep(250);
    await go(page, 'acts');
    await page.waitForSelector('.ac-card[data-id="f-act"]');
    await page.click('#ac-head-f-act'); await sleep(250);
    ok('320px: the card, with a long earlier name and its log open, does not push the page sideways', (await wide(page)) <= 320 && await inside('.ac-card .ac-formerly, .ac-card .ac-as', '.ac-card'), String(await wide(page)));
    await openAct(page, 'f-act');
    ok('320px: nor does the act’s page with its Earlier names', (await wide(page)) <= 320 && await inside('.ac-hero .ac-formerly', '.ac-hero') && await inside('#ac-names li > *', '#ac-names'), String(await wide(page)));
    const form = await editForm(page);
    await form.locator('#ac-was-add').scrollIntoViewIfNeeded();
    ok('320px: the Earlier names in the form fit, each ✕ a full-size button', await sheetFit() && (await wide(page)) <= 320 && await inside('.sheet .ac-was-row > *, .sheet #ac-was-add', '.sheet-body') && await form.locator('.ac-was-del').first().evaluate(el => { const r = el.getBoundingClientRect(); return r.width >= 54 && r.height >= 54; }));
    await form.locator('input[data-key=name]').fill('The Parliament of Owls and the Midnight Assembly');
    await form.locator('button[type=submit]').click();
    await page.waitForSelector(PROMPT);
    await sleep(250);
    ok('320px: the question fits, long names and all', await sheetFit() && (await wide(page)) <= 320 && await inside(PROMPT + ' .ac-rename-names > *, ' + PROMPT + ' .btn, #ac-rename-since', '.sheet-body'));
    await page.locator('#ac-rename-fix').scrollIntoViewIfNeeded();
    ok('320px: both answers can be reached', await page.locator('#ac-rename-new').isVisible() && await page.locator('#ac-rename-fix').isVisible());
    await page.keyboard.press('Escape'); await sleep(150); await page.keyboard.press('Escape'); await sleep(200);
    await openB(page, 'n-40');
    ok('320px: a show’s page with “formerly” under its name does not scroll sideways', (await wide(page)) <= 320 && await inside('.bk-hero .bk-formerly', '.bk-hero'), String(await wide(page)));
    await page.click('.bk-page .back-btn'); await page.waitForSelector('.bk-dayview');
    await page.click('#bk-view-week'); await sleep(300);
    const wkSaid = await page.locator(`.bk-cal-week .bk-day[data-date="${D[-40]}"]`).getAttribute('aria-label');
    ok('320px: nor does the Week, whose square says whose booking it was', (await wide(page)) <= 320 && (wkSaid.match(/formerly/g) || []).length === 2 && await inside('.bk-cal-week .bk-day', '.bk-cal-week'), `${await wide(page)} ${wkSaid}`);
    ok('no errors in the console (320px)', errors.length === 0, errors.join(' | '));
    await browser.close();
  }

  /* ======================= 7. junk in the stored field ======================= */
  {
    const { browser, page, errors } = await open();
    const D = await daysOf(page);
    await store(page, (s, D) => {
      const junk = [null, 7, 'x', { name: 12 }, { name: '' }, { until: D[-10] }, { name: 'No Day' }, { name: 'Bad Day', until: 'last spring' }, { name: 'Twice', until: D[-100] }, { name: 'TWICE', until: D[-100] }, { name: 'junk drawer', until: D[-5] }];
      s.upsert('acts', { id: 'j1', name: 'Junk Drawer', members: [], formerNames: junk, seen: [{ id: 'e1', date: D[-150], rating: 50 }] });
      s.upsert('acts', { id: 'j2', name: 'Not A List', members: [], formerNames: 'The Strings' });
      s.upsert('acts', { id: 'j3', name: 'An Object', members: [], formerNames: { name: 'Solo', until: D[-10] } });
      s.upsert('acts', { id: 'j4', members: [], formerNames: [{ name: 'Had A Name', until: D[-10] }] }); // no name now
      s.upsert('bookings', { id: 'jb', kind: 'show', status: 'done', actId: 'j1', date: D[-150], venueName: 'The Crown', setTime: '21:00' });
      s.upsert('bookings', { id: 'jb4', kind: 'show', status: 'done', actId: 'j4', date: D[-15], venueName: 'The Crown', setTime: '21:00' });
    }, D);
    await go(page, 'acts');
    await page.waitForSelector('.ac-card[data-id="j1"]');
    const text = await page.locator('#page').innerText();
    ok('the list draws with junk in the stored field, and never prints “undefined”', (await page.locator('.ac-card').count()) === 4 && !/undefined|null|NaN|\[object/.test(text), (text.match(/.{0,30}(undefined|null|NaN|\[object).{0,30}/) || [''])[0]);
    ok('…the card says “formerly” with the one name that is left (the last one, equal to the current name, is no change)', (await page.locator('.ac-card[data-id="j1"] .ac-formerly').innerText()) === 'formerly TWICE' && (await page.locator('.ac-card[data-id="j2"] .ac-formerly').count()) === 0 && (await page.locator('.ac-card[data-id="j3"] .ac-formerly').count()) === 0);
    await openAct(page, 'j1');
    const rows = await page.$$eval('#ac-names li', els => els.map(li => li.textContent));
    ok('…its page lists the names that can be read, the ones without a day as “date not known”', rows.length === 3 && /^TWICE/.test(rows[0]) && rows.slice(1).every(r => /date not known$/.test(r)) && !/undefined|Invalid/.test(rows.join(' ')), rows.join(' | '));
    const form = await editForm(page);
    ok('…and the form shows the same, ready to be put right', same(await form.locator('.ac-was-name').evaluateAll(els => els.map(e => e.value)), ['TWICE', 'Bad Day', 'No Day']) && same(await form.locator('.ac-was-until input').evaluateAll(els => els.map(e => e.value)), [D[-100], '', '']));
    await form.locator('button[type=submit]').click();
    await noSheet(page);
    ok('saving the form stores the cleaned list', same((await actOf(page, 'j1')).formerNames, [{ name: 'No Day', until: '' }, { name: 'Bad Day', until: '' }, { name: 'TWICE', until: D[-100] }]), JSON.stringify((await actOf(page, 'j1')).formerNames));
    await openB(page, 'jb');
    ok('a show from before it says “formerly” with a name that can be read', (await page.locator('.bk-hero .bk-formerly').innerText()) === 'formerly TWICE');
    await openB(page, 'jb4');
    ok('an act with no name now: its show still reads, and says the name it had', (await page.locator('.bk-hero .bk-formerly').innerText()) === 'formerly Had A Name' && !/undefined/.test(await page.locator('.bk-hero').innerText()));
    // an act whose stored name is empty: giving it one is no change of name, so nothing is asked
    await openAct(page, 'j4');
    ok('an act with no name shows as untitled, with the name it had under it', (await page.textContent('.ac-title')) === 'Untitled act' && (await page.locator('.ac-hero .ac-formerly').innerText()) === 'formerly Had A Name');
    const f4 = await editForm(page);
    await f4.locator('input[data-key=name]').fill('Named At Last');
    await f4.locator('button[type=submit]').click();
    await noSheet(page);
    const a4 = await actOf(page, 'j4');
    ok('naming an act whose name was empty asks nothing, and keeps its earlier name', (await sheets(page)).length === 0 && a4.name === 'Named At Last' && same(a4.formerNames, [{ name: 'Had A Name', until: D[-10] }]), JSON.stringify(a4.formerNames));
    await openB(page, 'jb4');
    await page.click('.bk-page .back-btn');
    await page.waitForSelector('.bk-dayview');
    for (const v of ['month', 'two', 'week', 'three', 'day']) { await page.click('#bk-view-' + v); await sleep(200); }
    ok('every view of the calendar draws the day of that show', (await page.locator('.bk-dayview .bk-ev[data-id="jb4"]').count()) === 1);
    // a stored day after today (a backup made a time zone ahead, a clock set wrong) never stops a save of something else
    await store(page, (s, D) => s.upsert('acts', { id: 'j5', name: 'Ahead Of Time', members: [], phone: '', formerNames: [{ name: 'Early Birds', until: D[3] }] }), D);
    await openAct(page, 'j5');
    const f5 = await editForm(page);
    await f5.locator('input[data-key=phone]').fill('0123 456');
    await f5.locator('button[type=submit]').click();
    await sleep(300);
    const a5 = await actOf(page, 'j5');
    ok('a stored day after today does not stop a save of the act: the phone is saved and the day is kept', (await sheets(page)).length === 0 && a5.phone === '0123 456' && same(a5.formerNames, [{ name: 'Early Birds', until: D[3] }]), JSON.stringify([await sheets(page), a5]));
    const f5b = await editForm(page);
    await f5b.locator('.ac-was-until input').fill(D[5]);
    await f5b.locator('button[type=submit]').click();
    await sleep(300);
    ok('…but a day typed after today is still refused there', same(await sheets(page), ['Edit act']) && await f5b.locator('.ac-was-until input').evaluate(el => el.validity.rangeOverflow) && (await actOf(page, 'j5')).formerNames[0].until === D[3]);
    await f5b.locator('.ac-was-until input').fill(D[3]);
    await f5b.locator('button[type=submit]').click();
    await sleep(300);
    ok('…and putting the stored day back lets it save again', (await sheets(page)).length === 0);
    ok('no errors in the console', errors.length === 0, errors.join(' | '));
    await browser.close();
  }
})().catch(e => { console.log('FAIL 44-formerly crashed — ' + e.message); process.exit(1); });
