import type { InvoiceStatus } from "@/lib/invoiceStatus";

const round = (n: number) => Math.round(n * 100) / 100;

// What's still owed: the invoice total less credit notes and payments
// received. A legacy "paid" invoice with no payments recorded owes nothing.
export function invoiceBalance({ total, credited, paid, status }: { total: number; credited: number; paid: number; status: InvoiceStatus }): number {
  if (status === "paid" && paid === 0) return 0;
  return Math.max(0, round(total - credited - paid));
}

// The status an issued invoice should have once payments change: paid when
// nothing is left, part-paid when some money has come in, sent otherwise.
export function statusFromPayments({ total, credited, paid }: { total: number; credited: number; paid: number }): Exclude<InvoiceStatus, "draft"> {
  if (paid > 0 && round(total - credited - paid) <= 0) return "paid";
  return paid > 0 ? "partial" : "sent";
}
