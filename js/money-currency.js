// The currency, chosen by country: every country with its currency (ISO 4217), the symbol and the names from the
// browser's own Intl data (offline, no library). Picking a country sets the person's currency in one go, in one record
// (db.profile), so a merge of two devices keeps them together: the symbol every amount shows (profile.currency), the
// code payment links and the bank QR use (profile.currencyCode), and the country picked (profile.currencyCountry), so
// the chooser shows it again. A quote or an invoice carries its own (doc.currency, doc.code, doc.country) from the same
// list, for work abroad; one from before has none and is in yours. What was stored before keeps working and reads as it
// did ('$' with no code, 'kr' with SEK from the old "Currency for payment links", db.billing.currencyCode, a symbol typed
// by hand): the chooser shows it as it is ("Other — A$ AUD") until a country is picked. Sums of documents are kept per
// currency.
import { h } from './util.js';
import { db, update } from './store.js';
import { fmtMoney } from './model.js';
import { knownCode } from './money-pay.js';

// Every country and territory people live in, by its currency: 'CODE CC CC…|…' (2026: Croatia and Bulgaria in euros,
// Curaçao and Sint Maarten in Caribbean guilders, Zimbabwe in ZiG). Uninhabited ones (Antarctica, Bouvet…) are left out.
const TABLE = 'AED AE|AFN AF|ALL AL|AMD AM|AOA AO|ARS AR|AUD AU CC CX KI NF NR TV|AWG AW|AZN AZ|BAM BA|BBD BB|BDT BD|BHD BH|BIF BI|BMD BM|BND BN|BOB BO|BRL BR|BSD BS|BTN BT|BWP BW|BYN BY|BZD BZ|CAD CA|CDF CD|CHF CH LI|CLP CL|CNY CN|COP CO|CRC CR|CUP CU|CVE CV|CZK CZ|DJF DJ|DKK DK FO GL|DOP DO|DZD DZ|EGP EG|ERN ER|ETB ET|EUR AD AT AX BE BG BL CY DE EE ES FI FR GF GP GR HR IE IT LT LU LV MC ME MF MQ MT NL PM PT RE SI SK SM VA XK YT|FJD FJ|FKP FK|GBP GB GG IM JE|GEL GE|GHS GH|GIP GI|GMD GM|GNF GN|GTQ GT|GYD GY|HKD HK|HNL HN|HTG HT|HUF HU|IDR ID|ILS IL PS|INR IN|IQD IQ|IRR IR|ISK IS|JMD JM|JOD JO|JPY JP|KES KE|KGS KG|KHR KH|KMF KM|KPW KP|KRW KR|KWD KW|KYD KY|KZT KZ|LAK LA|LBP LB|LKR LK|LRD LR|LSL LS|LYD LY|MAD MA EH|MDL MD|MGA MG|MKD MK|MMK MM|MNT MN|MOP MO|MRU MR|MUR MU|MVR MV|MWK MW|MXN MX|MYR MY|MZN MZ|NAD NA|NGN NG|NIO NI|NOK NO SJ|NPR NP|NZD NZ CK NU PN TK|OMR OM|PAB PA|PEN PE|PGK PG|PHP PH|PKR PK|PLN PL|PYG PY|QAR QA|RON RO|RSD RS|RUB RU|RWF RW|SAR SA|SBD SB|SCR SC|SDG SD|SEK SE|SGD SG|SHP SH|SLE SL|SOS SO|SRD SR|SSP SS|STN ST|SYP SY|SZL SZ|THB TH|TJS TJ|TMT TM|TND TN|TOP TO|TRY TR|TTD TT|TWD TW|TZS TZ|UAH UA|UGX UG|USD US AS BQ EC FM GU IO MH MP PR PW SV TC TL VG VI|UYU UY|UZS UZ|VES VE|VND VN|VUV VU|WST WS|XAF CF CG CM GA GQ TD|XCD AG AI DM GD KN LC MS VC|XCG CW SX|XOF BF BJ CI GW ML NE SN TG|XPF NC PF WF|YER YE|ZAR ZA|ZMW ZM|ZWG ZW';
// Country (ISO 3166 alpha-2) → currency code.
export const COUNTRY_CURRENCY = Object.freeze(Object.fromEntries(TABLE.split('|').flatMap(g => { const [code, ...ccs] = g.split(' '); return ccs.map(cc => [cc, code]); })));
const CODES = new Set(Object.values(COUNTRY_CURRENCY));
const ISO = /^[A-Z]{3}$/;
const isCode = c => typeof c === 'string' && ISO.test(c);

