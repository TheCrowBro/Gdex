// Settings: everything that isn't a record, in twirl-down sections that each say where they stand on their closed
// line: your role (which sets the section menu), your details (with the way to My card, the contact card as a big QR code, and the card as a .vcf file), quotes & invoices, backups, display &
// accessibility, help, about, and erasing this device. Which sections are open is remembered here. Settings no longer
// offers the sample (the owner took Sample data off, 15 November 2026): a device with sample records on it (loaded there
// before, or brought in by a backup or Google Drive) has a Sample data section only while they are on it, to remove them
// in one go.
// A role without money (scout, audiophile: moneyShown() false) has no Quotes & invoices section, and its details
// are not said to go on quotes and invoices; the section comes back with a role that uses money.
import { h, toast, announce, safeUrl, telUrl, nodes } from '../util.js';
import * as store from '../store.js';
import { db, update } from '../store.js';
import { fmtMoney } from '../model.js';
import { mine, curLabel, currencySelect, picked, applyMine } from '../money-currency.js';
import { openForm } from '../form.js';
import { qrSvg, loadQR } from '../qr.js';
import { saveFile, fileName } from '../print.js';
import { displayPanel, prefsSummary } from '../a11y.js';
import { startTour, sheetTutorial } from '../tour.js';
import { VERSION, BUILD, BUILT } from '../version.js';
import { updatePanel } from '../update.js';
import { installState, openInstallHelp } from '../install.js';
import { backupPanel, onBackupChange, beforeErase, backupLine, driveBehind, exportBackup } from '../backup.js';
import { role, roleChosen, menuSections, sectionName, moneyShown } from '../roles.js';
import { rolePanel } from '../role-pick.js';
import { askPref } from '../acts-ask.js';
// The licence (decisions §9): About becomes About & licence while licences are on, and Your role says the free days left.
// Nothing of it shows while licences are off.
import { licenceOn, licenceNow } from '../licence-state.js';
import { roleNeedsLicence, roleId } from '../roles.js';

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const S = { erase: '', behind: null, busy: false }; // what is typed in the erase box (and what Drive lacks) survives the redraw after every change

/* ------------------------------- open sections ------------------------------- */
// Which sections are open is remembered (tourbook-settings-open) while the person comes and goes, not for good (the
// owner, 15 Nov 2026: "Leaving the settings page should close the settings twirl downs after a few minutes."). The
// moment Settings goes off screen (another section, or Tourbook in the background or closed while on it) is noted, in
// memory and, while a section is open, in tourbook-settings-left. When Settings is on screen again (gone to, Tourbook
// back in front on it, or after a reload) FOLD_AFTER_MS or more after that, every section is closed and the list
// cleared; sooner, they stay as they were. While Settings stays on screen nothing closes, and no timer runs: the time
// is only compared as Settings is shown. A first showing with no time noted (a list kept by an earlier version, a
// crash) counts as long ago. Tourbook back in front in the middle of something (a sheet up, or the focus in a box being
// typed in inside an open section) had only gone to fetch something (an IBAN from the bank's app, a code from mail,
// Google's sign-in): that counts as back sooner, and the sections stay as they were.
const OPEN_KEY = 'tourbook-settings-open', LEFT_KEY = 'tourbook-settings-left';
const FOLD_AFTER_MS = 3 * 60 * 1000;
const OPEN = (() => { try { const a = JSON.parse(localStorage.getItem(OPEN_KEY)); return new Set(Array.isArray(a) ? a : []); } catch { return new Set(); } })();
const saveOpen = () => { try { if (OPEN.size) localStorage.setItem(OPEN_KEY, JSON.stringify([...OPEN])); else localStorage.removeItem(OPEN_KEY); } catch { /* private mode */ } };
// on: Settings is on screen (drawn, and Tourbook in front). left: when it last went off screen, this visit. keep: the
// section openSettingsSection is opening, which stays open when the others close. erased: after Erase this device,
// nothing is noted again before the page reloads.
const SEEN = { on: false, left: null, keep: null, erased: false };
// inPlace: Tourbook back in front with Settings already drawn (not Settings being drawn).
function arrive(inPlace = false) {
  if (SEEN.on) return;
  SEEN.on = true;
  let left = SEEN.left; SEEN.left = null;
  try { const t = localStorage.getItem(LEFT_KEY); if (left === null && t !== null) left = Number(t); localStorage.removeItem(LEFT_KEY); } catch { /* blocked storage: the time in memory */ }
  if (inPlace && midTask()) return;
  if (left === null || !(Date.now() - left < FOLD_AFTER_MS)) fold();
}
// A sheet up, or the focus in a box being typed in (not a button or a switch) inside an open section. A select is not
// one: its choice is saved as it is made (Your currency), so nothing is left unsaved.
const TYPED = 'input:not([type=button],[type=submit],[type=reset],[type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=image]), textarea';
function midTask() {
  if (document.querySelector('.sheet-back')) return true;
  const a = document.activeElement;
  return !!(a && a.closest && a.closest('#page details.se-sec[open]') && (a.matches(TYPED) || a.isContentEditable));
}
function leave() {
  if (!SEEN.on) return;
  SEEN.on = false;
  if (SEEN.erased) return;
  SEEN.left = Date.now();
  try { if (OPEN.size) localStorage.setItem(LEFT_KEY, String(SEEN.left)); else localStorage.removeItem(LEFT_KEY); } catch { /* blocked storage: the time in memory */ }
}
// Every section closed, but the one being opened. On Tourbook's return the page is already drawn: its sections close
// in place, a focus inside one goes to its title, and the page, much shorter now, goes to the title with the focus
// (else the first section closed), under the section menu, not to the end of the list.
function fold() {
  for (const id of OPEN) if (id !== SEEN.keep) OPEN.delete(id);
  saveOpen();
  let first = null;
  for (const d of document.querySelectorAll('#page details.se-sec[open]')) {
    if (d.dataset.s === SEEN.keep) continue;
    const sum = d.querySelector(':scope > summary'), a = document.activeElement;
    if (sum && a && a !== sum && d.contains(a)) sum.focus({ preventScroll: true });
    d.open = false;
    first = first || d;
  }
  if (!first) return; // nothing was open on the page (Settings being drawn): the app's own scroll
  const a = document.activeElement, d = a && a.matches && a.matches('#page details.se-sec > summary') ? a.parentElement : first;
  d.style.scrollMarginTop = `${(document.getElementById('deck')?.getBoundingClientRect().height || 0) + 8}px`;
  d.scrollIntoView({ block: 'start' });
}

