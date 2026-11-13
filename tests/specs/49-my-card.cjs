// My card (js/pages/card.js, the owner's item 14): the contact card as a big QR code on a main page of its own, on
// every role's menu (the Audiophile and Everything too) just before Settings; the name and details under the code;
// Share (the device's share sheet: the .vcf file, or the card as text where files cannot be shared; no button where
// there is no share), Save as a file (.vcf), Edit your details (the form Settings uses); what to add when there is no
// card yet; Show big (the code alone on a plain white screen, as large as fits, the screen kept on, closed by a tap,
// Escape, ✕ Close or Back, the focus back on Show big); Settings → Your details with a line and a button to My card
// instead of the QR; the words in each role's terms; the walkthrough; the search box and no new kind of result; the
// keyboard, the focus and a screen reader's words; 320 px with extra-large text and large buttons; nothing sent anywhere.
const { open, ok, sleep, go } = require('../helpers.cjs');
const fs = require('fs');

const PROFILE = { name: 'Maya Brooks', business: 'Night Owls, Ltd', role: 'Band leader', phone: '+1 555 0141', email: 'maya@example.com', website: 'nightowls.example.com', location: 'Harbourtown', address: '12 Quay Street\nHarbourtown HT1 2AB' };
const CLEAR = { name: '', business: '', role: '', phone: '', email: '', website: '', location: '', address: '' };
// What each role is told the card is for (js/roles.js cardAudience), in the lead line under the heading.
const WHO = {
  producer: 'the artists you record, and the engineers and studios you work with',
  manager: 'promoters, agents and venues',
  band: 'promoters, venues and fans at the merch desk',
  solo: 'promoters, venues and fans at the merch table',
  scout: 'the acts you’re watching and the managers and agents around them',
  audiophile: 'the bands and people you meet at gigs',
  all: 'the artists, promoters, venues and crew you work with',
};
const lead = who => `Show it to ${who}: they scan it with their phone camera, and your details go straight into their contacts.`;

// A share sheet and a wake lock that report what they were given (headless Chromium has neither working).
const stubs = () => {
  window.__shares = []; window.__canFiles = true; window.__shareFails = ''; window.__locks = 0; window.__lastLock = null;
  navigator.share = async data => {
    if (window.__shareFails) { const e = new Error('no'); e.name = window.__shareFails; throw e; }
    const files = await Promise.all((data.files || []).map(async f => ({ name: f.name, type: f.type, text: await f.text() })));
    window.__shares.push({ title: data.title || '', text: data.text || '', files });
  };
  navigator.canShare = data => !(data && data.files) || window.__canFiles;
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
    const lock = new EventTarget(); lock.released = false;
    lock.release = async () => { if (lock.released) return; lock.released = true; lock.dispatchEvent(new Event('release')); };
    window.__locks++; window.__lastLock = lock; return lock;
  } } });
};
const setProfile = (page, p) => page.evaluate(x => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, ...x, updatedAt: Date.now() }; })), p);
const setRole = (page, id) => page.evaluate(r => import('./js/roles.js').then(m => m.setRole(r)), id);
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => '');
const focused = page => page.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? 'body' : a.id || a.className; });
const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await sleep(100); } return false; };
const bigOpen = page => page.locator('.cd-big').count().then(n => n === 1);
const wake = page => page.evaluate(() => window.gdexAudioState().wakeLock);
async function toCard(page) { await go(page, 'card'); await page.waitForSelector('#page [data-page="card"]'); await sleep(150); }
// Every card of the page's walkthrough (?), title by title.
async function tourTitles(page) {
  await page.click('#helpBtn'); await page.waitForSelector('.tour-card');
  const titles = [];
  for (let i = 0; i < 12; i++) {
    await sleep(300);
    if (!(await page.locator('.tour-card').count())) break;
    const t = await text(page, '#tour-title');
    if (titles[titles.length - 1] !== t) titles.push(t);
    const next = page.locator('.tour-card .tour-actions .btn.primary'), label = await next.innerText().catch(() => 'Done');
    await next.click().catch(() => {});
    if (label === 'Done') break;
  }
  await page.waitForSelector('.tour-card', { state: 'detached', timeout: 3000 }).catch(() => {});
  return titles;
}

