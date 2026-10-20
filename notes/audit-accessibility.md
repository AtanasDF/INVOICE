# Accessibility audit, WCAG 2.2 AA (cloud brief 18, 2026-10-20)

Every page under `web/src/app` and every component it uses, read against WCAG 2.2 AA:
names, focus order and focus rings, colour alone, field errors, announcements, dialogs,
headings, images and icons, contrast in all six palettes, and the camera without the
viewfinder. Three read-only passes did the sweep (names and headings; errors and live
regions; dialogs, focus and the camera). **Every finding below was opened and confirmed
in the code before it was fixed**, and none was false. Labels, aria, focus and colour
tokens only: no layout was redesigned, and DocumentCapture's capture logic, detection and
auto-capture timing are untouched (only its labels, roles, a live region and Escape).

Branch: `claude/brief-18-cloud-queue-2yb3gl` (the brief said `wip/accessibility`; the
session was told to use this one). **Not merged.** tsc, eslint and `npm run build` clean
(the build needs `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` set to anything in a container
with no `.env.local`). The browser suites cannot run in a cloud session; the list to run
on the Mac is at the foot.

## How it stays fixed

- **`harness/test-contrast-tokens.mjs`** (new). Reads every class list in `web/src` that
  sets a text colour, works the pair out from `globals.css` in all six themes (hex for the
  scale, oklch for Tailwind's colours, dark mode's own overrides), and fails anything under
  4.5:1 (3:1 for large text). test-readable measures what is painted, which is the honest
  way, but only on pages it visits; this covers every screen. Proved by putting one fix
  back: it fails.
- **`harness/test-accessibility-source.mjs`** (new, 38 checks). Pins each pattern fixed
  below in the source, so a new screen that repeats one fails wherever it is. Proved by
  putting two fixes back (a `display:none` file input, the Escape guard): both caught.
- Both are in `run-all.sh`. Neither needs a server.

## Fixed

### Contrast (1.4.3)
1. The "Sent with Invoiceover" footer on the customer's invoice, quote and request pages:
   neutral-400, 2.3:1 in every theme. Now neutral-500.
2. The empty-line hint on the invoice sheet ("Describe the work on the first line"): same.
3. The signature pad's "Sign here with your finger": same.
4. A failed page in the scan strip: red-600 on red-50, 4.36:1. Now red-700.
5. "That receipt isn't here any more": amber-900, which dark mode never redefined, on the
   dark amber-50 dark mode does redefine. Dark brown on dark brown, 1.7:1. Now amber-800,
   which dark mode lightens.

### Keyboard and focus (2.1.1, 2.4.1, 2.4.3, 2.4.7)
6. **Escape anywhere pulled focus into the header.** Every header menu listened on the
   document and focused its own `<summary>` on any Escape, open or not, so Escape in a
   search box, the Add sheet or the camera put the caret in the header. Each menu now
   answers only its own Escape.
7. **The upload buttons could not be reached by keyboard at all**: a `<label>` round a
   `display:none` file input takes no focus. "Upload a photo or PDF" / "Upload from files"
   (eight places), the iPhone native scan label on the dashboard and `CaptureButton`. The
   input is `sr-only` now, still inside the label (so one tap still opens the iPhone
   camera), with the ring drawn on the label (`src/lib/fileRing.ts`). The Settings logo
   picker was already `sr-only` but its focus was invisible; same ring.
8. The receipt photo drop zone on /receipts/new was a `div onClick`, the only way to attach
   a photo. Its words are a real button now; the drop and the click still work.
9. The contact picker's invisible `<select>` took focus with no ring; the ▾ beside it now
   shows one.
10. /convert's hidden file input sat in the tab order with no name; it is out of the order
    (the big button opens it).
11. A skip link, "Skip to the page", is the first stop on every page; `main` carries the id.
12. **Modals kept nobody in.** The Add sheet, the file viewer and the camera said
    `aria-modal` but Tab walked out into the header, footer and Feedback pill under them,
    and the sheet and the camera never took focus at all, so on /invoices/new the whole
    form stayed one Tab away beneath the viewfinder. `src/lib/useFocusTrap.ts` moves focus
    in, keeps Tab inside and gives focus back to whatever opened it. The Add sheet's
    full-screen backdrop is out of the tab order (Cancel and Escape are the way out).
13. The scan review sheet had no Escape; it now means Keep scanning. Remove dropped focus
    to the page; it goes to the sheet's heading.
14. The date roller made every option a tab stop (up to 32 in the Day column) and its
    arrows changed the choice silently. One stop, and `aria-activedescendant` says which.

