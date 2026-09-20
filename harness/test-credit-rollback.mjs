// Removing a credit note, when the removal fails.
//
// The row was taken off the screen first and the database asked afterwards.
// If the delete failed, the screen kept showing the invoice WITHOUT the
// credit note -- and that same array feeds the printed invoice, the PDF and
// the emailed copy. So a failed removal quietly turned into a demand to the
// customer for money that had been credited back to them, with nothing
// saying so, until someone happened to reload a page they had no reason to
// reload.
//
// It also asks first, naming the amount, because this one can't be undone.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, UID, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 5, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: UID, name: "Acme Kitchens Ltd", email: "acme@example.com", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const INV = { id: newId(), user_id: UID, client_id: C, date: day(-10), number: "INV-4", items: [{ description: "Kitchen fit", quantity: 1, unitPrice: 2000, vatRate: "standard" }], notes: "", due_date: day(4), payment_terms: "14 days", status: "sent", tags: [], vat_registered: false, cis_rate: null };
db.tables.invoices.push(INV);
const CN = { id: newId(), user_id: UID, invoice_id: INV.id, date: day(-2), amount: 500, reason: "Tiles not supplied" };
db.tables.credit_notes.push(CN);
// The mock refuses every DELETE unless a suite opts in, so a test can't
// take a row out by accident. This one is about removing a credit note.
db.allowDelete = ["credit_notes"];

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-credit-rollback" });

// Say yes to the confirm, and remember what it asked.
let asked = null;
await page.evaluateOnNewDocument(() => {
  window.__confirms = [];
  window.confirm = (m) => { window.__confirms.push(m); return true; };
});
const confirms = () => page.evaluate(() => window.__confirms ?? []);
const removeButtons = () => page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => /^Remove$/i.test(b.textContent.trim())).length);

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/${INV.id}`, { waitUntil: "networkidle0" });
  await sleep(1800);

  const before = await bodyText(page);
  check("the credit note is on the invoice to begin with", /500\.00/.test(before) && /Tiles not supplied/.test(before), before.replace(/\s+/g, " ").slice(0, 200));
  check("...and £1,500 is what is owed", /£1,500\.00/.test(before), before.replace(/\s+/g, " ").slice(0, 300));

  // Now make the delete fail, and press Remove.
  db.fail = { "DELETE credit_notes": 20 };
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^Remove$/i.test(x.textContent.trim()));
    if (!b) return false;
    b.click();
    return true;
  });
  check("there is a Remove on the credit note", clicked);
  await sleep(2200);

  asked = await confirms();
  check("it asks before removing, and names the amount", asked.some((m) => /£500\.00/.test(m) && /can.t be undone/i.test(m)), JSON.stringify(asked));

  const after = await bodyText(page);
  check("the credit note is still in the database", db.tables.credit_notes.length === 1, JSON.stringify(db.tables.credit_notes.map((c) => c.amount)));
  check("...so it is put back on the screen, not left removed", /Tiles not supplied/.test(after), after.replace(/\s+/g, " ").slice(0, 300));
  check("...and it says the removal didn't happen", /still on the invoice/i.test(after), after.replace(/\s+/g, " ").slice(0, 400));
  check("...so the invoice still says £1,500 owed, not £2,000", /£1,500\.00/.test(after) && !/Amount due[^£]*£2,000\.00/.test(after), after.replace(/\s+/g, " ").slice(0, 400));
  db.fail = {};

  // And when it works, it really goes.
  await page.evaluate(() => { window.__confirms = []; });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^Remove$/i.test(x.textContent.trim()));
    b?.click();
  });
  await sleep(2200);
  check("a removal that works takes the credit note off", db.tables.credit_notes.length === 0, JSON.stringify(db.tables.credit_notes));
  const done = await bodyText(page);
  check("...and the invoice goes back up to £2,000", /£2,000\.00/.test(done), done.replace(/\s+/g, " ").slice(0, 300));
  check("...with no stale error left on screen", !/still on the invoice/i.test(done), done.replace(/\s+/g, " ").slice(0, 300));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
