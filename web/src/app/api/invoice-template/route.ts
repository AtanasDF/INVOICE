import { NextResponse } from "next/server";
import { allowScans, refusalText, spendScans } from "@/lib/scanLimit";
import { createClient } from "@supabase/supabase-js";
import { SCAN_ENGINES, type ScanEngine, RELAYED_ERRORS } from "@/lib/extractors";
import { extractInvoiceTemplate } from "@/lib/invoiceTemplate";
import { allowShared } from "@/lib/rateLimit";
import { ALLOWED_TYPES, parseDataUrl } from "@/lib/scanExtraction";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PAGES = 3;
const MAX_PAGE_CHARS = 3_500_000;
// Vercel rejects bodies over 4.5MB before the handler runs.
const MAX_TOTAL_CHARS = 3_500_000;
const HOUR = 60 * 60 * 1000;
const USER_PER_HOUR = 60;
const GLOBAL_PER_HOUR = 200;

// Signed-in only since 2026-09-22 (Atanas: "everyone should have to sign
// in in order to be able to scan"): every read costs him money and comes
// from a real person. The Free page still lets a stranger type an invoice;
// scanning one in asks for a free sign-in first.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = token ? await auth.auth.getUser(token).catch(() => ({ data: { user: null } })) : { data: { user: null } };
  if (!user) return NextResponse.json({ error: "Sign in to scan. It's free, and it keeps every scan tied to a real person.", code: "sign_in" }, { status: 401 });

  let body: { images?: unknown; engine?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with an `images` field." }, { status: 400 });
  }

  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length === 0) {
    return NextResponse.json({ error: "No file was provided." }, { status: 400 });
  }
  if (images.length > MAX_PAGES) {
    return NextResponse.json({ error: `Send at most ${MAX_PAGES} pages of one invoice.` }, { status: 400 });
  }
  if (body.engine !== undefined && !SCAN_ENGINES.includes(body.engine as ScanEngine)) {
    return NextResponse.json({ error: "engine must be \"claude\" or \"gemini\"." }, { status: 400 });
  }

  const pages: { mediaType: string; base64: string }[] = [];
  let totalChars = 0;
  for (const [i, image] of images.entries()) {
    const page = images.length > 1 ? ` (page ${i + 1})` : "";
    if (typeof image !== "string") {
      return NextResponse.json({ error: `The file wasn't a valid data URL${page}.` }, { status: 400 });
    }
    if (image.length > MAX_PAGE_CHARS) {
      return NextResponse.json(
        { error: `That page is too large${page} (about 2.5MB max). Use a smaller photo or a lower-resolution PDF.` },
        { status: 413 }
      );
    }
    totalChars += image.length;
    const parsed = parseDataUrl(image);
    if (!parsed) {
      return NextResponse.json({ error: `The file wasn't a valid data URL${page}.` }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(parsed.mediaType as (typeof ALLOWED_TYPES)[number])) {
      return NextResponse.json(
        { error: `Unsupported file type${page}: ${parsed.mediaType}. Use JPEG, PNG, WEBP, GIF, or PDF.` },
        { status: 400 }
      );
    }
    pages.push(parsed);
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return NextResponse.json(
      { error: "These pages are too large to send together (about 2.5MB total). Use smaller photos or a lower-resolution PDF." },
      { status: 413 }
    );
  }

  let engine: ScanEngine = (body.engine as ScanEngine | undefined) ?? "gemini";
  if (engine === "gemini" && !process.env.GEMINI_API_KEY) engine = "claude";
  if (engine === "claude" && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Scanning isn't configured yet on the server." }, { status: 500 });
  }

  if (!(await allowShared(`template:user:${user.id}`, USER_PER_HOUR, HOUR))) {
    return NextResponse.json({ error: "Too many scans this hour. Try again later." }, { status: 429 });
  }
  if (!(await allowShared("template:global", GLOBAL_PER_HOUR, HOUR))) {
    return NextResponse.json({ error: "Scanning is busy right now. Try again in a little while." }, { status: 429 });
  }

  const refusal = await allowScans(token, 1);
  if (refusal) {
    return NextResponse.json({ error: refusalText(refusal), limit: refusal }, { status: 429 });
  }

  try {
    const template = await extractInvoiceTemplate(pages, engine);
    // One document read, so one document spent -- and only once it has been
    // read, so a failure costs nothing.
    await spendScans(token, 1);
    return NextResponse.json({ template, engine });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (RELAYED_ERRORS.has(message)) return NextResponse.json({ error: message }, { status: 502 });
    console.error("invoice-template extraction failed:", message || String(err));
    return NextResponse.json({ error: "Couldn't read the invoice. Try again." }, { status: 502 });
  }
}
