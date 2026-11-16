// The type-and-pick box (the booking form's band and venue boxes, js/form.js type 'combo'): a text box that lists the
// saved records matching what is typed, under it, in the form's own flow. No capitals or accents are counted, a band's
// earlier names count too, and names that start with what was typed come first; ↑ ↓ and Enter, a tap, or ▾ (all of
// them) pick one. Text that is exactly one of a record's names is that record, picked or not (the name to the letter
// first; two records of that name, neither until one is picked); anything else is kept as typed. The box carries the
// record's id in data-id ('' for none) and fires combochange whenever that changes.
// (The owner, 15 Nov 2026: "You should be able to type into the band name or venue bar. If a name of either exists
// it'll show to be selected.")
import { h } from './util.js';
import { fold } from './model.js';

// A name as the box compares it: no capitals, no accents (js/model.js fold, as the search has it), spaces tidied.
export const boxKey = s => fold(s).replace(/\s+/g, ' ').trim();
const LIMIT = 50; // the most options drawn for what is typed
const byName = new Intl.Collator(undefined, { sensitivity: 'base' });
const namesOf = it => (Array.isArray(it.names) && it.names.length ? it.names : [it.name]);
// How well one name answers what was typed (q, its words tw): 0 the same, 1 it starts so, 2 every word typed starts a
// word of it, 3 every word typed is inside it; -1 no match.
function rankName(name, q, tw) {
  const k = boxKey(name);
  if (!k) return -1;
  if (k === q) return 0;
  if (k.startsWith(q)) return 1;
  const kw = k.split(' ');
  if (tw.every(w => kw.some(x => x.startsWith(w)))) return 2;
  return tw.every(w => k.includes(w)) ? 3 : -1;
}
// The items that match what was typed, best first: [{ item, rank, earlier, matched }] (earlier: the match came only from
// an earlier name, matched), at most `limit`. Nothing typed: every item, in the order given.
export function rankMatches(items, typed, limit = LIMIT) {
  const list = Array.isArray(items) ? items : [], q = boxKey(typed);
  if (!q) return list.map(item => ({ item, rank: 4, earlier: false, matched: item.name }));
  const tw = q.split(' '), out = [];
  for (const item of list) {
    let best = -1, earlier = false, matched = '';
    namesOf(item).forEach((n, i) => { const r = rankName(n, q, tw); if (r >= 0 && (best < 0 || r < best)) { best = r; earlier = i > 0; matched = n; } });
    if (best >= 0) out.push({ item, rank: best, earlier, matched });
  }
  out.sort((a, b) => a.rank - b.rank || Number(a.earlier) - Number(b.earlier) || (a.item.group || 0) - (b.item.group || 0) || byName.compare(String(a.item.name || ''), String(b.item.name || '')));
  return limit ? out.slice(0, limit) : out;
}
// A name to the letter: capitals and accents kept, spaces tidied.
const toLetter = s => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
// The items the text is: the one picked in this form (keep) while one of its names still is what is typed; else those
// whose name now is the text to the letter; else those whose name now is the text (no capitals or accents counted); else
// the same for earlier names. Two or more ("Sable" and "SABLÉ" for "sable", two venues called O2 Academy): only a pick
// tells them apart.
export function exactAll(items, typed, keep = '') {
  const list = Array.isArray(items) ? items : [], q = boxKey(typed), t = toLetter(typed);
  if (!q) return [];
  const kept = keep && list.find(it => it.id === keep);
  if (kept && namesOf(kept).some(n => boxKey(n) === q)) return [kept];
  const now = it => namesOf(it).slice(0, 1), before = it => namesOf(it).slice(1);
  for (const [names, same] of [[now, n => toLetter(n) === t], [now, n => boxKey(n) === q], [before, n => toLetter(n) === t], [before, n => boxKey(n) === q]]) {
    const hits = list.filter(it => names(it).some(same));
    if (hits.length) return hits;
  }
  return [];
}
// The item the text is, or null (none, or two or more that only a pick tells apart).
export function exactOf(items, typed, keep = '') { const hits = exactAll(items, typed, keep); return hits.length === 1 ? hits[0] : null; }

