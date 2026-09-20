"use client";

import Link from "next/link";
import { money } from "@/lib/money";
import { DuplicatePair, duplicatePairs, pairKey, readIgnoredDuplicates, writeIgnoredDuplicates } from "@/lib/duplicateContacts";
import { errorText, loadFailed } from "@/lib/errorText";

import { useEffect, useMemo, useState } from "react";
import ScanOrAdd from "@/components/ScanOrAdd";
import { useSearchParams } from "next/navigation";
import { Client, ClientKind, Invoice, businessProfileStore, clientsStore, invoicesStore } from "@/lib/storage";
import { downloadCsv } from "@/lib/exportCsv";
import { displayInvoiceNumber, invoiceStatusBadgeClass, invoiceStatusLabel, isOverdue } from "@/lib/invoiceStatus";
import Tip from "@/components/Tip";
import CompanyNameInput from "@/components/CompanyNameInput";
import AddressFields from "@/components/AddressFields";
import TextCustomer from "@/components/TextCustomer";
import { phoneLinks } from "@/lib/customerText";

function invoiceTotal(inv: Invoice) {
  return inv.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
}

type ClientDraft = {
  name: string;
  isCompany: boolean;
  email: string;
  address: string;
  vatNumber: string;
  paymentTerms: string;
  defaultCurrency: string;
  contactPerson: string;
  phone: string;
  remindersEnabled: boolean;
};

function draftFor(c: Client): ClientDraft {
  return {
    name: c.name,
    isCompany: c.isCompany,
    email: c.email,
    address: c.address,
    vatNumber: c.vatNumber,
    paymentTerms: c.paymentTerms,
    defaultCurrency: c.defaultCurrency,
    contactPerson: c.contactPerson,
    phone: c.phone,
    remindersEnabled: c.remindersEnabled,
  };
}

