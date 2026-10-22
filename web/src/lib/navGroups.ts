// The app's own map of itself: the header's main links and More, and every
// page in one of them.
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
// Six things up front, everything else one tap away under More (Atanas,
// 2026-10-22: "simple and attractive... the easiest way"). People leave
// these apps because "simple functions take over 10 taps and are buried in
// sub menus" (notes/competitor-research.md); nineteen items in three menus
// was that. Nothing here was removed: every page is still in one group.
export const MAIN_LABEL = "Main";
export const MORE_LABEL = "More";

export const GROUPS: Group[] = [
  {
    label: MAIN_LABEL,
    links: [
      ["/scan", "Scan"],
      ["/invoices", "Invoices"],
      ["/receipts", "Receipts"],
      ["/clients", "Customers"],
      ["/mileage", "Mileage"],
    ],
  },
  {
    label: MORE_LABEL,
    links: [
      ["/quotes", "Quotes"],
      ["/receipts/review", "Needs review"],
      ["/expenses", "Expenses and tax"],
      ["/money", "Money"],
      ["/recurring/invoices", "Recurring invoices"],
      ["/recurring", "Recurring expenses"],
      ["/jobs", "Jobs"],
      ["/files", "Files"],
      ["/copy", "Copy a document"],
      ["/convert", "Change a file"],
      ["/check-company", "Check a company"],
      ["/vat", "VAT"],
      // Before Feedback on purpose: most questions should be answered by a
      // walkthrough rather than by asking somebody.
      ["/help", "How it works"],
      ["/feedback", "Feedback"],
    ],
  },
];

export const NAV_HREFS = ["/", "/settings", ...GROUPS.flatMap((g) => g.links.map(([href]) => href))];
