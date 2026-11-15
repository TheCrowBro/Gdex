// The Money section: the year at a glance (earned, booked ahead, invoiced, paid, unpaid, overdue), deposits still to
// come in, unpaid invoices (overdue first), the year's settled shows with what each made, income by month, totals per
// act, what each player was paid out, and spreadsheets for the accountant. Everything is worked out from the bookings
// with the shared sums in js/model.js and js/money.js, so the figures agree with every booking page. A quote or an
// invoice can be in a currency other than yours (js/money-currency.js): a total is never added across currencies, it
// shows one sum per currency ("£1,200 GBP + €800 EUR"), and a bar by month is drawn for yours.
import { h, toast, empty, todayISO, fmtShort } from '../util.js';
import { db, update } from '../store.js';
import { fmtMoney, bookingIncome, incomeInvoice, settle, bookingTitle, actName, venueOf, kindLabel, statusLabel, dealSummary, markCheck } from '../model.js';
import { mine, docCur, docMoney, sums, sumsText, sumText, sameCur } from '../money-currency.js';
import { docOf, docTotals, isOverdue, isPaid } from '../money.js';
import { dateText } from '../money-doc.js';
import { csv, saveFile } from '../print.js';
import { openBooking, newBooking } from './bookings.js';
import { isSettled } from '../blocks/settlement.js';
import { sectionName, pageOpt, actWord } from '../roles.js';

