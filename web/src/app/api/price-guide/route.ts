import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CUT_OFF, ENGINE_BUSY, NOT_STRUCTURED } from "@/lib/extractors";
import { priceGuide } from "@/lib/priceGuide";
import { allow } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHARS = 300;
const PER_HOUR = 120;
const RELAYED = new Set([CUT_OFF, NOT_STRUCTURED, ENGINE_BUSY]);

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = token ? await auth.auth.getUser(token) : { data: { user: null } };
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "Price guides aren't configured on this deployment." }, { status: 500 });

  const body = (await req.json().catch(() => null)) as
    | { description?: unknown; quantity?: unknown; unit?: unknown; kind?: unknown; want?: unknown; priced?: unknown }
    | null;
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, MAX_CHARS) : "";
  if (!description) return NextResponse.json({ error: "Nothing to look up." }, { status: 400 });
  if (!allow(`price:${user.id}`, PER_HOUR, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many price checks this hour. Try again later." }, { status: 429 });
  }

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  try {
    const guide = await priceGuide({
      description,
      quantity: num(body?.quantity),
      unit: typeof body?.unit === "string" ? body.unit.slice(0, 40) : null,
      kind: body?.kind === "job" ? "job" : "product",
      want: typeof body?.want === "string" ? body.want.trim().slice(0, MAX_CHARS) : null,
      priced: num(body?.priced),
    });
    return NextResponse.json({ guide });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (RELAYED.has(message)) return NextResponse.json({ error: message }, { status: 502 });
    console.error("price-guide failed:", message || String(err));
    return NextResponse.json({ error: "Couldn't work out a price guide just now." }, { status: 502 });
  }
}
