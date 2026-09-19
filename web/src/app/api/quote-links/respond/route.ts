import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { addressKey, allow } from "@/lib/rateLimit";
import { pushToOwner } from "@/lib/ownerPush";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

// Printable characters only, one line: it lands in the owner's notification
// and on the quote page.
const cleanName = (v: unknown) =>
  typeof v === "string"
    ? v
        .split("")
        .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch))
        .join("")
        .trim()
        .slice(0, 120)
    : "";

// Public: the customer accepts or declines a quote from its link. The
// database function makes the change only for a sent, unexpired quote that
// hasn't been answered, so a replayed or late answer does nothing.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; response?: unknown; name?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  const response = body.response === "accepted" || body.response === "declined" ? body.response : null;
  const name = cleanName(body.name);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !response) {
    return NextResponse.json({ ok: false, error: "That didn't work. Reload the page and try again." }, { status: 400 });
  }
  if (!allow(`qrespond:${addressKey(req.headers.get("x-forwarded-for"))}`, 10, HOUR)) {
    return NextResponse.json({ ok: false, error: "Too many tries. Try again later." }, { status: 429 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: rows, error } = await admin.rpc("respond_to_quote_link", { p_token: token, p_response: response, p_name: name });
  if (error) return NextResponse.json({ ok: false, error: "Something went wrong on our side. Please try again in a moment." }, { status: 503 });
  const done = (rows as { quote_id: string; user_id: string }[] | null)?.[0];
  if (!done) {
    return NextResponse.json(
      { ok: false, error: "This quote can't be answered any more: it may have been answered already, withdrawn or expired. Please contact the sender." },
      { status: 409 }
    );
  }

  const { data: q } = await admin.from("quotes").select("number, client_id").eq("id", done.quote_id).eq("user_id", done.user_id).maybeSingle();
  const { data: client } = q?.client_id
    ? await admin.from("clients").select("name").eq("id", q.client_id).eq("user_id", done.user_id).maybeSingle()
    : { data: null };
  await pushToOwner(admin, done.user_id, {
    title: response === "accepted" ? "Quote accepted" : "Quote declined",
    body: `${name || client?.name || "Your customer"} ${response} quote ${q?.number ?? ""}`.trim(),
    url: `/quotes/${done.quote_id}`,
  });
  return NextResponse.json({ ok: true, response });
}
