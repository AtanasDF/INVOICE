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

1. The full harness green, all 100+ suites, after a night of wide changes. **Running.**
2. `node feedback-inbox.mjs` — `CLAUDE.md` rule 9 says every session starts with it and
   this one did not. Anything real people have said is worth more than anything on this list.
3. `SESSIONS.md` entry for tonight, kept current rather than written at the end.
4. `harness/README.md` — nine new suites are not in it.

## The app itself

5. **Nothing shows what allowance is left.** The design has "38 of 50 today" and nothing
   draws it. Until it does, the wall arrives with no warning.
6. **Nothing shows whether an account is free or paid.** `plan` exists; no screen mentions it.
7. **The dashboard's "Create an invoice" goes to `/free-invoice?start=photo`**, a path built
   for a page strangers used to see. Walk it as a signed-in person and make sure it ends at
   a saved invoice rather than the old free-page dead end.
8. **`AddAnything` now repeats the three buttons above it** — Scan it, Upload a photo or PDF.
   Two ways to the same place, a tap apart.
9. **The Tip on the dashboard still names buttons that were renamed tonight.**
10. **The file library and recurring links moved inside a tab** when the panels landed.
    Check they are still reachable from somewhere obvious.
11. **Dark mode**, properly: `bg-white` and `text-white` become surface and ink tokens first,
    or white text lands on white buttons.
12. **The error-wording pass**: every `loadFailed()` and `saveFailed()` read aloud.
13. **Offline**: the service worker is registered and caches nothing, so the app is useless
    in a depot with no signal — which is exactly where it will be opened.
14. **The manifest has no `id`, no `scope` and no screenshots**, so the install prompt is
    plainer than it needs to be and the identity can drift.
15. **No Apple touch icon beyond 192px**, which is what an iPhone home screen uses.

## Money and cost

16. The ageing-photos job: one email carrying everything that is going, then the photos go.
17. A weight budget for the front door and the dashboard — the notes say the dashboard was
    1,501 KB against a 1.5 MB ceiling *before* tonight added to it.
18. Check what tonight's additions did to that number, and cut if it has gone over.
19. Invite a friend — waits for 036. **[his]** to run 036 first.

## Correctness

20. `migration-036` has never been parsed by a database. No Postgres on this Mac; the first
    real check is running it. **[his]**, with me watching.
21. A browser suite for the wall, the day 036 is live.
22. The two unused exports flagged long ago and never resolved: `isMileage`
    (`src/lib/mileage.ts`) and `mergeAddress` (`src/lib/addressLookup.ts`).
23. `test-weight.mjs` may now be wrong about what the pages weigh.
24. The scan routes' own hourly limits were written before tonight's limits existed; check
    the two do not contradict each other.
25. The `#o` owner-copy rule, the quote snapshot rule and the CIS rules all have suites;
    confirm none of them were disturbed by the dashboard rebuild.

## Waiting on him

26. **[his]** Turnstile keys — five minutes, and the people-check goes live.
27. **[his]** Companies House key — the company lookup and the company check are dead without it.
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
