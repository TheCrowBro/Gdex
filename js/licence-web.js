// The website's licence: what only the licence server can say (tourbook.crowmade.app's Worker, cloudflare/worker.mjs, on
// this page's own origin). Loaded only where the licence is live (js/licence-config.js), so a copy of Tourbook anywhere else
// sends nothing. The server's contract is the build spec §3.9.
//   status      whether the owner has paused the licence (only a fresh JSON { on: false } pauses; no answer is "on"),
//               asked at most every 6 hours and only while it matters: a working role in use, the free days started,
//               or a sign-in (an Audiophile whose free days have not started, by its own use or from a Drive copy
//               or a backup file, sends nothing)
//   sign-in     the email address the licence was bought with: the server emails a 6-digit code, and this browser keeps
//               the signed token it gets back (js/licence-state.js checks its signature)
//   check       the sign-in confirmed about once a day; a refund or a cancellation signs it out
// Every write goes through js/licence-state.js (changeLicence), which tells the page.
import { changeLicence, serverTime, firstRunSettled, setLicenceState, licenceNow } from './licence-state.js';
import { roleId, roleNeedsLicence } from './roles.js';

const KEY = 'tourbook-licence';
const DAY = 864e5;
const STATUS_EVERY = 6 * 3600e3;   // the status, at most this often
const CHECK_EVERY = DAY;           // a sign-in, confirmed about once a day
const now = () => Date.now();
const num = x => (Number.isFinite(Number(x)) ? Number(x) : 0);
const told = () => { setLicenceState(); return licenceNow(); }; // the state as it is now, without writing anything
const read = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && typeof s === 'object' ? s : {}; } catch { return {}; } };

// One request to the licence server, 15 seconds at most. answered: the body was JSON, so it is the licence server's own
// answer (a captive portal's or a firewall's page never signs anyone out or pauses anything). The Date header of such an
// answer is the server's time, which corrects a device clock that was wound on ([S-38]).
async function call(path, body) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15e3);
  try {
    const r = await fetch(path.startsWith('/') ? path : '/licence/web/' + path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: ctl.signal }
      : { cache: 'no-store', signal: ctl.signal });
    const b = await r.json().catch(() => null);
    const answered = !!b && typeof b === 'object';
    if (answered) { const d = Date.parse(r.headers.get('date') || ''); if (Number.isFinite(d)) serverTime(d); }
    return { status: r.status, body: answered ? b : {}, answered };
  } finally { clearTimeout(t); }
}

// Whether the status is worth asking ([S-43]).
const matters = s => (roleNeedsLicence(roleId()) && firstRunSettled()) || num(s.first) > 0 || !!s.token;

// Is the licence on (not paused by the owner)? on and statusAt are written only from a JSON 200 answer.
export async function status(force = false) {
  const s = read(), t = now();
  if (!force && !matters(s)) return;
  if (!force && num(s.statusAt) && t - num(s.statusAt) < STATUS_EVERY && t >= num(s.statusAt)) return;
  try {
    const r = await call('status');
    if (r.status === 200 && r.answered) changeLicence(x => { x.on = r.body.on !== false; x.statusAt = now(); });
  } catch { /* offline: keep what was known */ }
}

// Only when the licence server itself says so.
function signedOut(why) {
  changeLicence(x => { delete x.token; delete x.via; if (why === 'cancelled') x.cancelled = true; if (why === 'expired') x.expired = true; else delete x.licence; });
}

// The price with tax where this browser is (the server answers from the request's country), for the Buy buttons.
export async function localPrice() {
  try { const r = await call('/licence/price'); return r.status === 200 && r.answered ? r.body : null; } catch { return null; }
}
// The shop, in a new tab.
export async function buy() { window.open('/buy', '_blank', 'noopener'); return true; }

// Step 1: the email address (or a licence code with an email address inside). The server answers the same either way.
export async function start({ email, code } = {}) {
  let r; try { r = await call('start', code ? { code } : { email }); } catch { return { error: 'Tourbook could not reach the sign-in server. Check the internet connection and try again.' }; }
  const b = r.body;
  if (r.status === 200 && b.ok) return { ok: true, email: b.email || '' };
  return { error: { 'invalid-email': 'That email address does not look right.', 'invalid-code': 'That licence code is not valid, or has ended.', 'no-email': 'That licence code has no email address in it. Sign in with the email address your licence belongs to, or ask us to add one.', 'email-failed': 'The email could not be sent just now. Try again in a minute.', busy: 'Tourbook has sent as many sign-in emails as it can today. Please try again tomorrow.', 'not-ready': 'Signing in is not available yet.' }[b.error] || 'Something went wrong. Try again.' };
}
// Step 2: the 6-digit code. Answers the state, or { error }.
export async function verify(email, code) {
  let r; try { r = await call('verify', { email, code }); } catch { return { error: 'Tourbook could not reach the sign-in server. Check the internet connection and try again.' }; }
  const b = r.body;
  if (r.status !== 200 || !b.token || !b.licence) return { error: { 'wrong-code': 'That code is not right, or has run out (a code works for 15 minutes and 5 tries). Check it, or send a new one.', 'no-licence': 'No licence is linked to this email address. Use the one your licence belongs to, or buy a licence.', 'not-ready': 'Signing in is not available yet.' }[b.error] || 'Something went wrong. Try again.' };
  return changeLicence(x => { x.token = b.token; x.licence = b.licence; x.via = 'email'; x.checked = x.tried = now(); delete x.cancelled; delete x.expired; });
}

// In the background about once a day, and Try again (force): the status, then the sign-in's check.
export async function recheck(force = false) {
  await status(force);
  const s = read(), t = now();
  if (!s.token) return told();
  if (force || t - num(s.checked) > CHECK_EVERY || t < num(s.checked)) {
    try {
      const r = await call('check', { token: s.token });
      if (r.status === 200 && r.body.ok) changeLicence(x => { x.checked = x.tried = now(); if (r.body.licence && typeof r.body.licence === 'object') x.licence = r.body.licence; if (r.body.token) x.token = r.body.token; });
      else if (r.answered && (r.status === 401 || r.status === 403) && ['signed-out', 'cancelled', 'expired'].includes(r.body.error)) signedOut(r.body.error);
      else changeLicence(x => { x.tried = now(); }); // no answer, or not the licence server's: tried again later
    } catch { changeLicence(x => { x.tried = now(); }); }
  }
  return told();
}

// Sign out on this browser (a website sign-in takes no device place, so nothing goes back to the server).
export async function release() {
  return changeLicence(x => { delete x.token; delete x.licence; delete x.via; delete x.cancelled; delete x.expired; });
}

// Delete my licence records: the server forgets this sign-in's email address (its links and sign-in codes; the
// licence's computers stay on its list), and every sign-in made before now stops working. Then this browser is signed
// out.
export async function forget() {
  const s = read(); if (!s.token) return { error: 'Sign in first: the records are found through your sign-in.' };
  let r; try { r = await call('forget', { token: s.token }); } catch { return { error: 'Tourbook could not reach the licence server. Check the internet connection and try again.' }; }
  if (!(r.status === 200 && r.body.ok) && !(r.answered && r.status === 401)) return { error: 'The records could not be deleted just now. Try again in a minute.' };
  return release();
}

let started = false;
// js/licence-state.js calls this once, where the licence is live: the status 1.5 s after the page has opened (when it
// matters), then the sign-in's daily check.
export function startWebLicence() {
  if (started) return;
  started = true;
  setTimeout(() => { status(false).then(() => recheck(false)).catch(() => {}); }, 1500);
}
