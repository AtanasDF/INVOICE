// The email a supplier gets asking them to price a list. Built on the server
// from the saved request, so nothing in it comes from the browser; every
// value is escaped and the layout is fixed.
import { SITE_NAME } from "@/lib/siteName";

export type QuoteRequestEmailInput = {
  issuerName: string;
  supplierName: string;
  title: string;
  items: { description: string; quantity: number; unit: string; note: string }[];
  neededBy: string;
  siteAddress: string;
  notes: string;
  // This app's own /r/<token> page for this supplier.
  link: string;
  replyTo: string | null;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));

export function quoteRequestEmailSubject(i: QuoteRequestEmailInput): string {
  return `Quote request from ${i.issuerName}: ${i.title}`;
}

export function quoteRequestEmailText(i: QuoteRequestEmailInput): string {
  return [
    `Hi${i.supplierName ? ` ${i.supplierName}` : ""},`,
    "",
    `${i.issuerName} would like a price for the following:`,
    "",
    ...i.items.map((it) => `- ${qty(it.quantity)}${it.unit ? ` ${it.unit}` : ""} × ${it.description}${it.note ? ` (${it.note})` : ""}`),
    "",
    ...(i.neededBy ? [`Needed by: ${i.neededBy}`] : []),
    ...(i.siteAddress ? [`Deliver to: ${i.siteAddress.replace(/\s*\n\s*/g, ", ")}`] : []),
    ...(i.notes ? ["", i.notes] : []),
    "",
    `Type your prices in here: ${i.link}`,
    "Or reply to this email with your quote.",
    "",
    "Thank you,",
    i.issuerName,
    ...(i.replyTo ? [i.replyTo] : []),
  ].join("\n");
}

export function quoteRequestEmailHtml(i: QuoteRequestEmailInput): string {
  const cell = "padding:8px 0;border-bottom:1px solid #e5e5e5;font-size:14px;vertical-align:top";
  const rows = i.items
    .map(
      (it) =>
        `<tr><td style="${cell};white-space:nowrap;padding-right:12px;color:#525252">${esc(qty(it.quantity))}${it.unit ? ` ${esc(it.unit)}` : ""}</td><td style="${cell};color:#171717">${esc(it.description)}${it.note ? `<br><span style="color:#737373;font-size:13px">${esc(it.note)}</span>` : ""}</td></tr>`
    )
    .join("");
  const fact = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#737373;font-size:14px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;font-size:14px;color:#171717">${esc(v).replace(/\n/g, "<br>")}</td></tr>`;
  const facts = [i.neededBy ? fact("Needed by", i.neededBy) : "", i.siteAddress ? fact("Deliver to", i.siteAddress) : ""].join("");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e5e5;border-radius:14px">
<tr><td style="padding:28px 28px 8px">
<p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#737373">Quote request</p>
<p style="margin:6px 0 0;font-size:22px;font-weight:700">${esc(i.title)}</p>
<p style="margin:4px 0 0;font-size:14px;color:#525252">from ${esc(i.issuerName)}</p>
</td></tr>
<tr><td style="padding:16px 28px 4px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">Hi${i.supplierName ? ` ${esc(i.supplierName)}` : ""},</p>
<p style="margin:0">${esc(i.issuerName)} would like a price for the following.</p>
</td></tr>
<tr><td style="padding:12px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e5e5">${rows}</table></td></tr>
${facts ? `<tr><td style="padding:14px 28px 0"><table role="presentation" cellpadding="0" cellspacing="0">${facts}</table></td></tr>` : ""}
${i.notes ? `<tr><td style="padding:12px 28px 0;font-size:14px;line-height:1.5;color:#404040">${esc(i.notes).replace(/\n/g, "<br>")}</td></tr>` : ""}
<tr><td style="padding:20px 28px 0"><a href="${esc(i.link)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">Type your prices in</a></td></tr>
<tr><td style="padding:18px 28px 28px;font-size:14px;color:#525252">Or reply to this email with your quote${i.replyTo ? ` to reach ${esc(i.issuerName)}` : ""}.</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#a3a3a3">Sent with ${SITE_NAME}</p>
</td></tr></table></body></html>`;
}
