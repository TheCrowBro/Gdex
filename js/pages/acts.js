// Acts: the bands and artists the person plays in, manages or produces. The list is a drop-down of cards: closed, a card
// shows how many times you have seen the act play, its scores out of 100 and its dates coming up on the calendar; open, it
// shows the log of each time you saw them (date, where, score, notes). Then one act's page in three
// parts: Overview (links, contact, bookings coming up, members, songs), Press kit (a one-page EPK and a big QR code for
// the merch desk) and Tech rider (input list, stage plot, riders, printed for the sound engineer). The documents live in
// js/acts-docs.js, the rider editors in js/acts-rider.js.
// The role (js/roles.js) names the section (Artists, Roster, Bands, My act), orders the list (A to Z, latest score, last
// seen), keeps the times-seen line back until something is logged for a role that doesn't score its own acts, and may
// keep an act's page to its Overview, with the log at the top. The role's names never reach the press kit or the rider:
// those go to other people.
import { h, empty, backBtn, telUrl, toast, sheet, fmtShort, daysUntil, todayISO, parseISO, uid } from '../util.js';
import { db, byId, upsert, update, remove, upcoming, redraw } from '../store.js';
import { venueOf, kindIcon, kindLabel, statusLabel, statusTone, playTime, playLabel, PEOPLE_GROUPS, setlistLength, fmtDur, seenOf, seenStats, seenWhere, ratingOf, actUpcoming, isLive, coversDay, seenEntryFor, actShowsOn, onlyShowOn, byDayPlayDesc } from '../model.js';
import { openForm } from '../form.js';
import { sheetTutorial } from '../tour.js';
import { openBooking, newBooking } from './bookings.js';
import { parseLinks, ACT_COLORS, colorOf, stripeStyle, roleOf, membersOf, initials, plural, qrTarget, fillQr, epkDoc, printEpk, saveEpk,
  inputTable, inputRows, dupChannels, saveInputCsv, plotOf, saveRider, printRider as printRiderDoc } from '../acts-docs.js';
import { openInputList, openRiders, stagePlot } from '../acts-rider.js';
import { sectionName, pageOpt, moneyShown, newKind } from '../roles.js';
// An act's earlier names ("formerly The Night Owls"): every reading of them is the model's.
import { earlierNames, earlierSpans, formerName, nameSince, formerlyOn, formerlyOf, cleanFormer, sameName } from '../model.js';

// View state survives the redraw after every change: which act is open, which part of it, the search.
const S = { view: 'list', id: null, tab: 'about', q: '', allBk: false, open: new Set() }; // open: the act cards dropped open on the list
const people = fn => import('./people.js').then(fn).catch(e => { console.error(e); toast('People could not be opened.'); });
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
const toTop = () => setTimeout(() => window.scrollTo(0, 0), 0);
const focusSoon = sel => setTimeout(() => { const el = document.querySelector(sel); if (el) el.focus({ preventScroll: true }); }, 0);
// The section's name for the role ('Roster', 'My act'…): the page's heading, its back button and its toasts.
const secName = () => sectionName('acts', 'Acts');
// The act page's parts the role keeps (pages.acts.tabs, ['about'] for a scout): a role that trims them follows acts
// rather than playing in them, so its Overview leads with the times seen.
const TABS = [['about', 'Overview'], ['epk', 'Press kit'], ['rider', 'Tech rider']];
const keptTabs = () => { const want = pageOpt('acts', 'tabs', null); const list = Array.isArray(want) ? TABS.filter(([id]) => want.includes(id)) : []; return list.length ? list : TABS; };
const hasTab = id => keptTabs().some(([t]) => t === id);
const seenOnPage = () => Array.isArray(pageOpt('acts', 'tabs', null));
// A role that doesn't score its own acts (pages.acts.seen 'logged') sees the times seen only once something is logged.
const seenHidden = a => pageOpt('acts', 'seen', 'always') === 'logged' && !seenOf(a).length;
// What + Book on an act's page makes: the role's usual kind of booking. A role without money goes to the act's shows
// rather than booking them, so it adds a show of theirs to its calendar.
const BOOK = { show: ['+ Book a show', 'show'], session: ['+ Book a session', 'session'], rehearsal: ['+ Book a rehearsal', 'rehearsal'], other: ['+ Add a diary entry', 'diary entry'] };
const bookKind = () => (moneyShown() && BOOK[newKind()] ? newKind() : 'show');
const book = () => (moneyShown() ? BOOK[bookKind()] : ['+ Add a show', 'show']);
// "4 members", or "No members yet" unless the role has no use for members (no money: it follows acts, it doesn't run them).
const membersText = n => (n ? plural(n, 'member') : moneyShown() ? 'No members yet' : '');
const GENRES = ['Indie rock', 'Rock', 'Pop', 'Alt R&B', 'R&B / Soul', 'Hip-hop', 'Electronic', 'Dance', 'Jazz', 'Folk', 'Country', 'Americana',
  'Singer-songwriter', 'Metal', 'Punk', 'Blues', 'Funk', 'Reggae', 'Latin', 'Classical', 'World', 'Gospel', 'Covers band', 'Function / wedding band'];

/* ------------------------------- the shared API ------------------------------- */
// Go to Acts and show this act. Resolves once it is drawn.
export function openAct(id) {
  if (!byId('acts', id)) { toast(`That act is no longer in ${secName()}.`); return Promise.resolve(); }
  Object.assign(S, { view: 'act', id, tab: 'about', allBk: false });
  return Promise.resolve(window.logiGo ? window.logiGo('acts') : null).then(() => { redraw(); toTop(); focusSoon('.ac-view .back-btn'); });
}
// Go to Acts and show one time seen in the act's log: the list, with the act's card dropped open, that entry in view
// and the focus on its Edit button (the search opens a logged time this way). Resolves once it is drawn, with the
// entry's row, or null when the act or the entry is not there any more.
export function openSeen(actId, seenId) {
  if (!byId('acts', actId)) { toast(`That act is no longer in ${secName()}.`); return Promise.resolve(null); }
  Object.assign(S, { view: 'list', id: null, q: '' }); // the list unfiltered, so the act's card is on it
  S.open.add(actId);
  return Promise.resolve(window.logiGo ? window.logiGo('acts') : null).then(() => new Promise(done => {
    redraw();
    setTimeout(() => { // after the draw that follows
      const at = seenOf(byId('acts', actId)).findIndex(s => s.id === seenId);
      const row = at < 0 ? null : document.querySelectorAll(`.ac-card[data-id="${CSS.escape(actId)}"] .ac-seen`)[at] || null;
      const btn = row ? row.querySelector('button') : document.getElementById('ac-head-' + actId);
      if (btn) { btn.focus({ preventScroll: true }); (row || btn).scrollIntoView({ block: 'center' }); }
      done(row);
    }, 0);
  }));
}

