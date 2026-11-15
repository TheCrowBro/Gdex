// The currency, chosen by country (js/money-currency.js; the owner, 15 Nov 2026: "Quote's and invoices should let you
// choose your country currency"): one chooser of every country with its currency, sorted by name, with this device's
// country suggested first (the browser here is en-GB) and the default left at $ / USD; picking one sets the symbol, the
// code and the country together, in the profile, at the top of Settings → Quotes & invoices, in Your details and in the
// welcome tour, with the old "Currency for payment links" folded in. Each quote and invoice has its own currency, from
// the same list: an invoice picked into euros has € on it and its Pay buttons, link and bank QR in EUR (Venmo, Cash App
// and Monzo only in their own currency, a card page with {amount} only in yours); a quote in euros becomes an invoice in
// euros; the Money page and the search never add two currencies together or show one as another. What was stored
// before reads as it did ('$', 'kr' with SEK, 'kr' alone as the device's krone, never written into a document, a symbol
// typed by hand, a document from before, kept in its currency when yours becomes another), sync, backups and the store keep the new fields, and a merge never parts a symbol from its code nor lets a
// currency picked on a new device wipe the billing settings of another. Other devices: de-DE (a fresh device's tour and
// a merge), nb-NO and da-DK ('kr'), en-US, en-AU, en-CA (a Canadian invoicing in US dollars), and in the licence leg a
// role read-only.
const { ok, sleep, go, topSheet, BASE, licenceLeg } = require('../helpers.cjs');
const { chromium } = require('playwright');
const LIVE = process.env.TOURBOOK_LICENCE === 'on';

// Like helpers.open, in a browser set to a language and country; errors are collected into errors.
async function openIn(locale, { browser = null, errors = [], init = null } = {}) {
  browser = browser || await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block', acceptDownloads: true, locale });
  await ctx.addInitScript(() => { try { localStorage.setItem('tourbook-tour', 'done'); localStorage.setItem('tourbook-role-nudged', '1'); localStorage.setItem('tourbook-ask-seen', 'off'); } catch (e) { /* ignore */ } });
  if (init) await ctx.addInitScript(init); // before the licence leg's seed, which fills in only what is absent
  await licenceLeg(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${locale}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(`${locale}: ${m.text()}`); });
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
// The welcome tour's details card.
async function tourCard(page) {
  await page.evaluate(() => import('./js/tour.js').then(m => m.startTour()));
  await page.waitForSelector('.tour-card');
  await page.click('.tour-actions .btn.primary');
  await page.waitForSelector('.tour-form');
}
// The Money page's rows in the search for words.
async function searchMoney(page, q) {
  await page.fill('#srch-box', q); await page.waitForSelector('#srch-q', { timeout: 3000 }).catch(() => {}); await sleep(200);
  await page.click('#srch-tab-money'); await sleep(200);
  const rows = await page.$$eval('.srch-list .srch-rec', els => els.map(e => [e.dataset.id, (e.querySelector('.srch-amt') || { textContent: '' }).textContent]));
  await page.keyboard.press('Escape'); await sleep(150); await page.fill('#srch-box', ''); await page.keyboard.press('Escape'); await sleep(150);
  return rows;
}

