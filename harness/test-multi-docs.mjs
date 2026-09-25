// Several documents in one scan, and Save all ready. /api/scan is mocked; the
// files are synthetic (multi/gen-multi.py). BASE=http://localhost:3304 node test-multi-docs.mjs
import { createRequire } from "node:module";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot, newId, UID } from "./mockdb.mjs";
import { REPO } from "./repo.mjs";
const require = createRequire(import.meta.url);
const { PDFDocument } = require(`${REPO}/web/node_modules/pdf-lib/cjs/index.js`);
const BASE = process.env.BASE ?? "http://localhost:3304";
const DIR = new URL("./multi/", import.meta.url).pathname;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
const TOOL = newId(), SCREW = newId(), COSTA = newId();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: true, custom_categories: [] });
db.tables.clients.push(
  { id: TOOL, user_id: UID, name: "Toolstation Ltd", email: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true },
  { id: SCREW, user_id: UID, name: "Screwfix", email: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true },
  { id: COSTA, user_id: UID, name: "Costa Coffee", email: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true },
);
const row = { user_id: UID, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null, image_data_url: null, notes: null, starred: false, warranty_months: null, tags: [], line_items: [], needs_review: false, details: {}, credit_of_receipt_id: null, due_date: null, paid: true, category: "Materials" };
db.tables.receipts = [{ ...row, id: newId(), document_type: "receipt", client_id: SCREW, vendor: "Screwfix", date: "2026-09-01", invoice_number: "SF-1", amount: 20, vat_amount: 4 }];
db.tables.receipt_pages = []; db.tables.invoices = []; db.tables.recurring_expenses = []; db.tables.credit_notes = []; db.tables.invoice_payments = [];
const clientsBefore = db.tables.clients.length;

