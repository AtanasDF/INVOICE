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
} as const;

export type VatRateKind = keyof typeof VAT_RATES;

export const VAT_RATE_LABELS: Record<VatRateKind, string> = {
  standard: "Standard (20%)",
  reduced: "Reduced (5%)",
  zero: "Zero-rated (0%)",
  exempt: "Exempt",
  reverse_charge: "Reverse charge",
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
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  if (!vatRegistered) {
    return { subtotal, vatByRate: [], totalVat: 0, total: subtotal };
  }

  const byRate = new Map<VatRateKind, { net: number; vat: number }>();
  for (const item of items) {
    const net = item.quantity * item.unitPrice;
    const vat = net * VAT_RATES[item.vatRate];
    const entry = byRate.get(item.vatRate) ?? { net: 0, vat: 0 };
    entry.net += net;
    entry.vat += vat;
    byRate.set(item.vatRate, entry);
  }

  const vatByRate = VAT_RATE_KINDS.filter((k) => byRate.has(k)).map((kind) => ({ kind, ...byRate.get(kind)! }));
  const totalVat = vatByRate.reduce((s, e) => s + e.vat, 0);

  return { subtotal, vatByRate, totalVat, total: subtotal + totalVat };
}
