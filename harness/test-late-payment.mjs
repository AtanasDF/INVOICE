// What the law already entitles him to when a business customer pays late,
// said ON THE INVOICE rather than only in a chasing email five weeks
// afterwards. The right exists either way; saying so is what makes it real
// to whoever is deciding which invoice to pay this week.
//
// Not one of the twelve apps in notes/competitor-research.md puts the fixed
// sums anywhere at all.
import { latePaymentLine, showsLatePaymentTerms, STATUTORY_MARGIN } from "./gen/lib/latePayment.js";
import { lateCompensation } from "./gen/lib/reminderTemplates.js";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// The fixed sums are the Act's, by the size of the debt.
check("under £1,000 the fixed sum is £40", lateCompensation(999.99) === 40, String(lateCompensation(999.99)));
check("£1,000 to just under £10,000 it is £70", lateCompensation(1000) === 70 && lateCompensation(9999.99) === 70, `${lateCompensation(1000)} / ${lateCompensation(9999.99)}`);
check("£10,000 and over it is £100", lateCompensation(10000) === 100 && lateCompensation(250000) === 100, String(lateCompensation(10000)));
check("the rate is 8% above base, which is what the Act says", STATUTORY_MARGIN === 8, String(STATUTORY_MARGIN));

const line = latePaymentLine(1500);
check("the line names the Act, the rate and the fixed sum for THIS invoice",
  /Late Payment of Commercial Debts \(Interest\) Act 1998/.test(line) && /8% a year above the Bank of England base rate/.test(line) && /£70/.test(line), line);
check("and it says 'may charge', not that it already has", /may charge/.test(line) && !/you owe/i.test(line), line);
check("the fixed sum follows the invoice, not a guess", /£40/.test(latePaymentLine(500)) && /£100/.test(latePaymentLine(20000)));

// The Act does not cover a private individual.
check("a private customer is never told any of it", !showsLatePaymentTerms(false, true));
check("nor is anybody, unless he has asked for it", !showsLatePaymentTerms(true, false) && !showsLatePaymentTerms(false, false));
check("a business customer, with the switch on, is", showsLatePaymentTerms(true, true));

// ── On the invoice a customer actually receives ──
const build = (isCompany, optedIn) => {
  const db = makeDb();
  Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
  db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, reminder_late_payment_interest: optedIn, custom_categories: null });
  const C = newId();
  db.tables.clients.push({ id: C, user_id: "x", name: isCompany ? "Acme Kitchens Ltd" : "Mrs Mary O'Neill", email: "a@b.c", address: "", kind: "client", archived: false, is_company: isCompany, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
  const id = newId();
  db.tables.invoices.push({ id, user_id: "x", client_id: C, date: day(-10), number: "INV-000009", items: [{ description: "Work", quantity: 1, unitPrice: 1250, vatRate: "standard" }], notes: "", due_date: day(20), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });
  return { db, id };
};

const open = async (page, base, id) => {
  await page.goto(`${base}/invoices/${id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("INV-000009"), { timeout: 20000 });
  await sleep(600);
  return bodyText(page);
};

{
  const { db, id } = build(true, true);
  const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-late-on" });
  try {
    await signIn(page, BASE);
    const t = await open(page, BASE, id);
    // 1250 + 20% = 1500, so the £1,000-£9,999 band: £70.
    check("a business customer's invoice carries the terms, with the right fixed sum",
      /Late Payment of Commercial Debts/.test(t) && /£70/.test(t), t.replace(/\s+/g, " ").slice(-320));
    check("and it is small print at the foot, not shouted", await page.evaluate(() => {
      const el = [...document.querySelectorAll("p")].find((x) => /Late Payment of Commercial Debts/.test(x.textContent));
      return !!el && parseFloat(getComputedStyle(el).fontSize) <= 14;
    }), "not small print");
  } catch (e) { console.log("ERROR", e.message); }
  finally { await browser.close(); }
}
{
  const { db, id } = build(false, true);
  const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-late-private" });
  try {
    await signIn(page, BASE);
    const t = await open(page, BASE, id);
    check("a private customer's invoice says nothing about it, switch on or not",
      !/Late Payment of Commercial Debts/.test(t), t.replace(/\s+/g, " ").slice(-200));
  } catch (e) { console.log("ERROR", e.message); }
  finally { await browser.close(); }
}
{
  const { db, id } = build(true, false);
  const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-late-off" });
  try {
    await signIn(page, BASE);
    const t = await open(page, BASE, id);
    check("and nothing appears on anybody's invoice until he turns it on",
      !/Late Payment of Commercial Debts/.test(t), t.replace(/\s+/g, " ").slice(-200));
  } catch (e) { console.log("ERROR", e.message); }
  finally { await browser.close(); }
}

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
