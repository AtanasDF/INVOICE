import { normaliseSupplierName } from "@/lib/supplierMatch";
import type { Client } from "@/lib/storage";

// Two records that are almost certainly the same business: the same name
// once "Ltd", punctuation and case are taken off, or the same email or
// mobile number. Same kind only -- a client and a supplier with one name are
// often two sides of the same trade, and merging them would mix sales with
// purchases.

export type DuplicatePair = { keep: Client; duplicate: Client; why: string };

const digits = (s: string) => s.replace(/\D/g, "").replace(/^44/, "0");

export function duplicatePairs(clients: Client[]): DuplicatePair[] {
  const live = clients.filter((c) => !c.archived);
  const pairs: DuplicatePair[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.kind !== b.kind) continue;
      const sameName = !!normaliseSupplierName(a.name) && normaliseSupplierName(a.name) === normaliseSupplierName(b.name);
      const sameEmail = !!a.email.trim() && a.email.trim().toLowerCase() === b.email.trim().toLowerCase();
      const samePhone = digits(a.phone).length >= 10 && digits(a.phone) === digits(b.phone);
      if (!sameName && !sameEmail && !samePhone) continue;
      const key = [a.id, b.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      // The fuller record is the one worth keeping.
      const score = (c: Client) => [c.email, c.phone, c.address, c.vatNumber, c.contactPerson].filter((v) => v.trim()).length;
      const [keep, duplicate] = score(a) >= score(b) ? [a, b] : [b, a];
      pairs.push({
        keep,
        duplicate,
        why: sameName ? "the same name" : sameEmail ? "the same email address" : "the same phone number",
      });
    }
  }
  return pairs;
}

export const pairKey = (p: DuplicatePair) => [p.keep.id, p.duplicate.id].sort().join("|");

const IGNORED_KEY = "clients-not-duplicates";

export function readIgnoredDuplicates(): string[] {
  try {
    return JSON.parse(localStorage.getItem(IGNORED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function writeIgnoredDuplicates(keys: string[]): void {
  try {
    localStorage.setItem(IGNORED_KEY, JSON.stringify(keys));
  } catch {
    // storage blocked -- the pair is simply offered again next time
  }
}
