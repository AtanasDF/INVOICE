import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, shot, newId } from "./mockdb-rl.mjs";
const BASE = process.env.BASE ?? "http://localhost:3200";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
const C = newId();
db.tables.business_profile.push({ business_name: "Harness Building", vat_registered: false, show_overdue_reminders: false, invoice_prefix: "INV-", invoice_next_number: 1 });
db.tables.clients.push({ id: C, user_id: "x", name: "Big Contractor Ltd", email: "ap@contractor.example", kind: "client", archived: false, is_company: true, reminders_enabled: true });
db.tables.invoices = []; db.tables.invoice_payments = []; db.tables.credit_notes = []; db.tables.invoice_reminders_sent = []; db.tables.receipts = []; db.tables.recurring_expenses = []; db.tables.invoice_links = []; db.tables.quotes = [];
let next = 1;
const { browser, page } = await launchSignedIn(db, { base: BASE, intercept: (req, u) => {
  if (!u.pathname.endsWith("/rpc/assign_invoice_number")) return false;
  if (req.method() === "OPTIONS") { req.respond({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" }, body: "" }); return true; }
  const id = JSON.parse(req.postData() || "{}").p_invoice_id;
  const inv = db.tables.invoices.find((i) => i.id === id);
  const number = `INV-${String(next++).padStart(4, "0")}`;
  Object.assign(inv, { status: "sent", number, vat_registered: false });
  req.respond({ status: 200, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(number) });
  return true;
} });
const setVal = (sel, v, i = 0) => page.evaluate((s, v, i) => { const el = document.querySelectorAll(s)[i]; const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }, sel, v, i);
const waitText = (t) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: 20000 }, t);
const clickIn = (label, n = 0) => page.evaluate((l, n) => { const b = [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === l)[n]; b?.click(); return !!b; }, label, n);
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await waitText("CIS subcontractor");
  await setVal("select", C);
  await page.evaluate(() => [...document.querySelectorAll("label")].find((l) => l.textContent.includes("CIS subcontractor")).querySelector("input").click());
  await sleep(200);
  await setVal('input[placeholder^="Description"]', "Labour: fit kitchen");
  await setVal('input[aria-label="Unit price"]', "1000");
  await clickText(page, "+ Add line");
  await sleep(200);
  await setVal('input[placeholder^="Description"]', "Worktops", 1);
  await setVal('input[aria-label="Unit price"]', "500", 1);
  await clickIn("Materials", 1);
  await sleep(300);
  let t = await bodyText(page);
  check("new invoice: CIS summary on labour only", t.includes("CIS deduction (20% of £1,000.00 labour): −£200.00") && t.includes("The contractor pays you: £1,300.00"), t.slice(t.indexOf("Total"), t.indexOf("Total") + 200));
  await clickText(page, "Save draft");
  await page.waitForFunction(() => location.pathname.startsWith("/invoices/") && !location.pathname.endsWith("/new"), { timeout: 15000 });
  const inv = () => db.tables.invoices[0];
  check("saved with the CIS rate and line kinds", inv()?.cis_rate === 20 && inv().items[0].kind === "labour" && inv().items[1].kind === "materials", JSON.stringify(inv()));

  await waitText("Draft invoice");
  t = await bodyText(page);
  check("draft keeps CIS on", t.includes("CIS rate") && t.includes("CIS deduction (20% of £1,000.00 labour): −£200.00"), t.slice(0, 300));
  await setVal("select", "30", [...(await page.$$eval("select", (s) => s.map((x) => x.options[0]?.value)))].findIndex((v) => v === "20"));
  await sleep(300);
  t = await bodyText(page);
  check("rate 30%: 300 off, 1200 paid", t.includes("CIS deduction (30% of £1,000.00 labour): −£300.00") && t.includes("The contractor pays you: £1,200.00"), t.match(/CIS deduction[^\n]*/)?.[0]);
  await clickText(page, "Mark as sent");
  await sleep(300);
  await clickText(page, "Confirm & mark as sent");
  await waitText("Amount due");
  check("issued with the new rate", inv().cis_rate === 30 && inv().status === "sent", JSON.stringify({ cis: inv().cis_rate, s: inv().status }));
  t = await bodyText(page);
  check("issued invoice shows the deduction and what's due", t.includes("CIS deduction (30% of £1,000.00 labour): −£300.00") && t.includes("Amount due: £1,200.00") && t.includes("Worktops (materials)"), t.slice(0, 900));
  await shot(page, "cis-issued");
  // Half the work credited, at its value before CIS: CIS on what's still billed.
  await clickText(page, "+ New credit note");
  await sleep(200);
  t = await bodyText(page);
  check("credit note form explains CIS", t.includes("Credit the value of the work, before CIS") && t.includes("credit its total of £1,500.00"), t.slice(t.indexOf("Credit notes"), t.indexOf("Credit notes") + 300));
  await setVal('input[placeholder="Amount to credit (£)"]', "750");
  await clickText(page, "Save credit note");
  await sleep(1500);
  t = await bodyText(page);
  check("after a £750 credit: CIS on the £500 labour still billed, amount due £600", t.includes("CIS deduction (30% of £500.00 labour after credit): −£150.00") && t.includes("Amount due: £600.00"), t.match(/CIS deduction[^\n]*/)?.[0] + " / " + t.match(/Amount due: £[\d.,]+/)?.[0]);
  await clickText(page, "Mark as paid");
  await sleep(1500);
  const pay = db.tables.invoice_payments[0];
  check("Mark as paid records what the contractor pays (600) and sets paid", pay?.amount === 600 && inv().status === "paid", JSON.stringify({ pay, s: inv().status }));

  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await waitText("Tax so far");
  t = await bodyText(page);
  const card = t.slice(t.indexOf("Tax so far"));
  check("tax card: CIS taken off the bill (half credited)", card.includes("CIS already taken off £150") && card.includes("CIS kept back by contractors"), card.slice(0, 500));
  check("tax card: 750 income, nothing to set aside, 150 back", card.includes("£750.00") && card.includes("HMRC may owe you about £150 back"), card.slice(0, 500));
  check("tax card: next Self Assessment date", /Next Self Assessment date: 31 January 20\d\d/.test(card) && /This year's tax \(20\d\d\/\d\d\) is due by 31 January 20\d\d/.test(card), card.slice(0, 900));
  const el = await page.evaluateHandle(() => [...document.querySelectorAll("h2")].find((h) => h.textContent.startsWith("Tax so far")).parentElement);
  await el.screenshot({ path: new URL(".", import.meta.url).pathname + "tax-cis.png" });

  // A CIS invoice from the Free page comes across as CIS.
  await page.evaluate(() => {
    const d = { version: 1, docType: "invoice", layout: "modern", issuer: { name: "Harness Building", address: null, email: null, phone: null, website: null, vatNumber: null, companyNumber: null, utr: null }, bank: { accountName: null, sortCode: null, accountNumber: null, iban: null, reference: null }, customer: { name: "Big Contractor Ltd", address: null, email: null }, number: "7", date: "2026-09-19", dueDate: "2026-10-03", paymentTerms: "14 days", currencySymbol: "£", vatRegistered: false, cis: { enabled: true, rate: 20 }, reverseCharge: false, lines: [{ description: "Labour", quantity: 1, unitPrice: 800, vatRate: "standard", kind: "labour" }, { description: "Skip hire", quantity: 1, unitPrice: 200, vatRate: "standard", kind: "other" }], notes: "", footer: "" };
    localStorage.setItem("free-invoice-draft", JSON.stringify(d));
  });
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await waitText("Imported from your free invoice");
  t = await bodyText(page);
  check("Free page import keeps CIS, other lines not deducted", t.includes("CIS deduction (20% of £800.00 labour): −£160.00") && !t.includes("isn't carried across"), t.match(/CIS deduction[^\n]*/)?.[0] ?? t.slice(0, 400));
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("page fits 375px", fits);
} catch (e) { console.log("ERROR", e.message); await shot(page, "cis-error"); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
