// The section menu: a record player or a tape deck (Aa → Section menu). Each section is a track, the first half on
// Side A and the rest on Side B. Swipe the record or the cassette, tap ⏮ ⏭, use the arrow keys or scroll on it to
// change section; tap the record (or the cassette) to see every section at once and jump straight to one.
// createDeck(root, tabs, { start, onSelect(i, dir) }) → { go(i), index } — the same shape the Rolodex had.
// tabs: [{ id, label, count?() → { n, one, many } }].
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

export function createDeck(root, tabs, { onSelect, start = 0 }) {
  const n = tabs.length, sideA = Math.ceil(n / 2);
  const idOf = i => (i < sideA ? 'A' + (i + 1) : 'B' + (i - sideA + 1));
  const sideOf = i => (i < sideA ? 'A' : 'B');
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
    const rim = svg('text', { class: 'dk-rim' }, svg('textPath', { href: '#dk-rim-path' }, 'GDEX · THE BOOKING DECK · 33⅓ RPM · SIDE A · SIDE B ·'));
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
    const list = h('button', { type: 'button', class: 'dk-btn dk-list dk-tracks', 'aria-haspopup': 'dialog', onclick: openList }, icon(ICONS.list), 'Tracks');
    const next = h('button', { type: 'button', class: 'dk-btn dk-next', onclick: () => step(1) }, icon(ICONS.ffw));
    holder.replaceChildren(cassette, h('div', { class: 'dk-transport' }, prev, h('span', { class: 'dk-counter', 'aria-hidden': 'true' }, counter, counterOf), list, next));
    return { cassette, reels, packs, labelId, labelName, labelSide, counter, counterOf, prev, next, swipe: cassette };
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
      parts.labelId.textContent = id; parts.labelSide.textContent = 'SIDE ' + sideOf(index);
      parts.name.textContent = t.label; parts.meta.textContent = [id, 'Side ' + sideOf(index), len].filter(Boolean).join(' · ');
      parts.record.setAttribute('aria-label', `Now playing ${id}, ${t.label}. Open the sleeve to pick any section`);
    } else {
      parts.reels.forEach(r => { r.style.transform = `rotate(${turns * 300}deg)`; });
      const size = k => 24 + k * (22 / Math.max(1, n - 1)); // tape winds from the left spool to the right as you go
      [size(n - 1 - index), size(index)].forEach((s, k) => { parts.packs[k].style.width = parts.packs[k].style.height = s + 'px'; parts.packs[k].style.marginLeft = parts.packs[k].style.marginTop = -s / 2 + 'px'; });
      parts.labelId.textContent = id; parts.labelName.textContent = t.label; parts.labelSide.textContent = 'SIDE ' + sideOf(index);
      parts.counter.textContent = String(index * 47).padStart(3, '0'); parts.counterOf.textContent = id;
      parts.cassette.setAttribute('aria-label', `Now on ${id}, ${t.label}. Open the track list to pick any section`);
    }
  }
  function draw() {
    style = menuStyle() === 'tape' ? 'tape' : 'record';
    holder.dataset.style = style;
    parts = style === 'tape' ? buildTape() : buildRecord();
    wireSwipe(parts.swipe);
    holder.classList.add('dk-still'); paint(); void holder.offsetWidth; holder.classList.remove('dk-still'); // no animation when drawn fresh
  }

  /* ------------------------------- moving ------------------------------- */
  function go(to, silent, dir) {
    to = ((to % n) + n) % n;
    if (to === index && !silent) return;
    const d = dir || (to > index ? 1 : to < index ? -1 : 0);
    index = to; turns += d;
    paint();
    if (!silent) { haptic(); announce(`${tabs[index].label}, ${idOf(index)}`); onSelect(index, d); }
  }
  const step = d => go(index + d, false, d);

  // The whole list at once: the sleeve (record) or the cassette's track list.
  function openList() {
    let close = () => {};
    const col = (from, to, side) => h('div', { class: 'dk-side' }, h('span', { class: 'dk-side-head' }, 'Side ' + side),
      ...tabs.slice(from, to).map((t, j) => {
        const k = from + j, c = countOf(k);
        return h('button', { type: 'button', class: 'dk-track' + (k === index ? ' on' : ''), 'aria-current': k === index ? 'true' : null, onclick: () => { close(); go(k); } },
          h('span', { class: 'dk-track-id' }, idOf(k)), h('span', { class: 'dk-track-name' }, t.label), h('span', { class: 'dk-track-n' }, c ? String(c.n) : ''));
      }));
    const tape = style === 'tape';
    const head = tape ? h('p', { class: 'dk-jcard-title' }, 'Gdex, the booking deck')
      : h('div', { class: 'dk-sleeve-head' }, h('span', { class: 'dk-cover', 'aria-hidden': 'true' }, 'GDEX'), h('div', null, h('strong', null, 'Gdex'), h('div', { class: 'muted small' }, `The booking deck · ${n} tracks`)));
    ({ close } = sheet(tape ? 'Track list' : 'The sleeve', h('div', { class: 'dk-sheet ' + (tape ? 'dk-jcard' : 'dk-sleeve') }, head, h('div', { class: 'dk-sides' }, col(0, sideA, 'A'), col(sideA, n, 'B')))));
    setTimeout(() => document.querySelector('.dk-sheet .dk-track.on')?.focus(), 60);
  }

  // A swipe across the record or the cassette changes section; a tap opens the list.
  let moved = false;
  function wireSwipe(el) {
    let sx = null, sy = null;
    el.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; moved = false; });
    el.addEventListener('pointermove', e => {
      if (sx == null || moved) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 32 && Math.abs(dx) > Math.abs(dy)) { moved = true; step(dx < 0 ? 1 : -1); }
    });
    const end = () => { sx = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  function tapped() { if (moved) { moved = false; return; } openList(); }

  holder.addEventListener('wheel', e => { if (Math.abs(e.deltaY) < 4 && Math.abs(e.deltaX) < 4) return; e.preventDefault(); if (holder._lock) return; holder._lock = true; step((e.deltaY || e.deltaX) > 0 ? 1 : -1); setTimeout(() => { holder._lock = false; }, 380); }, { passive: false });
  document.addEventListener('keydown', e => {
    if (/input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('.sheet-back')) return; // a control that used the key keeps it
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(-1);
  });
  // Switching between the record player and the tape deck (Aa → Section menu) redraws in place.
  window.addEventListener('gdex-prefs', () => { if ((menuStyle() === 'tape' ? 'tape' : 'record') !== style) draw(); });

  draw();
  return { go, get index() { return index; }, refresh: paint };
}