// A currency's symbol as amounts show it: the narrow symbol ('€', '£', 'kr', '$' for every dollar), the same on every
// device (always read in English, so a symbol picked on one device matches the list on another); the code where Intl
// has no symbol for it, or one longer than a document keeps (6 characters).
const symbols = new Map();
export function symbolFor(code) {
  if (!isCode(code)) return '';
  if (!symbols.has(code)) {
    let s = '';
    for (const currencyDisplay of ['narrowSymbol', 'symbol']) {
      try { s = (new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay }).formatToParts(0).find(p => p.type === 'currency') || {}).value || ''; } catch { s = ''; }
      if (s) break;
    }
    s = s.trim();
    symbols.set(code, s && s.length <= 6 ? s : code);
  }
  return symbols.get(code);
}
// The code a stored symbol stands for ('£' → 'GBP', 'kr' → 'SEK', an ISO code typed as the symbol), or '' when it is not known.
export const codeOf = sym => { const k = knownCode(sym); if (k) return k; const u = String(sym ?? '').trim().toUpperCase(); return CODES.has(u) ? u : ''; };

// Names in the device's language, with English and then the code to fall back on.
const langs = () => { try { return [...(navigator.languages || []), navigator.language, 'en'].filter(Boolean); } catch { return ['en']; } };
const namers = new Map();
function nameOf(type, code) {
  const key = type + '|' + langs()[0];
  if (!namers.has(key)) { let dn = null; try { dn = new Intl.DisplayNames(langs(), { type, fallback: 'code' }); } catch { dn = null; } namers.set(key, dn); }
  const dn = namers.get(key);
  try { return (dn && dn.of(code)) || code; } catch { return code; }
}
export const countryName = cc => nameOf('region', cc);
export const currencyName = code => nameOf('currency', code);
const money = (sym, code) => (sym && sym !== code ? `${sym} ${code}` : code);
// "United Kingdom — £ GBP", "Switzerland — CHF".
export const countryLabel = cc => { const code = COUNTRY_CURRENCY[cc]; return code ? `${countryName(cc)} — ${money(symbolFor(code), code)}` : ''; };

// Every country, sorted by its name in the device's language: [{ cc, label }].
let listCache = null;
export function countries() {
  const lang = langs()[0];
  if (listCache && listCache.lang === lang) return listCache.list;
  let coll; try { coll = new Intl.Collator(langs()); } catch { coll = { compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0) }; }
  const list = Object.keys(COUNTRY_CURRENCY).map(cc => ({ cc, name: countryName(cc), label: countryLabel(cc) })).sort((a, b) => coll.compare(a.name, b.name));
  listCache = { lang, list };
  return list;
}

// The device's own country, from its language (en-GB → GB; a language alone, such as de, to its likely country), or ''.
let region = null;
export function deviceRegion() {
  const tags = langs().slice(0, -1), key = tags.join(',');
  if (region && region.key === key) return region.cc;
  const loc = t => { try { return new Intl.Locale(t); } catch { return null; } };
  let cc = '';
  for (const t of tags) { const r = loc(t)?.region; if (r && COUNTRY_CURRENCY[r]) { cc = r; break; } }
  if (!cc) for (const t of tags) { try { const r = loc(t)?.maximize().region; if (r && COUNTRY_CURRENCY[r]) { cc = r; break; } } catch { /* no likely region */ } }
  region = { key, cc };
  return cc;
}

