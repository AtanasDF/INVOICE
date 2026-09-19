# Invoicer — working notes for Claude Code

Invoice and expense tracker for a UK freelancer (Atanas, GitHub AtanasDF). The data in
it is his real accounting record. Read this file before doing anything.

## Layout and stack

- `web/` — Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4
  (CSS-first, no tailwind.config), Supabase (Postgres + Auth + RLS). Run every npm
  command from `web/`.
- `worker/` — separate Cloudflare Worker for email inbox import (deploy steps were handed
  to Atanas; unconfirmed whether done).
- Live at https://invoice-omega-rust.vercel.app, auto-deployed from `main` by Vercel.
  Only `main` deploys (`web/vercel.json` `git.deploymentEnabled`): the Hobby plan allows
  100 deployments a day, and branch previews used them up on 2026-09-19.
  Supabase project `wecfwjxzyzzrcwbwnwpo`.
- `scanner-research.md` — competitor research and the scanner follow-up plan.
- `SESSIONS.md` — one entry per session, newest first; read it first, append yours last.
- `notes/claude-notes.md` — standing facts and preferences behind the rules (who Atanas
  is, verified DB state, decisions, references, queued work). Update it when a fact changes.
- `web/supabase/` — `schema.sql`, numbered migrations, numbered backup files. All hand-run
  in the Supabase SQL editor; there is no migration runner. A session can run them itself
  in Atanas's Chrome (claude-in-chrome) when he is signed in to Supabase: set the Monaco
  editor with `window.monaco.editor.getModels()[0].setValue(sql)`, click Run, read results
  from `[role="gridcell"]` / `[role="columnheader"]` textContent.

## Hard rules

1. **Never delete anything**: not data, rows, tables (including the many `*_backup_*`
   tables), files, or user records. If something looks like it should go, flag it and
   wait. Removing code you were asked to remove is fine.
2. **Schema changes** need two files in `web/supabase/`: `00N-backup-before-migration-0NN.sql`
   (snapshot the affected table with `create table ... as table ...`, enable RLS on the
   snapshot, commented restore steps) and `migration-0NN-<slug>.sql` (additive, idempotent:
   `add column if not exists`, guarded `do $$ ... $$` blocks for constraints/policies,
   `create or replace function`, explicit grants). A migration that only creates a
   function or table, or only redefines an FK's ON DELETE, needs no backup and must say so
   in its header. Check the latest numbers in the folder first. Latest as of 2026-09-19:
   migration-027, backup 013 (all applied); migration-028 (quote requests, new tables
   only) is on `feature/quote-requests`, not applied. Supabase grants anon/authenticated
   everything on a new table by default: revoke explicitly (see migration-020).
3. **Verify backups by content in both directions** (rows missing or different each way
   must be 0), not by row counts. Verify migrations afterwards (columns, constraints and
   their ON DELETE, policies, function grants) and exercise new functions as the
   `authenticated` role inside a transaction that ends in `raise exception` so it rolls
   back. Never claim a migration succeeded secondhand.
4. **Schema-dependent work goes on a feature branch and does not merge before the
   migration is applied.** Schema-free work can go straight to `main`.
5. Before calling anything done: `npx tsc --noEmit`, `npx eslint .`, `npm run build`
   from `web/`, all clean.
6. Never print secret values. `web/.env.local` is not in git; confirm a key's presence
   with `grep -c '^NAME=' web/.env.local` only.
7. Ambiguity in a brief: name it and state the assumption before building on it; do not
   guess silently.
8. **Every session ends with everything committed and pushed** to GitHub (`main` or the
   feature branch), so the repo is always current for the next session, wherever it runs.
9. **Keep the session log as you go, not only at the end.** Start every session with
   `git pull` and by reading the top of `SESSIONS.md`. Add your entry when the first
   real step completes and update it after each further step, so a session that is cut
   off mid-way still leaves a current log. Push after each completed step, not just at
   the end. Half-finished work that must leave the machine goes to a `wip/<topic>`
   branch, never to `main` (Vercel deploys every push to `main`).

## House style

