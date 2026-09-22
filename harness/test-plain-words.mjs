// The words a stranger must not meet (notes/first-page-research.md): on
// the front door, the sign-in page, the free page's chooser and the company
// check, none of the banned list; inside the free editor VAT, CIS and UTR
// are the person's own choices and allowed. Every sentence over 15 words
// is printed, not failed, so the reading-age pass has a list to work from.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId, todayISO, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const BANNED = ["PDF", "scan", "upload", "template", "generate", "account", "sign up", "register", "VAT", "CIS", "UTR", "officers", "API", "instantly", "easy", "AI"];
const INSIDE_EDITOR_OK = new Set(["VAT", "CIS", "UTR"]);
// Domain words that are not the banned sense: the Companies House register
// (the list itself), and a bank account's name and number.
const plain = (text) => text
  .replace(/Companies House register/g, "Companies House list")
  .replace(/\b(on|the) register\b/gi, "$1 list")
  .replace(/\bregistered\b/gi, "listed")
  .replace(/\b[Aa]ccount (name|number)\b/g, "bank $1");
const found = (text, allow = new Set()) => BANNED.filter((w) => !allow.has(w)).filter((w) => new RegExp(`(^|[^\\w])${w}(s|ning|ned|ed)?([^\\w]|$)`, w === w.toUpperCase() ? "" : "i").test(plain(text)));
const longOnes = (text) => text.split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 15);

// Inside the app the person's own words stay (they say "scan"; "Your
// account" is right once signed in); what must never show is the
// machinery: developer words and the words that talk down.
const DEV = ["API", "JSON", "CSV", "Postgres", "Supabase", "bucket", "webhook", "migration", "template", "generate", "generating", "generates", "instantly", "easy", "AI", "token"];
const devFound = (text) => DEV.filter((w) => new RegExp(`(^|[^\\w])${w}([^\\w]|$)`, w === w.toUpperCase() ? "" : "i").test(text));

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], recurring_invoices: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], invoice_reminders_sent: [], receipt_pages: [], quote_requests: [], quote_request_suppliers: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Nasko Plastering", vat_registered: true, custom_categories: null, invoice_prefix: "INV-", invoice_next_number: 30, inbox_token: "0123456789abcdef0123456789abcdef" });
const CLIENT = newId(), INV = newId();
db.tables.clients.push({ id: CLIENT, user_id: "x", name: "Big Co Ltd", email: "pay@bigco.example", address: "2 Client Road\nLeeds\nLS1 2AB", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "14 days", phone: "" });
db.tables.invoices.push({ id: INV, user_id: "x", client_id: CLIENT, date: day(-20), number: "INV-000029", items: [{ description: "Plastering", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", due_date: day(-6), payment_terms: "14 days", status: "sent", tags: [], vat_registered: true, cis_rate: null });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: todayISO(), vendor: "Screwfix", category: "Tools & equipment", amount: 20, vat_amount: 4, image_data_url: null, notes: "", starred: false, needs_review: true, warranty_months: null, tags: ["via-email"], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
db.tables.recurring_invoices.push({ id: newId(), user_id: "x", client_id: CLIENT, items: [{ description: "Monthly maintenance", quantity: 1, unitPrice: 200, vatRate: "standard" }], payment_terms: "14 days", notes: "", day_of_month: 1, next_due_date: day(9), active: true });
const SIGNED_IN = ["/", "/invoices", `/invoices/${INV}`, "/invoices/new", "/receipts", "/receipts/new", "/receipts/review", "/quotes", "/quotes/new", "/quotes/requests", "/clients", "/clients/new", "/expenses", "/vat", "/mileage", "/files", "/recurring", "/recurring/invoices", "/settings", "/feedback"];
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-plain-words" });
const main = () => page.evaluate(() => document.querySelector("main")?.innerText ?? document.body.innerText);
try {
  // A stranger throughout.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  for (const [path, name] of [["/", "the front door"], ["/login", "the sign-in page"], ["/check-company", "the company check"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    await sleep(600);
    const t = await main();
    check(`${name}: none of the banned words`, found(t).length === 0, JSON.stringify(found(t)));
    for (const s of longOnes(t)) console.log(`LONG (${name}, ${s.split(/\s+/).length} words): ${s.slice(0, 140)}`);
  }
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.removeItem("free-invoice-draft"); for (const id of ["free-invoice-scan", "free-invoice-signature"]) localStorage.setItem("tip:" + id, "3"); });
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(600);
  let t = await main();
  check("the free page's chooser: none of the banned words", found(t).length === 0, JSON.stringify(found(t)));
  for (const s of longOnes(t)) console.log(`LONG (chooser, ${s.split(/\s+/).length} words): ${s.slice(0, 140)}`);
  await clickText(page, "Type it in");
  await sleep(800);
  t = await main();
  check("the free editor: none of the banned words (VAT, CIS and UTR are the person's own)", found(t, INSIDE_EDITOR_OK).length === 0, JSON.stringify(found(t, INSIDE_EDITOR_OK)));
  for (const s of longOnes(t)) console.log(`LONG (editor, ${s.split(/\s+/).length} words): ${s.slice(0, 140)}`);
  check("the words stay when a page fails to load", (await bodyText(page)).length > 100);

  // Signed in: no machinery words anywhere.
  await signIn(page, BASE);
  const dev = [];
  for (const path of SIGNED_IN) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(700);
    const t2 = await main();
    const hit = devFound(t2);
    if (hit.length) dev.push(`${path}: ${hit.join(", ")} — ${t2.split("\n").find((l) => devFound(l).length)?.slice(0, 100)}`);
    for (const s of longOnes(t2)) console.log(`LONG (${path}, ${s.split(/\s+/).length} words): ${s.slice(0, 120)}`);
  }
  for (const d of dev) console.log("DEV WORD", d);
  check(`no developer words on the ${SIGNED_IN.length} signed-in pages`, dev.length === 0, dev.slice(0, 3).join(" | "));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
