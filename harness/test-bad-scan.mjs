// A photo of nothing useful: a blank page, a screen, the inside of a van
// pocket. The reader will sometimes come back with nothing, or with
// nonsense, and the one thing the app must never do is quietly save a
// £0.00 receipt into his books. The reader itself is mocked here, so this
// tests what the app does with the answer, not the AI.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const flat = (t) => t.replace(/\s+/g, " ");

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });

// A 1x1 png, standing in for whatever was photographed.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let mode = "empty"; // empty | error | nonsense
// The answer is shaped the way /api/scan really shapes it: `result` (plus
// `documents` when one photo held several), every field present because
// the route conforms the model's output to the schema, and every value
// empty because there was nothing on the page. Sending only `documents`,
// or leaving fields out, doesn't test an empty read -- it tests a broken
// response, which is a different thing and hid this case for a while.
const answer = () => {
  const doc = {
    documentType: mode === "nonsense" ? "other" : "receipt",
    vendor: null, vendorConfidence: "low",
    date: null, dateAsPrinted: null, dateConfidence: "low", dateAmbiguous: false, dateAlternative: null,
    invoiceNumber: null, dueDate: null, dueDateAsPrinted: null, dueDateAmbiguous: false, dueDateAlternative: null,
    creditedInvoiceNumber: null,
    totalAmount: null, totalAmountConfidence: "low", currency: null,
    vatAmount: null, vatAmountConfidence: "low", category: null,
    lineItems: [], details: { other: [] },
    contactPerson: null, contactEmail: null, notes: null, pages: [], box: null, paidOnDocument: null,
  };
  return { result: doc, documents: [doc] };
};

const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  profile: "profile-badscan",
  intercept: (req, u) => {
    if (u.pathname !== "/api/scan") return false;
    if (mode === "error") {
      req.respond({ status: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "The reader is busy. Try again." }) });
      return true;
    }
    req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(answer()) });
    return true;
  },
});

async function scanWith(kind) {
  mode = kind;
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.evaluate((p) => sessionStorage.setItem("scan-handoff-capture", JSON.stringify({ dataUrl: p, mediaType: "image/png" })), PIXEL);
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle0" });
  await sleep(3000);
  return bodyText(page);
}

try {
  await signIn(page, BASE);

  // 1. Read, but nothing on it: no total, no supplier, no date.
  let t = await scanWith("empty");
  check("a photo with nothing on it doesn't crash the page", !t.includes("Application error") && t.length > 80, flat(t).slice(0, 200));
  const before = db.tables.receipts.length;
  await clickText(page, "Save").catch(async () => { await clickText(page, "Save and next").catch(() => {}); });
  await sleep(1500);
  t = await bodyText(page);
  check("it refuses to save without a total", db.tables.receipts.length === before, `${before} -> ${db.tables.receipts.length}`);
  check("and says what's missing", /total/i.test(t), flat(t).slice(0, 300));
  check("no £0.00 receipt is ever written", !db.tables.receipts.some((r) => r.amount + r.vat_amount === 0), JSON.stringify(db.tables.receipts.map((r) => r.amount)));

  // 2. Something that isn't a receipt at all.
  t = await scanWith("nonsense");
  check("something that isn't a receipt is handled, not forced into one", !t.includes("Application error"), flat(t).slice(0, 200));
  const before2 = db.tables.receipts.length;
  await clickText(page, "Save").catch(() => {});
  await sleep(1200);
  check("it still isn't saved as a £0 expense", db.tables.receipts.length === before2 || !db.tables.receipts.some((r) => r.amount + r.vat_amount === 0), JSON.stringify(db.tables.receipts.map((r) => r.amount + r.vat_amount)));

  // 3. The reader itself fails.
  t = await scanWith("error");
  check("a reader that fails says so", /couldn't|could not|try again|busy|failed|problem/i.test(t), flat(t).slice(0, 300));
  check("a failed read doesn't leave a half-made receipt", db.tables.receipts.every((r) => r.amount + r.vat_amount !== 0), JSON.stringify(db.tables.receipts.map((r) => r.amount + r.vat_amount)));
  check("the page still offers a way on", /upload|take a photo|try again|back/i.test(t), flat(t).slice(0, 300));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
