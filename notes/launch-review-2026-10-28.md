# Launch review, 2026-10-28

The whole app walked on his account (atanaschoo@gmail.com) at iPhone width (390 pt), in
dark mode, the way he uses it. Every page in the menu was opened; the main ones were
looked at screen by screen. Automated pass over 22 pages: **nothing scrolls sideways on
any page**, and every form box has a name a screen reader can read. What is below is what
a person sees.

## Broken

1. **iPhone batch camera threw every shot away.** Fixed today (`b863a23`), proven against
   a stand-in, **not yet confirmed on his phone**.
2. **A white invoice on a white worktop is never found** (`test-pale`, red). Light wood and
   dark tables are fine.
3. **The Feedback pill sits on top of content on every page**: the receipt row's Remove,
   the amounts on the dashboard list, the Save bar in Settings, the VAT figures. On a phone
   it covers the right-hand edge of whatever is at the bottom of the screen.

## Confusing

4. **Too many doors to the same room.** The dashboard alone offers Scan, Upload (Photos /
   Files / Email it in), "drag files or paste", Add a receipt by hand, Send an invoice, Send
   a quote, photograph an old invoice, check a company. Customers has "Bring in a list",
   "+ Add", "Upload a file" *and* a "Choose files" card, four ways in. The same action is
   called "Upload a document", "Upload a file", "Upload from files" and "Upload a photo or PDF".
5. **The menu is 21 links** (Home, Scan, Invoices, Receipts, Customers, Mileage, then
   Quotes, Needs review, Expenses and tax, Money, Recurring invoices, Recurring expenses,
   Jobs, Files, Copy a document, Change a file, Check a company, VAT, How it works,
   Feedback, Settings). Nobody reads past the first six. Money, Expenses and VAT are three
   views of one question; Copy a document and Change a file are side tools.
6. **A "How it works" box on every page**, stacked on top of a subtitle that already says
   the same thing (Money, Expenses, VAT, Mileage, Files, Needs review, Settings). The page
   is pushed down a third of a screen before anything happens.
7. **Words written for us, not for him.** New invoice: "Scanning fills in the date, line
   items, and notes from a source document (a timesheet, delivery note, etc.) -- the
   customer is always your own choice below, never guessed." Expenses is headed "2026-10".
   Draft help: "fully editable until you mark it sent, which is what assigns its invoice
   number, locks the rest in, and starts the due-date clock."
8. **Settings is one page ten phone screens long** (7,443 px, 12 sections: business, VAT,
   numbering, bank, categories, reminders, account allowance, look, phone, notifications,
   email import, account). The things he sets once and the things he changes are mixed.
9. **The dashboard is five screens** (3,794 px): a tip, the emailed-receipt banner, the
   scan card, invoice/quote, Setting up, Upload, the File library with Year / Month / Day /
   Pick a period, three tabs, and the lists. The library's filters ("All year / Jan", a
   greyed "All month") are the hardest thing on the screen and belong on Files.

## Ugly

10. **New invoice uses the hint inside the box as its label**, so on a phone the hints are
    cut off ("Customer -- type a name, or tap the", "Description (e.g. Monthly work, 12-30
    Jun", "Tags, comma separated (optional, e.g. Si", "Standard (20%"), and once typed in,
    the box no longer says what it is. Every other form has a label above the box.
11. **Needs review is two columns on a phone**: a thumbnail beside the form, so dates read
    "23/07/20" and the supplier "Brightwork P". One column with the picture on top.
12. **Cards inside cards, borders on everything.** Almost every block has a white outline,
    including the tips and the filter. It reads as a form rather than a finished app.
13. **Category "Household" on a B&Q receipt** in a business app: the category list mixes
    personal and business on the same screen.

## Before launch, outside the code

14. **Hosting is the Vercel Hobby plan, which is for non-commercial use.** A launched,
    public app needs Pro. Same check for Supabase: the plan decides backups and whether the
    project can be paused.
15. **The domain.** It is still `invoice-omega-rust.vercel.app`. Moving to invoiceover.com
    needs the Turnstile widget's hostname list updated first or sign-in breaks
    (CLAUDE.md, environment section), plus Supabase's redirect URLs.
16. **ICO registration.** A UK business processing other people's personal data pays the
    ICO data protection fee. The privacy page should name the registration.
17. **HMRC VAT check** is sandbox only. Production needs the application and up to 10
    working days of review. Optional for launch; the boxes already catch typos without it.
18. **Help chat, invites and photo ageing are built and switched off.** Fine to launch
    without; decide each one on purpose.

## The plan

Each step ends live and checked on his iPhone before the next starts.

**Week 1: make what is there work and read well**
- A. Confirm the camera fix on his phone with real invoices; fix the white-worktop case.
- B. Move the Feedback pill out of the way: into the menu and the footer, or as a small
  tab that never sits over a button.
- C. One word for each action ("Scan", "Upload", "Add by hand") everywhere, and one way
  in per page.
- D. Labels above the boxes on New invoice; Needs review in one column.
- E. Plain-English pass over every subtitle and help line; drop the "How it works" boxes
  where the subtitle already says it.

**Week 2: organise it the way he uses it**
- F. Menu down to five or six: Home, Scan, Invoices (with quotes), Receipts (with review),
  Customers, Money (owed, owe, expenses, VAT, mileage in one place); tools and Settings
  under that.
- G. Dashboard to two screens: what needs doing, the scan button, money owed / owing, the
  last few documents. The library and its filters move to Files.
- H. Settings split into a few short pages: Business, Invoices and payments, Account.

**Week 3: make it beautiful, then launch**
- I. One visual pass: fewer borders, cards only where they group something, consistent
  spacing, checked in light and dark on the phone.
- J. Launch list: Vercel Pro and the Supabase plan, invoiceover.com (Turnstile hostname
  first), ICO fee, a real business name in Settings, the full harness green, then the
  front door goes public.

Steps B, C, D and E are independent and small. F, G and H change where things live, so
they want his say on the menu first.
