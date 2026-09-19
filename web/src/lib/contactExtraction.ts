import { extractStructured, type ScanEngine, type ScanPage } from "@/lib/extractors";
import { ROUGH_DOCUMENTS } from "@/lib/invoiceTemplate";

export type ContactRole = "issuer" | "recipient" | "other";

export type ScannedContact = {
  name: string;
  isCompany: boolean;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  vatNumber: string | null;
  companyNumber: string | null;
  website: string | null;
  role: ContactRole;
};

const nullable = (description: string) => ({ type: ["string", "null"], description });

const CONTACT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    contacts: {
      type: "array",
      description: "Every business or person named on the page with their details, most prominent first. Empty if none.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "The business name, or the person's full name when no business is named." },
          isCompany: { type: "boolean", description: "True for a business or organisation, false for an individual." },
          contactPerson: nullable("A named individual at the business, when both appear."),
          email: nullable("Email address, as printed."),
          phone: nullable("Phone number, as printed."),
          address: nullable("Postal address, as printed, on one line with commas."),
          vatNumber: nullable("VAT registration number, as printed."),
          companyNumber: nullable("Companies House / company registration number, as printed."),
          website: nullable("Website, as printed."),
          role: {
            type: "string",
            enum: ["issuer", "recipient", "other"],
            description:
              "issuer = the business that sent or issued the document (letterhead, the seller on an invoice, the card owner); recipient = who it is addressed or billed to; other = anyone else.",
          },
        },
        required: ["name", "isCompany", "contactPerson", "email", "phone", "address", "vatNumber", "companyNumber", "website", "role"],
      },
    },
  },
  required: ["contacts"],
};

const PROMPT =
  "This photo or file can be anything: a business card, a letterhead, an invoice, a receipt, an email or website " +
  "screenshot, a sign, a handwritten note. Find every business and person named on it and record their contact " +
  "details with the record_contacts tool: name, whether it is a company, a named contact person, email, phone, " +
  "postal address, VAT number, company number and website, each copied as printed. Say for each whether it is the " +
  "issuer (sender, seller, letterhead, card owner) or the recipient (addressed or billed to). Ignore amounts, dates " +
  "and line items. " +
  ROUGH_DOCUMENTS;

export async function extractContacts(pages: ScanPage[], engine: ScanEngine): Promise<ScannedContact[]> {
  const out = await extractStructured<{ contacts: ScannedContact[] }>({
    engine,
    name: "record_contacts",
    description: "Records the businesses and people named on a document, with their contact details.",
    schema: CONTACT_SCHEMA,
    prompt: PROMPT,
    pages,
    maxTokens: 8000,
  });
  return out.contacts.filter((c) => c.name.trim());
}