// The act's form. A new act gets the next colour no other act uses. onSaved(record) after a save.
const FORM_KEYS = ['name', 'genre', 'color', 'bio', 'links', 'email', 'phone', 'notes'];
export function editAct(a = {}, onSaved) {
  const cur = (a && a.id && byId('acts', a.id)) || a || {};
  const isNew = !cur.id;
  const colors = ACT_COLORS.slice();
  if (cur.color && !colors.some(c => c[0] === cur.color)) colors.push([cur.color, 'Its own colour']);
  const used = new Set(db.acts.map(x => x.color));
  const fresh = (ACT_COLORS.find(([c]) => c && !used.has(c)) || ACT_COLORS[1])[0];
  let names = null, pick = null; // the form's Earlier names (names.read()); the answer to "New name?" while its save runs
  openForm({
    title: isNew ? 'New act' : 'Edit act',
    values: { ...cur, color: isNew && cur.color == null ? fresh : colorOf(cur) || cur.color || '' },
    fields: [
      { key: 'name', label: 'Name', required: true, placeholder: 'Band or artist name' },
      { key: 'genre', label: 'Genre', list: GENRES, placeholder: 'e.g. Indie rock' },
      { key: 'color', label: 'Colour', type: 'select', options: colors, hint: 'The stripe on the act’s cards.' },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'band@…' },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'links', label: 'Links', type: 'textarea', rows: 4, placeholder: 'Website: https://…\nSpotify: https://…\nInstagram: https://…', hint: 'One per line: a name, a colon, then the address.' + (hasTab('epk') ? ' The first one is the QR code on the press kit.' : '') },
      { key: 'bio', label: 'Bio', type: 'textarea', rows: 5, placeholder: hasTab('epk') ? 'Two or three sentences for promoters and press: who you are, what you sound like, where you’ve played.' : 'A few lines on who they are, what they sound like and where they’ve played.' },
      { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, placeholder: 'Only you see these.' },
    ],
    saveLabel: isNew ? 'Add act' : 'Save',
    onReady: form => {
      const name = form.querySelector('input[data-key=name]');
      names = namesEditor(cur);
      (name && name.closest('.field') ? name.closest('.field') : form.firstElementChild).after(names.node);
      if (isNew || !name || !form.parentNode) return;
      // A changed name is asked about once, as it is saved: a new name, or a spelling fix? The sheet's body hears the
      // submit before the form's own handler (js/form.js, which closes the form and saves), so the form stays open
      // under the question with everything typed in it; the answer sends the same submit again, and that one saves.
      // No question when the names differ only in capitals, spaces or punctuation, or when the old name was empty.
      form.parentNode.addEventListener('submit', e => {
        const old = (byId('acts', cur.id) || {}).name, now = name.value.trim();
        if (e.target !== form || pick || typeof old !== 'string' || !old.trim() || !now || sameName(old, now)) return;
        e.preventDefault(); e.stopPropagation();
        askRename({ old: old.trim(), now, since: nameSince({ name: old, formerNames: names.read() }),
          onPick: answer => { pick = answer; try { if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } finally { pick = null; } },
          back: () => { if (form.isConnected && !form.contains(document.activeElement)) name.focus(); } });
      }, true);
    },
    onSave: v => {
      const latest = (cur.id && byId('acts', cur.id)) || {};
      if (cur.id && !latest.id) return toast('That act was deleted meanwhile.');
      const fields = Object.fromEntries(FORM_KEYS.map(k => [k, typeof v[k] === 'string' ? v[k].trim() : (v[k] ?? '')]));
      if (!fields.name) fields.name = latest.name || 'Untitled act';
      // The earlier names as the form has them, and with them the name being replaced when the answer was "It’s a new
      // name" (a spelling fix keeps nothing). An act that never had any is not given an empty list.
      const kept = pick && pick.kind === 'new' && typeof latest.name === 'string' && latest.name.trim() ? { name: latest.name.trim(), until: pick.since } : null;
      const former = cleanFormer([...(names ? names.read() : earlierNames(latest)), kept], fields.name); // no editor (it failed to draw): the stored names stay
      const rec = upsert('acts', { members: [], inputList: [], stagePlot: [], riderTech: '', riderHospitality: '', ...cur, ...latest, ...fields, ...(former.length || 'formerNames' in latest ? { formerNames: former } : {}) });
      toast(isNew ? `${rec.name} added` : kept ? `Saved. ${kept.name} is kept as an earlier name.` : 'Saved');
      if (onSaved) onSaved(rec);
    },
    onDelete: isNew ? null : () => deleteAct(cur.id, true),
  });
}
export const printRider = actId => printRiderDoc(actId);

/* ------------------------------- earlier names ------------------------------- */
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const longDay = iso => parseISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
// When a name was in use, for the act's page: "from 3 Mar 2021 until 12 Nov 2026", "until 3 Mar 2021" for the first
// one (nobody said when it began), "date not known" for a name added without a day.
const spanText = n => (!n.until ? 'date not known' : n.from ? `from ${longDay(n.from)} until ${longDay(n.until)}` : `until ${longDay(n.until)}`);
// In an act's own lists (its dates, its past shows, its log) the act's name is not on each row, so a row from before
// it changed its name says which name it had that night: "as The Night Owls".
const asName = b => { const was = formerlyOf(b); return was ? ` · as ${was}` : ''; };

// The Earlier names part of the act form, under Name: a row for each name with the day it stopped being used (it can
// be corrected, or left empty when nobody knows it), ✕ to take a name away, and a button to add one by hand (an act
// that changed its name before it was kept here). With no name yet there is only the button, so a new act's form
// stays short. read() gives the rows as typed, [{ name, until }], the last row first: oldest first, as they are
// stored, so names without a day keep their order from save to save. The save cleans them (model.cleanFormer).
// A day typed here may not be after today; a stored day that is (a backup made a time zone ahead, a clock set wrong)
// is kept as it is until the person changes it, so it never stops a save of something else on the form.
function namesEditor(a) {
  const today = todayISO(), rows = earlierNames(a).reverse().map(n => ({ ...n })); // the latest first, as on the act's page
  const later = new Map(rows.filter(r => r.until > today).map(r => [r, r.until])); // each row whose stored day is after today
  const maxOf = r => (later.has(r) && r.until === later.get(r) ? r.until : today);
  const list = h('div', { class: 'ac-was-rows' });
  const label = h('span', { class: 'ac-was-label' }, 'Earlier names');
  const hint = h('small', { class: 'muted' }, 'A name used before, and the day it stopped being used (leave the day empty if you don’t know it). Shows and scores from before that day say “formerly …”.');
  const delLabel = r => (r.name.trim() ? `Remove the earlier name ${r.name.trim()}` : 'Remove this earlier name');
  const draw = (focusAt = -1) => {
    label.hidden = hint.hidden = !rows.length;
    list.replaceChildren(...rows.map((r, i) => {
      const del = h('button', { type: 'button', class: 'icon-btn ac-was-del', 'aria-label': delLabel(r), onclick: () => { rows.splice(i, 1); draw(i); } }, '✕');
      return h('div', { class: 'ac-was-row', role: 'group', 'aria-label': `Earlier name ${i + 1}` },
        h('input', { type: 'text', class: 'ac-was-name', 'aria-label': 'Earlier name', placeholder: 'Earlier name', value: r.name, autocomplete: 'off', oninput: e => { r.name = e.target.value; del.setAttribute('aria-label', delLabel(r)); } }),
        h('label', { class: 'ac-was-until' }, h('span', null, 'Used until'), h('input', { type: 'date', max: maxOf(r), value: r.until, oninput: e => { r.until = e.target.value; e.target.max = maxOf(r); } })),
        del);
    }));
    // After ✕ the next name takes the focus (the last one, when the last was removed), or the button when none is left.
    if (focusAt >= 0) (list.querySelectorAll('.ac-was-name')[Math.min(focusAt, rows.length - 1)] || add).focus();
  };
  const add = h('button', { type: 'button', class: 'btn ghost small', id: 'ac-was-add', onclick: () => { rows.push({ name: '', until: '' }); draw(rows.length - 1); } }, '+ Add an earlier name');
  draw();
  const node = h('div', { class: 'field wide ac-was', role: 'group', 'aria-label': 'Earlier names' }, label, list, h('div', { class: 'ac-was-more' }, add), hint);
  return { node, read: () => rows.map(r => ({ name: r.name.trim(), until: r.until })).reverse() };
}

// "New name?": one of Gdex's own sheets, over the act form, asked once as a changed name is saved. It shows the old
// and the new name, a "Since when?" day (today; it can go back to the day the old name began, `since`, never past
// today) and two answers. onPick({ kind: 'new' | 'fix', since }) after an answer; closing it without one gives none:
// the form under it is as it was, and back() puts the focus in it.
const RENAME = 'New name?';
function askRename({ old, now, since, onPick, back }) {
  const today = todayISO(), min = isDay(since) && since <= today ? since : '';
  const date = h('input', { type: 'date', id: 'ac-rename-since', value: today, max: today, min: min || null, 'aria-describedby': 'ac-rename-hint ac-rename-err' });
  const err = h('p', { class: 'warn small', id: 'ac-rename-err', role: 'alert', hidden: true });
  let el = null, close = () => {}, answered = false;
  const wrong = msg => { err.textContent = msg; err.hidden = false; date.focus(); };
  const choose = kind => {
    const day = kind === 'new' ? date.value : '';
    if (kind === 'new' && !isDay(day)) return wrong('Pick the day the new name began.');
    if (kind === 'new' && day > today) return wrong('That day hasn’t come yet. Pick today or an earlier day.');
    if (kind === 'new' && min && day < min) return wrong(`${old} only began on ${longDay(min)}. Pick that day or a later one.`);
    answered = true; close(); onPick({ kind, since: day });
  };
  date.addEventListener('input', () => { err.hidden = true; });
  const body = h('div', { class: 'stack ac-rename' },
    h('p', { class: 'ac-rename-names', id: 'ac-rename-names' }, h('span', { class: 'ac-rename-old' }, old), h('span', { class: 'ac-rename-arrow', 'aria-hidden': 'true' }, '→'), h('span', { class: 'sr-only' }, ' becomes '), h('strong', { class: 'ac-rename-now' }, now)),
    h('span', { id: 'ac-rename-said', hidden: true }, `${old} becomes ${now}.`), // what the sheet is read out with: a sentence of its own before the question
    h('p', { class: 'ac-rename-q', id: 'ac-rename-q' }, 'Did the name change, or are you fixing the spelling?'),
    h('div', { class: 'field' }, h('label', { for: 'ac-rename-since' }, 'Since when?'), date, h('small', { class: 'muted', id: 'ac-rename-hint' }, 'The day the new name began. Move it back if the name changed a while ago.')),
    err,
    h('div', { class: 'actions ac-rename-answers' },
      h('button', { type: 'button', class: 'btn primary', id: 'ac-rename-new', onclick: () => choose('new') }, 'It’s a new name'),
      h('button', { type: 'button', class: 'btn ghost', id: 'ac-rename-fix', onclick: () => choose('fix') }, 'Just fixing the spelling')),
    h('p', { class: 'small muted' }, `A new name keeps ${old} as an earlier name: shows and scores from before that day say “formerly ${old}”. A spelling fix keeps nothing of the old spelling.`));
  ({ el, close } = sheet(RENAME, body, { onClose: () => { if (!answered) back(); } }));
  el.setAttribute('aria-describedby', 'ac-rename-said ac-rename-q'); // read out with the sheet's name as the focus arrives
  setTimeout(() => { if (el.isConnected && !body.contains(document.activeElement)) date.focus(); }, 60);
}

