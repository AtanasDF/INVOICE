# Audit: the email-inbox Worker (`worker/`) — 2026-10-20, cloud, `wip/worker-audit`

**NONE OF THIS IS LIVE.** `worker/` does not deploy with the app. A push to `main` ships
`web/` through Vercel and nothing else, so every fix below sits dormant until Atanas runs
`npx wrangler deploy` from `worker/` on the Mac. The live Worker is still version
`61dc60ef-d2e0-46e0-a846-0657467811d3` (2026-10-09). Merging this branch is not enough
on its own.

## What would change for a sender, once deployed

| They do this | Today | After deploy |
|---|---|---|
| Mistype the import address (`u-` + wrong token, or any other `@invoiceover.com` name) | Accepted, then silently thrown away. They think it arrived. | Bounced at once: "There is no import address here by that name. Check the address you were given and send it again." |
| Send while the app is down or unreachable (DNS, TLS, Vercel outage) | Accepted, then silently thrown away. | Bounced: "Could not take this document in just now. Please send it again shortly." |
| Send to an address the owner has since regenerated | Bounced with "send it again shortly", which will only bounce again. | Bounced: "This import address is no longer in use. Ask for the current address and send it again." |
| Send a 3 MB scan with a long thread or big HTML newsletter body | The whole email bounced, because the body went over Vercel's 4.5 MB limit. | The scan is filed. The text is cut to 10,000 characters, and the app only keeps 2,000 anyway. |
| Attach a photo their mailer labels `image/jpg` or `image/pjpeg`, or a PDF labelled `application/x-pdf` | Not read. The owner is told it's "not a kind that can be read". | Read. |
| Attach a PDF as `application/octet-stream` with no extension (`scan0001`) | Not read. | Recognised from its first bytes and read. |
| Send "invoice to follow", no attachment, with a logo and social icons in the signature | Every icon is read by Gemini and filed as a junk receipt in needs-review. | Images under 120 px on their shorter side are left out. The email is filed by its text as before. A pasted screenshot is still taken. |
| Put a PDF in `multipart/related` (with a Content-ID) next to another attachment | That PDF is dropped and nothing anywhere names it. | Posted like any other attachment. |
| Send from Xero, QuickBooks etc., whose envelope sender is a bounce address | The row says "From: bounces+…@mailer…". | The row shows the header From, e.g. "Accounts <ap@supplier.example>". |

The owner sees no difference except fewer junk rows and more documents arriving.

## One thing the existing comment had wrong

