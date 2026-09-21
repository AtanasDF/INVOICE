import type { CompanyMatch } from "./companyLookup";
import { normaliseSupplierName } from "./supplierMatch";
import { supabase } from "./supabaseClient";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

// "Couldn't ask" and "asked, and there is no such company" are different
// answers, and they used to arrive identically: the route replies 429 or
// 503 with `{ items: [], busy: true }` when Companies House times out or
// the per-IP cap trips, and an empty list is exactly what a real search
// with no results returns. So a five-second timeout printed "Companies
// House has no company under this name" under a live, trading customer,
// and a dissolved company came back looking unchecked rather than flagged.
//
// Throwing is what the callers already expect: both register dropdowns
// catch and show nothing, and useRegisterCheck catches and settles to
// NOTHING -- so an outage makes the app quiet instead of wrong.
class RegisterUnavailable extends Error {
  constructor() {
    super("Couldn't reach the Companies House register.");
    this.name = "RegisterUnavailable";
  }
}

export async function searchRegister(q: string, opts: { all?: boolean; signal?: AbortSignal } = {}): Promise<CompanyMatch[]> {
  const res = await fetch(`/api/company-search?q=${encodeURIComponent(q)}${opts.all ? "&scope=all" : ""}`, {
    signal: opts.signal,
    headers: await authHeaders(),
  });
  const body = (await res.json().catch(() => ({}))) as { items?: CompanyMatch[]; busy?: boolean; configured?: boolean };
  // Not configured is a real answer -- there is no key, and the app says so
  // elsewhere -- so only a failed call or an explicit `busy` throws.
  if (!res.ok || body.busy) throw new RegisterUnavailable();
  return body.items ?? [];
}

export async function companyByNumber(number: string, signal?: AbortSignal): Promise<CompanyMatch | null> {
  const res = await fetch(`/api/company-search?number=${encodeURIComponent(number)}`, { signal, headers: await authHeaders() });
  const body = (await res.json().catch(() => ({}))) as { company?: CompanyMatch | null; busy?: boolean };
  // A 404 for a number that isn't on the register is an answer, not a
  // failure: the route turns it into `{ company: null }` with 200.
  if (!res.ok || body.busy) throw new RegisterUnavailable();
  return body.company ?? null;
}

// Only a name that is the registered name, give or take its Ltd and its
// punctuation: a looser match would tell him a different company's status.
export function sameCompanyName(name: string, company: CompanyMatch): boolean {
  const a = normaliseSupplierName(name);
  return !!a && a === normaliseSupplierName(company.name);
}

export function bestRegisterMatch(name: string, items: CompanyMatch[]): CompanyMatch | null {
  return items.find((c) => sameCompanyName(name, c)) ?? null;
}

// The register facts behind a saved contact, kept on this device only:
// `clients` has no column for a company number, and the number is what
// makes a later check exact instead of a name search. A phone that has
// never seen the contact simply falls back to the name.
export type RegisterFacts = { number: string; name: string; address: string; status: string };

const KEY = "company-register";

function stored(): Record<string, RegisterFacts> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, RegisterFacts>) : {};
  } catch {
    return {};
  }
}

export function rememberCompany(clientId: string, c: CompanyMatch) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...stored(), [clientId]: { number: c.number, name: c.name, address: c.address, status: c.status } }));
  } catch {}
}

export function recallCompany(clientId: string): RegisterFacts | null {
  return clientId ? stored()[clientId] ?? null : null;
}
