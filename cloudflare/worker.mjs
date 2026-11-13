// The gdex Worker. Everything at https://gdex.crowmade.app is the static website (served straight from the files in
// ./site), except these few addresses, which this script answers (wrangler.jsonc → assets.run_worker_first):
//
//   /buy                       goes to the Stripe payment page for the 20 USD licence (every role, up to 3 devices)
//   /licence/thanks            where Stripe sends a buyer after paying: shows their licence code
//   /licence/stripe-webhook    Stripe tells us about payments (email the code), refunds and disputes (cancel it)
//   /licence/activate          a desktop app puts its computer on a code's list (at most 3 computers per code)
//   /licence/release           a desktop app takes its computer off the list
//   /licence/admin             the owner's generator page: look at, clear, cancel or restore a code (signed requests)
//   /licence/web/…             the website's sign-in: whether the licence is live (status), a 6-digit code emailed to a
//                              licence holder (start), the signed token it becomes (verify), the daily check (check),
//                              and Delete my licence records (forget)
//   /licence/price             the price with tax in the country the request comes from (js/tax.js: the UK, the EU and
//                              Australia), for the Buy buttons on the website and in the desktop app
//
// Gdex's own: nothing here is shared with Vdex's Worker (its code prefix, signing prefixes, salts, keys, KV namespace,
// Stripe payment link and email sender are all Gdex's; docs/licence-server.md). A Vdex payment never makes a Gdex code:
// only payments through Gdex's own payment links count.
//
// Codes are made and checked by desktop/licence-codes.cjs, the same file the desktop app and the generator use. The list
// of computers for each code, and which codes are cancelled, are kept in the LICENCES KV namespace (created by Wrangler
// on the first deploy as gdex-licences). Secrets, set in Cloudflare (Workers & Pages → gdex → Settings → Variables and
// Secrets):
//   LICENCE_SHOP_KEY       the shop's private key (key 2), from the generator page; signs paid codes and activations
//   STRIPE_SECRET_KEY      a restricted Stripe key that can only read Checkout Sessions
//   STRIPE_WEBHOOK_SECRET  the signing secret of the webhook endpoint (whsec_…)
//   STRIPE_PAYMENT_LINK    the payment link's ID (plink_…): only payments made through it get a code. Several, separated
//                          by commas, when a new link replaces an old one (a new price): purchases through either count
//   BUY_URL                the payment link's address (https://buy.stripe.com/…)
//   RESEND_API_KEY         Resend, to email codes (without it the code is only shown after paying, and the website's
//                          sign-in stays off)
//   MAIL_FROM, REPLY_TO    the email's sender (default "Gdex <licences@gdex.crowmade.app>") and where replies go
//   WEB_SIGN_IN            "on" lets the website ask for a licence once licences are live in its build
//                          (js/licence-config.js); anything else pauses it, and every role opens again within hours
//   SIGN_IN_EMAILS_PER_DAY a higher daily cap on sign-in emails, on a paid Resend plan (default 30)
//
// Every value that comes from Stripe, from KV or from a request goes into a page or an email body only through esc(),
// and into an email's subject only through plain().
import codes from '../desktop/licence-codes.cjs';
import { PRICE, withTax } from '../js/tax.js';
import KEYS from '../desktop/licence-keys.json';

const SITE = 'https://gdex.crowmade.app';
const SHOP_KID = 2;
const DAY = 86400e3;
const SWAPS = 3;                // moving a code to a new computer while all its places are taken: 3 times in 30 days
const enc = new TextEncoder();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// An email subject: one line of plain text, at most 120 characters.
const plain = t => String(t).replace(/[\r\n]+/g, ' ').slice(0, 120);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
const today = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

