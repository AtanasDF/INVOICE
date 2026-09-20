"use client";

import type { Client, Receipt } from "@/lib/storage";
import { money } from "@/lib/money";
import { normaliseSupplierName } from "@/lib/supplierMatch";

function invoiceLabel(inv: Receipt, clients: Client[]): string {
  const supplier = clients.find((c) => c.id === inv.clientId)?.name || inv.vendor || "Unknown supplier";
  return `${inv.invoiceNumber || "No number"} · ${supplier} · ${money((inv.amount + inv.vatAmount))} · ${inv.date}`;
}

export function sortInvoicesForCredit(invoices: Receipt[], clientId: string, vendor: string): Receipt[] {
  const v = normaliseSupplierName(vendor);
  const same = (inv: Receipt) => (clientId && inv.clientId === clientId) || (!!v && normaliseSupplierName(inv.vendor) === v);
  return [...invoices.filter(same), ...invoices.filter((inv) => !same(inv))];
}

export default function CreditOfSelect({ invoices, clients, clientId, vendor, value, onChange }: {
  invoices: Receipt[];
  clients: Client[];
  clientId: string;
  vendor: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const ordered = sortInvoicesForCredit(invoices, clientId, vendor);
  return (
    <div>
      <label className="text-xs text-neutral-500">Credit note for</label>
      <select className="w-full rounded-lg border px-3 py-2" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No linked invoice</option>
        {ordered.map((inv) => (
          <option key={inv.id} value={inv.id}>{invoiceLabel(inv, clients)}</option>
        ))}
      </select>
      {!value && (
        <p className="mt-1 text-xs text-neutral-500">
          Not linked to a scanned invoice — it still counts against your spend as a refund.
        </p>
      )}
    </div>
  );
}
