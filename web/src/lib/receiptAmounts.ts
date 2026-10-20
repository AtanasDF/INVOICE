import { amountOrNull, roundMoney } from "@/lib/money";
import { readRate } from "@/lib/fx";

// What a receipt costs in pounds, worked out once for every screen that saves
// one. The by-hand form, the edit form, the scan page, the review queue and
// the email import each had their own copy, all of it unrounded and all of it
// through parseFloat: £19.99 with £3.33 VAT went into the record as
// 16.659999999999997, a EUR total at a four-place rate as a figure with a
// dozen decimals, and "1,200.00" typed in the box as £1. The record now holds
// whole pennies, VAT and the total each converted and rounded on their own,
// and net is the difference of the two -- so net plus VAT is exactly the total.
const pence = (n: number) => Math.round(roundMoney(n) * 100);

export function gbpFigures(total: number, vat: number, rate: number, credit = false) {
  const totalP = pence(total * rate);
  const vatP = pence(vat * rate);
  const netP = credit ? -(totalP - vatP) : Math.max(0, totalP - vatP);
  return { netGbp: netP / 100, vatGbp: (credit ? -vatP : vatP) / 100 };
}

// The rate has already been through rateProblem before anything is saved.
export function receiptGbp(totalText: string, vatText: string, currency: string, rateText: string, credit = false) {
  const total = amountOrNull(totalText) ?? 0;
  const vat = amountOrNull(vatText) ?? 0;
  if (currency === "GBP") {
    return { ...gbpFigures(total, vat, 1, credit), originalAmount: null, originalVatAmount: null, originalCurrency: null, fxRate: null };
  }
  const rate = readRate(rateText) || 0;
  return { ...gbpFigures(total, vat, rate, credit), originalAmount: total, originalVatAmount: vat, originalCurrency: currency, fxRate: rate };
}

// The review queue shows a converted document in pounds and asks for the
// pounds to be corrected if the conversion looks off. A correction there
// left the original figures and the rate in place, so the next Edit on
// /receipts refilled the form from them and Save quietly put the old
// conversion back. Once the pounds no longer follow from the rate, the rate is
// dropped and the row is edited as the pounds it holds; the original figures
// stay as the record of what the document said.
export function rateAfterReview(stored: { amount: number; vatAmount: number; fxRate: number | null }, next: { netGbp: number; vatGbp: number }) {
  if (stored.fxRate === null) return null;
  const same = pence(stored.amount) === pence(next.netGbp) && pence(stored.vatAmount) === pence(next.vatGbp);
  return same ? stored.fxRate : null;
}

// What the document itself says it cost, VAT included: the figure a tile
// beside its photograph should show. receipts.amount is net, so a £12 receipt
// read "£10.00" under a picture that says £12.
export const grossOf = (r: { amount: number; vatAmount: number }) => roundMoney(r.amount + r.vatAmount);
