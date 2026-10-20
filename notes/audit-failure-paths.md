# Every screen with the network taken away (2026-10-20)

Brief 6 in `notes/cloud-queue.md`. A cloud session on `wip/network-off`, cut from
`fix/audit-components` (not `main`), so the 81 component-audit fixes are underneath and
nothing `notes/audit-components.md` section 2 or 3 already marks **Fixed** is repeated here.

**One departure from the brief, said out loud (rule 7).** The brief ends "No behaviour
changes", a report only. The session's own instructions asked for each confirmed finding to
be *fixed*, with the house conventions, and guarded. The later, more specific ask won: every
finding below that is marked **Fixed** changed code. The table is the report the brief
asked for, as the pages stood before.

How it was done: every page under `web/src/app` was traced, with the components it renders
that load or save for themselves (four readers in parallel, each page read line by line).
**Every finding was then opened in the code before it was believed.** Nothing was run in a
browser: there is none in a cloud session. The guards are source-reading checks in
`harness/test-audit-guards.mjs` (90 checks, 34 of them new). The 32 new source checks were
proved by putting the old page code back: 32 failures, and 90/90 again with the fixes.

## The table (as found)

"Load" is what a failed load shows; "Save" is what each failed save or action shows; "Gated"
is whether the empty state is gated on `!error`.

| Page | Load | Save / action | Gated |
|---|---|---|---|
| `/` dashboard | Whole page replaced by `loadFailed("your dashboard")`; the app badge is held back | Mark several paid names the ones that failed; bill Mark paid rolls back and uses `saveFailed`; email-in address is try/finally | yes (behind the page-level return) |
| `/scan` | `listsFailed` note, plus `saveFailed(... "Couldn't load ...")` (**F20**) | `saveFailed` with finally everywhere; the read gets Try again / Retake | yes |
| `/settings` | Page replaced by `loadFailed("your settings")`; logo, push state load on their own, silently (**F16, F17**) | `saveFailed` / `authFailed`; push showed the browser's words (**F17**); Copy address did nothing on a refusal (**F8**); Email me a sign-in link could stick (**F18**) | partly: "No logo yet" was not (**F16**) |
| `/feedback` | `loadFailed(..., "You can still add to it.")` | route's sentence or our own, with finally | **no**: a send wiped the load error (**F14**) |
| `/reset-password` | a dropped connection read as "That link has run out" (**F15**) | `authFailed`, with finally | n.a. |
| `/copy` | none | Make PDF has its own sentence; Share swallowed every failure (**F19**); email is EmailFileForm | n.a. |
| `/convert` | none | allow-listed sentences, otherwise its own; finally | n.a. |
| `/check-company` | number kept, error said (fixed in audit-components) | OFF / UNAVAILABLE / BUSY, each with a way out | yes |
| `/free-invoice` | none (draft in localStorage) | `saveFailed` with Read again; Save as is `SAVE_FAILED`; Send is SendInvoicePanel | n.a. |
| `/login`, `/help`, `/offline`, the legal pages | none | SignInCard / HelpChat, all `authFailed` or own sentences | n.a. |
| `/invoices` | `loadFailed("your invoices")` | `saveFailed`, busy cleared in finally | yes |
| `/invoices/new` | its own red line (fixed in audit-components) | `saveFailed`; scan-a-document parsed the reply bare (**F9**) | n.a. |
| `/invoices/[id]` | early return with `loadFailed("this invoice")`; the link read was swallowed (**F12**) | `saveFailed` in try/finally everywhere, but four that *worked* said they hadn't (**F4–F7**); Copy link said Copied regardless (**F8**) | n.a. |
| `/recurring/invoices` | `loadFailed` inside the form | `saveFailed`, busy reset | **no**: Clear form wiped it (**F3**) |
| `/money` | `loadError` apart (fixed in audit-components) | `saveFailed`, ref in finally | yes |
| `/vat` | `loadFailed`; boxes hidden | Copy says Couldn't copy (fixed earlier) | n.a. |
| `/jobs` | `loadFailed` | none | yes |
| `/receipts` | `loadFailed("your receipts")` | `saveFailed`; link N says how many failed | yes, but "That receipt isn't here any more" was not (**F1**) |
| `/receipts/new` | `loadFailed(..., "You can still fill this in.")` in the form's one `error` | `saveFailed`; photo has its own sentence | **no**: a photo, Clear or Save wiped it and the duplicate checks then ran on `[]` (**F2**) |
| `/receipts/review` | `loadFailed("the review queue")` | `saveFailed` into the row, with finally | yes |
| `/expenses` | whole page replaced by the alert | none | yes |
| `/mileage` | `loadError` apart (fixed in audit-components) | Save fine; Work it out showed "Load failed" (**F10**) | yes |
| `/recurring` | `loadFailed` in the form's one `error` | `saveFailed`, explicit resets | **no**: Clear and Add wiped it (**F3**) |
| `/files` | `loadFailed("your documents")` | extra pages swallowed (**F11**); a failed file told the email box "nothing to send yet" (**F11**); Save these showed pdf-lib's words (**F13**) | yes |
| `/clients` | `loadFailed("your contacts")`; profile read silent | `saveFailed`; a merge that worked said it failed (**F7**) | yes |
| `/clients/new` | profile read silent | `saveFailed`; the contact scan could show a status code (**F21**) | n.a. |
| `/clients/[id]/statement` | `loadFailed("the statement")` | Copy the figures said Copied regardless (**F8**) | yes |
| `/quotes`, `/quotes/requests` | `loadFailed` | none | yes |
| `/quotes/new`, `/quotes/requests/new` | `loadFailed(..., "reload the page.")`, no form | `saveFailed` | n.a. |
| `/quotes/[id]` | `loadFailed("this quote")`; link read swallowed (**F12**) | `run()` with each action's sentence; Copy link (**F8**); Turn into invoice could strand a claim (**F22**) | n.a. |
| `/quotes/requests/[id]` | `loadFailed("this request")` | `run()` with "Something went wrong." (**L3**); Copy link (**F8**); reading their quote showed "Load failed" (**F10**) | n.a. |
| `/i/`, `/q/`, `/r/` | `must()` throws, PublicLinkError with Try again (fixed in `517a74f`) | PDF_FAILED; Accept / Send prices told a customer about "your records" (**F23**); `/q/` fell back on any error (**F24**) | n.a. |

