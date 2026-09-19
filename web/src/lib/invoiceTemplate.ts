import { parsePrintedDate } from "@/lib/documentDate";
import { extractStructured, nullableEnum, type ScanEngine, type ScanPage } from "@/lib/extractors";
import { CURRENCIES } from "@/lib/fx";

export type InvoiceLineKind = "labour" | "materials" | "other";
export type InvoiceLayoutStyle = "classic" | "modern" | "compact";

export type InvoiceTemplate = {
  issuer: {
    name: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    vatNumber: string | null;
    companyNumber: string | null;
    utr: string | null;
  };
  bank: {
    accountName: string | null;
    sortCode: string | null;
    accountNumber: string | null;
    iban: string | null;
    reference: string | null;
  };
  customer: { name: string | null; address: string | null; email: string | null };
  invoiceNumber: string | null;
  numberingPrefix: string | null;
  date: string | null;
  dueDate: string | null;
  paymentTerms: string | null;
  currency: string | null;
  showsVat: boolean;
  cis: boolean;
  lineItems: { description: string; quantity: number; unitPrice: number; kind: InvoiceLineKind }[];
  notes: string | null;
  footer: string | null;
  layout: {
    headerAlignment: "left" | "centre" | "right";
    metaPosition: "right" | "left" | "below";
    hasLogo: boolean;
    style: InvoiceLayoutStyle;
  };
};

// The model copies the printed date strings; the day-first parse happens
// here, like the receipt scanner.
type InvoiceTemplateToolOutput = Omit<InvoiceTemplate, "date" | "dueDate"> & {
  dateAsPrinted: string | null;
  dueDateAsPrinted: string | null;
};

const nullable = (description: string) => ({ type: ["string", "null"], description });
const strictObject = (properties: Record<string, unknown>, description?: string) => ({
  type: "object",
  ...(description ? { description } : {}),
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});

export const INVOICE_TEMPLATE_SCHEMA: Record<string, unknown> = strictObject({
  issuer: strictObject(
    {
      name: nullable("The issuing business's trading name, as printed."),
      address: nullable("The issuing business's postal address, as printed, on one line."),
      email: nullable("The issuing business's email address, as printed."),
      phone: nullable("The issuing business's phone number, as printed."),
      website: nullable("The issuing business's website, as printed."),
      vatNumber: nullable("The issuing business's VAT registration number, as printed."),
      companyNumber: nullable("The Companies House company number, as printed."),
      utr: nullable("The Unique Taxpayer Reference (UTR), as printed. Null if none."),
    },
    "The business that ISSUED the invoice: the user's own business."
  ),
  bank: strictObject(
    {
      accountName: nullable("Bank account name / payee, as printed."),
      sortCode: nullable("Sort code, as printed (e.g. 12-34-56)."),
      accountNumber: nullable("Bank account number, as printed."),
      iban: nullable("IBAN, as printed."),
      reference: nullable("The payment reference the issuer asks to be quoted, as printed."),
    },
    "How the issuer asks to be paid."
  ),
  customer: strictObject(
    {
      name: nullable("The customer / bill-to name, as printed."),
      address: nullable("The customer's address, as printed, on one line."),
      email: nullable("The customer's email address, as printed."),
    },
    "Whoever the invoice is addressed to. An example customer only."
  ),
  invoiceNumber: nullable("The invoice number exactly as printed, e.g. INV-0042, without a label in front of it such as \"No.\", \"#\" or \"Invoice no.\"."),
  numberingPrefix: nullable(
    "The non-numeric prefix of the invoice number, e.g. \"INV-\" from INV-0042. Null if the number is digits only."
  ),
  dateAsPrinted: nullable("The invoice date copied EXACTLY as printed, character for character. Null if not printed."),
  dueDateAsPrinted: nullable("The due date copied EXACTLY as printed. Null if no due date is printed."),
  paymentTerms: nullable("Payment terms as printed, e.g. \"Payment due within 14 days\"."),
  currency: nullableEnum(CURRENCIES, "The currency the amounts are in, from its symbol or code. Null if GBP (£ or unmarked)."),
  showsVat: { type: "boolean", description: "True if VAT is itemised anywhere (a VAT line, VAT rate, or VAT number)." },
  cis: {
    type: "boolean",
    description:
      "True ONLY if a CIS deduction line appears or the invoice mentions CIS / the Construction Industry Scheme. Labour and materials on separate lines alone is NOT CIS.",
  },
  lineItems: {
    type: "array",
    description: "Every line item, in printed order.",
    items: strictObject({
      description: { type: "string" },
      quantity: { type: "number", description: "1 when no quantity is printed." },
      unitPrice: { type: "number", description: "Price per unit, ex VAT where the invoice shows it that way." },
      kind: {
        type: "string",
        enum: ["labour", "materials", "other"],
        description: "labour = work/time/days/hours; materials = goods/parts supplied; other = anything else.",
      },
    }),
  },
  notes: nullable("Any notes / thank-you / remarks block printed on the invoice, verbatim. Null if none."),
  footer: nullable("Any small print at the very bottom (registered office, legal text), verbatim. Null if none."),
  layout: strictObject(
    {
      headerAlignment: {
        type: "string",
        enum: ["left", "centre", "right"],
        description: "Where the business name / logo block sits across the top of the page.",
      },
      metaPosition: {
        type: "string",
        enum: ["right", "left", "below"],
        description: "Where the invoice number / date block sits relative to the business block.",
      },
      hasLogo: { type: "boolean", description: "True if a graphic logo is printed (not just the name in text)." },
      style: {
        type: "string",
        enum: ["classic", "modern", "compact"],
        description:
          "classic = traditional table with ruled lines and serif or plain type; modern = generous whitespace, bold headings, minimal rules; compact = dense, small type, little spacing.",
      },
    },
    "How the invoice is laid out, so the same look can be reproduced."
  ),
});

