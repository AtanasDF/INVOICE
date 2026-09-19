export type ReminderKind = "before" | "due" | "after";

// Shown in Settings as placeholder text and used as the actual wording
// whenever the account hasn't typed an override.
export const DEFAULT_REMINDER_TEXT: Record<ReminderKind, string> = {
  before: "Hi {{client_name}}, just a friendly reminder that invoice {{invoice_number}} for £{{amount_due}} is due on {{due_date}}. Thank you.",
  due: "Hi {{client_name}}, invoice {{invoice_number}} for £{{amount_due}} is due for payment today. If it's already on its way, thank you and please ignore this.",
  after:
    "Hi {{client_name}}, invoice {{invoice_number}} for £{{amount_due}} was due on {{due_date}} and is now overdue. Please arrange payment within the next 7 days, or reply to this email if there's a problem with it.",
};

export function renderReminderTemplate(
  template: string,
  vars: { clientName: string; invoiceNumber: string; amountDue: string; dueDate: string }
): string {
  return template
    .replaceAll("{{client_name}}", vars.clientName)
    .replaceAll("{{invoice_number}}", vars.invoiceNumber)
    .replaceAll("{{amount_due}}", vars.amountDue)
    .replaceAll("{{due_date}}", vars.dueDate);
}
