# Session log

One entry per Claude Code session, newest first. Read the top entries before starting;
append yours before the final push. Keep each entry to what changed, what was decided,
and what is left open. Dates are session dates (Europe/London).

## 2026-09-23 — The night list: colour, the front door, the dashboard, the scan limits (Opus 5)

Atanas awake through most of it, steering. Everything below is on `main` and pushed.

- **Sign-up emails, finished and proven.** His Resend key into Supabase SMTP, all four
  templates pasted and verified by reloading each page, and a real sign-up at 03:04 arriving
  from `accounts@invoiceover.com` in our own wording. **Resend does not log SMTP relays in
  its Emails list** — an empty list there is not a failure, and an hour was lost to
  believing it was. The first real email carried an **8-digit code while the app refuses
  anything but six**, so nobody could have typed it in; Supabase now issues 6, and the link
  lasts 10 minutes (he asked for 1; the email alone can take 40 seconds to arrive, so 10 was
  the agreed floor) with the three emails that quote a time reworded to match.
- **Colour and themes**, without touching 1,331 `neutral-*` classes: the scale became
  variables, `@theme inline` points Tailwind's utilities at them, and a theme is a different
  set of values. Five themes, per device, applied before first paint, invoices still print
  in ink. The house-style rule in `CLAUDE.md` was rewritten in the same commit.
- **The readability pass found the best bug of the night.** `text-neutral-500` on a
  `neutral-100` card was 4.2–4.4:1 in *every* theme including plain grey — under AA, and
  that way since long before themes existed. Green merely made it bad enough (3.66) to
  notice. Mid-tones darkened everywhere; `test-readable.mjs` measures all five themes.
- **The dashboard rebuilt round the scanner** to his spoken brief: one big scan, three under
  it, who you work with in one list, three panels on one page, Check a company lower and
  smaller. The tests caught that "give you the invoice with the next number" was unmet —
  drafts have no number, and assigning one early would gap or repeat the sequence, so the
  page says which number is coming instead.
- **The front door**: six lines of explaining became three, a drawing of a receipt, an
  invoice and a phone, and the sign-in box moved *above* the reading on a phone.
- **Get the app**, flyer tracking (`?from=carlisle-dhl`, carried onto the account as user
  metadata, no table needed), privacy and terms, search metadata, robots, sitemap, a sharing
  picture, a real 404 and a `global-error` for when the layout itself throws.
- **The scan limits**: the design written first, `backup-016` + `migration-036` **written and
  not run**, the counting wired into all three reader routes behind `SCAN_LIMITS` (unset, so
  it does nothing), and the wall with its once-a-month top-up. A retry after a failed read
  costs nothing; copying and converting cost nothing at all.
- **Protection**: the throwaway-inbox refusal (with a suite that mostly proves who must
  *not* be caught), and Turnstile behind `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Wiring it to
  sign-up alone would have locked everyone out of sign-in and password reset the day he
  switched it on, so all three flows carry the token. **The weekly cap per address was
  argued against rather than built**: a depot is dozens of drivers on one wifi in one week,
  which is the plan working and the abuse pattern at once.
- **106 fake documents in 24 unrelated designs** to print, crumple and scan, plus
  `check-scans.mjs`, which reports what the reader got *wrong* rather than how many passed.
  The first hundred were rightly rejected as "more or less the same" — they were one design
  a hundred times.
- **Housekeeping**: 1.5 GB of iCloud duplicates cleared; a move off the synced Desktop was
  started and stopped at his word with nothing lost, and waits on a handover file that now
  exists (`notes/handover.md`).

**Open, and his:** run 036 with me watching (no Postgres on this Mac, so its SQL has never
been parsed); Turnstile and Companies House keys; a trading name and address for the legal
pages; whether to leave, reopen or write around the "free invoice template UK" question;
print and scan the pile.

**Open, and mine** (`notes/queue.md`, 35 items): an allowance readout before the wall
arrives, dark mode done properly, offline caching, the ageing-photos job, and four small
things the dashboard rebuild itself created.

## 2026-09-21 — Migrations 031–034 through the Supabase SQL editor, then the landscape scanner (Opus 5, then Fable 5.1 from the first commit)

Atanas at the Mac, signed in to Supabase in Chrome; Remote Control on so he can steer
from his phone. Each migration shown and approved before running; every check run in
the editor, the as-role ones inside a transaction ending in `raise exception`.

- **migration-031: the premise was wrong.** Before running it, the live catalog showed
  all 24 `*_backup_*` tables with RLS **on**, no policy, and a signed-in user or anon
  reading 0 rows from each. The "six tables with no RLS" came from
  `harness/test-rls-audit.mjs`, which reads the SQL files, not the database; the 000/001
  backup files have no `enable row level security` line, so it reported them open, and
  nobody looked. Nothing was ever exposed. With Atanas's choice, 031 was rewritten to
  revoke the unused default grants on every backup table by pattern (a second lock if RLS
  is ever switched off on one), run, and verified: 24/24 `rls true, grants 0, policies 0`,
  signed-in and anon now **denied** rather than empty, service role still reads, live
  tables' grants untouched (58b7fd3).
- **migration-032** run and verified: owner update columns now `sent_at, supplier_id,
  token`, no other privilege changed; as the owner (rolled back) the merge's update plans
  and an update of `prices` is still 42501. `test-rls-audit` taught to read 031's loop
  rather than a list of names, with a note on what its file-reading cost.
- **migration-033** run and verified (`quotes.vat_registered boolean`, nullable, no
  default, 0 rows either way, owner can read and write it); `feature/quote-vat-snapshot`
  merged locally, pushed only once the full harness was green. From here Atanas said
  "always do as recommended", so 034 went ahead on the recommended option without a
  further question.
- **migration-034** run and verified: `block_deposit_invoice_delete` before-row delete
  trigger, enabled, security definer, search_path public. Exercised as the owner in a
  rolled-back transaction: deposit invoice of a balanced quote refused with 23503 and the
  file's message; balance deleted first, then the deposit, both succeed; afterwards no
  HARNESS row remained. `feature/deposit-delete-guard` merged. Two things about the SQL
  editor worth knowing: a statement containing `drop` or `delete` (even `drop trigger if
  exists`, even a rolled-back exercise) sits behind a "destructive operations" dialog
  until confirmed, and looks like it never ran; and a click by screen position on Run can
  miss where a click by element reference doesn't.
- The harness needed `npm install` in `harness/` first (`puppeteer-core` missing): every
  browser suite crashed, and `run-all.sh` still exited 0 on the crashes.
- **The landscape page (item 20) was never on screen.** A probe re-running the detector's
  stages inside the scanner page found the wide page as a clean quad on the whole video
  frame, but the live loop looks only at `visibleRegion` — the cover-fitted strip the
  preview shows, 566 of 720 px on the harness's 375-wide viewport — and every failing
  clip's page was wider than that. Nothing in the detector assumes portrait: a 460-px-wide
  landscape page auto-captures in 2.5 s with a 462×328 crop. Clip and suite rewritten to
  the till-roll pattern (overflowing for 6 s, then held back to fit); CLAUDE.md says why a
  test clip must keep the page inside the strip, not just the frame.
- **Item 13, email import**: `test-inbox-worker` runs the Cloudflare Worker's code in Node
  (Node 24 strips the types) with `fetch` stubbed — the inline-signature filter, the
  pasted-screenshot fallback, address and token checks; and found that an HTML-only email
  posted an empty body, fixed with a text fallback (deployed the same evening).
  `test-inbox-ingest` runs the route on its own dev server against `mock-server.mjs`
  (which now accepts storage uploads, with `db.storageFails`) and a stand-in Claude API
  scripted per call: 20 checks over the unread-filing paths — reader refused or cut off,
  database refusing the row, storage down, two documents in one PDF — none touching the
  live database or the real reader. 31/31.
- **The five open accessibility findings**, all fixed: the supplier price form names each
  box by the line's description; the Free page's read is a status region, its failure an
  alert, and the "filled in" note takes focus; every feedback paragraph in the app is a
  live region (58 in 35 files, one mechanical sweep, reviewed line by line); the batch
  review sheet is an `aria-modal` dialog that takes focus, with the camera's live area and
  controls `inert` behind it; the file-library preview is a named dialog that Escape
  closes, focus in on open and back to the tile on close. `test-announced` grew five
  checks (Settings "Saved.", and the lightbox's four).
- `harness/gen-torch.py` makes the two torch clips that had no generator, and
  `test-torch-nocv` now actually keeps OpenCV from loading rather than assuming it:
  `test-torch` 12/12, `test-torch-nocv` 3/3 on the generated clips.
- **Item 24, half done**: Atanas approved spending credit ("always run as many documents
  as you need", kept as a memory). `gen-bench-docs.py` + `bench-engines.mjs` run the app's
  own reader on ten synthetic documents with known figures. Gemini read all ten with every
  field right, median 4.8 s. Claude couldn't run: `ANTHROPIC_API_KEY` is empty in the
  local `.env.local` (so is `SUPABASE_SERVICE_ROLE_KEY`); the bench skips an engine
  whose key is missing and says so.
- Scheduled tasks: the brief said all 19 were off; the machine has 15 local tasks, all
  on, and one fired cloud one-shot. Atanas: they belong to another chat, leave them; only
  timers this session made are mine to touch (kept as a memory). The Currys receipt
  question is moot — the row is no longer in the live table (see claude-notes.md).
- **Page weight**: `test-weight` failed on the dashboard (1627 KB against 1.5 MB) and,
  after the 033 merge, on the Free page (1483 KB) and Check a company (1360 KB). Building
  the last green commit in a scratch worktree (Turbopack refuses a symlinked
  `node_modules`; a hard-linked copy works) and measuring it the same way: the dashboard
  was already 1626 KB there — the budget was never met — while the Free page and Check a
  company were 934 / 807 KB, and are again on the 034 build (933 / 807, per-file
  identical). Turbopack had grouped a 359 KB dashboard chunk into those pages' loads at
  the 033 commit and moved it back after a 13-line change: chunk assignment on a
  knife-edge, which is exactly what the suite is there to catch.
- iCloud had again put 89 `name 2.*` copies inside `web/.next`; moved to the scratchpad
  (`icloud-dupes/`, same paths), nothing deleted; build then "Compiled successfully".
- Harness at the end: 73 suites in `run-all.sh` (the two inbox suites new), 73 green on
  the final build, and `run-all.sh` now exits non-zero when any suite crashes or fails.
  `test-two-users` and `test-prefix-wipe` stalled once each under load (a second dev
  server compiling next to a four-way run) and pass alone; `test-address-fields` talks to
  the live postcodes.io and photon and can time out under the same load.

- **Evening, with Atanas at the Mac.** `.claude/worktrees/` removed: 24 worktrees, every
  one clean, every commit on GitHub and in `main`, `git worktree remove` for each (which
  refuses anything dirty), 6 GB back, all 57 branches kept. Then the email import, which
  had never worked end to end: the Worker had **never been deployed**, Email Routing for
  invoiceover.com was **disabled with no DNS records**, the catch-all was "Drop", and
  Vercel had **no `INBOX_WEBHOOK_SECRET`** (the CLAUDE.md list was wrong on that one).
  Fixed in order: `wrangler login` (six tries — wrangler gives the Authorize click two
  minutes and Atanas wasn't at the Chrome window; on his say-so I pressed it), deploy,
  secret set from `.env.local` by pipe, Vercel CLI signed in (device flow), secret added
  to Production the same way, main pushed to redeploy, handshake verified (404 with the
  secret, 401 without), Cloudflare's MX/SPF/DKIM added after checking the root had no
  MX or SPF (Resend is on `send.`), catch-all → the Worker, Active. Two slips of mine:
  `vercel link --yes` first linked to a new project named after the folder (`web`,
  empty, still on his account — his call) before I relinked to `invoice`; and the CLI
  appended a `VERCEL_OIDC_TOKEN` line to `web/.env.local` (harmless, every other key
  untouched, lengths checked). Atanas: "every time you press yes instead of me from now
  on; full permissions apart from deleting stuff without double checking" — kept as a
  memory, with the deletion exception.

- **Review of the day's own changes** (Atanas: "let's do some work"): a workflow of 97
  agents — six reviewers by area, three skeptics per finding with different lenses
  (reproduce it, is the consequence real, is the fix safe), a completeness critic —
  raised 30 findings, refuted 2, and 28 stood, of which 22 were distinct. All fixed:
  - **Quotes** (the day's merge): the **list** and its chase text still priced a sent
    quote from today's VAT setting while the page and the customer's link used the
    snapshot; `accountVat()` swallowed a failed profile read and would have stamped a
    VAT-registered trader's quote "not registered" for good; a draft marked accepted or
    declined directly was never stamped. The deposit invoice's lines were built under
    the quote's snapshot but issued under today's setting — decision recorded in the
    code: an invoice is priced under the setting it is *issued* under, and the quote
    page now says when that differs from what the quote was sent under.
  - **Email Worker**: an attachment over ~3.3 MB made a body over Vercel's 4.5 MB limit
    and the whole email was lost (now left out and named in the row); a whitespace-only
    text part beat the HTML fallback; Apple Mail's inline-disposition PDF was treated as
    signature junk; an `application/octet-stream` PDF was discarded by the route; an
    out-of-range numeric entity threw and lost the email; Outlook's named entities
    reached the notes as text. Eight new checks in `test-inbox-worker`, one in
    `test-inbox-ingest`.
  - **Harness**: `run-all.sh` now judges by passed == total (ten suites end a thrown
    error without a FAIL line); `test-rls-audit` exempts only the 000/001 snapshots from
    031's loop, so a future backup file without the ALTER is flagged again; the bench
    credited an errored read with the invoice-number field; `test-torch-nocv`'s second
    launch still loaded OpenCV; `test-quote-vat-snapshot` built today off the UTC clock,
    now runs in `run-all.sh` with the list, the direct-accept stamp and the failed-read
    case added.
  - **Accessibility**: the native-camera control bar wasn't inert behind the review
    sheet; closing the sheet dropped focus on the body; Tab walked out of the file
    preview into the page it covered; nine `role="status"` paragraphs mounted already
    filled, which VoiceOver skips — each now has an always-present sr-only announcer.
  - **Notes**: four stale sentences (the Worker deploy listed as open, the worktrees
    item, the secret's history, the 24th backup table — `business_profile_backup_20260915_3`
    has no SQL file; all 24 names now in claude-notes).
  - **migration-035** (from the critic): the deposit-delete guard ignored a balance
    invoice whose quote link was lost, the one case the app already relinks by tag.
    Written, run, exercised as the owner (rolled back: refused with an unlinked tagged
    balance invoice, allowed once it's gone), committed straight to main since no app code
    depends on it. Full harness after the fixes: 74 suites, 71 green in the four-way run,
    the other three (`first-week`, `what-surfaces`, `weight`) green alone; the runner's
    new exit code is what flagged them. Worker redeployed (4c873fc5).

- **After midnight**: Atanas made a new Anthropic key (`invoicer-local-bench`, Default
  workspace, no expiry — created from the console in his Chrome, copied to the clipboard
  with the Copy button, pasted by him into TextEdit; I checked the line by length and
  prefix only) and the bench ran both halves: **both engines 10/10 on all seven fields,
  Gemini median 4.0 s, Claude 8.1 s** — item 24 closed. Signing in to the app turned up
  **three accounts** (see claude-notes): his real one is `fragov@hidefield.co.uk`
  (Hidefield, the 5 receipts and 2 clients); `atanaschoo@gmail.com` is the empty
  PLACEHOLDER account every note had been calling "his", and the import address I
  generated first landed there; a `schemaprobe.*` account is an old probe.

- **00:23: the email import works end to end**, proven with a real email. Atanas's rule
  first: Hidefield is his alone, the gmail account is the test bench (now the opening
  lines of CLAUDE.md). Then, with his "do it and report" standing, I composed in his
  Gmail in Chrome as atanaschoo@gmail.com, attached `bench-docs/doc-01.jpg` and sent it
  to the test account's import address. `wrangler tail`: `Email from atanaschoo@gmail.com
  … size 137470 — Ok`. The database: one new receipt on the test account — Brightwork
  Plastering Ltd, invoice INV-3991, 2026-07-23, due 2026-08-24, £508.68 net + £101.74 VAT
  (the document says £610.42), unpaid, `needs_review`, tags `["via-email"]`, image
  `storage:<uid>/…` in the receipts bucket. Cloudflare routing → Worker → Vercel route →
  Claude read → row, first time ever.

- **00:40–01:20: real documents at last.** Atanas signed my Chrome tab into his Hidefield
  account "so you can see some real scanned receipts" (read-only; his rule stands). The
  five documents there are PDFs; copying them out took three tries (an in-page fetch to
  a localhost receiver is blocked by Chrome's local-network rule; the extension refuses
  to return a signed URL because of its token; a blob download works once per page
  load, and the tool truncates a base64 result) — four made it, two Anthropic invoices
  of the same template as the first were skipped. Then his **first real scan on the
  phone**: GO OUTDOORS, 18 Sept 2026, £29.00 — read perfectly except the date, filed as
  **18 Sept 2012**. The till prints `DATE : FRI SEP 18 12:57:01 2026` and the parser's
  month-name pattern accepted `12` (of 12:57) as a two-digit year. `documentDate.ts` now
  strips any time-of-day before matching and never takes a two-digit year followed by
  a colon; seven cases added to `test-dates` (34/34). His saved row still says 2012 —
  his account, so his edit: Receipts → GO OUTDOORS → Edit → date.
- **Accuracy on real documents** (queued item 1, `bench-engines.mjs` with `BENCH_DIR`,
  PDFs supported): Anthropic invoice, two Rawlings & Son invoices, the GO OUTDOORS photo.
  Both engines right on vendor, date, total and invoice number on all four. Gemini left
  VAT empty on the till receipt (no VAT figure is printed, only "20%"); Claude worked it
  out as £4.83. Gemini median 4.7 s, Claude 9.7 s. Gemini stays the default; the one
  thing worth adding some day is computing VAT from a printed rate when no figure is.
  He also reported the phone scanner showing nothing on a first open: the clip suite
  confirmed detection works on the current build, and his second open worked — the
  first open downloads 13 MB of OpenCV before any green lines can show; a "getting
  ready" indicator on a cold start is the follow-up, not started (his "don't change
  anything for now").

- **01:30, two scanner asks from the phone**: the shot came before the lens had focused
  (hold-still now 1.1 s, was 0.6 s), and zoomed in with the page filling the view the
  scanner stayed zoomed (a found page hugging the fit margin while zoomed now zooms out
  to where it fits; a lost page still snaps to 1× — a half-way step was tried and undone,
  it left the zoom at 1.09× and broke the old suite's expectations). New synthetic-scene
  suite `test-autozoom-out` (5/5); `test-autozoom` 8/8, `test-conditions` 12/12.
- CLAUDE.md's scanner notes updated for both.
- **01:45, still zoomed on the middle of a receipt** (his second report): zoomed in, a
  text block or table on the page makes a clean four-corner shape that passes for the
  page itself, so the scanner sat zoomed in on part of a receipt, never "lost" and never
  backing off. Fix in the tree, built and green (`test-autozoom-out` 5/5, `test-autozoom`
  8/8, `test-conditions` 12/12): while zoomed, every candidate must look like paper
  (lighter than round it, clear of the edge). Held while Atanas reset the app, pushed
  at 03:30 on his go. `test-far` had no clips in this checkout (regenerated with
  `gen-far.py`, `gen-far2.py`, `gen-far4.py`) and then read 16/25 — the same 16/25, the
  same nine, on a scratch build of the commit before the fix: the seven "still" checks
  (the `ImageCapture` stand-in never gets called and nothing is captured in 15 s), the
  dark phone-like object and the white box on a coloured bill. Pre-existing, not from
  this change; on the list to look at.
- **02:00, his other chat overloaded.** Diagnosed from here: the machine was fine (8 GB,
  31% free); that session's transcript is 11.5 MB with WhatsApp and a dozen connectors
  loaded. On his "copy all plus the long chat history": a full backup at
  `~/Desktop/Claude backup 2026-09-22/` (210 MB, verified byte for byte) — that session's
  export and its 132 transcripts and memory, the 47 scheduled tasks, the global
  CLAUDE.md, this project's memory and transcripts, a README saying what each is. He is
  starting that chat afresh; the folder is what to point it at.
- **02:30, the first page** (his night-list item: Free invoice and Check a company on
  one page, a picture of the scan, one or two buttons, "three old kids should be able
  to do that"): a five-agent research pass, written up as `notes/first-page-research.md`
  — what a stranger sees today (bounced to the sign-in form, the free tools its two
  smallest links; the company check switched off live and talking about an API key),
  the page to build instead (headline, line, two full-width buttons with one line each,
  the picture described, the foot line), the screen after each button, the type and
  contrast rules with sources, and the words never to use. Nothing built; his to react to.
- **04:10, his orders for the night**: triple-test everything (suite, live, review);
  Hidefield may be used for tests within limits (CLAUDE.md); a postcode must give the
  addresses and an address its postcode; a big list; and "surprise me with 12 things
  you're gonna fix on your own". The list grew to 87 items with 110 lettered steps
  (six agents, `notes/tonight-list.md`); `notes/address-lookup-options.md` compares five
  Royal Mail resellers (Ideal Postcodes recommended, about £11–13 a month at 300
  lookups, his sign-up and key).
- **Surprise 1 of 12, Settings** (his six voice notes): cards in a first-timer's order
  with the account last; VAT is one switch (Without / With) and the number box; numbering
  is one line; the stale logo sentence is gone; a company's address is no longer
  "(optional)"; categories follow the kind of account (three starting lists in
  `src/lib/categories.ts`; an untouched list follows a change of kind, an edited one is
  offered the kind's extras with "Add them", never trimmed); Remove links, ticks and
  radios in neutral grey; reorder arrows 32px; reminders intro cut to two sentences with
  the rest under "How it works"; a Save bar that stays in view, says "Unsaved changes.",
  and holds a tap on any link with Save and go / Leave without saving / Stay. The
  company-number box looks the number up once complete and fills the name
  (`CompanyNumberInput`; only visible once the Companies House key exists). New suite
  `test-settings-save` (31/31); `test-settings-add` 36/36, 16 other suites that visit
  Settings green. The harness now answers the unsaved-changes prompt on a `goto`
  (mockdb.mjs), which had hung two suites. Three suites fail the same way on the commit
  before this one — `test-company` (7/8), `test-company-picker` (18 then a wait) and
  `test-review-fixes` (a wait) — so they are older and on the list, not from this.
- **Surprise 2 of 12, VAT from a printed rate** (his GO OUTDOORS receipt: "20%" printed,
  no VAT figure, VAT box empty, £0 in box 4): the reader now reports the one rate printed
  as applying to the whole document (`vatRate`, null when a figure is printed, when more
  than one rate applies, or when anything is zero-rated or exempt) and never does the sum
  itself; `src/lib/vatFromRate.ts` works the figure out to the penny, marks it low
  confidence so it is flagged and held back from "Save all ready", and the scan page says
  "VAT worked out from the 20% rate printed" under the box until a figure is typed over
  it. The email import does the same and puts the note on the review row. New suites
  `test-vat-from-rate` (12/12, logic) and `test-vat-rate-scan` (6/6, mocked reader). Full
  harness: 77 suites, one fail — Settings at 320px, five pixels over from the category
  rows, fixed (`min-w-0` on the box) — then green; `run-all.sh` now also counts a suite
  that prints 0/0 as not green, which is what `test-review-fixes` has been doing.
- **Surprise 3 of 12, the address finder's free path** (his "it doesn't work at all",
  reproduced live: SE18 1HU lists nothing but itself; "149 Benares Road" lists the road,
  then a school in Devon and one in Hampshire). The real answer is Royal Mail's file
  (`notes/address-lookup-options.md`, his key); meanwhile the free search keeps only
  matches carrying every real word typed (`typedWords`, `matchesTypedWords` in
  `addressLookup.ts`: the house number and words like Road are not words to match), and
  a postcode with no houses listed says so in the box — "No houses are listed for SE18
  1HU in the free directory. Tap it to fill in the town and postcode, then type your
  house number and street." — instead of a bare list of one. New logic suite
  `test-address-words` (13/13); `test-address-fields` (live postcodes.io and photon)
  grew five checks, 23/23. He added a list item at 04:50: a free "scan anything" button on
  the free page, 23 files a day per user, export or send on (item 29b).
- **Surprise 4 of 12, feedback reaches him** ("I want people to be able to give me
  feedback, and I want to be able to receive them on emails, so you can see them"). New
  `POST /api/feedback` (signed-in only, 20 an hour each, 5,000 characters): saves the row
  as the sender, then emails `FEEDBACK_TO` through Resend from
  `feedback@invoiceover.com` with Reply-to the sender — message, page, sender, London
  time, browser, build — and still saves when the email can't go (answer says "not
  emailed"). The Feedback page posts to it and says "Sent. Thank you."; a refused send
  keeps the text. `harness/feedback-inbox.mjs` appends every new row to
  `notes/feedback-inbox.md` (gitignored: the repo is public and the file holds testers'
  addresses) as an unticked line, never rewriting one, so a tick and a note survive; CLAUDE.md
  rule 9 now runs it at the start of a session. `FEEDBACK_TO` set to his account address
  on Vercel (production). Four suites: `test-feedback-email` 9/9, `test-feedback-inbox`
  10/10, `test-feedback` 10/10 (its own dev server, a Resend stand-in, the mock now
  answering `/auth/v1/user`), `test-feedback-page` 11/11. A live send needs a signed-in
  browser, which mine isn't tonight.
- **Surprise 6 of 12, sign in before scanning** (his 04:00 ask: "everyone should have to
  sign in in order to be able to scan"). `/api/invoice-template` now turns a stranger
  away with 401 and "Sign in to scan" (the anonymous Gemini path and its per-address
  limits are gone; the per-account limit stays); the Free page's scan card offers "Sign
  in to scan" (to `/login?next=/free-invoice`, the typed draft kept on the phone) and
  says why; the intro reads "no sign-in needed. Scanning one in takes a free sign-in
  first". Typing an invoice stays open. The camera suites open the scanner from that
  page as a stranger, so `harness/fake-session.mjs` gives them a signed-in browser
  without a database (session in localStorage, Supabase calls answered in the page,
  `localStorage.clear()` putting the session back); `test-route-guards` moves the route
  to the signed-in list (37/37); `test-free-draft` checks the stranger's card (8/8);
  autozoom, camera-tip, tips, pinch, share and what-surfaces green.
  (Surprise 5, the company-number box filling the name, went in with Settings.)
- **Surprise 7 of 12, the front door** (`notes/first-page-research.md`, built as
  recommended, without the picture): a stranger at `/` now sees "Make an invoice. Check a
  company." / "Both are free. Nothing to join. Nothing to pay.", two full-width 64px
  buttons with one line each, "The facts come from Companies House.", and "We do not keep
  anything you type unless you ask us to." — instead of being bounced to the sign-in
  form (`src/components/Welcome.tsx`; the root page picks Welcome or the dashboard by
  the session; the Gate lets `/` through). Signed in, the dashboard is as it was. New
  suite `test-first-page` (13/13: no bounce, hrefs, button size, type sizes, none of the
  research's banned words, 320px, the dashboard signed in); sign-out, empty-account and
  first-week green.
- **Surprise 8 of 12, "How would you like to start?"** (the research's screen after
  "Make an invoice"): the Free page's chooser is now two big buttons — "Take a photo of an
  old invoice" ("We copy your details in. You check them. Your phone will ask to use the
  camera."; for a stranger the same button leads to the sign-in and says why) and "Type it
  in" ("Fill in a few boxes. We build the invoice as you go.") — with "Start a quote" a
  small link and the check-company line in plain words. The tip stays. Ten suites and two
  camera helpers pressed the old labels; swept (`"Start blank"` → `"Type it in"`, `"Scan
  an existing invoice"` → `"Take a photo of an old invoice"`); free-draft 9/9, tips 7/7,
  share, autozoom, camera-tip, pinch, what-surfaces, labels, first-page green;
  `test-company` fails exactly as it did before tonight.
