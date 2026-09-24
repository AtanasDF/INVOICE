// Taking a period of paperwork off the app and onto a device, in the four
// shapes Atanas asked for: a folder of files, pictures only, one PDF, and
// one PDF per supplier.
//
// This is the answer to the photo-ageing job -- nobody should be asked to
// let old pictures go without a way to keep their own copy first -- so a
// file that is produced but does not OPEN would be worse than no button at
// all. Every zip here is parsed back and every entry's CRC recomputed, and
// the PDFs are checked to be PDFs with the right number of pages.
import fs from "fs";
import zlib from "zlib";
import { makeDb, launchSignedIn, signIn, sleep, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const DL = new URL("./downloads/", import.meta.url).pathname;
fs.mkdirSync(DL, { recursive: true });
for (const f of fs.readdirSync(DL)) fs.unlinkSync(DL + f);
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// Read a zip the way anything else would: from the end-of-central-directory
// backwards. If our writer's offsets are wrong this finds nothing.
function readZip(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("no end-of-central-directory: not a zip");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`central directory entry ${i} is not where it says`);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    if (buf.readUInt32LE(offset) !== 0x04034b50) throw new Error(`${name}: local header is not at the offset the directory gives`);
    const lNameLen = buf.readUInt16LE(offset + 26);
    const lExtraLen = buf.readUInt16LE(offset + 28);
    const start = offset + 30 + lNameLen + lExtraLen;
    const bytes = buf.subarray(start, start + size);
    entries.push({ name, size, crc, bytes });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const waitForFile = async (match) => {
  for (let i = 0; i < 120; i++) {
    const f = fs.readdirSync(DL).find((x) => match.test(x) && !x.endsWith(".crdownload"));
    if (f) { await sleep(400); return f; }
    await sleep(250);
  }
  return null;
};

// A one-pixel PNG and a two-pixel JPEG, so the bytes are real image files
// rather than something that only looks like one.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const JEWSON = newId(), TRAVIS = newId();
db.tables.clients.push({ id: JEWSON, user_id: "x", name: "Jewson", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.clients.push({ id: TRAVIS, user_id: "x", name: "Travis Perkins", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });

const receipt = (o) => {
  const id = newId();
  db.tables.receipts.push({ id, user_id: "x", client_id: o.clientId ?? null, date: o.date, vendor: o.vendor, category: "Supplies", amount: 50, vat_amount: 10, image_data_url: o.image, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
  return id;
};
// Two from Jewson on the SAME DAY: two files would be called the same thing
// inside the zip, which is the ordinary case and not an edge.
receipt({ clientId: JEWSON, date: "2026-03-04", vendor: "Jewson", image: PNG });
receipt({ clientId: JEWSON, date: "2026-03-04", vendor: "Jewson", image: JPG });
receipt({ clientId: TRAVIS, date: "2026-03-11", vendor: "Travis Perkins", image: PNG });
// One with no supplier linked, so it has to fall back to the printed name.
receipt({ date: "2026-03-20", vendor: "Screwfix", image: JPG });
// And one outside the period, which must not come along.
receipt({ clientId: JEWSON, date: "2025-11-02", vendor: "Jewson", image: PNG });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-save-these" });
const pick = async (label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(l) && !x.disabled);
  if (!b) throw new Error("no button: " + l);
  b.click();
}, label);

try {
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
  await signIn(page, BASE);
  await page.goto(`${BASE}/files`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Save these to your device"), { timeout: 20000 });

  check("it says how many and promises nothing is uploaded", await page.evaluate(() =>
    /5 documents/.test(document.body.innerText) && /Nothing is uploaded/.test(document.body.innerText)), await page.evaluate(() => document.body.innerText.slice(0, 300)));

  // Narrow to March, which leaves four of the five.
  await page.evaluate(() => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    const dates = [...document.querySelectorAll('input[type="date"]')];
    set(dates[0], "2026-03-01");
    set(dates[1], "2026-03-31");
  });
  await sleep(900);
  check("the period is read back in plain words", await page.evaluate(() => /4 documents/.test(document.body.innerText)), await page.evaluate(() => document.body.innerText.slice(0, 300)));

  // ── A folder of files ──
  await pick("Save them");
  await sleep(300);
  await pick("A folder of files");
  const zipName = await waitForFile(/\.zip$/);
  check("a zip is saved, named for the period", zipName === "2026-03.zip", String(zipName));
  const zip = readZip(fs.readFileSync(DL + zipName));
  check("it holds the four documents in the period, and not the fifth", zip.length === 4, JSON.stringify(zip.map((e) => e.name)));
  check("every entry's checksum is right, so the zip really opens",
    zip.every((e) => zlib.crc32(e.bytes) === e.crc && e.bytes.length === e.size),
    JSON.stringify(zip.map((e) => [e.name, e.size, zlib.crc32(e.bytes) === e.crc])));
  check("the two from one supplier on one day are told apart",
    new Set(zip.map((e) => e.name)).size === 4 && zip.some((e) => /\(2\)/.test(e.name)),
    JSON.stringify(zip.map((e) => e.name)));
  check("each is named by date then supplier", zip.every((e) => /^2026-03-\d\d /.test(e.name)), JSON.stringify(zip.map((e) => e.name)));
  check("a receipt with no supplier linked uses the name printed on it", zip.some((e) => /Screwfix/.test(e.name)), JSON.stringify(zip.map((e) => e.name)));
  check("the real file types are kept", zip.filter((e) => e.name.endsWith(".png")).length === 2 && zip.filter((e) => e.name.endsWith(".jpg")).length === 2, JSON.stringify(zip.map((e) => e.name)));

  // ── One PDF ──
  for (const f of fs.readdirSync(DL)) fs.unlinkSync(DL + f);
  await pick("Save them");
  await sleep(300);
  await pick("One PDF");
  const pdfName = await waitForFile(/\.pdf$/);
  check("one PDF is saved for the period", pdfName === "2026-03.pdf", String(pdfName));
  const pdf = fs.readFileSync(DL + pdfName);
  check("and it is a PDF", pdf.subarray(0, 5).toString() === "%PDF-", pdf.subarray(0, 12).toString());
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check("with a page for each document", pages === 4, `${pages} pages`);

  // ── One PDF per supplier ──
  for (const f of fs.readdirSync(DL)) fs.unlinkSync(DL + f);
  await pick("Save them");
  await sleep(300);
  await pick("One PDF per supplier");
  const perName = await waitForFile(/by supplier\.zip$/);
  check("a folder of PDFs, one per supplier", perName === "2026-03 by supplier.zip", String(perName));
  const per = readZip(fs.readFileSync(DL + perName));
  check("three suppliers in March, so three documents", per.length === 3, JSON.stringify(per.map((e) => e.name)));
  check("each is named after the supplier", per.every((e) => /^(Jewson|Travis Perkins|Screwfix)\.pdf$/.test(e.name)), JSON.stringify(per.map((e) => e.name)));
  check("each really is a PDF", per.every((e) => e.bytes.subarray(0, 5).toString() === "%PDF-"), JSON.stringify(per.map((e) => e.bytes.subarray(0, 5).toString())));
  check("and the checksums hold up", per.every((e) => zlib.crc32(e.bytes) === e.crc), "a PDF inside the zip is corrupt");
  const jewsonPdf = per.find((e) => e.name === "Jewson.pdf");
  const jewsonPages = (jewsonPdf.bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check("the supplier with two receipts gets two pages", jewsonPages === 2, `${jewsonPages} pages`);

  check("nothing was deleted from the records", db.tables.receipts.length === 5, String(db.tables.receipts.length));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
