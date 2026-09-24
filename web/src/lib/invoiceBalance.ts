import type { InvoiceStatus } from "@/lib/invoiceStatus";

// Each figure is rounded to the penny before subtracting, so a half-penny
// total (5% VAT) can't leave a phantom 1p owing after the balance is paid.
const pence = (n: number) => Math.round(n * 100);

// What's still owed: the invoice total less credit notes and payments
// received. A legacy "paid" invoice with no payments recorded owes nothing.
export function invoiceBalance({ total, credited, paid, status }: { total: number; credited: number; paid: number; status: InvoiceStatus }): number {
  if (status === "paid" && paid === 0) return 0;
  return Math.max(0, pence(total) - pence(paid)) / 100;
}

// The status an issued invoice should have given its credit notes and
// payments: paid once nothing is left (credited in full counts), part-paid
// when some money has come in, sent otherwise.
export function statusFromPayments({ total, credited, paid }: { total: number; credited: number; paid: number }): Exclude<InvoiceStatus, "draft"> {
  if ((paid > 0 || credited > 0) && pence(total) - pence(credited) - pence(paid) <= 0) return "paid";
  return paid > 0 ? "partial" : "sent";
}

// The status to store, or null to leave it: an invoice marked paid or
// part-paid by hand before payments were recorded keeps its status unless
// it has since been credited in full.
// fromPayments: the status came from payments that have just been removed,
// so it follows the figures even with none left.
export function syncedStatus(
  current: InvoiceStatus,
  figures: { total: number; credited: number; paid: number },
  paymentCount: number,
  fromPayments = false
): Exclude<InvoiceStatus, "draft"> | null {
  if (current === "draft") return null;
  const next = statusFromPayments(figures);
  if (!fromPayments && paymentCount === 0 && next !== "paid" && current !== "sent") return null;
  if (!fromPayments && paymentCount === 0 && figures.credited === 0) return null;
  return next === current ? null : next;
}

// The VAT setting an invoice's totals use: the one it was issued under, or
// the account's current one for a draft (and for an issued invoice from
// before the setting was saved, which has always shown that way).
export function invoiceVat(invoice: { status: InvoiceStatus; vatRegistered: boolean | null }, accountVat: boolean): boolean {
  return invoice.status === "draft" || invoice.vatRegistered == null ? accountVat : invoice.vatRegistered;
}
