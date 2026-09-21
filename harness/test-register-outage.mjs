// When Companies House can't be reached.
//
// "Couldn't ask" and "asked, and there is no such company" used to arrive
// identically: the route answers 429 or 503 with { items: [], busy: true }
// when the register times out or the per-IP cap trips, and an empty list
// is exactly what a real search with no results returns. So a five-second
// timeout printed "Companies House has no company under this name" under
// a live, trading customer -- and a dissolved company came back looking
// unchecked rather than flagged, which is the one thing the check exists
// to catch.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const FALSEHOOD = "Companies House has no company under this name";

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1, custom_categories: null });

// "down" = the register is unreachable; "empty" = it answered, nothing found.
let mode = "down";
const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  width: 390,
  profile: "profile-register-outage",
  intercept: (req, u) => {
    if (u.pathname === "/api/scan") {
      const doc = {
        documentType: "receipt", vendor: "", vendorConfidence: "low",
        date: new Date().toISOString().slice(0, 10), dateAsPrinted: null, dateConfidence: "high", dateAmbiguous: false, dateAlternative: null,
        invoiceNumber: null, dueDate: null, dueDateAsPrinted: null, dueDateAmbiguous: false, dueDateAlternative: null,
        creditedInvoiceNumber: null, totalAmount: 48.6, totalAmountConfidence: "high", currency: "GBP",
        vatAmount: 8.1, vatAmountConfidence: "high", category: "Supplies",
        lineItems: [], details: { other: [] }, contactPerson: null, contactEmail: null,
        notes: null, pages: [], box: null, paidOnDocument: true,
      };
      req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ result: doc, documents: [doc] }) });
      return true;
    }
    if (u.pathname !== "/api/company-search") return false;
    const body = mode === "down"
      ? { status: 503, payload: { configured: true, items: [], busy: true } }
      : { status: 200, payload: { configured: true, items: [] } };
    req.respond({ status: body.status, headers: { "content-type": "application/json" }, body: JSON.stringify(body.payload) });
    return true;
  },
});

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// The supplier box on /scan is the ONE field that checks a typed name
// against the register (ContactField with checkTyped), so it is the only
// place the sentence can appear -- a version of this suite written against
// /clients/new passed whether or not the bug was there.
const openScan = async () => {
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.evaluate((px) => sessionStorage.setItem("scan-handoff-capture", JSON.stringify({ dataUrl: px, mediaType: "image/png" })), PIXEL);
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle0" });
  await sleep(3500);
};

const typeSupplier = (name) =>
  page.evaluate((v) => {
    const el = [...document.querySelectorAll("input")].find((i) => /supplier/i.test(`${i.placeholder ?? ""} ${i.previousElementSibling?.textContent ?? ""} ${i.labels?.[0]?.textContent ?? ""}`));
    if (!el) return false;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, name);

try {
  await signIn(page, BASE);

  // The register answered, and there really is no such company: the
  // sentence is right, and must still be said.
  mode = "empty";
  await openScan();
  check("the supplier box on the scan review is there", await typeSupplier("Definitely Not A Real Company Ltd"));
  await sleep(3000);
  const empty = await bodyText(page);
  check("a real 'no such company' answer IS reported", empty.includes(FALSEHOOD), empty.replace(/\s+/g, " ").slice(0, 400));

  // Same box, same typing -- but the register is unreachable.
  mode = "down";
  await openScan();
  await typeSupplier("Acme Building Services Ltd");
  await sleep(3000);
  const down = await bodyText(page);
  check("an unreachable register does NOT say the company doesn't exist", !down.includes(FALSEHOOD), down.replace(/\s+/g, " ").slice(0, 400));
  check("...and nothing falls over", !/Application error/.test(down), down.slice(0, 200));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
