// What day it is, as a UK business reckons it.
//
// Everything used to ask `new Date().toISOString().slice(0, 10)`, which is
// the date in UTC. Britain is UTC+1 from late March to late October, so for
// a full hour after midnight every summer night the app believed it was
// still yesterday -- while two places (the scan page and the Free-invoice
// draft) built their date from the local clock and believed it was today.
//
// An hour a day is not a corner: this is an app for someone who does the
// paperwork after the job. In that hour a receipt typed in got yesterday's
// date written into his accounting record, an invoice due that day wasn't
// flagged overdue, a sale on the first of a quarter landed in the previous
// quarter's VAT, and a freshly issued invoice dropped out of the tax card
// entirely -- because its own date was "tomorrow" by the card's reckoning.
//
// Europe/London rather than the browser's own zone: these are UK accounting
// records, and the app is UK throughout (HMRC rates, CIS, the 6 April tax
// year, VAT quarters, postcodes). The day a sale belongs to should not
// change because the phone is in Spain. On a UK machine the two agree.
//
// en-CA gives ISO order (YYYY-MM-DD) from Intl, which is the format every
// date in this app is stored and compared in.
const UK_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayISO(): string {
  return UK_DATE.format(new Date());
}

// The London date of some other moment -- a timestamp from the database, or
// HMRC's processingDate. Same reckoning as todayISO(), for the same reason:
// `someIso.slice(0, 10)` is the UTC date, which for the hour after midnight
// on a summer night is yesterday's.
export function ukDate(when: string | Date): string {
  const d = typeof when === "string" ? new Date(when) : when;
  return Number.isNaN(d.getTime()) ? "" : UK_DATE.format(d);
}

// Date arithmetic on a date string, anchored at UTC midnight.
//
// This is correct and deliberate, and is NOT the bug the rest of this file is
// about: asking UTC what day it is *now* is wrong, but moving a known date by
// a known number of days has no timezone in it. Mixing the two -- UTC parsing
// with local getDate/setDate before a toISOString round-trip -- is a real
// off-by-one that breaks in either direction depending on the viewer.
//
// There were FOUR copies of this (reminderTemplates, freeInvoiceDraft, and a
// local one each in invoices/new and invoices/[id]) and they did not agree:
// two threw a RangeError on a date that would not parse, two returned the
// input untouched. Not reachable today -- invoices coerce an empty due date to
// null and receipts' due dates never come through here -- but four functions
// of one name behaving two ways is how the next caller picks the wrong one.
//
// Unified on the forgiving behaviour, because that is the one currently
// reachable: the Free-invoice draft can hold a half-typed date, and throwing
// there would white-screen the page somebody is typing into.
export function addDays(iso: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
