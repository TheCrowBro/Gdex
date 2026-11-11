// Roles: who is using Gdex, asked on the first open (js/role-pick.js) and changed under Settings → Your role. A role is a
// layout: which sections are tracks on the section menu and in what order, which one opens first, its own words for a
// few of them, the kind of booking + New starts with, and which boxes a booking's page shows. Changing role never
// deletes or hides data: a section that is not on a role's menu is a bonus track on the sleeve, and any link to it
// opens it. The choice is kept on this device (like the display settings), under gdex-role.
const KEY = 'gdex-role';
export const SECTIONS = ['bookings', 'acts', 'people', 'songs', 'sessions', 'backline', 'venues', 'money', 'tools', 'insurance', 'settings'];

// sections: the menu in order (Settings is always there, last). start: the section a fresh start opens on.
// names: a section's name for this role, used on the menu and as the page's heading. newKind: + New on the calendar.
// hide: booking blocks (js/blocks) this role does not use. money: false keeps fees out of the role's view.
export const ROLES = [
  { id: 'producer', label: 'Producer', icon: '🎚️', blurb: 'Studio sessions, takes, songs and the artists you record.',
    sections: ['bookings', 'sessions', 'songs', 'acts', 'people', 'backline', 'venues', 'money', 'tools', 'settings'], start: 'bookings', names: {}, newKind: 'session', hide: [], money: true },
  { id: 'manager', label: 'Manager', icon: '📋', blurb: 'Your acts’ dates, deals, settlements and the people around them.',
    sections: ['bookings', 'acts', 'money', 'people', 'venues', 'songs', 'insurance', 'settings'], start: 'bookings', names: {}, newKind: 'show', hide: [], money: true },
  { id: 'band', label: 'Band', icon: '🥁', blurb: 'Gigs and rehearsals, setlists, backline and the split.',
    sections: ['bookings', 'songs', 'acts', 'backline', 'venues', 'money', 'people', 'tools', 'settings'], start: 'bookings', names: {}, newKind: 'show', hide: [], money: true },
  { id: 'solo', label: 'Solo artist', icon: '🎤', blurb: 'Your own shows and sessions, songs, gear and getting paid.',
    sections: ['bookings', 'songs', 'money', 'venues', 'backline', 'people', 'tools', 'settings'], start: 'bookings', names: {}, newKind: 'show', hide: [], money: true },
  { id: 'scout', label: 'Scout', icon: '🔭', blurb: 'Acts you are watching: times seen, scores and where they play next.',
    sections: ['acts', 'bookings', 'venues', 'people', 'settings'], start: 'acts', names: {}, newKind: 'show', hide: ['deal', 'settlement', 'money', 'budget', 'guests', 'running'], money: false },
  { id: 'audiophile', label: 'Audiophile', icon: '🎧', blurb: 'Bands you have seen, how they sounded, the venues and the sound meter.',
    sections: ['acts', 'bookings', 'venues', 'tools', 'settings'], start: 'acts', names: {}, newKind: 'show', hide: ['deal', 'settlement', 'money', 'budget', 'guests', 'running', 'advance', 'daysheet'], money: false },
];
// Before a role is chosen (and for anyone who wants it): every section, as Gdex has always been.
export const EVERYTHING = { id: 'all', label: 'Everything', icon: '🗂️', blurb: 'Every section on the menu.', sections: SECTIONS.slice(), start: 'bookings', names: {}, newKind: 'show', hide: [], money: true };
const ALL = [...ROLES, EVERYTHING];

const read = () => { try { const v = localStorage.getItem(KEY); return ALL.some(r => r.id === v) ? v : ''; } catch { return ''; } };
let current = read();
// The menu always ends with Settings, has no unknown or repeated ids, and keeps the start section on it.
const clean = r => { const seen = new Set(); const list = (r.sections || []).filter(id => SECTIONS.includes(id) && id !== 'settings' && !seen.has(id) && seen.add(id)); return [...list, 'settings']; };

export const roleChosen = () => !!current;
export const roleId = () => current || 'all';
export const role = () => ALL.find(r => r.id === roleId()) || EVERYTHING;
export const roleOf = id => ALL.find(r => r.id === id) || null;
export const menuSections = (r = role()) => clean(r);
export const offMenu = (r = role()) => SECTIONS.filter(id => !clean(r).includes(id));
export const startSection = (r = role()) => (clean(r).includes(r.start) ? r.start : clean(r)[0]);
export const sectionName = (id, fallback) => role().names[id] || fallback;
export const blockShown = id => !role().hide.includes(id);
export const newKind = () => role().newKind || 'show';
export const kindHelp = kind => (role().kindHelp || {})[kind] || '';
export const moneyShown = () => role().money !== false;
// Choose a role: kept on this device; the app redraws its menu on the gdex-role event.
// start: open the role's start section (the first-run question); otherwise the page on screen stays.
export function setRole(id, { start = false } = {}) {
  if (!ALL.some(r => r.id === id)) return false;
  current = id;
  try { localStorage.setItem(KEY, id); } catch { /* private mode: for this visit only */ }
  window.dispatchEvent(new CustomEvent('gdex-role', { detail: { id, start } }));
  return true;
}