// One twirl-down: icon, title, a line saying where it stands, and its body. onOpen runs when it is (or opens) open.
function section(id, icon, title, sub, body, onOpen) {
  const subEl = h('span', { class: 'twirl-sub se-sub' }, sub);
  const el = h('details', { class: 'twirl se-sec', id: 'se-' + id, 'data-s': id, open: OPEN.has(id) },
    h('summary', { id: `se-${id}-sum` }, h('span', { class: 'twirl-ico', 'aria-hidden': 'true' }, icon), h('span', null, h('span', { class: 'twirl-name' }, title), subEl)),
    h('div', { class: 'twirl-body se-body' }, body));
  // The browser also fires toggle for a details drawn open: only a real change of mind is remembered.
  let known = el.open;
  el.addEventListener('toggle', () => {
    if (el.open === known) return;
    known = el.open;
    if (el.open) OPEN.add(id); else OPEN.delete(id);
    saveOpen();
    if (el.open && onOpen) onOpen();
  });
  if (el.open && onOpen) onOpen();
  return { el, sub: subEl };
}

// From any page: go to Settings and open a section ('profile', 'billing', 'backups'…). Resolves once it is on screen.
// When Settings was left 3 minutes or more ago, the others are closed as it shows.
export async function openSettingsSection(id) {
  OPEN.add(id); saveOpen();
  SEEN.keep = id;
  try { await window.logiGo('settings'); } finally { SEEN.keep = null; }
  await new Promise(r => setTimeout(r, 60));
  const d = document.getElementById('se-' + id);
  if (!d) return false;
  d.open = true;
  const nav = document.getElementById('deck'); // sticky at the top: the section lands under it, not behind it
  d.style.scrollMarginTop = `${(nav ? nav.getBoundingClientRect().height : 0) + 8}px`;
  d.scrollIntoView({ block: 'start' });
  d.querySelector(':scope > summary')?.focus({ preventScroll: true });
  return true;
}

/* ------------------------------- your details ------------------------------- */
const PROFILE_KEYS = ['name', 'business', 'role', 'phone', 'email', 'website', 'location', 'address', 'bio'];

