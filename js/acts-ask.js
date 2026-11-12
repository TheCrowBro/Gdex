// "Did you see them?": after a show is over, Gdex asks whether the person saw the act (Yes takes a score out of 100
// for the act's card, No marks the show "Didn’t go"). Who is asked is js/roles.js askSeen(); which shows are waiting is
// js/model.js waitingShows(). js/app.js calls askAtOpen once per page load with the shows that were waiting at boot;
// Settings → Your role draws askPref().
// These are the stubs every caller codes against; the sheet and the control are filled in by the ask feature.

// Opens "Did you see them?" for the ids still waiting; nothing when the person is not asked or none is left.
export function askAtOpen(ids) {}
// The Settings control that turns the question on or off (a node), or null.
export function askPref() { return null; }