function deleteAct(id, confirmed = false) {
  const a = byId('acts', id);
  if (!a) return;
  if (!confirmed) {
    const nb = db.bookings.filter(b => b.actId === id).length, ns = db.songs.filter(s => s.actId === id).length, nl = db.setlists.filter(s => s.actId === id).length;
    const kept = [nb && plural(nb, 'booking'), ns && plural(ns, 'song'), nl && plural(nl, 'setlist')].filter(Boolean);
    const list = kept.length > 1 ? kept.slice(0, -1).join(', ') + ' and ' + kept[kept.length - 1] : kept[0];
    if (!confirm(`Delete ${a.name || 'this act'}?${list ? ` Its ${list} stay, without an act.` : ''} Its members stay in People.`)) return;
  }
  if (S.id === id) Object.assign(S, { view: 'list', id: null });
  remove('acts', id);
  toast(`${a.name || 'Act'} deleted`);
  toTop();
}

/* ------------------------------- the list ------------------------------- */
const newAct = () => editAct({}, rec => openAct(rec.id));
function whenText(b) {
  const t = todayISO();
  if (b.date <= t && t <= (b.endDate || b.date) && b.date !== t) return 'On now';
  const n = daysUntil(b.date);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : fmtShort(b.date);
}
const whereText = b => { const v = venueOf(b).name; return (v ? `${kindLabel(b.kind)} at ${v}` : kindLabel(b.kind)) + asName(b); };

