## How it looks, and the pages nobody visits on purpose

Read out of the code on 2026-09-28, in `/Users/nasko/INVOICE/web/`. Two halves. The first is the look — the colours, the shapes, the type, the print sheet, the first-time notes, and what the app says when it refuses. Every number below is the real one, in the real file, so it can be changed by editing that line. The second half is seven pages that exist because somebody had to write them, plus three screens nobody ever navigates to on purpose.

**One fact that touches this whole section:** reading a document is **limited today**. `SCAN_LIMITS` is `on` in production and has been since 2026-09-23 — 300 documents a day for an account's first seven days, then 50 a day and 600 a month, with one free top-up of another 600 per month. Nobody is on a paid plan; the paid tier does not exist. The limit has real wording and a real card on Settings, both described below. Note that the comment at the top of `src/lib/scanLimit.ts` still says *"OFF BY DEFAULT"* — the code is right, the comment is four days stale.

---

## Part one — how it looks

### The one idea: "neutral" is not grey

The app had 1,331 `neutral-*` classes in it when the themes were built (it now has **1,617**). Rewriting them would have been a huge diff with a real chance of leaving a grey patch behind. So the *meaning* of neutral is what changes instead. `src/app/globals.css` defines eleven variables, `--n-50` through `--n-950`, and an `@theme inline` block points Tailwind's whole `neutral` scale at them:

```
--color-neutral-900: var(--n-900);   /* and so on for 50..950 */
--color-white: var(--paper);         /* so bg-white follows the lights too */
```

A theme is nothing but a different set of values for those eleven variables. Every existing class follows for free. That is why **no component may ever hard-code a hex** — a hex is a colour that cannot follow a theme, and the one that slipped through (a white background on every date box) made every date in the app invisible in dark mode: measured at 1.1:1 where every other input on the same page was 15.64:1.

Four tokens sit beside the scale:

| Token | What it is | Light | Dark |
|---|---|---|---|
| `--paper` | what `bg-white` means: cards, sheets, the drawn paper on the front door | `#ffffff` | `#191b1f` |
| `--ink-on-dark` | always white, never inverted — the camera viewfinder, the full-screen photo, a tip over a dark backdrop | `#ffffff` | `#ffffff` |
| `--sheet` | real paper, never themed: a surface whose contents get **printed**. Only the signature pad uses it, because what you draw there ends up on a white invoice | `#ffffff` | `#ffffff` |
| `--background` / `--foreground` | the page surface and the words on it, both pointed at the scale | `--n-50` / `--n-900` | same |

### The five themes, with their real colours

`src/lib/theme.ts` holds the list; `globals.css` holds the values. The picker shows **seven** rows: "Follow my phone", then the five colours, then Dark. Note the ids and the names on screen differ — `slate` is shown as **Blue**, `forest` as **Green**, `ink` as **Navy**.

| On screen | id | Its one line | Swatch in the picker | Its darkest (`--n-900`, so the primary button) | Its page (`--n-50`) | Its mid-tone (`--n-500`) | `--accent` |
|---|---|---|---|---|---|---|---|
| **Grey** | `grey` | "Plain and quiet" | `#404040` | `#171717` | `#fafafa` | `#6b6b6b` | `#404040` |
| **Blue** | `slate` | "Cool and businesslike" | `#334155` | `#0f1d33` | `#f8fafc` | `#5c6b81` | `#1d4ed8` |
| **Sand** | `sand` | "Warm, like paper" | `#45403a` | `#1b1814` | `#fbfaf8` | `#6f685b` | `#a16207` |
| **Green** | `forest` | "For the outdoor trades" | `#3a5342` | `#15251a` | `#f6faf7` | `#54725e` | `#15803d` |
| **Navy** | `ink` | "Nearly black, but not" | `#364361` | `#131c2e` | `#f7f9fc` | `#586a8f` | `#4338ca` |
| **Dark** | `dark` | "For working at night" | `#17181c` | `#f2f4f6` (inverted) | `#101114` | `#8b9099` | `#9db4ff` |

The full eleven steps for each are lines 28–204 of `globals.css`. The middle steps in every theme: `200` is the border colour you see on every card, `300` is a disabled edge, `400` is faint type, `600` is the subtitle under every page heading, `700` is a secondary button's words.

**These are tinted greys, not colour.** That was deliberate, from Atanas's own brief — *"we need to make the app a bit more colourful… options to change the themes, depends how you like it. Nothing too special."* The page still reads as paper; the hue lives at the dark end, so the primary button picks up the theme by itself and nothing else has to.

**The mid-tone is darker than Tailwind's own.** `text-neutral-500` on a `neutral-100` card was under 4.5:1 in **every** theme, grey included — so it had been failing since long before there were themes. `harness/test-readable.mjs` measures every theme on the pages a stranger and a new account actually meet, and that is what found it.

### The accent nobody uses

