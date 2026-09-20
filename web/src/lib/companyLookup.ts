// A company from the Companies House register, ready to drop into a form.
export type CompanyMatch = {
  name: string;
  number: string;
  address: string;
  status: string;
  incorporated: string | null;
};

type RegisteredAddress = {
  care_of?: string;
  po_box?: string;
  premises?: string;
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  region?: string;
  postal_code?: string;
  country?: string;
};

export type CompanySearchItem = {
  title?: string;
  company_number?: string;
  company_status?: string;
  date_of_creation?: string;
  address?: RegisteredAddress;
  address_snippet?: string;
};

// The register's own profile record, which the search index doesn't carry.
export type CompanyProfileItem = {
  company_name?: string;
  company_number?: string;
  company_status?: string;
  date_of_creation?: string;
  registered_office_address?: RegisteredAddress;
};

const SUFFIXES: Record<string, string> = { LTD: "Ltd", LIMITED: "Limited", PLC: "plc", LLP: "LLP", CIC: "CIC", UK: "UK", "(UK)": "(UK)", GB: "GB" };
const SMALL = new Set(["of", "and", "the", "for", "in", "on", "at", "to", "by", "an", "or", "de"]);
const COMMON_TWO = new Set(["of", "to", "in", "on", "at", "by", "my", "we", "go", "do", "no", "so", "up", "me", "be", "is", "an", "as", "or", "us", "co"]);

function tidyPart(part: string): string {
  if (!part) return part;
  const letters = part.replace(/[^A-Za-z]/g, "");
  // Initials and acronyms stay as registered: JD, BBC, HMRC, J.P.
  if (/\d/.test(part) || part.includes(".") || (letters.length <= 5 && !/[AEIOUY]/i.test(letters))) return part;
  if (letters.length === 2 && !COMMON_TWO.has(letters.toLowerCase())) return part;
  const lower = part.toLowerCase();
  // O'NEILL → O'Neill, BOB'S → Bob's
  return lower.replace(/(^|[-'’(])([a-z])/g, (m, sep: string, ch: string, offset: number) =>
    (sep === "'" || sep === "’") && lower.length - offset - 1 <= 1 ? m : sep + ch.toUpperCase()
  );
}

// Companies House holds names in capitals; an invoice reads better as
// "Acme Plumbing & Heating Ltd". Anything it can't be sure of is left as is.
export function tidyCompanyName(title: string): string {
  if (title !== title.toUpperCase()) return title.trim();
  return title
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      if (SUFFIXES[word]) return SUFFIXES[word];
      if (i > 0 && SMALL.has(word.toLowerCase())) return word.toLowerCase();
      return word.split("-").map(tidyPart).join("-");
    })
    .join(" ");
}

const HOME = new Set(["united kingdom", "england", "wales", "scotland", "northern ireland", "uk", "great britain", "england and wales", "not specified"]);

export function formatRegisteredAddress(a: RegisteredAddress | undefined, snippet?: string): string {
  if (!a) return snippet ?? "";
  const first = [a.premises, a.address_line_1].filter(Boolean).join(a.premises && /^\d+[a-z]?$/i.test(a.premises) ? " " : ", ");
  const lines = [a.care_of && `c/o ${a.care_of}`, a.po_box && `PO Box ${a.po_box.replace(/^p\.?\s*o\.?\s*box\s*/i, "")}`, first, a.address_line_2, a.locality, a.region, a.postal_code?.toUpperCase()];
  if (a.country && !HOME.has(a.country.trim().toLowerCase())) lines.push(a.country);
  const out = lines.map((l) => l?.trim()).filter(Boolean);
  return out.length ? out.join("\n") : snippet ?? "";
}

export function toCompanyMatch(item: CompanySearchItem): CompanyMatch | null {
  if (!item.title || !item.company_number) return null;
  return {
    name: tidyCompanyName(item.title),
    number: item.company_number,
    address: formatRegisteredAddress(item.address, item.address_snippet),
    status: item.company_status ?? "",
    incorporated: item.date_of_creation ?? null,
  };
}

export function profileToCompanyMatch(p: CompanyProfileItem): CompanyMatch | null {
  if (!p.company_name || !p.company_number) return null;
  return {
    name: tidyCompanyName(p.company_name),
    number: p.company_number,
    address: formatRegisteredAddress(p.registered_office_address),
    status: p.company_status ?? "",
    incorporated: p.date_of_creation ?? null,
  };
}

const TRADING = new Set(["active", "open", "registered", ""]);
const STATUS_WORDS: Record<string, string> = {
  dissolved: "dissolved",
  liquidation: "in liquidation",
  receivership: "in receivership",
  administration: "in administration",
  "voluntary-arrangement": "in a voluntary arrangement",
  "insolvency-proceedings": "in insolvency proceedings",
  "converted-closed": "closed",
  closed: "closed",
  "in-administration": "in administration",
  erased: "erased from the register",
  removed: "removed from the register",
};

// Plainly what the register says, and nothing at all for a company that is
// trading normally: a score or a green tick would be read as advice.
export function registerNote(status: string): string | null {
  const key = status.trim().toLowerCase();
  if (TRADING.has(key)) return null;
  return `Companies House says this company is ${STATUS_WORDS[key] ?? key.replace(/-/g, " ")}.`;
}

export const NOT_ON_REGISTER = "Companies House has no company under this name.";

// Companies House numbers are 8 characters: digits, or two letters then six.
export function tidyCompanyNumber(value: string): string | null {
  const n = value.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{0,2}\d{6,8}$/.test(n) ? n : null;
}
