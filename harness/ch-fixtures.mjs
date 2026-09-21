// A stand-in for the Companies House API: fixed payloads for the company
// checker's tests. Started by test-check-company.mjs; COMPANIES_HOUSE_API_BASE
// points the app's route at it.
import { createServer } from "node:http";

const at = (years, months = 0) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth() - months, 15)).toISOString().slice(0, 10);
};
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const daysAhead = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export const SIX_YEARS = at(6);

const officer = (name, role, months, extra = {}) => ({ name, officer_role: role, appointed_on: at(0, months), occupation: "Director", nationality: "British", ...extra });

export const COMPANIES = {
  // Straightforward active company.
  "12345678": {
    profile: {
      company_name: "ACME BUILDING SERVICES LTD",
      company_number: "12345678",
      company_status: "active",
      type: "ltd",
      date_of_creation: SIX_YEARS,
      jurisdiction: "england-wales",
      sic_codes: ["43220", "41202"],
      registered_office_address: { premises: "12", address_line_1: "Mill Lane", locality: "Leeds", postal_code: "ls1 4ab", country: "England" },
      has_charges: false,
      has_insolvency_history: false,
      accounts: {
        last_accounts: { made_up_to: at(0, 8), type: "micro-entity" },
        next_accounts: { due_on: daysAhead(120), period_end_on: at(0, -4), overdue: false },
      },
      confirmation_statement: { last_made_up_to: at(0, 6), next_due: daysAhead(180), next_made_up_to: daysAhead(170), overdue: false },
    },
    officers: {
      active_count: 3,
      resigned_count: 2,
      items: [
        officer("HOLT, Sarah Jane", "director", 72),
        officer("HOLT, Michael", "director", 72),
        officer("PATEL, Nisha", "secretary", 20),
        { name: "GONE, Former", officer_role: "director", appointed_on: at(6), resigned_on: at(2) },
      ],
    },
    psc: {
      active_count: 1,
      ceased_count: 0,
      items: [
        { kind: "individual-person-with-significant-control", name: "Sarah Jane Holt", natures_of_control: ["ownership-of-shares-75-to-100-percent", "voting-rights-75-to-100-percent"], notified_on: SIX_YEARS },
      ],
    },
  },

  // Gone: dissolved, with an earlier name.
  "09876543": {
    profile: {
      company_name: "OLD TRADE LTD",
      company_number: "09876543",
      company_status: "dissolved",
      type: "ltd",
      date_of_creation: at(11),
      date_of_cessation: at(1, 6),
      jurisdiction: "england-wales",
      sic_codes: ["47990"],
      registered_office_address: { address_line_1: "4 Station Road", locality: "Hull", postal_code: "HU1 1AA" },
      previous_company_names: [{ name: "OLDER TRADE LTD", effective_from: at(11), ceased_on: at(7) }],
      accounts: { last_accounts: { made_up_to: at(3), type: "total-exemption-full" } },
    },
    officers: { active_count: 0, resigned_count: 3, items: [{ name: "BROWN, Terry", officer_role: "director", appointed_on: at(11), resigned_on: at(1, 6) }] },
    psc: { active_count: 0, ceased_count: 1, items: [] },
  },

  // Filing late, from a formation agent's address.
  "11112222": {
    profile: {
      company_name: "LATE FILINGS LTD",
      company_number: "11112222",
      company_status: "active",
      type: "ltd",
      date_of_creation: at(2),
      jurisdiction: "england-wales",
      sic_codes: ["62020"],
      registered_office_address: { premises: "20-22", address_line_1: "Wenlock Road", locality: "London", postal_code: "N1 7GU" },
      previous_company_names: [
        { name: "FIRST NAME LTD", effective_from: at(2), ceased_on: at(1) },
        { name: "SECOND NAME LTD", effective_from: at(1), ceased_on: at(0, 6) },
      ],
      accounts: { last_accounts: { made_up_to: at(1, 6), type: "micro-entity" }, next_accounts: { due_on: daysAgo(122), period_end_on: at(1), overdue: true } },
      confirmation_statement: { last_made_up_to: at(1), next_due: daysAgo(21), overdue: true },
    },
    officers: { active_count: 1, resigned_count: 0, items: [officer("SHORT, Ali", "director", 24)] },
    psc: { active_count: 0, ceased_count: 0, items: [{ statement: "no-individual-or-entity-with-signficant-control" }] },
  },

  // In liquidation, with charges, an insolvency case and a disqualified officer.
  "33334444": {
    profile: {
      company_name: "HEAVY PLANT HIRE LTD",
      company_number: "33334444",
      company_status: "liquidation",
      type: "ltd",
      date_of_creation: at(14),
      jurisdiction: "england-wales",
      sic_codes: ["77320"],
      registered_office_address: { address_line_1: "Unit 7 Dock Estate", locality: "Grimsby", postal_code: "DN31 3AA" },
      has_charges: true,
      has_insolvency_history: true,
      accounts: { last_accounts: { made_up_to: at(2), type: "small" }, next_accounts: { due_on: daysAgo(400), overdue: true } },
    },
    officers: {
      active_count: 2,
      resigned_count: 4,
      items: [
        officer("KEEN, Robert", "director", 168, { links: { officer: { disqualifications: "/disqualified-officers/natural/abc" } } }),
        officer("KEEN, Diane", "secretary", 168),
      ],
    },
    psc: { active_count: 1, ceased_count: 0, items: [{ kind: "corporate-entity-person-with-significant-control", name: "KEEN HOLDINGS LIMITED", natures_of_control: ["ownership-of-shares-50-to-75-percent"], notified_on: at(5) }] },
    charges: {
      total_count: 3,
      satisfied_count: 1,
      part_satisfied_count: 0,
      items: [
        { status: "outstanding", created_on: at(4), classification: { description: "A registered charge" }, persons_entitled: [{ name: "BIG BANK PLC" }] },
        { status: "outstanding", created_on: at(3), classification: { description: "A registered charge" }, persons_entitled: [{ name: "ASSET FINANCE LTD" }] },
        { status: "fully-satisfied", created_on: at(9), satisfied_on: at(6), classification: { description: "Legal charge" }, persons_entitled: [{ name: "BIG BANK PLC" }] },
      ],
    },
    insolvency: {
      cases: [
        {
          type: "creditors-voluntary-liquidation",
          dates: [{ type: "wound-up-on", date: at(0, 5) }],
          practitioners: [{ name: "J. SMITH, Rescue LLP" }],
        },
      ],
    },
  },

  // Officers won't load: the report must say so rather than say "none".
  "55556666": {
    profile: {
      company_name: "PARTIAL DATA LTD",
      company_number: "55556666",
      company_status: "active",
      type: "llp",
      date_of_creation: at(0, 7),
      jurisdiction: "england-wales",
      sic_codes: ["74909", "99999"],
      registered_office_address: { address_line_1: "1 High Street", locality: "Derby", postal_code: "DE1 1AA" },
      confirmation_statement: { next_due: daysAhead(40), overdue: false },
    },
    officersStatus: 500,
    psc: { active_count: 0, ceased_count: 0, items: [] },
  },
};