### Names, roles and states (1.1.1, 1.3.1, 4.1.2)
15. Fifteen boxes had only a placeholder or a `<label>` with no `htmlFor`: the exchange
    rates (new receipt, receipt edit, scan), invoice and credit-note numbers (receipt edit,
    needs review), the scanned line items and other details, "Credit note for", and both
    reset-password boxes.
16. Ten toggles showed the choice only as a dark fill: Week/Month/Year/Custom and Expenses
    only/Combined (/expenses), Customers/Suppliers (/clients), Already paid/To be paid (scan
    and review), the contacts found on a scanned card. `aria-pressed` says it; Payment is a
    named group.
17. Icons beside words were read out ("image"): the six in `icons.tsx` and the dashboard's
    scan icon are `aria-hidden`.
18. 21 arrows on back and onward links ("left arrow Invoices") are `aria-hidden`; the ▾ on
    Details too.
19. The address results were a `listbox` of `option`s wrapping buttons. `option` makes its
    children presentational, so the buttons stopped being buttons, and there was no
    arrow-key model behind the role. A plain list of buttons now. The two address blocks on
    one form are each a group named by their label, so "Postcode" says whose.
20. The scan review sheet: every tile's "Remove" and "Page of previous" now name the scan.
21. The camera's zoom slider says "2 times", not "2"; the 1×/2× pair is a named group.

