import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, shot, newId } from "./mockdb-qux.mjs";
const BASE = "http://localhost:3300";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);
const plus = (days) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const total = (items, vat = true) => items.reduce((s, i) => s + i.quantity * i.unitPrice * (vat ? 1 + ({ standard: 0.2, reduced: 0.05 }[i.vatRate] ?? 0) : 1), 0);

const db = makeDb();
const C1 = newId();
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", vat_registered: true });
db.tables.clients.push({ id: C1, user_id: "x", name: "Jane Customer", email: "jane@example.com", kind: "client", archived: false, is_company: true, payment_terms: "14 days", reminders_enabled: true });

const setField = (page, selector, value, index = 0) =>
  page.evaluate((sel, v, i) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) throw new Error("no field " + sel + " #" + i);
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  }, selector, value, index);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const pickCustomer = (page, name) => page.evaluate((n) => { const b = [...document.querySelectorAll('[role="radio"]')].find((x) => x.querySelector("span span")?.textContent.trim() === n); if (!b) throw new Error("no customer " + n); b.click(); }, name);

const { browser, page } = await launchSignedIn(db, { base: BASE });
try {
  await signIn(page, BASE);
  await page.goto(BASE + "/quotes/new", { waitUntil: "networkidle0" });
  await waitText(page, "Quote number");
  await pickCustomer(page, "Jane Customer");
  await setField(page, 'input[placeholder="What the work or item is"]', "Rewire kitchen", 0);
  await setField(page, 'input[aria-label="Unit price"]', "1000", 0);
  await setField(page, 'select[aria-label="Deposit"]', "percent");
  await sleep(150);
  await setField(page, 'input[aria-label="Deposit percentage"]', "150");
  await clickText(page, "Save quote");
  await waitText(page, "between 0 and 100");
  check("150% deposit refused", db.tables.quotes.length === 0);
  await setField(page, 'input[aria-label="Deposit percentage"]', "30");
  await sleep(150);
  check("form shows the deposit amount", (await bodyText(page)).includes("£360.00 incl. VAT"), (await bodyText(page)).match(/£[\d.,]+ incl\. VAT[^\n]*/)?.[0]);
  await clickText(page, "Save quote");
  await page.waitForFunction(() => /\/quotes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 15000 });
  const q = () => db.tables.quotes[0];
  check("quote saved with 30% deposit", Number(q().deposit_percent) === 30 && q().deposit_amount === null, JSON.stringify(q()));
  await waitText(page, "Deposit to book the work: £360.00 (30%)");
  check("document shows the deposit", true);

  await clickText(page, "Accepted");
  await waitText(page, "Invoice the £360.00 deposit");
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Invoice the deposit"); b.click(); b.click(); });
  await page.waitForFunction(() => location.pathname.startsWith("/invoices/"), { timeout: 15000 });
  await sleep(500);
  const deps = db.tables.invoices.filter((i) => i.tags.includes("deposit for Q-0001"));
  const dep = deps[0];
  check("double tap makes one deposit invoice", deps.length === 1, deps.length);
  check("deposit invoice: one standard line of £300 net, due in 7 days", dep && dep.items.length === 1 && dep.items[0].unitPrice === 300 && dep.items[0].vatRate === "standard" && dep.due_date === plus(7) && dep.payment_terms === "7 days" && Math.abs(total(dep.items) - 360) < 0.005, JSON.stringify(dep));
  check("quote linked to its deposit invoice", q().deposit_invoice_id === dep?.id && q().deposit_claimed === true && q().status === "accepted", JSON.stringify(q()));

  await page.goto(`${BASE}/quotes/${q().id}`, { waitUntil: "networkidle0" });
  await waitText(page, "Deposit invoiced (draft, not sent yet)");
  check("quote page shows the deposit invoice and offers the balance", (await bodyText(page)).includes("Invoice the balance") && !(await bodyText(page)).includes("Invoice the deposit"));
  await clickText(page, "Invoice the balance");
  await waitText(page, "The deposit invoice is still a draft");
  await sleep(300);
  check("balance refused while the deposit is a draft; claim released", q().status === "accepted" && q().invoice_id === null && db.tables.invoices.length === 1, JSON.stringify(q()));

  Object.assign(dep, { status: "sent", number: "INV-1001" });
  await page.goto(`${BASE}/quotes/${q().id}`, { waitUntil: "networkidle0" });
  await waitText(page, "Invoice the balance");
  let dialogText = "";
  page.once("dialog", (d) => { dialogText = d.message(); d.dismiss(); });
  await clickText(page, "Not accepted after all");
  await sleep(400);
  check("backing out with an open deposit invoice asks first; cancelling keeps it accepted", dialogText.includes("INV-1001") && q().status === "accepted", dialogText);
  await clickText(page, "Invoice the balance");
  await page.waitForFunction(() => location.pathname.startsWith("/invoices/"), { timeout: 15000 });
  await sleep(500);
  const fin = db.tables.invoices.find((i) => i.tags.includes("from Q-0001"));
  const less = fin?.items.find((i) => i.quantity < 0);
  check("final invoice: quote lines less the deposit", fin && fin.items.length === 2 && less?.description === "Less deposit (invoice INV-1001)" && less.unitPrice === 300 && Math.abs(total(fin.items) - 840) < 0.005, JSON.stringify(fin));
  check("quote invoiced and linked", q().status === "invoiced" && q().invoice_id === fin?.id);
  await sleep(500);
  const shown = await bodyText(page);
  check("draft balance invoice totals £840.00 (subtotal £700.00)", shown.includes("£840.00") && shown.includes("Subtotal: £700.00"), shown.slice(-300));
  await shot(page, "qux-deposit-final-invoice");

  // A deposit invoice credited in full takes nothing off the balance.
  const Q4 = newId(), DEP4 = newId();
  db.tables.invoices.push({ id: DEP4, user_id: "x", client_id: C1, date: today, number: "INV-2002", items: [{ description: "Deposit for quote Q-0004", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: null, due_date: null, payment_terms: null, status: "sent", tags: ["deposit for Q-0004"] });
  db.tables.quotes.push({ id: Q4, user_id: "x", client_id: C1, number: "Q-0004", date: today, valid_until: null, items: [{ description: "Job", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", status: "accepted", invoice_id: null, deposit_percent: null, deposit_amount: 120, deposit_invoice_id: DEP4, deposit_claimed: true });
  db.tables.credit_notes.push({ id: newId(), user_id: "x", invoice_id: DEP4, date: today, amount: 120, reason: "cancelled" });
  await page.goto(`${BASE}/quotes/${Q4}`, { waitUntil: "networkidle0" });
  await waitText(page, "Invoice the balance");
  await clickText(page, "Invoice the balance");
  await page.waitForFunction(() => location.pathname.startsWith("/invoices/"), { timeout: 15000 });
  await sleep(400);
  const fin4 = db.tables.invoices.find((i) => i.tags.includes("from Q-0004"));
  check("credited deposit: final invoice is the full quote", fin4 && fin4.items.length === 1 && Math.abs(total(fin4.items) - 1200) < 0.005, JSON.stringify(fin4));

  // Claimed but never linked: found by its tag, or offered back.
  const Q2 = newId(), Q3 = newId(), INV = newId();
  const base = { user_id: "x", client_id: C1, date: today, valid_until: null, items: [{ description: "x", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: "", status: "accepted", invoice_id: null, deposit_percent: null, deposit_amount: 50, deposit_invoice_id: null, deposit_claimed: true };
  db.tables.quotes.push({ ...base, id: Q2, number: "Q-0002" }, { ...base, id: Q3, number: "Q-0003" });
  db.tables.invoices.push({ id: INV, user_id: "x", client_id: C1, date: today, number: "DRAFT-y", items: [], notes: null, due_date: null, payment_terms: null, status: "draft", tags: ["deposit for Q-0002"] });
  await page.goto(`${BASE}/quotes/${Q2}`, { waitUntil: "networkidle0" });
  await waitText(page, "Deposit invoiced");
  check("lost deposit link found by tag and relinked", db.tables.quotes.find((x) => x.id === Q2).deposit_invoice_id === INV);
  await page.goto(`${BASE}/quotes/${Q3}`, { waitUntil: "networkidle0" });
  await waitText(page, "Let me invoice the deposit again");
  page.once("dialog", (d) => d.accept());
  await clickText(page, "Let me invoice the deposit again");
  await waitText(page, "Invoice the deposit");
  check("stuck deposit claim can be released", db.tables.quotes.find((x) => x.id === Q3).deposit_claimed === false);
  check("no deletes", db.log.every((l) => !l.key.startsWith("DELETE")));
} catch (e) {
  console.log("ERROR", e.message);
  await shot(page, "qux-deposit-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
