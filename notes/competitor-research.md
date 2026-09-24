# How the others actually behave on a phone (24 September 2026)

Twelve apps, every claim tied to a page that was fetched. Where a source is silent it says
so. **Nobody publishes tap counts** — every "3 taps" in their marketing is unverified, and
the step counts here are derived from their own help articles.

## Two of the twelve are not in the race

- **Wave is unavailable in the UK** — their own help centre, and the app is not in the UK
  App Store at all.
- **Starling's Business Toolkit closes 16 March 2026**, replaced by Starling Accounting.
  Invoicing there is now free.

And **QuickBooks Self-Employed is gone for new UK users** — it appears nowhere on Intuit's
UK sole-trader page, though Intuit has never used the word "discontinued".

## Where we are already ahead, and did not know it

**Auto-capture and edge detection are claimed by none of the nine mainstream apps.** Only
AutoEntry documents it among the specialists — Dext does not, and offers only a manual crop.

And **neither Dext nor AutoEntry reads on the device**. Dext: *"extraction takes around 30
minutes"*, hours at peak, and they **sell a paid queue-jump**. AutoEntry's published SLA is
10–120 minutes for 80% of documents. Ours is seconds.

Their accuracy claims are unaudited and contradict themselves: Dext says *"over 99%"* on
one page and *"99.9%"* on another. Nobody should be intimidated by that number.

## The biggest hole in the entire market

**Not one of them shows which field it was unsure about.** Dext, AutoEntry, Zoho, Tide,
FreeAgent, Xero and QuickBooks all treat a reading as binary — filled or blank, "Ready" or
"To Review". Dext's *only* uncertainty mechanism is leaving a field empty, while marketing
99.9% accuracy.

We already have the principle written into `CLAUDE.md`: *only fill in what the reading is
sure of*. Making that **visible on the field** — an amber "check this" with a one-line
reason ("this date could be 3 June or 6 March") — is a differentiator nobody else has, and
the hard half is already built.

## Things nobody supports at all

- **The VAT domestic reverse charge for construction.** Not one of the twelve. SumUp writes
  the explainer and then hands you a Word template. Square has **zero mentions of CIS**
  anywhere on its site. For a VAT-registered subcontractor this is the difference between a
  compliant invoice and a non-compliant one — and our CIS code is already there to sit
  beside.
- **The fixed debt-recovery costs.** Statutory interest is 8% + base = **11.75%** today
  (base 3.75% since 18 Dec 2025), plus **£40 / £70 / £100** by debt size. Nobody surfaces
  the fixed sums. We already compute the interest — but only in the fifth reminder.
  **The Commercial Payments Bill (May 2026) will make statutory interest mandatory in all
  commercial contracts**, cap terms at 60 days, and ban construction retention deductions.
  No commencement date yet.
- **Dynamic Type / font scaling.** No vendor in the study claims it. Not one. Xero's
  accessibility statement is scoped to "Xero.com"; Zoho's VPAT explicitly excludes the
  mobile apps; Square has no GB statement; Tide, Bookipi and Invoice2go publish nothing.

## Offline is an open goal, and it is closing slowly

Xero has the only real claim (*"draft invoices and capture receipts offline"*) — and on
1 Oct 2025 a Xero admin publicly said further offline sync is *"not something we have plans
for"*. Zoho says no in its own FAQ. **Square excludes Invoices from offline mode.**
Invoice2go requires *"a strong internet connection at all times"*, and its documented
recovery for an offline invoice is to copy it and delete the original.

Xero's stated blocker is multi-user sync conflicts — **which does not apply to a
single-owner sole-trader record.**

## What their own users complain about, 2025–26

The pattern is never missing features:

- *"far too complex for self-employed business accounting"* (QuickBooks, 1★)
- *"Simple functions now take over 10 [taps] and are buried in sub menus"*
- *"Lacks all of the functionality of the website based version"* — the app-is-a-shell
  complaint, across several
- **Removing a free tier is the most hated act in this market**: *"It's FREE forever now
  it's not!"*, *"No email of warning, nothing"* (Bookipi, 2025)
- Money being held is the existential one (Square, SumUp)

**The rating paradox worth remembering:** every app store rating is 4.5–4.8, because they
are prompted in-app. The Trustpilot one-star share tells the truth — FreeAgent 3%,
QuickBooks 10%, Square 15%, **Xero 17%**.

The single most useful line found, about FreeAgent: *"It is designed for users not
accountants but will still give accountants reports."*

## Hard caps worth knowing

- **Xero Ignite (£18/mo): 20 invoices and 10 bills.**
- **Tide free: 3 invoices and quotes a month**, across Free, Smart and Pro.
- **Invoice2go has no free tier at all** — while its App Store listing calls it *"the #1
  free invoice app"*. That contradiction is the most exploitable single thing here.

## The ten best things to build, by value over effort

1. **"Same again"** — one-tap duplicate of the last invoice to that customer, **dates reset
   to today**. Xero's is the strongest mobile friction-reducer found; **Tide charges £5.99+VAT
   a month for it, Square paywalls templates at £20/mo**, and most do not have it on mobile
   at all. Very low effort.
2. **A GOV.UK wording pass** over every error and empty state — free, externally written,
   and **no competitor follows it**.
3. **Show which field the reader doubted** — the market-wide hole above.
4. **Respect the device's text size**, and publish an accessibility statement that names our
   own failures, in Starling's candid style.
5. **Validate VAT numbers against HMRC** (Dext-only today), and **ask before remembering** a
   supplier's category — AutoEntry's explicit prompt beats Dext's silent learning.
6. **Put the statutory late-payment terms on every B2B invoice** by default.
7. **Pay by bank** on the `/i/` page (Stripe: £0.50–£10,000, **no chargebacks**) against
   Square's 2.5% and no bank rail at all.
8. **The VAT reverse charge** for construction.
9. **The offline queue** — as an installed home-screen app, which is what makes the storage
   survive.
10. **Auto-match an incoming bank payment without demanding a reference.** SumUp's works only
    if the customer types the reference *and* needs reconnecting every 90 days; Tide charges
    for it; **Starling matches only exact amounts** and otherwise makes you post a
    double-entry journal; Square has no bank feed at all. Propose, never assert — the same
    principle as item 3.

## One conflict between our own research passes, left visible

This pass quotes the Home Office manual's *"maximum reading age of 9"* as the GOV.UK
benchmark. **The later, deeper pass showed that citation is circular** — GOV.UK's own
guidance contains no reading-age target, and the ONS holds no such data. See the correction
in `notes/accessibility-spec.md`. The plain-English *practice* stands; the *number* does not.

## Honest limits

Xero Central serves an empty shell to every fetch method, so Xero's mobile detail rests on
search summaries. Reddit was unreachable — absent, not negative. QuickBooks' mobile invoice
flow and reminder schedule are undocumented anywhere reachable, and its receipt-capture
story contradicts itself between its help centre and its marketing. SumUp contradicts itself
on its own free tier, and both pages are live.
