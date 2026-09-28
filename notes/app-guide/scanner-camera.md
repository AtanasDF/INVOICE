## The camera

Written 2026-09-28 by reading `src/components/DocumentCapture.tsx` (2,292 lines),
`src/lib/camera.ts`, `src/lib/platform.ts`, `src/components/CaptureButton.tsx`,
`src/components/scan/BatchReview.tsx` and `src/components/scan/PagesStrip.tsx`. Every number
below is the constant in the file, not a recollection.

**The one thing to hold on to before the detail:** the camera costs nothing to run. No model
call, no paid API, no upload — the page-finder, the crop and the straightening all happen on
the phone. What costs money is the **reading** that happens after the photo, and that is
limited today (see *Free, gated or not built* at the end of the camera screen).

---

### The camera screen — no route of its own

**What it is for.** Point the phone at a receipt or a bill and it finds the paper, waits for
the phone to be still and in focus, takes the photo by itself, cuts out the page and
straightens it. In a run it keeps going for the next document without being reopened.

**How you get there.** It has **no address**. It is a full-screen layer (`DocumentCapture`)
that opens over whichever page asked for it:

| Page | How the camera opens | One shot or a run? |
|---|---|---|
| `/scan` | opens **by itself on arrival**, or "Use the camera" | a run (several documents) |
| `/scan` again | "Add another page", "Retake", "Start a new document", "Scan more" | one shot each |
| `/copy` | "Take photos" | a run (pages of one file) |
| `/invoices/new` | the scan-to-fill button | one shot |
| `/clients/new` | scan a business card | one shot |
| `/free-invoice` | "Start from an old invoice" (`?start=photo`) opens it on arrival | one shot |

Reached from the dashboard's **Scan a receipt or bill** tile, from **+ Add → Scan it**, and
from **Tools → Scan** in the header menu.

**It is not a route, and that has a consequence.** Nothing is pushed onto the browser's
history when the camera opens, so the phone's back gesture or the browser's Back button
leaves the page *underneath* rather than closing the camera — and the "Discard N scans?"
question that guards the Back arrow never runs. The round Back arrow top-left is the only
in-app way out. (Read from the code; not tested on the device.)

#### What is on it, in screen order

**Top strip** (one row, inside the safe area, so nothing sits on top of anything else):

1. **Back** — round black arrow, always there. With scans in the stack it asks
   `Discard N scans?` first, then stops the camera and closes. It replaced a "Cancel" in the
   bottom bar that was easy to miss entirely while stuck on a black screen.
2. **The hint pill** — centre, black, at most two lines. **When there is nothing to say it is
   an invisible 40px strip that is still tappable**, and tapping it toggles the debug readout
   (below). That is deliberate: the readout matters most exactly when nothing is being found.
3. **Torch** — round button, only when the camera reports having one, only while live. White
   with a dark icon when on.

Stacked under that row:

4. **The page-finder line** — `Getting ready — the first time takes a moment. You can take
   the photo yourself now.` while OpenCV downloads, or
   `Edge detection unavailable: <the real error>` when it failed. The error text is never
   softened: it is the thing somebody will screenshot. Capped at 140 characters.
5. **The debug readout** — see below.
6. **Barcode banner** — a white card, `Barcode detected: <value>` and **Dismiss**. **Nothing
   is done with the value**: it is not saved, not put in any form, not read by anything. It
   only appears where `window.BarcodeDetector` exists, which is a Chromium API — so on iPhone
   Safari this banner does not appear at all.

**Over the live picture:**

7. **Four corner brackets** — an A4 portrait frame, centred, 80% of the shorter side wide
   (capped at 90% of the height). **White** when nothing is found, **green** when a page is.
   This is what you line the page up with whether or not the page-finder is working.
8. **The page outline** — the found page traced in green (`#4ADE80`), 3px, filled green at 12%
   opacity when found and **32% when it has locked on**, eased 35% of the way per frame so it
   glides instead of jumping every 150ms.
