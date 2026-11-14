// The IndexedDB database `tourbook` version 1, store `kv`: the linked file's handle (`fileHandle`, js/backup.js) and the
// second copy of the free days (`licence-days`, js/licence-state.js). Whoever raises the version changes it here only.
// Every call rejects where IndexedDB is missing or blocked (a private window, blocked site data): callers catch.
export const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('tourbook', 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
  r.onsuccess = () => res(r.result);
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
