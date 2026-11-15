// What gets published to tourbook.crowmade.app (the build spec §6.3): tools/stage-site.mjs, run in a throw-away copy of the
// repository (with a planted key file and ledger), copies every page and every file of the offline list and nothing
// else (no desktop app, licence server, tools, docs, tests, key file or package file); the release stamp changes only
// the build (the repository keeps the dev stamp, and --dev puts it back exactly); the Cloudflare copy's headers
// carry each page's own policy; the addresses the Worker answers agree everywhere; and the publish workflow runs only by
// hand, in the owner's protected Environment, after its guard, which refuses any Worker but Tourbook's (tried here on
// tampered copies). Node only: nothing is published and nothing reaches the network.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
const REPO = path.resolve(__dirname, '../..');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const metaCsp = html => (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tourbook-publish-'));
  try {
    // A copy of the whole repository (desktop/, cloudflare/, docs/, tests/ and tools/ included, never .git or any
    // node_modules), with a key file and a ledger left lying at its top, as an owner's could be by mistake.
    const root = path.join(tmp, 'repo');
    fs.cpSync(REPO, root, { recursive: true, filter: src => !/(^|[\\/])(\.git|node_modules|output|site|dist)$/.test(path.relative(REPO, src)) || src === REPO });
    fs.writeFileSync(path.join(root, 'tourbook-licence-key-1.json'), '{"type":"tourbook-licence-signing-key"}');
    fs.writeFileSync(path.join(root, 'tourbook-ledger.csv'), 'issued,ref,type,name,email,expires,seats,note,code\n');
    const stage = (dest, ...args) => execFileSync(process.execPath, [path.join(root, 'tools/stage-site.mjs'), dest, ...args], { cwd: root, stdio: 'pipe' }).toString();
    const refusal = (...args) => { try { stage(...args); return ''; } catch (e) { return String(e.stderr); } };
    const { PAGES, WORKER_ROUTES } = await import(pathToFileURL(path.join(root, 'tools/site-files.mjs')).href);
    const read = f => fs.readFileSync(path.join(root, f), 'utf8');

    /* ---------------------------- the staged site ---------------------------- */
    stage('stage-test');
    const out = path.join(root, 'stage-test');
    const files = walk(out).map(f => path.relative(out, f).split(path.sep).join('/'));
    const tops = [...new Set(files.map(f => f.split('/')[0]))].sort();
    ok('every page in PAGES is published', PAGES.every(p => files.includes(p)), PAGES.filter(p => !files.includes(p)).join(', '));
    ok('only the website: the pages, styles, manifest, service worker, js, css, vendor and icons', JSON.stringify(tops) === JSON.stringify([...PAGES, 'css', 'icons', 'js', 'manifest.webmanifest', 'styles.css', 'sw.js', 'vendor'].sort()), tops.join(', '));
    const stray = files.filter(f => /^(desktop|cloudflare|tools|docs|tests|\.github)\//.test(f) || /licence-(generator|key-|codes)|ledger|package(-lock)?\.json$|wrangler|worker\.mjs$/.test(f) || (/\.md$/.test(f) && f !== 'vendor/LICENSES.md'));
    ok('nothing from desktop/, cloudflare/, tools/, docs/ or tests/, no key file, no ledger, no package file', stray.length === 0, stray.join(', '));
    const shell = [...read('sw.js').match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');
    ok('every file in the offline list (sw.js) is published', shell.length > 50 && shell.every(f => files.includes(f)), shell.filter(f => !files.includes(f)).join(', '));
    ok('the plain copy has no _headers or _redirects', !files.includes('_headers') && !files.includes('_redirects'));
    fs.rmSync(out, { recursive: true, force: true });

    /* ---------------------------- the release stamp ---------------------------- */
    // The repository keeps the dev stamp (CI's tests workflow fails on any other); the publish stamps the build it
    // publishes, after the tests (tools/stamp-build.mjs without --dev), so installed copies update. The release stamp
    // changes only the build in js/version.js (BUILD, BUILT) and in sw.js (and so its cache name), never the offline list,
    // and --dev puts the repository's bytes back exactly (after a publish from the owner's own computer, docs/go-live.md).
    {
      const before = { v: read('js/version.js'), sw: read('sw.js') };
      const stamp = (...args) => execFileSync(process.execPath, [path.join(root, 'tools/stamp-build.mjs'), ...args], { cwd: root, stdio: 'pipe', env: { ...process.env, BUILD_SHA: 'abcdef0123456789abcdef0123456789abcdef01' } }).toString();
      const shellOf = t => t.match(/const SHELL = \[([\s\S]*?)\];/)[1];
      const changed = (a, b) => a.split('\n').filter((l, i) => l !== b.split('\n')[i]);
      ok('the repository holds the dev stamp: BUILD \'dev\', no BUILT, cache tourbook-dev', /export const BUILD = 'dev';/.test(before.v) && /export const BUILT = '';/.test(before.v) && /^const BUILD = 'dev';/m.test(before.sw) && /const CACHE = 'tourbook-' \+ BUILD;/.test(before.sw));
      const dayBefore = new Date().toISOString().slice(0, 10);
      stamp();
      const rel = { v: read('js/version.js'), sw: read('sw.js') }, days = [dayBefore, new Date().toISOString().slice(0, 10)]; // either, at midnight
      ok('the release stamp writes the commit\'s first 7 characters and the day into js/version.js and sw.js, and nothing else', /export const BUILD = 'abcdef0';/.test(rel.v) && days.some(day => rel.v.includes(`export const BUILT = '${day}';`)) && /^const BUILD = 'abcdef0';/m.test(rel.sw) && changed(rel.v, before.v).length === 2 && changed(rel.sw, before.sw).length === 1 && rel.v.split('\n').length === before.v.split('\n').length && rel.sw.split('\n').length === before.sw.split('\n').length, JSON.stringify([...changed(rel.v, before.v), ...changed(rel.sw, before.sw)]));
      ok('…the offline list is the same as the dev stamp\'s', shellOf(rel.sw) === shellOf(before.sw));
      stage('stage-test');
      ok('…and the staged site carries that build', /^const BUILD = 'abcdef0';/m.test(fs.readFileSync(path.join(root, 'stage-test/sw.js'), 'utf8')) && /export const BUILD = 'abcdef0';/.test(fs.readFileSync(path.join(root, 'stage-test/js/version.js'), 'utf8')));
      fs.rmSync(path.join(root, 'stage-test'), { recursive: true, force: true });
      stamp('--dev');
      ok('the dev stamp puts the repository back exactly, so CI\'s check of the offline list passes again', read('js/version.js') === before.v && read('sw.js') === before.sw);
    }

    /* ------------------------ what stops a publish ------------------------ */
    fs.writeFileSync(path.join(root, 'stray.html'), '<!doctype html>');
    const r1 = refusal('stage-test'); fs.rmSync(path.join(root, 'stray.html'));
    ok('a new page left out of tools/site-files.mjs stops the publish instead of silently missing', /not in tools\/site-files\.mjs/.test(r1), r1.trim().slice(0, 120));
    const priv = read('privacy.html'); fs.writeFileSync(path.join(root, 'privacy.html'), priv.replace('</body>', '<a href="docs/nowhere.md">x</a></body>'));
    const r2 = refusal('stage-test'); fs.writeFileSync(path.join(root, 'privacy.html'), priv);
    ok('a page linking to a file that is not published stops the publish', /privacy\.html → docs\/nowhere\.md/.test(r2), r2.trim().slice(0, 120));
    const sw = read('sw.js'); fs.writeFileSync(path.join(root, 'sw.js'), sw.replace("const SHELL = [\n", "const SHELL = [\n  'js/not-here.js', "));
    const r3 = refusal('stage-test'); fs.writeFileSync(path.join(root, 'sw.js'), sw);
    ok('an offline list naming a file that is not published stops the publish', /js\/not-here\.js/.test(r3), r3.trim().slice(0, 120));
    ok('it stages only inside the repository', /must be inside the repository/.test(refusal(path.join(tmp, 'outside'))) && /must be inside the repository/.test(refusal('.')));
    const before = ['cloudflare', 'js', 'docs'].map(d => walk(path.join(root, d)).length);
    const slips = ['cloudflare', 'js', 'docs'].map(d => refusal(d));
    ok('it never empties one of the repository\'s own folders (a slip such as "cloudflare" for "cloudflare/site")', slips.every(r => /not an earlier staged copy/.test(r)) && JSON.stringify(['cloudflare', 'js', 'docs'].map(d => walk(path.join(root, d)).length)) === JSON.stringify(before) && fs.existsSync(path.join(root, 'cloudflare/worker.mjs')), slips.map(r => r.trim().slice(0, 60)).join(' | '));
    stage('stage-test'); stage('stage-test');
    ok('…while an earlier staged copy is replaced', fs.existsSync(path.join(root, 'stage-test/sw.js')));
    fs.rmSync(path.join(root, 'stage-test'), { recursive: true, force: true });

    /* --------------------------- the Cloudflare copy --------------------------- */
    stage('cloudflare/site', '--cloudflare');
    const cf = path.join(root, 'cloudflare/site');
    const headers = fs.readFileSync(path.join(cf, '_headers'), 'utf8'), redirects = fs.readFileSync(path.join(cf, '_redirects'), 'utf8');
    const block = p => headers.split(/\n(?=\S)/).find(b => b.split('\n')[0] === p) || '';
    const mismatched = PAGES.filter(f => { const meta = metaCsp(read(f)); return !meta || !block('/' + f).includes(`Content-Security-Policy: ${meta.trim().replace(/;$/, '')}; frame-ancestors 'none'`); });
    ok('each page\'s Content-Security-Policy header is its own meta tag\'s, plus frame-ancestors', mismatched.length === 0, mismatched.join(', '));
    ok('"/" gets the start page\'s policy; pages, the service worker and the manifest are never cached stale', block('/').includes(`Content-Security-Policy: ${metaCsp(read('index.html')).trim().replace(/;$/, '')}; frame-ancestors 'none'`) && /Cache-Control: no-cache/.test(block('/sw.js')) && /no-cache/.test(block('/manifest.webmanifest')) && /application\/manifest\+json/.test(block('/manifest.webmanifest')) && PAGES.every(f => /Cache-Control: no-cache/.test(block('/' + f))));
    // Cloudflare's zone-wide Web Analytics adds its beacon to HTML unless the page says no-transform (tools/stage-site.mjs).
    const unmarked = ['/', ...PAGES.map(f => '/' + f)].filter(p => !/^ {2}Cache-Control: no-cache, no-transform$/m.test(block(p)));
    ok('"/" and every page are no-cache, no-transform, so Cloudflare adds no analytics script to them', unmarked.length === 0, unmarked.join(', '));
    ok('every address is nosniff, and "/" shows index.html instead of redirecting', /X-Content-Type-Options: nosniff/.test(block('/*')) && redirects.trim() === '/ /index.html 200');
    ok('no _headers line is over Cloudflare\'s 2,000-character limit', headers.split('\n').every(l => l.length <= 2000));
    const cfFiles = walk(cf).map(f => path.relative(cf, f).split(path.sep).join('/'));
    ok('the Cloudflare copy holds the same files, plus _headers and _redirects only', JSON.stringify(cfFiles.filter(f => !/^_(headers|redirects)$/.test(f)).sort()) === JSON.stringify(files.sort()));

    /* ------------------- the addresses the Worker answers ------------------- */
    const wr = JSON.parse(read('cloudflare/wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
    const swRoutes = JSON.parse(read('sw.js').match(/const WORKER_ROUTES = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
    ok('WORKER_ROUTES (tools/site-files.mjs) equals the Worker\'s run_worker_first and the service worker\'s list', JSON.stringify(WORKER_ROUTES) === JSON.stringify(wr.assets.run_worker_first) && JSON.stringify(swRoutes) === JSON.stringify(WORKER_ROUTES) && JSON.stringify(WORKER_ROUTES) === JSON.stringify(['/buy', '/licence/*']));
    ok('the Worker serves the staged folder (cloudflare/site, ignored by git)', wr.assets.directory === './site' && /^cloudflare\/site\/$/m.test(fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8')));

    /* --------------------------- the publish workflow --------------------------- */
    const flows = fs.readdirSync(path.join(REPO, '.github/workflows')).filter(f => /\.ya?ml$/.test(f));
    const yml = fs.readFileSync(path.join(REPO, '.github/workflows/publish.yml'), 'utf8');
    const onBlock = (yml.match(/^on:\n((?:[ #].*\n)+)/m) || [])[1] || '';
    ok('it runs only by hand: workflow_dispatch with a required "confirm", never on a push or a schedule', /^  workflow_dispatch:\n/m.test(onBlock) && !/^  (push|pull_request|schedule|workflow_run|release)/m.test(onBlock) && /confirm:\n\s+description: 'Type exactly: publish tourbook'\n\s+required: true/.test(yml));
    const job = (yml.split('\n  publish:\n')[1] || '');
    ok('the publishing job runs only on main, only with "publish tourbook", in the owner\'s protected Environment tourbook-live', /^    if: github\.ref == 'refs\/heads\/main' && inputs\.confirm == 'publish tourbook'$/m.test(job) && /^    environment: tourbook-live$/m.test(job) && /^permissions:\n  contents: read$/m.test(yml));
    ok('its secrets come from that Environment, and only the deploy step sees them', (yml.match(/secrets\./g) || []).length === 2 && /Deploy the Worker tourbook[^\n]*\n\s+working-directory: cloudflare\n\s+run: npx wrangler deploy --config wrangler\.jsonc\n\s+env:\n\s+CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}\n\s+CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/.test(yml));
    const order = ['npm ci --prefix cloudflare', 'npm test', 'TOURBOOK_LICENCE=on npm test', 'node tools/stamp-build.mjs', 'node -e "$GUARD"', 'node tools/stage-site.mjs cloudflare/site --cloudflare', 'npx wrangler deploy --config wrangler.jsonc', '/licence/activate'];
    const at = order.map(s => job.indexOf(s));
    ok('the steps: Wrangler, both test legs, the stamp, the guard, the staged site, the deploy, then live checks', at.every((n, i) => n > 0 && (i === 0 || n > at[i - 1])), order.filter((s, i) => !(at[i] > 0 && (i === 0 || at[i] > at[i - 1]))).join(', '));
    const actionsPinned = [...yml.matchAll(/uses: ([^\s]+)/g)].every(m => /@[0-9a-f]{40}$/.test(m[1]));
    ok('every action is pinned by commit', actionsPinned);
    const wranglerUses = flows.flatMap(f => [...fs.readFileSync(path.join(REPO, '.github/workflows', f), 'utf8').matchAll(/wrangler(?:-action)?\b[^\n]*/g)].map(m => `${f}: ${m[0]}`)).filter(l => !/^[^:]+: wrangler\.jsonc/.test(l) && !/cloudflare\/wrangler\.jsonc/.test(l));
    const commands = wranglerUses.filter(l => /wrangler (?!deploy\b)[a-z]/.test(l) || /wrangler-action/.test(l));
    ok('`wrangler deploy` is the only Wrangler command in any workflow (no delete, kv, r2 or secret)', commands.length === 0 && flows.every(f => !/wrangler\s+(delete|kv|r2|secret)/.test(fs.readFileSync(path.join(REPO, '.github/workflows', f), 'utf8'))) && (yml.match(/npx wrangler deploy/g) || []).length === 1, commands.join(' | '));
    const others = flows.filter(f => f !== 'publish.yml' && /CLOUDFLARE_API_TOKEN|environment: tourbook-live/.test(fs.readFileSync(path.join(REPO, '.github/workflows', f), 'utf8')));
    ok('no other workflow can publish (none uses the Cloudflare token or the Environment)', others.length === 0, others.join(', '));
    // What each key can reach, with the owner's answers (decisions §20 and §21): one Stripe account for Tourbook and Vdex,
    // so the Stripe key reads every order in it, Vdex's buyers' too; the emails from Tourbook <licences@tourbook.crowmade.app>
    // on the same Resend account as Vdex, a second domain on its free plan (3 domains since 25 August 2026, Resend's changelog),
    // and never a key for a domain Vdex sends from, which could send as Vdex. No guide still says a second domain may need a
    // paid plan.
    const guide = fs.readFileSync(path.join(REPO, 'docs/licence-server.md'), 'utf8'), keyTable = (guide.split('## What each key can reach')[1] || '').split('\n## ')[0];
    const part5 = (guide.split('## Part 5.')[1] || '').split('\n## ')[0].replace(/\s+/g, ' '), golive = fs.readFileSync(path.join(REPO, 'docs/go-live.md'), 'utf8');
    const answered = ((golive.split('## Questions for you')[1] || '').split('Still open')[0] || '').replace(/\s+/g, ' '), step5 = ((golive.split('## 5. Resend')[1] || '').split('\n## ')[0] || '').replace(/\s+/g, ' ');
    ok('the key table, Part 5 and go-live say the Stripe key reads every Checkout Session in the one account (Vdex\'s buyers too), and a Resend key on a domain Vdex sends from could send as Vdex', /every Checkout Session in the Stripe account/.test(keyTable) && /Vdex['’]s buyers/.test(keyTable) && /can send email as Vdex/.test(keyTable) && /can send email as Vdex/.test(part5) && /\*\*Stripe:\*\* the same Stripe account as Vdex/.test(answered) && /reads every order in the account, Vdex['’]s buyers/.test(answered), keyTable.split('\n').filter(l => /Stripe|Resend/.test(l)).join(' / ').slice(0, 400));
    ok('…the emails come from Tourbook <licences@tourbook.crowmade.app> (the Worker\'s default), a second domain on the same Resend account as Vdex on its free plan of 3 domains, no paid plan; replies go to support@crowmade.app, the contact address', /from: env\.MAIL_FROM \|\| 'Tourbook <licences@tourbook\.crowmade\.app>'/.test(read('cloudflare/worker.mjs')) && /Tourbook's emails come from `Tourbook <licences@tourbook\.crowmade\.app>`, a crowmade address/.test(part5) && /3 verified domains since 25 August 2026 \(resend\.com\/changelog\/three-domains-on-the-free-tier/.test(part5) && /no paid plan is needed/.test(part5) && /3 verified domains since August 2026/.test(answered) && /`Tourbook <licences@tourbook\.crowmade\.app>`/.test(answered) && /no paid plan/.test(step5) && /Replies go to support@crowmade\.app \(`REPLY_TO`\), the contact address/.test(answered) && !/may need a paid/.test(guide + golive), part5.slice(0, 300));
    // The licence email's replies: the terms (section 3) tell buyers they can cancel by replying to the email their licence
    // came in, so REPLY_TO is set before the shop opens (go-live step 5, licence-server Part 5 and its table), to the contact
    // address, support@crowmade.app (the owner's answer, 15 November 2026: decisions §23), and 9(b) and Part 7 check a reply
    // reaches it; crowmade.app's mail goes through Cloudflare Email Routing. No guide or worker comment still waits for an answer.
    const terms3 = (read('terms.html').split('id="paid"')[1] || '').split('<h2')[0], step9b = ((golive.split('**(b) The shop.**')[1] || '').split('**(c)')[0] || '').replace(/\s+/g, ' '), part7 = ((guide.split('## Part 7.')[1] || '').split('\n## ')[0] || '').replace(/\s+/g, ' ');
    const worker = read('cloudflare/worker.mjs'), waiting = /until you answer|until (?:it|question \d) is answered|still an open\s+question/;
    ok('…REPLY_TO, the contact address support@crowmade.app (the owner\'s answer), is set before the shop opens, as the terms let buyers reply to the licence email; Part 5 says its mail goes through Cloudflare Email Routing; 9(b) and Part 7 check a reply arrives there; nothing still waits for an answer', /by replying to the email your licence came in/.test(terms3) && /Add `REPLY_TO` before the shop opens \(9\(b\)\): support@crowmade\.app, the contact address/.test(step5) && /Add `REPLY_TO` in Cloudflare before the shop opens: support@crowmade\.app, the contact address/.test(part5) && /Replies go to support@crowmade\.app/.test(part5) && /Cloudflare Email Routing/.test(part5) && /\| `REPLY_TO` \(Secret or Text\) \| `support@crowmade\.app`, the contact address/.test(guide) && /`REPLY_TO` included/.test(step9b) && /a reply to the email reaches the contact address \(support@crowmade\.app\)/.test(step9b) && /a reply to it reaches the contact address, support@crowmade\.app \(`REPLY_TO`/.test(part7) && /support@crowmade\.app, the contact address/.test(worker) && !waiting.test(guide + golive + worker), JSON.stringify({ step5: step5.slice(0, 200), step9b: step9b.slice(0, 200) }));
    // The owner's questions: what is answered (Stripe, Resend, the Audiophile, the lawyer, publishing from GitHub: the owner
    // chose "Like Vdex, from GitHub" on 14 November 2026, decisions §20; the contact address and backup files carrying the
    // free days, 15 November 2026, decisions §23) and the one still open, Code signing, numbered 1.
    const open = (golive.split('Still open')[1] || ''), openItems = [...open.matchAll(/^(\d+)\. \*\*([^*]+)\*\*/gm)].map(m => `${m[1]} ${m[2]}`);
    ok('go-live\'s only question still open is 1 Code signing, not under Answered; the contact address (support@crowmade.app, with REPLY_TO and Email Routing, in the owner\'s words), backup files carrying the free days ("Backups should carry the free days") and publishing from GitHub (the Environment tourbook-live) are answered, as the owner chose', openItems.join(' | ') === '1 Code signing:' && !/contact address|Backup files|REPLY_TO/i.test(open) && !/Code signing:/.test(answered) && /\*\*The contact address:\*\* support@crowmade\.app, the same as Vdex's and crowmade\.app's \(15 November 2026: "Yes for the support email since all of them live on the same site"\)/.test(answered) && /`REPLY_TO`/.test(answered.split('**The contact address:**')[1] || '') && /Email Routing/.test(answered.split('**The contact address:**')[1] || '') && /\*\*Backup files and the free days:\*\* "Backups should carry the free days" \(15 November 2026\)/.test(answered) && /earlier of its own start and the file's/.test(answered) && /While licences are off nothing is written into a file and nothing is taken from one/.test(answered) && !/Where the website is published from/.test(open) && /\*\*Where the website is published from:\*\* GitHub, like Vdex/.test(answered) && /`tourbook-live`/.test(answered) && /Like Vdex, from GitHub/.test(answered) && /\*\*The Audiophile is not for work\*\*/.test(answered) && /\*\*A lawyer:\*\*/.test(answered), openItems.join(' | '));
    const docsAll = ['README.md', 'docs/go-live.md', 'docs/licence-server.md', 'docs/developers.md', 'docs/desktop.md', 'docs/drive.md'].filter(f => fs.existsSync(path.join(REPO, f))).map(f => [f, read(f)]);
    const qRefs = docsAll.flatMap(([f, t]) => [...t.matchAll(/(?:go-live(?:`, |\.md`, | )question|question) (\d)\b/g)].map(m => [f, +m[1], t.slice(Math.max(0, m.index - 120), m.index + 20).replace(/\s+/g, ' ')])).filter(([f, , ctx]) => f !== 'docs/developers.md' || /go-live/.test(ctx));
    const qWant = { 1: /[Cc]ode signing/ };
    ok('every reference to a go-live question names the one still open (1 Code signing); none to the answered ones (2 the contact address, 3 backup files) or to questions that are gone', qRefs.every(([, n, ctx]) => qWant[n] && qWant[n].test(ctx)) && !docsAll.some(([, t]) => /questions 1 and 2|question [2-6]\b|go-live question 1\b/.test(t.replace(/\s+/g, ' ').replace(/the owner's answer to question 6/g, ''))), JSON.stringify(qRefs.filter(([, n, ctx]) => !(qWant[n] && qWant[n].test(ctx)))));
    // The lawyer (decisions §21: "I'll find a lawyer") reads the terms and the privacy policy before licences are switched on:
    // in go-live's step 1 (the launch list and its own section), in 9(d) before (e), and in licence-server Part 6.
    const launch1 = (golive.split('\n2. **You check the address is free.**')[0] || '').split('\n1. **You read the terms')[1] || '', sec1 = ((golive.split('## 1. Read the terms')[1] || '').split('\n## ')[0] || '').replace(/\s+/g, ' ');
    const step9d = ((golive.split('**(d)')[1] || '').split('**(e)')[0] || '').replace(/\s+/g, ' '), part6 = ((guide.split('## Part 6.')[1] || '').split('\n## ')[0] || '').replace(/\s+/g, ' ');
    ok('a lawyer the owner chooses reads the terms before licences go on: go-live step 1 (both places), 9(d) before (e), licence-server Part 6', /a lawyer you choose reads them too/.test(launch1.replace(/\s+/g, ' ')) && /a lawyer you choose reads the terms and the privacy policy/.test(sec1) && /Before this step, a lawyer you choose reads the terms and the privacy policy/.test(step9d) && /have a lawyer you choose read the terms and the privacy policy/.test(part6), JSON.stringify({ launch1: launch1.slice(0, 200), step9d: step9d.slice(-200) }));
    // The workflow runs only on main, and GitHub lists a by-hand workflow under Actions only once its file is on the
    // default branch: the owner's list puts the work there first, and CLAUDE.md says publishing runs from main.
    const live = fs.readFileSync(path.join(REPO, 'docs/go-live.md'), 'utf8'), before9a = (live.split('## 9.')[1] || '').split('**(a)')[0];
    const claude = (fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8').split('## Publishing')[1] || '');
    ok('docs/go-live.md, before 9(a): the developer merges the finished work into main and pushes it, with the owner\'s go-ahead, so Actions shows Publish Tourbook; CLAUDE.md says publishing runs from main', /\*\*\(0\) The work on `main`\.\*\* The developer merges the finished work into `main` and pushes it, with your go-ahead\./.test(before9a) && /only once its file \(`\.github\/workflows\/publish\.yml`\) is on the repository’s default branch, which must be\s+`main`/.test(before9a) && /Publishing runs from `main` only/.test(claude), before9a.trim().slice(0, 300));
    // This launch (decisions §18: the licence off, no Google Drive, no desktop app) opens docs/go-live.md: the names the
    // first publish makes are Tourbook's own and the same as the configuration's (the KV store is named by Wrangler after the
    // Worker and its binding, as it does when the configuration gives no id), the address is checked free first, and the
    // steps say how to undo it.
    const launch = (live.split('## Put the website live')[1] || '').split('\n## ')[0], wrc = JSON.parse(read('cloudflare/wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
    const kvName = `${wrc.name}-${wrc.kv_namespaces[0].binding.toLowerCase().replace(/_/g, '-')}`;
    ok('docs/go-live.md opens with putting the website live: the Worker tourbook at tourbook.crowmade.app, its KV store tourbook-licences and SignInCodes (the configuration\'s own names), the address checked free first, Rollback and Remove to undo it', live.indexOf('## Put the website live') < live.indexOf('## 1.') && kvName === 'tourbook-licences' && launch.includes('**`' + kvName + '`**') && launch.includes('**`' + wrc.name + '`**') && launch.includes('**tourbook.crowmade.app**') && launch.includes('**`' + wrc.durable_objects.bindings[0].class_name + '`**') && /no record named `tourbook`/.test(launch) && /Rollback/.test(launch) && /Domains & Routes/.test(launch) && /npx wrangler deploy --config wrangler\.jsonc/.test(launch), kvName);

    /* ------------------------------ the guard ------------------------------ */
    const lines = yml.split('\n'), g = lines.findIndex(l => /^\s+GUARD: \|$/.test(l)), indent = (lines[g + 1] || '').match(/^\s*/)[0];
    const guard = []; for (let i = g + 1; i < lines.length && (lines[i].startsWith(indent) || !lines[i].trim()); i++) guard.push(lines[i].slice(indent.length));
    const guardFile = path.join(tmp, 'guard.cjs'); fs.writeFileSync(guardFile, guard.join('\n'));
    const files0 = { wr: read('cloudflare/wrangler.jsonc'), cfg: read('js/licence-config.js'), keys: read('desktop/licence-keys.json'), web: read('js/licence-keys.js') };
    const tryGuard = (change = {}) => {
      fs.writeFileSync(path.join(root, 'cloudflare/wrangler.jsonc'), change.wr ? change.wr(files0.wr) : files0.wr);
      fs.writeFileSync(path.join(root, 'js/licence-config.js'), change.cfg || files0.cfg);
      fs.writeFileSync(path.join(root, 'desktop/licence-keys.json'), change.keys || files0.keys);
      fs.writeFileSync(path.join(root, 'js/licence-keys.js'), change.web || files0.web);
      try { return { ok: true, out: execFileSync(process.execPath, [guardFile], { cwd: root, stdio: 'pipe' }).toString() }; } catch (e) { return { ok: false, out: String(e.stderr) }; }
    };
    ok('the guard passes Tourbook\'s own configuration as it is in the repository', g > 0 && tryGuard().ok, tryGuard().out.trim());
    const tampered = [
      ['a Worker named vdex', /not "tourbook"/, { wr: t => t.replace('"name": "tourbook"', '"name": "vdex"') }],
      ['Vdex\'s address as the route', /only route/, { wr: t => t.replace('"pattern": "tourbook.crowmade.app"', '"pattern": "vdex.crowmade.app"') }],
      ['a second route', /only route/, { wr: t => t.replace('"routes": [{ "pattern": "tourbook.crowmade.app", "custom_domain": true }]', '"routes": [{ "pattern": "tourbook.crowmade.app", "custom_domain": true }, { "pattern": "crowmade.app/*", "zone_name": "crowmade.app" }]') }],
      ['a workers.dev address', /workers_dev/, { wr: t => t.replace('"workers_dev": false', '"workers_dev": true') }],
      ['an "env" of its own', /"env" of its own/, { wr: t => t.replace('"main": "worker.mjs",', '"main": "worker.mjs", "env": { "x": { "name": "vdex" } },') }],
      ['someone else\'s storage by id', /only storage is LICENCES/, { wr: t => t.replace('[{ "binding": "LICENCES" }]', '[{ "binding": "LICENCES", "id": "0123456789abcdef" }]') }],
      ['a binding to another Worker (Vdex\'s)', /may not add services/, { wr: t => t.replace('"main": "worker.mjs",', '"main": "worker.mjs", "services": [{ "binding": "V", "service": "vdex" }],') }],
      ['someone else\'s bucket', /may not add r2_buckets/, { wr: t => t.replace('"main": "worker.mjs",', '"main": "worker.mjs", "r2_buckets": [{ "binding": "B", "bucket_name": "vdex-downloads" }],') }],
      ['another Worker\'s Durable Object (Vdex\'s)', /only Durable Object/, { wr: t => t.replace('"class_name": "SignInCodes" }', '"class_name": "SignInCodes", "script_name": "vdex" }') }],
      ['a migration that deletes the sign-in codes', /only Durable Object/, { wr: t => t.replace('"new_sqlite_classes": ["SignInCodes"] }]', '"new_sqlite_classes": ["SignInCodes"] }, { "tag": "v2", "deleted_classes": ["SignInCodes"] }]') }],
      ['the whole repository as the website\'s files', /staged website/, { wr: t => t.replace('"directory": "./site"', '"directory": ".."') }],
      ['a script of its own', /cloudflare\/worker\.mjs/, { wr: t => t.replace('"main": "worker.mjs"', '"main": "other.mjs"') }],
      ['licences live with no keys built in', /no shop key/, { cfg: "export const LICENCE_SITES = ['tourbook.crowmade.app'];\n" }],
      ['licences live with the web copy of the keys out of date', /differs from desktop\/licence-keys\.json/, { cfg: "export const LICENCE_SITES = ['tourbook.crowmade.app'];\n", keys: '{"1":"a","2":"b","9":"c"}', web: '// x\nexport const LICENCE_KEYS = {};\n' }],
    ];
    // Wrangler takes wrangler.json before wrangler.jsonc, from its folder or any folder above it, and follows a
    // .wrangler/deploy/config.json: a planted one would be deployed instead of the file the guard reads.
    for (const [what, f, body] of [['a wrangler.json at the top of the repository (Wrangler would deploy it instead)', 'wrangler.json', '{ "name": "vdex", "main": "cloudflare/worker.mjs" }'],
      ['a wrangler.toml beside the guarded file', 'cloudflare/wrangler.toml', 'name = "vdex"\n'], ['a redirect to another configuration', 'cloudflare/.wrangler/deploy/config.json', '{ "configPath": "../../../wrangler.json" }']]) {
      tampered.push([what, /Only cloudflare\/wrangler\.jsonc may configure Wrangler/, { plant: [f, body] }]);
    }
    const missed = tampered.filter(([, why, change]) => {
      const planted = change.plant && path.join(root, change.plant[0]);
      if (planted) { fs.mkdirSync(path.dirname(planted), { recursive: true }); fs.writeFileSync(planted, change.plant[1]); }
      const r = tryGuard(change);
      if (planted) fs.rmSync(planted);
      return r.ok || !why.test(r.out) || !/Nothing was published/.test(r.out);
    }).map(([what]) => what);
    ok('the guard refuses, each for its own reason, every configuration that is not Tourbook\'s own, and live licences without the keys', missed.length === 0, missed.join(', '));
    ok('…and passes live licences once the keys are in both places', tryGuard({ cfg: "export const LICENCE_SITES = ['tourbook.crowmade.app'];\n", keys: '{"1":"a","2":"b","9":"c"}', web: '// Generated\nexport const LICENCE_KEYS = {"1":"a","2":"b","9":"c"};\n' }).ok);
    tryGuard();
  } catch (e) {
    console.log('FAIL spec crashed — ' + (e && (e.stderr ? String(e.stderr) : e.stack) || e));
    process.exitCode = 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