const doc = (o) => ({ documentType: "receipt", vendor: null, vendorConfidence: "high", date: "2026-09-08", dateAsPrinted: "08/09/26", dateConfidence: "high", invoiceNumber: null, dueDate: null, dueDateAsPrinted: null, creditedInvoiceNumber: null, totalAmount: null, totalAmountConfidence: "high", currency: null, vatAmount: null, vatAmountConfidence: "high", category: "Materials", lineItems: [], details: {}, contactPerson: null, contactEmail: null, notes: null, dateAmbiguous: true, dateAlternative: "2026-08-09", dueDateAmbiguous: false, dueDateAlternative: null, pages: [1], box: null, paidOnDocument: null, ...o });
const READS = {
  pdf: { delay: 300, docs: [
    doc({ documentType: "invoice", vendor: "Brakes Bros", invoiceNumber: "BB-1", dueDate: "2026-09-30", dueDateAsPrinted: "30/09/26", totalAmount: 120, vatAmount: 20, paidOnDocument: true, pages: [1] }),
    doc({ vendor: "Toolstation", invoiceNumber: "T-100", totalAmount: 30, vatAmount: 5, paidOnDocument: true, pages: [2] }),
    doc({ vendor: "Screwfix", invoiceNumber: "SF-1", totalAmount: 24, vatAmount: 4, paidOnDocument: true, pages: [3] }),
  ] },
  "1200x900": { delay: 600, docs: [
    doc({ vendor: "Costa", invoiceNumber: "C-9", totalAmount: 7.6, vatAmount: 1.27, box: [0, 0, 1000, 500], paidOnDocument: true }),
    doc({ vendor: "Tesco", invoiceNumber: null, totalAmount: null, vatAmount: null, box: [0, 500, 1000, 1000], paidOnDocument: true }),
  ] },
  "800x1000": { delay: 3000, docs: [doc({ documentType: "invoice", vendor: "GitHub Inc", invoiceNumber: "GH-7", currency: "USD", totalAmount: 21, vatAmount: 0, dateAsPrinted: "Sep 8, 2026", dateAmbiguous: false, dateAlternative: null, paidOnDocument: true })] },
  "1000x700": { delay: 300, docs: [
    doc({ vendor: "North Deli", invoiceNumber: "ND-1", totalAmount: 4.5, vatAmount: 0.75, box: [0, 0, 1000, 500], paidOnDocument: true }),
    doc({ vendor: "East Parking", invoiceNumber: "EP-2", totalAmount: 6, vatAmount: 1, box: [0, 500, 1000, 1000], paidOnDocument: true }),
  ] },
  "900x1100": { delay: 3500, docs: [doc({ vendor: "Toolstation", invoiceNumber: "T-100", totalAmount: 30, vatAmount: 5, paidOnDocument: true })] },
};
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
const bytesOf = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");
const keyOf = (dataUrl) => {
  if (dataUrl.startsWith("data:application/pdf")) return "pdf";
  const s = jpegSize(bytesOf(dataUrl));
  return `${s.w}x${s.h}`;
};
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
const calls = { scan: 0, answered: 0, keys: [], reread: null };
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-multi-docs", intercept: (req, u) => {
  if (u.pathname === "/api/scan") {
    calls.scan++;
    const images = JSON.parse(req.postData()).images;
    if (images.length === 3) {
      // Tesco's part with a page added: [crop, whole photo, back]. The reader
      // finds Costa again on the whole photo; it must not leak into Tesco.
      calls.reread = images.map(keyOf);
      const docs = [
        doc({ vendor: "Tesco", invoiceNumber: "TS-4", totalAmount: 5.5, vatAmount: 0.92, pages: [1, 3], paidOnDocument: true }),
        doc({ vendor: "Costa", invoiceNumber: "C-9", totalAmount: 7.6, vatAmount: 1.27, pages: [2], paidOnDocument: true }),
      ];
      setTimeout(() => req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ result: docs[0], documents: docs }) }), 300);
      return true;
    }
    const key = keyOf(images[0]);
    calls.keys.push(key);
    const read = READS[key];
    if (!read) { req.respond({ status: 502, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Harness: unknown file " + key }) }); return true; }
    setTimeout(() => { calls.answered++; req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ result: read.docs[0], documents: read.docs }) }); }, read.delay);
    return true;
  }
  if (u.pathname === "/rest/v1/rpc/create_receipt_with_pages" && req.method() === "POST") {
    const { p_receipt, p_pages } = JSON.parse(req.postData());
    const id = newId();
    db.tables.receipts.push({ id, user_id: UID, ...p_receipt });
    p_pages.forEach((p, i) => db.tables.receipt_pages.push({ id: newId(), user_id: UID, receipt_id: id, page_index: i + 1, image_data_url: p }));
    req.respond({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(id) });
    return true;
  }
  if (u.pathname.startsWith("/storage/v1/")) {
    if (req.method() === "OPTIONS") { req.respond({ status: 204, headers: cors, body: "" }); return true; } req.respond({ status: 400, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ message: "Harness: no storage" }) }); return true; }
  return false;
} });
page.on("dialog", (d) => d.accept());
const vendorInput = 'input[placeholder="Supplier name as printed"]';
const supplierSelect = () => page.evaluate(() => [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => /Toolstation/.test(o.textContent)))?.value);
const paidChoice = () => page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /bg-neutral-900/.test(b.className) && /Already paid|To be paid/.test(b.textContent))?.textContent.trim());
const waitText = (t, timeout = 20000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const clickButton = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(l) && !x.disabled); b?.click(); return !!b; }, label);
const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const pdfPages = async (dataUrl) => (await PDFDocument.load(dataUrl)).getPageCount();
const newRows = () => db.tables.receipts.slice(1);
const byVendor = (v) => newRows().find((r) => r.vendor === v);

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  const input = await page.$('input[type="file"][multiple]');
  await input.uploadFile(DIR + "multi3.pdf", DIR + "two-receipts.jpg", DIR + "usd.jpg", DIR + "copy.jpg");
  await page.waitForFunction(() => location.pathname === "/scan", { timeout: 15000 });
  await page.waitForFunction((sel) => document.querySelector(sel)?.value === "Brakes Bros", { timeout: 20000 }, vendorInput);
  let text = await bodyText(page);
  check("one PDF read as 3 documents, listed separately", text.includes("This file had 3 documents — they're listed separately."), text.slice(0, 300));
  check("walk counts the split: Document 1 of 7 once the photo splits too", await waitText("Document 1 of 7", 8000).then(() => true, () => false), (await bodyText(page)).slice(0, 200));
  check("Save all ready offered", (await bodyText(page)).includes("Save all ready"));
  check("first part is one PDF page", await page.evaluate(() => [...document.querySelectorAll("img, div")].filter((e) => e.textContent.trim() === "PDF").length === 1));
  check("paidOnDocument presets Already paid (despite a due date)", (await paidChoice()) === "Already paid", await paidChoice());
  check("due date still from the reading", await page.evaluate(() => [...document.querySelectorAll('input[type="date"]')].some((d) => d.value === "2026-09-30")));
  check("fits 375px (split walk)", await fits());
  await shot(page, "multi-split-walk");

  // Save all while two reads are still out: it waits for them.
  const early = calls.answered;
  await clickButton("Save all ready");
  await waitText("Saved 3.", 30000);
  await sleep(500);
  text = await bodyText(page);
  check("each file read once, parts reused; Save all waited for reads still out", calls.keys.length === 4 && early < 4 && calls.answered === 4, `${calls.scan} early ${early} ${calls.keys}`);
  check("saved exactly the three clean ones", newRows().length === 3 && ["Brakes Bros", "Toolstation", "Costa"].every((v) => byVendor(v)), JSON.stringify(newRows().map((r) => r.vendor)));
  check("summary names the four left", ["4 need a look", "Screwfix (possible duplicate)", "Tesco (no total read)", "GitHub Inc (in USD, no exchange rate)", "Toolstation (possible duplicate)"].every((t) => text.includes(t)), text.slice(0, 500));
  check("no supplier created", db.tables.clients.length === clientsBefore);
  const brakes = byVendor("Brakes Bros");
  check("invoice saved Already paid, with its due date", brakes?.document_type === "invoice" && brakes.paid === true && brakes.due_date === "2026-09-30", JSON.stringify({ t: brakes?.document_type, p: brakes?.paid, d: brakes?.due_date }));
  check("PDF split: invoice saved with its one page", brakes && (await pdfPages(brakes.image_data_url)) === 1);
  const tool = byVendor("Toolstation");
  check("PDF split: receipt saved with its one page", tool && (await pdfPages(tool.image_data_url)) === 1);
  check("unseen doc linked only by exact name (Toolstation = Toolstation Ltd)", tool?.client_id === TOOL, tool?.client_id);
  const costa = byVendor("Costa");
  check("unseen doc not linked by a loose match (Costa ≠ Costa Coffee)", costa && !costa.client_id && !costa.details?.noSupplier, JSON.stringify({ c: costa?.client_id, d: costa?.details }));
  const crop = costa && jpegSize(bytesOf(costa.image_data_url));
  const full = db.tables.receipt_pages.find((p) => p.receipt_id === costa?.id);
  const fullSize = full && jpegSize(bytesOf(full.image_data_url));
  check("photo cropped to its box with padding (left half)", crop && crop.w >= 600 && crop.w <= 660 && crop.h === 900, JSON.stringify(crop));
  check("whole photo kept as page 2", db.tables.receipt_pages.filter((p) => p.receipt_id === costa?.id).length === 1 && fullSize?.w === 1200 && fullSize?.h === 900, JSON.stringify(fullSize));
  check("walk moved on to the first that needs a look", text.includes("Document 3 of 7") && text.includes("Needs a look: possible duplicate."), text.slice(0, 400));
  check("Save all still offered for the rest", text.includes("Save all ready"));
  check("fits 375px (summary)", await fits());
  await shot(page, "multi-save-all-summary");

  // Nothing ready: a second Save all saves nothing and keeps all four.
  await clickButton("Save all ready");
  await waitText("Saved 0.", 15000);
  check("second Save all saves none of the four", newRows().length === 3);

  // The duplicate: Skip.
  await clickButton("Skip");
  await waitText("Document 5 of 7");
  await sleep(300);
  text = await bodyText(page);
  check("Tesco opened with its reason", text.includes("Needs a look: no total read."), text.slice(0, 300));
  await clickButton("Add another page");
  const addInput = await page.waitForSelector('input[type="file"][accept="image/*,application/pdf"]', { timeout: 15000 });
  await addInput.uploadFile(DIR + "back.jpg");
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value === "TS-4"), { timeout: 20000 });
  await sleep(300);
  const tesco = await page.evaluate(() => ({ total: [...document.querySelectorAll("label")].find((l) => l.textContent.startsWith("Total ("))?.parentElement.querySelector("input")?.value, text: document.body.innerText }));
  check("page added to a split part: re-read keeps this receipt, not the one on the whole photo", tesco.total === "5.5" && !tesco.text.includes("Needs a look"), JSON.stringify({ total: tesco.total, reread: calls.reread }));
  await clickButton("Save receipt");
  await waitText("Document 6 of 7");
  await sleep(500);
  const ts = byVendor("Tesco");
  check("Tesco saved by hand with its crop, the whole photo and the added page", ts && Math.abs(ts.amount + ts.vat_amount - 5.5) < 0.001 && db.tables.receipt_pages.filter((p) => p.receipt_id === ts.id).length === 2, JSON.stringify(ts && { a: ts.amount, v: ts.vat_amount, pages: db.tables.receipt_pages.filter((p) => p.receipt_id === ts.id).length }));
  text = await bodyText(page);
  check("USD invoice open, needs a rate", text.includes("GitHub Inc") || (await page.$eval(vendorInput, (e) => e.value).catch(() => "")) === "GitHub Inc");
  const rate = await page.$('input[placeholder="rate"], input[placeholder="Loading…"]');
  await rate.click({ clickCount: 3 });
  await rate.type("0.75");
  await clickButton("Save invoice");
  await waitText("Document 7 of 7");
  await sleep(500);
  const gh = byVendor("GitHub Inc");
  check("USD invoice saved in GBP at the typed rate", gh && gh.original_currency === "USD" && Math.abs(gh.amount - 15.75) < 0.001 && gh.paid === true, JSON.stringify(gh && { a: gh.amount, c: gh.original_currency, p: gh.paid }));
  check("last one: the in-batch duplicate, linked to Toolstation on the form", (await supplierSelect()) === TOOL);
  await clickButton("Save receipt");
  await sleep(800);
  text = await bodyText(page);
  check("Save on the in-batch duplicate warns", text.includes("Looks like a duplicate of"), text.slice(0, 400));
  check("still no supplier created", db.tables.clients.length === clientsBefore);
  check("fits 375px (end)", await fits());

  // Everything ready: Save all files both and says so.
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  const again = await page.$('input[type="file"][multiple]');
  await again.uploadFile(DIR + "clean2.jpg");
  await page.waitForFunction(() => location.pathname === "/scan", { timeout: 15000 });
  await waitText("This photo had 2 documents — they're listed separately.");
  const before = newRows().length;
  await clickButton("Save all ready");
  await waitText("All saved");
  text = await bodyText(page);
  check("all ready: both saved, All saved view", newRows().length === before + 2 && text.includes("Saved 2 documents.") && text.includes("See them in Receipts") && text.includes("Scan more"), text.slice(0, 300));
  check("fits 375px (all saved)", await fits());
  await shot(page, "multi-all-saved");
} catch (e) { console.log("ERROR", e.message); await shot(page, "multi-error"); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
