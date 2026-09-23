# The run list (2026-09-23, evening)

Atanas: *"do yourself a list to follow and start working on it, not just one thing by one —
do a big list and start working on all."*

Worked top to bottom. Each line gets a fix **and** a check that fails without it. Marked
as they land.

## A. Journeys that end nowhere (the four questions, applied to whole paths)

1. **[done]** Dashboard "Create an invoice" with the camera blocked stranded people on a
   black screen. Now drops to the invoice and says why. `test-camera-refusal` 9.
2. Walk "Scan a receipt" the same way, camera blocked — the big button on the dashboard.
3. Walk "Copy a document" the same way.
4. Walk "+ Add → Scan it" the same way.
5. A signed-in person finishing a Free-page invoice: does it end at a **saved** invoice in
   their records, or only a PDF? (queue item 7's real question)

## B. Things the app knows and never says

6. `business_profile.plan` exists and no screen mentions free or paid (queue 6).
7. No Apple touch icon above 192px, which is what an iPhone home screen uses (queue 15).

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
