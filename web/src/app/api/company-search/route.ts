import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CompanyMatch, CompanySearchItem, toCompanyMatch } from "@/lib/companyLookup";
import { addressKey, allow, allowShared } from "@/lib/rateLimit";

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

// Verified tokens are remembered for a few minutes so a burst of typing
// doesn't ask Supabase each time.
const verified = new Map<string, number>();
async function isSignedIn(authorization: string | null): Promise<boolean> {
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return false;
  const seen = verified.get(token);
  if (seen && Date.now() - seen < FIVE_MINUTES) return true;
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await auth.auth.getUser(token).catch(() => ({ data: { user: null } }));
  if (!data.user) return false;
  if (verified.size > 1000) verified.clear();
  verified.set(token, Date.now());
  return true;
}

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
  const signedIn = await isSignedIn(req.headers.get("authorization"));
  if (!(await allowShared(signedIn ? "company:signed-in" : "company:anon", signedIn ? SIGNED_IN_TOTAL : ANON_TOTAL, FIVE_MINUTES))) {
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
