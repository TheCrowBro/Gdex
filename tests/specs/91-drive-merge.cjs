// Google Drive's merge (the build spec [S-17]-[S-21]): times seen and takes joined entry by entry and their tombstones
// kept; two devices logging at once both keep their entries; Replace everywhere with entries reaching the other device
// and staying; no ping-pong (two devices with their records, or one act's times seen, in different orders write nothing
// once they agree); a
// copy taken in is never pushed straight back; duplicate gdex-db.json files merged and the extra deleted; a Vdex file
// in Drive refused; a copy deleted in Drive meanwhile made again; Google Drive's errors in words, with the
// connection coming back; and ties (the same time, different contents) settled alike on every device, the sample's
// stand-in profile included; and Replace everywhere reading Drive first (another device's records it had not taken in
// are replaced too; with no internet nothing is replaced and the chooser says why); and a shared copy Gdex can't read
// (the daily copy still saved, and Put this device's copy in its place keeping the bad one and the daily copies). Uses
// 90-drive's fake Drive and device opener.
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
  await pa.click(`${sheetOf('Bring back a backup')} .se-imp-replace`); // the confirm is accepted, once Drive has been read
  await pa.waitForSelector(sheetOf('Bring back a backup'), { state: 'detached', timeout: 10000 }).catch(() => {});
  await closeSheets(pa);
  const lost = d => ({ seen: d.acts.find(a => a.id === 'm-act').seen.map(x => x.id).sort().join(), takes: d.logs.find(l => l.id === 'm-log').takes.map(x => x.id).sort().join() });
  ok('the device that replaced lost the time seen and the take the backup lacks', JSON.stringify(lost(await data(pa))) === JSON.stringify({ seen: 'm1,m3,m4', takes: 'k1,k3,k4' }), JSON.stringify(lost(await data(pa))));
  ok('…with a tombstone for each', !!(await until(() => { const d = D.json(); return d.deleted.m2 > 0 && d.deleted.k2 > 0 && lost(d).seen === 'm1,m3,m4'; })));
  await syncOn(pb);
  ok('…and after both sync, the other device has lost them too', JSON.stringify(lost(await data(pb))) === JSON.stringify({ seen: 'm1,m3,m4', takes: 'k1,k3,k4' }), JSON.stringify(lost(await data(pb))));
  await syncOn(pa); await syncOn(pb); await syncOn(pa);
  ok('…and they do not come back on the next round', lost(await data(pa)).seen === 'm1,m3,m4' && lost(await data(pb)).takes === 'k1,k3,k4' && lost(D.json()).seen === 'm1,m3,m4');

  // the same act changed on both devices in the same millisecond: each lists the joined times seen in its own order,
  // and the two still agree (comparing in order would have them write each other's copy at every sync)
  const tie = Date.now();
  const logAt = (p, id) => p.evaluate(([t, x]) => import('./js/store.js').then(s => s.update(d => { const a = d.acts.find(r => r.id === 'm-act'); a.seen = [...a.seen, { id: x, date: '2026-10-03', rating: 70 }]; a.updatedAt = t; })), [tie, id]);
  await logAt(pa, 'm5'); await logAt(pb, 'm6');
  await sleep(1500); // their timed syncs
  await syncOn(pa); await syncOn(pb); await syncOn(pa);
  const seenOf = async p => (await data(p)).acts.find(a => a.id === 'm-act').seen.map(x => x.id).join();
  const w1 = D.writes();
  await syncOn(pa); await syncOn(pb); await syncOn(pa); await syncOn(pb);
  const tied = { a: await seenOf(pa), b: await seenOf(pb), writes: D.writes() - w1 };
  ok('two changes to one act in the same millisecond: both devices keep both times seen, and once they agree nothing is written', [tied.a, tied.b].every(x => x.split(',').sort().join() === 'm1,m3,m4,m5,m6') && tied.writes === 0, JSON.stringify(tied));

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

  /* ------------------------------ ties: the same time, different contents ------------------------------ */
  // Two copies of the same time that differ go the same way on every device; otherwise each keeps its own and writes it
  // back at every sync. The sample's stand-in profile and an empty one carry no time of their own at all.
  {
    const unit = await pa.evaluate(() => import('./js/store.js').then(s => {
      const base = s.normalise({}), T = Date.now();
      const v = notes => ({ ...base, venues: [{ id: 'tv', name: 'Tie', notes, updatedAt: T }] });
      const x = v('from one'), y = v('from two');
      return [s.mergeDb(x, y).venues[0].notes, s.mergeDb(y, x).venues[0].notes];
    }));
    ok('mergeDb settles a tie the same way whichever copy is this device’s', unit[0] === unit[1], JSON.stringify(unit));
    const D3 = fakeDrive();
    const P = await device(browser, D3, { who: 'P', sample: true }); all.push(P);
    const Q = await device(browser, D3, { who: 'Q' }); all.push(Q);
    await connect(P.page); await waitCloud(P.page, 'synced'); await closeSheets(P.page);
    await connect(Q.page); await waitCloud(Q.page, 'synced'); await closeSheets(Q.page);
    await syncOn(P.page);
    const names = async () => [(await data(P.page)).profile.name, (await data(Q.page)).profile.name, D3.json().profile.name].join(' | ');
    let w = D3.writes();
    for (let i = 0; i < 3; i++) { await syncOn(P.page); await syncOn(Q.page); }
    ok('the sample’s stand-in profile on one device and an empty one on the other: the stand-in on both while the sample is there, and syncing writes nothing', (await names()) === 'Sample Producer | Sample Producer | Sample Producer' && D3.writes() === w, `${await names()}; ${D3.writes() - w} writes`);
    await Q.page.evaluate(() => import('./js/pages/settings.js').then(m => m.removeSample()));
    await until(() => D3.json().profile.name === '');
    await syncOn(P.page); await syncOn(Q.page); await syncOn(P.page);
    w = D3.writes();
    for (let i = 0; i < 2; i++) { await syncOn(P.page); await syncOn(Q.page); }
    ok('…and Remove the sample on one device clears the stand-in on both, for good', (await names()) === ' |  | ' && !(await data(P.page)).bookings.some(b => b.sample) && D3.writes() === w, `${await names()}; ${D3.writes() - w} writes`);
    const T = Date.now() + 10;
    const tieOn = (page, notes) => page.evaluate(([t, n]) => import('./js/store.js').then(s => s.update(d => { d.venues.push({ id: 'tie-v', name: 'Tied', notes: n, updatedAt: t }); })), [T, notes]);
    await tieOn(P.page, 'from P'); await tieOn(Q.page, 'from Q');
    await sleep(1500); // their timed syncs
    await syncOn(P.page); await syncOn(Q.page); await syncOn(P.page);
    w = D3.writes();
    for (let i = 0; i < 3; i++) { await syncOn(P.page); await syncOn(Q.page); }
    const tv = async p => ((await data(p)).venues.find(v => v.id === 'tie-v') || {}).notes;
    ok('a record made on two devices in the same millisecond with different contents settles on one copy, and syncing then writes nothing', (await tv(P.page)) === (await tv(Q.page)) && !!(await tv(P.page)) && D3.writes() === w, `${await tv(P.page)} | ${await tv(Q.page)}; ${D3.writes() - w} writes`);
  }

  /* ------------------------------ Replace everywhere reads Drive first ------------------------------ */
  // Drive can hold records this device has not taken in yet (another device's, made since this one last synced). Replace
  // takes them in first, so they are replaced too and every device ends up like the backup; when Drive can't be read,
  // nothing is replaced and the chooser says why.
  {
    const D4 = fakeDrive();
    const R = await device(browser, D4, { who: 'R' }); all.push(R);
    const S2 = await device(browser, D4, { who: 'S' }); all.push(S2);
    const pr = R.page, ps = S2.page, chooser = sheetOf('Bring back a backup');
    await pr.evaluate(() => import('./js/store.js').then(s => s.upsert('venues', { id: 'v-kept', name: 'Kept venue' })));
    await connect(pr); await waitCloud(pr, 'synced'); await closeSheets(pr);
    await connect(ps); await waitCloud(ps, 'synced'); await closeSheets(ps);
    const file = Buffer.from(JSON.stringify(await data(pr))); // a backup saved now
    await ps.evaluate(() => import('./js/store.js').then(s => s.upsert('venues', { id: 'v-since', name: 'Added on the other device since' })));
    ok('(the other device’s new venue is in Drive; this device has not synced since)', !!(await until(() => D4.json().venues.some(v => v.id === 'v-since'))) && !(await data(pr)).venues.some(v => v.id === 'v-since'));
    const pick = async () => {
      await openBackups(pr);
      await pr.setInputFiles(`${sheetOf('Backups')} .se-bk-input`, { name: 'gdex-backup-saved.json', mimeType: 'application/json', buffer: file });
      await pr.waitForSelector(`${chooser} .se-imp-replace`, { timeout: 10000 });
    };
    // no internet: nothing is replaced, and the chooser says why
    R.allow.push(/ERR_FAILED/);
    D4.fail = { abort: true, keep: true, match: r => r.who === 'R' };
    await pick();
    const note = await pr.locator(`${chooser} .se-imp-replace-note`).innerText();
    ok('with Drive linked, the note says what a device that has not synced keeps', /Every device connected to this Google Drive ends up exactly like this backup, and anything added since is gone from all of them, except what another device has not copied to Drive yet \(a phone that is offline, say\)\./.test(note), note);
    const venuesBefore = (await data(pr)).venues.map(v => v.id).sort().join();
    await pr.click(`${chooser} .se-imp-replace`);
    await pr.waitForSelector(`${chooser} .se-imp-err:not([hidden])`, { timeout: 10000 }).catch(() => {});
    const errText = await pr.locator(`${chooser} .se-imp-err`).innerText().catch(() => '');
    ok('Replace with no internet replaces nothing and says why, in the chooser', (await pr.locator(chooser).count()) === 1 && /^Nothing was replaced yet: Gdex reads your Google Drive first, so that every device ends up like this backup\. Can’t reach Google Drive \(no internet\?\)\./.test(errText) && (await data(pr)).venues.map(v => v.id).sort().join() === venuesBefore, errText);
    D4.fail = null;
    R.allow.pop();
    // back online: Replace takes in Drive's records first, then replaces them too
    if (!(await pr.locator(chooser).count())) await pick();
    await pr.click(`${chooser} .se-imp-replace`); // the confirm is accepted
    await pr.waitForSelector(chooser, { state: 'detached', timeout: 10000 }).catch(() => {});
    await closeSheets(pr);
    await sleep(1500); await syncOn(pr); await syncOn(ps); await syncOn(pr);
    const ids = async p => (await data(p)).venues.map(v => v.id).sort().join();
    ok('Replace everywhere also replaces what another device had put in Drive since this one last synced: every device ends up like the backup', (await ids(pr)) === 'v-kept' && (await ids(ps)) === 'v-kept' && D4.json().venues.map(v => v.id).join() === 'v-kept', `${await ids(pr)} | ${await ids(ps)} | ${D4.json().venues.map(v => v.id).join()}`);
    await R.ctx.close(); await S2.ctx.close();
  }

  /* ------------------------------ a shared copy Gdex can't read ------------------------------ */
  // The daily copies carry on from this device's data, and the card offers to put this device's copy in its place,
  // keeping the unreadable one aside and every daily copy.
  {
    const D6 = fakeDrive();
    const U = await device(browser, D6, { who: 'U' }); all.push(U);
    const pu = U.page;
    await pu.evaluate(() => import('./js/store.js').then(s => s.upsert('bookings', { id: 'u-old', kind: 'show', date: '2026-12-01', title: 'Before' })));
    await connect(pu); await waitCloud(pu, 'synced'); await closeSheets(pu);
    const wkName = `gdex-backup-${['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()]}.json`;
    await until(() => D6.named(wkName).length);
    const bad = '{"app":"gdex","bookings":[{"id":"u-old","title":"Bef'; // cut short
    D6.named('gdex-db.json')[0].body = bad;
    await pu.evaluate(() => localStorage.removeItem('gdex-backup-cloud')); // a new day's first sync
    await pu.evaluate(() => import('./js/store.js').then(s => s.upsert('bookings', { id: 'u-new', kind: 'show', date: '2026-12-02', title: 'Made today' })));
    await sleep(1200); await syncOn(pu);
    const st = await state(pu);
    ok('(the shared copy can’t be read: the sync stops and says so, and leaves it alone)', st.status === 'error' && /isn’t a Gdex file, so Gdex left it alone/.test(st.error) && D6.named('gdex-db.json')[0].body === bad, st.error);
    ok('…but today’s copy is still saved, from this device', JSON.parse(D6.named(wkName)[0].body).bookings.some(b => b.id === 'u-new') && !st.backupError, JSON.parse(D6.named(wkName)[0].body).bookings.map(b => b.id).join());
    await openBackups(pu);
    const cardU = pu.locator(`${sheetOf('Backups')} .se-bk-drive`);
    ok('…and the card offers to put this device’s copy in its place', (await cardU.locator('.se-bk-drive-fix').count()) === 1 && (await cardU.locator('.se-bk-drive-fix').innerText()) === 'Put this device’s copy in its place…' && /Today’s copy: saved at/.test(await cardU.innerText()));
    const copies = D6.files.filter(f => /^gdex-backup-/.test(f.name)).length;
    await pu.click(`${sheetOf('Backups')} .se-bk-drive-fix`); // the confirm is accepted
    await waitCloud(pu, 'synced');
    const today = await pu.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    const aside = D6.named(`gdex-db-unreadable-${today}.json`);
    ok('Put this device’s copy in its place: Drive’s copy is this device’s, the unreadable one is kept aside, and every daily copy stays', D6.json().bookings.some(b => b.id === 'u-new') && aside.length === 1 && aside[0].body === bad && D6.files.filter(f => /^gdex-backup-/.test(f.name)).length === copies && (await state(pu)).status === 'synced', D6.files.map(f => f.name).join(' '));
    ok('…and the card no longer offers it', (await cardU.locator('.se-bk-drive-fix').count()) === 0);
    await closeSheets(pu);
    await U.ctx.close();
  }

  const errs = all.flatMap(d => d.errors.map(e => `${d.who}: ${e}`));
  ok('no errors in the console', errs.length === 0, errs.slice(0, 5).join(' | '));
  await browser.close();
})().catch(e => { console.log('FAIL drive-merge crashed — ' + (e && e.stack || e)); process.exit(1); });
