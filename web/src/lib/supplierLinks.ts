import type { Client } from "@/lib/storage";
import { normaliseSupplierName } from "@/lib/supplierMatch";

const STOP_WORDS = new Set(["the", "and", "of", "co"]);

// Stricter than matchSupplier (scan time, one document with the form in
// view): linking in bulk is one tap over many rows, so substring hits like
// "Espresso Bar" -> Esso or "Costain" -> Costa are not offered. The printed
// name must equal the supplier's, or carry every significant word of it as
// a whole word. A name with no significant word ("BP", "B&Q") must be exact.
export function bulkMatchSupplier(vendor: string, suppliers: Client[]): Client | null {
  const v = normaliseSupplierName(vendor);
  if (!v) return null;
  const vendorWords = new Set(v.split(" "));
  const named = suppliers.map((s) => ({ s, n: normaliseSupplierName(s.name) })).filter((c) => c.n);
  const exact = named.find((c) => c.n === v);
  if (exact) return exact.s;
  const hits = named.flatMap((c) => {
    const significant = c.n.split(" ").filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
    return significant.length && significant.every((t) => vendorWords.has(t)) ? [{ ...c, size: significant.length }] : [];
  });
  const most = Math.max(0, ...hits.map((h) => h.size));
  const best = hits.filter((h) => h.size === most);
  // Two different names fitting equally well ("Travis", "Perkins") is a guess.
  return best.length && best.every((h) => h.n === best[0].n) ? best[0].s : null;
}

const SKIP_KEY = "receipts-link-skip";

export function readLinkSkips(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(SKIP_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function writeLinkSkips(ids: Set<string>) {
  try {
    localStorage.setItem(SKIP_KEY, JSON.stringify([...ids]));
  } catch {
    // storage blocked -- the offer just comes back next visit
  }
}
