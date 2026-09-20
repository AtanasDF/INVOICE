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
- [ ] **5. Saving Settings writes back the invoice counter from a stale page-load
  snapshot** `[medium]`
- [ ] **6. Sign out can silently do nothing on a bad connection and leave the session on
  the phone** `[medium]`
- [ ] **7. Recurring "Log it" saves the expense, then reports failure if only the schedule
  write fails** `[medium]`
- [ ] **8. A photo the browser can't decode attaches nothing, no error shown** `[medium]`
- [ ] **9. Feedback pill covers the Free-invoice "More" button on a phone** `[medium]`
- [ ] **10. A failed dashboard load clears the home-screen badge — false all-clear** `[low]`
- [ ] **11. Fourth review pass on what all three missed**: PDF/print rendering,
  `quoteDeposit`, `splitDocuments`, `duplicateContacts`, `statement`, `priceGuide`,
  `companyRegister`

## Tests for fixes that have none yet

- [ ] 12. Delete-confirmation + rollback on the credit-note path
- [ ] 13. Email-import: inline signature images, unreadable-document filing
- [ ] 14. Customer matching on a scanned invoice (exact-only)
- [ ] 15. Free-page quote not importable as an invoice
- [ ] 16. Supplier price "12.50 per length" rejected, not £0
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
