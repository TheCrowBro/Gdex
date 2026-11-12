// House rules on a venue: the House rules part of the venue form (four groups, seventeen rules, three states with one
// tap, a tick-box in each button, the keyboard, what Save stores and Cancel does not), the chip on a show's card and on the venue's card (green,
// amber or red, with its words for a screen reader), the full rules on the venue's sheet and on the show's page, the
// levels reached through the form, free text shown as text, the bookings that carry no rules, backups and junk, that
// nothing about house rules leaves in a day sheet or a calendar file, every role, 320px with extra-large text in light
// and dark, every theme's contrast, and the walkthroughs. The model's own sums are checked in 07-groundwork.
const { open, ok, sleep, go, toMonth } = require('../helpers.cjs');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const flat = s => String(s).replace(/\s*\n\s*/g, ' / ');
const sheetOf = t => `.sheet[aria-label="${t}"]`;
const sheetTitle = page => page.evaluate(() => { const all = document.querySelectorAll('.sheet[aria-label]'); return all.length ? all[all.length - 1].getAttribute('aria-label') : ''; });
// The store and the model, kept on the page for the checks (again after every reload).
const hook = page => page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/model.js'), import('./js/pages/venues.js'), import('./js/venues-rules.js')]).then(([s, m, v, r]) => { window.__s = s; window.__m = m; window.__v = v; window.__r = r; }));
const rec = (page, list, id) => page.evaluate(([l, i]) => { const r = window.__s.byId(l, i); return r ? JSON.parse(JSON.stringify(r)) : null; }, [list, id]);
const put = async (page, list, r) => { await page.evaluate(([l, x]) => { window.__s.upsert(l, x); }, [list, r]); await sleep(200); };
const dayFromNow = (page, n) => page.evaluate(n => import('./js/util.js').then(u => { const d = new Date(); d.setDate(d.getDate() + n); return u.ymd(d); }), n);
const openB = async (page, id) => { await page.evaluate(x => import('./js/pages/bookings.js').then(m => m.openBooking(x)), id); await page.waitForSelector('.bk-page'); await sleep(350); };
const setRole = async (page, id) => { await page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id); await sleep(400); };
const wide = page => page.evaluate(() => document.documentElement.scrollWidth);
// To the calendar with Coming up under it (Bookings keeps an open booking open within a visit).
const toCal = async page => { await go(page, 'bookings'); await toMonth(page); await page.waitForSelector('.bk-agenda .bk-card'); };
// Tap like a person: bring it to the middle of the sheet (clear of the form's Save bar), then click.
const tap = async (page, sel) => { await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await sleep(40); await page.click(sel); };

// A chip as drawn: its colour, what it shows, what a screen reader hears, and what it is made of. null when there is none.
const chip = (page, sel) => page.evaluate(s => {
  const c = document.querySelector(s + ' .vn-chip'); if (!c) return null;
  const shown = c.querySelector(':scope > [aria-hidden=true]'), said = c.querySelector(':scope > .sr-only');
  return { level: ['ok', 'some', 'strict'].filter(l => c.classList.contains('vn-chip-' + l)).join(), label: shown ? shown.textContent : '', spoken: said ? said.textContent : '', tag: c.tagName, kids: c.children.length, controls: c.querySelectorAll('button, a, input, select').length };
}, sel);
const chips = (page, sel) => page.locator(sel + ' .vn-chip').count();
// The full rules as drawn: the head line, the chip and the rows of the list.
const full = (page, sel) => page.evaluate(s => {
  const r = document.querySelector(s + ' .vn-rules'); if (!r) return null;
  const head = r.querySelector('.vn-rules-head strong'), dl = r.querySelector('dl.vn-rules-list');
  return { show: r.classList.contains('vn-rules-show'), head: head ? head.textContent : '', headShown: !!head && head.offsetParent !== null, chips: r.querySelectorAll('.vn-chip').length,
    rows: dl ? [...dl.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]) : null, controls: r.querySelectorAll('button, a, input, select, textarea').length, marked: r.querySelectorAll('b, i, em, script').length };
}, sel);

/* ------------------------------- the form's part ------------------------------- */
const FORM = { add: sheetOf('Add venue'), edit: sheetOf('Edit venue') };
// Which answer a rule shows: 'yes', 'no' or '' (a pick-list: its value).
const shows = (page, id) => page.evaluate(id => {
  const row = [...document.querySelectorAll('.sheet .vn-rule')].filter(r => r.dataset.rule === id).pop();
  const sel = row.querySelector('select'); if (sel) return sel.value;
  return [...row.querySelectorAll('button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.id.split('-').pop()).join('+');
}, id);
const press = (page, id, ans) => tap(page, `#vn-rule-${id}-${ans}`);
const pick = async (page, id, value) => { await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), '#vn-rule-' + id); await page.selectOption('#vn-rule-' + id, value); };
const openEdit = async (page, id) => { await page.evaluate(i => { window.__v.editVenue({ id: i }); }, id); await page.waitForSelector(FORM.edit + ' .vn-rules-edit'); await sleep(250); };
const saveForm = async (page, which = 'edit') => { await page.click(FORM[which] + ' button[type=submit]'); await sleep(300); };
// Edit a venue's rules through its form: clear every answer, then set the ones given, the note and How strict.
async function setRules(page, id, { answers = {}, note = '', tone = '' } = {}) {
  await openEdit(page, id);
  const all = await page.evaluate(() => window.__m.HOUSE_RULES.map(r => [r.id, r.kind]));
  for (const [rule, kind] of all) {
    const want = answers[rule] || '', now = await shows(page, rule);
    if (now === want) continue;
    if (kind === 'pick') await pick(page, rule, want);
    else await press(page, rule, want || now); // a tap on the pressed one clears it
  }
  await page.fill(FORM.edit + ' [data-key=rulesNote]', note);
  await page.selectOption(FORM.edit + ' [data-key=rulesTone]', tone);
  await saveForm(page);
}
// The titles a walkthrough shows, stepping through it to the end.
async function tourTitles(page) {
  const out = [];
  await page.waitForSelector('.tour-card h2');
  for (let i = 0; i < 60 && await page.locator('.tour-card').count(); i++) { out.push({ title: await page.textContent('#tour-title'), text: await page.textContent('.tour-card .tour-body p') }); await page.click('.tour-actions .btn.primary'); await sleep(450); }
  if (await page.locator('.tour-card').count()) { await page.keyboard.press('Escape'); await sleep(200); }
  return out;
}

