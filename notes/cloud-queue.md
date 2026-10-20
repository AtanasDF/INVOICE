# Cloud session queue

**$250 of cloud-session credit, unspent, expires 7:59 AM GMT on 5 November 2026.** It applies
automatically to cloud sessions and **does not come out of the weekly plan limit** — which hit
94% on 26 September, so this is a second tank, not a luxury.

Atanas, 26/09/2026: *"I'll just use it for when you tell me. Make sure we use it all so we
don't waste it."* So the prompting is on whoever is working with him: tell him to start one,
and hand him the brief. He should not have to think of the work.

**How he starts one:** the cloud/remote option when starting a session (from the phone:
claude.ai/code in the browser, or the Claude app). Then paste a brief below.

**Set up 2026-10-09, before he logged the app out of his Mac.** From the phone the only
thing that must be true is that **claude.ai/code can see the `AtanasDF/INVOICE`
repository** — a cloud session clones it, works on a `wip/` branch and pushes. His Mac
is not involved and does not need to be awake. Everything was pushed first (`b1d4a0b`),
so a cloud session starts from a tree that matches what is live.

**The first thing any such session should read is `notes/handover.md`**, whose top
section is written for exactly this case and lists what a cloud session does NOT have.

**What a cloud session has:** the repo, and nothing else. No `web/.env.local`, so no live
database, no API keys, no Companies House or HMRC calls. No his-Chrome, so no Supabase SQL
editor. No iPhone. No browser suites — they need Chrome at a macOS path and ~770 MB of
generated camera clips. It works on a branch and pushes; the merge is reviewed here.

**So every brief below needs only the repo.** Each says what to read, what counts as a finding
and what to leave alone, because the expensive failure mode is an agent that wanders.

Tick them off as they are used. If the list runs dry before the credit does, add more.

---

## 1. The component layer, which nothing has ever audited — [ ]

```
Read CLAUDE.md at the repo root first, then audit web/src/components
(every file) and the components under web/src/app. Nothing has ever examined this
layer as a whole.

Report ONLY defects you can point at with file:line and state as a concrete failure:
specific state or input, and the specific wrong outcome a person would see. Look for:
a button that acts twice because it guards with `disabled` rather than a ref (CLAUDE.md
explains why that is wrong); a list whose empty state can stand in for a failed load;
an error path that uses `err instanceof Error ? err.message : "..."` instead of
loadFailed/saveFailed; anything that removes a record without a window.confirm naming
what goes; a hard-coded hex colour; text that would be invisible in dark mode or on
the black camera screens; and any money or date arithmetic done in a component rather
than in src/lib.

NOT findings: style preferences, missing tests for correct code, "could be clearer",
or anything needing a condition that cannot occur. Say so if a file is clean.

Write the findings to notes/audit-components.md, commit on a branch and push. Do not
change any behaviour.
```

## 2. The file converter — [x] 2026-10-20, `wip/converter-audit`: 20 found and fixed, `notes/audit-convert.md`

```
Read CLAUDE.md, then audit web/src/lib/convert.ts and web/src/app/convert/page.tsx.
This turns people's own files into other formats entirely on the device: pictures to
PNG/JPEG/WEBP/PDF, several files into one PDF, a PDF into pictures or its words, and
spreadsheets into other shapes. It has never been audited.

Answer with file:line: what happens to a file that is not what its extension claims;
a PDF that is encrypted, corrupt, or 500 pages; a 200 MB image; a spreadsheet with a
formula, a formula injection (=cmd), or a million rows; a filename carrying a path or
a newline. Does anything block the main thread long enough to freeze the page, and is
there any way a conversion silently produces a file with missing content rather than
failing? Confirm nothing is uploaded anywhere.

Write findings to notes/audit-convert.md with a concrete failure for each, commit on a
branch and push. No behaviour changes.
```

## 3. What the 47 stale suites actually duplicate — [x] (2026-10-20, `notes/suite-map.md`, branch `wip/stale-suites`)

