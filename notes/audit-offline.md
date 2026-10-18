# Audit: the service worker and being offline (2026-10-18)

Read-only audit. **No behaviour was changed.** Every finding below carries the
failure it causes; the ones marked *observed* were reproduced against a production
build (`next build` + `next start`, headless Chromium, Supabase answered by a stand-in,
fake sessions in localStorage). "Offline" in those runs means a local proxy that
dropped every connection — not Playwright's `setOffline`, which does not reach the
service worker's own `fetch()` and made the first run serve real pages "offline"
(the same trap `harness/test-offline-rules.mjs` writes up for CDP).

There is one service worker, `web/public/sw.js`, registered for everybody at
`web/src/app/AppShell.tsx:194` (and again by `enablePush`, `web/src/lib/push.ts:41`).

---

## 1. Private data that outlives sign-out — the important one

**The service worker's own cache holds nothing private.** That part is right:

- Only same-origin GETs are touched (`sw.js:42-44`), so Supabase — every row, and every
  receipt photo, which is a signed URL on `*.supabase.co` — never goes near Cache
  Storage. `/api/*` is skipped outright (`sw.js:46`).
- Pages, `/i/` and `/q/` included, are network-only (`sw.js:70-71`); the one page stored
  is `/offline` (`sw.js:25`), which is prerendered at build time and carries no account
  data. `/i/<token>` is `force-dynamic` (`web/src/app/i/[token]/page.tsx:8`) and is sent
  `private, no-cache, no-store` (checked with curl), so it is not in the HTTP cache
  either. No `/i/` token ends up in any cache.
- *Observed:* after signing in, browsing and signing out, `invoiceover-v1` held 26
  entries: `/offline`, two icons and content-hashed `/_next/static` chunks. Nothing else.

**But sign-out leaves the account's data on the device elsewhere, and the next account
signed in on that device is handed it.** `signOut()` removes exactly one key, the
Supabase session (`web/src/lib/signOut.ts:67`). Everything else stays.

### 1a. The Free page draft — bank details, customer, lines, signature — passes to the next account *(observed)*

`free-invoice-draft` (`web/src/lib/freeInvoiceDraft.ts:34`, written at `:271`) holds
the issuer, **sort code and account number**, the customer's name and address and every
line; `free-invoice-signature` (`:35`, `:53-60`) holds the signature image and name.
Neither is keyed by user and neither is cleared at sign-out. `FreeInvoiceBuilder` seeds
its state straight from storage (`web/src/components/free-invoice/FreeInvoiceBuilder.tsx:60`)
and `defaultDraft()` puts the saved signature on every new invoice (`freeInvoiceDraft.ts:96`,
`:115-116`).

**Failure:** account A writes an invoice on the Free page and signs out. Account B signs
in on the same phone and opens `/free-invoice`. Observed field values on B's screen:
`A Plastering Ltd | Mrs Jones | 4 Elm Road | Skim ceiling | 1 | 450 | … | 20-00-00 | 12345678 | A. Person`.
B is shown A's bank details and customer, and anything B now issues from that page
carries **A's signature** and, unless B notices, **A's account number** — money paid
to the wrong person.

### 1b. A receipt photo left in the tab is read into the next account *(observed)*

The dashboard's iPhone-camera path stashes the photo in `sessionStorage`
(`web/src/app/page.tsx:185`, `web/src/lib/scanHandoff.ts:10-18`) and `/scan` takes it on
arrival (`web/src/app/scan/page.tsx:517`, `scanHandoff.ts:35-44`) whoever is signed in.
`signOut()` ends with `location.replace("/login")` in the **same tab**
(`signOut.ts:77`), and sessionStorage survives that.

