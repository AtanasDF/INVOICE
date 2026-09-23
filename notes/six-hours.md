# Six hours, 2026-09-23

Written after the scan limits, the people-check and Companies House all went live within an
hour of each other. Ordered by value, not by ease. Everything here is mine — nothing waits
on him, no migration is run against the live database, nothing touches Hidefield's rows.

**The principle for the first hour:** three things went live at once, which is exactly when
a regression hides. Proving what is live works comes before building anything new.

## Hour 1 — prove what just went live

1. A browser suite for the wall (queue item 21): the mock answers `scan_allowance` and
   `take_scans`, so the refusal, its wording, the top-up button, the second refusal and the
   "already used" answer can all be walked without touching the real database.
2. A suite for the allowance readout: silent when there is plenty, appears at a quarter
   left, says the right number, and says nothing at all when the limits are off or the
   account is paid.
3. Read the live counters with the service key: confirm `scan_usage` is empty, that its RLS
   really does stop one account reading another's row, and that `anon` can call none of the
   four functions. Catalogue-level checks, no rows written.
4. The full harness again, on a build nothing is changing underneath.

## Hour 2 — the free/paid switch, which nothing can see yet

5. Settings shows which plan an account is on, and what that means in plain words, reading
   `business_profile.plan` — it exists and no screen mentions it.
6. The way HE sets an account to paid: no UI, deliberately. A short SQL note in
   `web/supabase/` with the exact statement and how to check it, since it is his switch
   alone until payments exist.
7. A suite: a free account sees its limits, a paid one sees none and is never refused.

## Hour 3 — invite a friend (queue item 23, now unblocked)

8. The design settled in writing first, as with the limits.
9. `backup-017` and `migration-037`, written and **not run**: an invite code per account, a
   claim row, and the reward in scans. Additive, idempotent, RLS explicit, grants revoked.
10. The code behind a flag that is off, so it deploys changing nothing.
11. The reward lands only when the invited person has confirmed their email **and** scanned
    something — never at sign-up, or it is a machine for making fake accounts.
12. Suites for the arithmetic and for the screen.

## Hour 4 — the ageing photos, built but not armed

13. The design, then the job: gather what is going, make one PDF, email it, and only then
    remove the photograph. The record — amount, VAT, supplier, date — never goes.
14. **Two switches, not one.** It reports what it would do by default; deleting anything
    needs a second, explicit flag. Nothing in this project deletes without saying so first.
15. A dry run against real rows that writes a report and touches nothing.

## Hour 5 — try to break it

16. Hunt for real bugs rather than build features, which is the right use of an hour after a
    night of wide change. Deliberate targets: the three tabs against an account with
    nothing in it; a scan refused halfway through a batch; the top-up pressed twice at once;
    a theme changed while a document is printing; sign-in with the people-check on and
    JavaScript slow; the dashboard with 500 invoices.
17. Whatever that turns up, fixed, with a suite each.

## Hour 6 — leave it tidy

18. The error-wording pass over anything written tonight.
19. `SESSIONS.md`, `notes/queue.md` and `CLAUDE.md` current.
20. The full harness green, everything committed and pushed, and a short note at the top of
    the handover saying what is live and what is switched off.

## Still only his

His trading name and address for the legal pages · business details in Settings · one real
scan on the live site to prove the counting · asking Radoslav which screen his bug was on ·
whether the app should move off the iCloud Desktop.
