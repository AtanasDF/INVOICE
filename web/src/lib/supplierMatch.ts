import type { Client } from "@/lib/storage";

const LEGAL_SUFFIXES = new Set(["ltd", "limited", "plc", "llp", "inc"]);
const STOP_WORDS = new Set(["the", "and", "of", "co"]);

export function normaliseSupplierName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t && !LEGAL_SUFFIXES.has(t))
    .join(" ");
}

function significantTokens(normalised: string): string[] {
  return normalised.split(" ").filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

export function matchSupplier(vendor: string, suppliers: Client[]): Client | null {
  const v = normaliseSupplierName(vendor);
  if (!v) return null;
  const candidates = suppliers.map((s) => ({ s, n: normaliseSupplierName(s.name) })).filter((c) => c.n);

  const exact = candidates.find((c) => c.n === v);
  if (exact) return exact.s;

  const contains = candidates.find(
    (c) => (v.length >= 4 && c.n.includes(v)) || (c.n.length >= 4 && v.includes(c.n))
  );
  if (contains) return contains.s;

  const vendorTokens = new Set(significantTokens(v));
  let best: Client | null = null;
  let bestOverlap = 1;
  for (const c of candidates) {
    const overlap = significantTokens(c.n).filter((t) => vendorTokens.has(t)).length;
    if (overlap > bestOverlap) {
      best = c.s;
      bestOverlap = overlap;
    }
  }
  return best;
}
