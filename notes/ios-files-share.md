# iPhone Safari fixes: files, sharing, downloads and links (2026-10-20, cloud)

Cloud brief 15, branch `wip/ios-files-share`, from `notes/ios-safari.md`. **Not merged.**
Each finding was read in the code before it was changed; every one the brief named held up.
Nothing here has run on an iPhone or in a browser: the cloud has no Chrome suites. The
checks are `harness/test-ios-files-share.mjs` (63, new, in run-all) and
`harness/test-sw-behaviour.mjs` (16, was 12). `tsc`, `eslint` and `npm run build` are clean.

## What changed

| # | What he saw | The fix |
|---|---|---|
| 7 | A Safari tab said "this browser doesn't support push" | Settings asks "iPhone, not from the Home Screen" first; `isIosNotStandalone` uses `isIOS()` + `isStandalone()`, so an iPad counts |
| 8 | "Press Copy link again" failed every time | `lib/afterTap.ts` `copyText`: a link already in state is written inside the tap; a new one goes to `clipboard.write` as a `ClipboardItem` promise, which Safari allows. Invoice, quote and quote-request pages |
| 9 | CSV / JSON exports saved nothing | `exportCsv` and `exportJson` go through `saveText` |
| 10 | Downloads, the home-screen app, Save all | `saveBlob` revokes after 60 s, not 5; in the iPhone home-screen app it opens the share sheet (Save to Files), falling back to the link if the tap was spent; `saveBlobs` gives an iPhone one sheet with every file and spaces the downloads elsewhere (`/convert` Save all); the invoice PDF's `save` is `saveBlob`, not jsPDF's own |
| 11 | The receipt photo box opened only the camera | `capture` removed; the input is cleared so the same photo can be picked again |
| 12 | The first Share on "Just the file" did nothing | The PDF is made as the panel opens, so Share has it in hand; a refused sheet says "The file is ready now. Press Share it again." |
| 13 | A supplier's document silently failed to open | `openWhenReady` opens the window inside the tap and sets its address once the URL is signed; blocked anyway, it opens the document in the same tab |
| 17 | Safari forgets everything after 7 days | Said where it matters: the iPhone steps in "Put Invoiceover on your phone" (Settings, dashboard) now say so, and that the Home Screen app keeps it |
| 18 | The app and Safari are separate | In the home-screen app, the check-your-email screen says type the code, don't tap the link; a password reset says the link opens in Safari and to sign in here after. CLAUDE.md's `/scan?engine=gemini` advice corrected |
| 19 | His own opens pushed "your customer opened it" | The first-open push says "(or you did, somewhere you aren't signed in)". The page cannot tell him from the customer when he is signed in only to the home-screen app, so this is wording, not detection |
| 24 | The offline page stuck on "Loading…" | The worker serves `public/offline.html`, a plain file with no scripts and the phone's own light or dark colours; it is put back on any navigation if the phone cleared it. Cache bumped to v3 so the old `/offline` copy goes. `/offline` the page still exists |
| 25 | Smaller items | Notification taps take an open window to the page (`client.navigate`) instead of just focusing it. `/convert`: WEBP offered only where it can be written, a picture that comes out as the wrong kind is refused, photos turned by their EXIF. Long sheets drawn under Safari's 16.7 MP canvas limit (`sheetPixelRatio`). The invite share no longer says "Couldn't share it" when the sheet is closed. Sharing a PDF on an iPhone warns that WhatsApp may drop the link. Client edit email `autoComplete="off"`. VAT number, company number and invoice prefix: capitals, no autocorrect. Exchange rate reads "1,17" (`readRate`). Min total reads through `amountOrNull`. `type="month"` gets the date-box fix |

## Left, and why

- **Code-based password reset** (`verifyOtp` type `recovery`): needs the Supabase "Reset
  Password" email template to carry `{{ .Token }}`, which is a dashboard change. The wording
  above is the stop-gap.
- **Same tap risk on SaveAsMenu (picture), SaveThese and the File library**: "possible" in
  the report. A download link after an await is usually allowed by Safari, and in the
  home-screen app `saveBlob`'s share sheet now falls back to it, so nothing was changed.
  If one bites, use SendInvoicePanel's "Ready — tap to save".
- **Other briefs' ground**, untouched so the three can merge: the scan page's invoice
  number box and its unguarded `localStorage` (`scan/page.tsx:429`), the camera tip and
  timeout, `camera.ts`'s Permissions comments, the wake lock (brief 14); `vh`/`dvh`, the
  status bar colour, `title`-only text on touch, the Free-page print portal (layout,
  brief 13 or later). `leaveGuard.ts`'s comment still says the worker answers with
  `/offline`; brief 13 is changing that file.
- **The "Paid" haptic** is called after the network round trips. It is in the payments
  flow, not this brief's.
- **The Free-page signature stored twice** in localStorage: the draft code, not files.
- **Pre-existing red, not this branch**: `test-component-money` "the quotes list no longer
  claims to know when a quote was sent" fails on `main` too -- `8d11611` (quote send times)
  made the list say "sent" again on purpose, so the assertion is stale.

## Run on the Mac before merging (against `next start`)

test-offline-rules, test-convert, test-save-as, test-share, test-just-the-file,
test-copy-document, test-quote-requests, test-quote-links, test-public-request,
test-links, test-public-links, test-settings-save, test-get-the-app, test-sign-up,
test-uploads, test-receipts-list, test-csv-safety, test-invites, test-send-document,
test-print, test-page-print, test-labels, test-autocomplete, test-keyboards,
test-currency, test-vat-lookup, test-check-company, test-company-picker, test-plain-words,
test-vocabulary. And the logic ones: test-ios-files-share, test-sw-behaviour.

## Try on the phone

1. Invoice → Copy link, twice. Both should copy.
2. Invoices → Export CSV; Settings → download my data. In Safari and in the home-screen app
   (there it should open the share sheet).
3. New receipt by hand → tap the photo box: Photo Library and Files offered?
4. A scan → "Not yours? Just keep the file" → Share it. The first tap should open the sheet.
5. A quote request with a scanned supplier document → open it.
6. Settings in a Safari tab → Notifications: the Home Screen instructions.
7. Airplane mode in the home-screen app, then open a page: "No signal just now", not "Loading…".
8. Tap a push notification with the app open on another page: it should go to the invoice.
