// A quote left on the Free page must not walk into a sales invoice.
//
// The Free page and the quote builder share ONE stored draft. Writing a
// quote and then opening "Write an invoice" used to import it: the lines,
// the terms and any CIS rate came with it -- and a quote hides CIS, so a
// deduction the customer had never seen appeared on the invoice. The
// banner only said "Imported from your free invoice", and saving clears
// the draft, so the quote he had not finished with was gone.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, UID, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], quotes: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 7, custom_categories: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-quote-not-invoice" });

const draft = (docType) => ({
  version: 1, docType, layout: "modern",
  issuer: { name: "Harness Ltd", address: null, email: null, phone: null, website: null, vatNumber: null, companyNumber: null, utr: null },
  bank: { accountName: null, sortCode: null, accountNumber: null, iban: null, reference: null },
  customer: { name: "Big Contractor Ltd", address: null, email: null },
  number: "Q-18", date: day(0), dueDate: day(14), paymentTerms: "14 days", currencySymbol: "£",
  vatRegistered: false, cis: { enabled: true, rate: 30 }, reverseCharge: false,
  lines: [{ id: "l1", description: "Groundworks, phase one", quantity: 1, unitPrice: 4800, vatRate: "standard", kind: "labour" }],
  notes: "", footer: "",
});

// innerText does NOT include what is typed in a box, and the imported
// lines live in inputs -- so a check that only read the page text would
// pass whether or not the quote had been imported.
const everything = async () =>
  (await bodyText(page)) + " " + (await page.evaluate(() => [...document.querySelectorAll("input, textarea, select")].map((i) => i.value).join(" ")));

const putDraft = (d) => page.evaluate((v) => localStorage.setItem("free-invoice-draft", JSON.stringify(v)), d);
const storedDraft = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("free-invoice-draft") ?? "null"); } catch { return "unreadable"; } });

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });

  // A quote sitting in the shared draft.
  await putDraft(draft("quote"));
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(1800);
  const t = await everything();
  check("a quote is not imported into a new invoice", !/Groundworks, phase one/.test(t), t.replace(/\s+/g, " ").slice(0, 300));
  check("...and there is no banner claiming it was", !/Imported from your free invoice/i.test(t), t.replace(/\s+/g, " ").slice(0, 300));
  check("...so the CIS the quote hid doesn't appear either", !/30%/.test(t), t.replace(/\s+/g, " ").slice(0, 300));
  check("...and the customer isn't filled in from it", !/Big Contractor Ltd/.test(t), t.replace(/\s+/g, " ").slice(0, 300));
  check("...and the price it carried isn't there either", !/4800|4,800/.test(t), t.replace(/\s+/g, " ").slice(0, 300));

  const still = await storedDraft();
  check("the quote he hasn't finished with is still there", still && still.docType === "quote" && still.lines?.[0]?.description === "Groundworks, phase one", JSON.stringify(still).slice(0, 200));

  // An actual invoice draft still imports, or the gate would be too wide.
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await putDraft({ ...draft("invoice"), number: "INV-18", cis: { enabled: false, rate: 20 } });
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(1800);
  const t2 = await everything();
  check("an invoice draft IS still imported", /Groundworks, phase one/.test(t2), t2.replace(/\s+/g, " ").slice(0, 400));
  check("...and says where it came from", /Imported from your free invoice/i.test(t2), t2.replace(/\s+/g, " ").slice(0, 400));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
