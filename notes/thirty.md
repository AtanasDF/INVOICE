# Thirty things to fix (2026-09-24)

Atanas: *"make yourself a list of 30 things to fix and go for it... start testing everything
and if you find something, fix it."*

Not a wish list. Every line is either a fault already measured, or a screen nobody has ever
pressed the buttons on. Ordered by what would embarrass us most if a real person found it.

## A. Things known to be wrong right now

1. **[done]** **Errors never say which field they belong to.** `aria-invalid` is used **0 times**
   across 190 inputs, `aria-describedby` once, while `role="alert"` is used 79 times. A
   screen reader hears the words and never learns which box to fix. Biggest real failure.
2. **[done]** **Controls too small to hit** — six pages, all failing, all fixed. — under WCAG's 24 px floor. Cold hands, small target.
3. **[done]** **`autocomplete` was on ~20 of 190 inputs**, nine of them `"off"` — phones could
   not fill in a name, an address or a postcode. `test-autocomplete` (11 checks).
4. **[done]** **Dark mode has never been contrast-tested.** `test-readable` covers five themes; there
   are six.
5. **[done]** **Two comments now say the opposite of the truth** — `globals.css` and
   `test-dark-mode.mjs` both still claim the app is light-only.
6. **[done]** **No page for a single receipt.** `/receipts?open=<id>` now scrolls to that row,
   rings it for four seconds and opens its details; a missing id says so. `test-open-receipt`
   (14 checks). The dashboard had been linking to `/receipts/<id>`, a 404.
7. **[done]** **"client" and "customer" were used for the same thing.** Customer everywhere a
   person reads it; `client` kept in code, column and URLs. `test-vocabulary` (14 checks) walks
   twelve screens. Two words kept on purpose: `{{client_name}}` and "Client entertaining".
8. **[done]** **Twenty-three routes shared one `<title>`** — Next's announcer says nothing on a
   route change when two pages share one. `test-page-titles` (5 checks).

## B. Suites that exist and never run

9. **[done]** `test-settings-add` — now 38/38. Two faults, not one: its own catch block called
   `page.url().catch()` (url() is synchronous, so the handler threw and took the tally with it,
   and run-all.sh saw a suite with no result), and it drove the dashboard's Add sheet, removed
   on 2026-09-23 — the same suite asserts its absence fifty lines earlier. What it then found
   was real: with the camera blocked on an iPhone, the scan page gave no way to scan at all.
10. **[done]** `test-deposits` — 17/17. One line: the customer used to be a `<select>` and is
    a CustomerPicker radiogroup now, so clientId stayed empty and every save stopped at
    "Pick who the quote is for" long before a deposit rule was reached.
11. **[done]** `test-free-quote` — 13/13, two checks more than it had. It signed in half way
    down, which was fine while /free-invoice was public; the quote number moved behind "Add
    more details"; and the import offers a prefilled new-customer panel, not an "Add as a
    client" button.
12. **[done]** `test-quote-requests` — 82/82. The only suite that needs the **server** pointed
    at its mock, not just the browser: the send route checks the token server-side. It starts
    its own dev server on 3305 now and is in DEV_SERVER. Four more faults underneath.
13. **[done]** `test-quotes-ux` — 48/48 (the picker heading, the address block, and the "Use
    <postcode> as typed" row). `test-quotes-fixes` was already 11/11 and needed nothing.

## C. The four questions, on every screen never asked them

*Does a machine's words reach a person? Is a once-only action guarded only by `disabled`?
Does any state outlive what it describes? Is there a way on after success **and** failure?*

14. Needs review 15. Clients & suppliers, including the merge 16. VAT return
17. Mileage 18. Expenses 19. Recurring invoices and expenses 20. Customer statement
21. Quote requests, the owner's side 22. Settings

## D. Empty, overloaded, broken

23. Every one of those screens with **nothing** in the account.
24. Every one with **500 records**.
25. Every one with a **failed database read** — the empty state must never stand in for a
    failure.

## E. Money, which has to be right

26. CIS + VAT + credit notes + deposits **in combination**, at the penny.
27. A part-paid invoice then credited, and the other way round.
28. VAT quarter boundaries on both bases, in London time.

## F. Proving the tests themselves

29. **[done]** **The mutation run** — all eight caught; one suite was checking its own fiction and is fixed. **The mutations reached `main` twice**; both routes closed. `29. **The mutation run**: break eight real things, see which suites notice. Anything that
    stays green is a hole. *(Running now.)*
30. Whatever the mutation run finds — that is the list I actually trust.


---

## Done so far (2026-09-24, kept as it went)

**1–13, 26, 27, 28 and 29** — everything except the four questions on nine screens
(14–22) and the empty/overloaded/broken sweep (23–25). Plus the extra things the work
turned up:

- The scan page opened a camera **over a document already waiting to be read** — a
  regression from the camera-blocked notice earlier the same night, found by the mutation
  run of all things.
- `test-scan-wall` was checking wording **it supplied to its own stand-in**. Eighteen green
  checks, none of them about the app. It takes the words from the app's own code now.
- Giving every page the brand suffix caught the three **customer links** (`/i/`, `/q/`, `/r/`)
  too, so someone opening an invoice we sent them saw our name appended to their supplier's.
  They have no account here. `title.absolute` on all three.
- With the camera blocked **on an iPhone**, the scan page said "blocked in your browser's
  settings" — not something anybody can act on from a phone — and offered no way to scan.
  It now gives the exact iOS route and the iPhone's own camera, which needs no permission.
- Two suites were dying part-way and **reporting a pass**: `test-settings-add` (a broken
  catch block) and `test-company-picker` (33 checks after a renamed button). Both classes
  are the same lesson as the mutations reaching main: read the content, not the summary.

**Still to go:** 14–22 (the four questions on nine screens), 23–25 (empty, overloaded,
broken).
