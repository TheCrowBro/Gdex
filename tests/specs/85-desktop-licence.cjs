// The desktop app's licence (desktop/licence.cjs), in Node, with a fake clock, a fake licence server that signs real
// receipts with throw-away keys made here, and its two switches passed in (so it never depends on the committed
// desktop/licence-on.json): off until both the switch and the keys are there; then free days that start only when the
// page asks (no "early user" free for good); the days counted, ended, the clock wound back or forward; an earlier start
// adopted from Google Drive; the mirror in desktop-state.json; codes (a Vdex one gets its own message), activation on up
// to 3 computers, moving, the weekly check, 90 days offline, cancelled, expired, forged files, pending, release. Last,
// the IPC wiring (wireLicence) with a stand-in ipcMain: only Gdex's own page is answered, and nothing is asked of the
// licence server while licences are off, not even the price. Reads desktop/ from the repository (the build spec [S-26]).
const fs = require('fs');
const os = require('os');
const path = require('path');
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const REPO = path.join(__dirname, '..', '..');
const codes = require(path.join(REPO, 'desktop', 'licence-codes.cjs'));
const { createLicence, wireLicence, MESSAGES } = require(path.join(REPO, 'desktop', 'licence.cjs'));
const DAY = 86400e3;
const SHAPE = ['kind', 'enabled', 'buyUrl', 'os', 'seats', 'mode', 'canEdit', 'started', 'first', 'trialLeft', 'trialEnds', 'licence'];

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdex-lic-'));
  try {
    const owner = await codes.newKeyPair(), shop = await codes.newKeyPair(), spare = await codes.newKeyPair();
    const ownerKey = await codes.importPrivate(codes.b64u.enc(owner.pkcs8)), shopKey = await codes.importPrivate(codes.b64u.enc(shop.pkcs8));
    const KEYS = { 1: owner.publicKey, 2: shop.publicKey, 9: spare.publicKey };
    const fields = { name: 'Jane Smith', email: 'Jane@Example.com', serial: 4242, issued: '2026-11-02' };
    const paid = await codes.signCode(shopKey, 2, fields);
    const pasted = `Hi Jane,\nYour code: ${paid.toLowerCase().replace(/-(?=.*-)/g, (m, i) => (i < 6 ? m : ' -\n  '))}\nThanks!`;

    let n = 0; const dirOf = () => path.join(tmp, String(++n));
    const T0 = Date.parse('2026-11-02T10:00:00Z');
    // A fake licence server that signs real receipts, keeps a list per code, can be told to fail, and gives its time
    // (the Date header of a JSON answer) as `date`.
    const server = { mode: 'ok', calls: [], lists: new Map(), cancelled: new Set(), date: 0, forge: '',
      async post(url, body) {
        this.calls.push({ url, body });
        if (this.mode === 'down') throw new Error('offline');
        const date = this.date;
        if (this.mode === '503') return { status: 503, body: { error: 'not-ready' }, date };
        const v = await codes.verifyCode(body.code, { keys: KEYS }).catch(() => null); if (!v) return { status: 400, body: { error: 'invalid' }, date };
        const ref = v.licence.ref, list = this.lists.get(ref) || [];
        if (url.endsWith('/licence/release')) { if (!list.includes(body.install)) return { status: 404, body: { error: 'not-listed' }, date }; this.lists.set(ref, list.filter(x => x !== body.install)); return { status: 200, body: { ok: true }, date }; }
        if (this.cancelled.has(ref)) return { status: 403, body: { error: 'cancelled' }, date };
        if (!list.includes(body.install)) {
          if (list.length >= v.licence.seats) {
            const at = list.findIndex(x => 'T' + x === body.release);
            if (at < 0) return { status: 409, body: { error: 'full', computers: list.map(x => ({ tag: 'T' + x, os: 'Mac', added: '2026-11-01', seen: '2026-11-02' })), swapsLeft: 3 }, date };
            list.splice(at, 1);
          }
          list.push(body.install); this.lists.set(ref, list);
        }
        return { status: 200, body: { ok: true, receipt: await codes.signNote('active', shopKey, 2, { ref, install: this.forge || body.install, at: Date.now() }) }, date };
      } };
    const mirrorBox = () => { const box = { v: null }; return { box, mirror: { get: () => box.v, set: v => { box.v = v; } } }; };
    const make = (opts = {}) => {
      const c = { t: opts.t || T0 };
      const lic = createLicence({ dir: opts.dir || dirOf(), keys: 'keys' in opts ? opts.keys : KEYS, on: 'on' in opts ? opts.on : true, now: () => c.t, post: (u, b) => server.post(u, b), mirror: opts.mirror, site: 'http://licence.test' });
      return { lic, c };
    };
    const fileOf = lic => JSON.parse(fs.readFileSync(lic.file, 'utf8'));

    /* --------------------------- the two switches --------------------------- */
    const offNoKeys = make({ keys: {} });
    let s = await offNoKeys.lic.state();
    ok('with no keys built in, the licence is off and nobody is asked anything', s.mode === 'off' && s.canEdit === true && s.enabled === false && s.started === false && s.first === 0 && s.licence === null, JSON.stringify(s));
    ok('…every state has the shape the page reads (kind "desktop", started, first, the days, the licence, 3 seats)', SHAPE.every(k => k in s) && s.kind === 'desktop' && s.seats === 3 && s.buyUrl === 'http://licence.test/buy' && ['Mac', 'Windows', 'Linux', 'Computer'].includes(s.os));
    const offSwitch = make({ on: false });
    s = await offSwitch.lic.state();
    ok('with the keys but desktop/licence-on.json off, it is off too (committing the keys switches nothing on)', s.mode === 'off' && s.canEdit && !s.enabled);
    const onNoOwner = make({ keys: { 2: shop.publicKey } });
    ok('…and on without the owner’s key 1 it stays off', (await onNoOwner.lic.state()).mode === 'off');
    server.calls = [];
    s = await offNoKeys.lic.start(); const s2 = await offSwitch.lic.start();
    ok('start() keeps both off, and starts no free days', s.mode === 'off' && s2.mode === 'off' && !fileOf(offNoKeys.lic).first && !fileOf(offSwitch.lic).first);
    ok('…and while off, entering a code and checking ask the licence server nothing', !!(await offSwitch.lic.enter(paid)).error && (await offSwitch.lic.recheck(true)).mode === 'off' && server.calls.length === 0);
    // A code activated under an earlier version with licences on, then a version with them off: releasing it asks
    // nothing either (the build spec §0.3), and the code stays for when licences come back.
    const earlier = make({ on: true });
    await earlier.lic.enter(paid);
    const keptCode = await earlier.lic.code(), laterOff = createLicence({ dir: path.dirname(earlier.lic.file), keys: KEYS, on: false, now: () => T0, post: (u, b) => server.post(u, b), site: 'http://licence.test' });
    server.calls = [];
    s = await laterOff.release();
    ok('…nor does releasing a code an earlier version activated: nothing is sent, and the code stays', s.mode === 'off' && server.calls.length === 0 && !!keptCode && (await laterOff.code()) === keptCode, JSON.stringify(server.calls.map(c => c.url)));
    server.lists.clear();

    /* ------------------------------ free days ------------------------------ */
    const { box, mirror } = mirrorBox();
    const tr = make({ mirror });
    s = await tr.lic.state();
    ok('with keys and the switch on, a new install has not started its free days: unstarted, 30 left, can change things', s.mode === 'unstarted' && s.started === false && s.first === 0 && s.trialLeft === 30 && s.trialEnds === '' && s.canEdit === true && s.enabled, JSON.stringify(s));
    tr.c.t = T0 + 50 * DAY; s = await tr.lic.state();
    ok('…and only being opened, for weeks, never starts them (no early user, never founder)', s.mode === 'unstarted' && !fileOf(tr.lic).first && !('founder' in fileOf(tr.lic)) && !(box.v && box.v.first));
    tr.c.t = T0;
    s = await tr.lic.start();
    ok('start() starts the 30 free days now, and the mirror (desktop-state.json) records the start', s.mode === 'trial' && s.started && s.first === T0 && s.trialLeft === 30 && s.trialEnds === '2026-12-02' && fileOf(tr.lic).first === T0 && box.v && box.v.first === T0 && !('founder' in box.v), JSON.stringify(box.v));
    tr.c.t = T0 + 3 * DAY; s = await tr.lic.start();
    ok('start() again changes nothing', s.first === T0 && s.trialLeft === 27);
    tr.c.t = T0 + 29.5 * DAY; s = await tr.lic.state();
    ok('on day 30 the free days are still on, with 1 day left', s.mode === 'trial' && s.trialLeft === 1 && s.canEdit);
    tr.c.t = T0 + 30 * DAY + 1000; s = await tr.lic.state();
    ok('after 30 days they are over and the working roles are read-only', s.mode === 'ended' && s.canEdit === false && s.trialLeft === 0);
    tr.c.t = T0 + 2 * DAY; s = await tr.lic.state();
    ok('winding the clock back does not bring them back (it reads as a wrong clock, still read-only)', s.canEdit === false && ['ended', 'clock'].includes(s.mode) && s.trialLeft === 0, s.mode);
    ok('no state was ever "founder"', !JSON.stringify(fs.readFileSync(tr.lic.file, 'utf8')).includes('founder'));

    // Deleting licence.json: the free days come back from the mirror, with the latest time seen.
    fs.rmSync(tr.lic.file);
    const again = createLicence({ dir: path.dirname(tr.lic.file), keys: KEYS, on: true, now: () => T0 + 41 * DAY, post: (u, b) => server.post(u, b), mirror, site: 'http://licence.test' });
    s = await again.state();
    ok('deleting licence.json does not start new free days: the start comes back from the mirror', s.mode === 'ended' && s.first === T0 && s.canEdit === false && fileOf(again).first === T0, s.mode);

    /* ------------------------------ a wrong clock ------------------------------ */
    // Wound forward 100 days, the free days started there, then the clock put back to the real time.
    const R = T0, AHEAD = R + 100 * DAY;
    const ck = mirrorBox(), wf = make({ t: AHEAD, mirror: ck.mirror });
    await wf.lic.state(); await wf.lic.start();
    wf.c.t = AHEAD + 3 * DAY; await wf.lic.state(); // three days really used
    wf.c.t = R + 3 * DAY; s = await wf.lic.state();
    ok('a clock wound forward, the free days started, then wound back: "clock", read-only', s.mode === 'clock' && s.canEdit === false, JSON.stringify({ mode: s.mode, first: s.first }));
    server.date = R + 3 * DAY + 3600e3; // the licence server's time: the real one
    const pc0 = await wf.lic.enter('GDEX-NOT-A-CODE'); // a bad code never reaches the server
    ok('…(a mistyped code changes nothing)', !!pc0.error);
    await wf.lic.enter(await codes.signCode(ownerKey, 1, { name: 'Clock Test', serial: 999, comp: true, issued: '2026-11-02' }));
    await wf.lic.release(); // back to no code: the free days alone
    s = await wf.lic.state();
    ok('…an answer from the licence server carrying the real time puts it right, keeping the 3 days used (27 left)', s.mode === 'trial' && s.canEdit && s.trialLeft === 27 && Math.abs(s.first - (R + 3600e3)) < 1000 && ck.box.v.first === s.first, JSON.stringify({ mode: s.mode, left: s.trialLeft, first: new Date(s.first).toISOString() }));
    server.date = 0; server.lists.clear();
    const ahead = make({ t: T0 }); await ahead.lic.state();
    const raw = fileOf(ahead.lic); raw.first = T0 + 1.5 * DAY; raw.seen = T0 + 1.5 * DAY; fs.writeFileSync(ahead.lic.file, JSON.stringify(raw));
    s = await ahead.lic.state();
    ok('a start a day and a half ahead of the clock is "clock", read-only', s.mode === 'clock' && s.canEdit === false);
    raw.first = T0 + 0.5 * DAY; raw.seen = T0 + 0.5 * DAY; fs.writeFileSync(ahead.lic.file, JSON.stringify(raw));
    s = await ahead.lic.state();
    ok('…but a clock merely hours out is not', s.mode === 'trial' && s.canEdit);

    /* --------------------- an earlier start from Google Drive --------------------- */
    const ad = mirrorBox(), dv = make({ t: T0 + 10 * DAY, mirror: ad.mirror });
    await dv.lic.start();
    s = await dv.lic.adopt(T0 + 2 * DAY);
    ok('adopt(t) takes an earlier start (another device on the same Drive), in licence.json and the mirror', s.first === T0 + 2 * DAY && s.trialLeft === 22 && fileOf(dv.lic).first === T0 + 2 * DAY && ad.box.v.first === T0 + 2 * DAY);
    s = await dv.lic.adopt(T0 + 5 * DAY);
    const s3 = await dv.lic.adopt(Date.UTC(2025, 11, 31)), s4 = await dv.lic.adopt(T0 + 12 * DAY), s5 = await dv.lic.adopt('soon'), s6 = await dv.lic.adopt(NaN);
    ok('…and ignores a later one, one before 2026, one more than a day ahead, and anything not a time', [s, s3, s4, s5, s6].every(x => x.first === T0 + 2 * DAY));
    const fresh = make({ t: T0 + 10 * DAY });
    s = await fresh.lic.adopt(T0 + 4 * DAY);
    ok('…an install that had not started takes the Drive’s start as its own', s.started && s.first === T0 + 4 * DAY && s.trialLeft === 24);
    s = await offSwitch.lic.adopt(T0);
    ok('…and while off nothing is adopted', s.mode === 'off' && !fileOf(offSwitch.lic).first);

    /* --------------------------------- codes --------------------------------- */
    const lc = make({ t: T0 }); await lc.lic.start(); lc.c.t = T0 + 31 * DAY;
    const bad = await lc.lic.enter('GDEX-NOT-A-CODE');
    ok('a mistyped code is refused with a message, and nothing is saved', !!bad.error && !(await lc.lic.code()));
    const vdexCode = 'Your Vdex licence: VDEX-0A1B2-C3D4E-F5G6H-J7K8M';
    server.calls = [];
    ok('a Vdex code gets its own message, and nothing is asked of the server', (await lc.lic.enter(vdexCode)).error === MESSAGES.vdex && /This is a Vdex licence code\. Gdex has its own licence: buy one at gdex\.crowmade\.app\./.test(MESSAGES.vdex) && server.calls.length === 0);
    s = await lc.lic.enter(pasted);
    const sent = server.calls[0];
    ok('a good code pasted from an email is activated online with only the code, this install’s random ID and "Mac/Windows/Linux"', s.mode === 'licensed' && s.canEdit && sent && sent.url === 'http://licence.test/licence/activate' && /^[A-Za-z0-9_-]{22}$/.test(sent.body.install) && Object.keys(sent.body).sort().join() === 'code,install,os' && sent.body.code === paid && ['Mac', 'Windows', 'Linux', 'Computer'].includes(sent.body.os), JSON.stringify(sent && sent.body));
    ok('the licence shows whom it is for and how many computers', s.licence.name === 'Jane Smith' && s.licence.email === 'jane@example.com' && s.licence.seats === 3 && s.licence.ref === '2:4242' && s.kind === 'desktop');
    ok('the code is kept tidy for "Copy the code"', (await lc.lic.code()) === paid);

    const pc2 = make(), pc3 = make(), pc4 = make();
    ok('the same code activates on a second and third computer', (await pc2.lic.enter(paid)).mode === 'licensed' && (await pc3.lic.enter(paid)).mode === 'licensed');
    const full = await pc4.lic.enter(paid);
    ok('on a fourth computer it says the code is full and lists the others, saving nothing', full.error === 'full' && full.computers.length === 3 && full.seats === 3 && !(await pc4.lic.code()) && (await pc4.lic.state()).mode === 'unstarted');
    s = await pc4.lic.enter(paid, { release: full.computers[0].tag });
    ok('choosing one to move it from activates it here', s.mode === 'licensed' && server.calls.at(-1).body.release === full.computers[0].tag);
    lc.c.t += 8 * DAY; s = await lc.lic.recheck();
    ok('the computer it was moved from finds out at its weekly check and is read-only (its free days are over)', s.mode === 'released' && s.canEdit === false, s.mode);
    server.lists.set('2:4242', server.lists.get('2:4242').slice(0, 2));
    lc.c.t += 2 * DAY; s = await lc.lic.recheck();
    ok('when a place frees up, it gets back on by itself', s.mode === 'licensed' && s.canEdit);

    server.mode = 'down'; lc.c.t += 8 * DAY; s = await lc.lic.recheck();
    ok('a weekly check with no internet changes nothing', s.mode === 'licensed' && s.canEdit);
    lc.c.t += 85 * DAY; s = await lc.lic.state();
    ok('opened after a long break, it is not read-only while it is still checking', s.mode === 'licensed' && s.canEdit);
    s = await lc.lic.recheck();
    ok('after 90 days without reaching the server (and a check that fails) it is read-only until it can check', s.mode === 'offline' && s.canEdit === false);
    server.mode = 'ok'; s = await lc.lic.recheck(true);
    ok('"Try again" with the internet back puts it right', s.mode === 'licensed' && s.canEdit);
    server.cancelled.add('2:4242'); lc.c.t += 8 * DAY; s = await lc.lic.recheck();
    ok('a cancelled code (refund) makes it read-only at the next check', s.mode === 'cancelled' && s.canEdit === false);
    server.cancelled.delete('2:4242'); s = await lc.lic.recheck(true);
    ok('a restored code works again', s.mode === 'licensed');

    const raw2 = fileOf(lc.lic); raw2.act.receipt.data = raw2.act.receipt.data.replace(/"install":"[^"]+"/, '"install":"someone-else-entirely"'); fs.writeFileSync(lc.lic.file, JSON.stringify(raw2));
    ok('a forged activation in licence.json is not believed', (await lc.lic.state()).mode !== 'licensed');
    const pc5 = make({ t: T0 + 40 * DAY }); await pc5.lic.state(); server.forge = 'another-install-id-000'; server.lists.delete('2:4242');
    s = await pc5.lic.enter(paid); server.forge = '';
    ok('a server answer (a receipt) for a different computer is not taken as activation', s.mode === 'pending' && s.offline === true);

    const pc6 = make(); await pc6.lic.start(); pc6.c.t = T0 + 40 * DAY; server.mode = 'down';
    s = await pc6.lic.enter(await codes.signCode(ownerKey, 1, { name: 'Offline Olly', comp: true, issued: '2026-11-02' }));
    ok('entering a code with no internet keeps it and works for 14 days', s.mode === 'pending' && s.canEdit && s.daysLeft === 14 && s.offline);
    pc6.c.t += 15 * DAY; s = await pc6.lic.state();
    ok('after 14 days it stays usable until a check made after then fails', s.mode === 'pending' && s.canEdit);
    s = await pc6.lic.recheck();
    ok('after 14 days unactivated and a failed check (and the free days over) it is read-only', s.mode === 'pending' && s.canEdit === false);
    server.mode = '503'; s = await pc6.lic.recheck(true);
    ok('a licence server that is not set up yet counts as no answer', s.mode === 'pending');
    server.mode = 'ok'; pc6.c.t += 2 * 3600e3; let calls = server.calls.length; s = await pc6.lic.recheck();
    ok('after an error answer, it waits a day before asking again (not every hour)', s.mode === 'pending' && server.calls.length === calls);
    pc6.c.t += 23 * 3600e3; s = await pc6.lic.recheck();
    ok('it activates by itself once the server answers', s.mode === 'licensed' && s.licence.comp);

    const pc7 = make(); await pc7.lic.state();
    const short = await codes.signCode(ownerKey, 1, { name: 'Short Term', comp: true, issued: '2026-11-02', expires: '2026-11-10' });
    ok('a free code with an end date activates', (await pc7.lic.enter(short)).mode === 'licensed');
    pc7.c.t = Date.parse('2026-11-20T10:00:00Z'); calls = server.calls.length;
    for (let h = 0; h < 48; h++) { pc7.c.t += 3600e3; await pc7.lic.recheck(); }
    s = await pc7.lic.state();
    ok('once it has ended it is "expired", and Gdex stops contacting the server for it', s.mode === 'expired' && server.calls.length === calls, `${server.calls.length - calls} calls`);
    ok('…an expired code entered again is refused with its end date', /ended on 2026-11-10/.test((await make({ t: Date.parse('2026-11-20T10:00:00Z') }).lic.enter(short)).error || ''));

    server.mode = 'down'; s = await pc2.lic.release();
    ok('releasing needs the internet, so the place is really freed', /could not reach the licence server/.test(s.error || '') && !!(await pc2.lic.code()));
    server.mode = 'ok'; s = await pc2.lic.release();
    ok('releasing takes this computer off the code and goes back to the free days (here: not started)', s.mode === 'unstarted' && !(await pc2.lic.code()) && server.calls.at(-1).url.endsWith('/licence/release'));
    const cancelled = make(); await cancelled.lic.state(); server.cancelled.add('1:77');
    const cc = await codes.signCode(ownerKey, 1, { name: 'C', serial: 77, issued: '2026-11-02' });
    ok('a cancelled code is refused when entered', /cancelled/.test((await cancelled.lic.enter(cc)).error || '') && !(await cancelled.lic.code()));

    /* -------------------------- the IPC wiring -------------------------- */
    const wire = async ({ on, keys }) => {
      const handlers = new Map(), opened = [], prices = [], sentToPage = [];
      const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn) };
      const own = { senderFrame: { url: 'http://localhost:47861/' } }, other = { senderFrame: { url: 'https://evil.example/' } };
      const fromApp = e => e.senderFrame.url.startsWith('http://localhost:47861/');
      const win = { isDestroyed: () => false, webContents: { send: (ch, s) => sentToPage.push([ch, s]) } };
      const dir = dirOf();
      const lic = wireLicence({ ipcMain, fromApp, getWindow: () => win, open: u => opened.push(u), dir, site: 'http://licence.test', on, keys,
        post: (u, b) => server.post(u, b), price: async u => { prices.push(u); return { price: '20.00', currency: 'USD', country: 'DE', taxed: { place: 'Germany', tax: 'VAT', rate: 19, total: '23.80' }, extra: 'dropped', date: Date.now() + 5 * DAY }; } });
      const call = (ch, e = own, ...a) => handlers.get(ch)(e, ...a);
      return { lic, handlers, opened, prices, sentToPage, call, own, other, dir };
    };
    const offW = await wire({ on: false, keys: KEYS });
    const channels = [...offW.handlers.keys()].sort().join();
    ok('wireLicence answers exactly the licence channels the bridge uses (start and adopt included)', channels === ['licence:adopt', 'licence:buy', 'licence:code', 'licence:enter', 'licence:price', 'licence:recheck', 'licence:release', 'licence:start', 'licence:state'].join(), channels);
    const refused = await Promise.all([...offW.handlers.keys()].map(ch => offW.call(ch, offW.other)));
    ok('…and refuses every one of them to a page that is not Gdex’s own', refused.every(r => r && r.error === 'refused'));
    server.calls = [];
    ok('while off, the price is null and nothing is asked of the licence server', (await offW.call('licence:price')) === null && offW.prices.length === 0 && server.calls.length === 0);
    ok('…start keeps it off', (await offW.call('licence:start')).mode === 'off');
    ok('Buy opens the website’s shop in the web browser', (await offW.call('licence:buy')) === true && offW.opened[0] === 'http://licence.test/buy');
    const onW = await wire({ on: true, keys: KEYS });
    s = await onW.call('licence:state');
    ok('on: the state comes over the bridge as "unstarted"', s.mode === 'unstarted' && s.kind === 'desktop');
    s = await onW.call('licence:start');
    ok('…licence:start starts the free days, and the page is told (licence:changed)', s.mode === 'trial' && s.started && onW.sentToPage.some(([ch, x]) => ch === 'licence:changed' && x.mode === 'trial'));
    const startedAt = s.first;
    s = await onW.call('licence:adopt', onW.own, String(startedAt - DAY));
    ok('…licence:adopt takes an earlier start given as text', s.first === startedAt - DAY && s.trialLeft === 29, String(s.trialLeft));
    const price = await onW.call('licence:price');
    ok('…the price is asked of the licence server, and only its taxed part is passed to the page', onW.prices[0] === 'http://licence.test/licence/price' && JSON.stringify(price) === JSON.stringify({ taxed: { place: 'Germany', tax: 'VAT', rate: 19, total: '23.80' } }), JSON.stringify(price));
    s = await onW.call('licence:state');
    ok('…and the server’s time on the price answer counts (its Date, 5 days on: 24 days left)', s.trialLeft === 24 && s.first === startedAt - DAY, String(s.trialLeft));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  ok('no errors in the console', true); // Node only: a crash fails the spec through its exit code
})().catch(e => { console.error('TEST CRASHED', e); process.exit(1); });
