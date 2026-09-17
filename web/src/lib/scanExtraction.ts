import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "@/lib/categories";
import { CURRENCIES } from "@/lib/fx";
import { NormalisedDates, normaliseScanDates } from "@/lib/documentDate";
import type { DocumentDetails } from "@/lib/storage";

// Shared between /api/scan (a live camera/upload capture, reviewed on
// screen before saving) and /api/inbox/ingest (an emailed-in document,
// nobody watching -- both need the identical extraction, just different
// handling of the result afterward).

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB, generous for a phone photo or PDF
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"] as const;

type ImageMediaType = (typeof ALLOWED_IMAGE_TYPES)[number];

export type ScanLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number | null;
};

export type ScanDetailKey = Exclude<keyof DocumentDetails, "other">;

export type ScanDetails = Record<ScanDetailKey, string | null> & { other: { label: string; value: string }[] };

export type ScanDocumentType =
  | "receipt"
  | "invoice"
  | "credit_note"
  | "bank_statement"
  | "business_card"
  | "delivery_note"
  | "contract"
  | "handwritten_note"
  | "barcode"
  | "other";

// Exactly what the record_document tool returns.
export type ScanToolOutput = {
  documentType: ScanDocumentType;
  vendor: string | null;
  vendorConfidence: "high" | "low";
  // The model's own YYYY-MM-DD reading; replaced server-side by the
  // day-first parse of dateAsPrinted whenever that parses (documentDate.ts).
  date: string | null;
  dateAsPrinted: string | null;
  dateConfidence: "high" | "low";
  invoiceNumber: string | null;
  dueDate: string | null;
  dueDateAsPrinted: string | null;
  // For a credit note: the original invoice it refunds, as printed.
  creditedInvoiceNumber: string | null;
  // The grand total actually paid/charged, INCLUDING VAT -- i.e. whatever
  // is printed as the final total, not a subtotal. Deliberately not "net"
  // here: asking the model to read a total straight off the document
  // (something that's actually printed) is far more reliable than asking
  // it to compute a net figure that often isn't printed anywhere. Net is
  // derived app-side as totalAmount - vatAmount. A credit note's amounts
  // arrive positive; the app negates them on save.
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
  details: ScanDetails;
  // Only populated when documentType is "business_card" -- a name and
  // email to prefill a new client/supplier record with, since that's a
  // different save path from the rest (no amount involved at all).
  contactPerson: string | null;
  contactEmail: string | null;
  notes: string | null;
};

export type ScanResult = ScanToolOutput & NormalisedDates;

// Typed against DocumentDetails so a key added there without a
// description here fails to compile.
const DETAIL_DESCRIPTIONS: Record<ScanDetailKey, string> = {
  accountNumber: "Supplier's bank account number for payment, as printed.",
  sortCode: "Supplier's bank sort code, as printed (e.g. 12-34-56).",
  iban: "Supplier's IBAN, as printed.",
  bic: "Supplier's BIC / SWIFT code, as printed.",
  paymentTerms: "Payment terms as printed, e.g. \"Net 30\" or \"Due on receipt\".",
  reference: "Payment reference the supplier asks to be quoted, as printed.",
  poNumber: "Purchase order number, as printed.",
  orderNumber: "Order number, as printed.",
  customerReference: "Customer / account reference the supplier uses for this customer, as printed.",
  supplierAddress: "The issuing business's postal address, as printed, on one line.",
  supplierVatNumber: "The issuing business's VAT registration number, as printed.",
  supplierEmail: "The issuing business's email address, as printed.",
  supplierPhone: "The issuing business's phone number, as printed.",
  deliveryAddress: "Delivery / ship-to address if different from the billing address, as printed, on one line.",
};

const nullable = (description: string) => ({ type: ["string", "null"], description });
const confidence = { type: "string", enum: ["high", "low"] };

