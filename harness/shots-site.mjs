// A TOOL, not a suite: the pictures on the public website (notes/website-plan.md),
// taken from the app itself against a made-up courier, so a screen that changes is
// retaken in one run instead of the site drifting from what people get.
//
//   BASE=http://localhost:3100 node shots-site.mjs     (writes web/public/site/*.webp)
import fs from "node:fs";
import { makeDb, launchSignedIn, signIn, sleep, newId, todayISO, day } from "./mockdb.mjs";
import { APP } from "./repo.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? `${APP}/public/site`;
fs.mkdirSync(OUT, { recursive: true });

const db = makeDb();
const C1 = newId(), C2 = newId(), I1 = newId(), I2 = newId(), I3 = newId();
db.tables.business_profile.push({
  business_name: "Jay Kovac Deliveries", address: "1 Depot Way\nCarlisle CA1 1AA", vat_registered: false, show_overdue_reminders: true,
  invoice_prefix: "INV-", invoice_next_number: 45,
  bank_details: "Account name: J Kovac\nSort code: 12-34-56\nAccount number: 12345678",
  payment_link: "https://pay.sumup.com/b2c/KOVAC",
});
const client = (id, name, email) => ({ id, user_id: "x", name, email, kind: "client", archived: false, is_company: true, reminders_enabled: true });
db.tables.clients.push(client(C1, "Northway Parcels Ltd", "accounts@northway.example"), client(C2, "Eden Valley Couriers", "pay@edenvalley.example"));
const inv = (id, c, number, price, date, due, status = "sent") => ({ id, user_id: "x", client_id: c, date, number, items: [{ description: "Multi-drop deliveries, week " + number.slice(-2), quantity: 1, unitPrice: price, vatRate: "standard" }], notes: null, due_date: due, payment_terms: "14 days", status, tags: [] });
db.tables.invoices.push(inv(I1, C1, "INV-0044", 640, day(-4), day(10)), inv(I2, C2, "INV-0043", 585, day(-18), day(-4)), inv(I3, C1, "INV-0042", 615, day(-32), day(-18), "paid"));
db.tables.invoice_payments = [{ id: newId(), user_id: "x", invoice_id: I3, date: day(-15), amount: 615, method: "bank" }];
Object.assign(db.tables, { credit_notes: [], invoice_reminders_sent: [], invoice_links: [], quote_links: [], quotes: [], recurring_expenses: [], recurring_invoices: [], receipt_pages: [] });
const r = (vendor, category, amount, vat, d, extra = {}) => ({ id: newId(), user_id: "x", document_type: "receipt", paid: true, needs_review: false, date: d, amount, vat_amount: vat, vendor, category, image_data_url: null, notes: "", starred: false, warranty_months: null, tags: [], line_items: [], invoice_number: null, due_date: null, details: {}, credit_of_receipt_id: null, client_id: null, ...extra });
db.tables.receipts = [
  r("Penrith Services", "Fuel", 58.33, 11.67, todayISO()),
  r("Carlisle Car Park", "Parking", 3.75, 0.75, day(-1)),
  r("Penrith Services", "Fuel", 62.5, 12.5, day(-6)),
  r("Halfords", "Vehicle repairs", 37.49, 7.5, day(-9)),
  r("Kwik Fit", "Vehicle repairs", 120, 24, day(-20)),
  r("Mileage", "Mileage", 21.6, 0, day(-2), { document_type: "other", details: { mileage: { miles: 48, from: "CA1 1AA", to: "CA11 7AA", vehicle: "car", rate: 0.45, purpose: "Collection, Penrith" } } }),
  r("Mileage", "Mileage", 31.5, 0, day(-8), { document_type: "other", details: { mileage: { miles: 70, from: "CA1 1AA", to: "LA9 4AA", vehicle: "car", rate: 0.45, purpose: "Kendal drops" } } }),
];

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-shots-site" });
try {
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }]);
  await signIn(page, BASE);
  // Tips and the setup card are for people using it, not for a picture of it.
  // Each tip is stored only once it has been shown, so there is nothing to
  // overwrite in advance: answer "seen enough" for every one instead.
  await page.evaluateOnNewDocument(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) { return String(k).startsWith("tip:") ? "9" : k === "getting-started-hidden" ? "1" : get.call(this, k); };
  });
  await page.setViewport({ width: 390, height: 780, deviceScaleFactor: 2 });
  const take = async (path, name, ready, scrollTo) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    if (ready) await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 20000 }, ready).catch(() => console.log("not found:", ready));
    await sleep(900);
    if (scrollTo) await page.evaluate((t) => [...document.querySelectorAll("h1,h2,h3,p,span")].find((e) => e.textContent.trim().startsWith(t))?.scrollIntoView({ block: "start" }), scrollTo);
    else await page.evaluate(() => window.scrollTo(0, 0));
    // The floating Feedback button sits over every picture otherwise.
    await page.evaluate(() => [...document.querySelectorAll("a,button")].filter((e) => e.textContent.trim() === "Feedback" && getComputedStyle(e).position === "fixed").forEach((e) => e.remove()));
    await sleep(300);
    await page.screenshot({ path: `${OUT}/${name}.webp`, type: "webp", quality: 80 });
    console.log("saved", name);
  };
  await take("/", "home", "Northway");
  await take("/invoices", "invoices", "INV-0044");
  await take(`/invoices/${I1}`, "pay-now", "How to pay", "How to pay");
  await take("/receipts", "receipts", "Penrith Services");
  await take("/mileage", "mileage", "Kendal");
  await take("/expenses", "tax", "Fuel");
} finally {
  await browser.close();
}
