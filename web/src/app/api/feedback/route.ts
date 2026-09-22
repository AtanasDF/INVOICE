import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { allow } from "@/lib/rateLimit";
import { FEEDBACK_MAX, feedbackEmailHtml, feedbackEmailSubject, feedbackEmailText } from "@/lib/feedbackEmail";

export const runtime = "nodejs";

const FROM = "Invoicer <feedback@invoiceover.com>";
const HOUR = 60 * 60 * 1000;
const PER_HOUR = 20;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Feedback is saved as the sender's own row, the same as the page did on
// its own, and then emailed to the maker (FEEDBACK_TO) with Reply going to
// the sender. The email is best effort: with no key, no address, or Resend
// down, the row is still there and the answer says "not emailed", and the
// start-of-session read (harness/feedback-inbox.mjs) picks it up.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return NextResponse.json({ error: "Sign in to send feedback." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const { data: { user } } = await createClient(url, anon).auth.getUser(token).catch(() => ({ data: { user: null } }));
  if (!user) return NextResponse.json({ error: "Sign in to send feedback." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = typeof body.message === "string" ? body.message.trim() : "";
  if (!raw) return NextResponse.json({ error: "Write something first." }, { status: 400 });
  if (raw.length > FEEDBACK_MAX) {
    return NextResponse.json({ error: `Keep it under ${FEEDBACK_MAX.toLocaleString("en-GB")} characters (this is ${raw.length.toLocaleString("en-GB")}).` }, { status: 400 });
  }
  const category = text(body.category, 40);
  const page = text(body.page, 200);
  if (!allow(`feedback:${user.id}`, PER_HOUR, HOUR)) {
    return NextResponse.json({ error: "That's a lot of feedback for one hour. Try again a little later." }, { status: 429 });
  }

  const asSender = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: row, error } = await asSender
    .from("feedback")
    .insert({ user_id: user.id, message: raw, category: category || null, page: page || null })
    .select()
    .single();
  if (error || !row) {
    console.error("feedback: could not save,", error?.message);
    return NextResponse.json({ error: "Could not save your feedback. Try again in a minute." }, { status: 500 });
  }

  let emailed = false;
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO;
  if (apiKey && to) {
    const input = {
      message: raw,
      category,
      page,
      senderEmail: user.email ?? "",
      senderId: user.id,
      at: row.created_at ?? new Date().toISOString(),
      userAgent: req.headers.get("user-agent") ?? "",
      commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
    };
    try {
      const res = await fetch(`${process.env.RESEND_API_BASE ?? "https://api.resend.com"}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: [to],
          ...(user.email ? { reply_to: user.email } : {}),
          subject: feedbackEmailSubject(input),
          html: feedbackEmailHtml(input),
          text: feedbackEmailText(input),
        }),
        signal: AbortSignal.timeout(10000),
      });
      emailed = res.ok;
      if (!res.ok) console.error("feedback: Resend answered", res.status);
    } catch (err) {
      console.error("feedback: Resend unreachable,", err instanceof Error ? err.message : err);
    }
  } else {
    console.error("feedback: not emailed, RESEND_API_KEY or FEEDBACK_TO is not set");
  }
  return NextResponse.json({ id: row.id, createdAt: row.created_at, emailed });
}