```
Read harness/README.md and CLAUDE.md. harness/test-suites-report.mjs tracks which
suites run; a number of suites on disk are superseded copies of others and nobody has
ever said WHAT each one duplicates.

For every test-*.mjs in harness/, produce one line: what it covers, which suite (if
any) now covers the same ground, and whether anything in it is covered nowhere else.
The last column is the only one that matters — a superseded suite holding one unique
check is a hole waiting to open when somebody deletes it.

Write it as a table in notes/suite-map.md, newest information first, and list at the
end any check that exists in exactly one place and would be lost. Commit on a branch
and push. Do not delete or edit any suite.
```

## 4. Money, everywhere it is not yet generated — [ ]

```
Read CLAUDE.md and harness/test-money-invariants.mjs, which attacks invoices and
deposits by generating thousands of them rather than picking examples.

Extend the same treatment to the three money paths it does NOT cover:
src/lib/statement.ts (a customer's statement), src/lib/vatReturn.ts (the quarter's
boxes 1/4/5/6/7, both bases) and src/lib/quoteCompare.ts (comparing suppliers' prices,
including the split-order maths).

For each, work out what must be true of EVERY case, not a chosen one, and assert that:
totals that must reconcile, figures that must never go negative, a quarter's boxes that
must add up, a split that must never cost more than the best single supplier. Measure
any tolerance rather than assuming it, and say in a comment how it was measured --
test-money-invariants' deposit section shows the form.

Run it (these are pure logic, no server needed: compile with tsconfig.logic.json the
way run-all.sh does). Add the suite to run-all.sh. Commit on a branch and push.
```

## 5. Offline, and the service worker — [ ]

```
Read CLAUDE.md, then audit the service worker and everything about being offline:
find it with grep -rn "serviceWorker\|self.addEventListener" web/src web/public.

Answer with file:line: what exactly is cached and for how long; whether a stale cached
bundle can outlive a deploy (and how somebody would get out of it); what happens to a
scan, an invoice or a receipt written while offline; whether /offline is shown in the
cases CLAUDE.md says it should be; and whether any private data (a receipt photo, an
/i/ token, an invoice) ends up in a cache that outlives sign-out.

That last one is the important one. Write findings to notes/audit-offline.md with a
concrete failure each, commit on a branch and push. No behaviour changes.
```

## 6. Every screen with the network taken away — [x] (2026-10-20, `wip/network-off`: notes/audit-failure-paths.md; 25 fixed, 7 left)

```
Read CLAUDE.md, especially the house style on loadFailed/saveFailed and empty states.

For every page under web/src/app, trace what a person sees when its load fails and
when its save fails. Produce a table: page, what it shows on a failed load, what it
shows on a failed save, and whether the empty state is gated on `!error`.

Report as findings only the ones that are actually wrong: an empty state that can
stand in for a failure ("No invoices yet" when the load failed), a save whose failure
is swallowed, a message that shows a raw Supabase or Postgres string, or a screen that
leaves somebody stuck with no way forward. CLAUDE.md's section "When somebody meets a
wall" is the standard.

notes/audit-failure-paths.md, branch, push. No behaviour changes.
```

## 7. Dead weight — [x] (2026-10-20, `notes/dead-weight.md` on `wip/dead-weight`)

```
Read CLAUDE.md. Find everything in web/src that nothing uses: exported functions with
no caller, components never rendered, constants never read, files imported by nothing,
and dependencies in web/package.json that no import mentions.

Check each one twice before listing it -- a dynamic import, a string route, or a
harness suite counts as a caller, and CLAUDE.md's rule 1 means nothing is deleted on
suspicion.

Write notes/audit-dead-code.md: one line each, with the evidence that nothing calls it
and how confident you are. Propose, do not remove. Branch, push.
```

## 8. The printed document, every shape it takes — [ ]

```
Read CLAUDE.md on how a document leaves the app (Save as, seven shapes) and audit
src/lib/invoicePdf.ts, src/lib/documentPdf.ts, src/lib/sheetFile.ts and
src/lib/saveFile.ts.

The rule those files exist to keep is that all but the PDF and the pictures are read
off the PRINTED SHEET, so no screen keeps its own copy of the totals. Check it holds,
with file:line.

Then: what happens with a very long business name, a client name carrying < or &, an
invoice with 200 lines, a zero total, a negative line, a missing logo, a name in a
non-Latin script? Does any shape lose a figure the PDF shows -- particularly CIS, the
reverse-charge wording, or a deposit deduction? Is anything escaped in one shape and
not another?

notes/audit-documents.md, branch, push. No behaviour changes.
```

