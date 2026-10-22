// "Set up in one go from an invoice you've already sent": the rules for what
// one reading may write into an account, imported from the app
// (src/lib/setupFromInvoice.ts), not copied. What matters is that a photo never
// quietly overwrites something typed by hand, never invents a number, and
// carries the numbering on rather than restarting it.
import { applySetup, bankText, numberingAfter, setupCustomer, setupOffers } from "./gen/lib/setupFromInvoice.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const reading = (o = {}) => ({
  issuer: { name: "Kovac Couriers", address: "1 Depot Way\nCarlisle CA1 1AA", email: null, phone: null, website: null, vatNumber: null, companyNumber: "12345678", utr: null },
  bank: { accountName: "J Kovac", sortCode: "12-34-56", accountNumber: "12345678", iban: null, reference: null },
  customer: { name: "Skido Logistics Ltd", address: "Unit 4, Carlisle", email: "accounts@skido.example" },
  invoiceNumber: "INV-0042", numberingPrefix: null, date: "2026-10-01", dueDate: null, paymentTerms: null, currency: "GBP",
  showsVat: false, cis: false, lineItems: [], notes: null, footer: null,
  layout: { headerAlignment: "left", metaPosition: "right", hasLogo: false, style: "plain" },
  ...o,
});
const fresh = { businessName: "", address: "", vatNumber: "", companyNumber: "", bankDetails: "", invoicePrefix: "", invoiceNextNumber: 1 };

// ---- The next number --------------------------------------------------------
const n = (s) => { const r = numberingAfter(s); return r ? `${r.prefix}${r.next}` : null; };
check("INV-0042 carries on at INV-0043, zeros kept", n("INV-0042") === "INV-0043", n("INV-0042"));
check("0099 rolls over to 0100, not 00100", n("0099") === "0100", n("0099"));
check("a plain 17 becomes 18", n("17") === "18", n("17"));
check("'Invoice No. 7' reads as 7", n("Invoice No. 7") === "8", n("Invoice No. 7"));
check("a number that is only a year gives nothing", numberingAfter("2025") === null);
check("no digits at all gives nothing", numberingAfter("ABC") === null && numberingAfter(null) === null);

// ---- Bank details -----------------------------------------------------------
check("bank details are written out as a customer would read them",
  bankText(reading().bank) === "Account name: J Kovac\nSort code: 12-34-56\nAccount number: 12345678", JSON.stringify(bankText(reading().bank)));
check("a sort code with no account number is not something to pay into",
  bankText({ accountName: "J Kovac", sortCode: "12-34-56", accountNumber: null, iban: null, reference: null }) === "");

// ---- What is offered, and what is ticked ------------------------------------
const offers = setupOffers(reading(), fresh);
check("on a new account everything read is offered and ticked",
  JSON.stringify(offers.map((o) => [o.field, o.fillsEmpty])) === JSON.stringify([["businessName", true], ["address", true], ["companyNumber", true], ["bankDetails", true], ["numbering", true]]),
  JSON.stringify(offers.map((o) => [o.field, o.fillsEmpty])));
check("nothing the reading did not find is offered (no VAT number)", !offers.some((o) => o.field === "vatNumber"));
const typed = setupOffers(reading(), { ...fresh, businessName: "Kovac Deliveries", bankDetails: "Monzo 04-00-04 11112222" });
check("what somebody typed is offered unticked, never assumed",
  typed.find((o) => o.field === "businessName")?.fillsEmpty === false && typed.find((o) => o.field === "bankDetails")?.fillsEmpty === false);
check("the test account's PLACEHOLDER name counts as empty", setupOffers(reading(), { ...fresh, businessName: "PLACEHOLDER" }).find((o) => o.field === "businessName")?.fillsEmpty === true);
check("a value already the same is not offered again", !setupOffers(reading(), { ...fresh, companyNumber: "12345678" }).some((o) => o.field === "companyNumber"));
check("numbering already moved on is offered unticked",
  setupOffers(reading(), { ...fresh, invoiceNextNumber: 120 }).find((o) => o.field === "numbering")?.fillsEmpty === false);

// ---- Applying ---------------------------------------------------------------
const applied = applySetup({ ...fresh, vatRegistered: false }, reading(), ["businessName", "numbering"]);
check("only the ticked ones are written", applied.businessName === "Kovac Couriers" && applied.address === "" && applied.bankDetails === "", JSON.stringify(applied));
check("numbering is written as prefix and number apart", applied.invoicePrefix === "INV-00" && applied.invoiceNextNumber === 43, JSON.stringify([applied.invoicePrefix, applied.invoiceNextNumber]));
check("nothing else on the profile is touched", applied.vatRegistered === false);

// ---- The customer -----------------------------------------------------------
check("the customer on the invoice is offered", setupCustomer(reading(), [])?.name === "Skido Logistics Ltd");
check("...but not when they are already a contact, whatever the spacing or case", setupCustomer(reading(), ["skido  logistics ltd"]) === null);
check("an invoice naming no customer offers none", setupCustomer(reading({ customer: { name: null, address: null, email: null } }), []) === null);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
