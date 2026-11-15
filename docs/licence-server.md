# Tourbook's licence server: setting it up and running it

Tourbook's working roles (Producer, Manager, Band, Solo artist, Scout and Jack of Trades) are free for **30 days on each
device**, then need a licence: **20 US dollars once** (plus the tax where the buyer lives) for **up to 3 devices**, bought
through Stripe, plus **free codes you make yourself**. The Audiophile role is free for good, for personal use (the terms
say it is not for work, which needs a working role: section 3), and Google Drive is free for everyone. The licence
covers the website (people sign in with the email address they bought with; a website sign-in takes no device place)
and the desktop app for Windows, Mac and Linux (each computer takes one of the 3 places).

Everything here is Tourbook's own, apart from Vdex's in every way: its own Cloudflare Worker (`tourbook`, at
**https://tourbook.crowmade.app**), its own licence store (`tourbook-licences`), its own keys, its own Stripe product and payment
link, its own webhook and its own emails. Nothing of Vdex's is changed by any step here, and a Vdex code or a Vdex
purchase never unlocks Tourbook.

This guide is everything only the owner can do. `docs/go-live.md` is the whole list in order, with the website, the
desktop app and Google Drive; this page is the licence server's part of it. **Nothing is published until you say
"publish".**

## What happens until you finish

Nothing changes for anyone. Licences are switched off **in the build itself**: the website asks for nothing while
`js/licence-config.js` lists no site, and the desktop app while `desktop/licence-on.json` says `{ "on": false }`. While
they are off, every role is free, nothing about licences is shown, and Tourbook sends nothing at all to the licence server.
Only the publish and the release you approve at the very end switch them on.

Even once switched on, the website's licence **pauses itself** (every role opens again) until the server has everything
a buyer needs: your switch `WEB_SIGN_IN`, the emails (Resend), the shop key, Stripe's key and payment link, and the Buy
address. So a site published before the shop is ready never locks anyone out.

## How it works, in short

- **Buying:** the **Buy** buttons (on the website, in the desktop app and on the download page) open
  `tourbook.crowmade.app/buy`, which goes to your Stripe payment page. After paying, Stripe sends the buyer to a thank-you
  page that shows their code, and the code is emailed to them too.
- **The code** is a long line starting `TOURBOOK-` with the buyer's name and email inside, signed so it can't be made up or
  changed.
- **On the website**, a person in a working role signs in with the email address their licence belongs to: Tourbook emails
  them a 6-digit code to type in. The website then checks the licence about once a day.
- **In the desktop app**, the code is entered once (Settings → About & licence → Enter licence code). The first time,
  the app adds the computer at tourbook.crowmade.app, which keeps a list of the computers on each code (a random number for
  that install and "Mac", "Windows" or "Linux"; nothing about the person or the hardware). A fourth computer is offered
  to move the code from one of the others, up to 3 times in 30 days. The app checks about once a week, and needs the
  internet at least once every 90 days.
- **Refunds and disputes:** refund in Stripe as usual. The code is cancelled automatically, and the working roles become
  read-only on its devices at their next check. A partial refund keeps the code. A dispute you win stays cancelled until
  you restore the code (Part 8).
- **Free codes:** you make them on your own computer with the licence generator page, and email them yourself.
- **After the free days, without a licence:** the working roles are read-only on that device (everything opens, prints
  and shares; nothing can be changed). Audiophile stays free. Nothing is ever deleted.

## What each key can reach (read this first)

| Credential | Where it lives | What it can reach |
|---|---|---|
| Cloudflare API token (from the "Edit Cloudflare Workers" template) | **only** in the GitHub Environment `tourbook-live` of the Tourbook repository | **every Worker in your Cloudflare account, Vdex's included.** Cloudflare cannot limit a token to one Worker, only to an account and a zone. So it never goes into repository secrets, the publish workflow waits for your approval every time, and it refuses to deploy anything whose name is not `tourbook` or whose address is not tourbook.crowmade.app. |
| R2 token (only if you want CI uploads later) | GitHub, Environment `tourbook-live` | only the bucket it is scoped to, `tourbook-downloads`. It cannot touch Vdex's downloads. Uploading by hand needs no token at all. |
| `LICENCE_SHOP_KEY` | a secret on the Worker `tourbook` in Cloudflare | signs Tourbook's paid codes, activations and website sign-ins. Not Vdex's: Vdex's apps never accept it. |
| Your key (1) and the spare (9) | key files on your computer, locked with your passphrase, and paper backups | free codes, and your signed requests to look up, clear, cancel, restore and link codes |
| Stripe restricted key | a secret on the Worker | reading Checkout Sessions only (no refunds, no payouts, no customers), but **every Checkout Session in the Stripe account**: Tourbook is sold from the same account as Vdex (your choice, `docs/go-live.md`, Answered), so Vdex's buyers' too, with their names, email addresses and billing addresses. Only a separate Stripe account for Tourbook would keep them out of its reach. |
| Resend API key | a secret on the Worker | sending email from the one domain it is made for (Part 5, step 3: tourbook.crowmade.app) only. Never make it for a domain Vdex sends from (vdex.crowmade.app): such a key **can send email as Vdex**. |
| `MAC_CERT_P12` and `MAC_CERT_PASSWORD` (your Developer ID Application certificate), only if you sign | **only** in the GitHub Environment `tourbook-sign` | **signing any Mac app as you, Vdex's included**: whoever has both can ship software under your name. |
| `APPLE_ID`, `APPLE_APP_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID`, only if you sign | GitHub, Environment `tourbook-sign` | notarizing any app under your Apple team; and the app-specific password signs in to your Apple Account wherever Apple accepts one (iCloud mail, contacts and calendars in other apps). Revoke it at account.apple.com if it leaks. |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` (the signing app registration), only if you sign | GitHub, Environment `tourbook-sign` | **signing any Windows file with your certificate profile, Vdex's included** (the "Artifact Signing Certificate Profile Signer" role you gave it). Delete the client secret in Microsoft Entra ID if it leaks. |

## What it costs

| | Cost |
|---|---|
| Stripe with Managed Payments (Link is the seller, and handles sales tax and VAT) | about 1.58 USD of each 20 USD US card sale, about 1.88 USD on a non-US card. No monthly fee. |
| Resend (emails the codes) | free up to 3,000 emails a month (100 a day) and 3 verified domains, **shared with Vdex on the same Resend account**: tourbook.crowmade.app is its second domain, so no paid plan is needed. |
| Cloudflare (the website, the shop, the licence store) | free within the allowances, **shared with Vdex in the same account**: 100,000 Worker requests a day, 1,000 writes a day to the licence stores together (a sign-in uses about one), and the free plan's daily Durable Object requests (Tourbook's sign-in codes: about two per sign-in). Workers Paid (5 USD a month) raises them. |

Tourbook sends at most **30** sign-in emails a day (Vdex 60), so the two together stay under Resend's free 100 a day and
purchase emails always have room. On a paid Resend plan, raise it with the setting `SIGN_IN_EMAILS_PER_DAY`.

---

## Part 1. The Cloudflare token, in a protected Environment (15 minutes)

1. Sign in at https://dash.cloudflare.com with the account that holds crowmade.app.
2. Top right, your profile icon → **My Profile** → **API Tokens** → **Create Token**. (Newer layouts: **Manage account** →
   **Account API tokens** → **Create Token**.) Next to **Edit Cloudflare Workers**, press **Use template**. Under
   **Account Resources** choose your account; under **Zone Resources**, **Specific zone** → **crowmade.app**.
   **Continue to summary** → **Create Token**, and copy it straight away: Cloudflare shows it only once.
3. **Workers & Pages** → on the right, **Account Details** → copy the **Account ID**.
4. In Tourbook's repository on GitHub (**TheCrowBro/Gdex**): **Settings → Environments → New environment**, name `tourbook-live`.
   - **Required reviewers:** yourself, if GitHub shows it. On a private repository GitHub offers it only with Enterprise,
     so it may be missing: skip it then (the workflow still runs only by hand, on `main`, with the words). Tick
     **Prevent self-review** only if someone else will approve.
   - **Deployment branches and tags:** **Selected branches** → add `main` only.
   - **Environment secrets → Add secret**, twice: `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (the
     account ID).

   Put them **only** here, never under the repository's own secrets: then only the publish workflow, on `main` (after you
   approve it, where there is a required reviewer), can use them.

