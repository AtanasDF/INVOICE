import { GROUPS } from "@/lib/navGroups";

// What each page is for, in one line.
//
// The walkthroughs (HELP_JOURNEYS) are the deep grounding, but there are four
// of them and about twenty pages. Asked through the live model, the chat
// answered "I do not know about that part of the app" to scanning, quotes,
// expenses and most of the rest -- honest, and nearly useless. Worse, before
// it was told otherwise it filled a gap by inventing an address
// ("the invoices page at /invoices/new" for where customers are kept) and by
// declaring a real feature absent ("deposits on quotes are not a feature").
//
// So this is a hand-written summary, which drifts -- the thing argued against
// when the walkthrough frames were made to record themselves. The difference
// is that the two ways it drifts are both checked by
// harness/test-help-chat.mjs: every route here must resolve to a real page,
// and every page in the header's own nav must appear here. A new screen fails
// the suite until it is described, and a renamed route fails it at once.
//
// The words are the app's own: the page's name as the header shows it, and
// what it is for in the vocabulary the screens use.
export const HELP_FACTS: { route: string; what: string }[] = [
  { route: "/", what: "The dashboard. What is owed to you, what you owe, and the four tools: scan a receipt, make an invoice, copy a document, check a company." },
  { route: "/invoices", what: "Every sales invoice you have raised, with what is still owed on each: drafts, sent, part paid and paid. Open one to record a payment against it. Once an invoice has been sent, its number, date, lines and customer are locked because that is what was actually issued -- a wrong amount is corrected by adding a credit note on that invoice, not by editing it." },
  { route: "/quotes", what: "Priced offers to a customer. Send one and they get a link to accept or decline; accepted, \"Turn into invoice\" copies the lines across. A deposit is set on the quote itself while it is still a draft, either as a percentage or as an amount; it goes out as its own invoice first and comes off the final one. There is also a From suppliers tab, for asking several suppliers to price the same list." },
  { route: "/money", what: "What came in and what went out over a period, side by side." },
  { route: "/jobs", what: "Work grouped by job, so a customer's invoices, quotes and costs for one piece of work are together." },
  { route: "/clients", what: "Customers and suppliers, on two tabs. Where a contact's address, VAT number, payment terms and bank details are kept, and where two records for one business are merged." },
  { route: "/recurring/invoices", what: "Invoices that go out again on their own, weekly, monthly or yearly." },
  { route: "/receipts", what: "Every receipt and bill you have saved, and the ones still to pay." },
  { route: "/receipts/review", what: "Documents that were read but not yet checked. What was read off each one is confirmed here before it counts towards any total." },
  { route: "/expenses", what: "Everything you have spent, added up by category and by month." },
  { route: "/mileage", what: "Trips in your own vehicle, at HMRC's rates, worked out from the miles or from two postcodes." },
  { route: "/recurring", what: "Costs that come round again on their own, like a subscription or rent." },
  { route: "/scan", what: "Photograph or upload receipts, bills and invoices and have them read. Several at once, and several documents on one page." },
  { route: "/copy", what: "Photograph any piece of paper and get one PDF back. Nothing is read and nothing is stored." },
  { route: "/convert", what: "Change a file into another kind on your own device: pictures to PDF, a PDF to pictures or to its words, a spreadsheet to other formats. Nothing is uploaded." },
  { route: "/check-company", what: "Look a UK company up on the Companies House register: whether it is trading, who runs it, what is overdue, and whether anything is owed against it." },
  { route: "/vat", what: "A VAT quarter worked out on either basis, with boxes 1, 4, 5, 6 and 7. It files nothing anywhere." },
  { route: "/files", what: "Every photograph and PDF you have saved, as tiles." },
  { route: "/help", what: "How it works: the walkthroughs, step by step." },
  { route: "/feedback", what: "Write to Atanas, who made the app. It reaches him by email and he replies to the address you signed up with." },
  { route: "/settings", what: "Your business name and address, your bank details, your VAT setting, and what goes on every invoice you send. The VAT switch changes new invoices only and never one already sent." },
];

// The header's own name for a page, so the chat calls it what the screen
// calls it.
const NAMES: Record<string, string> = Object.fromEntries([
  ["/", "Home"],
  ["/settings", "Settings"],
  ...GROUPS.flatMap((g) => g.links.map(([href, label]) => [href, label] as const)),
]);

export const helpFactsText = () =>
  HELP_FACTS.map((f) => `- ${NAMES[f.route] ?? f.route} (at ${f.route}): ${f.what}`).join("\n");
