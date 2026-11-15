// The start (the owner, 15 Nov 2026: "At the beginning, force a tutorial for users to add a band, venue, and then a show
// for the audiophiles role"): a role's first steps, taken for real, straight after it is picked at "Who’s using
// Tourbook?" on a device with nothing in it, before the welcome tour. Each step is a card over the page's own add
// button (runTour, forced: no Skip, Escape and the arrows do nothing), then that page's own form, with a line at its
// top. Cancel or ✕ brings the card back, and so do a reload and a closed app, at the step reached (the first step whose
// list is still empty), until the last step's record is added. The one way out without adding is bringing data in from
// a backup file or Google Drive. Kept on this device under tourbook-start ({ role, made }: the ids its forms saved).
// Only the Audiophile has steps so far: another role adds its entry to STARTS (its steps and its last card), and any
// step of its own to STEPS.
import { h } from './util.js';
import { db, subscribe, COLLECTIONS } from './store.js';
import { runTour, tourSeen, welcomeSteps } from './tour.js';
import { roleId, actWord, startSection } from './roles.js';
import { capital } from './bookings-kit.js';
import { editAct } from './pages/acts.js';
import { editVenue } from './pages/venues.js';
import { newBooking, openBooking, showCalendar, showWord } from './pages/bookings.js';

const KEY = 'tourbook-start';
const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const q = s => `“${s}”`;
// The names of the band and the venue the start's own forms saved (else the first in each list), '' when none.
const names = st => ['acts', 'venues'].map(list => { const r = db[list].find(x => st.made.includes(x.id)) || db[list][0]; return r ? String(r.name || '').trim() : ''; });
// A step: the list its record goes in, the section and button its card points at, its words, its form (opened with
// the callback that records what it saved), the line at the top of that form, and for the last step `last`. These three
// are in the Audiophile's words (a band you've seen, a venue you go to, a gig you're going to): a role that would say
// it otherwise has steps of its own, which may share a list and a form with these.
const STEPS = {
  band: { list: 'acts', go: 'acts', target: ['#ac-new-empty', '#ac-new', '.page-head'],
    title: () => `Add ${an(actWord())}`, button: () => `Add ${an(actWord())}…`,
    text: () => `Three steps put your first ${showWord()} on your calendar. First, ${an(actWord())} you’ve seen or want to see: their card keeps your score each time you see them.`,
    note: () => 'Only the name is needed. The rest can wait.',
    open: saved => editAct({}, saved) },
  venue: { list: 'venues', go: 'venues', target: ['#vn-first', '#vn-add', '.page-head'],
    title: () => 'Add a venue', button: () => 'Add a venue…',
    text: () => `Next, a venue you go to. Save it once and it’s there to pick for every ${showWord()} there.`,
    note: () => 'Only the name is needed. An address puts it on the map.',
    open: saved => editVenue({ kind: 'venue' }, saved) },
  gig: { list: 'bookings', go: 'bookings', target: ['.bk-new', '.page-head'], last: true,
    title: () => `Add ${an(showWord())}`, button: () => `Add ${an(showWord())}…`,
    text: st => { const [b, v] = names(st); return b && v ? `Last, ${an(showWord())} you’re going to. Type the first letters of ${q(b)} and ${q(v)}, and pick each from the list.`
      : `Last, ${an(showWord())} you’re going to. Type the ${actWord()} and the venue, and pick each from the list.`; },
    note: st => { const [b, v] = names(st); return b && v ? `Type the first letters of ${q(b)} in the ${capital(actWord())} box and pick it from the list, then ${q(v)} in the Venue box. The rest can wait.`
      : `Type ${an(actWord())} and a venue, and pick each from the list. The rest can wait.`; },
    open: saved => newBooking({ kind: 'show', blankAct: true }, { onSaved: saved }) },
};
// The roles with a start of their own: its steps in order, and its last card, shown over the page of what the last
// step added (done: title, text and target, best first; functions of that record).
export const STARTS = {
  audiophile: { steps: ['band', 'venue', 'gig'], done: {
    title: () => `Your first ${showWord()} is on your calendar`,
    text: () => `On the night or after, score the ${actWord()} out of 100 on this page. Next, a quick look around. Tap Skip any time.`,
    target: ['.bk-page .bk-hero .bk-score', '.bk-page .bk-hero'] } },
};
const stepsOf = role => (STARTS[role] && STARTS[role].steps) || [];

// The key, read fresh at every check (another tab may have moved it). A copy in memory stands in only while storage
// refuses the writes (private mode, full): undefined while storage answers.
let kept;
function read() {
  if (kept !== undefined) return kept && { role: kept.role, made: [...kept.made] };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v === 'object' && typeof v.role === 'string' && Array.isArray(v.made) ? { role: v.role, made: v.made.filter(x => typeof x === 'string') } : null;
  } catch { return null; }
}
function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); kept = undefined; } catch { kept = { role: st.role, made: [...st.made] }; } }
function clear() { try { localStorage.removeItem(KEY); kept = undefined; } catch { kept = null; } }
// Where a start is: the first of its role's steps whose list is still empty (-1 when none is).
const placeOf = st => stepsOf(st.role).findIndex(id => !db[STEPS[id].list].length);
// Data brought in (a backup file, Google Drive, another tab): any record the start's own forms did not save.
const brought = st => COLLECTIONS.some(c => db[c].some(r => !st.made.includes(r.id)));
// Every 250 ms until no sheet or walkthrough is on screen.
const whenClear = fn => { const t = () => (document.querySelector('.sheet-back, .tour') ? setTimeout(t, 250) : fn()); setTimeout(t, 250); };

