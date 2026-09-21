# Claude's working notes (published 2026-09-18)

The notes a Claude session kept privately on Atanas's Mac, rewritten here so any account
or device has them. CLAUDE.md holds the rules; SESSIONS.md holds the per-session log;
this file holds the standing facts and preferences behind them. Update a fact here when it
changes.

## Who Atanas is and how he works

- UK freelancer (GitHub AtanasDF, Mac user `nasko`); the app tracks his real finances.
- Prefers terse, comment-free code and commit messages that explain the reasoning.
- Wants design ambiguities named before anything is built on them, not guessed.
- One hard limit: never delete data, records, files or tables; flag and wait.
- Improvements to anything that looks poor need no permission.
- Wants everything pushed to GitHub at the end of every session, and a session log kept
  as work progresses, because he works from his phone and from cloud sessions.
- Reads short answers best; give steps one at a time when guiding him through a UI.
- For anything only he can do (sign-ups, logins, API keys, DNS, payments), open the exact
  page in his own Chrome (Claude in Chrome, where he is signed in) with the button on screen,
  and tell him which one to click, rather than sending instructions or links (2026-09-19).

## Standing process

- Migrations: numbered backup file + numbered migration in `web/supabase/`; backup
  verified by content in both directions, not row counts; migrations verified by
  structure and by exercising new functions as `authenticated` in a rolled-back
  transaction. Function-only or FK-only migrations need no backup and say so.
- No DB write access from code sessions: Atanas signs into the Supabase SQL editor in a
  browser the session can drive (desktop app pane or Claude in Chrome). The editor's
  results grid is canvas-based; read it with a JS `querySelectorAll('[role="gridcell"]')`.
