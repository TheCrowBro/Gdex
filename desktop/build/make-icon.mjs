// Draws desktop/build/icon.png, the 1024×1024 icon electron-builder makes the Windows, Mac and Linux icons from, out of
// icons/icon.svg (the website's icon), with Playwright's Chromium: no other package needed. Run it after changing the
// SVG: node desktop/build/make-icon.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const svg = readFileSync(fileURLToPath(new URL('../../icons/icon.svg', import.meta.url)), 'utf8');
const out = fileURLToPath(new URL('./icon.png', import.meta.url));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:1024px;height:1024px}</style>${svg}`);
  await page.locator('svg').screenshot({ path: out, omitBackground: true });
  console.log('Wrote ' + out);
} finally {
  await browser.close();
}
