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
