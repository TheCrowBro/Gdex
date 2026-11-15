// Free notes on a booking. Saved when the box loses focus (not on every key), so typing never redraws the page under
// the cursor. What is typed but not yet saved is kept if the page redraws meanwhile, and saved if the app is closed.
import { h } from '../util.js';
import { byId, patch } from '../store.js';
import { blockShown } from '../roles.js';

const DRAFT = new Map();   // booking id → text typed and not saved yet
let savedAt = { id: null, t: 0 };

function save(id, text) {
  DRAFT.delete(id);
  const b = byId('bookings', id);
  if (!b) return;
  const v = String(text ?? '').replace(/\s+$/, '');
  if (v === (b.notes || '')) return;
  savedAt = { id, t: Date.now() };
  patch('bookings', id, { notes: v });
}
const flush = () => { for (const [id, text] of [...DRAFT]) save(id, text); };
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

const firstLine = s => { const l = String(s || '').split('\n').map(x => x.trim()).find(Boolean) || ''; return l.length > 48 ? l.slice(0, 47).trimEnd() + '…' : l; };
// The words follow the role: with the day sheet box in use, notes are written for the band's day sheet; for a role that
// keeps it out of the way (a scout, a gig-goer) they are the person's own notes on the night.
const forBand = () => blockShown('daysheet');

export default {
  id: 'notes', title: 'Notes', icon: '📝', order: 95,
  kinds: ['show', 'session', 'rehearsal', 'other'],
  summary(b) { return firstLine(DRAFT.has(b.id) ? DRAFT.get(b.id) : b.notes); },
  render(b) {
    const ta = h('textarea', {
      id: 'bk-notes-text', class: 'bk-notes', rows: 6, 'aria-label': 'Notes for this booking',
      placeholder: forBand() ? 'Anything to remember: the door code, who brings the merch float, the promoter’s dog’s name…' : 'Anything to remember: who you’re meeting, tickets or the guest list, the last train home…',
      value: DRAFT.has(b.id) ? DRAFT.get(b.id) : b.notes || '',
    });
    ta.addEventListener('input', () => DRAFT.set(b.id, ta.value));
    ta.addEventListener('change', () => save(b.id, ta.value));
    ta.addEventListener('blur', () => { if (DRAFT.has(b.id)) save(b.id, ta.value); });
    const fresh = savedAt.id === b.id && Date.now() - savedAt.t < 4000;
    return h('div', { class: 'bk-notes-wrap' }, ta,
      h('p', { class: 'muted small bk-notes-state', 'aria-live': 'polite' }, fresh ? '✓ Saved' : forBand() ? 'Saved when you leave the box. Notes go on the band’s day sheet unless you leave them off it.' : 'Your own notes. Saved when you leave the box.'));
  },
  tutorial: () => [{ title: 'Notes', text: forBand() ? 'Saved when you leave the box. Notes go on the band’s day sheet unless you switch them off in its “What goes on it”, so keep private things out.'
    : 'Your own notes on this booking, saved when you leave the box.', target: ['#blk-notes textarea'] }],
};
