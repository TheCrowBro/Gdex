// Agreeing to the terms, once, at the first paid use (the build spec [S-37]; owner question 8, answered: a one-time
// sheet). The free Audiophile never sees it: it is asked only while licences are on, the first time the free days would
// start (a working role picked or used, a working section, box or record opened), and again when TERMS_VERSION changes
// (bump it with terms.html's date). Agreed: tourbook-terms { v, at } on this device (Erase keeps it). Not now: nothing starts.
// TERMS_SHEET = false removes the sheet (using Tourbook then means agreeing, as terms.html §1 says, and Stripe's checkout
// asks for the tick). It imports nothing of the licence: js/licence-state.js passes whether licences are on.
import { h, sheet } from './util.js';

export const TERMS_SHEET = true;
// The terms' date. A second change on the same day adds a count ('2026-11-14.2') once a device could have agreed to the
// first; before that (nothing published, and the sheet asks only while licences are on: termsDue below) the date stays
// (docs/developers.md, the legal pages).
export const TERMS_VERSION = '2026-11-14';
const KEY = 'tourbook-terms';
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === 'object' ? v : null; } catch { return null; } };
let agreedNow = false; // agreed this visit where storage could not keep it

export const termsDue = on => !!(TERMS_SHEET && on && !agreedNow && (read() || {}).v !== TERMS_VERSION);
// Due because they changed since this device agreed to them (the sheet then says "The terms have changed").
export const termsChanged = on => termsDue(on) && !!read();

let asking = null;
// The sheet of §9.4. Resolves true once agreed (after writing tourbook-terms), false when closed without agreeing.
export function askTerms({ once = '20 USD once plus any tax where you live' } = {}) {
  if (asking) return asking;
  asking = new Promise(resolve => {
    const changed = !!read(); // agreed to an earlier version
    let agreed = false;
    const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
    const box = h('input', { type: 'checkbox', id: 'lic-terms-ok' });
    const go = h('button', { type: 'submit', class: 'btn primary', id: 'lic-terms-agree', disabled: true }, 'Agree and continue');
    box.addEventListener('change', () => { go.disabled = !box.checked; });
    const form = h('form', { class: 'stack lic-terms', onsubmit: e => {
      e.preventDefault();
      if (!box.checked) return;
      agreed = true; agreedNow = true;
      try { localStorage.setItem(KEY, JSON.stringify({ v: TERMS_VERSION, at: Date.now() })); } catch { /* private mode: asked again next visit */ }
      close();
    } },
      h('p', null, changed ? 'Please read and agree to the updated terms to keep using the working roles. Your information is safe and stays where it is.'
        : `Tourbook’s working roles and sections are free for 30 days on this device, then need a licence: ${once}, for up to 3 of your devices. Audiophile stays free, for personal use, not for work. To use the working roles, please read and agree to Tourbook’s terms.`),
      // The points are the short version of terms.html word for word (but its Audiophile and price points, which the line
      // above says: the Audiophile free, for personal use, not for work), in its order, linking the same sections. The line
      // above has a twin in js/licence.js (the Read-only for now sheet). tests/specs/83-legal-pages checks the points against
      // the short version, and the line against its twin.
      h('ul', { class: 'lic-terms-points' },
        h('li', null, 'Tourbook keeps your own records of your shows, sessions, deals, songs and the people you work with. It is not an agent, promoter, manager, label or music publisher, takes no part in your bookings or deals, and never handles money (', link('terms.html#what', 'section 2'), ').'),
        h('li', null, 'Your work stays on your device, and the developer never receives it. Google Drive is optional and free for everyone: it keeps your devices the same, with a dated copy each day, in a private Tourbook folder of your own Drive.'),
        h('li', null, 'Tourbook comes as it is. It can have mistakes, stop working or lose information, so keep your own backups.'),
        h('li', null, 'You stay responsible for your shows and sessions, the deals and splits you agree, what you send (day sheets, quotes and invoices), your taxes, people’s safety, and the information you keep about other people.'),
        h('li', null, 'The developer’s responsibility is limited (', link('terms.html#liability', 'sections 13 to 16'), '). If you use Tourbook for your business, many kinds of loss are excluded and the rest is capped at 50 US dollars. If you use it as a consumer, you keep your legal rights.')),
      h('p', { class: 'lic-terms-links' }, link('terms.html', 'Read the terms of service'), link('privacy.html', 'Read the privacy policy')),
      h('label', { class: 'lic-terms-check', for: 'lic-terms-ok' }, box, h('span', null, 'I am 18 or over, and I have read and agree to the ', link('terms.html', 'terms of service'), '.')),
      h('div', { class: 'actions' }, go, h('button', { type: 'button', class: 'btn ghost', id: 'lic-terms-later', onclick: () => close() }, 'Not now')));
    const { el, close } = sheet(changed ? 'The terms have changed' : 'Before you use the working roles', form, { onClose: () => { asking = null; resolve(agreed); } });
    el.classList.add('lic-terms-sheet');
    // The tick box takes the focus without scrolling the sheet: it opens at its top, on the free days and the price.
    setTimeout(() => { if (el.isConnected) box.focus({ preventScroll: true }); }, 60);
  });
  return asking;
}
