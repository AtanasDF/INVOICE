import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { addressKey, allow } from "@/lib/rateLimit";

export const runtime = "nodejs";

const HALF_HOUR = 30 * 60 * 1000;

// Public: the customer's browser says the invoice was opened. Counted once
// per visitor per half hour; the first open of an invoice sends the owner a
// push notification. Answers the same whatever happens, so it can't be used
// to test which tokens exist.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[A-Za-z0-9_-]{43,}$/.test(token)) return NextResponse.json({ ok: true });
  if (!allow(`seen:${token}:${addressKey(req.headers.get("x-forwarded-for"))}`, 1, HALF_HOUR)) return NextResponse.json({ ok: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: true });
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: link } = await admin.from("invoice_links").select("invoice_id, user_id, first_viewed_at, view_count").eq("token", token).maybeSingle();
  if (!link) return NextResponse.json({ ok: true });
  const now = new Date().toISOString();
  // Only the request that finds first_viewed_at still empty gets to set it,
  // so two opens at once send one notification.
  const { data: firstRow } = link.first_viewed_at
    ? { data: null }
    : await admin.from("invoice_links").update({ first_viewed_at: now }).eq("token", token).is("first_viewed_at", null).select("invoice_id");
  await admin.from("invoice_links").update({ last_viewed_at: now, view_count: link.view_count + 1 }).eq("token", token);

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (firstRow?.length && vapidPublic && vapidPrivate) {
    try {
      const [{ data: inv }, { data: subs }] = await Promise.all([
        admin.from("invoices").select("number, client_id").eq("id", link.invoice_id).maybeSingle(),
        admin.from("push_subscriptions").select("endpoint, p256dh, auth_key").eq("user_id", link.user_id),
      ]);
      const { data: client } = inv?.client_id ? await admin.from("clients").select("name").eq("id", inv.client_id).maybeSingle() : { data: null };
      webpush.setVapidDetails("https://invoice-omega-rust.vercel.app", vapidPublic, vapidPrivate);
      const message = JSON.stringify({
        title: "Invoice opened",
        body: `${client?.name ?? "Your customer"} opened invoice ${inv?.number ?? ""}`.trim(),
        url: `/invoices/${link.invoice_id}`,
      });
      await Promise.all((subs ?? []).map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, message).catch(() => {})));
    } catch {
      // The open is recorded either way; a push that can't go isn't worth failing for.
    }
  }
  return NextResponse.json({ ok: true });
}