`message.setReject()` is a **permanent** SMTP error. Cloudflare's own type definition
says so: "Reject this email message by returning a permanent SMTP error back to the
connecting client". So the sending server does **not** retry for days, as the old comment
claimed. It bounces straight back to the sender. The wording was already right ("Please
send it again shortly"), so the sender knows what to do; only the comment was wrong, and
it's corrected. Email Workers have no temporary-failure call, so a 4xx "try later" isn't
available.

## Findings, all confirmed and fixed in `worker/src/index.ts`

1. **The app unreachable destroyed the email.** `fetch` *throws* when the app can't be
   reached; it doesn't return a status. The `catch` logged the error and returned, so
   every throw lost the document exactly as the quiet return on a 500 did before
   `1564983`: the app down, a parse failure, an encoding failure. Now it rejects.
2. **Unknown recipients were dropped in silence.** Cloudflare's catch-all accepts any
   `@invoiceover.com` address at SMTP, and the Worker returned without rejecting. A token
   off by one character lost the email. Now it rejects.
3. **A 404 (address regenerated) said "send it again shortly".** That retry can only
   bounce again. It now gets its own message.
4. **The body budget didn't count the text.** `BODY_BUDGET` (4,000,000) covered
   attachments only. Proved with 1.9 M characters of text beside a 2.9 MB scan: 5.79 MB
   of JSON, over Vercel's limit, and the whole email refused. The text is now capped at
   10,000 characters.
5. **Common type aliases weren't recognised:** `image/jpg`, `image/pjpeg`, `image/x-png`,
   `application/x-pdf`, `application/acrobat`, `application/vnd.pdf`. These are mapped
   before the type check. The route's octet-stream table (`BY_EXTENSION`) is untouched,
   so `test-inbox-worker-types` still holds the two copies equal.
6. **A generic label with no useful filename wasn't rescued.** Covers
   `application/octet-stream` and also `binary/octet-stream`, `application/download`,
   `application/force-download` and `application/unknown`. The first bytes are now
   sniffed for PDF, JPEG, PNG, GIF and WebP. If the bytes aren't one of those, the file
   is still named as unreadable.
7. **A related PDF was dropped and never named.** Any part with `related: true` counted as
   signature junk, whatever its type. Now only an *image* that is inline or related counts.
8. **Signature icons were filed as receipts.** If no real attachment was readable, the
   fallback took *every* inline part, logos included. So the commonest email there is (a
   line of text and a footer with a logo) became one junk receipt per icon, each costing
   a reader call. The fallback now drops inline images under 120 px on the shorter side.
   The size comes from the PNG, GIF or JPEG header. A WebP or anything unreadable is kept.
9. **No secret configured posted `Bearer undefined`** to the app and found out from the
   401. It now refuses before sending anything.
10. **The envelope sender was posted as `from`.** Invoicing systems send from VERP bounce
    addresses. The header From (name and address) is posted now, with the envelope as the
    fallback.

## Checked and found sound (no change)

- **Nested multipart and forwarded mail.** postal-mime 3.0.0 walks nested
  mixed/alternative/related parts and parses an inline `message/rfc822` recursively. A
  forwarded email's PDF reaches `attachments` (new check).
- **Non-UTF-8 headers and bodies.** ISO-8859-1/-2 and Windows-1250 encoded words and QP
  bodies decode correctly. An unknown charset falls back to windows-1252 rather than
  throwing (`decode-strings.js` `tryDecoder`). Run in Node. workerd's TextDecoder may
  support fewer labels, and the same fallback then means garbled characters, never a
  lost email.
- **Mime types are lower-cased by postal-mime** (`Application/PDF` arrives as
  `application/pdf`).
- **A forged call.** The Worker exports only an `email` handler, so it has no HTTP
  surface. The route refuses any request without the exact bearer secret (401). The
  secret is a wrangler secret, not in `wrangler.toml`.
- **The types still match the route.** `READABLE_TYPES` equals `ALLOWED_TYPES`, the two
  `BY_EXTENSION` tables are equal, and the body shape (`token, from, subject, textBody,
  attachments[{filename,mimeType,base64}]`) is what the route reads.
- **Attachment count.** The route takes 5 and names the rest in a not-imported row. The
  Worker's budget is spent first-come, so it's spent on the five that will be read.

## Left alone (outside `worker/`, or not provable from here)

- **Duplicates after a late failure.** The route saves as it goes. A 504 after two of
  five attachments, or a Worker cut off while waiting, rejects the email, and when the
  sender sends it again those two are filed twice. That is still better than losing the
  other three, and needs-review is where they'd be seen. A real fix is an idempotency key
  (the Message-ID) checked in the route, which is `web/` and schema work.
- **How long an Email Worker may wait on `fetch`.** The route may take 300 s. Cloudflare's
  limit for an email handler waiting on a subrequest couldn't be checked here (no network
  to developers.cloudflare.com). Whether the Worker or its SMTP session is cut first
  decides whether a slow read means a bounce or a silent loss. Worth one look at the docs,
  or a `wrangler tail` on a deliberately slow read.
- **Constant-time secret comparison.** The route compares with `!==`. A timing attack over
  the internet against a 32-byte secret isn't realistic, but `timingSafeEqual` costs one
  line. That's `web/`, so it's not done here.
- **The route returns 500 if `ANTHROPIC_API_KEY` is unset**, although Gemini reads first.
  The Anthropic key is the fallback, so that's defensible. Noted, not changed.
- **A pasted screenshot alongside a real PDF is still left out**, and nothing names it.
  That's the original design, which keeps signature junk out. With finding 8's size test
  it could now be relaxed (keep inline images ≥ 120 px even when real attachments exist).
  But that changes what gets filed for every email with a large logo, so it's Atanas's
  call.

## Tests

All run without Cloudflare (Node 22 strips the types and `fetch` is stubbed):

- `harness/test-inbox-worker.mjs`: **40/40**, up from 20. The fake message now has a
  real `ReadableStream` raw and a `setReject` that's recorded. Against the old
  `worker/src/index.ts` it scores **24/40**. The 16 that fail there are exactly the
  findings above, so each check is proved to catch its bug.
- `harness/test-inbox-worker-types.mjs`: **17/17**. The reject-wording check now reads
  the `REJECT_*` constants, and a new check requires `setReject` in the `catch` too.
- `npx tsc -p .` in `worker/` clean. `npx wrangler deploy --dry-run` bundles.

## To make it live

On the Mac, after merging: `cd worker && npm install && npx wrangler deploy`. Then send
one email to a wrong `u-` address and check it bounces, then one real invoice to the
Hidefield import address. Record the new version id in CLAUDE.md beside `61dc60ef…`.
