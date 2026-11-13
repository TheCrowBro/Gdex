// Gdex's licence server (cloudflare/worker.mjs), bundled as Wrangler does and run in Cloudflare's own runtime (workerd,
// through Miniflare), with Stripe and Resend faked and throw-away keys in place of desktop/licence-keys.json: every
// address of the build spec §3.9 (the Buy link, the price per country, the thank-you page, the Stripe webhook with
// refunds and disputes, the 3-computer activation with moves and release, the owner's signed requests, the website's
// sign-in by an emailed code with every limit, Delete my licence records), that a Vdex payment never makes a Gdex code,
// that the website's licence stays paused until every setting the shop needs is there, that every value from Stripe or
// a request reaches a page or an email only escaped, and the Worker's configuration. Nothing here reaches the network.
// Needs `npm ci --prefix cloudflare` (CI does it): without it this spec says SKIP, or FAIL in CI ([S-26]).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
// cloudflare/, desktop/ and tools/ are read from the repository itself, never from the test's scratch copy ([S-26]).
const REPO = path.resolve(__dirname, '../..');
const NM = path.join(REPO, 'cloudflare/node_modules');
const codes = require(path.join(REPO, 'desktop/licence-codes.cjs'));
const DAY = 86400e3;
const today = () => new Date().toISOString().slice(0, 10);
// A purchase's ref as the Worker makes it: key 2 and a serial from Gdex's own salt and the Checkout Session's id.
const refForSession = sessionId => { const h = crypto.createHash('sha256').update('gdex-order|' + sessionId).digest(); return '2:' + (h.readUInt32BE(0) || 1); };

