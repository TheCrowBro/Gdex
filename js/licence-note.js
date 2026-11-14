// The website's sign-in note, checked in the browser (the build spec [S-40]): the licence server signs it with the shop's
// key (key 2) as `TOURBOOK-WEB\0` + the note's text, Ed25519, the same format as desktop/licence-codes.cjs's readNote('web').
// The public keys are js/licence-keys.js (written from desktop/licence-keys.json). Answers the note's value
// ({ email, ref, iat }) when it checks out, else null. A browser without Ed25519 in WebCrypto throws NotSupportedError,
// which is passed on, so the caller can tell "cannot check here" from "forged".
import { LICENCE_KEYS } from './licence-keys.js';

const SIG = 64, MAX = 4000, SIGNER = 2;
const b64u = s => {
  const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*$/.test(t)) throw new Error('not base64url');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const keys = new Map(); // the imported public key, once per visit

export async function readWebNote(note) {
  if (!note || typeof note !== 'object' || typeof note.data !== 'string' || note.data.length > MAX || note.kid !== SIGNER) return null;
  const pub = LICENCE_KEYS && LICENCE_KEYS[SIGNER];
  if (!pub || typeof pub !== 'string' || !globalThis.crypto || !crypto.subtle) return null;
  let raw, sig;
  try { raw = b64u(pub); sig = b64u(note.sig); } catch { return null; }
  if (sig.length !== SIG) return null;
  if (!keys.has(pub)) keys.set(pub, crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']));
  let key;
  try { key = await keys.get(pub); } catch (e) { keys.delete(pub); if (e && e.name === 'NotSupportedError') throw e; return null; }
  const text = new TextEncoder().encode(note.data), prefix = new TextEncoder().encode('TOURBOOK-WEB\0');
  const msg = new Uint8Array(prefix.length + text.length); msg.set(prefix); msg.set(text, prefix.length);
  let good = false;
  try { good = await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, msg); } catch (e) { if (e && e.name === 'NotSupportedError') throw e; return null; }
  if (!good) return null;
  try { const v = JSON.parse(note.data); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}
