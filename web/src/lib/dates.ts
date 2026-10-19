import { ukDate } from "@/lib/today";

// Dates as people say them: "1 Oct 2026", never 2026-10-01 on a screen.
// Parsed at UTC midnight and printed in UTC so a date string is never
// shifted by the viewer's clock (see src/lib/today.ts for why that matters).
//
// A full timestamp is a moment, not a day, and its first ten characters are
// the UTC day: a quote request made at 00:30 in summer said "asked" the day
// before. A moment is turned into its London day first.
export const dayOf = (iso: string) => (iso.length > 10 ? ukDate(iso) || iso.slice(0, 10) : iso);

export const shortDate = (iso: string) =>
  new Date(`${dayOf(iso)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
