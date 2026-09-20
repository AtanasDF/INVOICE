// Invoice numbering on a brand-new account: the first invoice ever issued,
// then the next, with no gaps -- and what happens when the next number is
// already taken. Atanas is starting his company's books at 1, so this is
// his exact case.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "First Customer Ltd", email: "first@example.com", address: "1 Road\nBristol\nBS1 4DJ", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const draft = (n) => {
  const inv = { id: newId(), user_id: "x", client_id: C, date: today, number: `DRAFT-${n}`, items: [{ description: "First job", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: "", due_date: null, payment_terms: "", status: "draft", tags: [], vat_registered: null, cis_rate: null };
  db.tables.invoices.push(inv);
  return inv;
};
const A = draft(1);
const B = draft(2);

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-numbering" });
async function issue(inv) {
  await page.goto(`${BASE}/invoices/${inv.id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Mark as sent"), { timeout: 20000 });
  await clickText(page, "Mark as sent");
  await sleep(400);
  await clickText(page, "Confirm & mark as sent");
  await sleep(1600);
  return bodyText(page);
}

try {
  await signIn(page, BASE);

  // 1. A new account has never opened Settings, so there is no
  //    business_profile row at all. The very first invoice must still issue.
  check("a new account starts with no business profile row", db.tables.business_profile.length === 0);
  const first = await issue(A);
  const profile = db.tables.business_profile[0];
  check("the first invoice ever issued gets a number", db.tables.invoices.find((i) => i.id === A.id)?.status === "sent", first.replace(/\s+/g, " ").slice(0, 400));
  check("it is number 1, not a raw database error", /^[A-Z-]*1$/.test(db.tables.invoices.find((i) => i.id === A.id)?.number ?? ""), db.tables.invoices.find((i) => i.id === A.id)?.number);
  check("nothing raw about business profiles reaches the screen", !/business profile|P0001|PGRST/i.test(first), first.replace(/\s+/g, " ").slice(0, 400));

  // 2. The next one follows it with no gap.
  const second = await issue(B);
  const numbers = db.tables.invoices.filter((i) => i.status === "sent").map((i) => i.number);
  check("the second invoice follows the first with no gap", numbers.length === 2 && Number(numbers[1].replace(/\D/g, "")) === Number(numbers[0].replace(/\D/g, "")) + 1, JSON.stringify(numbers));
  check("the counter is left ready for the next one", profile?.invoice_next_number === 3, JSON.stringify(profile?.invoice_next_number));
  check("no error on the second either", !/couldn't|could not|error/i.test(second.slice(0, 600)), second.replace(/\s+/g, " ").slice(0, 300));

  // 3. Someone sets the next number back to one already used: the clash has
  //    to be explained, and the counter must not creep forward on a failure.
  const C3 = draft(3);
  db.tables.business_profile[0].invoice_next_number = 1;
  const clash = await issue(C3);
  check("a number already in use is explained, not a raw constraint", /already in use/i.test(clash), clash.replace(/\s+/g, " ").slice(0, 400));
  check("a refused issue leaves the invoice a draft", db.tables.invoices.find((i) => i.id === C3.id)?.status === "draft");
  check("a refused issue doesn't advance the counter", db.tables.business_profile[0].invoice_next_number === 1, String(db.tables.business_profile[0].invoice_next_number));

  // 4. Settings warns when the next number is below what has been used.
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const s = await bodyText(page);
  check("settings warns that the next number is already used", /went backwards|highest existing/i.test(s), s.slice(s.indexOf("Invoice numbering"), s.indexOf("Invoice numbering") + 500));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
