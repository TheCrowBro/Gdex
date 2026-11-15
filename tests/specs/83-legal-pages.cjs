// Tourbook's terms of service and privacy policy (the build spec §10, §6.3; the terms rewritten for Tourbook, decisions
// §20), read as text and opened in Chromium: each has its own policy and no script, is dated and links the other and
// Tourbook; the terms are dated as js/terms.js's TERMS_VERSION, run from section 1 to 20, and every section they name by
// number is the one meant, and their contents list names each section by its heading and id; they carry the licence section (the price equal to js/tax.js, the free Audiophile, every
// working role by its label from js/roles.js), the Audiophile for personal use, not for work (the short version, section
// 3 with its edge cases, section 12 and the one-time sheet's first line, both copies), what Tourbook is not in the music world (an agent, a party, a publisher, a
// recorder), the protections of the legal part with their numbers, and the liability section; the one-time sheet's points
// (js/terms.js) are the short version's, word for word; the privacy policy names every service Tourbook may contact;
// neither names an app store or a storage service Tourbook does not use, nor Vdex. Both pages read on a phone, light and
// dark, with large text, and log no error. Last, Vdex leftovers anywhere people can see them: the licence server, the
// generator, the desktop app's files, the download page and the web app's licence and Drive modules, outside comments,
// with each allowed line named here by its text.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const REPO = path.resolve(__dirname, '../..');
const BASE = process.env.TOURBOOK_URL || '';
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const text = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
// The contact address the owner published, copied unchanged (the build spec §0 rule 7): the one place either page may
// hold a word the checks below refuse, were there one in it.
const contacts = html => [...html.matchAll(/<a href="mailto:([^"]+)">/g)].map(m => m[1]);
const STORES = /App Store|Google Play|iCloud|Dropbox|OneDrive/;
const exists0 = f => fs.existsSync(path.join(REPO, f));

