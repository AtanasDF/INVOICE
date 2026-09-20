# Invoicer — outstanding work

**Revised 15 September 2026.** The first version of this document was wrong on three of
five items. See "Correction" at the bottom for what happened and why.

Everything below has been checked against `main` and against the database, not inferred.

---

## 1. `on delete set null` still orphans recurring rows — migration-014 is incomplete

Migration-014 changed `receipts.client_id` and `invoices.client_id` to `on delete
restrict`. Verified applied and working: deleting the client attached to `INV-357357`
now fails with `23503`, which is what `clientsStore.remove()` catches.

But there are **four** foreign keys referencing `clients`, not two. These two were left
on `on delete set null`:

| Child table | Column | On delete |
|---|---|---|
| `recurring_invoices` | `client_id` | **set null** |
| `recurring_expenses` | `supplier_id` | **set null** |

Demonstrated in a rolled-back transaction: a client referenced *only* by a recurring
invoice still deletes cleanly, and `recurring_invoices.client_id` becomes `NULL`.

That is worse than the problem 014 set out to fix. `invoices.client_id` is nullable, so
`generate_recurring_invoice` will happily keep inserting a draft invoice with no client
every month, unattended, for a client that no longer exists — and the restrict constraint
on `invoices` won't stop it, because the client is already gone.

**Fix:** extend 014 (or add 015) to cover both. `recurring_invoices.client_id` should be
`restrict` for the same reason as invoices. `recurring_expenses.supplier_id` is a
judgement call — an expense losing its supplier is survivable — but leaving it as the odd
one out invites the same surprise later.

**Second-order:** with `restrict` and no archive path, "Remove" becomes permanently
unavailable for any client with history, which is most of them. The button will now
always fail for real clients. Worth replacing it with **Archive** (a flag that hides the
client from pickers but keeps the records intact), with delete reserved for clients that
genuinely have no history.

---

## 2. The scan page — closed

Already built in `components/DocumentCapture.tsx`: permission query, 8-second timeout,
`denied` / `timeout` / `unsupported` states, Upload promoted when the camera isn't usable.
The first version of this brief said otherwise; that was my error.

---

## 3. Client and receipt editing — closed

Already built as inline row editing: `startEdit` / `saveEdit` / `clientsStore.update()` in
`clients/page.tsx`, `startEditReceipt` in `receipts/page.tsx`. Editing a sent invoice's
financial content is blocked at the store layer — `invoicesStore.update()` only accepts
`status | dueDate | paymentTerms | tags | notes`. The first version of this brief said
otherwise; that was my error.

---

## 4. Duplicate invoice number — closed

Already handled: `markSentWithNumber()` in `storage.ts` catches `23505` and shows a
plain-language message. Two `23505` handlers exist in that file. The first version of
this brief said otherwise; that was my error.

---

## 5. Chart bar width — closed

`maxBarSize={80}` added in `9928b26`.

---

## 6. The pre-fix receipt — answered, and it is wrong

This is the item Claude Code couldn't check without database access. Checked.

There is exactly one receipt in the database:

```
vendor  Currys PC World
amount      549.99   (stored as net)
vat_amount   91.67
gross       641.66
created_at  2026-09-14 17:52
```

Commit `997f2bb` ("Fix silent expense overstatement: amount field was net, users type
gross") landed at **2026-09-14 19:07**. The receipt predates it by about 75 minutes.

And the arithmetic confirms it was captured under the old behaviour: `549.99 / 6 =
91.665 ≈ 91.67`, which is the VAT-inclusive extraction formula. So the old code treated
549.99 as the **gross** till total and extracted £91.67 of VAT from it — but then left
549.99 sitting in the *net* field instead of reducing it to £458.32.

The result is a receipt that overstates the expense by £91.67, and a dashboard that
currently reads £641.66 for a purchase that actually cost £549.99.

**If Atanas confirms he typed the till total,** the correction is:

```sql
update public.receipts
   set amount = 458.32
 where id = '<the Currys receipt>' and amount = 549.99 and vat_amount = 91.67;
```

leaving VAT at £91.67 and making gross £549.99. Worth his confirmation first — this is
his financial record and the inference, though strong, is still an inference.

---

## Not code — Atanas's side

- Business name, address and VAT status in Settings are still PLACEHOLDER, including a
  dummy `GB000000000`. These print on every invoice.
- `RESEND_API_KEY` and `INBOX_WEBHOOK_SECRET` are not in Vercel; the Cloudflare Worker
  isn't deployed. The reminders cron returns `{skipped}` in the meantime.
- Seven RLS-locked backup tables remain, droppable whenever convenient.
- The repo lives under Desktop iCloud sync, which keeps producing duplicate
  `"name 2.ext"` files after rapid branch switches.

---

## Correction — how the first version got three items wrong

Not a caching problem. The service worker does no caching, and `main` was not stale. It
was bad method on my part, and it cost Claude Code real time chasing a phantom.

- **Editing.** I ran `find web/src/app -type d -name "[[]id[]]"`, found only
  `invoices/[id]`, and concluded editing wasn't built. I was looking for an edit *route*.
  The editing is inline in the list rows, so my search shape could never have found it.
- **Scan page.** I grepped `scan/page.tsx` alone. The handling lives in
  `components/DocumentCapture.tsx`. One file, no match, declared missing.
- **`23505`.** I never grepped for it at all. I asserted it was unhandled from my own
  reasoning during the migration-012 review, and then wrote it into a document headed
  "checked against `main`".

The common failure: I treated *absence of a grep match* as *absence of a feature*, and
described narrow, shape-specific searches as verification. The header claiming I'd checked
against `main` and the live app overstated what I actually did.

It's the mirror of an error I made earlier in the same session — reporting the feedback
widget as broken because my own test harness had failed silently. Both times the lesson is
the same: a negative result needs its method checked before it becomes a finding, because
"I didn't see it" and "it isn't there" are not the same claim.