## Findings

**41 candidates came back from the readers. 25 are real and fixed below. 7 were real and are
left, each with the reason. The other 9 were not defects once read**: a deliberate
fire-and-forget, a cosmetic blank, a migration-state edge, or the forbidden pattern by the
letter only.

### Fixed

- **F1** `receipts/page.tsx`: `?open=<id>` after a failed load said, in amber under the red
  error, "That receipt isn't here any more. It may have been merged into another one". Now
  only after a load that worked (`loadFailedNow`).
- **F2** `receipts/new/page.tsx`: the lists' load error sat in the form's one `error`, which
  attaching the photo cleared. **The duplicate-receipt check then ran against `[]` with
  nothing on screen to say so**, and the supplier box offered every saved supplier as a
  Companies House row. The load error is now its own line (`listsError`), and Save loads the
  saved receipts first when they never loaded, or says the check couldn't run.
- **F2b** `ContactField.tsx` (receipts/new, invoices/new and /scan all use it): adding from
  the register now asks for the saved list again first and picks the one already there.
  `contacts` is whatever the page loaded, which is `[]` after a failure, so **adding made a
  second copy of a supplier they already had**. This is the same defect audit-components
  fixed on /scan's own button, but in the shared component.
- **F3** `recurring/page.tsx`, `recurring/invoices/page.tsx`: Clear form or Add wiped the load
  error, and the list then said "No recurring expenses set up yet". Or it showed only the new
  one, so the real ones looked gone and got added again, which means "Log it" twice on the
  day. `loadError` is now apart, in the list, and gates the empty state.
- **F4** `invoices/[id]`, credit note: inserted, then the status update dropped, and it said
  "Couldn't save credit note." under the new note. **That invites a second credit.** It now
  says it's saved but the status couldn't be updated, as Add payment already did.
- **F5** `invoices/[id]`, credit note removal: deleted, then the status update dropped, and it
  put the note back on screen. That array feeds the PDF and the email, so it would **print a
  credit that no longer exists**. The removal and the status are now apart.
- **F6** `invoices/[id]`, payment removal: deleted, then the re-read dropped, and it said
  "Couldn't remove the payment." with it still listed. The two are now apart.
- **F7** `invoices/[id]` Send and `clients` Merge: the change worked, then the read-back
  dropped. Send said "Couldn't mark this invoice sent" over a draft that was **already
  issued, with its number**. Merge said "Couldn't merge those two" under a card still
  offering the merge. Both now say it went through and to reload.
- **F8** Copy says "Copied" only when it was. On the invoice and quote pages the write follows
  network calls, so on an iPhone the tap has usually expired and the write is refused: the
  person **pasted nothing into WhatsApp**. Fixed for invoice link, quote link, request link,
  statement figures and Settings' email-in address. Settings' had no rejection handler at
  all and did nothing. Same shape as /vat's earlier fix.
- **F9** `invoices/new` scan-a-document: a bare `res.json()`, so a platform timeout page
  showed "The string did not match the expected pattern."
- **F10** `mileage` Work it out, and `AnswerEntry` reading a supplier's quote: both sent a
  fetch error through `errorText`, so offline the screen said just **"Load failed"**.
- **F11** `files`: the extra pages' failure was swallowed. Page 2 then said "Loading page…"
  for good, and **Save made a one-page PDF of a three-page document** with nothing said. Now
  it shows "Couldn't load this page" with Try again, refuses to save short, and the email
  form gets the failure (PDF_FAILED) instead of "There's nothing to send yet." under a
  document that was on screen. A previous document's "Saved as …" no longer carries over.
- **F12** `invoices/[id]`, `quotes/[id]`: a failed link read was `.catch(() => null)`, drawn
  as "no link yet". "Opened 3 times" and "Accepted online by …" disappeared, and on a
  declined quote the whole card went. It's now said, and the quote's focus refresh keeps
  the link it had.
