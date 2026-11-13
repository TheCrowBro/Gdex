// Sample work (item 15): a link on the act to a page of the person's work for it (a SoundCloud, Drive or Dropbox page of
// a producer's mixes for the band, a private playlist), shared from the act's card as a QR code. For a producer, a
// manager and Jack of Trades: a role whose pages.acts.sampleWork is false (band, solo artist, scout, audiophile) sees neither
// the form's field nor the card's code, and the link stays stored as it was. The link is read only through
// model.sampleLink (junk reads as none); with none, the code holds the act's first link (as the press kit's does),
// said so in words; with no link at all, the card says to add one in ✎ Edit. Nothing printed or sent (press kit, rider,
// day sheet) carries it, and the search does not read it. js/pages/acts.js draws these into the act's form and its card.
import { h, sheet, toast, announce } from './util.js';
import { byId } from './store.js';
import { sampleLink } from './model.js';
import { parseLinks, fillQr, bigQr } from './acts-docs.js';
import { pageOpt, actWord, sectionName } from './roles.js';
import { sheetTutorial } from './tour.js';

// Whether this role has sample work (the role's pages.acts.sampleWork; Jack of Trades, with no page defaults, has it).
export const sampleShown = () => pageOpt('acts', 'sampleWork', true) !== false;
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return ''; } };
const nameOf = a => (a && a.name) || 'Untitled act';
// What the card's QR code holds: { url, host, own: true } for the sample work link; else the act's first link,
// { url, host, label, own: false }; null when the act has neither.
export function sampleTarget(a) {
  const s = sampleLink(a);
  if (s) return { url: s.url, host: s.host, own: true };
  const l = parseLinks(a && a.links)[0];
  return l ? { url: l.url, host: hostOf(l.url), label: l.label, own: false } : null;
}
// "the artist’s first link (Website)": what the code holds when there is no sample work link, in the role's words.
const firstLink = t => `the ${actWord()}’s first link (${t.label})`;

/* ------------------------------- the act's form ------------------------------- */
// The Sample work field, under Links: [] for a role without it.
export const sampleField = () => (sampleShown() ? [{ key: 'sampleWork', label: 'Sample work', type: 'url', placeholder: 'soundcloud.com/you/sets/mixes',
  hint: `A page of your work with this ${actWord()}: a SoundCloud, Drive or Dropbox link, or a private playlist. Its QR code is on the ${actWord()}’s card in ${sectionName('acts', 'Acts')}, ready to show or share.` }] : []);
// Once the form is drawn: the box holds the stored text (anything stored that is not text reads as empty), and a line
// under it says what the code will open, or that what is typed is not a web address (said aloud when the box is left).
export function sampleFormReady(form, a) {
  const box = form.querySelector('input[data-key=sampleWork]');
  if (!box) return;
  box.value = a && typeof a.sampleWork === 'string' ? a.sampleWork : '';
  box.spellcheck = false; // an address, not words
  box.setAttribute('autocapitalize', 'off');
  const hint = box.closest('.field') && box.closest('.field').querySelector('small');
  const check = h('p', { class: 'small ac-sample-check', id: 'ac-sample-check', hidden: true });
  if (hint) { hint.id = 'ac-sample-hint'; hint.after(check); } else box.after(check);
  box.setAttribute('aria-describedby', (hint ? 'ac-sample-hint ' : '') + 'ac-sample-check');
  const bad = () => { const t = box.value.trim(); return !!t && !sampleLink({ sampleWork: t }); };
  const say = () => {
    const t = box.value.trim(), link = t ? sampleLink({ sampleWork: t }) : null;
    check.hidden = !t;
    check.classList.toggle('warn', bad());
    check.textContent = !t ? '' : link ? `The QR code opens ${link.host}.` : 'That isn’t a web address yet. Type one like soundcloud.com/you/sets/mixes.';
  };
  say();
  box.addEventListener('input', say);
  box.addEventListener('change', () => { if (bad()) announce(check.textContent); });
}
// On save: the link as typed (trimmed), or '' to clear one that was stored. A role without the field leaves the stored
// link as it is, and an act that never had one is not given an empty key.
export function sampleSave(fields, v, latest) {
  if (!sampleShown()) return;
  const text = v && typeof v.sampleWork === 'string' ? v.sampleWork.trim() : '';
  if (text || (latest && 'sampleWork' in latest)) fields.sampleWork = text;
}

