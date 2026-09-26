// Readings that parse cleanly and are still wrong.
//
// Both of these came from looking at Atanas's real records on 2026-09-26, not
// from a test:
//
//  - GO OUTDOORS, £29.00, dated 2012-09-18, added on 2026-09-22. The year was
//    misread. It parses perfectly, so nothing questioned it -- and a receipt
//    dated fourteen years ago falls outside every VAT quarter and every tax
//    year, so the £29 is simply gone from his books.
//  - Rawlings & Son, £0.00 including £0.00 VAT, saved beside a real £8.50 one
//    from the same supplier on the same day. A reading that found nothing,
//    saved as if it had.
//
// The existing guard only catches an AMBIGUOUS date -- 08/09/26, which could be
// two dates. A misread year is not ambiguous. It is confidently wrong, which is
// worse, and is exactly what the scan rule in CLAUDE.md is about: "a wrong
// total or a wrong date that looks confident goes into the accounting record
// unchallenged, while an empty box gets looked at."

// How far back a document can be dated before it is worth asking about.
//
// Generous on purpose: somebody catching up on a year of paperwork is normal
// and must not be nagged. Two years is well past that and still catches a
// misread year, which is usually wrong by a decade.
const YEARS_BACK = 2;

// The SHAPE of a date is not a date: "2026-13-45" matches the pattern and is
// nothing. Checked by round-tripping through Date, so an impossible month or a
// 31st of February is refused rather than turned into a confident suggestion
// built on nonsense -- which is what the first version of this did.
const parse = (iso: string): [number, number, number] | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return [y, m, d];
};

/**
 * A date that parsed cleanly but does not look like a document somebody is
 * scanning today. Returns the date it probably should have been, for the same
 * "is it this or that?" confirmation an ambiguous date already gets -- or null
 * when there is nothing to question.
 */
export function misreadYear(iso: string, todayIso: string): string | null {
  const d = parse(iso);
  const t = parse(todayIso);
  if (!d || !t) return null;
  const [y, m, day] = d;
  const [ty] = t;
  const pad = (n: number) => String(n).padStart(2, "0");
  // The likeliest true date: the same day and month in the most recent year
  // that is not in the future. Used for both directions -- a document dated
  // ahead of today cannot be right either, and the usual cause is the same
  // misread year.
  const nearest = () => {
    const thisYear = `${ty}-${pad(m)}-${pad(day)}`;
    return thisYear > todayIso ? `${ty - 1}-${pad(m)}-${pad(day)}` : thisYear;
  };
  if (iso > todayIso) {
    const guess = nearest();
    return guess === iso ? null : guess;
  }
  if (ty - y <= YEARS_BACK) return null;
  const guess = nearest();
  return guess === iso ? null : guess;
}

/**
 * A document saved as costing nothing. Almost always a reading that found no
 * total rather than a document that really was free -- and £0.00 in the books
 * is indistinguishable from a receipt nobody ever checked.
 */
export function noTotalRead(amount: number, vatAmount: number): boolean {
  return Math.abs(amount) < 0.005 && Math.abs(vatAmount) < 0.005;
}
