// The shape of a company report and the bits both the browser and the
// server format. Nothing here imports the Companies House term tables, so
// the phone never downloads them.

export type Filing = {
  lastMadeUpTo: string | null;
  nextMadeUpTo: string | null;
  nextDue: string | null;
  overdue: boolean;
  overdueBy: string | null;
  lastType: string | null;
};

export type Officer = {
  name: string;
  role: string;
  appointed: string | null;
  occupation: string | null;
  nationality: string | null;
  corporate: boolean;
  disqualified: boolean;
};

export type Charge = {
  status: string;
  created: string | null;
  satisfied: string | null;
  classification: string | null;
  entitled: string[];
};

export type InsolvencyCase = {
  type: string;
  dates: { label: string; date: string }[];
  practitioners: string[];
};

export type Controller = {
  name: string;
  kind: string;
  natures: string[];
  notified: string | null;
  ceased: string | null;
};

export type CompanyReport = {
  name: string;
  number: string;
  status: string;
  statusKey: string;
  statusDetail: string | null;
  type: string | null;
  incorporated: string | null;
  incorporatedLabel: string;
  ageMonths: number | null;
  dissolved: string | null;
  jurisdiction: string | null;
  address: string[];
  addressNotes: string[];
  sic: { code: string; description: string | null }[];
  previousNames: { name: string; from: string | null; to: string | null }[];
  accounts: Filing | null;
  confirmation: Filing | null;
  officers: { active: number; resigned: number; current: Officer[] } | null;
  charges: { total: number; outstanding: number; satisfied: number; list: Charge[] } | null;
  insolvency: { cases: InsolvencyCase[] } | null;
  control: { active: number; ceased: number; superSecure: boolean; list: Controller[]; statements: string[] } | null;
  website: string | null;
  summary: string[];
  // Parts Companies House wouldn't give up this time, so the page can say
  // "couldn't be loaded" instead of "none".
  missing: string[];
  registerUrl: string;
  checkedAt: string;
};

export type CompanyHit = {
  name: string;
  number: string;
  status: string;
  incorporated: string | null;
  address: string;
};

export const CH_SEARCH_URL = "https://find-and-update.company-information.service.gov.uk/search";
export const registerUrl = (number: string) => `https://find-and-update.company-information.service.gov.uk/company/${number}`;

export function longDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export const words = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
export const count = (n: number, one: string, many = one + "s") => `${words(n)} ${n === 1 ? one : many}`;

export function ageText(months: number): string {
  if (months < 1) return "less than a month";
  if (months === 1) return "one month";
  if (months < 24) return `${words(months)} months`;
  return `${words(Math.floor(months / 12))} years`;
}

export function spanText(days: number): string {
  if (days < 14) return count(days, "day");
  if (days < 61) return count(Math.round(days / 7), "week");
  if (days < 730) return count(Math.round(days / 30.44), "month");
  return count(Math.round(days / 365.25), "year");
}

// Searches, not checks: Companies House holds no websites or social
// accounts, so the most the register can honestly do is aim a search.
export function searchLinks(name: string): { label: string; note: string; url: string }[] {
  const web = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  return [
    { label: "Website", note: "web search", url: web(`"${name}" official site`) },
    { label: "Reviews", note: "web search", url: web(`"${name}" reviews`) },
    { label: "Trustpilot", note: "Trustpilot search", url: `https://uk.trustpilot.com/search?query=${encodeURIComponent(name)}` },
    { label: "LinkedIn", note: "web search", url: web(`site:linkedin.com "${name}"`) },
    { label: "Facebook", note: "web search", url: web(`site:facebook.com "${name}"`) },
    { label: "Instagram", note: "web search", url: web(`site:instagram.com "${name}"`) },
    { label: "X", note: "web search", url: web(`site:x.com OR site:twitter.com "${name}"`) },
  ];
}

export const chargeCount = (c: NonNullable<CompanyReport["charges"]>) =>
  `${count(c.total, "charge")} · ${words(c.outstanding)} outstanding${c.satisfied ? `, ${words(c.satisfied)} satisfied` : ""}`;