// The one place your name, business and contact details are changed.
export function editProfile() {
  let pick = null;
  openForm({
    title: 'Your details',
    values: { ...db.profile },
    fields: [
      { key: 'name', label: 'Your name', placeholder: 'Alex Rivera' },
      { key: 'business', label: 'Business, band or project name', placeholder: 'Rivera Sound' },
      { key: 'role', label: 'What you do', placeholder: 'Producer, band leader, tour manager…', list: ['Producer', 'Band leader', 'Musician', 'Session musician', 'Engineer', 'Mix engineer', 'Tour manager', 'Manager', 'Artist', 'Songwriter', 'DJ'] },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'website', label: 'Website', type: 'url', placeholder: 'yourname.com' },
      { key: 'location', label: 'Based in', placeholder: 'City' },
      { key: 'address', label: 'Postal address', type: 'textarea', rows: 3, hint: 'For invoices: some clients need it there to pay.' },
      // The same chooser as Quotes & invoices (js/money-currency.js), drawn into the form's select by onReady.
      { key: 'currency', label: 'Currency', type: 'select', options: [], hint: 'Pick your country. Its currency is used for every fee, deal and settlement, and for your quotes and invoices (one for work abroad can have its own).' },
      { key: 'bio', label: 'Short bio', type: 'textarea', rows: 3, hint: 'A line or two about you.' },
    ],
    // The currency changes only when another country is picked: what was stored (a symbol typed by hand) stays.
    onReady: form => { pick = currencySelect(mine(), { sel: form.querySelector('select[data-key="currency"]') }); },
    onSave: v => {
      const out = {}, cur = picked(pick);
      for (const k of PROFILE_KEYS) out[k] = String(v[k] ?? '').trim();
      update(d => { d.profile = { ...d.profile, ...out, updatedAt: Date.now() }; if (cur) applyMine(d, cur); });
      toast('Your details are saved');
    },
  });
}

