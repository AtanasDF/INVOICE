# iPhone Safari fixes: forms, inputs and layout (2026-10-20, cloud brief 13)

Findings 1, 2, 5, 6, 20, 21, 22 and 23 of `notes/ios-safari.md`. Each was read in the code
before it was touched; all eight were real. Branch: **`claude/brief-13-cloud-queue-u2loeu`**
(the brief asked for `wip/ios-forms-layout`; the cloud session was told to push to this
name instead, and nothing else differs). Not merged.

**Five of them were then shown live in a browser on `main`**, not just argued from the
source: this container can run the browser suites against Chromium (see the foot), and the
new `test-ios-layout` fails 9 of 15 on a `main` build and passes 15 of 15 on this branch.
On `main`: every box on New receipt is 14px on a touch screen; typing 2.50 into a receipt
line leaves **250**; with + Add open, a tap where the Feedback pill is lands **on the pill**;
at twice the text size + Add starts **948px above the top of the screen**; and the Free
page's More button ends at 577px on a 390px phone.

## What was done

| # | Finding | Fix |
|---|---|---|
| 1 | Any box under 16px zooms the page and leaves it zoomed | One unlayered rule in `globals.css`: `@media (pointer: coarse) { input, select, textarea { font-size: max(16px, 1rem) } }`. Not `maximum-scale=1`. |
| 2 | Receipt line qty/price through `parseFloat` per keystroke | `NumberInput`, which keeps the text and sets `inputMode="decimal"`. No `parseFloat(e.target.value)` is left anywhere in `src`. |
| 5 | Feedback pill over every overlay | `page-in` fill mode `both` → `backwards`. |
| 6 | Forms keep work only in memory | See below. |
| 20 | No way back in the home-screen app | `← Invoices` / `← Receipts & bills` / `← Customers & suppliers` on the draft and issued invoice, new invoice, new receipt, Needs review and new contact. |
| 21 | Larger text running off the screen | + Add: `max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain`. Free-page bar: `flex-wrap`. Save as: `max-w-[calc(100vw-2rem)]`. Invoice, quote, recurring and receipt line rows: on a phone the ✕ gets its own row (it was a 44px target in a twelfth of the row), and qty/price get wider boxes. |
| 22 | Landscape: nothing padded the sides | `.safe-x` (screen only, so `print:px-0` still wins) on the header, `<main>` and the footer; the pill's `right` adds the inset. |
| 23 | Keyboard, fixed bars, no scroll lock | `html:has([aria-modal="true"]) { overflow: hidden }`, and `overscroll-behavior: contain` on scrollers inside one -- CSS only, so BatchReview's list is covered without touching scan code. + Add now carries `aria-modal`. `.hide-while-typing` (pill, Free-page bar) hides while a keyboard-raising control has focus on touch. File library viewer pads the bottom inset. |

### #6, the forms

- **Autosave, through `formDraft.ts`:** a new quote (`new-quote-draft`), an edited quote
  (`quote-edit:<id>`), and an edited draft invoice (`invoice-edit:<id>`). The two edit kinds
  are measured against a **baseline** (what the record holds), passed to `useFormDraft`:
  only a difference is kept, a kept copy identical to the record is never offered, and
  saving moves the baseline so the copy clears itself. The draft-invoice page holds off
  until the invoice has loaded. Marking it sent drops the copy; so does opening it once
  issued. The quote page says "You were changing this quote … Carry on editing" when a
  copy is waiting, since editing is a toggle there and the reload lands on the view.
- **Per-record keys and the account switch:** `PERSONAL_LOCAL_PREFIXES` and
  `PERSONAL_SESSION_PREFIXES` in `accountSwitch.ts`. Both `forgetOtherAccount` and the boot
  script in `<head>` walk storage for them, proved by running the boot script against a
  fake storage in `test-ios-forms-layout`.
