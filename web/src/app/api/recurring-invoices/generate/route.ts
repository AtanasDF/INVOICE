import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Triggered daily by vercel.json's cron config -- same mechanism and same
// CRON_SECRET as /api/notifications/check. For every active recurring
// invoice whose next_due_date has arrived, generates a real draft invoice
// (never sent automatically -- the account holder reviews and sends it
// like any other draft) using that row's client/items/terms, advances
// the account's invoice-number counter the same way a manually-created
// invoice does, and rolls the recurring invoice's next_due_date forward
// a month.
//
// Rows for the same account are processed one at a time, not in
// parallel -- they share one invoice-number counter, and issuing two
// numbers from the same starting point at once would hand out a
// duplicate.

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

    // Cache each account's counter locally so several due rows for the
    // same user in one run consume consecutive numbers correctly,
    // without re-reading business_profile between every insert.
    const profileCache = new Map<string, { invoicePrefix: string; invoiceNextNumber: number }>();
    let generated = 0;
    const failures: string[] = [];

    for (const row of due) {
      try {
        let profile = profileCache.get(row.user_id);
        if (!profile) {
          const { data: p, error: pErr } = await admin
            .from("business_profile")
            .select("invoice_prefix, invoice_next_number")
            .eq("user_id", row.user_id)
            .maybeSingle();
          if (pErr) throw pErr;
          profile = { invoicePrefix: p?.invoice_prefix ?? "INV-", invoiceNextNumber: p?.invoice_next_number ?? 1 };
          profileCache.set(row.user_id, profile);
        }

        // Retries on a number collision (23505) by trying the next
        // integer, same as a person hand-typing around a taken number --
        // capped so a genuinely broken counter can't loop forever.
        let created = false;
        for (let attempt = 0; attempt < 5 && !created; attempt++) {
          const number = `${profile.invoicePrefix}${profile.invoiceNextNumber}`;
          const { error: insErr } = await admin.from("invoices").insert({
            user_id: row.user_id,
            client_id: row.client_id,
            date: today,
            number,
            items: row.items,
            notes: row.notes,
            due_date: addDays(today, 30),
            payment_terms: row.payment_terms,
            status: "draft",
            tags: [],
          });
          if (!insErr) {
            created = true;
            break;
          }
          if (insErr.code !== "23505") throw insErr;
          profile.invoiceNextNumber += 1;
        }
        if (!created) {
          failures.push(`${row.id}: could not find a free invoice number after 5 attempts`);
          continue;
        }

        profile.invoiceNextNumber += 1;
        await admin.from("business_profile").update({ invoice_next_number: profile.invoiceNextNumber }).eq("user_id", row.user_id);

        const nextDue = addMonths(row.next_due_date, 1);
        await admin.from("recurring_invoices").update({ next_due_date: nextDue }).eq("id", row.id);

        generated += 1;
      } catch (err) {
        failures.push(`${row.id}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }

    return NextResponse.json({ generated, checked: due.length, failures: failures.length ? failures : undefined });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error." }, { status: 500 });
  }
}
