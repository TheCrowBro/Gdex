// House rules on a venue (what it allows in: cameras, the age limit, bags… and anything unusual), drawn wherever they
// show: a chip on a show's card, the full rules on the venue's sheet and on the show's page, and the part of the venue
// form that edits them. The data is on the venue (rules, rulesNote, rulesTone); the levels and the words come from
// js/model.js (rulesOf, rulesLevel, rulesChipText, rulesList, showRulesVenue): this file only draws what they return.
// It imports util.js and model.js only. Styles: css/backline.css (.vn-chip, .vn-rules, .vn-rule).
import { h } from './util.js';
import { HOUSE_RULES, RULE_GROUPS, rulesOf, rulesLevel, rulesChipText, rulesList, showRulesVenue } from './model.js';

/* ------------------------------- the chip ------------------------------- */
// Green, amber or red, never by colour alone: a dot of the colour, the words, and the same in full for a screen reader.
const CHIP = { ok: 'vn-chip vn-chip-ok', some: 'vn-chip vn-chip-some', strict: 'vn-chip vn-chip-strict' };

// The chip for a venue: a span (never a control: it sits inside cards, which are buttons), or null when the venue has
// no rules to show. The words are put in as text, so a note that starts "<b>" shows those characters.
export function venueChip(v) {
  const t = rulesChipText(v);
  if (!t || !CHIP[t.level]) return null;
  return h('span', { class: CHIP[t.level] }, h('span', { 'aria-hidden': 'true' }, keepTogether(t.label)), h('span', { class: 'sr-only' }, t.spoken));
}
// Two things in a chip stay on one line: its icon and the word after it (“📷 Pro”), and a rule's last word and its ✗
// (“cameras ✗”). On a narrow card the icon would otherwise be left alone on a line, or the ✗ wrap to the next one,
// where it reads as part of “· 1 more”. The icon is held to the first letter of the next word only (no line can break
// inside a word), so a long first word, such as the start of a note, can still wrap where it must. Only the drawing
// changes: the words are the same text.
const ICON = /^\p{Extended_Pictographic}/u;
let letters = null; // one splitter into letters for every chip (a card list can draw thousands)
const firstLetter = w => { try { letters = letters || new Intl.Segmenter(); for (const x of letters.segment(w)) return x.segment; return ''; } catch { return [...w][0] || ''; } };
const keepTogether = label => {
  const words = String(label).split(' '), icon = words.length > 1 && ICON.test(words[0]) ? words.shift() : '', out = [];
  const plain = t => { if (!t) return; if (typeof out[out.length - 1] === 'string') out[out.length - 1] += t; else out.push(t); };
  const nb = t => out.push(h('span', { class: 'vn-chip-nb' }, t));
  words.forEach((w, i) => {
    if (w === '✗' && i) return; // drawn with the word before it
    if (i) plain(' ');
    let rest = w;
    if (!i && icon) { const g = firstLetter(w); nb(`${icon} ${g}`); rest = w.slice(g.length); }
    if (words[i + 1] === '✗') nb(`${rest} ✗`); else plain(rest);
  });
  return out;
};
// The chip on a show's card: its venue's chip. Only a show that is not cancelled, at a saved venue, carries rules
// (model.showRulesVenue): the rules are the venue's, whoever plays, and a show cannot override them.
export function rulesChip(b) {
  const v = showRulesVenue(b);
  return v ? venueChip(v) : null;
}

/* ------------------------------- the full rules ------------------------------- */
// The full rules: a node, or null when the venue has none. where: 'venue' (its own sheet) | 'show' (a show's page,
// where the head line names the venue). No control inside: a show's header is press-and-hold.
export function rulesFull(v, { where = 'venue' } = {}) {
  if (!rulesLevel(v)) return null;
  const onShow = where === 'show';
  const name = String((v && v.name) || '').trim();
  const list = rulesList(v);
  // What the chip counts comes first, each by name: the permissions not allowed, then the facts and pick-lists that
  // restrict (an age limit, cash only, strobes); then what is allowed, and the rest.
  const rows = [['Not allowed', list.no.join(' · ')], ['Restricted', list.restricted.join(' · ')], ['Allowed', list.yes.join(' · ')], ['Good to know', list.know.join(' · ')]].filter(([, words]) => words);
  return h('div', { class: onShow ? 'vn-rules vn-rules-show' : 'vn-rules' },
    h('div', { class: 'vn-rules-head' }, h('strong', { class: 'vn-rules-name' }, onShow && name ? `House rules at ${name}` : 'House rules'), venueChip(v)),
    (rows.length > 0 || list.note || list.tone) && h('dl', { class: 'vn-rules-list' },
      rows.map(([label, words]) => [h('dt', null, label), h('dd', null, words)]),
      list.note && [h('dt', null, 'Other rules'), h('dd', { class: 'prewrap' }, list.note)],
      list.tone && [h('dt', null, 'How strict'), h('dd', null, list.tone)])); // a colour set by hand, in words: never by colour alone
}