// The box. id: the form's id for it (its <label for> names it); key: the form's key (data-key); items(): the records
// [{ id, name, names, sub, group }], read at every keystroke; value: the id it opens with; text: the name it opens with
// when that is none of the items; words.many: the list in the role's words ('bands', 'venues'). Returns { node, input,
// id(), text() }: the id it stands for ('' for none) and the text trimmed, its spaces tidied. While the text is two or
// more records' name, the box carries data-tied (how many) and no id.
export function comboBox({ id, key, items, value = '', text = '', words = {}, placeholder = '' }) {
  const many = words.many || 'records', listId = `${id}-list`;
  const all = () => { try { const x = typeof items === 'function' ? items() : items; return Array.isArray(x) ? x : []; } catch (e) { console.error(e); return []; } };
  const input = h('input', { type: 'text', id, 'data-key': key, 'data-id': '', 'data-was': '', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false',
    'aria-controls': listId, 'aria-describedby': `${id}-state`, autocomplete: 'off', autocapitalize: 'words', placeholder });
  input.setAttribute('spellcheck', 'false'); // h() would set the property to the string 'false', which is true
  input.setAttribute('autocorrect', 'off');
  const btn = h('button', { type: 'button', class: 'cb-all', tabindex: '-1', 'aria-label': `All your ${many}`, 'aria-controls': listId, 'aria-expanded': 'false' }, '▾');
  const list = h('ul', { class: 'cb-list', id: listId, role: 'listbox', 'aria-label': `Your ${many}`, hidden: true });
  const state = h('small', { class: 'cb-state', id: `${id}-state` });
  const live = h('span', { class: 'sr-only', id: `${id}-live`, 'aria-live': 'polite' });
  const node = h('div', { class: 'cb' }, h('div', { class: 'cb-row' }, input, btn), list, state, live);

  // What it opens with: a saved record by its name now; else the name as the booking has it, unlinked even when it is
  // exactly a saved name (opening an old booking never relinks it, nor drops its typed address).
  const start = value ? all().find(it => it.id === value) : null;
  input.value = start ? String(start.name || '') : String(text ?? '');
  input.dataset.id = start ? start.id : '';
  input.dataset.was = input.value;
  let picked = start ? start.id : ''; // the record picked (or opened with) in this form: exactAll keeps it while it fits
  let opts = [], active = -1, liveTimer = 0, quietly = false;
  let tied = []; // the records typed whose names are the same: none is linked until one is picked
  const setTied = hits => { tied = hits.length > 1 ? hits : []; if (tied.length) input.dataset.tied = String(tied.length); else delete input.dataset.tied; };

  const textNow = () => input.value.trim().replace(/\s+/g, ' ');
  const setId = next => {
    const was = input.dataset.id || '';
    input.dataset.id = next || '';
    if (was !== input.dataset.id) input.dispatchEvent(new CustomEvent('combochange', { bubbles: true, detail: { id: input.dataset.id } }));
  };
  // The line under the box (read with it): saved (its name when typed otherwise), two saved by that name, new in this
  // form (while the list shows saved names, a pick is asked for instead: the name typed so far may be one of them), or
  // typed before.
  const sayState = () => {
    const t = textNow(), cur = input.dataset.id ? all().find(it => it.id === input.dataset.id) : null;
    if (!t) state.replaceChildren();
    else if (cur) state.replaceChildren(h('span', { class: 'cb-yes', 'aria-hidden': 'true' }, '✓ '), toLetter(t) === toLetter(cur.name) ? `In your ${many}` : `In your ${many}, as ${cur.name}`);
    else if (tied.length) state.replaceChildren(`${tied.length === 2 ? 'Two' : tied.length} of your ${many} have this name. Pick the one you mean from the list.`);
    else if (boxKey(t) !== boxKey(input.dataset.was || '')) state.replaceChildren(isOpen() ? 'Pick one from the list, or keep typing for a new name.' : `Not in your ${many} yet. You’ll be asked whether to add it.`);
    else state.replaceChildren(`Typed, not picked from your ${many}.`);
  };
  const sayCount = n => {
    clearTimeout(liveTimer); live.textContent = '';
    if (!textNow()) return;
    liveTimer = setTimeout(() => { live.textContent = n === 1 ? `1 match in your ${many}` : n ? `${n} matches in your ${many}` : `No matches in your ${many}`; }, 500);
  };
  const quiet = () => input.setAttribute('inputmode', 'none');
  const loud = () => input.removeAttribute('inputmode');
  // The focus in the box with no keyboard for it (after a tap on the list, or ▾ by touch): the phone's keyboard goes
  // down and the form stays in view. The next press or key on the box, or a blur, brings the keyboard back (loud).
  const focusQuiet = () => {
    quiet(); quietly = true;
    try { if (document.activeElement === input) input.blur(); input.focus({ preventScroll: true }); } finally { quietly = false; }
  };

  /* ---- the list ---- */
  const isOpen = () => !list.hidden;
  const setExpanded = on => { list.hidden = !on; input.setAttribute('aria-expanded', String(on)); btn.setAttribute('aria-expanded', String(on)); };
  const draw = () => {
    list.replaceChildren(...opts.map((m, n) => {
      const it = m.item, sub = m.earlier ? `formerly ${m.matched}` : String(it.sub || '');
      return h('li', { class: 'cb-opt', role: 'option', id: `${id}-o${n}`, 'data-id': it.id, 'aria-selected': 'false', 'aria-label': String(it.name || '') + (sub ? `, ${sub}` : '') },
        h('span', { class: 'cb-name' }, String(it.name || '')), sub ? h('span', { class: 'cb-sub' }, sub) : null);
    }));
  };
  const setActive = n => {
    active = n;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === n)));
    const li = n >= 0 ? list.children[n] : null;
    if (li) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  };
  // Room for the list: above a phone's keyboard (the visual viewport) and the form's Save bar. When there is not room
  // for two rows, the sheet's body scrolls the field up to its top first. Never a floating layer: the list is in the
  // form's flow, so a sheet never clips it and the keyboard never misplaces it.
  const hit = () => parseFloat(getComputedStyle(input).getPropertyValue('--hit')) || 44;
  const floor = () => {
    const vv = window.visualViewport, bar = input.form && input.form.querySelector('.form-actions');
    return Math.min(vv ? vv.offsetTop + vv.height : window.innerHeight, bar ? bar.getBoundingClientRect().top : Infinity);
  };
  const fit = () => {
    if (!isOpen()) return;
    if (!input.isConnected) return unwatch();
    const row = hit();
    let room = floor() - list.getBoundingClientRect().top - 8;
    if (room < 2 * row) {
      const body = input.closest('.sheet-body'), field = input.closest('.field') || node;
      if (body) { body.scrollTop += field.getBoundingClientRect().top - body.getBoundingClientRect().top - 8; room = floor() - list.getBoundingClientRect().top - 8; }
    }
    list.style.maxHeight = `${Math.round(Math.max(2 * row, Math.min(5.5 * row, room)))}px`;
  };
  let watching = false;
  const watch = () => { if (watching || !window.visualViewport) return; watching = true; window.visualViewport.addEventListener('resize', fit); window.visualViewport.addEventListener('scroll', fit); };
  const unwatch = () => { if (!watching) return; watching = false; window.visualViewport.removeEventListener('resize', fit); window.visualViewport.removeEventListener('scroll', fit); };
  const open = (matches, at = -1) => {
    opts = matches; draw();
    if (!opts.length) return close();
    setExpanded(true); setActive(at < 0 ? -1 : Math.min(at, opts.length - 1)); sayState();
    fit(); watch();
  };
  const close = () => { if (isOpen()) { setExpanded(false); sayState(); } setActive(-1); unwatch(); };
  const matchesNow = () => rankMatches(all(), textNow()); // nothing typed: every item

  const pick = (it, how = 'keys') => {
    if (!it) return;
    input.value = String(it.name || '');
    picked = it.id; setTied([]);
    close();
    if (how !== 'keys' && how !== 'mouse') focusQuiet(); // a finger or a pen
    else if (document.activeElement !== input) input.focus({ preventScroll: true });
    setId(it.id);
    sayState();
    clearTimeout(liveTimer); live.textContent = '';
  };

  /* ---- typing ---- */
  const typed = () => {
    const t = textNow(), every = all();
    const found = t ? rankMatches(every, t, 0) : [];
    if (found.length) open(found.slice(0, LIMIT)); else close();
    const hits = exactAll(every, t, picked);
    setTied(hits);
    setId(hits.length === 1 ? hits[0].id : '');
    sayState();
    sayCount(found.length);
  };
  input.addEventListener('input', e => { if (e.isComposing) return; typed(); });
  input.addEventListener('compositionend', typed);
  input.addEventListener('keydown', e => {
    loud();
    const k = e.key;
    if (k === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen()) { open(matchesNow(), e.altKey ? -1 : 0); return; }
      setActive(active + 1 >= opts.length ? -1 : active + 1);
    } else if (k === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen()) { const m = matchesNow(); open(m, m.length - 1); return; }
      if (e.altKey) return close();
      setActive(active < 0 ? opts.length - 1 : active - 1);
    } else if (k === 'Enter') {
      if (e.repeat) { e.preventDefault(); return; } // a held Enter never picks and then submits
      if (isOpen() && active >= 0) { e.preventDefault(); pick(opts[active].item); } else if (isOpen()) { e.preventDefault(); close(); }
    } else if (k === 'Escape') {
      if (isOpen()) { e.preventDefault(); e.stopPropagation(); close(); } // the sheet stays; a second Escape closes it
    } else if (k === 'Tab') {
      if (isOpen() && active >= 0) pick(opts[active].item); else close();
    }
  });
  input.addEventListener('pointerdown', () => { loud(); if (textNow() && !isOpen()) open(rankMatches(all(), textNow())); });
  input.addEventListener('blur', () => { if (quietly) return; loud(); setTimeout(() => { if (document.activeElement !== input) close(); }, 0); });
  // A press on the list or ▾ never takes the focus from the box (the press's default is what moves it).
  for (const el of [list, btn]) el.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('click', e => {
    const li = e.target.closest('.cb-opt'), m = li && opts[[...list.children].indexOf(li)];
    if (m) pick(m.item, e.pointerType || 'mouse');
  });
  btn.addEventListener('click', e => {
    if (isOpen()) { close(); input.focus({ preventScroll: true }); return; }
    if (e.pointerType && e.pointerType !== 'mouse') focusQuiet(); // a list to tap: no keyboard for it
    else if (document.activeElement !== input) input.focus({ preventScroll: true });
    open(rankMatches(all(), ''));
  });
  sayState();
  return { node, input, id: () => input.dataset.id || '', text: textNow };
}
