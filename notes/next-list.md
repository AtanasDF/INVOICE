# What's left that I can do — 2026-09-25

Atanas asked for the list. Drawn from `notes/queue.md`, `notes/backlog.md`,
`notes/future-ideas.md`, `notes/launch-plan.md` and `notes/help-chat-design.md`, with each
item checked against the code rather than taken from the note — several notes were stale
(Jobs is built; every screen has its Tip; migration-036 has been run) and those are marked
below rather than listed as work.

Nothing here needs a decision from Atanas unless it says so.

## A. Real, and I would start here

1. **Walk the dashboard's first tile as a signed-in person.** `src/app/page.tsx:496` sends
   "Make an invoice" to `/free-invoice?start=photo` — a path built when strangers could use
   the free page. Queue item 7 has been open since then and nobody has walked it signed in.
   It is the app's main action, so if it ends anywhere other than a saved invoice in the
   account, that is the most expensive bug left in the app. **Verify first, fix if needed.**

2. **Extend the mutation testing to everything built since it was written.**
   `harness/mutate.mjs` breaks eight things and all eight are caught, but it predates the
   reverse charge, CIS-on-quotes, the VAT checks, the scan wall's wording, the photo-ageing
   rules and the help chat's fences. The suites for those have only been mutation-tested by
   hand, by me, on the day. A suite nobody has tried to fool is a suite of unknown value.

3. **A suite that checks a suite can report.** Today four suites were reported CRASHED in
   every full run while passing alone, because `run-one.sh` finds a result by grepping for
   `{"passed":N,"total":N}` and they printed only a friendly `26/26 passed`. One suite
   reading every name in `run-all.sh` and checking it prints that line would have caught it
   the first time. Cheap, and it closes a hole that hid four suites for a day.

4. **A live pass over every page, signed out, against production.** Launch-plan week 3.
   The harness runs against a mocked database; nobody has clicked through the real thing
   as a stranger since the front door changed.

## B. His brief, and the only rung not built

5. **Rung 1 of the help ladder: the first sign-in.** His words were "everything should be
   explained — first when they log in, every time they click on a page explained once, then
   when they click on help..." Rungs 2 (Tips), 3 (walkthroughs), 4 (the chat) and 5 (email)
   are all built. Rung 1 is a single `Tip` called `dashboard-welcome` and no walkthrough.

6. **More walkthroughs.** There are four — invoice, receipt, VAT, mileage — against about
   twenty pages. **Scanning and quotes are the app's headline features and neither has one**,
   which is also why the chat has to say "I do not know about that part" so often. The frames
   record themselves (`harness/record-help.mjs`), so these do not rot.

7. **Log what people ask the chat.** `notes/help-chat-design.md` is right that it is the
   honest measure of what the walkthroughs failed to explain. Needs a small migration
   (`help_questions`, insert-only, RLS), which I can write; running it is the usual
   two-file, verify-by-content job.

## C. Tidying that is worth the time

8. **Two `addDays`, two implementations.** `reminderTemplates.ts` anchors at
   `${iso}T00:00:00Z` and does UTC arithmetic; `freeInvoiceDraft.ts` builds a local-time
   Date from the parts. **Checked: neither is wrong** — London's DST moves at 01:00, so
   local midnight always exists — but two functions of the same name doing the same job
   different ways is how the next person picks the wrong one. One of them should go.

9. **`CurrencyCode` in `fx.ts`** is an unused export, found by `ts-prune` and flagged rather
   than removed under rule 1. It is a type, not data. Removing it needs Atanas's word.

## D. Not mine to do

10. **The offline scan queue.** Needs an iPhone to test against, and a caching service worker
    shipped untested against real Safari loses captures rather than keeping them.
11. **The paywall and Stripe.** A design conversation first; no paid tier is built and he has
    said everyone is free for now.
12. **The app stores.** Four to eight weeks of their own, and Apple's in-app-purchase rule
    plus its in-app-account-deletion demand fights `CLAUDE.md` rule 1. To settle before any
    wrapper is started.
13. **Radoslav's bug** — the first feedback from anybody outside, still unreproduced.
    Horizontal overflow was ruled out by measurement at every width from 1440 to 320, so it
    is a gesture, not the page. Needs one question to him: which screen, phone or trackpad.

## Waiting on Atanas (unchanged, collected here so it is in one place)

- **Settings → VAT registered OFF** on his own account. He is not VAT registered; with it on
  his invoices add VAT he cannot legally charge. The most urgent of these.
- The **UTR letter**, ~15 days by post, finishes the HMRC production application.
- A **trading name and address** for the privacy and terms pages. Blocks launch.
- Business details in Settings on Hidefield.
- Print and scan the **106 test documents** (`harness/expected.json` is the answer key, so
  the readings can be scored rather than eyeballed).
- Whether the project leaves the **iCloud Desktop**.
- The **47 stale duplicate suites** in `harness/` — deletion, so his call.

## Stale notes corrected while writing this

- `future-ideas.md` calls **Jobs** the one of five not built. It is built: `/jobs`,
  `src/lib/jobs.ts`, `test-jobs` in `run-all.sh`.
- `help-chat-design.md` said **five screens still have no Tip**. Every screen has one, and
  `test-every-screen-explained` pins it.
- `queue.md` item 20 says **migration-036 has never been parsed by a database**. It has been
  run and verified.
