// A QR for each band's sample work (item 15). The model's reading of the link (an address, read as every typed link
// is; junk reads as none); the act form's Sample work field (under Links, its words in the role's terms, a line saying
// what the code opens or that what is typed is no address, saved trimmed, cleared, never an empty key on an act that
// had none, junk stored shown as empty); the act's drop-down card: a small QR code of the link (the very code
// acts-docs.qrFor makes for it), its host in words, Show big (the press kit's full-screen pattern) and Share link (the
// device's share sheet, else the link copied, else a sheet to copy it by hand); with no sample link the act's first
// link, said so in words, with the ✎ Edit the words speak of; with no link at all a line saying to add one in ✎ Edit,
// whose button opens the form in the box; the part's words at 4.5:1 or more, light and dark; drawn when a genre
// group's fold opens; the keyboard and the focus (Tab order, Enter and Space, back from the sheet, after a redraw,
// after a save); what a screen reader is told; the walkthroughs; Producer, Manager and
// Everything have it, Band, Solo artist, Scout and Audiophile see nothing new and keep the stored link; the press kit,
// the rider, the day sheet and the calendar file unchanged; the search does not show the link; 320 px with
// extra-large text and large buttons in each of the three section menus.
const { open, ok, sleep, go, topSheet } = require('../helpers.cjs');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const URL1 = 'https://soundcloud.com/producer/sets/night-owls-mixes';
const role = (page, id) => page.evaluate(x => import('./js/roles.js').then(m => m.setRole(x)), id).then(() => sleep(300));
const patch = (page, id, fields) => page.evaluate(([i, f]) => import('./js/store.js').then(s => s.patch('acts', i, f)), [id, fields]).then(() => sleep(300));
const stored = (page, id) => page.evaluate(i => import('./js/store.js').then(s => JSON.parse(JSON.stringify(s.byId('acts', i) || null))), id);
const focused = page => page.evaluate(() => (document.activeElement && document.activeElement.id) || (document.activeElement && document.activeElement.tagName) || '');
// The code drawn in an element, and the code acts-docs makes for a text (the same markup, parsed the same way).
const qrIn = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); return el && el.querySelector('svg') ? el.innerHTML : null; }, sel);
const qrWant = (page, text) => page.evaluate(t => import('./js/acts-docs.js').then(m => m.qrFor(t)).then(svg => { const d = document.createElement('div'); d.innerHTML = svg; return d.innerHTML; }), text);
const spoken = (page, sel) => page.locator(sel).ariaSnapshot();
// A control's words on screen (what a screen reader is told besides, in .sr-only, left out).
const shown = (page, sel) => page.$eval(sel, el => { const c = el.cloneNode(true); c.querySelectorAll('.sr-only').forEach(x => x.remove()); return c.textContent.trim(); });
const listSteps = page => page.evaluate(() => import('./js/pages/acts.js').then(m => m.acts.tutorial().map(s => [s.title, s.text, (s.target || []).join(',')])));
const sheetSteps = (page, title) => page.evaluate(t => import('./js/tour.js').then(m => { const s = m.sheetSteps(t); return (typeof s === 'function' ? s() : s || []).map(x => [x.title, x.text, (x.target || []).join(',')]); }), title);
// The contrast (the WCAG ratio) of an element's text on what is behind it, every background on the way composited as drawn.
const contrast = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return 0;
  const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const over = (base, col) => { cx.fillStyle = base; cx.fillRect(0, 0, 1, 1); cx.fillStyle = col; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
  const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
  const bg = chain.reduce((acc, e) => over(acc, getComputedStyle(e).backgroundColor), '#fff'), fg = over(bg, getComputedStyle(el).color);
  const lum = c => { const [r, g, b] = c.match(/\d+/g).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const x = lum(fg), y = lum(bg);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}, sel);
// The acts list with a group dropped open (the sample's two acts are in two main genres, so the list is in folds).
const toList = async page => {
  await go(page, 'acts');
  await page.evaluate(() => { const b = document.querySelector('.ac-view .back-btn'); if (b) b.click(); });
  await page.waitForSelector('.ac-group-head');
};
const openGroup = async (page, key) => { if ((await page.getAttribute(`#ac-grp-${key}`, 'aria-expanded')) !== 'true') { await page.click(`#ac-grp-${key}`); await page.waitForSelector(`#ac-grp-${key}[aria-expanded="true"]`); await sleep(150); } };
const openCard = async (page, id) => { if ((await page.getAttribute(`#ac-head-${id}`, 'aria-expanded')) !== 'true') { await page.click(`#ac-head-${id}`); await page.waitForSelector(`#ac-pnl-${id}`); await sleep(150); } };
const editForm = async (page, id) => {
  await page.evaluate(i => import('./js/pages/acts.js').then(m => m.openAct(i)), id);
  await page.waitForSelector('.ac-view .ac-title');
  await page.click('#ac-edit');
  await page.waitForSelector('.sheet[aria-label="Edit act"]');
  return topSheet(page);
};
const save = async page => { await topSheet(page).locator('button[type=submit]').click(); await page.waitForSelector('.sheet', { state: 'detached' }); await sleep(300); };

