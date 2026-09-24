import { lateCompensation } from "@/lib/reminderTemplates";

// What a business is entitled to when a business customer pays late, said
// ON THE INVOICE rather than only in a chasing email five weeks later.
//
// The Late Payment of Commercial Debts (Interest) Act 1998 gives a
// statutory right to interest at 8% above the Bank of England base rate,
// AND a fixed sum on top -- £40, £70 or £100 by the size of the debt. The
// right exists whether or not the invoice mentions it; saying so is what
// makes it real to whoever is deciding which invoice to pay this week, and
// it is the ordinary practice of every business that gets paid on time.
//
// Not one of the twelve apps in notes/competitor-research.md puts the
// fixed sums anywhere at all (notes say so, with sources), and most say
// nothing about the Act.
//
// Only for a business customer: the Act does not apply to a private
// individual, and telling somebody they owe statutory interest when they
// do not is both wrong and unpleasant.

export const STATUTORY_MARGIN = 8;

export function latePaymentLine(amountDue: number): string {
  return (
    `If this invoice is not paid by the date above we may charge statutory interest at ` +
    `${STATUTORY_MARGIN}% a year above the Bank of England base rate, and a fixed sum of ` +
    `£${lateCompensation(amountDue)}, under the Late Payment of Commercial Debts (Interest) Act 1998.`
  );
}

// Whether to print it: a business customer, and the owner has asked for it.
export function showsLatePaymentTerms(
  isCompany: boolean | null | undefined,
  optedIn: boolean | null | undefined
): boolean {
  return !!isCompany && !!optedIn;
}
