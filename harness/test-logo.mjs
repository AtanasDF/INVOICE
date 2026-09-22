// The business logo (item 40): picked in Settings, uploaded to the account's
// own folder, kept through later saves, shown at the top of invoices and
// quotes, and removable. Storage is mocked here: uploads are recorded, and a
// signed logo link answers with a real PNG.
import fs from "node:fs";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, todayISO, day, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const HERE = new URL(".", import.meta.url).pathname;
const PNG = fs.readFileSync(HERE + "uploads/card.png");
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], recurring_invoices: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], invoice_reminders_sent: [], receipt_pages: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", account_kind: "limited", vat_registered: false, custom_categories: null, invoice_prefix: "INV-", invoice_next_number: 30, logo_url: null, bank_details: "" });
const CLIENT = newId(), INV = newId(), QUOTE = newId();
db.tables.clients.push({ id: CLIENT, user_id: UID, name: "Big Co Ltd", email: "pay@bigco.example", address: "2 Client Road\nLeeds\nLS1 2AB", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "14 days", phone: "" });
db.tables.invoices.push({ id: INV, user_id: UID, client_id: CLIENT, date: day(-3), number: "INV-000029", items: [{ description: "Plastering", quantity: 1, unitPrice: 500, vatRate: "zero" }], notes: "", due_date: day(11), payment_terms: "14 days", status: "sent", tags: [], vat_registered: false, cis_rate: null });
db.tables.quotes = db.tables.quotes ?? [];
db.tables.quotes.push({ id: QUOTE, user_id: UID, client_id: CLIENT, number: "Q-0007", date: todayISO(), valid_until: day(30), items: [{ description: "Skim ceiling", quantity: 1, unitPrice: 300, vatRate: "zero" }], notes: "", status: "sent", invoice_id: null, deposit_percent: null, deposit_amount: null, deposit_claimed: false, deposit_invoice_id: null, vat_registered: false });

const uploads = [];
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "*" };
const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  profile: "profile-logo",
  intercept: (req, u) => {
    if (req.method() === "OPTIONS" && u.pathname.startsWith("/storage/")) { req.respond({ status: 204, headers: cors, body: "" }); return true; }
    if (req.method() === "POST" && u.pathname.startsWith("/storage/v1/object/receipts/")) {
      uploads.push({ path: u.pathname.slice("/storage/v1/object/receipts/".length), type: req.headers()["content-type"] });
      req.respond({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ Key: "receipts/" + uploads.at(-1).path }) });
      return true;
    }
    if (req.method() === "GET" && u.pathname.includes("/object/sign/") && u.pathname.includes("/logo/")) {
      req.respond({ status: 200, headers: { ...cors, "content-type": "image/png" }, body: PNG });
      return true;
    }
    return false;
  },
});
page.on("dialog", (d) => d.accept().catch(() => {}));
const press = (text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll("button, label")].find((x) => x.textContent.trim() === t && !x.disabled);
  if (!b) throw new Error("no button: " + t);
  b.click();
}, text);
const lastProfile = () => { const row = db.tables.business_profile.at(-1); db.tables.business_profile = [row]; return row; };
const sheetLogo = () => page.evaluate(() => [...document.querySelectorAll("main img")].some((i) => i.getAttribute("alt") === "" && i.src.startsWith("data:image/png")));

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(700);
  check("Settings offers a logo, with none yet", (await bodyText(page)).includes("No logo yet. It goes at the top of your invoices and quotes."));
  const input = await page.$('input[type="file"][accept^="image/png"]');
  await input.uploadFile(HERE + "uploads/card.png");
  await page.waitForFunction(() => !!document.querySelector('img[alt="Your logo"]'), { timeout: 10000 }).catch(() => {});
  check("picking a picture shows it", !!(await page.$('img[alt="Your logo"]')));
  check("...and uploads it to the account's own logo folder, as a PNG", uploads.length === 1 && uploads[0].path.startsWith(`${UID}/logo/`) && uploads[0].path.endsWith(".png"), JSON.stringify(uploads));
  await press("Save");
  await sleep(800);
  const saved = lastProfile();
  check("Save keeps it on the profile as a stored reference", saved.logo_url === `storage:${uploads[0]?.path}`, String(saved.logo_url));

  await page.goto(`${BASE}/invoices/${INV}`, { waitUntil: "networkidle0" });
  await sleep(1200);
  check("the invoice shows the logo at the top", await sheetLogo());
  await page.goto(`${BASE}/quotes/${QUOTE}`, { waitUntil: "networkidle0" });
  await sleep(1200);
  check("so does the quote", await sheetLogo());

  // Saving something else must not lose it (Settings used to write null).
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(900);
  check("Settings shows the stored logo", !!(await page.$('img[alt="Your logo"]')) && (await bodyText(page)).includes("Change logo"));
  await page.evaluate(() => {
    const el = document.querySelector('textarea[aria-label="Bank details"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, "Sort 12-34-56 Acc 12345678");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await press("Save");
  await sleep(800);
  check("saving another change keeps the logo", lastProfile().logo_url === `storage:${uploads[0]?.path}` && lastProfile().bank_details === "Sort 12-34-56 Acc 12345678", String(lastProfile().logo_url));

  await press("Remove logo");
  await sleep(300);
  check("Remove logo takes it off the page", !(await page.$('img[alt="Your logo"]')));
  await press("Save");
  await sleep(800);
  check("...and Save takes it off the profile", lastProfile().logo_url === null, String(lastProfile().logo_url));
  await page.goto(`${BASE}/invoices/${INV}`, { waitUntil: "networkidle0" });
  await sleep(1000);
  check("the invoice no longer shows it", !(await sheetLogo()));

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(700);
  await page.evaluate(() => [...document.querySelectorAll('input[name="account-kind"]')][2].click());
  await sleep(300);
  check("personal use has no logo row", !(await bodyText(page)).includes("No logo yet"));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