/* ------------------------------- the drop-down cards ------------------------------- */
const yearOf = iso => String(iso).slice(0, 4);
const seenDate = iso => { const d = parseISO(iso), y = yearOf(iso) !== String(new Date().getFullYear()); return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) }); };
const scoreBar = r => h('span', { class: 'ac-score', role: 'img', 'aria-label': `${r} out of 100` }, h('b', null, String(r)), h('span', { class: 'ac-score-of', 'aria-hidden': 'true' }, '/100'),
  h('span', { class: 'ac-score-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${r}%` })));
function toggle(id) { if (S.open.has(id)) S.open.delete(id); else S.open.add(id); redraw(); focusSoon(`#ac-head-${CSS.escape(id)}`); }

function actCard(a) {
  const open = S.open.has(a.id), st = seenStats(a), ahead = actUpcoming(a), n = membersOf(a).length, songs = db.songs.filter(s => s.actId === a.id).length;
  const name = a.name || 'Untitled act', panelId = 'ac-pnl-' + a.id;
  const sub = [a.genre, membersText(n), songs > 0 && plural(songs, 'song')].filter(Boolean).join(' · ');
  const seenLine = st.times
    ? [h('span', { class: 'ac-seen-n' }, `Seen ${st.times === 1 ? 'once' : st.times + ' times'}`),
      st.avg != null && h('span', null, ' · average ', h('b', null, String(st.avg)), '/100'), st.latest != null && st.times > 1 && h('span', null, ' · latest ', h('b', null, String(st.latest)))]
    : h('span', { class: 'muted' }, 'Not seen live yet');
  const head = h('button', { type: 'button', class: 'ac-card-head', id: 'ac-head-' + a.id, 'aria-expanded': String(open), 'aria-controls': panelId, onclick: () => toggle(a.id) },
    h('span', { class: 'ac-card-top' }, h('span', { class: 'ac-card-name' }, name), h('span', { class: 'ac-chev', 'aria-hidden': 'true' }, '▾')),
    formerName(a) && h('span', { class: 'ac-formerly' }, 'formerly ' + formerName(a)),
    !!sub && h('span', { class: 'ac-card-sub muted' }, sub),
    !seenHidden(a) && h('span', { class: 'ac-seen-line' }, seenLine));
  const dates = h('div', { class: 'ac-dates', role: 'list', 'aria-label': `${name}: coming up on the calendar` },
    ahead.length ? [h('span', { class: 'ac-dates-head small muted' }, 'Coming up'), ...ahead.slice(0, 3).map(b => h('button', { type: 'button', role: 'listitem', class: 'ac-date', onclick: () => openBooking(b.id), 'aria-label': `${whenText(b)}: ${whereText(b)}. Open the booking` },
      h('span', { 'aria-hidden': 'true' }, kindIcon(b.kind)), h('b', null, whenText(b)), h('span', { class: 'ac-date-where' }, whereText(b)))),
      ahead.length > 3 && h('span', { class: 'small muted ac-dates-more' }, `and ${ahead.length - 3} more`)]
      : h('span', { class: 'small muted' }, 'Nothing on the calendar yet'));
  return h('div', { class: 'card ac-card' + (open ? ' open' : ''), style: stripeStyle(a), 'data-id': a.id }, head, dates,
    open && h('div', { class: 'ac-pnl', id: panelId, role: 'region', 'aria-labelledby': 'ac-head-' + a.id }, seenPanel(a)));
}

// The log of each time you saw the act, newest first, and the ways to add to it. Under a card it ends with Open the
// act; on the act's own page (onPage, for a role that keeps the act to its Overview) it heads the Overview instead.
function seenPanel(a, onPage = false) {
  const list = seenOf(a), st = seenStats(a), past = pastShows(a);
  const logBtn = tone => h('button', { type: 'button', class: `btn ${tone} small`, id: 'ac-log-' + a.id, onclick: () => logSighting(a) }, '+ Log a time you saw them');
  const pastBtn = past.length > 0 && h('button', { type: 'button', class: 'btn ghost small', id: 'ac-past-' + a.id, onclick: () => fromPastShow(a, past) }, '📅 From a past show');
  const openBtn = tone => h('button', { type: 'button', class: `btn ${tone} small`, id: 'ac-open-' + a.id, onclick: () => openAct(a.id) }, 'Open the act ›');
  // A role that doesn't score its own acts, before anything is logged: the card is the way in to the act, and logging
  // a time seen waits under it.
  if (!onPage && seenHidden(a)) return [h('div', { class: 'actions ac-pnl-actions ac-pnl-lead' }, openBtn('primary'), logBtn('ghost'), pastBtn)];
  const best = st.best != null && st.times > 1 && h('span', { class: 'small muted' }, `best ${st.best}/100`);
  return [
    h('div', { class: 'ac-pnl-head' }, onPage ? h('h3', { id: 'ac-h-seen' }, 'Times seen') : h('strong', null, 'Times seen'), best),
    list.length ? h('ol', { class: 'ac-seen-list', 'aria-label': `Times you saw ${a.name || 'this act'}` }, list.map(s => {
      const r = ratingOf(s), where = seenWhere(s), was = formerlyOn(a, s.date);
      return h('li', { class: 'ac-seen' },
        h('div', { class: 'ac-seen-main' },
          h('span', { class: 'ac-seen-when' }, h('b', null, seenDate(s.date)), where && h('span', { class: 'muted' }, ' · ' + where)),
          was && h('span', { class: 'ac-as' }, `as ${was}`), // a night from before the act changed its name
          r != null ? scoreBar(r) : h('span', { class: 'small muted' }, 'No score'),
          s.notes && h('p', { class: 'small ac-seen-notes' }, s.notes)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Edit the time you saw them on ${seenDate(s.date)}`, onclick: () => logSighting(a, s) }, '✎'));
    })) : h('p', { class: 'small muted' }, 'Each time you see them play, log the date, where, and a score out of 100. The card adds them up.'),
    h('div', { class: 'actions ac-pnl-actions' }, logBtn('primary'), pastBtn, !onPage && openBtn('ghost')),
  ];
}

// The act's shows up to today that are not in the log yet: a quick way to log one you were at, tonight's included. A
// role with money leaves out holds and offers (they never happened); a role without money doesn't track deals, so only
// a cancelled show is left out. A show is in the log when an entry carries its id, or, on a day it is the act's only show,
// an entry without one has its date (model.seenEntryFor). A show marked "Didn’t go" (the No to "Did you see them?",
// booking.went) is not offered either: the person said they were not there.
const pastShows = a => {
  const today = todayISO(), money = moneyShown();
  return (db.bookings || []).filter(b => b.actId === a.id && isLive(b) && b.date && b.date <= today && b.kind === 'show' && !(money && ['hold', 'offer'].includes(b.status)) && b.went !== 'no' && !seenEntryFor(a, b))
    .sort(byDayPlayDesc); // newest day first; on one day, in the order they played
};
function fromPastShow(a, past) {
  let close = () => {};
  const today = todayISO();
  ({ close } = sheet('From a past show', h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, `Shows of ${a.name || 'this act'} on your calendar, up to today, that are not in its log yet. Pick one to log it with its date and place.`),
    h('div', { class: 'list' }, past.slice(0, 20).map(b => h('button', { type: 'button', class: 'card tap ac-pick', onclick: () => { close(); logSighting(a, { date: b.date, venueId: b.venueId || '', where: b.venueId ? '' : (b.venueName || ''), bookingId: b.id }); } },
      h('strong', null, b.date === today ? 'Today' : seenDate(b.date)), h('span', { class: 'small muted' }, whereText(b))))))));
}

// The act's show a time seen on this day was at: its only show that day (not cancelled), or on a day with more than one
// (a showcase festival), the one at the venue picked. null when it can't tell.
function showFor(actId, iso, venueId) {
  const one = onlyShowOn(actId, iso);
  if (one || !venueId) return one;
  const at = actShowsOn(actId, iso).filter(b => b.venueId === venueId);
  return at.length === 1 ? at[0] : null;
}
// A time seen belongs to that show when no other entry has it: then Score this show and From a past show don't offer
// it again. '' otherwise. exceptId is the entry being saved, which may have it already.
function showThatDay(actId, iso, exceptId = '', venueId = '') {
  const x = byId('acts', actId) || {}, b = showFor(actId, iso, venueId);
  return b && !(x.seen || []).some(e => e && e.id !== exceptId && e.bookingId === b.id) ? b.id : '';
}
// Every save links the entry again, so the link follows its date: the booking it had (or Score this show gave it) while
// that is still the act's show, not cancelled, on the entry's day; else the show that day, as above.
function linkFor(actId, entry, wasId) {
  const b = wasId ? byId('bookings', wasId) : null;
  return b && b.actId === actId && isLive(b) && coversDay(b, entry.date) ? b.id : showThatDay(actId, entry.date, entry.id, entry.venueId);
}
// Writes one entry (new or changed) to the act's log: it goes at the end, with when it was saved, so it is the latest of its day.
// A score given for a show that was marked "Didn’t go" replaces that answer: the mark comes off the booking in the same write.
function putSeen(actId, entry) {
  update(d => {
    const x = d.acts.find(r => r.id === actId); if (!x) return;
    const list = Array.isArray(x.seen) ? x.seen.filter(e => e && e.id !== entry.id) : []; x.seen = [...list, entry]; x.updatedAt = Date.now(); // e &&: a log from an old backup can hold an empty entry
    const b = entry.bookingId ? d.bookings.find(r => r.id === entry.bookingId) : null;
    if (b && 'went' in b) { delete b.went; b.updatedAt = Date.now(); }
  });
}
// After a change to the log the list may re-sort (a role that orders by score or by last seen). The card stays open,
// and app.js gives the focus back by id to the button used; when that one has gone (the last past show is logged),
// + Log a time you saw them takes it. Either way it is brought into view.
function refocus(id) {
  setTimeout(() => {
    const page = document.getElementById('page');
    if (!page || document.querySelector('.sheet-back') || (window.logiPage && window.logiPage() !== 'acts')) return;
    let el = document.activeElement;
    if (!el || el === page || !page.contains(el)) { el = document.getElementById('ac-log-' + id); if (el) el.focus({ preventScroll: true }); }
    if (!el || el === page || !page.contains(el)) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' });
  }, 60);
}

// Add or edit one time seen. A score from 1 to 100 (a slider beside the box); where is one of your venues or typed.
export function logSighting(a, s = {}) { // shared: bookings.js offers it as Score this show
  const editing = !!s.id, venues = [...db.venues].sort(byName);
  openForm({
    title: editing ? 'Edit a time seen' : 'Log a time seen',
    values: { date: todayISO(), rating: 75, ...s, venueId: s.venueId || '', where: s.venueId ? '' : (s.where || '') },
    fields: [
      { key: 'date', label: 'When', type: 'date', required: true },
      { key: 'venueId', label: 'Where', type: 'select', options: [['', 'Somewhere not in my venues'], ...venues.map(v => [v.id, v.name || 'Unnamed venue'])] },
      { key: 'where', label: 'Or type the place', placeholder: 'e.g. The Crown, Bristol' },
      { key: 'rating', label: 'Score out of 100', type: 'number', min: 1, max: 100, step: 1, required: true, hint: '1 is the worst you have seen them, 100 the best.' },
      { key: 'notes', label: 'Notes', type: 'textarea', rows: 2, placeholder: 'The set, the sound, the crowd, new songs…' },
    ],
    onReady: form => {
      // A slider beside the score box, kept in step with it; the typed-place box only while no venue is picked.
      form.prepend(h('p', { class: 'ac-form-act' }, h('span', { class: 'ac-form-dot', 'aria-hidden': 'true', style: stripeStyle(a) }), a.name || 'Untitled act'));
      const box = form.querySelector('input[data-key=rating]'), venue = form.querySelector('select[data-key=venueId]'), where = form.querySelector('input[data-key=where]');
      if (box) {
        const slider = h('input', { type: 'range', min: 1, max: 100, step: 1, value: box.value || 75, class: 'ac-slider', 'aria-label': 'Score out of 100, slider' });
        slider.addEventListener('input', () => { box.value = slider.value; });
        box.addEventListener('input', () => { const v = Math.round(Number(box.value)); if (v >= 1 && v <= 100) slider.value = v; });
        box.after(slider);
      }
      const sync = () => { const f = where && where.closest('.field'); if (f) f.hidden = !!(venue && venue.value); };
      if (venue) venue.addEventListener('change', sync);
      sync();
      // The form opens with a date and a score in it, so Enter saves it as it stands. A held Enter (the press that
      // opened the form, still down) must not: nobody gave that score. In the notes it still starts new lines.
      form.addEventListener('keydown', e => { if (e.repeat && e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); });
    },
    onSave: v => {
      const rating = Math.min(100, Math.max(1, Math.round(Number(v.rating)) || 1));
      const entry = { id: s.id || uid(), date: v.date || todayISO(), venueId: v.venueId || '', where: v.venueId ? '' : String(v.where || '').trim(), rating, notes: String(v.notes || '').trim(), bookingId: '', savedAt: Date.now() };
      entry.bookingId = linkFor(a.id, entry, s.bookingId);
      S.open.add(a.id);
      // A new time seen on a night already in the log (the act's show that day has an entry, scored from the booking or
      // logged before): ask before counting the night twice. OK updates that entry; Cancel logs this one as well.
      const cur = byId('acts', a.id) || a;
      const show = !editing && (byId('bookings', entry.bookingId) || showFor(a.id, entry.date, entry.venueId));
      const had = show ? seenEntryFor(cur, show) : null;
      if (had && had.id !== entry.id) {
        const r = ratingOf(had), name = cur.name || 'them';
        if (confirm(r != null ? `You already scored ${name} that night (${r}/100). Update that score instead?` : `You already logged ${name} that night. Update it with this score instead?`)) {
          const place = entry.venueId || entry.where ? { venueId: entry.venueId, where: entry.where } : { venueId: had.venueId || '', where: had.venueId ? '' : had.where || '' };
          const upd = { ...had, ...place, rating, notes: entry.notes || had.notes || '', savedAt: entry.savedAt };
          upd.bookingId = linkFor(a.id, upd, had.bookingId);
          putSeen(a.id, upd);
          toast(`Updated: ${rating}/100`);
          refocus(a.id);
          return;
        }
      }
      putSeen(a.id, entry);
      toast(editing ? 'Saved' : `Logged: ${rating}/100`);
      refocus(a.id);
    },
    onDelete: editing ? () => { update(d => { const x = d.acts.find(r => r.id === a.id); if (!x) return; x.seen = (Array.isArray(x.seen) ? x.seen : []).filter(e => e && e.id !== s.id); x.updatedAt = Date.now(); }); toast('Removed from the log'); refocus(a.id); } : null,
    confirmDelete: `Remove the time you saw ${a.name || 'them'} on ${s.date ? seenDate(s.date) : 'this date'}?`,
  });
}

// The list's order for the role (pages.acts.order): 'name', A to Z; 'latest', the best latest score first, then the
// best average (a scout's shortlist, where an act getting better rises); 'recent', the one seen last first (a gig
// diary). Acts seen without a score come after the scored ones, and acts never seen go last, both A to Z.
function ordered(list) {
  const how = pageOpt('acts', 'order', 'name');
  if (how !== 'latest' && how !== 'recent') return list.sort(byName);
  const st = new Map(list.map(a => [a.id, seenStats(a)]));
  const rank = x => (!x.times ? 2 : how === 'latest' && x.latest == null ? 1 : 0);
  const desc = (p, q) => (q ?? -1) - (p ?? -1);
  return list.sort((x, y) => {
    const p = st.get(x.id), q = st.get(y.id);
    return rank(p) - rank(q) || (how === 'recent' ? String(q.last).localeCompare(String(p.last)) : desc(p.latest, q.latest) || desc(p.avg, q.avg)) || byName(x, y);
  });
}
// The empty list: the role's own words (pages.acts.empty), or what an act is, under the section's name for the role.
const emptyText = () => pageOpt('acts', 'empty', '') || (secName() === 'Acts' ? '' : `Nothing in ${secName()} yet. `) +
  'An act is a band or artist you play in, manage or produce. Its card counts the times you have seen them play, with your scores out of 100 and its dates coming up; it also keeps its members, links, press kit and tech rider.';

function listView() {
  const all = ordered([...db.acts]);
  const listBox = h('div', { class: 'list ac-list' });
  const fill = () => {
    const q = all.length > 5 ? S.q.trim().toLowerCase() : ''; // no search box, no filter
    const shown = q ? all.filter(a => [a.name, a.genre, ...membersOf(a).map(p => p.name), ...earlierNames(a).map(n => n.name)].join(' ').toLowerCase().includes(q)) : all;
    listBox.replaceChildren(...(shown.length ? shown.map(actCard) : [h('p', { class: 'muted ac-nomatch' }, `No act matches “${S.q.trim()}”.`)]));
  };
  if (all.length) fill();
  return h('div', { class: 'ac-page' },
    h('div', { class: 'page-head' }, h('h1', null, secName()), h('button', { type: 'button', class: 'btn primary', id: 'ac-new', onclick: newAct }, '+ New act')),
    all.length > 5 && h('input', { class: 'search', id: 'ac-search', type: 'search', placeholder: 'Search acts, genres, members…', 'aria-label': 'Search acts', value: S.q, autocomplete: 'off', oninput: e => { S.q = e.target.value; fill(); } }),
    all.length ? listBox : empty(emptyText(), h('button', { type: 'button', class: 'btn primary', id: 'ac-new-empty', onclick: newAct }, '+ New act')));
}

/* ------------------------------- one act ------------------------------- */
const setTab = t => { if (S.tab !== t) { S.tab = t; redraw(); } };
function back() { Object.assign(S, { view: 'list', id: null }); redraw(); toTop(); focusSoon('#ac-new'); }

function hero(a) {
  const links = parseLinks(a.links), sub = [a.genre, membersText(membersOf(a).length)].filter(Boolean).join(' · ');
  return h('div', { class: 'card ac-hero', style: stripeStyle(a) },
    h('h1', { class: 'ac-title' }, a.name || 'Untitled act'),
    formerName(a) && h('p', { class: 'ac-formerly' }, 'formerly ' + formerName(a)),
    !!sub && h('div', { class: 'muted' }, sub),
    links.length > 0 && h('div', { class: 'actions ac-links', role: 'list', 'aria-label': 'Links' }, links.map(l =>
      h('a', { class: 'btn ghost small', role: 'listitem', href: l.url, target: '_blank', rel: 'noopener noreferrer', title: l.url, 'aria-label': `${l.label} (opens ${l.url})` }, h('span', { 'aria-hidden': 'true' }, l.icon), ' ' + l.label))),
    (a.email || a.phone) && h('div', { class: 'actions ac-contact' },
      a.email && h('a', { class: 'btn ghost small', href: 'mailto:' + a.email, 'aria-label': 'Email ' + a.email }, '✉ ', h('span', { class: 'ac-addr' }, a.email)),
      a.phone && h('a', { class: 'btn ghost small', href: telUrl(a.phone), 'aria-label': 'Call ' + a.phone }, '📞 ', h('span', { class: 'ac-addr' }, a.phone))),
    !links.length && !a.email && !a.phone && h('p', { class: 'small muted ac-hint' }, hasTab('epk') ? 'No links or contact yet. ✎ Edit adds them: they make the buttons here, the press kit and its QR code.' : 'No links or contact yet. ✎ Edit adds them as buttons here.'));
}

// Back to the list, by its name for the role (‹ Roster); the plain Acts list keeps "All acts".
const backLabel = () => (secName() === 'Acts' ? 'All acts' : secName());
function actView(a) {
  const tabs = keptTabs(), part = S.tab === 'epk' ? epkTab(a) : S.tab === 'rider' ? riderTab(a) : aboutTab(a);
  return h('div', { class: 'ac-view' + (S.tab === 'rider' ? ' ac-view-rider' : '') },
    h('div', { class: 'page-head' }, backBtn(backLabel(), back), h('button', { type: 'button', class: 'btn ghost', id: 'ac-edit', 'aria-label': `Edit ${a.name || 'act'}`, onclick: () => editAct(a) }, '✎ Edit')),
    hero(a),
    // One part needs no tabs: the page is just that part.
    tabs.length > 1 ? [h('div', { class: 'seg wide ac-tabs', role: 'tablist', 'aria-label': 'Parts of the act' }, tabs.map(([id, label]) =>
      h('button', { type: 'button', role: 'tab', id: 'ac-tab-' + id, class: S.tab === id ? 'on' : '', 'aria-selected': String(S.tab === id), onclick: () => setTab(id) }, label))),
    h('div', { role: 'tabpanel', 'aria-labelledby': 'ac-tab-' + S.tab, class: 'ac-panel' }, part)]
      : h('div', { class: 'ac-panel' }, part));
}

/* Overview */
// On the act's own page the act's name would open every line, so a booking leads with its own title or its venue.
// The one time a row prints is the time its day is sorted by (js/store.js playField), so two shows on a day read in
// order: a show says which time that is (On stage 21:00; Doors 19:30 while there is no on-stage time yet), anything
// else gives its start.
const playWords = b => { const t = playTime(b); return t && b.kind === 'show' ? `${playLabel(b)} ${t}` : t; };
function bookingRow(b) {
  const d = parseISO(b.date), t = playWords(b), v = venueOf(b).name, kind = kindLabel(b.kind);
  const main = b.title || v || kind;
  return h('button', { type: 'button', class: 'card tap ac-bk', onclick: () => openBooking(b.id) },
    h('span', { class: 'ac-bk-date', 'aria-hidden': 'true' },
      h('span', null, d.toLocaleDateString(undefined, { weekday: 'short' })), h('b', null, String(d.getDate())), h('span', null, d.toLocaleDateString(undefined, { month: 'short' }))),
    // The text and the status: the pill drops under the text when the row is too narrow for both (css/acts.css).
    h('span', { class: 'ac-bk-body' },
      h('span', { class: 'ac-bk-main' },
        h('span', { class: 'sr-only' }, fmtShort(b.date) + (b.endDate && b.endDate > b.date ? ' to ' + fmtShort(b.endDate) : '') + ': '),
        h('strong', null, main === kind ? `${kindIcon(b.kind)} ${kind}` : main),
        h('span', { class: 'muted small' }, [main !== kind && `${kindIcon(b.kind)} ${kind}`, b.title && v, !v && 'Venue to be confirmed', t, b.endDate && b.endDate > b.date && 'until ' + fmtShort(b.endDate), formerlyOf(b) && 'as ' + formerlyOf(b)].filter(Boolean).join(' · '))),
      h('span', { class: 'pill ' + statusTone(b.status) }, statusLabel(b.status))));
}
function aboutTab(a) {
  const coming = upcoming().filter(b => b.actId === a.id);
  const shown = S.allBk ? coming : coming.slice(0, 4);
  const members = membersOf(a), emails = members.map(p => String(p.email || '').trim()).filter(Boolean);
  const songs = db.songs.filter(s => s.actId === a.id), sets = db.setlists.filter(s => s.actId === a.id);
  return h('div', { class: 'ac-cols ac-about' },
    // A role that follows acts (it keeps the act to its Overview) reads the times seen first.
    seenOnPage() && h('section', { class: 'ac-sec ac-about-seen', id: 'ac-seen', 'aria-labelledby': 'ac-h-seen' }, seenPanel(a, true)),
    h('section', { class: 'ac-sec', id: 'ac-coming', 'aria-labelledby': 'ac-h-coming' },
      h('h3', { id: 'ac-h-coming' }, 'Coming up'),
      coming.length ? h('div', { class: 'list ac-bks' }, shown.map(bookingRow)) : h('p', { class: 'muted ac-none' }, moneyShown() ? 'Nothing booked for this act yet.' : 'No shows of theirs on your calendar yet.'),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn primary small', id: 'ac-book', onclick: () => newBooking({ kind: bookKind(), actId: a.id }) }, book()[0]),
        coming.length > 4 && h('button', { type: 'button', class: 'btn ghost small', id: 'ac-allbk', 'aria-expanded': String(S.allBk), onclick: () => { S.allBk = !S.allBk; redraw(); } }, S.allBk ? 'Show fewer' : `Show all ${coming.length}`))),
    h('section', { class: 'ac-sec', id: 'ac-members', 'aria-labelledby': 'ac-h-members' },
      h('h3', { id: 'ac-h-members' }, 'Members'),
      members.length ? h('div', { class: 'ac-mlist' }, members.map(p => h('div', { class: 'card ac-member' },
        h('button', { type: 'button', class: 'ac-member-main', 'aria-label': `${p.name}${roleOf(p) ? ', ' + roleOf(p) : ''}: open their card`, onclick: () => people(m => m.openPerson(p.id)) },
          h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(p.name)),
          h('span', { class: 'ac-member-text' }, h('strong', null, p.name), roleOf(p) && h('span', { class: 'muted small' }, roleOf(p)))),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Take ${p.name} out of ${a.name}`, onclick: () => removeMember(a.id, p.id) }, '✕'))))
        : h('p', { class: 'muted ac-none' }, 'No members yet. Add the people who play in this act: they come from People.'),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn ghost small', id: 'ac-addm', onclick: () => openAddMembers(a.id) }, '+ Add member'),
        emails.length > 1 && h('a', { class: 'btn ghost small', id: 'ac-mailband', href: `mailto:${emails.join(',')}?subject=${encodeURIComponent(a.name || '')}` }, '✉ Email the band'))),
    h('section', { class: 'ac-sec', id: 'ac-songs', 'aria-labelledby': 'ac-h-songs' },
      h('h3', { id: 'ac-h-songs' }, 'Songs & setlists'),
      h('button', { type: 'button', class: 'card tap ac-songs-card', id: 'ac-open-songs', onclick: () => window.logiGo && window.logiGo('songs') },
        h('span', { class: 'ac-counts' }, h('span', null, h('b', null, String(songs.length)), songs.length === 1 ? ' song' : ' songs'), h('span', null, h('b', null, String(sets.length)), sets.length === 1 ? ' setlist' : ' setlists')),
        sets.slice(0, 3).map(s => { const l = setlistLength(s); return h('span', { class: 'small ac-setline' }, `🗒 ${s.name || 'Setlist'} · ${plural(l.songs, 'song')}${l.sec ? ' · ' + fmtDur(l.sec) : ''}`); }),
        h('span', { class: 'small muted' }, songs.length || sets.length ? 'Open Songs →' : 'Add songs and setlists in Songs →'))),
    h('section', { class: 'ac-sec', id: 'ac-bio', 'aria-labelledby': 'ac-h-bio' },
      h('h3', { id: 'ac-h-bio' }, 'Bio'),
      a.bio ? h('p', { class: 'prewrap ac-text' }, a.bio) : h('p', { class: 'muted ac-none' }, hasTab('epk') ? 'No bio yet. A few lines for promoters and press go on the press kit: ✎ Edit to add them.' : 'No bio yet. ✎ Edit adds a few lines on who they are.')),
    // Every name the act had before, the latest first, with the days it changed.
    earlierNames(a).length > 0 && h('section', { class: 'ac-sec', id: 'ac-names', 'aria-labelledby': 'ac-h-names' },
      h('h3', { id: 'ac-h-names' }, 'Earlier names'),
      h('ul', { class: 'ac-names', role: 'list' }, earlierSpans(a).reverse().map(n => h('li', null, h('strong', null, n.name), h('span', { class: 'small muted' }, spanText(n)))))),
    a.notes && h('section', { class: 'ac-sec', id: 'ac-notes', 'aria-labelledby': 'ac-h-notes' }, h('h3', { id: 'ac-h-notes' }, 'Notes'), h('p', { class: 'prewrap ac-text' }, a.notes)),
    h('div', { class: 'ac-sec ac-danger' }, h('button', { type: 'button', class: 'btn danger small', id: 'ac-delete', onclick: () => deleteAct(a.id) }, 'Delete this act')));
}

function removeMember(actId, personId) {
  const a = byId('acts', actId), p = byId('people', personId);
  if (!a) return;
  if (!confirm(`Take ${p ? p.name : 'this person'} out of ${a.name}? They stay in People.`)) return;
  update(d => { const x = d.acts.find(r => r.id === actId); if (!x) return; x.members = (x.members || []).filter(id => id !== personId); x.updatedAt = Date.now(); });
  toast(`${p ? p.name : 'Member'} taken out of ${a.name}`);
}
function addMember(actId, personId) {
  let added = false;
  update(d => { const x = d.acts.find(r => r.id === actId); if (!x || (x.members || []).includes(personId)) return; x.members = [...(x.members || []), personId]; x.updatedAt = Date.now(); added = true; });
  return added;
}

// Pick people to add, or make a new person. Each tap adds one; the sheet stays open for the next.
function openAddMembers(actId) {
  const a0 = byId('acts', actId);
  if (!a0) return;
  let q = '';
  const intro = h('p', { class: 'small muted' });
  const listBox = h('div', { class: 'ac-addm-list' });
  const search = db.people.length > 8 && h('input', { class: 'search', type: 'search', id: 'ac-addm-q', placeholder: 'Search people…', 'aria-label': 'Search people', autocomplete: 'off', oninput: e => { q = e.target.value; draw(); } });
  const draw = (focusAt = -1) => {
    const a = byId('acts', actId);
    if (!a) { close(); return; }
    const inAct = new Set(a.members || []);
    const free = db.people.filter(p => !inAct.has(p.id)).sort(byName);
    const ql = q.trim().toLowerCase();
    const shown = ql ? free.filter(p => [p.name, p.role, p.instrument, p.company].join(' ').toLowerCase().includes(ql)) : free;
    intro.textContent = `Tap someone to add them to ${a.name}. People live in the People section; an act lists who plays in it.`;
    const groups = [...PEOPLE_GROUPS, ['', 'Others']].map(([g, label]) => [label, shown.filter(p => (g ? p.group === g : !PEOPLE_GROUPS.some(([k]) => k === p.group)))]).filter(([, ps]) => ps.length);
    listBox.replaceChildren(...(shown.length ? groups.map(([label, ps]) => h('div', { class: 'ac-addm-group' }, h('h4', null, label), ps.map(p =>
      h('button', { type: 'button', class: 'card tap ac-addm-item', id: 'ac-addm-' + p.id, 'aria-label': `Add ${p.name}${roleOf(p) ? ' (' + roleOf(p) + ')' : ''} to ${a.name}`, onclick: () => pick(p) },
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(p.name)),
        h('span', { class: 'ac-member-text' }, h('strong', null, p.name), roleOf(p) && h('span', { class: 'muted small' }, roleOf(p))),
        h('span', { class: 'ac-addm-plus', 'aria-hidden': 'true' }, '＋')))))
      : [h('p', { class: 'muted ac-none' }, ql && free.length ? `No one matches “${q.trim()}”.` : db.people.length ? 'Everyone in People is already in this act.' : 'No one in People yet. Add a new person.')]));
    if (focusAt >= 0) { const items = listBox.querySelectorAll('.ac-addm-item'); (items[Math.min(focusAt, items.length - 1)] || search || body.querySelector('#ac-addm-done')).focus(); }
  };
  const pick = p => {
    const items = [...listBox.querySelectorAll('.ac-addm-item')], at = items.findIndex(el => el.id === 'ac-addm-' + p.id);
    if (addMember(actId, p.id)) toast(`${p.name} added to ${(byId('acts', actId) || a0).name}`);
    draw(Math.max(0, at));
  };
  const newPerson = () => people(m => m.editPerson({ group: 'band' }, rec => {
    if (rec && rec.id && addMember(actId, rec.id)) toast(`${rec.name} added to ${(byId('acts', actId) || a0).name}`);
    draw();
  }));
  const body = h('div', { class: 'stack ac-addm' }, intro,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost', id: 'ac-addm-new', onclick: newPerson }, '+ New person')),
    search, listBox,
    h('div', { class: 'form-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn primary', id: 'ac-addm-done', onclick: () => close() }, 'Done')));
  draw();
  const { close } = sheet('Add members', body);
}

