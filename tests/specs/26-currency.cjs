// The currency, chosen by country (js/money-currency.js; the owner, 15 Nov 2026: "Quote's and invoices should let you
// choose your country currency"): one chooser of every country with its currency, sorted by name, with this device's
// country suggested first (the browser here is en-GB) and the default left at $ / USD; picking one sets the symbol, the
// code and the country together, at the top of Settings → Quotes & invoices, in Your details and in the welcome tour,
// with the old "Currency for payment links" folded in. Each quote and invoice has its own currency, from the same list:
// an invoice picked into euros has € on it and its Pay button, link and bank QR in EUR; a quote in euros becomes an
// invoice in euros; the Money page never adds two currencies together. What was stored before reads as it did ('$',
// 'kr' with SEK, a symbol typed by hand, a document from before), and sync, backups and the store keep the new fields.
const { ok, sleep, go, topSheet, BASE, licenceLeg } = require('../helpers.cjs');
const { chromium } = require('playwright');

// Like helpers.open, in a browser set to British English.
async function openGB() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block', acceptDownloads: true, locale: 'en-GB' });
  await ctx.addInitScript(() => { try { localStorage.setItem('tourbook-tour', 'done'); localStorage.setItem('tourbook-role-nudged', '1'); localStorage.setItem('tourbook-ask-seen', 'off'); } catch (e) { /* ignore */ } });
  await licenceLeg(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE);
  await page.waitForSelector('#deck .dk-next');
  return { browser, ctx, page, errors };
}
const dbNow = page => page.evaluate(() => import('./js/store.js').then(s => JSON.parse(s.serialize())));
const booking = async (page, id) => (await dbNow(page)).bookings.find(b => b.id === id);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const fmt = (page, n) => run(page, n => import('./js/model.js').then(m => m.fmtMoney(n)), n);
// Settings → Quotes & invoices, open.
async function billing(page) {
  await go(page, 'settings');
  await page.evaluate(() => { const d = document.getElementById('se-billing'); if (d && !d.open) d.open = true; });
  await page.waitForSelector('#mn-bl-currency');
}
const chosen = page => page.$eval('#mn-bl-currency', s => ({ value: s.value, label: s.selectedOptions[0] ? s.selectedOptions[0].textContent : '' }));
async function openBox(page, id) {
  await page.evaluate(id => import('./js/pages/bookings.js').then(m => m.openBooking(id, { box: 'money' })), id);
  await page.waitForSelector('#blk-money .mn-block');
  await sleep(150);
}
async function saveEditor(page) { await topSheet(page).locator('button[type=submit]').click(); await sleep(250); }

