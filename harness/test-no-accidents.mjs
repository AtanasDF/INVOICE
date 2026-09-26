// Nothing in someone's accounting record should go on one tap. Every
// Remove must ask first, saying what goes, and saying No must leave the
// record exactly as it was.
import { makeDb, launchSignedIn, signIn, sleep, clickText, newId, todayISO } from "./mockdb.mjs";
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// ---------------------------------------------------------------------------
// Every removal in the app asks first -- checked at the source, not by tapping
// ---------------------------------------------------------------------------
// The clicking below covers the paths it can reach. This covers the rest: a
// new Remove added to a screen nobody drives here would otherwise ship without
// a confirm and nothing would say so.
//
// The rule from CLAUDE.md: "anything that removes a record asks first with
// window.confirm, naming what goes." Checked on 2026-09-26 and every one of
// them already did -- this is here so that stays true.
{
  const APP = `${REPO}/web/src`;
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    return e.isDirectory() ? walk(f) : /\.tsx?$/.test(e.name) ? [f] : [];
  });
  const unasked = [];
  for (const file of walk(APP)) {
    const src = fs.readFileSync(file, "utf8");
    if (!/Store\.remove\(/.test(src)) continue;
    // Take each function that calls a store's remove(), and look for a confirm
    // inside it. Functions are found by their opening line and closed at the
    // next one at the same indent, which is how this codebase is written.
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*(async )?function \w+/.test(lines[i])) continue;
      const indent = (lines[i].match(/^\s*/) || [""])[0].length;
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "}" && (lines[j].match(/^\s*/) || [""])[0].length === indent) { end = j; break; }
      }
      const body = lines.slice(i, end + 1).join("\n");
      if (!/Store\.remove\(/.test(body)) continue;
      if (/window\.confirm\(/.test(body)) continue;
      unasked.push(`${file.replace(APP + "/", "")}: ${lines[i].trim().slice(0, 60)}`);
    }
  }
  check("every function that removes a record asks first", unasked.length === 0, unasked.join(" | "));
}

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.allowDelete = ["invoices", "receipts", "clients", "invoice_payments", "credit_notes", "recurring_expenses", "recurring_invoices"];
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null, inbox_token: "0123456789abcdef0123456789abcdef" });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const INV = { id: newId(), user_id: "x", client_id: C, date: todayISO(), number: "INV-9", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: todayISO(), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null };
db.tables.invoices.push(INV);
const PAY = { id: newId(), user_id: "x", invoice_id: INV.id, date: todayISO(), amount: 200, method: "bank", note: "" };
db.tables.invoice_payments.push(PAY);
db.tables.credit_notes.push({ id: newId(), user_id: "x", invoice_id: INV.id, date: todayISO(), amount: 120, reason: "Overcharged" });
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: todayISO(), vendor: "Travis Perkins", category: "Supplies", amount: 50, vat_amount: 10, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
db.tables.recurring_expenses.push({ id: newId(), user_id: "x", description: "Van insurance", category: "Other", amount: 40, vat_amount: 8, supplier_id: null, day_of_month: 1, next_due_date: todayISO(), active: true });
db.tables.recurring_invoices.push({ id: newId(), user_id: "x", client_id: C, items: [{ description: "Monthly retainer", quantity: 1, unitPrice: 300, vatRate: "standard" }], payment_terms: "", notes: "", day_of_month: 1, next_due_date: todayISO(), active: true });

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-accidents" });
let asked = null;
let answer = false;
page.on("dialog", async (d) => { asked = d.message(); await (answer ? d.accept() : d.dismiss()); });

const count = (table) => db.tables[table].length;

async function removeOn(path, table, label, waitFor) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  await page.waitForFunction((w) => document.body.innerText.includes(w), { timeout: 20000 }, waitFor);
  const before = count(table);
  // Say no.
  asked = null; answer = false;
  await clickText(page, label);
  await sleep(900);
  check(`${path}: Remove asks before deleting`, !!asked, String(asked));
  check(`${path}: saying no keeps the record`, count(table) === before, `${count(table)} vs ${before}`);
  check(`${path}: the question says what goes`, !!asked && asked.length > 25 && /remove|discard/i.test(asked), String(asked));
  // Say yes.
  asked = null; answer = true;
  await clickText(page, label);
  await sleep(1400);
  check(`${path}: saying yes removes it`, count(table) === before - 1, `${count(table)} vs ${before}`);
}

try {
  await signIn(page, BASE);
  // Money first, on the invoice's own page: a payment and a credit note
  // both move what the customer owes.
  await removeOn(`/invoices/${INV.id}`, "invoice_payments", "Remove", "Payments");
  await removeOn(`/invoices/${INV.id}`, "credit_notes", "Remove", "Credit notes");
  await removeOn("/recurring/invoices", "recurring_invoices", "Remove", "Recurring");
  await removeOn("/recurring", "recurring_expenses", "Remove", "Van insurance");
  await removeOn("/receipts", "receipts", "Remove", "Travis Perkins");
  await removeOn("/invoices", "invoices", "Remove", "INV-9");
  await removeOn("/clients", "clients", "Remove", "Acme Kitchens Ltd");

  // A new import address stops the old one at once: it asks first, like every other destructive tap.
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Email import"), { timeout: 20000 });
  const tokenBefore = db.tables.business_profile.at(-1).inbox_token;
  asked = null; answer = false;
  await clickText(page, "Get a new address");
  await sleep(700);
  check("settings: a new import address asks first, naming the consequence", !!asked && /old one stops working/i.test(asked), String(asked));
  check("settings: saying no keeps the old address", db.tables.business_profile.at(-1).inbox_token === tokenBefore);
  asked = null; answer = true;
  await clickText(page, "Get a new address");
  await sleep(900);
  check("settings: saying yes makes a new one", !!asked && db.tables.business_profile.at(-1).inbox_token !== tokenBefore, String(db.tables.business_profile.at(-1).inbox_token).slice(0, 8));

} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
