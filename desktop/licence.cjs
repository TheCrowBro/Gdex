// The desktop app's licence: Gdex's working roles are free for 30 days on this computer, counted from the first time
// one is used here (the page asks start() then), and after that need a licence code (bought for 20 USD, or a free one
// from the owner). The Audiophile role never needs one; the page decides which role is in use (js/licence-state.js),
// so "read-only" here means "the paid roles and sections may not change things". A code covers up to 3 computers: the
// first time a code is used on a computer, Gdex activates it online at gdex.crowmade.app, which keeps a list of the
// computers using each code (a random ID made for this install and "Mac", "Windows" or "Linux"; nothing about the
// person or the hardware). After that Gdex checks about once a week that this computer is still on the list, and needs
// the internet at least once every 90 days.
//
// Everything else is decided here, offline: the code's signature, the free-day count, and what the page may do.
//
// Licences are switched on only by a build with both desktop/licence-on.json { "on": true } and the owner's public keys
// in desktop/licence-keys.json (the build spec [S-41]). Until then the state is "off": nobody is asked anything and
// nothing is sent to the licence server. Unlike Vdex there are no "early users" kept free for good ([S-7]): a later
// version with licences on starts everyone at "free days not started".
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const codes = require('./licence-codes.cjs');
const KEYS = require('./licence-keys.json');
const ON = require('./licence-on.json');

const TRIAL_DAYS = 30;
const DAY = 86400e3, HOUR = 3600e3;
const RECHECK = 7 * DAY;          // a licensed computer confirms it is still on the code's list about once a week
const OFFLINE_LIMIT = 90 * DAY;   // and has to reach the internet at least once in 90 days
const PENDING_LIMIT = 14 * DAY;   // a code entered with no connection works for 14 days before it must be activated
const EARLIEST = Date.UTC(2026, 0, 1); // no free days started before Gdex had a licence
const SITE = 'https://gdex.crowmade.app';
const OS = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };

const MESSAGES = {
  cancelled: 'This code has been cancelled, for example after a refund. If you think that is a mistake, reply to the email your code came in.',
  swaps: 'This code has been moved between devices 3 times in the last 30 days, so it cannot move again yet. Reply to the email your code came in and we will sort it out.',
  invalid: 'The licence server does not recognise this code. Check you copied all of it, or reply to the email your code came in.',
  vdex: 'This is a Vdex licence code. Gdex has its own licence: buy one at gdex.crowmade.app.',
  off: 'This version of Gdex does not use licence codes yet: every role is free.',
  offline: 'Gdex could not reach the licence server. Connect to the internet and try again, so the code can be used on another computer.',
};
// A Vdex code pasted into Gdex (its own prefix, and no Gdex code beside it).
const looksVdex = text => /(^|[^0-9A-Z])VDEX-[0-9A-Z]/i.test(text) && !/(^|[^0-9A-Z])GDEX-[0-9A-Z]/i.test(text);

