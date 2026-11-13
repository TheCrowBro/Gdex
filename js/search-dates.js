// The search's dates (js/search.js): a day or a span of days read out of what was typed, and the words left over.
// readDate(words, today, order) is pure: "today" and the order the device writes a day and a month are given to it, so
// its checks can move the clock and the order. It reads, in English, short or long:
//   a day    "20 nov", "nov 20", "20th of november", "fri 20 nov", "20 nov 2025", "20/11" and "11/20" (in the device's
//            order: "20/11" in a language that writes the day first; the other order when the first is no date),
//            "20/11/2025", "2026-11-20", "friday" (the coming one: today on a Friday), "next friday" (after today),
//            "last friday" (before today), "today", "tonight", "tomorrow", "yesterday";
//   a span   "nov", "november" (the nearest November: this year's, or next year's or last year's when that is nearer),
//            "november 2025", "2026-11", "2025", "this week", "next week", "last week" (weeks start on Monday, as the
//            calendar's do), "this month", "next month", "last month", "this year", "next year", "last year".
// A day with no year is the nearest one: "20 jan" typed in November is next January's.
// The words are those the search compares (folded: no capitals, no accents, no punctuation around them). The first
// date found wins; any other word is left for the search to look for.
const MONTH = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
const WEEKDAY = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4,
  thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (y, m, d) => new Date(y, m, d);