/* Press kit */
function showBigQr(a) {
  const t = qrTarget(a);
  if (!t) return;
  const box = h('div', { class: 'qr ac-qr-full', role: 'img', 'aria-label': 'QR code: ' + t.caption }, 'Making the code…');
  fillQr(box, t.text);
  sheet('QR code', h('div', { class: 'stack ac-qr-sheet' },
    h('h2', { class: 'ac-qr-name' }, a.name || 'Untitled act'), box,
    h('p', { class: 'qr-cap muted' }, t.caption),
    h('p', { class: 'small muted' }, 'Turn the screen brightness up and hold the phone still: it scans from about an arm’s length.')));
}
function epkTab(a) {
  const t = qrTarget(a), links = parseLinks(a.links);
  const qrBox = h('div', { class: 'qr ac-qr', role: 'img', 'aria-label': t ? 'QR code: ' + t.caption : 'No QR code yet' }, t ? 'Making the code…' : 'Add a link, an email or a phone number to make a QR code.');
  if (t) fillQr(qrBox, t.text);
  const doc = epkDoc(a);
  const slot = doc.querySelector('.ac-doc-qr-svg');
  if (slot && t) fillQr(slot, t.text);
  const missing = [!a.bio && 'a bio', !links.length && 'links', !(a.email || a.phone) && 'a contact', !membersOf(a).length && 'the members'].filter(Boolean);
  return h('div', { class: 'ac-epk-wrap' },
    h('section', { class: 'card ac-qr-card', 'aria-labelledby': 'ac-h-qr' },
      h('h3', { id: 'ac-h-qr' }, 'At the merch desk'),
      qrBox,
      h('div', { class: 'qr-cap muted' }, t ? t.caption : 'The QR code holds the first link, or the act’s contact card when there is no link.'),
      h('div', { class: 'actions center' },
        t && h('button', { type: 'button', class: 'btn primary', id: 'ac-qr-big', onclick: () => showBigQr(a) }, '⛶ Show it big'),
        !t && h('button', { type: 'button', class: 'btn ghost', id: 'ac-qr-edit', onclick: () => editAct(a) }, '✎ Add a link'))),
    h('section', { class: 'ac-epk', 'aria-labelledby': 'ac-h-epk' },
      h('h3', { id: 'ac-h-epk' }, 'Press kit'),
      h('p', { class: 'small muted' }, 'One page for promoters, venues and press, made from the act’s details. Print it, or save it as a web page to email or post.'),
      missing.length > 0 && h('p', { class: 'small ac-missing' }, `Worth adding: ${missing.length > 1 ? missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1] : missing[0]}.`),
      h('div', { class: 'cs-paper ac-paper' }, doc),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn primary', id: 'ac-epk-print', onclick: () => printEpk(a.id) }, '🖨 Print'),
        h('button', { type: 'button', class: 'btn ghost', id: 'ac-epk-save', onclick: () => saveEpk(a.id) }, '⤓ Save as a web page'),
        h('button', { type: 'button', class: 'btn ghost', id: 'ac-epk-edit', onclick: () => editAct(a) }, '✎ Edit details'))));
}

