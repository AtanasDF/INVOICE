import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { invoiceCharge, creditOffDue } from "@/lib/cis";
import { invoiceBalance } from "@/lib/invoiceBalance";
import { lastWeek, weeklySummary, type WeekFigures } from "@/lib/weeklySummary";
import { addDays } from "@/lib/reminderTemplates";
import { todayISO } from "@/lib/today";

export const runtime = "nodejs";

// One push on a Monday morning: what came in last week, what is overdue,
// what is due this week, whose quote is waiting. Triggered by vercel.json's
// cron, which is why it only ever runs on a Monday -- but it checks the day
// itself too, so a hand-triggered run on a Wednesday does not send anybody
// a week that has not finished.
//
// Same shape as /api/notifications/check: the service role key, because
// this runs with no signed-in user and has to see every account at once.

type Row = Record<string, unknown>;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "Push notifications aren't fully configured on this deployment." }, { status: 500 });
  }

  const today = todayISO();
  // 1 is Monday. A cron can fire late, or be run by hand; a summary of "the
  // week just gone" only means anything on the day the week turned over.
  const isMonday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
  if (!isMonday && req.headers.get("x-force-day") !== "yes") {
    return NextResponse.json({ skipped: "not a Monday", today });
  }

  try {
    webpush.setVapidDetails("mailto:hello@invoiceover.com", vapidPublicKey, vapidPrivateKey);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const week = lastWeek(today);
    const weekEnd = addDays(today, 6);

    const [invoices, credits, payments, receipts, quotes, subs] = await Promise.all([
      admin.from("invoices").select("id, user_id, items, status, due_date, vat_registered, cis_rate"),
      admin.from("credit_notes").select("invoice_id, amount"),
      admin.from("invoice_payments").select("user_id, invoice_id, amount, date"),
      admin.from("receipts").select("user_id, document_type, paid, due_date, needs_review"),
      admin.from("quotes").select("user_id, status, valid_until"),
      admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth_key"),
    ]);
    const firstError = [invoices, credits, payments, receipts, quotes, subs].find((r) => r.error);
    if (firstError?.error) return NextResponse.json({ error: firstError.error.message }, { status: 500 });

    const creditBy = new Map<string, number>();
    for (const c of (credits.data ?? []) as Row[]) {
      const id = String(c.invoice_id);
      creditBy.set(id, (creditBy.get(id) ?? 0) + Number(c.amount ?? 0));
    }
    const paidBy = new Map<string, number>();
    for (const p of (payments.data ?? []) as Row[]) {
      const id = String(p.invoice_id);
      paidBy.set(id, (paidBy.get(id) ?? 0) + Number(p.amount ?? 0));
    }

    const figures = new Map<string, WeekFigures>();
    const of = (userId: string) => {
      const had = figures.get(userId);
      if (had) return had;
      const fresh: WeekFigures = { paidIn: 0, paidCount: 0, overdueCount: 0, overdueTotal: 0, dueThisWeek: 0, dueThisWeekTotal: 0, billsDue: 0, quotesWaiting: 0 };
      figures.set(userId, fresh);
      return fresh;
    };

    for (const p of (payments.data ?? []) as Row[]) {
      const date = String(p.date ?? "");
      if (date < week.from || date > week.to) continue;
      const f = of(String(p.user_id));
      f.paidIn += Number(p.amount ?? 0);
      f.paidCount += 1;
    }

    for (const inv of (invoices.data ?? []) as Row[]) {
      const status = String(inv.status);
      if (status !== "sent" && status !== "partial") continue;
      const charge = invoiceCharge(
        { items: (inv.items ?? []) as never, cisRate: (inv.cis_rate as number | null) ?? null },
        (inv.vat_registered as boolean | null) ?? false
      );
      const id = String(inv.id);
      const owed = invoiceBalance({
        total: charge.due,
        credited: creditOffDue(charge, creditBy.get(id) ?? 0),
        paid: paidBy.get(id) ?? 0,
        status: status as never,
      });
      if (owed <= 0) continue;
      const due = (inv.due_date as string | null) ?? null;
      const f = of(String(inv.user_id));
      if (due && due < today) {
        f.overdueCount += 1;
        f.overdueTotal += owed;
      } else if (due && due <= weekEnd) {
        f.dueThisWeek += 1;
        f.dueThisWeekTotal += owed;
      }
    }

    for (const r of (receipts.data ?? []) as Row[]) {
      if (r.document_type !== "invoice" || r.paid === true || r.needs_review === true) continue;
      const due = (r.due_date as string | null) ?? null;
      if (!due || due > weekEnd) continue;
      of(String(r.user_id)).billsDue += 1;
    }

    for (const q of (quotes.data ?? []) as Row[]) {
      if (q.status !== "sent") continue;
      const valid = (q.valid_until as string | null) ?? null;
      if (valid && valid < today) continue;
      of(String(q.user_id)).quotesWaiting += 1;
    }

    let notified = 0;
    const staleIds: string[] = [];
    await Promise.all(
      ((subs.data ?? []) as Row[]).map(async (sub) => {
        const f = figures.get(String(sub.user_id));
        const said = f ? weeklySummary(f) : null;
        if (!said) return;
        try {
          await webpush.sendNotification(
            { endpoint: String(sub.endpoint), keys: { p256dh: String(sub.p256dh), auth: String(sub.auth_key) } },
            JSON.stringify({ title: said.title, body: said.body, url: "/money" })
          );
          notified += 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) staleIds.push(String(sub.id));
        }
      })
    );
    if (staleIds.length > 0) await admin.from("push_subscriptions").delete().in("id", staleIds);

    return NextResponse.json({ notified, accounts: figures.size, week, staleRemoved: staleIds.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error." }, { status: 500 });
  }
}
