// UK VAT rate categories. zero-rated, exempt, and reverse-charge all
// contribute £0 VAT but are legally distinct categories worth keeping
// separate on the invoice rather than collapsing into one "0%" bucket --
// zero-rated goods are still "vatable" for VAT-return purposes, exempt
// supplies aren't, and reverse-charge shifts the VAT liability to the
// customer entirely.
export const VAT_RATES = {
  standard: 0.2,
  reduced: 0.05,
  zero: 0,
  exempt: 0,
  reverse_charge: 0,
  reverse_charge_reduced: 0,
} as const;

export type VatRateKind = keyof typeof VAT_RATES;

export const VAT_RATE_LABELS: Record<VatRateKind, string> = {
  standard: "Standard (20%)",
  reduced: "Reduced (5%)",
  zero: "Zero-rated (0%)",
  exempt: "Exempt",
  // Two of them, because HMRC require the invoice to state the VAT the
  // customer must account for -- or at least the rate -- and a single
  // "reverse charge" kind cannot say whether that is 20% or 5%. See
  // src/lib/reverseCharge.ts.
  reverse_charge: "Reverse charge (20%)",
  reverse_charge_reduced: "Reverse charge (5%)",
};

export const VAT_RATE_KINDS = Object.keys(VAT_RATES) as VatRateKind[];

export type VatLineItem = {
  quantity: number;
  unitPrice: number;
  vatRate: VatRateKind;
};

export type VatBreakdownEntry = { kind: VatRateKind; net: number; vat: number };

export type InvoiceTotals = {
  subtotal: number;
  vatByRate: VatBreakdownEntry[];
  totalVat: number;
  total: number;
};

/**
 * Subtotal, VAT grouped by rate (only rates actually used, in a stable
 * order), and the grand total. When vatRegistered is false the whole
 * concept doesn't apply -- every line is treated as vat-free and the
 * total is just the subtotal, since an unregistered business can't
 * charge VAT at all.
 */
export function computeInvoiceTotals(items: VatLineItem[], vatRegistered: boolean): InvoiceTotals {
  // Worked in whole pence: each rate's net rounded, its VAT rounded once
  // from that, and the total the sum of the two. Every screen, PDF, email
  // and balance then agrees to the penny (half-pennies from 5% VAT or
  // half quantities used to print one way and be owed the other).
  const pence = (n: number) => Math.round(n * 100);

  if (!vatRegistered) {
    const subtotal = pence(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)) / 100;
    return { subtotal, vatByRate: [], totalVat: 0, total: subtotal };
  }

  const byRate = new Map<VatRateKind, number>();
  for (const item of items) byRate.set(item.vatRate, (byRate.get(item.vatRate) ?? 0) + item.quantity * item.unitPrice);

  const vatByRate = VAT_RATE_KINDS.filter((k) => byRate.has(k)).map((kind) => {
    const net = pence(byRate.get(kind)!);
    return { kind, net: net / 100, vat: Math.round(net * VAT_RATES[kind]) / 100 };
  });
  const subtotalPence = vatByRate.reduce((s, e) => s + pence(e.net), 0);
  const vatPence = vatByRate.reduce((s, e) => s + pence(e.vat), 0);

  return { subtotal: subtotalPence / 100, vatByRate, totalVat: vatPence / 100, total: (subtotalPence + vatPence) / 100 };
}