// A vCard 3.0 for the profile: scanned from the QR code on My card (js/pages/card.js, which uses this and the three below) or saved as a .vcf file.
const vesc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/([;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
export function vcard(p = db.profile) {
  const name = String(p.name || '').trim().replace(/\s+/g, ' '), parts = name ? name.split(' ') : [];
  const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '', family = parts.length > 1 ? parts[parts.length - 1] : '';
  const site = safeUrl(String(p.website || '').trim()).replace(/[\r\n]/g, '');
  const address = String(p.address || '').trim(), city = String(p.location || '').trim();
  const locality = city && !address.toLowerCase().includes(city.toLowerCase()) ? city : '';
  return [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${vesc(family)};${vesc(given)};;;`,
    `FN:${vesc(name || p.business || '')}`,
    p.business && `ORG:${vesc(p.business)}`,
    p.role && `TITLE:${vesc(p.role)}`,
    p.phone && `TEL;TYPE=CELL:${vesc(p.phone)}`,
    p.email && `EMAIL;TYPE=INTERNET:${vesc(p.email)}`,
    site && `URL:${site}`,
    (address || locality) && `ADR;TYPE=WORK:;;${vesc(address)};${vesc(locality)};;;`,
    'END:VCARD',
  ].filter(Boolean).join('\r\n');
}
// A card needs a name (or the business) and a way to reach the person: a phone, an email, or a website that is a web
// address (vcard() leaves any other out, so a name with "insta: @maya" alone makes no card).
const filled = v => String(v ?? '').trim();
export const hasCard = p => !!((filled(p.name) || filled(p.business)) && (filled(p.phone) || filled(p.email) || safeUrl(filled(p.website))));

// The QR library reads text byte by byte; qrSvg switches it to UTF-8 wherever it has that, so the text goes as it is,
// and only a library without UTF-8 is given the UTF-8 bytes, so names such as Zoë or José scan right. (Asking whether
// it is set to UTF-8 already was wrong on the first code of a visit: qrSvg sets it only after, and the bytes were
// encoded twice, "ZoÃ«".) The code for the current card is kept, so a redraw shows it at once.
const qrCache = { text: '', svg: '' };
export async function qrFor(text) {
  if (qrCache.text === text) return qrCache.svg;
  const q = await loadQR();
  const utf8 = !!(q.stringToBytesFuncs && q.stringToBytesFuncs['UTF-8']);
  const svg = await qrSvg(utf8 ? text : Array.from(new TextEncoder().encode(text), b => String.fromCharCode(b)).join(''));
  qrCache.text = text; qrCache.svg = svg;
  return svg;
}

export async function saveCard() {
  const p = db.profile;
  if (!hasCard(p)) return toast('Add your name and a phone number or email first');
  if (await saveFile(vcard(p), fileName(p.name || p.business || 'Contact', 'vcf'), 'text/vcard')) toast('Contact card saved');
}

// The contact card itself, as a big QR code to scan, share or show big, is on its own page, My card (js/pages/card.js):
// here, a line and the way there, and the card as a file.
const openMyCard = async () => {
  await window.logiGo('card');
  window.scrollTo(0, 0);
  document.getElementById('cd-title')?.focus({ preventScroll: true });
};
function contactBlock() {
  const p = db.profile, can = hasCard(p), page = sectionName('card', 'My card');
  return h('div', { class: 'se-contact' },
    h('h3', null, 'Share my contact'),
    h('p', { class: 'small muted se-card-line' }, can
      ? `Your contact card is a big QR code on ${page}: scanning it saves your number and email. Show it big or share it there, or save it here as a file.`
      : `Add your name and a phone number or email to make your contact card. It shows on ${page} as a big QR code.`),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn ghost', id: 'se-card', onclick: openMyCard }, `🪪 Open ${page}`),
      h('button', { type: 'button', class: 'btn ghost', id: 'se-vcf', disabled: !can, onclick: saveCard }, '⤓ Save contact card (.vcf)')));
}

function profileBody() {
  const p = db.profile, has = PROFILE_KEYS.some(k => String(p[k] || '').trim());
  const site = safeUrl(String(p.website || '').trim());
  const line = (label, value) => value && h('div', null, h('span', { class: 'muted' }, label), h('span', { class: 'se-val' }, value));
  const body = [
    has && h('p', { class: 'small muted' }, moneyShown() ? 'They go on your day sheets, quotes and invoices, and on your contact card below.' : 'They go on your day sheets and on your contact card below.'),
    has
      ? h('div', { class: 'card kv se-kv' },
        line('Name', p.name), line('Business', p.business), line('What you do', p.role),
        p.phone && line('Phone', h('a', { href: telUrl(p.phone) }, p.phone)),
        p.email && line('Email', h('a', { href: 'mailto:' + p.email }, p.email)),
        p.website && line('Website', site ? h('a', { href: site, target: '_blank', rel: 'noopener noreferrer' }, p.website) : p.website),
        line('Based in', p.location),
        p.address && line('Postal address', h('span', { class: 'prewrap' }, p.address)),
        line('Currency', `${curLabel(mine())}  (e.g. ${fmtMoney(1250)})`))
      : h('div', { class: 'empty se-empty' }, h('p', null, moneyShown() ? 'Add your name, business and contact details. They go on your day sheets, quotes and invoices.' : 'Add your name and contact details. They go on your day sheets and your contact card.')),
    p.bio && h('p', { class: 'small prewrap se-bio' }, p.bio),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn primary', id: 'se-edit-profile', onclick: editProfile }, has ? '✎ Edit your details' : '+ Add your details')),
    contactBlock(),
  ];
  return { body };
}
const profileSummary = () => { const p = db.profile; return [p.name, p.business].map(x => String(x || '').trim()).filter(Boolean).join(' · ') || 'Not set yet: add your name and contact details'; };

/* ------------------------------- quotes & invoices ------------------------------- */
// money.js draws its own settings panels. It is fetched with this page and kept, so a redraw mounts them at once and
// the box someone is typing in keeps the focus.
let money = null;
const moneyReady = import('../money.js').then(m => (money = m)).catch(e => { console.error(e); return null; });
// A box in those panels saves on change, and the page redraws inside that change, before the browser moves the focus
// to the next box (Tab, or a tap on it). For that one redraw the same panel is kept, so the box the focus is going to
// still exists; a fresh one follows a moment later, and the redraw then keeps the focus where it went.
let moneySlot = null, moneyEdit = false;
function billingBody() {
  if (moneyEdit && moneySlot) return moneySlot;
  const slot = h('div', { class: 'stack se-money' });
  slot.addEventListener('change', () => {
    if (moneyEdit) return;
    moneyEdit = true;
    setTimeout(() => { moneyEdit = false; if (slot.isConnected) store.redraw(); }, 0);
  }, true);
  moneySlot = slot;
  const fill = m => {
    if (!m) return slot.replaceChildren(h('p', { class: 'small muted' }, 'Quotes & invoices could not be loaded. Check the connection and open Settings again.'));
    const kids = [h('p', { class: 'small muted' }, 'Your currency, numbering, tax and payment details for your quotes and invoices, and the prices you pick lines from.')];
    for (const [make, head] of [[m.billingPanel, ''], [m.priceListPanel, 'Your price list']]) {
      try {
        const out = typeof make === 'function' ? make() : null, node = out && out.nodeType ? out : out && out.el && out.el.nodeType ? out.el : null;
        if (node) kids.push(head && h('h3', { class: 'se-money-head' }, head), node);
      } catch (e) { console.error(e); kids.push(h('p', { class: 'warn small' }, 'Part of this section could not be shown.')); }
    }
    slot.replaceChildren(...kids);
  };
  if (money) fill(money);
  else { slot.append(h('p', { class: 'small muted' }, 'Loading…')); moneyReady.then(m => { if (slot.isConnected) fill(m); }); }
  return slot;
}
// The closed line starts with your currency (£ GBP), which is chosen at the top of the section.
const curWords = () => { const c = mine(); return c.code && c.code !== c.sym ? `${c.sym} ${c.code}` : c.code || c.sym; };
const billingSummary = () => { const list = db.priceList && Array.isArray(db.priceList.list) ? db.priceList.list.length : 0; return `${curWords()} · ` + (list ? `${plural(list, 'price')} on your list · numbering, tax, payment details` : 'numbering, tax, payment details and your prices'); };

/* ------------------------------- the sample ------------------------------- */
// While licences are on, the role's line also says where its licence stands: free (the Audiophile), the free days left, or read-only.
const licenceBit = () => {
  if (!licenceOn()) return '';
  const s = licenceNow();
  if (!roleNeedsLicence(roleId())) return ' · free';
  if (s.mode === 'away' || !s.canEdit) return ' · read-only';
  if (['licensed', 'pending'].includes(s.mode)) return ' · licensed';
  return s.started ? ` · ${plural(s.trialLeft, 'free day')} left` : '';
};
const roleSummary = () => { const r = role(); return (roleChosen() ? `${r.label} · ${plural(menuSections(r).length, 'section')} on the menu` : 'Not chosen: every section is on the menu') + licenceBit(); };
// Settings no longer loads the sample (store.loadSample() stays as the tests' fixture). A device with sample records on it
// (loaded there before, or brought in by a backup or Google Drive) keeps a way to remove them: the Sample data section,
// drawn only while a sample record is on the device.
const sampleCount = () => store.COLLECTIONS.reduce((n, c) => n + db[c].filter(r => r && r.sample).length, 0);
// Every sample record goes through store.remove, so anything of yours that pointed at one (a booking for the sample
// act, at a sample venue, with a sample song) is unlinked instead of left pointing at nothing. Returns how many went.
export function removeSample() {
  const order = ['bookings', 'logs', 'shifts', 'setlists', 'songs', 'kits', 'gear', 'insurance', 'acts', 'people', 'venues'];
  const lists = [...order.filter(c => store.COLLECTIONS.includes(c)), ...store.COLLECTIONS.filter(c => !order.includes(c))];
  const before = sampleCount();
  for (const list of lists) for (const r of store.db[list].filter(x => x && x.sample)) if (store.byId(list, r.id)) store.remove(list, r.id);
  const n = before - sampleCount(); // some go with others (a booking's clock shifts), so count what is gone
  // The sample's stand-in name, if it is still the one loadSample filled in.
  const p = store.db.profile;
  // A cleared stand-in never wins a merge with a real profile. One with no time stays without; one a currency pick gave
  // a time gets a newer one, so a merge with that stamped stand-in (another device, Drive, a backup) keeps it cleared.
  if (p.name === 'Sample Producer' && p.business === 'Sample Sound') update(d => { d.profile = { ...d.profile, name: '', business: '', role: d.profile.role === 'Producer' ? '' : d.profile.role, updatedAt: Number(d.profile.updatedAt) > 0 ? Date.now() : 0 }; });
  return n;
}
function askRemove() {
  if (!store.canChange({ form: false })) return; // a read-only role: the licence's sheet says why, and no question is asked
  const all = store.COLLECTIONS.flatMap(c => db[c].filter(r => r && r.sample));
  if (!all.length) return toast('There is no sample to remove');
  const edited = all.filter(r => Number(r.updatedAt) > Number(r.createdAt) + 2000).length;
  if (!confirm(`Remove the ${plural(all.length, 'sample record')}?${edited ? ` ${edited} of them changed after loading, and those changes go too.` : ''} Your own records stay, but lose any links to sample records.`)) return;
  const next = document.querySelector('#se-sample + .se-sec > summary'); // the section that takes its place
  const n = removeSample();
  if (!n) return; // nothing went (refused): say nothing about a removal
  toast(`Sample removed: ${plural(n, 'record')}`);
  announce('Sample removed');
  // With the last sample record gone the section goes too: the focus goes to the section now in its place, after the redraw.
  if (!sampleCount() && next) { const id = next.id; setTimeout(() => document.getElementById(id)?.focus({ preventScroll: true }), 0); }
}
function sampleBody() {
  return [
    h('p', { class: 'small muted' }, 'The sample’s records: a band and a few weeks of bookings. They come out in one go; your own records stay.'),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn danger', id: 'se-sample-remove', onclick: askRemove }, 'Remove the sample…')),
  ];
}

/* ------------------------------- about ------------------------------- */
const sizeText = bytes => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const isApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function install() {
  const b = document.getElementById('installBtn');
  if (b && !b.hidden) b.click(); else openInstallHelp();
}
// Google Drive is linked on this device (js/sync.js keeps tourbook-drive; read here directly, as that module loads later).
const driveLinked = () => { try { return localStorage.getItem('tourbook-drive') === '1'; } catch { return false; } };
// About's closed line: where the data is, and while licences are on, the licence in a few words (§9.6, §9.10).
function aboutLine() {
  let line = `Version ${VERSION}${BUILD !== 'dev' ? ' · ' + BUILD : ''} · your data stays on this device${driveLinked() ? ' and your Google Drive' : ''}`;
  if (licenceOn()) {
    const s = licenceNow();
    line += s.mode === 'away' ? ' · working roles: desktop app only'
      : ['licensed', 'pending'].includes(s.mode) && s.canEdit ? ' · licensed'
        : !s.canEdit ? (roleNeedsLicence(roleId()) ? ' · read-only: needs a licence' : ' · the working roles need a licence') // the Audiophile itself is never read-only
          : s.started ? ` · free days: ${s.trialLeft} left` : ' · Audiophile is free';
  }
  return line;
}
// Where the data is kept, in words true where Tourbook runs (§9.10): in a web browser, or in the desktop app, which keeps it
// in its own window on this computer and looks for new versions at its download address (desktop/updater.cjs).
function whereWords() {
  const desk = !!window.tourbookDesktop;
  return `Everything you enter stays ${desk ? 'in this app, on this computer' : 'in this browser, on this device'}. Your bookings, contacts and fees are never sent to a Tourbook server. If you connect Google Drive, Tourbook also keeps a copy in a private folder of your own Drive.${licenceOn() ? ' Tourbook’s licence server at tourbook.crowmade.app only ever hears about your licence, and only once you use a working role, or once a backup file or Google Drive brings in free days started on another device.' : ''}${desk ? ' The desktop app also looks for new versions at tourbook-download.crowmade.app.' : ''} A backup file keeps it all safe and moves it to another device.`;
}
function aboutBody(up, done) {
  let size = 0; try { size = new Blob([store.serialize()]).size; } catch { /* ignore */ }
  // The licence's panel comes first while licences are on (js/licence.js, loaded then).
  const slot = licenceOn() ? h('div', { class: 'se-licence' }) : null;
  if (slot) import('../licence.js').then(m => { const p = m.licencePanel(); slot.replaceChildren(p.el); done.push(() => p.destroy && p.destroy()); }).catch(e => console.error(e));
  return [
    slot,
    h('p', null, h('strong', null, `Tourbook ${VERSION}`), BUILD !== 'dev' ? ` · build ${BUILD}${BUILT ? ` (${BUILT})` : ''}` : '', h('br'),
      h('span', { class: 'small muted' }, 'The booking deck for music producers and their bands.')),
    h('div', { class: 'card se-where' },
      h('strong', null, 'Where your data is kept'),
      h('p', { class: 'small muted' }, whereWords()),
      h('p', { class: 'small muted' }, `It takes about ${sizeText(size)} here.`),
      isApple() && !installState().standalone && h('p', { class: 'small muted' }, 'On iPhone and iPad, Safari can clear a website’s data when it hasn’t been opened for a week or so. Add Tourbook to the Home Screen to keep it, and save a backup now and then.')),
    up.el,
    h('div', { class: 'actions' },
      h('a', { class: 'btn ghost', href: 'privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy'),
      licenceOn() && h('a', { class: 'btn ghost', href: 'terms.html', target: '_blank', rel: 'noopener' }, 'Terms'),
      !installState().standalone && h('button', { type: 'button', class: 'btn ghost', id: 'se-install', onclick: install }, '⤓ Install Tourbook')),
  ];
}

/* ------------------------------- erase ------------------------------- */
const eraseArmed = () => S.erase.trim().toUpperCase() === 'ERASE';
// With Google Drive linked, a tap on Erase first copies this device's last changes to Drive (backup.js driveBehind).
// When Drive still lacks some, nothing is erased: S.behind holds what it lacks, the section says so with Try again (or
// Sign in again) and Save a backup, and the button becomes Erase anyway. S.busy: that last sync is running.
async function eraseDevice() {
  if (!eraseArmed() || S.busy) return;
  if (!S.behind && driveLinked()) {
    if (await lastSync() || !eraseArmed()) return;
  }
  S.erase = ''; S.behind = null;
  try { await beforeErase(); } catch { /* nothing linked */ } // first, so the empty database is never written over the copy
  store.eraseAll();
  SEEN.erased = true; // the reload that follows does not note when Settings was left
  try { localStorage.removeItem(OPEN_KEY); localStorage.removeItem(LEFT_KEY); } catch { /* ignore */ }
  toast('Everything on this device was erased');
  setTimeout(() => location.reload(), 400);
}
// The last sync before an erase (and its Try again): resolves what Drive still lacks, or null.
async function lastSync() {
  S.busy = true; paintErase();
  try { S.behind = await driveBehind(); } catch { S.behind = null; } finally { S.busy = false; }
  paintErase();
  return S.behind;
}
async function eraseRetry() {
  if (S.busy) return;
  if (!(await lastSync())) { toast('Google Drive has everything from this device now.'); announce('Google Drive has everything from this device now'); }
}
// Redraw the erase section's body in place (the page itself may have been redrawn meanwhile). The focus, when it was
// in the section or was lost with a redraw, goes to the erase button.
function paintErase() {
  const box = document.querySelector('#se-erase .se-body');
  if (!box) return;
  const a = document.activeElement, keep = !a || a === document.body || !a.isConnected || box.contains(a);
  box.replaceChildren(...nodes(eraseBody()));
  if (keep) { const el = document.getElementById('se-erase-go'); if (el) el.focus({ preventScroll: true }); }
}
function eraseBody() {
  const go = h('button', { type: 'button', class: 'btn danger', id: 'se-erase-go', disabled: !eraseArmed(), 'aria-busy': S.busy ? 'true' : null, onclick: eraseDevice }, S.busy ? 'Copying to Google Drive…' : S.behind ? 'Erase anyway' : 'Erase this device');
  const input = h('input', { type: 'text', id: 'se-erase-input', value: S.erase, autocomplete: 'off', autocapitalize: 'characters', 'aria-describedby': 'se-erase-warn',
    oninput: e => { S.erase = e.target.value; go.disabled = !eraseArmed(); },
    onkeydown: e => { if (e.key === 'Enter' && eraseArmed()) { e.preventDefault(); eraseDevice(); } } });
  input.spellcheck = false;
  return [
    h('p', { class: 'warn small', id: 'se-erase-warn' }, `This removes everything Tourbook keeps on this device: every record, your details and money settings, and your role (Tourbook asks again when it next opens).${driveLinked() ? ' Google Drive gets this device’s last changes first (Tourbook tells you if it can’t), then is disconnected here; the copy in your Drive stays.' : ''} Backup files, and a copy kept in a file, stay as they are.${licenceOn() ? ' Your licence sign-in and free-day count stay on this device.' : ''} There is no undo.`),
    h('div', { class: 'field' }, h('label', { for: 'se-erase-input' }, 'Type ERASE to confirm'), input),
    S.behind && h('div', { class: 'stack se-erase-behind', role: 'alert' },
      h('p', { class: 'warn small' }, S.behind.text),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn primary se-erase-sync', disabled: !!S.busy, onclick: eraseRetry }, S.behind.status === 'needs-permission' ? 'Sign in again' : 'Try again'),
        h('button', { type: 'button', class: 'btn ghost se-erase-save', onclick: () => exportBackup() }, '⤓ Save a backup'))),
    h('div', { class: 'actions' }, go),
  ];
}

/* ------------------------------- the page ------------------------------- */
// The walkthrough's words for each section; billing is left out, with the section, while money is off.
const SECTIONS = [
  ['role', 'Your role', 'It sets the section menu and the pages for the way you work. Change it any time; nothing is removed. Turn the “Did you see them?” question on or off here too.'],
  ['profile', 'Your details', () => (moneyShown() ? `Your name, business and contact details go on day sheets, quotes and invoices. Below them, open ${sectionName('card', 'My card')} for your contact card as a big QR code, or save the card as a file.` : `Your name and contact details go on day sheets. Below them, open ${sectionName('card', 'My card')} for your contact card as a big QR code, or save the card as a file.`)],
  ['billing', 'Quotes & invoices', 'Your currency, numbering, tax, payment details and your price list for quotes and invoices.'],
  ['backups', 'Backups', 'Save a backup file, bring one back, keep a copy in a file in a synced folder, or connect Google Drive to share Tourbook between your devices with a dated copy each day.'],
  ['display', 'Display & accessibility', 'The section menu (record player, tape deck or digital player), colour theme, light or dark, text size, bigger buttons, contrast, animation and vibration.'],
  ['help', 'Help', 'A walkthrough for any page, and the welcome tour.'],
  ['sample', 'Sample data', 'The sample’s records: remove them in one go, and this section goes with them. Your own records stay.'],
  ['about', () => (licenceOn() ? 'About & licence' : 'About'), () => (licenceOn() ? 'The version and updates, your licence, privacy and terms, and where your data is kept.' : 'The version and updates, privacy, and where your data is kept.')],
  ['erase', 'Erase this device', 'Wipes everything Tourbook keeps on this device. You type ERASE first, so it can’t happen by accident.'],
];

export const settings = {
  id: 'settings', label: 'Settings', icon: '⚙️',
  render(root) {
    // Settings shown (gone to, or drawn again): its sections close first when it was left 3 minutes or more ago. Drawn
    // while Tourbook is in the background, it is shown when Tourbook comes back.
    if (document.visibilityState !== 'hidden') arrive();
    const done = [];
    const sight = () => (document.visibilityState === 'hidden' ? leave() : arrive(true));
    const kept = e => { if (e.persisted && document.visibilityState !== 'hidden') arrive(true); }; // the page the browser kept, brought back
    document.addEventListener('visibilitychange', sight); window.addEventListener('pagehide', leave); window.addEventListener('pageshow', kept);
    done.push(() => { document.removeEventListener('visibilitychange', sight); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', kept); });
    const profile = profileBody();
    const display = displayPanel();
    const up = updatePanel();
    done.push(() => display.destroy && display.destroy(), () => up.destroy && up.destroy());

    const sec = {
      role: section('role', '🎭', 'Your role', roleSummary(), [rolePanel(), askPref()]), // askPref: the “Did you see them?” question, on or off
      profile: section('profile', '🪪', 'Your details', profileSummary(), profile.body),
      billing: moneyShown() ? section('billing', '🧾', 'Quotes & invoices', billingSummary(), billingBody()) : null,
      backups: section('backups', '☁️', 'Backups', backupLine(), backupPanel()),
      display: section('display', '🔆', 'Display & accessibility', cap(prefsSummary()), display.el),
      help: section('help', '🧭', 'Help', 'Page tutorials and the welcome tour', [
        h('p', { class: 'small muted' }, 'Every page has a short walkthrough: tap ? at the top of any page, or pick one here. The welcome tour shows the whole app in about a minute.'),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn primary', id: 'se-tutorials', onclick: () => import('../tutorials.js').then(m => m.openChooser()).catch(e => { console.error(e); toast('The tutorials could not be opened.'); }) }, '📚 Page tutorials…'),
          h('button', { type: 'button', class: 'btn ghost', id: 'se-tour', onclick: () => startTour() }, '🧭 Take the welcome tour')),
      ]),
      sample: sampleCount() ? section('sample', '🧪', 'Sample data', `${plural(sampleCount(), 'sample record')} on this device`, sampleBody()) : null, // only while there is a sample to remove
      about: section('about', 'ℹ️', licenceOn() ? 'About & licence' : 'About', aboutLine(), aboutBody(up, done)),
      erase: section('erase', '🗑️', 'Erase this device', 'Remove everything Tourbook keeps here', eraseBody()),
    };
    // A backup saved or the file copy written is not a change to the data, so the page is not redrawn: its line is.
    done.push(onBackupChange(() => { sec.backups.sub.textContent = backupLine(); }));
    // The display choices are kept on the device, not in the data: their line follows every change, made in the panel or in Aa.
    const onPrefs = () => { sec.display.sub.textContent = cap(prefsSummary()); };
    window.addEventListener('tourbook-prefs', onPrefs); done.push(() => window.removeEventListener('tourbook-prefs', onPrefs));

    root.append(
      h('div', { class: 'page-head' }, h('h1', null, 'Settings')),
      h('div', { class: 'se-list' }, Object.values(sec).filter(Boolean).map(s => s.el)));
    return () => {
      done.forEach(f => { try { f(); } catch { /* already gone */ } });
      if (window.logiPage && window.logiPage() !== 'settings') { S.erase = ''; S.behind = null; leave(); } // leaving Settings disarms the erase button, and its time is noted
    };
  },
  tutorial: () => [
    { title: 'Settings', text: 'Everything that isn’t a booking or a record. Tap a section to open it; each one says where it stands on its closed line.', target: ['#page .page-head'] },
    ...SECTIONS.filter(([id]) => (id !== 'billing' || moneyShown()) && (id !== 'sample' || sampleCount() > 0)).map(([id, title, text]) => ({ title: typeof title === 'function' ? title() : title, text: typeof text === 'function' ? text() : text, target: [`#se-${id} > summary`] })),
  ],
};

sheetTutorial('Your details', [
  { title: 'Who you are', text: 'Your name, and your business, band or project name, as they should read on day sheets and invoices.', target: ['[data-key="name"]'] },
  { title: 'How to reach you', text: 'Phone, email and website go on your contact card and on your documents.', target: ['[data-key="phone"]'] },
  { title: 'Postal address', text: 'For invoices: some clients need it there before they can pay.', target: ['[data-key="address"]'] },
  { title: 'Currency', text: 'Pick your country: its currency is used for every fee, deal and settlement, and for your quotes and invoices (one for work abroad can have its own). This device’s country comes first.', target: ['[data-key="currency"]'] },
]);
