// Draft -> Sent -> Partial -> Paid. Overdue is never stored -- it's
// always derived from status + due_date, so it can't drift out of sync
// with "today" the way a stored flag would.
import { todayISO } from "@/lib/today";

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid";

export const INVOICE_STATUS_KINDS: InvoiceStatus[] = ["draft", "sent", "partial", "paid"];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partially paid",
  paid: "Paid",
};

// Only a sent-or-partial invoice past its due date counts as overdue --
// a draft was never issued so nothing's actually late, and a paid
// invoice is done regardless of when it was due.
export function isOverdue(status: InvoiceStatus, dueDate: string | null, today: string = todayISO()): boolean {
  return (status === "sent" || status === "partial") && !!dueDate && dueDate < today;
}

export function invoiceStatusBadgeClass(status: InvoiceStatus, overdue: boolean): string {
  if (overdue) return "bg-red-100 text-red-800";
  switch (status) {
    case "draft":
      return "bg-neutral-100 text-neutral-500";
    case "sent":
      return "bg-blue-100 text-blue-800";
    case "partial":
      return "bg-amber-100 text-amber-800";
    case "paid":
      return "bg-green-100 text-green-800";
  }
}

export function invoiceStatusLabel(status: InvoiceStatus, overdue: boolean): string {
  if (overdue) return "Overdue";
  return INVOICE_STATUS_LABELS[status];
}

// A draft's number field only holds a placeholder (see
// draftPlaceholderNumber in lib/invoiceNumber.ts) until it's marked
// sent -- never show that placeholder anywhere a real invoice number
// would normally appear.
export function displayInvoiceNumber(inv: { status: InvoiceStatus; number: string }): string {
  return inv.status === "draft" ? "New invoice" : `#${inv.number}`;
}
