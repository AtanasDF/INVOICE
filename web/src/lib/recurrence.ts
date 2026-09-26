// UTC methods throughout -- constructing a Date from local fields (or a
// "T00:00:00" local-time string) and then converting back with
// toISOString() shifts the result by a day whenever the viewer's timezone
// offset isn't zero. Confirmed this breaks in either direction depending
// on the offset (tested across several real timezones), not just for
// unusual ones, so every step here stays anchored to UTC.
import { todayISO } from "@/lib/today";

// A month end CLAMPS, it does not roll over. `setUTCMonth` rolls: 31 January
// plus a month is 3 March, and every step after it is on the 3rd for ever.
// It matters because two different things advance the same column --
// `addMonths` when somebody presses the button on the recurring page, and
// `next_due_date + interval '1 month'` inside generate_recurring_invoice
// (migration-013) when the nightly cron does it. Postgres clamps. So a
// schedule advanced by hand and one advanced by the cron drifted apart on any
// day past the 28th, and whichever ran last won. The day picker clamps to 28,
// which is the only reason it never showed; the warranty date on the receipts
// list has no such clamp and read "1 month" from 31 January as 31 days.
function lastDayOf(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function onDay(year: number, monthIndex: number, dayOfMonth: number): string {
  const safe = Math.min(dayOfMonth, lastDayOf(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, safe)).toISOString().slice(0, 10);
}

export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  return onDay(target.getUTCFullYear(), target.getUTCMonth(), d);
}

export function nextDueFromDay(dayOfMonth: number): string {
  const todayStr = todayISO();
  const [y, m] = todayStr.split("-").map(Number);
  const candidate = onDay(y, m - 1, dayOfMonth);
  return candidate < todayStr ? onDay(y, m, dayOfMonth) : candidate;
}
