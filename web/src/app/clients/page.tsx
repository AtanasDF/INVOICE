"use client";

import { useEffect, useState } from "react";
import { Client, clientsStore, uid } from "@/lib/storage";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState("");
  const [isCompany, setIsCompany] = useState(true);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    setClients(clientsStore.all());
  }, []);

  function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const next = [...clients, { id: uid(), name, isCompany, email, address }];
    setClients(next);
    clientsStore.save(next);
    setName("");
    setEmail("");
    setAddress("");
  }

  function removeClient(id: string) {
    const next = clients.filter((c) => c.id !== id);
    setClients(next);
    clientsStore.save(next);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Clients & companies</h1>
        <p className="mt-1 text-neutral-600">
          Save the companies or people you invoice, so their details are ready next time.
        </p>
      </div>

      <form onSubmit={addClient} className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
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
        <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Save client
        </button>
      </form>

      <div className="space-y-3">
        {clients.length === 0 && (
          <p className="text-sm text-neutral-500">No clients saved yet.</p>
        )}
        {clients.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
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
    </div>
  );
}
