# Backlog — everything outstanding, in one place

Started 2026-09-20 from the list given to Atanas on his phone, so it stops living in a
chat window. Tick things off here as they land; add the commit that closed them.

Three reviews (60 agents) produced 34 confirmed findings. Reviews one and two were fixed
the same day (23 bugs). Review three's 11 were still open when this file was written.

---

## From the third review

- [x] **1. Sign-out leaves the push subscription live** `[high]` — the daily cron went on
  pushing to a device nobody was signed in on, and the badge stayed on the icon.
  Fixed: `src/lib/signOut.ts`, tested by `harness/test-sign-out.mjs`.
- [x] **2. Clients page "Payment history" shows net subtotals, not what the customer owes**
  `[high]` — and **4. shows invoices ex-VAT while every other screen and the customer's
  PDF show gross** `[medium]`. Same line of code; fixed together.
  Tested by the seventh place in `harness/test-one-total.mjs`.
- [x] **3. `/expenses` counts draft invoices as income and ignores credit notes** `[high]`
  — two different income figures between it and the tax card.
  Fixed: `src/lib/periodIncome.ts`, tested by `harness/test-period-income.mjs`.
- [x] **5. Saving Settings writes back the invoice counter from a stale page-load
  snapshot** `[medium]` — the review's stated consequence was wrong and worth recording:
  `unique (user_id, number)` means a number can never reach two customers. What actually
  happened is that issuing **jams** — the next "Mark as sent" fails on 23505, and because
  the aborted transaction rolls the increment back too, it keeps failing until someone
  works out why and retypes the number. An untouched field now writes back today's value;
  a deliberate edit still wins.
- [x] **6. Sign out can silently do nothing on a bad connection and leave the session on
  the phone** `[medium]` — worse than reported, and the test is what found it.
  `supabase.auth.signOut()` resolves with an error rather than throwing, and on a dead
  connection it **hangs**, retrying the token refresh; it can also return reporting no
  error at all with the session still in storage. Sign-out is now bounded at 4s and then
  checks by looking, rather than trusting what it was told.
- [x] **7. Recurring "Log it" saves the expense, then reports failure if only the schedule
  write fails** `[medium]` — and the identical defect on `/recurring/invoices`, fixed in
  the same pass. Also adds the missing in-flight guard, so a double-tap can't make two.
- [x] **8. A photo the browser can't decode attaches nothing, no error shown** `[medium]`
  — at exactly one place, `/receipts/new`; every other upload path already handled it.
- [x] **9. Feedback pill covers the Free-invoice "More" button on a phone** `[medium]` —
  it hid Print, Next invoice and Save to your account behind a tap that opened Feedback.
  `test-one-handed` now hit-tests every button on that page, because `clickText` calls
  `el.click()` and never notices something sitting on top.
- [x] **10. A failed dashboard load clears the home-screen badge — false all-clear** `[low]`
- [x] **11. Fourth review pass on what all three missed** — run 2026-09-21; the findings
  are listed in their own section below.

## Found along the way (not on the original list)

- [x] **Every "today" in the app was the UTC date.** For the hour after midnight, British
  Summer Time, a receipt typed in was dated yesterday, an invoice due that day wasn't
  overdue, a sale could land in the previous VAT quarter, and an invoice issued through
  the scan page dropped out of the tax card altogether. One `todayISO()` in
  `src/lib/today.ts` now, in Europe/London. `harness/test-midnight.mjs`.
- [x] **A crashed harness suite reported "0 fails"**, which reads as a pass. Three were
  sitting like that.
- [x] **`large.mjpeg` had no generator** and nine suites need it; the clip only ever
  existed by hand in a wiped scratchpad. `harness/gen-large.py`.
- [x] **Sixteen suites shared one Chrome profile**, so they knocked each other over
  four-at-a-time and passed when run alone.
- [x] **The harness built its own dates off the UTC clock**, so it disagreed with the app
  for the same hour. `mockdb.mjs` now exports `todayISO()` / `day(n)`.
- [x] `torch-bright.mjpeg` and `dark-nocv2.mjpeg` still have no generator (suites outside
  `run-all.sh`) — `harness/gen-torch.py`, 2026-09-21, on the dark/dim generators' pattern.
  `test-torch-nocv` also never stopped OpenCV loading, so its "no OpenCV" check could only
  pass on a server missing the vendor file; it now points the scanner's script tag at a
  path that isn't there.
