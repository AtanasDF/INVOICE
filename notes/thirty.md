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
3. **`autocomplete` is on ~20 of 190 inputs**, and nine of those are `"off"` — so phones
   cannot fill in a name, an address or a postcode.
4. **[done]** **Dark mode has never been contrast-tested.** `test-readable` covers five themes; there
   are six.
5. **[done]** **Two comments now say the opposite of the truth** — `globals.css` and
   `test-dark-mode.mjs` both still claim the app is light-only.
6. **No page for a single receipt.** Tapping one on the dashboard or in the library lands on
   the whole list. `?open=<id>` that scrolls to and highlights it is the small fix.
7. **"client" and "customer" are used for the same thing** across the UI.
8. **Every route may not have a unique `<title>`** — and Next's announcer says *nothing* on a
   route change when two pages share one.

## B. Suites that exist and never run

9. `test-settings-add` — 27 of ~30, then dies looking for "+ Add" on `/invoices`.
10. `test-deposits` — a 15 s wait times out; the screen moved under it.
11. `test-free-quote` — "no button: Start a quote"; the chooser changed.
12. `test-quote-requests` — imports fixed; settle the 120 s wait on a quiet machine.
13. `test-quotes-ux` and `test-quotes-fixes` — written against a branch long merged.

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

**1, 2, 4, 5, 29** and the two extra things the work turned up:

- The scan page opened a camera **over a document already waiting to be read** — a
  regression from the camera-blocked notice earlier the same night, found by the mutation
  run of all things.
- `test-scan-wall` was checking wording **it supplied to its own stand-in**. Eighteen green
  checks, none of them about the app. It takes the words from the app's own code now.

**Still to go:** 3 (autocomplete on 190 inputs), 6 (no page for a single receipt), 7
(client vs customer), 8 (unique page titles), 9–13 (the suites that never run), 14–22 (the
four questions on nine screens), 23–25 (empty, overloaded, broken), 26–28 (money in
combination).
