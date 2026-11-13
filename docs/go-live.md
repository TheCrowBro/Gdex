# Before Gdex goes live: the owner's list

Gdex's licence for the working roles, its licence server, the desktop app and Google Drive are built and tested, and
**switched off**. Nothing is published, deployed, uploaded or released until you have done the steps below and said
**"publish"**. Each step in part 9 happens only with your go-ahead, one at a time.

The guides each step points to:

- `docs/licence-server.md`: Cloudflare, the licence keys, Stripe, Resend, switching the website's licence on, everyday
  work with codes.
- `docs/desktop.md`: building, signing, uploading and releasing the desktop app, and its own licence switch.
- `docs/drive.md`: Gdex's own Google sign-in client for Google Drive.

## 1. Read the terms and the privacy policy

`terms.html` and `privacy.html` in the repository (they open in a browser from the file too). They were adapted from
Vdex's: who provides Gdex, the contact address, the law, the courts, the liability cap and the 14-day refund are copied
unchanged from what you published for Vdex; everything else says what Gdex does. Tell the developer anything to change.

## 2. Cloudflare (15 minutes)

An API token from the "Edit Cloudflare Workers" template, in the account that holds crowmade.app. **What it can reach:
every Worker in that account, Vdex's included** (Cloudflare cannot limit a token to one Worker). So, in the Gdex
repository on GitHub: **Settings → Environments → New environment `gdex-live`**, required reviewer: you, deployment
branches: `main` only; put `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` there, **not** as repository secrets.
Every run of the publish workflow then waits for your approval, and it refuses any configuration but Gdex's own. The
first publish creates the Worker `gdex`, the address gdex.crowmade.app, the licence store `gdex-licences` and the
Worker's own Durable Object for sign-in codes (`SignInCodes`); nothing of Vdex's changes. Steps: `docs/licence-server.md`, Part 1.

## 3. Licence keys (15 minutes, on your own computer)