const filingText = (title: string, f: Filing) =>
  [
    title,
    f.lastMadeUpTo && `Last made up to ${longDate(f.lastMadeUpTo)}${f.lastType ? ` (${f.lastType})` : ""}`,
    f.nextMadeUpTo && `Next made up to ${longDate(f.nextMadeUpTo)}`,
    f.nextDue && `Next due ${longDate(f.nextDue)}${f.overdue ? ` — overdue${f.overdueBy ? ` by ${f.overdueBy}` : ""}` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");

export function reportText(r: CompanyReport): string {
  const blocks: (string | false | null)[] = [
    [
      r.name,
      [`Company ${r.number}`, r.status, r.statusDetail, r.type].filter(Boolean).join(" · "),
      r.incorporated && `${r.incorporatedLabel} ${longDate(r.incorporated)}${r.ageMonths !== null ? ` (${ageText(r.ageMonths)})` : ""}`,
      r.dissolved && `Dissolved ${longDate(r.dissolved)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    r.summary.length > 0 && `What this means\n${r.summary.map((s) => `- ${s}`).join("\n")}`,
    r.address.length > 0 && `Registered office\n${[...r.address, ...r.addressNotes].join("\n")}`,
    r.sic.length > 0 && `What they do\n${r.sic.map((s) => `${s.code}${s.description ? ` ${s.description}` : ""}`).join("\n")}`,
    r.previousNames.length > 0 &&
      `Previous names\n${r.previousNames.map((p) => `${p.name}${p.from && p.to ? ` (${longDate(p.from)} to ${longDate(p.to)})` : ""}`).join("\n")}`,
    r.accounts && filingText("Accounts", r.accounts),
    r.confirmation && filingText("Confirmation statement", r.confirmation),
    r.officers &&
      `Officers (${count(r.officers.active, "current")}, ${count(r.officers.resigned, "resignation")})\n${r.officers.current
        .map((o) => `${o.name} — ${o.role}${o.appointed ? `, appointed ${longDate(o.appointed)}` : ""}${o.disqualified ? " — disqualification recorded" : ""}`)
        .join("\n")}`,
    r.control &&
      `People with significant control (${count(r.control.active, "active")})\n${[
        ...r.control.list.map((c) => `${c.name} — ${[c.kind, ...c.natures].join("; ")}${c.ceased ? ` — ceased ${longDate(c.ceased)}` : ""}`),
        ...r.control.statements,
      ].join("\n")}`,
    r.charges &&
      `Charges\n${chargeCount(r.charges)}\n${r.charges.list
        .map((c) => `${c.classification ?? "Charge"} — ${c.status}${c.created ? `, created ${longDate(c.created)}` : ""}${c.entitled.length ? `, to ${c.entitled.join(", ")}` : ""}`)
        .join("\n")}`,
    r.insolvency &&
      `Insolvency\n${r.insolvency.cases
        .map((c) => [c.type, ...c.dates.map((d) => `${d.label}: ${longDate(d.date)}`), ...c.practitioners.map((p) => `Practitioner: ${p}`)].join("\n"))
        .join("\n\n")}`,
    r.website && `Website on the register\n${r.website}`,
    r.missing.length > 0 && `Not loaded this time: ${r.missing.join(", ")}.`,
    `From the Companies House register, checked ${longDate(r.checkedAt)}.\n${r.registerUrl}`,
  ];
  return blocks.filter(Boolean).join("\n\n");
}

// A Companies House number is 8 characters: eight digits, or two letters
// and six digits. Six or seven digits are padded, as the register does; four
// digits are more likely part of a name than a company number.
export function asCompanyNumber(input: string): string | null {
  const raw = input.replace(/\s+/g, "").toUpperCase();
  if (/^\d{6,8}$/.test(raw)) return raw.padStart(8, "0");
  if (/^[A-Z]{2}\d{6}$/.test(raw)) return raw;
  return null;
}