Terse, comment-free code; a comment only explains *why*. No abstractions or error
handling for cases that cannot happen. Commit messages explain the reasoning or the bug,
not the diff. Match the existing conventions: page header `h1.text-2xl.font-bold` +
`p.mt-1.text-neutral-600`; cards `rounded-xl border bg-white p-5 text-neutral-900 shadow-sm`;
primary button `rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white`;
labels `text-xs text-neutral-500` above the control; badges `rounded-full px-2 py-0.5
text-xs font-medium` with a bg-X-100/text-X-800 pair. New UI is neutral greys only.

## How the data is modelled

- `invoices` and `credit_notes` are Atanas's own **sales** invoices (sequential numbering
  via `assign_invoice_number`, status draft/sent/partial/paid). Do not mix received
  documents into them. `invoices.vat_registered` (migration-024) is the VAT setting the
  invoice was issued under, saved by `assign_invoice_number`; drafts keep null. Total an
  issued invoice with `computeInvoiceTotals(items, invoiceVat(invoice, accountVat))`,
  never the account's current setting. Totals are penny-exact (VAT rounded per rate).
- Scanned supplier receipts, invoices and credit notes are **expense documents in
  `receipts`**: `document_type` (receipt | invoice | credit_note | other),
  `invoice_number`, `due_date`, `paid`, `details` jsonb, `credit_of_receipt_id`
  (composite FK with `user_id`, RESTRICT). Credit notes are stored with **negative**
  `amount` and `vat_amount`. Extra pages live in `receipt_pages` (page 1 stays in
  `receipts.image_data_url`); `create_receipt_with_pages` inserts both atomically.
  `receipts.amount` is net (ex VAT) in GBP. `image_data_url` (and receipt_pages') holds
  either an inline data: URL (older rows, or when storage was unreachable) or `storage:<uid>/<folder>/<n>.<ext>`
  in the private `receipts` bucket (migration-019), turned into 7-day signed URLs on read.
- `quotes` (migration-020): priced offers to a client, status draft/sent/accepted/
  declined/invoiced, editable only as drafts. Turn into invoice claims the quote (status
  invoiced, invoice_id null), makes a draft invoice tagged `from <quote number>` and links
  it; the quote page relinks by that tag if the link was lost. Quotes are never deleted.
  Deposits (migration-022): `deposit_percent` or `deposit_amount` (gross), claimed via
  `deposit_claimed`, invoiced on its own (`deposit_invoice_id`, tag `deposit for <number>`,
  lines per VAT rate, whole-penny prices); the final invoice adds the deposit invoice's
  lines negated (quantity -1), less anything credited against it. Maths in
  `src/lib/quoteDeposit.ts`.
- CIS on sales invoices (migration-027): `invoices.cis_rate` (20/30, null = not CIS) and
  each line's `kind` ("labour" | "materials", unmarked = labour) in `items`. The contractor
  keeps back the rate from the labour; `invoiceCharge()` (`src/lib/cis.ts`) gives the
  totals plus `cis` and `due` (total less CIS). Everything about what the customer owes
  (balances, status from payments, "Mark as paid", reminders, dashboard, list, emails, the
  issued/public invoice) goes by `due`; turnover and VAT by the totals. Credit notes come
  off `due`. The tax card counts CIS on this year's invoices as tax already paid.
- `invoice_payments` (migration-023): money received against a sales invoice (date,
  amount, method). The app sets the invoice status from credit notes and payments
  (`src/lib/invoiceBalance.ts`: paid once nothing is owed, credited in full included;
  part-paid while some is paid), after each payment or credit-note change on the invoice
  page (never just from opening it). An invoice marked
  paid/part-paid by hand before payments existed keeps its status. "Mark as paid" records
  the balance as a payment. An invoice with payments can't be deleted (RESTRICT).
- `invoice_links` (migration-025): a private link per issued invoice, `/i/<43-char token>`,
  made when the owner copies it or emails the invoice. The page (`src/app/i/[token]`) reads
  with the service role on the server (`src/lib/publicInvoice.ts`, every query scoped to
  the link's owner) and shows only what the PDF shows; noindex/no-referrer via
  `src/app/i/layout.tsx`. Opens are counted by `record_invoice_link_view` (service role
  only) from the page's own script, never for `#o` (the owner's email copy) or a
  signed-in browser; the first open pushes the owner. Owners may change only the token
  ("Stop this link"). The send route accepts only this app's own /i/ links.
- `quote_links` (migration-026): the same for quotes, `/q/<token>`, plus Accept / Decline.
  `respond_to_quote_link` (service role only) moves a quote from sent to accepted or
  declined only while it's sent and within valid_until; the owner putting it back to sent
  lets the customer answer again. Owner status changes pass the status the page showed
  (`quotesStore.setStatus(id, status, from)`, `claimForInvoice(id, from)`) so an online
  answer isn't overwritten unseen. Emailing a draft marks it sent only after the send
  works; copying its link, or adding it to a text/WhatsApp message, marks it sent first
  (after a confirm); a draft's link is never put in share-sheet text. The owner's `#o`
  copy shows no buttons. Quotes can go to any client or supplier; a supplier who has been
  invoiced gets the payment-reminder switch and history on the Suppliers tab.
- Payment reminders (`/api/reminders/send`, daily cron): schedule, wording and the
  late-payment-interest rule live in `src/lib/reminderTemplates.ts` (-3, 0, +7, +14 'late',
  +30 'final'; each has a 3-day catch-up window; `invoice_reminders_sent` unique
  (invoice_id, kind) is claimed before sending). The statutory-interest line goes only in
  the final notice, only with `business_profile.reminder_late_payment_interest`, only to
  clients with `is_company` true.
- A "bill" is `document_type = 'invoice' and paid = false`; it surfaces on the dashboard
  and in the push cron from 3 days before `due_date`.
- Suppliers are `clients` rows with `kind = 'supplier'`. A scanned document is linked to a
  supplier only when the form showed it (read-time match) or the names are exactly the same
  at save; no supplier is ever created without "Add as supplier". `receipts.details.noSupplier`
  marks "No supplier" picked on purpose, so the receipts list doesn't offer to link it.
- Quote requests (migration-028, branch `feature/quote-requests`): Atanas asking
  suppliers to price a list. `quote_requests` (items with ids, needed_by, site_address,
  open/closed, `choice` = his pick per line) and one `quote_request_suppliers` row per
  supplier (token for `/r/<token>`, sent_at, waiting/replied/declined, `prices` keyed by
  item id, delivery, vat_included, valid_until, `source` online/manual/scan,
  document_path in the `receipts` bucket, `previous` answers). The owner can't update
  answer columns: typed-in or scanned prices go through `record_quote_request_response`
  (checks the answer time the page showed, keeps what it replaces); the supplier's own
  through `submit_quote_request_response` (service role, once, open and not past
  needed_by). The list is locked once sent. Maths in `src/lib/quoteCompare.ts`: ex VAT
  (VAT-inclusive converted at 20%), split only when cheaper than the best single supplier
  after each supplier's delivery, expired offers never auto-picked. UI under
  `/quotes/requests` (Quotes tabs: My quotes / From suppliers).

## Scanning and extraction

- `src/lib/extractors.ts` — one `extractStructured()` with two engines: `claude`
  (`claude-opus-5`, forced tool, **not strict**, output passed through `conformToSchema`)
  and `gemini` (`gemini-3.5-flash-lite` via `@google/genai` Interactions API; schema
  converted by `toGeminiSchema`). Do not turn Claude strict mode back on: strict allows at
  most 16 nullable/union fields (the scan schema has 29) and rejects an enum under a
  `["string","null"]` type (use `nullableEnum`, an anyOf). Emulating null with "" made Opus 5
  write tool-call syntax into empty fields. `effort` per call: template and contact reads
  run `low`, `/api/scan` `medium`. Scan routes allow `maxDuration = 300`.
  Dates are parsed day-first server-side from the printed string
  (`src/lib/documentDate.ts`); ambiguous ones must be confirmed in the UI.
- `POST /api/scan` requires the signed-in user's Supabase bearer token; `engine` is
  optional. `POST /api/invoice-template` (used by the public Free invoice page) is
  unauthenticated: anonymous callers always get Gemini, `claude` needs a bearer token,
  limits (10/hour/IP, 200/hour global) are counted in the database via `hit_rate_limit`
  (service role, HMAC'd keys), falling back to per-instance memory if that fails. `POST /api/contact-scan` (signed in) lists every business/person on any photo
  for the new client/supplier form.
- A scanned invoice on the Free page becomes the NEXT invoice (`templateToDraft`): number
  +1 via `nextInvoiceNumber` (labels like "No." stripped, year-last formats bump the
  sequence, no digits → blank), today's date, printed gap kept as terms. CIS only when the
  invoice shows a CIS deduction or mentions the scheme.
- Batch scanning: `DocumentCapture` with `onBatch` keeps the camera open, stacks captures,
  re-arms auto-capture only after the page leaves the frame, and reviews/join-pages in
  `BatchReview`; `/scan` reads the documents three at a time and walks them with Save and
  next / Skip. The Free-page template scan and single-document flows stay one-shot.
- "Upload from files" (`UploadFilesButton`) hands files to the reading page in memory
  (`scanHandoff.ts`) with `upload=1` in the address; the page takes them only for its own
  path, and says they didn't come through (instead of opening the camera) if a full page
  load emptied memory. /scan reads with Gemini unless `scan-engine` is "claude".
- Camera: `src/components/DocumentCapture.tsx`. OpenCV is **not bundled**: a prebuild
  script copies it to `public/vendor/opencv-5.0.0.js` (gitignored, immutable cache
  header) and `src/lib/opencv.ts` loads it as a script and awaits `window.cv`. Never
  `import()` the package: its `module.exports` is a Promise and Turbopack's interop makes
  the import reject. The capture screen shows "Edge detection unavailable: <reason>" on
  failure, and tapping the hint pill (an invisible strip beside Back while there's no
  hint) shows a readout (engine state, video size, ticks, quads, coverage, sharpness).
  No hint shows until a page is found (Atanas: "everyone knows what to do").
- iOS defaults to the in-app scanner (`scanner-mode` in localStorage; `native` opts back
  into the OS camera). `CaptureButton` is the label-wrapped capture input on the native
  path so one tap opens the camera.
- Far receipts (2026-09-19): `pageCandidates` takes four-corner shapes down to 1.2% of the
  work frame, but under 6% only if `looksLikePaper` (lighter than a ring around it, little
  printed round it, clear of the edge, aspect <= 8); torn/curled receipts via convex hull.
  Auto-zoom goes by the page's span (`spanOf`), up to 4x on the lens (iOS exposes zoom
  0.5-10, 1 = main lens) or 2.5x cropped; "Move closer" only when zoom can't help. The shot
  is the camera's own still where `ImageCapture` exists (Safari 18.4+, Chrome), asked for
  ~3200x1800 because Safari otherwise returns its smallest size; it's used only if it
  matches the screen, the page is re-found near the video's corners and it's as sharp,
  else the video frame. WebKit facts behind this are in `notes/claude-notes.md`.
- Bent paper (2026-09-19): a page's corners are where straight lines fitted to its sides
  meet (`fitCorners`: cv.fitLine, Huber, two passes over the outline points along each
  side's middle), used only where further out than the simplified outline's corner by
  2-30% of the shorter side (a near-rectangular page keeps its corners as before). A
  dog-eared corner goes back to the page's real corner instead of one end of the fold
  (which flipped as the page moved). Outline, movement check and crop use the per-corner
  median of the last 3 detections; a page missed for up to 2 ticks keeps its outline and
  count; a tick whose own reading is off the median never fires the shot. A curled page's
  curved sides are not flattened (a 4-point warp).

## Environment variables

Vercel (Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`,
`INBOX_WEBHOOK_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
`RESEND_API_KEY` set in Production on 2026-09-19 (Resend account atanaschoo, key "Invoicer
app - Vercel", sending access). That also switched on the daily payment-reminder cron.
Sending domain `invoiceover.com` is verified in Resend (Ireland, eu-west-1; DNS records
added to Cloudflare by Resend's auto-configure). Send by email defaults to
`invoices@invoiceover.com`, reminders use `reminders@invoiceover.com`; `EMAIL_FROM`
overrides the former. `/api/send-invoice` is signed-in only by design (an open route was
an invoice-fraud relay); the PDF is made in the browser (`src/lib/invoicePdf.ts`).
Gemini billing is a Google AI Studio prepaid balance on billing account
`015649-CDA16A-FCF373`.
`COMPANIES_HOUSE_API_KEY` (not set yet; Atanas registers at the Companies House Developer
Hub, creates a Live application and a REST API key) switches on the company name lookup
(`/api/company-search`, `CompanyNameInput`): Free page business/customer, client forms,
Settings. Without it those fields are plain inputs and nothing mentions the lookup.
UK address lookup (`/api/address-search`, `AddressFinder` above every address field) is
free by default: postcodes.io (postcode check, place, post town from the built-up area)
and OpenStreetMap via photon.komoot.io (houses and streets; not every UK house is there,
so a postcode can always be used on its own). Optional `IDEAL_POSTCODES_API_KEY` (not
set) gives signed-in users Royal Mail's full address file; it's paid per postcode list or
picked address, capped per account (20/5 min, 100/day) and overall (150/5 min, 400/day),
and falls back to the free lookup when capped or failing. Set a daily limit and no auto
top-up on the key in the Ideal Postcodes dashboard too.

## Who else works here

"Cowork" is another Claude Code session (possibly another machine) that reviews, runs
migrations and tests DB state in rolled-back transactions; its briefs land in
`Claude outputs/` (untracked). Check `git log` before assuming you are alone. The folder
sits under iCloud Desktop sync and sometimes spawns stray `name 2.ext` duplicates; diff
them against the original before deleting.

## Open items (2026-09-19)

- (Resolved 2026-09-18: the iPhone in-app scanner is confirmed working by Atanas.)
- (Resolved 2026-09-19: Claude scanning had been failing on every read; fixed and verified
  live on synthetic handwritten and spreadsheet invoices.)
- (Resolved 2026-09-19: Send by email live; test invoice TEST-001 sent from the live Free
  page to Atanas's account email and shown Delivered in Resend.) An unused first key "Invoicer app (Vercel)" exists in
  Resend (its value was never copied); Atanas may delete it.
- Test the batch scanner, green lock-on, auto-zoom, signature pad, scan-to-fill, Share and
  Describe it on the iPhone (tested here against synthetic camera clips and headless
  Chrome only).
- (Done 2026-09-19: backup 009 + migration-018 applied, verified and merged: clients.phone
  and the shared rate limit for the free scanner.)
- (Done 2026-09-19: payments are recorded per invoice; reminders chase the balance of
  part-paid invoices.)
- Accuracy pass on both engines with Atanas's real documents; decide whether Gemini can
  carry everything.
- (Done 2026-09-19: duplicate warning, line-total check and usual category per supplier
  on saving scans. The shared rate limiter is on the branch above.)
- (Done 2026-09-19: receipt photos/PDFs go to the private `receipts` bucket, rows keep
  `storage:<path>` in image_data_url; see `src/lib/receiptImages.ts`, and
  `receiptImagesServer.ts` for the inbox import. No inline rows exist in the live DB.)
- Paywall (whole app paid except the Free invoice page) — design conversation first.
- Try on the iPhone (tested headless with synthetic clips and a mocked database only):
  far receipts and the full-resolution still, the address finder, the "Paid" moment
  (haptic), "Text <customer>", the home-screen badge (needs notifications allowed).
- Offline scan queue (keep captures on the phone until there's signal) is not built: it
  needs a caching service worker; worth doing only with an iPhone to test on.
- Atanas's side: Safari camera permission (aA → Website Settings → Camera → Allow),
  business details in Settings (still placeholder; reminders and invoice emails use the
  business name and bank details from there), `invoice_next_number` at 357358,
  Cloudflare Worker deploy, revoke the old Mapbox token.
