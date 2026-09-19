# Session log

One entry per Claude Code session, newest first. Read the top entries before starting;
append yours before the final push. Keep each entry to what changed, what was decided,
and what is left open. Dates are session dates (Europe/London).

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
  main (4e169a1). `feature/quotes-ux` is fixed and merged with main, waiting for its
  quotes-ux suite (48) and the quote/invoice link suites (need a dev server pointed at
  mock-server.mjs on :5555) before merging.
- Atanas's usage runs out tonight; background wake-ups at 00:33 (Vercel window), 00:43
  and 01:05 BST to carry on. If this session stopped: push main after 23:30Z to deploy,
  then finish `feature/quotes-ux` as above, then the two agents' branches.
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
