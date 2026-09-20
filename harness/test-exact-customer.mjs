// Scanning an invoice you sent before, to make the next one.
//
// The customer on the scan used to be matched with matchSupplier, which
// falls through to deliberately loose tiers -- containment with a
// four-character floor, then any two shared words. That is right for
// linking a receipt to a supplier he can see and pick from; it is wrong
// here, because the matched customer REPLACES the name on the document
// and nothing says it did. "Riverside Building Services" matched
// "Hillside Building Services" -- two shared words -- and the invoice went
// out to the wrong company, with their address and their email on it.
//
// Only the same name matches now. Anything less is left as typed, so he
// chooses.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], quotes: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 9, custom_categories: null });
const HILLSIDE = newId();
db.tables.clients.push({ id: HILLSIDE, user_id: UID, name: "Hillside Building Services", email: "accounts@hillside.example", address: "7 Hill Road\nBristol\nBS6 5AA", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });

// What the reader says the scanned invoice holds. Only the customer name
// changes between the two runs.
let customerName = "Riverside Building Services";
// Shaped the way /api/invoice-template really answers (InvoiceTemplate in
// src/lib/invoiceTemplate.ts), not the way the Free page's own draft is
// shaped -- they are different, and the page reads `lineItems`.
const template = () => ({
  issuer: { name: "Harness Ltd", address: null, email: null, phone: null, website: null, vatNumber: null, companyNumber: null, utr: null },
  bank: { accountName: null, sortCode: null, accountNumber: null, iban: null, reference: null },
  customer: { name: customerName, address: "12 River Lane\nBristol\nBS1 9ZZ", email: "pay@riverside.example" },
  invoiceNumber: "INV-8", numberingPrefix: "INV-", date: "2026-09-01", dueDate: "2026-09-15",
  paymentTerms: "14 days", currency: "GBP", showsVat: false, cis: false,
  lineItems: [{ description: "Scaffolding hire", quantity: 1, unitPrice: 900, kind: "labour" }],
  notes: "", footer: "",
  layout: { headerAlignment: "left", metaPosition: "right", hasLogo: false, style: "modern" },
});

const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  width: 390,
  profile: "profile-exact-customer",
  intercept: (req, u) => {
    if (u.pathname !== "/api/invoice-template") return false;
    req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ template: template() }) });
    return true;
  },
});

// A 1x1 PNG is enough: the page hands the file straight to the reader,
// which is intercepted above.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const uploadScan = () =>
  page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const input = [...document.querySelectorAll('input[type="file"]')].pop();
    if (!input) return false;
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "old-invoice.png", { type: "image/png" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, PNG);

const everything = async () =>
  (await bodyText(page)) + " " + (await page.evaluate(() => [...document.querySelectorAll("input, textarea, select")].map((i) => i.value).join(" ")));
const pickedClient = () =>
  page.evaluate(() => [...document.querySelectorAll("select")].map((s) => s.value).filter(Boolean));

try {
  await signIn(page, BASE);
  // ?scan=1 is "copy an invoice you've sent before". It opens the camera
  // straight away; closing that leaves the Upload button, which is the
  // same path with a file instead of a photo.
  await page.goto(`${BASE}/invoices/new?scan=1`, { waitUntil: "networkidle0" });
  await sleep(2000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^(Back|Cancel|Close)$/i.test(x.textContent.trim()));
    b?.click();
  });
  await sleep(1200);

  check("there is a way to upload the old invoice", await uploadScan());
  await sleep(3000);

  const near = await everything();
  check("the scan was read", /Scaffolding hire/.test(near), near.replace(/\s+/g, " ").slice(0, 300));
  check("a name that merely shares two words does NOT pick the existing client", !(await pickedClient()).includes(HILLSIDE), JSON.stringify(await pickedClient()));
  check("...the name on the document is kept as it was read", /Riverside Building Services/.test(near), near.replace(/\s+/g, " ").slice(0, 400));
  // Hillside's NAME is in the client dropdown either way -- it is one of
  // his clients. What must not happen is its details landing on the
  // invoice, which is what the loose match used to do.
  const filled = await page.evaluate(() => [...document.querySelectorAll("input, textarea")].map((i) => i.value).join(" "));
  check("...and the wrong customer's details are nowhere on it", !/accounts@hillside|Hill Road|BS6 5AA/.test(filled), filled.slice(0, 300));

  // The same name does match, or the rule would be useless.
  customerName = "Hillside Building Services";
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/invoices/new?scan=1`, { waitUntil: "networkidle0" });
  await sleep(2000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^(Back|Cancel|Close)$/i.test(x.textContent.trim()));
    b?.click();
  });
  await sleep(1200);
  await uploadScan();
  await sleep(3000);
  check("the same name DOES pick the existing client", (await pickedClient()).includes(HILLSIDE), JSON.stringify(await pickedClient()));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
