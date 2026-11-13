// Roles: who is using Gdex, asked on the first open (js/role-pick.js) and changed under Settings → Your role. A role is a
// layout: which sections are tracks on the section menu and in what order (the calendar is always the first, and where
// Gdex opens), its own words for a few of them, the kind of booking + New starts with, and which boxes a booking's page
// shows. Changing role never deletes or hides data: a section that is not on a role's menu is a bonus track on the
// sleeve, and any link to it opens it. The choice is kept on this device (like the display settings), under gdex-role.
const KEY = 'gdex-role';
export const SECTIONS = ['bookings', 'acts', 'people', 'songs', 'sessions', 'backline', 'venues', 'money', 'tools', 'insurance', 'card', 'settings'];

// Each role, in the shape the app reads (docs/developers.md → Roles):
//   sections   the menu in order (My card and then Settings are always added, last); start: the section Gdex opens on, every time. For
//              every role that is 'bookings', the calendar, and it is the first track on the menu.
//   names      a section's name for this role ({ acts: 'Roster' }): on the menu, as the page's heading, in the tour.
//              Only Bookings and Acts are ever renamed, and never inside documents that go to other people.
//   what       fills "What you do" in the welcome tour when it is empty ('' leaves it empty).
//   newKind    the kind + New offers first; kinds: the order of the rest; kindHelp: the role's words for each kind.
//   hide       booking boxes (js/blocks) the role keeps under "More boxes" on a booking's page.
//   money      false: the deal, settlement, quote & invoice and costs boxes are left off booking pages altogether (their
//              data stays, and comes back with a role that uses money); new shows start Confirmed, not on Hold.
//   welcome, tour   the welcome tour's first card and its stops ({ id, text }, at most five, in menu order).
//   pages      small defaults on existing pages, read with pageOpt(page, key, fallback):
//              bookings.open { kind: [box ids open at first] }, bookings.score (Score this show on a show you went to),
//              bookings.ask (false: not asked "Did you see them?" after a show unless the person turns it on; see askSeen),
//              bookings.noActs (the booking form's hint while there are no acts to pick),
//              acts.order ('name' | 'latest' | 'recent'), acts.tabs (an act's tabs: ['about'] leaves out the press kit and rider,
//              and puts the times seen at the top of its Overview), acts.seen ('always' | 'logged': the times-seen line and log lead
//              only once something is logged), acts.empty (the empty list's words), people.group (+ Add starts there),
//              songs.view ('setlists' to open there when there are songs and setlists), tools.tool (the first tool while none is
//              remembered), money.earned (the label of the year's income).
const HIDE_ALL = ['lineup', 'advance', 'deal', 'running', 'guests', 'settlement', 'daysheet', 'setlist', 'money', 'budget', 'clock', 'takes', 'worksongs', 'deliverables'];
export const ROLES = [
  { id: 'producer', label: 'Producer', icon: '🎛️', what: 'Producer',
    blurb: 'Studio sessions on the clock, take logs, songs and splits, your artists and the invoices.',
    sections: ['bookings', 'sessions', 'songs', 'acts', 'money', 'people', 'venues', 'tools'], start: 'bookings', names: { acts: 'Artists' },
    newKind: 'session', kinds: ['session', 'show', 'other', 'rehearsal'], hide: ['guests', 'settlement'], money: true,
    kindHelp: { session: 'Studio time with an artist: the rate, the clock, the songs, the take log and what you deliver.', show: 'A live date you are producing or playing: times, the deal, the setlist and the day sheet.' },
    welcome: 'Gdex is set up for a producer: studio sessions on one calendar, a clock for the hours, take logs with the keepers, the songs you cut with their split sheets, your artists, and invoices for the time. This takes about a minute. Tap Skip any time.',
    tour: [
      { id: 'bookings', text: 'Your studio diary. + New starts a studio session: the artist, the studio and the rate. Open one for the clock, the songs worked on, the take log and the mixes, stems and masters you owe.' },
      { id: 'sessions', text: 'Start a log when you hit record and tap + Take as each take starts: it is numbered and timed. Mark each one Keep, Maybe or No, then send the keepers to the engineer as text or a spreadsheet.' },
      { id: 'songs', text: 'Key, tempo, length and status for every song you work on, and the split sheet: who wrote it and their share, agreed before release.' },
      { id: 'acts', text: 'The artists you produce: contacts, links, members, the tech rider, and their sessions coming up.' },
      { id: 'money', text: 'Invoices from your rate or the clock’s hours, what’s unpaid or overdue, and the year’s totals.' },
    ],
    pages: { bookings: { open: { session: ['clock', 'takes'] } }, acts: { seen: 'logged', empty: 'Add an artist you produce: their name, links and members. Their page keeps the tech rider and their sessions coming up.' }, people: { group: 'session' }, tools: { tool: 'tempo' } } },
  { id: 'manager', label: 'Manager', icon: '💼', what: 'Artist manager',
    blurb: 'Your acts’ dates, deals and deposits, advancing, settlements and the people around them.',
    sections: ['bookings', 'acts', 'money', 'people', 'venues', 'insurance'], start: 'bookings', names: { acts: 'Roster' },
    newKind: 'show', kinds: ['show', 'session', 'rehearsal', 'other'], hide: ['clock', 'takes'], money: true,
    kindHelp: { show: 'A date for one of your acts: the deal and deposit, advancing, the guest list, settlement and invoice.', session: 'Studio time for one of your acts: the songs, the rate and what gets delivered.' },
    welcome: 'Gdex is set up for a manager: every act on your roster on one calendar, with holds and offers, deals and deposits, advancing, day sheets, settlements and payouts, and the people around them. This takes about a minute. Tap Skip any time.',
    tour: [
      { id: 'bookings', text: 'Every act on your roster on one calendar: holds, offers and confirmed dates, and a filter by act. Open a show for the deal, the advance checklist, running order, guest list, day sheet and settlement.' },
      { id: 'acts', text: 'Your roster: each act’s members, links, a press kit with its QR code, and the tech rider with input list and stage plot, ready to send to a promoter, plus its dates coming up.' },
      { id: 'money', text: 'Deposits still to come in, unpaid invoices with the overdue ones first, what each settled show made, totals per act and what each player was paid.' },
      { id: 'people', text: 'Promoters, agents, crew and players, with what each is booked on. Ask if someone is free for a date in one tap; the message never carries the money.' },
      { id: 'venues', text: 'Capacity, curfew, noise limit, load-in and the contact for every room, and its house rules, which show on every show there. A show there warns you when the set would run past curfew.' },
    ],
    pages: { bookings: { open: { show: ['deal', 'advance'] } }, acts: { seen: 'logged', empty: 'Add an act on your roster: its name, members and links. Its page keeps the press kit and the tech rider to send to promoters, and its dates coming up.' }, people: { group: 'contact' }, money: { earned: 'your acts earned' } } },
  { id: 'band', label: 'Band', icon: '🥁', what: 'Musician',
    blurb: 'Gigs and rehearsals, setlists, who brings what gear, and the split after the show.',
    sections: ['bookings', 'songs', 'backline', 'tools', 'acts', 'money', 'people', 'venues'], start: 'bookings', names: { acts: 'Bands' },
    newKind: 'show', kinds: ['show', 'rehearsal', 'session', 'other'], hide: ['clock', 'takes'], money: true,
    kindHelp: { show: 'A gig: load-in, set times, the deal, the setlist, guest list and the split after.', rehearsal: 'Band practice: the room, the times and the setlist to run.' },
    welcome: 'Gdex is set up for a band: gigs and rehearsals on one calendar, setlists that fit the slot, who brings what gear, the tuner and set timer for the night, and the split after the show. This takes about a minute. Tap Skip any time.',
    tour: [
      { id: 'bookings', text: 'Gigs and rehearsals on one calendar. Open a show for load-in and set times, the deal, the running order and setlist, the guest list, the day sheet for everyone and the settlement.' },
      { id: 'songs', text: 'Key, tempo and length for every song, and setlists that add up to the slot. Print the big stage copy for the floor.' },
      { id: 'backline', text: 'Every guitar, amp and mic with its serial number, value and owner. Stage packs put a whole gig’s gear on a booking in one go.' },
      { id: 'acts', text: 'Your band’s page: members, links, a press kit with a QR code for the merch desk, and the tech rider with input list and stage plot. Add any other band you play in too.' },
      { id: 'money', text: 'What each gig paid, the settlement on the night and what every player got, settled or still owed.' },
    ],
    pages: { bookings: { open: { show: ['running', 'setlist'], rehearsal: ['setlist'] }, ask: false }, acts: { seen: 'logged', empty: 'Add your band: its name, members and links. Its page keeps the press kit and the tech rider, and its gigs coming up. Add any other band you play in too.' }, songs: { view: 'setlists' } } },
  { id: 'solo', label: 'Solo artist', icon: '🎤', what: 'Singer-songwriter',
    blurb: 'Your own gigs and studio days, songs and setlists, your press kit and getting paid.',
    sections: ['bookings', 'songs', 'money', 'acts', 'venues', 'people', 'tools'], start: 'bookings', names: { acts: 'My act' },
    newKind: 'show', kinds: ['show', 'session', 'other', 'rehearsal'], hide: ['takes'], money: true,
    kindHelp: { show: 'A gig, public or private (a wedding, party or corporate date): set times, the deal and deposit, your setlist, the day sheet and getting paid.', session: 'Session or topline work: the rate, the clock, the songs and what to deliver.' },
    welcome: 'Gdex is set up for a solo artist: your gigs and studio days on one calendar, songs and setlists, split sheets for co-writes, your press kit and rider, and the invoices you send. This takes about a minute. Tap Skip any time.',
    tour: [
      { id: 'bookings', text: 'Your gigs, studio days and private bookings on one calendar. Open one for set times, the deal, your setlist, the guest list, the day sheet and the invoice.' },
      { id: 'songs', text: 'Key, tempo and length for every song, setlists that fit the slot, and split sheets for the songs you co-write.' },
      { id: 'money', text: 'What you’re owed and what’s come in: deposits due, unpaid or overdue invoices, settled shows and the year’s totals.' },
      { id: 'acts', text: 'You as an act: bio and links, a one-page press kit with a QR code for the merch table, and the tech rider to send ahead.' },
      { id: 'venues', text: 'The rooms you play or want to: capacity, stage, PA, curfew, the contact, and the house rules that show on every show there. + Book here starts a booking there.' },
    ],
    pages: { bookings: { open: { show: ['deal', 'setlist'] }, noActs: 'Add yourself on the My act page to pick it here.', ask: false }, acts: { seen: 'logged', empty: 'Add yourself as an act: your name, bio and links. Its page keeps a one-page press kit and the tech rider to send ahead.' }, people: { group: 'session' } } },
  { id: 'scout', label: 'Scout', icon: '🔭', what: 'A&R scout',
    blurb: 'Acts you’re watching: a score out of 100 each time you see them, and where they play next.',
    sections: ['bookings', 'acts', 'people', 'venues'], start: 'bookings', names: { bookings: 'Shows' },
    newKind: 'show', kinds: ['show', 'other', 'session', 'rehearsal'], hide: HIDE_ALL, money: false,
    kindHelp: { show: 'A show or showcase you’re going to: the act you’re there to see, where, doors and their time on stage. Score them on the night or after.', other: 'A meeting or call with an act or their team.', session: 'A studio visit or a demo playback.', rehearsal: 'An open rehearsal or soundcheck you’re invited to.' },
    welcome: 'Gdex is set up for scouting: the acts you’re watching, a score out of 100 each time you see them, where they play next, and the managers and agents around them. Fees and settlements stay off your pages. This takes about a minute. Tap Skip any time.',
    tour: [
      { id: 'bookings', text: 'The shows you’re going to, by month, week or day: the act, the venue, doors and their time on stage. After a show Gdex asks if you saw them; Yes takes your score out of 100 for the act’s card.' },
      { id: 'acts', text: 'Every act you’re watching, latest scores first. Each card shows how many times you’ve seen them, your average and latest score, and their next dates. Drop a card open to log tonight’s set.' },
      { id: 'people', text: 'Managers, agents, promoters and label contacts, with call, text and email one tap away and the acts they’re with.' },
      { id: 'venues', text: 'The rooms you scout in: capacity, so you know what a sell-out means, the address and map, the house rules (cameras, phones, the age limit) that show on every show there, and the shows you’ve been to there.' },
    ],
    pages: { bookings: { open: { show: ['notes'], other: ['notes'], session: ['notes'], rehearsal: ['notes'] }, score: true }, acts: { order: 'latest', tabs: ['about'], empty: 'Add an act you’re watching: its name and links. Each time you see them, log a score out of 100; the card keeps the count, your average and latest score, and where they play next.' }, people: { group: 'contact' } } },
  { id: 'audiophile', label: 'Audiophile', icon: '🎧', what: '',
    blurb: 'Bands you’ve seen with a score each time, gigs coming up, the rooms and the sound meter.',
    sections: ['bookings', 'acts', 'venues', 'tools'], start: 'bookings', names: { acts: 'Bands', bookings: 'Gigs' },
    newKind: 'show', kinds: ['show', 'other', 'session', 'rehearsal'], hide: HIDE_ALL, money: false,
    kindHelp: { show: 'A gig you’re going to (an in-store or a listening session too): the band, the venue, doors and set time. Score it on the night or after.', other: 'A record fair or anything else in the diary.', session: 'A studio visit or a playback.', rehearsal: 'An open rehearsal or soundcheck.' },
    welcome: 'Gdex is set up for a gig-goer who listens closely: the bands you’ve seen with a score out of 100 each time and notes on the set and the sound, the gigs coming up, the rooms you go to, and a sound level meter. This takes about a minute. Tap Skip any time.',
    tour: [
      { id: 'bookings', text: 'The gigs you’re going to, by month, week or day: the band, the venue, doors and set time. After a gig Gdex asks if you saw them; Yes takes your score out of 100 for the band’s card.' },
      { id: 'acts', text: 'The bands you’ve seen, latest first. Each time, log a score out of 100 with notes on the set and the sound. The card keeps your average, your latest score and their next dates.' },
      { id: 'venues', text: 'Every room you’ve been to: capacity, the PA and the noise limit, the house rules (cameras, phones, the age limit) that show on every gig there, and the gigs you saw there.' },
      { id: 'tools', text: 'The sound level meter: the level now in dB(A), the loudest moment and the last minute’s average, against the venue’s noise limit. A tuner, a metronome and tap tempo are here too.' },
    ],
    pages: { bookings: { open: { show: ['notes'], other: ['notes'], session: ['notes'], rehearsal: ['notes'] }, score: true }, acts: { order: 'recent', tabs: ['about'], empty: 'Add a band you’ve seen or want to see. Each time you see them, log a score out of 100 with notes on the set and the sound; the card keeps your average, your latest score and their next dates.' }, tools: { tool: 'meter' } } },
];
// Before a role is chosen (and for anyone who wants it): every section, as Gdex has always been.
export const EVERYTHING = { id: 'all', label: 'Everything', icon: '🗂️', what: '', blurb: 'Every section on the menu, as Gdex has always been.', sections: SECTIONS.slice(), start: 'bookings', names: {}, newKind: 'show', hide: [], money: true, pages: {} };
const ALL = [...ROLES, EVERYTHING];

