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
