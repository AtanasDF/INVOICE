import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CUT_OFF, ENGINE_BUSY, NOT_STRUCTURED, SCAN_ENGINES, type ScanEngine } from "@/lib/extractors";
import { extractContacts } from "@/lib/contactExtraction";
import { ALLOWED_TYPES, MAX_FILE_BYTES, parseDataUrl } from "@/lib/scanExtraction";
import { allow, release } from "@/lib/rateLimit";

const HOUR = 60 * 60 * 1000;

export const runtime = "nodejs";
export const maxDuration = 300;

const RELAYED_ERRORS = new Set([CUT_OFF, NOT_STRUCTURED, ENGINE_BUSY]);

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = token ? await auth.auth.getUser(token) : { data: { user: null } };
  if (!user) return NextResponse.json({ error: "Sign in to scan." }, { status: 401 });
  // Every call is a paid model read.
  if (!allow(`contact:${user.id}`, 60, HOUR)) {
    return NextResponse.json({ error: "Too many scans this hour. Try again later." }, { status: 429 });
  }
  if (!allow("contact:global", 300, HOUR)) {
    release(`contact:${user.id}`);
    return NextResponse.json({ error: "Scanning is busy right now. Try again in a little while." }, { status: 429 });
  }

  let body: { image?: unknown; engine?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with an `image` field." }, { status: 400 });
  }
  if (body.engine !== undefined && !SCAN_ENGINES.includes(body.engine as ScanEngine)) {
    return NextResponse.json({ error: "engine must be \"claude\" or \"gemini\"." }, { status: 400 });
  }
  const engine = (body.engine as ScanEngine | undefined) ?? "claude";
  const keyName = engine === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
  if (!process.env[keyName]) {
    return NextResponse.json({ error: `Scanning isn't configured yet: ${keyName} is missing on the server.` }, { status: 500 });
  }

  const page = typeof body.image === "string" ? parseDataUrl(body.image) : null;
  if (!page) return NextResponse.json({ error: "The file wasn't a valid data URL." }, { status: 400 });
  if (!ALLOWED_TYPES.includes(page.mediaType as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json({ error: `Unsupported file type: ${page.mediaType}. Use JPEG, PNG, WEBP, GIF, or PDF.` }, { status: 400 });
  }
  if ((page.base64.length * 3) / 4 > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "That file is too large (10MB max)." }, { status: 400 });
  }

  try {
    const contacts = await extractContacts([page], engine);
    return NextResponse.json({ contacts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (RELAYED_ERRORS.has(message)) return NextResponse.json({ error: message }, { status: 502 });
    console.error("contact-scan failed:", message || String(err));
    return NextResponse.json({ error: "Couldn't read that. Try again." }, { status: 502 });
  }
}
