# Before Tourbook goes live: the owner's list

## Put the website live: this launch (licence off, no Google Drive, no desktop app)

The first launch is Tourbook itself at **https://tourbook.crowmade.app**, installable and working offline, with its terms,
privacy and download pages, and the licence server's addresses switched off: every role free, nothing asked, Google
Drive saying "Not set up yet" (as it did on the live site at the first publish, 14 November 2026, and the one after it;
Google Drive was switched on in the repository on 15 November 2026, step 6, and comes with the next publish), the
download page saying the desktop app is coming, `/buy` saying the licence is not on sale yet. Nothing goes on the
internet until you say **"publish"**; each step below happens only with your go-ahead, in this order. You approve; the
developer runs.

1. **You read the terms and the privacy policy** (`terms.html`, `privacy.html`; the preview has them) and say what to
   change. They go live with this launch: who provides Tourbook, the contact address, the law, the courts, the liability
   cap and the refund are copied unchanged from Vdex's (the contact address is support@crowmade.app, your answer under
   Questions for you, below), and their date is the day they were written.
   Before licences are switched on (9(d)), a lawyer you choose reads them too.
2. **You check the address is free.** In Cloudflare, the crowmade.app zone → **DNS → Records**: no record named `tourbook`;
   and under **Workers & Pages** no Worker or Pages project uses tourbook.crowmade.app. A publish from GitHub runs Wrangler
   without anyone at a keyboard, and then Wrangler takes over a DNS record or another Worker's custom domain of the
   same name without asking.
3. **The developer checks the owner's other sessions** for anything about tourbook.crowmade.app or crowmade.app (the
   decisions, §18), and says what they found. This launch adds only the name tourbook.crowmade.app: crowmade.app's own
   pages (published from the Vdex repository) and vdex.crowmade.app are not touched. A link to Tourbook on crowmade.app's
   home page is not part of it (that page's design is the "Cloudflare Website Maintenance" session's).
