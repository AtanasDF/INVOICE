import { addDays } from "@/lib/reminderTemplates";

// One push on a Monday: what came in last week, what is overdue, what is
// due this week, whose quote is waiting. Short enough to read on the way to
// a job, which is the whole specification -- a notification nobody finishes
// reading is a notification nobody reads.

export type WeekFigures = {
  paidIn: number;
  paidCount: number;
  overdueCount: number;
  overdueTotal: number;
  dueThisWeek: number;
  dueThisWeekTotal: number;
  billsDue: number;
  quotesWaiting: number;
};

// Monday to Sunday, the week just gone. Dates are compared as strings, so
// this is the same reckoning the rest of the app uses.
export function lastWeek(monday: string): { from: string; to: string } {
  return { from: addDays(monday, -7), to: addDays(monday, -1) };
}

const money = (n: number) =>
  `£${Math.round(n).toLocaleString("en-GB")}`;

// Everything is a whole pound: this is a glance on a phone, not a ledger,
// and "£1,240 came in" reads where "£1,239.67" does not.
export function weeklySummary(f: WeekFigures): { title: string; body: string } | null {
  const parts: string[] = [];

  if (f.paidCount > 0) parts.push(`${money(f.paidIn)} came in last week`);
  if (f.overdueCount > 0) parts.push(`${money(f.overdueTotal)} overdue`);
  if (f.dueThisWeek > 0) parts.push(`${money(f.dueThisWeekTotal)} due this week`);
  if (f.billsDue > 0) parts.push(`${f.billsDue} ${f.billsDue === 1 ? "bill" : "bills"} to pay`);
  if (f.quotesWaiting > 0) parts.push(`${f.quotesWaiting} ${f.quotesWaiting === 1 ? "quote" : "quotes"} waiting on an answer`);

  // Nothing owed, nothing owing, nothing received: there is no news, and a
  // push that says "nothing happened" is one nobody wants on a Monday.
  if (!parts.length) return null;

  return { title: "Your week", body: `${parts.join(" · ")}.` };
}