---

Briefs 9-12 were added 2026-10-20. Each one starts the same way: read CLAUDE.md, then
notes/handover.md ("If you are a cloud session"), then the top of SESSIONS.md. Push only to
the wip/ branch the brief names, never to main. Finish with a SESSIONS.md entry and the
browser suites the Mac must run, then push.

## 9. Every API route — [x] (2026-10-20, `wip/api-routes-audit`: notes/audit-api-routes.md; 4 fixed, 8 left)

```
Audit every route under web/src/app/api. For each one, record: who may call it (stranger,
signed in, cron secret, service role); whether that is enforced before any expensive or
outward work; the rate limit; the body size limit; whether an error can leak a provider's
or Postgres's raw text, a stack trace or a secret; whether a service-role query is scoped
to the caller's own rows; and whether it sends email or calls a paid API without a cap.
Cross-check the harness guard lists. Confirm each finding in the code, fix the confirmed
ones minimally (routes and server-side lib only), and add a source-reading or logic suite
that fails if each hole comes back. tsc, eslint and build clean; the build needs
placeholder NEXT_PUBLIC_SUPABASE_URL and keys in the cloud. Table in
notes/audit-api-routes.md. Branch: wip/api-routes-audit.
```

## 10. SQL functions and RLS — [x] (2026-10-20, `wip/sql-audit`: notes/audit-sql.md; 3 holes, migrations 043-045 written, NOT run)

```
Read every file in web/supabase/ in order (latest: migration 042 and backup 017, both run
on 20/10). Audit: SECURITY DEFINER functions without a fixed search_path; execute grants
that leave out `authenticated` or `anon` in the revoke (Supabase grants by default; 037
had this hole); tables without RLS or with weak policies; FK checks that let one user
reference another's row (017, 038); `current_date` where uk_today() belongs; functions
that trust an argument they should take from auth.uid(). Prove SQL against pglite the way
harness/test-migration-042.mjs does. You can't see the live database, so say when a
finding depends on it. For each real hole, write migration 043 onward with backup 018
onward, exactly as hard rule 2 says. Never claim they ran. Report in notes/audit-sql.md.
Branch: wip/sql-audit.
```

## 11. The email-inbox Worker — [x] (2026-10-20, `wip/worker-audit`: notes/audit-worker.md; 10 found and fixed, NOT live until `wrangler deploy`)

```
Audit worker/, the Cloudflare Worker that takes emailed receipts for invoiceover.com to
/api/inbox/ingest. Look for: email dropped silently instead of rejected to the sender
(1564983 fixed one); size limits, attachment counts and MIME edge cases (octet-stream PDF,
inline images, nested multipart, non-UTF-8 subject); the shared secret and how a forged
call is refused; the app down or slow; whether the types still match the route
(harness/test-inbox-worker-types). Fix confirmed findings in worker/ only, with tests that
run without Cloudflare. Nothing under worker/ is live until Atanas runs
`npx wrangler deploy` on his Mac: say so at the top of the report and list what would
change for a sender. Report in notes/audit-worker.md. Branch: wip/worker-audit.
```

## 12. iPhone Safari, a report — [x] (2026-10-20, `notes/ios-safari.md` on `wip/ios-safari`)

```
Atanas uses the app almost entirely in iPhone Safari; the harness is desktop Chrome. List
everything in web/src that behaves differently or breaks in iOS Safari or as a home-screen
app: beforeunload (check draft autosave in lib/formDraft.ts covers the forms), date and
number inputs and decimal commas, storage in private mode and Safari's 7-day eviction,
100vh and safe areas, position:fixed with the keyboard open, file inputs and capture,
getUserMedia and ImageCapture, Web Share with files, downloads, window.open or clipboard
after an await, push (16.4+, home screen only), service-worker cache limits, 200% text.
For each: where in the code, what he would see, how sure, the fix, and whether only a real
iPhone can confirm it. Change no app code. notes/ios-safari.md, worst first, with a short
"try these on the phone" list at the top. Branch: wip/ios-safari.
```

## 13. iPhone Safari fixes: forms, inputs and layout — [ ]