- **Surprise 9 of 12, the sign-up that waits for the click** (his 04:05 ask: "they need to
  click the email and approve the registration"). The app side is built for the day he
  switches "Confirm email" on in Supabase: sign-up asks for the link to come back to the
  app; with no session yet the page becomes "Check your email — We've sent a link to
  <address>. Tap it to finish, then come back here." with "Send it again" (Supabase's
  resend), "I've tapped the link, sign me in" and "Wrong address? Start again"; a sign-in
  refused for want of the click says so in plain words with "Send the email again"; an
  expired or used link coming back is explained, and the reason cleared from the address.
  "Need an account? Sign up" is now "New here? Make a sign-in", the blue links grey. New
  suite `test-sign-up` (15/15, Supabase mocked); sign-out green. Still his: the Supabase
  switch, Site URL and redirect list, and SMTP through Resend (items 6–9).
- **Surprise 10 of 12, "Getting ready…"**: the scanner's first open downloads 13 MB
  before anything can be found and looked like nothing (his report last night). The
  11-pixel "Edge detection: loading…" is now "Getting ready… the first time takes a
  moment", white on dark, readable. camera-tip and torch-nocv green.
- **Surprise 12 of 12, plain words for strangers**: the free page's chooser (surprise 8)
  and now the company check's waiting state — "This check is coming soon. For now you
  can look the company up on the official site." instead of a paragraph about an API and
  a key, and "Only limited companies are on the register. A sole trader won't be found
  here." instead of "LLPs". `test-check-company` 54/54, `test-first-page` 13/13. The
  banned-word sweep of the editor itself is item 22 on the list, not done.
- **Surprise 11 of 12, the far suite's nine old failures**: eight were the harness, not
  the scanner. `large.mjpeg` drew a 556-px-wide page on a 720-px frame, and since the
  2026-09-21 change the detector looks only at the strip the phone shows (about 499 px
  here), so the page ran off both sides and the seven "still" checks never saw a capture
  — the clip now draws it 440 wide (`gen-large.py`). The dark-object and coloured-bill
  checks demanded "Fit the page" on every tick, but no hint shows until a page is found
  and a dark clip may say it is dark; they now fail only on a lock-on or a zoom. 34/35.
  The one left is real and open: with the camera's own still handed over sideways, the
  scanner falls back to the video frame instead of turning the still upright
  (`stillOfRegion`, the match score for a 90° turn); on the list.
- **05:30, the review of the first three fixes** (85 agents: four reviewers, three
  skeptics per finding; 23 findings stood, 4 refuted), all fixed: the company-number box
  no longer looks up the number it opened with (which had filled the name on an untouched
  page and marked it unsaved) and reads the typed name when the answer lands; the
  browser's Back and the phone's swipe-back are held like a link (a copy of the entry is
  pushed while dirty, Next's own state kept in it); a link to the same page is let
  through; shift- and alt-clicks too; Sign out, header or page, is held; the bar's error
  and note lines stay clear of the Feedback pill; the VAT switch is two real radios
  (keyboard arrows work) and the number box stays, greyed, while VAT is off; focus
  follows a moved category (to its other arrow at the top or bottom); an empty
  category list is refused with words instead of saved as "no list"; a usual category
  that left the list when the kind changed stays choosable on the receipt form;
  "Other" is kept last whatever its spelling; a VAT figure worked out from a printed
  rate follows a corrected total; a rate written as 0.2 means 20%; the free address
  search folds apostrophes ("Kings Road" finds King's Road), ignores flat and unit
  prefixes, bare numbers and postcodes typed in the street box, resolves the post town
  before matching, and only insists on the street's words (the town may be filed
  elsewhere, a match on it ranks first); the address suite now proves the road itself
  is offered. `test-settings-save` 39/39, `test-address-words` 24/24,
  `test-address-fields` 24/24 (live), `test-vat-from-rate` 13/13, `test-vat-rate-scan`
  7/7, `test-company-number` 7/7.
- **Second dozen, 13: plain words on the signed-in pages** — "How late is what you're
  owed", "VAT on those costs", "Expenses" with the period under it, "Shop or supplier",
  "Download for a spreadsheet", "add one by hand", "Send a text", "check what was read
  off them"; the expenses page's blue links grey. Six suites swept for the old words;
  clear, no-silent-contacts, receipts-list, texts, empty-account, first-week, delight,
  what-surfaces, vat-return green. (`test-receipts-list` ends in an error after its 31
  checks — the runner counts it green because 31 = 31; it did so before tonight too.)
- **08:33, back on the timer.** Second dozen, 14–17: an empty account's dashboard now
  says "Nothing here yet — scan a receipt or write an invoice and this page fills in"
  instead of nine £0.00s, and keeps saying it after the tip's three showings; with data,
  the lateness card shows only while something is outstanding and "This month so far"
  no longer repeats the tile's figure. The Quotes empty state has a next step; the VAT
  page says "Loading…" until its figures arrive. The five `break-words` left are
  `wrap-anywhere`. The expenses page's month, year and 30-day range, the paid
  celebration's month and the Free draft's year read the London clock (`todayISO`), not
  UTC — the exact hour-after-midnight bug CLAUDE.md documents, in three more places.
  empty-account 135/135 (three new checks), long-values 28/28 (a 60-character detail
  value and a long supplier address seeded), midnight 8/8 (the expenses boxes at 00:30
  BST), first-week, quiet-failures, what-surfaces, delight, fit-320, vat-return green.
- **18, dates people say**: `src/lib/dates.ts` holds the one short-date helper (the
  quote code re-exports it); the dashboard's due dates, the invoices list (date, due,
  credit notes), the clients' payment history, the files tiles, the mileage list, both
  recurring lists, the invoice page's credit notes and remove-payment confirm, the
  credit-of choices and the issued invoice's credit-note line all read "1 Oct 2026",
  never 2026-10-01. New suite `test-plain-dates` (11/11: one of each record, eight pages
  walked, any year-month-day in visible text fails); first-week, delight, empty-account,
  mileage, statement, print, quiet-failures, what-surfaces, credit-rollback green.
