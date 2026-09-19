import type { Receipt } from "@/lib/storage";
import { normaliseSupplierName } from "@/lib/supplierMatch";

export type DuplicateCandidate = {
  clientId: string;
  vendor: string;
  invoiceNumber: string | null;
  date: string;
  // GBP, signed as it would be stored (negative for a credit note).
  gross: number;
  isCreditNote: boolean;
};

export function sameNumber(a: string | null, b: string | null): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  return !!a && !!b && norm(a) !== "" && norm(a) === norm(b);
}

export function sameSupplier(a: { clientId: string; vendor: string }, b: { clientId: string; vendor: string }): boolean {
  if (a.clientId && b.clientId) return a.clientId === b.clientId;
  const v = normaliseSupplierName(a.vendor);
  return v !== "" && v === normaliseSupplierName(b.vendor);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

export function findDuplicate(candidate: DuplicateCandidate, receipts: Receipt[]): Receipt | null {
  const pool = receipts.filter(
    (r) => (r.documentType === "credit_note") === candidate.isCreditNote && sameSupplier(r, candidate)
  );
  return (
    pool.find((r) => sameNumber(r.invoiceNumber, candidate.invoiceNumber)) ??
    pool.find((r) => Math.abs(r.amount + r.vatAmount - candidate.gross) < 0.01 && daysBetween(r.date, candidate.date) <= 3) ??
    null
  );
}
