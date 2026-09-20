import { NextResponse } from "next/server";
import { type CompanySearchItem, tidyCompanyName, formatRegisteredAddress } from "@/lib/companyLookup";
import { asCompanyNumber, type CompanyHit, type CompanyReport } from "@/lib/companyReport";
import { buildReport, type ChargeList, type ControlList, type InsolvencyList, type OfficerList, type Profile } from "@/lib/companyReportBuild";
import { addressKey, allowShared } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const HOUR = 60 * 60 * 1000;
const SEARCH_PER_IP = 40;
const SEARCH_GLOBAL = 600;
const REPORT_PER_IP = 20;
const REPORT_GLOBAL = 300;
// A report is up to five calls upstream, so the same company is answered
// from memory for a while. Companies House data changes by the day at most.
const SEARCH_CACHE_MS = 10 * 60 * 1000;
const REPORT_CACHE_MS = 15 * 60 * 1000;

const searchCache = new Map<string, { at: number; items: CompanyHit[] }>();
const reportCache = new Map<string, { at: number; report: CompanyReport }>();

// The sandbox register lives on another host, and the test harness stands
// in for it here; nothing else varies.
const BASE = process.env.COMPANIES_HOUSE_API_BASE ?? "https://api.company-information.service.gov.uk";

type Fetched<T> = { ok: true; body: T } | { ok: false; status: number };

async function ask<T>(path: string, key: string): Promise<Fetched<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 503 };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const body = (await res.json().catch(() => null)) as T | null;
  return body ? { ok: true, body } : { ok: false, status: 502 };
}

const busy = (status: number) => NextResponse.json({ configured: true, busy: true }, { status: status === 429 ? 429 : 503 });

async function search(q: string, req: Request, key: string) {
  const cacheKey = q.toLowerCase();
  const hit = searchCache.get(cacheKey);
  if (hit && Date.now() - hit.at < SEARCH_CACHE_MS) return NextResponse.json({ configured: true, items: hit.items });

  const ip = addressKey(req.headers.get("x-forwarded-for"));
  if (!(await allowShared(`check:ip:${ip}`, SEARCH_PER_IP, HOUR)) || !(await allowShared("check:global", SEARCH_GLOBAL, HOUR))) {
    return NextResponse.json({ configured: true, items: [], busy: true }, { status: 429 });
  }

  const found = await ask<{ items?: CompanySearchItem[] }>(`/search/companies?q=${encodeURIComponent(q)}&items_per_page=10`, key);
  if (!found.ok) return busy(found.status);
  const items: CompanyHit[] = (found.body.items ?? []).flatMap((i) =>
    i.title && i.company_number
      ? [{
          name: tidyCompanyName(i.title),
          number: i.company_number,
          status: i.company_status ?? "",
          incorporated: i.date_of_creation ?? null,
          address: formatRegisteredAddress(i.address, i.address_snippet).replace(/\n/g, ", "),
        }]
      : []
  );
  if (searchCache.size > 500) searchCache.clear();
  searchCache.set(cacheKey, { at: Date.now(), items });
  return NextResponse.json({ configured: true, items });
}

async function report(number: string, req: Request, key: string) {
  const hit = reportCache.get(number);
  if (hit && Date.now() - hit.at < REPORT_CACHE_MS) return NextResponse.json({ configured: true, report: hit.report });

  const ip = addressKey(req.headers.get("x-forwarded-for"));
  if (!(await allowShared(`check-report:ip:${ip}`, REPORT_PER_IP, HOUR)) || !(await allowShared("check-report:global", REPORT_GLOBAL, HOUR))) {
    return NextResponse.json({ configured: true, busy: true }, { status: 429 });
  }

  const profile = await ask<Profile>(`/company/${encodeURIComponent(number)}`, key);
  if (!profile.ok) {
    if (profile.status === 404) return NextResponse.json({ configured: true, found: false }, { status: 404 });
    return busy(profile.status);
  }

  const missing: string[] = [];
  const [officers, control, charges, insolvency] = await Promise.all([
    ask<OfficerList>(`/company/${encodeURIComponent(number)}/officers?items_per_page=50`, key),
    ask<ControlList>(`/company/${encodeURIComponent(number)}/persons-with-significant-control?items_per_page=25`, key),
    profile.body.has_charges ? ask<ChargeList>(`/company/${encodeURIComponent(number)}/charges`, key) : null,
    profile.body.has_insolvency_history ? ask<InsolvencyList>(`/company/${encodeURIComponent(number)}/insolvency`, key) : null,
  ]);
  // A 404 on these means "none filed", which is an answer; anything else
  // means the page must not claim there are none.
  const taken = <T>(r: Fetched<T> | null, label: string): T | undefined => {
    if (!r || r.ok) return r?.body;
    if (r.status !== 404) missing.push(label);
    return undefined;
  };

  const built = buildReport({
    profile: profile.body,
    officers: taken(officers, "officers"),
    control: taken(control, "people with significant control"),
    charges: taken(charges, "charges"),
    insolvency: taken(insolvency, "insolvency history"),
    missing,
  });
  if (reportCache.size > 300) reportCache.clear();
  reportCache.set(number, { at: Date.now(), report: built });
  return NextResponse.json({ configured: true, report: built });
}

// Public, like the Free invoice page: anyone can check a UK company against
// the Companies House register. Off, and saying so, until
// COMPANIES_HOUSE_API_KEY is set.
export async function GET(req: Request) {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return NextResponse.json({ configured: false });

  const params = new URL(req.url).searchParams;
  const number = params.get("number");
  if (number) {
    const clean = asCompanyNumber(number);
    if (!clean) return NextResponse.json({ configured: true, found: false }, { status: 404 });
    return report(clean, req, key);
  }

  const q = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!q) return NextResponse.json({ configured: true });
  if (q.length < 2) return NextResponse.json({ configured: true, items: [] });
  return search(q, req, key);
}
