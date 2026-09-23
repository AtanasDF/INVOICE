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

8. **[done]** `test-payments` is green (6) and is in the run — it covers the very code the
   double-payment fix touched.
9. **[stale]** `test-deposits` times out on a 15 s wait; the screen moved under it.
10. **[done]** `test-settings-add` (19) and `test-reminders-ui` (5) are green and added.
    `test-free-quote` is stale. `test-address-signed` is **obsolete and safe to delete** —
    it waits for the old address finder that no longer exists. `test-quote-requests` fails
    on module resolution, not the UI. All reasons written into `notes/queue.md` item 43.
11. `test-quotes` is 6/8 on stale selectors — still to do.

## D. Tidy

12. Full harness green, everything committed and pushed, notes current.

## Not on this list, and why

- Royal Mail house numbers — his, costs money, written up in `notes/house-numbers-decision.md`.
- The paywall, the app stores, the offline scan queue — all waiting on decisions or an iPhone.
