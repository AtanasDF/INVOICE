# Invoiceover — the whole app, for a design conversation

Assembled 2026-09-28 from the code, not from memory. Fourteen sections.
The working copies live in `notes/app-guide/` in the repo.

---

# Invoiceover — what it is, for a conversation about what it should be

Written 2026-09-28, by reading the code rather than remembering it. Every claim here was
checked against the files or the live environment on that date.

**Who this is for.** Atanas, taking it to a separate conversation to settle the free tier and
the design — and the Claude on the other end of that conversation, who has never seen this
machine. Read this page first, then the numbered sections beside it.

---

## What the app is, in one paragraph

It is an invoicing and expenses app for one UK tradesman or small business. Two halves.
**Money in:** write an invoice or a quote, send it to a customer as a link or an email, and
see what you are owed. **Money out:** photograph a receipt or a supplier's bill and the app
reads it — supplier, date, total, VAT, invoice number — and files it. Around those two sit
the things a UK business actually needs: VAT return figures, CIS deductions, mileage at
HMRC's rates, a statement per customer, and a check of whether a company you are about to
work with is real.

The scanner is the heart of it. Everything else exists because once the paper is in, the
figures are already there.

**Live at** https://invoice-omega-rust.vercel.app — one account per person, on a phone.

---

## The one rule that shapes everything

**Nothing works before an account.** Atanas, 2026-09-22: *"nothing should work before the
user register... a plain page with some nice advertising of the app and the log in
rectangulars."*

There are exactly nine public addresses, plus the three kinds of customer link:

| Public | Why it is public |
|---|---|
| `/` | the front door: what the app is, and the sign-in box |
| `/login`, `/reset-password` | getting in |
| `/privacy`, `/terms` | must be readable before anyone hands over an email |
| `/security` | whoever finds a security hole almost certainly has no account |
| `/accessibility` | a statement about whether somebody *can* use the app is no use behind a sign-in they cannot get through |
| `/how-to-invoice` | a public article, written to be found in a search |
| `/offline` | shown exactly when the sign-in check cannot be made |
| `/i/<token>` `/q/<token>` `/r/<token>` | the links a customer or supplier is sent |

Everything else sends a stranger to `/login`. **This is the biggest single thing to decide
in the design conversation** — see `01-the-free-tier-decision.md`.

---

## What it costs to run, per person

Worth knowing before deciding what is free, because three of these are metered:

| Thing | Cost |
|---|---|
| **Reading a document** (the scanner) | **Money every time.** Google Gemini by default; Claude optionally. This is the only cost that grows with use. |
| **Sending an email** (invoice, reminder, copy) | Money per email, through Resend. |
| **The help chat** | Would cost money per message — **switched off** today. |
| Checking a company | Free. Companies House's own API. |
| Checking a VAT number | Free, but **switched off** — needs HMRC credentials that take about two weeks to get. |
| Address lookup | Free by default (postcodes.io + OpenStreetMap). A paid upgrade exists and is not switched on. |
| Storing everything | Supabase — database and receipt photographs. Grows with use but slowly. |
| Serving the app | Vercel. |

---

## The state of play, honestly

**Built, live, and in use:**
invoices with CIS and the VAT reverse charge · credit notes · payments · quotes with deposits ·
customer accept/decline links · asking several suppliers to price a list · the scanner,
including several documents in one photograph · receipts, bills, expenses, mileage · recurring
invoices and expenses · VAT return figures · customer statements · Companies House checks ·
importing receipts from email · payment reminders on a schedule · five colour themes and dark
mode · offline page · push notifications.

**Built but switched off** (one environment variable each):
the help chat (`NEXT_PUBLIC_HELP_CHAT`) · invite-a-friend (`NEXT_PUBLIC_INVITES`) · letting old
receipt photographs go (`PHOTO_AGEING`) · the HMRC VAT number check (needs credentials, about
two weeks to obtain).

**Live and stricter than the notes claimed** — corrected 2026-09-27:
**the scan limits are ON.** See below.

**Not built at all:**
any payment or subscription · a paid tier (the database has a `plan` column and every account
says `free`) · fingerprint or passkey sign-in · an offline queue for scans taken with no signal.

---

## The number that matters most for the free-tier conversation

**Every account is already limited on reading documents**, and has been since 23 September —
the project notes said otherwise until the 27th, so this is worth stating plainly:

- **First seven days of an account: 300 documents a day**, no monthly cap. Deliberately
  generous, so somebody catching up on a year of receipts does not hit a wall on their first
  evening.
- **After that: 50 a day, and 600 a month.**
- A `paid` account would have no limit — but no paid tier exists, so nobody is one.

The app shows people what they have left, and the wall, when reached, offers a way on rather
than just refusing.

So the question is not *should there be a limit* — there is one. The question is whether
**50 a day and 600 a month** is the right free allowance, and what the paid one would be.

---

## How the sections are laid out

| File | Covers |
|---|---|
| `01-the-free-tier-decision.md` | the open questions, with today's answers, ready to decide |
| `front-door.md` | arriving, signing in, what a stranger may see |
| `dashboard.md` | the dashboard and getting around |
| `invoices.md` | the invoice list and writing one |
| `invoice-extras.md` | CIS, reverse charge, saving, the customer link, reminders |
| `quotes.md` | quotes and deposits |
| `supplier-pricing.md` | asking suppliers to price a list, Jobs, Money |
| `receipts.md` | receipts, bills, expenses, mileage, recurring |
| `scanner-camera.md` | the camera screen itself |
| `scanner-reading.md` | what happens to a photo after it is taken, and the limits |
| `file-tools.md` | Copy a document, Change a file, Files |
| `settings.md` | customers, Settings, VAT, company and VAT-number checks |
| `design.md` | themes, dark mode, the standard shapes, the supporting pages |

Each page in each section says: what it is for, how you get there, what is on it, what it does
behind the scenes, where it takes you next, and **whether it is free, gated, or not built**.

---

## What to bring back

Anything decided — the free allowance, what a stranger may use without an account, colours,
wording, what should move or be removed. Decisions are enough; they do not need to be written
as instructions. The next session here will turn them into work, on a branch, with the tests
kept green.

**One caution for the other conversation:** it will not have this machine, the database, or
the live site. It can reason about design and wording, but it cannot check a claim against the
code. Where these notes say something is uncertain or "not established from the code", treat
that as genuinely unknown rather than an invitation to fill it in.


---

# The free tier, and the other things genuinely open

Each item below has **what is true today**, then **the question**. They are ordered by how much
they change. Nothing here is a recommendation dressed as a fact; where there is a view it says
so and says whose.

---

## 1. How much reading is free — the one that costs real money

**Today.** Live since 23 September, enforced, and shown to people as they use it:

| | Documents a day | Documents a month |
|---|---|---|
| An account's first 7 days | **300** | no cap |
| After that | **50** | **600** |
| `paid` | unlimited | unlimited |

Nobody is `paid`; the tier exists as a column in the database and nothing sets it. The
reasoning written into the migration: the limit *"exists to stop the app being used as a free
bulk reader, not to ration a tradesman"*, and the most a free account can cost in a month is
1,200 documents.

**Why 50 a day is probably not a wall for a real user.** A tradesman photographs receipts as
they happen — a handful a day, a pile on a Sunday. The first week at 300 exists precisely for
the person catching up on a year.

**The questions.**
- Is 600 a month the right free allowance, or too generous for someone who should be paying?
- Should the free allowance be counted in documents at all, or in something a person
  understands better — invoices sent, or customers?
- The first-week 300 is invisible to anybody who does not read the code. Should the app *tell*
  people they have a generous first week, or is that noise?

---

## 2. What a stranger may do without an account — the biggest design question

**Today.** Nothing. Nine public pages, all of them either the front door, a legal page, or an
article. Even the free-invoice page and "Copy a document" are behind sign-in.

That was a deliberate decision (22 September) and it has been enforced since. But it has
already caused two bugs of the same kind: a page kept telling people "no sign-in needed" three
days after it stopped being true, and the company-check page told Google "Free, no account
needed" until 27 September. **Twice, the words outlived the rule.** That is a symptom of the
rule being stricter than the app's own instincts.

**The questions.**
- Is "nothing before an account" still right? The argument for: an account is one minute, and
  everything is free anyway, so there is nothing to lose by asking. The argument against: a
  tool somebody can *try* is a tool they can recommend.
- If anything opens up, the obvious candidate is **Check a company** — it costs nothing to run,
  it is genuinely useful on its own, and it is the kind of page people share. "Change a file"
  is the next candidate: it runs entirely on the device and costs nothing.
- Whatever is decided, **the page's own words must match it**, including the description a
  search result shows. That is now checked by a test, but only for the pages that had it wrong.

---

## 3. What a paid tier would actually be

**Today.** Nothing is built. No payment, no subscription, no billing. Atanas, 22 September:
*"I want people to still try it for free for now and I don't want to pay anything more for
now."* The plan recorded then: a paid switch on each account that only he can set, off by
default.

**The questions.**
- What does paying buy? Unlimited reading is the obvious one, since it is the only real cost.
  What else — more storage, keeping photographs for ever, the help chat, several users on one
  business?
- One price, or a small and a large?
- Is it per month, or does a tradesman prefer per year?
- **Does anything already built become paid-only?** Everything works for everyone today, so
  every answer here takes something away from somebody.

---

## 4. Letting old receipt photographs go

**Today.** Built, careful, and **switched off**. It would email an owner their photographs
older than a cutoff as one PDF, then clear the pictures — never the record, which stays for
ever. Two separate switches, and it refuses on anything doubtful: a photograph needs *two*
dates past the cutoff (the one printed on the document and the day it arrived), because the
first dry run found a receipt a scan had misdated to 2012.

**The questions.**
- Should it run at all? It is a storage saving, and storage is cheap.
- If it does: after how long, and is "we email it to you first" enough, or should a paid
  account simply keep everything? (The code already exempts a paid account.)

---

## 5. The help chat

**Today.** Built and switched off. It would answer questions about the app, told three things
it may not break: say when it does not know, say it cannot see their records, and say it is
not their accountant. Fenced: signed in only, 40 messages an hour each, 600 characters a
question. Every refusal points at the email form instead.

**Why it is off:** it is the first thing in the app that costs money every time somebody uses
it with no natural limit. Scanning has one — people only have so many receipts. Questions are
endless.

**The questions.** Is it worth the running cost? Should it be paid-only? Or is the walkthrough
help (which is free, always correct, and already built) enough?

---

## 6. Invite a friend

**Today.** Built, switched off. Someone who brings a friend earns extra scans — and only
earns them when the friend actually reads a document, which is what stops it becoming a way
to farm accounts.

**The question.** Turn it on, or is a referral scheme noise for an app with no paid tier to
funnel people into?

---

## 7. The things Atanas has already raised, still open

- **The file library on the dashboard.** He has said he will redesign it himself with another
  chat and send pictures. Described as-is in `dashboard.md`. **Nothing should be changed here
  until those pictures arrive.**
- **Fingerprint sign-in on the Mac.** Not built — there is no passkey support at all. See
  `notes/touch-id.md` for what it would cost and why it has not been started.
- **Payments between accounts** — one profile sending another an invoice and being paid
  inside the app. He raised it; the view given at the time, which he accepted, was that it
  belongs after the basics are solid. Still open.

---

## 8. Smaller things worth an opinion while the design conversation is open

