// Tourbook's licence codes and the owner's generator (the build spec §6.3): the code format in desktop/licence-codes.cjs
// (TOURBOOK- codes, Ed25519 signatures, the four signing prefixes that keep notes apart, key files and paper backups), that
// nothing of Vdex's is accepted (a VDEX- code, a code signed with Vdex's prefix or with other keys), the owner's
// generator page (tools/licence-generator.html) driven in Chromium from a file as the owner uses it (current with its
// template, makes keys and a code, saves tourbook-ledger.csv, refuses a Vdex ledger, contacts nothing but
// tourbook.crowmade.app, and never for real: its answers are made up here), and that the website's own check of a sign-in
// note (js/licence-note.js, Part A's readWebNote) agrees with the code format's. Every key is made inside the test.
const fs = require('fs');
const os = require('os');
const path = require('path');
const nodeCrypto = require('crypto');
const { chromium } = require('playwright');
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
// desktop/ and tools/ are read from the repository itself (the test's scratch copy leaves desktop/ out, [S-26]); the
// web files from the scratch copy the test server serves.
const REPO = path.resolve(__dirname, '../..');
const WEB = process.env.TOURBOOK_ROOT || REPO;
const BASE = process.env.TOURBOOK_URL || '';
const codes = require(path.join(REPO, 'desktop/licence-codes.cjs'));
const throws = async fn => { try { await fn(); return null; } catch (e) { return e; } };

