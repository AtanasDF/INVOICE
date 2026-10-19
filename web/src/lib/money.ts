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

// The same reading, but able to say "there is something here and it isn't a
// number". parseAmount answers 0 to both an empty box and to "12.50 per
// length", which is right for a form where 0 means nothing typed and wrong
// anywhere a price is being judged: a supplier answering a quote request
// that way had their line taken as £0.00 and won the comparison on it.
export function amountOrNull(text: string): number | null {
  let t = text.replace(/[\s£$€]/g, "");
  if (!t) return null;
  if (t.includes(",") && !t.includes(".") && /^-?\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// To the penny, and on the right side of a half: 0.5 x 0.35 is 0.17499... in
// floating point, which Math.round(n * 100) and toFixed(2) both take down to
// 0.17 where the document says 0.18.
export function roundMoney(n: number): number {
  return Math.round(Number((n * 100).toFixed(6))) / 100;
}
