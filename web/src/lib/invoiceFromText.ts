import { extractStructured, nullableEnum, type ScanEngine } from "@/lib/extractors";
import { CURRENCIES } from "@/lib/fx";
import type { InvoiceLineKind, InvoiceTemplate } from "@/lib/invoiceTemplate";

export type TypedVat = "plus" | "included" | "none" | null;

type TypedInvoice = {
  customerName: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  lines: { description: string; quantity: number; unitPrice: number; kind: InvoiceLineKind }[];
  vat: TypedVat;
  currency: string | null;
  paymentTerms: string | null;
  notes: string | null;
};

const nullable = (description: string) => ({ type: ["string", "null"], description });

const SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    customerName: nullable("Who the invoice is for (a business or person), as written. Null if not said."),
    customerEmail: nullable("The customer's email, if given."),
    customerAddress: nullable("The customer's address, if given, on one line."),
    lines: {
      type: "array",
      description: "One line per thing being charged for, in the order given.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string", description: "What the line is for, tidied into a short invoice line (e.g. \"Plastering – 3 days\")." },
          quantity: { type: "number", description: "How many (days, hours, items). 1 when no quantity is given." },
          unitPrice: { type: "number", description: "Price per one, exactly as stated (before any VAT adjustment). For \"3 days at £250\" this is 250; for \"£750 for 3 days\" it is 250." },
          kind: { type: "string", enum: ["labour", "materials", "other"], description: "labour = work/time; materials = goods/parts; other = anything else." },
        },
        required: ["description", "quantity", "unitPrice", "kind"],
      },
    },
    vat: nullableEnum(["plus", "included", "none"], "plus = VAT to be added on top (\"plus VAT\", \"+VAT\"); included = the prices already include VAT (\"inc VAT\"); none = no VAT (\"no VAT\", \"not VAT registered\"). Null if VAT isn't mentioned."),
    currency: nullableEnum(CURRENCIES, "The currency if one other than pounds is named (\"€800\", \"800 euros\" -> EUR). Null for pounds or when none is named."),
    paymentTerms: nullable("Payment terms if said, e.g. \"14 days\" or \"Upon receipt\"."),
    notes: nullable("Anything else the user wants printed on the invoice (a PO number, a thank-you). Null otherwise."),
  },
  required: ["customerName", "customerEmail", "customerAddress", "lines", "vat", "currency", "paymentTerms", "notes"],
};

const PROMPT =
  "A UK sole trader typed or dictated the invoice they want to create, in their own words, possibly with typos or " +
  "no punctuation. Turn it into invoice details with the record_typed_invoice tool. Amounts are in pounds unless " +
  "another currency is named. Never invent a customer, a price or a line that wasn't said; leave unknowns null. " +
  "What they typed:\n\n";

// Prices are returned exactly as said; the VAT treatment travels alongside
// so the page can set each line's rate (and bring inc-VAT prices back to
// net) knowing whether the account is VAT registered.
export async function invoiceFromText(text: string, engine: ScanEngine): Promise<{ template: InvoiceTemplate; vat: TypedVat }> {
  const out = await extractStructured<TypedInvoice>({
    engine,
    name: "record_typed_invoice",
    description: "Records the customer, lines, VAT treatment and terms of an invoice described in words.",
    schema: SCHEMA,
    prompt: PROMPT + text,
    pages: [],
    maxTokens: 4000,
    effort: "low",
  });
  const template: InvoiceTemplate = {
    issuer: { name: null, address: null, email: null, phone: null, website: null, vatNumber: null, companyNumber: null, utr: null },
    bank: { accountName: null, sortCode: null, accountNumber: null, iban: null, reference: null },
    customer: { name: out.customerName, address: out.customerAddress, email: out.customerEmail },
    invoiceNumber: null,
    numberingPrefix: null,
    date: null,
    dueDate: null,
    paymentTerms: out.paymentTerms,
    currency: out.currency && out.currency !== "GBP" ? out.currency : null,
    showsVat: out.vat === "plus" || out.vat === "included",
    cis: false,
    lineItems: (out.lines ?? []).map((l) => ({
      description: l.description,
      quantity: l.quantity || 1,
      unitPrice: l.unitPrice,
      kind: l.kind,
    })),
    notes: out.notes,
    footer: null,
    layout: { headerAlignment: "left", metaPosition: "right", hasLogo: false, style: "modern" },
  };
  return { template, vat: out.vat ?? null };
}
