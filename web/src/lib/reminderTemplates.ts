export type ReminderKind = "before" | "due" | "after";

// Shown in Settings as placeholder text and used as the actual wording
// whenever the account hasn't typed an override.
export const DEFAULT_REMINDER_TEXT: Record<ReminderKind, string> = {
  before: "Hi {{client_name}}, just a reminder that invoice {{invoice_number}} for £{{amount_due}} is due on {{due_date}}.",
  due: "Hi {{client_name}}, invoice {{invoice_number}} for £{{amount_due}} is due today.",
  after:
    "Hi {{client_name}}, invoice {{invoice_number}} for £{{amount_due}} was due on {{due_date}} and still appears to be outstanding. Please let us know if you have any questions.",
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
