// Google Drive's merge (the build spec [S-17]-[S-21]): times seen and takes joined entry by entry and their tombstones
// kept; two devices logging at once both keep their entries; Replace everywhere with entries reaching the other device
// and staying; no ping-pong (two devices with their records in different orders write nothing once they agree); a
// copy taken in is never pushed straight back; duplicate gdex-db.json files merged and the extra deleted; a Vdex file
// in Drive refused; a copy deleted in Drive meanwhile made again; and Google Drive's errors in words, with the
// connection coming back. Uses 90-drive's fake Drive and device opener.
const { chromium } = require('playwright');
const { ok, sleep } = require('../helpers.cjs');
const { fakeDrive, device, connect, closeSheets, openBackups, state, syncOn, data, until, sheetOf, waitCloud, cloudState } = require('./90-drive.cjs');

(async () => {
  const browser = await chromium.launch();
  const all = [];

  /* ------------------------------ mergeDb, entry by entry ------------------------------ */
  const D = fakeDrive();
  const A = await device(browser, D, { who: 'A' }); all.push(A);
  const pa = A.page;
  const m = await pa.evaluate(() => import('./js/store.js').then(s => {
    const T = Date.now() - 60000, base = s.normalise({});
    const e = id => ({ id, date: '2026-10-01', rating: 70 }), t = id => ({ id, n: 1, at: T });
    const db = (u, seen, takes, deleted = {}) => ({ ...base, deleted, acts: [{ id: 'x-act', name: 'Joiner', updatedAt: T + u, seen: seen.map(e) }], logs: [{ id: 'x-log', title: 'Log', updatedAt: T + u, takes: takes.map(t) }] });
    const ids = d => ({ seen: d.acts[0].seen.map(x => x.id).join(), takes: d.logs[0].takes.map(x => x.id).join(), u: d.acts[0].updatedAt - T });
    const L = db(10, ['e1', 'e2'], ['t1', 't2']), R = db(20, ['e1', 'e3'], ['t1', 't3']);
    const before = JSON.stringify([L, R]);
    const out = { join: ids(s.mergeDb(L, R)), other: ids(s.mergeDb(R, L)) };
    out.untouched = JSON.stringify([L, R]) === before;
    out.dead = ids(s.mergeDb(L, db(20, ['e1', 'e3'], ['t1', 't3'], { e2: T + 15, t2: T + 15 })));
    out.later = ids(s.mergeDb(db(10, ['e1', 'e2'], ['t1', 't2']), db(5, ['e1'], ['t1'], { e2: T + 12, t2: T + 12 })));
    out.earlier = ids(s.mergeDb(db(10, ['e1', 'e2'], ['t1', 't2']), db(5, ['e1'], ['t1'], { e2: T + 8, t2: T + 8 })));
    // other records still follow their newer copy as a whole
    const v = (u, name) => ({ ...base, venues: [{ id: 'v1', name, updatedAt: T + u }] });
    out.venue = s.mergeDb(v(10, 'Old'), v(20, 'New')).venues[0].name + '/' + s.mergeDb(v(20, 'New'), v(10, 'Old')).venues[0].name;
    return out;
  }));
  ok('mergeDb joins times seen and takes from two copies: the newer copy wins and keeps the older one’s other entries', m.join.seen === 'e1,e3,e2' && m.join.takes === 't1,t3,t2' && m.join.u === 20, JSON.stringify(m.join));
  ok('…whichever side is this device', m.other.seen === 'e1,e3,e2' && m.other.takes === 't1,t3,t2', JSON.stringify(m.other));
  ok('…without changing either copy in place', m.untouched);
  ok('…and an entry deleted on either device stays deleted (its tombstone)', m.dead.seen === 'e1,e3' && m.dead.takes === 't1,t3', JSON.stringify(m.dead));
  ok('…as does one of the newer copy deleted after that copy’s last change', m.later.seen === 'e1' && m.later.takes === 't1', JSON.stringify(m.later));
  ok('…while one changed after its deletion stays, as a record does', m.earlier.seen === 'e1,e2' && m.earlier.takes === 't1,t2', JSON.stringify(m.earlier));
  ok('every other record still follows its newer copy', m.venue === 'New/New', m.venue);

  /* ------------------------------ two devices, entries on both ------------------------------ */
  const T0 = Date.now();
  await pa.evaluate(t => import('./js/store.js').then(s => {
    s.upsert('acts', { id: 'm-act', name: 'The Mergers', seen: [{ id: 'm1', date: '2026-09-01', rating: 80 }, { id: 'm2', date: '2026-09-15', rating: 75 }] });
    s.upsert('logs', { id: 'm-log', title: 'Merge session', date: '2026-09-02', startedAt: t, takes: [{ id: 'k1', n: 1, at: t }, { id: 'k2', n: 2, at: t + 1000 }] });
  }), T0);
  await connect(pa); await waitCloud(pa, 'synced'); await closeSheets(pa);
  const B = await device(browser, D, { who: 'B' }); all.push(B);
  const pb = B.page;
  await pb.evaluate(() => import('./js/store.js').then(s => s.upsert('acts', { id: 'b-own', name: 'Only On B At First' })));
  await connect(pb); await waitCloud(pb, 'synced'); await closeSheets(pb);
  await syncOn(pa);
  ok('(both devices hold the act with two times seen and the log with two takes)', (await data(pb)).acts.find(a => a.id === 'm-act').seen.length === 2 && (await data(pa)).acts.some(a => a.id === 'b-own'));

  // both log at once, between two syncs
  await pa.evaluate(() => import('./js/store.js').then(s => s.update(d => { const a = d.acts.find(x => x.id === 'm-act'); a.seen = [...a.seen, { id: 'm3', date: '2026-10-01', rating: 82 }]; a.updatedAt = Date.now(); const l = d.logs.find(x => x.id === 'm-log'); l.takes = [...l.takes, { id: 'k3', n: 3, at: Date.now() }]; l.updatedAt = Date.now(); })));
  await pb.evaluate(() => import('./js/store.js').then(s => s.update(d => { const a = d.acts.find(x => x.id === 'm-act'); a.seen = [...a.seen, { id: 'm4', date: '2026-10-02', rating: 64 }]; a.updatedAt = Date.now(); const l = d.logs.find(x => x.id === 'm-log'); l.takes = [...l.takes, { id: 'k4', n: 4, at: Date.now() }]; l.updatedAt = Date.now(); })));
  await sleep(1500); // their timed syncs
  await syncOn(pa); await syncOn(pb); await syncOn(pa);
  const both = async p => { const d = await data(p); return d.acts.find(a => a.id === 'm-act').seen.map(x => x.id).sort().join() + ' / ' + d.logs.find(l => l.id === 'm-log').takes.map(x => x.id).sort().join(); };
  ok('two devices logging the same act and take log at once both keep every entry', (await both(pa)) === 'm1,m2,m3,m4 / k1,k2,k3,k4' && (await both(pb)) === 'm1,m2,m3,m4 / k1,k2,k3,k4', `${await both(pa)} | ${await both(pb)}`);

  // no ping-pong: the two devices list their records in different orders, and once they agree nothing is written
  const order = async p => (await data(p)).acts.map(a => a.id).join();
  const w0 = D.writes();
  await syncOn(pa); await syncOn(pb); await syncOn(pa); await syncOn(pb);
  ok('two syncs with no change write nothing, even with the records in a different order on each device', D.writes() === w0 && (await order(pa)) !== (await order(pb)), `${D.writes() - w0} writes; ${await order(pa)} | ${await order(pb)}`);

  // a copy taken in is not pushed back
  await pa.evaluate(() => import('./js/store.js').then(s => s.upsert('songs', { id: 'a-song', title: 'From A' })));
  await until(() => (D.json().songs || []).some(x => x.id === 'a-song'));
  await sleep(300);
  const wb = D.writes('B');
  await syncOn(pb);
  await sleep(1500);
  ok('what a sync takes in is not pushed straight back (no write, no timed sync after it)', (await data(pb)).songs.some(x => x.id === 'a-song') && D.writes('B') === wb, `${D.writes('B') - wb} writes`);

  /* ------------------------------ Replace everywhere, with entries ([S-19]) ------------------------------ */
  const backup = await data(pa);
  { const a = backup.acts.find(x => x.id === 'm-act'); a.seen = a.seen.filter(x => x.id !== 'm2'); const l = backup.logs.find(x => x.id === 'm-log'); l.takes = l.takes.filter(x => x.id !== 'k2'); }
  await openBackups(pa);
  await pa.setInputFiles(`${sheetOf('Backups')} .se-bk-input`, { name: 'gdex-backup-older.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await pa.waitForSelector(`${sheetOf('Bring back a backup')} .se-imp-replace`, { timeout: 10000 });
  ok('with Drive linked, Replace says it reaches every connected device', /Every device connected to this Google Drive ends up exactly like this backup/.test(await pa.locator(`${sheetOf('Bring back a backup')} .se-imp-replace-note`).innerText()));
  await pa.click(`${sheetOf('Bring back a backup')} .se-imp-replace`); // the confirm is accepted
  await closeSheets(pa);
  const lost = d => ({ seen: d.acts.find(a => a.id === 'm-act').seen.map(x => x.id).sort().join(), takes: d.logs.find(l => l.id === 'm-log').takes.map(x => x.id).sort().join() });
  ok('the device that replaced lost the time seen and the take the backup lacks', JSON.stringify(lost(await data(pa))) === JSON.stringify({ seen: 'm1,m3,m4', takes: 'k1,k3,k4' }), JSON.stringify(lost(await data(pa))));
  ok('…with a tombstone for each', !!(await until(() => { const d = D.json(); return d.deleted.m2 > 0 && d.deleted.k2 > 0 && lost(d).seen === 'm1,m3,m4'; })));
  await syncOn(pb);
  ok('…and after both sync, the other device has lost them too', JSON.stringify(lost(await data(pb))) === JSON.stringify({ seen: 'm1,m3,m4', takes: 'k1,k3,k4' }), JSON.stringify(lost(await data(pb))));
  await syncOn(pa); await syncOn(pb); await syncOn(pa);
  ok('…and they do not come back on the next round', lost(await data(pa)).seen === 'm1,m3,m4' && lost(await data(pb)).takes === 'k1,k3,k4' && lost(D.json()).seen === 'm1,m3,m4');

  /* ------------------------------ duplicates, a Vdex file, a copy deleted meanwhile ------------------------------ */
  const oldest = D.named('gdex-db.json')[0].id;
  const dup = D.json(); dup.acts.push({ id: 'dup-act', name: 'From The Other File', updatedAt: Date.now() }); D.put('gdex-db.json', dup);
  ok('(Drive holds two gdex-db.json files, as when two devices link at the same moment)', D.named('gdex-db.json').length === 2);
  await syncOn(pa);
  ok('a sync merges the extra gdex-db.json into the oldest and deletes it', (await data(pa)).acts.some(a => a.id === 'dup-act') && D.named('gdex-db.json').length === 1 && D.named('gdex-db.json')[0].id === oldest && D.json().acts.some(a => a.id === 'dup-act'));

  const good = D.named('gdex-db.json')[0].body, mine = JSON.stringify(await data(pa));
  D.named('gdex-db.json')[0].body = JSON.stringify({ version: 3, bookings: [{ id: 'v1', title: 'Wedding shoot' }], gear: [{ id: 'g1', name: 'FX3' }], crew: [{ id: 'c1', name: 'Cam Op' }] });
  const vdexBody = D.named('gdex-db.json')[0].body;
  await syncOn(pa);
  const vs = await state(pa);
  ok('a Vdex file in Drive is refused, said in words, and left alone', vs.status === 'error' && /is a Vdex file, not a Gdex one/.test(vs.error) && D.named('gdex-db.json')[0].body === vdexBody && JSON.stringify(await data(pa)) === mine, vs.error);
  D.named('gdex-db.json')[0].body = good;
  await syncOn(pa);
  ok('…and syncing carries on once it is Gdex’s again', (await state(pa)).status === 'synced');

  A.allow.push(/status of 404/);
  D.drop(D.named('gdex-db.json')[0].id);
  const made = await pa.evaluate(() => import('./js/drive.js').then(async d => { localStorage.setItem('gdex-drive-file', 'gone-id'); await d.driveAdapter().write('{"app":"gdex","bookings":[],"songs":[]}'); return localStorage.getItem('gdex-drive-file'); }));
  A.allow.pop();
  ok('a copy deleted in Drive meanwhile (404) is looked for again, then made', D.named('gdex-db.json').length === 1 && D.named('gdex-db.json')[0].id === made && made !== 'gone-id');
  await syncOn(pa);
  ok('…and the next sync fills it from this device', D.json().acts.some(a => a.id === 'm-act'));

  /* ------------------------------ Google Drive's errors, in words ------------------------------ */
  A.allow.push(/ERR_FAILED/);
  D.fail = { abort: true, keep: true, match: r => r.who === 'A' };
  await syncOn(pa);
  const off = await state(pa);
  ok('no connection: said plainly, and the changes are safe here', off.status === 'error' && off.error === 'Can’t reach Google Drive (no internet?). Gdex tries again when you’re back online.', off.error);
  await openBackups(pa);
  ok('…in the card too', /Can’t reach Google Drive \(no internet\?\)\. Gdex tries again when you’re back online\. Your changes are safe on this device\./.test(await pa.locator(`${sheetOf('Backups')} .se-bk-drive`).innerText()));
  D.fail = null;
  A.allow.pop();
  await pa.evaluate(() => window.dispatchEvent(new Event('online')));
  ok('…and it syncs again by itself when the connection comes back', await waitCloud(pa, 'synced'));
  A.allow.push(/status of 403/);
  D.fail = { status: 403, reason: 'storageQuotaExceeded', match: r => r.who === 'A' && r.method === 'PATCH' };
  await pa.evaluate(() => import('./js/store.js').then(s => s.upsert('songs', { id: 'a-full', title: 'No Room' })));
  await until(async () => (await state(pa)).status === 'error');
  ok('a full Drive is said in words', (await state(pa)).error === 'Your Google Drive is full: free up space, then tap Sync now.' && (await cloudState(pa)).join() === 'error,Not synced');
  A.allow.pop();
  await pa.click(`${sheetOf('Backups')} .se-bk-drive-sync`);
  await waitCloud(pa, 'synced');
  A.allow.push(/status of 429/);
  D.fail = { status: 429, reason: 'rateLimitExceeded', match: r => r.who === 'A' };
  await syncOn(pa);
  ok('Google’s rate limit is said in words', (await state(pa)).error === 'Google Drive is busy: Gdex will try again in a minute.');
  A.allow.pop();
  await closeSheets(pa);

  const errs = all.flatMap(d => d.errors.map(e => `${d.who}: ${e}`));
  ok('no errors in the console', errs.length === 0, errs.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL drive-merge crashed — ' + (e && e.stack || e)); process.exit(1); });
