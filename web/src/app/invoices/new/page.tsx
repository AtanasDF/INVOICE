"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BusinessProfile, Client, Invoice, InvoiceItem, businessProfileStore, clientsStore, invoicesStore } from "@/lib/storage";
import { supabase } from "@/lib/supabaseClient";
import { VAT_RATE_KINDS, VAT_RATE_LABELS, VatRateKind, computeInvoiceTotals } from "@/lib/vat";
import { draftPlaceholderNumber } from "@/lib/invoiceNumber";
import { FreeInvoiceDraft, clearFreeInvoiceDraft, readFreeInvoiceDraft, termsDays } from "@/lib/freeInvoiceDraft";
import { CameraIcon } from "@/components/icons";
import CaptureButton from "@/components/CaptureButton";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";
import type { InvoiceTemplate } from "@/lib/invoiceTemplate";
import { matchSupplier } from "@/lib/supplierMatch";

function addDays(dateStr: string, days: number): string {
  // UTC methods throughout -- see the comment on the equivalent helper in
  // expenses/page.tsx for why: mixing UTC parsing with local getDate/setDate
  // before a toISOString round-trip is a real off-by-one-day bug depending
  // on the viewer's timezone offset, confirmed to break in either direction.
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type ScanLineItem = { description: string; quantity: number; unitPrice: number };
type ScanApiResult = {
  date: string | null;
  lineItems: ScanLineItem[];
  notes: string | null;
};

// Printed terms win over the printed date gap, which catches invoices that
// only show a due date.
function copiedTermsDays(t: InvoiceTemplate): number | null {
  if (t.paymentTerms) {
    if (/receipt|immediate/i.test(t.paymentTerms)) return 0;
    const m = /(\d+)\s*days?/i.exec(t.paymentTerms);
    if (m) return Number(m[1]);
  }
  if (!t.date || !t.dueDate) return null;
  const gap = (Date.parse(t.dueDate) - Date.parse(t.date)) / 86_400_000;
  return Number.isFinite(gap) && gap >= 0 ? Math.round(gap) : null;
}

type ScannedCustomer = { name: string; email: string; address: string };

const BLANK_ITEM: InvoiceItem = { description: "", quantity: 1, unitPrice: 0, vatRate: "standard" };

function importedDueDate(draft: FreeInvoiceDraft, date: string): { dueDate: string; manual: boolean } {
  const days = termsDays(draft.paymentTerms);
  if (days !== null) return { dueDate: addDays(date, days), manual: false };
  const derived = addDays(date, 30);
  const dueDate = draft.dueDate || derived;
  return { dueDate, manual: dueDate !== derived };
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [pastInvoices, setPastInvoices] = useState<Invoice[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [clientId, setClientId] = useState("");
  // The free-invoice draft is read once, on mount: the form is empty then by
  // construction, and the gate never server-renders this page, so lazy
  // initialisers are safe and avoid a setState-in-effect cascade.
  const [draft] = useState(readFreeInvoiceDraft);
  const [date, setDate] = useState(() => draft?.date || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => (draft ? importedDueDate(draft, date).dueDate : addDays(date, 30)));
  const [dueDateManual, setDueDateManual] = useState(() => !!draft && importedDueDate(draft, date).manual);
  const [paymentTerms, setPaymentTerms] = useState<string>(draft?.paymentTerms ?? "");
  const [items, setItems] = useState<InvoiceItem[]>(() =>
    draft?.lines.length
      ? draft.lines.map(({ description, quantity, unitPrice, vatRate }) => ({
          description,
          quantity,
          unitPrice,
          vatRate: draft.vatRegistered ? vatRate : "standard",
        }))
      : [{ ...BLANK_ITEM }]
  );
  const [notes, setNotes] = useState<string>(draft?.notes ?? "");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Scan an invoice" on the list opens straight into the camera to copy an
  // invoice sent before; the in-page button reads a source document instead.
  const [copyMode] = useState(() => new URLSearchParams(window.location.search).get("scan") === "1");
  const [capture, setCapture] = useState<"copy" | "attach" | null>(() => (copyMode ? "copy" : null));
  const [copied, setCopied] = useState<{ currency: string | null } | null>(null);
  const [newCustomer, setNewCustomer] = useState<ScannedCustomer | null>(null);
  const [addingClient, setAddingClient] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [imported, setImported] = useState(!!draft);

  useEffect(() => {
    Promise.all([clientsStore.all(), invoicesStore.all(), businessProfileStore.get()]).then(([c, inv, biz]) => {
      setClients(c);
      setPastInvoices(inv);
      setProfile(biz);
    });
  }, []);

  function discardImport() {
    clearFreeInvoiceDraft();
    setItems([{ ...BLANK_ITEM }]);
    setNotes("");
    setPaymentTerms("");
    setDueDate(addDays(date, 30));
    setDueDateManual(false);
    setImported(false);
  }

  const billableClients = clients.filter((c) => c.kind === "client" && !c.archived);

  const suggestedItems = useMemo(() => {
    if (!clientId) return [];
    const byDescription = new Map<string, { unitPrice: number; vatRate: VatRateKind; count: number; lastDate: string }>();
    for (const inv of pastInvoices) {
      if (inv.clientId !== clientId) continue;
      for (const item of inv.items) {
        if (!item.description.trim()) continue;
        const existing = byDescription.get(item.description);
        if (!existing || inv.date > existing.lastDate) {
          byDescription.set(item.description, {
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            count: (existing?.count ?? 0) + 1,
            lastDate: inv.date,
          });
        } else {
          existing.count += 1;
        }
      }
    }
    return Array.from(byDescription.entries())
      .map(([description, v]) => ({ description, unitPrice: v.unitPrice, vatRate: v.vatRate, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [clientId, pastInvoices]);

  // The VAT rate this client's most recent invoice used for a line with
  // this exact description -- scoped to (client, item), not the item
  // globally, since the same description could mean something differently
  // vat-treated for a different client. Falls back to standard-rated,
  // since most things are.
  function learnedVatRate(forClientId: string, description: string): VatRateKind {
    return pastVatRate(forClientId, description) ?? "standard";
  }

  function pastVatRate(forClientId: string, description: string): VatRateKind | null {
    if (!forClientId || !description.trim()) return null;
    let best: { vatRate: VatRateKind; date: string } | null = null;
    for (const inv of pastInvoices) {
      if (inv.clientId !== forClientId) continue;
      for (const item of inv.items) {
        if (item.description !== description) continue;
        if (!best || inv.date > best.date) best = { vatRate: item.vatRate, date: inv.date };
      }
    }
    return best?.vatRate ?? null;
  }

  function onClientChange(id: string) {
    setClientId(id);
    const client = clients.find((c) => c.id === id);
    if (client?.paymentTerms && !paymentTerms) setPaymentTerms(client.paymentTerms);
  }

  function addSuggestedItem(description: string, unitPrice: number, vatRate: VatRateKind) {
    setItems((prev) => {
      const emptyIdx = prev.findIndex((it) => !it.description.trim());
      if (emptyIdx >= 0) {
        return prev.map((it, i) => (i === emptyIdx ? { description, quantity: 1, unitPrice, vatRate } : it));
      }
      return [...prev, { description, quantity: 1, unitPrice, vatRate }];
    });
  }

  function onDateChange(value: string) {
    setDate(value);
    if (!dueDateManual) setDueDate(addDays(value, 30));
  }

  function updateItem(idx: number, patch: Partial<InvoiceItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  // Fires once the description field loses focus rather than on every
  // keystroke, so a manually-typed description gets the learned rate
  // applied once it's actually complete, not on some half-typed prefix.
  // Only applies when the line's rate is still at the "standard" default
  // -- a rate already hand-picked from the dropdown is never silently
  // overridden.
  function onDescriptionBlur(idx: number) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx || it.vatRate !== "standard" || !it.description.trim()) return it;
        return { ...it, vatRate: learnedVatRate(clientId, it.description) };
      })
    );
  }

  function addLine() {
    setItems((prev) => [...prev, { ...BLANK_ITEM }]);
  }

  function removeLine(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onDocumentCaptured(file: CapturedFile) {
    setCapture(null);
    setScanning(true);
    setScanError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ image: file.dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Scan failed.");
      const result = body.result as ScanApiResult;

      if (result.date) onDateChange(result.date);
      if (result.notes) setNotes((prev) => prev || result.notes || "");
      if (result.lineItems?.length) {
        setItems(
          result.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            vatRate: learnedVatRate(clientId, li.description),
          }))
        );
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  async function onInvoiceCopied(file: CapturedFile) {
    setCapture(null);
    setScanning(true);
    setScanError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const res = await fetch("/api/invoice-template", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ images: [file.dataUrl], engine: "claude" }),
      });
      const body = (await res.json().catch(() => ({}))) as { template?: InvoiceTemplate; error?: string };
      if (!res.ok || !body.template) throw new Error(body.error || "Couldn't read the invoice.");
      applyCopy(body.template);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Couldn't read the invoice.");
    } finally {
      setScanning(false);
    }
  }

  function applyCopy(t: InvoiceTemplate) {
    const name = t.customer.name?.trim() ?? "";
    const match = name ? matchSupplier(name, billableClients) : null;
    const forClientId = match?.id ?? "";
    if (match) onClientChange(match.id);
    setNewCustomer(!match && name ? { name, email: t.customer.email ?? "", address: t.customer.address ?? "" } : null);

    if (t.lineItems.length) {
      setItems(
        t.lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          vatRate: pastVatRate(forClientId, li.description) ?? (t.showsVat ? "standard" : "zero"),
        }))
      );
    }

    // A new invoice: dated today whatever the scan says.
    const today = new Date().toISOString().slice(0, 10);
    if (date !== today) onDateChange(today);
    const days = copiedTermsDays(t);
    if (days !== null) {
      setPaymentTerms(days === 0 ? "Upon receipt" : `${days} days`);
      setDueDate(addDays(today, days));
      // Otherwise a later date change would reset the due date to 30 days.
      setDueDateManual(days !== 30);
    }

    if (t.notes) setNotes((prev) => prev || t.notes || "");
    setCopied({ currency: t.currency && t.currency !== "GBP" ? t.currency : null });
  }

  async function addScannedClient() {
    if (!newCustomer) return;
    setAddingClient(true);
    setError(null);
    try {
      const c = await clientsStore.add({
        name: newCustomer.name,
        isCompany: true,
        email: newCustomer.email,
        address: newCustomer.address,
        kind: "client",
        vatNumber: "",
        paymentTerms: "",
        defaultCurrency: "",
        contactPerson: "",
        remindersEnabled: true,
      });
      setClients((prev) => [...prev, c]);
      setClientId(c.id);
      setNewCustomer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the client.");
    } finally {
      setAddingClient(false);
    }
  }

  const totals = computeInvoiceTotals(items, profile?.vatRegistered ?? false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      // No real invoice number yet -- that's assigned when this is
      // marked sent, not now. See draftPlaceholderNumber for why.
      const inv = await invoicesStore.add({
        clientId,
        date,
        number: draftPlaceholderNumber(),
        items,
        notes,
        dueDate: dueDate || null,
        paymentTerms,
        status: "draft",
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (imported) clearFreeInvoiceDraft();
      router.push(`/invoices/${inv.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save invoice.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {capture && (
        <DocumentCapture
          onCapture={capture === "copy" ? onInvoiceCopied : onDocumentCaptured}
          onClose={() => setCapture(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New invoice</h1>
        <CaptureButton
          onOpen={() => setCapture("attach")}
          onCapture={onDocumentCaptured}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
        >
          {scanning ? "Reading document…" : (<><CameraIcon /> Scan or attach a document</>)}
        </CaptureButton>
      </div>
      {copyMode ? (
        <div className="-mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-600">
          <span>
            {copied
              ? "Copied from your scan: customer, lines and terms. Dated today — check everything before saving."
              : "Scan an invoice you've sent before to copy it."}
            {copied?.currency && ` Amounts were in ${copied.currency}; this account invoices in £, so check them.`}
          </span>
          <CaptureButton
            onOpen={() => setCapture("copy")}
            onCapture={onInvoiceCopied}
            disabled={scanning}
            className="font-medium underline disabled:opacity-50"
          >
            {scanning ? "Reading invoice…" : copied ? "Scan again" : "Scan an invoice"}
          </CaptureButton>
        </div>
      ) : (
        <p className="text-xs text-neutral-500 -mt-4">
          Scanning fills in the date, line items, and notes from a source document (a timesheet, delivery note,
          etc.) — the client is always your own choice below, never guessed.
        </p>
      )}
      {scanError && <p className="text-sm text-red-600">{scanError}</p>}
      {imported && draft && (
        <p className="text-sm text-blue-600">
          Imported from your free invoice.
          {draft.currencySymbol !== "£" &&
            ` Amounts were entered in ${draft.currencySymbol}; this account invoices in £, so check them before saving.`}{" "}
          <button type="button" onClick={discardImport} className="font-medium underline">Discard import</button>
        </p>
      )}

      <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        {newCustomer && !clientId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-neutral-50 px-3 py-2 text-sm">
            <span>{newCustomer.name} isn&apos;t one of your clients yet</span>
            <button
              type="button"
              onClick={addScannedClient}
              disabled={addingClient}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {addingClient ? "Adding…" : "Add as new client"}
            </button>
          </div>
        )}
        <select className="w-full rounded-lg border px-3 py-2" value={clientId} onChange={(e) => onClientChange(e.target.value)}>
          <option value="">Select a client or company</option>
          {billableClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {suggestedItems.length > 0 && (
          <div>
            <p className="text-xs text-neutral-500">Used before for this client — tap to add a line:</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {suggestedItems.map((s) => (
                <button
                  key={s.description}
                  type="button"
                  onClick={() => addSuggestedItem(s.description, s.unitPrice, s.vatRate)}
                  className="rounded-full border px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  + {s.description} (£{s.unitPrice.toFixed(2)})
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-neutral-500">Invoice date</label>
            <input type="date" className="w-full rounded-lg border px-3 py-2" value={date} onChange={(e) => onDateChange(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Due date</label>
            <input
              type="date"
              className="w-full rounded-lg border px-3 py-2"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setDueDateManual(true);
              }}
            />
          </div>
        </div>
        <input className="w-full rounded-lg border px-3 py-2" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Payment terms (e.g. 30 days)" />

        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 px-1 text-xs font-medium text-neutral-500">
            <span className={profile?.vatRegistered ? "col-span-4" : "col-span-6"}>Description</span>
            <span className="col-span-2 text-right">Qty</span>
            <span className="col-span-3 text-right">Unit price</span>
            {profile?.vatRegistered && <span className="col-span-2">VAT</span>}
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2">
              <input
                className={`${profile?.vatRegistered ? "col-span-4" : "col-span-6"} rounded-lg border px-3 py-2`}
                placeholder="Description (e.g. Monthly work, 12-30 June)"
                value={it.description}
                onChange={(e) => updateItem(idx, { description: e.target.value })}
                onBlur={() => onDescriptionBlur(idx)}
              />
              <input
                className="col-span-2 rounded-lg border px-3 py-2"
                placeholder="Qty"
                value={it.quantity}
                onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
              />
              <input
                className="col-span-3 rounded-lg border px-3 py-2"
                placeholder="Unit price"
                value={it.unitPrice}
                onChange={(e) => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
              />
              {profile?.vatRegistered && (
                <select
                  className="col-span-2 rounded-lg border px-1 py-2 text-xs"
                  value={it.vatRate}
                  onChange={(e) => updateItem(idx, { vatRate: e.target.value as VatRateKind })}
                >
                  {VAT_RATE_KINDS.map((k) => <option key={k} value={k}>{VAT_RATE_LABELS[k]}</option>)}
                </select>
              )}
              <button onClick={() => removeLine(idx)} className="col-span-1 text-sm text-red-600">✕</button>
            </div>
          ))}
          <button onClick={addLine} className="text-sm font-medium text-blue-600">+ Add line</button>
        </div>

        <textarea className="w-full rounded-lg border px-3 py-2" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Tags, comma separated (optional, e.g. Site A, Q3 job)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="space-y-1 border-t pt-3 text-sm">
          {profile?.vatRegistered && (
            <>
              <div className="flex justify-end text-neutral-600">
                <span>Subtotal: £{totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.vatByRate.map((v) => (
                <div key={v.kind} className="flex justify-end text-neutral-600">
                  <span>{VAT_RATE_LABELS[v.kind]}: £{v.vat.toFixed(2)}</span>
                </div>
              ))}
            </>
          )}
          <div className="flex items-center justify-between pt-1">
            <div className="text-lg font-bold">Total: £{totals.total.toFixed(2)}</div>
            <button onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save draft"}
            </button>
          </div>
          <p className="text-right text-xs text-neutral-500">
            Saves as a draft — fully editable until you mark it sent, which is what assigns its invoice number, locks the rest in, and starts the due-date clock.
          </p>
        </div>
      </div>
    </div>
  );
}
