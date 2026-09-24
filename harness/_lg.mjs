import { makeDb, launchSignedIn, sleep, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-lg" });
try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await sleep(2500);
  const all = await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => ({ n: i.name, t: i.type, ac: i.getAttribute("autocomplete"), vis: i.offsetParent !== null })));
  console.log(JSON.stringify(all));
} finally { await browser.close(); }
