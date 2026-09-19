import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { addressKey, allow } from "@/lib/rateLimit";

export const runtime = "nodejs";

const HALF_HOUR = 30 * 60 * 1000;

// Public: the customer's browser says the invoice was opened. Counted once
// per visitor per half hour, in the database; the first open of an invoice
// sends the owner a push notification. Answers the same whatever happens, so
// it can't be used to test which tokens exist.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return NextResponse.json({ ok: true });
  // Per visitor first, then per visitor and link, so nobody can fill the
  // counter's memory or inflate one invoice's opens.
  const ip = addressKey(req.headers.get("x-forwarded-for"));
  if (!allow(`seen:ip:${ip}`, 30, HALF_HOUR)) return NextResponse.json({ ok: true });
  if (!allow(`seen:${token}:${ip}`, 1, HALF_HOUR)) return NextResponse.json({ ok: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: true });
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows } = await admin.rpc("record_invoice_link_view", { p_token: token });
  const view = (rows as { invoice_id: string; user_id: string; first_view: boolean }[] | null)?.[0];

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (view?.first_view && vapidPublic && vapidPrivate) {
    try {
      const [{ data: inv }, { data: subs }] = await Promise.all([
        admin.from("invoices").select("number, client_id").eq("id", view.invoice_id).eq("user_id", view.user_id).maybeSingle(),
        admin.from("push_subscriptions").select("endpoint, p256dh, auth_key").eq("user_id", view.user_id),
      ]);
      const { data: client } = inv?.client_id
        ? await admin.from("clients").select("name").eq("id", inv.client_id).eq("user_id", view.user_id).maybeSingle()
        : { data: null };
      webpush.setVapidDetails("https://invoice-omega-rust.vercel.app", vapidPublic, vapidPrivate);
      const message = JSON.stringify({
        title: "Invoice opened",
        body: `${client?.name ?? "Your customer"} opened invoice ${inv?.number ?? ""}`.trim(),
        url: `/invoices/${view.invoice_id}`,
      });
      await Promise.all((subs ?? []).map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, message).catch(() => {})));
    } catch {
      // The open is recorded either way; a push that can't go isn't worth failing for.
    }
  }
  return NextResponse.json({ ok: true });
}