(If you would rather publish from your own computer, with no token in GitHub at all: `npx wrangler login`, then in the
repository `node tools/stamp-build.mjs`, `node tools/stage-site.mjs cloudflare/site --cloudflare`, and in `cloudflare/`,
`npx wrangler deploy --config wrangler.jsonc`. Always name the file: without it, Wrangler takes the first
`wrangler.json`, `wrangler.jsonc` or `wrangler.toml` it finds in that folder or any folder above it. Say so and the guide
changes; nothing in Tourbook depends on which.)

## Part 2. Make Tourbook's licence keys (15 minutes, on your own computer)

1. Open **`tools/licence-generator.html`** from the repository (save it on your computer and double-click it). It opens in
   your web browser, works with no internet, and sends nothing anywhere while making keys and codes. It is Tourbook's own:
   never use Vdex's generator or Vdex's keys for Tourbook.
2. Under **First time only: make your keys**, type a passphrase of 12 or more characters twice and press **Make my
   keys**. Keep the passphrase in your password manager: without it the key files are useless, to you as well.
3. Three files land in your Downloads:
   - `tourbook-licence-key-1.json`: your key, for making free codes.
   - `tourbook-licence-key-2-shop.json`: the shop's key (Cloudflare uses it; you need the file only if you ever set the shop
     up again).
   - `tourbook-licence-key-9-spare.json`: a spare that replaces your key if it is ever lost or leaked.

   Copy all three to two safe places (for example a USB stick and your password manager), with the spare apart from the
   others. Keep them, and Tourbook's ledger (`tourbook-ledger.csv`, Part 8), apart from Vdex's.
