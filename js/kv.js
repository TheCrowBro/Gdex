// The IndexedDB database `tourbook` version 1, store `kv`: the linked file's handle (`fileHandle`, js/backup.js) and the
// second copy of the free days (`licence-days`, js/licence-state.js). Whoever raises the version changes it here only.
// Every call rejects where IndexedDB is missing or blocked (a private window, blocked site data): callers catch.

/* ---- from Gdex (decisions §19; js/from-gdex.js copies localStorage, and says how to drop both) ---- */
// When `tourbook` is first made, the old database `gdex` (store `kv`) of the time the app was called Gdex is copied
// into it once, before anything reads it: each entry whose key `tourbook` lacks; `gdex` itself is left as it is and
// is never made where it does not exist. Every failure only skips the copy, quietly.
let copied = Promise.resolve();
const fromGdex = d => new Promise(done => {
  const end = () => done();
  try {
    const r = indexedDB.open('gdex');
    r.onupgradeneeded = () => { try { r.transaction.abort(); } catch { /* already over */ } }; // no `gdex`: none is made
    r.onerror = e => { if (e && e.preventDefault) e.preventDefault(); end(); };
    r.onblocked = end;
    r.onsuccess = () => {
      const old = r.result, pairs = [];
      const close = () => { try { old.close(); } catch { /* closed */ } };
      if (!old.objectStoreNames.contains('kv')) { close(); return end(); }
      const t = old.transaction('kv', 'readonly'), c = t.objectStore('kv').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { pairs.push([cur.key, cur.value]); cur.continue(); } };
      t.onabort = t.onerror = () => { close(); end(); };
      t.oncomplete = () => {
        close();
        if (!pairs.length) return end();
        const w = d.transaction('kv', 'readwrite'), s = w.objectStore('kv');
        for (const [key, value] of pairs) {
          try { const q = s.add(value, key); q.onerror = e => { e.preventDefault(); e.stopPropagation(); }; } catch { /* a value that cannot be copied */ }
        }
        w.oncomplete = w.onabort = w.onerror = end;
      };
    };
  } catch { end(); }
});
/* ---- end of from Gdex ---- */

export const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('tourbook', 1);
  r.onupgradeneeded = e => {
    if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
    if (e.oldVersion === 0) { let ok; copied = new Promise(x => { ok = x; }); r.addEventListener('success', () => fromGdex(r.result).then(ok)); } // from Gdex
  };
  r.onsuccess = () => copied.then(() => res(r.result));
  r.onerror = () => rej(r.error);
  r.onblocked = () => rej(new Error('blocked'));
});
export async function kv(mode, fn) {
  const d = await idb();
  try {
    return await new Promise((res, rej) => {
      const t = d.transaction('kv', mode), q = fn(t.objectStore('kv'));
      t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  } finally { d.close(); }
}
export const kvGet = key => kv('readonly', s => s.get(key));
export const kvSet = (key, value) => kv('readwrite', s => s.put(value, key));
