## The dashboard, and the shape of the app around every page

### Dashboard — `/` (when you are signed in)

- **What it is for.** The one page you land on. It is built as a scanner first: one big button to photograph paper, and everything else — what you're owed, what you owe, what you spent — underneath it. A stranger who opens the same address gets the welcome page instead (`src/components/Welcome.tsx`); the file decides between the two at the very bottom (`src/app/page.tsx`, `export default function Home`).
- **How you get there.** Tap the name **Invoiceover** in the top-left of any page, or **Home** in the menu. Signing in lands here.
- **What is on it**, in the order it appears on screen:

  1. **"Dashboard"** and the line *"Photograph the paper, and the rest fills itself in."*
  2. **A grey hint box** ("Point the camera at a receipt, a bill or an old invoice…") with a **Got it** link. Shows on the first three visits then stops — counted on the device as `tip:dashboard-welcome` in localStorage (`src/components/Tip.tsx`, `src/lib/tips.ts`).
  3. **Up to four notice bars**, each one only when it applies:
     - amber, *"You have N overdue invoices — worth checking if they've been paid"* → **Review** goes to `/invoices?status=overdue`. Only shown if the Settings switch `showOverdueReminders` is on (it defaults to on).
     - amber, *"N recurring expenses are due — log them so they're not forgotten"* → **Review** → `/recurring`.
     - amber, *"N bills need paying soon"* → jumps down the page to **Bills to pay** (`#bills-to-pay`).
     - grey, *"N emailed receipts are waiting on review before they count toward your totals"* → **Review** → `/receipts/review`. This one has no ✕.
     The three amber ones have a ✕, but **the dismissal is not remembered** — reload the page and they are back.
  4. **The big black button: "Scan a receipt or bill"** with *"Several in a row is fine"* under it → `/scan`. On an iPhone where the OS camera has been chosen (`scanner-mode` = `native` in localStorage) the button *is* the camera input, so it opens the camera on the first tap, shrinks the photo and hands it to `/scan` through `sessionStorage` (`src/lib/scanHandoff.ts`). It is deliberately more than 1.3× the height of the tiles under it, and a suite pins that it comes before everything else on the page.
  5. **Four square tiles** — two across on a phone, four across on a laptop:
     - **Create an invoice** → `/free-invoice?start=photo` (that page opens the camera on arrival)
     - **Write a quote** → `/quotes/new`
     - **Check a company** → `/check-company` (put next to the quote on purpose — check who you're dealing with before you price the job)
     - **Copy a document** → `/copy`
  6. **One line of small print:** *"'Create an invoice' photographs an old one and fills the next in for you, or **write one by hand**"* → `/invoices/new`.
  7. **"Setting up"** card (`src/components/GettingStarted.tsx`, rules in `src/lib/gettingStarted.ts`) — a six-item list that ticks itself off, with a progress bar, a **Put this away** link (remembered on the device as `getting-started-hidden`) and, at the foot, *"New to it? **See how it works**"* → `/help`. The six: business name (a name of literally `PLACEHOLDER` does not count), address, where invoice numbers start, bank details, first customer, first receipt or invoice. The whole card disappears once all six are done. **VAT registration is deliberately not on the list** — the database stores it as plain true/false, so the app cannot tell "no" from "never answered", and a step that can't know whether it's done would nag forever.
  8. **"Upload a document"** panel (`src/components/UploadPanel.tsx`) — three buttons side by side, each going straight where it says instead of opening a chooser that asks again: **Photos** (camera roll), **Files** (accepts PDFs only, which is the trick that makes iOS open the Files browser directly rather than its three-way sheet), **Email it in** (reveals your own private address, *creating it silently on the first tap* if you've never had one, and says forwarded mail lands in **Needs review**, with a **Copy the address** button). The whole panel is also a drag-and-drop target, and the page listens for a pasted screenshot. One quiet line says so.
  9. **"Your file library →"** — the picture strip. Its own section below.
  10. On a brand-new account only: *"Just starting? Scan a few invoices you have already sent and the numbering carries on from yours."*
  11. Two text links: **Add a receipt by hand** → `/receipts/new`, **Make a quote** → `/quotes/new`.
  12. **Three tabs in one white pill: Receipts & bills · Invoices & customers · Invoices sent.** Money out is first on purpose. Which one you're on is remembered per device (`dashboard-tab` in localStorage), and you can **slide between them with a finger** — only the panel strip moves, the header and the scanner stay put (`src/components/SwipePanels.tsx`: follows the finger, gives at the ends, a quarter of the screen commits, never steals up-and-down scrolling, arrow keys work, the two panels you're not looking at are hidden from screen readers and can't be tabbed into).
  13. On a brand-new account: a **"Nothing here yet"** card instead of nine £0.00s.
  14. **The three panels** (below).
  15. **"Put Invoiceover on your phone"** (`src/components/GetTheApp.tsx`) — shows nothing at all if you're already running it as an app. On Android/Chrome it's an **Install it** button; on iPhone it's three written steps (share button → Add to Home Screen → Add); otherwise three generic steps.
  16. **"Other tools"** — a thin row of small links above the footer: **Your file library →** `/files`, **Recurring expenses →** `/recurring`, **Recurring invoices →** `/recurring/invoices`.

**Panel 1 — Receipts & bills** (the one you land on)
  - **"Bills to pay"** — every unpaid supplier invoice, *however far off*, soonest first, undated last. A bill still waiting to be reviewed is left out. Each row: supplier name (the linked supplier, else the name the scanner read, else "Unknown supplier") · its invoice number · when it's due, coloured — *"Overdue by 4 days"* red, *"Due today" / "Due tomorrow" / "Due in 3 days"* amber, *"Due 14 Oct"* grey, *"No due date"*. The amount is gross with any credit note already taken off. **Mark as paid** acts immediately with no "are you sure"; if the save fails the row comes back with a red line.
  - **"Receipts and bills you have scanned"** — the newest 8, **See all** → `/receipts`. Each row goes to `/receipts?open=<id>` (there is no page for one receipt; the list opens that row instead). Sub-line: date, plus *"bill, paid" / "bill, to pay" / "credit note" / "waiting on review"*.

**Panel 2 — Invoices & customers**
  - **"Who you work with"** (`src/components/dashboard/People.tsx`) — one search box across customers *and* suppliers together, because nobody thinks "is Travis Perkins a customer or a supplier". Three buttons: **+ Add a company** (`/clients/new`), **+ Add a customer** (`/clients/new?person=1`), **+ Add a supplier** (`/clients/new?kind=supplier`). Then up to 6 names, busiest first (by how many non-draft invoices they have), or up to 12 matches when you search. **Tapping a name starts a new invoice for them** — `/invoices/new?client=<id>`, with "New invoice →" on the right. Archived contacts never appear. **See all** → `/clients`.
  - **Three squares on one line, never stacked: Owed to you** (→ `/invoices`), **Overdue** (red when above zero, → `/invoices?status=overdue`), **Spent this month** (→ `/expenses`).
  - **"Awaiting payment"** — up to 5 invoices, soonest due first, each row → `/invoices/<id>`. With more than one, a **Mark several paid** link turns the rows into tick boxes and adds shortcut chips: **All of them**, and **All from &lt;customer&gt;** for up to four customers. The button then reads e.g. *"Mark 3 paid · £4,210.00"*. Nothing is written until it's pressed; it records a payment for exactly what's still owed on each and sets it paid, and if one fails it names that invoice number and keeps the rest. **View all N outstanding** → `/invoices?status=to_receive`.
  - **"How late is what you're owed"** — five lines: Not yet due / 1–30 / 31–60 / 61–90 / 91+ days overdue. An invoice with no due date counts as "Not yet due".
  - **"Tax so far · 2026/27"** (`src/components/TaxSoFar.tsx`) — *"Set aside about £X"*, income tax + Class 4 NI, less any CIS contractors have already kept back; then Invoiced / Costs / Profit, VAT to pay so far if you're VAT registered, a "at this rate the whole year comes to…" projection, the next Self Assessment date with a countdown, and a paragraph of honest small print (sole trader in England, Wales or NI, no other income; Scottish rates and payments on account change it). When there's nothing yet, or it's too early in the tax year for a figure to mean anything, it collapses to a single grey line.
  - **"This month"** on one line → `/expenses`: spent excl. VAT, and the VAT.

**Panel 3 — Invoices sent**
  - **"Invoices you have sent"** — newest 8, **See all** → `/invoices`, each → `/invoices/<id>`, sub-line *"#INV-042 · 14 Sep · sent"* (or "Draft").

- **What it does behind the scenes.** One load on arrival: seven reads in parallel through `src/lib/storage.ts` — clients, receipts, invoices, business profile, recurring expenses, credit notes, payments — straight from Supabase under row-level security. Nothing is cached and there is no server rendering of your figures; every number on the page is worked out in the browser. The important rules live in libraries, not here: `src/lib/invoiceBalance.ts` (what's still owed), `src/lib/cis.ts` (the contractor's deduction, and the fact that everything about what a customer owes goes by `due`, not the total), `src/lib/taxEstimate.ts`, `src/lib/invoiceStatus.ts` (overdue), `src/lib/today.ts` (today, in London time, never UTC), `src/lib/money.ts`. Two deliberate choices worth keeping: **this month's spending excludes anything still waiting on review**, so an emailed receipt nobody has checked cannot skew it; and **a failed load shows one red line and no figures at all**, because a page of zeros reads as "nothing is owed" when it actually means "we couldn't reach your records". The **number on the home-screen icon** (`src/lib/appBadge.ts`) is overdue invoices + recurring expenses due + bills due within three days, and is deliberately *not* set when the load failed.
- **Where it takes you next.** `/scan`, `/free-invoice?start=photo`, `/quotes/new`, `/check-company`, `/copy`, `/invoices/new`, `/receipts/new`, `/clients/new` (three variants), `/invoices/new?client=<id>`, `/invoices`, `/invoices?status=overdue`, `/invoices?status=to_receive`, `/invoices/<id>`, `/receipts`, `/receipts?open=<id>`, `/receipts/review`, `/recurring`, `/recurring/invoices`, `/expenses`, `/clients`, `/files`, `/settings`, `/help`.
- **Free, gated, or not built.** Behind sign-in — a stranger never sees it. **It costs nothing to run**: no AI call, no paid API, only your own database rows. One caveat: it quietly pre-loads the 13 MB page-finder for the camera in the background, **but only for somebody who has used the camera before** — a first-ever visit downloads none of it. Nothing on this page is behind an environment switch.

### Your file library (the strip on the dashboard) — part of `/`

This is the one Atanas said he would redesign, so here is exactly what is there today (`src/components/FileStrip.tsx`, plus `src/components/DateRoller.tsx`).

- **What it is for.** A look at the documents you've saved, without leaving the dashboard.
- **How you get there.** It sits on the dashboard directly under **Upload a document** — upload something, then see what you have. Its title is also the way to the full page.
- **What is on it**, top to bottom in one white card:
  1. **"Your file library →"** in large bold, which is a link to `/files`. On the right, a small grey count: **"7 of 23"** (how many the filter is showing, of everything).
  2. **A grey pill switch: Photos | Files.** *Photos* shows only things that have a picture. *Files* shows everything saved, **including records whose photograph has been emailed away and cleared**, and including sales invoices (which never have a picture at all).
  3. **The date roller** — three snapping columns, **Year / Month / Day**, that roll under a thumb, a mouse wheel or the arrow keys. Stop wherever you like: a year on its own means the whole year, add a month and it means that month, add a day and it means that day. **All year** and **All month** sit at the top of the second and third columns so you can widen again. The Day column is greyed out until a month is picked. Years run unbroken from the oldest thing you've kept to this one — no gaps, because a dial that jumps from 2026 to 2023 makes you wonder what happened. Days that have something get a small dot; days with nothing are still listed.
  4. **"Pick a period"** — opens **From** and **To** date boxes and a **Show them** button. While a period is on, the roller is hidden, the dates are printed beside the button, and the button reads **"Back to the roller"**.
  5. **The strip itself** — tiles about 112px wide (128px on a laptop) that scroll sideways and snap, roughly five on a phone screen, deliberately bigger than the tiles above because a picture you can't recognise at a glance is worth nothing. Each tile: the picture (or the words **"No picture"**, or **"Emailed to you"** where the photo has been aged out), then the name — a supplier name, or "Receipt", or "Invoice 42" / "Draft invoice" — then **date · note**, where the note is the amount for a receipt and the status word ("sent", "draft") for an invoice.
  6. **When the filter finds nothing:** *"No pictures that year. Roll to another date, or **open the whole library**."*
- **What it does behind the scenes.** It is given the receipts and invoices the dashboard already loaded — it fetches nothing of its own, so it costs nothing and cannot fail on its own. Receipt tiles link to `/receipts?open=<id>`, invoice tiles to `/invoices/<id>`.
- **Four things worth knowing before redesigning it:**
  - **Sales invoices are in it but can never have a picture**, so in *Files* mode a working account shows a row of grey "No picture" boxes among the photos.
  - **There are no thumbnails.** The tile renders the full stored image (about 300–500 KB each, 1600px long edge — `src/lib/imageDownscale.ts`) squeezed into a 112px box. Twenty receipts in view is several megabytes over a phone connection, on the page that is meant to open instantly.
  - **A receipt that arrived as a PDF renders as an empty box.** `/files`, `/receipts` and `/receipts/review` all check for a PDF and draw a document icon instead (`src/lib/fileType.ts`, `isPdfDataUrl`); the dashboard strip does not check, so it puts the PDF in an `<img>`, and it still counts in the "N of M" as a picture.
  - **The amount on a receipt tile is the net figure** (`r.amount`, excluding VAT), while every other amount on the dashboard is gross. Two tiles and a list row can show the same receipt at two different numbers.
- **Where it takes you next.** `/files`, `/receipts?open=<id>`, `/invoices/<id>`.
- **Free, gated, or not built.** Free, behind sign-in, no running cost. Note there are **two libraries with different looks**: this strip, and the full page at `/files` — a grid of square tiles with a tap-to-preview overlay that handles PDFs in an iframe. A redesign of one leaves the other as it was.

### The header, and how you get everywhere — every page

- **What it is for.** The one way around the app. One app, not two: everything is in three groups by what it is about.
- **What is on it.** Left: **Invoiceover**, which is a link home. Right, when signed in and on a screen wider than about 640px: **Home · Money in ▾ · Money out ▾ · Tools ▾ · Settings · Sign out**. On a phone that collapses to **Menu ▾ · Sign out**. Signed out, the header holds one link: **Sign in**.
- **The three groups, exactly as they are today** (`src/lib/navGroups.ts` — this file *is* the app's map of itself, and the help chat and a test suite both read it so it can't drift):
  - **Money in:** Invoices `/invoices` · Quotes `/quotes` · **Money** `/money` · **Jobs** `/jobs` · Customers & suppliers `/clients` · Recurring invoices `/recurring/invoices`
  - **Money out:** Receipts & bills `/receipts` · Needs review `/receipts/review` · Expenses `/expenses` · Mileage `/mileage` · Recurring expenses `/recurring`
  - **Tools:** Scan `/scan` · Copy a document `/copy` · **Change a file** `/convert` · Check a company `/check-company` · VAT `/vat` · Files `/files` · **How it works** `/help` · Feedback `/feedback`
  Nineteen pages, plus Home and Settings. The phone **Menu** holds all 21 in one scrolling panel: Home, then each group under a small grey heading, then Settings at the bottom. There is no "More pages" drawer and no bottom tab bar.
- **What it does behind the scenes.** Each menu is a plain HTML `<details>`, so **it opens on the very first tap, before any of the app's own code has started** — that was a direct fix for "whenever I click, it takes ages and three, four clicks". Script only ever *closes* it: when the page changes, on Escape, or on a tap elsewhere. **Which item is highlighted** is decided by the longest address that matches where you are (`useCurrentHref` in `src/app/AppShell.tsx`), so `/receipts/review` marks **Needs review** and not Receipts & bills; the match is shown bold and announced to a screen reader as the current page. The whole header is **hidden on `/i/…`, `/q/…` and `/r/…`** — a customer opening your invoice link sees the invoice, not your app.
- **Free, gated, or not built.** Free. The header is built and complete; nothing in it is switched off.

### "+ Add" — the one add button, on four list pages

- **What it is for.** One button that starts anything, instead of every page asking "receipt or invoice?" before the work begins.
- **How you get there.** Top-right of **Invoices** `/invoices`, **Receipts & bills** `/receipts`, **Customers & suppliers** `/clients` and **Quotes** `/quotes`. **It is not on the dashboard** — the dashboard has the big scan button and the four tiles instead.
- **What is on it.** A black **+ Add** button opens a sheet that slides up from the bottom of a phone (centred on a laptop), headed *"What are you adding?"*:
  - **Scan it** — *"A receipt, a supplier invoice or a credit note — the scanner works out which, and reads several in a row."* → `/scan`
  - **Upload a photo or PDF** — opens the file picker there and then
  - *then the page's own two ways in*, e.g. on Invoices: **Scan an invoice** ("Photograph one and fill this page's form from it") and **Fill it in by hand** — dropped automatically when they would repeat one of the standard rows below
  - **Add a receipt by hand** — *"Nothing to photograph — type the total in"* → `/receipts/new`
  - **Make an invoice** — *"Bill a customer for work you've done"* → `/invoices/new`
  - **Make a quote** — *"Price a job before you do it"* → `/quotes/new`
  - **Add a customer or supplier** — *"Someone you work for, or buy from"* → `/clients/new`
  - **Copy a document** — *"Photograph any paper into one file to save or send"* → `/copy`
  - **Cancel**
  If the camera has been blocked for the site, an amber line appears above the list before you tap anything — and on an iPhone it gives the actual Safari steps (`SAFARI_CAMERA_TIP` in `src/lib/camera.ts`) rather than a generic "check your settings".
- **What it does behind the scenes.** `src/components/AddAnything.tsx`; the per-page wrapper is `src/components/ScanOrAdd.tsx`, which also puts **Upload from files** out in the open beside the + Add button. Opening the sheet pre-loads the `/scan` route and asks the browser whether the camera is already refused. Escape closes it.
- **Free, gated, or not built.** Free and signed-in only, like the pages it sits on. The rows that cost money are the ones that end at the reader (`/scan`, and the scan-a-document routes).

### Upload from files — the small button that appears beside a camera

- **What it is for.** Photos or PDFs already on the phone or laptop, straight into whatever page reads them.
- **How you get there.** `src/components/UploadFilesButton.tsx`, used inside the **+ Add** sheet, beside it on those four list pages, and on `/scan`, `/copy`, `/invoices/new` and `/clients/new`.
- **What it does.** Reads the files in the browser, says *"Reading files…"* while it works, then hands them to the reading page **in memory** (`src/lib/scanHandoff.ts`) with `upload=1` in the address — nothing is uploaded to a server by this button itself. If a file can't be read it says so in small red type and keeps the ones that could. A page you have already left is never yanked back to the reader. There is also a camera variant (`camera` prop) that goes through the phone's own camera and so needs no site permission at all — that is the escape hatch when the browser camera has been blocked.
- **Free, gated, or not built.** Free. Whether the *reading* costs money depends on where the files land (`/scan` calls the AI reader; `/copy` reads nothing).

### The frame around every page — `AppShell`

- **Who is let in** (`Gate` in `src/app/AppShell.tsx`). Nothing works before an account. Public: `/`, `/login`, `/reset-password`, `/privacy`, `/terms`, `/security`, `/accessibility`, `/how-to-invoice`, `/offline`, and the customer links `/i/…`, `/q/…`, `/r/…`. Every other address sends a stranger to `/login`; somebody already signed in who lands on `/login` is bounced on to wherever they were going. Each exception has a reason written beside it in the code — a legal page must be readable before anyone hands over an email address, a security report shouldn't need an account, and the offline page is shown exactly when the sign-in check can't be made.
- **The footer**, small and grey on every page, never printed: **Invoiceover · How it works · How to invoice · Your information · Terms · Accessibility · Security · Tell us something**.
- **The Feedback pill** — a small black round button fixed at the bottom-right of every page for a signed-in user, except on `/feedback` itself and the customer links. On a phone it steps aside on `/free-invoice`, which is the one screen with its own bottom bar (it used to sit on top of it and swallow taps meant for Print and Next invoice).
- **Getting paid** (`src/components/PaidCelebration.tsx`) — confetti, a buzz and the amount for 2.6 seconds, listening on every page. It is fired from the invoice page and the invoices list only; **marking invoices paid from the dashboard's "Mark several paid", and marking a bill paid there, fire nothing.**
- **Small things that are easy to miss:** the theme is set in the page's `<head>` before the first paint so nothing flashes grey (`THEME_BOOT`, `src/lib/theme.ts`); a service worker is registered for everybody, not just people who turned notifications on, so the offline page actually reaches a van with no signal; the screen is kept awake while the app is open (`src/lib/wakeLock.ts`); the keyboard is moved to the main content on every page change; and errors thrown by the app itself are reported (`ReportErrors`).
- **Free, gated, or not built.** All free, all built. The header, footer and gate cost nothing to run.

### What free means today, in this area

Everyone signed in has the whole app and pays nothing; there is no paid tier and no payment screen anywhere. But **one real limit is already live and has been since 23 September**: every account is `free`, and a free account may put **300 documents a day through the reader for its first seven days, then 50 a day and 600 a calendar month**, with one self-serve top-up of another 600 per month (`web/supabase/migration-036-*.sql`, function `scan_limits()`; enforced in `src/lib/scanLimit.ts`; switched on by `SCAN_LIMITS=on` in production). A `paid` account would have no limit, but nothing can make an account paid. **The dashboard never mentions any of this** — the counter (`src/components/ScansLeft.tsx`) only appears on `/scan` when you are near the wall, and in full on `/settings`.

### Worth deciding

- **The free line, now that a limit already exists.** A free account is stopped at 50 documents a day and 600 a month today. Is that the free tier you want to announce, or the invisible ceiling before one? Should the dashboard say where you stand — "412 of 600 this month" — or should the number stay out of sight until it matters?
- **Does the first week stay generous?** A new account gets 300 a day for seven days so somebody catching up on a year of receipts doesn't hit a wall on their first evening. Keep it, lengthen it, or drop it?
- **The dashboard opens on Receipts & bills.** Money out first was your call, on the grounds that scanning is what people open the app for. Should that still be the landing panel for somebody whose day is invoices, or should the app pick the panel from what the account actually contains?
- **Three panels, or fewer?** "Invoices & customers" now holds six things (people, three squares, Awaiting payment, the ageing table, Tax so far, This month) while "Invoices sent" holds one list of eight rows. Is that one panel worth keeping, or does it belong inside the invoices list?
- **The file library: which library survives?** There are two — the sliding strip on the dashboard and the square grid at `/files`. Do you want one design used in both places, or is the strip a glance and the page a proper library?
- **In the library, do sales invoices belong at all?** They can never have a picture, so in *Files* mode they are grey empty boxes among the photos. Photos only, or photos plus a proper document icon for PDFs and invoices?
- **The four tiles under the big scan button** are Create an invoice, Write a quote, Check a company, Copy a document. Is that the right four, and in that order, for the person you have in mind?
- **No bottom bar.** Everything on a phone goes through one **Menu** button holding 21 links. Would three or four fixed buttons along the bottom (Home, Scan, Invoices, Menu) suit the way you actually hold the phone better?
- **Dismissed notices come back on reload.** Should ✕ on the overdue / recurring / bills bars mean "not today", "not until this changes", or "not again"?
- **"Mark as paid" on a bill happens instantly, with no confirmation and no celebration**, while marking an invoice paid from its own page throws confetti. Which of the two is the behaviour you want on the dashboard?
- **Setting up** hides itself when all six items are done, and "Put this away" hides it for good on that device. Should there be a way back to it, or is `/help` enough?
- **Email it in** creates a private inbox address silently the first time somebody taps the button. Is that the right moment, or should it be something you switch on deliberately in Settings?

### Surprises found while reading

**The CLAUDE.md description of the dashboard and the menu is out of date in several places.** Worth fixing before another session builds on it:

- It says the dashboard's first row is *"Scan a receipt, Make an invoice, Copy a document, Check a company, with '+ Add' and 'Upload photos or PDFs' under them"*. What is actually there: one big **"Scan a receipt or bill"** button, then four tiles — **Create an invoice, Write a quote, Check a company, Copy a document** — then a line offering to write one by hand, then **Setting up**, then the three-door **Upload a document** panel, then the file strip. **There is no "+ Add" button on the dashboard at all**; `AddAnything` is used only on `/invoices`, `/receipts`, `/clients` and `/quotes`.
- It describes **Money in** as *"invoices, quotes, clients, recurring invoices"*. It now also holds **Money** (`/money`) and **Jobs** (`/jobs`), two pages CLAUDE.md never mentions anywhere. `/money` is "Everything owed to you and everything you owe, latest first"; `/jobs` is "One piece of work, with what it brought in and what it cost".
- It describes **Tools** as *"scan, copy a document, check a company, VAT, files, feedback"*. It also holds **Change a file** (`/convert`) and **How it works** (`/help`).
- It says a phone menu holds *"nine links"*. It holds 21 rows (19 pages plus Home and Settings).
- The copy of CLAUDE.md that was loaded into this session came from `/Users/nasko/Desktop/INVOICE/CLAUDE.md`, **which no longer exists** — the project moved to `/Users/nasko/INVOICE` on 25–26 September. The loaded copy still said `SCAN_LIMITS` was "not set, and deliberately"; the real file says it has been **`on` in production since 23 September**. Anything read from a Desktop path is a stale copy.

**Two things in my area that look like genuine defects, not decisions:**

- **The dashboard's file strip shows a PDF receipt as an empty box.** `/files`, `/receipts` and `/receipts/review` all test with `isPdfDataUrl` (`src/lib/fileType.ts`) and draw a document icon; `src/components/FileStrip.tsx` does not, so it puts the PDF straight into an `<img>` — and counts it in the "N of M" as a picture. A receipt emailed in as a PDF, which is the commonest kind, is invisible there.
- **The strip loads full-size photographs into 112px tiles.** There are no thumbnails anywhere in the project; stored images are ~300–500 KB each at 1600px. Twenty receipts in one filter is several megabytes downloaded on the page that is meant to open instantly — on the iPhone where the app is actually used. This is a plausible part of "the app felt slow" that has nothing to do with the scanner.

**Two smaller inconsistencies:**

- The receipt tiles in the strip show the **net** amount (`r.amount`, excluding VAT) while every other amount on the dashboard is gross, so the same receipt shows two different numbers on one screen.
- Marking invoices paid from the dashboard (**Mark several paid**) and marking a bill paid there both skip `celebratePaid`, so the confetti-and-buzz moment fires from `/invoices` and `/invoices/<id>` only.

**Half-built or dormant, for the record:** no paid tier exists anywhere (nothing can set an account to `paid`, so the unlimited branch of `scan_limits()` is unreachable); invite-a-friend is fully built and applied to the database but renders nothing without `NEXT_PUBLIC_INVITES`; the help chat is built but `/help` ends at the walkthroughs and the route answers 404 without `NEXT_PUBLIC_HELP_CHAT`. None of these are visible from the dashboard.
