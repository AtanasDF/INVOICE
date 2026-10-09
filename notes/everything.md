# Everything, in one list — 2026-09-26

The three lists merged: `next-list.md` (what was left), `atanas-2026-09-26.md`
(what he raised) and `tonight-2026-09-26.md` (tonight's work). Deduplicated,
with honest status. **This is the file to read first.**

Numbers are stable so they can be referred to. Nothing is marked done unless it
was verified, not just written.

---

## DONE (25–26 September)

| # | What | Found on the way |
|---|---|---|
| 1 | Walked the dashboard's main invoice path | It does not dead-end — but the Free page told strangers "no sign-in needed" while the gate turned them away |
| 2 | Mutation testing, 27 → 40 | The whole-run pass proved less than it looked; each new one had to be applied alone |
| 3 | `test-suites-report` — the harness checks itself | A suite running invisibly (81 checks), and six written-but-never-run suites; four were green, **77 checks** |
| 4 | Live signed-out pass over production | Every mistyped address bounced a stranger to `/login` with no explanation |
| 5 | Rung 1 of the help ladder | A new account was never told the walkthroughs existed |
| 6 | Two more walkthroughs (six now) | An unnamed `<select>` on `/receipts/review`, and the suite gap hiding it |
| 7 | `help_questions` — migration-040 run and verified | — |
| 8 | Four `addDays` became one | They disagreed on unparseable input; not a live bug, checked rather than assumed |
| 9 | Dark-mode walkthrough frames | **Every date field in the app was at 1.1:1 contrast in dark mode** — invisible |
| 10 | Setting up panel moved up the dashboard | It sat 1.8 screens down on a new account, below an empty file library |
| 11 | Harness made path-independent | 87 hard-coded paths across 39 files; the folder can now be moved |
| 12 | Scanner slowness measured | Gemini 5.1s median vs Claude 7.0s with a **71s** outlier, identical accuracy; and the shutter never actually waits |

---

## OPEN — mine, in the order I would do them

### First, because it changes what we can even know
13. ~~**Production error reporting.**~~ **DONE — and it was already done.** Built
    26-27/09 (`src/lib/reportError.ts`, `ReportErrors.tsx`, `/api/error`,
    `test-error-report`); this list simply never got ticked, and on 09/10 I
    started rebuilding it before reading the source. It needs no table: every
    report reaches the Vercel log on one greppable `[app-error]` line and emails
    itself to FEEDBACK_TO, capped at one email per distinct fault per hour so a
    render throwing in a loop cannot mail itself hundreds of times. It is
    deliberately NOT signed-in only -- the failures worth hearing about most are
    the ones where somebody cannot get in.
    **The lesson is about the list, not the code: check the tree before building
    anything on this list.**

### What he asked for
14. ~~**Scan a document from a company that is not his**~~ **DONE.** Half already
    worked (the supplier box leaves on "No supplier / general expense" and makes
    no contact); the other half is `JustTheFile` on the scan walk — "Not yours?
    Just keep the file" turns the pages into a PDF on the device to save, share
    or email, with **no receipt row, no contact and no upload**. Before it, the
    only ways out of the walk were Save, which writes a receipt, and Skip, which
    threw the photograph away. `test-just-the-file` (19) pins the guarantee at
    the source: no store, no supabase, no fetch of its own.
    Original: — read it, send or
    download it, create no contact. `/copy` does most of it; the gap is reaching
    it from the scanner.
15. **Passkey / Touch ID sign-in**, and settle what "sends you to a different
    page" means. He tests the fingerprint at the end.
16. **Security pass** (his #5) — what one account can reach that is not theirs:
    every route, RPC and storage path as the wrong user.

### The sweeps that would have caught this week's bugs earlier
17. ~~**Name every control on every page.**~~ **DONE — it found 14.** `test-labels`
    covered 19 of 36 pages; the 15 reachable ones it had never opened held
    fourteen controls with no accessible name, announced to a screen reader as
    just "edit text" or "combo box": seven on `/scan` (company, contact, email,
    notes, document number, due date, date, category, total, VAT, currency), five
    on `/recurring/invoices`, two on `/feedback`. All named. 38/38.
    Original:
18. ~~**Contrast on every page in all six themes.**~~ **DONE — 30 pages × 6 themes,
    210 checks**, up from three pages. Two things came out of it, and neither was
    an app bug: my own input check counted DISABLED controls, which WCAG 1.4.3
    exempts by name, and it fired on Settings' VAT box in all six themes; and one
    run failed on /settings in grey with values that never returned, most likely
    a colour read mid-transition (160ms transition, 250ms settle). The settle is
    450ms now.
    Original:
19. **Keyboard-only** over `/help`, `/copy`, `/convert`, `/money`, `/jobs`.
20. **Every destructive confirm names what goes** — a house rule, never verified.
21. **Double-press every once-only action** — that bug has bitten twice.

### The scanner
22. ~~**Say which engine read a document**~~ **DONE (09/10).** `/api/scan` returns
    `read: {engine, ms, fellBack}` and logs it on one line even when the read
    failed, because "gave up after 25s having also tried the other engine" is
    the useful half of a failure. The scan page says so on screen when it
    mattered -- "That was slow to read, so the second reader finished it -- 31
    seconds in all" -- and nothing at all on a normal read, since a note on
    every scan is how a real one gets ignored. `readNoteText` deliberately
    states the time and stops: nothing has established whether a slow read is
    the photograph's fault or the connection's, and this app has shipped three
    sentences it could not back up already.
23. ~~**Time-box a read and fall back**~~ **DONE (09/10), and it was worse than
    the note says.** Nothing time-boxed a read AT ALL. Gemini carried a 40s HTTP
    timeout with two attempts, so eighty seconds plus backoff; the Anthropic
    client carried the SDK's own default, which is **ten minutes**, with two
    retries behind it; and the route allows 300. A read that went wrong did not
    fail, it hung. Now `src/lib/scanBudget.ts` gives every read a budget (25s
    for one photograph, a PDF counted as four pages, 100s ceiling so a read AND
    its fallback both fit inside maxDuration), `withDeadline` in
    `extractStructured` is the authoritative wall clock, and running out of time
    hands the document to **the other engine** once rather than giving up. Only
    for the two faults a second engine can answer -- out of time, or busy --
    because a document the model could not make sense of fails the same way
    twice and retrying it pays twice to learn nothing. 63 checks in
    `test-scan-budget`, all eight mutations of it proved red on their own.
24. ~~**Warm OpenCV wherever a Scan link exists**~~ **DONE (09/10).** The guards
    moved out of the dashboard into `src/lib/warmScanner.ts`, so the dashboard
    was no longer the only screen that warmed anything -- the scanner was
    instant from there and paid the full 13 MB wait from everywhere else, which
    is most places, because "+ Add" sits on every list and its Scan row is one
    tap. AddAnything's own comment already claimed it warmed the scanner; it
    prefetched the ROUTE, a few kilobytes of page code, and not the 13 MB the
    camera actually waits for. The claim is now true. Guards kept exactly:
    signed in, not the OS-camera path, has had the camera before, no data
    saver, not 2g.

### Money, which must not be wrong
25. **Print the hardest invoice**: CIS + reverse charge + deposit + credit note.
26. **Recurring dates across month ends** — the 31st, February, BST.
27. **Non-GBP receipts** — fx, rounding, VAT.
28. **Extend money invariants** to quotes and deposits.

### Edges nobody has looked at
29. **Inbox Worker end to end** — email in, needs-review row out.
30. **The emails themselves** — no unfilled placeholders, correct links.
31. **Public links** — no enumeration, guessing rate-limited.
32. **No secrets in the server logs.**
33. **Every route's auth and limits as one table**, so a missing fence shows.

### Trust the tests more
34. **Rehearse a restore.** 24 backup tables, never once put back.
35. **Run the RLS suites against a real Postgres.** The mock cannot enforce RLS,
    so every "somebody else's account" check is really testing the mock.
36. **Accuracy on all ten benchmark documents, both engines.** Three so far.
37. **Extend mutation testing** past 40 into the newest code.

### Tidying that pays for itself
38. **Duplicated helpers sweep** — `addMonths`, money formatting, date parsing.
39. **Report what each of the 47 stale suites duplicates**, so his decision is
    informed. Reporting is mine; deleting is his.
40. **The dashboard's 1.5 MB of JavaScript** — find what is in it.

---

## FOUND 2026-10-09, OPEN, AND IT IS THE MOST IMPORTANT ONE

59. **The batch scanner can photograph the same receipt twice.** A hand reaching
    across the page is enough: `harness/hand.mjpeg`, one document, ends with two
    scans about **3 times in 8**. It predates all of this work -- 6-7 in 8 with
    the page fingerprint disabled -- and was never seen because no clip of a
    SINGLE document had ever been run through batch mode. A duplicated receipt
    goes into the accounting record, which is worse than any missed document, so
    this outranks everything else on this list. **The root cause is now known,
    found by tracing after four hypotheses had failed:** auto-capture fires once
    the outline has been still for ONE tick by its own 9.6px tolerance, while the
    page fingerprint is only recorded after THREE ticks within 3px -- so
    `taken.print` is null for a real capture and every mechanism built on it is
    inert. All four experiments had been measured against a no-op.
    **The fix is to make auto-capture wait for the fingerprint's own stillness**,
    which guarantees a reference for every photographed page and removes the race
    instead of trying to win it -- and is a better photograph besides, since a
    receipt shot at `still=1` was taken before the lens settled. It changes
    capture timing, so it needs the camera suites (`test-far`, `test-autozoom*`,
    `test-conditions`, `test-fit-*`, `test-bent`, `test-tiles`) and is a session's
    work. The obvious alternative -- adopt a reference a moment after the shot --
    was tried and reverted: 4/4 clean while traced, 5 duplicates in 8 without the
    trace, because the trace's own overhead moves the timing. A fix that works on
    a quiet machine is not a fix. `notes/batch-rearm.md` has the trace and the
    measurements; `harness/trace-batch-capture.mjs` reproduces them.

## WAITING ON HIM

41. ~~**Settings → VAT registered OFF** on his own account.~~ **ALREADY OFF —
    checked 2026-09-26, and it had been all along.** Read from the live database:
    `fragov@hidefield.co.uk` (Hidefield, his real record) has `vat_registered =
    false` and 0 invoices. The account with VAT switched ON is
    `atanaschoo@gmail.com`, the **test** account — business name "PLACEHOLDER",
    VAT number `GB000000000` — which is a sandbox and does not matter.
    This was on the handover as the one urgent item and was repeated to him
    several times. It came from `notes/handover.md`, which said it needed
    checking; nobody had checked. **Reading the two rows took one query.**
42. **The file library's dates and layout** — he is designing it himself and will
    send pictures. Not to be touched until then.
43. **The UTR letter** (~15 days by post) finishes the HMRC production application.
44. **Move the project off the iCloud Desktop.** It broke `git fetch` on 25/09.
    The harness no longer stands in the way — move the folder, nothing else.
45. **The 47 stale duplicate suites** — a yes or no.
46. **`CurrencyCode`**, an unused export — removal needs his word (rule 1).
47. **A trading name and address** for the legal pages. Blocks launch.
48. **Business details in Settings** on Hidefield.
49. **Print and scan the 106 test documents** — `harness/expected.json` is the
    answer key, so the readings can be scored rather than eyeballed.
50. **Radoslav's bug** — needs one question put to him: which screen, and phone
    or trackpad?

---

## BLOCKED or DECIDED

51. **A real iPhone run.** Everything is headless Chrome and synthetic clips. The
    scanner, share, haptics and Safari's camera are all unproven on the device the
    app is built for. **The single biggest gap between "green" and "works".**
52. **Offline scan queue** — needs an iPhone to test against.
53. **Payments, and accounts talking to each other** — **decided: later.** Moving
    money is regulated and belongs in Stripe; making rows readable across accounts
    turns one RLS rule into a rewrite of every policy. `/i/` and `/r/` already do
    most of what it would buy.
54. **The paywall** — a conversation first.
55. **The app stores** — 4–8 weeks of their own, and Apple's in-app-purchase and
    account-deletion rules fight CLAUDE.md rule 1.

---

## How I work — three things today proved

56. **Break every check before trusting it.** Three vacuous checks surfaced; two
    were mine, and one would have been satisfied by deleting the feature it
    guarded.
57. **Read the log before naming a cause.** I blamed a stale `gen/` recompile for
    four crashed suites and wrote it into three files. The log was empty, which no
    module error ever is.
58. **Do not run anything beside the harness.** Dev servers and recompiles cost
    three crashed suites and about thirty minutes.

---

## FINALLY — four hours of testing, once the list above is done

His instruction, 2026-09-26: *"after you finish all this start with testing and
more testing for 4 hours straight."*

Written out so it is not improvised at 3am. The order is deliberate: the things
that have actually found bugs this week come first, and the harness run comes
last, because a green run is a floor and not a finding.

**Hour 1 — use it as a person, which is what keeps working.**
Every journey end to end, looking rather than asserting: sign up, set up,
scan, invoice, send, get paid, credit, quote, deposit, VAT quarter, mileage,
statement. Screenshots opened and read. Four of this week's real bugs came
from looking at a picture, not from a check.

**Hour 2 — the sweeps, everywhere rather than on three pages.**
Every page in all six themes for contrast, now that inputs are measured too.
Every control named, on all thirty pages. Keyboard only. 320 pt at twice the
text. Reduced motion. Each of these has a suite that covers part of the app;
the bugs were found in the part it did not cover.

**Hour 3 — money and the hostile edges.**
Property-based money invariants across invoices, credit notes, payments,
deposits and CIS together. The hardest invoice printed. Recurring dates over
month ends and the BST boundaries. Non-GBP. Two tabs on one record. A half
connection. Documents that fight back. Every route and RPC as the wrong user
and as anon.

**Hour 4 — judge the tests themselves, then the whole thing.**
Full mutation run, each new mutation proved alone rather than in the crowd.
Reading accuracy on all ten benchmark documents, both engines. Then the full
harness, then a live signed-out pass over production, and only then call it.

**The rule for the whole four hours:** anything that comes back green gets
broken on purpose before it is believed. Three vacuous checks turned up this
week and two of them were mine.
