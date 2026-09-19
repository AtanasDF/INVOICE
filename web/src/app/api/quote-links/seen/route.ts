import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { addressKey, allow } from "@/lib/rateLimit";
import { pushToOwner } from "@/lib/ownerPush";

export const runtime = "nodejs";

const HALF_HOUR = 30 * 60 * 1000;

// Public: the customer's browser says the quote was opened. Same rules as
// invoice links: per visitor, counted in the database, the first open
// notifies the owner, and the answer never says whether the token exists.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return NextResponse.json({ ok: true });
  const ip = addressKey(req.headers.get("x-forwarded-for"));
  if (!allow(`qseen:ip:${ip}`, 30, HALF_HOUR)) return NextResponse.json({ ok: true });
  if (!allow(`qseen:${token}:${ip}`, 1, HALF_HOUR)) return NextResponse.json({ ok: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: true });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: rows } = await admin.rpc("record_quote_link_view", { p_token: token });
  const view = (rows as { quote_id: string; user_id: string; first_view: boolean }[] | null)?.[0];
  if (view?.first_view) {
    const { data: q } = await admin.from("quotes").select("number, client_id").eq("id", view.quote_id).eq("user_id", view.user_id).maybeSingle();
    const { data: client } = q?.client_id
      ? await admin.from("clients").select("name").eq("id", q.client_id).eq("user_id", view.user_id).maybeSingle()
      : { data: null };
    await pushToOwner(admin, view.user_id, {
      title: "Quote opened",
      body: `${client?.name ?? "Your customer"} opened quote ${q?.number ?? ""}`.trim(),
      url: `/quotes/${view.quote_id}`,
    });
  }
  return NextResponse.json({ ok: true });
}
