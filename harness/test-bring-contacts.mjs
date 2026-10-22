// "Bring your customers and suppliers in", on a brand new account's Home
// (Atanas, 2026-10-22: "when they register... load files so the clients are
// ready"). A spreadsheet, a phone contact and a photo of an old invoice go in
// together; the list is shown; nothing is saved until Add; the account's own
// name is never offered; an Excel file is answered with what to do, not a
// failure. The photo reader is stood in for: what it returns is the reader's
// business, what the page does with it is ours.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId } from "./mockdb.mjs";
import { makeXlsx } from "./xlsx-fixture.mjs";
const BASE = process.env.BASE ?? "http://localhost:3100";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bring-contacts-"));
const file = (name, body) => { const p = path.join(dir, name); fs.writeFileSync(p, body); return p; };
const csv = file("customers.csv", "Name,Email,Postcode,Type\nSkido Logistics Ltd,accounts@skido.example,CA6 4SJ,Customer\nAlready Here Ltd,a@b.example,,Customer\nDrop Me Ltd,,,Customer\n");
const vcf = file("Bob.vcf", "BEGIN:VCARD\nVERSION:3.0\nFN:Bob Smith\nORG:Bob's Vans\nTEL:07700 900111\nEND:VCARD\n");
// The smallest real PNG, so the page's own downscaling has something to draw.
const png = file("old-invoice.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const xlsx = file("Customers.xlsx", makeXlsx([["Company", "Email"], ["Excel Customer Ltd", "excel@cust.example"]]));
const numbers = file("List.numbers", "not a csv");

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Kovac Couriers", vat_registered: null, invoice_prefix: "INV-", invoice_next_number: 0, address: "", bank_details: "", custom_categories: null });
db.tables.clients.push({ id: newId(), user_id: "x", name: "Already Here Ltd", email: "", kind: "client", archived: false, is_company: true, reminders_enabled: true });
const before = db.tables.clients.length;

let scans = 0;
const intercept = (req, u) => {
  if (u.pathname !== "/api/contact-scan") return false;
  scans++;
  const contact = (name, role) => ({ name, role, isCompany: true, contactPerson: null, email: null, phone: null, address: null, vatNumber: null, companyNumber: null, website: null });
  req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ contacts: [contact("Kovac Couriers", "issuer"), contact("Penrith Garage", "recipient")] }) });
  return true;
};

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-bring-contacts", intercept });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Bring your customers and suppliers in"), { timeout: 20000 });
  check("a new account is offered it on Home", true);

  const input = await page.$('input[type="file"][multiple]');
  await input.uploadFile(csv, vcf, png, xlsx, numbers);
  await page.waitForFunction(() => /Found \d+/.test(document.body.innerText), { timeout: 20000 });
  const t = await bodyText(page);
  check("the photo went to the reader once", scans === 1, scans);
  const names = await page.$$eval("li input[type=checkbox]", (els) => els.map((e) => e.getAttribute("aria-label")));
  check("everyone from the three files is listed", ["Skido Logistics Ltd", "Drop Me Ltd", "Bob's Vans", "Penrith Garage", "Excel Customer Ltd"].every((n) => names.includes(`Add ${n}`)), JSON.stringify(names));
  check("the account's own name is not offered back to it", !names.includes("Add Kovac Couriers"), JSON.stringify(names));
  check("someone already there is left out and said so", !names.includes("Add Already Here Ltd") && /1 is already in your list/.test(t), t.replace(/\s+/g, " ").slice(0, 400));
  check("an Excel file is read as it is, with no 'save as CSV'", !/Customers\.xlsx:/.test(t));
  check("a Numbers file is answered with what to do", /List\.numbers: save it as CSV first/.test(t), t.replace(/\s+/g, " ").slice(0, 600));
  check("nothing is saved before Add", db.tables.clients.length === before, db.tables.clients.length);

  await page.click('input[aria-label="Add Drop Me Ltd"]');
  await page.select('select[aria-label="Bob\'s Vans is a"]', "supplier");
  const addLabel = await page.$$eval("button", (bs) => bs.map((b) => b.textContent.trim()).find((x) => /^Add \d+$/.test(x)));
  check("the button counts who is ticked", addLabel === "Add 4", addLabel);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Add \d+$/.test(b.textContent.trim())).click());
  await page.waitForFunction(() => /Added /.test(document.body.innerText), { timeout: 20000 });
  const saved = db.tables.clients.slice(before);
  check("four saved", saved.length === 4, JSON.stringify(saved.map((c) => c.name)));
  check("the unticked one is not", !saved.some((c) => c.name === "Drop Me Ltd"));
  check("Bob's Vans saved as a supplier, with the person and phone", saved.some((c) => c.name === "Bob's Vans" && c.kind === "supplier" && c.contact_person === "Bob Smith" && c.phone === "07700 900111"), JSON.stringify(saved.find((c) => c.name === "Bob's Vans")));
  check("the customer from the photo is a customer", saved.some((c) => c.name === "Penrith Garage" && c.kind === "client"));
  const t2 = await bodyText(page);
  check("it says what was added and where", /Added 3 customers and 1 supplier\. They're in Customers/.test(t2), t2.replace(/\s+/g, " ").slice(0, 400));
  check("nothing runs off the side of a phone", await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  check("the Excel row saved with its email", saved.some((c) => c.name === "Excel Customer Ltd" && c.email === "excel@cust.example" && c.is_company));

  // ── On the Customers page, for anybody who joins later or put the card away ──
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Bring in a list"), { timeout: 20000 });
  const shut = await bodyText(page);
  check("with people already there, it waits to be asked", !/Bring your customers and suppliers in/.test(shut));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Bring in a list").click());
  await page.waitForFunction(() => document.body.innerText.includes("Bring your customers and suppliers in"), { timeout: 5000 }).then(() => check("Bring in a list opens it", true), () => check("Bring in a list opens it", false));
  const again = await page.$('input[type="file"][multiple]');
  await again.uploadFile(csv);
  await page.waitForFunction(() => /Found \d+|already in your list/.test(document.body.innerText), { timeout: 20000 });
  const t3 = await bodyText(page);
  check("what was added a minute ago is now left out", /Found 1\b/.test(t3) && /Drop Me Ltd/.test(t3) && /2 are already in your list/.test(t3), t3.replace(/\s+/g, " ").slice(0, 500));
} finally {
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const empty = makeDb();
  Object.assign(empty.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
  empty.tables.clients = [];
  const { browser, page } = await launchSignedIn(empty, { base: BASE, width: 390, profile: "profile-bring-contacts-empty" });
  try {
    await signIn(page, BASE);
    await page.goto(`${BASE}/clients`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("Bring your customers and suppliers in"), { timeout: 20000 })
      .then(() => check("an empty Customers page offers it without being asked", true), () => check("an empty Customers page offers it without being asked", false));
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
if (results.some((r) => !r)) process.exitCode = 1;