// The tool schema's category enum is built per-request from whichever
// category list the caller sends (their customized list, if they have
// one) so the model only ever suggests categories that actually appear in
// their dropdown. strict: true, so every object closes additionalProperties
// and lists every property as required.
function buildExtractionTool(categories: string[]): Anthropic.Tool {
  const detailProperties = Object.fromEntries(
    (Object.keys(DETAIL_DESCRIPTIONS) as ScanDetailKey[]).map((k) => [k, nullable(DETAIL_DESCRIPTIONS[k])])
  );
  return {
    name: "record_document",
    description:
      "Records the structured data read off a scanned UK business document (receipt, supplier invoice, credit note, or similar).",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        documentType: {
          type: "string",
          enum: [
            "receipt",
            "invoice",
            "credit_note",
            "bank_statement",
            "business_card",
            "delivery_note",
            "contract",
            "handwritten_note",
            "barcode",
            "other",
          ],
          description:
            "receipt = proof of a payment already made; invoice = a request for payment; credit_note = reduces or refunds an earlier invoice.",
        },
        vendor: nullable("The business that ISSUED the document, as printed. Never the customer or the addressee."),
        vendorConfidence: confidence,
        date: nullable("Your reading of the document date as YYYY-MM-DD (day-first for numeric dates)."),
        dateAsPrinted: nullable("The document date copied EXACTLY as printed, character for character. Null if not printed."),
        dateConfidence: confidence,
        invoiceNumber: nullable("Invoice / receipt / credit note number as printed. Null if none."),
        dueDate: nullable("Your reading of the payment due date as YYYY-MM-DD, only when a due date is printed."),
        dueDateAsPrinted: nullable("The due date copied EXACTLY as printed. Null if no due date is printed."),
        creditedInvoiceNumber: nullable(
          "Only for a credit_note: the number of the original invoice it credits, as printed. Null otherwise."
        ),
        totalAmount: {
          type: ["number", "null"],
          description:
            "The grand total actually paid/charged, INCLUDING VAT/tax -- read this directly off whatever is " +
            "printed as the final total. Do NOT subtract VAT yourself and do NOT report a subtotal here. " +
            "Always positive, even on a credit note.",
        },
        totalAmountConfidence: confidence,
        currency: {
          type: ["string", "null"],
          enum: [...CURRENCIES, null],
          description:
            "The currency totalAmount/vatAmount are actually in, from its symbol or code on the document " +
            '(e.g. "$" or "USD" -> USD). Null if it\'s GBP (£, or no currency marked at all -- the default ' +
            'assumption for a UK document) or if you genuinely can\'t tell which currency a symbol like "$" ' +
            "refers to.",
        },
        vatAmount: {
          type: ["number", "null"],
          description: "VAT/tax portion only, not the total. Always positive, even on a credit note.",
        },
        vatAmountConfidence: confidence,
        category: {
          type: ["string", "null"],
          enum: [...categories, null],
          description: "Best-guess overall expense category, or null if unclear.",
        },
        lineItems: {
          type: "array",
          description: "Every distinct item/line on the document, in printed order.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              description: { type: "string" },
              quantity: { type: "number", description: "1 when no quantity is printed." },
              unitPrice: { type: "number", description: "Price per unit, ex VAT where the document shows it that way." },
              lineTotal: { type: ["number", "null"], description: "The printed line total, or null if none is printed." },
            },
            required: ["description", "quantity", "unitPrice", "lineTotal"],
          },
        },
        details: {
          type: "object",
          description: "Everything else printed that identifies the supplier or how to pay. Null for anything not printed.",
          additionalProperties: false,
          properties: {
            ...detailProperties,
            other: {
              type: "array",
              description:
                "Any other printed label/value pair that has no field above (e.g. a driver name or a job number). Empty when none.",
              items: {
                type: "object",
                additionalProperties: false,
                properties: { label: { type: "string" }, value: { type: "string" } },
                required: ["label", "value"],
              },
            },
          },
          required: [...Object.keys(DETAIL_DESCRIPTIONS), "other"],
        },
        contactPerson: nullable("Only for documentType business_card: the named individual's full name, if shown."),
        contactEmail: nullable("Only for documentType business_card: an email address, if shown."),
        notes: nullable(
          "Only a genuine remark or warning printed on the document or something the reviewer must know (a smudged total, a handwritten alteration). Null otherwise -- never a summary."
        ),
      },
      required: [
        "documentType",
        "vendor",
        "vendorConfidence",
        "date",
        "dateAsPrinted",
        "dateConfidence",
        "invoiceNumber",
        "dueDate",
        "dueDateAsPrinted",
        "creditedInvoiceNumber",
        "totalAmount",
        "totalAmountConfidence",
        "currency",
        "vatAmount",
        "vatAmountConfidence",
        "category",
        "lineItems",
        "details",
        "contactPerson",
        "contactEmail",
        "notes",
      ],
    },
  };
}

