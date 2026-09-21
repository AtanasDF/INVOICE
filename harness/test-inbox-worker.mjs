// The email Worker (worker/src/index.ts), run in Node with fetch stubbed:
// what it posts to /api/inbox/ingest for a real supplier email.
//
// The case that matters: an HTML signature's logo and social icons arrive
// as inline/related image parts, and they come FIRST in a multipart email.
// The app keeps five attachments, so a supplier with five icons in their
// footer had their invoice thrown away and five junk receipts filed
// instead. Inline parts must be dropped when there is a real attachment,
// and used only when there is nothing else (a screenshot pasted into the
// body is still a document).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const worker = (await import("/Users/nasko/Desktop/INVOICE/worker/src/index.ts")).default;
const TOKEN = "8F3A91C2E6B4D0A17F2C9E4B1A6D3F08";
const ENV = { APP_INGEST_URL: "http://app.test/api/inbox/ingest", INBOX_WEBHOOK_SECRET: "hook-secret" };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>").toString("base64");

// One call captured per email.
let posted = null;
globalThis.fetch = async (url, init) => { posted = { url, headers: init.headers, body: JSON.parse(init.body) }; return new Response("{}", { status: 200 }); };

const part = (headers, body) => [...headers, "", body].join("\r\n");
const inlineImage = (i) => part([`Content-Type: image/png; name="icon${i}.png"`, `Content-Disposition: inline; filename="icon${i}.png"`, `Content-ID: <icon${i}@supplier>`, "Content-Transfer-Encoding: base64"], PNG);
const pdfAttachment = (a) => {
  const { name, type = "application/pdf", disposition = "attachment", body = PDF } = typeof a === "string" ? { name: a } : a;
  return part([`Content-Type: ${type}; name="${name}"`, `Content-Disposition: ${disposition}; filename="${name}"`, "Content-Transfer-Encoding: base64"], body);
};
// A normal supplier email, the shape Gmail and Outlook send: multipart/mixed
// holding a multipart/alternative (the plain text, and a multipart/related
// with the HTML and its inline images) and then the real attachments.
// plain: false is the HTML-only email some invoicing systems put out.
function email({ to = `u-${TOKEN}@invoiceover.com`, icons = 0, attachments = [], html = "<p>Please find the invoice attached.</p>", plain = true, text = null } = {}) {
  const related = [
    'Content-Type: multipart/related; boundary="rel"',
    "",
    "--rel",
    part(["Content-Type: text/html; charset=utf-8"], html + [...Array(icons)].map((_, i) => `<img src="cid:icon${i}@supplier">`).join("")),
    ...[...Array(icons)].flatMap((_, i) => ["--rel", inlineImage(i)]),
    "--rel--",
  ].join("\r\n");
  const body = plain
    ? ['Content-Type: multipart/alternative; boundary="alt"', "", "--alt", part(["Content-Type: text/plain; charset=utf-8"], text ?? html.replace(/<[^>]+>/g, "")), "--alt", related, "--alt--"].join("\r\n")
    : related;
  return [
    "From: Accounts <ap@supplier.example>",
    `To: ${to}`,
    "Subject: Invoice 1043",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="mixed"',
    "",
    "--mixed",
    body,
    ...attachments.flatMap((a) => ["--mixed", pdfAttachment(a)]),
    "--mixed--",
  ].join("\r\n");
}
async function send(opts) {
  posted = null;
  await worker.email({ to: opts?.to ?? `u-${TOKEN}@invoiceover.com`, from: "ap@supplier.example", raw: email(opts) }, ENV);
  return posted;
}
const names = (p) => (p?.body.attachments ?? []).map((a) => a.filename);

// The bug as it was: five footer icons and then the invoice.
let p = await send({ icons: 5, attachments: ["invoice-1043.pdf"] });
check("five signature icons and an invoice: only the invoice is posted", JSON.stringify(names(p)) === JSON.stringify(["invoice-1043.pdf"]), JSON.stringify(names(p)));
check("...as application/pdf with its bytes intact", p?.body.attachments[0]?.mimeType === "application/pdf" && p.body.attachments[0].base64 === PDF, JSON.stringify(p?.body.attachments[0]).slice(0, 120));
check("...to the ingest address with the shared secret", p?.url === ENV.APP_INGEST_URL && p?.headers.Authorization === `Bearer ${ENV.INBOX_WEBHOOK_SECRET}`, JSON.stringify({ url: p?.url, auth: p?.headers.Authorization }));
check("...the token lower-cased, with the sender and subject", p?.body.token === TOKEN.toLowerCase() && p?.body.from === "ap@supplier.example" && p?.body.subject === "Invoice 1043", JSON.stringify({ token: p?.body.token, from: p?.body.from, subject: p?.body.subject }));
check("...and the body text", /find the invoice attached/.test(p?.body.textBody ?? ""), JSON.stringify(p?.body.textBody));

