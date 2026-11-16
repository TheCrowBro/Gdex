// The start (the owner, 15 Nov 2026: "At the beginning, force a tutorial for users to add a band, venue, and then a show
// for the audiophiles role"): a role's first steps, taken for real, straight after it is picked at "Who’s using
// Tourbook?" on a device with nothing in it, before the welcome tour. Each step is a card over the page's own add
// button (runTour, forced: no Skip, Escape and the arrows do nothing), then that page's own form, with a line at its
// top. Cancel or ✕ brings the card back, and so do a reload and a closed app, at the step reached (the first step whose
// list is still empty), until the last step's record is added. The one way out without adding is bringing data in from
// a backup file or Google Drive. Kept on this device under tourbook-start ({ role, made }: the ids its forms saved).
// Every role has one (the owner, 15 Nov 2026: "Then do this for the other roles"): the same three steps, an act, a
// place and a booking, in the role's own words (STARTS). It never runs while Tourbook may not change things (the
// licence: canWrite).
import { h } from './util.js';
import { db, subscribe, COLLECTIONS } from './store.js';
import { runTour, tourSeen, welcomeSteps } from './tour.js';
import { roleId, startSection } from './roles.js';
import { capital } from './bookings-kit.js';
import { canWrite, onLicenceChange } from './licence-state.js';
import { editAct } from './pages/acts.js';
import { editVenue } from './pages/venues.js';
import { newBooking, openBooking, showCalendar } from './pages/bookings.js';

