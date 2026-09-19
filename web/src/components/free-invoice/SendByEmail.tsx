"use client";

import InvoiceDocument, { bankRows, formatMoney, longDate } from "@/components/invoice/InvoiceDocument";
import SendInvoicePanel from "@/components/SendInvoicePanel";
import { cisApplies, computeDraftTotals, FreeInvoiceDraft } from "@/lib/freeInvoiceDraft";

export default function SendByEmail({ draft, resetKey }: { draft: FreeInvoiceDraft; resetKey: number }) {
  const t = computeDraftTotals(draft);
  const due = cisApplies(draft) ? t.netPaymentDue : t.total;
  return (
    <SendInvoicePanel
      sheet={<InvoiceDocument draft={draft} />}
      pdfKey={JSON.stringify(draft)}
      signInNext="/free-invoice"
      docType={draft.docType}
      resetKey={resetKey}
      missingName="Add your business name first, so the customer knows who it's from."
      fields={{
        issuerName: draft.issuer.name ?? "",
        issuerEmail: draft.issuer.email ?? "",
        customerName: draft.customer.name ?? "",
        customerEmail: draft.customer.email ?? "",
        number: draft.number,
        total: formatMoney(draft.currencySymbol, due),
        dueDate: draft.dueDate ? longDate(draft.dueDate) : "",
        bank: bankRows(draft),
      }}
    />
  );
}
