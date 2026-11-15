// The booking form's band and venue boxes take typing (the owner, 15 Nov 2026: "You should be able to type into the band
// name or venue bar. If a name of either exists it'll show to be selected. If no band exists then you should be able to
// type in the name and venue yourself. Doing so should ask if you want to add one, the other, or both to your lists."):
// js/combo.js (the box: its markup, matching, keys, taps and the room for its list) and js/pages/bookings.js (the
// question "Add to your lists?", a typed band kept on the booking as client and read everywhere a booking's band is,
// "+ Add to Bands" on a gig's score row, the role's words). Both legs; its read-only check runs only in the on leg.
const fs = require('fs');
const { open, ok, sleep, typePick, toMonth } = require('../helpers.cjs');

const LEG = process.env.TOURBOOK_LICENCE === 'on' ? 'on' : 'off';
const DAY = 864e5, HOUR = 3600e3;
const store = (page, fn, arg) => page.evaluate(`import('./js/store.js').then(s => (${fn.toString()})(s, ${JSON.stringify(arg === undefined ? null : arg)}))`);
const dayIso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const sheetNamed = (page, t) => page.locator(`.sheet[aria-label="${t}"]`);
const setRole = async (page, id) => { await page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id); await sleep(400); };
const closeSheets = page => page.evaluate(() => import('./js/util.js').then(u => u.closeSheets())).then(() => sleep(200));
const newForm = async (page, kind, title) => {
  await closeSheets(page);
  await page.evaluate(k => import('./js/pages/bookings.js').then(m => m.newBooking({ kind: k })), kind);
  const f = sheetNamed(page, title); await f.waitFor(); await sleep(120); return f;
};
const box = (scope, key) => scope.locator(`input[role=combobox][data-key="${key}"]`);
const optNames = (scope, key) => scope.locator(`[id$="-${key}-list"] .cb-opt .cb-name`).allTextContents();
const listShown = (scope, key) => scope.locator(`[id$="-${key}-list"]`).isVisible();
const stateOf = (scope, key) => box(scope, key).evaluate(el => document.getElementById(el.getAttribute('aria-describedby')).innerText);
const counts = page => store(page, s => ({ acts: s.db.acts.length, venues: s.db.venues.length, bookings: s.db.bookings.length }));
const byTitle = (page, t) => page.evaluate(t => Promise.all([import('./js/store.js'), import('./js/model.js')]).then(([s, m]) => { const b = s.db.bookings.find(x => m.bookingTitle(x) === t); return b ? JSON.parse(JSON.stringify(b)) : null; }), t);
const actNamed = (page, n) => store(page, (s, n) => { const a = s.db.acts.find(x => x.name === n); return a ? JSON.parse(JSON.stringify(a)) : null; }, n);
const venueNamed = (page, n) => store(page, (s, n) => { const v = s.db.venues.find(x => x.name === n); return v ? JSON.parse(JSON.stringify(v)) : null; }, n);
const focusedIs = (page, sel) => page.evaluate(sel => !!document.activeElement && document.activeElement.matches(sel), sel);