```
Read notes/ios-safari.md first. Fix findings 1, 2, 5, 6, 20, 21, 22 and 23: tapping a box
zooms the page (16px rule for form controls), the receipt line price that drops a decimal
point, the Feedback pill drawn over overlays, the forms that keep work only in memory
(extend the draft autosave in lib/formDraft.ts and lib/useFormDraft.ts where it fits; never
store photos), no way back in the home-screen app, larger text running off the screen,
landscape padding (safe areas), and the keyboard with fixed bars and no scroll lock behind
overlays. Confirm each in the code first. Stay in CSS, layout components and the form
pages: two other sessions are changing the camera/scan code and the share/download code.
Add source-reading guards (like test-no-hardcoded-colour) so each fix can't silently come
back, and list the browser suites the Mac must run. Branch: wip/ios-forms-layout.
```

## 14. iPhone Safari fixes: the camera and scanning — [ ]

```
Read notes/ios-safari.md first. Fix findings 3, 4, 14, 15 and 16: an interruption (iOS
`mute` on switching app) tears the camera down and asks for permission again; unsaved scan
readings lost on any navigation or reload; choosing many photos at once can crash the
tab; canvases never released and a blank page can be saved; the capture watchdog
dropping a shot while the still is taken. Read CLAUDE.md's camera section carefully: camera
permission goes only through src/lib/camera.ts, and the batch scanner has a known
double-capture bug (notes/batch-rearm.md) that you must NOT try to fix here -- it needs the
camera suites on the Mac. Stay in DocumentCapture, the scan page, scan handoff and lib
helpers. Readings kept across a reload must be personal storage keys classified in
lib/accountSwitch.ts. Put the rules in lib with logic suites; list the camera and browser
suites the Mac must run (test-far, test-autozoom*, test-conditions, test-batch-*).
Branch: wip/ios-camera.
```

## 15. iPhone Safari fixes: files, sharing, downloads and links — [x] (2026-10-20, `wip/ios-files-share`: notes/ios-files-share.md; 13 findings fixed, a few small ones handed on)

```
Read notes/ios-safari.md first. Fix findings 7-13, 17-19, 24 and 25: push instructions
never shown in a Safari tab, "press Copy link again" that can never work, CSV/JSON exports
revoked before Safari saves them, downloads in the home-screen app, the receipt photo box
that opens only the camera, the first Share press doing nothing, a supplier's document
that silently fails to open, the 7-day storage eviction (say so where it matters), the
home-screen app and Safari being separate (sign-in and drafts), his own opens of a customer
link pushing "your customer opened it", the offline page stuck on Loading, and the smaller
items. Confirm each in the code first. Remember src/lib/saveFile.ts is the only place a
file is handed to the device. Stay in save/share/clipboard/push/offline code and the
service worker: two other sessions are changing forms/layout and the camera.
Branch: wip/ios-files-share.
```

Briefs 13-15 come from the Safari report. They can run at the same time; merge them on the
Mac in the order 13, 15, 14, and run the camera suites before 14 goes in.

## 16. Do the help pages still tell the truth? — [x] (2026-10-20, `claude/brief-16-cloud-queue-hrozjb`: notes/help-truth.md; 20 fixed, /privacy was wrong about Anthropic, 3 left)

```
Read CLAUDE.md (the help chat in the environment section). The help ladder is
src/lib/helpPrompt.ts (HELP_JOURNEYS), src/lib/helpFacts.ts (a hand-written line per
page), the walkthroughs on /help, the Tips (src/lib/tips.ts and the Tip texts), and the
public articles (/how-to-invoice, /privacy, /terms, /security, /accessibility). Since they
were written, a lot changed: Gemini became the default reader, scan limits went live,
draft autosave, quote send times, the email Worker now bounces mail, the plan can't be
changed by an account, the iPhone notes in notes/ios-safari.md. For every sentence that
states a fact about the app, check it against the code. List what is now false, missing
or misleading, and fix the wording -- only those text files and the help pages, nothing
else. Keep the house words (test-govuk-words, test-vocabulary, test-plain-words must stay
green) and the "say when it does not know" rule. If /privacy's description of what is
stored changed, say so loudly in the report: that page has its own rule in CLAUDE.md.
Report in notes/help-truth.md. Branch: wip/help-truth.
```