### Headings (1.3.1, 2.4.6)
22. /login had no h1 (the card's "Sign in" was an h2 under nothing). The site line is it.
23. "Just the file" on /scan and the email form on /files were h3 straight under an h1.

### Colour alone (1.4.1)
24. The dashboard's awaiting-payment list told overdue from in-date only by red; it says
    "overdue, was due …" now.
25. The date roller's dot for "has files" had no words; it says ", has files".

### Errors tied to their box (3.3.1, 4.1.2)
The house convention (`notes/accessibility-spec.md`): a named constant for the message,
`aria-invalid` and `aria-describedby` on the box when that message is showing, the id on
the existing `role="alert"`.
26. Recording a payment: no date, no amount, more than is owed, nothing owed.
27. A credit note: no amount. An **empty** amount used to be refused silently, with no
    message at all; it now says so.
28. Reset password: too short (first box), not the same (second box).
29. Signing in: a throwaway address, an invalid or taken email (email box), a weak password
    (password box); "That code has run out or isn't right" (code box); the forgotten
    password form's email box. `emailAtFault` / `passwordAtFault` live in `errorText.ts`
    beside the words they compare.
30. **The quote form put `aria-invalid` on a `<div>` round the customer picker, for every
    error.** A div has no role, so nothing was ever announced from it, and it marked the
    customer wrong when the problem was the number. `test-form-errors` passed only because
    it accepted that div. Each refusal is now tied to its own box: the customer list (a
    radiogroup), the new-customer block, the number, the deposit. The new-customer form's
    own name and email refusals are tied too.
31. The scan page: no total, a bad exchange rate, a bill with no due date, no supplier name.
32. New receipt and receipt edit: a bad exchange rate (the total was already tied).
33. Needs review: a bill with no due date, per row.
34. Settings: no category; the logo picture refused.
35. Mileage: "Put a postcode at each end" marks the empty end.
36. The VAT number box was never `aria-invalid` when its check digits failed (one attribute;
    `bad` was already worked out).
37. Check a company: "No company with that name / number" is tied to the search box and is
    an alert; every failure on that page used to be silent.
38. Feedback: an empty message was refused silently. It says "Write what you want to tell
    us first."
39. The address finder's "We couldn't find that postcode" is tied to the postcode box.

### Announcements (4.1.3)
A message that appears in a region mounted together with its words is often not read,
weakest in iPhone VoiceOver (the device Atanas uses). Either the region is always mounted
and only its words change, or it is an alert.
40. **The camera said nothing.** Page found or lost, the coaching, the shot, the stack
    count, "Edge detection unavailable", "Starting the camera" — all pictures. One
    always-mounted status reads the screen's own state (`spoken`, beside `hint`); it decides
    nothing. The failure banner and the timeout/denied/stalled/unsupported screens are
    alerts. Escape is Back, with Back's own "Discard N scans?". The camera is a named
    dialog on both its screens.
41. "Paid": the whole overlay was a status mounted on pay. An always-mounted status says
    "Paid. £1,200.00 from Acme Ltd, invoice INV-1."; the card is for the eyes.
42. The address search runs by itself as somebody types; what it found ("3 addresses
    found", "No matches", "isn't answering") is now said.
43. Mileage's road estimate (which also rewrites the Miles box).
44. Scan: "Saved as a new supplier", and the duplicate-supplier refusal, in both places.
45. Describe it on /invoices/new (success said, failure an alert); the add-customer failure;
    "Copied from your scan".
46. /convert: the file it can't change (alert), "Your file is ready".
47. Emailing a file ("Sent to …"); saving one from /files ("Saved as …").
48. Settings: "Saved, apart from …" used to empty the status, so that save said nothing.
49. The forgotten-password "link is on its way".
50. Copy link (invoice, quote, supplier request): the button disables while copying, so
    focus leaves it and "Copied" is never heard. "Link copied." is said. The same for Copy
    the figures (VAT, statement), the inbox address (Settings and the upload panel), an
    order list and a company report.
51. Ten status messages that mounted with their words (Save these, Money, merge contacts,
    a trip saved, a reminder logged, a recurring draft made, needs review saved, the
    Settings sign-in note, Just the file, the upload panel's "Reading…", the scan strip's
    page limit) now sit in a region that is always there. Where the message carries a link,
    the always-mounted region wraps it, so the link stays inside what is said
    (`test-said-so` checks exactly that).

### Language (3.1.1)
52. `lang="en-GB"`, so a screen reader reads the app in a British voice.

### /accessibility
Corrected where it was now wrong or incomplete: the camera item said nobody had worked out
how somebody who cannot see the viewfinder uses it; it now says what the camera says out
loud and that nobody who cannot see has tried it. The contrast and keyboard items say what
is now checked. Nothing on it claims a screen-reader test that has not happened.

## Left

### Needs Atanas or a person
- **Nobody has used any of this with VoiceOver.** The camera's spoken status is the part
  most worth trying on the iPhone: Settings → Accessibility → VoiceOver, open Scan, point it
  at a receipt. If it talks too much (the coaching changes every few hundred ms when the
  page is at the edge), the fix is to say only page found / lost and the shot.
- The statement still says buttons are 36px, not 44: unchanged, a design call.

### Not fixed (smaller, or wider than labels and aria)
- **Supplier price form** (`RequestForm`, `PriceForm`, and the public `/r/` page): its
  refusals are announced but not tied to the box — `readDraft` would have to return which
  line is wrong. Also `PublicRequestView`, `PublicQuoteView` and `HelpChat` wrap whole
  forms in `aria-live` with an alert inside, so a supplier typing prices hears every
  running total. Narrowing that region changes what the customer pages announce, and those
  pages are not reachable by any suite here.
- `TextCustomer`: a typed number that doesn't parse just hides the link, with no words.
- `AnswerEntry`'s file-type refusal is not tied to its Attach button; the server's "Enter a
  valid email address" on the two send forms is not tied to the To box.
- `SendInvoicePanel`: on success the whole form is replaced, so focus drops to the page.
- `SaveAsMenu`: focus is lost after a save closes it; "Saving…" is not said. The files
  viewer's "Loading page…" is not said.
- `CompanyNameInput` / `ContactField` comboboxes (correct roles and arrows) don't announce
  the match count; ContactField's group headings are `li role="presentation"` with text.
- The camera's native-iOS screen: its focus fallback after review looks for a "Take a
  photo" aria-label the button does not have (it has the words). Harmless today, because
  the native path has no review-opener to fall back from.
- A header menu stays open when Tab leaves it. The camera's tap-to-focus and the hidden
  readout strip are pointer-only, neither essential.
- `InviteCard` "Copied" is silent; it renders nothing until `NEXT_PUBLIC_INVITES` is set.
- `test-audit-guards` "send: a failed read-back doesn't say it wasn't sent" fails on the
  starting commit `6f403a6` as well: `kept.finish()` now sits between `markSentWithNumber`
  and the `catch` (draft-autosave). The guard is stale, not this branch.

## Run on the Mac before merging

Against `next start` (not `next dev`), one at a time or `JOBS=1`:
`test-labels test-keyboard-only test-form-errors test-error-on-the-field test-readable
test-dark-mode test-delight test-said-so test-announced test-address-fields
test-address-stubbed test-quotes test-deposits test-settings-save test-feedback-page
test-sign-up test-mileage test-payments test-file-strip test-convert test-copy-document
test-scan-wall test-multi-docs test-batch-stuck test-camera-refusal test-ios-camera
test-camera-dark test-upload-panel test-uploads test-tap-targets test-big-text`.

Changed suites: `test-delight` (the Paid card is found by `.paid-pop`, and a new check
that the status says the same), `test-readable` (`en-GB`), `test-address-fields` and
`test-address-stubbed` (`[data-address-option]` for the old `role="option"`),
`test-ios-forms-layout` (the back arrow is `aria-hidden`; 52/52 here), `mutate.mjs` (two
`find` strings followed the code they break).
