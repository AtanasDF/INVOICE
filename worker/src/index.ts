import PostalMime from "postal-mime";

export interface Env {
  APP_INGEST_URL: string;
  INBOX_WEBHOOK_SECRET: string;
}

// Matches the shape generateInboxToken() in web/src/lib/inboxToken.ts
// produces: 32 lowercase hex characters (128 bits), e.g.
// u-8f3a91c2e6b4d0a17f2c9e4b1a6d3f08@invoiceover.com. Anything that
// doesn't match this -- including the receipts@invoiceover.com
// placeholder address, which keeps its own separate forward-to-Gmail
// rule in Cloudflare and never reaches this Worker at all, since that
// rule is more specific and evaluated first -- is just dropped here.
const TOKEN_PATTERN = /^u-([a-f0-9]{32})@/i;

// The app's route runs on Vercel, whose function body limit is 4.5 MB; a
// POST over that is refused before the route runs, and the whole email
// would be lost. Attachments are base64 (4/3 of their bytes) in a JSON
// body with a little text round them, so this is the most of them that
// can go in one call. A scanned PDF from a flatbed is often 3-5 MB.
const BODY_BUDGET = 4_000_000;

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
function realType(mimeType: string, filename: string | null | undefined): string {
  if (mimeType !== "application/octet-stream") return mimeType;
  const ext = /\.([a-z0-9]+)$/i.exec(filename ?? "")?.[1]?.toLowerCase();
  return (ext && BY_EXTENSION[ext]) || mimeType;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const match = TOKEN_PATTERN.exec(message.to);
    if (!match) {
      // Not one of our per-user addresses -- nothing to do.
      return;
    }
    const token = match[1].toLowerCase();

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
      const isInline = (a: (typeof usable)[number]) =>
        (a as { related?: boolean }).related === true || (a.disposition === "inline" && a.mimeType.startsWith("image/"));
      const readable = (a: (typeof usable)[number]) => READABLE_TYPES.includes(realType(a.mimeType, a.filename));
      const real = usable.filter((a) => !isInline(a));
      // Prefer the non-inline parts, but only if there is something readable
      // among them: an email whose only real attachment is a .docx, with the
      // invoice pasted into the body as an image, would otherwise come out
      // with nothing.
      const chosen = real.some(readable) ? real : usable;

      const attachments: { filename: string; mimeType: string; base64: string }[] = [];
      const tooBig: string[] = [];
      const notReadable: string[] = [];
      let budget = BODY_BUDGET;
      for (const a of chosen) {
        const name = a.filename || "attachment";
        const mimeType = realType(a.mimeType, a.filename);
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

      const text = parsed.text?.trim() || (parsed.html ? textFromHtml(parsed.html) : "");
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
          from: message.from,
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
        // back to the sending server, which retries for days and tells the
        // sender if it never gets through. Every reachable case is one where
        // the document did not land -- the hour's cap (429), the secret
        // missing or rotated (401, which is the state this Worker was
        // deployed in for its first evening), a Supabase blip (500), or the
        // read running past the function's time (504).
        message.setReject("Could not take this document in just now. Please send it again shortly.");
      }
    } catch (err) {
      // Best-effort: a processing failure here shouldn't bounce the email
      // back to whoever sent it. Visible in `wrangler tail` / the
      // dashboard's Worker logs for debugging.
      console.error("Failed to process inbound email:", err);
    }
  },
};