- **19–23**: every box has a name — 72 inputs, selects and text areas named from their
  purpose or their placeholder (a placeholder vanishes as soon as something is typed),
  the contact pickers and the company-name box naming themselves, the From / To date
  filters on receipts, invoices and files under visible labels; `test-labels` now
  checks every box on every page and the two edit forms behind Edit (22/22, was 69
  without a name). Contrast and size floor: the exchange-rate note, the details line,
  paused recurring rows, the files' loading text and the unstarred star up to
  neutral-500/600; the 10-pixel red "CN" is a neutral "Credit note" badge; the
  11-pixel address and register notes are 12; `test-dark-mode` walks Receipts and
  Recurring too with an exchange-rate receipt, a warranty and a paused item, both
  schemes (48/48). "Regenerate address" asks first, naming the consequence
  (`test-no-accidents` 31/31). The dashboard's Overdue tile and banner and "View all
  outstanding" open the invoices list already filtered (`?status=`, through the
  router, since the page renders before the address bar changes), and a client's
  history links to their invoices (`?client=`); `test-first-week` 18/18. The
  Claude/Gemini picker on the scan page shows only on a device where one was chosen,
  and the read line no longer names the engine.
- **24, neutral greys across the app**: 40 blue links and buttons (dashboard, clients,
  invoices, receipts, files, VAT, the "+ Add line"s, the quote and invoice pages, the
  reset page, the price finder, the reminders card) are dark underlined text; the twelve
  red Remove / Discard / ✕ buttons are grey, the confirm carrying the warning; the blue
  "emailed receipts waiting" banner is the neutral card; "Saved." and "Sent." are grey.
  Kept on purpose: the round status and type badges, the amber banners, red alerts,
  money that is overdue or negative. New suite `test-neutral` (20 pages through the
  mock, every visible element's computed colour; blue-ish, or red-ish outside those
  exceptions, fails naming the text): 20/20. **Full harness at 10:40: 86 suites, every
  one green except `test-review-fixes`, which dies before its first check (0/0) exactly
  as it did before tonight and is now counted honestly.** The list carries a tick and the
  commit on each of the 32 items landed since 03:45.
- **11:20, the review of the second dozen** (64 agents; 19 findings stood, 1 refuted),
  all fixed: the file preview's raw date; the month card one column on a phone (a
  five-figure month split mid-number at 320px); a draft's "Invoice date" and the quote's
  "Notes" announced as something else (labels now paired by id, not overridden); the
  scan page's Supplier box nameless when given a label without an id (ContactField
  makes its own); the filter rows misaligned by the new From / To labels (`items-end`);
  the sent invoice's credit-note date and three edit boxes nameless behind their
  toggles (the labels suite opens them now, and no longer counts a `title` as a name);
  the recurring day box named short of its label; an imported-draft note underlined by
  the sweep; the invoices list's "CN" pill now says "Credit note"; Remove buttons
  underlined so they read as taps; "Remove photo" and the sent-invoice box swept too;
  the invoices page keyed on its search string so a second tap on the Overdue tile
  changes the filter and "Clear filters" clears the address; `/scan?engine=claude`
  gives a fresh device a way to the picker (CLAUDE.md). `test-neutral` now visits 24
  pages, refuses the money pass to buttons and links, and catches green; labels 22/22,
  neutral 24/24, dark-mode, first-week, plain-dates, announced, fit-320, fit-sweep,
  settings-save, quote-chase, credit-rollback, no-accidents, empty-account, mileage
  green.
- **First page, 22 and 23**: the research's banned words off what a stranger sees —
  "Print or save" (not "as PDF"), "Keep a copy in the app" (not "Save to your account"),
  "Sign in to send (it's free)" (not "sign up"), "a free sign-in" (not "a free account"),
  "Copying an old one in from a photo" (not "Scanning"), "every read" (not "every scan"),
  "Free, nothing to join" and "No company with that name is listed" on the company
  check. New suite `test-plain-words` (6/6): the front door, the sign-in page, the
  company check, the free page's chooser and the editor (where VAT, CIS and UTR are the
  person's own words; the Companies House register and a bank account's name are domain
  words, not the banned sense), and it prints every sentence over 15 words for the
  reading-age pass — three today. free-draft, first-page, share, one-handed, statement,
  settings-add, check-company 54/54, sign-up green. Three suites not in the runner
  (`test-free-quote`, `test-links`, `test-quotes`) press labels from before tonight and
  fail; they were failing before and stay off the list.
- **First page, 20 and part of 21**: the company check now asks "What is the company
  called?" with one big box ("Company name, or its number", "Smith Building Ltd, or
  01234567"), a 56px "Check" button, "Not sure of the spelling? Type what you have. We
  show the close matches.", and the intro cut to one line; nothing on it under 16px.
  Focus rings on the front door's two buttons, the free page's chooser and the Check
  button, for a keyboard. check-company 54/54, plain-words, first-page, fit-320,
  free-draft, company-number green.
- **First page, 19**: the free editor opens with the four boxes that make an invoice —
  your business name, who it is for, what you did, how much — and one big "Add more
  details" (dates, addresses, VAT, how to pay, a note, a signature, a quote instead);
  a draft that already carries any of that (typed, read from a photo, imported) opens
  with everything showing (`draftHasMore` in `freeInvoiceDraft.ts`; a remembered
  signature doesn't count). "Print" is its own button in the phone bar. free-draft
  12/12 (three new checks), address-fields 25/25 (its note finder follows the 12px
  note), share, keyboards, labels, one-handed, fit-320, plain-words, first-page, tips,
  what-surfaces, weight green; `test-company` fails exactly as before tonight.
- **Noon batch** (items 37, 41, 73, 75, 79, 80, 81, 85): Settings for personal use shows
  "About you" and hides the VAT, numbering, bank details and reminders cards; the data
  export now carries recurring invoices, supplier price requests and the reminders sent
  (`remindersSentStore.all`); "Make" is the one verb (the Add sheet's "Make an invoice" /
  "Make a quote", the dashboard and invoices intros), the Add sheet has "Add a client or
  supplier" and the dashboard's separate button is gone; the Quotes list uses the same
  + Add sheet as the other lists; the receipts star reads "Keep handy" / "Kept handy",
  its filter "Kept handy only"; the header marks the page you're on (`aria-current`,
  semibold), drops Free invoice and Check a company from the main row, and a "More
  pages" button reaches Needs review, Mileage, VAT, both Recurring lists, Files,
  Feedback and the two strangers' pages — a real button, not `<details>`: open only on
  the page it was opened on, closed by Escape or a tap elsewhere, not in the page while
  closed (`test-one-handed` had caught the closed menu's links hit-testing as covered,
  and two "More"s on the signed-in Free page); phones get room at the foot for the
  Feedback pill. Suites: settings-add 37/37 (the sheet's contact row, the export's new
  lists), settings-save 40/40 (personal use), first-week 22/22 (every page reachable
  from the header, the current one marked, a pick closes the menu), one-handed 17/17,
  labels, neutral, fit-320, fit-sweep, empty-account, dark-mode, sign-out,
  what-surfaces, first-page green. Asked mid-batch "are you good there": yes; "carry
  on".
- **12, 39, 63, 64**: inside the app the machinery words are gone — "Get a new address"
  and "Get an address to email receipts to" (not Regenerate / import), "Couldn't make an
  address", "Make it now" / "Making…" and "a draft invoice is made for you each month" on
  recurring invoices, "need a database update first" (not migration-029), "Kept in the EU
  (Ireland), and only you can read it" (not Postgres, Supabase, bucket), "as one file" and
  "Download for a spreadsheet" (not JSON, CSV). The import address sits on its own line
  with Show / Copy / Get a new address beneath; the VAT number has a note, and says what a
  UK number looks like when the one typed doesn't. A sign-up's confirmation link now
  comes back to where the person was going (`?next=`, the Free page with its draft),
  not the dashboard. `test-plain-words` also walks 20 signed-in pages for developer and
  talking-down words (7/7); settings-add, no-accidents, sign-up (the link back to the
  Free page), settings-save, labels, clear, what-surfaces, empty-account green.
- **52, the harness's own blind spots**: four suites had been "green" while stopping
  part-way — `test-uploads` after 2 of 15 checks, `test-review-fixes` before its first,
  `test-company-picker` after 18 of 39, `test-receipts-list` after 31 of 48 — because
  their upload files (`harness/uploads/`, `harness/multi/`) lived only in a wiped
  scratchpad, and because `run-one.sh` judged by passed == total, which a throw after
  some passes satisfies. `gen-uploads.py` and `gen-multi.py` make the files again (PDFs
  carrying DOC1..3 in UTF-16, photos told apart by pixel size, as the stand-in readers
  expect); `run-all.sh` makes them when missing; `run-one.sh` counts any ERROR line as a
  crash. `test-company` read the address as the one text box it was before 2026-09-20
  (now four boxes) and `test-receipts-list` pressed "which?" and "link them" (now shown
  straight away for three or fewer, and "Link 3"). All four repaired: uploads 15/15,
  review-fixes 21/21, company-picker 39/39, receipts-list 48/48, company 22/22; and
  `test-multi-docs` (33/33) — the only test of several documents in one scan and Save
  all ready, which had never run in this checkout — is in the runner with `test-company`.