(async () => {
  if (!fs.existsSync(path.join(NM, 'miniflare')) || !fs.existsSync(path.join(NM, 'esbuild'))) {
    if (process.env.CI) { console.log('FAIL the licence server\'s spec needs Wrangler\'s runtime: npm ci --prefix cloudflare'); process.exit(1); }
    console.log('SKIP the licence server\'s spec needs Wrangler\'s runtime (Miniflare): run npm ci --prefix cloudflare once'); return;
  }
  const esbuild = require(path.join(NM, 'esbuild'));
  const { Miniflare, convertV4MiniflareOptions } = require(path.join(NM, 'miniflare'));
  const open = [];
  try {
    const owner = await codes.newKeyPair(), shop = await codes.newKeyPair(), spare = await codes.newKeyPair(), stranger = await codes.newKeyPair();
    const KEYS = { 1: owner.publicKey, 2: shop.publicKey, 9: spare.publicKey };
    const ownerKey = await codes.importPrivate(codes.b64u.enc(owner.pkcs8)), shopKey = await codes.importPrivate(codes.b64u.enc(shop.pkcs8));
    const spareKey = await codes.importPrivate(codes.b64u.enc(spare.pkcs8)), strangerKey = await codes.importPrivate(codes.b64u.enc(stranger.pkcs8));
    // Bundle the Worker the way Wrangler does, with this test's keys in place of desktop/licence-keys.json.
    const bundle = async format => (await esbuild.build({ entryPoints: [path.join(REPO, 'cloudflare/worker.mjs')], bundle: true, format, platform: 'browser', conditions: ['workerd', 'worker', 'browser'], write: false, logLevel: 'silent',
      plugins: [{ name: 'test-keys', setup(b) { b.onLoad({ filter: /licence-keys\.json$/ }, () => ({ contents: JSON.stringify(KEYS), loader: 'json' })); } }] })).outputFiles[0].text;
    const script = await bundle('esm');

    const calls = [];
    const sessions = new Map();
    const session = (id, extra = {}) => ({ id, object: 'checkout.session', status: 'complete', payment_status: 'paid', payment_link: 'plink_gdex', created: Date.parse('2026-11-02T12:00:00Z') / 1000, payment_intent: 'pi_' + id.slice(-12), customer_details: { name: 'Pat Buyer', email: 'Pat@Example.com' }, ...extra });
    let resendStatus = 200;
    const outbound = async request => {
      const u = new URL(request.url), body = request.method === 'POST' ? await request.text() : '';
      calls.push({ url: u.href, method: request.method, headers: Object.fromEntries(request.headers), body });
      if (u.hostname === 'api.stripe.com') {
        if (request.headers.get('authorization') !== 'Bearer rk_test_key') return new Response('{"error":{}}', { status: 401 });
        const m = u.pathname.match(/^\/v1\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)$/);
        if (m) return sessions.has(m[1]) ? Response.json(sessions.get(m[1])) : new Response('{"error":{}}', { status: 404 });
        if (u.pathname === '/v1/checkout/sessions') {
          const byEmail = u.searchParams.get('customer_details[email]');
          if (byEmail) return Response.json({ data: [...sessions.values()].filter(s => String(s.customer_details.email).toLowerCase() === byEmail && s.payment_link === u.searchParams.get('payment_link')) });
          return Response.json({ data: [...sessions.values()].filter(s => s.payment_intent === u.searchParams.get('payment_intent')) });
        }
      }
      if (u.hostname === 'api.resend.com') return new Response(JSON.stringify({ id: 'email_1' }), { status: resendStatus });
      return new Response('unexpected', { status: 599 });
    };
    const env = { LICENCE_SHOP_KEY: codes.b64u.enc(shop.pkcs8), STRIPE_SECRET_KEY: 'rk_test_key', STRIPE_WEBHOOK_SECRET: 'whsec_testsecret', STRIPE_PAYMENT_LINK: 'plink_gdex', BUY_URL: 'https://buy.stripe.com/test_gdex', RESEND_API_KEY: 're_test', REPLY_TO: 'help@example.com', WEB_SIGN_IN: 'on' };
    // cf: false: Miniflare's own request details, never fetched from Cloudflare (it would otherwise download a sample
    // from workers.cloudflare.com and keep it in .wrangler/). Each test request names its own country.
    const opts = bindings => convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-10-01', cf: false, kvNamespaces: ['LICENCES'], bindings, outboundService: outbound,
      serviceBindings: { ASSETS: req => new Response('static file ' + new URL(req.url).pathname) } });
    const make = bindings => { const m = new Miniflare(opts(bindings)); open.push(m); return m; };
    const drop = async m => { open.splice(open.indexOf(m), 1); await m.dispose(); };
    const mf = make(env);
    const SITE = 'https://gdex.crowmade.app';
    const answers = []; // every answer of the main Worker, for the header checks at the end
    const fetchIn = async (m, p, init) => { const r = await m.dispatchFetch(SITE + p, { redirect: 'manual', ...init }); if (m === mf) answers.push({ p, r }); return r; };
    const get = (p, init, m = mf) => fetchIn(m, p, init);
    const post = (p, body, m = mf) => fetchIn(m, p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    const mails = () => calls.filter(c => c.url === 'https://api.resend.com/emails').map(c => JSON.parse(c.body));
    const lastCode = to => { const x = mails().filter(e => e.to[0] === to).at(-1); return x && (x.subject.match(/^(\d{6}) is your Gdex sign-in code$/) || [])[1]; };

    /* ----------------------------- the basics ----------------------------- */
    ok('any other address is the static website', (await (await get('/index.html')).text()) === 'static file /index.html');
    const buy = await get('/buy');
    ok('/buy goes to Gdex\'s Stripe payment link', buy.status === 302 && buy.headers.get('location') === 'https://buy.stripe.com/test_gdex' && buy.headers.get('cache-control') === 'no-store');
    { // the price with tax in the country the request comes from (js/tax.js), for the Buy buttons
      const at = async country => { const r = await get('/licence/price', { cf: { country } }); return { cc: r.headers.get('cache-control') || '', ct: r.headers.get('content-type') || '', body: await r.json() }; };
      const gb = (await at('GB')).body, au = (await at('AU')).body, de = (await at('DE')).body, fi = (await at('FI')).body;
      ok('/licence/price: 24.00 USD with 20% VAT in the UK, 22.00 with 10% GST in Australia, 23.80 in Germany, 25.10 in Finland', gb.taxed && gb.taxed.total === '24.00' && gb.taxed.tax === 'VAT' && gb.taxed.rate === 20 && gb.taxed.place === 'the UK' && au.taxed.total === '22.00' && au.taxed.tax === 'GST' && de.taxed.total === '23.80' && de.country === 'DE' && fi.taxed.total === '25.10' && fi.taxed.rate === 25.5, JSON.stringify([gb, de]));
      const us = await at('US'), odd = (await at('<b>')).body;
      ok('…the price before tax anywhere else, and for a country it cannot read', us.body.taxed === null && us.body.country === 'US' && us.body.price === '20.00' && us.body.currency === 'USD' && odd.taxed === null && odd.country === '', JSON.stringify([us.body, odd]));
      ok('…as JSON that no cache keeps (each answer is for one country)', /no-store/.test(us.cc) && us.ct === 'application/json; charset=utf-8', us.cc);
    }
    const status = await get('/licence/web/status');
    ok('/licence/web/status: { on: true } once every setting is there, kept by caches for 5 minutes', JSON.stringify(await status.json()) === '{"on":true}' && status.headers.get('cache-control') === 'public, max-age=300' && /^application\/json/.test(status.headers.get('content-type')));

    /* ---------------------------- after paying ---------------------------- */
    const sid = 'cs_test_a1B2c3D4e5F6g7H8i9J0';
    sessions.set(sid, session(sid));
    const th = await get('/licence/thanks?session_id=' + sid), html = await th.text();
    const code = (html.match(/<textarea id="code"[^>]*>([^<]+)<\/textarea>/) || [])[1];
    const v = code && (await codes.verifyCode(code, { keys: KEYS }));
    ok('the thank-you page shows a GDEX- code made by the shop key, for the buyer, for 3 devices, its ref from Gdex\'s own salt', th.status === 200 && /^GDEX-/.test(code) && v && v.status === 'valid' && v.licence.kid === 2 && v.licence.ref === refForSession(sid) && v.licence.name === 'Pat Buyer' && v.licence.email === 'pat@example.com' && v.licence.seats === 3 && !v.licence.comp && v.licence.issued === '2026-11-02');
    ok('it says, in Gdex\'s words, how to use it on the website and in the desktop app', /Thank you: here is your Gdex licence/.test(html) && /On the website:<\/b> Settings → About &amp; licence → Sign in, with <b>pat@example\.com<\/b>/.test(html) && /In the desktop app:<\/b> Settings → About &amp; licence → Enter licence code/.test(html) && /every role on up to 3 of your devices/.test(html) && /Audiophile stays free/.test(html) && /We’ve emailed it to you too/.test(html) && !/Vdex|Android|iPhone|App Store/i.test(html));
    ok('reloading the page shows the same code', (await (await get('/licence/thanks?session_id=' + sid)).text()).includes(code));
    { // a new payment link (a new price) beside the old one: purchases through either still get their code
      const both = make({ ...env, STRIPE_PAYMENT_LINK: 'plink_newprice, plink_gdex' });
      const again = await (await both.dispatchFetch(SITE + '/licence/thanks?session_id=' + sid, { redirect: 'manual' })).text();
      ok('with a second payment link added, a purchase through the first still shows the same code', again.includes(code));
      await drop(both);
    }
    const csp = th.headers.get('content-security-policy') || '', nonce = (csp.match(/'nonce-([^']+)'/) || [])[1];
    ok('the page carries its own strict security headers and is never cached', !!nonce && html.includes(`<script nonce="${nonce}">`) && /default-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp) && th.headers.get('cache-control') === 'no-store' && th.headers.get('x-robots-tag') === 'noindex' && th.headers.get('referrer-policy') === 'no-referrer');
    sessions.set('cs_test_vdexPayment000000001', session('cs_test_vdexPayment000000001', { payment_link: 'plink_vdex' }));
    sessions.set('cs_test_notPaidYet00000000001', session('cs_test_notPaidYet00000000001', { payment_status: 'unpaid' }));
    ok('a payment through another link on the same Stripe account (Vdex\'s) gets no Gdex code', (await get('/licence/thanks?session_id=cs_test_vdexPayment000000001')).status === 404);
    const pending = await get('/licence/thanks?session_id=cs_test_notPaidYet00000000001');
    ok('a payment still being confirmed says so, with a link to reload', pending.status === 202 && /Your payment is on its way/.test(await pending.text()));
    ok('a made-up order number gets no code', (await get('/licence/thanks?session_id=cs_test_doesNotExist0000001')).status === 404 && (await get('/licence/thanks?session_id=../../v1/balance')).status === 404);

    /* ------------------------------ webhooks ------------------------------ */
    const signed = (event, t = Math.floor(Date.now() / 1000), secret = env.STRIPE_WEBHOOK_SECRET, m = mf) => {
      const body = JSON.stringify(event), sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
      return fetchIn(m, '/licence/stripe-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }, body });
    };
    const done = { id: 'evt_1', type: 'checkout.session.completed', data: { object: sessions.get(sid) } };
    calls.length = 0;
    const wh = await signed(done), whb = await wh.json(), mail = calls.find(c => c.url === 'https://api.resend.com/emails'), mb = mail && JSON.parse(mail.body);
    ok('a completed payment emails the same code through Resend, once per order (Gdex\'s own idempotency key)', wh.status === 200 && whb.ok && whb.ref === v.licence.ref && mb && mb.to[0] === 'pat@example.com' && mb.text.includes(code) && mb.reply_to === 'help@example.com' && mail.headers['idempotency-key'] === 'gdex-licence-' + sid && mb.from === 'Gdex <licences@gdex.crowmade.app>');
    ok('the email is Gdex\'s: "Your Gdex licence", the code, the same steps, "Keep this email: it is your licence"', mb.subject === 'Your Gdex licence' && /Settings → About & licence → Sign in, with this email address/.test(mb.text) && /Settings → About & licence → Enter licence code/.test(mb.text) && /Keep this email: it is your licence\. Questions\? Reply to it\./.test(mb.text) && mb.html.includes(code) && !/Vdex|Android|iPhone|App Store/i.test(mb.text + mb.html));
    ok('a webhook with a wrong or old signature is refused', (await signed(done, undefined, 'whsec_wrong')).status === 400 && (await signed(done, Math.floor(Date.now() / 1000) - 3600)).status === 400 && (await post('/licence/stripe-webhook', JSON.stringify(done))).status === 400);
    resendStatus = 500;
    ok('if the email fails, Stripe is told to try again (502)', (await signed(done)).status === 502);
    resendStatus = 200;
    ok('a payment that is confirmed later sends its email then', (await (await signed({ type: 'checkout.session.async_payment_succeeded', data: { object: sessions.get(sid) } })).json()).ok === true);
    calls.length = 0;
    const vdexEvent = await (await signed({ type: 'checkout.session.completed', data: { object: sessions.get('cs_test_vdexPayment000000001') } })).json();
    ok('a Vdex purchase\'s webhook (same Stripe account) is ignored: no code, no email', vdexEvent.ignored === 'not-ours' && mails().length === 0, JSON.stringify(vdexEvent));
    ok('other events are acknowledged and ignored', (await (await signed({ type: 'customer.created', data: { object: {} } })).json()).ignored === 'customer.created');

    /* ---------------------------- 3 computers ---------------------------- */
    const id = n => 'install-' + String(n).padStart(14, '0');
    const act = (install, extra = {}) => post('/licence/activate', { code, install, os: 'Mac', ...extra });
    const a1 = await act(id(1)), j1 = await a1.json();
    const rc = j1.receipt && (await codes.readNote('active', j1.receipt, { keys: KEYS }));
    ok('activating returns a receipt signed by the shop key for this code and computer', a1.status === 200 && rc && rc.ref === v.licence.ref && rc.install === id(1) && j1.receipt.kid === 2 && j1.seats === 3);
    ok('activating the same computer again is fine and takes no extra place', (await act(id(1))).status === 200 && (await (await act(id(2), { os: 'Windows' })).json()).used === 2 && (await (await act(id(3), { os: 'Android' })).json()).used === 3);
    const f4 = await act(id(4)), j4 = await f4.json();
    ok('a fourth computer is told the code is full, with the others listed by a tag, never their IDs', f4.status === 409 && j4.error === 'full' && j4.computers.length === 3 && j4.swapsLeft === 3 && j4.computers.every(c => /^[A-Za-z0-9_-]{12}$/.test(c.tag) && !JSON.stringify(c).includes('install-')));
    ok('only Mac, Windows and Linux are named; anything else is "Computer"', JSON.stringify(j4.computers.map(c => c.os)) === JSON.stringify(['Mac', 'Windows', 'Computer']), j4.computers.map(c => c.os).join());
    ok('a tag cannot be used to release another computer without a counted swap', (await post('/licence/release', { code, install: j4.computers[0].tag })).status === 400);
    const sw = await act(id(4), { release: j4.computers[0].tag });
    ok('choosing a computer to move it from activates the new one', sw.status === 200 && (await (await act(id(1))).json()).error === 'full');
    let last;
    for (let k = 5; k <= 6; k++) { const jj = await (await act(id(k))).json(); last = await act(id(k), { release: jj.computers[0].tag }); }
    const j7 = await (await act(id(7))).json(), r7 = await act(id(7), { release: j7.computers[0].tag });
    ok('after 3 moves in 30 days the code cannot move again (429)', last.status === 200 && j7.swapsLeft === 0 && r7.status === 429 && (await r7.json()).error === 'swaps');
    const listed = (await mf.getKVNamespace('LICENCES').then(kv => kv.get('c:' + v.licence.ref, 'json'))).computers.map(c => c.id);
    const rel = await post('/licence/release', { code, install: listed[0] }), rel2 = await post('/licence/release', { code, install: listed[0] });
    ok('releasing a computer frees its place; an unlisted one is told so (404 not-listed)', rel.status === 200 && rel2.status === 404 && (await rel2.json()).error === 'not-listed' && (await act(id(8))).status === 200);
    ok('a code that does not check out, a bad computer ID or a body that is not JSON is refused (400 invalid)', (await post('/licence/activate', { code: code.slice(0, -3) + 'AAA', install: id(9) })).status === 400 && (await post('/licence/activate', { code, install: 'x' })).status === 400 && (await (await post('/licence/activate', 'not json')).json()).error === 'invalid');
    const old = await codes.signCode(ownerKey, 1, { name: 'Short Term', comp: true, issued: '2026-01-01', expires: '2026-01-02' });
    const ex = await post('/licence/activate', { code: old, install: id(10) });
    ok('a free code past its end date is refused (403 expired)', ex.status === 403 && (await ex.json()).error === 'expired');

    /* ------------------------- refunds and disputes ------------------------- */
    const rsid = 'cs_test_refundMe0000000000001'; sessions.set(rsid, session(rsid));
    const rcode = (await (await get('/licence/thanks?session_id=' + rsid)).text()).match(/<textarea id="code"[^>]*>([^<]+)</)[1];
    ok('a code works before its refund', (await post('/licence/activate', { code: rcode, install: id(20) })).status === 200);
    ok('a partial refund keeps the code', (await (await signed({ type: 'charge.refunded', data: { object: { refunded: false, payment_intent: sessions.get(rsid).payment_intent } } })).json()).ignored === 'charge.refunded');
    const rf = await (await signed({ type: 'charge.refunded', data: { object: { refunded: true, payment_intent: sessions.get(rsid).payment_intent } } })).json();
    const rfa = await post('/licence/activate', { code: rcode, install: id(20) });
    ok('a full refund cancels the code bought with that payment, and only that one (403 cancelled)', rf.cancelled === 1 && rfa.status === 403 && (await rfa.json()).error === 'cancelled' && (await act(id(8))).status === 200);
    const dsid = 'cs_test_disputeMe000000000002'; sessions.set(dsid, session(dsid, { payment_intent: 'pi_disputeMe00002' }));
    const dcode = (await (await get('/licence/thanks?session_id=' + dsid)).text()).match(/<textarea id="code"[^>]*>([^<]+)</)[1];
    const dp = await (await signed({ type: 'charge.dispute.created', data: { object: { payment_intent: sessions.get(dsid).payment_intent } } })).json();
    ok('a dispute cancels the code too', dp.cancelled === 1 && (await post('/licence/activate', { code: dcode, install: id(21) })).status === 403);
    const vr = await (await signed({ type: 'charge.refunded', data: { object: { refunded: true, payment_intent: sessions.get('cs_test_vdexPayment000000001').payment_intent } } })).json();
    ok('a refund of a Vdex purchase cancels nothing of Gdex\'s', vr.ok && vr.cancelled === 0);

    /* ---------------------------- the owner ---------------------------- */
    const adm = async (op, ref, { key = ownerKey, kid = 1, at = Date.now(), ...more } = {}) => { const r = await post('/licence/admin', await codes.signNote('admin', key, kid, { op, ref, at, ...more })); return { status: r.status, cors: r.headers.get('access-control-allow-origin'), ...(await r.json()) }; };
    const look = await adm('look', v.licence.ref);
    ok('the owner can look a code up (signed with key 1), from the generator page on their computer', look.status === 200 && look.computers.length === 3 && look.swaps === 3 && !look.cancelled && look.cors === '*');
    const pre = await get('/licence/admin', { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    ok('the browser\'s pre-check for the generator page is answered', pre.status === 204 && /POST/.test(pre.headers.get('access-control-allow-methods')));
    ok('clearing a code empties its computers', (await adm('clear', v.licence.ref)).computers.length === 0 && (await act(id(30))).status === 200);
    ok('cancelling a code (with the spare key, 9) stops it activating; restoring brings it back', (await adm('cancel', v.licence.ref, { key: spareKey, kid: 9 })).cancelled.why === 'owner' && (await act(id(30))).status === 403 && !(await adm('restore', v.licence.ref)).cancelled && (await act(id(30))).status === 200);
    ok('the shop key cannot make owner requests, and nor can anyone else', (await adm('clear', v.licence.ref, { key: shopKey, kid: 2 })).status === 403 && (await adm('clear', v.licence.ref, { key: strangerKey, kid: 1 })).status === 403);
    const stale = await adm('look', v.licence.ref, { at: Date.now() - 3600e3 });
    ok('an old signed request is refused, with the server\'s time so the page can retry', stale.status === 403 && stale.error === 'stale' && Math.abs(stale.now - Date.now()) < 60e3);
    ok('a bad ref or an unknown request is refused, and the address answers only POST', (await adm('look', 'x')).error === 'bad-ref' && (await adm('wipe', v.licence.ref)).error === 'bad-op' && (await get('/licence/admin')).status === 405);

    /* --------------------------- website sign-in --------------------------- */
    const web = (p, body, m = mf) => post('/licence/web/' + p, body, m).then(async r => ({ status: r.status, ...(await r.json()) }));
    calls.length = 0;
    const nobody = await web('start', { email: 'nobody@example.com' });
    ok('an email with no licence gets the same answer, and no email is sent to it', nobody.status === 200 && nobody.ok && !nobody.email && mails().length === 0);
    const st = await web('start', { email: '  PAT@example.com ' });
    const pc = lastCode('pat@example.com'), sent = mails().at(-1);
    ok('the buyer\'s email (any case) gets a 6-digit code: "<code> is your Gdex sign-in code", good for 15 minutes', JSON.stringify(st) === JSON.stringify(nobody) && /^\d{6}$/.test(pc || '') && /Use it within 15 minutes/.test(sent.text) && /If you didn’t ask for it, ignore this email/.test(sent.text) && !sent.text.includes(code));
    const wrong = await web('verify', { email: 'pat@example.com', code: pc === '000000' ? '111111' : '000000' });
    ok('a wrong code is refused (400 wrong-code)', wrong.status === 400 && wrong.error === 'wrong-code');
    const probe = await web('verify', { email: 'nobody@example.com', code: '000000' });
    ok('checking a code says nothing about whether the email has a licence (the same answer for one with none)', JSON.stringify(probe) === JSON.stringify(wrong));
    const good = await web('verify', { email: 'pat@example.com', code: pc });
    const tok = good.token && (await codes.readNote('web', good.token, { keys: KEYS, signers: [2] }));
    ok('the right code signs in: a GDEX-WEB token signed by the shop for that email and licence', good.status === 200 && tok && tok.email === 'pat@example.com' && tok.ref === v.licence.ref && good.licence.seats === 3 && good.licence.email === 'pat@example.com' && good.licence.name === 'Pat Buyer');
    ok('each code works once', (await web('verify', { email: 'pat@example.com', code: pc })).error === 'wrong-code');
    ok('a signed-in browser checks back and is confirmed', (await web('check', { token: good.token })).ok === true);
    ok('a made-up or edited token is refused (401 signed-out)', (await web('check', { token: { ...good.token, data: good.token.data.replace('pat@', 'pam@') } })).status === 401 && (await web('check', { token: await codes.signNote('web', ownerKey, 1, { email: 'pat@example.com', ref: v.licence.ref, iat: 1 }) })).status === 401 && (await web('check', { token: 'x' })).error === 'signed-out');
    await adm('cancel', v.licence.ref);
    ok('once its licence is cancelled (a refund), the next check signs it out (403 cancelled)', (await web('check', { token: good.token })).error === 'cancelled');
    await adm('restore', v.licence.ref);
    const ended = await codes.signCode(ownerKey, 1, { name: 'Ended', email: 'ended@example.com', comp: true, issued: '2026-01-01', expires: '2026-01-02', serial: 31 });
    await adm('link', '1:31', { code: ended });
    ok('a sign-in whose free licence has passed its end date is told so (403 expired)', (await web('check', { token: await codes.signNote('web', shopKey, 2, { email: 'ended@example.com', ref: '1:31', iat: Date.now() }) })).error === 'expired');
    ok('a sign-in for an email with no licence left is signed out (403 signed-out)', (await web('check', { token: await codes.signNote('web', shopKey, 2, { email: 'ghost@example.com', ref: '2:1', iat: Date.now() }) })).error === 'signed-out');
    // Five tries, then four codes a day (and five an hour) to one address.
    await web('start', { email: 'pat@example.com' });
    for (let i = 0; i < 5; i++) await web('verify', { email: 'pat@example.com', code: lastCode('pat@example.com') === '999999' ? '888888' : '999999' });
    ok('after 5 wrong tries even the right code is refused until a new one is sent', (await web('verify', { email: 'pat@example.com', code: lastCode('pat@example.com') })).error === 'wrong-code');
    const fresh = await codes.signCode(ownerKey, 1, { name: 'Lee Daily', email: 'lee@example.com', comp: true, issued: '2026-11-02', serial: 41 });
    await adm('link', '1:41', { code: fresh });
    const leeBefore = mails().filter(x => x.to[0] === 'lee@example.com').length, leeAnswers = [];
    for (let i = 0; i < 6; i++) leeAnswers.push(JSON.stringify(await web('start', { email: 'lee@example.com' })));
    ok('no more than 4 codes a day go to one address, and the answer never changes', mails().filter(x => x.to[0] === 'lee@example.com').length - leeBefore === 4 && new Set(leeAnswers).size === 1, `${mails().filter(x => x.to[0] === 'lee@example.com').length - leeBefore} sent`);
    const hour = await codes.signCode(ownerKey, 1, { name: 'Hour', email: 'hour@example.com', comp: true, issued: '2026-11-02', serial: 42 });
    await adm('link', '1:42', { code: hour });
    const kv = await mf.getKVNamespace('LICENCES');
    await kv.put('w:hour@example.com', JSON.stringify({ sent: [1, 2, 3, 4, 5].map(n => Date.now() - n * 60e3) }));
    await web('start', { email: 'hour@example.com' });
    ok('an address that had 5 codes in the last hour gets no more', !lastCode('hour@example.com'));
    // A licence code instead of an email.
    const freeCode = await codes.signCode(ownerKey, 1, { name: 'Robin Free', email: 'robin@example.com', comp: true, issued: '2026-11-02' });
    const viaCode = await web('start', { code: freeCode });
    ok('a licence code can be used instead of an email: the sign-in code goes to the email inside it', viaCode.ok && viaCode.email === 'robin@example.com' && /^\d{6}$/.test(lastCode('robin@example.com') || ''));
    const rb = await web('verify', { email: 'robin@example.com', code: lastCode('robin@example.com') });
    ok('…and signs in with that free licence', rb.status === 200 && rb.licence.comp === true && rb.licence.ref.startsWith('1:'));
    const noMail = await codes.signCode(ownerKey, 1, { name: 'No Address', comp: true, issued: '2026-11-02' });
    ok('a code that is not valid, a code with no email in it, or an address that is not one is refused (400)', (await web('start', { code: 'GDEX-AAAAA' })).error === 'invalid-code' && (await web('start', { code: noMail })).error === 'no-email' && (await web('start', { email: 'not an address' })).error === 'invalid-email' && (await web('start', 'nope')).status === 400);
    const freeCode2 = await codes.signCode(ownerKey, 1, { name: 'Sam Linked', email: 'sam@example.com', comp: true, issued: '2026-11-02' });
    const lnk = await adm('link', (await codes.verifyCode(freeCode2, { keys: KEYS })).licence.ref, { code: freeCode2 });
    await web('start', { email: 'sam@example.com' });
    ok('the generator links a free code\'s email, which can then sign in with just the email', lnk.status === 200 && /^\d{6}$/.test(lastCode('sam@example.com') || ''));
    ok('…and only a whole code with an email in it can be linked', (await adm('link', '1:5', { code: freeCode2 })).error === 'bad-code' && (await adm('link', (await codes.verifyCode(noMail, { keys: KEYS })).licence.ref, { code: noMail })).error === 'bad-code');
    const dsk = await codes.signCode(ownerKey, 1, { name: 'Desk Top', email: 'desk@example.com', comp: true, issued: '2026-11-02' });
    await post('/licence/activate', { code: dsk, install: 'install-desk-0000000001', os: 'Windows' });
    await web('start', { email: 'desk@example.com' });
    ok('a code activated in the desktop app links its email too', /^\d{6}$/.test(lastCode('desk@example.com') || ''));
    const lsid = 'cs_test_lateWebhook0000000001'; sessions.set(lsid, session(lsid, { customer_details: { name: 'Late Buyer', email: 'late@example.com' } }));
    sessions.set('cs_test_lateVdexBuyer00000001', session('cs_test_lateVdexBuyer00000001', { payment_link: 'plink_vdex', customer_details: { name: 'Vdex Only', email: 'vonly@example.com' } }));
    calls.length = 0;
    await web('start', { email: 'late@example.com' }); await web('start', { email: 'vonly@example.com' });
    ok('a buyer whose webhook never came is looked up in Stripe, among Gdex\'s payment links only', calls.some(c => /customer_details%5Bemail%5D=late%40example\.com|customer_details\[email\]=late%40example\.com/.test(c.url) && /payment_link=plink_gdex/.test(c.url)) && /^\d{6}$/.test(lastCode('late@example.com') || '') && !lastCode('vonly@example.com'));
    // The right code, but the licence was refunded in between.
    const csid = 'cs_test_cancelBetween00000001'; sessions.set(csid, session(csid, { customer_details: { name: 'Between', email: 'between@example.com' } }));
    await signed({ type: 'checkout.session.completed', data: { object: sessions.get(csid) } });
    await web('start', { email: 'between@example.com' });
    await adm('cancel', refForSession(csid));
    ok('a right code for a licence cancelled meanwhile signs nobody in (403 no-licence)', (await web('verify', { email: 'between@example.com', code: lastCode('between@example.com') })).error === 'no-licence');
    // Two licences on one email: the signed-in one is refunded, the check moves the browser to the other.
    const second = await codes.signCode(ownerKey, 1, { name: 'Robin Free', email: 'robin@example.com', comp: true, issued: '2026-11-02', serial: 777 });
    await adm('link', '1:777', { code: second });
    await adm('cancel', rb.licence.ref);
    const moved = await web('check', { token: rb.token }), mt = moved.token && (await codes.readNote('web', moved.token, { keys: KEYS, signers: [2] }));
    ok('when the signed-in licence ends and the same email has another, the check answers with a token for that one', moved.ok && mt && mt.ref === '1:777' && moved.licence.ref === '1:777');
    await adm('restore', rb.licence.ref);
    resendStatus = 500;
    const fail = await web('start', { email: 'sam@example.com' });
    ok('an email Resend could not send is said so (502 email-failed)', fail.status === 502 && fail.error === 'email-failed');
    resendStatus = 200;
    // Delete my licence records.
    await web('start', { email: 'desk@example.com' });
    const dt = await web('verify', { email: 'desk@example.com', code: lastCode('desk@example.com') });
    const forgot = await web('forget', { token: dt.token });
    const lookAfter = await adm('look', dt.licence.ref);
    ok('Delete my licence records forgets the email\'s links and the computers on its licence', forgot.status === 200 && forgot.ok && lookAfter.computers.length === 0 && !(await kv.get('e:desk@example.com')));
    ok('…every sign-in made before it stops working, and it cannot be repeated with the old one (401)', (await web('check', { token: dt.token })).status === 401 && (await web('forget', { token: dt.token })).status === 401);
    await post('/licence/activate', { code: dsk, install: 'install-desk-0000000001', os: 'Windows' });
    await web('start', { email: 'desk@example.com' });
    const dt2 = await web('verify', { email: 'desk@example.com', code: lastCode('desk@example.com') });
    ok('…while the licence itself stays: using the code again makes the records afresh, with a sign-in that works', dt2.status === 200 && (await web('check', { token: dt2.token })).ok === true);
    // The day's sign-in emails, for everyone together: 30.
    await kv.put('m:' + today(), '29');
    const lastOne = mails().filter(x => x.to[0] === 'robin@example.com').length;
    const okLast = await web('start', { email: 'robin@example.com' });
    const capLic = await web('start', { email: 'robin@example.com' }), capNone = await web('start', { email: 'nobody@example.com' });
    ok('30 sign-in emails a day in all: the 30th goes, then everyone gets the same "busy" answer (purchase emails keep their room)', okLast.status === 200 && mails().filter(x => x.to[0] === 'robin@example.com').length === lastOne + 1 && capLic.status === 503 && capLic.error === 'busy' && JSON.stringify(capLic) === JSON.stringify(capNone));
    {
      const more = make({ ...env, SIGN_IN_EMAILS_PER_DAY: '1000' });
      await (await more.getKVNamespace('LICENCES')).put('m:' + today(), '29');
      await (await more.getKVNamespace('LICENCES')).put('e:pat@example.com', JSON.stringify({ licences: [{ ref: v.licence.ref, seats: 3 }] }));
      ok('SIGN_IN_EMAILS_PER_DAY raises it on a paid Resend plan', (await post('/licence/web/start', { email: 'pat@example.com' }, more)).status === 200 && (await post('/licence/web/start', { email: 'pat@example.com' }, more)).status === 200);
      await drop(more);
    }

    /* --------------------- escaping (the build spec [S-44]) --------------------- */
    const hostile = { name: '<img src=x onerror=alert(1)>', email: 'o\'brien"@example.com' };
    const xsid = 'cs_test_Z9y8X7w6V5u4T3s2R1q0';
    sessions.set(xsid, session(xsid, { customer_details: hostile }));
    const xpage = await (await get('/licence/thanks?session_id=' + xsid)).text();
    const xcode = (xpage.match(/<textarea id="code"[^>]*>([^<]+)</) || [])[1];
    ok('the thank-you page carries a hostile name and an email with quotes only escaped', !xpage.includes('<img') && xpage.includes('&lt;img src=x onerror=alert(1)&gt;') && !xpage.includes('o\'brien"') && xpage.includes('o&#39;brien&quot;@example.com') && !!xcode);
    calls.length = 0;
    await signed({ type: 'checkout.session.completed', data: { object: sessions.get(xsid) } });
    const xmail = mails().at(-1);
    ok('…and so does the code email\'s HTML (its plain text is plain text)', !!xmail && xmail.to[0] === 'o\'brien"@example.com' && !xmail.html.includes('<img') && xmail.html.includes('&lt;img src=x') && !xmail.html.includes('o\'brien"') && xmail.text.includes('<img src=x onerror=alert(1)>'));
    await kv.put('m:' + today(), '0');
    await web('start', { email: 'o\'brien"@example.com' });
    const xsign = mails().filter(x => x.to[0] === 'o\'brien"@example.com').at(-1);
    ok('…and the sign-in email\'s', !!xsign && /^\d{6} is your Gdex sign-in code$/.test(xsign.subject) && xsign.html.includes('o&#39;brien&quot;@example.com') && !xsign.html.includes('o\'brien"'));
    ok('every email\'s subject is one line of at most 120 characters', mails().length > 0 && calls.filter(c => c.url === 'https://api.resend.com/emails').every(c => { const s = JSON.parse(c.body).subject; return !/[\r\n]/.test(s) && s.length <= 120; }));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdex-worker-')), modFile = path.join(tmp, 'worker.mjs');
    fs.writeFileSync(modFile, script);
    const mod = await import(pathToFileURL(modFile).href);
    ok('a subject built from a value with a line break has none (plain)', mod.plain('Line one\r\nBcc: someone@example.com\nthree') === 'Line one Bcc: someone@example.com three' && mod.plain('x'.repeat(300)).length === 120 && mod.esc('<a href="x">\'') === '&lt;a href=&quot;x&quot;&gt;&#39;');
    fs.rmSync(tmp, { recursive: true, force: true });

    /* -------------------------- addresses left out -------------------------- */
    const gone = [];
    for (const [m, p] of [['GET', '/licence/apple/status'], ['POST', '/licence/apple/claim'], ['POST', '/licence/web/activate'], ['POST', '/licence/web/release'], ['GET', '/licence/nothing-here'], ['GET', '/licence/activate']]) {
      const r = await get(p, { method: m, ...(m === 'POST' ? { body: '{}', headers: { 'Content-Type': 'application/json' } } : {}) });
      gone.push(r.status === 404 && JSON.stringify(await r.json()) === '{"error":"not-found"}' ? '' : `${m} ${p} ${r.status}`);
    }
    ok('Vdex\'s phone-store addresses are not here, nor anything else under /licence/ (404 not-found)', gone.every(x => !x), gone.filter(Boolean).join(', '));

    /* ----------------------------- the headers ----------------------------- */
    const jsonAnswers = answers.filter(a => /^application\/json/.test(a.r.headers.get('content-type') || ''));
    const badJson = jsonAnswers.filter(a => a.r.headers.get('content-type') !== 'application/json; charset=utf-8' || a.r.headers.get('x-content-type-options') !== 'nosniff' || (a.p !== '/licence/web/status' && a.r.headers.get('cache-control') !== 'no-store'));
    ok('every JSON answer is application/json; charset=utf-8, nosniff, and never cached (but the status, 5 minutes)', jsonAnswers.length > 50 && badJson.length === 0, badJson.slice(0, 3).map(a => a.p).join(', '));
    // Cloudflare adds a Date header to every answer at its edge (the server time Gdex corrects a wrong clock with, [S-38]);
    // workerd run locally adds none, so here the Worker's own answers must simply not set one of their own.
    const own = answers.filter(a => a.p === '/buy' || a.p.startsWith('/licence/')), dated = own.filter(a => a.r.headers.get('date'));
    if (dated.length === own.length) ok('every answer of the licence server carries a Date header', true);
    else ok('the licence server sets no Date header of its own: Cloudflare adds one to every answer (Miniflare adds none)', dated.length === 0 && !/['"]date['"]\s*:/i.test(fs.readFileSync(path.join(REPO, 'cloudflare/worker.mjs'), 'utf8')), `${dated.length} of ${own.length} dated`);

    /* ------------------- not set up yet: the licence stays paused ------------------- */
    const NEEDS = ['WEB_SIGN_IN', 'RESEND_API_KEY', 'LICENCE_SHOP_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_PAYMENT_LINK', 'BUY_URL'];
    const paused = [];
    for (const k of NEEDS) {
      const m = make({ ...env, [k]: '' });
      const s = await (await m.dispatchFetch(SITE + '/licence/web/status')).json();
      const st2 = await m.dispatchFetch(SITE + '/licence/web/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'pat@example.com' }) });
      if (!(s.on === false && st2.status === 503 && (await st2.json()).error === 'not-ready')) paused.push(k);
      await drop(m);
    }
    ok('without any one of WEB_SIGN_IN, RESEND_API_KEY, the shop key, STRIPE_SECRET_KEY, STRIPE_PAYMENT_LINK or BUY_URL, the website is told the licence is off and sign-in waits', paused.length === 0, paused.join(', '));
    {
      const m = make({ ...env, WEB_SIGN_IN: 'off' });
      const offPage = await (await m.dispatchFetch(SITE + '/licence/thanks?session_id=' + sid)).text();
      calls.length = 0;
      const t2 = Math.floor(Date.now() / 1000), raw2 = JSON.stringify(done), sig2 = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t2}.${raw2}`).digest('hex');
      await m.dispatchFetch(SITE + '/licence/stripe-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t2},v1=${sig2}` }, body: raw2 });
      const offMail = mails().at(-1);
      ok('the thank-you page sends questions to the email the licence comes in only when that email has a reply address', /Questions\? Reply to the email your licence comes in\./.test(html) && /Questions\? Reply to the email your licence comes in\./.test(offPage));
      {
        const quiet = make({ ...env, RESEND_API_KEY: '' }), noReply = make({ ...env, REPLY_TO: '' });
        const qp = await (await quiet.dispatchFetch(SITE + '/licence/thanks?session_id=' + sid)).text(), np = await (await noReply.dispatchFetch(SITE + '/licence/thanks?session_id=' + sid)).text();
        ok('…and otherwise to the receipt email (no Resend: the page is the only place the code is shown)', /this page is the only place it is shown/.test(qp) && /Questions\? Reply to your receipt email\./.test(qp) && !/the email your licence comes in/.test(qp) && /We’ve emailed it to you too/.test(np) && /Questions\? Reply to your receipt email\./.test(np));
        await drop(quiet); await drop(noReply);
      }
      ok('with the website\'s sign-in off, neither the thank-you page nor the email tells buyers to sign in there', offPage.includes(code) && !/On the website/.test(offPage) && /Enter licence code/.test(offPage) && offMail && offMail.text.includes(code) && !/Sign in, with this email/.test(offMail.text));
      await drop(m);
    }
    {
      const m = make({});
      const nb = await m.dispatchFetch(SITE + '/buy', { redirect: 'manual' }), nbt = await nb.text();
      ok('before the shop is set up, /buy says the Gdex licence is not on sale yet, in Gdex\'s words', nb.status === 200 && /The Gdex licence is not on sale yet/.test(nbt) && /It will cost 20 USD once, for up to 3 of your own devices\. Until then every role is free: <a href="\/index\.html">open Gdex<\/a>\./.test(nbt));
      ok('…activation says "not ready", the thank-you page says the shop is not open, and the status is off', (await m.dispatchFetch(SITE + '/licence/activate', { method: 'POST', body: JSON.stringify({ code, install: id(1) }) })).status === 503 && (await m.dispatchFetch(SITE + '/licence/thanks?session_id=' + sid)).status === 503 && (await (await m.dispatchFetch(SITE + '/licence/web/status')).json()).on === false);
      await drop(m);
      const half = make({ ...env, BUY_URL: 'http://buy.example.com/x' });
      ok('a Buy address that is not https:// is not followed, and keeps the licence paused', (await half.dispatchFetch(SITE + '/buy', { redirect: 'manual' })).status === 200 && (await (await half.dispatchFetch(SITE + '/licence/web/status')).json()).on === false);
      await drop(half);
    }
    {
      const m = make({ ...env, LICENCE_SHOP_KEY: codes.b64u.enc(stranger.pkcs8) });
      const t3 = Math.floor(Date.now() / 1000), raw3 = JSON.stringify(done), sig3 = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t3}.${raw3}`).digest('hex');
      const wh3 = await m.dispatchFetch(SITE + '/licence/stripe-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t3},v1=${sig3}` }, body: raw3 });
      const th3 = await m.dispatchFetch(SITE + '/licence/thanks?session_id=' + sid), th3t = await th3.text();
      ok('a shop key that is not the one built into Gdex keeps the shop closed instead of selling codes nobody can use', (await m.dispatchFetch(SITE + '/licence/activate', { method: 'POST', body: JSON.stringify({ code, install: id(1) }) })).status === 503 && th3.status === 503 && /The shop is not open yet/.test(th3t) && /reply to your receipt email/.test(th3t) && !/GDEX-/.test(th3t) && wh3.status === 503 && (await (await m.dispatchFetch(SITE + '/licence/web/status')).json()).on === false);
      await drop(m);
    }

    /* ------------------------------ the config ------------------------------ */
    const wr = JSON.parse(fs.readFileSync(path.join(REPO, 'cloudflare/wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
    const { WORKER_ROUTES } = await import(pathToFileURL(path.join(REPO, 'tools/site-files.mjs')).href);
    ok('the Worker is Gdex\'s: named gdex, at gdex.crowmade.app only, with no workers.dev or preview address', wr.name === 'gdex' && JSON.stringify(wr.routes) === JSON.stringify([{ pattern: 'gdex.crowmade.app', custom_domain: true }]) && wr.workers_dev === false && wr.preview_urls === false);
    ok('only /buy and /licence/… run the script; the rest is served as files', wr.main === 'worker.mjs' && JSON.stringify(wr.assets.run_worker_first) === JSON.stringify(['/buy', '/licence/*']) && JSON.stringify(WORKER_ROUTES) === JSON.stringify(wr.assets.run_worker_first) && wr.assets.binding === 'ASSETS' && wr.assets.directory === './site' && wr.assets.html_handling === 'none' && wr.assets.not_found_handling === 'none');
    ok('the licence store is created by Wrangler (no ID, so never Vdex\'s), and dashboard secrets survive a publish', JSON.stringify(wr.kv_namespaces) === JSON.stringify([{ binding: 'LICENCES' }]) && wr.keep_vars === true);
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'cloudflare/package.json'), 'utf8')), lock = JSON.parse(fs.readFileSync(path.join(REPO, 'cloudflare/package-lock.json'), 'utf8'));
    ok('Wrangler is pinned to an exact version with its checksum', pkg.name === 'gdex-cloudflare' && /^\d+\.\d+\.\d+$/.test(pkg.devDependencies.wrangler) && lock.packages['node_modules/wrangler'].version === pkg.devDependencies.wrangler && /^sha512-/.test(lock.packages['node_modules/wrangler'].integrity));
  } catch (e) {
    console.log('FAIL spec crashed — ' + (e && e.stack || e));
    process.exitCode = 1;
  } finally {
    for (const m of open) await m.dispose().catch(() => {});
  }
})();
