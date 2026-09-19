import { NextResponse } from "next/server";
import { CompanyMatch, CompanySearchItem, toCompanyMatch } from "@/lib/companyLookup";
import { addressKey, allow, allowShared } from "@/lib/rateLimit";

export const runtime = "nodejs";

const FIVE_MINUTES = 5 * 60 * 1000;
const PER_ADDRESS = 60;
// Companies House allows 600 requests per five minutes per key; stay under
// it so the free page can't lock signed-in users out.
const GLOBAL = 450;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; items: CompanyMatch[] }>();

// Public, like the Free invoice page that uses it: a name typed into a
// business or customer field, matched against the Companies House register
// (active companies only). Off until COMPANIES_HOUSE_API_KEY is set.
export async function GET(req: Request) {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return NextResponse.json({ configured: false, items: [] });

  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ configured: true, items: [] });

  const cacheKey = q.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json({ configured: true, items: hit.items });

  if (!allow(`company:ip:${addressKey(req.headers.get("x-forwarded-for"))}`, PER_ADDRESS, FIVE_MINUTES)) {
    return NextResponse.json({ configured: true, items: [], busy: true }, { status: 429 });
  }
  if (!(await allowShared("company:global", GLOBAL, FIVE_MINUTES))) {
    return NextResponse.json({ configured: true, items: [], busy: true }, { status: 429 });
  }

  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=6&restrictions=active-companies`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ configured: true, items: [], busy: true }, { status: 503 });
  }
  if (!res.ok) {
    console.error("company-search: Companies House answered", res.status);
    return NextResponse.json({ configured: true, items: [], busy: true }, { status: res.status === 429 ? 429 : 503 });
  }
  const body = (await res.json().catch(() => ({}))) as { items?: CompanySearchItem[] };
  const items = (body.items ?? []).map(toCompanyMatch).filter((m): m is CompanyMatch => m !== null);

  if (cache.size > 500) cache.clear();
  cache.set(cacheKey, { at: Date.now(), items });
  return NextResponse.json({ configured: true, items });
}
