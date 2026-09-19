"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BusinessProfile, Client, CreditNote, Invoice, InvoiceItem, businessProfileStore, clientsStore, creditNotesStore, invoicesStore } from "@/lib/storage";
import { VAT_RATE_KINDS, VAT_RATE_LABELS, VatRateKind, computeInvoiceTotals } from "@/lib/vat";
import { draftPlaceholderNumber, suggestedInvoiceNumber } from "@/lib/invoiceNumber";
import { InvoiceStatus, invoiceStatusBadgeClass, invoiceStatusLabel, isOverdue } from "@/lib/invoiceStatus";
import { longDate } from "@/components/invoice/InvoiceDocument";
import SendInvoicePanel from "@/components/SendInvoicePanel";

function addDays(dateStr: string, days: number): string {
  // Same UTC-safe pattern as everywhere else in the app.
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const BLANK_ITEM: InvoiceItem = { description: "", quantity: 1, unitPrice: 0, vatRate: "standard" };

// The issued invoice as the customer sees it: on screen, printed, and as
// the PDF that's emailed or shared (forPdf drops notes meant for the owner).
function IssuedInvoice({ invoice, client, profile, creditNotes, forPdf }: {
  invoice: Invoice;
  client: Client | null;
  profile: BusinessProfile | null;
  creditNotes: CreditNote[];
  forPdf?: boolean;
}) {
  const vatRegistered = profile?.vatRegistered ?? false;
  const totals = computeInvoiceTotals(invoice.items, vatRegistered);
  const creditNoteTotal = creditNotes.reduce((s, c) => s + c.amount, 0);
  const amountDue = issuedAmountDue(invoice, totals.total, creditNoteTotal);
  return (
    <>
      <div className="flex items-start justify-between">
        {profile?.businessName && (
          <div>
            <p className="text-lg font-bold">{profile.businessName}</p>
            {profile.address && <p className="whitespace-pre-line text-sm text-neutral-600">{profile.address}</p>}
            {vatRegistered && profile.vatNumber && <p className="text-sm text-neutral-600">VAT: {profile.vatNumber}</p>}
          </div>
        )}
        <div className="text-right">
          <h1 className="text-2xl font-bold">Invoice {invoice.number}</h1>
          <p className="text-sm text-neutral-500">Date: {longDate(invoice.date)}</p>
          {invoice.paymentTerms && <p className="text-sm text-neutral-500">Terms: {invoice.paymentTerms}</p>}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium text-neutral-500">Billed to</p>
        <p className="font-medium">{client?.name || "—"}</p>
        {client?.address && <p className="whitespace-pre-line text-sm text-neutral-600">{client.address}</p>}
        {client?.email && <p className="text-sm text-neutral-600">{client.email}</p>}
        {client?.vatNumber && <p className="text-sm text-neutral-600">VAT: {client.vatNumber}</p>}
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit price</th>
            {vatRegistered && <th className="py-2 text-right">VAT</th>}
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, idx) => (
            <tr key={idx} className="border-b">
              <td className="py-2">{it.description}</td>
              <td className="py-2 text-right">{it.quantity}</td>
              <td className="py-2 text-right">£{it.unitPrice.toFixed(2)}</td>
              {vatRegistered && <td className="py-2 text-right">{VAT_RATE_LABELS[it.vatRate]}</td>}
              <td className="py-2 text-right">£{(it.quantity * it.unitPrice).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 space-y-1 text-sm">
        {vatRegistered && (
          <>
            <div className="flex justify-end text-neutral-600">
              <span>Subtotal (excl. VAT): £{totals.subtotal.toFixed(2)}</span>
            </div>
            {totals.vatByRate.map((v) => (
              <div key={v.kind} className="flex justify-end text-neutral-600">
                <span>{VAT_RATE_LABELS[v.kind]}: £{v.vat.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-end text-neutral-600">
              <span>Total: £{totals.total.toFixed(2)}</span>
            </div>
          </>
        )}
        {creditNotes.map((c) => (
          <div key={c.id} className="flex justify-end text-neutral-500">
            <span>Credit note {c.date}{c.reason ? ` (${c.reason})` : ""}: −£{c.amount.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <div className="rounded-lg bg-neutral-50 px-5 py-3 text-right">
          <div className="text-2xl font-extrabold">Amount due: £{amountDue.toFixed(2)}</div>
          {invoice.dueDate && invoice.status !== "paid" && (
            <div className="text-base font-bold text-neutral-700">Due: {longDate(invoice.dueDate)}</div>
          )}
          {invoice.status === "paid" && <div className="text-base font-bold text-green-700">Paid</div>}
          {invoice.status === "partial" && !forPdf && (
            <div className="mt-1 max-w-xs text-xs font-normal text-neutral-500 print:hidden">
              Partial-payment amounts aren&apos;t tracked yet — this is still the full remaining balance. Mark
              it Paid once it&apos;s fully settled.
            </div>
          )}
        </div>
      </div>

      {invoice.notes && (
        <div className="mt-6 border-t pt-4 text-sm text-neutral-600">{invoice.notes}</div>
      )}

      {profile?.bankDetails && (
        <div className="mt-4 rounded-lg border bg-neutral-50 p-4 text-sm">
          <p className="font-semibold">How to pay</p>
          <p className="mt-1 whitespace-pre-line text-neutral-600">{profile.bankDetails}</p>
        </div>
      )}
  
    </>
  );
}

const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Rounded once, to the penny, so the email and the PDF can't disagree by a
// half-penny; never below zero when credit notes exceed the total.
function issuedAmountDue(invoice: Invoice, total: number, credited: number): number {
  return invoice.status === "paid" ? 0 : Math.max(0, Math.round((total - credited) * 100) / 100);
}

// "Sort code: 12-34-56" lines become label/value rows in the email.
function bankRowsFromText(text: string): [string, string][] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^([^:]{1,30}):\s*(.+)$/.exec(l);
      return m ? [m[1].trim(), m[2].trim()] : ["", l];
    });
}

export default function InvoiceViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [cnDate, setCnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cnAmount, setCnAmount] = useState("");
  const [cnReason, setCnReason] = useState("");
  const [cnSaving, setCnSaving] = useState(false);
  const [cnError, setCnError] = useState<string | null>(null);
  const [showCnForm, setShowCnForm] = useState(false);

  // Only administrative fields -- number/date/items/client are locked
  // once an invoice has been sent, since it's what was actually issued.
  // Credit notes are the correction route for anything financial from
  // that point on. While still a draft, the fields below are edited
  // through the draft* state further down instead.
  const [editingDetails, setEditingDetails] = useState(false);
  const [editDueDate, setEditDueDate] = useState("");
  const [editPaymentTerms, setEditPaymentTerms] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTagsInput, setEditTagsInput] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Draft editing -- everything is fair game, mirroring the New Invoice
  // form, since nothing's been issued to the client yet. There's no
  // number field here -- a draft has no real invoice number until it's
  // marked sent, which is a separate step below (see sendPanelOpen).
  const [draftClientId, setDraftClientId] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftDueDate, setDraftDueDate] = useState("");
  const [draftPaymentTerms, setDraftPaymentTerms] = useState("");
  const [draftItems, setDraftItems] = useState<InvoiceItem[]>([{ ...BLANK_ITEM }]);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftTagsInput, setDraftTagsInput] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // "Mark as sent" is a two-step action: this panel confirms the invoice
  // number that's about to be assigned (a preview only -- the real value
  // is computed and written atomically by confirmSend, never typed in
  // here; there's no manual override any more, since that was the one
  // remaining way to write a gap into the sequence on purpose).
  const [sendPanelOpen, setSendPanelOpen] = useState(false);
  const [sendPreviewNumber, setSendPreviewNumber] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const inv = await invoicesStore.get(params.id);
      if (cancelled) return;
      setInvoice(inv);
      if (inv) {
        const [allClients, notes, biz] = await Promise.all([
          clientsStore.all(),
          creditNotesStore.forInvoice(inv.id),
          businessProfileStore.get(),
        ]);
        if (cancelled) return;
        setClients(allClients);
        setCreditNotes(notes);
        setProfile(biz);
        setEditDueDate(inv.dueDate ?? "");
        setEditPaymentTerms(inv.paymentTerms);
        setEditNotes(inv.notes);
        setEditTagsInput(inv.tags.join(", "));
        setDraftClientId(inv.clientId);
        setDraftDate(inv.date);
        setDraftDueDate(inv.dueDate ?? "");
        setDraftPaymentTerms(inv.paymentTerms);
        setDraftItems(inv.items.length ? inv.items : [{ ...BLANK_ITEM }]);
        setDraftNotes(inv.notes);
        setDraftTagsInput(inv.tags.join(", "));
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const client = clients.find((c) => c.id === invoice?.clientId) || null;
  // Archived clients dropped from the draft picker, except the one
  // already assigned to this draft, so its current value doesn't vanish
  // if it was archived after the draft was created.
  const billableClients = clients.filter((c) => c.kind === "client" && (!c.archived || c.id === draftClientId));

  async function changeStatus(next: InvoiceStatus) {
    if (!invoice) return;
    setStatusError(null);
    const prevStatus = invoice.status;
    setInvoice({ ...invoice, status: next });
    setStatusSaving(true);
    try {
      await invoicesStore.update(invoice.id, { status: next });
    } catch (err) {
      setInvoice({ ...invoice, status: prevStatus });
      setStatusError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setStatusSaving(false);
    }
  }

  async function saveDetails() {
    if (!invoice) return;
    setEditError(null);
    setEditSaving(true);
    try {
      const tags = editTagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await invoicesStore.update(invoice.id, {
        dueDate: editDueDate || null,
        paymentTerms: editPaymentTerms,
        notes: editNotes,
        tags,
      });
      setInvoice({ ...invoice, dueDate: editDueDate || null, paymentTerms: editPaymentTerms, notes: editNotes, tags });
      setEditingDetails(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setEditSaving(false);
    }
  }

  function updateDraftItem(idx: number, patch: Partial<InvoiceItem>) {
    setDraftItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addDraftLine() {
    setDraftItems((prev) => [...prev, { ...BLANK_ITEM }]);
  }

  function removeDraftLine(idx: number) {
    setDraftItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveDraftOnly() {
    if (!invoice) return;
    setDraftError(null);
    setDraftSaving(true);
    try {
      const tags = draftTagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await invoicesStore.updateDraft(invoice.id, {
        clientId: draftClientId,
        date: draftDate,
        items: draftItems,
        dueDate: draftDueDate || null,
        paymentTerms: draftPaymentTerms,
        notes: draftNotes,
        tags,
      });
      const fresh = await invoicesStore.get(invoice.id);
      setInvoice(fresh);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Could not save this draft.");
    } finally {
      setDraftSaving(false);
    }
  }

  function openSendPanel() {
    if (!profile) return;
    // Preview only -- purely informational. If someone else on this
    // account sends another invoice between opening this panel and
    // confirming, this could be stale by the time confirmSend runs;
    // assign_invoice_number() always computes and returns the real,
    // correct number at write time regardless of what was shown here.
    setSendPreviewNumber(suggestedInvoiceNumber(profile.invoicePrefix, profile.invoiceNextNumber));
    setSendError(null);
    setSendPanelOpen(true);
  }

  // The one point a draft's number is actually assigned. Saves any
  // pending draft edits first (harmless to retry -- it's still a draft
  // either way if this part fails), then calls assign_invoice_number()
  // (migration-012), which assigns the number, advances the counter, and
  // flips status to sent as a single atomic transaction -- so a dropped
  // connection here can never advance the counter without the invoice
  // actually ending up sent, or the reverse.
  async function confirmSend() {
    if (!invoice) return;
    setSendError(null);
    setSendBusy(true);
    try {
      const tags = draftTagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await invoicesStore.updateDraft(invoice.id, {
        clientId: draftClientId,
        date: draftDate,
        items: draftItems,
        dueDate: draftDueDate || null,
        paymentTerms: draftPaymentTerms,
        notes: draftNotes,
        tags,
      });
      await invoicesStore.markSentWithNumber(invoice.id);
      const fresh = await invoicesStore.get(invoice.id);
      setInvoice(fresh);
      if (fresh) {
        // Keeps the (non-draft) admin edit panel's fields in sync with
        // what was just saved -- it was only ever populated once, back
        // when the page first loaded as a draft.
        setEditDueDate(fresh.dueDate ?? "");
        setEditPaymentTerms(fresh.paymentTerms);
        setEditNotes(fresh.notes);
        setEditTagsInput(fresh.tags.join(", "));
      }
      setSendPanelOpen(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not mark this invoice sent.");
    } finally {
      setSendBusy(false);
    }
  }

  async function duplicateInvoice() {
    if (!invoice) return;
    setDuplicateError(null);
    setDuplicating(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      // Creates a new draft, same as New Invoice -- no real number and
      // no counter advance until it's marked sent.
      const created = await invoicesStore.add({
        clientId: invoice.clientId,
        date: today,
        number: draftPlaceholderNumber(),
        items: invoice.items,
        notes: invoice.notes,
        dueDate: addDays(today, 30),
        paymentTerms: invoice.paymentTerms,
        status: "draft",
        // "from Q-..." marks the invoice a quote became; a copy isn't it.
        tags: invoice.tags.filter((t) => !t.startsWith("from Q-")),
      });
      router.push(`/invoices/${created.id}`);
    } catch (err) {
      setDuplicateError(err instanceof Error ? err.message : "Could not duplicate this invoice.");
      setDuplicating(false);
    }
  }

  async function addCreditNote(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || !cnAmount) return;
    setCnError(null);
    setCnSaving(true);
    try {
      const created = await creditNotesStore.add({
        invoiceId: invoice.id,
        date: cnDate,
        amount: parseFloat(cnAmount) || 0,
        reason: cnReason,
      });
      setCreditNotes((prev) => [created, ...prev]);
      setCnAmount("");
      setCnReason("");
      setShowCnForm(false);
    } catch (err) {
      setCnError(err instanceof Error ? err.message : "Could not save credit note.");
    } finally {
      setCnSaving(false);
    }
  }

  async function removeCreditNote(id: string) {
    setCreditNotes((prev) => prev.filter((c) => c.id !== id));
    try {
      await creditNotesStore.remove(id);
    } catch {
      // best-effort local update above; a reload will resync if this failed
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!invoice) return <p className="text-sm text-neutral-500">Invoice not found.</p>;

  const vatRegistered = profile?.vatRegistered ?? false;

  // ── Draft: fully editable, nothing's been issued yet ─────────────
  if (invoice.status === "draft") {
    const draftTotals = computeInvoiceTotals(draftItems, vatRegistered);
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Draft invoice</h1>
            <p className="mt-1 text-neutral-600">
              Nothing&apos;s been sent yet — everything here, including the client and line items, is still
              editable. Marking it sent locks the financial content and starts the due-date clock.
            </p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusBadgeClass("draft", false)}`}>Draft</span>
        </div>

        <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <select className="w-full rounded-lg border px-3 py-2" value={draftClientId} onChange={(e) => setDraftClientId(e.target.value)}>
            <option value="">Select a client or company</option>
            {billableClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500">Invoice date</label>
              <input type="date" className="w-full rounded-lg border px-3 py-2" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Due date</label>
              <input type="date" className="w-full rounded-lg border px-3 py-2" value={draftDueDate} onChange={(e) => setDraftDueDate(e.target.value)} />
            </div>
          </div>
          <input className="w-full rounded-lg border px-3 py-2" value={draftPaymentTerms} onChange={(e) => setDraftPaymentTerms(e.target.value)} placeholder="Payment terms (e.g. 30 days)" />

          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 px-1 text-xs font-medium text-neutral-500">
              <span className={vatRegistered ? "col-span-4" : "col-span-6"}>Description</span>
              <span className="col-span-2 text-right">Qty</span>
              <span className="col-span-3 text-right">Unit price</span>
              {vatRegistered && <span className="col-span-2">VAT</span>}
            </div>
            {draftItems.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input
                  className={`${vatRegistered ? "col-span-4" : "col-span-6"} rounded-lg border px-3 py-2`}
                  placeholder="Description"
                  value={it.description}
                  onChange={(e) => updateDraftItem(idx, { description: e.target.value })}
                />
                <input
                  className="col-span-2 rounded-lg border px-3 py-2"
                  placeholder="Qty"
                  value={it.quantity}
                  onChange={(e) => updateDraftItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                />
                <input
                  className="col-span-3 rounded-lg border px-3 py-2"
                  placeholder="Unit price"
                  value={it.unitPrice}
                  onChange={(e) => updateDraftItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                />
                {vatRegistered && (
                  <select
                    className="col-span-2 rounded-lg border px-1 py-2 text-xs"
                    value={it.vatRate}
                    onChange={(e) => updateDraftItem(idx, { vatRate: e.target.value as VatRateKind })}
                  >
                    {VAT_RATE_KINDS.map((k) => <option key={k} value={k}>{VAT_RATE_LABELS[k]}</option>)}
                  </select>
                )}
                <button onClick={() => removeDraftLine(idx)} className="col-span-1 text-sm text-red-600">✕</button>
              </div>
            ))}
            <button onClick={addDraftLine} className="text-sm font-medium text-blue-600">+ Add line</button>
          </div>

          <textarea className="w-full rounded-lg border px-3 py-2" placeholder="Notes (optional)" value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} />
          <input
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Tags, comma separated (optional)"
            value={draftTagsInput}
            onChange={(e) => setDraftTagsInput(e.target.value)}
          />

          {draftError && <p className="text-sm text-red-600">{draftError}</p>}

          <div className="space-y-1 border-t pt-3 text-sm">
            {vatRegistered && (
              <>
                <div className="flex justify-end text-neutral-600"><span>Subtotal: £{draftTotals.subtotal.toFixed(2)}</span></div>
                {draftTotals.vatByRate.map((v) => (
                  <div key={v.kind} className="flex justify-end text-neutral-600"><span>{VAT_RATE_LABELS[v.kind]}: £{v.vat.toFixed(2)}</span></div>
                ))}
              </>
            )}
            <div className="flex items-center justify-between pt-1">
              <div className="text-lg font-bold">Total: £{draftTotals.total.toFixed(2)}</div>
              <div className="flex gap-2">
                <button
                  onClick={saveDraftOnly}
                  disabled={draftSaving || sendPanelOpen}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
                >
                  {draftSaving ? "Saving…" : "Save draft"}
                </button>
                <button
                  onClick={openSendPanel}
                  disabled={draftSaving || sendPanelOpen}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Mark as sent
                </button>
              </div>
            </div>
          </div>
        </div>

        {sendPanelOpen && (
          <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
            <div>
              <h2 className="font-semibold">Mark as sent</h2>
              <p className="mt-1 text-sm text-neutral-600">
                This assigns invoice number <span className="font-medium text-neutral-900">{sendPreviewNumber}</span>,
                locks the invoice in, and starts the due-date clock. There&apos;s no way to type a different number
                here — it&apos;s assigned automatically to keep the sequence gap-free.
              </p>
            </div>
            {sendError && <p className="text-sm text-red-600">{sendError}</p>}
            <div className="flex gap-2">
              <button onClick={confirmSend} disabled={sendBusy} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {sendBusy ? "Sending…" : "Confirm & mark as sent"}
              </button>
              <button onClick={() => setSendPanelOpen(false)} disabled={sendBusy} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Sent / Partial / Paid: locked, print-ready view ───────────────
  const totals = computeInvoiceTotals(invoice.items, vatRegistered);
  const creditNoteTotal = creditNotes.reduce((s, c) => s + c.amount, 0);
  const amountDue = issuedAmountDue(invoice, totals.total, creditNoteTotal);
  const paid = invoice.status === "paid";
  const overdue = isOverdue(invoice.status, invoice.dueDate);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${invoiceStatusBadgeClass(invoice.status, overdue)}`}>
            {invoiceStatusLabel(invoice.status, overdue)}
          </span>
          <select
            value={invoice.status}
            disabled={statusSaving}
            onChange={(e) => changeStatus(e.target.value as InvoiceStatus)}
            className="rounded-lg border px-2 py-1 text-sm text-neutral-700 disabled:opacity-50"
          >
            <option value="sent">Sent</option>
            <option value="partial">Partially paid</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditingDetails((v) => !v)} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
            {editingDetails ? "Cancel" : "Edit details"}
          </button>
          <button onClick={duplicateInvoice} disabled={duplicating} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50">
            {duplicating ? "Duplicating…" : "Duplicate"}
          </button>
          <a href="#send-by-email" className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
            Send or share
          </a>
          <button onClick={() => window.print()} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            Print / save as PDF
          </button>
        </div>
      </div>
      {statusError && <p className="text-sm text-red-600 print:hidden">{statusError}</p>}
      {duplicateError && <p className="text-sm text-red-600 print:hidden">{duplicateError}</p>}

      {editingDetails && (
        <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
          <p className="text-sm text-neutral-600">
            Only administrative details here — the invoice number, date, client, and line items are locked now
            that it&apos;s been sent, since they&apos;re what was actually issued. Use a credit note below for
            anything that needs a financial correction.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500">Due date</label>
              <input type="date" className="w-full rounded-lg border px-3 py-2 text-sm" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Payment terms</label>
              <input className="w-full rounded-lg border px-3 py-2 text-sm" value={editPaymentTerms} onChange={(e) => setEditPaymentTerms(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500">Notes</label>
            <textarea className="w-full rounded-lg border px-3 py-2 text-sm" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Tags, comma separated</label>
            <input className="w-full rounded-lg border px-3 py-2 text-sm" value={editTagsInput} onChange={(e) => setEditTagsInput(e.target.value)} />
          </div>
          {editError && <p className="text-sm text-red-600">{editError}</p>}
          <button onClick={saveDetails} disabled={editSaving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {editSaving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      <div className="rounded-xl border bg-white p-8 text-neutral-900 shadow-sm print:border-0 print:shadow-none">
        <IssuedInvoice invoice={invoice} client={client} profile={profile} creditNotes={creditNotes} />
      </div>

      <SendInvoicePanel
        sheet={<IssuedInvoice invoice={invoice} client={client} profile={profile} creditNotes={creditNotes} forPdf />}
        pdfKey={JSON.stringify([invoice, client, profile, creditNotes])}
        signInNext={`/invoices/${invoice.id}`}
        missingName="Add your business name in Settings first, so the customer knows who it's from."
        fields={{
          issuerName: profile?.businessName ?? "",
          issuerEmail: "",
          customerName: client?.name ?? "",
          customerEmail: client?.email ?? "",
          number: invoice.number,
          total: paid
            ? `£${money(Math.max(0, totals.total - creditNoteTotal))}, paid`
            : `£${money(amountDue)}`,
          dueDate: invoice.dueDate && !paid ? longDate(invoice.dueDate) : "",
          // A paid invoice is a copy for their records: no amount to pay, no
          // bank details.
          bank: paid ? [] : bankRowsFromText(profile?.bankDetails ?? ""),
        }}
      />

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Credit notes</h2>
          <button onClick={() => setShowCnForm((v) => !v)} className="text-sm font-medium text-blue-600">
            {showCnForm ? "Cancel" : "+ New credit note"}
          </button>
        </div>
        {showCnForm && (
          <form onSubmit={addCreditNote} className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="rounded-lg border px-3 py-2 text-sm" value={cnDate} onChange={(e) => setCnDate(e.target.value)} />
              <input
                className="rounded-lg border px-3 py-2 text-sm"
                placeholder="Amount to credit (£)"
                value={cnAmount}
                onChange={(e) => setCnAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Reason (optional)" value={cnReason} onChange={(e) => setCnReason(e.target.value)} />
            {cnError && <p className="text-sm text-red-600">{cnError}</p>}
            <button disabled={cnSaving} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {cnSaving ? "Saving…" : "Save credit note"}
            </button>
          </form>
        )}
        {creditNotes.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No credit notes against this invoice.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {creditNotes.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b pb-2 text-sm">
                <span>{c.date} — £{c.amount.toFixed(2)}{c.reason ? ` · ${c.reason}` : ""}</span>
                <button onClick={() => removeCreditNote(c.id)} className="text-red-600">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
