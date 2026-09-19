import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeInvoiceTotals, VatLineItem } from "@/lib/vat";
import { ReminderKind, SUBJECT, laterReminders, reminderBody, reminderDueToday } from "@/lib/reminderTemplates";

export const runtime = "nodejs";

// Triggered daily by vercel.json's cron config -- same mechanism and same
// CRON_SECRET as /api/notifications/check, no separate secret needed for
// this route. For every sent (not part-paid) invoice with a due date, checks
// whether today falls in one of the fixed reminder windows (REMINDER_SCHEDULE:
// 3 days before due, on the day, then 7, 14 and 30 days after, each with a
// few catch-up days) and, if so and the client hasn't opted out, emails them
// via Resend.
//
// Inert until RESEND_API_KEY is set: returns 200 with a "skipped" note
// rather than erroring, since "no email provider configured yet" is this
// deployment's normal state until the account holder adds one -- the
// rest of the feature (schema, per-client opt-out, editable templates,
// idempotency log) is real and ready for the moment it is.

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
      .select("id, user_id, client_id, number, items, due_date, status")
      // Part-paid ones too: they're chased for the balance, once payments
      // say what it is (below).
      .in("status", ["sent", "partial"])
      .not("due_date", "is", null);
    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

    type DueInvoice = { id: string; user_id: string; client_id: string | null; number: string; items: VatLineItem[]; due_date: string; status: string; kind: ReminderKind };

    const candidates: DueInvoice[] = (invoices ?? [])
      .map((inv) => {
        const dueDate = inv.due_date as string;
        const kind = reminderDueToday(dueDate, today);
        return kind ? { ...inv, due_date: dueDate, kind } : null;
      })
      .filter((x): x is DueInvoice => x !== null);

    if (candidates.length === 0) {
      return NextResponse.json({ sent: 0, checked: 0 });
    }

    const clientIds = Array.from(new Set(candidates.map((c) => c.client_id).filter((id): id is string => !!id)));
    const userIds = Array.from(new Set(candidates.map((c) => c.user_id)));
    const invoiceIds = candidates.map((c) => c.id);

    const [{ data: clients, error: clientsErr }, { data: profiles, error: profilesErr }, { data: creditNotes, error: cnErr }, { data: alreadySent, error: sentErr }, { data: payments, error: payErr }] =
      await Promise.all([
        admin.from("clients").select("id, name, email, reminders_enabled, is_company").in("id", clientIds),
        admin
          .from("business_profile")
          .select(
            "user_id, vat_registered, business_name, bank_details, reminder_text_before, reminder_text_due, reminder_text_after, reminder_text_late, reminder_text_final, reminder_late_payment_interest"
          )
          .in("user_id", userIds),
        admin.from("credit_notes").select("invoice_id, amount").in("invoice_id", invoiceIds),
        admin.from("invoice_reminders_sent").select("invoice_id, kind").in("invoice_id", invoiceIds),
        admin.from("invoice_payments").select("invoice_id, amount").in("invoice_id", invoiceIds),
      ]);
    if (clientsErr || profilesErr || cnErr || sentErr || payErr) {
      return NextResponse.json({ error: (clientsErr ?? profilesErr ?? cnErr ?? sentErr ?? payErr)?.message }, { status: 500 });
    }

    // Replies go to the account owner, not to the app's sending address.
    const ownerEmails = new Map<string, string>();
    await Promise.all(
      userIds.map(async (id) => {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (!error && data.user?.email) ownerEmails.set(id, data.user.email);
      })
    );

    const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
    const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const creditByInvoice = new Map<string, number>();
    for (const c of creditNotes ?? []) creditByInvoice.set(c.invoice_id, (creditByInvoice.get(c.invoice_id) ?? 0) + Number(c.amount));
    const sentSet = new Set((alreadySent ?? []).map((s) => `${s.invoice_id}:${s.kind}`));
    const paidByInvoice = new Map<string, number>();
    for (const p of payments ?? []) paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount));

    let sentCount = 0;
    const failures: string[] = [];

    for (const inv of candidates) {
      // Already sent, or overtaken by a later one sent on a catch-up day.
      if (laterReminders(inv.kind).some((k) => sentSet.has(`${inv.id}:${k}`))) continue;
      const client = clientById.get(inv.client_id ?? "");
      if (!client || !client.reminders_enabled || !client.email) continue;
      const profile = profileByUser.get(inv.user_id);
      const overrides: Record<ReminderKind, string | null | undefined> = {
        before: profile?.reminder_text_before,
        due: profile?.reminder_text_due,
        after: profile?.reminder_text_after,
        late: profile?.reminder_text_late,
        final: profile?.reminder_text_final,
      };
      const items = (inv.items ?? []).map((it) => ({ ...it, vatRate: it.vatRate ?? "zero" }));
      const gross = computeInvoiceTotals(items, profile?.vat_registered ?? false).total;
      const paid = paidByInvoice.get(inv.id) ?? 0;
      // Marked part-paid with nothing recorded: the balance isn't known.
      if (inv.status === "partial" && paid === 0) continue;
      const amountDue = Math.round((gross - (creditByInvoice.get(inv.id) ?? 0) - paid) * 100) / 100;
      // Credited or paid in full: nothing to chase.
      if (amountDue <= 0) continue;
      const businessName = profile?.business_name?.trim() ?? "";
      const body = reminderBody({
        kind: inv.kind,
        template: overrides[inv.kind] ?? null,
        clientName: client.name,
        clientIsCompany: client.is_company === true,
        invoiceNumber: inv.number,
        amountDue,
        dueDate: inv.due_date,
        today,
        bank: profile?.bank_details?.trim() ?? "",
        businessName,
        claimInterest: profile?.reminder_late_payment_interest === true,
      });
      const replyTo = ownerEmails.get(inv.user_id);
      // Without the owner's address a reply would go to an inbox nobody reads.
      if (!replyTo) {
        failures.push(`${inv.id}: no owner email, not sent`);
        continue;
      }
      const fromName = `${businessName.replace(/["<>\\\r\n]/g, "") || "Your supplier"} via Invoicer`;

      // Claim the slot before sending, so two overlapping runs can't both
      // send it: only the run whose insert lands goes on. A failed send
      // keeps its claim (it wasn't retried before either; the next slot
      // for this invoice still goes out).
      const { data: claimed, error: claimErr } = await admin
        .from("invoice_reminders_sent")
        .upsert({ user_id: inv.user_id, invoice_id: inv.id, kind: inv.kind }, { onConflict: "invoice_id,kind", ignoreDuplicates: true })
        .select("invoice_id");
      if (claimErr) {
        failures.push(`${inv.id}: ${claimErr.message}`);
        continue;
      }
      if (!claimed?.length) continue;

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `"${fromName}" <reminders@invoiceover.com>`,
            to: [client.email],
            reply_to: replyTo,
            subject: `Invoice ${inv.number}: ${SUBJECT[inv.kind]}`,
            text: body,
          }),
        });
        if (!res.ok) {
          failures.push(`${inv.id}: ${res.status}`);
          continue;
        }
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
