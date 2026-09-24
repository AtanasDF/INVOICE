import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot, newId, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3301";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
const CLIENT = newId();
const SUP = newId();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: true, custom_categories: [] });
db.tables.clients.push({ id: CLIENT, user_id: "x", name: "Big Co Ltd", email: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, payment_terms: "14 days" });
db.tables.clients.push({ id: SUP, user_id: "x", name: "Screwfix", email: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true });
db.tables.receipts = []; db.tables.invoices = []; db.tables.recurring_expenses = []; db.tables.recurring_invoices = []; db.tables.credit_notes = []; db.tables.invoice_payments = [];
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-clear" });
let dialogs = 0;
let answer = true;
page.on("dialog", async (d) => { dialogs++; if (answer) await d.accept(); else await d.dismiss(); });
const clearBtn = () => page.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Clear form"));
const clearState = async () => page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Clear form"); return b ? (b.disabled ? "disabled" : "enabled") : "missing"; });
const clickClear = async () => { await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Clear form").click()); await sleep(400); };
const typeInto = async (sel, text) => { await page.click(sel, { clickCount: 3 }); await page.type(sel, text); };
const values = () => page.evaluate(() => [...document.querySelectorAll("input:not([type=file]):not([type=radio]):not([type=checkbox]), textarea, select")].map((e) => e.value));
try {
  await signIn(page, BASE);

  // New client
  await page.goto(`${BASE}/clients/new`, { waitUntil: "networkidle0" });
  check("client: Clear form shown, off while empty", (await clearState()) === "disabled", await clearState());
  await typeInto('input[placeholder="Email (optional)"]', "a@b.example");
  await page.evaluate(() => [...document.querySelectorAll("input[type=radio]")][1].click());
  await typeInto('input[placeholder="Full name"]', "Jane Smith");
  await typeInto('input[aria-label="House number and street"]', "1 High St");
  await typeInto('input[aria-label="Postcode"]', "BS1 4DJ");
  await typeInto("#new-contact-vat", "GB123");
  check("client: on once typed", (await clearState()) === "enabled");
  answer = false;
  await clickClear();
  check("client: cancel keeps everything", dialogs === 1 && (await values()).includes("Jane Smith"));
  answer = true;
  await clickClear();
  const cv = await values();
  const company = await page.evaluate(() => document.querySelectorAll("input[type=radio]")[0].checked);
  check("client: cleared back to a blank company", dialogs === 2 && cv.every((v) => v === "") && company && (await clearState()) === "disabled", JSON.stringify(cv));
  await shot(page, "clear-client");
  const fits1 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("client: fits 375px", fits1);

  // Supplier form is the same page
  await page.goto(`${BASE}/clients/new?kind=supplier`, { waitUntil: "networkidle0" });
  check("supplier: Clear form shown", (await clearState()) === "disabled");

  // New receipt
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(500);
  check("receipt: Clear form off while empty", (await clearState()) === "disabled");
  await typeInto('input[placeholder="Shop or supplier"]', "Screwfix");
  await typeInto('input[placeholder^="Total paid"]', "12.00");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Split into multiple items")).click());
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Split into multiple items")).click());
  await sleep(200);
  await page.evaluate(() => document.querySelector('button[aria-label="Remove item 1"]').click());
  await sleep(500);
  check("receipt: removing an item doesn't save the receipt", db.tables.receipts.length === 0, JSON.stringify(db.tables.receipts.length));
  const rows = await page.evaluate(() => document.querySelectorAll('button[aria-label^="Remove item"]').length);
  check("receipt: one item left after removing one", rows === 1, String(rows));
  await clickClear();
  const rv = await page.evaluate(() => ({ vendor: document.querySelector('input[placeholder="Shop or supplier"]').value, total: document.querySelector('input[placeholder^="Total paid"]').value, items: document.querySelectorAll('button[aria-label^="Remove item"]').length, date: document.querySelector('input[type=date]').value }));
  check("receipt: cleared (vendor, total, items; date todayISO())", rv.vendor === "" && rv.total === "" && rv.items === 0 && rv.date === new Date().toISOString().slice(0, 10), JSON.stringify(rv));
  check("receipt: nothing saved", db.tables.receipts.length === 0);
  await shot(page, "clear-receipt");

  // New invoice
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(500);
  check("invoice: Clear form off while empty", (await clearState()) === "disabled", await clearState());
  await page.select("select", CLIENT);
  await typeInto('input[placeholder^="Description (e.g. Monthly work"]', "Plastering");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "+ Add line").click());
  await page.evaluate(() => document.querySelector("input[type=checkbox]").click());
  await typeInto('textarea[placeholder="Notes (optional)"]', "Thanks");
  await sleep(300);
  const before = await page.evaluate(() => ({ lines: document.querySelectorAll('button[aria-label^="Remove line"]').length, cis: document.querySelector("input[type=checkbox]").checked, terms: document.querySelector('input[placeholder^="Payment terms"]').value }));
  check("invoice: filled (client terms applied, 2 lines, CIS on)", before.lines === 2 && before.cis && before.terms === "14 days", JSON.stringify(before));
  await clickClear();
  const iv = await page.evaluate(() => ({ client: document.querySelector("select").value, lines: document.querySelectorAll('button[aria-label^="Remove line"]').length, desc: document.querySelector('input[placeholder^="Description (e.g. Monthly work"]').value, cis: document.querySelector("input[type=checkbox]").checked, terms: document.querySelector('input[placeholder^="Payment terms"]').value, notes: document.querySelector('textarea[placeholder="Notes (optional)"]').value, dates: [...document.querySelectorAll("input[type=date]")].map((d) => d.value) }));
    const due = new Date(Date.parse(todayISO()) + 30 * 86400000).toISOString().slice(0, 10);
  check("invoice: cleared to a blank invoice dated todayISO(), due in 30 days", iv.client === "" && iv.lines === 1 && iv.desc === "" && !iv.cis && iv.terms === "" && iv.notes === "" && iv.dates[0] === todayISO() && iv.dates[1] === due, JSON.stringify(iv));
  check("invoice: nothing saved", db.tables.invoices.length === 0);
  await shot(page, "clear-invoice");
  const fits2 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("invoice: fits 375px", fits2);

  await page.evaluate(() => localStorage.removeItem("free-invoice-draft"));

  // Recurring expense
  await page.goto(`${BASE}/recurring`, { waitUntil: "networkidle0" });
  await sleep(300);
  check("recurring expense: Clear form off while empty", (await clearState()) === "disabled");
  await typeInto('input[placeholder^="Description (e.g. Van"]', "Van insurance");
  await typeInto('input[placeholder^="Total (£"]', "80");
  const cats = await page.evaluate(() => { const s = document.querySelector("form .grid select"); return s ? [...s.options].map((o) => o.value) : []; });
  await page.evaluate((v) => { const s = document.querySelector("form .grid select"); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, v); s.dispatchEvent(new Event("change", { bubbles: true })); }, cats[1]);
  await clickClear();
  const catAfter = await page.evaluate(() => document.querySelector("form .grid select")?.value);
  check("recurring expense: category back to the first", catAfter === cats[0], `${catAfter} vs ${cats[0]}`);
  const xv = await page.evaluate(() => [document.querySelector('input[placeholder^="Description (e.g. Van"]').value, document.querySelector('input[placeholder^="Total (£"]').value]);
  check("recurring expense: cleared", xv.every((v) => v === ""), JSON.stringify(xv));

  // Recurring invoice
  await page.goto(`${BASE}/recurring/invoices`, { waitUntil: "networkidle0" });
  await sleep(300);
  check("recurring invoice: Clear form off while empty", (await clearState()) === "disabled");
  await typeInto('input[placeholder^="Description (e.g. Monthly retainer"]', "Retainer");
  await clickClear();
  const yv = await page.evaluate(() => document.querySelector('input[placeholder^="Description (e.g. Monthly retainer"]').value);
  check("recurring invoice: cleared", yv === "");
  check("confirm asked each time", dialogs === 6, String(dialogs));
} catch (e) { console.log("ERROR", e.message); await shot(page, "clear-error"); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
