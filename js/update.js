// Keeps the app current. The service worker is registered here; when a new build has been deployed (every push
// to the site stamps one), the new worker installs in the background and a bar offers to reload. Checks happen on
// start, when the app comes back to the front, when the network returns, and every hour. The desktop app has no
// service worker: its files come inside the installer, and its own updater (desktop/updater.cjs) is reached through
// window.gdexDesktop, whose state { status, version, available, progress, url, error } the About panel follows.
import { h, announce } from './util.js';
import { VERSION, BUILD, BUILT } from './version.js';

const S = { reg: null, ready: false, last: 0, bar: null, desktop: null, listeners: new Set() };
// The desktop app's update bridge, when Gdex runs there.
export const desktop = () => (window.gdexDesktop && typeof window.gdexDesktop.onStatus === 'function' ? window.gdexDesktop : null);
export const onChange = fn => { S.listeners.add(fn); return () => S.listeners.delete(fn); };
const emit = () => S.listeners.forEach(f => { try { f(); } catch { /* ignore */ } });
export const updateState = () => ({ version: VERSION, build: BUILD, built: BUILT, ready: S.ready, supported: !!S.reg, lastCheck: S.last, desktop: S.desktop });

export function reloadNow() {
  if (document.querySelector('.sheet-back form') && !confirm('Reload now? Anything typed in the open form will be lost.')) return;
  location.reload();
}
function showBar() {
  if (S.bar) return;
  S.bar = h('div', { class: 'update-bar', role: 'status' },
    h('span', null, 'Gdex has been updated.'),
    h('button', { class: 'btn primary small', onclick: reloadNow }, 'Reload for the new version'),
    h('button', { class: 'icon-btn', 'aria-label': 'Not now', onclick: () => { S.bar.remove(); S.bar = null; document.body.classList.remove('has-update-bar'); } }, '✕'));
  document.body.append(S.bar); document.body.classList.add('has-update-bar'); // room to scroll the page above the bar
  announce('A new version of Gdex is ready. Reload to use it.');
}

// Asks the browser to look for a new service worker now. Resolves once an update, if any, has taken over.
export async function checkForUpdates() {
  const d = desktop();
  if (d) { S.last = Date.now(); const s = await d.checkForUpdates().catch(() => null); if (s && typeof s === 'object') S.desktop = s; emit(); return S.desktop || { status: 'error' }; }
  if (!S.reg) return { status: 'unsupported' };
  S.last = Date.now(); emit();
  try { await S.reg.update(); } catch { return { status: 'offline' }; }
  const w = S.reg.installing || S.reg.waiting;
  if (w && !S.ready) {
    if (S.reg.waiting) S.reg.waiting.postMessage('skip-waiting');
    await new Promise(res => { const t = setTimeout(res, 20000); const stop = onChange(() => { if (S.ready) { clearTimeout(t); stop(); res(); } }); w.addEventListener('statechange', () => { if (w.state === 'redundant') { clearTimeout(t); stop(); res(); } }); });
  }
  return { status: S.ready ? 'ready' : 'current', version: VERSION, build: BUILD };
}

export function initUpdates() {
  const d = desktop();
  if (d) { // the desktop app: no offline copy to keep (one left by an older run would only serve stale files)
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    d.updateState().then(s => { if (s && typeof s === 'object') { S.desktop = s; emit(); } }).catch(() => {});
    d.onStatus(s => { if (s && typeof s === 'object') { S.desktop = s; emit(); } });
    return;
  }
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) { S.ready = true; emit(); showBar(); }
    controlled = true;
    setTimeout(() => { try { navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage('cleanup'); } catch { /* ignore */ } }, 3000);
  });
  // Registered once the page has loaded, so a first visit's own downloads are not competing with the offline copy.
  const register = () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { S.reg = reg; S.last = Date.now(); emit(); if (reg.waiting) reg.waiting.postMessage('skip-waiting'); }).catch(() => {});
  if (document.readyState === 'complete') register(); else window.addEventListener('load', register, { once: true });
  const check = () => { if (S.reg && !S.ready && Date.now() - S.last > 10 * 60000) { S.last = Date.now(); S.reg.update().catch(() => {}); } };
  setInterval(check, 60 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('online', check);
}

/* ------------------------ Settings → About ------------------------ */
export function updatePanel() {
  const el = h('div', { class: 'stack' });
  let busy = false;
  const draw = () => {
    const st = updateState(), d = desktop();
    const when = st.lastCheck ? new Date(st.lastCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const actions = [];
    let line, canCheck;
    if (d) { // the desktop app: its updater's state
      const ds = st.desktop || { status: 'idle' }, s = ds.status, v = ds.available ? 'Gdex ' + ds.available : 'The new version of Gdex';
      line = s === 'dev' ? 'A development copy: updates are only looked for in the installed app.'
        : s === 'checking' ? 'Looking for a new version…'
        : s === 'downloading' ? `Downloading ${v}… ${Math.round(Number(ds.progress) || 0)}%`
        : s === 'ready' ? `${v} is ready to install.`
        : s === 'available' ? `${v} is ready to download.`
        : s === 'current' ? `Up to date${when ? ' · checked ' + when : ''}.`
        : s === 'error' ? 'Couldn’t look for a new version just now. Check the internet connection, then tap Check for updates, or get the latest from the download page.'
        : 'Gdex looks for a new version when it starts and every few hours, and installs it when you restart.';
      if (s === 'ready') actions.push(h('button', { class: 'btn primary', onclick: () => d.installUpdate() }, '↻ Restart to update'));
      // The download page in the web browser: the new version (a Mac that cannot update itself), or the latest after a failed check.
      if (s === 'available' || s === 'error') actions.push(h('button', { class: 'btn ghost', onclick: () => d.openDownload() }, s === 'available' ? '⤓ Download the new version' : '⤓ Open the download page'));
      canCheck = s !== 'dev';
    } else {
      line = st.ready ? 'A new version has been downloaded. Reload to use it.'
        : !st.supported ? 'Updates arrive when the site is reloaded (this browser keeps no offline copy).'
        : `Up to date${when ? ' · checked ' + when : ''}. New versions are fetched in the background whenever you open Gdex.`;
      if (st.ready) actions.push(h('button', { class: 'btn primary', onclick: reloadNow }, '↻ Reload now'));
      canCheck = st.supported && !st.ready;
    }
    if (canCheck) actions.push(h('button', { class: 'btn ghost', disabled: busy, onclick: async () => { busy = true; draw(); try { await checkForUpdates(); } finally { busy = false; draw(); } } }, busy ? 'Checking…' : 'Check for updates'));
    el.replaceChildren(h('p', { class: 'small muted' }, line), actions.length ? h('div', { class: 'actions' }, ...actions) : '');
  };
  draw();
  const off = onChange(draw);
  return { el, destroy: off };
}
