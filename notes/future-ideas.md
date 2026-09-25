# Future ideas (not now — parked on purpose)

Atanas's notes that we agreed not to build yet, so they aren't lost. Newest first.
When one of these starts, move it out of here and into the session log.

## 2026-09-20 (from his phone, overnight)

- **Everything adapts to the user.** Settings now knows who the account is for (a limited
  company, a sole trader, or personal use — `business_profile.account_kind`, migration-029),
  but only the address label follows it. The rest is still parked: wording, which fields
  show, which reports matter, what the dashboard leads with. One setting, many effects —
  worth doing properly in one go rather than field by field.
- **Business vs personal address.** Settings holds one address, labelled after the account
  kind. Holding both at once, and each document picking the right one, is still parked and
  tied to the item above.
- (Built 2026-09-20, branch `feature/settings-add`: the registered name and company number
  are their own fields and print in the invoice footer, trading name still the headline.)
- **Account section in Settings.** Built 2026-09-20 apart from changing the email address
  and listing signed-in devices, which Supabase doesn't expose from the client. What the
  app costs waits on the paywall conversation.
- **Bank connection (Open Banking, read-only).** Payments in and out matched to invoices
  and bills by themselves. See `claude-notes.md` "Queued work" item 8 for the detail.
- **Products and jobs price search.** Beyond the first version (a prepared search per line):
  real price feeds, saved favourite suppliers, a price history per item, and "what should
  this job cost" for trades, with a source for each figure.
- **Company legitimacy report.** Beyond status and officers: accounts overdue, charges,
  insolvency history, name changes, a website and social-media check, and a plain-English
  "would I trade with them" summary.
- **Beginners' guide.** One short walkthrough the first time, instead of hints scattered
  through the app.
- **Offline scan queue.** Keep captures on the phone until there's signal (needs a caching
  service worker; worth doing with an iPhone to test on).
- **Paywall.** Whole app paid except the Free invoice page. Design conversation first.

## Queued surprises (2026-09-20) — the next five, when there's time

**Built 2026-09-24, out of this list:** the getting started checklist (1), one money
screen (2, now `/money`), saved prices (3) and the Monday morning summary (5). Jobs (4)
is the one left: it is the biggest of the five and wants a conversation about what a job
holds before it is built.

1. **[done 2026-09-24]** **Getting started checklist.** A new account is asked for what the app needs to be
   useful — business details, VAT setting, where invoice numbers start, bank details for
   the footer, first client — as a short list that ticks itself off. Atanas is starting a
   company from scratch, so this is worth doing properly once.
2. **[done 2026-09-24]** **One money screen.** Everything owed to him and everything he owes on a single page,
   in the order it matters: overdue first, then due this week, then the rest. One tap to
   chase or to mark paid.
3. **[done 2026-09-24]** **Saved prices.** The things he charges for, with his usual price, so a quote or an
   invoice is a few taps: pick, set the quantity, done. Learns from what he has already
   invoiced rather than asking him to type a price list.
4. **[done]** **Jobs.** A job or site holds its quote, its invoices, its receipts and its
   photos together, so a whole job can be looked at (and its profit seen) in one place.
   Built: `/jobs`, `src/lib/jobs.ts`, `harness/test-jobs.mjs` in `run-all.sh`. The note above
   calling it "the one left" was stale.
5. **[done 2026-09-24]** **Monday morning summary.** One push on a Monday: what came in last week, what's
   overdue, what's due this week, whose quote is waiting. Short enough to read on the way
   to a job.
