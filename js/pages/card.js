// My card: the person's contact card as a big QR code, a main page for every role (the section 'card', which
// js/roles.js puts on every menu just before Settings). Under the code, their name and the details the code holds; then
// Show big (the code alone on a plain white screen, as large as fits, the screen kept on), Share (the device's own share
// sheet: the .vcf file, or the card as text where files cannot be shared; left out where the device has no share), Save
// as a file (.vcf) and Edit your details (the form Settings uses). The card is Settings' own (vcard, hasCard, qrFor,
// saveCard and editProfile from js/pages/settings.js), so the two never differ. Nothing is sent anywhere: a phone that
// scans the code reads it off the screen, and Share hands the card to the device.
import { h, toast, safeUrl } from '../util.js';
import { db } from '../store.js';
import { sectionName, cardAudience } from '../roles.js';
import { fileName } from '../print.js';
import { keepAwake, letSleep } from '../tools-ui.js';
import { vcard, hasCard, qrFor, saveCard, editProfile } from './settings.js';

const txt = v => String(v ?? '').trim();
// The name on the card: the person's, else the business, band or project (as the vCard's FN).
const nameOf = p => txt(p.name).replace(/\s+/g, ' ') || txt(p.business);
// What they do and the business under the name (the business only when it is not the name already).
const subOf = p => [txt(p.role), txt(p.name) ? txt(p.business) : ''].filter(Boolean).join(' · ');
// The ways to reach them, as the vCard holds them: a website only when it is a web address (vcard() leaves out any other).
const linesOf = p => [
  ['📞', 'Phone', txt(p.phone)],
  ['✉️', 'Email', txt(p.email)],
  ['🌐', 'Website', safeUrl(txt(p.website)) ? txt(p.website) : ''],
  ['📍', 'Based in', txt(p.location)],
  ['📮', 'Postal address', txt(p.address)],
].filter(l => l[2]);
// An email or a web address may break after a dot, an @ or a slash, never inside a word (a narrow phone, large text).
const breakable = v => v.split(/([.@/])/).flatMap(part => (/^[.@/]$/.test(part) ? [part, h('wbr')] : part ? [part] : []));
// The card as plain text, for a share sheet that takes no files.
const cardText = p => [nameOf(p), subOf(p), ...linesOf(p).map(l => l[2])].filter(Boolean).join('\n');
const fileOf = p => fileName(p.name || p.business || 'Contact', 'vcf'); // as Save as a file names it (settings.js saveCard)
// What is missing before there is a card (hasCard: a name, and a way to reach them).
function missing(p) {
  const who = !!(txt(p.name) || txt(p.business)), how = !!(txt(p.phone) || txt(p.email) || txt(p.website));
  if (who && !how) return 'Add a phone number, an email or a website';
  if (how && !who) return 'Add your name, or your business, band or project name';
  return 'Add your name (or your business, band or project name) and a phone number, an email or a website';
}

// The code drawn last, so the redraw after every change to the data shows it at once.
let last = { text: '', svg: '' };
function code(text, box, cls) {
  const put = svg => box.replaceChildren(h('div', { class: cls, html: svg }));
  if (last.text === text) { put(last.svg); return box; }
  box.append(h('span', { class: 'small' }, 'Making the code…'));
  qrFor(text).then(svg => { last = { text, svg }; put(svg); }).catch(() => box.replaceChildren(h('span', { class: 'small' }, 'Too much for a QR code: shorten your details.')));
  return box;
}