4. **The Cloudflare token**, in the protected Environment `tourbook-live` (step 2 below; `docs/licence-server.md`, Part 1).
   What your account needs: the token made in the account that holds the crowmade.app zone (as Vdex's is), with
   Workers. The free plan is enough for everything this launch makes. If the publish later stops at the address with a permissions error, add
   **Zone → DNS → Edit** for crowmade.app to the token and run it again (not checked here: it needs Cloudflare).
5. **The work on `main`** (step 9's (0)): the developer merges the release work into `main` and pushes it.
6. **Publish**: Actions → **Publish Tourbook** → **Run workflow** on `main`, type `publish tourbook` (and approve the run, if
   the Environment has a required reviewer: on a private repository GitHub offers that only with Enterprise). It
   runs every test (licences off and on), stamps the build with `main`'s commit (so installed copies update; the
   repository keeps the `dev` stamp, which CI needs), runs the guard, stages the website's own files and runs
   `npx wrangler deploy --config wrangler.jsonc`. The first publish makes, in your account, only these, all Tourbook's own:
   - the Worker **`tourbook`**: its script (`cloudflare/worker.mjs`) and the website's own files, with their headers;
   - the address **tourbook.crowmade.app**, a Custom Domain of that Worker (Cloudflare adds its DNS record and certificate
     in the crowmade.app zone and changes nothing else there); no workers.dev or preview address;
   - the KV store **`tourbook-licences`** (binding `LICENCES`; Wrangler names it after the Worker and the binding, since
     the configuration gives no id) and the Durable Object class **`SignInCodes`** (binding `SIGNIN`, inside the
     Worker `tourbook`). The licence server's code is bound to them, so they are made now even with the licence off; they
     stay empty and cost nothing until licences are on;
   - no secrets and no variables: none are needed while the licence is off.
   The guard refuses any other name, address, store or binding (Vdex's Worker, KV, domain or bucket included).
7. **Check it**: the workflow checks the live build, the security header and the licence server's answers itself.
   Then by hand: https://tourbook.crowmade.app asks "Who’s using Tourbook?" and says nothing about a licence; Settings → About
   shows the build; ☁ → Google Drive says "Not set up yet" (as at the first two publishes; from the first publish after
   step 6 it offers **Connect Google Drive…**); `/buy` says the licence is not on sale yet; `/download.html` says the desktop app
   is coming; any wrong address shows "There’s nothing at this address". Install it from the browser, and open it once
   with the network off.

**From your own computer instead** (you chose GitHub; this stays possible): `npx wrangler login`; in the repository on `main`,
`node tools/stamp-build.mjs`, `node tools/stage-site.mjs cloudflare/site --cloudflare`, then in `cloudflare/`
`npx wrangler deploy --config wrangler.jsonc`. If Wrangler asks about the KV store, choose **Create new** and keep
the name `tourbook-licences` (never one it lists: they can be Vdex's); if it asks to take over an address or a record,
answer no and do step 2 again. Afterwards, `git checkout -- cloudflare/wrangler.jsonc` (Wrangler writes the store's id
into it, which the guard refuses) and `node tools/stamp-build.mjs --dev` (never commit the release stamp).

**To undo it:**
- A bad version: Workers & Pages → **tourbook** → **Deployments** → the version before → **Rollback**, or publish a fixed
  commit. Installed copies take whichever build is served at their next visit.
- Take the website off its address: **tourbook** → **Settings → Domains & Routes** → tourbook.crowmade.app → **Remove**
  (Cloudflare removes the DNS record it made). The Worker stays, unreachable.
- Remove everything, only while licences are off and nothing has been sold: **tourbook** → **Settings** → **Delete** (the
  sign-in codes' Durable Object belongs to that Worker and holds nothing while licences are off), then **Storage &
  databases → KV** → `tourbook-licences` → **Delete**; in GitHub, delete the Environment `tourbook-live`, and in Cloudflare,
  delete the token.
- What no step undoes: a browser that opened Tourbook keeps its offline copy and the person's data on that device. It
  keeps working offline and stops updating until Tourbook is published again.

After this launch, the rest of the list stays as below, each part with its own go-ahead: the licence (steps 3 to 5,
then 9(b) to 9(d)), Google Drive (step 6, done on 15 November 2026: it goes live with the next publish), and the
desktop app (steps 7 and 8, then 9(e); the download page gets its links at the first desktop release, `docs/desktop.md`).

## The whole list

Tourbook's licence for the working roles, its licence server and the desktop app are built and tested, and **switched
off**. Google Drive is built, tested and switched on (step 6, 15 November 2026): the website has it from its next
publish, the desktop app from its first release. Nothing is published, deployed, uploaded or released until you have
done the steps below and said **"publish"**. Each step in part 9 happens only with your go-ahead, one at a time.

The guides each step points to:

- `docs/licence-server.md`: Cloudflare, the licence keys, Stripe, Resend, switching the website's licence on, everyday
  work with codes.
- `docs/desktop.md`: building, signing, uploading and releasing the desktop app, and its own licence switch.
- `docs/drive.md`: Tourbook's own Google sign-in client for Google Drive.

## 1. Read the terms and the privacy policy

`terms.html` and `privacy.html` in the repository (they open in a browser from the file too). The privacy policy was
adapted from Vdex's. The terms were rewritten for Tourbook on 14 November 2026 (decisions §20): they follow how people use
it (who we are; what Tourbook is and is not in the music world; what is free and the licence, section 3; bookings, day
sheets and the tools; sessions, songs, acts and My card; money, gear and insurance; information, other people, other services),
and sections 13 to 20 (no warranty, the liability limits, consumers' rights, stopping, changes, the law and the courts)
are the earlier terms' words, adapted from Vdex's, unchanged but for their references to sections 1 to 12: section 16's
California item (name in section 1, price in section 3) and section 17's list of what still applies after you stop (which
now also names section 2, what Tourbook is and is not, which the earlier list left out, and still leaves out your right
to use Tourbook). A Contents fold under the short version lists the sections. Who provides Tourbook, the contact address, the law, the courts, the
liability cap and the 14-day refund are as you published them for Vdex. Later the same day, before anything was published,
the terms gained your rule that the Audiophile is for personal use, not for work (decisions §21; the short version,
section 3 and section 12, and the one-time terms sheet's first line): the date stayed 14 November 2026 and `TERMS_VERSION`
`'2026-11-14'`, since no device had agreed to the earlier words. On 15 November 2026, after the terms were published,
Google Drive was switched on (step 6): section 7 lost its sentence "Google Drive works once Tourbook’s Google sign-in is
switched on; until then Tourbook says Google Drive isn’t set up yet.", and nothing else changed then. Since the
terms had been published the day before, their date moved to 15 November 2026 and `TERMS_VERSION` to `'2026-11-15'`
(`docs/developers.md`, the legal pages; while licences are off the one-time terms sheet asks no one, so nobody is asked
again now; section 18’s “Tourbook shows you the new terms the next time you use a working role” works only once licences
are on, one more thing for the lawyer to look at). Later the same day, with your answer that backups should carry the
free days (Answered, below), section 3 gained one point: "A backup file carries the day the free days started on the
device it was saved on. Bringing it back on a device counts that device’s free days from that day, or from the device’s
own start if that was earlier." Nothing else in the terms changed that day. The date stayed 15 November 2026 and
`TERMS_VERSION` `'2026-11-15'`: no device could have agreed to the morning's words (the one-time terms sheet asks no one
while licences are off), so nobody needs asking again (`js/terms.js`). The privacy
policy is dated the same day: its section 7 now says Google’s sign-in script runs only once you tap Connect Google
Drive…, as its section 3 says, rather than once you connect; and its sections 2 and 3 say what a backup file carries
about the free days. Tell the developer anything to change.
**Before licences are switched on (9(d)), a lawyer you choose reads the terms and the privacy policy** (you said you
would find one); the developer makes the changes they ask for, dated the day they are made (with `TERMS_VERSION`).

## 2. Cloudflare (15 minutes)

An API token from the "Edit Cloudflare Workers" template, in the account that holds crowmade.app. **What it can reach:
every Worker in that account, Vdex's included** (Cloudflare cannot limit a token to one Worker). So, in Tourbook's
repository on GitHub (TheCrowBro/Gdex): **Settings → Environments → New environment `tourbook-live`**, required reviewer: you
(where GitHub offers it: on a private repository only with Enterprise, so it is missing here), deployment branches: `main`
only; put `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` there, **not** as repository secrets. Only a run started by
hand on `main`, with the words, then gets them (and waits for your approval first, where there is a required reviewer),
and it refuses any configuration but Tourbook's own. The
first publish creates the Worker `tourbook`, the address tourbook.crowmade.app, the licence store `tourbook-licences` and the
Worker's own Durable Object for sign-in codes (`SignInCodes`); nothing of Vdex's changes. Steps: `docs/licence-server.md`, Part 1.
If you made an Environment named `gdex-live` (or `gdex-sign`) before the app was renamed Tourbook, make `tourbook-live`
(and `tourbook-sign`) instead, put the secrets there and delete the old ones: the workflows use only the new names.

## 3. Licence keys (15 minutes, on your own computer)

Open `tools/licence-generator.html` from a file; make keys 1, 2 and 9 with a passphrase of 12 or more characters; keep
the files in two places and the paper backups (and the ledger, `tourbook-ledger.csv`, beside them, never with Vdex's); give
the developer the public-keys line (it goes in `desktop/licence-keys.json`, then `node tools/licence-keys.mjs` writes the
website's copy); after the first publish, set the shop key as the Worker secret `LICENCE_SHOP_KEY`. Committing the keys
switches nothing on. Steps: `docs/licence-server.md`, Parts 2 and 3.

## 4. Stripe (about 40 minutes, plus Stripe's checks)

In the Stripe account Vdex uses (your answer, under Answered below). A product "Tourbook licence", one-off 20.00 USD,
tax not included, tax code "Downloadable Software - business use"; Managed Payments on (Link is the seller and handles
tax); the terms and privacy addresses in Stripe's public details; a **payment link** with Managed Payments, "require
customers to accept your terms of service" ticked, and the address after payment
`https://tourbook.crowmade.app/licence/thanks?session_id={CHECKOUT_SESSION_ID}`; Worker settings `BUY_URL` (the link's
address) and `STRIPE_PAYMENT_LINK` (its `plink_…` id); a restricted key with Checkout Sessions read →
`STRIPE_SECRET_KEY`; a webhook to `https://tourbook.crowmade.app/licence/stripe-webhook` with
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded` and `charge.dispute.created`
→ `STRIPE_WEBHOOK_SECRET`. Test mode first if you like: while testing, leave `BUY_URL` unset (the website then says "not
on sale yet") and open the test payment link directly; a test order's code ends two days after it was issued, so no test
purchase becomes a lasting licence. Steps: `docs/licence-server.md`, Part 4.

## 5. Resend (10 minutes)

In the Resend account Vdex uses: the sending domain tourbook.crowmade.app verified beside vdex.crowmade.app (Resend's
free plan allows 3 domains, so no paid plan; the two share its 100 free emails a day), an API key with sending access for
that domain → `RESEND_API_KEY`. The emails come from `Tourbook <licences@tourbook.crowmade.app>`, `MAIL_FROM`'s default,
so `MAIL_FROM` stays unset. Add `REPLY_TO` before the shop opens (9(b)): support@crowmade.app, the contact address (your
answer, under Answered below). The terms (section 3) tell buyers they can reply to the email their licence came in, and
without `REPLY_TO` a reply would go to licences@tourbook.crowmade.app, which has no inbox set up. Steps:
`docs/licence-server.md`, Part 5.

## 6. Google (30 minutes): done on 15 November 2026

A new Google Cloud project named Tourbook; the Google Drive API; branding (name Tourbook, support email, home page, privacy and
terms addresses, authorised domain crowmade.app); the one scope `…/auth/drive.appdata`; a Web application client with the
JavaScript origins `https://tourbook.crowmade.app` and `http://localhost:47861`; publish the app; give the developer the
client id (it goes in `js/cloud-config.js`). Steps: `docs/drive.md`.

You did this on 15 November 2026, and published the Google app the same day, before the publish that carried the id
("It is published"): Google Auth platform → Audience says **In production**. Keep it so: while it says Testing,
everyone but the test users listed there gets Google’s “Access blocked” page, though the website, its terms and its
download page offer Google Drive to every role. The client id,
`41383784704-r4lhqli3p4e7bh66c7k5l2ala7t95r47.apps.googleusercontent.com`, is in `js/cloud-config.js` as
`CLOUD_APPS.google` (spec 90 checks the repository carries exactly it). With it, the terms' section 7 lost its sentence
"Google Drive works once Tourbook’s Google sign-in is switched on; until then Tourbook says Google Drive isn’t set up yet."
(step 1 says how the date moved), and the download page lost its "once Tourbook’s Google sign-in is switched on" too.
Until the next publish, the live site's Google Drive card still says "Not set up yet". The desktop app carries its own
copy of the id, so it has Google Drive from its first release (none is out yet). **Try it once for real after the first
publish** with the id in: connect Google Drive on tourbook.crowmade.app, and in the desktop app after its first release
(`docs/drive.md`).

## 7. Code signing (optional)

Unsigned desktop builds work, with warnings when they are opened. To sign: the Apple Developer ID certificate and
notarisation secrets and the Azure signing secrets. **What they can reach: they sign and notarize any app as you, Vdex's
included**, and the app-specific password signs in to your Apple Account (`docs/licence-server.md`, "What each key can
reach"). So, in Tourbook's repository on GitHub (TheCrowBro/Gdex): **Settings → Environments → New environment `tourbook-sign`**, required
reviewer: you (where GitHub offers it, as for `tourbook-live`), deployment branches: `main` only; put the secrets there,
**not** as repository secrets (a workflow on any pushed branch can read those). Only a run of the desktop build on `main`
then gets them (after your approval, where there is a required reviewer). Steps: `docs/desktop.md`.

## 8. Downloads (15 minutes)

A new R2 bucket `tourbook-downloads` with the custom domain `tourbook-download.crowmade.app` (its own bucket, so nothing made for
Tourbook can ever overwrite Vdex's installers or updates). Uploads by hand (the Cloudflare dashboard, or `wrangler r2 object
put` from your own computer) in the order `docs/desktop.md` gives; if you want CI uploads later, an R2 token scoped to
`tourbook-downloads` only. The address is built into every desktop app for good, so it is settled before the first release.
Until then the download page links no installer and says the desktop app is coming; the first public desktop release
puts its three links back, once the files are in the bucket (`docs/desktop.md`, "Releasing", step 0).

**Before the first public desktop release: the hardening** (by the developer, with your go-ahead). Electron's
fuses in the installed app: `RunAsNode`, `NODE_OPTIONS` and the `--inspect` switches off, the app loaded only from its
`app.asar`, cookie encryption on; and the app quits when it is started with remote debugging. Without them another
program on the same computer can run its own code as Tourbook. The cost: Playwright cannot drive a packaged build with them
on, so the automatic desktop test keeps running on the unpackaged app and each installer is checked by hand before it
is uploaded. Steps: `docs/desktop.md`, "Hardening, before the first public desktop release".

## 9. Then "publish", in this order

Each step only with your go-ahead.

**(0) The work on `main`.** The developer merges the finished work into `main` and pushes it, with your go-ahead.
Publishing runs from `main` only: the publish workflow refuses any other branch, and GitHub shows **Publish Tourbook** under
Actions only once its file (`.github/workflows/publish.yml`) is on the repository’s default branch, which must be
`main` (Settings → General → Default branch). Every later change to be published, such as (d)'s, goes onto `main` the
same way first.

**(a) The website and the Worker, with licences still off.** Actions → **Publish Tourbook** → **Run workflow** on `main`,
type `publish tourbook` (and approve the run if GitHub asks). It runs every test (licences off and on), stamps the build,
checks the configuration is Tourbook's own, publishes, and checks the live site. Look at https://tourbook.crowmade.app: every
role is free, nothing about licences shows.

**(b) The shop.** In Cloudflare, on the Worker **tourbook**: the shop key (step 3), Stripe's settings (step 4), Resend's
(step 5), `REPLY_TO` included. Check `/buy`, a test purchase, the thank-you page, the email, that a reply to the email
reaches the contact address (support@crowmade.app), and a refund (`docs/licence-server.md`, Part 7).

**(c) `WEB_SIGN_IN = on`** (a Text variable on the Worker tourbook). Nothing changes on the website yet.

**(d) The website's licence switch.** A commit (by the developer, with your go-ahead) that changes one line in
`js/licence-config.js`:

```js
export const LICENCE_SITES = ['tourbook.crowmade.app'];
```

and, in the same commit, the expectation in `tests/specs/07-groundwork.cjs` that guards the switches (so no other session
flips one by accident). The line

```js
ok('the owner’s switches are off in the repository: LICENCE_SITES is [] and desktop/licence-on.json is { "on": false }', same(sites, []) && same(desk, { on: false }), JSON.stringify([sites, desk]));
```

becomes

```js
ok('the owner’s switches: the website’s licence is live on tourbook.crowmade.app, the desktop app’s is off', same(sites, ['tourbook.crowmade.app']) && same(desk, { on: false }), JSON.stringify([sites, desk]));
```

and, further down the same file, the line

```js
        ok('…the site is not a licence site, and nothing about a licence is kept on the device', same(L.sites, []) && L.licence === null && L.terms === null, JSON.stringify(L));
```

becomes (the tests' own address is still not a licence site)

```js
        ok('…the site is not a licence site, and nothing about a licence is kept on the device', same(L.sites, ['tourbook.crowmade.app']) && L.licence === null && L.terms === null, JSON.stringify(L));
```

and the same in `tests/specs/75-licence-off.cjs`, whose line

```js
    ok('the repository’s switch is off: LICENCE_SITES is []', /export const LICENCE_SITES = \[\];/.test(repo));
```

becomes

```js
    ok('the repository’s switch: the website’s licence is live on tourbook.crowmade.app', /export const LICENCE_SITES = \['tourbook\.crowmade\.app'\];/.test(repo));
```

(the publish runs every test first, so a commit that changes one without the others is never published).

In the same commit, the terms lose the sentence that says the licence is not on yet. In `terms.html` the sentence
"Until licences are switched on at tourbook.crowmade.app, every role is free and the licence parts of these terms do not
apply yet." comes out of the short version and out of section 3, and so does section 3's "This rule applies before
licences are switched on too, while every role is free." (the end of the paragraph that says the Audiophile is not for
work); `TERMS_VERSION` in `js/terms.js` is raised to that
day's date, so every device is asked to agree to the terms again; and the check in `tests/specs/83-legal-pages.cjs`
that expects the sentence is changed to expect it gone (and its check of the Audiophile's work paragraph, to expect it
without that last sentence). **Before this step, a lawyer you choose reads the terms and the
privacy policy**, and the developer makes the changes they ask for; then read the terms once more yourself.

The public keys must already be in `desktop/licence-keys.json` and `js/licence-keys.js` (step 3): the publish workflow's
guard refuses to publish live licences without them. Then publish as in (a). From then on every browser at
tourbook.crowmade.app has the licence: the working roles have 30 free days from their first use on each browser, then need a
licence; the Audiophile stays free and sends nothing to the licence server. To pause it in an emergency, set
`WEB_SIGN_IN` to anything but `on`: within about 6 hours every role opens again (`docs/licence-server.md`, Part 6).

**(e) The desktop app's licence.** A release whose `desktop/licence-on.json` is

```json
{ "on": true }
```

with the keys built in (the desktop build refuses the switch on without keys), and, in the same commit, the expectation
in `tests/specs/07-groundwork.cjs` becomes

```js
ok('the owner’s switches are on: the website’s licence is live on tourbook.crowmade.app, and the desktop app’s', same(sites, ['tourbook.crowmade.app']) && same(desk, { on: true }), JSON.stringify([sites, desk]));
```

In the same commit, `download.html` loses its sentence "Until licences are switched on at tourbook.crowmade.app, every role
is free and the licence described on this page does not apply yet.", and the check in
`tests/specs/86-download-page.cjs` that expects it is changed to expect it gone.

Built, signed if you chose to, and uploaded in the order `docs/desktop.md` gives.

## Questions for you

Answered:

- **What a free Audiophile keeps:** the calendar of the shows they go to and the bands they like; not the working boxes,
  sessions, rehearsals or anything about money. Built so (one constant, `FREE_KEEPS_WORK`, would free the boxes).
- **The Audiophile is not for work** (14 November 2026: "Yes audiophiles can't use it for work."): it is for your own
  personal use, going to shows and keeping track of the bands you like. Work (anything you do in music for pay, for
  clients or for a business, such as booking, managing, producing, playing, scouting or reviewing) needs a working role:
  free for 30 days on each device, then a licence, which covers every role on the devices it is used on. The rule holds
  before licences are switched on too, while every role is free. The terms say so (the short version, section 3 with
  examples, and section 12, whose "including paid work" is the working roles'), and so do the role picker's Audiophile
  card and its words while licences are on, Settings → Your role (the same cards, and the line under them), the Carry on
  free offers (the free-days-over and read-only sheets, and the desktop app's files opened in a browser) and their toast,
  the one-time terms sheet's first line and the download page. The app enforces nothing more than the sections each role
  has: the rule is the terms'. Section 3's examples are the developer's reading of your rule; say if any should change:
  a band that only plays for fun, unpaid, is not work; helping a friend's paid band for free is; scouting for a label,
  an agency, a festival or a venue is work even unpaid; and using the Audiophile's tools (the tuner, the set timer…) at a
  paid gig is work. A licence lifts the rule: with one, any role may be used for work on the devices it covers.
- **Agreeing to the terms in the app:** a one-time terms sheet the first time someone uses a working role; the free
  Audiophile never sees it. Built so.
- **Age:** 18 or over for everyone, Vdex's wording.
- **Desktop downloads:** Tourbook's own bucket, tourbook-download.crowmade.app.
- **Stripe:** the same Stripe account as Vdex (decisions §20). So every card statement shows the account's descriptor
  (make it neutral, for example the name you trade under, before Tourbook goes on sale), and Tourbook's Stripe key
  (Checkout Sessions: Read) reads every order in the account, Vdex's buyers' names, email addresses and billing addresses
  included; only a separate account would keep them apart. Nothing in the code depends on it.
- **Resend:** "Should be crowmade right?" Yes: the emails come from `Tourbook <licences@tourbook.crowmade.app>` (the
  Worker's `MAIL_FROM` default), as Vdex's come from licences@vdex.crowmade.app, sent by Resend, which stays named in the
  terms and the privacy policy. Resend's free plan has allowed 3 verified domains since August 2026, so
  tourbook.crowmade.app is a second domain on the same Resend account as Vdex, sharing its 100 free emails a day (Tourbook
  sends at most 30 sign-in emails a day); no paid plan is needed, and Tourbook's key is made for its own domain only.
  Replies go to support@crowmade.app (`REPLY_TO`), the contact address (below).
- **Where the website is published from:** GitHub, like Vdex: the workflow **Publish Tourbook** on `main`, with the
  Cloudflare token in the protected Environment `tourbook-live` (step 2). You chose it on 14 November 2026 ("Like Vdex,
  from GitHub"), over publishing from your own computer, which stays possible (below step 7). GitHub shows no required
  reviewers on this private repository (only Enterprise offers them there), so a publish starts as soon as it is run;
  the workflow itself refuses any branch but `main` and any run without the words. The first publish (14 November
  2026) was started this way.
- **Google Drive:** Tourbook's own Google Cloud project, Tourbook (not a second client in Vdex's project), with one Web
  application client for `https://tourbook.crowmade.app` and `http://localhost:47861` and the one scope `drive.appdata`.
  You made it and gave its id on 15 November 2026 (step 6); it is in `js/cloud-config.js`, and Google Drive is free for
  every role from the next publish.
- **A lawyer:** "I'll find a lawyer": a lawyer you choose reads the terms and the privacy policy before licences are
  switched on (step 1 and 9(d)).
- **The contact address:** support@crowmade.app, the same as Vdex's and crowmade.app's (15 November 2026: "Yes for the
  support email since all of them live on the same site"), in the terms, the privacy policy and the emails. The pages
  already said it, so they did not change. Replies to the licence and sign-in emails go there too: `REPLY_TO` is set to
  support@crowmade.app with the other shop settings before the shop opens (step 5, 9(b)). crowmade.app's mail goes
  through Cloudflare Email Routing (its MX records are route1–3.mx.cloudflare.net), so check that its routing rules send
  support@crowmade.app to an inbox you read; 9(b)'s test reply shows it does.
- **Backup files and the free days:** "Backups should carry the free days" (15 November 2026). Once licences are on, a
  backup file (a plain one, a locked one inside its encryption, and the copy kept in a file) carries the day the working
  roles' free days started on the device it was saved on, as Google Drive's copy does. Bringing it back counts this
  device's free days from the earlier of its own start and the file's (a device that has not started takes the file's),
  and before anything is brought back the chooser says so in one line when that changes the count: from which day, how
  many days are left and until when, or that they are over. So a backup brought back in a private window keeps its free
  days' start. While licences are off nothing is written into a file and nothing is taken from one. A plain backup is a
  text file anyone can edit, so this stops the easy way round the free days, not a determined one. The terms (section 3)
  and the privacy policy (sections 2 and 3) say so.

Still open (the build goes ahead with its default meanwhile):

1. **Code signing:** the Apple and Windows signing you have for Vdex, for Tourbook too (no new fee), or unsigned at first?
   *Default: the workflow signs only when the secrets exist.*
