import type { CompanyMatch } from "./companyLookup";
import { normaliseSupplierName } from "./supplierMatch";
import { supabase } from "./supabaseClient";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function searchRegister(q: string, opts: { all?: boolean; signal?: AbortSignal } = {}): Promise<CompanyMatch[]> {
  const res = await fetch(`/api/company-search?q=${encodeURIComponent(q)}${opts.all ? "&scope=all" : ""}`, {
    signal: opts.signal,
    headers: await authHeaders(),
  });
  const body = (await res.json().catch(() => ({}))) as { items?: CompanyMatch[] };
  return body.items ?? [];
}

export async function companyByNumber(number: string, signal?: AbortSignal): Promise<CompanyMatch | null> {
  const res = await fetch(`/api/company-search?number=${encodeURIComponent(number)}`, { signal, headers: await authHeaders() });
  const body = (await res.json().catch(() => ({}))) as { company?: CompanyMatch | null };
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