- **The scanner says nothing when it cannot find the page.** Deliberate once — *"everyone
  knows what to do"* — but he has since hit exactly the case where silence is the problem.
  A line after a few seconds ("can't find it — try holding it further back, or tap the button
  to take it yourself") would help. It was not added because it would weaken two existing
  tests, so it is a decision rather than a fix.
- **Five colour themes and dark mode**, chosen per device rather than per account. Should the
  choice follow the person to their other devices?
- **What a printed invoice looks like** is forced back to plain ink whatever theme is picked.
  Right, or should a printed invoice carry the business's colour?
- **The nine-link menu on a phone is one "Menu" button.** Whether the three groups — Money in,
  Money out, Tools — are the right three is a real question; they were chosen in one sitting.


---

## How somebody arrives, and how they get in

Everything below was read out of the code on 2026-09-28, in `/Users/nasko/INVOICE/web/`.

**The one rule that shapes this whole area:** nothing works before an account. There are exactly **nine public addresses plus three customer-link prefixes**. Every other address in the app bounces a stranger to `/login`. The list is in one place — `Gate` inside `/Users/nasko/INVOICE/web/src/app/AppShell.tsx` — and each entry has the reason written next to it in the code.

---

### The front door — `/` (nobody signed in)

- **What it is for.** The one page a stranger is allowed to see. It says what the app is, shows a drawing of an invoice and a receipt being photographed, and puts the sign-in box right there on the same screen — no separate "sign up" journey.
- **How you get there.** Typing the address, a search result, a printed flyer or QR code, tapping the app name in the header from anywhere, or the "Make an account" button at the foot of `/how-to-invoice`. `/` is also the only address in the sitemap with top priority.
- **What is on it** (`src/components/Welcome.tsx`), in this order on a phone:
  1. Headline: **"Invoices, receipts and what you're owed, in one place."**
  2. One line under it: **"Make an account and it's all yours. Free, and it takes a minute."**
  3. **The sign-in card** — on a phone it comes *before* the explaining, on purpose, because a flyer sends people here to make an account, not to be sold to.
  4. The drawing — a till receipt, an invoice, and a phone with the four corner-brackets of the scanner on it. It is drawn in code (SVG), not a photograph, so it follows whatever colour theme the device has picked.
  5. Three lines of what it does: **"Photograph a bill** and it reads itself." / **"Make an invoice** in a minute, and send it." / **"See what you're owed** and what to put by for tax."
  6. The footer (on every page): Invoiceover · How it works · How to invoice · Your information · Terms · Accessibility · Security · Tell us something.
- **What it does behind the scenes.** `src/app/page.tsx` ends with one decision: signed in → the Dashboard, not signed in → `Welcome`. While it is still working out which, the screen shows the words **"Loading…"** in small grey type. The moment anyone lands, `Gate` also quietly reads two things out of the address and stores them on the device: `?from=<tag>` (which flyer or depot — `src/lib/source.ts`, kept in localStorage, written onto the account later as `came_from`) and `?invite=<code>` (`src/lib/invites.ts`). Both are letters-and-digits only, 40 and 12 characters max, and neither goes anywhere until an account is actually made.
- **Where it takes you next.** Only into the sign-in card, `/login`, or the seven footer links. **Two of those footer links are dead ends for a stranger:** "How it works" (`/help`) and "Tell us something" (`/feedback`) are *not* on the public list, so tapping either sends them to `/login`.
- **Free, gated or not built.** Free and public. Costs nothing to run — no model call, no paid API, all drawn locally.

### The dashboard — `/` (signed in)

Same address, completely different page. Header **"Dashboard"**, then **"Photograph the paper, and the rest fills itself in."**, then any amber warnings (overdue invoices, recurring expenses due, bills due soon, emailed receipts waiting), then one big black button **"Scan a receipt or bill"** with "Several in a row is fine" under it, then four tiles: **Create an invoice**, **Write a quote**, **Check a company**, **Copy a document**. The rest of the dashboard is another area's ground.

### Sign in — `/login`

- **What it is for.** The same sign-in card as the front door, on its own, with nothing else on the screen. It is where every locked page sends a stranger.
- **How you get there.** Automatically, from any page that needs an account. From the "Sign in" link that is the *only* thing in the header when nobody is signed in. From `/login?next=/copy` and `/login?next=/free-invoice` (buttons on those two pages — see the surprises). And from `/login?new=1`, which opens straight on the new-account tab; **nothing in the app links to that address** — it exists for a flyer or a QR code.
- **What is on it.** A grey line — "Invoiceover — invoices, receipts, and expenses in one place." — and the card.
- **The card itself** (`src/components/SignInCard.tsx`) has **two tabs side by side, neither hidden behind a link: "Sign in" and "New here".**
  - **Sign in:** heading "Sign in", "Welcome back.", **Your email**, **Password** (with a Show/Hide button inside the box), then the black button **"Sign me in"** — deliberately different words from the tab, so nobody thinks the tab is the button. Under it, **"Forgotten your password?"**
  - **New here:** heading "Make an account", "It's free. We'll send one email to check it's you.", **Your email**, **Make a password** ("Six letters or numbers, or more."), **Type the password again** ("So we know there's no typing mistake."), button **"Make my account"**. If the two do not match: **"The two passwords are not the same. Type the same one in both boxes."**
  - Every box has a real label above it, everything is 16px or bigger, and the buttons are full width and bold — written for "babies and old people too".
- **The check-your-email screen.** After "Make my account", if no session comes back, the card turns into: **"One last thing: check your email"**, "We sent an email to *you@example.com*. Open it and tap the button inside. That's it." Then a second way in for anyone who cannot open the link: **"Or type the 6 numbers from the email"**, a wide numeric box (it accepts the phone's own one-time-code autofill) and a **Done** button. A wrong length says **"The code is the six numbers in the email."**; an old code says "That code has run out or isn't right. Check it, or send the email again." Under that: "Nothing after a minute? Look in the junk folder, or send it again." and three ways out — **Send it again**, **I've done it, sign me in**, **Wrong email? Start again**.
  - Signing in with an unconfirmed account says: "You haven't said yes to our email yet. Open it and tap the button, or send it again below." and shows a **Send the email again** button next to the form.
  - The confirmation email comes back to `/login?next=<wherever they were going>`, so somebody who was heading for `/copy` lands on `/copy`, not the dashboard.
- **Forgotten your password.** Third state of the same card: **"Forgotten your password"**, "Tell us your email and we'll send a link to make a new one.", **Send me a link**, then "If that email has an account, a link to make a new password is on its way." — worded that way on purpose so it never reveals whether an address has an account. Then **Back to signing in**.
- **Temporary email addresses are refused** (`src/lib/throwawayEmail.ts`, a list of ~50 known services and their subdomains): **"That's a temporary email service, and your records would go with it. Use an address you'll still have next year."** Somebody's own domain is never caught — it is a named list, not a guess at what looks odd.
- **What it does behind the scenes.** Straight to Supabase Auth from the browser (`supabase.auth.signInWithPassword` / `signUp` / `verifyOtp` / `resend` / `resetPasswordForEmail`). There is no server route of ours in the middle. It also reads the form fields directly rather than trusting React state, because Chrome's autofill sometimes fills a box without telling the page. A dead confirmation link that lands back here with a reason in the address is translated to: "That link has run out or was already used. Sign in and, if it asks, send yourself a new one."
- **Where it takes you next.** The dashboard, or `?next=` if one was carried (and `src/lib/safeNext.ts` refuses anything that is not a plain same-origin path, so `//evil.com` cannot be smuggled in). `/reset-password` arrives by email link, not from here.
- **Free, gated or not built.** Public. Free. The only cost is Supabase's own email sending. Password minimum is **six characters**, set in three places (`minLength={6}` on both boxes and a check in `/reset-password`).

### The people-check (Cloudflare Turnstile) — part of the sign-in card

- **What it is for.** Proof that a person, not a script, is making an account — because a hundred free accounts are only worth making if each one costs nothing. It is **invisible** to almost everybody: most people see nothing at all.
- **Where it sits.** Inside the card, just above the button, on **all three** actions: signing in, making an account, and asking for a password-reset link. Not on anything else.
- **What it does behind the scenes.** `src/components/Turnstile.tsx` loads Cloudflare's script by hand and hands a token to the card, which passes it to Supabase; **Supabase holds the secret and does the actual checking**, so nothing in the browser can be trusted on its own. A token is good for one attempt, so the widget is reset after every press.
- **What it says when it fails** (`src/lib/peopleCheck.ts` — the whole point of that file): the word *captcha* never reaches a person. A token that had not arrived yet gives **"The check that you're a person hadn't finished. Give it a second and press the button again."** Anything else gives "The check that you're a person didn't go through. Reload the page and try once more." If Cloudflare's own script will not load: "The people-check didn't load. Try again, or reload the page." — and it does not block the button, because Cloudflare being unreachable must not lock somebody out of their own records.
- **Free, gated or not built.** **On in production, off on this machine.** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is not in `web/.env.local` (checked; the component then renders nothing and sends no token, and sign-in behaves as if it never existed). `CLAUDE.md` records it as set in Vercel Production and the matching secret switched **on** in Supabase, so the live site has it. Free — Turnstile costs nothing. Two warnings already paid for: the site key has to be deployed *before* the Supabase switch goes on or every sign-in fails, and **the built-in browser pane cannot solve a Turnstile challenge** — it renders and sits pending for ever. Test this one in a real Chrome or not at all.

### Set a new password — `/reset-password`

- **What it is for.** Where the "forgotten password" email lands.
- **How you get there.** Only by the emailed link. Nothing in the app links to it.
- **What is on it** (`src/app/reset-password/page.tsx`), one of four states: "Checking your reset link…" → **"Set a new password"** / "Choose something you'll remember." with **New password** and **Confirm new password** (placeholders, not labels — the only screen in this area still doing that) and **Set new password**; or **"That link has run out"** / "It has expired, or it was already used. Ask for a new one on the sign-in page." with **Back to sign in**; or **"Password changed"** / "Taking you to your dashboard…"
- **What it does behind the scenes.** Handles *both* shapes of Supabase reset link — a `?code=` to exchange and tokens already picked up from the address — rather than assuming one. Then `supabase.auth.updateUser({ password })`, then a 1.5-second pause and off to `/`.
- **Where it takes you next.** `/` on success, `/login` if the link is dead.
- **Free, gated or not built.** Public **and** deliberately reachable while signed in — a reset link logs you in as it arrives, so unlike `/login` this page must not bounce an authenticated visitor away before they finish. Free.

### No signal — `/offline`

- **What it is for.** What shows instead of the browser's own "no internet" page. On a site full of somebody's accounts, "broken" and "offline" are a frightening difference.
- **How you get there.** The service worker serves it when a page is asked for and there is no connection. Nothing links to it; you cannot navigate there on purpose in normal use.
- **What is on it.** **"No signal just now"** → "Nothing has been lost. Everything you have saved is still there, and will be waiting when you have a bar or two." Then a card, **"What you can do meanwhile"**: photograph receipts with the phone's own camera and scan them in later; write down anything you need to remember. Then "When the signal comes back, this page will load by itself if you pull it down, or tap below." and a black **Try again** button.
- **What it does behind the scenes.** `web/public/sw.js`, registered for **everybody** by `Gate` (it used to be registered only by whoever turned notifications on, so the offline page reached almost nobody). The worker caches only the app's own content-hashed files and this page. **It deliberately caches nothing with figures in it** — a stale invoice total is worse than an honest "you're offline". "Try again" is a real page load, not an in-app link, because an in-app link would move between routes the browser still does not have.
- **Where it takes you next.** `/`.
- **Free, gated or not built.** Public. Free. **The offline scan queue — keeping captures on the phone until there is signal — is not built.**

### The Gate: exactly what a stranger may open

`Gate` in `src/app/AppShell.tsx`. **There is no middleware** (checked: no `middleware.ts` anywhere) — this is a check in the browser, not on the server. The page's shell is served to anybody; what protects the *records* is Supabase row-level security, not this list.

| Address | Public? | The reason written in the code |
|---|---|---|
| `/` | yes | The front door itself. |
| `/login` | yes | Signing in. Bounces you to the dashboard if you are already signed in. |
| `/reset-password` | yes | Must work signed out *and* signed in — see above. |
| `/privacy` | yes | "has to be readable before anyone hands over an email address, and an advertiser or app store will ask for a link that works signed out". Header reads **"Your information"**. |
| `/terms` | yes | Same reason. Header **"Terms"**. |
| `/security` | yes | "Whoever finds a security problem in this app almost certainly does not have an account, and telling them to make one first is how a report turns into a tweet." Header **"Report a security problem"**. |
| `/accessibility` | yes | "A statement about whether somebody can use the app is no use behind a sign-in they may not be able to get through." Header **"How usable this is"**. |
| `/how-to-invoice` | yes | The article — see below. |
| `/offline` | yes | "Shown by the service worker when there is no signal, which is exactly when the sign-in check cannot be made." |
| `/i/<token>` | yes | A customer's invoice link. |
| `/q/<token>` | yes | A customer's quote link, with Accept / Decline. |
| `/r/<token>` | yes | A supplier answering a request for prices. |
| **everything else** | **no** | `router.replace("/login")`. Including `/free-invoice`, `/copy`, `/scan`, `/help` and `/feedback`. |

Two details worth knowing. The header is stripped entirely on `/i/`, `/q/` and `/r/` — "a customer opening an invoice link sees the invoice, not the app". And the **"Loading…"** check runs *before* the public-page check, so every one of these pages, a customer's invoice link included, shows that grey word until Supabase answers about a session that page does not need.

**What search engines are told** (`src/app/robots.ts`, `src/app/sitemap.ts`): crawlers are pointed at `/`, `/privacy`, `/terms`, `/how-to-invoice` and shooed off everything else including `/i/`, `/q/`, `/r/`, `/login`, `/free-invoice` and `/feedback`. The sitemap lists four pages. `/security` and `/accessibility` are public but in neither list.

### How to invoice when you're self-employed — `/how-to-invoice`

- **What it is for.** The only page a stranger who has never heard of the app can find and actually use. Since nothing works before an account, the honest version of "free invoice template UK" is a page that **answers the question** rather than pretending to be a tool.
- **How you get there.** Google, the footer link "How to invoice" on every page, and the Tools menu (as "How it works" is a different page).
- **What is on it.** Headline, then six sections: What has to be on it · Numbering: the bit people get wrong · VAT · If you're in construction: CIS · Getting paid · Keep the paper. Then a card, **"Doing all this by hand is the slow way"**, and a black **Make an account** button. Then, in small grey: "Written to be useful, not to be advice… Last reviewed 23 September 2026."
- **Free, gated or not built.** Public, free, no model call, plain text. Everything on it has to stay true — it is the one page making claims to strangers.

### Leaving: Sign out

The only other control in the header when signed in. `src/lib/signOut.ts` does more than it looks: it clears the number on the home-screen icon, unsubscribes *this device* from push and deletes the row (or a borrowed or sold phone keeps getting somebody's "2 overdue invoices" on its lock screen every morning), then gives Supabase **four seconds** and afterwards checks localStorage itself rather than believing the answer — `signOut()` can come back reporting no error while leaving the session exactly where it was. If anything is left, it wipes the key and does a full page load to `/login` so Back cannot return to a page that looks signed in.

### Worth deciding

- **The two dead footer links.** "How it works" (`/help`) and "Tell us something" (`/feedback`) sit in the footer of the front door, and both bounce a stranger to `/login`. Should a stranger be able to read the walkthroughs and report a problem without an account — or should those two links simply disappear until somebody is signed in?
- **`/free-invoice` — reopen it to typing, or finish closing it?** Its own code still contains the stranger version, including the words "typing one in stays open to all", and it cannot be reached. This is the free/paid line in its purest form: is making one invoice by hand the thing you can do before you commit an email address, or is the article (`/how-to-invoice`) the whole of the free shop window?
- **`/copy` the same question, smaller.** It still carries "It needs a free sign-in first. Nothing to pay." and a **Sign in to copy a document** button that nobody can ever see. Copying costs no model call at all — nothing is read by AI and nothing is stored. Is there a reason it needs an account?
- **Six characters is the password minimum.** Deliberate, for an audience on a phone in a van — or too low now that the app holds real accounting records?
- **Is the front door finished?** It is one headline, one line, one drawing and three sentences. There is no screenshot, no price, no "what you can save it as", nothing about the scanner's accuracy, no mention that it works on an iPhone home screen. Is that the deliberate final shape, or does it need a second screenful for somebody arriving from Google rather than from a flyer?
- **"New here" is only findable on the page.** `/login?new=1` opens straight on the new-account tab and **nothing in the app links to it**. Should the flyer QR codes point there — and should they carry `?from=<depot>` while they are at it, since the tag mechanism is already built and currently unused?
- **The loading word.** Every page, including a customer's invoice link, shows a bare grey **"Loading…"** until Supabase answers about a session. On a slow phone that is the first thing a customer sees before their invoice. Should the customer links skip the session check altogether?
- **Invites.** `NEXT_PUBLIC_INVITES` is not set, so nothing about inviting a friend exists on screen — but the database work is done and the sign-up already knows how to claim a code. It is one environment variable away. Does it turn on for the trial, or stay off until the free tier is settled?
- **Who may report a security problem, and who may send feedback?** `/security` is public on purpose. `/feedback` is not, and the button is on every signed-in page. Is that split right, or should a stranger be able to tell you something too?

### Surprises found while reading

**Contradicts `CLAUDE.md`:**

1. **The front door has three lines, not five.** `CLAUDE.md` says "the headline, five short lines of what the app does, what you can save it as, and `SignInCard` beside them". `src/components/Welcome.tsx` has three lines, no mention of what you can save it as, and a drawn SVG that "does the rest of the work". The code's own comment says "The six lines of explaining became three" (Atanas, 2026-09-23). `harness/test-first-page.mjs` pins three. The file is stale.

2. **The dashboard's first row is not what `CLAUDE.md` says.** It says "Scan a receipt, Make an invoice, Copy a document, Check a company". The code has one big **Scan a receipt or bill** and then four tiles: **Create an invoice**, **Write a quote**, **Check a company**, **Copy a document**.

3. **The header's menu groups are stale too.** `CLAUDE.md` lists Money in as invoices, quotes, clients, recurring invoices. `src/lib/navGroups.ts` has six links there, including **`/money`** and **`/jobs`**, which `CLAUDE.md` never mentions anywhere; Tools has picked up `/convert` ("Change a file") and `/help` ("How it works").

4. **`robots.ts`'s own comment is wrong about its own subject.** It says "Only the front door and the two legal pages are public" while allowing `/how-to-invoice` in the very next line, and there are nine public routes plus three link prefixes. Harmless, but it is the sort of comment somebody reads instead of the Gate.

**Half-built or unreachable:**

5. **Two pages still believe they are partly public.** `/copy` (`src/app/copy/page.tsx` around line 161) and `/free-invoice` (`src/components/free-invoice/FreeInvoiceBuilder.tsx` around line 378) both branch on `!user` and render a sign-in prompt with a `/login?next=…` button. **Neither branch can ever run**, because the Gate redirects both routes to `/login` first. `/free-invoice`'s version still tells the reader "It needs a free sign-in first, so every read comes from a real person; anything you've typed here stays", and its code comment says "typing one in stays open to all" — which has not been true since the whole page was closed. `CLAUDE.md` already records that the page's *heading* said "no sign-in needed" three days stale; this is the same staleness, one layer down, still live in the code.

6. **The footer offers a stranger two things it will not let them have** — `/help` and `/feedback`. Nothing in the harness appears to check the footer's links against the public list.

**Facts that are true but might surprise him:**

7. **There is no server-side gate.** No `middleware.ts` exists. `Gate` is a `useEffect` in the browser: it calls `router.replace("/login")` and renders `null`. The HTML shell of `/invoices` is served to anyone who asks; it just contains no data, because the data comes from Supabase under the signed-in user's own token and row-level security. That is a defensible design, but "nothing works before an account" is enforced by the browser and by RLS, not by a locked door.

8. **The people-check is inert on this machine.** `grep -c '^NEXT_PUBLIC_TURNSTILE_SITE_KEY=' web/.env.local` returns 0, so local testing of sign-in never exercises it at all. `CLAUDE.md` records it as live in Vercel Production with Supabase's switch on — meaning the production sign-in path has a failure mode that no local run and no harness suite can reproduce. `test-people-check.mjs` pins the *wording* of the refusal, not the challenge itself.

9. **"Loading…" is shown before the public-page check**, so it is the first thing a customer sees on an invoice link. On a dead connection that word may be all they see for a while: the same `getSession` call that must answer here is the one `src/lib/signOut.ts` documents as sitting there for a long time when supabase-js retries a token refresh with no network. Whether `getSession` always resolves offline is **not established from the code**.

10. **The flyer-tracking mechanism is built, live and unused.** Any arrival with `?from=depot-3` has that tag stored on the device and written onto the account as `came_from` when it is eventually created. Nothing in the app ever reads it back — there is no screen that counts which depot worked.


---

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


---

## Sales invoices — the list, and writing one

Three routes, four screens: `/invoices` (the list), `/invoices/new` (the form), and
`/invoices/<id>`, which is **two completely different pages** depending on whether the
invoice is still a draft or has been issued. Everything here is the money **coming in** —
his own invoices to his customers. Supplier paperwork he has scanned lives in `receipts`
and is somebody else's section.

---

### Invoices — `/invoices`

- **What it is for.** The record of every invoice he has written: what is owed, what is
  late, what is still a draft. Header line: *"Make invoices, and look back at the ones you
  have sent."*
- **How you get there.** Header → **Money in ▾ → Invoices**. Also from the dashboard:
  **Owed to you** and **View all N outstanding** land here, **Overdue** and the amber
  overdue banner land on `/invoices?status=overdue` with the filter already set, and a
  customer's history opens `/invoices?client=<id>`.
- **What is on it**, in screen order:
  1. **"Invoices"** with the sub-line, and top-right two things: **Download for a
     spreadsheet** (only once there is at least one invoice) and **+ Add**, the standard
     add sheet (`ScanOrAdd` → `AddAnything`), which for this page also holds **Scan an
     invoice** — *"Photograph one and fill this page's form from it"* — and **Fill it in by
     hand**. Beside the sheet, out in the open, **Upload a file**.
  2. **A tip** the first few times (`tip:invoices-scan`): *"Tip: **Scan an invoice** you've
     sent before and it's copied as a new one — customer, lines and terms — dated today."*
  3. **"Same again"** — a white card of up to **three** buttons, one per customer, each
     showing the name and under it `#INV-0341 · £1,250.00`. *"Last month's invoice to them,
     dated today. Check it before you send it."* A customer appears only with **two or more
     issued invoices** — a one-off is not a habit (`src/lib/sameAgain.ts`, `A_HABIT = 2`).
     Tapping one writes a new draft copying the lines, CIS rate, notes and terms, dated
     today, due in 30 days, and opens it.
  4. **Filter** (a fold-out, already open if a filter is on): **Search invoice #**, **From**,
     **To**, a **Customer** dropdown (*All customers*), a **Status** dropdown (*All statuses*,
     *To receive (owed to me)*, *Draft*, *Sent*, *Partially paid*, *Paid*, *Overdue*),
     **Min total (£)**, and a **Tag** dropdown only if any invoice has a tag. Then **Clear
     filters**. The search box searches **the invoice number only** — not the customer name,
     not the description.
  5. **The rows.** Each: `#INV-0341 · Smith Ltd`, a coloured status badge, a grey **Credit
     note** badge if there is one, and for a sent or part-paid invoice an inline **Mark as
     paid** link. Second line: date · amount, and where there is a credit note the old total
     struck through — *"£1,500.00 after £250.00 credited"* — plus *"£500.00 paid, £750.00
     still owed"* and *"due 14 Oct"*. Credit notes are listed underneath, indented. Tags as
     grey pills. On the right, **Continue draft** (a draft) or **View / print**, and
     **Remove**.
  6. **Empty state:** *"No invoices yet. Scan one you've sent before to copy it, or add one
     by hand."* — or *"No invoices match these filters."* Neither ever shows when the load
     failed; a failure shows one red line instead.
- **What it does behind the scenes.** Five parallel reads on arrival (invoices, customers,
  credit notes, payments, business profile) straight from Supabase under row-level security;
  every figure is worked out in the browser. **Five statuses, four stored.** Draft, Sent,
  Partially paid and Paid are columns; **Overdue is never stored** — it is derived every time
  from status + due date (`src/lib/invoiceStatus.ts`), so it cannot go stale. *To receive*
  is not a status at all, it is the filter for sent-or-part-paid. The amount on a row is
  **what the customer actually pays**: total, less any CIS the contractor keeps back, less
  credit notes (`src/lib/cis.ts` `invoiceCharge` and `creditOffDue`,
  `src/lib/invoiceBalance.ts`). **Mark as paid** here re-reads the payments and credit notes
  from the database first (so another tab's payment counts), records exactly what is still
  owed as a payment noted *"Marked as paid"*, sets the status to paid and fires the confetti.
  **Download for a spreadsheet** writes `invoices-<date>.csv` of **the filtered rows only**,
  columns: number, date, due_date, client, total, cis_deducted, credited, paid, balance,
  status, notes.
- **Where it takes you next.** `/invoices/<id>`, `/invoices/new`, `/invoices/new?scan=1`,
  `/scan`, `/receipts/new`, `/quotes/new`, `/clients/new`, `/copy`.
- **Free, gated or not built.** Behind sign-in. Costs nothing to run — no model call, no paid
  API, no environment switch. Only **Scan an invoice** (below) costs anything.

---

### New invoice — `/invoices/new`

- **What it is for.** Writing an invoice. It always saves as a **draft** — nothing is issued
  and no number is used up until he says so on the next screen.
- **How you get there.** **+ Add → Fill it in by hand** on the invoices list or anywhere else
  the add sheet appears (there it is called **Make an invoice**); the dashboard's small line
  *"or write one by hand"*; tapping a customer's name on the dashboard, which arrives as
  `/invoices/new?client=<id>` with them already chosen. `?scan=1` opens the camera on arrival
  to copy an invoice he has sent before.
- **What is on it**, in screen order:
  1. **"New invoice"**, and under it *"Will be **INV-357358** when you send it"* — a preview
     of the next number from Settings, not a reservation.
  2. Top right, **Scan or attach a document** (camera). This reads a **source** document — a
     timesheet, a delivery note — and fills in **only the date, the line items and the
     notes**. The line under it says so, and says the customer *"is always your own choice
     below, never guessed."*
  3. **"Or describe it and it's filled in for you"** — a two-line box, placeholder *"e.g.
     Smith Ltd, 3 days plastering at £250 a day plus VAT, 14 days"*, button **Fill in the
     invoice**, and *"On a phone you can tap the microphone on the keyboard and say it."*
     Hidden in copy mode.
  4. In copy mode instead: *"Scan an invoice you've sent before to copy it."* with **Scan an
     invoice** and **Upload a file**; afterwards *"Copied from your scan: customer, lines and
     terms. Dated today — check everything before saving."* and **Scan again**.
  5. If a Free-page draft was left behind: *"Imported from your free invoice."* plus warnings
     about a different currency, a different VAT setting, and the number it carried there —
     with **Discard import**, which asks first and names what goes.
  6. **Customer** — type-ahead with an arrow (`ContactField`), placeholder *"Customer — type a
     name, or tap the arrow"*, ordered by who he invoices most. A scanned name that is not a
     customer shows *"Smith Ltd isn't one of your customers yet"* + **Add as new customer**,
     or *"…is an archived customer"* + **Unarchive and use**.
  7. **What you charge for** — up to eight chips, `+ Labour, day rate (£250.00)`, this
     customer's own past lines first, then everything he has ever charged for
     (`src/lib/savedPrices.ts`).
  8. **Invoice date** and **Due date** side by side, then **Payment terms** (*"e.g. 30
     days"*). Terms naming a number of days move the due date; typing the due date by hand
     stops that. Default is 30 days.
  9. **CIS subcontractor** — a tick box, *"The contractor keeps back CIS from the labour and
     pays it to HMRC for you. Mark each line as labour or materials."* Ticking it reveals
     **CIS rate**: *20% (registered)* or *30% (not registered)*, and a **Labour / Materials**
     pair of pills under every line.
  10. **The reverse-charge question**, an amber box that appears only when he is VAT
      registered, CIS is on, and the customer is a company or has a VAT number: **"Should
      this invoice charge VAT at all?"** with **They pay the VAT** (switches every standard
      line to *Reverse charge (20%)*, reduced to 5%) or **No, charge VAT as usual**. Asked
      once per invoice either way. `src/lib/reverseChargePrompt.ts`.
  11. **The lines** — Description / Qty / Unit price / **VAT** (the VAT column only exists if
      the account is VAT registered) / ✕, and **+ Add line**. Leaving a description fills in
      the VAT rate this customer was last charged for that exact wording, but only if the
      line is still on the default.
  12. **Notes**, **Tags** (comma separated).
  13. **Totals** — Subtotal, a line per VAT rate, **Total**, the **Save draft** button, the
      CIS summary (*"CIS deduction (20% of £1,000.00 labour): −£200.00"* / *"The contractor
      pays you: £1,000.00"*), **Clear form** (asks first), and the footnote: *"Saves as a
      draft — fully editable until you mark it sent, which is what assigns its invoice
      number, locks the rest in, and starts the due-date clock."*
- **What it does behind the scenes.** Saving inserts an `invoices` row with status `draft`
  and a **placeholder number** `DRAFT-<uuid>` (`src/lib/invoiceNumber.ts`) — the column is
  required and unique per account, so a draft needs *some* value, and a placeholder takes
  nothing out of the real sequence. Then it opens `/invoices/<id>`. A copy never guesses the
  customer on a near name: only an **exactly** matching name is picked, because
  "Riverside Building Services" once matched "Hillside Building Services" and the invoice
  went to the wrong company.
- **Where it takes you next.** `/invoices/<id>` (the draft it just saved), the camera, or
  `/clients/new` through the contact field.
- **Free, gated or not built.** Behind sign-in, and **this is the one screen in the section
  that costs money per use**:
  - **Scan or attach a document** and **Scan an invoice** both call the reader and both
    **spend one of the account's documents** (`POST /api/scan` and
    `POST /api/invoice-template`, counted in `src/lib/scanLimit.ts`). **`SCAN_LIMITS` is
    `on` in production**, so every account is limited today: **300 documents a day for the
    first seven days, then 50 a day and 600 a month.** Nobody is on a paid plan; there is no
    paid plan. Both of these paths ask for **Claude (Opus 5)** explicitly rather than the
    cheap reader — the copy path hard-codes `engine: "claude"`, and `/api/scan` defaults to
    Claude when no engine is named — so they are the slow, expensive reads.
  - **Fill in the invoice** (describe it in words) calls **Claude** too but is **not** counted
    against the document allowance at all: `POST /api/invoice-from-text` has only its own cap
    of 60 an hour per account and 2,000 characters. That is an inconsistency, not a decision.
  - Everything else on the page — typing, the chips, the CIS maths, saving — is free.

---

### Draft invoice — `/invoices/<id>` while it is a draft

- **What it is for.** The same form again, now saved, with the one button that turns it into
  a real invoice. Header: *"Nothing's been sent yet — everything here, including the client
  and line items, is still editable. Marking it sent locks the financial content and starts
  the due-date clock."*
- **How you get there.** **Continue draft** on the list, or straight off **Save draft** on
  the form.
- **What is on it.** A **Draft** badge; a plain **Customer** dropdown (not the type-ahead);
  Invoice date / Due date; Payment terms; the CIS tick box and rate; the lines with the VAT
  column; Notes; Tags; Subtotal / VAT / **Total**; then **Save draft** and **Mark as sent**.
  **Mark as sent** opens a panel rather than acting: *"This assigns invoice number
  **INV-357358**, locks the invoice in, and starts the due-date clock. There's no way to type
  a different number here — it's assigned automatically to keep the sequence gap-free."* with
  **Confirm & mark as sent** and **Cancel**. There is **no Remove button here** — deleting is
  only offered on the list.
- **What it does behind the scenes.** Editing a draft goes through
  `invoicesStore.updateDraft`, which may touch the customer, date, lines, CIS rate, due date,
  terms, notes and tags. **Confirm & mark as sent** saves the pending edits and then calls
  the Postgres function `assign_invoice_number` (migration-012, extended by 024), which in
  **one transaction** takes the next number, advances the account's counter, sets the status
  to `sent`, and **stamps the account's VAT registration onto the invoice**. One transaction
  because a dropped connection halfway must never burn a number without issuing the invoice,
  or issue one without burning it. The number shown in the panel is a preview only; the real
  one comes back from the database. Two known repairs are built into that call: a brand-new
  account with no business profile gets the defaults saved rather than failing on the first
  invoice it ever issues, and a prefix cleared to run a bare numeric series is put back to an
  empty string without touching anything else.
- **Where it takes you next.** Itself, as the issued invoice.
- **Free, gated or not built.** Behind sign-in, free, no model call, no switch.

---

### The invoice — `/invoices/<id>` once it is sent, part-paid or paid

- **What it is for.** The finished invoice: the sheet the customer sees, and everything
  around it — getting it to them, recording the money, correcting it.
- **How you get there.** **View / print** on the list, the dashboard's *Awaiting payment*
  rows, or **Confirm & mark as sent** on the draft.
- **What is on it**, in screen order:
  1. A tip (`tip:invoice-how`): *"How it works: record money as it comes in and the invoice
     keeps its own score — part paid, then paid, without you setting it."*
  2. **The status badge** (Paid green, Overdue red, Partially paid amber, Sent blue), then
     **Mark as paid** unless it is already paid, and **Mark as unpaid** — which only appears
     when the status is not *sent* **and there are no payments recorded**. On the right:
     **Edit details**, **Duplicate**, **Send or share** (jumps to the panel below), **Print /
     save as PDF**.
  3. **Edit details**, when opened: *"Only administrative details here — the invoice number,
     date, client, and line items are locked now that it's been sent, since they're what was
     actually issued. Use a credit note below for anything that needs a financial
     correction."* Four fields only: **Due date**, **Payment terms**, **Notes**, **Tags**.
  4. **The invoice sheet itself** (`src/components/invoice/IssuedInvoice.tsx`) — the same
     component drawn on screen, in print, in the PDF and on the customer's `/i/` link, so
     they can never disagree. Logo, business name and address, VAT number; `Invoice
     INV-0341`, date, terms; **Billed to**; the line table; Subtotal / each VAT rate / Total;
     the CIS deduction; a line per credit note and per payment; the reverse-charge wording in
     a box when it applies; **Amount due** in large type with the due date or **Paid**; the
     notes; **How to pay** with the bank details from Settings; the late-payment-interest
     line for business customers if that switch is on; and for a limited company the
     registered name and company number in the footer (Companies Act 2006 s.82).
  5. **Payment reminders** — the five-step schedule (3 days before, on the day, +7, +14
     'late', +30 'final') with *Sent 14 Sep* / *Goes out today* / *Goes out 21 Oct* / *Not
     sent* against each, or one plain sentence saying why there are none: no due date, no
     email on the customer, reminders switched off for them, or *"marked part-paid but no
     payments are recorded, so the balance isn't known."*
  6. **View online** — the private `/i/<token>` link. Either **Make and copy the link**, or
     the link in a box with **Copy link**, **Open**, *"Opened 3 times: first 14 Sep 09:12,
     last …"* and **Stop this link and make a new one** (asks first; the old one dies
     immediately).
  7. **Send it** — *"£1,500.00 · INV-0341 goes as a PDF, with your payment details in the
     email."* Then **Send to**, an optional **Message**, **Send me a copy (…)**, *"Replies go
     to …"*, the send button; and under a rule, *"Or share it yourself"* with **Share
     (WhatsApp, Messages…)**, **Download PDF** and the **Save as** menu (PDF, .png, .jpg,
     .doc, .html, .txt, .csv).
  8. **Text <customer>** — ready-made WhatsApp/SMS messages. A paid invoice offers *Thanks
     for paying* and *Job done*; anything else *Job done*, *On my way*, *Running late*,
     *I've arrived*.
  9. **Payments** — **+ Record a payment**, which opens **Date received**, **Amount received
     (£)** pre-filled with the balance, and **How it was paid** (Bank transfer, Card, Cash,
     Cheque, Other, *Not saying*), then **Save payment**. Each payment lists with **Remove**
     and the card ends *"Still owed: £750.00"* or *"Paid in full."* With none:
     *"Nothing received yet. Record part-payments here and the balance and reminders
     follow."* — or, where credit notes closed it, *"Settled in full by credit note. No money
     was received, and none is owed."*
  10. **Credit notes** — **+ New credit note**: date, **Amount to credit (£)**, **Reason
      (optional)**, **Save credit note**. On a CIS invoice a note first explains to credit
      the value of the work *before* CIS and names the total to cancel the lot. Each note
      lists with **Remove**.
- **What it does behind the scenes.**
  - **What locks, and why.** `invoicesStore.update` can only touch status, due date, terms,
    tags and notes. The **number, date, customer and lines are not patchable at all** once
    the status is not draft — not hidden in the UI, unavailable in the store. The reason is
    written in the code: an issued invoice is *what was actually issued*, a document the
    customer holds and HMRC may ask about, so changing it quietly is the exact problem credit
    notes exist to prevent.
  - **How a mistake is corrected.** A **credit note** — a dated row with an amount and a
    reason, which prints on the invoice as a minus line and comes off what is owed. To cancel
    an invoice completely, credit its full total. Credit notes have no number and no document
    of their own; they are lines on the invoice they belong to. On a CIS invoice the credit is
    the value of the work **before** the deduction, and the deduction shrinks by the same
    share: £500 credited on £1,000 of labour at 20% takes £400 off what the contractor pays
    (`creditOffDue` in `src/lib/cis.ts`).
  - **How the status follows the money** (`src/lib/invoiceBalance.ts`). Owed = total (less
    CIS) − credit notes − payments, each figure rounded to the penny **before** subtracting,
    so a half-penny from 5% VAT cannot leave a phantom 1p. `statusFromPayments` then says:
    **paid** once nothing is left (credited in full counts), **partly paid** while some money
    is in, **sent** otherwise. It runs after every payment and every credit-note change on
    this page — **never** just from opening it, so looking at an invoice cannot alter it. Two
    deliberate exceptions: an invoice **he** marked paid or part-paid by hand before payments
    existed keeps that status (its balance is genuinely unknown, so the reminders say so
    rather than guess), and a **£0 balance does not make it paid** — after a deposit, only him
    saying so does.
  - **Mark as paid** re-reads from the database, records whatever is still owed as a payment
    today noted *"Marked as paid"*, and celebrates. **Every one of the three money-writing
    actions on this page — record a payment, mark paid, add a credit note — is guarded by a
    `useRef` and not by `disabled`**, because React applies `disabled` on the render *after*
    the first press: two taps in one tick both got through and invoices were paid twice and
    credited twice before this was fixed. Worth knowing before any of these buttons are
    restyled.
  - **Removing a payment or a credit note** asks first, names the amount, and says the
    balance goes back up. A credit-note removal that fails **puts the note back on screen**
    and says so, because the same array feeds the printed sheet and the chase email: showing
    it gone would mean asking for money that was credited.
  - **Duplicate** makes a fresh draft dated today, due in 30 days, and strips any
    `from <quote number>` / `deposit for <quote number>` tag — a copy is not the invoice a
    quote became.
- **Where it takes you next.** `/i/<token>` (the customer's view), `/invoices/<id>` for a
  duplicate, `/clients` to fix a missing email, `/settings` for the reminder wording.
- **Free, gated or not built.** Behind sign-in. Nothing here calls a model. Two things cost
  real money: **sending the email** (Resend, capped at 30 an hour / 100 a day per account and
  60 an hour across the whole app) and the reminder emails the cron sends. The PDF is made in
  the browser, so it costs nothing. No environment switch gates this page.

---

### Deleting an invoice, and when it is refused

**Remove** exists only on the list, never on the invoice itself. It asks first — *"Remove
invoice INV-0341? It won't be in your records any more, and this can't be undone."* — and it
is offered on **issued** invoices as well as drafts, which is the one place the app is more
permissive than the project's own rules. Three things stop it:

- **An invoice with a payment recorded cannot go** (the foreign key is `ON DELETE RESTRICT`,
  migration-023): *"This invoice has payments recorded against it, so it can't be removed."*
  Removing the payments first removes the block.
- **A deposit invoice being deducted by its balance invoice cannot go** (a database trigger,
  migrations 034 and 035): *"The balance invoice for this quote takes this deposit off… Remove
  the balance invoice first if you meant to start again."*
- Nothing stops removing an invoice that has **credit notes** — they are `ON DELETE CASCADE`
  and go with it silently.

A removed invoice **does not give its number back**. The counter only ever goes forward, so
the sequence gets a hole, and a hole in an invoice sequence is the sort of thing an inspector
asks about.

---

### VAT, in plain English

**The switch.** One tick box in Settings, *VAT registered*, decides whether VAT exists at all
for this account. Turned off, the VAT column is not even drawn on the form, every line is
treated as VAT-free, and the total is just the sum of the lines — an unregistered business
cannot charge VAT.

**The six rates** (`src/lib/vat.ts`), which is what the dropdown on each line offers:

| What it says | What it adds | What it means |
|---|---|---|
| Standard (20%) | 20% | Most work. |
| Reduced (5%) | 5% | Certain work — some renovations, energy-saving materials. |
| Zero-rated (0%) | nothing | Still VAT work, taxed at nothing (new-build housing, most food). |
| Exempt | nothing | Outside VAT altogether. |
| Reverse charge (20%) | nothing | CIS work for a VAT-registered business: **they** pay the 20% to HMRC, not him. |
| Reverse charge (5%) | nothing | The same, where the work is reduced-rate. |

Four of the six add nothing, and they are deliberately **not** collapsed into one "0%" —
zero-rated counts as taxable turnover on a VAT return and exempt does not, and reverse charge
moves the liability to the customer. They are legally different things that happen to total
the same. An invoice carrying a reverse-charge line prints the wording the VAT Regulations
require — *"Reverse charge: VAT Act 1994 Section 55A applies"* — and under it, in plain words,
*"Customer to pay the VAT to HMRC: £200.00 at 20% on £1,000.00. It is not included in the
total above."* Without those words it is not a valid reverse-charge invoice.

**The arithmetic.** Everything is worked in whole pence: each rate's net is rounded, its VAT
rounded once from that, and the total is the sum — so the screen, the PDF, the email, the
`/i/` link and the balance all agree to the penny.

**Why an issued invoice keeps its own setting.** When the invoice is marked sent,
`assign_invoice_number` stamps the account's current VAT registration onto the invoice row
(`invoices.vat_registered`, migration-024). A draft carries `null` and follows whatever the
account says today. So if he registers for VAT — or deregisters — in March, **every invoice
issued before then keeps being totalled exactly as it was sent**. Without that stamp,
registering for VAT would silently add 20% to last year's invoices on screen, in the PDF and
in the customer's link, and the app would be showing a different document from the one the
customer holds. `invoiceVat()` in `src/lib/invoiceBalance.ts` is the whole rule: draft or
unstamped → the account's setting; otherwise the invoice's own. Invoices issued before the
column existed are unstamped and still follow the account, which is how they have always
behaved.

**CIS, in one paragraph** (`src/lib/cis.ts`). On construction work the contractor keeps back
**20%** of the **labour** (30% if the subcontractor is not registered with HMRC) and pays it
to HMRC as tax on his behalf. Materials and VAT are untouched. So the invoice has two
different numbers on it: the **total**, which is what the work was worth and what turnover and
VAT go by, and **what the contractor pays**, which is the total less the deduction and what
every balance, reminder, status and "owed to you" figure goes by. The tax card treats this
year's CIS as tax already paid.

---

### Worth deciding

1. **Reading a document is the only thing in this section that costs money — should the free
   tier give 50 a day, and should writing an invoice by hand ever be limited?** Today the
   limits bite on the two scan buttons and nothing else. Typing an invoice, printing it,
   emailing it and recording payments are all unlimited and nearly free. Is that the shape of
   the free tier — **unlimited invoicing, limited reading** — or should sending emails be
   capped too?
2. **"Describe it and it's filled in for you" calls Claude and is not counted at all.** It is
   a model call on every press, capped only at 60 an hour. Should it spend a document like a
   scan does, get its own smaller allowance, or move to the cheap reader?
3. **The two scan paths on the invoice form use Claude Opus, the expensive and slow reader,
   while `/scan` uses Gemini.** On an iPhone that is the difference between a few seconds and a
   long wait. Was that deliberate for copying an invoice's layout, or is it left over from
   testing?
4. **An issued invoice can be deleted, and its number is never reused.** Should removing an
   issued invoice be refused outright (credit it to nil instead), or kept with the warning it
   has now?
5. **A credit note has no number and no document of its own.** HMRC expect a credit note to be
   a document with its own reference. Should it become a printable, sendable document, or stay
   a line on the invoice?
6. **"Search invoice #" only searches the number.** Nobody remembers invoice numbers; they
   remember the customer and what the job was. Should it search names and line descriptions?
7. **"Same again" appears on the list but nowhere on the dashboard**, which is where most
   people start. Should it be on the dashboard, where the strongest friction-saver in the
   whole competitor review would actually be seen?
8. **Tags exist, are typed free-hand, and are filtered on — but nothing else uses them.** Keep
   them, promote them into something like jobs or sites, or drop them from the form?


---

## What leaves the app once an invoice exists

An invoice is written on `/invoices/new` and issued on `/invoices/<id>` — that is somebody
else's section. This one is about everything that happens **after** it exists: the two tax
schemes that change what the customer actually pays, the seven shapes the finished document
can be saved in, the private web link a customer can be sent, the email that carries the PDF,
and the five reminders the app sends on its own while nobody is watching.

There are no new pages here. Everything below is a control on `/invoices/<id>`, a route with
no screen (`/api/...`), or a public page the customer sees and the owner never does
(`/i/<token>`). That is worth saying out loud, because it is the part of the app that runs
when he is asleep and the part a customer judges him on.

---

### CIS, in plain English

**What it is.** On building work in the UK there is a scheme called CIS — the Construction
Industry Scheme. When a builder (the **contractor**) pays a smaller builder (the
**subcontractor**) for construction work, the contractor is required by law not to hand over
the full amount. They **keep back a slice of the labour and send it to HMRC** as tax paid in
advance on the subcontractor's behalf. The subcontractor gets the rest, and at the end of the
year that slice counts as tax he has already paid.

**Who keeps back what.**

| | |
|---|---|
| **20%** | of the labour, when the subcontractor is registered with HMRC for CIS. |
| **30%** | of the labour, when he is not registered. The penalty for not registering. |
| **Nothing** | off materials, and nothing off the VAT. Only labour. |

`src/lib/cis.ts` holds this in about forty lines, and it is the whole of the rule:
`CIS_RATES = [20, 30]`, labelled on screen as *"20% (registered)"* and *"30% (not
registered)"*.

**What the customer actually pays.** This is the important bit, and it is why a CIS invoice
carries **two different numbers**:

> 3 days labour at £250 = £750
> Materials = £250
> Subtotal £1,000, VAT at 20% £200, **Total £1,200**
> CIS deduction, 20% of £750 of labour = **−£150**
> **The contractor pays you: £1,050**

The **total (£1,200)** is what the work was worth. Turnover, the VAT return and the tax card
go by that. The **£1,050** is what actually lands in the bank, and **every figure in the app
about money owed goes by that one**: the balance, the status, "owed to you" on the dashboard,
the chase emails, "Mark as paid", and the amount printed in large type at the bottom of the
invoice. The function is `invoiceCharge()`, which returns the ordinary VAT totals plus two
extra fields, `cis` and `due`.

**Three details in that file that are easy to get wrong and are already right.**

1. **A line with no label counts as labour.** `withKinds()` marks every unlabelled line
   `labour` when a CIS rate is set, so a forgotten pill deducts too much rather than too
   little. Under-deducting is the one that gets the contractor a penalty.
2. **The deduction can never be negative.** A discount or a deposit entered as a negative
   labour line can outweigh the real labour; `cisDeduction` clamps the labour at zero, so the
   app can never tell a contractor to pay the subcontractor *extra* tax.
3. **A credit note is credited before CIS, and the deduction shrinks with it.**
   `creditOffDue()` takes the credit off in the same proportion: £500 credited against
   £1,000 of labour at 20% takes **£400** off what the contractor pays, not £500. Credit the
   full total and the whole thing cancels to nil.

Everything is worked in whole pence (`pence()` = `Math.round(n * 100)`) so the screen, the
PDF, the customer's link and the reminder email can never disagree by a penny.

**What the app does *not* do with CIS.** It does not file anything, it does not produce a
monthly CIS return, and it does not produce the **payment and deduction statement** the
contractor is legally required to give the subcontractor. The deduction is printed on the
invoice and counted as tax paid on the tax card. That is all.

- **Free, gated or not built.** Free. Pure arithmetic in the browser, no model, no paid API,
  no environment switch. It is on for anybody who ticks the box.

---

### The VAT reverse charge, in plain English

**What it is.** Since 1 March 2021, on most CIS building work between two VAT-registered
businesses, the builder **does not charge VAT at all**. The customer works out the VAT
themselves and pays it straight to HMRC. It exists because of fraud: builders were charging
the 20%, being paid it, and disappearing without passing it on.

So on a reverse-charge invoice the VAT line is **£0** and the total is the net figure — but
the invoice still has to state the VAT the customer must account for.

**When it applies — four conditions, all of them.** From `src/lib/reverseCharge.ts`, read off
HMRC's own guidance on 2026-09-25 rather than from memory:

1. Both sides are UK VAT registered.
2. The payment is reported under CIS.
3. The work is standard-rated (20%) or reduced-rated (5%). Zero-rated and exempt work is
   outside it entirely.
4. The customer has **not** told the supplier in writing that they are an **end user** or an
   intermediary supplier. That written declaration turns the whole thing off — it is the
   customer's statement, not a guess, and it is stored per contact as
   `clients.reverse_charge_end_user` (migration-039, default false).

**How the app handles it: it asks, it does not decide.** `src/lib/reverseChargePrompt.ts` is
explicit about why. Two of the four conditions are things only he knows — whether the customer
really is VAT registered, and whether a declaration has arrived — and getting it wrong either
way is a tax error. So when he is VAT registered, CIS is on, and the customer is a company or
has a VAT number, an amber box appears on the invoice form:

> **Should this invoice charge VAT at all?**
> *"This is CIS work for a business. If they are VAT registered, you must not charge them the
> VAT — they pay it to HMRC themselves, and the invoice has to say so. Charge it anyway and
> they cannot reclaim it."*
> *"Unless they have told you in writing that they are an end user, which most builders are
> not — they pass the work on."*

Answering **They pay the VAT** switches every standard line to *Reverse charge (20%)* and
every reduced line to *Reverse charge (5%)*. Answering **No** leaves it alone. Either way it
is asked once per invoice.

The comment in that file says why the feature exists at all: the reverse-charge rate had been
in the rate picker for a long time and almost nobody ever picked it, **because almost nobody
knows the rule exists.** A plasterer who has ticked CIS and picked a limited company has just
described, in the app's own words, the exact situation the rule covers. The app knows enough
to ask, and asking is the whole feature.

**What prints on the invoice, and why it has to.** The VAT Regulations 1995 require the words
*"reverse charge"* to appear, and HMRC require the invoice to make clear the customer must
account for the VAT and to say how much. Two lines, in a box on the sheet:

> **Reverse charge: VAT Act 1994 Section 55A applies**
> Customer to pay the VAT to HMRC: £200.00 at 20% on £1,000.00. It is not included in the
> total above.

The first is the legal form of words — HMRC accept four, and this is the one naming the
section, because a contractor's bookkeeper recognises it. The second is the same thing in
plain English, because "Section 55A" tells the person holding the invoice nothing about what to
do. **Without those words it is not a valid reverse-charge invoice.**

**Why there are two rates and not one kind.** Because the invoice has to state the *amount*,
and a single "reverse charge" cannot say whether the customer owes 20% or 5%.
`reverseChargeBreakdown()` groups the lines by rate and gives the net and the VAT for each,
in whole pence, so the figure on the invoice is the figure the customer puts on their return.

**Credit notes.** A credit against reverse-charged work reduces what the customer owes HMRC,
so the credit note has to say by how much: `reverseChargeCreditNote()` gives HMRC's own
wording — *"Reverse charge: customer to account for the output tax adjustment of £X to
HMRC."*

- **Free, gated or not built.** Free, and fully built. No model, no API, no switch. Note that
  the **quote** side stamps `quotes.vat_registered` and the **invoice** side stamps
  `invoices.vat_registered`, so a reverse-charge invoice keeps its own wording for ever even
  if he deregisters later.

---

### Save as — the seven shapes a document leaves in

`src/components/SaveAsMenu.tsx` is one grey **Save as** button that opens a list of seven.
It is used on the issued invoice, on a quote, on a customer statement and on the free-invoice
page, so this is one control described once.

The list, in the order it appears, with the exact words on screen:

| Label | Ending | The note under it |
|---|---|---|
| **PDF** | `.pdf` | *Best for sending and printing* |
| **Picture** | `.png` | *For a message or a chat* |
| **Smaller picture** | `.jpg` | *Smaller to send* |
| **Word** | `.doc` | *To edit in Word or Pages* |
| **Web page** | `.html` | *Opens in any browser* |
| **Plain text** | `.txt` | *Plain words, no layout* |
| **Spreadsheet** | `.csv` | *The lines in Excel or Numbers* |

Plain names first, the file's ending in grey after it, so nobody has to know what a PDF is to
pick one. Atanas asked for this on 2026-09-22: *"the more options the better even in the free
version."*

**Which are drawn, and which are read off the printed sheet.** This is the distinction worth
keeping:

- **PDF, .png and .jpg are pictures of the sheet.** The PDF goes through
  `src/lib/invoicePdf.ts`; the two images through `sheetImage()` in `src/lib/saveFile.ts`,
  which uses `html-to-image` at **twice** the screen's pixel size so it stays sharp, on a
  white background. It renders the sheet **twice on purpose** — Safari leaves images (the
  signature) out of the first capture.
- **Word, web page, plain text and spreadsheet are read off the printed sheet itself.**
  `readSheet()` in `src/lib/sheetFile.ts` walks the sheet's own DOM, skips anything marked
  `print:hidden` or `sr-only`, and returns the words and the line table in printed order.
  Then `sheetHtml()` (used for both `.doc` and `.html` — Word opens HTML as an editable
  document), `sheetText()` (columns padded so they line up in any editor) and `sheetCsv()`
  build the file.

**Why that matters.** No screen keeps its own copy of the totals. The four text formats say
exactly what the printed sheet says, so a change to the invoice layout cannot leave the CSV
quoting last month's arithmetic. It is the same reason the PDF is a photograph of the sheet
rather than a redraw. The trade-off is the other way round: because the CSV is scraped from
printed text, its shape follows the layout — a text line is split at its last `": "` into two
columns, which is a guess that works on *"Amount due: £1,050.00"* and would not survive a
restyle that dropped the colon.

**One quirk of `readSheet`.** To know what lands on a line, `innerText` needs the node in the
page — so it clones each block, parks it off-screen at `left: -10000px` at the block's own
width, reads it and removes it. Harmless, but it means the formats cannot be made on a server;
they only work in the browser, with the sheet on screen. `SaveAsMenu` takes an
`onOpenChange` callback for exactly that reason, so a page that normally keeps the printed
sheet out of the way can put it up while the menu is open.

**When it fails.** One line, in red, under the button: *"That file couldn't be made. Try
another kind, or the PDF."* File names are cleaned by `tidyFileName()` — `\ / : * ? " < > |`
are not legal in a file name on Windows or a Mac — and cut to 80 characters.

- **Free, gated or not built.** Free, and free of everything. Every one of the seven is made
  **on the device**: nothing is uploaded, no route is called, no model, no paid service, no
  switch. It is behind sign-in only because the pages it sits on are.

---


---

## Quotes to a customer

Everything below was read out of the code on 2026-09-28, in `/Users/nasko/INVOICE/web/`. Four pages: `/quotes`, `/quotes/new`, `/quotes/<id>`, and the customer's own page `/q/<token>`. The "From suppliers" tab next to the quotes list (`/quotes/requests`) is a different thing — asking several suppliers to price a list — and is covered elsewhere.

**Shape of the whole area in one paragraph.** A quote is a priced offer. It starts as a **draft** and can be edited freely. The moment it leaves draft — sent, or marked accepted/declined straight off — it is **frozen**: lines, dates, notes and the deposit can never be changed again, and the VAT setting it was priced under is stamped onto it for good. Sending it makes a private link the customer opens and taps **Accept quote** or **Decline** on. Once accepted, **Turn into invoice** copies the lines into a draft invoice. If a deposit was set, that goes out as its own invoice first and comes off the final one.

**Quotes can never be deleted.** Not by a button, not at all: `migration-020-quotes.sql` revokes DELETE on the table from `authenticated`. There is no delete control anywhere in the area, and nothing to decide about it.

---

### Quotes — `/quotes`

- **What it is for.** The list of every quote given to a customer, with what each one is worth, whether it has been answered, and a nudge for the ones that have gone quiet.
- **How you get there.** Header → **Money in** → **Quotes** (a phone shows one **Menu** button holding the same list). Also from the dashboard's fourth-row link **Make a quote**, and by saving a quote after making one.
- **What is on it** (`src/app/quotes/page.tsx`), in screen order:
  1. Heading **"Quotes"**, under it **"Price a job before you start. Once it's accepted, turn it into an invoice in one tap."**, and the **+ Add** button on the right (`AddAnything` — Scan it, Upload a photo or PDF, Add a receipt by hand, Write an invoice, Make a quote).
  2. Two tabs: **My quotes** | **From suppliers** (`src/components/quoteRequest/QuotesTabs.tsx`).
  3. A first-few-times note (`Tip id="quotes-intro"`): *"Tip: send the quote from its page. When the customer says yes, tap **Accepted**, then **Turn into invoice**: the lines are copied, nothing to type twice."*
  4. **"Waiting on an answer"** card — *"Sent a while ago and still open. A nudge often decides it."* One row per quote that is **sent**, was dated **5 or more days ago** (`QUIET_DAYS = 5`) and has not passed its valid-until date: *"Q-0004 · Jane Customer"*, then *"£1,200.00 · sent 8 days ago · holds until 12 Oct 2026"*, then the message-writer (see below). With no customer on the quote: *"Pick who it's for on the quote to message them."*
  5. The list itself. Each row: **number · customer name** (or "No customer"), a status badge, the date; on the right the total, a grey **"£300.00 deposit"** line when there is one, and **"until 12 Oct 2026"** while the quote is still open. Empty: *"No quotes yet. Make one to price a job before you start."* A failed load says so instead, and the empty line is suppressed, so "No quotes yet" can never stand in for a broken connection.
- **The statuses**, all six (`src/lib/quoteStatus.ts`): **Draft** (grey), **Sent** (blue), **Accepted** (green), **Declined** (red), **Invoiced** (grey), **Expired** (amber). Expired is not a real status — it is what a **sent** quote is shown as once its valid-until date has passed, and such a quote can still be marked accepted by hand. Only the customer's own online Accept is blocked after that date.
- **The message-writer** on the quiet rows (`src/components/TextCustomer.tsx`): two chips, **"Any thoughts on the quote?"** and **"Here's your quote"**, a **Message** box already written (*"Hi Jane, just checking you got the quote for £1,200.00 (it holds until 12 Oct 2026) — any thoughts, or anything you'd like changed?"*), a button **"Add the link to view and accept it"**, the customer's mobile if one isn't saved, then **Text message** and **WhatsApp**. It opens the phone's own apps — nothing is sent from the app.
- **What it does behind the scenes.** One read of `quotesStore.all()`, `clientsStore.all()` and the business profile (`src/lib/storage.ts`). Sorted newest date first, then number descending. Each quote is totalled under **its own** VAT stamp (`q.vatRegistered ?? profile.vatRegistered ?? false`), so a quote sent before VAT registration keeps its old price on the list.
- **Where it takes you next.** `/quotes/<id>` (any row, any quiet row's title), `/quotes/requests` (the other tab), `/quotes/new`, `/scan`, `/receipts/new`, `/invoices/new` (the + Add sheet).
- **Free, gated or not built.** Behind sign-in. Free. No model call, no paid API, nothing switched off.

---

### New quote — `/quotes/new`

- **What it is for.** Writing the quote: who it is for, the lines, how long it holds, and whether a deposit is wanted.
- **How you get there.** **+ Add → Make a quote** from anywhere that shows the button, the dashboard tile **Write a quote**, the dashboard link **Make a quote**, or the free public builder's **Save to my quotes** (which arrives as `/quotes/new?import=1`).
- **What is on it** (`src/app/quotes/new/page.tsx` + `src/components/quote/QuoteForm.tsx`), in screen order:
  1. **"← Quotes"**, heading **"New quote"**, **"What the job will cost. It stays a draft until you send it."**
  2. When it came from the free page: *"Brought over from the Free page: check the details, then save it."*
  3. **Who it's for** (`CustomerPicker`). With nobody saved yet it opens straight on the new-customer form. Otherwise a list in two groups, **Customers** then **Suppliers** (a quote may go to a supplier), each row showing the name, the contact or email or first address line, and **Company** / **Private** on the right. A search box appears above the list once there are **7 or more** contacts. **+ New customer** adds one on the spot; once picked, the card shows the name, *"Company · VAT GB123456789"* or *"Private customer"* (plus *"· one of your suppliers"*), the contact line, and a **Change** button.
  4. Straight under the picked customer, one grey line: **"Check Acme Kitchens Ltd on the Companies House register — free, before you send your prices."** It opens that exact company when the contact was picked off the register, otherwise the search. This line is here on purpose (Atanas, 2026-09-23: *"so people can check companies before they send the quotation"*).
  5. **Quote number** (filled in as **Q-0001**, **Q-0002**…), **Date** (today), **Valid until** (date + 30 days).
  6. The lines: **Description** ("What the work or item is"), **Qty**, **Unit price** ("Price £"), and a **VAT** dropdown only when the account is VAT registered. **✕** removes a line (disabled on the last one). **Add line** under them. Under any line with words in it, **"Find it cheaper"** — see the cost note below.
  7. **Deposit to book the work (optional)**: a dropdown — **No deposit** / **% of the total** / **Fixed amount (£)** — and a number box beside it (starts at **25** for a percentage, **0** for an amount). Under it, live: *"£300.00 incl. VAT, invoiced on its own once the quote is accepted."*
  8. **Notes (printed on the quote)** — placeholder *"What's included, what isn't, start date…"*
  9. Right-aligned totals: *"Subtotal £1,000.00 · VAT £200.00"* and **"Total £1,200.00"**.
  10. **Save quote**, **Cancel**, and **Clear** on the right.
- **What it refuses, in its own words.** "Finish adding the new customer (Add customer), or cancel it, first." / "Pick who the quote is for." / "Give the quote a number." / "Add at least one line." / "A deposit percentage is between 0 and 100." / "The deposit has to be more than £0 and no more than the total." A number already used: *"Quote number "Q-0004" is already in use."*
- **What it does behind the scenes.** `quotesStore.add` inserts one row in `quotes` with `status: 'draft'`, the deposit written to **either** `deposit_percent` **or** `deposit_amount` (a database check refuses both at once, and refuses a percentage that is not between 0 and 100). The number is unique per account (`unique (user_id, number)`). Then it goes to the quote's own page.
- **Numbering is not reserved the way invoice numbers are.** `nextQuoteNumber` (`src/lib/storage.ts`) simply offers one past the highest number **matching `Q-0000` exactly**; anything typed by hand ("JOB-12") is invisible to the sequence, and two tabs open at once will both be offered the same number — the second gets the "already in use" message rather than a wrong number. There is no `assign_quote_number` function and nothing burns a number.
- **Where it takes you next.** `/quotes/<id>` on save, `/quotes` on Cancel, `/check-company` from the register line.
- **Free, gated or not built.** Behind sign-in. Free **except one button**: **"Find it cheaper"** on a line is a Gemini call on Atanas's own key every press (`POST /api/price-guide` → `src/lib/priceGuide.ts`, signed in, **120 an hour per account**, 60-second limit). Without `GEMINI_API_KEY` it answers *"Price guides aren't configured on this deployment."* Nothing shows a counter or a price, and there is no daily cap. The Companies House name lookup in the new-customer form needs `COMPANIES_HOUSE_API_KEY` (free API, set in production, **not in `web/.env.local` on this Mac** — locally those are plain boxes). The VAT-number box only does its own check-digit test: the HMRC lookup behind it needs `HMRC_CLIENT_ID`/`HMRC_CLIENT_SECRET`, which are **not set in production** (sandbox only, locally).

---

### Quote &lt;number&gt; — `/quotes/<id>`

The busiest page in the area: the quote, its status buttons, every way of sending it, the online link, and the deposit machinery.

- **What it is for.** Everything after the quote exists — send it, record the answer, raise the deposit invoice, raise the final invoice.
- **How you get there.** Any row on `/quotes`, saving a new quote, the push notification when a customer opens or answers one (which links straight here), and from an invoice made from it.
- **What is on it** (`src/app/quotes/<id>/page.tsx`, 599 lines), in screen order:
  1. **"← Quotes"**, **"Quote Q-0004"** with its status badge, **"Dated 12 September 2026"**. On the right: **Edit** (drafts only) and **Print** — and note **Print only appears once the quote is past sending**, i.e. declined or invoiced. While it is draft/sent/accepted, printing lives in the Send card's PDF tab instead.
  2. A first-few-times note: *"How it works: send it, and the customer gets a link they can accept or decline. Once accepted, "Turn into invoice" copies the lines across — a deposit goes out as its own invoice first, and comes off the final one."*
  3. **The "For" card**: the customer's name, *"Company · VAT …"* / *"Private customer"*, the contact line, then three figures — **Total** (labelled *"Total incl. VAT"* when registered), **Deposit** (the amount and *(25%)*, or **"None"**), **Valid until** (or **"No end date"**).
  4. **The status card.** If the customer answered online, a line first: *"Accepted online by Jane Smith, 14 Sept 2026, 09:12."* Then one sentence for the state:
     - draft — *"Not sent yet. Send it below, or mark it sent if you gave it to them another way."*
     - sent — *"Waiting on the customer. When they say yes, mark it accepted."*
     - accepted, deposit still to raise — *"Accepted. Invoice the £300.00 deposit to book the work, or turn the whole quote into an invoice."*
     - accepted, deposit already invoiced — *"Accepted, deposit invoiced. Invoice the balance when the work is done."*
     - accepted, no deposit — *"Accepted. Turn it into an invoice when you're ready to bill."*
     - declined — *"Declined. Reopen it if they change their mind."*, or with an unpaid deposit invoice *"Declined. The deposit invoice INV-1001 is still open and will keep being chased: credit it on its page if it won't be paid."*
     - invoiced — *"Turned into an invoice."* + **Open the invoice**.
  5. **The buttons**, which depend entirely on the status:
     - **draft**: Mark as sent · Accepted · Declined · Turn into invoice (Edit is in the header)
     - **sent**: **Accepted** (black) · Declined · Turn into invoice
     - **accepted**: **Invoice the deposit** (black, only while a deposit is set and unraised) · **Turn into invoice** / **Invoice the balance** · Not accepted after all
     - **declined**: Reopen
     - **invoiced with no invoice found**: *"This quote was being turned into an invoice, but no invoice from it can be found."* + **Put it back to accepted**
  6. **The amber VAT warning**, when the quote's stamp and today's setting disagree: *"This quote was sent while you were not VAT registered. An invoice raised from it now is issued under today's setting, so it will add VAT to the quoted figures — check the draft before sending it."*
  7. **The Send card** (only while draft, sent or accepted — `src/components/quote/QuoteSendCard.tsx`). Heading **Send**, under it *"£1,200.00 · Q-0004, valid until 12 October 2026"*, then four tabs: **Email | Text | WhatsApp | PDF**. It opens on Text when the customer has a mobile but no email.
     - **Email**: *"Send to"*, a message box, a copy-to-yourself tick, and the note that the quote *"goes as a PDF."* The PDF is made in the browser and the private link is put in the email.
     - **Text / WhatsApp**: the same message-writer as the list, with **"Add the link to view and accept it"**, ending in **Open in Messages** or **Open in WhatsApp**.
     - **PDF**: *"The quote as a PDF, to send from any app, keep or print."* → **Share (WhatsApp, Messages…)**, **Download PDF**, **Save as**, **Print**. **Save as** gives all seven shapes: PDF, Picture (.png), Smaller picture (.jpg), Word (.doc), Web page (.html), Plain text (.txt), Spreadsheet (.csv).
  8. **"View and accept online"**, inside the Send card (or on its own once the quote is past sending, if a link was ever made). Before there is a link: *"A private link where your customer can see the quote and accept or decline it. You'll see when they open it and get a notification when they answer. Emails include it, and a text or WhatsApp can."* + **Make and copy the link**. After: *"Not opened yet."* or *"Opened 3 times: first 13 Sept 2026, 18:04, last 14 Sept 2026, 09:11."*, the link in a read-only box, **Copy link**, **Open** (which appends `#o`, the owner's own copy), and **Stop this link and make a new one**.
  9. The quote sheet itself at the bottom (`src/components/quote/QuoteDocument.tsx`) — the business name, logo and address, VAT number, **Quote &lt;number&gt;**, date, valid-until, the **For** block, the line table, subtotal and VAT per rate, the big **Total:** box with *"Deposit to book the work: £300.00 (25%)"* and *"This quote is valid until 12 October 2026."* under it, then the notes. This is exactly what the PDF, the print-out and the customer's page show.
- **What it does behind the scenes.**
  - **Sending is what freezes a quote.** `quotesStore.setStatus` / `markSent` stamp `quotes.vat_registered` from the account's current setting the moment the quote leaves draft (migration-033), and a failed read of that setting **fails the send** rather than guessing. `updateDraft` is keyed on `.eq("status","draft")`, so an edit that arrives late is refused: *"This quote isn't a draft any more, so it can't be changed. Reload to see it."*
  - **Every status change carries the status the page was showing** (`setStatus(id, status, from)`), so an answer the customer gave online in the meantime is never overwritten unseen — it says *"This quote has changed since the page loaded (the customer may have answered online). Reload to see it."*
  - **Sharing the link sends the quote.** Copying it, or adding it to a text, marks a draft **sent** first, after a confirm: *"Sharing the link sends the quote: it's marked as sent and can't be edited after. Carry on?"* Emailing does it the other way round — only after the send actually worked — so a failed email does not lock the draft. A draft's link is never put in share-sheet text, because the customer's page shows a draft nothing at all.
  - **Turning into an invoice claims the quote first** (status → `invoiced`, `invoice_id` still null), so a second tap or a second tab cannot make two invoices; the invoice is then built from the **claimed row**, not from what a possibly stale page shows, and linked. If the insert seems to have failed it looks for an invoice tagged `from Q-0004` before releasing the claim, because a lost reply can hide an invoice that was actually made. The new invoice is a **draft**: the quote's lines, the quote's notes, a due date of today plus the customer's own payment terms (or 30 days), and the tag `from Q-0004`. The page then goes to `/invoices/<id>`.
  - **A lost link repairs itself**: an invoiced quote with no `invoice_id` re-finds its invoice by that tag on the next page load and relinks it.
  - **Coming back to the tab re-reads the quote** (focus and visibility change), so an old copy cannot be sent or invoiced from a phone left open.
  - Files: `src/lib/storage.ts` (`quotesStore`, `quoteLinksStore`), `src/lib/quoteDeposit.ts`, `src/lib/quoteStatus.ts`, `src/components/quote/*`, `src/components/SendInvoicePanel.tsx` (the email form and share buttons are shared with invoices), migrations 020, 022, 026, 033, 034, 035, 041.
- **Where it takes you next.** `/quotes`, `/invoices/<id>` (the final invoice, the deposit invoice), `/q/<token>` (via **Open**), the phone's Messages/WhatsApp, `/login?next=/quotes/<id>` if the session has gone.
- **Free, gated or not built.** Behind sign-in. Free to use. Two things cost money when used: **emailing** the quote (`POST /api/send-invoice` — signed in, Resend, **30 an hour and 100 a day per account**, 60 an hour across everyone, PDF capped at 4 MB of base64; `RESEND_API_KEY` is set in production, **not on this Mac**), and **"Find it cheaper"** while editing a draft. Push notifications for "opened" and "answered" need the VAPID keys, which are set in production. Nothing in this area is behind an off switch — it is all live.

---

### What the customer sees — `/q/<43-character token>`

- **What it is for.** The one page a customer ever sees: the quote, a PDF to keep, and **Accept quote** / **Decline**.
- **How you get there.** Only the link — emailed, texted, WhatsApp'd, or pasted. `/q/` is one of three customer-link prefixes on the public list in `src/app/AppShell.tsx`, so **no account is needed**. The owner's own copy is the same address with `#o` on the end.
- **What is on it** (`src/app/q/[token]/page.tsx` → `src/components/quote/PublicQuoteView.tsx`), in screen order:
  1. **One card at the top**, which is the whole point of the page, and is a single announced region so a screen reader hears each outcome:
     - not answered yet: *"Sanchez Plastering Ltd sent you this quote for £1,200.00, valid until 12 October 2026."* then **Accept quote** (black) and **Decline**.
     - after tapping either: *"Accept quote Q-0004 for £1,200.00?"* or *"Decline quote Q-0004?"*, a **Your name** box (*"e.g. Jane Smith"*, 120 characters), then **Yes, accept the quote** / **Yes, decline it** and **Back**.
     - answered: *"You accepted this quote on 14 September 2026. Sanchez Plastering Ltd has been told and will be in touch."* or *"You declined this quote. … has been told."*
     - already settled by the owner: *"This quote has been accepted."* / *"This quote was declined."*
     - past its date: *"This quote was valid until 12 October 2026. Please contact Sanchez Plastering Ltd for an up-to-date one."* — and no buttons.
     - the owner's `#o` copy: *"This is your copy of the link. Your customer sees Accept and Decline buttons here."*
  2. **Download PDF**, **Save as** (the same seven shapes), **Print**.
  3. The quote sheet, identical to the owner's.
  4. *"Sent with Invoiceover"* in small grey type.
- **A link that no longer works** shows its own page (`not-found.tsx`): **"This link isn't working"** / *"It may have been replaced by a newer one, or the sender may have stopped it."* / *"Ask whoever sent you the quote to send the link again. Nothing has gone wrong at your end."* It says nothing about whether the link ever existed, so guessing tokens teaches nothing.
- **What it does behind the scenes.**
  - **The read** (`src/lib/publicQuote.ts`) uses the service role on the server, and **every single query is scoped to the link's owner**. A token must be exactly 43 characters of `A-Za-z0-9_-`. A **draft** quote returns nothing, so the page 404s. Ids are blanked before anything reaches the customer's browser, and only the fields the PDF shows are read.
  - **The price is the quote's own stamp, never today's setting** — *"a customer holding a link must never see the total change under them, least of all on the button they tap to accept."*
  - **noindex and no-referrer** on every `/q/` page, found or not (`src/app/q/layout.tsx`).
  - **Opens are counted** by the page's own script (`POST /api/quote-links/seen` → `record_quote_link_view`, service role only), never for `#o` and never from a browser that has a Supabase session in localStorage. Limits: 30 per address per half hour, and one per token-and-address per half hour. The **first** open pushes the owner: *"Quote opened — Jane Customer opened quote Q-0004."*
  - **The answer** goes to `POST /api/quote-links/respond` → `respond_to_quote_link` (service role only, 10 tries an hour per address). The typed name is stripped to printable characters on one line, 120 max. The database function changes the quote **only** while it is `status = 'sent'` and `valid_until` is null or **on or after the London date** (`public.uk_today()`, migration-041 — before that, Postgres's UTC date meant a quote could be accepted for an hour after the customer's own page had already said it had expired). Anything else answers: *"This quote can't be answered any more: it may have been answered already, withdrawn or expired. Please contact the sender."* A success pushes the owner: *"Quote accepted — Jane Smith accepted quote Q-0004."*
  - **Answering twice is guarded by a ref, not a disabled button** — `disabled` lands a render too late, and the second post used to show the customer a refusal ("contact the sender") right beside the acceptance they had just made.
  - **The owner can let them answer again**: putting an accepted or declined quote back to **sent** (Reopen / Not accepted after all) makes the buttons live again, because an answer only counts while the quote still stands on it.
- **Where it takes you next.** Nowhere. There is no link into the app, no sign-up prompt, no navigation — by design.
- **Free, gated or not built.** **Public, no account, free.** No model call, no paid API. The only costs behind it are the push notification to the owner and the database read.

---

### Deposits, in full

This is the one place in the app where one sum is split into two documents, and it is worth reading whole.

**Setting one.** The deposit is part of the quote, set in the quote form, and **only while the quote is a draft** — the Edit button disappears the moment it is sent, and `updateDraft` refuses anything that is not a draft. There is no way to add, change or remove a deposit on a sent quote. Two shapes:

- **% of the total** — must be **more than 0 and less than 100**. Both the form and a database check enforce it, so **100% cannot be set through the app** even though the maths handles it.
- **Fixed amount (£)** — more than £0 and no more than the total, **gross, including VAT**.

Stored as `quotes.deposit_percent` (5,2) or `quotes.deposit_amount` (12,2), never both (migration-022). The figure shown everywhere is `depositGross()` in `src/lib/quoteDeposit.ts`: the quote's gross total, times the percentage if that is the shape, clamped to between £0 and the whole quote, rounded to the penny.

**Raising it.** Once the quote is **accepted**, **Invoice the deposit** appears as the black button. It claims the deposit first (`deposit_claimed = true`, so a double tap or a second tab cannot make two), then creates a **draft invoice**:

- lines from `depositLines()` — see below
- notes: *"Deposit to book the work quoted in Q-0004. The balance will be invoiced when the work is done."*
- due **7 days** from today, payment terms *"7 days"*
- tagged `deposit for Q-0004`
- status **draft** — it still has to be sent like any other invoice, which is when it takes a real invoice number

Then it opens that invoice. If the insert fails it looks for the tag before releasing the claim; if the invoice truly went missing the quote page offers **"Let me invoice the deposit again"** behind a confirm.

**What the deposit invoice charges.** Not VAT registered, or a quote with no rates: **one line**, *"Deposit (25%) for quote Q-0004"*, at the gross figure. VAT registered: **one line per VAT rate present in the quote**, each at that rate's share of the gross (*"Deposit (25%) for quote Q-0004, Standard 20% part"* when there is more than one), priced to **whole pence net**. So the deposit invoice carries VAT in the same proportions as the quote — a quote that is half standard-rate and half zero-rate produces a deposit whose VAT is the right share, not 20% of the lot.

**What comes off the final invoice.** **Invoice the balance** builds the final draft invoice as **the quote's own lines, plus the deposit invoice's lines put back negated** — quantity **-1**, the same unit price, the same VAT rate, the same labour/materials marking, described as *"Less deposit (invoice INV-1001)"*. It takes off **exactly what the deposit invoice charged**, read back off that invoice, not recomputed — so the two documents agree whatever the deposit invoice ended up saying. Three refusals before it will do it:

- deposit claimed but no deposit invoice found → *"The deposit invoice can't be found: it may still be being made, or it was removed. Reload the page to see which."*
- deposit invoice still a draft → *"The deposit invoice is still a draft. Send it first, so the final invoice can take it off."*
- deposit worth more than the whole quote → *"The deposit invoice is for more than the whole quote, so the balance would be negative. Check the deposit invoice."*

**Credit notes against the deposit.** If some of the deposit invoice was credited, the deduction lines **shrink in proportion** and the description becomes *"Less deposit (invoice INV-1001, less its credit)"*. A deposit credited **in full** takes nothing off at all, so the balance invoice is the whole quote again.

**The deposit invoice cannot be deleted once a balance invoice exists.** A trigger (migrations 034 and 035) refuses it — *"The balance invoice for this quote takes this deposit off, so the deposit invoice can't be removed."* — and it also counts a balance invoice that is only findable by its `from Q-0004` tag, because the invoice is created first and linked second. Without that guard, deleting the deposit invoice silently cleared the link and left the "Less deposit" line on the balance invoice: a £1,200 job invoiced as £360 + £840 would have become £840 asked for in total, with the £360 in no invoice, no turnover and no VAT return, while the customer still held the emailed deposit invoice.

**Backing out with a deposit still open** is confirmed, because the deposit invoice outlives the deal and its payment reminders keep going: *"The deposit invoice INV-1001 is still open, and its payment reminders will keep going until it's paid or credited. Carry on? You can add a credit note on the invoice's page."*

**The two pence, and why it is not a bug.** The deposit and the balance can each miss the quote by up to **two pence**. VAT is rounded once per rate on every document, and the deposit invoice and the final invoice are **two documents**, each a real VAT invoice, so each rounds on its own. How little was measured rather than assumed: **a million generated quotes, four seeds, one to four VAT rates, totals up to £98,000 — the worst gap is 2p, and it does not grow with the money or with the number of rates.** That flatness is the actual test (`harness/test-money-invariants.mjs`, `MAX_SPLIT_PENCE = 2`): rounding is bounded, so a real error in the split would scale with the job and a £50,000 quote would be out by pounds. Nothing on screen mentions the two pence to the customer.

---

### Two things worth knowing that do not fit above

- **Scanning is limited; quotes are not affected.** `SCAN_LIMITS` is **on** in production, so reading a document is capped for every account today — 300 a day for an account's first seven days, then 50 a day and 600 a month, with nobody on a paid plan and no paid tier in existence. **Nothing in the quotes area to a customer spends a scan.** Writing, sending, accepting and invoicing a quote read no document. (The neighbouring **From suppliers** tab does scan supplier replies, and those do count.)
- **The help chat's own description of `/jobs` claims quotes are grouped there, and they are not.** `src/lib/helpFacts.ts` says *"Work grouped by job, so a customer's invoices, quotes and costs for one piece of work are together"*, but `src/app/jobs/page.tsx` reads invoices, receipts, credit notes and payments only — `quotesStore` is never called there. So a quote does not appear on the job it belongs to. Worth knowing because the help chat would tell somebody it does. (`NEXT_PUBLIC_HELP_CHAT` is off, so nothing is saying it out loud yet.)

---

### Worth deciding

1. **Should quotes ever be part of a paid tier, and which half?** Writing and sending a quote costs almost nothing to run. What costs money is **emailing** it (Resend) and **"Find it cheaper"** (a Gemini call per press, 120 an hour per account, no daily cap, no counter). If a free tier ever has to be drawn, those two are the only paid moments in the whole area — the quote itself, the private link, the customer's page and the PDF are all free forever. Should "Find it cheaper" get a visible allowance the way scanning has one?
2. **Should a sent quote be editable at all?** Today it is frozen absolutely: a typo in a line, a wrong date, a deposit set at 25% when 20% was meant — none of it can be changed, and there is no "revise this quote" or "make version 2". The only route is a brand new quote with a new number. Is that right, or should there be a **"Send a revised quote"** that copies the lines into a fresh draft and marks the old one superseded?
3. **Should a deposit be allowed to be 100%?** The maths handles it and the database refuses it (percent must be under 100). Paid-in-advance jobs exist. A fixed amount equal to the total is allowed, which is the same thing by another door — so the rule is inconsistent rather than principled.
4. **Should the customer be able to pay from their own quote page?** There is a comment in the code marking the exact spot for it: *"Payment options (taking the deposit or the total from the customer's link) belong beside sending, once there's a payment provider."* Accepting a quote and paying its deposit in the same tap is the single biggest thing this area does not do. It needs a payment provider, which is a money decision, not a design one.
5. **Should an expired quote still be acceptable by the owner?** A sent quote past its valid-until date shows as **Expired** in amber, and the **customer** is refused online — but the owner can still tap **Accepted** and invoice it. That is probably right (the phone call happened), but it means "Expired" means two different things depending on who is looking.
6. **Does the quiet-quote nudge belong at five days, and should it chase by itself?** "Waiting on an answer" appears after **5 days** and writes the message, but a person still has to tap Messages or WhatsApp. Invoices have an automatic reminder cron; quotes have nothing. Should a quote chase itself the way an invoice does?
7. **Should quote numbers be reserved like invoice numbers?** They are not: `Q-0001` is only a suggestion, two tabs get offered the same one, and a hand-typed number is invisible to the sequence. That is deliberately loose because a quote number is not an accounting record — worth confirming it should stay loose.
8. **Should a quote show on the job it belongs to?** See the mismatch above. `/jobs` groups invoices, receipts and payments; quotes are left out entirely, which is arguably the wrong half of the story for a job that has not been invoiced yet.


---

## Asking suppliers to price a list — and the two newer pages

Two different things live here, and they are only in one file because they are the last
corners of the app nothing else covers.

The first is **Quotes from suppliers**: he writes a list of what he needs, sends it to up
to ten suppliers at once, each gets their own private web page to type prices into, and the
answers come back side by side with the cheapest way to buy the lot worked out — including
splitting the order between two suppliers when that genuinely wins. This is the mirror
image of `quotes.md`: there he prices a job **for** a customer, here he asks suppliers to
price a list **for** him. Same tab bar, opposite direction.

The second is **Jobs** and **Money** — two newer pages that group things he has already
got, rather than adding anything new.

---

### Quotes: From suppliers — `/quotes/requests`

- **What it is for.** Every list he has ever sent out to be priced, and where each
  supplier's answer stands. Header line: *"Ask suppliers to price a list, then compare their
  prices line by line."*
- **How you get there.** Header → **Money in ▾ → Quotes**, then the **From suppliers** tab.
  The page's `h1` is just **"Quotes"** — the two tabs (**My quotes** / **From suppliers**,
  `QuotesTabs.tsx`) are the only thing that tells you which half you are on, and both halves
  share the same heading. There is no header link straight to it.
- **What is on it**, in screen order:
  1. **"Quotes"**, a tip the first few times (`tip:quote-requests-how`): *"How it works:
     list what you need, send it to a few suppliers, and each gets their own private link to
     fill in. Their prices come back here side by side, with the cheapest way to buy the lot
     worked out for you."* Then the sub-line.
  2. Top right, **New request** (the dark primary button).
  3. The **My quotes / From suppliers** tabs.
  4. **The rows**, one card per request: the name of the request, an **Open** or **Closed**
     badge, then `4 items · asked 12 Sep · needed by 30 Sep`. Under a divider, one line per
     supplier asked: their name, their total ex VAT if they have replied, and a status badge.
     A supplier who has priced only some of the list shows the total with `(3/4)` after it in
     grey — so a cheap-looking total that is only cheap because half of it is missing says so
     on the row.
  5. **Empty state:** *"No requests yet. Make one to email your suppliers a list to price."*
- **What it does behind the scenes.** Three parallel reads on arrival — the requests, every
  supplier row, and his contacts (`src/lib/quoteRequests.ts`, `src/lib/storage.ts`) — and
  every total on the page is worked out in the browser by `supplierTotal()` in
  `src/lib/quoteCompare.ts`. The supplier's name is looked up from the contacts list and
  falls back to the word **"Supplier"** if the contact has gone.
- **Where it takes you next.** `/quotes/requests/new`, `/quotes/requests/<id>`, `/quotes`.
- **Free, gated or not built.** Behind sign-in. Free to look at — no model call, no paid API,
  no switch.

---

### New quote request — `/quotes/requests/new`

- **What it is for.** Writing the list and choosing who to ask. Sub-line: *"List what you
  need; each supplier gets their own email with a link to price it."*
- **How you get there.** **New request** on `/quotes/requests`. Nothing else links to it.
- **What is on it**, in screen order (`components/quoteRequest/RequestForm.tsx`):
  1. **← Quotes from suppliers**, the heading, the sub-line.
  2. **What it's for** — a name for the whole request, placeholder *"e.g. Kitchen extension,
     12 High St"*, 200 characters.
  3. **Items to price** — one block per line: the description (*"What you need, e.g. 4x2 C24
     treated 3.6m"*), a ✕, then **Qty**, **Unit** (*"Unit, e.g. lengths, bags, m²"*) and a
     third optional box, **Note**: *"Note (optional): brand, size, or equivalent"*. Then
     **Add item**. The ✕ is disabled on the last remaining line, so the list can never be
     emptied.
  4. **Needed by (optional)** — a date.
  5. **Deliver to (optional)** — the app's standard address block (`AddressFields`), which
     means the postcode lookup works here like everywhere else (see `settings.md`).
  6. **Notes for the suppliers (optional)** — *"Access, delivery times, anything they should
     know"*, 4,000 characters. This text is shown to every supplier on their own page.
  7. **Ask these suppliers (up to 10)** — a tick box per supplier, showing the name and
     under it their email, or, where there is none, *"No email saved: you can type their
     prices in when they reply"*. Ticking stops at ten. With no suppliers saved at all:
     *"No suppliers yet. **Add a supplier** first, with their email."*
  8. **Save request** / **Cancel**.
- **What it checks before saving.** Five refusals, each in plain words: a missing name
  (*"Give the request a name, e.g. the job it's for."*), no items, any quantity not above
  zero (*"Every item needs a quantity above 0."*), a needed-by date in the past (*"The
  needed-by date is in the past: suppliers couldn't answer."*), and no supplier ticked
  (*"Pick at least one supplier to ask."*). Blank lines are dropped silently rather than
  refused.
- **What it does behind the scenes.** Two writes, not one: the request row first, then the
  supplier rows. If the second fails the page still goes to the request, with
  `?suppliers=failed` in the address, and the request page says so and offers to add them
  there — so a half-made request is never silently left looking complete.
- **Where it takes you next.** `/quotes/requests/<id>` (always, after saving),
  `/quotes/requests`, `/clients/new?kind=supplier`.
- **Free, gated or not built.** Behind sign-in. Free. **Ten suppliers is a hard ceiling and
  it is not arbitrary**: the comparison tries every combination of suppliers when it looks
  for a split, so the cost of that search doubles with each one added (`MAX_SUPPLIERS = 10`,
  and the comment in the code says exactly that).

---

### The request itself — `/quotes/requests/<id>`

The working page of the whole area: the list as sent, every supplier's standing, the
comparison, and the order to place.

- **What it is for.** Chasing the answers and deciding who gets the order.
- **How you get there.** Any row on `/quotes/requests`, or saving a new request.
- **What is on it**, in screen order (`src/app/quotes/requests/[id]/page.tsx`, 444 lines):
  1. **← Quotes from suppliers**, the request's own title as the `h1`, an **Open**/**Closed**
     badge, and `4 items · asked 12 Sep · needed by 30 Sep`. **Edit** appears top right, but
     only while **every** supplier row is still unsent and waiting — one email out and the
     list is frozen for good (`editable`).
  2. **What you asked for** — the list, each line with its note under it and the quantity on
     the right, then **Needed by**, **Deliver to** and **Notes** underneath.
  3. **Suppliers** — one bordered block per supplier. Name, their email or *"No email
     saved"*, a badge (**Not sent** / **Waiting** / **Replied** / **Can't quote**) and, once
     they have replied, their total ex VAT with *"3 of 4 lines"* under it when they have not
     priced everything. Then one plain-English line of where it stands:
     - *"Not sent yet."*
     - *"Sent 2 days ago. Waiting for their prices."*
     - *"Priced online by Dave Hughes, yesterday."*
     - *"Read from their quote, 3 days ago."* / *"Typed in by you, 3 days ago."*
     - *"Said they can't quote (yesterday): no stock until November."* or *"Marked by you as
       can't quote (…)"*
  4. **The buttons on each supplier**, while the request is open: **Email request** (or
     **Send again** once it has gone), **Copy link**, **Enter prices** / **Change prices**,
     **Can't quote**. Under them in small type: **Their quote document** (when one was
     scanned), **See their page** (their own link with `#o`, so he sees what they see
     without counting as them), **Stop this link**, and — once they have answered — **Ask
     them again**.
  5. **Add a supplier…** — a dropdown of every saved supplier not already on the request,
     with an **Add** button, while the request is open and under ten suppliers. With none
     left: **Add a new supplier**.
  6. **The comparison** (`components/quoteRequest/Compare.tsx`) — see below.
  7. **The order lists** (`components/quoteRequest/OrderLists.tsx`), once anybody has replied.
  8. **Close request** / **Reopen request** at the bottom.
- **The three confirmations, in their own words.** *"Mark Jewson as can't quote? Their link
  stops taking prices."* · *"Stop Jewson's link? It stops working at once; send or copy the
  new one."* · *"Ask Jewson again? Their link opens for new prices; this answer is kept in
  the request's history."* · *"Close this request? Suppliers' links stop taking prices. You
  can reopen it."*
- **What it does behind the scenes.**
  - **Copying a link counts as sending it.** `copyLink` calls `markSent` first (only where
    `sent_at` is still null), so a link texted to a supplier freezes the list exactly as an
    email would.
  - **Coming back to the tab re-reads the answers** — suppliers reply while the phone is in
    a pocket. But **not while a prices form is open**, and the comment says why at length: the
    form's draft is frozen when it opens while the row it checks against is read fresh, so a
    refresh under an open form would quietly adopt a supplier's newly arrived answer as "the
    one he has seen", and saving would overwrite their prices with his without the clash ever
    showing. The answer is picked up the moment he closes the form.
  - **Every save carries the answer time the page showed** (`record_quote_request_response`
    takes `p_seen_responded_at`), so typing prices over an answer that changed in the
    meantime is refused rather than silently winning. The answer it replaces is kept in
    `previous`.
  - **The owner cannot write the answer columns directly** — migration-028 revokes it. Typed
    or scanned prices go through `record_quote_request_response`; the supplier's own through
    `submit_quote_request_response`.
  - Files: `src/lib/quoteRequests.ts` (both stores, `offerOf`, `uploadQuoteDocument`),
    `src/lib/quoteCompare.ts` (every figure), migration-028 and migration-032.
- **Where it takes you next.** `/quotes/requests`, `/clients?tab=supplier`,
  `/clients/new?kind=supplier`, `/r/<token>#o` in a new tab, and a signed URL to the
  supplier's own document (one hour).
- **Free, gated or not built.** Behind sign-in. Free to use, with two costs: **emailing a
  supplier the request** goes through Resend (`POST /api/quote-requests/send`), and
  **scanning a supplier's quote** to read their prices is a model call on Atanas's key and
  now **counts against the scan limits** — see the note at the end.

---

### Typing in or scanning a supplier's answer — the **Enter prices** screen

Not a route of its own: it replaces the request page in place
(`components/quoteRequest/AnswerEntry.tsx`).

- **What it is for.** Most suppliers will not use the link. They ring up, or email a PDF, or
  send a photo of a scribbled sheet. This is where that becomes an answer the comparison can
  use.
- **What is on it.** A price box per line with **Can't supply** beside it and a note, a
  **Delivery** box, a **Prices include VAT** tick, a **Valid until** date, and a note for the
  whole answer — the same `PriceForm` the supplier sees on their own page, so the two paths
  cannot drift. Plus the way in from their own document: a photo or a PDF, read by the
  scanner, with every matched line shown for him to confirm or change.
- **How the matching works.** `matchScannedLines` in `src/lib/quoteCompare.ts` scores each
  requested line against each line read off their quote by the words they share, with
  **sizes and codes counted half again** — *"100mm" and "3.6m" say more than a word like
  "timber"*. Best scores are paired off first, each scanned line used at most once, and
  anything under 0.2 is left unmatched. Delivery lines are spotted by their own words
  (`isDeliveryLine`: delivery, carriage, haulage, transport, shipping, postage, courier) and
  go to the delivery box, not to a line. Where a unit price was not printed,
  `scannedUnitPrice` shares the line total over the quantity. **He confirms or changes every
  match before anything is saved** — the code says so in its own comment.
- **Free, gated or not built.** Behind sign-in. Typing prices in is free. Reading their
  document costs a model call and counts against the scan limits.

---

### What the supplier gets — `/r/<43-character token>`

- **What it is for.** The one page a supplier ever sees: the list, and a form to price it
  **once**.
- **How you get there.** Only the link — emailed by the app, or copied and texted. `/r/` is
  one of the three customer-link prefixes on the public list in `src/app/AppShell.tsx`, so
  **no account is needed and nothing is asked of them**. No sign-up, no app, no password.
  Atanas's own copy is the same address with `#o` on the end.
- **What is on it** (`src/app/r/[token]/page.tsx` → `components/quoteRequest/PublicRequestView.tsx`):
  1. A small **QUOTE REQUEST** label, the request's title, and *"Sanchez Plastering Ltd
     would like your prices, Jewson."*
  2. **Needed by** and **Deliver to** where they were filled in, then the notes for the
     suppliers.
  3. **Your prices** — one row per line showing the description, the quantity and the note,
     a price box, a **Can't supply** tick, and a note of their own; then **Delivery**,
     **Prices include VAT**, **Valid until**, a note for the whole quote, and **Your name
     (optional)**.
  4. **Send prices** (black) and **We can't quote for this**.
  5. *"Prices can be sent once. To change them afterwards, contact Sanchez Plastering Ltd."*
  6. *"Sent with Invoiceover"* in small grey type. There is no link into the app.
- **Once they have sent it**, the whole form is replaced by *"Thank you: your prices have
  gone to Sanchez Plastering Ltd."*, their own answer written back out line by line in
  **their own VAT terms** — priced lines, "Can't supply", "No price", delivery, the total —
  and *"To change anything, contact …"*. Coming back to the link later says *"You sent these
  prices on 14 September 2026."* with the same summary.
- **Every other state has its own sentence**, and none of them is an error:
  - already answered, but not from this browser: *"Sanchez Plastering Ltd already has your
    prices for this. Contact them if anything has changed."*
  - closed by the owner: *"This request is closed: … isn't taking prices for it any more."*
  - past the needed-by date: *"This was needed by 30 September 2026, so the request has
    closed. Contact … if you'd still like to quote."*
  - the owner's own `#o` copy: *"This is your copy of the link. The supplier sees a form here
    to price each line."*
  - a link that has been stopped or never existed: its own page — **"This link isn't
    working"** / *"It may have been replaced by a newer one, or the sender may have stopped
    it."* / *"Ask whoever asked you for prices to send the link again. Nothing has gone wrong
    at your end."* It says nothing about whether the link ever existed, so guessing tokens
    teaches nothing.
- **Declining** asks first — *"Tell Sanchez Plastering Ltd you can't quote for this?"* — with
  an optional **Reason** box, then **Yes, we can't quote**.
- **What it refuses, in its own words.** *"Nothing is priced. If you can't supply any of it,
  tap "We can't quote for this"."*
- **What it does behind the scenes.**
  - **The read** (`src/lib/publicQuoteRequest.ts`) is done on the server with the service
    role. The page is `force-dynamic`, **noindex and no-referrer** on every `/r/` address
    found or not (`src/app/r/layout.tsx`), and it shows nothing about the sender beyond their
    business name.
  - **The answer** posts to `/api/quote-requests/respond` → `submit_quote_request_response`
    (service role only), which takes **one** answer and only while the request is open and
    not past `needed_by`.
  - **Sending twice is guarded by a ref, not a disabled button** — the same trap as the
    quote page, and the comment records what it cost: `disabled` lands a render too late, so
    two taps in one tick both post, the database refuses the second, and the page showed that
    refusal to the supplier right beside the prices that had just gone through. A send that
    **failed** is made retryable again; one that worked is not.
  - **The date it judges "expired" by is the London one** (`ukDate`), not UTC.
- **Where it takes you next.** Nowhere at all, by design.
- **Free, gated or not built.** **Completely open — no account, no sign-in, nothing to
  install.** This is the only place in the app where somebody who is not a customer of
  Atanas's does real work, and it costs nothing per use: no model call, no paid API.


---

## Money going out — receipts, bills, expenses, mileage and the repeating ones

Seven screens, all of them about money **leaving** the business: `/receipts` (the list),
`/receipts/new` (one by hand), `/receipts/review` (the emailed ones nobody has checked),
`/expenses` (the year's totals), `/mileage` (trips), `/recurring` (repeating expenses) and
`/recurring/invoices` (repeating sales invoices, which sits in this section only because it
shares the screen's shape).

Everything here lives in **one database table, `receipts`**. His own sales invoices are a
different table and a different section. The camera and the reading of a document are
covered in `scanner-camera.md`; this section starts where a document has already been read
and picks up what the app then does with it.

---

### The three kinds of document, and how the app tells them apart

One table, four values in a column called `document_type`, and the difference between them
decides whether the app chases him for money:

| On screen | Stored as | What it means | Chased? |
|---|---|---|---|
| **Receipt** (grey badge) | `receipt` | Already paid for. A till receipt, a card slip. | No |
| **Supplier invoice** (blue badge) | `invoice` | Somebody is asking to be paid. **This is what the app calls a bill.** | Yes, if unpaid |
| **Credit note** (red badge) | `credit_note` | Money coming back — a refund or a correction. | No |
| **Other document** (grey badge) | `other` | A delivery note, a statement, anything that is not money. | No |

Three things follow from that, and they are the whole logic of the section:

1. **A bill is exactly `document_type = 'invoice'` and `paid = false`.** Nothing else. There
   is no separate bills table and no "bill" flag.
2. **A credit note is stored with a negative amount and negative VAT** — both `amount` and
   `vat_amount` go in as minus numbers. That means every total in the app nets off
   automatically: nothing has to remember to subtract anything. A credit note can also point
   at the bill it refunds (`credit_of_receipt_id`), and then the bill's row shows the reduced
   figure and a grey **Credit note** badge.
3. **`receipts.amount` is always net — the figure without VAT — and always in pounds.** The
   forms all ask for the **total paid including VAT** and work the net out by subtraction,
   because that is the number printed on the paper. A foreign receipt is converted to pounds
   at save time and never stored in its own currency as the live figure.

**How the type is decided.** A scanned document's type is the reader's own answer, confirmed
by him on the scan page before saving. A receipt typed in by hand is **always** a plain
`receipt` — the by-hand form has no type control at all and the store defaults to `receipt`
(`src/lib/storage.ts`). So a bill can only get in by being scanned, emailed in, or created as
a recurring expense; it cannot be typed on `/receipts/new`. Once saved, the type shows on
every card and cannot be changed by editing — **Edit** on a row will let him change the
supplier, date, category, figures, invoice number, due date and Paid tick, but not turn a
receipt into a bill.

---

### Receipts & bills — `/receipts`

- **What it is for.** The whole record of paper that came in: shop receipts, supplier
  invoices waiting to be paid, and credit notes. Header line: *"Receipts, supplier invoices
  (bills) and credit notes you've captured."*
- **How you get there.** Header → **Money out ▾ → Receipts & bills**. Also from the dashboard
  whenever a receipt is tapped (arrives as `/receipts?open=<id>`), from the file library, and
  from the **Needs review** badge on a row.
- **What is on it**, in screen order:
  1. **"Receipts & bills"** with the sub-line, and top right **Download for a spreadsheet**
     (only once there is at least one row) and **Scan receipts** / **+ Add** (the standard
     `ScanOrAdd` sheet, whose by-hand route here is `/receipts/new`).
  2. **A tip** the first few times (`tip:receipts-batch`): *"Tip: **Scan receipts** keeps the
     camera open, so you can photograph a whole pile in one go, then check them and save them
     one after another."*
  3. **The supplier-linking offer** — a grey card, only when there is something to offer:
     *"4 documents match your suppliers · which?"* with a ✕ to dismiss. Three or fewer and
     the list is open already; more and **which?** unfolds it. Each line is a tick box
     reading `Screwfix Direct · INV-8812 → Screwfix`, and the button says **Link 4**. See
     *Linking a document to a supplier* below.
  4. **Filter** (a fold-out, already open when any filter is set): **Payment status** (*All
     statuses*, *To pay*, *Overdue*, *Due in the next 7 days*, *Paid*), **Document type**
     (*All types*, *Receipts*, *Supplier invoices*, *Credit notes*, and *Other documents*
     only if any row is one), **From**, **To**, **Category**, **Supplier**, a **Kept handy
     only** tick box, a **Tag** dropdown if any row is tagged, and **Clear filters**. The
     payment-status filter only ever matches supplier invoices — picking *To pay* hides every
     receipt, because a receipt is already paid. With a payment filter on, the rows re-sort
     **soonest due first** and anything with no due date goes last.
  5. **The rows**, one white card each. A thumbnail (a document icon for a PDF; the words
     **Emailed to you** where the photograph has been aged out — see `file-tools.md`), then
     the supplier name, the amount in bold, then badges: the **type** badge always, a **bill
     status** badge for a supplier invoice, and a blue **Needs review** badge that is a link
     to `/receipts/review`. Under that, `INV-8812 · 14 Sep 2026 · Materials & stock`.
     Then a row of actions: **Details ▾**, **Mark as paid** (only on an unpaid supplier
     invoice that is not waiting on review), **★ Keep handy** / **Kept handy**, **Edit**,
     **Remove**.
  6. **Details** opens: net and VAT (`£1,032.00 excl. VAT · £215.00 VAT`, and where there is
     a credit note the netted figures plus *"£250.00 credited"*), the original currency if
     there was one — `(from EUR 1450.00 @ 0.8600)` — whether a supplier is linked, what name
     was printed on the paper if it differs, *"Credit note for INV-8812"*, a page count if
     the document has more than one page, the notes, every extra field the reader pulled off
     the document (account number, sort code, IBAN, BIC, payment terms, reference, PO number,
     order number, customer reference, supplier address, supplier VAT number, supplier email,
     supplier phone, delivery address — `DOCUMENT_DETAIL_LABELS` in `src/lib/storage.ts`),
     a warranty line if one was entered (*"Warranty: 24 months (until 2028-09-14)"*), the
     tags as grey pills, and the individual items if the receipt was split.
  7. **Empty state:** *"No receipts or bills yet. Scan a few at once, or add one by hand."*
     or *"Nothing matches these filters."* — and neither ever shows when the load failed.
  8. **Arriving at one particular row.** `?open=<id>` scrolls that card into the middle of
     the screen, rings it, opens its details, and fades the ring after four seconds; the
     address tidies back to `/receipts`. There is no page for a single receipt, so the list
     brings the row to him instead. If the row is not there any more he is told —
     *"That receipt isn't here any more. It may have been merged into another one."* — rather
     than landing silently at the top of a long list.
- **The bill status badge, exactly.** `billStatus()` in the page, and it only ever appears on
  a supplier invoice:
  - paid → green **Paid**
  - unpaid, no due date → grey **To pay**
  - unpaid, due date in the past → red **Overdue · was due 12 Sep**
  - unpaid, due **today** → **To pay · due today**; **tomorrow** → *due tomorrow*; otherwise
    *due 18 Sep*
  - and the colour of that last one is **amber when the due date is 3 days away or fewer**,
    grey when it is further off.
- **What it does behind the scenes.** Four reads on arrival — suppliers, receipts, the
  business profile (for the category list) and the page counts — straight from Supabase under
  row-level security. Every figure is worked out in the browser. Editing a row is done
  **inline on the card**, not on another page. **Download for a spreadsheet** writes
  `receipts-<date>.csv` of **the filtered rows only**: date, type, invoice_number, due_date,
  paid, vendor, supplier, category, amount_excl_vat, vat, amount_incl_vat, notes, tags.
  **Remove** asks first and names what goes — *"Remove Screwfix, £1,247.00? It won't be in
  your records any more, and this can't be undone."*
- **Where it takes you next.** `/scan`, `/receipts/new`, `/receipts/review`, and the standard
  add sheet's other routes (`/invoices/new`, `/quotes/new`).
- **Free, gated or not built.** Behind sign-in. **Costs nothing to run** — no model call, no
  paid API, no switch. Only the **Scan receipts** button leads to something that costs money
  and is limited (see `scanner-camera.md`). Editing, filtering, marking paid and the CSV are
  unlimited.

**Linking a document to a supplier.** A scanned receipt keeps the name printed on the paper
in `vendor`; being *linked* to a supplier record is separate, and often the supplier did not
exist yet when the document was scanned. The offer card catches up afterwards, and the
matching is deliberately **stricter than at scan time** (`src/lib/supplierLinks.ts`):
`bulkMatchSupplier` takes an exact name, or every significant word of the supplier's name
appearing as a whole word on the document — so *"Screwfix Direct"* is Screwfix, but
*"Espresso Bar"* is **not** Esso and *"Costain"* is not Costa. A name with no significant
word (*BP*, *B&Q*) must match exactly. Two suppliers fitting equally well (*Travis*,
*Perkins*) is treated as a guess and not offered. The reason for the extra strictness is
written into the file: linking in bulk is one tap over many rows, with nobody reading each
one. Unticking a line, or dismissing the card, remembers that row for ever — in
**localStorage**, per device (`receipts-link-skip`), so the offer comes back on his other
phone. A row where **No supplier** was chosen on purpose (`details.noSupplier`) is never
offered again, and clearing the supplier in the Edit form sets that flag.

---

### New receipt — `/receipts/new`

- **What it is for.** Typing in one receipt by hand, with or without a photograph — for the
  paper he has lost, or a purchase with no paper at all.
- **How you get there.** **+ Add → Add a receipt by hand** from the add sheet anywhere, or
  **+ Add** on `/receipts` itself.
- **What is on it**, in screen order: a big dashed **drop zone** — *"Drop a photo here, or
  click to browse"*, which on a phone opens the camera — then **Supplier** (the type-ahead,
  *"Supplier — type a name, or tap the arrow"*, with **No supplier / general expense** as an
  option and suppliers ordered by how often he uses them), **Date** (today) and **Category**
  side by side, **Shop or supplier** (the name as printed), **Total paid (GBP, incl. VAT)**
  with a **currency** dropdown beside it, **Of which VAT (GBP, optional)**, the exchange-rate
  row when the currency is not GBP, a small live line *"→ £1,032.00 excl. VAT, recorded
  automatically"*, **+ Split into multiple items**, **Notes**, **Warranty length in months**,
  **Tags, comma separated**, then **Save receipt** and **Clear form**.
- **What it does behind the scenes.** The photograph is shrunk in the browser before it is
  stored (`src/lib/imageDownscale.ts`); a HEIC straight off an iPhone cannot be decoded and
  says so — *"Couldn't read that photo. Try a JPEG or PNG."* The **category defaults to the
  one he uses most** (`mostUsedCategory` in `src/lib/categories.ts`). Two refusals stand
  between the form and a save: *"Enter the total paid before saving."*, and the
  exchange-rate check below. Then a **duplicate warning** (`src/lib/duplicates.ts`) — *"This
  looks like it might already be saved — Screwfix, £124.70 on 2026-09-14."* with **Save it
  anyway**; changing the vendor, date or total clears the confirmation so the check runs
  again. It always saves as a **receipt**, never a bill, and `needsReview` is false because
  he was looking at it.
- **Where it takes you next.** `/receipts` on save.
- **Free, gated or not built.** Behind sign-in. Costs nothing — nothing is read by any model
  on this page and nothing is uploaded anywhere but his own database. **Splitting a receipt
  across categories only exists here and in the scan flow**, not in the inline editor on the
  list.

**Splitting one receipt across categories.** **+ Split into multiple items** adds lines of
Item / Qty / Price / category, under the note *"give each its own category to split this
receipt across categories (e.g. Groceries + Household)"*. Worth knowing for the design
conversation: the lines are stored and shown, but **the receipt's own single category is
still what every total on `/expenses` and the tax card counts by**. The per-line categories
are a record, not an allocation.

---


---

## The camera

Written 2026-09-28 by reading `src/components/DocumentCapture.tsx` (2,292 lines),
`src/lib/camera.ts`, `src/lib/platform.ts`, `src/components/CaptureButton.tsx`,
`src/components/scan/BatchReview.tsx` and `src/components/scan/PagesStrip.tsx`. Every number
below is the constant in the file, not a recollection.

**The one thing to hold on to before the detail:** the camera costs nothing to run. No model
call, no paid API, no upload — the page-finder, the crop and the straightening all happen on
the phone. What costs money is the **reading** that happens after the photo, and that is
limited today (see *Free, gated or not built* at the end of the camera screen).

---

### The camera screen — no route of its own

**What it is for.** Point the phone at a receipt or a bill and it finds the paper, waits for
the phone to be still and in focus, takes the photo by itself, cuts out the page and
straightens it. In a run it keeps going for the next document without being reopened.

**How you get there.** It has **no address**. It is a full-screen layer (`DocumentCapture`)
that opens over whichever page asked for it:

| Page | How the camera opens | One shot or a run? |
|---|---|---|
| `/scan` | opens **by itself on arrival**, or "Use the camera" | a run (several documents) |
| `/scan` again | "Add another page", "Retake", "Start a new document", "Scan more" | one shot each |
| `/copy` | "Take photos" | a run (pages of one file) |
| `/invoices/new` | the scan-to-fill button | one shot |
| `/clients/new` | scan a business card | one shot |
| `/free-invoice` | "Start from an old invoice" (`?start=photo`) opens it on arrival | one shot |

Reached from the dashboard's **Scan a receipt or bill** tile, from **+ Add → Scan it**, and
from **Tools → Scan** in the header menu.

**It is not a route, and that has a consequence.** Nothing is pushed onto the browser's
history when the camera opens, so the phone's back gesture or the browser's Back button
leaves the page *underneath* rather than closing the camera — and the "Discard N scans?"
question that guards the Back arrow never runs. The round Back arrow top-left is the only
in-app way out. (Read from the code; not tested on the device.)

#### What is on it, in screen order

**Top strip** (one row, inside the safe area, so nothing sits on top of anything else):

1. **Back** — round black arrow, always there. With scans in the stack it asks
   `Discard N scans?` first, then stops the camera and closes. It replaced a "Cancel" in the
   bottom bar that was easy to miss entirely while stuck on a black screen.
2. **The hint pill** — centre, black, at most two lines. **When there is nothing to say it is
   an invisible 40px strip that is still tappable**, and tapping it toggles the debug readout
   (below). That is deliberate: the readout matters most exactly when nothing is being found.
3. **Torch** — round button, only when the camera reports having one, only while live. White
   with a dark icon when on.

Stacked under that row:

4. **The page-finder line** — `Getting ready — the first time takes a moment. You can take
   the photo yourself now.` while OpenCV downloads, or
   `Edge detection unavailable: <the real error>` when it failed. The error text is never
   softened: it is the thing somebody will screenshot. Capped at 140 characters.
5. **The debug readout** — see below.
6. **Barcode banner** — a white card, `Barcode detected: <value>` and **Dismiss**. **Nothing
   is done with the value**: it is not saved, not put in any form, not read by anything. It
   only appears where `window.BarcodeDetector` exists, which is a Chromium API — so on iPhone
   Safari this banner does not appear at all.

**Over the live picture:**

7. **Four corner brackets** — an A4 portrait frame, centred, 80% of the shorter side wide
   (capped at 90% of the height). **White** when nothing is found, **green** when a page is.
   This is what you line the page up with whether or not the page-finder is working.
8. **The page outline** — the found page traced in green (`#4ADE80`), 3px, filled green at 12%
   opacity when found and **32% when it has locked on**, eased 35% of the way per frame so it
   glides instead of jumping every 150ms.
9. **A green border round the whole screen** whenever a page is found and the camera is live.
   A failure replaces it with a red border and a red banner in the hint's place.
10. **A white flash** for 150ms when the photo is actually taken (after the still comes back,
    not when the decision is made — the hint asks you to keep still until then).
11. **A focus ring** — tap anywhere on the picture: a white circle appears there for 800ms and
    the camera is asked to focus on that point.

**Bottom of the picture area:**

12. **The tip** — shows on its first three appearances then never again; **Got it** ends it for
    good. Counted per device in localStorage.
    - `tip:scanner-auto`: *"Hold the phone over the page and keep still: it zooms in and takes
      the photo by itself."* (or, with auto-capture off, *"Line the page up inside the corners
      and tap the button to take the photo."*)
    - `tip:scanner-stack` once there are scans: *"Keep going for the next page or document.
      Tap the stack in the corner to check your scans and read them."*
13. **Zoom** — a slider where the camera exposes real hardware zoom; otherwise a **1× / 2×**
    pill pair, which is a crop of the picture rather than a lens zoom.
14. **`Auto-capture: on`** and **`Auto-zoom: on`** — small underlined text. Both default on,
    both remembered **per device** (`scanner-auto`, `scanner-auto-zoom`).
15. **`Use the native camera instead`** — iPhone only.
16. **The Safari permission tip** (`tip:camera-allow`) — iPhone only, and only when the camera
    actually had to ask this time: *"Asked for the camera every time? Set it once: iPhone
    Settings → Safari (under Apps) → Camera → Allow. Or in Safari: aA → Website Settings →
    Camera → Allow."*

**Bottom bar** (black, inside the safe area):

17. **Photo-library button**, left — opens the file picker (`image/*` and PDF; several at once
    in a run).
18. **The shutter** — a 64px circle, white ring normally, **green ring when a page is found**.
19. **The stack**, right — only in a run with at least one scan. A small thumbnail of the last
    shot with a **green count badge**, and a second card rotated behind it when there is more
    than one. Tapping it opens the review sheet.
20. **When the camera is not usable**, all three are replaced by one full-width white
    **Upload a photo or PDF** button. That is deliberate: upload is the only thing that
    actually works then, so it gets the primary button rather than the smallest text.

**Gestures.** Two fingers pinch to zoom — the lens where the phone has one, otherwise a crop
capped at 3×. The browser's own pinch and double-tap zoom are switched off inside the camera.
**The screen is kept awake** the whole time the camera is live.

#### How auto-capture decides to fire

The detector runs **every 150ms**, on a **480px-wide** copy of *only the part of the camera
frame the screen is actually showing*. That last part matters and is not obvious: the video is
cover-fitted to the screen, so a portrait phone sees a middle strip about **62% of a 4:3
sensor's width**. **A page wider than that strip runs off both sides and is rightly not
found** — it has to be held further back or the phone turned. A landscape page is not a
special case.

A shape counts as a page when:

- It has **four corners** and covers at least **6%** of the work frame; **or** at least
  **1.2%** if it "looks like paper" — the middle at least **18 grey levels** lighter than a
  ring around it, every corner at least **1.5%** clear of the frame edge, the long side at
  most **8×** the short one, and at most **20%** of the surrounding ring covered in edges.
  (That small path is a till receipt on a table seen from standing height, and it is what
  auto-zoom then zooms in on.)
- **And it has printing on it.** Edges *inside* the shape, measured across the middle 85% of
  it, must be at least **1.5%** of its area. In the debug readout's units (thousandths) that
  is `ink` ≥ **15**. Measured on the test clips: **a wall reads 0, an A4 invoice 110, a
  receipt on a patterned floor 253.**

  **This exists because of the kitchen tiles.** Atanas, 2026-09-26: *"he scans the tiles in my
  kitchen and he takes the picture of that... you shouldn't be able to scan tiles just because
  it has an edge."* A tile passes every other test easily — large, rectangular, lighter than
  the grout, nothing printed nearby. What a document has and a wall hasn't is print, so print
  is what is measured.

  **The honest cost: a blank sheet of paper fails this too.** A blank page never turns green
  and never auto-captures. That was accepted knowingly — it stops the lock-on and the
  automatic shot, never the shutter, so a blank page is still one tap away.
- A page's corners are re-fitted from straight lines through its **sides** rather than taken
  from the simplified outline, so a folded-over corner or a wavy edge does not skew the crop
  or make a corner flip between the two ends of the fold as the page moves. A torn or curled
  receipt goes through its convex hull. A curled page's curved sides are *not* flattened.
- What is drawn, checked and captured is the **per-corner median of the last 3 detections**,
  so one misread tick does not restart the count. A page **missed for up to 2 ticks** keeps
  its outline and its count.

Then, to fire by itself, all of this at once:

| Condition | The number |
|---|---|
| Held still | **1,100ms**, no corner drifting more than **2%** of the work width per tick |
| Big enough | **9%** of the frame by area, **or** spanning **50%** of it on its long axis (so a till receipt counts) |
| In focus | sharpness (variance of the Laplacian) at least **12** absolute **and** at least **70%** of the sharpest frame in this run |
| This tick agrees | the raw reading within the same 2% of the median |
| Not blocked | torch not about to come on, review sheet not open, camera live, and in a run the previous page has left |

**A run that stays still for 2,500ms fires regardless of sharpness**, so a dim room can never
dead-lock the scanner.

The sharpness test is a *"the lens has settled"* check, not a quality bar. And **1,100ms was
600ms**: Atanas's first real receipt, 2026-09-22, was photographed before the phone had
focused. Another half-second is the fix.

#### Auto-zoom

It goes by **span**, not area — how much of the view the page fills along whichever axis it
fills most — because a till receipt can run the full height of the screen while covering
almost none of its area.

- A page held still spanning **under 50%** of the view is zoomed toward **75%**, after
  **350ms** of settling, in steps of at least **1.15×**, with an **800ms** cooldown between
  steps so it cannot hunt in and out.
- The ceiling is **4× on the lens** where the camera exposes zoom (real detail), or **2.5×**
  as a crop where it does not. Never so far that a corner comes within **6%** of the edge.
- **It also zooms out.** Zoomed in with a corner already inside that 6% — the phone came
  closer, or the zoom went too far — it steps back out to where the page just fits (×0.95),
  not all the way to 1.
- A page **lost for 1,500ms** zooms right back to 1× so the next one can be found.
- **Zooming by hand turns auto-zoom off for that session** — the slider, the 1×/2× pills or a
  pinch. Turning the switch off undoes auto-zoom's own zoom but never one you chose.
- While zoomed past 1×, *every* candidate has to look like paper. Without that the scanner sat
  zoomed in on a table printed *on* a receipt and never backed off (2026-09-22).

#### The torch, and when it comes on by itself

- The button exists **only when the camera reports a torch** in its capabilities. That is a
  Chromium capability. **Worth checking on the iPhone: if the torch button is not there, the
  automatic torch is not there either**, and what a dark kitchen actually gets is the hint,
  not light.
- It comes on **by itself** when the average brightness of what is on screen is under
  **55/255** for **400ms**, and the hold-still count restarts in the new light. Auto-capture
  will not fire while the torch is pending.
- **Touching the torch button once stops it ever coming on by itself again** for that camera
  session — by hand means by hand.
- With no torch available, after **1,200ms** dark the hint says **"It's dark here — more light
  helps"**.
- Brightness is measured *before* edge detection, so the torch and the dark hint work while
  OpenCV is still downloading or has failed altogether.
- A camera that refuses the torch makes the button **disappear** rather than leaving a button
  that does nothing.

#### What the hint says, and when

In priority order — the first that applies wins. These are the exact words:

1. `Hold still — taking the photo…`
2. `Got it — 3 scanned. Next document…` (in a run, waiting for the page to be swapped)
3. `It's dark here — more light helps`
4. **nothing at all** — when the page-finder failed, or no page is found. This is on purpose:
   the corner brackets already show where the page goes. Atanas: *"everyone knows what to
   do."*
5. `Hold still — zooming in`
6. `Move the page to the middle`
7. `Move closer` — only when zooming cannot do it for you
8. `Ready — tap to capture` (auto-capture off)
9. `Hold still…`

Prefixed with `Page 2 · ` when the camera was opened to add a further page to a document.

#### The hidden debug readout

**Tap the hint pill** — or the invisible strip where it would be — to toggle it. It refreshes
twice a second and reads:

```
cv:ready video:1920x1080 ticks:412 quads:389 cov:23% ink:110 sharp:64 tick:38ms coach:hold auto:on
```

- `cv` — page-finder: loading / ready / failed
- `video` — the camera's real resolution
- `ticks` / `quads` — detection ticks since opening, and how many found a page
- `cov` — % of the frame the page covers
- `ink` — printing inside it, thousandths; the tiles number, threshold 15
- `sharp` — focus; floor is 12
- `tick` — **milliseconds the last detection took. This is the number that says whether the
  phone is keeping up.**
- `coach` — line / zooming / centre / closer / hold
- `auto` — auto-capture

It is the only way to see what the detector is doing on a phone in a kitchen. It does **not**
report the torch, zoom level or whether a still was used.

#### The photo that actually gets saved

1. Where the browser can take a real camera still (Safari 18.4+, Chrome), it asks for about
   **3200×1800** — Safari hands back its smallest still unless asked, and its largest can be
   48MP.
2. That still is used **only if** it has at least 1.2× the video's pixels, it clearly shows
   what was on screen (a correlation of 40px greyscale thumbnails of at least 0.6), it is at
   least 60% as sharp as the video frame, and the page can be found again in it within 5% of
   the frame diagonal of where the video had it. **Otherwise the video frame is used** — no
   guessing. A still lying on its side is turned whichever way clearly matches the screen; if
   both ways look about the same (a centred page on a plain table), the still is dropped.
3. The page's four corners are then perspective-warped square, so what is saved is **the page
   alone, straightened**.
4. **Then it is downscaled to 1,600px on the long edge at JPEG 0.8**, about 300–500KB. So the
   3200px still buys sharpness *within* those 1,600 pixels, not a bigger file. Every path —
   in-app camera, iPhone camera, upload — goes through the same downscale, so none of them can
   reintroduce the 4–5MB-per-receipt problem.

A tap on the shutter during the grace period after a page was lost saves the **whole frame**
rather than cropping to where the page was. A tap right after a move crops to this tick's
reading, not the median that is still catching up.

#### Scanning several documents one after another

Only on `/scan`'s first capture and on `/copy`. Everywhere else the camera takes one photo and
closes.

After each shot the camera **stays open**, the shot joins the stack, and auto-capture **will
not fire again until the page has left the frame**: lost for 2 ticks, or moved more than 20%
of the work width, or shrunk below 60% of what was taken — **and** at least 900ms has passed.
Meanwhile the hint says `Got it — N scanned. Next document…`. That is what stops one page
being photographed twice.

**There is no cap on how many scans the stack can hold.** (`/scan`'s *pages of one document*
cap is 20, on the one-shot path, and it says so: *"20 pages is the most one document can
have."*)

#### The review screen

Opens as a full-screen sheet over the live camera (`BatchReview`).

- **`Check your scans`** — or `Check your photos` on `/copy`.
- Under it: *"5 scans, 3 documents. Tap "Page of previous" when a scan is the next page of the
  one before it."* (`/copy`: *"5 photos. They go into one file in this order."*)
- A grid of cards, two across on a phone. Each has the thumbnail, a badge reading **`Doc 2`**
  or **`Doc 2 · page 2`**, a **`Page of previous`** checkbox (not on the first card, never on
  `/copy`), and **`Remove`**. A card that is a further page is drawn with a **dashed border**.
- Bottom: **`Keep scanning`** and **`Read 3 documents`**. On `/copy`: **`Take more`** and
  **`Use 5 pages`**.
- Removing a document's *first* page promotes its next page to be the new first page, rather
  than letting it fall into the document before it.
- The sheet takes keyboard focus when it opens and hands it back to whatever opened it;
  everything behind it is made unreachable, because the Capture button and a Back that
  discards the whole batch were one Tab away.
- **`Keep scanning` explicitly restarts the video**, because the sheet covering it is what
  paused it. Atanas's exact report: *"if you look at the scans, and then you click on keep
  scanning, it doesn't open the camera... although the flashlight works, just the camera."*

#### The iPhone's own camera, as the alternative

A per-device setting, `scanner-mode` in localStorage: **`inapp`** (the default) or
**`native`**.

**Where it is offered:**
- **`Use the native camera instead`** — bottom of the live camera, iPhone only.
- **`Use the iPhone camera instead — it doesn't need this permission`** — on the denied,
  timed-out and stalled screens.
- **`Use the iPhone camera instead`** — on `/scan`'s own camera-blocked panel.
- Getting back: **`Use the in-app scanner instead`**.

**What that screen is instead:** black, with *"Take a clear, well-lit photo of the whole
document."* and buttons **`Take a photo`** (or `Take the next photo`),
**`Check and read N scans`** (green), **`Upload instead`**, and the way back. The stack and the
review sheet still work.

**Nothing is detected, nothing is cropped, nothing is straightened, and the 13MB page-finder
is never downloaded.** The photo comes from the OS camera through a file input, so **it never
asks this site for camera permission at all** — which is why it still works when the in-app
scanner is blocked.

**Why it exists**, in the code's own words: iOS Safari's `getUserMedia` returns a
low-resolution, fixed-focus stream with no way to ask for better — soft images that OCR does
badly with. And the page-finder needs the *whole* document inside the frame with margin, which
fights holding the phone close enough to keep the text legible. The OS camera has neither
problem: full sensor, real autofocus, no quad to find, and it opens faster. **It stopped being
the iPhone default when auto-capture landed**, but it is one tap away.

Elsewhere in the app the same choice is made by `CaptureButton`: on an iPhone set to `native`,
the button *is* the file input, so one tap opens the OS camera — iOS only opens the camera
from a file input inside the user's own tap, and a `window.confirm` is deliberately not run
inside that tap because it would cost the gesture.

#### When the camera is refused, blocked, or stops sending pictures

Five states, each a full screen over black. In all of them the bottom bar becomes the
full-width **Upload a photo or PDF** button.

| State | What it says | What it offers |
|---|---|---|
| **starting** | `Starting camera…` | Upload |
| **denied** | *"Camera access was denied. You can allow it from your browser's site settings, or upload a photo or PDF instead."* | the Safari Settings tip (iPhone), **Try again**, the iPhone-camera escape, Upload |
| **timeout** | *"The camera didn't respond. This usually means access is blocked somewhere your browser won't report directly (an OS-level camera privacy setting is the most common one) — check there, or upload a photo or PDF instead."* | **Try again**, the escape, Upload |
| **stalled** | *"The camera stopped sending pictures. Your scans so far are safe."* | **Turn the camera back on**, **Check and read N scans**, the escape, Upload |
| **unsupported** | *"This browser doesn't support camera capture here. Upload a photo or PDF instead."* | Upload |

**Why there is a timeout at all (8 seconds).** `getUserMedia` can hang for ever rather than
reject when the camera is blocked at the OS level for the whole browser. With no timeout that
is exactly the *"stuck on Starting camera… for ever, no error, no prompt"* dead end. If the
camera then arrives late, its tracks are stopped — otherwise the phone's camera light stays on
and the camera stays unavailable to other apps until the tab is closed.

**How "stopped sending pictures" is detected.** The video's clock stops advancing for
**1,800ms**. Two causes, two different answers: if the element is merely *paused* and the
track is still alive, it is played again (which keeps the stream, the zoom and the torch); if
the stream had ever produced more than **30 frames**, the camera is reopened; otherwise this
screen is shown. The track's own `ended` and `mute` events trigger it too. **Straight from
Atanas, 2026-09-26:** *"the camera, it wouldn't take a photo, it all came black. And then I
couldn't turn the camera back on."* Before this, nothing noticed at all: the frame loop
returned early on an unready video, so it spun doing nothing while the screen showed black,
the status still said "live", and the only way out was leaving the scanner and losing the
batch.

**The permission bookkeeping** (`src/lib/camera.ts` — every camera in the app opens through
here, so the browser is asked at most once):

- Chrome and Edge answer the Permissions API for the camera. **Safari and Firefox do not**, so
  there the last open is all there is to go on.
- A **granted** camera is remembered for ever (`camera-allowed=1`). A **refusal** is written
  down **only where the browser can later correct it — never on Safari.** A stored "denied"
  there would outlast the refusal itself with no way back: "Try again" would short-circuit
  before ever reaching the browser, and the app's own Settings tip would be advice about a
  block the app was holding itself. **One mis-tap would end the in-app scanner on that phone
  for good.**
- **Try again** and **Use the in-app scanner** both forget the stored refusal first, so they
  really ask the browser again.
- A camera busy in another app is **not** remembered as denied, so it can be retried.

#### The 13MB, which is the honest answer to "it feels slow"

`public/vendor/opencv-5.0.0.js` is **13,298,869 bytes on disk, about 3.8MB gzipped over the
wire**. It is not bundled: a prebuild script copies it into `public/vendor` and it is served
with an immutable cache header, so after the first visit it comes from the browser's cache
rather than a fresh download per deploy. It is loaded as a plain `<script>`; a 20-second
timeout covers the runtime starting up. While it loads, the camera works and finds nothing,
and says so.

The dashboard warms it up two seconds after it appears — **but only for somebody who has
already used the camera**. The old guard was `navigator.connection`, **which Safari does not
implement**, so the one protection there never applied on the device the app is actually used
from: every first visit on an iPhone downloaded 13MB two seconds after the dashboard appeared,
for a screen they had not opened. That is its own answer to *"the app felt slow"* and *"takes
ages to start actually scanning"* (2026-09-22 and 2026-09-26).

#### Where it takes you next

The camera hands its result back to the page that opened it; it never navigates on its own.

- `/scan` first capture → the review sheet → `/scan`'s reading walker → **See them in
  Receipts** (`/receipts`), or `/receipts/review`
- `/copy` → the PDF builder on `/copy` (save, share or email)
- `/invoices/new` → fills the invoice
- `/clients/new` → fills the contact form
- `/free-invoice` → adds a page to the old-invoice read
- **Back** → the page underneath. On `/scan` with nothing scanned yet, Back goes to the
  dashboard (`/`).
- When the camera is unusable and the page opened it *by itself*, the page is told and gets out
  of the way: `/scan` shows a panel with **Use the iPhone camera instead**, **Upload a photo or
  PDF**, **Add a receipt by hand** (`/receipts/new`) and **Try the camera again**;
  `/free-invoice` shows the invoice instead of a black screen. A page where *you* tapped the
  camera leaves the retry to you.

#### Free, gated or not built

- **Behind sign-in: yes, completely.** Every page that can open the camera requires an account
  — `/scan`, `/copy`, `/invoices/new`, `/clients/new` and `/free-invoice` all send a stranger
  to `/login`.
- **The camera itself costs nothing per use.** No model call, no paid API, no server request,
  nothing uploaded. Taking two hundred photos costs nothing. This is worth knowing before
  deciding the free tier: the expensive thing is not the camera.
- **What costs money is the reading afterwards** — `/scan` sends the finished images to
  `POST /api/scan` (Google Gemini by default, Claude optionally), and **that is what is
  limited.** `SCAN_LIMITS` is **"on" in production**: reading a document is limited for
  **every** account today — **300 a day for an account's first seven days, then 50 a day and
  600 a calendar month**, with one self-serve top-up of another 600 per month. **Nobody is on
  a paid plan; the paid tier does not exist.** `/copy` reads nothing and is not counted
  against anything.
- **No environment variable switches any part of the camera on or off.** Everything here is a
  per-device localStorage key: `scanner-mode`, `scanner-auto`, `scanner-auto-zoom`,
  `camera-allowed`, `scan-engine`, `tip:*`. Nothing about the camera is per-account, so it does
  not follow him from the iPhone to the MacBook.
- **Half-built / not built:** the barcode reader detects a barcode and then does nothing with
  it. There is no offline queue — captures are not kept on the phone when there is no signal.
  A curled page's bent sides are found but not flattened.
- **Never tested on a real iPhone by anything but Atanas.** The whole test harness is headless
  Chrome against synthetic camera clips and a mocked database. His reports are the only
  evidence from the device this is built for.

**One live setting worth checking on his phone:** `scan-engine` is per device. If his iPhone
still has it on `claude` from the engine testing, every read there goes through the slow
reader. Opening `/scan?engine=gemini` on that phone once puts it back.

---

### Worth deciding

1. **Should the camera stay free and unlimited while the reading is capped?** Today you can
   take any number of photos for nothing, and the wall only appears when they are read. Is that
   the split you want, or should a free account be capped on photos too (simpler to explain,
   but it charges for something that costs nothing)?

2. **Keep the 13MB page-finder, or make the iPhone's own camera the default on iPhone again?**
   The download is the single biggest reason the app feels slow before the first scan. The OS
   camera downloads none of it and takes sharper pictures — but it loses auto-capture,
   auto-zoom, the green lock-on and the straightening, and every photo needs a deliberate tap.
   A middle option: keep the in-app scanner as the default but stop pre-loading it anywhere,
   so the cost is paid only when the camera is actually opened.

3. **Does the torch button appear on your iPhone at all?** If it does not, the automatic torch
   does not either, and a dark kitchen only gets the words *"It's dark here — more light
   helps"*. If so, do you want a fallback — the app turning its own screen white behind the
   camera — or is the hint enough?

4. **Auto-capture on or off for a brand-new account?** It is on. On means the phone decides
   when to shoot; off means "Ready — tap to capture" and you decide. First-timers are the ones
   who get an unwanted photo of a table.

5. **Should a blank page be scannable automatically?** Right now a page with no printing on it
   never turns green and never auto-captures — the print test is what stopped the kitchen
   tiles. You can still tap the shutter. Is that the right trade, or should blank paper count?

6. **Should the camera have its own address** (say `/scan/camera`) so the phone's back gesture
   closes the camera instead of leaving the page and silently dropping the scans?

7. **How many documents should one run hold?** There is no limit at all on the stack, and
   every document in it costs money to read. Is a cap worth having — and should the review
   sheet warn when the batch is bigger than what is left of today's 50?

8. **Are the dark and stillness numbers right for your kitchen?** "It's dark here" waits 1.2
   seconds at under 55/255 brightness; the automatic shot waits 1.1 seconds of stillness, or
   2.5 seconds if it never gets sharp. These are the two you would feel immediately if they
   were wrong.


---

## What happens to a photograph after it is taken

`scanner-camera.md` covers the camera itself — holding the phone, the green corners, the
shutter. This is everything after the picture exists. Written 2026-09-28 by reading the code.

---

### Reading a document — `/scan`

- **What it is for.** Turn a photographed receipt, supplier invoice or credit note into a row
  in the accounting record, with the supplier, date, total and VAT already filled in.
- **How you get there.** The big black **"Scan a receipt or bill"** button on the dashboard;
  **Scan** under Tools in the menu; the **"+ Add"** sheet; or the scan button on the receipts
  list. Also from **"Upload photos or PDFs"**, which skips the camera and hands files straight
  in.
- **What is on it.** Either the camera, or — once pictures exist — one document at a time with
  its figures in a form: supplier, date, total, of which VAT, category, invoice number, due
  date, whether it is already paid, and a picture of what was read. Underneath: **Save and
  next**, **Skip**, and when several are waiting, **Save all ready**.
- **What it does behind the scenes.**
  1. The picture (or PDF) goes to `POST /api/scan` with the signed-in person's token.
  2. `src/lib/scanExtraction.ts` asks the reader for a structured answer — 29 fields.
  3. `src/lib/splitDocuments.ts` checks whether one photograph holds more than one document,
     and if so splits it into separate entries in the walk.
  4. `src/lib/documentDate.ts` reads the printed date **day-first** (British order), server-side.
  5. `src/lib/scanSanity.ts` looks for readings that are probably wrong.
  6. Saving writes a row in `receipts`, and the picture to a private bucket.
- **Where it takes you next.** The receipts list, or the next document in the walk.
- **Free, gated or costs money.** **Signed in only, and it costs money every time** — this is
  the only part of the app whose cost grows with use. **It is also the only part that is
  rationed.** See the limits below.

---

### Which reader, and what it costs

Two are wired in (`src/lib/extractors.ts`):

| | Model | Speed (measured) | Used by |
|---|---|---|---|
| **Gemini** | `gemini-3.5-flash-lite` | **4.3 s** median | `/scan` — the default everywhere |
| **Claude** | `claude-opus-5` | **7.0 s** median | the "copy an old invoice" paths, and anyone who opts in |

Measured on 2026-09-26 over ten benchmark documents (`notes/engine-accuracy.md`): **both got
every field right on all ten** — type, supplier, date, total, VAT, invoice number, line count.
So Gemini is the same accuracy, 1.6× faster, and far cheaper.

**A picker exists but is hidden**: `/scan` only shows it on a device where `scan-engine` has
been set in localStorage. Visiting `/scan?engine=gemini` once sets it. This matters — if a
phone was left on `claude` during testing, every scan on it is the slow, dear one.

**Worth knowing for the cost conversation:** copying an old invoice asks for **Claude
explicitly**, both from the Free page (where there is a visible picker, so it is a choice) and
from `/invoices/new` line 427 (where it is hard-coded with no picker at all). That decision
dates from 19 September, before the benchmark existed. It has not been changed because the
benchmark tested reading a *receipt*, not copying an invoice's layout, so it does not prove
Claude is unnecessary here — but it is the slower, dearer engine on a path nobody can opt out
of.

**One gap in the counting:** "Describe it and it's filled in for you"
(`/api/invoice-from-text`) calls Claude and is guarded only by 60 an hour per person — it does
**not** come out of the scan allowance below.

---

### What the reader refuses to fill in

The rule, from Atanas on 2026-09-23: *"tell them honestly and add only what is sure for."*

A field the reader is not certain about is **left empty and said out loud**, never filled with
a good guess. The reasoning is that a wrong total or a wrong date that looks confident goes
into the accounting record unchallenged, while an empty box gets looked at.

In practice:
- An **ambiguous date** (03/04/2026 — March or April?) must be confirmed on screen rather than
  resolved quietly.
- A field it could not read comes back empty with a note, not filled in.
- `src/lib/scanSanity.ts` adds two checks found in Atanas's own real records: a **misread year**
  (a receipt dated 2012 that arrived last week) and a **total of zero** where both the amount
  and the VAT read as nothing.
- A **possible duplicate** — the same supplier, date and amount as something already saved,
  including documents saved earlier in the same run — is warned about before saving.

---

### Several documents in one photograph

If one picture holds two receipts side by side, the reader returns both, each with the part of
the picture it came from. `/scan` then replaces that one entry with two in the walk. Photos are
cropped to each document with a 3% margin and the whole photo kept as a second page; a PDF is
cut per document. Pages added or retaken by hand are merged back into one document.

### "Save all ready"

Saves, through exactly the same path as pressing Save on each, every remaining document that:
is read; is a receipt, invoice or credit note; has a total it is sure of; has a date; has
nothing waiting to be confirmed; is in pounds, or has a fetched exchange rate; and is not a
possible duplicate. **Anything that fails one of those stays behind with the reason shown.**

---

### The limits — the most important thing on this page

**Live in production since 23 September**, enforced, and visible to people as they use it.
The project notes said they were switched off until 27 September; they were not.

| | A day | A month |
|---|---|---|
| An account's **first 7 days** | **300** | no cap |
| **After that** | **50** | **600** |
| A `paid` account | unlimited | unlimited |

**No paid tier exists.** The database has a `plan` column, it defaults to `free`, and nothing
in the app sets it to anything else. Everyone is on the free allowance.

The generous first week is deliberate, in the migration's own words: somebody catching up on a
year of receipts should not meet a wall on their first evening.

**What a person sees** (`src/components/ScansLeft.tsx`): "Today — 12 of 50" and "This month —
233 of 600", with a line underneath: *"If you run out this month, you can ask for another 600
once, free."*

**There is a free top-up**: 600 more, once per month, granted on asking. Once used: *"You have
already had your extra 600 this month. It starts again on the 1st."*

**What the wall says** (`src/lib/scanLimit.ts`) — plain words, never an error code, and always
with what still works:

> *"That's 50 documents today, which is the most a free account can read in one day. It starts
> again tomorrow morning. You can still copy a document or write an invoice by hand."*

> *"That's 600 documents this month. You can have another 600 for this month — just ask, once."*

> *"That's the extra 600 used as well. It starts again on the 1st. You can still copy a
> document or write an invoice by hand."*

There is also a **burst guard** separate from the allowance — 60 an hour per account and 200
an hour across everybody — which exists to stop a runaway loop, not to ration anybody. The
route's own comment flags it as a launch risk: **600 an hour is shared by everyone**, so a
depot where twenty drivers catch up on a year of receipts in one evening would exceed it
between them and each be told "scanning is busy right now" — at exactly the moment a depot
starts talking about the app.

---

### Worth deciding

- **Is 50 a day and 600 a month the right free allowance?** It is already live, so this is a
  change to something people may be relying on, not a blank page.
- **Should the free top-up be automatic rather than "just ask"?** Asking means a message to
  Atanas; nobody has asked yet.
- **Should the app tell people about the generous first week?** Today it is invisible unless
  you read the code — somebody could hit 50 on day 8 and think it had always been 50.
- **Copying an old invoice always uses the slower, dearer reader, with no way to choose on
  `/invoices/new`.** Should it use Gemini like everything else, or be benchmarked properly on
  that path first?
- **"Describe it and it's filled in for you" costs money and is not counted.** Should it come
  out of the same allowance?
- **The shared 200-an-hour burst guard is a launch risk** if the app ever reaches more than a
  handful of people at once. Worth raising before, not after.


---

## The tools beside the scanner — Copy a document, Change a file, Files

Three pages that have nothing to do with invoicing and nothing to do with the AI reader.
They exist because Atanas asked for them (2026-09-22: *"another scanner button which is going
to scan files, no matter what files"*, and *"every file needs to be able to be turned into
every other file so the app works as a file transformer too"*). The scanner reads a document
and puts figures into the accounting record; these three just move paper and files about.

**The one thing to hold on to before reading any of it:** `/copy` and `/convert` cost nothing
to run — not a penny, not a model call, not a paid API, not a scan out of the daily
allowance. The only thing anywhere in this section that costs real money is **emailing the
finished file**, and that is Resend at a fraction of a penny a send.

---

### Copy a document — `/copy`

- **What it is for.** Photograph any piece of paper — a letter, a form, a certificate, a
  delivery note — and get **one PDF** back, to save, share or email. Header: *"Photograph any
  paper — a letter, a form, a receipt. Each page is straightened, and they all go into one
  file you can save or send."*
- **How it differs from scanning.** It uses the **same camera** as `/scan` (the same
  `DocumentCapture`, the same edge-finding and straightening), and then stops. **Nothing is
  read by the AI** — no model is called, no figures are pulled out, no supplier is matched,
  nothing is counted against the scan allowance. **Nothing is stored** — no receipt row, no
  upload to the `receipts` bucket, nothing in the database. The pages live in the page's own
  memory and go when the page is left, which the last line on screen says out loud:
  *"Nothing is kept: the pages stay on this screen until you leave it."*
- **How you get there.** Header → **Tools ▾ → Copy a document**; the dashboard's fourth tile,
  **Copy a document**; the **+ Add** sheet everywhere it appears (*"Copy a document —
  Photograph any paper into one file to save or send"*); and a line at the foot of the Free
  invoice page: *"Need a copy of any paper? **Copy a document** into one file to save or
  send."*
- **What is on it**, in screen order:
  1. **"Copy a document"** and the sub-line.
  2. **A tip** the first three times (`tip:copy-how`, three appearances then it stops, or
     **Got it** stops it at once): *"How it works: take photos or pick files, put them in
     order, and they become one file to save, share or email."*
  3. Two big buttons side by side: **Take photos** (**Take more photos** once there are
     pages) and **Choose files** (**Add from files**). The file button accepts photos and
     PDFs.
  4. Once there are pages, a white card: **"4 pages"**, then a grid of thumbnails, each
     numbered, each with **←**, **Remove**, **→** so the order can be fixed. A PDF page shows
     the word **File** instead of a picture.
  5. **Name for the file** — one box, placeholder *"Document 26 Sep 2026"* (today's date).
  6. **Save the file** and **Share** (**Making the file…** while it works).
  7. **Or email it to someone** — *Their email address*, *A note (optional)*, **Send**, and
     *"It goes from Invoiceover with your email address to reply to."*
- **What it does behind the scenes.** `src/lib/documentPdf.ts` (`pagesToPdf`) builds the PDF
  with `pdf-lib` **in the browser**: a photo gets an **A4 page turned to match it**
  (landscape photo, landscape page) with the picture fitted inside an 18-point margin; a PDF
  dropped in has **its own pages copied through as they are**. `pageCount` counts what the
  finished file will really have (a 6-page PDF counts as 6, not 1). `pdfName` cleans the typed
  name down to letters, digits, spaces and dashes. The camera side is
  `DocumentCapture purpose="copy"`, whose review screen says **"Check your photos"** /
  **"Use N pages"** and — unlike the scanner's — has no grouping into separate documents.
  `src/lib/saveFile.ts` hands the file to the device. Two details worth knowing before
  anything here is restyled: **pdf-lib is half a megabyte** and is fetched only once the
  first page is added (every page linking to `/copy` was making Next preload it for visitors
  who never copy anything); and **Save and Share are guarded by a `useRef`, not by
  `disabled`**, because React applies `disabled` on the render *after* the first press — two
  taps in one tick gave two identical PDFs in Downloads, or a second share sheet, which
  throws.
- **Where it takes you next.** Nowhere: it is a dead end on purpose. The file goes to the
  device, the share sheet or an email. The only link off the page is the sign-in link, which
  cannot be reached (below).
- **Free, gated or not built.** **Behind sign-in** — the Gate in `src/app/AppShell.tsx`
  redirects a stranger straight to `/login`, and this was Atanas's own rule that everyone
  signs in before scanning anything. Free to run: **no model, no paid API, no scan counted,
  no environment switch**. Only the email costs anything.
  - **A dead branch worth knowing about.** The page has its own signed-out card — *"It needs
    a free sign-in first. Nothing to pay."* with **Sign in to copy a document** pointing at
    `/login?next=%2Fcopy` — and **it can never be seen**, because the Gate has already
    bounced the visitor to a bare `/login` with no `next=`, so they do not come back here
    after signing in either. Whoever decides whether `/copy` should be public is deciding
    which of those two is the mistake.

---

### Change a file — `/convert`

- **What it is for.** Turning what somebody already has into what they need, with no upload
  anywhere. Header: *"Turn a photo into a PDF, a PDF into pictures or words, a spreadsheet
  into data. It happens on your own phone or computer: nothing is sent anywhere."*
- **How you get there.** Header → **Tools ▾ → Change a file**, and **that is the only way
  in.** No dashboard tile, no row in the **+ Add** sheet, no link from `/copy` or the Free
  page. It is the most hidden tool in the app.
- **What is on it**, in screen order:
  1. **"Change a file"** and the sub-line.
  2. **A tip** (`tip:convert-how`): *"How it works: choose your files, pick what you want them
     to become, then save what comes out or email it."*
  3. **Choose files** — one big button, any number of files, added to a list.
  4. **The list** — each file's name, and under it what kind it is (*picture*, *PDF*, *words
     or rows*, or *not one we can change*) and its size in KB, with **Remove**.
  5. **"Turn it into"** / **"Turn them into"** — a grid of buttons, only the ones **every**
     chosen file can become:

     | Button | Ending | What it says |
     |---|---|---|
     | PDF | .pdf | One file, good for sending and printing |
     | Picture | .png | Sharp, bigger file |
     | Smaller picture | .jpg | Smaller, good for a message |
     | Web picture | .webp | Smallest of the three |
     | Plain text | .txt | The words on their own |
     | Spreadsheet | .csv | Rows and columns for Excel or Numbers |
     | Data | .json | For another program to read |
     | Web page | .html | Opens in any browser |

  6. If nothing fits: *"We can change pictures, PDFs, and files of words or rows. That one we
     can't."*
  7. **"Your file is ready"** / **"Your 6 files are ready"** — each with **Save**, plus
     **Save all 6**, and the email form **only when exactly one file came out and it is a
     PDF**.
- **What every conversion actually is** (`src/lib/convert.ts`). Three kinds in, eight out,
  and the table below is the whole of what is allowed — `kindOf` decides the kind from the
  type and the file name:
  - **A picture** → PDF, .png, .jpg, .webp. Redrawn through a canvas; anything see-through
    goes onto white first, or a JPEG turns it black.
  - **A PDF** → PDF, .png, .jpg, **.txt**. Each page is drawn at **twice its own size** so the
    words stay sharp and comes out as a picture of its own (*"invoice page 3.png"*); .txt
    pulls the real text out, line by line, with `pdfjs-dist`. There is **no OCR**: a PDF that
    is only a photograph inside gives an empty .txt, and nothing on screen explains that.
  - **Words, rows or data** (.txt, .csv, .tsv, .json, .html, .md, .log, .xml, .yml) → PDF,
    .txt, .csv, .json, .html. A CSV is parsed properly, quotes and all (`parseCsv`, and a
    tab-separated file is spotted); a spreadsheet becomes an HTML **table**; JSON becomes rows
    with a header line; plain words become an A4 PDF, wrapped where the line runs out, with a
    word longer than the page cut rather than run off it (`textToPdf`).
  - **Several pictures or PDFs asked for as one PDF come back as one file** — the same
    `pagesToPdf` as `/copy`. Everything else comes back one file for one.
  - **Anything else is "other" and can be turned into nothing.** In practice that means
    **Word and Excel documents are not supported**: *spreadsheet* here means .csv or .tsv, not
    .xlsx, and there is no .docx path at all.
  - **A mixed pile narrows the options to the overlap**, because `targetsFor` keeps only what
    *every* file can do. A picture and a spreadsheet together offer PDF and nothing else; a
    picture and a Word document offer nothing.
  - **All of it runs on the device** — canvas, `pdf-lib`, `pdfjs-dist` and `DOMParser`.
    Nothing is uploaded, nothing is stored, no server is involved at all. The `pdfjs` worker
    is a file copied to `public/vendor` at build time.
  - **Error wording is fenced.** Only four sentences written for people are allowed on screen
    (`WRITTEN_FOR_PEOPLE`: *"This browser can't change pictures."*, *"That picture couldn't be
    made."*, *"This browser can't draw the pages."*, *"That file couldn't be read."*).
    Anything pdf-lib or the browser says — *"Invalid PDF structure"*, a bare DOMException —
    is logged and replaced with *"Those files couldn't be changed. Try one at a time."* Same
    rule as the refusals section.
- **Where it takes you next.** Nowhere. Files out, or an email.
- **Free, gated or not built.** **Behind sign-in** (the Gate; and unlike `/copy` this page has
  no signed-out card of its own, so a stranger simply lands on `/login`). **Free to run —
  genuinely nothing:** no model, no API, no scan counted, no environment switch, no server
  request. Only the email costs anything. It is the one feature in the app that could be given
  away without limit at no cost whatsoever.

---

### File library — `/files`

- **What it is for.** Every photograph and PDF already attached to a **receipt** — the
  scanned and uploaded supplier paperwork — as tiles, newest first, with a way to look at one
  and take it off the app.
- **What it is not.** It does **not** hold what `/copy` or `/convert` made. Those files are
  never stored anywhere, so nothing from them ever appears here. The library reads
  `receipts` and shows only rows that still have a picture.
- **How you get there.** Header → **Tools ▾ → Files**; the dashboard's **Your file library
  →** strip (`src/components/FileStrip.tsx`, which shows recent documents with a
  Photos/Files switch and a date roller, and offers *"open the whole library"*).
- **What is on it**, in screen order:
  1. **"File library"** — *"Every scanned or uploaded receipt document, in one place."*
  2. **A tip** (`tip:files-how`): *"How it works: every photo and file you have saved is here,
     newest first. Tap one to see it or save it to your device."*
  3. **The emailed-photos notice**, only when there are any: *"3 older photos have been
     emailed to you and cleared from here to keep the app free. Those receipts are all still
     in your records — the supplier, the date, the amount and the VAT are untouched."* This
     belongs to the photo-ageing job, which is **switched off** (`PHOTO_AGEING` is not set),
     so today nobody sees it.
  4. **Save these to your device** (`src/components/SaveThese.tsx`), acting on whatever the
     filter is showing, with four shapes: **A folder of files** (a zip, named by date and
     supplier), **Pictures only**, **One PDF** (everything in date order), **One PDF per
     supplier**. *"Nothing is uploaded — it is all made on this device."*
  5. **Filter** — **From**, **To**, **Supplier** (*All suppliers*), **Clear filters**.
  6. **The tiles** — a square picture (or a document icon for a PDF), then supplier or
     category, then `26 Sep 2026 · £48.20`, and `3 pages` where there are extra pages.
  7. **Empty:** *"No scanned or uploaded documents yet. **Scan one**."* — or *"No files match
     these filters."*
  8. **Tapping a tile** opens a full-screen black preview: name, date, amount and supplier
     across the top, a **✕**, the picture (or the PDF in a frame), then a white panel with
     **Save it** and *"3 pages, as one file."*, the **Or email it to someone** form, and
     **Previous / Page 2 of 3 / Next** at the foot.
- **What it does behind the scenes.** Three reads on arrival — receipts, contacts and the
  extra-page counts — under row-level security (`src/lib/storage.ts`). A stored photograph is
  a **signed link** into the private `receipts` bucket, not a file in the page, so **Save it**
  fetches each page back, reads its real type (*"a PNG embedded as a JPEG makes no file at
  all"*) and builds one PDF with the same `pagesToPdf` as `/copy`. The big export shapes are
  `src/lib/fileExport.ts` and `src/lib/zip.ts`, both on the device; pdf-lib is imported only
  when a PDF is actually asked for, because importing it here once dragged the whole PDF
  writer onto every signed-in page. The preview is a real dialog: everything behind it goes
  `inert`, Escape closes it, and focus returns to the tile that opened it. A failed load
  shows one red line and **never** the empty-state sentence.
- **Where it takes you next.** `/scan` from the empty state. Otherwise: files to the device,
  or an email.
- **Free, gated or not built.** Behind sign-in. **No model, no paid API, no environment
  switch** — every export is built in the browser. Only the email costs anything. Nothing on
  this page deletes anything, and nothing here is limited.

---

### Emailing a file — the one thing here that costs money

All three pages share one form (`src/components/EmailFileForm.tsx`) and one route,
`POST /api/send-document`. It sends **the PDF and nothing else** through Resend from
`documents@invoiceover.com`, with the sender's own address as Reply-to, and it is fenced the
same way sending an invoice is, *"since any route that emails an attachment from the app's own
domain is a relay if it isn't fenced"*:

- **Signed in, and the email address confirmed** — an unconfirmed account is told to check
  its inbox first.
- **It must be a real PDF** — the name has to end `.pdf`, the bytes have to start `%PDF-` and
  end `%%EOF`, and it has to be under about 4 MB (*"Remove a page or two, or save it and
  share it another way"*), because Vercel refuses a bigger body before the handler even runs.
- **The wording is fixed.** Subject: *"you@example.com sent you a document: Delivery note
  26 Sep.pdf"*. The sender's note appears only as a quoted, escaped block.
- **10 an hour and 30 a day per account, 60 an hour across the whole app.** With no
  `RESEND_API_KEY` the route answers *"Email sending isn't switched on yet."* (it is set in
  production).
- **Those caps are softer than they look.** `src/lib/rateLimit.ts` counts **in memory, per
  serverless instance** — *"a cold start forgets every count, and parallel instances each keep
  their own"*. The scan limits go through the database; these do not. It is a speed bump, not
  a limit.
- **Send is guarded by a `useRef`, not `disabled`** — *"an email, unlike a saved row, cannot
  be taken back."*

Atanas's own words behind the whole form (2026-09-22): *"every document scanned, created,
uploaded, you should be able to send it via email to anyone for free."* There is no daily cap
on making copies themselves — *"keep it open"*.

One relative worth knowing about: the scanner's walk has a **Just the file** panel
(`src/components/scan/JustTheFile.tsx`) that does exactly what `/copy` does, for a document
photographed at the scanner that should not become a receipt at all — *"Saved to your device.
Nothing was added to your records."* Same PDF builder, same email form.

---

### Worth deciding

1. **`/convert` costs nothing whatsoever to run and is buried in a menu.** No model, no
   server, no storage — it is the only feature in the app that is free in the literal sense.
   If the free tier needs something generous and safe to put on the front of it, this is it.
   Should it get a dashboard tile, a row in **+ Add**, and a line on the front door?
2. **Should `/copy` and `/convert` be open to strangers?** They cost nothing to run and store
   nothing, so the usual reason for a sign-in wall does not apply. Against it stands Atanas's
   rule that *nothing works before an account* — and the fact that a free file converter is a
   good reason for somebody to make one. The page has already been half-built both ways: the
   sign-out card on `/copy` exists and cannot be reached.
3. **The dead sign-in card on `/copy` needs settling either way.** Either the Gate should let
   `/copy` through and show that card, or the card should go. And if a page is ever opened up,
   the Gate should carry `next=` so signing in brings people back to where they were.
4. **No Word or Excel.** *Spreadsheet* on `/convert` means .csv; .xlsx and .docx are "not one
   we can change". For a restaurant or a builder, an emailed .xlsx is very common. Worth
   knowing it is a real library each way, not a switch.
5. **A PDF that is a photograph gives an empty .txt, silently.** There is no OCR on
   `/convert`, and the app *does* own a reader that could do it — at a cost, and counted
   against the scan allowance. Leave it honest and free, say so on screen, or offer "read the
   words with the scanner" as a paid-ish path?
6. **The email caps are in-memory and per instance.** If emailing documents is to be a free
   feature that people lean on, the count should move to the database the way `hit_rate_limit`
   does for scanning — otherwise the real limit is unknown.
7. **The email form on `/convert` shows up only for a single PDF.** Six pictures out of a PDF
   can be saved but not sent, which is arbitrary. Zip them, or allow sending what came out?
8. **`/copy` keeps its pages in memory only.** Leave the page — or lose the tab on a phone —
   and a set of photographs is gone with no warning. Nothing is stored by design, and that is
   the promise on the page; the question is whether a "you have 6 pages, are you sure?" is
   worth it.
9. **The Files page is the receipt photo library, not a file library.** Its name and the
   dashboard's *"Your file library"* both promise more than it holds — nothing from **Copy a
   document** or **Change a file** ever lands there. Either rename it or give copies somewhere
   to live.


---

# Customers, Settings, VAT and the company check

Written 2026-09-28 by opening the files, not from memory. Where a fact needed the live site to
settle it, it was settled by calling the live site (noted where that happened).

Six pages: **Customers & suppliers** (`/clients`), **New customer / New supplier**
(`/clients/new`), **a customer's Statement** (`/clients/<id>/statement`), **Settings**
(`/settings`), **VAT** (`/vat`), **Check a company** (`/check-company`). Plus two boxes that are
not pages but appear all over this area and decide what it can do: the **Companies House name
box** and the **VAT number box**.

**The one-line answer on money.** Nothing in this whole area costs a penny to run, with one
exception: **"Scan to fill in" on a new customer or supplier is a paid AI read and it spends one
document out of the account's daily allowance** — the same allowance a receipt spends. Everything
else here is your own database rows, the browser, or two free government APIs.

---

## Customers & suppliers — `/clients`

- **What it is for.** One list of everybody you deal with. Customers are who you send invoices
  to; suppliers are who your receipts and bills come from. The same record carries their address,
  VAT number, phone, payment terms and whether they get chased for payment.

- **How you get there.** Header → **Money in** → **Customers & suppliers**. On the dashboard, the
  **Who you work with** card has **See all** and three buttons: **New customer**, **New person**
  (`/clients/new?person=1`), **New supplier**. Also from `/quotes/requests/<id>` ("Add their email
  in Customers & suppliers") and from the scan page after saving ("View suppliers").

- **What is on it**, in screen order:
  - Heading **Customers & suppliers**, under it *"Customers are who you invoice. Suppliers are who
    invoices or receipts come from."*
  - Top right: **Download for a spreadsheet** (only when the list is not empty), then **Scan a
    customer** / **Scan a supplier** and **+ Add**.
  - Two tabs: **Customers** | **Suppliers**. The tab is in the address (`/clients?tab=supplier`),
    so a link can open either. **It is one table** — `clients` with `kind = 'client' | 'supplier'`
    — and the tab is the only thing separating them.
  - A tip, the first three times: *"Tip: photograph a business card, letterhead or invoice and the
    name, address, email and VAT number are filled in for you."*
  - **Duplicate cards**, one per suspected pair: *"**Travis Perkins** and **Travis Perkins Ltd**
    look like the same client: the same name."* with **Merge into Travis Perkins** and **They're
    different**.
  - Then a row per contact: the name (plus an **Archived** badge), and under it
    `Company · email · phone · VAT 123 4567 89 · Reminders off`. On the right, only the ones that
    apply: **Send a text** (needs a phone number), **Statement**, **Payment history** / **Hide**,
    **All invoices** (`/invoices?client=<id>`), **Edit**, **Archive** / **Unarchive**, **Remove**.
  - **Payment history** opens inline: each invoice as `INV-123 · 4 Mar 2026 · £1,200.00` with a
    status badge. The figure is **what the customer was actually asked for** — gross, incl. VAT,
    less any CIS the contractor keeps back, less credit notes — the "Amount due" on the document
    itself, not the line-item subtotal.
  - At the foot, **N archived** toggles them into view.
  - **Edit** turns the row into a form in place: Company / Individual radio, name (with the
    Companies House box for a company), Email, Address, then a 2-column grid of **VAT number**
    (with any kept HMRC references under it), Contact person, Phone, Payment terms, Default
    currency. Then, where they apply, **Send automatic payment reminders for invoices to them**
    and **They have told me in writing that they are an end user**. **Save** / **Cancel**.

- **What it does behind the scenes.**
  - Rows are `clients` (`src/lib/storage.ts`, `clientsStore`). The end-user tick is
    `clients.reverse_charge_end_user` (migration-039); the Companies House number is
    `clients.company_number` (migration-030).
  - **Remove really deletes** — the only such button in this area — and usually cannot: every
    foreign key into `clients` is `ON DELETE RESTRICT` (migrations 014/015), so anyone with an
    invoice, receipt, quote or recurring item is refused with *"Can't remove this customer or
    supplier — it still has receipts, invoices, quotes, or recurring items linked to it. Archive it
    instead…"*. It asks first either way.
  - **Archive** is the real escape hatch: hides them from every picker on new records and touches
    no history.
  - **Merging** (`clientsStore.mergeInto`, `src/lib/duplicateContacts.ts`): the pair is found when
    the names match once *Ltd*, punctuation and case are stripped, **or** the emails match, **or**
    the phone numbers match on at least 10 digits (leading `44` read as `0`). Same kind only — a
    customer and a supplier of one name are two sides of a trade, never a pair. The **fuller**
    record is the one kept (scored on how many of email, phone, address, VAT number, contact person
    are filled). The merge repoints `invoices`, `receipts`, `quotes`, `recurring_invoices`,
    `recurring_expenses.supplier_id` and `quote_request_suppliers.supplier_id`, then **archives**
    the duplicate — it is never deleted. It asks first, naming how many invoices move, and reports
    *"Merged into X: 7 records moved."*
  - **They're different** is remembered **on that device only** (`localStorage`,
    `clients-not-duplicates`). A new phone offers the pair again.
  - **Download for a spreadsheet** writes `customers-2026-09-28.csv` (or `suppliers-`) in the
    browser: name, type, email, address, vat_number, payment_terms, default_currency,
    contact_person. **The phone number is not in it.**
  - The reminder tick drives `/api/reminders/send` (the daily cron). The end-user tick is what
    switches the VAT reverse charge **off** for that customer (`src/lib/reverseCharge.ts`).

- **Where it takes you next.** `/clients/new?kind=…`, `/clients/new?kind=…&scan=1`,
  `/clients/<id>/statement`, `/invoices?client=<id>`, and whatever the **+ Add** sheet offers.

- **Free, gated or not built.** Behind sign-in. **Free — no model call, no paid API, no
  environment switch.** Two things on it depend on keys: the company-name lookup in the edit form
  needs `COMPANIES_HOUSE_API_KEY` (**set in production**), and the VAT box's HMRC half needs
  `HMRC_CLIENT_ID`/`HMRC_CLIENT_SECRET` (**not set in production** — see below).

---

## New customer / New supplier — `/clients/new`

- **What it is for.** Adding one contact, either by typing or by photographing anything with their
  details on it.

- **How you get there.** **+ Add** or **Scan a customer / Scan a supplier** on `/clients`; the
  dashboard's three buttons; *"Add a supplier first, with their email"* on the quote-request form.
  The address carries the shape: `?kind=supplier` makes it a supplier, `?person=1` opens on
  **Individual**, `?scan=1` opens the camera on arrival.

- **What is on it.**
  - Heading **New customer** / **New supplier**, same one-line explanation as the list.
  - A card with **Scan to fill in** (→ **Reading…** → **Scan again**), **Upload a photo or PDF**,
    and *"A business card, letterhead, invoice, email or any photo with their details. Names,
    addresses, emails and VAT numbers are picked out for you."* If the photo holds more than one
    business, chips appear under **Found on the page — tap the one you want**, and picking one
    re-fills the fields — but only the fields the last scan wrote, so anything you typed by hand
    survives.
  - The form: **Company** / **Individual**; **Company name** (register lookup) or **Full name**;
    **Email (optional)**; **Address (optional)**; **More details (optional)**, open by default,
    holding **VAT number**, **Contact person**, **Phone**, **Payment terms (e.g. 30 days)**,
    **Default currency (e.g. GBP)**. For a customer: **Send automatic payment reminders to this
    customer**, ticked by default. For a customer that is a company: **They have told me in writing
    that they are an end user**, with *"For CIS work, this is what means you charge them VAT as
    normal instead of the reverse charge. Only tick it if they have actually said so."*
  - **Save customer** / **Save supplier**, and **Clear form**.

- **What it does behind the scenes.** The scan is `POST /api/contact-scan` with the signed-in
  bearer token → `extractContacts` (`src/lib/contactExtraction.ts`), **Claude by default**
  (`claude-opus-5`, effort `low`) — note `/scan` defaults to Gemini and this one does not. A
  supplier form prefers the business that *issued* the document, a customer form the one it was
  *sent to*. On save, `clientsStore.add`, then the picked register entry is remembered on the
  device (`src/lib/companyRegister.ts`) and any HMRC reference is attached
  (`src/lib/keepVatCheck.ts`) — and if keeping the reference fails, it fails silently, because the
  contact is what was asked for.

- **Where it takes you next.** Saving returns to `/clients?tab=<kind>`.

- **Free, gated or not built.** Behind sign-in. **Typing is free. Scanning is not, twice over:**
  it is a paid Claude call on Atanas's key, limited to **60 an hour per account and 300 an hour
  across everyone**, files up to 10 MB — **and it spends one document from the account's scan
  allowance** (`allowScans`/`spendScans`, `src/lib/scanLimit.ts`). `SCAN_LIMITS` is **"on" in
  production**, so a business card read costs one of the day's 50 (300 in the first week). A failed
  read costs nothing.

---

## Statement — `/clients/<id>/statement`

- **What it is for.** Everything one customer has ever been invoiced, what they have paid, and
  what is still owed — one sheet to print, send or read down the phone when somebody asks *"what
  do I owe you?"*.

- **How you get there.** The **Statement** link on that contact's row in `/clients`, which appears
  only once they have at least one invoice. Nothing else links to it.

- **What is on it.** `← Customers & suppliers`, heading **Statement**, *"Everything Acme Ltd has
  been invoiced, and what's still owed."* Then a summary card: **Owing as at 28 Sep 2026** with the
  figure large; in amber, *"£1,080.00 of that is late, the oldest by 45 days (INV-118)"*; or
  *"Nothing outstanding."* Buttons: **Share (WhatsApp, Messages…)**, **Download PDF**, **Save as**
  (PDF, picture, smaller picture, Word, web page, plain text, spreadsheet), **Print**, **Copy the
  figures**.
  Then the sheet itself: *Statement of account*, the as-at date, your business name, address and
  VAT number top right, **For** and the customer's address, then a table —
  **Date | Invoice | Charged | Credited | Paid | Owing**, with *"45 days late"* under the number
  and *"£200.00 in credit"* in place of Owing where they have overpaid. **Total owing**, and **In
  your credit** when money is owed back. **How old it is**: four boxes, *Not yet late*, *1–30 days
  late*, *31–60 days late*, *Over 60 days late*. **How to pay** with your bank details, only when
  something is owed.

- **What it does behind the scenes.** `src/lib/statement.ts` (`buildStatement`, `statementText`),
  drawn by `src/components/StatementDocument.tsx`. Draft invoices are left out. Each line is the
  invoice page's own arithmetic — `invoiceCharge` for what is due (VAT in, CIS out), credit notes
  off that, payments off that, `invoiceBalance` for the balance — so the statement can never
  disagree with the document that was sent. An invoice marked paid by hand before payments existed
  owes nothing. Days late run from the due date to **today in Europe/London** (`todayISO()`). The
  ageing boxes mean exactly what they say: *Not yet late* holds only what is not yet late. The PDF
  is made in the browser from the printed sheet.

- **Where it takes you next.** Back to `/clients`. The share sheet and Save-as hand a file to the
  phone; nothing is emailed from here.

- **Free, gated or not built.** Behind sign-in. **Entirely free** — no AI, no API, no environment
  switch, nothing stored. **There is no "Email this statement" button**, although invoices and
  quotes both have one.

---

## Settings — `/settings`

- **What it is for.** Everything about you and your business that appears on documents, plus how
  you sort spending, plus your account and your data. One long page, fifteen sections.

- **How you get there.** **Settings** in the header (its own item, outside the three groups). The
  Save bar is sticky at the bottom.

- **What is on it, and what each setting actually changes.** Sections in screen order. The first
  eight are one form behind one **Save**; everything after the Save bar saves itself.

  1. **Heading and tip.** *"How it works: what you put here goes on every invoice you send — your
     business name, your address and your bank details. The VAT switch changes how new invoices are
     priced, and it never changes one you have already sent."*
  2. **Your business** (titled **About you** for personal use). *"Fill this in once."*
     - **What are you using this for?** — **A limited company** / **A sole trader** / **Personal
       use**. This does three things: it decides whether the registered-company block appears, it
       picks the **starting list of expense categories** (`src/lib/categories.ts` — the sole-trader
       list follows the self-assessment expense boxes; the limited list adds Salaries & PAYE,
       Pension contributions, Director's expenses, Client entertaining), and **Personal use hides
       the VAT, Invoice numbering, Bank details and Payment reminders cards entirely**.
     - **Business name** (or **Your name**) — the headline on every invoice, quote, reminder and
       statement. Typing offers matching Companies House companies.
     - **Registered company name** + **Company number** — shown when the kind is *limited* or
       either field is already filled, in a grey box explaining *"A limited company must print its
       registered name and number on its invoices."* They print **small at the foot** of the
       invoice (Companies Act 2006 s.82), and only when **both** are set. Typing a complete company
       number looks the name up by itself.
     - **Business address** — on documents, with the UK address lookup behind it.
     - **Logo** — **Add a logo** / **Change logo** / **Remove logo**, PNG/JPEG/WEBP. Uploaded the
       moment it is picked; kept on the profile when **Save** is pressed; removal asks first. Goes
       at the top of invoices and quotes. Hidden for personal use.
  3. **VAT** — a two-way switch, **Without VAT** | **With VAT**, and the **VAT number** box
     (disabled until *With VAT*, hint *"As it appears on your VAT certificate."*). The switch is
     what prices new invoices and quotes. It **never** changes a document already issued: the
     setting is stamped onto the invoice when it is numbered (`invoices.vat_registered`,
     migration-024) and onto a quote when it leaves draft (migration-033).
  4. **Invoice numbering** — *"The next invoice will be **INV-357358**."* **Prefix** and **Next
     number**. An amber warning if the next number is at or below the highest already used. Two
     subtleties: an untouched **Next number** writes back today's live value rather than the one
     the page loaded with (the counter moves on its own whenever an invoice is sent, possibly on
     another device), and numbers are sequential and never reused.
  5. **Bank details** — a free-text box, *"Printed on every invoice as 'How to pay'."* Also on
     reminders and on a statement where something is owed.
  6. **Expense categories** — the list used by receipts, expenses and the scanner. ▲▼ to reorder,
     type over a name to rename, **Remove**, **Add a category (e.g. Childcare)** + **Add**. If the
     list is missing any of the kind's own: *"The sole-trader list also has: …"* + **Add them**.
     **Reset to defaults**. At least one is required. **Removing a category leaves the receipts
     that used it exactly as they are** — the category is plain text on the row.
  7. **Payment reminders** — the schedule in words (*3 days before due, on the day, then 7, 14 and
     30 days after, each a little firmer*), a **How it works** fold-out, then five boxes, one per
     reminder, blank meaning "use the default wording". Tokens: `{{client_name}}`,
     `{{invoice_number}}`, `{{amount_due}}`, `{{due_date}}`, `{{pay_by}}`. Then **Tell business
     customers you can claim late-payment interest** — the Late Payment of Commercial Debts
     (Interest) Act 1998 line, printed at the foot of an invoice to a customer marked **Company**
     and repeated in the final reminder only; and **Gently remind me on the dashboard about overdue
     invoices**.
  8. **The Save bar** (sticky). **Save**, *"Unsaved changes."*, *"Saved."* Leaving with unsaved
     changes is caught — links, the header's **Sign out**, and the browser's Back — and the bar
     becomes *"You have unsaved changes."* with **Save and go** / **Leave without saving** /
     **Stay**. If the database is behind the code, it says so precisely: *"Saved, apart from what
     you're using the app for and the registered company details: those need a database update
     first. Everything else is in."*
  9. **What your account allows** (`PlanCard`, `src/components/ScansLeft.tsx`) — **the only place
     in the app that states the scan limit in full.** Today it reads either *"You are new, so you
     have a bigger allowance for your first week — 300 documents a day, to catch up on a pile of old
     paper"* or *"Free: 50 documents a day, and 600 in a month. Copying a document, changing a file
     and writing invoices by hand never count."* Then **Today** `12 of 50` and **This month**
     `139 of 600`, and *"If you run out this month, you can ask for another 600 once, free."* It
     reads the `scan_allowance()` database function and shows **nothing at all** if that fails.
     There is a `paid` branch that says *"You are on the paid plan. There is no limit…"* — **nothing
     in the app or the database can make an account paid**, so no one has ever seen it.
  10. **Tell a mate** (`InviteCard`) — **renders nothing today.** `NEXT_PUBLIC_INVITES` is not set.
      Built and the database work applied (migration-037): a **Send my link** button, the code shown
      underneath, and 300 extra documents each when the friend scans their first document.
  11. **How it looks** (`ThemePicker`) — **Follow my phone** plus five colours. Saves itself
      instantly, **on that device only** (localStorage, not the account). *"Invoices always print in
      plain ink, whichever colour you pick."*
  12. **Put Invoiceover on your phone** (`GetTheApp`) — an **Install it** button where the browser
      offers one, the three iPhone Share → Add to Home Screen steps otherwise, and nothing at all
      once it is installed.
  13. **Notifications** — **Turn on notifications** / **Turn off notifications**. On iPhone it
      refuses until the app is on the Home Screen and says why (Safari only delivers push to an
      installed app).
  14. **Email import** — your private address `u-••••••••••••@invoiceover.com` with **Show**,
      **Copy** and **Get a new address**, or **Get an address to email receipts to** if there isn't
      one. *"Treat this address like a password. Anyone who has it can send mail that creates
      receipts in your account."* A new address kills the old one instantly, and it asks first.
      Forwarded mail lands under **Needs review**, never straight in.
  15. **Your account** — *"You're signed in as …"*, then four labelled blocks: **Getting back in**
      (**Email me a sign-in link** — the same email as "forgotten my password", which signs the
      browser in and lands on `/reset-password`); **Where your data lives** (EU/Ireland, receipt
      photos through links that expire after seven days, the invoice and quote links the one
      exception); **Take it all with you** (**Download all my data** — one JSON file,
      `my-data-export-2026-09-28.json`, with the photographs inlined so nothing in it expires);
      **Closing the account** (*"There's no delete button anywhere in this app, on purpose… To have
      the account and everything in it removed, ask through Feedback and it's done by hand"*). Then
      **Sign out**.

- **Where it takes you next.** `/receipts/review` (from Email import), `/feedback` (from Closing
  the account), `/reset-password` (via the emailed link), and out of the app via **Sign out**.

- **Free, gated or not built.** Behind sign-in. **No model call anywhere on this page and no paid
  API.** Three things are switched: the company-name and company-number lookups need
  `COMPANIES_HOUSE_API_KEY` (**set in production** — without it they are plain boxes and nothing
  mentions a register); the VAT box's HMRC half needs the HMRC credentials (**not set in
  production**); **Tell a mate** needs `NEXT_PUBLIC_INVITES` (**not set** — invisible). The
  allowance card is live and real today.

---

## VAT — `/vat`

- **What it is for.** The five figures a VAT return asks for, worked out from the invoices and
  receipts already in the app, so they can be checked and copied into HMRC's own form. **It files
  nothing anywhere.**

- **How you get there.** Header → **Tools** → **VAT**. Also a **VAT** link on `/expenses`. The
  page's own back link says `← Expenses`.

- **What is on it.**
  - Heading **VAT**, *"The figures for a quarter, worked out from your invoices and receipts. Check
    them, then copy them into HMRC's form."* A tip: *"…Nothing is sent from here."*
  - If Settings says you are not VAT registered, a grey note: *"Settings says you're not VAT
    registered, so your invoices carry no VAT. The purchases below still show the VAT you were
    charged."*
  - A period card: pills **Last quarter** and **This quarter**, then **From** and **To** date
    boxes, then a two-way choice **By invoice date** | **When money moved** with the difference
    spelled out underneath.
  - The figures card, headed e.g. **Jan 2026 – Mar 2026**, with **Copy the figures**:
    - **Box 1** VAT due on sales
    - **Box 4** VAT you can reclaim on purchases
    - **Box 5** VAT to pay HMRC — or **VAT HMRC owes you** when it is the other way, shown as a
      positive number, in bold
    - **Box 6** Total sales, ex VAT
    - **Box 7** Total purchases, ex VAT
  - **What's in it** opens two lists: **Sales (n)** — invoice number, date, net and VAT, credit
    notes appearing as *"Credit against INV-118"* with negative figures — and **Purchases (n)** —
    supplier, date, net and VAT.
  - A note when the cash basis could only count a credit note in part.
  - Small print: *"A summary to check, not a filing: nothing here is sent to HMRC. Documents still
    waiting to be reviewed are left out, and anything on a margin or reverse-charge scheme needs
    checking by hand. On cash accounting, a CIS deduction counts as money received…"*

- **What it does behind the scenes.** All of it is `src/lib/vatReturn.ts` (`vatFigures`,
  `quarterOf`, `previousQuarter`, `quarterLabel`), priced by the same rules as the invoice page
  (`computeInvoiceTotals`, `invoiceVat`, `invoiceCharge`). The two bases really differ:
  - **By invoice date** (standard accounting): the whole invoice counts in the period it is dated,
    paid or not. A credit note reverses in full.
  - **When money moved** (cash accounting): only payments that landed inside the period count,
    split into net and VAT in the invoice's own proportion. **A CIS deduction is scaled back up**
    (`× total / due`) because the contractor paying HMRC on your behalf is still part of the
    consideration — without that, every CIS invoice would under-declare VAT for ever, since no
    later payment arrives to pick the rest up. A credit note only counts in proportion to what was
    actually received, and the page says so rather than quietly showing a different number.
  - Purchases are counted **by the date on the receipt on both bases** (the page says to check
    anything not yet paid for). Draft invoices and receipts still in **Needs review** are excluded.
    `receipts.amount` is already net, and a credit note is stored negative, so both simply add up.
  - Quarters offered are **calendar quarters**. A business on one of HMRC's other staggers has to
    set From and To by hand.

- **Where it takes you next.** `/expenses`. Nothing else; the copy button puts the figures on the
  clipboard.

- **Free, gated or not built.** Behind sign-in. **Free, no AI, no API, no environment switch,
  nothing stored.** **Not built, and worth being clear about:** there is no filing of any kind —
  no Making Tax Digital, no HMRC submission, no VAT registration — and **boxes 2, 3, 8 and 9 are
  not produced at all** (the page shows 1, 4, 5, 6, 7), so anybody with EC acquisitions or
  Northern Ireland movements has gaps to fill in themselves. The page does not say that.

---

## Check a company — `/check-company`

- **What it is for.** Typing a company's name or number and getting, in plain English, what
  Companies House holds: whether it is real, still trading, filing on time, who runs it, who owns
  it, whether anything it owns is pledged against borrowing, and whether it has been insolvent
  before. The moment for it is **before** you price a job.

- **How you get there.** Header → **Tools** → **Check a company**. A tile on the dashboard, put
  deliberately next to **Write a quote** (*"so people can check companies before they send the
  quotation"*). A line on the Free-invoice page: *"New customer? **Check the company** first."*
  And from the quote form, which links straight to `/check-company?number=12345678` for the
  customer it has.

- **What is on it.**
  - Heading **What is the company called?** — the biggest type in the app — and *"See if it is
    real, still trading, and who runs it. Free, nothing to join."*
  - One box, labelled **Company name, or its number**, placeholder *"Smith Building Ltd, or
    01234567"*, and a **Check** button (**Checking…** while it works). Under it: *"Not sure of the
    spelling? Type what you have. We show the close matches."* and *"Only limited companies are on
    the register. A sole trader won't be found here."*
  - Several names matching: **One match** / **N matches**, *"Pick the one you mean."*, each row
    showing the name, `Company 12345678 · active · since 4 March 2011` and the address.
  - The report, as a stack of cards: the name with **status / status detail / type** badges and
    company number, incorporation date and age; **What this means** — the plain-English lines
    (*"Dissolved on 3 June 2024 — this company no longer exists"*, *"Accounts are overdue by four
    months — they were due 30 April 2026"*, *"The confirmation statement, which says who runs and
    owns the company, is overdue"*, *"Three charges outstanding: something the company owns is
    pledged as security for borrowing"*, *"Companies House records a disqualification against an
    officer of this company"*); **Registered office** with its own warnings (*a dispute about this
    address*, *post has come back undelivered*, *this is a PO Box, not a place you can visit*,
    *this is a well-known company formation address*); **What it says it does** (SIC codes in
    words); **Previous names**; **Filings** (Accounts and Confirmation statement, each with last
    filed, next period, next due and an **Overdue by …** badge); **Officers**; **Who owns and
    controls it**; **Charges**; **Insolvency history**; **Website and social media** — *"Companies
    House holds none of these, so these are searches, not checks"*, seven prepared searches
    (Website, Reviews, Trustpilot, LinkedIn, Facebook, Instagram, X).
  - At the foot: **Copy the report**, **Share**, **View on Companies House**, **Check another**, a
    line naming anything that could not be loaded this time, and *"From the public Companies House
    register, read 28 September 2026."*
  - Refusals, all with a **Search at Companies House** link beside them: *"No company with that
    name is listed. Check the spelling, or type the company number."*, *"No company has that
    number. Check it against the paperwork."*, *"Too many checks from this connection in the last
    hour…"*, *"Companies House isn't answering just now. Try again in a minute…"*. With no API key
    the button becomes a link to Companies House and a card says **This check is coming soon**.

- **What it does behind the scenes.** `GET /api/company-check?q=` or `?number=`. A report is up to
  **five** upstream calls — profile, officers, people with significant control, and charges and
  insolvency only when the profile says there are any — built into plain English by
  `src/lib/companyReportBuild.ts` against Companies House's own enumerations
  (`src/lib/companyHouseTerms.ts`). Limits: **40 searches an hour per connection, 600 an hour
  overall; 20 reports an hour per connection, 300 an hour overall**; answers cached in the running
  function's memory for 10 minutes (search) and 15 minutes (report). The number goes into the
  address bar, so a report can be reloaded or sent to somebody. **Nothing about the company is
  stored** — no row, no history. A 404 on officers or charges means "none filed", which is an
  answer; anything else is listed as *couldn't load*, so the page never claims there are none.

- **Where it takes you next.** `/check-company?number=…` (itself), Companies House and the
  prepared searches in a new tab.

- **Free, gated or not built.** **This is the sharpest mismatch in my area.** The Companies House
  API is free and the key **is set in production** (checked live on 2026-09-28:
  `/api/company-check` answers `{"configured":true}`). The page costs nothing per use — no AI, no
  paid API. **But it is behind sign-in.** `/check-company` is not in the Gate's public list
  (`src/app/AppShell.tsx`), so a stranger lands on `/login` — while the page's own heading says
  *"Free, nothing to join"*, its `<title>` is *"Check a UK company — free Companies House lookup"*,
  and its search description was carefully rewritten away from "no account needed" for exactly
  this reason. The description was fixed; the heading was not.

---

## The two boxes that appear everywhere

Not pages, but they decide what the whole area can do.

### The Companies House name box — `CompanyNameInput`

- **Where it appears.** Settings (business name, registered company name), the new and edit
  customer/supplier forms, the Free-invoice page's business and customer fields, the quote customer
  picker. Its sibling `CompanyNumberInput` is in Settings only.
- **What it does.** Typing three or more letters lists matching companies (name, number, *since
  Mar 2011*, address, and a note if the status is anything but active). Picking one fills the name
  and keeps the company number; it fills the **address** when the address box is empty, and only
  *offers* it when something is already there (*"Registered office: … **Use this address**"*),
  because a registered office is often an accountant's. Change the name after picking and the
  number is dropped — otherwise a later check would report on a company you have nothing to do
  with, under the right name. Keyboard and screen-reader complete (combobox, arrow keys, Escape).
  On the new-contact form a note appears under the box: *"Company 12345678 on the Companies House
  register."*, or "not on the register" — but only when the name looks like a company, since most
  suppliers are sole traders and that note about a plumber is noise.
- **Behind it.** `GET /api/company-search`, 60 per five minutes per connection, 120 (signed out) /
  180 (signed in) per five minutes overall — deliberately half the key's own 600-per-five-minutes
  so the free page cannot use up what account holders need. Plain search is **active companies
  only**, so a pick can never be a dead company; `scope=all` (used when checking a name already on
  a document) includes dissolved ones. Ten-minute cache.
- **Switch.** `COMPANIES_HOUSE_API_KEY`. **Set in production.** Without it every one of these is a
  plain text box and the app says nothing at all about any register. It is free.

### The VAT number box — `VatNumberInput`

- **Where it appears.** Settings (your own number, disabled until *With VAT*), the new and edit
  customer/supplier forms, the quote customer picker.
- **Two halves, and the first always works.** A UK VAT number carries its own check digits, so a
  typo is caught **on the device, asking nobody** (`src/lib/vatNumber.ts`: mod 97 **and** mod 97-55,
  both in circulation). It says *"Those 9 numbers don't add up, so one of them is probably typed
  wrong. Check it against the paperwork."*, *"A UK VAT number has 9 numbers, and this has 8."*,
  *"That looks like a VAT number from another country. This box takes a UK one."*, *"That is a
  government department's number."* It waits 700 ms so nobody is told they are wrong after three
  digits, tidies the number to `GB 220 4302 31` when you leave the box, and **never refuses a
  save** — the paperwork in somebody's hand is a better authority.
- **The second half is HMRC, and it is off.** With credentials the box says *"Checking it with
  HMRC…"* then *"HMRC has this as Acme Builders Ltd, 4 Mill Lane, SE18 1HU."*, or *"HMRC has
  nobody registered with that number. Check it against the paperwork."*, or *"Couldn't check it
  with HMRC just now. The number itself adds up."* Plus, when the name typed alongside differs:
  *"That is a different name from the one above, so check you have the right number."* **Without
  credentials it says only *"That number adds up."*** and HMRC is never mentioned.
- **The consultation number — the one thing here nothing else on the market offers.** Send HMRC
  *their* VAT number and *yours* together and HMRC return a dated reference proving you made the
  check. That is the evidence HMRC ask for if they ever query VAT you reclaimed against a supplier
  who turns out not to have been registered. The box shows it: *"HMRC's reference for this check is
  ABC123, made 25 September 2026. Keep it with your records: it is what proves you checked."* It is
  kept in `vat_checks` (migration-038, applied) after the contact is saved, **one row per number
  per day**, the day reckoned in Europe/London; the table grants insert and select and **no update
  or delete**, because evidence you can quietly edit is not evidence. History keys on the **number**,
  not the contact, since a number is usually checked before the contact exists. `KeptVatChecks`
  shows the newest under the box (*"Checked with HMRC on 25 September 2026, who had it as Acme
  Builders Ltd. Reference ABC123. 2 earlier checks, back to 3 September 2026."*). Your own number
  is only sent **once somebody has actually typed in the box** — a consultation lookup is never
  cached, so merely opening thirty edit panels used to burn the hourly limit on references nobody
  kept.
- **Behind it.** `GET /api/vat-check`, HMRC's *Check a UK VAT number* API **version 2.0 only**
  (version 1 was removed in February 2025), 30 an hour per connection, 300 an hour overall.
  The plain answer is cached six hours; **a consultation number never is**. A 403 on the
  two-number form means *our* number was refused, not theirs, so it falls back to the plain lookup
  rather than telling somebody nothing.
- **Switch.** `HMRC_CLIENT_ID` and `HMRC_CLIENT_SECRET`. **Not set in production** (checked live on
  2026-09-28: `/api/vat-check` answers `{"configured":false}`). So **on the live site nobody has
  ever seen an HMRC answer or been issued a consultation number, and `vat_checks` is empty.** The
  sandbox is set up and works, but only on this Mac (`HMRC_API_BASE` points at
  `test-api.service.hmrc.gov.uk`), and only **726129090** of HMRC's forty published test numbers
  passes the real check digits, so it is the only number the sandbox can be exercised with.
  Production access needs a production application on HMRC's Developer Hub and Terms of Use 2.0,
  which HMRC review in **up to 10 working days** — about two weeks end to end.

---

## Worth deciding

1. **Is "Check a company" the shop window or an inside tool?** It is free to run, it needs no
   account to be useful, its title and description are written to be found in a search, and its own
   heading says *"Free, nothing to join"* — but a stranger who clicks that search result is sent to
   `/login`. Either make `/check-company` public (it is the one page in the app that could be, at
   zero cost per use) or change the heading. Which?
2. **Should reading a business card cost a receipt?** "Scan to fill in" on a new customer or
   supplier spends one document out of the 50 a day, the same as a supplier invoice — and it runs on
   Claude, the expensive reader, while `/scan` defaults to Gemini. Own allowance, free, or leave it
   counted?
3. **Do we spend two weeks getting HMRC production credentials?** The consultation number is
   genuinely unmatched (nothing in the competitor notes offers it) and is the sort of thing an
   accountant tells a tradesman to keep. Is it a free feature, the first real reason to pay, or not
   worth two weeks?
4. **If a paid tier arrives, does anything in this area sit behind it?** Today: nothing. The only
   live limit anywhere is on reading documents. Candidates, if you wanted any: the HMRC check and its
   kept references, the company report, the customer statement, data export.
5. **Is "Personal use" a product?** Picking it hides VAT, invoice numbering, bank details and
   payment reminders, leaving a spending tracker with a category list. Is that a deliberate second
   audience, or should the option go?
6. **Should the statement be emailable?** It can be printed, shared, saved as seven kinds of file
   and copied as text — but invoices and quotes can be emailed with the PDF attached and this
   cannot, which is odd for the one document whose whole job is chasing money.
7. **Does the VAT page ever file?** It produces boxes 1, 4, 5, 6 and 7 and says plainly that
   nothing is sent to HMRC. Making Tax Digital is a certification exercise, not an afternoon. Stay a
   copy-out sheet — and if so, should it say out loud that boxes 2, 3, 8 and 9 are yours to fill and
   that only calendar quarters are offered?
8. **Should the "how it looks" choice and the "they're different" list follow the account?** Both
   live on the device. A new phone comes back to the default colour and re-offers every duplicate
   pair you already dismissed.
9. **Should a customer and a supplier of the same name be offered as a pair?** They are deliberately
   never merged — right, since one is sales and one is purchases — but nothing in the app says
   *"these two records are the same firm"*, and a builder's merchant is usually both.
10. **Invites: on or off for the trial?** `NEXT_PUBLIC_INVITES` is one variable away, the database
    work is done, and the reward is 300 extra documents each — which only means anything because the
    scan limit is real. Turning it on turns the limit into a thing people talk about.
11. **Is Settings too long?** Fifteen sections on one page, eight of them behind one Save button and
    seven saving themselves. The account, data and theme half could be its own page.
12. **Small, and cheap to fix if he wants it:** the customers/suppliers spreadsheet download leaves
    out the phone number.


---

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


---

