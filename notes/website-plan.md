# The website (started 2026-10-22)

Atanas: *"we also need to think about the website and start building it"*, with email and
the rest later. Launch target 5 November; the flyers' QR codes open it.

## One site, not two

The website lives **in the app, at the same address** (invoiceover.com once the domain
moves), as public pages beside the front door. A separate site (Webflow, Framer, a second
Vercel project) would mean a second design to keep in step, a second deploy, a second
place for the words to go stale, and a hop between "the website" and "the app" that a
driver on a phone at a depot will not make. Same colours, same dark mode, same sign-in card
one tap away.

The front door (`/`) stays a door: the promise, three lines, sign in. That is Atanas's rule
and `test-first-page` pins it. The website is the pages a stranger can reach *from* it.

## Pages

| Address | For | What is on it |
|---|---|---|
| `/` | everyone | unchanged: the promise, three lines, sign in |
| `/features` | someone comparing apps | what it does, one screen at a time, each with a real picture of the app |
| `/pricing` | "what's the catch?" | Free. What that includes, the scan allowance said plainly, no card |
| `/drivers` | the flyer at the depot | couriers' receipts, mileage at HMRC's rates, Self Assessment, put it on your phone |
| `/faq` | the doubts | free? my data? iPhone? accountant? leaving with my data? |
| `/how-to-invoice` | search | exists |
| `/help/home-screen` | install | exists |

A stranger's header gets the way round: **What it does · Free · For drivers · Sign in**.
The flyer's QR goes to `/drivers?from=<depot>`; the tag is kept on any page, so nothing
about the flyer codes changes.

## Rules for the words

- Every line true **today**. No card payments the app does not take, no "for ever" on free,
  no "MTD-ready" (it files nothing).
- The pictures are the app itself, taken by the harness against a made-up account
  (`harness/shots-site.mjs`), so a screen that changes can be retaken in one run rather
  than drifting from what people actually get.
- Phone first: most people arrive from a QR code.

## Later (not now)

The email side: a hello@ address (today EVERY address at invoiceover.com goes to the receipt importer Worker, so one has to be routed to a mailbox before any page shows it), support@, a blog, Google Search
Console and the sitemap submitted, reviews/testimonials once there are real users.
