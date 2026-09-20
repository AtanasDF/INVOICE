// A company picked from the register keeps its number on the contact row
// (migration-030), so any device checks the right company.
import { makeDb, launchSignedIn, signIn, sleep, bodyText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
Object.assign(db.tables, { receipts: [], invoices: [], credit_notes: [], invoice_payments: [] });
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", vat_registered: true, custom_categories: [] });
const HIT = { name: "PATEL PLUMBING LTD", number: "01234567", address: "1 Pipe Street\nLondon\nE1 1AA", status: "active", incorporated: "2015-03-01" };
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-company-number", intercept: (req, u) => {
  if (u.pathname === "/api/company-search") {
    const number = u.searchParams.get("number");
    req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(number ? { configured: true, company: HIT } : { configured: true, items: [HIT] }) });
    return true;
  }
  return false;
} });
const clickWith = (re) => page.evaluate((src) => { const b = [...document.querySelectorAll("button")].find((x) => new RegExp(src).test(x.textContent)); if (!b) throw new Error("no button matching " + src); b.click(); }, re);
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelectorAll('input[role="combobox"]').length > 0, { timeout: 20000 });
  const field = await page.$('input[role="combobox"]');
  await field.type("Patel Plumb", { delay: 20 });
  await page.waitForFunction(() => document.body.innerText.includes("PATEL PLUMBING LTD"), { timeout: 20000 });
  check("the register is searched as you type", true);
  await page.evaluate(() => { const el = [...document.querySelectorAll('[role="option"], button, li')].find((x) => /PATEL PLUMBING LTD/.test(x.textContent)); el.click(); });
  await sleep(500);
  check("picking one offers to add it, without saving anything yet", /Add as/i.test(await bodyText(page)) && db.tables.clients.length === 0, String(db.tables.clients.length));
  await clickWith("Add as");
  await page.waitForFunction(() => document.body.innerText.includes("Patel Plumbing") || document.body.innerText.includes("PATEL PLUMBING"), { timeout: 20000 });
  await sleep(700);
  const saved = db.tables.clients.find((c) => /patel/i.test(c.name));
  check("the supplier was added from the register", !!saved, JSON.stringify(db.tables.clients.map((c) => c.name)));
  check("its company number is on the row, not just the device", saved?.company_number === "01234567", JSON.stringify(saved && { n: saved.name, num: saved.company_number }));
  check("the registered address came with it", (saved?.address ?? "").includes("Pipe Street"), saved?.address);
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
