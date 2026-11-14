// The one-time copy from Gdex (decisions §19). The app was called Gdex until just before launch and its owner used it
// under that name, so on Tourbook's first opening in this browser (no tourbook-… key here yet) every localStorage key
// still named gdex-… is copied to its tourbook-… name where that name holds nothing; the gdex-… keys are left as they
// are, and nothing is said. Only the first opening copies: from then on a tourbook-… key is always here (Erase keeps
// tourbook-db-v1), so nothing Tourbook removes later comes back from an old key. js/kv.js copies the old IndexedDB
// "gdex" the same way when it first makes "tourbook". A plain script, the first in index.html, so it runs before
// anything reads storage (js/prepaint.js reads the theme). It never throws: storage blocked, full, or holding anything.
// To drop it later: delete this file, its <script> in index.html, the block marked "from Gdex" in js/kv.js and spec
// 09-from-gdex, then run node tools/stamp-build.mjs --dev.
(() => {
  try {
    const ls = window.localStorage, keys = [];
    for (let i = 0; i < ls.length; i++) keys.push(ls.key(i));
    if (keys.some(k => typeof k === 'string' && k.startsWith('tourbook-'))) return;
    for (const k of keys) {
      if (typeof k !== 'string' || !k.startsWith('gdex-') || k.length === 5) continue;
      try {
        const to = 'tourbook-' + k.slice(5), value = ls.getItem(k);
        if (value !== null && ls.getItem(to) === null) ls.setItem(to, value);
      } catch { /* storage full: this key stays behind, the others still go */ }
    }
  } catch { /* storage blocked */ }
})();
