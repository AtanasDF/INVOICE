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
13. **Production error reporting.** If something throws on somebody's phone,
    nobody finds out. 3,386 passing checks cannot tell us that. Half a day.

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
22. **Say which engine read a document**, so a slow read is never invisible.
23. **Time-box a read and fall back** — give up at ~20s rather than hang for 71.
24. **Warm OpenCV wherever a Scan link exists**, not only the dashboard.

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
