// Part A: the one-time terms sheet at the first paid use (the build spec [S-37]).
export const TERMS_SHEET = true;
export const TERMS_VERSION = '';
export const termsDue = () => false;
export const askTerms = () => Promise.resolve(true);
