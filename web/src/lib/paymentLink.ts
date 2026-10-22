// "Pay now" without us taking payments: somebody pastes a link they already
// have -- SumUp, Stripe, PayPal.me, Monzo or Starling -- and their invoices
// carry it as a button beside the bank details. No money passes through us
// (notes/launch-simplify.md).
//
// Only an https address is ever shown: it goes in front of their customers,
// on their invoice, so a mistyped or hostile one must never become a link.

const KNOWN: [RegExp, string][] = [
  [/(^|\.)sumup\.(com|co\.uk|me)$|(^|\.)pay\.sumup\./, "SumUp"],
  [/(^|\.)stripe\.com$|(^|\.)buy\.stripe\.com$/, "Stripe"],
  [/(^|\.)paypal\.(me|com)$/, "PayPal"],
  [/(^|\.)monzo\.(me|com)$/, "Monzo"],
  [/(^|\.)starlingbank\.com$|(^|\.)settleup\.starlingbank\.com$/, "Starling"],
  [/(^|\.)squareup\.com$|(^|\.)square\.link$/, "Square"],
  [/(^|\.)revolut\.(me|com)$/, "Revolut"],
];

export function safePaymentLink(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:/i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) return null;
  return url.toString();
}

// The button says whose page it opens, so a customer is not surprised.
export function payLabel(link: string): string {
  const host = new URL(link).hostname.toLowerCase();
  const known = KNOWN.find(([re]) => re.test(host));
  return known ? `Pay with ${known[1]}` : "Pay now";
}
