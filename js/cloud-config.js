// Gdex's own Google sign-in client (a public id, not a secret: docs/drive.md says how the owner makes it). Empty: Google
// Drive says it is not set up yet. The website picks a new id up with its next build; the desktop app carries its own
// copy, so a new id needs a desktop release too. Tests replace this whole file.
export const CLOUD_APPS = { google: '' };
