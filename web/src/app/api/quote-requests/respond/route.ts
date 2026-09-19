import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { addressKey, allow } from "@/lib/rateLimit";
import { pushToOwner } from "@/lib/ownerPush";
import type { LinePrice } from "@/lib/quoteCompare";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;
const MAX_PRICE = 10_000_000;

// Printable characters only: these land on the owner's page and in a push.
const clean = (v: unknown, max: number, oneLine = true) =>
  typeof v === "string"
    ? v
        .replace(oneLine ? /[\u0000-\u001f\u007f]+/g : /[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ")
        .trim()
        .slice(0, max)
    : "";

const amount = (v: unknown): number | null | undefined => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v >= MAX_PRICE) return undefined;
  return Math.round(v * 10000) / 10000;
};

function cleanPrices(v: unknown): Record<string, LinePrice> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, LinePrice> = {};
  for (const [id, raw] of Object.entries(v as Record<string, unknown>).slice(0, 200)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !raw || typeof raw !== "object") return null;
    const r = raw as { price?: unknown; unavailable?: unknown; note?: unknown };
    const unavailable = r.unavailable === true;
    const price = unavailable ? null : amount(r.price);
    if (price === undefined) return null;
    out[id] = { price, unavailable, note: clean(r.note, 300) };
  }
  return out;
}

// Public: a supplier sends their prices from their request link. The
// database function takes an answer only once, only while the request is
// open and not past its needed-by date, and only for that link's row.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ ok: false, error: "That didn't work. Reload the page and try again." }, { status: 400 });
  }
  const decline = body.decline === true;
  const prices = decline ? {} : cleanPrices(body.prices);
  const delivery = decline ? null : amount(body.delivery);
  const validUntil = typeof body.validUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.validUntil) && !Number.isNaN(Date.parse(body.validUntil)) ? body.validUntil : null;
  if (!prices || delivery === undefined) {
    return NextResponse.json({ ok: false, error: "Some of the prices couldn't be read. Check them and try again." }, { status: 400 });
  }
  if (validUntil && validUntil < new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ ok: false, error: "The valid-until date is in the past." }, { status: 400 });
  }
  if (!allow(`qrrespond:${addressKey(req.headers.get("x-forwarded-for"))}`, 10, HOUR)) {
    return NextResponse.json({ ok: false, error: "Too many tries. Try again later." }, { status: 429 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  // Nothing priced is the same as saying they can't quote.
  const status = !decline && Object.values(prices).some((p) => p.price !== null) ? "replied" : "declined";
  const { data: rows, error } = await admin.rpc("submit_quote_request_response", {
    p_token: token,
    p_status: status,
    p_prices: status === "replied" ? prices : {},
    p_delivery: status === "replied" ? delivery : null,
    p_vat_included: body.vatIncluded === true,
    p_valid_until: status === "replied" ? validUntil : null,
    p_note: clean(body.note, 2000, false),
    p_name: clean(body.name, 120),
  });
  if (error) return NextResponse.json({ ok: false, error: "Something went wrong on our side. Please try again in a moment." }, { status: 503 });
  const done = (rows as { row_id: string; req_id: string; owner_id: string }[] | null)?.[0];
  if (!done) {
    return NextResponse.json(
      { ok: false, error: "This request can't take prices any more: it may have been answered already, closed or passed its date. Please contact the sender." },
      { status: 409 }
    );
  }

  const [{ data: request }, { data: row }] = await Promise.all([
    admin.from("quote_requests").select("title").eq("id", done.req_id).eq("user_id", done.owner_id).maybeSingle(),
    admin.from("quote_request_suppliers").select("supplier_id").eq("id", done.row_id).eq("user_id", done.owner_id).maybeSingle(),
  ]);
  const { data: supplier } = row
    ? await admin.from("clients").select("name").eq("id", row.supplier_id).eq("user_id", done.owner_id).maybeSingle()
    : { data: null };
  await pushToOwner(admin, done.owner_id, {
    title: status === "replied" ? "Prices in" : "Can't quote",
    body: `${supplier?.name ?? "A supplier"} ${status === "replied" ? "priced" : "can't quote for"} ${request?.title ?? "your request"}`,
    url: `/quotes/requests/${done.req_id}`,
  });
  return NextResponse.json({ ok: true, status });
}
