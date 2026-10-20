import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { allowShared } from "@/lib/rateLimit";
import { SITE_NAME } from "@/lib/siteName";

export const runtime = "nodejs";
export const maxDuration = 30;

// "Copy a document" sends its PDF to someone (Atanas, 2026-09-22). The same
// fences as sending an invoice, since any route that emails an attachment
// from the app's own domain is a relay if it isn't fenced: a signed-in,
// confirmed sender; a PDF and nothing else; the wording fixed, the sender's
// own words only as a quoted note; replies to the sender's own address; and
// a small allowance an hour and a day.
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const USER_PER_HOUR = 10;
const USER_PER_DAY = 30;
const GLOBAL_PER_HOUR = 60;
// Vercel refuses a body over 4.5 MB before the handler runs.
const MAX_PDF_CHARS = 4_000_000;
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const FROM = `${SITE_NAME} <documents@invoiceover.com>`;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const line = (v: unknown, max: number) => text(typeof v === "string" ? v.replace(/[\x00-\x1f\x7f]+/g, " ") : v, max);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = token ? await auth.auth.getUser(token).catch(() => ({ data: { user: null } })) : { data: { user: null } };
  if (!user) return NextResponse.json({ error: "Sign in to send a document by email.", code: "sign_in" }, { status: 401 });
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "Confirm your email address first (check your inbox for the sign-up link), then send." }, { status: 403 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Email sending isn't switched on yet.", code: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  const to = line(body.to, 254).toLowerCase();
  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: "Enter a valid email address to send to." }, { status: 400 });
  const filename = line(body.filename, 90).replace(/[^\p{L}\p{N} ._-]+/gu, " ").trim();
  if (!/\.pdf$/i.test(filename)) return NextResponse.json({ error: "The file must be a PDF." }, { status: 400 });
  const pdf = typeof body.pdf === "string" ? body.pdf : "";
  if (!pdf || pdf.length > MAX_PDF_CHARS) {
    return NextResponse.json({ error: "The file is too large to email. Remove a page or two, or save it and share it another way." }, { status: 400 });
  }
  const bytes = Buffer.from(pdf, "base64");
  if (!bytes.subarray(0, 5).toString("latin1").startsWith("%PDF-") || !bytes.subarray(-1024).toString("latin1").includes("%%EOF")) {
    return NextResponse.json({ error: "The attachment must be the PDF made on this page." }, { status: 400 });
  }
  const note = text(body.message, 1000);
  const sender = user.email ?? "";

  const key = `send-doc:user:${user.id}`;
  // In the database, as /api/send-invoice: a per-instance count is not a
  // daily limit.
  if (!(await allowShared(key, USER_PER_HOUR, HOUR))) return NextResponse.json({ error: "Too many sent this hour. Try again later." }, { status: 429 });
  if (!(await allowShared("send-doc:global", GLOBAL_PER_HOUR, HOUR))) {
    return NextResponse.json({ error: "Sending is busy right now. Try again in a little while." }, { status: 429 });
  }
  if (!(await allowShared(`${key}:day`, USER_PER_DAY, DAY))) {
    return NextResponse.json({ error: "That's the most for today. Try again tomorrow." }, { status: 429 });
  }

  const subject = `${sender} sent you a document: ${filename}`;
  const plain = `${sender} sent you ${filename}, attached.\n\n${note ? `Their note:\n${note}\n\n` : ""}Reply to this email to answer them.\n\nSent with ${SITE_NAME}.`;
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#171717">` +
    `<p style="margin:0 0 12px">${esc(sender)} sent you <strong>${esc(filename)}</strong>, attached.</p>` +
    (note ? `<p style="margin:0 0 4px;color:#525252">Their note:</p><pre style="white-space:pre-wrap;font:inherit;margin:0 0 12px">${esc(note)}</pre>` : "") +
    `<p style="margin:0;color:#525252;font-size:13px">Reply to this email to answer them. Sent with ${SITE_NAME}.</p></div>`;
  let res: Response;
  try {
    res = await fetch(`${process.env.RESEND_API_BASE ?? "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], ...(sender ? { reply_to: sender } : {}), subject, html, text: plain, attachments: [{ filename, content: pdf }] }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    console.error("send-document: Resend unreachable", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "It couldn't be sent. Try again in a minute." }, { status: 502 });
  }
  if (!res.ok) {
    console.error("send-document: Resend", res.status);
    return NextResponse.json({ error: "It couldn't be sent. Try again in a minute." }, { status: 502 });
  }
  return NextResponse.json({ sent: true, to });
}
