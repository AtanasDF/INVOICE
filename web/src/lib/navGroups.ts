// The app's own map of itself: the five sections in the header, the tabs
// inside each, and the tools under a line -- every page in one of them.
//
// This lives here rather than in AppShell because two other things need to
// read it -- the help chat, which must never name a page that does not exist,
// and the suite that checks the two agree. A nav list inside a client
// component cannot be imported by either.

export type Group = { label: string; links: [string, string][] };
export type Section = { href: string; label: string; tabs: [string, string][] };

// Five sections and Home (Atanas, 2026-10-28, launch plan step F). Twenty-one
// links was a list nobody read past the sixth, and three of them -- Money,
// Expenses and VAT -- were one question asked three ways. Every page still
// has a place: the ones that used to be links of their own are tabs at the
// top of the section they belong to.
export const SECTIONS: Section[] = [
  { href: "/scan", label: "Scan", tabs: [] },
  {
    href: "/invoices",
    label: "Invoices",
    tabs: [
      ["/invoices", "Invoices"],
      ["/quotes", "Quotes"],
      ["/recurring/invoices", "Repeating"],
    ],
  },
  {
    href: "/receipts",
    label: "Receipts",
    tabs: [
      ["/receipts", "Receipts"],
      ["/receipts/review", "Needs review"],
      ["/recurring", "Repeating"],
      ["/mileage", "Mileage"],
    ],
  },
  { href: "/clients", label: "Customers", tabs: [] },
  {
    href: "/money",
    label: "Money",
    tabs: [
      ["/money", "Owed and owing"],
      ["/expenses", "Expenses and tax"],
      ["/vat", "VAT"],
    ],
  },
];

export const TOOLS_LABEL = "Tools";
export const TOOLS: [string, string][] = [
  ["/files", "Files"],
  ["/copy", "Copy a document"],
  ["/convert", "Change a file"],
  ["/check-company", "Check a company"],
  ["/jobs", "Jobs"],
];
// Before Feedback on purpose: most questions should be answered by a
// walkthrough rather than by asking somebody.
export const AFTER_TOOLS: [string, string][] = [
  ["/help", "How it works"],
  ["/feedback", "Feedback"],
];

// The full name of every page, for the help chat, which has to call a page
// what the person would recognise even out of its tab row ("Repeating" alone
// says nothing).
export const GROUPS: Group[] = [
  {
    label: "Sections",
    links: [
      ["/scan", "Scan"],
      ["/invoices", "Invoices"],
      ["/quotes", "Quotes (a tab under Invoices)"],
      ["/recurring/invoices", "Repeating invoices (a tab under Invoices)"],
      ["/receipts", "Receipts"],
      ["/receipts/review", "Needs review (a tab under Receipts)"],
      ["/recurring", "Repeating expenses (a tab under Receipts)"],
      ["/mileage", "Mileage (a tab under Receipts)"],
      ["/clients", "Customers"],
      ["/money", "Money"],
      ["/expenses", "Expenses and tax (a tab under Money)"],
      ["/vat", "VAT (a tab under Money)"],
    ],
  },
  { label: TOOLS_LABEL, links: [...TOOLS, ...AFTER_TOOLS] },
];

export const NAV_HREFS = ["/", "/settings", ...GROUPS.flatMap((g) => g.links.map(([href]) => href))];

// The section a page sits in: its own address, or one of its tabs.
export const sectionOf = (href: string | null) =>
  href ? SECTIONS.find((s) => s.href === href || s.tabs.some(([t]) => t === href)) ?? null : null;