let year = null;          // the year on show (null: this year)
let showAllSettled = false;
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1));
const monthShort = i => MONTHS[i].toLocaleDateString(undefined, { month: 'short' });
const monthLong = i => MONTHS[i].toLocaleDateString(undefined, { month: 'long' });
const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const sum = (list, f) => r2(list.reduce((t, x) => t + (Number(f(x)) || 0), 0));
// The same, one sum per currency: cur(x) is each one's currency.
const sumBy = (list, f, cur) => list.reduce((t, x) => t.add(cur(x), f(x)), sums());
// What a booking brings in is in its invoice's currency when it is read from the invoice, else in yours.
const incomeCur = b => { const inv = incomeInvoice(b); return inv ? docCur(inv) : mine(); };
const invCur = x => docCur(x.inv);
// Sums as a stat's value: one line per currency.
const sumsNode = list => (list.length === 1 ? sumsText(list) : list.map(e => h('span', { class: 'mn-cur-line' }, sumText(e))));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const isDone = b => b.status === 'done' || b.status === 'settled';
const isAhead = b => b.status === 'confirmed' || b.status === 'advanced';
const costsOf = b => (b.kind === 'show' ? settle(b).costs : (Array.isArray(b.budget) ? b.budget : []).reduce((t, c) => t + num(c && c.amount), 0));
// A show whose night has been counted (tickets, or money received) or that is marked settled. One counted but not yet
// marked settled is still listed, tagged 'not marked settled', so its figures are not mistaken for final.
const hasSettlement = b => b.kind === 'show' && b.status !== 'cancelled' && !!b.settlement && (num(b.settlement.tickets) > 0 || isSettled(b) || (b.settlement.received !== '' && b.settlement.received != null));
const invDate = (b, inv) => inv.issued || b.date || '';
const tap = (b, ...kids) => h('button', { class: 'card tap mn-row', type: 'button', 'data-fk': 'mn-b-' + b.id, onclick: () => openBooking(b.id) }, ...kids);
// Text a spreadsheet must not run as a formula.
const tx = v => { const s = v == null ? '' : String(v); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
const money2 = n => r2(n).toFixed(2);
// The year's income in the role's words: 'earned' (by you), or for a manager 'your acts earned', since the sum is the
// acts' fees and settlements, not the manager's commission (which Tourbook does not work out).
const earnedWord = () => String(pageOpt('money', 'earned', 'earned') || 'earned');
const ownEarned = () => earnedWord() === 'earned';
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
// "what you earned" / "what your acts earned", for sentences (the empty page, the walkthrough).
const whatEarned = () => (ownEarned() ? 'what you earned' : 'what ' + earnedWord());
// One act's row under By act: "earned", or where the year's income is the acts' (a manager's), "the act earned".
const actEarned = a => (ownEarned() || !a.id ? 'earned' : `the ${actWord()} earned`);

// Money received in a year on an invoice: each payment by its date, and the rest of an invoice marked paid in full
// on the day it was marked.
function paidInYear(inv, Y) {
  const t = docTotals(inv), inY = d => String(d || '').startsWith(Y);
  let got = inv.payments.filter(p => inY(p.date)).reduce((a, p) => a + num(p.amount), 0);
  const rest = t.paid - inv.payments.reduce((a, p) => a + num(p.amount), 0);
  if (inv.status === 'paid' && rest > 0.005) { const when = inv.paidAt ? new Date(inv.paidAt) : null; const iso = when && !isNaN(when) ? `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}` : inv.issued; if (inY(iso)) got += rest; }
  return r2(got);
}

function yearRange() {
  const now = Number(todayISO().slice(0, 4)), ys = db.bookings.map(b => Number(String(b.date || '').slice(0, 4))).filter(n => n > 1900 && n < 3000);
  return [Math.min(now, ...ys), Math.max(now, ...ys)];
}

function render(root) {
  const head = h('div', { class: 'page-head' }, h('h1', null, sectionName('money', 'Money')));
  if (!db.bookings.length) {
    root.append(head, empty(`Your money shows up here once you have bookings: ${whatEarned()}, what is owed to you, deposits due, and what each player was paid.`, h('button', { class: 'btn primary', type: 'button', onclick: () => newBooking({ kind: 'show' }) }, '+ Add a booking')));
    return;
  }
  const [lo, hi] = yearRange();
  const Y = String(Math.min(hi, Math.max(lo, year || Number(todayISO().slice(0, 4)))));
  const go = (y, id) => { year = y; showAllSettled = false; root.replaceChildren(); render(root); const el = document.getElementById(id); (el && !el.disabled ? el : root.querySelector('.mn-year button:not([disabled])'))?.focus(); };
  head.append(h('div', { class: 'seg mn-year', role: 'group', 'aria-label': 'Year' },
    h('button', { type: 'button', id: 'mn-year-prev', 'aria-label': `Previous year (${Number(Y) - 1})`, disabled: Number(Y) <= lo, onclick: () => go(Number(Y) - 1, 'mn-year-prev') }, '‹'),
    h('span', { class: 'mn-year-now', 'aria-live': 'polite' }, Y),
    h('button', { type: 'button', id: 'mn-year-next', 'aria-label': `Next year (${Number(Y) + 1})`, disabled: Number(Y) >= hi, onclick: () => go(Number(Y) + 1, 'mn-year-next') }, '›')));

  const inY = iso => String(iso || '').startsWith(Y);
  const live = db.bookings.filter(b => b && b.status !== 'cancelled');
  const yearB = live.filter(b => inY(b.date));
  const done = yearB.filter(isDone), ahead = yearB.filter(isAhead);
  const invoices = db.bookings.map(b => ({ b, inv: docOf(b, 'invoice') })).filter(x => x.inv);
  const yearInv = invoices.filter(x => inY(invDate(x.b, x.inv)));
  const sentInv = yearInv.filter(x => x.inv.status === 'sent' || x.inv.status === 'paid');
  const earned = sumBy(done, bookingIncome, incomeCur).list(), booked = sumBy(ahead, bookingIncome, incomeCur).list();
  const invoiced = sumBy(sentInv, x => docTotals(x.inv).total, invCur).list();
  const paid = sumBy(invoices, x => paidInYear(x.inv, Y), invCur).list();
  // What is owed now, whatever year the invoice is from (the same invoices as the list below): last December's
  // unpaid invoice is still owed in January.
  const unpaid = sumBy(invoices.filter(x => x.inv.status === 'sent'), x => docTotals(x.inv).due, invCur).list();
  const overdueList = sumBy(invoices.filter(x => isOverdue(x.b)), x => docTotals(x.inv).due, invCur).list(), overdue = overdueList.some(e => e.amount > 0);
  const stat = (v, l, cls = '', id = '') => h('div', { class: 'stat ' + cls, id: id || null }, h('b', null, v), h('span', null, l));

  // Deposits still to come in: shows ahead with a deposit not yet received (every year: it is a to-do list).
  const deposits = live.filter(b => b.kind === 'show' && !isDone(b) && b.deal && num(b.deal.deposit) > 0 && !b.deal.depositPaid)
    .sort((a, b) => (a.deal.depositDue || a.date || '').localeCompare(b.deal.depositDue || b.date || ''));
  const gotDeposit = b => {
    update(d => { const x = d.bookings.find(r => r.id === b.id); if (!x) return; x.deal = { ...(x.deal || {}), depositPaid: true }; x.updatedAt = Date.now(); });
    markCheck(b.id, 'show-deposit', true);
    toast(`Deposit of ${fmtMoney(b.deal.deposit)} marked as received`);
  };
  // Unpaid invoices: overdue first, then the others by due date, then drafts not sent yet.
  const rank = x => (isOverdue(x.b) ? 0 : x.inv.status === 'sent' ? 1 : 2);
  const unpaidList = invoices.filter(x => (x.inv.status === 'sent' || x.inv.status === 'draft') && !isPaid(x.inv) && docTotals(x.inv).due > 0)
    .sort((a, b) => rank(a) - rank(b) || (a.inv.due || '9').localeCompare(b.inv.due || '9'));
  // The year's settled shows, latest first.
  const settled = yearB.filter(hasSettlement).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  // Income by month: earned (done or settled) and booked ahead (confirmed or advanced). The bars are in your currency;
  // a month's income in another one is named beside them.
  const own = mine(), isMine = b => sameCur(incomeCur(b), own), others = list => sumBy(list.filter(b => !isMine(b)), bookingIncome, incomeCur).others();
  const months = MONTHS.map((_, i) => {
    const m = `${Y}-${String(i + 1).padStart(2, '0')}`, e = done.filter(b => (b.date || '').startsWith(m)), a = ahead.filter(b => (b.date || '').startsWith(m));
    return { i, earned: sum(e.filter(isMine), bookingIncome), booked: sum(a.filter(isMine), bookingIncome), earnedElse: others(e), bookedElse: others(a) };
  });
  const top = Math.max(0, ...months.map(m => m.earned + m.booked));
  // Per act. A show's merch is income too (its costs, such as merch stock, are counted), so the act's profit agrees
  // with the settled shows and the payouts.
  const acts = new Map();
  for (const b of yearB) {
    const key = b.actId && actName(b.actId) ? b.actId : '';
    const a = acts.get(key) || { id: key, name: key ? actName(key) : 'No act', color: key ? (db.acts.find(x => x.id === key) || {}).color : '', kinds: {}, earned: sums(), merch: 0, booked: sums(), costs: 0 };
    a.kinds[b.kind] = (a.kinds[b.kind] || 0) + 1;
    // Merch and costs are in your currency; an invoice abroad adds to the act's earnings (and profit) in its own.
    if (isDone(b)) { a.earned.add(incomeCur(b), bookingIncome(b)); a.merch += b.kind === 'show' ? settle(b).merch : 0; a.costs += costsOf(b); } else if (isAhead(b)) a.booked.add(incomeCur(b), bookingIncome(b));
    acts.set(key, a);
  }
  const actRows = [...acts.values()].sort((a, b) => b.earned.mine - a.earned.mine || b.booked.mine - a.booked.mine || a.name.localeCompare(b.name));
  // Payouts per person from the year's settled shows.
  const payouts = new Map();
  for (const b of settled) for (const p of settle(b).payouts) { const cur = payouts.get(p.personId) || { amount: 0, shows: 0, open: 0 }; cur.amount += p.amount; cur.shows += 1; if (!isSettled(b)) cur.open += 1; payouts.set(p.personId, cur); }
  const payRows = [...payouts].map(([id, v]) => ({ id, name: (db.people.find(p => p.id === id) || {}).name || 'Someone removed', ...v })).sort((a, b) => b.amount - a.amount);

  const exportInvoices = async () => {
    if (!yearInv.length) return toast(`No invoices dated ${Y}.`);
    const rows = [['Number', 'Date', 'Due', 'Booking', 'Client', 'Status', 'Net', 'Tax', 'Total', 'Paid', 'Still due', 'Paid on', 'Currency']];
    for (const { b, inv } of yearInv.slice().sort((a, c) => String(a.inv.number).localeCompare(String(c.inv.number)))) {
      const t = docTotals(inv), paidOn = inv.paidAt ? new Date(inv.paidAt) : null, c = docCur(inv);
      rows.push([tx(inv.number), inv.issued || '', inv.due || '', tx(bookingTitle(b)), tx((b.contact && b.contact.name) || b.client || actName(b.actId) || ''), inv.status || '', money2(t.net), money2(t.tax), money2(t.total), money2(t.paid), money2(t.due), paidOn && !isNaN(paidOn) && inv.status === 'paid' ? `${paidOn.getFullYear()}-${String(paidOn.getMonth() + 1).padStart(2, '0')}-${String(paidOn.getDate()).padStart(2, '0')}` : '', tx(c.code || c.sym)]);
    }
    if (await saveFile('﻿' + csv(rows), `tourbook-invoices-${Y}.csv`, 'text/csv')) toast(`${plural(yearInv.length, 'invoice')} exported`);
  };
  const exportShows = async () => {
    const shows = yearB.filter(b => b.kind === 'show').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (!shows.length) return toast(`No shows in ${Y}.`);
    const rows = [['Date', 'Act', 'Venue', 'Status', 'Deal', 'Tickets', 'Ticket price', 'Gross', 'Fee', 'Merch', 'Costs', 'Profit', 'Received on the night', 'Settled', 'Fee currency']];
    for (const b of shows) {
      const s = settle(b), has = hasSettlement(b), c = has ? mine() : incomeCur(b); // a fee not settled yet may be an invoice's, abroad
      rows.push([b.date || '', tx(actName(b.actId) || b.client || ''), tx(venueOf(b).name), statusLabel(b.status), tx(dealSummary(b.deal)), has ? s.tickets : '', money2(s.price), has ? money2(s.gross) : '', money2(has ? s.fee : bookingIncome(b)), has ? money2(s.merch) : '', money2(s.costs), has ? money2(s.profit) : '', s.received == null ? '' : money2(s.received), isSettled(b) ? 'yes' : 'no', tx(c.code || c.sym)]);
    }
    if (await saveFile('﻿' + csv(rows), `tourbook-shows-${Y}.csv`, 'text/csv')) toast(`${plural(shows.length, 'show')} exported`);
  };

  const section = (cls, title, ...kids) => h('section', { class: 'mn-sec ' + cls, 'aria-label': title }, h('h3', null, title), ...kids);
  const settledShown = showAllSettled ? settled : settled.slice(0, 5);
  root.append(head,
    h('div', { class: 'mn-stats' },
      stat(sumsNode(earned), `${earnedWord()} in ${Y}`, '', 'mn-stat-earned'), stat(sumsNode(booked), 'booked ahead', '', 'mn-stat-booked'),
      stat(sumsNode(invoiced), 'invoiced', '', 'mn-stat-invoiced'), stat(sumsNode(paid), `paid in ${Y}`, '', 'mn-stat-paid'),
      stat(sumsNode(unpaid), 'unpaid', '', 'mn-stat-unpaid'), stat(sumsNode(overdueList), 'overdue', overdue ? 'bad' : '', 'mn-stat-overdue')),
    h('p', { class: 'small muted mn-note' }, ownEarned()
      ? `Earned counts the ${plural(done.length, 'booking')} done or settled in ${Y}; booked ahead, the ${ahead.length} confirmed still to come.`
      : `“${cap(earnedWord())}” counts the ${plural(done.length, 'booking')} done or settled in ${Y}, at their full fees before any commission; booked ahead, the ${ahead.length} confirmed still to come.`),

    h('div', { class: 'mn-grid' },
    deposits.length > 0 && section('mn-deposits', 'Deposits due', h('div', { class: 'list' }, ...deposits.map(b => {
      const late = b.deal.depositDue && b.deal.depositDue < todayISO();
      return h('div', { class: 'card mn-dep' }, h('div', { class: 'card-row' },
        h('button', { class: 'mn-link', type: 'button', 'data-fk': 'mn-dep-' + b.id, onclick: () => openBooking(b.id) }, h('strong', null, bookingTitle(b)), h('span', { class: 'muted small' }, [b.date && fmtShort(b.date), b.deal.depositDue && `deposit due ${dateText(b.deal.depositDue)}`].filter(Boolean).join(' · '))),
        h('div', { class: 'mn-amt' }, h('b', { class: late ? 'mn-late' : '' }, fmtMoney(b.deal.deposit)), late && h('span', { class: 'pill mn-over' }, 'Late'))),
        h('div', { class: 'actions' }, h('button', { class: 'btn ghost small', type: 'button', 'aria-label': `Deposit received for ${bookingTitle(b)}`, onclick: () => gotDeposit(b) }, '✓ Received')));
    }))),

    section('mn-unpaid', 'Unpaid invoices', unpaidList.length ? h('div', { class: 'list' }, ...unpaidList.map(({ b, inv }) => {
      const t = docTotals(inv), over = isOverdue(b), money = n => docMoney(n, inv); // in its own currency, with its code where '$' could be yours
      return tap(b, h('div', { class: 'card-row' },
        h('div', null, h('strong', null, `${inv.number} · ${bookingTitle(b)}`), h('div', { class: 'muted small' }, [inv.status === 'draft' ? 'not sent yet' : inv.due ? `due ${dateText(inv.due)}` : 'no due date', t.paid > 0 && `${money(t.paid)} paid`].filter(Boolean).join(' · '))),
        h('div', { class: 'mn-amt' }, h('b', { class: over ? 'mn-late' : '' }, money(t.due)), h('span', { class: 'pill ' + (over ? 'mn-over' : inv.status === 'draft' ? 'st-hold' : 'st-offer') }, over ? 'Overdue' : inv.status === 'draft' ? 'Draft' : 'Sent'))));
    })) : h('p', { class: 'muted small' }, invoices.length ? 'Nothing owed to you. Every invoice is paid.' : 'No invoices yet. Open a show or a session and make one in its Quote & invoice box.')),

    section('mn-months', `Income by month, ${Y}`,
      top > 0 || months.some(m => m.earnedElse.length || m.bookedElse.length) ? [
        h('div', { class: 'mn-legend', 'aria-hidden': 'true' }, h('span', null, h('i', { class: 'mn-key earned' }), cap(earnedWord())), h('span', null, h('i', { class: 'mn-key booked' }), 'Booked ahead')),
        h('ol', { class: 'mn-bars' }, ...months.map(m => h('li', { class: 'mn-bar-row' },
          h('span', { class: 'mn-bar-m', 'aria-hidden': 'true' }, monthShort(m.i)),
          h('span', { class: 'mn-track', 'aria-hidden': 'true' },
            m.earned > 0 && h('i', { class: 'mn-seg earned', style: `width:${(m.earned / top * 100).toFixed(2)}%` }),
            m.booked > 0 && h('i', { class: 'mn-seg booked', style: `width:${(m.booked / top * 100).toFixed(2)}%` })),
          h('span', { class: 'mn-bar-v' }, h('span', { class: 'sr-only' }, `${monthLong(m.i)}: `), m.earned || m.booked ? fmtMoney(m.earned) : m.earnedElse.length || m.bookedElse.length ? '' : '—', m.booked > 0 && h('small', { class: 'muted' }, `+ ${fmtMoney(m.booked)} ahead`),
            // Each other currency on a line of its own, with its code.
            [...m.earnedElse.map(e => [sumText(e), '']), ...m.bookedElse.map(e => [`${sumText(e)} ahead`, ' muted'])].map(([t, c], n) => h('small', { class: 'mn-bar-else' + c }, `${m.earned || m.booked || n ? '+ ' : ''}${t}`)))))),
      ] : h('p', { class: 'muted small' }, `Nothing earned or booked in ${Y} yet.`)),

    section('mn-settled', 'Settlements', settled.length ? [h('div', { class: 'list' }, ...settledShown.map(b => {
      const s = settle(b);
      return tap(b, h('div', { class: 'card-row' },
        h('div', null, h('strong', null, bookingTitle(b)), !isSettled(b) && h('span', { class: 'pill mn-unsettled' }, 'not marked settled'), h('div', { class: 'muted small' }, [b.date && fmtShort(b.date), `fee ${fmtMoney(s.fee)}`, s.merch > 0 && `merch ${fmtMoney(s.merch)}`, `costs ${fmtMoney(s.costs)}`, !isSettled(b) && s.short > 0 && `${fmtMoney(s.short)} still owed`].filter(Boolean).join(' · '))),
        h('div', { class: 'mn-amt' }, h('b', { class: s.profit < 0 ? 'mn-late' : '' }, fmtMoney(s.profit)), h('span', { class: 'muted small' }, 'profit'))));
    })), settled.length > 5 && h('button', { class: 'btn ghost small', type: 'button', id: 'mn-settled-more', onclick: () => { showAllSettled = !showAllSettled; root.replaceChildren(); render(root); root.querySelector('#mn-settled-more')?.focus(); } }, showAllSettled ? 'Show fewer' : `Show all ${settled.length}`)]
      : h('p', { class: 'muted small' }, `No shows settled in ${Y} yet. Settle a show on the night in its Settlement box.`)),

    section('mn-acts', 'By act', actRows.length ? h('div', { class: 'list' }, ...actRows.map(a => {
      // Profit in your currency (merch and costs are in it), and the act's earnings in any other alongside.
      const profit = a.earned.others().reduce((t, e) => t.add(e, e.amount), sums().add(own, r2(a.earned.mine + a.merch - a.costs))).list(), ahead = a.booked.list();
      return h('div', { class: 'card mn-act' }, h('div', { class: 'card-row' },
        h('div', null, h('strong', null, a.color && h('i', { class: 'mn-dot', style: `background:${/^#[0-9a-f]{3,8}$/i.test(a.color) ? a.color : 'transparent'}`, 'aria-hidden': 'true' }), a.name),
          h('div', { class: 'muted small' }, Object.entries(a.kinds).map(([k, n]) => `${n} ${kindLabel(k).toLowerCase()}${n === 1 ? '' : 's'}`).join(' · '))),
        h('div', { class: 'mn-amt' }, h('b', null, sumsNode(a.earned.list())), h('span', { class: 'muted small' }, actEarned(a)))),
        h('div', { class: 'muted small mn-act-sub' }, [a.merch > 0 && `merch ${fmtMoney(a.merch)}`, `costs ${fmtMoney(a.costs)}`, `profit ${sumsText(profit)}`, ahead.some(e => e.amount > 0) && `${sumsText(ahead)} booked ahead`].filter(Boolean).join(' · ')));
    }))
      : h('p', { class: 'muted small' }, `No bookings in ${Y}.`)),

    section('mn-payouts', 'Payouts per person', payRows.length ? [h('div', { class: 'card mn-pay-card' }, ...payRows.map(p => h('div', { class: 'card-row mn-payout' }, h('div', null, h('strong', null, p.name), h('div', { class: 'muted small' }, `from ${plural(p.shows, 'show')}` + (p.open ? ` · ${p.open === p.shows ? (p.shows === 1 ? 'not' : 'none') : p.open + ' not'} marked settled yet` : ''))), h('b', null, fmtMoney(r2(p.amount)))))),
      h('p', { class: 'small muted' }, 'Each show’s profit, shared between the people on it by their shares (set in the show’s settlement). A show not marked settled yet is counted as it stands.')]
      : h('p', { class: 'muted small' }, `No payouts in ${Y}: they come from settled shows with people on them.`)),

    section('mn-export', 'For the accountant', h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', type: 'button', id: 'mn-csv-invoices', onclick: exportInvoices }, `⬇ Invoices ${Y} (CSV)`),
      h('button', { class: 'btn ghost', type: 'button', id: 'mn-csv-shows', onclick: exportShows }, `⬇ Shows and settlements ${Y} (CSV)`)),
      h('p', { class: 'small muted' }, 'Spreadsheets that open in Excel, Numbers or Google Sheets.'))));
}

