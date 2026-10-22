# Simpler, and out in two weeks (2026-10-22)

Atanas: *"make it more simple and attractive for people... what are the most important things
to keep, and what can we drop for now? I want it running properly and attractive, but soon,
so the easiest way."* Target: launch around **Wednesday 5 November 2026**.

## What the research says, in one line

People never leave these apps for missing features. They leave because *"simple functions
now take over 10 taps and are buried in sub menus"* (competitor-research.md). The winners
sell **one promise** and get a new user to a sent invoice in about a minute:

- **Square Invoices**: "send invoices in seconds", free, card/Apple Pay on the invoice,
  automatic reminders, quotes that turn into invoices; claims most invoices are paid within a day.
- **SumUp Invoices**: free, unlimited invoices and quotes, sign up with an email, add your
  business, send. Card, bank and wallet payment on the invoice.

Both lead with **getting paid**. Neither leads with a feature list.

## Our promise

**"Get paid faster, and keep every receipt sorted."** Two jobs, the two the depot drivers have:
money coming in (quote, invoice, reminders, paid) and money going out (scan the glovebox,
know the tax). Everything on the first screens serves one of those two; everything else
waits behind **More**.

## Keep, up front (the whole launch)

1. **Home**: what's owed to you, what you owe, and three big buttons: *Scan a receipt*,
   *Send an invoice*, *Send a quote*.
2. **Scan**: one receipt or a pile (batch). The best thing we have.
3. **Invoices**: with Same again, the private link (you see when it's opened), automatic
   reminders, part payments, Mark as paid. Quotes live here as a tab, not a menu item.
4. **Receipts**: with Needs review as a badge on it, not its own menu item.
5. **Customers**: suppliers on the same page as a tab.
6. **Mileage**: drivers live on it.
7. **Settings** and **How it works**.

That is **six menu items instead of nineteen.**

## Move behind "More" (nothing removed, nothing deleted, still one tap away)

Recurring invoices, Recurring expenses, Expenses (the tax summary), Money, Jobs, Files,
Copy a document, Change a file, Check a company, Quote requests to suppliers, Feedback.

## Show only to the people they are for

Asked once, on the first visit, three yes/no questions: *Do you send invoices? Are you VAT
registered? Do you work under CIS?* Then:

- **VAT** page and VAT on lines: only if VAT registered.
- **CIS** and the reverse charge: only if CIS.
- An owner who only scans receipts never sees an empty Invoices screen.

## Leave switched off for launch (already built, already off)

Help chat, Invite a friend, letting old photos go, the HMRC VAT lookup (waits on HMRC anyway).
They cost nothing while off and each is one switch later.

## Add one thing: a "Pay now" button, the easy way

The one gap every competitor fills. **Not** a payments integration (a Stripe account, checks,
fees, weeks): instead, **a box in Settings, "Your payment link"**, where somebody pastes a
link they already have (SumUp, Stripe Payment Link, PayPal.me, Monzo or Starling "get paid"
link). It then shows as a **Pay now** button on the invoice, the PDF and the private link,
beside the bank details. No money passes through us, no fees for us, about a day to build,
and it lets the flyer say *"customers can pay you straight from the invoice"* honestly.

## The front door

One line, the promise. Three short lines under it: *Scan your receipts. Send invoices that
chase themselves. Know when you've been paid.* Then the sign-in card. **Free** said plainly;
removing a free tier later is the most hated act in this market, so don't promise for ever,
just say free.

## Two-week plan

| When | What | Who |
|---|---|---|
| 22-24 Oct | Agree this list; the first-visit questions; menu down to six + More | Atanas decides, Claude builds |
| 24-27 Oct | Quotes as a tab, Needs review as a badge, suppliers as a tab; Home with three buttons | Claude |
| 27-28 Oct | "Your payment link" and the Pay now button | Claude |
| 28-29 Oct | Front door words; look at 2-3 competitors signed in, cut any step we have that they don't | Atanas signs in, Claude walks |
| 29 Oct - 1 Nov | **iPhone test**: scan a batch, a quote, an invoice, a reminder, a payment link | Atanas |
| 1-3 Nov | Fix what the phone finds | Claude |
| 3-4 Nov | invoiceover.com (add it to the Turnstile widget FIRST), trading name and address on the legal pages, business details in Settings | Atanas + Claude |
| 5 Nov | Launch: flyers at the depots | Atanas and his brother |

## What would move the date

- The iPhone test slipping. It is the only real-device test the app has.
- Anything bigger than the payment-link box for payments.
- New features. The list above is the launch; everything else goes on the list for after.
