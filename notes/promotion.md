# Getting people to the app

**The delivery drivers are the customer the app is built for first** (Atanas, 2026-09-23:
"the depot is our customers for sure and it's made for them first"). That is a product
decision, not only a marketing one: when a choice has to be made about wording, defaults or
what goes on a screen, it is made for a self-employed driver with a glovebox full of fuel
and parking receipts — not for an accountant, and not for a limited company.

Atanas, 2026-09-23 03:3x, his plan in his own words. Nothing here is built or booked.

## The depots — his brother

His brother is a delivery driver out of **Carlisle** and "covers quite a lot" of depots —
Skido, and drivers working for DHL, Amazon "and so on. A lot, a lot, a lot of companies."
The plan: **printed flyers left at the depots**, carrying a code people scan with a phone
that takes them to the website, where they install the app.

Why this is a better idea than it first looks: every one of those drivers is
self-employed, files a Self Assessment, and keeps fuel and parking receipts in a glovebox.
They are exactly who the app is for, not a general audience. And, as he puts it, "they talk
a lot and there's free apps and they will talk" — a depot is a room full of people with the
same tax problem who see each other daily. Word of mouth there is worth more than paid
advertising anywhere else.

## London

Flyers "all over London as well", possibly paying someone to hand them out. Slower and
dearer per person than the depots, and to a crowd with no common problem — worth doing
**after** the depots prove the flyer works, not alongside.

## What a flyer actually needs

- A **QR code**, which is the "barcode to scan" he means. It opens the website.
- **A different code per place** (agreed 2026-09-23: "we can do the different code too").
  **Built 2026-09-23:** a flyer points at `invoiceover.com/?from=carlisle-dhl`; the tag is
  kept on the device the moment they arrive and rides along on the account when they sign
  up, as `came_from` in the user's own metadata. No table, no migration, nothing personal
  — just one short tag, cleaned to letters, digits and dashes so the address bar cannot be
  used to store anything else. The first flyer wins: a later code is someone who was
  already here. He reads it in Supabase under Authentication → Users., so the address it opens says where it came from
  (`invoiceover.com/?from=carlisle-dhl`). Without that he is paying for flyers with no idea
  which depot worked. This is the cheapest thing on the whole list and the easiest to
  forget.
- A page that **knows it came from a flyer**: short, no wall of text, and the install steps
  for the phone it is being read on (see "Get the app" in `notes/launch-plan.md`).
- One sentence on what it is. Not features.

## Invite a friend

His ask: "maybe we can give them some bonus for inviting friends, yeah, add that."

It fits the depots perfectly, since the whole plan rests on drivers telling each other.
The shape that costs almost nothing: **both sides get extra scans** — the inviter and the
invited. Scans are pennies, so generosity here is nearly free, and it rewards exactly the
behaviour the flyers are trying to start.

Guard it: the reward lands only once the invited person has **confirmed their email and
actually scanned something**, never at sign-up. Otherwise it is a machine for making fake
accounts, and it would undo the protections in `notes/pricing-and-limits.md`.

**Agreed 2026-09-23:** the reward lands only after the invited person confirms their email
*and* scans something. Still to settle: what the bonus is (a month of paid? a few hundred
scans?), and whether there is a cap per person.

## The order he wants

"Make it as beautiful as possible, for free" first, paid options discussed from the
beginning, and "once all that is done and running perfectly, we try and make money instead
of losing money, and in the meantime, building the rest of the page."
