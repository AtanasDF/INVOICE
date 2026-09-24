# Accessibility: what we actually fail (2026-09-24)

Researched against WCAG 2.2, the GOV.UK guidance, MDN and the platform rules, then
**measured against our own `web/src`** rather than left as general advice. Every snippet
below was run in headless Chrome against planted faults and confirmed to fire on the fault
and stay quiet on correct markup.

## Where we stand legally

The Public Sector Bodies Accessibility Regulations 2018 **do not apply** — they cover
public sector bodies. What applies is the **Equality Act 2010** duty to make reasonable
adjustments, which for a service provider is *anticipatory*: you plan for disabled users
before anyone complains. The Act names no technical standard; WCAG 2.2 AA is the
conventional evidence of having met it, not a legal requirement. Any accessibility
statement we write must say which is which.

## What we fail, worst first

| | Fault | The evidence from our own code | WCAG |
|---|---|---|---|
| **1** | **Errors are not tied to the field they are about** | `aria-invalid`: **0 uses**. `aria-describedby`: **1**. But `role="alert"`: **79** | 3.3.1, 1.3.1 |
| **2** | **`autocomplete` is nearly absent** | ~20 attributes across **190 inputs**, and 9 of those are `"off"` | 1.3.5 |
| **3** | **Controls without a name** | 120 `<label>` / 56 `htmlFor` against **190 inputs** | 3.3.2, 4.1.2 |
| **4** | **Icon-only buttons are too small to hit** | `p-1` icon button measures **18.2 × 23 px** — under the 24 px floor | **2.5.8 fail** |
| **5** | **Ordinary buttons fail the phone makers** | House button is **36 px** tall: passes WCAG's 24, fails Apple's 44 and Android's 48 | guidance |
| **6** | **Focus never moves on a route change** | Next announces the new title but leaves focus where it was | 2.4.3 |
| **7** | **Nothing respects "reduce motion"** | `prefers-reduced-motion`: **0 uses** — and we are about to add sliding panels | 2.3.3 |
| **8** | **Dark mode has never been contrast-tested** | `test-readable` covers 5 themes; `theme.ts` has **6** | 1.4.3 |

Two things often assumed broken that we checked and **are fine**: focus outlines survive
(Tailwind v4's preflight does not reset them, and our two `outline-none` uses are on
`tabIndex={-1}` targets, which is correct), and route changes *are* announced by Next's own
announcer.

## The one that matters most, and the judgement call in it

Our pattern is `{error && <p role="alert" ...>{error}</p>}` as a **sibling** of the input.
It announces the words and never says **which field is wrong**. The fix:

```jsx
<label htmlFor="amount">Amount</label>
<input id="amount" aria-invalid={!!err || undefined} aria-describedby={err ? "amount-err" : undefined} />
{err && <p id="amount-err" role="alert" className="text-xs text-red-600">{err}</p>}
```

**`aria-describedby`, not `aria-errormessage`**, even though the latter is the "more
correct" attribute: screen-reader support for it is still patchy, `aria-describedby` is
universal. A case where the better-specified choice is the worse engineering one today.

## Target size: three numbers that disagree

- **WCAG 2.5.8 (AA): 24 × 24 px** — normative, and our icon buttons fail it.
- **Apple: 44 × 44 pt. Android: 48 × 48 dp** — guidance, and we fail both nearly everywhere.

2.5.8 has a **spacing exception**: an undersized target passes if a 24 px circle centred on
it does not touch another target's circle. Any test must implement that or it will report
false failures. For a plasterer with cold hands in a depot, the platform numbers are the
ones that matter, not the floor.

## Plain English, and why a score alone is a trap

WCAG's own reading-level criterion (3.1.5) is **AAA**, so this is a duty to our users
rather than a conformance line — and given drivers and chefs with English as a second
language, it is the more important of the two.

Flesch–Kincaid, Fog and SMOG count syllables and sentence length. **They cannot see
idiom.** Demonstrated rather than asserted: *"Just bear in mind we'll reach out down the
line to get you up and running"* scores a **reading age of 8.2** — inside any plain-English
gate — while being four idioms deep and hopeless for an ESL reader. So a score is a
*report* beside an idiom list and a double-negative check, never the gate on its own.

Rules worth failing a build over: no sentence over **20 words**; reading age **≤ 11** on
`/`, `/login`, `/i/`, `/q/`, `/r/`; no double negatives; no idiom from a kept list.

## Screen readers: the five things that break a React app

1. **Focus after a route change** — Next announces, but does not move focus. Fix: an
   `<h1 tabIndex={-1}>` focused on navigation. `BatchReview.tsx` already does exactly this.
2. **Next's announcer lives in a shadow root** — so
   `document.querySelectorAll('[aria-live]')` returns **0**. Any live-region audit we write
   must pierce shadow roots or it will silently miss it.
3. **A live region inserted together with its text announces nothing.** `{msg && <p
   role="alert">}` is the broken idiom and it is our dominant pattern (79 uses). `role="alert"`
   usually survives it; `aria-live="polite"` generally does not. Render the container always,
   swap the text.
4. **Dialogs** need a name, `aria-modal`, focus in, focus returned, and the background
   `inert`. Prefer `inert` over `aria-hidden`: `aria-hidden` hides from a screen reader while
   leaving things keyboard-focusable, which produces focus the user cannot see.
5. **A button that disables itself blurs itself** — which is why `ScanLimitNotice` uses a ref.
   Already learnt; the same lesson.

## Low literacy and ESL

Icon **and** text, never an icon alone for a primary action. Numerals not words. Dates
spelled out (`12 March 2026`), never `03/12/2026`. No double negatives. No idiom. One
decision per screen.

And one specific inconsistency of ours: we call the same thing **"client"** (the table,
the store) and **"customer"** (the statement page, "Text <customer>"). Pick one for the UI.

## What no test can decide

Whether a message is *useful*; whether a label describes the right thing
(`aria-label="Button"` passes every automated check); whether focus order *means*
anything; whether a gloved plasterer recognises an icon; contrast over a photograph.
Automated checks catch perhaps a third of real defects. The rest needs a real phone with
VoiceOver on — which is the same lesson as "an hour of pressing buttons finds the real bugs".

## The work, in order

1. `test-form-errors.mjs` — every errored input carries `aria-invalid` and points at its
   message. **Our biggest real failure.**
2. `test-autocomplete.mjs` — the token grammar, plus the UK traps: `postal-code` not
   `postcode`, `organization` not `organisation`, `tel` not `phone`.
3. Extend `test-readable` to the **dark** theme (5 of 6 today).
4. Extend `test-one-handed` with the 2.5.8 spacing exception as a **hard fail** — icon
   buttons fail it now — keeping 44 px as a report.
5. `test-reflow.mjs` at 320 px, including `scrollWidth`, which catches unbroken strings
   `wrap-anywhere` was forgotten on.
6. Extend `test-announced` to pierce shadow roots, and to assert live regions exist on load.
7. Fix two stale comments that now say the opposite of the truth: `globals.css` ("Dark mode
   is deliberately NOT here") and `test-dark-mode.mjs` ("light-only by design"), both
   written before dark mode landed on 2026-09-23.
