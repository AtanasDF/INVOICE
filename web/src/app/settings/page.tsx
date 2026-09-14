"use client";

import { useEffect, useState } from "react";
import { businessProfileStore } from "@/lib/storage";

export default function SettingsPage() {
  const [businessName, setBusinessName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    businessProfileStore.get().then((p) => {
      setBusinessName(p.businessName);
      setVatNumber(p.vatNumber);
      setAddress(p.address);
      setLoading(false);
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await businessProfileStore.save({ businessName, vatNumber, address, logoUrl: null });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your business</h1>
        <p className="mt-1 text-neutral-600">
          Fill this in once — it fills in automatically on every invoice you create from now on.
        </p>
      </div>

      <form onSubmit={save} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Business name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />
        <input
          className="w-full rounded-lg border px-3 py-2"
          placeholder="VAT number (optional)"
          value={vatNumber}
          onChange={(e) => setVatNumber(e.target.value)}
        />
        <textarea
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Business address (optional)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <p className="text-xs text-neutral-500">
          A logo can go here too once file storage is set up — not yet, so this is text-only for now.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-700">Saved.</p>}
        <button disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
