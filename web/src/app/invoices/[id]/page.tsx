"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BusinessProfile, Client, CreditNote, Invoice, InvoiceItem, InvoiceLink, InvoicePayment, PAYMENT_METHOD_LABELS, PaymentMethod, businessProfileStore, clientsStore, creditNotesStore, invoiceLinkUrl, invoiceLinksStore, invoicesStore, paymentsStore, quotesStore } from "@/lib/storage";
import { invoiceBalance, invoiceVat, statusFromPayments, syncedStatus } from "@/lib/invoiceBalance";
import { VAT_RATE_KINDS, VAT_RATE_LABELS, VatRateKind, computeInvoiceTotals } from "@/lib/vat";
import { draftPlaceholderNumber, suggestedInvoiceNumber } from "@/lib/invoiceNumber";
import { InvoiceStatus, invoiceStatusBadgeClass, invoiceStatusLabel, isOverdue } from "@/lib/invoiceStatus";
import { longDate } from "@/components/invoice/InvoiceDocument";
import SendInvoicePanel from "@/components/SendInvoicePanel";
import TextCustomer from "@/components/TextCustomer";
import { CisSummary, CisToggle, LineKind } from "@/components/invoice/CisFields";
import { creditOffDue, invoiceCharge, withKinds } from "@/lib/cis";
import { NumberInput, parseAmount } from "@/components/free-invoice/fields";
import InvoiceReminders from "@/components/invoice/InvoiceReminders";
import IssuedInvoice from "@/components/invoice/IssuedInvoice";
import { depositTag } from "@/lib/quoteDeposit";
import { celebratePaid } from "@/components/PaidCelebration";