/* Tech rider */
function riderTab(a) {
  const n = inputRows(a).length, dups = dupChannels(a), table = inputTable(a);
  return h('div', { class: 'ac-cols ac-rider' },
    h('section', { class: 'ac-sec', id: 'ac-inputs', 'aria-labelledby': 'ac-h-inputs' },
      h('h3', { id: 'ac-h-inputs' }, n ? `Input list · ${plural(n, 'input')}` : 'Input list'),
      table ? h('div', { class: 'ac-in-wrap' }, table) : h('p', { class: 'muted ac-none' }, 'No input list yet. Start from a preset (rock band, duo with tracks, solo acoustic) and change what differs.'),
      dups.length > 0 && h('div', { class: 'warn' }, `Channel${dups.length === 1 ? '' : 's'} ${dups.join(', ')} ${dups.length === 1 ? 'is' : 'are'} on the list twice. Renumber in the editor puts them in order.`),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn primary small', id: 'ac-in-edit', onclick: () => openInputList(a.id) }, n ? '✎ Edit input list' : '+ Make the input list'),
        n > 0 && h('button', { type: 'button', class: 'btn ghost small', id: 'ac-in-csv', onclick: () => saveInputCsv(a.id) }, '⤓ CSV for the desk'))),
    h('section', { class: 'ac-sec', id: 'ac-plot', 'aria-labelledby': 'ac-h-plot' },
      h('h3', { id: 'ac-h-plot' }, 'Stage plot'),
      stagePlot(a)),
    h('section', { class: 'ac-sec', id: 'ac-riders', 'aria-labelledby': 'ac-h-riders' },
      h('h3', { id: 'ac-h-riders' }, 'Riders'),
      h('div', { class: 'ac-rider-texts' },
        h('div', { class: 'card ac-rider-text' }, h('h4', null, 'Technical rider'), a.riderTech ? h('p', { class: 'prewrap' }, a.riderTech) : h('p', { class: 'muted' }, 'Monitor mixes, risers, backline, power, changeover time…')),
        h('div', { class: 'card ac-rider-text' }, h('h4', null, 'Hospitality rider'), a.riderHospitality ? h('p', { class: 'prewrap' }, a.riderHospitality) : h('p', { class: 'muted' }, 'Water, towels, food, drinks, a dressing room…'))),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn ghost small', id: 'ac-riders-edit', onclick: () => openRiders(a.id) }, '✎ Edit riders'))),
    h('div', { class: 'ac-sec ac-rider-out' },
      h('p', { class: 'small muted' }, `The tech rider prints the input list, ${plotOf(a).length ? 'the stage plot, ' : ''}the riders and the contact on plain paper for the sound engineer.`),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn primary', id: 'ac-print-rider', onclick: () => printRider(a.id) }, '🖨 Print the tech rider'),
        h('button', { type: 'button', class: 'btn ghost', id: 'ac-save-rider', onclick: () => saveRider(a.id) }, '⤓ Save as a web page'))));
}

