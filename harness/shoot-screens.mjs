// Before/after pictures of the main screens at an iPhone's width, light and
// dark, against the mocked database. Usage: node shoot-screens.mjs <before|after> [route...]
import { makeDb, launchSignedIn, signIn, sleep, day, UID } from "./mockdb.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { REPO } from "./repo.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const [stage = "after", ...only] = process.argv.slice(2);
const OUT = join(REPO, "notes", "screens-2026-11-07");
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  ["home", "/"],
  ["scan", "/scan"],
  ["receipts", "/receipts"],
  ["new-invoice", "/invoices/new"],
  ["menu", "/", true],
];

function seed() {
  const db = makeDb();
  Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [], receipt_pages: [], scan_usage: [] });
  db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 43, show_overdue_reminders: true });
  db.tables.clients.push(
    { id: "c1", user_id: UID, name: "Hetherington Groundworks", kind: "client", archived: false },
    { id: "c2", user_id: UID, name: "Travis Perkins", kind: "supplier", archived: false },
  );
  db.tables.invoices.push(
    { id: "i1", user_id: UID, client_id: "c1", number: "INV-040", date: day(-40), due_date: day(-10), status: "sent", items: [{ description: "Labour", quantity: 1, unitPrice: 100, vatRate: 0 }] },
    { id: "i2", user_id: UID, client_id: "c1", number: "INV-041", date: day(-9), due_date: day(21), status: "sent", items: [{ description: "Labour", quantity: 1, unitPrice: 800, vatRate: 0 }] },
  );
  db.tables.receipts.push(
    { id: "r1", user_id: UID, client_id: "c2", vendor: "Travis Perkins", date: day(-2), amount: 258, vat_amount: 51.6, document_type: "invoice", paid: false, due_date: day(2), category: "Materials", details: {} },
    { id: "r2", user_id: UID, client_id: "", vendor: "BP Kingstown", date: day(-1), amount: 67.28, vat_amount: 13.45, document_type: "receipt", paid: true, category: "Fuel", details: {} },
    { id: "r3", user_id: UID, client_id: "", vendor: "Screwfix", date: day(0), amount: 10, vat_amount: 2, document_type: "receipt", paid: true, needs_review: true, details: {} },
    { id: "r4", user_id: UID, client_id: "", vendor: "Wickes", date: day(-12), amount: 42.5, vat_amount: 8.5, document_type: "receipt", paid: true, category: "Materials", details: {} },
  );
  return db;
}

const db = seed();
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-shoot" });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1");
try {
  await signIn(page, BASE);
  for (const [name, route, menu] of SCREENS) {
    if (only.length && !only.includes(name)) continue;
    for (const mode of ["light", "dark"]) {
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: mode }]);
      await page.goto(BASE + route, { waitUntil: "networkidle0" }).catch(() => {});
      await sleep(1800);
      if (menu) {
        await page.evaluate(() => [...document.querySelectorAll("summary")].find((b) => /^Menu$/.test(b.textContent.trim()))?.click());
        await sleep(600);
      }
      await page.screenshot({ path: join(OUT, `${name}-${stage}-${mode}.png`), fullPage: !menu });
      console.log("shot", name, stage, mode);
    }
  }
} finally {
  await browser.close();
}