// `mirror` keeps a copy of when the free days started outside licence.json, in the desktop app's own window-state
// file, so deleting licence.json does not start them again; and likewise `graceFrom`, when this computer's 14 days for
// a code the licence server has not said yes to began.
const NO_MIRROR = { get: () => null, set: () => {} };
function createLicence({ dir, keys = KEYS, on = ON.on === true, now = () => Date.now(), post, site = SITE, os = OS[process.platform] || 'Computer', mirror = NO_MIRROR, onChange = () => {} }) {
  const file = path.join(dir, 'licence.json');
  // On only with the switch and the owner's key 1 (the generator always makes keys 1, 2 and 9 together).
  const enabled = on === true && !!keys && typeof keys[1] === 'string' && keys[1].length > 0;
  const read = () => { try { const s = JSON.parse(fs.readFileSync(file, 'utf8')); return s && typeof s === 'object' ? s : {}; } catch { return {}; } };
  const write = s => { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(s)); fs.renameSync(file + '.tmp', file); } catch { /* a read-only disk: carry on */ } };
  const mirrored = s => ({ first: s.first, seen: s.seen, ...(s.graceFrom ? { graceFrom: s.graceFrom } : {}) });
  const keep = s => { write(s); const m = mirror.get(); if (s.first || s.graceFrom || (m && m.graceFrom)) mirror.set(mirrored(s)); };
  const receiptOk = new Map(); // a receipt's signature -> whether it is good for this code and computer (checked once per run)
  let last = '';

  // licence.json as stored, joined with the mirror (licence.json lost: the same free days as before) and with `seen`,
  // the latest time ever seen, moved on (so winding the clock back gains no free days).
  function load() {
    const s = read(), t = now();
    let dirty = false;
    if (!s.install) { s.install = codes.b64u.enc(globalThis.crypto.getRandomValues(new Uint8Array(16))); dirty = true; }
    if ('founder' in s) { delete s.founder; dirty = true; } // never a Gdex state ([S-7])
    const m = mirror.get();
    if (m && Number.isFinite(m.first) && m.first > 0 && (!s.first || m.first < s.first)) { s.first = m.first; dirty = true; }
    if (m && Number.isFinite(m.seen) && m.seen > (s.seen || 0)) { s.seen = m.seen; dirty = true; }
    if (m && Number.isFinite(m.graceFrom) && m.graceFrom > 0 && (!s.graceFrom || m.graceFrom < s.graceFrom)) { s.graceFrom = m.graceFrom; dirty = true; }
    if (t > (s.seen || 0) + 60e3 || !s.seen) { s.seen = Math.max(s.seen || 0, t); dirty = true; }
    if (dirty) keep(s);
    return s;
  }

  // The licence as the page sees it. Never throws.
  async function state() {
    const s = load(), t = now();
    const r = await check(s), good = !!r && !!s.act && s.act.status === 'active' && (await goodReceipt(s, r.licence));
    const out = describe(s, r, t, good);
    const sig = JSON.stringify(out); if (sig !== last) { last = sig; onChange(out); }
    return out;
  }
  async function check(s, at = s.seen) {
    if (!s.code) return null;
    try { return await codes.verifyCode(s.code, { keys, now: at }); } catch { return null; } // a code no longer accepted (its key retired): back to the free days
  }
  async function goodReceipt(s, lic) {
    const r = s.act && s.act.receipt; if (!r || !r.sig) return false;
    const k = JSON.stringify([r.kid, r.data, r.sig, lic.ref, s.install]);
    if (!receiptOk.has(k)) receiptOk.set(k, codes.readNote('active', r, { keys }).then(v => !!v && v.ref === lic.ref && v.install === s.install));
    return receiptOk.get(k);
  }
  const clamp = n => Math.max(0, Math.min(TRIAL_DAYS, n));
  function describe(s, r, t, good) {
    const base = { kind: 'desktop', enabled, buyUrl: site + '/buy', os, seats: codes.SEATS };
    if (!enabled) return { ...base, mode: 'off', canEdit: true, started: false, first: 0, trialLeft: TRIAL_DAYS, trialEnds: '', licence: null };
    const started = !!s.first;
    // A wrong clock ([S-38]): the free days began more than a day ahead of the device's time, or Gdex has seen a time
    // more than two days ahead of it. The days left count as none until the clock is right (or a server time puts the
    // record right, serverTime below); a working licence is not affected.
    const clock = started && (s.first > t + DAY || (s.seen || 0) > t + 2 * DAY);
    const left = !started ? TRIAL_DAYS : clock ? 0 : clamp(TRIAL_DAYS - Math.floor(((s.seen || 0) - s.first) / DAY));
    const trial = { started, first: s.first || 0, trialLeft: started ? clamp(TRIAL_DAYS - Math.floor(((s.seen || 0) - s.first) / DAY)) : TRIAL_DAYS, trialEnds: started ? new Date(s.first + TRIAL_DAYS * DAY).toISOString().slice(0, 10) : '' };
    if (!r) {
      if (!started) return { ...base, ...trial, licence: null, mode: 'unstarted', canEdit: true };
      if (clock) return { ...base, ...trial, licence: null, mode: 'clock', canEdit: false };
      return { ...base, ...trial, licence: null, mode: left > 0 ? 'trial' : 'ended', canEdit: left > 0 };
    }
    const l = r.licence, licence = { name: l.name, email: l.email, comp: l.comp, ref: l.ref, issued: l.issued, expires: l.expires, seats: l.seats };
    if (r.status === 'expired') return { ...base, ...trial, licence, mode: 'expired', canEdit: left > 0 };
    const a = s.act || {};
    if (a.status === 'cancelled') return { ...base, ...trial, licence, mode: 'cancelled', canEdit: left > 0 };
    if (a.status === 'released') return { ...base, ...trial, licence, mode: 'released', canEdit: left > 0 };
    // Past a limit, Gdex turns read-only only once a check made after the limit has failed, so someone opening Gdex
    // after a long break is not shown read-only while it is still checking. Both limits count with the latest time
    // seen, as the free days do, so winding the clock back gains nothing.
    const at = Math.max(t, s.seen || 0);
    if (a.status === 'active' && good) {
      if (at - (a.checked || 0) > OFFLINE_LIMIT && (a.tried || 0) > (a.checked || 0) + OFFLINE_LIMIT) return { ...base, ...trial, licence, mode: 'offline', canEdit: false };
      return { ...base, ...trial, licence, mode: 'licensed', canEdit: true };
    }
    const waited = Math.max(0, at - (s.enteredAt || at)), daysLeft = Math.max(0, Math.ceil((PENDING_LIMIT - waited) / DAY));
    const failedSince = (a.tried || 0) > (s.enteredAt || 0) + PENDING_LIMIT;
    return { ...base, ...trial, licence, mode: 'pending', daysLeft, canEdit: daysLeft > 0 || left > 0 || !failedSince };
  }

  // Starts the 30 free days now (the page asks when a paid role or section is first used here). Nothing while licences
  // are off, or once they have started.
  async function start() {
    if (!enabled) return state();
    const s = load();
    if (!s.first) { const t = now(); s.first = t; s.seen = t; keep(s); }
    return state();
  }
  // An earlier start from another device on the same Google Drive ([S-39]): taken when it is a real time (from 1
  // January 2026 to a day ahead) and earlier than this computer's own start, or there is none yet.
  async function adopt(t) {
    t = Number(t);
    if (enabled && Number.isFinite(t) && t >= EARLIEST && t <= now() + DAY) {
      const s = load();
      if (!s.first || t < s.first) { s.first = t; s.seen = Math.max(s.seen || 0, t); keep(s); }
    }
    return state();
  }
  // The licence server's time (the Date header of its JSON answers) puts a wound clock right ([S-38]): when the stored
  // start or the latest time seen is ahead of it, the days already used are kept and the rest move back with the
  // clock, so frozen days are not given back; otherwise it only moves `seen` on.
  function serverTime(T) {
    T = Number(T);
    if (!enabled || !Number.isFinite(T) || T < EARLIEST) return;
    const s = load();
    if (s.first && (s.first > T + DAY || (s.seen || 0) > T + 2 * DAY)) {
      const elapsed = Math.max(0, (s.seen || 0) - s.first);
      s.first = T - elapsed; s.seen = T;
      // the mirror is set rather than joined here: it holds the same wrong values
      write(s); mirror.set(mirrored(s));
      return;
    }
    if (!s.first && (s.seen || 0) > T + 2 * DAY) s.seen = T;
    else if (T > (s.seen || 0)) s.seen = T;
    else return;
    keep(s);
  }
  const timed = res => { if (res && res.date) serverTime(res.date); return res; };

  // Asks the licence server to put this computer on the code's list. { ok, receipt } | { full, computers } |
  // { cancelled } | { swaps } | { invalid } | { offline } (with answered: true when the server did answer, unusably).
  async function activate(code, install, release) {
    let res;
    try { res = timed(await post(site + '/licence/activate', { code, install, os, ...(release ? { release } : {}) })); } catch { return { offline: true }; }
    const b = (res && res.body) || {};
    if (res.status === 200 && b.receipt) {
      const v = await codes.readNote('active', b.receipt, { keys });
      const r = await check({ code, seen: now() });
      return v && r && v.ref === r.licence.ref && v.install === install ? { ok: true, receipt: b.receipt } : { offline: true, answered: true }; // an answer we cannot trust counts as no answer
    }
    if (b.error === 'full') return { full: true, computers: Array.isArray(b.computers) ? b.computers.slice(0, 20) : [], swapsLeft: b.swapsLeft };
    if (b.error === 'cancelled' || b.error === 'swaps' || b.error === 'invalid') return { [b.error]: true };
    return { offline: true, answered: true }; // the server is down, not set up yet, or says the code has ended
  }
  const active = (receipt, t) => ({ status: 'active', receipt, checked: t, tried: t });

  // Checks a pasted code and activates it on this computer. Returns the new state, or { error } / { error: 'full', computers }.
  // A code the licence server cannot be asked about (no internet, or gdex.crowmade.app blocked) works for 14 days, once
  // on this computer: they count from `graceFrom`, which Remove the code keeps, so entering the same code again, or
  // another one, starts no new 14 days. Only the server's yes for this computer (the code activated) clears it.
  async function enter(text, { release } = {}) {
    text = String(text || '').slice(0, 4000);
    if (looksVdex(text)) return { error: MESSAGES.vdex };
    if (!enabled) return { error: MESSAGES.off };
    let r;
    try { r = await codes.verifyCode(text, { keys, now: now() }); } catch (e) { return { error: e.message || 'This code is not valid.' }; }
    if (r.status === 'expired') return { error: 'expired', expires: r.licence.expires }; // the page writes the date as it writes dates
    const code = r.licence.code, install = load().install;
    const a = await activate(code, install, typeof release === 'string' ? release.slice(0, 64) : '');
    if (a.full) return { error: 'full', computers: a.computers, swapsLeft: a.swapsLeft, seats: r.licence.seats };
    for (const k of ['cancelled', 'swaps', 'invalid']) if (a[k]) return { error: MESSAGES[k] };
    const s2 = read(), t = now(), at = Math.max(t, s2.seen || 0);
    if (s2.code !== code) { s2.code = code; s2.enteredAt = a.ok ? t : s2.graceFrom || at; s2.act = {}; }
    if (a.ok) { s2.act = active(a.receipt, t); delete s2.graceFrom; }
    else {
      // a failed try is stamped with the latest time seen and never moves back, so a clock wound back undoes no limit
      s2.act = { ...(s2.act || {}), tried: Math.max((s2.act && s2.act.tried) || 0, at), answered: !!a.answered };
      if (!s2.act.status && !s2.graceFrom) s2.graceFrom = s2.enteredAt || at; // pending: its 14 days are this computer's one go
    }
    keep(s2);
    return { ...(await state()), offline: !a.ok };
  }

  // Background check: a licensed computer about once a week; one that cannot get through, about once an hour until it
  // does; one moved off the list, cancelled, or answered with an error, once a day. A code past its end date is not
  // checked at all. `force` checks now (the page's "Try again").
  async function recheck(force = false) {
    const s = read(); if (!enabled || !s.code) return state();
    const a = s.act || {}, t = now(), r = await check(s, Math.max(s.seen || 0, t));
    if (!r || r.status === 'expired') return state();
    let due;
    if (force || t < (a.tried || 0) || t < (a.checked || 0)) due = true; // asked to, or the clock went back
    else if (a.status === 'active') due = t - (a.checked || 0) > RECHECK && t - (a.tried || 0) > (a.answered ? DAY : HOUR);
    else due = t - (a.tried || 0) > (a.status || a.answered ? DAY : HOUR);
    if (!due) return state();
    const res = await activate(s.code, s.install, '');
    const s2 = read(); if (s2.code !== s.code) return state(); // changed while we waited
    const t2 = now(), at2 = Math.max(t2, s2.seen || 0);
    if (res.ok) { s2.act = active(res.receipt, t2); delete s2.graceFrom; }
    else if (res.full) s2.act = { status: 'released', tried: t2 };
    else if (res.cancelled) s2.act = { status: 'cancelled', tried: t2 };
    else s2.act = { ...a, tried: Math.max(a.tried || 0, at2), answered: !!res.answered }; // offline, or an answer to look at again later (never moved back)
    keep(s2);
    return state();
  }

  // Takes the code off this computer, freeing its place for another one. Needs the internet, except when the
  // computer was never on the list. `graceFrom` stays: a code entered again with no internet has no new 14 days.
  async function release() {
    // While licences are off nothing is asked of the licence server ([S-9], spec §0.3), not even to free a place a code
    // took under an earlier version with licences on: the code stays here, untouched.
    if (!enabled) return state();
    const s = read(); if (!s.code) return state();
    const listed = s.act && (s.act.status === 'active' || s.act.status === 'released');
    if (listed) {
      let res; try { res = timed(await post(site + '/licence/release', { code: s.code, install: s.install })); } catch { res = null; }
      if (!res || (res.status !== 200 && res.status !== 404)) return { error: MESSAGES.offline };
    }
    const s2 = read(); delete s2.code; delete s2.act; delete s2.enteredAt; write(s2);
    return state();
  }
  const code = () => read().code || '';

  return { state, start, adopt, serverTime, enter, recheck, release, code, file, enabled };
}

