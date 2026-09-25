import { hasReverseCharge } from "@/lib/reverseCharge";
import type { VatRateKind } from "@/lib/vat";

// Whether to ask "should this be reverse charge?" while an invoice is being
// written.
//
// The rate has been in the picker for a long time and almost nobody picked
// it, because almost nobody knows the rule exists. A plasterer who has
// switched CIS on for a limited company is describing, in the app's own
// terms, the exact situation the reverse charge covers -- so the app knows
// enough to ask, and asking is the whole feature.
//
// It ASKS rather than decides. Two of the four conditions are things only
// the person knows: whether the customer is really VAT registered, and
// whether they have sent a written end-user declaration. Getting it wrong
// in either direction is a tax error, so the app offers and they choose.

export type ReverseChargeAsk = {
  // The lines that would change, by index.
  lines: number[];
  // Standard-rated lines become the 20% kind, reduced the 5% one.
  becomes: Record<number, VatRateKind>;
};

const SHIFTS: Partial<Record<VatRateKind, VatRateKind>> = {
  standard: "reverse_charge",
  reduced: "reverse_charge_reduced",
};

export function reverseChargeAsk({
  vatRegistered,
  cisRate,
  customerIsCompany,
  customerVatNumber,
  endUserDeclared,
  items,
}: {
  vatRegistered: boolean;
  cisRate: number | null;
  customerIsCompany: boolean;
  customerVatNumber: string;
  // The customer has said in writing that they are an end user or an
  // intermediary supplier. Their statement, not our guess -- and it turns
  // the whole thing off.
  endUserDeclared: boolean;
  items: { vatRate: VatRateKind }[];
}): ReverseChargeAsk | null {
  if (!vatRegistered || cisRate === null || endUserDeclared) return null;
  // A private customer cannot be VAT registered, so the charge cannot apply.
  if (!customerIsCompany && !customerVatNumber.trim()) return null;
  if (hasReverseCharge(items)) return null;

  const becomes: Record<number, VatRateKind> = {};
  const lines: number[] = [];
  items.forEach((item, i) => {
    const to = SHIFTS[item.vatRate];
    // Zero-rated and exempt work is outside the charge entirely.
    if (!to) return;
    lines.push(i);
    becomes[i] = to;
  });
  return lines.length ? { lines, becomes } : null;
}

export const REVERSE_CHARGE_ASK_TITLE = "Should this invoice charge VAT at all?";

export const REVERSE_CHARGE_ASK_BODY =
  "This is CIS work for a business. If they are VAT registered, you must not charge them the VAT — they pay it to HMRC themselves, and the invoice has to say so. " +
  "Charge it anyway and they cannot reclaim it.";

export const REVERSE_CHARGE_ASK_UNLESS =
  "Unless they have told you in writing that they are an end user, which most builders are not — they pass the work on.";
