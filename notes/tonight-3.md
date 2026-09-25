# The list — 2026-09-25, working night

Written at Atanas's ask: "make you a big list to work on for the next few hours, work non
stop, and then do 4 hours testing on everything you can come up with."

Order is by what costs somebody money or locks them out, then what he asked for, then
polish. Tick as they land, with the commit.

## A. Wrong numbers and wrong documents (a bug here costs real money)

- [x] **A1. VAT domestic reverse charge for construction.** (275d6e7, and the prompt after it) The app already does CIS, so it
  already serves the exact audience this applies to — and today it puts VAT on an invoice
  that legally must not carry it. HMRC's rules, read 2026-09-25 from their own guidance:
  applies when supplier and customer are both UK VAT registered, the payment is reported
  under CIS, the services are standard or reduced rated, and the customer has NOT said in
  writing that they are an end user or intermediary supplier. The invoice must show no VAT
  in the amount charged, state the VAT rate or amount that would have applied, and carry
  one of: "VAT Act 1994 Section 55A applies" / "S55A VATA 94 applies" / "Customer to pay
  the VAT to HMRC". Goods supplied with the services are part of the same supply. The 5%
  disregard: if the reverse-charge part is 5% or less of the whole, normal VAT applies.
  Zero-rated work is out. Supplier enters the NET only on their return — no output tax.
  Credit notes need their own wording.
- [~] **A2. The end-user declaration.** The ASK is built and shipped; STORING their written declaration per customer needs a migration, so it stays on the list as a branch.
- [ ] **A2b. The end-user declaration, stored.** A flag per customer ("they have told me in writing
  they are an end user / intermediary supplier"), because that single fact flips the whole
  treatment and it is the customer's statement, not ours to guess.
- [x] **A3. The VAT return under reverse charge** — already correct by construction, now pinned. — `src/lib/vatReturn.ts` must not put
  reverse-charge sales in box 1, and must still put the net in box 6.

## B. The part of his brief nothing has been built for

- [x] **B1. Walkthroughs.** "Show me how" on the screens that need it, driving the real
  page rather than a video: highlight the control, say what it is for, move on. Must be
  skippable, must never trap focus, must work at twice the text size.
- [ ] **B2. The help chat.** `notes/help-chat-design.md` exists and nothing was built.
  Answers from the app's own pages, never invented, and says when it does not know.

## C. Things that are written down and half-finished

- [ ] **C1. Keep the consultation number** from an HMRC VAT check against the supplier, so
  a check leaves a record. Needs a migration → feature branch, does not merge before it is
  applied.
- [x] **C2. The privacy policy overstates the scanner.** It names "Google and Anthropic" as
  though both read everybody's documents; Gemini is the default and Claude is a per-device
  opt-in, and only Google is certified under the UK-US Data Bridge.
- [x] **C3. An accessibility statement**, in Starling's candid style, naming what we fail —
  the research says no competitor does this and `notes/accessibility-spec.md` already holds
  the honest list.

## D. Then four hours of testing, on everything I can think of

Not a re-run of the suites — new attacks:
- [x] **D1. Money that does not add up.** Property-based: random invoices, credit notes,
  payments, deposits, CIS rates and VAT rates; assert the invariants (what is owed never
  goes negative, credit notes never make a refund out of thin air, the VAT return's boxes
  agree with the invoices, penny-exactness end to end).
- [x] **D2. Two tabs, one record.** Every concurrent path: the same invoice issued twice,
  a quote accepted online while the owner invoices it, a payment recorded twice, a deposit
  claimed in two windows.
- [x] **D3. The half-connection.** Not "offline", but slow, flaky and truncated: a save
  that reaches the database and loses the reply, a scan that times out mid-read.
- [x] **D4. Dates that break things.** Leap day, BST boundaries both ways, a quarter end at
  midnight, a due date on 29 February, a tax year boundary.
- [x] **D5. Documents that fight back.** A 40-page PDF, a photo with no document in it, a
  receipt in another currency with no rate, a credit note bigger than its invoice.
- [x] **D6. Somebody else's account.** Every route and RPC as the wrong user and as anon.
- [x] **D7. A phone in the real world.** 320px, 2x text, dark mode, reduce-motion, one hand,
  keyboard only — together, not one at a time.
- [x] **D8. Mutation testing again**, extended past the eight it breaks today.
