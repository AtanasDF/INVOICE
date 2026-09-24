import { NextResponse } from "next/server";
import { checkVatNumberFormat } from "@/lib/vatNumber";
import { addressKey, allowShared } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 20;

// HMRC's "Check a UK VAT number" API is the only place that knows whether a
// VAT number is real, whose it is, and whether it is still live. VIES cannot
// answer for Britain any more: GB numbers left it after Brexit and only
// Northern Ireland's XI numbers are still in it.
//
// It is application-restricted, so it needs credentials from HMRC's
// Developer Hub. Without them this route says so and the box falls back to
// the check digits alone (src/lib/vatNumber.ts), which catch a typo but
// cannot tell you whose number it is. Same shape as the Companies House and
// Ideal Postcodes keys: the feature appears when the key does.
const BASE = process.env.HMRC_API_BASE ?? "https://api.service.hmrc.gov.uk";
const ID = process.env.HMRC_CLIENT_ID;
const SECRET = process.env.HMRC_CLIENT_SECRET;

const HOUR = 60 * 60 * 1000;
const PER_IP = 30;
const GLOBAL = 300;
// A VAT registration changes at most daily, and the same supplier gets
// looked up every time their invoice is scanned.
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; body: unknown }>();

// HMRC's server token is good for four hours; asking for a new one on every
// lookup would spend the rate limit on nothing.
let token: { value: string; until: number } | null = null;

async function serverToken(): Promise<string | null> {
  if (token && token.until > Date.now() + 60_000) return token.value;
  let res: Response;
  try {
    res = await fetch(`${BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/vnd.hmrc.1.0+json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: ID!, client_secret: SECRET!, scope: "read:vat" }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!body?.access_token) return null;
  token = { value: body.access_token, until: Date.now() + (body.expires_in ?? 14400) * 1000 };
  return token.value;
}

type Lookup = { target?: { name?: string; vatNumber?: string; address?: Record<string, string | undefined> } };

// HMRC returns the address as named lines; they print in this order.
const LINES = ["line1", "line2", "line3", "line4", "line5", "line6", "line7", "line8", "postcode", "countryCode"];

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("number") ?? "";
  const format = checkVatNumberFormat(asked);
  if (format.kind === "empty") return NextResponse.json({ configured: !!(ID && SECRET), format: "empty" });
  if (format.kind === "wrong") return NextResponse.json({ configured: !!(ID && SECRET), format: "wrong", reason: format.reason });
  // A department's number has no check digits and is not in the lookup.
  if (format.kind === "department") return NextResponse.json({ configured: !!(ID && SECRET), format: "department", number: format.normalised });

  if (!ID || !SECRET) return NextResponse.json({ configured: false, format: "ok", number: format.normalised });

  const vrn = format.normalised.replace(/^(GB|XI)/, "").slice(0, 9);
  const hit = cache.get(vrn);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.body);

  const ip = addressKey(req.headers.get("x-forwarded-for"));
  if (!(await allowShared(`vat:ip:${ip}`, PER_IP, HOUR)) || !(await allowShared("vat:global", GLOBAL, HOUR))) {
    return NextResponse.json({ configured: true, busy: true }, { status: 429 });
  }

  const bearer = await serverToken();
  if (!bearer) return NextResponse.json({ configured: true, unavailable: true }, { status: 503 });

  let res: Response;
  try {
    res = await fetch(`${BASE}/organisations/vat/check-vat-number/lookup/${vrn}`, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/vnd.hmrc.2.0+json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ configured: true, unavailable: true }, { status: 503 });
  }
  // HMRC says 404 for a number nobody holds, which is an answer, not a
  // fault: it is the whole point of asking.
  if (res.status === 404) {
    const body = { configured: true, format: "ok", number: format.normalised, registered: false };
    cache.set(vrn, { at: Date.now(), body });
    return NextResponse.json(body);
  }
  if (res.status === 401 || res.status === 403) {
    // Ours to fix, not theirs: the key is wrong or has lost its scope. The
    // person asking is told the same as any other outage.
    console.error("HMRC VAT lookup refused our credentials", res.status);
    return NextResponse.json({ configured: true, unavailable: true }, { status: 503 });
  }
  if (!res.ok) return NextResponse.json({ configured: true, unavailable: true }, { status: 503 });

  const body = (await res.json().catch(() => null)) as Lookup | null;
  if (!body?.target?.name) return NextResponse.json({ configured: true, unavailable: true }, { status: 503 });

  const address = LINES.map((k) => body.target!.address?.[k]).filter(Boolean).join(", ");
  const answer = { configured: true, format: "ok", number: format.normalised, registered: true, name: body.target.name, address };
  cache.set(vrn, { at: Date.now(), body: answer });
  return NextResponse.json(answer);
}