const SEARCH = {
  acme: [
    { title: "ACME BUILDING SERVICES LTD", company_number: "12345678", company_status: "active", date_of_creation: SIX_YEARS, address: { premises: "12", address_line_1: "Mill Lane", locality: "Leeds", postal_code: "LS1 4AB" } },
    { title: "ACME PLANT LIMITED", company_number: "33334444", company_status: "liquidation", date_of_creation: at(14), address_snippet: "Unit 7 Dock Estate, Grimsby" },
    { title: "ACME OLD TRADE LTD", company_number: "09876543", company_status: "dissolved", date_of_creation: at(11), address_snippet: "4 Station Road, Hull" },
  ],
};

export function startFixtures(port) {
  const calls = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/__calls") return send(200, calls);
    if (url.pathname === "/__reset") {
      calls.length = 0;
      return send(200, { ok: true });
    }
    calls.push({ path: url.pathname + url.search, auth: req.headers.authorization ?? "" });
    if (url.pathname === "/search/companies") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const items = Object.entries(SEARCH).find(([k]) => q.includes(k))?.[1] ?? [];
      return send(200, { items, total_results: items.length });
    }
    const m = /^\/company\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!m) return send(404, { errors: [{ error: "not-found" }] });
    // Companies House having a bad day, on request: a reserved number that
    // always 500s, so a suite can tell an outage apart from a rate limit.
    if (m[1] === "00000500") return send(500, { errors: [{ error: "service-unavailable" }] });
    const company = COMPANIES[m[1]];
    if (!company) return send(404, { errors: [{ error: "company-profile-not-found" }] });
    const part = m[2] ?? "";
    if (!part) return send(200, company.profile);
    if (part.startsWith("/officers")) return company.officersStatus ? send(company.officersStatus, { error: "boom" }) : send(200, company.officers);
    if (part.startsWith("/persons-with-significant-control")) return company.psc ? send(200, company.psc) : send(404, {});
    if (part.startsWith("/charges")) return company.charges ? send(200, company.charges) : send(404, {});
    if (part.startsWith("/insolvency")) return company.insolvency ? send(200, company.insolvency) : send(404, {});
    return send(404, {});
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1]?.endsWith("ch-fixtures.mjs")) {
  const port = Number(process.argv[2] ?? 3399);
  await startFixtures(port);
  console.log("fixtures on", port);
}
