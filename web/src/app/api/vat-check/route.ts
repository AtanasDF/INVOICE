import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkVatNumberFormat } from "@/lib/vatNumber";
import { allowShared } from "@/lib/rateLimit";

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
// Per ACCOUNT, not per address. It was 30 an hour per IP, which was the only
// fence this route had and the wrong shape in both directions: two people in
// one office shared it, while anybody who found the address had their own
// allowance of our HMRC quota. Now that the route knows who is asking, the
// count belongs to them.
const PER_USER = 30;
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

type Lookup = {
  target?: { name?: string; vatNumber?: string; address?: Record<string, string | undefined> };
  consultationNumber?: string;
  processingDate?: string;
};

// The whole of HMRC's address: line1, postcode, countryCode, and nothing
// else. Checked against their own OpenAPI spec rather than guessed -- the
// first version of this read line1 through line8, which no response has.
const LINES = ["line1", "postcode", "countryCode"];

// SIGNED IN ONLY, and the whole route rather than the expensive half.
//
// It had no sign-in check at all -- only a per-IP rate limit -- while all five
// of its callers (Settings, both client forms, the quote customer picker) are
// behind sign-in and nothing public has ever used it. That was harmless for as
// long as HMRC_CLIENT_ID stayed unset, because the route then answers
// `configured: false` without calling anyone. It stops being harmless the day
// the production application is approved: a stranger who found the address
// would get lookups on OUR credentials, drain the 300-an-hour everybody shares,
// and -- on the two-number form -- have us send OUR OWN VAT number to HMRC for
// a consultation reference that is deliberately never cached.
//
// The check is at the top rather than in front of the HMRC call only. A fence
// with exceptions is a fence with holes, and the cheap answers here (the
// check-digit verdict, whether the feature is configured) are no stranger's
// business either. Same reasoning as /api/send-invoice, where an open route was
// an invoice-fraud relay, and /api/invoice-template, closed on 2026-09-22.
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = token
    ? await auth.auth.getUser(token).catch(() => ({ data: { user: null } }))
    : { data: { user: null } };
  if (!user) return NextResponse.json({ error: "Sign in to check a VAT number." }, { status: 401 });

  const asked = new URL(req.url).searchParams.get("number") ?? "";
  const format = checkVatNumberFormat(asked);
  if (format.kind === "empty") return NextResponse.json({ configured: !!(ID && SECRET), format: "empty" });
  if (format.kind === "wrong") return NextResponse.json({ configured: !!(ID && SECRET), format: "wrong", reason: format.reason });
  // A department's number has no check digits and is not in the lookup.
  if (format.kind === "department") return NextResponse.json({ configured: !!(ID && SECRET), format: "department", number: format.normalised });

  if (!ID || !SECRET) return NextResponse.json({ configured: false, format: "ok", number: format.normalised });

  const vrn = format.normalised.replace(/^(GB|XI)/, "");
  // Your own VAT number, when you have one. Given both, HMRC answers with a
  // consultation number: a reference that proves you checked this supplier
  // on this date, which is the evidence HMRC asks for if they ever query
  // the VAT you reclaimed. Nobody else in notes/competitor-research.md
  // offers it, and it costs one extra path segment.
  const mine = checkVatNumberFormat(new URL(req.url).searchParams.get("mine") ?? "");
  const requester = mine.kind === "ok" ? mine.normalised.replace(/^(GB|XI)/, "") : null;

  // Only the plain check is answered from memory. A consultation number is
  // issued per request and dated: handing back yesterday's would be handing
  // back a reference to a check that did not happen today.
  const hit = requester ? null : cache.get(vrn);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.body);

  if (!(await allowShared(`vat:user:${user.id}`, PER_USER, HOUR)) || !(await allowShared("vat:global", GLOBAL, HOUR))) {
    return NextResponse.json({ configured: true, busy: true }, { status: 429 });
  }

  const bearer = await serverToken();
  if (!bearer) return NextResponse.json({ configured: true, unavailable: true }, { status: 503 });

  const ask = (path: string) =>
    fetch(`${BASE}/organisations/vat/check-vat-number/lookup/${path}`, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/vnd.hmrc.2.0+json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

  let res: Response;
  try {
    res = requester ? await ask(`${vrn}/${requester}`) : await ask(vrn);
    // 403 on the two-number form means OUR number was refused, not theirs.
    // The answer somebody actually wants -- is this supplier registered --
    // is still available, so ask the plain way rather than telling them
    // nothing.
    if (requester && res.status === 403) res = await ask(vrn);
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
  const answer = {
    configured: true,
    format: "ok",
    number: format.normalised,
    registered: true,
    name: body.target.name,
    address,
    ...(body.consultationNumber ? { consultationNumber: body.consultationNumber, checkedOn: body.processingDate ?? null } : {}),
  };
  if (!body.consultationNumber) cache.set(vrn, { at: Date.now(), body: answer });
  return NextResponse.json(answer);
}
