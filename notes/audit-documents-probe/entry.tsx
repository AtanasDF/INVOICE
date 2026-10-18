import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import IssuedInvoice from "@/components/invoice/IssuedInvoice";
import InvoiceDocument from "@/components/invoice/InvoiceDocument";
import QuoteDocument from "@/components/quote/QuoteDocument";
import StatementDocument from "@/components/StatementDocument";
import { readSheet, sheetText, sheetCsv, sheetHtml } from "@/lib/sheetFile";
import { PAGE_WIDTH, PAGE_HEIGHT, PAGE_MARGIN } from "@/lib/invoicePdf";

const LONG = "The Extraordinarily Long-Named Plastering, Rendering & Decorating Company of West Yorkshire and the Surrounding Districts";
const profile: any = { businessName: LONG, registeredName: "Nasko Ltd", companyNumber: "12345678", vatRegistered: true, vatNumber: "GB726129090", address: "1 Mill Lane\nLeeds", bankDetails: "Sort 12-34-56\nAcc 12345678", reminderLatePaymentInterest: true };
const client: any = { id: "c", name: "Smith & Sons <Ltd> \"Quoted\"", isCompany: true, email: "a@b.example", address: "2 Road\nLeeds", vatNumber: "", contactPerson: "" };
const items = [
  { description: "Skim ceilings", quantity: 2, unitPrice: 500, vatRate: "reverse_charge", kind: "labour" },
  { description: "Plaster bags", quantity: 10, unitPrice: 10, vatRate: "reverse_charge", kind: "materials" },
  { description: "Deposit for Q-001", quantity: -1, unitPrice: 250, vatRate: "reverse_charge" },
  { description: "=HYPERLINK(\"http://x.example\",\"click\")", quantity: 1, unitPrice: -5, vatRate: "reverse_charge" },
  { description: "工事 — أعمال الجص", quantity: 1, unitPrice: 1, vatRate: "reverse_charge" },
];
const invoice: any = { id: "i", clientId: "c", date: "2026-10-01", number: "INV-000030", items, notes: "Thanks: see you", dueDate: "2026-10-15", paymentTerms: "14 days", status: "partial", tags: [], vatRegistered: true, cisRate: 20 };
const creditNotes: any = [{ id: "cn", invoiceId: "i", date: "2026-10-05", amount: 20, reason: "Wrong: item" }];
const payments: any = [{ id: "p", invoiceId: "i", date: "2026-10-06", amount: 100, method: "bank" }];
const draft: any = { version: 1, docType: "invoice", layout: "classic", issuer: { name: LONG, address: "1 Mill Lane\nLeeds", email: "x@y.example", phone: null, website: null, vatNumber: "GB726129090", companyNumber: null, utr: null }, bank: { accountName: "Nasko", sortCode: "12-34-56", accountNumber: "12345678", iban: null, reference: null }, customer: { name: client.name, address: "2 Road", email: null }, number: "INV-31", date: "2026-10-01", dueDate: "2026-10-15", paymentTerms: "14 days", currencySymbol: "£", vatRegistered: true, cis: { enabled: true, rate: 20 }, reverseCharge: true, lines: [{ description: "Labour job", quantity: 1, unitPrice: 1000, vatRate: "standard", kind: "labour" }, { description: "Sand", quantity: 1, unitPrice: 100, vatRate: "standard", kind: "materials" }, { description: "Refund", quantity: 1, unitPrice: -50, vatRate: "standard", kind: "other" }], notes: "Note here", footer: "", signature: null, signedBy: "" };
const quote: any = { id: "q", clientId: "c", number: "Q-001", date: "2026-10-01", validUntil: "2026-10-31", items: items.slice(0, 2).map((i) => ({ ...i, vatRate: "standard" })), notes: "", status: "sent", invoiceId: null, deposit: { kind: "percent", value: 25 }, depositInvoiceId: null, depositClaimed: false, vatRegistered: true };
const statement: any = { lines: [{ id: "l1", date: "2026-08-01", number: "INV-001", daysLate: 3, charged: 500, credited: 20, paid: 100, credit: 0, balance: 380 }], outstanding: 380, inCredit: 0, ageing: { current: 0, d30: 380, d60: 0, d90: 0 } };
const many = { ...invoice, cisRate: null, items: Array.from({ length: 200 }, (_, i) => ({ description: `Line ${i + 1}`, quantity: 1, unitPrice: 10, vatRate: "standard" })) };
const zero = { ...invoice, cisRate: null, status: "sent", items: [{ description: "Goodwill", quantity: 1, unitPrice: 0, vatRate: "standard" }] };

const docs: Record<string, any> = {
  issued: <IssuedInvoice invoice={invoice} client={client} profile={profile} creditNotes={creditNotes} payments={payments} forPdf logo={null} />,
  free: <InvoiceDocument draft={draft} />,
  freeQuote: <InvoiceDocument draft={{ ...draft, docType: "quote", cis: { enabled: false, rate: 20 } }} />,
  quote: <QuoteDocument quote={quote} client={client} profile={profile} logo={null} />,
  statement: <StatementDocument statement={statement} client={client} profile={profile} asAt="2026-10-18" />,
  many: <IssuedInvoice invoice={many} client={client} profile={profile} creditNotes={[]} payments={[]} forPdf />,
  zero: <IssuedInvoice invoice={zero} client={client} profile={profile} creditNotes={[]} payments={[]} forPdf />,
};
const out: Record<string, any> = {};
for (const [k, node] of Object.entries(docs)) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0";
  document.body.appendChild(host);
  const sheet = document.createElement("div");
  sheet.className = "bg-white";
  sheet.style.cssText = `width:${PAGE_WIDTH}px;min-height:${PAGE_HEIGHT}px;padding:${PAGE_MARGIN}px;box-sizing:border-box`;
  host.appendChild(sheet);
  flushSync(() => createRoot(sheet).render(node));
  const doc = readSheet(sheet);
  out[k] = { children: sheet.children.length, innerText: sheet.innerText, text: sheetText(doc), csv: sheetCsv(doc), html: sheetHtml(doc), height: Math.max(sheet.scrollHeight, sheet.getBoundingClientRect().height), width: sheet.offsetWidth };
}
(window as any).OUT = out;
