import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { allow, release } from "@/lib/rateLimit";
import { InvoiceEmailInput, invoiceEmailHtml, invoiceEmailSubject, invoiceEmailText } from "@/lib/invoiceEmail";

export const runtime = "nodejs";
export const maxDuration = 30;

const HOUR = 60 * 60 * 1000;
const USER_PER_HOUR = 30;
const USER_PER_DAY = 100;
const DAY = 24 * HOUR;
const GLOBAL_PER_HOUR = 60;
// Vercel caps the request body at 4.5MB; the PDF arrives base64-encoded.
const MAX_PDF_CHARS = 4_000_000;
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
// The app's own domain, the one payment reminders send from too; it has to
// be verified in Resend before anything is delivered.
const DEFAULT_FROM = "Invoicer <invoices@invoiceover.com>";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// Single-line fields end up in the subject and sender name.
const line = (v: unknown, max: number) => text(typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ") : v, max);

// Signed-in only: an open route would let anyone send an invoice-shaped
// email (any name, any bank details) from the app's domain. The layout is
// fixed, every field is escaped, the only attachment is a PDF, and the
// copy-to-self goes to the account's own address, never one from the form.
// Only this app's own invoice links (/i/<token>) go into an email, rebuilt
// from their parts, so the route can't be used to carry any other URL.
function ownInvoiceLink(value: unknown, origin: string): string {
  if (typeof value !== "string") return "";
  try {
    const u = new URL(value);
    return u.origin === origin && /^\/i\/[A-Za-z0-9_-]{43,}$/.test(u.pathname) && !u.search && !u.hash ? origin + u.pathname : "";
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Email sending isn't switched on yet.", code: "not_configured" }, { status: 503 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = token ? await auth.auth.getUser(token) : { data: { user: null } };
  if (!user) return NextResponse.json({ error: "Sign in to send invoices by email.", code: "sign_in" }, { status: 401 });
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "Confirm your email address first (check your inbox for the sign-up link), then send." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const to = text(body.to, 254).toLowerCase();
  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: "Enter a valid email address to send to." }, { status: 400 });
  // Replies only ever go to the account's own, confirmed address: an email
  // typed on the invoice is unproven, and letting it be the reply-to would
  // let anyone put someone else's (or a fraudster's) address behind the
  // app's domain.
  const accountEmail = user.email?.toLowerCase() ?? null;
  const replyTo = accountEmail;
  const copyToSelf = body.copyToSelf === true && !!accountEmail && accountEmail !== to;

  const issuerName = line(body.issuerName, 120);
  if (!issuerName) return NextResponse.json({ error: "Add your business name before sending." }, { status: 400 });

  const pdf = typeof body.pdf === "string" ? body.pdf : "";
  if (!pdf || pdf.length > MAX_PDF_CHARS) {
    return NextResponse.json({ error: "The invoice PDF is missing or too large to email." }, { status: 400 });
  }
  const pdfBytes = Buffer.from(pdf, "base64");
  if (!pdfBytes.subarray(0, 5).toString("latin1").startsWith("%PDF-") || !pdfBytes.subarray(-1024).toString("latin1").includes("%%EOF")) {
    return NextResponse.json({ error: "The attachment must be the invoice PDF." }, { status: 400 });
  }

  const bank = Array.isArray(body.bank)
    ? body.bank
        .filter((r): r is [string, string] => Array.isArray(r) && r.length === 2 && typeof r[0] === "string" && typeof r[1] === "string")
        .slice(0, 6)
        .map(([k, v]) => [line(k, 40), line(v, 80)] as [string, string])
    : [];
  const input: InvoiceEmailInput = {
    issuerName,
    issuerEmail: replyTo,
    customerName: line(body.customerName, 120),
    number: line(body.number, 60),
    total: line(body.total, 40),
    dueDate: line(body.dueDate, 40),
    message: text(body.message, 2000),
    bank: body.docType === "quote" ? [] : bank,
    docType: body.docType === "quote" ? "quote" : "invoice",
    viewUrl: ownInvoiceLink(body.viewUrl, new URL(req.url).origin),
  };

  const key = `send:user:${user.id}`;
  // Hour, then overall, then day: a request refused by one limit gives
  // back what it took from the ones before, so waiting out the hourly limit
  // never uses up the day. Sends that reach Resend count, failed or not.
  if (!allow(key, USER_PER_HOUR, HOUR)) {
    return NextResponse.json({ error: "Too many emails this hour. Try again later." }, { status: 429 });
  }
  if (!allow("send:global", GLOBAL_PER_HOUR, HOUR)) {
    release(key);
    return NextResponse.json({ error: "Sending is busy right now. Try again in a little while." }, { status: 429 });
  }
  if (!allow(`${key}:day`, USER_PER_DAY, DAY)) {
    release(key);
    release("send:global");
    return NextResponse.json({ error: "That's the most emails for today. Try again tomorrow." }, { status: 429 });
  }

  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const fromAddress = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const filename = `${input.docType === "quote" ? "Quote" : "Invoice"}${input.number ? `-${input.number.replace(/[^\w.-]+/g, "-")}` : ""}.pdf`;
  // Quoted, and stripped of anything that could end the header or the quote.
  const fromName = `${issuerName.replace(/["<>\\\r\n]/g, "").trim()} via Invoicer`;
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `"${fromName}" <${fromAddress}>`,
        to: [to],
        ...(copyToSelf ? { cc: [accountEmail] } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: invoiceEmailSubject(input),
        html: invoiceEmailHtml(input),
        text: invoiceEmailText(input),
        attachments: [{ filename, content: pdf }],
      }),
    });
  } catch (err) {
    console.error("send-invoice: Resend unreachable", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The email couldn't be sent. Try again in a minute." }, { status: 502 });
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    console.error("send-invoice: Resend", res.status, detail?.message);
    const message =
      res.status === 403 && /domain|testing emails/i.test(detail?.message ?? "")
        ? "Email sending is still in test mode: it can only send to the account owner's address until the sending domain is verified."
        : "The email couldn't be sent. Try again in a minute.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  // One line per send in the server log, so misuse can be traced to an
  // account, without putting a client's address or bank numbers in the logs.
  console.log("send-invoice sent", JSON.stringify({ user: user.id, toDomain: to.split("@")[1], issuerName, number: input.number, total: input.total, bankRows: bank.length }));
  return NextResponse.json({ sent: true, to, copied: copyToSelf });
}
