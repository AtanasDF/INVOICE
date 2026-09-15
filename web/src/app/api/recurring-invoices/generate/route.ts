import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

// Triggered daily by vercel.json's cron config -- same mechanism and same
// CRON_SECRET as /api/notifications/check. For every active recurring
// invoice whose next_due_date has arrived, generates a real draft
// invoice (never sent automatically -- the account holder reviews and
// sends it like any other draft) using that row's client/items/terms,
// and rolls the recurring invoice's next_due_date forward a month.
//
// A generated invoice gets a placeholder number, same as any other
// draft -- the real invoice number and the account's number counter are
// only touched when a draft is actually marked sent (see
// invoices/[id]/page.tsx's confirmSend), not at creation. That also
// means rows can be processed independently here: there's no shared
// counter to serialize against any more.

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Not fully configured." }, { status: 500 });
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const today = new Date().toISOString().slice(0, 10);

    const { data: due, error: dueErr } = await admin
      .from("recurring_invoices")
      .select("id, user_id, client_id, items, payment_terms, notes, next_due_date")
      .eq("active", true)
      .lte("next_due_date", today);
    if (dueErr) return NextResponse.json({ error: dueErr.message }, { status: 500 });
    if (!due || due.length === 0) return NextResponse.json({ generated: 0, checked: 0 });

    let generated = 0;
    const failures: string[] = [];

    await Promise.all(
      due.map(async (row) => {
        try {
          const { error: insErr } = await admin.from("invoices").insert({
            user_id: row.user_id,
            client_id: row.client_id,
            date: today,
            number: `DRAFT-${randomUUID()}`,
            items: row.items,
            notes: row.notes,
            due_date: addDays(today, 30),
            payment_terms: row.payment_terms,
            status: "draft",
            tags: [],
          });
          if (insErr) throw insErr;

          const nextDue = addMonths(row.next_due_date, 1);
          const { error: updErr } = await admin.from("recurring_invoices").update({ next_due_date: nextDue }).eq("id", row.id);
          if (updErr) throw updErr;

          generated += 1;
        } catch (err) {
          failures.push(`${row.id}: ${err instanceof Error ? err.message : "unknown error"}`);
        }
      })
    );

    return NextResponse.json({ generated, checked: due.length, failures: failures.length ? failures : undefined });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error." }, { status: 500 });
  }
}
