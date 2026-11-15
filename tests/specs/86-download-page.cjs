// The desktop app's download page and its package, and the web app's side of the desktop app.
//  1. Node: download.html's price list is js/tax.js's (every total, each place once); while the desktop app is not out
//     it links no installer and says the app is coming; the updater's feed (desktop/updater.cjs) and
//     electron-builder's publish address (package.json) are Tourbook's own download address, never Vdex's; the page runs
//     no script, links /buy and names the Audiophile as free; the
//     package holds every website file (tools/site-files.mjs) and the seven desktop files, and is Tourbook's, not Vdex's
//     (app id, name, port, no camera); the build workflow publishes nothing.
//  2. Chromium: the page at 420 and 320 wide, light and dark, without sideways scrolling; then the web app with a
//     stand-in desktop bridge: updates follow the bridge (no service worker), Install is hidden, and share links and a
//     day sheet's calendar entry point at tourbook.crowmade.app instead of the computer's own address.
// Reads package.json, desktop/ and .github/ from the repository (the build spec [S-26]): the scratch copy leaves them out.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { open, ok, sleep, go, BASE } = require('../helpers.cjs');
const REPO = path.join(__dirname, '..', '..');
const OUT = process.env.S || '/tmp';
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const esm = f => import(pathToFileURL(path.join(REPO, f)).href);

