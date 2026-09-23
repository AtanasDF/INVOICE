# The order I will work in

Written 2026-09-23 06:0x at his ask: "give me a list of everything you will do, thing by
thing, one by one, first to the last." Nothing starts until he says so. Each numbered step
ends with the app working, committed and pushed, so stopping anywhere leaves nothing broken.

Already done tonight, before this list: colour and themes (shipped, 12/12 tests), the
throwaway-email refusal (shipped), the 106 test documents (shipped), his dashboard brief
captured word-for-word.

## Part one — the dashboard he just described

1. The scanner at the top: one big scan button, three under it — Create an invoice, Copy a
   document, Upload a document — and "or write one by hand" beside the first.
2. The people you deal with: one search across customers and suppliers, Add a customer and
   Add a supplier beside it, the recent ones listed.
3. Each of those rows goes straight to a new invoice for that customer, already carrying
   the next number.
4. The three tabs, all on one page and the choice remembered: Invoices & customers ·
   Receipts & bills · Invoices sent.
5. Check a company moved lower and made smaller.
6. The catch-up line for an empty account: scan a few old invoices and the numbering carries
   on from yours.
7. A browser suite for the whole dashboard, then type check, lint, build, push.

## Part two — the free page and the front door

8. Front door: fewer words, a real invoice to look at, sign-in boxes where the eye lands.
9. "Get the app": install steps that know which phone they are on, a real Install button on
   Android and desktop, nothing for someone already installed.
10. `?from=carlisle-dhl` remembered and carried into the account, so depot flyers can be told
    from London ones.
11. Privacy policy and terms, plainly written, linked from the front door.
12. Search: title, description, a sharing picture. **Done — but the "free invoice template
    UK" half cannot be done as things stand, and was not faked.** Ranking needs a page a
    stranger can use, and since "nothing works before you register" the only public pages
    are the front door, privacy and terms. Three ways out, his choice: leave it and lean on
    the flyers; let strangers type an invoice again purely to have something to rank
    (reverses his rule); or write a public article — "How to invoice when you're
    self-employed" — that ranks and ends at the sign-up, which keeps the rule intact and is
    the recommendation.
13. `robots.txt` and a sitemap: public pages found, private ones not.
14. A real 404 and a real error page, in the app's own words.

## Part three — the scan limits (the one thing that cannot slip before launch)

15. The design written down first: what counts as one scan, where it is counted, what
    happens at 50 a day and 600 a month, how the single top-up is remembered, where the
    three-month photo clock starts.
16. `backup-016` and `migration-036`, additive and idempotent — written and reviewed,
    **not run**.
17. The counting itself, extending the rate limiter that already exists, behind a switch
    that is off.
18. The wall people actually meet at 50, in plain words, with the top-up button.
19. A logic suite for the arithmetic: London day boundaries, the month boundary, the top-up
    used once only, a failed scan not counted.
20. A browser suite for the wall itself. **Deferred on purpose, not skipped:** the wall
    cannot be reached until migration-036 is run and `SCAN_LIMITS` is `on`, and the only
    way to fake it in the browser is request interception, which the harness already uses
    to route Supabase (taking it over blanks the app — learned the hard way tonight). The
    wording is covered by `test-scan-limit-text.mjs`; this one is written the day the
    migration lands.

## Part four — protection, written but switched off

21. The human-check on sign-up, behind a flag, doing nothing until his Cloudflare keys exist.
22. The sign-up limit per internet address: a few a week, never a dead end.
23. Invite a friend: both sides rewarded, nothing paid until the invited person confirms
    their email and scans something.
24. A test suite for the throwaway-address list that shipped earlier.

## Part five — the quiet ones

25. The ageing-photos job: one email carrying everything that is going, then the photos go.
26. Offline: the service worker actually caching, so it opens in a depot with no signal.
27. An accessibility pass against the new colours, and a weight budget for the front door.
28. The error-wording pass, read as a person would read it.
29. `expected.json` turned into a checker, so the printed pile can be marked by machine.
30. Dark mode, properly: surface and ink tokens first.
31. The full harness green, the session log written, everything pushed.

**Not on this list, and not mine:** anything needing his keys, any migration run against the
live database, anything touching Hidefield, and the app stores.
