// Dates on a UK document are day-first, and a model reading "08/09/26"
// will sometimes silently pick 9 August. So the model is asked to copy
// the printed text verbatim and the parsing happens here, deterministically,
// with the swapped reading surfaced whenever both orders are plausible.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export type ParsedDate = { iso: string | null; ambiguous: boolean; alternative: string | null };

const NONE: ParsedDate = { iso: null, ambiguous: false, alternative: null };

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function year(s: string): number {
  return s.length <= 2 ? 2000 + Number(s) : Number(s);
}

function monthFromName(name: string): number | null {
  const i = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return i < 0 ? null : i + 1;
}

// The forms are unanchored so a label ("Date: 08/09/2026"), a trailing
// time or zone, or spaces around the separators don't hide the date; the
// digit lookarounds stop a match starting or ending mid-number.
const MONTH_NAME = `(?:${MONTHS.join("|")})[a-z]*`;
const ISO_RE = /(?<!\d)(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})(?!\d)/;
const NUMERIC_RE = /(?<!\d)(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4}|\d{2})(?!\d)/;
const DAY_MONTH_RE = new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-/.]*(${MONTH_NAME})\\.?,?[\\s\\-/.]*(\\d{4}|\\d{2})(?!\\d)`, "i");
const MONTH_DAY_RE = new RegExp(`\\b(${MONTH_NAME})\\.?[\\s\\-]*(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4}|\\d{2})(?!\\d)`, "i");

export function parsePrintedDate(printed: string): ParsedDate {
  let m = ISO_RE.exec(printed);
  if (m) return { iso: toIso(Number(m[1]), Number(m[2]), Number(m[3])), ambiguous: false, alternative: null };

  m = NUMERIC_RE.exec(printed);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = year(m[3]);
    const ambiguous = a <= 12 && b <= 12 && a !== b;
    return { iso: toIso(y, b, a), ambiguous, alternative: ambiguous ? toIso(y, a, b) : null };
  }

  m = DAY_MONTH_RE.exec(printed);
  if (m) {
    const month = monthFromName(m[2]);
    return month ? { iso: toIso(year(m[3]), month, Number(m[1])), ambiguous: false, alternative: null } : NONE;
  }

  m = MONTH_DAY_RE.exec(printed);
  if (m) {
    const month = monthFromName(m[1]);
    return month ? { iso: toIso(year(m[3]), month, Number(m[2])), ambiguous: false, alternative: null } : NONE;
  }

  return NONE;
}

function swapDayMonth(iso: string | null): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!m) return null;
  const swapped = toIso(Number(m[1]), Number(m[3]), Number(m[2]));
  return swapped === iso ? null : swapped;
}

type DatedResult = {
  date: string | null;
  dateAsPrinted: string | null;
  dueDate: string | null;
  dueDateAsPrinted: string | null;
};

export type NormalisedDates = {
  dateAmbiguous: boolean;
  dateAlternative: string | null;
  dueDateAmbiguous: boolean;
  dueDateAlternative: string | null;
};

// A parsed *AsPrinted reading replaces the model's own. When the printed
// text doesn't parse, the model's reading stands but is flagged ambiguous
// with its day/month swap as the alternative: a date nobody could check
// deterministically is exactly the one the model may have read the
// American way.
function resolve(printed: string | null, modelIso: string | null): ParsedDate {
  if (!printed) return { iso: modelIso, ambiguous: false, alternative: null };
  const parsed = parsePrintedDate(printed);
  if (parsed.iso) return parsed;
  return { iso: modelIso, ambiguous: true, alternative: swapDayMonth(modelIso) };
}

export function normaliseScanDates<T extends DatedResult>(result: T): T & NormalisedDates {
  const date = resolve(result.dateAsPrinted, result.date);
  const due = resolve(result.dueDateAsPrinted, result.dueDate);
  return {
    ...result,
    date: date.iso,
    dateAmbiguous: date.ambiguous,
    dateAlternative: date.alternative,
    dueDate: due.iso,
    dueDateAmbiguous: due.ambiguous,
    dueDateAlternative: due.alternative,
  };
}