- Never Read `web/.env.local`; confirm keys by name with `grep -c`. Local file has EMPTY
  `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; `GEMINI_API_KEY` is present.
- Check `git log` before assuming you are alone: "Cowork" is a second Claude session that
  reviews, runs migrations and tests in rolled-back transactions; its briefs land in
  `Claude outputs/` (untracked). iCloud sync sometimes creates `name 2.ext` duplicates;
  diff before deleting.
- Keep parallel agent fan-outs small: the account usage cap has killed background runs.
  Never let agents use the shared browser tools; they navigate Atanas's sign-in tabs away.

## Verified facts

- 2026-09-21 (late, in the SQL editor): **three accounts** in auth.users. `fragov@hidefield.co.uk`
  → business_profile "Hidefield", 5 receipts, 2 clients — **Atanas's real record** (he
  confirmed). `atanaschoo@gmail.com` → "PLACEHOLDER — replace with your business name",
  empty — the account every "still placeholder" note was looking at; he signed in as it
  on 2026-09-21 and an import address was generated there (harmless, the account is
  empty). `schemaprobe.1789327778@gmail.com` — an earlier session's probe, empty. **Rule
  from Atanas (2026-09-22): the Hidefield account is his alone — never sign in as it or
  write to it; the gmail account is the test bench, use it for anything.** Its import
  address is `u-8c06f295592fba4c02ce635213fbfe4f@invoiceover.com`.
- 2026-09-21 (evening, in the SQL editor): migrations 031–034 applied and verified;
  `feature/quote-vat-snapshot` and `feature/deposit-delete-guard` merged. All 24
  `*_backup_*` tables have RLS on, no policy and no anon/authenticated grant (signed-in
  and anon are denied outright; service role reads). The 24, from the catalog:
  business_profile_backup_20260914, _20260915, _20260915_2, _20260915_3 (no SQL file
  makes this one — a hand-made snapshot), _20260919_m021, _20260920_m029;
  clients_backup_20260914, _20260914_2, _20260915, _20260919, _20260920_m030;
  invoice_reminders_sent_backup_20260919_m021; invoices_backup_20260914, _20260914_2,
  _20260915, _20260915_2, _20260919_m024, _20260919_m027; quotes_backup_20260919_m022;
  receipts_backup_20260914, _20260914_2, _20260914_3, _20260915, _20260917. The six 14-September backups never
  had RLS off — `test-rls-audit` reads the SQL files, not the database. Live tables that
  evening: `receipts` 5 rows (Rawlings ×2, Anthropic ×3), `clients` 2, `invoices` 0,
  `quotes` 0, `quote_requests` 0. The Currys PC World receipt (549.99/91.67, the "till
  total as net" question) is NOT in the live table — it's in `receipts_backup_20260914_3`
  and `receipts_backup_20260915` only, and `receipts_backup_20260917` is empty; it left
  between the 15th and the 17th. The Supabase SQL editor holds any statement containing
  `drop` or `delete` behind a "destructive operations" dialog; unconfirmed, it never runs.

- **A NULL invoice_prefix breaks invoice numbering, and looked like a missing profile.**
  `assign_invoice_number` builds the number as `invoice_prefix || (invoice_next_number-1)`,
  and `||` is strict in Postgres: a NULL prefix makes the whole expression NULL, so the
  function raises 'No business profile found for this account.' even though the row is
  there. Settings used to store a cleared prefix as NULL, and `businessProfileFromRow`
  reads `?? "INV-"`, so the box showed "INV-" over a NULL row and nothing said otherwise.
  Fixed 2026-09-20: an empty prefix is stored as the empty string, and the recovery path
  looks at the row before deciding (missing row -> write defaults; NULL prefix -> repair
  just the prefix; anything else -> rethrow). Never treat that message as proof the row is
  missing.
- **Supabase upserts REPLACE.** `businessProfileStore.save` upserts on user_id, so saving
  a default profile over an existing row blanks every column it doesn't set. The mock in
  the harness treated an upsert as a plain insert until 2026-09-20, which hid this.
- **A CIS deduction is consideration received, for VAT.** The contractor pays that part to
  HMRC on his behalf, so on the cash basis a settled CIS invoice counts in full, not just
  the cash that arrived. Payments in this app are recorded against `due` (total less CIS),
  so anything reading payments as consideration must scale by total/due.
- **On the cash basis a credit note against an unpaid invoice has nothing to reverse** — no
  VAT was ever declared on it. Counting it anyway reclaims tax never accounted for.
- Next 16 answers `notFound()` from a streamed route with **200 and a noindex tag**, not
  404 (documented: the headers have gone by the time the check runs). The noindex is what
  keeps a dead link out of search.
- Tailwind v4 reports computed colours as `lab()`/`oklch()`, which can't be parsed as three
  numbers: paint them on a 1x1 canvas and read the pixel back to get true RGB.
- `break-words` does not let a flex item shrink below its longest word (overflow-wrap
  leaves min-content alone). `wrap-anywhere` does; long company names need it.
- zsh has no `wait -n`, so the obvious "run N at a time" loop runs them one at a time.
  `xargs -P` is what actually parallelises the harness.


- Live Supabase is at migration-026 as of 2026-09-19: quote_links (grants as
  invoice_links; record_quote_link_view and respond_to_quote_link execute for
  service_role only). Verified rolled back: owner can't fake an answer or call respond,
  other user sees 0, accept records the trimmed name, a second answer is refused, reopen
  then answer again works, draft/expired/bad answers refused, first view once.
- Vercel's firewall put the live site into a challenge ("Vercel Security Checkpoint",
  x-vercel-mitigated: challenge) for scripted requests on 2026-09-19 evening, most likely
  after this session's many curl polls. Browsers pass it on their own. Don't poll the live
  site with curl in loops; check in the browser pane. If it persists for real visitors,
  look at Vercel > Firewall (Attack Challenge Mode / bot protection).
- When the Mac's display sleeps, every Chrome tab is "hidden" and in-page timers are
  throttled, so window.__runSql2 (which waits with setTimeout) hangs. Instead: set the
  Monaco text by JS, click Run with the computer tool (find the Run button's ref), wait
  with the tool, then read [role=gridcell] by JS.
- Next 16 runs one dev server per folder; a second on another port refuses to start.
- Migration-025 as of 2026-09-19: invoice_links (authenticated:
  select; insert only invoice_id/user_id/token; update only token; anon nothing;
  record_invoice_link_view execute for service_role only). Verified rolled back.
- Next 16 serves notFound() from a dynamic page as a soft 404 (status 200) once it has
  started streaming, and skips the page's generateMetadata: put noindex in a segment
  layout (as src/app/i/layout.tsx does).
- Testing server-rendered pages without the real DB: start `next dev` with
  NEXT_PUBLIC_SUPABASE_URL=http://localhost:5555 (and fake keys) and run
  `harness/mock-server.mjs` there; env vars already set beat .env.local.
- Migration-024 as of 2026-09-19 (backup 012:
  invoices_backup_20260919_m024, verified 0/0 — the invoices table had no rows):
  invoices.vat_registered, set by assign_invoice_number (still security definer,
  search_path public, execute for authenticated/service_role only). Verified rolled back:
  issued with the profile's flag, unchanged after flipping Settings, re-issue refused,
  invoice_next_number restored (357358).
- Migration-023 as of 2026-09-19: invoice_payments (new table; RLS
  owner policy; authenticated select/insert/update/delete, anon nothing; trigger
  invoice_payments_same_owner; invoice FK RESTRICT). Verified rolled back: owner records
  and removes, zero refused, other user sees 0 and can't pay into it, anon refused, an
  invoice with a payment can't be removed.
- invoices.user_id and clients.user_id reference auth.users with NO cascade in the live
  database (unlike schema.sql, which says cascade), so a user with invoices or clients
  can't be deleted outright. Found 2026-09-19 with a throwaway user in a rolled-back
  block; left as is (protective under the never-delete rule).
- Migration-022 as of 2026-09-19 (backup 011:
  quotes_backup_20260919_m022, verified 0/0, RLS): quotes.deposit_percent (0–100
  exclusive) / deposit_amount (> 0), at most one; deposit_invoice_id → invoices ON DELETE
  SET NULL; deposit_claimed; quotes_same_owner also checks the deposit invoice. Verified
  rolled back: 30% saves, both or 100% refused, own deposit invoice links, another
  account's refused, removing it unlinks and keeps the claim.
- Migration-021 as of 2026-09-19 (backup 010:
  business_profile_backup_20260919_m021 and invoice_reminders_sent_backup_20260919_m021,
  verified 0/0 both ways, RLS on): business_profile.reminder_text_late /
  reminder_text_final / reminder_late_payment_interest (default false), and the
  invoice_reminders_sent kind check widened to before/due/after/late/final. Verified in a
  rolled-back block: owner saves the new fields, late+final insert, bogus kind and a
  duplicate refused.
- Migration-020 as of 2026-09-19: `quotes` table (RLS owner policy;
  authenticated select/insert/update only, anon nothing, because Supabase's default
  privileges otherwise grant everything; trigger `quotes_same_owner` so a quote can only
  point at its own client/invoice; client FK RESTRICT, invoice FK SET NULL). Verified in a
  rolled-back block: owner sees own, other user sees/updates 0, cross-account client and
  invoice refused (23503), delete refused (42501), anon refused, deleting the invoice
  unlinks the quote. New tables need an explicit `revoke` for the same reason.
- Migration-019 as of 2026-09-19: private storage bucket `receipts`
  (10MB, images + PDF), policies receipts_owner_select/insert on the owner's folder, no
  delete policy. Verified in SQL (rolled back) and live with Atanas's session (own folder
  200, other folder 403, signed read 200, public read refused). A 70-byte test file
  `<his uid>/selftest/1.png` stays in the bucket (never delete).
- Migration-018 as of 2026-09-19 (clients.phone; rate_limit_hits +
  hit_rate_limit, service_role only; verified in a rolled-back block). Snapshot
  clients_backup_20260919 (0 rows: Atanas had no clients yet). Never drop it.
- Live Supabase (project `wecfwjxzyzzrcwbwnwpo`) was at migration-017 as of 2026-09-17:
  receipts has 26 columns; all client FKs are ON DELETE RESTRICT; `receipt_pages`,
  `create_receipt_with_pages` (security invoker, authenticated only) exist. `receipts`
  had zero rows when the migration ran. Two overlapping owner policies exist on
  `receipts` ("Users manage own receipts" and "receipts_owner_all"); harmless.
- About 15 RLS-locked `*_backup_*` tables exist. Never drop them; Atanas's call.
- `business_profile.invoice_next_number` is 357358 and unanchored (test data cleared).
- OpenCV: never `import()` `@techstark/opencv-js` (its `module.exports` is a Promise and
  Turbopack's interop rejects it). It is served from `public/vendor/opencv-5.0.0.js` via
  a prebuild copy and loaded as a script. Auto-capture gates: MIN_CONTOUR_AREA 0.06,
  MIN_COVERAGE 0.09, STABLE_MS 600, STABLE_TIMEOUT_MS 2500, SHARPNESS_FLOOR 12,
  SHARPNESS_RATIO 0.7, tick 150ms. Atanas confirmed the iPhone scanner works (2026-09-18).
- Gemini: `gemini-3.5-flash-lite` via `@google/genai` Interactions API; `thinking_level`
  must be lowercase; the SDK retries 429/5xx five times by default, so the client is
  built with a 40s timeout and two attempts. Free tier allows about 20 requests a day per
  model; billing is a £20 prepaid balance on Google billing account
  `015649-CDA16A-FCF373`, activated 2026-09-18. Roughly a third of a penny per document;
  Claude Opus 5 is a few pence.
- Main scanner defaults to Claude with a signed-in "Read with" switch (localStorage
  `scan-engine`); the Free invoice page defaults to Gemini for visitors.

- Claude extraction was failing on every read until 2026-09-19 (tool schema rejected), so
  every earlier "scanner doesn't recognise" report from Atanas was likely Gemini-only or an
  error. Verified live that night: Claude reads a synthetic handwritten invoice (27s on
  /api/scan, 10s on the template route at low effort) and a rough spreadsheet invoice
  correctly; Gemini Flash-Lite read the handwritten one correctly too.
- The app's domain is invoiceover.com (Atanas, 2026-09-19): registered at Cloudflare
  2026-09-15, Cloudflare DNS; Resend sending records added and verified 2026-09-19. The
  domain is not connected to the Vercel project (the site is still on vercel.app).
- Resend: account atanaschoo (Google/GitHub sign-in), key "Invoicer app - Vercel" with
  sending access is `RESEND_API_KEY` in Vercel Production. Setting it turned on the payment
  reminder cron; Atanas's account had no invoices at the time, so nothing went out.
- Signature: localStorage `free-invoice-signature` ({image PNG data URL, name}), separate
  from the draft so Start over and new invoices reuse it.

- Accuracy pass 1 (2026-09-19, synthetic documents through live /api/scan, both engines):
  handwritten invoice, rough spreadsheet invoice with VAT, thermal till receipt, credit
  note against an invoice, USD SaaS invoice. Both engines read every key field right
  (supplier, date, number, gross, VAT, currency, document type, credited invoice number).
  Gemini Flash-Lite 4-5s, Claude Opus 5 8-11s. Only difference: with "payment terms 30
  days" and no printed due date, Gemini invented a due date; Claude left it blank as told.
  Real documents from Atanas are still needed before deciding Gemini can carry everything.

- Review loop that worked this session: build, then a workflow of reviewers (one per area)
  each followed by a refuter told to default to "not real"; fix what survives; re-check
  the fixes the same way until a round comes back clean. Every round found real bugs,
  several introduced by the previous round's fixes.

- Companies House public data API (2026-09-19): free, key via the Developer Hub account
  (Live application → Create new key → REST), HTTP Basic with the key as username,
  600 requests / 5 min per key. Names come back in capitals; `tidyCompanyName` makes them
  readable (keeps initials/acronyms). The registered office is often an accountant's, so
  a pick only fills an empty address field and otherwise offers it.
- Tax figures used by the tax-estimate branch (2026/27, England/Wales/NI): personal
  allowance 12,570 (tapered £1 per £2 over 100,000), basic band 37,700, additional rate
  from 125,140; Class 4 NI 6% on 12,570–50,270, 2% above; no Class 2. Frozen to 2030/31.

## Decisions

- Scanned supplier invoices and credit notes are expense documents in `receipts`, never
  in the sales `invoices` table; credit notes stored negative.
- App-wide wake lock kept at Atanas's request.
- Anonymous scanning is Gemini-only; the in-memory rate limiter is a known gap.
- The Free invoice page is public and browser-only; "Save to your account" carries a
  localStorage draft through sign-up into `/invoices/new`.
- Send by email needs an account (decided 2026-09-19 after review found the open route
  could send invoice-shaped fraud from the app's domain); the copy goes to the account's
  own address. Visitors get "Sign in or sign up to send", which returns to their draft.
- Camera permission can't be remembered by the site: iOS Safari asks per visit unless
  aA → Website Settings → Camera → Allow. Batch mode keeps the stream open instead.
- Address lookup is free by default (postcodes.io + OpenStreetMap/Photon); Royal Mail
  (Ideal Postcodes) only for signed-in users and only if Atanas adds a key. getAddress.io
  shut down in Feb 2026 after a court case; never build our own copy of an address file
  from lookup results. OS Places isn't in the OS free allowance.
- "Paid" moment, home-screen badge and customer texts added as Atanas's "surprise me"
  (2026-09-19); texts open the phone's Messages/WhatsApp, the app sends nothing.
- Quote requests (2026-09-19, merged; migration-028 applied and verified 2026-09-20):
  a supplier's online answer is never edited in place; the owner can replace it only by
  typing in or scanning their document, which marks the row as his and keeps the old
  answer in `previous`. Supplier kind is enforced by the app, not the database. A request
  "expires" for suppliers once its needed-by date has passed. Prices compare ex VAT with
  VAT-inclusive quotes converted at 20%; a line's alternative/note is counted as that
  line's price but shown. Orders are text to copy/email/share; nothing but the picks is
  stored. clients has no unique (id, user_id), so supplier_id is RESTRICT + a same-owner
  trigger rather than a composite FK (adding one would alter clients).
- Several documents per scan (2026-09-19, `feature/multi-docs`): Atanas's "receipt should
  be created in order to take payment" was read as "an invoice that shows it's already
  paid (card payment, PAID stamp, balance due 0) should come in as paid". The model's
  `paidOnDocument` presets the Payment choice; the due date is still read. Save all never
  links a supplier by a loose match (he didn't see it), only an identical name.

## Testing without Atanas's documents

- Real documents go in `test-docs/` (gitignored), never in git or on the live site.
- Synthetic test invoices were generated with Pillow (Bradley Hand font on a lined page,
  photographed-on-a-table effect; a grid "spreadsheet" invoice) in the session scratchpad.
- The live site can't fetch from localhost (Local Network Access), and popups open in the
  same tab in the browser pane. Getting a test image into the live tab: a local page on
  127.0.0.1 fetches it and navigates to the live URL with the data in the #fragment (never
  sent to a server); the live tab moves it to sessionStorage and clears the hash.
- The camera is faked with a canvas `captureStream()` plus overrides of
  `getUserMedia` and `permissions.query`, then "Try again" on the capture screen.
- html-to-image and the camera overlay only draw while the browser pane is displayed;
  with the pane hidden, `javascript_tool` still works but renders stall.
- Never press Save on a test scan: it writes to Atanas's real records. Skip/Discard, and
  clear any test draft from the live Free page's localStorage afterwards.

- Headless test harness (2026-09-19): puppeteer-core in the session scratchpad driving the
  installed Chrome with a fresh profile, `--use-fake-device-for-media-stream
  --use-file-for-fake-video-capture=<clip>.mjpeg` (concatenated JPEG frames made with
  Pillow; Chrome delivers them as 720x1080). A canvas `captureStream()` fake camera does
  NOT work headless (2x2 black frames).
- Signed-in pages are tested with `harness/mockdb.mjs`: a fake session in localStorage and
  request interception answering every Supabase REST call from an in-memory table set
  (eq/neq/is/in filters, object vs array replies, injected failures and lost replies), and
  `/api/send-invoice` captured instead of sent. Nothing reaches the real database, so it's
  safe for flows that write. `test-quotes.mjs` runs 34 checks. Worktree dev servers need
  `next dev --webpack` (Turbopack rejects the symlinked node_modules) and a symlinked
  `.env.local`.
- Quote requests: `harness/test-quote-requests.mjs` (80+ checks) against a dev server with
  `NEXT_PUBLIC_SUPABASE_URL=http://localhost:5566` and RESEND/AI/VAPID keys empty;
  `qr-mock-server.mjs` also answers `/auth/v1/user` (by the JWT's sub) and storage upload
  and sign, and `qr-mockdb.mjs` mirrors migration-028's column grants, items lock and both
  answer functions. The answer route allows 10 per address per hour and the dev server
  keeps counts between runs: give each supplier page its own `x-forwarded-for`. When the
  Mac is busy, first compiles take a minute: warm the routes with curl first.
- The SQL editor asks "Potential issue detected" before any query containing delete; a
  rolled-back test block needs that confirmed by a click.
- `test-multi-docs.mjs` (harness): one upload read as 3 documents, a photo of two
  receipts cropped by box, PDF split, Save all ready with a duplicate, a missing total, a
  USD one and an in-batch duplicate left, the all-saved view. Synthetic files from
  `harness/multi/gen-multi.py`; `md-*.mjs` are copies of others' suites with their own
  Chrome profiles (another session was using the shared ones).
- Camera suites (scratchpad `harness/`): `test-far.mjs` (far/torn/shaky/off-centre
  receipts, dark objects, a white box on a bill, 45°, and a stubbed `ImageCapture` still:
  upright/sideways/nudged/noise/hang/moved/blurred), `test-batch-swap.mjs` and
  `test-far-recheck.mjs` (signed-in /scan with the fake camera via `camera-signed.mjs`),
  `test-lens.mjs` (stubbed iPhone lens zoom). Clips are made by `gen-far*.py`.
- WebKit (checked in source, 2026-09-19): iOS `getCapabilities().zoom` is 0.5-min(max/2,
  10) on multi-lens phones, 1 = main lens; `takePhoto` without imageWidth/Height returns
  the smallest max photo size of the active format, with them the smallest >= both; the
  JPEG isn't rotated by WebKit (EXIF only). ImageCapture is in Safari 18.4+.

## References

- Live app: https://invoice-omega-rust.vercel.app (Vercel project `atanas-df/invoice`,
  auto-deploys `main`).
