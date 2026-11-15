// The one-time copy from Gdex (decisions §19; js/from-gdex.js and the "from Gdex" block of js/kv.js). The app was called
// Gdex until just before launch and its owner used it under that name: on Tourbook's first opening in a browser (no
// tourbook-… key there yet) every localStorage key still named gdex-… is copied to its tourbook-… name, and the old
// IndexedDB "gdex" into "tourbook" when that is first made; the old ones are left as they are, nothing is said, it runs
// before anything reads storage, it happens once, it never overwrites anything of Tourbook's, and it never throws
// (storage blocked or full, junk, no old database). In the licence leg it also checks that the free days it brings over
// only ever move Tourbook's start earlier, never later, and that free days over under Gdex stay over. Every context here
// is the spec's own, seeded on the same address through privacy.html, a page that runs no script, before Tourbook is
// first opened.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { open, ok, sleep, BASE } = require('../helpers.cjs');

const TERMS_V = (/TERMS_VERSION = '([^']*)'/.exec(fs.readFileSync(path.join(process.env.TOURBOOK_ROOT || path.join(__dirname, '..', '..'), 'js', 'terms.js'), 'utf8')) || [])[1] || '';
const ON = process.env.TOURBOOK_LICENCE === 'on';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = Date.now();
// What a browser that used Gdex holds: its database (one act), its display choices (dark, the tape deck), a role, the
// tour done, the terms agreed (and in the licence leg free days under way), a key the app no longer reads, junk, a bare
// "gdex-" and another app's key.
const OLD_DB = { app: 'gdex', version: 1, updatedAt: T, profile: { name: 'Riley Old', currency: '£' }, acts: [{ id: 'a-old', name: 'The Old Owls', genre: 'Rock', updatedAt: T }], bookings: [], songs: [] };
const OLD = {
  'gdex-db-v1': JSON.stringify(OLD_DB),
  'gdex-prefs': JSON.stringify({ scheme: 'dark', menu: 'tape' }),
  'gdex-role': 'producer',
  'gdex-tour': 'done',
  'gdex-role-nudged': '1',
  'gdex-ask-seen': 'off',
  'gdex-terms': JSON.stringify({ v: TERMS_V, at: T }),
  ...(ON ? { 'gdex-licence': JSON.stringify({ on: true, statusAt: T, first: T, seen: T }) } : {}),
  'gdex-tab': 'money',
  'gdex-cal-view': 'not-a-view',
  'gdex-daysheet': '{oops',
  'gdex-': 'bare',
  'vdex-role': 'videographer',
};
const COPIED = Object.keys(OLD).filter(k => k.startsWith('gdex-') && k !== 'gdex-' && k !== 'gdex-tab');
const OLD_KV = [['licence-days', { first: T - 864e5, seen: T }], ['note', 'kept from Gdex']];

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const fresh = async init => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block', colorScheme: 'light' });
    // The first colour scheme painted on <html> (js/prepaint.js sets it before any module runs).
    await ctx.addInitScript(() => { new MutationObserver((m, o) => { if (document.documentElement && document.documentElement.dataset.scheme) { window.__firstScheme = window.__firstScheme || document.documentElement.dataset.scheme; } }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-scheme'] }); });
    if (init) await ctx.addInitScript(init);
    await ctx.route('https://*.tile.openstreetmap.org/**', r => r.fulfill({ status: 204 }));
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
    page.on('dialog', d => d.accept());
    await page.goto(new URL('privacy.html', BASE).href);
    return { ctx, page };
  };
  const seed = (page, items) => page.evaluate(items => { for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); }, items);
  const seedOldDb = (page, entries, store = 'kv') => page.evaluate(([entries, store]) => new Promise((res, rej) => {
    const r = indexedDB.open('gdex', 1);
    r.onupgradeneeded = () => r.result.createObjectStore(store);
    r.onsuccess = () => { const t = r.result.transaction(store, 'readwrite'); for (const [k, v] of entries) t.objectStore(store).put(v, k); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
    r.onerror = () => rej(r.error);
  }), [entries, store]);
  const readOldDb = page => page.evaluate(() => new Promise(res => {
    const r = indexedDB.open('gdex'); r.onupgradeneeded = () => { r.transaction.abort(); };
    r.onerror = e => { e.preventDefault(); res(null); };
    r.onsuccess = () => { const out = []; const t = r.result.transaction('kv'), c = t.objectStore('kv').openCursor(); c.onsuccess = () => { if (c.result) { out.push([c.result.key, c.result.value]); c.result.continue(); } }; t.oncomplete = () => { r.result.close(); res(out); }; };
  }));
  const storage = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
  const dbNames = page => page.evaluate(() => indexedDB.databases().then(l => l.map(d => d.name).sort()));
  const openApp = async page => { await page.goto(BASE); await page.waitForSelector('#deck .dk-next'); await sleep(400); };
  const kvGet = (page, ...keys) => page.evaluate(keys => import('./js/kv.js').then(k => Promise.all(keys.map(key => k.kvGet(key)))), keys);
  const app = page => page.evaluate(() => Promise.all([import('./js/store.js'), import('./js/roles.js')]).then(([s, r]) => ({ acts: s.db.acts.map(a => a.name), app: s.db.app, name: s.db.profile.name, role: r.roleId(), page: window.logiPage() })));

  /* ---------------------------- the first opening ---------------------------- */
  {
    const { ctx, page } = await fresh();
    await seed(page, OLD); await seedOldDb(page, OLD_KV);
    await openApp(page);
    const st = await storage(page), a = await app(page);
    // The licence's state (the licence leg) is the licence's to update as Tourbook opens: its free days carry over, from
    // the earlier of its two copies (the old IndexedDB's, copied too).
    const off = COPIED.filter(k => k !== 'gdex-licence' && st['tourbook-' + k.slice(5)] !== OLD[k]);
    if (ON) { let lic = {}; try { lic = JSON.parse(st['tourbook-licence']); } catch { /* none */ } if (lic.first !== OLD_KV[0][1].first) off.push('gdex-licence ' + st['tourbook-licence']); }
    ok('every gdex- key is copied to its tourbook- name, value for value (junk as it was)', !off.length, off.join(', '));
    ok('…the gdex- keys are left exactly as they were, and another app\'s key and a bare "gdex-" are not copied', Object.keys(OLD).every(k => st[k] === OLD[k]) && !('tourbook-' in st) && Object.keys(st).filter(k => st[k] === 'videographer').join() === 'vdex-role', JSON.stringify(Object.keys(st)));
    ok('…it ran before anything read storage: the first scheme painted is the copied dark one (the browser is light), the copied tape deck is the menu', (await page.evaluate(() => window.__firstScheme)) === 'dark' && (await page.evaluate(() => document.documentElement.dataset.menu)) === 'tape', await page.evaluate(() => window.__firstScheme));
    ok('…Tourbook opens on what Gdex held: its act and details, as Tourbook\'s own database, in the copied role, with no tour and no question', same(a.acts, ['The Old Owls']) && a.app === 'tourbook' && a.name === 'Riley Old' && a.role === 'producer' && !(await page.$('.tour')) && !(await page.$('.sheet')), JSON.stringify(a));
    ok('…a key the app no longer reads is copied and then dropped as usual: it opens on the calendar', a.page === 'bookings' && !('tourbook-tab' in st));
    const [days, note] = await kvGet(page, 'licence-days', 'note');
    ok('the old IndexedDB "gdex" is copied into "tourbook", entry for entry', same(days, OLD_KV[0][1]) && note === OLD_KV[1][1], JSON.stringify([days, note]));
    ok('…and "gdex" is left as it was', same(await readOldDb(page), [...OLD_KV].sort((x, y) => (x[0] < y[0] ? -1 : 1))));
    ok('nothing is said: no toast, no sheet', !(await page.$('.toast')) && !(await page.$('.sheet')));

    /* -------------------------------- once -------------------------------- */
    // Something Tourbook removes later (a role cleared, an entry deleted) never comes back from the old names.
    await page.evaluate(() => { localStorage.removeItem('tourbook-role'); localStorage.setItem('tourbook-ask-seen', 'on'); });
    await page.evaluate(() => import('./js/kv.js').then(k => k.kv('readwrite', s => s.delete('note'))));
    await openApp(page);
    const st2 = await storage(page);
    ok('once: after the first opening nothing is copied again (a removed role stays removed, a changed key keeps its value, a deleted entry stays deleted)', !('tourbook-role' in st2) && st2['tourbook-ask-seen'] === 'on' && (await kvGet(page, 'note'))[0] === undefined && st2['gdex-role'] === 'producer', JSON.stringify(st2['tourbook-role']));
    // Erase this device: what was copied goes with everything else, and nothing comes back from the old keys.
    await page.evaluate(() => import('./js/store.js').then(s => s.eraseAll()));
    await openApp(page);
    const st3 = await storage(page), a3 = await app(page);
    ok('…an Erase is not undone by the old keys: the database stays empty and the role unset', a3.acts.length === 0 && !('tourbook-role' in st3), JSON.stringify(a3));
    const KEPT = ['gdex-prefs', 'gdex-cal-view', 'gdex-licence', 'gdex-terms'];
    const oldLeft = Object.keys(st3).filter(k => k.startsWith('gdex-') && k !== 'gdex-'); // a bare gdex- was never Gdex's
    ok('…and Erase removes the old gdex- copies too (the old database gdex-db-v1 and the role), keeping only the old copies of the four keys Erase keeps', !('gdex-db-v1' in st3) && !('gdex-role' in st3) && oldLeft.every(k => KEPT.includes(k)) && KEPT.filter(k => k in OLD).every(k => st3[k] === OLD[k]), oldLeft.join(', '));
    await ctx.close();
  }

  /* -------------------- Tourbook already here: nothing is copied -------------------- */
  {
    const { ctx, page } = await fresh();
    await seed(page, { ...OLD, 'tourbook-role': 'band', 'tourbook-tour': 'done', 'tourbook-role-nudged': '1', 'tourbook-ask-seen': 'off', 'tourbook-terms': OLD['gdex-terms'], ...(ON ? { 'tourbook-licence': OLD['gdex-licence'] } : {}) });
    await openApp(page);
    const st = await storage(page), a = await app(page);
    ok('a browser that already has Tourbook\'s keys gets nothing from Gdex\'s: its own role stays, no database or display choices come over', st['tourbook-role'] === 'band' && a.role === 'band' && a.acts.length === 0 && !('tourbook-prefs' in st) && !('tourbook-daysheet' in st), JSON.stringify({ role: st['tourbook-role'], acts: a.acts }));
    await ctx.close();
  }

  /* ------------- the licence leg: the copy never gives a later start of the free days ------------- */
  // A start only ever moves earlier (js/licence-state.js joins its two copies, the earlier start counting): what the copy
  // brings over can make Tourbook's free days older, never newer, and free days that ended under Gdex stay ended.
  if (ON) {
    const DAY = 864e5;
    const lic = page => page.evaluate(() => import('./js/licence-state.js').then(async L => { await L.licenceReady(); const s = L.licenceNow(); return { mode: s.mode, first: s.first }; }));
    const seedNewDb = (page, entries) => page.evaluate(entries => new Promise((res, rej) => {
      const r = indexedDB.open('tourbook', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); for (const [k, v] of entries) t.objectStore('kv').put(v, k); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
      r.onerror = () => rej(r.error);
    }), entries);
    const firstOf = st => { try { return JSON.parse(st['tourbook-licence']).first; } catch { return null; } };
    const used = { 'gdex-tour': 'done', 'gdex-role-nudged': '1', 'gdex-ask-seen': 'off', 'gdex-role': 'producer', 'gdex-terms': OLD['gdex-terms'] };
    // Tourbook's own free days began 3 days ago; Gdex's, in the old IndexedDB, 25 days ago: the earlier counts.
    {
      const { ctx, page } = await fresh();
      await seed(page, { ...used, 'tourbook-tour': 'done', 'tourbook-role-nudged': '1', 'tourbook-ask-seen': 'off', 'tourbook-role': 'producer', 'tourbook-terms': OLD['gdex-terms'], 'tourbook-licence': JSON.stringify({ on: true, statusAt: T, first: T - 3 * DAY, seen: T }) });
      await seedOldDb(page, [['licence-days', { first: T - 25 * DAY, seen: T }]]);
      await openApp(page);
      const L = await lic(page), st = await storage(page);
      ok('free days: Tourbook\'s own later start gives way to Gdex\'s earlier one, from the old IndexedDB (25 days ago, not 3)', L.mode === 'trial' && L.first === T - 25 * DAY && firstOf(st) === T - 25 * DAY, JSON.stringify({ L, first: firstOf(st) }));
      await ctx.close();
    }
    // Gdex's start is the later one (2 days ago; 1 in its IndexedDB), Tourbook's IndexedDB holds 10 days ago: that stays.
    {
      const { ctx, page } = await fresh();
      await seed(page, { ...used, 'gdex-licence': JSON.stringify({ on: true, statusAt: T, first: T - 2 * DAY, seen: T }) });
      await seedOldDb(page, [['licence-days', { first: T - DAY, seen: T }]]);
      await seedNewDb(page, [['licence-days', { first: T - 10 * DAY, seen: T }]]);
      await openApp(page);
      const L = await lic(page), st = await storage(page), [days] = await kvGet(page, 'licence-days');
      ok('…a later start brought over from Gdex never moves Tourbook\'s earlier one (10 days ago stays, in both copies)', L.first === T - 10 * DAY && firstOf(st) === T - 10 * DAY && days && days.first === T - 10 * DAY, JSON.stringify({ L, first: firstOf(st), days }));
      await ctx.close();
    }
    // Free days that ended under Gdex (40 days ago).
    {
      const { ctx, page } = await fresh();
      await seed(page, { ...used, 'gdex-licence': JSON.stringify({ on: true, statusAt: T, first: T - 40 * DAY, seen: T }) });
      await openApp(page);
      const L = await lic(page);
      ok('…and free days that ended under Gdex are over in Tourbook too: the working role is read-only', L.mode === 'ended' && L.first === T - 40 * DAY, JSON.stringify(L));
      await ctx.close();
    }
  }

  /* ------------------------------ it never throws ------------------------------ */
  // Storage full for one key: that key stays behind, the others still come over.
  {
    const { ctx, page } = await fresh(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'tourbook-db-v1' && document.currentScript && /from-gdex/.test(document.currentScript.src)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return set.call(this, k, v); };
    });
    await seed(page, OLD);
    await openApp(page);
    const st = await storage(page), a = await app(page);
    ok('storage full for the database: it stays behind, every other key comes over, and the page opens', st['tourbook-db-v1'] !== OLD['gdex-db-v1'] && a.acts.length === 0 && st['tourbook-role'] === 'producer' && a.role === 'producer' && st['tourbook-prefs'] === OLD['gdex-prefs'] && !!(await page.$('#deck .dk-next')), JSON.stringify({ role: st['tourbook-role'], acts: a.acts }));
    await ctx.close();
  }
  // Storage blocked while the copy runs: nothing is copied, nothing thrown, Tourbook opens.
  {
    const { ctx, page } = await fresh(() => {
      const d = Object.getOwnPropertyDescriptor(Window.prototype, 'localStorage') || Object.getOwnPropertyDescriptor(window, 'localStorage');
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { if (document.currentScript && /from-gdex/.test(document.currentScript.src)) throw new DOMException('The operation is insecure.', 'SecurityError'); return d.get.call(window); } });
    });
    await seed(page, OLD);
    await openApp(page);
    const st = await storage(page);
    ok('storage blocked: the copy does nothing and throws nothing, and Tourbook opens', COPIED.every(k => st['tourbook-' + k.slice(5)] !== OLD[k]) && !!(await page.$('#deck .dk-next')), JSON.stringify(Object.keys(st).filter(k => k.startsWith('tourbook-'))));
    await ctx.close();
  }
  // No old database: none is made. An old database without the store, or IndexedDB refusing it: Tourbook's works as usual.
  {
    const { ctx, page } = await fresh();
    await seed(page, { 'gdex-tour': 'done', 'gdex-role-nudged': '1', 'gdex-ask-seen': 'off', 'gdex-terms': OLD['gdex-terms'], ...(ON ? { 'gdex-licence': OLD['gdex-licence'] } : {}) });
    await openApp(page);
    await page.evaluate(() => import('./js/kv.js').then(k => k.kvSet('probe', 1)));
    const names = await dbNames(page);
    ok('no old database: "tourbook" is made, and no "gdex" is', names.includes('tourbook') && !names.includes('gdex'), names.join(', '));
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh();
    await seedOldDb(page, [['x', 1]], 'other');
    await page.goto(new URL('invoice.html', BASE).href);
    const r = await page.evaluate(() => import('./js/kv.js').then(k => k.kvSet('probe', 2).then(() => k.kvGet('probe'))).then(v => v, e => 'threw ' + e.message));
    ok('an old database without its store: nothing is copied and Tourbook\'s own works', r === 2, String(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh(() => { const o = IDBFactory.prototype.open; IDBFactory.prototype.open = function (name, ...v) { if (name === 'gdex') throw new DOMException('refused', 'UnknownError'); return o.call(this, name, ...v); }; });
    await page.goto(new URL('invoice.html', BASE).href);
    const r = await page.evaluate(() => import('./js/kv.js').then(k => k.kvSet('probe', 3).then(() => k.kvGet('probe'))).then(v => v, e => 'threw ' + e.message));
    ok('IndexedDB refusing the old database: nothing is copied and Tourbook\'s own works', r === 3, String(r));
    await ctx.close();
  }
  // Several first reads at once: each waits for the copy, so none sees "tourbook" before it is filled.
  {
    const { ctx, page } = await fresh();
    await seedOldDb(page, OLD_KV);
    await page.goto(new URL('invoice.html', BASE).href);
    const r = await page.evaluate(() => import('./js/kv.js').then(k => Promise.all([k.kvGet('licence-days'), k.kvGet('note'), k.kvGet('note')])));
    ok('several first reads at once all see what was copied', same(r, [OLD_KV[0][1], OLD_KV[1][1], OLD_KV[1][1]]), JSON.stringify(r));
    await ctx.close();
  }

  /* ------------------------ Gdex's backup files still open ------------------------ */
  // The owner may hold backups saved under Gdex: app 'gdex', or, locked, { gdex: 'encrypted-backup' }. Both are Tourbook's.
  {
    const { browser: b2, page, errors: e2 } = await open({ tab: 'settings' });
    await page.waitForSelector('#se-backups');
    if (!(await page.$eval('#se-backups', d => d.open))) { await page.click('#se-backups-sum'); await sleep(200); }
    const pick = (name, body) => page.setInputFiles('#page .se-bk-input', { name, mimeType: 'application/json', buffer: Buffer.from(body) });
    const BRING = '.sheet[aria-label="Bring back a backup"]', LOCKED = '.sheet[aria-label="Locked backup"]';
    const { songs, ...noSongs } = OLD_DB; // known by its app alone (no songs list to tell it by)
    await pick('gdex-backup-2026-11-01.json', JSON.stringify(noSongs));
    await page.waitForSelector(BRING, { timeout: 15000 });
    ok('a backup file saved under Gdex (app "gdex") opens as Tourbook\'s, ready to merge or replace', /In the file:\s*1 act\b/.test(await page.innerText(BRING)), await page.innerText(BRING));
    await page.click(`${BRING} .btn.ghost`); await sleep(250);
    const locked = await page.evaluate(db => import('./js/crypto.js').then(async C => {
      const salt = C.bytes(16), iter = 1000, box = await C.encrypt(await C.pbkdf2Key('old gdex passphrase', salt, iter), JSON.stringify(db));
      return JSON.stringify({ gdex: 'encrypted-backup', v: 1, exported: new Date().toISOString(), kdf: { salt: C.toB64(salt), iter }, iv: box.iv, ct: box.ct });
    }), OLD_DB);
    await pick('gdex-backup-2026-11-01.locked.json', locked);
    await page.waitForSelector(LOCKED, { timeout: 15000 });
    await page.fill('#se-pass-1', 'old gdex passphrase'); await page.click(`${LOCKED} button[type=submit]`);
    await page.waitForSelector(BRING, { timeout: 15000 });
    ok('…and a locked one ({ gdex: "encrypted-backup" }) asks for its passphrase and opens', /In the file:\s*1 act\b/.test(await page.innerText(BRING)));
    await page.click(`${BRING} .btn.ghost`); await sleep(250);
    ok('…both only offered: nothing was changed until asked', (await page.evaluate(() => import('./js/store.js').then(s => s.db.acts.length))) === 0);
    // A Gdex-era file carrying a free days' start (Gdex never wrote one: licences were off) is brought back without it. Only
    // a file saved as Tourbook's carries one (js/backup.js): no line in the chooser and, after Merge, this device's start is
    // as it was (none in the off leg; the licence leg's seed in the other), and the database never holds it.
    const firstNow = () => page.evaluate(() => (JSON.parse(localStorage.getItem('tourbook-licence') || 'null') || {}).first || 0);
    const startBefore = await firstNow(), earlier = Date.now() - 9 * 864e5, lines = [];
    const lockedDays = await page.evaluate(([db, from]) => import('./js/crypto.js').then(async C => {
      const salt = C.bytes(16), iter = 1000, box = await C.encrypt(await C.pbkdf2Key('old gdex passphrase', salt, iter), JSON.stringify({ ...db, freeDaysFrom: from }));
      return JSON.stringify({ gdex: 'encrypted-backup', v: 1, exported: new Date().toISOString(), kdf: { salt: C.toB64(salt), iter }, iv: box.iv, ct: box.ct });
    }), [OLD_DB, earlier]);
    for (const [name, body] of [['gdex-backup-2026-11-02.json', JSON.stringify({ ...noSongs, freeDaysFrom: earlier })], ['gdex-backup-2026-11-02.locked.json', lockedDays]]) {
      await pick(name, body);
      if (/locked/.test(name)) { await page.waitForSelector(LOCKED, { timeout: 15000 }); await page.fill('#se-pass-1', 'old gdex passphrase'); await page.click(`${LOCKED} button[type=submit]`); }
      await page.waitForSelector(BRING, { timeout: 15000 });
      lines.push(await page.locator(`${BRING} .se-imp-days`).count());
      await page.click(`${BRING} .se-imp-merge`); await page.waitForSelector(BRING, { state: 'detached', timeout: 10000 }); await sleep(500);
    }
    const daysAfter = await firstNow(), inDb = await page.evaluate(() => 'freeDaysFrom' in JSON.parse(localStorage.getItem('tourbook-db-v1') || '{}'));
    ok('…a Gdex-era file (plain or locked) carrying a free days\' start: no line, and after Merge this device\'s start is as it was', lines.every(n => n === 0) && daysAfter === startBefore && !inDb && (await page.evaluate(() => import('./js/store.js').then(s => s.db.acts.length))) === 1, JSON.stringify({ lines, startBefore, daysAfter, inDb }));
    errors.push(...e2);
    await b2.close();
  }

  /* ------------------------- the old name nowhere else ------------------------- */
  // Only the copy, the old backups it still opens, the old caches it drops and the docs that say so name Gdex: every
  // other file (code, pages, specs, workflows, packages, the generator) says Tourbook.
  {
    const REPO = path.join(__dirname, '..', '..');
    const SKIP = /^(node_modules|\.git|tests\/output|dist|cloudflare\/site|cloudflare\/\.wrangler|cloudflare\/node_modules|\.wrangler|\.claude)(\/|$)/;
    let files;
    try { files = require('child_process').execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean); }
    catch { const walk = d => fs.readdirSync(path.join(REPO, d)).flatMap(n => { const r = d ? d + '/' + n : n; if (SKIP.test(r)) return []; return fs.statSync(path.join(REPO, r)).isDirectory() ? walk(r) : [r]; }); files = walk(''); }
    const ALLOWED = ['README.md', 'CLAUDE.md', 'docs/developers.md', 'docs/go-live.md', 'docs/desktop.md', 'docs/licence-server.md', 'index.html', 'sw.js', 'js/from-gdex.js', 'js/kv.js', 'js/backup.js', 'js/drive.js', 'js/store.js', 'tests/specs/09-from-gdex.cjs'];
    const named = files.filter(f => !SKIP.test(f) && !/\.(png|ico|jpe?g|gif|webp)$/i.test(f) && fs.existsSync(path.join(REPO, f)) && /gdex/i.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
    ok('the old name is found only in the copy, the old backups and caches it still reads, and the docs that say so', files.length > 100 && named.every(f => ALLOWED.includes(f)), named.filter(f => !ALLOWED.includes(f)).join(', ') || String(files.length));
    const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    ok('…in index.html only the copy\'s script, the first script on the page', (html.match(/gdex/gi) || []).length === 1 && html.indexOf('<script src="js/from-gdex.js"></script>') === html.indexOf('<script'));
  }

  ok('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL 09-from-gdex crashed — ' + e.message); process.exit(1); });
