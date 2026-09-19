import type { Quote } from "@/lib/storage";

const LABELS = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined", invoiced: "Invoiced", expired: "Expired" };
const BADGES = {
  draft: "bg-neutral-100 text-neutral-800",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  invoiced: "bg-neutral-100 text-neutral-800",
  expired: "bg-amber-100 text-amber-800",
};

// A sent quote past its date shows as expired; it can still be accepted.
function shownStatus(q: Pick<Quote, "status" | "validUntil">, today: string): keyof typeof LABELS {
  return q.status === "sent" && q.validUntil && q.validUntil < today ? "expired" : q.status;
}

export function quoteStatusLabel(q: Pick<Quote, "status" | "validUntil">, today: string): string {
  return LABELS[shownStatus(q, today)];
}

export function quoteStatusBadgeClass(q: Pick<Quote, "status" | "validUntil">, today: string): string {
  return BADGES[shownStatus(q, today)];
}

// "30 days" → 30, "Upon receipt" → 0; anything else has no length.
export function termsLength(terms: string): number | null {
  const m = /(\d+)\s*days?/i.exec(terms);
  if (m) return Number(m[1]);
  return /receipt|immediate/i.test(terms) ? 0 : null;
}