9. **A green border round the whole screen** whenever a page is found and the camera is live.
   A failure replaces it with a red border and a red banner in the hint's place.
10. **A white flash** for 150ms when the photo is actually taken (after the still comes back,
    not when the decision is made — the hint asks you to keep still until then).
11. **A focus ring** — tap anywhere on the picture: a white circle appears there for 800ms and
    the camera is asked to focus on that point.

**Bottom of the picture area:**

12. **The tip** — shows on its first three appearances then never again; **Got it** ends it for
    good. Counted per device in localStorage.
    - `tip:scanner-auto`: *"Hold the phone over the page and keep still: it zooms in and takes
      the photo by itself."* (or, with auto-capture off, *"Line the page up inside the corners
      and tap the button to take the photo."*)
    - `tip:scanner-stack` once there are scans: *"Keep going for the next page or document.
      Tap the stack in the corner to check your scans and read them."*
13. **Zoom** — a slider where the camera exposes real hardware zoom; otherwise a **1× / 2×**
    pill pair, which is a crop of the picture rather than a lens zoom.
14. **`Auto-capture: on`** and **`Auto-zoom: on`** — small underlined text. Both default on,
    both remembered **per device** (`scanner-auto`, `scanner-auto-zoom`).
15. **`Use the native camera instead`** — iPhone only.
16. **The Safari permission tip** (`tip:camera-allow`) — iPhone only, and only when the camera
    actually had to ask this time: *"Asked for the camera every time? Set it once: iPhone
    Settings → Safari (under Apps) → Camera → Allow. Or in Safari: aA → Website Settings →
    Camera → Allow."*

**Bottom bar** (black, inside the safe area):

17. **Photo-library button**, left — opens the file picker (`image/*` and PDF; several at once
    in a run).
18. **The shutter** — a 64px circle, white ring normally, **green ring when a page is found**.
19. **The stack**, right — only in a run with at least one scan. A small thumbnail of the last
    shot with a **green count badge**, and a second card rotated behind it when there is more
    than one. Tapping it opens the review sheet.
20. **When the camera is not usable**, all three are replaced by one full-width white
    **Upload a photo or PDF** button. That is deliberate: upload is the only thing that
    actually works then, so it gets the primary button rather than the smallest text.

**Gestures.** Two fingers pinch to zoom — the lens where the phone has one, otherwise a crop
capped at 3×. The browser's own pinch and double-tap zoom are switched off inside the camera.
**The screen is kept awake** the whole time the camera is live.

#### How auto-capture decides to fire

The detector runs **every 150ms**, on a **480px-wide** copy of *only the part of the camera
frame the screen is actually showing*. That last part matters and is not obvious: the video is
cover-fitted to the screen, so a portrait phone sees a middle strip about **62% of a 4:3
sensor's width**. **A page wider than that strip runs off both sides and is rightly not
found** — it has to be held further back or the phone turned. A landscape page is not a
special case.

A shape counts as a page when:

- It has **four corners** and covers at least **6%** of the work frame; **or** at least
  **1.2%** if it "looks like paper" — the middle at least **18 grey levels** lighter than a
  ring around it, every corner at least **1.5%** clear of the frame edge, the long side at
  most **8×** the short one, and at most **20%** of the surrounding ring covered in edges.
  (That small path is a till receipt on a table seen from standing height, and it is what
  auto-zoom then zooms in on.)
