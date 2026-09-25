// The same record, open twice.
//
// Nobody opens two tabs on purpose. They open one on the laptop, leave it,
// do something on the phone, and come back to a page showing yesterday.
// Every screen in this app reads once and then trusts what it read, so the
// question is always the same: does the stale tab overwrite the fresh one,
// and does it do it silently?
//
// This is only possible because request interception is per-page and the
// mocked database is now wired by `wire()` rather than inside
// launchSignedIn. A second tab used to reach nothing at all -- and a page
// with no data shows no error, so that looked like a pass.
import { makeDb, launchSignedIn, wire, signIn, sleep, bodyText, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, address: "1 Test Street", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Ltd", email: "a@b.c", kind: "client", archived: false, is_company: true, address: "", vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null });
const INV = newId();
db.tables.invoices.push({ id: INV, user_id: "x", client_id: C, date: day(-10), number: "INV-000009", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: day(20), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 900, profile: "profile-two-tabs" });
try {
  await signIn(page, BASE);

  // The second tab, on the same records.
  const other = await wire(await browser.newPage(), db, { base: BASE, width: 900 });
  await other.goto(`${BASE}/invoices/${INV}`, { waitUntil: "networkidle0" });
  await sleep(1400);
  const otherSees = await bodyText(other);
  check("a second tab really does see the same records", /INV-000009/.test(otherSees), otherSees.slice(0, 160));
  // Without this the rest of the suite would pass by seeing nothing at all,
  // which is the failure this whole file exists to avoid.
  check("and is not simply an empty page", /Acme Ltd/.test(otherSees) || /1,200|1,000/.test(otherSees.replace(/\s+/g, " ")), otherSees.slice(0, 200));

  await page.goto(`${BASE}/invoices/${INV}`, { waitUntil: "networkidle0" });
  await sleep(1400);

  // ---- Paid in one tab, paid again in the other ------------------------------
  const payInTab = async (p) => {
    const did = await p.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /^Mark as paid$/i.test(x.textContent.trim()));
      if (!b) return false;
      b.click();
      return true;
    });
    await sleep(1200);
    return did;
  };
  const first = await payInTab(page);
  check("the invoice can be marked paid", first === true);
  const paymentsAfterFirst = db.tables.invoice_payments.length;
  check("one payment recorded", paymentsAfterFirst === 1, String(paymentsAfterFirst));

  // The other tab still shows the invoice as unpaid: it read before.
  const staleSaid = await bodyText(other);
  check("the other tab is still showing it unpaid", !/Paid/.test(staleSaid.split("Amount due")[0] ?? staleSaid), staleSaid.slice(0, 120));

  // Now press it there too. This is the real question -- and whether the
  // press HAPPENED has to be checked, or "paying twice takes no more than
  // the invoice is worth" passes by nothing happening at all.
  const pressedAgain = await payInTab(other);
  check("the stale tab really did offer to mark it paid again", pressedAgain === true, String(pressedAgain));
  const total = db.tables.invoice_payments.reduce((s, p) => s + Number(p.amount), 0);
  const posts = db.log.filter((l) => l.key === "POST invoice_payments").length;
  const staleAfter = await bodyText(other);
  // Only one payment was ever written. The stale tab's press did not become
  // a second one -- which is the right outcome, but it has to be the RIGHT
  // right outcome: it must be because the page refused, not because a click
  // vanished. Either way the record is sound, and that is what is asserted;
  // the count is printed so a future change that starts writing two is
  // impossible to miss.
  check("the second press never became a second payment", posts === 1, String(posts));
  check("and the stale tab is showing the invoice, not a blank", /Mark as paid|Paid|Amount due/i.test(staleAfter), staleAfter.slice(0, 160));
  check("paying twice never takes more than the invoice is worth", total <= 1200.001, JSON.stringify({ payments: db.tables.invoice_payments.length, total }));
  check("and never leaves a negative balance", total <= 1200.001 && db.tables.invoice_payments.every((p) => Number(p.amount) >= 0), JSON.stringify(db.tables.invoice_payments.map((p) => p.amount)));

  // ---- Deleted in one tab, opened in the other ------------------------------
  const GONE = newId();
  db.tables.invoices.push({ id: GONE, user_id: "x", client_id: C, date: day(-5), number: "INV-000008", items: [{ description: "Work", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: "", due_date: day(20), payment_terms: "", status: "draft", tags: [], vat_registered: null, cis_rate: null });
  await other.goto(`${BASE}/invoices/${GONE}`, { waitUntil: "networkidle0" });
  await sleep(1200);
  // Taken out from under it.
  db.tables.invoices = db.tables.invoices.filter((i) => i.id !== GONE);
  const afterGone = await other.evaluate(async () => {
    const b = [...document.querySelectorAll("button")].find((x) => /Save|Mark as sent/i.test(x.textContent.trim()));
    if (b) b.click();
    await new Promise((r) => setTimeout(r, 1500));
    return document.body.innerText;
  });
  check("acting on a record that has gone says so, rather than nothing", /Couldn't|couldn't|gone|not found|no longer/i.test(afterGone), afterGone.slice(0, 220));
  check("and never says it saved", !/Saved\b/.test(afterGone.split("\n").slice(0, 6).join(" ")), afterGone.slice(0, 160));

  // ---- Settings, saved from two places --------------------------------------
  // The invoice counter is the dangerous one: a stale tab writing back an
  // old number is how issuing jams on a duplicate for ever.
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(1600);
  await other.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(1600);
  // One tab moves the counter on.
  db.tables.business_profile[0].invoice_next_number = 57;
  const saveIn = async (p) => {
    await p.evaluate(async () => {
      const b = [...document.querySelectorAll("button")].find((x) => /^Save/.test(x.textContent.trim()));
      b?.click();
      await new Promise((r) => setTimeout(r, 1600));
    });
  };
  await saveIn(other);
  const counter = db.tables.business_profile[0].invoice_next_number;
  check("a stale tab saving Settings does not wind the invoice counter back", counter >= 57, String(counter));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
