# Do the help pages still tell the truth? (brief 16, 2026-10-20, cloud)

Branch: `claude/brief-16-cloud-queue-hrozjb` (the brief said `wip/help-truth`; this cloud
session was pinned to the branch above, so the work is there). **Not merged.**

Read: `helpFacts.ts`, `helpJourneys.ts`, `helpPrompt.ts`, `helpChat.ts`, `tips.ts` and all
28 `<Tip>` texts, `/help`, `/privacy`, `/terms`, `/security`, `/accessibility`,
`/how-to-invoice`. Each sentence that states a fact about the app was checked against
the code, not against CLAUDE.md.

## /privacy changed what it says is stored and who sees it: LOUD

The page has its own rule ("if a supplier changes, this page changes in the same commit").
Two suppliers had changed without it, and one of its central claims was false.

1. **"Anthropic can read them instead, but only on a device where you have turned that on
   yourself — it is not what happens by default." That was false, three ways:**
   - `extractStructured` (`lib/extractors.ts`) falls back to Claude whenever Gemini is too
     slow, busy, or its key is refused (`worthRetrying`, since 2026-10-15). So any scan,
     the email import and the Free page's template read can go to Anthropic with nobody
     having turned anything on.
   - `/api/contact-scan` (photograph a business card or letterhead on the new-contact
     form) **defaults to `claude`**, and the form sends no engine.
   - `/api/invoice-from-text` (describe an invoice in words) calls `"claude"` always.
   The page now says all three. Note this also contradicts CLAUDE.md's "Gemini is the
   default everywhere since 2026-10-15": two routes were missed. Switching them to Gemini
   is a code change outside this brief; **if it is made, /privacy must change in the same
   commit**.
2. **Cloudflare was not named at all.** It runs Turnstile on sign-in (live since
   2026-09-23) and receives every emailed-in receipt before the Worker passes it on. Added.
3. **Resend "sends confirming your address and any invoice or document you choose to
   email"** left out the automatic payment reminders that go to customers daily. Added.
4. **Lookups as you type were not mentioned**: addresses to postcodes.io and
   OpenStreetMap (photon.komoot.io), company names to Companies House, VAT numbers to HMRC
   (only where that check is turned on; it is not, in production). Added, saying only what
   is in the box is sent.
5. **What is kept**: added "how many documents you have had read each day and each month"
   (`scan_usage`, live since 2026-09-23 with `SCAN_LIMITS=on`).
6. **What the browser keeps**: added the signature and the unsaved invoice/receipt drafts
   (draft autosave, `formDraft.ts`; not offered back after 30 days).
7. "Last changed" moved to 20 October 2026.

Not added, deliberately: `vat_checks` (cannot be edited or removed by the account, by
design) and `help_questions` and invite codes. All three are written only when a switch
that is currently off is on (HMRC credentials, `NEXT_PUBLIC_HELP_CHAT`,
`NEXT_PUBLIC_INVITES`). The help chat line was already on the page. **When HMRC goes live,
/privacy needs a line saying a kept VAT check stays until the account goes.**

## Fixed: false

| Where | Said | Is |
|---|---|---|
| HELP_FACTS `/recurring/invoices` | "Invoices that go out again on their own, weekly, monthly or yearly." | Monthly only (`interval '1 month'`), and a **draft** is made; nothing goes to the customer. Its own Tip already said so. |
| HELP_FACTS `/recurring` | "Costs that come round again on their own" | Reminders. Nothing is created until **Log** is pressed (`recurring/page.tsx`); the cron only counts due ones for a push. |
| Tip `recurring-how` | "anything set up here is created for you on the day it is due, without you being here" | Same: it asks, on the page and the dashboard banner. |
| HELP_FACTS `/clients` | "...payment terms and bank details are kept" | `Client` has no bank details. Replaced with the reminders switch, which is there. |
| HELP_FACTS `/money` | "What came in and what went out over a period, side by side." | The page is everything owed both ways, late first (`moneyScreen.ts`). |
| Tip `money-how` | "Chase an invoice ... without leaving this page" | **Chase** is a link to the invoice page. Mark paid does stay. |
| HELP_FACTS `/jobs` | "a customer's invoices, quotes and costs" | The page loads invoices, receipts, credit notes and payments. No quotes. Rewritten around tags, as its Tip is. |
| HELP_FACTS `/` | "the four tools: scan a receipt, make an invoice, copy a document, check a company" | Five tiles: Scan a receipt or bill, Create an invoice, Write a quote, Check a company, Copy a document. |
| `/accessibility` | "checked automatically every time the app is built" | Nothing runs on build: no CI, and `npm run build` is `next build` only. The harness is run by hand. Reworded to say exactly that. |

