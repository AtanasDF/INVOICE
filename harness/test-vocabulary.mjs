// One word for one thing. The app called the same person a "client" on some
// screens and a "customer" on others -- two names for one relationship, which
// makes somebody wonder whether they are two different lists. Atanas's own
// word is customer ("who you work with should contain either customer,
// supplier or company"), so that is the word everywhere a person reads it.
//
// `client` stays throughout the code, the database column and the URLs: this
// is about the words on the screen, not a rename of the model.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// The two places the word is deliberately kept, and why:
//   {{client_name}}  -- a token already typed into people's saved reminder
//                       wording; renaming it would silently stop it working.
//   Client entertaining -- an accounting category, and a value already saved
//                       on rows; it is the trade's own term, not our wording.
const KEPT = [/\{\{client_name\}\}/g, /Client entertaining/g];
// The words around each hit, not just the hit: "client" on its own tells
// you nothing about which line to go and change.
const saidClient = (text) => {
  let t = text;
  for (const k of KEPT) t = t.replace(k, "");
  const out = [];
  for (const m of t.matchAll(/\bclients?\b/gi)) out.push(t.slice(Math.max(0, m.index - 45), m.index + 45).replace(/\s+/g, " "));
  return out;
};

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.clients.push({ id: newId(), user_id: "x", name: "Jewson", email: "", address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const INV = newId();
db.tables.invoices.push({ id: INV, user_id: "x", client_id: C, date: day(-10), number: "INV-000009", items: [{ description: "Work", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", due_date: day(20), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });

const PAGES = [
  ["/", "Dashboard"],
  ["/clients", "Customers & suppliers"],
  ["/clients/new", "New customer"],
  ["/clients/new?kind=supplier", "New supplier"],
  ["/invoices", "Invoices"],
  ["/invoices/new", "Write an invoice"],
  [`/invoices/${INV}`, "One invoice"],
  ["/quotes", "Quotes"],
  ["/quotes/new", "Write a quote"],
  ["/recurring/invoices", "Recurring invoices"],
  ["/receipts", "Receipts & bills"],
  [`/clients/${C}/statement`, "Statement"],
];

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-vocabulary" });
try {
  await signIn(page, BASE);
  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1200);
    const text = await bodyText(page);
    // A blank page would pass this check for the wrong reason.
    const loaded = text.length > 60 && !/Application error/.test(text);
    const said = saidClient(text);
    check(`${name}: says customer, never client`, loaded && said.length === 0, loaded ? JSON.stringify(said) : `page did not load: ${text.slice(0, 120)}`);
  }

  // The words a screen reader is given, not only the ones drawn.
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle0" });
  await sleep(1000);
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll("[aria-label], [placeholder], [title]")]
      .flatMap((el) => [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("title")])
      .filter(Boolean));
  check("no screen-reader label says client either", saidClient(labels.join(" ")).length === 0, JSON.stringify(labels.filter((l) => /client/i.test(l))));

  // The contact field is shared by every form that names somebody, and it
  // builds its own words from one variable. The 2026-09-24 mutation run put
  // "client" back in that variable and this suite stayed green: it had read
  // the pages where the field's wording is overridden, and never the field's
  // own. Open its list and read what it says.
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!document.querySelector('input[role="combobox"]'), { timeout: 20000 });
  const fieldWords = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("select, option, input, button, ul")) {
      for (const a of ["aria-label", "placeholder", "title"]) { const v = el.getAttribute(a); if (v) out.push(v); }
      if (el.tagName === "OPTION" || el.tagName === "BUTTON") out.push(el.textContent.trim());
    }
    return out.filter(Boolean);
  });
  check("the shared contact field says customer in its own words too",
    saidClient(fieldWords.join(" | ")).length === 0, JSON.stringify(fieldWords.filter((w) => /client/i.test(w))));

  // Typing surfaces the headings above the matches, which are built from the
  // same variable and shown nowhere else.
  await page.evaluate(() => {
    const box = document.querySelector('input[role="combobox"]');
    if (!box) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(box, "Acme");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.dispatchEvent(new Event("focus", { bubbles: true }));
  });
  await sleep(900);
  const listWords = await page.evaluate(() => {
    const list = document.querySelector('[role="listbox"]');
    return list ? [list.getAttribute("aria-label") ?? "", list.innerText] : [];
  });
  check("and so do the headings over the matches", saidClient(listWords.join(" | ")).length === 0, JSON.stringify(listWords));

  // And the name the browser tab and the announcer use -- back on the page
  // it is about, since the checks above navigate away from it.
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle0" });
  await sleep(800);
  const title = await page.title();
  check("the page is titled Customers & suppliers", title.startsWith("Customers & suppliers"), title);
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
