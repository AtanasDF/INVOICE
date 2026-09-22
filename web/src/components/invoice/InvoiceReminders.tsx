"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { REMINDER_SCHEDULE, addDays, laterReminders, reminderDueToday } from "@/lib/reminderTemplates";
import { Client, Invoice, remindersSentStore } from "@/lib/storage";
import { todayISO } from "@/lib/today";

const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// Which automatic reminders have gone out for this invoice, which are
// coming, and why there are none when there aren't.
export default function InvoiceReminders({ invoice, client, amountDue, hasPayments }: { invoice: Invoice; client: Client | null; amountDue: number; hasPayments: boolean }) {
  const [sent, setSent] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    let live = true;
    remindersSentStore
      .forInvoice(invoice.id)
      .then((rows) => {
        if (live) setSent(new Map(rows.map((r) => [r.kind, r.sentAt])));
      })
      .catch(() => {
        if (live) setSent(new Map());
      });
    return () => {
      live = false;
    };
  }, [invoice.id]);

  if (invoice.status === "paid" || invoice.status === "draft" || amountDue <= 0) return null;

  const reason =
    invoice.status === "partial" && !hasPayments
      ? "No automatic reminders: it's marked part-paid but no payments are recorded, so the balance isn't known. Record what came in under Payments."
      : !invoice.dueDate
        ? "No due date, so no automatic reminders."
        : !client?.email
          ? "No automatic reminders: this client has no email address."
          : !client.remindersEnabled
            ? "Automatic reminders are off for this client."
            : null;

  const today = todayISO();
  // In its window today (on the day or a missed day being caught up) and
  // neither it nor a later one sent yet.
  const nowKind = invoice.dueDate ? reminderDueToday(invoice.dueDate, today) : null;
  const goingToday = nowKind && !laterReminders(nowKind).some((k) => sent?.has(k)) ? nowKind : null;
  const next = invoice.dueDate
    ? REMINDER_SCHEDULE.find((r) => r.kind === goingToday) ?? REMINDER_SCHEDULE.find((r) => addDays(invoice.dueDate!, r.days) > today && !sent?.has(r.kind))
    : undefined;

  return (
    <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm print:hidden">
      <h2 className="font-semibold">Payment reminders</h2>
      {reason ? (
        <p className="mt-1 text-sm text-neutral-600">
          {reason}
          {client && (reason.includes("email") || reason.includes("off for this client")) && (
            <>
              {" "}
              <Link href={client.kind === "supplier" ? "/clients?tab=supplier" : "/clients"} className="font-medium text-neutral-700 underline">Edit the client</Link>
            </>
          )}
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {REMINDER_SCHEDULE.map((r) => {
            const on = addDays(invoice.dueDate!, r.days);
            const sentAt = sent?.get(r.kind);
            const state = sentAt ? `Sent ${shortDate(sentAt)}` : r.kind === goingToday ? "Goes out today" : on > today ? `Goes out ${shortDate(on)}` : "Not sent";
            return (
              <li key={r.kind} className={`flex justify-between gap-4 ${r === next ? "font-medium" : sentAt ? "text-neutral-700" : "text-neutral-500"}`}>
                <span>{r.label}</span>
                <span className="shrink-0">{state}</span>
              </li>
            );
          })}
        </ul>
      )}
      {!reason && <p className="mt-2 text-xs text-neutral-500">Sent to {client!.email}. Change the wording in Settings.</p>}
    </div>
  );
}