export const money = {
  id: 'money', label: 'Money', icon: '💰',
  render,
  tutorial: () => [
    { title: 'Money', text: `Your year in money: ${whatEarned()}, what is owed, deposits due, settled shows and each person’s share. It fills in as you add bookings, settle shows and send invoices.`, target: ['#page .page-head'] },
    { title: 'Your year', text: `${cap(whatEarned())} from bookings done or settled${ownEarned() ? '' : ' (their fees, before any commission)'}, what is booked ahead, what you invoiced, what came in, and what is still owed.`, target: ['.mn-stats'] },
    { title: 'Pick a year', text: 'Step back through earlier years, or ahead to bookings next year.', target: ['.mn-year'] },
    { title: 'Deposits due', text: 'Shows with a deposit not in yet. Tap Received when it lands.', target: ['.mn-deposits'] },
    { title: 'Unpaid invoices', text: 'Overdue first. Tap one to open the booking, then send a reminder or record the payment.', target: ['.mn-unpaid'] },
    { title: 'By month', text: `Each month’s income: ${ownEarned() ? 'earned' : whatEarned()} in the solid bar, booked ahead in the lighter one.`, target: ['.mn-months'] },
    { title: 'Shows, acts and players', text: 'What each settled show made, the totals per act, and what each person was paid out.', target: ['.mn-settled', '.mn-acts'] },
    { title: 'For the accountant', text: 'Your invoices and shows as spreadsheets.', target: ['.mn-export'] },
  ],
};
