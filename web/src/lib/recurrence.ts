// UTC methods throughout -- constructing a Date from local fields (or a
// "T00:00:00" local-time string) and then converting back with
// toISOString() shifts the result by a day whenever the viewer's timezone
// offset isn't zero. Confirmed this breaks in either direction depending
// on the offset (tested across several real timezones), not just for
// unusual ones, so every step here stays anchored to UTC. Shared between
// recurring expenses and recurring invoices -- same monthly-schedule math
// either way.
import { todayISO } from "@/lib/today";

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function nextDueFromDay(dayOfMonth: number): string {
  const todayStr = todayISO();
  const [y, m] = todayStr.split("-").map(Number);
  const candidate = new Date(Date.UTC(y, m - 1, dayOfMonth));
  if (candidate.toISOString().slice(0, 10) < todayStr) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  }
  return candidate.toISOString().slice(0, 10);
}