// The Date header of an answer whose body is JSON (the licence server's own), in ms; 0 for anything else ([S-38]).
const dateOf = (r, json) => (json ? Date.parse(r.headers.get('date') || '') || 0 : 0);

// POST JSON with Chromium's network stack (it uses the system's proxy settings), giving up after 15 seconds.
function netPost(url, body) {
  const { net } = require('electron');
  return net.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15e3) })
    .then(async r => { let b = {}, json = false; try { b = JSON.parse(await r.text()); json = true; } catch { /* not the licence server's answer */ } return { status: r.status, body: b && typeof b === 'object' ? b : {}, date: dateOf(r, json) }; });
}

// The price with tax where this computer is (GET /licence/price: the server answers from the request's country), for
// the Buy button. Only the shape the page uses is passed on; anything else, or no answer within 10 seconds, is null.
function netPrice(url) {
  const { net } = require('electron');
  return net.fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10e3) }).then(async r => {
    if (!r.ok) return null;
    let b; try { b = JSON.parse(await r.text()); } catch { return null; }
    return b && typeof b === 'object' ? { ...b, date: dateOf(r, true) } : null; // no answer (offline, or an error): the page asks again later
  }).catch(() => null);
}
const priceShape = b => {
  if (!b || typeof b !== 'object') return null;
  const t = b.taxed;
  return { taxed: t && typeof t === 'object' ? { place: String(t.place || '').slice(0, 40), tax: String(t.tax || '').slice(0, 8), rate: Number(t.rate) || 0, total: String(t.total || '').slice(0, 10) } : null };
};

