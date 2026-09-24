import { makeDb, launchSignedIn, signIn, sleep, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "N", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-titles" });
const PATHS = ["/", "/scan", "/copy", "/convert", "/invoices", "/invoices/new", "/quotes", "/quotes/new", "/quotes/requests", "/clients", "/clients/new", "/receipts", "/receipts/new", "/receipts/review", "/expenses", "/mileage", "/vat", "/files", "/recurring", "/recurring/invoices", "/settings", "/feedback", "/check-company", "/free-invoice"];
try {
  await signIn(page, BASE);
  const seen = {};
  for (const p of PATHS) {
    await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" });
    await sleep(700);
    const t = await page.title();
    (seen[t] ??= []).push(p);
  }
  const dupes = Object.entries(seen).filter(([, v]) => v.length > 1);
  console.log("DISTINCT TITLES:", Object.keys(seen).length, "of", PATHS.length);
  for (const [t, v] of dupes) console.log("SHARED:", JSON.stringify(t), "->", v.join(", "));
} finally { await browser.close(); }
