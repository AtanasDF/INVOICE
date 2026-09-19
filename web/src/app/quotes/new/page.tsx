"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QuoteForm, { QuoteFormValue, defaultValidUntil } from "@/components/quote/QuoteForm";
import { Client, InvoiceItem, businessProfileStore, clientsStore, nextQuoteNumber, quotesStore } from "@/lib/storage";
import { clearFreeInvoiceDraft, readFreeInvoiceDraft, todayIso } from "@/lib/freeInvoiceDraft";
import { looksLikeCompany } from "@/lib/reminderTemplates";
import { errorText } from "@/lib/errorText";

export default function NewQuotePage() {
  const router = useRouter();
  const [data, setData] = useState<{ clients: Client[]; vatRegistered: boolean; initial: QuoteFormValue } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A quote brought over from the Free page: its customer, when they
  // aren't one of the account's clients yet.
  const [imported, setImported] = useState(false);
  const [newCustomer, setNewCustomer] = useState<{ name: string; address: string; email: string } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    Promise.all([clientsStore.all(), quotesStore.all(), businessProfileStore.get()])
      .then(([clients, quotes, biz]) => {
        const date = todayIso();
        const draft = new URLSearchParams(window.location.search).get("import") === "1" ? readFreeInvoiceDraft() : null;
        if (draft?.docType === "quote") {
          const name = draft.customer.name?.trim() ?? "";
          const match = clients.find((c) => c.kind === "client" && !c.archived && c.name.trim().toLowerCase() === name.toLowerCase());
          const items: InvoiceItem[] = draft.lines
            .filter((l) => l.description.trim() || l.unitPrice)
            .map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate }));
          setImported(true);
          if (!match && name) setNewCustomer({ name, address: draft.customer.address ?? "", email: draft.customer.email ?? "" });
          setData({
            clients,
            vatRegistered: biz.vatRegistered,
            initial: {
              clientId: match?.id ?? "",
              number: draft.number.trim() || nextQuoteNumber(quotes),
              date: draft.date || date,
              validUntil: draft.dueDate || defaultValidUntil(draft.date || date),
              items,
              notes: draft.notes,
              deposit: null,
            },
          });
          return;
        }
        setData({
          clients,
          vatRegistered: biz.vatRegistered,
          initial: { clientId: "", number: nextQuoteNumber(quotes), date, validUntil: defaultValidUntil(date), items: [], notes: "", deposit: null },
        });
      })
      .catch((err) => setError(errorText(err, "Could not load your clients.")));
  }, []);

  async function addCustomer() {
    if (!data || !newCustomer) return;
    setAdding(true);
    setError(null);
    try {
      const c = await clientsStore.add({
        name: newCustomer.name,
        isCompany: looksLikeCompany(newCustomer.name),
        email: newCustomer.email,
        address: newCustomer.address,
        kind: "client",
        vatNumber: "",
        paymentTerms: "",
        defaultCurrency: "",
        contactPerson: "",
        phone: "",
        remindersEnabled: true,
      });
      setData({ ...data, clients: [...data.clients, c], initial: { ...data.initial, clientId: c.id } });
      setNewCustomer(null);
      setFormKey((k) => k + 1);
    } catch (err) {
      setError(errorText(err, "Could not add the customer."));
    } finally {
      setAdding(false);
    }
  }

  async function save(v: QuoteFormValue) {
    const quote = await quotesStore.add({ ...v, validUntil: v.validUntil || null });
    if (imported) clearFreeInvoiceDraft();
    router.push(`/quotes/${quote.id}`);
  }

  const hasClients = data?.clients.some((c) => c.kind === "client" && !c.archived);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/quotes" className="text-sm text-neutral-500">← Quotes</Link>
        <h1 className="mt-1 text-2xl font-bold">New quote</h1>
        <p className="mt-1 text-neutral-600">What the job will cost. It stays a draft until you send it.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {imported && (
        <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">Brought over from the Free page: check the details, then save it.</p>
      )}
      {newCustomer && (
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <p className="text-sm text-neutral-700">
            <strong>{newCustomer.name}</strong> isn&apos;t one of your clients yet.
          </p>
          <button onClick={addCustomer} disabled={adding} className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {adding ? "Adding…" : `Add ${newCustomer.name} as a client`}
          </button>
        </div>
      )}
      {!data ? (
        !error && <p className="text-sm text-neutral-500">Loading…</p>
      ) : !hasClients && !newCustomer ? (
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <p className="text-sm text-neutral-700">A quote is for a client. Add the client first, then come back here.</p>
          <Link href="/clients/new" className="mt-3 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            Add a client
          </Link>
        </div>
      ) : (
        <QuoteForm key={formKey} initial={data.initial} clients={data.clients} vatRegistered={data.vatRegistered} saveLabel="Save quote" onSave={save} onCancel={() => router.push("/quotes")} />
      )}
    </div>
  );
}