- **And it has printing on it.** Edges *inside* the shape, measured across the middle 85% of
  it, must be at least **1.5%** of its area. In the debug readout's units (thousandths) that
  is `ink` ≥ **15**. Measured on the test clips: **a wall reads 0, an A4 invoice 110, a
  receipt on a patterned floor 253.**

  **This exists because of the kitchen tiles.** Atanas, 2026-09-26: *"he scans the tiles in my
  kitchen and he takes the picture of that... you shouldn't be able to scan tiles just because
  it has an edge."* A tile passes every other test easily — large, rectangular, lighter than
  the grout, nothing printed nearby. What a document has and a wall hasn't is print, so print
  is what is measured.

  **The honest cost: a blank sheet of paper fails this too.** A blank page never turns green
  and never auto-captures. That was accepted knowingly — it stops the lock-on and the
  automatic shot, never the shutter, so a blank page is still one tap away.
- A page's corners are re-fitted from straight lines through its **sides** rather than taken
  from the simplified outline, so a folded-over corner or a wavy edge does not skew the crop
  or make a corner flip between the two ends of the fold as the page moves. A torn or curled
  receipt goes through its convex hull. A curled page's curved sides are *not* flattened.
- What is drawn, checked and captured is the **per-corner median of the last 3 detections**,
  so one misread tick does not restart the count. A page **missed for up to 2 ticks** keeps
  its outline and its count.

Then, to fire by itself, all of this at once:

| Condition | The number |
|---|---|
| Held still | **1,100ms**, no corner drifting more than **2%** of the work width per tick |
| Big enough | **9%** of the frame by area, **or** spanning **50%** of it on its long axis (so a till receipt counts) |
| In focus | sharpness (variance of the Laplacian) at least **12** absolute **and** at least **70%** of the sharpest frame in this run |
| This tick agrees | the raw reading within the same 2% of the median |
| Not blocked | torch not about to come on, review sheet not open, camera live, and in a run the previous page has left |

**A run that stays still for 2,500ms fires regardless of sharpness**, so a dim room can never
dead-lock the scanner.

The sharpness test is a *"the lens has settled"* check, not a quality bar. And **1,100ms was
600ms**: Atanas's first real receipt, 2026-09-22, was photographed before the phone had
focused. Another half-second is the fix.

#### Auto-zoom

It goes by **span**, not area — how much of the view the page fills along whichever axis it
fills most — because a till receipt can run the full height of the screen while covering
almost none of its area.

- A page held still spanning **under 50%** of the view is zoomed toward **75%**, after
  **350ms** of settling, in steps of at least **1.15×**, with an **800ms** cooldown between
  steps so it cannot hunt in and out.
- The ceiling is **4× on the lens** where the camera exposes zoom (real detail), or **2.5×**
  as a crop where it does not. Never so far that a corner comes within **6%** of the edge.
- **It also zooms out.** Zoomed in with a corner already inside that 6% — the phone came
  closer, or the zoom went too far — it steps back out to where the page just fits (×0.95),
  not all the way to 1.
- A page **lost for 1,500ms** zooms right back to 1× so the next one can be found.
- **Zooming by hand turns auto-zoom off for that session** — the slider, the 1×/2× pills or a
  pinch. Turning the switch off undoes auto-zoom's own zoom but never one you chose.
- While zoomed past 1×, *every* candidate has to look like paper. Without that the scanner sat
  zoomed in on a table printed *on* a receipt and never backed off (2026-09-22).

#### The torch, and when it comes on by itself

- The button exists **only when the camera reports a torch** in its capabilities. That is a
  Chromium capability. **Worth checking on the iPhone: if the torch button is not there, the
  automatic torch is not there either**, and what a dark kitchen actually gets is the hint,
  not light.
- It comes on **by itself** when the average brightness of what is on screen is under
  **55/255** for **400ms**, and the hold-still count restarts in the new light. Auto-capture
  will not fire while the torch is pending.
- **Touching the torch button once stops it ever coming on by itself again** for that camera
  session — by hand means by hand.
- With no torch available, after **1,200ms** dark the hint says **"It's dark here — more light
  helps"**.
- Brightness is measured *before* edge detection, so the torch and the dark hint work while
  OpenCV is still downloading or has failed altogether.
