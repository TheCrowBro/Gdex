// Keeps package.json's version (the one the desktop installers and their update files carry) equal to VERSION in
// js/version.js, the web app's. Run by `npm start` and `npm run dist`. Idempotent, and silent when nothing changes.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');
const m = /VERSION\s*=\s*'([^']+)'/.exec(src);
if (!m) throw new Error('VERSION not found in js/version.js');
const file = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(file, 'utf8'));
if (pkg.version !== m[1]) {
  pkg.version = m[1];
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  console.log('package.json version set to ' + m[1]);
}
