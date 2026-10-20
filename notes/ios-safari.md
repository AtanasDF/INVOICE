# iPhone Safari: what behaves differently from the harness (2026-10-20, cloud)

Cloud brief 12. **Read-only: no app code was changed.** Atanas uses the app almost
entirely in iPhone Safari and as a home-screen app, but the harness runs desktop Chrome, so
nothing below has been seen on the device it matters on. Every finding comes from reading
`web/src` at `2be32fa` (main). The worst ones I re-read in the code myself: the input zoom
and root font, the receipt line decimals, the camera `mute` restart, `capture` on the
receipt photo, the push-message order, the CSV export revoke and the page-in animation.

How sure: **certain** = it follows from the code plus documented WebKit behaviour;
**likely** = the code path is clear but the WebKit timing or quirk needs a device to be
sure; **possible** = plausible, worth a look. **iPhone?** says whether only a real phone
can settle it. "Chrome 390" means it reproduces in desktop Chrome at 390 px wide.

**Fixed on `claude/brief-14-cloud-queue-aka0xo` (brief 14), not merged:** 3, 4, 14, 15 and 16. See SESSIONS.md.

## Try these on the phone (ten minutes, in this order)

1. **Tap into any small box**, e.g. a field on Needs review or the payment amount on an
   invoice. Does the page zoom in, and stay zoomed when you leave the box? (#1)
2. **New receipt by hand → add a line → type 2.50 as the price.** Does the dot vanish? (#2)
3. **Scan a batch of three, switch to Messages for five seconds, come back.** Does the
   camera restart, ask again, or show "stalled"? Are the three shots still there? (#3, #4)
4. **Open + Add on the dashboard.** Is the Feedback pill on top of the sheet? Same on the
   camera screen, bottom right. (#5)
5. **Settings in a Safari tab (not the home-screen app) → Notifications.** Does it say
   "this browser doesn't support push" instead of "add to Home Screen first"? (#7)
6. **An invoice → Copy link, twice.** Does it copy, or say "press Copy link again" each
   time? (#8)
7. **Invoices list → Export CSV**, and **Settings → download my data.** Does a file arrive?
   Try in Safari and in the home-screen app. (#9, #10)
8. **New receipt by hand → tap the photo box.** Camera only, or are Photo Library and
   Files offered too? (#11)
9. **Files or the "Just the file" panel after a scan → Share.** Does the first tap do
   nothing? (#12)
10. **Quote request with a scanned supplier document → open it.** Does anything open? (#13)
11. In the **home-screen app**, open an invoice from the dashboard, then try to get back
    without the Menu. (#20)
12. Turn the phone **sideways** on the dashboard and the camera. Is anything under the
    Dynamic Island? (#22)

## Findings, worst first

### 1. Tapping a box zooms the page and leaves it zoomed (about 80 fields)

**Where:** iOS zooms on focus into any input, select or textarea under 16 px. The root
font is `-apple-system-body` (`app/globals.css:341`), which is 17 px at the default size,
so `text-sm` is about 14.9 px and `text-xs` about 12.75 px. Nothing in `globals.css` forces
16 px on form controls.

There are about 70 `text-sm` and 7 `text-xs` controls, plus inheritors such as
`LineItemsTable.tsx:21` and the receipt lines at `receipts/new/page.tsx:445`. The flows he
uses most include:
- Needs review: `receipts/review/page.tsx:207-303`, all 8 fields.
- Receipts filters and inline edit: `receipts/page.tsx:532-697`.
- The invoice payment and credit-note forms: `invoices/[id]/page.tsx:824-1017`.
- The invoice list filters: `invoices/page.tsx:306-332`.
- Client edit: `clients/page.tsx:377-401`.
- The per-line VAT-rate select (`text-xs`): `invoices/new:988`, `invoices/[id]:673`,
  `QuoteForm.tsx:143` and `recurring/invoices:261`.

The right pattern, `text-base sm:text-sm`, is already in `AddressFields.tsx:14`,
`vat/page.tsx:13` and `mileage/page.tsx:27`.

**What he sees:** every tap into a box jumps the page sideways and enlarges it. Once he
leaves the box he has to pinch back out.

**How sure:** certain at the default text size. At xLarge text and above, `text-sm`
reaches 16 px, so how often he meets it depends on his setting. **iPhone?** Only to watch
it happen; Chrome's emulation doesn't zoom.

**Fix:** one unlayered rule in `globals.css`, which beats Tailwind v4's `@layer utilities`:
`@media (pointer: coarse) { input, select, textarea { font-size: max(16px, 1rem); } }`.
Not `maximum-scale=1`, which stops everybody zooming.

### 2. Receipt line items can't take a decimal point (every browser)

**Where:** `receipts/new/page.tsx:456` and `:462` hold the quantity and price as numbers,
via `onChange` → `parseFloat(...) || 0`.

**What he sees:** "2." is stored as 2 and written back as "2", so £2.50 can only be pasted.
"1,200" becomes 1, and a cleared box shows 0. There is also no `inputMode`, so the iPhone
shows the letter keyboard.

**How sure:** certain. **iPhone?** No, the harness can catch it.

**Fix:** use `NumberInput` (`components/free-invoice/fields.tsx`), which keeps the raw text,
reads it through `amountOrNull` and sets `inputMode="decimal"`.

### 3. Any interruption tears the camera down and asks for it again

**Where:** `DocumentCapture.tsx:1254-1256` treats the track's `mute` event as camera lost.
After 30 frames, `cameraLost` (`:1106`) bumps `retryKey`, which stops the stream and calls
`getUserMedia` again, possibly while the page is still hidden. There is no
`visibilitychange` handling anywhere in the file.

**Why it matters:** iOS mutes the capture track whenever the page goes to the background,
Control Centre opens or a call comes in. It unmutes the track by itself on return, so the
stream would have recovered.

**What he sees:** after an app switch or a phone lock mid-batch, "Starting camera…",
possibly a fresh permission prompt (the home-screen app re-asks readily) or the
timeout/blocked screen. Within the first 30 frames he gets "stalled" instead. The shots
already taken survive.

**How sure:** likely. **iPhone?** Yes.

**Fix:** on `mute`, pause detection and wait for `unmute` or for the page to become visible
again. Restart only if `readyState === "ended"`, or if the track is still muted about 2 s
after the page is visible.

### 4. Unsaved scan readings are lost on any navigation or reload

**Where:** `app/scan/page.tsx` keeps the batch, its photos and the AI readings in state
only. Its `confirm()`s (`:809`, `:811`, `:1077`, `:1084`) guard only its own buttons. Each
document was already charged against the live daily scan limit.

**What he sees:** he scans 15 receipts and checks a text. iOS reloads the memory-heavy
camera page, and he comes back to an empty scan screen: the readings are gone, and so is
part of the day's allowance. A header link, a Menu link or a swipe back does the same,
without asking.

**How sure:** certain for links and Back. Likely for the reload on an app switch.
**iPhone?** Only for the reload.

**Fix:** reuse Settings' link/popstate guard (`settings/page.tsx:228-269`) while the walk
has unsaved entries. Keep the readings, not the photos, in sessionStorage or IndexedDB and
offer them back after a reload.

### 5. The Feedback pill is drawn over every full-screen overlay

**Where:** `globals.css:515` gives every page `main > * { animation: page-in 180ms ease-out
both }`. Because the fill mode is `both`, the finished opacity animation keeps that wrapper
a stacking context for good. Each overlay's `z-40`/`z-50`/`z-[60]` then only counts inside
the wrapper, while the pill (`AppShell.tsx:261`, `fixed z-10`, a sibling of `<main>`) sits
above the whole of it. The Free-page clash fixed at `AppShell.tsx:251` is the same cause
seen once.

**What he sees:** the pill sits over the camera's bottom-right corner, where the stack of
shots is (`DocumentCapture.tsx:2379`), so a tap there leaves the scanner. It also covers +
Add's Cancel, BatchReview's "Read N documents" and the File library viewer.

**How sure:** likely. **iPhone?** No, Chrome 390 shows it in a minute.

**Fix:** change `both` to `backwards`. That one word removes the stacking context once the
fade ends.

### 6. Most forms keep their work only in memory

**Background:** iOS ignores `beforeunload`, so `useLeaveGuard` (`lib/leaveGuard.ts:9`) does
nothing there. iOS also reloads a backgrounded tab freely. Only three forms autosave: new
invoice and new receipt (`useFormDraft`) and the Free page (`free-invoice-draft`).

**Unprotected:**
- Editing a draft invoice: `invoices/[id]/page.tsx:113-122`.
- Quotes, new and edit: `components/quote/QuoteForm.tsx:45`.
- The quote-request list: `RequestForm.tsx`.
- `PriceForm.tsx`, including on the supplier's public `/r/` page. A supplier switching apps
  to look up prices is the textbook case.
- Settings: it has a working link/Back guard but nothing behind it for a reload.
- Each short, but many: new client (including a photographed contact), the client and
  receipt inline edits, Needs review, mileage, expenses, recurring, feedback, and the pages
  held in memory on `/copy`.

**How sure:** certain that nothing is kept. Likely that he loses work this way. **iPhone?**
Only for the app-switch reload.

**Fix:** add `"quote"` and `"invoice-edit:<id>"` kinds to `formDraft.ts` (with their keys in
`PERSONAL_LOCAL_KEYS`), and lift Settings' click/popstate guard into `leaveGuard.ts` for
the rest.

### 7. Settings never shows the iPhone push instructions in a Safari tab

**Where:** `settings/page.tsx:983` tests `!pushSupported()` before `isIosNotStandalone()`.
iOS exposes `PushManager` only inside a home-screen app, so in a tab the first branch
always wins.

**What he sees:** "This browser doesn't support push notifications." The "add to Home
Screen first" paragraph can never appear on an iPhone.

**How sure:** certain. **iPhone?** A ten-second check.

**Fix:** test `isIosNotStandalone()` first, and make it use `isIOS()` from `platform.ts`.
It sniffs the user agent only, which misses an iPad.

### 8. "Press Copy link again" can never work

**Where:** `invoices/[id]/page.tsx:359-372` and `quotes/[id]/page.tsx:316-331` await
`ensureLink()` before `clipboard.writeText`. `ensure` (`storage.ts:1645`, `:1709`) always
reads Supabase first, even when the link is already in state, so the retry loses the tap
exactly as the first press did. `quotes/requests/[id]/page.tsx:224-231` has the same shape,
but only on the first copy, and the link is shown there.

**What he sees:** the error every time, until he selects the text by hand.

**How sure:** likely. **iPhone?** Yes.

**Fix:** with the link in state, call `writeText` synchronously. Without it, pass a promise
for the URL into `navigator.clipboard.write([new ClipboardItem({"text/plain": …})])`, which
Safari allows.

### 9. CSV and JSON exports revoke the file before Safari saves it

**Where:** `lib/exportCsv.ts:18` and `lib/exportJson.ts:10` call `revokeObjectURL` straight
after `click()`. That is exactly what `saveFile.ts:10-13` already guards against. It covers
the invoice, receipt and client CSVs and Settings' download of my data, which is built after
many awaits and can be tens of MB.

**What he sees:** nothing, or "Safari can't download this file".

**How sure:** likely. **iPhone?** Yes.

**Fix:** route both through `saveBlob` / `saveText`.

### 10. Downloads in general, and in the home-screen app especially

- **Revoke timing:** `saveFile.ts:13` revokes after 5 s. iOS first asks "Do you want to
  download…?", and a revoke before he answers can fail the download. FileSaver.js waits
  40 s. Revoke after 60 s or on `pagehide`.
- **The home-screen app:** it has historically handled `a.download` blobs badly, with
  nothing happening or a viewer with no way back. Prefer the share sheet there, which has
  Save to Files.
- **Save all:** `convert/page.tsx:142` fires several downloads in one tick, and iOS may keep
  only the first.
- **Two paths:** jsPDF's `pdf.save` (`invoicePdf.ts:78`) is a different download path from
  `saveBlob`.

**How sure:** possible. **iPhone?** Yes, in both Safari and the home-screen app.

### 11. "Add a receipt by hand" photo box opens only the camera

**Where:** `receipts/new/page.tsx:352-357` sets `capture="environment"`. iOS honours it, so
Photo Library and Files can't be reached, under text that says browse.

**How sure:** certain.

**Fix:** drop `capture`, so iOS offers Take Photo, Photo Library and Choose File. Also clear
`value` in `onFile` (`:150`), so picking the same file again fires.

### 12. The first Share press does nothing and says nothing

**Where:** `components/scan/JustTheFile.tsx:51-70` calls `navigator.share` after
`await make()` (a dynamic import plus building the PDF), so the tap's activation is gone and
`share()` throws `NotAllowedError`. A bare `catch {}` treats that as "closed the sheet".
`/copy` (`copy/page.tsx:126-131`) at least says "Press Share again".

**How sure:** likely. **iPhone?** Yes.

**Fix:** build the PDF when the panel opens, and handle `NotAllowedError` as `/copy` does.

**Same risk:** `SaveAsMenu.tsx:33` (picture), `SaveThese.tsx:54` (zip or PDF of a period)
and `files/page.tsx:145` click a download link long after the tap. Possible; if it bites,
use SendInvoicePanel's "Ready — tap to save".

### 13. A supplier's document silently fails to open

**Where:** `quotes/requests/[id]/page.tsx:237-242` and `AnswerEntry.tsx:131-135` call
`window.open(url, "_blank")` after awaiting a signed URL. iOS blocks it as a pop-up, the
`null` it returns is ignored, and no message shows.

**How sure:** likely. **iPhone?** Yes.

**Fix:** sign the URL when the row loads and render a real link. Or open a window
synchronously and set its address after the await.

### 14. Choosing many photos at once can crash the tab

**Where:** `UploadFilesButton.tsx:47`, `DocumentCapture.tsx:1984` and `scanHandoff.ts:105-121`
decode every file in parallel, each as a full data URL, an `<img>` and a canvas. A 12 MP
photo is about 48 MB decoded.

**Second failure:** past Safari's canvas memory cap, `getContext` returns null, and
`imageDownscale.ts:25` then passes the original 4-5 MB image through unscaled.

**What he sees:** with 20 or more photos, "A problem repeatedly occurred", a reload, and the
selection is gone.

**How sure:** likely for big batches. **iPhone?** Yes, to find the threshold.

**Fix:** decode one or two at a time, from an object URL or
`createImageBitmap(file, {resizeWidth})`, and set the canvas to 0×0 afterwards.

### 15. Canvases are never released, and a blank page can be saved

**Where:** `renderCapture` (`DocumentCapture.tsx:1849-1891`) leaves `frame`, the
3200×1800 still (about 23 MB) and `out` alive. So do `greyThumb`, `drawTurned`, `workGrey`
and the canvas in `imageDownscale.ts:21`.

**Why it matters:** over iOS's total canvas memory limit, `toDataURL` returns `"data:,"`,
and `downscaleImageDataUrl` passes anything that isn't `data:image/` straight through.

**What he sees:** a blank page can land in the batch.

**How sure:** possible, on a long batch. **iPhone?** Yes.

**Fix:** zero the canvases in `finally`, and treat `"data:,"` as a failure. Also delete the
OpenCV images in a `finally` when `warpPerspective` throws (`:1891`).

### 16. The capture watchdog can drop a shot while the still is being taken

**Where:** `watchFrames` (`DocumentCapture.tsx:1300-1316`) gives up after 1.8 s, while
`takePhoto` is allowed 3 s. If iOS freezes the preview while it reconfigures for the still,
the stream restarts and `capture()` returns early.

**What he sees:** he held still and nothing happened: no flash, no shot, no message.

**How sure:** possible. The harness stubs ImageCapture. **iPhone?** Yes.

**Fix:** skip the watchdog while a capture is in flight, and say so when a shot is dropped.

### 17. Safari tabs forget everything after 7 days without a visit

**Why:** ITP clears all script-writable storage after 7 days of Safari use without visiting
the site. The home-screen app is exempt. Here that is:
- the Supabase session (`supabaseClient.ts:10`);
- the new-invoice and new-receipt drafts, so `DRAFT_MAX_AGE_DAYS = 30` is effectively 7 in
  a tab;
- the Free-page draft and signature;
- the theme, tip counts, `scanner-mode`, `scan-engine`, `camera-allowed` and
  `last-account`.

**What he sees:** after a week away in a Safari tab, he is signed out (sign-in and the
people check again), the tips return, the theme resets and kept drafts are gone.

**How sure:** certain, as documented WebKit policy. **iPhone?** To observe it.

**Fix:** steer people to the home-screen app. Don't promise "a week away" for drafts in a
tab.

### 18. The home-screen app and Safari are two separate devices

**Why:** the two keep separate storage, and iOS never opens a link into a home-screen app.

**What he sees:**
- A sign-in, the theme, `scan-engine` or a draft in one is not in the other.
- The password-reset link is link-only (`SignInCard.tsx:188`, `settings/page.tsx:490`), so
  it sets the new password in a Safari session and leaves the app signed out, with nothing
  saying so.
- Tapping the link in the sign-up email, instead of typing the six-digit code, confirms him
  in Safari while the app waits on the code screen.

**Correction to CLAUDE.md:** "open `/scan?engine=gemini` once" can't be done in the
home-screen app, which has no address bar. The picker shows there whenever the key is set,
so switch it from the picker.

**How sure:** certain. **iPhone?** To observe it.

**Fix:** a code-based reset (`verifyOtp` type `recovery`). When the app is running from the
home screen, the email screen should say "type the code here, don't tap the link".

### 19. His own opens of a customer link can push "your customer opened it"

**Where:** `PublicInvoiceView.tsx:27` and `PublicQuoteView.tsx:49` recognise the owner by an
`sb-*-auth-token` key in localStorage. Signed in only in the home-screen app (or cleared by
ITP), his own tap on an `/i/` link from WhatsApp opens in Safari and counts as the
customer's open, which sends the first-open push.

**How sure:** likely. **iPhone?** Yes.

**Fix:** add `#o` to the app's own "view" buttons, or word the push "opened (possibly by
you)".

### 20. No way back inside the home-screen app on several pages

**Where:** `invoices/[id]`, `invoices/new`, `receipts/new`, `receipts/review` and
`clients/new` have no Back or Cancel link. The home-screen app has no back button, so the
Menu is the only way out. `quotes/[id]`, `quotes/requests/[id]` and the statement page do
have one.

**How sure:** likely. **iPhone?** Yes, for whether the edge-swipe works.

**Fix:** a "← Invoices" style link under each heading.

### 21. Larger text: sheets and rows that run off the screen

All of these reproduce in Chrome 390 with the root font raised. `test-big-text` covers none
of these screens.
- **+ Add** (`AddAnything.tsx:59-63`): about 680 px tall against about 660 px visible, with
  no max height and no scroll, so "Scan it" is cut off at any larger text. Add
  `max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain`.
- **The Free-page bottom bar** (`FreeInvoiceBuilder.tsx:518`): four buttons that don't wrap.
  At large text More goes off the edge, taking Save as, Next invoice and Save to my invoices
  with it. Wrap the row, or fold Print into More.
- **Invoice and quote line rows** (`invoices/new/page.tsx:965-997` and the same rows
  elsewhere): the ✕ gets one of 12 columns but has `min-w-11`, and the price boxes are
  narrow. Stack them on phones.
- **Safari's aA control** is page zoom (at 200% the page lays out about 195 px wide), not
  Dynamic Type, which is what `test-big-text` imitates. Add a Chrome check at 195 px.
- **Camera error screens** (`DocumentCapture.tsx:2207-2240`): centred, can't scroll, inside
  `touch-none`. The banner is `line-clamp-2` (`:2263`).
- **`SaveAsMenu.tsx:119`** (`w-64`, right-aligned) can start off the left edge when its
  button wraps, including on the customer's `/i/` and `/q/` pages. Add
  `max-w-[calc(100vw-2rem)]`.

**How sure:** likely.

### 22. Landscape: nothing pads the sides

**Where:** with `viewportFit: "cover"`, the header (`AppShell.tsx:127`), `<main>` (`px-4`)
and the camera's Back button and bottom row (`DocumentCapture.tsx:2113`, `2256`, `2371`) use
only the top and bottom insets. iOS ignores the manifest's portrait orientation for a web
app as far as I know.

**What he sees:** the app name, text edges and the camera buttons sit under the Dynamic
Island side.

**How sure:** certain if he rotates. **iPhone?** Yes.

**Fix:** `padding-inline: max(1rem, env(safe-area-inset-left/right))` on the header, main
and the camera bars.

### 23. The keyboard and fixed bars; no scroll lock behind overlays

- **No scroll lock:** nothing locks the page while a sheet is open, and there is no
  `visualViewport` handling. Dragging the backdrop of + Add or the viewer scrolls the page
  underneath. BatchReview's list (`BatchReview.tsx:75`) lacks `overscroll-contain`.
- **Fixed bars and the keyboard:** with the keyboard up, the pill, the Free-page bar and
  Settings' sticky save bar (`settings/page.tsx:931`) hide behind it or float mid-screen.
- **The File library viewer** (`files/page.tsx:269-270`): pads the top for the notch but not
  the bottom, so Previous/Next sit in the home-indicator strip. It also holds an email form
  inside the photo overlay, which slides around under the keyboard.

**How sure:** certain for the viewer's bottom padding; likely or possible for the rest.
**iPhone?** Yes.

### 24. The offline page is probably stuck on "Loading…"

**Where:** `/offline` is cached only when `sw.js` itself changes (`sw.js:53`). Its server
HTML is just "Loading…" (`AppShell.tsx:236`, while auth loads), and the chunks it needs are
trimmed after about three builds.

**What he sees:** in a van with no signal, a few deploys later, "Loading…" for ever. This is
the home-screen app's only offline screen.

**How sure:** likely. Not iOS-only. **iPhone?** No: Chrome offline after two deploys shows
it.

**Fix:** let `/offline` render while auth is loading, or serve a static `offline.html`, and
re-cache it on each navigation.

### 25. Smaller items

- **WebP on `/convert` is a PNG on Safari** (`convert.ts:452`, `canvasBlob` `:116-123`). The
  "smallest" option is the biggest. Certain up to Safari 18; check his iOS. Check
  `blob.type`, and hide WebP where it can't be encoded.
- **Photos on `/convert` may come out sideways**: `createImageBitmap(file)` at
  `convert.ts:127` has no `imageOrientation: "from-image"`, which `DocumentCapture.tsx:1755`
  has. Possible.
- **Camera tip and timeout in the home-screen app**: `SAFARI_CAMERA_TIP` (`camera.ts:21`)
  says aA → Website Settings, which doesn't exist there, and the 8 s timeout includes the
  time spent reading the prompt. Possible.
- **`camera.ts` comments about Safari's Permissions API**: these may be out of date. Safari
  16+ answers `"camera"`, usually `"prompt"`, which would show the "asked every time" tip on
  each open. Check with `navigator.permissions.query({name:"camera"})` in Web Inspector.
  Likely.
- **The "Paid" haptic**: never felt on iOS 17 and earlier (no `navigator.vibrate`). On 18+
  the switch trick fires after network round trips, outside the tap. Call `haptic()` in the
  click itself.
- **Wake lock** in the home-screen app before iOS 18.4 resolves but doesn't keep the screen
  on. Harmless.
- **Long invoices as pictures or PDF**: `invoicePdf.ts:55-59` and `saveFile.ts:27-34` draw at
  pixelRatio 2, and a sheet over about 4.7 A4 pages passes Safari's 16.7 MP canvas limit.
  The arithmetic is certain; such invoices are rare.
- **Share with file plus text** (`SendInvoicePanel.tsx:76`): WhatsApp on iOS commonly drops
  the text, so the `/i/` link never reaches the customer. Likely. Say so, or share the link
  separately (TextCustomer already does).
- **Notification taps** (`sw.js:133-135`): `client.url.includes("/")` matches any window and
  focuses it where it was, instead of navigating. Use `client.navigate(url)`. Possible.
- **`window.print()` from the home-screen app**: `afterprint` timing could drop the Free
  invoice's print portal before iOS lays out the page. Possible; iPhone only.
- **Forms**:
  - The customer email on the client edit form has `autoComplete="email"`
    (`clients/page.tsx:386`), so QuickType offers his own address. The new form deliberately
    uses `off`. Certain.
  - The VAT number, company number, scan invoice number and invoice prefix boxes lack
    `autoCapitalize="characters" autoCorrect="off" spellCheck={false}`.
  - The exchange rate is read with `Number()` (`fx.ts:87`, `receiptAmounts.ts:27`), so
    "1,17" is refused.
  - The "Min total" filter uses `parseFloat` (`invoices/page.tsx:173`).
  - `type="month"` (`expenses/page.tsx:171`) misses the `input[type="date"]` fix at
    `globals.css:454`.
- **Unguarded storage**: `localStorage.getItem` in a `useState` initialiser at
  `scan/page.tsx:429` has no try/catch, so "Block All Cookies" crashes `/scan`. Every other
  storage call is guarded.
- **Storage space**: the Free-page signature is stored twice, once inside the draft that is
  rewritten on every keystroke. That is the only realistic way to fill the ~5 MB store, and
  `writeFormDraft` / `writeFreeInvoiceDraft` then fail silently.
- **The invite share** says "Couldn't share it" when the sheet is simply closed
  (`InviteCard.tsx:43`). Certain, minor.
- **`title`-only text never shows on touch**: the "Emailed to you" tile
  (`receipts/page.tsx:732`) and truncated supplier names (`Compare.tsx:100`, `:145`).
- **`vh` sizes** (`max-h-[70vh]`/`[80vh]`/`[45vh]`) and `min-h-screen` on `body`
  (`layout.tsx:71`, `:75`) measure against Safari's toolbar-hidden height. Use `dvh`/`svh`.
- **Status bar**: `statusBarStyle: "default"` with manifest `theme_color` #171717 and no
  `theme-color` meta may not match the light or dark theme. iPhone only.

## Checked and fine

- **Full-screen overlays** are `fixed inset-0`, not `100vh`. The camera, BatchReview, + Add,
  the Free-page bar, Settings and the pill pad for the home indicator.
- **Hover styles** don't stick on touch (Tailwind v4 gates `hover:`), and
  `-webkit-text-size-adjust` is set.
- **Money inputs**: all 22 use `inputMode="decimal"`, and `amountOrNull` reads "12,50". The
  only 4 `type="number"` inputs are whole numbers.
- **Date inputs** (35) get the global iOS width and appearance fix. No `autoFocus` on a text
  box, and no `datalist`.
- **The signature pad** uses pointer events, `touch-none` and is DPR-aware. A long press
  might raise the loupe; add `select-none [-webkit-touch-callout:none]`.
- **Video**: `playsInline` and `muted` are set, `play()` rejection is handled, tracks stop on
  unmount, and ImageCapture, torch and zoom are feature-checked.
- **Pickers and OpenCV**: every programmatic `input.click()` runs inside the tap, and
  `CaptureButton` resets `value`. The per-tick OpenCV images are freed, and pdf.js canvases
  are capped and zeroed.
- **Push**: permission is asked synchronously from the tap, and every push shows a
  notification, so iOS's silent-push revocation can't trigger. `appBadge` is feature-checked.
- **Text links**: `smsHref` uses `?&body=`, which works on iOS.
- **Service worker**: `skipWaiting` + `claim`, `/api` never cached, OpenCV cached under
  `/vendor/`.
- **The manifest** is consistent, and iOS/iPad detection in `platform.ts` / `install.ts`
  handles `maxTouchPoints`.
- **Every other storage call** is in try/catch, photos are kept out of the form drafts, and
  the scan handoff is downscaled.

## Cheapest high-value fixes, if somebody picks this up

All can be proved in the harness except #3:
- #1, the one CSS rule;
- #5, `both` → `backwards`;
- #2, NumberInput;
- #7, swap two branches;
- #9, two exports onto `saveBlob`;
- #11, drop `capture`;
- #3, the camera `mute` handling, which needs the phone.
