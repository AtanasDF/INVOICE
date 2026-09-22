// Dates as people say them: "1 Oct 2026", never 2026-10-01 on a screen.
// Parsed at UTC midnight and printed in UTC so a date string is never
// shifted by the viewer's clock (see src/lib/today.ts for why that matters).
export const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
