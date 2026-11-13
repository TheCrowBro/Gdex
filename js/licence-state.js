// The licence, as every module asks it: synchronous, no network (docs: the build spec §3.5). This is the seam's stub:
// licences are off, so everything is open. Part A fills it in; the exports, their arguments and answers stay.
const OFF = Object.freeze({ kind: 'web', mode: 'off', canEdit: true, started: false, first: 0, trialLeft: 30, trialEnds: '', licence: null, seats: 3 });
export const LICENCE_EVENT = 'gdex-licence';
export const FREE_KEEPS_WORK = false;
export const licenceNow = () => OFF;
export const licenceOn = () => false;
export const licenceReady = () => Promise.resolve();
export const mayOpen = () => 'open';
export const mayWork = () => 'open';
export const mayPickRole = () => 'open';
export const gateWork = fn => { fn(); };
export const workMark = () => null;
export const canWrite = () => true;
export const startFreeDays = () => Promise.resolve(false);
export const freeDaysFrom = () => 0;
export const adoptFreeDaysFrom = () => Promise.resolve(false);
export const refreshLicence = () => OFF;
export const serverTime = () => {};
export const setLicenceState = () => {};
export const onLicenceChange = () => () => {};
export const initLicenceSource = () => Promise.resolve();
export const roleBadge = () => '';
export const sectionMark = () => null;