/* ------------------------------- the act's card ------------------------------- */
// At the head of an open card: a small QR code of the link, its host in words, Show big and Share link; with no sample
// work link (the code is the first link) and with no link at all, a line saying to add one in ✎ Edit, and that button,
// which opens the form there. edit: the act form (editAct).
// null for a role without sample work. Its buttons have ids (and data-fk), so the focus comes back to them after a
// redraw and when a sheet they opened closes.
export function samplePart(a, edit) {
  if (!sampleShown() || !a) return null;
  const t = sampleTarget(a), id = a.id, hid = 'ac-sample-h-' + id;
  const head = h('strong', { class: 'ac-sample-h', id: hid }, 'Sample work');
  // Its name starts with the words on it ("Show big: the sample work’s QR code"), so a person who says them finds it.
  const btn = (key, icon, label, said, onclick) => h('button', { type: 'button', class: 'btn ghost small', id: `ac-sample-${key}-${id}`, 'data-fk': `ac-sample-${key}-${id}`, 'aria-label': label + said, onclick },
    h('span', { 'aria-hidden': 'true' }, icon + ' '), label);
  if (!t) {
    return h('div', { class: 'ac-sample ac-sample-none', role: 'group', 'aria-labelledby': hid }, head,
      h('p', { class: 'small muted ac-sample-say' }, `No sample work or other link for this ${actWord()} yet. Add one in ✎ Edit and its QR code shows here, ready to share.`),
      h('div', { class: 'actions ac-sample-actions' }, btn('add', '✎', 'Edit', ` ${nameOf(a)}: add the sample work link`, () => addLink(a, edit))));
  }
  const qr = h('div', { class: 'qr ac-sample-qr', role: 'img', 'aria-label': t.own ? `QR code of the sample work, ${t.host}` : `QR code of ${firstLink(t)}, ${t.host}` }, 'Making the code…');
  fillQr(qr, t.url);
  return h('div', { class: 'ac-sample', role: 'group', 'aria-labelledby': hid },
    h('div', { class: 'ac-sample-top' }, qr,
      h('div', { class: 'ac-sample-text' }, head,
        h('span', { class: 'ac-sample-host' }, t.host),
        !t.own && h('span', { class: 'small muted ac-sample-say' }, `No sample work link yet: this is ${firstLink(t)}. Add one in ✎ Edit.`))),
    h('div', { class: 'actions ac-sample-actions' },
      btn('big', '⛶', 'Show big', t.own ? ': the sample work’s QR code' : `: the QR code of ${firstLink(t)}`, () => showSampleBig(a.id)),
      btn('share', '📤', 'Share link', t.own ? ' to the sample work' : ` to ${firstLink(t)}`, () => shareSample(a.id)),
      // The line says "Add one in ✎ Edit": the button is here, not only on the act's page (the times seen under it have
      // ✎ pencils of their own, which edit a time seen).
      !t.own && btn('add', '✎', 'Edit', ` ${nameOf(a)}: add the sample work link`, () => addLink(a, edit))));
}
// ✎ Edit from a card with no sample work link: the act's form, with the focus in the Sample work box; after a save the
// focus goes to what the card now has (Show big once there is a link).
function addLink(a, edit) {
  if (typeof edit !== 'function') return;
  edit(a, () => setTimeout(() => {
    const el = ['big', 'add'].map(k => document.getElementById(`ac-sample-${k}-${a.id}`)).find(Boolean) || document.getElementById('ac-head-' + a.id);
    if (el) el.focus({ preventScroll: true });
  }, 60));
  const box = [...document.querySelectorAll('.sheet input[data-key=sampleWork]')].pop();
  if (box) box.focus();
}

// Show big: the code on a sheet of its own, as large as the screen allows (the press kit's ⛶ Show it big, acts-docs.js bigQr).
export function showSampleBig(id) {
  const a = byId('acts', id), t = a && sampleTarget(a);
  if (!t) return;
  bigQr({ title: 'Sample work', name: nameOf(a), text: t.url, caption: `${t.own ? 'Sample work' : t.label}: ${t.url}`,
    label: t.own ? `QR code of the sample work, ${t.host}` : `QR code of ${firstLink(t)}, ${t.host}`,
    note: !t.own && h('p', { class: 'small ac-sample-say' }, `No sample work link yet: this is ${firstLink(t)}.`),
    tip: 'Turn the screen brightness up and hold the phone still: it scans from about an arm’s length and opens the page on their phone.' });
}
// Share link: the device's share sheet where there is one, else the link is copied; where copying is not allowed, a
// sheet holds the link, selected, to copy by hand.
export async function shareSample(id) {
  const a = byId('acts', id), t = a && sampleTarget(a);
  if (!t) return;
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ title: t.own ? `${nameOf(a)} – sample work` : nameOf(a), url: t.url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard');
    await navigator.clipboard.writeText(t.url);
    toast('Link copied: paste it into a message or an email.');
  } catch {
    const box = h('input', { type: 'text', class: 'ac-sample-copy', id: 'ac-sample-copy', readOnly: true, value: t.url, 'aria-label': 'The link', autocomplete: 'off' });
    sheet('Copy the link', h('div', { class: 'stack' }, h('p', { class: 'small muted' }, 'Copying isn’t allowed here. Select the link and copy it.'), box));
    setTimeout(() => { if (box.isConnected) { box.focus(); box.select(); } }, 60);
  }
}

/* ------------------------------- walkthroughs ------------------------------- */
// The acts list's step (after Drop it open): an open card's Sample work, else the card heads.
export const sampleStep = () => (sampleShown() ? { title: 'Sample work', target: ['.ac-sample', '.ac-card-head'],
  text: `Drop a card open for a QR code of your sample work for the ${actWord()}: a SoundCloud, Drive or Dropbox page, or a private playlist. Show big puts it on the whole screen to scan; Share link sends the link. Add the link in the ${actWord()}’s ✎ Edit; until there is one, the code holds the ${actWord()}’s first link.` } : null);
// The act form's step (after Links).
export const sampleFormStep = () => (sampleShown() ? { title: 'Sample work', target: ['input[data-key=sampleWork]'],
  text: `A page of your work with this ${actWord()}, to share: a SoundCloud, Drive or Dropbox link, or a private playlist. Its QR code is on the ${actWord()}’s card in ${sectionName('acts', 'Acts')}; with none, the card uses the first link above.` } : null);
sheetTutorial('Sample work', () => [
  { title: 'Show it big', text: `Hold the phone up: whoever scans the code opens your sample work (or, until there is a link to it, the ${actWord()}’s first link) on their own phone. Turn the brightness up in a dark room.`, target: ['.ac-qr-full'] },
]);
