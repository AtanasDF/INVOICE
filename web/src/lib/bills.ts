import { addDays } from "@/lib/today";
import type { Receipt } from "@/lib/storage";

// What counts as a bill, and when one is due soon enough to say so.
//
// Both were written out four times. The rule -- a supplier invoice, not paid,
// not still waiting to be checked -- lived in the dashboard and again in
// moneyScreen.ts and again as three .eq() filters in the push cron. The window
// was the bare number 3 in the dashboard's label, the dashboard's banner count,
// the receipts list's amber badge and the cron's query.
//
// They agreed. That is not the point: `addMonths` agreed too, until the day a
// second copy without the month-end clamp printed a one-month warranty as
// lasting "until 3 March", and the recurring-invoice cron and the button on the
// recurring page disagreed about what 31 January plus a month is. A rule stated
// once in CLAUDE.md and implemented four times with a magic number is the same
// arrangement waiting for the same accident.
//
// So: one definition, one number, and harness/test-bills.mjs checks that no
// screen has quietly grown its own copy again.
//
// `daysBetween` is counted here rather than imported because it is itself
// written out FOUR times -- app/page.tsx, app/receipts/page.tsx,
// lib/duplicates.ts and lib/freeInvoiceDraft.ts -- and the copies are not
// equivalent: duplicates.ts returns an UNSIGNED difference and does not round,
// so anybody reusing it for "is this overdue" would get the wrong sign without
// a word. Giving that primitive a single home is its own change; this file
// does not depend on which copy wins.
//
// Both endpoints are bare YYYY-MM-DD, which JavaScript parses as UTC midnight,
// so the difference is an exact multiple of a day even across a BST boundary --
// the rounding is belt and braces, not a fudge.

// Within this many days -- or already late -- is "due soon".
//
// Three days is deliberately short, and the asymmetry matters: the dashboard's
// "Bills to pay" card lists EVERY unpaid bill however far off, because that is
// what a list of what you owe is for, while the amber banner, the push cron and
// the badge on the app icon count only these. Nothing should nag about a bill
// due in a fortnight.
export const BILL_DUE_SOON_DAYS = 3;

/**
 * A supplier invoice that still has to be paid.
 *
 * One waiting to be reviewed is NOT a bill: nobody should be chased for a
 * figure a machine read off a photograph and no person has looked at yet.
 */
export function isBill(r: Pick<Receipt, "documentType" | "paid" | "needsReview">): boolean {
  return r.documentType === "invoice" && !r.paid && !r.needsReview;
}

/**
 * Whether a bill is due within the window, or is already late.
 *
 * A bill with no due date is never "soon" -- there is nothing to count from,
 * and guessing one would invent a deadline for somebody. It still shows in the
 * list of what is owed.
 */
export function dueSoon(dueDate: string | null, today: string): boolean {
  return !!dueDate && daysBetween(today, dueDate) <= BILL_DUE_SOON_DAYS;
}

/** Whole days from one plain date to another, negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The same rule as `isBill`, as database columns, for the one caller that has
 * to ask Postgres rather than a list: the push cron. Written here so the rule
 * is in ONE place rather than two that happen to agree -- Supabase's
 * `.match()` applies an equality filter per key.
 */
export const BILL_COLUMNS = { document_type: "invoice", paid: false, needs_review: false } as const;

/** The latest due date that counts as soon, for a query that filters in SQL. */
export function dueSoonBy(today: string): string {
  return addDays(today, BILL_DUE_SOON_DAYS);
}