- A camera that refuses the torch makes the button **disappear** rather than leaving a button
  that does nothing.

#### What the hint says, and when

In priority order — the first that applies wins. These are the exact words:

1. `Hold still — taking the photo…`
2. `Got it — 3 scanned. Next document…` (in a run, waiting for the page to be swapped)
3. `It's dark here — more light helps`
4. **nothing at all** — when the page-finder failed, or no page is found. This is on purpose:
   the corner brackets already show where the page goes. Atanas: *"everyone knows what to
   do."*
5. `Hold still — zooming in`
6. `Move the page to the middle`
7. `Move closer` — only when zooming cannot do it for you
8. `Ready — tap to capture` (auto-capture off)
9. `Hold still…`

Prefixed with `Page 2 · ` when the camera was opened to add a further page to a document.

#### The hidden debug readout

**Tap the hint pill** — or the invisible strip where it would be — to toggle it. It refreshes
twice a second and reads:

```
cv:ready video:1920x1080 ticks:412 quads:389 cov:23% ink:110 sharp:64 tick:38ms coach:hold auto:on
```

- `cv` — page-finder: loading / ready / failed
- `video` — the camera's real resolution
- `ticks` / `quads` — detection ticks since opening, and how many found a page
- `cov` — % of the frame the page covers
- `ink` — printing inside it, thousandths; the tiles number, threshold 15
- `sharp` — focus; floor is 12
- `tick` — **milliseconds the last detection took. This is the number that says whether the
  phone is keeping up.**
- `coach` — line / zooming / centre / closer / hold
- `auto` — auto-capture

It is the only way to see what the detector is doing on a phone in a kitchen. It does **not**
report the torch, zoom level or whether a still was used.

#### The photo that actually gets saved

1. Where the browser can take a real camera still (Safari 18.4+, Chrome), it asks for about
   **3200×1800** — Safari hands back its smallest still unless asked, and its largest can be
   48MP.
2. That still is used **only if** it has at least 1.2× the video's pixels, it clearly shows
   what was on screen (a correlation of 40px greyscale thumbnails of at least 0.6), it is at
   least 60% as sharp as the video frame, and the page can be found again in it within 5% of
   the frame diagonal of where the video had it. **Otherwise the video frame is used** — no
   guessing. A still lying on its side is turned whichever way clearly matches the screen; if
   both ways look about the same (a centred page on a plain table), the still is dropped.
3. The page's four corners are then perspective-warped square, so what is saved is **the page
   alone, straightened**.
4. **Then it is downscaled to 1,600px on the long edge at JPEG 0.8**, about 300–500KB. So the
   3200px still buys sharpness *within* those 1,600 pixels, not a bigger file. Every path —
   in-app camera, iPhone camera, upload — goes through the same downscale, so none of them can
   reintroduce the 4–5MB-per-receipt problem.

A tap on the shutter during the grace period after a page was lost saves the **whole frame**
rather than cropping to where the page was. A tap right after a move crops to this tick's
reading, not the median that is still catching up.

#### Scanning several documents one after another

Only on `/scan`'s first capture and on `/copy`. Everywhere else the camera takes one photo and
closes.

After each shot the camera **stays open**, the shot joins the stack, and auto-capture **will
not fire again until the page has left the frame**: lost for 2 ticks, or moved more than 20%
of the work width, or shrunk below 60% of what was taken — **and** at least 900ms has passed.
Meanwhile the hint says `Got it — N scanned. Next document…`. That is what stops one page
being photographed twice.

