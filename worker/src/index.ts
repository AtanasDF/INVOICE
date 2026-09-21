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

// Some senders' systems put out HTML with no text part at all. The app
// files an email with no usable attachment by its text, so without this
// such an email arrived as a row with nothing in it but the subject.
function textFromHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/?(p|div|tr|li|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&pound;/g, "£")
    .replace(/&euro;/g, "€")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
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
      const usable = (parsed.attachments || []).filter((a) => a.mimeType && a.content);
      const isInline = (a: (typeof usable)[number]) => a.disposition === "inline" || (a as { related?: boolean }).related === true;
      const real = usable.filter((a) => !isInline(a));
      const attachments = (real.length ? real : usable).map((a) => ({
        filename: a.filename || "attachment",
        mimeType: a.mimeType,
        base64: arrayBufferToBase64(a.content as ArrayBuffer),
      }));

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
          textBody: parsed.text || (parsed.html ? textFromHtml(parsed.html) : ""),
          attachments,
        }),
      });

      if (!res.ok) {
        console.error(`Ingest failed: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      // Best-effort: a processing failure here shouldn't bounce the email
      // back to whoever sent it. Visible in `wrangler tail` / the
      // dashboard's Worker logs for debugging.
      console.error("Failed to process inbound email:", err);
    }
  },
};
