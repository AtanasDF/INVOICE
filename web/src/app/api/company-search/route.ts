import { NextResponse } from "next/server";
import { CompanyMatch, CompanyProfileItem, CompanySearchItem, profileToCompanyMatch, tidyCompanyNumber, toCompanyMatch } from "@/lib/companyLookup";
import { addressKey, allow, allowShared } from "@/lib/rateLimit";
import { isSignedIn } from "@/lib/serverAuth";

export const runtime = "nodejs";

const FIVE_MINUTES = 5 * 60 * 1000;
const PER_ADDRESS = 60;
// Companies House allows 600 requests per five minutes per key. The shared
// counter uses fixed windows, so a burst either side of a boundary can
// double up: the two buckets together stay at half the key's limit, and
// signed-in users get their own so the free page can't use up theirs.
const ANON_TOTAL = 120;
const SIGNED_IN_TOTAL = 180;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; items: CompanyMatch[] }>();

// The sandbox register lives on another host, and the harness stands in for
// it; same override as /api/company-check so both read the same register.
const BASE = process.env.COMPANIES_HOUSE_API_BASE ?? "https://api.company-information.service.gov.uk";

async function ask(path: string, key: string): Promise<Response | null> {
  try {
    return await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

// Public, like the Free invoice page that uses it: a name typed into a
// business or customer field, matched against the Companies House register.
// `scope=all` keeps dissolved companies in, for checking a name that is
// already on a document; the plain search stays active-only so a pick can
// never be a dead company. `number` reads one company's profile, which is
// the only way to see a status the search index leaves out. Off until
// COMPANIES_HOUSE_API_KEY is set.
export async function GET(req: Request) {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return NextResponse.json({ configured: false, items: [] });

  const params = new URL(req.url).searchParams;
  const number = params.get("number") ? tidyCompanyNumber(params.get("number")!) : null;
  const all = params.get("scope") === "all";
  const q = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!number && q.length < 2) return NextResponse.json({ configured: true, items: [] });

  // A company that doesn't exist is cached as an empty answer too, so a
  // wrong number typed once isn't asked again on every keystroke.
  const cacheKey = number ? `n:${number}` : `${all ? "a" : "s"}:${q.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json(number ? { configured: true, company: hit.items[0] ?? null } : { configured: true, items: hit.items });
  }

  if (!allow(`company:ip:${addressKey(req.headers.get("x-forwarded-for"))}`, PER_ADDRESS, FIVE_MINUTES)) {
    return NextResponse.json({ configured: true, items: [], busy: true }, { status: 429 });
  }
  const signedIn = await isSignedIn(req.headers.get("authorization"));
  if (!(await allowShared(signedIn ? "company:signed-in" : "company:anon", signedIn ? SIGNED_IN_TOTAL : ANON_TOTAL, FIVE_MINUTES))) {
    return NextResponse.json({ configured: true, items: [], busy: true }, { status: 429 });
  }

  const path = number
    ? `/company/${encodeURIComponent(number)}`
    : `/search/companies?q=${encodeURIComponent(q)}&items_per_page=6${all ? "" : "&restrictions=active-companies"}`;
  const res = await ask(path, key);
  if (!res) return NextResponse.json({ configured: true, items: [], busy: true }, { status: 503 });
  if (number && res.status === 404) {
    cache.set(cacheKey, { at: Date.now(), items: [] });
    return NextResponse.json({ configured: true, company: null });
  }
  if (!res.ok) {
    console.error("company-search: Companies House answered", res.status);
    return NextResponse.json({ configured: true, items: [], busy: true }, { status: res.status === 429 ? 429 : 503 });
  }

  const body = await res.json().catch(() => ({}));
  const items = number
    ? [profileToCompanyMatch(body as CompanyProfileItem)].filter((m): m is CompanyMatch => m !== null)
    : ((body as { items?: CompanySearchItem[] }).items ?? []).map(toCompanyMatch).filter((m): m is CompanyMatch => m !== null);

  if (cache.size > 500) cache.clear();
  cache.set(cacheKey, { at: Date.now(), items });
  return NextResponse.json(number ? { configured: true, company: items[0] ?? null } : { configured: true, items });
}