**Failure:** the photo is taken but `/scan` never consumes it — the client navigation
at `page.tsx:191` fails with no signal and becomes `/offline` (§4c), or the app is
closed mid-way. The owner signs out. Whoever signs in next in that tab and opens Scan has
the previous person's receipt read with **their** token and offered for saving into
**their** books. Observed: after A signed out, `scan-handoff-capture` was still in
sessionStorage, and B opening `/scan` produced one `POST /api/scan` carrying it. It
also spends one of B's scans (`web/src/lib/scanLimit.ts:46-56`).

### 1c. Other per-account leftovers in localStorage (code-read)

- `company-register` (`web/src/lib/companyRegister.ts:66`, `:79`): client id → company
  number, registered name, address, status. Survives sign-out; readable by anyone with
  the device. Keyed by client id, so it never shows in another account's screens.
- `clients-not-duplicates` (`web/src/lib/duplicateContacts.ts:45`) and
  `receipts-link-skip` (`web/src/lib/supplierLinks.ts:40`): record ids only. Harmless,
  listed for completeness.

### 1d. Receipt photos in the browser's HTTP cache, behind week-long URLs (code-read)

Uploads use storage-js's default `cacheControl: "3600"` (`web/src/lib/receiptImages.ts:38`
passes none; the default is in `node_modules/@supabase/storage-js`), so a photo is served
cacheable and sits in the browser's own disk cache after sign-out. The URL it is filed
under is signed for **seven days** (`receiptImages.ts:13`, `:56`) and sign-out cannot
revoke it. **Failure:** on a shared or lent computer, anyone reading the browser cache
(devtools, a cache viewer) gets the photographs, and the URL keys still open them from
anywhere for up to a week. The app never links to a photo directly, so the URLs do not
land in history — this one needs somebody looking, not a careless tap.

### 1e. Notifications already on the lock screen stay (code-read)

`signOut()` unsubscribes push (`signOut.ts:34-35`) but does not close notifications
already shown. Those name customers and invoice numbers — "Mrs Jones opened invoice
INV-0042" (`web/src/app/api/invoice-links/seen/route.ts:46`, likewise
`quote-links/seen/route.ts:34`, `quote-links/respond/route.ts:57`). **Failure:** sign out
and lend the phone; yesterday's notifications are still in the notification centre.
Separately, signing out **with no signal** makes the row delete at `signOut.ts:35` fail
(swallowed at `:36-38`), so `push_subscriptions` keeps pointing at the device; whether
pushes then still arrive depends on whether the browser's own `unsubscribe()` completed
offline. Not verified.

---

## 2. What is cached, and for how long

| What | Where | Strategy | How long |
|---|---|---|---|
| `/offline`, `/icon-192.png`, `/icon-512.png` | precached on install, `sw.js:25` | — | Until `sw.js` itself changes byte-for-byte. Install never re-runs otherwise. |
| `/_next/static/*` | `sw.js:50-63` | cache-first, stored on first fetch | **For ever.** Never expires, never pruned. |
| `/vendor/*` (OpenCV 13 MB, pdf.js worker) | `sw.js:50` | cache-first | For ever, on top of `Cache-Control: immutable, max-age=31536000` (`web/next.config.ts:22-23`). |
| `/icon-*` (any) | `sw.js:50` | cache-first | For ever. |
| pages, `/api/*`, other origins | — | not cached | — |

### 2a. The cache name never changes, so nothing is ever deleted