p = await send({ icons: 1, attachments: ["invoice-1043.pdf", "statement.pdf"] });
check("two attachments behind a logo: both posted, the logo not", JSON.stringify(names(p)) === JSON.stringify(["invoice-1043.pdf", "statement.pdf"]), JSON.stringify(names(p)));

// A screenshot pasted into the body is inline too, and it's all there is.
p = await send({ icons: 1, attachments: [], html: "<p>Receipt below</p>" });
check("an inline image with nothing else is still posted (a pasted screenshot)", names(p).length === 1 && p.body.attachments[0].mimeType === "image/png", JSON.stringify(names(p)));

p = await send({ icons: 0, attachments: [] });
check("a bare email posts with no attachments, so the app can file the email itself", p !== null && names(p).length === 0, JSON.stringify(p?.body ?? null));

// An HTML-only email (no text part) used to post an empty body, so the
// row the app files for it held nothing but the subject.
p = await send({ icons: 0, attachments: [], plain: false, html: "<div style=\"font:12px Arial\">Hi Atanas,<br>Total due: &pound;120.00 &amp; VAT<p>Thanks</p></div><style>p{color:red}</style>" });
check("an HTML-only email still posts its text, tags and styles stripped", /Hi Atanas,\nTotal due: £120.00 & VAT\nThanks/.test(p?.body.textBody ?? "") && !/<|style|color/.test(p?.body.textBody ?? ""), JSON.stringify(p?.body.textBody));

// A blank text part (a single space, which some invoicing systems send to
// satisfy clients that demand one) used to count as text and keep the HTML
// fallback from running.
p = await send({ icons: 0, attachments: [], text: " \r\n", html: "<p>Total due &pound;120.00</p>" });
check("a whitespace-only text part still falls back to the HTML's text", p?.body.textBody === "Total due £120.00", JSON.stringify(p?.body.textBody));

// Outlook and Word write apostrophes and dashes as named entities.
p = await send({ icons: 0, attachments: [], plain: false, html: "<p>Brightwork&rsquo;s invoice &ndash; due 28/09 &hellip; &copy; 2026</p>" });
check("named entities from Outlook are decoded", p?.body.textBody === "Brightwork\u2019s invoice \u2013 due 28/09 \u2026 \u00a9 2026", JSON.stringify(p?.body.textBody));

// A malformed numeric entity used to throw inside the Worker's try, and the
// whole email -- attachments included -- was lost.
p = await send({ icons: 0, attachments: ["invoice-1043.pdf"], plain: false, html: "<p>Ref &#99999999; and &#x110000; ok</p>" });
check("an out-of-range entity is shown as a replacement character, not thrown", p !== null && p.body.textBody === "Ref \ufffd and \ufffd ok" && names(p).length === 1, JSON.stringify(p?.body.textBody));

// Apple Mail puts a PDF dragged into the body in as "inline", with no
// related wrapper: it is the invoice, not signature junk.
p = await send({ icons: 2, attachments: [{ name: "invoice-1043.pdf", disposition: "inline" }] });
check("an inline-disposition PDF (Apple Mail) is the attachment, and the icons are still dropped", JSON.stringify(names(p)) === JSON.stringify(["invoice-1043.pdf"]), JSON.stringify(names(p)));

// A gateway that labels a PDF application/octet-stream.
p = await send({ attachments: [{ name: "invoice-1043.pdf", type: "application/octet-stream" }] });
check("an octet-stream PDF is posted as application/pdf, by its name", p?.body.attachments[0]?.mimeType === "application/pdf", JSON.stringify(p?.body.attachments[0]?.mimeType));

// Vercel refuses a body over 4.5 MB before the route runs, so a 4 MB scan
// used to take the whole email with it: nothing filed, nothing logged but
// a line in wrangler tail. Now it is left out and the row says so.
const BIG = Buffer.alloc(3_600_000, 1).toString("base64");
p = await send({ attachments: [{ name: "scan.pdf", body: BIG }, "invoice-1043.pdf"] });
check("an attachment too big for the route is left out, the rest still posted", JSON.stringify(names(p)) === JSON.stringify(["invoice-1043.pdf"]), JSON.stringify(names(p)));
check("...and the body says which file and how big", /Too large to import by email, not attached: scan\.pdf \(3\.4 MB\)/.test(p?.body.textBody ?? ""), JSON.stringify(p?.body.textBody));
check("...so the JSON stays under Vercel's limit", JSON.stringify(p?.body ?? "").length < 4_500_000, String(JSON.stringify(p?.body ?? "").length));

p = await send({ to: "receipts@invoiceover.com", attachments: ["invoice-1043.pdf"] });
check("an address that isn't a user's token is dropped without a call", p === null, JSON.stringify(p?.body.token ?? null));

p = await send({ to: `u-${TOKEN.slice(0, 20)}@invoiceover.com`, attachments: ["invoice-1043.pdf"] });
check("a token of the wrong length is dropped too", p === null, JSON.stringify(p?.body.token ?? null));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
