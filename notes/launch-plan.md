# Launch in three weeks — 2026-09-23 to about 14 October

Agreed 2026-09-23 03:2x. His ask: "let's create a list with what we have to do and what we
can do tomorrow even if not needed for later so we are ahead and have more time for testing
at the end." So this list is ordered by **what unblocks other work**, and everything that
can be pulled forward is pulled forward — the last week is meant to be testing, not
building.

The numbers behind the limits are in `notes/pricing-and-limits.md`. The rules of the repo
are in `CLAUDE.md`. Where things stand tonight is in `notes/handover.md`.

## The one thing that must not slip

**No scan limits exist in the app today.** Launching without them means unlimited free
scanning for everybody, paid for by Atanas. Everything else on this list could arrive late;
this cannot.

## Tomorrow (the most useful day's work)

Ordered so the slowest-to-unblock goes first.

1. **The five minutes from Atanas that unblock a week of work**, done first thing:
   a. Cloudflare Turnstile keys (the human-check on sign-up) — made in his Cloudflare
      account; the secret is pasted by him into Supabase, never read here.
   b. The Companies House key (item 24) — his registration, then into Vercel.
   c. His business details in Settings on Hidefield (item 42) and the GO OUTDOORS date
      (item 46), both of which real sign-ups and emails will show.
2. **Design the limits properly before writing them** — one short document: where a scan is
   counted, what a "scan" is (a document, not a page), what happens at 50 and at 600, what
   the top-up button does and how it is remembered, where the three-month photo clock
   starts. A morning, and it makes the build mechanical.
3. **The migration for the limits**, written and reviewed but not run: a backup file and a
   numbered migration per `CLAUDE.md` rule 2, adding the per-account counters and the
   top-up mark. Latest today is migration-035, backup 015.
4. **Build the counting**, behind a switch that is off: every scan route already passes
   through `src/lib/rateLimit.ts` and `hit_rate_limit`, so this is an extension, not a new
   idea. Off by default means it can ship to `main` without changing anything for anyone.
5. **The Turnstile check on sign-up**, once 1a is done — Supabase supports it natively, so
   it is a setting plus a token passed from `SignInCard`.

## Can be pulled forward, not needed until later

Doing these early is what buys the testing week.

- **The ageing-photos job**: one email carrying everything that is going, then the photos
  deleted. The pieces exist (`documentPdf.ts`, `/api/send-document`); it needs a schedule
  and the wording. Nothing depends on it, so it can be built any day.
- **Stripe**, for the paid tier. Nothing else waits on it, and it is the slowest thing to
  get right. Earlier is better.
- **The IP limit on sign-ups** — a few a week per address, with a message a human can act
  on, never a dead end. See `notes/pricing-and-limits.md`.
- **The throwaway-address list** is already done and live (2026-09-23, `throwawayEmail.ts`);
  it only needs its own test suite.
- **The front-page picture** (item 28) — waiting on his yes.
- **A privacy policy and terms page.** Needed before any advertising, easy to forget, and
  nothing else depends on it.

## Week 2

- Run the migration with him, verify it as rule 3 says, turn the limits on.
- The top-up button and the wording around it.
- Stripe live, the paid tier switchable.
- Promotion decided: the Instagram page, and the free-invoice page made to rank for what
  people actually search ("free invoice template UK"). The advertising share of the £100.

## Week 3 — testing only

- His own iPhone run through everything (item 48): camera, batch, signature, share, the
  paid flow, a real sign-up from a real phone on mobile data.
- A handful of real tradesmen using it before a penny is spent on advertising.
- The full harness green, and a live pass over every page signed out.

## Decisions still owed

- Apple demands in-app purchase for digital goods and in-app account deletion. The second
  fights `CLAUDE.md` rule 1. Settle it before any store wrapper is started — the stores are
  4–8 weeks of their own and are **not** part of this three weeks.
- The starting photo retention is three months; the first shortening is unplanned.
- What the welcome 300 scans are attached to: confirmed email, as agreed.
