// The section menu: a record player, a tape deck or a digital player (Aa → Section menu). Each section is a track: on
// the record and the cassette the first half is Side A and the rest Side B; the digital player numbers them in one
// list. Swipe the record, the cassette or the player's bar, tap ⏮ ⏭, use the arrow keys or scroll on it to change
// section; tap it to see every section at once and jump straight to one. The digital player also has a row of tabs
// under its bar, every track one tap away.
// Which sections are tracks depends on the role (js/roles.js); the rest are bonus tracks, listed on the sleeve (or the
// track list) under the tracks. One that is open sits on the menu as a bonus track (★) until you move on.
// createDeck(root, tabs, { start, onSelect(i, dir), extras?() → [{ id, label, icon, count? }], onExtra?(id) })
//   → { go(i), index, refresh(), setTabs(tabs, index) }.
// tabs: [{ id, label, icon?, bonus?, count?() → { n, one, many } }]; bonus tabs come last. The icon is the digital
// player's cover art and the picture on its tab.
import { h, sheet, announce } from './util.js';
import { haptic, menuStyle } from './a11y.js';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };
const icon = d => svg('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, ...d.map(p => svg('path', { d: p })));
const ICONS = {
  prev: ['M5 5v14', 'M19 6l-10 6 10 6V6z'], next: ['M19 5v14', 'M5 6l10 6-10 6V6z'],
  rew: ['M11 6l-7 6 7 6V6z', 'M20 6l-7 6 7 6V6z'], ffw: ['M13 6l7 6-7 6V6z', 'M4 6l7 6-7 6V6z'],
  list: ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
};

// The record: the platter (146 px) holds the disc (140 px) whose centre is at (73, 73); the tonearm pivots at (150, 10)
// and is 96 px long. Track k sits on a groove band of radius r(k), outermost first; the arm's angle puts the stylus there.
const ARM = { L: 96, px: 150, py: 10, cx: 73, cy: 73 };
const armAngle = r => {
  const d = Math.hypot(ARM.cx - ARM.px, ARM.cy - ARM.py), toC = Math.atan2(ARM.cy - ARM.py, ARM.cx - ARM.px) * 180 / Math.PI;
  const c = Math.max(-1, Math.min(1, (ARM.L * ARM.L + d * d - r * r) / (2 * ARM.L * d)));
  return toC - Math.acos(c) * 180 / Math.PI;
};

export function createDeck(root, tabs, { onSelect, start = 0, extras = () => [], onExtra = null }) {
  let n = 0, sideA = 0, tracks = 0; // tracks: the role's own sections; any after them are bonus tracks
  const sizes = () => { n = tabs.length; tracks = tabs.filter(t => !t.bonus).length || n; sideA = Math.ceil(tracks / 2); };
  sizes();
  const isBonus = i => i >= tracks;
  const idOf = i => (isBonus(i) ? '★' : i < sideA ? 'A' + (i + 1) : 'B' + (i - sideA + 1));
  const sideOf = i => (isBonus(i) ? 'Bonus' : i < sideA ? 'A' : 'B');
  const sideText = i => (isBonus(i) ? 'Bonus track' : 'Side ' + sideOf(i));
  // What a screen reader says for the track: its id on the record and the cassette (A2), its place on the digital player.
  const spoken = i => (isBonus(i) ? 'a bonus track' : style === 'digital' ? `track ${i + 1} of ${tracks}` : idOf(i));
  const radius = k => 63 - k * (26 / Math.max(1, n - 1));
  const countOf = i => { try { const c = tabs[i].count && tabs[i].count(); return c && Number.isFinite(c.n) ? c : null; } catch { return null; } };
  const lengthText = i => { const c = countOf(i); return c ? `${c.n} ${c.n === 1 ? c.one : c.many}` : ''; };
  let index = Math.min(n - 1, Math.max(0, start)), turns = 0, style = '', parts = {};
  const holder = h('div', { class: 'deck' });
  root.append(holder);

  /* ------------------------------- the record player ------------------------------- */
  function buildRecord() {
    const gaps = []; for (let k = 0; k < n - 1; k++) gaps.push(svg('circle', { cx: 70, cy: 70, r: ((radius(k) + radius(k + 1)) / 2).toFixed(1), class: 'dk-gap' }));
    const band = svg('circle', { cx: 70, cy: 70, r: radius(0), class: 'dk-band' });
    const rim = svg('text', { class: 'dk-rim' }, svg('textPath', { href: '#dk-rim-path', textLength: '146', lengthAdjust: 'spacing' }, 'GDEX · THE BOOKING DECK · 33⅓ RPM ·')); // fills the circle exactly
    const disc = h('span', { class: 'dk-disc', 'aria-hidden': 'true' },
      svg('svg', { width: 140, height: 140, viewBox: '0 0 140 140' },
        svg('defs', {}, svg('path', { id: 'dk-rim-path', d: 'M70,70 m-23.5,0 a23.5,23.5 0 1,1 47,0 a23.5,23.5 0 1,1 -47,0' })),
        ...gaps, band, svg('circle', { cx: 70, cy: 70, r: 27, class: 'dk-label-disc' }), rim));
    const labelId = h('b', { class: 'dk-label-id' }), labelSide = h('span', { class: 'dk-label-side' });
    const arm = h('span', { class: 'dk-arm', 'aria-hidden': 'true' }, h('span', { class: 'dk-weight' }), h('span', { class: 'dk-bar' }), h('span', { class: 'dk-head' }), h('span', { class: 'dk-tip' }));
    const record = h('button', { type: 'button', class: 'dk-record dk-swipe', onclick: () => tapped() },
      h('span', { class: 'dk-platter', 'aria-hidden': 'true' }), disc, h('span', { class: 'dk-sheen', 'aria-hidden': 'true' }),
      h('span', { class: 'dk-label', 'aria-hidden': 'true' }, labelId, h('i', { class: 'dk-spindle' }), labelSide),
      h('span', { class: 'dk-arm-base', 'aria-hidden': 'true' }), arm, h('span', { class: 'dk-arm-cap', 'aria-hidden': 'true' }));
    const name = h('strong', { class: 'dk-name' }), meta = h('span', { class: 'dk-meta' });
    const prev = h('button', { type: 'button', class: 'dk-btn dk-prev', onclick: () => step(-1) }, icon(ICONS.prev));
    const list = h('button', { type: 'button', class: 'dk-btn dk-list', 'aria-label': 'The sleeve: every section', 'aria-haspopup': 'dialog', onclick: openList }, icon(ICONS.list));
    const next = h('button', { type: 'button', class: 'dk-btn dk-next', onclick: () => step(1) }, icon(ICONS.next));
    holder.replaceChildren(record, h('div', { class: 'dk-info' }, h('span', { class: 'dk-eyebrow' }, 'Now playing'), name, meta, h('div', { class: 'dk-transport' }, prev, list, next)));
    return { record, disc, band, arm, labelId, labelSide, name, meta, prev, next, swipe: record };
  }

  /* ------------------------------- the tape deck ------------------------------- */
  function buildTape() {
    const reel = () => h('span', { class: 'dk-reel' }, svg('svg', { width: 38, height: 38, viewBox: '0 0 38 38', 'aria-hidden': 'true' },
      svg('circle', { cx: 19, cy: 19, r: 17, class: 'dk-reel-ring' }), svg('circle', { cx: 19, cy: 19, r: 7, class: 'dk-reel-hub' }), svg('circle', { cx: 19, cy: 19, r: 3.2, class: 'dk-reel-hole' }),
      svg('path', { d: 'M19 4v7M19 27v7M6 11.5l6 3.5M26 23l6 3.5M6 26.5l6-3.5M26 15l6-3.5', class: 'dk-reel-teeth' })));
    const reels = [reel(), reel()], packs = [h('span', { class: 'dk-pack' }), h('span', { class: 'dk-pack' })];
    reels[0].classList.add('dk-left'); reels[1].classList.add('dk-right'); packs[0].classList.add('dk-left'); packs[1].classList.add('dk-right');
    const labelId = h('b', { class: 'dk-tape-id' }), labelName = h('span', { class: 'dk-tape-name' }), labelSide = h('span', { class: 'dk-tape-side' });
    const cassette = h('button', { type: 'button', class: 'dk-cassette dk-swipe', onclick: () => tapped() },
      ...['tl', 'tr', 'bl', 'br'].map(c => h('span', { class: 'dk-screw dk-' + c, 'aria-hidden': 'true' })),
      h('span', { class: 'dk-tape-label' }, labelId, labelName, labelSide),
      h('span', { class: 'dk-window', 'aria-hidden': 'true' }, h('span', { class: 'dk-tape-run' }), ...packs, ...reels));
    const counter = h('span', { class: 'dk-counter-n' }), counterOf = h('span', { class: 'dk-counter-of' });
    const prev = h('button', { type: 'button', class: 'dk-btn dk-prev', onclick: () => step(-1) }, icon(ICONS.rew));
    const list = h('button', { type: 'button', class: 'dk-btn dk-list dk-tracks', 'aria-label': 'Track list: every section', 'aria-haspopup': 'dialog', onclick: openList }, icon(ICONS.list), h('span', { class: 'dk-tracks-word', 'aria-hidden': 'true' }, 'Tracks'));
    const next = h('button', { type: 'button', class: 'dk-btn dk-next', onclick: () => step(1) }, icon(ICONS.ffw));
    holder.replaceChildren(cassette, h('div', { class: 'dk-transport' }, prev, h('span', { class: 'dk-counter', 'aria-hidden': 'true' }, counter, counterOf), list, next));
    return { cassette, reels, packs, labelId, labelName, labelSide, counter, counterOf, prev, next, swipe: cassette };
  }

  /* ------------------------------- the digital player ------------------------------- */
  // A slim bar (cover art, Now playing, ⏮ ☰ ⏭, and a line along the bottom showing how far through the menu you are)
  // and under it a row of tabs that scrolls sideways. The row is built once per draw: paint() only marks the current
  // tab, because it runs on every change to the data and the row must not move under a finger.
  function buildDigital() {
    const art = h('span', { class: 'dk-art', 'aria-hidden': 'true' });
    const name = h('strong', { class: 'dk-name' }), at = h('span', { class: 'dk-meta-at' }), count = h('span', { class: 'dk-meta-n' });
    const meta = h('span', { class: 'dk-meta' }, at, count);
    const now = h('button', { type: 'button', class: 'dk-now dk-swipe', onclick: () => tapped() },
      art, h('span', { class: 'dk-now-text' }, h('span', { class: 'dk-eyebrow' }, 'Now playing'), name, meta));
    const prev = h('button', { type: 'button', class: 'dk-btn dk-prev', onclick: () => step(-1) }, icon(ICONS.prev));
    const list = h('button', { type: 'button', class: 'dk-btn dk-list', 'aria-label': 'Track list: every section', 'aria-haspopup': 'dialog', onclick: openList }, icon(ICONS.list));
    const next = h('button', { type: 'button', class: 'dk-btn dk-next', onclick: () => step(1) }, icon(ICONS.next));
    const fill = h('i', { class: 'dk-fill' });
    // A tab opens its section by id, like an entry on the track list. The open bonus track is the last tab, with its ★.
    // The name is also in data-name: the stylesheet keeps room for it in bold, so the row does not shift as the current tab changes.
    const tabEls = tabs.map((t, k) => { const name = isBonus(k) ? '★ ' + t.label : t.label;
      return h('button', { type: 'button', class: 'dk-tab', 'data-section': t.id, 'aria-label': isBonus(k) ? `${t.label}, bonus track` : null, onclick: () => pickSection(t.id) },
        h('span', { class: 'dk-tab-ico', 'aria-hidden': 'true' }, t.icon || '♪'), h('span', { class: 'dk-tab-name', 'data-name': name }, name)); });
    const row = h('div', { class: 'dk-tabs', role: 'group', 'aria-label': 'Go to a section' }, tabEls);
    // A tab the keyboard lands on is brought wholly into view as well: a browser may leave one that is only part hidden
    // where it is (Chromium does, once 32 px of it show). Not for a tap or a click, which must not move the row under the finger.
    row.addEventListener('focusin', e => { const b = e.target.closest('.dk-tab'); if (b && b.matches(':focus-visible')) reveal(b); });
    holder.replaceChildren(h('div', { class: 'dk-player' }, now, h('div', { class: 'dk-keys' }, prev, list, next), h('span', { class: 'dk-progress', 'aria-hidden': 'true' }, fill)), row);
    return { now, art, name, at, count, meta, fill, row, tabEls, prev, next, swipe: now };
  }
  // A tab (the current one, unless another is named) brought into view in its row with a little of its neighbour
  // showing. Set outright: nothing slides.
  function reveal(tab = parts.tabEls && parts.tabEls[index]) {
    const row = parts.row;
    if (!row || !tab) return;
    const box = row.getBoundingClientRect(), t = tab.getBoundingClientRect(), peek = 28;
    const left = t.left - box.left + row.scrollLeft, right = left + t.width;
    if (left - peek < row.scrollLeft) row.scrollLeft = Math.max(0, left - peek);
    else if (right + peek > row.scrollLeft + row.clientWidth) row.scrollLeft = right + peek - row.clientWidth;
  }

  /* ------------------------------- drawing ------------------------------- */
  function paint() {
    const t = tabs[index], id = idOf(index), len = lengthText(index);
    const nav = (d, word) => `${word} section: ${tabs[(index + d + n) % n].label}`;
    parts.prev.setAttribute('aria-label', nav(-1, 'Previous')); parts.next.setAttribute('aria-label', nav(1, 'Next'));
    if (style === 'record') {
      parts.disc.style.transform = `rotate(${turns * 120}deg)`; // a third of a turn per section; the label's words never turn
      parts.arm.style.transform = `rotate(${armAngle(radius(index)).toFixed(2)}deg)`;
      parts.band.setAttribute('r', radius(index).toFixed(1));
      parts.labelId.textContent = id; parts.labelSide.textContent = sideText(index).replace(' track', '').toUpperCase();
      parts.name.textContent = t.label; parts.meta.textContent = [!isBonus(index) && id, sideText(index), len].filter(Boolean).join(' · ');
      parts.record.setAttribute('aria-label', `Now playing ${spoken(index)}, ${t.label}. Open the sleeve to pick any section`);
    } else if (style === 'digital') {
      parts.art.textContent = t.icon || '♪'; parts.name.textContent = t.label;
      // "Track 2 of 8 · 2 acts": a bonus track is not one of the role's tracks, so it has no number and the line is full.
      parts.at.textContent = isBonus(index) ? 'Bonus track' : `Track ${index + 1} of ${tracks}`; parts.count.textContent = len ? ' · ' + len : '';
      parts.fill.style.width = (isBonus(index) ? 100 : (index + 1) / tracks * 100) + '%';
      parts.now.setAttribute('aria-label', `Now playing ${spoken(index)}, ${t.label}. Open the track list to pick any section`);
      parts.tabEls.forEach((b, k) => { b.classList.toggle('on', k === index); if (k === index) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
      if (parts.shown !== index) { parts.shown = index; reveal(); } // only when the section changed, or the menu was drawn afresh
    } else {
      parts.reels.forEach(r => { r.style.transform = `rotate(${turns * 300}deg)`; });
      const size = k => 24 + k * (22 / Math.max(1, n - 1)); // tape winds from the left spool to the right as you go
      [size(n - 1 - index), size(index)].forEach((s, k) => { parts.packs[k].style.width = parts.packs[k].style.height = s + 'px'; parts.packs[k].style.marginLeft = parts.packs[k].style.marginTop = -s / 2 + 'px'; });
      parts.labelId.textContent = id; parts.labelName.textContent = t.label; parts.labelSide.textContent = sideText(index).replace(' track', '').toUpperCase();
      parts.counter.textContent = String(index * 47).padStart(3, '0'); parts.counterOf.textContent = id;
      parts.cassette.setAttribute('aria-label', `Now on ${spoken(index)}, ${t.label}. Open the track list to pick any section`);
    }
  }
  // Drawn afresh, the controls are new elements: the one that had the focus (the record, cassette or bar, ⏮, the list
  // button, ⏭) hands it to its twin, so a keyboard keeps its place when a bonus track comes or goes. A tab on the
  // digital player hands it to the tab of the same section, or to the current tab when that section's tab has gone.
  const CONTROLS = ['dk-swipe', 'dk-prev', 'dk-list', 'dk-next'];
  const want = () => { const m = menuStyle(); return m === 'tape' || m === 'digital' ? m : 'record'; };
  const onTab = () => { const a = document.activeElement; return !!a && holder.contains(a) && a.classList.contains('dk-tab'); };
  function draw() {
    const a = document.activeElement, had = a && holder.contains(a) ? CONTROLS.find(c => a.classList.contains(c)) : null;
    const hadTab = onTab() ? a.dataset.section : null;
    style = want();
    holder.dataset.style = style;
    parts = style === 'tape' ? buildTape() : style === 'digital' ? buildDigital() : buildRecord();
    wireSwipe(parts.swipe);
    holder.classList.add('dk-still'); paint(); void holder.offsetWidth; holder.classList.remove('dk-still'); // no animation when drawn fresh
    if (had) holder.querySelector('.' + had)?.focus({ preventScroll: true });
    else if (hadTab != null) ((parts.tabEls && (parts.tabEls.find(b => b.dataset.section === hadTab) || parts.tabEls[index])) || parts.swipe).focus({ preventScroll: true });
  }

  /* ------------------------------- moving ------------------------------- */
  function go(to, silent, dir) {
    to = ((to % n) + n) % n;
    if (to === index && !silent) return;
    const d = dir || (to > index ? 1 : to < index ? -1 : 0);
    index = to; turns += d;
    paint();
    if (!silent) { haptic(); announce(`${tabs[index].label}, ${spoken(index)}`); onSelect(index, d); }
  }
  const step = d => go(index + d, false, d);

  // The whole list at once: the sleeve (record), the cassette's track list or the digital player's. Each entry opens
  // its section by id when tapped, wherever that section is on the menu by then; a new list of tracks closes it (setTabs).
  let closeList = () => {};
  const pickSection = id => {
    const at = tabs.findIndex(t => t.id === id);
    if (at === index) return;
    if (at >= 0) go(at); else if (onExtra) onExtra(id);
  };
  function openList() {
    let close = () => {};
    const col = (from, to, head, num = idOf) => h('div', { class: 'dk-side' }, h('span', { class: 'dk-side-head' }, head),
      ...tabs.slice(from, to).map((t, j) => {
        const k = from + j, c = countOf(k);
        return h('button', { type: 'button', class: 'dk-track' + (k === index ? ' on' : ''), 'aria-current': k === index ? 'true' : null, 'data-section': t.id, onclick: () => { close(); pickSection(t.id); } },
          h('span', { class: 'dk-track-id' }, num(k)), h('span', { class: 'dk-track-name' }, t.label), h('span', { class: 'dk-track-n' }, c ? String(c.n) : ''));
      }));
    // Every section not on this role's menu, so nothing is ever out of reach.
    let more = []; try { more = extras() || []; } catch { more = []; }
    const cur = tabs[index] && tabs[index].id;
    const bonus = more.length > 0 && h('div', { class: 'dk-side dk-bonus' }, h('span', { class: 'dk-side-head' }, 'Bonus tracks'), h('div', { class: 'dk-bonus-list' },
      ...more.map(x => { let c = null; try { c = x.count && x.count(); } catch { c = null; } const on = x.id === cur;
        return h('button', { type: 'button', class: 'dk-track' + (on ? ' on' : ''), 'aria-current': on ? 'true' : null, 'data-section': x.id, onclick: () => { close(); pickSection(x.id); } },
          h('span', { class: 'dk-track-id', 'aria-hidden': 'true' }, '★'), h('span', { class: 'dk-track-name' }, x.label), h('span', { class: 'dk-track-n' }, c && Number.isFinite(c.n) ? String(c.n) : '')); })));
    const tape = style === 'tape', digital = style === 'digital';
    const howMany = (tracks === 1 ? '1 track' : `${tracks} tracks`) + (more.length ? ` · ${more.length} bonus` : '');
    const head = tape ? h('p', { class: 'dk-jcard-title' }, 'Gdex, the booking deck')
      : digital ? h('div', null, h('p', { class: 'dk-jcard-title' }, 'Gdex, the booking deck'), h('div', { class: 'muted small' }, howMany))
        : h('div', { class: 'dk-sleeve-head' }, h('span', { class: 'dk-cover', 'aria-hidden': 'true' }, 'GDEX'), h('div', null, h('strong', null, 'Gdex'), h('div', { class: 'muted small' }, `The booking deck · ${tracks} tracks` + (more.length ? ` · ${more.length} bonus` : ''))));
    // Two sides on the sleeve and the cassette's card; the digital player has one list, numbered from 1.
    const sides = digital ? col(0, tracks, 'Tracks', k => String(k + 1)) : [col(0, sideA, 'Side A'), col(sideA, tracks, 'Side B')];
    const s = sheet(tape || digital ? 'Track list' : 'The sleeve', h('div', { class: 'dk-sheet ' + (tape ? 'dk-jcard' : digital ? 'dk-queue' : 'dk-sleeve') }, head, h('div', { class: 'dk-sides' }, sides), bonus),
      { onClose: () => { if (closeList === s.close) closeList = () => {}; } });
    close = closeList = s.close;
    setTimeout(() => document.querySelector('.dk-sheet .dk-track.on')?.focus(), 60);
  }

  // A swipe across the record, the cassette or the player's bar changes section; a tap opens the list. One finger (or
  // the mouse button) only: the pointer is captured so a release elsewhere still ends the gesture, a second finger (a
  // pinch) cancels it, and a plain mouse hover never counts.
  let moved = false, dragged = false;
  function wireSwipe(el) {
    let sx = null, sy = null, pid = null;
    const end = () => { sx = sy = pid = null; if (moved || dragged) setTimeout(() => { moved = dragged = false; }, 0); }; // after any click the release brings
    el.addEventListener('pointerdown', e => {
      if (!e.isPrimary || pid != null) { sx = sy = pid = null; return; } // a second finger: a pinch, not a swipe
      sx = e.clientX; sy = e.clientY; pid = e.pointerId; moved = dragged = false;
      try { el.setPointerCapture(e.pointerId); } catch { /* not capturable: the gesture still ends on release */ }
    });
    el.addEventListener('pointermove', e => {
      if (sx == null || e.pointerId !== pid || (e.pointerType === 'mouse' && !e.buttons)) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) dragged = true; // a drag that goes anywhere is not a tap
      if (!moved && Math.abs(dx) > 32 && Math.abs(dx) > Math.abs(dy)) { moved = true; step(dx < 0 ? 1 : -1); }
    });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, end);
  }
  function tapped() { if (moved || dragged) { moved = dragged = false; return; } openList(); }

  // Scrolling on the record, the cassette or the player's bar changes section once per wheel gesture (a trackpad flick
  // is one gesture: it ends when the wheel has been still for about a third of a second). Not while zooming (ctrl), and
  // not in the moment after the menu slides back in under the pointer, when the wheel was scrolling the page.
  let wheelBusy = false, wheelIdle = 0, shownAt = 0;
  new MutationObserver(() => { if (!root.classList.contains('tucked')) shownAt = Date.now(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
  holder.addEventListener('wheel', e => {
    if (e.ctrlKey || !e.target.closest('.dk-swipe')) return;
    if (Math.abs(e.deltaY) < 4 && Math.abs(e.deltaX) < 4) return;
    if (Date.now() - shownAt < 450) return; // still the page's scroll
    e.preventDefault();
    clearTimeout(wheelIdle); wheelIdle = setTimeout(() => { wheelBusy = false; }, 350);
    if (wheelBusy) return;
    wheelBusy = true; step((e.deltaY || e.deltaX) > 0 ? 1 : -1);
  }, { passive: false });
  const OWN_ARROWS = '[role=tab],[role=tablist],[role=radio],[role=radiogroup],[role=slider],[role=spinbutton],[role=listbox],[role=option],[role=menu],[role=menuitem],[role=grid],[role=tree]';
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (/input|textarea|select/i.test(t.tagName) || t.isContentEditable || (t.closest && t.closest(OWN_ARROWS))) return; // they use the arrows themselves
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('.sheet-back, .tour') || document.getElementById('app')?.inert) return;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    // On a tab of the digital player the focus follows the section, so the arrows walk along the row; ← → there are
    // the menu's, not the row's own sideways scroll. From a control on the page (a Week row, a block: the page is
    // drawn afresh for the new section, and the control goes with the old one) the focus goes to the menu's current
    // control: the player's tab, else the record or the cassette; never to the page's body. From any other control
    // (the top bar, the menu's own buttons) it stays where it is.
    const tab = onTab(), fromPage = !!(t.closest && t.closest('#page'));
    if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) e.preventDefault();
    step(d);
    if (tab && parts.tabEls && parts.tabEls[index]) parts.tabEls[index].focus({ preventScroll: true });
    else if (fromPage) ((parts.tabEls && parts.tabEls[index]) || parts.swipe).focus({ preventScroll: true });
  });
  // Choosing another menu (Aa → Section menu) redraws in place. Any other display choice (a text size, say) can move
  // the digital player's tabs, so the current one is brought back into view, and then the one the keyboard is on, if any.
  const settle = () => { reveal(); const a = document.activeElement; if (onTab() && a.matches(':focus-visible')) reveal(a); };
  window.addEventListener('gdex-prefs', () => { if (want() !== style) draw(); else settle(); });
  // …and so can a narrower window (a phone turned upright). Not a change of height: a phone's address bar comes and goes.
  let wide = window.innerWidth;
  window.addEventListener('resize', () => { if (window.innerWidth === wide) return; wide = window.innerWidth; settle(); });

  // A new list of tracks (another role, or a bonus track coming or going): redrawn in place, on track `at`, silently.
  // A sleeve still open lists the old tracks, so it closes first (the focus goes back to the deck, then to the twin).
  function setTabs(list, at = 0) {
    closeList();
    tabs = list; sizes();
    index = Math.min(n - 1, Math.max(0, at));
    draw();
  }

  draw();
  return { go, get index() { return index; }, refresh: paint, setTabs };
}
