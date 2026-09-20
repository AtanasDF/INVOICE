import { makeDb, launchSignedIn, signIn, sleep, bodyText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], feedback: [] });
db.fail = { "GET quotes": 50 };
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-probe" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/quotes`, { waitUntil: "networkidle0" });
  await sleep(2500);
  console.log("BODY:", JSON.stringify(await bodyText(page)));
  console.log("LOG:", JSON.stringify(db.log.map((l) => l.key)));
  console.log("FAIL LEFT:", JSON.stringify(db.fail));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); }
