// Backup files carry the free days (the owner, 15 November 2026: docs/go-live.md, Answered). Once licences are on, a
// whole-database file (Save a backup, the locked one inside its encryption, the copy kept in a file) carries the day the
// working roles' free days started on the device it was saved on, as Google Drive's copy does; bringing one back counts
// this device's free days from the earlier of the two, said in the chooser before anything is chosen and taken only once
// the file is really brought back (never on Cancel, Escape, a refused file or a refused change); the database never
// holds the field. With licences off nothing changes: not a byte in a file, nothing taken, not one request to a licence
// server. The spec serves the licence's switch and the status itself, so it reads the same in both legs of CI.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.TOURBOOK_URL || 'http://localhost:8124/';
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DAY = 864e5;
const TERMS_V = (() => { try { return (/TERMS_VERSION = '([^']*)'/.exec(fs.readFileSync(path.join(process.env.TOURBOOK_ROOT || path.join(__dirname, '..', '..'), 'js', 'terms.js'), 'utf8')) || [])[1] || ''; } catch { return ''; } })();
const LIVE = ['localhost', '127.0.0.1'];
// A start at local noon k days back: the days left then change only at noon (the browser shares this clock and zone).
const noon = k => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() - k, 12).getTime(); };
// Not across noon while a line is worked out and then checked: within 90 seconds before it, wait until just after.
const clearOfNoon = async () => { const n = new Date(), ms = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12) - n; if (ms > -3000 && ms < 90000) await sleep(ms + 3000); };
const trialRecord = first => ({ on: true, statusAt: Date.now(), first, seen: Date.now() });
const agreed = () => ({ v: TERMS_V, at: Date.now() });
const BRING = '.sheet[aria-label="Bring back a backup"]', LOCKED = '.sheet[aria-label="Locked backup"]', REFUSED = '.sheet[aria-label="That file can’t be used"]';
// A copy kept in a file without a real disk: the picker hands back a file whose writes are kept in window.__file (it
// cannot be remembered in IndexedDB, which the card then says; nothing else changes).
const FAKE_FILE = () => {
  window.__file = { text: '', writes: 0 };
  window.showSaveFilePicker = async () => ({ name: 'tourbook-db.json', createWritable: async () => ({ write: async t => { window.__file.text = String(t); window.__file.writes++; }, close: async () => {}, abort: async () => {} }) });
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  // A phone-sized page like tests/helpers.cjs makes, with the licence's switch served as `sites`, the status answered as
  // on and the price (no Date header), every request to /licence/ or /buy recorded, and `seed` put in storage once.
  const openWith = async (sites, { seed = {}, init = null } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
    const asked = [];
    ctx.on('request', r => { const p = new URL(r.url()).pathname; if (/^\/licence\/|^\/buy$/.test(p)) asked.push(p); });
    await ctx.route('**/js/licence-config.js', r => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: `export const LICENCE_SITES = ${JSON.stringify(sites)};\n` }));
    await ctx.route('**/licence/web/status', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"on":true}' }));
    await ctx.route('**/licence/price', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"price":"20.00","currency":"USD","country":"","taxed":null}' }));
    await ctx.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"daily":{"time":[]}}' }));
    await ctx.addInitScript(seed => {
      try {
        if (!localStorage.getItem('t-seeded')) { localStorage.setItem('t-seeded', '1'); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }
        localStorage.setItem('tourbook-tour', 'done'); localStorage.setItem('tourbook-role-nudged', '1'); localStorage.setItem('tourbook-ask-seen', 'off');
      } catch (e) { /* ignore */ }
    }, seed);
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
    page.on('dialog', d => d.accept());
    await page.goto(BASE);
    await page.waitForSelector('#deck .dk-next');
    return { ctx, page, asked };
  };
  const tap = async (page, sel) => {
    await page.waitForSelector(sel, { state: 'visible', timeout: 15000 });
    await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
    await sleep(80);
    await page.click(sel);
  };
  const sample = async page => { await page.evaluate(() => import('./js/store.js').then(s => s.loadSample())); await sleep(200); };
  const backups = async page => {
    await page.evaluate(() => window.logiGo('settings')); await page.waitForSelector('#se-backups');
    if (!(await page.$eval('#se-backups', d => d.open))) await tap(page, '#se-backups-sum');
    await page.waitForSelector('#page .se-bk-save', { state: 'visible' });
  };
  const exported = page => page.evaluate(() => import('./js/store.js').then(s => s.exportJSON()));
  const saveBackup = async page => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), tap(page, '#page .se-bk-save')]); return fs.readFileSync(await dl.path(), 'utf8'); };
  const saveLocked = async (page, pass) => {
    await tap(page, '#page .se-bk-lock'); await page.waitForSelector('.sheet[aria-label="Save with a passphrase"]');
    await page.fill('#se-pass-1', pass); await page.fill('#se-pass-2', pass);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('.sheet[aria-label="Save with a passphrase"] button[type=submit]')]);
    return fs.readFileSync(await dl.path(), 'utf8');
  };
  const openLocked = (page, text, pass) => page.evaluate(([text, pass]) => import('./js/crypto.js').then(async C => { const b = JSON.parse(text); return C.decryptText(await C.pbkdf2Key(pass, C.fromB64(b.kdf.salt), b.kdf.iter), b); }), [text, pass]);
  const lockFile = (page, text, pass) => page.evaluate(([text, pass]) => import('./js/crypto.js').then(async C => {
    const salt = C.bytes(16), iter = 1000, box = await C.encrypt(await C.pbkdf2Key(pass, salt, iter), text);
    return JSON.stringify({ tourbook: 'encrypted-backup', v: 1, exported: new Date().toISOString(), kdf: { salt: C.toB64(salt), iter }, iv: box.iv, ct: box.ct });
  }), [text, pass]);
  // This device's database as a backup file, with `extra` (a start, a new song…) beside it.
  const fileOf = async (page, extra = {}) => JSON.stringify({ ...JSON.parse(await exported(page)), ...extra }, null, 2);
  const withSong = async (page, id, extra = {}) => { const d = JSON.parse(await exported(page)); return JSON.stringify({ ...d, songs: [...d.songs, { id, title: 'Song ' + id, updatedAt: Date.now() + 5000 }], ...extra }, null, 2); };
  // Picks a file in Settings → Backups; resolves with the chooser's free-days line ('' when none) once it is open.
  const bring = async (page, body, name = 'tourbook-backup-2026-11-01.json') => {
    await page.setInputFiles('#page .se-bk-input', { name, mimeType: 'application/json', buffer: Buffer.from(body) });
    await page.waitForSelector(BRING, { timeout: 15000 });
    return (await page.locator(`${BRING} .se-imp-days`).count()) ? page.locator(`${BRING} .se-imp-days`).innerText() : '';
  };
  const choose = async (page, which) => { await page.click(`${BRING} ${which}`); await page.waitForSelector(BRING, { state: 'detached', timeout: 10000 }); await sleep(500); };
  // The licence as this device keeps it: both copies of the start, the state, and whether the database holds the field.
  const lic = page => page.evaluate(() => Promise.all([import('./js/licence-state.js'), import('./js/kv.js')]).then(async ([L, k]) => {
    const s = L.licenceNow(), days = await k.kvGet('licence-days').catch(() => null);
    return { stored: localStorage.getItem('tourbook-licence'), days: days == null ? null : days, mode: s.mode, first: s.first, trialLeft: s.trialLeft, trialEnds: s.trialEnds, canEdit: s.canEdit, field: 'freeDaysFrom' in JSON.parse(localStorage.getItem('tourbook-db-v1') || '{}') };
  }));
  // What the chooser should say for start t, in the page's own formatter and the free days' own sum.
  const expect = (page, t) => page.evaluate(t => import('./js/licence-state.js').then(L => {
    const pad = n => String(n).padStart(2, '0'), iso = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const seen = Number((JSON.parse(localStorage.getItem('tourbook-licence') || '{}') || {}).seen) || 0;
    const left = Math.max(0, 30 - Math.floor((Math.max(Date.now(), seen, t) - t) / 864e5));
    return { left, leftWords: left === 1 ? '1 day left' : `${left} days left`, from: L.endsWords({ trialEnds: iso(t) }), until: L.endsWords({ trialEnds: iso(t + 30 * 864e5) }), ends: iso(t + 30 * 864e5) };
  }), t);
  const lastKey = text => Object.keys(JSON.parse(text)).pop();
  const storedFirst = l => (JSON.parse(l.stored || 'null') || {}).first;
  let fieldEver = false; // the database held freeDaysFrom after a bring-back
  const noField = async page => { const l = await lic(page); if (l.field) fieldEver = true; return !l.field; };

  try {
    /* ---------------- licences off: nothing in a file, nothing taken, nothing asked ---------------- */
    {
      const T = noon(5);
      const { ctx, page, asked } = await openWith([], { seed: { 'tourbook-licence': trialRecord(T) }, init: FAKE_FILE });
      await sample(page); await backups(page);
      const plain = await saveBackup(page), db = await exported(page);
      ok('licences off: a saved backup is the database exactly, with no freeDaysFrom (though this device holds a start)', plain === db && !('freeDaysFrom' in JSON.parse(plain)), lastKey(plain));
      const locked = await saveLocked(page, 'off days 2026');
      const inside = await openLocked(page, locked, 'off days 2026');
      ok('…a locked backup, opened with its passphrase, is the database exactly, with no freeDaysFrom', inside === db && !('freeDaysFrom' in JSON.parse(inside)), lastKey(inside));
      await tap(page, '#page .se-bk-link');
      await page.waitForSelector('#page .se-bk-file[data-state=saved]', { timeout: 15000 });
      const copy = await page.evaluate(() => window.__file.text);
      ok('…the copy kept in a file is the database exactly, with no freeDaysFrom', copy === db && !('freeDaysFrom' in JSON.parse(copy)), lastKey(copy));
      const before = await lic(page);
      const line = await bring(page, await withSong(page, 't-off', { freeDaysFrom: noon(12) }));
      await choose(page, '.se-imp-merge');
      const after = await lic(page);
      const came = await page.evaluate(() => import('./js/store.js').then(s => !!s.byId('songs', 't-off')));
      ok('…a file carrying an earlier start: no line in the chooser; after Merge the records came in, and tourbook-licence and IndexedDB’s copy are as they were', line === '' && came && after.stored === before.stored && same(after.days, before.days) && after.mode === 'off', JSON.stringify({ line, before, after }));
      ok('…and the database never holds the field', await noField(page));
      await page.evaluate(() => window.logiGo('bookings')); await sleep(1500);
      ok('…not one request to /licence/ or /buy in the whole visit', asked.length === 0, asked.join(' '));
      await ctx.close();
    }

    /* ---------------- licences on, a fresh Audiophile: the file's start starts the free days here ---------------- */
    {
      const { ctx, page, asked } = await openWith(LIVE, { seed: { 'tourbook-role': 'audiophile' } });
      await sample(page); await backups(page); await sleep(1800); // the status tick at opening has had its chance
      const T0 = noon(10);
      const before = await lic(page), askedBefore = asked.slice();
      await clearOfNoon();
      const want = await expect(page, T0);
      const line = await bring(page, await withSong(page, 't-fresh', { freeDaysFrom: T0 }));
      const words = `Your free days for the working roles started on ${want.from} on the device this backup was saved on. Bringing it back starts them on this device from that day: ${want.leftWords}, until ${want.until}.`;
      ok('licences on, an Audiophile whose free days have not started: the chooser says the file’s start starts them here, how many days are left and until when', line === words, JSON.stringify({ line, words }));
      ok('…before anything is chosen, nothing has started', before.mode === 'unstarted' && !storedFirst(before) && (await lic(page)).mode === 'unstarted', JSON.stringify(before));
      await choose(page, '.se-imp-merge');
      await sleep(300);
      const after = await lic(page);
      ok('…after Merge: tourbook-licence and IndexedDB’s copy start on the file’s day, and the free days run with the days the line said', storedFirst(after) === T0 && after.days && after.days.first === T0 && after.mode === 'trial' && after.first === T0 && after.trialLeft === want.left && after.trialEnds === want.ends, JSON.stringify(after));
      ok('…no terms sheet (an Audiophile never sees it), and the records came in', (await page.locator('.lic-terms-sheet').count()) === 0 && await page.evaluate(() => import('./js/store.js').then(s => !!s.byId('songs', 't-fresh'))));
      ok('…the database never holds the field', await noField(page));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await sleep(1500);
      const statusAfter = asked.filter(p => p === '/licence/web/status').length;
      ok('…the licence server hears from this browser only now that the free days have started here: before the file, not even the price', askedBefore.length === 0 && statusAfter >= 1, JSON.stringify({ askedBefore, asked }));
      await ctx.close();
    }

    /* ---------------- licences on: the copy kept in a file follows the start with no change to the data ---------------- */
    {
      const { ctx, page } = await openWith(LIVE, { seed: { 'tourbook-role': 'audiophile', 'tourbook-terms': agreed() }, init: FAKE_FILE });
      await sample(page); await backups(page);
      await tap(page, '#page .se-bk-link');
      await page.waitForSelector('#page .se-bk-file[data-state=saved]', { timeout: 15000 });
      const first = await page.evaluate(() => ({ text: window.__file.text, writes: window.__file.writes, at: JSON.parse(localStorage.getItem('tourbook-db-v1')).updatedAt }));
      const opened = await page.evaluate(() => window.logiGo('people')); // a working section: the free days start
      await sleep(2600);
      const then = await page.evaluate(() => import('./js/licence-state.js').then(L => ({ text: window.__file.text, writes: window.__file.writes, at: JSON.parse(localStorage.getItem('tourbook-db-v1')).updatedAt, from: L.freeDaysFrom() })));
      ok('licences on: the copy kept in a file has no start before the free days start, and is written again with it when they start, with no change to the data', !('freeDaysFrom' in JSON.parse(first.text)) && opened === true && then.from > 0 && JSON.parse(then.text).freeDaysFrom === then.from && lastKey(then.text) === 'freeDaysFrom' && then.writes === first.writes + 1 && then.at === first.at, JSON.stringify({ opened, first: { writes: first.writes, at: first.at }, then: { writes: then.writes, at: then.at, from: then.from } }));
      await ctx.close();
    }

    /* ---------------- licences on, a Producer in its free days ---------------- */
    {
      const T1 = noon(3);
      const { ctx, page, asked } = await openWith(LIVE, { seed: { 'tourbook-role': 'producer', 'tourbook-terms': agreed(), 'tourbook-licence': trialRecord(T1) }, init: FAKE_FILE });
      await sample(page); await backups(page);
      const db = await exported(page);
      const plain = await saveBackup(page);
      ok('licences on, free days under way: a saved backup carries freeDaysFrom, this device’s start, as its last key, after the database exactly', plain === JSON.stringify({ ...JSON.parse(db), freeDaysFrom: T1 }, null, 2) && lastKey(plain) === 'freeDaysFrom', lastKey(plain));
      const locked = await saveLocked(page, 'on days 2026');
      const inside = await openLocked(page, locked, 'on days 2026');
      ok('…a locked backup carries it only inside its encryption: the envelope’s keys are tourbook, v, exported, kdf, iv, ct, and the start is nowhere in its text', same(Object.keys(JSON.parse(locked)), ['tourbook', 'v', 'exported', 'kdf', 'iv', 'ct']) && !locked.includes(String(T1)) && JSON.parse(inside).freeDaysFrom === T1 && lastKey(inside) === 'freeDaysFrom', Object.keys(JSON.parse(locked)).join());
      await tap(page, '#page .se-bk-link');
      await page.waitForSelector('#page .se-bk-file[data-state=saved]', { timeout: 15000 });
      const copy = await page.evaluate(() => window.__file.text);
      ok('…the copy kept in a file carries it too', JSON.parse(copy).freeDaysFrom === T1 && lastKey(copy) === 'freeDaysFrom');
      await tap(page, '#page .se-bk-unlink'); await page.waitForSelector('#page .se-bk-file[data-state=off]', { timeout: 10000 });

      // An earlier start in the file: Cancel and Escape take nothing.
      await clearOfNoon();
      let line = await bring(page, await fileOf(page, { freeDaysFrom: noon(10) }));
      await page.click(`${BRING} .btn.ghost:has-text("Cancel")`); await page.waitForSelector(BRING, { state: 'detached' }); await sleep(300);
      const cancelled = await lic(page);
      const line2 = await bring(page, await fileOf(page, { freeDaysFrom: noon(10) }));
      await page.keyboard.press('Escape'); await page.waitForSelector(BRING, { state: 'detached' }); await sleep(300);
      const escaped = await lic(page);
      ok('an earlier start shows its line, and Cancel and Escape take nothing', /started earlier/.test(line) && line2 === line && cancelled.first === T1 && escaped.first === T1 && storedFirst(escaped) === T1, JSON.stringify({ line, cancelled: cancelled.first, escaped: escaped.first }));

      // Refused files take nothing: a Vdex-shaped one and one that is not JSON, each "carrying" an earlier start.
      await page.setInputFiles('#page .se-bk-input', { name: 'vdex-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 3, updatedAt: Date.now(), bookings: [{ id: 'v1', title: 'Wedding shoot' }], gear: [], crew: [{ id: 'c1', name: 'Cam Op' }], freeDaysFrom: noon(10) })) });
      await page.waitForSelector(REFUSED); await page.click(`${REFUSED} .btn.primary`); await sleep(300);
      await page.setInputFiles('#page .se-bk-input', { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(`{ "freeDaysFrom": ${noon(10)}, `) });
      await page.waitForSelector(REFUSED); await page.click(`${REFUSED} .btn.primary`); await sleep(300);
      ok('a refused file (Vdex’s, or not JSON) takes nothing', (await lic(page)).first === T1);

      // A file that is not Tourbook's own (no app: songs and bookings only) carrying a start: no line, nothing taken.
      const d0 = JSON.parse(await exported(page));
      line = await bring(page, JSON.stringify({ songs: d0.songs, bookings: d0.bookings, freeDaysFrom: noon(10) }));
      await choose(page, '.se-imp-merge');
      ok('a file without app "tourbook" carrying a start: no line, and nothing is taken on Merge', line === '' && (await lic(page)).first === T1 && await noField(page), line);

      // Starts that are no start: each shows no line and changes nothing on Merge.
      const bad = [['none', undefined], ['later than this device’s', noon(1)], ['two days ahead', Date.now() + 2 * DAY], ['before 2026', Date.UTC(2025, 11, 31)], ['a number in text', String(noon(10))], ['null', null], ['an object', {}], ['true', true]];
      const wrong = [];
      for (const [what, v] of bad) {
        const l = await bring(page, await fileOf(page, { freeDaysFrom: v }));
        await choose(page, '.se-imp-merge');
        const now = await lic(page);
        if (l !== '' || now.first !== T1 || storedFirst(now) !== T1 || now.field) wrong.push({ what, l, first: now.first });
      }
      ok('none, a later start, one two days ahead, one before 2026, a number in text, null, an object, true: no line, and nothing taken on Merge', wrong.length === 0, JSON.stringify(wrong));

      // An earlier start, brought back with Replace (the confirm accepted): counted from the file's day.
      await clearOfNoon();
      const T10 = noon(10), want = await expect(page, T10);
      line = await bring(page, await fileOf(page, { freeDaysFrom: T10 }));
      const words = `Your free days for the working roles started earlier on the device this backup was saved on, on ${want.from}. Bringing it back counts them from that day on this device too: ${want.leftWords}, until ${want.until}.`;
      ok('an earlier start: the chooser says the free days count from the file’s day here too, how many are left and until when', line === words, JSON.stringify({ line, words }));
      await choose(page, '.se-imp-replace');
      let now = await lic(page);
      ok('…after Replace, this device counts from the file’s day, in both copies, with the days the line said', now.first === T10 && storedFirst(now) === T10 && now.days && now.days.first === T10 && now.mode === 'trial' && now.trialLeft === want.left && now.trialEnds === want.ends && await noField(page), JSON.stringify(now));

      // A later start than this device's: no line, nothing taken. One second earlier (the same days, the same last day): no
      // line, but taken (it is earlier).
      line = await bring(page, await fileOf(page, { freeDaysFrom: noon(5) }));
      await choose(page, '.se-imp-merge');
      ok('this device’s earlier start wins over the file’s later one: no line, nothing taken', line === '' && (await lic(page)).first === T10, line);
      await clearOfNoon();
      line = await bring(page, await fileOf(page, { freeDaysFrom: T10 - 1000 }));
      await choose(page, '.se-imp-merge');
      ok('a start one second earlier, with the same days left and the same last day: no line, and taken quietly', line === '' && (await lic(page)).first === T10 - 1000, line);

      // A locked backup carrying an earlier start: the line once it is open, taken on Merge.
      await clearOfNoon();
      const T12 = noon(12), want12 = await expect(page, T12);
      await page.setInputFiles('#page .se-bk-input', { name: 'tourbook-backup-2026-11-01.locked.json', mimeType: 'application/json', buffer: Buffer.from(await lockFile(page, await fileOf(page, { freeDaysFrom: T12 }), 'locked days 2026')) });
      await page.waitForSelector(LOCKED, { timeout: 15000 });
      await page.fill('#se-pass-1', 'locked days 2026'); await page.click(`${LOCKED} button[type=submit]`);
      await page.waitForSelector(BRING, { timeout: 15000 });
      line = (await page.locator(`${BRING} .se-imp-days`).count()) ? await page.locator(`${BRING} .se-imp-days`).innerText() : '';
      await choose(page, '.se-imp-merge');
      now = await lic(page);
      ok('a locked backup carrying an earlier start: the line once its passphrase opens it, and taken on Merge', line.includes(`on ${want12.from}.`) && line.includes(`${want12.leftWords}, until ${want12.until}.`) && now.first === T12 && await noField(page), JSON.stringify({ line, first: now.first }));

      // A backup saved straight after carries exactly this device's start.
      const again = await saveBackup(page);
      ok('a backup saved now carries exactly this device’s start, and the database still never holds it', JSON.parse(again).freeDaysFrom === T12 && lastKey(again) === 'freeDaysFrom' && !fieldEver);

      // A start 40 days back: the warning, and the working roles read-only once it is brought back.
      const T40 = noon(40);
      line = await bring(page, await withSong(page, 't-over', { freeDaysFrom: T40 }));
      const over = await page.locator(`${BRING} .se-imp-days.warn`).count();
      ok('a start 40 days back: the chooser warns that the free days are over and the working roles become read-only here', over === 1 && line === `⚠ Your free days for the working roles started on ${(await expect(page, T40)).from} on the device this backup was saved on, so they are over. Bringing it back makes the working roles read-only on this device until there is a licence. Audiophile stays free, for personal use, not for work.`, line);
      await choose(page, '.se-imp-merge');
      now = await lic(page);
      const came = await page.evaluate(() => import('./js/store.js').then(s => !!s.byId('songs', 't-over')));
      await sleep(3200); // past the tap, so the refusal below is a quiet one
      const wrote = await page.evaluate(() => import('./js/store.js').then(s => s.update(d => { d.profile = { ...d.profile, name: 'After the days' }; })));
      ok('…after Merge the records came in, the days are over (from the file’s day), and Producer can change nothing', came && now.first === T40 && now.mode === 'ended' && now.canEdit === false && wrote === false, JSON.stringify({ came, now, wrote }));

      // Read-only now: an even earlier start shows no line, and Merge is refused (the read-only sheet), taking nothing.
      line = await bring(page, await fileOf(page, { freeDaysFrom: noon(50) }));
      await page.click(`${BRING} .se-imp-merge`);
      await page.waitForSelector('.sheet.licence-readonly', { timeout: 8000 }).catch(() => {});
      const ro = await page.locator('.sheet.licence-readonly').count(), still = await page.locator(BRING).count();
      await page.evaluate(() => { document.querySelectorAll('.sheet.licence-readonly .sheet-head [aria-label="Close"]').forEach(b => b.click()); }); await sleep(300);
      await page.click(`${BRING} .btn.ghost:has-text("Cancel")`); await page.waitForSelector(BRING, { state: 'detached' }); await sleep(300);
      ok('read-only, days over: an earlier start shows no line, Merge is refused by the read-only sheet, and nothing is taken', line === '' && ro === 1 && still === 1 && (await lic(page)).first === T40, JSON.stringify({ line, ro, still }));
      ok('…the free-days questions asked nothing of the licence server but the status and the price', asked.every(p => p === '/licence/web/status' || p === '/licence/price'), asked.join(' '));
      await ctx.close();
    }
  } catch (e) { ok('backup days crashed', false, e.stack); }
  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL backup days crashed — ' + e.message); process.exit(1); });
