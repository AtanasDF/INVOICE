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
- [ ] **11. Fourth review pass on what all three missed**: PDF/print rendering,
  `quoteDeposit`, `splitDocuments`, `duplicateContacts`, `statement`, `priceGuide`,
  `companyRegister`

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
- [ ] `torch-bright.mjpeg` and `dark-nocv2.mjpeg` still have no generator (suites outside
  `run-all.sh`).

## Tests for fixes that have none yet

- [x] 12. Delete-confirmation + rollback on the credit-note path —
  `harness/test-credit-rollback.mjs` (11 checks). It found one more while being written:
  after a failed removal, a later successful one left the old error on screen saying the
  credit note was still on the invoice, when it had just gone.
- [ ] 13. Email-import: inline signature images, unreadable-document filing
- [ ] 14. Customer matching on a scanned invoice (exact-only)
- [ ] 15. Free-page quote not importable as an invoice
- [x] 16. Supplier price "12.50 per length" rejected, not £0 —
  `harness/test-price-words.mjs`. Needed `record_quote_request_response` implemented in
  `mockdb.mjs` first: the owner-side answer path was untestable without it, which also
  blocked item 17.
- [ ] 17. Quote-request background refresh not adopting a supplier's answer
- [ ] 18. VAT snapshot branch — merge-readiness re-run

## Checklist items still open

- [ ] 19. Scanner suites against fresh synthetic clips: glare, shadow, hand on corner,
  patterned surface, moving phone
- [ ] 20. Till-roll receipt (longer than frame) and landscape document
- [ ] 21. PDFs: 20-page, scanned-image, password-protected
- [ ] 22. HEIC, 12MP, 10MB, no-extension uploads
- [ ] 23. Upside-down / 90° / 180° documents
- [ ] 24. Batch of 10 timed through Gemini vs Claude
- [ ] 25. Second-user RLS simulation in the mock server
- [ ] 26. Storage signed-URL expiry and re-signing
- [ ] 27. Network killed mid-save on every remaining form

## Bigger pieces

- [ ] 28. Offline scan queue (service worker) — the one "not built" item
- [ ] 29. Accessibility pass: focus order, tab traps, screen-reader labels on every flow
- [ ] 30. 320px sweep re-run after the day's changes
- [ ] 31. Performance: 2,000-receipt account on a throttled phone profile
- [ ] 32. Dead-code and bundle re-audit
- [ ] 33. `notes/` consolidation — three reviews' findings into one standing document
  (this file is the start of it)

## Blocked only by Atanas

- [ ] 34. `feature/quote-vat-snapshot` — tested, needs migration-033 run, then merge
- [ ] migrations 031 and 032 (see `notes/tonight.md`)
- [ ] The Currys receipt: £549.99 may be the till total, not the net figure — his call,
  his record. See the foot of `Claude outputs/invoicer-backlog-brief.md`.
