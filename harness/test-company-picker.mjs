// One customer/supplier field everywhere, tied to the Companies House
// register. Run against a dev server on BASE (default 3306).
import { makeDb, launchSignedIn, signIn, sleep, shot, newId } from "./mockdb.mjs";

const BASE = process.env.BASE ?? "http://localhost:3306";
const DIR = new URL("./multi/", import.meta.url).pathname;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const ZEBRA = newId();
const ACME = newId();
const BROWN = newId();
const TOOL = newId();
const SCREW = newId();

const db = makeDb();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: false, custom_categories: [] });
db.tables.clients = [
  { id: ZEBRA, user_id: "x", name: "Zebra Interiors Ltd", email: "", kind: "client", archived: false, is_company: true, reminders_enabled: true },
  { id: ACME, user_id: "x", name: "Acme Kitchens Ltd", email: "", kind: "client", archived: false, is_company: true, reminders_enabled: true },
  { id: BROWN, user_id: "x", name: "Brown Builders", email: "", kind: "client", archived: false, is_company: false, reminders_enabled: true },
  { id: TOOL, user_id: "x", name: "Toolstation Ltd", email: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true },
  { id: SCREW, user_id: "x", name: "Screwfix", email: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true },
];
// Brown Builders is the one he invoices most; Zebra second, on an older date.
db.tables.invoices = [
  { id: newId(), user_id: "x", client_id: BROWN, date: "2026-09-01", number: "1", items: [], status: "sent" },
  { id: newId(), user_id: "x", client_id: BROWN, date: "2026-09-05", number: "2", items: [], status: "sent" },
  { id: newId(), user_id: "x", client_id: ZEBRA, date: "2026-08-01", number: "3", items: [], status: "sent" },
  { id: newId(), user_id: "x", client_id: ZEBRA, date: "2026-08-02", number: "4", items: [], status: "sent" },
];
db.tables.receipts = [];
db.tables.receipt_pages = [];
db.tables.recurring_expenses = [];
db.tables.credit_notes = [];
db.tables.invoice_payments = [];

const REGISTER = {
  "patel plumbing": [{ name: "Patel Plumbing Ltd", number: "01234567", address: "1 Pipe Street\nLondon\nE1 1AA", status: "active", incorporated: "2015-03-01" }],
  "dead co": [{ name: "Dead Co Ltd", number: "09999999", address: "9 Gone Lane\nHull\nHU1 1AA", status: "dissolved", incorporated: "2001-01-01" }],
  "northside joinery": [{ name: "Northside Joinery Ltd", number: "07777777", address: "5 Mill Road\nLeeds\nLS2 7AB", status: "active", incorporated: "2010-06-01" }],
};

let configured = true;
const asked = [];
const lookup = (q) => REGISTER[Object.keys(REGISTER).find((k) => q.toLowerCase().startsWith(k.slice(0, 5))) ?? ""] ?? [];

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
const SCANNED = {
  documentType: "invoice", vendor: "Northside Joinery", vendorConfidence: "high", date: "2026-09-08", dateAsPrinted: "08/09/26", dateConfidence: "high",
  invoiceNumber: "NJ-12", dueDate: "2026-09-30", dueDateAsPrinted: "30/09/26", creditedInvoiceNumber: null, totalAmount: 240, totalAmountConfidence: "high",
  currency: null, vatAmount: 40, vatAmountConfidence: "high", category: "Materials", lineItems: [], details: { supplierVatNumber: "GB999" },
  contactPerson: null, contactEmail: null, notes: null, dateAmbiguous: false, dateAlternative: null, dueDateAmbiguous: false, dueDateAlternative: null,
  pages: [1], box: null, paidOnDocument: false,
};

const intercept = (req, u) => {
  if (u.pathname === "/api/scan") {
    req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ result: SCANNED, documents: [SCANNED] }) });
    return true;
  }
  if (u.pathname.startsWith("/storage/v1/")) {
    if (req.method() === "OPTIONS") req.respond({ status: 204, headers: cors, body: "" });
    else req.respond({ status: 400, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ message: "Harness: no storage" }) });
    return true;
  }
  if (u.pathname !== "/api/company-search") return false;
  const q = u.searchParams.get("q");
  const number = u.searchParams.get("number");
  asked.push(u.search);
  if (!configured) {
    req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ configured: false, items: [] }) });
    return true;
  }
  if (number) {
    const all = Object.values(REGISTER).flat();
    req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ configured: true, company: all.find((c) => c.number === number) ?? null }) });
    return true;
  }
  req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ configured: true, items: q && q.length >= 3 ? lookup(q) : [] }) });
  return true;
};

