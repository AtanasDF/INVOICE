import type { InvoiceTemplate } from "@/lib/invoiceTemplate";
import type { BusinessProfile, SavableBusinessProfile } from "@/lib/storage";

// One photo of an invoice somebody has already sent, turned into their
// account: name, address, numbers, bank details and that customer, so the
// next invoice needs only its lines (Atanas, 2026-10-22: "with a click they
// can create the invoice because they have everything set up").
//
// Only what the reading found is offered, and a box that already holds
// something is offered unticked: a photo never quietly overwrites what
// somebody typed themselves (CLAUDE.md, "only fill in what the reading is
// sure of").

export type SetupField = "businessName" | "address" | "vatNumber" | "companyNumber" | "bankDetails" | "numbering";

export type SetupOffer = {
  field: SetupField;
  label: string;
  value: string;
  // Ticked to begin with: the box is empty now.
  fillsEmpty: boolean;
};

export type SetupNumbering = { prefix: string; next: number };

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+\n/g, "\n").trim();

export function bankText(bank: InvoiceTemplate["bank"]): string {
  const lines = [
    bank.accountName && `Account name: ${bank.accountName}`,
    bank.sortCode && `Sort code: ${bank.sortCode}`,
    bank.accountNumber && `Account number: ${bank.accountNumber}`,
    bank.iban && `IBAN: ${bank.iban}`,
  ].filter(Boolean) as string[];
  // A sort code or account number on its own is not something to pay into.
  const payable = !!(bank.sortCode && bank.accountNumber) || !!bank.iban;
  return payable ? lines.join("\n") : "";
}

// "INV-0042" -> carry on at INV-0043. The prefix keeps the zeros in front of
// the number, so 0043 prints as 0043; a number that is only a year, or has no
// digits at all, gives nothing rather than a guess.
export function numberingAfter(invoiceNumber: string | null | undefined): SetupNumbering | null {
  const n = clean(invoiceNumber).replace(/^(invoice|inv)\s*(no\.?|number|#)\s*/i, "");
  const m = n.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  const [, lead, digits] = m;
  const value = Number(digits);
  if (!Number.isFinite(value) || (digits.length === 4 && value >= 1990 && value <= 2100 && !lead)) return null;
  const width = digits.length;
  const next = value + 1;
  const pad = String(next).length < width ? "0".repeat(width - String(next).length) : "";
  return { prefix: lead + pad, next };
}

export function setupOffers(
  t: InvoiceTemplate,
  profile: Pick<BusinessProfile, "businessName" | "address" | "vatNumber" | "companyNumber" | "bankDetails" | "invoicePrefix" | "invoiceNextNumber">
): SetupOffer[] {
  const empty = (s: string | null | undefined) => !clean(s) || clean(s).toUpperCase() === "PLACEHOLDER";
  const out: SetupOffer[] = [];
  const add = (field: SetupField, label: string, value: string, current: string) => {
    if (value && value !== clean(current)) out.push({ field, label, value, fillsEmpty: empty(current) });
  };
  add("businessName", "Business name", clean(t.issuer.name), profile.businessName);
  add("address", "Address", clean(t.issuer.address), profile.address);
  add("vatNumber", "VAT number", clean(t.issuer.vatNumber), profile.vatNumber);
  add("companyNumber", "Company number", clean(t.issuer.companyNumber), profile.companyNumber);
  add("bankDetails", "Bank details", bankText(t.bank), profile.bankDetails);
  const numbering = numberingAfter(t.invoiceNumber);
  if (numbering) {
    const shown = `${numbering.prefix}${numbering.next}`;
    const untouched = profile.invoiceNextNumber <= 1 && !clean(profile.invoicePrefix);
    if (shown !== `${profile.invoicePrefix}${profile.invoiceNextNumber}`) {
      out.push({ field: "numbering", label: "Next invoice number", value: shown, fillsEmpty: untouched });
    }
  }
  return out;
}

// The profile with the ticked offers written in. Numbering is read again from
// the reading rather than from the shown text, so prefix and number stay apart.
export function applySetup(profile: SavableBusinessProfile, t: InvoiceTemplate, ticked: SetupField[]): SavableBusinessProfile {
  const next = { ...profile };
  for (const o of setupOffers(t, profile)) {
    if (!ticked.includes(o.field)) continue;
    if (o.field === "numbering") {
      const n = numberingAfter(t.invoiceNumber)!;
      next.invoicePrefix = n.prefix;
      next.invoiceNextNumber = n.next;
    } else {
      next[o.field] = o.value;
    }
  }
  return next;
}

// The customer on the invoice, if it names one and they are not already a
// contact under the same name.
export function setupCustomer(t: InvoiceTemplate, existingNames: string[]): { name: string; address: string; email: string } | null {
  const name = clean(t.customer.name);
  if (!name) return null;
  const same = (a: string) => a.trim().toLowerCase().replace(/\s+/g, " ");
  if (existingNames.some((n) => same(n) === same(name))) return null;
  return { name, address: clean(t.customer.address), email: clean(t.customer.email) };
}