/* ------------------------------- share ------------------------------- */
const canShare = () => typeof navigator.share === 'function';
async function shareCard() {
  const p = db.profile;
  if (!hasCard(p)) return;
  const name = nameOf(p), file = new File([vcard(p)], fileOf(p), { type: 'text/vcard' });
  let files = false;
  try { files = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch { files = false; }
  try { await navigator.share(files ? { files: [file], title: name } : { title: name, text: cardText(p) }); }
  catch (e) { if (!e || e.name !== 'AbortError') toast('The card could not be shared from here. Save it as a file instead.'); }
}

/* ------------------------------- Show big ------------------------------- */
// The code alone on a plain white screen, over everything (the app under it inert), the screen kept on while it shows
// (the tools' wake lock, asked again when Gdex comes back into sight). A tap anywhere, Escape, ✕ Close or Back closes
// it: it adds an entry to the browser's history, which Back takes away, and which a close of any other kind takes
// away too. The focus goes back to Show big.
let big = null, backing = 0; // backing: Back pressed by the code itself, whose popstate is not the person's
window.addEventListener('popstate', () => { if (backing) { backing--; return; } if (big) big.close({ popped: true }); });
function showBig() {
  if (big) return;
  const p = db.profile;
  if (!hasCard(p)) return;
  const name = nameOf(p), app = document.getElementById('app'), wasInert = !!(app && app.inert);
  const shut = h('button', { type: 'button', class: 'cd-big-close', id: 'cd-big-close' }, '✕ Close');
  const el = h('div', { class: 'cd-big', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${sectionName('card', 'My card')}, big screen`, 'aria-describedby': 'cd-big-help' },
    code(vcard(p), h('div', { class: 'cd-big-code', role: 'img', 'aria-label': `QR code: the contact card of ${name}` }), 'cd-big-svg'),
    h('div', { class: 'cd-big-words' },
      h('p', { class: 'cd-big-name' }, name),
      h('p', { class: 'cd-big-help', id: 'cd-big-help' }, 'Tap anywhere to close.'),
      shut));
  let pushed = false;
  const keys = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); state.close(); }
    else if (e.key === 'Tab') { e.preventDefault(); shut.focus(); } // the one control: the focus stays on it
  };
  const back = () => { if (document.visibilityState === 'visible') keepAwake(); }; // the browser lets the lock go while out of sight
  const state = {
    close({ popped = false } = {}) {
      if (big !== state) return;
      big = null;
      el.remove(); document.body.classList.remove('cd-big-on');
      if (app) app.inert = wasInert || !!document.querySelector('.sheet-back, .tour'); // a sheet that opened under it (the question at a return) keeps the app out of reach
      document.removeEventListener('keydown', keys, true);
      document.removeEventListener('visibilitychange', back);
      letSleep();
      if (pushed && !popped && history.state && history.state.gdexBig) { backing++; history.back(); }
      document.getElementById('cd-big')?.focus({ preventScroll: true });
    },
  };
  big = state;
  el.addEventListener('click', () => state.close());
  document.addEventListener('keydown', keys, true);
  document.addEventListener('visibilitychange', back);
  try { history.pushState({ gdexBig: true }, ''); pushed = true; } catch { /* no history here: a tap and Escape still close it */ }
  document.body.append(el); document.body.classList.add('cd-big-on');
  if (app) app.inert = true;
  keepAwake();
  shut.focus();
}

/* ------------------------------- the page ------------------------------- */
export const card = {
  id: 'card', label: 'My card', icon: '🪪',
  render(root) {
    const p = db.profile, page = sectionName('card', 'My card'), who = cardAudience();
    const head = h('div', { class: 'page-head' }, h('h1', { id: 'cd-title', tabindex: '-1' }, page));
    const edit = primary => h('button', { type: 'button', class: 'btn ' + (primary ? 'primary' : 'ghost'), id: 'cd-edit', onclick: () => editProfile() }, '✎ Edit your details');
    // Leaving the page (not a redraw of it) closes Show big.
    const cleanup = () => { if (big && window.logiPage && window.logiPage() !== 'card') big.close(); };
    if (!hasCard(p)) {
      root.append(head, h('div', { class: 'cd-wrap' }, h('div', { class: 'empty cd-empty' },
        h('p', null, `${missing(p)}, and your card is ready to show ${who}: they scan it with their phone camera to save your details.`),
        edit(true))));
      return cleanup;
    }
    const sub = subOf(p), lines = linesOf(p);
    root.append(head, h('div', { class: 'cd-wrap' },
      h('p', { class: 'small muted cd-lead' }, `Show it to ${who}: they scan it with their phone camera, and your details go straight into their contacts.`),
      h('div', { class: 'card cd-card' },
        code(vcard(p), h('div', { class: 'qr cd-qr', role: 'img', 'aria-label': `QR code: the contact card of ${nameOf(p)}` }), 'cd-qr-svg'),
        h('div', { class: 'cd-who' },
          h('strong', { class: 'cd-name' }, nameOf(p)),
          sub && h('span', { class: 'cd-sub' }, sub),
          lines.length > 0 && h('ul', { class: 'cd-lines', 'aria-label': 'On the card' }, lines.map(([icon, label, value]) => h('li', null,
            h('span', { class: 'cd-ico', 'aria-hidden': 'true' }, icon), h('span', { class: 'sr-only' }, label + ': '), h('span', { class: 'cd-val' }, label === 'Email' || label === 'Website' ? breakable(value) : value)))))),
      h('div', { class: 'actions cd-actions' },
        h('button', { type: 'button', class: 'btn primary', id: 'cd-big', 'aria-haspopup': 'dialog', onclick: showBig }, '⛶ Show big'),
        canShare() && h('button', { type: 'button', class: 'btn ghost', id: 'cd-share', onclick: shareCard }, '↗ Share'),
        h('button', { type: 'button', class: 'btn ghost', id: 'cd-vcf', onclick: () => saveCard() }, '⤓ Save as a file (.vcf)'),
        edit(false)),
      h('p', { class: 'small muted cd-note' }, 'Everything under the code is in it, and nothing is sent anywhere: the phone that scans it reads it off your screen. It is the same card as in Settings → Your details.')));
    return cleanup;
  },
  tutorial: () => {
    const page = sectionName('card', 'My card'), who = cardAudience();
    if (!hasCard(db.profile)) return [
      { title: page, text: `Your contact card, as a big QR code for ${who} to scan with their phone camera. It needs your name and a way to reach you first.`, target: ['#page .page-head'] },
      { title: 'Edit your details', text: 'Your name (or your business, band or project name) and a phone number, an email or a website make the card. It is the same form as Settings → Your details.', target: ['#cd-edit'] },
    ];
    return [
      { title: page, text: `Your contact card, ready to show ${who}.`, target: ['#page .page-head'] },
      { title: 'The code', text: 'Your contact card as a QR code. Most phone cameras offer to save it as a contact as soon as they see it, with no app and no internet.', target: ['.cd-qr'] },
      { title: 'What it holds', text: 'Your name and the details under the code, and nothing else. Change them with Edit your details and the code follows.', target: ['.cd-who'] },
      { title: 'Show big', text: 'The code alone on a plain white screen, as big as it fits, to scan from across a table or in a dark room. The screen stays on while it shows. Tap anywhere, press Escape or go Back to close it.', target: ['#cd-big'] },
      { title: 'Share', text: 'Sends the card with your phone’s own share sheet: a message, an email, AirDrop or whatever it offers.', target: ['#cd-share'] },
      { title: 'Save as a file', text: 'The card as a .vcf file, which any phone, address book or email program opens.', target: ['#cd-vcf'] },
      { title: 'Edit your details', text: 'The same details as Settings → Your details: change them here or there.', target: ['#cd-edit'] },
    ];
  },
};
