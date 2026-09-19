import type { Client } from "@/lib/storage";
import { normaliseSupplierName } from "@/lib/supplierMatch";

const STOP_WORDS = new Set(["the", "and", "of", "co"]);

function significantWords(normalised: string): string[] {
  return normalised.split(" ").filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

// Whether a printed name plainly is this supplier: the same name, or every
// significant word of it as a whole word ("Screwfix Direct" is Screwfix;
// "Espresso Bar" is not Esso). A name with no significant word ("BP",
// "B&Q") must be exact.
export function plainlySupplier(vendor: string, supplierName: string): boolean {
  const v = normaliseSupplierName(vendor);
  const n = normaliseSupplierName(supplierName);
  if (!v || !n) return false;
  if (v === n) return true;
  const words = new Set(v.split(" "));
  const significant = significantWords(n);
  return significant.length > 0 && significant.every((t) => words.has(t));
}

// Stricter than matchSupplier (scan time, one document with the form in
// view): linking in bulk is one tap over many rows, so substring hits like
// "Espresso Bar" -> Esso or "Costain" -> Costa are not offered.
export function bulkMatchSupplier(vendor: string, suppliers: Client[]): Client | null {
  const v = normaliseSupplierName(vendor);
  if (!v) return null;
  const named = suppliers.map((s) => ({ s, n: normaliseSupplierName(s.name) })).filter((c) => c.n);
  const exact = named.find((c) => c.n === v);
  if (exact) return exact.s;
  const hits = named.filter((c) => plainlySupplier(vendor, c.s.name)).map((c) => ({ ...c, size: significantWords(c.n).length }));
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
