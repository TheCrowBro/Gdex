// Every block a booking page can show, in one list (docs/developers.md → Booking blocks). js/pages/bookings.js draws the
// ones whose kinds include the booking's kind, sorted by order: the ones the role uses as boxes, and the ones it hides in
// one closed "More boxes" fold below them.
import { blockShown, blockFolded } from '../roles.js';
import lineup from './lineup.js';
import advance from './advance.js';
import notes from './notes.js';
import deal from './deal.js';
import running from './running.js';
import guests from './guests.js';
import settlement from './settlement.js';
import daysheet from './daysheet.js';
import setlist from './setlist.js';
import money from './money.js';
import budget from './budget.js';
import clock from './clock.js';
import takes from './takes.js';
import worksongs from './worksongs.js';
import deliverables from './deliverables.js';

export const BLOCKS = [lineup, advance, notes, deal, running, guests, settlement, daysheet, setlist, money, budget, clock, takes, worksongs, deliverables].sort((a, b) => a.order - b.order);
// The boxes for a kind of booking, without the ones the role does not use (js/roles.js: hide). Their data stays.
export const blocksFor = kind => BLOCKS.filter(x => (x.kinds || []).includes(kind) && blockShown(x.id));
// The boxes for a kind that the role keeps under "More boxes" (still drawn, closed, in the fold). A money box for a role
// without money is not among them: it is left off the page altogether (js/roles.js: blockFolded).
export const foldedFor = kind => BLOCKS.filter(x => (x.kinds || []).includes(kind) && blockFolded(x.id));
// Every box for a kind that is not among the shown ones: the folded ones and the ones left off.
export const hiddenFor = kind => BLOCKS.filter(x => (x.kinds || []).includes(kind) && !blockShown(x.id));
