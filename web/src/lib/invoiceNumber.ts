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
