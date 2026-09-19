import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { allow, release } from "@/lib/rateLimit";
import { longDate } from "@/lib/reminderTemplates";
import { QuoteRequestEmailInput, quoteRequestEmailHtml, quoteRequestEmailSubject, quoteRequestEmailText } from "@/lib/quoteRequestEmail";

export const runtime = "nodejs";
export const maxDuration = 30;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const DEFAULT_FROM = "Invoicer <invoices@invoiceover.com>";

// Signed-in only, and only to the supplier's saved address: everything in
// the email is read here from the owner's own rows (as the owner, so RLS
// applies), none of it from the browser. The browser sends the address it
// showed, and a mismatch is refused rather than sent somewhere unseen.
// Shares the per-account email limits with /api/send-invoice.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const { data: { user } } = token ? await createClient(url, anon).auth.getUser(token) : { data: { user: null } };
  if (!user) return NextResponse.json({ error: "Sign in to send quote requests.", code: "sign_in" }, { status: 401 });
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "Confirm your email address first (check your inbox for the sign-up link), then send." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; to?: unknown };
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : "";
  const shown = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
  if (!id) return NextResponse.json({ error: "Expected the supplier row to send." }, { status: 400 });

  const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: row } = await db.from("quote_request_suppliers").select("id, request_id, supplier_id, token, status").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "That supplier isn't on one of your requests." }, { status: 404 });
  const [{ data: request }, { data: supplier }, { data: bp }] = await Promise.all([
    db.from("quote_requests").select("title, items, notes, needed_by, site_address, status").eq("id", row.request_id).eq("user_id", user.id).maybeSingle(),
    db.from("clients").select("name, email, contact_person").eq("id", row.supplier_id).eq("user_id", user.id).maybeSingle(),
    db.from("business_profile").select("business_name").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!request || !supplier) return NextResponse.json({ error: "That supplier isn't on one of your requests." }, { status: 404 });
  if (request.status !== "open") return NextResponse.json({ error: "This request is closed. Reopen it to send it." }, { status: 409 });
  if (row.status !== "waiting") return NextResponse.json({ error: `${supplier.name} has already answered.` }, { status: 409 });
  const to = (supplier.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: `Add an email address for ${supplier.name} first.` }, { status: 400 });
  if (to !== shown) return NextResponse.json({ error: `${supplier.name}'s email address has changed. Reload the page and check it.` }, { status: 409 });
  const issuerName = (bp?.business_name ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 120);
  if (!issuerName) return NextResponse.json({ error: "Add your business name in Settings first, so the supplier knows who it's from." }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Email sending isn't switched on yet.", code: "not_configured" }, { status: 503 });

  const key = `send:user:${user.id}`;
  if (!allow(key, 30, HOUR)) return NextResponse.json({ error: "Too many emails this hour. Try again later." }, { status: 429 });
  if (!allow("send:global", 60, HOUR)) {
    release(key);
    return NextResponse.json({ error: "Sending is busy right now. Try again in a little while." }, { status: 429 });
  }
  if (!allow(`${key}:day`, 100, DAY)) {
    release(key);
    release("send:global");
    return NextResponse.json({ error: "That's the most emails for today. Try again tomorrow." }, { status: 429 });
  }

  const replyTo = user.email?.toLowerCase() ?? null;
  const input: QuoteRequestEmailInput = {
    issuerName,
    supplierName: (supplier.contact_person || supplier.name || "").trim(),
    title: request.title,
    items: (request.items ?? []).map((it: { description?: string; quantity?: number; unit?: string; note?: string }) => ({
      description: it.description ?? "",
      quantity: Number(it.quantity) || 0,
      unit: it.unit ?? "",
      note: it.note ?? "",
    })),
    neededBy: request.needed_by ? longDate(request.needed_by) : "",
    siteAddress: request.site_address ?? "",
    notes: request.notes ?? "",
    link: `${new URL(req.url).origin}/r/${row.token}`,
    replyTo,
  };
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const fromAddress = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const fromName = `${issuerName.replace(/["<>\\\r\n]/g, "").trim()} via Invoicer`;
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `"${fromName}" <${fromAddress}>`,
        to: [to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: quoteRequestEmailSubject(input),
        html: quoteRequestEmailHtml(input),
        text: quoteRequestEmailText(input),
      }),
    });
  } catch (err) {
    console.error("quote-request send: Resend unreachable", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The email couldn't be sent. Try again in a minute." }, { status: 502 });
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    console.error("quote-request send: Resend", res.status, detail?.message);
    return NextResponse.json({ error: "The email couldn't be sent. Try again in a minute." }, { status: 502 });
  }
  const sentAt = new Date().toISOString();
  await db.from("quote_request_suppliers").update({ sent_at: sentAt }).eq("id", row.id);
  console.log("quote-request sent", JSON.stringify({ user: user.id, toDomain: to.split("@")[1], request: row.request_id }));
  return NextResponse.json({ sent: true, to, sentAt });
}
