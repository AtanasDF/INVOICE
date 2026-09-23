# Tonight, 23 September 2026 — the free page

Atanas, 05:1x: "focus on the free page... add anything you can from what you hear from the
plans." Everything here is work I can do alone: no keys of his, no migration run, nothing
that changes his accounting record. Ordered so each step ships on its own and `main` is
never half-built.

**The assumption, stated:** since the account gate landed, `/free-invoice` is behind the
sign-in, so the only page a stranger sees is the front door at `/`. "The free page" is read
here as both — the front door a flyer sends someone to, and the free invoice writer they
meet once they are in.

## The list

1. **Colour, and a theme people can choose.** The house style is "neutral greys only" and
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
