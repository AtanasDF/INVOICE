"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClientKind, clientsStore } from "@/lib/storage";

export default function NewClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kind: ClientKind = searchParams.get("kind") === "supplier" ? "supplier" : "client";

  const [isCompany, setIsCompany] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await clientsStore.add({
        name,
        isCompany,
        email,
        address,
        kind,
        vatNumber,
        paymentTerms,
        defaultCurrency,
        contactPerson,
      });
      router.push(`/clients?tab=${kind}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save client.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New {kind === "client" ? "client" : "supplier"}</h1>
        <p className="mt-1 text-neutral-600">
          Clients are who you invoice. Suppliers are who invoices or receipts come from.
        </p>
      </div>

      <form onSubmit={addClient} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
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
        <details className="rounded-lg border p-3" open>
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
          {saving ? "Saving…" : `Save ${kind}`}
        </button>
      </form>
    </div>
  );
}