/* ------------------------------- the form's part ------------------------------- */
// What the two buttons of a rule say. A permission is allowed or not; a fact is so or not.
const SAYS = { allow: { yes: 'Allowed', no: 'Not allowed' }, fact: { yes: 'Yes', no: 'No' } };
const MARK = { yes: '✓', no: '✕' };

// The House rules part of the venue form: { node, read() → only the answers that are known, in the rules' order }.
// Each rule has three states with one tap: nothing pressed is "Don’t know" (how every rule starts), a tap answers it,
// a tap on the pressed button clears it. The answers live here until Save reads them; Cancel throws them away with
// the form (nothing is redrawn, so the focus stays on the button used). Each button carries a tick-box that is empty
// until it is pressed: the box is always there, so pressing never changes a button's size and nothing on the form moves.
export function rulesEditor(v) {
  const state = { ...rulesOf(v).values };
  const name = r => h('span', { class: 'vn-rule-name' }, h('span', { class: 'vn-rule-ico', 'aria-hidden': 'true' }, r.icon), ' ' + r.label);
  const pick = r => {
    const sel = h('select', { id: 'vn-rule-' + r.id, 'aria-label': r.label, onchange: () => { if (sel.value) state[r.id] = sel.value; else delete state[r.id]; } },
      h('option', { value: '', selected: !(r.id in state) }, 'Don’t know'),
      r.options.map(([value, label]) => h('option', { value, selected: state[r.id] === value }, label)));
    return h('div', { class: 'vn-rule vn-rule-pick', role: 'group', 'aria-label': r.label, 'data-rule': r.id }, name(r), sel);
  };
  const pair = r => {
    const btns = {};
    const show = () => { for (const ans of ['yes', 'no']) btns[ans].setAttribute('aria-pressed', String(state[r.id] === ans)); };
    const btn = ans => (btns[ans] = h('button', { type: 'button', id: `vn-rule-${r.id}-${ans}`, class: ans === 'yes' ? 'vn-rule-btn vn-rule-yes' : 'vn-rule-btn vn-rule-no', 'aria-pressed': 'false',
      onclick: () => { if (state[r.id] === ans) delete state[r.id]; else state[r.id] = ans; show(); } },
      h('span', { class: 'vn-rule-mark', 'aria-hidden': 'true' }, h('span', null, MARK[ans])), h('span', { class: 'vn-rule-says' }, SAYS[r.kind][ans])));
    const row = h('div', { class: r.kind === 'fact' ? 'vn-rule vn-rule-fact' : 'vn-rule vn-rule-allow', role: 'group', 'aria-label': r.label, 'data-rule': r.id }, name(r), btn('yes'), btn('no'));
    show();
    return row;
  };
  const node = h('div', { class: 'field wide vn-rules-edit' },
    h('span', { class: 'vn-rules-title' }, 'House rules'),
    h('small', { class: 'muted' }, 'Tap what you know: Allowed or Not allowed, Yes or No. Tap it again to clear it. Rules you leave alone stay off the card.'),
    RULE_GROUPS.map(([group, label]) => h('fieldset', { class: 'vn-rules-group' }, h('legend', null, label),
      HOUSE_RULES.filter(r => r.group === group).map(r => (r.kind === 'pick' ? pick(r) : pair(r))))));
  const read = () => Object.fromEntries(HOUSE_RULES.filter(r => r.id in state).map(r => [r.id, state[r.id]]));
  return { node, read };
}
