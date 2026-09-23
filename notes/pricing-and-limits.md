# What free gets, what costs money

Atanas, 2026-09-23 02:0x, in his own words and kept whole. Nothing here is built. The
paywall itself is item 56 on `notes/tonight-list.md` and still waits for payments; this
file is the thinking behind the numbers when it comes.

## What he wants

- **"I wanna give them more free scans like 10 a day"** — a *daily* allowance, not a
  monthly one, "and that way not all will use all they're scans per day". The point is
  generosity that costs little: an unused day is not carried over, so a 10-a-day cap is
  cheaper in practice than a monthly cap that everyone spends to the last.
- **"we can start with up to 300 scans per day at first few days"** — a big allowance at
  the beginning. *Ambiguous, not guessed:* this could mean the first few days of the whole
  app, or the first few days of each new account. The second is the one that earns
  loyalty, and it is what a "welcome" burst usually means — to be settled with him.
- **"maybe we can give them more per day if possible for people who actually need it so we
  keep them attached and we compensate with people who don't use all their daily scans"** —
  the averaging argument, and it is correct: the cost is the *mean* usage, not the cap.
  A busy tradesman who needs 40 in a day is paid for by the hundreds who scan two.
- **"We can store photos for less time and less photos if needed"** — storage is the lever
  to pull before scanning is cut.
- **"with an option for automatic sending everything over the email before it's deleted"** —
  before a photo ages out, email it to the owner so nothing is ever really lost. The pieces
  exist: `/api/send-document` already sends a PDF, and `src/lib/documentPdf.ts` already
  builds one from many pages.
- **"Even if we have to pay a little extra per month once we have many users that's fine"** —
  he will carry a bigger bill rather than squeeze people, once there are users to squeeze.
- Earlier the same night: free at first even at a little cost, a small charge for extra
  storage, then real money when the whole paid app launches.

## The maths behind it

Estimates, to be checked against the first real bills — no month of live billing exists yet.

- **Scanning is cheap.** Gemini flash-lite on one document is a fraction of a penny. Ten a
  day, every day, spent in full, is pennies a month per person; the real average will be a
  tenth of that. Scanning is not what costs money, so it is the wrong place to be mean.
  (Claude is many times dearer per document — the default engine for `/scan` is Gemini, and
  should stay that way for free accounts.)
- **Storage is also cheap, but it never stops.** A receipt photo is a few hundred KB, so a
  thousand of them is well under a pound a month. The bill grows every month and never
  falls, which is why his 90-day-then-email idea is the right shape: the *record* (amount,
  VAT, supplier, date — what HMRC wants) stays for ever in the database and costs almost
  nothing; only the photograph ages out, and it leaves by email first.
- **The fixed bill is what bites early:** Vercel's free plan forbids commercial use, so
  charging anything means their paid plan; Supabase's paid plan follows when the free
  limits go. Call it £35–45 a month before a single user pays, and it barely moves until
  there are thousands of them.

## The shape this suggests

1. Free: **10 scans a day**, a bigger welcome allowance at the start, photos kept 90 days
   and emailed before they go, everything else in the app open.
2. Someone who consistently needs more gets more rather than a wall — cheaper than losing
   them, and it is what he asked for.
3. Paid: unlimited scans, photos kept for ever, for a few pounds a month.
4. Extra scans over the daily cap sold in small amounts, for the rare heavy day.

## Settled 2026-09-23 02:2x

- **Scans: 300 a day for a new account at the start, then 50 a day for everyone.** (Numbers
  finalised below.) His
  words: "300 a day at first, but then is it a rational idea to do 50 a day for everyone?"
  It is rational. The cost is the average and the average will be two or three; 50 is a
  wall that only an abuser meets. Keep a quiet overall ceiling underneath it so one person
  cannot run 1,500 documents a month through as a free reader — a cap nobody honest ever
  sees. Settled at 600 a month, with one top-up.
- **One email, at the moment of deletion, carrying everything that is going.** Not per
  document and not a weekly digest: the photos that are ageing out are gathered into one
  PDF and sent once, then removed. "How to email only when you once when you deleting the
  photos."
- **Retention shortens over time.** Start generous and cut it as the bill grows: "at some
  point we don't need photos, so we might decrease and decrease the time of the photos".
  The record — amount, VAT, supplier, date — never goes.
- **Budget: up to £100 a month at the beginning**, and that figure includes advertising,
  not just hosting. Running costs are £35-45 of it, which leaves real room.
- **Promotion is a conversation he wants to have** — an Instagram page was his first
  thought, "and other solutions". Not decided, not started.

## The free tier, decided 2026-09-23 02:3x

- **300 scans** in the first few days of a new account.
- Then **50 a day**, and **600 a month** — his own numbers, raised from 400 because "we are
  generous enough".
- **One self-serve top-up.** Someone who reaches the 600 sees a button, clicks it, and gets
  another 600 for that month. Once a month, and once only: "just so he knows, but we are
  generous enough". The point is that the wall exists and is visible, and that nobody is
  ever stopped dead the first time they meet it. The most a free account can cost is
  therefore 1,200 documents in a month, which is pennies.
- **Photos kept three months at most**, then emailed in one PDF and deleted, and shortened
  further when the bill needs it. Not twelve: "we don't need to keep 12 months".
- **The record is kept for ever** — amount, VAT, supplier, date. Only the picture ages out.
- Paid, for very little money: more scans and more invoices.

## Stopping abuse

Atanas, 2026-09-23 02:4x: "not too many users from the same ip registered in the same ip
for a week or more time if needed like a month", and "think of other options to protect
from people who are abusing it".

**A limit per address, with its eyes open.** One internet address is not one person: a
building site, a café, an office, a whole block of flats and most phone networks put
hundreds of people behind one. A hard limit of one or two accounts a week would quietly
lock out a real crew sharing a van's hotspot, and they would never know why. So: a few
accounts a week per address, not one, and a way back in that a human can see — a message
that says what happened and offers to email, rather than a dead end. The count is kept per
address with the date, and the window is a week to start, a month if the abuse is real.

**Worth more than the address limit, in rough order of how much they help:**

1. **A box that proves they are a person** on the sign-up form — Cloudflare Turnstile is
   free, invisible to almost everyone, and stops scripted sign-ups outright. This is the
   single biggest win and costs nothing.
2. **The confirmation email already does a lot** — an account that never confirms can be
   given nothing at all. The 300-scan welcome should start only once the email is
   confirmed, not at sign-up.
3. **Refuse throwaway addresses.** A list of the known temporary-mail domains, checked at
   sign-up. Cheap, and it removes the easiest way to make a hundred accounts.
4. **The caps themselves are the real defence** — 50 a day, 600 a month, one top-up. Even
   a person who beats everything above gets 1,200 documents, which costs pennies.
5. **Watch the shape of use, not just the count.** The same document scanned again and
   again, or a burst at machine speed, is not a tradesman. Flag it for a look rather than
   blocking automatically; the app already counts every scan through `hit_rate_limit`.
6. **A card for the paid tier only.** Anyone who wants more than free pays, and a card is
   the strongest identity check there is — without asking anything of honest free users.
7. **Datacentre and VPN addresses** can be refused at sign-up. Real customers are on home
   and mobile connections.

What not to do: block by address alone, or silently. The cost of turning away a real
tradesman is far higher than the cost of a few hundred free scans.

## Still to settle


- How it is promoted, and what the advertising share of the £100 buys.
- Apple requires in-app purchase for anything digital and in-app account deletion; both
  fight the current rules. Decide before wrapping for the stores, not after.