4. The page then shows three boxes:
   - **Public keys**: copy the whole line and send it to the developer. It is not secret. It goes into
     `desktop/licence-keys.json`, and `node tools/licence-keys.mjs` writes the website's copy (`js/licence-keys.js`).
     Committing the keys **switches nothing on**: the switches are separate (`docs/go-live.md`).
   - **The shop key**: you paste this into Cloudflare in Part 3. **Never email it or share it.**
   - **Paper backups**: write both down on paper and keep them like cash. Anyone holding one can make codes.

## Part 3. Give the shop its key (5 minutes, after the first publish)

The Worker `tourbook` exists once the website has been published the first time (`docs/go-live.md`, step 9(a)).

1. https://dash.cloudflare.com → **Workers & Pages** → the Worker **tourbook** (never **vdex**) → **Settings** → **Variables
   and Secrets** → **Add**.
2. Type: **Secret**. Variable name: `LICENCE_SHOP_KEY`. Value: the shop key from Part 2, step 4. **Deploy** (or
   **Save**).

Every setting in this guide goes in the same place, on the Worker **tourbook**, as a **Secret** (or a **Text** variable for
`WEB_SIGN_IN` and the numbers). Publishing a new version keeps them.

## Part 4. Stripe (about 40 minutes, plus Stripe's checks)

Tourbook is sold from the same Stripe account as Vdex (your answer, decisions §20; `docs/go-live.md`, Answered). With
one account, every card statement shows that account's descriptor, so make it neutral (for example the name you trade
under) before Tourbook goes on sale, and Tourbook's restricted key (step 7) reads every order in the account, Vdex's
included. Tourbook's Worker only ever makes codes for payments through **Tourbook's own payment links**, so a Vdex
purchase on the same account never makes a Tourbook code, and a Vdex refund never cancels one.

1. **Account** (skip what is already done): **Settings → Business**: business details, website, a product description
   ("One-time licence for the Tourbook app (downloadable software)"), a statement descriptor of 5 to 22 characters, your
   bank account for payouts. **Settings → Business details**: a support email you read (Stripe may refund a buyer itself
   if nobody answers within 48 hours).
2. **Managed Payments:** https://dashboard.stripe.com/settings/managed-payments → on (Link becomes the seller of record,
   and works out, collects and pays sales tax and VAT).
3. **Public details:** **Settings → Checkout** (or **Public details**): the terms `https://tourbook.crowmade.app/terms.html`
   and the privacy policy `https://tourbook.crowmade.app/privacy.html`.
4. **Product:** **Product catalog → Create product**: name **Tourbook licence**, description "One-time licence for Tourbook's
   working roles, for up to 3 devices", tax code **Downloadable Software - business use**, price **One-off, 20.00 USD**,
   **Include tax in price: No** (the checkout adds the tax where the buyer lives).