// Called from main.cjs before the window opens. `open` opens an address in the web browser (main.cjs's, which a test
// run records instead); `post` and `price` stand in for the network in specs.
function wireLicence({ ipcMain, fromApp, getWindow, open, dir, mirror, site, keys, on, post = netPost, price = netPrice }) {
  const send = s => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send('licence:changed', s); };
  const lic = createLicence({ dir, post, mirror: mirror || NO_MIRROR, onChange: send, ...(site ? { site } : {}), ...(keys ? { keys } : {}), ...(on !== undefined ? { on } : {}) });
  const guard = fn => (e, ...args) => (fromApp(e) ? fn(...args) : { error: 'refused' });
  ipcMain.handle('licence:state', guard(() => lic.state()));
  ipcMain.handle('licence:start', guard(() => lic.start()));
  ipcMain.handle('licence:adopt', guard(t => lic.adopt(Number(t))));
  ipcMain.handle('licence:enter', guard((text, opts) => lic.enter(text, opts && typeof opts === 'object' ? { release: opts.release } : {})));
  ipcMain.handle('licence:recheck', guard(() => lic.recheck(true)));
  ipcMain.handle('licence:release', guard(() => lic.release()));
  ipcMain.handle('licence:code', guard(() => lic.code()));
  ipcMain.handle('licence:buy', guard(() => { open((site || SITE) + '/buy'); return true; }));
  // Nothing is asked of the licence server while licences are off (the build spec §0.3), not even the price.
  ipcMain.handle('licence:price', guard(async () => {
    if (!lic.enabled) return null;
    const b = await price((site || SITE) + '/licence/price');
    if (b && b.date) lic.serverTime(b.date);
    return priceShape(b);
  }));
  lic.state().catch(() => {});
  const tick = () => lic.recheck(false).catch(() => {});
  const first = setTimeout(tick, 1500); // straight away, so a computer back after a long break is confirmed before anyone notices
  const hourly = setInterval(tick, HOUR);
  if (first.unref) first.unref(); if (hourly.unref) hourly.unref();
  return lic;
}

module.exports = { createLicence, wireLicence, TRIAL_DAYS, RECHECK, OFFLINE_LIMIT, PENDING_LIMIT, SITE, MESSAGES };