/* -------------------------------- responses -------------------------------- */
const API_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' };
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...extra } });
// A page of the shop, in Gdex's colours (the Stage theme, light or dark as the device is). Its own strict policy: no
// script but the one it is given (with a fresh nonce), no frames, no forms.
function page(status, title, body, script = '') {
  const nonce = codes.b64u.enc(crypto.getRandomValues(new Uint8Array(16)));
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="robots" content="noindex"><title>${esc(title)}</title><link rel="icon" href="/icons/icon.svg" type="image/svg+xml"><style>
:root{--bg:#120f1a;--card:#231d33;--line:#382f50;--text:#efe9fb;--muted:#a59dbb;--accent:#ff5c8a;--ink:#2a0612;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--bg:#efecf5;--card:#fcfbff;--line:#d5cee5;--text:#1f1830;--muted:#6c6484;--accent:#c3265a;--ink:#fff;color-scheme:light}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:1.0625rem/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:640px;margin:0 auto;padding:40px 16px 64px}h1{font-size:1.6rem;line-height:1.2;margin:0 0 12px}a{color:var(--accent)}.muted{color:var(--muted)}
.brand{font-weight:800;letter-spacing:.14em;display:flex;align-items:center;gap:8px;margin:0 0 20px}.brand i{width:10px;height:10px;border-radius:50%;background:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:18px 0}
textarea{width:100%;font:.95rem/1.5 ui-monospace,Menlo,Consolas,monospace;color:inherit;background:transparent;border:1px solid var(--line);border-radius:10px;padding:10px;resize:vertical;word-break:break-all;field-sizing:content}
button,.btn{display:inline-flex;align-items:center;min-height:44px;font:inherit;font-weight:700;padding:8px 18px;border-radius:10px;border:0;background:var(--accent);color:var(--ink);cursor:pointer;text-decoration:none;margin:8px 8px 0 0}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}p,li{overflow-wrap:anywhere}ol li{margin:6px 0}</style></head><body><main><p class="brand" aria-hidden="true"><i></i>GDEX</p>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex',
      'Content-Security-Policy': `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    },
  });
}
async function readJson(request, max = 8000) {
  const text = await request.text().catch(() => '');
  if (!text || text.length > max) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

/* ---------------------------------- keys ----------------------------------- */
// The shop key, checked once against the public key built into the apps: a key that does not match would make codes no
// app accepts, so the shop stays closed until it is fixed.
const shopKeys = new Map();
function shopKey(env) {
  const text = String(env.LICENCE_SHOP_KEY || '').trim();
  if (!text || !KEYS[SHOP_KID]) return Promise.resolve(null);
  if (!shopKeys.has(text)) shopKeys.set(text, (async () => {
    try { const k = await codes.importPrivate(text, true); if ((await codes.publicOf(k)) !== KEYS[SHOP_KID]) { console.error(`LICENCE_SHOP_KEY is not the key ${SHOP_KID} built into Gdex`); return null; } return codes.importPrivate(text); }
    catch (e) { console.error('LICENCE_SHOP_KEY could not be read: ' + e.message); return null; }
  })());
  return shopKeys.get(text);
}

/* -------------------------------- selling ---------------------------------- */
async function stripeGet(env, path) {
  const r = await fetch('https://api.stripe.com/v1/' + path, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  if (!r.ok) { console.error(`Stripe answered ${r.status} for ${path.split('?')[0]}`); return null; }
  return r.json();
}
const paymentLinks = env => String(env.STRIPE_PAYMENT_LINK || '').split(',').map(x => x.trim()).filter(Boolean);
const selling = env => !!(env.STRIPE_SECRET_KEY && paymentLinks(env).length);
// The payment link's address, when it is one: /buy goes there, and the website's licence is live only with it.
const buyUrl = env => { const u = String(env.BUY_URL || '').trim(); return /^https:\/\/[^/\s]+\/\S*$/.test(u) ? u : ''; };
// The serial comes from the Checkout Session, so the thank-you page, a reload of it and the email all show the same code.
async function refForSession(id) { const h = await sha256('gdex-order|' + id); const serial = new DataView(h.buffer).getUint32(0) || 1; return { serial, ref: codes.refOf(SHOP_KID, serial) }; }
async function licenceForSession(s, env) {
  if (!s || typeof s !== 'object' || !/^cs_(live|test)_[A-Za-z0-9]{10,250}$/.test(String(s.id))) return { error: 'not-found' };
  if (s.status !== 'complete' || !['paid', 'no_payment_required'].includes(s.payment_status)) return { error: 'not-paid' };
  if (!paymentLinks(env).includes(s.payment_link)) return { error: 'not-ours' }; // another product on the same Stripe account
  const key = await shopKey(env); if (!key) return { error: 'not-ready' };
  const d = s.customer_details || {}, name = codes.fitText(d.name || ''), email = String(d.email || '').trim().toLowerCase();
  const mail = enc.encode(email).length <= 64 && /^[^\s@]+@[^\s@]+$/.test(email) ? email : '';
  const { serial, ref } = await refForSession(s.id);
  const code = await codes.signCode(key, SHOP_KID, { serial, name: name || (mail ? '' : 'Gdex customer'), email: mail, issued: today((Number(s.created) || 0) * 1000 || Date.now()) });
  return { code, ref, name, email: email || '', sessionId: s.id };
}

// The cancellation of a code (x:<ref>: { why: 'refund' | 'dispute' | 'owner', at }), or null.
const cancelled = async (env, ref) => (env.LICENCES ? env.LICENCES.get('x:' + ref, 'json') : null);
async function thanks(url, env) {
  const id = url.searchParams.get('session_id') || '';
  const closed = () => page(503, 'The shop is not open yet', '<h1>The shop is not open yet</h1><p>If you have paid, reply to your receipt email and we’ll send your licence code.</p>');
  if (!selling(env)) return closed();
  const s = /^cs_(live|test)_[A-Za-z0-9]{10,250}$/.test(id) ? await stripeGet(env, 'checkout/sessions/' + encodeURIComponent(id)) : null;
  const r = await licenceForSession(s, env);
  if (r.error === 'not-ready') return closed(); // a paid order, but no shop key (or not the one built into Gdex)
  if (r.error === 'not-paid') return page(202, 'Your payment is on its way', `<h1>Your payment is on its way</h1><p>Some ways of paying take a little while to confirm. <a href="/licence/thanks?session_id=${esc(encodeURIComponent(id))}">Reload this page</a> in a minute.${env.RESEND_API_KEY ? ' We’ll also email your licence as soon as the payment is confirmed.' : ''}</p>`);
  if (r.error) return page(404, 'We couldn’t find that order', '<h1>We couldn’t find that order</h1><p>If you have just paid, wait a minute and reload this page. If it still doesn’t work, reply to your receipt email and we’ll send your licence code.</p>');
  const x = await cancelled(env, r.ref); // refunded, disputed or cancelled by the owner: the code is not shown as a licence
  if (x) return page(410, 'This order’s licence no longer works', `<h1>This order’s licence no longer works</h1><p>${x.why === 'refund' ? 'This order was refunded, so its licence code no longer works.' : x.why === 'dispute' ? 'The payment for this order was disputed, so its licence code doesn’t work.' : 'The licence code of this order has been cancelled.'} Questions? Reply to your receipt email.</p>`);
  const who = r.name || r.email, web = await webReady(env), mailed = !!(env.RESEND_API_KEY && r.email);
  return page(200, 'Thank you: here is your Gdex licence', `<h1>Thank you: here is your Gdex licence</h1>
<p>${who ? `Licensed to <b>${esc(who)}</b>. ` : ''}It covers every role on up to 3 of your devices (computers with the desktop app; signing in on the website doesn’t use one).${mailed ? ` We’ve emailed it to you too, at ${esc(r.email)}.` : ' Keep a copy: this page is the only place it is shown.'}</p>
<div class="card"><label for="code" class="muted">Your licence code</label><textarea id="code" rows="8" readonly>${esc(r.code)}</textarea><button id="copy" type="button">Copy the code</button> <span id="copied" class="muted" role="status"></span></div>
${web ? `<p><b>On the website:</b> Settings → About &amp; licence → Sign in, with ${r.email ? `<b>${esc(r.email)}</b>` : 'the email address you paid with'}. Gdex emails you a 6-digit code to type in.</p>
` : ''}<p><b>In the desktop app:</b> Settings → About &amp; licence → Enter licence code, and paste the code. <a href="/download.html">Download Gdex for your computer</a> if you haven’t yet.</p>
<p class="muted">Audiophile stays free for everyone, licence or not. The receipt from Stripe is your proof of purchase. Questions? Reply to ${mailed && env.REPLY_TO ? 'the email your licence comes in' : 'your receipt email'}.</p>`,
  "document.getElementById('copy').onclick=async()=>{const t=document.getElementById('code'),m=document.getElementById('copied');try{await navigator.clipboard.writeText(t.value);m.textContent='Copied.'}catch(e){t.select();m.textContent='Press Ctrl+C (Cmd+C on a Mac) to copy.'}}");
}

// Stripe signs each webhook: header "t=<time>,v1=<HMAC-SHA256 of '<time>.<body>'>". Older than 5 minutes is refused.
async function stripeEvent(request, env) {
  const raw = await request.text(), header = request.headers.get('Stripe-Signature') || '';
  const t = (header.match(/(?:^|,)\s*t=(\d+)/) || [])[1], sigs = [...header.matchAll(/(?:^|,)\s*v1=([0-9a-f]{64})/g)].map(m => m[1]);
  if (!t || !sigs.length || !env.STRIPE_WEBHOOK_SECRET || Math.abs(Date.now() / 1000 - Number(t)) > 300) return null;
  const key = await crypto.subtle.importKey('raw', enc.encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${raw}`)));
  const same = (a, b) => { let d = a.length ^ b.length; for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
  if (!sigs.some(s => same(s, want))) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function webhook(request, env) {
  const ev = await stripeEvent(request, env);
  if (!ev) return json(400, { error: 'bad-signature' });
  const o = (ev.data && ev.data.object) || {};
  if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
    const r = await licenceForSession(o, env);
    if (r.error === 'not-ready') return json(503, { error: 'not-ready' }); // Stripe tries again for up to 3 days
    if (r.error) return json(200, { ignored: r.error });
    if (await cancelled(env, r.ref)) return json(200, { ignored: 'cancelled' }); // Stripe trying again after a refund: no email
    const v = await readCode(r.code); // the website signs in with the buyer's email; a failure here must not stop their email
    if (v && r.email) await linkEmail(env, r.email, v.licence).catch(e => console.error('Could not link the order\'s email: ' + e.message));
    if (env.RESEND_API_KEY && r.email && !(await sendCode(env, r, await webReady(env)))) return json(502, { error: 'email-failed' });
    return json(200, { ok: true, ref: r.ref });
  }
  // A full refund or a dispute cancels the code bought with that payment. A partial refund keeps it. A won dispute is
  // not undone by itself: the owner restores the code from the generator page.
  if ((ev.type === 'charge.refunded' && o.refunded) || ev.type === 'charge.dispute.created') {
    const pi = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent && o.payment_intent.id;
    if (!pi || !/^pi_[A-Za-z0-9]{6,250}$/.test(pi)) return json(200, { ignored: 'no-payment' });
    const list = await stripeGet(env, `checkout/sessions?payment_intent=${encodeURIComponent(pi)}&limit=5`);
    if (!list) return json(502, { error: 'stripe' });
    const why = ev.type === 'charge.refunded' ? 'refund' : 'dispute';
    let n = 0;
    for (const s of list.data || []) if (paymentLinks(env).includes(s.payment_link)) { await env.LICENCES.put('x:' + (await refForSession(s.id)).ref, JSON.stringify({ why, at: Date.now() })); n++; }
    return json(200, { ok: true, cancelled: n });
  }
  return json(200, { ignored: ev.type });
}
// The licence email. Every value in its HTML is escaped; the subject is fixed text.
async function sendCode(env, r, web) {
  const who = r.name ? `${r.name} (${r.email})` : r.email;
  const text = `Thank you for buying Gdex.\n\nLicensed to ${who}. It covers every role on up to 3 of your devices (computers with the desktop app; signing in on the website doesn’t use one).\n\nYour licence code:\n\n${r.code}\n\n${web ? `On the website (${SITE}): Settings → About & licence → Sign in, with this email address. Gdex emails you a 6-digit code to type in.\n\n` : ''}In the desktop app: Settings → About & licence → Enter licence code, and paste the code. Download Gdex for your computer: ${SITE}/download.html\n\nKeep this email: it is your licence.${env.REPLY_TO ? ' Questions? Reply to it.' : ''}\n`;
  const html = `<p>Thank you for buying Gdex.</p><p>Licensed to <b>${esc(r.name || r.email)}</b>${r.name ? ` (${esc(r.email)})` : ''}. It covers every role on up to 3 of your devices (computers with the desktop app; signing in on the website doesn’t use one).</p><p>Your licence code:</p><p style="font:15px/1.5 ui-monospace,Menlo,Consolas,monospace;word-break:break-all;background:#f3eefb;color:#211a2e;padding:12px;border-radius:8px">${esc(r.code)}</p>${web ? `<p><b>On <a href="${SITE}/">the website</a>:</b> Settings → About &amp; licence → Sign in, with this email address. Gdex emails you a 6-digit code to type in.</p>` : ''}<p><b>In the desktop app:</b> Settings → About &amp; licence → Enter licence code, and paste the code. <a href="${SITE}/download.html">Download Gdex for your computer</a>.</p><p>Keep this email: it is your licence.${env.REPLY_TO ? ' Questions? Reply to it.' : ''}</p>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'gdex-licence-' + r.sessionId },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Gdex <licences@gdex.crowmade.app>', to: [r.email], ...(env.REPLY_TO ? { reply_to: env.REPLY_TO } : {}), subject: plain('Your Gdex licence'), text, html }),
  }).catch(() => null);
  if (res && (res.ok || res.status === 409)) return true; // 409: this email was already sent (or is being sent) for this order
  console.error('Resend answered ' + (res ? res.status : 'nothing'));
  return false;
}

/* ------------------------------ 3 devices ------------------------------- */
// A computer running the desktop app is listed by the random ID its install made. Other computers only ever see a short
// tag made from it, so one cannot take another off the list except through a counted swap. Signing in on the website
// takes no place.
const tagOf = async id => codes.b64u.enc(await sha256('gdex-seat|' + id)).slice(0, 12);
const OS = new Set(['Mac', 'Windows', 'Linux']);
const validInstall = v => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
async function readCode(text) { try { const r = await codes.verifyCode(String(text || ''), { keys: KEYS }); return r; } catch { return null; } }
async function seats(env, ref) {
  const rec = await env.LICENCES.get('c:' + ref, 'json').catch(() => null);
  const computers = rec && Array.isArray(rec.computers) ? rec.computers.filter(c => c && validInstall(c.id)) : [];
  return { computers, swaps: rec && Array.isArray(rec.swaps) ? rec.swaps.filter(t => Number.isFinite(t) && Date.now() - t < 30 * DAY) : [] };
}
const shown = computers => Promise.all(computers.map(async c => ({ tag: await tagOf(c.id), os: c.os, added: c.added, seen: c.seen })));

async function activate(request, env) {
  const b = await readJson(request); if (!b || !validInstall(b.install)) return json(400, { error: 'invalid' });
  if (!env.LICENCES) return json(503, { error: 'not-ready' });
  const key = await shopKey(env); if (!key) return json(503, { error: 'not-ready' });
  const r = await readCode(b.code); if (!r) return json(400, { error: 'invalid' });
  if (r.status === 'expired') return json(403, { error: 'expired' });
  if (await env.LICENCES.get('x:' + r.licence.ref)) return json(403, { error: 'cancelled' });
  // A code put on a computer links its email, so the website can sign in with it. A computer already on the list (its
  // weekly check) does not, so Delete my licence records lasts until the person uses the code somewhere new.
  if (r.licence.email && !(await seats(env, r.licence.ref)).computers.some(c => c.id === b.install)) await linkEmail(env, r.licence.email, r.licence);
  return takeSeat(env, key, r.licence.ref, r.licence.seats, b);
}
// Puts the install b.install on the licence's list (b.release: the tag of a computer to move it from when it is full).
async function takeSeat(env, key, ref, max, b) {
  const rec = await seats(env, ref), now = Date.now(), day = today(now);
  let list = rec.computers, changed = false;
  const mine = list.find(c => c.id === b.install);
  if (mine) { if (!mine.seen || now - Date.parse(mine.seen) > 6 * DAY) { mine.seen = day; changed = true; } }
  else {
    if (list.length >= max) {
      const tags = await Promise.all(list.map(c => tagOf(c.id)));
      const i = typeof b.release === 'string' ? tags.indexOf(b.release) : -1;
      if (i < 0) return json(409, { error: 'full', computers: await shown(list), swapsLeft: Math.max(0, SWAPS - rec.swaps.length) });
      if (rec.swaps.length >= SWAPS) return json(429, { error: 'swaps' });
      list = list.filter((_, j) => j !== i); rec.swaps.push(now);
    }
    list.push({ id: b.install, os: OS.has(b.os) ? b.os : 'Computer', added: day, seen: day }); changed = true;
  }
  if (changed) await env.LICENCES.put('c:' + ref, JSON.stringify({ computers: list, swaps: rec.swaps }));
  return json(200, { ok: true, receipt: await codes.signNote('active', key, SHOP_KID, { ref, install: b.install, at: now }), used: list.length, seats: max });
}
async function release(request, env) {
  const b = await readJson(request); if (!b || !validInstall(b.install)) return json(400, { error: 'invalid' });
  if (!env.LICENCES) return json(503, { error: 'not-ready' });
  const r = await readCode(b.code); if (!r) return json(400, { error: 'invalid' });
  const ref = r.licence.ref, rec = await seats(env, ref);
  if (!rec.computers.some(c => c.id === b.install)) return json(404, { error: 'not-listed' });
  await env.LICENCES.put('c:' + ref, JSON.stringify({ computers: rec.computers.filter(c => c.id !== b.install), swaps: rec.swaps }));
  return json(200, { ok: true });
}

/* ------------------------- emails and licences ------------------------- */
// e:<email> → { licences: [{ ref, seats, name, comp, expires }] }: which licences an email address can sign in with.
const cleanEmail = v => { const e = String(v || '').trim().toLowerCase(); return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''; };
async function linkEmail(env, email, lic) {
  email = cleanEmail(email); if (!email || !env.LICENCES || !lic || !lic.ref) return;
  const rec = (await env.LICENCES.get('e:' + email, 'json')) || {}; // a failed read throws: never overwrite the record with less
  const list = Array.isArray(rec.licences) ? rec.licences : [];
  if (list.some(l => l.ref === lic.ref)) return;
  list.push({ ref: lic.ref, seats: lic.seats || 3, name: lic.name || '', comp: !!lic.comp, expires: lic.expires || '' });
  await env.LICENCES.put('e:' + email, JSON.stringify({ licences: list.slice(-20) }));
}
// The licences an email can use now: linked ones that are not cancelled or past their end date. An email with none
// linked is looked up in Stripe too (an order whose webhook never arrived, say), among Gdex's own payment links only.
async function licencesFor(env, email) {
  const rec = await env.LICENCES.get('e:' + email, 'json'); // a storage error becomes a 500, never a 'no licence' answer
  let list = rec && Array.isArray(rec.licences) ? rec.licences : [];
  if (!list.length && email && selling(env)) {
    const sessions = [];
    for (const pl of paymentLinks(env)) { const found = await stripeGet(env, `checkout/sessions?customer_details[email]=${encodeURIComponent(email)}&payment_link=${encodeURIComponent(pl)}&limit=10`); sessions.push(...((found && found.data) || [])); }
    for (const sess of sessions) {
      const r = await licenceForSession(sess, env); if (r.error || cleanEmail(r.email) !== email) continue;
      const v = await readCode(r.code); if (v) { await linkEmail(env, email, v.licence); list = [...list, { ref: v.licence.ref, seats: v.licence.seats, name: v.licence.name, comp: false, expires: '' }]; }
    }
  }
  const out = [];
  for (const l of list) {
    if (l.expires && Date.now() >= Date.parse(l.expires + 'T00:00:00Z') + DAY) continue;
    if (await env.LICENCES.get('x:' + l.ref)) continue;
    out.push(l);
  }
  return out.sort((a, b) => (a.expires ? 1 : 0) - (b.expires ? 1 : 0) || (b.seats || 0) - (a.seats || 0)); // lasting licences first
}
const shownLicence = (l, email) => ({ email, name: l.name || '', ref: l.ref, seats: l.seats || 3, comp: !!l.comp, expires: l.expires || '' });

/* ---------------------------- website sign-in ---------------------------- */
// Once licences are live on the website, a working role there needs a licence after its free days. Someone signs in
// with the email address their licence belongs to: a 6-digit code goes to that address (only if it has a licence, so
// nobody else is emailed), works for 15 minutes and for 5 tries, and becomes a token the page keeps.
const CODE_TTL = 15 * 60e3, CODE_TRIES = 5, CODES_PER_HOUR = 5, CODES_PER_DAY = 4;
// Sign-in emails a day, for everyone together, kept well below Resend's daily quota (100 on its free plan, which Vdex
// may share) so purchase emails always have room. SIGN_IN_EMAILS_PER_DAY raises it on a paid Resend plan.
const emailsPerDay = env => Math.max(1, Number(env.SIGN_IN_EMAILS_PER_DAY) || 30);
// The website's licence is live only when everything a buyer and a signed-in person need is set: the owner's switch
// (WEB_SIGN_IN), the store and the sign-in codes' objects, the emails, a shop key matching key 2, and the shop itself
// (Stripe and its payment link). So a website published before the shop is ready pauses itself, and every role stays
// open.
async function webReady(env) { return env.WEB_SIGN_IN === 'on' && !!env.LICENCES && !!env.SIGNIN && !!env.RESEND_API_KEY && selling(env) && !!buyUrl(env) && !!(await shopKey(env)); }
// A sign-in token names who signed in: the email address a licence belongs to.
const identityKey = v => 'e:' + v.email;
const identityOf = v => ({ email: v.email });
async function webToken(env, token) {
  const v = await codes.readNote('web', token, { keys: KEYS, signers: [SHOP_KID] });
  if (!(v && cleanEmail(v.email) && /^\d{1,3}:\d{1,10}$/.test(String(v.ref)))) return null;
  // Deleted records (Delete my licence records): a sign-in made before the deletion no longer works anywhere.
  if (env.LICENCES) { const z = await env.LICENCES.get(await forgotKey(identityKey(v)), 'json').catch(() => null); if (z && !(Number(v.iat) > z.at)) return null; }
  return v;
}
// Only a scrambled form of the identity is kept for this, never the email address itself.
const forgotKey = async ikey => 'z:' + hex(await sha256('gdex-forgot|' + ikey));
// Delete my licence records (Settings → About & licence): what the server keeps about this sign-in's email address goes:
// its links to its licences and any sign-in code (when codes were sent that day stays, without anything else, so a
// deletion cannot reset the limits). The computers on the licence stay (a random number per install, nothing about the
// person): clearing them would free its 3 places without a counted move, and each would put itself back at its weekly
// check anyway; Release this computer takes one off. Every sign-in made before now stops working; signing in again
// makes the records afresh. A cancellation stays, so a refunded licence cannot come back this way. Stripe and Link keep
// their own records of a purchase.
async function webForget(request, env) {
  const b = await readJson(request), v = b && (await webToken(env, b.token));
  if (!v) return json(401, { error: 'signed-out' });
  if (!env.LICENCES) return json(503, { error: 'not-ready' });
  const ikey = identityKey(v), rec = (await env.LICENCES.get(ikey, 'json')) || {};
  const list = Array.isArray(rec.licences) ? rec.licences : [];
  const emails = new Set([v.email, ...list.map(l => l.email)].map(cleanEmail).filter(Boolean));
  for (const e of emails) { await env.LICENCES.delete('e:' + e); await signIn(env, e, { op: 'forget' }); }
  await env.LICENCES.delete(ikey);
  await env.LICENCES.put(await forgotKey(ikey), JSON.stringify({ at: Date.now() }), { expirationTtl: 400 * 86400 });
  return json(200, { ok: true });
}
async function webStart(request, env) {
  if (!(await webReady(env))) return json(503, { error: 'not-ready' });
  const b = await readJson(request); if (!b) return json(400, { error: 'invalid' });
  let email = cleanEmail(b.email), fromCode = false;
  if (b.code) { // a licence code instead of an email: sign in with the email inside it
    const r = await readCode(b.code); if (!r || r.status !== 'valid') return json(400, { error: 'invalid-code' });
    email = cleanEmail(r.licence.email); if (!email) return json(400, { error: 'no-email' });
    if (!(await env.LICENCES.get('x:' + r.licence.ref))) await linkEmail(env, email, r.licence);
    fromCode = true;
  }
  if (!email) return json(400, { error: 'invalid-email' });
  // The day's limit is checked before anything about the address, so it says nothing about who has a licence.
  const dayKey = 'm:' + today(), usedToday = Number(await env.LICENCES.get(dayKey)) || 0;
  if (usedToday >= emailsPerDay(env)) return json(503, { error: 'busy' });
  if ((await licencesFor(env, email)).length) {
    const sent = await sendCodeTo(env, email, usedToday);
    if (sent === 'email-failed') return json(502, { error: 'email-failed' });
  }
  // The same answer whether or not the email has a licence. With a code, the email it holds (whoever has the code can
  // read it anyway).
  return json(200, { ok: true, ...(fromCode ? { email } : {}) });
}
// Whether one more code may go to an address that was sent codes at these times: at most 5 an hour and 4 a day (so
// nobody can flood an inbox, or use up the day's emails alone).
const codeLeft = (sent, now) => sent.filter(t => now - t < 3600e3).length < CODES_PER_HOUR && sent.filter(t => today(t) === today(now)).length < CODES_PER_DAY;
// An email address's sign-in code (scrambled), its tries, and when codes were sent to it, kept by a Durable Object of
// its own (SIGNIN in wrangler.jsonc, one per address) rather than in KV. KV cannot change a value without a race: each
// of many guesses sent at the same moment read the tries before any other wrote them back, so all of them reached the
// code. A Durable Object takes its requests one at a time, so every guess and every code asked for is counted. What it
// keeps goes a day after the last code was sent.
export class SignInCodes {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const b = await request.json().catch(() => ({}));
    return Response.json(await this.ctx.blockConcurrencyWhile(() => this.answer(b))); // the next request waits for this one
  }
  async answer(b) {
    const store = this.ctx.storage, now = Date.now(), rec = (await store.get('rec')) || {};
    const sent = (Array.isArray(rec.sent) ? rec.sent : []).filter(t => Number.isFinite(t) && now - t < DAY);
    if (b.op === 'issue') { // { h, salt }: a new code in place of the last one, if the address has one left today
      if (!codeLeft(sent, now)) return { limited: true };
      await store.put('rec', { h: b.h, salt: b.salt, exp: now + CODE_TTL, tries: 0, sent: [...sent, now] });
      await store.setAlarm(now + DAY);
      return { ok: true };
    }
    if (b.op === 'check') { // { email, code }: right, wrong or no code to check, each try counted
      if (!rec.h || now > rec.exp || (rec.tries || 0) >= CODE_TRIES) return { ok: false };
      const right = hex(await sha256(`${rec.salt}|${b.email}|${b.code}`)) === rec.h;
      await store.put('rec', right ? { sent } : { ...rec, tries: (rec.tries || 0) + 1 }); // a code works once
      return { ok: right };
    }
    if (b.op === 'forget') { // Delete my licence records: the code and its tries go; when codes were sent stays for its
      // day, without anything else, so a deletion cannot reset the limits (and the alarm still clears it)
      if (sent.length) await store.put('rec', { sent }); else await store.deleteAll();
      return { ok: true };
    }
    return { error: 'op' };
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}
const signIn = async (env, email, body) => (await env.SIGNIN.get(env.SIGNIN.idFromName(email)).fetch('https://sign-in/', { method: 'POST', body: JSON.stringify(body) })).json();
// A 6-digit code to an address, if it has one left (codeLeft): otherwise 'limited' and no email, and outside the same
// answer as 'ok'. The day's limit for everyone is the caller's to check first.
async function sendCodeTo(env, email, usedToday) {
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const salt = codes.b64u.enc(crypto.getRandomValues(new Uint8Array(12)));
  if (!(await signIn(env, email, { op: 'issue', h: hex(await sha256(`${salt}|${email}|${code}`)), salt })).ok) return 'limited';
  if (!(await sendSignIn(env, email, code))) return 'email-failed';
  await env.LICENCES.put('m:' + today(), String(usedToday + 1), { expirationTtl: 2 * 86400 }).catch(e => console.error('Could not count a sign-in email: ' + e.message)); // a count, not a lock
  return 'ok';
}
// Is this the code sent to the address? One answer for every failure (no code sent, run out, wrong, too many tries),
// so it says nothing about who has a licence. A code works once, and for 5 tries.
const checkCode = async (env, email, code) => (await signIn(env, email, { op: 'check', email, code })).ok === true;
async function webVerify(request, env) {
  if (!(await webReady(env))) return json(503, { error: 'not-ready' });
  const b = await readJson(request), email = cleanEmail(b && b.email), code = String((b && b.code) || '').replace(/\D/g, '');
  if (!email || code.length !== 6) return json(400, { error: 'invalid' });
  if (!(await checkCode(env, email, code))) return json(400, { error: 'wrong-code' });
  const list = await licencesFor(env, email); if (!list.length) return json(403, { error: 'no-licence' });
  const token = await codes.signNote('web', await shopKey(env), SHOP_KID, { email, ref: list[0].ref, iat: Date.now() });
  return json(200, { ok: true, token, licence: shownLicence(list[0], email) });
}
// About once a day: is the signed-in licence still good? Answers with a new token when it moved to another licence.
async function webCheck(request, env) {
  const b = await readJson(request), v = b && (await webToken(env, b.token));
  if (!v) return json(401, { error: 'signed-out' });
  if (!env.LICENCES) return json(503, { error: 'not-ready' });
  const list = await licencesFor(env, v.email), l = list.find(x => x.ref === v.ref) || list[0];
  if (!l) return json(403, { error: (await env.LICENCES.get('x:' + v.ref)) ? 'cancelled' : (await endedFor(env, v)) ? 'expired' : 'signed-out' });
  const fresh = l.ref === v.ref ? null : await codes.signNote('web', await shopKey(env), SHOP_KID, { ...identityOf(v), ref: l.ref, iat: Date.now() });
  return json(200, { ok: true, licence: shownLicence(l, v.email), ...(fresh ? { token: fresh } : {}) });
}
// Whether the token's licence is still linked but past its end date (a free licence given until a date).
async function endedFor(env, v) {
  const rec = await env.LICENCES.get(identityKey(v), 'json').catch(() => null), l = rec && Array.isArray(rec.licences) && rec.licences.find(x => x.ref === v.ref);
  return !!(l && l.expires && Date.now() >= Date.parse(l.expires + 'T00:00:00Z') + DAY);
}
// The sign-in email. The address is escaped in the HTML; the subject holds only the six digits.
async function sendSignIn(env, email, code) {
  const text = `Your code to sign in to Gdex is ${code}\n\nUse it within 15 minutes, to sign in as ${email}. If you didn’t ask for it, ignore this email: nobody can sign in without this code.\n`;
  const html = `<p>Your code to sign in to Gdex is</p><p style="font:28px/1.2 ui-monospace,Menlo,Consolas,monospace;letter-spacing:4px;font-weight:700">${esc(code)}</p><p>Use it within 15 minutes, to sign in as ${esc(email)}. If you didn’t ask for it, ignore this email: nobody can sign in without this code.</p>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Gdex <licences@gdex.crowmade.app>', to: [email], ...(env.REPLY_TO ? { reply_to: env.REPLY_TO } : {}), subject: plain(`${code} is your Gdex sign-in code`), text, html }),
  }).catch(() => null);
  if (res && res.ok) return true;
  console.error('Resend answered ' + (res ? res.status : 'nothing') + ' for a sign-in code');
  return false;
}