(async () => {
  const errors = [];
  const { browser, ctx, page } = await openIn('en-GB', { errors });
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
  ok('…and the section’s lead and its walkthrough step say so', /^Your currency, numbering, tax and payment details for your quotes and invoices/.test(await page.locator('#se-billing .se-money > p').first().innerText())
    && await run(page, () => import('./js/pages/settings.js').then(m => /^Your currency, /.test(((m.settings.tutorial() || []).find(s => /Quotes & invoices/.test(s.title)) || {}).text || ''))));
  ok('this device’s country (en-GB) is suggested first', opts.first === 'GB' && JSON.stringify(opts.tips) === JSON.stringify([['GB', 'United Kingdom — £ GBP']]) && JSON.stringify(opts.groups) === JSON.stringify(['Suggested', 'Every country']), JSON.stringify(opts.tips));
  const names = opts.all.map(o => o[1].split(' — ')[0]);
  const sorted = await run(page, list => { const c = new Intl.Collator(navigator.language); return list.slice().sort((a, b) => c.compare(a, b)); }, names);
  ok('every country is listed, sorted by its name, each with its currency', opts.all.length >= 240 && JSON.stringify(names) === JSON.stringify(sorted) && opts.all.some(o => o[1] === 'Germany — € EUR') && opts.all.some(o => o[1] === 'Sweden — kr SEK') && opts.all.some(o => o[1] === 'Switzerland — CHF') && opts.all.some(o => o[1] === 'Japan — ¥ JPY'), `${opts.all.length} · ${opts.all.slice(0, 3).map(o => o[1]).join(' | ')}`);
  let pick = await chosen(page), d = await dbNow(page);
  ok('a new device keeps $ and USD: the region is only suggested', pick.value === 'US' && pick.label === 'United States — $ USD' && d.profile.currency === '$' && !d.profile.currencyCode && !d.profile.currencyCountry && !d.billing.currencyCode && (await fmt(page, 1250)) === '$1,250', JSON.stringify([pick, d.profile, d.billing]));
  ok('the old “Currency for payment links” is gone: one place sets the currency', (await page.locator('#mn-bl-currencyCode').count()) === 0 && !/Currency for payment links/.test(await page.locator('#se-billing').innerText()));

  /* ---------------- what was stored before ---------------- */
  // As an older version left it: the symbol in the profile, any code in billing (the old "Currency for payment links").
  const as = async (sym, code) => {
    await run(page, ([sym, code]) => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, currency: sym, currencyCode: '', currencyCountry: '' }; d.billing = { ...d.billing, currencyCode: code }; delete d.billing.currencyCountry; })), [sym, code]);
    await billing(page); await sleep(100);
    return { pick: await chosen(page), money: await fmt(page, 1250), code: await run(page, () => import('./js/money.js').then(m => m.currencyCode())) };
  };
  let old = await as('kr', 'SEK');
  ok('a stored kr with SEK reads as Sweden, kr and SEK, as before', old.pick.value === 'SE' && old.pick.label === 'Sweden — kr SEK' && old.money === 'kr\u00a01,250' && old.code === 'SEK', JSON.stringify(old));
  old = await as('kr', 'NOK');
  ok('…and kr with NOK as Norway', old.pick.value === 'NO' && old.code === 'NOK', JSON.stringify(old));
  old = await as('kr', '');
  ok('…and kr alone, on a device outside the krone countries, as Sweden (SEK), as before', old.pick.value === 'SE' && old.code === 'SEK', JSON.stringify(old));
  old = await as('Fr.', '');
  ok('a symbol typed by hand is shown as it is, as Other, until a country is picked', old.pick.value === 'keep' && old.pick.label === 'Other — Fr.' && old.money === 'Fr.1,250', JSON.stringify(old));
  old = await as('A$', '');
  ok('an older A$ keeps its symbol, with its code', old.pick.value === 'keep' && old.pick.label === 'Other — A$ AUD' && old.money === 'A$1,250' && old.code === 'AUD', JSON.stringify(old));
  old = await as('€', '');
  ok('the euro with no country (and a device outside the eurozone) reads as the euro', old.pick.value === 'keep' && old.pick.label === 'Euro — € EUR' && old.code === 'EUR', JSON.stringify(old));
  // A symbol that ends in a letter (CHF, kr, zł, F CFA) is kept off the number by a no-break space, as Intl writes it,
  // in the app and on the documents clients get; $, £, €, R$ stay against it.
  const gaps = await run(page, () => Promise.all([import('./js/model.js'), import('./js/money-doc.js')]).then(([m, md]) => [m.fmtMoney(1250, 'CHF'), m.fmtMoney(-80, 'zł'), md.fmtDoc(9000, 'kr'), md.fmtDoc(5, 'F CFA'), m.fmtMoney(1250, '£'), m.fmtMoney(1250, 'R$'), md.fmtDoc(1250, '€'), md.fmtDoc(-3, '$')]));
  ok('an amount in CHF, kr, zł or F CFA has a no-break space after the symbol (CHF 1,250); in $, £, €, R$ none', JSON.stringify(gaps) === JSON.stringify(['CHF\u00a01,250', '−zł\u00a080', 'kr\u00a09,000.00', 'F CFA\u00a05.00', '£1,250', 'R$1,250', '€1,250.00', '-$3.00']), JSON.stringify(gaps));
  // Your details saved without picking another country changes nothing stored.
  await as('Fr.', '');
  await go(page, 'settings');
  await page.evaluate(() => import('./js/pages/settings.js').then(m => m.editProfile()));
  await page.waitForSelector('.sheet[aria-label="Your details"] select[data-key="currency"]');
  ok('Your details has the same chooser, showing the typed symbol as it is', (await page.inputValue('.sheet[aria-label="Your details"] [data-key="currency"]')) === 'keep' && (await page.locator('.sheet[aria-label="Your details"] [data-key="currency"] optgroup[label="Suggested"] option[value="GB"]').count()) === 1);
  await page.fill('.sheet[aria-label="Your details"] [data-key="name"]', 'Maya Brooks');
  await saveEditor(page);
  d = await dbNow(page);
  ok('saving your details without picking a country leaves the currency as it was', d.profile.name === 'Maya Brooks' && d.profile.currency === 'Fr.' && !d.profile.currencyCode && !d.profile.currencyCountry && !d.billing.currencyCode, JSON.stringify([d.profile, d.billing]));

  /* ---------------- picking your country ---------------- */
  await billing(page);
  const billingBefore = JSON.stringify((await dbNow(page)).billing);
  await page.selectOption('#mn-bl-currency', 'GB');
  await sleep(250);
  d = await dbNow(page);
  ok('picking United Kingdom sets £, GBP and the country together, in the profile', d.profile.currency === '£' && d.profile.currencyCode === 'GBP' && d.profile.currencyCountry === 'GB' && (await fmt(page, 1250)) === '£1,250', JSON.stringify(d.profile));
  ok('…and leaves the billing settings (numbering, tax, payment details) and their time as they were', JSON.stringify(d.billing) === billingBefore, JSON.stringify([billingBefore, d.billing]));
  await page.evaluate(() => { document.getElementById('se-profile').open = true; });
  ok('…and the chooser and Your details show it', (await chosen(page)).value === 'GB' && /United Kingdom — £ GBP/.test(await page.locator('#se-profile .se-kv').innerText()), await page.locator('#se-profile .se-kv').innerText());
  ok('…and the closed line of Quotes & invoices starts with it', /^£ GBP · /.test(await page.locator('#se-billing .se-sub').innerText()), await page.locator('#se-billing .se-sub').innerText());
  // Euros picked in another country than the device's: the chooser shows the one picked, not the first that uses the euro.
  await page.selectOption('#mn-bl-currency', 'IE'); await sleep(200);
  ok('a country that shares its currency is shown as the one picked', (await chosen(page)).value === 'IE' && (await dbNow(page)).profile.currencyCountry === 'IE');
  await page.selectOption('#mn-bl-currency', 'GB'); await sleep(200);

  /* ---------------- an invoice in euros ---------------- */
  await run(page, ([later]) => Promise.all([import('./js/store.js'), import('./js/money.js')]).then(([s, m]) => {
    m.setBilling({ paypal: 'nightowls', venmo: '@owls', cashapp: '$owls', revolut: 'https://monzo.me/nightowls', payLink: 'https://buy.stripe.com/x?amount={amount}', payLinkLabel: 'Pay by card', accountName: 'The Night Owls', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX' });
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
    const snap = m.snapshot(s.byId('bookings', 'c-berlin'), 'invoice'), ctx = { amount: md.calc(snap).due, code: snap.code, reference: snap.number, own: snap.own };
    return { cur: snap.currency, code: snap.code, own: snap.own, buttons: p.payButtons(snap.pay, ctx), qr: p.bankQr(snap.pay, ctx), text: md.docText(snap) };
  }));
  const btn = (list, id) => (list.find(x => x.id === id) || {}).href || '';
  ok('its Pay button asks for euros', pay.cur === '€' && pay.code === 'EUR' && pay.own === false && btn(pay.buttons, 'paypal') === 'https://paypal.me/nightowls/250.00EUR', JSON.stringify(pay.buttons));
  ok('Venmo and Cash App (dollars only) and Monzo (pounds only) open with no amount in euros, the reference kept; the card page set up in yours, with {amount}, is left off', !/amount=/.test(btn(pay.buttons, 'venmo')) && /&note=/.test(btn(pay.buttons, 'venmo')) && btn(pay.buttons, 'cashapp') === 'https://cash.app/$owls' && /^https:\/\/monzo\.me\/nightowls\?d=/.test(btn(pay.buttons, 'monzo')) && !btn(pay.buttons, 'link'), JSON.stringify(pay.buttons));
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
  const hrefs = await client.$$eval('a.pay-btn', as => as.map(a => [a.dataset.pay, a.getAttribute('href')]));
  ok('…where only PayPal carries the amount: Venmo, Cash App and Monzo without it, and no card page', hrefs.filter(([, h]) => /250\.00/.test(h)).map(x => x[0]).join() === 'paypal' && ['venmo', 'cashapp', 'monzo'].every(k => hrefs.some(x => x[0] === k)) && !hrefs.some(x => x[0] === 'link'), JSON.stringify(hrefs));
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
  ok('a quote can be in euros while yours is pounds', b.quote.currency === '€' && b.quote.code === 'EUR' && b.quote.country === 'FR' && /€400/.test(await page.locator('#blk-money summary').innerText()), JSON.stringify([b.quote.currency, b.quote.code]));
  await page.click('#mn-quote-to-invoice'); await sleep(250);
  b = await booking(page, 'c-paris');
  ok('the invoice made from it is in euros too', b.invoice.currency === '€' && b.invoice.code === 'EUR' && b.invoice.country === 'FR', JSON.stringify([b.invoice.currency, b.invoice.code]));
  await page.click('#mn-sent-invoice'); await sleep(200);
  await openBox(page, 'c-home');
  await page.click('#mn-make-invoice'); await sleep(250);
  await page.click('#mn-sent-invoice'); await sleep(200);
  b = await booking(page, 'c-home');
  ok('…and one at home, sent in pounds, keeps the currency it went out in', b.invoice.currency === '£' && b.invoice.code === 'GBP' && b.invoice.country === 'GB' && b.invoice.status === 'sent', JSON.stringify([b.invoice.currency, b.invoice.code]));
  const home = await run(page, () => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-pay.js'), import('./js/money-doc.js')]).then(([s, m, p, md]) => {
    const snap = m.snapshot(s.byId('bookings', 'c-home'), 'invoice');
    return { number: snap.number, own: snap.own, buttons: p.payButtons(snap.pay, { amount: md.calc(snap).due, code: snap.code, reference: snap.number, own: snap.own }) };
  }));
  ok('an invoice in your own pounds: Monzo and the card page fill in the amount, PayPal asks for GBP, Venmo (dollars only) does not', home.own === true && btn(home.buttons, 'monzo') === `https://monzo.me/nightowls/900.00?d=${home.number}` && btn(home.buttons, 'link') === 'https://buy.stripe.com/x?amount=900.00' && btn(home.buttons, 'paypal') === 'https://paypal.me/nightowls/900.00GBP' && !/amount=/.test(btn(home.buttons, 'venmo')), JSON.stringify(home));
  // The search's Money tab: each document in its own currency.
  await go(page, 'bookings');
  const paris = await searchMoney(page, 'Paris'), bath = await searchMoney(page, 'Bath');
  const amtOf = (rows, id) => (rows.find(r => r[0] === id) || [])[1];
  ok('the search’s Money tab shows the Paris invoice and quote in euros, and the one at home in pounds', amtOf(paris, 'invoice:c-paris') === '€400' && amtOf(paris, 'quote:c-paris') === '€400' && !paris.some(r => /£/.test(r[1])) && amtOf(bath, 'invoice:c-home') === '£900', JSON.stringify([paris, bath]));
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
  const stat = (id, p = page) => p.locator(`#mn-stat-${id} b`).innerText();
  const st = { earned: await stat('earned'), invoiced: await stat('invoiced'), unpaid: await stat('unpaid') };
  ok('the Money page totals each currency on its own: never £ and € added together', st.unpaid === '£900 GBP\n€400 EUR' && st.invoiced === '£900 GBP\n€400 EUR' && !/1,300/.test(Object.values(st).join(' ')), JSON.stringify(st));
  ok('earned too: pounds from home, euros from Paris', /£900 GBP/.test(st.earned) && /€400 EUR/.test(st.earned), JSON.stringify(st.earned));
  const unpaidList = await page.locator('.mn-unpaid').innerText();
  ok('each unpaid invoice shows its own currency', /€400/.test(unpaidList) && /£900/.test(unpaidList), unpaidList.replace(/\n/g, ' '));
  const jan = await page.locator('.mn-bar-row').first().innerText();
  ok('a month’s bar is in pounds, with the euros beside it', /£900/.test(jan) && /€400 EUR/.test(jan), jan.replace(/\n/g, ' '));
  const noAct = page.locator('.mn-act', { hasText: 'No act' }).first();
  const act = { earned: await noAct.locator('.mn-amt b').innerText(), sub: await noAct.locator('.mn-act-sub').innerText() };
  ok('By act: the act’s earnings and profit per currency, never added across', act.earned === '£900 GBP\n€400 EUR' && /profit £900 GBP \+ €400 EUR/.test(act.sub) && !/1,300/.test(act.earned + act.sub), JSON.stringify(act));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#mn-csv-invoices')]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  ok('the invoices spreadsheet has a currency column', /Paid on,Currency/.test(csv) && /,EUR\r?\n|,EUR$/m.test(csv) && /,GBP\r?\n|,GBP$/m.test(csv), csv.split('\n').slice(0, 3).join(' / '));
  // The costs box: income in euros is not taken from costs in pounds.
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('c-paris', { box: 'budget' })));
  await page.waitForSelector('#blk-budget .mn-costs');
  const costs = await page.locator('#blk-budget .mn-costs').innerText();
  ok('the costs box shows the income in euros and works out no profit across currencies', /€400/.test(costs) && !/expected profit/.test(costs) && (await page.locator('.mn-cost-abroad').count()) === 1, costs.replace(/\n/g, ' '));
  // A cancelled booking brings nothing in, whatever its invoice's currency: the box shows the loss, in yours.
  await run(page, ([Y]) => import('./js/store.js').then(s => s.upsert('bookings', { id: 'c-off', kind: 'other', status: 'cancelled', date: `${Y}-01-07`, title: 'Called off, Ghent', fee: 400, budget: [{ id: 'k1', cat: 'Travel', desc: 'Flights', amount: 200 }], invoice: { number: 'X-9', status: 'sent', issued: `${Y}-01-07`, lines: [{ id: 'l', desc: 'Fee', qty: 1, price: 400 }], payments: [], currency: '€', code: 'EUR', country: 'BE', sentAt: Date.now() } })), [Y]);
  await page.evaluate(() => import('./js/pages/bookings.js').then(m => m.openBooking('c-off', { box: 'budget' })));
  await page.waitForSelector('#blk-budget .mn-costs'); await sleep(300);
  const off = await page.locator('#blk-budget .mn-cost-stats').innerText();
  ok('a cancelled booking with its invoice in euros: £0 income and the loss in pounds (−£200), no word about two currencies', /£0\s*income \(cancelled\)/.test(off) && /−£200\s*expected profit/.test(off) && (await page.locator('.mn-cost-abroad').count()) === 0, off.replace(/\n/g, ' '));
  await run(page, () => import('./js/store.js').then(s => s.remove('bookings', 'c-off')));

  /* ---------------- paid, overdue and the shows' spreadsheet, per currency ---------------- */
  // Two shows invoiced, one in pounds and one in euros, each part paid today and past its due date.
  await run(page, ([Y]) => Promise.all([import('./js/store.js'), import('./js/util.js')]).then(([s, u]) => {
    const today = u.todayISO(), d = new Date(); d.setDate(d.getDate() - 1);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const inv = (number, price, paid, cur) => ({ number, status: 'sent', issued: `${Y}-01-05`, due: yesterday, lines: [{ id: 'l1', desc: 'Fee', qty: 1, price }], payments: [{ id: 'p1', date: today, amount: paid, method: 'Bank transfer' }], ...cur, sentAt: Date.now() });
    s.upsert('bookings', { id: 'c-p1', kind: 'show', status: 'done', date: `${Y}-01-05`, title: 'Leeds', deal: { type: 'guarantee', fee: 500 }, invoice: inv('P-1', 500, 200, { currency: '£', code: 'GBP', country: 'GB' }) });
    s.upsert('bookings', { id: 'c-p2', kind: 'show', status: 'done', date: `${Y}-01-06`, title: 'Lyon', deal: { type: 'guarantee', fee: 700 }, invoice: inv('P-2', 700, 100, { currency: '€', code: 'EUR', country: 'FR' }) });
  }), [Y]);
  await go(page, 'bookings'); await go(page, 'money');
  await page.waitForSelector('.mn-stats');
  const st2 = { paid: await stat('paid'), overdue: await stat('overdue') };
  ok('paid and overdue are each one line per currency, never added together', st2.paid === '£200 GBP\n€100 EUR' && st2.overdue === '£300 GBP\n€600 EUR', JSON.stringify(st2));
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#mn-csv-shows')]);
  const shows = require('fs').readFileSync(await dl2.path(), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  ok('the shows’ spreadsheet ends with the fee’s currency', /,Settled,Fee currency$/.test(shows[0]) && /,EUR$/.test(shows.find(l => l.startsWith(`${Y}-01-06`)) || '') && /,GBP$/.test(shows.find(l => l.startsWith(`${Y}-01-05`)) || ''), shows.slice(0, 4).join(' / '));
  await run(page, () => import('./js/store.js').then(s => { s.remove('bookings', 'c-p1'); s.remove('bookings', 'c-p2'); }));

  /* ---------------- a document in dollars, sent from pounds ---------------- */
  const usd = await run(page, () => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-doc.js'), import('./js/money-currency.js')]).then(([s, m, md, c]) => {
    const inv = s.byId('bookings', 'c-home').invoice;
    m.saveDoc('c-home', 'invoice', { ...inv, ...c.docFields(c.choiceFor('US')) });
    const snap = m.snapshot(s.byId('bookings', 'c-home'), 'invoice');
    return { text: md.docText(snap), showCode: snap.showCode, clean: md.cleanSnapshot(JSON.parse(JSON.stringify(snap))).showCode, mail: decodeURIComponent(m.mailtoFor('c-home', 'invoice')) };
  }));
  ok('a document in dollars from someone in pounds names USD by its total, for the client abroad', usd.showCode === true && usd.clean === true && /Total \(USD\): \$900\.00/.test(usd.text), usd.text.split('\n').filter(l => /Total/.test(l)).join(' | '));
  ok('…and in the email to the client', /Wedding, Bath: \$900\.00 USD/.test(usd.mail), usd.mail.slice(0, 200));

  /* ---------------- a quote's deposit note follows its currency ---------------- */
  await run(page, ([later]) => import('./js/store.js').then(s => s.upsert('bookings', { id: 'c-dep', kind: 'show', status: 'confirmed', date: later, title: 'Lille, Aéronef', deal: { type: 'guarantee', fee: 1200, deposit: 300, depositPaid: false, depositDue: later } })), [later]);
  await openBox(page, 'c-dep');
  await page.click('#mn-tab-quote'); await sleep(150);
  await page.click('#mn-make-quote'); await sleep(250);
  await page.click('#mn-edit-quote');
  await page.waitForSelector('#mn-ed-currency');
  const dep = { start: await page.inputValue('#mn-ed-notes') };
  await page.selectOption('#mn-ed-currency', 'CH'); await sleep(100);
  dep.ch = await page.inputValue('#mn-ed-notes');
  await page.selectOption('#mn-ed-currency', 'FR'); await sleep(100);
  dep.fr = await page.inputValue('#mn-ed-notes');
  await saveEditor(page);
  dep.text = await run(page, () => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-doc.js')]).then(([s, m, md]) => md.docText(m.snapshot(s.byId('bookings', 'c-dep'), 'quote'))));
  ok('a quote put into euros in its editor: the deposit note Tourbook wrote follows its currency (CHF 300.00, then €300.00), and the client reads €300.00', /^Deposit: £300\.00 by /.test(dep.start) && /^Deposit: CHF\u00a0300\.00 by /.test(dep.ch) && /^Deposit: €300\.00 by /.test(dep.fr) && /Total: €1,200\.00/.test(dep.text) && /Deposit: €300\.00 by /.test(dep.text) && !/Deposit: £/.test(dep.text), JSON.stringify(dep));
  await run(page, () => import('./js/store.js').then(s => s.remove('bookings', 'c-dep')));

  /* ---------------- a document from before ---------------- */
  const before = await run(page, () => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-currency.js')]).then(([s, m, c]) => {
    s.upsert('bookings', { id: 'c-old', kind: 'other', status: 'done', date: '2026-01-02', title: 'Old', fee: 50, invoice: { number: 'OLD-1', status: 'sent', issued: '2026-01-02', lines: [{ id: 'l', desc: 'Fee', qty: 1, price: 50 }], payments: [] } });
    const snap = m.snapshot(s.byId('bookings', 'c-old'), 'invoice'), b = s.byId('bookings', 'c-old');
    return { sym: snap.currency, code: snap.code, cur: c.docCur(b.invoice), stored: 'currency' in b.invoice };
  }));
  ok('a document from before has no currency of its own and is in yours', before.sym === '£' && before.code === 'GBP' && before.cur.sym === '£' && !before.stored, JSON.stringify(before));
  // …until yours becomes another currency: then a document sent before keeps the one it went out in (stamped on it, with
  // a new time on its booking so every device takes it in), and a payment recorded later keeps it; a draft still follows.
  const moved = await run(page, () => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-currency.js')]).then(([s, m, c]) => {
    const asBefore = () => s.update(d => { d.profile = { ...d.profile, currency: '£', currencyCode: '', currencyCountry: '' }; d.billing = { ...d.billing, currencyCode: '' }; d.bookings.find(x => x.id === 'c-old').updatedAt = 1000; }); // yours as the live version kept it
    s.upsert('bookings', { id: 'c-old-draft', kind: 'other', status: 'confirmed', date: '2026-12-02', title: 'Old draft', fee: 20, invoice: { number: 'OLD-2', status: 'draft', issued: '2026-01-02', lines: [{ id: 'l', desc: 'Fee', qty: 1, price: 20 }], payments: [] } });
    asBefore(); c.setMine(c.choiceFor('GB')); // the same pound, its code stored now: nothing to keep
    const same = { stamped: 'currency' in s.byId('bookings', 'c-old').invoice, time: s.byId('bookings', 'c-old').updatedAt };
    asBefore(); c.setMine(c.choiceFor('DE')); // you move: yours becomes the euro
    const b = s.byId('bookings', 'c-old'), inv = b.invoice;
    m.saveDoc('c-old', 'invoice', { ...inv, payments: [{ id: 'p', date: '2026-01-03', amount: 50, method: 'Bank transfer' }] }); // the UK client pays
    const after = s.byId('bookings', 'c-old').invoice, cur = c.docCur(after);
    const out = { same, stored: [inv.currency, inv.code], time: b.updatedAt, paid: [after.currency, after.status, `${cur.sym} ${cur.code}`], draft: c.docCur(s.byId('bookings', 'c-old-draft').invoice).code };
    c.setMine(c.choiceFor('GB')); s.remove('bookings', 'c-old-draft');
    return out;
  }));
  ok('picking another country with the same £ stamps nothing; picking Germany (from £ with no code) keeps a document sent before in £ (read as GBP), with a new time; a payment then keeps £; a draft follows (EUR)', !moved.same.stamped && moved.same.time === 1000 && JSON.stringify(moved.stored) === '["£",""]' && moved.time > 1000 && JSON.stringify(moved.paid) === '["£","paid","£ GBP"]' && moved.draft === 'EUR', JSON.stringify(moved));
  const oldLink = await run(page, () => import('./js/money-doc.js').then(md => md.cleanSnapshot({ kind: 'invoice', number: 'X-1', currency: '£', code: 'GBP' }).own));
  ok('a client link made before has no “own” flag and counts as in the sender’s currency, as it was', oldLink === true);

  /* ---------------- sync, backups and the store keep it all ---------------- */
  const kept = await run(page, () => import('./js/store.js').then(s => {
    const raw = JSON.parse(s.exportJSON()), n = s.normalise(raw);
    const remote = JSON.parse(JSON.stringify(raw)), rb = remote.bookings.find(b => b.id === 'c-berlin');
    rb.invoice = { ...rb.invoice, currency: 'kr', code: 'SEK', country: 'SE' }; rb.updatedAt = Date.now() + 5000;
    remote.profile = { ...remote.profile, currency: 'kr', currencyCode: 'SEK', currencyCountry: 'SE', updatedAt: Date.now() + 5000 };
    const m = s.mergeDb(raw, remote);
    const nb = n.bookings.find(b => b.id === 'c-berlin').invoice, mb = m.bookings.find(b => b.id === 'c-berlin').invoice;
    return { norm: [n.profile.currency, n.profile.currencyCode, n.profile.currencyCountry, nb.currency, nb.code, nb.country], merged: [m.profile.currency, m.profile.currencyCode, m.profile.currencyCountry, mb.currency, mb.code, mb.country] };
  }));
  ok('the store’s normalise keeps your currency and each document’s', JSON.stringify(kept.norm) === JSON.stringify(['£', 'GBP', 'GB', '€', 'EUR', 'DE']), JSON.stringify(kept.norm));
  ok('a merge from another device takes the newer currency, document by document', JSON.stringify(kept.merged) === JSON.stringify(['kr', 'SEK', 'SE', 'kr', 'SEK', 'SE']), JSON.stringify(kept.merged));
  const restored = await run(page, () => import('./js/store.js').then(s => { const file = JSON.parse(s.exportJSON()); s.replaceAll(file); const b = s.byId('bookings', 'c-berlin'); return [s.db.profile.currency, s.db.profile.currencyCode, s.db.profile.currencyCountry, b.invoice.currency, b.invoice.code, b.invoice.country]; }));
  ok('a backup brought back keeps them', JSON.stringify(restored) === JSON.stringify(['£', 'GBP', 'GB', '€', 'EUR', 'DE']), JSON.stringify(restored));
  // Two devices, one picking a country and the other changing something else later: the merge keeps the symbol and the
  // code together (they are one record), whichever order it runs in.
  const pairs = await run(page, () => Promise.all([import('./js/store.js'), import('./js/money-currency.js')]).then(([s, c]) => {
    const saved = JSON.parse(s.serialize()), clone = x => JSON.parse(JSON.stringify(x)), t = Date.now();
    const at = (d, f, when) => { const x = clone(d); f(x); return x; };
    const read = m => { s.replaceAll(m); const x = c.mine(); return `${x.sym} ${x.code}${c.symbolFor(x.code) === x.sym ? '' : ' MISMATCH'}`; };
    const cases = {};
    const from = (name, base) => {
      const A = at(base, x => { c.applyMine(x, c.choiceFor('DE')); x.profile.updatedAt = t + 1000; });
      const tax = at(base, x => { x.billing = { ...x.billing, taxRate: 7, updatedAt: t + 2000 }; });
      const phone = at(base, x => { x.profile = { ...x.profile, phone: '+44 1632 960000', updatedAt: t + 2000 }; });
      cases[name + ': picked, then tax elsewhere'] = [read(s.mergeDb(A, tax)), read(s.mergeDb(tax, A))];
      cases[name + ': picked, then a phone number elsewhere'] = [read(s.mergeDb(A, phone)), read(s.mergeDb(phone, A))];
    };
    from('GBP', saved);
    from('from before', at(saved, x => { x.profile = { ...x.profile, currency: '£', currencyCode: '', currencyCountry: '' }; x.billing = { ...x.billing, currencyCode: '' }; }));
    // A new device still on $ changes its name after another device picked pounds; a stand-in profile picks against a filled-in one.
    const fresh = at(saved, x => { x.profile = { ...x.profile, name: 'Maya B', currency: '$', currencyCode: '', currencyCountry: '', updatedAt: t + 2000 }; x.billing = { ...x.billing, currencyCode: '' }; });
    const gb = at(saved, x => { x.profile = { ...x.profile, currency: '$', currencyCode: '', currencyCountry: '' }; x.billing = { ...x.billing, currencyCode: '' }; c.applyMine(x, c.choiceFor('GB')); x.profile.updatedAt = t + 1000; });
    cases['$ renamed later, against pounds picked'] = [read(s.mergeDb(gb, fresh)), read(s.mergeDb(fresh, gb))];
    const stand = at(saved, x => { x.profile = { ...x.profile, name: 'Sample Producer', business: 'Sample Sound', currency: '$', currencyCode: '', currencyCountry: '' }; c.applyMine(x, c.choiceFor('JP')); x.profile.updatedAt = t + 3000; });
    cases['the sample’s stand-in picking yen, against a filled-in profile in euros'] = [read(s.mergeDb(stand, saved)), read(s.mergeDb(saved, stand))];
    s.replaceAll(saved);
    return cases;
  }));
  const want = { 'GBP: picked, then tax elsewhere': ['€ EUR', '€ EUR'], 'GBP: picked, then a phone number elsewhere': ['£ GBP', '£ GBP'], 'from before: picked, then tax elsewhere': ['€ EUR', '€ EUR'], 'from before: picked, then a phone number elsewhere': ['£ GBP', '£ GBP'], '$ renamed later, against pounds picked': ['$ USD', '$ USD'], 'the sample’s stand-in picking yen, against a filled-in profile in euros': ['£ GBP', '£ GBP'] };
  ok('a merge never parts your symbol from its code, in either order (a pick, then another device’s later change to billing or your details)', JSON.stringify(pairs) === JSON.stringify(want), JSON.stringify(pairs));

  /* ---------------- the welcome tour ---------------- */
  await tourCard(page);
  const tourSel = await page.$eval('.tour-form select[data-key="currency"]', s => ({ value: s.value, first: s.options[0].value }));
  ok('the welcome tour asks for the currency with the same chooser', tourSel.value === 'GB' && tourSel.first === 'GB', JSON.stringify(tourSel));
  await page.selectOption('.tour-form select[data-key="currency"]', 'DE');
  await page.click('.tour-actions .btn.primary'); await sleep(250);
  d = await dbNow(page);
  ok('…and Next saves the country picked', d.profile.currency === '€' && d.profile.currencyCode === 'EUR' && d.profile.currencyCountry === 'DE', JSON.stringify(d.profile));
  await page.keyboard.press('Escape'); await sleep(200);
  // Next without a pick leaves a symbol typed by hand as it is.
  await run(page, () => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, currency: 'Fr.', currencyCode: '', currencyCountry: '' }; d.billing = { ...d.billing, currencyCode: '' }; })));
  await tourCard(page);
  await page.click('.tour-actions .btn.primary'); await sleep(250);
  d = await dbNow(page);
  ok('…and Next with no country picked leaves a typed Fr. as it is', d.profile.currency === 'Fr.' && !d.profile.currencyCode && !d.profile.currencyCountry && !d.billing.currencyCode, JSON.stringify([d.profile, d.billing.currencyCode]));
  await page.keyboard.press('Escape'); await sleep(200);
  await run(page, () => import('./js/money-currency.js').then(c => c.setMine(c.choiceFor('DE'))));

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
  await tourCard(page);
  const scoutKeys = await page.$$eval('.tour-form [data-key]', els => els.map(e => e.dataset.key));
  ok('…and its welcome tour asks only for a name and what they do: no currency chooser', JSON.stringify(scoutKeys) === JSON.stringify(['name', 'role']) && (await page.locator('.tour-form select[data-key="currency"]').count()) === 0, JSON.stringify(scoutKeys));
  await page.keyboard.press('Escape'); await sleep(150);

  /* ---------------- other devices ---------------- */
  // A fresh device (German) picks Deutschland in the welcome tour, then takes in the Drive copy (or a backup) of another
  // device whose billing holds the bank details, numbering and tax: they all stay (only the profile holds the currency).
  {
    const x = await openIn('de-DE', { browser, errors });
    await tourCard(x.page);
    const first = await x.page.$eval('.tour-form select[data-key="currency"]', s => [s.options[0].value, s.options[0].textContent]);
    await x.page.selectOption('.tour-form select[data-key="currency"]', 'DE');
    await x.page.click('.tour-actions .btn.primary'); await sleep(250);
    await x.page.keyboard.press('Escape'); await sleep(150);
    const r = await x.page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-currency.js')]).then(([s, m, c]) => {
      const local = JSON.parse(s.serialize()), t = Date.now() - 60000, remote = JSON.parse(JSON.stringify(local));
      remote.profile = { ...remote.profile, name: 'Maya Brooks', currency: '£', currencyCode: 'GBP', currencyCountry: 'GB', updatedAt: t };
      remote.billing = { iban: 'DE89 3704 0044 0532 0130 00', paypal: 'nightowls', nextInvoice: 42, nextQuote: 17, taxRate: 19, updatedAt: t };
      const read = () => { const b = m.billing(), me = c.mine(); return [b.nextInvoice, b.nextQuote, b.iban, b.paypal, b.taxRate, `${me.sym} ${me.code}`]; };
      s.adopt(s.mergeDb(s.db, remote)); const sync = read();
      s.replaceAll(local); s.mergeIn(remote); const backup = read();
      return { picked: [local.profile.currency, local.profile.currencyCode, local.billing.updatedAt || 0, 'currencyCode' in local.billing], sync, backup };
    }));
    const keep = JSON.stringify([42, 17, 'DE89 3704 0044 0532 0130 00', 'nightowls', 19, '£ GBP']);
    ok('a fresh German device suggests Deutschland first, and picking it in the tour leaves its billing untouched', first[0] === 'DE' && /^Deutschland — € EUR$/.test(first[1]) && JSON.stringify(r.picked) === JSON.stringify(['€', 'EUR', 0, false]), JSON.stringify([first, r.picked]));
    ok('…then Google Drive’s copy keeps its bank details, numbering (42) and tax, and its own currency', JSON.stringify(r.sync) === keep, JSON.stringify(r.sync));
    ok('…and so does a backup brought in (Bring it in)', JSON.stringify(r.backup) === keep, JSON.stringify(r.backup));
    await x.ctx.close();
  }
  // 'kr' with no code, from before, on a Norwegian and a Danish device: the device's own krone.
  for (const [locale, cc, name, code] of [['nb-NO', 'NO', 'Norge', 'NOK'], ['da-DK', 'DK', 'Danmark', 'DKK']]) {
    const x = await openIn(locale, { browser, errors });
    await run(x.page, () => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, currency: 'kr' }; })));
    await billing(x.page);
    const p = await chosen(x.page);
    const stored = await run(x.page, ([Y]) => Promise.all([import('./js/store.js'), import('./js/money.js')]).then(([s, m]) => {
      s.upsert('bookings', { id: 'k-1', kind: 'other', status: 'done', date: `${Y}-01-03`, title: 'Bryllup', fee: 900 });
      m.createDoc('k-1', 'invoice');
      m.saveDoc('k-1', 'invoice', { ...s.byId('bookings', 'k-1').invoice, status: 'sent' });
      const inv = s.byId('bookings', 'k-1').invoice; return [inv.currency, inv.code];
    }), [Y]);
    ok(`${locale}: a stored kr with no code reads as ${name} (${code}); an invoice sent keeps kr with no code (the device's guess is never written)`, p.value === cc && p.label === `${name} — kr ${code}` && JSON.stringify(stored) === JSON.stringify(['kr', '']), JSON.stringify([p, stored]));
    const text = await run(x.page, cc => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-doc.js'), import('./js/money-currency.js')]).then(([s, m, md, c]) => { c.setMine(c.choiceFor(cc)); return md.docText(m.snapshot(s.byId('bookings', 'k-1'), 'invoice')); }), cc);
    await go(x.page, 'money'); await x.page.waitForSelector('.mn-stats');
    const earned = await stat('earned', x.page);
    ok(`${locale}: after picking ${name}, the Money page has one line (kr 900) and the invoice names no SEK`, earned === 'kr\u00a0900' && !/SEK|\(NOK\)|\(DKK\)/.test(text), JSON.stringify([earned, text.split('\n').filter(l => /Total/.test(l))]));
    await x.ctx.close();
  }
  // Elsewhere 'kr' alone is still Sweden, and '$' alone is still the US dollar, even in Australia.
  {
    const us = await openIn('en-US', { browser, errors });
    await run(us.page, () => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, currency: 'kr' }; })));
    await billing(us.page);
    const p1 = await chosen(us.page);
    await us.ctx.close();
    const au = await openIn('en-AU', { browser, errors });
    await billing(au.page);
    const p2 = await chosen(au.page);
    await au.ctx.close();
    ok('en-US: kr alone reads as Sweden; en-AU: $ alone is still United States $ USD (Australia only suggested)', p1.value === 'SE' && p1.label === 'Sweden — kr SEK' && p2.value === 'US' && p2.label === 'United States — $ USD', JSON.stringify([p1, p2]));
  }
  // One person's data on a Norwegian phone and an English laptop, 'kr' with no code: each device guesses its own krone
  // (NOK, SEK), but the guess is never written, so each has one total and an invoice sent on either is in yours on both.
  {
    const no = await openIn('nb-NO', { browser, errors });
    await run(no.page, ([Y]) => Promise.all([import('./js/store.js'), import('./js/money.js')]).then(([s, m]) => {
      s.update(d => { d.profile = { ...d.profile, currency: 'kr' }; });
      s.upsert('bookings', { id: 'k-1', kind: 'other', status: 'done', date: `${Y}-01-03`, title: 'Bryllup', fee: 900 });
      m.createDoc('k-1', 'invoice'); m.saveDoc('k-1', 'invoice', { ...s.byId('bookings', 'k-1').invoice, status: 'sent' });
    }), [Y]);
    const phone = await dbNow(no.page);
    const en = await openIn('en-GB', { browser, errors });
    const lap = await run(en.page, ([data, Y]) => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-currency.js')]).then(([s, m, c]) => {
      s.replaceAll(data);
      s.upsert('bookings', { id: 'k-2', kind: 'other', status: 'done', date: `${Y}-01-04`, title: 'Fest', fee: 500 });
      m.createDoc('k-2', 'invoice'); m.saveDoc('k-2', 'invoice', { ...s.byId('bookings', 'k-2').invoice, status: 'sent' });
      return { mine: c.mine().code, k1: s.byId('bookings', 'k-1').invoice.code, k2: [s.byId('bookings', 'k-2').invoice.currency, s.byId('bookings', 'k-2').invoice.code] };
    }), [phone, Y]);
    await go(en.page, 'money'); await en.page.waitForSelector('.mn-stats');
    lap.earned = await stat('earned', en.page);
    const laptop = await dbNow(en.page);
    await en.ctx.close();
    const back = await run(no.page, data => Promise.all([import('./js/store.js'), import('./js/money.js'), import('./js/money-currency.js')]).then(([s, m, c]) => {
      s.adopt(s.mergeDb(s.db, data));
      const snap = m.snapshot(s.byId('bookings', 'k-2'), 'invoice');
      return { mine: c.mine().code, code: snap.code, own: snap.own, showCode: snap.showCode };
    }), laptop);
    await go(no.page, 'bookings'); await go(no.page, 'money'); await no.page.waitForSelector('.mn-stats');
    back.earned = await stat('earned', no.page);
    const both = await fmt(no.page, 1400);
    await no.ctx.close();
    ok('the same kr on a Norwegian phone (NOK) and an English laptop (SEK): neither invoice stores a code, and each device has one total, kr 1,400', lap.mine === 'SEK' && lap.k1 === '' && JSON.stringify(lap.k2) === '["kr",""]' && lap.earned === 'kr\u00a01,400' && back.mine === 'NOK' && back.earned === both && !/NOK|SEK/.test(back.earned), JSON.stringify({ lap, back, both }));
    ok('…and back on the phone the laptop’s invoice is in yours: no code by its total, the payment page kept', back.code === 'NOK' && back.own === true && back.showCode === false, JSON.stringify(back));
  }
  // A Canadian ($ CAD) whose only invoice is in US dollars: every amount of it names USD, so it is never read as CAD.
  {
    const x = await openIn('en-CA', { browser, errors });
    await run(x.page, ([Y, later]) => import('./js/store.js').then(s => {
      s.update(d => { d.profile = { ...d.profile, name: 'Maya Brooks', currency: '$', currencyCode: 'CAD', currencyCountry: 'CA', updatedAt: Date.now() }; });
      s.upsert('bookings', { id: 'c-usd', kind: 'other', status: 'done', date: `${Y}-01-04`, title: 'Austin', fee: 400, invoice: { number: 'INV-0001', status: 'sent', issued: `${Y}-01-04`, due: later, lines: [{ id: 'l', desc: 'Fee', qty: 1, price: 400 }], payments: [], currency: '$', code: 'USD', country: 'US', sentAt: Date.now() } });
    }), [Y, later]);
    await go(x.page, 'money'); await x.page.waitForSelector('.mn-stats');
    const m1 = { earned: await stat('earned', x.page), unpaid: await stat('unpaid', x.page), row: await x.page.locator('.mn-unpaid .mn-row').first().innerText(), act: await x.page.locator('.mn-act').first().innerText() };
    await openBox(x.page, 'c-usd');
    m1.box = await x.page.locator('#blk-money summary').innerText();
    ok('$ CAD with only an invoice in US dollars: the tiles, the unpaid row, the act and the box all say USD', /\$400 USD/.test(m1.earned) && /\$400 USD/.test(m1.unpaid) && /\$400 USD/.test(m1.row) && /\$400 USD/.test(m1.act) && /\$400 USD due/.test(m1.box), JSON.stringify(m1));
    await run(x.page, () => Promise.all([import('./js/store.js'), import('./js/money.js')]).then(([s, m]) => { const inv = s.byId('bookings', 'c-usd').invoice; m.saveDoc('c-usd', 'invoice', { ...inv, lines: [{ id: 'l', desc: 'Fee', qty: 1, price: 900 }], currency: '$', code: 'CAD', country: 'CA' }); }));
    await go(x.page, 'money'); await x.page.waitForSelector('.mn-stats');
    const m2 = { earned: await stat('earned', x.page), unpaid: await stat('unpaid', x.page), row: await x.page.locator('.mn-unpaid .mn-row').first().innerText() };
    ok('…while in your own Canadian dollars an amount is a bare $900', m2.earned === '$900' && m2.unpaid === '$900' && /\$900/.test(m2.row) && !/CAD|USD/.test(m2.row), JSON.stringify(m2));
    await x.ctx.close();
  }
  // Read-only (the licence leg, free days over): picking a country changes nothing, and the chooser goes back.
  if (LIVE) {
    const x = await openIn('en-GB', { browser, errors, init: () => { try { const t = Date.now(); if (!localStorage.getItem('tourbook-licence')) localStorage.setItem('tourbook-licence', JSON.stringify({ on: true, statusAt: t, first: t - 31 * 864e5, seen: t - 3600e3 })); localStorage.setItem('tourbook-role', 'producer'); } catch (e) { /* ignore */ } } });
    await x.page.waitForSelector('.sheet.licence-over', { timeout: 6000 }).catch(() => {});
    await sleep(1200);
    await x.page.evaluate(() => { for (const s of [...document.querySelectorAll('.sheet')].reverse()) s.querySelector('.sheet-head [aria-label="Close"]')?.click(); }); await sleep(300);
    const canWrite = await run(x.page, () => import('./js/licence-state.js').then(m => m.canWrite()));
    await billing(x.page);
    const start = (await chosen(x.page)).value, before = JSON.stringify((await dbNow(x.page)).profile);
    // A key pressed on the chooser first: the gate explains a refusal only after a person's own input (selectOption's change is synthetic).
    await x.page.focus('#mn-bl-currency'); await x.page.keyboard.press('Shift');
    await x.page.selectOption('#mn-bl-currency', 'DE'); await sleep(400);
    const after = { value: (await chosen(x.page)).value, profile: JSON.stringify((await dbNow(x.page)).profile), sheet: await x.page.locator('.sheet.licence-readonly').count() };
    ok('read-only (free days over): picking Germany changes nothing stored, the read-only sheet says why, and the chooser goes back', canWrite === false && start === 'US' && after.value === 'US' && after.profile === before && after.sheet === 1, JSON.stringify({ canWrite, start, after }));
    await x.ctx.close();
  }

  ok('the client page has no console errors', clientErrors.length === 0, clientErrors.join(' | '));
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL currency crashed — ' + e.message); process.exit(1); });