- Supabase SQL editor: https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
- Google AI Studio keys and billing: https://aistudio.google.com/app/api-keys
- PRs so far: #1–#5 earlier features, #6 scanner rework, #7 free invoice page. From
  2026-09-19 schema-free work goes straight to main (CLAUDE.md rule 4); unfinished work to
  `wip/<topic>` branches.

## Queued work (Atanas's list, 2026-09-17)

**The live list is `notes/backlog.md`** (started 2026-09-20, ticked as things land). This
section is kept for the items on it that are Atanas's to decide, with what has happened to
the rest:


1. Accuracy pass on both engines with real documents; decide whether Gemini can carry all.
2. (Done 2026-09-19: `hit_rate_limit`, migration-018.) Shared rate limiter for `/api/invoice-template`.
3. (Done 2026-09-19.) Research follow-ups: duplicate detection on save, line-total check,
   supplier memory, camera coaching text.
4. (Done 2026-09-19: the private `receipts` bucket, migration-019.) Receipt images to
   Supabase Storage before volume grows.
5. Paywall: whole app paid except the Free invoice page; design conversation first.
6. (Done 2026-09-19: `research-apps-2.md`, the second research pass on ten apps. Top ideas:
   Pay now links with Pay by Bank, auto-marking invoices paid, MTD Income Tax updates,
   a running tax estimate, opened-invoice alerts and WhatsApp/SMS sharing, firmer
   reminders with UK late-payment interest, quotes/deposits, invoice by typing.)
7. Atanas's side: Safari camera permission, business details in Settings, invoice
   counter, Resend key, Cloudflare Worker deploy, revoke the old Mapbox token.
8. Bank connection (Atanas, 19/09 evening: "keep in mind, don't start it now"): read-only
   Open Banking through an FCA-authorised provider, so received and outgoing payments come
   in by themselves. The app never sees bank logins; he approves in his bank's own app and
   can revoke at any time. It would unlock: invoices marked paid/part-paid from matching
   payments (and reminders stopping), supplier bills marked paid, card spends without a
   receipt flagged, reconciliation, the tax card from real money, MTD Income Tax updates,
   and later Pay by Bank links on invoices (payment initiation, a separate permission).
   Before building: pick the provider (compare current UK AIS providers, cost, consent
   renewal, whether we act as their agent), a schema for accounts/transactions/matches,
   and how tokens are held (server side only).
