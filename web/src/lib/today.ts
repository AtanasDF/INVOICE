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