- **29b, Copy a document** (his "another scanner button ... to scan files, no matter
  what files ... export them or send them to someone directly for free"): `/copy` —
  "Take photos" (the batch camera, its review now saying "Check your photos" / "Use N
  pages" with no grouping) or "Choose files", pages in order that can be moved and
  removed, a name for the file, then "Save the file", "Share", or "Or email it to
  someone" through `POST /api/send-document` (fenced like invoice sending: signed in and
  confirmed, a real PDF under 4 MB, fixed wording with the note quoted, Reply-to the
  sender, 10 an hour / 30 a day). One PDF, an A4 page per photo turned to match it, a
  PDF's own pages copied in (`src/lib/documentPdf.ts`). Nothing read, nothing kept;
  signed-in only per his rule, a stranger asked to sign in and brought back. Ways in: the
  front door (a third line), the free page, the Add sheet, More pages. No daily cap, as
  he said. `test-copy-document` 20/20 (stranger, camera opens and closes, three files to
  three pages, remove, move, save with the page count and orientation checked, share,
  email, a refused send), `test-send-document` 12/12 (its own dev server and a Resend
  stand-in).
- **8, 11**: the four sign-in emails in plain words in `web/supabase/email-templates/`
  with a README saying where to paste each; the sign-up email carries a six-digit code
  and the check-email screen a box for it (`verifyOtp`), for someone who opens the email
  on another device. `test-sign-up` 18/18 (a wrong code, a short one, the right one
  signing in and going on to the Free page).
- **38**: a record's own category stays choosable in every drop-down, and the receipts
  filter offers every category receipts carry (`withCurrent`, `withUsed`);
  `test-receipts-list` 50/50.
- **40, a logo** (d949a4f): Your business in Settings takes a PNG or JPEG ("Add a
  logo", "Change logo", "Remove logo", which asks first), shrinks it to 600 pixels on the
  device and keeps it in the account's own folder of the photo bucket (`<uid>/logo/`).
  It heads the invoice and the quote on screen, printed, in the PDF and on the
  customer's /i/ and /q/ pages. Settings had been saving `logo_url: null` every time,
  so a logo would have gone with the next save of anything. The customer pages read the
  file with the service role, so only a path inside the link owner's own logo folder is
  read, never one with "..". `test-logo` 13/13; `test-public-logo` 27/27 (its own dev
  server; someone else's folder, a climb out, a missing file and no logo all show none,
  and storage is only ever read for the owner's folder); twenty neighbouring suites
  green. The customer pages turn out to be drawn in the browser, not in the server's
  HTML, so a check on the raw page proves nothing either way.
- **26, one name** (63e84ba): "Invoiceover" (from the domain) wherever the app names
  itself: the tab, header, sign-in line, home-screen label and manifest, notifications,
  email senders ("<business> via Invoiceover"), "Sent with" on the customer pages, PDFs
  and the four sign-in emails waiting to be pasted into Supabase. One constant,
  `src/lib/siteName.ts`; `test-site-name` holds the manifest and service worker to it and
  searches every app file for an older spelling. His to change in one line.
- **Two files git stored as binary** (63e84ba): the document-emailing route and the scan
  client each held a raw control byte where an escape belonged. They worked, but git
  showed no diff for either and grep skipped them, which is how three "Invoicer" lines
  hid from the rename. Plain text now; `test-source-text` checks all 541 source files.
- **54, stale notes** (63e84ba): the scan route's sign-in rule in CLAUDE.md, and in the
  standing notes the capture pause, the default reader, the limiter, the local keys and
  the Worker and Resend steps, all corrected against the code.
- **42b and 82, the address finder, properly this time** (8678bad): 42b had been ticked
  at 04:46 for only its Devon-schools filter and no-houses note. Now his two asks work: a
  whole postcode lists its addresses by itself (700 ms, or leaving the box) and a number
  and street finds its postcode (900 ms), no button needed; only typing searches. A
  street's postcode comes from OpenStreetMap or the nearest from postcodes.io, marked
  "check it's your postcode"; a postcode with no houses lists its streets, and a pick
  keeps the typed house number; a refused Royal Mail key rests ten minutes and the box
  says the list is the free one. The three services take stand-in hosts:
  `test-address-stubbed` 37/37 off the internet (the paid path included),
  `test-address-words` 37/37, `test-address-fields` 25/25 against the live services.
- **53, the supplier page** (b995fa4): `test-public-request` 28/28 on its own dev server
  (the stand-in database now answers a supplier's online answer by migration-028's
  rules). `test-quote-requests` writes screenshots into another project's scratch folder,
  so it is left alone. /i/ and /q/ open and show the logo in `test-public-logo`; their
  Accept/Decline and open counting are still only in `test-links`/`test-quote-links`,
  which need a server built against the stand-in.
- **Tried live** (30cdb7d): on the deployed Free page, typing SE18 1HU listed its
  streets by itself, and "149 Benares Road" with London came back as "London SE18 1HS,
  check it's your postcode" and filled the box on a pick. The first street search after
  the deploy had answered "isn't answering": Photon, the free map server, takes about two
  seconds a search, the functions run in Washington (iad1) and start cold, and five
  seconds wasn't enough. Map lookups now get eight, the box asks once more after a 503,
  and on a cold server the same search took 4.8 s and answered. The free data gives a
  street's postcode, not a house's: his own house is SE18 1HU, Benares Road's is SE18 1HS.
  Exact house postcodes need the Royal Mail key (item 58, his decision).
- **The runner** (see the commit after 30cdb7d): each suite has ten minutes in a process
  group of its own, so a suite that prints its results and never exits (three did today
  under load) no longer holds the run up, and any dev server it started goes with it.
- **51, lighter pages** (771b844): Next preloads the code of any page a visible link
  opens, so the Copy page's PDF library (about 500 KB) went to every visitor of the front
  door and the Free page, and the Expenses chart library (358 KB) to every signed-in page.
  Both now load where they're used. Free page for a stranger 1469 -> 969 KB, dashboard
  1526 -> 1181 KB; `test-weight`'s budgets come down to 1.1 MB and 1.35 MB.
- **53, finished** (43e433d): `test-links` and `test-quote-links` start their own dev
  server and run nightly (18/18 each); they had gone stale unseen on the dead-link wording.
- **28, a candidate picture** (notes/front-page-picture/): the phone over the invoice with
  the green outline, 2.7 KB of SVG, not on the site until Atanas says yes.
- **The free tools organised, and one app around them** (Atanas, 2026-09-22 afternoon:
  "I'm not happy with how the free features are shown... I want them all organised on the
  first page... make it as one whole app not two different apps"). `/` for a stranger is
  now the free page: four big buttons, one of them the main one — make an invoice or a
  quote, start from an old invoice, check a company, copy a document — each with its line,
  the two needing a free sign-in saying so, and "We keep nothing you make here". "Start
  from an old invoice" goes to `/free-invoice?start=photo`, which opens the camera on
  arrival and tidies the address. Signed in, the dashboard's first row is the same four
  tools, and the header is three groups (Money in, Money out, Tools) plus Settings, with
  one Menu button on a phone: no "More pages" drawer, and item 74's wrapped header solved.
  A stranger's header holds only Sign in; the brand goes back to the free page.
- **No paywall yet, by his call**: "I want people to still try it for free for now and I
  don't want to pay anything more for now". So everyone signed in keeps the whole app, and
  the paid switch (a column only he can set, payments flipping it later) is written up in
  item 56 for when payments come. Nothing new costs anything.
- **Tests**: `test-first-page` rewritten for the free page (17/17: the four tools and where
  they go, one main button, sizes, the lines, the banned words, the camera opening from
  Start from an old invoice); `test-first-week` for the grouped header (24/24, including
  the group marked for the page you are on); `test-settings-save` taps its links through
  the Menu, which the unsaved guard holds as before. Full run 99 suites, the two it caught
  fixed and green; the whole run again after them, 99 suites, all green (3e6f6ad).
- **Nothing before an account, and a front door that says why** (Atanas, 2026-09-22
  evening: "there shouldn't be any free options before you're able to register... it
  should be a plain page with some nice advertising of the app and the log in
  rectangulars"). `/` for a stranger is now the headline, five short lines of what the app
  does, what you can save it as, and the sign-in card beside them; every other page sends
  a stranger to `/login`, and only the customer links stay public. The card itself is two
  tabs (Sign in / New here), a label over every box, the password typed twice when the
  account is new, and the check-your-email screen with its six-number code; the button
  says "Sign me in" so it isn't the same words as the tab. `/login?new=1` opens on making
  an account.
- **A short "how it works" the first time** on scan, copy, check a company, expenses, VAT,
  mileage, files and needs-review, in one sentence each.
- **Ten suites had to learn the new rule** (they used the free tools as strangers):
  test-first-page rewritten for the front door (16/16), test-sign-up for the new card
  (19/19), test-free-draft, test-plain-words, test-copy-document, test-save-as,
  test-address-fields, test-check-company and test-address-stubbed sign in first, and
  test-one-handed now skips what the browser does not paint (a closed <details> still lays
  its pages out). Full run: 100 suites, all green.
- **Seven ways to save a document** (f98ebd2), his "the more options the better even in
  the free version": PDF, picture, smaller picture, Word, web page, plain text and
  spreadsheet, beside the PDF button everywhere a document is shown, and in the free
  page's phone menu. All but the PDF and the pictures are read off the printed sheet
  itself, so nothing keeps a second copy of the totals. `test-save-as` 20/20.
- **The header menus opened on the first tap** (492e5b3) after his "it takes ages and
  three, four clicks": they were buttons, which do nothing until the page's code has
  started, where the old header was plain links. Each menu is a `<details>` now, opened by
  the browser itself, with real links inside. The dashboard also stopped fetching the 13MB
  scanner engine on a connection that says it is slow or saving data.
- **Emailing any document** (b42d178): the form Copy a document had is now shared, and the
  file library can save any scanned, uploaded or emailed-in document as one PDF or send it
  to anyone. `test-send-document` 18/18 end to end.
- **Change a file** (347478c): `/convert` turns pictures, PDFs and spreadsheets into each
  other on the device, nothing uploaded, pdf.js's worker copied beside OpenCV so no other
  page carries it. `test-convert` 15/15 on real files.
- **Final full run** (99 suites): 97 green. The two misses were the newly converted link
  suites meeting a freshly compiling dev server under load (a page still "Loading…", a
  first press past 15 s, a mid-test reload); fixed by compiling their routes first and
  waiting properly, then 18/18 each twice in a row in the nightly order.
- **Full run after these** (95 suites): 92 green; `test-share` (Chrome took over 30 s to
  start) and `test-camera-tip` (the camera took over 700 ms, which is what shows the tip)
  failed on load, not code, and passed on a rerun, as did everything touching addresses.
  Three suites (`test-neutral`, `test-plain-words`, `test-copy-document`) printed their
  results and then never exited, browsers gone, no sockets; stopped by hand, all green
  alone. The load was iCloud (`bird`, `fileproviderd`) syncing build and profile files.
  `test-weight` 8/8: the dashboard is under its 1.5 MB.
- **Full run with the stricter judge** (before the last three): 89 suites, 87 green; the
  two others were `test-check-company` beside the other dev-server suites (now run one at
  a time — 54/54 alone) and `test-sign-up` mid-edit (18/18 on the new build).
- **05:43, paused** at Atanas's ask ("start again in two hours and 50 min"): a one-shot
  timer restarts the work at 08:33. Next up: items 14–24 of the second dozen, then the
  rest of `notes/tonight-list.md`.
- **03:45, tonight's list** (`notes/tonight-list.md`): 61 items from every open note, the
  research, his Settings screenshots and three new asks — feedback reaches him by email
  and me at the start of a session; sign-in before scanning; a confirmation email on
  sign-up. His Notes app is readable through AppleScript (text, and the pictures come
  inline in the note's HTML body), but the files behind it — the voice recordings — are
  locked to anything I run, even a recording he drags into the chat. A small on-device
  transcriber (Speech framework, wrapped as an app so macOS can ask for permission) is
  built in the scratchpad and waits for recordings copied to a plain folder.

- **01:00-01:30, sign-up emails switched on at the dashboard** (items 6, 7, 9, with him
  at the Mac). URL configuration was already right (Site URL the live Vercel host,
  redirects for it and localhost). He created a Resend key "Supabase auth" and pasted it
  himself into Supabase's SMTP password box — the key value was never read, typed or
  printed here, and when the dashboard offered to reveal it the auto-mode classifier
  refused, correctly. Custom SMTP on: accounts@invoiceover.com, "Invoiceover",
  smtp.resend.com, 587, username resend. The four templates
  (`web/supabase/email-templates/`) were pasted into Supabase through the Monaco model
  and **verified by reloading each page**: confirm sign-up, reset password, change email
  address, magic link, subjects and bodies all ours. "Confirm email" turned out to be
  **already on** (Sign In / Providers → User Signups), so the missing piece was only the
  sending.
- **Not proven yet.** Two password resets for atanaschoo@gmail.com return 200 from
  `/recover` (auth log: `user_recovery_requested`, no error), but nothing reaches Resend's
  Emails list. Either Resend's dashboard does not log SMTP sends, or the key did not take
  and GoTrue fell back to Supabase's own sender. The sender address on the email that
  arrives tells them apart, so item 14 (a real sign-up from an address he can read) is the
  next step. Two settings still stand against the plan: item 7a asks for port **465**
  (587 is set) and item 9a for a **6**-digit code lasting **86400** seconds (8 and 3600 are
  set), and the templates say "24 hours". Left alone tonight rather than saved blind: the
  SMTP form's password box reads empty by design, so saving the form again risks clearing
  a key that cannot be read back.

**Open, for Atanas** (`notes/tonight.md`): fix the GO OUTDOORS date on his own account
(2012 → 2026); the business details in Settings, whenever he likes; yes or no to the
front-page picture (notes/front-page-picture/); the Supabase steps for sign-up emails
(items 6–9); the Companies House key (24); a Royal Mail key only if he wants exact house
postcodes (58: the free data gives a street's, e.g. SE18 1HS for his SE18 1HU).

**Open, for the next session**: the Claude half of the bench (`node bench-engines.mjs`
once the key is there); item 28 (offline scan queue) still waits for an iPhone; the
dashboard is 1,501 KB of JavaScript against a 1.5 MB budget — under, but only just.

## 2026-09-20 evening → 21 September — Atanas away, steering from his phone (Opus 5, then Fable 5.1)

39 commits, all on `main` except two feature branches. The working list is
`notes/backlog.md` (the 34 items given to Atanas, plus everything found on the way);
read that before this.

- **Third review, findings 1–10, all fixed**: sign-out left push live (and on a dead
  connection `signOut()` hangs, or returns no error with the session still stored —
  now bounded at 4s and checked by looking, `src/lib/signOut.ts`); the Clients page
  showed ex-VAT subtotals; `/expenses` counted drafts and ignored credit notes
  (`src/lib/periodIncome.ts`); Settings rewound the invoice counter (issuing then
  *jams* on 23505, it doesn't double-issue); recurring "Log it" reported failure after
  saving; an undecodable photo said nothing; the Feedback pill covered the Free page's
  More button; a failed dashboard load cleared the app badge.
- **Every "today" was the UTC date.** For the hour after midnight BST a receipt was
  dated yesterday and an invoice could vanish from the tax card. `src/lib/today.ts`,
  Europe/London; see "What day it is" in CLAUDE.md. Verified live at 00:50.
- **Fourth review** (the seven areas nobody had reviewed): 29 findings, two skeptics
  each, 18 survived. 16 fixed on main — among them six pages of a multi-invoice PDF
  silently dropped, the statement calling late debt "not yet late", a customer owed
  money back shown as owing nothing (the review's own fix would have made legacy
  hand-paid invoices reappear as owed; the skeptic caught it), the Amount column cut off
  the customer's PDF by a long reference, an unreachable Companies House reported as
  "no such company". Two need migrations and sit on branches.
- **Accessibility**: 20 findings, 11 survived, 6 fixed — a blind customer accepting a
  quote on `/q/` heard nothing at all; now a live region and role="alert". The public
  pages can't be run in the harness (server-rendered with the service role), so those
  fixes are verified by reading only.
- **Uploads**: a photo with no extension was tagged `application/pdf` and sent to the
  reader as one; `readUpload` now sniffs the first bytes.
- **Harness**: 71 suites in `run-all.sh`, last full run green. Its own defects fixed: a
  crashed suite reported "0 fails"; `large.mjpeg` had no generator; sixteen suites shared
  a Chrome profile; suites built dates off the UTC clock; `test-check-company` ran a
  frozen worktree copy of the app. The mock gained opt-in RLS (`db.rls`), storage
  signing (`db.storageFails`) and `record_quote_request_response`. Traps written into
  `harness/README.md`: seed rows with `UID`, innerText excludes input values,
  `clickText` matches whole labels, never point a suite outside `web/`.
- **Build trap**: iCloud `name 2.ts` copies inside `web/.next/types` make `next build`
  fail its type check and `:3000` keeps serving the old bundle. Check for "Compiled
  successfully", not just the exit.

**Open, for Atanas** (`notes/tonight.md`): migrations **031** (six readable backup
tables — the one with a real consequence), **032**, **033** then merge
`feature/quote-vat-snapshot`, **034** then merge `feature/deposit-delete-guard`; and the
Currys receipt (£549.99 may be the till total, not the net — his record, his call).
Item 24 (timed Gemini vs Claude batch) spends real credit and waits for his word.

**Open, for the next session**: a **landscape page is never detected** by the in-app
scanner (`quads:0` throughout; a portrait receipt turned sideways fails too) — not traced,
`quadOf`/`fitCorners` next; items 13 and 18; 28 deferred until there's an iPhone to test
on; the two torch clips still have no generator.

## 2026-09-20 (morning) — Atanas awake and steering, Mac desktop app (Opus 5)

**In flight:** the 50-item solo checklist, starting with the account Atanas is actually in:
a brand-new, empty one.

- **An empty account, and what every page does when the load fails** (checklist 4, 38, 44).
  New suite `harness/test-empty-account.mjs`: all 22 signed-in pages against a database with
  nothing in it, then each page's own load failed in turn — 132 checks, green. It found a
  real bug: ten pages loaded with `.then()` and no `.catch()` (dashboard, invoices,
  contacts, receipts, review queue, files, expenses, settings, both recurring lists), so a
  failed load left them stuck on "Loading…" (settings, dashboard) or showing the empty
  state — "No invoices yet", "£0.00" — on books that are someone's real accounting record.
  Fixed: every load catches, stops loading, suppresses the empty state while an error shows,
  and says one plain sentence. Pages that already caught printed the database's own wording;
  `loadFailed()` in `src/lib/errorText.ts` keeps that for the console. Commit `84595ce`.
- **The first invoice a new account ever issues** (checklist 16). A new account has no
  `business_profile` row until Settings is saved, and `assign_invoice_number` reads the
  counter off it — so the very first "Mark as sent" failed with "Could not mark this
  invoice sent.", moments after the confirm panel promised "assigns invoice number INV-1".
  `markSentWithNumber` now writes the defaults and issues it. The panel's catch used
  `err instanceof Error`, never true for a Supabase error, so every real reason was
  replaced by the fallback — `errorText` now. The invoice page's own load had no catch
  either: an unreachable database showed "Invoice not found". `test-numbering.mjs` 11/11,
  and the mock now implements `assign_invoice_number` as the migration defines it.
  Commit `b0eb3ba`.
- **Nothing half-saved when the signal drops** (checklist 40). `test-half-saved.mjs`, 12/12
  — and this one is a clean bill of health, not a fix: a payment whose status update is cut
  off is written exactly once and says so; a failed receipt save leaves no row and a retry
  writes one; a quote whose invoice write fails is released, not left claimed; a reply lost
  after the invoice was written finds that invoice instead of making a second.

- **Nothing goes on one tap any more.** Every Remove — invoice, receipt, contact, payment,
  credit note, both repeats, and Discard on the review queue — deleted immediately, and on
  the invoices list Remove sits about twelve pixels from "View / print". Each now asks,
  naming what goes ("the £200 received on 2026-09-20 — the balance goes back up").
  `test-no-accidents.mjs` 28/28. Commit `031b185`.
- **Long names, big numbers, and phone keyboards.** A 100-character customer name pushed
  five pages sideways at 375px (worst 659px) and a seven-figure total was clipped on the
  dashboard; `wrap-anywhere` (not `break-words`, which leaves min-content alone) plus
  `min-w-0`/`shrink-0` fixed it — `test-long-values.mjs` 26/26, commit `e8d4f4a`. Three
  email boxes opened the full keyboard instead of the email one — `test-keyboards.mjs`
  12/12, commit `b4a2f3d`.
- **Sixty-eight swallowed save errors.** `err instanceof Error ? err.message : "..."` is
  never true for a Supabase error, so a failed save always showed the same generic line,
  including losing signal mid-save. `saveFailed()` handles no signal, the database's own
  codes, our functions' own messages, and otherwise keeps the caller's sentence.
  Commit `b250b4a`. All 26 suites green.

- **A dead link now says something human** (checklist 33). There was no not-found or error
  page anywhere: a customer opening a stopped invoice link got Next's bare 404, which reads
  as "this business is dodgy" rather than "this link is old". /i/, /q/ and /r/ each have
  their own page now, saying what probably happened and what to do, and giving nothing away
  about whether the token existed; the app itself gets a 404 with a way back and an error
  boundary that says nothing is lost. `test-public-links.mjs` 31/31, commit `451bcff`.
- **Every total agrees, everywhere** (checklist 20). One invoice with mixed VAT rates, 12.5
  hours of labour, CIS, a credit note and a part payment: £972.62 total, £91.50 CIS (a
  fifth of the labour *after* the credit), £535.52 owed — identical on the invoice, the
  list, the dashboard and the statement. `test-one-total.mjs` 12/12. Nothing to fix; the
  CIS-after-credit rule is cleverer than it first looks and is now written down in the test.
- **Every control has a name** (checklist 7): `test-labels.mjs` 21/21 over twenty pages.
  **Dead code** (42): two unused functions in the whole codebase, flagged not removed.

- **The reminder emails that go to his customers on their own** (checklist 18) were
  checked against a fixed clock, straight off the app's own source: 24/24. Each reminder
  fires on its own days only (-3..-1, 0..2, 7..9, 14..16, 30..32), the three-day catch-up
  never runs into the next one, no day fires twice, nothing goes after the final notice,
  and the statutory-interest paragraph is limited to the final notice, to a business, with
  the setting on. Nothing to fix. The runner recompiles the module each time so the test
  can't drift from the code.

- **The tax figure he'll set money aside on** (checklist 19) checked against HMRC's rules
  worked out by hand: 37/37. Every band, the £100k taper and its 60p-in-the-pound trap,
  Class 4, the 5/6 April boundary, the Self Assessment dates, a loss, and CIS as tax
  already paid. Nothing to fix. The harness can now run the app's own pure logic directly
  (`tsconfig.logic.json` compiles `taxEstimate`, `reminderTemplates`, `cis`, `vat` and
  `invoiceBalance` fresh on every run), which is how the reminder clock is tested too.
- **What goes in comes back out** (checklist 31): apostrophes, ampersands, accents and a £
  in a note all survive, empty stays empty rather than "null", a penny reads £0.01, and a
  credit note comes off the month. `test-round-trip.mjs` 10/10.

- **Dark mode and contrast** (checklist 6 and 10): 36/36. Every piece of text on six pages
  meets WCAG AA in light and in forced dark, and no input box ends up with its text the
  same colour as its background, which is what Safari does by itself on a dark phone. The
  app stays light either way, as intended. Nothing to fix.
- **Foreign-currency receipts** (15): 11/11 — a $100 receipt stores as £79 with the
  original, the currency and the rate kept; a dead rate service is said out loud and takes
  a rate typed by hand; and with no rate at all nothing is ever saved as £0.00.
- **The harness** (47): the full run is 4 minutes instead of 11, four suites at a time
  through `xargs -P` (the obvious zsh loop quietly ran them one at a time — no `wait -n`).
  `JOBS=1` puts it back to serial. 34 suites, ~800 checks.

- **`test-first-week.mjs` walks the whole thing the way he will actually use it** — empty
  account, add a customer, write invoice number 1, issue it, get paid, log the cost, and
  check the dashboard, expenses, VAT and the list all agree afterwards. 17/17.
- **A bug my own sloppy mock had been hiding.** `test-bad-scan` was answering with
  `documents` and no `result`, which the client reads as a failed scan — so all three of
  its cases were testing the same error path, not "read the page, found nothing on it".
  With the mock answering the way `/api/scan` really answers, the scan screen crashed on an
  empty read: `Object.entries(undefined)`. Guarded (commit `845e251`), though the honest
  note is that both engines conform their output to the schema, so it shouldn't be
  reachable in production — the guard is there because the cost of being wrong is a dead
  page in the yard with the receipt in hand.
- **A six-angle adversarial review of the codebase** (20 agents: six independent reviewers,
  every finding then handed to a skeptic told to refute it). 14 findings, 12 survived
  verification, 2 refuted. All 12 are now fixed or written up:
  - **The worst was one of mine from this morning.** Clearing the invoice prefix — which is
    exactly what Atanas wants, a bare series from 357358 — stores NULL, and Postgres makes
    `invoice_prefix || number` NULL with it, raising the same "no business profile" as a
    genuinely missing row. This morning's new-account fix matched that message and upserted
    the defaults over the existing row: business name, VAT number, address, bank details,
    the email-import token and his own reminder wording blanked, VAT registration off, the
    series restarted at INV-1. Reproduced end to end first (2/14 against the old code,
    14/14 against the new). Commit `134a3e3`.
  - **Two wrong VAT figures**, both bound for HMRC's form: cash accounting under-declared
    every CIS invoice for ever (£166.67 where £200 was charged, never picked up later), and
    a credit note against an invoice that was never paid reclaimed VAT that had never been
    accounted for. The existing suite had the second baked in as its expected answer, which
    is why it survived. Commit `a096e80`.
  - **A failed credit-note removal** left the invoice, the PDF and the email asking the
    customer for money that had been credited; **an emailed EUR document** became pounds
    when the rate lookup failed; **a reminder Resend refused** kept its claim and was never
    retried, including the final notice. Commit `2eb45b5`.
  - **A date that was never printed** silently became today's, unmarked; **"Save all ready"**
    ignored the VAT figure's confidence; **a slow rate lookup** landed on whichever receipt
    was open when it finished; **the tax headline** annualised from as little as one day
    (£2,316 to set aside on a £5,000 invoice whose real tax is nil). Commit `8b8ff0c`.
  - **migration-032 (written, NOT applied)**: merging two contacts could never move a quote
    request — the owner is granted update on two columns of `quote_request_suppliers` and
    Postgres refuses the statement whether or not a row matches — so every merge reported
    rows left behind. The merge now looks before it writes, so the false alarm stops
    meanwhile.
  - **`feature/quote-vat-snapshot` (migration-033, NOT applied, not merged)**: a quote has
    no VAT snapshot, so crossing the threshold re-prices quotes already sent — on the
    customer's own link and on the button they tap to accept.
  - Refuted and left alone: two scanning claims about currency handling.

- **The harness is in the repo now** (`harness/`, commit `221d9c4`). 179 files — 46 suites,
  895 checks, the mock PostgREST, the fake camera, the runner, the tsconfig that recompiles
  the app's own logic — had been living only in a session scratchpad, which is wiped without
  warning. Source only, 1.6MB; Chrome profiles, `gen/` and the ~770MB of synthetic clips are
  gitignored and `gen-*.py` regenerates the clips. `harness/README.md` explains it.
- **Four security headers the live site was missing** (commit `54d1314`), found by reading
  production's own headers rather than the code: HSTS and the private no-store on /i/ were
  there, but nothing stopped the app being framed — and on an invoice page "Mark as paid"
  and "Remove" are taps worth stealing. X-Frame-Options, `frame-ancestors 'self'`,
  Referrer-Policy and nosniff now set; deliberately **no** Permissions-Policy, because the
  scanner needs the camera and a wrong value there breaks it silently. Verified live after
  the deploy, with the OpenCV immutable cache rule (the scanner's engine) still intact.
- **Full regression: 46 suites, 895 checks, no failures**, in four minutes. Eight suites are new today (empty account, numbering, half-saved,
  keyboards, long values, no accidents, public links, labels, one total, round trip,
  currency, dark mode, route guards, RLS audit, one-handed).
- **SIX BACKUP TABLES HAVE NO ROW LEVEL SECURITY — migration-031 written, NOT applied.**
  An audit of all 41 tables this project creates: `clients_backup_20260914`,
  `receipts_backup_20260914`, `invoices_backup_20260914` and their `_2` twins were taken
  with `create table ... as table ...` and nothing after it. Supabase grants anon and
  authenticated everything on a new public table by default, so with RLS off any signed-in
  account could read all six — a copy of the clients, receipts and invoices of 14 September.
  Every backup from 003 onwards enables RLS, and every live table has RLS and an owner
  policy, so only these six were left open. `migration-031-lock-down-early-backups.sql`
  switches RLS on and revokes the grants; it creates nothing, changes no row and deletes
  nothing, so it needs no backup file, and it is safe to run twice. **Atanas runs it** (the
  verification query is at the foot of the file). `test-rls-audit.mjs` 5/5 fails if a table
  is ever added without RLS again. Commit `8ef561f`.
- **Every server route, called the way a stranger would** (checklist 35):
  `test-route-guards.mjs` 35/35 over all eighteen. One real fix: `/api/send-invoice`
  checked whether email was configured before checking who was asking, so a stranger could
  tell a deployment with email on from one without. Commit `8f338ff`.

- **The timer, part two: a stuck run was blocking every later one.** The manual run I
  started at 09:13 to test it was still sitting on its first command (`git fetch`) four
  hours later, waiting for a tool approval nobody was there to give — and while a run is
  in progress the scheduler refuses to start another, so the :10 and :40 slots had been
  quietly skipped all morning. That run is now stopped, so the schedule can fire again.
  It will still stop on the approval prompt each time, but it will *start*, which means
  there is a prompt sitting in the app waiting for one tap. Once that tap happens the
  routine runs on its own. **This is the thing to do tonight**, and the stuck-run trap is
  worth remembering: after granting the permission, check `list_task_runs` for a run stuck
  with no recent activity and stop it, or the schedule stays blocked.

- **The 30-minute timer never fired, and now we know why.** Not sleep — he confirmed the Mac
  was awake and online all night, and the other routines on the machine did run this morning
  (email watch 10:08, the two keep-alives 09:50/09:52). `invoicer-keep-working` had 0 runs;
  its 08:39 and 09:09 slots were skipped with nothing recorded. Triggered by hand it starts
  in seconds and then stops dead on its very first command (`git fetch`) waiting for
  permission — no git process ever runs. The routine was created programmatically, so it has
  no tool approvals, and an unattended run has nobody to tap Allow. Moved to :10 and :40
  (clear of the other routines), completion notifications on, and the task file now tells
  each run to set itself five jobs of its own — things needing nothing from him — and append
  them to the checklist under "Found on the day". **Waiting on Atanas:** approve the routine
  once in the app, or say the word and its permission mode gets set so it never asks.
- **iCloud duplicates broke the build.** `.next` had 181 stray `name 2.ext` copies (the
  known iCloud Desktop habit); Turbopack refused to open its cache over `CURRENT 2` and tsc
  reported conflicts from `routes.d 2.ts`. Nothing deleted — they were moved out to the
  scratchpad (`scratchpad/icloud-dupes/`, same paths) and the build went clean. Three more
  sit in the source tree (`UploadFilesButton 2.tsx`, `supplierLinks 2.ts`,
  `013-backup-before-migration-027 2.sql`); all three are byte-identical to their originals
  and `.gitignore` already has `* 2.*`, so they are ignored, not lost. Flagged, not removed.

## 2026-09-20 — Settings' account section, one Add button, the camera asks once (`feature/settings-add`)

**Brief (via the lead session, from Atanas):** Settings should hold account information
(sign-in help and the usual), company name and business name kept apart, and the address
labelled business or personal depending on what the app is for; "add a receipt" and "add an
invoice" should be one button that asks which, with the scanner recognising the type
itself; and allowing the camera once should be enough for every camera in the app.

**Done (branch `feature/settings-add`, not merged; migration-029 NOT applied — Atanas runs it):**

- **Settings** opens with a Your account card: the signed-in email, "Email me a sign-in
  link" (Supabase's recovery mail — it signs the browser in and lets him set a password),
  where the data lives (Supabase, EU/Ireland, private bucket, 7-day signed links, shared
  invoice links the one exception), the JSON export moved up here, and how to ask for the
  account to be closed (no delete button anywhere, by design).
- **Names kept apart**: `business_name` stays the trading name and the headline;
  `registered_name` + `company_number` are new and print small in the invoice footer
  ("Registered name: X. Company number: Y.") — on screen, in print, in the PDF and on the
  /i/ link, since `IssuedInvoice` is all four. Only shown when both are set, so nothing
  changes for a sole trader. The registered-name box uses the Companies House lookup and
  fills the number from the pick.
- **Account kind** (`account_kind`: limited / sole_trader / personal, null = not said):
  today it only decides "Business address" vs "Your address" (and "Business name" vs "Your
  name"), and whether the registered-company block shows. The wider "the app adapts" idea
  stays parked in `notes/future-ideas.md`.
- **migration-029** (+ backup 014) adds those three nullable columns to `business_profile`
  with a check constraint that allows null. The branch runs against today's database
  untouched: reads are `?? null`, and the save writes the three columns separately, so a
  PGRST204 ("no such column") retries without them and the page says what didn't save.
- **One Add button** (`AddAnything`): a sheet with Scan it ("a receipt, a supplier invoice
  or a credit note — the scanner works out which"), Upload a photo or PDF, Add a receipt by
  hand, Write an invoice, Write a quote. `ScanOrAdd` now renders it with the page's own scan
  and by-hand routes folded in (dropped when they'd repeat a standard row), so the invoices,
  receipts and clients lists get it without their files being touched. The dashboard's three
  "+ …" links are the one button; Scan tile, upload and "Add a client or company" stay.
- **Camera asks once** (`src/lib/camera.ts`): one `openCamera()` for the whole app — asks
  the Permissions API first, never calls getUserMedia when it says denied, remembers the
  answer for later screens (module state + a localStorage flag, since Safari has no
  Permissions API for the camera), and reports whether the browser had to ask. The denied
  screen keeps the iPhone tip and now offers the iPhone camera, which needs no permission at
  all. The Add sheet warns before he taps Scan if the camera is blocked.
- Tests: `test-settings-add.mjs` 36/36 (mocked DB and a canvas camera, including a database
  with the new columns absent). Re-ran on 3308: fit sweep 26/26 (my copy of the updated
  one — /mileage, /vat, /check-company aren't on this branch and 404), clear 22/22,
  camera-tip 2/2, tips 6/7. The tips miss is the machine, not the code: getUserMedia took
  3985 ms under load 7.8, and "asked?" is still decided by that timing (Chrome's fake camera
  reports the permission as granted, so the API can't decide it here).
- `npx tsc --noEmit`, `npx eslint .` clean; `npx next build --webpack` clean (Turbopack
  can't follow a worktree's symlinked `node_modules`).

**Open:** migration-029 to run and verify; whether a "granted" Permissions API answer should
suppress the "asked every time" tip outright (it would fail `test-camera-tip`, which fakes a
slow prompt in a browser that reports granted); the lead's one-line wiring is not needed —
the list pages pick the new button up through `ScanOrAdd`.
## 2026-09-20 — Pick a company from anywhere, check it against the register (`feature/company-picker`)

**Brief (via the lead session, from Atanas):** the new-invoice form only lets him choose a
saved company; it should be free text tied to the Companies House register, with an arrow
on the right for his saved ones, most used first then alphabetical. Everything with a
company name or address should have the register. Scanners should fill in what the
register holds and the document doesn't, and every company should be checked.

**Done so far (branch `feature/company-picker`, no schema change):**

- `ContactField` (new): one customer/supplier field. Free text with a ▾ on the right that
  is a real `<select>` (so a phone opens its own picker) holding the saved contacts, most
  used first under "Most used", then "A–Z". Typing filters the saved ones and, with a key,
  searches Companies House under "On the register". A register pick opens a card with the
  registered name, company number and registered office and only saves it on "Add as
  client/supplier" — nothing is ever created by typing.
- Used on New invoice (customer), New receipt (supplier) and the scan review (supplier).
  The new client/supplier form keeps `CompanyNameInput`, which now shares the same rows.
- `/api/company-search` also answers `number=` (a company's profile, the only place the
  register publishes a status) and `scope=all` (dissolved companies included, for checking
  a name already on a document). Same auth, same limits, same per-instance cache.
- Scan review: the registered address (only when none was read) and the company number are
  filled in from the register, marked, and undoable. A dissolved or liquidated company, or
  a Ltd name with nothing on the register, says so plainly wherever the name is shown.
- Without `COMPANIES_HOUSE_API_KEY` nothing mentions the register: no register rows, no
  notes, no gap-fill, and no lookups at all. The field is then a searchable picker over
  his saved contacts, most used first.
- A name is only checked against the register once it is committed (a picked contact, or
  the printed name on a scan), not on every keystroke; the typeahead only searches while
  the list is open. So one call per pause, not two.
- The company number has nowhere to live on `clients` without a migration, and the brief
  ruled schema changes out: it is kept on the device against the saved row
  (`company-register` in localStorage, `src/lib/companyRegister.ts`) so a later check asks
  for that exact company, and falls back to a name search on a phone that has never seen
  it. A one-line migration-029 adding `clients.company_number` would make it proper.
- Main gained `/api/company-check` and a Check-a-company page while this branch was out
  (the fuller report). No file overlaps: merging this branch touches only SESSIONS.md.
  `/api/company-search` now reads the same `COMPANIES_HOUSE_API_BASE` override so both
  talk to the same register. Worth deciding later whether the quiet per-field check should
  read the report route instead of its own `number=`.
- A page added to a scanned document re-reads it, which replaces the details: the register
  is asked again so its fill comes back with them (and the note never outlives it), while
  an Undo he made still stands.
- Tests (dev server on 3306, mocked DB): new `test-company-picker.mjs` 39/39.
  Regressions: review-fixes 21/21, clear 22/22, multi-docs 33/33, uploads 15/15,
  fit-sweep 26/26. The older `test-company.mjs` is 7/8 then errors, the same as on main
  before this branch: it still expects the Free page's old address textarea, which the
  address rework replaced. tsc, eslint, build clean.

## 2026-09-19 — Several documents in one scan, Save all ready (`feature/multi-docs`)

**Brief (via the lead session, from Atanas):** a scan should find every document on it,
even from different suppliers, and let him check them one by one or "upload all" when it's
a straight job; a document that shows it's been paid should be recognised as paid.

**Done (branch `feature/multi-docs`, not merged; no schema change):**

- Extraction returns `documents[]` with `pages`, `box`, `paidOnDocument`; one document is
  the default. `/api/scan` keeps `result` (= first document) for invoices/new. Gemini
  schema conversion now puts an array's `items` on the non-null branch (identical output
  for every existing schema, checked).
- `/scan` splits a capture/file holding N documents into N walk entries: photos cropped by
  box (+3%) with the whole photo as page 2, PDFs cut with pdf-lib (new dependency, MIT),
  whole PDF plus a note if that fails. "This file had 3 documents — they're listed
  separately." Parts are never read again.
- "Save all ready" beside Save: one save path (`prepareSave`) for both; waits for reads
  still running; leaves anything unread, not a receipt/invoice/credit note, without a sure
  total or date, with a date to confirm, a bill without a due date, a currency whose rate
  can't be fetched, or a possible duplicate (earlier saves in the run count). Summary
  "Saved 5. 2 need a look: …", each left one says why; all saved shows an "All saved" page.
- `paidOnDocument` presets Already paid / To be paid unless he touched it.
- Inbox import: one needs-review row per document (PDF cut per document where it can be).
- Real Gemini on synthetic documents: every split decision right, boxes IoU 0.97–0.99,
  timings the same as the old one-document read (4–7 s).
- "Save all ready" sits beside Save, not at the top: the older suites press the first
  enabled "Save…" button, and Save should stay the first thing for the open document.
- Independent review (one agent, read-only): 4 findings, all fixed in 04a3fc9 (a page
  added to a cropped part re-read the whole photo and merged the other receipts in;
  re-reads queued behind the batch; a stale "Needs a look"; inbox cropped unshared
  pages). Also: pages joined in the stack review stay one document; conformToSchema
  parses a nested array sent as JSON text.
- Merged current main into the branch (clear-form buttons, scanner torch, quotes redesign,
  invoice-page fix); only SESSIONS.md conflicted. Main's Quotes UX entry had taken the
  place of the overnight entry's heading; the heading is back.
- Tests on the merged branch (harness, mocked DB, dev server on 3304): `test-multi-docs.mjs`
  33/33, uploads 15/15, review-fixes 21/21, receipts list 74/74, bent 64/64, far-v2 34/35.
  tsc, eslint, build clean. The far-v2 miss is main's new torch: on the dark clip the
  scanner now says "It's dark here — more light helps", and that suite's dark check still
  expects no hint at all — the expectation needs updating, nothing in the scanner is wrong
  (earlier bent failures at load 15-30 all passed once the machine was quiet).

**Open:** try it on the iPhone with real paper; the Claude engine couldn't be run here
(no Anthropic key locally), so the first Claude read of the new schema is unverified.

## 2026-09-20 — Overnight, Atanas asleep (Mac desktop app, Opus 5)

**Live now** (main, deployed): the scan/receipts/bent-paper release, Clear form buttons,
the scanner torch, the quotes redesign, wrapping invoice buttons, and the address rework.

- **Address entry rebuilt** after his report ("the two rectangles don't work together — the
  postcode deleted the upper one"): one block of fields (house and street, flat/area, town,
  postcode) with a single Find that searches by postcode, or by number and street with the
  town. A pick fills only what it carries, so a postcode pick keeps the street; the fields
  hold their own state, so half-typed text no longer jumps between them. Everywhere an
  address is typed: new client, client edit, Settings, the quote form's new customer, the
  Free page and the new quote-request form. `splitAddress`/`joinAddress` in
  `src/lib/addressLookup.ts` (9 unit cases), `test-address-fields.mjs` 18/18 against the
  real lookups.
- **Supplier quote requests merged** (agent, `feature/quote-requests`): ask suppliers for
  prices by email with a private `/r/<token>` page, gather the replies per request, compare
  per item with delivery counted once per supplier, best single supplier vs best split, and
  a per-supplier order list. Migration-028 (two new tables, no backup needed) **applied and
  verified in his Supabase**: keys/triggers/RLS/policies/column grants/function grants all
  as designed, `quote_request_clean_prices` exercised, and a rolled-back run as
  `authenticated` proved: another account's client refused (23503), direct answer update
  refused (42501), delete refused (42501), only real item ids kept, stale answer refused
  (40001), the list locked once sent (55000). Nothing left behind; his own rows untouched.
- **Several documents in one scan merged** (agent, `feature/multi-docs`): one photo or PDF
  holding several documents is split into separate documents (photo cropped to the model's
  box with the whole photo kept as page 2, PDFs cut with pdf-lib), "Save all ready" saves
  everything that needs nothing and leaves the rest with a reason, and an invoice that
  shows it's already paid comes in as paid. Real-Gemini checks on synthetic documents:
  splits correct in every case, boxes 0.97–0.99 IoU, no slower than before.
- Suites on merged main: fit sweep 22/22, review fixes 21/21, uploads 15/15, clear 22/22,
  quotes fixes 11/11, multi-docs 33/33, receipts 74/74, address 18/18, quote requests 82/82.
- **Notes for him**: `notes/future-ideas.md` (parked: bank feed, adapting the app to how
  it's used, company/business name apart, Settings account section, legitimacy report,
  beginners' guide, paywall) and `notes/solo-checklist.md` (50 things to check alone).
- A 30-minute scheduled task ("Invoicer — pick the work back up") now restarts the work by
  itself whenever this session is asleep; it exits quietly if another session is active.

**Overnight, after his list came in (all live on main)**

- **Find it cheaper** on every quote line and every compared item: searches built from the
  line's own words (price comparison and the merchants, or Checkatrade/MyBuilder/Rated
  People for work), a box for what he actually wants, and "What should this cost?" — a
  guide to the usual UK range ex VAT that flags a quote above or below it and names
  cheaper alternatives (`priceSearch.ts`, `priceGuide.ts`, `/api/price-guide`, Gemini,
  120/hour/user). Real-model check: plasterboard £9.50-13.50 a sheet, skimming a lounge
  £600-1,200, ~3s. 13/13.
- **Five surprises**, each tested: **mileage** at HMRC's rates (45p/25p with the 10,000
  threshold split mid-trip, 24p/20p, postcode-to-postcode road estimate, saved as an
  ordinary expense — 13/13); **statement of account** per customer (what's owed, ageing
  30/60/90, share/PDF/print/copy — 10/10); **VAT figures** for a quarter on both bases
  (boxes 1/4/5/6/7, drafts and unreviewed left out, lines openable, copy — 13/13);
  **merge two records for the same business** (name/email/phone, everything moves, the
  duplicate is archived not deleted, "they're different" remembered — 11/11); **nudge
  quiet quotes** (sent 5+ days, still open and in date, message ready to text — 8/8).
- Agents running on his other asks: the company register on every company field
  (`feature/company-picker`), the free "check a company" tool (`feature/check-company`),
  and Settings + one Add button + camera permission (`feature/settings-add`, with
  migration-029 for registered name/number and account kind — not applied yet).
- `notes/future-ideas.md` now also holds the next five surprises to build.
- Full pass on merged main, everything green: fit sweep 26/26, company picker 39/39,
  company number on the row 5/5, settings/add/camera 36/36, check a company 52/52, review
  fixes 21/21, uploads 15/15, multi-docs 33/33, clear 22/22, quotes fixes 11/11, receipts
  74/74, address 18/18, price finder 13/13, mileage 13/13, statement 10/10, VAT 13/13,
  merge 11/11, quote chase 8/8, CIS 14/14, delight 8/8, texts 12/12, tips 7/7, share 3/3,
  far 35/35, bent 64/64, camera tip 3/3. Two stale expectations were corrected (the dark
  clip may now show the torch hint; the texts suite follows the new Send card) and the
  camera-tip flake was fixed at the source: the how-to-allow tip no longer appears when
  the browser says the camera is already granted.
- **Then, alone, from the checklist:** every page fits 320px as well as 375 and 430 (the
  expense totals stack, the document tables scroll in their own box); a busy account (500
  invoices, 2000 receipts, 300 contacts) opens and filters in about a second, and the
  dashboard's owed matches the invoices to the penny; one money formatter everywhere, so
  £4,477.50 reads the same on every screen (the sweep briefly dropped the pound sign on
  the invoice page — the suites caught it); dependencies checked (no advisories); the tax
  suite no longer hard-codes a figure that drifts daily; every suite now honours BASE.
- Final tally, all green: fit sweep 26 (×3 widths), company picker 39, company number 5,
  settings/add/camera 36, check a company 52, review fixes 21, uploads 15, multi-docs 33,
  clear 22, quotes fixes 11, receipts 74, address 18, price finder 13, mileage 13,
  statement 10, VAT 13, merge 11, quote chase 8, CIS 14, delight 8, texts 12, tips 7,
  share 3, camera tip 3, lines 7, payments 13, tax 5, VAT snapshot 4, quotes 34, deposits
  17, Free quote 12, busy account 9.
- **The register on every contact field** merged (agent, `feature/company-picker`): free
  text with a ▾ that opens the saved contacts (most used first, then A-Z), typing searches
  saved contacts and then Companies House, and picking a register company offers to add it
  with its registered name, number and office — nothing is saved without a tap. The scan
  review fills a missing address and the company number from the register, marked and
  undoable, and anywhere a company's name shows, a dissolved or liquidated company says so.
  All of it invisible without the key. 39/39. Follow-up by me: **migration-030** (+ backup
  015, applied and verified) puts `clients.company_number` on the row instead of the
  device, so every phone checks the right company (5/5).
- **Settings, one Add button and the camera** merged (agent, `feature/settings-add`,
  migration-029 + backup 014 applied and verified): an account card (email, sign-in link,
  where the data lives, export, how to close it, sign out), registered company name and
  number kept apart from the trading name and printed small in the invoice footer when
  both are set, account kind labelling the address, one "+ Add" sheet (scan, upload, by
  hand, invoice, quote) with the direct Upload from files button kept beside it, and one
  camera permission path for every scanner with the iPhone instructions when it's blocked.
  36/36. What iOS actually allows is written up in the agent's notes.
- **Check a company** merged and live (agent, `feature/check-company`): a public page at
  `/check-company` that searches the register and reports status, age, registered office
  (including formation-agent addresses and dispute flags), what it does in plain English,
  previous names, accounts and confirmation statement with overdue called out, officers
  and any disqualification, who controls it, charges and insolvency — with a factual
  one-line summary, copy/share, and prepared web and social searches (never scraped).
  Inert and self-explaining until `COMPANIES_HOUSE_API_KEY` is set; caches and rate limits
  in place; 52/52 against a stand-in register.

## 2026-09-19 — Quotes UX (agent in a worktree), branch `feature/quotes-ux`

**Brief (Atanas, from his phone):** quotes should look better, pick the recipient from all
clients or suppliers, work for a company or a private person, and be sendable every way;
payment options come later. No schema change; not merged to main.

- Picker: anyone in Clients & suppliers (clients first, grouped, search from 7 people),
  shown as a card (company + VAT / private, contact details) once picked. `client_id`
  unchanged. A quote to a supplier can be invoiced; the draft invoice's picker and the
  Invoices filter now show that supplier.
- New customer inline on the quote form: Company (Companies House lookup, contact, VAT
  number) or Private person (name), both with email, mobile and the address finder; saved
  as a `clients` row (kind client, `is_company` set). Empty account goes straight to it.
- Quote document: a company shows "Attn: <contact>" and its VAT number; a private person
  never does (the /q/ page reads contact_person for this). Quote emails greet the person.
- Quote page: summary card (who, total, deposit, valid until), status card with the next
  step first, one Send card with Email / Text / WhatsApp / PDF tabs and the view-and-accept
  link. Text/WhatsApp use the new "Here's your quote" preset; the link goes in only when
  tapped, and from a draft that asks and marks it sent, as copying the link does.
  SendInvoicePanel split into `useDocumentPdf`, `EmailForm`, `ShareButtons` (its own output
  unchanged). List rows show badge, total, deposit and valid until.
- Tests (mocked DB, dev server on 3300): quotes 34/34, deposits 17/17 (both with the
  client picked in the new picker; the old "no suppliers offered" check now expects them),
  new quotes-ux 48/48, Free-page quote import 10/10, texts 12/12 (quote half now drives
  the Send card's tabs), and against the local Supabase stand-in: quote links 18/18,
  invoice links 18/18, customer's /q/ page for a company and a private person 3/3.
  tsc, eslint, build clean (build needs a temporary `turbopack.root` in a worktree with
  symlinked node_modules; not committed).
- Left for Atanas: try it on the iPhone (tabs, Messages/WhatsApp hand-off, the inline
  form with the keyboard up). Payment options have a marked place above the Send card
  (a comment, no UI). CLAUDE.md's quotes bullet could gain "putting the link in a text
  marks a draft sent too" when this merges.

## 2026-09-19 — Mac desktop app (Opus 5), overnight run

**Brief from Atanas (19/09, evening)**

- Scanner must read messy and handwritten documents (e.g. his brother's rough Excel invoice).
- Free page template-from-scan: keep what stays the same, next invoice number, today's date
  (editable), not a copy of the scanned invoice.
- Batch scanning: camera stays open, each capture drops into a stack, review, accept, read all.
  Template scan stays single-shot. Green fill over the document when locked on.
- Invoices / Receipts / Clients-Suppliers: camera button first, "+ Add manually" under it;
  empty-state text only when empty; remove "Show archived" from Clients/Suppliers; scan any
  document to fill a client or supplier.
- Free page: signature (draw or upload), send the invoice by email from the preview.

**Progress**

- Health check: `tsc`, `eslint`, `npm run build` clean on `main` at b70d091; live site loads;
  Atanas signed in to the app in the browser pane. `test-docs/` (gitignored) created for real
  test documents.
- Shipped to main (24b3373, 5646bfd, 8138fca): scanned template becomes the next invoice
  (number +1, today's date, Next invoice button); both extractors told to read rough and
  handwritten documents; batch scanner (stack, review, join pages, read 3 at a time, Save and
  next / Skip) with green lock-on fill; camera-first buttons on Invoices, Receipts, Clients;
  scan-to-fill for clients/suppliers via new `/api/contact-scan`; Show archived removed.
  Batch capture and review tested locally against a fake camera stream; live tests next.
- Found and fixed a pre-existing bug: every Claude read (the app's default engine) was failing,
  first on an enum the API rejects, then on strict mode's 16-nullable-field limit (scan schema has
  29). Claude now runs non-strict with the result conformed to the schema (a909165, 88adc98,
  4d81744); an interim "" workaround made Opus 5 leak tool syntax into empty fields, so it was
  dropped. Scan routes allow 300s. Live check on a synthetic handwritten invoice: Claude and
  Gemini both read vendor, number, date, total, lines and bank details correctly.
- Signature on the free invoice: draw or photo, remembered on the device (5b63563).
- Email sending: built on `wip/email-send`, merged to main (b9952b2) after two review
  rounds. Preview has a Send by email box; the invoice goes as a browser-made A4 PDF (page
  breaks under rows) with a fixed, escaped HTML summary; signed-in only; copy to the
  account's own address. Inert until `RESEND_API_KEY` (+ `EMAIL_FROM` on a verified domain)
  is set in Vercel. Checked: PDF render, email HTML, not-configured and sign-in paths. Not
  checked: a real send, a multi-page PDF by eye (browser pane was hidden).
- Live end-to-end (synthetic camera, nothing saved): batch of 2 on /scan read correctly by
  Claude (handwritten + spreadsheet), Free-page template scan gave number 31, today's date,
  14-day terms. Found and fixed there: CIS wrongly switched on by separate labour/materials
  lines (909d9cc). Test draft removed from the live Free page afterwards.
- Review workflow (5 reviewers + 5 refuters): 16 of 24 findings confirmed and fixed
  (e8d6593, b4ef461); a second check of those fixes found 8 more, fixed (62e7680, b9952b2).
- CLAUDE.md and notes updated: Claude non-strict extraction and why, batch scanning, email
  rules and env vars, how to test without real documents.

- Email switched on with Atanas: Resend account, invoiceover.com verified (auto-configured
  in Cloudflare), sending-only key in Vercel as `RESEND_API_KEY`, redeployed. Test invoice
  TEST-001 sent from the live Free page to his account email: Delivered (Resend). Payment
  reminders are live too; no invoices in his account, so none went out.

- Autonomous stretch (Atanas away, "run and test as much as you can"):
  - Auto-zoom in the camera (14d56eb): zooms a far page toward filling the view (max 2x,
    never cropping it), back to 1x when the page leaves, off switch, manual zoom wins.
  - `research-apps-2.md` (b60a488): ten apps researched by five web-only agents, ranked.
  - Scan an invoice copies one already sent (customer match / add, lines with learned
    VAT, today's date, terms) and receipt save checks (duplicate warning, line-total
    check, usual category per supplier), built by agents in worktrees, merged after fixes.
  - First-time tips (0c828e1): three showings each or until Got it.
  - Share by WhatsApp/text + Download PDF on the Free page (9bd5faf).
  - Three review rounds on this stretch (reviewer + refuter per area): 3+1+10+3 findings
    confirmed and fixed, incl. a pre-existing bug: decimals couldn't be typed in invoice
    Qty/Unit price.
  - Test harness: headless Chrome (fresh profile in the scratchpad, never Atanas's) with
    Chrome's fake camera playing generated MJPEG clips; runs auto-zoom (9/10, the 10th is a
    wrong expectation), tips (7/7) and share (3/3) tests against the local dev server.
    Authenticated pages can't be driven there (no login), so /scan and /invoices/new were
    checked by review, not clicks.

  - Describe an invoice in words on New invoice (4a2401b, f8ca233): customer, lines, VAT
    treatment, currency and terms from typed or dictated text; unsaid VAT defaults to
    standard (a pre-release check caught it defaulting to 0%).
  - Payment reminders now come from the business name, reply to the owner, show readable
    dates/amounts and bank details, skip part-paid and fully credited invoices, and claim
    their slot before sending (2b82865, 535da72).
  - Branch `feature/client-phone-and-shared-limit` (not merged): clients.phone and a
    database-backed rate limit for the free scanner; SQL in web/supabase/009 + 018 for
    Atanas to run; reviewed, nothing confirmed against it.
  - Accuracy pass 1 on five synthetic documents: both engines right on every key field
    (details in notes).
  - Leftover git worktrees under .claude/worktrees (all merged and pushed) can be removed
    with `git worktree remove`; left in place under the never-delete rule.
  - Invoice page (/invoices/[id]): the text-only WhatsApp/mailto links are replaced by the
    shared Send it panel (SendInvoicePanel): email with the issued invoice as PDF, share
    sheet, download. The invoice card is one IssuedInvoice component for screen, print and
    PDF; dates read "19 September 2026"; a paid invoice emails as "£X, paid" without bank
    details (5d9cc9e, a7e6346).
  - Whole-day review (4 lenses + refuters) then two follow-up checks: 13 + 12 findings
    confirmed and fixed (b4c6d81, a7e6346); final check clean. Main ones:
    conformToSchema now enforces types for every engine (a rough scan could give £NaN or
    get the Free draft deleted); Send by email replies only to the account's own confirmed
    address, needs a confirmed email, 100/day, logs without PII; scan/contact routes rate
    limited; Describe it keeps a chosen customer/date/terms/lines; negative quantities kept;
    off-list currencies kept; archived client offered back only on an exact name; import
    warnings for numbered / CIS / VAT-mismatch Free invoices.
  - Live after deploy: headless share 3/3, tips 7/7, auto-zoom 9/10 (known edge-case
    expectation); /invoices/new renders with Describe it for the signed-in account.

- Atanas away for three days, steering from his phone; charger connected. With his
  standing permission, backup 009 + migration-018 run in his Chrome's Supabase SQL editor
  and verified (backup 0/0 both ways, RLS; column, RLS, grants; function exercised in a
  rolled-back block). Branch merged (338a286). Live: the free scanner's limit now counts in
  rate_limit_hits (hashed keys), and /clients/new has a Phone field.

- Receipt photos to storage (4349606): migration-019 applied and verified (SQL, rolled
  back) and live (own-folder upload 200, other folder 403, signed read, public refused);
  code reviewed twice (3 fixes: export can't silently drop photos, unsigned photos stay
  references, 7-day links for the iPhone home-screen app).

- Quotes, live (merged 457fe8e; migration-020 applied and verified):
  /quotes list, new, and a quote page with print, Send it (email as Quote-Q-0001.pdf with
  "valid until" wording and no bank details, share, download), Mark as sent / Accepted /
  Declined / Reopen, and Turn into invoice (claims the quote so a double tap can't make two
  invoices, makes a draft invoice tagged "from Q-0001" with the client's terms, links it).
  Drafts are editable, sent quotes aren't. migration-020 is a new table only: RLS owner
  policy, no delete grant, a trigger so a quote can only point at its own client/invoice
  (FK checks bypass RLS), invoice link SET NULL so removing that draft invoice frees the
  quote. Review (3 reviewers + refuters) confirmed 10, all fixed, incl. the PDF able to
  cut through the total at a page break and a lost network reply allowing a second
  invoice; a re-check found 4 smaller gaps, fixed. Signed-in click-through with a mocked
  database: 34/34. SQL (rolled back): owner-only, cross-account refused, no deletes. Live:
  /quotes and /quotes/new load for Atanas's account (no data created).
- iCloud had made " 2" copies of 31 generated files in web/.next (broke tsc); moved to the
  session scratchpad, not deleted.
- Company lookup (asked for by Atanas from his phone), branch `feature/company-lookup`:
  typing a company name on the Free page (business and customer), new/edit client and
  Settings offers matches from the Companies House register; picking fills name,
  registered address and (Free page) company number. Free API, 600 requests / 5 min per
  key; route caches 10 min, 60 per visitor, anonymous 120 and signed-in 180 per 5 min.
  Off (plain inputs, no mention) until `COMPANIES_HOUSE_API_KEY` is in Vercel. Review: 8
  small findings, all fixed (initials/IT/Co tidying, a pick no longer overwrites an
  existing address but offers the registered office, split limits, plain input when off).
  Route 7/7, UI 22/22 with a stubbed register. Merged (6bbb3ce); live route answers
  configured:false and Settings renders a plain name input. His Chrome has the Companies House Developer Hub
  open (cookies: analytics rejected) at "Sign in / Register".
- Firmer reminders (research #6), branch `feature/firmer-reminders`: reminders now at -3,
  0, +7, +14 ('late') and +30 ('final notice') days, each editable, `{{pay_by}}` a week
  out; optional switch to state statutory late-payment interest + £40/£70/£100
  compensation in the final notice, business clients only (the Act doesn't cover
  consumers). Invoice page shows which reminders went out and the next one, or why none
  will. Review: no blockers; fixed a missed cron day losing a reminder (3-day catch-up),
  customers from New invoice marked Company only with a company suffix, interest wording
  ("may be entitled", from the day after the due date), restore steps without deletes.
  Tests: unit 19, cron against a stubbed DB 6/6, invoice card 5/5. Backup 010 verified
  (0/0 both ways), migration-021 applied and verified (columns, one kind check, rolled-back
  behaviour). Merged (4057539). Atanas has no invoices, so nothing is due a final notice.
- Bug fixed on main (7590517): the draft-invoice editor and recurring invoices still parsed
  Qty/Unit price per keystroke ("12.5" became 125, "-" became 0); both now use
  NumberInput, and all three line editors stack on a phone. Typed-in check 7/7.
- iCloud made " 2" copies of generated files in web/.next twice (broke tsc); moved to the
  session scratchpad each time, not deleted.
- Quote deposits (rest of research #7), branch `feature/quote-deposits`: deposit as % or
  £ on a quote, printed on it; accepted → "Invoice the deposit" (draft, due in 7 days,
  split by VAT rate, tag `deposit for Q-...`, claimed/recovered like the final invoice);
  "Invoice the balance" = quote lines + the deposit invoice's lines negated, refused
  while the deposit invoice is still a draft. Negative line amounts print as −£.
  Assumptions to confirm with Atanas: deposit due in 7 days; deposit only once
  accepted. Review: no blockers; fixed a credited deposit still being deducted, a warning
  before declining with an open deposit invoice (its reminders keep going), 1p rounding
  (4-decimal lines), negative-balance guard, two-tab link warning, and New invoice no
  longer suggesting a "Less deposit" line. Unit 13/13, click-through 17/17. Backup 011
  verified 0/0; migration-022 applied and verified (rolled back); merged (66cb528).
- Payments against invoices (open item), branch `feature/payments`: invoice_payments
  (migration-023, new table, no backup needed); status follows payments; invoice/PDF list
  payments and show the balance; Mark as paid records the balance; reminders chase the
  balance of part-paid invoices (skip legacy part-paid with no payments); dashboard,
  list, CSV and export use it. Review: no blockers, 8 fixed (credit notes now set the
  status too, legacy part-paid "Mark as paid" doesn't invent a payment, fresh reads and
  double-tap guard, overpayment/date checks, penny rounding, reminder wording "£X to
  pay"). Unit 10/10, click-through 13/13, reminder job 8/8. Migration-023 applied and
  verified (rolled back); merged (3508bb9); full build clean.
- Whole-day cross-feature review (4 lenses + refuters, 8 agents): 5 distinct confirmed,
  fixed on main (c48e3ae): penny-exact totals in computeInvoiceTotals (Total and Amount
  due could differ by 1p on 5% VAT), removing a credit note now undoes the paid status it
  set, Mark as paid works on a £0 balance, no status rewrite on page open, Settings text.
  All suites re-run on main: 98 click-through checks. Open from it: invoice totals use
  the current VAT setting, not the one at issue (pre-existing) -> saving it per invoice.
- VAT setting saved per invoice, branch `feature/invoice-vat-snapshot`: invoices.
  vat_registered written by assign_invoice_number at issue (migration-024), backfilled
  for issued invoices, invoiceVat() used wherever an issued invoice is totalled. Mocked
  check 4/4 (issued-before-registration shows no VAT everywhere). Backup 012 (invoices)
  verified 0/0 (the table has no rows yet). Review: no defects. Migration-024 applied
  and verified (rolled back, next number untouched); merged (f65e123).
- Tax branch brought up to date with main (merged, uses each invoice's VAT setting);
  still unmerged for Atanas. invoiceVat treats a missing flag as unknown (ec2613a).
- Inbox import stores documents in the photo bucket too (6daf2a7). The live DB has no
  receipts, clients, invoices or quotes yet, so nothing to move.
- "View online" invoice links (research #5), branch `feature/invoice-links`: private
  /i/<43-char token> page (invoice_links, migration-025, new table), server-rendered with
  the service role, shows only what the PDF shows, noindex/no-referrer, soft 404 for
  unknown/draft (Next 16 streams, so status stays 200 with noindex, as documented).
  Opened is reported by the page's script (link scanners don't count), once per visitor
  per half hour, not from the owner's signed-in browser; first open pushes the owner.
  Email gets a "View invoice online" button (route accepts only this app's /i/ links).
  Security review: no leak or auth hole; fixed the owner's own email copy counting as the
  customer (#o), exact 43-char tokens + per-visitor limit first, atomic counting in SQL,
  blocked-storage crash, credit notes scoped by owner; added "Stop this link" and a
  column-level insert grant. End to end 18/18. Migration-025 applied and verified
  (rolled back); merged (54a4e35); live: unknown links show not-found with noindex.
- From Atanas on his phone, fixed on main:
  - Pinch on the camera zoomed the whole page (58aa368): the camera screen now claims its
    touches (touch-action none + Safari gesture events cancelled) and a pinch drives the
    lens zoom, or the cropped zoom up to 3x. Headless pinch 4/4; auto-zoom/tips unchanged.
  - Camera permission asked every time: a site can't make Safari remember it. The how-to
    (Settings > Safari > Camera > Allow, or aA > Website Settings) now shows as a tip
    whenever Safari had to ask (judged by the grant taking > 700ms), not once ever in grey.
  - Quotes on the Free page (f57ec09): Invoice | Quote switch, quote layout (valid until,
    no terms/bank/CIS), quote email/PDF wording, Save to account -> Quotes > New prefilled
    with add-customer. Headless 10/10.
- Accept a quote online (merged 803fcbd): /q/<token> with Accept/Decline (confirmed, name
  recorded), quote email "View and accept online", owner sees opens and "Accepted online
  by <name>", push on first open and on answer. Review fixes: reopened quotes can be
  answered again, emailing a draft no longer marks it sent before the send works, owner
  status changes check the status the page showed, DB hiccup says try again; owner's #o
  copy shows no buttons. End to end 18/18; quotes 34/34 and deposits 17/17 unchanged.
  Migration-026 applied and verified (rolled back). Live: checked in the browser pane
  (curl gets Vercel's security checkpoint, see notes).
- Noted, not changed: in the live DB invoices.user_id and clients.user_id have no
  cascade, so deleting a user with invoices/clients fails (checked on a throwaway user,
  rolled back). No in-app account deletion exists; protective as it is.
- "Tax so far" estimate on the home page, branch `feature/tax-estimate` (pushed, NOT
  merged, for Atanas to judge): income tax + Class 4 NI on this tax year's profit as if
  the year ended today, full-year projection, VAT owed if registered. Maths checked
  against known figures; dashboard checked with a mocked database; screenshot sent.
- From Atanas on his phone (19/09, later): "the camera doesn't recognise receipts from far, it
  zooms a bit, asks me to move closer when it should do it itself"; "add the address
  thing wherever you add an address, postcode or street and number, UK only"; "choose
  three or more things and surprise me, check other apps for ideas".
  - Research workflow (5 agents): scanner techniques + 8 ranked feature ideas (customer
    texts, CIS-aware tax pot, mileage, rebill materials, offline capture queue, app-icon
    badge + Monday push, a 'Paid!' moment, SA103 summary). WebKit source checked: iOS
    exposes lens zoom (0.5-10 on multi-lens phones, 1 = main lens) and, since 18.4,
    ImageCapture.takePhoto (asked-for size picks the smallest max photo size >= it).
  - Scanner, branch `feature/far-scan` (c5f758b): page candidates down to 1.2% of the
    frame when they look like paper (lighter than around, clear of the edge, aspect <= 8),
    torn/curled receipts via convex hull, zoom by the page's span up to 4x on the lens
    (2.5x crop), "Move closer" only when zoom can't help ("Hold still — zooming in",
    "Move the page to the middle" otherwise), and the shot is the camera's own ~12MP
    still (turned upright by matching thumbnails, page re-found in it, video frame as
    fallback). Headless with synthetic clips: far receipt 7/7, torn 2/2, shaky 1/1,
    off-centre 2/2, dark object ignored, still upright/sideways/noise/hang 10/10, lens
    zoom 3/4 (jumps to 4x in one step, fine), old auto-zoom 9/10 (edge page no longer
    zooms, correct), pinch 4/4, camera tip 2/2. Review workflow running.
  - Address finder, branch `feature/address-finder` (72b5f42): search box above every
    address field (Free page business/customer, clients new/edit, Settings). Free now:
    postcodes.io + OpenStreetMap (Photon); post town from the postcode (London districts,
    built-up area), 'just the postcode' partial that keeps a typed first line. With
    `IDEAL_POSTCODES_API_KEY`, signed-in users get Royal Mail PAF (paid per lookup, never
    for the anonymous Free page); tested with Ideal's public test key. Free page 12/12,
    signed-in forms 10/10. Review workflow running.
  - Scanner review (3 lenses + refuters): 12 confirmed, all fixed (e5d97d5): still used
    only if the page is re-found near the video's corners and as sharp; orientation from
    the decoder, a sideways still turned only with a clear margin; flash after the photo
    ("Hold still — taking the photo…"); Back/retry drops an in-flight capture; batch
    disarms at capture start (test fails on c5f758b, passes after); corners ordered by
    angle (45° receipts); white boxes on coloured bills rejected (edges around); no zoom
    mid-photo. Re-check workflow running.
  - Address review: 11 confirmed, fixed (7b9aa26): Royal Mail calls capped per account
    (20/5 min, 100/day) + charged-only backstop, free lookup when capped or Ideal fails;
    upstream errors not cached as "no matches"; Enter never submits the form; pending
    Royal Mail pick shown, latest form state used; "just the postcode" keeps typed lines as
    typed; street picks keep the typed house number and no stray postcode; council names
    not used as towns; 16px input on phones. Unit 22/22, pages 12/12 + 12/12.
  - Surprises, branch `feature/delight` (491299c): a "Paid" moment (tick, amount, customer,
    "£X in this month", haptic tick) when an invoice is marked paid in full; the home-screen
    icon badge = overdue invoices + recurring due + bills due in 3 days (dashboard, and the
    daily push carries it); "Text <customer>" on issued invoices, sent/accepted quotes and
    clients with a phone (On my way / Running late / I've arrived / Job done with the
    invoice link on request / Thanks for paying) via Messages or WhatsApp. Mocked
    click-through 7/7 + 12/12. Review running. Offline scan queue considered and left for
    later: it needs a caching service worker, too risky to ship untested on an iPhone.
  - Second reviews: delight (8 confirmed: honest Paid figure, taps pass through the card,
    UK number formats and extensions, 'Mrs Jones' greetings, current link after "Stop this
    link", credited-in-full not thanked, bad stored numbers correctable) fixed in 221b43b;
    address re-check (7: stale Enter pick, free fallback past the cap, daily overall cap,
    merge rules, towns by built-up area, new postcodes usable as typed) fixed in 447194b;
    scanner re-check (3: dead scanner after a mode switch mid-photo, borderline batch
    re-captures, corner order flipping at 45°) fixed in fc609b4 (mode-switch test fails
    before, passes after). Final check of those fixes: 3 more (a page straightened while
    tracked saved sideways; council names for towns with no built-up area; the text card
    resetting when the first link is made), fixed in 8e195da, 8333f86, a391a15.
  - Merged all three to main (1fdfe6c) after a trial branch: build/tsc/eslint clean; far
    35/35 (incl. straighten 2/2), batch 2/2, re-check 2/2, address 12/12 + 12/12, Paid 8/8,
    texts 12/12, quotes 34/34, deposits 17/17, payments 13/13 (the removal check raced the
    status write in the test; waits for it now), reminders 5/5, lines 7/7, company 22/22,
    VAT 4/4, Free quote 10/10, share 3/3, tips 7/7, invoice links 18/18, quote links 18/18.

- Tax estimate with CIS and Self Assessment dates (Atanas: "do it live with the CIS and the
  payment dates added"), merged to main (66c5fbc):
  - CIS on account invoices: `invoices.cis_rate` (migration-027, backup 013; applied and
    verified in his Chrome: backup 0/0 both ways, column + check, rolled-back exercise as
    authenticated, nothing left) and a labour/materials kind per line. The contractor keeps
    back the rate from labour; `invoiceCharge().due` is what's owed everywhere (balances,
    status, Mark as paid, reminders, dashboard, list, emails, PDF, online view). Credit
    notes are the value of the work and take their share off (`creditOffDue`); the CIS line
    shows CIS on what's still billed so the invoice adds up. Client rate remembered from
    their last invoice; Free-page imports and scanned copies keep CIS.
  - Tax card: share of the whole year's projected tax built up so far, less CIS kept back
    (refund message only when the year's CIS exceeds its tax); next Self Assessment date
    and what it's for; this year's bill date. Push 14 days before 31 Jan / 31 Jul.
  - Reviews: 7 + 2 confirmed and fixed (negative CIS from deposit lines, credit notes,
    mid-year refund message, scanned CIS lost on client pick, list/CSV, invoice not adding
    up after a credit, first-month rule). Unit 56/56, CIS click-through 14/14, reminders
    route with CIS, all older suites unchanged.
- Atanas's next list (19/09 evening, from his iPhone): link receipts to existing suppliers
  (never create unless told), date prompts on UK documents, overlapping date fields, slow
  reading, "Upload from files" under every camera button (several files), remove "Fit the
  page inside the corners", split several invoices in one scan, compact receipt cards,
  due filters, clear-form buttons, and a quotes overhaul (all contacts, company/private,
  send every way, request quotes from suppliers, compare suppliers' quotes by item).
- Scan, receipts and bent-paper bundle merged to main (via `integration/scan-receipts`):
  - Upload from files under every camera button (several at once to /scan, one on the
    client/invoice pages), read as a batch; the address carries `upload=1` so a lost
    hand-off says so instead of opening the camera, and unreadable files are counted.
  - Receipts never create a supplier by themselves; they link to one at read time
    (shown in the form) or at save only by exactly the same name. "No supplier" picked on
    purpose is kept in `details.noSupplier`.
  - No day/month question on GBP documents; date fields fit the iPhone column; /scan reads
    with Gemini by default (3.7s vs Claude's 9.6s on the same receipt, same result).
  - Receipts & bills list: compact cards with Details, To pay / Overdue / Due in 7 days /
    Paid and type filters, "To receive" on Invoices; link-to-supplier offer with a tick per
    row, strict whole-word matching, remembered skips.
  - Scanner: bent/curled paper (line-fitted corners, median smoothing, 2-tick grace), no
    "fit the page" nagging (first-time tip only).
  - Review (3 lenses, 18 agents): 10 confirmed and fixed (batch double capture of a curled
    page, stale crop on a tap during the grace, uploads lost when the lists failed, silent
    unreadable files, fuzzy save-time links, upload races, lost hand-off on a full load,
    link offer undoing "No supplier" and substring matches like Espresso Bar → Esso).
    Suites: review fixes 21/21, uploads 15/15, receipts 74/74, bent 64/64, far 35/35,
    batch 2/2, pinch 4/4, camera tip 2/2, delight 8/8, texts 12/12, CIS 14/14, payments
    13/13, quotes 34/34, deposits 17/17, address 12/12 + 12/12, tax 5/5, reminders 5/5,
    lines 7/7, VAT 4/4, Free quote 10/10, share 3/3, tips 7/7; auto-zoom 9/10 and lens 3/4
    as before (known expectations). iCloud's " 2" duplicates are gitignored now.
- Not live yet: Vercel refused the deploy of that merge (ddabd01) and of 678a192 with
  "Deployment rate limited — retry in 24 hours". Every feature-branch push had also made a
  preview deployment, and the day's work passed the Hobby plan's 100 deployments a day
  (148 GitHub deployment records in 24h). `web/vercel.json` now deploys only main
  (`git.deploymentEnabled`: `"**": false, "main": true`; `*` wouldn't match `feature/x`).
  The oldest deployment in the window was 23:30Z on 18/09, so the next push to main after
  about 23:30Z (00:30 BST) should deploy; check the commit status on GitHub after pushing.
- Companies House key: steps given; the Developer Hub and Vercel env pages left open in his
  Chrome for a helper. Lookup switches on once `COMPANIES_HOUSE_API_KEY` is set + redeployed.
- On branches, next to merge: `feature/clear-forms` (Clear form beside Save on client,
  supplier, invoice, receipt and both recurring forms; 21/21; also fixes the receipt item ✕
  that saved the form), `feature/quotes-ux` (agent: pick any client or supplier, new
  company/private customer inline, one Send card with email/text/WhatsApp/PDF; 48/48 new,
  older quote suites pass), `feature/torch` (torch button in the scanner, on by itself in
  low light unless switched by hand; 10/10). Review (3 lenses, 16 agents): 9 confirmed, all
  fixed: torch now on before auto-capture fires in the dark and works without OpenCV
  (12/12 + 3/3); recurring Clear form resets the category (22/22); quotes: no save over a
  half-added customer, the Free-page customer opens prefilled in the picker (no duplicate
  client), invoiced suppliers get the reminders switch and history, no draft /q/ link in
  shared text, draft invoice picker keeps its supplier, refresh race, Clear form on a new
  quote (fixes 11/11, quotes 34/34, deposits 17/17, Free quote 12/12, texts 12/12).
  Clear forms and torch merged to main (cba2153, 07a67e8). A 375px sweep of all 22
  signed-in pages found the issued invoice's buttons running off the screen; fixed on
  main (4e169a1). `feature/quotes-ux` merged to main (897c659) after quotes-ux 48/48 and
  the link suites against mock-server.mjs (quote links 18/18, invoice links 18/18, public
  company/private 3/3); build/tsc/eslint clean.
- Atanas's usage runs out tonight; background wake-ups at 00:33 (Vercel window), 00:43
  and 01:05 BST to carry on. If this session stopped: push main after 23:30Z to deploy,
  then the two agents' branches (multi-docs; quote-requests needs migration-028 applied).
- Agents started: `feature/multi-docs` (several documents in one photo or PDF split into
  separate documents, cropped/split; "Save all ready"; "already paid" read off the
  document, the assumption behind "receipt should be created in order to take payment"),
  `feature/quote-requests` (ask suppliers for prices by email with a private link, gather
  replies per request, compare per item with delivery counted, best single vs best split,
  order lists; migration-028 new tables only, to be applied and verified before merging).

**Open**

- Atanas: his brother's invoice into `test-docs/`; try batch scanner, green lock-on,
  signature pad and scan-to-fill on the iPhone.
- Session hygiene: this session started in another project's folder (MM INVOICES AUTO);
  nothing there was read or changed. Start the next Invoicer session in `Desktop/INVOICE`.

## 2026-09-19 — Supplier quote requests (agent in a worktree), branch `feature/quote-requests`

**Brief (Atanas, from his phone):** request quotes from companies by email, gather them
clearly separated, compare suppliers' prices, pick the better value per item and split
the order. Schema change: migration-028 (new tables only). Not merged; migration NOT
applied (Atanas applies and verifies it).

- migration-028: `quote_requests` (title, items jsonb with ids, notes, needed_by,
  site_address, open/closed, choice) and `quote_request_suppliers` (one row per supplier:
  token, sent_at, waiting/replied/declined, prices keyed by item id, delivery,
  vat_included, valid_until, note, source online/manual/scan, document_path, previous).
  Request FK is composite with user_id; supplier FK is RESTRICT + same-owner trigger
  (clients has no unique (id, user_id), adding one would alter clients). The owner has no
  update grant on answer columns: typed-in / scanned prices go through
  `record_quote_request_response` (security definer, checks the answer time the page
  showed, keeps the replaced answer in `previous`); the supplier's own answer through
  `submit_quote_request_response` (service role, once, open and not past needed-by).
- `src/lib/quoteCompare.ts`: per-line cheapest, supplier totals (ex VAT; VAT-inclusive
  prices converted at 20%), best single vs best split (every supplier set tried, delivery
  once per supplier used; split only when cheaper), expired offers never auto-picked,
  order text, scanned-line matching. Unit 20/20.
- UI (2cb5d5d): Quotes gets tabs My quotes / From suppliers (`QuotesTabs`, the only
  change to the existing quotes list). `/quotes/requests` lists requests with every
  supplier's status and ex-VAT total; `/quotes/requests/new`; `/quotes/requests/[id]`
  with suppliers (email, copy link, enter prices, attach and read their quote, can't
  quote, ask again, stop link), Compare (items x suppliers, cheapest labelled, tap a price
  to pick, "Use the best value" follows the recommendation again) and Orders (per
  supplier text: copy, email, share). Supplier page `/r/<token>` (AppShell treats /r/ as
  public). Routes: `/api/quote-requests/send` (signed in; reads as the owner, sends only to
  the saved address the page showed; shares send-invoice's limits) and
  `/api/quote-requests/respond` (public, 10/hour/IP, service-role function).
- Tests (dev server 3305, RESEND_API_KEY empty, Supabase mocked by
  `harness/qr-mock-server.mjs` + `qr-mockdb.mjs`, which mirror migration-028's grants,
  trigger and functions): `harness/test-quote-requests.mjs` 82/82, covering the request
  form, three per-supplier sends (recipient, subject, link and reply-to checked, nothing
  sent), the supplier page (prices, can't supply, VAT in and out, delivery, submit once,
  closed and expired), typed-in and scanned answers, the comparison in both directions
  (a split not worth its deliveries, then worth them), per-line overrides, order lists,
  and 375px on every page. The route's own guards were exercised against the running
  server (wrong address 409, signed out 401, another account 404, and 503 not-configured
  as the last stop before Resend, since the key is empty by design).
- Reviewed the SQL line by line against migrations 020, 025 and 026 (no Postgres here to
  run it): fixed from that review — prices are normalised in the database by one helper
  (`quote_request_clean_prices`) for both answer paths, `items` lost a default its own
  check refused, a copied supplier link is shown as well as copied (the clipboard can be
  refused), a past needed-by date is refused, and saving typed-in prices reloads before
  returning to the request.
- Merged `origin/main` (quotes UX, torch, clear forms) into the branch and re-ran
  everything against it: quote requests 82/82, quotes-ux 48/48, quotes 34/34, quote links
  18/18; tsc, eslint and build clean (build needs a temporary `turbopack.root`, not
  committed; iCloud's " 2" copies in .next were moved to the scratchpad again).
- For Atanas: migration-028 is NOT applied; nothing about this is live. Open questions in
  the report (supplier's VAT rate assumed 20% when they quote VAT-inclusive; a request
  expires for suppliers on its needed-by date; a supplier row can't be removed from a
  request, only left unsent).

## 2026-09-17 → 2026-09-18 — Mac desktop app (Fable 5.1), with Atanas mostly on his phone

**Shipped to main and live**

- Scanner rework (PR #6): scanned supplier invoices and credit notes as expense documents
  in `receipts` (migration-017 + backup 008, applied and verified live), multi-page up to
  20 with `receipt_pages` and an atomic RPC, day-first date parsing with confirmation for
  ambiguous dates, supplier matching with add-in-place, rebuilt result page in the
  brief's order, line items editable but not deletable, paid / to-be-paid with a
  three-day bill reminder on the dashboard and push cron, credit notes linked to their
  invoice with a CN badge, discard, location-based guessing removed, `/api/scan` now
  requires the user's bearer token, extraction moved to `claude-opus-5` with a strict
  schema. Sales invoices list nets its credit notes and shows a CN badge.
- Free invoice page (PR #7): public, no account, three monochrome A4 layouts (classic,
  modern, compact) with VAT and CIS support, print/PDF, "Save to your account" carrying
  the draft through sign-up. Template-from-scan via the public, rate-limited
  `/api/invoice-template`. Second extraction engine: Gemini via `@google/genai`; the
  Claude/Gemini switch appears only when signed in (anonymous callers get Gemini only).
- Gemini engine switched to `gemini-3.5-flash-lite` after 3.8 Flash was overloaded and
  slow; fail-fast on quota (429/503) instead of hanging; `thinking_level` is lowercase.
- Camera: one-tap capture from every scan button on iPhone (`CaptureButton`), in-app
  scanner default on iOS, auto-capture when the page is steady and sharp, no "Use this
  photo" step, corner-bracket alignment guide, OpenCV loader fixed (it had never loaded
  anywhere: the package exports a Promise and Turbopack's interop rejected it), then
  OpenCV moved out of the bundle to `public/vendor/` with an immutable cache header and a
  dashboard warm-up, Mats reused per tick, relaxed distance/hold gates, and a tap-to-show
  diagnostic readout on the capture screen.
- `scanner-research.md` (ten capture apps, patterns adopted, follow-up plan) and
  `CLAUDE.md` (rules, data model, architecture, open items).
- Working-across-devices setup: `CLAUDE.md` rules 8–9 (push after every step, keep this
  log as you go, pull at start, `wip/` branches for unfinished work), this log, and
  `notes/claude-notes.md` (the session's standing notes, published so any account or
  device has them). The Mac session also runs an automatic 33-minute checkpoint that
  updates the log and pushes.

**Decisions**

- Received invoices never go into the sales `invoices` table.
- Credit notes stored negative so existing sums net without change.
- App-wide wake lock kept on Atanas's request despite the battery cost.
- Anonymous scanning is Gemini-only; the rate limiter is per serverless instance (known
  gap, shared counter is the follow-up).
- Google AI Studio billing: Atanas linked a Cloud trial account, then activated Gemini
  billing with a £20 prepaid top-up (account `015649-CDA16A-FCF373`).

**Verified**

- Live DB before migration-017 was at migration-016 with all client FKs RESTRICT and an
  empty `receipts` table. Backup verified by content both ways; migration verified
  (columns, constraints, RLS, grants) and the RPC exercised as `authenticated` in a
  rolled-back transaction.
- Free scanner on the live site read the synthetic test invoice correctly (Gemini
  Flash-Lite, about 5 seconds). Atanas on his iPhone: "It reads all perfect."
- The latest scanner build detects, auto-captures and reads here against a fake camera
  stream at phone width.

**Open**

- (Resolved 2026-09-18: Atanas confirmed the in-app scanner "working perfect" on his
  iPhone with the latest build; the earlier "nothing to scan" was most likely the
  previous deploy still being served.)
- Accuracy pass on both engines with real documents; shared rate limiter; research
  follow-ups; receipt images to Supabase Storage; paywall design.
- Atanas's side: Safari camera permission, business details in Settings, invoice counter
  at 357358, Resend key, Cloudflare Worker deploy, revoke the old Mapbox token.

**Gotchas met**

- The account usage cap killed background agent runs several times; keep parallel agent
  fan-outs small.
- Research agents used the shared browser pane and navigated Atanas's sign-in tabs away;
  tell agents never to use the browser tools.
- `web/.env.local` had empty `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, so
  local scanning tests need the live site or the Gemini key.
- The desktop app's safety layer refused to merge PR #7 unreviewed; Atanas merged it.

## 2026-09-15 (before this log; reconstructed from git)

Scanner iOS fixes (native camera, downscaling, safe-area, one-tap dashboard tile);
restrict client FKs and add Archive; atomic recurring-invoice generation; invoice
status lifecycle, recurring invoices and payment reminders; invoice numbering and VAT.
Migrations 010–016. Cowork's reviews caught the missed FKs and archived-client billing.

## 2026-09-13 → 2026-09-14 (reconstructed from git)

MVP, Supabase auth and schema, AI document scanner, client/supplier split, credit
notes on sales invoices, business profile, tagging, CSV/PDF exports, feedback widget,
recurring expenses, per-item receipt categories, file library, password reset.
Migrations 002–009.