/* ------------------------------- the page ------------------------------- */
// The walkthroughs follow the role: the section's name, the parts of an act it keeps, the list's order, and whether
// the times seen lead (EVERYTHING reads as it always has).
const andList = xs => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0] || '');
// "Your acts" in the section's name for the role: Your artists, Your roster, Your bands; My act reads Your act.
const yours = () => { const n = secName(); return /^my\s/i.test(n) ? 'Your ' + n.slice(3) : 'Your ' + n.toLowerCase(); };
const listSteps = () => {
  const follows = seenOnPage(), logged = pageOpt('acts', 'seen', 'always') === 'logged', how = pageOpt('acts', 'order', 'name');
  const parts = andList(keptTabs().map(([id]) => ({ about: follows ? 'bookings and members' : 'members', epk: 'press kit', rider: 'rider' })[id]));
  return [
    { title: secName(), text: follows ? 'The bands and artists you go to see. Each keeps its links, members and notes and the log of each time you saw them; bookings point back to it.' : 'The bands and artists you play in, manage or produce. Each keeps its members, links, press kit and tech rider; bookings and songs point back to it.', target: ['.ac-page .page-head'] },
    { title: 'Add an act', text: 'A name, a genre, a colour for its stripe, a contact, and its links, one per line like “Spotify: https://…”.', target: ['#ac-new'] },
    { title: yours(), text: (logged ? 'Each card shows their dates coming up on the calendar and, once you log a time you saw them play, how many times, your average and latest score out of 100.' : 'Each card shows how many times you have seen them play, your average and latest score out of 100, and their dates coming up on the calendar.')
      + (db.acts.some(x => formerName(x)) ? ' “formerly …” under a name is the name they had before.' : '')
      + (how === 'latest' ? ' The best latest score comes first.' : how === 'recent' ? ' The ones you saw last come first.' : ''), target: ['.ac-card', '.ac-page .empty'] },
    { title: 'Drop it open', text: logged ? `Tap a card, then Open the act for its ${parts}. You can log a time you saw them play there too; once you have, the card keeps the log: when, where, the score and your notes.` : `Tap a card for the log of each time you saw them: when, where, the score and your notes. Log another, pick one of their past shows, or open the act for its ${parts}.`, target: ['.ac-card-head'] },
    { title: 'Dates coming up', text: 'Their next bookings from the calendar. Tap one to open it.', target: ['.ac-date'] },
    { title: 'Search', text: 'Find an act by its name, a name it had before, its genre or a member’s name.', target: ['#ac-search'] },
  ];
};
const PART_TEXT = { about: 'Overview for bookings and members', epk: 'Press kit for promoters and fans', rider: 'Tech rider for the sound engineer' };
const actSteps = () => {
  const tabs = keptTabs(), has = id => tabs.some(([t]) => t === id);
  const was = formerName(byId('acts', S.id)); // an act that changed its name: its page says so, and so does its tour
  return [
    { title: 'The act', text: 'Name, genre and members, with its links as buttons and its contact. ✎ Edit changes them.' + (was ? ' “formerly …” under the name is the name it had before.' : ''), target: ['.ac-hero'], before: () => setTab('about') },
    tabs.length > 1 && { title: tabs.length === 3 ? 'Three parts' : 'Two parts', text: tabs.map(([id]) => PART_TEXT[id]).join(', ') + '.', target: ['.ac-tabs'] },
    seenOnPage() && { title: 'Times seen', text: 'Each time you saw them play, newest first: when, where, the score and your notes. Log another, or pick one of their past shows.', target: ['#ac-seen'] },
    ...(has('about') ? [
      { title: 'Coming up', text: moneyShown() ? `This act’s bookings from today on. Tap one to open it, or book a new ${book()[1]} for the act.` : 'Their shows on your calendar from today on. Tap one to open it, or add a show of theirs you’re going to.', target: ['#ac-coming'] },
      { title: 'Members', text: 'People from the People section. Add someone already there or a new person; ✕ takes them out of the act (they stay in People).', target: ['#ac-members'] },
      { title: 'Songs & setlists', text: 'How many songs and setlists the act has. Tap to open Songs.', target: ['#ac-songs'] },
      !!was && { title: 'Earlier names', text: 'Every name the act had before, the latest first, with the days it changed. Bookings and scores from before a change say the name it had that night. ✎ Edit corrects a day, takes a name away or adds one.', target: ['#ac-names'] },
    ] : []),
    ...(has('epk') ? [
      { title: 'Press kit', text: 'A one-page press kit from the act’s details: bio, links, line-up, confirmed shows and contact. Print it, or save it as a web page to send.', target: ['.ac-epk'], before: () => setTab('epk') },
      { title: 'QR code', text: 'The act’s first link (or its contact card) as a QR code. Show it big at the merch desk so people can scan it.', target: ['.ac-qr-card'] },
    ] : []),
    ...(has('rider') ? [
      { title: 'Input list', text: 'Every channel for the sound engineer: source, mic or DI, stand. Start from a preset and change what differs.', target: ['#ac-inputs'], before: () => setTab('rider') },
      { title: 'Stage plot', text: 'Who and what stands where, the audience at the bottom. Drag the labels; add players and gear from the chips.', target: ['#ac-plot'] },
      { title: 'Riders', text: 'The technical and hospitality riders, as text.', target: ['#ac-riders'] },
      { title: 'Print the tech rider', text: 'Input list, stage plot, riders and contact on one document to print or send ahead of the show.', target: ['#ac-print-rider'] },
    ] : []),
  ].filter(Boolean);
};

