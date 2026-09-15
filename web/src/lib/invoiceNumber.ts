export function suggestedInvoiceNumber(prefix: string, nextNumber: number): string {
  return `${prefix}${nextNumber}`;
}

/** The trailing integer from a number sharing the given prefix, or null if it doesn't have that shape. */
export function parseSequenceNumber(number: string, prefix: string): number | null {
  if (!prefix || !number.startsWith(prefix)) return null;
  const rest = number.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  return parseInt(rest, 10);
}

// A draft doesn't have a real invoice number yet -- it's only assigned
// when the invoice is marked sent, which is the point at which it's
// actually been issued. The invoices.number column is required and
// unique(user_id, number) though, so a brand-new draft still needs some
// distinct value in the meantime; this placeholder fills that in without
// reserving a slot in the real sequence or touching the shared counter.
export function draftPlaceholderNumber(): string {
  return `DRAFT-${crypto.randomUUID()}`;
}
