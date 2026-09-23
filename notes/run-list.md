# The run list (2026-09-23, evening)

Atanas: *"do yourself a list to follow and start working on it, not just one thing by one —
do a big list and start working on all."*

Worked top to bottom. Each line gets a fix **and** a check that fails without it. Marked
as they land.

## A. Journeys that end nowhere (the four questions, applied to whole paths)

1. **[done]** Dashboard "Create an invoice" with the camera blocked stranded people on a
   black screen. Now drops to the invoice and says why. `test-camera-refusal` 9.
2. **[done]** `/scan` had the same trap and it mattered more — it is the biggest button in
   the app. Now says so and offers upload, by hand, or try again.
3. **[done, nothing to fix]** `/copy` never had it: its camera opens only on a tap.
4. **[done, nothing to fix]** "+ Add → Scan it" goes to `/scan`, so item 2 covers it.
5. **[done]** It did end somewhere — "Keep a copy in the app" carried the draft to
   `/invoices/new` — but it sat fifth and read as an optional extra. Signed in, saving into
   their own records is now the first, primary action. `test-free-draft` 16.

## B. Things the app knows and never says

6. **[decided: not now]** `business_profile.plan` exists and no screen mentions free or
   paid. Deliberately left: nobody can buy anything, and the scan limits are off, so a
   "Free plan" badge would advertise a paid tier that does not exist and cannot be reached.
   It becomes worth doing the day `SCAN_LIMITS=on`, when a paid account genuinely differs.
7. **[done]** The Apple icon was worse than "too small": it pointed at the 192, which is
   4% non-opaque at its anti-aliased edges, and iOS fills transparency with BLACK under its
   own rounded mask. `/apple-icon.png` is now 180 (what iPhones use), flattened onto the
   manifest background, fully opaque. `test-get-the-app` 14.

## C. Suites that exist and never run (queue 43)

8. `test-payments` — port-pinned, errors on a screenshot in its catch.
9. `test-deposits` — same shape.
10. `test-free-quote`, `test-address-signed`, `test-settings-add`, `test-reminders-ui`,
    `test-quote-requests` — try each against `$BASE`; add the green ones, and for the stale
    ones say plainly whether they are worth rewriting or deleting.
11. `test-quotes` is 6/8 on stale selectors — rewrite those two checks against the current
    form rather than leaving a red suite lying around.

## D. Tidy

12. Full harness green, everything committed and pushed, notes current.

## Not on this list, and why

- Royal Mail house numbers — his, costs money, written up in `notes/house-numbers-decision.md`.
- The paywall, the app stores, the offline scan queue — all waiting on decisions or an iPhone.