## Fixed: misleading

- Tip `dashboard-welcome`: "customers, suppliers and expenses appear as you go". No
  supplier is created without "Add as supplier", and nothing is saved unchecked. It now
  says what is on it is filled in for you to check and save.
- Tip `scanner-auto`: "it zooms in and takes the photo" said "zooms in" even with
  Auto-zoom off. It now drops those words when Auto-zoom is off.
- Walkthrough "Send an invoice", step 1: "The number is filled in for you" while step 5
  says sending is what gives it its number. The form shows a preview ("Will be INV-… when
  you send it"); the caption now says that. (The recorded frame is unchanged; only the
  caption text moved.)
- HELP_FACTS `/files`: "Every photograph and PDF you have saved" is receipts and bills
  only (copies are never stored). Says so, and "newest first".
- HELP_FACTS `/receipts/review`: said "documents that were read"; only the email import
  writes a needs-review row. Now says emailed in, where the address is (Settings → Email
  import), and that a mistyped address now bounces (Worker `c1a59b45`).
- `/security` code comment: said the Worker "silently drops" mail to a non-inbox address.
  It has bounced since 2026-10-20. Comment only; the page's advice (use Feedback) stands.

## Fixed: missing

- HELP_FACTS `/scan`: the scan limits (300 a day for the first 7 days, then 50 a day and
  600 a month; `migration-036`). The chat could not answer "why can't I scan any more".
- `/terms`: the same limits, and that copying and typing have none. "Making many [accounts]
  to get round a limit" referred to a limit the page never named.
- HELP_FACTS `/invoices` and `/receipts`: draft autosave; and that a draft gets its number
  when marked sent.
- HELP_FACTS `/settings`: the email import address lives there.

## Checked and true (no change)

Gemini as reader on /privacy (still the first reader); the Frankfurt/EEA paragraph; every
other Tip (check-company "nothing is kept" — the caches are in memory only; invoice-how;
quote-page-how; quotes-intro button names; receipts-batch "Scan receipts"; clients-scan
fields; files; vat; review "Looks good"; settings VAT switch; recurring-invoices-how;
mileage; statement; copy; convert; feedback; free-invoice signature and template);
`/help` page; the VAT, mileage, receipt, quote and review walkthroughs (VAT opens on the
previous quarter, "What's in it" exists, "Looks good" exists); `/how-to-invoice` (makes
no claim about the app beyond numbering, VAT, CIS and reading receipts, all true);
accessibility's measured claims (ten screens at 32px in `test-big-text`; buttons are
still `py-2`, 36px, so "not 44" stands). Nothing in the help text claims an account can
change its own plan.

## Left alone (outside "only the help text"), for a decision

1. `recurring/page.tsx:261`, the empty state: "Add one for a bill that comes every month,
   and it goes in with your expenses on the day." **False** for the same reason as the
   Tip. A page string, not help text, so not touched.
2. `/api/contact-scan` and `/api/invoice-from-text` reading with Claude first (above).
3. `SAFARI_CAMERA_TIP` says "aA → Website Settings", which `notes/ios-safari.md` says may
   not exist in the home-screen app. Marked "Possible" there and not verified on a phone,
   so left.

## Checks

`tsc --noEmit` and `eslint .` clean; `npm run build` clean (with placeholder public
Supabase values, since a cloud session has no `.env.local`). Against `next start`, using
the container's Chromium through a scratch copy of the harness: test-help-chat 61/61,
test-govuk-words 12/12, test-vocabulary 21/21, test-plain-words 7/7, test-privacy-terms
23/23, test-terms-of-use 36/36, test-every-screen-explained 6/6, test-promises 7/7.
The "say when it does not know" rule in `helpPrompt.ts` is untouched.
