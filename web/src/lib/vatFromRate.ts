// A till receipt often prints the VAT rate ("VAT 20%", "incl. VAT @ 20%")
// and no VAT figure at all: Atanas's first real scan (GO OUTDOORS, £29.00,
// 2026-09-22) came back with the VAT box empty for exactly that reason,
// and an empty box is £0 in box 4 of the VAT return. The reader reports the
// printed rate; the arithmetic is done here, not by the model, and the
// figure is marked as worked out so the person reviewing it sees why.

/** The VAT inside a gross total at a printed rate, to the penny; null when there is nothing to work out. */
export function vatFromRate(total: number | null | undefined, rate: number | null | undefined): number | null {
  if (total == null || rate == null || !(total > 0) || !(rate > 0) || rate >= 100) return null;
  return Math.round((total - total / (1 + rate / 100)) * 100) / 100;
}

/** The VAT to use for a reading: what was printed, else what the printed rate gives, with a note of which. */
export function vatForReading(r: { totalAmount: number | null; vatAmount: number | null; vatAmountConfidence: "high" | "low"; vatRate?: number | null }): {
  vatAmount: number | null;
  vatAmountConfidence: "high" | "low";
  workedOutFromRate: number | null;
} {
  if (r.vatAmount !== null) return { vatAmount: r.vatAmount, vatAmountConfidence: r.vatAmountConfidence, workedOutFromRate: null };
  const worked = vatFromRate(r.totalAmount, r.vatRate);
  if (worked === null) return { vatAmount: null, vatAmountConfidence: r.vatAmountConfidence, workedOutFromRate: null };
  return { vatAmount: worked, vatAmountConfidence: "low", workedOutFromRate: r.vatRate! };
}

export const workedOutNote = (rate: number) => `VAT worked out from the ${rate}% rate printed; the document shows no VAT figure.`;