(async () => {
  const { browser, page, errors } = await open({ sample: true, touch: true });
  await store(page, (s, past) => {
    s.upsert('acts', { id: 'c-owl', name: 'Owl Parliament', color: '#ffb020', formerNames: [{ name: 'The Old Owls', until: past }] });
    s.upsert('acts', { id: 'c-motor', name: 'Motörhead Tribute' });
    s.upsert('acts', { id: 'c-sabre', name: 'Sabre' });
    s.upsert('acts', { id: 'c-owlsley', name: 'Owlsley' });
  }, dayIso(-400));
  await sleep(200);

  /* ---- 1. the boxes ---- */
  let f = await newForm(page, 'show', 'New show');
  const marks = await f.evaluate(form => ['actId', 'venueId'].map(key => {
    const el = form.querySelector(`input[role=combobox][data-key="${key}"]`); if (!el) return null;
    const list = document.getElementById(el.getAttribute('aria-controls')), line = document.getElementById(el.getAttribute('aria-describedby')), all = el.parentNode.querySelector('.cb-all');
    return { label: (form.querySelector(`label[for="${el.id}"]`) || {}).textContent, auto: el.getAttribute('aria-autocomplete'), exp: el.getAttribute('aria-expanded'), role: list && list.getAttribute('role'), hidden: list && list.hidden,
      listName: list && list.getAttribute('aria-label'), line: !!line && line.classList.contains('cb-state'), spell: el.getAttribute('spellcheck'), spellOn: el.spellcheck, tab: all && all.getAttribute('tabindex'), all: all && all.getAttribute('aria-label') };
  }));
  ok('the band box is a text box with a list: labelled Act, aria-autocomplete list, closed, its list a hidden listbox “Your acts”, described by its line, no spell-check, ▾ out of the Tab order', JSON.stringify(marks[0]) === JSON.stringify({ label: 'Act', auto: 'list', exp: 'false', role: 'listbox', hidden: true, listName: 'Your acts', line: true, spell: 'false', spellOn: false, tab: '-1', all: 'All your acts' }), JSON.stringify(marks[0]));
  ok('…and the venue box the same, its list “Your venues”', JSON.stringify(marks[1]) === JSON.stringify({ label: 'Venue', auto: 'list', exp: 'false', role: 'listbox', hidden: true, listName: 'Your venues', line: true, spell: 'false', spellOn: false, tab: '-1', all: 'All your venues' }), JSON.stringify(marks[1]));
  const loose = [];
  for (const [kind, title] of [['show', 'New show'], ['session', 'New studio session'], ['rehearsal', 'New rehearsal'], ['other', 'New diary entry']]) {
    const g = await newForm(page, kind, title);
    loose.push(await g.evaluate(form => form.querySelectorAll('[data-key="venueName"], [data-key="client"], select[data-key="actId"], select[data-key="venueId"]').length));
  }
  ok('no form of any kind has a box of its own for a venue’s name or a client, nor a list to pick from', loose.every(n => n === 0), loose.join(','));

  /* ---- 2. matching ---- */
  f = await newForm(page, 'show', 'New show');
  await box(f, 'actId').fill('sa'); await sleep(80);
  let names = await optNames(f, 'actId');
  ok('“sa” lists Sable and Sabre, A to Z: the names that start with it', JSON.stringify(names) === JSON.stringify(['Sable', 'Sabre']), names.join(' | '));
  await box(f, 'actId').fill('motor'); await sleep(80);
  ok('“motor” finds Motörhead Tribute (no accents counted)', JSON.stringify(await optNames(f, 'actId')) === JSON.stringify(['Motörhead Tribute']));
  await box(f, 'actId').fill('OLD OWLS'); await sleep(80);
  const old = await f.locator('[id$="-actId-list"] .cb-opt').allTextContents();
  ok('“OLD OWLS” finds Owl Parliament by its earlier name, with “formerly The Old Owls” under it', JSON.stringify(old) === JSON.stringify(['Owl Parliamentformerly The Old Owls']), old.join(' | '));
  await box(f, 'actId').fill('owl'); await sleep(80);
  names = await optNames(f, 'actId');
  ok('“owl” lists Owl Parliament and Owlsley (they start with it) before The Night Owls (a word starts with it)', JSON.stringify(names) === JSON.stringify(['Owl Parliament', 'Owlsley', 'The Night Owls']), names.join(' | '));
  await box(f, 'actId').fill('owls night'); await sleep(80);
  ok('“owls night” finds The Night Owls: every word, in any order', JSON.stringify(await optNames(f, 'actId')) === JSON.stringify(['The Night Owls']));
  await box(f, 'actId').fill('zzz'); await sleep(80);
  ok('“zzz” closes the list', !(await listShown(f, 'actId')) && (await box(f, 'actId').getAttribute('aria-expanded')) === 'false');
  /* ---- 5. the count said aloud ---- */
  await box(f, 'actId').fill('sa'); await sleep(700);
  const liveId = (await box(f, 'actId').getAttribute('id')) + '-live';
  ok('the count is said aloud once the typing stops: “2 matches in your acts”', (await page.locator('#' + liveId).textContent()) === '2 matches in your acts');
  await box(f, 'actId').fill('zzz'); await sleep(700);
  ok('…and “No matches in your acts”', (await page.locator('#' + liveId).textContent()) === 'No matches in your acts');

  /* ---- 3. keys ---- */
  await box(f, 'actId').fill('sa'); await sleep(80);
  ok('typing opens the list with no option active', (await listShown(f, 'actId')) && (await box(f, 'actId').getAttribute('aria-expanded')) === 'true' && (await box(f, 'actId').getAttribute('aria-activedescendant')) === null);
  await page.keyboard.press('ArrowDown');
  const act0 = await box(f, 'actId').getAttribute('aria-activedescendant'), first = f.locator('[id$="-actId-list"] .cb-opt').first();
  ok('↓ makes the first option active (aria-activedescendant, aria-selected)', !!act0 && act0 === (await first.getAttribute('id')) && (await first.getAttribute('aria-selected')) === 'true');
  await page.keyboard.press('ArrowDown');
  const second = f.locator('[id$="-actId-list"] .cb-opt').nth(1);
  ok('↓ moves to the next, and only it is selected', (await box(f, 'actId').getAttribute('aria-activedescendant')) === (await second.getAttribute('id')) && (await first.getAttribute('aria-selected')) === 'false');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  ok('↑ back to the first, and ↑ from the first leaves none active', (await box(f, 'actId').getAttribute('aria-activedescendant')) === null && (await f.locator('[id$="-actId-list"] .cb-opt[aria-selected="true"]').count()) === 0);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await sleep(120);
  ok('Enter picks it without sending the form: the box says Sable, carries its id, the list is closed and the line says “✓ In your acts”',
    (await box(f, 'actId').inputValue()) === 'Sable' && (await box(f, 'actId').getAttribute('data-id')) === 's-sablea' && (await box(f, 'actId').getAttribute('aria-expanded')) === 'false' && await f.isVisible() && (await sheetNamed(page, 'Add to your lists?').count()) === 0 && (await stateOf(f, 'actId')) === '✓ In your acts', await stateOf(f, 'actId'));
  await box(f, 'actId').fill('sa'); await sleep(80);
  await page.keyboard.press('Escape'); await sleep(120);
  ok('Escape with the list open closes the list and leaves the sheet up', !(await listShown(f, 'actId')) && await f.isVisible());
  await page.keyboard.press('Escape'); await sleep(250);
  ok('…a second Escape closes the sheet', (await f.count()) === 0);
  f = await newForm(page, 'show', 'New show');
  const before = await counts(page);
  await box(f, 'actId').fill('sa'); await sleep(80);
  await page.keyboard.press('Enter'); await sleep(250);
  ok('Enter with the list open and none active only closes it', !(await listShown(f, 'actId')) && await f.isVisible() && (await sheetNamed(page, 'Add to your lists?').count()) === 0 && JSON.stringify(await counts(page)) === JSON.stringify(before));
  await box(f, 'actId').fill('sa'); await sleep(80);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab'); await sleep(80);
  ok('Tab with an option active picks it, and moves on', (await box(f, 'actId').inputValue()) === 'Sable' && (await box(f, 'actId').getAttribute('data-id')) === 's-sablea' && !(await focusedIs(page, 'input[data-key="actId"]')));

  /* ---- 4. exact typing ---- */
  await box(f, 'actId').fill('sable'); await sleep(80);
  ok('“sable” typed and not picked is Sable all the same: its id, the text as typed', (await box(f, 'actId').getAttribute('data-id')) === 's-sablea' && (await box(f, 'actId').inputValue()) === 'sable' && (await stateOf(f, 'actId')) === '✓ In your acts');
  await f.locator('[data-key="title"]').fill('Exact typing'); await f.locator('[data-key="date"]').fill(dayIso(30));
  await f.locator('button[type="submit"]').click(); await sleep(500);
  let rec = await byTitle(page, 'Exact typing');
  ok('…and the show is saved with that act and no typed name', rec && rec.actId === 's-sablea' && rec.client === '' && (await sheetNamed(page, 'Add to your lists?').count()) === 0, JSON.stringify(rec && { a: rec.actId, c: rec.client }));
  f = await newForm(page, 'show', 'New show');
  await box(f, 'actId').fill('the old owls'); await sleep(80);
  ok('“the old owls” is Owl Parliament, and the line says so', (await box(f, 'actId').getAttribute('data-id')) === 'c-owl' && (await stateOf(f, 'actId')) === '✓ In your acts, as Owl Parliament', await stateOf(f, 'actId'));

  /* ---- 6. ▾, and a tap ---- */
  await box(f, 'actId').fill('');
  await f.locator('input[data-key="actId"] + .cb-all').click(); await sleep(120);
  const nActs = (await counts(page)).acts;
  ok('▾ lists every act', (await f.locator('[id$="-actId-list"] .cb-opt').count()) === nActs && (await f.locator('input[data-key="actId"] + .cb-all').getAttribute('aria-expanded')) === 'true');
  const sabre = f.locator('[id$="-actId-list"] .cb-opt[data-id="c-sabre"]'), at = await sabre.boundingBox();
  await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2); await sleep(150);
  ok('a tap on an option picks it, and the box keeps the focus without the keyboard (inputmode none)', (await box(f, 'actId').inputValue()) === 'Sabre' && (await box(f, 'actId').getAttribute('data-id')) === 'c-sabre' && await focusedIs(page, 'input[data-key="actId"]') && (await box(f, 'actId').getAttribute('inputmode')) === 'none');
  await page.keyboard.press('End'); await sleep(50);
  ok('…which comes back at the next key', (await box(f, 'actId').getAttribute('inputmode')) === null);

  /* ---- 7. the venue ---- */
  await typePick(f, 'venueId', 'harb', 'Harbour Hall'); await sleep(120);
  ok('a saved venue picked by typing hides the address box and shows its address', !(await f.locator('[data-key="address"]').isVisible()) && /Pier Road/.test(await f.locator('.bk-venue-note').innerText()) && (await box(f, 'venueId').getAttribute('data-id')) === 's-harbour');
  await box(f, 'venueId').fill('lantern r'); await sleep(80);
  ok('…the box unlinked again as it is changed, its address box back', (await box(f, 'venueId').getAttribute('data-id')) === '' && await f.locator('[data-key="address"]').isVisible() && (await f.locator('.bk-venue-note').textContent()) === '');
  await typePick(f, 'venueId', 'lantern r', 'The Lantern Rooms'); await sleep(120);
  ok('…and an empty contact fills from the venue picked', (await f.locator('[data-key="contactName"]').inputValue()) === 'Rosa Lind' && (await f.locator('[data-key="contactPhone"]').inputValue()) === '+1 555 0170' && /Quay Street/.test(await f.locator('.bk-venue-note').innerText()));
  for (const k of ['contactName', 'contactPhone', 'contactEmail']) await f.locator(`[data-key="${k}"]`).fill('');
  await box(f, 'venueId').fill('The Moth Club'); await sleep(100);
  ok('a new name shows the address box and the line “Not in your venues yet. You’ll be asked whether to add it.”', await f.locator('[data-key="address"]').isVisible() && (await stateOf(f, 'venueId')) === 'Not in your venues yet. You’ll be asked whether to add it.' && (await box(f, 'venueId').getAttribute('data-id')) === '');

  /* ---- 8. the question, both new ---- */
  const D = dayIso(3);
  await box(f, 'actId').fill('New Band'); await sleep(60);
  await f.locator('[data-key="address"]').fill('Valette Street, Hackney');
  await f.locator('[data-key="date"]').fill(D);
  await f.locator('[data-key="setTime"]').fill('21:00');
  let n0 = await counts(page);
  await f.locator('button[type="submit"]').click();
  let q = sheetNamed(page, 'Add to your lists?'); await q.waitFor(); await sleep(250);
  const qs = await q.evaluate(el => ({ q: el.querySelector('#bk-add-q').textContent, why: el.querySelector('#bk-add-why').textContent, btns: [...el.querySelectorAll('button[id^="bk-add"]')].map(b => b.textContent), desc: el.getAttribute('aria-describedby'), focus: document.activeElement === el }));
  ok('both new: “Add to your lists?” asks about both, word for word', qs.q === '“New Band” and “The Moth Club” aren’t in your lists yet. Add them?' && qs.why === 'Once added, they’re there to pick next time. Whatever you choose, the show keeps both names.', JSON.stringify(qs));
  ok('…with Add both, Just the act, Just the venue, Neither and Back to the form', JSON.stringify(qs.btns) === JSON.stringify(['Add both', 'Just the act', 'Just the venue', 'Neither', 'Back to the form']), qs.btns.join(' | '));
  ok('…the dialog described by the question and its why, and no answer focused', qs.desc === 'bk-add-q bk-add-why' && qs.focus);
  await q.locator('#bk-add-back').click(); await sleep(200);
  ok('Back to the form: the form with both names, nothing stored, the focus in the band box', await f.isVisible() && (await box(f, 'actId').inputValue()) === 'New Band' && (await box(f, 'venueId').inputValue()) === 'The Moth Club' && JSON.stringify(await counts(page)) === JSON.stringify(n0) && await focusedIs(page, 'input[data-key="actId"]'));
  await f.locator('button[type="submit"]').click();
  q = sheetNamed(page, 'Add to your lists?'); await q.waitFor();
  await q.locator('#bk-add-none').click(); await page.waitForSelector('.bk-page .bk-hero'); await sleep(250);
  const typed = await byTitle(page, 'New Band @ The Moth Club');
  ok('Neither: nothing new in any list, the show kept with both as typed', typed && !typed.actId && typed.client === 'New Band' && !typed.venueId && typed.venueName === 'The Moth Club' && typed.address === 'Valette Street, Hackney' && JSON.stringify(await counts(page)) === JSON.stringify({ ...n0, bookings: n0.bookings + 1 }), JSON.stringify(typed));
  const TID = typed.id;
  // Just the act
  const colours = await store(page, s => s.db.acts.map(a => a.color));
  f = await newForm(page, 'show', 'New show');
  await box(f, 'actId').fill('Band Two'); await box(f, 'venueId').fill('Hall Two'); await f.locator('[data-key="address"]').fill('2 Hall Street');
  await f.locator('button[type="submit"]').click(); q = sheetNamed(page, 'Add to your lists?'); await q.waitFor();
  await q.locator('#bk-add-act').click(); await page.waitForSelector('.bk-page .bk-hero'); await sleep(250);
  let a2 = await actNamed(page, 'Band Two'); rec = await byTitle(page, 'Band Two @ Hall Two');
  ok('Just the act: one new act, in a colour no other act had, and the show linked to it', a2 && !colours.includes(a2.color) && (await store(page, s => s.db.acts.filter(a => a.name === 'Band Two').length)) === 1 && rec && rec.actId === a2.id && rec.client === '', JSON.stringify({ c: a2 && a2.color, colours }));
  ok('…the venue kept as typed, with its address', rec && rec.venueId === '' && rec.venueName === 'Hall Two' && rec.address === '2 Hall Street' && !(await venueNamed(page, 'Hall Two')));
  // Add both
  f = await newForm(page, 'show', 'New show');
  await box(f, 'actId').fill('Band Three'); await box(f, 'venueId').fill('Hall Three'); await f.locator('[data-key="address"]').fill('3 Hall Street\nTown');
  await f.locator('button[type="submit"]').click(); q = sheetNamed(page, 'Add to your lists?'); await q.waitFor();
  await q.locator('#bk-add-both').click(); await page.waitForSelector('.bk-page .bk-hero'); await sleep(250);
  const a3 = await actNamed(page, 'Band Three'), v3 = await venueNamed(page, 'Hall Three'); rec = await byTitle(page, 'Band Three @ Hall Three');
  ok('Add both: the act, and a venue of kind venue with the address typed and its house rules stored empty', a3 && v3 && v3.kind === 'venue' && v3.address === '3 Hall Street\nTown' && JSON.stringify(v3.rules) === '{}' && v3.rulesNote === '' && v3.rulesTone === '', JSON.stringify(v3));
  ok('…and the show linked to both, nothing typed left on it', rec && rec.actId === a3.id && rec.venueId === v3.id && rec.client === '' && rec.venueName === '' && rec.address === '', JSON.stringify(rec && { a: rec.actId, v: rec.venueId, c: rec.client, n: rec.venueName }));
  // A session's place is a studio, a rehearsal's a rehearsal room; one new: its own question
  f = await newForm(page, 'session', 'New studio session');
  await box(f, 'actId').fill('Juno'); await box(f, 'venueId').fill('Studio Nine');
  await f.locator('button[type="submit"]').click(); q = sheetNamed(page, 'Add to your lists?'); await q.waitFor();
  ok('a session’s question names the studio session', (await q.locator('#bk-add-why').textContent()) === 'Once added, they’re there to pick next time. Whatever you choose, the studio session keeps both names.');
  await q.locator('#bk-add-venue').click(); await page.waitForSelector('.bk-page .bk-hero'); await sleep(250);
  const v9 = await venueNamed(page, 'Studio Nine'); rec = await byTitle(page, 'Juno @ Studio Nine');
  ok('Just the venue on a session: a studio, linked, and the artist kept as typed', v9 && v9.kind === 'studio' && rec && rec.venueId === v9.id && rec.client === 'Juno' && !rec.actId && !(await actNamed(page, 'Juno')), JSON.stringify(v9 && v9.kind));
  /* ---- 9. one new ---- */
  f = await newForm(page, 'rehearsal', 'New rehearsal');
  await typePick(f, 'actId', 'owl', 'The Night Owls'); await box(f, 'venueId').fill('Room Nine');
  await f.locator('button[type="submit"]').click(); q = sheetNamed(page, 'Add to your lists?'); await q.waitFor();
  const one = await q.evaluate(el => ({ q: el.querySelector('#bk-add-q').textContent, why: el.querySelector('#bk-add-why').textContent, btns: [...el.querySelectorAll('button[id^="bk-add"]')].map(b => b.id + ':' + b.textContent) }));
  ok('one new (a venue): its own question, Yes, add it / No, keep it as typed / Back to the form', one.q === '“Room Nine” isn’t in your venues yet. Add it?' && one.why === 'Once added, it’s there to pick next time. Whatever you choose, the rehearsal keeps the name.' && JSON.stringify(one.btns) === JSON.stringify(['bk-add-yes:Yes, add it', 'bk-add-no:No, keep it as typed', 'bk-add-back:Back to the form']), JSON.stringify(one));
  await q.locator('#bk-add-yes').click(); await page.waitForSelector('.bk-page .bk-hero'); await sleep(250);
  const r9 = await venueNamed(page, 'Room Nine');
  ok('…Yes on a rehearsal: a rehearsal room, linked', r9 && r9.kind === 'rehearsal' && (await byTitle(page, 'The Night Owls @ Room Nine') || {}).venueId === r9.id);
  f = await newForm(page, 'show', 'New show');
  await box(f, 'actId').fill('Solo Band'); await typePick(f, 'venueId', 'lant', 'The Lantern Rooms');
  await f.locator('button[type="submit"]').click(); q = sheetNamed(page, 'Add to your lists?'); await q.waitFor();
  ok('one new (a band): ““Solo Band” isn’t in your acts yet. Add it?”', (await q.locator('#bk-add-q').textContent()) === '“Solo Band” isn’t in your acts yet. Add it?' && (await q.locator('#bk-add-why').textContent()) === 'Once added, it’s there to pick next time. Whatever you choose, the show keeps the name.');
  /* ---- 11. a double click on Yes, a held Enter ---- */
  n0 = await counts(page);
  await q.locator('#bk-add-yes').dblclick(); await sleep(500);
  ok('a double click on Yes saves one show and one act', JSON.stringify(await counts(page)) === JSON.stringify({ ...n0, acts: n0.acts + 1, bookings: n0.bookings + 1 }) && (await store(page, s => s.db.acts.filter(a => a.name === 'Solo Band').length)) === 1 && (await page.locator('.sheet').count()) === 0, JSON.stringify(await counts(page)));
  f = await newForm(page, 'show', 'New show');
  await box(f, 'actId').fill('Held Band'); await box(f, 'actId').focus();
  n0 = await counts(page);
  await page.keyboard.down('Enter'); await sleep(30);
  for (let i = 0; i < 6; i++) { await page.keyboard.down('Enter'); await sleep(40); }
  await page.keyboard.up('Enter'); await sleep(250);
  ok('a held Enter asks once, answers nothing and stores nothing', (await sheetNamed(page, 'Add to your lists?').count()) === 1 && await f.isVisible() && JSON.stringify(await counts(page)) === JSON.stringify(n0));
  await page.keyboard.press('Escape'); await sleep(200);
  ok('Escape on the question is Back to the form: nothing stored, the focus in the band box', (await sheetNamed(page, 'Add to your lists?').count()) === 0 && await f.isVisible() && await focusedIs(page, 'input[data-key="actId"]') && JSON.stringify(await counts(page)) === JSON.stringify(n0));

  /* ---- 10. edits ---- */
  await closeSheets(page);
  await page.evaluate(id => import('./js/pages/bookings.js').then(m => m.openBooking(id)), TID); await page.waitForSelector('.bk-page .bk-edit');
  await page.click('.bk-page .bk-edit'); f = sheetNamed(page, 'Edit show'); await f.waitFor(); await sleep(120);
  ok('an edit opens with the band and venue as typed, unlinked: “Typed, not picked from your acts.”', (await box(f, 'actId').inputValue()) === 'New Band' && (await box(f, 'actId').getAttribute('data-id')) === '' && (await stateOf(f, 'actId')) === 'Typed, not picked from your acts.' && (await stateOf(f, 'venueId')) === 'Typed, not picked from your venues.');
  await f.locator('[data-key="title"]').fill('');
  await f.locator('button[type="submit"]').click(); await sleep(400);
  ok('…saved keeping them asks nothing', (await sheetNamed(page, 'Add to your lists?').count()) === 0 && (await f.count()) === 0);
  await page.click('.bk-page .bk-edit'); f = sheetNamed(page, 'Edit show'); await f.waitFor(); await sleep(120);
  await box(f, 'actId').fill('New Band Two');
  await f.locator('button[type="submit"]').click(); await sleep(300);
  ok('…a changed name asks', (await sheetNamed(page, 'Add to your lists?').count()) === 1 && (await sheetNamed(page, 'Add to your lists?').locator('#bk-add-q').textContent()) === '“New Band Two” isn’t in your acts yet. Add it?');
  await closeSheets(page);
  const OLD = (await store(page, (s, d) => s.upsert('bookings', { kind: 'show', status: 'confirmed', date: d, actId: '', client: 'Sable', venueName: 'Somewhere', address: '' }).id, dayIso(12)));
  await page.evaluate(id => import('./js/pages/bookings.js').then(m => m.openBooking(id)), OLD); await page.waitForSelector('.bk-page .bk-edit');
  await page.click('.bk-page .bk-edit'); f = sheetNamed(page, 'Edit show'); await f.waitFor(); await sleep(120);
  ok('an old booking whose typed name is exactly a saved act’s opens unlinked', (await box(f, 'actId').inputValue()) === 'Sable' && (await box(f, 'actId').getAttribute('data-id')) === '');
  await f.locator('button[type="submit"]').click(); await sleep(400);
  rec = await store(page, (s, id) => s.byId('bookings', id), OLD);
  ok('…and stays so when saved untouched, with no question', rec.actId === '' && rec.client === 'Sable' && (await sheetNamed(page, 'Add to your lists?').count()) === 0);

  /* ---- 12. a session ---- */
  f = await newForm(page, 'session', 'New studio session');
  ok('a session has no “Artist or client” box: the act box says who the session is for', !(await f.locator('[data-key="client"]').count()) && (await box(f, 'actId').getAttribute('placeholder')) === 'Who the session is for' && !/Artist or client/.test(await f.innerText()));
  await box(f, 'actId').fill('Juno Two'); await sleep(60);
  await typePick(f, 'actId', 'sa', 'Sable'); await f.locator('[data-key="title"]').fill('Picked after typing');
  await f.locator('button[type="submit"]').click(); await sleep(500);
  rec = await byTitle(page, 'Picked after typing');
  ok('…a name typed, then an act picked: the act, and no typed name kept', rec && rec.actId === 's-sablea' && rec.client === '' && (await sheetNamed(page, 'Add to your lists?').count()) === 0, JSON.stringify(rec && { a: rec.actId, c: rec.client }));

  /* ---- 13. a typed band reads everywhere a booking's band reads ---- */
  await store(page, (s, d) => s.upsert('bookings', { id: 'c-clash', kind: 'show', status: 'confirmed', date: d, actId: 's-owls', venueId: 's-harbour', setTime: '21:00' }), D);
  await sleep(150);
  const reads = await page.evaluate(id => Promise.all(['./js/store.js', './js/model.js', './js/bookings-cal.js', './js/daysheet.js', './js/ics.js', './js/show-common.js', './js/pages/bookings.js', './js/search.js'].map(p => import(p))).then(async ([s, m, cal, ds, ics, sc, bk, se]) => {
    const b = s.byId('bookings', id);
    s.update(d => { d.profile.name = ''; d.profile.business = ''; d.profile.updatedAt = Date.now(); });
    await se.searchReady();
    const ical = ics.bookingIcs(b);
    const merged = s.mergeDb({ ...JSON.parse(s.exportJSON()), bookings: [] }, JSON.parse(s.exportJSON()));
    return {
      title: m.bookingTitle(b), card: cal.bookingCard(b).textContent, overlap: m.overlapText(s.byId('bookings', 'c-clash')),
      search: (se.searchAll('new band').gigs || []).includes(id), sheet: ds.daySheetData(b).title,
      ics: /SUMMARY:New Band @ The Moth Club/.test(ical) && /Artist: New Band/.test(ical.replace(/\r\n /g, '')),
      head: sc.docHead(b, 'Settlement')[0].querySelector('.cs-brand').textContent, copy: bk.copyOf(b, '2031-01-01').client,
      norm: s.normalise({ bookings: [{ id: 'x', kind: 'show', client: 42 }] }).bookings[0].client, merged: (merged.bookings.find(x => x.id === id) || {}).client,
    };
  }), TID);
  ok('the title: “New Band @ The Moth Club”, and the Coming up card says it', reads.title === 'New Band @ The Moth Club' && /New Band @ The Moth Club/.test(reads.card), reads.card);
  ok('another show that night overlaps with New Band', /Overlaps with New Band, 21:00/.test(reads.overlap), reads.overlap);
  ok('the search finds the show by the band typed', reads.search);
  ok('the day sheet, the calendar file (Artist: New Band) and a printed document’s head (no profile name: the band) read it', reads.sheet === 'New Band @ The Moth Club' && reads.ics && reads.head === 'New Band', JSON.stringify([reads.sheet, reads.head]));
  ok('a duplicate, the store’s clean-up of what is brought in (a number becomes text) and Google Drive’s merge keep it', reads.copy === 'New Band' && reads.norm === '42' && reads.merged === 'New Band', JSON.stringify([reads.copy, reads.norm, reads.merged]));
  await page.evaluate(id => import('./js/pages/bookings.js').then(m => m.openBooking(id)), TID); await page.waitForSelector('.bk-page .bk-hero'); await sleep(200);
  ok('the booking’s page shows the band typed in its act row', (await page.locator('.bk-act-row .bk-client').innerText()) === '🎙 New Band');
  await toMonth(page);
  const square = await page.locator(`.bk-day[data-date="${D}"]`).first().getAttribute('aria-label');
  ok('a day square’s spoken name says it', /New Band @ The Moth Club/.test(square || ''), square);
  // The shows' spreadsheet (Money), read from the saved file: a show today is always in this year's.
  await store(page, (s, d) => s.upsert('bookings', { kind: 'show', status: 'confirmed', date: d, client: 'Sheet Band', venueName: 'Sheet Hall' }), dayIso(0));
  await page.evaluate(() => window.logiGo('money')); await page.waitForSelector('#mn-csv-shows');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#mn-csv-shows')]);
  const csvText = fs.readFileSync(await dl.path(), 'utf8');
  ok('the shows’ spreadsheet has the band typed in its Act column', /,Sheet Band,Sheet Hall,/.test(csvText), csvText.split('\n').filter(l => /Sheet/.test(l)).join(' / '));
  const round = await store(page, (s, id) => { const file = s.exportJSON(); s.replaceAll(JSON.parse(file)); return s.byId('bookings', id).client; }, TID);
  ok('a backup file brought back keeps it', round === 'New Band', round);

  /* ---- 14. the score row, as the Audiophile ---- */
  await setRole(page, 'audiophile');
  const PAST = await store(page, (s, d) => s.upsert('bookings', { kind: 'show', status: 'confirmed', date: d, client: 'The Moths', venueName: 'The Moth Club', address: '' }).id, dayIso(-3));
  await page.evaluate(id => import('./js/pages/bookings.js').then(m => m.openBooking(id)), PAST); await page.waitForSelector('.bk-page .bk-hero'); await sleep(250);
  ok('a past gig with a band typed: “The Moths isn’t in your bands yet. Add them to score this show.” and “+ Add to Bands”', (await page.locator('.bk-score-typed .bk-score-text').innerText()) === 'The Moths isn’t in your bands yet. Add them to score this show.' && (await page.locator('#bk-score-add').innerText()) === '+ Add to Bands' && (await page.locator('#bk-score-add').getAttribute('aria-label')) === 'Add The Moths to your bands');
  const step = await page.evaluate(() => import('./js/pages/bookings.js').then(m => (m.bookings.tutorial().find(s => s.title === 'Score this show') || {}).text || ''));
  ok('…and its walkthrough step says to add them', step === 'Add them to your bands, and Score this show shows here: it logs the night on their card.', step);
  await page.click('#bk-score-add'); await sleep(500);
  const moths = await actNamed(page, 'The Moths'); rec = await store(page, (s, id) => s.byId('bookings', id), PAST);
  ok('a tap makes the band and links the gig', moths && rec.actId === moths.id && rec.client === '');
  ok('…says so, and the focus is on ★ Score The Moths', (await page.locator('.toast').allTextContents()).includes('The Moths is in your bands now.') && await focusedIs(page, '#bk-score') && /Score The Moths/.test(await page.locator('#bk-score').innerText()));
  const SAB = await store(page, (s, d) => s.upsert('bookings', { kind: 'show', status: 'confirmed', date: d, client: 'Sable', venueName: 'The Moth Club' }).id, dayIso(-4));
  await page.evaluate(id => import('./js/pages/bookings.js').then(m => m.openBooking(id)), SAB); await sleep(400);
  ok('with a saved band of that name, the “Pick the band” row stays', (await page.locator('#bk-score-act').count()) === 1 && (await page.locator('#bk-score-add').count()) === 0);

  /* ---- 15. the role's words ---- */
  for (const [role, label, many, word, noun] of [['audiophile', 'Band', 'bands', 'band', 'gig'], ['producer', 'Artist', 'artists', 'artist', 'show'], ['all', 'Act', 'acts', 'act', 'show'], ['scout', 'Act', 'acts', 'act', 'show']]) {
    await setRole(page, role);
    f = await newForm(page, 'show', 'New show');
    await box(f, 'actId').fill('Nobody Yet'); await box(f, 'venueId').fill('Nowhere Yet'); await sleep(60);
    const words = { label: (await f.locator('label[for$="-actId"]').innerText()).trim(), all: await f.locator('input[data-key="actId"] + .cb-all').getAttribute('aria-label'), line: await stateOf(f, 'actId') };
    await f.locator('button[type="submit"]').click(); q = sheetNamed(page, 'Add to your lists?'); await q.waitFor();
    Object.assign(words, { just: await q.locator('#bk-add-act').textContent(), why: await q.locator('#bk-add-why').textContent() });
    ok(`${role}: the box, its ▾, its line and the question in the role’s words (${label}, ${many}, “Just the ${word}”, “the ${noun} keeps…”)`, words.label === label && words.all === `All your ${many}` && words.line === `Not in your ${many} yet. You’ll be asked whether to add it.` && words.just === `Just the ${word}` && words.why === `Once added, they’re there to pick next time. Whatever you choose, the ${noun} keeps both names.`, JSON.stringify(words));
  }
  await closeSheets(page);
  await setRole(page, 'all');

  /* ---- 16. room for the list ---- */
  await page.setViewportSize({ width: 420, height: 560 }); await sleep(200);
  f = await newForm(page, 'show', 'New show');
  await box(f, 'venueId').scrollIntoViewIfNeeded(); await box(f, 'venueId').fill('a'); await sleep(200);
  const room = await f.evaluate(form => {
    const list = form.querySelector('[id$="-venueId-list"]'), r = list.getBoundingClientRect(), bar = form.querySelector('.form-actions').getBoundingClientRect();
    const hit = parseFloat(getComputedStyle(list).getPropertyValue('--hit'));
    return { top: r.top, bottom: r.bottom, h: r.height, bar: bar.top, vh: innerHeight, hit, shown: !list.hidden };
  });
  ok('on a short screen (a phone’s keyboard up) the open list is on screen, above the Save bar, at least two rows tall', room.shown && room.top >= 0 && room.bottom <= room.vh && room.bottom <= room.bar + 1 && room.h >= 2 * room.hit - 1, JSON.stringify(room));
  await page.setViewportSize({ width: 420, height: 900 }); await sleep(150);
  await closeSheets(page);
  // 320 px with extra-large text
  await page.evaluate(() => localStorage.setItem('tourbook-prefs', JSON.stringify({ text: 'xlarge' })));
  await page.setViewportSize({ width: 320, height: 640 }); await page.reload(); await page.waitForSelector('#deck .dk-next'); await sleep(200);
  f = await newForm(page, 'show', 'New show');
  await box(f, 'actId').fill('A band with a rather long name indeed'); await box(f, 'venueId').fill('o'); await sleep(150);
  const narrow = await f.evaluate(form => { const s = form.closest('.sheet').getBoundingClientRect(); return [...form.querySelectorAll('.cb input, .cb-list, .cb-opt')].filter(el => el.offsetParent).every(el => el.getBoundingClientRect().right <= s.right + 0.5 && el.getBoundingClientRect().left >= s.left - 0.5); });
  await f.locator('button[type="submit"]').click(); q = sheetNamed(page, 'Add to your lists?'); await q.waitFor(); await sleep(150);
  const wrap = await q.evaluate(el => { const s = el.getBoundingClientRect(); return [...el.querySelectorAll('.bk-add-answers .btn, #bk-add-q')].every(b => b.getBoundingClientRect().right <= s.right + 0.5) && document.documentElement.scrollWidth <= innerWidth; });
  ok('at 320 px with extra-large text: no box or list wider than the sheet, the answers wrap, no sideways scroll', narrow && wrap && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await closeSheets(page);
  await page.evaluate(() => localStorage.removeItem('tourbook-prefs'));

  /* ---- 18. pure ---- */
  const pure = await page.evaluate(() => Promise.all([import('./js/model.js'), import('./js/search.js'), import('./js/combo.js')]).then(([m, se, c]) => {
    const items = [{ id: 'a', name: 'Owl Parliament', names: ['Owl Parliament', 'The Night Owls'] }, { id: 'b', name: 'The Night Owls', names: ['The Night Owls'] }, { id: 'c', name: 'Night Owls Two', names: ['Night Owls Two'] }];
    return {
      same: m.fold === se.fold && m.actNames === se.actNames,
      rank: c.rankMatches(items, 'night owls').map(r => r.item.id + (r.earlier ? '*' : '')),
      exact: c.exactOf(items, 'THE NIGHT OWLS').id, kept: c.exactOf(items, 'the night owls', 'a').id, none: c.exactOf(items, '') === null && c.exactOf(items, 'night') === null,
      key: c.boxKey('  Motörhead   Tribute ') === 'motorhead tribute',
    };
  }));
  ok('the box compares names with the search’s own fold and actNames (now the model’s)', pure.same);
  ok('rankMatches: a name now before an earlier name of the same rank; exactOf: the name now first, the one picked kept while it fits, nothing for nothing', JSON.stringify(pure.rank) === JSON.stringify(['c', 'b', 'a*']) && pure.exact === 'b' && pure.kept === 'a' && pure.none && pure.key, JSON.stringify(pure));

  ok('no errors in the console', errors.length === 0, errors.join(' | '));
  await browser.close();

  /* ---- 17. read-only (the on leg): the licence's sheet, no question ---- */
  if (LEG === 'on') {
    const ended = { on: true, statusAt: Date.now(), first: Date.now() - 31 * DAY, seen: Date.now() - HOUR };
    const ro = await open({ init: `try { localStorage.setItem('tourbook-licence', ${JSON.stringify(JSON.stringify(ended))}); } catch (e) {}` });
    await ro.page.waitForSelector('.sheet.licence-over', { timeout: 8000 }).catch(() => {});
    await closeSheets(ro.page);
    const g = await newForm(ro.page, 'show', 'New show');
    await box(g, 'actId').fill('Read Only Band');
    await g.locator('button[type="submit"]').click(); await sleep(500);
    const shown = await ro.page.$$eval('.sheet', s => s.map(x => x.getAttribute('aria-label')));
    ok('read-only (free days over): Add with a new band brings the licence’s sheet, no question, and nothing is stored', shown.includes('Read-only until there is a licence') && !shown.includes('Add to your lists?') && JSON.stringify(await counts(ro.page)) === JSON.stringify({ acts: 0, venues: 0, bookings: 0 }), shown.join(' | '));
    ok('no errors in the console (read-only)', ro.errors.length === 0, ro.errors.join(' | '));
    await ro.browser.close();
  }
})().catch(e => { console.log('FAIL 14-typed-names crashed — ' + e.message); process.exit(1); });
