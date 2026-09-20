// One invoice, seven places it is shown: the list, the dashboard, its own
// page, the customer's card on Clients, the CSV export, the statement and
// the VAT figures. They have to
// agree to the penny, or one of them is lying to him or to his customer.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, clickText, newId, day, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 60, address: "2 Trade Park\nBristol", bank_details: "Sort 12-34-56", custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "1 Mill Lane\nBristol\nBS1 4DJ", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });

// Mixed VAT rates, an awkward quantity, CIS on the labour, a credit note and
// a part payment -- every rule in the app at once, on one invoice.
const INV = { id: newId(), user_id: "x", client_id: C, date: day(-20), number: "INV-60", items: [
  { description: "Labour, plastering", quantity: 12.5, unitPrice: 38.4, vatRate: "standard", kind: "labour" },
  { description: "Materials, bonding and skim", quantity: 3, unitPrice: 64.95, vatRate: "standard", kind: "materials" },
  { description: "Insulation board (reduced rate)", quantity: 7, unitPrice: 22.15, vatRate: "reduced", kind: "materials" },
], notes: "", due_date: day(-5), payment_terms: "14 days", status: "partial", tags: [], vat_registered: true, cis_rate: 20 };
db.tables.invoices.push(INV);
db.tables.credit_notes.push({ id: newId(), user_id: "x", invoice_id: INV.id, date: day(-10), amount: 45.6, reason: "Short delivery" });
db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: INV.id, date: day(-3), amount: 300, method: "bank", note: "" });

const moneyIn = (text, label, after = 0) => {
  const at = text.indexOf(label, after);
  if (at < 0) return null;
  const m = text.slice(at, at + 160).match(/[−-]?£[\d,]+\.\d{2}/);
  return m ? m[0] : null;
};
// Some lines read "£300.00 paid, £531.02 still owed" -- the figure comes
// before the words, so read back from the label instead.
const moneyBefore = (text, label) => {
  const at = text.indexOf(label);
  if (at < 0) return null;
  const all = [...text.slice(Math.max(0, at - 60), at).matchAll(/[−-]?£[\d,]+\.\d{2}/g)];
  return all.length ? all[all.length - 1][0] : null;
};
const num = (s) => (s ? Number(s.replace(/[−£,]/g, "")) * (s.startsWith("−") ? -1 : 1) : null);

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-onetotal" });
try {
  await signIn(page, BASE);

  // The invoice's own page is the reference: it is what the customer is sent.
  await page.goto(`${BASE}/invoices/${INV.id}`, { waitUntil: "networkidle0" });
  await sleep(1400);
  const own = await bodyText(page);
  const due = num(moneyIn(own, "Amount due")) ?? num(moneyIn(own, "Still owed"));
  const total = num(moneyIn(own, "Total"));
  check("the invoice page states an amount due", due !== null && due > 0, own.replace(/\s+/g, " ").slice(0, 400));
  check("the invoice page states a total", total !== null && total > 0, String(total));
  check("CIS is shown, since the rate is set", /CIS/.test(own), own.replace(/\s+/g, " ").slice(0, 300));

  // The list.
  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await sleep(1400);
  const list = await bodyText(page);
  const owedOnList = num(moneyBefore(list, "still owed"));
  check("the list's 'still owed' matches the invoice page", owedOnList !== null && Math.abs(owedOnList - due) < 0.005, `list ${owedOnList} vs invoice ${due}`);

  // The dashboard's owed figure.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1600);
  const dash = await bodyText(page);
  const owedOnDash = num(moneyIn(dash, "INV-60"));
  check("the dashboard's owed matches the invoice page", owedOnDash !== null && Math.abs(owedOnDash - due) < 0.005, `dashboard ${owedOnDash} vs invoice ${due}`);

  // The statement the customer can be sent.
  await page.goto(`${BASE}/clients/${C}/statement`, { waitUntil: "networkidle0" });
  await sleep(1600);
  const statement = await bodyText(page);
  const owing = num(moneyIn(statement, "Total owing"));
  check("the statement's total owing matches", owing !== null && Math.abs(owing - due) < 0.005, `statement ${owing} vs invoice ${due}`);

  // The customer's own card on the Clients page, under "Payment history".
  // It used to print the raw line-item subtotal -- no VAT, no CIS, no
  // credit note -- so the one figure sitting under the customer's name,
  // beside a status badge, disagreed with the document they were sent.
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle0" });
  await sleep(1600);
  await clickText(page, "Payment history");
  await sleep(900);
  const card = await bodyText(page);
  const onCard = num(moneyIn(card, "INV-60"));
  check("the customer's own card shows what the invoice charged", onCard !== null && Math.abs(onCard - 835.52) < 0.005, `clients page ${onCard}, should be 835.52`);
  check("...not the line items added up with no VAT and no CIS", onCard === null || Math.abs(onCard - 829.9) > 0.005, String(onCard));

  // VAT: the sale belongs to the quarter it was dated in, at its own rates.
  await page.goto(`${BASE}/vat`, { waitUntil: "networkidle0" });
  await sleep(1400);
  const beforeQuarter = await bodyText(page);
  check("the VAT page works out box 1", /Box 1/.test(beforeQuarter), beforeQuarter.replace(/\s+/g, " ").slice(0, 200));

  // Worked out by hand from the three lines above:
  //   labour      12.5 x 38.40 = 480.00   (standard 20%)
  //   materials    3   x 64.95 = 194.85   (standard 20%)
  //   insulation   7   x 22.15 = 155.05   (reduced   5%)
  //   net 829.90; VAT (674.85 x 20%) + (155.05 x 5%) = 134.97 + 7.75 = 142.72
  //   total 972.62
  // The £45.60 credit comes off the labour first, so the CIS kept back is
  // 20% of what's left of it, not of the original: the page says
  // "20% of £457.50 labour after credit" = £91.50.
  //   still owed 972.62 - 91.50 - 45.60 - 300.00 = 535.52
  const net = num(moneyIn(own, "Subtotal"));
  check("the subtotal is the three lines added up", net !== null && Math.abs(net - 829.9) < 0.005, String(net));
  check("the total is the subtotal plus mixed-rate VAT", total !== null && Math.abs(total - 972.62) < 0.005, String(total));
  check("VAT is charged per rate, not one rate on everything", Math.abs((total ?? 0) - (net ?? 0) - 142.72) < 0.005, String(Math.round(((total ?? 0) - (net ?? 0)) * 100) / 100));
  check("CIS is a fifth of the labour left after the credit", own.includes("£91.50") && /after credit/.test(own), own.replace(/\s+/g, " ").slice(own.indexOf("CIS") - 10, own.indexOf("CIS") + 120));
  check("what's still owed is the total less CIS, the credit and the payment", due !== null && Math.abs(due - 535.52) < 0.005, `shown ${due}, should be 535.52`);
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
