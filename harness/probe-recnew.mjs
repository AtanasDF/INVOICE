import { makeDb, launchSignedIn, signIn, sleep } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "H", vat_registered: true, custom_categories: null });
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-recnew" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const f = await page.evaluate(() => [...document.querySelectorAll("input,textarea")].map((i, n) => `${n} ${i.tagName}:${i.type} ph="${i.placeholder||""}" label="${(i.labels?.[0]?.textContent||"").trim().slice(0,30)}" aria="${i.getAttribute("aria-label")||""}"`));
  console.log(f.join("\n"));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); }