export const ROUGH_DOCUMENTS =
  "The document may be rough: handwritten, a home-made spreadsheet, a photo at an angle, faint, creased, partly " +
  "cropped or missing sections. Read everything that is there anyway -- handwriting included -- and never " +
  "discard a value because the layout is unusual or a label is missing: infer what a value is from its position " +
  "and format (a sort code looks like 12-34-56, a UK VAT number like GB123456789, an email has an @). Use null " +
  "only for something that is genuinely not on the page; when a value is there but hard to make out, give your " +
  "best reading rather than null.";

const PROMPT =
  "This is an example of the user's OWN issued invoice: the user is the ISSUER, the business whose name sits at " +
  "the top and whose VAT number and bank details are printed. Every attached image or PDF page is a page of the " +
  "SAME invoice, in order. Read it and record a template with the record_invoice_template tool. " +
  "Fill the issuer block (name, address, email, phone, website, VAT number, company number, UTR) from the issuer, " +
  "never from the customer. Capture the bank / payment details as printed. The customer block is whoever the " +
  "invoice is addressed to (bill to) -- an example customer only. Copy the invoice number exactly as printed and " +
  "give its non-numeric prefix pattern in numberingPrefix (e.g. \"INV-\"). This is a UK invoice, so numeric dates " +
  "are day/month/year: 08/09/26 is 8 September 2026, never 9 August. Copy the invoice date and the due date " +
  "EXACTLY as printed, character for character, into dateAsPrinted and dueDateAsPrinted (null when not printed). " +
  "Record the payment terms as printed and the currency (null for GBP). Set showsVat when VAT is itemised. Set cis " +
  "only when a CIS deduction line appears or CIS is mentioned -- separate labour and materials lines alone are not " +
  "CIS, and a wrong cis deducts 20% from the next invoice. List every line item with quantity " +
  "and unit price and classify each as labour, materials or other. Copy any notes block and any footer small print " +
  "verbatim. For layout: say where the business block sits (left/centre/right), where the invoice number and date " +
  "block sits (right/left/below the business block), whether there is a graphic logo, and whether the overall " +
  "style is classic, modern or compact. " +
  ROUGH_DOCUMENTS;

export async function extractInvoiceTemplate(pages: ScanPage[], engine: ScanEngine): Promise<InvoiceTemplate> {
  const raw = await extractStructured<InvoiceTemplateToolOutput>({
    engine,
    name: "record_invoice_template",
    description: "Records the issuer details, payment details, line items and layout of an invoice the user issued.",
    schema: INVOICE_TEMPLATE_SCHEMA,
    prompt: PROMPT,
    pages,
    maxTokens: 12000,
    effort: "low",
  });
  const { dateAsPrinted, dueDateAsPrinted, ...rest } = raw;
  return {
    ...rest,
    date: dateAsPrinted ? parsePrintedDate(dateAsPrinted).iso : null,
    dueDate: dueDateAsPrinted ? parsePrintedDate(dueDateAsPrinted).iso : null,
  };
}