const read = () => { try { const v = localStorage.getItem(KEY); return ALL.some(r => r.id === v) ? v : ''; } catch { return ''; } };
let current = read();
// The menu always ends with My card and Settings (every role has both), has no unknown or repeated ids, and keeps the start section on it.
const clean = r => { const seen = new Set(); const list = (r.sections || []).filter(id => SECTIONS.includes(id) && id !== 'settings' && id !== 'card' && !seen.has(id) && seen.add(id)); return [...list, 'card', 'settings']; };

export const roleChosen = () => !!current;
export const roleId = () => current || 'all';
export const role = () => ALL.find(r => r.id === roleId()) || EVERYTHING;
export const roleOf = id => ALL.find(r => r.id === id) || null;
export const menuSections = (r = role()) => clean(r);
export const offMenu = (r = role()) => SECTIONS.filter(id => !clean(r).includes(id));
export const startSection = (r = role()) => (clean(r).includes(r.start) ? r.start : clean(r)[0]);
export const sectionName = (id, fallback) => role().names[id] || fallback;
// One act in the role's words, for labels like "Artist" on the booking form: 'artist', 'band' or 'act'.
export const actWord = () => ({ producer: 'artist', band: 'band', audiophile: 'band' })[roleId()] || 'act';
// Who the person shows their contact card to (My card, js/pages/card.js), in the role's words.
export const cardAudience = () => ({ producer: 'the artists you record, and the engineers and studios you work with', manager: 'promoters, agents and venues', band: 'promoters, venues and fans at the merch desk', solo: 'promoters, venues and fans at the merch table', scout: 'the acts you’re watching and the managers and agents around them', audiophile: 'the bands and people you meet at gigs' })[roleId()] || 'the artists, promoters, venues and crew you work with';
// The boxes that never show for a role without money, whatever its hide list says.
export const MONEY_BLOCKS = ['deal', 'settlement', 'money', 'budget'];
const moneyOff = (rl = role()) => rl.money === false;
// A box on a booking's page: shown, under "More boxes" (folded), or left off (a money box for a role without money).
export const blockShown = id => !(role().hide || []).includes(id) && !(moneyOff() && MONEY_BLOCKS.includes(id));
export const blockFolded = id => !blockShown(id) && !(moneyOff() && MONEY_BLOCKS.includes(id));
export const newKind = () => role().newKind || 'show';
export const kindHelp = kind => (role().kindHelp || {})[kind] || '';
export const moneyShown = () => role().money !== false;
// A page's default for this role (see pages above): pageOpt('tools', 'tool', 'tuner').
export const pageOpt = (page, key, fallback) => { const v = ((role().pages || {})[page] || {})[key]; return v === undefined ? fallback : v; };
// The kinds of booking in the order the role uses them: its usual kind first.
export const kindOrder = () => { const r = role(), base = ['show', 'session', 'rehearsal', 'other']; const list = (r.kinds || [r.newKind || 'show']).filter(k => base.includes(k)); return [...list, ...base.filter(k => !list.includes(k))]; };
/* ------------------------------- "Did you see them?" ------------------------------- */
// After a show is over Gdex asks whether the person saw the act (js/acts-ask.js). A role answers for itself
// (pages.bookings.ask: false for a band and a solo artist, who were on the stage; asked when not given), and a device
// setting turns the question on or off for anyone: gdex-ask-seen 'on' | 'off'; unset follows the role. Like the role
// it is kept on this device, is not in backups, and is cleared by Erase this device.
const ASK_KEY = 'gdex-ask-seen';
let askMem = null;        // the choice made this visit, for a browser whose storage is blocked or full
let askMemOnly = false;   // the last choice could not be written: it holds for this visit, whatever storage still says
// 'on', 'off', or '' (follow the role). Read from storage each time, unless the last choice could not be kept there.
export const askSetting = () => { let v = askMem; if (!askMemOnly) { try { v = localStorage.getItem(ASK_KEY); } catch { /* blocked storage: this visit's choice */ } } return v === 'on' || v === 'off' ? v : ''; };
// 'on' or 'off'; anything else ('') removes the setting.
export function setAskSetting(v) {
  const val = v === 'on' || v === 'off' ? v : '';
  askMem = val;
  try { if (val) localStorage.setItem(ASK_KEY, val); else localStorage.removeItem(ASK_KEY); askMemOnly = false; } catch { askMemOnly = true; /* private mode, or storage full: for this visit only */ }
}
// The role's own answer.
export const askDefault = (r = role()) => (((r && r.pages) || {}).bookings || {}).ask !== false;
// Whether this person is asked: the setting when there is one, else the role's answer.
export const askSeen = () => { const s = askSetting(); return s ? s === 'on' : askDefault(); };

// Choose a role: kept on this device; the app redraws its menu on the gdex-role event.
// start: open the role's start section (the first-run question); otherwise the page on screen stays.
export function setRole(id, { start = false } = {}) {
  if (!ALL.some(r => r.id === id)) return false;
  current = id;
  try { localStorage.setItem(KEY, id); } catch { /* private mode: for this visit only */ }
  window.dispatchEvent(new CustomEvent('gdex-role', { detail: { id, start } }));
  return true;
}