- **The supplier's `/r/` page** (`lib/answerDraft.ts`): prices and name kept in
  **sessionStorage** under `quote-request-answer:<token>`, which survives the reload an app
  switch causes but not the tab -- it is a stranger's page, often on a shared machine.
  Restored once the page is on the device (`useSyncExternalStore`), so the server render
  still matches; only lines the request still has come back.
- **A confirm before a link or Back** for short forms with nothing kept behind them:
  Settings' click/popstate/Sign-out guard is lifted into `leaveGuard.ts` as
  `useNavigationGuard` (Settings uses it, with its own bar, unchanged), and
  `useConfirmLeave(dirty, question)` wraps it in `window.confirm` for the quote-request
  list, a supplier's prices typed in by hand, a new customer or supplier, and feedback.

## Left, and why

- **Camera** (#21's error screens and banner, #22's Back button and bottom row): all in
  `DocumentCapture.tsx`, which brief 14 is changing. Left for it, as the brief asked.
- **#6, still memory-only:** Settings across a reload (it has the link/Back guard, nothing
  behind it); the inline edits on the clients and receipts lists; Needs review; mileage,
  expenses and recurring; `/copy`'s pages (photographs, which are never stored). The
  confirm guard was added only where a form has one obvious "dirty"; the inline edits
  would each need their own.
- **#23:** no `visualViewport` handling. Settings' save bar is `sticky`, not `fixed`, and was
  left alone. The File library's email form inside the photo overlay still moves under the
  keyboard.
- **#21:** the 195px "Safari aA 200%" check (`test-ios-layout`) passes on `main` too, so the
  line rows did not actually widen the page at that zoom -- the ✕ overlapped its neighbour
  instead. It is kept as a guard, not as proof.

## Suites

- **New, source-reading:** `harness/test-ios-forms-layout.mjs`, 52 checks, in `run-all.sh`.
  Proved by breaking eight of the fixes on purpose (the 16px rule, the decimal,
  `backwards`, `kept.finish()`, a line's ✕, the footer's `.safe-x`, the overlay lock, + Add's
  `aria-modal`): every one was caught by its own named check, nine failing in all.
- **New, browser:** `harness/test-ios-layout.mjs`, 15 checks, in `run-all.sh`. 15/15 here,
  6/15 on `main`.
- **Extended:** `test-account-switch` (24, the boot script names every prefix).
- **Green against `next start` of this branch, in this container (Chromium, one at a time):**
  see the session log for the list and counts.

**The Mac should still run**, against `next start`, before this merges: everything above,
plus `test-draft-autosave`, `test-form-draft`, `test-quotes`, `test-quote-links`,
`test-deposits`, `test-settings-save`, `test-public-request`, `test-feedback-page`,
`test-merge-contacts`, `test-big-text`, `test-fit-320`, `test-no-sideways`, `test-tap-targets`,
`test-one-handed`, `test-keyboard-only`, `test-dark-mode`, `test-print` and `test-page-print`
(the `.safe-x` padding must not reach paper), `test-free-draft`, `test-lines`, `test-cis`.
Real Chrome on macOS is not Chromium on Linux, and the phone is neither.

**One risk to watch in any suite:** `mockdb.mjs` accepts only `beforeunload` dialogs. A suite
that types into one of the four confirm-guarded forms and then **clicks a link** without
saving will now hang on the confirm until its timeout. None of the suites run here did.

## Try on the phone

1. Tap into a small box (Needs review, a payment amount). No zoom.
2. New receipt → split into items → type 2.50. It stays 2.50.
3. Invoices → + Add. Nothing of the Feedback pill shows through; the page behind doesn't move.
4. Start a quote, switch to Messages for a minute, come back (or reload). It is offered back.
5. Edit a draft invoice, reload. "You were writing changes to this draft invoice …".
6. In the home-screen app: open an invoice from the dashboard and get back with "← Invoices".
7. Sideways on the dashboard: nothing under the Dynamic Island.
8. Larger Text on: + Add scrolls; on the Free page More is on screen.
