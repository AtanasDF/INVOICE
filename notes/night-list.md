# The night list — 23/24 September 2026

Atanas: *"i want a big list — a lot of testing and fixing"*, and
*"check how other apps are doing it and do it better and more accessible for users."*

Worked top to bottom. Every fix gets a check that **fails without it** — tonight proved
why: two checks were found passing for the wrong reason, and one suite was reporting
`{"passed":6,"total":6}` while dying at check 7 of 13.

Rule for the night: **a green suite must have earned it.**

---

## A0. What Atanas asked for on the night of the 24th (built first)

These came after the list below was written. They are features, not repairs, and they go
first because he asked for them. Briefs in `notes/file-library-design.md`.

0.1 **[done]** **Swipe between the three dashboard panels.** Only the strip moves; header, scanner
    and tabs stay put. Follows the finger, gives at the ends, never steals vertical
    scrolling, as tall as the panel you are on. *(Component written, not yet wired.)*
0.2 **[done]** **Smooth movement everywhere else** — press feedback on buttons and tiles, a soft
    transition between pages. Both must honour "reduce motion", which the app currently
    respects in **zero** places (`notes/accessibility-spec.md`).
0.3 **[done]** **The file library, rebuilt**: title that opens the full library, a year/month/day
    roller under it, a button for a period of his own, and the documents themselves in a
    strip that slides sideways — about five on screen, big enough to recognise. Tap one to
    open it. Sits directly under the upload tile.
0.4 **[done]** **A segmented switch** on that strip: Receipts · Invoices · Quotes.
0.5 **[done]** **The upload tile, three buttons**: Photos · Files · **Email it in** — the last already
    built and currently buried in Settings, so it costs nothing but wiring and wording.
0.6b **[done]** **First-time explanations where there are none.** 24 tips now, every screen. He asked whether every click has a
    little explanation for new users. It is built -- `Tip`, shown the first few times a
    screen is opened, remembered per device in `tip:<id>` -- and there are **19** of them.
    But **five screens have none**, and one of them is the worst possible omission:

    | Screen | Why it needs one |
    |---|---|
    | **The invoice page** (`/invoices/[id]`) | The most complicated screen in the app: payments, part-paid status, credit notes, CIS deductions, reminders, the private link. No tip at all. |
    | **Settings** | Where the VAT switch, the bank details and the private import address live. |
    | **Recurring** (invoices and expenses) | Something that will act on its own later needs saying so. |
    | **Quote requests** | A whole feature -- asking suppliers to price a list -- with no introduction. |
    | **Feedback** | Least important, but free. |

    Not a tip on *every click*: that is how people learn to dismiss things without reading.
    One short note per screen, the first few times, which is the pattern already there.

0.6 **[done]** **Paste and drag-and-drop**, adding no buttons: the tile becomes a drop zone and the
    page listens for a paste. Solid on a laptop and on iPad; **not promised on iPhone**.

## A. The checks that lie

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


---

## Where it got to (2026-09-24, kept as it went)

**Built and pushed tonight:** the swipe · the feel and the first reduce-motion support the
app has ever had · the upload panel's three doors, with paste and drag · the file library
strip with the Photos/Files switch, the roller and the period picker · first-time notes on
the five screens that had none.

**Four real bugs found in my own new code, by testing it rather than trusting it:**
1. The swipe read its drag distance from state, which lags a render — so a **fast flick**
   reached the end still reading zero and nothing moved.
2. The roller's Month column was written `value.month === null ? [] : MONTHS`, which left it
   **permanently empty** — and my own check passed anyway, because it counted documents and
   "all year" happened to hold the same two as March. Exactly the vacuous-check class I
   built a tool to hunt, written an hour later, by me.
3. The Photos|Files switch used `role="tab"`, so every count of the dashboard's three panels
   found five.
4. The 320px sweep reported a **clipped** element as pushing the page sideways — it allowed
   `overflow-x: auto|scroll` on an ancestor but not `hidden`.

**Still to do from the list below:** the mutation run, the suites that never run, the four
questions on the screens never asked them, empty/overloaded/failed-read, the money
combinations, and the accessibility work now specified in `notes/accessibility-spec.md`.