Open `tools/licence-generator.html` from a file; make keys 1, 2 and 9 with a passphrase of 12 or more characters; keep
the files in two places and the paper backups (and the ledger, `gdex-ledger.csv`, beside them, never with Vdex's); give
the developer the public-keys line (it goes in `desktop/licence-keys.json`, then `node tools/licence-keys.mjs` writes the
website's copy); after the first publish, set the shop key as the Worker secret `LICENCE_SHOP_KEY`. Committing the keys
switches nothing on. Steps: `docs/licence-server.md`, Parts 2 and 3.

## 4. Stripe (about 40 minutes, plus Stripe's checks)

A product "Gdex licence", one-off 20.00 USD, tax not included, tax code "Downloadable Software - business use"; Managed
Payments on (Link is the seller and handles tax); the terms and privacy addresses in Stripe's public details; a
**payment link** with Managed Payments, "require customers to accept your terms of service" ticked, and the address
after payment `https://gdex.crowmade.app/licence/thanks?session_id={CHECKOUT_SESSION_ID}`; Worker settings `BUY_URL` (the
link's address) and `STRIPE_PAYMENT_LINK` (its `plink_…` id); a restricted key with Checkout Sessions read →
`STRIPE_SECRET_KEY`; a webhook to `https://gdex.crowmade.app/licence/stripe-webhook` with
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded` and
`charge.dispute.created` → `STRIPE_WEBHOOK_SECRET`. Test mode first if you like. Steps: `docs/licence-server.md`, Part 4.

## 5. Resend (10 minutes)

The sending domain verified, an API key with sending access → `RESEND_API_KEY`; `MAIL_FROM` and `REPLY_TO` as you answer
question 2 below. Steps: `docs/licence-server.md`, Part 5.

## 6. Google (30 minutes)

A new Google Cloud project named Gdex; the Google Drive API; branding (name Gdex, support email, home page, privacy and
terms addresses, authorised domain crowmade.app); the one scope `…/auth/drive.appdata`; a Web application client with the
JavaScript origins `https://gdex.crowmade.app` and `http://localhost:47861`; publish the app; give the developer the
client id (it goes in `js/cloud-config.js`). Until then the Google Drive card says "Not set up yet". Steps:
`docs/drive.md`.

## 7. Code signing (optional)

Unsigned desktop builds work, with warnings when they are opened. To sign: the Apple Developer ID certificate and
notarisation secrets and the Azure signing secrets, in the Gdex repository. Steps: `docs/desktop.md`.

## 8. Downloads (15 minutes)

A new R2 bucket `gdex-downloads` with the custom domain `gdex-download.crowmade.app` (its own bucket, so nothing made for
Gdex can ever overwrite Vdex's installers or updates). Uploads by hand (the Cloudflare dashboard, or `wrangler r2 object
put` from your own computer) in the order `docs/desktop.md` gives; if you want CI uploads later, an R2 token scoped to
`gdex-downloads` only. The address is built into every desktop app for good, so it is settled before the first release.

## 9. Then "publish", in this order

Each step only with your go-ahead.

**(0) The work on `main`.** The developer merges the finished work into `main` and pushes it, with your go-ahead.
Publishing runs from `main` only: the publish workflow refuses any other branch, and GitHub shows **Publish Gdex** under
Actions only once its file (`.github/workflows/publish.yml`) is on the repository’s default branch, which must be
`main` (Settings → General → Default branch). Every later change to be published, such as (d)'s, goes onto `main` the
same way first.

**(a) The website and the Worker, with licences still off.** Actions → **Publish Gdex** → **Run workflow** on `main`,
type `publish gdex`, then approve the run when GitHub asks. It runs every test (licences off and on), stamps the build,
checks the configuration is Gdex's own, publishes, and checks the live site. Look at https://gdex.crowmade.app: every
role is free, nothing about licences shows.

**(b) The shop.** In Cloudflare, on the Worker **gdex**: the shop key (step 3), Stripe's settings (step 4), Resend's
(step 5). Check `/buy`, a test purchase, the thank-you page, the email, and a refund (`docs/licence-server.md`, Part 7).

**(c) `WEB_SIGN_IN = on`** (a Text variable on the Worker gdex). Nothing changes on the website yet.

**(d) The website's licence switch.** A commit (by the developer, with your go-ahead) that changes one line in
`js/licence-config.js`:

```js
export const LICENCE_SITES = ['gdex.crowmade.app'];
```

and, in the same commit, the expectation in `tests/specs/07-groundwork.cjs` that guards the switches (so no other session
flips one by accident). The line

```js
ok('the owner’s switches are off in the repository: LICENCE_SITES is [] and desktop/licence-on.json is { "on": false }', same(sites, []) && same(desk, { on: false }), JSON.stringify([sites, desk]));
```

becomes

```js
ok('the owner’s switches: the website’s licence is live on gdex.crowmade.app, the desktop app’s is off', same(sites, ['gdex.crowmade.app']) && same(desk, { on: false }), JSON.stringify([sites, desk]));
```

and, further down the same file, the line

```js
        ok('…the site is not a licence site, and nothing about a licence is kept on the device', same(L.sites, []) && L.licence === null && L.terms === null, JSON.stringify(L));
```

becomes (the tests' own address is still not a licence site)

```js
        ok('…the site is not a licence site, and nothing about a licence is kept on the device', same(L.sites, ['gdex.crowmade.app']) && L.licence === null && L.terms === null, JSON.stringify(L));
```

and the same in `tests/specs/75-licence-off.cjs`, whose line

```js
    ok('the repository’s switch is off: LICENCE_SITES is []', /export const LICENCE_SITES = \[\];/.test(repo));
```

becomes

```js
    ok('the repository’s switch: the website’s licence is live on gdex.crowmade.app', /export const LICENCE_SITES = \['gdex\.crowmade\.app'\];/.test(repo));
```

(the publish runs every test first, so a commit that changes one without the others is never published).

The public keys must already be in `desktop/licence-keys.json` and `js/licence-keys.js` (step 3): the publish workflow's
guard refuses to publish live licences without them. Then publish as in (a). From then on every browser at
gdex.crowmade.app has the licence: the working roles have 30 free days from their first use on each browser, then need a
licence; the Audiophile stays free and sends nothing to the licence server. To pause it in an emergency, set
`WEB_SIGN_IN` to anything but `on`: within about 6 hours every role opens again (`docs/licence-server.md`, Part 6).

**(e) The desktop app's licence.** A release whose `desktop/licence-on.json` is

```json
{ "on": true }
```

with the keys built in (the desktop build refuses the switch on without keys), and, in the same commit, the expectation
in `tests/specs/07-groundwork.cjs` becomes

```js
ok('the owner’s switches are on: the website’s licence is live on gdex.crowmade.app, and the desktop app’s', same(sites, ['gdex.crowmade.app']) && same(desk, { on: true }), JSON.stringify([sites, desk]));
```

Built, signed if you chose to, and uploaded in the order `docs/desktop.md` gives.

## Questions for you

Answered:

- **What a free Audiophile keeps:** the calendar of the shows they go to and the bands they like; not the working boxes,
  sessions, rehearsals or anything about money. Built so (one constant, `FREE_KEEPS_WORK`, would free the boxes).
- **Agreeing to the terms in the app:** a one-time terms sheet the first time someone uses a working role; the free
  Audiophile never sees it. Built so.
- **Age:** 18 or over for everyone, Vdex's wording.
- **Desktop downloads:** Gdex's own bucket, gdex-download.crowmade.app.

Asked again before anything goes live (the build goes ahead with these defaults meanwhile):

1. **Stripe:** the same Stripe account as Vdex, or a separate one? With one account, every card statement shows the
   account's descriptor, unless you make it neutral. *Default: nothing in the code depends on it.*
2. **Resend:** which address Gdex's emails come from, and where replies go. Sending from gdex.crowmade.app means
   verifying a second domain, which may need a paid Resend plan; one Resend account shares its 100 free emails a day
   with Vdex. *Default: `MAIL_FROM` is a setting, defaulting to licences@gdex.crowmade.app.*
3. **Code signing:** the Apple and Windows signing you have for Vdex, for Gdex too (no new fee), or unsigned at first?
   *Default: the workflow signs only when the secrets exist.*
4. **The contact address** in Gdex's terms, privacy page and emails: the same as Vdex's? *Default: copied from Vdex's
   terms.*
5. **Backup files and the free days:** someone can save a backup file, open Gdex in a private window (fresh free days)
   and bring the backup back there. Accept that, or make a backup file carry the free-days start too? *Default: accept
   it.*
6. **Where the website is published from:** GitHub with the protected Environment `gdex-live` (step 2), or your own
   computer (`npx wrangler deploy --config wrangler.jsonc` after signing in to Cloudflare, no token in GitHub at all)?
   *Default: GitHub with the protected Environment.*