const PROMPT =
  "Read this scanned UK business document and record its details with the record_document tool. " +
  "Every attached image or PDF page is a page of the SAME document, in order. " +
  "A receipt is proof of a payment already made; an invoice is a request for payment; a credit note reduces " +
  "or refunds an earlier invoice -- for a credit note set documentType to \"credit_note\", report its amounts " +
  "as POSITIVE numbers, and put the original invoice number it refers to in creditedInvoiceNumber. " +
  "If it's a barcode (product barcode/UPC/QR code and nothing else readable as a business document), set " +
  "documentType to \"barcode\" and put the decoded-looking value in notes. " +
  "vendor is the business that ISSUED the document as printed (the name at the top, the one whose VAT number " +
  "and bank details appear) -- never the customer, the \"bill to\" name, or whoever it's addressed to. " +
  "This is a UK document, so printed numeric dates are day/month/year: 08/09/26 is 8 September 2026, never " +
  "9 August. Always copy the date and the due date EXACTLY as printed, character for character, into " +
  "dateAsPrinted and dueDateAsPrinted (null when not printed), and give your own reading in date and dueDate. " +
  "Read the invoice number and the due date whenever they are printed; if only terms like \"Net 30\" are " +
  "given, leave dueDate null and put the terms in details.paymentTerms. " +
  "totalAmount is the grand total actually paid or charged, INCLUDING VAT/tax -- read it directly off whatever " +
  "is printed as the final total, never a subtotal. vatAmount is the VAT/tax portion alone, read directly if " +
  "it's printed. Set currency only when totalAmount is genuinely NOT in GBP -- leave it null for a plain UK " +
  "document (£, or no symbol at all). Never guess an exchange rate yourself, only the currency it's in. " +
  "Capture bank details (account number, sort code, IBAN, BIC), payment terms, payment references, PO / " +
  "order / customer reference numbers, the supplier's address, VAT number, email and phone, and any delivery " +
  "address into details, each copied as printed; put anything else printed that has no field into " +
  "details.other. notes is only for a genuine remark or warning -- something printed as a note, or something " +
  "the reviewer needs to know like a smudged total or a handwritten change -- never a summary of the document. " +
  "List every line item with its quantity, unit price and printed line total; line items have no category. " +
  "category is the best-guess overall expense category from the given list, or null if unclear -- do not " +
  "guess who the client or supplier is, that is always chosen by the person reviewing this. " +
  "Mark a field's confidence \"low\" whenever the source is smudged, cropped, ambiguous, or you're genuinely " +
  "guessing -- never mark something \"high\" just to fill the field in. " +
  "If documentType is business_card, also fill in contactPerson and contactEmail when they're shown (vendor " +
  "should be the company name); leave both null for every other document type.";

export function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

export async function extractDocument(
  pages: { mediaType: string; base64: string }[],
  categories: string[]
): Promise<ScanResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const pageBlocks: Anthropic.ContentBlockParam[] = pages.map((p) =>
    p.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.base64 } }
      : { type: "image", source: { type: "base64", media_type: p.mediaType as ImageMediaType, data: p.base64 } }
  );

  // claude-opus-5 thinks adaptively by default and its thinking tokens
  // count against max_tokens, so the ceiling has to leave room for both
  // the reasoning and a long line-item list; medium effort keeps the
  // thinking share proportionate for a read-and-copy task.
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    output_config: { effort: "medium" },
    tools: [buildExtractionTool(categories.length ? categories : [...CATEGORIES])],
    tool_choice: { type: "tool", name: "record_document" },
    messages: [{ role: "user", content: [...pageBlocks, { type: "text", text: PROMPT }] }],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("The reading was cut off before the document was finished. Try scanning fewer pages at once.");
  }
  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("The model didn't return structured data. Try again.");
  }
  return normaliseScanDates(toolUse.input as ScanToolOutput);
}
