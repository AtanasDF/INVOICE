# Tonight, 23 September 2026 — the free page

Atanas, 05:1x: "focus on the free page... add anything you can from what you hear from the
plans." Everything here is work I can do alone: no keys of his, no migration run, nothing
that changes his accounting record. Ordered so each step ships on its own and `main` is
never half-built.

**The assumption, stated:** since the account gate landed, `/free-invoice` is behind the
sign-in, so the only page a stranger sees is the front door at `/`. "The free page" is read
here as both — the front door a flyer sends someone to, and the free invoice writer they
meet once they are in.

## Done so far tonight

- **1. Colour and themes** — shipped. The scale became variables, `@theme inline` points
  Tailwind's utilities at them, and not one of the 1,331 `neutral-*` classes was edited.
  Five themes, the choice per device, applied before the first paint, invoices still print
  in plain ink. `harness/test-theme.mjs`, 12/12. `CLAUDE.md`'s house-style rule rewritten.

## The list

1. **Colour, and a theme people can choose.** *(done)* The house style is "neutral greys only" and
   he has now asked for the opposite: "we need to make the app a bit more colourful...
   options to change the themes... nothing too special." Every colour becomes a token on
   `:root`, four or five themes plus dark mode, a picker in Settings remembered per device.
   `CLAUDE.md`'s house-style rule is rewritten in the same commit, or the next session
   keeps building grey.
2. **The front door: fewer words, more to look at.** "The login page, less explanation...
   some nice pictures, some invoices." Cut the explaining to a headline and one line, show
   a real invoice instead of describing one, keep the sign-in boxes where the eye lands.
3. **"Get the app".** It is already installable — manifest, icons, service worker,
   standalone display — and nothing tells anyone. A screen that knows which phone it is
   looking at: iPhone gets Share → Add to Home Screen with a picture, Android and desktop
   get a real Install button wired to `beforeinstallprompt`, and anyone already running it
   standalone sees nothing at all.
4. **Where they came from.** `/?from=carlisle-dhl` remembered on the device and carried
   into the account, so a flyer at a depot can be told apart from one in London. The
   cheapest thing on the whole plan and the easiest to forget.
5. **Privacy policy and terms**, plainly written and linked from the front door. Needed
   before a penny is spent on advertising, and nothing else waits on it.
6. **The free invoice page itself**: make the first thing a new account meets obviously the
   thing to try, and make its "Save as" and "email it" endings plain.
7. **Tests for all of it** in the harness, and `tsc`, `eslint` and `build` clean before each
   push.

## Then, the next twelve

8. The scan limits, designed on paper and written as a migration — **not run**: where a
   scan is counted, what counts as one, what happens at 50 a day and 600 a month, how the
   one top-up is remembered, where the three-month photo clock starts.
9. The ageing-photos job: one email carrying everything that is going, then the photos
   deleted. `documentPdf.ts` and `/api/send-document` already exist.
10. Invite a friend, designed and written behind a switch: both sides rewarded, and nothing
    paid until the invited person confirms their email *and* scans something.
11. The human-check on sign-up, written behind a flag so it does nothing until his
    Cloudflare keys exist.
12. The sign-up limit per internet address — a few a week, never a dead end, always a way
    to reach a human.
13. The front door found by search: title, description, a sharing picture, and the free
    invoice page written so it can rank for "free invoice template UK".
14. `robots.txt` and a sitemap, so the public pages are found and the private ones are not.
15. A real 404 and a real error page, in the app's own words rather than Next's.
16. Offline: the service worker actually caching, so the app opens in a depot with no
    signal. Currently registered but doing nothing.
17. An accessibility pass on the front door and the sign-in card — contrast against the new
    colours, focus rings, every field labelled, the whole thing usable from a keyboard.
18. A weight budget for the front door: it is the page every flyer leads to, and it should
    open fast on a phone on mobile data.
19. The error wording pass: every `loadFailed()` and `saveFailed()` message read as a person
    would read it.
20. `expected.json` turned into a checker, so when he scans the printed pile the readings
    can be compared to the answer key by machine rather than by eye.

Items 8, 10, 11 and 12 are written but switched off, because they need either a migration
he runs or keys only he can make. Nothing on this list touches Hidefield.


## The full night's queue (Atanas, 05:3x: "find at least 30 things you can sort out")

Everything here is mine to do: no keys of his, no migration run against the live database,
nothing near Hidefield. Ordered so each lands on its own.

**The scan limits, which is the one thing that cannot slip before launch**

21. Write the design down before any code: what counts as one scan (a document, not a
    page, and not a retry of a failed read), where it is counted so the camera cannot be
    used to dodge it, what a free account sees at 50 in a day and at 600 in a month, how the
    single top-up is remembered and when it resets, and where the three-month photo clock
    starts.
22. `backup-016` and `migration-036`: the per-account counters, the top-up mark and the
    plan column, additive and idempotent, written and reviewed but **not run**.
23. The counting itself, extending `src/lib/rateLimit.ts` and `hit_rate_limit` rather than
    inventing a second mechanism, behind a switch that is off so it can ship to `main`
    without changing anything for anyone.
24. The wall itself: what someone actually sees at 50, in his words not an error code, with
    the top-up button and an honest line about what it costs him.
25. A logic suite for the arithmetic — day boundaries in London, the month boundary, the
    top-up used once and only once, a failed scan not counted.
26. A browser suite for the wall: the count shown, the button, the second refusal.

**The free page and the front door**

27. Fewer words, a real invoice to look at, the sign-in boxes where the eye lands.
28. "Get the app": platform-aware install steps, a real Install button on Android and
    desktop, nothing at all for someone already installed.
29. `?from=carlisle-dhl` remembered and carried into the account.
30. Privacy policy and terms, plainly written, linked from the front door.
31. Search: title, description, a sharing picture, and the free invoice page written so it
    can rank for "free invoice template UK".
32. `robots.txt` and a sitemap: public pages found, private ones not.
33. A weight budget for the front door, since every flyer leads to it.
34. An accessibility pass against the new colours: contrast, focus rings, every field
    labelled, the whole thing usable from a keyboard.

**Protection, written but switched off**

35. The human-check on sign-up, behind a flag, doing nothing until his Cloudflare keys exist.
36. The sign-up limit per internet address: a few a week, never a dead end.
37. Invite a friend: both sides rewarded, nothing paid until the invited person confirms
    their email *and* scans something.
38. A test suite for the throwaway-address list that shipped earlier tonight.

**Things that quietly matter**

39. The ageing-photos job: one email carrying everything that is going, then the photos
    deleted.
40. Offline: the service worker actually caching, so the app opens in a depot with no signal.
41. A real 404 and a real error page, in the app's own words.
42. The error-wording pass: every `loadFailed()` and `saveFailed()` message read as a person
    would read it.
43. `expected.json` turned into a checker, so the printed pile can be marked by machine
    rather than by eye.
44. Dark mode, properly: `bg-white` and `text-white` turned into surface and ink tokens
    first, or white text lands on white buttons.
45. The full harness green before the night ends, and every step pushed as it lands.

**What is deliberately not here:** anything needing his keys, any migration run against the
live database, any change to Hidefield, and the app stores.
