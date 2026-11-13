// Gdex's terms of service and privacy policy (the build spec §10, §6.3), read as text and opened in Chromium: each has
// its own policy and no script, is dated and links the other and Gdex; the terms carry the licence section (the price
// equal to js/tax.js, the free Audiophile, every working role by its label from js/roles.js) and the liability
// section; the privacy policy names every service Gdex may contact; neither names an app store or a storage service
// Gdex does not use, nor Vdex. Both pages read on a phone, light and dark, with large text, and log no error. Last, Vdex
// leftovers anywhere people can see them: the licence server, the generator, the desktop app's files, the download page
// and the web app's licence and Drive modules, outside comments, with each allowed line named here by its text.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const REPO = path.resolve(__dirname, '../..');
const BASE = process.env.GDEX_URL || '';
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const text = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
// The contact address the owner published, copied unchanged (the build spec §0 rule 7): the one place either page may
// hold a word the checks below refuse, were there one in it.
const contacts = html => [...html.matchAll(/<a href="mailto:([^"]+)">/g)].map(m => m[1]);
const STORES = /App Store|Google Play|iCloud|Dropbox|OneDrive/;

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
      ok(`${name}.html has Gdex's look (styles.css) and is dated`, /<link rel="stylesheet" href="styles\.css">/.test(html) && /Last updated \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\./.test(html));
      const t = text(html);
      const vdex = t.replace(new RegExp(contacts(html).map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '$^', 'g'), '');
      ok(`${name}.html names no app store and no storage service Gdex does not use, and no Vdex (but in a contact address copied unchanged)`, !STORES.test(t) && !/Vdex|vdex/.test(vdex) && !/Android|iPhone|iPad/.test(t), (t.match(STORES) || vdex.match(/Vdex|vdex|Android|iPhone|iPad/) || [''])[0]);
      ok(`${name}.html links Gdex and its contact address`, /href="index\.html"/.test(html) && contacts(html).length > 0);
    }
    ok('each links the other', /href="privacy\.html"/.test(pages.terms) && /href="terms\.html"/.test(pages.privacy));
    ok('both carry the same date', pages.terms.match(/Last updated ([^.]+)\./)[1] === pages.privacy.match(/Last updated ([^.]+)\./)[1]);

    /* ------------------------------ the terms ------------------------------ */
    const T = pages.terms, paidSection = text((T.split('id="paid"')[1] || '').split('<h2>12.')[0]);
    ok('the terms have the licence section (id="paid") and the liability section (id="liability")', /<h2 id="paid">11\. /.test(T) && /<section class="important" id="liability">/.test(T) && /capped at 50 US dollars/.test(T));
    ok(`the licence costs ${PRICE} US dollars once (js/tax.js), for up to 3 devices, not a subscription`, new RegExp(`${PRICE} US dollars once, plus any tax`).test(paidSection) && /up to 3 devices/.test(paidSection) && /not a subscription/.test(paidSection) && !/\b(?!20\b)\d+ US dollars once/.test(text(T)));
    ok(`the licence section names the free ${free} role and every working role (${paid.join(', ')})`, new RegExp(`${free} role is free for good`).test(paidSection) && paid.every(l => paidSection.includes(l)), paid.filter(l => !paidSection.includes(l)).join(', '));
    ok('it says the 30 free days per device, the shared count on one Drive, the clock, read-only and nothing deleted', /free for 30 days in each web browser and on each computer/.test(paidSection) && /same Google Drive share one count/.test(paidSection) && /wrong by more than a day/.test(paidSection) && /read-only/.test(paidSection) && /Nothing is deleted/.test(paidSection));
    ok('…a website sign-in takes no place, Link is the seller, 90 days, 3 moves in 30 days and the 14-day refund', /signing in to the website in a web browser takes none/.test(paidSection) && /Link, LLC/.test(paidSection) && /every 90 days/.test(paidSection) && /up to 3 times in 30 days/.test(paidSection) && /within 14 days of buying, for any reason/.test(paidSection));
    ok('it says backups and Google Drive are free for every role, and Gdex has no PIN', /Saving backup files and connecting Google Drive are free, for every role/.test(text(T)) && /no PIN/.test(text(T)));
    ok('the sound level meter is not a calibrated instrument, and insurance records are notes, not cover', /sound level meter is not a calibrated instrument/.test(text(T)) && /notes, not insurance/.test(text(T)));
    ok('Erase keeps the licence sign-in, and Delete my licence records is explained', /Erase this device[^.]*\. Erasing[^.]*\. It keeps[^.]*your licence sign-in/.test(text(T)) && /Delete my licence records/.test(text(T)));
    ok('the terms ask agreement once before the working roles\' free days, and keep 18 or over', /Before the working roles’ free days start on a device, Gdex also shows you these terms/.test(text(T)) && /You must be 18 or over/.test(text(T)));

    /* ----------------------------- the privacy ----------------------------- */
    const P = text(pages.privacy);
    const services = ['Google Drive', 'licence server at gdex.crowmade.app', 'Stripe', 'Resend', 'OpenStreetMap', 'Cloudflare', 'gdex-download.crowmade.app'];
    ok('the privacy policy names Google Drive, the licence server at gdex.crowmade.app, Stripe, Resend, OpenStreetMap and Cloudflare', services.every(s => P.includes(s)), services.filter(s => !P.includes(s)).join(', '));
    ok('…says when the licence server is asked, and that an Audiophile who never used a working role sends it nothing', /at most every six hours, whether licences are live, but only while it uses a working role, has started its free days, or is signed in/.test(P) && /An Audiophile who never used a working role sends nothing to the licence server at all/.test(P) && /Until licences are switched on at gdex\.crowmade\.app, Gdex sends nothing at all to the licence server/.test(P));
    ok('…says what Google Drive holds, the shared free-days start, the hour\'s token, and how to remove it', /a dated copy each day/.test(P) && /first started on any of your devices/.test(P) && /for its hour/.test(P) && /until you disconnect/.test(P) && /Delete hidden app data/.test(P));
    // Google's sign-in script loads as the Connect Google Drive sheet opens (js/backup.js), so its window can open straight
    // from the tap on Continue with Google: Google is contacted from that tap on Connect Google Drive…, even with Not now.
    const R = f => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\s+/g, ' ');
    const guides = { 'CLAUDE.md': R('CLAUDE.md'), 'docs/developers.md': R('docs/developers.md'), 'README.md': R('README.md') };
    const stale = Object.entries(guides).filter(([, t]) => /only when someone connects Google Drive|loaded from Google only then|Nobody who never connects Drive|Nothing is sent anywhere by itself|contacts nothing while its licence is off and Google Drive is not linked, but for (?![^.]*OpenStreetMap)[^.]*\./.test(t)).map(([f]) => f);
    ok('…says Google is contacted once Connect Google Drive… is tapped (its sign-in script loads as the sheet opens, even before Not now), in section 3 and the table; the guides say the same, and the desktop app\'s OpenStreetMap', /Only once you tap Connect Google Drive… \(☁ → Google Drive → Connect Google Drive…\): Google’s sign-in script loads from Google as that sheet opens, ready for Continue with Google, so Google sees your internet address even if you then tap Not now\./.test(P) && /If you never tap Connect Google Drive…, Gdex never contacts Google\./.test(P) && !/If you never connect Google Drive/.test(P) && /Only once you tap Connect Google Drive…/.test(text((pages.privacy.split('<table>')[1] || '').split('</table>')[0])) && stale.length === 0, stale.join(', '));
    // Delete my licence records (cloudflare/worker.mjs webForget): what stays, in §3 and in §6.
    const choices = text((pages.privacy.split('<h2>6.')[1] || '').split('<h2>7.')[0]);
    ok('…says what stays after Delete my licence records: a scrambled form of the email address and when, for 400 days (matchable to an address already known), and the recent moves between computers', /After Delete my licence records, so that sign-ins made before it stop working, the server keeps a scrambled form of your email address and when the records were deleted, for 400 days: it does not hold your address, though we could tell from it whether an address we already know deleted its records, and when\./.test(P) && /a scrambled form of your email address and when you deleted the records stay for 400 days/.test(choices) && /the dates of any moves between computers in the last 30 days/.test(choices), choices);
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
          // Large text as Gdex's own setting sets it (the pages have no script, so a reader's own browser zoom does the same).
          if (big) await page.evaluate(() => { document.documentElement.dataset.text = 'xlarge'; document.documentElement.dataset.targets = 'large'; });
          const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.body).color, h1: getComputedStyle(document.querySelector('h1')).fontSize, icon: document.querySelector('header img').naturalWidth }));
          const dark = m.bg === 'rgb(18, 15, 26)', light = m.bg === 'rgb(239, 236, 245)';
          ok(`${f} at ${w}×${h}${big ? ', extra-large text' : ''}, ${scheme}: Gdex's colours, no sideways scrolling, its icon shown`, (scheme === 'dark' ? dark : light) && m.over <= 0 && m.icon > 0, JSON.stringify(m));
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
      ['desktop/licence.cjs', 'This is a Vdex licence code. Gdex has its own licence'],
      // The desktop app knows a pasted Vdex code (Part C): its test and the line that refuses it with the words above.
      ['desktop/licence.cjs', 'const looksVdex = text => '],
      ['desktop/licence.cjs', 'if (looksVdex(text)) return { error: MESSAGES.vdex };'],
      // The download page says a Vdex code does not work here (Part C).
      ['download.html', 'A Vdex licence code doesn’t work in Gdex: the two apps have licences of their own.'],
      ['tools/licence-generator.template.html', 'That is a Vdex ledger, not Gdex’s'],
      ['tools/licence-generator.html', 'That is a Vdex ledger, not Gdex’s'],
      // Google Drive refuses a Vdex file found in the hidden folder, and says why (Part D): the test and its words.
      ['js/drive.js', 'is a Vdex file, not a Gdex one, so Gdex left it alone'],
      ['js/drive.js', 'const isVdex = d => !!d && typeof d === \'object\' && d.app !== \'gdex\''],
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
