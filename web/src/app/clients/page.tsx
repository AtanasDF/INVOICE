"use client";

import { useEffect, useMemo, useState } from "react";
import ScanOrAdd from "@/components/ScanOrAdd";
import { useSearchParams } from "next/navigation";
import { Client, ClientKind, Invoice, clientsStore, invoicesStore } from "@/lib/storage";
import { downloadCsv } from "@/lib/exportCsv";
import { displayInvoiceNumber, invoiceStatusBadgeClass, invoiceStatusLabel, isOverdue } from "@/lib/invoiceStatus";
import Tip from "@/components/Tip";

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

  useEffect(() => {
    Promise.all([clientsStore.all(), invoicesStore.all()]).then(([c, inv]) => {
      setClients(c);
      setInvoices(inv);
      setLoading(false);
    });
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

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {visibleClients.length === 0 && archivedCount === 0 && (
            <p className="text-sm text-neutral-500">
              No {tab}s yet. Scan a business card, letter or invoice to add one, or add one manually.
            </p>
          )}
          {visibleClients.map((c) => {
            const clientInvoices = tab === "client" ? invoicesForClient(c.id) : [];
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
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder={draft.isCompany ? "Company name" : "Full name"}
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="Email"
                      value={draft.email}
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    />
                    <textarea
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="Billing address"
                      value={draft.address}
                      onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="VAT number" value={draft.vatNumber} onChange={(e) => setDraft({ ...draft, vatNumber: e.target.value })} />
                      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Contact person" value={draft.contactPerson} onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })} />
                      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Payment terms" value={draft.paymentTerms} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })} />
                      <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Default currency" value={draft.defaultCurrency} onChange={(e) => setDraft({ ...draft, defaultCurrency: e.target.value })} />
                    </div>
                    {tab === "client" && (
                      <label className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={draft.remindersEnabled}
                          onChange={(e) => setDraft({ ...draft, remindersEnabled: e.target.checked })}
                        />
                        Send automatic payment reminders to this client
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
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        {c.name}
                        {c.archived && (
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">Archived</span>
                        )}
                      </div>
                      <div className="text-sm text-neutral-500">
                        {c.isCompany ? "Company" : "Individual"}{c.email ? ` · ${c.email}` : ""}{c.vatNumber ? ` · VAT ${c.vatNumber}` : ""}
                        {tab === "client" && !c.remindersEnabled && " · Reminders off"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {tab === "client" && clientInvoices.length > 0 && (
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
                {expanded && !editing && (
                  <div className="space-y-2 border-t p-4">
                    {clientInvoices.map((inv) => {
                      const overdue = isOverdue(inv.status, inv.dueDate);
                      return (
                        <div key={inv.id} className="flex items-center justify-between text-sm">
                          <span>{displayInvoiceNumber(inv)} · {inv.date} · £{invoiceTotal(inv).toFixed(2)}</span>
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
