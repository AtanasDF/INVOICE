// Deciding which photographs may be let go, kept apart from the job that does
// it (notes/ageing-photos-design.md) so every rule here can be tested rather
// than trusted. `src/app/api/photos/age/route.ts` is the only caller.
//
// Everything in this file is written to refuse. A photograph is kept unless
// there is a positive reason it may go, and each refusal carries its reason so
// a dry run reads as a list of decisions rather than a number.

import { ukDate } from "@/lib/today";

export type AgeableRow = {
  id: string;
  user_id: string;
  date: string;
  created_at?: string | null;
  image_data_url: string | null;
  details: Record<string, unknown> | null;
  needs_review?: boolean | null;
};

export type Skip = { id: string; reason: string };

// What can actually go into the PDF that is emailed. pdf-lib embeds PNG and
// JPEG and nothing else, and documentPdf copies a PDF's own pages -- so a
// webp or gif photograph threw "SOI not found in JPEG" out of the middle of
// the run, which nothing caught: the handler answered 500, that owner was
// abandoned, and so was every owner ordered after them, every day, because
// nothing about the offending row ever changes. It killed the DRY RUN too,
// which is the report that has to be read and agreed before deletion is ever
// switched on.
//
// Reachable through the email import, which accepts both types
// (ALLOWED_TYPES): a supplier emails a .webp receipt, it is approved in
// needs-review, and ninety days later that account's run stops working.
//
// Being unable to email a photograph is a reason to KEEP it, which is the
// rule this whole file is built on -- never remove on a guess.
export const EMAILABLE_TYPES = ["application/pdf", "image/png", "image/jpeg"];
export const canEmail = (mediaType: string) => EMAILABLE_TYPES.includes(mediaType.split(";")[0].trim().toLowerCase());

export const agedAlready = (r: AgeableRow) => !!(r.details as { photoAgedAt?: string } | null)?.photoAgedAt;

// created_at is a timestamptz, so slicing it took the UTC date: a receipt
// added at 00:30 on a summer night read as having arrived YESTERDAY, which
// makes it a day older than it is and could let its photograph go a day early.
// The London day is the one the rest of the app reckons in.
const added = (r: AgeableRow): string | null => (r.created_at ? ukDate(r.created_at) : null);

// A row is a candidate only on every count at once.
//
// TWO DATES, BOTH OLD. The printed date alone is not enough, and the first dry
// run against the real database proved it: the one row old enough to go was
// dated 2012, a date a scan had misread. Emailing that photograph away the
// morning after it was taken would have been correct by the rule and wrong by
// every other measure. A person catching up on a year of paperwork in one
// evening is the same case. So the day it was ADDED must be past the cutoff
// too, and a row with no added date is kept.
export function sortOut(rows: AgeableRow[], cutoff: string): { candidates: AgeableRow[]; skipped: Skip[] } {
  const candidates: AgeableRow[] = [];
  const skipped: Skip[] = [];
  for (const r of rows) {
    if (!r.image_data_url) skipped.push({ id: r.id, reason: "no photograph to let go" });
    else if (agedAlready(r)) skipped.push({ id: r.id, reason: "already emailed and cleared" });
    else if (r.needs_review) skipped.push({ id: r.id, reason: "still waiting to be checked" });
    else if (!r.date || r.date >= cutoff) skipped.push({ id: r.id, reason: "not old enough" });
    else if (!added(r)) skipped.push({ id: r.id, reason: "no record of when it was added" });
    else if (added(r)! >= cutoff) skipped.push({ id: r.id, reason: "added recently, whatever the printed date says" });
    else candidates.push(r);
  }
  // Oldest first: if a run only gets through some of them, the ones a person
  // is least likely to want back are the ones that go.
  candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  return { candidates, skipped };
}

// Anyone paying keeps every photograph, however old.
export function forOwner(candidates: AgeableRow[], owner: string, paid: Set<string>, perOwner: number): AgeableRow[] {
  if (paid.has(owner)) return [];
  return candidates.filter((r) => r.user_id === owner).slice(0, perOwner);
}

export const cutoffFor = (todayIso: string, days: number) => {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

export const emailSubject = (oldest: string, newest: string) => `Your receipt photographs from ${oldest} to ${newest}`;

// The whole of what someone is told. It has one job: to stop the email reading
// like something has been taken away, because nothing of their record has.
export function emailBody(count: number, oldest: string, newest: string): string {
  const n = count === 1 ? "1 receipt photograph" : `${count} receipt photographs`;
  return [
    `Here ${count === 1 ? "is" : "are"} ${n}, from ${oldest} to ${newest}, as one PDF.`,
    `Keep this email: it is your copy. The pictures are being cleared from the app so it can stay free.`,
    `Nothing else has changed. Every one of those receipts is still in your records - the supplier, the date, the amount and the VAT are all exactly where they were, and your totals and VAT return are unaffected. Only the photograph has gone.`,
    `Invoiceover`,
  ].join("\n\n");
}
