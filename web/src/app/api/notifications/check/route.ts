import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { selfAssessmentNotice } from "@/lib/taxEstimate";
import { todayISO } from "@/lib/today";
import { addDays } from "@/lib/reminderTemplates";
import { SITE_NAME } from "@/lib/siteName";

export const runtime = "nodejs";

// Triggered daily by vercel.json's cron config. Checks every account for
// an overdue invoice, a due recurring expense or a supplier bill due
// within 3 days -- same conditions as the dashboard's reminder banners --
// and pushes to each of that account's subscribed devices. Needs the
// service_role key to see every account's rows at once, since this runs
// with no signed-in user, not scoped to one.

type DueCounts = { overdueInvoices: number; dueRecurring: number; dueBills: number };

function todayStr(): string {
  return todayISO();
}

// From TODAY as Britain reckons it, not as UTC does. This asked UTC what day
// it was and then counted from there, while `today` two lines up was already
// London -- so for the hour after midnight every summer night the two
// disagreed by a day, and the 3-day bill window was computed from yesterday.
// A bill due in exactly 3 days would not have been pushed about.
//
// The cron runs at 08:00, so it never met that hour in practice; the route
// can be called at any hour with the secret, and the pattern was sitting
// here to be copied.
function daysFromToday(days: number): string {
  return addDays(todayISO(), days);
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "Push notifications aren't fully configured on this deployment." }, { status: 500 });
  }

  // Everything below can throw synchronously (setVapidDetails validates
  // key format and rejects malformed keys immediately) or reject -- none
  // of that was caught before, so a bad key or a Supabase client error
  // surfaced as a bare, bodyless 500 with no indication of what broke.
  try {
    webpush.setVapidDetails("https://invoice-omega-rust.vercel.app", vapidPublicKey, vapidPrivateKey);
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const today = todayStr();

    const [
      { data: overdueInvoices, error: invErr },
      { data: dueRecurring, error: recErr },
      { data: dueBills, error: billErr },
    ] = await Promise.all([
      // "sent" or "partial" only -- a draft was never issued so it can't
      // be overdue, and a paid invoice is done regardless of due date.
      admin.from("invoices").select("user_id").in("status", ["sent", "partial"]).lt("due_date", today),
      admin.from("recurring_expenses").select("user_id").eq("active", true).lte("next_due_date", today),
      // Unpaid supplier invoices (scanned into receipts) due within 3 days
      // or already overdue -- the same window the dashboard's Bills card
      // flags. No lower bound so an overdue bill keeps being mentioned.
      // Unreviewed (emailed-in) rows are excluded: their due date is an
      // unchecked AI reading, not a bill the account holder knows about.
      admin
        .from("receipts")
        .select("user_id")
        .eq("document_type", "invoice")
        .eq("paid", false)
        .eq("needs_review", false)
        .lte("due_date", daysFromToday(3)),
    ]);
    const queryErr = invErr ?? recErr ?? billErr;
    if (queryErr) {
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    const dueByUser = new Map<string, DueCounts>();
    function bump(userId: string, key: keyof DueCounts) {
      const entry = dueByUser.get(userId) ?? { overdueInvoices: 0, dueRecurring: 0, dueBills: 0 };
      entry[key] += 1;
      dueByUser.set(userId, entry);
    }
    for (const row of overdueInvoices ?? []) bump(row.user_id, "overdueInvoices");
    for (const row of dueRecurring ?? []) bump(row.user_id, "dueRecurring");
    for (const row of dueBills ?? []) bump(row.user_id, "dueBills");

    const saNotice = selfAssessmentNotice(today);
    if (dueByUser.size === 0 && !saNotice) {
      return NextResponse.json({ notified: 0, checked: 0, usersWithReminders: 0 });
    }

    const subsQuery = admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth_key");
    const { data: subs, error: subsErr } = saNotice ? await subsQuery : await subsQuery.in("user_id", Array.from(dueByUser.keys()));
    if (subsErr) {
      return NextResponse.json({ error: subsErr.message }, { status: 500 });
    }

    let notified = 0;
    const staleIds: string[] = [];

    await Promise.all(
      (subs ?? []).map(async (sub) => {
        const due = dueByUser.get(sub.user_id) ?? { overdueInvoices: 0, dueRecurring: 0, dueBills: 0 };
        const parts: string[] = [];
        if (due.overdueInvoices > 0) {
          parts.push(`${due.overdueInvoices} overdue ${due.overdueInvoices === 1 ? "invoice" : "invoices"}`);
        }
        if (due.dueRecurring > 0) {
          parts.push(`${due.dueRecurring} recurring ${due.dueRecurring === 1 ? "expense" : "expenses"} due`);
        }
        if (due.dueBills > 0) {
          parts.push(`${due.dueBills} ${due.dueBills === 1 ? "bill" : "bills"} due soon`);
        }
        if (!parts.length && !saNotice) return;
        const body = [saNotice ? `${saNotice}.` : "", parts.length ? `${saNotice ? "Also " : ""}${parts.join(" and ")}` : ""].filter(Boolean).join(" ");
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            JSON.stringify({ title: SITE_NAME, body, url: "/", badge: due.overdueInvoices + due.dueRecurring + due.dueBills })
          );
          notified += 1;
        } catch (err) {
          // 404/410 means the push service has invalidated this subscription
          // (uninstalled, permission revoked, etc.) -- clean it up rather
          // than retrying it forever.
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleIds.push(sub.id);
          }
        }
      })
    );

    if (staleIds.length > 0) {
      await admin.from("push_subscriptions").delete().in("id", staleIds);
    }

    return NextResponse.json({ notified, checked: subs?.length ?? 0, usersWithReminders: dueByUser.size, staleRemoved: staleIds.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error." }, { status: 500 });
  }
}