(async () => {
  const { browser, page, errors } = await open({ sample: true });

  /* ---------------- the model: the link, read as every typed link is ---------------- */
  const TABLE = [
    ['https://soundcloud.com/producer/sets/mixes', 'https://soundcloud.com/producer/sets/mixes', 'soundcloud.com'],
    ['soundcloud.com/producer/sets/mixes', 'https://soundcloud.com/producer/sets/mixes', 'soundcloud.com'],
    ['  https://drive.google.com/drive/folders/abc  ', 'https://drive.google.com/drive/folders/abc', 'drive.google.com'],
    ['www.dropbox.com/s/abc/mix.wav?dl=0', 'https://www.dropbox.com/s/abc/mix.wav?dl=0', 'dropbox.com'],
    ['http://example.com', 'http://example.com/', 'example.com'],
    ['HTTPS://Example.COM/Mixes', 'https://example.com/Mixes', 'example.com'],
    ['open.spotify.com/playlist/37i9?si=x', 'https://open.spotify.com/playlist/37i9?si=x', 'open.spotify.com'],
    ['', null], ['   ', null], ['not a link', null], ['asdf', null], ['javascript:alert(1)', null], ['mailto:me@example.com', null],
    ['ftp://example.com/x', null], ['SoundCloud: https://soundcloud.com/x', null], ['https://user:pw@example.com/x', null], ['https://', null], ['.com', null],
  ];
  const got = await page.evaluate(t => import('./js/model.js').then(m => t.map(([text]) => m.sampleLink({ sampleWork: text }))), TABLE);
  const wrong = TABLE.map(([text, url, host], i) => [text, url ? { url, host } : null, got[i]]).filter(([, want, g]) => !same(want, g));
  ok(`the model reads ${TABLE.length} typed links: an address (a scheme added when none is typed, www. left off the host), else none`, !wrong.length, JSON.stringify(wrong));
  const junk = await page.evaluate(() => import('./js/model.js').then(m => [null, undefined, {}, { sampleWork: 42 }, { sampleWork: {} }, { sampleWork: ['https://a.com'] }, { sampleWork: null }, { sample: 'https://a.com' }, { name: 'x' }].map(a => m.sampleLink(a))));
  ok('…and anything stored that is not text reads as none, without throwing', junk.every(x => x === null), JSON.stringify(junk));

  /* ---------------- Everything: the card ---------------- */
  await patch(page, 's-owls', { sampleWork: URL1 });
  await page.evaluate(() => import('./js/store.js').then(s => s.upsert('acts', { id: 't-bare', name: 'Bare Bones', genre: 'Garage rock', members: [] })));
  await sleep(250);
  await toList(page);
  ok('the list is in genre folds, all folded: no card, no code yet', (await page.locator('.ac-card').count()) === 0 && (await page.locator('.ac-sample').count()) === 0);
  // the keyboard: Enter on the group's heading drops it open; Tab reaches the card; Enter opens it
  await page.focus('#ac-grp-rock');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#ac-grp-rock[aria-expanded="true"]');
  await sleep(150);
  ok('Enter on the genre heading drops the fold open, the focus staying on it', (await focused(page)) === 'ac-grp-rock', await focused(page));
  ok('a closed card has no sample work', (await page.locator('.ac-sample').count()) === 0);
  for (let i = 0; i < 6 && (await focused(page)) !== 'ac-head-s-owls'; i++) await page.keyboard.press('Tab');
  ok('Tab reaches the card’s head', (await focused(page)) === 'ac-head-s-owls', await focused(page));
  await page.keyboard.press('Enter');
  await page.waitForSelector('#ac-pnl-s-owls .ac-sample-qr svg');
  await sleep(100);
  ok('Enter drops the card open, the focus staying on its head', (await focused(page)) === 'ac-head-s-owls' && (await page.getAttribute('#ac-head-s-owls', 'aria-expanded')) === 'true', await focused(page));
  const part = page.locator('#ac-pnl-s-owls .ac-sample');
  const want1 = await qrWant(page, URL1);
  ok('the open card has a small QR code of the sample work link (the code acts-docs makes for it)', (await qrIn(page, '#ac-pnl-s-owls .ac-sample-qr')) === want1, (await qrIn(page, '#ac-pnl-s-owls .ac-sample-qr') || '').slice(0, 60));
  const sz = await page.$eval('#ac-pnl-s-owls .ac-sample-qr', el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  ok('…a small one (about 100 px)', sz.w >= 90 && sz.w <= 130, JSON.stringify(sz));
  ok('…its host in words, under “Sample work”', (await part.locator('.ac-sample-h').textContent()) === 'Sample work' && (await part.locator('.ac-sample-host').textContent()) === 'soundcloud.com' && !(await part.locator('.ac-sample-say').count()));
  ok('…with Show big and Share link', (await shown(page, '#ac-sample-big-s-owls')) === '⛶ Show big' && (await shown(page, '#ac-sample-share-s-owls')) === '📤 Share link', await part.innerText());
  ok('…and no ✎ Edit while it has its sample work link', (await page.locator('#ac-sample-add-s-owls').count()) === 0);
  ok('…at the head of the open card, before the times seen', await page.evaluate(() => document.querySelector('#ac-pnl-s-owls').firstElementChild.classList.contains('ac-sample')));
  let tree = await spoken(page, '#ac-pnl-s-owls .ac-sample');
  ok('a screen reader hears a group called Sample work, the code as a picture with its host, and two buttons that say what they do', /group "Sample work"/.test(tree) && /img "QR code of the sample work, soundcloud\.com"/.test(tree) && /button "Show big: the sample work’s QR code"/.test(tree) && /button "Share link to the sample work"/.test(tree), tree);
  // Tab goes on into the part
  for (let i = 0; i < 8 && (await focused(page)) !== 'ac-sample-big-s-owls'; i++) await page.keyboard.press('Tab');
  ok('Tab goes on from the card’s dates to Show big', (await focused(page)) === 'ac-sample-big-s-owls', await focused(page));
  await page.keyboard.press('Tab');
  ok('…then Share link', (await focused(page)) === 'ac-sample-share-s-owls', await focused(page));

  // Show big: the press kit's full-screen sheet
  await page.focus('#ac-sample-big-s-owls');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sheet[aria-label="Sample work"] .ac-qr-full svg');
  const big = topSheet(page);
  ok('Enter on Show big opens the code on a sheet of its own, as the press kit’s Show it big does (the same code)', (await qrIn(page, '.sheet[aria-label="Sample work"] .ac-qr-full')) === want1 && (await big.locator('.ac-qr-sheet .ac-qr-name').textContent()) === 'The Night Owls');
  ok('…with the link under it and how to scan it', (await big.locator('.qr-cap').textContent()) === 'Sample work: ' + URL1 && /arm’s length/.test(await big.innerText()));
  const bw = await page.$eval('.sheet[aria-label="Sample work"] .ac-qr-full', el => el.getBoundingClientRect().width);
  ok('…as large as the screen allows', bw >= 300, String(bw));
  ok('…read out as the sample work’s code', /img "QR code of the sample work, soundcloud\.com"/.test(await spoken(page, '.sheet[aria-label="Sample work"]')));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  ok('Escape closes it and the focus goes back to Show big', (await focused(page)) === 'ac-sample-big-s-owls', await focused(page));
  // a change to the data while the sheet is open: the card is drawn again, and the focus finds Show big's stand-in
  await page.click('#ac-sample-big-s-owls');
  await page.waitForSelector('.sheet[aria-label="Sample work"]');
  await page.evaluate(() => import('./js/store.js').then(s => s.upsert('venues', { id: 't-v', name: 'Somewhere' })));
  await sleep(350);
  await page.click('.sheet[aria-label="Sample work"] button[aria-label=Close]');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await sleep(100);
  ok('…also when the page was drawn again while it was open', (await focused(page)) === 'ac-sample-big-s-owls', await focused(page));
  const tips = await sheetSteps(page, 'Sample work');
  ok('the big code has a walkthrough step', tips.length === 1 && tips[0][2] === '.ac-qr-full' && /scans the code opens your sample work/.test(tips[0][1]), JSON.stringify(tips));

  // Share link: the device's share sheet
  await page.evaluate(() => { window.__shared = []; navigator.share = async d => { window.__shared.push(d); }; });
  await page.focus('#ac-sample-share-s-owls');
  await page.keyboard.press(' ');
  await sleep(200);
  let shared = await page.evaluate(() => window.__shared);
  ok('Space on Share link opens the device’s share sheet with the link', same(shared, [{ title: 'The Night Owls – sample work', url: URL1 }]), JSON.stringify(shared));
  ok('…and the focus stays on Share link', (await focused(page)) === 'ac-sample-share-s-owls');
  await page.evaluate(() => { navigator.share = async () => { throw new DOMException('cancelled', 'AbortError'); }; window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copied = t; } } }); });
  await page.click('#ac-sample-share-s-owls');
  await sleep(200);
  ok('closing the share sheet copies nothing', (await page.evaluate(() => window.__copied)) === null);
  // no share sheet: the link is copied
  await page.evaluate(() => { delete navigator.share; navigator.share = undefined; });
  await page.click('#ac-sample-share-s-owls');
  await page.waitForSelector('.toast:has-text("Link copied")');
  ok('without a share sheet the link is copied, and a toast says so', (await page.evaluate(() => window.__copied)) === URL1 && (await page.locator('.toast').last().textContent()) === 'Link copied: paste it into a message or an email.', await page.locator('.toast').last().textContent());
  // nor a clipboard: a sheet with the link, selected
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('not allowed'); } } }));
  await page.click('#ac-sample-share-s-owls');
  await page.waitForSelector('.sheet[aria-label="Copy the link"] #ac-sample-copy');
  await sleep(150);
  const sel = await page.evaluate(() => { const b = document.getElementById('ac-sample-copy'); return { v: b.value, focus: document.activeElement === b, all: b.selectionStart === 0 && b.selectionEnd === b.value.length, ro: b.readOnly }; });
  ok('where copying is not allowed, a sheet holds the link, selected, to copy by hand', sel.v === URL1 && sel.focus && sel.all && sel.ro, JSON.stringify(sel));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  ok('…and closing it gives the focus back to Share link', (await focused(page)) === 'ac-sample-share-s-owls', await focused(page));

  // the fold: folded and opened again, the open card's code is drawn at once
  await page.click('#ac-grp-rock');
  await page.waitForSelector('#ac-grp-rock[aria-expanded="false"]');
  ok('folding the genre group takes the card and its code away', (await page.locator('.ac-sample').count()) === 0);
  await page.click('#ac-grp-rock');
  await page.waitForSelector('#ac-grp-rock[aria-expanded="true"]');
  ok('opening the fold again draws the open card’s code straight away', (await qrIn(page, '#ac-pnl-s-owls .ac-sample-qr')) === want1);
  // a reload (the codes made before are gone): the code is drawn once it is made
  await page.reload();
  await page.waitForSelector('#deck .dk-next');
  await toList(page);
  await openGroup(page, 'rock');
  await openCard(page, 's-owls');
  await page.waitForSelector('#ac-pnl-s-owls .ac-sample-qr svg', { timeout: 5000 });
  ok('after a reload, opening the fold and the card draws the code', (await qrIn(page, '#ac-pnl-s-owls .ac-sample-qr')) === want1);
  // the act's page search opens the fold too
  await page.evaluate(() => import('./js/pages/acts.js').then(m => m.openActCard('s-owls')));
  await sleep(300);
  ok('an act opened from the search (its fold and card dropped open) shows its code', !!(await qrIn(page, '#ac-pnl-s-owls .ac-sample-qr')) && (await focused(page)) === 'ac-head-s-owls');

  /* the act's first link, when there is no sample work link */
  await patch(page, 's-owls', { sampleWork: 'not a link at all' });
  const first = await page.evaluate(() => import('./js/acts-docs.js').then(m => import('./js/store.js').then(s => m.parseLinks(s.byId('acts', 's-owls').links)[0])));
  ok('junk stored as the link reads as none: the code is the act’s first link', (await qrIn(page, '#ac-pnl-s-owls .ac-sample-qr')) === (await qrWant(page, first.url)) && (await part.locator('.ac-sample-host').textContent()) === 'example.com');
  ok('…and the card says so in words', (await part.locator('.ac-sample-say').textContent()) === `No sample work link yet: this is the act’s first link (${first.label}). Add one in ✎ Edit.`, await part.locator('.ac-sample-say').textContent());
  tree = await spoken(page, '#ac-pnl-s-owls .ac-sample');
  ok('…and so is a screen reader', /img "QR code of the act’s first link \(Website\), example\.com"/.test(tree) && /button "Show big: the QR code of the act’s first link \(Website\)"/.test(tree) && /button "Share link to the act’s first link \(Website\)"/.test(tree), tree);
  await patch(page, 's-owls', { sampleWork: 42 });
  ok('a number stored there reads as none too', (await part.locator('.ac-sample-host').textContent()) === 'example.com');
  await page.click('#ac-sample-big-s-owls');
  await page.waitForSelector('.sheet[aria-label="Sample work"] .ac-qr-full svg');
  ok('Show big shows the first link, and says so', (await topSheet(page).locator('.qr-cap').textContent()) === `${first.label}: ${first.url}` && /No sample work link yet: this is the act’s first link \(Website\)\./.test(await topSheet(page).innerText()));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.evaluate(() => { window.__shared = []; navigator.share = async d => { window.__shared.push(d); }; });
  await page.click('#ac-sample-share-s-owls');
  await sleep(200);
  shared = await page.evaluate(() => window.__shared);
  ok('Share link shares the first link, under the act’s name', same(shared, [{ title: 'The Night Owls', url: first.url }]), JSON.stringify(shared));
  // The line says "Add one in ✎ Edit": the button is on the card (the times seen under it have ✎ pencils of their own).
  ok('…and the card has the ✎ Edit its line speaks of, read out as what it does', (await shown(page, '#ac-sample-add-s-owls')) === '✎ Edit' && /button "Edit The Night Owls: add the sample work link"/.test(await spoken(page, '#ac-pnl-s-owls .ac-sample')), await spoken(page, '#ac-pnl-s-owls .ac-sample'));
  ok('…after Show big and Share link', await page.evaluate(() => [...document.querySelectorAll('#ac-pnl-s-owls .ac-sample-actions .btn')].map(b => b.id).join() === 'ac-sample-big-s-owls,ac-sample-share-s-owls,ac-sample-add-s-owls'));
  await page.focus('#ac-sample-add-s-owls');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sheet[aria-label="Edit act"] input[data-key=sampleWork]');
  await sleep(150);
  ok('…which opens the act’s form with the focus in the Sample work box', await page.evaluate(() => document.activeElement === document.querySelector('.sheet[aria-label="Edit act"] input[data-key=sampleWork]')));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  ok('…and Escape gives the focus back to it', (await focused(page)) === 'ac-sample-add-s-owls', await focused(page));

  /* no link at all */
  await openCard(page, 't-bare');
  const none = page.locator('#ac-pnl-t-bare .ac-sample');
  ok('with no link at all: no code, a line saying to add one in ✎ Edit, and an Edit button', (await none.locator('.ac-sample-qr').count()) === 0 && (await none.locator('.ac-sample-say').textContent()) === 'No sample work or other link for this act yet. Add one in ✎ Edit and its QR code shows here, ready to share.' && (await shown(page, '#ac-sample-add-t-bare')) === '✎ Edit');
  ok('…its button read out as what it does', /button "Edit Bare Bones: add the sample work link"/.test(await spoken(page, '#ac-pnl-t-bare .ac-sample')), await spoken(page, '#ac-pnl-t-bare .ac-sample'));
  // The words on the part's --bg2 panel read at 4.5:1 or more, light and dark, in the Stage colours and in Brass (the
  // lowest muted-on-panel contrast of the light palettes).
  const low = [];
  for (const [palette, scheme] of [['stage', 'light'], ['stage', 'dark'], ['brass', 'light'], ['brass', 'dark']]) {
    await page.evaluate(([p, s]) => { document.documentElement.dataset.palette = p; document.documentElement.dataset.scheme = s; }, [palette, scheme]);
    for (const sel of ['#ac-pnl-s-owls .ac-sample-h', '#ac-pnl-s-owls .ac-sample-host', '#ac-pnl-s-owls .ac-sample-say', '#ac-pnl-t-bare .ac-sample-say']) { const r = await contrast(page, sel); if (!(r >= 4.5)) low.push(`${palette} ${scheme} ${sel} ${r.toFixed(2)}`); }
  }
  await page.evaluate(() => import('./js/a11y.js').then(m => m.applyPrefs()));
  ok('the part’s heading, host and lines read at 4.5:1 or more, light and dark', !low.length, low.join('; '));
  await page.focus('#ac-sample-add-t-bare');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sheet[aria-label="Edit act"] input[data-key=sampleWork]');
  await sleep(150);
  ok('…which opens the act’s form with the focus in the Sample work box', await page.evaluate(() => document.activeElement === document.querySelector('.sheet[aria-label="Edit act"] input[data-key=sampleWork]')));
  await page.keyboard.type('dropbox.com/sh/bare-bones-demos');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.waitForSelector('#ac-pnl-t-bare .ac-sample-qr svg');
  await sleep(200);
  ok('saved, the card has the code, and the focus is on its Show big', (await stored(page, 't-bare')).sampleWork === 'dropbox.com/sh/bare-bones-demos' && !('sample' in (await stored(page, 't-bare'))) && (await page.textContent('#ac-pnl-t-bare .ac-sample-host')) === 'dropbox.com' && (await focused(page)) === 'ac-sample-big-t-bare', await focused(page));
  ok('…the code opens the address as read (https:// put in front)', (await qrIn(page, '#ac-pnl-t-bare .ac-sample-qr')) === (await qrWant(page, 'https://dropbox.com/sh/bare-bones-demos')));

  /* the form */
  let form = await editForm(page, 's-owls');
  const field = await form.locator('input[data-key=sampleWork]').evaluate(b => {
    const f = b.closest('.field'), prev = f.previousElementSibling;
    return { label: f.querySelector('label').textContent, forId: f.querySelector('label').htmlFor === b.id, after: !!(prev && prev.querySelector('textarea[data-key=links]')), value: b.value, mode: b.inputMode, hint: f.querySelector('small').textContent, desc: b.getAttribute('aria-describedby'), placeholder: b.placeholder };
  });
  ok('the act form has “Sample work” straight under Links, a box for an address', field.label === 'Sample work' && field.forId && field.after && field.mode === 'url' && field.placeholder === 'soundcloud.com/you/sets/mixes', JSON.stringify(field));
  ok('…a number stored there shows as an empty box', field.value === '', field.value);
  ok('…its line says what it is for, in Everything’s words', field.hint === 'A page of your work with this act: a SoundCloud, Drive or Dropbox link, or a private playlist. Its QR code is on the act’s card in Acts, ready to show or share.', field.hint);
  const box = form.locator('input[data-key=sampleWork]');
  await box.fill('soundcloud.com/producer/sets/night-owls-mixes');
  ok('typing an address, a line under it says what the code opens', (await page.textContent('#ac-sample-check')) === 'The QR code opens soundcloud.com.' && !(await page.$eval('#ac-sample-check', el => el.hidden || el.classList.contains('warn'))));
  ok('…and the box is described by the hint and that line', field.desc === 'ac-sample-hint ac-sample-check' && (await page.getAttribute('#ac-sample-hint', 'class')) !== null);
  await box.fill('my soundcloud');
  ok('words that are no address are said to be no address', (await page.textContent('#ac-sample-check')) === 'That isn’t a web address yet. Type one like soundcloud.com/you/sets/mixes.' && (await page.$eval('#ac-sample-check', el => el.classList.contains('warn'))));
  await page.keyboard.press('Tab');
  await sleep(150);
  ok('…and said aloud as the box is left', (await page.textContent('#sr-live')) === 'That isn’t a web address yet. Type one like soundcloud.com/you/sets/mixes.');
  await box.fill('');
  ok('an empty box has no line', await page.$eval('#ac-sample-check', el => el.hidden));
  await box.fill('   https://soundcloud.com/producer/sets/night-owls-mixes  ');
  await save(page);
  ok('a save stores the link trimmed', (await stored(page, 's-owls')).sampleWork === URL1, (await stored(page, 's-owls')).sampleWork);
  form = await editForm(page, 's-owls');
  ok('the form shows the stored link', (await form.locator('input[data-key=sampleWork]').inputValue()) === URL1);
  await form.locator('input[data-key=sampleWork]').fill('');
  await save(page);
  let a = await stored(page, 's-owls');
  ok('emptying the box clears the link', a.sampleWork === '', JSON.stringify(a.sampleWork));
  ok('…and a sample act stays marked as the sample’s (act.sample), so Remove the sample still takes it away', a.sample === true, JSON.stringify(a.sample));
  form = await editForm(page, 's-sablea');
  await save(page);
  ok('an act that never had a link is not given an empty one', !('sampleWork' in (await stored(page, 's-sablea'))));
  await page.click('.ac-view .back-btn');
  await page.waitForSelector('#ac-new');
  await page.click('#ac-new');
  await page.waitForSelector('.sheet[aria-label="New act"] input[data-key=sampleWork]');
  await topSheet(page).locator('input[data-key=name]').fill('Fresh Act');
  await save(page);
  a = await page.evaluate(() => import('./js/store.js').then(s => JSON.parse(JSON.stringify(s.db.acts.find(x => x.name === 'Fresh Act')))));
  ok('nor is a new act with the box left empty', a && !('sampleWork' in a) && !('sample' in a), JSON.stringify(a));
  await page.click('.ac-view .back-btn');
  await page.waitForSelector('#ac-new');
  await page.click('#ac-new');
  await page.waitForSelector('.sheet[aria-label="New act"] input[data-key=sampleWork]');
  await topSheet(page).locator('input[data-key=name]').fill('Linked Act');
  await topSheet(page).locator('input[data-key=sampleWork]').fill('https://example.org/linked');
  await save(page);
  a = await page.evaluate(() => import('./js/store.js').then(s => JSON.parse(JSON.stringify(s.db.acts.find(x => x.name === 'Linked Act')))));
  ok('a new act can have its link as it is made, and is not taken for a sample act', a && a.sampleWork === 'https://example.org/linked' && !('sample' in a), JSON.stringify(a));
  await page.evaluate(() => import('./js/store.js').then(s => s.db.acts.filter(x => /^(Fresh|Linked) Act$/.test(x.name)).forEach(x => s.remove('acts', x.id))));
  await patch(page, 's-owls', { sampleWork: URL1 });
  // the walkthroughs
  const fsteps = await sheetSteps(page, 'Edit act');
  const fs = fsteps.find(s => s[0] === 'Sample work');
  ok('the form’s walkthrough has a Sample work step after Links', !!fs && fs[2] === 'input[data-key=sampleWork]' && fsteps.findIndex(s => s[0] === 'Sample work') === fsteps.findIndex(s => s[0] === 'Links') + 1 && /on the act’s card in Acts/.test(fs[1]), JSON.stringify(fs));
  await toList(page);
  let steps = await listSteps(page);
  const ls = steps.find(s => s[0] === 'Sample work');
  ok('the list’s walkthrough has a Sample work step after the dates, pointing at an open card’s part (or the cards)', !!ls && ls[2] === '.ac-sample,.ac-card-head' && steps.findIndex(s => s[0] === 'Sample work') === steps.findIndex(s => s[0] === 'Dates coming up') + 1 && /QR code of your sample work for the act/.test(ls[1]) && /Show big/.test(ls[1]) && /Share link/.test(ls[1]), JSON.stringify(ls));

  /* nothing outside: the press kit, the rider, the day sheet, the calendar file, the search */
  const docs = await page.evaluate(u => Promise.all([import('./js/acts-docs.js'), import('./js/store.js'), import('./js/daysheet.js'), import('./js/ics.js')]).then(([d, s, ds, ics]) => {
    const a = s.byId('acts', 's-owls'), b = s.byId('bookings', 's-show1');
    return { epk: d.epkDoc(a).outerHTML.includes('soundcloud'), rider: d.riderDoc(a).outerHTML.includes('soundcloud'), day: ds.daySheetText(b).includes('soundcloud'), ics: ics.bookingIcs(b).includes('soundcloud'), backup: s.exportJSON().includes(u) };
  }), URL1);
  ok('the press kit, the tech rider, the day sheet and the calendar file do not carry the link', !docs.epk && !docs.rider && !docs.day && !docs.ics, JSON.stringify(docs));
  ok('…a backup does (it is the act’s)', docs.backup);
  await page.evaluate(() => import('./js/pages/acts.js').then(m => m.openAct('s-owls')));
  await page.click('#ac-tab-epk');
  await page.waitForSelector('.ac-paper .cs-doc');
  ok('the press kit’s own QR code is still the act’s first link', (await qrIn(page, '.ac-qr-card .ac-qr')) === (await qrWant(page, first.url)));
  await page.click('#ac-qr-big');
  await page.waitForSelector('.sheet[aria-label="QR code"] .ac-qr-full svg');
  ok('…and its Show it big is as it was (its sheet, its caption, its tip)', (await topSheet(page).locator('.qr-cap').textContent()) === `${first.label}: ${first.url}` && (await topSheet(page).locator('.ac-qr-name').textContent()) === 'The Night Owls' && /arm’s length\.$/.test(await topSheet(page).locator('p.small').last().textContent()));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  ok('…and gives the focus back to its button', (await focused(page)) === 'ac-qr-big');
  const found = await page.evaluate(() => import('./js/search.js').then(m => m.searchReady().then(() => [m.searchAll('soundcloud'), m.searchAll('night-owls-mixes')])));
  ok('the search does not find an act by its sample work link', !Object.values(found[0]).flat().length && !Object.values(found[1]).flat().length, JSON.stringify(found));
  await page.fill('#srch-box', 'night owls');
  await page.waitForSelector('#srch-q');
  await page.click('#srch-tab-bands');
  await page.waitForSelector('.srch-rec[data-id="s-owls"]');
  ok('…and the act’s row in the search does not show it', !/soundcloud/i.test(await page.textContent('#srch-panel')));
  await page.keyboard.press('Escape'); await sleep(250);
  ok('no errors in the console (Everything)', errors.length === 0, errors.slice(0, 5).join(' | '));

  /* ---------------- each role ---------------- */
  // Producer and Manager have it, in their words; Band, Solo artist, Scout and Audiophile see nothing new.
  const WORDS = { producer: ['artist', 'Artists'], manager: ['act', 'Roster'] };
  for (const [id, [w, sec]] of Object.entries(WORDS)) {
    await role(page, id);
    await patch(page, 's-sablea', { links: '' });
    await toList(page);
    await openGroup(page, 'rnb');
    await openCard(page, 's-sablea');
    const say = await page.textContent('#ac-pnl-s-sablea .ac-sample-say');
    ok(`${id}: an act with no link says to add one, in the ${id}’s words`, say === `No sample work or other link for this ${w} yet. Add one in ✎ Edit and its QR code shows here, ready to share.`, say);
    await openGroup(page, 'rock');
    await openCard(page, 's-owls');
    ok(`${id}: an act with a link has its code, host, Show big and Share link`, (await qrIn(page, '#ac-pnl-s-owls .ac-sample-qr')) === want1 && (await page.locator('#ac-sample-big-s-owls, #ac-sample-share-s-owls').count()) === 2);
    await patch(page, 's-owls', { sampleWork: '' });
    ok(`${id}: with no sample link the card names the ${w}’s first link`, (await page.textContent('#ac-pnl-s-owls .ac-sample-say')) === `No sample work link yet: this is the ${w}’s first link (Website). Add one in ✎ Edit.`, await page.textContent('#ac-pnl-s-owls .ac-sample-say'));
    await patch(page, 's-owls', { sampleWork: URL1 });
    steps = await listSteps(page);
    const st = steps.find(s => s[0] === 'Sample work');
    ok(`${id}: the list’s walkthrough speaks of the ${w}`, !!st && st[1].includes(`QR code of your sample work for the ${w}.`) && st[1].includes(`the ${w}’s ✎ Edit`), st && st[1]);
    form = await editForm(page, 's-owls');
    const hint = await form.locator('input[data-key=sampleWork]').evaluate(b => b.closest('.field').querySelector('small').textContent);
    ok(`${id}: the form’s Sample work line names the ${w} and ${sec}`, hint === `A page of your work with this ${w}: a SoundCloud, Drive or Dropbox link, or a private playlist. Its QR code is on the ${w}’s card in ${sec}, ready to show or share.`, hint);
    const fst = (await sheetSteps(page, 'Edit act')).find(s => s[0] === 'Sample work');
    ok(`${id}: …and so does its walkthrough`, !!fst && fst[1].includes(`this ${w}`) && fst[1].includes(`card in ${sec}`), fst && fst[1]);
    await page.keyboard.press('Escape'); await sleep(250);
    ok(`${id}: no errors in the console`, errors.length === 0, errors.slice(0, 5).join(' | '));
  }
  await patch(page, 's-sablea', { links: '' });
  for (const id of ['band', 'solo', 'scout', 'audiophile']) {
    await role(page, id);
    await toList(page);
    await openGroup(page, 'rock');
    await openCard(page, 's-owls');
    ok(`${id}: an open card has no sample work`, (await page.locator('.ac-sample, [id^="ac-sample-"]').count()) === 0 && (await page.locator('#ac-pnl-s-owls').count()) === 1);
    steps = await listSteps(page);
    ok(`${id}: nor has the list’s walkthrough`, !steps.some(s => s[0] === 'Sample work'));
    form = await editForm(page, 's-owls');
    ok(`${id}: the act form has no Sample work field, nor a step for it`, (await form.locator('input[data-key=sampleWork], #ac-sample-check').count()) === 0 && !/Sample work/.test(await form.innerText()) && !(await sheetSteps(page, 'Edit act')).some(s => s[0] === 'Sample work'));
    await form.locator('textarea[data-key=notes]').fill(`Saved as ${id}`);
    await save(page);
    a = await stored(page, 's-owls');
    ok(`${id}: saving the act keeps the stored link`, a.sampleWork === URL1 && a.notes === `Saved as ${id}`, JSON.stringify([a.sampleWork, a.notes]));
  }
  // a link that is not text, kept by a role without the field
  await patch(page, 's-owls', { sampleWork: { odd: 1 } });
  form = await editForm(page, 's-owls');
  await save(page);
  ok('audiophile: a stored link that is not text is kept as it was, too', same((await stored(page, 's-owls')).sampleWork, { odd: 1 }));
  await patch(page, 's-owls', { sampleWork: URL1 });
  await role(page, 'all');
  ok('no errors in the console (every role)', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  /* ---------------- 320 px, extra-large text and large buttons, in each section menu ---------------- */
  for (const menu of ['record', 'tape', 'digital']) {
    const prefs = `try { localStorage.setItem('tourbook-prefs', ${JSON.stringify(JSON.stringify({ text: 'xlarge', targets: 'large', menu }))}); localStorage.setItem('tourbook-role', 'producer'); } catch (e) { /* ignore */ }`;
    const { browser: b2, page: p2, errors: e2 } = await open({ sample: true, viewport: { width: 320, height: 700 }, init: prefs });
    await p2.evaluate(u => import('./js/store.js').then(s => { s.patch('acts', 's-owls', { sampleWork: u }); s.upsert('acts', { id: 't-long', name: 'The Extraordinarily Long-Named Orchestra of Somewhere', genre: 'Indie rock', members: [], links: 'Our very long website name: https://www.an-extraordinarily-long-domain-name-for-a-band.example.com/press' }); }), URL1);
    await sleep(250);
    await toList(p2);
    await openGroup(p2, 'rock');
    await openCard(p2, 's-owls');
    await openCard(p2, 't-long');
    await openGroup(p2, 'rnb');
    await openCard(p2, 's-sablea');
    await p2.waitForSelector('#ac-pnl-t-long .ac-sample-qr svg');
    const is = await p2.evaluate(() => ({ text: document.documentElement.dataset.text, menu: document.documentElement.dataset.menu, hit: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hit')) }));
    const wide = await p2.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    const inside = await p2.evaluate(() => [...document.querySelectorAll('.ac-sample, .ac-sample-qr, .ac-sample-host, .ac-sample-say, .ac-sample-actions .btn')].every(el => { const r = el.getBoundingClientRect(), c = el.closest('.ac-card').getBoundingClientRect(); return r.width > 0 && r.left >= c.left - 0.5 && r.right <= c.right + 0.5; }));
    const btns = await p2.$$eval('.ac-sample-actions .btn', (bs, hit) => bs.every(b => b.getBoundingClientRect().height >= hit - 0.5), is.hit);
    ok(`320px, ${menu}: extra-large text and large buttons are on`, is.text === 'xlarge' && is.menu === menu && is.hit >= 54, JSON.stringify(is));
    ok(`320px, ${menu}: open cards with sample work (a long name and host too) do not push the page sideways`, wide <= 320 && inside, JSON.stringify({ wide, inside }));
    ok(`320px, ${menu}: Show big, Share link and Edit are full-size buttons`, btns && (await p2.locator('.ac-sample-actions .btn').count()) === 6);
    if (process.env.S) {
      await p2.evaluate(() => { const d = document.getElementById('deck').getBoundingClientRect().bottom; const r = document.getElementById('ac-sample-h-s-owls').getBoundingClientRect(); window.scrollTo(0, scrollY + r.top - d - 8); });
      await sleep(300);
      await p2.screenshot({ path: `${process.env.S}/50-sample-320-xlarge-${menu}.png` });
    }
    await p2.click('#ac-sample-big-t-long');
    await p2.waitForSelector('.sheet[aria-label="Sample work"] .ac-qr-full svg');
    const sh = await p2.evaluate(() => { const b = [...document.querySelectorAll('.sheet-body')].pop(), q = b.querySelector('.ac-qr-full').getBoundingClientRect(); return { fits: b.scrollWidth <= b.clientWidth + 1, w: q.width, right: q.right }; });
    ok(`320px, ${menu}: Show big fits the screen, the code as wide as it can be`, sh.fits && sh.right <= 320 && sh.w >= 220 && (await p2.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth))) <= 320, JSON.stringify(sh));
    await p2.keyboard.press('Escape'); await sleep(200);
    await p2.evaluate(() => import('./js/pages/acts.js').then(m => m.openAct('t-long')));
    await p2.waitForSelector('#ac-edit');
    await p2.click('#ac-edit');
    await p2.waitForSelector('.sheet[aria-label="Edit act"] input[data-key=sampleWork]');
    await topSheet(p2).locator('input[data-key=sampleWork]').fill('this is not a web address at all, just words');
    await topSheet(p2).locator('input[data-key=sampleWork]').scrollIntoViewIfNeeded();
    const fits = await p2.evaluate(() => { const b = [...document.querySelectorAll('.sheet-body')].pop(), s = b.querySelector('input[data-key=sampleWork]').getBoundingClientRect(), c = b.querySelector('#ac-sample-check').getBoundingClientRect(), o = b.getBoundingClientRect(); return b.scrollWidth <= b.clientWidth + 1 && s.right <= o.right + 0.5 && c.right <= o.right + 0.5; });
    ok(`320px, ${menu}: the form’s Sample work box and its line fit`, fits);
    await p2.keyboard.press('Escape'); await sleep(200);
    ok(`no errors in the console (320px, ${menu})`, e2.length === 0, e2.slice(0, 5).join(' | '));
    await b2.close();
  }
})().catch(e => { console.log('FAIL sample work spec crashed — ' + e.message); process.exit(1); });
