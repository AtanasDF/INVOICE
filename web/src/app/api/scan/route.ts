import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "@/lib/categories";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB, generous for a phone photo or PDF
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"] as const;

type ScanLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  category: string | null;
};

type ScanResult = {
  documentType:
    | "receipt"
    | "invoice"
    | "bank_statement"
    | "business_card"
    | "delivery_note"
    | "contract"
    | "handwritten_note"
    | "barcode"
    | "other";
  vendor: string | null;
  vendorConfidence: "high" | "low";
  date: string | null;
  dateConfidence: "high" | "low";
  // The grand total actually paid/charged, INCLUDING VAT -- i.e. whatever
  // is printed as the final total, not a subtotal. Deliberately not "net"
  // here: asking the model to read a total straight off the document
  // (something that's actually printed) is far more reliable than asking
  // it to compute a net figure that often isn't printed anywhere. Net is
  // derived app-side as totalAmount - vatAmount.
  totalAmount: number | null;
  totalAmountConfidence: "high" | "low";
  vatAmount: number | null;
  vatAmountConfidence: "high" | "low";
  category: string | null;
  lineItems: ScanLineItem[];
  // Only populated when documentType is "business_card" -- a name and
  // email to prefill a new client/supplier record with, since that's a
  // different save path from the rest (no amount involved at all).
  contactPerson: string | null;
  contactEmail: string | null;
  notes: string | null;
};

// The tool schema's category enum is built per-request from whichever
// category list the caller sends (their customized list, if they have
// one) so the model only ever suggests categories that actually appear in
// their dropdown -- falling back to the built-in defaults for a caller
// that doesn't send one.
function buildExtractionTool(categories: string[]) {
  return {
  name: "record_document",
  description:
    "Records the structured data read off a scanned business document (receipt, invoice, or similar).",
  input_schema: {
    type: "object" as const,
    properties: {
      documentType: {
        type: "string",
        enum: [
          "receipt",
          "invoice",
          "bank_statement",
          "business_card",
          "delivery_note",
          "contract",
          "handwritten_note",
          "barcode",
          "other",
        ],
        description: "What kind of document this is.",
      },
      vendor: { type: ["string", "null"], description: "Merchant or company name." },
      vendorConfidence: { type: "string", enum: ["high", "low"] },
      date: { type: ["string", "null"], description: "Document date as YYYY-MM-DD." },
      dateConfidence: { type: "string", enum: ["high", "low"] },
      totalAmount: {
        type: ["number", "null"],
        description:
          "The grand total actually paid/charged, INCLUDING VAT/tax -- read this directly off whatever is " +
          "printed as the final total. Do NOT subtract VAT yourself and do NOT report a subtotal here.",
      },
      totalAmountConfidence: { type: "string", enum: ["high", "low"] },
      vatAmount: { type: ["number", "null"], description: "VAT/tax portion only, not the total." },
      vatAmountConfidence: { type: "string", enum: ["high", "low"] },
      category: {
        type: ["string", "null"],
        enum: [...categories, null],
        description:
          "Best-guess overall expense category, or null if unclear / if line items span multiple categories.",
      },
      lineItems: {
        type: "array",
        description: "Every distinct item/line on the document, each with its own best-guess category.",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            quantity: { type: "number" },
            unitPrice: { type: "number" },
            category: {
              type: ["string", "null"],
              enum: [...categories, null],
              description: "Best-guess category for this specific item, or null if unclear.",
            },
          },
          required: ["description", "quantity", "unitPrice", "category"],
        },
      },
      contactPerson: {
        type: ["string", "null"],
        description: "Only for documentType business_card: the named individual's full name, if shown.",
      },
      contactEmail: {
        type: ["string", "null"],
        description: "Only for documentType business_card: an email address, if shown.",
      },
      notes: { type: ["string", "null"], description: "Anything else worth flagging to the user." },
    },
    required: [
      "documentType",
      "vendor",
      "vendorConfidence",
      "date",
      "dateConfidence",
      "totalAmount",
      "totalAmountConfidence",
      "vatAmount",
      "vatAmountConfidence",
      "category",
      "lineItems",
      "contactPerson",
      "contactEmail",
      "notes",
    ],
  },
  };
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

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

  const anthropic = new Anthropic({ apiKey });
  const isPdf = parsed.mediaType === "application/pdf";

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      tools: [buildExtractionTool(categories)],
      tool_choice: { type: "tool", name: "record_document" },
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? {
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data: parsed.base64 },
                }
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: parsed.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                    data: parsed.base64,
                  },
                },
            {
              type: "text",
              text:
                "Read this scanned document and record its details with the record_document tool. " +
                "If it's a barcode (product barcode/UPC/QR code and nothing else readable as a business " +
                "document), set documentType to \"barcode\" and put the decoded-looking value in notes. " +
                "Mark a field's confidence as \"low\" whenever the source is smudged, cropped, ambiguous, " +
                "or you're genuinely guessing -- never mark something \"high\" just to fill the field in. " +
                "totalAmount is the grand total actually paid, INCLUDING VAT/tax -- read it directly off " +
                "whatever is printed as the final total, never a subtotal. vatAmount is the VAT/tax portion " +
                "alone, read directly if it's printed on the document. " +
                "Give every line item its own best-guess category (e.g. a supermarket receipt might have " +
                "some Groceries items and some Household items) -- only fall back to null on a line item " +
                "when it's genuinely unclear. Only suggest categories from the given list, and only when " +
                "reasonably confident -- do not guess who the client or supplier is, that is always chosen " +
                "by the person reviewing this. If documentType is business_card, also fill in contactPerson " +
                "and contactEmail when they're shown (vendor should be the company name); leave both null " +
                "for every other document type.",
            },
          ],
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) {
      return NextResponse.json({ error: "The model didn't return structured data. Try again." }, { status: 502 });
    }

    return NextResponse.json({ result: toolUse.input as ScanResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error while scanning.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