/* ------------------------------ the owner ------------------------------- */
// Requests from the generator page, signed with the owner's key (1, or the spare 9) and good for 10 minutes.
async function admin(request, env) {
  const b = await readJson(request);
  const v = b && (await codes.readNote('admin', b, { keys: KEYS, signers: codes.OWNER_KIDS }));
  if (!v) return json(403, { error: 'not-signed' }, CORS);
  if (!Number.isFinite(v.at) || Math.abs(Date.now() - v.at) > 10 * 60e3) return json(403, { error: 'stale', now: Date.now() }, CORS);
  if (!/^\d{1,3}:\d{1,10}$/.test(String(v.ref))) return json(400, { error: 'bad-ref' }, CORS);
  if (!env.LICENCES) return json(503, { error: 'not-ready' }, CORS);
  const ref = v.ref;
  if (v.op === 'clear') await env.LICENCES.delete('c:' + ref);
  else if (v.op === 'cancel') await env.LICENCES.put('x:' + ref, JSON.stringify({ why: 'owner', at: Date.now() }));
  else if (v.op === 'restore') await env.LICENCES.delete('x:' + ref);
  else if (v.op === 'link') { // a free code's email, so its owner can sign in on the website
    const r = await readCode(v.code);
    if (!r || r.licence.ref !== ref || !cleanEmail(r.licence.email)) return json(400, { error: 'bad-code' }, CORS);
    await linkEmail(env, r.licence.email, r.licence);
  } else if (v.op !== 'look') return json(400, { error: 'bad-op' }, CORS);
  const rec = await seats(env, ref), x = await env.LICENCES.get('x:' + ref, 'json').catch(() => null);
  return json(200, { ok: true, ref, computers: await shown(rec.computers), swaps: rec.swaps.length, cancelled: x || null }, CORS);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), p = url.pathname, m = request.method;
    try {
      if (p === '/buy') {
        const to = buyUrl(env);
        if (m === 'GET' && to) return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });
        return page(200, 'Gdex licence', `<h1>The Gdex licence is not on sale yet</h1><p>It will cost ${PRICE} USD once, for up to 3 of your own devices. Until then every role is free: <a href="/index.html">open Gdex</a>.</p>`);
      }
      if (p === '/licence/price' && m === 'GET') {
        // Cloudflare says which country the request comes from; the page shows that country's total, if it has one.
        const country = /^[A-Z]{2}$/.test(String(request.cf && request.cf.country)) ? request.cf.country : '';
        return json(200, { price: PRICE.toFixed(2), currency: 'USD', country, taxed: withTax(country) });
      }
      if (p === '/licence/thanks' && m === 'GET') return await thanks(url, env);
      if (p === '/licence/stripe-webhook' && m === 'POST') return await webhook(request, env);
      if (p === '/licence/activate' && m === 'POST') return await activate(request, env);
      if (p === '/licence/release' && m === 'POST') return await release(request, env);
      if (p === '/licence/web/status' && m === 'GET') return json(200, { on: await webReady(env) }, { 'Cache-Control': 'public, max-age=300' });
      if (p === '/licence/web/start' && m === 'POST') return await webStart(request, env);
      if (p === '/licence/web/verify' && m === 'POST') return await webVerify(request, env);
      if (p === '/licence/web/check' && m === 'POST') return await webCheck(request, env);
      if (p === '/licence/web/forget' && m === 'POST') return await webForget(request, env);
      if (p === '/licence/admin') return m === 'OPTIONS' ? new Response(null, { status: 204, headers: CORS }) : m === 'POST' ? await admin(request, env) : json(405, { error: 'method' }, CORS);
      if (p.startsWith('/licence/')) return json(404, { error: 'not-found' });
    } catch (e) {
      console.error(e && e.stack || e);
      return p.startsWith('/licence/') && p !== '/licence/thanks' ? json(500, { error: 'server' }) : page(500, 'Something went wrong', '<h1>Something went wrong</h1><p>Try again in a minute.</p>');
    }
    return env.ASSETS.fetch(request);
  },
};
export { licenceForSession, refForSession, tagOf, cleanEmail, esc, plain, codeLeft };