`const CACHE = "invoiceover-v1"` (`sw.js:18`) is a constant, and `activate` deletes only
caches with a *different* name (`sw.js:35`). No deploy bumps it. So the clean-up branch
is dead code and every deploy's fetched chunks are added to the same cache for good.
**Failure:** a phone used daily since September carries the chunks of every deploy it
ever ran (a build's `.next/static` is 4.7 MB; this repo deploys several times a day),
growing until the browser's quota evicts the origin's storage wholesale — which on
eviction also takes the service worker and with it the offline page. Nothing in the app
would say so.

`harness/test-offline-rules.mjs:21` passes "the cache is versioned, and old versions
are deleted" because the strings `-v1` and `caches.delete` are present; it cannot see
that the version never moves.

### 2b. `/offline` is frozen at whichever deploy first installed the worker

`sw.js` last changed on 2026-09-26 (`f31dd62`). Every device that installed it since has
the `/offline` HTML of the deploy it happened to install on, and keeps it. That HTML
references that deploy's chunks, which are served only if they happen to be in the cache
(they are never fetched for it: `addAll` stores the HTML, not what it loads).
*Observed:* on a fresh profile, 12 of the 13 chunks the cached `/offline` references were
in the cache and 1 was not. It rendered fine in every run here, styled and hydrated. The
failure is time: the page's wording, header and `Gate` logic are September's for ever,
and the day a chunk it needs is missing it renders unhydrated (its "Try again" is a plain
`<a>`, `web/src/app/offline/page.tsx:32`, so it still works).

### 2c. `/vendor/opencv-5.0.0.js` is not content-addressed

The name is fixed (`web/scripts/copy-vendor.mjs:15`, `web/src/lib/opencv.ts:6`) while
`package.json` allows `^5.0.0-release.1`, and `copy-vendor` overwrites the same name when
the size changes (`copy-vendor.mjs:30-32`). **Failure:** the day the package moves, every
device that has the old file keeps it for ever — cache-first in the worker, `immutable`
for a year in the HTTP cache — while the app's code expects the new one. The pdf.js
worker is versioned in its name (`copy-vendor.mjs:16`) and is fine.

---

## 3. Can a stale bundle outlive a deploy?

**Mostly no, and that is by design.** HTML always comes from the network (`sw.js:70-71`),
so any full load gets the current build; cached chunks are content-hashed, so serving
one can never be wrong for the HTML that asked for it.

**A client navigation self-heals.** Next compares the build id on every RSC response and
does a full page load when it differs
(`web/node_modules/next/dist/client/components/router-reducer/fetch-server-response.js:175-177`).

**What does not self-heal: a lazy import inside a page that is already open.** The
iPhone home-screen app is resumed, not reloaded, for days (the reason behind
`receiptImages.ts:11-13`). After a deploy, the open old bundle asks for one of *its* chunks
when the scanner, PDF export or a converter loads. Without Vercel Skew Protection (none is
configured) the production URL no longer serves that hash. If the chunk is in the SW
cache it works (the worker helps here); if not, Turbopack throws `Failed to load chunk …`
and `error.tsx` catches it.

**How somebody gets out:** they mostly don't, from inside the app. "Try again" is
`reset()` (`web/src/app/error.tsx:21`), which re-renders the same old bundle and the same
failed import; "Dashboard" is a client `<Link>` (`error.tsx:24`), which does reach a new
build id and reloads — but only if they think to press it. In a home-screen app there is
no reload button: the way out is swiping the app away and opening it again. **Failure:**
he opens the app from the home screen on a morning after a deploy, taps Scan, sees
"Something went wrong on this page", presses Try again, sees it again.

(The error reporter's noise list filters `Failed to fetch dynamically imported module`,
`web/src/lib/errorReport.ts:41`, which is the Vite/ESM wording, not Turbopack's; so these
*would* be reported. Worth knowing before somebody "fixes" the list.)

---

## 4. What happens to work done offline

There is **no offline queue of any kind** — no IndexedDB, no Background Sync, nothing in
the worker handles a non-GET (`sw.js:42`). Every write is a live Supabase call.

### 4a. A receipt or an invoice typed in, then Save

Supabase throws, `saveFailed` turns it into "Couldn't reach your records. Check your
connection and try again." (`web/src/lib/errorText.ts:23-24`), shown by
`web/src/app/receipts/new/page.tsx:252` and `web/src/app/invoices/new/page.tsx:650`. The
form stays filled. **That part is right.**

Two edges. On one bar, the photo upload can fail while the insert then succeeds:
`storeImages` deliberately keeps the photo inline as a multi-megabyte `data:` URL in the
row (`receiptImages.ts:43-46`), which the photo-ageing and storage rules never see. And an
insert that commits but whose reply is lost reads as a failure; pressing Save again makes
a second receipt (the scan flow's duplicate check catches some of these, typed receipts
have none).

### 4b. A scan

The photo lives only in React state on `/scan`; the read fails with the same sentence.
The scan is charged only after a successful read (`scanLimit.ts:46-56`), so a failed read
costs nothing — but a read whose reply is lost on one bar is charged and shows as a
failure. The offline page's advice — take photos with the phone's own camera and scan
them in later (`offline/page.tsx:20`) — is the whole of offline scanning, as CLAUDE.md says.

### 4c. Tapping any link offline destroys unsaved work, under a page that says nothing was lost *(observed)*

A `<Link>` tap with no signal: the RSC fetch fails, Next falls back to a full navigation
(`fetch-server-response.js:242`; the wait-for-signal path at `:226` is behind
`__NEXT_USE_OFFLINE`, which is not set), the worker answers that with `/offline`, and the
page that was open is gone.

**Failure, observed:** on `/receipts/new` with "Screwfix 4417" typed in, signal dropped,
tap "Receipts & bills" in the header. The screen became "No signal just now — **Nothing
has been lost.**" (`offline/page.tsx:15`). Signal back, press Back: `/receipts/new` with
the field empty. The same happens to a half-written invoice, and to every photo in a
`/scan` batch walk. No form has a `beforeunload` guard (the only one is Settings,
`web/src/app/settings/page.tsx:260`).

---

## 5. Is `/offline` shown when CLAUDE.md says it should be?

CLAUDE.md: "the offline page is shown exactly when the sign-in check cannot be made."

| Case | Shown? |
|---|---|
| Signed in, full load, no connection | **Yes**, at the address asked for (observed: `/vat` showed "No signal just now"). |
| Signed in, link tapped, no connection | **Yes**, via the full-navigation fallback — at the cost in §4c. |
| Signed out, no connection | **Yes, but at `/login`** (observed). The served page has the requested path, `Gate` sees a private path and no user (`AppShell.tsx:232`), redirects, that navigation fails too and is answered with `/offline` again. Harmless; the address bar is wrong. |
| **One bar: connection accepted, never answered** | **No.** *Observed:* a navigation sat on a blank tab for the whole 25 s the probe waited. The worker's `fetch` has no timeout (`sw.js:71`), so the fallback runs only on an outright refusal — never in exactly the depot-and-lay-by signal the comment at `sw.js:3-6` was written for. |
| Before the worker has ever installed, or after the browser evicted it (§2a; Safari also clears a tab's site data after seven days unused) | **No** — the browser's own page. Not verified on an iPhone. |
| Signal fine, Supabase unreachable | Not the worker's business: the page loads and the app's own `loadFailed` messages apply. |

`harness/test-offline-rules.mjs:88` accepts any text matching
`offline|no signal|connection|internet`, which Chrome's own "No internet" error page
also matches; so the check that the offline page appears would pass if the worker's
fallback stopped working.

---

## Noticed in passing, not part of this audit

`FreeInvoiceBuilder` starts its engine as `"claude"`
(`web/src/components/free-invoice/FreeInvoiceBuilder.tsx:63`) while CLAUDE.md says Gemini
is the default everywhere since 2026-10-15. Not traced further.

## How this was checked

`npm ci`, `next build` and `next start -p 3100` from `web/` (dummy anon key; Supabase
answered by Playwright routes), Chromium from `/opt/pw-browsers`, five throwaway probe
scripts in the session scratchpad (not committed). A proxy on :3200 had three modes:
pass through, drop every connection (offline), and accept without answering (one bar).
Header checks by curl against the same server. Section 1c, 1d and 1e and §2c are from
reading the code, not from running it.
