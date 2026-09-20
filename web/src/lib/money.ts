// Money as it reads on a phone: grouped thousands, always two decimals,
// a real minus sign. One formatter, so a figure looks the same on the
// dashboard, the invoice, the PDF and an email.
export function money(n: number): string {
  const shown = (Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `−£${shown.replace("-", "")}` : `£${shown}`;
}

// The same figure without its £, for a line that says the currency itself.
export function amount(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