const KEY = 'tourbook-start';
const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const q = s => `“${s}”`;
// The names of the act and the place the start's own forms saved (else the first in each list), '' when none.
const names = st => ['acts', 'venues'].map(list => { const r = db[list].find(x => st.made.includes(x.id)) || db[list][0]; return r ? String(r.name || '').trim() : ''; });
// The three steps of every start, in order: an act, a place, a booking. Each: the list its record goes in, the section
// and button its card points at, and its form, opened with the role's start (r) and the callback that records what it
// saved. What a step says is the role's own (STARTS).
const STEPS = {
  act: { list: 'acts', go: 'acts', target: ['#ac-new-empty', '#ac-new', '.page-head'], open: (r, saved) => editAct({}, saved) },
  place: { list: 'venues', go: 'venues', target: ['#vn-first', '#vn-add', '.page-head'], open: (r, saved) => editVenue({ kind: r.placeKind }, saved) },
  booking: { list: 'bookings', go: 'bookings', target: ['.bk-new', '.page-head'], last: true, open: (r, saved) => newBooking({ kind: r.kind, blankAct: true }, { onSaved: saved }) },
};
const ORDER = ['act', 'place', 'booking'];
const NOTE_ACT = 'Only the name is needed. The rest can wait.';
const NOTE_PLACE = 'Only the name is needed. An address puts it on the map.';
// The booking step's words, from the role's: the booking (noun), who it is for (what: 'you’re going to'), and the act
// and the place as the form's boxes call them (act: 'band', place: 'venue'). b, v: the names of the act and the place
// the start saved; the words without them stand in only if one is empty.
const booking = ({ noun, what, act, place }) => {
  const last = `Last, ${an(noun)} ${what}.`;
  return {
    title: `Add ${an(noun)}`,
    text: (b, v) => (b && v ? `${last} Type the first letters of ${q(b)} and ${q(v)}, and pick each from the list.` : `${last} Type the ${act} and the ${place}, and pick each from the list.`),
    note: (b, v) => (b && v ? `Type the first letters of ${q(b)} in the ${capital(act)} box and pick it from the list, then ${q(v)} in the ${capital(place)} box. The rest can wait.`
      : `Type ${an(act)} and ${an(place)}, and pick each from the list. The rest can wait.`),
  };
};
const LOOK = 'Next, a quick look around. Tap Skip any time.';
// Each role's start: the kind of place (placeKind) and of booking (kind) its last two steps add; each step's words
// (title, text, note: strings, or functions of the act's and the place's names); and its last card, over the page of
// what the last step added (done: title, text and target, its selectors best first; a title or text may be a function
// of that record). Every role has one: its words agree with its pages' (acts.js, venues.js, bookings.js), which
// 04-start checks.
export const STARTS = {
  producer: { placeKind: 'studio', kind: 'session',
    act: { title: 'Add an artist', text: 'Three steps put your first studio session on your calendar. First, an artist you produce: their page keeps their contacts, links and tech rider.', note: NOTE_ACT },
    place: { title: 'Add a studio', text: 'Next, a studio you record in. Save it once and it’s there to pick for every studio session there.', note: NOTE_PLACE },
    booking: booking({ noun: 'studio session', what: 'you’re producing', act: 'artist', place: 'studio' }),
    done: { title: 'Your first studio session is on your calendar', text: `On the day, start the clock here for the hours; the take log is further down. ${LOOK}`,
      target: ['#blk-clock .sd-clock', '#blk-clock > summary', '.bk-page .bk-hero'] } },
  manager: { placeKind: 'venue', kind: 'show',
    act: { title: 'Add an act', text: 'Three steps put your first show on your calendar. First, an act on your roster: its page keeps the press kit and tech rider for promoters.', note: NOTE_ACT },
    place: { title: 'Add a venue', text: 'Next, a venue your acts play. Save it once and it’s there to pick for every show there.', note: NOTE_PLACE },
    booking: booking({ noun: 'show', what: 'they’re playing', act: 'act', place: 'venue' }),
    done: { title: 'Your first show is on your calendar', text: `Add the deal here, then tick off the advance checklist under it as you go. ${LOOK}`,
      target: ['#sh-deal-add', '#blk-deal > summary', '.bk-page .bk-hero'] } },
  band: { placeKind: 'venue', kind: 'show',
    act: { title: 'Add your band', text: 'Three steps put your first show on your calendar. First, your band: its page keeps the members, the press kit and the tech rider.', note: NOTE_ACT },
    place: { title: 'Add a venue', text: 'Next, a venue you play. Save it once and it’s there to pick for every show there.', note: NOTE_PLACE },
    booking: booking({ noun: 'show', what: 'you’re playing', act: 'band', place: 'venue' }),
    done: { title: 'Your first show is on your calendar', text: `Start the night’s setlist here: Tourbook checks it fits your set. ${LOOK}`,
      target: ['#blk-setlist .sg-blk .btn.primary', '#blk-setlist > summary', '.bk-page .bk-hero'] } },
  solo: { placeKind: 'venue', kind: 'show',
    act: { title: 'Add your act', text: 'Three steps put your first show on your calendar. First, your act: the name you play under. Its page keeps your press kit and tech rider to send ahead.', note: 'Only the name you play under is needed. The rest can wait.' },
    place: { title: 'Add a venue', text: 'Next, a venue you play. Save it once and it’s there to pick for every show there.', note: NOTE_PLACE },
    booking: booking({ noun: 'show', what: 'you’re playing', act: 'act', place: 'venue' }),
    done: { title: 'Your first show is on your calendar', text: `Add the deal here, and your setlist further down. ${LOOK}`,
      target: ['#sh-deal-add', '#blk-deal > summary', '.bk-page .bk-hero'] } },
  scout: { placeKind: 'venue', kind: 'show',
    act: { title: 'Add an act', text: 'Three steps put your first show on your calendar. First, an act you’re watching: their card keeps your score each time you see them.', note: NOTE_ACT },
    place: { title: 'Add a venue', text: 'Next, a venue you scout in. Save it once and it’s there to pick for every show there.', note: NOTE_PLACE },
    booking: booking({ noun: 'show', what: 'you’re going to', act: 'act', place: 'venue' }),
    done: { title: 'Your first show is on your calendar', text: `On the night or after, score the act out of 100 on this page. ${LOOK}`,
      target: ['.bk-page .bk-hero .bk-score', '.bk-page .bk-hero'] } },
  audiophile: { placeKind: 'venue', kind: 'show',
    act: { title: 'Add a band', text: 'Three steps put your first gig on your calendar. First, a band you’ve seen or want to see: their card keeps your score each time you see them.', note: NOTE_ACT },
    place: { title: 'Add a venue', text: 'Next, a venue you go to. Save it once and it’s there to pick for every gig there.', note: NOTE_PLACE },
    booking: booking({ noun: 'gig', what: 'you’re going to', act: 'band', place: 'venue' }),
    done: { title: 'Your first gig is on your calendar', text: `On the night or after, score the band out of 100 on this page. ${LOOK}`,
      target: ['.bk-page .bk-hero .bk-score', '.bk-page .bk-hero'] } },
  all: { placeKind: 'venue', kind: 'show',
    act: { title: 'Add an act', text: 'Three steps put your first show on your calendar. First, an act: a band or artist you play with, manage, produce or follow.', note: NOTE_ACT },
    place: { title: 'Add a venue', text: 'Next, a venue you play or go to. Save it once and it’s there to pick for every show there.', note: NOTE_PLACE },
    booking: booking({ noun: 'show', what: 'they’re playing', act: 'act', place: 'venue' }),
    done: { title: 'Your first show is on your calendar', text: `Tap a box to open it, from the deal to the settlement. ${LOOK}`,
      target: ['#blk-deal > summary', '.bk-page .bk-blocks', '.bk-page .bk-hero'] } },
};
const stepsOf = role => (STARTS[role] ? ORDER : []);
// A word or a line: a string, or a function of what it is about.
const say = (x, ...args) => (typeof x === 'function' ? x(...args) : x);

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
// welcome tour and the sheets at an opening, with tour false once the start's own shorter tour has run, or when the
// licence ended the start (its sheets come first; the welcome tour waits for the next opening).
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
    if (st.role !== roleId() || !STARTS[st.role] || brought(st)) { clear(); return end(true); } // brought in (or another role): the welcome tour from its first card
    // The licence refuses changes now (the free days over, or the terms refused): the start is over, never a trap. Its
    // sheets say why at once (the free-days-over sheet); the welcome tour waits for the next opening.
    if (!canWrite()) { clear(); return end(false); }
    const ids = stepsOf(st.role), at = placeOf(st);
    if (at < 0) { clear(); return end(true); }
    const s = STEPS[ids[at]], w = STARTS[st.role][ids[at]], [b, v] = names(st);
    let why = 'form', stop = null;
    const again = () => { why = 'again'; if (stop) stop(); };
    const unsub = subscribe(() => { const now = read(); if (!now || brought(now) || placeOf(now) !== at) again(); });
    const unlic = onLicenceChange(() => { if (!canWrite()) again(); }); // the free days ran out while the card is up
    window.addEventListener('tourbook-role', again); // another role chosen meanwhile (nothing on screen can, under the card)
    const off = () => { unsub(); unlic(); window.removeEventListener('tourbook-role', again); };
    // The way out is under the words, not beside the primary, so a card cut short on a small screen keeps its room for them.
    stop = runTour([{ go: s.go, target: s.target, count: `Step ${at + 1} of ${ids.length}`, title: w.title, text: say(w.text, b, v), button: `${w.title}…`,
      body: ({ stop: leave }) => h('button', { type: 'button', class: 'btn ghost small start-backup', id: 'start-backup', onclick: () => { why = 'backup'; leave(); } }, 'I have a backup file or Google Drive…') }], {
      forced: true,
      onEnd: safe(() => {
        off();
        if (why === 'again') return whenClear(step);
        if (why === 'backup') return import('./backup.js').then(m => m.openBackupSheet()).catch(e => console.error(e)).then(() => whenClear(step));
        // No form while the licence would refuse what it saves (a terms sheet closed meanwhile): step() ends the start.
        if (!canWrite()) return whenClear(step);
        // The primary button: the page's own form, with the start's line at its top.
        let gig = null;
        const had = document.querySelectorAll('.sheet form.form').length;
        s.open(STARTS[st.role], rec => {
          if (!rec || !rec.id) return;
          if (s.last) { gig = rec; clear(); return; }
          const now = read() || { role: st.role, made: [...st.made] };
          if (!now.made.includes(rec.id)) now.made.push(rec.id);
          save(now);
        });
        const forms = document.querySelectorAll('.sheet form.form'), form = forms.length > had ? forms[forms.length - 1] : null;
        if (form) {
          form.prepend(h('p', { class: 'start-note', id: 'start-note' }, say(w.note, b, v)));
          const first = form.querySelector('input, textarea, select');
          if (first) first.setAttribute('aria-describedby', [first.getAttribute('aria-describedby'), 'start-note'].filter(Boolean).join(' '));
        }
        whenClear(safe(() => (gig ? finish(gig, st.role) : step())));
      }),
    });
    if (!stop) { off(); return whenClear(step); } // another walkthrough came up first: wait for it
    if (why === 'again') stop();
  });

  // The last record is added: its page, with the role's last card over what the role does there next (the clock, the
  // deal, the setlist, the score row…; else the whole of its top card, which is too tall for the card to fit beside it
  // on a phone), then the welcome tour without its welcome and without the sections the start has just been through.
  // However it ends, it marks the welcome tour seen and leaves the person on the calendar.
  const finish = safe((gig, role) => {
    const skip = [...new Set(stepsOf(role).map(id => STEPS[id].go))], done = STARTS[role].done;
    const stop = runTour([{ title: say(done.title, gig), text: say(done.text, gig), target: done.target,
      before: () => (window.logiPage() === 'bookings' && document.querySelector('.bk-page .bk-hero') ? null : openBooking(gig.id)) },
    ...welcomeSteps({ skip }).slice(1)],
    { remember: true, onEnd: safe(() => { showCalendar(); if (window.logiPage() !== startSection()) window.logiGo(startSection()); end(false); }) });
    if (!stop) whenClear(() => finish(gig, role));
  });

  safe(() => {
    let st = read();
    // Never begun while the licence would refuse its forms (a working role whose free days are over cannot be picked; this
    // is the guard behind that).
    if (!st && picked && STARTS[picked] && picked === roleId() && !tourSeen() && COLLECTIONS.every(c => !db[c].length) && canWrite()) { save({ role: picked, made: [] }); st = read(); }
    if (!st) { clear(); return end(true); }
    if (st.role !== roleId() || !STARTS[st.role]) { clear(); return end(true); }
    whenClear(step);
  })();
}