const real = (y, m, d) => { const x = at(y, m, d); return x.getFullYear() === y && x.getMonth() === m && x.getDate() === d ? x : null; };
const plus = (d, n) => at(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysApart = (a, b) => Math.round((at(a.getFullYear(), a.getMonth(), a.getDate()) - at(b.getFullYear(), b.getMonth(), b.getDate())) / 864e5);
// A span is kept as two dates while it is worked out, and given out as two 'YYYY-MM-DD'.
const span = (from, to) => ({ from, to });
const dayOf = d => span(d, d);
const monthOf = (y, m) => span(at(y, m, 1), at(y, m + 1, 0));
const out = s => ({ from: iso(s.from), to: iso(s.to) });
// The nearest of last year's, this year's and next year's: the one closest to today (the coming one on a tie).
function nearest(make, today) {
  const y = today.getFullYear();
  let best = null, gap = Infinity;
  for (const year of [y + 1, y, y - 1]) {
    const s = make(year);
    if (!s) continue;
    const g = s.to < today ? daysApart(today, s.to) : s.from > today ? daysApart(s.from, today) : 0;
    if (g < gap) { gap = g; best = s; }
  }
  return best;
}
const dayNum = w => { const m = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(w || ''); const n = m ? Number(m[1]) : 0; return n >= 1 && n <= 31 ? n : 0; };
const yearNum = w => (/^(19|20)\d\d$/.test(w || '') ? Number(w) : 0);
const monthNum = w => (Object.prototype.hasOwnProperty.call(MONTH, w || '') ? MONTH[w] : -1);
const weekdayNum = w => (Object.prototype.hasOwnProperty.call(WEEKDAY, w || '') ? WEEKDAY[w] : -1);
const mondayOf = d => plus(d, -((d.getDay() + 6) % 7));
// A day and a month, with the year typed or the nearest.
const dayMonth = (d, m, y, today) => (y ? (real(y, m, d) ? dayOf(real(y, m, d)) : null) : nearest(year => (real(year, m, d) ? dayOf(real(year, m, d)) : null), today));

// The order the device's language writes a day and a month in numbers: 'dm' (20/11) or 'md' (11/20).
export function dateOrder(locale) {
  try {
    const parts = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' }).formatToParts(at(2001, 10, 22)).map(p => p.type);
    return parts.indexOf('day') < parts.indexOf('month') ? 'dm' : 'md';
  } catch { return 'dm'; }
}

// One date phrase starting at words[i]: { from, to, len } (len: how many words it took), or null.
function phraseAt(words, i, today, order) {
  const w = words[i], next = words[i + 1], third = words[i + 2];
  // today, tonight, tomorrow, yesterday
  if (w === 'today' || w === 'tonight') return { ...dayOf(today), len: 1 };
  if (w === 'tomorrow') return { ...dayOf(plus(today, 1)), len: 1 };
  if (w === 'yesterday') return { ...dayOf(plus(today, -1)), len: 1 };
  // this, next or last week, month, year or weekday
  if (w === 'this' || w === 'next' || w === 'last') {
    const k = w === 'next' ? 1 : w === 'last' ? -1 : 0;
    if (next === 'week') { const mon = plus(mondayOf(today), 7 * k); return { ...span(mon, plus(mon, 6)), len: 2 }; }
    if (next === 'month') return { ...monthOf(today.getFullYear(), today.getMonth() + k), len: 2 };
    if (next === 'year') { const y = today.getFullYear() + k; return { ...span(at(y, 0, 1), at(y, 11, 31)), len: 2 }; }
    const wd = weekdayNum(next);
    if (wd >= 0) {
      const ahead = (wd - today.getDay() + 7) % 7;
      const d = k > 0 ? plus(today, ahead || 7) : k < 0 ? plus(today, -(((today.getDay() - wd + 7) % 7) || 7)) : plus(today, ahead);
      return { ...dayOf(d), len: 2 };
    }
    return null;
  }
  // "fri 20 nov": a weekday before a day is only words
  const wd = weekdayNum(w);
  if (wd >= 0) {
    const after = phraseAt(words, i + 1, today, order);
    if (after && +after.from === +after.to && (/^\d/.test(next || '') || monthNum(next) >= 0)) return { ...after, len: after.len + 1 };
    return { ...dayOf(plus(today, (wd - today.getDay() + 7) % 7)), len: 1 };
  }
  // "20 nov", "20th of november", "20 nov 2025"
  const d = dayNum(w);
  if (d) {
    const of = next === 'of' ? 1 : 0, m = monthNum(words[i + 1 + of]);
    if (m >= 0) { const y = yearNum(words[i + 2 + of]); const s = dayMonth(d, m, y, today); if (s) return { ...s, len: 2 + of + (y ? 1 : 0) }; }
    return null;
  }
  // "nov 20", "nov 20 2025", "november 2025", "nov"
  const m = monthNum(w);
  if (m >= 0) {
    const dn = dayNum(next);
    if (dn) { const y = yearNum(third); const s = dayMonth(dn, m, y, today); return s ? { ...s, len: 2 + (y ? 1 : 0) } : null; } // "feb 30" is no date
    const y = yearNum(next);
    if (y) return { ...monthOf(y, m), len: 2 };
    return { ...nearest(year => monthOf(year, m), today), len: 1 };
  }
  // "2026-11-20", "2026-11", "2026/11/20"
  let x = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/.exec(w || '');
  if (x) {
    const y = Number(x[1]), mo = Number(x[2]) - 1;
    if (x[3] == null) return mo >= 0 && mo < 12 ? { ...monthOf(y, mo), len: 1 } : null;
    const day = real(y, mo, Number(x[3]));
    return day ? { ...dayOf(day), len: 1 } : null;
  }
  // "20/11", "11/20", "20/11/2025", "20.11.25": in the device's order, else the other way round
  x = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{4}|\d{2}))?$/.exec(w || '');
  if (x) {
    const a = Number(x[1]), b = Number(x[2]), y = x[3] == null ? 0 : x[3].length === 2 ? 2000 + Number(x[3]) : Number(x[3]);
    const reads = order === 'md' ? [[b, a], [a, b]] : [[a, b], [b, a]];
    for (const [day, mon] of reads) { if (mon >= 1 && mon <= 12 && day >= 1) { const s = dayMonth(day, mon - 1, y, today); if (s) return { ...s, len: 1 }; } }
    return null;
  }
  // "2025": the whole year
  const y = yearNum(w);
  if (y) return { ...span(at(y, 0, 1), at(y, 11, 31)), len: 1 };
  return null;
}

// The first date in the words: { from, to, start, len, words: the date's own words } and the words left (rest), or
// date null and every word left.
export function readDate(words, today = new Date(), order = dateOrder()) {
  const list = (Array.isArray(words) ? words : []).map(w => String(w || '')).filter(Boolean);
  const now = at(today.getFullYear(), today.getMonth(), today.getDate());
  for (let i = 0; i < list.length; i++) {
    const p = phraseAt(list, i, now, order);
    if (p) return { date: { ...out(p), start: i, len: p.len, words: list.slice(i, i + p.len) }, rest: [...list.slice(0, i), ...list.slice(i + p.len)] };
  }
  return { date: null, rest: list };
}
