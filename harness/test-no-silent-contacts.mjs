// A contact list is only useful while it's clean. Typing a supplier's name
// onto a receipt, or scanning one, must not quietly add them to Clients &
// suppliers -- that is how a list ends up with "TRAVIS PERKINS", "Travis
// Perkins Ltd" and "travis perkins" in it, none of which match each other.
// Adding one has to be something he asked for.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const names = () => db.tables.clients.map((c) => c.name);

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const KNOWN = newId();
db.tables.clients.push({ id: KNOWN, user_id: "x", name: "Jewson", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  profile: "profile-silentcontacts",
  intercept: (req, u) => {
    if (u.pathname !== "/api/scan") return false;
    req.respond({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify((() => {
        // Shaped the way /api/scan really answers: every field present,
        // because the route conforms the model's output to the schema.
        const doc = {
          documentType: "receipt", vendor: "Screwfix Direct Ltd", vendorConfidence: "high",
          date: new Date().toISOString().slice(0, 10), dateAsPrinted: null, dateConfidence: "high", dateAmbiguous: false, dateAlternative: null,
          invoiceNumber: null, dueDate: null, dueDateAsPrinted: null, dueDateAmbiguous: false, dueDateAlternative: null,
          creditedInvoiceNumber: null, totalAmount: 48.6, totalAmountConfidence: "high", currency: "GBP",
          vatAmount: 8.1, vatAmountConfidence: "high", category: "Supplies",
          lineItems: [], details: { other: [] }, contactPerson: null, contactEmail: null,
          notes: null, pages: [], box: null, paidOnDocument: true,
        };
        return { result: doc, documents: [doc] };
      })()),
    });
    return true;
  },
});

const fill = (match, value) =>
  page.evaluate((m, v) => {
    const el = [...document.querySelectorAll("input, textarea")].find((i) => new RegExp(m, "i").test(`${i.placeholder ?? ""} ${i.labels?.[0]?.textContent ?? ""}`));
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, match, value);

try {
  await signIn(page, BASE);
  check("one supplier to begin with", db.tables.clients.length === 1, JSON.stringify(names()));

  // A receipt typed in by hand, with a supplier who isn't in the list.
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1200);
  // Two different boxes: the picker that links a saved supplier, and the
  // name written on the receipt itself. Typing a new name into the picker
  // and not tapping "Add as new supplier" must add nobody.
  check("the supplier picker is there", await fill("Supplier — type a name", "Toolstation Bristol"));
  check("the vendor box is there", await fill("Vendor / shop name", "Toolstation Bristol"));
  await fill("Total paid", "31.40");
  await sleep(300);
  await clickText(page, "Save receipt");
  await sleep(1800);
  check("the receipt saved", db.tables.receipts.length === 1, String(db.tables.receipts.length));
  check("typing a supplier's name didn't add them to the list", db.tables.clients.length === 1, JSON.stringify(names()));
  check("but the name is kept on the receipt itself", db.tables.receipts[0]?.vendor === "Toolstation Bristol", JSON.stringify({ saved: db.tables.receipts[0]?.vendor, row: db.tables.receipts[0] }).slice(0, 300));

  // A scanned receipt from a supplier who isn't in the list either.
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.evaluate((p) => sessionStorage.setItem("scan-handoff-capture", JSON.stringify({ dataUrl: p, mediaType: "image/png" })), PIXEL);
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle0" });
  await sleep(3200);
  // The supplier lands in an input, whose value isn't in the page text.
  const fields = await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value).filter(Boolean));
  check("the scan read the supplier's name", fields.some((v) => /Screwfix/.test(v)), JSON.stringify(fields).slice(0, 300));
  check("the scan offers to add the supplier, rather than doing it", (await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim()))).includes("Add as new supplier"));
  await clickText(page, "Save receipt");
  await sleep(2200);
  check("the scanned receipt saved", db.tables.receipts.length === 2, String(db.tables.receipts.length));
  check("scanning didn't add the supplier either", db.tables.clients.length === 1, JSON.stringify(names()));
  check("and that receipt isn't linked to the wrong supplier", db.tables.receipts[1]?.client_id === null || db.tables.receipts[1]?.client_id === undefined, String(db.tables.receipts[1]?.client_id));

  // Nothing was archived, renamed or removed along the way either.
  check("the supplier already in the list is untouched", db.tables.clients[0]?.name === "Jewson" && db.tables.clients[0]?.archived === false, JSON.stringify(db.tables.clients[0]));
  const writes = db.log.filter((l) => l.key === "POST clients" || l.key === "PATCH clients" || l.key === "DELETE clients");
  check("no write to the contacts table happened at all", writes.length === 0, JSON.stringify(writes.map((w) => w.key)));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