- **F13** `SaveThese`: pdf-lib's and Safari's words ("Importing a module script failed.")
  reached the screen through `saveFailed`. The file builder's throw is now said plainly.
- **F14** `feedback`: a send wiped the history's load error, and "Previously sent" then read
  as the whole history. The load error is now its own line under that heading.
- **F15** `reset-password`: a dropped connection read as "That link has run out … Ask for a
  new one". It now says "No signal just now", with Try again. A throw that isn't an auth
  error no longer leaves "Checking your reset link…" up for good.
- **F16** `settings` + `lib/logo.ts`: a dropped logo read said "No logo yet" with "Add a logo"
  for somebody who has one. And logo.ts **cached the failure for the session**, so every PDF
  made on that page went without the logo. The failure is no longer kept, and Settings says
  the logo is saved but couldn't be shown.
- **F17** `lib/push.ts`: turning notifications on showed the browser's DOMException
  ("Registration failed - push service error"). "Notification permission wasn't granted"
  now says how to allow it. The push-state read has a rejection handler.
- **F18** `settings` Email me a sign-in link: no try/finally, so a non-auth throw left
  "Sending…" stuck.
- **F19** `copy` Share: every failure was swallowed, not just closing the sheet. On an iPhone
  a long PDF build outlasts the tap and the sheet is refused, so **nothing happened at all**.
- **F20** `/scan`: its load failures used `saveFailed` (no connection advice for a non-network
  error; a 42501 said "isn't allowed to do that" about a load). Now `loadFailed`.
- **F21** `/api/scan`, `/api/contact-scan`: "Scanning isn't configured yet: GEMINI_API_KEY is
  missing on the server." reached the person as written. The key name now goes to the
  server log. `scanClient` and the contact scan no longer say a bare status code.
- **F22** `quotes/[id]` Turn into invoice: the payment-terms read sat between the claim and
  its release. A drop there left the quote claimed with nothing made from it.
- **F23** `/q/` Accept and `/r/` Send prices: **a customer with no account was told "Couldn't
  reach your records."** New `customerFailed()` in `errorText.ts` says "That didn't get
  through: there's no connection just now."
- **F24** `lib/publicQuote.ts`: the old-column fallback ran on *any* error, so one dropped read
  followed by a good one priced the Accept button by today's VAT setting, not the snapshot
  the quote went out under. CLAUDE.md says that must never happen. It now falls back only on
  42703 (missing column). `test-public-reads` has a new check, proved to fail on the old
  code; its missing-column case now sends the real code.

### Left, with why

- **L1** `invoices/[id]` Save draft / Mark paid in full: a re-read that drops after a good
  write says it failed. **Retrying is harmless**: the draft is the same, and the next Mark
  paid reads nothing owed. Not worth splitting.
- **L2** `invoices/[id]` Send: after a read-back failure the page still shows the draft until
  reloaded, which the message says to do. Showing it as sent would mean inventing the number.
- **L3** `quotes/requests/[id]` `run()`: "Something went wrong." is the fallback for eight
  actions. A dropped connection already gets the connection sentence; only a database code
  `saveFailed` doesn't know lands here. Fixing it means a sentence per call site, which is
  wording, not this brief.
- **L4** `quotes/requests/[id]` and `AnswerEntry` "Their quote document": `window.open` after
  an awaited signed URL is likely dropped by iOS's popup blocker, so nothing opens. That's
  not a network failure and **needs the iPhone to confirm** before changing.
- **L5** `quotes/[id]` "Put it back to accepted" always restores accepted, even for a quote
  that was sent. That's a state-machine question, not a failure path.
- **L6** `clients/page.tsx`: a failed profile read is silent, so drafts in Payment history are
  priced ex VAT and "Send a text" has no business name. It's a small screen-only figure; an
  error line on the contacts list for it would be louder than the harm.
- **L7** `InviteCard`: says "Couldn't share it." when somebody just closes the share sheet.
  That's off by default (`NEXT_PUBLIC_INVITES`), and the opposite of a swallowed failure.

### Not defects

- `quotes/[id]` background refresh and orphan relinks `.catch(() => {})`: deliberate, and
  the next load says it.
- `/i/` view ping `.catch(() => {})`: fire-and-forget on purpose.
- `PaidCelebration`: drops only the "£X this month" line.
- Money, after a failed Mark paid: the empty "Owed to you" is blank, not a false claim.
- The invoice list's quick Mark paid with a dropped status update: the next press reads
  nothing owed.
- Settings' logo `err instanceof Error && /picture/` passes only logo.ts's own two sentences.
- Dashboard email-in address `save()` returning false: only before migration-029, which ran
  on 2026-09-20.
- `AddressFields` and `VatNumberInput` bare `res.json()`: inside a try whose catch never
  shows the error. They're allow-listed in the guard.
- `/scan` reading twice after a mid-read lists failure: it spends a scan, but the person
  pressed Try again. That's a scan-budget question, not a failure path.