(async () => {
  let { browser, page, errors } = await open({ init: stubs });
  const away = [];
  const origin = new URL(page.url()).origin;
  page.on('request', r => { if (!r.url().startsWith(origin) && !/^(data|blob):/.test(r.url())) away.push(r.url()); });

  /* ---------------- on every menu, just before Settings ---------------- */
  const menus = await page.evaluate(() => import('./js/roles.js').then(m => Object.fromEntries([...m.ROLES, m.EVERYTHING].map(r => [r.id, { menu: m.menuSections(r), off: m.offMenu(r) }]))));
  ok('every role has My card on its menu, just before Settings, and never as a bonus track (Audiophile and Everything too)', Object.keys(WHO).every(id => menus[id] && menus[id].menu.slice(-2).join() === 'card,settings' && !menus[id].off.includes('card')) && Object.keys(menus).length === 7, JSON.stringify(Object.fromEntries(Object.entries(menus).map(([k, v]) => [k, v.menu.slice(-3).join()]))));
  const pages = await page.evaluate(() => window.gdexPages().map(p => `${p.id}:${p.label}:${p.icon}`));
  ok('Everything: My card is the eleventh of twelve sections, with the card icon', pages.length === 12 && pages[10] === 'card:My card:🪪' && pages[11].startsWith('settings:'), pages.join(' | '));

  /* ---------------- no details yet: what to add, and Edit your details ---------------- */
  await toCard(page);
  ok('the page is headed My card, and so is its region', (await text(page, '#page h1')) === 'My card' && (await page.getAttribute('#page .page-card', 'aria-label')) === 'My card');
  ok('with no details it says what to add, in the role’s words, and offers Edit your details', (await text(page, '.cd-empty p')) === `Add your name (or your business, band or project name) and a phone number, an email or a website, and your card is ready to show ${WHO.all}: they scan it with their phone camera to save your details.` && (await text(page, '.cd-empty #cd-edit')) === '✎ Edit your details' && (await page.locator('.cd-qr, #cd-big, #cd-vcf, #cd-share').count()) === 0, await text(page, '.cd-empty p'));
  await setProfile(page, { name: 'Maya Brooks' }); await sleep(300);
  ok('a name alone: it asks for a way to reach you', /^Add a phone number, an email or a website, and your card is ready/.test(await text(page, '.cd-empty p')), await text(page, '.cd-empty p'));
  await setProfile(page, { name: '', phone: '+1 555 0141' }); await sleep(300);
  ok('a number alone: it asks for a name', /^Add your name, or your business, band or project name, and your card is ready/.test(await text(page, '.cd-empty p')), await text(page, '.cd-empty p'));
  const emptyTour = await tourTitles(page);
  ok('the walkthrough of an empty card: the page, then Edit your details', emptyTour.join(' › ') === 'My card › Edit your details', emptyTour.join(' › '));
  // Edit your details opens the form Settings uses; saving it makes the card, and the focus stays on Edit your details.
  await page.click('#cd-edit'); await page.waitForSelector('.sheet[aria-label="Your details"]');
  ok('Edit your details opens the Your details form', (await page.locator('.sheet[aria-label="Your details"] [data-key="name"]').count()) === 1);
  for (const [k, v] of Object.entries(PROFILE)) await page.fill(`.sheet[aria-label="Your details"] [data-key="${k}"]`, v);
  await page.click('.sheet[aria-label="Your details"] button[type=submit]');
  await page.waitForSelector('.cd-qr svg', { timeout: 15000 }); await sleep(200);
  ok('saved: the card is made at once, and the focus is on Edit your details', (await page.locator('.cd-empty').count()) === 0 && (await focused(page)) === 'cd-edit', await focused(page));

  /* ---------------- the card: a big QR code, the name and details under it ---------------- */
  ok('the lead says who it is for, in Everything’s words', (await text(page, '.cd-lead')) === lead(WHO.all), await text(page, '.cd-lead'));
  const geo = await page.evaluate(() => { const q = document.querySelector('.cd-qr').getBoundingClientRect(), w = document.querySelector('.cd-who').getBoundingClientRect(), c = document.querySelector('.cd-card').getBoundingClientRect(); return { qw: q.width, qh: q.height, cw: c.width, below: w.top >= q.bottom - 1 }; });
  ok('the code is big: square, and most of the card’s width on a phone', Math.abs(geo.qw - geo.qh) < 2 && geo.qw >= geo.cw * 0.85 && geo.qw >= 300, JSON.stringify(geo));
  ok('…and the name and details are under it', geo.below);
  const same = await page.evaluate(async () => { const m = await import('./js/pages/settings.js'); const svg = await m.qrFor(m.vcard()); const want = new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('path').getAttribute('d'); return document.querySelector('.cd-qr svg path').getAttribute('d') === want; });
  ok('the code is Settings’ own contact card (vcard() and qrFor(), not a copy)', same);
  ok('under it: the name, what you do and the business', (await text(page, '.cd-name')) === 'Maya Brooks' && (await text(page, '.cd-sub')) === 'Band leader · Night Owls, Ltd');
  const lines = await page.$$eval('.cd-lines li', ls => ls.map(l => l.textContent));
  ok('…then each way to reach you, as a screen reader hears it', JSON.stringify(lines) === JSON.stringify(['📞Phone: +1 555 0141', '✉️Email: maya@example.com', '🌐Website: nightowls.example.com', '📍Based in: Harbourtown', '📮Postal address: 12 Quay Street\nHarbourtown HT1 2AB']), JSON.stringify(lines));
  ok('screen readers: the code is an image named for whose card it is; the icons are hidden; the details are a list', (await page.getAttribute('.cd-qr', 'role')) === 'img' && (await page.getAttribute('.cd-qr', 'aria-label')) === 'QR code: the contact card of Maya Brooks' && (await page.$$eval('.cd-ico', is => is.every(i => i.getAttribute('aria-hidden') === 'true'))) && (await page.getAttribute('.cd-lines', 'aria-label')) === 'On the card');
  ok('the buttons, in order: Show big, Share, Save as a file (.vcf), Edit your details', (await page.$$eval('.cd-actions .btn', bs => bs.map(b => `${b.id}:${b.textContent}`).join())) === 'cd-big:⛶ Show big,cd-share:↗ Share,cd-vcf:⤓ Save as a file (.vcf),cd-edit:✎ Edit your details' && (await page.getAttribute('#cd-big', 'aria-haspopup')) === 'dialog');
  ok('the note says nothing is sent anywhere, and where else the card is', (await text(page, '.cd-note')) === 'Everything under the code is in it, and nothing is sent anywhere: the phone that scans it reads it off your screen. It is the same card as in Settings → Your details.');
  // A change made anywhere (Settings, a backup) redraws the card.
  await setProfile(page, { phone: '+1 555 0199' }); await until(async () => (await page.$$eval('.cd-lines li', ls => ls[0].textContent)) === '📞Phone: +1 555 0199');
  const changed = await page.evaluate(async () => { const m = await import('./js/pages/settings.js'); return m.vcard().includes('TEL;TYPE=CELL:+1 555 0199') && !!document.querySelector('.cd-qr svg'); });
  ok('a change to the details redraws the card and its code', changed);
  await setProfile(page, { phone: PROFILE.phone }); await sleep(300);

  /* ---------------- Save as a file (.vcf) ---------------- */
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#cd-vcf')]);
  const vcf = fs.readFileSync(await dl.path(), 'utf8');
  const wanted = await page.evaluate(() => import('./js/pages/settings.js').then(m => m.vcard()));
  ok('Save as a file saves the card as a .vcf named after you', dl.suggestedFilename() === 'Maya Brooks.vcf' && vcf === wanted && /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/.test(vcf) && vcf.includes('FN:Maya Brooks') && vcf.includes('TEL;TYPE=CELL:+1 555 0141'), dl.suggestedFilename());

  /* ---------------- Share: the device's own share sheet ---------------- */
  await page.click('#cd-share'); await sleep(300);
  let shares = await page.evaluate(() => window.__shares);
  ok('Share hands the .vcf file to the device’s share sheet', shares.length === 1 && shares[0].files.length === 1 && shares[0].files[0].name === 'Maya Brooks.vcf' && shares[0].files[0].type === 'text/vcard' && shares[0].files[0].text === wanted && shares[0].title === 'Maya Brooks', JSON.stringify(shares).slice(0, 300));
  await page.evaluate(() => { window.__canFiles = false; });
  await page.click('#cd-share'); await sleep(300);
  shares = await page.evaluate(() => window.__shares);
  ok('…and the card as text where the device cannot share files', shares.length === 2 && shares[1].files.length === 0 && shares[1].text === 'Maya Brooks\nBand leader · Night Owls, Ltd\n+1 555 0141\nmaya@example.com\nnightowls.example.com\nHarbourtown\n12 Quay Street\nHarbourtown HT1 2AB', JSON.stringify(shares[1]));
  await until(async () => (await page.locator('.toast').count()) === 0); // the toasts of the saves above have gone
  await page.evaluate(() => { window.__shareFails = 'AbortError'; });
  await page.click('#cd-share'); await sleep(300);
  ok('closing the share sheet says nothing', (await page.locator('.toast').count()) === 0, await text(page, '.toast'));
  await page.evaluate(() => { window.__shareFails = 'NotAllowedError'; });
  await page.click('#cd-share'); await sleep(300);
  ok('a share that fails says so, and offers the file instead', (await text(page, '.toast')) === 'The card could not be shared from here. Save it as a file instead.', await text(page, '.toast'));
  await page.evaluate(() => { window.__shareFails = ''; window.__canFiles = true; });

  /* ---------------- Show big ---------------- */
  await page.click('#cd-big'); await page.waitForSelector('.cd-big .cd-big-code svg', { timeout: 10000 }); await sleep(200);
  const bigGeo = await page.evaluate(() => { const b = document.querySelector('.cd-big'), r = b.getBoundingClientRect(), c = document.querySelector('.cd-big-code').getBoundingClientRect(), close = document.getElementById('cd-big-close').getBoundingClientRect(); const at = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return { white: getComputedStyle(b).backgroundColor, cover: r.left === 0 && r.top === 0 && r.width === innerWidth && r.height === innerHeight, top: b.contains(at), code: c.width, square: Math.abs(c.width - c.height) < 2, iw: innerWidth, closeIn: close.bottom <= innerHeight && close.top >= 0 }; });
  ok('Show big: the code alone on a plain white screen over everything', bigGeo.white === 'rgb(255, 255, 255)' && bigGeo.cover && bigGeo.top, JSON.stringify(bigGeo));
  ok('…as large as fits: the whole width but the margins, square', bigGeo.code >= bigGeo.iw - 34 && bigGeo.square, JSON.stringify(bigGeo));
  ok('…with the name, how to close it and ✕ Close, all on the screen', (await text(page, '.cd-big-name')) === 'Maya Brooks' && (await text(page, '#cd-big-help')) === 'Tap anywhere to close.' && bigGeo.closeIn);
  ok('…the screen kept awake while it shows (the tools’ wake lock)', await until(() => wake(page)) && (await page.evaluate(() => window.__locks)) === 1);
  ok('screen readers: a dialog named My card, big screen, described by how to close it; the code an image of whose card it is', (await page.getAttribute('.cd-big', 'role')) === 'dialog' && (await page.getAttribute('.cd-big', 'aria-modal')) === 'true' && (await page.getAttribute('.cd-big', 'aria-label')) === 'My card, big screen' && (await page.getAttribute('.cd-big', 'aria-describedby')) === 'cd-big-help' && (await page.getAttribute('.cd-big-code', 'aria-label')) === 'QR code: the contact card of Maya Brooks');
  ok('the focus is on ✕ Close, and the app under it is out of reach', (await focused(page)) === 'cd-big-close' && await page.evaluate(() => document.getElementById('app').inert === true));
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  ok('Tab and Shift+Tab stay on ✕ Close', (await focused(page)) === 'cd-big-close');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('/'); await sleep(300);
  ok('the arrow keys and / do nothing under it: still My card, no search', (await page.evaluate(() => window.logiPage())) === 'card' && await bigOpen(page) && (await focused(page)) === 'cd-big-close');
  // Gdex sent out of sight and back: the browser let the lock go, and it is asked for again.
  await page.evaluate(() => { window.__lastLock.release(); document.dispatchEvent(new Event('visibilitychange')); });
  ok('back in sight, the screen is kept awake again', await until(() => wake(page)) && (await page.evaluate(() => window.__locks)) === 2);
  await page.keyboard.press('Escape'); await sleep(300);
  ok('Escape closes it: the focus back on Show big, the app back, the screen free to sleep', !(await bigOpen(page)) && (await focused(page)) === 'cd-big' && await page.evaluate(() => document.getElementById('app').inert === false) && (await wake(page)) === false && (await page.evaluate(() => window.__lastLock.released)) === true);
  ok('…and the entry it put in the browser’s history went with it', await until(() => page.evaluate(() => !(history.state && history.state.gdexBig))));
  await page.keyboard.press('Enter'); await page.waitForSelector('.cd-big'); await sleep(250);
  ok('Enter on Show big opens it again', (await focused(page)) === 'cd-big-close');
  await page.keyboard.press('Enter'); await sleep(300);
  ok('Enter on ✕ Close closes it, the focus back on Show big', !(await bigOpen(page)) && (await focused(page)) === 'cd-big');
  await page.click('#cd-big'); await page.waitForSelector('.cd-big .cd-big-code svg'); await sleep(250);
  await page.mouse.click(12, 12); await sleep(300);
  ok('a tap anywhere on the white closes it', !(await bigOpen(page)) && (await focused(page)) === 'cd-big');
  await page.click('#cd-big'); await page.waitForSelector('.cd-big .cd-big-code svg'); await sleep(250);
  await page.click('.cd-big-code'); await sleep(300);
  ok('…a tap on the code too', !(await bigOpen(page)));
  await until(() => page.evaluate(() => !(history.state && history.state.gdexBig)));
  await page.click('#cd-big'); await page.waitForSelector('.cd-big'); await sleep(250);
  ok('it adds an entry to the browser’s history…', await page.evaluate(() => !!(history.state && history.state.gdexBig)));
  await page.goBack({ timeout: 5000 }).catch(() => {}); await sleep(400);
  ok('…so Back closes it, staying on My card, with the focus on Show big and the screen free to sleep', !(await bigOpen(page)) && (await page.evaluate(() => window.logiPage())) === 'card' && (await focused(page)) === 'cd-big' && (await wake(page)) === false);
  // On a phone on its side the code takes the height instead.
  await page.setViewportSize({ width: 900, height: 420 }); await page.click('#cd-big'); await page.waitForSelector('.cd-big .cd-big-code svg'); await sleep(300);
  const side = await page.evaluate(() => { const c = document.querySelector('.cd-big-code').getBoundingClientRect(), w = document.querySelector('.cd-big-words').getBoundingClientRect(); return { h: c.height, ih: innerHeight, beside: w.left >= c.right - 1, inside: c.top >= 0 && c.bottom <= innerHeight }; });
  ok('a phone on its side: the code takes the whole height but the margins, the words beside it', side.h >= side.ih - 34 && side.beside && side.inside, JSON.stringify(side));
  await page.keyboard.press('Escape'); await sleep(300);
  await page.setViewportSize({ width: 420, height: 900 }); await sleep(200);
  await page.click('#cd-big'); await page.waitForSelector('.cd-big'); await sleep(200);
  await go(page, 'venues');
  ok('leaving My card from code closes Show big and lets the screen sleep', !(await bigOpen(page)) && (await wake(page)) === false && await page.evaluate(() => document.getElementById('app').inert === false));
  await until(() => page.evaluate(() => !(history.state && history.state.gdexBig)));
  // A sheet that opens while it shows (the question when Gdex comes back after hours) is under it, and keeps the app
  // out of reach after it closes: one Escape closes Show big alone.
  await toCard(page); await page.click('#cd-big'); await page.waitForSelector('.cd-big'); await sleep(200);
  await page.evaluate(() => import('./js/util.js').then(u => u.sheet('A question', u.h('p', null, 'Did you see them?'))));
  await sleep(250); await page.keyboard.press('Escape'); await sleep(300);
  ok('a sheet that opened under Show big stays, with the app still out of reach, after one Escape', !(await bigOpen(page)) && (await page.locator('.sheet[aria-label="A question"]').count()) === 1 && await page.evaluate(() => document.getElementById('app').inert === true));
  ok('…the focus then in that sheet, not lost on the page', await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.sheet[aria-label="A question"]')), await focused(page));
  await page.keyboard.press('Escape'); await sleep(300);
  ok('…and the next Escape closes the sheet and gives the app back', (await page.locator('.sheet').count()) === 0 && await page.evaluate(() => document.getElementById('app').inert === false));
  ok('…with the focus back on Show big', (await focused(page)) === 'cd-big', await focused(page));
  // The sheet under it cannot take the focus (its own Yes, or the sheet itself a moment later): Enter, meant for
  // ✕ Close, must not press a button no one can see.
  await until(() => page.evaluate(() => !(history.state && history.state.gdexBig)));
  await page.keyboard.press('Enter'); await page.waitForSelector('.cd-big'); await sleep(200);
  await page.evaluate(() => import('./js/util.js').then(u => { const yes = u.h('button', { type: 'button', id: 'q-yes', onclick: () => { window.__yes = 1; } }, 'Yes'); u.sheet('A question', u.h('div', null, u.h('p', null, 'Did you see them?'), yes)); yes.focus(); }));
  await sleep(400);
  ok('a sheet that opens under Show big does not take the focus from ✕ Close', (await focused(page)) === 'cd-big-close', await focused(page));
  await page.keyboard.press('Enter'); await sleep(300);
  ok('…so Enter closes Show big and presses nothing under it', !(await bigOpen(page)) && !(await page.evaluate(() => window.__yes)) && (await page.locator('.sheet[aria-label="A question"]').count()) === 1);
  await page.keyboard.press('Escape'); await sleep(300);
  ok('…Escape then closes the sheet, the focus on Show big', (await page.locator('.sheet').count()) === 0 && (await focused(page)) === 'cd-big', await focused(page));
  await until(() => page.evaluate(() => !(history.state && history.state.gdexBig)));

  /* ---------------- the walkthrough ---------------- */
  await toCard(page); await page.waitForSelector('.cd-qr svg');
  const tour = await tourTitles(page);
  ok('?: a walkthrough of the page, the code, what it holds, Show big, Share, Save as a file and Edit your details', tour.join(' › ') === 'My card › The code › What it holds › Show big › Share › Save as a file › Edit your details', tour.join(' › '));
  const steps = await page.evaluate(() => window.gdexPages().find(p => p.id === 'card').page.tutorial());
  ok('…its first card in the role’s words, and Show big says the screen stays on and how it closes', steps[0].text === `Your contact card, ready to show ${'the artists, promoters, venues and crew you work with'}.` && /The screen stays on while it shows\. Tap anywhere, press Escape or go Back to close it\./.test(steps.find(s => s.title === 'Show big').text), steps[0].text);

  /* ---------------- Settings → Your details: a line and a button to My card ---------------- */
  await go(page, 'settings');
  await page.evaluate(() => { const d = document.getElementById('se-profile'); d.open = true; d.scrollIntoView(); });
  await sleep(300);
  ok('Settings → Your details has no QR code any more: a line and a button to My card, and the .vcf', (await page.locator('#se-profile svg, #se-profile .qr').count()) === 0 && (await text(page, '#se-profile .se-card-line')) === 'Your contact card is on My card, as a big QR code: someone scans it with their phone camera to save your number and email. Share it or show it big from there, or save it here as a file.' && (await text(page, '#se-card')) === '🪪 Open My card' && (await page.locator('#se-vcf:not([disabled])').count()) === 1, await text(page, '#se-profile .se-card-line'));
  ok('Settings’ walkthrough says the way to My card is under your details', /Under them, the way to My card, your contact card as a big QR code to scan, and the card as a file to send\./.test(await page.evaluate(() => window.gdexPages().find(p => p.id === 'settings').page.tutorial().find(s => s.title === 'Your details').text)));
  await page.focus('#se-card'); await page.keyboard.press('Enter'); await sleep(600);
  ok('the button opens My card at its top, with the focus on its heading', (await page.evaluate(() => window.logiPage())) === 'card' && (await focused(page)) === 'cd-title' && (await page.evaluate(() => window.scrollY)) === 0, await focused(page));
  await page.keyboard.press('Tab');
  ok('…and the next Tab goes to Show big', (await focused(page)) === 'cd-big', await focused(page));

  /* ---------------- each role, in its own words ---------------- */
  for (const id of Object.keys(WHO)) {
    await setRole(page, id); await sleep(500);
    await page.click('#deck .dk-record'); await page.waitForSelector('.dk-sleeve');
    const sleeve = await page.$$eval('.dk-sleeve .dk-sides .dk-track', ts => ts.map(t => `${t.dataset.section}:${t.querySelector('.dk-track-name').textContent}`));
    const bonus = await page.$$eval('.dk-sleeve .dk-bonus .dk-track', ts => ts.map(t => t.dataset.section));
    await page.keyboard.press('Escape'); await page.waitForSelector('.dk-sleeve', { state: 'detached' });
    ok(`${id}: My card on the sleeve, just before Settings, not a bonus track`, sleeve.slice(-2).join() === 'card:My card,settings:Settings' && !bonus.includes('card'), sleeve.join(','));
    ok(`${id}: the page stays My card, telling who to show it to`, (await page.evaluate(() => window.logiPage())) === 'card' && (await text(page, '#page h1')) === 'My card' && (await text(page, '.cd-lead')) === lead(WHO[id]), await text(page, '.cd-lead'));
  }
  // The welcome tour counts My card among the tracks and never calls it a bonus track.
  const tourWords = await page.evaluate(() => Promise.all([import('./js/tour.js'), import('./js/roles.js')]).then(([t, r]) => { r.setRole('audiophile'); const s = t.welcomeSteps(); return { tracks: s.find(x => x.title === 'Your sections are tracks').text, last: s[s.length - 1].text, n: r.menuSections().length }; }));
  ok('the welcome tour counts My card among the audiophile’s tracks, and not among the bonus tracks', tourWords.n === 6 && /^6 tracks: 3 on Side A, 3 on Side B; the rest are bonus tracks\./.test(tourWords.tracks) && /Not on your menu: People, Songs, Studio log, Backline, Money and Insurance\./.test(tourWords.last) && !/My card/.test(tourWords.last), `${tourWords.tracks} | ${tourWords.last}`);
  await sleep(400);
  // The audiophile with no details yet: the empty card in the role's words.
  await setProfile(page, CLEAR); await sleep(300);
  ok('audiophile, no details yet: what to add, in the role’s words', (await text(page, '.cd-empty p')) === `Add your name (or your business, band or project name) and a phone number, an email or a website, and your card is ready to show ${WHO.audiophile}: they scan it with their phone camera to save your details.`, await text(page, '.cd-empty p'));
  await setProfile(page, { business: 'Night Owls, Ltd', role: 'Band', email: 'owls@example.com', website: 'javascript:alert(1)' }); await page.waitForSelector('.cd-qr svg'); await sleep(200);
  ok('a business and no name: the business is the name on the card; a link that is no web address is left off, as the vCard leaves it', (await text(page, '.cd-name')) === 'Night Owls, Ltd' && (await text(page, '.cd-sub')) === 'Band' && (await page.$$eval('.cd-lines li', ls => ls.map(l => l.textContent).join('|'))) === '✉️Email: owls@example.com' && !(await page.evaluate(() => import('./js/pages/settings.js').then(m => m.vcard()))).includes('URL:'));
  // A name and, as the only way to reach them, a "website" that is no web address: the vCard leaves it out, so there is
  // no card yet, and the page asks for a way to reach them (not for a name).
  await setProfile(page, { ...CLEAR, name: 'Maya Brooks', website: 'insta: @maya' }); await sleep(300);
  ok('a name and a website that is no web address: no card, and it asks for a way to reach you', /^Add a phone number, an email or a website, and your card is ready/.test(await text(page, '.cd-empty p')) && (await page.locator('.cd-qr').count()) === 0 && !(await page.evaluate(() => import('./js/pages/settings.js').then(m => m.hasCard({ name: 'Maya', website: 'insta: @maya' })))), await text(page, '.cd-empty p'));
  // The business under the name only when it is not the name again (a solo artist's project is often their name).
  await setProfile(page, { ...CLEAR, name: 'Maya Brooks', business: 'Maya  Brooks', role: 'Singer', email: 'maya@example.com' }); await page.waitForSelector('.cd-qr svg'); await sleep(200);
  ok('a business that is the name again is not said twice', (await text(page, '.cd-name')) === 'Maya Brooks' && (await text(page, '.cd-sub')) === 'Singer', await text(page, '.cd-sub'));
  // Too much for a QR code: the sentence says so, and the box is no longer an image of a code for a screen reader.
  await setProfile(page, { address: 'Quay Street '.repeat(300) }); await until(() => page.evaluate(() => /Too much for a QR code/.test(document.querySelector('.cd-qr')?.textContent || '')));
  ok('too much for a QR code: it says so, and a screen reader is not told there is a code', (await text(page, '.cd-qr')) === 'Too much for a QR code: shorten your details.' && (await page.getAttribute('.cd-qr', 'role')) === null && (await page.getAttribute('.cd-qr', 'aria-label')) === null);
  await setProfile(page, PROFILE); await setRole(page, 'all'); await sleep(400);

  /* ---------------- the search: on the page, and no new kind ---------------- */
  const search = await page.evaluate(() => import('./js/search.js').then(m => { const box = document.getElementById('srch-box'), r = box.getBoundingClientRect(); return { kinds: m.searchKinds(), box: !!box && r.height > 0 && !!box.closest('#deck') }; }));
  ok('the search box is on My card too, and the card is no kind of search result', search.box && !search.kinds.includes('card') && search.kinds.length > 0, JSON.stringify(search));

  ok('nothing was sent anywhere', away.length === 0, away.slice(0, 3).join(' | '));
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ---------------- a device with no share sheet ---------------- */
  ({ browser, page, errors } = await open({ init: () => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } }));
  await setProfile(page, PROFILE); await toCard(page); await page.waitForSelector('.cd-qr svg');
  ok('no share sheet on the device: no Share button, the others as they were', (await page.locator('#cd-share').count()) === 0 && (await page.$$eval('.cd-actions .btn', bs => bs.map(b => b.id).join())) === 'cd-big,cd-vcf,cd-edit');
  const noShareTour = await tourTitles(page);
  ok('…and the walkthrough leaves Share out', !noShareTour.includes('Share') && noShareTour.includes('Save as a file'), noShareTour.join(' › '));
  ok('no errors in the console (no share sheet)', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ---------------- a name with accents, as the first code of a visit ---------------- */
  // The code holds the card in UTF-8, so a phone reads "Zoë", not "ZoÃ«". The first code drawn after Gdex opens once
  // had its bytes encoded twice (the QR library is switched to UTF-8 only as that code is made), and the code kept for
  // the visit stayed wrong. The reference is made after, straight from js/qr.js, which reads the text as UTF-8.
  ({ browser, page, errors } = await open());
  await setProfile(page, { ...PROFILE, name: 'Zoë Ångström-José', business: 'Café Ñandú' }); await toCard(page); await page.waitForSelector('.cd-qr svg');
  const utf8 = await page.evaluate(async () => {
    const [m, q] = await Promise.all([import('./js/pages/settings.js'), import('./js/qr.js')]);
    const want = new DOMParser().parseFromString(await q.qrSvg(m.vcard(), { level: 'L' }), 'image/svg+xml').querySelector('path').getAttribute('d');
    return { drawn: document.querySelector('.cd-qr svg path').getAttribute('d') === want, kept: (await m.qrFor(m.vcard())).includes(want) };
  });
  ok('a name with accents, the first code of the visit: the code is the card in UTF-8 (not encoded twice)', utf8.drawn && utf8.kept, JSON.stringify(utf8));
  ok('no errors in the console (accents)', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ---------------- 320 px, extra-large text and large buttons, each section menu ---------------- */
  for (const menu of ['record', 'tape', 'digital']) {
    ({ browser, page, errors } = await open({ viewport: { width: 320, height: 700 }, init: `${stubs.toString().replace(/^\(\) => /, '(() => ')})(); localStorage.setItem('gdex-prefs', JSON.stringify({ text: 'xlarge', targets: 'large', menu: '${menu}' }));` }));
    await setProfile(page, PROFILE); await toCard(page); await page.waitForSelector('.cd-qr svg'); await sleep(200);
    const fit = await page.evaluate(() => {
      const W = innerWidth, inside = el => { const r = el.getBoundingClientRect(); return r.left >= 15.5 && r.right <= W - 15.5; };
      const cut = [...document.querySelectorAll('#page .cd-wrap *:not(.sr-only)')].filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible').map(el => el.className);
      const btns = [...document.querySelectorAll('.cd-actions .btn')];
      return { scroll: document.documentElement.scrollWidth <= W, card: inside(document.querySelector('.cd-card')), qr: inside(document.querySelector('.cd-qr')), buttons: btns.length === 4 && btns.every(inside) && btns.every(b => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().height >= 54), lines: [...document.querySelectorAll('.cd-lines li, .cd-name, .cd-sub, .cd-lead, .cd-note')].every(inside), cut, big: getComputedStyle(document.querySelector('.cd-val')).fontSize };
    });
    ok(`320 px, extra-large text and buttons, the ${menu} menu: nothing pushed sideways, every button whole and big`, fit.scroll && fit.card && fit.qr && fit.buttons && fit.lines && fit.cut.length === 0, JSON.stringify(fit));
    ok(`…the details follow the text size (${menu})`, parseFloat(fit.big) > 20, fit.big);
    // An email and a web address break after a dot or an @, never inside a word.
    const breaks = await page.evaluate(() => [...document.querySelectorAll('.cd-val')].map(v => { const r = document.createRange(), rows = []; const walk = document.createTreeWalker(v, NodeFilter.SHOW_TEXT); let n, cur = null; while ((n = walk.nextNode())) for (let i = 0; i < n.length; i++) { r.setStart(n, i); r.setEnd(n, i + 1); const top = Math.round(r.getBoundingClientRect().top); if (cur === null || Math.abs(top - cur.top) > 4) { cur = { top, s: '' }; rows.push(cur); } cur.s += n.data[i]; } return rows.map(x => x.s); }));
    const web = breaks.find(rows => rows.join('').startsWith('nightowls')) || [];
    ok(`…the web address wraps after a dot, not inside a word (${menu})`, web.length >= 1 && web.every(row => /^(nightowls\.|example\.|com|nightowls\.example\.|example\.com|nightowls\.example\.com)$/.test(row.trim())), JSON.stringify(web));
    await page.click('#cd-big'); await page.waitForSelector('.cd-big .cd-big-code svg'); await sleep(250);
    const big = await page.evaluate(() => { const c = document.querySelector('.cd-big-code').getBoundingClientRect(), b = document.getElementById('cd-big-close').getBoundingClientRect(); return { code: c.width, inside: c.left >= 0 && c.right <= innerWidth && c.top >= 0, close: b.bottom <= innerHeight && b.height >= 54, scroll: document.documentElement.scrollWidth <= innerWidth }; });
    ok(`…Show big fits too: the code the width but the margins, ✕ Close on the screen (${menu})`, big.code >= 320 - 34 && big.inside && big.close && big.scroll, JSON.stringify(big));
    await page.keyboard.press('Escape'); await sleep(200);
    ok(`no errors in the console (320 px, ${menu})`, errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
  }
})().catch(e => { console.log('FAIL my card crashed — ' + e.message); process.exit(1); });