const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
// Cleared first: React ignores an input event that doesn't change the value.
const setField = (page, selector, value) =>
  page.evaluate((sel, v) => {
    const el = document.querySelector(sel);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, selector, value);

// The ▾ is a real <select>: read it as options grouped by their optgroup.
const arrowOrder = (page, marker) =>
  page.evaluate((m) => {
    const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.textContent.includes(m)));
    if (!s) return null;
    return [...s.options].slice(1).map((o) => [o.parentElement.tagName === "OPTGROUP" ? o.parentElement.label : "", o.textContent]);
  }, marker);

const listed = (page) =>
  page.evaluate(() => {
    const list = document.querySelector('[role="listbox"]');
    if (!list) return null;
    return [...list.children].map((li) => [li.getAttribute("role") === "option" ? "option" : "head", li.innerText.replace(/\n/g, " | ")]);
  });

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-company-picker", intercept });
page.setDefaultNavigationTimeout(120000);
const settled = () => page.waitForFunction(() => !document.body.innerText.includes("Searching Companies House"), { timeout: 10000 });
try {
  await signIn(page, BASE);

  // ---- New invoice: the arrow's order -------------------------------------
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await page.waitForSelector('input[role="combobox"]');
  await sleep(600);
  const order = await arrowOrder(page, "Zebra");
  check(
    "arrow: most used first (Brown, Zebra), then the rest A–Z",
    JSON.stringify(order) === JSON.stringify([["Most used", "Brown Builders"], ["Most used", "Zebra Interiors Ltd"], ["A–Z", "Acme Kitchens Ltd"]]),
    JSON.stringify(order)
  );
  const blank = await page.evaluate(() => document.querySelector("select").options[0].textContent);
  check("arrow: blank option keeps the old wording", blank === "Select a client or company", blank);

  // Picking from the arrow selects, as the old dropdown did.
  await page.select("select", ACME);
  await sleep(300);
  const picked = await page.$eval('input[role="combobox"]', (e) => e.value);
  check("arrow: picking a saved contact selects it", picked === "Acme Kitchens Ltd", picked);

  // ---- Typing: saved contacts, then the register --------------------------
  await setField(page, 'input[role="combobox"]', "Acme");
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 0, { timeout: 10000 });
  await settled();
  const filtered = await listed(page);
  check(
    "typing filters the saved contacts",
    JSON.stringify(filtered?.slice(0, 2)) === JSON.stringify([["head", "YOUR CLIENTS"], ["option", "Acme Kitchens Ltd"]]) && filtered.length === 3 && /Nothing more/.test(filtered[2][1]),
    JSON.stringify(filtered)
  );

  await setField(page, 'input[role="combobox"]', "Patel Plumbing");
  await page.waitForFunction(() => document.body.innerText.includes("Patel Plumbing Ltd"), { timeout: 8000 });
  const both = await listed(page);
  check("register results sit under their own heading", JSON.stringify(both?.[0]) === JSON.stringify(["head", "ON THE REGISTER"]), JSON.stringify(both));
  check("register row shows number and town", /Company 01234567/.test(both?.[1]?.[1] ?? "") && /Pipe Street/.test(both?.[1]?.[1] ?? ""), JSON.stringify(both?.[1]));
  await shot(page, "picker-register-list");

  // ---- Nothing is created without a tap -----------------------------------
  const clientsBefore = db.tables.clients.length;
  await page.evaluate(() => document.querySelector('[role="option"]').click());
  await waitText(page, "Add as client");
  check("picking a register company creates nothing yet", db.tables.clients.length === clientsBefore, String(db.tables.clients.length));
  const card = await page.evaluate(() => document.body.innerText);
  check("the card shows the registered name, number and office", /Patel Plumbing Ltd/.test(card) && /Company 01234567/.test(card) && /1 Pipe Street, London, E1 1AA/.test(card));

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Not now").click());
  await sleep(200);
  check("Not now still creates nothing", db.tables.clients.length === clientsBefore && !(await page.evaluate(() => document.body.innerText.includes("Add as client"))));

  // ---- ...and everything after one --------------------------------------
  await setField(page, 'input[role="combobox"]', "Patel Plumbing");
  await page.waitForFunction(() => document.body.innerText.includes("Patel Plumbing Ltd"), { timeout: 8000 });
  await page.evaluate(() => document.querySelector('[role="option"]').click());
  await waitText(page, "Add as client");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add as client").click());
  await sleep(700);
  const made = db.tables.clients.find((c) => c.name === "Patel Plumbing Ltd");
  check("Add as client saves the registered name and address", !!made && made.address === "1 Pipe Street\nLondon\nE1 1AA" && made.kind === "client", JSON.stringify(made));
  const remembered = await page.evaluate(() => JSON.parse(localStorage.getItem("company-register") ?? "{}"));
  check("the company number is kept against the new contact", Object.values(remembered).some((f) => f.number === "01234567"), JSON.stringify(remembered));
  const selected = await page.evaluate(() => ({ box: document.querySelector('input[role="combobox"]').value, sel: document.querySelector("select").value }));
  check("the new client is selected", selected.box === "Patel Plumbing Ltd" && selected.sel === made?.id, JSON.stringify(selected));
  await waitText(page, "Company 01234567 on the Companies House register.");
  check("the picked company's number is shown on the field", true);
  check("new invoice fits 375px", await noHScroll(page));
  await shot(page, "picker-invoice-picked");

  // ---- A dissolved company says so ---------------------------------------
  await setField(page, 'input[role="combobox"]', "Dead Co Ltd");
  await page.waitForFunction(() => document.body.innerText.includes("Companies House says this company is dissolved."), { timeout: 8000 });
  check("a dissolved company says so plainly", true);
  await shot(page, "picker-dissolved");

  // ---- New receipt: the same field over suppliers -------------------------
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await page.waitForSelector('input[role="combobox"]');
  await sleep(500);
  const supplierOrder = await arrowOrder(page, "Screwfix");
  check("receipt: suppliers A–Z with no history to go on", JSON.stringify(supplierOrder) === JSON.stringify([["", "Screwfix"], ["", "Toolstation Ltd"]]), JSON.stringify(supplierOrder));
  await page.select("select", TOOL);
  await sleep(300);
  const vendorFilled = await page.$eval('input[placeholder="Vendor / shop name"]', (e) => e.value);
  check("receipt: picking a supplier fills the empty vendor name", vendorFilled === "Toolstation Ltd", vendorFilled);
  check("receipt fits 375px", await noHScroll(page));
  const clientsAfterAdd = db.tables.clients.length;


  // ---- The scan review: gaps filled from the register ---------------------
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  const input = await page.$('input[type="file"][multiple]');
  await input.uploadFile(DIR + "copy.jpg");
  await page.waitForFunction(() => location.pathname === "/scan", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('input[placeholder="Supplier name as printed"]')?.value === "Northside Joinery", { timeout: 25000 });
  await waitText(page, "Companies House filled in", 15000).catch(async () => {
    console.log("DEBUG body:", (await page.evaluate(() => document.body.innerText)).slice(0, 700));
    console.log("DEBUG asked:", JSON.stringify(asked.slice(-6)));
    throw new Error("no register fill");
  });
  const scanText = await page.evaluate(() => document.body.innerText);
  check("scan: the register filled the gaps and says which", /Companies House filled in the registered address and the company number/.test(scanText), scanText.slice(0, 400));
  const details = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("label")].map((l) => [l.textContent.trim(), [...l.parentElement.querySelectorAll("input")].pop()?.value])));
  const withFill = await details();
  check("scan: registered address in the supplier address field", withFill["Supplier address"] === "5 Mill Road, Leeds, LS2 7AB", JSON.stringify(withFill["Supplier address"]));
  check("scan: company number added as its own detail", withFill["Company number"] === "07777777", JSON.stringify(withFill));
  check("scan: what the document printed is untouched", withFill["Supplier VAT number"] === "GB999", JSON.stringify(withFill["Supplier VAT number"]));
  check("scan: the fuller registered name is offered, not forced", /Registered as Northside Joinery Ltd/.test(scanText) && (await page.$eval('input[placeholder="Supplier name as printed"]', (e) => e.value)) === "Northside Joinery");
  check("scan fits 375px", await noHScroll(page));
  await shot(page, "picker-scan-filled");

  // A page added re-reads the document, which replaces the details: the
  // register's fill has to come back with them, not leave a stale note.
  const addPage = async () => {
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Add another page")).click());
    const add = await page.waitForSelector('input[type="file"][accept="image/*,application/pdf"]', { timeout: 15000 });
    await add.uploadFile(DIR + "back.jpg");
    await page.waitForFunction(() => document.querySelectorAll('[class*="Pages"], img').length >= 0 && !document.body.innerText.includes("Reading"), { timeout: 30000 });
    await sleep(1500);
  };
  await addPage();
  const afterReread = await details();
  check("scan: a page added keeps the register's fill", afterReread["Supplier address"] === "5 Mill Road, Leeds, LS2 7AB" && afterReread["Company number"] === "07777777", JSON.stringify(afterReread));
  check("scan: the note still matches what is in the form", /Companies House filled in/.test(await page.evaluate(() => document.body.innerText)));

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Undo").click());
  await sleep(400);
  const undone = await details();
  check("scan: Undo takes the register's fill back out", !undone["Supplier address"] && !("Company number" in undone) && undone["Supplier VAT number"] === "GB999", JSON.stringify(undone));

  await addPage();
  const stillUndone = await details();
  check("scan: the undo sticks through another read", !stillUndone["Supplier address"] && !("Company number" in stillUndone) && !/Companies House filled in/.test(await page.evaluate(() => document.body.innerText)), JSON.stringify(stillUndone));

  // A supplier is still never created on its own.
  check("scan: no supplier created by the register", db.tables.clients.length === clientsAfterAdd, String(db.tables.clients.length));

  // ---- New client/supplier form: the same register, and the same check ----
  await page.goto(`${BASE}/clients/new?kind=supplier`, { waitUntil: "networkidle0" });
  await page.waitForSelector('input[role="combobox"]');
  await setField(page, 'input[role="combobox"]', "Patel Plumbing");
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 0, { timeout: 8000 });
  const clientsBeforeForm = db.tables.clients.length;
  await page.evaluate(() => document.querySelector('[role="option"]').click());
  await waitText(page, "Company 01234567 on the Companies House register.", 8000);
  const formFilled = await page.evaluate(() => ({ name: document.querySelector('input[role="combobox"]').value, street: document.querySelector('input[aria-label="House number and street"]')?.value, postcode: document.querySelector('input[aria-label="Postcode"]')?.value }));
  check("new supplier form: a register pick fills the name and registered address", formFilled.name === "Patel Plumbing Ltd" && formFilled.street === "1 Pipe Street" && formFilled.postcode === "E1 1AA", JSON.stringify(formFilled));
  check("new supplier form: still nothing saved until Save", db.tables.clients.length === clientsBeforeForm, String(db.tables.clients.length));
  await setField(page, 'input[role="combobox"]', "Dead Co Ltd");
  await page.waitForFunction(() => document.body.innerText.includes("Companies House says this company is dissolved."), { timeout: 8000 });
  check("new supplier form: a dissolved name says so", true);
  await shot(page, "picker-new-supplier");

  // ---- No key: none of it shows ------------------------------------------
  configured = false;
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await page.waitForSelector('input[role="combobox"]');
  // Settle first: a check still in flight from the last page would land here.
  await sleep(1200);
  const askedBefore = asked.length;
  await setField(page, 'input[role="combobox"]', "Dead Co Ltd");
  await sleep(1200);
  const offText = await page.evaluate(() => document.body.innerText);
  check("no key: nothing mentions the register", !/Companies House|On the register|Add as client/.test(offText), offText.slice(0, 400));
  check("no key: no register rows", (await page.evaluate(() => document.querySelectorAll('[role="option"]').length)) === 0);
  check("no key: no lookups beyond the one configured check", asked.slice(askedBefore).every((s) => s === ""), JSON.stringify(asked.slice(askedBefore)));
  check("no key: typing still works", (await page.$eval('input[role="combobox"]', (e) => e.value)) === "Dead Co Ltd");
  const offOrder = await arrowOrder(page, "Zebra");
  check("no key: saved contacts still there, most used first", JSON.stringify(offOrder?.slice(0, 2)) === JSON.stringify([["Most used", "Brown Builders"], ["Most used", "Zebra Interiors Ltd"]]), JSON.stringify(offOrder));
  await page.select("select", ACME);
  await sleep(300);
  check("no key: picking a saved contact still selects it", (await page.$eval('input[role="combobox"]', (e) => e.value)) === "Acme Kitchens Ltd");
  check("no key: fits 375px", await noHScroll(page));
  await shot(page, "picker-no-key");

} catch (e) {
  console.log("ERROR", e.message);
  await shot(page, "picker-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
