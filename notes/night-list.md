# The night list — 23/24 September 2026

Atanas: *"i want a big list — a lot of testing and fixing"*, and
*"check how other apps are doing it and do it better and more accessible for users."*

Worked top to bottom. Every fix gets a check that **fails without it** — tonight proved
why: two checks were found passing for the wrong reason, and one suite was reporting
`{"passed":6,"total":6}` while dying at check 7 of 13.

Rule for the night: **a green suite must have earned it.**

---

## A. The checks that lie (highest value — do first)

Two vacuous checks turned up by accident tonight. With ~2,250 checks, there will be more,
and a check that cannot fail is worse than no check: it buys false confidence.

1. **Make `run-all.sh` able to tell a finished suite from a dead one.** The summary counts
   what *ran*, so dying half way reports `passed == total`. Each suite should declare it
   reached the end, and the runner should flag any that didn't.
2. **Mutation sweep.** For each of the ~124 suites, break the thing it claims to test and
   confirm the check goes red. Automate what can be automated: flip a string in the source,
   re-run the one suite, expect a fail. Anything still green is a lie — list it.
3. **Substring traps.** Grep every suite for `.includes("` on short strings and check none
   can match something else (`"+ Add"` matched `"+ Add a customer"`; `/blocked/` matched
   nothing at all in the old wording and so always passed).
4. Fix or delete everything the sweep finds.

## B. Finish the suites that exist and don't run

5. `test-settings-add` — 27 of ~30 then dies looking for "+ Add" on `/invoices`, which a
   fresh visit definitely has. Find where it actually is and fix it.
6. `test-deposits` — 15 s wait times out; the screen moved under it.
7. `test-free-quote` — "no button: Start a quote"; the chooser changed.
8. `test-quote-requests` — imports fixed; settle whether the 120 s wait is the suite or a
   loaded Mac, on a quiet one.
9. `test-quotes-ux`, `test-quotes-fixes` — written against a branch long merged: rewrite
   against the current screens or say plainly they should go.
10. `test-address-signed` — obsolete (waits for the old address finder). **Flagged for
    deletion; needs Atanas's word** (hard rule 1).

## C. The four questions, applied to every screen left

Tonight they found five real bugs on the screens they were asked of. The rest have never
been asked. For each: does a machine's words ever reach a person; is a once-only action
guarded only by `disabled`; does any state outlive what it describes; is there a way on
after it succeeds *and* after it fails?

11. Receipts → Needs review
12. Clients & suppliers, including the merge (it repoints invoices, receipts and quotes)
13. VAT return page
14. Mileage
15. Expenses
16. Recurring invoices and recurring expenses
17. Customer statement
18. Quote requests (`/quotes/requests`) — the owner's side
19. Settings

## D. Empty and overloaded

20. Every page above with an account that has **nothing** in it — the state every account
    is in for its first ten minutes.
21. Every page above with **500 records** — a busy year, not a stress test.
22. Every page with a **failed database read**: the empty state must never stand in for a
    failure, and the failure must say what to do.

## E. Money, which has to be right

23. CIS + VAT + credit notes + deposits in combination, at the penny.
24. A part-paid invoice that is then credited, and the other way round.
25. VAT quarter boundaries on both bases, against `todayISO()` in Europe/London.
26. The tax card when the year has CIS deducted and a credit note against it.

## F. Better than the others, and easier to use

Driven by tonight's research into how QuickBooks, Xero, FreeAgent, Wave, Zoho, SumUp,
Square, Invoice2go, Bookipi, Tide and Dext actually behave on a phone, and by WCAG 2.2 AA
plus the GOV.UK guidance on plain English. Findings land in
`notes/competitor-research.md` and `notes/accessibility-spec.md`; the work they justify is
listed there and pulled into this file as it is decided.

27. **Accessibility pass with numbers, not opinions**: tap-target sizes, contrast (already
    measured once — keep it measured), text resize to 200%, focus order, focus after
    navigation, labels and `autocomplete` tokens on every input, live regions for the
    things that change without a page load.
28. **Plain-English pass** with a measurable reading age, not a feeling.
29. The specific things the competitors do better, built — chosen for user value over
    effort, not for novelty.

## G. Leave it tidy

30. Full harness green on a quiet machine, everything committed and pushed, `SESSIONS.md`,
    `notes/queue.md` and `CLAUDE.md` current, and this file marked up with what actually
    happened.

---

## Not on this list, and why

- Royal Mail house numbers — costs money, `notes/house-numbers-decision.md`, his call.
- The paywall, the app stores, the offline scan queue — waiting on decisions or an iPhone.
- Anything that needs his trading name and address.
