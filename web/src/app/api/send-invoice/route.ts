import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { addressKey, allow } from "@/lib/rateLimit";
import { InvoiceEmailInput, invoiceEmailHtml, invoiceEmailSubject, invoiceEmailText } from "@/lib/invoiceEmail";

export const runtime = "nodejs";
export const maxDuration = 30;

const HOUR = 60 * 60 * 1000;
const ANON_PER_HOUR = 3;
const USER_PER_HOUR = 30;
const GLOBAL_PER_HOUR = 60;
// Vercel caps the request body at 4.5MB; the PDF arrives base64-encoded.
const MAX_PDF_CHARS = 4_000_000;
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const DEFAULT_FROM = "Invoicer <onboarding@resend.dev>";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Public, like the free invoice page it serves: the layout is fixed, every
// field is escaped, the only attachment is a PDF, and anonymous senders
// get three a hour. Replies go to the sender's own address.
export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Email sending isn't switched on yet.", code: "not_configured" }, { status: 503 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = token ? await auth.auth.getUser(token) : { data: { user: null } };

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const to = text(body.to, 254).toLowerCase();
  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: "Enter a valid email address to send to." }, { status: 400 });
  const issuerEmail = text(body.issuerEmail, 254).toLowerCase();
  const replyTo = EMAIL_RE.test(issuerEmail) ? issuerEmail : null;
  const copyToSelf = body.copyToSelf === true && !!replyTo && replyTo !== to;

  const issuerName = text(body.issuerName, 120);
  if (!issuerName) return NextResponse.json({ error: "Add your business name before sending." }, { status: 400 });

  const pdf = typeof body.pdf === "string" ? body.pdf : "";
  if (!pdf || pdf.length > MAX_PDF_CHARS) {
    return NextResponse.json({ error: "The invoice PDF is missing or too large to email." }, { status: 400 });
  }
  if (!Buffer.from(pdf.slice(0, 16), "base64").toString("latin1").startsWith("%PDF-")) {
    return NextResponse.json({ error: "The attachment must be the invoice PDF." }, { status: 400 });
  }

  const bank = Array.isArray(body.bank)
    ? body.bank
        .filter((r): r is [string, string] => Array.isArray(r) && r.length === 2 && typeof r[0] === "string" && typeof r[1] === "string")
        .slice(0, 6)
        .map(([k, v]) => [k.slice(0, 40), v.slice(0, 80)] as [string, string])
    : [];
  const input: InvoiceEmailInput = {
    issuerName,
    issuerEmail: replyTo,
    customerName: text(body.customerName, 120),
    number: text(body.number, 60),
    total: text(body.total, 40),
    dueDate: text(body.dueDate, 40),
    message: text(body.message, 2000),
    bank,
  };

  const key = user ? `send:user:${user.id}` : `send:ip:${addressKey(req.headers.get("x-forwarded-for"))}`;
  if (!allow(key, user ? USER_PER_HOUR : ANON_PER_HOUR, HOUR)) {
    return NextResponse.json(
      { error: user ? "Too many emails this hour. Try again later." : "Too many emails from this connection. Try again in an hour, or sign up." },
      { status: 429 }
    );
  }
  if (!allow("send:global", GLOBAL_PER_HOUR, HOUR)) {
    return NextResponse.json({ error: "Sending is busy right now. Try again in a little while." }, { status: 429 });
  }

  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const fromAddress = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const filename = `Invoice${input.number ? `-${input.number.replace(/[^\w.-]+/g, "-")}` : ""}.pdf`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${issuerName.replace(/["<>]/g, "")} via Invoicer <${fromAddress}>`,
      to: [to],
      ...(copyToSelf ? { cc: [replyTo] } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: invoiceEmailSubject(input),
      html: invoiceEmailHtml(input),
      text: invoiceEmailText(input),
      attachments: [{ filename, content: pdf }],
    }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    console.error("send-invoice: Resend", res.status, detail?.message);
    const message =
      res.status === 403 && /domain|testing emails/i.test(detail?.message ?? "")
        ? "Email sending is still in test mode: it can only send to the account owner's address until the sending domain is verified."
        : "The email couldn't be sent. Try again in a minute.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  return NextResponse.json({ sent: true, to, copied: copyToSelf });
}