- [x] **`test-check-company` was running a stale worktree copy of the app**, not `web/`, so
  it was green whatever changed in main — and would break the day `.claude/worktrees/` is
  deleted. `test-quote-requests` imported from a worktree the same way.

## Tests for fixes that have none yet

- [x] 12. Delete-confirmation + rollback on the credit-note path —
  `harness/test-credit-rollback.mjs` (11 checks). It found one more while being written:
  after a failed removal, a later successful one left the old error on screen saying the
  credit note was still on the invoice, when it had just gone.
- [x] 13. Email-import: inline signature images, unreadable-document filing — two suites,
  2026-09-21. `harness/test-inbox-worker.mjs` (11 checks) runs the Cloudflare Worker's own
  code in Node with `fetch` stubbed: five signature icons ahead of the invoice post only
  the invoice; a pasted screenshot with nothing else still posts; the wrong address or a
  short token posts nothing. **Found and fixed:** an HTML-only email (no text part, which
  some invoicing systems send) posted an empty body, so an email with no attachment was
  filed as a row holding nothing but its subject — the Worker now falls back to the HTML's
  text (deployed that evening — the Worker's first deploy).
  `harness/test-inbox-ingest.mjs` (20 checks) runs `/api/inbox/ingest` for real on its own
  dev server against the mock PostgREST and a stand-in Claude API: wrong secret/token,
  the email-itself row, a read invoice (net, VAT, number, dates, lines, PDF in the owner's
  storage folder), the reader refusing (529) or cut off → filed unread with the document
  attached and no figures invented, one refused not taking the others, a database refusal
  filed unread with the reason, storage down → kept inline, two documents in one PDF cut
  into two rows, a spreadsheet skipped and five attachments at most.
  **Live, 2026-09-22 00:23**: a real email from Gmail to the test account's address came
  through Cloudflare, the Worker and the route and was filed for review with every figure
  right — the first email the import ever received.
- [x] 14. Customer matching on a scanned invoice (exact-only) —
  `harness/test-exact-customer.mjs`: "Riverside Building Services" must not pick
  "Hillside Building Services" (two shared words was enough for the old loose match, and
  the matched customer REPLACES the name on the document), while the same name still does.
- [x] 15. Free-page quote not importable as an invoice — `harness/test-quote-not-invoice.mjs`
  (8 checks), including that a real invoice draft still imports, so the gate isn't too wide.
- [x] 16. Supplier price "12.50 per length" rejected, not £0 —
  `harness/test-price-words.mjs`. Needed `record_quote_request_response` implemented in
  `mockdb.mjs` first: the owner-side answer path was untestable without it, which also
  blocked item 17.
- [x] 17. Quote-request background refresh not adopting a supplier's answer —
  `harness/test-answer-clash.mjs` (7 checks): the refresh holds off while the prices form
  is open, a save against a moved-on answer is refused and says so, closing the form picks
  the answer up, and what a later save replaces is kept in `previous`.
- [x] 18. VAT snapshot branch — merge-readiness re-run: merged 2026-09-21 after migration-033,
  full harness green on the merged build.

## Checklist items still open

- [x] 19. Scanner suites against fresh synthetic clips: glare, shadow, hand on corner,
  patterned surface, moving phone — `harness/test-conditions.mjs` with clips from
  `harness/gen-conditions.py`. Glare, a shadow and a tiled floor are all still captured; a
  phone waving about is not captured until it is held still. A finger over one corner IS
  captured, by design (the corner is recovered where the fitted sides meet), and the crop
  comes out page-shaped (0.40 against the receipt's 0.36), not cut at the finger. Camera
  suites stay outside `run-all.sh`, like the others.
- [x] 20. Till-roll receipt (longer than frame) and landscape document — the till roll
  passes: not captured while it runs off both ends, captured once it's pulled back to fit.
  **The landscape page was never detected because it was never all on screen.** Traced
  2026-09-21 by running the detector's own stages inside the scanner page: on the whole
  720-px video frame the wide page is a clean four-corner contour (39% of the frame,
  solidity 0.99), as good as the portrait one — but the live loop looks only at
  `visibleRegion`, the cover-fitted strip the preview shows, which on a 375-px-wide
  viewport is the middle 566 px of the 720. The clip's page was 640 px wide, so both its
  sides were off the preview and all the detector had was its top and bottom edges as two
  thin strips. The same for the hand-made `landscape-clear`/`landscape-blank`/
  `receipt-sideways` clips (each page or receipt wider than 566 px). Nothing assumes a
  portrait page: a 460-px-wide landscape page auto-captures in about 2.5 s, and the crop
  comes out 462×328 — the page's own shape. Not taking a page that runs off the preview is
  right (the till roll relies on it), and on an iPhone in portrait the preview shows only
  about 62% of the 4:3 sensor's width, so a landscape page has to be held further back, or
  the phone turned. `landscape.mjpeg` now follows the till-roll pattern (wide for 6 s, then
  held back to fit) and `test-conditions` asserts no capture while it overflows, a capture
  once it fits, and a page-shaped crop. The three hand-made clips are superseded.
- [x] 21. PDFs: 20-page, scanned-image, password-protected — `harness/test-odd-files.mjs`: all
  twenty pages reach the reader whole, an image-only PDF is handed over as a PDF, and a
  password-protected one (which the page-counter can't open) doesn't take the reading page
  down. Fixtures regenerated by `harness/gen-odd-files.sh`.
- [x] 22. HEIC, 12MP, 10MB, no-extension uploads — same suite. A 12MP photo is downscaled
  to 1600px; a 23MB photo is read without hanging and arrives under 2MB; a HEIC Chrome can't
  decode is said to be unreadable rather than passed on. **Found and fixed:** a photo with no
  extension has no browser type at all and `readUpload` tagged it `application/pdf` — the
  page-counter failed on it, the reader was sent a "PDF" of JPEG bytes, and the receipt was
  stored with an octet-stream data URL the list couldn't show. The first bytes now decide.
- [x] 23. Upside-down / 90° / 180° documents — `harness/test-exif-rotation.mjs`: a phone held
  sideways stores landscape pixels with "rotate 90" in EXIF, upside down stores "rotate
  180"; Chrome honours both on decode, so the reader is handed an upright portrait photo
  either way (checked by dimensions and by which side the left-aligned text lands on).
  A document that is physically sideways on the page, with no EXIF, is the reader's job.
- [x] 24. Batch of 10 timed through Gemini vs Claude — done 2026-09-22 (00:15). `harness/gen-bench-docs.py`
  makes ten documents with known figures (six invoices, three till receipts, one credit
  note; A4 JPEGs with tilt and noise) and `harness/bench-engines.mjs` runs the app's own
  reader on them one at a time, scoring type, vendor, date, total, VAT, number and line
  count. **Both engines: 10/10 documents with all seven fields right. Gemini (3.5
  Flash-Lite) median 4.0 s, slowest 4.6 s; Claude (Opus 5, medium effort) median 8.1 s,
  slowest 9.8 s.** On clean synthetic documents Gemini is as accurate and twice as fast;
  what it can't say is how the two compare on Atanas's real, creased, photographed
  paperwork — that's queued-work item 1 and needs his documents. Results in
  `harness/bench-docs/results.json` (gitignored); the bench skips an engine whose key is
  missing and says so.
- [x] 25. Second-user RLS simulation in the mock server — `db.rls = true` makes `mockdb.mjs`
  behave like the database (reads see only the signed-in user's rows; writes only reach
  them), off by default so no existing suite changes. `harness/test-two-users.mjs` seeds a
  second account and checks nothing of theirs reaches any page, including by opening their
  invoice's address directly. With `rls` off the suite fails, so it isn't testing nothing.
- [x] 26. Storage signed-URL expiry and re-signing — `harness/test-stored-photos.mjs`.
  `mockdb.mjs` now answers `/storage/v1/object/sign/`, with `db.storageFails` to make it
  behave like an outage, so both paths can be exercised: signed links are used when
  signing works, and when it fails the receipt still shows as HAVING a photo (rather than
  as having none) and the data export refuses rather than writing a file with it missing.
- [x] 27. Network killed mid-save on every remaining form — `test-half-saved` now covers the
  new-contact form, Settings and a new invoice as well as payments, receipts and the
  quote→invoice path: nothing half-written, and the failure said out loud rather than an
  empty list standing in for it. Each one also asserts the write was *attempted*, since
  "nothing was saved" is true for the wrong reason if the button was never pressed.

## Found on 22 September, from the first real scan

- [x] **A till's `FRI SEP 18 12:57:01 2026` was filed as 2012** — the month-name date
  pattern took the 12 of the time as a two-digit year. Fixed in `documentDate.ts` (time
  stripped first; a two-digit year followed by a colon is never a year), `test-dates`
  34/34. Atanas's own row still needs its date edited by him.
- [x] **The shot fired before the phone had focused** (Atanas: "give it another half a
  second") — the hold-still before auto-capture is 1.1 s, was 0.6 s (`STABLE_MS`).
  `harness/test-autozoom-out.mjs` asserts no capture inside a second of a page appearing.
- [x] **Zoomed in and the page fills the view, the scanner stayed zoomed** (Atanas: "if
  the zoom is maxed and the phone is far, unzoom a little") — a found page with a corner
  within the fit margin while zoomed now zooms out to where it fits, after the usual
  settle; a page lost altogether still goes back to 1× as before. Same suite: 2.2× → 1×
  and found again. `test-autozoom` 8/8 and `test-conditions` 12/12 still.
- [x] Compute VAT from a printed rate when the receipt prints no VAT figure (GO OUTDOORS
  prints "20%" per line and a total; Gemini leaves VAT empty, Claude infers £4.83).
  **Already built and this line was stale** (found 2026-09-24): `src/lib/vatFromRate.ts`,
  used by the scan page and the inbox import, recomputed when the total is edited, marked
  as worked out so whoever reviews it sees why. `test-vat-from-rate` covers it.
- [x] A "getting ready" indicator on the scanner's cold start. **Already built and this
  line was stale** (found 2026-09-24): the viewfinder says "Getting ready... the first time
  takes a moment" while the page-finder starts. Nothing tested it, though, so it could have
  gone at any time and nobody would have known until somebody stood in a yard holding a
  receipt. `test-cold-start` now holds the runtime unstarted and checks the words, their
  size and colour, that they never claim anything is wrong, and that they clear.

## The first page (Atanas, 22 September, 02:20)

- [ ] **One first page for strangers: Free invoice and Check a company together.** His
  brief, verbatim in spirit: a nice picture of the scan/camera; everything done with one
  or two buttons; every word "precise, delicate, posh, polite, understandable"; not
  overloaded, not confusing — "three old kids should be able to do that": older people,
  children, people who don't understand technology. Research first (`notes/first-page-
  research.md`), then a design he reacts to, then the build. Today's page opens with "How
  do you want to start?" and four choices with a paragraph each.

## Bigger pieces

- [ ] **Make the screens work at twice the text size** (started 2026-09-24). Not one of the
  twelve apps in `competitor-research.md` respects the size somebody has already chosen on
  their phone, so this is a differentiator -- and for a brief that says "three old kids
  should be able to do that", ignoring that setting is the plainest failure there is. The
  Dynamic Type rule is WRITTEN and commented out in `globals.css`; `harness/test-big-text.mjs`
  measures the state and is deliberately out of `run-all.sh` because it fails. What breaks at
  32px root: the dashboard panels, the invoice table, the receipt action rows, the expenses
  picker. Already fixed: the header, the expenses period control, the Settings category row.
  The rule and the suite go live together, in one commit, when they all pass.


- [ ] 28. Offline scan queue (service worker) — the one "not built" item. Deferred on
  purpose: CLAUDE.md says it is worth doing only with an iPhone to test on, and a caching
  service worker shipped untested against real Safari is a way to lose captures, not keep
  them.
- [x] 29. Accessibility pass — run 2026-09-21; findings in their own section below.
- [x] 30. 320px sweep re-run after the day's changes — `harness/test-fit-320.mjs` runs the
  same sweep as `test-fit-sweep` at 320px (iPhone SE) and is in `run-all.sh`, so both
  widths are covered every run rather than when someone remembers `WIDTH=320`. All 26
  pages fit.
- [x] 31. Performance: 2,000-receipt account on a throttled phone profile —
  `harness/test-big-slow.mjs`: 2,000 receipts and 400 invoices with the CPU throttled 4×.
  Dashboard 0.5s, receipts 1.7s, expenses 0.2s, VAT 0.2s, invoices 0.3s; every page still
  answers a tap, scrolling 2,000 rows doesn't stall, and filtering to a fortnight is
  immediate. The lists draw every row by design (load everything, filter in the browser);
  at this size that holds.
- [x] 32. Dead-code and bundle re-audit — **dead code done** (`ts-prune` over the whole
  app, 2026-09-21): three unused exports and nothing else. `isMileage` (`mileage.ts`) and
  `mergeAddress` (`addressLookup.ts`) are the two CLAUDE.md already flags; the third is the
  type `CurrencyCode` in `fx.ts`. Flagged, not removed, per the standing rule. Everything
  else it reported was Next's own config export or the gitignored iCloud `* 2.*` strays.
  **Bundle half done** (`harness/test-weight.mjs`, in the browser, since Next 16 no longer
  prints a size table): the Free invoice page is 934 KB of JavaScript for a stranger with
  no OpenCV; Check a company 807 KB; the dashboard 1,500 KB of its own. The dashboard also
  warms up OpenCV (13 MB) on idle, on purpose (`page.tsx`), so the scanner opens instantly
  — that only holds if it is once per device, and it is: the vendor file carries
  `max-age=31536000, immutable` and Chrome serves the second request from cache. (It can't
  be shown on the app's own pages in the harness: request interception, which the mock
  needs, makes Chrome skip its cache, so the proof is a plain tab.)
- [x] 33. `notes/` consolidation — this file is the standing document: all four reviews'
  surviving findings, the original 34, and what was found along the way. `claude-notes.md`'s
  17-September queued list now points here and marks its own done items done.

## Blocked only by Atanas

- [x] 34. `feature/quote-vat-snapshot` — migration-033 run and verified 2026-09-21, merged.
- [x] `feature/deposit-delete-guard` — migration-034 run, exercised as the owner (rolled
  back) and verified 2026-09-21, merged.
- [x] migrations 031 and 032 (see `notes/tonight.md`) — **both run 2026-09-21**. 031's
  premise was wrong (the six tables already had RLS on; the audit reads SQL files, not the
  database), so it now revokes the unused default grants on all 24 backup tables instead.
- [x] The Currys receipt: £549.99 may be the till total, not the net figure — his call,
  his record. See the foot of `Claude outputs/invoicer-backlog-brief.md`. **Moot,
  2026-09-21**: the live `receipts` table holds five rows (Rawlings ×2, Anthropic ×3) and
  no Currys; the row is in the 14- and 15-September snapshots only, and the 17-September
  snapshot is empty, so it left the live table between those dates. Nothing to correct.

## Fourth review (item 11) — 29 findings, 18 survived two skeptics each, 11 refuted

Run 2026-09-21 over the seven areas the first three reviews never touched. Each finding
was handed to two skeptics with different lenses (can you reproduce it from source; is
the consequence real), and anything either could refute was dropped. Their corrections
are worth reading before acting — one of them stopped a fix that would have made every
legacy hand-marked-paid invoice reappear as owing on customers' statements.

- [x] **[high] quote-deposit** — Deleting a deposit invoice leaves its deduction on the balance invoice. Fixed on `feature/deposit-delete-guard`; migration-034 run and verified 2026-09-21, merged. The evening review found the guard ignored a balance invoice whose quote link was lost (the orphan the page relinks by tag): migration-035, run and verified the same night.
  `web/supabase/migration-022-quote-deposits.sql:14`
- [x] **[high] split-documents** — A PDF page no document claims is silently dropped from every part, so the page never reaches the saved receipt
  `web/src/lib/splitDocuments.ts:81`
- [x] **[high] statement** — Ageing grid files anything up to 30 days late under "Not yet late", contradicting the same page's own "of that is late" line
  `web/src/lib/statement.ts:70`
- [x] **[high] company-register** — A Companies House timeout or rate-limit is shown as "Companies House has no company under this name"
  `web/src/lib/companyRegister.ts:15`
- [x] **[medium] invoice-pdf-print** — A long unbroken description pushes the money columns out of the PDF and the printed invoice
  `web/src/components/invoice/IssuedInvoice.tsx:59`
- [x] **[medium] invoice-pdf-print** — Invoice notes lose every line break on the customer's invoice, PDF, print and /i/ link
  `web/src/components/invoice/IssuedInvoice.tsx:146`
- [x] **[medium] quote-deposit** — A quote's total and the deposit it asks for are recomputed from today's VAT registration, so an already-sent quote restates itself on the customer's live link. Fixed on `feature/quote-vat-snapshot` (commit 9d6515a); migration-033 run and verified 2026-09-21, merged.
  `web/src/components/quote/QuoteDocument.tsx:14`
- [x] **[medium] split-documents** — A rotated shared PDF page is counted as two pages it did not produce, which mis-marks `context` and lets another document's total merge into this one on a re-read
  `web/src/lib/splitDocuments.ts:99`
- [x] **[medium] statement** — A customer left in credit is shown £0.00 owing, and the statement row's own arithmetic silently breaks
  `web/src/lib/statement.ts:52`
- [x] **[medium] price-guide** — A one-sided price range is reported as "in the usual range", whatever the quote says
  `web/src/components/PriceFinder.tsx:53`
- [x] **[medium] company-register** — A company picked from the register, then typed over, puts its number on the other company's contact
  `web/src/app/clients/new/page.tsx:151`
- [x] **[medium] company-register** — Editing a client onto a different company on /clients leaves the old company number in place
  `web/src/app/clients/page.tsx:327`
- [x] **[medium] company-register** — tidyCompanyNumber does not zero-pad a 6- or 7-digit company number, so the lookup 404s and the app says the company is not on the register
  `web/src/lib/companyLookup.ts:131`
- [x] **[low] invoice-pdf-print** — The customer statement prints with its share buttons and app chrome on it
  `web/src/app/clients/[id]/statement/page.tsx:73`
- [x] **[low] duplicate-contacts** — Editing a contact and picking a different company from the register keeps the old company number (same fix as the company-register medium)
  `web/src/app/clients/page.tsx:327`
- [x] **[low] statement** — Printing a statement puts the app's back-link and its Share/Download/Print buttons on the sheet handed to the customer
  `web/src/app/clients/[id]/statement/page.tsx:73`
- [x] **[low] price-guide** — The price guide is kept when the line under it changes, so the verdict is shown against a different item
  `web/src/components/PriceFinder.tsx:27`
- [x] **[low] company-register** — /check-company blames the visitor for a rate limit when Companies House is simply unreachable
  `web/src/app/api/company-check/route.ts:45`

## Accessibility review (item 29) — 20 findings, 11 survived, 9 refuted

Run 2026-09-21, weighted to the pages a customer sees. Each finding went to a skeptic
told to refute it, and anything only a lint rule would care about was dropped.

**Not covered by a test:** the /q/, /i/ and /r/ pages are server-rendered with the
service role, so the harness's mocked PostgREST can't stand in for them and
`test-announced` covers only the app's own forms. The public-page fixes are verified
by reading, not by running.

- [x] **[high] public-invoice** — Accepting or declining a quote gives a blind customer no feedback at all
- [x] **[high] public-invoice** — A supplier's price submission: neither the validation errors nor the successful send is announced
- [x] **[high] free-invoice** — Sending the invoice by email announces nothing and throws focus to the top of the page
- [x] **[high] app-forms** — Save does nothing, says nothing, when a required field is empty
- [x] **[high] app-forms** — House-style labels sit next to their input instead of being tied to it, leaving nine controls with no name at all
- [x] **[high] overlays** — A supplier pricing a quote request gets no feedback when the send is refused — the form just does nothing
- [x] **[medium] public-invoice** — Price boxes and "Can't supply" boxes are named by line number, not by what is on the line. Fixed 2026-09-21: each is named by the line's own description ("Plasterboard 12.5mm: price per sheet", "…: can't supply", "…: alternative or note"), `PriceForm.tsx`. Public page, so verified by reading.
- [x] **[medium] free-invoice** — The scan path gives no feedback: progress, failure and the jump to the editor are all silent. Fixed 2026-09-21: "Reading your invoice…" is a status region, the failure an alert, and the note that says what was filled in (or that the next invoice is ready) takes focus as a status region when the editor appears. Read-only path in the harness (it would call the live reader), so verified by reading.
- [x] **[medium] app-forms** — Nothing these forms say back is ever announced — errors, "Saved.", and the warnings are silent paragraphs. Fixed 2026-09-21: every feedback paragraph in the app (58 in 35 files: red ones `role="alert"`, amber/green ones and "Saved." `role="status"`). `test-announced` checks Settings' "Saved.".
- [x] **[medium] overlays** — The scan review sheet covers the live camera but leaves every camera control tabbable behind it, including Capture and a Back that discards the batch. Fixed 2026-09-21: the live area and the control bar are `inert` while the sheet is up (both scanner paths), and the sheet is a labelled `aria-modal` dialog whose heading takes focus on open. Camera path, so verified by reading and type-check.
- [x] **[low] overlays** — The receipt image lightbox cannot be closed from the keyboard except by finding its ✕, and loses your place in the list. Fixed 2026-09-21 (`/files`): a named dialog, Escape closes it, focus starts on the close button and returns to the tile that opened it. `test-announced` checks all four.