`--accent` and `--accent-soft` are defined for all six themes and wired into Tailwind as `--color-accent` / `--color-accent-soft`. **Nothing in the app uses them: zero occurrences of `bg-accent`, `text-accent` or `border-accent` in any component.** So Blue's real blue (`#1d4ed8`), Sand's amber (`#a16207`), Green's green (`#15803d`) and Navy's indigo (`#4338ca`) are sitting in the stylesheet unpainted, and the five themes differ only in the tint of their greys. (The `accent-neutral-900` you will see on checkboxes in Settings is Tailwind's *native-control* accent utility, unrelated.) This is the single biggest "make it more colourful" lever in the app and it is unpulled.

### Dark mode, and the "auto" default

`[data-theme="dark"]` is a different kind of change from the other four: those retint the same light page, this one **turns the scale over** — 50 is the darkest and 950 the lightest. So `bg-neutral-50` is still "the page", `text-neutral-900` is still "the words", and `bg-neutral-900 text-white` (every primary button in the app) becomes a light button with dark writing, which is right.

Three things had to come with it:

- **`color-scheme: dark`**, because native controls are painted by the browser. Without it a date input rendered white text on white.
- **Tailwind's own reds, ambers, greens and blues do not invert**, so they were redefined: `red-700` `#bf000f` → `#ff8f8f`, `amber-700` → `#f5c451`, `green-700` → `#5bd98a`, `blue-800` → `#8fb8ff`, and the pale backgrounds the other way (`amber-50` → `#2b2212`, `red-50` → `#2a1618`, `green-100` → `#16301f`). **Both halves had to move together** — lightening the ink while leaving `bg-amber-50` pale turned a 2.69:1 failure into a 1.35:1 one, which is how the overdue banner briefly became light-on-light. Measured by `harness/test-worst-phone.mjs`, not chosen by eye.
- Screens that are black **by nature** — the viewfinder, a full-screen photo, a tip over the camera — use `text-ink-on-dark`, which never inverts. That was the trap, and it was real: white text on a white button.

**Colour and darkness are not combined.** Picking Dark sets the tint aside; there are no five dark scales for the five hues, because that is a bigger job than it was judged to be worth.

**The default is "Follow my phone"** (`DEFAULT_CHOICE = "auto"`): light by day, dark at night, resolving to Grey when the phone is light. Choosing a colour on purpose overrides it for good — an explicit choice outranks a guess. `watchSystemTheme()` listens to `prefers-color-scheme` so the app turns over at sunset without a reload, and only while the choice is still auto.

### Where the choice is stored, and who can make one

- **`localStorage`, key `theme`**, holding either an id or the word `auto`. **Per device, not per account** — it is how this phone looks, not a fact about the business, and it has to survive a signed-out visit to the front door.
- `THEME_BOOT` (a minified script in `src/lib/theme.ts`) runs from a `<script>` in `<head>` **before the first paint**, so the page never flashes the wrong colours. That matters most for dark, where the flash is a white screen in a dark room.
- Grey carries **no** `data-theme` attribute at all — it is the absence of a theme, which is one less thing for the print rules and the suites to reason about.
- React cannot see localStorage, so `ThemePicker` subscribes to it through `useSyncExternalStore` rather than copying it into state. Tapping a row takes effect **immediately**; there is no Save button.
- **The picker lives on `/settings` only** (`src/components/ThemePicker.tsx`, rendered at `src/app/settings/page.tsx` line 937), between "Invite a friend" and "Get the app". Settings is behind sign-in, so **a stranger on the front door cannot pick a colour** — they get whatever their phone says. The card's heading is **"How it looks"**, its line is *"Pick a colour. It changes straight away, and only on this device."*, the chosen row shows **"On"** on the right, and under the grid: *"Invoices always print in plain ink, whichever colour you pick."*
- Because it is per device, a person with a phone and a MacBook has two separate looks, and nothing tells them so. Atanas uses the iPhone almost always.

### The typeface — Arial, and a Geist that was never installed

`body` is set to `Arial, Helvetica, sans-serif` and that is what the whole app renders in. `globals.css` also declares `--font-sans: var(--font-geist-sans)` and `--font-mono: var(--font-geist-mono)`, **but `--font-geist-sans` and `--font-geist-mono` are never defined anywhere and no font package is installed** (nothing imports `next/font`, and `geist` is not in `package.json`). Those two lines are left over from the Next.js starter.

The consequence is small but real: the four places that ask for `font-mono` — the **invite code** (`src/components/InviteCard.tsx`), the scanner's debug readout, the upload panel's file details — get no monospace at all, because `var(--font-geist-mono)` resolves to nothing and the declaration is dropped. An invite code meant to be read out over the phone is rendering in Arial.

### The standard shapes, with their real classes

From the House style in `CLAUDE.md`, and these are the strings actually in the files:

| Thing | The class string |
|---|---|
| Page heading | `h1.text-2xl.font-bold`, with `p.mt-1.text-neutral-600` under it |
| Card | `rounded-xl border bg-white p-5 text-neutral-900 shadow-sm` (Settings keeps it as `const CARD`, with `space-y-3` in front) |
| Primary button | `rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white` |
| Big primary button (a wall, a last step) | `w-full rounded-lg bg-neutral-900 px-4 py-3 text-base font-bold text-white` |
| Secondary button | `rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50` |
| Label above a control | `text-xs text-neutral-500` |
| Text box | `w-full rounded-lg border px-3 py-2` (a phone-facing one adds `text-base sm:text-sm`, so iOS does not zoom on focus) |
| Badge | `rounded-full px-2 py-0.5 text-xs font-medium` plus a `bg-X-100`/`text-X-800` pair |
| Long names | `wrap-anywhere`, never `break-words` |

The badge pairs, in `src/lib/invoiceStatus.ts`: **overdue** `bg-red-100 text-red-800`, **draft** `bg-neutral-100 text-neutral-500`, **sent** `bg-blue-100 text-blue-800`, **part-paid** `bg-amber-100 text-amber-800`, **paid** `bg-green-100 text-green-800`. Quotes and receipts follow the same pairs from their own files.

### How it feels to press things

Done in `globals.css`, not on 190 components, so nothing has to remember to opt in (Atanas, 2026-09-24: *"I want a nicer feel when you click the buttons and move around the pages"*).

- Every `button`, `[role="button"]` and rounded link/label gets `transition: transform 120ms … , box-shadow 160ms, background-color 160ms, opacity 160ms`, and `-webkit-tap-highlight-color: transparent`.
- **Press** scales to `0.97` — a big tile only to `0.985`, because a tile squashing by 3% looks broken. The press is the important half: a finger has no hover, so on a phone this is the only sign the tap landed, and on a slow connection it is the only thing that happens for the first half second.
- **Arriving on a page**: `main > *` fades in over 180ms. Opacity only, no movement — content sliding in is what makes people feel seasick, and it fights the swipe between panels.
- **Marking an invoice paid** (`src/components/PaidCelebration.tsx`): the card pops in (260ms), a tick draws itself (420ms), and confetti falls from five colours — `bg-neutral-400`, `-500`, `-600`, `bg-green-600`, `-500`, so it follows the theme and stays visible in dark.
- A batch-scanner capture flies from the viewfinder into the stack (`shot-in`, 420ms).
- **`prefers-reduced-motion: reduce` turns all of it off**: no transform, no page fade, no tick, no pop; a press dims to `opacity: 0.7` instead. The walkthroughs' **"Play it through"** button is not even offered to somebody who has asked for less movement, because a disabled Play is just a puzzle.

### Text size, and things big enough to hit

- **The size the phone is already set to.** `@supports (font: -apple-system-body)` takes iOS's Dynamic Type onto `:root`, so every rem in the app follows it — type *and* spacing, so layouts grow together instead of text spilling out of boxes that stayed put. It is **not clamped and cannot be** (`-apple-system-body` is a font shorthand, not a length, so it will not go inside a `clamp()`), and iOS's accessibility sizes reach 53px. Switching it on was the easy half: ten screens had to be fixed first, and `harness/test-big-text.mjs` holds them at twice the size. Live since 2026-09-24. Not one of the twelve apps in `notes/competitor-research.md` claims to respect this setting.
- Checkboxes and radios are forced to **24×24px minimum** — a native checkbox renders 13×13, which fails WCAG 2.5.8 outright, and the worst of them are the VAT switch on Settings.
- Footer links get `0.375rem` of padding top and bottom: the words stay the same size, the target around them grows. They were 16px tall and shoulder to shoulder.
- Ordinary buttons are **36px tall, not 44**. That passes the guidelines and fails what Apple and Google both ask for, and `/accessibility` says so out loud. Buttons that matter most opt up individually with `min-h-11` (44px).

### What a printed invoice looks like against the screen

A printed invoice is not themed: it is a document, and it prints in ink.

- `@media print` **resets `--n-50`…`--n-950` and `--paper` back to the grey values for `:root` and for every `[data-theme]`**, so a navy or dark app prints exactly the same sheet as a grey one.
- `@page { size: A4; margin: 14mm }`, and `body { background: #fff }`.
- `.invoice-document` carries `print-color-adjust: exact`; its `tr` and `section` get `break-inside: avoid`, so a line item never splits across two pages.
- Everything that is app rather than document is marked `print:hidden`: the whole footer, the floating **Feedback** pill, the reminders card on an invoice page, the invoice's own on-screen buttons.
- The Free-invoice page portals the document straight under `<body>` while printing and adds `body.printing-invoice`, and one rule hides that body's other children — so "only the document prints" costs one line.
- `--sheet` exists for the same reason at the other end: the signature pad is white whatever the app is wearing, because near-black ink drawn on a dark pad would be invisible while you signed and correct on the paper.
- **Print buttons say "Print"** and call `window.print()` — on an invoice (`/invoices/<id>`) and Expenses it is a primary button, on a customer statement and a quote a secondary one.

### Two sheets, not one

Worth knowing before any design conversation about "the look of an invoice", because it is asymmetric:

- The **Free-invoice builder** (`/free-invoice`) offers **three layouts**, picked from thumbnails (`src/components/free-invoice/LayoutPicker.tsx`): **Classic** — *"Centred name, boxed bank details"*; **Modern** — *"Roomy, bold total"* (the default); **Compact** — *"Dense, fits one page"*. Drawn by `src/components/invoice/InvoiceDocument.tsx`.
- A **real issued invoice** (`/invoices/<id>`, the PDF, the emailed copy and the customer's `/i/<token>` page) has **one fixed look** and no layout choice at all: `src/components/invoice/IssuedInvoice.tsx`.
- The **business logo** (Settings, stored in the private bucket, downscaled to 600px on its longest side, `src/lib/logo.ts`) appears on the **issued** invoice and the customer's page — and **not** on the Free-invoice document, which has no logo at all.

### The "how it works" notes

`src/components/Tip.tsx`, counted in localStorage under `tip:<id>` (`src/lib/tips.ts`).

- **`TIP_SHOWS = 3`**: a note appears on its **first three appearances of that screen**, then never again. **"Got it"** stops it at once. Counts live on the device only — a new phone starts the notes over, and a browser with storage blocked shows **none** (`readTipCount` returns `TIP_SHOWS` when it cannot read).
- Light form: `border border-neutral-200 bg-neutral-50 text-neutral-700`, `role="note"`, rounded, small type, with the underlined **Got it** on the right. Over the camera it takes `dark`: `bg-black/70 text-ink-on-dark`.
- **There are 29 of them**, not the eight `CLAUDE.md` lists — that line is stale. They are on: dashboard, invoices list, an invoice, quotes list, a quote, quote requests, clients, a customer statement, receipts, needs-review, expenses, VAT, mileage, money, jobs, files, recurring (both), scan, copy, convert, check-a-company, settings, feedback, the free page's scan and signature, and three inside the camera (`scanner-stack`, `scanner-auto`, `camera-allow`).
- Most begin with the words **"How it works: "**. Examples, verbatim: scan — *"hold the phone over the paper. It takes the photo when the page is still, reads what's on it, and you check the numbers before saving."* VAT — *"these figures come from your own invoices and receipts. Copy them into your VAT return. Nothing is sent from here."* Files — *"every photo and file you have saved is here, newest first. Tap one to see it or save it to your device."*
- **A suite enforces one per screen.** `harness/test-every-screen-explained.mjs` walks the app folder and fails on any screen with no note, unless it is in an explicit exempt list with a written reason — the legal pages ("read once, by somebody who came looking for it"), `/help` and `/how-to-invoice` ("the whole page is the explanation; a note on top of it would be explaining the explaining"), `/offline` ("a note about how to use it would be cruel"), the customer links, and the plain forms whose labels already say it.

### What it says when it refuses

Three rules, each pinned by a suite, from the section of `CLAUDE.md` called "When somebody meets a wall".

1. **Never show Cloudflare's or Postgres's words to a person.** `src/lib/errorText.ts` is the whole of it:
   - `loadFailed(err, what)` → *"Couldn't load your invoices. Check your connection and try again."* The real reason goes to the console. Never `err.message` — for a Supabase error, `err instanceof Error` is **false**, so the usual `err instanceof Error ? err.message : "…"` throws the reason away and shows the fallback anyway.
   - `saveFailed(err, fallback)` translates by code: a dropped connection → *"Couldn't reach your records. Check your connection and try again."*; `23505` → *"That one is already there."*; `23503` → *"Something else in your records is linked to this, so it can't be changed."*; `42501` → *"This account isn't allowed to do that."*; `PGRST204` → *"This needs a database change that hasn't been run yet. Nothing was saved."* The app's own database functions raise their own sentences under `P0001`, `40001`, `55000`, `22023`, and those pass straight through. Twelve call sites were showing Postgres's own wording before this existed.
   - Three fixed sentences: `PDF_FAILED` *"Couldn't make the PDF. Try again, or use Print instead."*; `SIGNED_OUT` *"You've been signed out. Sign in again, then try that once more."*; `PASSWORDS_DIFFER` *"The two passwords are not the same. Type the same one in both boxes."*
   - `src/lib/peopleCheck.ts` catches the invisible people-check on the front door. Supabase's own words were *"captcha protection: request disallowed (missing-input-response)"* — live, on the door. It now says *"The check that you're a person hadn't finished. Give it a second and press the button again."* **The word "captcha" never appears anywhere in the app.**
2. **A refusal must not outlive the thing it describes, and must lead somewhere.** The scan wall (`src/components/ScanLimitNotice.tsx`) is the model: not the usual red error line but a calm card (`bg-neutral-50`), the plain message, then a big button **"Give me another 600 this month"**, then *"Once a month, and it costs you nothing."* When granted: **"That's another 600 for this month."** and a button **"Read it now"**, because the document that was refused still needs reading. The refusal wording itself is in `src/lib/scanLimit.ts`: *"That's 50 documents today, which is the most a free account can read in one day. It starts again tomorrow morning. You can still copy a document or write an invoice by hand."* — a refusal always names what still works.
3. **A button that does something once needs a `ref`, not `disabled`.** React applies `disabled` on the render *after* the first press and both handlers close over the same state, so two taps in one tick both go through — which here told somebody they had already had their extra 600 one beat after granting it.

Two more conventions: a list's empty state is gated on `!error`, so *"No invoices yet"* can never stand in for a failed load; and anything that removes a record asks first with `window.confirm`, naming what goes.

### What is measured, and by what

So a design change can be checked rather than argued about: `harness/test-theme.mjs` (ordinary classes follow a theme, the choice survives a reload with no grey flash, a printed invoice ignores all of it), `test-readable.mjs` (contrast in all **six** themes on the pages a stranger and a new account meet), `test-worst-phone.mjs` (every hard condition at once — 320px wide, twice the text size, dark, reduced motion, one hand), `test-big-text.mjs`, `test-every-screen-explained.mjs`, `test-people-check.mjs`, `test-scan-wall.mjs`, `test-plain-words.mjs`, `test-labels.mjs`.

---

## Part two — the pages nobody visits on purpose

All seven are reachable from the small quiet footer on every page (`AppShell`, `text-xs text-neutral-500`, never printed): **Invoiceover · How it works · How to invoice · Your information · Terms · Accessibility · Security · Tell us something**. Four of the seven are also in the header's **Tools** group.

**Two of those footer links bounce a stranger to `/login`: "How it works" (`/help`) and "Tell us something" (`/feedback`).** The public list in `AppShell` is exactly: `/`, `/login`, `/reset-password`, `/privacy`, `/terms`, `/security`, `/accessibility`, `/how-to-invoice`, `/offline`, and the customer links `/i/`, `/q/`, `/r/`. Nothing else.

---

### How it works — `/help`

- **What it is for.** A list of the things the app can do, each opening into a stepped walkthrough with real recorded pictures of the app doing it.
- **How you get there.** Header → **Tools** → **How it works** (on a phone, the one **Menu** button). Also the footer's first link, on every page.
- **What is on it** (`src/app/help/page.tsx`). Heading **"How it works"**, under it *"Pick the thing you want to do. Each one is a few steps, at your pace."* Then **six** cards, each a title and a line, which open in place: **Send an invoice** (*"Make one, send it, and see what is owed."*), **Put in a receipt** (*"By hand, or by photographing it."*), **Work out a VAT quarter** (*"The five boxes, from what is already in the app."*), **Claim a trip** (*"Miles, at HMRC's rates, into your expenses."*), **Price a job before you start** (*"Send a quote, let them accept it, turn it into an invoice."*), **Check a receipt you emailed in** (*"Forwarded receipts wait here until you have checked what was read off them."*). At the foot, always: *"Not here? **Ask us** and we will answer, and add it."* → `/feedback`. Opening the list rather than an empty box was Atanas's instinct and is the right one — an empty box asks somebody to know the question already.
- **An opened walkthrough** (`src/components/help/Walkthrough.tsx`): the title, the summary, one picture, then every step numbered and listed at once with the current one in bold (the steps are **buttons** — tap any number to jump). Then **Back**, **Next**, **Play it through** and **Do it now** (which opens the real page, e.g. `/invoices/new`). Nothing plays by itself; Play is not offered at all under reduced motion. A hidden live region reads *"Step 3 of 5. …"*.
- **What it does behind the scenes.** The captions live in `src/lib/helpJourneys.ts` — in code, not beside the images, because they are the alternative text, they are the whole walkthrough on a slow connection, and they are reviewable in a diff. The **pictures are recorded by the test harness** (`harness/record-help.mjs`) from the same run that drives those journeys through a real browser, so a hand-recorded clip showing a button that has since moved cannot happen: if the button moves the suite fails and the frames are rewritten. They live at `/help/<journey>/01.webp` and `01-dark.webp` — **both sets exist on disk today**, 4 to 6 steps each — and the walkthrough picks by the *resolved* theme, so somebody who chose Dark on a light phone gets the dark frames. If a frame is missing the picture disappears and the words still work. The camera is deliberately never recorded: the harness has no camera, and a staged viewfinder would be the stale hand-made clip this whole arrangement exists to avoid.
- **Where it takes you next.** `/feedback`, and each journey's own start: `/invoices/new`, `/receipts/new`, `/vat`, `/mileage`, `/quotes/new`, `/receipts/review`.
- **Free, gated or not built.** **Behind sign-in** — and it is in the footer of the front door, so a stranger who taps "How it works" lands on `/login`. Free, and it costs nothing per use today: **the help chat is not switched on.** `NEXT_PUBLIC_HELP_CHAT` is not set, so the page ends at the walkthroughs, mentions no chat, and `POST /api/help-chat` answers **404** (a route that replies while the feature is off would be an open model endpoint nothing in the UI admits to). The chat is **fully built** behind that one variable: a card **"Still stuck? Ask."**, the line *"Questions about the app, answered here. It can't see your invoices or your figures…"*, a box with a real placeholder (*"How do I put a deposit on a quote?"*), and an **email it to Atanas** way out that sends the whole conversation to `/api/feedback`. Its fences ship with it, because it is the first thing in the app that costs money every time somebody uses it with no natural limit: signed in only, `gemini-3.5-flash-lite`, **40 an hour per account and 400 an hour overall**, a **six-message** window, a **600-character** question. Turning it on is one environment variable — and one standing bill.

---

### How to invoice when you're self-employed — `/how-to-invoice`

- **What it is for.** A plain-English article about UK invoicing: what has to be on one, numbering, VAT, CIS, getting paid, keeping the paper. It is the app's **one page a stranger can find on Google** without knowing the app exists.
- **How you get there.** The footer, on every page, as **"How to invoice"**. Otherwise a search engine. It is in `sitemap.ts` and indexable; it is not in the header nav.
- **What is on it** (`src/app/how-to-invoice/page.tsx`). A big headline, a lead paragraph, then: **What has to be on it** (an eight-item list, plus the extra three a limited company owes), **Numbering: the bit people get wrong**, **VAT**, **If you're in construction: CIS**, **Getting paid** (three sub-headings: *Say when*, *Chase early and plainly*, *You can charge interest*), **Keep the paper**. Then one card — *"Doing all this by hand is the slow way"* — and a fat button **"Make an account"** → `/`. It closes with *"Written to be useful, not to be advice… Last reviewed 23 September 2026."*
- **What it does behind the scenes.** Static, no data, no model call. Its own `<title>`, description, canonical and OpenGraph, aimed at "free invoice template UK". It exists **because** the Free-invoice page was closed to strangers: the honest way to rank for that phrase, when nothing works before an account, is a page that *answers* the question rather than pretending to be a tool. Everything on it has to stay true; it deliberately marks where the line is between "this is what an invoice needs" and "ask an accountant".
- **Where it takes you next.** `/` (the front door and its sign-in card). Nothing else.
- **Free, gated or not built.** **Public**, no account, free, no cost per use. The only marketing page in the app.

---

### Your information — `/privacy`

- **What it is for.** What is kept, why, who else sees it, where it is, and how to get it back or get rid of it. In plain words, because the people who read it are usually worried about something specific.
- **How you get there.** The footer, as **"Your information"**. Linked from `/security` and from the front door's sign-up wording.
- **What is on it** (`src/app/privacy/page.tsx`). Heading **"Your information"**, then: **The short version** (*"…we do not sell them, we do not advertise to you, and nobody here reads them for entertainment."*), **What we keep** (email, what you put in, the photographs, the flyer code, **the help-chat question** — *"What the chat answered is not kept. Don't type anything into it you would rather we did not read."* — and what broke plus which page, never what was on screen), **Who else sees it** (named: **Supabase** stores records and files and handles sign-in, **Vercel** runs the site, **Resend** sends the emails, **Google** reads the documents you scan, **Anthropic** can instead but only on a device where you turned it on), **Where it is kept** (records, files and the app in **Frankfurt**, inside the EEA; the one thing that leaves is a scanned picture, to Google in the **United States**, under the UK-US Data Bridge — and if you would rather nothing left the EEA, *"type your receipts in by hand — every screen that takes a scan also takes typing"*; Anthropic is **not** certified under the Bridge and that is said), **Why we are allowed to keep it** (performing the contract; legitimate interests for security; *"We do not rely on consent for any of it"*), **How long**, **Getting it back, or getting rid of it** (ask through Feedback), **If something goes wrong** (ICO within 72 hours), **Cookies** (*"There are none for advertising, and none that follow you around"* — signed-in state, **which colour you picked**, which panel you last had open), **Asking us something**. *"Last changed 23 September 2026."*
- **What it does behind the scenes.** Static. Its rule, written at the top of the file: **every claim has to stay true of the app as it actually is — if a supplier changes, this page changes in the same commit.** That rule has been kept: migration-040 stored the help-chat questions, and the same commit added the line about them.
- **Where it takes you next.** `/feedback`, `/security`.
- **Free, gated or not built.** **Public** on purpose — it has to be readable before anybody hands over an email address, and an app store or an advertiser will ask for a link that works signed out.

---

### Terms — `/terms`

- **What it is for.** What the app promises and what it expects back.
- **How you get there.** The footer, as **"Terms"**. Linked from `/privacy` and `/security`.
- **What is on it** (`src/app/terms/page.tsx`). **What this is** — *"It is free to use. If that ever changes you will be told first, and nothing you have already put in will be held to ransom."* **It is not an accountant** — anything it says about tax or VAT is a working figure, not advice and not a return. **What it reads for you** — *"machines misread things… What it fills in is a suggestion… Anything it is not sure of is left blank on purpose rather than guessed at."* **Your account** (keep the password; one account per person or business, *"Making many to get round a limit is not on"*; a real email). **What you must not do** (break the law, upload documents you have no right to, *"use it as a free machine for reading documents in bulk"*) and what happens then. **Your records are yours.** **What we do not promise** (as-is, backed up, *"no website is perfect"*, keep your own copies, and nothing takes away UK consumer rights). **Changes** — *"you will be told in the app rather than quietly."* *"Last changed 23 September 2026. English law applies."*
- **What it does behind the scenes.** Static. Two sentences here are load-bearing for the free-tier conversation: **"It is free to use. If that ever changes you will be told first"**, and the one-account-per-person line, which is the only thing standing between the scan limits and somebody making a second account.
- **Where it takes you next.** `/feedback`.
- **Free, gated or not built.** **Public.**

---

### Report a security problem — `/security`

- **What it is for.** Somewhere for a researcher to send a security problem, and a written promise about what happens next. HMRC's terms of use ask for both — an easy way for anybody to report a risk, and a process that answers within 72 hours — so this page is also a prerequisite for the VAT-check credentials.
- **How you get there.** The footer, as **"Security"**. Linked from `/privacy`.
- **What is on it** (`src/app/security/page.tsx`). **How to tell us** — use the feedback form and **start your message with the word SECURITY**; *"It goes straight to a person. You do not need an account to send it, and you will not be charged, thanked in public, or chased for your name."* **What we do next** — a reply the same day and always within three days; work out what was exposed and fix it; the ICO within 72 hours if anybody's information was at risk; **HMRC within 72 hours** with a name and telephone number if it touches an HMRC service; tell you what was found. **What not to do** — don't look at other people's records, don't knock the app over, don't go public before it is fixed; *"Stay inside those and we will not come after you for finding it."* **What else is written down** → `/privacy`, `/terms`.
- **What it does behind the scenes.** Static. It points at the feedback form rather than an email address **on purpose**: `invoiceover.com`'s mail goes to the inbox-import Worker, which silently drops anything that is not a per-user inbox address — so a message to `security@` would vanish with no bounce, which is worse than having no address at all.
- **Where it takes you next.** `/feedback`, `/privacy`, `/terms`.
- **Free, gated or not built.** **The page is public** — whoever finds a hole almost certainly has no account, and telling them to make one first is how a report turns into a tweet. **But the promise on it is not true as built.** *"You do not need an account to send it"* — yet `/feedback` is **not** in the public list, so a stranger who taps that link lands on `/login`, and `POST /api/feedback` answers **401 "Sign in to send feedback."** with no token. The harness checks a stranger can *read* `/security` and that the route *refuses* a stranger; nothing checks the two sentences against each other. Either the sentence goes or `/feedback` opens.

---

### How usable this is — `/accessibility`

- **What it is for.** An accessibility statement that names the app's own failures. Not one of the twelve apps in `notes/competitor-research.md` publishes one for their app.
- **How you get there.** The footer, as **"Accessibility"**.
- **What is on it** (`src/app/accessibility/page.tsx`). **Where we stand** — aiming at WCAG 2.2 AA, *"We are not audited by anybody… treat the list below as what we have measured ourselves, not as a certificate"*, and the Equality Act duty being anticipatory. **What we have made work**, seven items, each checked by a suite: the text size you already chose (*"Checked at twice the normal size on ten screens"*), **dark, light and five colours** measured for contrast, keyboard only, refusals tied to the box at fault, nothing moves unless you ask, 24×24 targets and 320px width, plain words. **What is not good enough yet**, five items, named: **"Buttons are 36 pixels tall, not 44"** — *"That passes the guidelines and fails what Apple and Google both ask for… We have not fixed it."*; nobody independent has tested it; **the camera** (*"We have not worked out how somebody who cannot see the viewfinder does that, and the honest answer today is: type it in instead"*); **colour on charts** not checked for colour blindness; **no real screen readers** — not VoiceOver, TalkBack, JAWS or NVDA. Then how to tell us, and the Equality Advisory and Support Service. *"Last gone through on 25 September 2026."*
- **What it does behind the scenes.** Static. Its rule: **every claim on it is measured by something in `harness/`, and anything not measured is written down as not measured rather than left out.** A statement that only lists successes is marketing.
- **Where it takes you next.** `/feedback`.
- **Free, gated or not built.** **Public** — a statement about whether somebody can use the app is no use behind a sign-in they may not be able to get through.

---

### Feedback — `/feedback`

- **What it is for.** Telling the person who built the app that something is wrong, confusing or missing. It is also, today, the **only** way to ask for an account to be deleted, the way `/security` asks a researcher to report a hole, and the way `/help` ends.
- **How you get there.** Header → **Tools** → **Feedback**; the footer's **"Tell us something"**; and a **floating pill** bottom-right on every page for a signed-in person (`bg-neutral-900 … rounded-full shadow-lg`, never printed, and it steps aside on `/free-invoice`, which has its own bottom bar — the pill once swallowed taps meant for **More**). Also from `/help`, `/privacy`, `/terms`, `/security`, `/accessibility`.
- **What is on it** (`src/app/feedback/page.tsx`). Heading **"Feedback"**, a first-times note, then *"Spotted something wrong, confusing or missing? Tell us. It goes straight to the person who makes this."* A card with a dropdown — **Bug / Confusing / Missing feature / Other** — a four-row box (*"What's on your mind?"*), and **Send feedback** (**"Sending…"** while it goes). On success: *"Sent. Thank you."* and the note appears at once under **"Previously sent"**, each with its category and the date it was sent.
- **What it does behind the scenes.** `POST /api/feedback` → a row in `feedback` inserted **as the sender**, then emailed to `FEEDBACK_TO` from `feedback@invoiceover.com` with **Reply-to the sender**, carrying the page they were on, their user agent and the commit. The email is best effort: with no key or no address the row is still there. **20 an hour per account.** A failed send keeps the typed text. Sessions start by reading the new rows with `harness/feedback-inbox.mjs` into `notes/feedback-inbox.md`.
- **Where it takes you next.** Nowhere — it is a dead end by design, which is why the pill and the footer link are everywhere.
- **Free, gated or not built.** **Behind sign-in, and the route refuses a stranger (401).** Free, no model call. See the contradiction with `/security` above.

---

### The three screens nobody navigates to

- **No signal just now — `/offline`** (`src/app/offline/page.tsx`). Shown by the service worker when a page is asked for with no connection; **public**, because that is exactly when the sign-in check cannot be made. *"Nothing has been lost. Everything you have saved is still there…"*, a card **"What you can do meanwhile"** (photograph receipts with the phone's own camera and scan them in later; write things down), and **Try again** — a real `<a href="/">`, not a `<Link>`, because a client-side move between routes the browser hasn't got would do nothing, twice. The browser's own error page makes an app look broken rather than offline, which on a site full of somebody's accounts is a frightening difference.
- **That page isn't here** (`src/app/not-found.tsx`). A mistyped address, or an old link off a flyer. *"The address may be mistyped, or the page may have moved. Nothing of yours has gone anywhere."* and **Back to the start** → `/`. It must read sensibly with or without an account, so it offers "the start" rather than "the dashboard".
- **The app couldn't start** (`src/app/global-error.tsx`). If the *layout* throws there is no header, no styles and no app left — so this one brings its own `<html>` and its own **inline hard-coded colours** (`#fafafa`, `#171717`, `#525252`), the only place in the app where a hex is correct. *"Nothing has been lost — your invoices and receipts are saved."*, a **Try again** button, and *"Reference <digest>"*. It reports itself to `/api/error` on mount, because that digest used to be a reference number for a report nobody ever received.

---

### Worth deciding

1. **Do the five themes get real colour, or stay tinted greys?** Every theme already carries a proper accent — Blue `#1d4ed8`, Sand `#a16207`, Green `#15803d`, Navy `#4338ca` — wired into Tailwind and used by **nothing**. Should a highlight (the current page in the menu, a chart bar, a link, the "paid" tick) paint in it, or is "nothing too special" still the answer?
2. **Should the colour follow the account instead of the device?** Today it is per phone, in localStorage. Atanas has an iPhone and a MacBook and they are two different-looking apps. Per account means one look everywhere and a flash of grey on a cold load; per device means it works signed out. Both, with the account as a default, is a third option and the most work.
3. **Should a stranger be able to pick a colour?** The picker is on Settings, behind sign-in, so the front door is whatever the phone says. A dark-phone stranger's first impression of the app is the dark theme, which nobody has looked at as a *shop window*.
4. **Dark, or dark-and-a-colour?** Picking Dark today throws the tint away. Five dark scales is real work; a single "dark navy" might be most of the value for a fifth of it.
5. **Is Arial the app's typeface on purpose?** It is what renders. Two dead lines reference a Geist that was never installed, and four places asking for monospace get none — including the **invite code**, which people read out loud. Cheapest fix: define a real mono. Bigger decision: install a proper typeface, at the cost of a font download on a van's connection.
6. **Should a real invoice have the three layouts the free page has?** Classic / Modern / Compact exist only in the Free builder. An issued invoice — the one a customer actually receives — has one fixed look and no logo choice beyond on/off.
7. **Should the Free-invoice document carry the business logo?** It does not. The issued one does.
8. **36-pixel buttons, or 44?** `/accessibility` already admits the app fails what Apple and Google ask for. Raising the primary button to `min-h-11` is one string in one place and would grow nearly every screen slightly.
9. **The help chat: on, or off for good?** It is built, fenced and tested, and off. It is the first thing in the app that costs money every time somebody uses it with no natural limit. Turning it on is one environment variable; the bill has no ceiling but the 400-an-hour guard.
10. **Fix the promise on `/security`, or open `/feedback` to strangers?** As built, the page tells a researcher they need no account and then asks them to sign in. Opening `/feedback` means an unauthenticated route that sends email — which is the shape of thing that made `/api/send-invoice` signed-in-only in the first place.
11. **Should `/help` be public?** Its own footer link, shown to strangers on the front door, sends them to `/login`. "How it works" is the sort of page somebody reads *before* deciding to sign up.
12. **Does the scan wall's wording say the right thing now the free tier is being decided?** It currently says *"the most a free account can read in one day"* and offers another 600 free, once a month. The moment a paid tier exists, that sentence is where people meet the price.
