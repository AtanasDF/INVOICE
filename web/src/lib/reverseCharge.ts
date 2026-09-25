import { VAT_RATES, type VatLineItem, type VatRateKind } from "@/lib/vat";

// The VAT domestic reverse charge for building and construction services,
// in force since 1 March 2021. Read from HMRC's own guidance on
// 2026-09-25, not from memory.
//
// It applies when the supplier and the customer are both UK VAT
// registered, the payment is reported under CIS, the work is standard or
// reduced rated, and the customer has NOT told the supplier in writing
// that they are an end user or an intermediary supplier. When it applies
// the supplier charges NO VAT: the customer accounts for it instead.
//
// The app already had a reverse-charge rate, and already left the VAT off
// the total. What it did not do was say so on the invoice, which is the
// part the law is specific about. The VAT Regulations 1995 require the
// words "reverse charge", and HMRC require the invoice to make clear the
// customer must account for the VAT and to state how much VAT is due --
// or, if that cannot be shown, the rate.
//
// Stating the amount is why there are two kinds rather than one: a single
// "reverse charge" cannot tell you whether the customer owes 20% or 5%.

export const REVERSE_CHARGE_RATES: Record<string, number> = {
  reverse_charge: VAT_RATES.standard,
  reverse_charge_reduced: VAT_RATES.reduced,
};

export function isReverseCharge(kind: VatRateKind): boolean {
  return kind in REVERSE_CHARGE_RATES;
}

export function hasReverseCharge(items: { vatRate: VatRateKind }[]): boolean {
  return items.some((i) => isReverseCharge(i.vatRate));
}

export type ReverseChargeLine = { kind: VatRateKind; rate: number; net: number; vat: number };

// What the customer must account for, per rate. Worked in whole pence like
// every other total in the app, so the figure on the invoice and the figure
// the customer puts on their return are the same to the penny.
export function reverseChargeBreakdown(items: VatLineItem[]): ReverseChargeLine[] {
  const pence = (n: number) => Math.round(n * 100);
  const byKind = new Map<VatRateKind, number>();
  for (const i of items) {
    if (!isReverseCharge(i.vatRate)) continue;
    byKind.set(i.vatRate, (byKind.get(i.vatRate) ?? 0) + i.quantity * i.unitPrice);
  }
  return [...byKind.entries()].map(([kind, raw]) => {
    const net = pence(raw);
    const rate = REVERSE_CHARGE_RATES[kind];
    return { kind, rate, net: net / 100, vat: Math.round(net * rate) / 100 };
  });
}

export function reverseChargeVat(items: VatLineItem[]): number {
  return Math.round(reverseChargeBreakdown(items).reduce((s, l) => s + l.vat * 100, 0)) / 100;
}

// The words the VAT Regulations 1995 require. HMRC list four acceptable
// forms; this is the one that names the section, because a contractor's
// bookkeeper recognises it.
export const REVERSE_CHARGE_WORDING = "Reverse charge: VAT Act 1994 Section 55A applies";

const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Said plainly under the legal form of words, because "Section 55A" tells
// somebody holding the invoice nothing about what to do.
export function reverseChargeNote(items: VatLineItem[]): string | null {
  const lines = reverseChargeBreakdown(items);
  if (!lines.length) return null;
  const parts = lines.map((l) => `${money(l.vat)} at ${Math.round(l.rate * 100)}% on ${money(l.net)}`);
  return `Customer to pay the VAT to HMRC: ${parts.join(", and ")}. It is not included in the total above.`;
}

// A credit note against reverse-charged work reduces what the customer owes
// HMRC, so it has to say by how much (HMRC's own example wording).
export function reverseChargeCreditNote(vat: number): string {
  return `Reverse charge: customer to account for the output tax adjustment of ${money(vat)} to HMRC.`;
}
