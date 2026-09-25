import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/extractors";
import { HELP_CHAT_BROKEN, HELP_CHAT_BUSY, HELP_CHAT_LIMITS, HELP_CHAT_TOO_LONG, helpChatOn, systemPrompt, trimHistory, type HelpMessage } from "@/lib/helpChat";
import { allow, release } from "@/lib/rateLimit";

export const runtime = "nodejs";
// A short answer from a small model. Nothing like a document read, and a
// person waiting for a chat reply will not wait 300 seconds anyway.
export const maxDuration = 30;

const HOUR = 60 * 60 * 1000;

export async function POST(req: Request) {
  // The switch is checked on the server too, not only in the component that
  // draws the box. A route that answers while the feature is meant to be
  // off is an open model endpoint that nothing in the UI admits to.
  if (!helpChatOn()) return NextResponse.json({ error: HELP_CHAT_BROKEN }, { status: 404 });

  // Signed in, like every other route that spends model time. Without this
  // it is a free model for anybody who finds the address.
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = token ? await auth.auth.getUser(token) : { data: { user: null } };
  if (!user) return NextResponse.json({ error: "Sign in to ask a question." }, { status: 401 });

  if (!allow(`help:${user.id}`, HELP_CHAT_LIMITS.perUser, HOUR)) {
    return NextResponse.json({ error: HELP_CHAT_BUSY }, { status: 429 });
  }
  if (!allow("help:global", HELP_CHAT_LIMITS.global, HOUR)) {
    release(`help:${user.id}`);
    return NextResponse.json({ error: HELP_CHAT_BUSY }, { status: 429 });
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: HELP_CHAT_BROKEN }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: HelpMessage[] = raw
    .filter((m): m is HelpMessage => !!m && typeof m === "object" && typeof (m as HelpMessage).text === "string")
    .map((m) => ({ role: m.role === "app" ? ("app" as const) : ("you" as const), text: m.text.trim() }))
    .filter((m) => m.text);
  if (!messages.length) return NextResponse.json({ error: HELP_CHAT_BROKEN }, { status: 400 });

  const last = messages[messages.length - 1];
  if (last.text.length > HELP_CHAT_LIMITS.maxQuestion) {
    return NextResponse.json({ error: HELP_CHAT_TOO_LONG }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: HELP_CHAT_BROKEN }, { status: 503 });

  // Trimmed here as well as in the browser: the window is a spending limit,
  // and a spending limit enforced only by the page that sends the request is
  // not a limit at all.
  const window = trimHistory(messages);

  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 20_000,
      retryOptions: { attempts: 2, initialDelay: 500, maxDelay: 2000 },
      // Only ever a stand-in for the harness, as HMRC_API_BASE and
      // COMPANIES_HOUSE_API_BASE are. Unset in production, where the SDK
      // uses Google's own address.
      ...(process.env.GEMINI_API_BASE ? { baseUrl: process.env.GEMINI_API_BASE } : {}),
    },
  });

  let interaction;
  try {
    interaction = await client.interactions.create({
      model: GEMINI_MODEL,
      input: [
        { type: "text", text: systemPrompt() },
        ...window.map((m) => ({ type: "text" as const, text: `${m.role === "you" ? "Them" : "You"}: ${m.text}` })),
        { type: "text", text: "Answer their last message." },
      ],
      generation_config: { max_output_tokens: 400, thinking_level: "low" },
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 429 || status === 503) return NextResponse.json({ error: HELP_CHAT_BUSY }, { status: 429 });
    return NextResponse.json({ error: HELP_CHAT_BROKEN }, { status: 503 });
  }

  const answer = (interaction.output_text ?? "").trim();
  // An empty answer is a failure that would otherwise render as a blank
  // reply bubble, which reads as the app ignoring them.
  if (!answer || interaction.status === "failed") return NextResponse.json({ error: HELP_CHAT_BROKEN }, { status: 503 });

  return NextResponse.json({ answer });
}
