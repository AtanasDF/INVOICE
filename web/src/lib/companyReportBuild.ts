import { formatRegisteredAddress } from "@/lib/companyLookup";
import { ACCOUNT_TYPE, COMPANY_BIRTH, COMPANY_STATUS, COMPANY_TYPE, CONTROL, INSOLVENCY_CASE, INSOLVENCY_DATE, OFFICER_ROLE, PSC_STATEMENT, SIC, STATUS_DETAIL } from "@/lib/companyHouseTerms";
import { ageText, type Charge, type CompanyReport, type Controller, count, type Filing, type InsolvencyCase, longDate, type Officer, registerUrl, spanText } from "@/lib/companyReport";

type Address = Parameters<typeof formatRegisteredAddress>[0];

type FilingDates = { last_accounts?: { made_up_to?: string; type?: string }; next_accounts?: { due_on?: string; period_end_on?: string; overdue?: boolean }; next_due?: string; next_made_up_to?: string; overdue?: boolean; last_made_up_to?: string };

export type Profile = {
  company_name?: string;
  company_number?: string;
  company_status?: string;
  company_status_detail?: string;
  type?: string;
  date_of_creation?: string;
  date_of_cessation?: string;
  jurisdiction?: string;
  sic_codes?: string[];
  registered_office_address?: Address;
  registered_office_is_in_dispute?: boolean;
  undeliverable_registered_office_address?: boolean;
  has_charges?: boolean;
  has_insolvency_history?: boolean;
  has_super_secure_pscs?: boolean;
  previous_company_names?: { name?: string; effective_from?: string; ceased_on?: string }[];
  accounts?: FilingDates;
  confirmation_statement?: FilingDates;
  // The register rarely holds one, but show it when it does.
  website?: string;
};

export type OfficerList = {
  active_count?: number;
  resigned_count?: number;
  items?: { name?: string; officer_role?: string; appointed_on?: string; resigned_on?: string; occupation?: string; nationality?: string; links?: { officer?: { disqualifications?: string } } }[];
};

export type ChargeList = {
  total_count?: number;
  satisfied_count?: number;
  part_satisfied_count?: number;
  items?: { status?: string; created_on?: string; satisfied_on?: string; classification?: { description?: string }; persons_entitled?: { name?: string }[] }[];
};

export type InsolvencyList = { cases?: { type?: string; dates?: { type?: string; date?: string }[]; practitioners?: { name?: string }[] }[] };

export type ControlList = {
  active_count?: number;
  ceased_count?: number;
  items?: { kind?: string; name?: string; natures_of_control?: string[]; notified_on?: string; ceased_on?: string; statement?: string }[];
};

export type Raw = { profile: Profile; officers?: OfficerList; charges?: ChargeList; insolvency?: InsolvencyList; control?: ControlList; missing: string[] };

const MAX_OFFICERS = 20;
const MAX_CHARGES = 10;
const MAX_CONTROLLERS = 10;
const INSOLVENT: Record<string, string> = {
  liquidation: "in liquidation",
  receivership: "in receivership",
  administration: "in administration",
  "voluntary-arrangement": "in a voluntary arrangement with its creditors",
  "insolvency-proceedings": "in insolvency proceedings",
};

