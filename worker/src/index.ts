import PostalMime from "postal-mime";

export interface Env {
  APP_INGEST_URL: string;
  INBOX_WEBHOOK_SECRET: string;
}

// Matches the shape generateInboxToken() in web/src/lib/inboxToken.ts
// produces: 32 lowercase hex characters (128 bits), e.g.
// u-8f3a91c2e6b4d0a17f2c9e4b1a6d3f08@invoiceover.com. Anything that
// doesn't match this is refused at SMTP, so a sender who mistyped the
// address gets a bounce instead of believing it arrived. The
// receipts@invoiceover.com placeholder keeps its own forward-to-Gmail rule
// in Cloudflare, which is more specific and evaluated first, so it never
// reaches this Worker.
const TOKEN_PATTERN = /^u-([a-f0-9]{32})@/i;

// The app's route runs on Vercel, whose function body limit is 4.5 MB; a
// POST over that is refused before the route runs, and the whole email
// would be lost. Attachments are base64 (4/3 of their bytes) in a JSON
// body with a little text round them, so this is the most of them that
// can go in one call. A scanned PDF from a flatbed is often 3-5 MB.
const BODY_BUDGET = 4_000_000;
// The budget above counts attachments only, so the text has a cap of its own:
// a long forwarded thread or a newsletter-sized HTML body pushed the JSON past
// Vercel's limit and the whole email, invoice included, was refused. The app
// keeps 2,000 characters of it.
const TEXT_LIMIT = 10_000;

const ENTITIES: Record<string, string> = {
  nbsp: " ", pound: "£", euro: "€", lt: "<", gt: ">", apos: "'", quot: '"',
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—",
  hellip: "…", copy: "©", reg: "®", trade: "™",
};
// Outside Unicode, or a hex string too long to be one: shown as a browser
// would, rather than thrown -- a throw here lost the whole email.
const codePoint = (n: number) => (Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "�");

// Some senders' systems put out HTML with no text part at all, or a text
// part that is only whitespace. The app files an email with no usable
// attachment by its text, so without this such an email arrived as a row
// with nothing in it but the subject.
function textFromHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/?(p|div|tr|li|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// A PDF or photo that a mail gateway has labelled application/octet-stream
// is still a PDF or photo: the route keeps only the types the reader takes.
const BY_EXTENSION: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
// ALLOWED_TYPES in web/src/lib/scanExtraction.ts is the source of truth; this
// Worker cannot import from the app, so the list is repeated. Both halves are
// checked against each other by harness/test-inbox-worker-types.mjs, because a
// list that drifts here starts throwing away invoices the reader would take.
const READABLE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
// Names mail software really sends for the same five types. Without these a
// photo labelled image/jpg was reported to the owner as "not a kind that can
// be read" and never reached the reader, which would have read it.
const ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg", "image/x-png": "image/png",
  "application/x-pdf": "application/pdf", "application/acrobat": "application/pdf", "application/vnd.pdf": "application/pdf",
};
const GENERIC = ["application/octet-stream", "binary/octet-stream", "application/download", "application/force-download", "application/unknown"];
const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
// What the bytes say, for a generic label with no useful file name -- a
// scanner's "scan0001" or a gateway that strips the extension.
function sniff(b: Uint8Array): string | null {
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}
function realType(mimeType: string, filename: string | null | undefined, content?: ArrayBuffer): string {
  const type = ALIASES[mimeType] ?? mimeType;
  if (!GENERIC.includes(type)) return type;
  const ext = /\.([a-z0-9]+)$/i.exec(filename ?? "")?.[1]?.toLowerCase();
  return (ext && BY_EXTENSION[ext]) || (content && sniff(new Uint8Array(content, 0, Math.min(16, content.byteLength)))) || type;
}

