// Gdex's own website files, in one place: tools/stamp-build.mjs builds the offline (service worker) list from them.
// A new page goes in PAGES. Paths are relative to the repository root.
export const PAGES = ['index.html', 'invoice.html', 'daysheet.html', 'privacy.html', 'terms.html', 'download.html'];
export const WORKER_ROUTES = ['/buy', '/licence/*']; // answered by cloudflare/worker.mjs
export const ROOT_FILES = ['styles.css', 'manifest.webmanifest'];
export const DIRS = ['js', 'css', 'vendor', 'icons'];