// After "Who’s using Tourbook?" (picked: the role picked there; none when it was closed without a pick, or when
// Tourbook opens with a start under way). then(tour) runs once, when the start is over or there is none: app.js's
// welcome tour and the sheets at an opening, with tour false once the start's own shorter tour has run.
export function runStart(picked, then = () => {}) {
  let ended = false;
  const end = tour => { if (ended) return; ended = true; then(tour); };
  // Anything that goes wrong ends the start: Tourbook carries on as it would without one.
  const safe = fn => (...args) => { try { return fn(...args); } catch (e) { console.error(e); clear(); end(true); return undefined; } };

  // A step's card, over the page's own add button. It comes back after a closed form, a backup sheet or a change
  // brought in meanwhile (which may have ended the start).
  const step = safe(() => {
    const st = read();
    if (!st) return end(true);
    if (st.role !== roleId() || !STARTS[st.role] || brought(st)) { clear(); return end(true); } // brought in: the welcome tour from its first card
    const ids = stepsOf(st.role), at = placeOf(st);
    if (at < 0) { clear(); return end(true); }
    const s = STEPS[ids[at]];
    let why = 'form', stop = null;
    const unsub = subscribe(() => { const now = read(); if (!now || brought(now) || placeOf(now) !== at) { why = 'again'; if (stop) stop(); } });
    // The way out is under the words, not beside the primary, so a card cut short on a small screen keeps its room for them.
    stop = runTour([{ go: s.go, target: s.target, count: `Step ${at + 1} of ${ids.length}`, title: s.title(st), text: s.text(st), button: s.button(st),
      body: ({ stop: leave }) => h('button', { type: 'button', class: 'btn ghost small start-backup', id: 'start-backup', onclick: () => { why = 'backup'; leave(); } }, 'I have a backup file or Google Drive…') }], {
      forced: true,
      onEnd: safe(() => {
        unsub();
        if (why === 'again') return whenClear(step);
        if (why === 'backup') return import('./backup.js').then(m => m.openBackupSheet()).catch(e => console.error(e)).then(() => whenClear(step));
        // The primary button: the page's own form, with the start's line at its top.
        let gig = null;
        const had = document.querySelectorAll('.sheet form.form').length;
        s.open(rec => {
          if (!rec || !rec.id) return;
          if (s.last) { gig = rec; clear(); return; }
          const now = read() || { role: st.role, made: [...st.made] };
          if (!now.made.includes(rec.id)) now.made.push(rec.id);
          save(now);
        });
        const forms = document.querySelectorAll('.sheet form.form'), form = forms.length > had ? forms[forms.length - 1] : null;
        if (form) {
          form.prepend(h('p', { class: 'start-note', id: 'start-note' }, s.note(st)));
          const first = form.querySelector('input, textarea, select');
          if (first) first.setAttribute('aria-describedby', [first.getAttribute('aria-describedby'), 'start-note'].filter(Boolean).join(' '));
        }
        whenClear(safe(() => (gig ? finish(gig, st.role) : step())));
      }),
    });
    if (!stop) { unsub(); return whenClear(step); } // another walkthrough came up first: wait for it
    if (why === 'again') stop();
  });

  // The last record is added: its page, with the role's last card (the Audiophile's over the gig's score row, else the
  // whole of its top card, which is too tall for the card to fit beside it on a phone), then the welcome tour without its
  // welcome and without the sections the start has just been through. However it ends, it marks the welcome tour seen
  // and leaves the person on the calendar.
  const finish = safe((gig, role) => {
    const skip = [...new Set(stepsOf(role).map(id => STEPS[id].go))], done = STARTS[role].done;
    const stop = runTour([{ title: done.title(gig), text: done.text(gig), target: done.target,
      before: () => (window.logiPage() === 'bookings' && document.querySelector('.bk-page .bk-hero') ? null : openBooking(gig.id)) },
    ...welcomeSteps({ skip }).slice(1)],
    { remember: true, onEnd: safe(() => { showCalendar(); if (window.logiPage() !== startSection()) window.logiGo(startSection()); end(false); }) });
    if (!stop) whenClear(() => finish(gig, role));
  });

  safe(() => {
    let st = read();
    if (!st && picked && STARTS[picked] && picked === roleId() && !tourSeen() && COLLECTIONS.every(c => !db[c].length)) { save({ role: picked, made: [] }); st = read(); }
    if (!st) { clear(); return end(true); }
    if (st.role !== roleId() || !STARTS[st.role]) { clear(); return end(true); }
    whenClear(step);
  })();
}
