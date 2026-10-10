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

## 2. The file converter — [ ]

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

## 3. What the 47 stale suites actually duplicate — [ ]

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

## 6. Every screen with the network taken away — [ ]

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

## 7. Dead weight — [ ]

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
