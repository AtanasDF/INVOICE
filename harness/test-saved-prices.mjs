// The things you charge for, learned from what you have already invoiced,
// so a price list is never typed out. The form used to suggest lines used
// before FOR THIS CUSTOMER, which only helps on the second invoice to the
// same person -- and that is not where the time goes. The first invoice to
// a new customer is usually for the same work as the last one to somebody
// else.
import { savedPrices, pricesFor } from "./gen/lib/savedPrices.js";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const J = (x) => JSON.stringify(x);

const inv = (o) => ({ id: o.id, clientId: o.clientId ?? "c1", date: o.date, number: o.id, items: o.items, notes: "", dueDate: null, paymentTerms: "", status: o.status ?? "sent", tags: [], vatRegistered: true, cisRate: null });
const line = (description, unitPrice, quantity = 1, vatRate = "standard") => ({ description, unitPrice, quantity, vatRate });

const invoices = [
  inv({ id: "1", date: "2026-01-10", items: [line("Skim a ceiling", 180), line("Plasterboard", 12, 20)] }),
  inv({ id: "2", date: "2026-03-10", clientId: "c2", items: [line("Skim a ceiling", 200)] }),
  inv({ id: "3", date: "2026-05-10", clientId: "c3", items: [line("skim a ceiling  ", 220), line("Day rate", 250)] }),
  inv({ id: "4", date: "2026-06-10", clientId: "c4", items: [line("Day rate", 260)] }),
  inv({ id: "D", date: "2026-07-10", status: "draft", items: [line("Never sent", 999)] }),
  inv({ id: "5", date: "2026-02-10", items: [line("Less deposit (invoice INV-1)", 300, -1), line("", 50), line("Free advice", 0)] }),
];

let p = savedPrices(invoices);
check("the same job written two ways is one job", p.filter((x) => /skim a ceiling/i.test(x.description)).length === 1, J(p.map((x) => x.description)));
check("and it counts every time it was charged", p.find((x) => /skim/i.test(x.description)).timesUsed === 3, J(p.find((x) => /skim/i.test(x.description))));
check("the price offered is the one last charged, not the first",
  p.find((x) => /skim/i.test(x.description)).unitPrice === 220, J(p.find((x) => /skim/i.test(x.description))));
check("what you charge for most often comes first", p[0].description === "Skim a ceiling", J(p.map((x) => x.description)));
// Two invoices say "Skim a ceiling" and one says "skim a ceiling  ". The
// price follows the latest; the WORDING follows the majority, or a line
// typed once in a hurry would be printed on a customer's invoice for ever.
check("the spelling you use most is the one offered", p.find((x) => /skim/i.test(x.description)).description === "Skim a ceiling", J(p.map((x) => x.description)));
check("a draft was never sent, so its prices are not prices", !p.some((x) => x.description === "Never sent"), J(p.map((x) => x.description)));
check("a deposit taken off is not something to bill again", !p.some((x) => /Less deposit/.test(x.description)), J(p.map((x) => x.description)));
check("a blank line is not a thing you charge for", !p.some((x) => !x.description.trim()), J(p.map((x) => x.description)));
check("and neither is something given away free", !p.some((x) => x.description === "Free advice"), J(p.map((x) => x.description)));

// Quotes count too: a price you quoted is a price you charge.
const quotes = [{ id: "q1", clientId: "c9", number: "Q-1", date: "2026-08-01", validUntil: null, items: [line("Render a wall", 900)], notes: "", status: "sent", invoiceId: null, deposit: null, depositInvoiceId: null, depositClaimed: false, vatRegistered: true }];
p = savedPrices(invoices, quotes);
check("a price you quoted counts as a price you charge", p.some((x) => x.description === "Render a wall"), J(p.map((x) => x.description)));

// This customer's own prices come first, then everything else, once.
const mine = [{ description: "Skim a ceiling", unitPrice: 180, vatRate: "standard", timesUsed: 1, lastUsed: "2026-01-10" }];
const both = pricesFor(savedPrices(invoices), mine);
check("this customer's own price is offered first", both[0].description === "Skim a ceiling" && both[0].unitPrice === 180, J(both.slice(0, 2)));
check("and nothing is offered twice", new Set(both.map((x) => x.description.toLowerCase())).size === both.length, J(both.map((x) => x.description)));

// ── On the form ──
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const OLD = newId(), NEW = newId();
db.tables.clients.push({ id: OLD, user_id: "x", name: "Acme Kitchens Ltd", email: "", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.clients.push({ id: NEW, user_id: "x", name: "Bell Builders", email: "", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.invoices.push({ id: newId(), user_id: "x", client_id: OLD, date: day(-30), number: "INV-000001", items: [{ description: "Skim a ceiling", quantity: 1, unitPrice: 220, vatRate: "standard" }], notes: "", due_date: day(-10), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-saved-prices" });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!document.querySelector('input[role="combobox"]'), { timeout: 20000 });
  await sleep(1200);
  const before = await bodyText(page);
  check("what you charge for is offered before any customer is picked",
    /What you charge for/.test(before) && /Skim a ceiling/.test(before), before.replace(/\s+/g, " ").slice(0, 400));
  check("with the price beside it", /Skim a ceiling \(£220\.00\)/.test(before), before.replace(/\s+/g, " ").match(/.{0,60}Skim a ceiling.{0,30}/)?.[0] ?? "");

  // Tapping one adds the line, priced.
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Skim a ceiling/.test(b.textContent))?.click());
  await sleep(700);
  const added = await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value));
  check("tapping one adds it as a line, at that price", added.includes("Skim a ceiling") && added.includes("220"), J(added.filter(Boolean).slice(0, 8)));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