**There is no cap on how many scans the stack can hold.** (`/scan`'s *pages of one document*
cap is 20, on the one-shot path, and it says so: *"20 pages is the most one document can
have."*)

#### The review screen

Opens as a full-screen sheet over the live camera (`BatchReview`).

- **`Check your scans`** — or `Check your photos` on `/copy`.
- Under it: *"5 scans, 3 documents. Tap "Page of previous" when a scan is the next page of the
  one before it."* (`/copy`: *"5 photos. They go into one file in this order."*)
- A grid of cards, two across on a phone. Each has the thumbnail, a badge reading **`Doc 2`**
  or **`Doc 2 · page 2`**, a **`Page of previous`** checkbox (not on the first card, never on
  `/copy`), and **`Remove`**. A card that is a further page is drawn with a **dashed border**.
- Bottom: **`Keep scanning`** and **`Read 3 documents`**. On `/copy`: **`Take more`** and
  **`Use 5 pages`**.
- Removing a document's *first* page promotes its next page to be the new first page, rather
  than letting it fall into the document before it.
- The sheet takes keyboard focus when it opens and hands it back to whatever opened it;
  everything behind it is made unreachable, because the Capture button and a Back that
  discards the whole batch were one Tab away.
- **`Keep scanning` explicitly restarts the video**, because the sheet covering it is what
  paused it. Atanas's exact report: *"if you look at the scans, and then you click on keep
  scanning, it doesn't open the camera... although the flashlight works, just the camera."*

#### The iPhone's own camera, as the alternative

A per-device setting, `scanner-mode` in localStorage: **`inapp`** (the default) or
**`native`**.

**Where it is offered:**
- **`Use the native camera instead`** — bottom of the live camera, iPhone only.
- **`Use the iPhone camera instead — it doesn't need this permission`** — on the denied,
  timed-out and stalled screens.
- **`Use the iPhone camera instead`** — on `/scan`'s own camera-blocked panel.
- Getting back: **`Use the in-app scanner instead`**.

**What that screen is instead:** black, with *"Take a clear, well-lit photo of the whole
document."* and buttons **`Take a photo`** (or `Take the next photo`),
**`Check and read N scans`** (green), **`Upload instead`**, and the way back. The stack and the
review sheet still work.

**Nothing is detected, nothing is cropped, nothing is straightened, and the 13MB page-finder
is never downloaded.** The photo comes from the OS camera through a file input, so **it never
asks this site for camera permission at all** — which is why it still works when the in-app
scanner is blocked.

**Why it exists**, in the code's own words: iOS Safari's `getUserMedia` returns a
low-resolution, fixed-focus stream with no way to ask for better — soft images that OCR does
badly with. And the page-finder needs the *whole* document inside the frame with margin, which
fights holding the phone close enough to keep the text legible. The OS camera has neither
problem: full sensor, real autofocus, no quad to find, and it opens faster. **It stopped being
the iPhone default when auto-capture landed**, but it is one tap away.

Elsewhere in the app the same choice is made by `CaptureButton`: on an iPhone set to `native`,
the button *is* the file input, so one tap opens the OS camera — iOS only opens the camera
from a file input inside the user's own tap, and a `window.confirm` is deliberately not run
inside that tap because it would cost the gesture.

#### When the camera is refused, blocked, or stops sending pictures

Five states, each a full screen over black. In all of them the bottom bar becomes the
full-width **Upload a photo or PDF** button.

| State | What it says | What it offers |
|---|---|---|
| **starting** | `Starting camera…` | Upload |
| **denied** | *"Camera access was denied. You can allow it from your browser's site settings, or upload a photo or PDF instead."* | the Safari Settings tip (iPhone), **Try again**, the iPhone-camera escape, Upload |
| **timeout** | *"The camera didn't respond. This usually means access is blocked somewhere your browser won't report directly (an OS-level camera privacy setting is the most common one) — check there, or upload a photo or PDF instead."* | **Try again**, the escape, Upload |
| **stalled** | *"The camera stopped sending pictures. Your scans so far are safe."* | **Turn the camera back on**, **Check and read N scans**, the escape, Upload |
| **unsupported** | *"This browser doesn't support camera capture here. Upload a photo or PDF instead."* | Upload |

**Why there is a timeout at all (8 seconds).** `getUserMedia` can hang for ever rather than
reject when the camera is blocked at the OS level for the whole browser. With no timeout that
is exactly the *"stuck on Starting camera… for ever, no error, no prompt"* dead end. If the
camera then arrives late, its tracks are stopped — otherwise the phone's camera light stays on
and the camera stays unavailable to other apps until the tab is closed.

**How "stopped sending pictures" is detected.** The video's clock stops advancing for
**1,800ms**. Two causes, two different answers: if the element is merely *paused* and the
track is still alive, it is played again (which keeps the stream, the zoom and the torch); if
the stream had ever produced more than **30 frames**, the camera is reopened; otherwise this
screen is shown. The track's own `ended` and `mute` events trigger it too. **Straight from
Atanas, 2026-09-26:** *"the camera, it wouldn't take a photo, it all came black. And then I
couldn't turn the camera back on."* Before this, nothing noticed at all: the frame loop
returned early on an unready video, so it spun doing nothing while the screen showed black,
the status still said "live", and the only way out was leaving the scanner and losing the
batch.

**The permission bookkeeping** (`src/lib/camera.ts` — every camera in the app opens through
here, so the browser is asked at most once):

- Chrome and Edge answer the Permissions API for the camera. **Safari and Firefox do not**, so
  there the last open is all there is to go on.
- A **granted** camera is remembered for ever (`camera-allowed=1`). A **refusal** is written
  down **only where the browser can later correct it — never on Safari.** A stored "denied"
  there would outlast the refusal itself with no way back: "Try again" would short-circuit
  before ever reaching the browser, and the app's own Settings tip would be advice about a
  block the app was holding itself. **One mis-tap would end the in-app scanner on that phone
  for good.**
- **Try again** and **Use the in-app scanner** both forget the stored refusal first, so they
  really ask the browser again.
- A camera busy in another app is **not** remembered as denied, so it can be retried.

#### The 13MB, which is the honest answer to "it feels slow"

`public/vendor/opencv-5.0.0.js` is **13,298,869 bytes on disk, about 3.8MB gzipped over the
wire**. It is not bundled: a prebuild script copies it into `public/vendor` and it is served
with an immutable cache header, so after the first visit it comes from the browser's cache
rather than a fresh download per deploy. It is loaded as a plain `<script>`; a 20-second
timeout covers the runtime starting up. While it loads, the camera works and finds nothing,
and says so.

The dashboard warms it up two seconds after it appears — **but only for somebody who has
already used the camera**. The old guard was `navigator.connection`, **which Safari does not
implement**, so the one protection there never applied on the device the app is actually used
from: every first visit on an iPhone downloaded 13MB two seconds after the dashboard appeared,
for a screen they had not opened. That is its own answer to *"the app felt slow"* and *"takes
ages to start actually scanning"* (2026-09-22 and 2026-09-26).

#### Where it takes you next

The camera hands its result back to the page that opened it; it never navigates on its own.

- `/scan` first capture → the review sheet → `/scan`'s reading walker → **See them in
  Receipts** (`/receipts`), or `/receipts/review`
- `/copy` → the PDF builder on `/copy` (save, share or email)
- `/invoices/new` → fills the invoice
- `/clients/new` → fills the contact form
- `/free-invoice` → adds a page to the old-invoice read
- **Back** → the page underneath. On `/scan` with nothing scanned yet, Back goes to the
  dashboard (`/`).
- When the camera is unusable and the page opened it *by itself*, the page is told and gets out
  of the way: `/scan` shows a panel with **Use the iPhone camera instead**, **Upload a photo or
  PDF**, **Add a receipt by hand** (`/receipts/new`) and **Try the camera again**;
  `/free-invoice` shows the invoice instead of a black screen. A page where *you* tapped the
  camera leaves the retry to you.

#### Free, gated or not built

- **Behind sign-in: yes, completely.** Every page that can open the camera requires an account
  — `/scan`, `/copy`, `/invoices/new`, `/clients/new` and `/free-invoice` all send a stranger
  to `/login`.
- **The camera itself costs nothing per use.** No model call, no paid API, no server request,
  nothing uploaded. Taking two hundred photos costs nothing. This is worth knowing before
  deciding the free tier: the expensive thing is not the camera.
- **What costs money is the reading afterwards** — `/scan` sends the finished images to
  `POST /api/scan` (Google Gemini by default, Claude optionally), and **that is what is
  limited.** `SCAN_LIMITS` is **"on" in production**: reading a document is limited for
  **every** account today — **300 a day for an account's first seven days, then 50 a day and
  600 a calendar month**, with one self-serve top-up of another 600 per month. **Nobody is on
  a paid plan; the paid tier does not exist.** `/copy` reads nothing and is not counted
  against anything.
- **No environment variable switches any part of the camera on or off.** Everything here is a
  per-device localStorage key: `scanner-mode`, `scanner-auto`, `scanner-auto-zoom`,
  `camera-allowed`, `scan-engine`, `tip:*`. Nothing about the camera is per-account, so it does
  not follow him from the iPhone to the MacBook.
- **Half-built / not built:** the barcode reader detects a barcode and then does nothing with
  it. There is no offline queue — captures are not kept on the phone when there is no signal.
  A curled page's bent sides are found but not flattened.
- **Never tested on a real iPhone by anything but Atanas.** The whole test harness is headless
  Chrome against synthetic camera clips and a mocked database. His reports are the only
  evidence from the device this is built for.

**One live setting worth checking on his phone:** `scan-engine` is per device. If his iPhone
still has it on `claude` from the engine testing, every read there goes through the slow
reader. Opening `/scan?engine=gemini` on that phone once puts it back.

---

### Worth deciding

1. **Should the camera stay free and unlimited while the reading is capped?** Today you can
   take any number of photos for nothing, and the wall only appears when they are read. Is that
   the split you want, or should a free account be capped on photos too (simpler to explain,
   but it charges for something that costs nothing)?

2. **Keep the 13MB page-finder, or make the iPhone's own camera the default on iPhone again?**
   The download is the single biggest reason the app feels slow before the first scan. The OS
   camera downloads none of it and takes sharper pictures — but it loses auto-capture,
   auto-zoom, the green lock-on and the straightening, and every photo needs a deliberate tap.
   A middle option: keep the in-app scanner as the default but stop pre-loading it anywhere,
   so the cost is paid only when the camera is actually opened.

3. **Does the torch button appear on your iPhone at all?** If it does not, the automatic torch
   does not either, and a dark kitchen only gets the words *"It's dark here — more light
   helps"*. If so, do you want a fallback — the app turning its own screen white behind the
   camera — or is the hint enough?

4. **Auto-capture on or off for a brand-new account?** It is on. On means the phone decides
   when to shoot; off means "Ready — tap to capture" and you decide. First-timers are the ones
   who get an unwanted photo of a table.

5. **Should a blank page be scannable automatically?** Right now a page with no printing on it
   never turns green and never auto-captures — the print test is what stopped the kitchen
   tiles. You can still tap the shutter. Is that the right trade, or should blank paper count?

6. **Should the camera have its own address** (say `/scan/camera`) so the phone's back gesture
   closes the camera instead of leaving the page and silently dropping the scans?

7. **How many documents should one run hold?** There is no limit at all on the stack, and
   every document in it costs money to read. Is a cap worth having — and should the review
   sheet warn when the batch is bigger than what is left of today's 50?

8. **Are the dark and stillness numbers right for your kitchen?** "It's dark here" waits 1.2
   seconds at under 55/255 brightness; the automatic shot waits 1.1 seconds of stillness, or
   2.5 seconds if it never gets sharp. These are the two you would feel immediately if they
   were wrong.