5. **Payment link** (on the website, not the phone app): **Payment Links → New**, the product, quantity 1.
   - **Enable Managed Payments** ticked (it can't be changed later).
   - **Require customers to accept your terms of service** ticked.
   - **After the payment** → redirect to your website, exactly as written, braces included:
     `https://tourbook.crowmade.app/licence/thanks?session_id={CHECKOUT_SESSION_ID}`
   - **Advanced options → Add custom text → Near the Pay button:** `You are buying a licence to use Tourbook, not ownership
     of a copy. It can be cancelled in the cases the terms describe: tourbook.crowmade.app/terms.html`
   - **Create link.**
6. In Cloudflare (as in Part 3), two secrets:
   - `BUY_URL`: the link's address, starting `https://buy.stripe.com/`.
   - `STRIPE_PAYMENT_LINK`: the link's ID, starting `plink_` (at the end of the address bar when you open the link in
     the Dashboard). Only payments through this link get a Tourbook code.
7. **Restricted key:** https://dashboard.stripe.com/apikeys → **Create restricted key** → from zero permissions → name
   "Tourbook licence Worker" → **Checkout Sessions: Read**, everything else None → **Create key**. Copy the value starting
   `rk_` straight away and add it in Cloudflare as `STRIPE_SECRET_KEY`.
8. **Webhook:** **Workbench → Webhooks → Create an event destination** → Your account → the events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded` and
   `charge.dispute.created` → **Webhook endpoint** → `https://tourbook.crowmade.app/licence/stripe-webhook` → **Create**.
   **Reveal** the signing secret and add the value starting `whsec_` in Cloudflare as `STRIPE_WEBHOOK_SECRET`.

Stripe's test mode ("Sandbox") has its own link, keys and webhook: you can do steps 4 to 8 there first and try a test
card, then do them again in live mode and replace the Cloudflare secrets with the live ones. **While you test, leave
`BUY_URL` unset** (the website and `/buy` then say the licence is not on sale yet, and the website's licence stays
paused) **and open the test payment link directly** from Stripe's Dashboard, so nobody else reaches a test checkout; set
`BUY_URL` only to the live link. **A test purchase's code ends two days after it was issued** (Stripe marks a test
order `livemode: false`): the thank-you page and the email say until when, and its email signs in to the website only
until then, so no test purchase becomes a lasting licence. A live order's code never ends. You can still refund test
purchases in Stripe's test mode, or cancel a code in the generator (Part 8).

**Changing the price later:** a Stripe price can't be edited. In the product, **Add another price**; make a new payment
link with it exactly as in step 5; in Cloudflare set `BUY_URL` to the new link's address and `STRIPE_PAYMENT_LINK` to
both IDs, new first, separated by a comma (`plink_new…,plink_old…`), so earlier purchases keep their codes and
sign-ins. Archive the old price, and ask the developer to change the price in Tourbook (`js/tax.js`), on the download page
and in the terms.

## Part 5. Emailing the codes (10 minutes)

Tourbook's emails come from `Tourbook <licences@tourbook.crowmade.app>`, a crowmade address, as Vdex's come from
licences@vdex.crowmade.app (your answer, decisions §21); Resend delivers them, and the terms and the privacy policy
name it. That is the Worker's `MAIL_FROM` default, so there is nothing to set for the sender. Resend's free plan has
allowed 3 verified domains since 25 August 2026 (resend.com/changelog/three-domains-on-the-free-tier; the plan today:
resend.com/pricing), so tourbook.crowmade.app is a second domain on the same Resend account as Vdex, sharing its 100
free emails a day: no paid plan is needed. Replies go to support@crowmade.app, the contact address the terms and the
privacy policy give, as Vdex's and crowmade.app's do (your answer, `docs/go-live.md`, Answered): that is `REPLY_TO`,
step 4. crowmade.app's mail goes through Cloudflare Email Routing (its MX records are route1–3.mx.cloudflare.net), so a
reply reaches whatever inbox its routing rules send support@crowmade.app to; Part 7 checks one does.

