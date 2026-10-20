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
import { REPO } from "./repo.mjs";
const require = createRequire(import.meta.url);
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const worker = (await import(`${REPO}/worker/src/index.ts`)).default;
const TOKEN = "8F3A91C2E6B4D0A17F2C9E4B1A6D3F08";
const ENV = { APP_INGEST_URL: "http://app.test/api/inbox/ingest", INBOX_WEBHOOK_SECRET: "hook-secret" };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>").toString("base64");

// A pasted screenshot: a real PNG header saying 800x600. Only the header is
// read, so the rest can be anything.
const ihdr = Buffer.alloc(33);
Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(ihdr);
ihdr.writeUInt32BE(13, 8); ihdr.write("IHDR", 12); ihdr.writeUInt32BE(800, 16); ihdr.writeUInt32BE(600, 20);
const SCREENSHOT = ihdr.toString("base64");

// One call captured per email; `app` is how the app answers it.
let posted = null;
let app = { status: 200 };
globalThis.fetch = async (url, init) => {
  posted = { url, headers: init.headers, body: JSON.parse(init.body) };
  if (app.throws) throw new TypeError("fetch failed");
  return new Response("{}", { status: app.status });
};

const part = (headers, body) => [...headers, "", body].join("\r\n");
const inlineImage = (i, body = PNG) => part([`Content-Type: image/png; name="icon${i}.png"`, `Content-Disposition: inline; filename="icon${i}.png"`, `Content-ID: <icon${i}@supplier>`, "Content-Transfer-Encoding: base64"], body);
const pdfAttachment = (a) => {
  const { name, type = "application/pdf", disposition = "attachment", body = PDF } = typeof a === "string" ? { name: a } : a;
  return part([`Content-Type: ${type}; name="${name}"`, `Content-Disposition: ${disposition}; filename="${name}"`, "Content-Transfer-Encoding: base64"], body);
};
// A normal supplier email, the shape Gmail and Outlook send: multipart/mixed
// holding a multipart/alternative (the plain text, and a multipart/related
// with the HTML and its inline images) and then the real attachments.
// plain: false is the HTML-only email some invoicing systems put out.
function email({ to = `u-${TOKEN}@invoiceover.com`, icons = 0, screenshot = false, attachments = [], html = "<p>Please find the invoice attached.</p>", plain = true, text = null, from = "Accounts <ap@supplier.example>", raw = null, messageId = null } = {}) {
  if (raw) return raw;
  const related = [
    'Content-Type: multipart/related; boundary="rel"',
    "",
    "--rel",
    part(["Content-Type: text/html; charset=utf-8"], html + [...Array(icons)].map((_, i) => `<img src="cid:icon${i}@supplier">`).join("")),
    ...[...Array(icons)].flatMap((_, i) => ["--rel", inlineImage(i)]),
    ...(screenshot ? ["--rel", inlineImage("shot", SCREENSHOT)] : []),
    "--rel--",
  ].join("\r\n");
  const body = plain
    ? ['Content-Type: multipart/alternative; boundary="alt"', "", "--alt", part(["Content-Type: text/plain; charset=utf-8"], text ?? html.replace(/<[^>]+>/g, "")), "--alt", related, "--alt--"].join("\r\n")
    : related;
  return [
    `From: ${from}`,
    `To: ${to}`,
    "Subject: Invoice 1043",
    ...(messageId ? [`Message-ID: ${messageId}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="mixed"',
    "",
    "--mixed",
    body,
    ...attachments.flatMap((a) => ["--mixed", pdfAttachment(a)]),
    "--mixed--",
  ].join("\r\n");
}
let rejected = null;
async function send(opts, env = ENV) {
  posted = null;
  rejected = null;
  const raw = email(opts);
  const message = { to: opts?.to ?? `u-${TOKEN}@invoiceover.com`, from: opts?.envelope ?? "ap@supplier.example", raw: new Blob([raw]).stream(), rawSize: raw.length, setReject: (r) => { rejected = r; } };
  await worker.email(message, env);
  return posted;
}
const names = (p) => (p?.body.attachments ?? []).map((a) => a.filename);

// The Message-ID goes with the email, so the app can tell a resend from a new one.
{
  const sent = await send({ attachments: ["invoice-1043.pdf"], messageId: "<inv-1043.7f3a@mailer.supplier.example>" });
  check("the email's Message-ID is posted with it", sent?.body.messageId === "<inv-1043.7f3a@mailer.supplier.example>", JSON.stringify(sent?.body.messageId));
}

// The bug as it was: five footer icons and then the invoice.
let p = await send({ icons: 5, attachments: ["invoice-1043.pdf"] });
check("five signature icons and an invoice: only the invoice is posted", JSON.stringify(names(p)) === JSON.stringify(["invoice-1043.pdf"]), JSON.stringify(names(p)));
check("...as application/pdf with its bytes intact", p?.body.attachments[0]?.mimeType === "application/pdf" && p.body.attachments[0].base64 === PDF, JSON.stringify(p?.body.attachments[0]).slice(0, 120));
check("...to the ingest address with the shared secret", p?.url === ENV.APP_INGEST_URL && p?.headers.Authorization === `Bearer ${ENV.INBOX_WEBHOOK_SECRET}`, JSON.stringify({ url: p?.url, auth: p?.headers.Authorization }));
check("...the token lower-cased, with the sender and subject", p?.body.token === TOKEN.toLowerCase() && p?.body.from === "Accounts <ap@supplier.example>" && p?.body.subject === "Invoice 1043", JSON.stringify({ token: p?.body.token, from: p?.body.from, subject: p?.body.subject }));
check("...and the body text", /find the invoice attached/.test(p?.body.textBody ?? ""), JSON.stringify(p?.body.textBody));

p = await send({ icons: 1, attachments: ["invoice-1043.pdf", "statement.pdf"] });
check("two attachments behind a logo: both posted, the logo not", JSON.stringify(names(p)) === JSON.stringify(["invoice-1043.pdf", "statement.pdf"]), JSON.stringify(names(p)));

// A screenshot pasted into the body is inline too, and it's all there is.
p = await send({ icons: 1, screenshot: true, attachments: [], html: "<p>Receipt below</p>" });
check("an inline image with nothing else is still posted (a pasted screenshot)", JSON.stringify(names(p)) === '["iconshot.png"]' && p.body.attachments[0].mimeType === "image/png", JSON.stringify(names(p)));
check("...and the logo beside it is not", !names(p).includes("icon0.png"), JSON.stringify(names(p)));

// The commonest email there is: a line of text and a signature with a logo
// and three social icons. The icons used to be posted, read, and filed as
// four receipts.
p = await send({ icons: 4, attachments: [], html: "<p>Invoice to follow tomorrow.</p>" });
check("a signature's icons with no attachment are not posted as documents", p !== null && names(p).length === 0 && /Invoice to follow/.test(p.body.textBody), JSON.stringify(names(p)));

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
// The reason has to be TRUE as well as present. It used to say "too large to
// import by email" for everything left behind, including a perfectly
// importable PDF that a .docx ahead of it had pushed out of the body budget --
// which pointed the owner at the wrong file.
check("...and the body says which file and how big", /too large to send on: scan\.pdf \(3\.4 MB\)/.test(p?.body.textBody ?? ""), JSON.stringify(p?.body.textBody));
check("...and says it was not attached, so nothing about the email is silently missing", /Not attached/.test(p?.body.textBody ?? "") && /Scan or upload these in the app/.test(p?.body.textBody ?? ""), JSON.stringify(p?.body.textBody));
check("...so the JSON stays under Vercel's limit", JSON.stringify(p?.body ?? "").length < 4_500_000, String(JSON.stringify(p?.body ?? "").length));

p = await send({ to: "receipts@invoiceover.com", attachments: ["invoice-1043.pdf"] });
check("an address that isn't a user's token makes no call", p === null, JSON.stringify(p?.body.token ?? null));
// Cloudflare's catch-all has already accepted it; returning quietly lost it.
check("...and is refused, so the sender gets a bounce", /no import address/.test(rejected ?? ""), String(rejected));

p = await send({ to: `u-${TOKEN.slice(0, 20)}@invoiceover.com`, attachments: ["invoice-1043.pdf"] });
check("a token of the wrong length is refused too, without a call", p === null && /no import address/.test(rejected ?? ""), String(rejected));

p = await send({ attachments: ["invoice-1043.pdf"] });
check("a delivered email is not refused", p !== null && rejected === null, String(rejected));

// ---- The app not taking it ---------------------------------------------------
// setReject is a permanent SMTP error: the sender gets a bounce straight away.
for (const status of [401, 429, 500, 504]) {
  app = { status };
  await send({ attachments: ["invoice-1043.pdf"] });
  check(`the app answering ${status}: refused, asking the sender to send it again`, /send it again shortly/.test(rejected ?? ""), String(rejected));
}
app = { status: 404 };
await send({ attachments: ["invoice-1043.pdf"] });
check("an address since replaced (404) says so, rather than 'again shortly'", /no longer in use/.test(rejected ?? ""), String(rejected));
// fetch THROWS when the app cannot be reached at all; the catch used to log it
// and return, which destroyed the document.
app = { throws: true };
p = await send({ attachments: ["invoice-1043.pdf"] });
check("the app unreachable (fetch throws): refused, not swallowed", p !== null && /send it again shortly/.test(rejected ?? ""), String(rejected));
app = { status: 200 };

p = await send({ attachments: ["invoice-1043.pdf"] }, { APP_INGEST_URL: ENV.APP_INGEST_URL });
check("no secret configured: refused without posting 'Bearer undefined'", p === null && /send it again shortly/.test(rejected ?? ""), JSON.stringify({ posted: p?.headers ?? null, rejected }));

// ---- The size of what is posted ----------------------------------------------
// The attachment budget never counted the text, so a long body beside a
// 3 MB scan took the JSON past Vercel's 4.5 MB and the whole email was refused.
const longText = "Earlier in this thread. ".repeat(80_000);
p = await send({ attachments: [{ name: "scan.pdf", body: Buffer.alloc(2_900_000, 1).toString("base64") }], text: longText });
check("a very long body is cut down, and the scan beside it still goes", JSON.stringify(names(p)) === '["scan.pdf"]' && p.body.textBody.length <= 10_000, JSON.stringify({ names: names(p), text: p?.body.textBody.length }));
check("...so the JSON stays under Vercel's limit", JSON.stringify(p?.body ?? "").length < 4_500_000, String(JSON.stringify(p?.body ?? "").length));

// ---- What a part is called and what it is -------------------------------------
p = await send({ attachments: [{ name: "receipt.jpg", type: "image/jpg", body: "/9j/4AAQSkZJRgABAQ==" }, { name: "inv.pdf", type: "application/x-pdf" }] });
check("image/jpg and application/x-pdf are read as the types they are", JSON.stringify(p?.body.attachments.map((a) => a.mimeType)) === '["image/jpeg","application/pdf"]' && !/Not attached/.test(p?.body.textBody ?? ""), JSON.stringify({ types: p?.body.attachments.map((a) => a.mimeType), text: p?.body.textBody }));

p = await send({ attachments: [{ name: "scan0001", type: "application/octet-stream" }] });
check("an octet-stream with no extension is recognised by its bytes", p?.body.attachments[0]?.mimeType === "application/pdf", JSON.stringify(p?.body.attachments[0]?.mimeType));
p = await send({ attachments: [{ name: "data.bin", type: "application/octet-stream", body: Buffer.from("not a document at all").toString("base64") }] });
check("...and one whose bytes are nothing readable is still named as unreadable", names(p).length === 0 && /not a kind that can be read: data\.bin/.test(p?.body.textBody ?? ""), JSON.stringify(p?.body.textBody));

// A PDF inside multipart/related was treated as signature junk and dropped
// without a word when another attachment came with it.
const relatedPdf = [
  "From: Accounts <ap@supplier.example>", `To: u-${TOKEN}@invoiceover.com`, "Subject: Two invoices", "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="mixed"', "", "--mixed",
  'Content-Type: multipart/related; boundary="rel"', "", "--rel", part(["Content-Type: text/html"], "<p>Two attached</p>"),
  "--rel", pdfAttachment({ name: "first.pdf", disposition: "inline" }).replace("Content-Transfer-Encoding", "Content-ID: <first@supplier>\r\nContent-Transfer-Encoding"), "--rel--",
  "--mixed", pdfAttachment("second.pdf"), "--mixed--",
].join("\r\n");
p = await send({ raw: relatedPdf });
check("a PDF inside multipart/related is posted beside the other attachment", JSON.stringify(names(p)) === '["first.pdf","second.pdf"]', JSON.stringify(names(p)));

// A forwarded email (message/rfc822) carries its invoice inside it.
const forwarded = [
  "From: Atanas <a@hidefield.example>", `To: u-${TOKEN}@invoiceover.com`, "Subject: Fwd: Invoice 9", "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="outer"', "", "--outer", part(["Content-Type: text/plain"], "See below"),
  "--outer", "Content-Type: message/rfc822", "",
  ["From: Supplier <s@x.example>", "Subject: Invoice 9", "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="inner"', "", "--inner", part(["Content-Type: text/plain"], "attached"), "--inner", pdfAttachment("inv-9.pdf"), "--inner--"].join("\r\n"),
  "--outer--",
].join("\r\n");
p = await send({ raw: forwarded });
check("a forwarded email's attachment is posted", JSON.stringify(names(p)) === '["inv-9.pdf"]', JSON.stringify(names(p)));

// Not UTF-8: Latin-1 and Windows-1250 encoded words, and a charset nobody knows.
const latin = ["From: =?iso-8859-2?Q?Bia=B3ek?= <b@x.example>", `To: u-${TOKEN}@invoiceover.com`, "Subject: =?iso-8859-1?Q?Facture_r=E9gl=E9e_=A3120?= =?x-nobody?Q?ok?=", "MIME-Version: 1.0", "Content-Type: text/plain; charset=windows-1250", "Content-Transfer-Encoding: quoted-printable", "", "Za=B3=B9czam faktur=EA"].join("\r\n");
p = await send({ raw: latin });
check("a non-UTF-8 subject, sender and body are decoded, an unknown charset does not throw", p?.body.subject === "Facture réglée £120ok" && p?.body.from === "Białek <b@x.example>" && p?.body.textBody === "Załączam fakturę" && rejected === null, JSON.stringify({ s: p?.body.subject, f: p?.body.from, t: p?.body.textBody, rejected }));

// The envelope sender of an invoicing system is a bounce address.
p = await send({ envelope: "bounces+8f3a@mailer.example", attachments: ["invoice-1043.pdf"] });
check("the header From is posted, not the envelope's bounce address", p?.body.from === "Accounts <ap@supplier.example>", JSON.stringify(p?.body.from));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
