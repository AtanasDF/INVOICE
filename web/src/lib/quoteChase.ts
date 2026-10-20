import { daysBetween } from "@/lib/bills";
import { ukDate } from "@/lib/today";

// Quiet for this long after sending is worth a nudge.
export const QUIET_DAYS = 5;

type Chased = { status: string; date: string; sentAt: string | null; validUntil: string | null };

// How long a quote has been with the customer. From the real send when there
// is one (migration-042); a quote sent before that, or on a database without
// the column, has only its own date -- often the day it was drafted -- and
// the wording says so rather than claiming a send nobody recorded.
export function quoteAge(q: Pick<Chased, "date" | "sentAt">, today: string): { days: number; since: "sent" | "dated" } {
  const sent = q.sentAt ? ukDate(q.sentAt) : "";
  return sent ? { days: daysBetween(sent, today), since: "sent" } : { days: daysBetween(q.date, today), since: "dated" };
}

export function quoteAgeText(q: Pick<Chased, "date" | "sentAt">, today: string): string {
  const { days, since } = quoteAge(q, today);
  return `${since} ${days} ${days === 1 ? "day" : "days"} ago`;
}

// Sent, still good, and quiet for long enough to be worth a nudge.
export function isQuietQuote(q: Chased, today: string): boolean {
  return q.status === "sent" && quoteAge(q, today).days >= QUIET_DAYS && (!q.validUntil || q.validUntil >= today);
}