1. Sign in at https://resend.com (or sign up).
2. **Domains → Add domain** → `tourbook.crowmade.app` → **Sign in to Cloudflare** and allow it, so Resend adds its records
   itself. Wait for **Verified**. (It sits beside vdex.crowmade.app in the same account: the free plan allows 3 domains.
   Never send Tourbook's email from a domain Vdex sends from: a Resend key made for it can send email as Vdex.)
3. **API Keys → Create API key** → name "Tourbook licences", permission **Sending access**, domain `tourbook.crowmade.app` →
   copy the value starting `re_` and add it in Cloudflare as `RESEND_API_KEY`.
4. Add `REPLY_TO` in Cloudflare before the shop opens: support@crowmade.app, the contact address. The terms
   (section 3) tell buyers they can cancel by replying to the email their licence came in; without `REPLY_TO` a reply
   goes to licences@tourbook.crowmade.app, which has no inbox set up. Leave `MAIL_FROM` unset: its default is the
   sender above.

Without Resend, buyers still see their code on the thank-you page, but the website's sign-in stays paused (it works by
emailing a code).

## Part 6. Switching the website's licence on (when you are ready)

Do Parts 1 to 5 first, try the shop (Part 7), and have a lawyer you choose read the terms and the privacy policy
(`docs/go-live.md`, 9(d)). Then, in this order:

1. **In Cloudflare**, add a **Text** variable `WEB_SIGN_IN` with the value `on`. Nothing changes for anyone yet: the
   published website still lists no licence site.
2. **Tell the developer to switch the website on.** That is a commit that sets `LICENCE_SITES = ['tourbook.crowmade.app']`
   in `js/licence-config.js` (`docs/go-live.md`, step 9(d)), published by the publish workflow, which checks the public
   keys are built in first. From then on, every browser at tourbook.crowmade.app has the licence: a working role there has
   30 free days from the first time it is used on that browser, then needs a licence. An Audiophile who never uses a
   working role, and brings in no free days from a backup file or Google Drive, sends nothing to the licence server.
3. **Try it:** in a private browser window open https://tourbook.crowmade.app, pick a working role, then Settings → About &
   licence → **Sign in**, with a licence that is live: for example a free code you made for your own email address
   (Part 8; the generator links it). A refunded or cancelled purchase, test or not, cannot sign in.

A browser asks the server whether licences are live at most every 6 hours, and the server's answer is kept by caches for
5 minutes, so a change of `WEB_SIGN_IN` reaches everyone within about 6 hours.

**Pausing** (an emergency): set `WEB_SIGN_IN` to anything but `on` (or delete it). Within about 6 hours every role opens
again on the website. The free days keep counting by the calendar meanwhile: a pause only lifts read-only while it
lasts. (The desktop app has its own switch, `docs/desktop.md`.)

Who can sign in on the website: anyone who bought through the shop (with the email they paid with, found in Stripe if
the webhook never arrived), anyone you made a free code for with an email address (the generator links it when you
make the code, or **Link for website sign-in** later), and anyone who entered their code in the desktop app. Someone
with a code can also use **Have a licence code? Use it instead**: the sign-in code then goes to the email address inside
it.

## Part 7. Try the shop (30 minutes)

1. Open https://tourbook.crowmade.app/buy: it goes to your payment page (until `BUY_URL` is set it says the licence is not
   on sale yet).
2. Buy a licence yourself. Check the thank-you page shows a code, the email arrives, a reply to it reaches the contact
   address, support@crowmade.app (`REPLY_TO`, Part 5), and (once the desktop app is released, `docs/desktop.md`) **Enter licence code**
   activates it.
3. Refund yourself in Stripe. The code is cancelled within a minute: the generator's **Look up** says CANCELLED (refund),
   the thank-you page now says the order was refunded (and shows no code), and the website signs out at its next daily
   check. Stripe keeps its fee on a refund.
4. Make a free code in the generator (Part 8) and sign in with it on the website.

## Part 8. Everyday

**A free licence for someone.** Open the generator page → unlock `tourbook-licence-key-1.json` with your passphrase → open
your ledger (`tourbook-ledger.csv`, after the first time) → fill in their name and email (leave **Free licence** ticked; set
an end date if it is for a limited time) → **Make code** → **Write the email** opens your email program with the code
and the steps → **Save ledger**. Keep the ledger with your Tourbook key files: it is the only list of the free codes you
have made. The generator refuses to open a Vdex ledger, so the two never mix.

