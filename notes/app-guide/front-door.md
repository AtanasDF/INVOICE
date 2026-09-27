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
