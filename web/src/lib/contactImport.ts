import type { Client } from "@/lib/storage";

// The reader's contact, by shape: importing contactExtraction would pull the
// model clients into anything that reads this file.
type ScannedContact = { name: string; isCompany: boolean; contactPerson: string | null; email: string | null; phone: string | null; address: string | null; vatNumber: string | null; companyNumber: string | null; role: "issuer" | "recipient" | "other" };

// Bringing somebody's customers and suppliers in at the start, so the first
// invoice needs no typing (Atanas, 2026-10-22: "they should be given the option
// to load files so the clients are ready"). Three ways in, one shape out:
// a spreadsheet another app exported, contacts shared from a phone, or what
// the reader found on photos of old invoices and bills.
//
// Only what the file says is kept. A column we cannot place is left out
// rather than guessed into the wrong box, and nothing is added until the
// person has seen the list.

export type ImportKind = "client" | "supplier";

export type ImportedContact = {
  name: string;
  isCompany: boolean;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  vatNumber: string;
  companyNumber: string;
  kind: ImportKind;
};

const blank = (): Omit<ImportedContact, "name" | "kind"> => ({ isCompany: false, contactPerson: "", email: "", phone: "", address: "", vatNumber: "", companyNumber: "" });

const tidy = (s: string | null | undefined) => (s ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
export const sameName = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const HOME = /^(uk|gb|gbr|united kingdom|great britain|england|scotland|wales|northern ireland)$/i;
const COMPANYISH = /\b(ltd|limited|plc|llp|llc|inc|co|company|group|services|holdings|trading|partners|& sons|cic)\b\.?/i;

// Header names as Xero, QuickBooks, FreeAgent, Sage, Google and Outlook
// export them, squashed to letters and digits.
const NAME = ["contactname", "displayname", "customername", "clientname", "suppliername", "customer", "client", "supplier", "name", "fullname"];
const COMPANY = ["company", "companyname", "organisation", "organization", "organisationname", "organizationname", "business", "businessname", "tradingname"];
const FIRST = ["firstname", "givenname", "forename"];
const LAST = ["lastname", "surname", "familyname"];
const PERSON = ["contactperson", "contact", "attention", "primarycontact", "maincontact"];
const VAT = ["vatnumber", "vatno", "vat", "vatregistrationnumber", "vatreg", "taxnumber", "taxid", "vatregno"];
const CRN = ["companynumber", "companyregistrationnumber", "companyregno", "crn", "registrationnumber", "companyno"];
const TYPE = ["type", "contacttype", "kind", "category", "group", "groups"];
// The address parts, in the order they are printed.
const ADDRESS_ROLES: [RegExp, number][] = [
  [/(formatted|fulladdress)$/, 0],
  [/(addressline\d|address\d|line\d|street\d?|address)$/, 1],
  [/(town|city)$/, 2],
  [/(county|region|state|province)$/, 3],
  [/(postcode|postalcode|zipcode|zip)$/, 4],
  [/country$/, 5],
];

function addressColumns(head: string[]): { cols: number[]; formatted: number | null } {
  const found = head
    .map((h, i) => {
      const k = key(h);
      if (/email|phone|mobile|fax|web|url|type|label/.test(k)) return null;
      for (const [re, order] of ADDRESS_ROLES) {
        const m = k.match(re);
        if (m) return { i, order, prefix: k.slice(0, k.length - m[0].length) };
      }
      return null;
    })
    .filter((x): x is { i: number; order: number; prefix: string } => !!x);
  if (!found.length) return { cols: [], formatted: null };
  // One address only: an export with a postal and a delivery address gives
  // both under their own prefix (PO / SA in Xero), and the first is the one
  // that goes on an invoice.
  const group = found.filter((f) => f.prefix === found[0].prefix);
  const formatted = group.find((f) => f.order === 0);
  return { cols: group.filter((f) => f.order > 0).sort((a, b) => a.order - b.order || a.i - b.i).map((f) => f.i), formatted: formatted ? formatted.i : null };
}

const column = (head: string[], names: string[]) => {
  const keys = head.map(key);
  for (const n of names) {
    const i = keys.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
};

// The first email or phone column, skipping Google's "E-mail 1 - Type".
const firstLike = (head: string[], re: RegExp) => head.findIndex((h) => re.test(key(h)) && !/type|label/.test(key(h)));

export function fromRows(rows: string[][], fileKind: ImportKind = "client"): ImportedContact[] {
  const [head = [], ...body] = rows;
  const name = column(head, NAME);
  const company = column(head, COMPANY);
  const first = column(head, FIRST);
  const last = column(head, LAST);
  if (name < 0 && company < 0 && first < 0 && last < 0) {
    // A one-column list with no heading is a list of names.
    if (rows.every((r) => r.filter((c) => c.trim()).length <= 1)) return rows.map((r) => ({ ...blank(), name: tidy(r.find((c) => c.trim())), kind: fileKind }));
    return [];
  }
  const person = column(head, PERSON);
  const email = firstLike(head, /email/);
  const phone = firstLike(head, /phone|mobile|tel/);
  const vat = column(head, VAT);
  const crn = column(head, CRN);
  const type = column(head, TYPE);
  const { cols, formatted } = addressColumns(head);
  const cell = (r: string[], i: number) => (i >= 0 ? tidy(r[i]) : "");

  return body.map((r) => {
    const personName = [cell(r, first), cell(r, last)].filter(Boolean).join(" ");
    const org = cell(r, company);
    const named = cell(r, name);
    const out = named || org || personName;
    const parts = cols.map((i) => cell(r, i)).filter((p, i, all) => p && !(i === all.length - 1 && HOME.test(p)));
    const address = (formatted !== null ? cell(r, formatted) : "") || parts.join("\n");
    const said = cell(r, type).toLowerCase();
    return {
      name: out,
      isCompany: !!org || COMPANYISH.test(out),
      contactPerson: cell(r, person) || (personName && personName !== out ? personName : ""),
      email: cell(r, email).split(/[\s,;]+/)[0] ?? "",
      phone: cell(r, phone),
      address,
      vatNumber: cell(r, vat),
      companyNumber: cell(r, crn),
      kind: /supplier|vendor/.test(said) ? "supplier" : /customer|client/.test(said) ? "client" : fileKind,
    };
  });
}

// A vCard, as an iPhone or Android shares a contact: one card or many.
export function fromVcf(text: string): ImportedContact[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1).map((c) => c.split(/END:VCARD/i)[0]);
  const unescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
  return cards.map((card) => {
    const lines = card.split("\n").filter(Boolean);
    const get = (field: string) => {
      const line = lines.find((l) => new RegExp(`^(item\\d+\\.)?${field}[;:]`, "i").test(l));
      return line ? line.slice(line.indexOf(":") + 1) : "";
    };
    const fn = unescape(get("FN"));
    const n = get("N").split(";").map(unescape);
    const personName = fn || [n[1], n[0]].filter(Boolean).join(" ");
    const org = unescape(get("ORG").split(";")[0] ?? "");
    const adr = get("ADR").split(";").map(unescape);
    // street; locality; region; postcode; country, after two unused parts.
    const address = [adr[2], adr[3], adr[4], adr[5], adr[6] && !HOME.test(adr[6]) ? adr[6] : ""].filter(Boolean).join("\n");
    return {
      ...blank(),
      name: org || personName,
      isCompany: !!org,
      contactPerson: org && personName !== org ? personName : "",
      email: unescape(get("EMAIL")),
      phone: unescape(get("TEL")),
      address,
      kind: "client" as const,
    };
  });
}

// What the reader found on a photo of an invoice or a bill. Whoever is the
// account itself is left out; on a bill the business that sent it is a
// supplier, and whoever an invoice was sent to is a customer.
export function fromScanned(found: ScannedContact[], ownName: string): ImportedContact[] {
  const own = sameName(ownName);
  return found
    .filter((c) => !own || sameName(c.name) !== own)
    .map((c) => ({
      name: tidy(c.name),
      isCompany: c.isCompany,
      contactPerson: tidy(c.contactPerson),
      email: tidy(c.email),
      phone: tidy(c.phone),
      address: tidy(c.address),
      vatNumber: tidy(c.vatNumber),
      companyNumber: tidy(c.companyNumber),
      kind: c.role === "issuer" ? "supplier" : "client",
    }));
}

// One row per business: the same name twice in a file (or across files) is
// one contact with the blanks filled from the other. Names already in the
// account are counted and left out, never added twice.
export function settle(found: ImportedContact[], existing: Pick<Client, "name" | "kind">[]): { fresh: ImportedContact[]; already: number } {
  const have = new Set(existing.map((c) => `${c.kind}:${sameName(c.name)}`));
  const byName = new Map<string, ImportedContact>();
  // A name already there counts once, however often the file repeats it.
  const already = new Set<string>();
  for (const c of found) {
    const k = `${c.kind}:${sameName(c.name)}`;
    if (!sameName(c.name)) continue;
    if (have.has(k)) {
      already.add(k);
      continue;
    }
    const was = byName.get(k);
    if (!was) {
      byName.set(k, { ...c });
      continue;
    }
    for (const f of ["contactPerson", "email", "phone", "address", "vatNumber", "companyNumber"] as const) if (!was[f]) was[f] = c[f];
    was.isCompany ||= c.isCompany;
  }
  return { fresh: [...byName.values()], already: already.size };
}

export function toClient(c: ImportedContact): Omit<Client, "id" | "archived"> {
  return {
    name: c.name,
    isCompany: c.isCompany,
    email: c.email,
    address: c.address,
    kind: c.kind,
    vatNumber: c.vatNumber,
    paymentTerms: "",
    defaultCurrency: "GBP",
    contactPerson: c.contactPerson,
    phone: c.phone,
    companyNumber: c.companyNumber,
    endUserDeclared: false,
    remindersEnabled: true,
  };
}

export type FileWay = "rows" | "vcard" | "scan" | "excel" | "other";

export function fileWay(file: { name: string; type?: string }): FileWay {
  const name = file.name.toLowerCase();
  const type = file.type ?? "";
  if (/\.vcf$/.test(name) || /vcard/.test(type)) return "vcard";
  if (/\.(csv|tsv|txt)$/.test(name) || type === "text/csv" || type === "text/tab-separated-values") return "rows";
  if (/\.(xlsx|xls|numbers|ods)$/.test(name)) return "excel";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif)$/.test(name) || type === "application/pdf" || name.endsWith(".pdf")) return "scan";
  return "other";
}
