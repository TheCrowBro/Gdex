// Where Tourbook's licence is live: the host names whose Worker answers /licence/* (cloudflare/worker.mjs). Empty: off
// everywhere, exactly as before the licence existed, and nothing is sent to a licence server. Only the publish the owner
// approves sets ['tourbook.crowmade.app'] (docs/go-live.md). Tests replace this whole file.
export const LICENCE_SITES = [];
