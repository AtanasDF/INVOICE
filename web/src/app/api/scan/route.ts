import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CATEGORIES } from "@/lib/categories";
import { SCAN_ENGINES, type ScanEngine } from "@/lib/extractors";
import { ALLOWED_TYPES, MAX_FILE_BYTES, extractDocument, parseDataUrl } from "@/lib/scanExtraction";
import { allow } from "@/lib/rateLimit";

const HOUR = 60 * 60 * 1000;
// A batch of receipts is one read per document; a busy evening of scanning
// fits well inside this, a runaway loop doesn't.
const USER_PER_HOUR = 150;
const GLOBAL_PER_HOUR = 600;

export const runtime = "nodejs";
// A multi-page invoice through claude-opus-5 can take well past the
// default 10s; Vercel's limit is per-route.
export const maxDuration = 300;

const MAX_PAGES = 20;

export async function POST(req: Request) {
  // Every scan costs real model time, so the route only serves a signed-in
  // account: the browser sends its Supabase access token and the anon-key
  // client verifies it here.
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = token ? await auth.auth.getUser(token) : { data: { user: null } };
  if (!user) {
    return NextResponse.json({ error: "Sign in to scan documents." }, { status: 401 });
  }
  if (!allow(`scan:${user.id}`, USER_PER_HOUR, HOUR) || !allow("scan:global", GLOBAL_PER_HOUR, HOUR)) {
    return NextResponse.json({ error: "Too many scans this hour. Try again later." }, { status: 429 });
  }

  // `image` is the older single-file shape, still sent by invoices/new.
  let body: { images?: unknown; image?: unknown; categories?: unknown; engine?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with an `images` field." }, { status: 400 });
  }

  if (body.engine !== undefined && !SCAN_ENGINES.includes(body.engine as ScanEngine)) {
    return NextResponse.json({ error: "engine must be \"claude\" or \"gemini\"." }, { status: 400 });
  }
  const engine = (body.engine as ScanEngine | undefined) ?? "claude";
  const keyName = engine === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
  if (!process.env[keyName]) {
    return NextResponse.json(
      { error: `Scanning isn't configured yet: ${keyName} is missing on the server.` },
      { status: 500 }
    );
  }

  const images: unknown[] =
    Array.isArray(body.images) && body.images.length ? body.images : typeof body.image === "string" ? [body.image] : [];
  if (images.length === 0) {
    return NextResponse.json({ error: "No file was provided." }, { status: 400 });
  }
  if (images.length > MAX_PAGES) {
    return NextResponse.json({ error: `A document can have at most ${MAX_PAGES} pages.` }, { status: 400 });
  }

  const sentCategories = Array.isArray(body.categories)
    ? body.categories.filter((c): c is string => typeof c === "string" && !!c.trim())
    : [];
  const categories = sentCategories.length ? sentCategories : [...CATEGORIES];

  const pages: { mediaType: string; base64: string }[] = [];
  for (const [i, image] of images.entries()) {
    const page = images.length > 1 ? ` (page ${i + 1})` : "";
    const parsed = typeof image === "string" ? parseDataUrl(image) : null;
    if (!parsed) {
      return NextResponse.json({ error: `The file wasn't a valid data URL${page}.` }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(parsed.mediaType as (typeof ALLOWED_TYPES)[number])) {
      return NextResponse.json(
        { error: `Unsupported file type${page}: ${parsed.mediaType}. Use JPEG, PNG, WEBP, GIF, or PDF.` },
        { status: 400 }
      );
    }
    if ((parsed.base64.length * 3) / 4 > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `That file is too large${page} (10MB max).` }, { status: 400 });
    }
    pages.push(parsed);
  }

  try {
    const result = await extractDocument(pages, categories, engine);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error while scanning.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
