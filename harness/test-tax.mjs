import { makeDb, launchSignedIn, signIn, sleep, newId, bodyText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3300";
const OUT = new URL(".", import.meta.url).pathname;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const item = (p) => ({ description: "Work", quantity: 1, unitPrice: p, vatRate: "standard" });
const inv = (date, p, status = "sent") => ({ id: newId(), user_id: "x", client_id: null, date, number: "INV-" + p, items: [item(p)], notes: null, due_date: null, payment_terms: null, status, tags: [] });
const rc = (date, amount, vat) => ({ id: newId(), user_id: "x", client_id: null, date, vendor: "Supplier", category: "Materials", amount, vat_amount: vat, needs_review: false, document_type: "receipt", paid: true, tags: [], line_items: [], notes: "", starred: false });

async function run(vatRegistered, name) {
  const db = makeDb();
  db.tables.business_profile.push({ business_name: "Test", vat_registered: vatRegistered, show_overdue_reminders: false });
  db.tables.invoices.push(inv("2026-04-20", 8000, "paid"), inv("2026-06-15", 12000), inv("2026-08-01", 6500, "paid"), inv("2026-09-01", 3000, "draft"), inv("2026-03-30", 5000, "paid"));
  db.tables.receipts = [rc("2026-05-03", 1200, 240), rc("2026-07-10", 800, 160), rc("2026-02-10", 400, 80)];
  db.tables.recurring_expenses = [];
  const { browser, page } = await launchSignedIn(db, { base: BASE });
  try {
    await signIn(page, BASE);
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("Tax so far"), { timeout: 20000 });
    const t = await bodyText(page);
    const card = t.slice(t.indexOf("Tax so far"), t.indexOf("This month so far"));
    console.log("---", name, "---\n" + card);
    const el = await page.evaluateHandle(() => [...document.querySelectorAll("h2")].find((h) => h.textContent.startsWith("Tax so far")).parentElement);
    await el.screenshot({ path: OUT + `tax-${name}.png` });
    return card;
  } finally {
    await browser.close();
  }
}
const notReg = await run(false, "not-vat");
check("not VAT registered: profit 26,500 − 2,400 = 24,100", notReg.includes("£24,100.00"), notReg);
check("counts 3 invoices, 2 receipts", notReg.includes("Invoiced (3)") && notReg.includes("Costs (2)"));
// The set-aside is a share of the year gone by, so it moves every day:
// check it adds up to its own two parts and sits inside the year's tax.
{
  const aside = Number((notReg.match(/Set aside about £([\d,]+)/)?.[1] ?? "0").replace(/,/g, ""));
  const it = Number((notReg.match(/Income tax £([\d,]+)/)?.[1] ?? "0").replace(/,/g, ""));
  const ni = Number((notReg.match(/National Insurance £([\d,]+)/)?.[1] ?? "0").replace(/,/g, ""));
  check("set aside = income tax + Class 4, and under the whole year's tax", aside > 0 && Math.abs(aside - (it + ni)) <= 2 && aside < 10812, `${aside} vs ${it} + ${ni}`);
}
check("no VAT line", !notReg.includes("VAT to pay"));
const reg = await run(true, "vat");
check("VAT registered: net costs, VAT line", reg.includes("£24,500.00") && reg.includes("VAT to pay HMRC so far") && reg.includes("£4,900.00"), reg);
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
