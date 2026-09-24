# What he saw when he used it (2026-09-24, after the first build)

Taken down from his own words. Ordered by where it is on the screen, not by size of job.

## The upload panel

1. **Photos and Files both open the same three-way sheet** — "Photo Library, Take Photo,
   Choose Files" — instead of going straight where the button says. He is right that it
   should go straight there. **To check honestly how far that is possible**: on an iPhone
   that sheet is iOS's own, shown for any input that accepts images, and a web page cannot
   dismiss it. Where the accepted types exclude images it goes straight to the Files
   browser. So Files can probably be made direct; Photos on iOS may not be, and if it is
   not, say so rather than quietly leave it.
2. **The import address should already exist.** *"Can the system create automatically an
   email to give to the user... so when they click on it, the email is ready."* Today it is
   null until somebody goes to Settings and makes one — which nobody will. Make it on first
   use, silently.

## The file library

3. **The roller's boxes are too big.** Make them smaller.
4. **The Year column skips years with nothing in them**, and he is unsure about it: *"people
   would think why — but there's no data there."* My call, and it matches what was already
   decided for days: **run the years continuously** from the earliest record to this one, so
   there is no gap to wonder about. A dial that skips loses your place; a year with nothing
   in it is an answer.

## The three panels

5. **Wrong order.** It should be **Receipts & bills**, then **Invoices & customers**, then
   **Invoices sent**. Money out first: that is what a driver is doing all day.
6. **The panels are too different in height.** Squeeze Invoices & customers.
7. **Owed to you / Overdue / Spent this month** should be **three squares on one line**, not
   three rectangles stacked.
8. **Awaiting payment** stays a small box that scrolls — but **tapping it should let several
   be marked paid at once**: all of them, or everything from one company.
9. **Who you work with** should hold **three kinds: company, customer and supplier** — not
   two. A delivery driver scanning receipts needs the company he works for in the same list.

## The two cards that are too big for what they say

10. **"No tax this year so far"** is too big for one line of text. Shrink it — and put the
    same thing on **Receipts & bills**, so each panel carries its own total rather than one
    card trying to speak for both.
11. **"This month so far"** the same: one short line, *spend excluding VAT, and the VAT on
    those costs*.

## The thread running through all of it

Every one of these is the same complaint: **a box that is bigger than what it has to say.**
He is not asking for less information — he is asking for the same information to stop
shouting. That is the rule to hold to while changing any of it.


---

## What got done (2026-09-24)

All eleven, plus a bug none of them were about.

| | |
|---|---|
| 1. Photos / Files going straight there | **Files: done** — an input that does not accept images skips iOS's sheet. **Photos on iPhone: cannot be done**, and that is written into the code rather than left hopeful. `accept="image/*"` is the very thing that makes iOS offer Take Photo and Choose File, and a web page cannot dismiss that sheet. On Android and a laptop it goes straight to pictures. |
| 2. Import address made automatically | **Done** — made on the first tap, silently. |
| 3. Roller boxes too big | **Done** — smaller rows, shorter columns. |
| 4. Years skipping | **Done** — they run continuously now. He was right to doubt it. |
| 5. Panel order | **Done** — Receipts & bills, Invoices & customers, Invoices sent, and somebody new lands on the first. |
| 6. Panels too different in height | **Done** — mostly by 7 and 10 and 11 below. |
| 7. Three squares on one line | **Done.** |
| 8. Mark several paid | **Done** — all of them, or everything from one company, with the button saying how many and how much. |
| 9. Company, customer and supplier | **Done** — three labels, three ways to add. |
| 10. Tax card too big | **Done** — one line when there is nothing to report or it is too early. |
| 11. "This month so far" too big | **Done** — one line. |

### And the thing none of it was about

Every scanned receipt on the dashboard linked to **`/receipts/<id>`, a route that does not
exist**. Tapping one was a 404, and had been for as long as that panel has existed.

It surfaced only because Receipts & bills became the first panel, so Next began prefetching
those links on load — and the prefetch never finished, so the page never reached
network-idle, so the whole dashboard suite timed out on its first navigation. **A dead link
found by a test that could not load the page.**

Both it and the file strip now point at `/receipts`, which exists.

**Worth doing, not done:** there is no page for a single receipt at all, so the list is the
best that can be offered. A `?open=<id>` on the list that scrolls to and highlights one
would be better, and is a small job.
