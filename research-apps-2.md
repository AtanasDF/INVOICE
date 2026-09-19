# Invoicing apps: second research pass (2026-09-19)

## What to add next

**1. A "Pay now" link on every invoice, with Pay by Bank as well as card**
Every invoice and PDF would carry a link or QR code so the client can pay from their own bank app or by card. This does more than anything else to get invoices paid quickly. Pay by Bank avoids card fees on large invoices: Tide caps the fee at £1 and Crunch charges from £1.10, compared with about 2.5% by card. ANNA ([source](https://anna.money/business-account/payment-link/)), Tide ([source](https://www.tide.co/features/invoicing/)), Crunch ([source](https://www.crunch.co.uk/features/crunch-pay)), Stripe ([source](https://docs.stripe.com/invoicing/payment-methods)) and Square ([source](https://squareup.com/gb/en/invoices)) all do this. Size: large (needs a payment provider).

**2. Mark invoices paid automatically**
When the money arrives, the matching invoice would be marked paid and the owner would get a "You've been paid" push notification. Nobody would need to tick invoices off by hand. Countingup's rule is simple and easy to copy: the payment reference includes the invoice number and the amount matches. The apps that do this only make it work with their own bank account. Invoicer could do it with any bank, through a bank feed or payment notifications. ANNA ([source](https://anna.money/invoicing-software/)), Tide ([source](https://www.tide.co/features/invoicing/)), Countingup ([source](https://countingup.com/resources/how-to-invoice-clients/)) and SumUp, where the free plan only matches on SumUp's own account ([source](https://www.sumup.com/en-gb/invoices/pricing/)). Size: medium to large.

**3. MTD Income Tax quarterly updates, and later VAT returns**
Invoicer would send the quarterly income and expenses to HMRC directly, using the data it already holds. MTD Income Tax has been compulsory for sole traders over £50k since April 2026, and ANNA and SumUp now offer this filing free. ANNA ([source](https://www.bytestart.co.uk/self-employed-accounts/anna-money-offers-free-mtd-income-tax-filings-ahead-of-deadline/)), SumUp ([source](https://www.sumup.com/en-gb/business-account/making-tax-digital/)), Crunch on its paid plans ([source](https://mtdcompare.co.uk/software/crunch/)). For VAT returns: Countingup ([source](https://countingup.com/vat-filing/)) and FreshBooks ([source](https://www.freshbooks.com/en-gb/pricing)). Size: large (needs HMRC recognition).

**4. A running "tax you owe so far" figure**
A live estimate of the Self Assessment bill that updates with every invoice and expense, plus reminders before tax deadlines. App Store reviewers single this out as a reason they like Countingup. Invoicer already has the sales, expense and CIS figures to work it out. Countingup ([source](https://countingup.com/features/)). Size: small to medium.

**5. Show when an invoice was opened, and send it by WhatsApp or text**
Invoicer already sends push notifications. The new part would be a push when the client opens the invoice, and a share button that sends it by WhatsApp or SMS as well as email. Many tradespeople deal with clients by WhatsApp, and knowing an invoice was opened tells you when to chase. SumUp ([source](https://www.sumup.com/en-gb/invoices/)), ANNA ([source](https://anna.money/free-tools/invoice-generator/)), Square ([source](https://squareup.com/gb/en/invoices)). Size: small.

**6. Reminders that get firmer each time, plus UK late-payment interest**
Invoicer already sends reminders, but other apps do this better. Crunch's wording steps up from polite to firm to final. Invoice Ninja sends first, second and third reminders, then keeps repeating, and can add a late fee to each one. For the UK, the equivalent of a late fee is statutory interest and fixed compensation under the Late Payment of Commercial Debts Act. Bonsai's reminders stop 16 days after the due date, which is the weakness to avoid. Invoice Ninja ([source](https://invoiceninja.github.io/docs/user-guide/advanced-settings)), Crunch ([source](https://www.crunch.co.uk/features/invoicing)), FreshBooks ([source](https://www.freshbooks.com/en-gb/pricing)), Bonsai ([source](https://help.hellobonsai.com/en/articles/3184331-removing-late-fees-from-your-invoices)). Size: small.

**7. Quotes that turn into invoices, and deposits**
The client accepts a quote, it becomes an invoice with one tap, and an upfront deposit or staged payments can be taken first. This protects cash flow on bigger jobs, which suits trades and CIS work. FreshBooks ([source](https://www.freshbooks.com/en-gb/pricing)), Square, where milestone payments are on Plus ([source](https://squareup.com/gb/en/invoices)), Invoice Ninja ([source](https://invoiceninja.com/)), Stripe Plus ([source](https://stripe.com/invoicing/pricing)). Size: medium.

**8. Create an invoice by typing or saying it**
The owner would type something like "Invoice Smith Ltd, 3 days at £250, plus VAT" and get a finished draft. ANNA also copies details from an older invoice, or from an email where ANNA is CC'd. Invoicer already uses AI to read receipts, so pointing it at invoice creation is a short step and makes invoicing on a phone much faster. ANNA ([source](https://anna.money/invoicing-software/)). Size: small to medium.

## Worth knowing

- **Free tiers are generous.** SumUp, Square and Crunch all give unlimited free invoices, and SumUp and Square include automatic reminders free. A reviewer criticised Tide for charging extra for reminders ([source](https://www.mobiletransaction.org/tide-invoicing-review/)).
- **Client limits and price rises are the most hated pricing tactics.** FreshBooks limits Lite to 5 clients and Plus to 50 ([source](https://startupowl.com/reviews/freshbooks)). Charge for tax filing or payments instead.
- **The top complaint about ANNA, Tide, Countingup, Square and SumUp is frozen accounts and money held back.** Invoicer does not hold client money, which is worth saying in its marketing.
- **CIS is badly served elsewhere.** FreshBooks has no CIS, Tide Accounting excludes CIS sole traders, and Crunch charges about £21.50/month for it as an add-on. Invoicer's CIS support is a real advantage.
- **Receipt scanning is usually limited or slow elsewhere.** FreshBooks keeps automatic capture to Plus (£30/month) and bills to Premium (£42/month). Crunch Snap takes up to 24 hours and allows 15 free scans a month. Also, make sure Invoicer's payment links don't expire: Stripe's stop working 30 days after the due date.

## Per app

**FreshBooks:** The polished all-rounder, from £16/month. Card and Direct Debit payments are built into invoices, with the Direct Debit fee capped at £4, or £2 on Premium. It has automatic reminders and late fees on every plan, plus deposits, quotes, MTD VAT filing and mileage tracking. It has no CIS, and receipt and bill capture cost more ([pricing](https://www.freshbooks.com/en-gb/pricing)).

**Invoice Ninja:** Free for up to 5 clients, and Pro costs $14/month. It works with many payment providers, including GoCardless, and has a client portal where clients view and pay. It has the most detailed reminder and late-fee setup of these apps, and expenses can be rebilled to clients. It has no UK tax features, and v5 is criticised for bugs ([pricing](https://invoiceninja.com/pricing-plans/)).

**Bonsai:** A US suite that goes from proposal to contract to invoice. Reminders are on by default but stop after 16 days. It separates recurring invoices from automatic card charging. UK support is weak: it has only a field for the VAT number and no MTD ([help](https://help.hellobonsai.com/en/articles/1065297-what-is-a-recurring-auto-payment-invoice)).

**ANNA Money:** Creates invoices from a typed or chatted request. Every invoice carries a payment link and QR code for Pay by Bank. It matches incoming payments to invoices and sends a "paid" push. Receipts are read by AI. It offers free MTD Income Tax and Self Assessment filing and has a free public invoice generator, which competes directly with Invoicer's ([source](https://anna.money/invoicing-software/)).

**Tide:** Free plan limited to 3 invoices a month, and reminders cost £5.99/month. Invoices get payment links and Pay by Bank with the fee capped at £1. It offers Tap to Pay on iPhone and matches payments automatically. Its accounting add-on excludes CIS users and the VAT Flat Rate Scheme ([source](https://www.tide.co/features/invoicing/)).

**Countingup:** Very quick invoicing on a phone, with the logo set once and a button to copy an invoice as a draft. Payments are matched by invoice number and amount. It prompts for a receipt photo after each card purchase, shows a live tax estimate, and files VAT returns in one tap, all included in the £5-£20/month fee ([source](https://countingup.com/vat-filing/)).

**Square Invoices:** Free and unlimited, making money from a 2.5% card fee. It sends pay links by email or text, automatic reminders, and can charge a saved card. It supports buy-now-pay-later through Clearpay, and quotes plus milestone payments on Plus (£20/month). Invoices show a proper UK VAT summary. It has no MTD or CIS ([source](https://squareup.com/gb/en/invoices)).

**Stripe Invoicing:** Charges 0.4% per paid invoice on top of payment fees. It has the widest choice of UK payment methods, including Bacs Direct Debit and bank transfer, plus a hosted payment page, partial payments and retries of failed payments. It is built for developers and has no UK tax features ([source](https://docs.stripe.com/invoicing/hosted-invoice-page)).

**SumUp Invoices (formerly Debitoor):** Free and unlimited, with a 2.5% fee on online payments. You can share invoices by WhatsApp or Messenger and get a push when an invoice is viewed, paid or overdue. It also has standalone payment links and a free MTD Income Tax tool. Reviews are poor after the takeover: 1.5/5 on Trustpilot ([pricing](https://www.sumup.com/en-gb/invoices/pricing/)).

**Crunch:** Crunch Free has unlimited invoices. CrunchPay adds a Pay Now button, including Direct Debit, from £1.10 per payment, and Crunch says it gets invoices paid 3x faster. Reminder wording gets firmer each time. It invoices in 5 currencies. MTD filing starts at £10/month and CIS is a paid add-on. Its Snap receipt app is slow and capped ([source](https://www.crunch.co.uk/features/crunch-pay)).