(async () => {
  let browser;
  try {
    /* ------------------------------- the codes ------------------------------- */
    const owner = await codes.newKeyPair(), shop = await codes.newKeyPair(), spare = await codes.newKeyPair(), stranger = await codes.newKeyPair();
    const ownerKey = await codes.importPrivate(codes.b64u.enc(owner.pkcs8)), shopKey = await codes.importPrivate(codes.b64u.enc(shop.pkcs8)), strangerKey = await codes.importPrivate(codes.b64u.enc(stranger.pkcs8));
    const KEYS = { 1: owner.publicKey, 2: shop.publicKey, 9: spare.publicKey };
    const fields = { name: 'Jane Smith', email: 'Jane@Example.com', serial: 4242, issued: '2026-11-02' };
    const paid = await codes.signCode(shopKey, 2, fields);
    ok('a code is TOURBOOK- and groups of five, and signing the same order again gives the same code', /^TOURBOOK-([0-9A-HJKMNP-TV-Z]{5}-)+[0-9A-HJKMNP-TV-Z]{1,5}$/.test(paid) && paid === (await codes.signCode(shopKey, 2, fields)), paid.length + ' characters');
    const r = await codes.verifyCode(paid, { keys: KEYS });
    ok('it checks out with the name, the email (lower case), 3 devices and its ref', r.status === 'valid' && r.licence.name === 'Jane Smith' && r.licence.email === 'jane@example.com' && r.licence.seats === 3 && r.licence.ref === '2:4242' && !r.licence.comp && r.licence.issued === '2026-11-02');
    const pasted = `Hi Jane,\nYour code: ${paid.toLowerCase().replace(/-(?=.*-)/g, (m, i) => (i < 9 ? m : ' -\n  '))}\nThanks!`;
    ok('a code pasted from an email (lower case, groups split over lines, words around it) still works', (await codes.verifyCode(pasted, { keys: KEYS })).licence.ref === '2:4242');
    const i = 40, flipped = paid.slice(0, i) + (paid[i] === '0' ? '1' : '0') + paid.slice(i + 1);
    ok('changing one character makes it invalid', (await throws(() => codes.verifyCode(flipped, { keys: KEYS })))?.status === 'invalid');
    ok('a code signed by a key Tourbook does not know is refused as unknown', (await throws(() => codes.verifyCode(paid, { keys: { 1: owner.publicKey } })))?.status === 'unknown-key');
    ok('a code signed with other keys under the same number is invalid', (await throws(async () => codes.verifyCode(await codes.signCode(strangerKey, 2, fields), { keys: KEYS })))?.status === 'invalid');

    /* ------------------------- nothing of Vdex's ------------------------- */
    const asVdex = paid.replace(/^TOURBOOK-/, 'VDEX-');
    const vx = await throws(() => codes.verifyCode(asVdex, { keys: KEYS }));
    ok('a VDEX- code is refused: it is not a Tourbook code', vx?.status === 'invalid' && /TOURBOOK-/.test(vx.message), vx && vx.message);
    // The same payload signed with Vdex's signing prefix ("VDEX-LICENCE\0") by Tourbook's own shop key, written as a TOURBOOK-
    // code: the prefix alone makes it invalid, so nothing signed for Vdex can ever pass as Tourbook's.
    const payload = codes.packPayload({ ...fields, kid: 2, serial: 4243 });
    const vdexSigned = codes.formatCode(Buffer.concat([payload, nodeCrypto.sign(null, Buffer.concat([Buffer.from('VDEX-LICENCE\0'), payload]), nodeCrypto.createPrivateKey({ key: Buffer.from(shop.pkcs8), format: 'der', type: 'pkcs8' }))]));
    const tourbookSigned = codes.formatCode(Buffer.concat([payload, nodeCrypto.sign(null, Buffer.concat([Buffer.from('TOURBOOK-LICENCE\0'), payload]), nodeCrypto.createPrivateKey({ key: Buffer.from(shop.pkcs8), format: 'der', type: 'pkcs8' }))]));
    ok('a code signed with Vdex\'s prefix is invalid, while the same payload signed with Tourbook\'s is valid', (await throws(() => codes.verifyCode(vdexSigned, { keys: KEYS })))?.status === 'invalid' && (await codes.verifyCode(tourbookSigned, { keys: KEYS })).licence.ref === '2:4243');
    const src = fs.readFileSync(path.join(REPO, 'desktop/licence-codes.cjs'), 'utf8');
    ok('the code format names nothing of Vdex\'s: TOURBOOK- codes and the four TOURBOOK- signing prefixes', !/vdex/i.test(src) && /'TOURBOOK-LICENCE\\0'/.test(src) && /'TOURBOOK-ACTIVE\\0'/.test(src) && /'TOURBOOK-ADMIN\\0'/.test(src) && /'TOURBOOK-WEB\\0'/.test(src) && /tourbook-licence-signing-key/.test(src));

    /* --------------------------- signed notes --------------------------- */
    const KINDS = ['licence', 'active', 'admin', 'web'];
    const notes = {}; for (const k of KINDS) notes[k] = await codes.signNote(k, shopKey, 2, { ref: '2:4242', install: 'x', at: 1, kind: k });
    const grid = [];
    for (const a of KINDS) for (const b of KINDS) grid.push([a, b, !!(await codes.readNote(b, notes[a], { keys: KEYS }))]);
    ok('the four prefixes keep notes apart: a note reads back only as its own kind', grid.every(([a, b, read]) => read === (a === b)), grid.filter(([a, b, read]) => read !== (a === b)).map(x => x.join('→')).join(', '));
    ok('…and only from the keys allowed to sign it', !(await codes.readNote('active', notes.active, { keys: KEYS, signers: codes.OWNER_KIDS })) && !!(await codes.readNote('admin', await codes.signNote('admin', ownerKey, 1, { op: 'look' }), { keys: KEYS, signers: codes.OWNER_KIDS })));
    ok('a code cannot be passed off as a note, or a note edited', !(await codes.readNote('active', { kid: 2, data: JSON.stringify({ ref: '2:4242' }), sig: codes.b64u.enc(codes.extract(paid).slice(-64)) }, { keys: KEYS })) && !(await codes.readNote('active', { ...notes.active, data: notes.active.data.replace('4242', '4243') }, { keys: KEYS })));
    const free = await codes.signCode(ownerKey, 1, { name: 'Sam', comp: true, expires: '2026-12-31', issued: '2026-11-02', seats: 5 });
    const fr = await codes.verifyCode(free, { keys: KEYS, now: Date.parse('2026-12-31T23:00:00Z') });
    ok('a free code carries its flag, its devices and its end date, and works on its last day', fr.status === 'valid' && fr.licence.comp && fr.licence.seats === 5 && fr.licence.expires === '2026-12-31');
    ok('the day after its end date it has expired', (await codes.verifyCode(free, { keys: KEYS, now: Date.parse('2027-01-01T01:00:00Z') })).status === 'expired');
    const raw = codes.extract(paid); raw[0] = 2;
    ok('a code from a newer format asks for an update instead of calling it invalid', (await throws(() => codes.verifyCode(codes.formatCode(raw), { keys: KEYS })))?.status === 'newer');
    ok('a licence needs a name or an email, and long names are refused rather than cut', !!(await throws(() => codes.signCode(ownerKey, 1, { issued: '2026-11-02' }))) && !!(await throws(() => codes.signCode(ownerKey, 1, { name: 'x'.repeat(65) }))));
    ok('the shop shortens long names safely (whole characters, 64 bytes)', new TextEncoder().encode(codes.fitText('é'.repeat(50))).length <= 64 && !codes.fitText('é'.repeat(50)).includes('�'));

    /* --------------------------- key files --------------------------- */
    const kf = await codes.createKeyFile({ kid: 1, passphrase: 'a long passphrase here', iterations: 2000 });
    ok('a key file is Tourbook\'s and holds the private key only encrypted', !JSON.stringify(kf).includes(codes.b64u.enc(owner.pkcs8)) && kf.type === 'tourbook-licence-signing-key' && !!kf.encryptedPrivateKey);
    ok('the wrong passphrase does not open it', /Wrong passphrase/.test((await throws(() => codes.openKeyFile(kf, 'not the passphrase!')))?.message || ''));
    ok('a key file of another kind (Vdex\'s) is refused', /not a Tourbook licence key file/.test((await throws(() => codes.openKeyFile({ ...kf, type: 'vdex-licence-signing-key' }, 'a long passphrase here')))?.message || ''));
    const opened = await codes.openKeyFile(kf, 'a long passphrase here');
    const paper = await codes.paperBackup(kf, 'a long passphrase here'), back = await codes.keyFileFromPaper(paper, 'another long passphrase');
    ok('the paper backup (52 characters) rebuilds the same key', /^key 1: [0-9A-Z ]+$/.test(paper) && back.publicKey === kf.publicKey && back.kid === 1);
    const secret = await codes.shopSecret(kf, 'a long passphrase here');
    ok('the shop secret made from a key file signs codes its public key accepts', (await codes.verifyCode(await codes.signCode(await codes.importPrivate(secret), 1, fields), { keys: { 1: kf.publicKey } })).status === 'valid' && opened.publicKey === kf.publicKey);

    /* ----------------------------- the generator ----------------------------- */
    const { buildGenerator } = await import(path.join(REPO, 'tools/build-generator.mjs'));
    const built = fs.readFileSync(path.join(REPO, 'tools/licence-generator.html'), 'utf8');
    ok('tools/licence-generator.html is built from the current template and code (node tools/build-generator.mjs)', built === buildGenerator());
    const csp = built.match(/Content-Security-Policy" content="([^"]+)"/)[1];
    ok('the generator can reach nothing but tourbook.crowmade.app', /default-src 'none'/.test(csp) && /connect-src https:\/\/tourbook\.crowmade\.app;/.test(csp) && !/https?:\/\/(?!tourbook\.crowmade\.app)/.test(csp));
    ok('its own address is Tourbook\'s', /const SITE = 'https:\/\/tourbook\.crowmade\.app';/.test(built) && !/crowmade\.app\/vdex|vdex\.crowmade/i.test(built));

    browser = await chromium.launch();
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const requests = []; page.on('request', q => { if (!/^(file|blob|data):/.test(q.url())) requests.push(q.url()); });
    const linked = []; // the shop is never really contacted from a test: its answers are made up here
    await ctx.route(u => !/^(file|blob|data):/.test(String(u)), async rt => {
      const u = rt.request().url();
      if (!u.startsWith('https://tourbook.crowmade.app/')) return rt.abort();
      if (rt.request().method() === 'POST') linked.push(JSON.parse(rt.request().postData()));
      await rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, ref: '1:1', computers: [], swaps: 0, cancelled: null }) });
    });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tourbook-generator-'));
    const genFile = path.join(tmp, 'licence-generator.html'); fs.writeFileSync(genFile, built);
    await page.goto('file://' + genFile);
    ok('the page opens from a file with no errors and says the browser can sign', (await page.locator('#support').isHidden()) && !errors.length, errors.join(' | '));
    const downloads = [];
    page.on('download', d => downloads.push(d));
    await page.fill('#np1', 'correct horse battery staple'); await page.fill('#np2', 'correct horse battery staple');
    await page.click('#makekey');
    await page.waitForFunction(() => !document.getElementById('newkeyout').hidden, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    const names = downloads.map(d => d.suggestedFilename()).sort();
    ok('making keys saves Tourbook\'s three key files', JSON.stringify(names) === JSON.stringify(['tourbook-licence-key-1.json', 'tourbook-licence-key-2-shop.json', 'tourbook-licence-key-9-spare.json']), names.join(', '));
    const pub = JSON.parse(await page.inputValue('#publine'));
    ok('it shows the public keys to build into Tourbook', Object.keys(pub).join() === '1,2,9' && Object.values(pub).every(v => /^[A-Za-z0-9_-]{43}$/.test(v)));
    const shopText = await page.inputValue('#newshop');
    const genKeys = { 1: pub[1], 2: pub[2], 9: pub[9] };
    ok('the shop key it shows is key 2, ready for Cloudflare', (await codes.verifyCode(await codes.signCode(await codes.importPrivate(shopText), 2, fields), { keys: genKeys })).status === 'valid');
    ok('it shows paper backups of the owner key and the spare', /^key 1: .+\nkey 9: .+$/.test(await page.inputValue('#paper')));
    const k1 = await downloads.find(d => d.suggestedFilename() === 'tourbook-licence-key-1.json').path();
    ok('a key file it saves is a Tourbook key file', JSON.parse(fs.readFileSync(k1, 'utf8')).type === 'tourbook-licence-signing-key');
    await page.setInputFiles('#keyfile', k1); await page.fill('#pass', 'correct horse battery staple'); await page.click('#open');
    await page.waitForFunction(() => !document.getElementById('make').hidden, null, { timeout: 30000 });
    await page.fill('#name', 'Riley Free'); await page.fill('#email', 'riley@example.com'); await page.fill('#note', '=HYPERLINK("x")');
    await page.click('#issue'); await page.waitForFunction(() => !document.getElementById('result').hidden);
    const made = await page.inputValue('#code');
    const mr = await codes.verifyCode(made, { keys: genKeys });
    ok('a free code made in the page is accepted by the code format\'s own check', /^TOURBOOK-/.test(made) && mr.status === 'valid' && mr.licence.comp && mr.licence.name === 'Riley Free' && mr.licence.seats === 3 && mr.licence.ref.startsWith('1:'));
    const mail = decodeURIComponent(await page.getAttribute('#mail', 'href'));
    ok('the email it writes is Tourbook\'s: the code, the website\'s sign-in and the desktop app\'s steps', mail.includes(made) && /subject=Your Tourbook licence/.test(mail) && /Settings → About & licence → Sign in, with riley@example\.com/.test(mail) && /Settings → About & licence → Enter licence code/.test(mail) && /tourbook\.crowmade\.app\/download\.html/.test(mail) && !/Vdex|Android|iPhone/i.test(mail));
    await page.waitForFunction(() => /linked to its email/.test(document.getElementById('msg').textContent), null, { timeout: 10000 }).catch(() => {});
    ok('the page says the code is linked for website sign-in', /linked to its email for website sign-in/.test(await page.textContent('#msg')));
    const dl = page.waitForEvent('download'); await page.click('#saveledger'); const saved = await dl;
    const ledger = fs.readFileSync(await saved.path(), 'utf8');
    ok('the ledger is saved as tourbook-ledger.csv, lists the code, and keeps a note that looks like a formula as text', saved.suggestedFilename() === 'tourbook-ledger.csv' && ledger.startsWith('issued,ref,type,name,email,expires,seats,note,code') && ledger.includes(made) && ledger.includes(`'=HYPERLINK`));
    // A ledger that holds a Vdex code is refused, and the codes in view stay as they were.
    const vdexLedger = 'issued,ref,type,name,email,expires,seats,note,code\r\n2026-11-02,1:77,free,Old Friend,old@example.com,,3,,VDEX-ABCDE-FGHJK-MNPQR\r\n';
    await page.setInputFiles('#ledgerfile', { name: 'ledger.csv', mimeType: 'text/csv', buffer: Buffer.from(vdexLedger) });
    await page.waitForFunction(() => /Vdex ledger|Ledger opened/.test(document.getElementById('msg').textContent));
    ok('a ledger holding a VDEX- code is refused: "That is a Vdex ledger, not Tourbook’s"', /^That is a Vdex ledger, not Tourbook’s/.test(await page.textContent('#msg')) && (await page.getAttribute('#msg', 'class')) === 'bad' && (await page.locator('#rows tr').count()) === 1);
    await page.setInputFiles('#ledgerfile', { name: 'tourbook-ledger.csv', mimeType: 'text/csv', buffer: Buffer.from(ledger) });
    await page.waitForFunction(() => /Ledger opened/.test(document.getElementById('msg').textContent));
    ok('its own ledger opens again', /Ledger opened: 1 code\./.test(await page.textContent('#msg')) && (await page.locator('#rows tr').count()) === 1);
    const cells = await page.$$eval('#rows tr:first-child td', tds => tds.map(td => td.textContent));
    ok('the ledger\'s table shows each column under its own heading (Ends is the end date, Note the note)', cells.length === 7 && cells[1] === mr.licence.ref && cells[3] === 'Riley Free' && cells[5] === '' && cells[6] === '=HYPERLINK("x")', JSON.stringify(cells));
    // Only the code column tells a Vdex ledger: Tourbook's own, with a name or a note that mentions a Vdex licence, opens.
    const mentions = ledger.trimEnd() + '\r\n2026-11-03,1:78,free,Vdex-2 user,vdex-fan@example.com,,3,"Moved from VDEX-ABCDE, a Vdex licence",' + made + '\r\n';
    await page.evaluate(() => { document.getElementById('msg').textContent = ''; });
    await page.setInputFiles('#ledgerfile', { name: 'tourbook-ledger.csv', mimeType: 'text/csv', buffer: Buffer.from(mentions) });
    await page.waitForFunction(() => /Vdex ledger|Ledger opened/.test(document.getElementById('msg').textContent));
    ok('…even when a name, an email or a note in it mentions Vdex (only VDEX- codes make a Vdex ledger)', /^Ledger opened: 2 codes/.test(await page.textContent('#msg')), await page.textContent('#msg'));
    await page.waitForTimeout(300);
    const linkNote = linked[0] && (await codes.readNote('admin', linked[0], { keys: genKeys, signers: codes.OWNER_KIDS }));
    ok('making keys and codes contacts nothing except, for a code with an email, one signed request to tourbook.crowmade.app to link it', requests.length > 0 && requests.every(u => u === 'https://tourbook.crowmade.app/licence/admin') && linked.length === 1 && linkNote && linkNote.op === 'link' && linkNote.code === made && linkNote.ref === mr.licence.ref, requests.join(', '));
    // A typed ref is read as a number pair: "2:079" asks about 2:79, and a ref no Tourbook code can carry is not sent at all.
    const asked = linked.length;
    await page.fill('#which', ' 2:079 '); await page.click('#look'); await page.waitForTimeout(400);
    const padded = linked[asked] && (await codes.readNote('admin', linked[asked], { keys: genKeys, signers: codes.OWNER_KIDS }));
    await page.fill('#which', '3:79'); await page.click('#look'); await page.waitForTimeout(400);
    const noKey = await page.textContent('#msg');
    await page.fill('#which', '2:0'); await page.click('#look'); await page.waitForTimeout(400);
    ok('a ref typed with leading zeros is sent as the code\'s own (2:079 → 2:79), and one with a key Tourbook has not got or serial 0 is refused in the page', padded && padded.op === 'look' && padded.ref === '2:79' && linked.length === asked + 1 && /^That is not the ref of a Tourbook code/.test(noKey) && /^That is not the ref of a Tourbook code/.test(await page.textContent('#msg')), JSON.stringify({ ref: padded && padded.ref, sent: linked.length - asked, noKey }));
    ok('no errors in the generator\'s console', errors.length === 0, errors.slice(0, 5).join(' | '));
    await ctx.close();
    fs.rmSync(tmp, { recursive: true, force: true });

    /* ------------- the website's check of a sign-in note (js/licence-note.js) ------------- */
    // Part A's readWebNote(token) is the ES-module twin of readNote('web', token, { keys, signers: [2] }): a note signed
    // by this file's signNote must read back there, and one signed with another prefix or key must not.
    const noteSrc = fs.readFileSync(path.join(WEB, 'js/licence-note.js'), 'utf8');
    if (!BASE) console.log('SKIP the website\'s note check needs the test server (run it through node tests/run.mjs)');
    else if (/Promise\.resolve\(null\)/.test(noteSrc) && !/subtle/.test(noteSrc)) console.log('SKIP js/licence-note.js is still the seam\'s stub: the check runs once Part A\'s readWebNote is merged');
    else {
      const wctx = await browser.newContext();
      const wp = await wctx.newPage();
      const werrors = []; wp.on('pageerror', e => werrors.push(e.message)); wp.on('console', m => { if (m.type() === 'error') werrors.push(m.text()); });
      await wctx.route('**/js/licence-keys.js', rt => rt.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: `export const LICENCE_KEYS = ${JSON.stringify(KEYS)};\n` }));
      await wp.goto(BASE + 'styles.css'); // a page of the site's own origin with no policy of its own, to import the module from
      const read = note => wp.evaluate(n => import('./js/licence-note.js').then(m => m.readWebNote(n)).then(v => v, e => ({ threw: String(e && e.name) })), note);
      const web = await codes.signNote('web', shopKey, 2, { email: 'pat@example.com', ref: '2:4242', iat: 5 });
      const good = await read(web);
      ok('a web note signed by desktop/licence-codes.cjs reads back in the browser with js/licence-note.js (the two agree)', !!good && good.email === 'pat@example.com' && good.ref === '2:4242' && good.iat === 5, JSON.stringify(good));
      ok('…one signed with the "active" prefix does not', !(await read(await codes.signNote('active', shopKey, 2, { email: 'pat@example.com', ref: '2:4242', iat: 5 }))));
      ok('…nor one signed by the owner\'s key (only the shop, key 2, signs sign-ins), nor an edited one', !(await read(await codes.signNote('web', ownerKey, 1, { email: 'pat@example.com', ref: '2:4242', iat: 5 }))) && !(await read({ ...web, data: web.data.replace('pat@', 'pam@') })));
      ok('no errors in the console (the note check)', werrors.length === 0, werrors.slice(0, 5).join(' | '));
      await wctx.close();
    }
  } catch (e) {
    console.log('FAIL spec crashed — ' + (e && e.stack || e));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