(async () => {
  /* ================================ 1. Node ================================ */
  const html = read('download.html'), pkg = JSON.parse(read('package.json')), updater = read('desktop/updater.cjs'), main = read('desktop/main.cjs');
  const { RATES, PRICE, withTax } = await esm('js/tax.js');
  const items = [...html.matchAll(/<li data-c="([A-Z]{2})">([^<]+)<b>([^<]+)<\/b>\s*<span class="muted">([^<]+)<\/span><\/li>/g)].map(m => ({ c: m[1], name: m[2].trim(), total: m[3], rate: m[4] }));
  const codes = Object.keys(RATES), listed = items.map(i => i.c);
  ok(`the page lists all ${codes.length} places with a total: the UK, Australia and the 27 EU countries, each once`, codes.length === 29 && listed.length === codes.length && codes.every(c => listed.filter(x => x === c).length === 1), `missing: ${codes.filter(c => !listed.includes(c)).join(', ') || 'none'}`);
  const wrong = items.filter(i => { const w = withTax(i.c); return !w || i.total !== w.total || i.rate !== (['GB', 'AU'].includes(i.c) ? `${w.rate}% ${w.tax}` : `${w.rate}%`); });
  ok('every total and rate on the page is the one js/tax.js gives (and so the licence server and the app)', wrong.length === 0, wrong.map(i => `${i.c} ${i.total} ${i.rate}`).join('; '));
  ok('the price before tax is 20 US dollars once, said so in the opening paragraph with a link to the list', PRICE === 20 && /20 US dollars once plus any tax where you live \(<a href="#price">the price with tax<\/a>\)/.test(html) && /id="price"/.test(html));

  const FEED = (/const FEED = '([^']+)'/.exec(updater) || [])[1];
  const publish = pkg.build && pkg.build.publish && pkg.build.publish[0];
  const links = [...html.matchAll(/<a class="dl" href="([^"]+)"/g)].map(m => m[1]);
  ok('the updater’s feed is Tourbook’s own download address, and electron-builder publishes to the same one', FEED === 'https://tourbook-download.crowmade.app/' && publish && publish.url === FEED && publish.provider === 'generic' && publish.channel === 'latest', JSON.stringify({ FEED, publish }));
  // The desktop app is not released yet (decisions §18: no installers, no bucket): the page links no file that does not
  // exist, and says the app is coming. docs/desktop.md's first public release puts the three links back and changes this.
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  const installers = hrefs.filter(u => u.includes('tourbook-download.crowmade.app') || /\.(exe|dmg|AppImage|zip|yml)$/i.test(u));
  const soon = (/<p class="soon" id="soon">([\s\S]*?)<\/p>/.exec(html) || [])[1] || '';
  const later = [...html.matchAll(/<div class="dl later"><b>([^<]+)<\/b><span>([^<]+)<\/span><\/div>/g)].map(m => m[1] + ': ' + m[2]);
  ok('while the desktop app is not out, the page links no installer (nothing at the download address, no .exe, .dmg or .AppImage) and says it is coming', links.length === 0 && installers.length === 0 && /<b>Coming soon\.<\/b> The desktop app isn’t ready to download yet, so there’s nothing to install for now\./.test(soon) && /<a href="\.\/">open Tourbook<\/a>/.test(soon) && JSON.stringify(later) === JSON.stringify(['Windows: Windows 10 or 11 · coming soon', 'Mac: macOS 12 or later, Apple or Intel · coming soon', 'Linux: 64-bit · coming soon']), JSON.stringify({ links, installers, later }));
  // Google Drive is on (the owner's Google client, 15 November 2026; the desktop app carries it from its first release), so
  // the page no longer says Drive waits for Tourbook's Google sign-in.
  ok('…and what speaks of an installer reads as for later: entering a code once the app is out, installing once it’s out; Google Drive between the two is free for every role, with no wait for its sign-in', /<li>Once the desktop app is out, download it from this page and open it\.<\/li>/.test(html) && !/Download Tourbook above/.test(html) && /<h2>Installing, once it’s out<\/h2>/.test(html) && /connect the same Google Drive in both \(☁ at the top of Tourbook, then <b>Connect Google Drive…<\/b>\): free, for every role\. Or, on the website, save a backup file/.test(html) && !/sign-in is switched on|isn’t set up yet|not set up/i.test(html));
  const notVdex = u => { const x = new URL(u); return x.hostname !== 'download.crowmade.app' && !/vdex/i.test(x.hostname + x.pathname); };
  ok('neither the feed nor the publish address (nor a download link, once there are some) is Vdex’s download address or has /vdex in it', [FEED, publish.url, ...links].every(notVdex) && !/vdex/i.test(updater.replace(/\/\/.*$/gm, '')));
  ok('the update page is Tourbook’s download page', /const PAGE = 'https:\/\/tourbook\.crowmade\.app\/download\.html'/.test(updater) && /'User-Agent': 'Tourbook\/'/.test(updater));
  const csp = (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html) || [])[1] || '';
  ok('the page runs no script: none in it, and its CSP allows none', !/<script/i.test(html) && /default-src 'none'/.test(csp) && !/script-src/.test(csp), csp);
  ok('Buy goes to /buy (the licence server’s shop), and the terms and privacy pages are linked', /<a class="buy" href="\/buy">Buy a licence<\/a>/.test(html) && /href="terms\.html#paid"/.test(html) && /href="privacy\.html"/.test(html));
  // The Audiophile is for personal use, not for work (the owner, decisions §21; terms.html section 3): the lead, its row and
  // the way out after the free days say so, and the row links the terms' section.
  const lead = (/<p class="lead">([\s\S]*?)<\/p>/.exec(html) || [])[1] || '', audioRow = (/<li><b>Audiophile[^<]*<\/b>([\s\S]*?)<\/li>/.exec(html) || [])[0] || '';
  ok('the Audiophile is free for personal use, not for work: in the lead, its row (linking the terms) and the way out after the free days', /is free for good, for your own personal use, not for work\./.test(lead) && /<b>Audiophile: free, for personal use<\/b>/.test(audioRow) && /Not for work: what you do in music for pay, for clients or for a business needs a working role \(see the <a href="terms\.html#paid">terms<\/a>\)\./.test(audioRow) && /Or carry on free as an Audiophile, for personal use\./.test(html), audioRow.replace(/<[^>]+>/g, ' ').slice(0, 300));
  ok('the page says the Audiophile is free, and which roles need a licence after 30 free days', /Audiophile[^.]*free for good/.test(html) && /<b>Audiophile: free, for personal use<\/b>/.test(html) && /Producer, Manager, Band, Solo artist, Scout and Jack of Trades: a licence/.test(html) && /free for 30 days on each/.test(html));
  ok('it tells how to enter a code (Settings → About &amp; licence → Enter licence code, a TOURBOOK- code) and how to bring work over (Google Drive, or a backup file)', /Settings → About &amp; licence → Enter licence code/.test(html) && /<code>TOURBOOK-<\/code>/.test(html) && /connect the same Google Drive in both/.test(html) && /backup file/.test(html));
  ok('…with the installing notes for each system (SmartScreen, Open Anyway, chmod +x and libfuse2)', /Run anyway/.test(html) && /Open Anyway/.test(html) && /chmod \+x Tourbook\.AppImage/.test(html) && /libfuse2/.test(html));
  const words = html.slice(html.indexOf('<body>')).replace(/<[^>]*>/g, ' ');
  ok('…in the app’s typography: curly apostrophes and quotes, no straight ones in what is read', !/['"]/.test(words), (words.match(/.{0,30}['"].{0,30}/g) || []).join(' | '));

  const { PAGES, ROOT_FILES, DIRS } = await esm('tools/site-files.mjs');
  const files = (pkg.build && pkg.build.files) || [];
  const DESKTOP = ['desktop/main.cjs', 'desktop/preload.cjs', 'desktop/licence.cjs', 'desktop/licence-codes.cjs', 'desktop/licence-keys.json', 'desktop/licence-on.json', 'desktop/updater.cjs'];
  const want = [...PAGES, ...ROOT_FILES, ...DIRS.map(d => d + '/**'), 'sw.js', ...DESKTOP];
  ok('the desktop package holds every website file in tools/site-files.mjs, sw.js and the seven desktop files (the licence switch included)', want.every(f => files.includes(f)), 'missing: ' + (want.filter(f => !files.includes(f)).join(', ') || 'none'));
  ok('…and every file it names is there', files.filter(f => !f.endsWith('/**')).every(f => fs.existsSync(path.join(REPO, f))) && files.filter(f => f.endsWith('/**')).every(f => fs.statSync(path.join(REPO, f.slice(0, -3))).isDirectory()));
  ok('the package is Tourbook’s: main desktop/main.cjs, app id app.tourbook.desktop (the same in main.cjs), product Tourbook, its version js/version.js’s', pkg.main === 'desktop/main.cjs' && pkg.build.appId === 'app.tourbook.desktop' && pkg.build.productName === 'Tourbook' && pkg.productName === 'Tourbook' && /setAppUserModelId\('app\.tourbook\.desktop'\)/.test(main) && pkg.version === /VERSION = '([^']+)'/.exec(read('js/version.js'))[1]);
  ok('its port is 47861 with fallbacks to 47880, clear of Vdex’s 47831-47850; the bridge is window.tourbookDesktop', /const DEFAULT_PORT = 47861, LAST_PORT = 47880;/.test(main) && /exposeInMainWorld\('tourbookDesktop'/.test(read('desktop/preload.cjs')));
  const vdexLines = ['desktop/main.cjs', 'desktop/preload.cjs', 'desktop/licence.cjs', 'desktop/updater.cjs'].flatMap(f => read(f).split('\n').map((l, i) => ({ f, i: i + 1, l }))).filter(x => /vdex/i.test(x.l) && !/^\s*\/\//.test(x.l) && !/MESSAGES|looksVdex|VDEX-\[0-9A-Z\]|This is a Vdex licence code/.test(x.l));
  ok('nothing in the desktop app is Vdex’s but the message for a pasted Vdex code', vdexLines.length === 0, vdexLines.map(x => `${x.f}:${x.i}`).join(', '));
  const mac = pkg.build.mac || {};
  ok('the Mac app asks only for the microphone and location, in Tourbook’s words, and has no camera entitlement',
    Object.keys(mac.extendInfo || {}).sort().join() === 'NSLocationWhenInUseUsageDescription,NSMicrophoneUsageDescription'
    && mac.extendInfo.NSMicrophoneUsageDescription === 'Tourbook uses the microphone for the tuner and the sound level meter, only while one is open. Nothing is recorded or sent.'
    && mac.extendInfo.NSLocationWhenInUseUsageDescription === 'Tourbook uses your location only when you ask it to fill in where a venue is.'
    && !/camera/i.test(read('desktop/build/entitlements.mac.plist')) && /audio-input/.test(read('desktop/build/entitlements.mac.plist')) && mac.category === 'public.app-category.music');
  const png = fs.readFileSync(path.join(REPO, 'desktop/build/icon.png'));
  ok('the installers’ icon is a 1024×1024 PNG (drawn from icons/icon.svg by desktop/build/make-icon.mjs)', png.readUInt32BE(16) === 1024 && png.readUInt32BE(20) === 1024 && png.slice(1, 4).toString() === 'PNG');
  const wf = read('.github/workflows/desktop.yml');
  const triggers = (/^on:\n([\s\S]*?)^\S/m.exec(wf) || [])[1] || '';
  ok('the build workflow runs only by hand and uploads nothing (no Wrangler, no R2, no release)', /workflow_dispatch/.test(triggers) && !/push:|tags:|schedule:|pull_request/.test(triggers) && !/wrangler|r2 object|gh release|--publish always|publish:\s*$/m.test(wf.replace(/^\s*#.*$/gm, '')), triggers.trim());
  ok('…it refuses to build with the licence switched on and no key 1, and says in its summary whether the licence is on', /licence-on\.json/.test(wf) && /licence-keys\.json/.test(wf) && /GITHUB_STEP_SUMMARY/.test(wf));
  // The signing secrets can sign anything as the owner (Vdex's apps too): they live in a protected Environment, which only
  // an approved run of this job can read, never in repository secrets, which any pushed branch's workflow can read.
  const desk = read('docs/desktop.md'), signing = (desk.split('## Signing')[1] || '').split('\n## ')[0], live = read('docs/go-live.md'), step7 = (live.split('## 7.')[1] || '').split('## 8.')[0], table = (read('docs/licence-server.md').split('## What each key can reach')[1] || '').split('\n## ')[0];
  ok('…its build job takes the signing secrets from the protected Environment tourbook-sign, and the guides say so and what each signing secret can reach', /^    environment: tourbook-sign$/m.test(wf) && /Environment `tourbook-sign`/.test(signing) && !/Repository secrets/.test(signing) && /`tourbook-sign`/.test(step7) && /Vdex['’]s\s+included/.test(step7) && ['MAC_CERT_P12', 'APPLE_APP_PASSWORD', 'AZURE_CLIENT_SECRET'].every(k => table.includes('`' + k + '`')), JSON.stringify({ env: /environment: tourbook-sign/.test(wf), step7: step7.trim().slice(0, 200) }));
  // The lead's decision 4: while licences are off, the download page says so where it speaks of the licence; docs/go-live.md
  // 9(e) takes the sentence out when the desktop app's licence goes on.
  const OFF_DL = 'Until licences are switched on at tourbook.crowmade.app, every role is free and the licence described on this page does not apply yet.';
  const whichRoles = ((html.split('<h2>Which roles need a licence</h2>')[1] || '').split('<h2')[0]).replace(/\s+/g, ' '), stepE = (live.split('**(e)')[1] || '').split('## Questions')[0];
  ok('while licences are off, the download page says so once, where it says which roles need a licence', whichRoles.includes(OFF_DL) && html.replace(/\s+/g, ' ').split(OFF_DL).length === 2, whichRoles.slice(-300));
  ok('…and docs/go-live.md 9(e) takes it out when the desktop app’s licence goes on', stepE.replace(/\s+/g, ' ').includes(OFF_DL) && /download\.html/.test(stepE), stepE.slice(0, 200));
  // The lead's decision 5: the desktop app's hardening (Electron's fuses, and quitting when started with remote debugging) is
  // a step before the first public desktop release, not now: in docs/desktop.md and in docs/go-live.md's desktop part, each
  // with its cost (Playwright cannot drive a packaged build with them on).
  const harden = (desk.split('## Hardening')[1] || '').split('\n## ')[0].replace(/\s+/g, ' '), step8 = (live.split('## 8.')[1] || '').split('## 9.')[0].replace(/\s+/g, ' ');
  const FUSES = [/RunAsNode/, /NODE_OPTIONS/, /--inspect/, /only (loads|load) the app from its `?app\.asar`?/i, /cookie encryption/i, /remote debugging/i];
  ok('docs/desktop.md has the hardening, for before the first public desktop release: the fuses, quitting on remote debugging, and the cost', /before the first public desktop release/i.test(harden) && FUSES.every(re => re.test(harden)) && /Playwright/.test(harden) && /@electron\/fuses/.test(harden), FUSES.filter(re => !re.test(harden)).join(' '));
  ok('…and docs/go-live.md’s desktop part has it as a step, with the cost, pointing to docs/desktop.md', /before the first public desktop release/i.test(step8) && /RunAsNode/.test(step8) && /remote debugging/i.test(step8) && /Playwright/.test(step8) && /`docs\/desktop\.md`/.test(step8), step8.slice(-400));
  const tests = read('.github/workflows/tests.yml');
  ok('the tests workflow has a desktop job that runs the smoke test under a virtual screen', /^  desktop:/m.test(tests) && /xvfb-run -a npm run test:desktop/.test(tests));

  /* ============================== 2. Chromium ============================== */
  const browser = await chromium.launch();
  const errors = [];
  try {
    // 213×467: a 320×700 phone with its browser zoomed to 150% (the page has no text size setting of its own).
    for (const [w, hgt] of [[420, 900], [320, 700], [213, 467]]) for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, colorScheme: scheme });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
      await page.goto(BASE + 'download.html');
      const fit = await page.evaluate(() => ({ wide: document.documentElement.scrollWidth <= window.innerWidth, bg: getComputedStyle(document.body).backgroundColor, img: document.querySelector('header img').naturalWidth > 0 }));
      ok(`download page at ${w}×${hgt}${w === 213 ? ' (320 zoomed to 150%)' : ''}, ${scheme}: no sideways scrolling, its icon shown, the ${scheme} colours`, fit.wide && fit.img && (scheme === 'dark' ? fit.bg === 'rgb(18, 15, 26)' : fit.bg === 'rgb(239, 236, 245)'), JSON.stringify(fit));
      await page.screenshot({ path: `${OUT}/86-download-${w}-${scheme}.png`, fullPage: w === 420 });
      await ctx.close();
    }
    ok('the download page shows no errors', errors.length === 0, errors.join(' | '));
  } finally { await browser.close(); }

  // The web app inside the desktop app: a stand-in for the bridge's update members (desktop/preload.cjs), set before the
  // app's own scripts, and a count of service worker registrations.
  const bridge = () => {
    window.__upd = { status: 'ready', version: '0.1.0', available: '0.2.0', progress: 100, url: 'https://tourbook.crowmade.app/download.html', error: '' };
    window.__calls = [];
    window.tourbookDesktop = { platform: 'linux',
      updateState: async () => window.__upd,
      checkForUpdates: async () => { window.__calls.push('check'); return window.__upd; },
      installUpdate: async () => { window.__calls.push('install'); return true; },
      openDownload: async () => { window.__calls.push('open'); },
      onStatus: cb => { window.__push = s => { window.__upd = s; cb(s); }; return () => {}; } };
  };
  const swCount = () => { try { const sw = navigator.serviceWorker, reg = sw.register.bind(sw); window.__sw = 0; sw.register = (...a) => { window.__sw++; return reg(...a); }; } catch (e) { /* no service workers here */ } };
  const prefs = p => `try { localStorage.setItem('tourbook-prefs', ${JSON.stringify(JSON.stringify(p))}); } catch (e) { /* ignore */ }`;

  // For contrast, the website itself: Install offered, the worker registered, links to its own address.
  {
    const { browser: b, page, errors: errs } = await open({ sample: true, init: swCount });
    await sleep(600);
    const web = await page.evaluate(async () => { const v = await import('./js/version.js'); return { install: !document.getElementById('installBtn').hidden, sw: window.__sw, base: v.shareBase(), href: v.publicHref() }; });
    ok('on the website, Install is offered, the offline worker is registered and links use the page’s own address', web.install && web.sw === 1 && web.base === BASE && web.href === BASE, JSON.stringify(web));
    ok('no errors in the console (the website)', errs.length === 0, errs.join(' | '));
    await b.close();
  }
  for (const [label, viewport, p] of [['420-dark', { width: 420, height: 900 }, { scheme: 'dark' }], ['420-light', { width: 420, height: 900 }, { scheme: 'light' }], ['320-xlarge-dark', { width: 320, height: 700 }, { scheme: 'dark', text: 'xlarge', targets: 'large' }], ['320-xlarge-light', { width: 320, height: 700 }, { scheme: 'light', text: 'xlarge', targets: 'large' }]]) {
    const init = `(${bridge})(); (${swCount})(); ${prefs(p)}`;
    const { browser: b, page, errors: errs } = await open({ sample: true, viewport, init });
    await sleep(500);
    if (label === '420-dark') {
      const app = await page.evaluate(async () => {
        const v = await import('./js/version.js'), u = await import('./js/update.js'), { db } = await import('./js/store.js'), ds = await import('./js/daysheet.js');
        const b = db.bookings.find(x => x.kind === 'show' && x.date) || db.bookings.find(x => x.date);
        return { install: document.getElementById('installBtn').hidden, sw: window.__sw, workers: (await navigator.serviceWorker.getRegistrations()).length, state: u.updateState().desktop, base: v.shareBase(), href: v.publicHref(), link: await ds.daySheetLink(b) };
      });
      ok('inside the desktop app, Install is hidden and no offline worker is registered (the app comes in its installer)', app.install === true && app.sw === 0 && app.workers === 0, JSON.stringify({ install: app.install, sw: app.sw }));
      ok('the update state comes from the bridge', app.state && app.state.status === 'ready' && app.state.available === '0.2.0');
      ok('share links (a day sheet’s, an invoice’s) point at tourbook.crowmade.app, not at the computer’s own address', app.base === 'https://tourbook.crowmade.app/' && app.link.startsWith('https://tourbook.crowmade.app/daysheet.html#') && app.href === 'https://tourbook.crowmade.app/', JSON.stringify({ base: app.base, href: app.href, link: app.link.slice(0, 50) }));
      // The day sheet page, opened inside the app (the stand-in bridge again): its calendar entry names the website's address.
      const hash = app.link.slice(app.link.indexOf('#'));
      await page.goto(BASE + 'daysheet.html' + hash);
      await page.waitForSelector('.ds-paper');
      const dl = page.waitForEvent('download');
      await page.locator('.ds-btn', { hasText: 'Add to calendar' }).click();
      const ics = fs.readFileSync(await (await dl).path(), 'utf8').replace(/\r\n[ \t]/g, '');
      ok('the day sheet’s calendar entry, made inside the app, links the day sheet at tourbook.crowmade.app', ics.includes('Day sheet: https://tourbook.crowmade.app/daysheet.html#') && !ics.includes(BASE), (/Day sheet: \S{0,60}/.exec(ics) || [''])[0]);
      await page.goto(BASE); await page.waitForSelector('#deck .dk-next');
    }
    await go(page, 'settings');
    await page.locator('#se-about > summary').click(); await sleep(200);
    const about = page.locator('#se-about');
    if (label === '420-dark') {
      const txt = await about.innerText();
      ok('Settings → About follows the desktop updater: “Tourbook 0.2.0 is ready to install.” with Restart to update, and no Install button', /Tourbook 0\.2\.0 is ready to install\./.test(txt) && /Restart to update/.test(txt) && !(await page.locator('#se-install').count()), txt.split('\n').filter(l => /Tourbook 0|update/i.test(l)).join(' / '));
      await page.locator('#se-about button', { hasText: 'Restart to update' }).click(); await sleep(100);
      ok('…Restart to update asks the desktop app to install it', (await page.evaluate(() => window.__calls)).includes('install'));
      await page.evaluate(() => window.__push({ status: 'available', version: '0.1.0', available: '0.2.0', progress: 0, url: '', error: '' })); await sleep(100);
      ok('…an unsigned Mac’s “available” offers the download page, through the bridge', /Tourbook 0\.2\.0 is ready to download\./.test(await about.innerText()) && (await page.locator('#se-about button', { hasText: 'Download the new version' }).count()) === 1);
      await page.locator('#se-about button', { hasText: 'Download the new version' }).click(); await sleep(100);
      await page.locator('#se-about button', { hasText: 'Check for updates' }).click(); await sleep(150);
      ok('…and Check for updates asks the bridge too', JSON.stringify(await page.evaluate(() => window.__calls)) === JSON.stringify(['install', 'open', 'check']));
      await page.evaluate(() => window.__push({ status: 'dev', version: '0.1.0', available: null, progress: 0, url: '', error: '' })); await sleep(100);
      ok('…a development copy says so, with nothing to check', /A development copy: updates are only looked for in the installed app\./.test(await about.innerText()) && !(await page.locator('#se-about button', { hasText: 'Check for updates' }).count()));
      await page.evaluate(() => { window.__calls.length = 0; window.__push({ status: 'error', version: '0.1.0', available: null, progress: 0, url: '', error: 'net::ERR_NAME_NOT_RESOLVED' }); }); await sleep(100);
      const errText = await about.innerText();
      await page.locator('#se-about button', { hasText: 'Open the download page' }).click(); await sleep(100);
      ok('…a failed check says so in plain words (no error code), and offers the download page through the bridge', /Couldn’t look for a new version just now\. Check the internet connection/.test(errText) && !/net::|ERR_/.test(errText) && !/Download the new version/.test(errText) && JSON.stringify(await page.evaluate(() => window.__calls)) === '["open"]', errText.split('\n').filter(l => /version|download/i.test(l)).join(' / '));
      await page.evaluate(() => window.__push({ status: 'downloading', version: '0.1.0', available: '0.2.0', progress: 42.4, url: '', error: '' })); await sleep(100);
    }
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    ok(`Settings → About in the desktop app at ${label}: no sideways scrolling`, fits);
    await about.scrollIntoViewIfNeeded();
    await about.screenshot({ path: `${OUT}/86-about-desktop-${label}.png` });
    ok(`no errors in the console (${label})`, errs.length === 0, errs.join(' | '));
    await b.close();
  }
})().catch(e => { console.error('TEST CRASHED', e); process.exit(1); });
