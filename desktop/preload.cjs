// A tiny, explicit bridge for the page (window.gdexDesktop): the desktop app's version and update controls, Google's
// sign-in in the web browser, and the licence. Nothing else from Node. The page tests for each member it uses.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const on = (channel, cb) => { const fn = (_e, s) => cb(s); ipcRenderer.on(channel, fn); return () => ipcRenderer.removeListener(channel, fn); };
contextBridge.exposeInMainWorld('gdexDesktop', {
  platform: process.platform,
  // Updates (desktop/updater.cjs): { status, version, available, progress, url, error }
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  updateState: () => ipcRenderer.invoke('updates:state'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openDownload: () => ipcRenderer.invoke('updates:open'),
  onStatus: cb => on('updates:status', cb),
  // Google's sign-in opens in the web browser; the token comes back through the app's local server (desktop/main.cjs).
  googleSignIn: opts => ipcRenderer.invoke('signin:google', opts && typeof opts === 'object' ? { client: String(opts.client || ''), scope: String(opts.scope || ''), hint: String(opts.hint || '') } : {}),
  // The licence: free days, code, and this computer's place on it (desktop/licence.cjs).
  licence: {
    state: () => ipcRenderer.invoke('licence:state'),
    start: () => ipcRenderer.invoke('licence:start'),
    adopt: t => ipcRenderer.invoke('licence:adopt', Number(t)),
    enter: (code, opts) => ipcRenderer.invoke('licence:enter', String(code || ''), opts && typeof opts.release === 'string' ? { release: opts.release } : {}),
    recheck: () => ipcRenderer.invoke('licence:recheck'),
    release: () => ipcRenderer.invoke('licence:release'),
    code: () => ipcRenderer.invoke('licence:code'),
    buy: () => ipcRenderer.invoke('licence:buy'),
    localPrice: () => ipcRenderer.invoke('licence:price'),
    onChange: cb => on('licence:changed', cb),
  },
});