// Width and height from a PNG, GIF or JPEG header, or null where it cannot be
// told. Used only on inline images, to tell a signature's logo from a
// screenshot somebody pasted into the body.
function pixelSize(buffer: ArrayBuffer): [number, number] | null {
  const b = new Uint8Array(buffer);
  const v = new DataView(buffer);
  if (b.length >= 24 && startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return [v.getUint32(16), v.getUint32(20)];
  if (b.length >= 10 && startsWith(b, [0x47, 0x49, 0x46, 0x38])) return [v.getUint16(6, true), v.getUint16(8, true)];
  if (startsWith(b, [0xff, 0xd8])) {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [v.getUint16(i + 7), v.getUint16(i + 5)];
      i += 2 + v.getUint16(i + 2);
    }
  }
  return null;
}
// A logo, a social icon or a tracking pixel. No receipt or invoice can be read
// from an image under this on its shorter side.
const ICON_PX = 120;
const isIcon = (content: ArrayBuffer) => {
  const size = pixelSize(content);
  return !!size && Math.min(...size) < ICON_PX;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// setReject is a PERMANENT SMTP error: the sending server does not retry, it
// bounces straight back to the sender with these words. So each one tells the
// sender what to do next.
const REJECT_UNKNOWN = "There is no import address here by that name. Check the address you were given and send it again.";
const REJECT_RETIRED = "This import address is no longer in use. Ask for the current address and send it again.";
const REJECT_LATER = "Could not take this document in just now. Please send it again shortly.";

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const match = TOKEN_PATTERN.exec(message.to);
    if (!match) {
      // Cloudflare's catch-all accepted this at SMTP; returning quietly lost a
      // supplier's email to a one-character typo with nobody told.
      message.setReject(REJECT_UNKNOWN);
      return;
    }
    const token = match[1].toLowerCase();
    if (!env.INBOX_WEBHOOK_SECRET || !env.APP_INGEST_URL) {
      // Without this it posted "Bearer undefined" and only learnt from the 401.
      console.error("Inbox Worker is missing INBOX_WEBHOOK_SECRET or APP_INGEST_URL");
      message.setReject(REJECT_LATER);
      return;
    }

    try {
      const rawBuffer = await new Response(message.raw).arrayBuffer();
      const parsed = await PostalMime.parse(rawBuffer);

      // An HTML signature's logo and social icons arrive in `attachments`
      // like anything else, marked inline/related, and they come FIRST in a
      // normal multipart email -- the real invoice is in a later part. The
      // app keeps the first five, so a supplier with five icons in their
      // footer had their actual invoice thrown away and five junk receipts
      // filed instead. Inline parts are only used when there is nothing
      // else, so an image pasted into the body of a message still works.
      // Only an IMAGE counts as signature junk: Apple Mail marks a PDF
      // placed in the body "inline" too, and that is the invoice.
      const usable = (parsed.attachments || []).filter((a) => a.mimeType && a.content);
      // A PDF inside multipart/related used to count as junk too, and was
      // dropped without being named anywhere.
      const isInline = (a: (typeof usable)[number]) =>
        ((a as { related?: boolean }).related === true || a.disposition === "inline") &&
        realType(a.mimeType, a.filename, a.content as ArrayBuffer).startsWith("image/");
      const readable = (a: (typeof usable)[number]) => READABLE_TYPES.includes(realType(a.mimeType, a.filename, a.content as ArrayBuffer));
      const real = usable.filter((a) => !isInline(a));
      // Prefer the non-inline parts, but only if there is something readable
      // among them: an email whose only real attachment is a .docx, with the
      // invoice pasted into the body as an image, would otherwise come out
      // with nothing. Even then a signature's logo and icons stay out: an
      // ordinary "invoice to follow" email with a logo in the footer filed
      // the logo as a receipt.
      const chosen = real.some(readable) ? real : usable.filter((a) => !isInline(a) || !isIcon(a.content as ArrayBuffer));

      const attachments: { filename: string; mimeType: string; base64: string }[] = [];
      const tooBig: string[] = [];
      const notReadable: string[] = [];
      let budget = BODY_BUDGET;
      for (const a of chosen) {
        const name = a.filename || "attachment";
        const mimeType = realType(a.mimeType, a.filename, a.content as ArrayBuffer);
        // Checked BEFORE the budget, because the route throws these away
        // anyway and they must not be allowed to spend the room a real invoice
        // needs. A 2MB terms.docx ahead of a 1.2MB invoice.pdf used to eat it:
        // the docx was posted and dropped at the far end, the PDF was pushed
        // out, and the note told the owner the PDF was too large to import --
        // which was untrue, and pointed them at the wrong file.
        if (!READABLE_TYPES.includes(mimeType)) {
          notReadable.push(name);
          continue;
        }
        const bytes = (a.content as ArrayBuffer).byteLength;
        const encoded = Math.ceil(bytes / 3) * 4;
        if (encoded > budget) {
          tooBig.push(`${name} (${(bytes / 1_048_576).toFixed(1)} MB)`);
          continue;
        }
        budget -= encoded;
        attachments.push({ filename: name, mimeType, base64: arrayBufferToBase64(a.content as ArrayBuffer) });
      }

      const text = (parsed.text?.trim() || (parsed.html ? textFromHtml(parsed.html) : "")).slice(0, TEXT_LIMIT);
      // The row the app files says what did not come with it AND why, so
      // nothing about the email is silently missing and the reason is true.
      const left = [
        tooBig.length ? `too large to send on: ${tooBig.join(", ")}` : null,
        notReadable.length ? `not a kind that can be read: ${notReadable.join(", ")}` : null,
      ].filter(Boolean);
      const textBody = left.length ? `${text}\n\n[Not attached — ${left.join("; ")}. Scan or upload these in the app.]`.trim() : text;

      const res = await fetch(env.APP_INGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.INBOX_WEBHOOK_SECRET}`,
        },
        body: JSON.stringify({
          token,
          // So the same email sent again -- a bounce after a slow read makes the
          // sender's server retry -- isn't filed twice.
          messageId: parsed.messageId || undefined,
          // The header From, not the envelope: invoicing systems send from a
          // bounce address (bounces+8f3a...@mailer.example) that names nobody.
          from: parsed.from?.address ? (parsed.from.name ? `${parsed.from.name} <${parsed.from.address}>` : parsed.from.address) : message.from,
          subject: parsed.subject || "",
          textBody,
          attachments,
        }),
      });

      if (!res.ok) {
        console.error(`Ingest failed: ${res.status} ${await res.text()}`);
        // Cloudflare accepted this message at SMTP, so the sender already
        // believes it was delivered. Returning quietly here DESTROYS the
        // document: no bounce, no retry, nothing in the app, and the only
        // trace a `wrangler tail` line nobody is watching. Rejecting hands it
        // back as a bounce, so the sender knows it did not arrive and can
        // send it again. Every reachable case is one where the document did
        // not land -- the hour's cap (429), the secret missing or rotated
        // (401, which is the state this Worker was deployed in for its first
        // evening), a Supabase blip (500), or the read running past the
        // function's time (504). A 404 is an address since replaced, where
        // "again shortly" would only bounce again.
        message.setReject(res.status === 404 ? REJECT_RETIRED : REJECT_LATER);
      }
    } catch (err) {
      // The app unreachable (fetch throws, it does not return a status), an
      // email that will not parse, a body that will not encode. All of these
      // used to be logged and swallowed, which destroyed the document exactly
      // as a quiet return on a 500 did.
      console.error("Failed to process inbound email:", err);
      message.setReject(REJECT_LATER);
    }
  },
};
