// Tools: the musician's kit for the night. A tuner, a metronome, tap tempo with delay and reverb times, a sound
// level meter and a set timer, one at a time under a switcher that remembers the last one picked (until then, the
// role's first tool: tap tempo for a producer, the meter for an audiophile, else the tuner). The page is static
// (live audio is never redrawn away by a data change); it listens to the store itself for the few things that show
// data (songs' tempos, venues' noise limits, tonight's show), and its cleanup stops every sound, microphone, timer,
// wake lock and listener when you leave.
import { h } from '../util.js';
import { subscribe } from '../store.js';
import { stopAll, nudgeAudio } from '../audio.js';
import { isField, letSleep } from '../tools-ui.js';
import { tuner, TUNER_STEPS } from '../tools-tuner.js';
import { metronome, setMetronomeBpm, METRONOME_STEPS } from '../tools-metronome.js';
import { tempo, TEMPO_STEPS } from '../tools-tempo.js';
import { meter, METER_STEPS } from '../tools-meter.js';
import { setTimer, TIMER_STEPS } from '../tools-timer.js';
import { sectionName, pageOpt } from '../roles.js';

// called: the tool in a sentence ("Gdex opens tap tempo…"). tab: the name on its tab, where it differs from the label: a
// soft hyphen lets "Metronome" break onto two lines on a narrow tab ("Metro-" / "nome") instead of being cut off.
const TOOLS = [
  { id: 'tuner', label: 'Tuner', called: 'the tuner', icon: '🎸', make: tuner, steps: TUNER_STEPS },
  { id: 'metronome', label: 'Metronome', tab: 'Metro\u00ADnome', called: 'the metronome', icon: '🥁', make: metronome, steps: METRONOME_STEPS },
  { id: 'tempo', label: 'Tempo', called: 'tap tempo', icon: '👆', make: tempo, steps: TEMPO_STEPS },
  { id: 'meter', label: 'Meter', called: 'the sound level meter', icon: '🔊', make: meter, steps: METER_STEPS },
  { id: 'timer', label: 'Set timer', called: 'the set timer', icon: '⏱️', make: setTimer, steps: TIMER_STEPS },
];
// Picks are kept under gdex-tool-pick. The build before roles wrote gdex-tool each time Tools was drawn, so that key
// says only what was on screen, not what was picked: it is never read, so the role's first tool still applies there.
const TOOL_KEY = 'gdex-tool-pick';
const known = id => TOOLS.some(x => x.id === id);
// tool: the one on screen (the walkthrough follows it). picked: the one the person last picked in this visit, which
// also lasts the visit where storage is blocked.
const S = { tool: '', picked: '' };
// The tool the person picked last, kept on this device; '' until they pick one.
function remembered() {
  if (S.picked) return S.picked;
  try { const t = localStorage.getItem(TOOL_KEY); return known(t) ? t : ''; } catch { return ''; }
}
// The tool Tools opens on: the remembered one, else the role's (pageOpt), else the tuner. Worked out each time the
// page is drawn, not when this file loads, so a new role chosen in the same visit applies while nothing is remembered.
const firstTool = () => [remembered(), pageOpt('tools', 'tool', 'tuner')].find(known) || 'tuner';
// Only a pick is remembered (a tab, the arrow keys on the tabs, Use in the metronome), never the tool a visit opens
// on: looking at Tools must not lock the role's first tool in.
function remember(id) {
  S.picked = id;
  try { localStorage.setItem(TOOL_KEY, id); } catch { /* private mode: for this visit only */ }
}
const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export const tools = {
  id: 'tools', label: 'Tools', icon: '🎚️', static: true,
  render(root) {
    let active = null; // { id, api }
    const panel = h('div', { class: 'tl-panel', id: 'tl-panel', role: 'tabpanel', tabindex: '-1' });
    const tabs = TOOLS.map(t => h('button', {
      type: 'button', role: 'tab', id: 'tl-tab-' + t.id, class: 'tl-tab', 'data-tool': t.id, 'aria-controls': 'tl-panel', 'aria-selected': 'false', tabindex: '-1',
      onclick: () => open(t.id, true),
    }, h('span', { class: 'tl-tab-ico', 'aria-hidden': 'true' }, t.icon), h('span', { class: 'tl-tab-name' }, t.tab || t.label)));
    const seg = h('div', { class: 'tl-seg', role: 'tablist', 'aria-label': 'Tools' }, tabs);

    // pick: the person chose this tool (remembered for next time); without it, the page is only opening on one.
    function open(id, pick = false) {
      if (pick) remember(id);
      if (active && active.id === id) return;
      if (active) { try { active.api.stop && active.api.stop(); } catch (e) { console.error(e); } }
      stopAll(); // nothing from the last tool keeps sounding or listening
      S.tool = id;
      tabs.forEach(b => { const on = b.dataset.tool === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on); });
      panel.setAttribute('aria-labelledby', 'tl-tab-' + id);
      panel.dataset.tool = id;
      panel.replaceChildren();
      const t = TOOLS.find(x => x.id === id) || TOOLS[0];
      let api = {};
      try { api = t.make(panel, ctx) || {}; } catch (e) { console.error(e); panel.replaceChildren(h('div', { class: 'warn' }, 'This tool could not be opened on this device.')); }
      active = { id, api };
    }
    const ctx = {
      // The Tempo tool's "Use in the metronome".
      toMetronome(bpm) { setMetronomeBpm(bpm); open('metronome', true); document.getElementById('tl-tab-metronome')?.focus({ preventScroll: true }); },
    };

    root.append(h('div', { class: 'tl-page' },
      h('div', { class: 'page-head' }, h('h1', null, sectionName('tools', 'Tools'))),
      seg, panel));
    open(firstTool());

    // Keys: the tab strip moves with the arrows; Space runs the metronome and the set timer; T taps the tempo. Arrow
    // keys used inside a tool never reach the section menu, which would otherwise spin to another section.
    const where = t => {
      const inside = panel.contains(t);
      const loose = t === document.body || t === document.documentElement || t === root || (t && t.id === 'page');
      return { inside, loose, field: isField(t), tab: !!(t && t.getAttribute && t.getAttribute('role') === 'tab' && seg.contains(t)) };
    };
    const busy = () => !!document.querySelector('.sheet-back, .tour');
    const onKey = e => {
      if (busy() || !root.isConnected) return;
      const w = where(e.target);
      if (w.tab && [...ARROWS, 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const i = tabs.indexOf(e.target), n = tabs.length;
        const to = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + n) % n;
        open(TOOLS[to].id, true); tabs[to].focus();
        return;
      }
      if (!w.inside && !w.loose && !w.tab) return;
      if (active && active.api.key && active.api.key(e, w)) return;
      if (ARROWS.includes(e.key) && w.inside && !w.field) e.preventDefault();
    };
    // Space would also "click" the focused button when the key comes up: the tool already used it.
    const onKeyUp = e => {
      if (e.key !== ' ' || busy() || !active || !active.api.space) return;
      const w = where(e.target);
      if ((w.inside || w.loose) && !w.field && !w.tab) e.preventDefault();
    };
    const onVis = () => { if (!active) return; if (document.hidden) active.api.hidden && active.api.hidden(); else active.api.visible && active.api.visible(); };
    // Capture phase: the section menu listens on the document too (registered first), and must see the key as used.
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('visibilitychange', onVis);
    root.addEventListener('pointerdown', nudgeAudio); // a tap wakes sound the browser put to sleep
    const unsub = subscribe(() => { if (active && active.api.data) active.api.data(); });

    return () => {
      if (active) { try { active.api.stop && active.api.stop(); } catch (e) { console.error(e); } }
      active = null;
      stopAll(); letSleep();
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('visibilitychange', onVis);
      root.removeEventListener('pointerdown', nudgeAudio);
      unsub();
    };
  },
  // The walkthrough for whichever tool is open.
  // Until a tool is picked, it says which one Gdex opens on (the role's first tool).
  tutorial: () => {
    const first = TOOLS.find(t => t.id === firstTool()) || TOOLS[0];
    return [
      { target: ['.tl-seg'], title: 'Five tools', text: 'A tuner, a metronome, tap tempo with delay times, a sound level meter and a set timer. ' + (remembered() ? 'Gdex opens the one you used last.' : `Gdex opens ${first.called} until you pick one, then the one you used last.`) },
      ...((TOOLS.find(t => t.id === (S.tool || first.id)) || TOOLS[0]).steps),
    ];
  },
};
