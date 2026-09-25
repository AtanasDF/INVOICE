// The app's own map of itself: the header's three groups, and every page in
// one of them.
//
// This lives here rather than in AppShell because two other things need to
// read it -- the help chat, which must never name a page that does not exist,
// and the suite that checks the two agree. A nav list inside a client
// component cannot be imported by either.

export type Group = { label: string; links: [string, string][] };

// The whole app in three groups (Atanas, 2026-09-22: "make it as one whole
// app not two different apps"): money coming in, money going out, and the
// tools, the free ones among them. Every page has a place here, so there
// is no "More pages" drawer any more, and a phone shows one Menu button
// instead of nine links wrapping to three rows.
export const GROUPS: Group[] = [
  {
    label: "Money in",
    links: [
      ["/invoices", "Invoices"],
      ["/quotes", "Quotes"],
      ["/money", "Money"],
      ["/jobs", "Jobs"],
      ["/clients", "Customers & suppliers"],
      ["/recurring/invoices", "Recurring invoices"],
    ],
  },
  {
    label: "Money out",
    links: [
      ["/receipts", "Receipts & bills"],
      ["/receipts/review", "Needs review"],
      ["/expenses", "Expenses"],
      ["/mileage", "Mileage"],
      ["/recurring", "Recurring expenses"],
    ],
  },
  {
    label: "Tools",
    links: [
      ["/scan", "Scan"],
      ["/copy", "Copy a document"],
      ["/convert", "Change a file"],
      ["/check-company", "Check a company"],
      ["/vat", "VAT"],
      ["/files", "Files"],
      // Before Feedback on purpose: most questions should be answered by a
      // walkthrough rather than by asking somebody.
      ["/help", "How it works"],
      ["/feedback", "Feedback"],
    ],
  },
];
export const NAV_HREFS = ["/", "/settings", ...GROUPS.flatMap((g) => g.links.map(([href]) => href))];