// Addresses whose own postcode and street give them away as a formation
// agent's or mail forwarder's: thousands of unrelated companies sit at each
// one. There is no flag for this in the API, so only the best-known are
// named, and only as a fact about the address.
const FORWARDING = [
  { postcode: "N17GU", street: /wenlock road/i },
  { postcode: "WC2H9JQ", street: /shelton street/i },
  { postcode: "EC1V2NX", street: /city road/i },
  { postcode: "EC2A4NE", street: /paul street/i },
  { postcode: "WC1N3AX", street: /old gloucester street/i },
  { postcode: "W1W5PF", street: /great portland street/i },
  { postcode: "W1W7LT", street: /great portland street/i },
  { postcode: "EC1N8LE", street: /hatton garden/i },
  { postcode: "E162DQ", street: /constance street/i },
  { postcode: "B31RL", street: /blackthorn house|st paul's square/i },
];

// The register's own spelling of where a company is registered.
const JURISDICTION: Record<string, string> = {
  "england-wales": "England and Wales",
  england: "England",
  wales: "Wales",
  scotland: "Scotland",
  "northern-ireland": "Northern Ireland",
  "united-kingdom": "the United Kingdom",
  "european-union": "the European Union",
  "non-eu": "outside the EU",
};

const day = 24 * 60 * 60 * 1000;
const dateOnly = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

function monthsSince(iso: string, now: Date): number | null {
  const from = new Date(dateOnly(iso));
  if (isNaN(from.getTime())) return null;
  let m = (now.getUTCFullYear() - from.getUTCFullYear()) * 12 + (now.getUTCMonth() - from.getUTCMonth());
  if (now.getUTCDate() < from.getUTCDate()) m--;
  return Math.max(0, m);
}

function filing(f: FilingDates | undefined, now: Date): Filing | null {
  if (!f) return null;
  const lastMadeUpTo = f.last_accounts?.made_up_to ?? f.last_made_up_to ?? null;
  const nextDue = f.next_accounts?.due_on ?? f.next_due ?? null;
  const late = nextDue ? Math.floor((now.getTime() - dateOnly(nextDue)) / day) : 0;
  const overdue = (f.next_accounts?.overdue ?? f.overdue ?? false) || late > 0;
  const out: Filing = {
    lastMadeUpTo,
    nextMadeUpTo: f.next_accounts?.period_end_on ?? f.next_made_up_to ?? null,
    nextDue,
    overdue,
    overdueBy: overdue && late > 0 ? spanText(late) : null,
    lastType: f.last_accounts?.type ? (ACCOUNT_TYPE[f.last_accounts.type] ?? null) : null,
  };
  return out.lastMadeUpTo || out.nextDue || out.nextMadeUpTo ? out : null;
}

function addressNotes(a: Address, profile: Profile): string[] {
  const notes: string[] = [];
  if (profile.registered_office_is_in_dispute) notes.push("Companies House records a dispute about this address.");
  if (profile.undeliverable_registered_office_address) notes.push("Post sent here by Companies House has come back undelivered.");
  if (a?.care_of) notes.push(`Registered care of ${a.care_of}.`);
  if (a?.po_box) notes.push("This is a PO Box, not a place you can visit.");
  const postcode = a?.postal_code?.replace(/\s+/g, "").toUpperCase() ?? "";
  const street = [a?.premises, a?.address_line_1, a?.address_line_2].filter(Boolean).join(" ");
  if (FORWARDING.some((f) => f.postcode === postcode && f.street.test(street))) {
    notes.push("This is a well-known company formation address: many unrelated companies are registered here. It is normal and legal, and it is not necessarily where the business works.");
  }
  return notes;
}

const officerOf = (o: NonNullable<OfficerList["items"]>[number]): Officer => ({
  name: o.name ?? "",
  role: o.officer_role ? (OFFICER_ROLE[o.officer_role] ?? o.officer_role) : "",
  appointed: o.appointed_on ?? null,
  occupation: o.occupation && !["none", (o.officer_role ?? "").replace(/-/g, " ")].includes(o.occupation.toLowerCase()) ? o.occupation : null,
  nationality: o.nationality ?? null,
  corporate: (o.officer_role ?? "").startsWith("corporate-"),
  disqualified: Boolean(o.links?.officer?.disqualifications),
});

function charges(list: ChargeList | undefined): CompanyReport["charges"] {
  if (!list) return null;
  const total = list.total_count ?? list.items?.length ?? 0;
  if (total === 0) return null;
  const satisfied = list.satisfied_count ?? 0;
  const out: Charge[] = (list.items ?? []).slice(0, MAX_CHARGES).map((c) => ({
    status: (c.status ?? "").replace(/-/g, " ") || "unknown",
    created: c.created_on ?? null,
    satisfied: c.satisfied_on ?? null,
    classification: c.classification?.description ?? null,
    entitled: (c.persons_entitled ?? []).map((p) => p.name ?? "").filter(Boolean),
  }));
  return { total, outstanding: Math.max(0, total - satisfied), satisfied, list: out };
}

function insolvency(list: InsolvencyList | undefined): CompanyReport["insolvency"] {
  const cases: InsolvencyCase[] = (list?.cases ?? []).map((c) => ({
    type: c.type ? (INSOLVENCY_CASE[c.type] ?? c.type) : "Insolvency case",
    dates: (c.dates ?? []).flatMap((d) => (d.date ? [{ label: d.type ? (INSOLVENCY_DATE[d.type] ?? d.type) : "Date", date: d.date }] : [])),
    practitioners: (c.practitioners ?? []).map((p) => p.name ?? "").filter(Boolean),
  }));
  return cases.length ? { cases } : null;
}

const KIND: Record<string, string> = {
  "individual-person-with-significant-control": "Individual",
  "individual-beneficial-owner": "Individual",
  "corporate-entity-person-with-significant-control": "Company",
  "corporate-entity-beneficial-owner": "Company",
  "legal-person-person-with-significant-control": "Legal person",
  "legal-person-beneficial-owner": "Legal person",
  "super-secure-person-with-significant-control": "Details protected",
  "super-secure-beneficial-owner": "Details protected",
};

function control(list: ControlList | undefined, profile: Profile): CompanyReport["control"] {
  if (!list) return null;
  const items = list.items ?? [];
  const people: Controller[] = items
    .filter((i) => !i.statement)
    .slice(0, MAX_CONTROLLERS)
    .map((i) => ({
      name: i.name ?? "Details protected",
      kind: KIND[i.kind ?? ""] ?? "",
      natures: (i.natures_of_control ?? []).map((n) => CONTROL[n] ?? n.replace(/-/g, " ")),
      notified: i.notified_on ?? null,
      ceased: i.ceased_on ?? null,
    }));
  const statements = items.flatMap((i) => (i.statement ? [PSC_STATEMENT[i.statement] ?? i.statement] : []));
  const superSecure = Boolean(profile.has_super_secure_pscs) || items.some((i) => (i.kind ?? "").startsWith("super-secure"));
  if (!people.length && !statements.length && !superSecure) return null;
  return { active: list.active_count ?? people.filter((p) => !p.ceased).length, ceased: list.ceased_count ?? 0, superSecure, list: people, statements };
}

function summarise(r: CompanyReport, profile: Profile): string[] {
  const lines: string[] = [];
  const age = r.ageMonths !== null ? `registered for ${ageText(r.ageMonths)}` : null;
  const officers = r.officers ? (r.officers.active === 0 ? "no officers listed" : count(r.officers.active, "officer")) : null;

  if (r.statusKey === "dissolved") {
    lines.push(r.dissolved ? `Dissolved on ${longDate(r.dissolved)} — this company no longer exists.` : "Dissolved — this company no longer exists.");
  } else if (INSOLVENT[r.statusKey]) {
    const started = r.insolvency?.cases[0]?.dates[0];
    lines.push(`Companies House shows this company ${INSOLVENT[r.statusKey]}${started ? `, ${started.label.toLowerCase()} ${longDate(started.date)}` : ""}.`);
  } else if (r.statusKey === "active") {
    const filings = r.accounts || r.confirmation ? (r.accounts?.overdue || r.confirmation?.overdue ? "with filings overdue" : "filing on time") : null;
    lines.push(`${["Active", filings, officers, age].filter(Boolean).join(", ")}.`);
    if (profile.company_status_detail === "active-proposal-to-strike-off") lines.push("Companies House has published a proposal to strike this company off the register.");
    else if (r.statusDetail) lines.push(`Companies House also records: ${r.statusDetail}.`);
  } else {
    lines.push(`Companies House shows this company as ${r.status.toLowerCase()}${age ? `, ${age}` : ""}.`);
  }

  if (r.accounts?.overdue) lines.push(`Accounts are overdue${r.accounts.overdueBy ? ` by ${r.accounts.overdueBy}` : ""}${r.accounts.nextDue ? ` — they were due ${longDate(r.accounts.nextDue)}` : ""}.`);
  if (r.confirmation?.overdue) lines.push(`The confirmation statement, which says who runs and owns the company, is overdue${r.confirmation.overdueBy ? ` by ${r.confirmation.overdueBy}` : ""}.`);
  if (r.charges && r.charges.outstanding > 0) lines.push(`${count(r.charges.outstanding, "charge")} outstanding: something the company owns is pledged as security for borrowing.`);
  if (r.insolvency && r.statusKey === "active") lines.push(`Companies House records ${count(r.insolvency.cases.length, "earlier insolvency case")} against this company.`);
  if (r.previousNames.length) lines.push(`It has traded under ${count(r.previousNames.length, "other name")} before.`);
  if (r.officers?.current.some((o) => o.disqualified)) lines.push("Companies House records a disqualification against an officer of this company.");
  if (profile.has_charges && !r.charges) lines.push("Companies House says this company has charges registered against it.");
  return lines.map((l) => l.charAt(0).toUpperCase() + l.slice(1));
}

export function buildReport(raw: Raw, now = new Date()): CompanyReport {
  const p = raw.profile;
  const statusKey = p.company_status ?? "";
  const number = p.company_number ?? "";
  const address = p.registered_office_address;
  const officers = raw.officers
    ? {
        active: raw.officers.active_count ?? 0,
        resigned: raw.officers.resigned_count ?? 0,
        current: (raw.officers.items ?? []).filter((o) => !o.resigned_on).slice(0, MAX_OFFICERS).map(officerOf),
      }
    : null;

  const report: CompanyReport = {
    name: p.company_name ?? "",
    number,
    status: COMPANY_STATUS[statusKey] ?? statusKey,
    statusKey,
    statusDetail: p.company_status_detail ? (STATUS_DETAIL[p.company_status_detail] ?? null) : null,
    type: p.type ? (COMPANY_TYPE[p.type] ?? null) : null,
    incorporated: p.date_of_creation ?? null,
    incorporatedLabel: (p.type && COMPANY_BIRTH[p.type]) || "Incorporated on",
    ageMonths: p.date_of_creation ? monthsSince(p.date_of_creation, now) : null,
    dissolved: p.date_of_cessation ?? null,
    jurisdiction: p.jurisdiction ? (JURISDICTION[p.jurisdiction] ?? p.jurisdiction.replace(/-/g, " ")) : null,
    address: formatRegisteredAddress(address).split("\n").filter(Boolean),
    addressNotes: addressNotes(address, p),
    sic: (p.sic_codes ?? []).map((code) => ({ code, description: SIC[code] ?? null })),
    previousNames: (p.previous_company_names ?? []).flatMap((n) => (n.name ? [{ name: n.name, from: n.effective_from ?? null, to: n.ceased_on ?? null }] : [])),
    accounts: filing(p.accounts, now),
    confirmation: filing(p.confirmation_statement, now),
    officers,
    charges: charges(raw.charges),
    insolvency: insolvency(raw.insolvency),
    control: control(raw.control, p),
    website: typeof p.website === "string" && /^https?:\/\/\S+$/i.test(p.website.trim()) ? p.website.trim() : null,
    summary: [],
    missing: raw.missing,
    registerUrl: registerUrl(number),
    checkedAt: now.toISOString(),
  };
  report.summary = summarise(report, p);
  return report;
}
