// Tourbook's own Google sign-in client: the owner's, made on 15 November 2026 in the Google Cloud project Tourbook
// (docs/drive.md says how; a public id, not a secret). Empty, Google Drive would say it is not set up yet. The website picks
// a new id up with its next build; the desktop app carries its own copy, so a new id needs a desktop release too. Tests
// replace this whole file (90-drive also checks the repository's copy carries exactly this id).
export const CLOUD_APPS = { google: '41383784704-r4lhqli3p4e7bh66c7k5l2ala7t95r47.apps.googleusercontent.com' };
