// The email a customer receives with an invoice attached. Every value in
// it comes from the sender's form, so all of it is escaped; the layout is
// fixed so the route can't be used to send arbitrary content.

export type InvoiceEmailInput = {
  issuerName: string;
  issuerEmail: string | null;
  customerName: string;
  number: string;
  total: string;
  dueDate: string;
  message: string;
  bank: [string, string][];
  // A quote reads as a quote: no "amount due", "valid until" instead of
  // "due", and no payment details.
  docType: "invoice" | "quote";
  // The invoice's private online link, checked by the route to be this
  // app's own /i/ page; "" when there is none.
  viewUrl: string;
};

const word = (i: InvoiceEmailInput) => (i.docType === "quote" ? "quote" : "invoice");
const Word = (i: InvoiceEmailInput) => (i.docType === "quote" ? "Quote" : "Invoice");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function invoiceEmailSubject(i: InvoiceEmailInput): string {
  return `${Word(i)}${i.number ? ` ${i.number}` : ""} from ${i.issuerName}`;
}

export function invoiceEmailText(i: InvoiceEmailInput): string {
  return [
    `Hi${i.customerName ? ` ${i.customerName}` : ""},`,
    "",
    i.message ||
      `Please find attached ${word(i)}${i.number ? ` ${i.number}` : ""} for ${i.total}${i.dueDate ? `, ${i.docType === "quote" ? "valid until" : "due"} ${i.dueDate}` : ""}.`,
    "",
    ...(i.viewUrl ? [`${i.docType === "quote" ? "View and accept it online" : "View it online"}: ${i.viewUrl}`, ""] : []),
    ...(i.bank.length ? ["Payment details:", ...i.bank.map(([k, v]) => `${k}: ${v}`), ""] : []),
    "Thank you,",
    i.issuerName,
    ...(i.issuerEmail ? [i.issuerEmail] : []),
  ].join("\n");
}

export function invoiceEmailHtml(i: InvoiceEmailInput): string {
  const row = (k: string, v: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#737373;font-size:14px">${esc(k)}</td><td style="padding:6px 0;text-align:right;font-size:14px;${strong ? "font-weight:700;color:#171717" : "color:#171717"}">${esc(v)}</td></tr>`;
  const intro = i.message
    ? esc(i.message).replace(/\n/g, "<br>")
    : `Please find attached ${word(i)}${i.number ? ` <strong>${esc(i.number)}</strong>` : ""}. The details are below.`;
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e5e5;border-radius:14px">
<tr><td style="padding:28px 28px 8px">
<p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#737373">${Word(i)}${i.number ? ` ${esc(i.number)}` : ""}</p>
<p style="margin:6px 0 0;font-size:22px;font-weight:700">${esc(i.issuerName)}</p>
</td></tr>
<tr><td style="padding:16px 28px 4px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">Hi${i.customerName ? ` ${esc(i.customerName)}` : ""},</p>
<p style="margin:0">${intro}</p>
</td></tr>
<tr><td style="padding:16px 28px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5">
${i.number ? row(Word(i), i.number) : ""}${i.dueDate ? row(i.docType === "quote" ? "Valid until" : "Due", i.dueDate) : ""}${row(i.docType === "quote" ? "Total" : "Amount due", i.total, true)}
</table>
</td></tr>
${i.viewUrl ? `<tr><td style="padding:18px 28px 0"><a href="${esc(i.viewUrl)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">${i.docType === "quote" ? "View and accept online" : `View ${word(i)} online`}</a></td></tr>` : ""}
${i.bank.length ? `<tr><td style="padding:18px 28px 0"><p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#737373">Payment details</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${i.bank.map(([k, v]) => row(k, v)).join("")}</table></td></tr>` : ""}
<tr><td style="padding:22px 28px 28px;font-size:14px;color:#525252">The ${word(i)} is attached as a PDF.${i.issuerEmail ? ` Reply to this email to reach ${esc(i.issuerName)}.` : ""}</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#a3a3a3">Sent with Invoicer</p>
</td></tr></table></body></html>`;
}
