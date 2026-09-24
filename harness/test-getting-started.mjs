// What a new account is still missing. Atanas is starting a company from
// scratch and the app asked for none of it: you could send an invoice with
// no business name on it, no address, no bank details for the customer to
// pay into, and no answer to the VAT question -- each of which is wrong on
// a document that goes to somebody else.
//
// A list that ticks itself off, not a wizard. Nothing is blocked.
import { gettingStarted } from "./gen/lib/gettingStarted.js";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const EMPTY = { businessName: "", address: "", bankDetails: "", invoiceNextNumber: 0 };
const FULL = { businessName: "Harness Plastering Ltd", address: "1 Road\nBristol", bankDetails: "12-34-56 / 12345678", invoiceNextNumber: 1 };

let s = gettingStarted(EMPTY, { customers: 0, documents: 0 });
check("a brand new account has nothing done", s.done === 0 && !s.complete, JSON.stringify({ done: s.done, total: s.total }));
check("every step says why it matters, not just what to type", s.steps.every((x) => x.why.length > 20), JSON.stringify(s.steps.map((x) => x.why.length)));
check("every step leads somewhere", s.steps.every((x) => x.href.startsWith("/")), JSON.stringify(s.steps.map((x) => x.href)));

s = gettingStarted(FULL, { customers: 1, documents: 1 });
check("a set-up account is finished, and the list goes away", s.complete && s.done === s.total, JSON.stringify({ done: s.done, total: s.total }));


// The test account's business name really is the word PLACEHOLDER, which
// would otherwise print on invoices as though it were a name.
s = gettingStarted({ ...FULL, businessName: "PLACEHOLDER" }, { customers: 1, documents: 1 });
check("a business name of PLACEHOLDER is not a business name", !s.complete && !s.steps.find((x) => x.id === "name").done);

s = gettingStarted({ ...FULL, businessName: "   " }, { customers: 1, documents: 1 });
check("nor is a name of spaces", !s.steps.find((x) => x.id === "name").done);

// ── On the dashboard ──
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "", vat_registered: null, invoice_prefix: "INV-", invoice_next_number: 0, address: "", bank_details: "", custom_categories: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-getting-started" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Setting up"), { timeout: 20000 });
  const t = await bodyText(page);
  check("a new account is shown what it still needs", /Setting up/.test(t) && /0 of 6 done/.test(t), t.replace(/\s+/g, " ").slice(0, 300));
  check("and told none of it is compulsory", /Everything works without these/.test(t), t.replace(/\s+/g, " ").slice(0, 300));
  check("the progress is announced, not only drawn", await page.evaluate(() =>
    !!document.querySelector('[role="progressbar"][aria-valuenow="0"][aria-valuemax="6"]')), "no progressbar");

  // Each unfinished step is a link somebody can follow.
  const links = await page.evaluate(() => {
    const s = [...document.querySelectorAll("section")].find((x) => /Setting up/.test(x.textContent));
    return s ? [...s.querySelectorAll("a")].map((a) => a.getAttribute("href")) : [];
  });
  check("every unfinished step is a link to where it is done", links.length === 6 && links.includes("/settings") && links.includes("/clients/new"), JSON.stringify(links));

  // It can be put away, and stays away.
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Put this away")?.click());
  await sleep(600);
  check("it can be put away", !/Setting up/.test(await bodyText(page)));
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(1500);
  check("and it stays away", !/Setting up/.test(await bodyText(page)), (await bodyText(page)).slice(0, 200));

  // A finished account never sees it at all.
  db.tables.business_profile[0] = { ...db.tables.business_profile[0], business_name: "Harness Plastering Ltd", address: "1 Road", bank_details: "12-34-56", vat_registered: true, invoice_next_number: 1 };
  db.tables.clients.push({ id: newId(), user_id: "x", name: "Acme", email: "", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
  db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: "2026-09-01", vendor: "Jewson", category: "Supplies", amount: 10, vat_amount: 2, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
  const { browser: b2, page: p2 } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-getting-started-done" });
  await signIn(p2, BASE);
  await p2.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(2000);
  check("an account with its details in never sees the list", !/Setting up/.test(await bodyText(p2)), (await bodyText(p2)).slice(0, 200));
  await b2.close();
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
