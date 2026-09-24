import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const DIR = new URL("./uploads/", import.meta.url).pathname;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
const ARCO = newId();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: true, custom_categories: [] });
db.tables.clients.push({ id: ARCO, user_id: "x", name: "Arco", email: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true });
db.tables.receipts = []; db.tables.invoices = []; db.tables.recurring_expenses = []; db.tables.credit_notes = []; db.tables.invoice_payments = [];
const scan = (vendor, number, total) => ({ documentType: "receipt", vendor, vendorConfidence: "high", date: "2026-09-08", dateAsPrinted: "08/09/26", dateConfidence: "high", invoiceNumber: number, dueDate: null, dueDateAsPrinted: null, creditedInvoiceNumber: null, totalAmount: total, totalAmountConfidence: "high", currency: null, vatAmount: 0, vatAmountConfidence: "high", category: "Supplies", lineItems: [], details: {}, contactPerson: null, contactEmail: null, notes: null, dateAmbiguous: false, dateAlternative: null, dueDateAmbiguous: false, dueDateAlternative: null });
const RESULTS = { DOC1: scan("Marko Cafe", "R-1", 4.5), DOC2: scan("Arco", "R-2", 9.99), DOC3: scan("Arco", "R-3", 12.5) };
const NUL = String.fromCharCode(0);
let failClients = 0;
const calls = { scan: 0, template: 0 };
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-review-fixes", intercept: (req, u) => {
  if (u.pathname === "/rest/v1/clients" && req.method() === "GET" && failClients > 0) { failClients--; req.respond({ status: 500, headers: { "Access-Control-Allow-Origin": "*", "content-type": "application/json" }, body: JSON.stringify({ message: "Harness: lists down" }) }); return true; }
  if (u.pathname === "/api/scan") {
    calls.scan++;
    const img = JSON.parse(req.postData()).images[0];
    const pdf = Buffer.from(img.split(",")[1], "base64").toString("latin1");
    const key = ["DOC1", "DOC2", "DOC3"].find((k) => pdf.includes(k.split("").map((c) => NUL + c).join("")));
    setTimeout(() => req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ result: RESULTS[key] }) }), 300);
    return true;
  }
  if (u.pathname === "/api/invoice-template") { calls.template++; setTimeout(() => req.respond({ status: 502, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Harness: not reading" }) }), 1500); return true; }
  return false;
} });
const vendorInput = 'input[placeholder="Supplier name as printed"]';
const supplierValue = () => page.evaluate(() => [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => /Arco/.test(o.textContent)))?.value);
const saveNow = async () => { await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Save/.test(b.textContent.trim()) && !b.disabled)?.click()); await sleep(1500); };
try {
  await signIn(page, BASE);

  // Partial read failure is reported, and a failed list load keeps the files for Try again
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  failClients = 1;
  const input = await page.$('input[type="file"][multiple]');
  await input.uploadFile(DIR + "doc1.pdf", DIR + "bad.jpg", DIR + "doc2.pdf");
  await page.waitForFunction(() => location.pathname === "/scan", { timeout: 15000 });
  await sleep(2500);
  let text = await bodyText(page);
  check("no camera opened for picked files", !(await page.$("video")));
  check("marker dropped from the address", !(await page.evaluate(() => location.search.includes("upload"))));
  check("lists failed: error shown with Try again, not Retake", /lists down|Couldn't load/i.test(text) && text.includes("Try again") && !text.includes("Retake last page"), text.slice(0, 400));
  check("no 'Reading 0 pages'", !text.includes("Reading 0"));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Try again").click());
  await page.waitForFunction((sel) => document.querySelector(sel)?.value, { timeout: 20000 }, vendorInput);
  await sleep(500);
  text = await bodyText(page);
  check("Try again reads the kept files", calls.scan === 2 && text.includes("Document 1 of 2"), `${calls.scan} ${text.slice(0, 200)}`);
  check("left-out file reported", text.includes("1 of 3 files couldn't be read and was left out."), text.slice(0, 300));

  // Save-time match is exact only: typed "Marco's Café" isn't linked to Arco
  await page.click(vendorInput, { clickCount: 3 });
  await page.type(vendorInput, "Marco's Café");
  check("form shows no supplier", !(await supplierValue()));
  await saveNow();
  const r1 = db.tables.receipts[0];
  check("saved without a supplier the form never showed", r1 && !r1.client_id, JSON.stringify(r1?.client_id));
  // Doc 2: read-time match to Arco; picking No supplier sets the flag
  await page.waitForFunction(() => document.body.innerText.includes("Document 2 of 2"), { timeout: 15000 });
  await sleep(500);
  check("doc 2 matched to Arco on reading", (await supplierValue()) === ARCO);
  await page.evaluate(() => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => /Arco/.test(o.textContent))); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, ""); s.dispatchEvent(new Event("change", { bubbles: true })); });
  await sleep(300);
  await saveNow();
  const r2 = db.tables.receipts[1];
  check("No supplier on purpose: saved unlinked with details.noSupplier", r2 && !r2.client_id && r2.details?.noSupplier === true, JSON.stringify(r2?.details));
  check("unflagged receipt carries no noSupplier", !r1?.details?.noSupplier);

  // A lost handoff says so instead of opening the camera
  await page.goto(`${BASE}/scan?upload=1`, { waitUntil: "networkidle0" });
  await sleep(800);
  text = await bodyText(page);
  check("lost files: message, no camera", text.includes("Your files didn't come through") && !(await page.$("video")), text.slice(0, 300));
  check("lost files: pick again offered, no Try again/Retake", text.includes("Pick files again") && !text.includes("Try again") && !text.includes("Retake last page"));
  await shot(page, "review-lost");
  const again = await page.$('input[type="file"][multiple]');
  await again.uploadFile(DIR + "doc3.pdf");
  await page.waitForFunction(() => document.body.innerText.includes('Read as "Arco"'), { timeout: 20000 });
  check("picked again: read", calls.scan === 3);
  check("doc 3 exact name linked to Arco", (await supplierValue()) === ARCO);
  await saveNow();
  check("doc 3 saved linked", db.tables.receipts[2]?.client_id === ARCO);

  // Lost handoff on the new client and invoice pages
  await page.goto(`${BASE}/clients/new?kind=supplier&scan=1&upload=1`, { waitUntil: "networkidle0" });
  await sleep(600);
  check("client page: lost file message, no camera", (await bodyText(page)).includes("didn't come through") && !(await page.$("video")));
  await page.goto(`${BASE}/invoices/new?scan=1&upload=1`, { waitUntil: "networkidle0" });
  await sleep(600);
  check("invoice page: lost file message, no camera", (await bodyText(page)).includes("didn't come through") && !(await page.$("video")));

  // Upload is off while a read is running on the invoice page
  const one = await page.$('input[type="file"]:not([multiple])');
  await one.uploadFile(DIR + "card.png");
  await sleep(700);
  const disabled = await page.evaluate(() => document.querySelector('input[type="file"]:not([multiple])').disabled);
  check("invoice page: upload disabled while reading", disabled);
  await sleep(2000);
  check("invoice page: upload back on after the read", !(await page.evaluate(() => document.querySelector('input[type="file"]:not([multiple])').disabled)));

  // A stash meant for /scan doesn't turn a later new invoice into a copy
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  // The dashboard's upload tile builds its file input on the tap and takes it
  // out again, so there is no input sitting in the page to hand a file to.
  // Go in the way a person does: press the button and answer the chooser.
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 10000 }),
    page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Files")?.click()),
  ]);
  await chooser.accept([DIR + "doc1.pdf"]);
  await page.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/invoices/new"); a?.click(); });
  await sleep(2500);
  const where = await page.evaluate(() => location.pathname + location.search);
  console.log("landed on", where);
  if (where.startsWith("/invoices/new")) check("invoice page not a copy from a /scan stash", !(await bodyText(page)).includes("Scan an invoice you've sent before"));
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("fits 375px", fits);
} catch (e) { console.log("ERROR", e.message); await shot(page, "review-error"); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
