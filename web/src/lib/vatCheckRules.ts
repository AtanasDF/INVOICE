import { ukDate } from "@/lib/today";

// The rules about kept VAT checks, in one place and free of the database,
// so harness/test-vat-checks.mjs can hold the real ones rather than a copy
// of them -- the same reason every rule about what a photograph may lose
// lives in photoAgeing.ts and not in its handler.

// Stored without the GB and without punctuation, as HMRC hold it. The same
// number typed "GB123456789" one day and "123 4567 89" the next has to be
// one history, or the evidence for a supplier is split across two spellings
// of their number and neither looks complete.
export const vatCheckKey = (n: string) => n.replace(/[^a-z0-9]/gi, "").toUpperCase().replace(/^(GB|XI)/, "");

export const sameVatNumber = (a: string, b: string) => {
  const key = vatCheckKey(a);
  return !!key && key === vatCheckKey(b);
};

type Kept = { vatNumber: string; consultationNumber: string | null; checkedAt: string };

// Only a check carrying HMRC's consultation number counts as kept. A plain
// lookup says what HMRC's database held at the time but proves nothing
// afterwards, so showing it as evidence would overstate it.
export const keptFor = <T extends Kept>(checks: T[], number: string): T[] => {
  const key = vatCheckKey(number);
  return key ? checks.filter((c) => c.vatNumber === key && c.consultationNumber) : [];
};

// One kept reference per number per day. HMRC issue a consultation number
// per request, so without this every save of the same contact would write
// another row proving the same thing on the same day.
//
// The day is reckoned in Europe/London, like every other day in this app:
// slicing the ISO timestamp would ask UTC, and for the hour after midnight
// on a summer night UTC is still on yesterday -- which would let a second
// reference through at 00:30 in July and refuse one at 23:30.
export const alreadyKeptToday = (checks: Kept[], number: string, when: string) => {
  const day = ukDate(when);
  return !!day && keptFor(checks, number).some((c) => ukDate(c.checkedAt) === day);
};
