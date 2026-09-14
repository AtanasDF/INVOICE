"use client";

import { useEffect, useMemo, useState } from "react";
import { Client, ClientKind, clientsStore } from "@/lib/storage";
import { downloadCsv } from "@/lib/exportCsv";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ClientKind>("client");

  const [name, setName] = useState("");
  const [isCompany, setIsCompany] = useState(true);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    clientsStore.all().then((c) => {
      setClients(c);
      setLoading(false);
    });
  }, []);

  const visibleClients = useMemo(() => clients.filter((c) => c.kind === tab), [clients, tab]);

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const created = await clientsStore.add({
        name,
        isCompany,
        email,
        address,
        kind: tab,
        vatNumber,
        paymentTerms,
        defaultCurrency,
        contactPerson,
      });
      setClients((prev) => [...prev, created]);
      setName("");
      setEmail("");
      setAddress("");
      setVatNumber("");
      setPaymentTerms("");
      setDefaultCurrency("");
      setContactPerson("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save client.");
    } finally {
      setSaving(false);
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients & suppliers</h1>
          <p className="mt-1 text-neutral-600">
            Clients are who you invoice. Suppliers are who invoices or receipts come from.
          </p>
        </div>
        {visibleClients.length > 0 && (
          <button onClick={exportClients} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
            Export CSV
          </button>
        )}
      </div>

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

      <form onSubmit={addClient} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <p className="text-sm font-medium text-neutral-500">
          Adding a new {tab === "client" ? "client" : "supplier"}
        </p>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={isCompany} onChange={() => setIsCompany(true)} />
            Company
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!isCompany} onChange={() => setIsCompany(false)} />
            Individual
          </label>
        </div>
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder={isCompany ? "Company name" : "Full name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <textarea
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Billing address (optional)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium text-neutral-600">More details (optional)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="VAT number" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Contact person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Payment terms (e.g. 30 days)" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Default currency (e.g. GBP)" value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} />
          </div>
        </details>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : `Save ${tab}`}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {visibleClients.length === 0 && (
            <p className="text-sm text-neutral-500">No {tab}s saved yet.</p>
          )}
          {visibleClients.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-neutral-500">
                  {c.isCompany ? "Company" : "Individual"}{c.email ? ` · ${c.email}` : ""}{c.vatNumber ? ` · VAT ${c.vatNumber}` : ""}
                </div>
              </div>
              <button onClick={() => removeClient(c.id)} className="text-sm text-red-600">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