**Someone lost a computer, or their licence is full.** In the app they can move it themselves 3 times in 30 days. Beyond
that: generator → **Look up, clear or cancel a code** → paste their code (or the ref from your ledger; for a purchase,
the email they bought with is in Stripe) → **Look up** shows its computers → **Clear its computers** lets them activate
afresh.

**Someone can't sign in on the website.** They must use the email address their licence belongs to (for a purchase, the
one they paid with). For a free code made while you were offline, or whose holder deleted their records, paste it in
the generator and press **Link for website sign-in**, or have them use **Have a licence code? Use it instead**.

**A code posted online, a chargeback, or a dispute you won.** Refunds and disputes cancel the code automatically. To
cancel any other code: generator → paste it → **Cancel the code**. **Restore a cancelled code** undoes it (for example
after you win a dispute).

**Someone asks to have their records deleted.** In Tourbook they can do it themselves: Settings → About & licence → **Delete
my licence records**, while signed in on the website. That removes their email's links and any sign-in code; the
licence itself, any cancellation, the times sign-in codes were sent that day (nothing else, so the limits hold) and the
list of computers on the licence (a random number per install, nothing about the person) with its recent moves (30 days)
stay, and so does a "records deleted" mark for 400 days, so sign-ins made before the deletion stay refused: the key is
`z:` and the SHA-256 of the address, not the address, though anyone who reads the store and knows an address can tell
from it that the address deleted its records, and when (privacy.html says so). Clearing the list would
free the licence's 3 places without a counted move, and each computer would put itself back at its weekly check. A
computer is taken off with **Release this computer** in the desktop app; if they ask you to delete the list too,
**Clear its computers** in the generator does it. A computer already on the list does not link the email again at its
weekly check: only putting the code on a new computer, or signing in again, does. A buyer signs in again with their
email (their order is found in Stripe); someone with a **free** licence has no order to be found by, so they sign in
again with their code (**Have a licence code? Use it instead**, as the sheet tells them), or you link it again.

**Your key is lost.** Unlock the spare (`tourbook-licence-key-9-spare.json`) and carry on; tell the developer, who makes you
a new key in the next version. Codes already made keep working. If a key file and its passphrase leaked, tell the
developer straight away.

## Never

- **Never stop the Worker tourbook or delete the licence store `tourbook-licences`** while licences exist: buyers' apps need it
  to activate and to keep working. If Tourbook ever stops being sold, the developer first publishes a version that no longer
  needs it, as the terms promise.
- Never paste Tourbook's shop key into Vdex's Worker, or Vdex's into Tourbook's; never use one app's generator, key files or
  ledger for the other.
- Never give the Cloudflare token to anything but the Environment `tourbook-live`.

## The Cloudflare settings, at a glance (Worker tourbook → Settings → Variables and Secrets)