function addDays(dateStr: string, days: number): string {
  // Same UTC-safe pattern as everywhere else in the app.
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const BLANK_ITEM: InvoiceItem = { description: "", quantity: 1, unitPrice: 0, vatRate: "standard" };

const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);
const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });


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
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [link, setLink] = useState<InvoiceLink | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod | "">("bank");
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
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
  const [draftCisRate, setDraftCisRate] = useState<number | null>(null);
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
        const [allClients, notes, biz, paid, existingLink] = await Promise.all([
          clientsStore.all(),
          creditNotesStore.forInvoice(inv.id),
          businessProfileStore.get(),
          paymentsStore.forInvoice(inv.id),
          invoiceLinksStore.forInvoice(inv.id).catch(() => null),
        ]);
        if (cancelled) return;
        setClients(allClients);
        setCreditNotes(notes);
        setPayments(paid);
        setLink(existingLink);
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
        setDraftCisRate(inv.cisRate);
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

  // The status follows credit notes and payments (paid once nothing is
  // owed, credited in full included), after each change made here, never
  // just from opening the page.
  async function syncStatus(inv: Invoice, notes: CreditNote[], pays: InvoicePayment[], vat: boolean, fromPayments = false) {
    const charge = invoiceCharge(inv, vat);
    const next = syncedStatus(inv.status, { total: charge.due, credited: creditOffDue(charge, sum(notes)), paid: sum(pays) }, pays.length, fromPayments);
    if (!next) return null;
    await invoicesStore.update(inv.id, { status: next });
    setInvoice((prev) => (prev && prev.id === inv.id ? { ...prev, status: next } : prev));
    return next;
  }

  function celebrate(pays: InvoicePayment[]) {
    if (!invoice) return;
    celebratePaid({ amount: sum(pays), from: client?.name, number: invoice.number });
  }

  // Fresh from the database, so another tab's payment is counted before
  // working out what's owed.
  async function freshFigures() {
    const [pays, notes] = await Promise.all([paymentsStore.forInvoice(invoice!.id), creditNotesStore.forInvoice(invoice!.id)]);
    setPayments(pays);
    setCreditNotes(notes);
    const charge = invoiceCharge(invoice!, invoiceVat(invoice!, vatRegistered));
    const due = invoiceBalance({ total: charge.due, credited: creditOffDue(charge, sum(notes)), paid: sum(pays), status: invoice!.status });
    return { pays, notes, due };
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || paySaving) return;
    const amount = Math.round(parseAmount(payAmount) * 100) / 100;
    if (!payDate) return setPayError("Enter the date it was received.");
    if (!(amount > 0)) return setPayError("Enter the amount received.");
    setPaySaving(true);
    setPayError(null);
    setStatusError(null);
    let saved: { pays: InvoicePayment[]; notes: CreditNote[] } | null = null;
    try {
      const { pays, notes, due } = await freshFigures();
      if (amount > due + 0.005) {
        setPayError(due > 0 ? `That's more than the £${money(due)} still owed.` : "Nothing is owed on this invoice.");
        return;
      }
      const added = await paymentsStore.add({ invoiceId: invoice.id, date: payDate, amount, method: payMethod || null, note: "" });
      saved = { pays: [...pays, added], notes };
      setPayments(saved.pays);
      setShowPayForm(false);
      setPayAmount("");
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Could not record the payment.");
    } finally {
      setPaySaving(false);
    }
    if (!saved) return;
    const done = saved;
    const next = await syncStatus(invoice, done.notes, done.pays, invoiceVat(invoice, vatRegistered)).catch((err) => {
      setStatusError(err instanceof Error ? err.message : "The payment is saved, but the status couldn't be updated. Reload to fix it.");
      return null;
    });
    if (next === "paid") celebrate(done.pays);
  }

  // Records whatever is still owed as received today. An invoice marked
  // part-paid by hand before payments existed has an unknown balance, so it's
  // just marked paid rather than inventing a payment for the full amount.
  async function markPaidInFull() {
    if (!invoice || statusSaving) return;
    setStatusError(null);
    setStatusSaving(true);
    try {
      const { pays, notes, due } = await freshFigures();
      if (invoice.status === "partial" && pays.length === 0) {
        await invoicesStore.update(invoice.id, { status: "paid" });
        setInvoice({ ...invoice, status: "paid" });
        celebrate(pays);
        return;
      }
      let all = pays;
      if (due > 0) {
        const added = await paymentsStore.add({ invoiceId: invoice.id, date: new Date().toISOString().slice(0, 10), amount: due, method: null, note: "Marked as paid" });
        all = [...pays, added];
        setPayments(all);
      }
      const next = await syncStatus(invoice, notes, all, invoiceVat(invoice, vatRegistered));
      // Nothing was owed (a £0 balance after a deposit): the figures alone
      // don't make it paid, the owner saying so does.
      if (due <= 0 && all.length === pays.length) {
        await invoicesStore.update(invoice.id, { status: "paid" });
        setInvoice((prev) => (prev ? { ...prev, status: "paid" } : prev));
        celebrate(all);
      } else if (next === "paid") {
        celebrate(all);
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Could not mark it paid.");
    } finally {
      setStatusSaving(false);
    }
  }

  async function removePayment(id: string) {
    if (!invoice) return;
    setPayError(null);
    try {
      await paymentsStore.remove(id);
      const { pays, notes } = await freshFigures();
      await syncStatus(invoice, notes, pays, invoiceVat(invoice, vatRegistered), true);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Could not remove the payment.");
    }
  }

  async function ensureLink(): Promise<string> {
    if (!invoice) return "";
    const made = await invoiceLinksStore.ensure(invoice.id);
    setLink(made);
    return invoiceLinkUrl(made.token);
  }

  // For a link sent to the wrong person: the old one stops working at once.
  async function replaceLink() {
    if (!invoice || !window.confirm("The current link will stop working straight away, for anyone who has it. Make a new one?")) return;
    setLinkError(null);
    setLinkBusy(true);
    try {
      setLink(await invoiceLinksStore.replace(invoice.id));
      setLinkCopied(false);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Couldn't replace the link.");
    } finally {
      setLinkBusy(false);
    }
  }

  async function copyLink() {
    setLinkError(null);
    setLinkBusy(true);
    try {
      const url = await ensureLink();
      await navigator.clipboard.writeText(url).catch(() => {});
      setLinkCopied(true);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Couldn't make the link.");
    } finally {
      setLinkBusy(false);
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
        items: withKinds(draftItems, draftCisRate),
        cisRate: draftCisRate,
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
        items: withKinds(draftItems, draftCisRate),
        cisRate: draftCisRate,
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
      const quoteTags = new Set((await quotesStore.all()).flatMap((q) => [`from ${q.number}`, depositTag(q.number)]));
      // Creates a new draft, same as New Invoice -- no real number and
      // no counter advance until it's marked sent.
      const created = await invoicesStore.add({
        clientId: invoice.clientId,
        date: today,
        number: draftPlaceholderNumber(),
        items: invoice.items,
        cisRate: invoice.cisRate,
        notes: invoice.notes,
        dueDate: addDays(today, 30),
        paymentTerms: invoice.paymentTerms,
        status: "draft",
        // "from <quote number>" marks the invoice a quote became; a copy isn't it.
        tags: invoice.tags.filter((t) => !quoteTags.has(t)),
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
      const notes = [created, ...creditNotes];
      setCreditNotes(notes);
      setCnAmount("");
      setCnReason("");
      setShowCnForm(false);
      await syncStatus(invoice, notes, payments, invoiceVat(invoice, vatRegistered));
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
      if (invoice) {
        // If the figures (this credit included) are what made it paid, it
        // follows them back; a status set by hand stays.
        const charge = invoiceCharge(invoice, invoiceVat(invoice, vatRegistered));
        const setByFigures = statusFromPayments({ total: charge.due, credited: creditOffDue(charge, sum(creditNotes)), paid: sum(payments) }) === invoice.status;
        await syncStatus(invoice, creditNotes.filter((c) => c.id !== id), payments, invoiceVat(invoice, vatRegistered), setByFigures);
      }
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

          <CisToggle rate={draftCisRate} onChange={setDraftCisRate} />

          <div className="space-y-2">
            <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-neutral-500 sm:grid">
              <span className={vatRegistered ? "col-span-4" : "col-span-6"}>Description</span>
              <span className="col-span-2 text-right">Qty</span>
              <span className="col-span-3 text-right">Unit price</span>
              {vatRegistered && <span className="col-span-2">VAT</span>}
            </div>
            {draftItems.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 border-b pb-3 sm:border-0 sm:pb-0">
                <input
                  className={`col-span-12 ${vatRegistered ? "sm:col-span-4" : "sm:col-span-6"} rounded-lg border px-3 py-2`}
                  placeholder="Description"
                  value={it.description}
                  onChange={(e) => updateDraftItem(idx, { description: e.target.value })}
                />
                <NumberInput
                  className={`${vatRegistered ? "col-span-3" : "col-span-4"} rounded-lg border px-3 py-2 text-right sm:col-span-2`}
                  placeholder="Qty"
                  aria-label="Quantity"
                  value={it.quantity}
                  onChange={(quantity) => updateDraftItem(idx, { quantity })}
                />
                <NumberInput
                  className={`${vatRegistered ? "col-span-4" : "col-span-7"} rounded-lg border px-3 py-2 text-right sm:col-span-3`}
                  placeholder="Unit price"
                  aria-label="Unit price"
                  value={it.unitPrice}
                  onChange={(unitPrice) => updateDraftItem(idx, { unitPrice })}
                />
                {vatRegistered && (
                  <select
                    aria-label="VAT rate"
                    className="col-span-4 rounded-lg border px-1 py-2 text-xs sm:col-span-2"
                    value={it.vatRate}
                    onChange={(e) => updateDraftItem(idx, { vatRate: e.target.value as VatRateKind })}
                  >
                    {VAT_RATE_KINDS.map((k) => <option key={k} value={k}>{VAT_RATE_LABELS[k]}</option>)}
                  </select>
                )}
                <button onClick={() => removeDraftLine(idx)} aria-label={`Remove line ${idx + 1}`} className="col-span-1 text-sm text-red-600">✕</button>
                {draftCisRate !== null && <LineKind item={it} onChange={(kind) => updateDraftItem(idx, { kind })} />}
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
            <CisSummary items={draftItems} rate={draftCisRate} total={draftTotals.total} />
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
  // What the customer pays: the total less any CIS the contractor keeps back.
  const totals = invoiceCharge(invoice, invoiceVat(invoice, vatRegistered));
  const creditNoteTotal = creditNotes.reduce((s, c) => s + c.amount, 0);
  const paidSoFar = sum(payments);
  const amountDue = invoiceBalance({ total: totals.due, credited: creditOffDue(totals, creditNoteTotal), paid: paidSoFar, status: invoice.status });
  const paid = invoice.status === "paid";
  // Closed by credit notes alone: nothing was paid to thank them for.
  const creditedInFull = paidSoFar === 0 && Math.round(creditNoteTotal * 100) >= Math.round(totals.total * 100);
  const overdue = isOverdue(invoice.status, invoice.dueDate);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${invoiceStatusBadgeClass(invoice.status, overdue)}`}>
            {invoiceStatusLabel(invoice.status, overdue)}
          </span>
          {!paid && (
            <button onClick={markPaidInFull} disabled={statusSaving || paySaving} className="rounded-lg border px-3 py-1 text-sm font-medium text-neutral-700 disabled:opacity-50">
              Mark as paid
            </button>
          )}
          {invoice.status !== "sent" && payments.length === 0 && (
            <button onClick={() => changeStatus("sent")} disabled={statusSaving} className="rounded-lg border px-3 py-1 text-sm font-medium text-neutral-700 disabled:opacity-50">
              Mark as unpaid
            </button>
          )}
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
        <IssuedInvoice invoice={invoice} client={client} profile={profile} creditNotes={creditNotes} payments={payments} />
      </div>

      <InvoiceReminders invoice={invoice} client={client} amountDue={amountDue} hasPayments={payments.length > 0} />

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
        <h2 className="font-semibold">View online</h2>
        {link ? (
          <>
            <p className="mt-1 text-sm text-neutral-600">
              {link.viewCount > 0
                ? `Opened ${link.viewCount === 1 ? "once" : `${link.viewCount} times`}: first ${new Date(link.firstViewedAt!).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${link.viewCount > 1 ? `, last ${new Date(link.lastViewedAt!).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}.`
                : "Not opened yet."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input readOnly aria-label="Invoice link" value={invoiceLinkUrl(link.token)} className="min-w-0 flex-1 rounded-lg border bg-neutral-50 px-3 py-2 text-xs text-neutral-700" onFocus={(e) => e.target.select()} />
              <button onClick={copyLink} disabled={linkBusy} className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50">
                {linkCopied ? "Copied" : "Copy link"}
              </button>
              <a href={`${invoiceLinkUrl(link.token)}#o`} target="_blank" rel="noopener" className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700">
                Open
              </a>
            </div>
            <button onClick={replaceLink} disabled={linkBusy} className="mt-2 text-xs font-medium text-neutral-500 underline disabled:opacity-50">
              Stop this link and make a new one
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-600">
              A private link your customer can open to see the invoice and download it. You&apos;ll see when they open it. It&apos;s added to the email automatically when you send it from here.
            </p>
            <button onClick={copyLink} disabled={linkBusy} className="mt-2 rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50">
              {linkBusy ? "Making the link…" : "Make and copy the link"}
            </button>
          </>
        )}
        {linkError && <p className="mt-2 text-sm text-red-600">{linkError}</p>}
      </div>

      <SendInvoicePanel
        sheet={<IssuedInvoice invoice={invoice} client={client} profile={profile} creditNotes={creditNotes} payments={payments} forPdf />}
        viewUrl={link ? invoiceLinkUrl(link.token) : ""}
        ensureViewUrl={ensureLink}
        pdfKey={JSON.stringify([invoice, client, profile, creditNotes, payments])}
        signInNext={`/invoices/${invoice.id}`}
        missingName="Add your business name in Settings first, so the customer knows who it's from."
        fields={{
          issuerName: profile?.businessName ?? "",
          issuerEmail: "",
          customerName: client?.name ?? "",
          customerEmail: client?.email ?? "",
          number: invoice.number,
          total: paid
            ? `£${money(Math.max(0, totals.due - creditOffDue(totals, creditNoteTotal)))}, paid`
            : paidSoFar > 0
              ? `£${money(amountDue)} (after £${money(paidSoFar)} received)`
              : `£${money(amountDue)}`,
          dueDate: invoice.dueDate && !paid ? longDate(invoice.dueDate) : "",
          // A paid invoice is a copy for their records: no amount to pay, no
          // bank details.
          bank: paid ? [] : bankRowsFromText(profile?.bankDetails ?? ""),
        }}
      />

      {client && (
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
          <h2 className="mb-3 font-semibold">Text {client.name}</h2>
          <TextCustomer
            key={invoice.status}
            client={client}
            from={profile?.businessName ?? ""}
            presets={paid && !creditedInFull ? ["thanks", "done"] : ["done", "onMyWay", "late", "arrived"]}
            link={link ? invoiceLinkUrl(link.token) : ""}
            makeLink={ensureLink}
          />
        </div>
      )}

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Payments</h2>
          {amountDue > 0 && (
            <button
              onClick={() => {
                setShowPayForm((v) => !v);
                setPayAmount(money(amountDue).replace(/,/g, ""));
              }}
              className="text-sm font-medium text-blue-600"
            >
              {showPayForm ? "Cancel" : "+ Record a payment"}
            </button>
          )}
        </div>
        {showPayForm && (
          <form onSubmit={addPayment} className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <input type="date" aria-label="Date received" className="rounded-lg border px-3 py-2 text-sm" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              <input
                aria-label="Amount received"
                className="rounded-lg border px-3 py-2 text-sm"
                placeholder="Amount received (£)"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                inputMode="decimal"
              />
              <select aria-label="How it was paid" className="col-span-2 rounded-lg border px-3 py-2 text-sm sm:col-span-1" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod | "")}>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
                <option value="">Not saying</option>
              </select>
            </div>
            {payError && <p className="text-sm text-red-600">{payError}</p>}
            <button disabled={paySaving} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {paySaving ? "Saving…" : "Save payment"}
            </button>
          </form>
        )}
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            {paid ? "Marked paid (no payments recorded)." : "Nothing received yet. Record part-payments here and the balance and reminders follow."}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-b pb-2 text-sm">
                <span>
                  {longDate(p.date)} — £{money(p.amount)}
                  {p.method ? ` · ${PAYMENT_METHOD_LABELS[p.method]}` : ""}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                <button onClick={() => removePayment(p.id)} className="shrink-0 text-red-600">Remove</button>
              </div>
            ))}
            <p className="text-sm font-medium">{amountDue > 0 ? `Still owed: £${money(amountDue)}` : "Paid in full."}</p>
          </div>
        )}
        {!showPayForm && payError && <p className="mt-2 text-sm text-red-600">{payError}</p>}
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
            {invoice.cisRate !== null && (
              <p className="text-xs text-neutral-500">
                Credit the value of the work, before CIS: what the contractor pays drops by the same share. To cancel the whole invoice,
                credit its total of £{money(totals.total)}.
              </p>
            )}
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