(async () => {
  let browser;
  try {
    const { PRICE } = await import(pathToFileURL(path.join(REPO, 'js/tax.js')).href);
    const roles = await import(pathToFileURL(path.join(REPO, 'js/roles.js')).href);
    const paid = [...roles.ROLES.filter(r => roles.roleNeedsLicence(r.id)).map(r => r.label), roles.EVERYTHING.label];
    const free = roles.ROLES.find(r => r.id === roles.FREE_ROLE).label;
    const pages = { terms: read('terms.html'), privacy: read('privacy.html') };

    /* ---------------------------- both pages ---------------------------- */
    for (const [name, html] of Object.entries(pages)) {
      const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
      ok(`${name}.html has its own policy, which allows no script, and holds none`, /default-src 'none'/.test(csp) && !/script-src/.test(csp) && /base-uri 'none'/.test(csp) && /form-action 'none'/.test(csp) && !/<script/i.test(html) && !/\son[a-z]+=/i.test(html) && !/javascript:/i.test(html), csp);
      ok(`${name}.html has Tourbook's look (styles.css) and is dated`, /<link rel="stylesheet" href="styles\.css">/.test(html) && /Last updated \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\./.test(html));
      const t = text(html);
      const vdex = t.replace(new RegExp(contacts(html).map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '$^', 'g'), '');
      ok(`${name}.html names no app store and no storage service Tourbook does not use, and no Vdex (but in a contact address copied unchanged)`, !STORES.test(t) && !/Vdex|vdex/.test(vdex) && !/Android|iPhone|iPad/.test(t), (t.match(STORES) || vdex.match(/Vdex|vdex|Android|iPhone|iPad/) || [''])[0]);
      ok(`${name}.html links Tourbook and its contact address`, /href="index\.html"/.test(html) && contacts(html).length > 0);
    }
    ok('each links the other', /href="privacy\.html"/.test(pages.terms) && /href="terms\.html"/.test(pages.privacy));
    // The terms' date is the version a device agrees to (js/terms.js TERMS_VERSION, its day): a new date asks every working
    // role again. The privacy policy changes with the terms or before them, so it is never dated after them.
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dated = html => { const m = html.match(/Last updated (\d{1,2}) ([A-Z][a-z]+) (20\d\d)\./); return m ? `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
    const TV = (/TERMS_VERSION = '([^']*)'/.exec(read('js/terms.js')) || [])[1] || '';
    ok('the terms are dated the day js/terms.js\'s TERMS_VERSION names, and the privacy policy no later', !!dated(pages.terms) && TV.slice(0, 10) === dated(pages.terms) && !!dated(pages.privacy) && dated(pages.privacy) <= dated(pages.terms), `${TV} ${dated(pages.terms)} ${dated(pages.privacy)}`);

    /* ------------------------------ the terms ------------------------------ */
    const T = pages.terms, paidSection = text((T.split('id="paid"')[1] || '').split(/<h2[ >]/)[0]);
    ok('the terms have the licence section (id="paid") and the liability section (id="liability")', /<h2 id="paid">3\. /.test(T) && /<section class="important" id="liability">/.test(T) && /capped at 50 US dollars/.test(T));
    // Sections 1 to 20, each once, in order (h2, and h3 in the liability box), and every "section N" the terms name is the
    // section meant, read by its heading: a link's anchor, and each reference in the words.
    const heads = {}, order = [];
    for (const m of T.matchAll(/<h[23](?: [^>]*)?>(\d+)\. ([^<]+)</g)) { order.push(+m[1]); heads[m[1]] = m[2]; }
    ok('the terms run from section 1 to section 20, each once and in order', order.join() === Array.from({ length: 20 }, (_, i) => i + 1).join(), order.join());
    const numAt = id => { const after = T.split(`id="${id}"`)[1] || ''; return +((after.match(/^>(\d+)\. /) || after.match(/<h[23][^>]*>(\d+)\. /) || [])[1]); };
    const anchors = [...T.matchAll(/<a href="#([\w-]+)">sections? (\d+)/g)].map(m => [m[1], +m[2], numAt(m[1])]);
    ok('each link to a section (#what, #paid, #liability, #stopping, #money, #your-rights, #who, #contact) names that section\'s number', anchors.length >= 10 && anchors.every(([, n, at]) => n === at) && ['what', 'paid', 'liability', 'stopping', 'money', 'your-rights', 'who', 'contact'].every(id => anchors.some(a => a[0] === id)), JSON.stringify(anchors));
    // The contents list (a fold under the short version, no script): one entry per section, in order, each linking its
    // section's id and named by the start of its heading; every numbered heading has an id.
    const tocHtml = (T.split('<nav class="toc"')[1] || '').split('</nav>')[0];
    const toc = [...tocHtml.matchAll(/<li><a href="#([\w-]+)">([^<]+)<\/a>/g)].map(m => [m[1], m[2]]);
    const tocBad = toc.map(([id, words], i) => [id, words, numAt(id), heads[i + 1]]).filter(([id, words, n, head], i) => n !== i + 1 || !head || !head.startsWith(words) || !T.includes(`id="${id}">${i + 1}. `));
    ok('the contents list names the 20 sections in order, each by its heading, and links each one\'s own id', toc.length === 20 && tocBad.length === 0 && /<details>\s*<summary>Contents/.test(tocHtml), JSON.stringify(tocBad));
    // Links into the terms from elsewhere (the download page, the licence's buy note, the terms sheet) land on a part that is
    // there: #paid on the licence section (its number checked above), each other id on the page.
    const linkers = ['download.html', 'privacy.html', 'js/licence.js', 'js/terms.js', 'js/licence-web.js', 'js/pages/settings.js'].filter(exists0);
    const into = linkers.flatMap(f => [...read(f).matchAll(/terms\.html#([\w-]+)/g)].map(m => [f, m[1]]));
    ok('every link into the terms from the download page and the app lands on an id the terms have (#paid on the licence section)', into.length >= 4 && into.every(([, id]) => T.includes(`id="${id}"`)) && into.filter(([, id]) => id === 'paid').length >= 3 && numAt('paid') === 3, JSON.stringify(into));
    const T0 = text(T), refs = [
      [/never handles money \( ?section (\d+) ?\)\. What reaches/, /^Money/], [/erase the device \( ?section (\d+) ?\)/, /^Stopping/], [/rights in section (\d+) ?, which last longer/, /^Your rights under the law/],
      [/name and email address are in section (\d+)/, /^Who we are/], [/the price is in section (\d+)/, /^Free as an Audiophile, and the licence/], [/as section (\d+) describes/, /^Contact/],
      [/updates the law requires \( ?section (\d+) ?\)/, /^Your rights under the law/], [/subject to section (\d+)\)/, /^Your rights under the law/], [/licence after their free days: ?section (\d+) ?\)/, /^Free as an Audiophile/],
      [/sections 13 to (\d+)\b/, /^Your rights under the law/], [/and sections 13 to (\d+) apply to you only/, /^Claims caused by your use/],
    ].map(([re, want]) => { const m = T0.match(re); return [String(re), m && heads[m[1]], m && want.test(heads[m[1]] || '')]; });
    ok('…and each section named in the words is the one meant (money, stopping, your rights, who we are, the price, contact)', refs.every(r => r[2]), JSON.stringify(refs.filter(r => !r[2])));
    // The one-time terms sheet repeats the short version: its points are the short version's, word for word and in order,
    // linking the same sections, and the only points it leaves out are the Audiophile's and the price, which its first line says.
    const summaryHtml = (T.split('<section class="summary">')[1] || '').split('</section>')[0];
    const flat = t => t.replace(/\s+/g, '');
    const shortPoints = [...summaryHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => text(m[1]).trim());
    const sheetSrc = (read('js/terms.js').split("class: 'lic-terms-points' },")[1] || '').split("class: 'lic-terms-links'")[0];
    const sheetLines = sheetSrc.split('\n').filter(l => /h\('li', null,/.test(l));
    const sheetPoints = sheetLines.map(l => [...l.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]).filter(x => x !== 'li' && !/\.html/.test(x)).join(''));
    const at = sheetPoints.map(p => shortPoints.findIndex(s => flat(s) === flat(p)));
    const left = shortPoints.filter((_, i) => !at.includes(i));
    const sheetLinks = sheetLines.flatMap(l => [...l.matchAll(/link\('terms\.html(#[\w-]+)', '([^']+)'\)/g)].map(m => `<a href="${m[1]}">${m[2]}</a>`));
    ok('the one-time terms sheet (js/terms.js) repeats the short version word for word, in order, but its Audiophile and price points, which the sheet\'s first line says', sheetPoints.length >= 4 && at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])) && left.length === 2 && /Audiophile role/.test(left[0]) && /US dollars once/.test(left[1]), JSON.stringify({ at, left: left.map(x => x.slice(0, 50)) }));
    ok('…and links the same sections the short version does (section 2, sections 13 to 16)', sheetLinks.length === 2 && sheetLinks.every(a => summaryHtml.includes(a)), sheetLinks.join(' '));
    ok('the short version names the 14-day change of mind beside the price', /It is not a subscription, and if you change your mind within 14 days of buying, you get all your money back \( ?section 3 ?\)/.test(text(summaryHtml)));
    ok(`the licence costs ${PRICE} US dollars once (js/tax.js), for up to 3 devices, not a subscription`, new RegExp(`${PRICE} US dollars once, plus any tax`).test(paidSection) && /up to 3 devices/.test(paidSection) && /not a subscription/.test(paidSection) && !/\b(?!20\b)\d+ US dollars once/.test(text(T)));
    ok(`the licence section names the free ${free} role and every working role (${paid.join(', ')})`, new RegExp(`${free} role is free for good`).test(paidSection) && paid.every(l => paidSection.includes(l)), paid.filter(l => !paidSection.includes(l)).join(', '));
    ok('it says the 30 free days per device, the shared count on one Drive, the clock, read-only and nothing deleted', /free for 30 days in each web browser and on each computer/.test(paidSection) && /same Google Drive share one count/.test(paidSection) && /wrong by more than a day/.test(paidSection) && /read-only/.test(paidSection) && /Nothing is deleted/.test(paidSection));
    ok('…a website sign-in takes no place, Link is the seller, 90 days, 3 moves in 30 days and the 14-day refund', /signing in to the website in a web browser takes none/.test(paidSection) && /Link, LLC/.test(paidSection) && /every 90 days/.test(paidSection) && /up to 3 times in 30 days/.test(paidSection) && /within 14 days of buying, for any reason/.test(paidSection));
    ok('…email sign-in with a 6-digit code on the website, a licence code in the desktop app, Release this computer, free licences, and the licence check\'s last update', /we email you a 6-digit code/.test(paidSection) && /Enter licence code/.test(paidSection) && /Release this computer/.test(paidSection) && /We also give some licences for free/.test(paidSection) && /we will first publish an update that no longer needs it/.test(paidSection));
    ok('…the refund in any words (the licence email, support@crowmade.app or Link), a refunded licence stops at the next check, and cancelling with 14 days\' notice but for a refund, a chargeback or fraud', /Tell us in any words/.test(paidSection) && /ask Link \(support\.link\.com\)/.test(paidSection) && /fully refunded licence stops working on its devices at their next check/.test(paidSection) && /Except for a refund, a chargeback or fraud, we will tell you first[^.]*give you 14 days/.test(paidSection) && /not ownership of a copy/.test(paidSection));
    // The Audiophile is free and for personal use, not for work (decisions §9, continued: "solely for scheduling their shows
    // and keeping track of bands they like"; the owner, §21: "Yes audiophiles can't use it for work."), and has My card
    // (js/roles.js FREE_SECTIONS, item 14). The short version says so (linking section 3); section 3 says what work is (an
    // open definition: anything done in music for pay, for clients or for a business, with examples), that it needs a working
    // role (30 free days on each device, then a licence), that a licence covers every role on the devices it is used on,
    // that the rule holds before licences are switched on too, and the edge cases (notes for yourself, a band, writing,
    // scouting, the tools at a paid gig, studying); its "carry on free as an Audiophile" is for personal use; section 12
    // gives "including paid work" to the working roles and personal use only to the free Audiophile, unless a Tourbook
    // licence covers the device. The app enforces nothing more: the rule is the terms'.
    const shortAudio = shortPoints.find(x => /Audiophile role/.test(x)) || '';
    ok('the short version: the Audiophile is free for good, for your own personal use, and not for work (anything done in music for pay, for clients or for a business), which needs a working role (section 3)', /is free for good, for your own personal use\. It is not for work: anything you do in music for pay, for clients or for a business, such as booking, managing, producing, playing, scouting or reviewing, needs a working role \( ?section 3 ?\)\.$/.test(shortAudio) && /needs a working role \(<a href="#paid">section 3<\/a>\)/.test(summaryHtml), shortAudio);
    const workPara = text((/<p>The Audiophile role is not for work\.[\s\S]*?<\/p>/.exec(T) || [''])[0]).trim();
    ok('section 3: the Audiophile is for your own personal use and keeps My card; work is anything done in music for pay, for clients or for a business (reviewing among the examples), it needs a working role (30 free days on each device), a licence covers every role on its devices, and the rule holds before licences are on', /<h3>Free as an Audiophile, for personal use<\/h3>/.test(T) && /It is for your own personal use: going to shows and following the bands you like\. It has:/.test(paidSection) && roles.FREE_SECTIONS.includes('card') && /the search, notes, My card and the Audiophile’s tools/.test(paidSection)
      && workPara === 'The Audiophile role is not for work. Work is anything you do in music for pay, for clients or for a business, such as booking, promoting, managing, producing, recording, playing, scouting or reviewing music. The business can be yours or anyone else’s: a studio, a label, a management company, an agency, a venue, a festival, a magazine or radio station, or a band or artist run as a business. For work, use a working role: the working roles are free for 30 days on each device, then need a licence. A licence covers every role on the devices it is used on, so there you can use any role for work. This rule applies before licences are switched on too, while every role is free.'
      && !/made for going to shows and following bands|Work means|free for its 30 days|covers every role on its device, so/.test(T0), workPara);
    // The edge cases are a list right after that paragraph, each one held word for word.
    const edges = [...((T.split(/<p>The Audiophile role is not for work\.[\s\S]*?<\/p>/)[1] || '').split('</ul>')[0]).matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => text(m[1]).trim());
    const EDGES = [
      'Going to shows, following and scoring bands, and keeping notes on gigs for yourself, not for a job or a business, is personal use, even if you work in music too.',
      'If you play in a band, the shows you go to as a fan are personal use. A band’s own gigs, rehearsals, bookings and money are work when the band is paid to play or run as a business, whether it is your band or a friend’s you help for free: use a working role for them, such as Band or Solo artist. A band that only plays for fun, unpaid, is not work.',
      'Writing about music for fun, on your own blog or social media, is personal use. Writing or reviewing for pay, for a magazine, a radio station or someone else’s website, or on a blog or channel you run as a business, is work: use a working role, such as Scout or Jack of Trades.',
      'Scouting acts for a label, a music publisher, a manager, an agency, a festival or a venue is work, paid or not, an internship included: use a working role, such as Scout. Telling a friend or a venue about a band you like is not.',
      'Using the Audiophile’s tools (the tuner, metronome, tap tempo, set timer or sound meter) at a paid gig, session or job is work.',
      'Studying music or the music business is personal use; a placement or internship with a business is work.',
    ];
    ok('…with the edge cases: notes for yourself even if you work in music; a band (yours or a friend’s, paid or for fun); writing; scouting for a business, paid or not; the tools at a paid gig; studying', JSON.stringify(edges) === JSON.stringify(EDGES) && !/use the Band or Solo artist role|use the Scout role/.test(T0), JSON.stringify(edges));
    // The tools the edge case names are the Audiophile's own: the five on the Tools page (js/pages/tools.js).
    const toolIds = [...read('js/pages/tools.js').matchAll(/\{ id: '(\w+)', label:/g)].map(m => m[1]);
    ok('…and the tools it names are the five the Tools page has, and Tools is the Audiophile\'s', toolIds.join() === 'tuner,metronome,tempo,meter,timer' && roles.ROLES.find(r => r.id === 'audiophile').sections.includes('tools'), toolIds.join());
    ok('…and after the free days, carrying on free as an Audiophile is for your own personal use', /you can carry on free as an Audiophile at any time, for your own personal use, with everything you already have/.test(paidSection) && !/carry on free as an Audiophile at any time, with everything/.test(T0));
    const own12 = text((T.split('id="ownership"')[1] || '').split(/<h2[ >]/)[0]);
    ok('section 12: “including paid work” is the working roles\'; the free Audiophile is for your own personal use only, not for work, unless a Tourbook licence covers the device', /install and use Tourbook, as long as you follow these terms: in the working roles, for your own personal or business purposes, including paid work \(they need a licence after their free days: ?section 3 ?\); and in the free Audiophile role, for your own personal use only, not for work, unless a Tourbook licence covers the device you use it on\./.test(own12) && !/use Tourbook for your own personal or business purposes|unless you have a licence/.test(T0) && (T0.match(/including paid work/g) || []).length === 2, own12.slice(0, 400));
    // The one-time sheet leaves out the short version's Audiophile point, so its first line carries the rule, and its twin in
    // js/licence.js (the Read-only for now sheet, after Not now) says the same words, the price drawn in the same place.
    const sheetFirst = ((/`(Tourbook’s working roles and sections are free for 30 days[^`]*)`/.exec(read('js/terms.js')) || [])[1] || '').replace('${once}', '…');
    const twinFirst = ((/'(Tourbook’s working roles and sections are free for 30 days on this device, then need a licence: ', onceEl\(\), '[^']*)'\)/.exec(read('js/licence.js')) || [])[1] || '').replace("', onceEl(), '", '…');
    ok('the one-time terms sheet\'s first line (js/terms.js) says the Audiophile stays free, for personal use, not for work, and that the working roles need the terms; its twin in js/licence.js says the same', /for up to 3 of your devices\. Audiophile stays free, for personal use, not for work\. To use the working roles, please read and agree to Tourbook’s terms\.$/.test(sheetFirst) && sheetFirst === twinFirst, JSON.stringify({ sheetFirst, twinFirst }));
    ok('it says backups and Google Drive are free for every role, and Tourbook has no PIN', /Saving backup files and connecting Google Drive are free, for every role/.test(text(T)) && /no PIN/.test(text(T)));
    // Google Drive is on (the owner's Google client, 15 November 2026: js/cloud-config.js, checked in 90-drive), so section 7
    // no longer says it waits for Tourbook's Google sign-in, and the terms are dated that day or later (the change came after
    // they were published on 14 November 2026, so the date and TERMS_VERSION moved: docs/developers.md, the legal pages).
    ok('Google Drive works: the terms no longer say it is not set up yet or waits for Tourbook’s Google sign-in, and are dated 15 November 2026 or later', !/set up yet|isn’t set up|not set up|sign-in is switched on|until then Tourbook says/i.test(text(T)) && /Saving backup files and connecting Google Drive are free, for every role, with or without a licence\. Information can be lost in many ways/.test(text(T)) && dated(T) >= '2026-11-15' && TV >= '2026-11-15', `${dated(T)} ${TV} ${(text(T).match(/[^.]*(set up yet|sign-in is switched on)[^.]*\./i) || [''])[0]}`);
    ok('the sound level meter is not a calibrated instrument, and insurance records are notes, not cover', /sound level meter is not a calibrated instrument/.test(text(T)) && /notes, not insurance/.test(text(T)));
    /* --- what Tourbook is not, in the music world (decisions §20), each held to what the code does --- */
    ok('Tourbook is not an agency, promoter, manager, label, music publisher or collecting society, nor a party to any booking or deal; holds, deals and riders are your notes, which Tourbook does not make contracts', /Tourbook is not a booking agency, promoter, manager, label, music publisher or collecting society, and does not act for you/.test(T0) && /not a party to any booking, deal or agreement between you and venues, promoters, artists/.test(T0) && /A hold, an offer, a confirmed show, a deal or a rider in Tourbook is your own note of what was asked or agreed: Tourbook does not make it a contract, and it is no substitute for one/.test(T0) && !/not proof of one/.test(T0));
    ok('…Tourbook never contacts anyone for you: what reaches people goes by your own email, messages or calls, share sheet, a code scanned from your screen, printout, file or link', /Tourbook never contacts venues, promoters, artists or anyone else for you/.test(T0) && /goes from you: by your own email, messages or calls, your device’s share sheet, a QR code someone scans from your screen, a printout, a file or a link/.test(T0));
    const js = d => fs.readdirSync(path.join(REPO, d)).filter(n => n.endsWith('.js')).map(n => read(`${d}/${n}`)).join('\n');
    const code = js('js') + js('js/pages') + js('js/blocks');
    ok('…take logs hold only taps and notes and Tourbook records no audio (nothing in js/ records sound)', /Tourbook records no audio and keeps none of your recordings or files/.test(T0) && !/MediaRecorder|captureStream/.test(code));
    // The printed split sheet is a form the writers sign (js/pages/songs.js splitDoc: "Agreed and signed", a line each):
    // the terms say what a signed one means is between them, and never that it is not an agreement.
    const songs = read('js/pages/songs.js');
    ok('…split sheets are records and no registration or publishing deal; the printed one is the writers\' form to sign, between them, with Tourbook no party; Tourbook registers and collects nothing', /A split sheet is not a registration of a song or a publishing deal/.test(T0) && /The printed split sheet is a form for the writers to check and sign: what a signed one means is between them/.test(T0) && /Tourbook is not a party to it or to anything else the writers sign, and does not check or enforce it/.test(T0) && /Tourbook registers nothing with any collecting society, PRO or publisher, and collects no royalties/.test(T0) && !/royalty agreement|codes \(PRO/.test(T0) && /'Agreed and signed'/.test(songs) && /'Signature and date'/.test(songs) && /label: 'PRO' \}, \{ key: 'ipi', label: 'IPI' \}/.test(songs));
    const docs = ['js/acts-docs.js', 'js/daysheet.js', 'js/daysheet-doc.js', 'js/money.js', 'js/money-doc.js', 'js/ics.js', 'js/print.js'].filter(exists0);
    ok('…scores, “Did you see them?” and scouting notes are your own opinions, on no document Tourbook makes (no score, sighting or act\'s notes in its press kit, rider, day sheet, money or calendar files)', /are your own opinions: if you share them, you are responsible for what you share/.test(T0) && docs.length === 7 && docs.every(f => !/score|\b(a|act)\.(seen|notes)\b/i.test(read(f))), docs.filter(f => /score|\b(a|act)\.(seen|notes)\b/i.test(read(f))).join(' '));
    // A booking's own notes do go on its day sheet unless left off (js/daysheet.js PARTS: notes on, guest names off, by
    // default), and the terms say so, in section 5 and in what a day sheet carries.
    const ds = read('js/daysheet.js');
    ok('…a booking\'s notes go on its day sheet unless left off, and guest names only if chosen (as js/daysheet.js\'s defaults are)', /A booking’s notes are different: they go on its day sheet unless you leave them off there/.test(T0) && /\['notes', 'Booking notes', true,/.test(ds) && /\['guestNames', 'Guest list names and \+1s', false,/.test(ds) && /how many are on the guest list \(and their names, only if you choose\), and the booking’s notes unless you leave them off/.test(T0));
    ok('…My card and sample-work links share what you choose, and sample-work pages are another service\'s', /My card shows the contact details you put on it/.test(T0) && /A sample-work link opens a page on another service, under that service’s terms/.test(T0) && /Share only work you are allowed to share/.test(T0));
    ok('…house rules are what you or the sample data entered, not the venue\'s policy; overlap and clash notes, venue warnings and the curfew mark are aids that can be wrong', /what you entered, or what the sample data came with \(Settings → Sample data\), not the venue’s own policy/.test(T0) && /'sample', 'Sample data'/.test(read('js/pages/settings.js')) && /Overlap and clash notes[^.]*curfew and the other warnings about a venue, the “after curfew” mark[^.]*are worked out from what you enter: they are aids for planning, and can be wrong or missing/.test(T0) && /'after curfew'/.test(read('js/pages/bookings.js')) && /export function venueWarnings/.test(read('js/pages/venues.js')));
    ok('…guest lists and split-sheet writers are other people\'s details, and a day sheet carries the guest list but never any money (but what is typed into its notes)', /including the names on a guest list and the writers on a split sheet/.test(T0) && /A day sheet carries what the day needs:[^.]*the guest list[^.]*\. It never carries any money \(the deal, fees, settlement or budget\), unless you type it into those notes/.test(T0) && /A sent link cannot be withdrawn or changed/.test(T0) && /a link is not proof of who sent it, of an agreement or of a payment/.test(T0));
    // Deleting someone (js/store.js remove('people')) takes them off line-ups, settlement shares and acts' members at once;
    // typed and copied names stay, and the terms say which.
    const store = read('js/store.js');
    ok('…deleting someone takes them off line-ups, settlement shares and an act\'s members (as js/store.js does), and their name stays where typed or copied', /It also takes them off line-ups, settlement shares, an act’s members and the gear they own or paid for/.test(T0) && /Their name stays where it was typed or copied, so change those too: a booking’s contact and running order, guest lists, split sheets and notes/.test(T0) && /b\.people = without\(b\.people, id\); if \(b\.settlement && b\.settlement\.shares\) delete b\.settlement\.shares\[id\]/.test(store) && /a\.members = without\(a\.members, id\)/.test(store) && /g\.owner = ''/.test(store) && /g\.paidBy = ''/.test(store));
    ok('…invoices: check the Pay buttons, the bank details and the bank-transfer code, which fills in the amount only in euros (js/money-pay.js)', /Check your bank details and the bank-transfer QR code too: the code fills in the amount only on an invoice in euros/.test(T0) && /code === 'EUR' && Number\(amount\) > 0/.test(read('js/money-pay.js')));
    /* --- the legal part's protections, with their numbers (unchanged by the rewrite; a later change must mean to) --- */
    ok('who provides Tourbook: Laurence Simmonds (TheCrowBro), California, support@crowmade.app, postal address and phone on request; only from tourbook.crowmade.app', /Laurence Simmonds, known online as TheCrowBro/.test(T0) && /in California, USA/.test(T0) && contacts(T).every(c => c === 'support@crowmade.app') && /postal address and phone number are available upon request/.test(T0) && /Get Tourbook only from tourbook\.crowmade\.app/.test(T0));
    ok('no warranty for business use, the exclusions, the cap (the greater of twelve months\' licence payments, Link included, and 50 US dollars) and what is never excluded', /Sections 13 and 14\.2 to 14\.5 apply if you use Tourbook for your business or profession\. If you use it as a consumer, section 14\.6 applies instead\. Section 14\.7 applies to everyone\./.test(T0) && /provided “as is” and “as available”/.test(T0) && /14\.2 For business use, we are not liable for any indirect, incidental, special, consequential or punitive loss/.test(T0) && /limited to the greater of: what you paid for Tourbook licences in the twelve months before the event that caused the claim, whether to us or to the seller named on your receipt \(such as Link, LLC\); and 50 US dollars/.test(T0) && /foreseeable result of our breaking these terms/.test(T0) && /death or personal injury caused by our negligence, for fraud, for loss we caused deliberately or by gross negligence/.test(T0));
    ok('…the business indemnity, and consumers\' rights in the UK, the EU, California (Civil Code 1789.3) and Australia (the working roles not ordinarily bought for personal use)', /you will cover our reasonable losses and costs/.test(T0) && /Consumer Rights Act 2015/.test(T0) && /In the EU, Tourbook must conform/.test(T0) && /Civil Code section 1789\.3/.test(T0) && /Complaint Assistance Unit/.test(T0) && /\(800\) 952-5210/.test(T0) && /Tourbook’s working roles are not of a kind ordinarily bought for personal, domestic or household use/.test(T0));
    ok('…what survives stopping, California law with consumers\' own, Contra Costa County and the Northern District for business, consumers\' home courts, and export and sanctions', /Sections 2 and 4 to 9, the refund and cancellation parts of section 3, section 12 except your right to use Tourbook, and sections 13 to 16 and 19 still apply after you stop/.test(T0) && /governed by the law of the State of California/.test(T0) && /mandatory laws of the country where you live/.test(T0) && /Contra Costa County, California, and the federal courts of the Northern District of California/.test(T0) && /in the courts where you live/.test(T0) && /Export and sanctions/.test(T0));
    ok('Erase keeps the licence sign-in, and Delete my licence records is explained', /Erase this device[^.]*\. Erasing[^.]*\. It keeps[^.]*your licence sign-in/.test(text(T)) && /Delete my licence records/.test(text(T)));
    ok('the terms ask agreement once before the working roles\' free days, and keep 18 or over', /Before the working roles’ free days start on a device, Tourbook also shows you these terms/.test(text(T)) && /You must be 18 or over/.test(text(T)));
    // The lead's decision 4: while licences are off, the terms say so in one sentence, in the short version and in section 3
    // (as privacy.html does); docs/go-live.md 9(d) removes both with a TERMS_VERSION bump when the website's licence goes on.
    const OFF = 'Until licences are switched on at tourbook.crowmade.app, every role is free and the licence parts of these terms do not apply yet.';
    const summary = text((T.split('<section class="summary">')[1] || '').split('</section>')[0]), stepD = (read('docs/go-live.md').split('**(d)')[1] || '').split('**(e)')[0];
    const firstOf3 = text(((T.split('id="paid"')[1] || '').match(/^>[^<]*<\/h2>\s*<p>([\s\S]*?)<\/p>/) || [])[1] || '').trim(); // the paragraph right under the heading
    ok('while licences are off, the terms say so in one sentence: in the short version and in section 3 (its first words, under the heading), nowhere else', summary.includes(OFF) && paidSection.includes(OFF) && firstOf3 === OFF && text(T).split(OFF).length === 3, `${summary.includes(OFF)} ${paidSection.includes(OFF)} ${firstOf3.slice(0, 60)} ${text(T).split(OFF).length - 1}`);
    ok('…and docs/go-live.md 9(d) takes that sentence out of both in the same commit as the switch, with a TERMS_VERSION bump', stepD.replace(/\s+/g, ' ').includes(OFF) && /TERMS_VERSION/.test(stepD) && /js\/terms\.js/.test(stepD), stepD.slice(0, 200));

    /* ----------------------------- the privacy ----------------------------- */
    const P = text(pages.privacy);
    const services = ['Google Drive', 'licence server at tourbook.crowmade.app', 'Stripe', 'Resend', 'OpenStreetMap', 'Cloudflare', 'tourbook-download.crowmade.app'];
    ok('the privacy policy names Google Drive, the licence server at tourbook.crowmade.app, Stripe, Resend, OpenStreetMap and Cloudflare', services.every(s => P.includes(s)), services.filter(s => !P.includes(s)).join(', '));
    ok('…says when the licence server is asked, and that an Audiophile who never used a working role sends it nothing', /at most every six hours, whether licences are live, but only while it uses a working role, has started its free days, or is signed in/.test(P) && /An Audiophile who never used a working role sends nothing to the licence server at all/.test(P) && /Until licences are switched on at tourbook\.crowmade\.app, Tourbook sends nothing at all to the licence server/.test(P));
    ok('…says what Google Drive holds, the shared free-days start, the hour\'s token, and how to remove it', /a dated copy each day/.test(P) && /first started on any of your devices/.test(P) && /for its hour/.test(P) && /until you disconnect/.test(P) && /Delete hidden app data/.test(P));
    // Google's sign-in script loads as the Connect Google Drive sheet opens (js/backup.js), so its window can open straight
    // from the tap on Continue with Google: Google is contacted from that tap on Connect Google Drive…, even with Not now.
    const R = f => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\s+/g, ' ');
    const guides = { 'CLAUDE.md': R('CLAUDE.md'), 'docs/developers.md': R('docs/developers.md'), 'README.md': R('README.md') };
    const stale = Object.entries(guides).filter(([, t]) => /only when someone connects Google Drive|loaded from Google only then|Nobody who never connects Drive|Nothing is sent anywhere by itself|contacts nothing while its licence is off and Google Drive is not linked, but for (?![^.]*OpenStreetMap)[^.]*\./.test(t)).map(([f]) => f);
    ok('…says Google is contacted once Connect Google Drive… is tapped (its sign-in script loads as the sheet opens, even before Not now), in section 3 and the table; the guides say the same, and the desktop app\'s OpenStreetMap', /Only once you tap Connect Google Drive… \(☁ → Google Drive → Connect Google Drive…\): Google’s sign-in script loads from Google as that sheet opens, ready for Continue with Google, so Google sees your internet address even if you then tap Not now\./.test(P) && /If you never tap Connect Google Drive…, Tourbook never contacts Google\./.test(P) && !/If you never connect Google Drive/.test(P) && /Only once you tap Connect Google Drive…/.test(text((pages.privacy.split('<table>')[1] || '').split('</table>')[0])) && stale.length === 0, stale.join(', '));
    // With Google Drive on (15 November 2026), the tap on Connect Google Drive… really loads Google's script, before anyone
    // has connected: section 7 (Security) says so as section 3 does, not "only once you connect Google Drive".
    const security = text((pages.privacy.split('<h2>7.')[1] || '').split('<h2>8.')[0]);
    ok('…section 7 says Google’s sign-in script runs only once you tap Connect Google Drive… (as section 3 does), not once you connect', /runs only code from its own address \(and Google’s sign-in script, only once you tap Connect Google Drive…\)/.test(security) && !/only once you connect Google Drive/.test(P), security.slice(0, 160));
    // Delete my licence records (cloudflare/worker.mjs webForget): what stays, in §3 and in §6.
    const choices = text((pages.privacy.split('<h2>6.')[1] || '').split('<h2>7.')[0]);
    ok('…says what stays after Delete my licence records: a scrambled form of the email address and when, for 400 days (matchable to an address already known), and the recent moves between computers', /After Delete my licence records, so that sign-ins made before it stop working, the server keeps a scrambled form of your email address and when the records were deleted, for 400 days: it does not hold your address, though we could tell from it whether an address we already know deleted its records, and when\./.test(P) && /a scrambled form of your email address and when you deleted the records stay for 400 days/.test(choices) && /the dates of any moves between computers in the last 30 days/.test(choices), choices);
    // Device permissions (section 4) as the app has them: the location button's own name, a Mac only in the desktop app
    // (desktop/main.cjs), and the screen kept awake by the set timer only (js/tools-timer.js calls keepAwake; the meter does not).
    const perms = text((pages.privacy.split('<h2>4.')[1] || '').split('<h2>5.')[0]);
    ok('…section 4 names the “📡 I’m here now” button (a Mac only in the desktop app) and says only the set timer keeps the screen awake', /Location: the “📡 I’m here now” button for a venue \(in the desktop app it works only on a Mac\)\./.test(perms) && /Keeping the screen on: the set timer keeps the screen awake while it runs\./.test(perms) && !/use my location|meter keep/.test(perms), perms);
    ok('…and that Erase keeps the licence record and its second copy in IndexedDB', /second copy[^.]*IndexedDB/.test(P) && /Erase this device keeps the licence record, that second copy and your agreement to the terms/.test(P));

    /* ------------------------- in the browser ------------------------- */
    if (!BASE) console.log('SKIP the pages in the browser need the test server (run this through node tests/run.mjs)');
    else {
      browser = await chromium.launch();
      const shots = process.env.S;
      for (const scheme of ['light', 'dark']) for (const [w, h, big] of [[420, 900, false], [320, 700, true]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, serviceWorkers: 'block' });
        const page = await ctx.newPage();
        const errors = [], away = [];
        page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
        page.on('request', q => { if (!q.url().startsWith(BASE)) away.push(q.url()); });
        for (const f of ['terms.html', 'privacy.html']) {
          await page.goto(BASE + f);
          // Large text as Tourbook's own setting sets it (the pages have no script, so a reader's own browser zoom does the same).
          if (big) await page.evaluate(() => { document.documentElement.dataset.text = 'xlarge'; document.documentElement.dataset.targets = 'large'; });
          const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.body).color, h1: getComputedStyle(document.querySelector('h1')).fontSize, icon: document.querySelector('header img').naturalWidth }));
          const dark = m.bg === 'rgb(18, 15, 26)', light = m.bg === 'rgb(239, 236, 245)';
          ok(`${f} at ${w}×${h}${big ? ', extra-large text' : ''}, ${scheme}: Tourbook's colours, no sideways scrolling, its icon shown`, (scheme === 'dark' ? dark : light) && m.over <= 0 && m.icon > 0, JSON.stringify(m));
          if (shots) await page.screenshot({ path: path.join(shots, `83-${f.replace('.html', '')}-${w}-${scheme}.png`) });
        }
        ok(`no errors and nothing fetched from anywhere else (${w}×${h}, ${scheme})`, errors.length === 0 && away.length === 0, [...errors, ...away].slice(0, 3).join(' | '));
        await ctx.close();
      }
    }

    /* ---------------- Vdex leftovers where people can see them ---------------- */
    // Every file that exists now, so this passes in each part's worktree and covers them all once merged. Comment lines
    // (starting //, /* or *) may name Vdex, to say what is not shared; nothing else may, but these lines, by their text.
    const ALLOWED = [
      ['desktop/licence.cjs', 'This is a Vdex licence code. Tourbook has its own licence'],
      // The desktop app knows a pasted Vdex code (Part C): its test and the line that refuses it with the words above.
      ['desktop/licence.cjs', 'const looksVdex = text => '],
      ['desktop/licence.cjs', 'if (looksVdex(text)) return { error: MESSAGES.vdex };'],
      // The download page says a Vdex code does not work here (Part C).
      ['download.html', 'A Vdex licence code doesn’t work in Tourbook: the two apps have licences of their own.'],
      ['tools/licence-generator.template.html', 'That is a Vdex ledger, not Tourbook’s'],
      ['tools/licence-generator.html', 'That is a Vdex ledger, not Tourbook’s'],
      // Google Drive refuses a Vdex file found in the hidden folder, and says why (Part D): the test and its words.
      ['js/drive.js', 'is a Vdex file, not a Tourbook one, so Tourbook left it alone'],
      ['js/drive.js', 'const isVdex = d => !!d && typeof d === \'object\' && !ours(d) && '],
      ['js/drive.js', 'if (isVdex(d)) throw unreadable(WORDS.vdex);'],
    ];
    const LEFTOVER = /Vdex|Android|iPhone|App Store|Google Play|vdex-/i;
    const exists = f => fs.existsSync(path.join(REPO, f));
    const inDir = (d, re) => (exists(d) ? fs.readdirSync(path.join(REPO, d)).filter(n => re.test(n)).map(n => `${d}/${n}`) : []);
    const scanned = ['tools/licence-generator.html', 'tools/licence-generator.template.html', 'cloudflare/worker.mjs', 'download.html', 'terms.html', 'privacy.html', 'js/terms.js', 'js/drive.js', 'js/sync.js', ...inDir('desktop', /\.cjs$/), ...inDir('js', /^licence.*\.js$/)].filter(exists);
    const found = [];
    for (const f of scanned) read(f).split('\n').forEach((line, i) => {
      if (!LEFTOVER.test(line) || /^\s*(\/\/|\/\*|\*)/.test(line)) return;
      if (ALLOWED.some(([af, t]) => af === f && line.includes(t))) return;
      if ((f === 'terms.html' || f === 'privacy.html') && contacts(line).length && !LEFTOVER.test(line.replace(/<a href="mailto:[^"]+">[^<]*<\/a>/g, ''))) return;
      found.push(`${f}:${i + 1} ${line.trim().slice(0, 90)}`);
    });
    ok(`no Vdex, Android, iPhone or app-store words where people can see them (${scanned.length} files)`, found.length === 0 && scanned.length >= 10, found.slice(0, 4).join(' | '));
    ok('the allowed lines are still there, once each, so this list stays honest', ALLOWED.filter(([f]) => exists(f)).every(([f, t]) => read(f).split('\n').filter(l => l.includes(t)).length === 1));
  } catch (e) {
    console.log('FAIL spec crashed — ' + (e && e.stack || e));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