/* ------------------------------- yours, and a document's ------------------------------- */
// The code for a symbol stored with no code: 'kr' is the device's own (NOK on NO, DKK on DK, ISK on IS), else what it
// always was (SEK); '$' stays USD, so a new device is $ / USD wherever it is.
const guessCode = sym => {
  const k = codeOf(sym), dc = COUNTRY_CURRENCY[deviceRegion()];
  return k && k !== 'USD' && dc && dc !== k && symbolFor(k) === sym && symbolFor(dc) === sym ? dc : k;
};
// A currency: { sym, code, country }. code is '' when the symbol was typed by hand and is not known; country '' when
// none was picked. Yours is the profile's, all three from the one record; a profile from before has only the symbol,
// with the code from the old "Currency for payment links" (db.billing.currencyCode) or else the one the symbol stands for.
export function mine() {
  const p = db.profile && typeof db.profile === 'object' ? db.profile : {}, sym = p.currency || '$';
  if (isCode(p.currencyCode)) return { sym, code: p.currencyCode, country: typeof p.currencyCountry === 'string' ? p.currencyCountry : '' };
  const bl = db.billing && typeof db.billing === 'object' ? db.billing : {};
  return { sym, code: isCode(bl.currencyCode) ? bl.currencyCode : guessCode(sym), country: '' };
}
// A quote's or an invoice's currency: its own, else (a document from before currencies were per document) yours.
export function docCur(doc) {
  if (!doc || typeof doc.currency !== 'string' || !doc.currency.trim()) return mine();
  return { sym: doc.currency, code: isCode(doc.code) ? doc.code : guessCode(doc.currency), country: typeof doc.country === 'string' ? doc.country : '' };
}
// What tells two currencies apart: the code, else (a symbol typed by hand) the symbol.
export const curKey = c => (c && c.code) || 'sym:' + ((c && c.sym) || '$');
export const sameCur = (a, b) => curKey(a) === curKey(b);
// The fields a document stores for a currency.
export const docFields = c => ({ currency: c.sym, code: c.code || '', country: c.country || '' });
// The currency a country picks.
export const choiceFor = cc => { const code = COUNTRY_CURRENCY[cc]; return code ? { sym: symbolFor(code), code, country: cc } : null; };

// The country a currency is shown as in the chooser, or '' when no country fits it as it is (a symbol of its own, or
// the euro with no country picked and none to prefer): its own country, then those preferred, then the device's, then
// the one the code is named after (USD → US), then the only one that uses it.
export function countryOf(c, prefer = []) {
  if (!c || !c.code || symbolFor(c.code) !== c.sym) return '';
  const fits = cc => !!cc && COUNTRY_CURRENCY[cc] === c.code;
  for (const cc of [c.country, ...prefer, deviceRegion(), c.code.slice(0, 2)]) if (fits(cc)) return cc;
  const all = Object.keys(COUNTRY_CURRENCY).filter(fits);
  return all.length === 1 ? all[0] : '';
}
// How a currency reads in words: its country's line, else "Euro — € EUR", else "Other — A$ AUD" / "Other — Fr.".
export function curLabel(c, prefer = []) {
  const cc = countryOf(c, prefer);
  if (cc) return countryLabel(cc);
  if (c.code && symbolFor(c.code) === c.sym) return `${currencyName(c.code)} — ${money(c.sym, c.code)}`;
  return `Other — ${c.code ? money(c.sym, c.code) : c.sym}`;
}

// The chooser: a <select> of every country, with the suggested ones (yours, the device's country) first, and the
// currency as it is now when no country fits it. Its value is a country, or 'keep'. Drawn into sel (so a form's own
// select can be filled), or a new one.
export function currencySelect(c, { sel = null, id, prefer = [], suggest = [], onchange } = {}) {
  const el = sel || h('select', { id, class: 'mn-currency' });
  if (sel) el.classList.add('mn-currency');
  const now = countryOf(c, prefer), list = countries();
  const opt = (v, l) => h('option', { value: v }, l);
  const tips = [...new Set([...suggest, deviceRegion()])].filter(cc => COUNTRY_CURRENCY[cc]);
  el.replaceChildren(...[
    !now && opt('keep', curLabel(c, prefer)),
    ...(tips.length ? [h('optgroup', { label: 'Suggested' }, tips.map(cc => opt(cc, countryLabel(cc)))), h('optgroup', { label: 'Every country' }, list.map(x => opt(x.cc, x.label)))] : list.map(x => opt(x.cc, x.label))),
  ].filter(Boolean));
  el.value = now || 'keep';
  el.dataset.start = el.value;
  if (onchange) el.addEventListener('change', () => onchange(picked(el), el));
  return el;
}
// The currency picked in a chooser, or null when it was left as it was.
export const picked = sel => (sel && sel.value !== sel.dataset.start && sel.value !== 'keep' ? choiceFor(sel.value) : null);

