import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RELAYED_ERRORS } from "@/lib/extractors";
import { invoiceFromText } from "@/lib/invoiceFromText";
import { allow } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_CHARS = 2000;
const PER_HOUR = 60;

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = token ? await auth.auth.getUser(token) : { data: { user: null } };
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "This isn't configured yet on the server." }, { status: 500 });

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Type what the invoice is for first." }, { status: 400 });
  if (text.length > MAX_CHARS) return NextResponse.json({ error: `Keep it under ${MAX_CHARS} characters.` }, { status: 400 });
  if (!allow(`text:${user.id}`, PER_HOUR, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many this hour. Try again later." }, { status: 429 });
  }

  try {
    const { template, vat } = await invoiceFromText(text, "claude");
    return NextResponse.json({ template, vat });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (RELAYED_ERRORS.has(message)) return NextResponse.json({ error: message }, { status: 502 });
    console.error("invoice-from-text failed:", message || String(err));
    return NextResponse.json({ error: "Couldn't turn that into an invoice. Try again." }, { status: 502 });
  }
}
