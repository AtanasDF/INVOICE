import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot, newId } from "./md-mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const DIR = new URL("./uploads/", import.meta.url).pathname;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
const RAW = newId();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: true, custom_categories: [] });
db.tables.clients.push({ id: RAW, user_id: "x", name: "Rawlings & Son (Bristol) Ltd", email: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true });
db.tables.receipts = []; db.tables.invoices = []; db.tables.recurring_expenses = []; db.tables.credit_notes = []; db.tables.invoice_payments = [];
const scan = (vendor, number, total) => ({ documentType: "invoice", vendor, vendorConfidence: "high", date: "2026-09-08", dateAsPrinted: "08/09/26", dateConfidence: "high", invoiceNumber: number, dueDate: "2026-09-08", dueDateAsPrinted: "08/09/26", creditedInvoiceNumber: null, totalAmount: total, totalAmountConfidence: "high", currency: null, vatAmount: Math.round(total / 6 * 100) / 100, vatAmountConfidence: "high", category: "Supplies", lineItems: [{ description: "Carriage", quantity: 1, unitPrice: 8.5, lineTotal: 8.5 }], details: {}, contactPerson: null, contactEmail: null, notes: null, dateAmbiguous: true, dateAlternative: "2026-08-09", dueDateAmbiguous: true, dueDateAlternative: "2026-08-09" });
const RESULTS = { DOC1: scan("Acme Tools Ltd", "A-1", 10.2), DOC2: scan("Acme Tools Limited", "A-2", 55.5), DOC3: scan("Rawlings & Son (Bristol) Limited", "IN178077", 88.8) };
const calls = { scan: 0, contact: 0, template: 0 };
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-md-uploads", intercept: (req, u) => {
  if (u.pathname === "/api/scan") {
    calls.scan++;
    const img = JSON.parse(req.postData()).images[0];
    const pdf = Buffer.from(img.split(",")[1], "base64").toString("latin1");
    const key = ["DOC1", "DOC2", "DOC3"].find((k) => pdf.includes(k.split("").map((c) => "\u0000" + c).join("")));
    setTimeout(() => req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ result: RESULTS[key] }) }), 300);
    return true;
  }
  if (u.pathname === "/api/contact-scan") { calls.contact++; req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ contacts: [{ name: "Big Co Ltd", isCompany: true, contactPerson: null, email: "hello@bigco.example", phone: null, address: "1 High St", vatNumber: null, companyNumber: null, website: null, role: "customer" }] }) }); return true; }
  if (u.pathname === "/api/invoice-template") { calls.template++; req.respond({ status: 502, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Harness: not reading" }) }); return true; }
  return false;
} });
const saveNow = async () => { await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Save/.test(b.textContent.trim()) && !b.disabled)?.click()); await sleep(1500); };
const form = () => page.evaluate(() => ({ supplier: [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => /Rawlings|existing supplier/.test(o.textContent)))?.value, vendor: document.querySelector('input[placeholder="Supplier name as printed"]')?.value ?? document.querySelector('input[placeholder="Supplier name"]')?.value, text: document.body.innerText, dates: [...document.querySelectorAll('input[type="date"]')].map((d) => ({ v: d.value, over: d.getBoundingClientRect().right - d.parentElement.getBoundingClientRect().right })) }));
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  check("dashboard: Upload photos or PDFs", (await bodyText(page)).includes("Upload photos or PDFs"));

  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  const input = await page.$('input[type="file"][multiple]');
  check("receipts: Upload from files takes several files", !!input && (await bodyText(page)).includes("Upload from files"));
  await input.uploadFile(DIR + "doc1.pdf", DIR + "doc2.pdf", DIR + "doc3.pdf");
  await page.waitForFunction(() => location.pathname === "/scan", { timeout: 15000 });
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value.includes("Acme Tools")), { timeout: 20000 });
  await sleep(500);
  let f = await form();
  check("batch started: 3 read, first open", calls.scan === 3 && f.vendor === "Acme Tools Ltd", `${calls.scan} ${f.vendor}`);
  check("UK date 08/09/26: no day/month question, 8 Sep", !f.text.includes("If it meant") && f.dates.every((d) => d.v === "2026-09-08"), JSON.stringify(f.dates));
  check("date fields stay inside their column", f.dates.every((d) => d.over <= 1), JSON.stringify(f.dates));
  check("no supplier made by itself", db.tables.clients.length === 1 && !f.supplier, JSON.stringify(db.tables.clients.map((c) => c.name)));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add as new supplier").click());
  await sleep(800);
  const acme = db.tables.clients.find((c) => c.name.startsWith("Acme"));
  check("Add as new supplier makes one, only on request", !!acme && db.tables.clients.length === 2);
  await saveNow();
  console.log("AFTER SAVE", await page.evaluate(() => location.pathname), (await bodyText(page)).slice(0, 600).replace(/\n/g, " | "));
  console.log("RECEIPTS", db.tables.receipts?.length);
  f = await form();
  check("doc 2 (Acme Tools Limited) matched to the supplier added on doc 1", f.supplier === acme?.id, `${f.supplier} vs ${acme?.id}`);
  await saveNow();
  await shot(page, "uploads-doc3");
  f = await form();
  check("doc 3 matched to the existing Rawlings supplier", f.supplier === RAW, f.supplier);
  await saveNow();
  const saved = db.tables.receipts.map((r) => r.client_id);
  check("all three saved, each linked", saved.length === 3 && saved[0] === acme?.id && saved[1] === acme?.id && saved[2] === RAW, JSON.stringify(saved));
  check("still only the one supplier added", db.tables.clients.length === 2);

  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle0" });
  const one = await page.$('input[type="file"]:not([multiple])');
  check("clients: single-file upload under the camera button", !!one);
  await one.uploadFile(DIR + "card.png");
  await page.waitForFunction(() => location.pathname === "/clients/new", { timeout: 15000 });
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value === "Big Co Ltd"), { timeout: 15000 });
  check("new client filled from the uploaded file, camera not opened", calls.contact === 1 && !(await page.$("video")));

  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  const inv = await page.$('input[type="file"]:not([multiple])');
  await inv.uploadFile(DIR + "card.png");
  await page.waitForFunction(() => location.pathname === "/invoices/new", { timeout: 15000 });
  await sleep(1500);
  await shot(page, "uploads-invoice");
  check("invoice copy reads the uploaded file, camera not opened", calls.template === 1 && !(await page.$("video")), `${calls.template}`);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("page fits 375px", fits);
} catch (e) { console.log("ERROR", e.message); await shot(page, "uploads-error"); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
