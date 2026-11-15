#!/usr/bin/env node
// Copies only the files the public website needs into a folder for publishing, never the desktop app, the licence
// server, the tools (the licence generator among them), the docs, the tests or any key file.
//   node tools/stage-site.mjs <folder>                      → a plain copy (to look at, or to check)
//   node tools/stage-site.mjs cloudflare/site --cloudflare  → the tourbook.crowmade.app copy, plus the _headers and
//                                                            _redirects files Cloudflare reads
// With --cloudflare, each page's Content-Security-Policy header is copied from that page's own <meta> tag, so the two
// can never drift apart; frame-ancestors is added because it only works as a header. Run after tools/stamp-build.mjs,
// so the copied js/version.js and sw.js carry this build. The folder must be inside the repository (cloudflare/site
// is ignored by git).
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, ROOT_FILES, DIRS, WORKER_ROUTES } from './site-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [dest, flag] = process.argv.slice(2);
if (!dest) { console.error('Usage: node tools/stage-site.mjs <folder> [--cloudflare]'); process.exit(2); }
const out = path.resolve(root, dest);
if (out === root || !out.startsWith(root + path.sep)) { console.error('The folder must be inside the repository, and not the repository itself'); process.exit(2); }
// The folder is emptied first, so only a new or empty folder, or an earlier copy made by this script, is used: never
// one of the repository's own (a slip such as "cloudflare" for "cloudflare/site" would delete the licence server).
if (existsSync(out) && readdirSync(out).length && !(existsSync(path.join(out, 'index.html')) && existsSync(path.join(out, 'sw.js')) && !existsSync(path.join(out, '.git')))) {
  console.error(`${path.relative(root, out)} already holds files that are not an earlier staged copy: name a new folder (cloudflare/site for Cloudflare)`); process.exit(2);
}
const FILES = [...PAGES, ...ROOT_FILES, 'sw.js'];
// A page at the top of the repository that is not in tools/site-files.mjs would silently never be published.
const unlisted = readdirSync(root).filter(f => f.endsWith('.html') && !PAGES.includes(f));
if (unlisted.length) { console.error('Pages not in tools/site-files.mjs (add them to PAGES): ' + unlisted.join(', ')); process.exit(1); }

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of FILES) cpSync(path.join(root, f), path.join(out, f));
for (const d of DIRS) cpSync(path.join(root, d), path.join(out, d), { recursive: true }); // each must exist: a missing one is an error
// Everything the offline copy (the service worker's file list) asks for must be published, or installing it fails.
const shell = [...readFileSync(path.join(out, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');
const missing = shell.filter(f => !existsSync(path.join(out, f)));
if (missing.length) { console.error('The offline file list names files that are not published: ' + missing.join(', ')); process.exit(1); }
// Every local file a page or the manifest points at must be published too.
const refs = [...PAGES.flatMap(p => [...readFileSync(path.join(out, p), 'utf8').matchAll(/(?:href|src)="([^"#?]+)/g)].map(m => [p, m[1]])),
  ...JSON.parse(readFileSync(path.join(out, 'manifest.webmanifest'), 'utf8')).icons.map(i => ['manifest.webmanifest', i.src])];
const workerRoute = u => WORKER_ROUTES.some(r => (r.endsWith('/*') ? u.startsWith(r.slice(0, -1)) : u === r)); // answered by cloudflare/worker.mjs
const broken = refs.filter(([, u]) => !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u) && u !== './' && !workerRoute(u) && !existsSync(path.join(out, u.replace(/^\.\//, ''))));
if (broken.length) { console.error('Links to files that are not published: ' + broken.map(([p, u]) => `${p} → ${u}`).join(', ')); process.exit(1); }

if (flag === '--cloudflare') {
  const csp = file => {
    const m = readFileSync(path.join(root, file), 'utf8').match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
    if (!m) throw new Error(`${file} has no Content-Security-Policy meta tag`);
    return `${m[1].trim().replace(/;$/, '')}; frame-ancestors 'none'`;
  };
  const rule = (p, headers) => `${p}\n${Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`;
  // no-transform: Cloudflare's Web Analytics, switched on for the whole crowmade.app zone, adds its beacon script to every
  // HTML page it passes; each page's policy blocks it (nothing is sent), but the browser logs an error for it. Cloudflare
  // leaves a no-transform page as it is (developers.cloudflare.com/web-analytics/faq/), so Tourbook's pages arrive as
  // published, and Vdex's and crowmade.app's analytics are untouched. It also stops Cloudflare compressing these pages
  // (the start page is about 4 KB instead of 1.5; the terms 47 instead of 16); scripts and styles stay compressed.
  const page = file => ({ 'Content-Security-Policy': csp(file), 'Cache-Control': 'no-cache, no-transform' });
  const headers = [
    '# Generated by tools/stage-site.mjs. A header named twice for one path is joined with a comma, so each',
    '# path gets its Content-Security-Policy from exactly one rule.',
    '',
    rule('/*', { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' }),
    rule('/', page('index.html')),
    ...PAGES.map(f => rule('/' + f, page(f))),
    rule('/sw.js', { 'Cache-Control': 'no-cache' }),
    rule('/manifest.webmanifest', { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' }),
  ].join('\n');
  for (const line of headers.split('\n')) if (line.length > 2000) throw new Error('A _headers line is over Cloudflare\'s 2,000-character limit');
  writeFileSync(path.join(out, '_headers'), headers);
  // "/" shows index.html itself rather than redirecting, so the service worker's "./" and "index.html" are both plain 200s.
  writeFileSync(path.join(out, '_redirects'), '/ /index.html 200\n');
}
console.log(`Staged ${FILES.length} files and ${DIRS.length} folders into ${path.relative(root, out)}${flag === '--cloudflare' ? ' with _headers and _redirects' : ''}`);
