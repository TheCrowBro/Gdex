// House rules on a venue (what it allows in: cameras, the age limit, bags… and anything unusual), drawn wherever they
// show: a chip on a show's card, the full rules on the venue's sheet and on the show's page, and the part of the venue
// form that edits them. The data is on the venue (rules, rulesNote, rulesTone); the levels and the words come from
// js/model.js (rulesOf, rulesLevel, rulesChipText, rulesList, showRulesVenue). It imports util.js, store.js and
// model.js only.
// These are the stubs every caller codes against; the drawing is filled in by the house rules feature.

// The chip on a show's card: a span (never a control: cards are buttons), or null when the show has no rules to show.
export function rulesChip(b) { return null; }
// The same chip for a venue.
export function venueChip(v) { return null; }
// The full rules: a node, or null when the venue has none. where: 'venue' | 'show'.
export function rulesFull(v, { where = 'venue' } = {}) { return null; }
// The House rules part of the venue form: { node, read() → the known answers }.
export function rulesEditor(v) { return { node: null, read: () => ({}) }; }
