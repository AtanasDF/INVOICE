import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeInvoiceTotals, VatLineItem } from "@/lib/vat";
import { DEFAULT_REMINDER_TEXT, ReminderKind, renderReminderTemplate } from "@/lib/reminderTemplates";

export const runtime = "nodejs";

// Triggered daily by vercel.json's cron config -- same mechanism and same
// CRON_SECRET as /api/notifications/check, no separate secret needed for
// this route. For every sent-or-partial invoice with a due date, checks
// whether today matches one of the three fixed reminder points (3 days
// before due / on due date / 7 days after) and, if so and the client
// hasn't opted out, emails them via Resend.
//
// Inert until RESEND_API_KEY is set: returns 200 with a "skipped" note
// rather than erroring, since "no email provider configured yet" is this
// deployment's normal state until the account holder adds one -- the
// rest of the feature (schema, per-client opt-out, editable templates,
// idempotency log) is real and ready for the moment it is.

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
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
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Not fully configured." }, { status: 500 });
  }
  if (!resendApiKey) {
    return NextResponse.json({ skipped: "No RESEND_API_KEY set -- payment reminders aren't sending yet." });
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const today = new Date().toISOString().slice(0, 10);

    const { data: invoices, error: invErr } = await admin
      .from("invoices")
      .select("id, user_id, client_id, number, items, due_date")
      .in("status", ["sent", "partial"])
      .not("due_date", "is", null);
    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

    type DueInvoice = { id: string; user_id: string; client_id: string | null; number: string; items: VatLineItem[]; due_date: string; kind: ReminderKind };

    const candidates: DueInvoice[] = (invoices ?? [])
      .map((inv) => {
        const dueDate = inv.due_date as string;
        let kind: ReminderKind | null = null;
        if (addDays(dueDate, -3) === today) kind = "before";
        else if (dueDate === today) kind = "due";
        else if (addDays(dueDate, 7) === today) kind = "after";
        return kind ? { ...inv, due_date: dueDate, kind } : null;
      })
      .filter((x): x is DueInvoice => x !== null);

    if (candidates.length === 0) {
      return NextResponse.json({ sent: 0, checked: 0 });
    }

    const clientIds = Array.from(new Set(candidates.map((c) => c.client_id).filter((id): id is string => !!id)));
    const userIds = Array.from(new Set(candidates.map((c) => c.user_id)));
    const invoiceIds = candidates.map((c) => c.id);

    const [{ data: clients, error: clientsErr }, { data: profiles, error: profilesErr }, { data: creditNotes, error: cnErr }, { data: alreadySent, error: sentErr }] =
      await Promise.all([
        admin.from("clients").select("id, name, email, reminders_enabled").in("id", clientIds),
        admin.from("business_profile").select("user_id, vat_registered, reminder_text_before, reminder_text_due, reminder_text_after").in("user_id", userIds),
        admin.from("credit_notes").select("invoice_id, amount").in("invoice_id", invoiceIds),
        admin.from("invoice_reminders_sent").select("invoice_id, kind").in("invoice_id", invoiceIds),
      ]);
    if (clientsErr || profilesErr || cnErr || sentErr) {
      return NextResponse.json({ error: (clientsErr ?? profilesErr ?? cnErr ?? sentErr)?.message }, { status: 500 });
    }

    const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
    const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const creditByInvoice = new Map<string, number>();
    for (const c of creditNotes ?? []) creditByInvoice.set(c.invoice_id, (creditByInvoice.get(c.invoice_id) ?? 0) + Number(c.amount));
    const sentSet = new Set((alreadySent ?? []).map((s) => `${s.invoice_id}:${s.kind}`));

    let sentCount = 0;
    const failures: string[] = [];

    for (const inv of candidates) {
      if (sentSet.has(`${inv.id}:${inv.kind}`)) continue;
      const client = clientById.get(inv.client_id ?? "");
      if (!client || !client.reminders_enabled || !client.email) continue;
      const profile = profileByUser.get(inv.user_id);
      const templateOverride = profile
        ? inv.kind === "before"
          ? profile.reminder_text_before
          : inv.kind === "due"
            ? profile.reminder_text_due
            : profile.reminder_text_after
        : null;
      const template = templateOverride || DEFAULT_REMINDER_TEXT[inv.kind];
      const items = (inv.items ?? []).map((it) => ({ ...it, vatRate: it.vatRate ?? "zero" }));
      const gross = computeInvoiceTotals(items, profile?.vat_registered ?? false).total;
      const amountDue = gross - (creditByInvoice.get(inv.id) ?? 0);
      const body = renderReminderTemplate(template, {
        clientName: client.name,
        invoiceNumber: inv.number,
        amountDue: amountDue.toFixed(2),
        dueDate: inv.due_date,
      });

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Payment reminders <reminders@invoiceover.com>",
            to: [client.email],
            subject: `Invoice ${inv.number}`,
            text: body,
          }),
        });
        if (!res.ok) {
          failures.push(`${inv.id}: ${res.status}`);
          continue;
        }
        await admin.from("invoice_reminders_sent").insert({ user_id: inv.user_id, invoice_id: inv.id, kind: inv.kind });
        sentCount += 1;
      } catch (err) {
        failures.push(`${inv.id}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }

    return NextResponse.json({ sent: sentCount, checked: candidates.length, failures: failures.length ? failures : undefined });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error." }, { status: 500 });
  }
}