const all = []; // every console error of every browser below
(async () => {
  /* ======================= an empty Gdex: the form, the owner's example, the levels ======================= */
  {
    const { browser, page, errors } = await open({ tab: 'venues' });
    const warns = []; page.on('console', m => { if (m.type() === 'warning' && /house rules/i.test(m.text())) warns.push(m.text()); });
    await page.waitForSelector('#page .vn-head');
    await hook(page);
    const M = await page.evaluate(() => ({ groups: window.__m.RULE_GROUPS, rules: window.__m.HOUSE_RULES.map(r => ({ id: r.id, group: r.group, kind: r.kind, label: r.label, icon: r.icon, options: r.options || null })), tones: window.__m.RULE_TONES }));

    /* ---------------- the block in the form ---------------- */
    await page.click('#vn-first');
    await page.waitForSelector(FORM.add + ' .vn-rules-edit');
    const order = await page.$$eval(FORM.add + ' form > *', els => els.map(f => (f.classList.contains('vn-rules-edit') ? 'HOUSE RULES' : (f.querySelector('[data-key]') || { dataset: {} }).dataset.key || (f.querySelector('.place') ? 'geo' : f.className))));
    const at = order.indexOf('noiseLimit');
    ok('the House rules block is in the form after the noise limit, then Other house rules and How strict', at > 0 && same(order.slice(at, at + 5), ['noiseLimit', 'HOUSE RULES', 'rulesNote', 'rulesTone', 'stage']), order.join(' '));
    const F = await page.evaluate(sel => {
      const ed = document.querySelector(sel + ' .vn-rules-edit');
      return {
        cls: ed.className, title: ed.querySelector(':scope > .vn-rules-title').textContent, hint: ed.querySelector(':scope > small.muted').textContent,
        groups: [...ed.querySelectorAll(':scope > fieldset.vn-rules-group')].map(f => ({ legend: f.querySelector(':scope > legend').textContent, rules: [...f.querySelectorAll(':scope > .vn-rule')].map(r => r.dataset.rule) })),
        rules: [...ed.querySelectorAll('.vn-rule')].map(r => {
          const sel = r.querySelector('select'), name = r.querySelector(':scope > .vn-rule-name');
          return { id: r.dataset.rule, role: r.getAttribute('role'), label: r.getAttribute('aria-label'), name: name.textContent.trim(), icon: (name.querySelector('[aria-hidden=true]') || {}).textContent || '',
            btns: [...r.querySelectorAll('button')].map(b => { const box = b.querySelector('.vn-rule-mark'); return { id: b.id, type: b.type, pressed: b.getAttribute('aria-pressed'), words: b.querySelector('.vn-rule-says').textContent, mark: box.textContent, markHidden: box.getAttribute('aria-hidden'), markShown: getComputedStyle(box.firstElementChild).visibility !== 'hidden', box: box.getBoundingClientRect().width >= 10 && parseFloat(getComputedStyle(box).borderTopWidth) >= 1 }; }),
            sel: sel ? { id: sel.id, label: sel.getAttribute('aria-label'), value: sel.value, opts: [...sel.options].map(o => [o.value, o.textContent]) } : null };
        }),
      };
    }, FORM.add);
    ok('…a wide field titled House rules that says how to answer', /\bfield\b/.test(F.cls) && /\bwide\b/.test(F.cls) && F.title === 'House rules' && F.hint === 'Tap what you know: Allowed or Not allowed, Yes or No. Tap it again to clear it. Rules you leave alone stay off the card.', F.hint);
    ok('…with the four groups by name, in order', same(F.groups.map(g => g.legend), M.groups.map(g => g[1])) && F.groups.length === 4, F.groups.map(g => g.legend).join(' | '));
    ok('…and the seventeen rules, each in its group', F.rules.length === 17 && same(F.groups.map(g => g.rules), M.groups.map(g => M.rules.filter(r => r.group === g[0]).map(r => r.id))), F.groups.map(g => g.rules.length).join('+'));
    ok('each rule is a group named by its label, with its picture kept from a screen reader', F.rules.every((r, i) => r.role === 'group' && r.label === M.rules[i].label && r.name === `${M.rules[i].icon} ${M.rules[i].label}` && r.icon === M.rules[i].icon), JSON.stringify(F.rules.filter((r, i) => r.label !== M.rules[i].label || r.name !== `${M.rules[i].icon} ${M.rules[i].label}`).map(r => [r.label, r.name])));
    const pairs = F.rules.filter((r, i) => M.rules[i].kind !== 'pick'), lists = F.rules.filter((r, i) => M.rules[i].kind === 'pick');
    ok('a permission has Allowed and Not allowed, a fact Yes and No: plain buttons, none pressed at first', pairs.length === 15 && pairs.every(r => { const k = M.rules.find(x => x.id === r.id).kind, w = k === 'allow' ? ['Allowed', 'Not allowed'] : ['Yes', 'No'];
      return r.btns.length === 2 && r.btns[0].id === `vn-rule-${r.id}-yes` && r.btns[1].id === `vn-rule-${r.id}-no` && r.btns.every((b, j) => b.type === 'button' && b.pressed === 'false' && b.words === w[j]); }), JSON.stringify(pairs.find(r => r.btns.some(b => b.pressed !== 'false')) || ''));
    ok('…each with a tick-box that is empty until it is pressed, kept from a screen reader', pairs.every(r => r.btns.every((b, j) => b.box && !b.markShown && b.markHidden === 'true' && b.mark === '✓✕'[j])), JSON.stringify(pairs.find(r => r.btns.some(b => !b.box || b.markShown)) || ''));
    ok('the age limit and seated-or-standing are short lists that start on Don’t know', lists.length === 2 && lists.every(r => { const m = M.rules.find(x => x.id === r.id); return r.sel && r.sel.id === 'vn-rule-' + r.id && r.sel.label === m.label && r.sel.value === '' && same(r.sel.opts, [['', 'Don’t know'], ...m.options]) && r.btns.length === 0; }), JSON.stringify(lists.map(r => r.sel)));
    ok('How strict offers Automatic, Relaxed, Some rules and Strict, on Automatic', same(await page.$$eval(FORM.add + ' [data-key=rulesTone] option', os => os.map(o => [o.value, o.textContent])), M.tones) && (await page.inputValue(FORM.add + ' [data-key=rulesTone]')) === '');
    ok('…and its label and the note’s say what they are for', (await page.locator(FORM.add + ' .field', { hasText: 'How strict' }).locator('label').innerText()) === 'How strict' && /green, amber or red/.test(await page.locator(FORM.add + ' .field', { hasText: 'How strict' }).innerText())
      && (await page.locator(FORM.add + ' label', { hasText: 'Other house rules' }).count()) === 1 && (await page.getAttribute(FORM.add + ' [data-key=rulesNote]', 'placeholder')) === 'e.g. No re-entry after 11pm. Coats in the cloakroom.');

    /* ---------------- three states with one tap ---------------- */
    await press(page, 'proCameras', 'yes');
    ok('a tap on Allowed presses it', (await shows(page, 'proCameras')) === 'yes');
    const mark = id => page.$eval('#' + id, b => ({ shown: getComputedStyle(b.querySelector('.vn-rule-mark > span')).visibility !== 'hidden', mark: b.querySelector('.vn-rule-mark').textContent }));
    // Every size in the block: a press must change none of them (the tick-box is always there).
    const sizes = sel => page.evaluate(s => JSON.stringify([...document.querySelectorAll(s + ' .vn-rules-edit, ' + s + ' .vn-rule, ' + s + ' .vn-rule-btn, ' + s + ' .vn-rule-says')].map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })), sel);
    const atRest = await sizes(FORM.add);
    ok('…and its box shows a tick', same(await mark('vn-rule-proCameras-yes'), { shown: true, mark: '✓' }) && !(await mark('vn-rule-proCameras-no')).shown);
    ok('…with nothing on the form changing size', (await sizes(FORM.add)) === atRest);
    await press(page, 'proCameras', 'no');
    ok('a tap on Not allowed moves the press', (await shows(page, 'proCameras')) === 'no');
    ok('…and its box shows a cross, the tick gone, the sizes as they were', same(await mark('vn-rule-proCameras-no'), { shown: true, mark: '✕' }) && !(await mark('vn-rule-proCameras-yes')).shown && (await sizes(FORM.add)) === atRest);
    await press(page, 'proCameras', 'no');
    ok('a tap on the pressed one clears it: Don’t know again, both boxes empty', (await shows(page, 'proCameras')) === '' && !(await mark('vn-rule-proCameras-no')).shown && !(await mark('vn-rule-proCameras-yes')).shown);
    ok('the form stays as it was drawn (the answers live in the block)', (await sheetTitle(page)) === 'Add venue' && (await page.locator(FORM.add + ' .vn-rule').count()) === 17);

    /* ---------------- keyboard ---------------- */
    await page.focus('#vn-rule-phones-yes');
    await page.keyboard.press('Space');
    ok('Space presses the button in focus, and the focus stays', (await shows(page, 'phones')) === 'yes' && (await page.evaluate(() => document.activeElement.id)) === 'vn-rule-phones-yes');
    await page.keyboard.press('Space');
    ok('Space again clears it', (await shows(page, 'phones')) === '' && (await page.evaluate(() => document.activeElement.id)) === 'vn-rule-phones-yes');
    await page.keyboard.press('Enter');
    ok('Enter presses it too, without sending the form', (await shows(page, 'phones')) === 'yes' && (await sheetTitle(page)) === 'Add venue' && (await page.evaluate(() => window.__s.db.venues.length)) === 0);
    await page.keyboard.press('Tab');
    ok('Tab goes on to Not allowed', (await page.evaluate(() => document.activeElement.id)) === 'vn-rule-phones-no');
    await page.keyboard.press('Tab');
    ok('…and then to the next rule', (await page.evaluate(() => document.activeElement.id)) === 'vn-rule-video-yes');

    /* ---------------- the owner's example: The Church, no pro cameras, phones and point-and-shoots fine ---------------- */
    await page.fill(FORM.add + ' [data-key=name]', 'The Church');
    await press(page, 'proCameras', 'no');
    await press(page, 'compacts', 'yes');
    await pick(page, 'age', '21');
    await pick(page, 'age', ''); // back to Don’t know
    await press(page, 'cashOnly', 'yes'); await press(page, 'cashOnly', 'yes'); // answered, then cleared
    await saveForm(page, 'add');
    const churchId = await page.evaluate(() => (window.__s.db.venues.find(v => v.name === 'The Church') || {}).id);
    let church = await rec(page, 'venues', churchId);
    ok('Save stores only the answers that are known, in the rules’ order', !!church && JSON.stringify(church.rules) === '{"proCameras":"no","compacts":"yes","phones":"yes"}', JSON.stringify(church && church.rules));
    ok('…a rule left alone, or answered and cleared again, is not in it', !!church && !('video' in church.rules) && !('age' in church.rules) && !('cashOnly' in church.rules));
    ok('…with an empty note and Automatic', !!church && church.rulesNote === '' && church.rulesTone === '');
    const want = { level: 'some', label: '📷 Pro cameras ✗', spoken: 'House rules: Pro cameras not allowed', tag: 'SPAN', kids: 2, controls: 0 };
    ok('The Church’s card has an amber chip: “📷 Pro cameras ✗”', same(await chip(page, '#vn-' + churchId), want), JSON.stringify(await chip(page, '#vn-' + churchId)));
    const cardLines = await page.$$eval(`#vn-${churchId} > *`, els => els.map(e => e.className.split(' ').find(c => c.startsWith('vn-')) || e.className));
    ok('…on a line of its own on the card', cardLines.includes('vn-chip') && cardLines.indexOf('vn-chip') > cardLines.indexOf('vn-card-top') && (await page.$eval(`#vn-${churchId} .vn-chip`, c => !c.closest('.vn-fact') && !c.closest('.vn-facts'))), cardLines.join(' '));
    const D3 = await dayFromNow(page, 3), D4 = await dayFromNow(page, 4), D6 = await dayFromNow(page, 6), D9 = await dayFromNow(page, 9), PAST = await dayFromNow(page, -4);
    await put(page, 'acts', { id: 'cw', name: 'Chelsea Wolfe', color: '#8a5cff' });
    await put(page, 'bookings', { id: 'cw1', kind: 'show', status: 'confirmed', actId: 'cw', date: D3, venueId: churchId, doors: '19:00', setTime: '20:00', setLength: 75 });
    await toCal(page);
    ok('Chelsea Wolfe’s show at The Church carries the chip on its card', same(await chip(page, '.bk-agenda .bk-card[data-id="cw1"]'), want), JSON.stringify(await chip(page, '.bk-agenda .bk-card[data-id="cw1"]')));
    const edge = await page.$eval('.bk-agenda .bk-card[data-id="cw1"]', c => ({ edge: getComputedStyle(c).borderLeftColor, tag: c.tagName, direct: !!c.querySelector('.bk-card-main > .vn-chip') }));
    ok('…the card’s left edge is still the act’s colour, and the chip is a line of the card (a span in a button)', edge.edge === 'rgb(138, 92, 255)' && edge.tag === 'BUTTON' && edge.direct, JSON.stringify(edge));
    await openB(page, 'cw1');
    let f = await full(page, '.bk-hero');
    ok('the show’s page has the rules in full: not allowed, allowed', !!f && f.show && f.head === 'House rules at The Church' && f.headShown && f.chips === 1 && same(f.rows, [['Not allowed', 'Pro cameras'], ['Allowed', 'Point-and-shoots · Phones']]), JSON.stringify(f));
    ok('…with the same chip, and nothing to press inside', same(await chip(page, '.bk-hero .vn-rules'), want) && f.controls === 0);

    /* ---------------- editing: what shows, Cancel, Save ---------------- */
    await go(page, 'venues');
    await page.click('#vn-' + churchId);
    await page.waitForSelector('.vn-sheet');
    await page.click('#vn-edit');
    await page.waitForSelector(FORM.edit + ' .vn-rules-edit'); await sleep(250);
    const state = async ids => { const out = {}; for (const id of ids) out[id] = await shows(page, id); return out; };
    ok('Edit shows the stored answers pressed and the rest on Don’t know', same(await state(['proCameras', 'compacts', 'phones', 'video', 'age', 'cashOnly', 'floor']), { proCameras: 'no', compacts: 'yes', phones: 'yes', video: '', age: '', cashOnly: '', floor: '' }), JSON.stringify(await state(['proCameras', 'compacts', 'phones', 'video', 'age', 'cashOnly', 'floor'])));
    const change = async () => {
      await pick(page, 'age', '18'); await press(page, 'idNeeded', 'yes'); await pick(page, 'floor', 'both'); await press(page, 'earplugs', 'no');
      await page.fill(FORM.edit + ' [data-key=rulesNote]', '  Coats in the cloakroom.\nNo re-entry after 11pm.  ');
    };
    await change();
    await page.selectOption(FORM.edit + ' [data-key=rulesTone]', 'strict');
    await page.locator(FORM.edit + ' .form-actions .btn', { hasText: 'Cancel' }).click(); await sleep(250);
    ok('Cancel stores nothing', same(await rec(page, 'venues', churchId), church) && (await page.locator(FORM.edit).count()) === 0);
    await page.click('#vn-edit');
    await page.waitForSelector(FORM.edit + ' .vn-rules-edit'); await sleep(250);
    ok('…and the form opens again on what is stored', same(await state(['age', 'idNeeded', 'floor', 'earplugs']), { age: '', idNeeded: '', floor: '', earplugs: '' }) && (await page.inputValue(FORM.edit + ' [data-key=rulesNote]')) === '' && (await page.inputValue(FORM.edit + ' [data-key=rulesTone]')) === '');
    await change();
    await saveForm(page);
    church = await rec(page, 'venues', churchId);
    ok('Save stores the lists’ choices and the facts beside the permissions', JSON.stringify(church.rules) === '{"proCameras":"no","compacts":"yes","phones":"yes","age":"18","idNeeded":"yes","floor":"both","earplugs":"no"}', JSON.stringify(church.rules));
    ok('…and the note, trimmed, with its lines kept', church.rulesNote === 'Coats in the cloakroom.\nNo re-entry after 11pm.' && church.rulesTone === '' && church.name === 'The Church');
    const more = { level: 'some', label: '📷 Pro cameras ✗ · 3 more', spoken: 'House rules: Pro cameras not allowed, and 3 more', tag: 'SPAN', kids: 2, controls: 0 };
    ok('the open sheet follows the edit: the chip counts the age limit, the ID and the note', same(await chip(page, '.vn-sheet .vn-rules-sec'), more), JSON.stringify(await chip(page, '.vn-sheet .vn-rules-sec')));
    f = await full(page, '.vn-sheet .vn-rules-sec');
    ok('…and the sheet lists them all, the note last with its lines', !!f && !f.show && same(f.rows, [['Not allowed', 'Pro cameras'], ['Allowed', 'Point-and-shoots · Phones'], ['Good to know', '18+ · ID needed · Seated and standing · Earplugs not needed'], ['Other rules', 'Coats in the cloakroom.\nNo re-entry after 11pm.']]), JSON.stringify(f));
    ok('the note keeps its line breaks on screen', (await page.$eval('.vn-sheet .vn-rules-list dd:last-child', d => getComputedStyle(d).whiteSpace)) === 'pre-wrap');
    await page.click('#vn-edit');
    await page.waitForSelector(FORM.edit + ' .vn-rules-edit'); await sleep(250);
    await page.fill(FORM.edit + ' [data-key=capacity]', '400');
    await saveForm(page);
    const kept = await rec(page, 'venues', churchId);
    ok('saving another field of the venue keeps its house rules as they were', kept.capacity === 400 && JSON.stringify(kept.rules) === JSON.stringify(church.rules) && kept.rulesNote === church.rulesNote && kept.rulesTone === '', JSON.stringify([kept.capacity, kept.rules]));
    const sec = await page.evaluate(() => { const s = document.querySelector('.vn-sheet .vn-rules-sec'); return { tag: s.tagName, h3: s.querySelector(':scope > h3').textContent, after: s.previousElementSibling.className, said: s.querySelectorAll('h3').length + [...s.querySelectorAll('.vn-rules-head strong')].filter(x => x.offsetParent !== null).length }; });
    ok('the sheet’s House rules section comes after Details, and says “House rules” once', sec.tag === 'SECTION' && sec.h3 === 'House rules' && /vn-details/.test(sec.after) && sec.said === 1, JSON.stringify(sec));
    await page.keyboard.press('Escape'); await sleep(200);

    /* ---------------- a venue with no rules ---------------- */
    await page.click('#vn-add');
    await page.waitForSelector(FORM.add + ' .vn-rules-edit');
    await page.fill(FORM.add + ' [data-key=name]', 'Plain Hall');
    await saveForm(page, 'add');
    const plainId = await page.evaluate(() => (window.__s.db.venues.find(v => v.name === 'Plain Hall') || {}).id);
    const plain = await rec(page, 'venues', plainId);
    ok('a venue saved with nothing answered still stores all three fields, empty', !!plain && same(plain.rules, {}) && !Array.isArray(plain.rules) && plain.rulesNote === '' && plain.rulesTone === '', JSON.stringify(plain));
    await put(page, 'venues', { id: 'never', kind: 'venue', name: 'Never Asked' }); // as stored before house rules existed
    await put(page, 'bookings', { id: 'pl1', kind: 'show', status: 'confirmed', actId: 'cw', date: D4, venueId: plainId, setTime: '21:00' });
    ok('no rules: no chip on the venue’s card', (await chips(page, '#vn-' + plainId)) === 0 && (await chips(page, '#vn-never')) === 0 && (await page.locator('#page .vn-chip').count()) === 1);
    await page.click('#vn-' + plainId);
    await page.waitForSelector('.vn-sheet');
    ok('…its sheet says none are noted yet, and what Edit adds', (await page.locator('.vn-sheet .vn-rules-sec p.muted.small').innerText()) === 'No house rules noted yet. Edit adds what is allowed in, what is not, and anything unusual.' && (await page.locator('.vn-sheet .vn-rules').count()) === 0 && (await chips(page, '.vn-sheet')) === 0);
    await page.keyboard.press('Escape'); await sleep(200);
    await toCal(page);
    ok('…no chip on a show there', (await page.locator('.bk-agenda .bk-card[data-id="pl1"]').count()) === 1 && (await chips(page, '.bk-agenda .bk-card[data-id="pl1"]')) === 0);
    await openB(page, 'pl1');
    ok('…and nothing about rules on the show’s page', (await page.locator('.bk-page .vn-rules, .bk-page .vn-chip').count()) === 0);
    await page.click('#helpBtn');
    let tour = await tourTitles(page);
    ok('the booking’s walkthrough skips House rules when the venue has none', tour.length > 3 && tour.some(s => s.title === 'Times') && !tour.some(s => s.title === 'House rules'), tour.map(s => s.title).join(', '));
    await openB(page, 'cw1');
    await page.click('#helpBtn');
    tour = await tourTitles(page);
    const ti = tour.findIndex(s => s.title === 'House rules');
    ok('…and shows it, after Times, when the venue has some', ti > 0 && tour[ti - 1].title === 'Times' && /belong to the venue and apply to every show there/.test(tour[ti].text), tour.map(s => s.title).join(', '));

    /* ---------------- the levels, through the form ---------------- */
    await put(page, 'venues', { id: 'club9', kind: 'venue', name: 'Club 9' });
    await put(page, 'bookings', { id: 'c91', kind: 'show', status: 'hold', actId: 'cw', date: D6, venueId: 'club9', setTime: '00:30', setLength: 60 });
    await go(page, 'venues');
    const level = async opts => { await setRules(page, 'club9', opts); const c = await chip(page, '#vn-club9'); return c ? [c.level, c.label, c.spoken] : null; };
    let got = await level({ answers: { phones: 'no' } });
    ok('phones Not allowed: red', same(got, ['strict', '📱 Phones ✗', 'House rules: Phones not allowed']), JSON.stringify(got));
    got = await level({ answers: { proCameras: 'no', compacts: 'no', phones: 'yes' } });
    ok('pro cameras and point-and-shoots Not allowed: red, “No cameras”', same(got, ['strict', '📷 No cameras', 'House rules: No cameras']), JSON.stringify(got));
    got = await level({ answers: { proCameras: 'no', compacts: 'no', phones: 'no', bags: 'no' } });
    ok('…with phones too: “No phones or cameras”, and the rest counted', same(got, ['strict', '📵 No phones or cameras · 1 more', 'House rules: No phones or cameras, and 1 more']), JSON.stringify(got));
    got = await level({ answers: { proCameras: 'no', compacts: 'yes', phones: 'yes' } });
    ok('pro cameras only: amber (phones and point-and-shoots are fine)', same(got, ['some', '📷 Pro cameras ✗', 'House rules: Pro cameras not allowed']), JSON.stringify(got));
    got = await level({ answers: { phones: 'yes', age: 'all', cashOnly: 'no', earplugs: 'yes', floor: 'standing' } });
    ok('answers that restrict nothing: green, “No restrictions”', same(got, ['ok', 'No restrictions', 'House rules: No restrictions']), JSON.stringify(got));
    got = await level({ answers: { age: '21' } });
    ok('an age limit alone: amber, in its own words', same(got, ['some', '🔞 21+', 'House rules: Age limit 21+']), JSON.stringify(got));
    const NOTE = 'Ask at the door about cameras, it changes show by show';
    got = await level({ note: NOTE });
    ok('a note only: amber, with the start of the note', same(got, ['some', '📝 Ask at the door about…', 'House rules: Note: Ask at the door about…']), JSON.stringify(got));
    ok('…stored with no answers', same((await rec(page, 'venues', 'club9')).rules, {}) && (await rec(page, 'venues', 'club9')).rulesNote === NOTE);
    got = await level({ answers: { phones: 'yes' }, note: NOTE });
    ok('phones Allowed and a note: amber too, the chip showing the start of the note', same(got, ['some', '📝 Ask at the door about…', 'House rules: Note: Ask at the door about…']), JSON.stringify(got));
    await toCal(page);
    ok('…on the show’s card as well', same(await chip(page, '.bk-agenda .bk-card[data-id="c91"]'), { level: 'some', label: '📝 Ask at the door about…', spoken: 'House rules: Note: Ask at the door about…', tag: 'SPAN', kids: 2, controls: 0 }));
    await openB(page, 'c91');
    f = await full(page, '.bk-hero');
    ok('…and the whole note under Other rules on the show’s page', !!f && f.head === 'House rules at Club 9' && same(f.rows, [['Allowed', 'Phones'], ['Other rules', NOTE]]), JSON.stringify(f));
    await go(page, 'venues');
    got = await level({ answers: { phones: 'yes' }, tone: 'strict' });
    ok('How strict set to Strict on a venue with nothing restricted: red, “Strict”', same(got, ['strict', 'Strict', 'House rules: Strict']) && (await rec(page, 'venues', 'club9')).rulesTone === 'strict', JSON.stringify(got));
    got = await level({ answers: { phones: 'yes' }, tone: 'some' });
    ok('…to Some rules: amber, “Some rules”', same(got, ['some', 'Some rules', 'House rules: Some rules']), JSON.stringify(got));
    got = await level({ answers: { proCameras: 'no', flash: 'no' }, tone: 'relaxed' });
    ok('Relaxed on a restricted venue: green, with the same words', same(got, ['ok', '📷 Pro cameras ✗ · 1 more', 'House rules: Pro cameras not allowed, and 1 more']), JSON.stringify(got));
    await openEdit(page, 'club9');
    ok('the form shows the colour that was set by hand', (await page.inputValue(FORM.edit + ' [data-key=rulesTone]')) === 'relaxed');
    await page.locator(FORM.edit + ' .form-actions .btn', { hasText: 'Cancel' }).click(); await sleep(200);
    got = await level({ answers: { proCameras: 'no', flash: 'no' } });
    ok('…and Automatic works it out again: amber', same(got, ['some', '📷 Pro cameras ✗ · 1 more', 'House rules: Pro cameras not allowed, and 1 more']) && (await rec(page, 'venues', 'club9')).rulesTone === '', JSON.stringify(got));
    got = await level({ tone: 'strict' });
    await page.click('#vn-club9'); await page.waitForSelector('.vn-sheet');
    f = await full(page, '.vn-sheet .vn-rules-sec');
    ok('a colour set by hand and nothing else: the chip alone, with no list under it', same(got, ['strict', 'Strict', 'House rules: Strict']) && !!f && f.chips === 1 && f.rows === null, JSON.stringify([got, f]));
    await page.keyboard.press('Escape'); await sleep(200);

    /* ---------------- free text is text ---------------- */
    const RAW = '<b>No bags</b> after 11';
    got = await level({ note: RAW });
    ok('a note typed with markup shows those characters on the chip', same(got, ['some', '📝 ' + RAW, 'House rules: Note: ' + RAW]), JSON.stringify(got));
    await page.click('#vn-club9'); await page.waitForSelector('.vn-sheet');
    f = await full(page, '.vn-sheet .vn-rules-sec');
    ok('…and in the full rules, and adds no element', !!f && same(f.rows, [['Other rules', RAW]]) && f.marked === 0 && (await page.locator('.vn-chip b, .vn-rules b, .vn-card b').count()) === 0, JSON.stringify(f));
    await page.keyboard.press('Escape'); await sleep(200);

    /* ---------------- junk in the stored fields ---------------- */
    await page.evaluate(() => window.__s.update(d => {
      d.venues.push({ id: 'j-text', kind: 'venue', name: 'Junk Text', rules: 'no cameras', rulesNote: 7, rulesTone: 'loud' });
      d.venues.push({ id: 'j-list', kind: 'venue', name: 'Junk List', rules: ['no'], rulesNote: null });
      d.venues.push({ id: 'j-part', kind: 'venue', name: 'Junk Part', rules: { nope: 'yes', phones: 'maybe', age: '16', bags: 'no' }, rulesTone: 'loud' });
      for (const [id, v] of [['jb1', 'j-text'], ['jb2', 'j-list'], ['jb3', 'j-part']]) d.bookings.push({ id, kind: 'show', status: 'confirmed', actId: 'cw', date: d.bookings.find(b => b.id === 'cw1').date, venueId: v });
    }));
    await sleep(300);
    ok('rules that are not a set of answers draw no chip', (await chips(page, '#vn-j-text')) === 0 && (await chips(page, '#vn-j-list')) === 0 && (await page.locator('#vn-j-text').count()) === 1);
    ok('an unknown rule and an unknown answer are left out: the chip is for what is known', same(await chip(page, '#vn-j-part'), { level: 'some', label: '🎒 Bags ✗', spoken: 'House rules: Bags not allowed', tag: 'SPAN', kids: 2, controls: 0 }), JSON.stringify(await chip(page, '#vn-j-part')));
    await toCal(page);
    ok('…and their shows’ cards follow', (await chips(page, '.bk-agenda .bk-card[data-id="jb1"]')) === 0 && (await chips(page, '.bk-agenda .bk-card[data-id="jb2"]')) === 0 && (await chips(page, '.bk-agenda .bk-card[data-id="jb3"]')) === 1);
    await openB(page, 'jb1');
    ok('…a show at such a venue opens with no rules', (await page.locator('.bk-hero').count()) === 1 && (await page.locator('.bk-page .vn-rules').count()) === 0);
    await go(page, 'venues');
    await openEdit(page, 'j-text');
    ok('the form opens on junk as on nothing: no answer, no note, Automatic', (await page.locator(FORM.edit + ' .vn-rule-btn[aria-pressed=true]').count()) === 0 && (await page.inputValue(FORM.edit + ' [data-key=rulesNote]')) === '' && (await page.inputValue(FORM.edit + ' [data-key=rulesTone]')) === '');
    await saveForm(page);
    const cleaned = await rec(page, 'venues', 'j-text');
    ok('…and Save stores it clean', same(cleaned.rules, {}) && cleaned.rulesNote === '' && cleaned.rulesTone === '', JSON.stringify([cleaned.rules, cleaned.rulesNote, cleaned.rulesTone]));
    await openEdit(page, 'j-part');
    ok('a venue with some junk shows what is known', (await shows(page, 'bags')) === 'no' && (await shows(page, 'phones')) === '' && (await shows(page, 'age')) === '' && (await page.inputValue(FORM.edit + ' [data-key=rulesTone]')) === '');
    await saveForm(page);
    ok('…and Save keeps only that', JSON.stringify((await rec(page, 'venues', 'j-part')).rules) === '{"bags":"no"}' && (await rec(page, 'venues', 'j-part')).rulesTone === '');

    /* ---------------- a backup, there and back ---------------- */
    await setRules(page, 'club9', { answers: { phones: 'no', age: '21', strobes: 'yes' }, note: 'Pouches at the door.', tone: 'some' });
    const before = await rec(page, 'venues', 'club9');
    const back = await page.evaluate(() => { const s = window.__s, json = s.exportJSON(); s.replaceAll({ venues: [], bookings: [], acts: [] }); const gone = s.db.venues.length; s.replaceAll(JSON.parse(json)); return { gone, json: json.length }; });
    await sleep(300);
    const after = await rec(page, 'venues', 'club9');
    ok('a backup round trip keeps the answers, the note and the colour', back.gone === 0 && !!after && same(after.rules, before.rules) && after.rulesNote === 'Pouches at the door.' && after.rulesTone === 'some', JSON.stringify(after && [after.rules, after.rulesNote, after.rulesTone]));
    ok('…and the chip comes back with them', same((c => c && [c.level, c.label])(await chip(page, '#vn-club9')), ['some', '📱 Phones ✗ · 3 more']), JSON.stringify(await chip(page, '#vn-club9')));
    const merged = await page.evaluate(() => { const s = window.__s, copy = JSON.parse(s.exportJSON()); const v = copy.venues.find(x => x.id === 'club9'); v.rules = { phones: 'yes' }; v.rulesNote = ''; v.rulesTone = ''; v.updatedAt = Date.now() + 5000; s.mergeIn(copy); return JSON.parse(JSON.stringify(s.byId('venues', 'club9'))); });
    await sleep(300);
    ok('merging a newer copy of the venue brings its rules with it', same(merged.rules, { phones: 'yes' }) && merged.rulesNote === '' && same((c => c && [c.level, c.label])(await chip(page, '#vn-club9')), ['ok', 'No restrictions']));

    ok('no house-rules fault was logged along the way', warns.length === 0, warns.join(' | '));
    ok('no errors in the console (the form and the levels)', errors.length === 0, errors.slice(0, 5).join(' | ')); all.push(...errors);
    await browser.close();
  }

  /* ======================= the sample: cards, sheets, the show's page, who carries rules ======================= */
  {
    const { browser, page, errors } = await open({ sample: true });
    const warns = []; page.on('console', m => { if (m.type() === 'warning' && /house rules/i.test(m.text())) warns.push(m.text()); });
    await page.waitForSelector('.bk-agenda .bk-card');
    await hook(page);
    const LANTERN = { level: 'some', label: '📷 Pro cameras ✗ · 1 more', spoken: 'House rules: Pro cameras not allowed, and 1 more', tag: 'SPAN', kids: 2, controls: 0 };
    const HARBOUR = { level: 'ok', label: 'No restrictions', spoken: 'House rules: No restrictions', tag: 'SPAN', kids: 2, controls: 0 };
    const card = id => `.bk-agenda .bk-card[data-id="${id}"]`;

    /* ---------------- Coming up ---------------- */
    ok('the Lantern Rooms show’s card has an amber chip reading “📷 Pro cameras ✗ · 1 more”, with its spoken words', same(await chip(page, card('s-show1')), LANTERN), JSON.stringify(await chip(page, card('s-show1'))));
    ok('Harbour Hall’s has a green “No restrictions”', same(await chip(page, card('s-show2')), HARBOUR), JSON.stringify(await chip(page, card('s-show2'))));
    const look = await page.evaluate(() => {
      const probe = document.createElement('i'); document.body.append(probe);
      const token = t => { probe.style.color = `var(${t})`; return getComputedStyle(probe).color; };
      const of = id => { const c = document.querySelector(`.bk-agenda .bk-card[data-id="${id}"]`), chip = c.querySelector('.vn-chip'), dot = getComputedStyle(chip, '::before'), cs = getComputedStyle(chip);
        return { edge: getComputedStyle(c).borderLeftColor, dot: dot.backgroundColor, dotSize: [dot.width, dot.height, dot.borderTopLeftRadius], words: cs.color, round: parseFloat(cs.borderTopLeftRadius) > 100, border: cs.borderTopWidth + ' ' + cs.borderTopStyle,
          text: chip.querySelector('[aria-hidden=true]').textContent, name: /Lantern|Harbour/.test(chip.textContent), line: chip.parentElement.classList.contains('bk-card-main'), inButton: !!chip.closest('button.bk-card') }; };
      const out = { a: of('s-show1'), b: of('s-show2'), amber: token('--amber'), ok: token('--ok'), text: token('--text') };
      probe.remove(); return out;
    });
    ok('the card’s left edge is still the act’s colour', look.a.edge === 'rgb(255, 92, 138)' && look.b.edge === 'rgb(255, 92, 138)', look.a.edge);
    ok('the chip has a round dot of its colour before the words: amber, green', look.a.dot === look.amber && look.b.dot === look.ok && look.amber !== look.ok && same(look.a.dotSize, ['8px', '8px', '50%']), JSON.stringify([look.a.dot, look.amber, look.b.dot, look.ok, look.a.dotSize]));
    ok('…its words in the text colour, in a round outline', look.a.words === look.text && look.a.round && look.a.border === '1px solid', JSON.stringify([look.a.words, look.a.border]));
    ok('…it never holds the venue’s name, and sits in the card as one of its lines', !look.a.name && !look.b.name && look.a.line && look.b.line && look.a.inButton);
    ok('the card is still counted once by its venue’s name', (await page.locator('.bk-agenda .bk-card', { hasText: 'Lantern Rooms' }).count()) === 1);
    const named = await page.locator(card('s-show1')).ariaSnapshot();
    ok('a screen reader hears the rule as part of the card’s name, in words', /House rules: Pro cameras not allowed, and 1 more/.test(named) && !/✗/.test(named), named.split('\n')[0]);
    ok('a session, a rehearsal and a show at a venue with no rules have no chip', (await chips(page, card('s-sess1'))) === 0 && (await chips(page, card('s-reh'))) === 0 && (await chips(page, card('s-fest'))) === 0 && (await page.locator(card('s-fest')).count()) === 1);
    ok('two chips in Coming up, one a card', (await page.locator('.bk-agenda .vn-chip').count()) === 2);

    /* ---------------- the show's page ---------------- */
    await openB(page, 's-show1');
    let f = await full(page, '.bk-hero');
    ok('the show’s page lists Not allowed, Allowed and Good to know', !!f && f.show && same(f.rows, [['Not allowed', 'Pro cameras · Flash'], ['Allowed', 'Point-and-shoots · Phones'], ['Good to know', 'Earplugs advised']]), JSON.stringify(f));
    ok('…headed “House rules at The Lantern Rooms”, with the chip', f.head === 'House rules at The Lantern Rooms' && f.headShown && same(await chip(page, '.bk-hero .vn-rules'), LANTERN));
    const where = await page.evaluate(() => { const r = document.querySelector('.bk-hero .vn-rules'), kids = [...r.parentElement.children]; const i = kids.indexOf(r); return { parent: r.parentElement.className, before: kids.slice(0, i).map(k => k.className).filter(c => /bk-venue/.test(c)), after: kids.slice(i + 1).map(k => k.className) }; });
    ok('…under the venue and its checks, above the act', /bk-hero/.test(where.parent) && where.before.includes('bk-venue') && where.before.some(c => /bk-venue-info/.test(c)) && /bk-act-row/.test(where.after[0] || ''), JSON.stringify(where));
    ok('…with no control inside (the header is press-and-hold)', f.controls === 0);
    ok('the venue’s own checks are as they were: one line for this show', (await page.evaluate(() => window.__v.venueWarnings(window.__s.byId('bookings', 's-show1')).length)) === 1);
    await openB(page, 's-past');
    f = await full(page, '.bk-hero');
    ok('a past show there has them too', !!f && f.head === 'House rules at The Lantern Rooms' && f.rows.length === 3 && (await page.evaluate(() => !!window.__r.rulesChip(window.__s.byId('bookings', 's-past')))));
    await openB(page, 's-sess1');
    ok('a session’s page has none', (await page.locator('.bk-hero').count()) === 1 && (await page.locator('.bk-page .vn-rules, .bk-page .vn-chip').count()) === 0);

    /* ---------------- the venues: cards and sheets ---------------- */
    await go(page, 'venues'); await page.waitForSelector('#vn-s-lantern');
    ok('the venue cards show the same chips', same(await chip(page, '#vn-s-lantern'), LANTERN) && same(await chip(page, '#vn-s-harbour'), HARBOUR), JSON.stringify([await chip(page, '#vn-s-lantern'), await chip(page, '#vn-s-harbour')]));
    ok('…and venues with no rules none', (await chips(page, '#vn-s-echo')) === 0 && (await chips(page, '#vn-s-greenfield')) === 0 && (await chips(page, '#vn-s-basement')) === 0);
    const line = await page.$eval('#vn-s-lantern .vn-chip', c => ({ prev: c.previousElementSibling.className, next: c.nextElementSibling.className, own: c.getBoundingClientRect().top >= c.previousElementSibling.getBoundingClientRect().bottom - 1 && c.getBoundingClientRect().bottom <= c.nextElementSibling.getBoundingClientRect().top + 1, direct: c.parentElement.id }));
    ok('…on a line of its own between the facts and the next booking', /vn-facts/.test(line.prev) && /vn-next/.test(line.next) && line.own && line.direct === 'vn-s-lantern', JSON.stringify(line));
    const vname = await page.locator('#vn-s-lantern').ariaSnapshot();
    ok('…read out in words with the card', /House rules: Pro cameras not allowed, and 1 more/.test(vname), vname.split('\n')[0]);
    await page.click('#vn-s-lantern');
    await page.waitForSelector('.vn-sheet');
    f = await full(page, '.vn-sheet .vn-rules-sec');
    ok('the Lantern Rooms’ sheet has the chip and the same lists', !!f && !f.show && same(await chip(page, '.vn-sheet .vn-rules-sec'), LANTERN) && same(f.rows, [['Not allowed', 'Pro cameras · Flash'], ['Allowed', 'Point-and-shoots · Phones'], ['Good to know', 'Earplugs advised']]), JSON.stringify(f));
    await page.click('.sheet .sheet-help');
    let tour = await tourTitles(page);
    let ti = tour.findIndex(s => s.title === 'House rules');
    ok('the venue sheet’s walkthrough has a House rules step after What to know', ti > 0 && tour[ti - 1].title === 'What to know' && /They show on every show here\./.test(tour[ti].text), tour.map(s => s.title).join(', '));
    await page.keyboard.press('Escape'); await sleep(200);
    await page.click('#vn-s-harbour');
    await page.waitForSelector('.vn-sheet');
    f = await full(page, '.vn-sheet .vn-rules-sec');
    ok('Harbour Hall’s sheet: green, what is allowed and what to know', same(await chip(page, '.vn-sheet .vn-rules-sec'), HARBOUR) && same(f.rows, [['Allowed', 'Pro cameras · Point-and-shoots · Phones · Re-entry'], ['Good to know', 'All ages']]), JSON.stringify(f));
    await page.keyboard.press('Escape'); await sleep(200);
    const pageTour = await page.evaluate(() => import('./js/pages/venues.js').then(m => m.venues.tutorial().find(s => s.title === 'A place').text));
    ok('the venues page’s walkthrough mentions the house rules on a card', /its house rules and your next booking there/.test(pageTour), pageTour);

    /* ---------------- the form's walkthrough ---------------- */
    await page.click('#vn-add');
    await page.waitForSelector(FORM.add + ' .vn-rules-edit');
    await page.click(FORM.add + ' .sheet-help');
    tour = await tourTitles(page);
    ti = tour.findIndex(s => s.title === 'House rules');
    ok('the form’s walkthrough has a House rules step that names How strict', ti > 0 && /How strict sets the colour by hand/.test(tour[ti].text) && tour[ti - 1].title === 'Curfew and limits', tour.map(s => s.title).join(', '));
    await page.keyboard.press('Escape'); await sleep(200);

    /* ---------------- which bookings carry rules ---------------- */
    const D2 = await dayFromNow(page, 2), D7 = await dayFromNow(page, 7), D8 = await dayFromNow(page, 8);
    await page.evaluate(([d2, d7, d8]) => {
      const s = window.__s;
      s.patch('venues', 's-echo', { rules: { smoking: 'no', outsideFood: 'no' }, rulesNote: '', rulesTone: '' });
      s.patch('venues', 's-basement', { rules: {}, rulesNote: 'Shoes off in the live room', rulesTone: '' });
      s.upsert('bookings', { id: 'r-noact', kind: 'show', status: 'confirmed', title: 'Open mic', date: d2, venueId: 's-lantern', setTime: '20:00' });
      s.upsert('bookings', { id: 'r-hold', kind: 'show', status: 'hold', actId: 's-owls', date: d2, venueId: 's-harbour' });
      s.upsert('bookings', { id: 'r-offer', kind: 'show', status: 'offer', actId: 's-owls', date: d7, venueId: 's-harbour' });
      s.upsert('bookings', { id: 'r-two', kind: 'show', status: 'confirmed', actId: 's-owls', date: d7, endDate: d8, venueId: 's-lantern', setTime: '18:00' });
      s.upsert('bookings', { id: 'r-studio', kind: 'show', status: 'confirmed', actId: 's-owls', title: 'Live in the studio', date: d8, venueId: 's-echo', setTime: '19:00' });
      s.upsert('bookings', { id: 'r-other', kind: 'other', status: 'confirmed', title: 'Photo shoot', date: d8, venueId: 's-lantern', start: '10:00' });
      s.upsert('bookings', { id: 'r-typed', kind: 'show', status: 'confirmed', actId: 's-owls', date: d8, venueName: 'A Friend’s Barn', setTime: '20:00' });
      s.upsert('bookings', { id: 'r-off', kind: 'show', status: 'cancelled', actId: 's-owls', date: d8, venueId: 's-lantern', setTime: '21:00' });
    }, [D2, D7, D8]);
    await sleep(300);
    const has = id => page.evaluate(i => { const b = window.__s.byId('bookings', i), c = window.__r.rulesChip(b); return c ? c.querySelector('[aria-hidden=true]').textContent : ''; }, id);
    ok('a show with no act still carries the venue’s rules', (await has('r-noact')) === LANTERN.label);
    ok('a hold and an offer carry them', (await has('r-hold')) === 'No restrictions' && (await has('r-offer')) === 'No restrictions');
    ok('a show at a saved studio with rules carries them: the kind of place makes no difference', (await has('r-studio')) === '🥤 Outside food or drink ✗ · 1 more');
    ok('a session there, a rehearsal at a room with rules, and something else at a venue with rules carry none', (await has('s-sess1')) === '' && (await has('s-reh')) === '' && (await has('r-other')) === '');
    ok('a show at a typed venue, and a cancelled show, carry none', (await has('r-typed')) === '' && (await has('r-off')) === '');
    ok('…while those venues’ own cards show their rules', (await chip(page, '#vn-s-echo')).label === '🥤 Outside food or drink ✗ · 1 more' && (await chip(page, '#vn-s-basement')).label === '📝 Shoes off in the live room');
    await toCal(page);
    await page.evaluate(() => { const m = document.getElementById('bk-agenda-more'); if (m) m.click(); }); await sleep(250);
    const onCards = await page.$$eval('.bk-agenda .bk-card[data-id]', cs => Object.fromEntries(cs.map(c => [c.dataset.id, c.querySelectorAll('.vn-chip').length])));
    const expectCards = { 'r-noact': 1, 'r-hold': 1, 'r-offer': 1, 'r-two': 1, 'r-studio': 1, 's-show1': 1, 's-show2': 1, 'r-other': 0, 'r-typed': 0, 's-sess1': 0, 's-reh': 0 };
    ok('the cards say the same: one chip on each show at a venue with rules, a show over two days included', Object.entries(expectCards).every(([id, n]) => !(id in onCards) || onCards[id] === n) && ['r-noact', 'r-hold', 'r-two', 'r-studio', 's-show1', 'r-typed', 's-sess1'].every(id => id in onCards), JSON.stringify(onCards));
    await openB(page, 'r-off');
    ok('a cancelled show’s page has no rules', (await page.locator('.bk-hero').count()) === 1 && (await page.locator('.bk-page .vn-rules').count()) === 0);
    await openB(page, 'r-typed');
    ok('a typed venue: no rules on the page', (await page.locator('.bk-page .vn-rules').count()) === 0);
    await page.evaluate(() => { window.__s.patch('bookings', 'r-typed', { venueId: 's-lantern', venueName: '' }); }); await sleep(300);
    ok('…until a saved venue is picked: then they show, at the next redraw', (await full(page, '.bk-hero') || {}).head === 'House rules at The Lantern Rooms');
    await page.evaluate(() => { window.__s.patch('bookings', 'r-typed', { venueId: '', venueName: 'A Friend’s Barn' }); }); await sleep(300);
    ok('…and go again when the venue is typed instead', (await page.locator('.bk-page .vn-rules').count()) === 0 && (await page.locator('.bk-hero').count()) === 1);
    await openB(page, 'r-two');
    ok('a show over two days has one set of rules on its page', (await page.locator('.bk-page .vn-rules').count()) === 1 && (await page.locator('.bk-page .vn-chip').count()) === 1);

    /* ---------------- nothing leaves ---------------- */
    await page.evaluate(() => { window.__s.patch('venues', 's-lantern', { rulesNote: 'No zebras in the pit' }); }); await sleep(250);
    const out = await page.evaluate(async () => {
      const d = await import('./js/daysheet.js'), i = await import('./js/ics.js'), doc = await import('./js/daysheet-doc.js');
      const b = window.__s.byId('bookings', 's-show1'), all = Object.fromEntries(d.PARTS.map(p => [p[0], true])), data = d.daySheetData(b, all);
      return { rules: !!window.__m.rulesLevel(window.__s.byId('venues', 's-lantern')), data: JSON.stringify(data), link: JSON.stringify(doc.toLink(data)), text: d.daySheetText(b, all), html: d.daySheetHtml(b, all), ics: i.bookingIcs(b), all: i.allIcs(window.__s.db.bookings), venue: /Lantern Rooms/.test(d.daySheetText(b, all)) };
    });
    const RULE_WORDS = /zebra|pro cameras|point-and-shoot|flash|earplug|house rule|not allowed|rulesNote|rulesTone|proCameras/i;
    ok('the day sheet of that show holds none of the rule words: its data, its link, its text, its page', out.rules && out.venue && !RULE_WORDS.test(out.data) && !RULE_WORDS.test(out.link) && !RULE_WORDS.test(out.text) && !RULE_WORDS.test(out.html), [out.data, out.link, out.text, out.html].map(x => (x.match(RULE_WORDS) || [''])[0]).join('|'));
    ok('…nor does its calendar file, or the whole calendar’s', /BEGIN:VEVENT/.test(out.ics) && !RULE_WORDS.test(out.ics) && !RULE_WORDS.test(out.all), (out.ics.match(RULE_WORDS) || [''])[0]);
    await go(page, 'venues'); await page.waitForSelector('#vn-search');
    await page.fill('#vn-search', 'zebra'); await sleep(200);
    ok('search finds the venue by a word in its written rules', (await page.locator('#page .vn-card').count()) === 1 && (await page.locator('#vn-s-lantern').count()) === 1);
    await page.fill('#vn-search', ''); await sleep(200);

    /* ---------------- every role ---------------- */
    const MONEY = /\$|\bpaid\b|\bpay\b|\bmoney\b|\bfees?\b|\bdeal\b|settle|invoice|deposit/i;
    for (const id of ['producer', 'manager', 'band', 'solo', 'scout', 'audiophile', 'all']) {
      await setRole(page, id);
      await toCal(page);
      const c1 = await chip(page, card('s-show1')), c2 = await chip(page, card('s-show2'));
      await go(page, 'venues'); await page.waitForSelector('#vn-s-lantern');
      const v1 = await chip(page, '#vn-s-lantern');
      const want1 = { ...LANTERN, label: '📷 Pro cameras ✗ · 2 more', spoken: 'House rules: Pro cameras not allowed, and 2 more' }; // the note added above counts as one more
      ok(`${id}: the chip is on the show’s card and on the venue’s, the same for every role`, same(c1, want1) && same(c2, HARBOUR) && same(v1, want1), JSON.stringify([c1, c2, v1]));
      if (!['scout', 'band'].includes(id)) continue;
      const money = await page.evaluate(() => import('./js/roles.js').then(r => r.moneyShown()));
      await openB(page, 's-show1');
      const onPage = await page.locator('.bk-hero .vn-rules').innerText();
      await go(page, 'venues');
      await page.click('#vn-s-lantern'); await page.waitForSelector('.vn-sheet');
      const onSheet = await page.locator('.vn-sheet .vn-rules-sec').innerText();
      await page.click('#vn-edit'); await page.waitForSelector(FORM.edit + ' .vn-rules-edit');
      const inForm = await page.locator(FORM.edit + ' .vn-rules-edit').innerText(), n = await page.locator(FORM.edit + ' .vn-rule').count();
      const rest = await page.locator(FORM.edit + ' .field', { hasText: 'house rules' }).allInnerTexts();
      ok(`${id} (money ${money ? 'on' : 'off'}): the rules in full on the show’s page and the sheet, the whole block in the form, and no word about money in any of it`, (id === 'scout' ? !money : money) && /Not allowed/.test(onPage) && /Pro cameras · Flash/.test(onSheet) && n === 17 && ![onPage, onSheet, inForm, ...rest].some(t => MONEY.test(t)), flat([onPage, onSheet].join(' ')).slice(0, 160));
      await page.keyboard.press('Escape'); await sleep(150); await page.keyboard.press('Escape'); await sleep(150);
    }
    await setRole(page, 'all');

    /* ---------------- clearing the rules by hand, and the sample loaded again ---------------- */
    await go(page, 'venues');
    await setRules(page, 's-lantern', {});
    const cleared = await rec(page, 'venues', 's-lantern');
    ok('every answer tapped off and the note emptied: the venue has no rules', same(cleared.rules, {}) && cleared.rulesNote === '' && cleared.rulesTone === '' && (await chips(page, '#vn-s-lantern')) === 0);
    await page.evaluate(() => window.__s.update(d => { const h = d.venues.find(v => v.id === 's-harbour'); delete h.rules; delete h.rulesNote; delete h.rulesTone; })); // as a sample venue loaded before house rules existed
    await sleep(200);
    await go(page, 'settings'); await page.waitForSelector('#se-sample');
    if (!(await page.$eval('#se-sample', d => d.open))) { await page.evaluate(() => document.getElementById('se-sample-sum').scrollIntoView({ block: 'center' })); await page.click('#se-sample-sum'); await sleep(200); }
    await page.evaluate(() => document.getElementById('se-sample-load').scrollIntoView({ block: 'center' })); await sleep(80);
    ok('Settings offers to load the sample again', (await page.locator('#se-sample-load').innerText()) === 'Load it again');
    await page.click('#se-sample-load'); await sleep(400);
    const again = await rec(page, 'venues', 's-lantern'), fresh = await rec(page, 'venues', 's-harbour');
    ok('loading the sample again leaves the rules cleared by hand cleared', same(again.rules, {}) && again.rulesNote === '' && again.rulesTone === '', JSON.stringify(again.rules));
    ok('…and gives its rules to the sample venue that never had any', same(fresh.rules, { proCameras: 'yes', compacts: 'yes', phones: 'yes', age: 'all', reentry: 'yes' }), JSON.stringify(fresh.rules));
    await toCal(page);
    ok('…so the Lantern Rooms show has no chip and Harbour Hall’s is back', (await chips(page, card('s-show1'))) === 0 && same(await chip(page, card('s-show2')), HARBOUR));
    await openB(page, 's-show1');
    ok('…and the show’s page no rules', (await page.locator('.bk-page .vn-rules').count()) === 0);

    /* ---------------- the venue deleted ---------------- */
    await page.evaluate(() => { window.__s.remove('venues', 's-harbour'); }); await sleep(300);
    const kept = await rec(page, 'bookings', 's-show2');
    await openB(page, 's-show2');
    ok('after the venue is deleted the show keeps its name, and the rules go', kept.venueId === '' && kept.venueName === 'Harbour Hall' && (await page.locator('.bk-page .vn-rules, .bk-page .vn-chip').count()) === 0 && /Harbour Hall/.test(await page.locator('.bk-hero').innerText()));
    ok('…and the chip with them', (await has('s-show2')) === '' && (await has('r-hold')) === '');

    ok('no house-rules fault was logged along the way', warns.length === 0, warns.join(' | '));
    ok('no errors in the console (the sample)', errors.length === 0, errors.slice(0, 5).join(' | ')); all.push(...errors);
    await browser.close();
  }

  /* ======================= 320px, extra-large text and buttons, light and dark ======================= */
  for (const [scheme, menu] of [['light', 'record'], ['dark', 'tape']]) {
    const prefs = `try { localStorage.setItem('gdex-prefs', ${JSON.stringify(JSON.stringify({ text: 'xlarge', targets: 'large', scheme, menu }))}); } catch (e) { /* ignore */ }`;
    const { browser, page, errors } = await open({ sample: true, viewport: { width: 320, height: 700 }, init: prefs });
    await page.waitForSelector('.bk-agenda .bk-card');
    await hook(page);
    const D3 = await dayFromNow(page, 3);
    await page.evaluate(d3 => {
      const s = window.__s;
      s.upsert('venues', { id: 'club9', kind: 'venue', name: 'Club 9 at the Old Customs House', address: '9 Dock Street', rules: { proCameras: 'no', compacts: 'no', phones: 'no', age: '21', idNeeded: 'yes', cashOnly: 'yes', bags: 'no', strobes: 'yes', floor: 'both', moshing: 'no', outsideFood: 'no' }, rulesNote: 'Phones go in a sealed pouch at the door.\nNo re-entry after 11pm. Coats in the cloakroom, cash only. Supercalifragilisticexpialidocious-and-then-some.', rulesTone: '' });
      s.upsert('bookings', { id: 'c91', kind: 'show', status: 'confirmed', actId: 's-owls', date: d3, venueId: 'club9', setTime: '23:30', setLength: 60 });
      s.patch('venues', 's-greenfield', { rules: {}, rulesNote: 'Wellingtons-and-waterproofs-strongly-recommended whatever the forecast says', rulesTone: '' });
    }, D3);
    await sleep(300);
    const is = await page.evaluate(() => ({ scheme: document.documentElement.dataset.scheme, text: document.documentElement.dataset.text, hit: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit')), rem: parseFloat(getComputedStyle(document.documentElement).fontSize) }));
    ok(`${scheme}, 320px: extra-large text and large buttons are on`, is.scheme === scheme && is.text === 'xlarge' && is.hit >= 54 && is.rem > 20, JSON.stringify(is));
    // Every chip on screen stays inside the card (or box) it is in, and wraps instead of pushing it wider.
    const inside = sel => page.evaluate(s => [...document.querySelectorAll(s + ' .vn-chip')].map(c => { const box = c.closest('.card, .vn-rules, .sheet-body'), a = c.getBoundingClientRect(), b = box.getBoundingClientRect(); return a.width > 0 && a.left >= b.left - 0.5 && a.right <= b.right + 0.5; }), sel);
    let fit = await inside('.bk-agenda');
    ok(`${scheme}, 320px: the calendar does not scroll sideways, and each chip stays inside its card`, (await wide(page)) <= 320 && fit.length >= 3 && fit.every(Boolean), `${await wide(page)} ${fit.join()}`);
    await openB(page, 'c91');
    fit = await inside('.bk-hero');
    const box = await page.evaluate(() => { const r = document.querySelector('.bk-hero .vn-rules'), h = document.querySelector('.bk-hero'), a = r.getBoundingClientRect(), b = h.getBoundingClientRect(); return { in: a.left >= b.left && a.right <= b.right, over: r.scrollWidth > r.clientWidth + 1, dd: [...r.querySelectorAll('dd')].every(d => d.scrollWidth <= d.clientWidth + 1), size: parseFloat(getComputedStyle(r.querySelector('dd')).fontSize), rem: parseFloat(getComputedStyle(document.documentElement).fontSize) }; });
    ok(`${scheme}, 320px: a show’s page with long rules does not scroll sideways, and the rules stay in the header`, (await wide(page)) <= 320 && fit.length === 1 && fit[0] && box.in && !box.over && box.dd, `${await wide(page)} ${JSON.stringify(box)}`);
    ok(`${scheme}, 320px: the rules follow the Text size setting`, Math.abs(box.size - box.rem) < 0.5, JSON.stringify(box));
    await openB(page, 's-show1');
    ok(`${scheme}, 320px: the page of the sample show does not scroll sideways`, (await wide(page)) <= 320 && (await page.locator('.bk-hero .vn-rules').count()) === 1, String(await wide(page)));
    await go(page, 'venues'); await page.waitForSelector('#vn-club9');
    fit = await inside('#page');
    ok(`${scheme}, 320px: the venue list does not scroll sideways, with each chip inside its card`, (await wide(page)) <= 320 && fit.length === 4 && fit.every(Boolean), `${await wide(page)} ${fit.join()}`);
    await page.click('#vn-club9'); await page.waitForSelector('.vn-sheet');
    const sheetFit = () => page.evaluate(() => { const b = [...document.querySelectorAll('.sheet-body')].pop(); return [b.scrollWidth, b.clientWidth]; });
    let sf = await sheetFit();
    fit = await inside('.vn-sheet');
    ok(`${scheme}, 320px: the venue’s sheet does not scroll sideways, in the page or in itself`, (await wide(page)) <= 320 && sf[0] <= sf[1] && fit.length === 1 && fit[0], `${await wide(page)} ${sf.join('/')}`);
    await page.keyboard.press('Escape'); await sleep(200);
    await page.click('#vn-add'); await page.waitForSelector(FORM.add + ' .vn-rules-edit'); await sleep(250);
    for (const [id, ans] of [['proCameras', 'no'], ['phones', 'yes'], ['cashOnly', 'yes']]) await press(page, id, ans);
    sf = await sheetFit();
    const rows = await page.evaluate(sel => [...document.querySelectorAll(sel + ' .vn-rule')].map(r => {
      const name = r.querySelector('.vn-rule-name').getBoundingClientRect(), b = [...r.querySelectorAll('button, select')].map(x => x.getBoundingClientRect()), ed = r.closest('.vn-rules-edit').getBoundingClientRect();
      return { id: r.dataset.rule, under: b.every(x => x.top >= name.bottom - 1), beside: b.length < 2 || (Math.abs(b[0].top - b[1].top) < 1 && b[0].right <= b[1].left), tall: Math.min(...b.map(x => x.height)), in: b.every(x => x.left >= ed.left - 0.5 && x.right <= ed.right + 0.5),
        whole: [...r.querySelectorAll('button')].every(x => x.scrollWidth <= x.clientWidth + 1 && x.querySelector('.vn-rule-says').scrollWidth <= x.querySelector('.vn-rule-says').clientWidth + 1) && (b.length < 2 || Math.abs(b[0].height - b[1].height) < 1) };
    }), FORM.add);
    ok(`${scheme}, 320px: in the form each rule’s name has its own line, with the two buttons side by side under it`, rows.length === 17 && rows.every(r => r.under && r.beside && r.in), JSON.stringify(rows.filter(r => !(r.under && r.beside && r.in))));
    ok(`${scheme}, 320px: …each button as tall as a large button, its words inside it, the two the same height`, rows.every(r => r.tall >= is.hit - 0.5 && r.whole), JSON.stringify(rows.filter(r => !(r.tall >= is.hit - 0.5 && r.whole))));
    const sizes = () => page.evaluate(s => JSON.stringify([...document.querySelectorAll(s + ' .vn-rules-edit, ' + s + ' .vn-rule, ' + s + ' .vn-rule-btn, ' + s + ' .vn-rule-says')].map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })), FORM.add);
    const was = await sizes();
    await page.evaluate(s => document.querySelectorAll(s + ' .vn-rule-no').forEach(b => { if (b.getAttribute('aria-pressed') !== 'true') b.click(); }), FORM.add);
    const allNo = await sizes();
    await page.evaluate(s => document.querySelectorAll(s + ' .vn-rule-yes').forEach(b => b.click()), FORM.add);
    ok(`${scheme}, 320px: …and pressing every button changes no size: nothing on the form jumps`, was === allNo && allNo === (await sizes()) && (await page.locator(FORM.add + ' .vn-rule-btn[aria-pressed=true]').count()) === 15);
    ok(`${scheme}, 320px: the form does not scroll sideways, in the page or in itself`, (await wide(page)) <= 320 && sf[0] <= sf[1], `${await wide(page)} ${sf.join('/')}`);
    await page.keyboard.press('Escape'); await sleep(200);
    await openEdit(page, 'club9');
    const widths = await page.evaluate(sel => { const w = s => Math.round(document.querySelector(sel + ' ' + s).getBoundingClientRect().width); return { block: w('.vn-rules-edit'), field: w('[data-key=name]') }; }, FORM.edit);
    ok(`${scheme}, 320px: in the Edit form the block is no wider than the other fields`, (await wide(page)) <= 320 && widths.block <= widths.field, JSON.stringify(widths));
    await page.keyboard.press('Escape'); await sleep(200);
    ok(`no errors in the console (320px, ${scheme})`, errors.length === 0, errors.slice(0, 5).join(' | ')); all.push(...errors);
    await browser.close();
  }

  /* ======================= every theme: the words can be read; high contrast; forced colours ======================= */
  {
    const { browser, page, errors } = await open({ sample: true, tab: 'venues' });
    await page.waitForSelector('#vn-s-lantern');
    await hook(page);
    await page.evaluate(() => { const s = window.__s; s.upsert('venues', { id: 'red', kind: 'venue', name: 'Red Room', rules: { phones: 'no' }, rulesNote: '', rulesTone: '' }); });
    await sleep(250);
    await openEdit(page, 's-lantern');
    await press(page, 'cashOnly', 'yes');
    const themes = await page.evaluate(async () => {
      const { PALETTES } = await import('./js/a11y.js');
      const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
      const rgb = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data]; };
      const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const root = document.documentElement, was = { ...root.dataset }, out = [];
      const pair = el => { const cs = getComputedStyle(el); return { text: cs.color, back: cs.backgroundColor, solid: rgb(cs.backgroundColor)[3] === 255 }; };
      const main = document.createElement('i'); main.style.cssText = 'color: var(--accent-ink); background: var(--accent)'; document.body.append(main); // the theme's own pressed look
      for (const p of PALETTES) for (const scheme of ['light', 'dark']) {
        root.dataset.palette = p.id; root.dataset.scheme = scheme;
        const row = { theme: `${p.id} ${scheme}`, chips: {}, dots: {} };
        for (const [k, sel] of [['some', '#vn-s-lantern .vn-chip'], ['ok', '#vn-s-harbour .vn-chip'], ['strict', '#vn-red .vn-chip']]) {
          const c = document.querySelector(sel), x = pair(c);
          row.chips[k] = x.solid ? ratio(x.text, x.back) : 0;
          row.dots[k] = ratio(getComputedStyle(c, '::before').backgroundColor, x.back); // the dot against the chip's own tint
        }
        const yes = pair(document.getElementById('vn-rule-compacts-yes')), no = pair(document.getElementById('vn-rule-proCameras-no')), off = pair(document.getElementById('vn-rule-video-yes')), fact = pair(document.getElementById('vn-rule-cashOnly-yes')), prim = pair(main);
        const tick = id => { const b = document.querySelector('#' + id + ' .vn-rule-mark'), x = pair(b); return Math.min(ratio(x.text, x.back), ratio(x.back, getComputedStyle(b.parentElement).backgroundColor)); }; // the mark in its box, and the box on its button
        const empty = (b => ratio(getComputedStyle(b).borderTopColor, getComputedStyle(b.parentElement).backgroundColor))(document.querySelector('#vn-rule-video-yes .vn-rule-mark'));
        Object.assign(row, { yes: ratio(yes.text, yes.back), no: ratio(no.text, no.back), off: ratio(off.text, off.back), factAsMain: fact.text === prim.text && fact.back === prim.back, differ: new Set([yes.back, no.back, off.back, fact.back]).size === 4,
          ticks: Math.min(tick('vn-rule-compacts-yes'), tick('vn-rule-proCameras-no'), tick('vn-rule-cashOnly-yes')), empty });
        out.push(row);
      }
      main.remove();
      Object.keys(root.dataset).forEach(k => { if (!(k in was)) delete root.dataset[k]; }); Object.assign(root.dataset, was);
      return out;
    });
    const low = themes.filter(t => Math.min(t.chips.some, t.chips.ok, t.chips.strict) < 7);
    ok('in every theme, light and dark, the chip’s words stand clear of its colour (7:1 or better)', themes.length >= 20 && low.length === 0, low.map(t => `${t.theme} ${Object.values(t.chips).map(n => n.toFixed(1)).join('/')}`).join(' | ') || `${themes.length} themes, lowest ${Math.min(...themes.flatMap(t => Object.values(t.chips))).toFixed(1)}`);
    const faint = themes.filter(t => Math.min(t.dots.some, t.dots.ok, t.dots.strict) < 3);
    ok('…and its dot shows against it (3:1 or better)', faint.length === 0, faint.map(t => `${t.theme} ${Object.values(t.dots).map(n => n.toFixed(1)).join('/')}`).join(' | ') || `lowest ${Math.min(...themes.flatMap(t => Object.values(t.dots))).toFixed(1)}`);
    const dim = themes.filter(t => Math.min(t.yes, t.no, t.off) < 7);
    ok('…a pressed Allowed, a pressed Not allowed and a button at rest keep their words clear too', dim.length === 0, dim.map(t => `${t.theme} ${[t.yes, t.no, t.off].map(n => n.toFixed(1)).join('/')}`).join(' | '));
    ok('…a fact’s pressed answer takes the theme’s own pressed look, and the four looks differ', themes.every(t => t.factAsMain && t.differ), themes.filter(t => !(t.factAsMain && t.differ)).map(t => t.theme).join(', '));
    const pale = themes.filter(t => t.ticks < 3 || t.empty < 3);
    ok('…a ticked box, its mark and an empty box all show against what is behind them (3:1 or better)', pale.length === 0, pale.map(t => `${t.theme} ${t.ticks.toFixed(1)}/${t.empty.toFixed(1)}`).join(' | ') || `lowest ${Math.min(...themes.map(t => Math.min(t.ticks, t.empty))).toFixed(1)}`);
    const pressedLook = await page.evaluate(() => { const b = id => { const cs = getComputedStyle(document.getElementById(id)); return cs.boxShadow !== 'none' && cs.borderTopColor; }; return { yes: b('vn-rule-compacts-yes'), no: b('vn-rule-proCameras-no'), off: getComputedStyle(document.getElementById('vn-rule-video-yes')).boxShadow }; });
    ok('a pressed button has a thicker edge as well as its mark (not colour alone)', !!pressedLook.yes && !!pressedLook.no && pressedLook.off === 'none', JSON.stringify(pressedLook));
    const hc = await page.evaluate(() => { const root = document.documentElement, was = root.dataset.contrast; root.dataset.contrast = 'high'; const out = { chip: getComputedStyle(document.querySelector('#vn-s-lantern .vn-chip')).borderTopWidth, btn: getComputedStyle(document.getElementById('vn-rule-video-yes')).borderTopWidth }; if (was === undefined) delete root.dataset.contrast; else root.dataset.contrast = was; return out; });
    ok('high contrast: a 2px edge on the chip and on the buttons', hc.chip === '2px' && hc.btn === '2px', JSON.stringify(hc));
    await page.emulateMedia({ forcedColors: 'active' });
    const fc = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('#vn-s-lantern .vn-chip')), on = getComputedStyle(document.getElementById('vn-rule-proCameras-no')), off = getComputedStyle(document.getElementById('vn-rule-video-yes')); const box = id => { const m = document.querySelector('#' + id + ' .vn-rule-mark'); return `${getComputedStyle(m).borderTopStyle} ${getComputedStyle(m.firstElementChild).visibility}`; }; return { chip: `${c.borderTopWidth} ${c.borderTopStyle}`, on: on.borderTopWidth, off: off.borderTopWidth, pressed: box('vn-rule-proCameras-no'), rest: box('vn-rule-video-yes') }; });
    ok('forced colours: the chip keeps a solid edge; a pressed button has a thicker one and its box ticked, one at rest an empty box', fc.chip === '1px solid' && fc.on === '3px' && fc.off === '1px' && fc.pressed === 'solid visible' && fc.rest === 'solid hidden', JSON.stringify(fc));
    await page.emulateMedia({ forcedColors: 'none' });
    await page.keyboard.press('Escape'); await sleep(200);
    ok('no errors in the console (themes)', errors.length === 0, errors.slice(0, 5).join(' | ')); all.push(...errors);
    await browser.close();
  }

  /* ======================= a laptop: the rule's name beside its buttons ======================= */
  {
    const { browser, page, errors } = await open({ sample: true, tab: 'venues', viewport: { width: 1100, height: 800 } });
    await page.waitForSelector('#vn-s-lantern');
    await hook(page);
    await openEdit(page, 's-lantern');
    const rows = await page.evaluate(sel => [...document.querySelectorAll(sel + ' .vn-rule')].map(r => { const n = r.querySelector('.vn-rule-name').getBoundingClientRect(), b = [...r.querySelectorAll('button, select')].map(x => x.getBoundingClientRect()); return b.every(x => x.left >= n.right - 1 && x.top < n.bottom && x.bottom > n.top) && (b.length < 2 || b[0].right <= b[1].left); }), FORM.edit);
    const cols = await page.evaluate(sel => [...new Set([...document.querySelectorAll(sel + ' .vn-rule')].map(r => Math.round([...r.querySelectorAll('button, select')].pop().getBoundingClientRect().right)))], FORM.edit);
    ok('on a wide screen each rule’s buttons sit beside its name, in line down the block', rows.length === 17 && rows.every(Boolean) && cols.length === 1, `${rows.filter(Boolean).length} ${cols.join()}`);
    ok('…and nothing scrolls sideways', (await wide(page)) <= 1100 && (await page.evaluate(() => { const b = [...document.querySelectorAll('.sheet-body')].pop(); return b.scrollWidth <= b.clientWidth; })));
    await page.keyboard.press('Escape'); await sleep(200);
    ok('no errors in the console (a wide screen)', errors.length === 0, errors.slice(0, 5).join(' | ')); all.push(...errors);
    await browser.close();
  }

  ok('no errors in the console', all.length === 0, all.slice(0, 5).join(' | '));
})().catch(e => { console.log('FAIL house rules crashed — ' + e.message); process.exit(1); });
