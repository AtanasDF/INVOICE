# Future ideas (not now — parked on purpose)

Atanas's notes that we agreed not to build yet, so they aren't lost. Newest first.
When one of these starts, move it out of here and into the session log.

## 2026-09-20 (from his phone, overnight)

- **Everything adapts to the user.** Once Settings knows who the account is for (a limited
  company, a sole trader, or personal use), the whole app should follow: wording, which
  fields show, which reports matter, what the dashboard leads with. One setting, many
  effects — worth doing properly in one go rather than field by field.
- **Business vs personal address.** Settings holds both, and each document uses the right
  one. Tied to the setting above.
- **Company name and business name kept apart.** The registered name (Companies House) and
  the trading name shown to customers are different things. Invoices need both in the right
  places (UK law: a limited company must show its registered name and number).
- **Account section in Settings.** Sign-in help, email change, password, sessions, export
  everything, delete the account, where the data lives, what the app costs.
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
