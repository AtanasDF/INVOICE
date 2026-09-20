import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { todayISO } from "@/lib/today";

export const runtime = "nodejs";

// Triggered daily by vercel.json's cron config -- same mechanism and same
// CRON_SECRET as /api/notifications/check. For every active recurring
// invoice whose next_due_date has arrived, generates a real draft
// invoice (never sent automatically -- the account holder reviews and
// sends it like any other draft) using that row's client/items/terms,
// and rolls the recurring invoice's next_due_date forward a month.
//
// The insert and the next_due_date advance happen inside
// generate_recurring_invoice() (migration-013), one Postgres transaction
// per row, rather than as two separate calls from here -- a dropped
// connection between them used to be able to leave next_due_date in the
// past with the invoice already created, which would regenerate the
// same invoice every day after that with nobody watching to notice.
// service_role-only function, not callable by authenticated or anon --
// see the migration for why.

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
    const today = todayISO();

    const { data: due, error: dueErr } = await admin
      .from("recurring_invoices")
      .select("id")
      .eq("active", true)
      .lte("next_due_date", today);
    if (dueErr) return NextResponse.json({ error: dueErr.message }, { status: 500 });
    if (!due || due.length === 0) return NextResponse.json({ generated: 0, checked: 0 });

    let generated = 0;
    const failures: string[] = [];

    await Promise.all(
      due.map(async (row) => {
        const { error } = await admin.rpc("generate_recurring_invoice", { p_recurring_invoice_id: row.id });
        if (error) {
          failures.push(`${row.id}: ${error.message}`);
          return;
        }
        generated += 1;
      })
    );

    return NextResponse.json({ generated, checked: due.length, failures: failures.length ? failures : undefined });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error." }, { status: 500 });
  }
}
