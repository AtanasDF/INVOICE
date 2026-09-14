"use client";

import { useEffect, useState } from "react";
import { Client, clientsStore } from "@/lib/storage";
import { downloadCsv } from "@/lib/exportCsv";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [isCompany, setIsCompany] = useState(true);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    clientsStore.all().then((c) => {
      setClients(c);
      setLoading(false);
    });
  }, []);

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const created = await clientsStore.add({ name, isCompany, email, address });
      setClients((prev) => [...prev, created]);
      setName("");
      setEmail("");
      setAddress("");
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
      `clients-${new Date().toISOString().slice(0, 10)}.csv`,
      clients.map((c) => ({
        name: c.name,
        type: c.isCompany ? "Company" : "Individual",
        email: c.email,
        address: c.address,
      }))
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients & companies</h1>
          <p className="mt-1 text-neutral-600">
            Save the companies or people you invoice, so their details are ready next time.
          </p>
        </div>
        {clients.length > 0 && (
          <button onClick={exportClients} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
            Export CSV
          </button>
        )}
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save client"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {clients.length === 0 && (
            <p className="text-sm text-neutral-500">No clients saved yet.</p>
          )}
          {clients.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border bg-white p-4 text-neutral-900 shadow-sm">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-neutral-500">
                  {c.isCompany ? "Company" : "Individual"}{c.email ? ` · ${c.email}` : ""}
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
