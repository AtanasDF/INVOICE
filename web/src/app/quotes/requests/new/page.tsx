"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import RequestForm from "@/components/quoteRequest/RequestForm";
import { Client, clientsStore } from "@/lib/storage";
import { RequestInput, quoteRequestsStore, requestSuppliersStore } from "@/lib/quoteRequests";
import { errorText } from "@/lib/errorText";

const EMPTY: RequestInput = { title: "", items: [], notes: "", neededBy: null, siteAddress: "" };

export default function NewQuoteRequestPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clientsStore
      .all()
      .then((all) => setSuppliers(all.filter((c) => c.kind === "supplier" && !c.archived)))
      .catch((err) => setError(errorText(err, "Could not load your suppliers.")));
  }, []);

  // The suppliers are added after the request exists; if that fails, the
  // request page says so and lets them be added there.
  async function save(value: RequestInput, supplierIds: string[]) {
    const request = await quoteRequestsStore.add(value);
    const added = await requestSuppliersStore.add(request.id, supplierIds).then(() => true, () => false);
    router.push(`/quotes/requests/${request.id}${added ? "" : "?suppliers=failed"}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/quotes/requests" className="text-sm text-neutral-500">← Quotes from suppliers</Link>
        <h1 className="mt-1 text-2xl font-bold">New quote request</h1>
        <p className="mt-1 text-neutral-600">List what you need; each supplier gets their own email with a link to price it.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!suppliers ? (
        !error && <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <RequestForm initial={EMPTY} suppliers={suppliers} saveLabel="Save request" onSave={save} onCancel={() => router.push("/quotes/requests")} />
      )}
    </div>
  );
}