// Sets your currency inside an update: the symbol, the code and the country, together in the profile. The billing
// settings (numbering, tax, payment details) are left alone: a currency picked on a new device never makes its empty
// billing the newer copy in a merge with Google Drive or a backup, and the profile's merge already lets one filled in
// beat one that holds only a currency.
export function applyMine(d, c) {
  d.profile = { ...d.profile, currency: c.sym, currencyCode: c.code || '', currencyCountry: c.country || '', updatedAt: Date.now() };
}
export const setMine = c => !!c && update(d => applyMine(d, c));
// Your chooser, for Settings → Quotes & invoices: it saves as soon as a country is picked (and goes back to what is
// stored when the licence keeps the role read-only).
export const myCurrencySelect = id => currencySelect(mine(), { id, onchange: (c, el) => { if (c && !setMine(c)) el.value = el.dataset.start; } });

// A currency whose symbol alone could be another one ('$' for US, Canadian or Australian dollars, 'kr', '¥'), or is not
// its own (an older 'A$' for AUD): it needs its code beside an amount when it is not yours.
let shared = null;
export function symShared(c) {
  if (!c || !c.code || c.sym === c.code) return false;
  if (!shared) { shared = new Map(); for (const code of CODES) { const s = symbolFor(code); shared.set(s, (shared.get(s) || 0) + 1); } }
  return (shared.get(c.sym) || 0) > 1 || symbolFor(c.code) !== c.sym;
}
// A document's code is shown by its total when it is not in your currency and its symbol is shared: a client abroad
// reads "Total (CAD)".
export const codeNeeded = doc => { const c = docCur(doc); return !sameCur(c, mine()) && symShared(c); };
// An amount on a document as a list shows it: in its currency, with its code when codeNeeded ("$400 USD" for someone in
// Canadian dollars).
export const docMoney = (n, doc) => { const c = docCur(doc); return fmtMoney(n, c.sym) + (codeNeeded(doc) ? ' ' + c.code : ''); };

/* ------------------------------- sums per currency ------------------------------- */
// Amounts in different currencies are never added together: sums().add(cur, n) keeps one total per currency, and
// list() gives them yours first, then the largest: [{ sym, code, amount }].
export function sums() {
  const m = new Map(), own = mine(), ownKey = curKey(own);
  const api = {
    add(c, n) {
      const v = Number(n); if (!Number.isFinite(v)) return api;
      const k = curKey(c), e = m.get(k) || { sym: k === ownKey ? own.sym : c.sym, code: c.code || '', amount: 0 };
      e.amount = Math.round((e.amount + v) * 100) / 100; m.set(k, e); return api;
    },
    // Only the currencies with something in them; yours at nothing when none has.
    list() {
      const all = [...m.entries()].filter(([, e]) => Math.abs(e.amount) > 0.005).sort(([ka, a], [kb, b]) => (kb === ownKey) - (ka === ownKey) || b.amount - a.amount).map(([, e]) => e);
      return all.length ? all : [{ sym: own.sym, code: own.code, amount: 0 }];
    },
    get mine() { return (m.get(ownKey) || { amount: 0 }).amount; },
    others() { return api.list().filter(e => curKey(e) !== ownKey); },
  };
  return api;
}
// One sum as text: "£1,200"; several, each with its code: "£1,200 GBP + €800 EUR". One alone in a currency not yours
// whose symbol is shared keeps its code too ("$400 USD" for someone in Canadian dollars).
export const sumText = e => fmtMoney(e.amount, e.sym) + (e.code && e.code !== e.sym ? ' ' + e.code : '');
export const sumsText = (list, sep = ' + ') => (list.length === 1 && (sameCur(list[0], mine()) || !symShared(list[0])) ? fmtMoney(list[0].amount, list[0].sym) : list.map(sumText).join(sep));
