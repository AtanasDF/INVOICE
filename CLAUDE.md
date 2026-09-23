# Invoicer — working notes for Claude Code

**New chat, new account or new machine: read `notes/handover.md` first.** It says where
things stand, what is half-finished, and what is waiting on Atanas.

Invoice and expense tracker for a UK freelancer (Atanas, GitHub AtanasDF). The data in
it is his real accounting record. Read this file before doing anything. Two accounts
matter: **`fragov@hidefield.co.uk` (Hidefield) is his real record; `atanaschoo@gmail.com`
is the test account, free for any test or upload.** From 2026-09-22 04:10 he allows
testing on Hidefield too ("use my account, it doesn't matter, just don't delete what you
have"), within these limits: never delete or change a row that was already there; what a
test adds is removed afterwards; never issue an invoice there (numbers are sequential and
never reused); Settings values are put back exactly; use the gmail account whenever it
can show the same thing (details in `notes/claude-notes.md`).

## Layout and stack

- `web/` — Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4
  (CSS-first, no tailwind.config), Supabase (Postgres + Auth + RLS). Run every npm
  command from `web/`.
- `worker/` — separate Cloudflare Worker for email inbox import. First deployed
  2026-09-21 (`npx wrangler deploy` from `worker/`; wrangler is signed in on this Mac as
  atanaschoo@gmail.com, Cloudflare account 5926bcf52e541589a3003ab4dee95e16). Email
  Routing for invoiceover.com: MX/SPF/DKIM added that day, catch-all → the Worker,
  `receipts@` still forwards to Gmail. The Vercel CLI is signed in too (`atanasdf`,
  project `invoice`; `web/.vercel/` is ignored).
- Live at https://invoice-omega-rust.vercel.app, auto-deployed from `main` by Vercel.
  Only `main` deploys (`web/vercel.json` `git.deploymentEnabled`): the Hobby plan allows
  100 deployments a day, and branch previews used them up on 2026-09-19.
  Supabase project `wecfwjxzyzzrcwbwnwpo`.
- `scanner-research.md` — competitor research and the scanner follow-up plan.
- `SESSIONS.md` — one entry per session, newest first; read it first, append yours last.
- `harness/` — the test harness, **now in the repo** (it used to live only in a session
  scratchpad, which is wiped without warning). Headless Chrome against a mocked PostgREST
  (`mockdb.mjs`), plus pure-logic suites. `./run-all.sh` runs them four at a time in
  about four minutes (`JOBS=1` for serial, `BASE` for the server). **`$BASE` is a
  production build served by `next start`, not a watching dev server**: rebuild and
  restart before running browser suites, or the run tests a bundle nobody wrote.
  run-all.sh refuses to start when `web/src` is newer than `web/.next/BUILD_ID`
  (`ALLOW_STALE=1` overrides).
  `tsconfig.logic.json` recompiles the app's own tax, reminder, CIS, VAT, date and
  recurrence code into `harness/gen/` every run, so those suites can never drift from the
  source. Only source is kept: Chrome profiles, `gen/` and the ~770MB of synthetic camera
  clips are gitignored, and `gen-*.py` regenerates the clips (`gen-large.py` makes
  `large.mjpeg`, which nine suites need; `gen-torch.py` the two torch clips; `gen-uploads.py` and
  `gen-multi.py` the upload suites' files, made by `run-all.sh` when missing). `harness/README.md` has the
  rest. Run it from a scratchpad copy if you don't want profile directories in the tree.
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
   in its header. Check the latest numbers in the folder first. Latest as of 2026-09-23:
   **migration-036 and backup 016, both written and NOT YET RUN** (the scan limits: two
   tables, `business_profile.plan`, and `scan_allowance` / `take_scans` /
   `claim_scan_topup`). Applied and verified up to 035. (028 created two new tables,
   so it needed no backup; 029 added the registered name,
   company number and account kind to business_profile; 030 added clients.company_number;
   031, run 2026-09-21, revoked the default anon/authenticated grants on all 24
   `*_backup_*` tables). 031 was written believing the six 14-September backups had RLS
   off and were readable by any signed-in account: **they were not** — `test-rls-audit`
   reads the SQL files, not the database, and the live tables had RLS on all along, with
   a signed-in user reading 0 rows. Check the live catalog before acting on a finding
   about it. Supabase grants anon/authenticated everything on a new table by default:
   revoke explicitly (see migration-020). 032 (owner may update
   `quote_request_suppliers.supplier_id`, so a merge can move a request) and 033
   (`quotes.vat_registered`, nullable; `feature/quote-vat-snapshot` merged) and 034
   (`block_deposit_invoice_delete` trigger; `feature/deposit-delete-guard` merged) and 035
   (the same guard also counts an unlinked invoice tagged `from <quote number>` as the
   balance invoice, the orphan the quote page relinks) were run and verified the same day. The SQL editor puts a "destructive operations" dialog
   in front of any statement containing `drop` or `delete` — including an idempotent
   `drop trigger if exists` and a rolled-back exercise — and its Run has to be confirmed
   or the statement silently never runs.
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
   `git pull`, by reading the top of `SESSIONS.md`, and by running `node feedback-inbox.mjs`
   from `harness/` (new feedback from the app lands in `notes/feedback-inbox.md`, which is
   gitignored because the repo is public; the script needs the service key, see its header). Add your entry when the first
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
text-xs font-medium` with a bg-X-100/text-X-800 pair. New UI uses the neutral scale, which is **no longer grey by choice**: since
2026-09-23 the scale is a set of variables (`--n-50`..`--n-950` in `globals.css`) that a
theme redefines, so `bg-neutral-900` is the theme's darkest and `text-neutral-600` its
mid-tone. Keep using `neutral-*` and everything follows a theme for free; reach for
`accent` only where a highlight is genuinely wanted. Never hard-code a hex in a component.
The five themes are in `src/lib/theme.ts`, the choice lives in localStorage (per device,
not per account), `THEME_BOOT` sets it in `<head>` before the first paint, and a printed
invoice is forced back to plain ink. **Dark mode is not built**: it needs `bg-white` and
`text-white` turned into surface and ink tokens first, or white text lands on white
buttons. Three conventions worth knowing: a failed load uses
`loadFailed()` and a failed save `saveFailed()` (both in `src/lib/errorText.ts`) — never
`err instanceof Error ? err.message : "..."`, which is never true for a Supabase error and
throws the reason away; a list's empty state is gated on `!error`, so "No invoices yet" can
never stand in for a failed load; and anything that removes a record asks first with
`window.confirm`, naming what goes. Long names wrap with `wrap-anywhere` (not
`break-words`, which leaves min-content alone and lets one long word push the page).

## How people get around

One shape, not two (Atanas, 2026-09-22: "make it as one whole app not two different
apps"), and **nothing works before an account** ("nothing should work before the user
register... a plain page with some nice advertising of the app and the log in
rectangulars"). `/` for a stranger is the **front door** (`src/components/Welcome.tsx`):
the headline, five short lines of what the app does, what you can save it as, and
`SignInCard` beside them. Every other page redirects to `/login`; only `/`, `/login`,
`/reset-password` and the customer links `/i/`, `/q/`, `/r/` are public (the Gate in
`AppShell`). Its words follow `notes/first-page-research.md` (`test-first-page`), which
now allows "account" and "PDF" because the page is about making one.

`SignInCard` (`src/components/SignInCard.tsx`, used by `/` and `/login`) is the whole of
signing in: two tabs, **Sign in** and **New here**, a label over every box, the password
typed twice when the account is new ("The two passwords are not the same"), then the
check-your-email screen with the six-number code. The submit button says "Sign me in" so
it is not the same words as the tab. `/login?new=1` opens on making an account.

`/free-invoice?start=photo` opens the camera on arrival (not over a draft, not for a
stranger, and not on the iPhone's own-camera path, which only opens from a tap) and tidies
the address back to `/free-invoice`.

A document leaves the app in seven shapes, free page included: **Save as** (`SaveAsMenu`)
gives PDF, picture (.png), smaller picture (.jpg), Word (.doc), web page (.html), plain
text (.txt) and spreadsheet (.csv). All but the PDF and the pictures are read off the
printed sheet itself (`src/lib/sheetFile.ts`), so no screen keeps its own copy of the
totals; `src/lib/saveFile.ts` is the only place a file is handed to the device.

**Change a file** (`/convert`, `src/lib/convert.ts`) turns what people already have into
what they need, all on the device: a picture into PNG/JPEG/WEBP or a PDF, several pictures
or PDFs into one PDF, a PDF into a picture a page or into its words, and a spreadsheet or
data file into a spreadsheet, data, a web page, plain text or a PDF. PDF reading is
`pdfjs-dist`, whose worker `scripts/copy-vendor.mjs` copies to `public/vendor` beside
OpenCV (both gitignored); everything else is canvas and `pdf-lib`. Nothing is uploaded.

Each tool carries a short **how it works** note the first few times it is opened (`Tip`,
`tip:<id>` in localStorage): scan, copy, check a company, expenses, VAT, mileage, files
and needs-review.

Signed in, `/` is the dashboard, and the same tools are its first row: Scan a receipt,
Make an invoice, Copy a document, Check a company, with "+ Add" and "Upload photos or
PDFs" under them. The header groups every page — **Money in** (invoices, quotes, clients,
recurring invoices), **Money out** (receipts & bills, needs review, expenses, mileage,
recurring expenses), **Tools** (scan, copy a document, check a company, VAT, files,
feedback) and Settings — and a phone shows one **Menu** button holding the lot (nine links
used to wrap to three rows). There is no "More pages" drawer. The page you are on is the
longest address that matches, so /receipts/review marks Needs review, not Receipts & bills.

**No paid tier is built.** Everyone signed in has the full app, free (Atanas, 2026-09-22:
"I want people to still try it for free for now and I don't want to pay anything more for
now"). The plan when payments come: a paid switch on each account that only he can set,
off by default, free accounts seeing the free page alone; item 56 in `notes/tonight-list.md`.

## What day it is

`todayISO()` (`src/lib/today.ts`) is the only place that answers it, and it answers in
**Europe/London**, not UTC. Every "today" in the app used to be
`new Date().toISOString().slice(0, 10)`; Britain is UTC+1 from late March to late
October, so for the hour after midnight on a summer night the app thought it was still
yesterday — while the scan page and the Free-invoice draft read the local clock and
thought it was today. In that hour a receipt typed in was dated **yesterday** in the
accounting record, an invoice due that day wasn't flagged overdue, a sale on the first of
a quarter fell into the previous quarter's VAT, and an invoice issued through the scan
page vanished from the tax card entirely (its own date was "tomorrow" by the card's
reckoning, so the year's income read zero). Found on 2026-09-21 at 00:02 BST, by
`test-cis` failing for real. `harness/test-midnight.mjs` pins the clock to 23:30 UTC and
checks the lot; `mockdb.mjs` exports the matching `todayISO()` and `day(n)`, and suites
must use them rather than building dates off the UTC clock.

Europe/London rather than the browser's own zone because these are UK accounting records
and the app is UK throughout. UTC date **arithmetic** on a date string (`addDays` and
friends) is correct and stays — the bug was only ever in asking UTC what day it is now.

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
  lets the customer answer again. `quotes.vat_registered` (migration-033) is stamped from
  the account's setting whenever a quote leaves draft (sent, or accepted/declined straight
  from a draft); a failed profile read fails the change rather than stamping false. The
  quote page, list, chase text and `/q/` link all price by it (`q.vatRegistered ??
  profile.vatRegistered`). An invoice raised from a quote — deposit or balance — is
  priced under the setting it is *issued* under (migration-024), and the quote page says
  so when that differs from the snapshot. Owner status changes pass the status the page showed
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
- A "bill" is `document_type = 'invoice' and paid = false`. The dashboard's **Bills to pay**
  card lists every one of them, however far off, because that is what a list of what you owe
  is for; the amber banner, the push cron and the badge on the app icon count only the ones
  due within 3 days (or already late), so nothing nags about a bill due in a fortnight.
  A bill still waiting to be reviewed is left out of both.
- Mileage is an ordinary expense, not a table of its own: vendor and category "Mileage",
  no VAT, the trip in `receipts.details.mileage` (`src/lib/mileage.ts` holds HMRC's rates,
  the 10,000-mile split and the postcode road estimate).
- Two records for one business are merged with `clientsStore.mergeInto(duplicate, keep)`:
  invoices, receipts, quotes, recurring items and quote requests are repointed and the
  duplicate is **archived, never deleted** (`src/lib/duplicateContacts.ts` finds the
  pairs; a client and a supplier of the same name are never a pair).
- A customer's statement (`src/lib/statement.ts`, `/clients/<id>/statement`) and the VAT
  figures for a quarter (`src/lib/vatReturn.ts`, `/vat`, both bases, boxes 1/4/5/6/7) are
  worked out from the same rules as the invoice page; neither files anything anywhere.
- "Find it cheaper" on a quote or comparison line (`src/lib/priceSearch.ts`,
  `priceGuide.ts`, `POST /api/price-guide`, Gemini, 120/hour/user) prepares searches and
  gives a usual-price range; it never reads live prices and says so.
- The business profile (migration-029, applied 2026-09-20): `business_name` is
  the trading name and the headline on every document; `registered_name` and
  `company_number` are what Companies House holds and print small in the invoice footer
  (`IssuedInvoice`, so screen, print, PDF and the /i/ link alike) only when both are set.
  `account_kind` (limited / sole_trader / personal, null = not said) only labels the
  address today. All three are read `?? null` and written separately, so the branch works
  against a database without them: a PGRST204 retries the save without them and
  `businessProfileStore.save` returns false, which Settings says out loud.
- Suppliers are `clients` rows with `kind = 'supplier'`. A scanned document is linked to a
  supplier only when the form showed it (read-time match) or the names are exactly the same
  at save; no supplier is ever created without "Add as supplier". `receipts.details.noSupplier`
  marks "No supplier" picked on purpose, so the receipts list doesn't offer to link it.
  `clients.company_number` (migration-030) is kept when a contact is picked from the
  Companies House register, so a later check asks about that exact company rather than
  matching by name; contacts saved before it still carry the number on the device
  (`src/lib/companyRegister.ts`).
- Quote requests (migration-028, applied 2026-09-20): Atanas asking
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
  **Only fill in what the reading is sure of** (Atanas, 2026-09-23: "tell them honestly and
  add only what is sure for"). A field the reader is not certain about is left empty and
  said out loud, never filled with a good guess: a wrong total or a wrong date that looks
  confident goes into the accounting record unchallenged, while an empty box gets looked at.
  This is why ambiguous dates are confirmed in the UI rather than resolved quietly, and the
  same rule governs every field added later.
  Dates are parsed day-first server-side from the printed string
  (`src/lib/documentDate.ts`); ambiguous ones must be confirmed in the UI.
- `POST /api/scan` requires the signed-in user's Supabase bearer token; `engine` is
  optional. `POST /api/invoice-template` (the Free page's photo of an old invoice) is
  signed-in only too since 2026-09-22, Atanas's rule that everyone signs in to scan:
  Gemini unless `engine` is `claude`, 60 an hour per account and 200 an hour overall,
  counted in the database via `hit_rate_limit` (service role, HMAC'd keys), falling back
  to per-instance memory if that fails. The Free page stays open for typing an invoice. `POST /api/contact-scan` (signed in) lists every business/person on any photo
  for the new client/supplier form.
- A scanned invoice on the Free page becomes the NEXT invoice (`templateToDraft`): number
  +1 via `nextInvoiceNumber` (labels like "No." stripped, year-last formats bump the
  sequence, no digits → blank), today's date, printed gap kept as terms. CIS only when the
  invoice shows a CIS deduction or mentions the scheme.
- Batch scanning: `DocumentCapture` with `onBatch` keeps the camera open, stacks captures,
  re-arms auto-capture only after the page leaves the frame, and reviews/join-pages in
  `BatchReview`; `/scan` reads the documents three at a time and walks them with Save and
  next / Skip. The Free-page template scan and single-document flows stay one-shot.
- Several documents in one scan (2026-09-19): the scan tool returns `documents: [...]`,
  each with `pages` (1-based, counting every PDF page), `box` ([ymin, xmin, ymax, xmax] on
  0-1000, only when a page holds more than one) and `paidOnDocument`. One document is the
  default; `/api/scan` returns `{ result: documents[0], documents }` so one-document callers
  (invoices/new) are unchanged. `/scan` replaces a capture or file holding N with N entries
  in the walk (`splitDocuments.ts`: photos cropped to the box +3% with the whole photo kept
  as page 2; PDFs cut per document with pdf-lib, `pdfPages.ts`, else whole with a note);
  parts reuse their reading. Pages added or retaken by hand are merged as one document.
  "Save all ready" saves, through the same `prepareSave` as Save, every remaining document
  that's read, a receipt/invoice/credit note, has a sure total and a date, nothing to
  confirm, GBP or a rate fetched, and no possible duplicate (documents saved earlier in the
  run count); the rest stay with the reason. Unseen documents link only a supplier of
  exactly the same name. `paidOnDocument` presets Already paid / To be paid. The inbox
  import makes one needs-review row per document.
- The Claude / Gemini picker on `/scan` shows only on a device where `scan-engine` is set
  in localStorage; `/scan?engine=claude` (or `gemini`) sets it and shows the picker from then
  on (the sweep, 2026-09-22: the picker meant nothing to anyone but Atanas).
- "Copy a document" (`/copy`, Atanas 2026-09-22: a second scanner on the free page for any
  paper): photos through the batch camera (`DocumentCapture purpose="copy"`, whose review
  says "Check your photos" / "Use N pages" and has no grouping) or files, in order, into
  one PDF (`src/lib/documentPdf.ts`: an A4 page per photo turned to match it, a PDF's own
  pages copied in), then Save, Share or email. Nothing is read by the AI and nothing is
  stored. Signed-in only (his rule for scanning); a stranger is asked to sign in with
  `next=/copy`. `POST /api/send-document` has the send-invoice fences: signed in and
  confirmed, a real PDF under 4 MB of base64, fixed wording with the sender's note quoted
  and escaped, Reply-to the sender, from `documents@invoiceover.com`, 10 an hour / 30 a
  day each. No daily cap on copies themselves ("keep it open").
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
- One way in: `AddAnything` is the "+ Add" button and its sheet (Scan it, Upload a photo or
  PDF, Add a receipt by hand, Write an invoice, Write a quote). `ScanOrAdd` renders it with
  the page's own scan and by-hand routes passed as `also`, dropped when they'd repeat a
  standard row, so the invoices, receipts and clients lists need no change of their own.
- Camera permission goes through `src/lib/camera.ts` and nowhere else: `openCamera()` asks
  the Permissions API first (Chrome/Edge only — Safari has none for the camera), never
  calls getUserMedia when it answers denied, remembers granted/denied in module state and
  `camera-allowed` in localStorage, and returns `asked` (state was prompt, or the call took
  over 700ms) which is what shows `SAFARI_CAMERA_TIP`. A refusal is remembered, other
  failures aren't, so a busy camera can still be retried. The denied and timeout screens
  offer the iPhone camera, which goes through a file input and needs no site permission;
  `AddAnything` warns before the tap when the state is already denied.
- Far receipts (2026-09-19): `pageCandidates` takes four-corner shapes down to 1.2% of the
  work frame, but under 6% only if `looksLikePaper` (lighter than a ring around it, little
  printed round it, clear of the edge, aspect <= 8); torn/curled receipts via convex hull.
  Auto-zoom goes by the page's span (`spanOf`), up to 4x on the lens (iOS exposes zoom
  0.5-10, 1 = main lens) or 2.5x cropped; "Move closer" only when zoom can't help. The shot
  is the camera's own still where `ImageCapture` exists (Safari 18.4+, Chrome), asked for
  ~3200x1800 because Safari otherwise returns its smallest size; it's used only if it
  matches the screen, the page is re-found near the video's corners and it's as sharp,
  else the video frame. WebKit facts behind this are in `notes/claude-notes.md`. Zoomed in with the page then filling the view (the phone came closer), the zoom
  steps back out to where the page fits; a page lost altogether goes back to 1×.
  Auto-capture waits 1.1 s of stillness (`STABLE_MS`) so the lens has focused —
  Atanas's first real receipt was shot before it had (2026-09-22).
- The detector looks only at what the preview shows (`visibleRegion`): the video is
  cover-fitted to the screen, so a portrait phone shows a middle strip of the sensor's
  width (about 62% of a 4:3 sensor; 566 of 720 px in the harness's 375-wide viewport). A
  page wider than that strip runs off both sides and is rightly not found until it's held
  further back or the phone is turned — a landscape page is not a special case (2026-09-21;
  `harness/test-conditions.mjs`, `landscape.mjpeg`). Test clips must keep the page inside
  the strip, not just inside the frame.
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
`INBOX_WEBHOOK_SECRET` (added 2026-09-21 — it had never been set; the Worker was first
deployed the same evening), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. `FEEDBACK_TO` (added
2026-09-22: where `/api/feedback` emails every piece of feedback, from
`feedback@invoiceover.com`, Reply-to the sender; an address, not a secret). `RESEND_API_BASE`
is only for the harness's stand-in. `vercel env ls
production` from `web/` lists the names without values.
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
Settings. Without it those fields are plain inputs and nothing mentions the lookup. The
same key switches on the free company check (`/check-company`, `/api/company-check`):
status, officers, filings due, charges, insolvency, who controls it, in plain English
from Companies House's own enumerations, plus prepared web/social searches (never
scraped). Without the key that page says so and offers Companies House's own search.
`COMPANIES_HOUSE_API_BASE` is optional and only points the lookups at the sandbox or a
test stand-in; it defaults to the live API.
UK address lookup (`/api/address-search`, behind `AddressFields`, the block of address
fields used everywhere an address is typed) is
free by default: postcodes.io (postcode check, place, post town from the built-up area)
and OpenStreetMap via photon.komoot.io (houses and streets; not every UK house is there,
so a postcode can always be used on its own). Optional `IDEAL_POSTCODES_API_KEY` (not
set) gives signed-in users Royal Mail's full address file; it's paid per postcode list or
picked address, capped per account (20/5 min, 100/day) and overall (150/5 min, 400/day),
and falls back to the free lookup when capped or failing (the box says so); a key refused
for itself (401/402) rests ten minutes. Set a daily limit and no auto top-up on the key
in the Ideal Postcodes dashboard too. Atanas's two asks (2026-09-22) are how the box
behaves: a whole postcode lists its addresses by itself (700 ms pause, or leaving the
box) and a number and street finds its postcode (900 ms); only typing searches, never a
pick, a scan or a loaded record. A street's postcode (OpenStreetMap's, or the nearest from
postcodes.io) is filled with "check it's your postcode", since a road's covers one stretch;
a postcode with no houses in the free data lists its streets. `POSTCODES_API_BASE`,
`PHOTON_API_BASE` and `IDEAL_POSTCODES_API_BASE` point the three services at stand-ins,
as `COMPANIES_HOUSE_API_BASE` does, for `harness/test-address-stubbed.mjs`.

## Who else works here

"Cowork" is another Claude Code session (possibly another machine) that reviews, runs
migrations and tests DB state in rolled-back transactions; its briefs land in
`Claude outputs/` (untracked). Check `git log` before assuming you are alone. The folder
sits under iCloud Desktop sync and sometimes spawns stray `name 2.ext` duplicates; diff
them against the original before deleting.

## Open items (2026-09-20)

- (Resolved 2026-09-21: migration-031 run and verified. The six 14-September backup tables
  were never open — RLS was on in the live database, the audit had only read the SQL
  files. 031 now revokes the unused default grants on every backup table instead.)
- The scheduled task `invoicer-keep-working` cannot run unattended: it starts, then stops on
  its first command waiting for a tool approval that was never granted (it was created
  programmatically, so it has none). Atanas approves it once in the app, or sets its
  permission mode. Moved to :10 and :40 past the hour, clear of the email routines.
- (Resolved 2026-09-21: `.claude/worktrees/` removed with Atanas at the Mac — 24 worktrees,
  every one clean and on GitHub, `git worktree remove` each; 6 GB back, all branches kept.)
- Two unused exported functions, flagged not removed: `isMileage` (`src/lib/mileage.ts`,
  duplicates `tripOf`) and `mergeAddress` (`src/lib/addressLookup.ts`, left from the old
  AddressFinder). Two `* 2.*` iCloud copies sit in `src/` and are gitignored.

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
  business details in Settings on Hidefield (reminders and invoice emails use the
  business name and bank details from there; the "PLACEHOLDER" business name is on the
  test account, atanaschoo@gmail.com, not his), `invoice_next_number` at 357358, revoke
  the old Mapbox token. (The Cloudflare Worker was deployed 2026-09-21.)
