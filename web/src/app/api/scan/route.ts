import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/categories";
import { ALLOWED_TYPES, MAX_FILE_BYTES, extractDocument, parseDataUrl } from "@/lib/scanExtraction";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Scanning isn't configured yet: ANTHROPIC_API_KEY is missing on the server." },
      { status: 500 }
    );
  }

  let body: { image?: string; categories?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with an `image` field." }, { status: 400 });
  }

  if (!body.image) {
    return NextResponse.json({ error: "No file was provided." }, { status: 400 });
  }

  const categories = body.categories?.length ? body.categories : [...CATEGORIES];

  const parsed = parseDataUrl(body.image);
  if (!parsed) {
    return NextResponse.json({ error: "The file wasn't a valid data URL." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(parsed.mediaType as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { error: `Unsupported file type: ${parsed.mediaType}. Use JPEG, PNG, WEBP, GIF, or PDF.` },
      { status: 400 }
    );
  }
  const approxBytes = (parsed.base64.length * 3) / 4;
  if (approxBytes > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "That file is too large (10MB max)." }, { status: 400 });
  }

  try {
    const result = await extractDocument({ apiKey, base64: parsed.base64, mediaType: parsed.mediaType, categories });
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error while scanning.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