export const acts = {
  id: 'acts', label: 'Acts', icon: '🎸',
  render(root) {
    const a = S.view === 'act' ? byId('acts', S.id) : null;
    if (S.view === 'act' && !a) Object.assign(S, { view: 'list', id: null }); // deleted elsewhere
    if (!keptTabs().some(([id]) => id === S.tab)) S.tab = keptTabs()[0][0]; // a part the role leaves out (or unknown)
    root.append(a ? actView(a) : listView());
  },
  tutorial: () => (S.view === 'act' && byId('acts', S.id) ? actSteps() : listSteps()),
};

// The press kit is named only for a role that keeps it on the act's page.
// Changing a name is asked about only in the Edit form (a new act has no name to change).
const RENAME_HELP = ' Change it and Gdex asks whether it is a new name or a spelling fix: a new name keeps the old one, shown as “formerly …”.';
const formSteps = () => [
  { title: 'Name', text: (hasTab('epk') ? 'The band or artist name, as it goes on posters and the press kit.' : 'The band or artist name, as it goes on posters.') + (document.querySelector('.sheet[aria-label="Edit act"]') ? RENAME_HELP : ''), target: ['input[data-key=name]'] },
  { title: 'Earlier names', text: 'Names the act had before, each with the day it stopped using that name. The latest shows under the name as “formerly …”, and bookings and scores from before that day say which name it had. Add one by hand if the name changed before you kept the act here; ✕ takes one away.', target: ['.ac-was'] },
  { title: 'Colour', text: 'The stripe on the act’s cards, so its bookings and songs are quick to tell apart.', target: ['select[id$="-color"]'] },
  { title: 'Links', text: hasTab('epk') ? 'One per line: a name, a colon, the address. They become buttons on the act, lines on the press kit, and the first one is its QR code.' : 'One per line: a name, a colon, the address. They become buttons on the act.', target: ['textarea[data-key=links]'] },
  { title: 'Bio', text: hasTab('epk') ? 'Two or three sentences for promoters and press. It heads the press kit.' : 'A few lines on who they are, what they sound like and where they’ve played.', target: ['textarea[data-key=bio]'] },
];
sheetTutorial('New act', formSteps);
const seenSteps = [
  { title: 'When and where', text: 'The date, and one of your venues or any other place typed in.', target: ['input[data-key=date]'] },
  { title: 'Score', text: 'Out of 100: type it or slide it. The card shows the average and the latest, so you can see whether they are getting better.', target: ['input[data-key=rating]'] },
  { title: 'Notes', text: 'Whatever you want to remember: the set, the sound, the crowd.', target: ['textarea[data-key=notes]'] },
];
sheetTutorial('Log a time seen', seenSteps);
sheetTutorial('Edit a time seen', seenSteps);
sheetTutorial('Edit act', formSteps);
sheetTutorial(RENAME, [
  { title: 'Old and new', text: 'The name as it was saved, and the name you typed.', target: ['.ac-rename-names'] },
  { title: 'Since when?', text: 'The day the new name began. It starts on today; move it back if the name changed a while ago. Bookings and scores from before that day say “formerly …”.', target: ['#ac-rename-since'] },
  { title: 'A new name, or a fix', text: 'It’s a new name keeps the old one as an earlier name. Just fixing the spelling saves the name and keeps nothing else. ✕ goes back to the form with nothing saved.', target: ['.ac-rename-answers'] },
]);
sheetTutorial('Add members', [
  { title: 'Add members', text: 'Tap someone to add them to the act. Each tap adds one, and the sheet stays open for the next.', target: ['.ac-addm-list'] },
  { title: 'Someone new', text: 'Makes a person in People and adds them to this act in one go.', target: ['#ac-addm-new'] },
]);
sheetTutorial('QR code', [
  { title: 'Show it big', text: 'Hold the phone up at the merch desk: people scan it to follow the act or save its contact.', target: ['.ac-qr-full'] },
]);
