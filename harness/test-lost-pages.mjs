// Three invoices in one nine-page supplier PDF.
//
// The reader is asked for "the pages this document is on", and a reader
// that answers with the page each invoice STARTS on -- 1, 4, 7 -- used to
// lose six pages. Every part was cut to its single claimed page, and pages
// 2-3, 5-6 and 8-9 went into no part at all: they were written nowhere.
// Three one-page tiles were reviewed, saved, and became the whole
// accounting record of three invoices whose line items and carried-over
// totals were on the pages that vanished.
//
// Losing the split is cheap. Losing a page of a receipt is not, so when
// any page belongs to no document, the whole file goes to each of them
// with a note saying why.
import fs from "fs";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const PDF = "data:application/pdf;base64," + fs.readFileSync(new URL("./nine-page.b64", import.meta.url), "utf8").trim();

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1, custom_categories: null });

// What the reader says: three invoices, each listing only its FIRST page.
const doc = (vendor, total, pages) => ({
  documentType: "invoice", vendor, vendorConfidence: "high",
  date: new Date().toISOString().slice(0, 10), dateAsPrinted: null, dateConfidence: "high", dateAmbiguous: false, dateAlternative: null,
  invoiceNumber: null, dueDate: null, dueDateAsPrinted: null, dueDateAmbiguous: false, dueDateAlternative: null,
  creditedInvoiceNumber: null, totalAmount: total, totalAmountConfidence: "high", currency: "GBP",
  vatAmount: 0, vatAmountConfidence: "high", category: "Supplies",
  lineItems: [], details: { other: [] }, contactPerson: null, contactEmail: null,
  notes: null, pages, box: null, paidOnDocument: false,
});
const DOCS = [doc("Alpha Supplies", 480, [1]), doc("Bravo Timber", 210, [4]), doc("Cee Fixings", 95, [7])];

const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  width: 390,
  profile: "profile-lost-pages",
  intercept: (req, u) => {
    if (u.pathname !== "/api/scan") return false;
    req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ result: DOCS[0], documents: DOCS }) });
    return true;
  },
});

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.evaluate((p) => sessionStorage.setItem("scan-handoff-capture", JSON.stringify({ dataUrl: p, mediaType: "application/pdf" })), PDF);
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle0" });
  await sleep(14000);

  const t = await bodyText(page);
  check("the three invoices were found", /Document 1 of 3/.test(t), t.replace(/\s+/g, " ").slice(0, 300));

  // The note lands in the form's own notes box, which page text never
  // contains.
  // Textareas only, each truncated: an input somewhere holds a PDF data
  // URL, and serialising that back through the protocol times out.
  const noteOf = () => page.evaluate(() => [...document.querySelectorAll("textarea")].map((i) => (i.value ?? "").slice(0, 400)).join(" \u2022 "));
  const every = await noteOf();
  check("the document says the file wasn't split, rather than pages being cut out", /wasn't split|couldn't be split/i.test(every), every.slice(0, 500));
  check("...and says which pages belong to no document, so nothing is left out", /belong to no document|2, 3, 5, 6, 8/i.test(every), every.slice(0, 600));
  check("...and still says which pages are its own", /On page \d|On pages \d/i.test(every), every.slice(0, 400));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
