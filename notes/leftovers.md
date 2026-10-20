# The leftovers sweep (cloud brief 17, 2026-10-20)

Branch `wip/leftovers`. Every item the audits since 18/10 marked left, half, open or "for
later" — from `audit-components`, `audit-documents`, `audit-offline`, `audit-failure-paths`,
`audit-api-routes`, `audit-sql`, `audit-worker`, `ios-safari`, `ios-forms-layout`,
`ios-files-share`, `help-truth` and the "Left" lines of the top SESSIONS.md entries —
re-checked against the code as it is on `main` today (`6f403a6`), because later briefs had
already closed some. Those are listed at the foot so nobody re-opens them.

Three lists: **(a)** a question for Atanas, not done; **(b)** needs a real iPhone, the live
database or the Mac, with what to run; **(c)** everything else, fixed here with a check each in
`harness/test-leftovers.mjs` unless it says otherwise. The camera capture code
(DocumentCapture, lib/opencv, the auto-capture timing) was not touched: it is waiting on the
iPhone test.

## (a) Needs a decision from Atanas

1. **Line rounding.** Round each invoice line to the penny before totalling? It moves the total of an already-issued invoice with a half-penny line by 1p (`lib/vat.ts:63-68`; components audit worst-5).
2. **Spreadsheet money.** Should the .csv write amounts as plain numbers (−250.00, no £) so Excel can add them up, rather than exactly as printed? Today `−£250.00` and `£-50.00` are text to Excel and SUM leaves them out (documents 3c).
3. **Email total.** Leave the total in the email/share text as a second copy built from the same lib functions, or read it off the sheet? (Cheap middle: a suite asserting they match.) (documents §1)
4. **Sign-out on a lent phone.** Should signing out also wipe the Free-page draft and signature (losing a half-typed invoice), rather than waiting until a different account signs in? (offline 1a/1c)
5. **Photo links.** Are 7-day signed photo links acceptable on a shared computer, or shorter (a day) and re-signed when the app resumes? (offline 1d)
6. **A scan lost on one bar still counts.** Build idempotency keys on `/api/scan` so a reply lost in transit isn't charged, or accept it? (offline 4b)
7. **Claude-first reads.** Should business-card reads (`/api/contact-scan`) and "describe an invoice" (`/api/invoice-from-text`) read with Gemini first like everything else, Claude as the fallback? `/privacy` says Anthropic reads those by default, so it changes in the same commit. (help-truth left 2, api #6)
8. **Overall hourly caps.** Are 300 (invoice-from-text), 1,200 (price-guide) and 200 (feedback) the numbers you want? (api #1)
9. **Company lookups for strangers.** Should `/api/company-check` and `/api/company-search` need sign-in, as `/check-company` already does? (The separate stranger/account totals are done, list c.) (api #5)
10. **Invite bonuses can be farmed through the RPCs** whatever `NEXT_PUBLIC_INVITES` says. Revoke `claim_invite` until invites launch, or cap bonuses per inviter per month (what cap)? Either is a migration pair, provable first in pglite. (sql note 1)
11. **Lock an issued invoice's number** against the owner's own edits (a trigger and a migration pair)? (sql note 6)
12. **"Put it back to accepted"** after a stuck Turn into invoice: back to the status the quote had before the claim (sent or accepted), or always accepted? (failure-paths L5)
13. **Pasted screenshot beside a real PDF in an email.** File inline images of 120px or more too, even though large signature logos would then be filed as well? (audit-worker)
14. **Reverse-charge credit notes** print no HMRC wording. Should they carry "customer to account for the output tax adjustment of £x", worked out at the invoice's rate? (`reverseChargeCreditNote` exists, unused.) (dead-weight)
15. **Dead code** (`claimMessage`, `type CurrencyCode`, `scripts/copy-opencv.mjs`, two re-exports, 102 needless exports, and `lib/useLeaveGuard.ts`, which duplicates `lib/leaveGuard.ts`). May they be removed? Rule 1. (dead-weight; brief 15 left)
16. **Converter limits.** Cap "PDF to pictures" (500 pages renders 500)? Keep the formula guard on CSV→CSV? Is a Web Worker for huge files worth a session? (audit-convert)
17. **Password reset by code.** May the Supabase Reset Password email template get `{{ .Token }}`, so the home-screen app can reset in place? Then the code side is small. (ios-safari #18)
18. **The haptic on Mark as paid** arrives after the round trip, outside the tap, which iOS 18+ may ignore. Buzz at the tap (before success is known), or keep it on success? (ios-safari #25)
19. **Uploads that fall back to an inline photo.** When storage refuses, the photo is kept inside the row as a multi-megabyte data: URL that photo ageing never sees. Retry once and flag such rows on Needs review, or leave the fallback as it is? (offline 4a)
20. Reminder, not a question: when the HMRC credentials go live, `/privacy` needs "a kept VAT check stays until the account goes". (help-truth)

## (b) Needs the iPhone, the live database or the Mac

Live system:
- **045's footer query 1** (rows already pointing at another account's records): nothing records it was run. Run it read-only from `web/supabase/migration-045-same-owner-contacts.sql` through the Supabase connection; flag any rows, change none.
- **The Worker smoke test after the `c1a59b45` deploy**: send one email to a mistyped `u-<token>@invoiceover.com` and check the bounce wording; send one real invoice to the Hidefield import address and check it reaches Needs review. Watch both with `cd worker && npx wrangler tail`.
- **The Worker's Message-ID** (list c, the duplicate-import fix) goes live only with `cd worker && npx wrangler deploy` on the Mac; the route side deploys with main.
- **How long an Email Worker may wait on `fetch`** against the route's 300 s: Cloudflare's Email Workers limits, or a deliberately slow read under `wrangler tail`.
- **Photo Cache-Control**: curl a signed URL from the live project and check `max-age`. Objects already stored keep the header they were uploaded with, whatever list c changed.

The Mac (rebuild, `cd web && npx next start -p 3100`, `BASE=http://localhost:3100`):
- `test-camera-dark` has never run: `python3 gen-large.py` first.
- `test-far`, `test-far-v2` (34/35, also on main), `test-bent` (wobbles 59-64; `python3 gen-bent.py` first, not `-I`), `JOBS=1`.
- The batch double-capture hole: `gen-swap-inplace.py` then `test-batch-swap` (`notes/batch-rearm.md`).
- `test-review-fixes` times out at its `/scan` wait in the cloud and on main; check it isn't stuck on the scan page's leave `confirm` (`mockdb.mjs` answers only `beforeunload`).
- `test-address` 0/1 (probably needs the network); `test-deposits` still PENDING in `test-suites-report.mjs` though brief 13 ran it 17/17 — move it into run-all if green; `test-settings-add`'s 35 unmatched checks; `test-receipts-list-3302` (SUPERSEDED, but the only coverage of the supplier-link banner) and `qux-test-public-company` (the only /q/ company-versus-person check).
- Briefs 13 and 15's Mac lists against what round 4 actually ran: `test-print`, `test-page-print`, `test-offline-rules`, `test-share`, `test-save-as`, `test-get-the-app` were not visibly run.
- `/vendor/opencv-5.0.0.js` has a fixed name but `package.json` allows `^5.0.0-release.1`, and it is cached immutable: pin the exact version, or rename per version (which touches `lib/opencv.ts`, camera code).

The iPhone:
- Camera halves of ios-safari #21/#22 (DocumentCapture's error screens don't scroll; banners clamp to two lines; no left/right safe-area): sideways, larger text, a camera error.
- Brief 14 on the phone: a batch of three, switch to Messages, come back; reload mid-batch; a header link mid-batch. `git revert ddbaa81` if anything is wrong.
- `SAFARI_CAMERA_TIP`'s "aA → Website Settings" in the home-screen app; `navigator.permissions.query({name:"camera"})` there in Web Inspector.
- #23: the keyboard over the File library's email form and Settings' save bar (no `visualViewport` handling).
- #12 leftovers: SaveAsMenu picture, SaveThese and the File library's save after an await, in Safari and the home-screen app.
- Status bar (`statusBarStyle: "default"`, no `themeColor`) in light and dark themes.
- 150- and 200-line invoices saved as PDF, PNG and JPEG (`sheetPixelRatio`): not blank, readable.
- Before the worker installs, and after Safari's 7-day clear: what shows offline.
- Notifications: allowed, offline, sign out, back online, run the check cron — does a push still arrive, and does the 410 clean the row?
- "Their quote document" and AnswerEntry's "Open the one attached", in Safari and the home-screen app.
- Everything on the "Try on the phone" lists in `ios-forms-layout.md`, `ios-files-share.md` and the 12 steps in `ios-safari.md`.

## (c) Fixed here

Each confirmed in the code first. `[x]` done with its check; `[ ]` not done, with why.

From the routes and the invoice page (commit 1):
- [x] An invoice draft edit only ever touches a draft (`updateDraft` filters on `status = 'draft'` and says so when nothing matched). Confirm pressed again after a send whose read-back dropped, or a stale tab's Save draft, rewrote an issued invoice's lines and date — and then failed on the numbering call with a raw P0001 and a uuid. (failure-paths L2, found while checking it)
- [x] Save draft's read-back is its own step; a failed send read-back closes the panel. (L1, L2)
- [x] The quote-request page names what failed instead of "Something went wrong." (L3)
- [x] `/clients` says when draft figures are shown without VAT because settings didn't load. (L6)
- [x] Cron and webhook secrets compared in constant time, `lib/bearer.ts`. (api #9)
- [x] The inbox import runs on either reader key. (api #7)
- [x] `RESEND_API_BASE` honoured by send-invoice, reminders and quote-requests/send (the audit named two; there were three). (api #11)
- [x] The mileage postcode lookup answers 503 instead of throwing. (api #10)
- [x] `/api/company-check` counts strangers and accounts separately; the page sends its sign-in. (api #5, the half that isn't a decision)
- [x] The `storage.ts` plan comments name migration-044. (sql H2 follow-up)
- [x] `test-audit-guards` was red on main (89/90): its regex predated the draft's `kept.finish()`.

## Already fixed before this sweep (checked, not re-opened)

Quote "sent N days ago" (migration-042); AnswerEntry and extractPages "Load failed"; the
dark-mode sheet and pale "Paid"; the Free page's Claude default; offline 1a-1c, 2a, 2b, §5
(account switch, cache name, `offline.html`, `fetchWithin`); the CSV BOM, formula guard and
`\r`; `sheetPixelRatio`; InviteCard's AbortError (L7); `openWhenReady` (L4); ios-safari #1,
2, 5, 7-11, 13-16, 19, 24 and most of #25; `test-component-money` (`609e979`); migrations
043-045 and the Worker deploy themselves.
