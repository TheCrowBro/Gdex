export const VERSION = '0.1.0';
export const BUILD = 'dev'; // stamped with the commit on deploy (tools/stamp-build.mjs)
export const BUILT = '';    // stamped with the deploy date
// Where the web app and its share pages (invoice.html, daysheet.html) live once published. While SITE is empty, links
// are built from the address the app is opened at (see shareBase below), so they work wherever Tourbook is served.
export const SITE = '';
// Tourbook's public website. The desktop app serves the same files at http://localhost:47861 (desktop/main.cjs), an
// address only the sender's computer knows, so links it shares, and the address a day sheet's calendar entry points
// at, use this instead.
export const PUBLIC_SITE = 'https://tourbook.crowmade.app/';
// Inside the desktop app: its bridge, or one of its local addresses (a window it opened without the bridge).
const desktopApp = () => !!window.tourbookDesktop || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && Number(location.port) >= 47861 && Number(location.port) <= 47880);
export const shareBase = () => SITE || (desktopApp() || !location.protocol.startsWith('http') ? PUBLIC_SITE : new URL('./', location.href).href);
// This page's own address as someone else can open it: the desktop app's local address becomes the website's.
export const publicHref = () => (desktopApp() ? new URL(location.pathname.replace(/^\/+/, '') + location.search + location.hash, PUBLIC_SITE).href : location.href);