export default function ClientsPage() {
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ClientKind>(searchParams.get("tab") === "supplier" ? "supplier" : "client");
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ClientDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [textingId, setTextingId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [merging, setMerging] = useState<string | null>(null);
  const [merged, setMerged] = useState<string | null>(null);
  // Pairs put aside stay aside on this device.
  const [ignored, setIgnored] = useState<string[]>(() => readIgnoredDuplicates());

  useEffect(() => {
    Promise.all([clientsStore.all(), invoicesStore.all()])
      .then(([c, inv]) => {
        setClients(c);
        setInvoices(inv);
      })
      .catch((err) => setError(loadFailed(err, "your contacts")))
      .finally(() => setLoading(false));
    businessProfileStore.get().then((p) => setBusinessName(p.businessName), () => {});
  }, []);

  function invoicesForClient(clientId: string) {
    return invoices
      .filter((inv) => inv.clientId === clientId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  const visibleClients = useMemo(
    () => clients.filter((c) => c.kind === tab && (showArchived || !c.archived)),
    [clients, tab, showArchived]
  );
  const archivedCount = clients.filter((c) => c.kind === tab && c.archived).length;
  const duplicates = useMemo(
    () => duplicatePairs(clients).filter((p) => p.keep.kind === tab && !ignored.includes(pairKey(p))),
    [clients, tab, ignored]
  );

  // Everything of the duplicate's moves to the one being kept; the duplicate
  // is archived, never deleted.
  async function merge(pair: DuplicatePair) {
    const counts = [
      [invoicesForClient(pair.duplicate.id).length, "invoice"],
    ] as const;
    const what = counts.filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}${n === 1 ? "" : "s"}`).join(", ");
    if (!window.confirm(`Move everything from "${pair.duplicate.name}"${what ? ` (${what})` : ""} to "${pair.keep.name}" and archive the duplicate?`)) return;
    setMerging(pair.duplicate.id);
    setError(null);
    try {
      const { moved, left } = await clientsStore.mergeInto(pair.duplicate.id, pair.keep.id);
      const [c, inv] = await Promise.all([clientsStore.all(), invoicesStore.all()]);
      setClients(c);
      setInvoices(inv);
      const total = Object.values(moved).reduce((a, b) => a + b, 0);
      setMerged(
        `Merged into ${pair.keep.name}${total ? `: ${total} record${total === 1 ? "" : "s"} moved` : ""}.${left.length ? ` Some rows stayed with the old record (${left.join(", ")}).` : ""}`
      );
    } catch (err) {
      setError(errorText(err, "Couldn't merge those two."));
    } finally {
      setMerging(null);
    }
  }

  function ignore(pair: DuplicatePair) {
    const next = [...ignored, pairKey(pair)];
    setIgnored(next);
    writeIgnoredDuplicates(next);
  }

  function startEdit(c: Client) {
    setEditingId(c.id);
    setDraft(draftFor(c));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(id: string) {
    if (!draft) return;
    setError(null);
    setBusyId(id);
    try {
      await clientsStore.update(id, draft);
      setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...draft } : c)));
      setEditingId(null);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeClient(id: string) {
    setError(null);
    try {
      await clientsStore.remove(id);
      setClients((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove client.");
    }
  }

  // The escape hatch Remove can't be, once it has any real history --
  // hides it from client/supplier pickers on new records without
  // touching anything it's already linked to.
  async function toggleArchived(c: Client) {
    setError(null);
    const next = !c.archived;
    setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, archived: next } : x)));
    try {
      await (next ? clientsStore.archive(c.id) : clientsStore.unarchive(c.id));
    } catch (err) {
      setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, archived: !next } : x)));
      setError(err instanceof Error ? err.message : "Could not update.");
    }
  }

  function exportClients() {
    downloadCsv(
      `${tab}s-${new Date().toISOString().slice(0, 10)}.csv`,
      visibleClients.map((c) => ({
        name: c.name,
        type: c.isCompany ? "Company" : "Individual",
        email: c.email,
        address: c.address,
        vat_number: c.vatNumber,
        payment_terms: c.paymentTerms,
        default_currency: c.defaultCurrency,
        contact_person: c.contactPerson,
      }))
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clients & suppliers</h1>
          <p className="mt-1 text-neutral-600">
            Clients are who you invoice. Suppliers are who invoices or receipts come from.
          </p>
        </div>
        <div className="flex items-start gap-2">
          {visibleClients.length > 0 && (
            <button onClick={exportClients} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
              Export CSV
            </button>
          )}
          <ScanOrAdd scanHref={`/clients/new?kind=${tab}&scan=1`} scanLabel={`Scan a ${tab}`} addHref={`/clients/new?kind=${tab}`} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex rounded-lg border text-sm w-fit">
          <button
            onClick={() => setTab("client")}
            className={`px-4 py-1.5 ${tab === "client" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
          >
            Clients
          </button>
          <button
            onClick={() => setTab("supplier")}
            className={`px-4 py-1.5 ${tab === "supplier" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
          >
            Suppliers
          </button>
        </div>
      </div>

      <Tip id="clients-scan">
        Tip: photograph a business card, letterhead or invoice and the name, address, email and VAT number are filled in
        for you.
      </Tip>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {merged && <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">{merged}</p>}
      {duplicates.map((pair) => (
        <div key={pairKey(pair)} className="rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
          <p className="text-sm">
            <strong>{pair.keep.name}</strong> and <strong>{pair.duplicate.name}</strong> look like the same {tab}: {pair.why}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => merge(pair)}
              disabled={merging === pair.duplicate.id}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {merging === pair.duplicate.id ? "Merging…" : `Merge into ${pair.keep.name}`}
            </button>
            <button type="button" onClick={() => ignore(pair)} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
              They&apos;re different
            </button>
          </div>
        </div>
      ))}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {visibleClients.length === 0 && archivedCount === 0 && !error && (
            <p className="text-sm text-neutral-500">
              No {tab}s yet. Scan a business card, letter or invoice to add one, or add one manually.
            </p>
          )}
          {visibleClients.map((c) => {
            // A supplier can be invoiced too (a quote to them turned into an
            // invoice), and then needs the same reminder switch and history.
            const clientInvoices = invoicesForClient(c.id);
            const billed = tab === "client" || clientInvoices.length > 0;
            const expanded = expandedClientId === c.id;
            const editing = editingId === c.id;
            return (
              <div key={c.id} className="rounded-xl border bg-white text-neutral-900 shadow-sm">
                {editing && draft ? (
                  <div className="space-y-3 p-4">
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={draft.isCompany} onChange={() => setDraft({ ...draft, isCompany: true })} />
                        Company
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={!draft.isCompany} onChange={() => setDraft({ ...draft, isCompany: false })} />
                        Individual
                      </label>
                    </div>
                    {draft.isCompany ? (
                      <CompanyNameInput
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder="Company name"
                        lookupPlaceholder="Company name (type to search Companies House)"
                        value={draft.name}
                        onChange={(name) => setDraft({ ...draft, name })}
                        address={draft.address}
                        onAddress={(address) => setDraft({ ...draft, address })}
                        onPick={(c, fillAddress) => setDraft({ ...draft, name: c.name, address: fillAddress ?? draft.address })}
                      />
                    ) : (
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder="Full name"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                    )}
                    <input
                      type="email"
                      autoComplete="email"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="Email"
                      value={draft.email}
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    />
                    <AddressFields address={draft.address} onAddress={(address) => setDraft({ ...draft, address })} />
                    <div className="grid grid-cols-2 gap-3">
                      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="VAT number" value={draft.vatNumber} onChange={(e) => setDraft({ ...draft, vatNumber: e.target.value })} />
                      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Contact person" value={draft.contactPerson} onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })} />
                      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Phone" type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Payment terms" value={draft.paymentTerms} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })} />
                      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Default currency" value={draft.defaultCurrency} onChange={(e) => setDraft({ ...draft, defaultCurrency: e.target.value })} />
                    </div>
                    {billed && (
                      <label className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={draft.remindersEnabled}
                          onChange={(e) => setDraft({ ...draft, remindersEnabled: e.target.checked })}
                        />
                        Send automatic payment reminders for invoices to them
                      </label>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={() => saveEdit(c.id)}
                        disabled={busyId === c.id}
                        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {busyId === c.id ? "Saving…" : "Save"}
                      </button>
                      <button onClick={cancelEdit} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        {c.name}
                        {c.archived && (
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">Archived</span>
                        )}
                      </div>
                      <div className="text-sm text-neutral-500">
                        {c.isCompany ? "Company" : "Individual"}{c.email ? ` · ${c.email}` : ""}{c.phone ? ` · ${c.phone}` : ""}{c.vatNumber ? ` · VAT ${c.vatNumber}` : ""}
                        {billed && !c.remindersEnabled && " · Reminders off"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {phoneLinks(c.phone) && (
                        <button onClick={() => setTextingId(textingId === c.id ? null : c.id)} className="text-sm font-medium text-blue-600">
                          {textingId === c.id ? "Close" : "Text"}
                        </button>
                      )}
                      {clientInvoices.length > 0 && (
                        <Link href={`/clients/${c.id}/statement`} className="text-sm font-medium text-blue-600">
                          Statement
                        </Link>
                      )}
                      {clientInvoices.length > 0 && (
                        <button
                          onClick={() => setExpandedClientId(expanded ? null : c.id)}
                          className="text-sm font-medium text-blue-600"
                        >
                          {expanded ? "Hide" : "Payment history"}
                        </button>
                      )}
                      <button onClick={() => startEdit(c)} className="text-sm font-medium text-blue-600">
                        Edit
                      </button>
                      <button onClick={() => toggleArchived(c)} className="text-sm font-medium text-neutral-600">
                        {c.archived ? "Unarchive" : "Archive"}
                      </button>
                      <button onClick={() => removeClient(c.id)} className="text-sm text-red-600">
                        Remove
                      </button>
                    </div>
                  </div>
                )}
                {textingId === c.id && !editing && (
                  <div className="border-t p-4">
                    <TextCustomer client={c} from={businessName} presets={["onMyWay", "late", "arrived"]} />
                  </div>
                )}
                {expanded && !editing && (
                  <div className="space-y-2 border-t p-4">
                    {clientInvoices.map((inv) => {
                      const overdue = isOverdue(inv.status, inv.dueDate);
                      return (
                        <div key={inv.id} className="flex items-center justify-between text-sm">
                          <span>{displayInvoiceNumber(inv)} · {inv.date} · {money(invoiceTotal(inv))}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusBadgeClass(inv.status, overdue)}`}>
                            {invoiceStatusLabel(inv.status, overdue)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {archivedCount > 0 && (
            <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-sm font-medium text-neutral-500">
              {showArchived ? "Hide archived" : `${archivedCount} archived`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
