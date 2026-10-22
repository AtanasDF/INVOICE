"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { businessProfileStore, clientsStore, type BusinessProfile, type Client } from "@/lib/storage";
import type { InvoiceTemplate } from "@/lib/invoiceTemplate";
import { applySetup, setupCustomer, setupOffers, type SetupField } from "@/lib/setupFromInvoice";
import { downscaleImageDataUrl } from "@/lib/imageDownscale";
import { loadFailed, saveFailed } from "@/lib/errorText";

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

// The fastest way to a ready account: one invoice they have already sent.
export default function SetupFromInvoice({ contacts, onSetUp }: { contacts: Client[]; onSetUp: (profile: BusinessProfile, added: Client | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [state, setState] = useState<"idle" | "reading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<{ t: InvoiceTemplate; profile: BusinessProfile } | null>(null);
  const [ticked, setTicked] = useState<SetupField[]>([]);
  const [addCustomer, setAddCustomer] = useState(true);
  const [done, setDone] = useState<string | null>(null);

  async function read(file: File) {
    if (busy.current) return;
    busy.current = true;
    setState("reading");
    setError(null);
    setDone(null);
    try {
      const raw = await readFile(file);
      const image = file.type === "application/pdf" ? raw : await downscaleImageDataUrl(raw, 2000, 0.85);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/invoice-template", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ images: [image] }),
      });
      const body = (await res.json().catch(() => ({}))) as { template?: InvoiceTemplate; error?: string };
      if (!res.ok || !body.template) throw new Error(body.error || "That invoice couldn't be read.");
      const profile = await businessProfileStore.get();
      const offers = setupOffers(body.template, profile);
      if (!offers.length && !setupCustomer(body.template, contacts.map((c) => c.name))) {
        setError("Nothing new could be read off that one. Try a clearer photo, or a PDF of the invoice.");
        return;
      }
      setReading({ t: body.template, profile });
      setTicked(offers.filter((o) => o.fillsEmpty).map((o) => o.field));
      setAddCustomer(true);
    } catch (err) {
      setError(loadFailed(err, "that invoice"));
    } finally {
      busy.current = false;
      setState("idle");
      if (input.current) input.current.value = "";
    }
  }

  async function save() {
    if (!reading || busy.current) return;
    busy.current = true;
    setState("saving");
    setError(null);
    try {
      const { plan: _plan, ...savable } = reading.profile;
      void _plan;
      const next = applySetup(savable, reading.t, ticked);
      const saved = await businessProfileStore.save(next);
      if (!saved) throw new Error("Your details couldn't all be saved. Check them in Settings.");
      const customer = addCustomer ? setupCustomer(reading.t, contacts.map((c) => c.name)) : null;
      const added = customer
        ? await clientsStore.add({
            name: customer.name,
            address: customer.address,
            email: customer.email,
            isCompany: false,
            kind: "client",
            vatNumber: "",
            paymentTerms: "",
            defaultCurrency: "GBP",
            contactPerson: "",
            phone: "",
            companyNumber: "",
            endUserDeclared: false,
            remindersEnabled: true,
          })
        : null;
      const count = ticked.length + (added ? 1 : 0);
      setDone(count ? `Done: ${count} ${count === 1 ? "thing" : "things"} set up from that invoice. Your next invoice is ready to go.` : "Nothing was changed.");
      setReading(null);
      onSetUp({ ...next, plan: reading.profile.plan }, added);
    } catch (err) {
      setError(saveFailed(err, "Your details couldn't be saved."));
    } finally {
      busy.current = false;
      setState("idle");
    }
  }

  const offers = reading ? setupOffers(reading.t, reading.profile) : [];
  const customer = reading ? setupCustomer(reading.t, contacts.map((c) => c.name)) : null;

  return (
    <div className="space-y-3 rounded-xl bg-neutral-50 p-4">
      {!reading && (
        <>
          <p className="text-sm font-medium">Set up in one go from an invoice you&apos;ve already sent</p>
          <p className="text-sm text-neutral-600">A photo or PDF of your last invoice fills in your details and carries on your numbering. You check it before anything is saved.</p>
          <label aria-disabled={state !== "idle"} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition active:scale-95 motion-reduce:transition-none">
            {state === "reading" ? "Reading it…" : "Choose your last invoice"}
            <input
              ref={input}
              type="file"
              accept="image/*,application/pdf"
              disabled={state !== "idle"}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void read(f);
              }}
            />
          </label>
        </>
      )}

      {reading && (
        <div className="space-y-3">
          <p className="text-sm font-medium">This is what it read. Untick anything that isn&apos;t right.</p>
          <ul className="space-y-2">
            {offers.map((o) => (
              <li key={o.field}>
                <label className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={ticked.includes(o.field)}
                    onChange={(e) => setTicked((t) => (e.target.checked ? [...t, o.field] : t.filter((f) => f !== o.field)))}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs text-neutral-500">
                      {o.label}
                      {!o.fillsEmpty && " (replaces what you have)"}
                    </span>
                    <span className="block whitespace-pre-line text-sm wrap-anywhere">{o.value}</span>
                  </span>
                </label>
              </li>
            ))}
            {customer && (
              <li>
                <label className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={addCustomer} onChange={(e) => setAddCustomer(e.target.checked)} />
                  <span className="min-w-0">
                    <span className="block text-xs text-neutral-500">Add as a customer</span>
                    <span className="block text-sm wrap-anywhere">{customer.name}</span>
                  </span>
                </label>
              </li>
            )}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save()} disabled={state !== "idle"} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition active:scale-95 motion-reduce:transition-none">
              {state === "saving" ? "Saving…" : "Use these"}
            </button>
            <button type="button" onClick={() => setReading(null)} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
              Not now
            </button>
          </div>
        </div>
      )}

      {/* Always there, so the words are a change to a live region a screen
          reader is already watching: one that arrives with its text is often
          not read. */}
      <p role="status" className="text-sm text-neutral-800 empty:hidden">{done ?? ""}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
