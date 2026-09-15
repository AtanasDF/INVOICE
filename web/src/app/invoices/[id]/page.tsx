"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BusinessProfile, Client, CreditNote, Invoice, businessProfileStore, clientsStore, creditNotesStore, invoicesStore } from "@/lib/storage";

export default function InvoiceViewPage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
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
  // once an invoice exists, since it's what was actually issued. Credit
  // notes are the correction route for anything financial.
  const [editingDetails, setEditingDetails] = useState(false);
  const [editDueDate, setEditDueDate] = useState("");
  const [editPaymentTerms, setEditPaymentTerms] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTagsInput, setEditTagsInput] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const inv = await invoicesStore.get(params.id);
      if (cancelled) return;
      setInvoice(inv);
      if (inv) {
        const [clients, notes, biz] = await Promise.all([
          clientsStore.all(),
          creditNotesStore.forInvoice(inv.id),
          businessProfileStore.get(),
        ]);
        if (cancelled) return;
        setClient(clients.find((c) => c.id === inv.clientId) || null);
        setCreditNotes(notes);
        setProfile(biz);
        setEditDueDate(inv.dueDate ?? "");
        setEditPaymentTerms(inv.paymentTerms);
        setEditNotes(inv.notes);
        setEditTagsInput(inv.tags.join(", "));
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function togglePaid() {
    if (!invoice) return;
    const next = !invoice.paid;
    setInvoice({ ...invoice, paid: next });
    try {
      await invoicesStore.update(invoice.id, { paid: next });
    } catch {
      setInvoice({ ...invoice, paid: !next });
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

  const rawTotal = invoice.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const creditNoteTotal = creditNotes.reduce((s, c) => s + c.amount, 0);
  const netTotal = rawTotal - creditNoteTotal;
  const overdue = !invoice.paid && invoice.dueDate && invoice.dueDate < new Date().toISOString().slice(0, 10);

  const shareText =
    `Invoice ${invoice.number}${client?.name ? ` for ${client.name}` : ""} — £${netTotal.toFixed(2)}` +
    (invoice.dueDate ? `, due ${invoice.dueDate}` : "") +
    `. (Attach the PDF from "Print / save as PDF" — this message doesn't include it automatically.)`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const emailHref = `mailto:${client?.email || ""}?subject=${encodeURIComponent(`Invoice ${invoice.number}`)}&body=${encodeURIComponent(shareText)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <button
          onClick={togglePaid}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            invoice.paid ? "bg-green-100 text-green-800" : overdue ? "bg-red-100 text-red-800" : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {invoice.paid ? "Paid — click to mark unpaid" : overdue ? "Overdue — click to mark paid" : "Unpaid — click to mark paid"}
        </button>
        <div className="flex gap-2">
          <button onClick={() => setEditingDetails((v) => !v)} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
            {editingDetails ? "Cancel" : "Edit details"}
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

      {editingDetails && (
        <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
          <p className="text-sm text-neutral-600">
            Only administrative details here — the invoice number, date, client, and line items are locked once an
            invoice exists, since they&apos;re what was actually issued. Use a credit note below for anything that
            needs a financial correction.
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
          <div>
            <h1 className="text-2xl font-bold">Invoice {invoice.number}</h1>
            <p className="text-sm text-neutral-500">Date: {invoice.date}</p>
            {invoice.dueDate && <p className="text-sm text-neutral-500">Due: {invoice.dueDate}</p>}
            {invoice.paymentTerms && <p className="text-sm text-neutral-500">Terms: {invoice.paymentTerms}</p>}
          </div>
          {profile?.businessName && (
            <div className="text-right">
              <p className="font-medium">{profile.businessName}</p>
              {profile.address && <p className="whitespace-pre-line text-sm text-neutral-600">{profile.address}</p>}
              {profile.vatNumber && <p className="text-sm text-neutral-600">VAT: {profile.vatNumber}</p>}
            </div>
          )}
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
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, idx) => (
              <tr key={idx} className="border-b">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right">{it.quantity}</td>
                <td className="py-2 text-right">£{it.unitPrice.toFixed(2)}</td>
                <td className="py-2 text-right">£{(it.quantity * it.unitPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {creditNotes.length > 0 && (
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-end text-neutral-500">
              <span>Invoice total: £{rawTotal.toFixed(2)}</span>
            </div>
            {creditNotes.map((c) => (
              <div key={c.id} className="flex justify-end text-neutral-500">
                <span>Credit note {c.date}{c.reason ? ` (${c.reason})` : ""}: −£{c.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <div className="text-lg font-bold">Total{creditNotes.length > 0 ? " due" : ""}: £{netTotal.toFixed(2)}</div>
        </div>

        {invoice.notes && (
          <div className="mt-6 border-t pt-4 text-sm text-neutral-600">{invoice.notes}</div>
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
