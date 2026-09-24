export type ReminderKind = "before" | "due" | "after" | "late" | "final";

// Days from the due date each reminder goes out, politest first. Nothing
// is sent after the final notice: past that point it's the owner's call.
export const REMINDER_SCHEDULE: { kind: ReminderKind; days: number; label: string }[] = [
  { kind: "before", days: -3, label: "3 days before due" },
  { kind: "due", days: 0, label: "On the due date" },
  { kind: "after", days: 9, label: "7 days after due" },
  { kind: "late", days: 14, label: "14 days after due" },
  { kind: "final", days: 30, label: "30 days after due (final notice)" },
];

// Shown in Settings as placeholder text and used as the actual wording
// whenever the account hasn't typed an override.
export const DEFAULT_REMINDER_TEXT: Record<ReminderKind, string> = {
  before: "Hi {{client_name}}, just a friendly reminder that invoice {{invoice_number}} is due on {{due_date}}, with £{{amount_due}} to pay. Thank you.",
  due: "Hi {{client_name}}, invoice {{invoice_number}} is due for payment today, with £{{amount_due}} to pay. If it's already on its way, thank you and please ignore this.",
  after:
    "Hi {{client_name}}, invoice {{invoice_number}} was due on {{due_date}} and £{{amount_due}} of it is now overdue. Please arrange payment within the next 7 days, or reply to this email if there's a problem with it.",
  late:
    "Hi {{client_name}}, invoice {{invoice_number}} is now two weeks overdue (it was due on {{due_date}}), with £{{amount_due}} still to pay. Please pay it by {{pay_by}}. If there's a reason it can't be paid, reply to this email so we can sort it out.",
  final:
    "Hi {{client_name}}, this is a final reminder: invoice {{invoice_number}} was due on {{due_date}} and is 30 days overdue, with £{{amount_due}} still to pay. Please pay it by {{pay_by}}. If you think something is wrong with the invoice, reply to this email straight away.",
};

export const SUBJECT: Record<ReminderKind, string> = {
  before: "payment reminder",
  due: "due today",
  after: "overdue",
  late: "two weeks overdue",
  final: "final reminder",
};

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// A reminder still goes out if the daily run missed its day, for up to
// three days (never overlapping the next one), so one failed run doesn't
// lose it for good.
const CATCH_UP_DAYS = 3;

// Which reminder, if any, is in its sending window today for an invoice
// due on dueDate. The caller skips it if it, or a later one, was sent.
export function reminderDueToday(dueDate: string, today: string): ReminderKind | null {
  for (const [i, step] of REMINDER_SCHEDULE.entries()) {
    const from = addDays(dueDate, step.days);
    const next = REMINDER_SCHEDULE[i + 1];
    const until = addDays(dueDate, next ? Math.min(next.days, step.days + CATCH_UP_DAYS) : step.days + CATCH_UP_DAYS);
    if (today >= from && today < until) return step.kind;
  }
  return null;
}

export function laterReminders(kind: ReminderKind): ReminderKind[] {
  return REMINDER_SCHEDULE.slice(REMINDER_SCHEDULE.findIndex((s) => s.kind === kind)).map((s) => s.kind);
}

// A name with a company suffix is a company; anything else is taken as a
// person, since only businesses can be charged late-payment interest.
export function looksLikeCompany(name: string): boolean {
  return /\b(ltd|limited|llp|plc|p\.l\.c\.|cic|cyf|cyfyngedig|lp|inc|gmbh|llc)\b\.?$/i.test(name.trim()) || /\b(ltd|limited)\b/i.test(name);
}

// Fixed compensation under the Late Payment of Commercial Debts
// (Interest) Act 1998, by the size of the debt.
export function lateCompensation(amount: number): number {
  return amount < 1000 ? 40 : amount < 10000 ? 70 : 100;
}

export function renderReminderTemplate(
  template: string,
  vars: { clientName: string; invoiceNumber: string; amountDue: string; dueDate: string; payBy?: string }
): string {
  return template
    .replaceAll("{{client_name}}", vars.clientName)
    .replaceAll("{{invoice_number}}", vars.invoiceNumber)
    .replaceAll("{{amount_due}}", vars.amountDue)
    .replaceAll("{{due_date}}", vars.dueDate)
    .replaceAll("{{pay_by}}", vars.payBy ?? "");
}

// The whole email body. Statutory interest is only mentioned in the final
// notice, only to a business client (the Act covers business-to-business
// debts, not consumers), and only when the owner has switched it on.
export function reminderBody({ kind, template, clientName, clientIsCompany, invoiceNumber, amountDue, dueDate, today, bank, businessName, claimInterest }: {
  kind: ReminderKind;
  template: string | null;
  clientName: string;
  clientIsCompany: boolean;
  invoiceNumber: string;
  amountDue: number;
  dueDate: string;
  today: string;
  bank: string;
  businessName: string;
  claimInterest: boolean;
}): string {
  const money = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const text = renderReminderTemplate(template || DEFAULT_REMINDER_TEXT[kind], {
    clientName,
    invoiceNumber,
    amountDue: money(amountDue),
    dueDate: longDate(dueDate),
    payBy: longDate(addDays(today, 7)),
  });
  const interest =
    kind === "final" && claimInterest && clientIsCompany
      ? `As this is a business debt, we may be entitled under the Late Payment of Commercial Debts (Interest) Act 1998 to statutory interest at 8% a year above the Bank of England base rate from the day after ${longDate(dueDate)}, and fixed compensation of £${lateCompensation(amountDue)}. We may claim these if the invoice isn't paid by ${longDate(addDays(today, 7))}.`
      : "";
  return [text, interest, bank && `How to pay:\n${bank}`, businessName].filter(Boolean).join("\n\n");
}
