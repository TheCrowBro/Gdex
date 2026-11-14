// Shared bits for the browser specs: a static server serving a scratch copy of Tourbook (specs may rewrite files), and
// the PASS / FAIL convention the runner counts. The scratch copy leaves out what is not the website: the tests, the
// docs, the licence server (cloudflare/), the desktop app (desktop/), its builds (dist/) and every node_modules.
import { createServer } from 'node:http';
import { createReadStream, statSync, mkdtempSync, cpSync, readdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown', '.txt': 'text/plain' };
export function scratchCopy(appRoot) {
  const dir = mkdtempSync(join(tmpdir(), 'tourbook-test-'));
  for (const n of readdirSync(appRoot)) if (!['node_modules', 'tests', 'docs', '.git', '.github', '.claude', 'cloudflare', 'desktop', 'dist'].includes(n)) cpSync(join(appRoot, n), join(dir, n), { recursive: true, filter: src => !/(^|[\\/])node_modules$/.test(src) });
  return dir;
}
// The desktop app's own ports: a page there without the desktop app's bridge is "the desktop's files in a web browser"
// to js/licence-state.js, so the test server never takes one unless a spec asks for it by number.
const DESKTOP_PORTS = [47861, 47880];
const onDesktopPort = n => n >= DESKTOP_PORTS[0] && n <= DESKTOP_PORTS[1];
export function serve(root, port = 0) {
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    // The live site's Worker answers these (cloudflare/worker.mjs). Here licences are off, as until the owner switches
    // them on; TOURBOOK_LICENCE=on runs every spec with them live on this host, inside the free days (the build spec [S-34]).
    const on = process.env.TOURBOOK_LICENCE === 'on';
    if (on && p === '/js/licence-config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end("export const LICENCE_SITES = ['localhost', '127.0.0.1'];\n"); }
    // No Date header on these: the licence takes a JSON answer's Date as the real time and puts a wrong device clock
    // right with it (the build spec [S-38]), and specs set the page's clock where they need it (43-ask's is years on).
    if (p.startsWith('/licence/')) res.sendDate = false;
    if (p === '/licence/web/status') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ on })); }
    if (p === '/licence/price') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"price":"20.00","currency":"USD","country":"","taxed":null}'); }
    const file = resolve(root, '.' + p); if (!file.startsWith(resolve(root))) { res.writeHead(403); return res.end(); }
    try { if (!statSync(file).isFile()) throw new Error('dir'); } catch { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(res);
  });
  const listen = () => new Promise((r, j) => { server.once('error', j); server.listen(port, '127.0.0.1', () => { server.off('error', j); r(); }); });
  const close = () => new Promise(r => server.close(() => r()));
  return (async () => {
    await listen();
    // Asked for any port and handed one of the desktop app's: close and listen again (the OS may hand out any port in
    // 32768-60999, these included). A port asked for by number is kept.
    for (let tries = 0; port === 0 && onDesktopPort(server.address().port) && tries < 20; tries++) { await close(); await listen(); }
    return server;
  })();
}