| Name | From | Needed for | Missing means |
|---|---|---|---|
| `LICENCE_SHOP_KEY` (Secret) | the generator, Part 2 | everything: paid codes, activations, sign-ins | the shop is closed; the website's licence paused |
| `BUY_URL` (Secret) | Stripe payment link, Part 4 | the Buy buttons | /buy says "not on sale yet"; the website's licence paused |
| `STRIPE_PAYMENT_LINK` (Secret) | Stripe payment link ID, Part 4 | paid codes (Tourbook's link only) | no codes; the website's licence paused |
| `STRIPE_SECRET_KEY` (Secret) | Stripe restricted key, Part 4 | the thank-you page, the Stripe lookup | no codes; the website's licence paused |
| `STRIPE_WEBHOOK_SECRET` (Secret) | Stripe webhook, Part 4 | emails, refunds, disputes | webhooks refused |
| `RESEND_API_KEY` (Secret) | Resend, Part 5 | emails, the website's sign-in | codes only on the thank-you page; the website's licence paused |
| `REPLY_TO` (Secret or Text) | `support@crowmade.app`, the contact address, Part 5, before the shop opens | replies to the emails (the terms tell buyers they can reply) | no reply address: replies go to the sender, which has no inbox set up |
| `MAIL_FROM` (optional) | leave it unset, Part 5 | the sender | `Tourbook <licences@tourbook.crowmade.app>` |
| `WEB_SIGN_IN` (Text) | `on`, Part 6 | the website's licence | the website's licence paused: every role open |
| `SIGN_IN_EMAILS_PER_DAY` (optional) | a number | more than 30 sign-in emails a day, on a paid Resend plan | 30 |

---

## How it works (for the developer)

- `cloudflare/worker.mjs` answers only `/buy` and `/licence/…` (`assets.run_worker_first` in `cloudflare/wrangler.jsonc`,
  equal to `WORKER_ROUTES` in `tools/site-files.mjs` and `sw.js`; spec 82 checks all three). Every other address is a
  file from `cloudflare/site`, built by `tools/stage-site.mjs` (only the website's own files; `_headers` with each page's
  CSP from its own meta tag plus `frame-ancestors 'none'`, and `Cache-Control: no-cache, no-transform`, so Cloudflare's
  Web Analytics, on for the whole crowmade.app zone, adds no script to Tourbook's pages; the script's own pages say
  `no-store, no-transform`). An address that is none of those files reaches the script
  after the files (`not_found_handling: "none"`), which answers a GET or HEAD with a 404 page in Tourbook's look instead of
  the files' empty 404. The addresses and answers are the build spec's §3.9; spec 81 runs every one of them in workerd
  (Miniflare) with Stripe and Resend faked.
- It imports `desktop/licence-codes.cjs` (the code format, shared with the desktop app and the generator),
  `desktop/licence-keys.json` (the public keys) and `js/tax.js` (the price with tax per country).
- The licence store (KV `LICENCES`, created by Wrangler on the first deploy as `tourbook-licences`, no id in the config):
  `c:<ref>` the computers on a code and the recent moves; `x:<ref>` a cancelled code (refund, dispute, owner);
  `e:<email>` the licences an email can sign in with; `m:<date>` the day's count of sign-in emails (two days); `z:<hash>`
  a "records deleted" mark (400 days).
- Each email address's sign-in code (scrambled), its tries and the times codes were sent to it (for 5 an hour and 4 a
  day) are kept by a Durable Object of its own, `SignInCodes` in `worker.mjs` (binding `SIGNIN`, one object per address,
  created by Wrangler on the first deploy from the migration in `wrangler.jsonc`), and go a day after the last code was
  sent. Not KV: KV cannot change a value without a race, so guesses sent at the same moment each read the tries before
  any other wrote them back, and all of them reached the code. A Durable Object takes one request at a time, so every
  guess and every code asked for is counted (spec 81 sends 20 guesses and 10 requests for a code at once).
  A ref is `<key>:<serial>`: `2:` for shop codes (the serial from `sha256('tourbook-order|' + Checkout Session id)`, so the
  page, a reload and the email show the same code), `1:` or `9:` for codes you make.
- The website's status (`GET /licence/web/status`) is `{ on: true }` only with `WEB_SIGN_IN = on`, the store, Resend,
  a shop key matching key 2, Stripe's key, a payment link and an `https://` Buy address; anything else is
  `{ on: false }`, which pauses the website's licence (the build spec [S-9]). It is cached 5 minutes. Cloudflare adds a
  `Date` header to every answer, which the apps use to check a device's clock.
- Every value from Stripe, the store or a request goes into a page or an email only through `esc()`, and into an email's
  subject only through `plain()` (one line, 120 characters).
- To run its specs locally: `npm ci --prefix cloudflare` once (the Wrangler version is pinned in
  `cloudflare/package-lock.json`), then `node tests/run.mjs 81-`. Without it, spec 81 says SKIP (FAIL in CI).
- Publishing: `.github/workflows/publish.yml`, by hand only (`docs/go-live.md`): the tests in both legs, the stamp, the
  guard, the staged site, `wrangler deploy --config wrangler.jsonc` (the only Wrangler command in any workflow), then
  live checks. The guard refuses any other Wrangler configuration in the repository (`wrangler.json`, `wrangler.toml`, a
  `.wrangler/deploy/config.json` redirect: Wrangler would take them before the guarded file) and any key of
  `cloudflare/wrangler.jsonc` beyond Tourbook's own Worker, its licence store, its sign-in codes' Durable Object (exactly
  `SignInCodes` in this Worker, with its one migration) and its files (no binding to another Worker, bucket or
  database); spec 82 tries each on a tampered copy.
