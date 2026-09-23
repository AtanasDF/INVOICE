# The working queue — everything, in order

Replaces `notes/run-order.md` as the live list (that one is kept as the record of what was
agreed at 06:00). Written 2026-09-23 06:5x at his ask: "find 30 more things to fix... just
start and don't wait for me to decide."

Everything below is something actually spotted in the code or the app tonight, not filler.
Anything needing his keys, a migration run, or a decision only he can make is marked
**[his]** and is not counted as mine to do.

## Done tonight (for the record)

Colour and themes · the front door · Get the app · flyer tracking · privacy and terms ·
search, robots, sitemap, sharing picture · a real 404 and a last-resort error page · the
dashboard rebuilt round the scanner · the scan-limits design · backup-016 + migration-036
(**not run**) · the counting behind a flag · the wall and its top-up button · the
people-check behind a flag · the throwaway-inbox refusal and its suite · the 106 test
documents and the checker that marks them · the readability pass that found grey-on-grey
text failing since before the themes existed.

Nine suites written tonight, all green: theme, first-page, dashboard, get-the-app,
privacy-terms, came-from, scan-limit-text, throwaway-email, readable.

## Now

1. ~~The full harness green.~~ **Done: 110 suites, 1,936 checks, 0 failures**, against a
   build nothing was changing underneath. Four suites had been failing: three were
   expectations left behind by tonight's renames, and one was a real behaviour test made
   wrong by a real improvement (a paid bill does leave the bills card; the supplier's name
   now also appears in "Who you work with", and the check read the whole page).
2. ~~`node feedback-inbox.mjs`~~ **done, and it mattered** — two unread, one of them the
   first bug report from outside. Original item: — `CLAUDE.md` rule 9 says every session starts with it and
   this one did not. Anything real people have said is worth more than anything on this list.
3. ~~`SESSIONS.md`~~ done.
4. ~~`harness/README.md`~~ done — and ten suites were also missing from `run-all.sh`, so they
   were never being run at all.

## Waiting on one question to him

**Radoslav's bug.** The first feedback from anyone outside, and it is still open because it
could not be reproduced. Horizontal overflow was ruled out by measurement across 21 pages
and every width from 1440 to 320 (`test-no-sideways.mjs`), so it is a gesture, not the
page. Ask him: which screen, and a phone or a trackpad?

## The app itself

5. ~~**Nothing shows what allowance is left.**~~ **done** — warns at a quarter left, silent
   until then. Original: The design has "38 of 50 today" and nothing
   draws it. Until it does, the wall arrives with no warning.
6. **Nothing shows whether an account is free or paid.** `plan` exists; no screen mentions it.
7. **The dashboard's "Create an invoice" goes to `/free-invoice?start=photo`**, a path built
   for a page strangers used to see. Walk it as a signed-in person and make sure it ends at
   a saved invoice rather than the old free-page dead end.
8. ~~**`AddAnything` repeats the buttons above it**~~ **done**. Original: — Scan it, Upload a photo or PDF.
   Two ways to the same place, a tap apart.
9. ~~**The Tip naming renamed buttons**~~ done.
10. ~~**Links stranded inside one tab**~~ **done**. Original: when the panels landed.
    Check they are still reachable from somewhere obvious.
11. ~~**Dark mode**~~ **done** — the scale inverts, `--paper` carries `bg-white`, and the
    screens that are black by nature use a fixed white. Follows the phone by default.
12. ~~**The error-wording pass**~~ **checked, nothing to fix**: every raw-error site is a
    server log or internal matching, and no screen shows one. Not going to manufacture edits.
13. ~~**Offline**~~ **done** — the app's own files cached, a real offline page, and nothing
    carrying figures ever cached.
14. ~~**The manifest**~~ **done** — id, scope, a maskable icon, language and categories.
15. **No Apple touch icon beyond 192px**, which is what an iPhone home screen uses.

## Money and cost

16. The ageing-photos job: one email carrying everything that is going, then the photos go.
17. ~~A weight budget~~ **holding**: `test-weight` is 8/8 in the full run, so tonight's
    additions have not pushed the pages over the ceiling.
18. (folded into 17)
19. Invite a friend — waits for 036. **[his]** to run 036 first.

## Correctness

20. `migration-036` has never been parsed by a database. No Postgres on this Mac; the first
    real check is running it. **[his]**, with me watching.
21. A browser suite for the wall, the day 036 is live.
22. ~~The two unused exports~~ **removed**.
23. ~~`test-weight`~~ green.
24. ~~The hourly burst guard vs the new limits~~ **fixed**: 600 an hour shared by everybody
    would have refused a whole depot at once.
25. ~~Confirm the older rules were not disturbed~~ — the full run says they were not.

## Waiting on him

26. ~~**[his]** Turnstile keys~~ **done 2026-09-23: live and verified in a real browser.**
    Invisible to honest people — he signed in from a private window and saw nothing at all.
27. ~~**[his]** Companies House key~~ **done and verified 2026-09-23** — real companies come
    back from the live register, and the full company check reads the real record.
28. **[his]** A trading name and address for the privacy and terms pages. Required before
    advertising, and not something to invent.
29. **[his]** The "free invoice template UK" question: leave it, reopen the free page, or
    write a public article. Recommended: the article.
30. **[his]** Business details in Settings on Hidefield, and the GO OUTDOORS date.
31. **[his]** Print the 106 documents, scan them, and send me the results to mark.
32. **[his]** Whether the weekly cap per address should still be built, having read why I
    argued against it.

## Later, deliberately

33. The offline scan queue — needs an iPhone to test against.
34. The app stores — 4 to 8 weeks of their own, and Apple's in-app-purchase and
    account-deletion rules need settling first.
35. The paywall itself, when there is something to charge for.
