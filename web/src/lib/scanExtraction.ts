import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "@/lib/categories";
import { CURRENCIES } from "@/lib/fx";

// Shared between /api/scan (a live camera/upload capture, reviewed on
// screen before saving) and /api/inbox/ingest (an emailed-in document,
// nobody watching -- both need the identical extraction, just different
// handling of the result afterward).

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB, generous for a phone photo or PDF
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"] as const;

export type ScanLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  category: string | null;
};

export type ScanResult = {
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
  // The currency totalAmount/vatAmount are actually denominated in, e.g.
  // "USD" -- null if it's GBP (the default/unmarked case on a UK receipt)
  // or genuinely unclear. The app converts to GBP itself; this is never
  // asked to guess an exchange rate.
  currency: string | null;
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
        currency: {
          type: ["string", "null"],
          enum: [...CURRENCIES, null],
          description:
            "The currency totalAmount/vatAmount are actually in, from its symbol or code on the document " +
            "(e.g. \"$\" or \"USD\" -> USD). Null if it's GBP (£, or no currency marked at all -- the default " +
            "assumption for a UK document) or if you genuinely can't tell which currency a symbol like \"$\" " +
            "refers to.",
        },
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
        "currency",
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

export function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

export async function extractDocument(params: {
  apiKey: string;
  base64: string;
  mediaType: string;
  categories?: string[];
}): Promise<ScanResult> {
  const categories = params.categories?.length ? params.categories : [...CATEGORIES];
  const anthropic = new Anthropic({ apiKey: params.apiKey });
  const isPdf = params.mediaType === "application/pdf";

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
                source: { type: "base64", media_type: "application/pdf", data: params.base64 },
              }
            : {
                type: "image",
                source: {
                  type: "base64",
                  media_type: params.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                  data: params.base64,
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
              "alone, read directly if it's printed on the document. Set currency only when totalAmount is " +
              "genuinely NOT in GBP -- leave it null for a plain UK document (£, or no symbol at all). " +
              "Never guess an exchange rate yourself, only the currency it's in. " +
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

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("The model didn't return structured data. Try again.");
  }
  return toolUse.input as ScanResult;
}
