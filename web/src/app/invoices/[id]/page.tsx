"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BusinessProfile, Client, CreditNote, Invoice, InvoiceItem, businessProfileStore, clientsStore, creditNotesStore, invoicesStore } from "@/lib/storage";
import { VAT_RATE_KINDS, VAT_RATE_LABELS, VatRateKind, computeInvoiceTotals } from "@/lib/vat";
import { parseSequenceNumber, suggestedInvoiceNumber } from "@/lib/invoiceNumber";
import { InvoiceStatus, invoiceStatusBadgeClass, invoiceStatusLabel, isOverdue } from "@/lib/invoiceStatus";

function addDays(dateStr: string, days: number): string {
  // Same UTC-safe pattern as everywhere else in the app.
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const BLANK_ITEM: InvoiceItem = { description: "", quantity: 1, unitPrice: 0, vatRate: "standard" };

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
  // form, since nothing's been issued to the client yet.
  const [draftClientId, setDraftClientId] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftDueDate, setDraftDueDate] = useState("");
  const [draftNumber, setDraftNumber] = useState("");
  const [draftPaymentTerms, setDraftPaymentTerms] = useState("");
  const [draftItems, setDraftItems] = useState<InvoiceItem[]>([{ ...BLANK_ITEM }]);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftTagsInput, setDraftTagsInput] = useState("");
  const [draftSaving, setDraftSaving] = useState<"" | "save" | "send">("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [pastInvoices, setPastInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const inv = await invoicesStore.get(params.id);
      if (cancelled) return;
      setInvoice(inv);
      if (inv) {
        const [allClients, notes, biz, allInvoices] = await Promise.all([
          clientsStore.all(),
          creditNotesStore.forInvoice(inv.id),
          businessProfileStore.get(),
          invoicesStore.all(),
        ]);
        if (cancelled) return;
        setClients(allClients);
        setCreditNotes(notes);
        setProfile(biz);
        setPastInvoices(allInvoices);
        setEditDueDate(inv.dueDate ?? "");
        setEditPaymentTerms(inv.paymentTerms);
        setEditNotes(inv.notes);
        setEditTagsInput(inv.tags.join(", "));
        setDraftClientId(inv.clientId);
        setDraftDate(inv.date);
        setDraftDueDate(inv.dueDate ?? "");
        setDraftNumber(inv.number);
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
  const billableClients = clients.filter((c) => c.kind === "client");

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

  const draftNumberWarning = (() => {
    const trimmed = draftNumber.trim();
    if (!trimmed || !invoice) return null;
    if (pastInvoices.some((inv) => inv.id !== invoice.id && inv.number === trimmed)) {
      return `"${trimmed}" is already used by another invoice.`;
    }
    if (profile) {
      const seq = parseSequenceNumber(trimmed, profile.invoicePrefix);
      if (seq !== null && seq > profile.invoiceNextNumber) {
        return `This skips ahead of the expected next number (${suggestedInvoiceNumber(profile.invoicePrefix, profile.invoiceNextNumber)}) — you'll leave a gap in the sequence.`;
      }
    }
    return null;
  })();

  async function saveDraft(andMarkSent: boolean) {
    if (!invoice) return;
    setDraftError(null);
    setDraftSaving(andMarkSent ? "send" : "save");
    try {
      const tags = draftTagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await invoicesStore.updateDraft(invoice.id, {
        clientId: draftClientId,
        date: draftDate,
        number: draftNumber,
        items: draftItems,
        dueDate: draftDueDate || null,
        paymentTerms: draftPaymentTerms,
        notes: draftNotes,
        tags,
      });
      if (andMarkSent) {
        await invoicesStore.update(invoice.id, { status: "sent" });
      }
      const fresh = await invoicesStore.get(invoice.id);
      setInvoice(fresh);
      if (fresh) {
        setEditDueDate(fresh.dueDate ?? "");
        setEditPaymentTerms(fresh.paymentTerms);
        setEditNotes(fresh.notes);
        setEditTagsInput(fresh.tags.join(", "));
      }
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Could not save this draft.");
    } finally {
      setDraftSaving("");
    }
  }

  async function duplicateInvoice() {
    if (!invoice) return;
    setDuplicateError(null);
    setDuplicating(true);
    try {
      const biz = await businessProfileStore.get();
      const today = new Date().toISOString().slice(0, 10);
      const created = await invoicesStore.add({
        clientId: invoice.clientId,
        date: today,
        number: suggestedInvoiceNumber(biz.invoicePrefix, biz.invoiceNextNumber),
        items: invoice.items,
        notes: invoice.notes,
        dueDate: addDays(today, 30),
        paymentTerms: invoice.paymentTerms,
        status: "draft",
        tags: invoice.tags,
      });
      // Advances the counter the same way New Invoice does -- this
      // duplicate counts as an invoice actually created, same as any other.
      await businessProfileStore.save({ ...biz, invoiceNextNumber: biz.invoiceNextNumber + 1 });
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input className="w-full rounded-lg border px-3 py-2" value={draftNumber} onChange={(e) => setDraftNumber(e.target.value)} placeholder="Invoice number" />
              {draftNumberWarning && <p className="mt-1 text-xs text-amber-700">{draftNumberWarning}</p>}
            </div>
            <input className="rounded-lg border px-3 py-2" value={draftPaymentTerms} onChange={(e) => setDraftPaymentTerms(e.target.value)} placeholder="Payment terms (e.g. 30 days)" />
          </div>

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
                  onClick={() => saveDraft(false)}
                  disabled={draftSaving !== ""}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
                >
                  {draftSaving === "save" ? "Saving…" : "Save draft"}
                </button>
                <button
                  onClick={() => saveDraft(true)}
                  disabled={draftSaving !== ""}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {draftSaving === "send" ? "Sending…" : "Mark as sent"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Sent / Partial / Paid: locked, print-ready view ───────────────
  const totals = computeInvoiceTotals(invoice.items, vatRegistered);
  const creditNoteTotal = creditNotes.reduce((s, c) => s + c.amount, 0);
  const netTotal = totals.total - creditNoteTotal;
  const amountDue = invoice.status === "paid" ? 0 : netTotal;
  const overdue = isOverdue(invoice.status, invoice.dueDate);

  const shareText =
    `Invoice ${invoice.number}${client?.name ? ` for ${client.name}` : ""} — £${netTotal.toFixed(2)}` +
    (invoice.dueDate ? `, due ${invoice.dueDate}` : "") +
    `. (Attach the PDF from "Print / save as PDF" — this message doesn't include it automatically.)`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const emailHref = `mailto:${client?.email || ""}?subject=${encodeURIComponent(`Invoice ${invoice.number}`)}&body=${encodeURIComponent(shareText)}`;

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
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
            Share via WhatsApp
          </a>
          <a href={emailHref} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
            Share via Email
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
            <p className="text-sm text-neutral-500">Date: {invoice.date}</p>
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
              <div className="text-base font-bold text-neutral-700">Due: {invoice.dueDate}</div>
            )}
            {invoice.status === "paid" && <div className="text-base font-bold text-green-700">Paid</div>}
            {invoice.status === "partial" && (
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
      </div>

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