(async () => {
  const { browser, ctx, page, errors } = await openGB();
  const Y = await run(page, () => String(new Date().getFullYear()));
  const later = await run(page, () => { const d = new Date(); d.setDate(d.getDate() + 9); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });

  /* ---------------- the chooser, as a new device has it ---------------- */
  await billing(page);
  const opts = await page.$eval('#mn-bl-currency', s => ({
    groups: [...s.querySelectorAll('optgroup')].map(g => g.label),
    tips: [...s.querySelectorAll('optgroup[label="Suggested"] option')].map(o => [o.value, o.textContent]),
    all: [...s.querySelectorAll('optgroup[label="Every country"] option')].map(o => [o.value, o.textContent]),
    first: s.options[0].value,
  }));
  ok('Your currency is at the top of Quotes & invoices', await page.$eval('#se-billing .mn-billing', el => el.firstElementChild.classList.contains('mn-bl-cur')));
  ok('this device’s country (en-GB) is suggested first', opts.first === 'GB' && JSON.stringify(opts.tips) === JSON.stringify([['GB', 'United Kingdom — £ GBP']]) && JSON.stringify(opts.groups) === JSON.stringify(['Suggested', 'Every country']), JSON.stringify(opts.tips));
  const names = opts.all.map(o => o[1].split(' — ')[0]);
  const sorted = await run(page, list => { const c = new Intl.Collator(navigator.language); return list.slice().sort((a, b) => c.compare(a, b)); }, names);
  ok('every country is listed, sorted by its name, each with its currency', opts.all.length >= 240 && JSON.stringify(names) === JSON.stringify(sorted) && opts.all.some(o => o[1] === 'Germany — € EUR') && opts.all.some(o => o[1] === 'Sweden — kr SEK') && opts.all.some(o => o[1] === 'Switzerland — CHF') && opts.all.some(o => o[1] === 'Japan — ¥ JPY'), `${opts.all.length} · ${opts.all.slice(0, 3).map(o => o[1]).join(' | ')}`);
  let pick = await chosen(page), d = await dbNow(page);
  ok('a new device keeps $ and USD: the region is only suggested', pick.value === 'US' && pick.label === 'United States — $ USD' && d.profile.currency === '$' && !d.billing.currencyCode && !d.billing.currencyCountry && (await fmt(page, 1250)) === '$1,250', JSON.stringify([pick, d.profile.currency, d.billing]));
  ok('the old “Currency for payment links” is gone: one place sets the currency', (await page.locator('#mn-bl-currencyCode').count()) === 0 && !/Currency for payment links/.test(await page.locator('#se-billing').innerText()));

  /* ---------------- what was stored before ---------------- */
  const as = async (sym, code) => {
    await run(page, ([sym, code]) => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, currency: sym }; d.billing = { ...d.billing, currencyCode: code }; delete d.billing.currencyCountry; })), [sym, code]);
    await billing(page); await sleep(100);
    return { pick: await chosen(page), money: await fmt(page, 1250), code: await run(page, () => import('./js/money.js').then(m => m.currencyCode())) };
  };
  let old = await as('kr', 'SEK');
  ok('a stored kr with SEK reads as Sweden, kr and SEK, as before', old.pick.value === 'SE' && old.pick.label === 'Sweden — kr SEK' && old.money === 'kr1,250' && old.code === 'SEK', JSON.stringify(old));
  old = await as('kr', 'NOK');
  ok('…and kr with NOK as Norway', old.pick.value === 'NO' && old.code === 'NOK', JSON.stringify(old));
  old = await as('Fr.', '');
  ok('a symbol typed by hand is shown as it is, as Other, until a country is picked', old.pick.value === 'keep' && old.pick.label === 'Other — Fr.' && old.money === 'Fr.1,250', JSON.stringify(old));
  old = await as('A$', '');
  ok('an older A$ keeps its symbol, with its code', old.pick.value === 'keep' && old.pick.label === 'Other — A$ AUD' && old.money === 'A$1,250' && old.code === 'AUD', JSON.stringify(old));
  old = await as('€', '');
  ok('the euro with no country (and a device outside the eurozone) reads as the euro', old.pick.value === 'keep' && old.pick.label === 'Euro — € EUR' && old.code === 'EUR', JSON.stringify(old));
  // Your details saved without picking another country changes nothing stored.
  await as('Fr.', '');
  await go(page, 'settings');
  await page.evaluate(() => import('./js/pages/settings.js').then(m => m.editProfile()));
  await page.waitForSelector('.sheet[aria-label="Your details"] select[data-key="currency"]');
  ok('Your details has the same chooser, showing the typed symbol as it is', (await page.inputValue('.sheet[aria-label="Your details"] [data-key="currency"]')) === 'keep' && (await page.locator('.sheet[aria-label="Your details"] [data-key="currency"] optgroup[label="Suggested"] option[value="GB"]').count()) === 1);
  await page.fill('.sheet[aria-label="Your details"] [data-key="name"]', 'Maya Brooks');
  await saveEditor(page);
  d = await dbNow(page);
  ok('saving your details without picking a country leaves the currency as it was', d.profile.name === 'Maya Brooks' && d.profile.currency === 'Fr.' && !d.billing.currencyCode && !d.billing.currencyCountry, JSON.stringify([d.profile.currency, d.billing]));

  /* ---------------- picking your country ---------------- */
  await billing(page);
  await page.selectOption('#mn-bl-currency', 'GB');
  await sleep(250);
  d = await dbNow(page);
  ok('picking United Kingdom sets £, GBP and the country together', d.profile.currency === '£' && d.billing.currencyCode === 'GBP' && d.billing.currencyCountry === 'GB' && (await fmt(page, 1250)) === '£1,250', JSON.stringify([d.profile.currency, d.billing]));
  await page.evaluate(() => { document.getElementById('se-profile').open = true; });
  ok('…and the chooser and Your details show it', (await chosen(page)).value === 'GB' && /United Kingdom — £ GBP/.test(await page.locator('#se-profile .se-kv').innerText()), await page.locator('#se-profile .se-kv').innerText());
  // Euros picked in another country than the device's: the chooser shows the one picked, not the first that uses the euro.
  await page.selectOption('#mn-bl-currency', 'IE'); await sleep(200);
  ok('a country that shares its currency is shown as the one picked', (await chosen(page)).value === 'IE' && (await dbNow(page)).billing.currencyCountry === 'IE');
  await page.selectOption('#mn-bl-currency', 'GB'); await sleep(200);

  /* ---------------- an invoice in euros ---------------- */
  await run(page, ([later]) => Promise.all([import('./js/store.js'), import('./js/money.js')]).then(([s, m]) => {
    m.setBilling({ paypal: 'nightowls', accountName: 'The Night Owls', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX' });
    s.upsert('bookings', { id: 'c-berlin', kind: 'show', status: 'confirmed', date: later, title: 'Berlin, Lido', contact: { name: 'Jonas', email: 'jonas@example.com' }, deal: { type: 'guarantee', fee: 250 } });
  }), [later]);
  await openBox(page, 'c-berlin');
  await page.click('#mn-make-invoice'); await sleep(250);
  let b = await booking(page, 'c-berlin');
  const draftCur = await run(page, () => Promise.all([import('./js/store.js'), import('./js/money-currency.js')]).then(([s, c]) => c.docCur(s.byId('bookings', 'c-berlin').invoice)));
  ok('a new invoice is a draft in your currency (it follows yours until it is sent or picked)', !('currency' in b.invoice) && draftCur.sym === '£' && draftCur.code === 'GBP', JSON.stringify([b.invoice.currency, draftCur]));
  await page.click('#mn-edit-invoice');
  await page.waitForSelector('#mn-ed-currency');
  const ed = await page.$eval('#mn-ed-currency', s => ({ value: s.value, tips: [...s.querySelectorAll('optgroup[label="Suggested"] option')].map(o => o.value) }));
  ok('its editor has a currency, from the same list, set to yours', ed.value === 'GB' && ed.tips[0] === 'GB', JSON.stringify(ed));
  await page.selectOption('#mn-ed-currency', 'DE'); await sleep(100);
  ok('picking Germany puts € on the prices and totals as you edit', /Price \(€\)/.test(await topSheet(page).innerText()) && /€250/.test(await page.locator('.mn-ed-totals').innerText()), await page.locator('.mn-ed-totals').innerText());
  await saveEditor(page);
  b = await booking(page, 'c-berlin');
  ok('the invoice stores € and EUR (and Germany)', b.invoice.currency === '€' && b.invoice.code === 'EUR' && b.invoice.country === 'DE', JSON.stringify([b.invoice.currency, b.invoice.code, b.invoice.country]));
  const boxText = await page.locator('#blk-money').innerText();
  ok('the box shows it in euros, and says so', /€250/.test(boxText) && /in EUR/.test(boxText) && !/£250/.test(boxText), boxText.replace(/\n/g, ' ').slice(0, 200));
  ok('your own currency is still £', (await fmt(page, 10)) === '£10');
  const pay = await run(page, () => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-pay.js'), import('./js/money-doc.js')]).then(([s, m, p, md]) => {
    const snap = m.snapshot(s.byId('bookings', 'c-berlin'), 'invoice'), ctx = { amount: md.calc(snap).due, code: snap.code, reference: snap.number };
    return { cur: snap.currency, code: snap.code, buttons: p.payButtons(snap.pay, ctx), qr: p.bankQr(snap.pay, ctx), text: md.docText(snap) };
  }));
  ok('its Pay button asks for euros', pay.cur === '€' && pay.code === 'EUR' && pay.buttons.some(x => x.id === 'paypal' && x.href === 'https://paypal.me/nightowls/250.00EUR'), JSON.stringify(pay.buttons));
  ok('its bank QR is the European one with the amount in euros', pay.qr.kind === 'epc' && pay.qr.text.split('\n')[7] === 'EUR250.00', JSON.stringify(pay.qr.text));
  ok('the euro needs no code by the total (€ says it)', /Total: €250\.00/.test(pay.text), pay.text);
  // The client's link: the page opens in euros, with the Pay button in euros.
  await page.click('#mn-link-invoice');
  await page.waitForSelector('#mn-link-text');
  const url = await page.inputValue('#mn-link-text');
  await page.keyboard.press('Escape');
  const client = await ctx.newPage();
  const clientErrors = [];
  client.on('pageerror', e => clientErrors.push(e.message));
  await client.goto(url);
  await client.waitForSelector('.money-doc');
  const pp = await client.$eval('a.pay-btn[data-pay="paypal"]', a => a.getAttribute('href')).catch(() => '');
  ok('the client’s page is in euros, with the Pay button in euros', /€250\.00/.test(await client.locator('.money-totals').innerText()) && pp === 'https://paypal.me/nightowls/250.00EUR' && /Pay €250\.00/.test(await client.locator('#bar').innerText()), pp);
  await client.waitForSelector('.pay-qr svg', { timeout: 8000 }).catch(() => {});
  ok('…with the bank QR drawn', (await client.locator('.pay-qr svg').count()) === 1);
  // A GBP invoice's bank QR leaves the amount out, as before (the European QR carries euros only).
  const gbpQr = await run(page, () => import('./js/money-pay.js').then(p => p.bankQr({ iban: 'DE89370400440532013000', accountName: 'X' }, { amount: 10, code: 'GBP', reference: 'R' }).text.split('\n')[7]));
  ok('a bank QR in another currency leaves the amount for the payer', gbpQr === '', JSON.stringify(gbpQr));

  /* ---------------- a quote in euros while yours is pounds ---------------- */
  await run(page, ([Y]) => import('./js/store.js').then(s => {
    s.upsert('bookings', { id: 'c-home', kind: 'other', status: 'done', date: `${Y}-01-01`, title: 'Wedding, Bath', fee: 900 });
    s.upsert('bookings', { id: 'c-paris', kind: 'other', status: 'done', date: `${Y}-01-01`, title: 'Launch party, Paris', fee: 400 });
  }), [Y]);
  await openBox(page, 'c-paris');
  await page.click('#mn-tab-quote'); await sleep(150);
  await page.click('#mn-make-quote'); await sleep(250);
  await page.click('#mn-edit-quote');
  await page.waitForSelector('#mn-ed-currency');
  await page.selectOption('#mn-ed-currency', 'FR');
  await saveEditor(page);
  b = await booking(page, 'c-paris');
  ok('a quote can be in euros while yours is pounds', b.quote.currency === '€' && b.quote.code === 'EUR' && b.quote.country === 'FR' && /€400/.test(await page.locator('#mn-test-summary, #blk-money summary').first().innerText()), JSON.stringify([b.quote.currency, b.quote.code]));
  await page.click('#mn-quote-to-invoice'); await sleep(250);
  b = await booking(page, 'c-paris');
  ok('the invoice made from it is in euros too', b.invoice.currency === '€' && b.invoice.code === 'EUR' && b.invoice.country === 'FR', JSON.stringify([b.invoice.currency, b.invoice.code]));
  await page.click('#mn-sent-invoice'); await sleep(200);
  await openBox(page, 'c-home');
  await page.click('#mn-make-invoice'); await sleep(250);
  await page.click('#mn-sent-invoice'); await sleep(200);
  b = await booking(page, 'c-home');
  ok('…and one at home, sent in pounds, keeps the currency it went out in', b.invoice.currency === '£' && b.invoice.code === 'GBP' && b.invoice.country === 'GB' && b.invoice.status === 'sent', JSON.stringify([b.invoice.currency, b.invoice.code]));
  // A draft follows your currency; a document sent keeps its own when yours changes.
  const follows = await run(page, () => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-currency.js')]).then(([s, m, c]) => {
    s.upsert('bookings', { id: 'c-draft', kind: 'other', status: 'confirmed', date: '2026-12-01', title: 'Draft', fee: 10 });
    m.createDoc('c-draft', 'quote');
    c.setMine(c.choiceFor('JP'));
    const out = [c.docCur(s.byId('bookings', 'c-draft').quote).code, c.docCur(s.byId('bookings', 'c-home').invoice).code];
    c.setMine(c.choiceFor('GB'));
    return out;
  }));
  ok('a draft follows your currency; a document sent keeps the one it went out in', JSON.stringify(follows) === JSON.stringify(['JPY', 'GBP']), JSON.stringify(follows));
  await go(page, 'bookings'); await go(page, 'money');
  await page.waitForSelector('.mn-stats');
  const stat = id => page.locator(`#mn-stat-${id} b`).innerText();
  const st = { earned: await stat('earned'), invoiced: await stat('invoiced'), unpaid: await stat('unpaid') };
  ok('the Money page totals each currency on its own: never £ and € added together', st.unpaid === '£900 GBP\n€400 EUR' && st.invoiced === '£900 GBP\n€400 EUR' && !/1,300/.test(Object.values(st).join(' ')), JSON.stringify(st));
  ok('earned too: pounds from home, euros from Paris', /£900 GBP/.test(st.earned) && /€400 EUR/.test(st.earned), JSON.stringify(st.earned));
  const unpaidList = await page.locator('.mn-unpaid').innerText();
  ok('each unpaid invoice shows its own currency', /€400/.test(unpaidList) && /£900/.test(unpaidList), unpaidList.replace(/\n/g, ' '));
  const jan = await page.locator('.mn-bar-row').first().innerText();
  ok('a month’s bar is in pounds, with the euros beside it', /£900/.test(jan) && /€400 EUR/.test(jan), jan.replace(/\n/g, ' '));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#mn-csv-invoices')]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  ok('the invoices spreadsheet has a currency column', /Paid on,Currency/.test(csv) && /,EUR\r?\n|,EUR$/m.test(csv) && /,GBP\r?\n|,GBP$/m.test(csv), csv.split('\n').slice(0, 3).join(' / '));
  // The costs box: income in euros is not taken from costs in pounds.
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('c-paris', { box: 'budget' })));
  await page.waitForSelector('#blk-budget .mn-costs');
  const costs = await page.locator('#blk-budget .mn-costs').innerText();
  ok('the costs box shows the income in euros and works out no profit across currencies', /€400/.test(costs) && !/expected profit/.test(costs) && (await page.locator('.mn-cost-abroad').count()) === 1, costs.replace(/\n/g, ' '));

  /* ---------------- a document in dollars, sent from pounds ---------------- */
  const usd = await run(page, () => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-doc.js'), import('./js/money-currency.js')]).then(([s, m, md, c]) => {
    const inv = s.byId('bookings', 'c-home').invoice;
    m.saveDoc('c-home', 'invoice', { ...inv, ...c.docFields(c.choiceFor('US')) });
    const snap = m.snapshot(s.byId('bookings', 'c-home'), 'invoice');
    return { text: md.docText(snap), showCode: snap.showCode, clean: md.cleanSnapshot(JSON.parse(JSON.stringify(snap))).showCode, mail: decodeURIComponent(m.mailtoFor('c-home', 'invoice')) };
  }));
  ok('a document in dollars from someone in pounds names USD by its total, for the client abroad', usd.showCode === true && usd.clean === true && /Total \(USD\): \$900\.00/.test(usd.text), usd.text.split('\n').filter(l => /Total/.test(l)).join(' | '));
  ok('…and in the email to the client', /Wedding, Bath: \$900\.00 USD/.test(usd.mail), usd.mail.slice(0, 200));

  /* ---------------- a document from before ---------------- */
  const before = await run(page, () => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-currency.js')]).then(([s, m, c]) => {
    s.upsert('bookings', { id: 'c-old', kind: 'other', status: 'done', date: '2026-01-02', title: 'Old', fee: 50, invoice: { number: 'OLD-1', status: 'sent', issued: '2026-01-02', lines: [{ id: 'l', desc: 'Fee', qty: 1, price: 50 }], payments: [] } });
    const snap = m.snapshot(s.byId('bookings', 'c-old'), 'invoice'), b = s.byId('bookings', 'c-old');
    return { sym: snap.currency, code: snap.code, cur: c.docCur(b.invoice), stored: 'currency' in b.invoice };
  }));
  ok('a document from before has no currency of its own and is in yours', before.sym === '£' && before.code === 'GBP' && before.cur.sym === '£' && !before.stored, JSON.stringify(before));

  /* ---------------- sync, backups and the store keep it all ---------------- */
  const kept = await run(page, () => import('./js/store.js').then(s => {
    const raw = JSON.parse(s.exportJSON()), n = s.normalise(raw);
    const remote = JSON.parse(JSON.stringify(raw)), rb = remote.bookings.find(b => b.id === 'c-berlin');
    rb.invoice = { ...rb.invoice, currency: 'kr', code: 'SEK', country: 'SE' }; rb.updatedAt = Date.now() + 5000;
    remote.billing = { ...remote.billing, currencyCode: 'SEK', currencyCountry: 'SE', updatedAt: Date.now() + 5000 };
    const m = s.mergeDb(raw, remote);
    const nb = n.bookings.find(b => b.id === 'c-berlin').invoice, mb = m.bookings.find(b => b.id === 'c-berlin').invoice;
    return { norm: [n.billing.currencyCode, n.billing.currencyCountry, nb.currency, nb.code, nb.country], merged: [m.billing.currencyCode, m.billing.currencyCountry, mb.currency, mb.code, mb.country] };
  }));
  ok('the store’s normalise keeps your country and each document’s currency', JSON.stringify(kept.norm) === JSON.stringify(['GBP', 'GB', '€', 'EUR', 'DE']), JSON.stringify(kept.norm));
  ok('a merge from another device takes the newer currency, document by document', JSON.stringify(kept.merged) === JSON.stringify(['SEK', 'SE', 'kr', 'SEK', 'SE']), JSON.stringify(kept.merged));
  const restored = await run(page, () => import('./js/store.js').then(s => { const file = JSON.parse(s.exportJSON()); s.replaceAll(file); const b = s.byId('bookings', 'c-berlin'); return [s.db.billing.currencyCountry, b.invoice.currency, b.invoice.code, b.invoice.country]; }));
  ok('a backup brought back keeps them', JSON.stringify(restored) === JSON.stringify(['GB', '€', 'EUR', 'DE']), JSON.stringify(restored));

  /* ---------------- the welcome tour ---------------- */
  await page.evaluate(() => import('./js/tour.js').then(m => m.startTour()));
  await page.waitForSelector('.tour-card');
  await page.click('.tour-actions .btn.primary');
  await page.waitForSelector('.tour-form select[data-key="currency"]');
  const tourSel = await page.$eval('.tour-form select[data-key="currency"]', s => ({ value: s.value, first: s.options[0].value }));
  ok('the welcome tour asks for the currency with the same chooser', tourSel.value === 'GB' && tourSel.first === 'GB', JSON.stringify(tourSel));
  await page.selectOption('.tour-form select[data-key="currency"]', 'DE');
  await page.click('.tour-actions .btn.primary'); await sleep(250);
  d = await dbNow(page);
  ok('…and Next saves the country picked', d.profile.currency === '€' && d.billing.currencyCode === 'EUR' && d.billing.currencyCountry === 'DE', JSON.stringify([d.profile.currency, d.billing.currencyCode, d.billing.currencyCountry]));
  await page.keyboard.press('Escape'); await sleep(200);

  /* ---------------- a role without money ---------------- */
  await page.evaluate(() => import('./js/roles.js').then(m => m.setRole('scout')));
  await sleep(200);
  await go(page, 'settings');
  await page.evaluate(() => { document.getElementById('se-profile').open = true; });
  ok('a role without money has no Quotes & invoices, and keeps its currency in Your details', (await page.locator('#se-billing').count()) === 0 && /Germany — € EUR/.test(await page.locator('#se-profile .se-kv').innerText()));
  await page.evaluate(() => import('./js/pages/settings.js').then(m => m.editProfile()));
  await page.waitForSelector('.sheet[aria-label="Your details"] select[data-key="currency"]');
  ok('…with the same chooser in its details form', (await page.inputValue('.sheet[aria-label="Your details"] [data-key="currency"]')) === 'DE');
  await page.keyboard.press('Escape'); await sleep(150);

  ok('the client page has no console errors', clientErrors.length === 0, clientErrors.join(' | '));
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL currency crashed — ' + e.message); process.exit(1); });
